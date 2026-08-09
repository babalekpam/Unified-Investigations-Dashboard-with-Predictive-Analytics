package com.att.gsih.api.service;

import com.att.gsih.api.domain.CaseRecord;
import com.att.gsih.api.domain.Incident;
import com.att.gsih.api.domain.Site;
import com.att.gsih.api.dto.Dashboards.AgingBucket;
import com.att.gsih.api.dto.Dashboards.CaseSummary;
import com.att.gsih.api.dto.Dashboards.ExecutiveView;
import com.att.gsih.api.dto.Dashboards.HeatCell;
import com.att.gsih.api.dto.Dashboards.InvestigatorView;
import com.att.gsih.api.dto.Dashboards.ManagerView;
import com.att.gsih.api.dto.Dashboards.RegionPosture;
import com.att.gsih.api.dto.Dashboards.RepeatIncidentFlag;
import com.att.gsih.api.dto.Dashboards.RiskAlert;
import com.att.gsih.api.dto.Dashboards.TypeVolume;
import com.att.gsih.api.dto.Dashboards.WorkloadRow;
import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.IncidentRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.RiskBand;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the three role-based dashboards of Section 7.
 *
 * <p>Every KPI here is computed from the canonical warehouse tables, which is the point of the hub:
 * "open cases" means the same thing to an investigator, their manager and the executive reading the
 * quarterly posture, because all three numbers come from the same rows.
 */
@Service
public class DashboardService {

  /** The window used for "recent activity" KPIs across all three views. */
  private static final int KPI_WINDOW_DAYS = 30;

  /**
   * The heat map reads six months, not the 30-day KPI window.
   *
   * <p>168 cells need enough events to show a shape: a month of incidents spread over a
   * weekday × hour grid is mostly empty cells and a few ones, which reads as noise. Half a
   * year is long enough for the after-hours ridge to separate from the daytime floor and
   * short enough that a change in patrol pattern still shows up.
   */
  private static final int HEATMAP_WINDOW_DAYS = 180;

  /** A site is flagged as a repeat target at this many same-type incidents in 90 days. */
  static final int REPEAT_INCIDENT_THRESHOLD = 3;

  private final CaseRepository cases;
  private final IncidentRepository incidents;
  private final SiteRepository sites;
  private final RiskService riskService;

  public DashboardService(
      CaseRepository cases,
      IncidentRepository incidents,
      SiteRepository sites,
      RiskService riskService) {
    this.cases = cases;
    this.incidents = incidents;
    this.sites = sites;
    this.riskService = riskService;
  }

  /* ------------------------------------------------------------------ Section 7.1 */

  @Transactional(readOnly = true)
  public InvestigatorView investigatorView(String email, String regionScope, Instant now) {
    List<CaseRecord> queue =
        cases.openQueueFor(email, CaseStatus.CLOSED, regionScope).stream()
            .sorted(
                Comparator.comparing((CaseRecord c) -> c.getPriority().ordinal())
                    .reversed()
                    .thenComparing(
                        CaseRecord::getDueAt, Comparator.nullsLast(Comparator.naturalOrder())))
            .toList();

    long overdue = queue.stream().filter(c -> c.isOverdue(now)).count();
    double avgAge =
        queue.stream().mapToLong(c -> c.ageDays(now)).average().orElse(0d);

    List<String> siteCodes = queue.stream().map(CaseRecord::getSiteCode).distinct().toList();

    return new InvestigatorView(
        email,
        queue.size(),
        (int) overdue,
        round(avgAge),
        queue.stream().map(this::toSummary).toList(),
        repeatIncidentFlags(queue, now),
        riskService.alertsForSites(siteCodes));
  }

