// Benchmark range-position indicator — one visual replacing the Labor
// section's Labor Cost / Labor % / Benchmark Range card trio: a horizontal
// track, the acceptable band shaded inside it, a marker at the actual
// value, and the gap stated in words ("19 points over range" / "within
// range"). Pure server component, div-based (the house bar idiom — see
// InitiativeProgress, DriverBreakdown). Palette per DESIGN.md only:
// grey-tint track, gold band, dark marker when within range and action-red
// when outside it. Borrows BenchmarkGauge's axis-padding idea so the marker
// isn't pinned to an edge when the value sits well outside the band.

import { usd, pct } from "@/lib/format";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

function headerValue(v: number, unit: string): string {
  if (unit === "%") return pct(v);
  if (unit === "$") return usd(v);
  return `${v}`;
}

function endpoint(v: number, unit: string): string {
  if (unit === "%") return `${v}%`;
  if (unit === "$") return usd(v);
  return `${v}`;
}

// "%" gaps read as percentage points, not "%": 59% against a 40% ceiling is
// 19 points, not 19%.
function gap(g: number, unit: string): string {
  const r = Math.round(g);
  if (unit === "%") return `${r} point${r === 1 ? "" : "s"}`;
  if (unit === "$") return usd(g);
  return `${r}`;
}

function niceStep(rangeGuess: number): number {
  if (rangeGuess <= 10) return 1;
  if (rangeGuess <= 50) return 5;
  if (rangeGuess <= 200) return 25;
  const mag = Math.pow(10, Math.floor(Math.log10(rangeGuess)));
  return mag / 2;
}

export default function BenchmarkRangeBar({
  label,
  value,
  low,
  high,
  unit,
  caption,
  target,
}: {
  label: string;
  value: number;
  low: number;
  high: number;
  unit: string;
  caption?: string;
  target?: number | null;
}) {
  // ── Track scale ──────────────────────────────────────────────────────────
  // Data-driven with 15% headroom, then snapped to round endpoints; clamped
  // at 0 (a % or $ metric here can't go negative).
  const pts = [value, low, high, target].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n)
  );
  const rawMin = Math.min(...pts);
  const rawMax = Math.max(...pts);
  const pad = Math.max((rawMax - rawMin) * 0.15, rawMax * 0.08, unit === "%" ? 4 : 1);
  const step = unit === "%" ? 5 : niceStep(rawMax - rawMin + 2 * pad);
  const axisMin = Math.max(0, Math.floor((rawMin - pad) / step) * step);
  const axisMax = Math.ceil((rawMax + pad) / step) * step;
  const span = axisMax - axisMin || 1;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - axisMin) / span) * 100));

  const within = value >= low && value <= high;
  const markerColor = within ? "#12120F" : "#C0392B";
  const gapText = within
    ? "within range"
    : value > high
      ? `${gap(value - high, unit)} over range`
      : `${gap(low - value, unit)} under range`;

  const bandLeft = pos(low);
  const bandWidth = Math.max(0, pos(high) - pos(low));
  const valueLeft = pos(value);
  const targetLeft =
    target != null && Number.isFinite(target) ? pos(target) : null;

  // Keep the value tag on-canvas near the track edges.
  const tagShift =
    valueLeft >= 82 ? "translateX(-100%)" : valueLeft <= 15 ? "translateX(0)" : "translateX(-50%)";

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(18,18,15,0.08)",
        borderRadius: 0,
        padding: "24px 28px",
      }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
        <div>
          <p
            style={{
              fontFamily: JOST,
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(18,18,15,0.35)",
              marginBottom: 8,
            }}
          >
            {label}
          </p>
          <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: markerColor }}>
            {headerValue(value, unit)}
          </p>
        </div>
        {caption && (
          <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)", textAlign: "right", flexShrink: 0 }}>
            {caption}
          </p>
        )}
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 8, background: "rgba(18,18,15,0.06)", marginTop: 30 }}>
        {/* Value tag */}
        <span
          style={{
            position: "absolute",
            top: -18,
            left: `${valueLeft}%`,
            transform: tagShift,
            fontFamily: JOST,
            fontSize: 11,
            fontWeight: 500,
            color: markerColor,
            whiteSpace: "nowrap",
          }}
        >
          {headerValue(value, unit)}
        </span>

        {/* Benchmark band */}
        <div
          style={{
            position: "absolute",
            top: 0,
            height: "100%",
            left: `${bandLeft}%`,
            width: `${bandWidth}%`,
            background: "rgba(184,147,90,0.22)",
            borderLeft: "1px solid rgba(184,147,90,0.5)",
            borderRight: "1px solid rgba(184,147,90,0.5)",
          }}
        />

        {/* Target tick */}
        {targetLeft != null && (
          <div
            style={{
              position: "absolute",
              top: -2,
              height: 12,
              width: 1,
              left: `${targetLeft}%`,
              background: "rgba(18,18,15,0.4)",
              transform: "translateX(-0.5px)",
            }}
          />
        )}

        {/* Value marker */}
        <div
          style={{
            position: "absolute",
            top: -4,
            height: 16,
            width: 2,
            left: `${valueLeft}%`,
            background: markerColor,
            transform: "translateX(-1px)",
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex items-baseline justify-between" style={{ marginTop: 10, gap: 12 }}>
        <span style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.04em", color: "rgba(18,18,15,0.35)" }}>
          range {endpoint(low, unit)}–{endpoint(high, unit)}
          {targetLeft != null ? ` · target ${endpoint(target as number, unit)}` : ""}
        </span>
        <span
          style={{
            fontFamily: JOST,
            fontSize: 12,
            fontWeight: 500,
            color: within ? "rgba(18,18,15,0.55)" : "#C0392B",
          }}
        >
          {gapText}
        </span>
      </div>
    </div>
  );
}
