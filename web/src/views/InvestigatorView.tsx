import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { InvestigatorView as InvestigatorData, LinkGraph } from '../api/types'
import { LinkGraphView } from '../components/LinkGraphView'
import {
  Card,
  Empty,
  Loading,
  OverdueBadge,
  RiskBadge,
  Stat,
  formatCurrency,
  formatDate,
  titleCase,
} from '../components/primitives'

/** Section 7.1 — personal case queue, deadlines, repeat-incident flags and next steps. */
export function InvestigatorDashboard({
  data,
  token,
}: {
  data: InvestigatorData
  token?: string
}) {
  return (
    <>
      <div className="grid">
        <Stat label="Open cases" value={data.openCases} caption={data.investigator} hero />
        <Stat
          label="Overdue tasks"
          value={data.overdueTasks}
          caption={data.overdueTasks > 0 ? 'Past their due date' : 'Nothing past due'}
        />
        <Stat
          label="Average time in status"
          value={`${data.avgDaysInStatus.toFixed(1)} days`}
          caption="Across your open queue"
        />
      </div>

      <Card
        lead
        title="Your case queue"
        note="Highest priority first, then earliest deadline."
      >
        {data.queue.length === 0 ? (
          <Empty message="No open cases assigned to you." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Site</th>
                  <th>Due</th>
                  <th className="numeric">Age</th>
                  <th className="numeric">Exposure</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((item) => (
                  <tr key={item.caseNumber}>
                    <td>{item.caseNumber}</td>
                    <td>{titleCase(item.caseType)}</td>
                    <td>{titleCase(item.priority)}</td>
                    <td>{titleCase(item.status)}</td>
                    <td>{item.siteCode ?? '—'}</td>
                    <td>{formatDate(item.dueAt)}</td>
                    <td className="numeric">{item.ageDays}d</td>
                    <td className="numeric">{formatCurrency(item.financialImpact)}</td>
                    <td>
                      <OverdueBadge overdue={item.overdue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {token && data.queue.length > 0 ? (
        <LinkAnalysisPanel token={token} queue={data.queue.map((c) => c.caseNumber)} />
      ) : null}

      <div className="grid">
        <Card
          title="Related incident flags"
          note="Sites in your queue where the same incident type keeps recurring."
        >
          {data.repeatIncidentFlags.length === 0 ? (
            <Empty message="No repeat patterns detected on your sites." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Type</th>
                    <th className="numeric">Last 90 days</th>
                    <th>Most recent</th>
                    <th>Your case</th>
                  </tr>
                </thead>
                <tbody>
                  {data.repeatIncidentFlags.map((flag) => (
                    <tr key={`${flag.siteCode}-${flag.incidentType}`}>
                      <td>{flag.siteName}</td>
                      <td>{titleCase(flag.incidentType)}</td>
                      <td className="numeric">{flag.occurrencesLast90Days}</td>
                      <td>{formatDate(flag.mostRecent)}</td>
                      <td>{flag.relatedCaseNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Risk alerts on your sites"
          note="Predicted vandalism risk for the sites you hold cases at."
        >
          {data.alerts.length === 0 ? (
            <Empty message="No elevated risk on your sites today." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th className="numeric">Score</th>
                    <th>Band</th>
                    <th>Patrol window</th>
                    <th>Leading factor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts.map((alert) => (
                    <tr key={alert.siteCode}>
                      <td>{alert.siteName}</td>
                      <td className="numeric">{alert.riskScore.toFixed(2)}</td>
                      <td>
                        <RiskBadge band={alert.riskBand} />
                      </td>
                      <td>{alert.peakWindow ?? '—'}</td>
                      <td>{alert.topFactors[0]?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
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
      title="Link analysis"
      note="What else touches this case — the same site, the same badge after hours, the same alarm pattern."
    >
      <div className="toolbar" style={{ marginBottom: 12 }}>
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
      </div>

      {loading ? <Loading what="link graph" /> : null}
      {error ? <Empty message={error} /> : null}
      {!loading && !error && graph ? <LinkGraphView graph={graph} /> : null}
    </Card>
  )
}
