// One category's full block (Menu Engineering rebuild, Phase 1) — subtotal
// row, its own scatter plot, and its own item table, replacing the old
// single flat 50-item list and one undifferentiated scatter mixing every
// category together. The LPP Perspective slot for this category lands
// here too, once that's built (Phase 5) — hidden entirely when empty, same
// rule as everywhere else in the portal, not a placeholder string.

import SectionHeader from "@/components/SectionHeader";
import KpiCard from "@/components/KpiCard";
import MenuQuadrantScatter from "@/components/MenuQuadrantScatter";
import MenuItemsTable from "@/components/MenuItemsTable";
import { pct } from "@/lib/format";
import { computeCategorySubtotal, menuCategoryLabel } from "@/lib/menu";
import type { MenuItem } from "@/types/portal";

export default function MenuCategorySection({
  category,
  items,
  batchAvgMarginPct,
  id,
}: {
  category: string;
  items: MenuItem[];
  // Reference line for this category's scatter plot — deliberately the
  // *batch-wide* average margin, not this category's own, even though a
  // per-category line would look tidier. The real Quadrant formula in
  // Notion classifies every item against the batch-wide average, so a
  // per-category threshold would draw a line that disagrees with the
  // color of the points sitting on either side of it.
  batchAvgMarginPct: number | null;
  id?: string;
}) {
  if (items.length === 0) return null;
  const subtotal = computeCategorySubtotal(category, items);

  return (
    <section id={id} className="space-y-4">
      <SectionHeader title={menuCategoryLabel(category)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Items" value={subtotal.itemCount.toLocaleString()} />
        <KpiCard label="Total Portions" value={subtotal.totalPortions.toLocaleString()} />
        <KpiCard
          label="Avg Food Cost %"
          value={subtotal.avgFoodCostPct != null ? pct(subtotal.avgFoodCostPct) : "—"}
        />
        <KpiCard
          label="Avg Popularity"
          value={subtotal.avgPopularityIndex != null ? `${Math.round(subtotal.avgPopularityIndex)}%` : "—"}
        />
      </div>

      <MenuQuadrantScatter items={items} avgMarginPct={batchAvgMarginPct} />
      <MenuItemsTable items={items} hideCategoryFilter />
    </section>
  );
}
