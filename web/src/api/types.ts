/** Wire types mirroring the DTOs in `com.att.gsih.api.dto.Dashboards`. */

export type CaseStatus = 'NEW' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'ESCALATED' | 'CLOSED'
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH'
export type UserRole = 'INVESTIGATOR' | 'MANAGER' | 'EXECUTIVE'

export type IncidentType =
  | 'VANDALISM'
  | 'THEFT'
  | 'FRAUD'
  | 'TRESPASS'
  | 'WORKPLACE_VIOLENCE'
  | 'POLICY_VIOLATION'
  | 'ASSET_LOSS'
  | 'UNAUTHORIZED_ACCESS'
  | 'OTHER'

export interface CaseSummary {
  caseNumber: string
  title: string
  caseType: IncidentType
  status: CaseStatus
  priority: CasePriority
  assigneeEmail: string | null
  siteCode: string | null
  region: string | null
  openedAt: string
  dueAt: string | null
  closedAt: string | null
  ageDays: number
  overdue: boolean
  financialImpact: number | null
  sourceSystem: string | null
}

export interface Factor {
  name: string
  contribution: number
}

export interface RiskAlert {
  siteCode: string
  siteName: string
  region: string | null
  latitude: number | null
  longitude: number | null
  riskScore: number
  riskBand: RiskBand
  peakWindow: string | null
  topFactors: Factor[]
  scoreDate: string
  modelVersion: string | null
}

export interface RepeatIncidentFlag {
  siteCode: string
  siteName: string
  incidentType: IncidentType
  occurrencesLast90Days: number
  mostRecent: string
  relatedCaseNumber: string
}

export interface InvestigatorView {
  investigator: string
  openCases: number
  overdueTasks: number
  avgDaysInStatus: number
  queue: CaseSummary[]
  repeatIncidentFlags: RepeatIncidentFlag[]
  alerts: RiskAlert[]
}

export interface WorkloadRow {
  assigneeEmail: string
  openCases: number
  overdue: number
  loadIndex: number
}

export interface AgingBucket {
  bucket: string
  caseCount: number
}

export interface TypeVolume {
  incidentType: IncidentType
  caseCount: number
}

export interface ManagerView {
  region: string | null
  openCases: number
  closedLast30Days: number
  closureRatePct: number
  escalations: number
  escalationRatePct: number
  avgResolutionDays: number
  workload: WorkloadRow[]
  caseAging: AgingBucket[]
  volumeByType: TypeVolume[]
  vandalismAlerts: RiskAlert[]
}

export interface RegionPosture {
  region: string
  caseCount: number
  financialImpact: number | null
  highRiskSites: number
}

export interface RiskPosture {
  highRiskSites: number
  mediumRiskSites: number
  lowRiskSites: number
  asOf: string | null
}

export interface ForecastPoint {
  date: string
  predicted: number
  lower: number
  upper: number
  horizonDays: number
}

export interface ExecutiveView {
  totalInvestigations: number
  avgResolutionDays: number
  financialExposure: number | null
  yoyChangePct: number
  regions: RegionPosture[]
  majorInvestigations: CaseSummary[]
  topHotspots: RiskAlert[]
  vandalismForecast: ForecastPoint[]
  riskPosture: RiskPosture
}
