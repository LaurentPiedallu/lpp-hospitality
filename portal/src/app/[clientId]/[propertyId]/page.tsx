import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getProperty, getLatestKpiSummary, getKpiMetrics, getActions,
  getOpportunities, getRisks, getIntelligence, hasUnpublishedFinancialData,
} from "@/lib/notion-queries";
import { deriveHealth } from "@/lib/health";
import { usd, pct, compact, formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import KpiCard from "@/components/KpiCard";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import StatusBadge from "@/components/StatusBadge";
import Sparkline from "@/components/Sparkline";
import type { Action, Opportunity, Risk, Intelligence, KpiMetric } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

function isUrgentAction(action: Action): boolean {
  return (
    action.status === "Waiting on Client" ||
    action.priority === "Critical" ||
    (action.status === "Not Started" && action.decisionRequired)
  );
}

function actionBadgeVariant(action: Action): "red" | "green" | "amber" {
  if (isUrgentAction(action)) return "red";
  if (action.status === "In Progress") return "amber";
  return "green";
}

// ─── Action flag — per Change 10 spec, used for urgent open actions ──────────

function ActionFlag({ action }: { action: Action }) {
  return (
    <div
      style={{
        background: "rgba(192,57,43,0.04)",
        border: "1px solid rgba(192,57,43,0.12)",
        borderLeft: "3px solid #C0392B",
        borderRadius: 0,
        padding: "16px 20px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#C0392B", flexShrink: 0 }} />
          <span style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C0392B" }}>
            Action Required
          </span>
        </div>
        <StatusBadge label={action.status} variant={actionBadgeVariant(action)} />
      </div>
      <div style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.65)", lineHeight: 1.7, fontWeight: 300 }}>
        <p style={{ color: "#12120F", fontWeight: 400, marginBottom: action.notes ? 4 : 0 }}>{action.title}</p>
        {action.notes && <p>{action.notes}</p>}
        {action.owner && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 4 }}>Owner: {action.owner}</p>}
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "16px 20px", marginBottom: 12 }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p style={{ fontFamily: JOST, fontSize: 13, color: "#12120F" }}>{action.title}</p>
          {action.notes && <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.5)", marginTop: 2 }}>{action.notes}</p>}
          {action.owner && <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>Owner: {action.owner}</p>}
        </div>
        <StatusBadge label={action.status} variant={actionBadgeVariant(action)} />
      </div>
    </div>
  );
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, kpi, allMetrics, actions, opportunities, risks, intelligence] = await Promise.all([
    getProperty(propertyId, clientId),
    getLatestKpiSummary(propertyId),
    getKpiMetrics(propertyId),
    getActions(propertyId),
    getOpportunities(propertyId),
    getRisks(propertyId),
    getIntelligence(propertyId),
  ]);

  if (!property) notFound();

  const health = deriveHealth(kpi);
  const openActions = (actions as Action[]).filter((a) => a.status !== "Complete");
  const activeRisks = (risks as Risk[]).filter((r) => r.status !== "Closed" && r.status !== "Archived");
  const annualOpportunity = (opportunities as Opportunity[]).reduce((s, o) => s + o.estimatedAnnualImpact, 0);

  // Admin-only signal: financial numbers are all missing even though a
  // summary exists — check whether real data is sitting unpublished in Notion.
  const financialFieldsAllNull =
    kpi != null &&
    kpi.revenue == null && kpi.cogsPct == null &&
    kpi.laborPct == null && kpi.netProfitDollars == null;
  const unpublishedFinancialData =
    session.role === "admin" && financialFieldsAllNull
      ? await hasUnpublishedFinancialData(propertyId)
      : false;

  // Build sparkline series from multi-period KPI data
  function trendSeries(cat: string, unit: string, hint?: string): { period: string; value: number }[] {
    const byPeriod = new Map<string, number>();
    (allMetrics as KpiMetric[])
      .filter((m) =>
        m.category === cat &&
        m.unit === unit &&
        m.periodStart != null &&
        (hint ? m.metricName.toLowerCase().includes(hint) : true)
      )
      .forEach((m) => {
        if (!byPeriod.has(m.periodStart!)) byPeriod.set(m.periodStart!, m.metricValue);
      });
    return [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({ period, value }));
  }

  const revenueTrend    = trendSeries("Revenue", "$");
  const laborPctTrend   = trendSeries("Labor", "%");
  const cogsPctTrend    = trendSeries("COGS", "%");
  const profitPctTrend  = trendSeries("Profitability", "%");
  const latestPeriod    = (allMetrics as KpiMetric[])
    .map((m) => m.periodStart).filter(Boolean).sort().reverse()[0] ?? null;

  // Executive summary from Intelligence (most recent, any category)
  const execSummary = (intelligence as Intelligence[]).find(
    (i) => i.currentRead || i.whyItMatters
  );

  return (
    <PageWrapper>
      <NavBar session={session} />
      <PropertyHeader property={property} kpi={kpi} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="overview" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        {/* At a glance */}
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Overall Health" value={health.status} variant={health.color === "green" ? "green" : health.color === "amber" ? "amber" : "red"} />
            <KpiCard label="Annual Opportunity" value={annualOpportunity > 0 ? compact(annualOpportunity) : "—"} variant="neutral" />
            <KpiCard label="Actions Needed" value={String(openActions.length)} variant={openActions.length > 0 ? "red" : "green"} />
            <KpiCard
              label="Data Confidence"
              value={property.dataConfidence}
              variant={property.dataConfidence === "High" ? "green" : property.dataConfidence === "Low" ? "red" : "amber"}
            />
          </div>
        </section>

        {/* Executive summary */}
        {execSummary && (
          <section>
            <SectionHeader title="Executive Summary" />
            <CalloutBlock>
              {execSummary.currentRead}
              {execSummary.whyItMatters && (
                <p className="mt-2 opacity-80">{execSummary.whyItMatters}</p>
              )}
            </CalloutBlock>
          </section>
        )}

        {/* Actions needed */}
        {openActions.length > 0 && (
          <section>
            <SectionHeader title="Actions Needed From You" />
            <div>
              {openActions.map((action) =>
                isUrgentAction(action)
                  ? <ActionFlag key={action.id} action={action} />
                  : <ActionCard key={action.id} action={action} />
              )}
            </div>
          </section>
        )}

        {/* Value creation */}
        {(opportunities as Opportunity[]).length > 0 && (
          <section>
            <SectionHeader title="Value Creation" />
            <div>
              {(opportunities as Opportunity[]).map((opp) => (
                <div key={opp.id} style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "16px 20px", marginBottom: 12 }}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p style={{ fontFamily: JOST, fontSize: 13, color: "#12120F" }}>{opp.title}</p>
                      {opp.category && <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 2 }}>{opp.category}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {opp.estimatedAnnualImpact > 0 && (
                        <span style={{ fontFamily: SERIF, fontSize: "1.1rem", color: "#12120F" }}>{compact(opp.estimatedAnnualImpact)}/yr</span>
                      )}
                      <StatusBadge
                        label={opp.stage || "Identified"}
                        variant={opp.stage === "Implemented" || opp.stage === "Measured" ? "green" : opp.stage === "In Progress" ? "blue" : "amber"}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Financial snapshot */}
        {kpi && (
          <section>
            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <SectionHeader title="Financial Snapshot" />
              {latestPeriod && (
                <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>{formatPeriod(latestPeriod)}</span>
              )}
            </div>
            {unpublishedFinancialData && (
              <div style={{ marginBottom: 16, padding: "10px 16px", background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.15)", fontFamily: JOST, fontSize: 13, color: "#C0392B" }}>
                Admin only: financial data exists in Notion for this property but isn&apos;t Published — it won&apos;t appear until published.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Revenue */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Revenue</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, color: "#12120F", lineHeight: 1 }}>
                  {kpi.revenue != null ? compact(kpi.revenue) : "—"}
                </p>
                {kpi.covers != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{kpi.covers.toLocaleString()} covers</p>}
                {revenueTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={revenueTrend.map((d) => d.value)} color="#B8935A" />
                  </div>
                )}
              </div>

              {/* Labor */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Labor</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.laborPct == null ? "#12120F" : kpi.laborPct <= 42 ? "#12120F" : "#C0392B" }}>
                  {kpi.laborPct != null ? pct(kpi.laborPct) : "—"}
                </p>
                {kpi.laborDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.laborDollars)}</p>}
                {laborPctTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={laborPctTrend.map((d) => d.value)} color="#B8935A" />
                  </div>
                )}
              </div>

              {/* COGS */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Food COGS</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.cogsPct == null ? "#12120F" : kpi.cogsPct <= 34 ? "#12120F" : "#C0392B" }}>
                  {kpi.cogsPct != null ? pct(kpi.cogsPct) : "—"}
                </p>
                {kpi.cogsDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.cogsDollars)}</p>}
                {cogsPctTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={cogsPctTrend.map((d) => d.value)} color="#B8935A" />
                  </div>
                )}
              </div>

              {/* Net profit */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Net Profit</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.netProfitPct == null ? "#12120F" : kpi.netProfitPct >= 6 ? "#12120F" : "#C0392B" }}>
                  {kpi.netProfitPct != null ? pct(kpi.netProfitPct) : "—"}
                </p>
                {kpi.netProfitDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.netProfitDollars)}</p>}
                {profitPctTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={profitPctTrend.map((d) => d.value)} color="#B8935A" />
                  </div>
                )}
              </div>
            </div>

            {/* Deep-dive link */}
            <div className="text-right" style={{ marginTop: 12 }}>
              <Link
                href={`/${clientId}/${propertyId}/financial`}
                className="hover:text-[#D4AF7A]"
                style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#B8935A", textDecoration: "none", transition: "color 0.25s ease" }}
              >
                Full financial review →
              </Link>
            </div>
          </section>
        )}

        {/* Guest experience */}
        {kpi && (kpi.guestOverall || kpi.guestFood || kpi.guestService || kpi.guestAmbiance) && (
          <section>
            <SectionHeader title="Guest Experience" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Overall",  value: kpi.guestOverall },
                { label: "Food",     value: kpi.guestFood },
                { label: "Service",  value: kpi.guestService },
                { label: "Ambiance", value: kpi.guestAmbiance },
              ].filter(({ value }) => value != null).map(({ label, value }) => (
                <div key={label} style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                  <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: value! >= 80 ? "#12120F" : "#C0392B" }}>
                    {value!.toFixed(1)}<span style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.3)", fontWeight: 300 }}> / 100</span>
                  </p>
                  <div style={{ height: 3, background: "rgba(18,18,15,0.08)", overflow: "hidden", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${Math.min(100, value!)}%`, background: value! >= 80 ? "#B8935A" : "#C0392B" }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active risks */}
        {activeRisks.length > 0 && (
          <section>
            <SectionHeader title="Active Risks" />
            <div>
              {activeRisks.map((risk) => {
                const urgent = risk.status === "Open" || risk.status === "Escalated";
                return (
                  <div
                    key={risk.id}
                    style={{
                      background: urgent ? "rgba(192,57,43,0.04)" : "#FFFFFF",
                      border: urgent ? "1px solid rgba(192,57,43,0.12)" : "1px solid rgba(18,18,15,0.08)",
                      borderLeft: urgent ? "3px solid #C0392B" : "1px solid rgba(18,18,15,0.08)",
                      borderRadius: 0,
                      padding: "16px 20px",
                      marginBottom: 12,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p style={{ fontFamily: JOST, fontSize: 13, color: "#12120F" }}>{risk.title}</p>
                      <StatusBadge label={risk.status} variant={urgent ? "red" : "amber"} />
                    </div>
                    {risk.mitigationPlan && <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.5)", marginTop: 4 }}>{risk.mitigationPlan}</p>}
                    {risk.category && <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>{risk.category} · {risk.impact} impact</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </PageWrapper>
  );
}
