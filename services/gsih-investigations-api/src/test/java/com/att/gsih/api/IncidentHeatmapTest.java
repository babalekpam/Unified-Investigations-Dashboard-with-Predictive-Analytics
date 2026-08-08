package com.att.gsih.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.att.gsih.api.dto.Dashboards.HeatCell;
import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.IncidentRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.att.gsih.api.service.DashboardService;
import com.att.gsih.common.model.Enums.IncidentType;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * The weekday × hour heat map behind the "when do we get hit" panel.
 *
 * <p>The property that matters is local time. An estate spanning several zones is exactly the
 * case a database-side hour extraction gets wrong, so the bucketing happens in Java against
 * each site's own zone and is asserted here rather than assumed.
 */
@SpringBootTest
@ActiveProfiles({"local", "test"})
class IncidentHeatmapTest {

  @Autowired DashboardService dashboards;
  @Autowired IncidentRepository incidents;
  @Autowired SiteRepository sites;
  @Autowired CaseRepository cases;

  /** Wednesday 2026-03-04, 03:15 UTC — 21:15 Tuesday in Chicago, 12:15 Wednesday in Tokyo. */
  private static final Instant NIGHT_RAID = Instant.parse("2026-03-04T03:15:00Z");

  private static final Instant NOW = NIGHT_RAID.plus(10, ChronoUnit.DAYS);

  @BeforeEach
  void seed() {
    incidents.deleteAll();
    cases.deleteAll();
    sites.deleteAll();
    sites.save(TestData.site("DAL-1", "SOUTHWEST", "America/Chicago"));
    sites.save(TestData.site("TYO-1", "APAC", "Asia/Tokyo"));
    sites.save(TestData.site("NOZONE", "SOUTHWEST", null));
  }

  private static HeatCell cell(List<HeatCell> grid, int dayOfWeek, int hour) {
    return grid.stream()
        .filter(c -> c.dayOfWeek() == dayOfWeek && c.hour() == hour)
        .findFirst()
        .orElseThrow();
  }

  @Test
  void theSameInstantLandsInTheHourEachSiteActuallyExperienced() {
    incidents.save(TestData.incident("DAL-1", "SOUTHWEST", IncidentType.VANDALISM, NIGHT_RAID));
    incidents.save(TestData.incident("TYO-1", "APAC", IncidentType.VANDALISM, NIGHT_RAID));

    List<HeatCell> grid = dashboards.executiveView(NOW).incidentHeatmap();

    // Chicago: Tuesday (index 1) at 21:00. Tokyo: Wednesday (index 2) at 12:00.
    assertThat(cell(grid, 1, 21).count()).isEqualTo(1);
    assertThat(cell(grid, 2, 12).count()).isEqualTo(1);
    // And nowhere near the UTC hour, which is what a naive extract would have produced.
    assertThat(cell(grid, 2, 3).count()).isZero();
  }

  @Test
  void theGridIsAlwaysCompleteSoTheClientDrawsACalendarNotAScatter() {
    List<HeatCell> grid = dashboards.executiveView(NOW).incidentHeatmap();

    assertThat(grid).hasSize(7 * 24);
    assertThat(grid).allSatisfy(c -> assertThat(c.count()).isZero());
    assertThat(grid.stream().map(HeatCell::dayOfWeek).distinct()).hasSize(7);
    assertThat(grid.stream().map(HeatCell::hour).distinct()).hasSize(24);
  }

  @Test
  void aManagerSeesOnlyTheirOwnRegionsPattern() {
    incidents.save(TestData.incident("DAL-1", "SOUTHWEST", IncidentType.VANDALISM, NIGHT_RAID));
    incidents.save(TestData.incident("TYO-1", "APAC", IncidentType.VANDALISM, NIGHT_RAID));

    List<HeatCell> southwest = dashboards.managerView("SOUTHWEST", NOW).incidentHeatmap();

    assertThat(cell(southwest, 1, 21).count()).isEqualTo(1);
    assertThat(cell(southwest, 2, 12).count()).isZero();
  }

  @Test
  void aSiteWithNoTimezoneOnRecordIsPlacedInUtcRatherThanDropped() {
    incidents.save(TestData.incident("NOZONE", "SOUTHWEST", IncidentType.VANDALISM, NIGHT_RAID));

    List<HeatCell> grid = dashboards.executiveView(NOW).incidentHeatmap();

    // Wednesday 03:00 UTC, the raw instant.
    assertThat(cell(grid, 2, 3).count()).isEqualTo(1);
  }

  @Test
  void incidentsOlderThanTheWindowAreNotCounted() {
    incidents.save(
        TestData.incident(
            "DAL-1", "SOUTHWEST", IncidentType.VANDALISM, NOW.minus(200, ChronoUnit.DAYS)));

    List<HeatCell> grid = dashboards.executiveView(NOW).incidentHeatmap();

    assertThat(grid.stream().mapToLong(HeatCell::count).sum()).isZero();
  }
}
