import { TooltipRows, useTooltip } from './useTooltip'

export interface DonutSlice {
  label: string
  value: number
  color: string
}

const SIZE = 190
const RADIUS = 78
const THICKNESS = 26
/** The 2px surface gap the mark spec asks for between adjacent fills, in radians. */
const GAP = 0.018

function arcPath(from: number, to: number): string {
  const outer = RADIUS
  const inner = RADIUS - THICKNESS
  const centre = SIZE / 2
  const point = (angle: number, r: number) => [
    centre + r * Math.cos(angle - Math.PI / 2),
    centre + r * Math.sin(angle - Math.PI / 2),
  ]
  const [x1, y1] = point(from, outer)
  const [x2, y2] = point(to, outer)
  const [x3, y3] = point(to, inner)
  const [x4, y4] = point(from, inner)
  const large = to - from > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`
}

/**
 * Parts of a whole.
 *
 * A donut earns its place only when the slices really do sum to something meaningful and
 * there are few enough of them to tell apart — the caller is expected to have folded the
 * tail into "Other" before getting here. The hole is not decoration: it holds the total,
 * which is the number people actually read off this chart, and it stops the eye trying to
 * compare arc lengths that a bar would answer better. Every slice is also written out in
 * the legend with its share, so nothing is carried by colour alone.
 */
export function DonutChart({
  slices,
  centreLabel,
  unit = 'cases',
}: {
  slices: DonutSlice[]
  centreLabel: string
  unit?: string
}) {
  const { show, hide, element } = useTooltip()
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  if (total === 0) {
    return <p className="notice">Nothing to break down for this window yet.</p>
  }

  const drawn = slices.filter((slice) => slice.value > 0)
  let cursor = 0

  return (
    <div className="chart-frame" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`${centreLabel}: ${drawn
          .map((s) => `${s.label} ${((s.value / total) * 100).toFixed(0)}%`)
          .join(', ')}`}
        style={{ flex: '0 0 auto' }}
      >
        {drawn.map((slice) => {
          const sweep = (slice.value / total) * Math.PI * 2
          const from = cursor
          const to = cursor + sweep
          cursor = to
          // A single slice covering the whole circle has no gap to cut — subtracting one
          // would close the arc onto itself and draw nothing.
          const gap = drawn.length === 1 ? 0 : GAP
          return (
            <path
              key={slice.label}
              className="arc"
              d={arcPath(from, Math.max(to - gap, from + 0.004))}
              fill={slice.color}
              onMouseMove={(event) =>
                show(
                  event,
                  <>
                    <strong>{slice.label}</strong>
                    <TooltipRows
                      rows={[
                        [titleOf(unit), slice.value.toLocaleString()],
                        ['Share', `${((slice.value / total) * 100).toFixed(1)}%`],
                      ]}
                    />
                  </>,
                )
              }
              onMouseLeave={hide}
            />
          )
        })}

        <text
          x={SIZE / 2}
          y={SIZE / 2 - 2}
          textAnchor="middle"
          fontSize={26}
          fontWeight={700}
          fill="var(--text-primary)"
          style={{ fontFamily: 'var(--display)' }}
        >
          {total.toLocaleString()}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 16}
          textAnchor="middle"
          fontSize={9}
          fill="var(--text-muted)"
          letterSpacing="1.4"
        >
          {centreLabel.toUpperCase()}
        </text>
      </svg>

      <ul className="legend" style={{ flexDirection: 'column', gap: 9, margin: 0, flex: '1 1 160px' }}>
        {drawn.map((slice) => (
          <li key={slice.label} style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span className="swatch" style={{ background: slice.color }} aria-hidden="true" />
              <span
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {slice.label}
              </span>
            </span>
            <span className="val">
              {slice.value.toLocaleString()}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                {' '}
                · {((slice.value / total) * 100).toFixed(0)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
      {element}
    </div>
  )
}

function titleOf(unit: string): string {
  return unit.charAt(0).toUpperCase() + unit.slice(1)
}
