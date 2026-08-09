"""Daily scoring job — Section 6.3, steps 3 and 4.

Scores every site for today, projects the incident trend, and posts both back to the
investigations API. Nothing is written to the database directly; the API owns the schema
and the audit trail.
"""

from __future__ import annotations

import argparse
import json
import logging
import pickle
from pathlib import Path

import httpx
import pandas as pd

from gsih_analytics.config import Settings, get_settings
from gsih_analytics.features.build import build_scoring_frame
from gsih_analytics.models import forecast as forecast_model
from gsih_analytics.models import vandalism
from gsih_analytics.train import MODEL_FILENAME
from gsih_analytics.warehouse import engine_for, load_sources

log = logging.getLogger(__name__)

# Enough history for the 365-day lookback features plus a margin for the trend fit.
SCORING_LOOKBACK_DAYS = 420

POST_TIMEOUT_SECONDS = 60.0


def run(settings: Settings, model_dir: Path, dry_run: bool = False) -> dict:
    with (model_dir / MODEL_FILENAME).open("rb") as handle:
        bundle = pickle.load(handle)

    engine = engine_for(settings.db_url)
    as_of = pd.Timestamp.now(tz="UTC").normalize()
    sources = load_sources(engine, since=as_of - pd.Timedelta(days=SCORING_LOOKBACK_DAYS))

    features = build_scoring_frame(sources, as_of)
    scored = vandalism.score_sites(bundle["estimator"], features, bundle["importance"])

    score_batch = {
        "modelVersion": settings.model_name,
        "scores": [
            {
                "siteCode": row.site_code,
                "scoreDate": as_of.date().isoformat(),
                "riskScore": round(float(row.risk_score), 4),
                "peakWindow": row.peak_window,
                "topFactors": row.top_factors,
            }
            for row in scored.itertuples()
        ],
    }

    forecast_batch = _build_forecast_batch(settings, sources, as_of)

    if dry_run:
        log.info("dry run: %d scores, %d forecast points computed, nothing posted",
                 len(score_batch["scores"]), len(forecast_batch["points"]))
        return {"scores": len(score_batch["scores"]), "forecast_points": len(forecast_batch["points"])}

    posted_scores = _post(settings, "/api/v1/risk/scores", score_batch)
    posted_forecast = _post(settings, "/api/v1/risk/forecasts", forecast_batch)
    return {"scores": posted_scores, "forecast": posted_forecast}


def _build_forecast_batch(settings: Settings, sources, as_of: pd.Timestamp) -> dict:
    """Enterprise-wide curve plus one curve per region."""
    start = as_of - pd.Timedelta(days=SCORING_LOOKBACK_DAYS)
    points: list[dict] = []

    scopes: list[str | None] = [None, *sorted(sources.sites["region"].dropna().unique().tolist())]
    for region in scopes:
        history = forecast_model.daily_counts(sources.incidents, start, as_of, region=region)
        try:
            projected = forecast_model.forecast(history)
        except ValueError as exc:
            # A region that has just come online has no trend to fit. Skipping it leaves
            # the other regions' curves intact instead of failing the whole run.
            log.warning("skipping forecast for %s: %s", region or "enterprise", exc)
            continue

        points.extend(
            {
                "siteCode": None,
                "region": region,
                "horizonDays": point.horizon_days,
                "forecastDate": point.forecast_date.date().isoformat(),
                "predictedIncidents": round(point.predicted, 4),
                "lowerBound": round(point.lower, 4),
                "upperBound": round(point.upper, 4),
            }
            for point in projected
        )

    return {"modelVersion": settings.model_name, "points": points}


def _post(settings: Settings, path: str, payload: dict) -> dict:
    if not payload.get("scores") and not payload.get("points"):
        log.warning("nothing to post to %s", path)
        return {"written": 0}

    headers = {"Content-Type": "application/json"}
    if settings.api_token:
        headers["Authorization"] = f"Bearer {settings.api_token}"

    response = httpx.post(
        f"{settings.api_base_url}{path}",
        json=payload,
        headers=headers,
        timeout=POST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    result = response.json()
    log.info("posted to %s: %s", path, result)
    return result


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Score every site and post the results")
    parser.add_argument("--model-dir", default="/models", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(json.dumps(run(get_settings(), args.model_dir, args.dry_run), indent=2, default=str))


if __name__ == "__main__":
    main()
