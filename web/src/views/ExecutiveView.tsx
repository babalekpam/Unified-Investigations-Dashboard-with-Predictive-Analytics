import type { ExecutiveView as ExecutiveData } from '../api/types'
import { ForecastChart } from '../components/ForecastChart'
import { RiskMap } from '../components/RiskMap'
import {
  Card,
  Empty,
  RiskBadge,
  Stat,
  formatCurrency,
  formatDate,
  titleCase,
} from '../components/primitives'

/** Section 7.3 — enterprise posture, major investigations, hotspots and predicted trend. */
export function ExecutiveDashboard({ data }: { data: ExecutiveData }) {
  const posture = data.riskPosture

  return (
    <>
      <div className="grid">
        <Stat
          label="Investigations (12 months)"
          value={data.totalInvestigations.toLocaleString()}
          delta={{ value: data.yoyChangePct, goodWhenNegative: true }}
        />
        <Stat
          label="Average resolution"
          value={`${data.avgResolutionDays.toFixed(1)} days`}
          caption="Cases closed in the last 12 months"
        />
        <Stat
          label="Open financial exposure"
          value={formatCurrency(data.financialExposure)}
          caption="Across all unresolved cases"
        />
        <Stat
          label="High-risk sites"
          value={posture.highRiskSites}
          caption={
            posture.asOf
              ? `${posture.mediumRiskSites} medium, ${posture.lowRiskSites} low · scored ${formatDate(posture.asOf)}`
              : 'The predictive layer has not run yet'
          }
        />
      </div>

      <Card
        title="Projected vandalism incidents"
        note="Daily projection with an 80% prediction interval. Predictions are probabilities, not certainties — they guide where to look, not what will happen."
      >
        <ForecastChart points={data.vandalismForecast} />
      </Card>

      <Card
        title="Enterprise risk hotspots"
        note="Every scored site with coordinates. Colour and size both encode the risk score."
      >
        <RiskMap sites={data.topHotspots} />
      </Card>

      <div className="grid">
        <Card title="Regional posture" note="Cases opened in the last 12 months, by region.">
          {data.regions.length === 0 ? (
            <Empty message="No regional data available." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Region</th>
                    <th className="numeric">Cases</th>
                    <th className="numeric">Financial impact</th>
                    <th className="numeric">High-risk sites</th>
                  </tr>
                </thead>
                <tbody>
                  {data.regions.map((region) => (
                    <tr key={region.region}>
                      <td>{titleCase(region.region ?? 'Unassigned')}</td>
                      <td className="numeric">{region.caseCount}</td>
                      <td className="numeric">{formatCurrency(region.financialImpact)}</td>
                      <td className="numeric">{region.highRiskSites}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Top hotspots" note="Ranked by today's model output.">
          {data.topHotspots.length === 0 ? (
            <Empty message="No scored sites yet." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Region</th>
                    <th className="numeric">Score</th>
                    <th>Band</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topHotspots.map((alert) => (
                    <tr key={alert.siteCode}>
                      <td>{alert.siteName}</td>
                      <td>{titleCase(alert.region ?? 'Unassigned')}</td>
                      <td className="numeric">{alert.riskScore.toFixed(2)}</td>
                      <td>
                        <RiskBadge band={alert.riskBand} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Major investigations" note="Highest financial exposure across the enterprise.">
        {data.majorInvestigations.length === 0 ? (
          <Empty message="No cases on record." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th className="numeric">Age</th>
                  <th className="numeric">Exposure</th>
                </tr>
              </thead>
              <tbody>
                {data.majorInvestigations.map((item) => (
                  <tr key={item.caseNumber}>
                    <td>{item.caseNumber}</td>
                    <td>{item.title}</td>
                    <td>{titleCase(item.caseType)}</td>
                    <td>{titleCase(item.region ?? 'Unassigned')}</td>
                    <td>{titleCase(item.status)}</td>
                    <td className="numeric">{item.ageDays}d</td>
                    <td className="numeric">{formatCurrency(item.financialImpact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
