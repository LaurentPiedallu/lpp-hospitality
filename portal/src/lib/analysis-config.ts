// Central config for LPP AI analysis pipeline.
// Imported by API routes, UI components, and the intelligence page.
// Changing a category here propagates everywhere automatically.

export const ANALYSIS_CATEGORIES = [
  {
    id: "Financial",
    label: "Financial",
    description: "Revenue, profitability, and cost structure",
    kpiCategories: ["Revenue", "Labor", "COGS", "OpEx", "Profitability"],
  },
  {
    id: "Labor",
    label: "Labor",
    description: "Staffing efficiency and wage management",
    kpiCategories: ["Labor"],
  },
  {
    id: "COGS",
    label: "Food & Bev Cost",
    description: "Input costs and purchasing performance",
    kpiCategories: ["COGS"],
  },
  {
    id: "Commercial",
    label: "Commercial",
    description: "Guest acquisition and channel performance",
    kpiCategories: ["Commercial", "Revenue"],
  },
  {
    id: "Guest",
    label: "Guest Experience",
    description: "Satisfaction scores and feedback themes",
    kpiCategories: ["Guest Experience"],
  },
  {
    id: "Menu",
    label: "Menu Engineering",
    description: "Item performance, pricing, and mix",
    kpiCategories: ["Menu", "COGS"],
  },
  {
    id: "Execution",
    label: "Execution",
    description: "Operational consistency and standards",
    kpiCategories: ["Execution"],
  },
  {
    id: "Data Quality",
    label: "Data Quality",
    description: "Data completeness and confidence",
    kpiCategories: [],
  },
] as const;

export type AnalysisCategoryId = (typeof ANALYSIS_CATEGORIES)[number]["id"];

// How old an intelligence record can be before it's considered stale (shown with warning).
export const STALE_THRESHOLD_DAYS = 30;

// Minimum gap between analysis requests for the same property+category, in minutes.
// Admin bypasses this check.
export const RATE_LIMIT_MINUTES = 60;

/** True if the intelligence record is older than STALE_THRESHOLD_DAYS. */
export function isStale(createdAt: string | null | undefined): boolean {
  if (!createdAt) return true;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return ageDays > STALE_THRESHOLD_DAYS;
}

/** True if a new request should be blocked (analysis too recent). */
export function isRateLimited(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs < RATE_LIMIT_MINUTES * 60_000;
}

/** Human-readable age string: "Today", "3d ago", "2mo ago". */
export function relativeAge(createdAt: string | null | undefined): string {
  if (!createdAt) return "Never";
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
