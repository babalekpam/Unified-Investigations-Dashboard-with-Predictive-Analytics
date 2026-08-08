package com.att.gsih.api.service;

import com.att.gsih.api.domain.CaseRecord;
import com.att.gsih.api.domain.Incident;
import com.att.gsih.api.domain.Site;
import com.att.gsih.api.dto.LinkGraph.Detail;
import com.att.gsih.api.dto.LinkGraph.Edge;
import com.att.gsih.api.dto.LinkGraph.EdgeType;
import com.att.gsih.api.dto.LinkGraph.Graph;
import com.att.gsih.api.dto.LinkGraph.Node;
import com.att.gsih.api.dto.LinkGraph.NodeType;
import com.att.gsih.api.repo.AccessEventRepository;
import com.att.gsih.api.repo.AlarmEventRepository;
import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.IncidentRepository;
import com.att.gsih.api.repo.SiteRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the entity link graph around a case — the investigative question the tables
 * cannot answer: what else touches this?
 *
 * <p>Traversal is breadth-first and bounded in three ways, because an unbounded expansion
 * over a busy site returns a hairball nobody can read:
 *
 * <ul>
 *   <li><b>Hops.</b> Two by default: case → site → everything at that site. Three reaches
 *       the second site a shared badge connects to, which is where link analysis earns its
 *       keep.
 *   <li><b>A node budget.</b> Expansion stops at the budget and the response says it was
 *       truncated, so the UI can say "strongest N connections" rather than implying the
 *       picture is complete.
 *   <li><b>Aggregation.</b> Alarms collapse to one node per type and badges to one node
 *       per badge. A site with 400 motion alarms is one fact, not 400 nodes.
 * </ul>
 *
 * <p>Region scoping is applied to the seed and to every site the traversal reaches, so the
 * graph can never become a way around the region confinement the dashboards enforce.
 */
@Service
public class LinkGraphService {

  /** How far back the graph looks. A year of context, matching the incident lookbacks. */
  static final int LOOKBACK_DAYS = 365;

  static final int DEFAULT_NODE_BUDGET = 60;

  static final int MAX_HOPS = 3;

  /** Badges below this many after-hours reads at a site are noise, not a lead. */
  static final long MIN_BADGE_READS = 2;

  /**
   * A badge read after hours at more than this many sites is a roaming credential — a
   * regional technician, a contractor, a patrol route — not a lead.
   *
   * <p>Expanding through one connects every site it ever visited to every other, and the
   * graph collapses into a hairball that says only "this region has technicians". The
   * investigative signal is the opposite: a badge that appears at two or three sites it
   * has no business appearing at. Such badges are still drawn, because their presence is a
   * fact about the site, but the traversal stops there.
   */
  static final int MAX_BADGE_SITE_SPREAD = 4;

  private final CaseRepository cases;
  private final IncidentRepository incidents;
  private final SiteRepository sites;
  private final AccessEventRepository accessEvents;
  private final AlarmEventRepository alarmEvents;

  public LinkGraphService(
      CaseRepository cases,
      IncidentRepository incidents,
      SiteRepository sites,
      AccessEventRepository accessEvents,
      AlarmEventRepository alarmEvents) {
    this.cases = cases;
    this.incidents = incidents;
    this.sites = sites;
    this.accessEvents = accessEvents;
    this.alarmEvents = alarmEvents;
  }

  /**
   * @param caseNumber the seed case
   * @param regionScope the caller's region, or null for enterprise-wide
   * @param hops 1–{@value #MAX_HOPS}
   */
  @Transactional(readOnly = true)
  public Graph aroundCase(String caseNumber, String regionScope, int hops, int nodeBudget) {
    CaseRecord seed =
        cases
            .findByCaseNumber(caseNumber)
            .orElseThrow(() -> new IllegalArgumentException("no such case: " + caseNumber));

    if (regionScope != null && !regionScope.equals(seed.getRegion())) {
      throw new AccessDeniedException("case belongs to another region");
    }

    Builder builder = new Builder(Math.min(Math.max(hops, 1), MAX_HOPS), nodeBudget, regionScope);
    Instant since = Instant.now().minus(LOOKBACK_DAYS, ChronoUnit.DAYS);

    String seedId = "case:" + seed.getCaseNumber();
    builder.addNode(
        seedId,
        NodeType.CASE,
        seed.getCaseNumber(),
        seed.getTitle(),
        0,
        3.0,
        List.of(
            new Detail("Status", String.valueOf(seed.getStatus())),
            new Detail("Priority", String.valueOf(seed.getPriority())),
            new Detail("Type", String.valueOf(seed.getCaseType())),
            new Detail("Assignee", nullSafe(seed.getAssigneeEmail())),
            new Detail("Age", seed.ageDays(Instant.now()) + " days")));

    if (seed.getSiteCode() != null) {
      expandSite(builder, seed.getSiteCode(), seedId, EdgeType.AT_SITE, "case site", 1, since);
    }

    return new Graph(
        seedId,
        seed.getCaseNumber(),
        List.copyOf(builder.nodes.values()),
        builder.edges,
        builder.nodeBudget,
        builder.truncated);
  }

