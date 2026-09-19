import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getProperty, getKpiMetrics, getIntelligence, getOpportunities, getLastUpdated } from "@/lib/notion-queries";
import { usd, pct, findMetricByKey, findMetricByName, metricSeriesForKey, findAllIntelligence, findIntelligenceByFinding, extractIndividualStaffNames, mentionsIndividualStaff, hasRealBenchmark } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeaderSlim from "@/components/PropertyHeaderSlim";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import KpiCard from "@/components/KpiCard";
import BenchmarkRangeBar from "@/components/BenchmarkRangeBar";
import EmptyState from "@/components/EmptyState";
import FindingSection from "@/components/FindingSection";
import CalloutBlock from "@/components/CalloutBlock";
import StatusBadge from "@/components/StatusBadge";
import ScrollToSection from "@/components/ScrollToSection";
import OpportunitiesPanel from "@/components/OpportunitiesPanel";
import type { KpiMetric, Intelligence, Opportunity, Severity } from "@/types/portal";
// Deep-link routing maps moved to src/lib/deep-links.ts (Redesign prompt
// Step 5) so Intelligence's own cross-links resolve through the same
// source of truth.
import { FINANCIAL_METRIC_SECTION as METRIC_KEY_SECTION, FINANCIAL_CATEGORY_SECTION as CATEGORY_SECTION } from "@/lib/deep-links";

// Opportunity Category values that belong on this tab (Redesign prompt
// Step 1) — the real "Opportunity Category" select field on Notion only
// ever contains [Labor, Pricing, Menu, Purchasing, Revenue Mix, Guest
// Retention, Reservations, OpEx] (confirmed against the live schema and
// every record, archived and published — zero exceptions). "COGS" is NOT
// a valid value on this field (it exists on Intelligence Category and KPI
// Category, a common source of confusion, but never on Opportunities), so
// it's deliberately excluded here rather than included as a dead filter
// clause that could never match anything.
const FINANCIAL_OPPORTUNITY_CATEGORIES = new Set(["Labor", "OpEx", "Purchasing"]);

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

// One additional Intelligence record in a section that already shows its
// primary one via FindingSection's own built-in callout — same
// CalloutBlock + StatusBadge treatment as that primary callout, matching
// the portal-wide convention for "more than one record in one section"
// (same component Commercial Review uses for its own extra records). Used
// wherever intelAll(cat) returns more than one record for a section.
//
// showCommentary (opt-in, default off) restores Why It Matters / Suggested
// Decision behind the same collapsed "LPP Perspective" toggle this page's
// own primary FindingSection callouts already use — plain text was
// rendering Current Read only, silently dropping the stakes/reasoning half
// of every extra record. Per-record editorial call at each call site, not
// a blanket default.
function ExtraIntelCard({ record, showCommentary }: { record: Intelligence; showCommentary?: boolean }) {
  if (!record.currentRead) return null;
  return (
    <>
      <CalloutBlock>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p>{record.currentRead}</p>
          <StatusBadge label={record.severity} variant={severityVariant(record.severity)} />
        </div>
      </CalloutBlock>
      {showCommentary && (record.whyItMatters || record.suggestedDecision) && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden group">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>LPP Perspective</span>
            <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="px-5 pb-5 pt-2 space-y-4 border-t border-gray-50">
            {record.whyItMatters && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Why It Matters</p>
                <p className="text-sm text-gray-700 leading-relaxed">{record.whyItMatters}</p>
              </div>
            )}
            {record.suggestedDecision && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Recommendation</p>
                <p className="text-sm text-gray-700 leading-relaxed">{record.suggestedDecision}</p>
              </div>
            )}
          </div>
        </details>
      )}
    </>
  );
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

// ─── P&L waterfall — the page's numeric conclusion ─────────────────────────
// How actual revenue nets to the actual departmental result, stepping through
// each real cost line. Hand-built like DriverBreakdown / StackedSplit, same
// white container. Every printed figure is a source value. The last running
// point is anchored to `result.value` (netProfit) rather than to the running
// sum, so the operating-expenses step silently absorbs the sub-dollar
// rounding difference between the component figures and the departmental
// total — the chain closes exactly and no running total is shown that could
// disagree.

