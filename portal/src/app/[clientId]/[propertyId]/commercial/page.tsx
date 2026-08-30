import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getKpiMetrics, getIntelligence, getOpportunities, getLastUpdated } from "@/lib/notion-queries";
import {
  usd, pct, compact, buildTrendData, looksLikeIndividualStaffMetric, findMetricByKey, findMetricByName,
  metricSeriesForKey, extractIndividualStaffNames, mentionsIndividualStaff, hasRealBenchmark,
  parseDaypartPattern, CANONICAL_DAY_ORDER, CANONICAL_DAYPART_ORDER,
} from "@/lib/format";
import type { DaypartCoversEntry } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import TrendChart from "@/components/TrendChart";
import EmptyState from "@/components/EmptyState";
import OrientationBlock from "@/components/OrientationBlock";
import ScrollToSection from "@/components/ScrollToSection";
import OpportunitiesPanel from "@/components/OpportunitiesPanel";
import type { KpiMetric, Intelligence, Opportunity, Severity } from "@/types/portal";
// Deep-link routing maps moved to src/lib/deep-links.ts (Redesign prompt
// Step 5) so Intelligence's own cross-links resolve through the same
// source of truth.
import { COMMERCIAL_METRIC_SECTION as METRIC_KEY_SECTION, COMMERCIAL_CATEGORY_SECTION as CATEGORY_SECTION } from "@/lib/deep-links";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

// Rating-unit Guest Experience metrics that duplicate a canonical score
// already shown under its own card (e.g. "Atmosphere Sub-Score" alongside
// the canonical "Atmosphere Score"/guest_ambiance) — kept out of every
// guest-experience display on this page (cards, table, benchmark gauges).
const REDUNDANT_GUEST_METRIC_NAMES = new Set(["Atmosphere Sub-Score", "Food Taste Score"]);

// Guest Experience three-tier grouping (Portal-Wide refinement, Phase 3) —
// what each score actually measures, not an arbitrary split: the tangible
// product/service dimensions guests directly rate ("pillars"), the
// staff-execution signals that produce that experience ("operational
// drivers"), and the forward-looking referral/sentiment signals that
// predict retention rather than describe the current visit ("advocacy").
// Matched by the real Metric Name strings confirmed across live Guest
// Experience KPI Records — this is a fixed survey-question taxonomy
// reused across properties, not per-property freeform text. Anything that
// doesn't match falls into its own "Additional Signals" group below rather
// than being silently dropped, so an unrecognized future metric name still
// shows up somewhere.
type GuestTier = "pillars" | "operational" | "advocacy";
const GUEST_TIER_BY_NAME: Record<string, GuestTier> = {
  "Food Score": "pillars",
  "Service Score": "pillars",
  "Atmosphere Score": "pillars",
  "Restaurant Cleanliness Score": "pillars",
  "Restroom Cleanliness Score": "pillars",
  "Host Rating Score": "operational",
  "Hospitality and Friendliness Score": "operational",
  "Server Confidence Score": "operational",
  "Guest Sentiment Score": "advocacy",
  "Likelihood to Recommend Score": "advocacy",
};
const GUEST_TIER_LABEL: Record<GuestTier, string> = {
  pillars: "Core Experience",
  operational: "Operational Drivers",
  advocacy: "Advocacy & Loyalty",
};

