import type { HeatCell } from '../api/types'
import { TooltipRows, useTooltip } from './useTooltip'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Sequential: one hue, light to dark. The lightest step is allowed to recede into the
    surface — on this chart that step means "nothing happened", and reading as almost
    nothing is exactly right. */
const RAMP = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)']

const CELL = 22
const GAP = 3
const LABEL_W = 34
const HOUR_ROW = 16

function step(count: number, max: number): string {
  if (count === 0) return 'var(--surface-2)'
  // Scaled to the observed maximum, not to an absolute count: a quiet quarter would
  // otherwise render as one flat colour and hide the pattern that is actually there.
  const fraction = count / max
  const index = Math.min(RAMP.length - 1, Math.floor(fraction * RAMP.length - 1e-9))
  return RAMP[Math.max(index, 0)]
}

/**
 * Incidents by weekday and hour, in each site's own local time.
 *
 * This is the density question a table cannot answer: 168 numbers laid out as a calendar
 * show the after-hours ridge and the weekend block at a glance, where the same numbers in
 * rows would just be a wall. It is the observed counterpart to the model's predicted
 * patrol window — the forecast says a site is likely to be hit, this says when the estate
 * is actually being hit, and a supervisor rosters against both.
 */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const { show, hide, element } = useTooltip()
  const total = cells.reduce((sum, cell) => sum + cell.count, 0)

  if (total === 0) {
    return <p className="notice">No incidents recorded in the last six months.</p>
  }

  const max = Math.max(...cells.map((cell) => cell.count))
  const width = LABEL_W + 24 * (CELL + GAP)
  const height = HOUR_ROW + 7 * (CELL + GAP) + 6

  const byKey = new Map(cells.map((cell) => [`${cell.dayOfWeek}:${cell.hour}`, cell.count]))
  const busiest = cells.reduce((best, cell) => (cell.count > best.count ? cell : best), cells[0])

  return (
    <div className="chart-frame">
      <div className="table-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ minWidth: 640 }}
          height={height}
          role="img"
          aria-label={`Incidents by weekday and hour of day. The busiest cell is ${
            DAYS[busiest.dayOfWeek]
          } at ${String(busiest.hour).padStart(2, '0')}:00 with ${busiest.count} incidents.`}
        >
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
            <text
              key={hour}
              x={LABEL_W + hour * (CELL + GAP)}
              y={10}
              fontSize={9}
              fill="var(--text-muted)"
            >
              {String(hour).padStart(2, '0')}
            </text>
          ))}

          {DAYS.map((day, dayIndex) => (
            <g key={day}>
              <text
                x={0}
                y={HOUR_ROW + dayIndex * (CELL + GAP) + CELL / 2 + 4}
                fontSize={9.5}
                fill="var(--text-secondary)"
              >
                {day}
              </text>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = byKey.get(`${dayIndex}:${hour}`) ?? 0
                return (
                  <rect
                    key={hour}
                    className="cell"
                    x={LABEL_W + hour * (CELL + GAP)}
                    y={HOUR_ROW + dayIndex * (CELL + GAP)}
                    width={CELL}
                    height={CELL}
                    rx={4}
                    fill={step(count, max)}
                    stroke={count === 0 ? 'var(--border)' : 'none'}
                    onMouseMove={(event) =>
                      show(
                        event,
                        <>
                          <strong>
                            {day} {String(hour).padStart(2, '0')}:00–{String((hour + 1) % 24).padStart(2, '0')}:00
                          </strong>
                          <TooltipRows
                            rows={[
                              ['Incidents', String(count)],
                              ['Share of the window', `${((count / total) * 100).toFixed(1)}%`],
                            ]}
                          />
                        </>,
                      )
                    }
                    onMouseLeave={hide}
                  />
                )
              })}
            </g>
          ))}
        </svg>
      </div>

      <ul className="legend" style={{ marginTop: 12, marginBottom: 0, alignItems: 'center' }}>
        <li style={{ color: 'var(--text-muted)' }}>Fewer</li>
        <li style={{ gap: 3 }}>
          <span
            className="swatch"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            aria-hidden="true"
          />
          {RAMP.map((color) => (
            <span key={color} className="swatch" style={{ background: color }} aria-hidden="true" />
          ))}
        </li>
        <li style={{ color: 'var(--text-muted)' }}>More · peak {max} in one hour</li>
        <li style={{ marginLeft: 'auto' }}>
          Busiest:{' '}
          <span className="val">
            {DAYS[busiest.dayOfWeek]} {String(busiest.hour).padStart(2, '0')}:00
          </span>
        </li>
      </ul>
      {element}
    </div>
  )
}
