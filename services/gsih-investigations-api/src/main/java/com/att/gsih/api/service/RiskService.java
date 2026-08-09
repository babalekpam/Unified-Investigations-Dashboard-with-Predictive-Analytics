package com.att.gsih.api.service;

import com.att.gsih.api.domain.Forecast;
import com.att.gsih.api.domain.RiskScore;
import com.att.gsih.api.domain.Site;
import com.att.gsih.api.dto.Dashboards.Factor;
import com.att.gsih.api.dto.Dashboards.ForecastPoint;
import com.att.gsih.api.dto.Dashboards.RiskAlert;
import com.att.gsih.api.dto.Dashboards.RiskPosture;
import com.att.gsih.api.repo.ForecastRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.att.gsih.api.repo.RiskScoreRepository;
import com.att.gsih.common.model.Enums.RiskBand;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads the output of the predictive layer (Section 6) and joins it to facility data so the
 * dashboards can plot a heat map and explain each score.
 *
 * <p>This service never runs a model. Scoring happens in the analytics service on the schedule set
 * by Airflow; the API only serves what has already been written to the warehouse, which keeps the
 * dashboard's latency independent of model runtime.
 */
@Service
public class RiskService {

  private static final Logger log = LoggerFactory.getLogger(RiskService.class);

  private final RiskScoreRepository riskScores;
  private final ForecastRepository forecasts;
  private final SiteRepository sites;
  private final ObjectMapper objectMapper;

  public RiskService(
      RiskScoreRepository riskScores,
      ForecastRepository forecasts,
      SiteRepository sites,
      ObjectMapper objectMapper) {
    this.riskScores = riskScores;
    this.forecasts = forecasts;
    this.sites = sites;
    this.objectMapper = objectMapper;
  }

  /** The most recent scoring date present in the warehouse, if the model has ever run. */
  @Transactional(readOnly = true)
  public Optional<LocalDate> latestScoreDate() {
    return riskScores.latestScoreDate();
  }

  /** Current risk alerts for a region (null = enterprise), highest score first. */
  @Transactional(readOnly = true)
  public List<RiskAlert> currentAlerts(String region, int limit) {
    Optional<LocalDate> date = riskScores.latestScoreDate();
    if (date.isEmpty()) {
      log.debug("no risk scores present yet — predictive layer has not run");
      return List.of();
    }
    Map<String, Site> siteIndex =
        sites.findAll().stream().collect(Collectors.toMap(Site::getSiteCode, Function.identity()));
    return riskScores.scoresFor(date.get(), region).stream()
        .sorted(Comparator.comparingDouble(RiskScore::getRiskScore).reversed())
        .limit(limit)
        .map(score -> toAlert(score, siteIndex.get(score.getSiteCode())))
        .toList();
  }

  /** Alerts restricted to a specific set of sites — used by the investigator view. */
  @Transactional(readOnly = true)
  public List<RiskAlert> alertsForSites(List<String> siteCodes) {
    if (siteCodes.isEmpty()) {
      return List.of();
    }
    return currentAlerts(null, Integer.MAX_VALUE).stream()
        .filter(alert -> siteCodes.contains(alert.siteCode()))
        .filter(alert -> alert.riskBand() != RiskBand.LOW)
        .toList();
  }

  @Transactional(readOnly = true)
  public RiskPosture posture(String region) {
    LocalDate date = riskScores.latestScoreDate().orElse(null);
    if (date == null) {
      return new RiskPosture(0, 0, 0, null);
    }
    return new RiskPosture(
        riskScores.countByBand(date, RiskBand.HIGH, region),
        riskScores.countByBand(date, RiskBand.MEDIUM, region),
        riskScores.countByBand(date, RiskBand.LOW, region),
        date);
  }

  /** The 30 / 60 / 90-day projection of Section 6.5. */
  @Transactional(readOnly = true)
  public List<ForecastPoint> forecastCurve(String region, String siteCode) {
    // Only from today forward: a superseded run's past-dated points are not a forecast.
    return forecasts.curve(region, siteCode, LocalDate.now()).stream()
        .map(
            (Forecast f) ->
                new ForecastPoint(
                    f.getForecastDate(),
                    round(f.getPredictedIncidents()),
                    round(f.getLowerBound()),
                    round(f.getUpperBound()),
                    f.getHorizonDays()))
        .toList();
  }

  @Transactional(readOnly = true)
  public List<RiskAlert> siteHistory(String siteCode) {
    Site site = sites.findById(siteCode).orElse(null);
    return riskScores.findBySiteCodeOrderByScoreDateDesc(siteCode).stream()
        .map(score -> toAlert(score, site))
        .toList();
  }

