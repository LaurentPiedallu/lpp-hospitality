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
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import StatusBadge from "@/components/StatusBadge";
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

// ~10% more breathing room than the prior 48px section rhythm.
const SECTION_GAP = 53;

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

// Confidence badge variant mapping — reuses the shared StatusBadge component
// rather than inventing a parallel badge style for this one field.
const CONFIDENCE_VARIANT: Record<DataConfidence, "green" | "amber" | "red" | "gray"> = {
  High: "green",
  Medium: "amber",
  Low: "red",
  "Requires Validation": "gray",
};

// Emerging Risk — a genuine "not yet critical, but worth watching" signal,
// not a hardcoded Guest Commentary pick. Prefers Severity=Monitor (the
// existing field that already conceptually matches "not yet critical, but
// could become one") across every Intelligence Category, not just Guest;
// the highest Estimated Monthly Impact breaks a tie among multiple Monitor
// records, most-recently-touched breaking a further tie. Falls back to the
// lowest-impact Action Required record when no Monitor-severity record
// exists for the period — a real, confirmed case (Lex Yard's June Published
// Intelligence has zero Monitor-severity records) — so the section stays
// populated with a genuine finding rather than going empty, while still
// reading as a step down in urgency from what's already covered earlier on
// the page (Immediate Priorities, Biggest Opportunity). Returns null if
// nothing qualifies even under the fallback, so the section can hide
// entirely rather than show a placeholder.
function selectEmergingRisk(records: Intelligence[], period: string | null): Intelligence | null {
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

// Top 3 Priorities — replaces the old Immediate Priorities grid (Initiative-
// driven, no real $ or priority of its own — Initiative.expectedImpact and
// Initiative.priority are null on every real record; only linked Actions
// carry genuine priority) and the old standalone Biggest Opportunity lookup
// (a single record resolved via Brief.biggestOpportunityId). Opportunities
// carry real, populated Estimated Annual Impact and Priority for the
// current dataset, so this ranks across Opportunities directly — item #1
// naturally reproduces (and generalizes) what Biggest Opportunity used to
// single out, since it's the same top-impact record either way.
interface TopPriority {
  id: string;
  title: string;
  category: string;
  impactAnnual: number;
  confidence: DataConfidence | null;
  nextStep: string;
}

function selectTopPriorities(opportunities: Opportunity[], intelligence: Intelligence[]): TopPriority[] {
  const ranked = [...opportunities].sort((a, b) => {
    if (b.estimatedAnnualImpact !== a.estimatedAnnualImpact) {
      return b.estimatedAnnualImpact - a.estimatedAnnualImpact;
    }
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });
  return ranked.slice(0, 3).map((o) => ({
    id: o.id,
    title: o.title,
    category: o.category,
    impactAnnual: o.estimatedAnnualImpact,
    // Opportunity itself has no confidence field — resolved from the
    // Intelligence finding that drove it, same relation already used for
    // opportunityDriver text. Null (not shown) when there's no linked
    // finding or it predates this relation being populated.
    confidence: o.sourceIntelligenceId
      ? intelligence.find((i) => i.id === o.sourceIntelligenceId)?.confidence ?? null
      : null,
    nextStep: o.nextStep,
  }));
}

// Standard-treatment card for priorities #2–3 — #1 gets the full-bleed hero
// treatment inline in the page body below instead (see "Top priority — hero").
function TopPriorityCard({ priority }: { priority: TopPriority }) {
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
        <p style={{ fontFamily: SERIF, fontSize: "1.7rem", fontWeight: 400, color: GOLD, lineHeight: 1, marginBottom: 10 }}>
          {compact(priority.impactAnnual)}
          <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginLeft: 8 }}>est. annual impact</span>
        </p>
      )}
      {priority.nextStep && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.55)", lineHeight: 1.6 }}>
          {priority.nextStep}
        </p>
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
    getIntelligence(propertyId),
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

  // Emerging Risk — see selectEmergingRisk above for the selection logic.
  const emergingRisk = selectEmergingRisk(intelligence as Intelligence[], currentPeriod);

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
    return (allMetrics as KpiMetric[])
      .find((m) => m.lppMetricKey === key && m.periodStart === latestPeriod)
      ?.interpretation?.trim() ?? "";
  }
  const revenueInterpretation    = metricInterpretation("total_revenue");
  const laborInterpretation      = metricInterpretation("labor_pct");
  const cogsInterpretation       = metricInterpretation("cogs_pct");
  const netProfitInterpretation  = metricInterpretation("net_profit_pct");

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
  const guestCards = [
    { label: "Overall",  key: "guest_overall",  fallback: kpi?.guestOverall ?? null },
    { label: "Food",     key: "guest_food",     fallback: kpi?.guestFood ?? null },
    { label: "Service",  key: "guest_service",  fallback: kpi?.guestService ?? null },
    { label: "Ambiance", key: "guest_ambiance", fallback: kpi?.guestAmbiance ?? null },
  ]
    .map(({ label, key, fallback }) => ({
      label,
      metric: guestMetric(key, fallback),
      interpretation: metricInterpretation(key),
    }))
    .filter(
      (c): c is { label: string; metric: { display: string; isRange: boolean }; interpretation: string } =>
        c.metric != null
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
  const criticalDrivers = latestBrief?.criticalDrivers ? parseTextLines(latestBrief.criticalDrivers) : [];

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
  }[] = [
    {
      label: "Revenue",
      data: revenueDelta,
      favorable: revenueDelta != null && revenueDelta.delta >= 0,
      format: (v) => compact(v),
      formatDelta: (d) => `${d >= 0 ? "+" : "−"}${compact(Math.abs(d))}`,
    },
    {
      label: "Labor",
      data: laborDelta,
      favorable: laborDelta != null && laborDelta.delta <= 0,
      format: (v) => pct(v),
      formatDelta: (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`,
    },
    {
      label: "Guest",
      data: guestDelta,
      favorable: guestDelta != null && guestDelta.delta >= 0,
      format: (v) => v.toFixed(1),
      formatDelta: (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`,
    },
  ];

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="overview" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 0" }}>

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
                    <span style={{ fontFamily: SERIF, fontSize: "1.4rem", fontWeight: 400, color: m.favorable ? "#12120F" : "#C0392B" }}>
                      {m.formatDelta(m.data.delta)}
                      <span style={{ fontFamily: JOST, fontSize: 13, marginLeft: 4 }}>{m.data.delta >= 0 ? "↑" : "↓"}</span>
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
            {/* Zone 1 — Executive Read: the dominant visual moment. Heavier
                left-accent (6px vs CalloutBlock's 3px) and larger padding
                than LPP Perspective below keep this reading as the higher
                emphasis of the two cream/gold cards, without the solid
                black fill it used to have. */}
            <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderLeft: "6px solid #B8935A", padding: "40px 44px" }}>
              <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
                Executive Read
              </p>
              <p style={{ fontFamily: SERIF, fontSize: "clamp(1.3rem, 2vw, 1.6rem)", fontWeight: 300, color: "#12120F", lineHeight: 1.5 }}>
                {latestBrief.executiveRead}
              </p>
            </div>

            {/* Zone 2 — Critical Drivers: a scan zone, one line each */}
            {criticalDrivers.length > 0 && (
              <div>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
                  Critical Drivers
                </p>
                <div className="space-y-2">
                  {criticalDrivers.map((driver, i) => (
                    <div key={i} className="flex items-center" style={{ gap: 10 }}>
                      <span style={{ width: 6, height: 6, background: GOLD, flexShrink: 0 }} />
                      <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.7)", lineHeight: 1.4 }}>
                        {driver}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zone 3 — LPP Perspective: the firm's interpretation, plain prose */}
            {latestBrief.lppPerspective && (
              <div>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
                  LPP Perspective
                </p>
                <CalloutBlock>
                  <p>{latestBrief.lppPerspective}</p>
                </CalloutBlock>
              </div>
            )}

            {/* Zone 4 — Decisions Required: what happens next. Recommended
                Focus used to render above this as its own numbered zone —
                removed; Top 3 Priorities below is the ranked-priority
                mechanism now. */}
            {latestBrief.decisionsRequired && (
              <p style={{ fontFamily: JOST, fontSize: 13, color: "#12120F", lineHeight: 1.6 }}>
                <span style={{ fontWeight: 500, color: GOLD }}>Decision needed: </span>
                {latestBrief.decisionsRequired}
              </p>
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

        {/* Top 3 Priorities — header sits in the constrained-width column;
            item #1 breaks out full-bleed right below (next block), items
            #2–3 render as standard cards once the constrained column
            reopens, ahead of Financial Snapshot. */}
        {topPriorities.length > 0 && <PrimarySectionHeader title="Top 3 Priorities" />}
      </div>

      {/* Top priority — hero, full-bleed treatment (what Biggest Opportunity used to be) */}
      {topPriorities[0] && (
        <section style={{ marginBottom: topPriorities.length > 1 ? 20 : SECTION_GAP }}>
          <div style={{ marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)", background: "#12120F" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 60px" }}>
              <div className="flex items-center flex-wrap" style={{ gap: 14, marginBottom: 18 }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD }}>
                  Top Priority
                </p>
                {topPriorities[0].category && (
                  <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.4)" }}>
                    {topPriorities[0].category}
                  </p>
                )}
              </div>
              <p style={{ fontFamily: SERIF, fontSize: "clamp(1.3rem, 2vw, 1.6rem)", fontWeight: 300, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, maxWidth: 640, marginBottom: topPriorities[0].nextStep ? 10 : 22 }}>
                {topPriorities[0].title}
              </p>
              {topPriorities[0].nextStep && (
                <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(242,237,228,0.45)", maxWidth: 640, marginBottom: 22 }}>
                  {topPriorities[0].nextStep}
                </p>
              )}
              {topPriorities[0].impactAnnual > 0 && (
                <p style={{ fontFamily: SERIF, fontSize: "clamp(2.8rem, 6vw, 4.2rem)", fontWeight: 300, color: "#B8935A", lineHeight: 1 }}>
                  {compact(topPriorities[0].impactAnnual)}
                  <span style={{ fontFamily: JOST, fontSize: "0.95rem", color: "rgba(242,237,228,0.4)", marginLeft: 14 }}>
                    estimated annual impact
                  </span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 60px 80px" }}>

        {/* Priorities #2–3 — standard card treatment */}
        {topPriorities.length > 1 && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {topPriorities.slice(1).map((priority) => (
                <TopPriorityCard key={priority.id} priority={priority} />
              ))}
            </div>
          </section>
        )}

        {/* Financial snapshot */}
        {kpi && (
          <section style={{ marginBottom: SECTION_GAP }}>
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
                {revenueInterpretation && <p style={captionStyle}>{revenueInterpretation}</p>}
              </div>

              {/* Labor */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Labor</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.laborPct == null ? "#12120F" : kpi.laborPct <= 42 ? "#12120F" : "#C0392B" }}>
                  {kpi.laborPct != null ? pct(kpi.laborPct) : "—"}
                </p>
                {kpi.laborDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.laborDollars)}</p>}
                {laborInterpretation && <p style={captionStyle}>{laborInterpretation}</p>}
              </div>

              {/* COGS */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Food COGS</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.cogsPct == null ? "#12120F" : kpi.cogsPct <= 34 ? "#12120F" : "#C0392B" }}>
                  {kpi.cogsPct != null ? pct(kpi.cogsPct) : "—"}
                </p>
                {kpi.cogsDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.cogsDollars)}</p>}
                {cogsInterpretation && <p style={captionStyle}>{cogsInterpretation}</p>}
              </div>

              {/* Net profit */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Net Profit</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.netProfitPct == null ? "#12120F" : kpi.netProfitPct >= 6 ? "#12120F" : "#C0392B" }}>
                  {kpi.netProfitPct != null ? pct(kpi.netProfitPct) : "—"}
                </p>
                {kpi.netProfitDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.netProfitDollars)}</p>}
                {netProfitInterpretation && <p style={captionStyle}>{netProfitInterpretation}</p>}
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
        {guestCards.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <SectionHeader title="Guest Experience" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {guestCards.map(({ label, metric, interpretation }) => (
                <div
                  key={label}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid rgba(18,18,15,0.08)",
                    borderRadius: 0,
                    padding: "24px 28px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>
                    {label}
                  </p>
                  <p style={{ fontFamily: SERIF, fontSize: metric.isRange ? "1.8rem" : "2.2rem", fontWeight: 400, lineHeight: 1, color: "#12120F" }}>
                    {metric.display}
                    {!metric.isRange && <span style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.3)", fontWeight: 300 }}> / 100</span>}
                  </p>
                  {metric.isRange && (
                    <p style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>
                      Range across {`${label.toLowerCase()}`} sources this period
                    </p>
                  )}
                  {/* flex: 1 slot, present on every card regardless of whether this
                      one has text — so the grid's row-stretch gives all four cards
                      equal height, and every caption slot then stretches to match,
                      sized to whichever of the four captions is longest this period. */}
                  <div style={{ flex: 1 }}>
                    {interpretation && <p style={captionStyle}>{interpretation}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Emerging Risk — real selected Intelligence finding, see selectEmergingRisk above */}
        {emergingRisk && (
          <section style={{ marginBottom: hasSinceLastReview ? SECTION_GAP : 0 }}>
            <SectionHeader title="Emerging Risk" />
            <CalloutBlock>
              <p>{emergingRisk.finding}</p>
              {emergingRisk.currentRead && (
                <p style={{ marginTop: 8, opacity: 0.8 }}>{emergingRisk.currentRead}</p>
              )}
            </CalloutBlock>
          </section>
        )}

        {/* Since Last Review — month-over-month deltas against the prior
            reviewed period. Hidden entirely on a property's first Published
            review (no prior period to compare against) — same silent-hide
            convention the section it replaces (What Happens Next) used for
            the equivalent "no prior cycle" case. */}
        {hasSinceLastReview && (
          <section>
            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <SectionHeader title="Since Last Review" />
              {priorPeriod && (
                <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>
                  vs. {formatPeriod(priorPeriod)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {sinceLastReviewMetrics.map(({ label, data, favorable, format, formatDelta }) =>
                data ? (
                  <div key={label} style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                    <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>
                      {label}
                    </p>
                    <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: favorable ? "#12120F" : "#C0392B" }}>
                      {formatDelta(data.delta)}
                      <span style={{ fontFamily: JOST, fontSize: 14, marginLeft: 6 }}>{data.delta >= 0 ? "↑" : "↓"}</span>
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>
                      {format(data.prior)} → {format(data.current)}
                    </p>
                  </div>
                ) : null
              )}
            </div>
          </section>
        )}

      </div>
    </PageWrapper>
  );
}
