-- Global Security Intelligence Hub — serving (gold) schema.
--
-- These tables are the read model behind the three dashboards. They are written only by the
-- ingest service and the Databricks gold job; no source system is ever written back to.

create table if not exists site (
    site_code          varchar(32) primary key,
    name               varchar(200) not null,
    region             varchar(64)  not null,
    country            varchar(64),
    city               varchar(120),
    site_type          varchar(64),
    -- IANA zone of the facility. After-hours access is judged in local time, never server time.
    timezone           varchar(64) default 'UTC',
    latitude           double precision,
    longitude          double precision,
    lighting_score     integer,
    foot_traffic_score integer,
    camera_count       integer,
    perimeter_fenced   boolean,
    critical_asset     boolean
);

create index if not exists idx_site_region on site (region);

create table if not exists case_record (
    id               uuid primary key,
    case_number      varchar(64) not null unique,
    title            varchar(500),
    case_type        varchar(32),
    status           varchar(32),
    priority         varchar(16),
    assignee_email   varchar(200),
    site_code        varchar(32),
    region           varchar(64),
    opened_at        timestamptz not null,
    due_at           timestamptz,
    closed_at        timestamptz,
    financial_impact numeric(14, 2),
    source_system    varchar(32),
    source_id        varchar(128),
    updated_at       timestamptz
);

-- The natural key from the system of record. Enforces idempotent upserts on every refresh.
create unique index if not exists uq_case_source on case_record (source_system, source_id);
create index if not exists idx_case_assignee on case_record (assignee_email, status);
create index if not exists idx_case_region_status on case_record (region, status);
create index if not exists idx_case_opened on case_record (opened_at desc);

create table if not exists incident (
    id            uuid primary key,
    source_system varchar(32),
    source_id     varchar(128),
    site_code     varchar(32),
    region        varchar(64),
    incident_type varchar(32),
    severity      varchar(16),
    description   varchar(2000),
    reported_by   varchar(200),
    occurred_at   timestamptz not null,
    loss_amount   numeric(14, 2),
    case_number   varchar(64),
    ingested_at   timestamptz
);

create unique index if not exists uq_incident_source on incident (source_system, source_id);
-- Drives both the repeat-incident flag and the model's per-site history lookup.
create index if not exists idx_incident_site_type_time on incident (site_code, incident_type, occurred_at desc);
create index if not exists idx_incident_region_time on incident (region, occurred_at desc);

create table if not exists access_event (
    id            uuid primary key,
    source_system varchar(32),
    site_code     varchar(32),
    badge_hash    varchar(128),
    door_id       varchar(64),
    result        varchar(16),
    event_time    timestamptz not null,
    after_hours   boolean,
    tailgate      boolean
);

create index if not exists idx_access_site_time on access_event (site_code, event_time desc);

create table if not exists alarm_event (
    id            uuid primary key,
    source_system varchar(32),
    site_code     varchar(32),
    camera_id     varchar(64),
    alarm_type    varchar(32),
    severity      varchar(16),
    event_time    timestamptz not null
);

create index if not exists idx_alarm_site_time on alarm_event (site_code, event_time desc);

create table if not exists risk_score (
    id            uuid primary key,
    site_code     varchar(32) not null,
    region        varchar(64),
    score_date    date        not null,
    risk_score    double precision not null,
    risk_band     varchar(16),
    peak_window   varchar(32),
    top_factors   varchar(2000),
    model_version varchar(64),
    generated_at  timestamptz
);

create unique index if not exists uq_risk_site_date on risk_score (site_code, score_date);
create index if not exists idx_risk_date_band on risk_score (score_date, risk_band);

create table if not exists forecast (
    id                  uuid primary key,
    site_code           varchar(32),
    region              varchar(64),
    horizon_days        integer not null,
    forecast_date       date    not null,
    predicted_incidents double precision,
    lower_bound         double precision,
    upper_bound         double precision,
    model_version       varchar(64),
    generated_at        timestamptz
);

create index if not exists idx_forecast_scope on forecast (region, site_code, forecast_date);

create table if not exists audit_event (
    id           uuid primary key,
    actor        varchar(200),
    actor_role   varchar(32),
    action       varchar(32),
    resource     varchar(120),
    query_detail varchar(1000),
    result_count integer,
    occurred_at  timestamptz not null
);

create index if not exists idx_audit_time on audit_event (occurred_at desc);
create index if not exists idx_audit_actor on audit_event (actor, occurred_at desc);