  /**
   * Persists a scoring run. Existing rows for the same site and date are overwritten so a re-run of
   * the Airflow task is safe.
   *
   * @return the number of rows written
   */
  @Transactional
  public int saveScores(com.att.gsih.api.dto.RiskIngest.ScoreBatch batch) {
    Map<String, Site> siteIndex =
        sites.findAll().stream().collect(Collectors.toMap(Site::getSiteCode, Function.identity()));
    List<RiskScore> rows = new java.util.ArrayList<>();

    // Bands are relative to the run, so the whole batch has to be ranked before any row
    // is written. Ordering here — rather than trusting the caller's order — means the
    // band is correct even if the scoring job posts in site-code order.
    List<com.att.gsih.api.dto.RiskIngest.ScoreRow> ranked =
        batch.scores().stream()
            .sorted(
                Comparator.comparingDouble(
                        (com.att.gsih.api.dto.RiskIngest.ScoreRow r) -> r.riskScore())
                    .reversed())
            .toList();
    int total = ranked.size();
    int rank = -1;

    for (com.att.gsih.api.dto.RiskIngest.ScoreRow row : ranked) {
      rank++;
      Site site = siteIndex.get(row.siteCode());
      if (site == null) {
        // A score for a site the facilities feed does not know about points at a stale site list;
        // it is skipped rather than stored so the heat map cannot plot a location we cannot place.
        log.warn("dropping score for unknown site {}", row.siteCode());
        continue;
      }
      RiskScore entity =
          riskScores
              .findBySiteCodeAndScoreDate(row.siteCode(), row.scoreDate())
              .orElseGet(
                  () -> {
                    RiskScore fresh = new RiskScore();
                    fresh.setId(java.util.UUID.randomUUID());
                    fresh.setSiteCode(row.siteCode());
                    fresh.setScoreDate(row.scoreDate());
                    return fresh;
                  });
      entity.setRegion(site.getRegion());
      entity.setRiskScore(row.riskScore());
      entity.setRiskBand(RiskBand.fromRank(rank, total));
      entity.setPeakWindow(row.peakWindow());
      entity.setTopFactors(writeFactors(row.topFactors()));
      entity.setModelVersion(batch.modelVersion());
      entity.setGeneratedAt(java.time.Instant.now());
      rows.add(entity);
    }
    riskScores.saveAll(rows);
    log.info("stored {} risk scores from model {}", rows.size(), batch.modelVersion());
    return rows.size();
  }

  /** Replaces the stored projection for each site / horizon combination in the batch. */
  @Transactional
  public int saveForecasts(com.att.gsih.api.dto.RiskIngest.ForecastBatch batch) {
    // Replace each scope rather than merging into it. Upserting by date alone left every
    // point from a previous, longer run in place, so the stored curve grew a tail of
    // past-dated points that no run had produced together.
    batch.points().stream()
        .map(row -> forecastScope(row.siteCode(), row.region()))
        .distinct()
        .forEach(scope -> forecasts.deleteScope(scope[1], scope[0]));

    List<Forecast> rows = new java.util.ArrayList<>();
    for (com.att.gsih.api.dto.RiskIngest.ForecastRow row : batch.points()) {
      Forecast f = new Forecast();
      f.setId(java.util.UUID.randomUUID());
      f.setSiteCode(row.siteCode());
      f.setRegion(row.region());
      f.setHorizonDays(row.horizonDays());
      f.setForecastDate(row.forecastDate());
      f.setPredictedIncidents(row.predictedIncidents());
      f.setLowerBound(row.lowerBound());
      f.setUpperBound(row.upperBound());
      f.setModelVersion(batch.modelVersion());
      f.setGeneratedAt(java.time.Instant.now());
      rows.add(f);
    }
    forecasts.saveAll(rows);
    return rows.size();
  }

  /** {siteCode, region} — the pair a single projection run owns. */
  private static String[] forecastScope(String siteCode, String region) {
    return new String[] {siteCode, region};
  }

  private String writeFactors(Map<String, Double> factors) {
    if (factors == null || factors.isEmpty()) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(factors);
    } catch (Exception ex) {
      log.warn("could not serialise factor contributions: {}", ex.getMessage());
      return null;
    }
  }

  private RiskAlert toAlert(RiskScore score, Site site) {
    return new RiskAlert(
        score.getSiteCode(),
        site != null ? site.getName() : score.getSiteCode(),
        score.getRegion(),
        site != null ? site.getLatitude() : null,
        site != null ? site.getLongitude() : null,
        score.getRiskScore(),
        score.getRiskBand(),
        score.getPeakWindow(),
        parseFactors(score.getTopFactors()),
        score.getScoreDate(),
        score.getModelVersion());
  }

  /**
   * Turns the model's factor-contribution JSON into an ordered list.
   *
   * <p>A malformed or missing payload degrades to "no explanation available" rather than failing the
   * whole dashboard request — the score itself is still useful to the manager.
   */
  private List<Factor> parseFactors(String json) {
    if (json == null || json.isBlank()) {
      return List.of();
    }
    try {
      Map<String, Double> parsed = objectMapper.readValue(json, new TypeReference<>() {});
      return parsed.entrySet().stream()
          .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
          .map(e -> new Factor(e.getKey(), e.getValue()))
          .toList();
    } catch (Exception ex) {
      log.warn("unreadable top_factors payload, serving score without explanation: {}", ex.getMessage());
      return List.of();
    }
  }

  private static double round(Double value) {
    return value == null ? 0d : Math.round(value * 100d) / 100d;
  }
}
