// Minimal inline trajectory line next to a headline figure — Portal-Wide
// refinement, cross-cutting item. Deliberately built for exactly what the
// real data supports today: every metric across every property currently
// has at most 2 Published periods (March/June 2026), confirmed directly
// against Notion before building this, so this renders a single line
// segment, not a multi-point curve. Kept visually quiet (muted ink line,
// one gold dot on the current value) rather than color-coded
// favorable/unfavorable — the adjacent TrendDelta arrow already carries
// that signal, and duplicating it here in two-pixels-wide strokes would
// just add visual noise. Works unchanged if a metric later has 3+ periods.
export default function Sparkline({
  values,
  width = 48,
  height = 16,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = 2;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = range === 0 ? height / 2 : height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={path} fill="none" stroke="rgba(18,18,15,0.3)" strokeWidth={1.25} />
      <circle cx={lastX} cy={lastY} r={2} fill="#B8935A" />
    </svg>
  );
}
