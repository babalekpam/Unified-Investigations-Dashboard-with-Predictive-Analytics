package com.att.gsih.ingest.consumer;

import com.att.gsih.common.event.RawEvents.Topics;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Parses raw feed payloads one record at a time, quarantining anything unreadable.
 *
 * <p>A payload that cannot be parsed is republished to {@code gsih.ingest.dlq} with the original
 * topic as the message key, so the integration team can see which connector produced it. The record
 * is never dropped silently — Section 5.3 governance treats a lost event the same as a wrong one.
 */
@Component
public class RecordParser {

  private static final Logger log = LoggerFactory.getLogger(RecordParser.class);

  private final ObjectMapper objectMapper;
  private final KafkaTemplate<String, String> deadLetters;
  private final Counter quarantined;

  public RecordParser(
      ObjectMapper objectMapper, KafkaTemplate<String, String> deadLetters, MeterRegistry meters) {
    this.objectMapper = objectMapper;
    this.deadLetters = deadLetters;
    this.quarantined =
        Counter.builder("gsih.ingest.quarantined")
            .description("Payloads that could not be parsed and were sent to the dead-letter topic")
            .register(meters);
  }

  /** Parses every payload it can; unreadable ones go to the DLQ and are left out of the result. */
  public <T> List<T> parseAll(List<String> payloads, Class<T> type, String sourceTopic) {
    List<T> parsed = new ArrayList<>(payloads.size());
    for (String payload : payloads) {
      try {
        parsed.add(objectMapper.readValue(payload, type));
      } catch (Exception ex) {
        quarantined.increment();
        log.warn("quarantining unparseable payload from {}: {}", sourceTopic, ex.getMessage());
        try {
          deadLetters.send(Topics.DEAD_LETTER, sourceTopic, payload);
        } catch (RuntimeException sendFailure) {
          log.error("could not publish to the dead-letter topic", sendFailure);
        }
      }
    }
    return parsed;
  }
}
