import { TooltipRows, useTooltip } from './useTooltip'

export interface ColumnDatum {
  label: string
  value: number
  detail?: [string, string][]
}

const HEIGHT = 250
const PADDING = { top: 18, right: 8, bottom: 46, left: 44 }
const MAX_BAR = 54

/**
 * Distinct categories, compared side by side.
 *
 * Columns rather than a pie: these categories do not sum to a whole anybody cares about,
 * and the question is ranking. One hue, because a single measure split by category is a
 * magnitude — colouring each column differently would imply a second variable that is not
 * there. Values are labelled directly on the columns, so the y-axis stays a light
 * reference rather than something anyone has to read across.
 */
export function ColumnChart({
  data,
  valueLabel,
  formatValue = (v: number) => v.toLocaleString(),
}: {
  data: ColumnDatum[]
  valueLabel: string
  formatValue?: (value: number) => string
}) {
  const { show, hide, element } = useTooltip()

  if (data.length === 0) {
    return <p className="notice">No categories to compare in this window.</p>
  }

  const max = Math.max(...data.map((d) => d.value), 1)
  const width = Math.max(360, data.length * 86)
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const slot = (width - PADDING.left - PADDING.right) / data.length
  const barWidth = Math.min(MAX_BAR, slot * 0.62)

  return (
    <div className="chart-frame">
      <div className="table-scroll">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          style={{ minWidth: Math.min(width, 520) }}
          role="img"
          aria-label={`${valueLabel} by ${data.map((d) => d.label).join(', ')}`}
        >
          {[0, 0.5, 1].map((fraction) => {
            const y = PADDING.top + plotHeight - fraction * plotHeight
            return (
              <g key={fraction}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke={fraction === 0 ? 'var(--baseline)' : 'var(--gridline)'}
                />
                <text x={PADDING.left - 8} y={y + 3.5} textAnchor="end" fontSize={9.5} fill="var(--text-muted)">
                  {formatValue(Math.round(max * fraction))}
                </text>
              </g>
            )
          })}

          {data.map((datum, index) => {
            const barHeight = (datum.value / max) * plotHeight
            const x = PADDING.left + index * slot + (slot - barWidth) / 2
            const y = PADDING.top + plotHeight - barHeight
            return (
              <g
                key={datum.label}
                onMouseMove={(event) =>
                  show(
                    event,
                    <>
                      <strong>{datum.label}</strong>
                      <TooltipRows
                        rows={datum.detail ?? [[valueLabel, formatValue(datum.value)]]}
                      />
                    </>,
                  )
                }
                onMouseLeave={hide}
              >
                <rect x={x - 6} y={PADDING.top} width={barWidth + 12} height={plotHeight} fill="transparent" />
                {/* 4px rounded data-end, anchored square to the baseline. */}
                <path
                  d={`M ${x} ${PADDING.top + plotHeight}
                      L ${x} ${y + 4}
                      Q ${x} ${y} ${x + 4} ${y}
                      L ${x + barWidth - 4} ${y}
                      Q ${x + barWidth} ${y} ${x + barWidth} ${y + 4}
                      L ${x + barWidth} ${PADDING.top + plotHeight} Z`}
                  fill="var(--series-1)"
                />
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  fill="var(--text-primary)"
                >
                  {formatValue(datum.value)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={HEIGHT - PADDING.bottom + 16}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill="var(--text-secondary)"
                >
                  {datum.label.length > 12 ? `${datum.label.slice(0, 11)}…` : datum.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {element}
    </div>
  )
}
