import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getKpiMetrics, getIntelligence, getBenchmarks, getLastUpdated } from "@/lib/notion-queries";
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
import EmptyState from "@/components/EmptyState";
import type { KpiMetric, Intelligence, Benchmark, Severity } from "@/types/portal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

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

// ─── Section wrapper ──────────────────────────────────────────────────────────

function MenuSection({
  heading,
  intelligence,
  metrics,
  allMetrics,
  trendUnit,
  children,
}: {
  heading: string;
  intelligence: Intelligence | null;
  metrics: KpiMetric[];
  allMetrics: KpiMetric[];
  trendUnit?: string;
  children?: React.ReactNode;
}) {
  const severity = intelligence?.severity ?? (metrics[0]?.severity ?? "Monitor");
  const unit = trendUnit ?? allMetrics[0]?.unit ?? "%";

  return (
    <section className="space-y-4">
      <SectionHeader title={heading} />

      {intelligence?.currentRead ? (
        <CalloutBlock>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p>{intelligence.currentRead}</p>
            <StatusBadge label={severity} variant={severityVariant(severity)} />
          </div>
        </CalloutBlock>
      ) : metrics.length > 0 ? (
        <CalloutBlock>
          <p className="text-sm opacity-60 italic">No commentary published for this period.</p>
        </CalloutBlock>
      ) : null}

      {children && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
      )}

      {allMetrics.length >= 2 && (() => {
        const trendData = buildTrendData(allMetrics);
        const bLow = allMetrics[0]?.benchmarkLow;
        const bHigh = allMetrics[0]?.benchmarkHigh;
        return (
          <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-4">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest">Trend</p>
            <TrendChart data={trendData} unit={unit} benchmarkLow={bLow} benchmarkHigh={bHigh} color="#059669" />
          </div>
        );
      })()}

      {(intelligence?.whyItMatters || intelligence?.suggestedDecision) && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>Commentary</span>
            <span className="text-gray-400 text-xs">▼</span>
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
                      {m.unit === "$" ? usd(m.metricValue)
                        : m.unit === "%" ? pct(m.metricValue)
                        : m.metricValue.toLocaleString()}
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

// ─── Category mix bars ────────────────────────────────────────────────────────

const MIX_COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2"];

function MixBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-xs font-medium text-gray-900">{pct(value)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Benchmark table ──────────────────────────────────────────────────────────

function BenchmarkTable({
  benchmarks,
  metrics,
}: {
  benchmarks: Benchmark[];
  metrics: KpiMetric[];
}) {
  if (benchmarks.length === 0) return null;

  // Try to match each benchmark to a KPI metric by keyword overlap in metricName
  function findMetricValue(b: Benchmark): KpiMetric | null {
    const keywords = b.metricName
      .toLowerCase()
      .split(/[\s,&%\/]+/)
      .filter((w) => w.length > 3);
    return (
      metrics.find((m) => {
        const name = (m.metricName || m.kpiRecord).toLowerCase();
        return keywords.some((kw) => name.includes(kw));
      }) ?? null
    );
  }

  // Split into benchmarks that have a property match vs. reference-only
  const withValue = benchmarks
    .filter((b) => b.lowRange != null && b.highRange != null)
    .map((b) => ({ b, match: findMetricValue(b) }))
    .filter(({ match }) => match != null) as { b: Benchmark; match: KpiMetric }[];

  const referenceOnly = benchmarks.filter(
    (b) =>
      b.lowRange != null &&
      b.highRange != null &&
      !withValue.some(({ b: wb }) => wb.id === b.id)
  );

  return (
    <section className="space-y-4">
      <SectionHeader title="Industry Benchmarks" />

      {/* Gauges for benchmarks that match a current KPI value */}
      {withValue.length > 0 && (
        <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-6">
          <p className="text-xs text-gray-400 mb-5">
            Grey zone = industry range · ★ = top quartile · dot = your value
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
            {withValue.map(({ b, match }) => (
              <BenchmarkGauge
                key={b.id}
                label={b.metricName || b.title}
                value={match.metricValue}
                low={b.lowRange!}
                high={b.highRange!}
                topQuartile={b.topQuartile}
                unit={b.unit || match.unit}
                higherIsBetter={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Reference-only table for benchmarks without a matched KPI metric */}
      {referenceOnly.length > 0 && (
        <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 bg-gray-50">
            <p className="text-xs text-gray-400 font-medium">Industry Reference Ranges</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs text-gray-400 font-medium">Metric</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">Low</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">High</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">Top Q</th>
                  <th className="text-right px-5 py-2.5 text-xs text-gray-400 font-medium">Unit</th>
                </tr>
              </thead>
              <tbody>
                {referenceOnly.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 text-gray-700">{b.metricName || b.title}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{b.lowRange}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{b.highRange}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{b.topQuartile ?? "—"}</td>
                    <td className="px-5 py-3 text-right text-gray-400 text-xs">{b.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MenuPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, allMetrics, allIntelligence, benchmarks, lastUpdated] = await Promise.all([
    getProperty(propertyId, clientId),
    getKpiMetrics(propertyId),
    getIntelligence(propertyId),
    getBenchmarks(undefined),
    getLastUpdated(propertyId, clientId),
  ]);

  if (!property) notFound();

  // Narrow benchmarks to this property's concept type if set
  const conceptBenchmarks = property.conceptType
    ? benchmarks.filter((b) => b.conceptType === property.conceptType)
    : benchmarks;

  const latest = latestPeriod(allMetrics);
  const currentMetrics = latest
    ? allMetrics.filter((m) => m.periodStart === latest)
    : allMetrics;

  const catMetrics = (cat: string) => currentMetrics.filter((m) => m.category === cat);

  const trendFor = (cat: string, unit: string, hint?: string) =>
    allMetrics.filter(
      (m) =>
        m.category === cat &&
        m.unit === unit &&
        (hint ? m.metricName.toLowerCase().includes(hint.toLowerCase()) : true)
    );

  const intel = (cat: string): Intelligence | null =>
    (allIntelligence as Intelligence[]).find((i) => i.category === cat) ?? null;

  const m = (cat: string, unit: string, hint?: string) =>
    latestMetric(allMetrics, cat, unit, hint);

  // COGS breakdown
  const cogsMetrics = catMetrics("COGS");
  const cogsTotal   = m("COGS", "%");
  const foodCogs    = m("COGS", "%", "food");
  const bevCogs     = m("COGS", "%", "bev") ?? m("COGS", "%", "beverage") ?? m("COGS", "%", "bar");

  // Menu category mix (% items in "Menu" category)
  const menuMix    = catMetrics("Menu").filter((mm) => mm.unit === "%");
  const menuCounts = catMetrics("Menu").filter((mm) => mm.unit !== "%");

  const avgItemValue  = m("Menu", "$", "avg") ?? m("Menu", "$");
  const topItemMetric = m("Menu", "$", "top") ?? m("Menu", "Count", "best");

  const executionIntel = intel("Execution");

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="menu" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        {/* ── Food & Beverage Cost ─────────────────────────────────────── */}
        <MenuSection
          heading="Food & Beverage Cost"
          intelligence={intel("Menu")}
          metrics={cogsMetrics}
          allMetrics={trendFor("COGS", "%")}
          trendUnit="%"
        >
          {cogsTotal && (
            <KpiCard key="cogs" label="Total COGS %" value={pct(cogsTotal.metricValue)}
              sub="of revenue" variant={severityVariant(cogsTotal.severity)} />
          )}
          {foodCogs && (
            <KpiCard key="food" label="Food Cost %" value={pct(foodCogs.metricValue)}
              sub="of food revenue" variant={severityVariant(foodCogs.severity)} />
          )}
          {bevCogs && (
            <KpiCard key="bev" label="Beverage Cost %" value={pct(bevCogs.metricValue)}
              sub="of bev revenue" variant={severityVariant(bevCogs.severity)} />
          )}
          {cogsTotal?.targetValue != null && (
            <KpiCard key="tgt" label="Target" value={pct(cogsTotal.targetValue)}
              variant="neutral" />
          )}
        </MenuSection>

        {/* ── Category Mix ─────────────────────────────────────────────── */}
        {menuMix.length > 0 && (
          <section className="space-y-4">
            <SectionHeader title="Category Mix" />
            <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-6 space-y-4">
              {menuMix.map((mix, i) => (
                <MixBar
                  key={mix.id}
                  label={mix.metricName || mix.kpiRecord}
                  value={mix.metricValue}
                  color={MIX_COLORS[i % MIX_COLORS.length]}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Item Performance ─────────────────────────────────────────── */}
        {menuCounts.length > 0 && (
          <MenuSection
            heading="Item Performance"
            intelligence={null}
            metrics={menuCounts}
            allMetrics={trendFor("Menu", "$")}
            trendUnit="$"
          >
            {avgItemValue && (
              <KpiCard key="avg" label="Avg Item Value"
                value={usd(avgItemValue.metricValue)}
                variant={severityVariant(avgItemValue.severity)} />
            )}
            {topItemMetric && (
              <KpiCard key="top" label={topItemMetric.metricName || "Top Item"}
                value={topItemMetric.unit === "$"
                  ? usd(topItemMetric.metricValue)
                  : topItemMetric.metricValue.toLocaleString()}
                variant={severityVariant(topItemMetric.severity)} />
            )}
          </MenuSection>
        )}

        {/* ── Execution Quality ────────────────────────────────────────── */}
        {executionIntel && (
          <section className="space-y-4">
            <SectionHeader title="Execution Quality" />
            <CalloutBlock>
              <div className="flex items-start justify-between gap-4">
                <p>{executionIntel.currentRead}</p>
                <StatusBadge label={executionIntel.severity} variant={severityVariant(executionIntel.severity)} />
              </div>
            </CalloutBlock>
            {(executionIntel.whyItMatters || executionIntel.suggestedDecision) && (
              <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
                <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
                  <span>Commentary</span>
                  <span className="text-gray-400 text-xs">▼</span>
                </summary>
                <div className="px-5 pb-5 pt-2 space-y-4 border-t border-gray-50">
                  {executionIntel.whyItMatters && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Why It Matters</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{executionIntel.whyItMatters}</p>
                    </div>
                  )}
                  {executionIntel.suggestedDecision && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Recommendation</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{executionIntel.suggestedDecision}</p>
                    </div>
                  )}
                </div>
              </details>
            )}
          </section>
        )}

        {/* ── Industry Benchmarks ──────────────────────────────────────── */}
        <BenchmarkTable benchmarks={conceptBenchmarks} metrics={currentMetrics} />

        {/* Empty state */}
        {allMetrics.length === 0 && (
          <EmptyState
            title="No menu data yet"
            body="Upload a POS menu mix report to activate menu performance analysis for this property."
            ctaLabel="Go to Upload →"
            ctaHref={`/${clientId}/${propertyId}/upload`}
          />
        )}

      </div>
    </PageWrapper>
  );
}
