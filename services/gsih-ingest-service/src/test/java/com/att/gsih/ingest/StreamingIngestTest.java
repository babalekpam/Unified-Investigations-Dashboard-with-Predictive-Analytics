package com.att.gsih.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.att.gsih.common.event.RawEvents.Topics;
import java.sql.Connection;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The streaming path end to end: a message on a Kafka topic becomes a warehouse row.
 *
 * <p>{@code NormalizerTest} covers the mapping in isolation, which leaves the part that actually
 * carries the traffic — the listener wiring, the batch container, the deserialisers, the upsert
 * SQL — resting on the fact that it compiles. This runs a real broker in-process and writes
 * through the real sink.
 *
 * <p>PostgreSQL, not H2, on purpose: the sink's idempotency is an {@code ON CONFLICT … DO UPDATE}
 * upsert, which is the one part of this path that cannot be proven against a different dialect —
 * H2 would either reject the statement or accept a rewritten one that is no longer the code being
 * shipped. When no database is reachable the test skips with a message saying so, rather than
 * passing quietly and implying coverage it does not have.
 */
@SpringBootTest(
    properties = {
      "spring.kafka.consumer.auto-offset-reset=earliest",
      "gsih.ingest.badge-salt=integration-test-salt",
      "gsih.ingest.site-refresh-ms=60000",
    })
@EmbeddedKafka(
    partitions = 1,
    topics = {
      Topics.INCIDENTS_RAW,
      Topics.CASES_RAW,
      Topics.ACCESS_RAW,
      Topics.ALARMS_RAW
    })
class StreamingIngestTest {

  private static final String DB_URL =
      System.getenv().getOrDefault("GSIH_TEST_DB_URL", "jdbc:postgresql://127.0.0.1:5432/gsih");
  private static final String DB_USER = System.getenv().getOrDefault("GSIH_TEST_DB_USER", "gsih");
  private static final String DB_PASSWORD =
      System.getenv().getOrDefault("GSIH_TEST_DB_PASSWORD", "gsih");

  @DynamicPropertySource
  static void warehouse(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", () -> DB_URL);
    registry.add("spring.datasource.username", () -> DB_USER);
    registry.add("spring.datasource.password", () -> DB_PASSWORD);
  }