function ProfitBridge({
  revenue,
  steps,
  result,
}: {
  revenue: { label: string; value: number };  // starting magnitude, positive
  steps: { label: string; value: number }[];  // positive magnitudes, each subtracted
  result: { label: string; value: number };   // signed departmental result
}) {
  const running: number[] = [revenue.value];
  steps.forEach((s, i) => {
    running.push(i === steps.length - 1 ? result.value : running[i] - s.value);
  });

  const lo = Math.min(0, ...running);
  const hi = Math.max(0, ...running);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  const zeroLeft = pos(0);

  const bars: { label: string; amount: number; left: number; width: number; color: string }[] = [
    {
      label: revenue.label,
      amount: revenue.value,
      left: Math.min(zeroLeft, pos(revenue.value)),
      width: Math.abs(pos(revenue.value) - zeroLeft),
      color: GOLD,
    },
    ...steps.map((s, i) => {
      const a = pos(running[i]);
      const b = pos(running[i + 1]);
      return {
        label: s.label,
        amount: -s.value,
        left: Math.min(a, b),
        width: Math.abs(b - a),
        color: "#C0392B",
      };
    }),
    {
      label: result.label,
      amount: result.value,
      left: Math.min(zeroLeft, pos(result.value)),
      width: Math.abs(pos(result.value) - zeroLeft),
      color: "#C0392B",
    },
  ];

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 20 }}>
      <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 16 }}>
        How the period nets out
      </p>
      <div className="space-y-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.65)" }}>{b.label}</span>
              <span style={{ fontFamily: JOST, fontSize: 12, color: "#12120F", fontWeight: 500 }}>{usd(b.amount)}</span>
            </div>
            <div style={{ position: "relative", height: 10, background: "rgba(18,18,15,0.06)" }}>
              <div style={{ position: "absolute", left: `${zeroLeft}%`, top: -2, bottom: -2, width: 1, background: "rgba(18,18,15,0.22)" }} />
              <div style={{ position: "absolute", height: "100%", left: `${b.left}%`, width: `${b.width}%`, background: b.color }} />
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginTop: 14 }}>
        Step amounts are rounded to the nearest dollar; the departmental total is exact.
      </p>
    </div>
  );
}

