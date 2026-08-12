// One category's full block (Menu Engineering rebuild, Phase 1) — subtotal
// row, its own scatter plot, and its own item table, replacing the old
// single flat 50-item list and one undifferentiated scatter mixing every
// category together. The LPP Perspective slot for this category lands
// here too, once that's built (Phase 5) — hidden entirely when empty, same
// rule as everywhere else in the portal, not a placeholder string.

import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import KpiCard from "@/components/KpiCard";
import MenuQuadrantScatter from "@/components/MenuQuadrantScatter";
import MenuItemsTable from "@/components/MenuItemsTable";
import { pct } from "@/lib/format";
import { computeCategorySubtotal, menuCategoryLabel, type MenuItemPairing } from "@/lib/menu";
import type { Intelligence, MenuItem } from "@/types/portal";

export default function MenuCategorySection({
  category,
  items,
  batchAvgMarginPct,
  pairings,
  intelligence,
  id,
  crossTabDeepLink,
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
  pairings?: Map<string, MenuItemPairing>;
  // LPP Perspective slot (Phase 5) — always null today: the real
  // Intelligence schema has no per-category-of-menu dimension, only a
  // single tab-wide "Menu" category (already surfaced in the Menu Insights
  // block above this section). Wired as a real prop rather than hardcoded
  // null so a future per-category Intelligence record needs no further
  // frontend work, but nothing here fabricates content in the meantime —
  // hidden entirely when null, same rule as everywhere else in the portal.
  intelligence?: Intelligence | null;
  id?: string;
  // Cross-tab connection (Phase 4 item 3) — used only for Market Menu, to
  // validate Commercial Review's "Introduce dinner prix-fixe" opportunity
  // estimate against this category's real item economics rather than
  // rewriting that opportunity card in this session.
  crossTabDeepLink?: { href: string; label: string };
}) {
  if (items.length === 0) return null;
  const subtotal = computeCategorySubtotal(category, items);

  return (
    <section id={id} className="space-y-4">
      <SectionHeader title={menuCategoryLabel(category)} />

      {crossTabDeepLink && (
        <p style={{ fontFamily: "'Jost', 'Inter', system-ui, sans-serif", fontSize: 12, color: "rgba(18,18,15,0.45)", fontStyle: "italic", marginTop: -8 }}>
          Real margin data behind this category can validate or challenge{" "}
          <Link href={crossTabDeepLink.href} style={{ color: "#B8935A", textDecoration: "none" }}>
            {crossTabDeepLink.label}
          </Link>
          &apos;s estimated impact.
        </p>
      )}

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
      <MenuItemsTable items={items} hideCategoryFilter pairings={pairings} />

      {(intelligence?.whyItMatters || intelligence?.suggestedDecision) && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>LPP Perspective</span>
            <span className="text-gray-400 text-xs">▼</span>
          </summary>
          <div className="px-5 pb-5 pt-2 space-y-4 border-t border-gray-50">
            {intelligence?.whyItMatters && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Why It Matters</p>
                <p className="text-sm text-gray-700 leading-relaxed">{intelligence.whyItMatters}</p>
              </div>
            )}
            {intelligence?.suggestedDecision && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Recommendation</p>
                <p className="text-sm text-gray-700 leading-relaxed">{intelligence.suggestedDecision}</p>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
