package com.att.gsih.ingest.consumer;

import com.att.gsih.common.event.RawEvents.RawAccessEvent;
import com.att.gsih.common.event.RawEvents.RawAlarmEvent;
import com.att.gsih.common.event.RawEvents.RawCase;
import com.att.gsih.common.event.RawEvents.RawIncident;
import com.att.gsih.common.event.RawEvents.Topics;
import com.att.gsih.ingest.normalize.CanonicalRows;
import com.att.gsih.ingest.normalize.Normalizer;
import com.att.gsih.ingest.sink.SiteDirectory;
import com.att.gsih.ingest.sink.WarehouseSink;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Batch consumers for the four raw feeds (Section 5.1 — Webhooks / Streaming).
 *
 * <p>Offsets commit only after the warehouse write returns. Combined with the sink's upserts, an
 * at-least-once redelivery converges on the same warehouse state rather than double-counting an
 * incident into anyone's KPIs.
 */
@Component
public class FeedConsumers {

  private static final Logger log = LoggerFactory.getLogger(FeedConsumers.class);

  private final Normalizer normalizer;
  private final RecordParser parser;
  private final WarehouseSink sink;
  private final SiteDirectory sites;
  private final MeterRegistry meters;
  private final Counter unmappedCategories;
  private final Counter unknownSites;

  public FeedConsumers(
      Normalizer normalizer,
      RecordParser parser,
      WarehouseSink sink,
      SiteDirectory sites,
      MeterRegistry meters) {
    this.normalizer = normalizer;
    this.parser = parser;
    this.sink = sink;
    this.sites = sites;
    this.meters = meters;
    this.unmappedCategories =
        Counter.builder("gsih.ingest.unmapped_category")
            .description("Vendor categories that fell back to OTHER — feeds the mapping backlog")
            .register(meters);
    this.unknownSites =
        Counter.builder("gsih.ingest.unknown_site")
            .description("Events referencing a site the facilities feed has never published")
            .register(meters);
  }

  @KafkaListener(topics = Topics.INCIDENTS_RAW, containerFactory = "batchListenerFactory")
  public void onIncidents(List<String> payloads) {
    List<CanonicalRows.IncidentRow> rows =
        parser.parseAll(payloads, RawIncident.class, Topics.INCIDENTS_RAW).stream()
            .map(normalizer::incident)
            .toList();
    if (rows.isEmpty()) {
      return;
    }
    rows.stream()
        .filter(CanonicalRows.IncidentRow::unmappedCategory)
        .forEach(r -> unmappedCategories.increment());
    countUnknownSites(rows.stream().map(CanonicalRows.IncidentRow::siteCode).toList());
    sink.writeIncidents(rows);
    meters.counter("gsih.ingest.records", "feed", "incidents").increment(rows.size());
    log.debug("ingested {} incidents", rows.size());
  }

  @KafkaListener(topics = Topics.CASES_RAW, containerFactory = "batchListenerFactory")
  public void onCases(List<String> payloads) {
    List<CanonicalRows.CaseRow> rows =
        parser.parseAll(payloads, RawCase.class, Topics.CASES_RAW).stream()
            .map(normalizer::caseRecord)
            .toList();
    if (rows.isEmpty()) {
      return;
    }
    countUnknownSites(rows.stream().map(CanonicalRows.CaseRow::siteCode).toList());
    sink.writeCases(rows);
    meters.counter("gsih.ingest.records", "feed", "cases").increment(rows.size());
  }

  @KafkaListener(topics = Topics.ACCESS_RAW, containerFactory = "batchListenerFactory")
  public void onAccess(List<String> payloads) {
    List<CanonicalRows.AccessRow> rows =
        parser.parseAll(payloads, RawAccessEvent.class, Topics.ACCESS_RAW).stream()
            .map(raw -> normalizer.access(raw, sites.zoneOf(upper(raw.siteCode()))))
            .toList();
    if (rows.isEmpty()) {
      return;
    }
    sink.writeAccessEvents(rows);
    meters.counter("gsih.ingest.records", "feed", "access").increment(rows.size());
  }

  @KafkaListener(topics = Topics.ALARMS_RAW, containerFactory = "batchListenerFactory")
  public void onAlarms(List<String> payloads) {
    List<CanonicalRows.AlarmRow> rows =
        parser.parseAll(payloads, RawAlarmEvent.class, Topics.ALARMS_RAW).stream()
            .map(normalizer::alarm)
            .toList();
    if (rows.isEmpty()) {
      return;
    }
    sink.writeAlarmEvents(rows);
    meters.counter("gsih.ingest.records", "feed", "alarms").increment(rows.size());
  }

  private void countUnknownSites(List<String> siteCodes) {
    siteCodes.stream()
        .filter(code -> code != null && sites.regionOf(code) == null)
        .forEach(code -> unknownSites.increment());
  }

  private static String upper(String value) {
    return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
  }
}
