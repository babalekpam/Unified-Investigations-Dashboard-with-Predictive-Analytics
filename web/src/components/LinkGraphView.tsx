import { useMemo, useState } from 'react'
import type { LinkGraph, LinkNode, NodeType } from '../api/types'
import { TooltipRows, useTooltip } from './useTooltip'

const WIDTH = 720
const HEIGHT = 460
const RING_GAP = 96

/**
 * Colour encodes distance from the seed, not entity type.
 *
 * Five entity types would need five categorical hues, and only the first three of any
 * validated categorical theme clear the all-pairs colour-vision floor — which is the
 * situation a scatter of nodes is. So type is carried by *shape*, the way link-analysis
 * tools have always done it, and the one hue left over does something a legend cannot:
 * it shows how far each node sits from the case you started at.
 */
const HOP_RAMP = ['var(--seq-5)', 'var(--seq-4)', 'var(--seq-3)', 'var(--seq-2)']

interface Placed {
  node: LinkNode
  x: number
  y: number
  radius: number
}

/** Marker path per entity type, drawn centred on the origin at the given radius. */
function shapeFor(type: NodeType, r: number): string {
  switch (type) {
    case 'CASE':
      // Rounded square — the record you are working, visually the "container".
      return `M ${-r} ${-r} h ${2 * r} v ${2 * r} h ${-2 * r} Z`
    case 'SITE':
      return '' // circle, handled separately
    case 'INCIDENT':
      return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z` // diamond
    case 'ALARM':
      return `M 0 ${-r} L ${r * 0.92} ${r * 0.7} L ${-r * 0.92} ${r * 0.7} Z` // triangle
    case 'BADGE':
      // Hexagon — a person-shaped thing without being a person icon.
      return Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2
        return `${i === 0 ? 'M' : 'L'} ${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`
      }).join(' ') + ' Z'
  }
}

const TYPE_LABEL: Record<NodeType, string> = {
  CASE: 'Case',
  SITE: 'Site',
  INCIDENT: 'Incident',
  BADGE: 'Badge (after hours)',
  ALARM: 'Alarm',
}

/**
 * Radial layout, computed deterministically.
 *
 * A force simulation would look more organic and settle somewhere slightly different on
 * every render, which is the wrong property for a screen an investigator returns to and
 * for a screenshot that goes in a case file. This lays the graph out as a tree from the
 * seed, giving each subtree an angular sector proportional to its size, so the same graph
 * always draws identically. Edges outside the tree are drawn on top as chords.
 */
function layout(graph: LinkGraph): Placed[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const adjacency = new Map<string, string[]>()
  for (const node of graph.nodes) adjacency.set(node.id, [])
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target)
    adjacency.get(edge.target)?.push(edge.source)
  }

  // Breadth-first from the seed, so each node gets exactly one parent.
  const parent = new Map<string, string | null>([[graph.seedId, null]])
  const children = new Map<string, string[]>()
  const order: string[] = [graph.seedId]
  const queue = [graph.seedId]

  while (queue.length > 0) {
    const current = queue.shift()!
    // Sorted so the layout does not depend on the order the API happened to emit edges in.
    const next = (adjacency.get(current) ?? []).filter((id) => !parent.has(id)).sort()
    for (const child of next) {
      parent.set(child, current)
      children.set(current, [...(children.get(current) ?? []), child])
      order.push(child)
      queue.push(child)
    }
  }

  // Nodes the traversal never reached (possible if the budget cut an edge) still get drawn,
  // parked on the outermost ring rather than dropped.
  const orphans = graph.nodes.filter((n) => !parent.has(n.id)).map((n) => n.id)

  const leaves = new Map<string, number>()
  const countLeaves = (id: string): number => {
    const kids = children.get(id) ?? []
    const total = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + countLeaves(k), 0)
    leaves.set(id, total)
    return total
  }
  countLeaves(graph.seedId)

  const placed: Placed[] = []
  const cx = WIDTH / 2
  const cy = HEIGHT / 2

  const place = (id: string, from: number, to: number, depth: number) => {
    const node = byId.get(id)!
    const mid = (from + to) / 2
    const radius = depth * RING_GAP
    placed.push({
      node,
      x: cx + radius * Math.cos(mid),
      y: cy + radius * Math.sin(mid),
      radius: 7 + node.weight * 3.2,
    })

    const kids = children.get(id) ?? []
    if (kids.length === 0) return
    const span = to - from
    let cursor = from
    for (const kid of kids) {
      const share = (leaves.get(kid) ?? 1) / (leaves.get(id) ?? 1)
      const width = span * share
      place(kid, cursor, cursor + width, depth + 1)
      cursor += width
    }
  }

  // Start at -90° so the first branch reads upward rather than to the right.
  place(graph.seedId, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 0)

  orphans.forEach((id, index) => {
    const node = byId.get(id)!
    const angle = (index / Math.max(orphans.length, 1)) * Math.PI * 2
    const radius = (Math.max(...placed.map((p) => p.node.hops), 1) + 1) * RING_GAP
    placed.push({
      node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      radius: 7 + node.weight * 3.2,
    })
  })

  return placed
}

/**
 * Link analysis around one case (Section 7.1).
 *
 * Answers the question the case table cannot: what else touches this? The same site, the
 * same badge read after hours somewhere else, the same alarm pattern.
 */
export function LinkGraphView({ graph }: { graph: LinkGraph }) {
  const { show, hide, element } = useTooltip()
  const [selected, setSelected] = useState<LinkNode | null>(null)

  const placed = useMemo(() => layout(graph), [graph])
  const positions = useMemo(
    () => new Map(placed.map((p) => [p.node.id, p])),
    [placed],
  )

  if (graph.nodes.length <= 1) {
    return <p className="notice">Nothing else in the last year connects to this case.</p>
  }

  const maxEdgeWeight = Math.max(...graph.edges.map((e) => e.weight), 1)

  /**
   * Which nodes carry a printed label.
   *
   * Past about twenty nodes the ring is dense enough that the labels collide into an
   * unreadable band around the rim — worse than no labels, because it looks like data.
   * Beyond that point only the seed, its immediate neighbours and whatever the reader has
   * clicked stay named; everything else is one hover away, and the table below lists all
   * of them.
   */
  const crowded = graph.nodes.length > 18
  const labelled = (node: LinkNode, isSelected: boolean) =>
    !crowded || node.hops <= 1 || isSelected

  return (
    <div style={{ position: 'relative' }}>
      <ul className="legend">
        <li>
          <svg width="13" height="13" aria-hidden="true">
            <rect x="2" y="2" width="9" height="9" fill="var(--text-secondary)" />
          </svg>
          Case
        </li>
        <li>
          <svg width="13" height="13" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5" fill="var(--text-secondary)" />
          </svg>
          Site
        </li>
        <li>
          <svg width="13" height="13" aria-hidden="true">
            <path d="M 6.5 1 L 12 6.5 L 6.5 12 L 1 6.5 Z" fill="var(--text-secondary)" />
          </svg>
          Incident
        </li>
        <li>
          <svg width="13" height="13" aria-hidden="true">
            <path d="M 6.5 1 L 11.5 10 L 1.5 10 Z" fill="var(--text-secondary)" />
          </svg>
          Alarm
        </li>
        <li>
          <svg width="13" height="13" aria-hidden="true">
            <path d="M 6.5 1 L 11 3.75 L 11 9.25 L 6.5 12 L 2 9.25 L 2 3.75 Z" fill="var(--text-secondary)" />
          </svg>
          Badge
        </li>
        <li style={{ marginLeft: 'auto', gap: 4 }}>
          Distance from case:
          {HOP_RAMP.map((color, index) => (
            <span key={color} className="swatch" style={{ background: color }} title={`${index} hops`} />
          ))}
        </li>
      </ul>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Link graph around case ${graph.seedLabel}: ${graph.nodes.length} connected records`}
        style={{ background: 'var(--page-plane)', borderRadius: 6 }}
      >
        {graph.edges.map((edge) => {
          const a = positions.get(edge.source)
          const b = positions.get(edge.target)
          if (!a || !b) return null
          return (
            <line
              key={`${edge.source}->${edge.target}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--baseline)"
              strokeWidth={1 + (edge.weight / maxEdgeWeight) * 1.8}
              strokeLinecap="round"
            />
          )
        })}

        {placed.map(({ node, x, y, radius }) => {
          const fill = HOP_RAMP[Math.min(node.hops, HOP_RAMP.length - 1)]
          const isSelected = selected?.id === node.id
          const common = {
            fill,
            stroke: isSelected ? 'var(--accent)' : 'var(--surface-1)',
            strokeWidth: isSelected ? 3 : 2,
            style: { cursor: 'pointer' },
            onMouseMove: (event: React.MouseEvent) =>
              show(
                event,
                <>
                  <strong>
                    {TYPE_LABEL[node.type]} — {node.label}
                  </strong>
                  <TooltipRows rows={node.detail.map((d) => [d.label, d.value])} />
                </>,
              ),
            onMouseLeave: hide,
            onClick: () => setSelected(isSelected ? null : node),
          }

          return (
            <g key={node.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              {node.type === 'SITE' ? (
                <circle r={radius} {...common} />
              ) : (
                <path d={shapeFor(node.type, radius)} {...common} />
              )}
              {labelled(node, isSelected) ? (
                <text
                  y={radius + 13}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="var(--text-primary)"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      <p className="chart-note">
        {graph.nodes.length} records within {Math.max(...graph.nodes.map((n) => n.hops))} steps of{' '}
        {graph.seedLabel}
        {graph.truncated
          ? ` — showing the strongest ${graph.nodeBudget} connections, not all of them.`
          : '.'}{' '}
        Badge identifiers are pseudonymised; naming the holder is a separate, access-controlled request.
      </p>

      {/* Table view: the graph is one reading of this data, not the only one. */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          View as a table
        </summary>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Record</th>
                <th>Detail</th>
                <th className="numeric">Steps away</th>
              </tr>
            </thead>
            <tbody>
              {graph.nodes.map((node) => (
                <tr key={node.id}>
                  <td>{TYPE_LABEL[node.type]}</td>
                  <td>{node.label}</td>
                  <td>{node.sublabel}</td>
                  <td className="numeric">{node.hops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {element}
    </div>
  )
}
