package com.att.gsih.api.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Refuses to start without an explicit security profile.
 *
 * <p>The API verifies tokens one of two ways: {@code azure} trusts Microsoft Entra ID,
 * {@code local} trusts a symmetric key and exposes a demo token endpoint that will mint a
 * token with any role asked for. Neither is a safe default to fall into by accident — so
 * there is no default, and starting without one stops here with a message that says what
 * to do rather than an obscure missing-bean error later in the context refresh.
 */
@Configuration
public class ProfileGuard {

  private static final Logger log = LoggerFactory.getLogger(ProfileGuard.class);

  private final Environment environment;

  public ProfileGuard(Environment environment) {
    this.environment = environment;
  }

  @PostConstruct
  void verify() {
    boolean local = environment.matchesProfiles("local");
    boolean azure = environment.matchesProfiles("azure");

    if (local && azure) {
      throw new IllegalStateException(
          "Profiles 'local' and 'azure' are both active. Choose one: 'local' trusts a "
              + "symmetric key, 'azure' trusts Entra ID.");
    }
    if (!local && !azure) {
      throw new IllegalStateException(
          "No security profile selected. Set SPRING_PROFILES_ACTIVE=azure for a deployed "
              + "environment, or SPRING_PROFILES_ACTIVE=local for the demo stack.");
    }
    if (local) {
      log.warn(
          "Profile 'local' is active: tokens are signed with a symmetric key and "
              + "/api/v1/auth/local-token will issue a token for ANY requested role. "
              + "This profile must never run in a deployed environment.");
    }
  }
}
