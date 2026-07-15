import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getKpiMetrics, getIntelligence } from "@/lib/notion-queries";
import { usd, pct, buildTrendData } from "@/lib/format";
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
import RequestAnalysisButton from "@/components/RequestAnalysisButton";
import EmptyState from "@/components/EmptyState";
import type { KpiMetric, Intelligence, Severity } from "@/types/portal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

// Get the most recent period's value for a category + unit combination
function latestMetric(
  metrics: KpiMetric[],
  category: string,
  unit: string,
  nameHint?: string
): KpiMetric | null {
  const matches = metrics.filter(
    (m) =>
      m.category === category &&
      m.unit === unit &&
      (nameHint ? m.metricName.toLowerCase().includes(nameHint.toLowerCase()) : true)
  );
  return matches.sort((a, b) => (b.periodStart ?? "").localeCompare(a.periodStart ?? ""))[0] ?? null;
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
  children,
}: {
  heading: string;
  intelligence: Intelligence | null;
  metrics: KpiMetric[];   // latest period metrics for this section
  allMetrics: KpiMetric[]; // all periods — for trend chart
  children: React.ReactNode; // KPI cards
}) {
  const severity = intelligence?.severity ?? (metrics[0]?.severity ?? "Monitor");

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

  const [property, allMetrics, allIntelligence] = await Promise.all([
    getProperty(propertyId, clientId),
    getKpiMetrics(propertyId),
    getIntelligence(propertyId),
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

  // Intelligence by category (most recent)
  const intel = (cat: string): Intelligence | null =>
    (allIntelligence as Intelligence[]).find((i) => i.category === cat) ?? null;

  // Convenience metric lookup
  const m = (cat: string, unit: string, hint?: string) =>
    latestMetric(allMetrics, cat, unit, hint);

  return (
    <PageWrapper>
      <NavBar session={session} />
      <PropertyHeader property={property} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="financial" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        <div className="flex justify-end">
          <RequestAnalysisButton clientId={clientId} propertyId={propertyId} category="Financial" label="Refresh analysis" />
        </div>

        {/* ── Revenue ──────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Revenue"
          intelligence={intel("Financial")}
          metrics={catMetrics("Revenue")}
          allMetrics={trendFor("Revenue", "$")}
        >
          {[
            m("Revenue", "$") && (
              <KpiCard key="rev" label="Total Revenue" value={usd(m("Revenue", "$")!.metricValue)}
                variant={severityVariant(m("Revenue", "$")!.severity)} />
            ),
            m("Revenue", "Count") && (
              <KpiCard key="cov" label="Covers" value={m("Revenue", "Count")!.metricValue.toLocaleString()}
                variant="neutral" />
            ),
            m("Revenue", "$", "spend") && (
              <KpiCard key="asp" label="Avg Spend" value={usd(m("Revenue", "$", "spend")!.metricValue)}
                variant={severityVariant(m("Revenue", "$", "spend")!.severity)} />
            ),
            m("Revenue", "$", "check") && (
              <KpiCard key="avc" label="Avg Check" value={usd(m("Revenue", "$", "check")!.metricValue)}
                variant={severityVariant(m("Revenue", "$", "check")!.severity)} />
            ),
          ].filter(Boolean)}
        </FinancialSection>

        {/* ── Labor ────────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Labor"
          intelligence={intel("Labor")}
          metrics={catMetrics("Labor")}
          allMetrics={trendFor("Labor", "%")}
        >
          {[
            m("Labor", "$") && (
              <KpiCard key="lab$" label="Labor Cost" value={usd(m("Labor", "$")!.metricValue)}
                variant={severityVariant(m("Labor", "$")!.severity)} />
            ),
            m("Labor", "%") && (
              <KpiCard key="lab%" label="Labor %" value={pct(m("Labor", "%")!.metricValue)}
                sub="of revenue"
                variant={severityVariant(m("Labor", "%")!.severity)} />
            ),
            m("Labor", "%")?.benchmarkLow != null && (
              <KpiCard key="labB" label="Benchmark Range"
                value={`${m("Labor", "%")!.benchmarkLow}–${m("Labor", "%")!.benchmarkHigh}%`}
                variant="neutral" />
            ),
            m("Labor", "%")?.targetValue != null && (
              <KpiCard key="labT" label="Target"
                value={pct(m("Labor", "%")!.targetValue!)}
                variant="neutral" />
            ),
          ].filter(Boolean)}
        </FinancialSection>

        {/* ── COGS ─────────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Food & Beverage COGS"
          intelligence={intel("COGS")}
          metrics={catMetrics("COGS")}
          allMetrics={trendFor("COGS", "%")}
        >
          {[
            m("COGS", "$") && (
              <KpiCard key="cog$" label="COGS" value={usd(m("COGS", "$")!.metricValue)}
                variant={severityVariant(m("COGS", "$")!.severity)} />
            ),
            m("COGS", "%") && (
              <KpiCard key="cog%" label="COGS %" value={pct(m("COGS", "%")!.metricValue)}
                sub="of revenue"
                variant={severityVariant(m("COGS", "%")!.severity)} />
            ),
            m("COGS", "%")?.benchmarkLow != null && (
              <KpiCard key="cogB" label="Benchmark Range"
                value={`${m("COGS", "%")!.benchmarkLow}–${m("COGS", "%")!.benchmarkHigh}%`}
                variant="neutral" />
            ),
            m("COGS", "%")?.targetValue != null && (
              <KpiCard key="cogT" label="Target"
                value={pct(m("COGS", "%")!.targetValue!)}
                variant="neutral" />
            ),
          ].filter(Boolean)}
        </FinancialSection>

        {/* ── OpEx ─────────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Operating Expenses"
          intelligence={intel("Execution")}
          metrics={catMetrics("OpEx")}
          allMetrics={trendFor("OpEx", "%")}
        >
          {[
            m("OpEx", "$") && (
              <KpiCard key="opx$" label="Operating Expenses" value={usd(m("OpEx", "$")!.metricValue)}
                variant={severityVariant(m("OpEx", "$")!.severity)} />
            ),
            m("OpEx", "%") && (
              <KpiCard key="opx%" label="OpEx %" value={pct(m("OpEx", "%")!.metricValue)}
                sub="of revenue"
                variant={severityVariant(m("OpEx", "%")!.severity)} />
            ),
            m("OpEx", "%")?.benchmarkLow != null && (
              <KpiCard key="opxB" label="Benchmark Range"
                value={`${m("OpEx", "%")!.benchmarkLow}–${m("OpEx", "%")!.benchmarkHigh}%`}
                variant="neutral" />
            ),
          ].filter(Boolean)}
        </FinancialSection>

        {/* ── Profitability ─────────────────────────────────────────────── */}
        <FinancialSection
          heading="Profitability"
          intelligence={intel("Financial")}
          metrics={catMetrics("Profitability")}
          allMetrics={trendFor("Profitability", "%")}
        >
          {[
            m("Profitability", "$") && (
              <KpiCard key="pro$" label="Net Profit" value={usd(m("Profitability", "$")!.metricValue)}
                variant={severityVariant(m("Profitability", "$")!.severity)} />
            ),
            m("Profitability", "%") && (
              <KpiCard key="pro%" label="Net Profit %" value={pct(m("Profitability", "%")!.metricValue)}
                sub="margin"
                variant={severityVariant(m("Profitability", "%")!.severity)} />
            ),
            m("Profitability", "%")?.benchmarkLow != null && (
              <KpiCard key="proB" label="Benchmark Range"
                value={`${m("Profitability", "%")!.benchmarkLow}–${m("Profitability", "%")!.benchmarkHigh}%`}
                variant="neutral" />
            ),
            m("Profitability", "%")?.targetValue != null && (
              <KpiCard key="proT" label="Target"
                value={pct(m("Profitability", "%")!.targetValue!)}
                variant="neutral" />
            ),
          ].filter(Boolean)}
        </FinancialSection>

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