  /**
   * Flags sites where the investigator already holds a case and the same incident type keeps
   * recurring — the "related incident flag" of Section 7.1.
   */
  private List<RepeatIncidentFlag> repeatIncidentFlags(List<CaseRecord> queue, Instant now) {
    Instant since = now.minus(90, ChronoUnit.DAYS);
    Map<String, Site> siteIndex =
        sites.findAll().stream().collect(Collectors.toMap(Site::getSiteCode, Function.identity()));

    List<RepeatIncidentFlag> flags = new ArrayList<>();
    // Distinct (site, type) pairs so an investigator holding three cases at one site is told once.
    queue.stream()
        .filter(c -> c.getSiteCode() != null && c.getCaseType() != null)
        .collect(
            Collectors.toMap(
                c -> c.getSiteCode() + "|" + c.getCaseType(),
                Function.identity(),
                (a, b) -> a,
                LinkedHashMap::new))
        .values()
        .forEach(
            c -> {
              List<Incident> related =
                  incidents
                      .findBySiteCodeAndIncidentTypeAndOccurredAtAfterOrderByOccurredAtDesc(
                          c.getSiteCode(), c.getCaseType(), since);
              if (related.size() >= REPEAT_INCIDENT_THRESHOLD) {
                Site site = siteIndex.get(c.getSiteCode());
                flags.add(
                    new RepeatIncidentFlag(
                        c.getSiteCode(),
                        site != null ? site.getName() : c.getSiteCode(),
                        c.getCaseType(),
                        related.size(),
                        related.get(0).getOccurredAt(),
                        c.getCaseNumber()));
              }
            });
    flags.sort(Comparator.comparingInt(RepeatIncidentFlag::occurrencesLast90Days).reversed());
    return flags;
  }

  /* ------------------------------------------------------------------ Section 7.2 */

  @Transactional(readOnly = true)
  public ManagerView managerView(String region, Instant now) {
    Instant since = now.minus(KPI_WINDOW_DAYS, ChronoUnit.DAYS);

    long open = cases.countOpen(CaseStatus.CLOSED, region);
    long closed = cases.countClosedSince(CaseStatus.CLOSED, since, region);
    long escalated = cases.countEscalated(CaseStatus.ESCALATED, region);

    // Closure rate is closed / (closed + still open) over the window — the definition agreed in
    // discovery, so it cannot exceed 100% on a quiet month the way closed/opened can.
    double closureRate = open + closed == 0 ? 0d : (closed * 100d) / (open + closed);
    double escalationRate = open == 0 ? 0d : (escalated * 100d) / open;

    List<WorkloadRow> workload = workload(region, now);

    return new ManagerView(
        region,
        open,
        closed,
        round(closureRate),
        escalated,
        round(escalationRate),
        avgResolutionDays(region, since),
        workload,
        agingBuckets(region, now),
        cases.volumeByType(since, region).stream()
            .map(row -> new TypeVolume((IncidentType) row[0], (Long) row[1]))
            .toList(),
        riskService.currentAlerts(region, 10),
        incidentHeatmap(region, now));
  }

  /**
   * Incidents by weekday and hour over the last six months, in each site's own local time.
   *
   * <p>This is the observed counterpart to the model's predicted patrol window: the model
   * says a site is likely to be hit, the heat map says when the estate is actually being hit.
   * A supervisor rosters against the second and deploys against the first.
   */
  private List<HeatCell> incidentHeatmap(String region, Instant now) {
    Instant since = now.minus(HEATMAP_WINDOW_DAYS, ChronoUnit.DAYS);
    long[][] grid = new long[7][24];

    for (Object[] row : incidents.occurrenceLocalTimes(since, region)) {
      Instant occurredAt = (Instant) row[0];
      if (occurredAt == null) {
        continue;
      }
      ZonedDateTime local = occurredAt.atZone(zoneOf((String) row[1]));
      grid[local.getDayOfWeek().getValue() - 1][local.getHour()]++;
    }

    List<HeatCell> cells = new ArrayList<>(7 * 24);
    for (int day = 0; day < 7; day++) {
      for (int hour = 0; hour < 24; hour++) {
        cells.add(new HeatCell(day, hour, grid[day][hour]));
      }
    }
    return cells;
  }

  /** A site with no timezone on record, or a bad one, falls back to UTC rather than failing. */
  private static ZoneId zoneOf(String timezone) {
    if (timezone == null || timezone.isBlank()) {
      return ZoneOffset.UTC;
    }
    try {
      return ZoneId.of(timezone);
    } catch (DateTimeException unknownZone) {
      return ZoneOffset.UTC;
    }
  }

