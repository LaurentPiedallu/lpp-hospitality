import Link from "next/link";
import type { Property, KpiSummary } from "@/types/portal";
import { compact, pct } from "@/lib/format";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const RED = "#C0392B";

function StripKpi({ label, value, sub, negative }: { label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <div style={{ background: "rgba(242,237,228,0.03)", padding: "20px 24px" }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.35)", marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 300, color: negative ? RED : "rgba(242,237,228,0.9)", lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, color: "rgba(242,237,228,0.3)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

export default function PropertyHeader({
  property,
  kpi,
}: {
  property: Property;
  kpi: KpiSummary | null;
}) {
  return (
    <div style={{ background: "#12120F", padding: "48px 60px 40px" }}>
      <Link
        href="/dashboard"
        className="hover:text-[#B8935A]"
        style={{
          fontFamily: JOST,
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(184,147,90,0.5)",
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 28,
          transition: "color 0.25s ease",
          width: "fit-content",
        }}
      >
        ← Portfolio
      </Link>

      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(242,237,228,0.3)", marginBottom: 8 }}>
        {property.location || property.conceptType}
      </p>

      <h1 style={{ fontFamily: SERIF, fontSize: "clamp(2.4rem, 4vw, 3.6rem)", fontWeight: 300, color: "rgba(242,237,228,0.92)", lineHeight: 1.05 }}>
        {property.name}
      </h1>

      <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(242,237,228,0.35)", marginTop: 6 }}>
        {property.conceptType}
        {property.conceptType && " · "}
        Data confidence: {property.dataConfidence}
      </p>

      {kpi && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4"
          style={{ gap: 1, marginTop: 36, background: "rgba(242,237,228,0.06)" }}
        >
          <StripKpi
            label="Total Revenue"
            value={kpi.revenue != null ? compact(kpi.revenue) : "—"}
            sub={kpi.covers != null ? `${kpi.covers.toLocaleString()} covers` : undefined}
          />
          <StripKpi
            label="COGS"
            value={kpi.cogsPct != null ? pct(kpi.cogsPct) : "—"}
            sub={kpi.cogsDollars != null ? compact(kpi.cogsDollars) : undefined}
          />
          <StripKpi
            label="Labor"
            value={kpi.laborPct != null ? pct(kpi.laborPct) : "—"}
            sub={kpi.laborDollars != null ? compact(kpi.laborDollars) : undefined}
          />
          <StripKpi
            label="Net Profit"
            value={kpi.netProfitDollars != null ? compact(kpi.netProfitDollars) : "—"}
            sub={kpi.netProfitPct != null ? pct(kpi.netProfitPct) : undefined}
            negative={kpi.netProfitDollars != null && kpi.netProfitDollars < 0}
          />
        </div>
      )}
    </div>
  );
}
