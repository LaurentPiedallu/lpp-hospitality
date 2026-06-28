import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getProperty, getLatestKpiSummary, getKpiMetrics, getActions,
  getOpportunities, getRisks, getIntelligence,
} from "@/lib/notion-queries";
import { deriveHealth, healthColorClass, healthBgClass } from "@/lib/health";
import { usd, pct, compact, formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import KpiCard from "@/components/KpiCard";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import StatusBadge from "@/components/StatusBadge";
import Sparkline from "@/components/Sparkline";
import type { Action, Opportunity, Risk, Intelligence, KpiMetric } from "@/types/portal";
import type { HealthColor } from "@/lib/health";

const SUB_PAGES = [
  { href: "financial",    icon: "📊", label: "Financial Review",   desc: "Revenue, labor, COGS, profitability" },
  { href: "commercial",   icon: "⭐", label: "Commercial Review",  desc: "Guest experience and revenue quality" },
  { href: "menu",         icon: "🍽️", label: "Menu Engineering",   desc: "Item performance and pricing" },
  { href: "initiatives",  icon: "🚀", label: "Initiatives",        desc: "Now / Next / Later roadmap" },
  { href: "intelligence", icon: "✦",  label: "AI Intelligence",    desc: "Full analysis across all categories" },
  { href: "documents",    icon: "📁", label: "Documents",          desc: "Briefs, reports, and files" },
  { href: "upload",       icon: "📤", label: "Upload Data",        desc: "Submit your monthly data" },
] as const;

function HealthDot({ color }: { color: HealthColor }) {
  return <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${{
    green: "bg-green-500", amber: "bg-amber-500", red: "bg-red-500",
  }[color]}`} />;
}

function actionBorderClass(action: Action): string {
  if (action.status === "Waiting on Client" || action.priority === "Critical") return "border-l-red-500";
  if (action.status === "Not Started" && action.decisionRequired) return "border-l-red-500";
  return "border-l-green-500";
}

function actionBadgeVariant(action: Action): "red" | "green" | "amber" {
  if (action.status === "Waiting on Client" || action.priority === "Critical") return "red";
  if (action.status === "In Progress") return "amber";
  return "green";
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
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} />

      {/* Banner */}
      <div className="w-full bg-gray-900 px-4 sm:px-6 md:px-10 py-10 md:py-14">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-white/50 mb-1">{property.location || property.conceptType}</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">{property.name}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              healthBgClass(health.color).replace("ring-", "ring-1 ring-")
            }`}>
              <span className={`w-2 h-2 rounded-full ${{
                green: "bg-green-400", amber: "bg-amber-400", red: "bg-red-400",
              }[health.color]}`} />
              <span className={healthColorClass(health.color)}>{health.status}</span>
            </span>
            <span className="text-xs text-white/40">
              Data confidence: {property.dataConfidence}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">

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
            <CalloutBlock variant="amber">
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
            <div className="space-y-3">
              {openActions.map((action) => (
                <div key={action.id} className={`bg-white rounded-xl border border-gray-100 border-l-4 px-5 py-4 ${actionBorderClass(action)}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 mb-0.5">{action.title}</p>
                      {action.notes && <p className="text-sm text-gray-500">{action.notes}</p>}
                      {action.owner && <p className="text-xs text-gray-400 mt-1">Owner: {action.owner}</p>}
                    </div>
                    <StatusBadge label={action.status} variant={actionBadgeVariant(action)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Value creation */}
        {(opportunities as Opportunity[]).length > 0 && (
          <section>
            <SectionHeader title="Value Creation" />
            <div className="space-y-3">
              {(opportunities as Opportunity[]).map((opp) => (
                <div key={opp.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{opp.title}</p>
                      {opp.category && <p className="text-xs text-gray-400 mt-0.5">{opp.category}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {opp.estimatedAnnualImpact > 0 && (
                        <span className="text-sm font-semibold text-gray-900">{compact(opp.estimatedAnnualImpact)}/yr</span>
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
            <div className="flex items-center justify-between mb-4">
              <SectionHeader title="Financial Snapshot" />
              {latestPeriod && (
                <span className="text-xs text-gray-400">{formatPeriod(latestPeriod)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Revenue */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 mb-1">Revenue</p>
                <p className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">
                  {kpi.revenue != null ? compact(kpi.revenue) : "—"}
                </p>
                {kpi.covers != null && <p className="text-xs text-gray-400">{kpi.covers.toLocaleString()} covers</p>}
                {revenueTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={revenueTrend.map((d) => d.value)} color="#2563eb" />
                  </div>
                )}
              </div>

              {/* Labor */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 mb-1">Labor</p>
                <p className={`text-xl sm:text-2xl font-semibold mb-1 ${kpi.laborPct == null ? "text-gray-900" : kpi.laborPct <= 38 ? "text-green-600" : kpi.laborPct <= 42 ? "text-amber-600" : "text-red-600"}`}>
                  {kpi.laborPct != null ? pct(kpi.laborPct) : "—"}
                </p>
                {kpi.laborDollars != null && <p className="text-xs text-gray-400">{usd(kpi.laborDollars)}</p>}
                {laborPctTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={laborPctTrend.map((d) => d.value)}
                      color={kpi.laborPct != null && kpi.laborPct <= 38 ? "#16a34a" : kpi.laborPct != null && kpi.laborPct <= 42 ? "#d97706" : "#dc2626"} />
                  </div>
                )}
              </div>

              {/* COGS */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 mb-1">Food COGS</p>
                <p className={`text-xl sm:text-2xl font-semibold mb-1 ${kpi.cogsPct == null ? "text-gray-900" : kpi.cogsPct <= 30 ? "text-green-600" : kpi.cogsPct <= 34 ? "text-amber-600" : "text-red-600"}`}>
                  {kpi.cogsPct != null ? pct(kpi.cogsPct) : "—"}
                </p>
                {kpi.cogsDollars != null && <p className="text-xs text-gray-400">{usd(kpi.cogsDollars)}</p>}
                {cogsPctTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={cogsPctTrend.map((d) => d.value)}
                      color={kpi.cogsPct != null && kpi.cogsPct <= 30 ? "#16a34a" : kpi.cogsPct != null && kpi.cogsPct <= 34 ? "#d97706" : "#dc2626"} />
                  </div>
                )}
              </div>

              {/* Net profit */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-400 mb-1">Net Profit</p>
                <p className={`text-xl sm:text-2xl font-semibold mb-1 ${kpi.netProfitPct == null ? "text-gray-900" : kpi.netProfitPct >= 10 ? "text-green-600" : kpi.netProfitPct >= 6 ? "text-amber-600" : "text-red-600"}`}>
                  {kpi.netProfitPct != null ? pct(kpi.netProfitPct) : "—"}
                </p>
                {kpi.netProfitDollars != null && <p className="text-xs text-gray-400">{usd(kpi.netProfitDollars)}</p>}
                {profitPctTrend.length >= 2 && (
                  <div className="mt-3">
                    <Sparkline data={profitPctTrend.map((d) => d.value)}
                      color={kpi.netProfitPct != null && kpi.netProfitPct >= 10 ? "#16a34a" : kpi.netProfitPct != null && kpi.netProfitPct >= 6 ? "#d97706" : "#dc2626"} />
                  </div>
                )}
              </div>
            </div>

            {/* Deep-dive link */}
            <div className="mt-3 text-right">
              <Link href={`/${clientId}/${propertyId}/financial`}
                className="text-xs text-blue-600 hover:text-blue-700 transition font-medium">
                Full financial review →
              </Link>
            </div>
          </section>
        )}

        {/* Guest experience */}
        {kpi && (kpi.guestOverall || kpi.guestFood || kpi.guestService || kpi.guestAmbiance) && (
          <section>
            <SectionHeader title="Guest Experience" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Overall",  value: kpi.guestOverall },
                { label: "Food",     value: kpi.guestFood },
                { label: "Service",  value: kpi.guestService },
                { label: "Ambiance", value: kpi.guestAmbiance },
              ].filter(({ value }) => value != null).map(({ label, value }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-xl sm:text-2xl font-semibold mb-2 ${value! >= 4.3 ? "text-green-600" : value! >= 4.0 ? "text-amber-600" : "text-red-600"}`}>
                    {value!.toFixed(1)}<span className="text-sm text-gray-300 font-normal"> / 5.0</span>
                  </p>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${value! >= 4.3 ? "bg-green-500" : value! >= 4.0 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${(value! / 5) * 100}%` }} />
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
            <div className="space-y-3">
              {activeRisks.map((risk) => (
                <div key={risk.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <HealthDot color={risk.status === "Open" || risk.status === "Escalated" ? "red" : "amber"} />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <p className="font-medium text-gray-900">{risk.title}</p>
                        <StatusBadge label={risk.status} variant={risk.status === "Open" || risk.status === "Escalated" ? "red" : "amber"} />
                      </div>
                      {risk.mitigationPlan && <p className="text-sm text-gray-500 mt-0.5">{risk.mitigationPlan}</p>}
                      {risk.category && <p className="text-xs text-gray-400 mt-1">{risk.category} · {risk.impact} impact</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Explore sub-pages */}
        <section>
          <SectionHeader title="Explore" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {SUB_PAGES.map(({ href, icon, label, desc }) => (
              <Link key={href} href={`/${clientId}/${propertyId}/${href}`}
                className="bg-white rounded-xl border border-gray-100 px-5 py-4 hover:border-gray-300 hover:shadow-sm transition-all flex items-start gap-4">
                <span className="text-2xl">{icon}</span>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
