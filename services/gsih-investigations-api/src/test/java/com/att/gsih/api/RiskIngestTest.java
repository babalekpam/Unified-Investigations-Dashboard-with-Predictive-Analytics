package com.att.gsih.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.att.gsih.api.dto.RiskIngest.ForecastBatch;
import com.att.gsih.api.dto.RiskIngest.ForecastRow;
import com.att.gsih.api.dto.RiskIngest.ScoreBatch;
import com.att.gsih.api.dto.RiskIngest.ScoreRow;
import com.att.gsih.api.repo.RiskScoreRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.att.gsih.api.service.RiskService;
import com.att.gsih.common.model.Enums.RiskBand;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles({"local", "test"})
class RiskIngestTest {

  @Autowired RiskService riskService;
  @Autowired RiskScoreRepository riskScores;
  @Autowired SiteRepository sites;

  private static final LocalDate TODAY = LocalDate.of(2026, 8, 7);

  @BeforeEach
  void seed() {
    riskScores.deleteAll();
    sites.deleteAll();
    IntStream.rangeClosed(1, 20)
        .forEach(i -> sites.save(TestData.site("SITE-%02d".formatted(i), "SOUTHWEST")));
  }

  private ScoreBatch batchOf(int count) {
    // Descending scores are posted in ascending site order, so the service cannot rely on
    // the caller's ordering to get the ranking right.
    List<ScoreRow> rows =
        IntStream.rangeClosed(1, count)
            .mapToObj(
                i ->
                    new ScoreRow(
                        "SITE-%02d".formatted(i),
                        TODAY,
                        // Low absolute probabilities — what a calibrated rare-event model
                        // actually produces.
                        0.02 + (count - i) * 0.004,
                        "22:00-02:00",
                        Map.of("Poor site lighting", 0.6, "After-hours badge activity", 0.4)))
            .toList();
    return new ScoreBatch("vandalism-risk-1.0.0", rows);
  }

  @Test
  void bandsByRankSoLowProbabilitiesStillProduceAUsableHeatMap() {
    riskService.saveScores(batchOf(20));

    List<com.att.gsih.api.dto.Dashboards.RiskAlert> alerts =
        riskService.currentAlerts("SOUTHWEST", Integer.MAX_VALUE);

    assertThat(alerts).hasSize(20);
    // Every score is far below 0.33; an absolute threshold would band all twenty LOW.
    assertThat(alerts).allSatisfy(alert -> assertThat(alert.riskScore()).isLessThan(0.33));
    assertThat(alerts.stream().filter(a -> a.riskBand() == RiskBand.HIGH)).hasSize(2);
    assertThat(alerts.stream().filter(a -> a.riskBand() == RiskBand.MEDIUM)).hasSize(5);
    assertThat(alerts.stream().filter(a -> a.riskBand() == RiskBand.LOW)).hasSize(13);
    assertThat(alerts.get(0).siteCode()).isEqualTo("SITE-01");
  }

  @Test
  void rerunningTheSameDayOverwritesRatherThanDuplicating() {
    riskService.saveScores(batchOf(20));
    riskService.saveScores(batchOf(20));

    assertThat(riskScores.findAll()).hasSize(20);
    assertThat(riskScores.findBySiteCodeAndScoreDate("SITE-01", TODAY)).isPresent();
  }

  @Test
  void scoresForUnknownSitesAreDroppedNotStored() {
    ScoreBatch batch =
        new ScoreBatch(
            "vandalism-risk-1.0.0",
            List.of(new ScoreRow("SITE-DOES-NOT-EXIST", TODAY, 0.9, "22:00-02:00", Map.of())));

    assertThat(riskService.saveScores(batch)).isZero();
    assertThat(riskScores.findAll()).isEmpty();
  }

  @Test
  void factorExplanationsSurviveTheRoundTrip() {
    riskService.saveScores(batchOf(5));
    var top = riskService.currentAlerts("SOUTHWEST", 1).get(0);

    assertThat(top.topFactors()).isNotEmpty();
    assertThat(top.topFactors().get(0).name()).isEqualTo("Poor site lighting");
    assertThat(top.topFactors().get(0).contribution()).isEqualTo(0.6);
  }

  @Test
  void enterpriseForecastIsNotInterleavedWithTheRegionalCurves() {
    // The scoring job posts an enterprise curve (null region) plus one per region. Asking
    // for the enterprise curve must return only its own points.
    riskService.saveForecasts(
        new ForecastBatch(
            "vandalism-risk-1.0.0",
            List.of(
                new ForecastRow(null, null, 30, TODAY, 1.0, 0.5, 1.5),
                new ForecastRow(null, null, 30, TODAY.plusDays(1), 1.1, 0.5, 1.6),
                new ForecastRow(null, "SOUTHWEST", 30, TODAY, 0.4, 0.1, 0.7),
                new ForecastRow(null, "NORTHEAST", 30, TODAY, 0.3, 0.1, 0.6))));

    var enterprise = riskService.forecastCurve(null, null);
    var southwest = riskService.forecastCurve("SOUTHWEST", null);

    assertThat(enterprise).hasSize(2);
    assertThat(enterprise).extracting("predicted").containsExactly(1.0, 1.1);
    assertThat(southwest).hasSize(1);
    assertThat(southwest.get(0).predicted()).isEqualTo(0.4);
  }
}
