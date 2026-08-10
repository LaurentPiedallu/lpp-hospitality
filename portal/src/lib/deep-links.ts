// Shared category/metric -> tab/section routing (Cross-tab audit Part 4,
// centralized here for the Redesign prompt Step 5's Intelligence cross-links
// so a fifth consumer doesn't mean a fifth slightly-drifting copy). Pure
// data, relocated from Overview / Financial Review / Commercial Review /
// Menu Engineering without changing any mapping value — each block below
// carries the same routing reasoning that used to live next to its page.

export interface TabTarget {
  segment: string;
  label: string;
}

// Opportunity category -> destination tab (Overview's Top Priorities).
// One deliberate deviation from a literal read of the original brief: it
// named "Kitchen Allocation" opportunities as menu-related, routing to Menu
// Engineering. The real Financial Review page's Operating Expenses section
// explicitly covers Kitchen Allocation — Menu Engineering covers per-dish
// costing, a different, non-overlapping topic. OpEx-category items (Kitchen
// Allocation's real category) route to Financial Review, where the content
// actually lives; only the real "Menu" category routes to Menu Engineering.
export const PRIORITY_TAB_BY_CATEGORY: Record<string, TabTarget> = {
  Menu:              { segment: "/menu",       label: "Menu Engineering" },
  OpEx:              { segment: "/financial",  label: "Financial Review" },
  Labor:             { segment: "/financial",  label: "Financial Review" },
  Purchasing:        { segment: "/financial",  label: "Financial Review" },
  Reservations:      { segment: "/commercial", label: "Commercial Review" },
  "Revenue Mix":     { segment: "/commercial", label: "Commercial Review" },
  "Guest Retention": { segment: "/commercial", label: "Commercial Review" },
  Pricing:           { segment: "/commercial", label: "Commercial Review" },
};

// Intelligence category -> destination tab (Overview's Emerging Risk,
// Intelligence tab's own cross-links). "Data Quality" intentionally absent
// — never client-facing (Part 6); should never reach this map since
// getIntelligence's clientVisibleOnly scope excludes it upstream.
export const INTEL_CATEGORY_TAB: Record<string, TabTarget> = {
  Financial:  { segment: "/financial",  label: "Financial Review" },
  Labor:      { segment: "/financial",  label: "Financial Review" },
  COGS:       { segment: "/financial",  label: "Financial Review" },
  Execution:  { segment: "/financial",  label: "Financial Review" },
  Commercial: { segment: "/commercial", label: "Commercial Review" },
  Guest:      { segment: "/commercial", label: "Commercial Review" },
  Menu:       { segment: "/menu",       label: "Menu Engineering" },
};

// Financial Review section anchors. "Purchasing" and "OpEx" have no
// FindingSection of their own — Purchasing is food/beverage buying, which
// is what the COGS section covers, and OpEx-category items' actual content
// lives in the Execution-sourced Operating Expenses section.
export const FINANCIAL_METRIC_SECTION: Record<string, string> = {
  total_revenue: "revenue", covers: "revenue", avg_spend: "revenue", avg_check: "revenue",
  labor_pct: "labor", total_payroll: "labor",
  cogs_pct: "cogs", total_cogs: "cogs",
  opex: "opex", opex_pct: "opex",
  net_profit: "profitability", net_profit_pct: "profitability",
};
export const FINANCIAL_CATEGORY_SECTION: Record<string, string> = {
  Financial: "revenue",
  Labor: "labor",
  COGS: "cogs",
  Purchasing: "cogs",
  Execution: "opex",
  OpEx: "opex",
  Profitability: "profitability",
};

// Commercial Review section anchors. Revenue Mix and Pricing have no
// dedicated KPI section of their own — they're purely Opportunity-driven —
// so they land on the Opportunities list itself. Reservations does have a
// real KPI-category match (RevPASH is sourced from KPI Category
// "Reservations"), so it lands there instead.
export const COMMERCIAL_METRIC_SECTION: Record<string, string> = {
  guest_overall: "guest-experience", guest_food: "guest-experience",
  guest_service: "guest-experience", guest_ambiance: "guest-experience",
};
export const COMMERCIAL_CATEGORY_SECTION: Record<string, string> = {
  Guest: "guest-experience",
  "Guest Retention": "guest-experience",
  Commercial: "volume-conversion",
  Reservations: "seat-efficiency",
  "Revenue Mix": "opportunities",
  Pricing: "opportunities",
};

// Menu Engineering section anchors.
export const MENU_CATEGORY_SECTION: Record<string, string> = {
  Menu: "menu-insights",
};

const SECTION_BY_SEGMENT: Record<string, Record<string, string>> = {
  "/financial": FINANCIAL_CATEGORY_SECTION,
  "/commercial": COMMERCIAL_CATEGORY_SECTION,
  "/menu": MENU_CATEGORY_SECTION,
};

// Resolves an Intelligence record's category into a full destination: which
// tab, and which section id within it (for ScrollToSection). Returns null
// for categories with no tab mapping at all.
export function resolveIntelCrossLink(category: string): (TabTarget & { sectionId: string | null }) | null {
  const tab = INTEL_CATEGORY_TAB[category];
  if (!tab) return null;
  const sectionId = SECTION_BY_SEGMENT[tab.segment]?.[category] ?? null;
  return { ...tab, sectionId };
}
