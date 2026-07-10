// Status badge — color communicates meaning, never used decoratively

type Variant = "green" | "amber" | "red" | "gray" | "blue";

const STYLES: Record<Variant, React.CSSProperties> = {
  green: { background: "rgba(18,18,15,0.04)", color: "rgba(18,18,15,0.5)", border: "1px solid rgba(18,18,15,0.1)" },
  gray:  { background: "rgba(18,18,15,0.04)", color: "rgba(18,18,15,0.5)", border: "1px solid rgba(18,18,15,0.1)" },
  amber: { background: "rgba(184,147,90,0.1)", color: "rgba(184,147,90,0.8)", border: "1px solid rgba(184,147,90,0.2)" },
  blue:  { background: "rgba(184,147,90,0.1)", color: "rgba(184,147,90,0.8)", border: "1px solid rgba(184,147,90,0.2)" },
  red:   { background: "rgba(192,57,43,0.06)", color: "#C0392B", border: "1px solid rgba(192,57,43,0.15)" },
};

export default function StatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: Variant;
}) {
  return (
    <span
      style={{
        fontFamily: "'Jost', 'Inter', system-ui, sans-serif",
        fontSize: 10,
        fontWeight: 400,
        padding: "3px 10px",
        borderRadius: 0,
        whiteSpace: "nowrap",
        display: "inline-block",
        ...STYLES[variant],
      }}
    >
      {label}
    </span>
  );
}