  /** Adds a site and, if the hop budget allows, everything that touches it. */
  private void expandSite(
      Builder builder,
      String siteCode,
      String fromNodeId,
      EdgeType edgeType,
      String edgeLabel,
      int hop,
      Instant since) {

    Site site = sites.findById(siteCode).orElse(null);
    if (site == null) {
      return;
    }
    // Region confinement applies to every site the walk reaches, not just the seed.
    if (builder.regionScope != null && !builder.regionScope.equals(site.getRegion())) {
      return;
    }

    String siteId = "site:" + siteCode;
    boolean fresh =
        builder.addNode(
            siteId,
            NodeType.SITE,
            site.getName(),
            siteCode,
            hop,
            2.5,
            List.of(
                new Detail("Region", nullSafe(site.getRegion())),
                new Detail("Type", nullSafe(site.getSiteType())),
                new Detail("Lighting", scoreOf(site.getLightingScore())),
                new Detail("Foot traffic", scoreOf(site.getFootTrafficScore())),
                new Detail("Cameras", String.valueOf(site.getCameraCount())),
                new Detail("Perimeter", Boolean.TRUE.equals(site.getPerimeterFenced()) ? "Fenced" : "Open")));
    builder.addEdge(fromNodeId, siteId, edgeType, edgeLabel, 1);

    if (!fresh || hop >= builder.hops) {
      return;
    }

    addIncidents(builder, siteCode, siteId, hop + 1, since);
    addAlarms(builder, siteCode, siteId, hop + 1, since);
    addBadges(builder, siteCode, siteId, hop + 1, since);
  }

  private void addIncidents(Builder b, String siteCode, String siteId, int hop, Instant since) {
    List<Incident> found =
        incidents.findBySiteCodeAndOccurredAtAfterOrderByOccurredAtDesc(siteCode, since);
    for (Incident incident : found) {
      if (b.exhausted()) {
        return;
      }
      String id = "incident:" + incident.getId();
      b.addNode(
          id,
          NodeType.INCIDENT,
          String.valueOf(incident.getIncidentType()),
          incident.getOccurredAt().toString().substring(0, 10),
          hop,
          1.0,
          List.of(
              new Detail("Severity", nullSafe(incident.getSeverity())),
              new Detail("Occurred", incident.getOccurredAt().toString().substring(0, 10)),
              new Detail("Loss", incident.getLossAmount() == null ? "—" : incident.getLossAmount().toPlainString()),
              new Detail("Source", String.valueOf(incident.getSourceSystem())),
              new Detail("Case", nullSafe(incident.getCaseNumber()))));
      b.addEdge(id, siteId, EdgeType.AT_SITE, "occurred at", 1);

      // An incident already worked as a case links the two records directly, which is how
      // an investigator discovers a colleague is on the same thread.
      if (incident.getCaseNumber() != null) {
        String caseId = "case:" + incident.getCaseNumber();
        if (b.nodes.containsKey(caseId)) {
          b.addEdge(caseId, id, EdgeType.FROM_INCIDENT, "opened from", 1);
        }
      }
    }
  }

  private void addAlarms(Builder b, String siteCode, String siteId, int hop, Instant since) {
    for (Object[] row : alarmEvents.alarmTypesAtSite(siteCode, since)) {
      if (b.exhausted()) {
        return;
      }
      String type = String.valueOf(row[0]);
      long count = (Long) row[1];
      String id = "alarm:" + siteCode + ":" + type;
      b.addNode(
          id,
          NodeType.ALARM,
          type,
          count + " in the last year",
          hop,
          Math.min(3.0, 0.6 + Math.log10(count + 1)),
          List.of(
              new Detail("Alarm type", type),
              new Detail("Count", String.valueOf(count)),
              new Detail("Most recent", String.valueOf(row[2]).substring(0, 10))));
      b.addEdge(id, siteId, EdgeType.RAISED_AT, count + " events", count);
    }
  }

