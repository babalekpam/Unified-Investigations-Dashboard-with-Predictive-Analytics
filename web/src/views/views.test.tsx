import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ExecutiveView, HeatCell, InvestigatorView, ManagerView } from '../api/types'
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

/** A complete 168-cell grid, with a Friday-night ridge the assertions can point at. */
function heatGrid(): HeatCell[] {
  const cells: HeatCell[] = []
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const afterHours = hour >= 22 || hour <= 2
      cells.push({
        dayOfWeek,
        hour,
        count: dayOfWeek === 4 && hour === 23 ? 9 : afterHours ? 2 : 0,
      })
    }
  }
  return cells
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
  volumeByType: [
    { incidentType: 'VANDALISM', caseCount: 14 },
    { incidentType: 'THEFT', caseCount: 6 },
    { incidentType: 'TRESPASS', caseCount: 2 },
  ],
  vandalismAlerts: investigatorData.alerts,
  incidentHeatmap: heatGrid(),
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
  incidentHeatmap: heatGrid(),
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
    // The tile leads with the compact figure because that is what gets read across a
    // room; the exact number is still on the card, in the caption underneath.
    expect(screen.getByText('$1.9M')).toBeInTheDocument()
    expect(screen.getByText(/\$1,875,000/)).toBeInTheDocument()
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

describe('the reporting charts', () => {
  it('breaks the estate down as parts of a whole, with every share written out', () => {
    render(<ExecutiveDashboard data={executiveData} />)

    const donut = screen.getByRole('img', { name: /sites scored/i })
    expect(donut).toBeInTheDocument()
    // 6 + 14 + 80 = 100 sites, and the bands are named rather than left to the colour.
    expect(within(donut.parentElement!).getByText('100')).toBeInTheDocument()
    // "High risk" also appears as a badge in the hotspot table, which is the point of a
    // reserved status palette: the same words carry the same meaning in both places.
    expect(screen.getAllByText('High risk').length).toBeGreaterThan(0)
    expect(screen.getByText('Medium risk')).toBeInTheDocument()
    expect(screen.getByText('Low risk')).toBeInTheDocument()
  })

  it('names the busiest hour of the heat map instead of leaving it to be eyeballed', () => {
    render(<ExecutiveDashboard data={executiveData} />)

    const heat = screen.getByRole('img', { name: /Incidents by weekday and hour/i })
    expect(heat).toHaveAccessibleName(/busiest cell is Fri at 23:00 with 9 incidents/i)
    expect(screen.getAllByText(/Fri 23:00/).length).toBeGreaterThan(0)
  })

  it('plots age against exposure so the old-and-expensive corner is visible', () => {
    render(<ExecutiveDashboard data={executiveData} />)
    expect(
      screen.getByRole('img', { name: /Financial exposure against Age in days/i }),
    ).toBeInTheDocument()
  })

  it('compares regions as columns', () => {
    render(<ExecutiveDashboard data={executiveData} />)
    expect(screen.getByRole('img', { name: /Cases by Southwest, Northeast/i })).toBeInTheDocument()
  })

  it('folds the tail of the case mix into Other rather than drawing slivers', () => {
    const many: ManagerView = {
      ...managerData,
      volumeByType: [
        { incidentType: 'VANDALISM', caseCount: 14 },
        { incidentType: 'THEFT', caseCount: 6 },
        { incidentType: 'FRAUD', caseCount: 5 },
        { incidentType: 'TRESPASS', caseCount: 4 },
        { incidentType: 'ASSET_LOSS', caseCount: 3 },
        { incidentType: 'POLICY_VIOLATION', caseCount: 2 },
        { incidentType: 'OTHER', caseCount: 1 },
      ],
    }
    render(<ManagerDashboard data={many} />)
    expect(screen.getByText('Other (2 types)')).toBeInTheDocument()
  })
})

describe('the tables', () => {
  it('sorts on the column the reader clicks', () => {
    const queue = [
      { ...investigatorData.queue[0], caseNumber: 'SW-1001', ageDays: 20 },
      { ...investigatorData.queue[0], caseNumber: 'SW-1002', ageDays: 3 },
      { ...investigatorData.queue[0], caseNumber: 'SW-1003', ageDays: 61 },
    ]
    render(<InvestigatorDashboard data={{ ...investigatorData, queue }} />)

    const numbers = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelector('td')?.textContent)
        .filter((text) => text?.startsWith('SW-'))

    // Age is numeric, so the first click opens on the largest — "which has been sitting
    // longest" is the question being asked.
    fireEvent.click(screen.getAllByText('Age')[0])
    expect(numbers().slice(0, 3)).toEqual(['SW-1003', 'SW-1001', 'SW-1002'])

    fireEvent.click(screen.getAllByText('Age')[0])
    expect(numbers().slice(0, 3)).toEqual(['SW-1002', 'SW-1001', 'SW-1003'])
  })

  it('narrows every table on the page from the one filter box', () => {
    const queue = [
      { ...investigatorData.queue[0], caseNumber: 'SW-1001', title: 'Perimeter damage' },
      { ...investigatorData.queue[0], caseNumber: 'SW-1002', title: 'Copper theft at yard' },
    ]
    render(<InvestigatorDashboard data={{ ...investigatorData, queue }} filter="copper" />)

    expect(screen.getByText('Copper theft at yard')).toBeInTheDocument()
    expect(screen.queryByText('Perimeter damage')).not.toBeInTheDocument()
  })

  it('says what it was filtering by when nothing matches', () => {
    render(<InvestigatorDashboard data={investigatorData} filter="zzz-no-such-case" />)
    expect(screen.getAllByText(/Nothing matches/).length).toBeGreaterThan(0)
  })
})
