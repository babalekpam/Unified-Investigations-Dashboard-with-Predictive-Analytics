package com.att.gsih.api.web;

import com.att.gsih.api.domain.CaseRecord;
import com.att.gsih.api.dto.Dashboards.CaseSummary;
import com.att.gsih.api.dto.Dashboards.IncidentSummary;
import com.att.gsih.api.repo.CaseRepository;
import com.att.gsih.api.repo.IncidentRepository;
import com.att.gsih.api.security.CurrentUser;
import com.att.gsih.api.service.AuditService;
import com.att.gsih.api.service.DashboardService;
import com.att.gsih.common.model.Enums.CaseStatus;
import com.att.gsih.common.model.Enums.IncidentType;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read access to the consolidated case and incident tables. */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Cases & Incidents", description = "Consolidated read model across all source systems")
public class CaseController {

  private static final int MAX_PAGE_SIZE = 200;

  private final CaseRepository cases;
  private final IncidentRepository incidents;
  private final DashboardService dashboards;
  private final AuditService audit;

  public CaseController(
      CaseRepository cases,
      IncidentRepository incidents,
      DashboardService dashboards,
      AuditService audit) {
    this.cases = cases;
    this.incidents = incidents;
    this.dashboards = dashboards;
    this.audit = audit;
  }

  @GetMapping("/cases")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Search consolidated cases, scoped to the caller's region")
  public Page<CaseSummary> search(
      Authentication authentication,
      @RequestParam(required = false) String region,
      @RequestParam(required = false) CaseStatus status,
      @RequestParam(required = false) String siteCode,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {

    CurrentUser user = CurrentUser.from(authentication);
    String scope = user.regionScope() != null ? user.regionScope() : region;

    Page<CaseSummary> result =
        cases
            .search(
                scope,
                status,
                siteCode,
                PageRequest.of(page, Math.min(size, MAX_PAGE_SIZE), Sort.by("openedAt").descending()))
            .map(dashboards::toSummary);

    audit.record(
        user,
        "SEARCH",
        "case",
        "region=%s status=%s site=%s".formatted(scope, status, siteCode),
        result.getNumberOfElements());
    return result;
  }

  @GetMapping("/cases/{caseNumber}")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Fetch one case by its canonical case number")
  public ResponseEntity<CaseSummary> byNumber(
      Authentication authentication, @PathVariable String caseNumber) {

    CurrentUser user = CurrentUser.from(authentication);
    CaseRecord record = cases.findByCaseNumber(caseNumber).orElse(null);
    if (record == null) {
      return ResponseEntity.notFound().build();
    }
    // Region scoping applies to single reads too, or it would be a hole around the search filter.
    String scope = user.regionScope();
    if (scope != null && !scope.equals(record.getRegion())) {
      throw new AccessDeniedException("case belongs to another region");
    }
    audit.record(user, "READ", "case", caseNumber, 1);
    return ResponseEntity.ok(dashboards.toSummary(record));
  }

  @GetMapping("/incidents")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Search consolidated incident reports, including vandalism history")
  public Page<IncidentSummary> incidents(
      Authentication authentication,
      @RequestParam(required = false) String region,
      @RequestParam(required = false) String siteCode,
      @RequestParam(required = false) IncidentType type,
      @RequestParam(defaultValue = "365") int lookbackDays,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {

    CurrentUser user = CurrentUser.from(authentication);
    String scope = user.regionScope() != null ? user.regionScope() : region;
    Instant since = Instant.now().minus(lookbackDays, ChronoUnit.DAYS);

    Page<IncidentSummary> result =
        incidents
            .search(
                scope,
                siteCode,
                type,
                since,
                PageRequest.of(
                    page, Math.min(size, MAX_PAGE_SIZE), Sort.by("occurredAt").descending()))
            .map(
                i ->
                    new IncidentSummary(
                        i.getId().toString(),
                        i.getSiteCode(),
                        i.getRegion(),
                        i.getIncidentType(),
                        i.getSeverity(),
                        i.getDescription(),
                        i.getOccurredAt(),
                        i.getLossAmount(),
                        i.getCaseNumber(),
                        i.getSourceSystem() == null ? null : i.getSourceSystem().name()));

    audit.record(
        user,
        "SEARCH",
        "incident",
        "region=%s site=%s type=%s".formatted(scope, siteCode, type),
        result.getNumberOfElements());
    return result;
  }
}
