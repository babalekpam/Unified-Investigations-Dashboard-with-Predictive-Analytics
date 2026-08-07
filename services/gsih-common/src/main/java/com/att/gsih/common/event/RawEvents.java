package com.att.gsih.common.event;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/**
 * Envelope types for the raw feeds landing on Kafka (Section 5.1 — Webhooks / Streaming).
 *
 * <p>Raw events keep the vendor's own field values verbatim. Nothing is cleaned here: the connector
 * publishes exactly what the source system emitted, so the bronze layer stays replayable.
 */
public final class RawEvents {

  private RawEvents() {}

  /** Kafka topic names. One topic per feed family, partitioned by site. */
  public static final class Topics {
    public static final String INCIDENTS_RAW = "gsih.incidents.raw";
    public static final String ACCESS_RAW = "gsih.access.raw";
    public static final String ALARMS_RAW = "gsih.alarms.raw";
    public static final String CASES_RAW = "gsih.cases.raw";
    public static final String DEAD_LETTER = "gsih.ingest.dlq";

    private Topics() {}
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record RawIncident(
      String sourceSystem,
      String sourceId,
      String siteCode,
      String category,
      String severity,
      String description,
      String reportedBy,
      Instant occurredAt,
      BigDecimal lossAmount,
      Map<String, Object> extra) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record RawAccessEvent(
      String sourceSystem,
      String sourceId,
      String siteCode,
      String badgeId,
      String doorId,
      String result,
      Instant eventTime,
      Boolean tailgate,
      Map<String, Object> extra) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record RawAlarmEvent(
      String sourceSystem,
      String sourceId,
      String siteCode,
      String cameraId,
      String alarmType,
      String severity,
      Instant eventTime,
      Map<String, Object> extra) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record RawCase(
      String sourceSystem,
      String sourceId,
      String caseNumber,
      String title,
      String category,
      String status,
      String priority,
      String assigneeEmail,
      String siteCode,
      Instant openedAt,
      Instant dueAt,
      Instant closedAt,
      BigDecimal financialImpact,
      Map<String, Object> extra) {}
}
