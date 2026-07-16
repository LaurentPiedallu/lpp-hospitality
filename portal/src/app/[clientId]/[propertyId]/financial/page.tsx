import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getKpiMetrics, getIntelligence, getLastUpdated } from "@/lib/notion-queries";
import { usd, pct, buildTrendData, findMetricByKey, findIntelligence } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import TrendChart from "@/components/TrendChart";
import BenchmarkGauge from "@/components/BenchmarkGauge";
import EmptyState from "@/components/EmptyState";
import type { KpiMetric, Intelligence, Severity } from "@/types/portal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

function latestPeriod(metrics: KpiMetric[]): string | null {
  return (
    metrics
      .map((m) => m.periodStart)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null
  );
}

// ─── Section component ────────────────────────────────────────────────────────

function FinancialSection({
  heading,
  intelligence,
  metrics,
  allMetrics,
  primarySeverity,
  children,
}: {
  heading: string;
  intelligence: Intelligence | null;
  metrics: KpiMetric[];   // latest period metrics for this section
  allMetrics: KpiMetric[]; // all periods — for trend chart
  // Severity of this section's own primary metric (e.g. labor_pct for
  // Labor) — not an arbitrary first-in-array metric, which could belong to
  // any line item in the category and mislead the badge.
  primarySeverity?: Severity;
  children: React.ReactNode; // KPI cards
}) {
  const severity = intelligence?.severity ?? primarySeverity ?? "Monitor";

  return (
    <section className="space-y-4">
      <SectionHeader title={heading} />

      {/* Current read callout */}
      {intelligence?.currentRead ? (
        <CalloutBlock>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p>{intelligence.currentRead}</p>
            <StatusBadge label={severity} variant={severityVariant(severity)} />
          </div>
        </CalloutBlock>
      ) : metrics.length > 0 ? (
        <CalloutBlock>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-sm opacity-70 italic">No commentary published for this period.</p>
            <StatusBadge label={severity} variant={severityVariant(severity)} />
          </div>
        </CalloutBlock>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>

      {/* Trend chart — shown if 2+ periods available */}
      {allMetrics.length >= 2 && (() => {
        const trendData = buildTrendData(allMetrics);
        const unit = allMetrics[0]?.unit ?? "%";
        const bLow = allMetrics[0]?.benchmarkLow;
        const bHigh = allMetrics[0]?.benchmarkHigh;
        return (
          <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-4">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest">Trend</p>
            <TrendChart
              data={trendData}
              unit={unit}
              benchmarkLow={bLow}
              benchmarkHigh={bHigh}
              color="#2563eb"
            />
          </div>
        );
      })()}

      {/* Commentary toggle */}
      {(intelligence?.whyItMatters || intelligence?.suggestedDecision) && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden group">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>Commentary</span>
            <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="px-5 pb-5 pt-2 space-y-4 border-t border-gray-50">
            {intelligence.whyItMatters && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Why It Matters</p>
                <p className="text-sm text-gray-700 leading-relaxed">{intelligence.whyItMatters}</p>
              </div>
            )}
            {intelligence.suggestedDecision && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Recommendation</p>
                <p className="text-sm text-gray-700 leading-relaxed">{intelligence.suggestedDecision}</p>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Supporting detail toggle — raw metrics */}
      {metrics.length > 0 && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>Supporting detail</span>
            <span className="text-gray-400 text-xs">▼</span>
          </summary>
          <div className="border-t border-gray-50 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs text-gray-400 font-medium">Metric</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">Value</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">Benchmark</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-2.5 text-gray-700">{m.metricName || m.kpiRecord}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-gray-900">
                      {m.unit === "$" ? usd(m.metricValue) : m.unit === "%" ? pct(m.metricValue) : m.metricValue}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-400 text-xs">
                      {m.benchmarkLow != null && m.benchmarkHigh != null
                        ? `${m.benchmarkLow}–${m.benchmarkHigh}${m.unit}`
                        : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <StatusBadge label={m.severity} variant={severityVariant(m.severity)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FinancialPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, allMetrics, allIntelligence, lastUpdated] = await Promise.all([
    getProperty(propertyId, clientId),
    getKpiMetrics(propertyId),
    getIntelligence(propertyId),
    getLastUpdated(propertyId, clientId),
  ]);

  if (!property) notFound();

  const latest = latestPeriod(allMetrics);
  const currentMetrics = latest
    ? allMetrics.filter((m) => m.periodStart === latest)
    : allMetrics;

  // Helper: current period metrics for a category
  const catMetrics = (cat: string) => currentMetrics.filter((m) => m.category === cat);
  // All-period metrics for a category + unit (for trend chart)
  const trendFor = (cat: string, unit: string, hint?: string) =>
    allMetrics.filter(
      (m) =>
        m.category === cat &&
        m.unit === unit &&
        (hint ? m.metricName.toLowerCase().includes(hint.toLowerCase()) : true)
    );

  // Intelligence by category, scoped to the current period — a category with
  // no record for this period must not fall through to an older one (see
  // findIntelligence in lib/format.ts for the bug this fixes).
  const intel = (cat: string): Intelligence | null =>
    findIntelligence(allIntelligence as Intelligence[], cat, latest);

  // KPI lookup by canonical LPP Metric Key, not category/unit/name-guessing
  // (see findMetricByKey in lib/format.ts for the bug this fixes).
  const byKey = (key: string, category?: string) =>
    findMetricByKey(allMetrics, key, latest, category);

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="financial" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        {/* ── Revenue ──────────────────────────────────────────────────── */}
        {(() => {
          const totalRevenue = byKey("total_revenue");
          const covers = byKey("covers", "Revenue");
          const avgSpend = byKey("avg_spend");
          const avgCheck = byKey("avg_check");
          return (
            <FinancialSection
              heading="Revenue"
              intelligence={intel("Financial")}
              metrics={catMetrics("Revenue")}
              allMetrics={trendFor("Revenue", "$")}
              primarySeverity={totalRevenue?.severity}
            >
              {[
                totalRevenue && (
                  <KpiCard key="rev" label="Total Revenue" value={usd(totalRevenue.metricValue)}
                    variant={severityVariant(totalRevenue.severity)} />
                ),
                covers && (
                  <KpiCard key="cov" label="Covers" value={covers.metricValue.toLocaleString()}
                    variant="neutral" />
                ),
                avgSpend && (
                  <KpiCard key="asp" label="Avg Spend" value={usd(avgSpend.metricValue)}
                    variant={severityVariant(avgSpend.severity)} />
                ),
                avgCheck && (
                  <KpiCard key="avc" label="Avg Check" value={usd(avgCheck.metricValue)}
                    variant={severityVariant(avgCheck.severity)} />
                ),
              ].filter(Boolean)}
            </FinancialSection>
          );
        })()}

        {/* ── Labor ────────────────────────────────────────────────────── */}
        {(() => {
          const laborCost = byKey("total_payroll");
          const laborPct = byKey("labor_pct");
          return (
            <FinancialSection
              heading="Labor"
              intelligence={intel("Labor")}
              metrics={catMetrics("Labor")}
              allMetrics={trendFor("Labor", "%")}
              primarySeverity={laborPct?.severity}
            >
              {[
                laborCost && (
                  <KpiCard key="lab$" label="Labor Cost" value={usd(laborCost.metricValue)}
                    variant={severityVariant(laborCost.severity)} />
                ),
                laborPct && (
                  <KpiCard key="lab%" label="Labor %" value={pct(laborPct.metricValue)}
                    sub="of revenue"
                    variant={severityVariant(laborPct.severity)} />
                ),
                laborPct?.benchmarkLow != null && (
                  <KpiCard key="labB" label="Benchmark Range"
                    value={`${laborPct.benchmarkLow}–${laborPct.benchmarkHigh}%`}
                    variant="neutral" />
                ),
                laborPct?.targetValue != null && (
                  <KpiCard key="labT" label="Target"
                    value={pct(laborPct.targetValue)}
                    variant="neutral" />
                ),
              ].filter(Boolean)}
            </FinancialSection>
          );
        })()}

        {/* ── COGS ─────────────────────────────────────────────────────── */}
        {(() => {
          const cogsDollars = byKey("total_cogs");
          const cogsPct = byKey("cogs_pct");
          return (
            <FinancialSection
              heading="Food & Beverage COGS"
              intelligence={intel("COGS")}
              metrics={catMetrics("COGS")}
              allMetrics={trendFor("COGS", "%")}
              primarySeverity={cogsPct?.severity}
            >
              {[
                cogsDollars && (
                  <KpiCard key="cog$" label="COGS" value={usd(cogsDollars.metricValue)}
                    variant={severityVariant(cogsDollars.severity)} />
                ),
                cogsPct && (
                  <KpiCard key="cog%" label="COGS %" value={pct(cogsPct.metricValue)}
                    sub="of revenue"
                    variant={severityVariant(cogsPct.severity)} />
                ),
                cogsPct?.benchmarkLow != null && (
                  <KpiCard key="cogB" label="Benchmark Range"
                    value={`${cogsPct.benchmarkLow}–${cogsPct.benchmarkHigh}%`}
                    variant="neutral" />
                ),
                cogsPct?.targetValue != null && (
                  <KpiCard key="cogT" label="Target"
                    value={pct(cogsPct.targetValue)}
                    variant="neutral" />
                ),
              ].filter(Boolean)}
            </FinancialSection>
          );
        })()}

        {/* ── OpEx ─────────────────────────────────────────────────────── */}
        {(() => {
          const opexDollars = byKey("opex");
          const opexPct = byKey("opex_pct");
          return (
            <FinancialSection
              heading="Operating Expenses"
              intelligence={intel("Execution")}
              metrics={catMetrics("OpEx")}
              allMetrics={trendFor("OpEx", "%")}
              primarySeverity={opexPct?.severity}
            >
              {[
                opexDollars && (
                  <KpiCard key="opx$" label="Operating Expenses" value={usd(opexDollars.metricValue)}
                    variant={severityVariant(opexDollars.severity)} />
                ),
                opexPct && (
                  <KpiCard key="opx%" label="OpEx %" value={pct(opexPct.metricValue)}
                    sub="of revenue"
                    variant={severityVariant(opexPct.severity)} />
                ),
                opexPct?.benchmarkLow != null && (
                  <KpiCard key="opxB" label="Benchmark Range"
                    value={`${opexPct.benchmarkLow}–${opexPct.benchmarkHigh}%`}
                    variant="neutral" />
                ),
              ].filter(Boolean)}
            </FinancialSection>
          );
        })()}

        {/* ── Profitability ─────────────────────────────────────────────── */}
        {(() => {
          const netProfit = byKey("net_profit");
          const netProfitPct = byKey("net_profit_pct");
          return (
            <FinancialSection
              heading="Profitability"
              intelligence={intel("Profitability")}
              metrics={catMetrics("Profitability")}
              allMetrics={trendFor("Profitability", "%")}
              primarySeverity={netProfitPct?.severity}
            >
              {[
                netProfit && (
                  <KpiCard key="pro$" label="Net Profit" value={usd(netProfit.metricValue)}
                    variant={severityVariant(netProfit.severity)} />
                ),
                netProfitPct && (
                  <KpiCard key="pro%" label="Net Profit %" value={pct(netProfitPct.metricValue)}
                    sub="margin"
                    variant={severityVariant(netProfitPct.severity)} />
                ),
                netProfitPct?.benchmarkLow != null && (
                  <KpiCard key="proB" label="Benchmark Range"
                    value={`${netProfitPct.benchmarkLow}–${netProfitPct.benchmarkHigh}%`}
                    variant="neutral" />
                ),
                netProfitPct?.targetValue != null && (
                  <KpiCard key="proT" label="Target"
                    value={pct(netProfitPct.targetValue)}
                    variant="neutral" />
                ),
              ].filter(Boolean)}
            </FinancialSection>
          );
        })()}

        {/* ── Performance vs Benchmarks ────────────────────────────── */}
        {(() => {
          const HIGHER_BETTER = new Set(["Revenue", "Profitability"]);
          const gaugeMetrics = currentMetrics.filter(
            (met) =>
              met.unit === "%" &&
              met.benchmarkLow != null &&
              met.benchmarkHigh != null
          );
          if (gaugeMetrics.length === 0) return null;
          return (
            <section className="space-y-4">
              <SectionHeader title="Performance vs Benchmarks" />
              <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-6">
                <p className="text-xs text-gray-400 mb-5">
                  Grey zone = industry benchmark range · ★ = top quartile · dot = your value
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
                  {gaugeMetrics.map((met) => (
                    <BenchmarkGauge
                      key={met.id}
                      label={met.metricName || met.category}
                      value={met.metricValue}
                      low={met.benchmarkLow!}
                      high={met.benchmarkHigh!}
                      unit={met.unit}
                      higherIsBetter={HIGHER_BETTER.has(met.category)}
                    />
                  ))}
                </div>
              </div>
            </section>
          );
        })()}

        {/* Empty state */}
        {allMetrics.length === 0 && (
          <EmptyState
            title="No financial data yet"
            body="Upload a P&L file to activate financial review for this property."
            ctaLabel="Go to Upload →"
            ctaHref={`/${clientId}/${propertyId}/upload`}
          />
        )}

      </div>
    </PageWrapper>
  );
}