  private List<WorkloadRow> workload(String region, Instant now) {
    Map<String, Long> overdueByAssignee =
        cases.search(region, null, null, org.springframework.data.domain.Pageable.unpaged())
            .stream()
            .filter(c -> c.isOverdue(now))
            .collect(
                Collectors.groupingBy(
                    c -> c.getAssigneeEmail() == null ? "unassigned" : c.getAssigneeEmail(),
                    Collectors.counting()));

    List<Object[]> rows = cases.workloadByAssignee(CaseStatus.CLOSED, region);
    double mean =
        rows.stream().mapToLong(r -> (Long) r[1]).average().orElse(0d);

    return rows.stream()
        .map(
            r -> {
              String assignee = r[0] == null ? "unassigned" : (String) r[0];
              long openCases = (Long) r[1];
              // Load index > 1.0 means this investigator is carrying more than the team average.
              double loadIndex = mean == 0 ? 0d : openCases / mean;
              return new WorkloadRow(
                  assignee, openCases, overdueByAssignee.getOrDefault(assignee, 0L), round(loadIndex));
            })
        .toList();
  }

  private List<AgingBucket> agingBuckets(String region, Instant now) {
    long[] counts = new long[4];
    for (Instant openedAt : cases.openCaseStartTimes(CaseStatus.CLOSED, region)) {
      long days = Duration.between(openedAt, now).toDays();
      if (days <= 7) {
        counts[0]++;
      } else if (days <= 30) {
        counts[1]++;
      } else if (days <= 90) {
        counts[2]++;
      } else {
        counts[3]++;
      }
    }
    return List.of(
        new AgingBucket("0-7 days", counts[0]),
        new AgingBucket("8-30 days", counts[1]),
        new AgingBucket("31-90 days", counts[2]),
        new AgingBucket("90+ days", counts[3]));
  }

  private double avgResolutionDays(String region, Instant since) {
    List<Object[]> durations = cases.closedCaseDurations(CaseStatus.CLOSED, since, region);
    return round(
        durations.stream()
            .mapToLong(row -> Duration.between((Instant) row[0], (Instant) row[1]).toDays())
            .average()
            .orElse(0d));
  }

  /* ------------------------------------------------------------------ Section 7.3 */

  @Transactional(readOnly = true)
  public ExecutiveView executiveView(Instant now) {
    Instant yearStart = now.minus(365, ChronoUnit.DAYS);
    Instant priorYearStart = now.minus(730, ChronoUnit.DAYS);

    long thisYear = cases.countOpenedBetween(yearStart, now);
    long lastYear = cases.countOpenedBetween(priorYearStart, yearStart);
    double yoy = lastYear == 0 ? 0d : ((thisYear - lastYear) * 100d) / lastYear;

    Map<String, Long> highRiskByRegion =
        riskService.currentAlerts(null, Integer.MAX_VALUE).stream()
            .filter(a -> a.riskBand() == RiskBand.HIGH)
            // groupingBy throws on a null key, and risk_score.region is nullable — a site
            // whose region has not been backfilled would take the whole executive view down.
            .collect(
                Collectors.groupingBy(
                    alert -> alert.region() == null ? "UNASSIGNED" : alert.region(),
                    Collectors.counting()));

    List<RegionPosture> regions =
        cases.volumeByRegion(yearStart).stream()
            .map(
                row -> {
                  String region = (String) row[0];
                  return new RegionPosture(
                      region,
                      (Long) row[1],
                      (BigDecimal) row[2],
                      highRiskByRegion.getOrDefault(region, 0L));
                })
            .toList();

    return new ExecutiveView(
        thisYear,
        avgResolutionDays(null, yearStart),
        cases.openFinancialExposure(CaseStatus.CLOSED, null).setScale(2, RoundingMode.HALF_UP),
        round(yoy),
        regions,
        cases.findTop10ByOrderByFinancialImpactDesc().stream().map(this::toSummary).toList(),
        riskService.currentAlerts(null, 10),
        riskService.forecastCurve(null, null),
        riskService.posture(null),
        incidentHeatmap(null, now));
  }

  /* ------------------------------------------------------------------ helpers */

  public CaseSummary toSummary(CaseRecord c) {
    Instant now = Instant.now();
    return new CaseSummary(
        c.getCaseNumber(),
        c.getTitle(),
        c.getCaseType(),
        c.getStatus(),
        c.getPriority(),
        c.getAssigneeEmail(),
        c.getSiteCode(),
        c.getRegion(),
        c.getOpenedAt(),
        c.getDueAt(),
        c.getClosedAt(),
        c.ageDays(now),
        c.isOverdue(now),
        c.getFinancialImpact(),
        c.getSourceSystem() == null ? null : c.getSourceSystem().name());
  }

  private static double round(double value) {
    return Math.round(value * 10d) / 10d;
  }
}
