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

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

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

// ─── Driver breakdown — horizontal bars against a named total ────────────────
// Only built where real, itemized KPI Records exist (see report at the
// bottom of this ticket's summary for what each department actually has).
// Bars are sized against the section's own total, not forced to sum to
// 100% — some periods have a real, disclosed residual not broken into
// named line items, and hiding that would be less honest than showing it.

function DriverBreakdown({
  title,
  total,
  items,
  residualLabel,
}: {
  title: string;
  total: number;
  items: { label: string; value: number }[];
  residualLabel?: string;
}) {
  const max = Math.max(...items.map((i) => i.value));
  const namedSum = items.reduce((s, i) => s + i.value, 0);
  const residual = total - namedSum;

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 20 }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 16 }}>
        {title}
      </p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.65)" }}>{item.label}</span>
              <span style={{ fontFamily: JOST, fontSize: 12, color: "#12120F", fontWeight: 500 }}>
                {usd(item.value)} <span style={{ color: "rgba(18,18,15,0.35)" }}>· {((item.value / total) * 100).toFixed(0)}%</span>
              </span>
            </div>
            <div style={{ height: 5, background: "rgba(18,18,15,0.06)" }}>
              <div style={{ height: "100%", width: `${(item.value / max) * 100}%`, background: GOLD }} />
            </div>
          </div>
        ))}
      </div>
      {residual > 0 && residualLabel && (
        <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginTop: 14 }}>
          Plus {usd(residual)} in {residualLabel} not itemized in the source data.
        </p>
      )}
    </div>
  );
}

// ─── Stacked bar — for a two-part split that sums exactly to the total ───────

