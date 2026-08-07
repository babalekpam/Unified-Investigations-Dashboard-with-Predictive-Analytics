import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

export interface TooltipState {
  x: number
  y: number
  content: ReactNode
}

/**
 * Shared hover layer for the charts.
 *
 * An SVG chart in a browser is interactive by default, so every mark here gets a
 * tooltip rather than relying on axis labels alone. The tooltip is positioned in
 * viewport coordinates so it escapes the chart's own overflow clipping.
 */
export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const show = useCallback((event: { clientX: number; clientY: number }, content: ReactNode) => {
    setTooltip({ x: event.clientX, y: event.clientY, content })
  }, [])

  const hide = useCallback(() => setTooltip(null), [])

  const element = tooltip ? (
    <div
      className="tooltip"
      role="tooltip"
      style={{
        // Nudged up and right of the cursor; flipped when close to the right edge so
        // the tooltip never runs off screen on a narrow viewport.
        left: Math.min(tooltip.x + 12, window.innerWidth - 280),
        top: Math.max(tooltip.y - 12, 8),
      }}
    >
      {tooltip.content}
    </div>
  ) : null

  return { show, hide, element }
}

export function TooltipRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.map(([term, value]) => (
        <div key={term} style={{ display: 'contents' }}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