  @BeforeAll
  static void requireAWarehouse() {
    try (Connection ignored =
        java.sql.DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD)) {
      // Reachable — the test can run for real.
    } catch (Exception unreachable) {
      org.junit.jupiter.api.Assumptions.abort(
          "No PostgreSQL warehouse at "
              + DB_URL
              + " — the streaming path is only asserted when a real database is available ("
              + unreachable.getMessage()
              + ")");
    }
  }

  @Autowired KafkaTemplate<String, String> kafka;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource dataSource;

  private String siteCode;

  @BeforeEach
  void seedASite() {
    // A site the facilities feed has published, so the event is not counted as an unknown site.
    siteCode = "ITEST-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
    jdbc.update(
        """
        insert into site (site_code, name, region, country, city, site_type, timezone,
                          latitude, longitude, lighting_score, foot_traffic_score,
                          camera_count, perimeter_fenced, critical_asset)
        values (?, ?, 'SOUTHWEST', 'US', 'Dallas', 'NETWORK_FACILITY', 'America/Chicago',
                32.78, -96.80, 2, 2, 4, true, false)
        on conflict (site_code) do nothing
        """,
        siteCode,
        "Integration " + siteCode);
  }

  private String incidentJson(String sourceId, String category, String severity) {
    return """
        {"sourceSystem":"D3_SECURITY","sourceId":"%s","siteCode":"%s","category":"%s",
         "severity":"%s","description":"Spray paint on the east wall","reportedBy":"guard@att.com",
         "occurredAt":"%s","lossAmount":900.00,"attributes":{}}
        """
        .formatted(sourceId, siteCode, category, severity, Instant.now().toString());
  }

  private Map<String, Object> incidentRow(String sourceId) {
    return jdbc.queryForMap(
        "select * from incident where source_system = 'D3_SECURITY' and source_id = ?", sourceId);
  }

  private long incidentCount(String sourceId) {
    return jdbc.queryForObject(
        "select count(*) from incident where source_system = 'D3_SECURITY' and source_id = ?",
        Long.class,
        sourceId);
  }

  @Test
  void aMessageOnTheTopicBecomesACanonicalWarehouseRow() {
    String sourceId = "ITEST-" + UUID.randomUUID();

    kafka.send(Topics.INCIDENTS_RAW, incidentJson(sourceId, "Property Damage", "high"));

    await()
        .atMost(Duration.ofSeconds(30))
        .pollInterval(Duration.ofMillis(250))
        .untilAsserted(() -> assertThat(incidentCount(sourceId)).isEqualTo(1));

    Map<String, Object> row = incidentRow(sourceId);
    // The vendor vocabulary is resolved on the way in, not on the way out.
    assertThat(row.get("incident_type")).isEqualTo("VANDALISM");
    assertThat(row.get("severity")).isEqualTo("HIGH");
    assertThat(row.get("site_code")).isEqualTo(siteCode);
    // The region comes from the site directory, not from the message.
    assertThat(row.get("region")).isEqualTo("SOUTHWEST");
  }

  @Test
  void aRedeliveredMessageUpdatesTheRowRatherThanDuplicatingIt() {
    String sourceId = "ITEST-" + UUID.randomUUID();

    kafka.send(Topics.INCIDENTS_RAW, incidentJson(sourceId, "Property Damage", "high"));
    await()
        .atMost(Duration.ofSeconds(30))
        .untilAsserted(() -> assertThat(incidentCount(sourceId)).isEqualTo(1));

    // At-least-once delivery means the same record arrives again, and the source system also
    // resends corrections. Both land on the same deterministic id.
    kafka.send(Topics.INCIDENTS_RAW, incidentJson(sourceId, "Copper theft", "low"));
    await()
        .atMost(Duration.ofSeconds(30))
        .untilAsserted(() -> assertThat(incidentRow(sourceId).get("incident_type")).isEqualTo("THEFT"));

    assertThat(incidentCount(sourceId)).isEqualTo(1);
    assertThat(incidentRow(sourceId).get("severity")).isEqualTo("LOW");
  }

  @Test
  void aSiteAddedSinceTheLastCacheRefreshStillGetsItsRegion() {
    // The site rows in this class are created per test, long after the directory loaded its
    // snapshot at startup — which is exactly the production case of a facility published between
    // two refreshes. Region drives access confinement and every regional KPI, so an event that
    // lands without one is invisible to that region's manager and never backfilled.
    String sourceId = "ITEST-" + UUID.randomUUID();

    kafka.send(Topics.INCIDENTS_RAW, incidentJson(sourceId, "Property Damage", "high"));

    await()
        .atMost(Duration.ofSeconds(30))
        .untilAsserted(() -> assertThat(incidentRow(sourceId).get("region")).isEqualTo("SOUTHWEST"));
  }

  @Test
  void aMalformedMessageDoesNotStopTheFeed() {
    String sourceId = "ITEST-" + UUID.randomUUID();

    // One unparseable record in the middle of a batch: the feed has to keep moving, because a
    // single bad vendor payload cannot be allowed to halt every site's ingest.
    kafka.send(Topics.INCIDENTS_RAW, "{ this is not json");
    kafka.send(Topics.INCIDENTS_RAW, incidentJson(sourceId, "Property Damage", "high"));

    await()
        .atMost(Duration.ofSeconds(30))
        .untilAsserted(() -> assertThat(incidentCount(sourceId)).isEqualTo(1));
  }

  @Test
  void badgeIdentifiersNeverReachTheWarehouseInTheClear() {
    String badge = "BADGE-" + UUID.randomUUID().toString().substring(0, 8);
    String sourceId = "ITEST-" + UUID.randomUUID();

    kafka.send(
        Topics.ACCESS_RAW,
        """
        {"sourceSystem":"LENEL_S2","sourceId":"%s","siteCode":"%s","badgeId":"%s",
         "doorId":"DOOR-3","result":"Access Granted","eventTime":"%s","afterHours":false,
         "attributes":{}}
        """
            .formatted(sourceId, siteCode, badge, Instant.now().toString()));

    await()
        .atMost(Duration.ofSeconds(30))
        .untilAsserted(
            () ->
                assertThat(
                        jdbc.queryForObject(
                            "select count(*) from access_event where site_code = ?",
                            Long.class,
                            siteCode))
                    .isEqualTo(1));

    String storedHash =
        jdbc.queryForObject(
            "select badge_hash from access_event where site_code = ?", String.class, siteCode);
    assertThat(storedHash).isNotNull().hasSize(64).doesNotContain(badge);

    // And nothing anywhere in that table holds the raw identifier.
    assertThat(
            jdbc.queryForObject(
                "select count(*) from access_event where badge_hash = ?", Long.class, badge))
        .isZero();
  }
}
