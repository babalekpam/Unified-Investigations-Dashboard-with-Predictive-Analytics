package com.att.gsih.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.IncidentRepository;
import com.att.gsih.api.repo.SiteRepository;
import com.att.gsih.api.repo.RiskScoreRepository;
import com.att.gsih.common.model.Enums.IncidentType;
import com.att.gsih.common.model.Enums.RiskBand;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"local", "test"})
class DashboardApiTest {

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

    sites.save(TestData.site("SITE-1", "SOUTHWEST"));
    sites.save(TestData.site("SITE-2", "NORTHEAST"));

    cases.save(
        TestData.openCase(
            "SW-1001", "dana@att.com", "SITE-1", "SOUTHWEST", NOW.minus(20, ChronoUnit.DAYS)));
    cases.save(
        TestData.openCase(
            "SW-1002", "dana@att.com", "SITE-1", "SOUTHWEST", NOW.minus(3, ChronoUnit.DAYS)));
    cases.save(
        TestData.openCase(
            "NE-2001", "sam@att.com", "SITE-2", "NORTHEAST", NOW.minus(5, ChronoUnit.DAYS)));
    cases.save(
        TestData.closedCase(
            "SW-0900", "SOUTHWEST", NOW.minus(40, ChronoUnit.DAYS), NOW.minus(10, ChronoUnit.DAYS)));

    // Three vandalism incidents at SITE-1 in the last 90 days: enough to raise a repeat flag.
    for (int i = 1; i <= 3; i++) {
      incidents.save(
          TestData.incident(
              "SITE-1", "SOUTHWEST", IncidentType.VANDALISM, NOW.minus(i * 10L, ChronoUnit.DAYS)));
    }

    riskScores.save(
        TestData.riskScore("SITE-1", "SOUTHWEST", 0.81, RiskBand.HIGH, LocalDate.now()));
    riskScores.save(
        TestData.riskScore("SITE-2", "NORTHEAST", 0.18, RiskBand.LOW, LocalDate.now()));
  }

  private static RequestPostProcessor user(String email, String role, String region) {
    return jwt()
        .jwt(
            (Jwt.Builder b) -> {
              b.claim("preferred_username", email).claim("roles", java.util.List.of(role));
              if (region != null) {
                b.claim("region", region);
              }
            })
        .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
  }

  @Test
  void investigatorSeesOwnQueueWithRepeatIncidentFlag() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.openCases").value(2))
        .andExpect(jsonPath("$.queue[0].caseNumber").exists())
        .andExpect(jsonPath("$.repeatIncidentFlags[0].siteCode").value("SITE-1"))
        .andExpect(jsonPath("$.repeatIncidentFlags[0].occurrencesLast90Days").value(3))
        // SITE-1 scores 0.81, so the investigator is warned about it on their own dashboard.
        .andExpect(jsonPath("$.alerts[0].siteCode").value("SITE-1"))
        .andExpect(jsonPath("$.alerts[0].riskBand").value("HIGH"));
  }

  @Test
  void investigatorCannotOpenAnotherInvestigatorsQueue() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/investigator")
                .param("investigator", "sam@att.com")
                .with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isForbidden());
  }

  @Test
  void managerViewIsConfinedToTheirOwnRegion() throws Exception {
    // Asks for NORTHEAST but carries a SOUTHWEST region claim: the claim wins.
    mvc.perform(
            get("/api/v1/dashboards/manager")
                .param("region", "NORTHEAST")
                .with(user("mgr@att.com", "MANAGER", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.region").value("SOUTHWEST"))
        .andExpect(jsonPath("$.openCases").value(2))
        .andExpect(jsonPath("$.closedLast30Days").value(1))
        .andExpect(jsonPath("$.vandalismAlerts[0].siteCode").value("SITE-1"));
  }

  @Test
  void investigatorIsRefusedTheManagerView() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/manager").with(user("dana@att.com", "INVESTIGATOR", "SOUTHWEST")))
        .andExpect(status().isForbidden());
  }

  @Test
  void executiveSeesEveryRegionAndTheRiskPosture() throws Exception {
    mvc.perform(get("/api/v1/dashboards/executive").with(user("exec@att.com", "EXECUTIVE", null)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalInvestigations").value(4))
        .andExpect(jsonPath("$.riskPosture.highRiskSites").value(1))
        .andExpect(jsonPath("$.riskPosture.lowRiskSites").value(1))
        .andExpect(jsonPath("$.regions.length()").value(2));
  }

  @Test
  void managerIsRefusedTheExecutiveView() throws Exception {
    mvc.perform(
            get("/api/v1/dashboards/executive").with(user("mgr@att.com", "MANAGER", "SOUTHWEST")))
        .andExpect(status().isForbidden());
  }

  @Test
  void caseSearchIsRegionScopedEvenWhenAnotherRegionIsRequested() throws Exception {
    mvc.perform(
            get("/api/v1/cases")
                .param("region", "NORTHEAST")
                .with(user("mgr@att.com", "MANAGER", "SOUTHWEST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(3))
        .andExpect(jsonPath("$.content[0].region").value("SOUTHWEST"));
  }

  @Test
  void singleCaseReadAcrossRegionsIsRefused() throws Exception {
    mvc.perform(
            get("/api/v1/cases/NE-2001").with(user("mgr@att.com", "MANAGER", "SOUTHWEST")))
        .andExpect(status().isForbidden());
  }

  @Test
  void unauthenticatedCallersGetNothing() throws Exception {
    mvc.perform(get("/api/v1/dashboards/executive")).andExpect(status().isUnauthorized());
  }
}
