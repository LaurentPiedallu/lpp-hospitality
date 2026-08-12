import type { MenuItem, MenuQuadrant } from "@/types/portal";

// Category display order (Menu Engineering rebuild, Phase 1) — matches the
// source Excel's structure (Starters, Mains, Sides, Desserts, Market Menu),
// plus the beverage categories that exist in the real Notion schema but
// have zero items in the current batch — kept in the order so a future
// upload that populates them renders in a sensible position rather than
// silently falling through. "Other" always sorts last, displayed as
// "Market Menu" (see menuCategoryLabel below).
export const MENU_CATEGORY_ORDER = [
  "Starters", "Mains", "Sides", "Desserts",
  "Cocktails", "Wine", "Beer", "Non-Alcoholic",
  "Other",
];

// "Other" is confirmed exclusively Market Menu ("MK"-prefixed) items — every
// one of the 11 real "Other" records in Lex Yard's June batch is an "LY MK
// ..." item, checked directly against Notion before this mapping was
// written (Menu Engineering rebuild, Phase 0 item 2). Display label only —
// the underlying Notion Category value stays "Other" (the real select
// option), so this doesn't require a schema change or risk drifting from
// what's actually stored.
export const MENU_CATEGORY_DISPLAY_NAME: Record<string, string> = {
  Other: "Market Menu",
};

export function menuCategoryLabel(category: string): string {
  return MENU_CATEGORY_DISPLAY_NAME[category] ?? category;
}

export interface MenuCategorySubtotal {
  category: string;
  itemCount: number;
  totalPortions: number;
  avgFoodCostPct: number | null;
  avgPopularityIndex: number | null;
  totalRevenue: number;
}

// Subtotal row per category (Phase 1 item 3) — replicates the shape of the
// source Excel's own Sub Total rows (portions, average food cost %,
// average popularity) rather than inventing a new summary format. Nulls
// excluded from averages rather than treated as 0, same convention as
// everywhere else in the portal.
export function computeCategorySubtotal(category: string, items: MenuItem[]): MenuCategorySubtotal {
  const foodCostPcts = items.map((i) => i.foodCostPct).filter((v): v is number => v != null);
  const popIndexes = items.map((i) => i.popularityIndex).filter((v): v is number => v != null);
  return {
    category,
    itemCount: items.length,
    totalPortions: items.reduce((s, i) => s + i.portionsSold, 0),
    avgFoodCostPct: foodCostPcts.length ? foodCostPcts.reduce((s, v) => s + v, 0) / foodCostPcts.length : null,
    avgPopularityIndex: popIndexes.length ? popIndexes.reduce((s, v) => s + v, 0) / popIndexes.length : null,
    totalRevenue: items.reduce((s, i) => s + (i.revenue ?? 0), 0),
  };
}

// Fixed order — matches MenuQuadrantScatter's own QUADRANT_ORDER, never
// reassigned when the visible set changes.
export const QUADRANT_ORDER: Exclude<MenuQuadrant, "Pending">[] = ["Star", "Plowhorse", "Puzzle", "Dog"];

export interface QuadrantScorecardCell {
  quadrant: Exclude<MenuQuadrant, "Pending">;
  pctItems: number;
  pctPortions: number;
  pctRevenue: number;
}

// Category-level scorecard (Phase 2) — % of items/portions/revenue per
// quadrant, built from the exact same MenuItem fields the scatter plots
// and subtotal rows already use, so this can't drift out of sync with
// them via a separate calculation path. Pending items (no quadrant yet)
// are excluded from every percentage base, same as the scatter plot.
export function computeQuadrantScorecard(items: MenuItem[]): QuadrantScorecardCell[] {
  const classified = items.filter((i): i is MenuItem & { quadrant: Exclude<MenuQuadrant, "Pending"> } => i.quadrant !== "Pending");
  const totalItems = classified.length;
  const totalPortions = classified.reduce((s, i) => s + i.portionsSold, 0);
  const totalRevenue = classified.reduce((s, i) => s + (i.revenue ?? 0), 0);
  return QUADRANT_ORDER.map((q) => {
    const inQ = classified.filter((i) => i.quadrant === q);
    const portions = inQ.reduce((s, i) => s + i.portionsSold, 0);
    const revenue = inQ.reduce((s, i) => s + (i.revenue ?? 0), 0);
    return {
      quadrant: q,
      pctItems: totalItems ? (inQ.length / totalItems) * 100 : 0,
      pctPortions: totalPortions ? (portions / totalPortions) * 100 : 0,
      pctRevenue: totalRevenue ? (revenue / totalRevenue) * 100 : 0,
    };
  });
}
