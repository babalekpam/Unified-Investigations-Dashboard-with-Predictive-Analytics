"""Incident trend projection — the 30 / 60 / 90-day outlook of Section 6.5.

A single least-squares fit on log-scale daily counts with three components:

* a **damped linear trend**, so a 90-day projection cannot run away on the slope of the
  last few weeks;
* an **annual cycle** (two Fourier harmonics of day-of-year), because vandalism in the
  incident history rises through the dark months and falls through the summer — Section
  6.2 lists season as a driver, and a model without it reads every summer as the start of
  a permanent decline;
* a **day-of-week profile**, since weekend nights behave differently from weekdays.

Prediction intervals come from the empirical spread of the residuals rather than a
normal assumption, which count data does not satisfy.

Why not Prophet or ARIMA, which the proposal names? Either can be dropped in behind
:func:`forecast` — the return shape is the contract, not the implementation. This version
was chosen for the pilot because it is deterministic, inspectable by the analysts who have
to defend the number in a review, and adds no dependency to the scoring image. Section 8's
Phase 3 is where a like-for-like comparison against Prophet belongs, once there is enough
history to judge it on.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# Fewer days than this and a trend line is fitting noise.
MIN_HISTORY_DAYS = 28

# Annual harmonics are only fitted with at least this much history. Below a full year the
# fit cannot separate "winter is worse" from "this year is worse" and would invent a
# seasonal cycle out of a trend.
MIN_HISTORY_FOR_ANNUAL_DAYS = 365

DEFAULT_HORIZONS = (30, 60, 90)

# Damping on the trend term. Each future day contributes phi^h of the fitted slope, so the
# cumulative trend converges instead of extrapolating linearly forever. 0.98 leaves the
# trend essentially intact across a 30-day horizon and visibly damped by day 90.
TREND_DAMPING = 0.98

DAYS_PER_YEAR = 365.25


@dataclass(frozen=True)
class ForecastPoint:
    forecast_date: pd.Timestamp
    predicted: float
    lower: float
    upper: float
    horizon_days: int


def daily_counts(
    incidents: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp, region: str | None = None
) -> pd.Series:
    """Vandalism counts per day, with quiet days present as explicit zeros.

    Reindexing matters: a series that simply omits incident-free days would make the
    trend line fit only the busy days and read every quiet stretch as missing data.
    """
    frame = incidents[incidents["incident_type"] == "VANDALISM"]
    if region is not None:
        frame = frame[frame["region"] == region]

    index = pd.date_range(start=start, end=end, freq="D", tz="UTC")
    if frame.empty:
        return pd.Series(np.zeros(len(index)), index=index, name="incidents")

    counts = (
        frame.set_index("occurred_at")
        .sort_index()
        .loc[start:end]
        .resample("D")
        .size()
        .reindex(index, fill_value=0)
    )
    counts.name = "incidents"
    return counts


def _design_matrix(
    trend: np.ndarray, index: pd.DatetimeIndex, use_annual: bool
) -> np.ndarray:
    """Columns: intercept, trend, annual harmonics (optional), weekday dummies."""
    columns = [np.ones(len(trend)), trend]

    if use_annual:
        phase = 2 * np.pi * index.dayofyear.to_numpy() / DAYS_PER_YEAR
        for harmonic in (1, 2):
            columns.append(np.sin(harmonic * phase))
            columns.append(np.cos(harmonic * phase))

    # Sunday is the baseline, absorbed by the intercept.
    weekday = index.dayofweek.to_numpy()
    for day in range(6):
        columns.append((weekday == day).astype(float))

    return np.column_stack(columns)


def _damped_trend_positions(history_length: int, horizon: int) -> np.ndarray:
    """Trend positions for future days, with each step discounted by ``TREND_DAMPING``."""
    steps = np.arange(1, horizon + 1)
    cumulative = np.cumsum(TREND_DAMPING**steps)
    return (history_length - 1) + cumulative


def forecast(
    history: pd.Series,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
    confidence: float = 0.8,
) -> list[ForecastPoint]:
    """Projects daily incident counts out to ``max(horizons)`` days.

    Returns one point per day, each tagged with the shortest horizon bucket it falls in,
    so the dashboard can draw a continuous curve and still label the 30 / 60 / 90-day
    markers the executive view asks for.
    """
    if len(history) < MIN_HISTORY_DAYS:
        raise ValueError(
            f"need at least {MIN_HISTORY_DAYS} days of history to project a trend, got {len(history)}"
        )

    index = pd.DatetimeIndex(history.index)
    values = history.to_numpy(dtype=float)
    use_annual = len(history) >= MIN_HISTORY_FOR_ANNUAL_DAYS

    # Counts are non-negative and bursty; fitting on log1p keeps the projection positive
    # and stops a single bad week from tilting the whole fit.
    logged = np.log1p(values)
    trend_positions = np.arange(len(values), dtype=float)

    design = _design_matrix(trend_positions, index, use_annual)
    coefficients, *_ = np.linalg.lstsq(design, logged, rcond=None)

    residuals = logged - design @ coefficients
    lower_q, upper_q = np.quantile(residuals, [(1 - confidence) / 2, 1 - (1 - confidence) / 2])

    horizon_max = max(horizons)
    future_index = pd.date_range(
        start=index[-1] + pd.Timedelta(days=1), periods=horizon_max, freq="D", tz="UTC"
    )
    future_design = _design_matrix(
        _damped_trend_positions(len(values), horizon_max), future_index, use_annual
    )
    projection = future_design @ coefficients

    return [
        ForecastPoint(
            forecast_date=date,
            predicted=float(np.expm1(base).clip(min=0.0)),
            lower=float(np.expm1(base + lower_q).clip(min=0.0)),
            upper=float(np.expm1(base + upper_q).clip(min=0.0)),
            horizon_days=_horizon_bucket(step, horizons),
        )
        for step, (date, base) in enumerate(zip(future_index, projection, strict=True), start=1)
    ]


def _horizon_bucket(step: int, horizons: tuple[int, ...]) -> int:
    for horizon in sorted(horizons):
        if step <= horizon:
            return horizon
    return max(horizons)


def summarise(points: list[ForecastPoint], horizons: tuple[int, ...] = DEFAULT_HORIZONS) -> dict:
    """Cumulative expected incidents at each horizon — the executive headline number."""
    if not points:
        return {}

    start = points[0].forecast_date
    summary = {}
    for horizon in sorted(horizons):
        window = [p for p in points if p.forecast_date <= start + pd.Timedelta(days=horizon - 1)]
        summary[f"{horizon}d"] = {
            "expected_incidents": round(sum(p.predicted for p in window), 1),
            "lower": round(sum(p.lower for p in window), 1),
            "upper": round(sum(p.upper for p in window), 1),
        }
    return summary
