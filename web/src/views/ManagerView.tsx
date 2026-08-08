import type { ManagerView as ManagerData } from '../api/types'
import { AgingChart, WorkloadChart } from '../components/BarCharts'
import { DonutChart } from '../components/DonutChart'
import { Heatmap } from '../components/Heatmap'
import { RiskMap } from '../components/RiskMap'
import { IconAlert, IconClock, IconGrid, IconMap, IconPie, IconTeam } from '../components/icons'
import {
  Card,
  type Column,
  DataTable,
  RiskBadge,
  Stat,
  titleCase,
} from '../components/primitives'

/* The case-mix donut takes the sequential ramp, not the categorical pair: incident type is
   a set of buckets of one measure, and five hues would imply five unrelated series. Steps
   are assigned by rank, and the tail folds into "Other" — a donut with nine slivers is a
   pie chart's worst habit wearing a hole. */
const MIX_STEPS = ['var(--seq-5)', 'var(--seq-4)', 'var(--seq-3)', 'var(--seq-2)', 'var(--seq-1)']
const MIX_LIMIT = 5

/** Section 7.2 — workload, aging, closure rate, escalations and regional vandalism risk. */
export function ManagerDashboard({ data, filter }: { data: ManagerData; filter?: string }) {
  const ranked = [...data.volumeByType].sort((a, b) => b.caseCount - a.caseCount)
  const head = ranked.slice(0, MIX_LIMIT)
  const tail = ranked.slice(MIX_LIMIT)
  const mixSlices = [
    ...head.map((row, index) => ({
      label: titleCase(row.incidentType),
      value: row.caseCount,
      color: MIX_STEPS[index] ?? MIX_STEPS[MIX_STEPS.length - 1],
    })),
    ...(tail.length > 0
      ? [
          {
            label: `Other (${tail.length} types)`,
            value: tail.reduce((sum, row) => sum + row.caseCount, 0),
            color: 'var(--text-muted)',
          },
        ]
      : []),
  ]

  const riskColumns: Column<ManagerData['vandalismAlerts'][number]>[] = [
    { key: 'site', header: 'Site', value: (row) => row.siteName, cellClass: 'strong' },
    {
      key: 'score',
      header: 'Score',
      numeric: true,
      value: (row) => row.riskScore,
      render: (row) => row.riskScore.toFixed(2),
    },
    {
      key: 'band',
      header: 'Band',
      value: (row) => row.riskBand,
      render: (row) => <RiskBadge band={row.riskBand} />,
    },
    { key: 'window', header: 'Patrol window', value: (row) => row.peakWindow ?? '—' },
    {
      key: 'why',
      header: 'Why',
      sortable: false,
      value: (row) => row.topFactors.slice(0, 2).map((factor) => factor.name).join(', ') || '—',
    },
  ]

  return (
    <div className="grid">
      <Stat
        label="Open cases"
        value={data.openCases}
        caption={`${data.region ? titleCase(data.region) : 'All regions'} · ${data.workload.length} investigators carrying work`}
        span={6}
        hero
      />
      <Stat
        label="Closure rate"
        value={`${data.closureRatePct.toFixed(1)}%`}
        caption={`${data.closedLast30Days} closed in the last 30 days`}
        span={3}
      />
      <Stat
        label="Escalation rate"
        value={`${data.escalationRatePct.toFixed(1)}%`}
        caption={`${data.escalations} cases escalated`}
        span={3}
      />

      <Stat
        label="Average resolution"
        value={`${data.avgResolutionDays.toFixed(1)} days`}
        caption="Cases closed in the last 30 days"
        span={3}
      />

      <Card
        span={9}
        glyph={<IconTeam size={18} />}
        title="Team workload"
        note="Open cases per investigator, and how many are past due."
      >
        <WorkloadChart rows={data.workload} />
      </Card>

      <Card
        span={6}
        glyph={<IconClock size={18} />}
        title="Case aging"
        note="How long the open queue has been open. One hue, light to dark, because these buckets are ordered."
      >
        <AgingChart buckets={data.caseAging} />
      </Card>

      <Card
        span={6}
        glyph={<IconPie size={18} />}
        title="Case mix by type"
        note="Share of the cases opened in the last 30 days."
      >
        <DonutChart slices={mixSlices} centreLabel="cases opened" />
      </Card>

      <Card
        span={12}
        glyph={<IconGrid size={18} />}
        title="When your region gets hit"
        note="Incidents by weekday and hour over the last six months, in local time. Roster against the dark cells; deploy against the model's patrol windows."
      >
        <Heatmap cells={data.incidentHeatmap} />
      </Card>

      <Card
        lead
        span={12}
        glyph={<IconMap size={18} />}
        title="Vandalism risk across your region"
        note="Position reflects each site's actual coordinates; colour and size both encode the risk score."
      >
        <RiskMap sites={data.vandalismAlerts} />
      </Card>

      <Card
        span={12}
        glyph={<IconAlert size={18} />}
        title="Highest-risk sites"
        note="Ranked by today's model output. Any column sorts."
      >
        <DataTable
          columns={riskColumns}
          rows={data.vandalismAlerts}
          rowKey={(row) => row.siteCode}
          filter={filter}
          initialSort={{ key: 'score', direction: 'desc' }}
          emptyMessage="No risk scores available for this region yet."
        />
      </Card>
    </div>
  )
}
