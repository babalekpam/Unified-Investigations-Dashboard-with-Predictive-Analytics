package com.att.gsih.api.domain;

import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.SourceSystem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** A canonical incident report — the labelled history the vandalism model trains on. */
@Entity
@Table(name = "incident")
public class Incident {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  @Column(name = "source_system")
  private SourceSystem sourceSystem;

  @Column(name = "source_id")
  private String sourceId;

  @Column(name = "site_code")
  private String siteCode;

  private String region;

  @Enumerated(EnumType.STRING)
  @Column(name = "incident_type")
  private IncidentType incidentType;

  private String severity;

  @Column(length = 2000)
  private String description;

  @Column(name = "reported_by")
  private String reportedBy;

  @Column(name = "occurred_at")
  private Instant occurredAt;

  @Column(name = "loss_amount")
  private BigDecimal lossAmount;

  @Column(name = "case_number")
  private String caseNumber;

  @Column(name = "ingested_at")
  private Instant ingestedAt;

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public SourceSystem getSourceSystem() {
    return sourceSystem;
  }

  public void setSourceSystem(SourceSystem sourceSystem) {
    this.sourceSystem = sourceSystem;
  }

  public String getSourceId() {
    return sourceId;
  }

  public void setSourceId(String sourceId) {
    this.sourceId = sourceId;
  }

  public String getSiteCode() {
    return siteCode;
  }

  public void setSiteCode(String siteCode) {
    this.siteCode = siteCode;
  }

  public String getRegion() {
    return region;
  }

  public void setRegion(String region) {
    this.region = region;
  }

  public IncidentType getIncidentType() {
    return incidentType;
  }

  public void setIncidentType(IncidentType incidentType) {
    this.incidentType = incidentType;
  }

  public String getSeverity() {
    return severity;
  }

  public void setSeverity(String severity) {
    this.severity = severity;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getReportedBy() {
    return reportedBy;
  }

  public void setReportedBy(String reportedBy) {
    this.reportedBy = reportedBy;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }

  public void setOccurredAt(Instant occurredAt) {
    this.occurredAt = occurredAt;
  }

  public BigDecimal getLossAmount() {
    return lossAmount;
  }

  public void setLossAmount(BigDecimal lossAmount) {
    this.lossAmount = lossAmount;
  }

  public String getCaseNumber() {
    return caseNumber;
  }

  public void setCaseNumber(String caseNumber) {
    this.caseNumber = caseNumber;
  }

  public Instant getIngestedAt() {
    return ingestedAt;
  }

  public void setIngestedAt(Instant ingestedAt) {
    this.ingestedAt = ingestedAt;
  }
}
