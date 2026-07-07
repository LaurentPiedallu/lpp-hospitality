// ─── Portal domain types ─────────────────────────────────────────────────────

export type ClientStatus = "Prospect" | "Active" | "Paused" | "Completed" | "Archived";
export type PropertyStatus = "Active" | "Pre-Opening" | "Paused" | "Closed" | "Archived";
export type PublishStatus = "Draft" | "LPP Review" | "Published" | "Archived";
export type Severity = "Healthy" | "Monitor" | "Action Required" | "Critical" | "Validate";
export type DataConfidence = "High" | "Medium" | "Low" | "Requires Validation";
export type OverallHealth = "Strong" | "Stable" | "At Risk" | "Critical";
export type RiskStatus = "Open" | "Mitigating" | "Escalated" | "Closed" | "Archived";
export type InitiativeStatus = "Not Started" | "In Progress" | "Blocked" | "Complete" | "Measured" | "Archived";
export type InitiativeColumn = "Now" | "Next" | "Later";

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  email: string;
}

export interface Property {
  id: string;
  clientId: string;
  name: string;
  location: string;
  conceptType: string;
  status: PropertyStatus;
  dataConfidence: DataConfidence;
}

export type LppMetricKey =
  | "total_revenue" | "total_cogs" | "total_payroll" | "net_profit"
  | "covers" | "avg_spend" | "avg_check"
  | "labor_pct" | "cogs_pct" | "net_profit_pct"
  | "opex" | "opex_pct"
  | "guest_overall" | "guest_food" | "guest_service" | "guest_ambiance";

// KPI Records are one row per metric — we work with them individually
export interface KpiMetric {
  id: string;
  propertyId: string;
  kpiRecord: string;       // title
  category: string;        // Revenue | Labor | COGS | OpEx | Profitability | Guest Experience | ...
  metricName: string;
  lppMetricKey: LppMetricKey | null;
  metricValue: number;
  unit: string;            // $ | % | Count | Rating | Days | Text
  severity: Severity;
  trend: string;           // Improving | Stable | Declining | New Baseline
  confidence: DataConfidence;
  benchmarkLow: number | null;
  benchmarkHigh: number | null;
  targetValue: number | null;
  interpretation: string;
  periodStart: string | null; // ISO date
}

// Aggregated view built from a set of KpiMetrics for one period
export interface KpiSummary {
  period: string;          // ISO date of Reporting Period start
  revenue: number | null;
  covers: number | null;
  avgSpend: number | null;
  laborDollars: number | null;
  laborPct: number | null;
  cogsDollars: number | null;
  cogsPct: number | null;
  opexDollars: number | null;
  opexPct: number | null;
  netProfitDollars: number | null;
  netProfitPct: number | null;
  guestOverall: number | null;
  guestFood: number | null;
  guestService: number | null;
  guestAmbiance: number | null;
  // worst severity across financial metrics
  financialSeverity: Severity;
}

export interface Action {
  id: string;
  propertyId: string;
  title: string;
  notes: string;
  owner: string;
  status: "Not Started" | "In Progress" | "Waiting on Client" | "Complete" | "Blocked";
  priority: "Critical" | "High" | "Medium" | "Low";
  decisionRequired: boolean;
  dueDateIso: string | null;
}

export interface Opportunity {
  id: string;
  propertyId: string;
  title: string;
  estimatedAnnualImpact: number;
  estimatedMonthlyImpact: number;
  stage: string;
  category: string;
  priority: string;
  nextStep: string;
}

export interface Risk {
  id: string;
  propertyId: string;
  title: string;
  mitigationPlan: string;
  status: RiskStatus;
  impact: string;
  category: string;
}

export interface Intelligence {
  id: string;
  propertyId: string;
  finding: string;         // title
  category: string;        // Financial | Labor | COGS | Guest | Commercial | Menu | Execution | Data Quality
  currentRead: string;
  whyItMatters: string;
  suggestedDecision: string;
  severity: Severity;
  confidence: DataConfidence;
  periodStart: string | null;
  createdAt: string | null;  // Notion page created_time — used for staleness detection
}

export interface Initiative {
  id: string;
  propertyId: string;
  title: string;
  category: string;
  operationalOwner: string;
  financialOwner: string;
  status: InitiativeStatus;
  priority: string;
  column: InitiativeColumn; // derived from priority
  expectedImpact: number;
  nextMilestone: string;
}

export interface Brief {
  id: string;
  clientId: string;
  title: string;
  executiveSummary: string;
  overallHealth: OverallHealth | null;
  confidence: DataConfidence;
  estimatedAnnualImpact: number;
  briefPageUrl: string;
  reportingPeriodStart: string | null;
  publishedDateStart: string | null;
}

export interface Benchmark {
  id: string;
  title: string;
  metricName: string;
  conceptType: string;
  market: string;
  lowRange: number | null;
  highRange: number | null;
  topQuartile: number | null;
  unit: string;
}

export type UploadStatus = "Pending Review" | "Reviewed" | "Archived";

export interface Upload {
  id: string;
  clientId: string;
  propertyId: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string | null;
  status: UploadStatus;
  notes: string;
}
