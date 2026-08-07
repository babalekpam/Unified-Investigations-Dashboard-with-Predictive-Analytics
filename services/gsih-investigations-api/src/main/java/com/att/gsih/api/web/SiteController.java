package com.att.gsih.api.web;

import com.att.gsih.api.domain.Site;
import com.att.gsih.api.repo.SiteRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Facility reference data from the GIS feed (Section 4.1, row 8). */
@RestController
@RequestMapping("/api/v1/sites")
@Tag(name = "Sites", description = "Facility reference data")
public class SiteController {

  private final SiteRepository sites;

  public SiteController(SiteRepository sites) {
    this.sites = sites;
  }

  @GetMapping
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "List sites, optionally filtered by region")
  public List<Site> list(@RequestParam(required = false) String region) {
    return region == null ? sites.findAll() : sites.findByRegion(region);
  }

  @GetMapping("/regions")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Distinct regions, for the dashboard region picker")
  public List<String> regions() {
    return sites.distinctRegions();
  }
}
