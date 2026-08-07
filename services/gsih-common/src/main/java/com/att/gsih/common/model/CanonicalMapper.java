package com.att.gsih.common.model;

import com.att.gsih.common.model.Enums.AccessResult;
import com.att.gsih.common.model.Enums.AlarmType;
import com.att.gsih.common.model.Enums.CasePriority;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.SourceSystem;
import java.util.Locale;
import java.util.Map;

/**
 * Section 5.2, Step 2 — Standardize (Transform).
 *
 * <p>Each source system spells the same concept differently: Case IQ says {@code "Under
 * Investigation"}, Resolver says {@code "OPEN-ACTIVE"}, Kaseware says {@code "active"}. The mapper
 * collapses those into the canonical vocabulary so a manager's closure-rate KPI means the same
 * thing regardless of which system the case came from.
 *
 * <p>Unknown values never throw. They fall back to a documented default and are counted by the
 * ingest service so the discovery team can extend the mapping table instead of losing records.
 */
public final class CanonicalMapper {

  private CanonicalMapper() {}

  private static final Map<String, CaseStatus> CASE_STATUS =
      Map.ofEntries(
          Map.entry("new", CaseStatus.NEW),
          Map.entry("open", CaseStatus.NEW),
          Map.entry("reported", CaseStatus.NEW),
          Map.entry("intake", CaseStatus.NEW),
          Map.entry("active", CaseStatus.IN_PROGRESS),
          Map.entry("in progress", CaseStatus.IN_PROGRESS),
          Map.entry("in_progress", CaseStatus.IN_PROGRESS),
          Map.entry("under investigation", CaseStatus.IN_PROGRESS),
          Map.entry("open-active", CaseStatus.IN_PROGRESS),
          Map.entry("assigned", CaseStatus.IN_PROGRESS),
          Map.entry("pending review", CaseStatus.PENDING_REVIEW),
          Map.entry("review", CaseStatus.PENDING_REVIEW),
          Map.entry("qa", CaseStatus.PENDING_REVIEW),
          Map.entry("awaiting approval", CaseStatus.PENDING_REVIEW),
          Map.entry("escalated", CaseStatus.ESCALATED),
          Map.entry("referred", CaseStatus.ESCALATED),
          Map.entry("legal hold", CaseStatus.ESCALATED),
          Map.entry("closed", CaseStatus.CLOSED),
          Map.entry("resolved", CaseStatus.CLOSED),
          Map.entry("completed", CaseStatus.CLOSED),
          Map.entry("substantiated", CaseStatus.CLOSED),
          Map.entry("unsubstantiated", CaseStatus.CLOSED));

  private static final Map<String, CasePriority> PRIORITY =
      Map.ofEntries(
          Map.entry("p1", CasePriority.CRITICAL),
          Map.entry("critical", CasePriority.CRITICAL),
          Map.entry("sev1", CasePriority.CRITICAL),
          Map.entry("urgent", CasePriority.CRITICAL),
          Map.entry("p2", CasePriority.HIGH),
          Map.entry("high", CasePriority.HIGH),
          Map.entry("sev2", CasePriority.HIGH),
          Map.entry("p3", CasePriority.MEDIUM),
          Map.entry("medium", CasePriority.MEDIUM),
          Map.entry("normal", CasePriority.MEDIUM),
          Map.entry("moderate", CasePriority.MEDIUM),
          Map.entry("p4", CasePriority.LOW),
          Map.entry("low", CasePriority.LOW),
          Map.entry("minor", CasePriority.LOW));

