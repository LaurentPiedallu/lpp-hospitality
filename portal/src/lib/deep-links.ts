// Shared category/metric -> tab/section routing (Cross-tab audit Part 4,
// centralized here for the Redesign prompt Step 5's Intelligence cross-links
// so a fifth consumer doesn't mean a fifth slightly-drifting copy). Pure
// data, relocated from Overview / Financial Review / Commercial Review /
// Menu Engineering without changing any mapping value — each block below
// carries the same routing reasoning that used to live next to its page.

import type { Intelligence } from "@/types/portal";

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
  // NOTE: "Execution" here carries the same wrong assumption that was just
  // fixed in financial/page.tsx — OpEx findings are filed under Intelligence
  // Category "Financial", not "Execution" (the schema has no OpEx value).
  // Left as-is on purpose: this map drives inbound deep-link scroll routing,
  // "Financial" already routes to "revenue", and re-pointing it is a broader
  // change with its own trade-off — not part of that bug fix.
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

// Per-record override for INTEL_CATEGORY_TAB's category-level default —
// needed when one record shares a category with others that all correctly
// route elsewhere, but this specific record's content belongs on a
// different tab. Every other Execution-category record legitimately
// defaults to Financial Review (that's where Execution's Operating
// Expenses narrative lives); this one is about reservation-to-arrival
// conversion, which is Commercial Review's Volume & Conversion territory
// instead (it directly references that section's own 49% reserved-cover
// finding). Keyed by the record's own Finding title — the only per-record
// stable key Intelligence carries — so this stays directly auditable
// against Notion's title field rather than an opaque page id.
const INTEL_FINDING_OVERRIDE: Record<string, TabTarget & { sectionId: string | null; queryCategory: string }> = {
  "No-show rate at 4% reflects strong reservation-to-arrival conversion": {
    segment: "/commercial",
    label: "Commercial Review",
    sectionId: "volume-conversion",
    // Commercial Review's own COMMERCIAL_CATEGORY_SECTION has no
    // "Execution" entry (this record's real Intelligence Category), so the
    // query param sent to the destination tab uses "Commercial" instead —
    // the value that map already resolves to "volume-conversion".
    queryCategory: "Commercial",
  },
};

// Resolves an Intelligence record's category into a full destination: which
// tab, and which section id within it (for ScrollToSection). Returns null
// for categories with no tab mapping at all. Takes the record itself
// (rather than a bare category string) so a per-record override above can
// take precedence over the category-level default for the one record that
// needs it, while every other record keeps its existing category-derived
// destination unchanged.
export function resolveIntelCrossLink(
  intelligence: Pick<Intelligence, "category" | "finding">
): (TabTarget & { sectionId: string | null; queryCategory: string }) | null {
  const override = INTEL_FINDING_OVERRIDE[intelligence.finding];
  if (override) return override;
  const tab = INTEL_CATEGORY_TAB[intelligence.category];
  if (!tab) return null;
  const sectionId = SECTION_BY_SEGMENT[tab.segment]?.[intelligence.category] ?? null;
  return { ...tab, sectionId, queryCategory: intelligence.category };
}
