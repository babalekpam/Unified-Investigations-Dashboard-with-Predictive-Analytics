package com.att.gsih.api.dto;

import com.att.gsih.common.model.Enums.CasePriority;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.RiskBand;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Payloads for the three role-based views described in Section 7 of the proposal. */
public final class Dashboards {

  private Dashboards() {}

  public record CaseSummary(
      String caseNumber,
      String title,
      IncidentType caseType,
      CaseStatus status,
      CasePriority priority,
      String assigneeEmail,
      String siteCode,
      String region,
      Instant openedAt,
      Instant dueAt,
      Instant closedAt,
      long ageDays,
      boolean overdue,
      BigDecimal financialImpact,
      String sourceSystem) {}

  public record IncidentSummary(
      String id,
      String siteCode,
      String region,
      IncidentType incidentType,
      String severity,
      String description,
      Instant occurredAt,
      BigDecimal lossAmount,
      String caseNumber,
      String sourceSystem) {}

  /** Section 7.1 — personal queue, deadlines, repeat-incident flags, next steps. */
  public record InvestigatorView(
      String investigator,
      int openCases,
      int overdueTasks,
      double avgDaysInStatus,
      List<CaseSummary> queue,
      List<RepeatIncidentFlag> repeatIncidentFlags,
      List<RiskAlert> alerts) {}

  public record RepeatIncidentFlag(
      String siteCode,
      String siteName,
      IncidentType incidentType,
      int occurrencesLast90Days,
      Instant mostRecent,
      String relatedCaseNumber) {}

  /** Section 7.2 — workload distribution, aging, closure, escalations, regional risk. */
  public record ManagerView(
      String region,
      long openCases,
      long closedLast30Days,
      double closureRatePct,
      long escalations,
      double escalationRatePct,
      double avgResolutionDays,
      List<WorkloadRow> workload,
      List<AgingBucket> caseAging,
      List<TypeVolume> volumeByType,
      List<RiskAlert> vandalismAlerts) {}

  public record WorkloadRow(String assigneeEmail, long openCases, long overdue, double loadIndex) {}

  public record AgingBucket(String bucket, long caseCount) {}

  public record TypeVolume(IncidentType incidentType, long caseCount) {}

  /** Section 7.3 — enterprise posture, major investigations, hotspots, predicted trend. */
  public record ExecutiveView(
      long totalInvestigations,
      double avgResolutionDays,
      BigDecimal financialExposure,
      double yoyChangePct,
      List<RegionPosture> regions,
      List<CaseSummary> majorInvestigations,
      List<RiskAlert> topHotspots,
      List<ForecastPoint> vandalismForecast,
      RiskPosture riskPosture) {}

  public record RegionPosture(
      String region, long caseCount, BigDecimal financialImpact, long highRiskSites) {}

  public record RiskPosture(long highRiskSites, long mediumRiskSites, long lowRiskSites, LocalDate asOf) {}

  /** A site-level vandalism risk alert (Section 6.5). */
  public record RiskAlert(
      String siteCode,
      String siteName,
      String region,
      Double latitude,
      Double longitude,
      double riskScore,
      RiskBand riskBand,
      String peakWindow,
      List<Factor> topFactors,
      LocalDate scoreDate,
      String modelVersion) {}

  public record Factor(String name, double contribution) {}

  public record ForecastPoint(
      LocalDate date, double predicted, double lower, double upper, int horizonDays) {}
}
