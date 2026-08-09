package com.att.gsih.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.att.gsih.api.domain.AccessEvent;
import com.att.gsih.api.domain.AlarmEvent;
import com.att.gsih.api.dto.LinkGraph.Graph;
import com.att.gsih.api.dto.LinkGraph.Node;
import com.att.gsih.api.dto.LinkGraph.NodeType;
import com.att.gsih.api.repo.AccessEventRepository;
import com.att.gsih.api.repo.AlarmEventRepository;
import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.IncidentRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.att.gsih.api.service.LinkGraphService;
import com.att.gsih.common.model.Enums.AccessResult;
import com.att.gsih.common.model.Enums.AlarmType;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.SourceSystem;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles({"local", "test"})
class LinkGraphTest {

  @Autowired LinkGraphService graphs;
  @Autowired CaseRepository cases;
  @Autowired IncidentRepository incidents;
  @Autowired SiteRepository sites;
  @Autowired AccessEventRepository accessEvents;
  @Autowired AlarmEventRepository alarmEvents;

  private static final Instant NOW = Instant.now();
  private static final String SHARED_BADGE =
      "aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44";

  @BeforeEach
  void seed() {
    accessEvents.deleteAll();
    alarmEvents.deleteAll();
    incidents.deleteAll();
    cases.deleteAll();
    sites.deleteAll();

    sites.save(TestData.site("SITE-A", "SOUTHWEST"));
    sites.save(TestData.site("SITE-B", "SOUTHWEST"));
    sites.save(TestData.site("SITE-Z", "NORTHEAST"));

    cases.save(
        TestData.openCase("SW-1", "dana@att.com", "SITE-A", "SOUTHWEST", NOW.minus(10, ChronoUnit.DAYS)));
    cases.save(
        TestData.openCase("NE-9", "sam@att.com", "SITE-Z", "NORTHEAST", NOW.minus(10, ChronoUnit.DAYS)));

    for (int i = 1; i <= 3; i++) {
      incidents.save(
          TestData.incident("SITE-A", "SOUTHWEST", IncidentType.VANDALISM, NOW.minus(i * 7L, ChronoUnit.DAYS)));
    }

    // The same badge, after hours, at two sites — the pattern link analysis exists for.
    for (int i = 0; i < 4; i++) {
      accessEvents.save(access("SITE-A", SHARED_BADGE, NOW.minus(i + 1L, ChronoUnit.DAYS), true));
    }
    for (int i = 0; i < 3; i++) {
      accessEvents.save(access("SITE-B", SHARED_BADGE, NOW.minus(i + 5L, ChronoUnit.DAYS), true));
    }
    // A single read: below the threshold, so it must not clutter the graph.
    accessEvents.save(access("SITE-A", "beefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
        NOW.minus(2, ChronoUnit.DAYS), true));
    // Daytime traffic is not investigative signal and must be excluded entirely.
    for (int i = 0; i < 25; i++) {
      accessEvents.save(access("SITE-A", "daydaydaydaydaydaydaydaydaydaydaydaydaydaydaydaydaydaydaydayda0",
          NOW.minus(i + 1L, ChronoUnit.DAYS), false));
    }

    for (int i = 0; i < 6; i++) {
      alarmEvents.save(alarm("SITE-A", AlarmType.MOTION, NOW.minus(i + 1L, ChronoUnit.DAYS)));
    }
    alarmEvents.save(alarm("SITE-A", AlarmType.CAMERA_TAMPER, NOW.minus(3, ChronoUnit.DAYS)));
  }

  private AccessEvent access(String site, String badge, Instant when, boolean afterHours) {
    AccessEvent e = new AccessEvent();
    e.setId(UUID.randomUUID());
    e.setSourceSystem(SourceSystem.LENEL_S2);
    e.setSiteCode(site);
    e.setBadgeHash(badge);
    e.setDoorId("DOOR-1");
    e.setResult(AccessResult.GRANTED);
    e.setEventTime(when);
    e.setAfterHours(afterHours);
    e.setTailgate(false);
    return e;
  }

  private AlarmEvent alarm(String site, AlarmType type, Instant when) {
    AlarmEvent a = new AlarmEvent();
    a.setId(UUID.randomUUID());
    a.setSourceSystem(SourceSystem.GENETEC);
    a.setSiteCode(site);
    a.setCameraId("CAM-1");
    a.setAlarmType(type);
    a.setSeverity("MEDIUM");
    a.setEventTime(when);
    return a;
  }

  private static long countOf(Graph g, NodeType type) {
    return g.nodes().stream().filter(n -> n.type() == type).count();
  }

  @Test
  void seedCaseIsTheCentreOfItsOwnGraph() {
    Graph g = graphs.aroundCase("SW-1", "SOUTHWEST", 2, 60);

    assertThat(g.seedId()).isEqualTo("case:SW-1");
    Node seed = g.nodes().stream().filter(n -> n.id().equals("case:SW-1")).findFirst().orElseThrow();
    assertThat(seed.hops()).isZero();
    assertThat(seed.type()).isEqualTo(NodeType.CASE);
  }

