import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { InvestigatorView as InvestigatorData, LinkGraph } from '../api/types'
import { LinkGraphView } from '../components/LinkGraphView'
import { IconAlert, IconCase, IconNetwork, IconTrend } from '../components/icons'
import {
  Card,
  type Column,
  DataTable,
  Empty,
  Loading,
  OverdueBadge,
  RiskBadge,
  Stat,
  StatusBadge,
  formatCurrency,
  formatDate,
  titleCase,
} from '../components/primitives'

/** Section 7.1 — personal case queue, deadlines, repeat-incident flags and next steps. */
export function InvestigatorDashboard({
  data,
  token,
  filter,
}: {
  data: InvestigatorData
  token?: string
  filter?: string
}) {
  const queueColumns: Column<InvestigatorData['queue'][number]>[] = [
    { key: 'case', header: 'Case', value: (row) => row.caseNumber, cellClass: 'id' },
    { key: 'title', header: 'Title', value: (row) => row.title },
    { key: 'type', header: 'Type', value: (row) => titleCase(row.caseType) },
    { key: 'priority', header: 'Priority', value: (row) => titleCase(row.priority) },
    {
      key: 'status',
      header: 'Status',
      value: (row) => row.status,
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: 'site', header: 'Site', value: (row) => row.siteCode ?? '—' },
    {
      key: 'due',
      header: 'Due',
      // Sorted on the raw timestamp, shown as a readable date: sorting the formatted
      // string would put "Apr" before "Jan" and look like a bug in the queue.
      value: (row) => row.dueAt ?? '',
      render: (row) => formatDate(row.dueAt),
    },
    { key: 'age', header: 'Age', numeric: true, value: (row) => row.ageDays, render: (row) => `${row.ageDays}d` },
    {
      key: 'exposure',
      header: 'Exposure',
      numeric: true,
      value: (row) => row.financialImpact ?? 0,
      render: (row) => formatCurrency(row.financialImpact),
    },
    {
      key: 'flag',
      header: 'Flag',
      value: (row) => (row.overdue ? 'Overdue' : 'On track'),
      render: (row) => <OverdueBadge overdue={row.overdue} />,
    },
  ]

  const flagColumns: Column<InvestigatorData['repeatIncidentFlags'][number]>[] = [
    { key: 'site', header: 'Site', value: (row) => row.siteName, cellClass: 'strong' },
    { key: 'type', header: 'Type', value: (row) => titleCase(row.incidentType) },
    { key: 'count', header: 'Last 90 days', numeric: true, value: (row) => row.occurrencesLast90Days },
    { key: 'recent', header: 'Most recent', value: (row) => row.mostRecent, render: (row) => formatDate(row.mostRecent) },
    { key: 'case', header: 'Your case', value: (row) => row.relatedCaseNumber, cellClass: 'id' },
  ]

  const alertColumns: Column<InvestigatorData['alerts'][number]>[] = [
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
    { key: 'factor', header: 'Leading factor', value: (row) => row.topFactors[0]?.name ?? '—' },
  ]

  return (
    <div className="grid">
      <Stat
        label="Open cases"
        value={data.openCases}
        caption={data.investigator}
        span={6}
        hero
      />
      <Stat
        label="Overdue tasks"
        value={data.overdueTasks}
        caption={data.overdueTasks > 0 ? 'Past their due date' : 'Nothing past due'}
        span={3}
      />
      <Stat
        label="Average time in status"
        value={`${data.avgDaysInStatus.toFixed(1)} days`}
        caption="Across your open queue"
        span={3}
      />

      <Card
        lead
        span={12}
        glyph={<IconCase size={18} />}
        title="Your case queue"
        note="Highest priority first, then earliest deadline. Any column sorts — due date when you are planning the week, exposure when you are justifying one."
      >
        <DataTable
          columns={queueColumns}
          rows={data.queue}
          rowKey={(row) => row.caseNumber}
          filter={filter}
          emptyMessage="No open cases assigned to you."
        />
      </Card>

      <Card
        span={6}
        glyph={<IconTrend size={18} />}
        title="Related incident flags"
        note="Sites in your queue where the same incident type keeps recurring."
      >
        <DataTable
          columns={flagColumns}
          rows={data.repeatIncidentFlags}
          rowKey={(row) => `${row.siteCode}-${row.incidentType}`}
          filter={filter}
          initialSort={{ key: 'count', direction: 'desc' }}
          emptyMessage="No repeat patterns detected on your sites."
        />
      </Card>

      <Card
        span={6}
        glyph={<IconAlert size={18} />}
        title="Risk alerts on your sites"
        note="Predicted vandalism risk for the sites you hold cases at."
      >
        <DataTable
          columns={alertColumns}
          rows={data.alerts}
          rowKey={(row) => row.siteCode}
          filter={filter}
          initialSort={{ key: 'score', direction: 'desc' }}
          emptyMessage="No elevated risk on your sites today."
        />
      </Card>

      {token && data.queue.length > 0 ? (
        <LinkAnalysisPanel token={token} queue={data.queue.map((c) => c.caseNumber)} />
      ) : null}
    </div>
  )
}

/**
 * Link analysis for one case in the queue (Section 7.1).
 *
 * Defaults to the top of the queue — the case the investigator is most likely working —
 * and lets them walk the rest. Two hops covers "this case's site and everything on it";
 * three follows a shared badge to a second site, which is the finding worth surfacing.
 */
function LinkAnalysisPanel({ token, queue }: { token: string; queue: string[] }) {
  const [caseNumber, setCaseNumber] = useState(queue[0])
  const [hops, setHops] = useState(2)
  const [graph, setGraph] = useState<LinkGraph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .linkGraph(token, caseNumber, hops)
      .then((result) => {
        if (!cancelled) setGraph(result)
      })
      .catch((cause) => {
        if (!cancelled) {
          setGraph(null)
          setError(cause instanceof Error ? cause.message : 'Could not build the link graph')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    // Guards against a slow response for a previously selected case overwriting a newer one.
    return () => {
      cancelled = true
    }
  }, [token, caseNumber, hops])

  return (
    <Card
      span={12}
      glyph={<IconNetwork size={18} />}
      title="Link analysis"
      note="What else touches this case — the same site, the same badge after hours, the same alarm pattern."
      actions={
        <>
          <label>
            <span className="visually-hidden">Case</span>
            <select value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)}>
              {queue.map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="visually-hidden">Search depth</span>
            <select value={hops} onChange={(e) => setHops(Number(e.target.value))}>
              <option value={1}>1 step — this case&apos;s site</option>
              <option value={2}>2 steps — everything at that site</option>
              <option value={3}>3 steps — follow shared badges</option>
            </select>
          </label>
        </>
      }
    >
      {loading ? <Loading what="link graph" /> : null}
      {error ? <Empty message={error} /> : null}
      {!loading && !error && graph ? <LinkGraphView graph={graph} /> : null}
    </Card>
  )
}
