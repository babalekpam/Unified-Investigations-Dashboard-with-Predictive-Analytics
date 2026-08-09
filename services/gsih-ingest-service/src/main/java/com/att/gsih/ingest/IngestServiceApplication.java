package com.att.gsih.ingest;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Global Security Intelligence Hub — streaming ingest service.
 *
 * <p>Implements Steps 1–3 of Section 5.2 for the real-time feeds: consume what the connectors
 * publish, map it onto the canonical model, and upsert it into the serving warehouse. Batch and
 * legacy sources take the Databricks path in {@code pipelines/} instead; both land in the same
 * tables.
 *
 */
@SpringBootApplication
public class IngestServiceApplication {

  public static void main(String[] args) {
    SpringApplication.run(IngestServiceApplication.class, args);
  }
}
