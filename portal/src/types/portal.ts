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
  // Which slice of the metric this row represents (e.g. "Breakfast",
  // "Food", "Wages Total") — a second axis alongside lppMetricKey, not a
  // replacement. Null/blank means "Total" by convention (records Published
  // before this field existed were never backfilled) — see findMetricByKey
  // in lib/format.ts, which already treats blank as Total.
  segment: string | null;
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
  // Notion's own last_edited_time — no "Processed At" property exists on
  // this database, this is the closest honest proxy for "when was this
  // record last touched by the backend."
  processedAt: string | null;
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
  clientVisible: boolean;
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
  // No field on Opportunity itself captures the causal "why" distinct from
  // the headline — that lives on the linked Intelligence finding instead.
  sourceIntelligenceId: string | null;
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
  processedAt: string | null; // Notion page last_edited_time — see KpiMetric.processedAt
  // Used to pick between multiple records sharing a category for the same
  // period (Notion's own categorization doesn't otherwise disambiguate) —
  // see findIntelligence in lib/format.ts.
  estimatedAnnualImpact: number;
  // Used to rank same-severity Intelligence records against each other
  // (e.g. Overview's Emerging Risk selection) — a monthly figure reads
  // better than annual for a "how big is this right now" comparison.
  estimatedMonthlyImpact: number;
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
  actionIds: string[];        // linked Actions relation
  completionPct: number | null; // 0-100, from Notion's Completion % rollup
}

export interface Brief {
  id: string;
  clientId: string;
  propertyId: string | null;
  title: string;
  executiveSummary: string;
  // Added alongside Executive Summary for a hierarchical executive-briefing
  // layout (Overview tab) — populated by Make for Briefs generated after
  // this schema change, empty ("") on older ones. Empty Executive Read is
  // the trigger to fall back to the old single-paragraph Executive Summary
  // rendering, not the mere existence of these fields on the type.
  executiveRead: string;
  // Raw rich text, one driver per line (confirmed "\n"-separated in the
  // real Notion API payload — see lib/format.ts's parseTextLines, which
  // does the actual line-splitting; kept raw here like every other
  // rich-text field on this type).
  criticalDrivers: string;
  lppPerspective: string;
  // Raw rich text — 1-2 numbered items, same "\n" convention as
  // criticalDrivers if there's ever more than one (see parseTextLines).
  recommendedFocus: string;
  decisionsRequired: string;
  overallHealth: OverallHealth | null;
  confidence: DataConfidence;
  estimatedAnnualImpact: number;
  briefPageUrl: string;
  reportingPeriodStart: string | null;
  publishedDateStart: string | null;
  biggestOpportunityId: string | null;
  biggestRiskId: string | null;
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

export type UploadStatus =
  | "Uploaded" | "Pending" | "Processing" | "In Progress"
  | "Needs Review" | "Processed" | "Published" | "Failed" | "Archived";

export interface Upload {
  id: string;
  clientId: string;
  propertyId: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string | null;
  status: UploadStatus;
  notes: string;
  uploadType: string;             // e.g. "P&L", "Guest Reviews" — used to detect pending uploads
  reportingPeriod: string | null; // ISO date, distinct from Upload Date
}

// Admin-only — whether a property's most recent reporting period is actually
// ready to show a client, broken down by which database is holding it back.
export interface PublishGateCounts {
  total: number;
  published: number;
}

export interface PublishGateStatus {
  propertyId: string;
  propertyName: string;
  clientId: string;
  period: string | null; // most recent period with any content at all, across Intel/Opp/Risk
  intelOppRisk: PublishGateCounts | null;
  actions: PublishGateCounts | null;
  briefStatus: PublishStatus | null; // null = no Brief exists yet for this period
  // Actions belonging to this property but linked to an Initiative whose own
  // Property points elsewhere — invisible everywhere else in the product,
  // since the Action still queries correctly by its own Property, it just
  // never groups under any Initiative for this property. Not period-scoped:
  // any such mis-link, from any period, is worth surfacing.
  initiativeMismatchCount: number;
}
