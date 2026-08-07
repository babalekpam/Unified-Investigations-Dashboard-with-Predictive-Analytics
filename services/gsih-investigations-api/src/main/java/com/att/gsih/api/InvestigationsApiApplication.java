package com.att.gsih.api;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Global Security Intelligence Hub — investigations API.
 *
 * <p>Serving layer of the presentation tier described in Section 3.2. It reads the curated
 * (gold-layer) tables published by the Databricks pipelines and exposes them as the role-based
 * dashboards of Section 7.
 */
@SpringBootApplication
@OpenAPIDefinition(
    info =
        @Info(
            title = "Global Security Intelligence Hub — Investigations API",
            version = "1.0.0",
            description =
                "Unified investigations read model and predictive risk endpoints. "
                    + "Read-only with respect to every source system."))
public class InvestigationsApiApplication {

  public static void main(String[] args) {
    SpringApplication.run(InvestigationsApiApplication.class, args);
  }
}
