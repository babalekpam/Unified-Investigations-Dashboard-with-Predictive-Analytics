import { TooltipRows, useTooltip } from './useTooltip'

export interface ScatterPoint {
  id: string
  x: number
  y: number
  label: string
  detail: [string, string][]
  /** Optional emphasis — an overdue or escalated case is drawn in the second hue. */
  flagged?: boolean
}

const WIDTH = 640
const HEIGHT = 300
const PADDING = { top: 14, right: 18, bottom: 40, left: 62 }

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10
  // Runs until the last tick is at or past the largest value: stopping "close enough"
  // put the widest-spread point outside the axis it was supposed to be measured against.
  const ticks: number[] = []
  for (let value = 0; value < max + step; value += step) ticks.push(value)
  return ticks
}

/**
 * The relationship between two numbers, one mark per case.
 *
 * A scatter is the only form that answers "do these move together" — the same cases in a
 * ranked table answer "which is biggest" and hide the correlation completely. The point
 * of drawing age against exposure is the top-right quadrant: old *and* expensive is where
 * a manager should be looking, and it is visible here in a way no sorted list makes
 * obvious. Marks carry a 2px surface ring so overlapping points stay countable.
 */
export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  formatX = (v: number) => String(Math.round(v)),
  formatY = (v: number) => String(Math.round(v)),
  flaggedLabel,
}: {
  points: ScatterPoint[]
  xLabel: string
  yLabel: string
  formatX?: (value: number) => string
  formatY?: (value: number) => string
  flaggedLabel?: string
}) {
  const { show, hide, element } = useTooltip()

  if (points.length === 0) {
    return <p className="notice">Not enough cases with both figures recorded to plot.</p>
  }

  const maxX = Math.max(...points.map((p) => p.x), 1)
  const maxY = Math.max(...points.map((p) => p.y), 1)
  const xTicks = niceTicks(maxX)
  const yTicks = niceTicks(maxY)
  const xMax = xTicks[xTicks.length - 1]
  const yMax = yTicks[yTicks.length - 1]

  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const sx = (value: number) => PADDING.left + (value / xMax) * plotWidth
  const sy = (value: number) => PADDING.top + plotHeight - (value / yMax) * plotHeight

  const anyFlagged = points.some((p) => p.flagged)

  return (
    <div className="chart-frame">
      {anyFlagged && flaggedLabel ? (
        <ul className="legend">
          <li>
            <span className="swatch" style={{ background: 'var(--series-1)' }} aria-hidden="true" />
            On track
          </li>
          <li>
            <span className="swatch" style={{ background: 'var(--series-2)' }} aria-hidden="true" />
            {flaggedLabel}
          </li>
        </ul>
      ) : null}

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`${yLabel} against ${xLabel}, one mark per case`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={sy(tick)}
              y2={sy(tick)}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
            <text x={PADDING.left - 8} y={sy(tick) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--text-muted)">
              {formatY(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <text
            key={tick}
            x={sx(tick)}
            y={HEIGHT - PADDING.bottom + 15}
            textAnchor="middle"
            fontSize={9.5}
            fill="var(--text-muted)"
          >
            {formatX(tick)}
          </text>
        ))}

        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={HEIGHT - PADDING.bottom}
          y2={HEIGHT - PADDING.bottom}
          stroke="var(--baseline)"
          strokeWidth={1}
        />

        {points.map((point) => (
          <circle
            key={point.id}
            className="dot-mark"
            cx={sx(point.x)}
            cy={sy(point.y)}
            r={6}
            fill={point.flagged ? 'var(--series-2)' : 'var(--series-1)'}
            stroke="var(--surface-1)"
            strokeWidth={2}
            onMouseMove={(event) =>
              show(
                event,
                <>
                  <strong>{point.label}</strong>
                  <TooltipRows rows={point.detail} />
                </>,
              )
            }
            onMouseLeave={hide}
          />
        ))}

        <text
          x={PADDING.left + plotWidth / 2}
          y={HEIGHT - 6}
          textAnchor="middle"
          fontSize={9}
          fill="var(--text-muted)"
          letterSpacing="1.2"
        >
          {xLabel.toUpperCase()}
        </text>
        <text
          transform={`translate(12 ${PADDING.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={9}
          fill="var(--text-muted)"
          letterSpacing="1.2"
        >
          {yLabel.toUpperCase()}
        </text>
      </svg>
      {element}
    </div>
  )
}
