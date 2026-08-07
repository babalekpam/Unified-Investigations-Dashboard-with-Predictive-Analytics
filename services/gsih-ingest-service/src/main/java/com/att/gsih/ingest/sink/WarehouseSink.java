package com.att.gsih.ingest.sink;

import com.att.gsih.ingest.normalize.CanonicalRows.AccessRow;
import com.att.gsih.ingest.normalize.CanonicalRows.AlarmRow;
import com.att.gsih.ingest.normalize.CanonicalRows.CaseRow;
import com.att.gsih.ingest.normalize.CanonicalRows.IncidentRow;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Section 5.2, Step 3 — Load.
 *
 * <p>Every statement is an upsert on the record's natural key, so re-reading a Kafka partition after
 * a consumer restart converges on the same warehouse state instead of double-counting an incident
 * into the KPIs.
 */
@Component
public class WarehouseSink {

  private final JdbcTemplate jdbc;
  private final SiteDirectory sites;

  public WarehouseSink(JdbcTemplate jdbc, SiteDirectory sites) {
    this.jdbc = jdbc;
    this.sites = sites;
  }

  @Transactional
  public void writeIncidents(List<IncidentRow> rows) {
    jdbc.batchUpdate(
        """
        insert into incident (id, source_system, source_id, site_code, region, incident_type,
                              severity, description, reported_by, occurred_at, loss_amount, ingested_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do update set
            site_code     = excluded.site_code,
            region        = excluded.region,
            incident_type = excluded.incident_type,
            severity      = excluded.severity,
            description   = excluded.description,
            reported_by   = excluded.reported_by,
            occurred_at   = excluded.occurred_at,
            loss_amount   = excluded.loss_amount,
            ingested_at   = excluded.ingested_at
        """,
        rows,
        rows.size(),
        (ps, row) -> {
          ps.setObject(1, row.id());
          ps.setString(2, row.sourceSystem().name());
          ps.setString(3, row.sourceId());
          ps.setString(4, row.siteCode());
          ps.setString(5, sites.regionOf(row.siteCode()));
          ps.setString(6, row.incidentType().name());
          ps.setString(7, row.severity());
          ps.setString(8, row.description());
          ps.setString(9, row.reportedBy());
          ps.setTimestamp(10, timestamp(row.occurredAt()));
          ps.setBigDecimal(11, row.lossAmount());
          ps.setTimestamp(12, Timestamp.from(Instant.now()));
        });
  }

  @Transactional
  public void writeCases(List<CaseRow> rows) {
    jdbc.batchUpdate(
        """
        insert into case_record (id, case_number, title, case_type, status, priority, assignee_email,
                                 site_code, region, opened_at, due_at, closed_at, financial_impact,
                                 source_system, source_id, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do update set
            case_number      = excluded.case_number,
            title            = excluded.title,
            case_type        = excluded.case_type,
            status           = excluded.status,
            priority         = excluded.priority,
            assignee_email   = excluded.assignee_email,
            site_code        = excluded.site_code,
            region           = excluded.region,
            opened_at        = excluded.opened_at,
            due_at           = excluded.due_at,
            closed_at        = excluded.closed_at,
            financial_impact = excluded.financial_impact,
            updated_at       = excluded.updated_at
        """,
        rows,
        rows.size(),
        (ps, row) -> {
          ps.setObject(1, row.id());
          ps.setString(2, row.caseNumber());
          ps.setString(3, row.title());
          ps.setString(4, row.caseType().name());
          ps.setString(5, row.status().name());
          ps.setString(6, row.priority().name());
          ps.setString(7, row.assigneeEmail());
          ps.setString(8, row.siteCode());
          ps.setString(9, sites.regionOf(row.siteCode()));
          ps.setTimestamp(10, timestamp(row.openedAt()));
          ps.setTimestamp(11, timestamp(row.dueAt()));
          ps.setTimestamp(12, timestamp(row.closedAt()));
          ps.setBigDecimal(13, row.financialImpact());
          ps.setString(14, row.sourceSystem().name());
          ps.setString(15, row.sourceId());
          ps.setTimestamp(16, Timestamp.from(Instant.now()));
        });
  }

  @Transactional
  public void writeAccessEvents(List<AccessRow> rows) {
    jdbc.batchUpdate(
        """
        insert into access_event (id, source_system, site_code, badge_hash, door_id, result,
                                  event_time, after_hours, tailgate)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do nothing
        """,
        rows,
        rows.size(),
        (ps, row) -> {
          ps.setObject(1, row.id());
          ps.setString(2, row.sourceSystem().name());
          ps.setString(3, row.siteCode());
          ps.setString(4, row.badgeHash());
          ps.setString(5, row.doorId());
          ps.setString(6, row.result().name());
          ps.setTimestamp(7, timestamp(row.eventTime()));
          ps.setBoolean(8, row.afterHours());
          ps.setBoolean(9, row.tailgate());
        });
  }

  @Transactional
  public void writeAlarmEvents(List<AlarmRow> rows) {
    jdbc.batchUpdate(
        """
        insert into alarm_event (id, source_system, site_code, camera_id, alarm_type, severity, event_time)
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do nothing
        """,
        rows,
        rows.size(),
        (ps, row) -> {
          ps.setObject(1, row.id());
          ps.setString(2, row.sourceSystem().name());
          ps.setString(3, row.siteCode());
          ps.setString(4, row.cameraId());
          ps.setString(5, row.alarmType().name());
          ps.setString(6, row.severity());
          ps.setTimestamp(7, timestamp(row.eventTime()));
        });
  }

  private static Timestamp timestamp(Instant instant) {
    return instant == null ? null : Timestamp.from(instant);
  }
}
