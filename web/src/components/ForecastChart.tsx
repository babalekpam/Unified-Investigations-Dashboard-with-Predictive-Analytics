import { useMemo, useState } from 'react'
import type { ForecastPoint } from '../api/types'
import { TooltipRows, useTooltip } from './useTooltip'

const WIDTH = 720
const HEIGHT = 260
const PADDING = { top: 12, right: 16, bottom: 28, left: 40 }

/**
 * Projected vandalism incidents per day with its prediction interval (Section 6.5).
 *
 * One series, so there is no legend box — the title names it. The interval band is
 * drawn as the same hue at low opacity rather than as a second series, because it is
 * the uncertainty around this line and not a thing of its own.
 */
export function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const { show, hide, element } = useTooltip()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const geometry = useMemo(() => {
    if (points.length === 0) return null

    const plotWidth = WIDTH - PADDING.left - PADDING.right
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
    const maxValue = Math.max(...points.map((p) => p.upper), 1)

    const x = (index: number) =>
      PADDING.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
    const y = (value: number) => PADDING.top + plotHeight - (value / maxValue) * plotHeight

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.predicted)}`).join(' ')
    const band = [
      ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.upper)}`),
      ...points
        .slice()
        .reverse()
        .map((p, i) => `L ${x(points.length - 1 - i)} ${y(p.lower)}`),
      'Z',
    ].join(' ')

    const ticks = [0, 0.5, 1].map((fraction) => ({
      value: maxValue * fraction,
      y: y(maxValue * fraction),
    }))

    return { x, y, line, band, ticks, maxValue, plotHeight }
  }, [points])

  if (!geometry) {
    return <p className="notice">No projection available yet — the model has not run.</p>
  }

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left) / bounds.width
    const index = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))))
    const point = points[index]
    setHoverIndex(index)
    show(
      event,
      <>
        <strong>{new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
        <TooltipRows
          rows={[
            ['Projected', point.predicted.toFixed(2)],
            ['Range', `${point.lower.toFixed(2)} – ${point.upper.toFixed(2)}`],
            ['Horizon', `${point.horizonDays} days`],
          ]}
        />
      </>,
    )
  }

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Projected vandalism incidents per day from ${first.date} to ${last.date}`}
      >
        {geometry.ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
            <text x={PADDING.left - 8} y={tick.y + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {tick.value.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={geometry.band} fill="var(--series-1)" opacity={0.16} />
        <path d={geometry.line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />

        {hoverIndex !== null ? (
          <g>
            <line
              x1={geometry.x(hoverIndex)}
              x2={geometry.x(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="var(--baseline)"
              strokeWidth={1}
            />
            <circle
              cx={geometry.x(hoverIndex)}
              cy={geometry.y(points[hoverIndex].predicted)}
              r={4.5}
              fill="var(--series-1)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          </g>
        ) : null}

        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={HEIGHT - PADDING.bottom}
          y2={HEIGHT - PADDING.bottom}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        <text x={PADDING.left} y={HEIGHT - 8} fontSize={10} fill="var(--text-muted)">
          {new Date(first.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>
        <text x={WIDTH - PADDING.right} y={HEIGHT - 8} fontSize={10} fill="var(--text-muted)" textAnchor="end">
          {new Date(last.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>

        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={WIDTH - PADDING.left - PADDING.right}
          height={geometry.plotHeight}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => {
            setHoverIndex(null)
            hide()
          }}
        />
      </svg>
      {element}
    </div>
  )
}
