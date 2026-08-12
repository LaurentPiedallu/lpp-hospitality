"use client";

// Menu Engineering working table — the view someone actually uses to decide
// what to reprice, cut, or feature. Sortable by any column, filterable by
// Category and Quadrant. Client-side: the full item set for one batch is
// small (tens of items), so no server round-trip per interaction.

import { useMemo, useState } from "react";
import QuadrantBadge from "./QuadrantBadge";
import { pct } from "@/lib/format";
import { MENU_CATEGORY_ORDER, menuCategoryLabel, type MenuItemPairing } from "@/lib/menu";
import type { MenuItem, MenuQuadrant } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";

const QUADRANT_ORDER: MenuQuadrant[] = ["Star", "Plowhorse", "Puzzle", "Dog", "Pending"];

type SortKey = "itemName" | "category" | "portionsSold" | "price" | "foodCost" | "marginPct" | "quadrant";
type SortDir = "asc" | "desc";

function money(v: number): string {
  return `$${v.toFixed(2)}`;
}

function sortValue(item: MenuItem, key: SortKey): string | number {
  switch (key) {
    case "itemName": return item.itemName.toLowerCase();
    case "category": return item.category;
    case "portionsSold": return item.portionsSold;
    case "price": return item.price;
    case "foodCost": return item.foodCost;
    case "marginPct": return item.marginPct ?? -Infinity;
    case "quadrant": return item.quadrant;
  }
}

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "itemName", label: "Item", align: "left" },
  { key: "category", label: "Category", align: "left" },
  { key: "portionsSold", label: "Portions Sold", align: "right" },
  { key: "price", label: "Price", align: "right" },
  { key: "foodCost", label: "Food Cost", align: "right" },
  { key: "marginPct", label: "Margin %", align: "right" },
  { key: "quadrant", label: "Quadrant", align: "left" },
];

export default function MenuItemsTable({
  items,
  hideCategoryFilter,
  pairings,
}: {
  items: MenuItem[];
  // Menu Engineering rebuild (Phase 1) — per-category sections already pass
  // a category-scoped item list, so a Category dropdown offering only that
  // one option is redundant. Optional so the flat, all-categories caller
  // (if one exists elsewhere) is unaffected.
  hideCategoryFilter?: boolean;
  // À la carte <-> Market Menu cross-reference (Phase 3) — keyed by item id,
  // computed once for the whole batch (src/lib/menu.ts computeItemPairings)
  // and passed down, not recomputed per category table.
  pairings?: Map<string, MenuItemPairing>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("itemName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [quadrantFilter, setQuadrantFilter] = useState<string>("All");

  const categoriesPresent = useMemo(
    () => MENU_CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c)),
    [items]
  );
  const quadrantsPresent = useMemo(
    () => QUADRANT_ORDER.filter((q) => items.some((i) => i.quadrant === q)),
    [items]
  );

  const filtered = items.filter(
    (i) => (categoryFilter === "All" || i.category === categoryFilter) &&
           (quadrantFilter === "All" || i.quadrant === quadrantFilter)
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "itemName" || key === "category" || key === "quadrant" ? "asc" : "desc");
    }
  }

  const selectStyle: React.CSSProperties = {
    fontFamily: JOST,
    fontSize: 12,
    color: "#12120F",
    background: "#FFFFFF",
    border: "1px solid rgba(18,18,15,0.15)",
    borderRadius: 0,
    padding: "6px 10px",
    cursor: "pointer",
  };

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)" }}>
      <div className="flex flex-wrap items-center" style={{ gap: 12, padding: "16px 20px", borderBottom: "1px solid rgba(18,18,15,0.06)" }}>
        {!hideCategoryFilter && (
          <label style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.45)", display: "flex", alignItems: "center", gap: 8 }}>
            Category
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={selectStyle}>
              <option value="All">All ({items.length})</option>
              {categoriesPresent.map((c) => (
                <option key={c} value={c}>{menuCategoryLabel(c)} ({items.filter((i) => i.category === c).length})</option>
              ))}
            </select>
          </label>
        )}
        <label style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.45)", display: "flex", alignItems: "center", gap: 8 }}>
          Quadrant
          <select value={quadrantFilter} onChange={(e) => setQuadrantFilter(e.target.value)} style={selectStyle}>
            <option value="All">All</option>
            {quadrantsPresent.map((q) => (
              <option key={q} value={q}>{q} ({items.filter((i) => i.quadrant === q).length})</option>
            ))}
          </select>
        </label>
        {(categoryFilter !== "All" || quadrantFilter !== "All") && (
          <button
            onClick={() => { setCategoryFilter("All"); setQuadrantFilter("All"); }}
            style={{ fontFamily: JOST, fontSize: 11, color: "#B8935A", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginLeft: "auto" }}>
          {sorted.length} of {items.length} items
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontFamily: JOST, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(18,18,15,0.06)" }}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  style={{
                    textAlign: col.align,
                    padding: "10px 20px",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: sortKey === col.key ? "#B8935A" : "rgba(18,18,15,0.4)",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}{sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const pairing = pairings?.get(item.id);
              return (
              <tr key={item.id} style={{ borderBottom: "1px solid rgba(18,18,15,0.04)" }}>
                <td style={{ padding: "10px 20px", color: "#12120F" }}>
                  {item.itemName}
                  {/* À la carte <-> Market Menu cross-reference (Phase 3) —
                      a lightweight inline note, not a separate component;
                      surfaces whether the Market Menu version of a dish is
                      cannibalizing full-margin à la carte covers or vice
                      versa. */}
                  {pairing && (
                    <p style={{ fontFamily: JOST, fontSize: 10, color: "rgba(184,147,90,0.9)", marginTop: 2 }}>
                      {pairing.isMarketMenu ? "Also à la carte" : "Also on Market Menu"}: {money(pairing.pairedItem.price)}
                      {pairing.pairedItem.marginPct != null ? ` · ${pct(pairing.pairedItem.marginPct)} margin` : ""}
                    </p>
                  )}
                </td>
                <td style={{ padding: "10px 20px", color: "rgba(18,18,15,0.6)" }}>{menuCategoryLabel(item.category)}</td>
                <td style={{ padding: "10px 20px", textAlign: "right", color: "rgba(18,18,15,0.6)", fontVariantNumeric: "tabular-nums" }}>
                  {item.portionsSold.toLocaleString()}
                </td>
                <td style={{ padding: "10px 20px", textAlign: "right", color: "rgba(18,18,15,0.6)", fontVariantNumeric: "tabular-nums" }}>
                  {money(item.price)}
                </td>
                <td style={{ padding: "10px 20px", textAlign: "right", color: "rgba(18,18,15,0.6)", fontVariantNumeric: "tabular-nums" }}>
                  {money(item.foodCost)}
                </td>
                <td style={{ padding: "10px 20px", textAlign: "right", fontWeight: 500, color: "#12120F", fontVariantNumeric: "tabular-nums" }}>
                  {item.marginPct != null ? pct(item.marginPct) : "—"}
                </td>
                <td style={{ padding: "10px 20px" }}>
                  <QuadrantBadge quadrant={item.quadrant} />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.4)", textAlign: "center", padding: "32px 0" }}>
            No items match these filters.
          </p>
        )}
      </div>
    </div>
  );
}
