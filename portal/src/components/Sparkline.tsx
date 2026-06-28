// Pure SVG sparkline — no client JS, no Recharts dependency.
// Renders server-side inside server components.

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export default function Sparkline({
  data,
  color = "#2563eb",
  width = 100,
  height = 28,
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (width - pad * 2));
  const ys = data.map((v) => pad + ((max - v) / range) * (height - pad * 2));

  const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(" ");

  // Fill area under the line
  const areaPoints = [
    `${xs[0]},${height - pad}`,
    ...xs.map((x, i) => `${x},${ys[i]}`),
    `${xs[xs.length - 1]},${height - pad}`,
  ].join(" ");

  const fillColor = color + "18"; // ~10% opacity

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={areaPoints} fill={fillColor} />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r="2"
        fill={color}
      />
    </svg>
  );
}
