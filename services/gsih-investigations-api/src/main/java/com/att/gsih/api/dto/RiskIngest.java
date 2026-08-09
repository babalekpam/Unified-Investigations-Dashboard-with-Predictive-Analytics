package com.att.gsih.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Payloads the analytics service posts back after a scoring run (Section 6.3, steps 3 and 4).
 *
 * <p>Both batches are idempotent on their natural key, so a re-run of the same Airflow task
 * overwrites rather than duplicates.
 */
public final class RiskIngest {

  private RiskIngest() {}

  public record ScoreBatch(
      @NotBlank String modelVersion, @NotEmpty @Valid List<ScoreRow> scores) {}

  public record ScoreRow(
      @NotBlank String siteCode,
      @NotNull LocalDate scoreDate,
      @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double riskScore,
      String peakWindow,
      Map<String, Double> topFactors) {}

  public record ForecastBatch(
      @NotBlank String modelVersion, @NotEmpty @Valid List<ForecastRow> points) {}

  public record ForecastRow(
      String siteCode,
      String region,
      @NotNull Integer horizonDays,
      @NotNull LocalDate forecastDate,
      @NotNull Double predictedIncidents,
      Double lowerBound,
      Double upperBound) {}
}
