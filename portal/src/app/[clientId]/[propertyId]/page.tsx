import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getProperty, getLatestKpiSummary, getKpiMetrics, getActions,
  getOpportunities, getRisks, getIntelligence, hasUnpublishedFinancialData,
  getPublishedBriefs,
} from "@/lib/notion-queries";
import { deriveHealth } from "@/lib/health";
import { usd, pct, compact, formatPeriod, splitIntoParagraphs, parseTextLines, maxIso, findMetricByKey } from "@/lib/format";
import { selectTopPriorities, type TopPriority } from "@/lib/priorities";
import { PRIORITY_TAB_BY_CATEGORY, INTEL_CATEGORY_TAB } from "@/lib/deep-links";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import CollapsibleOnMobile from "@/components/CollapsibleOnMobile";
import StrategicRiskBlock from "@/components/StrategicRiskBlock";
import Sparkline from "@/components/Sparkline";
import type { Action, Opportunity, Intelligence, KpiMetric, DataConfidence } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

// Financial Snapshot caption — same weight/size as the existing sub-stat
// line (e.g. "175 covers"). Wraps to as many lines as the sentence needs;
// no clamp or truncation, since these are single sentences where the
// clipped-off tail (often the number that makes it meaningful) is the
// whole point of the caption.
const captionStyle: React.CSSProperties = {
  fontFamily: JOST,
  fontSize: 11,
  color: "rgba(18,18,15,0.45)",
  marginTop: 6,
  lineHeight: 1.4,
};

// Phase 7 polish: ~20% tighter than the prior 53px section rhythm (which
// was itself ~10% looser than an even earlier 48px baseline). This is the
// single lever for spacing between major sections — every section below
// derives its inter-section gap from this one constant (or, for the Top
// Priority hero's tighter gap to items #2-3 immediately below it, from
// HERO_CLUSTER_GAP, scaled by the same ratio) rather than each section
// carrying its own hand-picked margin, so tightening happens consistently
// in one place, not section-by-section.
const SECTION_GAP = 42;
const HERO_CLUSTER_GAP = 16;

// Confidence badge variant mapping — reuses the shared StatusBadge component
// rather than inventing a parallel badge style for this one field.
const CONFIDENCE_VARIANT: Record<DataConfidence, "green" | "amber" | "red" | "gray"> = {
  High: "green",
  Medium: "amber",
  Low: "red",
  "Requires Validation": "gray",
};

// Strategic Risk (renamed from Emerging Risk, Overview refinement Fix 3;
// selection logic unchanged) — a genuine "not yet critical, but worth
// watching" signal, not a hardcoded Guest Commentary pick. Prefers
// Severity=Monitor (the existing field that already conceptually matches
// "not yet critical, but could become one") across every Intelligence
// Category, not just Guest; the highest Estimated Monthly Impact breaks a
// tie among multiple Monitor records, most-recently-touched breaking a
// further tie. Falls back to the lowest-impact Action Required record when
// no Monitor-severity record exists for the period — a real, confirmed
// case (Lex Yard's June Published Intelligence has zero Monitor-severity
// records) — so the section stays populated with a genuine finding rather
// than going empty, while still reading as a step down in urgency from
// what's already covered earlier on the page (Top 3 Priorities). Returns
// null if nothing qualifies even under the fallback, so the section can
// hide entirely rather than show a placeholder.
//
// Content note: checked every Published Intelligence record for Lex
// Yard's current period directly against Notion — none match the frozen
// spec's Strategic Risks framing (dinner demand deteriorating despite
// rising guest scores, labor structurally outpacing revenue, growing
// breakfast dependence). The record this function currently selects is
// still tactical daypart-score content ("Sunday scores lowest..."). That's
// a genuine upstream content gap, not a bug in this selection logic — the
// visual treatment below is built and ready, the content itself needs to
// be regenerated upstream before this section reads as intended.
function selectStrategicRisk(records: Intelligence[], period: string | null): Intelligence | null {
  const current = records.filter((i) => i.periodStart === period);

  const byImpactThenRecency = (dir: 1 | -1) => (a: Intelligence, b: Intelligence) =>
    b.estimatedMonthlyImpact !== a.estimatedMonthlyImpact
      ? dir * (b.estimatedMonthlyImpact - a.estimatedMonthlyImpact)
      : (b.processedAt ?? "").localeCompare(a.processedAt ?? "");

  const monitor = current.filter((i) => i.severity === "Monitor");
  if (monitor.length > 0) {
    return [...monitor].sort(byImpactThenRecency(1))[0]; // highest impact first
  }

  const actionRequired = current.filter((i) => i.severity === "Action Required");
  if (actionRequired.length > 0) {
    return [...actionRequired].sort(byImpactThenRecency(-1))[0]; // lowest impact first
  }

  return null;
}

function PrimarySectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{ fontFamily: SERIF, fontSize: "1.9rem", fontWeight: 400, color: "#12120F", marginBottom: 24 }}>
      {title}
    </h2>
  );
}

// Shared trend-arrow treatment — used by the compact delta strip, Since
// Last Review, and Guest Experience below, so there's one place that
// decides "favorable = ink, unfavorable = red, arrow follows sign" rather
// than three drifting copies. Inherits font-family/size from its parent
// (each call site already sets those to its own context), and only
// controls color + the arrow glyph's own smaller size.
function TrendDelta({
  delta,
  formatDelta,
  favorable,
  arrowSize = 14,
}: {
  delta: number;
  formatDelta: (d: number) => string;
  favorable: boolean;
  arrowSize?: number;
}) {
  return (
    <span style={{ color: favorable ? "#12120F" : "#C0392B" }}>
      {formatDelta(delta)}
      <span style={{ fontFamily: JOST, fontSize: arrowSize, marginLeft: 4 }}>{delta >= 0 ? "↑" : "↓"}</span>
    </span>
  );
}