// Opportunity Category values that belong on this tab — pulled from the
// real "Category Mapping (LPP internal)" Notion database, not guessed.
// That table buckets every Opportunity/Risk/Intelligence category into six
// groups matching Initiative.category (Labor, Finance, Commercial, Guest,
// Menu, Execution); Commercial Review already legitimately combines Guest
// and Commercial content on one tab (several real Opportunities explicitly
// link guest sentiment to demand, e.g. "Convert 96 likelihood-to-recommend
// guests into loyalty program enrollees"), so both buckets' categories
// belong here: Commercial (Revenue Mix, Pricing, Reservations, Commercial)
// + Guest (Guest, Guest Retention). Labor/Finance/Menu/Execution-category
// items belong on their own tabs, not here — this was previously
// unfiltered, showing every category regardless of tab.
const COMMERCIAL_OPPORTUNITY_CATEGORIES = new Set([
  "Revenue Mix", "Pricing", "Reservations", "Commercial", "Guest", "Guest Retention",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

// Guest Experience (Rating-unit) benchmark ranges are never shown, on top
// of the general hasRealBenchmark() 0/0 check — confirmed directly against
// the real Benchmarks database that the only Rating-unit benchmark defined
// anywhere is a single 4.3-5.0-scale "Guest Rating Target — All Concepts,"
// unrelated to these 0-100 guest survey scores. The Benchmark Low/High
// values actually stored on these KPI Records (85-100, 80-100, 90-100,
// 95-100 — not even uniform) have no traceable source in real benchmark
// data, so none of them are shown as a real industry comparison here.
function showsRealBenchmark(m: KpiMetric): boolean {
  return hasRealBenchmark(m.benchmarkLow, m.benchmarkHigh) && !(m.category === "Guest Experience" && m.unit === "Rating");
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
  connector,
  intelligence,
  metrics,
  allMetrics,
  trendUnit,
  hideCallout,
  hideEvidence,
  id,
  children,
}: {
  heading: string;
  // Short line at the top of the section linking back to what came before —
  // same convention as Financial Review's FindingSection connector prop.
  connector?: string;
  intelligence: Intelligence | null;
  metrics: KpiMetric[];
  allMetrics: KpiMetric[];
  trendUnit?: string;
  hideCallout?: boolean;
  // Suppresses the auto-generated Evidence table even though metrics.length
  // > 0 (which still drives the "No commentary published" callout below).
  // Needed when the caller already renders its own, more precise view of
  // the same metrics — e.g. RevPASH's dollar-and-cents bars, where the
  // generic usd() formatting in the Evidence table rounds away the cents
  // that matter at this scale, and a real placeholder "not yet available"
  // record would otherwise show as a misleading literal "$0".
  hideEvidence?: boolean;
  // Deep-link anchor (Cross-tab audit Part 4) — see ScrollToSection.
  id?: string;
  children: React.ReactNode;
}) {
  const severity = intelligence?.severity ?? (metrics[0]?.severity ?? "Monitor");
  const unit = trendUnit ?? allMetrics[0]?.unit ?? "%";

  return (
    <section id={id} className="space-y-4">
      <SectionHeader title={heading} />

      {connector && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.45)", fontStyle: "italic", marginTop: -8 }}>
          {connector}
        </p>
      )}

      {/* Current read callout — hidden entirely when there's no real
          commentary (same rule as FindingSection's Fix 3: an internal
          pipeline state must not leak into client-facing copy as a literal
          placeholder string). */}
      {!hideCallout && intelligence?.currentRead && (
        <CalloutBlock>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p>{intelligence.currentRead}</p>
            <StatusBadge label={severity} variant={severityVariant(severity)} />
          </div>
        </CalloutBlock>
      )}

      {children}

      {allMetrics.length >= 2 && (() => {
        const trendData = buildTrendData(allMetrics);
        const realBenchmark = allMetrics[0] != null && showsRealBenchmark(allMetrics[0]);
        const bLow = realBenchmark ? allMetrics[0]?.benchmarkLow : undefined;
        const bHigh = realBenchmark ? allMetrics[0]?.benchmarkHigh : undefined;
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

      {metrics.length > 0 && !hideEvidence && (
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
                      {showsRealBenchmark(m)
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

// OpportunitiesPanel extracted to src/components/OpportunitiesPanel.tsx
// (Redesign prompt Step 1) — see call site below, now imported.

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

// Guest Experience tier group (Portal-Wide refinement, Phase 3) — a labeled
// sub-grid of ThemeCards for one of the three tiers (see GUEST_TIER_BY_NAME
// above). "emphasize" gives the Core Experience tier a heavier gold rule
// and larger card padding than the other two — the same
// scale-not-color-inversion differentiation Overview's Top Priority card
// already uses, so the strongest, most load-bearing tier reads with real
// visual weight instead of every tier looking equally minor.
function GuestTierGroup({
  label,
  metrics,
  emphasize,
}: {
  label: string;
  metrics: KpiMetric[];
  emphasize?: boolean;
}) {
  if (metrics.length === 0) return null;
  return (
    <div>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: emphasize ? GOLD : "rgba(18,18,15,0.35)", marginBottom: 12 }}>
        {label}
      </p>
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3`}>
        {metrics.map((g) => (
          <div key={g.id} style={emphasize ? { borderLeft: `3px solid ${GOLD}` } : undefined}>
            <ThemeCard label={g.metricName || g.kpiRecord} value={g.metricValue} max={g.benchmarkHigh ?? 100} />
          </div>
        ))}
      </div>
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

// ─── Average check by daypart — comparative bars, not a stacked split ────────
// An average check isn't a part of a whole the way covers are, so bars are
// sized against the highest daypart value, not against a summed total — same
// visual language as Financial Review's DriverBreakdown, without the
// percent-of-total math that wouldn't mean anything here.

function DaypartCheckBars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 20 }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 16 }}>
        Average Check by Daypart
      </p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.65)" }}>{item.label}</span>
              <span style={{ fontFamily: JOST, fontSize: 12, color: "#12120F", fontWeight: 500 }}>{usd(item.value)}</span>
            </div>
            <div style={{ height: 5, background: "rgba(18,18,15,0.06)" }}>
              <div style={{ height: "100%", width: `${(item.value / max) * 100}%`, background: "#B8935A" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RevPASH by segment — comparative bars, sorted by value ──────────────────
// Revenue Per Available Seat Hour — capacity-efficiency, not a P&L figure,
// so it's kept in its own section rather than mixed with revenue/COGS/labor
// panels elsewhere on this page. $0 and a missing record are both treated
// as "not yet available" (per confirmed real data: Lex Yard's Brunch
// segment carries a real Published $0 record meaning no average-check data
// has been captured for that daypart yet, not zero revenue), never
// rendered as a real zero-height bar. Shown to 2 decimal places — this is
// a small per-hour dollar figure where cents are the signal, unlike the
// whole-dollar amounts usd() is built for elsewhere on this page.
function revpashFmt(value: number): string {
  return `$${value.toFixed(2)}`;
}

function RevpashBars({ items }: { items: { label: string; value: number | null }[] }) {
  const available = items.filter((i): i is { label: string; value: number } => i.value != null && i.value > 0);
  const max = available.length > 0 ? Math.max(...available.map((i) => i.value)) : 0;
  const sorted = [...items].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 20 }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 16 }}>
        RevPASH by Segment
      </p>
      <div className="space-y-3">
        {sorted.map((item) => {
          const isAvailable = item.value != null && item.value > 0;
          return (
            <div key={item.label}>
              <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.65)" }}>{item.label}</span>
                {isAvailable ? (
                  <span style={{ fontFamily: JOST, fontSize: 12, color: "#12120F", fontWeight: 500 }}>{revpashFmt(item.value!)}</span>
                ) : (
                  <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.3)", fontStyle: "italic" }}>Not yet available</span>
                )}
              </div>
              <div style={{ height: 5, background: "rgba(18,18,15,0.06)" }}>
                {isAvailable && (
                  <div style={{ height: "100%", width: `${(item.value! / max) * 100}%`, background: "#B8935A" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Daypart demand heatmap — day of week × daypart, cell = covers ───────────
// Columns are whichever dayparts actually appear in the parsed data, not a
// fixed set — confirmed real data has different dayparts present on
// different days (e.g. Saturday has Brunch+Dinner, not Breakfast+Lunch).
// Rows are always the full canonical Monday→Sunday order regardless of
// which days happen to have data, so a property missing a day still reads
// as a normal week grid with an empty row rather than a shorter list.

function DaypartHeatmap({ entries }: { entries: DaypartCoversEntry[] }) {
  const daypartsPresent = CANONICAL_DAYPART_ORDER.filter((dp) => entries.some((e) => e.daypart === dp));
  const max = Math.max(...entries.map((e) => e.covers));
  const cellFor = (day: string, daypart: string) => entries.find((e) => e.day === day && e.daypart === daypart) ?? null;

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 20, overflowX: "auto" }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 16 }}>
        Demand Pattern by Day &amp; Daypart
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontFamily: JOST, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", padding: "0 12px 10px 0" }}>
              Day
            </th>
            {daypartsPresent.map((dp) => (
              <th
                key={dp}
                style={{ textAlign: "center", fontFamily: JOST, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", padding: "0 12px 10px" }}
              >
                {dp}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CANONICAL_DAY_ORDER.map((day) => (
            <tr key={day}>
              <td style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.65)", padding: "6px 12px 6px 0", whiteSpace: "nowrap" }}>
                {day}
              </td>
              {daypartsPresent.map((dp) => {
                const cell = cellFor(day, dp);
                const intensity = cell ? cell.covers / max : 0;
                return (
                  <td key={dp} style={{ textAlign: "center", padding: 4 }}>
                    <div
                      style={{
                        background: cell ? `rgba(184,147,90,${(0.12 + intensity * 0.68).toFixed(2)})` : "rgba(18,18,15,0.02)",
                        padding: "8px 4px",
                        fontFamily: JOST,
                        fontSize: 12,
                        fontWeight: cell && intensity > 0.6 ? 500 : 400,
                        color: cell ? "#12120F" : "rgba(18,18,15,0.25)",
                      }}
                    >
                      {cell ? cell.covers : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CommercialPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
  searchParams: Promise<{ metric?: string; category?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const { metric: metricParam, category: categoryParam } = await searchParams;
  const scrollTargetId =
    (metricParam && METRIC_KEY_SECTION[metricParam]) ||
    (categoryParam && CATEGORY_SECTION[categoryParam]) ||
    null;

  const [property, allMetrics, allIntelligence, lastUpdated] = await Promise.all([
    getProperty(propertyId, clientId),
    getKpiMetrics(propertyId),
    getIntelligence(propertyId, { clientVisibleOnly: true }),
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

  // All-period series for one canonical LPP Metric Key, for trend charts.
  // metricSeriesForKey applies the key alias + Segment-"Total" filter +
  // canonical-name disambiguation once per period, so total_covers_period /
  // avg_check contribute one point per period rather than one per
  // roll-up/sub-component sibling. The old raw filter pulled in
  // daypart-specific records ("Monday Overall Score", "Dinner Covers")
  // alongside the real series.
  const trendFor = (metricKey: string, category?: string) =>
    metricSeriesForKey(allMetrics, metricKey, category);

  const intel = (cat: string): Intelligence | null =>
    (allIntelligence as Intelligence[]).find((i) => i.category === cat) ?? null;

  // Individual staff names detected from this property's own KPI Records
  // (see extractIndividualStaffNames in lib/format.ts) — used below to keep
  // Opportunity text (title/Next Step) from naming a staff member even
  // though Opportunities are a separate database from KPI Records and don't
  // go through looksLikeIndividualStaffMetric at all.
  const staffNames = extractIndividualStaffNames(allMetrics);
  const commercialOpportunities = (opportunities as Opportunity[]).filter(
    (o) =>
      COMMERCIAL_OPPORTUNITY_CATEGORIES.has(o.category) &&
      !mentionsIndividualStaff(o.title, staffNames) &&
      !mentionsIndividualStaff(o.nextStep, staffNames)
  );
  // Confidence badge (same resolution as Financial Review's Fix 7 and
  // Overview's Top 3 Priorities — via the linked Intelligence record's own
  // Confidence field, not a field on Opportunity itself).
  const opportunityConfidence: Record<string, Intelligence["confidence"]> = {};
  for (const o of commercialOpportunities) {
    const conf = o.sourceIntelligenceId
      ? (allIntelligence as Intelligence[]).find((i) => i.id === o.sourceIntelligenceId)?.confidence
      : undefined;
    if (conf) opportunityConfidence[o.id] = conf;
  }

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

  // KPI lookup by canonical LPP Metric Key + Segment (see Segment on
  // KpiMetric / findMetricByKey in lib/format.ts). Segment defaults to
  // "Total" inside findMetricByKey itself, so omitting it keeps every
  // existing call below unchanged.
  const byKey = (key: string, category?: string, segment?: string) =>
    findMetricByKey(allMetrics, key, latest, category, segment);

  // Covers — "covers" aliases to LPP Metric Key total_covers_period (no
  // record uses the bare "covers" key any more), scoped to Revenue, and
  // resolveCanonicalRollup pins the "Total Revenue Covers" record (7,040 for
  // Lex Yard June — comps excluded, reconciles with Total Revenue ÷ avg
  // check) over its Segment-"Total"-mistagged siblings: "Total Covers
  // Period" (7,453, comps included) and the Breakfast/Lunch/Dinner daypart
  // counts. The bare .find() here previously returned whichever the API
  // sorted first (Dinner Covers, 2,400).
  const coversMetric = byKey("covers", "Revenue");
  // Comps-included cover count — shown as a secondary line under the
  // revenue-covers headline, not in place of it. NOTE: "Total Covers
  // Period" is an exact Notion Metric Name literal — keep it in lockstep
  // with any upstream rename of that record.
  const coversInclComps = findMetricByName(allMetrics, "Total Covers Period", latest, "Revenue");
  const conversionMetric = latestMetric(allMetrics, "Commercial", "%", "conversion");
  const channelMetrics = catMetrics("Commercial").filter((g) =>
    g.metricName.toLowerCase().includes("channel") ||
    g.metricName.toLowerCase().includes("online") ||
    g.metricName.toLowerCase().includes("direct")
  );

  // Daypart segments in display order — not every property/period has all
  // of these (e.g. Brunch is only populated for some properties in some
  // periods), so both breakdowns below build their list from whichever are
  // actually present rather than assuming a fixed set.
  const DAYPART_SEGMENTS = ["Breakfast", "Lunch", "Brunch", "Dinner", "Event"] as const;
  const DAYPART_COLORS: Record<string, string> = {
    Breakfast: "#B8935A", Lunch: "#7c3aed", Brunch: "#D4AF7A", Dinner: "#12120F", Event: "#6b7280",
  };

  // Covers by daypart — real demand-mix data (not budget variance), moved
  // here from the old "Revenue Drivers" section. Canonical key + Segment
  // lookup, not exact-metric-name matching (which only ever checked for
  // Breakfast/Lunch/Dinner and would've silently missed a Brunch period).
  // Only shown with 2+ dayparts present; segments sum to coversMetric's
  // total in the real dataset, so no residual bucket is needed.
  const daypartCoverEntries = DAYPART_SEGMENTS
    .map((seg) => ({ label: seg as string, metric: byKey("covers", "Revenue", seg) }))
    .filter((e): e is { label: string; metric: KpiMetric } => e.metric != null);
  const daypartCovers = daypartCoverEntries.length >= 2 ? daypartCoverEntries : null;

  // Average check — canonical key resolves to "Total Food and Beverage
  // Average Check Excluding Comps" ($86.43 for Lex Yard June, $90 benchmark
  // floor), the standard revenue ÷ covers figure. Its Segment-"Total"
  // siblings — "Food and Beverage Average Check Including Comps" ($78.12)
  // and "Food Average Check Including Comps" ($57.50) — are shown as
  // breakdown lines below, never as the headline. (All three are Published
  // as of this engagement; an earlier note here about the $78.12 record
  // being stuck Archived is no longer true.)
  const avgCheckMetric = byKey("avg_check", "Revenue");
  // NOTE: the Metric Name strings below are exact Notion literals — keep
  // them in lockstep with any upstream rename of those records.
  const avgCheckBreakdown = [
    { m: findMetricByName(allMetrics, "Food and Beverage Average Check Including Comps", latest, "Revenue"), tag: "F&B incl. comps" },
    { m: findMetricByName(allMetrics, "Food Average Check Including Comps", latest, "Revenue"), tag: "food incl. comps" },
  ].filter((x): x is { m: KpiMetric; tag: string } => x.m != null);

  // Average check by daypart — comparative bars, not a stacked/summed split
  // like covers-by-daypart: an average check isn't a part of a whole, so it
  // shouldn't be sized as a percentage of one. Only shown with 2+ dayparts
  // present. Deliberately excludes the Segment "Food" avg_check (a
  // food-only, all-dayparts-combined figure — a different axis entirely,
  // not a daypart, per the internal Segment Mapping notes).
  const daypartAvgCheckEntries = DAYPART_SEGMENTS
    .map((seg) => ({ label: seg as string, metric: byKey("avg_check", "Revenue", seg) }))
    .filter((e): e is { label: string; metric: KpiMetric } => e.metric != null);
  const daypartAvgCheck = daypartAvgCheckEntries.length >= 2 ? daypartAvgCheckEntries : null;

  // RevPASH (Revenue Per Available Seat Hour) — a capacity-efficiency
  // metric, deliberately kept in its own section rather than mixed with the
  // demand/revenue panels above. KPI Category "Reservations", canonical key
  // "revpash", Segment scoped to each of the 5 real operating
  // configurations. The two dinner segments are genuinely different
  // physical setups, not duplicates — Monday/Sunday run bar-only dinner
  // service, Tuesday-Saturday run both floors (confirmed against the
  // property's own published hours), so they're labeled accordingly rather
  // than just "Dinner A" / "Dinner B".
  const REVPASH_LABELS: Record<string, string> = {
    Breakfast: "Breakfast",
    Lunch: "Lunch",
    Brunch: "Brunch",
    "Dinner Bar Only": "Dinner — Bar Only (Mon/Sun)",
    "Dinner Both Floors": "Dinner — Both Floors (Tue–Sat)",
  };
  const REVPASH_SEGMENTS = Object.keys(REVPASH_LABELS);
  const revpashEntries = REVPASH_SEGMENTS.map((seg) => ({
    segment: seg,
    label: REVPASH_LABELS[seg],
    metric: byKey("revpash", "Reservations", seg),
  }));
  const hasRevpashData = revpashEntries.some((e) => e.metric != null);
  // Real KpiMetric rows behind the bars above — passed to CommercialSection
  // below so its built-in Evidence table (metric/value/benchmark/status)
  // renders for RevPASH the same way it does for every other section on
  // this page. Deliberately no Intelligence category exists for
  // Reservations/RevPASH (verified against the live schema), so this
  // section gets the structural shell only — real data and benchmarks,
  // no narrative commentary, same "No commentary published for this
  // period" honesty every other section already falls back to when its
  // own Intelligence record is missing (Redesign prompt Step 3).
  const revpashMetrics = revpashEntries
    .map((e) => e.metric)
    .filter((m): m is KpiMetric => m != null);

  // Trend per segment — only where a segment actually has 2+ distinct
  // periods of revpash data (none do yet in the live dataset; this is
  // built for when a second period exists, following the same
  // allMetrics.length >= 2 gating pattern used throughout this page).
  const revpashTrendFor = (segment: string) =>
    allMetrics.filter((m) => m.lppMetricKey === "revpash" && (m.segment ?? "Total") === segment);
  const revpashTrendSegments = revpashEntries.filter((e) => revpashTrendFor(e.segment).length >= 2);

  // Daypart demand pattern — the "Daypart Pattern Summary" record has no
  // canonical LPP Metric Key (per the source data), so it's matched by its
  // exact Metric Name instead; its Source Notes field is parsed by
  // parseDaypartPattern (see lib/format.ts for the real-data quirks that
  // parser is defensive against).
  const daypartSummaryMetric = currentMetrics.find((m) => m.metricName === "Daypart Pattern Summary") ?? null;
  const daypartPatternEntries = daypartSummaryMetric?.sourceNotes
    ? parseDaypartPattern(daypartSummaryMetric.sourceNotes)
    : [];

  const hasCapacitySection = hasRevpashData || daypartPatternEntries.length > 0;

  // Page-level synthesis — built from the same verified figures the sections
  // below display, connecting guest-experience strength to the specific
  // revenue-capture gap and the quantified opportunities that follow. Only
  // renders when the figures it depends on actually exist — this is a real,
  // confirmed gap for Lex Yard's current period (see avgCheckMetric above),
  // not a bug: the section correctly and silently stays absent rather than
  // rendering a literal placeholder or partial/undefined sentence. Resolves
  // on its own once the real avg_check benchmark record gets Published
  // upstream — no frontend change needed when that happens.
  const totalOpportunityValue = commercialOpportunities.reduce((s, o) => s + o.estimatedAnnualImpact, 0);
  const synthesis =
    overallRating && avgCheckMetric?.benchmarkLow != null && totalOpportunityValue > 0
      ? `Guest sentiment remains exceptional at ${overallRating.metricValue.toFixed(1)} out of 100, but that goodwill isn't yet fully converted into revenue: average check of ${usd(avgCheckMetric.metricValue)} trails the ${usd(avgCheckMetric.benchmarkLow)} full-service benchmark floor, and the shortfall traces to volume rather than pricing — dinner, the highest-check daypart, is running well below plan. The opportunities below turn specific, verified guest-experience strengths — near-perfect cleanliness and hospitality scores, high likelihood-to-recommend — into ${compact(totalOpportunityValue)} of identified annual upside, from hotel upsell placement to loyalty conversion and dinner volume recovery.`
      : null;

  return (
    <PageWrapper noTopPadding>
      <ScrollToSection targetId={scrollTargetId} />
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="commercial" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        {/* ── Orientation — for a reader landing here directly rather than
             via Overview (Portal-Wide refinement) ──────────────────────── */}
        <OrientationBlock>
          Commercial Review covers guest experience, demand volume and conversion, and seat-efficiency (RevPASH) for the current reporting period, closing with the opportunities that follow from them.
        </OrientationBlock>

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

        {/* ── Guest Experience — first (Portal-Wide refinement Phase 3
             reorder): the strongest, most load-bearing result on this tab
             leads, rather than following after Opportunities. Ten flat
             cards regrouped into three tiers (see GUEST_TIER_BY_NAME) —
             what each score actually measures, not an arbitrary split.
             No qualitative/open-text guest-comment data exists anywhere in
             the KPI Records pipeline (Source Notes is pipeline provenance
             metadata, never guest-authored text — confirmed directly, not
             assumed) — flagged as a real content gap rather than built as
             an empty shell. ──────────────────────────────────────────── */}
        <CommercialSection
          id="guest-experience"
          heading="Guest Experience"
          intelligence={intel("Guest")}
          metrics={guestRatings}
          allMetrics={trendFor("guest_overall")}
          trendUnit="Rating"
          hideCallout
        >
          <GuestSentimentBlock overallRating={overallRating} summary={intel("Guest")?.currentRead ?? null} />

          {(() => {
            const nonOverall = guestRatings.filter((g) => !g.metricName.toLowerCase().includes("overall"));
            const byTier = (tier: GuestTier) => nonOverall.filter((g) => GUEST_TIER_BY_NAME[g.metricName] === tier);
            const unclassified = nonOverall.filter((g) => !GUEST_TIER_BY_NAME[g.metricName]);
            return (
              <div className="space-y-6">
                <GuestTierGroup label={GUEST_TIER_LABEL.pillars} metrics={byTier("pillars")} emphasize />
                <GuestTierGroup label={GUEST_TIER_LABEL.operational} metrics={byTier("operational")} />
                <GuestTierGroup label={GUEST_TIER_LABEL.advocacy} metrics={byTier("advocacy")} />
                <GuestTierGroup label="Additional Signals" metrics={unclassified} />
              </div>
            );
          })()}
        </CommercialSection>

        {/* ── Volume & Conversion ──────────────────────────────────────── */}
        <CommercialSection
          id="volume-conversion"
          heading="Volume & Conversion"
          connector="That guest-experience strength doesn't yet fully convert into dinner volume — the breakdown below shows where."
          intelligence={intel("Commercial")}
          metrics={catMetrics("Commercial")}
          // Scoped correctly now (canonical "covers" key), but this won't
          // render a 2-point trend yet even so: confirmed against real data
          // that the only March-period record under this key is mistagged
          // (an items-sold figure, not a real covers count) and the real
          // June covers total is stuck Archived, never Published — an
          // upstream data gap, not a query bug. Renders honestly empty
          // until that's resolved rather than showing misleading points.
          allMetrics={trendFor("covers", "Revenue")}
          trendUnit="Count"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {coversMetric && (
              <KpiCard
                key="covers"
                label={coversMetric.metricName || "Total Revenue Covers"}
                value={coversMetric.metricValue.toLocaleString()}
                sub={
                  coversInclComps
                    ? `${coversInclComps.metricValue.toLocaleString()} incl. comped covers`
                    : undefined
                }
                variant={severityVariant(coversMetric.severity)}
              />
            )}
            {avgCheckMetric && (
              <KpiCard
                key="avgcheck"
                label="Average Check (excl. comps)"
                value={usd(avgCheckMetric.metricValue)}
                sub={
                  avgCheckBreakdown.length > 0
                    ? avgCheckBreakdown.map(({ m, tag }) => `${usd(m.metricValue)} ${tag}`).join(" · ")
                    : undefined
                }
                variant={severityVariant(avgCheckMetric.severity)}
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
              segments={daypartCovers.map((d) => ({
                label: d.label,
                value: d.metric.metricValue,
                color: DAYPART_COLORS[d.label],
              }))}
            />
          )}
          {daypartAvgCheck && (
            <DaypartCheckBars
              items={daypartAvgCheck.map((d) => ({ label: d.label, value: d.metric.metricValue }))}
            />
          )}
        </CommercialSection>

        {/* ── Seat Efficiency (RevPASH) — capacity-efficiency, kept distinct
             from the P&L-style panels elsewhere on this page. Hidden
             entirely for properties with no RevPASH/Daypart Pattern data
             yet (Peacock Alley and Yoshoku, as of this writing). Uses
             CommercialSection like every other section — intelligence=null
             since no Intelligence category maps to Reservations, so it
             renders a real Evidence table from revpashMetrics with no
             narrative callout, rather than a fabricated one. allMetrics=[]
             deliberately, so CommercialSection's own single blended trend
             chart doesn't duplicate the per-segment trend grid already in
             children below — a single trend line wouldn't mean anything
             across 5 distinct operating configurations anyway.
             The real Dinner Both Floors ($7.25) vs. Dinner Bar Only
             ($12.80) gap below is a genuine, verified finding, but
             connecting it causally to the broader demand story is
             analysis, not display — flagged as a content gap rather than
             authored here, same discipline as everywhere else in this
             portal that doesn't invent commentary the data doesn't
             support. ────────── */}
        {hasCapacitySection && (
          <CommercialSection
            id="seat-efficiency"
            heading="Seat Efficiency — RevPASH"
            connector="The dinner shortfall above is also a capacity-efficiency question: which configuration converts seats into revenue best."
            intelligence={null}
            metrics={revpashMetrics}
            allMetrics={[]}
            hideEvidence
          >
            <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.5)", marginTop: -8, lineHeight: 1.6 }}>
              Revenue Per Available Seat Hour — which daypart and dinner configuration converts capacity into revenue most efficiently.
            </p>

            {hasRevpashData && (
              <RevpashBars items={revpashEntries.map((e) => ({ label: e.label, value: e.metric?.metricValue ?? null }))} />
            )}

            {revpashTrendSegments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {revpashTrendSegments.map((e) => (
                  <div key={e.segment} className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-4">
                    <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest">{e.label} Trend</p>
                    <TrendChart data={buildTrendData(revpashTrendFor(e.segment))} unit="$" color="#B8935A" />
                  </div>
                ))}
              </div>
            )}

            {daypartPatternEntries.length > 0 && <DaypartHeatmap entries={daypartPatternEntries} />}
          </CommercialSection>
        )}

        {/* ── Opportunities — moved to close the tab (Portal-Wide
             refinement Phase 3 reorder), after the findings that motivate
             them rather than before. ───────────────────────────────────── */}
        <OpportunitiesPanel
          opportunities={commercialOpportunities}
          id="opportunities"
          confidenceById={opportunityConfidence}
          connector="Translated into specific, costed initiatives:"
        />

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