// FinancialSection extracted to src/components/FindingSection.tsx (Cross-tab
// audit Part 3) — see call sites below, now <FindingSection ...>.

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FinancialPage({
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

  // Opportunities panel (Redesign prompt Step 1) — Labor/OpEx/Purchasing
  // category items (e.g. kitchen allocation renegotiation) had no home
  // anywhere in the client portal, since Commercial Review's own category
  // filter correctly excludes them. Scoped to the current period, same
  // convention getOpportunities already uses everywhere else it's called.
  // Same individual-staff-name exclusion Commercial Review applies — a
  // client-facing safety rule, not specific to any one tab.
  const opportunities = latest ? await getOpportunities(propertyId, latest) : [];
  const staffNames = extractIndividualStaffNames(allMetrics);
  const financialOpportunities = (opportunities as Opportunity[]).filter(
    (o) =>
      FINANCIAL_OPPORTUNITY_CATEGORIES.has(o.category) &&
      !mentionsIndividualStaff(o.title, staffNames) &&
      !mentionsIndividualStaff(o.nextStep, staffNames)
  );
  // Confidence badge (Financial Review refinement Fix 7) — resolved the
  // same way lib/priorities.ts resolves it for Overview's Top 3 Priorities:
  // via the linked Intelligence record's own Confidence field, not a field
  // on Opportunity itself. The prompt's "Difficulty/Time" fields don't
  // exist anywhere in the real Opportunity schema (checked directly against
  // Notion) — only Confidence does, so only Confidence is added here.
  const opportunityConfidence: Record<string, Intelligence["confidence"]> = {};
  for (const o of financialOpportunities) {
    const conf = o.sourceIntelligenceId
      ? (allIntelligence as Intelligence[]).find((i) => i.id === o.sourceIntelligenceId)?.confidence
      : undefined;
    if (conf) opportunityConfidence[o.id] = conf;
  }

  // Helper: current period metrics for a category
  const catMetrics = (cat: string) => currentMetrics.filter((m) => m.category === cat);
  // All-period metrics for one canonical LPP Metric Key, for the trend
  // chart (Financial Review refinement Fix 2). Previously scoped by
  // category+unit only, which is too coarse — e.g. "Revenue" category +
  // "$" unit pulls in avg_spend, avg_check, and ~20 unrelated per-dish/
  // per-channel revenue line items alongside total_revenue, and "COGS"
  // category + "%" unit pulls in a dozen individual dish-level food-cost-%
  // records alongside the real cogs_pct series. Confirmed directly
  // against the real KPI Records before touching this — not assumed —
  // this was the actual cause of the malformed trend charts (x-axis
  // repeating one period a dozen times, implausible spikes), not a Notion
  // data-duplication issue. Matches the same canonical-key convention
  // byKey() already uses for point-in-time lookups.
  // metricSeriesForKey collapses roll-up + sub-component siblings to one
  // point per period (total_revenue carries Total / Food / Beverage revenue
  // in the same period) — passing the raw filter gave the chart three
  // points sharing an x value.
  const trendFor = (metricKey: string) => metricSeriesForKey(allMetrics, metricKey);

  // Intelligence by category, scoped to the current period — a category with
  // no record for this period must not fall through to an older one (see
  // findIntelligence in lib/format.ts for the bug this fixes). intelAll
  // returns every Published/Client-Visible record for the category, not
  // just the top one — intel(cat) is its highest-impact pick, kept for
  // sections that only need one record for their primary callout.
  // Previously intel() (then findIntelligence directly) was the only way
  // to read a category, which silently dropped every record beyond the
  // single winner — confirmed real content loss here: "Financial" category
  // has 2 Published/Client-Visible records for Lex Yard's current period,
  // and only the higher-impact one ("Kitchen allocation...") ever
  // rendered, on both Revenue and OpEx (see below).
  const intelAll = (cat: string): Intelligence[] =>
    findAllIntelligence(allIntelligence as Intelligence[], cat, latest);
  const intel = (cat: string): Intelligence | null => intelAll(cat)[0] ?? null;

  // Revenue, OpEx and Profitability all read from the single "Financial"
  // Intelligence bucket — the schema has no field distinguishing which of
  // those sections a record belongs to. Before this fix, both sections
  // called the same single-record lookup and always got the SAME
  // (highest-impact) record, so Revenue's callout was hard-suppressed
  // whenever it matched OpEx's — which was always, since there was only
  // ever one record to find. That silently orphaned the second Financial
  // record ("Dinner cover collapse drives $421K total revenue shortfall")
  // everywhere in the portal. Now that intelAll returns both: OpEx keeps
  // the highest-impact record (unchanged), Revenue gets the next one
  // instead of a hard-coded null — which happens to be exactly the
  // revenue-shortfall finding, a better thematic fit for Revenue anyway.
  // Any further records beyond these two (none currently) render as extra
  // cards inside OpEx's own section below, so nothing in this category is
  // silently dropped regardless of how many records it ever grows to.
  const financialIntelAll = intelAll("Financial");
  const opexIntel = financialIntelAll[0] ?? null;
  const revenueIntel = financialIntelAll[1] ?? null;
  const opexExtraIntel = financialIntelAll.slice(2);

  // Execution-category finding used as brief corroborating context for
  // Revenue's implicit "this is a demand issue, not an execution issue"
  // claim — full operational coverage across every daypart in June rules
  // out a scheduling/staffing gap as the cause of the revenue shortfall.
  // Looked up by its own Finding title (a stable key), same live-lookup
  // convention as noShowIntel on Commercial Review — Execution-category
  // records default to Financial Review already (see INTEL_CATEGORY_TAB in
  // lib/deep-links.ts), so no cross-tab routing fix is needed for this one.
  const opCoverageIntel = findIntelligenceByFinding(
    allIntelligence as Intelligence[],
    "Full operational coverage achieved across all dayparts in June",
    latest
  );

  // KPI lookup by canonical LPP Metric Key, not category/unit/name-guessing
  // (see findMetricByKey in lib/format.ts for the bug this fixes). Segment
  // defaults to "Total" inside findMetricByKey itself, so omitting it here
  // keeps every existing call below unchanged.
  const byKey = (key: string, category?: string, segment?: string) =>
    findMetricByKey(allMetrics, key, latest, category, segment);

  // Precompute the primary metric for each section once — used for KPI
  // cards, driver visuals, and severity fallback alike.
  const totalRevenue = byKey("total_revenue");
  const covers = byKey("covers", "Revenue");
  const avgSpend = byKey("avg_spend");
  const avgCheck = byKey("avg_check");
  // Revenue by type — the same sub-component records the roll-up resolver
  // now steps past for the headline (they share LPP Metric Key
  // total_revenue + Segment "Total"), surfaced here as their own labelled
  // lines. Food + Beverage don't always sum to Total (comps / other
  // revenue), so DriverBreakdown against the real total with a residual,
  // not a StackedSplit that would imply they do.
  // NOTE: the strings below are exact Notion Metric Name literals — they
  // must move in lockstep with any upstream rename of those records.
  const foodRevenue = findMetricByName(allMetrics, "Total Food Revenue", latest, "Revenue");
  const beverageRevenue = findMetricByName(allMetrics, "Total Beverage Revenue", latest, "Revenue");
  const revenueDrivers = [foodRevenue, beverageRevenue].filter((x): x is KpiMetric => x != null);

  const laborCost = byKey("total_payroll");
  const laborPct = byKey("labor_pct");
  // Payroll drivers — the sub-component records that share LPP Metric Key
  // total_payroll + Segment "Total" with the roll-up. Live data splits it
  // "Total Wages" + "Taxes and Benefits"; older Segment-tagged variants
  // ("Wages Total" / "Payroll Taxes" / "Benefits") are kept as fallbacks
  // for any property/period that used them. Each keeps its own Metric Name
  // as the label — no re-blending into generic buckets.
  // NOTE: the strings below are exact Notion Metric Name literals — keep
  // them in lockstep with any upstream rename of those records.
  const wages = findMetricByName(allMetrics, "Total Wages", latest, "Labor") ?? byKey("total_payroll", "Labor", "Wages Total");
  const taxesAndBenefits = findMetricByName(allMetrics, "Taxes and Benefits", latest, "Labor");
  const payrollTaxes = byKey("total_payroll", "Labor", "Payroll Taxes");
  const benefits = byKey("total_payroll", "Labor", "Benefits");
  const laborDrivers = [wages, taxesAndBenefits, payrollTaxes, benefits].filter((x): x is KpiMetric => x != null);

  const cogsDollars = byKey("total_cogs");
  const cogsPct = byKey("cogs_pct");
  // Food vs Beverage cost of sales — sibling records sharing LPP Metric Key
  // total_cogs + Segment "Total" with the roll-up. These do sum exactly to
  // Total Cost of Sales in the live data, so a StackedSplit is honest here.
  // Beverage is one blended figure (beer/wine/liquor not split further).
  // NOTE: the strings below are exact Notion Metric Name literals — keep
  // them in lockstep with any upstream rename of those records.
  const foodCost = findMetricByName(allMetrics, "Food Cost of Sales", latest, "COGS") ?? byKey("total_cogs", "COGS", "Food");
  const beverageCost = findMetricByName(allMetrics, "Beverage Cost of Sales", latest, "COGS") ?? byKey("total_cogs", "COGS", "Beverage");

  const opexDollars = byKey("opex");
  const opexPct = byKey("opex_pct");
  // Explicit allowlist, not a category+unit filter — OpEx also has a "Total
  // Expenses" $ record whose exact scope relative to "Other Operating
  // Expenses" isn't clear from the data (it doesn't reconcile cleanly
  // against opex or against opex + COGS + labor), so it's deliberately
  // excluded rather than guessed into a breakdown it might not belong in.
  // Both "Kitchen Allocation Expense" and bare "Kitchen Allocation" are
  // live Notion Metric Names for the same cost line — confirmed live that
  // Lex Yard's real record uses the "Expense" suffix (matching format.ts's
  // own CANONICAL_METRIC_NAME comment block) while Yoshoku's uses the bare
  // name, so a single string can't match both properties' data. This
  // allowlist previously had only the bare name, which meant it never
  // actually matched Lex Yard's own record — caught live while verifying
  // the new dynamic-driver-naming connector below (it fell back to generic
  // wording, first on Lex Yard with only the bare name allowlisted, then
  // on Yoshoku after switching to only the "Expense" variant).
  const OPEX_DRIVER_NAMES = [
    "Kitchen Allocation Expense",
    "Kitchen Allocation",
    "Plants and Decorations",
    "Consulting Fees",
    "Uniform Cleaning",
  ];
  const opexLineItems = currentMetrics
    .filter((m) => m.category === "OpEx" && OPEX_DRIVER_NAMES.includes(m.metricName))
    .sort((a, b) => b.metricValue - a.metricValue);

  const netProfit = byKey("net_profit");
  const netProfitPct = byKey("net_profit_pct");

  // Section connectors — each is only real content once its own section has
  // real data to back it up. Previously these were plain string literals
  // passed unconditionally, so every connector rendered as a stated fact
  // regardless of whether any KPI data existed underneath it (confirmed
  // live on Peacock Alley, zero financial data published: all five
  // connectors below rendered their claims — "labor did not scale down",
  // "cost control held" — with zero KPI cards or evidence beneath any of
  // them, and the page's one real EmptyState only appears after all five
  // sections have already spoken). Gated on each section's own primary
  // metric — the same one already driving that section's KPI cards/
  // BenchmarkRangeBar — rather than a page-level or shared "any data exists"
  // check, since these five KPI categories are independent Notion records
  // that can arrive on different schedules (a partial P&L upload could
  // populate Revenue/Labor before OpEx/Profitability exist for the same
  // period), so a single all-or-nothing gate would either hide sections
  // that do have real data or keep showing ones that don't.
  const revenueConnector = totalRevenue
    ? "The figures below are this property's own revenue numbers; the demand-side story behind them — daypart mix, guest volume — belongs to Commercial Review."
    : undefined;
  const laborConnector = laborPct
    ? "Following the dinner shortfall above, labor did not scale down to match the reduced volume."
    : undefined;
  const cogsConnector = cogsPct
    ? "Unlike labor, food and beverage cost control held through the same volume decline."
    : undefined;
  // OpEx names whichever line item is actually this property's largest,
  // read from opexLineItems (already sorted by value above) instead of
  // asserting "Kitchen Allocation" for every property. That was previously
  // hardcoded and happened to be correct at both properties with live OpEx
  // data today — Kitchen Allocation is a real, dominant, hotel-shared cost
  // at Lex Yard and Yoshoku — but was correct by coincidence, not by
  // construction. Falls back to generic wording (no item named) when a
  // property has an OpEx total but no itemized driver breakdown yet.
  const opexConnector = opexPct
    ? opexLineItems.length > 0
      ? `The larger structural pressure sits here — the ${opexLineItems[0].metricName} charge below does not flex with revenue the way labor or COGS do.`
      : "The larger structural pressure sits here — the charges below do not flex with revenue the way labor or COGS do."
    : undefined;
  const profitabilityConnector = netProfit
    ? "The combined effect of the revenue shortfall, labor ratio, and OpEx allocation above nets out below."
    : undefined;

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
      <ScrollToSection targetId={scrollTargetId} />
      <NavBar session={session} transparentAtTop />
      {/* Slim, photo-free header (Phase 4B rollout) — every interior tab
          except Overview uses this now; Overview keeps the full photo hero
          as the one deliberate first-impression moment. */}
      <PropertyHeaderSlim property={property} lastUpdated={lastUpdated} />
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

        {/* ── Revenue ──────────────────────────────────────────────────── */}
        {/* Evidence consolidation Part 0/3: Evidence stays visible here
            (collapsed by default, as before) — confirmed live that Revenue
            carries real stray metrics with no stat-block home: Total Covers
            Period + Breakfast/Dinner/Lunch Covers (total_covers_period
            siblings beyond the "Total Revenue Covers" headline), and the
            "Including Comps" + daypart Average Check variants beyond the
            "Excluding Comps" headline. Not hidden. */}
        <FindingSection
          id="revenue"
          heading="Revenue"
          connector={revenueConnector}
          // The second-highest-impact "Financial" record (see
          // financialIntelAll note above) — no longer hard-suppressed to
          // null now that it's a genuinely different record than OpEx's.
          // Falls back to primarySeverity; FindingSection renders no
          // callout for null.
          intelligence={revenueIntel}
          metrics={catMetrics("Revenue")}
          allMetrics={trendFor("total_revenue")}
          primarySeverity={totalRevenue?.severity}
        >
          {/* Full record, not the truncated first-sentence excerpt this used
              to render: "This represents 56 services across four distinct
              formats without a single scheduling gap" — the actual point
              of the finding, not a throwaway detail — was being cut by
              firstSentence(). Same ExtraIntelCard treatment as Commercial
              Review's restored records, with its LPP Perspective toggle
              enabled — the stakes argument (guest trust, hotel partner
              confidence, scheduling gaps as a revenue-loss vector) wasn't
              rendering anywhere either. */}
          {opCoverageIntel && <ExtraIntelCard record={opCoverageIntel} showCommentary />}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {totalRevenue && (
              <KpiCard label={totalRevenue.metricName} value={usd(totalRevenue.metricValue)}
                variant={severityVariant(totalRevenue.severity)} />
            )}
            {covers && (
              <KpiCard label={covers.metricName || "Total Revenue Covers"}
                value={covers.metricValue.toLocaleString()}
                variant="neutral" />
            )}
            {avgSpend && (
              <KpiCard label="Avg Spend" value={usd(avgSpend.metricValue)}
                variant={severityVariant(avgSpend.severity)} />
            )}
            {avgCheck && (
              // Light formatting pass over the record's own name ("Total
              // Food and Beverage Average Check Excluding Comps") — keeps
              // the qualifying "excl. comps" dimension, drops only the
              // redundant "Total Food and Beverage" the Revenue section
              // already implies.
              <KpiCard label="Average Check (excl. comps)" value={usd(avgCheck.metricValue)}
                variant={severityVariant(avgCheck.severity)} />
            )}
          </div>
          {revenueDrivers.length >= 2 && totalRevenue && (
            <DriverBreakdown
              title="Revenue by Type"
              total={totalRevenue.metricValue}
              items={revenueDrivers.map((d) => ({ label: d.metricName, value: d.metricValue }))}
              residualLabel="other revenue (comps, non-F&B)"
            />
          )}
          {/* Deep link to Commercial Review's own ownership of the
              demand-side story (Portal-Wide refinement — dinner-cover
              shortfall is owned by Commercial Review, not re-derived here). */}
          <div className="text-right">
            <Link
              href={`/${clientId}/${propertyId}/commercial#volume-conversion`}
              className="hover:text-[#D4AF7A]"
              style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, textDecoration: "none", transition: "color 0.25s ease" }}
            >
              Demand-side detail in Commercial Review →
            </Link>
          </div>
        </FindingSection>

        {/* ── Labor ────────────────────────────────────────────────────── */}
        <FindingSection
          id="labor"
          heading="Labor"
          connector={laborConnector}
          intelligence={intel("Labor")}
          metrics={catMetrics("Labor")}
          allMetrics={trendFor("labor_pct")}
          primarySeverity={laborPct?.severity}
          // Evidence consolidation Part 0/3: every real Labor-category KPI
          // Record for Lex Yard's current period (Total Payroll/Taxes and
          // Benefits, Total Wages, Taxes and Benefits, Labor %) is already
          // shown above via BenchmarkRangeBar + DriverBreakdown — confirmed
          // against live data, no stray metric exists only in Evidence.
          hideEvidence
        >
          {/* Any Labor-category records beyond the primary one above (none
              currently for Lex Yard) — see ExtraIntelCard's own comment. */}
          {intelAll("Labor").slice(1).map((rec) => (
            <ExtraIntelCard key={rec.id} record={rec} />
          ))}
          <div className="space-y-3">
            {laborPct &&
            laborPct.benchmarkLow != null &&
            laborPct.benchmarkHigh != null &&
            hasRealBenchmark(laborPct.benchmarkLow, laborPct.benchmarkHigh) ? (
              // Range-position indicator in place of the Labor Cost / Labor %
              // / Benchmark Range card trio. laborCost / laborPct bindings are
              // untouched above — Financial Synthesis still reads them.
              <BenchmarkRangeBar
                label="Labor"
                value={laborPct.metricValue}
                low={laborPct.benchmarkLow}
                high={laborPct.benchmarkHigh}
                unit={laborPct.unit}
                target={laborPct.targetValue}
                higherIsBetter={false}
                caption={laborCost ? `total labor cost ${usd(laborCost.metricValue)}` : undefined}
              />
            ) : (
              // No real benchmark on this property/period — keep the cards.
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
            )}
            {laborDrivers.length >= 2 && laborCost && (
              <DriverBreakdown
                title="Labor Cost Drivers"
                total={laborCost.metricValue}
                items={laborDrivers.map((d) => ({ label: d.metricName, value: d.metricValue }))}
                residualLabel="other payroll costs"
              />
            )}
          </div>
        </FindingSection>

        {/* ── COGS ─────────────────────────────────────────────────────── */}
        <FindingSection
          id="cogs"
          heading="Food & Beverage COGS"
          connector={cogsConnector}
          intelligence={intel("COGS")}
          metrics={catMetrics("COGS")}
          allMetrics={trendFor("cogs_pct")}
          primarySeverity={cogsPct?.severity}
          // Evidence consolidation Part 0/3: every real COGS-category KPI
          // Record for Lex Yard's current period (Total Cost of Sales, Food
          // Cost of Sales, Beverage Cost of Sales, COGS %) is already shown
          // above via BenchmarkRangeBar + StackedSplit — confirmed against
          // live data, no stray metric exists only in Evidence.
          hideEvidence
        >
          {/* Any COGS-category records beyond the primary one above (none
              currently for Lex Yard) — see ExtraIntelCard's own comment. */}
          {intelAll("COGS").slice(1).map((rec) => (
            <ExtraIntelCard key={rec.id} record={rec} />
          ))}
          <div className="space-y-3">
            {cogsPct &&
            cogsPct.benchmarkLow != null &&
            cogsPct.benchmarkHigh != null &&
            hasRealBenchmark(cogsPct.benchmarkLow, cogsPct.benchmarkHigh) ? (
              // COGS is a lower-is-better ratio: under the floor is the
              // favorable direction, so higherIsBetter={false} keeps an
              // under-low marker neutral rather than action-red.
              <BenchmarkRangeBar
                label="COGS"
                value={cogsPct.metricValue}
                low={cogsPct.benchmarkLow}
                high={cogsPct.benchmarkHigh}
                unit={cogsPct.unit}
                target={cogsPct.targetValue}
                higherIsBetter={false}
                caption={cogsDollars ? `total cost of sales ${usd(cogsDollars.metricValue)}` : undefined}
              />
            ) : (
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
            )}
            {foodCost && beverageCost && (
              <StackedSplit
                title="Cost of Sales by Type"
                segments={[
                  { label: foodCost.metricName, value: foodCost.metricValue, color: "#B8935A" },
                  { label: beverageCost.metricName, value: beverageCost.metricValue, color: "#12120F" },
                ]}
              />
            )}
          </div>
        </FindingSection>

        {/* ── OpEx ─────────────────────────────────────────────────────── */}
        {/* Evidence consolidation Part 0/3: Evidence stays visible here —
            confirmed live that "opex" + Segment "Total" has a genuine
            3-way collision (Total Expenses $990,467 / Total Other Operating
            Expenses $631,486 / Kitchen Allocation Expense $542,634).
            resolveCanonicalRollup correctly resolves opexDollars to "Total
            Other Operating Expenses", but "Total Expenses" has no
            stat-block home anywhere on this page. Kitchen Allocation
            Expense is meant to surface via OPEX_DRIVER_NAMES below, but
            that DriverBreakdown only renders once opexLineItems.length >= 2
            — Lex Yard's real data has exactly one matching record this
            period, so it doesn't render either, making it a second real
            stray metric this period. Both are only visible via Evidence.
            Not hidden. */}
        <FindingSection
          id="opex"
          heading="Operating Expenses"
          connector={opexConnector}
          // OpEx findings are filed under Intelligence Category "Financial"
          // (alongside Revenue and Profitability) — the schema has no
          // dedicated OpEx value. Previously read "Execution", which
          // surfaced an unrelated operational-coverage record here. OpEx
          // keeps the highest-impact Financial record; the second-highest
          // now renders on Revenue instead of being suppressed (see
          // financialIntelAll / opexIntel / revenueIntel note above).
          intelligence={opexIntel}
          metrics={catMetrics("OpEx")}
          allMetrics={trendFor("opex_pct")}
          primarySeverity={opexPct?.severity}
        >
          {/* Any Financial-category records beyond the two OpEx/Revenue
              already show (none currently for Lex Yard) — kept here rather
              than silently dropped if this category ever grows past 2. */}
          {opexExtraIntel.map((rec) => (
            <ExtraIntelCard key={rec.id} record={rec} />
          ))}
          <div className="space-y-3">
            {opexPct &&
            opexPct.benchmarkLow != null &&
            opexPct.benchmarkHigh != null &&
            hasRealBenchmark(opexPct.benchmarkLow, opexPct.benchmarkHigh) ? (
              // OpEx is a lower-is-better ratio; on live data the value is
              // over the ceiling, which is action-red under any
              // higherIsBetter. Passed explicitly for parity with COGS.
              <BenchmarkRangeBar
                label="Operating Expenses"
                value={opexPct.metricValue}
                low={opexPct.benchmarkLow}
                high={opexPct.benchmarkHigh}
                unit={opexPct.unit}
                target={opexPct.targetValue}
                higherIsBetter={false}
                caption={opexDollars ? `total other operating expenses ${usd(opexDollars.metricValue)}` : undefined}
              />
            ) : (
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
            )}
            {opexLineItems.length >= 2 && opexDollars && (
              <DriverBreakdown
                title="Operating Expense Drivers"
                total={opexDollars.metricValue}
                items={opexLineItems.map((d) => ({ label: d.metricName, value: d.metricValue }))}
                residualLabel="other operating costs"
              />
            )}
          </div>
        </FindingSection>

        {/* ── Profitability — distinct layout as the page's conclusion ──── */}
        {/* Evidence consolidation Part 0/3: Evidence stays visible here —
            confirmed live that both net_profit and net_profit_pct collide
            with a sibling "Gross Profit" pair (Gross Profit $464,342 /
            76.3%) at the same key + Segment "Total". CANONICAL_METRIC_NAME
            correctly resolves netProfit/netProfitPct to "Departmental
            Profit/(Loss)" (-$526,125 / -86.5%, matching the live Overview
            figure), but the real Gross Profit $ and % records have no
            stat-block home anywhere on this page — genuine stray metrics,
            only visible via Evidence. Not hidden. */}
        <FindingSection
          id="profitability"
          heading="Profitability"
          connector={profitabilityConnector}
          intelligence={intel("Profitability")}
          metrics={catMetrics("Profitability")}
          allMetrics={trendFor("net_profit_pct")}
          primarySeverity={netProfitPct?.severity}
        >
          {/* Any Profitability-category records beyond the primary one
              above (none currently for Lex Yard) — see ExtraIntelCard's
              own comment. */}
          {intelAll("Profitability").slice(1).map((rec) => (
            <ExtraIntelCard key={rec.id} record={rec} />
          ))}
          <div className="space-y-3">
            {/* Outer shell gated on netProfitPct (Peacock Alley black-box
                fix) — this "hero stat card" background/padding used to
                render unconditionally while only the value lines inside it
                checked for real data, so a property with zero Profitability
                data got an empty dark box with just the "Net Profit Margin"
                label. Same gating convention every other stat element on
                this page already uses, and the same condition ProfitBridge
                below already gates on. */}
            {netProfitPct && (
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
            )}

            {/* Actual-P&L waterfall — additive, alongside the card above, not
                a replacement (Phase 3 decision to leave that card as built). */}
            {totalRevenue && cogsDollars && laborCost && opexDollars && netProfit && (
              <ProfitBridge
                revenue={{ label: "Total Revenue", value: totalRevenue.metricValue }}
                steps={[
                  { label: "less Cost of Sales", value: cogsDollars.metricValue },
                  { label: "less Labor", value: laborCost.metricValue },
                  { label: "less Operating Expenses", value: opexDollars.metricValue },
                ]}
                result={{
                  label: netProfit.metricValue < 0 ? "Departmental Loss" : "Departmental Profit",
                  value: netProfit.metricValue,
                }}
              />
            )}
          </div>
        </FindingSection>

        {/* ── Opportunities — Labor/OpEx/Purchasing, Redesign prompt Step 1 ── */}
        <OpportunitiesPanel opportunities={financialOpportunities} id="opportunities" confidenceById={opportunityConfidence} showTotalValue={true} />

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
