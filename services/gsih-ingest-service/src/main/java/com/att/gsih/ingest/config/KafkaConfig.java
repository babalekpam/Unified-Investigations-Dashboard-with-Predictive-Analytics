package com.att.gsih.ingest.config;

import com.att.gsih.ingest.normalize.Normalizer;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.util.Map;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.util.backoff.FixedBackOff;

/**
 * Kafka wiring for the raw feeds.
 *
 * <p>Records arrive as raw JSON strings and are parsed per record inside the listener rather than by
 * a typed deserializer. That is deliberate: with batch listeners, a deserializer failure poisons the
 * whole batch, so one malformed vendor payload would hold up every other site's events on that
 * partition. Parsing per record means a bad payload is routed to the dead-letter topic on its own
 * and the rest of the batch still lands.
 */
@Configuration
@EnableScheduling
public class KafkaConfig {

  @Bean
  Normalizer normalizer(@Value("${gsih.ingest.badge-salt}") String badgeSalt) {
    return new Normalizer(badgeSalt);
  }

  /**
   * The JSON reader for incoming vendor payloads.
   *
   * <p>Declared here rather than inherited from Boot's auto-configuration, which does not apply to
   * this service: {@code JacksonAutoConfiguration} is conditional on {@code
   * Jackson2ObjectMapperBuilder}, a Spring MVC class, and a headless Kafka consumer has no
   * spring-web on its classpath. Without this bean the application does not start at all — the
   * parser has no {@code ObjectMapper} to inject. Pulling spring-web in to satisfy an autoconfigure
   * condition would be the wrong fix for a service that serves nothing.
   *
   * <p>The two settings are the ones that matter for ingest. Unknown properties are ignored,
   * because a vendor adding a field to their payload must not stop a feed; timestamps are read as
   * ISO-8601 into {@code Instant} rather than as epoch numbers, which is what every source system
   * here actually sends.
   */
  @Bean
  ObjectMapper ingestObjectMapper() {
    return JsonMapper.builder()
        .addModule(new JavaTimeModule())
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .disable(DeserializationFeature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE)
        .build();
  }

  @Bean
  ConsumerFactory<String, String> consumerFactory(KafkaProperties properties) {
    Map<String, Object> config = properties.buildConsumerProperties(null);
    config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
    config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
    config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
    config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
    config.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);
    return new DefaultKafkaConsumerFactory<>(config);
  }

  @Bean
  ConcurrentKafkaListenerContainerFactory<String, String> batchListenerFactory(
      ConsumerFactory<String, String> consumerFactory) {

    ConcurrentKafkaListenerContainerFactory<String, String> factory =
        new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(consumerFactory);
    factory.setBatchListener(true);
    factory.setConcurrency(3);
    // A warehouse write that fails is retried three times with a fixed pause; a persistent failure
    // (schema drift, database down) stops the container rather than silently skipping records.
    factory.setCommonErrorHandler(new DefaultErrorHandler(new FixedBackOff(2_000L, 3L)));
    return factory;
  }
}
