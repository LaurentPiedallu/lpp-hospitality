// Menu Engineering quadrant badge — deliberately more colorful than
// StatusBadge's muted editorial palette (whose "green"/"blue" variants both
// map to the same restrained gold/gray treatment by design). This is a
// working/analytical table meant for fast visual scanning across four
// distinct categories, not a severity indicator, so it needs genuine color
// separation. Pending (not enough data yet) stays neutral gray, matching
// StatusBadge's own "not applicable" treatment.

import type { MenuQuadrant } from "@/types/portal";

// Colors run through scripts/validate_palette.js from the dataviz skill
// (4-slot categorical, light surface #fcfcfb) — passes chroma floor, normal-
// vision separation, and contrast; CVD protan separation lands in the 6-8
// floor band, which is legal only with secondary encoding — satisfied here
// since every rendering of a quadrant always carries its text label too
// (this badge, the table's Quadrant column, and the scatter plot's
// tooltip/legend never rely on color alone).
const STYLES: Record<MenuQuadrant, React.CSSProperties> = {
  Star:      { background: "rgba(30,132,73,0.1)",   color: "#1E8449", border: "1px solid rgba(30,132,73,0.28)" },
  Plowhorse: { background: "rgba(184,134,11,0.12)",  color: "#8A6208", border: "1px solid rgba(184,134,11,0.32)" },
  Puzzle:    { background: "rgba(46,109,164,0.1)",   color: "#2E6DA4", border: "1px solid rgba(46,109,164,0.28)" },
  Dog:       { background: "rgba(192,57,43,0.07)",   color: "#C0392B", border: "1px solid rgba(192,57,43,0.22)" },
  Pending:   { background: "rgba(18,18,15,0.04)",    color: "rgba(18,18,15,0.4)", border: "1px solid rgba(18,18,15,0.1)" },
};

// Fixed hue order for anywhere quadrants are drawn as scatter-point colors —
// never cycled/reassigned when the filtered set changes.
export const QUADRANT_HEX: Record<Exclude<MenuQuadrant, "Pending">, string> = {
  Star: "#1E8449",
  Plowhorse: "#8A6208",
  Puzzle: "#2E6DA4",
  Dog: "#C0392B",
};

export default function QuadrantBadge({ quadrant }: { quadrant: MenuQuadrant }) {
  return (
    <span
      style={{
        fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
        fontSize: 10,
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: 0,
        whiteSpace: "nowrap",
        display: "inline-block",
        ...STYLES[quadrant],
      }}
    >
      {quadrant}
    </span>
  );
}
