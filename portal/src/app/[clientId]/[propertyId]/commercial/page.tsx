import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getKpiMetrics, getIntelligence, getOpportunities } from "@/lib/notion-queries";
import { usd, pct, formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import SubPageHeader from "@/components/SubPageHeader";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import TrendChart, { buildTrendData } from "@/components/TrendChart";
import BenchmarkGauge from "@/components/BenchmarkGauge";
import type { KpiMetric, Intelligence, Opportunity, Severity } from "@/types/portal";

export const runtime = "edge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

function severityCallout(s: Severity): "green" | "amber" | "red" | "gray" {
  if (s === "Healthy") return "green";
  if (s === "Critical" || s === "Action Required") return "red";
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

// ─── Shared section wrapper ───────────────────────────────────────────────────

function CommercialSection({
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
  children: React.ReactNode;
}) {
  const severity = intelligence?.severity ?? (metrics[0]?.severity ?? "Monitor");
  const unit = trendUnit ?? allMetrics[0]?.unit ?? "%";

  return (
    <section className="space-y-4">
      <SectionHeader title={heading} />

      {intelligence?.currentRead ? (
        <CalloutBlock variant={severityCallout(severity)}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p>{intelligence.currentRead}</p>
            <StatusBadge label={severity} variant={severityVariant(severity)} />
          </div>
        </CalloutBlock>
      ) : metrics.length > 0 ? (
        <CalloutBlock variant="gray">
          <p className="text-sm opacity-60 italic">No commentary published for this period.</p>
        </CalloutBlock>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>

      {allMetrics.length >= 2 && (() => {
        const trendData = buildTrendData(allMetrics);
        const bLow = allMetrics[0]?.benchmarkLow;
        const bHigh = allMetrics[0]?.benchmarkHigh;
        return (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest">Trend</p>
            <TrendChart data={trendData} unit={unit} benchmarkLow={bLow} benchmarkHigh={bHigh} color="#7c3aed" />
          </div>
        );
      })()}

      {(intelligence?.whyItMatters || intelligence?.suggestedDecision) && (
        <details className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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
        <details className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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
                        : m.unit === "Rating" ? m.metricValue.toFixed(1)
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

// ─── Opportunities panel ──────────────────────────────────────────────────────

const STAGE_VARIANT: Record<string, "green" | "amber" | "blue" | "gray"> = {
  Identified: "gray",
  "In Progress": "amber",
  Validated: "green",
  Closed: "gray",
};

function OpportunitiesPanel({ opportunities }: { opportunities: Opportunity[] }) {
  if (opportunities.length === 0) return null;
  return (
    <section className="space-y-4">
      <SectionHeader title="Value Creation Opportunities" />
      <div className="grid gap-3 md:grid-cols-2">
        {opportunities.map((opp) => (
          <div key={opp.id} className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-medium text-gray-900 leading-snug">{opp.title}</p>
              <StatusBadge
                label={opp.stage}
                variant={STAGE_VARIANT[opp.stage] ?? "gray"}
              />
            </div>
            {opp.nextStep && (
              <p className="text-xs text-gray-500 leading-relaxed mb-3">Next: {opp.nextStep}</p>
            )}
            {opp.estimatedAnnualImpact != null && (
              <p className="text-xs text-gray-400">
                Est. impact: <span className="font-medium text-gray-700">{usd(opp.estimatedAnnualImpact)} / yr</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Guest experience rating bar ──────────────────────────────────────────────

function RatingBar({ label, value, max = 5 }: { label: string; value: number | null; max?: number }) {
  if (value == null) return null;
  const pctWidth = Math.min(100, (value / max) * 100);
  const color = value / max >= 0.8 ? "bg-green-400" : value / max >= 0.6 ? "bg-amber-400" : "bg-red-400";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-xs font-medium text-gray-900">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pctWidth}%` }} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CommercialPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, allMetrics, allIntelligence, opportunities] = await Promise.all([
    getProperty(propertyId, clientId),
    getKpiMetrics(propertyId),
    getIntelligence(propertyId),
    getOpportunities(propertyId),
  ]);

  if (!property) notFound();

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

  // Guest ratings — all Rating-unit metrics under Guest Experience category
  const guestRatings = catMetrics("Guest Experience").filter((g) => g.unit === "Rating");
  const overallRating = m("Guest Experience", "Rating", "overall") ?? guestRatings[0] ?? null;

  // Covers / reservations — under Revenue or Commercial category
  const coversMetric = m("Revenue", "Count") ?? m("Commercial", "Count");
  const conversionMetric = m("Commercial", "%", "conversion");
  const channelMetrics = catMetrics("Commercial").filter((g) =>
    g.metricName.toLowerCase().includes("channel") ||
    g.metricName.toLowerCase().includes("online") ||
    g.metricName.toLowerCase().includes("direct")
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} />
      <SubPageHeader
        title="Commercial Review"
        property={property}
        period={formatPeriod(latest)}
        clientId={clientId}
        intelligenceCategory="Commercial"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* ── Guest Experience ─────────────────────────────────────────── */}
        <CommercialSection
          heading="Guest Experience"
          intelligence={intel("Guest")}
          metrics={guestRatings}
          allMetrics={trendFor("Guest Experience", "Rating", "overall")}
          trendUnit="Rating"
        >
          {overallRating && (
            <KpiCard
              key="gOverall"
              label="Overall Rating"
              value={overallRating.metricValue.toFixed(1)}
              sub={`/ ${overallRating.benchmarkHigh ?? 5}`}
              variant={severityVariant(overallRating.severity)}
            />
          )}
          {guestRatings
            .filter((g) => !g.metricName.toLowerCase().includes("overall"))
            .slice(0, 3)
            .map((g) => (
              <KpiCard
                key={g.id}
                label={g.metricName || g.kpiRecord}
                value={g.metricValue.toFixed(1)}
                sub={`/ ${g.benchmarkHigh ?? 5}`}
                variant={severityVariant(g.severity)}
              />
            ))}
        </CommercialSection>

        {/* Rating bars — visual breakdown */}
        {guestRatings.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Ratings Breakdown</p>
            {guestRatings.map((g) => (
              <RatingBar
                key={g.id}
                label={g.metricName || g.kpiRecord}
                value={g.metricValue}
                max={g.benchmarkHigh ?? 5}
              />
            ))}
          </div>
        )}

        {/* ── Volume & Conversion ──────────────────────────────────────── */}
        <CommercialSection
          heading="Volume & Conversion"
          intelligence={intel("Commercial")}
          metrics={catMetrics("Commercial")}
          allMetrics={trendFor("Revenue", "Count")}
          trendUnit="Count"
        >
          {coversMetric && (
            <KpiCard
              key="covers"
              label="Covers / Guests"
              value={coversMetric.metricValue.toLocaleString()}
              variant={severityVariant(coversMetric.severity)}
            />
          )}
          {conversionMetric && (
            <KpiCard
              key="conv"
              label="Conversion"
              value={pct(conversionMetric.metricValue)}
              variant={severityVariant(conversionMetric.severity)}
            />
          )}
          {channelMetrics.slice(0, 2).map((c) => (
            <KpiCard
              key={c.id}
              label={c.metricName || c.kpiRecord}
              value={c.unit === "%" ? pct(c.metricValue) : c.unit === "$" ? usd(c.metricValue) : c.metricValue.toLocaleString()}
              variant={severityVariant(c.severity)}
            />
          ))}
        </CommercialSection>

        {/* ── Revenue Drivers ──────────────────────────────────────────── */}
        {catMetrics("Revenue").length > 0 && (
          <CommercialSection
            heading="Revenue Drivers"
            intelligence={intel("Financial")}
            metrics={catMetrics("Revenue")}
            allMetrics={trendFor("Revenue", "$")}
            trendUnit="$"
          >
            {[
              m("Revenue", "$") && (
                <KpiCard key="rev" label="Total Revenue" value={usd(m("Revenue", "$")!.metricValue)}
                  variant={severityVariant(m("Revenue", "$")!.severity)} />
              ),
              m("Revenue", "$", "spend") && (
                <KpiCard key="asp" label="Avg Spend" value={usd(m("Revenue", "$", "spend")!.metricValue)}
                  variant={severityVariant(m("Revenue", "$", "spend")!.severity)} />
              ),
              m("Revenue", "$", "check") && (
                <KpiCard key="avc" label="Avg Check" value={usd(m("Revenue", "$", "check")!.metricValue)}
                  variant={severityVariant(m("Revenue", "$", "check")!.severity)} />
              ),
              m("Revenue", "$", "adr") && (
                <KpiCard key="adr" label="ADR" value={usd(m("Revenue", "$", "adr")!.metricValue)}
                  variant={severityVariant(m("Revenue", "$", "adr")!.severity)} />
              ),
              m("Revenue", "$", "revpar") && (
                <KpiCard key="rev" label="RevPAR" value={usd(m("Revenue", "$", "revpar")!.metricValue)}
                  variant={severityVariant(m("Revenue", "$", "revpar")!.severity)} />
              ),
              m("Revenue", "%", "occupancy") && (
                <KpiCard key="occ" label="Occupancy" value={pct(m("Revenue", "%", "occupancy")!.metricValue)}
                  variant={severityVariant(m("Revenue", "%", "occupancy")!.severity)} />
              ),
            ].filter(Boolean)}
          </CommercialSection>
        )}

        {/* ── Performance vs Benchmarks ────────────────────────────── */}
        {(() => {
          const gaugeMetrics = currentMetrics.filter(
            (met) => met.benchmarkLow != null && met.benchmarkHigh != null
          );
          if (gaugeMetrics.length === 0) return null;
          const HIGHER_BETTER = new Set(["Revenue", "Profitability", "Guest Experience", "Commercial"]);
          return (
            <section className="space-y-4">
              <SectionHeader title="Performance vs Benchmarks" />
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
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

        {/* ── Opportunities ────────────────────────────────────────────── */}
        <OpportunitiesPanel opportunities={opportunities} />

        {/* Empty state */}
        {allMetrics.length === 0 && opportunities.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-400">No commercial data published for this property yet.</p>
            <p className="text-xs text-gray-300 mt-1">Data appears here once uploaded and reviewed by LPP.</p>
          </div>
        )}

      </div>
    </div>
  );
}
