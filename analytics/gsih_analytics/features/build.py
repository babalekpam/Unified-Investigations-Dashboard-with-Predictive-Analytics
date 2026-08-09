"""Feature engineering for the vandalism risk model (Section 6.2).

The proposal lists six families of inputs: historical incidents, location/facility data,
temporal data, access and badge logs, video and alarm events, and external factors. Each
one becomes a column here.

The single most important rule in this module is that every feature for a given
``(site, as_of_date)`` row is computed from data **strictly before** that date. A
feature that peeks at the label window would produce a model that scores beautifully in
validation and is useless in production, because on the morning it actually runs, the
future it accidentally learned from does not exist yet.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# Windows the security operations team recognises: a month, a quarter, a year.
LOOKBACK_WINDOWS_DAYS = (30, 90, 365)

# How far ahead the label looks. "Did vandalism occur at this site in the next 7 days?"
LABEL_HORIZON_DAYS = 7

FEATURE_COLUMNS = [
    "prior_vandalism_30d",
    "prior_vandalism_90d",
    "prior_vandalism_365d",
    "prior_any_incident_90d",
    "days_since_last_vandalism",
    "after_hours_access_7d",
    "tailgate_events_30d",
    "denied_access_30d",
    "alarm_events_7d",
    "camera_tamper_30d",
    "low_lighting",
    "low_foot_traffic",
    "camera_density",
    "perimeter_open",
    "critical_asset",
    "is_weekend",
    "is_night_prone_month",
    "regional_vandalism_rate_90d",
]

# Shown to users instead of the raw column name.
FEATURE_LABELS = {
    "prior_vandalism_30d": "Vandalism in the last 30 days",
    "prior_vandalism_90d": "Vandalism in the last 90 days",
    "prior_vandalism_365d": "Vandalism in the last year",
    "prior_any_incident_90d": "Any incident in the last 90 days",
    "days_since_last_vandalism": "Time since the last vandalism",
    "after_hours_access_7d": "After-hours badge activity",
    "tailgate_events_30d": "Tailgating detections",
    "denied_access_30d": "Denied badge reads",
    "alarm_events_7d": "Recent alarm activity",
    "camera_tamper_30d": "Camera tamper alarms",
    "low_lighting": "Poor site lighting",
    "low_foot_traffic": "Low foot traffic",
    "camera_density": "Camera coverage",
    "perimeter_open": "Unfenced perimeter",
    "critical_asset": "Critical asset on site",
    "is_weekend": "Weekend",
    "is_night_prone_month": "Season",
    "regional_vandalism_rate_90d": "Regional vandalism rate",
}

# A site with no vandalism on record needs a finite stand-in for "days since the last
# one". Two years is well beyond any window the model looks at, so it reads as "never"
# without introducing a NaN the tree has to special-case.
NEVER_OCCURRED_DAYS = 730.0


@dataclass(frozen=True)
class SourceFrames:
    """The warehouse tables the feature builder reads (all already canonical)."""

    sites: pd.DataFrame
    incidents: pd.DataFrame
    access_events: pd.DataFrame
    alarm_events: pd.DataFrame


def build_training_frame(
    sources: SourceFrames,
    start: pd.Timestamp,
    end: pd.Timestamp,
    frequency: str = "D",
) -> pd.DataFrame:
    """Builds one row per site per day between ``start`` and ``end``, with its label.

    The label is forward-looking, so the last ``LABEL_HORIZON_DAYS`` of the range are
    dropped: their outcome has not happened yet and a row labelled 0 for that reason
    would teach the model that quiet periods follow high-risk conditions.
    """
    as_of_dates = pd.date_range(start=start, end=end, freq=frequency, tz="UTC")
    if len(as_of_dates) == 0:
        return pd.DataFrame(columns=[*FEATURE_COLUMNS, "site_code", "as_of_date", "label"])

    frames = [_features_for_date(sources, as_of) for as_of in as_of_dates]
    frame = pd.concat(frames, ignore_index=True)
    frame["label"] = _labels(sources.incidents, frame)

    cutoff = as_of_dates[-1] - pd.Timedelta(days=LABEL_HORIZON_DAYS)
    return frame[frame["as_of_date"] <= cutoff].reset_index(drop=True)


def build_scoring_frame(sources: SourceFrames, as_of: pd.Timestamp) -> pd.DataFrame:
    """Features for every site as of one date — what the daily scoring job uses."""
    return _features_for_date(sources, as_of)


def _features_for_date(sources: SourceFrames, as_of: pd.Timestamp) -> pd.DataFrame:
    sites = sources.sites
    incidents = _before(sources.incidents, "occurred_at", as_of)
    access = _before(sources.access_events, "event_time", as_of)
    alarms = _before(sources.alarm_events, "event_time", as_of)

    vandalism = incidents[incidents["incident_type"] == "VANDALISM"]

    rows = pd.DataFrame({"site_code": sites["site_code"].to_numpy()})
    rows["as_of_date"] = as_of
    rows["region"] = sites["region"].to_numpy()

    for window in LOOKBACK_WINDOWS_DAYS:
        rows[f"prior_vandalism_{window}d"] = _count_in_window(
            vandalism, "occurred_at", as_of, window, sites["site_code"]
        )

    rows["prior_any_incident_90d"] = _count_in_window(
        incidents, "occurred_at", as_of, 90, sites["site_code"]
    )
    rows["days_since_last_vandalism"] = _days_since_last(vandalism, as_of, sites["site_code"])

    after_hours = access[access["after_hours"]] if len(access) else access
    rows["after_hours_access_7d"] = _count_in_window(
        after_hours, "event_time", as_of, 7, sites["site_code"]
    )
    tailgates = access[access["tailgate"]] if len(access) else access
    rows["tailgate_events_30d"] = _count_in_window(
        tailgates, "event_time", as_of, 30, sites["site_code"]
    )
    denied = access[access["result"] == "DENIED"] if len(access) else access
    rows["denied_access_30d"] = _count_in_window(
        denied, "event_time", as_of, 30, sites["site_code"]
    )

    rows["alarm_events_7d"] = _count_in_window(alarms, "event_time", as_of, 7, sites["site_code"])
    tamper = alarms[alarms["alarm_type"] == "CAMERA_TAMPER"] if len(alarms) else alarms
    rows["camera_tamper_30d"] = _count_in_window(
        tamper, "event_time", as_of, 30, sites["site_code"]
    )

    # Facility attributes are expressed so that a larger number always means more risk.
    rows["low_lighting"] = (5 - sites["lighting_score"].fillna(3)).to_numpy()
    rows["low_foot_traffic"] = (5 - sites["foot_traffic_score"].fillna(3)).to_numpy()
    rows["camera_density"] = sites["camera_count"].fillna(0).to_numpy()
    rows["perimeter_open"] = (~sites["perimeter_fenced"].fillna(False)).astype(int).to_numpy()
    rows["critical_asset"] = sites["critical_asset"].fillna(False).astype(int).to_numpy()

    rows["is_weekend"] = int(as_of.dayofweek >= 5)
    # Long nights: vandalism reports concentrate in the darker months in the incident
    # history, so the month is encoded as a coarse light-availability flag rather than
    # twelve dummies the model would overfit on a single year of data.
    rows["is_night_prone_month"] = int(as_of.month in (11, 12, 1, 2))

    rows["regional_vandalism_rate_90d"] = _regional_rate(rows, vandalism, sites, as_of)

    return rows


def _before(frame: pd.DataFrame, time_column: str, as_of: pd.Timestamp) -> pd.DataFrame:
    """Everything that had already happened at ``as_of``. The leakage guard."""
    if frame.empty:
        return frame
    return frame[frame[time_column] < as_of]


def _count_in_window(
    frame: pd.DataFrame,
    time_column: str,
    as_of: pd.Timestamp,
    window_days: int,
    site_codes: pd.Series,
) -> np.ndarray:
    if frame.empty:
        return np.zeros(len(site_codes), dtype=float)
    window_start = as_of - pd.Timedelta(days=window_days)
    recent = frame[frame[time_column] >= window_start]
    counts = recent.groupby("site_code").size()
    return site_codes.map(counts).fillna(0).astype(float).to_numpy()


def _days_since_last(
    frame: pd.DataFrame, as_of: pd.Timestamp, site_codes: pd.Series
) -> np.ndarray:
    if frame.empty:
        return np.full(len(site_codes), NEVER_OCCURRED_DAYS)
    last = frame.groupby("site_code")["occurred_at"].max()
    deltas = site_codes.map(last)
    days = (as_of - pd.to_datetime(deltas, utc=True)).dt.total_seconds() / 86400.0
    return days.fillna(NEVER_OCCURRED_DAYS).clip(upper=NEVER_OCCURRED_DAYS).to_numpy()


def _regional_rate(
    rows: pd.DataFrame, vandalism: pd.DataFrame, sites: pd.DataFrame, as_of: pd.Timestamp
) -> np.ndarray:
    """Incidents per site in the region over 90 days — the "area crime" proxy of 6.2."""
    if vandalism.empty:
        return np.zeros(len(rows))
    window_start = as_of - pd.Timedelta(days=90)
    recent = vandalism[vandalism["occurred_at"] >= window_start]
    site_region = sites.set_index("site_code")["region"]
    counts = recent["site_code"].map(site_region).value_counts()
    sites_per_region = sites["region"].value_counts()
    rate = (counts / sites_per_region).fillna(0.0)
    return rows["region"].map(rate).fillna(0.0).to_numpy()


def _labels(incidents: pd.DataFrame, frame: pd.DataFrame) -> np.ndarray:
    """1 when vandalism occurs at the site within the label horizon after ``as_of``."""
    vandalism = incidents[incidents["incident_type"] == "VANDALISM"]
    if vandalism.empty:
        return np.zeros(len(frame), dtype=int)

    # Comparisons run on UTC-naive datetime64[ns] arrays with an explicit unit. Two traps
    # otherwise: a timezone-aware column comes out of pandas as an object array, and the
    # integer epoch representation is microseconds in pandas 3 but nanoseconds in pandas
    # 2 — mixing the two silently labels everything negative.
    by_site: dict[str, np.ndarray] = {
        site: _as_utc_naive(group["occurred_at"])
        for site, group in vandalism.groupby("site_code")
    }

    labels = np.zeros(len(frame), dtype=int)
    horizon = np.timedelta64(LABEL_HORIZON_DAYS, "D").astype("timedelta64[ns]")
    for i, (site, as_of) in enumerate(zip(frame["site_code"], frame["as_of_date"], strict=True)):
        times = by_site.get(site)
        if times is None:
            continue
        start = pd.Timestamp(as_of).tz_convert("UTC").tz_localize(None).to_datetime64()
        start = start.astype("datetime64[ns]")
        labels[i] = int(((times >= start) & (times < start + horizon)).any())
    return labels


def _as_utc_naive(series: pd.Series) -> np.ndarray:
    return (
        pd.to_datetime(series, utc=True)
        .dt.tz_localize(None)
        .to_numpy(dtype="datetime64[ns]")
    )
