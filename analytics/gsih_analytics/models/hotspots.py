"""Geospatial clustering of incidents (Section 6.4, "Identify high-risk locations on a map").

DBSCAN on haversine distances rather than k-means on raw latitude/longitude. Two reasons:
incidents cluster in irregular shapes around access roads and yards, not in circles; and
DBSCAN does not require the number of clusters up front, which nobody knows in advance.
Isolated incidents come back labelled as noise instead of being forced into a hotspot.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

EARTH_RADIUS_KM = 6371.0088

# Two incidents within this distance of each other are candidates for the same hotspot.
DEFAULT_RADIUS_KM = 5.0

# A hotspot needs at least this many incidents; below it, one repeat event at a single
# site would be promoted to an "area hotspot" and send patrols chasing noise.
DEFAULT_MIN_INCIDENTS = 4


@dataclass(frozen=True)
class Hotspot:
    cluster_id: int
    incident_count: int
    centroid_lat: float
    centroid_lon: float
    radius_km: float
    site_codes: list[str]
    regions: list[str]


def find_hotspots(
    incidents: pd.DataFrame,
    radius_km: float = DEFAULT_RADIUS_KM,
    min_incidents: int = DEFAULT_MIN_INCIDENTS,
) -> list[Hotspot]:
    """Clusters incidents that carry coordinates; returns clusters largest first."""
    located = incidents.dropna(subset=["latitude", "longitude"])
    if len(located) < min_incidents:
        return []

    radians = np.radians(located[["latitude", "longitude"]].to_numpy(dtype=float))
    labels = DBSCAN(
        eps=radius_km / EARTH_RADIUS_KM,
        min_samples=min_incidents,
        metric="haversine",
        algorithm="ball_tree",
    ).fit_predict(radians)

    located = located.assign(cluster=labels)
    hotspots: list[Hotspot] = []

    # -1 is DBSCAN's noise label: incidents with no dense neighbourhood. They are
    # genuinely isolated events, and reporting them as a hotspot would be misleading.
    for cluster_id, group in located[located["cluster"] >= 0].groupby("cluster"):
        centroid_lat = float(group["latitude"].mean())
        centroid_lon = float(group["longitude"].mean())
        hotspots.append(
            Hotspot(
                cluster_id=int(cluster_id),
                incident_count=len(group),
                centroid_lat=round(centroid_lat, 5),
                centroid_lon=round(centroid_lon, 5),
                radius_km=round(
                    _max_distance_km(group, centroid_lat, centroid_lon), 2
                ),
                site_codes=sorted(group["site_code"].unique().tolist()),
                regions=sorted(group["region"].dropna().unique().tolist()),
            )
        )

    return sorted(hotspots, key=lambda h: h.incident_count, reverse=True)


def _max_distance_km(group: pd.DataFrame, lat: float, lon: float) -> float:
    distances = haversine_km(
        group["latitude"].to_numpy(dtype=float),
        group["longitude"].to_numpy(dtype=float),
        lat,
        lon,
    )
    return float(distances.max())


def haversine_km(
    lat1: np.ndarray | float, lon1: np.ndarray | float, lat2: float, lon2: float
) -> np.ndarray:
    """Great-circle distance in kilometres."""
    lat1_r, lon1_r, lat2_r, lon2_r = map(np.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))
