"""Generates a demonstration dataset for the Global Security Intelligence Hub.

This is synthetic data for a running demo, not a simulation of any real organisation.
It exists so the dashboards and the model have something with structure in it: vandalism
concentrates at poorly-lit, unfenced, low-traffic sites, clusters after hours, and rises
through the winter months. Those are the patterns Section 6.2 says to look for, so a
demo that lacks them would show a model finding nothing.

Deterministic: the same seed always produces the same dataset, so a screenshot taken
today can be reproduced next month.

    python generate_seed.py --db-url postgresql+psycopg2://gsih:gsih@localhost:5432/gsih
    python generate_seed.py --dry-run          # counts only, touches nothing
"""

from __future__ import annotations

import argparse
import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np

SEED = 20260807
# Just over two years, so the executive view's year-over-year comparison has a full
# prior year to compare against rather than a partially-empty window.
DAYS_OF_HISTORY = 760

REGIONS = {
    "SOUTHWEST": [("Dallas", 32.7767, -96.7970), ("Phoenix", 33.4484, -112.0740),
                  ("Austin", 30.2672, -97.7431), ("Albuquerque", 35.0844, -106.6504)],
    "SOUTHEAST": [("Atlanta", 33.7490, -84.3880), ("Miami", 25.7617, -80.1918),
                  ("Charlotte", 35.2271, -80.8431), ("Nashville", 36.1627, -86.7816)],
    "NORTHEAST": [("Newark", 40.7357, -74.1724), ("Boston", 42.3601, -71.0589),
                  ("Philadelphia", 39.9526, -75.1652)],
    "MIDWEST": [("Chicago", 41.8781, -87.6298), ("Detroit", 42.3314, -83.0458),
                ("St Louis", 38.6270, -90.1994)],
    "WEST": [("Los Angeles", 34.0522, -118.2437), ("Seattle", 47.6062, -122.3321),
             ("Denver", 39.7392, -104.9903)],
}

TIMEZONES = {
    "SOUTHWEST": "America/Chicago",
    "SOUTHEAST": "America/New_York",
    "NORTHEAST": "America/New_York",
    "MIDWEST": "America/Chicago",
    "WEST": "America/Los_Angeles",
}

SITE_TYPES = ["NETWORK_FACILITY", "CENTRAL_OFFICE", "RETAIL_STORE", "WAREHOUSE", "CELL_SITE"]

INVESTIGATORS = [
    ("dana.reyes@att.com", "SOUTHWEST"), ("sam.ortiz@att.com", "SOUTHWEST"),
    ("nia.brooks@att.com", "SOUTHEAST"), ("evan.park@att.com", "SOUTHEAST"),
    ("lena.fischer@att.com", "NORTHEAST"), ("omar.haddad@att.com", "NORTHEAST"),
    ("ruth.oyelaran@att.com", "MIDWEST"), ("tomas.silva@att.com", "MIDWEST"),
    ("kai.nakamura@att.com", "WEST"), ("bea.callahan@att.com", "WEST"),
]

CASE_SOURCES = ["CASE_IQ", "RESOLVER", "KASEWARE"]
INCIDENT_SOURCES = ["D3_SECURITY", "OMNIGO", "PERSPECTIVE"]
ACCESS_SOURCES = ["LENEL_S2", "HID", "GENETEC_SYNERGIS"]
ALARM_SOURCES = ["GENETEC", "MILESTONE", "AVIGILON"]

INCIDENT_TYPES = [
    "VANDALISM", "THEFT", "TRESPASS", "UNAUTHORIZED_ACCESS",
    "POLICY_VIOLATION", "FRAUD", "ASSET_LOSS",
]
INCIDENT_WEIGHTS = [0.34, 0.20, 0.13, 0.12, 0.09, 0.07, 0.05]

STATUSES = ["NEW", "IN_PROGRESS", "PENDING_REVIEW", "ESCALATED", "CLOSED"]
PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

BADGE_SALT = "local-demo-badge-salt"


