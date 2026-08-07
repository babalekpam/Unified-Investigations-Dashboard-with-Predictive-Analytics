from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from gsih_analytics.features.build import build_scoring_frame, build_training_frame
from gsih_analytics.models import forecast as forecast_model
from gsih_analytics.models import hotspots as hotspot_model
from gsih_analytics.models import vandalism


@pytest.fixture(scope="module")
def trained(sources):
    frame = build_training_frame(
        sources, start=pd.Timestamp("2025-01-15", tz="UTC"), end=pd.Timestamp("2026-01-20", tz="UTC")
    )
    return vandalism.train(frame, version="test-1.0.0"), frame


def test_split_is_chronological_not_random(sources):
    frame = build_training_frame(
        sources, start=pd.Timestamp("2025-02-01", tz="UTC"), end=pd.Timestamp("2025-10-01", tz="UTC")
    )
    train_df, test_df = vandalism.time_ordered_split(frame, test_fraction=0.25)
    assert train_df["as_of_date"].max() <= test_df["as_of_date"].min()
    assert len(train_df) + len(test_df) == len(frame)


def test_model_beats_chance_on_a_future_holdout(trained):
    result, _ = trained
    chosen = next(e for e in result.evaluations if e.model_name == result.chosen)
    # The fixture embeds a real signal, so a model that cannot beat a coin flip on
    # unseen future days is broken, not merely unlucky.
    assert chosen.roc_auc > 0.6
    assert chosen.average_precision > chosen.positive_rate


def test_both_candidate_models_are_evaluated(trained):
    result, _ = trained
    assert {e.model_name for e in result.evaluations} == {
        "logistic-regression",
        "gradient-boosting",
    }


def test_importance_is_a_normalised_ranking(trained):
    result, _ = trained
    assert result.feature_importance
    assert all(value >= 0 for value in result.feature_importance.values())
    assert pytest.approx(sum(result.feature_importance.values()), abs=1e-6) == 1.0


def test_scoring_returns_calibrated_probabilities_with_explanations(trained, sources):
    result, _ = trained
    features = build_scoring_frame(sources, pd.Timestamp("2026-01-20", tz="UTC"))
    scored = vandalism.score_sites(result.estimator, features, result.feature_importance)

    assert len(scored) == len(sources.sites)
    assert scored["risk_score"].between(0.0, 1.0).all()
    assert scored["risk_score"].is_monotonic_decreasing
    assert all(isinstance(factors, dict) for factors in scored["top_factors"])
    assert scored["peak_window"].notna().all()


def test_training_on_a_single_class_fails_loudly(sources):
    quiet = build_training_frame(
        sources, start=pd.Timestamp("2025-01-02", tz="UTC"), end=pd.Timestamp("2025-01-10", tz="UTC")
    )
    quiet["label"] = 0
    with pytest.raises(ValueError, match="only one class"):
        vandalism.train(quiet, version="test")


def test_empty_training_frame_fails_loudly():
    with pytest.raises(ValueError, match="no training rows"):
        vandalism.train(pd.DataFrame(columns=["as_of_date", "label"]), version="test")


# ------------------------------------------------------------------ forecasting


def test_daily_counts_include_quiet_days_as_zeros(sources):
    start = pd.Timestamp("2025-03-01", tz="UTC")
    end = pd.Timestamp("2025-04-01", tz="UTC")
    counts = forecast_model.daily_counts(sources.incidents, start, end)
    assert len(counts) == 32
    assert (counts == 0).any(), "fixture has incident-free days that must appear as zeros"
    assert counts.sum() > 0


def test_forecast_produces_bounded_non_negative_projection(sources):
    counts = forecast_model.daily_counts(
        sources.incidents, pd.Timestamp("2025-01-01", tz="UTC"), pd.Timestamp("2025-12-31", tz="UTC")
    )
    points = forecast_model.forecast(counts)

    assert len(points) == 90
    assert all(p.predicted >= 0 for p in points)
    assert all(p.lower <= p.predicted <= p.upper for p in points)
    assert points[0].forecast_date == counts.index[-1] + pd.Timedelta(days=1)
    assert {p.horizon_days for p in points} == {30, 60, 90}