  private static final Map<String, IncidentType> INCIDENT_TYPE =
      Map.ofEntries(
          Map.entry("vandalism", IncidentType.VANDALISM),
          Map.entry("graffiti", IncidentType.VANDALISM),
          Map.entry("property damage", IncidentType.VANDALISM),
          Map.entry("criminal damage", IncidentType.VANDALISM),
          Map.entry("copper theft", IncidentType.THEFT),
          Map.entry("theft", IncidentType.THEFT),
          Map.entry("burglary", IncidentType.THEFT),
          Map.entry("larceny", IncidentType.THEFT),
          Map.entry("fraud", IncidentType.FRAUD),
          Map.entry("financial fraud", IncidentType.FRAUD),
          Map.entry("embezzlement", IncidentType.FRAUD),
          Map.entry("trespass", IncidentType.TRESPASS),
          Map.entry("trespassing", IncidentType.TRESPASS),
          Map.entry("intrusion", IncidentType.TRESPASS),
          Map.entry("workplace violence", IncidentType.WORKPLACE_VIOLENCE),
          Map.entry("threat", IncidentType.WORKPLACE_VIOLENCE),
          Map.entry("harassment", IncidentType.WORKPLACE_VIOLENCE),
          Map.entry("policy violation", IncidentType.POLICY_VIOLATION),
          Map.entry("coc violation", IncidentType.POLICY_VIOLATION),
          Map.entry("asset loss", IncidentType.ASSET_LOSS),
          Map.entry("equipment loss", IncidentType.ASSET_LOSS),
          Map.entry("unauthorized access", IncidentType.UNAUTHORIZED_ACCESS),
          Map.entry("badge misuse", IncidentType.UNAUTHORIZED_ACCESS),
          Map.entry("tailgating", IncidentType.UNAUTHORIZED_ACCESS));

  private static final Map<String, AccessResult> ACCESS_RESULT =
      Map.ofEntries(
          Map.entry("granted", AccessResult.GRANTED),
          Map.entry("access granted", AccessResult.GRANTED),
          Map.entry("valid", AccessResult.GRANTED),
          Map.entry("ok", AccessResult.GRANTED),
          Map.entry("denied", AccessResult.DENIED),
          Map.entry("access denied", AccessResult.DENIED),
          Map.entry("invalid badge", AccessResult.DENIED),
          Map.entry("rejected", AccessResult.DENIED),
          Map.entry("forced", AccessResult.FORCED),
          Map.entry("door forced open", AccessResult.FORCED),
          Map.entry("held", AccessResult.HELD_OPEN),
          Map.entry("door held open", AccessResult.HELD_OPEN));

  private static final Map<String, AlarmType> ALARM_TYPE =
      Map.ofEntries(
          Map.entry("motion", AlarmType.MOTION),
          Map.entry("video motion", AlarmType.MOTION),
          Map.entry("analytics motion", AlarmType.MOTION),
          Map.entry("glass break", AlarmType.GLASS_BREAK),
          Map.entry("glassbreak", AlarmType.GLASS_BREAK),
          Map.entry("door forced", AlarmType.DOOR_FORCED),
          Map.entry("forced entry", AlarmType.DOOR_FORCED),
          Map.entry("perimeter", AlarmType.PERIMETER),
          Map.entry("fence", AlarmType.PERIMETER),
          Map.entry("camera tamper", AlarmType.CAMERA_TAMPER),
          Map.entry("tamper", AlarmType.CAMERA_TAMPER),
          Map.entry("loitering", AlarmType.LOITERING));

  public static CaseStatus caseStatus(String raw) {
    return CASE_STATUS.getOrDefault(normalize(raw), CaseStatus.NEW);
  }

  public static CasePriority priority(String raw) {
    return PRIORITY.getOrDefault(normalize(raw), CasePriority.MEDIUM);
  }

  public static IncidentType incidentType(String raw) {
    return INCIDENT_TYPE.getOrDefault(normalize(raw), IncidentType.OTHER);
  }

  public static AccessResult accessResult(String raw) {
    return ACCESS_RESULT.getOrDefault(normalize(raw), AccessResult.DENIED);
  }

  public static AlarmType alarmType(String raw) {
    return ALARM_TYPE.getOrDefault(normalize(raw), AlarmType.MOTION);
  }

  public static SourceSystem sourceSystem(String raw) {
    if (raw == null) {
      return SourceSystem.MANUAL_IMPORT;
    }
    String key = raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
    try {
      return SourceSystem.valueOf(key);
    } catch (IllegalArgumentException ex) {
      return SourceSystem.MANUAL_IMPORT;
    }
  }

  /** True when the raw value is one the mapping table does not know about yet. */
  public static boolean isUnmappedIncidentType(String raw) {
    return !INCIDENT_TYPE.containsKey(normalize(raw));
  }

  private static String normalize(String raw) {
    return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('_', ' ');
  }
}