@dataclass
class Site:
    site_code: str
    name: str
    region: str
    country: str
    city: str
    site_type: str
    timezone: str
    latitude: float
    longitude: float
    lighting_score: int
    foot_traffic_score: int
    camera_count: int
    perimeter_fenced: bool
    critical_asset: bool

    @property
    def vulnerability(self) -> float:
        """0–1 exposure score driving how often this site is targeted."""
        score = 0.0
        score += (5 - self.lighting_score) * 0.10
        score += (5 - self.foot_traffic_score) * 0.08
        score += 0.15 if not self.perimeter_fenced else 0.0
        score += 0.10 if self.critical_asset else 0.0
        score += max(0.0, (6 - self.camera_count)) * 0.02
        return min(score, 1.0)


def build_sites(rng: np.random.Generator) -> list[Site]:
    sites: list[Site] = []
    counter = 0
    for region, cities in REGIONS.items():
        for city, lat, lon in cities:
            for _ in range(int(rng.integers(3, 6))):
                counter += 1
                lighting = int(rng.integers(1, 6))
                traffic = int(rng.integers(1, 6))
                sites.append(
                    Site(
                        site_code=f"SITE-{counter:04d}",
                        name=f"{city} {rng.choice(['Yard', 'Exchange', 'Depot', 'Hub', 'Annex'])} {counter}",
                        region=region,
                        country="US",
                        city=city,
                        site_type=str(rng.choice(SITE_TYPES)),
                        timezone=TIMEZONES[region],
                        # Scatter facilities around the metro rather than stacking them
                        # on one point, so the hotspot clustering has real geometry.
                        latitude=round(lat + float(rng.normal(0, 0.09)), 5),
                        longitude=round(lon + float(rng.normal(0, 0.09)), 5),
                        lighting_score=lighting,
                        foot_traffic_score=traffic,
                        camera_count=int(rng.integers(1, 16)),
                        perimeter_fenced=bool(rng.random() > 0.35),
                        critical_asset=bool(rng.random() > 0.75),
                    )
                )
    return sites


def seasonal_multiplier(day: datetime) -> float:
    """Darker months carry more vandalism; a smooth annual cycle, not a step."""
    phase = (day.timetuple().tm_yday / 365.25) * 2 * np.pi
    return 1.0 + 0.35 * float(np.cos(phase))


def build_events(rng: np.random.Generator, sites: list[Site], now: datetime):
    incidents, access_events, alarm_events = [], [], []
    start = now - timedelta(days=DAYS_OF_HISTORY)

    for day_offset in range(DAYS_OF_HISTORY):
        day = start + timedelta(days=day_offset)
        season = seasonal_multiplier(day)
        weekend = day.weekday() >= 5

        for site in sites:
            exposure = site.vulnerability

            # After-hours badge activity: the leading indicator the model keys on.
            after_hours_burst = rng.random() < (0.05 + exposure * 0.30)
            if after_hours_burst:
                for _ in range(int(rng.integers(1, 4))):
                    hour = int(rng.choice([21, 22, 23, 0, 1, 2, 3]))
                    access_events.append(
                        {
                            "id": uuid.uuid4(),
                            "source_system": str(rng.choice(ACCESS_SOURCES)),
                            "site_code": site.site_code,
                            "badge_hash": badge_hash(f"BADGE-{int(rng.integers(1000, 9999))}"),
                            "door_id": f"DOOR-{int(rng.integers(1, 9))}",
                            "result": str(rng.choice(["GRANTED", "DENIED", "FORCED"], p=[0.6, 0.3, 0.1])),
                            "event_time": day.replace(hour=hour % 24, minute=int(rng.integers(0, 60))),
                            "after_hours": True,
                            "tailgate": bool(rng.random() < 0.18),
                        }
                    )

            # Ordinary daytime badge traffic, so after-hours counts mean something.
            for _ in range(int(rng.poisson(2 if weekend else 6))):
                access_events.append(
                    {
                        "id": uuid.uuid4(),
                        "source_system": str(rng.choice(ACCESS_SOURCES)),
                        "site_code": site.site_code,
                        "badge_hash": badge_hash(f"BADGE-{int(rng.integers(1000, 9999))}"),
                        "door_id": f"DOOR-{int(rng.integers(1, 9))}",
                        "result": "GRANTED" if rng.random() < 0.95 else "DENIED",
                        "event_time": day.replace(hour=int(rng.integers(7, 19)), minute=int(rng.integers(0, 60))),
                        "after_hours": False,
                        "tailgate": False,
                    }
                )

            if rng.random() < (0.04 + exposure * 0.16):
                alarm_events.append(
                    {
                        "id": uuid.uuid4(),
                        "source_system": str(rng.choice(ALARM_SOURCES)),
                        "site_code": site.site_code,
                        "camera_id": f"CAM-{int(rng.integers(1, 20))}",
                        "alarm_type": str(
                            rng.choice(
                                ["MOTION", "PERIMETER", "GLASS_BREAK", "CAMERA_TAMPER", "LOITERING"],
                                p=[0.45, 0.2, 0.12, 0.13, 0.10],
                            )
                        ),
                        "severity": str(rng.choice(["LOW", "MEDIUM", "HIGH"], p=[0.4, 0.45, 0.15])),
                        "event_time": day.replace(hour=int(rng.integers(0, 24)), minute=int(rng.integers(0, 60))),
                    }
                )

            vandalism_rate = 0.0022 + exposure * 0.020
            vandalism_rate *= season
            if after_hours_burst:
                vandalism_rate *= 2.4

            if rng.random() < vandalism_rate:
                incidents.append(
                    _incident(rng, site, day, "VANDALISM")
                )
            elif rng.random() < 0.010:
                other_type = str(rng.choice(INCIDENT_TYPES, p=INCIDENT_WEIGHTS))
                if other_type != "VANDALISM":
                    incidents.append(_incident(rng, site, day, other_type))

    return incidents, access_events, alarm_events


