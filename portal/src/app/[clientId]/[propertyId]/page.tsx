import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getProperty, getLatestKpiSummary, getKpiMetrics, getActions, getInitiatives,
  getOpportunities, getRisks, getIntelligence, hasUnpublishedFinancialData,
  getLatestPublishedBrief,
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
import Sparkline from "@/components/Sparkline";
import InitiativeSummaryCard from "@/components/InitiativeSummaryCard";
import type { Action, Opportunity, Risk, Intelligence, Initiative, KpiMetric } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, kpi, allMetrics, actions, initiatives, intelligence, latestBrief] = await Promise.all([
    getProperty(propertyId, clientId),
    getLatestKpiSummary(propertyId),
    getKpiMetrics(propertyId),
    getActions(propertyId),
    getInitiatives(propertyId),
    getIntelligence(propertyId),
    getLatestPublishedBrief(propertyId, clientId),
  ]);

  if (!property) notFound();

  // Opportunities and Risks are internal-only analytical inputs (they feed
  // Actions and the Brief) and must be scoped to the current Reporting
  // Period — the most recent Published Brief's period — never aggregated
  // across every period ever generated for this property.
  const currentPeriod = latestBrief?.reportingPeriodStart ?? null;
  const [opportunities, risks] = currentPeriod
    ? await Promise.all([
        getOpportunities(propertyId, currentPeriod),
        getRisks(propertyId, currentPeriod),
      ])
    : [[] as Opportunity[], [] as Risk[]];

  const health = deriveHealth(kpi);
  const openActions = (actions as Action[]).filter((a) => a.clientVisible && a.status !== "Complete");

  // Initiatives with at least one Client Visible, still-open Action — the
  // grouped replacement for the old flat Actions list. Initiatives with
  // nothing left for the client to act on are omitted entirely below.
  const initiativesWithOpenWork = (initiatives as Initiative[]).filter((init) =>
    (actions as Action[]).some(
      (a) => init.actionIds.includes(a.id) && a.clientVisible && a.status !== "Complete"
    )
  );
  const annualOpportunity = (opportunities as Opportunity[]).reduce((s, o) => s + o.estimatedAnnualImpact, 0);
  const biggestOpportunity = latestBrief?.biggestOpportunityId
    ? (opportunities as Opportunity[]).find((o) => o.id === latestBrief.biggestOpportunityId) ?? null
    : null;
  const biggestRisk = latestBrief?.biggestRiskId
    ? (risks as Risk[]).find((r) => r.id === latestBrief.biggestRiskId) ?? null
    : null;

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

        {/* Actions needed — grouped by Initiative instead of a flat list */}
        {initiativesWithOpenWork.length > 0 && (
          <section>
            <SectionHeader title="Actions Needed From You" />
            <div>
              {initiativesWithOpenWork.map((initiative) => (
                <InitiativeSummaryCard
                  key={initiative.id}
                  initiative={initiative}
                  actions={(actions as Action[]).filter((a) => initiative.actionIds.includes(a.id))}
                  clientId={clientId}
                  propertyId={propertyId}
                />
              ))}
            </div>
          </section>
        )}

        {/* Biggest opportunity — narrative, sourced from the Brief, not a raw list */}
        {biggestOpportunity && (
          <section>
            <SectionHeader title="Biggest Opportunity" />
            <CalloutBlock>
              <p>{biggestOpportunity.title}</p>
              {biggestOpportunity.estimatedAnnualImpact > 0 && (
                <p style={{ marginTop: 8, fontFamily: SERIF, fontSize: "1.3rem", color: "#12120F" }}>
                  {compact(biggestOpportunity.estimatedAnnualImpact)}/yr estimated impact
                </p>
              )}
            </CalloutBlock>
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

        {/* Biggest risk — narrative, sourced from the Brief, not a raw list */}
        {biggestRisk && (
          <section>
            <SectionHeader title="Biggest Risk" />
            <CalloutBlock>
              <p>{biggestRisk.title}</p>
              {biggestRisk.mitigationPlan && (
                <p style={{ marginTop: 8, opacity: 0.8 }}>{biggestRisk.mitigationPlan}</p>
              )}
            </CalloutBlock>
          </section>
        )}

      </div>
    </PageWrapper>
  );
}
