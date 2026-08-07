import type { AgingBucket, WorkloadRow } from '../api/types'
import { TooltipRows, useTooltip } from './useTooltip'

const ROW_HEIGHT = 28
const BAR_HEIGHT = 14
const LABEL_WIDTH = 170
const VALUE_WIDTH = 46

/**
 * Team workload (Section 7.2), split into on-track and overdue cases.
 *
 * Two series, so a legend is always present and both segments are also directly
 * labelled. The 2px gap between segments is the surface spacer the mark spec calls
 * for — without it the two fills read as one blended bar.
 */
export function WorkloadChart({ rows }: { rows: WorkloadRow[] }) {
  const { show, hide, element } = useTooltip()
  if (rows.length === 0) return <p className="notice">No open cases assigned in this region.</p>

  const max = Math.max(...rows.map((r) => r.openCases), 1)
  const chartWidth = 420
  const height = rows.length * ROW_HEIGHT + 8

  return (
    <div style={{ position: 'relative' }}>
      <ul className="legend">
        <li>
          <span className="swatch" style={{ background: 'var(--series-1)' }} aria-hidden="true" />
          On track
        </li>
        <li>
          <span className="swatch" style={{ background: 'var(--series-2)' }} aria-hidden="true" />
          Overdue
        </li>
      </ul>

      <svg
        viewBox={`0 0 ${LABEL_WIDTH + chartWidth + VALUE_WIDTH} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Open cases per investigator, split into on-track and overdue"
      >
        {rows.map((row, index) => {
          const y = index * ROW_HEIGHT + 4
          const onTrack = Math.max(row.openCases - row.overdue, 0)
          const scale = (value: number) => (value / max) * chartWidth
          const onTrackWidth = scale(onTrack)
          const overdueWidth = scale(row.overdue)

          return (
            <g
              key={row.assigneeEmail}
              onMouseMove={(event) =>
                show(
                  event,
                  <>
                    <strong>{row.assigneeEmail}</strong>
                    <TooltipRows
                      rows={[
                        ['Open cases', String(row.openCases)],
                        ['Overdue', String(row.overdue)],
                        ['Load vs team average', `${row.loadIndex.toFixed(2)}×`],
                      ]}
                    />
                  </>,
                )
              }
              onMouseLeave={hide}
            >
              <rect
                x={0}
                y={y - 4}
                width={LABEL_WIDTH + chartWidth + VALUE_WIDTH}
                height={ROW_HEIGHT}
                fill="transparent"
              />
              <text x={0} y={y + BAR_HEIGHT - 2} fontSize={11} fill="var(--text-secondary)">
                {row.assigneeEmail.split('@')[0]}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={onTrackWidth}
                height={BAR_HEIGHT}
                rx={4}
                fill="var(--series-1)"
              />
              {row.overdue > 0 ? (
                <rect
                  /* +2 is the surface gap between adjacent fills. */
                  x={LABEL_WIDTH + onTrackWidth + 2}
                  y={y}
                  width={Math.max(overdueWidth - 2, 2)}
                  height={BAR_HEIGHT}
                  rx={4}
                  fill="var(--series-2)"
                />
              ) : null}
              <text
                x={LABEL_WIDTH + chartWidth + VALUE_WIDTH}
                y={y + BAR_HEIGHT - 2}
                fontSize={11}
                textAnchor="end"
                fill="var(--text-primary)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {row.openCases}
              </text>
            </g>
          )
        })}
      </svg>
      {element}
    </div>
  )
}

// Ordinal ramp: four ordered buckets, light→dark. The lightest step used here is 250,
// the lightest that still clears 2:1 against the light surface.
const AGING_STEPS = ['var(--seq-250)', 'var(--seq-350)', 'var(--seq-450)', 'var(--seq-650)']

/** Case aging buckets (Section 7.2) — an ordered magnitude, so one hue, light to dark. */
export function AgingChart({ buckets }: { buckets: AgingBucket[] }) {
  const { show, hide, element } = useTooltip()
  const total = buckets.reduce((sum, b) => sum + b.caseCount, 0)
  if (total === 0) return <p className="notice">No open cases to age.</p>

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 2, height: 26 }}>
        {buckets.map((bucket, index) => {
          const share = bucket.caseCount / total
          if (share === 0) return null
          return (
            <div
              key={bucket.bucket}
              style={{
                flexGrow: share,
                background: AGING_STEPS[index] ?? AGING_STEPS[AGING_STEPS.length - 1],
                borderRadius: 4,
              }}
              onMouseMove={(event) =>
                show(
                  event,
                  <>
                    <strong>{bucket.bucket}</strong>
                    <TooltipRows
                      rows={[
                        ['Cases', String(bucket.caseCount)],
                        ['Share', `${(share * 100).toFixed(1)}%`],
                      ]}
                    />
                  </>,
                )
              }
              onMouseLeave={hide}
            />
          )
        })}
      </div>
      <ul className="legend" style={{ marginTop: 10 }}>
        {buckets.map((bucket, index) => (
          <li key={bucket.bucket}>
            <span
              className="swatch"
              style={{ background: AGING_STEPS[index] ?? AGING_STEPS[AGING_STEPS.length - 1] }}
              aria-hidden="true"
            />
            {bucket.bucket}
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {bucket.caseCount}
            </span>
          </li>
        ))}
      </ul>
      {element}
    </div>
  )
}
