import type { ManagerView as ManagerData } from '../api/types'
import { AgingChart, WorkloadChart } from '../components/BarCharts'
import { RiskMap } from '../components/RiskMap'
import { Card, Empty, RiskBadge, Stat, titleCase } from '../components/primitives'

/** Section 7.2 — workload, aging, closure rate, escalations and regional vandalism risk. */
export function ManagerDashboard({ data }: { data: ManagerData }) {
  return (
    <>
      <div className="grid">
        <Stat label="Open cases" value={data.openCases} caption={data.region ?? 'All regions'} />
        <Stat
          label="Closure rate"
          value={`${data.closureRatePct.toFixed(1)}%`}
          caption={`${data.closedLast30Days} closed in the last 30 days`}
        />
        <Stat
          label="Escalation rate"
          value={`${data.escalationRatePct.toFixed(1)}%`}
          caption={`${data.escalations} cases escalated`}
        />
        <Stat
          label="Average resolution"
          value={`${data.avgResolutionDays.toFixed(1)} days`}
          caption="Cases closed in the last 30 days"
        />
      </div>

      <div className="grid">
        <Card title="Team workload" note="Open cases per investigator, and how many are past due.">
          <WorkloadChart rows={data.workload} />
        </Card>

        <Card title="Case aging" note="How long the open queue has been open.">
          <AgingChart buckets={data.caseAging} />
        </Card>
      </div>

      <Card
        title="Vandalism risk across your region"
        note="Position reflects each site's actual coordinates; colour and size both encode the risk score."
      >
        <RiskMap sites={data.vandalismAlerts} />
      </Card>

      <div className="grid">
        <Card title="Highest-risk sites" note="Ranked by today's model output.">
          {data.vandalismAlerts.length === 0 ? (
            <Empty message="No risk scores available for this region yet." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th className="numeric">Score</th>
                    <th>Band</th>
                    <th>Patrol window</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vandalismAlerts.map((alert) => (
                    <tr key={alert.siteCode}>
                      <td>{alert.siteName}</td>
                      <td className="numeric">{alert.riskScore.toFixed(2)}</td>
                      <td>
                        <RiskBadge band={alert.riskBand} />
                      </td>
                      <td>{alert.peakWindow ?? '—'}</td>
                      <td>
                        {alert.topFactors
                          .slice(0, 2)
                          .map((factor) => factor.name)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Case volume by type" note="Cases opened in the last 30 days.">
          {data.volumeByType.length === 0 ? (
            <Empty message="No cases opened in the window." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="numeric">Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {data.volumeByType.map((row) => (
                    <tr key={row.incidentType}>
                      <td>{titleCase(row.incidentType)}</td>
                      <td className="numeric">{row.caseCount}</td>
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
