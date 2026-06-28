// Derive property health from Notion's own Severity signals on KPI records.
// Notion (via LPP review) is authoritative — we trust it over re-computing.

import type { KpiSummary, OverallHealth } from "@/types/portal";

export type HealthStatus = "Healthy" | "Monitor" | "Action Required" | "Critical";
export type HealthColor = "green" | "amber" | "red";

export interface HealthResult {
  status: HealthStatus;
  color: HealthColor;
}

// Map Notion's Severity vocabulary → portal display
export function severityToHealth(severity: string): HealthResult {
  switch (severity) {
    case "Healthy":        return { status: "Healthy",        color: "green" };
    case "Monitor":
    case "Validate":       return { status: "Monitor",        color: "amber" };
    case "Action Required":return { status: "Action Required",color: "red"   };
    case "Critical":       return { status: "Critical",       color: "red"   };
    default:               return { status: "Monitor",        color: "amber" };
  }
}

// Map a Brief's Overall Health → HealthResult
export function overallHealthToResult(h: OverallHealth | null): HealthResult {
  switch (h) {
    case "Strong": return { status: "Healthy",         color: "green" };
    case "Stable": return { status: "Monitor",         color: "amber" };
    case "At Risk":return { status: "Action Required", color: "red"   };
    case "Critical":return { status: "Critical",       color: "red"   };
    default:        return { status: "Monitor",        color: "amber" };
  }
}

// Derive health from KpiSummary's aggregated worst severity
export function deriveHealth(kpi: KpiSummary | null): HealthResult {
  if (!kpi) return { status: "Monitor", color: "amber" };
  return severityToHealth(kpi.financialSeverity);
}

export function healthColorClass(color: HealthColor): string {
  return { green: "text-green-600", amber: "text-amber-600", red: "text-red-600" }[color];
}

export function healthBgClass(color: HealthColor): string {
  return {
    green: "bg-green-50 ring-1 ring-green-200",
    amber: "bg-amber-50 ring-1 ring-amber-200",
    red:   "bg-red-50 ring-1 ring-red-200",
  }[color];
}
