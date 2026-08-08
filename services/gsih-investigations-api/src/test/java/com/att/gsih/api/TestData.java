package com.att.gsih.api;

import com.att.gsih.api.domain.CaseRecord;
import com.att.gsih.api.domain.Incident;
import com.att.gsih.api.domain.RiskScore;
import com.att.gsih.api.domain.Site;
import com.att.gsih.common.model.Enums.CasePriority;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.RiskBand;
import com.att.gsih.common.model.Enums.SourceSystem;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** Builders for a small, deliberately-shaped fixture set used across the API tests. */
final class TestData {

  private TestData() {}

  static Site site(String code, String region) {
    return site(code, region, "America/Chicago");
  }

  static Site site(String code, String region, String timezone) {
    Site s = new Site();
    s.setTimezone(timezone);
    s.setSiteCode(code);
    s.setName("Site " + code);
    s.setRegion(region);
    s.setCountry("US");
    s.setCity("Dallas");
    s.setSiteType("NETWORK_FACILITY");
    s.setLatitude(32.78);
    s.setLongitude(-96.80);
    s.setLightingScore(2);
    s.setFootTrafficScore(2);
    s.setCameraCount(4);
    s.setPerimeterFenced(true);
    s.setCriticalAsset(false);
    return s;
  }

  static CaseRecord openCase(
      String number, String assignee, String siteCode, String region, Instant openedAt) {
    CaseRecord c = new CaseRecord();
    c.setId(UUID.randomUUID());
    c.setCaseNumber(number);
    c.setTitle("Investigation " + number);
    c.setCaseType(IncidentType.VANDALISM);
    c.setStatus(CaseStatus.IN_PROGRESS);
    c.setPriority(CasePriority.HIGH);
    c.setAssigneeEmail(assignee);
    c.setSiteCode(siteCode);
    c.setRegion(region);
    c.setOpenedAt(openedAt);
    c.setDueAt(openedAt.plus(14, ChronoUnit.DAYS));
    c.setFinancialImpact(new BigDecimal("12500.00"));
    c.setSourceSystem(SourceSystem.CASE_IQ);
    c.setSourceId(number);
    c.setUpdatedAt(openedAt);
    return c;
  }

  static CaseRecord closedCase(
      String number, String region, Instant openedAt, Instant closedAt) {
    CaseRecord c = openCase(number, "closer@att.com", "SITE-1", region, openedAt);
    c.setStatus(CaseStatus.CLOSED);
    c.setClosedAt(closedAt);
    return c;
  }

  static Incident incident(String siteCode, String region, IncidentType type, Instant occurredAt) {
    Incident i = new Incident();
    i.setId(UUID.randomUUID());
    i.setSourceSystem(SourceSystem.D3_SECURITY);
    i.setSourceId(UUID.randomUUID().toString());
    i.setSiteCode(siteCode);
    i.setRegion(region);
    i.setIncidentType(type);
    i.setSeverity("MEDIUM");
    i.setDescription("Graffiti on the north perimeter wall");
    i.setOccurredAt(occurredAt);
    i.setLossAmount(new BigDecimal("800.00"));
    i.setIngestedAt(Instant.now());
    return i;
  }

  static RiskScore riskScore(
      String siteCode, String region, double score, RiskBand band, LocalDate date) {
    RiskScore r = new RiskScore();
    r.setId(UUID.randomUUID());
    r.setSiteCode(siteCode);
    r.setRegion(region);
    r.setScoreDate(date);
    r.setRiskScore(score);
    r.setRiskBand(band);
    r.setPeakWindow("22:00-02:00");
    r.setTopFactors("{\"prior_vandalism_90d\":0.41,\"after_hours_access\":0.22,\"low_lighting\":0.18}");
    r.setModelVersion("vandalism-gbm-1.4.0");
    r.setGeneratedAt(Instant.now());
    return r;
  }
}
