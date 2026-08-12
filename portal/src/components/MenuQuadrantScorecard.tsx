// Category-level quadrant scorecard (Menu Engineering rebuild, Phase 2) —
// the number an owner actually wants first: is a given category
// structurally healthy, not fifty individual rows to manually tally. One
// row per category, one column per quadrant; each cell leads with % of
// revenue (the most decision-relevant of the three) and carries % of
// items / % of portions as smaller supporting text. Built from
// computeQuadrantScorecard (src/lib/menu.ts) — the same MenuItem fields
// the scatter plots and subtotal rows already use, so this can't drift
// out of sync with them via a separate calculation path.

import { QUADRANT_HEX } from "./QuadrantBadge";
import { QUADRANT_ORDER, computeQuadrantScorecard, menuCategoryLabel } from "@/lib/menu";
import type { MenuItem } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";

export default function MenuQuadrantScorecard({
  itemsByCategory,
}: {
  itemsByCategory: { category: string; items: MenuItem[] }[];
}) {
  const rows = itemsByCategory.filter(({ items }) => items.some((i) => i.quadrant !== "Pending"));
  if (rows.length === 0) return null;

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)" }} className="overflow-x-auto">
      <table className="w-full" style={{ fontFamily: JOST, fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(18,18,15,0.06)" }}>
            <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)" }}>
              Category
            </th>
            {QUADRANT_ORDER.map((q) => (
              <th
                key={q}
                style={{ textAlign: "center", padding: "12px 16px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: QUADRANT_HEX[q] }}
              >
                {q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ category, items }) => {
            const cells = computeQuadrantScorecard(items);
            return (
              <tr key={category} style={{ borderBottom: "1px solid rgba(18,18,15,0.04)" }}>
                <td style={{ padding: "14px 20px", color: "#12120F", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {menuCategoryLabel(category)}
                </td>
                {cells.map((cell) => (
                  <td key={cell.quadrant} style={{ padding: "14px 16px", textAlign: "center" }}>
                    <p style={{ color: "#12120F", fontWeight: 500 }}>{Math.round(cell.pctRevenue)}%</p>
                    <p style={{ fontSize: 10, color: "rgba(18,18,15,0.4)", marginTop: 2 }}>
                      {Math.round(cell.pctItems)}% items · {Math.round(cell.pctPortions)}% portions
                    </p>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