def test_forecast_refuses_to_extrapolate_from_too_little_history(sources):
    counts = forecast_model.daily_counts(
        sources.incidents, pd.Timestamp("2025-01-01", tz="UTC"), pd.Timestamp("2025-01-10", tz="UTC")
    )
    with pytest.raises(ValueError, match="at least"):
        forecast_model.forecast(counts)


def test_forecast_tracks_a_rising_trend():
    index = pd.date_range("2025-01-01", periods=180, freq="D", tz="UTC")
    rising = pd.Series(np.linspace(0.2, 4.0, 180).round(), index=index)
    points = forecast_model.forecast(rising)
    assert points[-1].predicted > points[0].predicted


def test_trend_is_damped_rather_than_extrapolated_forever():
    """A steep recent slope must not compound across the whole 90-day horizon."""
    index = pd.date_range("2025-01-01", periods=200, freq="D", tz="UTC")
    steep = pd.Series(np.linspace(0.5, 12.0, 200).round(), index=index)
    points = forecast_model.forecast(steep)

    # Undamped, the fitted slope would carry the projection far past the observed range.
    # Damping caps how far the trend alone can take it.
    assert points[-1].predicted > steep.iloc[-1]
    assert points[-1].predicted < steep.iloc[-1] * 3


def test_seasonal_trough_is_not_mistaken_for_a_permanent_decline():
    """The failure this model exists to avoid.

    Two years of data with a strong annual cycle, cut off at the summer trough. A
    trend-only fit reads the last few months as a collapse and projects towards zero;
    with the annual term the projection turns back up as autumn approaches.
    """
    index = pd.date_range("2024-09-01", periods=700, freq="D", tz="UTC")
    phase = 2 * np.pi * index.dayofyear.to_numpy() / 365.25
    # Peaks in winter, troughs in summer — the pattern the incident history shows.
    seasonal = 2.5 + 2.0 * np.cos(phase)
    history = pd.Series(np.round(seasonal), index=index)

    points = forecast_model.forecast(history)
    trough_level = float(history.iloc[-30:].mean())

    # Ninety days past the trough is late autumn: the projection must be climbing.
    assert points[-1].predicted > points[0].predicted
    assert points[-1].predicted > trough_level


def test_annual_term_is_skipped_when_history_is_shorter_than_a_year():
    """Under a year, a seasonal term would be invented rather than measured."""
    index = pd.date_range("2025-01-01", periods=120, freq="D", tz="UTC")
    flat = pd.Series(np.full(120, 2.0), index=index)
    points = forecast_model.forecast(flat)

    # A flat year-less history projects flat; no phantom cycle appears.
    predicted = [p.predicted for p in points]
    assert max(predicted) - min(predicted) < 0.5


def test_summary_reports_cumulative_totals_per_horizon(sources):
    counts = forecast_model.daily_counts(
        sources.incidents, pd.Timestamp("2025-01-01", tz="UTC"), pd.Timestamp("2025-12-31", tz="UTC")
    )
    summary = forecast_model.summarise(forecast_model.forecast(counts))
    assert set(summary) == {"30d", "60d", "90d"}
    assert summary["90d"]["expected_incidents"] >= summary["30d"]["expected_incidents"]


# ------------------------------------------------------------------ hotspots


def test_clusters_the_dense_group_and_leaves_outliers_as_noise(sources):
    vandalism_incidents = sources.incidents[sources.incidents["incident_type"] == "VANDALISM"]
    clusters = hotspot_model.find_hotspots(vandalism_incidents, radius_km=10.0, min_incidents=4)

    assert clusters, "the four co-located vulnerable sites should form a hotspot"
    largest = clusters[0]
    assert largest.incident_count >= 4
    # The vulnerable sites sit within ~0.1 degrees of each other; the scattered ones are
    # hundreds of kilometres away and must not be swept into the same cluster.
    assert set(largest.site_codes).issubset(
        {"SITE-001", "SITE-002", "SITE-003", "SITE-004"}
    )


def test_no_hotspots_when_there_is_nothing_to_cluster():
    empty = pd.DataFrame(columns=["site_code", "region", "latitude", "longitude"])
    assert hotspot_model.find_hotspots(empty) == []


def test_haversine_matches_a_known_distance():
    # Dallas to Atlanta is roughly 1160 km.
    distance = hotspot_model.haversine_km(32.7767, -96.7970, 33.7490, -84.3880)
    assert 1100 < float(distance) < 1220
