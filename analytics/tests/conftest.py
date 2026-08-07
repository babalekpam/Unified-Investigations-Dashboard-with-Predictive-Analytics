"""Synthetic warehouse fixtures with a signal the model should be able to find.

The generator deliberately builds vandalism that clusters at poorly-lit, unfenced sites
and follows after-hours badge activity. That gives the tests something real to assert on:
if the feature pipeline or the model stops picking that up, the tests fail rather than
passing on noise.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from gsih_analytics.features.build import SourceFrames

RNG_SEED = 7
START = pd.Timestamp("2025-01-01", tz="UTC")
DAYS = 400


@pytest.fixture(scope="session")
def rng() -> np.random.Generator:
    return np.random.default_rng(RNG_SEED)


@pytest.fixture(scope="session")
def sites() -> pd.DataFrame:
    rows = []
    for i in range(1, 13):
        # The first four sites are the hard targets: dark, quiet, unfenced.
        vulnerable = i <= 4
        rows.append(
            {
                "site_code": f"SITE-{i:03d}",
                "name": f"Facility {i}",
                "region": ["SOUTHWEST", "NORTHEAST", "MIDWEST"][i % 3],
                "country": "US",
                "city": "Dallas",
                "site_type": "NETWORK_FACILITY",
                "latitude": 32.7 + (0.02 * i if vulnerable else 5.0 + 0.5 * i),
                "longitude": -96.8 - (0.02 * i if vulnerable else 5.0 + 0.5 * i),
                "lighting_score": 1 if vulnerable else 5,
                "foot_traffic_score": 1 if vulnerable else 5,
                "camera_count": 2 if vulnerable else 12,
                "perimeter_fenced": not vulnerable,
                "critical_asset": vulnerable,
            }
        )
    return pd.DataFrame(rows)


@pytest.fixture(scope="session")
def sources(sites: pd.DataFrame) -> SourceFrames:
    generator = np.random.default_rng(RNG_SEED)
    dates = pd.date_range(START, periods=DAYS, freq="D", tz="UTC")

    incidents, access, alarms = [], [], []

    for day in dates:
        for _, site in sites.iterrows():
            vulnerable = site["lighting_score"] == 1
            base_rate = 0.09 if vulnerable else 0.004

            after_hours_burst = generator.random() < (0.25 if vulnerable else 0.05)
            if after_hours_burst:
                for hour in (23, 1):
                    access.append(
                        {
                            "site_code": site["site_code"],
                            "result": "DENIED" if generator.random() < 0.4 else "GRANTED",
                            "event_time": day + pd.Timedelta(hours=hour),
                            "after_hours": True,
                            "tailgate": generator.random() < 0.2,
                        }
                    )

            # After-hours activity precedes vandalism more often than not — the pattern
            # Section 6.2 expects the model to learn.
            rate = base_rate * (2.5 if after_hours_burst else 1.0)
            if generator.random() < rate:
                incidents.append(
                    {
                        "id": f"INC-{len(incidents):05d}",
                        "site_code": site["site_code"],
                        "region": site["region"],
                        "incident_type": "VANDALISM",
                        "severity": "MEDIUM",
                        "occurred_at": day + pd.Timedelta(hours=int(generator.integers(0, 24))),
                        "loss_amount": float(generator.integers(200, 5000)),
                        "latitude": site["latitude"],
                        "longitude": site["longitude"],
                    }
                )

            if generator.random() < (0.2 if vulnerable else 0.05):
                alarms.append(
                    {
                        "site_code": site["site_code"],
                        "alarm_type": "CAMERA_TAMPER" if generator.random() < 0.2 else "MOTION",
                        "severity": "MEDIUM",
                        "event_time": day + pd.Timedelta(hours=int(generator.integers(0, 24))),
                    }
                )

    # A handful of non-vandalism incidents, so filters are actually exercised.
    for i in range(40):
        site = sites.iloc[i % len(sites)]
        incidents.append(
            {
                "id": f"INC-T{i:05d}",
                "site_code": site["site_code"],
                "region": site["region"],
                "incident_type": "THEFT",
                "severity": "HIGH",
                "occurred_at": START + pd.Timedelta(days=int(generator.integers(0, DAYS))),
                "loss_amount": 1500.0,
                "latitude": site["latitude"],
                "longitude": site["longitude"],
            }
        )

    return SourceFrames(
        sites=sites,
        incidents=pd.DataFrame(incidents),
        access_events=pd.DataFrame(access),
        alarm_events=pd.DataFrame(alarms),
    )
