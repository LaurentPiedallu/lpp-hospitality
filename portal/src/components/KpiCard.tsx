type Variant = "green" | "amber" | "red" | "neutral";

const VALUE_COLOR: Record<Variant, string> = {
  green: "#12120F",
  amber: "#B8935A",
  red: "#C0392B",
  neutral: "#12120F",
};

export default function KpiCard({
  label,
  value,
  sub,
  variant = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: Variant;
}) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
      <p
        style={{
          fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(18,18,15,0.35)",
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "2.2rem",
          fontWeight: 400,
          color: VALUE_COLOR[variant],
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{sub}</p>}
    </div>
  );
}
