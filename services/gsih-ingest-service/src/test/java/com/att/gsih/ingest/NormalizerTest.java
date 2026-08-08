package com.att.gsih.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import com.att.gsih.common.event.RawEvents.RawAccessEvent;
import com.att.gsih.common.event.RawEvents.RawCase;
import com.att.gsih.common.event.RawEvents.RawIncident;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.SourceSystem;
import com.att.gsih.ingest.normalize.CanonicalRows;
import com.att.gsih.ingest.normalize.Normalizer;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NormalizerTest {

  private final Normalizer normalizer = new Normalizer("unit-test-salt");

  @Test
  void sameSourceRecordAlwaysProducesTheSameId() {
    RawIncident raw = incident("INC-77");
    assertThat(normalizer.incident(raw).id()).isEqualTo(normalizer.incident(raw).id());
  }

  @Test
  void differentSourceSystemsWithTheSameIdDoNotCollide() {
    RawIncident d3 = incident("INC-77");
    RawIncident omnigo =
        new RawIncident(
            "OMNIGO", "INC-77", "SITE-1", "Graffiti", "2", "d", "r", Instant.now(), null, Map.of());
    assertThat(normalizer.incident(d3).id()).isNotEqualTo(normalizer.incident(omnigo).id());
  }

  @Test
  void aRecordWithNoSourceIdIsRejectedRatherThanFoldedOntoOneRow() {
    // Every record from a system used to derive the same UUID from a blank id, and the
    // sink's upsert then collapsed the entire feed onto a single row while still reporting
    // a healthy ingest rate.
    for (String missing : new String[] {null, "", "   "}) {
      RawIncident raw =
          new RawIncident(
              "D3_SECURITY", missing, "SITE-1", "Vandalism", "2", "d", "r",
              Instant.now(), null, Map.of());
      org.assertj.core.api.Assertions.assertThatThrownBy(() -> normalizer.incident(raw))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("sourceId");
    }

    // Two distinct ids still key apart, which is the property the rejection protects.
    assertThat(Normalizer.deterministicId("D3_SECURITY", "A"))
        .isNotEqualTo(Normalizer.deterministicId("D3_SECURITY", "B"));
  }

  @Test
  void mapsVendorFieldsOntoTheCanonicalModel() {
    CanonicalRows.IncidentRow row = normalizer.incident(incident("INC-1"));
    assertThat(row.sourceSystem()).isEqualTo(SourceSystem.D3_SECURITY);
    assertThat(row.incidentType()).isEqualTo(IncidentType.VANDALISM);
    assertThat(row.severity()).isEqualTo("HIGH");
    assertThat(row.siteCode()).isEqualTo("SITE-1");
    assertThat(row.unmappedCategory()).isFalse();
  }

  @Test
  void flagsCategoriesTheMappingTableDoesNotCoverYet() {
    RawIncident raw =
        new RawIncident(
            "D3_SECURITY",
            "INC-9",
            "SITE-1",
            "drone incursion",
            "2",
            "d",
            "r",
            Instant.now(),
            null,
            Map.of());
    CanonicalRows.IncidentRow row = normalizer.incident(raw);
    assertThat(row.incidentType()).isEqualTo(IncidentType.OTHER);
    assertThat(row.unmappedCategory()).isTrue();
  }

  @Test
  void negativeLossAmountsAreClampedSoKpisCannotGoBackwards() {
    RawIncident reversal =
        new RawIncident(
            "D3_SECURITY",
            "INC-2",
            "SITE-1",
            "Theft",
            "2",
            "reversal",
            "r",
            Instant.now(),
            new BigDecimal("-5000"),
            Map.of());
    assertThat(normalizer.incident(reversal).lossAmount()).isEqualByComparingTo(BigDecimal.ZERO);
  }

  @Test
  void closedCasesWithoutACloseTimestampStillGetOne() {
    RawCase raw =
        new RawCase(
            "CASE_IQ",
            "C-1",
            "SW-1001",
            "Perimeter damage",
            "Vandalism",
            "Resolved",
            "P2",
            "Dana@ATT.com",
            "site-1",
            Instant.now().minusSeconds(86_400),
            null,
            null,
            new BigDecimal("1200"),
            Map.of());

    CanonicalRows.CaseRow row = normalizer.caseRecord(raw);
    assertThat(row.status()).isEqualTo(CaseStatus.CLOSED);
    assertThat(row.closedAt()).isNotNull();
    assertThat(row.assigneeEmail()).isEqualTo("dana@att.com");
    assertThat(row.siteCode()).isEqualTo("SITE-1");
  }

  @Test
  void badgeIdentifiersAreHashedAndNeverStoredInTheClear() {
    RawAccessEvent raw =
        new RawAccessEvent(
            "LENEL_S2",
            "A-1",
            "SITE-1",
            "BADGE-99887",
            "DOOR-3",
            "Access Granted",
            Instant.parse("2026-03-04T03:15:00Z"),
            false,
            Map.of());

    CanonicalRows.AccessRow row = normalizer.access(raw, ZoneId.of("America/Chicago"));
    assertThat(row.badgeHash()).isNotNull().doesNotContain("BADGE-99887").hasSize(64);
    // Same badge hashes the same way, so per-badge counts still work.
    assertThat(row.badgeHash()).isEqualTo(normalizer.hashBadge("BADGE-99887"));
  }

  @Test
  void afterHoursIsJudgedInTheSitesOwnTimezone() {
    // 03:15 UTC is 21:15 the previous evening in Chicago — after hours in both zones.
    Instant nightUtc = Instant.parse("2026-03-04T03:15:00Z");
    assertThat(normalizer.isAfterHours(nightUtc, ZoneId.of("America/Chicago"))).isTrue();

    // 13:00 UTC is 08:00 in Chicago (a working Wednesday) but 22:00 in Tokyo.
    Instant middayUtc = Instant.parse("2026-03-04T13:00:00Z");
    assertThat(normalizer.isAfterHours(middayUtc, ZoneId.of("America/Chicago"))).isFalse();
    assertThat(normalizer.isAfterHours(middayUtc, ZoneId.of("Asia/Tokyo"))).isTrue();
  }

  @Test
  void weekendAccessCountsAsAfterHours() {
    // Saturday midday in Chicago.
    Instant saturday = Instant.parse("2026-03-07T18:00:00Z");
    assertThat(normalizer.isAfterHours(saturday, ZoneId.of("America/Chicago"))).isTrue();
  }

  private static RawIncident incident(String sourceId) {
    return new RawIncident(
        "D3_SECURITY",
        sourceId,
        " site-1 ",
        "Property Damage",
        "high",
        "Spray paint on the east wall",
        "guard@att.com",
        Instant.parse("2026-02-01T04:00:00Z"),
        new BigDecimal("900"),
        Map.of());
  }
}
