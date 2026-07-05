import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getClient, getProperties, getLatestKpiSummary, getActions } from "@/lib/notion-queries";
import { deriveHealth } from "@/lib/health";
import { compact, pct } from "@/lib/format";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import EmptyPropertiesState from "@/components/EmptyPropertiesState";

// ─── Health badge ─────────────────────────────────────────────────────────────

const HEALTH_STYLES = {
  green: { color: "#2A6B3A", border: "rgba(42,107,58,.25)",  bg: "rgba(42,107,58,.06)",  dot: "#2A6B3A" },
  amber: { color: "#A07C2A", border: "rgba(194,160,100,.35)",bg: "rgba(194,160,100,.08)",dot: "#C2A064" },
  red:   { color: "#C0392B", border: "rgba(192,57,43,.25)",  bg: "rgba(192,57,43,.05)",  dot: "#C0392B" },
};
const HEALTH_LABELS = { green: "On Track", amber: "Monitor", red: "Action Required" };

function HealthBadge({ color }: { color: "green" | "amber" | "red" }) {
  const s = HEALTH_STYLES[color];
  return (
    <div
      className="flex items-center gap-2 shrink-0"
      style={{ padding: "7px 14px", border: `1px solid ${s.border}`, background: s.bg, fontSize: "11px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: s.color }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0, display: "inline-block" }} />
      {HEALTH_LABELS[color]}
    </div>
  );
}

// ─── KPI cell ─────────────────────────────────────────────────────────────────

function KpiCell({ label, primary, sub, warn, noBorder }: { label: string; primary: string; sub?: string | null; warn?: boolean; noBorder?: boolean }) {
  return (
    <div style={{ padding: "0 24px", borderRight: noBorder ? "none" : "1px solid rgba(23,20,18,.08)", flex: 1 }}>
      <p style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#9B9489", marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500, fontSize: "38px", lineHeight: 1, letterSpacing: "-.02em", color: warn ? "#A07C2A" : "var(--ink)" }}>
        {primary}
      </p>
      {sub && <p style={{ fontSize: "12px", color: "#9B9489", marginTop: 5 }}>{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [client, properties] = await Promise.all([
    getClient(clientId),
    getProperties(clientId),
  ]);

  if (!client) notFound();

  const cards = await Promise.all(
    properties.map(async (property) => {
      const [kpi, actions] = await Promise.all([
        getLatestKpiSummary(property.id),
        getActions(property.id),
      ]);
      const health = deriveHealth(kpi);
      const openActionsList = actions.filter((a) => a.status !== "Complete");
      return {
        property,
        kpi,
        health,
        actionRequired: openActionsList.length > 0,
        firstActionDescription: openActionsList[0]?.notes || openActionsList[0]?.title || null,
      };
    })
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--paper)" }}>
      <NavBar session={session} />

      {/* Sub-header */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(23,20,18,.08)" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "20px clamp(16px, 4vw, 40px)" }}>
          <div className="flex items-center gap-2 mb-3" style={{ fontSize: "11px", color: "var(--stone)", fontWeight: 600 }}>
            <Link href="/dashboard" style={{ color: "var(--stone)", textDecoration: "none" }}>Portfolio</Link>
            <span style={{ color: "rgba(23,20,18,.25)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>{client.name}</span>
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 500,
              fontSize: "32px",
              letterSpacing: "-.02em",
              color: "var(--ink)",
            }}
          >
            {client.name}
          </h1>
          <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: 4 }}>
            {cards.length} propert{cards.length !== 1 ? "ies" : "y"}
          </p>
        </div>
      </div>

      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "40px clamp(16px, 4vw, 40px)" }}>
        {cards.length === 0 ? (
          <EmptyPropertiesState />
        ) : (
          <div className="flex flex-col gap-5">
            {cards.map(({ property, kpi, health, actionRequired, firstActionDescription }) => {
              const cogsPrimary = kpi?.cogsPct != null ? pct(kpi.cogsPct) : "—";
              const cogsSub     = kpi?.cogsDollars != null ? compact(kpi.cogsDollars) : null;
              const cogsWarn    = kpi?.cogsPct != null && kpi.cogsPct > 35;
              const laborPrimary = kpi?.laborPct != null ? pct(kpi.laborPct) : "—";
              const laborSub     = kpi?.laborDollars != null ? compact(kpi.laborDollars) : null;
              const laborWarn    = kpi?.laborPct != null && kpi.laborPct > 40;
              const netPrimary = kpi?.netProfitDollars != null ? compact(kpi.netProfitDollars) : "—";
              const netSub     = kpi?.netProfitPct != null ? `${kpi.netProfitPct.toFixed(1)}% margin` : null;

              return (
                <Link key={property.id} href={`/${clientId}/${property.id}`} className="block">
                  <div
                    style={{ background: "#fff", border: "1px solid rgba(23,20,18,.10)" }}
                    className="hover:shadow-md hover:border-[rgba(194,160,100,0.45)] transition-colors"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between" style={{ padding: "28px 32px 22px", borderBottom: "1px solid rgba(23,20,18,.07)" }}>
                      <div>
                        <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".10em", textTransform: "uppercase", color: "#9B9489", marginBottom: 6 }}>
                          {property.location || property.conceptType}
                        </p>
                        <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: "36px", letterSpacing: "-.025em", lineHeight: 1, color: "var(--ink)" }}>
                          {property.name}
                        </h3>
                        {property.conceptType && property.location && (
                          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: 6 }}>{property.conceptType}</p>
                        )}
                      </div>
                      <HealthBadge color={health.color} />
                    </div>

                    {/* KPI strip */}
                    {kpi ? (
                      <div className="flex" style={{ padding: "26px 8px 26px 32px", borderBottom: "1px solid rgba(23,20,18,.07)" }}>
                        <KpiCell label="Revenue" primary={kpi.revenue != null ? compact(kpi.revenue) : "—"} sub={kpi.covers != null ? `${kpi.covers.toLocaleString()} covers` : undefined} />
                        <KpiCell label="COGS" primary={cogsPrimary} sub={cogsSub} warn={cogsWarn} />
                        <KpiCell label="Payroll" primary={laborPrimary} sub={laborSub} warn={laborWarn} />
                        <KpiCell label="Net Profit" primary={netPrimary} sub={netSub} noBorder />
                      </div>
                    ) : (
                      <div style={{ padding: "36px 32px", textAlign: "center", background: "rgba(23,20,18,.02)", borderBottom: "1px solid rgba(23,20,18,.07)" }}>
                        <p style={{ fontSize: "13px", color: "var(--stone)", fontStyle: "italic" }}>No KPI data published for this period.</p>
                      </div>
                    )}

                    {/* Action flag summary */}
                    {actionRequired && (
                      <div
                        style={{
                          margin: "14px 32px 0",
                          background: "rgba(192,57,43,0.05)",
                          border: ".5px solid rgba(192,57,43,0.15)",
                          borderRadius: 4,
                          padding: "10px 14px",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#C0392B", flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: "#C0392B" }}>
                            Action flagged
                          </span>
                        </div>
                        {firstActionDescription && (
                          <p style={{ fontSize: "11px", color: "rgba(18,18,15,0.55)", lineHeight: 1.6, marginTop: 6 }}>
                            {firstActionDescription}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between" style={{ padding: "14px 32px", background: "#FAFAF8" }}>
                      <StatusBadge
                        label={property.dataConfidence}
                        variant={property.dataConfidence === "High" ? "green" : property.dataConfidence === "Low" ? "red" : "amber"}
                      />
                      <span style={{ fontSize: "11px", color: "var(--stone)", fontWeight: 600 }}>View details →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
