import type { ExecutiveView as ExecutiveData } from '../api/types'
import { ColumnChart } from '../components/ColumnChart'
import { DonutChart } from '../components/DonutChart'
import { ForecastChart } from '../components/ForecastChart'
import { Heatmap } from '../components/Heatmap'
import { RiskMap } from '../components/RiskMap'
import { ScatterPlot } from '../components/ScatterPlot'
import {
  IconAlert,
  IconBars,
  IconClock,
  IconGrid,
  IconMap,
  IconPie,
  IconScatter,
  IconTrend,
} from '../components/icons'
import {
  Card,
  type Column,
  DataTable,
  RiskBadge,
  Stat,
  StatusBadge,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  titleCase,
} from '../components/primitives'

/** Section 7.3 — enterprise posture, major investigations, hotspots and predicted trend. */
export function ExecutiveDashboard({ data, filter }: { data: ExecutiveData; filter?: string }) {
  const posture = data.riskPosture

  const hotspotColumns: Column<ExecutiveData['topHotspots'][number]>[] = [
    { key: 'site', header: 'Site', value: (row) => row.siteName, cellClass: 'strong' },
    { key: 'region', header: 'Region', value: (row) => titleCase(row.region ?? 'Unassigned') },
    { key: 'score', header: 'Score', numeric: true, value: (row) => row.riskScore, render: (row) => row.riskScore.toFixed(2) },
    {
      key: 'band',
      header: 'Band',
      value: (row) => row.riskBand,
      render: (row) => <RiskBadge band={row.riskBand} />,
    },
  ]

  const regionColumns: Column<ExecutiveData['regions'][number]>[] = [
    { key: 'region', header: 'Region', value: (row) => titleCase(row.region ?? 'Unassigned'), cellClass: 'strong' },
    { key: 'cases', header: 'Cases', numeric: true, value: (row) => row.caseCount },
    {
      key: 'impact',
      header: 'Financial impact',
      numeric: true,
      value: (row) => row.financialImpact ?? 0,
      render: (row) => formatCurrency(row.financialImpact),
    },
    { key: 'high', header: 'High-risk sites', numeric: true, value: (row) => row.highRiskSites },
  ]

  const caseColumns: Column<ExecutiveData['majorInvestigations'][number]>[] = [
    { key: 'case', header: 'Case', value: (row) => row.caseNumber, cellClass: 'id' },
    { key: 'title', header: 'Title', value: (row) => row.title },
    { key: 'type', header: 'Type', value: (row) => titleCase(row.caseType) },
    { key: 'region', header: 'Region', value: (row) => titleCase(row.region ?? 'Unassigned') },
    {
      key: 'status',
      header: 'Status',
      value: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: 'age', header: 'Age', numeric: true, value: (row) => row.ageDays, render: (row) => `${row.ageDays}d` },
    {
      key: 'exposure',
      header: 'Exposure',
      numeric: true,
      value: (row) => row.financialImpact ?? 0,
      render: (row) => formatCurrency(row.financialImpact),
    },
  ]

  // Parts of a whole: every scored site is in exactly one band, so the three add up to the
  // estate. Status hues, because these are severity states rather than a data series —
  // and each is written out in the legend so the colour is never the only carrier.
  const postureSlices = [
    { label: 'High risk', value: posture.highRiskSites, color: 'var(--status-critical)' },
    { label: 'Medium risk', value: posture.mediumRiskSites, color: 'var(--status-warning)' },
    { label: 'Low risk', value: posture.lowRiskSites, color: 'var(--status-good)' },
  ]

  const scatterPoints = data.majorInvestigations
    .filter((item) => item.financialImpact !== null && item.financialImpact !== undefined)
    .map((item) => ({
      id: item.caseNumber,
      x: item.ageDays,
      y: item.financialImpact ?? 0,
      label: `${item.caseNumber} · ${item.title}`,
      flagged: item.overdue,
      detail: [
        ['Age', `${item.ageDays} days`],
        ['Exposure', formatCurrency(item.financialImpact)],
        ['Status', titleCase(item.status)],
        ['Region', titleCase(item.region ?? 'Unassigned')],
      ] as [string, string][],
    }))

  return (
    <div className="grid">
      <Stat
        label="Investigations (12 months)"
        value={data.totalInvestigations.toLocaleString()}
        delta={{ value: data.yoyChangePct, goodWhenNegative: true }}
        caption="Cases opened across the enterprise in the trailing year"
        span={6}
        hero
      />
      <Stat
        label="Open financial exposure"
        value={formatCompactCurrency(data.financialExposure)}
        caption={`${formatCurrency(data.financialExposure)} across all unresolved cases`}
        span={3}
      />
      <Stat
        label="Average resolution"
        value={`${data.avgResolutionDays.toFixed(1)} days`}
        caption="Cases closed in the last 12 months"
        span={3}
      />

      <Card
        lead
        span={8}
        glyph={<IconTrend size={18} />}
        title="Projected vandalism incidents"
        note="Daily projection with an 80% prediction interval. Predictions are probabilities, not certainties — they guide where to look, not what will happen."
      >
        <ForecastChart points={data.vandalismForecast} />
      </Card>

      <Card
        span={4}
        glyph={<IconPie size={18} />}
        title="Risk posture of the estate"
        note={
          posture.asOf
            ? `Every scored site, by band, as of ${formatDate(posture.asOf)}.`
            : 'The predictive layer has not run yet.'
        }
      >
        <DonutChart slices={postureSlices} centreLabel="sites scored" unit="sites" />
      </Card>

      <Card
        span={12}
        glyph={<IconGrid size={18} />}
        title="When incidents happen"
        note="Incidents by weekday and hour over the last six months, in each site's own local time. This is the observed pattern the patrol windows are rostered against."
      >
        <Heatmap cells={data.incidentHeatmap} />
      </Card>

      <Card
        span={6}
        glyph={<IconBars size={18} />}
        title="Cases by region"
        note="Volume opened in the trailing twelve months."
      >
        <ColumnChart
          data={data.regions.map((region) => ({
            label: titleCase(region.region ?? 'Unassigned'),
            value: region.caseCount,
            detail: [
              ['Cases', region.caseCount.toLocaleString()],
              ['Financial impact', formatCurrency(region.financialImpact)],
              ['High-risk sites', String(region.highRiskSites)],
            ] as [string, string][],
          }))}
          valueLabel="Cases"
        />
      </Card>

      <Card
        span={6}
        glyph={<IconScatter size={18} />}
        title="Case age against exposure"
        note="One mark per major investigation. The top right — old and expensive — is where escalation is overdue."
      >
        <ScatterPlot
          points={scatterPoints}
          xLabel="Age in days"
          yLabel="Financial exposure"
          formatY={(value) => formatCompactCurrency(value)}
          flaggedLabel="Past due"
        />
      </Card>

      <Card
        span={12}
        glyph={<IconMap size={18} />}
        title="Enterprise risk hotspots"
        note="Every scored site with coordinates. Colour and size both encode the risk score."
      >
        <RiskMap sites={data.topHotspots} />
      </Card>

      <Card span={5} glyph={<IconAlert size={18} />} title="Top hotspots" note="Ranked by today's model output.">
        <DataTable
          columns={hotspotColumns}
          rows={data.topHotspots}
          rowKey={(row) => row.siteCode}
          filter={filter}
          initialSort={{ key: 'score', direction: 'desc' }}
          emptyMessage="No scored sites yet."
        />
      </Card>

      <Card span={7} glyph={<IconClock size={18} />} title="Regional posture" note="Cases opened in the last 12 months, by region.">
        <DataTable
          columns={regionColumns}
          rows={data.regions}
          rowKey={(row) => row.region ?? 'unassigned'}
          filter={filter}
          initialSort={{ key: 'cases', direction: 'desc' }}
          emptyMessage="No regional data available."
        />
      </Card>

      <Card
        span={12}
        glyph={<IconAlert size={18} />}
        title="Major investigations"
        note="Highest financial exposure across the enterprise. Any column sorts."
      >
        <DataTable
          columns={caseColumns}
          rows={data.majorInvestigations}
          rowKey={(row) => row.caseNumber}
          filter={filter}
          initialSort={{ key: 'exposure', direction: 'desc' }}
          emptyMessage="No cases on record."
        />
      </Card>
    </div>
  )
}
