// Category food cost % vs. Financial Review's real blended COGS figure
// (Menu Engineering rebuild, Phase 4 item 1). Financial Review shows one
// blended number (e.g. 23.7%, "Healthy" against benchmark) — this can mask
// a structurally weak category underneath a healthy-looking average. Built
// from the same per-category avgFoodCostPct the subtotal rows above use
// (src/lib/menu.ts), compared against the real cogs_pct KPI Record for
// this property/period passed in from the page, not a hardcoded value.

import Link from "next/link";
import { pct } from "@/lib/format";
import { computeCategorySubtotal, menuCategoryLabel } from "@/lib/menu";
import type { MenuItem } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const GOLD = "#B8935A";

// A category running this many points hotter than the blended figure is
// flagged as meaningfully worse, not just noisy variation — Market Menu's
// real +11.1pt gap in the live data clears this by a wide margin; every
// other category sits within ~4pts either side.
const FLAG_THRESHOLD_PTS = 5;

export default function MenuCogsComparison({
  itemsByCategory,
  blendedCogsPct,
  clientId,
  propertyId,
}: {
  itemsByCategory: { category: string; items: MenuItem[] }[];
  blendedCogsPct: number | null;
  clientId: string;
  propertyId: string;
}) {
  if (blendedCogsPct == null) return null;

  const rows = itemsByCategory
    .map(({ category, items }) => ({ category, subtotal: computeCategorySubtotal(category, items) }))
    .filter((r) => r.subtotal.avgFoodCostPct != null);
  if (rows.length === 0) return null;

  const flagged = rows.filter((r) => r.subtotal.avgFoodCostPct! - blendedCogsPct >= FLAG_THRESHOLD_PTS);

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", padding: "24px 28px" }} className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }}>
          Category Food Cost vs. Blended COGS
        </p>
        <Link
          href={`/${clientId}/${propertyId}/financial?metric=cogs_pct`}
          className="hover:text-[#D4AF7A]"
          style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, textDecoration: "none" }}
        >
          See Financial Review →
        </Link>
      </div>

      <div className="flex flex-wrap" style={{ gap: 20 }}>
        {rows.map(({ category, subtotal }) => {
          const isFlagged = flagged.some((f) => f.category === category);
          return (
            <div key={category} style={{ minWidth: 110 }}>
              <p style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.4)", marginBottom: 4 }}>
                {menuCategoryLabel(category)}
              </p>
              <p style={{ fontFamily: JOST, fontSize: 18, fontWeight: 500, color: isFlagged ? "#C0392B" : "#12120F" }}>
                {pct(subtotal.avgFoodCostPct!)}
              </p>
            </div>
          );
        })}
        <div style={{ minWidth: 110, borderLeft: "1px solid rgba(18,18,15,0.08)", paddingLeft: 20 }}>
          <p style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.4)", marginBottom: 4 }}>
            Blended (Financial Review)
          </p>
          <p style={{ fontFamily: JOST, fontSize: 18, fontWeight: 500, color: "#12120F" }}>{pct(blendedCogsPct)}</p>
        </div>
      </div>

      {flagged.length > 0 && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(192,57,43,0.9)", lineHeight: 1.6 }}>
          {flagged.map((f) => menuCategoryLabel(f.category)).join(" and ")} run{flagged.length === 1 ? "s" : ""} meaningfully hotter than the blended COGS figure, and the healthy blended number may be masking a structurally weaker {flagged.length === 1 ? "category" : "categories"} underneath.
        </p>
      )}
    </div>
  );
}