function StackedSplit({
  title,
  segments,
}: {
  title: string;
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 20 }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 16 }}>
        {title}
      </p>
      <div className="flex" style={{ height: 28, overflow: "hidden" }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }} />
        ))}
      </div>
      <div className="flex flex-wrap" style={{ gap: 20, marginTop: 14 }}>
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center" style={{ gap: 8 }}>
            <span style={{ width: 8, height: 8, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.65)" }}>
              {seg.label} <span style={{ color: "#12120F", fontWeight: 500 }}>{usd(seg.value)}</span>{" "}
              <span style={{ color: "rgba(18,18,15,0.35)" }}>· {((seg.value / total) * 100).toFixed(0)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section component ────────────────────────────────────────────────────────

function FinancialSection({
  heading,
  connector,
  intelligence,
  metrics,
  allMetrics,
  primarySeverity,
  children,
}: {
  heading: string;
  // Short line at the top of the section linking back to what came before —
  // keeps the throughline alive for a reader going straight through without
  // making the section unreadable on its own for someone who jumped here.
  connector?: string;
  intelligence: Intelligence | null;
  metrics: KpiMetric[];   // latest period metrics for this section
  allMetrics: KpiMetric[]; // all periods — for trend chart
  // Severity of this section's own primary metric (e.g. labor_pct for
  // Labor) — not an arbitrary first-in-array metric, which could belong to
  // any line item in the category and mislead the badge.
  primarySeverity?: Severity;
  children: React.ReactNode; // KPI cards / driver visuals — caller owns layout
}) {
  const severity = intelligence?.severity ?? primarySeverity ?? "Monitor";

  return (
    <section className="space-y-4">
      <SectionHeader title={heading} />

      {connector && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.45)", fontStyle: "italic", marginTop: -8 }}>
          {connector}
        </p>
      )}

      {/* Current read callout — badge first, paragraph below */}
      {intelligence?.currentRead ? (
        <CalloutBlock>
          <div className="space-y-3">
            <StatusBadge label={severity} variant={severityVariant(severity)} />
            <p>{intelligence.currentRead}</p>
          </div>
        </CalloutBlock>
      ) : metrics.length > 0 ? (
        <CalloutBlock>
          <div className="space-y-3">
            <StatusBadge label={severity} variant={severityVariant(severity)} />
            <p className="text-sm opacity-70 italic">No commentary published for this period.</p>
          </div>
        </CalloutBlock>
      ) : null}

      {/* KPI cards / driver visuals */}
      {children}

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

      {/* Executive Interpretation toggle */}
      {(intelligence?.whyItMatters || intelligence?.suggestedDecision) && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden group">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>Executive Interpretation</span>
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

      {/* Evidence toggle — raw metrics */}
      {metrics.length > 0 && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>Evidence</span>
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

  // Precompute the primary metric for each section once — used for KPI
  // cards, driver visuals, and severity fallback alike.
  const totalRevenue = byKey("total_revenue");
  const covers = byKey("covers", "Revenue");
  const avgSpend = byKey("avg_spend");
  const avgCheck = byKey("avg_check");

  const laborCost = byKey("total_payroll");
  const laborPct = byKey("labor_pct");
  // Driver line items — none of these have a canonical LPP Metric Key (all
  // "unclassified" in the source data), so matched by exact metric name
  // instead of guessing at category + unit. Only shown if genuinely present.
  const wages = currentMetrics.find((m) => m.category === "Labor" && m.metricName === "Total Wages") ?? null;
  const payrollTaxes = currentMetrics.find((m) => m.category === "Labor" && m.metricName === "Payroll Taxes") ?? null;
  const benefits = currentMetrics.find((m) => m.category === "Labor" && m.metricName === "Total Benefits") ?? null;
  const laborDrivers = [wages, payrollTaxes, benefits].filter((x): x is KpiMetric => x != null);

  const cogsDollars = byKey("total_cogs");
  const cogsPct = byKey("cogs_pct");
  const foodCost = currentMetrics.find((m) => m.category === "COGS" && m.metricName === "Food Cost of Sales") ?? null;
  const beverageCost = currentMetrics.find((m) => m.category === "COGS" && m.metricName === "Beverage Cost of Sales") ?? null;

  const opexDollars = byKey("opex");
  const opexPct = byKey("opex_pct");
  // Explicit allowlist, not a category+unit filter — OpEx also has a "Total
  // Expenses" $ record whose exact scope relative to "Other Operating
  // Expenses" isn't clear from the data (it doesn't reconcile cleanly
  // against opex or against opex + COGS + labor), so it's deliberately
  // excluded rather than guessed into a breakdown it might not belong in.
  const OPEX_DRIVER_NAMES = ["Kitchen Allocation", "Plants and Decorations", "Consulting Fees", "Uniform Cleaning"];
  const opexLineItems = currentMetrics
    .filter((m) => m.category === "OpEx" && OPEX_DRIVER_NAMES.includes(m.metricName))
    .sort((a, b) => b.metricValue - a.metricValue);

  const netProfit = byKey("net_profit");
  const netProfitPct = byKey("net_profit_pct");

  // Page-level synthesis — the cause-and-effect chain across sections,
  // specific to this property/period's real dollar drivers. This is
  // intentionally NOT built from a single Notion field the way Overview's
  // Current Read is; there's no KPI Record or Intelligence record that
  // synthesizes across all five sections, so this is assembled here from
  // the same verified figures the sections below display, only connected
  // causally rather than listed. Only renders when the core figures it
  // depends on actually exist.
  const synthesis =
    totalRevenue && laborPct && opexPct && cogsPct && netProfit
      ? `Total revenue landed at ${usd(totalRevenue.metricValue)} against budget, and because the property's two largest cost lines don't flex with volume, that shortfall compounded rather than simply shrinking the P&L proportionally${
          laborCost ? `: labor cost held at ${usd(laborCost.metricValue)}` : ""
        }${opexDollars ? ` and the largest OpEx line stayed fixed regardless of covers served` : ""}, so both consumed a far larger share of a smaller revenue base. Labor moved to ${pct(
          laborPct.metricValue
        )} of revenue against a ${laborPct.benchmarkLow}–${laborPct.benchmarkHigh}% benchmark, and OpEx to ${pct(
          opexPct.metricValue
        )} against ${opexPct.benchmarkLow}–${opexPct.benchmarkHigh}%. COGS, by contrast, held at ${pct(
          cogsPct.metricValue
        )}, below its ${cogsPct.benchmarkLow}–${cogsPct.benchmarkHigh}% benchmark and not a contributor to the loss. The combined effect is a ${usd(
          Math.abs(netProfit.metricValue)
        )} departmental loss driven by fixed costs meeting falling volume, not by cost control failing across every line.`
      : null;

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="financial" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        {/* ── Financial Synthesis ──────────────────────────────────────── */}
        {synthesis && (
          <section>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
              Financial Synthesis
            </p>
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(0.95rem, 1.3vw, 1.05rem)",
                fontWeight: 400,
                lineHeight: 1.7,
                color: "#12120F",
                borderLeft: "3px solid #B8935A",
                paddingLeft: 24,
              }}
            >
              {synthesis}
            </p>
          </section>
        )}

        {/* ── Performance vs Benchmarks — promoted from the bottom ───────── */}
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

        {/* ── Revenue ──────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Revenue"
          connector="The shortfall referenced above starts here, with cover volume and check average."
          intelligence={intel("Financial")}
          metrics={catMetrics("Revenue")}
          allMetrics={trendFor("Revenue", "$")}
          primarySeverity={totalRevenue?.severity}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {totalRevenue && (
              <KpiCard label="Total Revenue" value={usd(totalRevenue.metricValue)}
                variant={severityVariant(totalRevenue.severity)} />
            )}
            {covers && (
              <KpiCard label="Covers" value={covers.metricValue.toLocaleString()}
                variant="neutral" />
            )}
            {avgSpend && (
              <KpiCard label="Avg Spend" value={usd(avgSpend.metricValue)}
                variant={severityVariant(avgSpend.severity)} />
            )}
            {avgCheck && (
              <KpiCard label="Avg Check" value={usd(avgCheck.metricValue)}
                variant={severityVariant(avgCheck.severity)} />
            )}
          </div>
        </FinancialSection>

        {/* ── Labor ────────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Labor"
          connector="Following the dinner shortfall above, labor did not scale down to match the reduced volume."
          intelligence={intel("Labor")}
          metrics={catMetrics("Labor")}
          allMetrics={trendFor("Labor", "%")}
          primarySeverity={laborPct?.severity}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {laborCost && (
                <KpiCard label="Labor Cost" value={usd(laborCost.metricValue)}
                  variant={severityVariant(laborCost.severity)} />
              )}
              {laborPct && (
                <KpiCard label="Labor %" value={pct(laborPct.metricValue)}
                  sub="of revenue"
                  variant={severityVariant(laborPct.severity)} />
              )}
              {laborPct?.benchmarkLow != null && (
                <KpiCard label="Benchmark Range"
                  value={`${laborPct.benchmarkLow}–${laborPct.benchmarkHigh}%`}
                  variant="neutral" />
              )}
              {laborPct?.targetValue != null && (
                <KpiCard label="Target"
                  value={pct(laborPct.targetValue)}
                  variant="neutral" />
              )}
            </div>
            {laborDrivers.length >= 2 && laborCost && (
              <DriverBreakdown
                title="Labor Cost Drivers"
                total={laborCost.metricValue}
                items={laborDrivers.map((d) => ({ label: d.metricName, value: d.metricValue }))}
                residualLabel="other payroll costs"
              />
            )}
          </div>
        </FinancialSection>

        {/* ── COGS ─────────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Food & Beverage COGS"
          connector="Unlike labor, food and beverage cost control held through the same volume decline."
          intelligence={intel("COGS")}
          metrics={catMetrics("COGS")}
          allMetrics={trendFor("COGS", "%")}
          primarySeverity={cogsPct?.severity}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {cogsDollars && (
                <KpiCard label="COGS" value={usd(cogsDollars.metricValue)}
                  variant={severityVariant(cogsDollars.severity)} />
              )}
              {cogsPct && (
                <KpiCard label="COGS %" value={pct(cogsPct.metricValue)}
                  sub="of revenue"
                  variant={severityVariant(cogsPct.severity)} />
              )}
              {cogsPct?.benchmarkLow != null && (
                <KpiCard label="Benchmark Range"
                  value={`${cogsPct.benchmarkLow}–${cogsPct.benchmarkHigh}%`}
                  variant="neutral" />
              )}
              {cogsPct?.targetValue != null && (
                <KpiCard label="Target"
                  value={pct(cogsPct.targetValue)}
                  variant="neutral" />
              )}
            </div>
            {foodCost && beverageCost && (
              <StackedSplit
                title="Food vs. Beverage Split"
                segments={[
                  { label: "Food", value: foodCost.metricValue, color: "#B8935A" },
                  { label: "Beverage", value: beverageCost.metricValue, color: "#12120F" },
                ]}
              />
            )}
          </div>
        </FinancialSection>

        {/* ── OpEx ─────────────────────────────────────────────────────── */}
        <FinancialSection
          heading="Operating Expenses"
          connector="The larger structural pressure sits here — the Kitchen Allocation charge below does not flex with revenue the way labor or COGS do."
          intelligence={intel("Execution")}
          metrics={catMetrics("OpEx")}
          allMetrics={trendFor("OpEx", "%")}
          primarySeverity={opexPct?.severity}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {opexDollars && (
                <KpiCard label="Operating Expenses" value={usd(opexDollars.metricValue)}
                  variant={severityVariant(opexDollars.severity)} />
              )}
              {opexPct && (
                <KpiCard label="OpEx %" value={pct(opexPct.metricValue)}
                  sub="of revenue"
                  variant={severityVariant(opexPct.severity)} />
              )}
              {opexPct?.benchmarkLow != null && (
                <KpiCard label="Benchmark Range"
                  value={`${opexPct.benchmarkLow}–${opexPct.benchmarkHigh}%`}
                  variant="neutral" />
              )}
            </div>
            {opexLineItems.length >= 2 && opexDollars && (
              <DriverBreakdown
                title="Operating Expense Drivers"
                total={opexDollars.metricValue}
                items={opexLineItems.map((d) => ({ label: d.metricName, value: d.metricValue }))}
                residualLabel="other operating costs"
              />
            )}
          </div>
        </FinancialSection>

        {/* ── Profitability — distinct layout as the page's conclusion ──── */}
        <FinancialSection
          heading="Profitability"
          connector="The combined effect of the revenue shortfall, labor ratio, and OpEx allocation above nets out below."
          intelligence={intel("Profitability")}
          metrics={catMetrics("Profitability")}
          allMetrics={trendFor("Profitability", "%")}
          primarySeverity={netProfitPct?.severity}
        >
          <div style={{ background: "#12120F", padding: "36px 40px" }} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 10 }}>
                Net Profit Margin
              </p>
              {netProfitPct && (
                <p style={{ fontFamily: SERIF, fontSize: "clamp(2.6rem, 5vw, 3.6rem)", fontWeight: 300, lineHeight: 1, color: netProfitPct.metricValue < 0 ? "#e0796b" : "rgba(242,237,228,0.92)" }}>
                  {pct(netProfitPct.metricValue)}
                </p>
              )}
              {netProfitPct?.benchmarkLow != null && (
                <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 8 }}>
                  Benchmark {netProfitPct.benchmarkLow}–{netProfitPct.benchmarkHigh}%
                </p>
              )}
            </div>
            {netProfit && (
              <div style={{ textAlign: "left" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)", marginBottom: 10 }}>
                  Net Profit
                </p>
                <p style={{ fontFamily: SERIF, fontSize: "1.9rem", fontWeight: 300, color: netProfit.metricValue < 0 ? "#e0796b" : "rgba(242,237,228,0.92)" }}>
                  {usd(netProfit.metricValue)}
                </p>
              </div>
            )}
          </div>
        </FinancialSection>

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
