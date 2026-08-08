package com.att.gsih.api.web;

import com.att.gsih.api.dto.LinkGraph.Graph;
import com.att.gsih.api.security.CurrentUser;
import com.att.gsih.api.service.AuditService;
import com.att.gsih.api.service.LinkGraphService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Link analysis over the consolidated records.
 *
 * <p>The tables answer "what is in my queue"; this answers "what else touches this case" —
 * the same site, the same badge after hours, the same alarm pattern. Reads are audited
 * like every other, and region confinement is enforced on every site the traversal
 * reaches, not only on the seed.
 */
@RestController
@RequestMapping("/api/v1/graph")
@Tag(name = "Link Analysis", description = "Entity graph across cases, sites, incidents, badges and alarms")
public class LinkGraphController {

  private static final int MAX_NODE_BUDGET = 250;

  private final LinkGraphService graphs;
  private final AuditService audit;

  public LinkGraphController(LinkGraphService graphs, AuditService audit) {
    this.graphs = graphs;
    this.audit = audit;
  }

  @GetMapping("/cases/{caseNumber}")
  @PreAuthorize("hasAnyRole('INVESTIGATOR','MANAGER','EXECUTIVE')")
  @Operation(summary = "Entity link graph around one case, bounded by hops and a node budget")
  public ResponseEntity<Graph> aroundCase(
      Authentication authentication,
      @PathVariable String caseNumber,
      @RequestParam(defaultValue = "2") int hops,
      @RequestParam(defaultValue = "60") int nodeBudget) {

    CurrentUser user = CurrentUser.from(authentication);
    Graph graph;
    try {
      graph =
          graphs.aroundCase(
              caseNumber,
              user.regionScope(),
              hops,
              Math.min(Math.max(nodeBudget, 5), MAX_NODE_BUDGET));
    } catch (IllegalArgumentException unknownCase) {
      return ResponseEntity.notFound().build();
    }

    audit.record(
        user,
        "READ",
        "graph:case",
        "case=%s hops=%d".formatted(caseNumber, hops),
        graph.nodes().size());
    return ResponseEntity.ok(graph);
  }
}