  private void addBadges(Builder b, String siteCode, String siteId, int hop, Instant since) {
    for (Object[] row : accessEvents.afterHoursBadgesAtSite(siteCode, since)) {
      if (b.exhausted()) {
        return;
      }
      long reads = (Long) row[1];
      if (reads < MIN_BADGE_READS) {
        continue;
      }
      String hash = (String) row[0];
      long tailgates = row[3] == null ? 0 : ((Number) row[3]).longValue();

      // The badge is shown by a short prefix of its hash. That is enough to recognise the
      // same badge across two sites, and carries nothing about whose badge it is —
      // identifying the holder is a separate, access-controlled request to HR.
      String shortHash = hash.substring(0, 8);
      String id = "badge:" + hash;

      List<Object[]> otherSites = accessEvents.sitesForBadge(hash, since);
      boolean roaming = otherSites.size() > MAX_BADGE_SITE_SPREAD;

      b.addNode(
          id,
          NodeType.BADGE,
          shortHash,
          roaming
              ? otherSites.size() + " sites — routine movement"
              : reads + " after-hours reads",
          hop,
          Math.min(3.0, 0.8 + Math.log10(reads + 1)),
          List.of(
              new Detail("Badge (pseudonymised)", shortHash),
              new Detail("After-hours reads here", String.valueOf(reads)),
              new Detail("Sites visited", String.valueOf(otherSites.size())),
              new Detail("Tailgate flags", String.valueOf(tailgates)),
              new Detail("Most recent", String.valueOf(row[2]).substring(0, 10)),
              new Detail(
                  "Assessment",
                  roaming
                      ? "Roaming credential — not expanded"
                      : "Selective — appears at few sites")));
      b.addEdge(id, siteId, EdgeType.ACCESSED, reads + " after-hours", reads);

      // The third hop: a badge read after hours at a *small* number of other sites is the
      // pattern link analysis exists to surface. A badge that is everywhere is not.
      if (hop < b.hops && !roaming) {
        for (Object[] other : otherSites) {
          String otherSite = (String) other[0];
          if (otherSite.equals(siteCode) || b.exhausted()) {
            continue;
          }
          expandSite(b, otherSite, id, EdgeType.ACCESSED, other[1] + " after-hours", hop + 1, since);
        }
      }
    }
  }

  private static String nullSafe(String value) {
    return value == null || value.isBlank() ? "—" : value;
  }

  private static String scoreOf(Integer value) {
    return value == null ? "—" : value + "/5";
  }

  /** Accumulates the graph while enforcing the hop and node budgets. */
  private static final class Builder {
    final Map<String, Node> nodes = new LinkedHashMap<>();
    final List<Edge> edges = new ArrayList<>();
    final int hops;
    final int nodeBudget;
    final String regionScope;
    boolean truncated;

    Builder(int hops, int nodeBudget, String regionScope) {
      this.hops = hops;
      this.nodeBudget = nodeBudget;
      this.regionScope = regionScope;
    }

    boolean exhausted() {
      if (nodes.size() >= nodeBudget) {
        truncated = true;
        return true;
      }
      return false;
    }

    /** @return true if this call created the node, false if it was already present */
    boolean addNode(
        String id,
        NodeType type,
        String label,
        String sublabel,
        int hops,
        double weight,
        List<Detail> detail) {
      if (nodes.containsKey(id)) {
        return false;
      }
      if (nodes.size() >= nodeBudget) {
        truncated = true;
        return false;
      }
      nodes.put(id, new Node(id, type, label, sublabel, hops, weight, detail));
      return true;
    }

    void addEdge(String source, String target, EdgeType type, String label, double weight) {
      if (!nodes.containsKey(source) || !nodes.containsKey(target)) {
        return;
      }
      boolean exists =
          edges.stream()
              .anyMatch(
                  e ->
                      (e.source().equals(source) && e.target().equals(target))
                          || (e.source().equals(target) && e.target().equals(source)));
      if (!exists) {
        edges.add(new Edge(source, target, type, label, weight));
      }
    }
  }
}
