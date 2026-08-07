import type { InvestigatorView as InvestigatorData } from '../api/types'
import {
  Card,
  Empty,
  OverdueBadge,
  RiskBadge,
  Stat,
  formatCurrency,
  formatDate,
  titleCase,
} from '../components/primitives'

/** Section 7.1 — personal case queue, deadlines, repeat-incident flags and next steps. */
export function InvestigatorDashboard({ data }: { data: InvestigatorData }) {
  return (
    <>
      <div className="grid">
        <Stat label="Open cases" value={data.openCases} caption={data.investigator} />
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