  @Test
  void twoHopsReachTheSiteAndEverythingOnIt() {
    Graph g = graphs.aroundCase("SW-1", "SOUTHWEST", 2, 60);

    assertThat(countOf(g, NodeType.SITE)).isEqualTo(1);
    assertThat(countOf(g, NodeType.INCIDENT)).isEqualTo(3);
    // Alarms collapse to one node per type, not one per event: six motion alarms is one fact.
    assertThat(countOf(g, NodeType.ALARM)).isEqualTo(2);
    assertThat(g.edges()).isNotEmpty();
  }

  @Test
  void dayTimeBadgeTrafficIsExcludedAndSingleReadsAreBelowThreshold() {
    Graph g = graphs.aroundCase("SW-1", "SOUTHWEST", 2, 60);

    // Only the shared badge clears the threshold; the one-read badge and the 25 daytime
    // reads must not appear.
    assertThat(countOf(g, NodeType.BADGE)).isEqualTo(1);
    assertThat(g.nodes())
        .filteredOn(n -> n.type() == NodeType.BADGE)
        .allSatisfy(n -> assertThat(n.label()).isEqualTo(SHARED_BADGE.substring(0, 8)));
  }

  @Test
  void thirdHopFollowsASharedBadgeToTheSecondSite() {
    Graph twoHops = graphs.aroundCase("SW-1", "SOUTHWEST", 2, 60);
    Graph threeHops = graphs.aroundCase("SW-1", "SOUTHWEST", 3, 60);

    assertThat(countOf(twoHops, NodeType.SITE)).isEqualTo(1);
    // This is the finding: the same badge was read after hours at a second site.
    assertThat(countOf(threeHops, NodeType.SITE)).isEqualTo(2);
    assertThat(threeHops.nodes())
        .filteredOn(n -> n.type() == NodeType.SITE)
        .extracting(Node::sublabel)
        .containsExactlyInAnyOrder("SITE-A", "SITE-B");
  }

  @Test
  void badgeIdentityIsNeverExposedInFull() {
    Graph g = graphs.aroundCase("SW-1", "SOUTHWEST", 3, 60);
    assertThat(g.nodes())
        .filteredOn(n -> n.type() == NodeType.BADGE)
        .allSatisfy(
            n -> {
              assertThat(n.label()).hasSize(8);
              assertThat(n.detail()).noneMatch(d -> d.value().equals(SHARED_BADGE));
            });
  }

  @Test
  void traversalCannotEscapeTheCallersRegion() {
    // SITE-Z is NORTHEAST; a Southwest manager must not reach it, seed or otherwise.
    assertThatThrownBy(() -> graphs.aroundCase("NE-9", "SOUTHWEST", 3, 60))
        .isInstanceOf(AccessDeniedException.class);

    Graph enterprise = graphs.aroundCase("NE-9", null, 3, 60);
    assertThat(enterprise.nodes()).isNotEmpty();
  }

  @Test
  void nodeBudgetTruncatesAndSaysSo() {
    Graph small = graphs.aroundCase("SW-1", "SOUTHWEST", 3, 5);

    assertThat(small.nodes()).hasSizeLessThanOrEqualTo(5);
    assertThat(small.truncated()).isTrue();

    Graph full = graphs.aroundCase("SW-1", "SOUTHWEST", 3, 60);
    assertThat(full.truncated()).isFalse();
  }

  @Test
  void everyEdgeConnectsTwoNodesThatArePresent() {
    Graph g = graphs.aroundCase("SW-1", "SOUTHWEST", 3, 60);
    var ids = g.nodes().stream().map(Node::id).toList();

    // A dangling edge would make the client render a line into empty space.
    assertThat(g.edges())
        .allSatisfy(
            e -> {
              assertThat(ids).contains(e.source());
              assertThat(ids).contains(e.target());
            });
  }

  @Test
  void aBadgeSeenEverywhereIsShownButNotExpandedThrough() {
    // A credential read after hours across six sites is a technician's route, not a lead.
    // Expanding through it would connect every site to every other and the graph would say
    // nothing except "this region has technicians".
    String roamer = "cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe";
    for (int i = 1; i <= 6; i++) {
      sites.save(TestData.site("SITE-R" + i, "SOUTHWEST"));
      for (int read = 0; read < 3; read++) {
        accessEvents.save(
            access("SITE-R" + i, roamer, NOW.minus(i * 3L + read, ChronoUnit.DAYS), true));
      }
    }
    for (int read = 0; read < 3; read++) {
      accessEvents.save(access("SITE-A", roamer, NOW.minus(read + 1L, ChronoUnit.DAYS), true));
    }

    Graph g = graphs.aroundCase("SW-1", "SOUTHWEST", 3, 120);

    Node roamerNode =
        g.nodes().stream()
            .filter(n -> n.type() == NodeType.BADGE && n.label().equals(roamer.substring(0, 8)))
            .findFirst()
            .orElseThrow();
    assertThat(roamerNode.sublabel()).contains("routine movement");
    assertThat(roamerNode.detail())
        .anySatisfy(d -> assertThat(d.value()).contains("Roaming credential"));

    // None of the six sites the roamer visits are pulled in; only the two the selective
    // badge connects.
    assertThat(g.nodes())
        .filteredOn(n -> n.type() == NodeType.SITE)
        .extracting(Node::sublabel)
        .containsExactlyInAnyOrder("SITE-A", "SITE-B");
  }

  @Test
  void unknownCaseIsRejectedRatherThanReturningAnEmptyGraph() {
    assertThatThrownBy(() -> graphs.aroundCase("DOES-NOT-EXIST", null, 2, 60))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