// Deep-link target for a Top Priority item, by its real Opportunity
// Category — checked the real destination pages before mapping rather than
// guessing: Financial Review has dedicated Revenue/Labor/Food & Beverage
// COGS/Operating Expenses/Profitability sections (financial/page.tsx),
// Commercial Review covers Guest Experience/Volume & Conversion/RevPASH
// (commercial/page.tsx), Menu Engineering covers per-item food cost/margin.
//
// One deliberate deviation from a literal read of the brief: it named
// "Kitchen Allocation" opportunities as menu-related, routing to Menu
// Engineering. The real Financial Review page's Operating Expenses section
// explicitly covers Kitchen Allocation ("the Kitchen Allocation charge
// below does not flex with revenue...") — Menu Engineering covers per-dish
// costing, a different, non-overlapping topic. OpEx-category items
// (Kitchen Allocation's real category) route to Financial Review, where
// the content actually lives; only the real "Menu" category routes to
// Menu Engineering.
// PRIORITY_TAB_BY_CATEGORY and INTEL_CATEGORY_TAB moved to
// src/lib/deep-links.ts (Redesign prompt Step 5) so the Intelligence tab's
// own cross-links share the same routing instead of a fifth copy.

// Standard-treatment card for priorities #2–3 — #1 gets the larger,
// heavier-accent card inline in the page body below instead (see "Top 3
// Priorities" section), same white/cream card system as this one now
// (Overview refinement Fix 2), not a separate full-bleed dark module.
function TopPriorityCard({
  priority,
  clientId,
  propertyId,
  annualOpportunity,
}: {
  priority: TopPriority;
  clientId: string;
  propertyId: string;
  // Number pairing (Fix 6) — real anchor already computed on the page
  // (same figure the "at a glance" strip shows), not fabricated per-card.
  annualOpportunity: number;
}) {
  const target = PRIORITY_TAB_BY_CATEGORY[priority.category];
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "26px 28px" }}>
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 10 }}>
        <div>
          <h3 style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 400, color: "#12120F" }}>{priority.title}</h3>
          {priority.category && (
            <span style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)", marginTop: 4, display: "inline-block" }}>
              {priority.category}
            </span>
          )}
        </div>
        {priority.confidence && (
          <span style={{ flexShrink: 0 }}>
            <StatusBadge label={priority.confidence} variant={CONFIDENCE_VARIANT[priority.confidence]} />
          </span>
        )}
      </div>
      {priority.impactAnnual > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontFamily: SERIF, fontSize: "1.7rem", fontWeight: 400, color: GOLD, lineHeight: 1 }}>
            {compact(priority.impactAnnual)}
            <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginLeft: 8 }}>est. annual impact</span>
          </p>
          {annualOpportunity > 0 && (
            <p style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>
              {Math.round((priority.impactAnnual / annualOpportunity) * 100)}% of total identified opportunity
            </p>
          )}
        </div>
      )}
      {priority.nextStep && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.55)", lineHeight: 1.6, marginBottom: target ? 12 : 0 }}>
          {priority.nextStep}
        </p>
      )}
      {target && (
        <Link
          href={`/${clientId}/${propertyId}${target.segment}?category=${encodeURIComponent(priority.category)}`}
          className="hover:text-[#D4AF7A]"
          style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, textDecoration: "none", transition: "color 0.25s ease" }}
        >
          View in {target.label} →
        </Link>
      )}
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

  const [property, kpi, allMetrics, actions, intelligence, briefs] = await Promise.all([
    getProperty(propertyId, clientId),
    getLatestKpiSummary(propertyId),
    getKpiMetrics(propertyId),
    getActions(propertyId),
    getIntelligence(propertyId, { clientVisibleOnly: true }),
    getPublishedBriefs(propertyId, clientId),
  ]);

  if (!property) notFound();

  const latestBrief = briefs[0] ?? null;

  // Opportunities are an internal-only analytical input (feeds Actions and
  // the Brief) and must be scoped to the current Reporting Period — the
  // most recent Published Brief's period — never aggregated across every
  // period ever generated for this property.
  const currentPeriod = latestBrief?.reportingPeriodStart ?? null;
  const opportunities = currentPeriod ? await getOpportunities(propertyId, currentPeriod) : [];

  // The prior *reviewed* period — the next distinct period among this
  // property's Published Briefs, not just any period with KPI data. A
  // property can have KPI Records for a period whose Brief was never
  // Published (e.g. Peacock Alley has real June KPI data, but its June
  // Brief is still Draft) — that period isn't a "prior review" the client
  // ever saw, so it must not be used as a comparison baseline. Null when
  // this is the property's first Published review (see Since Last Review
  // below, which hides entirely in that case).
  const priorPeriod =
    briefs.find((b) => b.reportingPeriodStart && b.reportingPeriodStart !== currentPeriod)?.reportingPeriodStart ??
    null;

  const health = deriveHealth(kpi);
  const openActions = (actions as Action[]).filter((a) => a.clientVisible && a.status !== "Complete");

  const annualOpportunity = (opportunities as Opportunity[]).reduce((s, o) => s + o.estimatedAnnualImpact, 0);

  // Top 3 Priorities — see selectTopPriorities above. topPriorities[0] gets
  // the full-bleed hero treatment below (absorbing what the old standalone
  // Biggest Opportunity section used to be); [1] and [2] render as standard
  // cards.
  const topPriorities = selectTopPriorities(opportunities as Opportunity[], intelligence as Intelligence[]);

  // Strategic Risk — see selectStrategicRisk above for the selection logic.
  const strategicRisk = selectStrategicRisk(intelligence as Intelligence[], currentPeriod);

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

  const latestPeriod = (allMetrics as KpiMetric[])
    .map((m) => m.periodStart).filter(Boolean).sort().reverse()[0] ?? null;

  // Financial Snapshot captions — the LPP Interpretation from the specific
  // KPI Record driving that card's value, not a generic property-level
  // field. Left blank (not a placeholder) when the record or its
  // interpretation doesn't exist yet for this property/period.
  function metricInterpretation(key: string): string {
    // findMetricByKey (not a bare .find) so the roll-up keys resolve to
    // their canonical total record — otherwise the caption is pulled from
    // whichever sub-component Notion stored first (e.g. the "Beverage
    // revenue of $154K…" line under the Revenue card).
    return findMetricByKey(allMetrics as KpiMetric[], key, latestPeriod)?.interpretation?.trim() ?? "";
  }
  const revenueInterpretation    = metricInterpretation("total_revenue");
  const laborInterpretation      = metricInterpretation("labor_pct");
  const cogsInterpretation       = metricInterpretation("cogs_pct");
  const netProfitInterpretation  = metricInterpretation("net_profit_pct");

  // Target Value — the real "budget" field on KPI Records. Checked the
  // live June data for all four Financial Snapshot metrics and Target
  // Value is null across the board; the "$1.03M budget" language inside
  // the Revenue interpretation caption isn't backed by any structured
  // field anywhere in KPI Records (confirmed: no Budget-segment record
  // exists either). Benchmark Low/High exist for Labor/COGS/Net Profit,
  // but those are industry ranges, not this property's own budget, so
  // they're deliberately not substituted here as a stand-in — a different
  // signal under a "vs budget" label would be misleading. This stays
  // wired to the real field so the variance badge activates the moment
  // Target Value gets populated, per Phase 5's "leave room for it."
  function metricTarget(key: string): number | null {
    return findMetricByKey(allMetrics as KpiMetric[], key, latestPeriod)?.targetValue ?? null;
  }

  // Prior-period value for a canonical metric key, for the inline
  // Sparkline (Portal-Wide refinement, cross-cutting) — real data only
  // ever has 2 Published periods per metric (confirmed directly against
  // Notion before building this), so this renders a single line segment,
  // not a fabricated multi-point trend. Null (sparkline hidden) whenever
  // there's no prior *reviewed* period or no record for it, same gating
  // Since Last Review already uses.
  function metricPrior(key: string): number | null {
    return priorPeriod ? findMetricByKey(allMetrics as KpiMetric[], key, priorPeriod)?.metricValue ?? null : null;
  }

  // Financial Snapshot — one consistent template for all four cards
  // (metric name -> value -> variance vs budget -> one-line driver
  // sentence), replacing four separately hand-coded card bodies.
  interface FinancialCard {
    label: string;
    // LPP Metric Key backing this card — used to build the deep-link into
    // Financial Review's matching section (Cross-tab audit Part 4, see
    // METRIC_KEY_SECTION in financial/page.tsx).
    metricKey: string;
    value: string;
    valueColor: string;
    subLine: string | null;
    interpretation: string;
    variance: { text: string; favorable: boolean } | null;
    // Inline trajectory (Portal-Wide refinement, cross-cutting) — [prior,
    // current], null when there's no prior period or record to pair it with.
    sparkline: [number, number] | null;
  }
  const financialCards: FinancialCard[] = kpi
    ? [
        {
          label: "Revenue",
          metricKey: "total_revenue",
          value: kpi.revenue != null ? compact(kpi.revenue) : "—",
          valueColor: "#12120F",
          // "revenue covers" — kpi.covers resolves to "Total Revenue
          // Covers" (comps excluded), not the larger "Total Covers Period".
          subLine: kpi.covers != null ? `${kpi.covers.toLocaleString()} revenue covers` : null,
          interpretation: revenueInterpretation,
          variance: (() => {
            const target = metricTarget("total_revenue");
            if (kpi.revenue == null || target == null) return null;
            const diff = kpi.revenue - target;
            return { text: `${diff >= 0 ? "+" : "−"}${compact(Math.abs(diff))} vs budget`, favorable: diff >= 0 };
          })(),
          sparkline: kpi.revenue != null && metricPrior("total_revenue") != null ? [metricPrior("total_revenue")!, kpi.revenue] : null,
        },
        {
          label: "Labor",
          metricKey: "labor_pct",
          value: kpi.laborPct != null ? pct(kpi.laborPct) : "—",
          valueColor: kpi.laborPct == null ? "#12120F" : kpi.laborPct <= 42 ? "#12120F" : "#C0392B",
          subLine: kpi.laborDollars != null ? usd(kpi.laborDollars) : null,
          interpretation: laborInterpretation,
          variance: (() => {
            const target = metricTarget("labor_pct");
            if (kpi.laborPct == null || target == null) return null;
            const diff = kpi.laborPct - target;
            return { text: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts vs budget`, favorable: diff <= 0 };
          })(),
          sparkline: kpi.laborPct != null && metricPrior("labor_pct") != null ? [metricPrior("labor_pct")!, kpi.laborPct] : null,
        },
        {
          // "COGS", not "Food COGS" — cogs_pct / total_cogs are the blended
          // food + beverage roll-up ("Total Cost of Sales" / "…Percentage"),
          // not a food-only figure. The food-only line ($118,321 for Lex
          // Yard June) is a separate Segment "Food" record.
          label: "COGS",
          metricKey: "cogs_pct",
          value: kpi.cogsPct != null ? pct(kpi.cogsPct) : "—",
          valueColor: kpi.cogsPct == null ? "#12120F" : kpi.cogsPct <= 34 ? "#12120F" : "#C0392B",
          subLine: kpi.cogsDollars != null ? usd(kpi.cogsDollars) : null,
          interpretation: cogsInterpretation,
          variance: (() => {
            const target = metricTarget("cogs_pct");
            if (kpi.cogsPct == null || target == null) return null;
            const diff = kpi.cogsPct - target;
            return { text: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts vs budget`, favorable: diff <= 0 };
          })(),
          sparkline: kpi.cogsPct != null && metricPrior("cogs_pct") != null ? [metricPrior("cogs_pct")!, kpi.cogsPct] : null,
        },
        {
          label: "Net Profit",
          metricKey: "net_profit_pct",
          value: kpi.netProfitPct != null ? pct(kpi.netProfitPct) : "—",
          valueColor: kpi.netProfitPct == null ? "#12120F" : kpi.netProfitPct >= 6 ? "#12120F" : "#C0392B",
          subLine: kpi.netProfitDollars != null ? usd(kpi.netProfitDollars) : null,
          interpretation: netProfitInterpretation,
          variance: (() => {
            const target = metricTarget("net_profit_pct");
            if (kpi.netProfitPct == null || target == null) return null;
            const diff = kpi.netProfitPct - target;
            return { text: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts vs budget`, favorable: diff >= 0 };
          })(),
          sparkline: kpi.netProfitPct != null && metricPrior("net_profit_pct") != null ? [metricPrior("net_profit_pct")!, kpi.netProfitPct] : null,
        },
      ]
    : [];

  // "Last updated" — no "Processed At" property exists on KPI Records or
  // Intelligence; this uses Notion's own last_edited_time as the honest
  // proxy, taken across this property's current-period records.
  const periodMetrics = currentPeriod ? (allMetrics as KpiMetric[]).filter((m) => m.periodStart === currentPeriod) : (allMetrics as KpiMetric[]);
  const periodIntel = currentPeriod ? (intelligence as Intelligence[]).filter((i) => i.periodStart === currentPeriod) : (intelligence as Intelligence[]);
  const lastUpdated = maxIso([
    ...periodMetrics.map((m) => m.processedAt),
    ...periodIntel.map((i) => i.processedAt),
  ]);

  // Guest Experience — if more than one source value lands in the same
  // period for the same metric key (e.g. two survey uploads), show a range
  // rather than silently averaging or picking one arbitrarily.
  function guestMetric(key: string, fallback: number | null): { display: string; isRange: boolean } | null {
    const raw = (allMetrics as KpiMetric[])
      .filter((m) => m.lppMetricKey === key && m.periodStart === latestPeriod)
      .map((m) => m.metricValue);
    if (raw.length === 0) {
      return fallback != null ? { display: fallback.toFixed(1), isRange: false } : null;
    }
    const uniq = [...new Set(raw)];
    if (uniq.length === 1) return { display: uniq[0].toFixed(1), isRange: false };
    const lo = Math.min(...uniq), hi = Math.max(...uniq);
    return { display: `${lo.toFixed(0)}–${hi.toFixed(0)}`, isRange: true };
  }

  // Guest Experience captions — same LPP Interpretation lookup as Financial
  // Snapshot above (metricInterpretation), keyed to each card's own canonical
  // metric. Empty string, not a placeholder, when the record or its
  // interpretation doesn't exist yet — same convention as Financial Snapshot.
  //
  // Trend delta uses periodDelta (defined below — hoisted function
  // declaration, safe to call here) against priorPeriod, the same
  // review-over-review computation Since Last Review uses. Deliberately
  // NOT parsed from the interpretation caption text below, which for the
  // real current data references a "May 2026" comparison that has no
  // backing KPI Record for any of the four guest metrics (only March and
  // June actually exist) — the caption's stated delta and this computed
  // one won't always agree, and this one is the verified one.
  const guestCards = [
    { label: "Overall",  key: "guest_overall",  fallback: kpi?.guestOverall ?? null },
    { label: "Food",     key: "guest_food",     fallback: kpi?.guestFood ?? null },
    { label: "Service",  key: "guest_service",  fallback: kpi?.guestService ?? null },
    { label: "Ambiance", key: "guest_ambiance", fallback: kpi?.guestAmbiance ?? null },
  ]
    .map(({ label, key, fallback }) => {
      const delta = priorPeriod ? periodDelta(key) : null;
      return {
        label,
        metricKey: key,
        metric: guestMetric(key, fallback),
        interpretation: metricInterpretation(key),
        delta,
        // Inline trajectory (Portal-Wide refinement) — same [prior, current]
        // source as the delta above, not a second computation.
        sparkline: delta ? ([delta.prior, delta.current] as [number, number]) : null,
      };
    })
    .filter(
      (c): c is {
        label: string;
        metricKey: string;
        metric: { display: string; isRange: boolean };
        interpretation: string;
        delta: { current: number; prior: number; delta: number } | null;
        sparkline: [number, number] | null;
      } => c.metric != null
    );

  // Structural split only — groups sentences into shorter paragraphs, does
  // not shorten or reword. See splitIntoParagraphs in lib/format.ts. Only
  // used by the old-format fallback below (hasNewBriefFormat === false).
  const currentReadParagraphs = latestBrief?.executiveSummary
    ? splitIntoParagraphs(latestBrief.executiveSummary, 3)
    : [];

  // The new hierarchical executive-briefing layout triggers on Executive
  // Read actually being populated, not on the property merely existing in
  // the schema — older Published Briefs (March 2026 and earlier) have all
  // five new fields empty, and fall back to the old single-paragraph
  // Executive Summary rendering above instead.
  const hasNewBriefFormat = !!latestBrief?.executiveRead?.trim();

  // Drivers grouping (Cross-tab audit Part 5) — replaces the old
  // unstructured criticalDrivers text field with the real Driver Findings
  // relation (Brief -> Intelligence), grouped into "Financial & Commercial"
  // vs "Operational" per the confirmed bucket mapping. Deliberately does
  // NOT fall back to parsing criticalDrivers text if Driver Findings is
  // empty (it is, on every Brief, as of this writing — Scenario C hasn't
  // been built to populate it yet) - per explicit instruction, so this
  // section renders nothing today rather than a stale/mixed mechanism.
  const driverBuckets = (() => {
    const bucketOf: Record<string, "financial" | "operational"> = {
      Financial: "financial", Labor: "financial", COGS: "financial",
      Commercial: "financial", Menu: "financial",
      Guest: "operational", Execution: "operational",
      // "Data Quality" intentionally absent — never shown as a Driver.
    };
    const financial: Intelligence[] = [];
    const operational: Intelligence[] = [];
    for (const id of latestBrief?.driverFindingIds ?? []) {
      const finding = (intelligence as Intelligence[]).find((i) => i.id === id);
      if (!finding) continue;
      const bucket = bucketOf[finding.category];
      if (bucket === "financial") financial.push(finding);
      else if (bucket === "operational") operational.push(finding);
    }
    return { financial, operational };
  })();

  // Outlook / Ownership Discussion — genuinely new content, not yet
  // populated in Notion for any property (see the Brief type's comments on
  // outlook/ownershipQuestions). Both stay hidden until real content
  // lands; nothing here fabricates a placeholder in the meantime.
  const outlookLines = latestBrief?.outlook ? parseTextLines(latestBrief.outlook) : [];
  const ownershipQuestionLines = latestBrief?.ownershipQuestions ? parseTextLines(latestBrief.ownershipQuestions) : [];

  // Since Last Review — month-over-month deltas against the prior
  // *reviewed* period (priorPeriod, above), not just any prior KPI period.
  // Canonical key lookup (findMetricByKey), same pattern used everywhere
  // else in the portal. Null whenever either side is missing, so a partial
  // gap in either period's data hides that one card rather than showing
  // broken math — same defensive pattern used elsewhere for missing
  // segments/metrics.
  function periodDelta(key: string): { current: number; prior: number; delta: number } | null {
    const current = findMetricByKey(allMetrics as KpiMetric[], key, currentPeriod);
    const prior = priorPeriod ? findMetricByKey(allMetrics as KpiMetric[], key, priorPeriod) : null;
    if (current == null || prior == null) return null;
    return { current: current.metricValue, prior: prior.metricValue, delta: current.metricValue - prior.metricValue };
  }
  const revenueDelta = priorPeriod ? periodDelta("total_revenue") : null;
  const laborDelta = priorPeriod ? periodDelta("labor_pct") : null;
  const guestDelta = priorPeriod ? periodDelta("guest_overall") : null;
  const hasSinceLastReview =
    priorPeriod != null && (revenueDelta != null || laborDelta != null || guestDelta != null);

  // Shared source for both the compact delta strip (under Hero) and the
  // full Since Last Review cards further down — same three metrics, same
  // favorable/unfavorable and formatting rules, just two different render
  // treatments of one data source, not two separate computations.
  const sinceLastReviewMetrics: {
    label: string;
    data: { current: number; prior: number; delta: number } | null;
    favorable: boolean;
    format: (v: number) => string;
    formatDelta: (d: number) => string;
    // Deep-link footer (Fix 4) — reuses the exact ?metric= convention
    // Financial Snapshot/Guest Experience cards above already use, not a
    // new mechanism.
    deepLink: { href: string };
  }[] = [
    {
      label: "Revenue",
      data: revenueDelta,
      favorable: revenueDelta != null && revenueDelta.delta >= 0,
      format: (v) => compact(v),
      formatDelta: (d) => `${d >= 0 ? "+" : "−"}${compact(Math.abs(d))}`,
      deepLink: { href: `/${clientId}/${propertyId}/financial?metric=total_revenue` },
    },
    {
      label: "Labor",
      data: laborDelta,
      favorable: laborDelta != null && laborDelta.delta <= 0,
      format: (v) => pct(v),
      formatDelta: (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`,
      deepLink: { href: `/${clientId}/${propertyId}/financial?metric=labor_pct` },
    },
    {
      label: "Guest",
      data: guestDelta,
      favorable: guestDelta != null && guestDelta.delta >= 0,
      format: (v) => v.toFixed(1),
      formatDelta: (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`,
      deepLink: { href: `/${clientId}/${propertyId}/commercial?metric=guest_overall` },
    },
  ];

  // One-line synthesis above the Since Last Review grid — reuses each
  // metric's own formatDelta (same source as the cards below and the
  // compact strip up top), so the sentence and the numbers underneath it
  // can never drift apart into two different claims. Unlike the prior
  // version (a flat "X is up, Y is up" restatement), this connects the
  // deltas by whether they moved together or diverged — grounded only in
  // each metric's own real sign/magnitude computed above, never a
  // fabricated causal mechanism (no "outpaced"/"drove"-style claim this
  // data alone can support). This is legitimately frontend logic, not
  // upstream-generated content — confirmed by reading the code before
  // assuming otherwise (Overview refinement Fix 4.2).
  const sinceLastReviewSynthesis = (() => {
    const present = sinceLastReviewMetrics.filter(
      (m): m is typeof m & { data: NonNullable<typeof m.data> } => m.data != null
    );
    if (present.length === 0) return null;

    const clause = (m: (typeof present)[number]) => {
      const magnitude = m.formatDelta(m.data.delta).replace(/^[+−]/, "");
      const direction = m.data.delta >= 0 ? "up" : "down";
      return `${m.label.toLowerCase()} is ${direction} ${magnitude}`;
    };
    const join = (list: string[]) =>
      list.length === 1
        ? list[0]
        : list.length === 2
        ? `${list[0]} and ${list[1]}`
        : `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;

    const favorable = present.filter((m) => m.favorable);
    const unfavorable = present.filter((m) => !m.favorable);

    if (unfavorable.length === 0) {
      return `Since the last review, every tracked metric improved: ${join(present.map(clause))}`;
    }
    if (favorable.length === 0) {
      return `Since the last review, every tracked metric moved the wrong direction: ${join(present.map(clause))}`;
    }
    return `Since the last review, ${join(unfavorable.map(clause))}, even as ${join(favorable.map(clause))}`;
  })();

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="overview" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }}>

        {/* At a glance — a quiet reference strip; Current Read below is the
            page's visual anchor. Labels read as KPIs (Portfolio Status /
            Financial Opportunity / Open Actions / Data Reliability) rather
            than internal-metadata names — same four values as before, this
            is a copy change only. */}
        <section style={{ marginBottom: 20 }}>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2" style={{ paddingBottom: 12, borderBottom: "1px solid rgba(18,18,15,0.06)" }}>
            {[
              { label: "Portfolio Status", value: health.status },
              { label: "Financial Opportunity", value: annualOpportunity > 0 ? compact(annualOpportunity) : "—" },
              { label: "Open Actions", value: String(openActions.length) },
              { label: "Data Reliability", value: property.dataConfidence },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: JOST, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(18,18,15,0.3)" }}>
                  {label}
                </span>
                <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.55)", fontWeight: 400 }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Delta strip — compact preview of Since Last Review (same
            sinceLastReviewMetrics source, see below), three raw numbers
            with a trend arrow and nothing else. Hidden under the same
            hasSinceLastReview gate — no prior period, no strip. */}
        {hasSinceLastReview && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <div className="flex flex-wrap items-baseline" style={{ gap: 36 }}>
              {sinceLastReviewMetrics
                .filter((m): m is typeof m & { data: NonNullable<typeof m.data> } => m.data != null)
                .map((m) => (
                  <div key={m.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }}>
                      {m.label}
                    </span>
                    <span style={{ fontFamily: SERIF, fontSize: "1.4rem", fontWeight: 400 }}>
                      <TrendDelta delta={m.data.delta} formatDelta={m.formatDelta} favorable={m.favorable} arrowSize={13} />
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Executive briefing — hierarchical layout (Executive Read / Critical
            Drivers / LPP Perspective / Decisions Required) once a Brief has
            the new fields populated; falls back to the old single-paragraph
            Executive Summary rendering for Briefs generated before this
            schema change (see hasNewBriefFormat above). Recommended Focus
            used to render here as its own numbered zone — removed now that
            Top 3 Priorities (below) is the single ranked-priority mechanism
            on this page; Decisions Required is a distinct field and stays. */}
        {hasNewBriefFormat && latestBrief ? (
          <section style={{ marginBottom: SECTION_GAP }} className="space-y-8">
            {/* Executive Brief — merged Executive Read + LPP Perspective
                (Overview refinement Fix 1). Deliberately unboxed: no card
                background, no border, reads as body copy sitting on the
                page background rather than a special callout, unlike
                CalloutBlock/the old bordered treatment. "Situation" and
                "Why It Matters" relabel the same two real fields Notion
                already generates (executiveRead / lppPerspective) — full
                text preserved, not compressed. The spec's ~100-word target
                assumed a shorter dedicated field for each part, which
                doesn't exist yet; hitting it would mean cutting real
                generated analysis myself, so that's flagged back rather
                than done here — this structure is ready for shorter copy
                the moment it exists. */}
            <div className="space-y-4">
              <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD }}>
                Executive Brief
              </p>
              <p style={{ fontFamily: SERIF, fontSize: "1.05rem", fontWeight: 400, color: "#12120F", lineHeight: 1.75 }}>
                <span style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, color: "rgba(18,18,15,0.4)" }}>
                  Situation{"  "}
                </span>
                {latestBrief.executiveRead}
              </p>
              {latestBrief.lppPerspective && (
                <p style={{ fontFamily: SERIF, fontSize: "1.05rem", fontWeight: 400, color: "#12120F", lineHeight: 1.75 }}>
                  <span style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, color: "rgba(18,18,15,0.4)" }}>
                    Why It Matters{"  "}
                  </span>
                  {latestBrief.lppPerspective}
                </p>
              )}
              {/* Decision needed — promoted visually (heavier weight, gold
                  top rule) since it's the single most actionable line in
                  the brief; previously the least visually weighted line
                  in the section. */}
              {latestBrief.decisionsRequired && (
                <p style={{ fontFamily: JOST, fontSize: 15, fontWeight: 600, color: "#12120F", lineHeight: 1.6, borderTop: "1px solid rgba(184,147,90,0.3)", paddingTop: 16, marginTop: 4 }}>
                  <span style={{ color: GOLD }}>Decision needed{"  "}</span>
                  {latestBrief.decisionsRequired}
                </p>
              )}
            </div>

            {/* Critical Drivers — unchanged content/logic, now positioned
                after the merged Executive Brief above rather than
                sandwiched between its two former halves (which no longer
                exist as separate zones). Grouped Financial & Commercial vs
                Operational, from Driver Findings (see driverBuckets
                above). Each sub-group renders only if it has items; the
                whole zone stays hidden if both are empty (no fallback to
                the old criticalDrivers text, per explicit instruction). */}
            {(driverBuckets.financial.length > 0 || driverBuckets.operational.length > 0) && (
              <div>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
                  Critical Drivers
                </p>
                <div className="space-y-5">
                  {driverBuckets.financial.length > 0 && (
                    <div>
                      <p style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)", marginBottom: 8 }}>
                        Financial &amp; Commercial
                      </p>
                      <div className="space-y-2">
                        {driverBuckets.financial.map((f) => (
                          <div key={f.id} className="flex items-center" style={{ gap: 10 }}>
                            <span style={{ width: 6, height: 6, background: GOLD, flexShrink: 0 }} />
                            <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.7)", lineHeight: 1.4 }}>
                              {f.finding}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {driverBuckets.operational.length > 0 && (
                    <div>
                      <p style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)", marginBottom: 8 }}>
                        Operational
                      </p>
                      <div className="space-y-2">
                        {driverBuckets.operational.map((f) => (
                          <div key={f.id} className="flex items-center" style={{ gap: 10 }}>
                            <span style={{ width: 6, height: 6, background: GOLD, flexShrink: 0 }} />
                            <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.7)", lineHeight: 1.4 }}>
                              {f.finding}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : (
          currentReadParagraphs.length > 0 && (
            <section style={{ marginBottom: SECTION_GAP }}>
              <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
                Current Read
              </p>
              <div style={{ borderLeft: "3px solid #B8935A", paddingLeft: 24 }} className="space-y-3">
                {currentReadParagraphs.map((paragraph, i) => (
                  <p
                    key={i}
                    style={{
                      fontFamily: SERIF,
                      fontSize: "clamp(0.95rem, 1.3vw, 1.05rem)",
                      fontWeight: 400,
                      lineHeight: 1.7,
                      color: "#12120F",
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          )
        )}

        {/* Top 3 Priorities — one continuous container, all three items on
            the same cream/white card system (Overview refinement Fix 2).
            #1 used to break out full-bleed on a solid black background,
            visually reading as an unrelated module from #2-3's white cards
            below it; now it's the same card system, differentiated by
            scale and a heavier gold rule instead of full color inversion. */}
        {topPriorities.length > 0 && <PrimarySectionHeader title="Top 3 Priorities" />}

        {topPriorities.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }} className="space-y-3">
            {topPriorities[0] && (
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderLeft: "8px solid #B8935A", padding: "48px 52px" }}>
                <div className="flex items-center flex-wrap" style={{ gap: 14, marginBottom: 18 }}>
                  <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD }}>
                    Top Priority
                  </p>
                  {topPriorities[0].category && (
                    <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.4)" }}>
                      {topPriorities[0].category}
                    </p>
                  )}
                </div>
                <p style={{ fontFamily: SERIF, fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)", fontWeight: 400, color: "#12120F", lineHeight: 1.4, maxWidth: 720, marginBottom: topPriorities[0].nextStep ? 10 : 22 }}>
                  {topPriorities[0].title}
                </p>
                {topPriorities[0].nextStep && (
                  <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.55)", lineHeight: 1.6, maxWidth: 720, marginBottom: 22 }}>
                    {topPriorities[0].nextStep}
                  </p>
                )}
                {topPriorities[0].impactAnnual > 0 && (
                  <div style={{ marginBottom: PRIORITY_TAB_BY_CATEGORY[topPriorities[0].category] ? 22 : 0 }}>
                    <p style={{ fontFamily: SERIF, fontSize: "clamp(2.4rem, 5vw, 3.4rem)", fontWeight: 400, color: GOLD, lineHeight: 1 }}>
                      {compact(topPriorities[0].impactAnnual)}
                      <span style={{ fontFamily: JOST, fontSize: "0.9rem", color: "rgba(18,18,15,0.4)", marginLeft: 14 }}>
                        estimated annual impact
                      </span>
                    </p>
                    {/* Number pairing (Fix 6) — real anchor already computed
                        on this page (annualOpportunity, the "at a glance"
                        strip's own figure), not fabricated for this card. */}
                    {annualOpportunity > 0 && (
                      <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>
                        {Math.round((topPriorities[0].impactAnnual / annualOpportunity) * 100)}% of total identified opportunity
                      </p>
                    )}
                  </div>
                )}
                {PRIORITY_TAB_BY_CATEGORY[topPriorities[0].category] && (
                  <Link
                    href={`/${clientId}/${propertyId}${PRIORITY_TAB_BY_CATEGORY[topPriorities[0].category].segment}?category=${encodeURIComponent(topPriorities[0].category)}`}
                    className="hover:text-[#D4AF7A]"
                    style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, textDecoration: "none", transition: "color 0.25s ease" }}
                  >
                    View in {PRIORITY_TAB_BY_CATEGORY[topPriorities[0].category].label} →
                  </Link>
                )}
              </div>
            )}

            {topPriorities.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {topPriorities.slice(1).map((priority) => (
                  <TopPriorityCard key={priority.id} priority={priority} clientId={clientId} propertyId={propertyId} annualOpportunity={annualOpportunity} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Financial snapshot — Layer 2, collapsed by default on mobile */}
        {kpi && (
          <section style={{ marginBottom: SECTION_GAP }}>
          <CollapsibleOnMobile
            header={
              <div className="flex items-center justify-between">
                <SectionHeader title="Financial Snapshot" />
                {latestPeriod && (
                  <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>{formatPeriod(latestPeriod)}</span>
                )}
              </div>
            }
          >
            {unpublishedFinancialData && (
              <div style={{ marginBottom: 16, padding: "10px 16px", background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.15)", fontFamily: JOST, fontSize: 13, color: "#C0392B" }}>
                Admin only: financial data exists in Notion for this property but isn&apos;t Published — it won&apos;t appear until published.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {financialCards.map((card) => (
                <Link
                  key={card.label}
                  href={`/${clientId}/${propertyId}/financial?metric=${card.metricKey}`}
                  style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px", display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }}>
                      {card.label}
                    </p>
                    {card.sparkline && <Sparkline values={card.sparkline} />}
                  </div>
                  <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, color: card.valueColor, lineHeight: 1 }}>
                    {card.value}
                  </p>
                  {card.subLine && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{card.subLine}</p>}
                  {/* Variance vs budget — only renders once Target Value is
                      populated in Notion (see financialCards above); the
                      template is ready for it, nothing fakes it in the
                      meantime. */}
                  {card.variance && (
                    <div style={{ marginTop: 8 }}>
                      <StatusBadge label={card.variance.text} variant={card.variance.favorable ? "green" : "red"} />
                    </div>
                  )}
                  {card.interpretation && <p style={captionStyle}>{card.interpretation}</p>}
                </Link>
              ))}
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
          </CollapsibleOnMobile>
          </section>
        )}

        {/* Guest experience — Layer 2, collapsed by default on mobile */}
        {guestCards.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }}>
          <CollapsibleOnMobile header={<SectionHeader title="Guest Experience" />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {guestCards.map(({ label, metricKey, metric, interpretation, delta, sparkline }) => (
                <Link
                  key={label}
                  href={`/${clientId}/${propertyId}/commercial?metric=${metricKey}`}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid rgba(18,18,15,0.08)",
                    borderRadius: 0,
                    padding: "24px 28px",
                    display: "flex",
                    flexDirection: "column",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)" }}>
                      {label}
                    </p>
                    {sparkline && <Sparkline values={sparkline} />}
                  </div>
                  <p style={{ fontFamily: SERIF, fontSize: metric.isRange ? "1.8rem" : "2.2rem", fontWeight: 400, lineHeight: 1, color: "#12120F" }}>
                    {metric.display}
                    {!metric.isRange && <span style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.3)", fontWeight: 300 }}> / 100</span>}
                  </p>
                  {metric.isRange && (
                    <p style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>
                      Range across {`${label.toLowerCase()}`} sources this period
                    </p>
                  )}
                  {delta && (
                    <p style={{ fontFamily: JOST, fontSize: 12, marginTop: 4 }}>
                      <TrendDelta
                        delta={delta.delta}
                        formatDelta={(d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`}
                        favorable={delta.delta >= 0}
                        arrowSize={11}
                      />
                    </p>
                  )}
                  {/* flex: 1 slot, present on every card regardless of whether this
                      one has text — so the grid's row-stretch gives all four cards
                      equal height, and every caption slot then stretches to match,
                      sized to whichever of the four captions is longest this period. */}
                  <div style={{ flex: 1 }}>
                    {interpretation && <p style={captionStyle}>{interpretation}</p>}
                  </div>
                </Link>
              ))}
            </div>

            {/* Deep-dive link — Commercial Review has its own Guest
                Experience section (commercial/page.tsx); same "Full ___
                review →" pattern as Financial Snapshot above. */}
            <div className="text-right" style={{ marginTop: 12 }}>
              <Link
                href={`/${clientId}/${propertyId}/commercial`}
                className="hover:text-[#D4AF7A]"
                style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#B8935A", textDecoration: "none", transition: "color 0.25s ease" }}
              >
                Full commercial review →
              </Link>
            </div>
          </CollapsibleOnMobile>
          </section>
        )}

        {/* Strategic Risks (renamed from Emerging Risk, Overview refinement
            Fix 3) — dark/high-contrast shared treatment via
            StrategicRiskBlock, not CollapsibleOnMobile like its neighbors
            (see that component's own comment for why). Content unchanged;
            the correct Strategic Risks framing (dinner demand vs. rising
            guest scores, labor outpacing revenue, breakfast dependence)
            doesn't exist upstream yet — confirmed against every Published
            Intelligence record for the current period, not assumed. */}
        {strategicRisk && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <StrategicRiskBlock
              title="Strategic Risks"
              finding={strategicRisk.finding}
              currentRead={strategicRisk.currentRead}
              crossLink={
                INTEL_CATEGORY_TAB[strategicRisk.category]
                  ? {
                      href: `/${clientId}/${propertyId}${INTEL_CATEGORY_TAB[strategicRisk.category].segment}?category=${encodeURIComponent(strategicRisk.category)}`,
                      label: INTEL_CATEGORY_TAB[strategicRisk.category].label,
                    }
                  : null
              }
            />
          </section>
        )}

        {/* Outlook — new content, hidden until latestBrief.outlook is
            actually populated in Notion (see comments on outlookLines
            above). Three bullets: if-nothing-changes and recovery-outlook
            are independently gated (each renders only if its own line has
            content); Confidence reuses the Brief's existing confidence
            field rather than requiring a fourth, likely-redundant one. */}
        {outlookLines.length > 0 && latestBrief && (
          <section style={{ marginBottom: SECTION_GAP }}>
          <CollapsibleOnMobile header={<SectionHeader title="Outlook" />}>
            <div className="space-y-3">
              {outlookLines[0] && (
                <div className="flex items-start" style={{ gap: 10 }}>
                  <span style={{ width: 6, height: 6, background: GOLD, flexShrink: 0, marginTop: 7 }} />
                  <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.7)", lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 500, color: "#12120F" }}>If nothing changes: </span>
                    {outlookLines[0]}
                  </p>
                </div>
              )}
              {outlookLines[1] && (
                <div className="flex items-start" style={{ gap: 10 }}>
                  <span style={{ width: 6, height: 6, background: GOLD, flexShrink: 0, marginTop: 7 }} />
                  <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.7)", lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 500, color: "#12120F" }}>Recovery outlook: </span>
                    {outlookLines[1]}
                  </p>
                </div>
              )}
              <div className="flex items-center" style={{ gap: 10 }}>
                <span style={{ width: 6, height: 6, background: GOLD, flexShrink: 0 }} />
                <span style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.7)" }}>Confidence:</span>
                <StatusBadge label={latestBrief.confidence} variant={CONFIDENCE_VARIANT[latestBrief.confidence]} />
              </div>
            </div>
          </CollapsibleOnMobile>
          </section>
        )}

        {/* Ownership Discussion — new content, same hidden-until-populated
            status as Outlook above. Deliberately not the Top 3 Priorities
            card style — italic serif pull-quote treatment, a thin gold
            rule instead of a bordered box, so these read as open questions
            for discussion rather than another action-item list. */}
        {ownershipQuestionLines.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }}>
          <CollapsibleOnMobile header={<SectionHeader title="Ownership Discussion" />}>
            <div style={{ borderTop: "1px solid rgba(184,147,90,0.3)", paddingTop: 24 }} className="space-y-5">
              {ownershipQuestionLines.map((question, i) => (
                <p
                  key={i}
                  style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "1.15rem", fontWeight: 300, color: "rgba(18,18,15,0.75)", lineHeight: 1.6 }}
                >
                  {question}
                </p>
              ))}
            </div>
          </CollapsibleOnMobile>
          </section>
        )}

        {/* Since Last Review — month-over-month deltas against the prior
            reviewed period. Hidden entirely on a property's first Published
            review (no prior period to compare against) — same silent-hide
            convention the section it replaces (What Happens Next) used for
            the equivalent "no prior cycle" case. */}
        {hasSinceLastReview && (
          <section>
          <CollapsibleOnMobile
            header={
              <div className="flex items-center justify-between">
                <SectionHeader title="Since Last Review" />
                {priorPeriod && (
                  <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>
                    vs. {formatPeriod(priorPeriod)}
                  </span>
                )}
              </div>
            }
          >
            {sinceLastReviewSynthesis && (
              <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.55)", lineHeight: 1.6, marginBottom: 16 }}>
                {sinceLastReviewSynthesis}.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {sinceLastReviewMetrics.map(({ label, data, favorable, format, formatDelta, deepLink }) =>
                data ? (
                  <Link
                    key={label}
                    href={deepLink.href}
                    style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px", display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>
                      {label}
                    </p>
                    <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1 }}>
                      <TrendDelta delta={data.delta} formatDelta={formatDelta} favorable={favorable} />
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>
                      {format(data.prior)} → {format(data.current)}
                    </p>
                  </Link>
                ) : null
              )}
            </div>
          </CollapsibleOnMobile>
          </section>
        )}

      </div>
    </PageWrapper>
  );
}
