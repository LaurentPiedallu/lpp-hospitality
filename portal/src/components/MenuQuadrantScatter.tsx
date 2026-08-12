"use client";

// Menu Engineering quadrant scatter — the "menu shape" gut-check above the
// working table. X = Popularity Index, Y = Margin Pct, point size = Revenue.
//
// Reference lines sit at Popularity Index = 70 and Margin Pct = the batch's
// own Average Margin Pct rollup, not a generic 50/50 split — those are the
// exact thresholds the Quadrant formula itself uses (see Menu Items'
// "Quadrant" formula in Notion), so every point's color always lands in the
// region its own label predicts. Corner labels follow from that formula
// (Star: high pop + high margin; Plowhorse: high pop + LOW margin; Puzzle:
// LOW pop + high margin; Dog: low both) rather than a fixed textual
// top-left/bottom-right assumption.
//
// Pending items (not enough batch data yet) are excluded from the plot
// entirely per spec — they'd have no honest position — and only appear in
// the table below.

import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { QUADRANT_HEX } from "./QuadrantBadge";
import type { MenuItem, MenuQuadrant } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";

// Fixed order — never reassigned when the visible set changes (e.g. category filter).
const QUADRANT_ORDER: Exclude<MenuQuadrant, "Pending">[] = ["Star", "Plowhorse", "Puzzle", "Dog"];

interface ScatterPoint {
  x: number; // Popularity Index
  y: number; // Margin Pct
  z: number; // Revenue (bubble size)
  name: string;
  category: string;
  portionsSold: number;
  price: number;
  quadrant: MenuQuadrant;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(18,18,15,0.12)",
        borderRadius: 0,
        padding: "10px 14px",
        fontFamily: JOST,
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(18,18,15,0.08)",
      }}
    >
      <p style={{ fontWeight: 500, color: "#12120F", marginBottom: 2 }}>{p.name}</p>
      <p style={{ color: "rgba(18,18,15,0.45)", fontSize: 11, marginBottom: 6 }}>
        {p.category} · <span style={{ color: QUADRANT_HEX[p.quadrant as Exclude<MenuQuadrant, "Pending">] ?? "rgba(18,18,15,0.4)" }}>{p.quadrant}</span>
      </p>
      <p style={{ color: "rgba(18,18,15,0.65)" }}>Margin: <strong style={{ color: "#12120F" }}>{p.y.toFixed(1)}%</strong></p>
      <p style={{ color: "rgba(18,18,15,0.65)" }}>Popularity: <strong style={{ color: "#12120F" }}>{p.x.toFixed(1)}%</strong></p>
      <p style={{ color: "rgba(18,18,15,0.65)" }}>Revenue: <strong style={{ color: "#12120F" }}>${p.z.toLocaleString()}</strong></p>
      <p style={{ color: "rgba(18,18,15,0.65)" }}>Portions sold: <strong style={{ color: "#12120F" }}>{p.portionsSold.toLocaleString()}</strong> at ${p.price.toFixed(2)}</p>
    </div>
  );
}

function renderLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center" style={{ gap: 20, marginTop: 4 }}>
      {QUADRANT_ORDER.map((q) => (
        <div key={q} className="flex items-center" style={{ gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: QUADRANT_HEX[q], flexShrink: 0 }} />
          <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.65)" }}>{q}</span>
        </div>
      ))}
    </div>
  );
}

