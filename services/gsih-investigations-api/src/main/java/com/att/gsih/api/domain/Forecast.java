package com.att.gsih.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A 30 / 60 / 90-day incident trend projection (Section 6.5) produced by the time-series model.
 *
 * <p>Stored with its prediction interval so the executive view can show uncertainty rather than a
 * single number the business would read as a promise.
 */
@Entity
@Table(name = "forecast")
public class Forecast {

  @Id private UUID id;

  /** Null for the enterprise-wide roll-up. */
  @Column(name = "site_code")
  private String siteCode;

  private String region;

  @Column(name = "horizon_days", nullable = false)
  private Integer horizonDays;

  @Column(name = "forecast_date", nullable = false)
  private LocalDate forecastDate;

  @Column(name = "predicted_incidents")
  private Double predictedIncidents;

  @Column(name = "lower_bound")
  private Double lowerBound;

  @Column(name = "upper_bound")
  private Double upperBound;

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

  public Integer getHorizonDays() {
    return horizonDays;
  }

  public void setHorizonDays(Integer horizonDays) {
    this.horizonDays = horizonDays;
  }

  public LocalDate getForecastDate() {
    return forecastDate;
  }

  public void setForecastDate(LocalDate forecastDate) {
    this.forecastDate = forecastDate;
  }

  public Double getPredictedIncidents() {
    return predictedIncidents;
  }

  public void setPredictedIncidents(Double predictedIncidents) {
    this.predictedIncidents = predictedIncidents;
  }

  public Double getLowerBound() {
    return lowerBound;
  }

  public void setLowerBound(Double lowerBound) {
    this.lowerBound = lowerBound;
  }

  public Double getUpperBound() {
    return upperBound;
  }

  public void setUpperBound(Double upperBound) {
    this.upperBound = upperBound;
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
