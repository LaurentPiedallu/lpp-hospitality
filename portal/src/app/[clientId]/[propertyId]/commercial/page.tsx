import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getKpiMetrics, getIntelligence, getOpportunities, getLastUpdated } from "@/lib/notion-queries";
import {
  usd, pct, compact, buildTrendData, looksLikeIndividualStaffMetric, findMetricByKey,
  extractIndividualStaffNames, mentionsIndividualStaff,
} from "@/lib/format";
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
import type { KpiMetric, Intelligence, Opportunity, Severity } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

// Rating-unit Guest Experience metrics that duplicate a canonical score
// already shown under its own card (e.g. "Atmosphere Sub-Score" alongside
// the canonical "Atmosphere Score"/guest_ambiance) — kept out of every
// guest-experience display on this page (cards, table, benchmark gauges).
const REDUNDANT_GUEST_METRIC_NAMES = new Set(["Atmosphere Sub-Score", "Food Taste Score"]);

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

// ─── Shared section wrapper ───────────────────────────────────────────────────

function CommercialSection({
  heading,
  intelligence,
  metrics,
  allMetrics,
  trendUnit,
  hideCallout,
  children,
}: {
  heading: string;
  intelligence: Intelligence | null;
  metrics: KpiMetric[];
  allMetrics: KpiMetric[];
  trendUnit?: string;
  hideCallout?: boolean;
  children: React.ReactNode;
}) {
  const severity = intelligence?.severity ?? (metrics[0]?.severity ?? "Monitor");
  const unit = trendUnit ?? allMetrics[0]?.unit ?? "%";

  return (
    <section className="space-y-4">
      <SectionHeader title={heading} />

      {hideCallout ? null : intelligence?.currentRead ? (
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

      {children}

      {allMetrics.length >= 2 && (() => {
        const trendData = buildTrendData(allMetrics);
        const bLow = allMetrics[0]?.benchmarkLow;
        const bHigh = allMetrics[0]?.benchmarkHigh;
        return (
          <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-4">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest">Trend</p>
            <TrendChart data={trendData} unit={unit} benchmarkLow={bLow} benchmarkHigh={bHigh} color="#7c3aed" />
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
          <div key={opp.id} className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-5">
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

// ─── Guest sentiment — overall rating number + theme cards ───────────────────

function GuestSentimentBlock({ overallRating, summary }: { overallRating: KpiMetric | null; summary: string | null }) {
  if (!overallRating) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-6">
      <div style={{ flexShrink: 0 }}>
        <p style={{ fontFamily: SERIF, fontSize: "3rem", fontWeight: 300, color: "#B8935A", lineHeight: 1 }}>
          {overallRating.metricValue.toFixed(1)}
        </p>
        <p style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)", marginTop: 6 }}>
          Average rating
        </p>
      </div>
      {summary && (
        <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.6)", lineHeight: 1.7 }}>{summary}</p>
      )}
    </div>
  );
}

type Sentiment = "Positive" | "Neutral" | "Negative";

function sentimentFromValue(value: number, max: number): Sentiment {
  const ratio = value / max;
  if (ratio >= 0.85) return "Positive";
  if (ratio >= 0.65) return "Neutral";
  return "Negative";
}

const SENTIMENT_STYLE: Record<Sentiment, React.CSSProperties> = {
  Positive: { background: "rgba(18,18,15,0.06)", color: "rgba(18,18,15,0.5)" },
  Neutral: { background: "rgba(184,147,90,0.08)", color: "rgba(184,147,90,0.8)" },
  Negative: { background: "rgba(192,57,43,0.06)", color: "#C0392B" },
};

function ThemeCard({ label, value, max }: { label: string; value: number; max: number }) {
  const sentiment = sentimentFromValue(value, max);
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "20px 24px" }}>
      <h3 style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 400, color: "#12120F", marginBottom: 8 }}>{label}</h3>
      <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.6)", marginBottom: 12 }}>
        {value.toFixed(1)} / {max}
      </p>
      <span
        style={{
          fontFamily: JOST,
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "3px 10px",
          borderRadius: 0,
          ...SENTIMENT_STYLE[sentiment],
        }}
      >
        {sentiment}
      </span>
    </div>
  );
}

// ─── Covers by daypart — demand mix, not budget variance ─────────────────────
// Segments sum exactly to the total covers figure for this property (no
// residual bucket needed).

