"""On-demand scoring API.

The scheduled job in :mod:`gsih_analytics.scoring` covers the daily cycle. This service
exists for the cases a schedule cannot serve: an analyst asking "what does the model say
about this site right now, and why", and the platform team checking which model version
is actually loaded.
"""

from __future__ import annotations

import logging
import math
import pickle
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from gsih_analytics.config import Settings, get_settings
from gsih_analytics.features.build import FEATURE_COLUMNS, build_scoring_frame
from gsih_analytics.models import hotspots as hotspot_model
from gsih_analytics.models import vandalism
from gsih_analytics.train import MODEL_FILENAME, METADATA_FILENAME
from gsih_analytics.warehouse import engine_for, load_sources

log = logging.getLogger(__name__)

app = FastAPI(
    title="GSIH Analytics",
    version="1.0.0",
    description="Vandalism risk scoring and geospatial hotspot detection (Section 6)",
)

SCORING_LOOKBACK_DAYS = 420

_model_cache: dict[str, Any] = {}


class SiteScore(BaseModel):
    site_code: str
    region: str | None
    risk_score: float = Field(description="Probability of a vandalism incident in the next 7 days")
    risk_band: str
    peak_window: str
    top_factors: dict[str, float]


class HotspotOut(BaseModel):
    cluster_id: int
    incident_count: int
    centroid_lat: float
    centroid_lon: float
    radius_km: float
    site_codes: list[str]
    regions: list[str]


def _load_model(model_dir: Path) -> dict[str, Any]:
    key = str(model_dir)
    if key not in _model_cache:
        path = model_dir / MODEL_FILENAME
        if not path.exists():
            raise HTTPException(
                status_code=503,
                detail="no trained model available yet — run the training job first",
            )
        with path.open("rb") as handle:
            _model_cache[key] = pickle.load(handle)
    return _model_cache[key]


#: Shares of a scoring run banded HIGH, and HIGH-or-MEDIUM. Mirrors `Enums.RiskBand` in
#: the Java services — a site's band is its rank within the run, not an absolute
#: probability, because vandalism is rare enough that a calibrated model would otherwise
#: report every site as LOW.
HIGH_BAND_SHARE = 0.10
MEDIUM_BAND_SHARE = 0.35


def _band(rank: int, total: int) -> str:
    if total <= 0:
        return "LOW"
    # Counts rather than raw percentiles, with a floor of one HIGH site — same rule as
    # Enums.RiskBand.fromRank, so both services band a run identically.
    high_cutoff = max(1, math.ceil(total * HIGH_BAND_SHARE))
    medium_cutoff = max(high_cutoff, math.ceil(total * MEDIUM_BAND_SHARE))
    if rank < high_cutoff:
        return "HIGH"
    if rank < medium_cutoff:
        return "MEDIUM"
    return "LOW"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP"}


@app.get("/model")
def model_info(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """What is actually loaded, including the metrics it was promoted on."""
    metadata_path = Path("/models") / METADATA_FILENAME
    if not metadata_path.exists():
        return {"model_version": settings.model_version, "status": "not trained"}
    import json

    return json.loads(metadata_path.read_text())


@app.get("/score", response_model=list[SiteScore])
def score(
    region: str | None = None,
    limit: int = 50,
    model_dir: str = "/models",
    settings: Settings = Depends(get_settings),
) -> list[SiteScore]:
    bundle = _load_model(Path(model_dir))
    engine = engine_for(settings.db_url)
    as_of = pd.Timestamp.now(tz="UTC").normalize()

    sources = load_sources(engine, since=as_of - pd.Timedelta(days=SCORING_LOOKBACK_DAYS))
    features = build_scoring_frame(sources, as_of)
    if region:
        features = features[features["region"] == region]
    if features.empty:
        return []

    scored = vandalism.score_sites(bundle["estimator"], features, bundle["importance"])
    # Bands come from the full scored population, then the response is truncated — banding
    # after the cut would make the worst `limit` sites look like the whole enterprise.
    total = len(scored)
    return [
        SiteScore(
            site_code=row.site_code,
            region=row.region,
            risk_score=round(float(row.risk_score), 4),
            risk_band=_band(rank, total),
            peak_window=row.peak_window,
            top_factors=row.top_factors,
        )
        for rank, row in enumerate(scored.head(limit).itertuples())
    ]


@app.get("/hotspots", response_model=list[HotspotOut])
def hotspots(
    lookback_days: int = 180,
    radius_km: float = hotspot_model.DEFAULT_RADIUS_KM,
    settings: Settings = Depends(get_settings),
) -> list[HotspotOut]:
    engine = engine_for(settings.db_url)
    since = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=lookback_days)
    sources = load_sources(engine, since=since)

    vandalism_incidents = sources.incidents[sources.incidents["incident_type"] == "VANDALISM"]
    clusters = hotspot_model.find_hotspots(vandalism_incidents, radius_km=radius_km)
    return [HotspotOut(**cluster.__dict__) for cluster in clusters]


@app.get("/features")
def feature_contract() -> dict[str, Any]:
    """The feature list, published so the pipeline and the model cannot drift apart."""
    return {"features": FEATURE_COLUMNS, "count": len(FEATURE_COLUMNS)}