def _incident(rng: np.random.Generator, site: Site, day: datetime, incident_type: str) -> dict:
    return {
        "id": uuid.uuid4(),
        "source_system": str(rng.choice(INCIDENT_SOURCES)),
        "source_id": f"INC-{uuid.uuid4().hex[:12]}",
        "site_code": site.site_code,
        "region": site.region,
        "incident_type": incident_type,
        "severity": str(rng.choice(["LOW", "MEDIUM", "HIGH", "CRITICAL"], p=[0.3, 0.45, 0.2, 0.05])),
        "description": f"{incident_type.replace('_', ' ').title()} reported at {site.name}",
        "reported_by": "site.security@att.com",
        "occurred_at": day.replace(hour=int(rng.integers(0, 24)), minute=int(rng.integers(0, 60))),
        "loss_amount": round(float(rng.gamma(2.0, 900)), 2),
        "case_number": None,
    }


def build_cases(rng: np.random.Generator, sites: list[Site], incidents: list[dict], now: datetime):
    """Opens a case for a share of incidents, then ages them through the lifecycle."""
    by_region: dict[str, list[str]] = {}
    for email, region in INVESTIGATORS:
        by_region.setdefault(region, []).append(email)

    site_index = {site.site_code: site for site in sites}
    cases = []

    for incident in incidents:
        # Not every incident becomes a case; serious ones almost always do.
        promote = rng.random() < (0.85 if incident["severity"] in ("HIGH", "CRITICAL") else 0.35)
        if not promote:
            continue

        site = site_index[incident["site_code"]]
        opened_at = incident["occurred_at"] + timedelta(hours=int(rng.integers(1, 72)))
        if opened_at > now:
            continue

        age_days = (now - opened_at).days
        # Older cases are more likely to be finished; recent ones are still moving.
        closed = rng.random() < min(0.92, 0.25 + age_days / 160)

        if closed:
            status = "CLOSED"
            closed_at = opened_at + timedelta(days=float(rng.gamma(2.4, 7)))
            if closed_at > now:
                closed_at = now - timedelta(days=1)
        else:
            status = str(rng.choice(STATUSES[:4], p=[0.20, 0.52, 0.16, 0.12]))
            closed_at = None

        case_number = f"{site.region[:2]}-{int(rng.integers(10000, 99999))}"
        incident["case_number"] = case_number

        cases.append(
            {
                "id": uuid.uuid4(),
                "case_number": case_number,
                "title": f"{incident['incident_type'].replace('_', ' ').title()} — {site.name}",
                "case_type": incident["incident_type"],
                "status": status,
                "priority": str(rng.choice(PRIORITIES, p=[0.22, 0.44, 0.26, 0.08])),
                "assignee_email": str(rng.choice(by_region[site.region])),
                "site_code": site.site_code,
                "region": site.region,
                "opened_at": opened_at,
                "due_at": opened_at + timedelta(days=int(rng.choice([7, 14, 21, 30]))),
                "closed_at": closed_at,
                "financial_impact": incident["loss_amount"],
                "source_system": str(rng.choice(CASE_SOURCES)),
                "source_id": f"CASE-{uuid.uuid4().hex[:12]}",
                "updated_at": closed_at or now,
            }
        )

    return cases


