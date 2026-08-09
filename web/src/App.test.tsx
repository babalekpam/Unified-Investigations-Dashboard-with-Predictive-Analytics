import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutiveView, InvestigatorView, ManagerView } from './api/types'

const executive = {
  totalInvestigations: 480,
  avgResolutionDays: 21.2,
  financialExposure: 1875000,
  yoyChangePct: -8.4,
  regions: [{ region: 'SOUTHWEST', caseCount: 210, financialImpact: 900000, highRiskSites: 4 }],
  majorInvestigations: [],
  topHotspots: [],
  vandalismForecast: [],
  riskPosture: { highRiskSites: 1, mediumRiskSites: 2, lowRiskSites: 3, asOf: '2026-08-07' },
  incidentHeatmap: [],
} satisfies ExecutiveView

const manager = {
  region: 'SOUTHWEST',
  openCases: 24,
  closedLast30Days: 12,
  closureRatePct: 33.3,
  escalations: 3,
  escalationRatePct: 12.5,
  avgResolutionDays: 18.4,
  workload: [],
  caseAging: [],
  volumeByType: [{ incidentType: 'VANDALISM', caseCount: 14 }],
  vandalismAlerts: [],
  incidentHeatmap: [],
} satisfies ManagerView

const investigator = {
  investigator: 'dana.reyes@att.com',
  openCases: 2,
  overdueTasks: 1,
  avgDaysInStatus: 11.5,
  queue: [],
  repeatIncidentFlags: [],
  alerts: [],
} satisfies InvestigatorView

vi.mock('./api/client', async () => {
  const actual = await vi.importActual<typeof import('./api/client')>('./api/client')
  return {
    ...actual,
    api: {
      investigatorView: vi.fn(async () => investigator),
      managerView: vi.fn(async () => manager),
      executiveView: vi.fn(async () => executive),
      linkGraph: vi.fn(async () => {
        throw new Error('not used in this test')
      }),
      localToken: vi.fn(async () => 'token'),
    },
  }
})

const { default: App } = await import('./App')

describe('the app shell', () => {
  beforeEach(() => {
    window.sessionStorage.setItem(
      'gsih.session',
      JSON.stringify({
        token: 'token',
        username: 'priya.nair@att.com',
        roles: ['EXECUTIVE'],
      }),
    )
  })

  it('never renders a dashboard with another tab’s payload', async () => {
    // The regression: clicking a tab re-renders with the new tab *and the old data*
    // before any effect can clear it, and each view reads fields the other does not
    // have. It surfaced twice — first as a blank crash on tab switch, then again in the
    // packaged walkthrough — so it is asserted here rather than left to a code comment.
    render(<App />)

    await screen.findByText('Enterprise security posture')
    await waitFor(() => expect(screen.getByText('480')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Team & region/i }))

    // The moment the tab changes, the executive figures must be gone — not replaced a
    // tick later, gone in the same frame.
    expect(screen.queryByText('480')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('33.3%')).toBeInTheDocument())
    expect(screen.getByText('Regional operations')).toBeInTheDocument()
  })

  it('lands an executive on the enterprise view rather than somebody’s queue', async () => {
    render(<App />)
    expect(await screen.findByText('Enterprise security posture')).toBeInTheDocument()
  })

  it('shows a skeleton while the next view is in flight', async () => {
    render(<App />)
    expect(screen.getByText('Loading dashboard')).toBeInTheDocument()
    await screen.findByText('480')
  })
})
