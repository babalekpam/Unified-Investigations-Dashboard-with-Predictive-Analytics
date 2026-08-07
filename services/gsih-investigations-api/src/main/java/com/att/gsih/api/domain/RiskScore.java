package com.att.gsih.api.domain;

import com.att.gsih.common.model.Enums.RiskBand;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A site-day vandalism risk score written by the analytics service (Section 6.3, step 3).
 *
 * <p>{@code topFactors} carries the per-site contribution breakdown as JSON so the dashboard can
 * answer "why is this site high risk?" without calling the model again.
 */
@Entity
@Table(name = "risk_score")
public class RiskScore {

  @Id private UUID id;

  @Column(name = "site_code", nullable = false)
  private String siteCode;

  private String region;

  /** The day the score applies to, not the day it was computed. */
  @Column(name = "score_date", nullable = false)
  private LocalDate scoreDate;

  @Column(name = "risk_score", nullable = false)
  private Double riskScore;

  @Enumerated(EnumType.STRING)
  @Column(name = "risk_band")
  private RiskBand riskBand;

  /** Highest-risk window of the day, e.g. "22:00-02:00". */
  @Column(name = "peak_window")
  private String peakWindow;

  @Column(name = "top_factors", length = 2000)
  private String topFactors;

  @Column(name = "model_version")
  private String modelVersion;

  @Column(name = "generated_at")
  private Instant generatedAt;

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
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

  public LocalDate getScoreDate() {
    return scoreDate;
  }

  public void setScoreDate(LocalDate scoreDate) {
    this.scoreDate = scoreDate;
  }

  public Double getRiskScore() {
    return riskScore;
  }

  public void setRiskScore(Double riskScore) {
    this.riskScore = riskScore;
  }

  public RiskBand getRiskBand() {
    return riskBand;
  }

  public void setRiskBand(RiskBand riskBand) {
    this.riskBand = riskBand;
  }

  public String getPeakWindow() {
    return peakWindow;
  }

  public void setPeakWindow(String peakWindow) {
    this.peakWindow = peakWindow;
  }

  public String getTopFactors() {
    return topFactors;
  }

  public void setTopFactors(String topFactors) {
    this.topFactors = topFactors;
  }

  public String getModelVersion() {
    return modelVersion;
  }

  public void setModelVersion(String modelVersion) {
    this.modelVersion = modelVersion;
  }

  public Instant getGeneratedAt() {
    return generatedAt;
  }

  public void setGeneratedAt(Instant generatedAt) {
    this.generatedAt = generatedAt;
  }
}