def badge_hash(badge_id: str) -> str:
    """Matches the ingest service's pseudonymisation so demo data looks like real data."""
    digest = hashlib.sha256()
    digest.update(BADGE_SALT.encode())
    digest.update(badge_id.encode())
    return digest.hexdigest()


def write(db_url: str, sites, incidents, cases, access_events, alarm_events) -> None:
    from sqlalchemy import create_engine, text

    engine = create_engine(db_url, future=True)
    with engine.begin() as conn:
        # Truncate rather than append: re-running the seeder should reset the demo, not
        # silently double every KPI on the dashboard.
        conn.execute(
            text(
                "truncate table risk_score, forecast, audit_event, alarm_event, "
                "access_event, incident, case_record, site restart identity cascade"
            )
        )

        conn.execute(
            text(
                """insert into site (site_code, name, region, country, city, site_type, timezone,
                       latitude, longitude, lighting_score, foot_traffic_score, camera_count,
                       perimeter_fenced, critical_asset)
                   values (:site_code, :name, :region, :country, :city, :site_type, :timezone,
                       :latitude, :longitude, :lighting_score, :foot_traffic_score, :camera_count,
                       :perimeter_fenced, :critical_asset)"""
            ),
            [site.__dict__ for site in sites],
        )

        conn.execute(
            text(
                """insert into case_record (id, case_number, title, case_type, status, priority,
                       assignee_email, site_code, region, opened_at, due_at, closed_at,
                       financial_impact, source_system, source_id, updated_at)
                   values (:id, :case_number, :title, :case_type, :status, :priority,
                       :assignee_email, :site_code, :region, :opened_at, :due_at, :closed_at,
                       :financial_impact, :source_system, :source_id, :updated_at)"""
            ),
            cases,
        )

        conn.execute(
            text(
                """insert into incident (id, source_system, source_id, site_code, region,
                       incident_type, severity, description, reported_by, occurred_at,
                       loss_amount, case_number, ingested_at)
                   values (:id, :source_system, :source_id, :site_code, :region, :incident_type,
                       :severity, :description, :reported_by, :occurred_at, :loss_amount,
                       :case_number, now())"""
            ),
            incidents,
        )

        _chunked_insert(
            conn,
            text(
                """insert into access_event (id, source_system, site_code, badge_hash, door_id,
                       result, event_time, after_hours, tailgate)
                   values (:id, :source_system, :site_code, :badge_hash, :door_id, :result,
                       :event_time, :after_hours, :tailgate)"""
            ),
            access_events,
        )

        _chunked_insert(
            conn,
            text(
                """insert into alarm_event (id, source_system, site_code, camera_id, alarm_type,
                       severity, event_time)
                   values (:id, :source_system, :site_code, :camera_id, :alarm_type, :severity,
                       :event_time)"""
            ),
            alarm_events,
        )


def _chunked_insert(conn, statement, rows, chunk_size: int = 5000) -> None:
    """Access logs run to hundreds of thousands of rows; one giant executemany blows up
    the driver's parameter buffer, so they go in batches."""
    for start in range(0, len(rows), chunk_size):
        conn.execute(statement, rows[start : start + chunk_size])


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate demo data for the hub")
    parser.add_argument(
        "--db-url", default="postgresql+psycopg2://gsih:gsih@localhost:5432/gsih"
    )
    parser.add_argument("--dry-run", action="store_true", help="generate and report, write nothing")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    now = datetime.now(timezone.utc).replace(microsecond=0)

    sites = build_sites(rng)
    incidents, access_events, alarm_events = build_events(rng, sites, now)
    cases = build_cases(rng, sites, incidents, now)

    vandalism = sum(1 for i in incidents if i["incident_type"] == "VANDALISM")
    print(
        f"sites={len(sites)} incidents={len(incidents)} (vandalism={vandalism}) "
        f"cases={len(cases)} access_events={len(access_events)} alarms={len(alarm_events)}"
    )

    if args.dry_run:
        print("dry run — nothing written")
        return

    write(args.db_url, sites, incidents, cases, access_events, alarm_events)
    print(f"written to {args.db_url.split('@')[-1]}")


if __name__ == "__main__":
    main()
