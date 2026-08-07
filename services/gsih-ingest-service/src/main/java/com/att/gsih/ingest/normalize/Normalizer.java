package com.att.gsih.ingest.normalize;

import com.att.gsih.common.event.RawEvents.RawAccessEvent;
import com.att.gsih.common.event.RawEvents.RawAlarmEvent;
import com.att.gsih.common.event.RawEvents.RawCase;
import com.att.gsih.common.event.RawEvents.RawIncident;
import com.att.gsih.common.model.CanonicalMapper;
import com.att.gsih.common.model.Enums.AccessResult;
import com.att.gsih.common.model.Enums.AlarmType;
import com.att.gsih.common.model.Enums.CasePriority;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.SourceSystem;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Section 5.2, Step 2 — Standardize.
 *
 * <p>Turns a vendor payload into a canonical warehouse row. Three things happen here that the rest
 * of the platform depends on:
 *
 * <ul>
 *   <li>a deterministic UUID is derived from {@code sourceSystem + sourceId}, so replaying a Kafka
 *       partition updates the same row instead of creating a second copy of the incident;
 *   <li>badge identifiers are hashed — Section 5.3's data minimisation rule means the hub can count
 *       after-hours entries per badge without ever storing who the badge belongs to;
 *   <li>after-hours is decided in the site's own timezone, not the server's, or every European
 *       badge read would look like a night-time entry to a US-hosted service.
 * </ul>
 */
public final class Normalizer {

  /** Anything outside 06:00–20:00 local counts as after hours for risk purposes. */
  private static final LocalTime BUSINESS_START = LocalTime.of(6, 0);

  private static final LocalTime BUSINESS_END = LocalTime.of(20, 0);

  private final String badgeSalt;

  public Normalizer(String badgeSalt) {
    this.badgeSalt = badgeSalt;
  }

  public CanonicalRows.IncidentRow incident(RawIncident raw) {
    SourceSystem source = CanonicalMapper.sourceSystem(raw.sourceSystem());
    IncidentType type = CanonicalMapper.incidentType(raw.category());
    return new CanonicalRows.IncidentRow(
        deterministicId(source.name(), raw.sourceId()),
        source,
        raw.sourceId(),
        trimUpper(raw.siteCode()),
        type,
        normaliseSeverity(raw.severity()),
        truncate(raw.description(), 2000),
        raw.reportedBy(),
        raw.occurredAt(),
        nonNegative(raw.lossAmount()),
        CanonicalMapper.isUnmappedIncidentType(raw.category()));
  }

  public CanonicalRows.CaseRow caseRecord(RawCase raw) {
    SourceSystem source = CanonicalMapper.sourceSystem(raw.sourceSystem());
    CaseStatus status = CanonicalMapper.caseStatus(raw.status());
    CasePriority priority = CanonicalMapper.priority(raw.priority());

    // A case the source marks closed without a close timestamp still needs one, or every aging and
    // resolution-time KPI silently skips it. The last-seen time is the honest approximation.
    Instant closedAt = raw.closedAt();
    if (status == CaseStatus.CLOSED && closedAt == null) {
      closedAt = Instant.now();
    }

    return new CanonicalRows.CaseRow(
        deterministicId(source.name(), raw.sourceId()),
        source,
        raw.sourceId(),
        raw.caseNumber(),
        truncate(raw.title(), 500),
        CanonicalMapper.incidentType(raw.category()),
        status,
        priority,
        lower(raw.assigneeEmail()),
        trimUpper(raw.siteCode()),
        raw.openedAt(),
        raw.dueAt(),
        closedAt,
        nonNegative(raw.financialImpact()));
  }

  public CanonicalRows.AccessRow access(RawAccessEvent raw, ZoneId siteZone) {
    SourceSystem source = CanonicalMapper.sourceSystem(raw.sourceSystem());
    AccessResult result = CanonicalMapper.accessResult(raw.result());
    return new CanonicalRows.AccessRow(
        deterministicId(source.name(), raw.sourceId()),
        source,
        trimUpper(raw.siteCode()),
        hashBadge(raw.badgeId()),
        raw.doorId(),
        result,
        raw.eventTime(),
        isAfterHours(raw.eventTime(), siteZone),
        Boolean.TRUE.equals(raw.tailgate()));
  }

  public CanonicalRows.AlarmRow alarm(RawAlarmEvent raw) {
    SourceSystem source = CanonicalMapper.sourceSystem(raw.sourceSystem());
    AlarmType type = CanonicalMapper.alarmType(raw.alarmType());
    return new CanonicalRows.AlarmRow(
        deterministicId(source.name(), raw.sourceId()),
        source,
        trimUpper(raw.siteCode()),
        raw.cameraId(),
        type,
        normaliseSeverity(raw.severity()),
        raw.eventTime());
  }

  /** True when the badge read falls outside the site's local business hours. */
  public boolean isAfterHours(Instant eventTime, ZoneId siteZone) {
    if (eventTime == null) {
      return false;
    }
    ZonedDateTime local = eventTime.atZone(siteZone == null ? ZoneId.of("UTC") : siteZone);
    LocalTime time = local.toLocalTime();
    boolean weekend =
        local.getDayOfWeek() == java.time.DayOfWeek.SATURDAY
            || local.getDayOfWeek() == java.time.DayOfWeek.SUNDAY;
    return weekend || time.isBefore(BUSINESS_START) || time.isAfter(BUSINESS_END);
  }

  /**
   * Same source record, same UUID, forever — this is what makes the whole pipeline replay-safe.
   */
  public static UUID deterministicId(String sourceSystem, String sourceId) {
    String key = sourceSystem + "::" + (sourceId == null ? "" : sourceId);
    return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));
  }

  /** SHA-256 with a deployment salt: stable enough to count per badge, useless as an identifier. */
  public String hashBadge(String badgeId) {
    if (badgeId == null || badgeId.isBlank()) {
      return null;
    }
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      digest.update(badgeSalt.getBytes(StandardCharsets.UTF_8));
      byte[] hash = digest.digest(badgeId.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(hash);
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 unavailable", ex);
    }
  }

  private static String normaliseSeverity(String raw) {
    if (raw == null) {
      return "MEDIUM";
    }
    return switch (raw.trim().toLowerCase(java.util.Locale.ROOT)) {
      case "1", "critical", "sev1", "severe" -> "CRITICAL";
      case "2", "high", "sev2", "major" -> "HIGH";
      case "4", "low", "sev4", "minor", "informational" -> "LOW";
      default -> "MEDIUM";
    };
  }

  /** Guards the loss-value KPIs against negative amounts used by some systems for reversals. */
  private static BigDecimal nonNegative(BigDecimal value) {
    if (value == null) {
      return null;
    }
    return value.signum() < 0 ? BigDecimal.ZERO : value;
  }

  private static String trimUpper(String value) {
    return value == null ? null : value.trim().toUpperCase(java.util.Locale.ROOT);
  }

  private static String lower(String value) {
    return value == null ? null : value.trim().toLowerCase(java.util.Locale.ROOT);
  }

  private static String truncate(String value, int max) {
    if (value == null) {
      return null;
    }
    return value.length() <= max ? value : value.substring(0, max);
  }
}