export default function MenuQuadrantScatter({
  items,
  avgMarginPct,
}: {
  items: MenuItem[];
  avgMarginPct: number | null;
}) {
  const plottable = items.filter(
    (i): i is MenuItem & { popularityIndex: number; marginPct: number; revenue: number } =>
      i.quadrant !== "Pending" && i.popularityIndex != null && i.marginPct != null && i.revenue != null
  );
  const pendingCount = items.length - plottable.length;

  if (plottable.length === 0) {
    return (
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", padding: "40px 20px", textAlign: "center" }}>
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.4)" }}>
          Not enough data yet to plot menu shape — check back once this batch has more items published.
        </p>
      </div>
    );
  }

  const seriesByQuadrant = QUADRANT_ORDER.map((q) => ({
    quadrant: q,
    color: QUADRANT_HEX[q],
    points: plottable
      .filter((i) => i.quadrant === q)
      .map<ScatterPoint>((i) => ({
        x: i.popularityIndex,
        y: i.marginPct,
        z: i.revenue,
        name: i.itemName,
        category: i.category,
        portionsSold: i.portionsSold,
        price: i.price,
        quadrant: i.quadrant,
      })),
  }));

  const xVals = plottable.map((i) => i.popularityIndex);
  const yVals = plottable.map((i) => i.marginPct);
  const xMax = Math.max(70, ...xVals) * 1.1;
  const yMax = Math.max(...yVals) * 1.15;
  const yMin = Math.min(0, ...yVals);
  const marginSplit = avgMarginPct ?? (yVals.reduce((s, v) => s + v, 0) / yVals.length);

  // Corner labels — positioned from the real formula (Star: high popularity +
  // high margin; Plowhorse: high popularity + LOW margin; Puzzle: LOW
  // popularity + high margin; Dog: low both), not a fixed textual
  // assumption. Approximate placement inside the plot area; a gut-check
  // overlay, not a pixel-aligned axis element.
  const CORNER_LABELS: { quadrant: Exclude<MenuQuadrant, "Pending">; style: React.CSSProperties }[] = [
    { quadrant: "Puzzle", style: { top: 30, left: 66 } },
    { quadrant: "Star", style: { top: 30, right: 40 } },
    { quadrant: "Dog", style: { bottom: 46, left: 66 } },
    { quadrant: "Plowhorse", style: { bottom: 46, right: 40 } },
  ];

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", padding: "24px 20px 8px", position: "relative" }}>
      {CORNER_LABELS.map(({ quadrant, style }) => (
        <span
          key={quadrant}
          style={{
            position: "absolute",
            fontFamily: JOST,
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: QUADRANT_HEX[quadrant],
            opacity: 0.45,
            pointerEvents: "none",
            zIndex: 1,
            ...style,
          }}
        >
          {quadrant}
        </span>
      ))}
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="0" stroke="#f1efec" />
          <XAxis
            type="number" dataKey="x" name="Popularity Index" unit="%"
            domain={[0, xMax]}
            // Rounded tick labels (Menu Engineering rebuild, Phase 0 item 1) —
            // Recharts' default tick generation places a tick at the exact
            // domain bound (xMax/yMax, computed as a real item's value * a
            // multiplier) and renders it with full float precision unless
            // formatted. Confirmed directly against the live chart this was
            // the entire source of the "corrupted" 500.4460303300624% /
            // 110.0461538461542% axis labels — not a data bug, every real
            // Popularity Index value is legitimate (see MenuQuadrantScatter
            // callers). tickFormatter rounds for display only.
            tickFormatter={(v: number) => `${Math.round(v)}`}
            tick={{ fontSize: 11, fill: "rgba(18,18,15,0.4)", fontFamily: JOST }}
            axisLine={{ stroke: "rgba(18,18,15,0.12)" }} tickLine={false}
            label={{ value: "Popularity Index →", position: "insideBottom", offset: -5, fontSize: 11, fill: "rgba(18,18,15,0.4)", fontFamily: JOST }}
          />
          <YAxis
            type="number" dataKey="y" name="Margin Pct" unit="%"
            domain={[yMin, yMax]}
            tickFormatter={(v: number) => `${Math.round(v)}`}
            tick={{ fontSize: 11, fill: "rgba(18,18,15,0.4)", fontFamily: JOST }}
            axisLine={{ stroke: "rgba(18,18,15,0.12)" }} tickLine={false}
            label={{ value: "Margin % →", angle: -90, position: "insideLeft", fontSize: 11, fill: "rgba(18,18,15,0.4)", fontFamily: JOST }}
          />
          <ZAxis type="number" dataKey="z" range={[60, 700]} name="Revenue" unit="$" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<CustomTooltip />} />
          <Legend content={renderLegend} />

          <ReferenceLine x={70} stroke="rgba(18,18,15,0.2)" strokeDasharray="4 4"
            label={{ value: "70", position: "top", fontSize: 10, fill: "rgba(18,18,15,0.35)", fontFamily: JOST }} />
          <ReferenceLine y={marginSplit} stroke="rgba(18,18,15,0.2)" strokeDasharray="4 4"
            label={{ value: `avg ${marginSplit.toFixed(0)}%`, position: "right", fontSize: 10, fill: "rgba(18,18,15,0.35)", fontFamily: JOST }} />

          {seriesByQuadrant.map((s) => (
            <Scatter key={s.quadrant} name={s.quadrant} data={s.points} fill={s.color} fillOpacity={0.75} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      {pendingCount > 0 && (
        <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", textAlign: "center", padding: "0 0 14px" }}>
          {pendingCount} item{pendingCount === 1 ? "" : "s"} pending — not enough data to plot, shown in the table below.
        </p>
      )}
    </div>
  );
}
