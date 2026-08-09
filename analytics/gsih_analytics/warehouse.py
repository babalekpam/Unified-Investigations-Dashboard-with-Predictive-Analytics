"""Read access to the serving warehouse.

The analytics service reads the same curated tables the dashboards read, and writes
nothing directly: scores go back through the investigations API so they pass the same
validation and audit path as any other write. That keeps a single service responsible for
the schema.
"""

from __future__ import annotations

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from gsih_analytics.features.build import SourceFrames

SITES_SQL = """
select site_code, name, region, country, city, site_type, latitude, longitude,
       lighting_score, foot_traffic_score, camera_count, perimeter_fenced, critical_asset
from site
"""

INCIDENTS_SQL = """
select i.id, i.site_code, i.region, i.incident_type, i.severity, i.occurred_at,
       i.loss_amount, s.latitude, s.longitude
from incident i
left join site s on s.site_code = i.site_code
where i.occurred_at >= :since
"""

ACCESS_SQL = """
select site_code, result, event_time, after_hours, tailgate
from access_event
where event_time >= :since
"""

ALARMS_SQL = """
select site_code, alarm_type, severity, event_time
from alarm_event
where event_time >= :since
"""


def engine_for(db_url: str) -> Engine:
    # pool_pre_ping guards the long-lived Airflow worker connection against a database
    # failover silently handing back a dead socket.
    return create_engine(db_url, pool_pre_ping=True, future=True)


def load_sources(engine: Engine, since: pd.Timestamp) -> SourceFrames:
    """Loads every table the feature builder needs, already typed for pandas."""
    params = {"since": since.to_pydatetime()}

    with engine.connect() as conn:
        sites = pd.read_sql(text(SITES_SQL), conn)
        incidents = pd.read_sql(text(INCIDENTS_SQL), conn, params=params)
        access = pd.read_sql(text(ACCESS_SQL), conn, params=params)
        alarms = pd.read_sql(text(ALARMS_SQL), conn, params=params)

    return SourceFrames(
        sites=_typed_sites(sites),
        incidents=_typed_times(incidents, "occurred_at"),
        access_events=_typed_access(access),
        alarm_events=_typed_times(alarms, "event_time"),
    )


def _typed_sites(frame: pd.DataFrame) -> pd.DataFrame:
    for column in ("lighting_score", "foot_traffic_score", "camera_count"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    for column in ("perimeter_fenced", "critical_asset"):
        frame[column] = frame[column].astype("boolean")
    return frame


def _typed_times(frame: pd.DataFrame, column: str) -> pd.DataFrame:
    frame[column] = pd.to_datetime(frame[column], utc=True)
    return frame


def _typed_access(frame: pd.DataFrame) -> pd.DataFrame:
    frame = _typed_times(frame, "event_time")
    # Nulls become False: an unflagged badge read is not evidence of after-hours entry,
    # and leaving NA in place would make every downstream boolean mask ambiguous.
    for column in ("after_hours", "tailgate"):
        frame[column] = frame[column].fillna(False).astype(bool)
    return frame
