import { useMemo } from 'react'
import type { RiskAlert } from '../api/types'
import { TooltipRows, useTooltip } from './useTooltip'

const WIDTH = 720
const HEIGHT = 360
const PADDING = 32

// Sequential ramp, light→dark: risk score is a continuous magnitude, so one hue.
const RAMP = ['var(--seq-100)', 'var(--seq-250)', 'var(--seq-350)', 'var(--seq-450)', 'var(--seq-650)']

function rampColor(score: number): string {
  const index = Math.min(RAMP.length - 1, Math.floor(score * RAMP.length))
  return RAMP[index]
}

/**
 * Vandalism risk heat map (Section 6.5).
 *
 * Sites are placed by an equirectangular projection of their own coordinates and scaled
 * to the extent of the data, so the view frames whatever region the caller is entitled
 * to see without shipping map tiles. Marks encode magnitude twice — colour ramp and
 * radius — so the map still reads under any colour vision deficiency, and every site is
 * also listed in the table beside it.
 */
export function RiskMap({ sites }: { sites: RiskAlert[] }) {
  const { show, hide, element } = useTooltip()

  const placed = useMemo(() => {
    const located = sites.filter(
      (site) => site.latitude !== null && site.longitude !== null,
    ) as (RiskAlert & { latitude: number; longitude: number })[]

    if (located.length === 0) return []

    const lats = located.map((s) => s.latitude)
    const lons = located.map((s) => s.longitude)
    // A single site, or several at one location, would give a zero-width extent and
    // divide by zero. The floor keeps the projection stable and centres the mark.
    const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 0.5)
    const lonSpan = Math.max(Math.max(...lons) - Math.min(...lons), 0.5)
    const minLat = Math.min(...lats)
    const minLon = Math.min(...lons)

    return located
      .map((site) => ({
        site,
        x: PADDING + ((site.longitude - minLon) / lonSpan) * (WIDTH - PADDING * 2),
        // Latitude increases northward, screen y increases downward.
        y: HEIGHT - PADDING - ((site.latitude - minLat) / latSpan) * (HEIGHT - PADDING * 2),
      }))
      // Highest risk drawn last so it is never hidden under a low-risk mark.
      .sort((a, b) => a.site.riskScore - b.site.riskScore)
  }, [sites])

  if (placed.length === 0) {
    return <p className="notice">No scored sites with coordinates to plot.</p>
  }

  return (
    <div style={{ position: 'relative' }}>
      <ul className="legend">
        <li>Risk score</li>
        {RAMP.map((color, index) => (
          <li key={color}>
            <span className="swatch" style={{ background: color }} aria-hidden="true" />
            {(index / RAMP.length).toFixed(1)}–{((index + 1) / RAMP.length).toFixed(1)}
          </li>
        ))}
      </ul>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Risk heat map of ${placed.length} scored sites`}
        style={{ background: 'var(--page-plane)', borderRadius: 6 }}
      >
        {placed.map(({ site, x, y }) => (
          <circle
            key={site.siteCode}
            cx={x}
            cy={y}
            /* Radius carries magnitude too, so the map does not rely on colour alone. */
            r={8 + site.riskScore * 14}
            fill={rampColor(site.riskScore)}
            stroke="var(--surface-1)"
            strokeWidth={2}
            onMouseMove={(event) =>
              show(
                event,
                <>
                  <strong>
                    {site.siteName} ({site.siteCode})
                  </strong>
                  <TooltipRows
                    rows={[
                      ['Risk score', site.riskScore.toFixed(2)],
                      ['Band', site.riskBand],
                      ['Peak window', site.peakWindow ?? '—'],
                      ['Region', site.region ?? '—'],
                      ...site.topFactors
                        .slice(0, 3)
                        .map(
                          (factor) =>
                            [factor.name, `${(factor.contribution * 100).toFixed(0)}%`] as [
                              string,
                              string,
                            ],
                        ),
                    ]}
                  />
                </>,
              )
            }
            onMouseLeave={hide}
          />
        ))}
      </svg>
      {element}
    </div>
  )
}
