package com.att.gsih.api.dto;

import java.util.List;

/**
 * An entity link graph around a seed record — the "link analysis" an investigator reaches
 * for when a case stops being about one incident and starts being about a pattern.
 *
 * <p>The shape is deliberately generic (typed nodes, typed edges) rather than a fixed
 * case-to-incident structure, because the questions grow: today it is "what else happened
 * at this site", next quarter it is "which badge appears across all three sites".
 */
public final class LinkGraph {

  private LinkGraph() {}

  /** What a node represents. Drives both its shape on the canvas and its detail panel. */
  public enum NodeType {
    CASE,
    SITE,
    INCIDENT,
    BADGE,
    ALARM
  }

  /** How two nodes are related. */
  public enum EdgeType {
    /** A case or incident is located at a site. */
    AT_SITE,
    /** A case was opened from an incident. */
    FROM_INCIDENT,
    /** A badge was read at a site. */
    ACCESSED,
    /** An alarm was raised at a site. */
    RAISED_AT
  }

  /**
   * @param id stable within one response; the client keys layout and selection off it
   * @param hops distance from the seed node, in edges. The seed is 0.
   * @param weight relative importance for sizing — incident count, access count, or 1
   * @param detail ordered label/value pairs shown when the node is selected
   */
  public record Node(
      String id,
      NodeType type,
      String label,
      String sublabel,
      int hops,
      double weight,
      List<Detail> detail) {}

  public record Detail(String label, String value) {}

  public record Edge(String source, String target, EdgeType type, String label, double weight) {}

  /**
   * @param truncated true when the traversal hit its node budget and stopped early, so the
   *     UI can say "showing the strongest N connections" instead of implying completeness
   */
  public record Graph(
      String seedId,
      String seedLabel,
      List<Node> nodes,
      List<Edge> edges,
      int nodeBudget,
      boolean truncated) {}
}
