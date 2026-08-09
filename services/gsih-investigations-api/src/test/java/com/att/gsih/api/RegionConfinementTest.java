package com.att.gsih.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.IncidentRepository;
import com.att.gsih.api.repo.RiskScoreRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.RiskBand;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Region confinement across every endpoint that returns regional data.
 *
 * <p>These exist because a review found three endpoints that enforced the role but not the
 * region — the investigator-queue override, site risk history, and the site list. Each was
 * a way for a caller in one region to read another region's data while every other endpoint
 * scoped correctly, so the property is now asserted at the surface rather than assumed from
 * the query layer.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"local", "test"})
class RegionConfinementTest {

  @Autowired MockMvc mvc;
  @Autowired CaseRepository cases;
  @Autowired IncidentRepository incidents;
  @Autowired SiteRepository sites;
  @Autowired RiskScoreRepository riskScores;

  private static final Instant NOW = Instant.now();

  @BeforeEach
  void seed() {
    cases.deleteAll();
    incidents.deleteAll();
    riskScores.deleteAll();
    sites.deleteAll();

    sites.save(TestData.site("SW-SITE", "SOUTHWEST"));
    sites.save(TestData.site("NE-SITE", "NORTHEAST"));

    cases.save(TestData.openCase("SW-1", "dana@att.com", "SW-SITE", "SOUTHWEST", NOW.minus(4, ChronoUnit.DAYS)));
    cases.save(TestData.openCase("NE-1", "sam@att.com", "NE-SITE", "NORTHEAST", NOW.minus(4, ChronoUnit.DAYS)));
    cases.save(TestData.openCase("NE-2", "sam@att.com", "NE-SITE", "NORTHEAST", NOW.minus(6, ChronoUnit.DAYS)));

    riskScores.save(TestData.riskScore("NE-SITE", "NORTHEAST", 0.9, RiskBand.HIGH, LocalDate.now()));
    riskScores.save(TestData.riskScore("SW-SITE", "SOUTHWEST", 0.2, RiskBand.LOW, LocalDate.now()));
  }

  private static RequestPostProcessor user(String email, String role, String region) {
    return jwt()
        .jwt(
            (Jwt.Builder b) -> {
              b.claim("preferred_username", email).claim("roles", List.of(role));
              if (region != null) {
                b.claim("region", region);
              }
            })
        .authorities(new SimpleGrantedAuthority("ROLE_" + role));
  }

  @Test
  void managerCannotUseTheQueueOverrideToReadAnotherRegion() throws Exception {
    // The role check passes — a manager may open a team member's queue. Without the region
    // predicate this returned the whole NORTHEAST queue, and its site risk with it.
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .param("investigator", "sam@att.com")
                .with(user("mgr@att.com", "MANAGER", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.openCases").value(0))
        .andExpect(jsonPath("$.queue.length()").value(0))
        .andExpect(jsonPath("$.alerts.length()").value(0));
  }

  @Test
  void anExecutiveStillSeesTheWholeQueue() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .param("investigator", "sam@att.com")
                .with(user("exec@att.com", "EXECUTIVE", null)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.openCases").value(2));
  }

  @Test
  void siteRiskHistoryIsRefusedAcrossRegions() throws Exception {
    mvc.perform(get("/api/v1/risk/sites/NE-SITE/history").with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isForbidden());

    mvc.perform(get("/api/v1/risk/sites/SW-SITE/history").with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
  }

  @Test
  void theSiteListIsConfinedToTheCallersRegion() throws Exception {
    mvc.perform(get("/api/v1/sites").with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].region").value("SOUTHWEST"));

    // Asking for another region returns their own, as everywhere else.
    mvc.perform(
            get("/api/v1/sites")
                .param("region", "NORTHEAST")
                .with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].region").value("SOUTHWEST"));
  }

  @Test
  void theRegionPickerOffersOnlyTheCallersRegion() throws Exception {
    // Leaking the list of region names tells a caller the shape of the estate.
    mvc.perform(get("/api/v1/sites/regions").with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0]").value("SOUTHWEST"));

    mvc.perform(get("/api/v1/sites/regions").with(user("exec@att.com", "EXECUTIVE", null)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2));
  }

  @Test
  void anInvestigatorReadingTheirOwnQueueIsUnaffected() throws Exception {
    incidents.save(TestData.incident("SW-SITE", "SOUTHWEST", IncidentType.VANDALISM, NOW.minus(3, ChronoUnit.DAYS)));

    mvc.perform(get("/api/v1/dashboards/investigator").with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.openCases").value(1));
  }
}
