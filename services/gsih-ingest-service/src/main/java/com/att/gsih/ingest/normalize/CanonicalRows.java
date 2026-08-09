package com.att.gsih.ingest.normalize;

import com.att.gsih.common.model.Enums.AccessResult;
import com.att.gsih.common.model.Enums.AlarmType;
import com.att.gsih.common.model.Enums.CasePriority;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.SourceSystem;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Warehouse-shaped rows produced by {@link Normalizer} and written by the JDBC sink. */
public final class CanonicalRows {

  private CanonicalRows() {}

  public record IncidentRow(
      UUID id,
      SourceSystem sourceSystem,
      String sourceId,
      String siteCode,
      IncidentType incidentType,
      String severity,
      String description,
      String reportedBy,
      Instant occurredAt,
      BigDecimal lossAmount,
      /** True when the vendor category was not in the mapping table and fell back to OTHER. */
      boolean unmappedCategory) {}

  public record CaseRow(
      UUID id,
      SourceSystem sourceSystem,
      String sourceId,
      String caseNumber,
      String title,
      IncidentType caseType,
      CaseStatus status,
      CasePriority priority,
      String assigneeEmail,
      String siteCode,
      Instant openedAt,
      Instant dueAt,
      Instant closedAt,
      BigDecimal financialImpact) {}

  public record AccessRow(
      UUID id,
      SourceSystem sourceSystem,
      String siteCode,
      String badgeHash,
      String doorId,
      AccessResult result,
      Instant eventTime,
      boolean afterHours,
      boolean tailgate) {}

  public record AlarmRow(
      UUID id,
      SourceSystem sourceSystem,
      String siteCode,
      String cameraId,
      AlarmType alarmType,
      String severity,
      Instant eventTime) {}
}
