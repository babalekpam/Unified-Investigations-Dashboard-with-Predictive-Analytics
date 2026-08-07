package com.att.gsih.ingest.config;

import com.att.gsih.ingest.normalize.Normalizer;
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
