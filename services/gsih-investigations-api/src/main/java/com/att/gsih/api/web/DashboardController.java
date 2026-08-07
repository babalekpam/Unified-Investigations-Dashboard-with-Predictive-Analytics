package com.att.gsih.api.web;

import com.att.gsih.api.dto.Dashboards.ExecutiveView;
import com.att.gsih.api.dto.Dashboards.InvestigatorView;
import com.att.gsih.api.dto.Dashboards.ManagerView;
import com.att.gsih.api.security.CurrentUser;
import com.att.gsih.api.service.AuditService;
import com.att.gsih.api.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The three role-based views of Section 7, one endpoint each. */
@RestController
@RequestMapping("/api/v1/dashboards")
@Tag(name = "Dashboards", description = "Investigator, Manager and Executive views")
public class DashboardController {

  private final DashboardService dashboards;
  private final AuditService audit;

  public DashboardController(DashboardService dashboards, AuditService audit) {
    this.dashboards = dashboards;
    this.audit = audit;
  }

  @GetMapping("/investigator")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Section 7.1 — personal case queue, deadlines and repeat-incident flags")
  public InvestigatorView investigator(
      Authentication authentication, @RequestParam(required = false) String investigator) {

    CurrentUser user = CurrentUser.from(authentication);
    String target = investigator == null ? user.email() : investigator;

    // An investigator may only read their own queue. Managers and executives may open a team
    // member's queue, which is why the override parameter exists at all.
    boolean viewingSomeoneElse = !target.equalsIgnoreCase(user.email());
    if (viewingSomeoneElse
        && user.role() == com.att.gsih.common.model.Enums.UserRole.INVESTIGATOR) {
      throw new AccessDeniedException("investigators may only view their own queue");
    }

    InvestigatorView view = dashboards.investigatorView(target, Instant.now());
    audit.record(user, "READ", "dashboard:investigator", "target=" + target, view.openCases());
    return view;
  }

  @GetMapping("/manager")
  @PreAuthorize("hasAnyRole('MANAGER','EXECUTIVE')")
  @Operation(summary = "Section 7.2 — workload, aging, closure rate and regional vandalism risk")
  public ManagerView manager(
      Authentication authentication, @RequestParam(required = false) String region) {

    CurrentUser user = CurrentUser.from(authentication);
    // A manager's own region always wins over a requested one; only an executive may pick.
    String scope = user.regionScope() != null ? user.regionScope() : region;

    ManagerView view = dashboards.managerView(scope, Instant.now());
    audit.record(user, "READ", "dashboard:manager", "region=" + scope, (int) view.openCases());
    return view;
  }

  @GetMapping("/executive")
  @PreAuthorize("hasRole('EXECUTIVE')")
  @Operation(summary = "Section 7.3 — enterprise posture, hotspots and predicted vandalism trend")
  public ResponseEntity<ExecutiveView> executive(Authentication authentication) {
    CurrentUser user = CurrentUser.from(authentication);
    ExecutiveView view = dashboards.executiveView(Instant.now());
    audit.record(
        user, "READ", "dashboard:executive", "enterprise", (int) view.totalInvestigations());
    return ResponseEntity.ok(view);
  }
}