function DaypartSplit({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 20 }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 16 }}>
        Covers by Daypart
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
              {seg.label} <span style={{ color: "#12120F", fontWeight: 500 }}>{seg.value.toLocaleString()}</span>{" "}
              <span style={{ color: "rgba(18,18,15,0.35)" }}>· {((seg.value / total) * 100).toFixed(0)}%</span>
            </span>
          </div>
        ))}
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

  // Opportunities, scoped to the current reporting period — this panel used
  // to intentionally look across every period ever generated (see the old
  // comment on getOpportunities in notion-queries.ts), which is what let
  // stale March-period opportunities keep showing alongside June's.
  const opportunities = latest ? await getOpportunities(propertyId, latest) : [];

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

  // Individual staff names detected from this property's own KPI Records
  // (see extractIndividualStaffNames in lib/format.ts) — used below to keep
  // Opportunity text (title/Next Step) from naming a staff member even
  // though Opportunities are a separate database from KPI Records and don't
  // go through looksLikeIndividualStaffMetric at all.
  const staffNames = extractIndividualStaffNames(allMetrics);
  const commercialOpportunities = (opportunities as Opportunity[]).filter(
    (o) => !mentionsIndividualStaff(o.title, staffNames) && !mentionsIndividualStaff(o.nextStep, staffNames)
  );

  // Guest ratings — all Rating-unit metrics under Guest Experience category,
  // excluding any record that identifies an individual staff member by name
  // (client-facing page — see looksLikeIndividualStaffMetric in lib/format.ts)
  // and any metric that duplicates a canonical score shown under its own card.
  const guestRatings = catMetrics("Guest Experience")
    .filter((g) => g.unit === "Rating")
    .filter((g) => !looksLikeIndividualStaffMetric(g.metricName || g.kpiRecord))
    .filter((g) => !REDUNDANT_GUEST_METRIC_NAMES.has(g.metricName));
  // Canonical lookup, not a name-hint match — "overall" as a substring hint
  // would also match individually-named records like "Hector T Server
  // Overall Score", surfacing that person's own number under a generic
  // "Average rating" label even without printing their name.
  const overallRating = findMetricByKey(allMetrics, "guest_overall", latest) ?? guestRatings[0] ?? null;

  // Covers — canonical key, scoped to Revenue (the real property-wide total),
  // not a bare category+unit match, which was silently returning whichever
  // Count-unit Revenue record Notion happened to return first (Dinner Covers,
  // 2,400) instead of the actual total (Total Covers / Revenue Customers,
  // 7,040) — same class of bug already fixed on Financial Review.
  const coversMetric = findMetricByKey(allMetrics, "covers", latest, "Revenue");
  const conversionMetric = latestMetric(allMetrics, "Commercial", "%", "conversion");
  const channelMetrics = catMetrics("Commercial").filter((g) =>
    g.metricName.toLowerCase().includes("channel") ||
    g.metricName.toLowerCase().includes("online") ||
    g.metricName.toLowerCase().includes("direct")
  );

  // Covers by daypart — real demand-mix data (not budget variance), moved
  // here from the old "Revenue Drivers" section. Only shown when all three
  // are present; segments sum exactly to coversMetric's total in the real
  // dataset, so no residual bucket is needed.
  const dinnerCovers = catMetrics("Revenue").find((c) => c.metricName === "Dinner Covers") ?? null;
  const lunchCovers = catMetrics("Revenue").find((c) => c.metricName === "Lunch Covers") ?? null;
  const breakfastCovers = catMetrics("Revenue").find((c) => c.metricName === "Breakfast Covers") ?? null;
  const daypartCovers = [breakfastCovers, lunchCovers, dinnerCovers].every((c) => c != null)
    ? [breakfastCovers!, lunchCovers!, dinnerCovers!]
    : null;

  // Average check — canonical key, the same blended figure Financial Review
  // uses (not the "Revenue Drivers" section's old name-hint match, which
  // picked up "Dinner Average Check" instead).
  const avgCheckMetric = findMetricByKey(allMetrics, "avg_check", latest, "Revenue");

  // Page-level synthesis — built from the same verified figures the sections
  // below display, connecting guest-experience strength to the specific
  // revenue-capture gap and the quantified opportunities that follow. Only
  // renders when the figures it depends on actually exist.
  const totalOpportunityValue = commercialOpportunities.reduce((s, o) => s + o.estimatedAnnualImpact, 0);
  const synthesis =
    overallRating && avgCheckMetric?.benchmarkLow != null && totalOpportunityValue > 0
      ? `Guest sentiment remains exceptional at ${overallRating.metricValue.toFixed(1)} out of 100, but that goodwill isn't yet fully converted into revenue: average check of ${usd(avgCheckMetric.metricValue)} trails the ${usd(avgCheckMetric.benchmarkLow)} full-service benchmark floor, and the shortfall traces to volume rather than pricing — dinner, the highest-check daypart, is running well below plan. The opportunities below turn specific, verified guest-experience strengths — near-perfect cleanliness and hospitality scores, high likelihood-to-recommend — into ${compact(totalOpportunityValue)} of identified annual upside, from hotel upsell placement to loyalty conversion and dinner volume recovery.`
      : null;

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="commercial" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        {/* ── Commercial Synthesis ─────────────────────────────────────── */}
        {synthesis && (
          <section>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
              Commercial Synthesis
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

        {/* ── Opportunities — promoted from the bottom ────────────────────── */}
        <OpportunitiesPanel opportunities={commercialOpportunities} />

        {/* ── Guest Experience ─────────────────────────────────────────── */}
        <CommercialSection
          heading="Guest Experience"
          intelligence={intel("Guest")}
          metrics={guestRatings}
          allMetrics={trendFor("Guest Experience", "Rating", "overall")}
          trendUnit="Rating"
          hideCallout
        >
          <GuestSentimentBlock overallRating={overallRating} summary={intel("Guest")?.currentRead ?? null} />

          {guestRatings.filter((g) => !g.metricName.toLowerCase().includes("overall")).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {guestRatings
                .filter((g) => !g.metricName.toLowerCase().includes("overall"))
                .map((g) => (
                  <ThemeCard
                    key={g.id}
                    label={g.metricName || g.kpiRecord}
                    value={g.metricValue}
                    max={g.benchmarkHigh ?? 100}
                  />
                ))}
            </div>
          )}
        </CommercialSection>

        {/* ── Volume & Conversion ──────────────────────────────────────── */}
        <CommercialSection
          heading="Volume & Conversion"
          intelligence={intel("Commercial")}
          metrics={catMetrics("Commercial")}
          allMetrics={trendFor("Revenue", "Count")}
          trendUnit="Count"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          </div>
          {daypartCovers && (
            <DaypartSplit
              segments={[
                { label: "Breakfast", value: daypartCovers[0].metricValue, color: "#B8935A" },
                { label: "Lunch", value: daypartCovers[1].metricValue, color: "#7c3aed" },
                { label: "Dinner", value: daypartCovers[2].metricValue, color: "#12120F" },
              ]}
            />
          )}
        </CommercialSection>

        {/* ── Performance vs Benchmarks — commercial-relevant metrics only ── */}
        {(() => {
          // Guest Experience scores and Revenue-category demand metrics that
          // carry a real (non-placeholder) benchmark range — e.g. the average
          // check variants, benchmarked against $90–$160 full-service NYC
          // comparables. Explicitly excludes Labor, COGS, OpEx, and
          // Profitability regardless of whether a given line item happens to
          // have a benchmark range set, per this page's commercial/guest
          // focus — those belong on Financial Review. Also excludes the raw
          // dollar/count totals under Revenue (Total Revenue, Food Revenue,
          // daypart covers, etc.), which in the real data only ever carry a
          // 0–0 placeholder range rather than a genuine industry comparable.
          const COMMERCIAL_CATEGORIES = new Set(["Guest Experience", "Revenue"]);
          const gaugeMetrics = currentMetrics.filter(
            (met) =>
              met.benchmarkLow != null &&
              met.benchmarkHigh != null &&
              !(met.benchmarkLow === 0 && met.benchmarkHigh === 0) &&
              COMMERCIAL_CATEGORIES.has(met.category) &&
              !looksLikeIndividualStaffMetric(met.metricName || met.kpiRecord) &&
              !REDUNDANT_GUEST_METRIC_NAMES.has(met.metricName)
          );
          if (gaugeMetrics.length === 0) return null;
          const HIGHER_BETTER = new Set(["Revenue", "Guest Experience"]);
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
        {allMetrics.length === 0 && commercialOpportunities.length === 0 && (
          <EmptyState
            title="No guest feedback yet"
            body="Guest feedback synthesis will appear here once review data has been uploaded and processed."
            ctaLabel="Go to Upload →"
            ctaHref={`/${clientId}/${propertyId}/upload`}
          />
        )}

      </div>
    </PageWrapper>
  );
}
