package com.att.gsih.api.web;

import com.att.gsih.api.dto.Dashboards.ForecastPoint;
import com.att.gsih.api.dto.Dashboards.RiskAlert;
import com.att.gsih.api.dto.Dashboards.RiskPosture;
import com.att.gsih.api.dto.RiskIngest.ForecastBatch;
import com.att.gsih.api.dto.RiskIngest.ScoreBatch;
import com.att.gsih.api.security.CurrentUser;
import com.att.gsih.api.service.AuditService;
import com.att.gsih.api.service.RiskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The predictive layer's read and write surface (Section 6).
 *
 * <p>Reads are open to all three dashboard roles; writes are restricted to the analytics service's
 * workload identity so a signed-in user can never inject a risk score.
 */
@RestController
@RequestMapping("/api/v1/risk")
@Tag(name = "Predictive Risk", description = "Vandalism risk scores, heat map and trend forecast")
public class RiskController {

  private final RiskService risk;
  private final AuditService audit;

  public RiskController(RiskService risk, AuditService audit) {
    this.risk = risk;
    this.audit = audit;
  }

  @GetMapping("/alerts")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Current site risk alerts, highest score first (Section 6.5)")
  public List<RiskAlert> alerts(
      Authentication authentication,
      @RequestParam(required = false) String region,
      @RequestParam(defaultValue = "25") int limit) {

    CurrentUser user = CurrentUser.from(authentication);
    String scope = user.regionScope() != null ? user.regionScope() : region;
    List<RiskAlert> alerts = risk.currentAlerts(scope, limit);
    audit.record(user, "READ", "risk:alerts", "region=" + scope, alerts.size());
    return alerts;
  }

  @GetMapping("/heatmap")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Every scored site with coordinates, for the vandalism risk heat map")
  public List<RiskAlert> heatmap(
      Authentication authentication, @RequestParam(required = false) String region) {

    CurrentUser user = CurrentUser.from(authentication);
    String scope = user.regionScope() != null ? user.regionScope() : region;
    return risk.currentAlerts(scope, Integer.MAX_VALUE).stream()
        .filter(a -> a.latitude() != null && a.longitude() != null)
        .toList();
  }

  @GetMapping("/posture")
  @PreAuthorize("hasAnyRole('MANAGER','EXECUTIVE')")
  @Operation(summary = "Count of sites in each risk band as of the latest scoring run")
  public RiskPosture posture(
      Authentication authentication, @RequestParam(required = false) String region) {
    CurrentUser user = CurrentUser.from(authentication);
    return risk.posture(user.regionScope() != null ? user.regionScope() : region);
  }

  @GetMapping("/forecast")
  @PreAuthorize("hasAnyRole('MANAGER','EXECUTIVE')")
  @Operation(summary = "30 / 60 / 90-day incident trend projection with prediction interval")
  public List<ForecastPoint> forecast(
      Authentication authentication,
      @RequestParam(required = false) String region,
      @RequestParam(required = false) String siteCode) {
    CurrentUser user = CurrentUser.from(authentication);
    return risk.forecastCurve(user.regionScope() != null ? user.regionScope() : region, siteCode);
  }

  @GetMapping("/sites/{siteCode}/history")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Score history for one site, to show whether an intervention worked")
  public List<RiskAlert> history(@PathVariable String siteCode) {
    return risk.siteHistory(siteCode);
  }

  @PostMapping("/scores")
  @PreAuthorize("hasAuthority('ROLE_ANALYTICS_WRITER')")
  @Operation(summary = "Batch write from a scoring run — idempotent per site and date")
  public ResponseEntity<Map<String, Object>> writeScores(@Valid @RequestBody ScoreBatch batch) {
    int written = risk.saveScores(batch);
    return ResponseEntity.ok(
        Map.of("written", written, "received", batch.scores().size(), "modelVersion", batch.modelVersion()));
  }

  @PostMapping("/forecasts")
  @PreAuthorize("hasAuthority('ROLE_ANALYTICS_WRITER')")
  @Operation(summary = "Batch write of the time-series projection")
  public ResponseEntity<Map<String, Object>> writeForecasts(@Valid @RequestBody ForecastBatch batch) {
    return ResponseEntity.ok(Map.of("written", risk.saveForecasts(batch)));
  }
}
