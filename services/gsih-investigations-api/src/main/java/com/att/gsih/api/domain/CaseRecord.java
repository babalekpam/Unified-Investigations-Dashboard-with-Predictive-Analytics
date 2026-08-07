package com.att.gsih.api.domain;

import com.att.gsih.common.model.Enums.CasePriority;
import com.att.gsih.common.model.Enums.CaseStatus;
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

/**
 * A canonical investigation case, consolidated from the case management systems of Section 4.1.
 *
 * <p>The row is a read-model: the hub never writes back to the system of record. {@code sourceSystem
 * + sourceId} is the natural key used for idempotent upserts on every refresh.
 */
@Entity
@Table(name = "case_record")
public class CaseRecord {

  @Id
  @Column(name = "id")
  private UUID id;

  @Column(name = "case_number", nullable = false, unique = true)
  private String caseNumber;

  private String title;

  @Enumerated(EnumType.STRING)
  @Column(name = "case_type")
  private IncidentType caseType;

  @Enumerated(EnumType.STRING)
  private CaseStatus status;

  @Enumerated(EnumType.STRING)
  private CasePriority priority;

  @Column(name = "assignee_email")
  private String assigneeEmail;

  @Column(name = "site_code")
  private String siteCode;

  private String region;

  @Column(name = "opened_at")
  private Instant openedAt;

  @Column(name = "due_at")
  private Instant dueAt;

  @Column(name = "closed_at")
  private Instant closedAt;

  @Column(name = "financial_impact")
  private BigDecimal financialImpact;

  @Enumerated(EnumType.STRING)
  @Column(name = "source_system")
  private SourceSystem sourceSystem;

  @Column(name = "source_id")
  private String sourceId;

  @Column(name = "updated_at")
  private Instant updatedAt;

  /** Days the case has been open, or its total lifetime once closed. */
  public long ageDays(Instant now) {
    Instant end = closedAt != null ? closedAt : now;
    return java.time.Duration.between(openedAt, end).toDays();
  }

  public boolean isOverdue(Instant now) {
    return status != CaseStatus.CLOSED && dueAt != null && dueAt.isBefore(now);
  }

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public String getCaseNumber() {
    return caseNumber;
  }

  public void setCaseNumber(String caseNumber) {
    this.caseNumber = caseNumber;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public IncidentType getCaseType() {
    return caseType;
  }

  public void setCaseType(IncidentType caseType) {
    this.caseType = caseType;
  }

  public CaseStatus getStatus() {
    return status;
  }

  public void setStatus(CaseStatus status) {
    this.status = status;
  }

  public CasePriority getPriority() {
    return priority;
  }

  public void setPriority(CasePriority priority) {
    this.priority = priority;
  }

  public String getAssigneeEmail() {
    return assigneeEmail;
  }

  public void setAssigneeEmail(String assigneeEmail) {
    this.assigneeEmail = assigneeEmail;
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

  public Instant getOpenedAt() {
    return openedAt;
  }

  public void setOpenedAt(Instant openedAt) {
    this.openedAt = openedAt;
  }

  public Instant getDueAt() {
    return dueAt;
  }

  public void setDueAt(Instant dueAt) {
    this.dueAt = dueAt;
  }

  public Instant getClosedAt() {
    return closedAt;
  }

  public void setClosedAt(Instant closedAt) {
    this.closedAt = closedAt;
  }

  public BigDecimal getFinancialImpact() {
    return financialImpact;
  }

  public void setFinancialImpact(BigDecimal financialImpact) {
    this.financialImpact = financialImpact;
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

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Instant updatedAt) {
    this.updatedAt = updatedAt;
  }
}
