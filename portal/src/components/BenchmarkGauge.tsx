// Pure SVG — server-safe, no client deps
// Shows a property's metric value against an industry benchmark range.

interface BenchmarkGaugeProps {
  label: string;
  value: number;
  low: number;        // industry floor
  high: number;       // industry ceiling
  topQuartile?: number | null;
  unit: string;       // "%" | "$" | "Rating" | "Count"
  higherIsBetter?: boolean; // default false (cost metrics lower = better)
}

function fmt(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "Rating") return v.toFixed(1);
  if (unit === "$") return v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;
  return v.toFixed(1);
}

export default function BenchmarkGauge({
  label,
  value,
  low,
  high,
  topQuartile,
  unit,
  higherIsBetter = false,
}: BenchmarkGaugeProps) {
  const allVals = [value, low, high, topQuartile].filter((v): v is number => v != null);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.3 || 1;
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;
  const span = domainMax - domainMin || 1;

  const TX = 20;   // track start x
  const TW = 360;  // track width

  function toX(v: number): number {
    return Math.max(TX, Math.min(TX + TW, TX + ((v - domainMin) / span) * TW));
  }

  const xLow = toX(low);
  const xHigh = toX(high);
  const xVal = toX(value);
  const xTQ = topQuartile != null ? toX(topQuartile) : null;

  let status: "good" | "ok" | "poor";
  if (higherIsBetter) {
    status = value >= high ? "good" : value >= low ? "ok" : "poor";
  } else {
    status = value <= low ? "good" : value <= high ? "ok" : "poor";
  }

  const dotFill   = status === "good" ? "#22c55e" : status === "ok" ? "#f59e0b" : "#ef4444";
  const dotLabel  = status === "good" ? "#16a34a" : status === "ok" ? "#d97706" : "#dc2626";
  const zoneFill  = "#f3f4f6"; // neutral range zone background

  const zoneW = Math.max(0, xHigh - xLow);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: dotLabel }}>
          {fmt(value, unit)}
        </span>
      </div>
      <svg
        viewBox="0 0 400 46"
        width="100%"
        aria-label={`${label}: ${fmt(value, unit)}, benchmark range ${fmt(low, unit)}–${fmt(high, unit)}`}
      >
        {/* Track */}
        <rect x={TX} y="17" width={TW} height="6" rx="3" fill="#f3f4f6" />

        {/* Benchmark zone (low → high) */}
        <rect x={xLow} y="17" width={zoneW} height="6" rx="2" fill={zoneFill} />
        <rect x={xLow} y="17" width={zoneW} height="6" rx="2" fill="none" stroke="#d1d5db" strokeWidth="1" />

        {/* Low / High tick marks */}
        <line x1={xLow} y1="14" x2={xLow} y2="30" stroke="#d1d5db" strokeWidth="1" />
        <line x1={xHigh} y1="14" x2={xHigh} y2="30" stroke="#d1d5db" strokeWidth="1" />

        {/* Top-quartile marker */}
        {xTQ != null && (
          <>
            <line x1={xTQ} y1="13" x2={xTQ} y2="31" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="2,2" />
            <text x={xTQ} y="11" textAnchor="middle" fontSize="9" fill="#9ca3af">★</text>
          </>
        )}

        {/* Property value dot */}
        <circle cx={xVal} cy="20" r="8" fill={dotFill} />
        <circle cx={xVal} cy="20" r="4" fill="white" />

        {/* Range labels */}
        <text x={xLow} y="44" textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(low, unit)}</text>
        <text x={xHigh} y="44" textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(high, unit)}</text>
      </svg>
    </div>
  );
}
