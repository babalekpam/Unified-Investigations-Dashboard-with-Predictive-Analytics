from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from gsih_analytics.features.build import (
    FEATURE_COLUMNS,
    LABEL_HORIZON_DAYS,
    NEVER_OCCURRED_DAYS,
    SourceFrames,
    build_scoring_frame,
    build_training_frame,
)


def test_every_declared_feature_is_produced(sources):
    frame = build_scoring_frame(sources, pd.Timestamp("2025-06-01", tz="UTC"))
    assert set(FEATURE_COLUMNS).issubset(frame.columns)
    assert len(frame) == len(sources.sites)
    assert frame[FEATURE_COLUMNS].isna().sum().sum() == 0


def test_features_never_see_the_future(sources):
    """The leakage guard: no feature may move when only later data changes."""
    as_of = pd.Timestamp("2025-06-01", tz="UTC")
    before = build_scoring_frame(sources, as_of)

    future_incidents = pd.concat(
        [
            sources.incidents,
            pd.DataFrame(
                [
                    {
                        "id": "INC-FUTURE",
                        "site_code": sources.sites.iloc[0]["site_code"],
                        "region": sources.sites.iloc[0]["region"],
                        "incident_type": "VANDALISM",
                        "severity": "HIGH",
                        "occurred_at": as_of + pd.Timedelta(days=3),
                        "loss_amount": 9999.0,
                        "latitude": 32.7,
                        "longitude": -96.8,
                    }
                ]
            ),
        ],
        ignore_index=True,
    )

    after = build_scoring_frame(
        SourceFrames(sources.sites, future_incidents, sources.access_events, sources.alarm_events),
        as_of,
    )
    pd.testing.assert_frame_equal(before[FEATURE_COLUMNS], after[FEATURE_COLUMNS])


def test_label_marks_sites_with_vandalism_in_the_horizon(sources):
    frame = build_training_frame(
        sources, start=pd.Timestamp("2025-03-01", tz="UTC"), end=pd.Timestamp("2025-09-01", tz="UTC")
    )
    assert frame["label"].isin([0, 1]).all()
    assert frame["label"].sum() > 0, "fixture should contain positive examples"

    # Spot-check one positive row against the raw incident table.
    positive = frame[frame["label"] == 1].iloc[0]
    window_start = positive["as_of_date"]
    window_end = window_start + pd.Timedelta(days=LABEL_HORIZON_DAYS)
    matching = sources.incidents[
        (sources.incidents["site_code"] == positive["site_code"])
        & (sources.incidents["incident_type"] == "VANDALISM")
        & (sources.incidents["occurred_at"] >= window_start)
        & (sources.incidents["occurred_at"] < window_end)
    ]
    assert len(matching) > 0


def test_unlabelable_tail_is_dropped(sources):
    end = pd.Timestamp("2025-09-01", tz="UTC")
    frame = build_training_frame(sources, start=pd.Timestamp("2025-06-01", tz="UTC"), end=end)
    assert frame["as_of_date"].max() <= end - pd.Timedelta(days=LABEL_HORIZON_DAYS)


def test_sites_with_no_history_get_a_finite_recency_value(sources):
    frame = build_scoring_frame(sources, pd.Timestamp("2025-01-02", tz="UTC"))
    assert frame["days_since_last_vandalism"].max() <= NEVER_OCCURRED_DAYS
    assert np.isfinite(frame["days_since_last_vandalism"]).all()


def test_vulnerable_sites_score_higher_on_facility_features(sources):
    frame = build_scoring_frame(sources, pd.Timestamp("2025-06-01", tz="UTC"))
    dark = frame[frame["site_code"].isin(["SITE-001", "SITE-002", "SITE-003", "SITE-004"])]
    lit = frame[~frame["site_code"].isin(["SITE-001", "SITE-002", "SITE-003", "SITE-004"])]
    assert dark["low_lighting"].mean() > lit["low_lighting"].mean()
    assert dark["perimeter_open"].mean() > lit["perimeter_open"].mean()


def test_empty_range_returns_an_empty_frame_not_an_error(sources):
    frame = build_training_frame(
        sources,
        start=pd.Timestamp("2025-06-02", tz="UTC"),
        end=pd.Timestamp("2025-06-01", tz="UTC"),
    )
    assert frame.empty
