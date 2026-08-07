import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ExecutiveView, InvestigatorView, ManagerView } from '../api/types'
import { ExecutiveDashboard } from './ExecutiveView'
import { InvestigatorDashboard } from './InvestigatorView'
import { ManagerDashboard } from './ManagerView'

const investigatorData: InvestigatorView = {
  investigator: 'dana.reyes@att.com',
  openCases: 2,
  overdueTasks: 1,
  avgDaysInStatus: 11.5,
  queue: [
    {
      caseNumber: 'SW-1001',
      title: 'Perimeter damage at Dallas yard',
      caseType: 'VANDALISM',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assigneeEmail: 'dana.reyes@att.com',
      siteCode: 'SITE-001',
      region: 'SOUTHWEST',
      openedAt: '2026-07-01T00:00:00Z',
      dueAt: '2026-07-15T00:00:00Z',
      closedAt: null,
      ageDays: 20,
      overdue: true,
      financialImpact: 12500,
      sourceSystem: 'CASE_IQ',
    },
  ],
  repeatIncidentFlags: [
    {
      siteCode: 'SITE-001',
      siteName: 'Dallas Yard',
      incidentType: 'VANDALISM',
      occurrencesLast90Days: 4,
      mostRecent: '2026-07-20T00:00:00Z',
      relatedCaseNumber: 'SW-1001',
    },
  ],
  alerts: [
    {
      siteCode: 'SITE-001',
      siteName: 'Dallas Yard',
      region: 'SOUTHWEST',
      latitude: 32.78,
      longitude: -96.8,
      riskScore: 0.81,
      riskBand: 'HIGH',
      peakWindow: '22:00-02:00',
      topFactors: [{ name: 'Vandalism in the last 90 days', contribution: 0.42 }],
      scoreDate: '2026-08-07',
      modelVersion: 'vandalism-risk-1.0.0',
    },
  ],
}

const managerData: ManagerView = {
  region: 'SOUTHWEST',
  openCases: 24,
  closedLast30Days: 12,
  closureRatePct: 33.3,
  escalations: 3,
  escalationRatePct: 12.5,
  avgResolutionDays: 18.4,
  workload: [
    { assigneeEmail: 'dana.reyes@att.com', openCases: 9, overdue: 3, loadIndex: 1.4 },
    { assigneeEmail: 'sam.ortiz@att.com', openCases: 6, overdue: 0, loadIndex: 0.9 },
  ],
  caseAging: [
    { bucket: '0-7 days', caseCount: 6 },
    { bucket: '8-30 days', caseCount: 10 },
    { bucket: '31-90 days', caseCount: 5 },
    { bucket: '90+ days', caseCount: 3 },
  ],
  volumeByType: [{ incidentType: 'VANDALISM', caseCount: 14 }],
  vandalismAlerts: investigatorData.alerts,
}

const executiveData: ExecutiveView = {
  totalInvestigations: 480,
  avgResolutionDays: 21.2,
  financialExposure: 1875000,
  yoyChangePct: -8.4,
  regions: [
    { region: 'SOUTHWEST', caseCount: 210, financialImpact: 900000, highRiskSites: 4 },
    { region: 'NORTHEAST', caseCount: 180, financialImpact: 640000, highRiskSites: 2 },
  ],
  majorInvestigations: investigatorData.queue,
  topHotspots: investigatorData.alerts,
  vandalismForecast: Array.from({ length: 30 }, (_, index) => ({
    date: `2026-08-${String(index + 8).padStart(2, '0')}`,
    predicted: 1.2 + index * 0.02,
    lower: 0.4,
    upper: 2.6,
    horizonDays: 30,
  })),
  riskPosture: { highRiskSites: 6, mediumRiskSites: 14, lowRiskSites: 80, asOf: '2026-08-07' },
}

describe('investigator view', () => {
  it('shows the personal queue with its overdue and repeat-incident flags', () => {
    render(<InvestigatorDashboard data={investigatorData} />)

    // The case number appears twice: once in the queue, once on the repeat-incident
    // flag that points back at it.
    expect(screen.getAllByText('SW-1001')).toHaveLength(2)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    // The repeat-incident count is the signal the investigator acts on.
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getAllByText(/High risk/)).not.toHaveLength(0)
  })

  it('states the site risk band in words, never by colour alone', () => {
    render(<InvestigatorDashboard data={investigatorData} />)
    expect(screen.getAllByText(/High risk/)[0]).toBeVisible()
  })
})

describe('manager view', () => {
  it('renders the workload chart with a legend for both series', () => {
    render(<ManagerDashboard data={managerData} />)

    const chart = screen.getByRole('img', {
      name: /Open cases per investigator/i,
    })
    expect(chart).toBeInTheDocument()
    expect(screen.getByText('On track')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('reports the KPIs a manager is measured on', () => {
    render(<ManagerDashboard data={managerData} />)
    expect(screen.getByText('33.3%')).toBeInTheDocument()
    expect(screen.getByText('12.5%')).toBeInTheDocument()
    expect(screen.getByText('18.4 days')).toBeInTheDocument()
  })

  it('labels every aging bucket rather than relying on the colour ramp', () => {
    render(<ManagerDashboard data={managerData} />)
    for (const bucket of managerData.caseAging) {
      expect(screen.getByText(bucket.bucket)).toBeInTheDocument()
    }
  })
})

describe('executive view', () => {
  it('leads with enterprise posture and a year-over-year direction', () => {
    render(<ExecutiveDashboard data={executiveData} />)
    expect(screen.getByText('480')).toBeInTheDocument()
    expect(screen.getByText(/8.4% year over year/)).toBeInTheDocument()
    expect(screen.getByText('$1,875,000')).toBeInTheDocument()
  })

  it('draws the forecast and says out loud that it is a probability', () => {
    render(<ExecutiveDashboard data={executiveData} />)
    expect(
      screen.getByRole('img', { name: /Projected vandalism incidents per day/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/probabilities, not certainties/i)).toBeInTheDocument()
  })

  it('lists every hotspot in a table as well as on the map', () => {
    render(<ExecutiveDashboard data={executiveData} />)
    const hotspots = screen.getByRole('img', { name: /Risk heat map/i })
    expect(hotspots).toBeInTheDocument()

    const table = screen.getByText('Top hotspots').closest('section')!
    expect(within(table).getByText('Dallas Yard')).toBeInTheDocument()
  })
})
