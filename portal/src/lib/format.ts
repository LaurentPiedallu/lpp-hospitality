import type { KpiMetric, Intelligence, Action } from "@/types/portal";

// Detects KPI Records whose Metric Name identifies an individual staff
// member (e.g. "Will Service Server Score", "Hector T Server Overall
// Score", "Javier Food Server Score") rather than a generic/aggregate
// metric (e.g. "Server Confidence Score", "Guest Sentiment Score", "Sunday
// Overall Score", "Event Overall Score"). This is an interim display-layer
// filter — the durable fix is tagging these records as individual-level at
// the point of extraction (Scenario B / Make), tracked separately, so they
// never reach this layer at all.
//
// Structural pattern: a capitalized first word that isn't known generic
// vocabulary (day names, "Overall", "Guest", "Event", etc.), optionally
// followed by a single-letter last initial, followed by up to two more
// capitalized words and ending in "Score" — loose enough to catch varying
// middle content ("Service Server", "Food Server", "Overall Server") rather
// than requiring one specific word to immediately follow the name, which an
// earlier version of this pattern did and which missed "Javier Food Server
// Score" on a real property (caught only after re-verifying against every
// property's real Guest Experience metric names, not just one). Verified
// against every real Guest Experience metric name across all 3 live
// properties at the time this was written — but it's a heuristic on
// free-text names, not a real link to a "this is personal data" flag, so it
// won't catch every possible future naming pattern.
const GENERIC_METRIC_FIRST_WORDS = new Set([
  "Overall", "Guest", "Server", "Host", "Food", "Atmosphere", "Restroom", "Restaurant",
  "Hospitality", "Likelihood", "Total", "Average", "Service", "Event",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]);

const INDIVIDUAL_METRIC_PATTERN = /^([A-Z][a-z]+)(\s[A-Z]\.?)?\s+(?:[A-Z][a-z]+\s+){0,2}(Score)$/;

// Returns the individual's name (e.g. "Hector T", "Will") as it appears at
// the start of the metric name, or null if the name looks generic/structural
// rather than personal (see GENERIC_METRIC_FIRST_WORDS).
function extractIndividualName(metricName: string): string | null {
  const match = metricName.match(INDIVIDUAL_METRIC_PATTERN);
  if (!match) return null;
  if (GENERIC_METRIC_FIRST_WORDS.has(match[1])) return null;
  return match[2] ? `${match[1]}${match[2]}` : match[1];
}

export function looksLikeIndividualStaffMetric(metricName: string): boolean {
  return extractIndividualName(metricName) != null;
}

// Collects the distinct individual-staff names found across a property's KPI
// Records (via the same detection as looksLikeIndividualStaffMetric above),
// across all periods — used as a defensive, interim filter against other
// free-text fields (e.g. Opportunity title/Next Step) that can independently
// name a staff member without going through a KPI Record's Metric Name at
// all. See mentionsIndividualStaff.
export function extractIndividualStaffNames(metrics: KpiMetric[]): string[] {
  const names = new Set<string>();
  for (const m of metrics) {
    const name = extractIndividualName(m.metricName || m.kpiRecord);
    if (name) names.add(name);
  }
  return [...names];
}

// Whole-word match against a known individual-staff name (e.g. matches
// "Will" in "Restructure Will's section assignments" via the word boundary
// before the possessive apostrophe, but never matches inside an unrelated
// longer word). Case-sensitive, since these are always proper nouns pulled
// from real Guest Experience metric names — verified against every real
// Opportunity title/Next Step for this property (2 correctly flagged out of
// 42, 0 false positives), but it's a heuristic on free text, not a real
// link to a "this is personal data" flag.
export function mentionsIndividualStaff(text: string, names: string[]): boolean {
  return names.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
}

export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function pct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatPeriod(isoDate: string | null): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate + "T12:00:00Z"); // noon UTC avoids timezone edge cases
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Short "Mon D" date, e.g. "Sep 14". Empty string for null / unparseable.
// Noon UTC keeps the day stable across timezones, same as formatPeriod.
export function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Whole days from `fromIso` to `toIso` (both yyyy-mm-dd or ISO). Positive
// when `toIso` is later. 0 if either is unparseable.
export function daysBetweenIso(fromIso: string | null, toIso: string | null): number {
  if (!fromIso || !toIso) return 0;
  const a = Date.parse(fromIso.slice(0, 10));
  const b = Date.parse(toIso.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

const ACTION_PRIORITY_RANK: Record<Action["priority"], number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

// Incomplete Actions first, completed ones sink to the bottom. Within each
// group: by priority Critical to Low, then by due date with undated last.
// Shared by the Initiatives tab card and its nested Action list so the
// "highest-priority open Action" is the same in both.
export function sortActions(actions: Action[]): Action[] {
  return [...actions].sort((a, b) => {
    const aDone = a.status === "Complete" ? 1 : 0;
    const bDone = b.status === "Complete" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    const byPriority = ACTION_PRIORITY_RANK[a.priority] - ACTION_PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;

    if (!a.dueDateIso && !b.dueDateIso) return 0;
    if (!a.dueDateIso) return 1;
    if (!b.dueDateIso) return -1;
    return a.dueDateIso.localeCompare(b.dueDateIso);
  });
}

export function compact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return usd(value);
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minute = 60_000, hour = 3_600_000, day = 86_400_000;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) {
    const m = Math.floor(diffMs / minute);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(diffMs / day);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const months = Math.floor(d / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// Latest of a set of ISO timestamp strings (nulls ignored). Plain string
// comparison is valid here since all inputs are ISO 8601 UTC.
export function maxIso(dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => d != null);
  return valid.length === 0 ? null : valid.reduce((max, d) => (d > max ? d : max));
}

// Real-vs-placeholder benchmark check (Financial Review refinement Fix 4,
// now shared portal-wide) — Notion represents "no benchmark set yet" as
// literal Benchmark Low/High = 0/0 on many records, not as a null field. A
// naive `!= null` check treats 0/0 as a real range, rendering a fake "0-0"
// band. Shared by FindingSection (Financial Review) and CommercialSection
// (Commercial Review) rather than kept as two separate copies.
export function hasRealBenchmark(low: number | null | undefined, high: number | null | undefined): boolean {
  return low != null && high != null && !(low === 0 && high === 0);
}

// The exact Metric Name of the one true roll-up record for each financial
// roll-up LPP Metric Key. The upstream pipeline tags several Published KPI
// Records with the SAME key + Segment ("Total") + KPI Category — the roll-up
// plus its sub-components:
//   total_revenue  → "Total Revenue" | "Total Food Revenue" | "Total Beverage Revenue"
//   total_cogs     → "Total Cost of Sales" | "Food Cost of Sales" | "Beverage Cost of Sales"
//   total_payroll  → "Total Payroll, Taxes and Benefits" | "Total Wages" | "Taxes and Benefits"
//   opex           → "Total Other Operating Expenses" | "Total Expenses" | "Kitchen Allocation Expense"
//   net_profit     → "Departmental Profit/(Loss)" | "Gross Profit"
// so key + Segment alone no longer identifies one record, and a bare
// .find() returns whichever Notion stored first. Confirmed live-wrong on
// Lex Yard, June 2026: Overview's Revenue card showed $154K (the Beverage
// revenue line), Labor $ showed $152,723 (Taxes and Benefits), Food COGS $
// showed $25,782 (Beverage Cost of Sales) — instead of the $608,445 /
// $358,980 / $144,103 roll-ups that exist in the same period. The *_pct
// twins below are single-record and unambiguous today; they're pinned here
// too so a future sub-component %-record can't reintroduce the collision.
//
// opex and net_profit are a second collision shape: not a total plus its
// components, but two legitimate headline figures both tagged Segment
// "Total". Confirmed live on Yoshoku's first P&L upload (2026-08) — opex
// carried "Total Other Operating Expenses" $143,256 vs "Total Expenses"
// $250,277; net_profit carried "Departmental Profit/(Loss)" -$112,669 vs
// "Gross Profit" +$137,607. Both already resolve to the right record via
// the entries below; the guard test also pins these two keys explicitly
// since they don't match the total_* / *_pct shape it keys off.
export const CANONICAL_METRIC_NAME: Record<string, string> = {
  total_revenue: "Total Revenue",
  total_cogs: "Total Cost of Sales",
  cogs_pct: "Total Cost of Sales Percentage",
  total_payroll: "Total Payroll, Taxes and Benefits",
  labor_pct: "Total Payroll, Taxes and Benefits Percentage",
  opex: "Total Other Operating Expenses",
  opex_pct: "Total Other Operating Expenses Percentage",
  net_profit: "Departmental Profit/(Loss)",
  net_profit_pct: "Departmental Profit/(Loss) Percentage",
  // Covers: the revenue-generating cover count ("Total Revenue Covers" =
  // 7,040 for Lex Yard June — reconciles with Total Revenue ÷ avg check:
  // 608,445 / 7,040 ≈ 86.43). Siblings tagged Segment "Total": "Total
  // Covers Period" (7,453, includes comped covers) and the Breakfast /
  // Lunch / Dinner daypart counts the pipeline also mistags as "Total".
  total_covers_period: "Total Revenue Covers",
  // Average check: the standard revenue ÷ covers figure, comps excluded
  // ("Total Food and Beverage Average Check Excluding Comps" = $86.43).
  // Siblings: "Food and Beverage Average Check Including Comps" ($78.12) and
  // "Food Average Check Including Comps" ($57.50) — kept as breakdown
  // lines, never the headline.
  avg_check: "Total Food and Beverage Average Check Excluding Comps",
  // Keys introduced by the one-Total-per-key tagging rule. Each should only
  // ever carry one Segment "Total" record, but they're pinned so the guard
  // test covers them like every other roll-up.
  total_expenses: "Total Expenses",
  gross_profit_pct: "Gross Profit Percentage",
};

// Legacy LPP Metric Key values that call sites still pass but no live KPI
// Record uses any more — the underlying records were re-tagged. Confirmed
// against every property/period: zero records carry "covers" today, they
// are all "total_covers_period". Aliased here so the old key keeps
// resolving instead of silently returning null (which is what dropped the
// covers total off Overview and Commercial Review).
export const KEY_ALIAS: Record<string, string> = {
  covers: "total_covers_period",
};

// Segment a record is filed under — a blank/null Segment counts as "Total".
// Segment is a second axis added after a lot of KPI Records already existed
// and were Published, and blank-means-Total was a deliberate backward-
// compatibility choice so nothing already Published needed to change.
function segmentOf(m: KpiMetric): string {
  return m.segment || "Total";
}

// Keys whose headline figure is defined as EXCLUDING comps. When a period
// has no such record (only a comps-inclusive one, Segment "Including
// Comps"), the resolver falls back to that record and callers label it
// "incl. comps" — see isIncludingComps. Confirmed on Lex Yard's July 2026
// upload: covers and average check arrive only as Including Comps.
const COMPS_FALLBACK_KEYS = new Set(["avg_check", "total_covers_period"]);
export const INCLUDING_COMPS_SEGMENT = "Including Comps";

// True when a resolved headline is the comps-inclusive fallback record
// rather than the comps-excluded headline — the UI must say "incl. comps".
export function isIncludingComps(m: KpiMetric | null | undefined): boolean {
  return m != null && m.segment === INCLUDING_COMPS_SEGMENT;
}

function canonicalMatch(pool: KpiMetric[], key: string): KpiMetric | null {
  const canonicalName = CANONICAL_METRIC_NAME[key];
  if (!canonicalName) return null;
  const target = canonicalName.toLowerCase();
  const exact = pool.filter((m) => (m.metricName || "").trim().toLowerCase() === target);
  return exact.length === 1 ? exact[0] : null;
}

// From the KPI Records that share one LPP Metric Key + period (+ optional
// category), across every Segment, return the single record for `segment`
// (default "Total", the headline). Works with both tagging conventions:
//
//   New tagging — Segment "Total" sits on exactly one record per (property,
//   period, key); components carry their own Segment (Food, Beverage,
//   Wages Total, Including Comps, ...). Step 1 picks it directly.
//
//   Old tagging — the pipeline put the roll-up AND its sub-components all
//   on Segment "Total" (Lex Yard June 2026: Total Revenue / Total Food
//   Revenue / Total Beverage Revenue). Step 2 picks the roll-up by its
//   exact CANONICAL_METRIC_NAME.
//
// Then, for avg_check / total_covers_period headlines only, step 3 falls
// back to the Segment "Including Comps" record (see isIncludingComps).
//
// The last fall-through (>1 candidate, nothing unique) is the exact failure
// mode this function exists to prevent — a bare first-match on a collision.
// It stays reachable (a new roll-up key, an upstream Metric Name rename, or
// two records sharing the canonical name), so it logs loudly rather than
// picking silently.
export function resolveCanonicalRollup(
  candidates: KpiMetric[],
  key: string,
  segment: string = "Total"
): KpiMetric | null {
  const pool = candidates.filter((m) => segmentOf(m) === segment);
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) {
    const canonical = canonicalMatch(pool, key);
    if (canonical) return canonical;
  }
  if (segment === "Total" && COMPS_FALLBACK_KEYS.has(key)) {
    const inclComps = candidates.filter((m) => m.segment === INCLUDING_COMPS_SEGMENT);
    if (inclComps.length === 1) return inclComps[0];
  }
  if (pool.length === 0) return null;
  console.warn(
    `[resolveCanonicalRollup] ${pool.length} records share key "${key}" + segment "${segment}"; ` +
      `no unique CANONICAL_METRIC_NAME match — using "${pool[0].metricName}". ` +
      `Candidates: ${pool.map((c) => `${c.metricName}=${c.metricValue}`).join(" | ")}. ` +
      `Add "${key}" to CANONICAL_METRIC_NAME in lib/format.ts.`
  );
  return pool[0];
}

// Looks up a single KPI Record by its canonical LPP Metric Key for a
// specific period — never by category/unit/name-substring, which silently
// picks up whichever sibling record happens to share those (e.g. matching
// "Labor" + "$" alone returns "Sick Pay" just as readily as the intended
// "Total Payroll" record). Optional category constrains further for keys
// reused across categories for different concepts (e.g. "covers" also
// exists under Guest Experience as a survey sample size, distinct from the
// real total under Revenue).
//
// Segment defaults to "Total" — the headline figure (blank Segment counts as
// Total). Pass an explicit segment (e.g. "Breakfast", "Food", "Wages
// Total") to get a specific slice instead. resolveCanonicalRollup does the
// picking — see its comment for how both tagging conventions resolve.
export function findMetricByKey(
  metrics: KpiMetric[],
  key: string,
  periodStart: string | null,
  category?: string,
  segment: string = "Total"
): KpiMetric | null {
  const resolvedKey = KEY_ALIAS[key] ?? key;
  const candidates = metrics.filter(
    (m) =>
      m.lppMetricKey === resolvedKey &&
      m.periodStart === periodStart &&
      (!category || m.category === category)
  );
  return resolveCanonicalRollup(candidates, resolvedKey, segment);
}

// All-period series for one LPP Metric Key, for trend charts. Resolves the
// headline once per period exactly like findMetricByKey — so a key that
// carries a roll-up plus sub-component siblings in the same period
// contributes ONE point per period, not one per sibling (several points
// sharing an x value gave the trend charts a malformed axis).
//
// Comps-inclusive fallback points (see isIncludingComps) are dropped when
// the series also has comps-excluded points, so one line never mixes the
// two definitions (Lex Yard: June 7,040 revenue covers vs July 12,405
// covers incl. comps would read as a 76% jump that isn't real).
export function metricSeriesForKey(
  metrics: KpiMetric[],
  key: string,
  category?: string
): KpiMetric[] {
  const resolvedKey = KEY_ALIAS[key] ?? key;
  const periods = [
    ...new Set(
      metrics
        .filter((m) => m.lppMetricKey === resolvedKey && (!category || m.category === category))
        .map((m) => m.periodStart)
    ),
  ];
  const series = periods
    .map((p) => findMetricByKey(metrics, resolvedKey, p, category))
    .filter((m): m is KpiMetric => m != null);
  const hasExclComps = series.some((m) => !isIncludingComps(m));
  return hasExclComps ? series.filter((m) => !isIncludingComps(m)) : series;
}

// A sub-component of a roll-up (Food revenue, Beverage cost of sales, Total
// Wages, ...). Looks up by key + its own Segment first (the current tagging
// rule), then falls back to the exact Metric Names older Published records
// carry on Segment "Total" (Lex Yard June 2026). The names are exact Notion
// Metric Name literals — they must move in lockstep with any upstream
// rename of those records, until those records are re-tagged.
export function findComponent(
  metrics: KpiMetric[],
  key: string,
  segment: string,
  legacyNames: string[],
  periodStart: string | null,
  category?: string
): KpiMetric | null {
  const bySegment = findMetricByKey(metrics, key, periodStart, category, segment);
  if (bySegment) return bySegment;
  for (const name of legacyNames) {
    const byName = findMetricByName(metrics, name, periodStart, category);
    if (byName) return byName;
  }
  return null;
}

export interface FinancialComponents {
  foodRevenue: KpiMetric | null;
  beverageRevenue: KpiMetric | null;
  foodCost: KpiMetric | null;
  beverageCost: KpiMetric | null;
  wages: KpiMetric | null;
  // The combined Taxes and Benefits record, when one exists.
  taxesAndBenefits: KpiMetric | null;
  payrollTaxes: KpiMetric | null;
  benefits: KpiMetric | null;
  // Taxes and Benefits as one figure: the combined record, else Payroll
  // Taxes + Benefits summed when both exist, else null.
  taxesAndBenefitsValue: number | null;
}

// Every roll-up sub-component Overview and Financial Review break out, for
// one period — one shared lookup so the two pages can't drift apart.
export function findFinancialComponents(metrics: KpiMetric[], periodStart: string | null): FinancialComponents {
  const c = (key: string, segment: string, names: string[], category: string) =>
    findComponent(metrics, key, segment, names, periodStart, category);
  const taxesAndBenefits = c("total_payroll", "Taxes and Benefits", ["Taxes and Benefits"], "Labor");
  const payrollTaxes = findMetricByKey(metrics, "total_payroll", periodStart, "Labor", "Payroll Taxes");
  const benefits = findMetricByKey(metrics, "total_payroll", periodStart, "Labor", "Benefits");
  return {
    foodRevenue: c("total_revenue", "Food", ["Total Food Revenue"], "Revenue"),
    beverageRevenue: c("total_revenue", "Beverage", ["Total Beverage Revenue"], "Revenue"),
    foodCost: c("total_cogs", "Food", ["Food Cost of Sales"], "COGS"),
    beverageCost: c("total_cogs", "Beverage", ["Beverage Cost of Sales"], "COGS"),
    wages: c("total_payroll", "Wages Total", ["Total Wages"], "Labor"),
    taxesAndBenefits,
    payrollTaxes,
    benefits,
    taxesAndBenefitsValue: taxesAndBenefits
      ? taxesAndBenefits.metricValue
      : payrollTaxes && benefits
        ? payrollTaxes.metricValue + benefits.metricValue
        : null,
  };
}

// Where a value sits against a real benchmark range — null when there's no
// real benchmark (see hasRealBenchmark), so copy built on it can be omitted.
export function benchmarkPosition(
  value: number,
  low: number | null | undefined,
  high: number | null | undefined
): "below" | "within" | "above" | null {
  if (!hasRealBenchmark(low, high)) return null;
  if (value < (low as number)) return "below";
  if (value > (high as number)) return "above";
  return "within";
}

// Client-facing copy helpers. House style for generated sentences: no
// dashes joining clauses or ranges, no parentheses, no minus sign before a
// percentage, numbers always formatted.

function plainNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1);
}

// "34 to 40%" or "$90 to $160" — a benchmark range written out in words.
export function benchmarkRange(low: number | null | undefined, high: number | null | undefined, unit: "%" | "$"): string {
  if (low == null || high == null) return "";
  return unit === "$" ? `${usd(low)} to ${usd(high)}` : `${plainNumber(low)} to ${plainNumber(high)}%`;
}

// "negative 86.5%" rather than "-86.5%".
export function signedPctWords(value: number): string {
  return value < 0 ? `negative ${pct(Math.abs(value))}` : pct(value);
}

// One label per sub-component, from its Segment, so every property reads
// identically whatever its records' Metric Names say.
export const COMPONENT_LABEL = {
  foodRevenue: "Food revenue",
  beverageRevenue: "Beverage revenue",
  foodCost: "Food cost of sales",
  beverageCost: "Beverage cost of sales",
  wages: "Wages",
  taxesAndBenefits: "Taxes and benefits",
  payrollTaxes: "Payroll taxes",
  benefits: "Benefits",
} as const;
export type ComponentKey = keyof typeof COMPONENT_LABEL;

// The present components among `keys`, labelled by COMPONENT_LABEL.
export function componentLines(c: FinancialComponents, keys: ComponentKey[]): { label: string; value: number }[] {
  return keys.flatMap((k) => {
    const m = c[k];
    return m ? [{ label: COMPONENT_LABEL[k], value: m.metricValue }] : [];
  });
}

// OpEx line item label: sentence case, trailing "Expense" dropped, so Lex
// Yard's "Kitchen Allocation Expense" and Yoshoku's "Kitchen Allocation"
// both read "Kitchen allocation".
export function opexLineLabel(metricName: string): string {
  const base = metricName.trim().replace(/\s+Expenses?$/i, "");
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}

// Guest headline for a period whose guest scores aren't uniformly Healthy:
// names which core dimensions held at healthy levels and which scored
// below target, from each dimension record's own Severity. Null when the
// period has none of the three records.
const GUEST_DIMENSIONS: [string, string][] = [
  ["service", "guest_service"],
  ["ambiance", "guest_ambiance"],
  ["food", "guest_food"],
];
export function guestDimensionSentence(metrics: KpiMetric[], periodStart: string | null): string | null {
  const present = GUEST_DIMENSIONS
    .map(([label, key]) => ({ label, m: findMetricByKey(metrics, key, periodStart) }))
    .filter((d): d is { label: string; m: KpiMetric } => d.m != null);
  if (present.length === 0) return null;
  const join = (items: string[]) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const held = present.filter((d) => d.m.severity === "Healthy").map((d) => d.label);
  const below = present.filter((d) => d.m.severity !== "Healthy").map((d) => d.label);
  const all = present.length > 1 ? " all" : "";
  if (below.length === 0) return `${cap(join(held))}${all} held at healthy levels this period.`;
  if (held.length === 0) return `${cap(join(below))}${all} scored below target this period.`;
  return `${cap(join(held))} held at healthy levels; ${join(below)} scored below target this period.`;
}

// Survey response count for one period: the survey_count key (current
// tagging), else the exact names older records carry under "unclassified"
// ("Survey Count" on Lex Yard / Peacock Alley, "Survey Response Count" on
// Yoshoku).
const SURVEY_COUNT_NAMES = ["Survey Count", "Survey Response Count"];
export function findSurveyCount(metrics: KpiMetric[], periodStart: string | null): KpiMetric | null {
  const byKey = findMetricByKey(metrics, "survey_count", periodStart);
  if (byKey) return byKey;
  for (const name of SURVEY_COUNT_NAMES) {
    const byName = findMetricByName(metrics, name, periodStart);
    if (byName) return byName;
  }
  return null;
}

// This period's survey count against the property's own most recent earlier
// period that has one. Null when either side is missing — callers must then
// say nothing about a change in survey volume.
export function surveyVolumeChange(
  metrics: KpiMetric[],
  periodStart: string | null
): { current: number; prior: number; priorPeriod: string; changePct: number } | null {
  if (!periodStart) return null;
  const current = findSurveyCount(metrics, periodStart);
  if (!current) return null;
  const earlier = [...new Set(metrics.map((m) => m.periodStart).filter((p): p is string => !!p && p < periodStart))]
    .sort()
    .reverse();
  for (const p of earlier) {
    const prior = findSurveyCount(metrics, p);
    if (prior && prior.metricValue > 0) {
      return {
        current: current.metricValue,
        prior: prior.metricValue,
        priorPeriod: p,
        changePct: ((current.metricValue - prior.metricValue) / prior.metricValue) * 100,
      };
    }
  }
  return null;
}

// Exact Metric Name lookup within a period (+ optional category). For the
// sub-component sibling records that share an LPP Metric Key with their
// roll-up and so can't be told apart by key + segment — Food vs Beverage
// revenue, Food vs Beverage cost of sales, Total Wages vs Taxes and
// Benefits, the comps-included average checks. Case-insensitive, trimmed.
// Returns the first match; these names are unique within a property/period
// in the live data.
export function findMetricByName(
  metrics: KpiMetric[],
  name: string,
  periodStart: string | null,
  category?: string
): KpiMetric | null {
  const target = name.trim().toLowerCase();
  return (
    metrics.find(
      (m) =>
        (m.metricName || "").trim().toLowerCase() === target &&
        m.periodStart === periodStart &&
        (!category || m.category === category)
    ) ?? null
  );
}

// Every Intelligence record for a category, scoped to a specific period —
// critically, period-scoped, unlike a bare category filter. Without that, a
// category with no record for the current period silently falls through to
// an older period's record with the same category (confirmed cause of a
// real bug: Financial Review's COGS narrative was showing a March record
// because June's COGS finding happened to be categorized "Data Quality"
// instead of "COGS").
//
// Sorted by Estimated Annual Impact descending, the same "more financially
// material finding leads" ordering findIntelligence below has always used
// for picking a single record — this just keeps the rest instead of
// discarding them. Confirmed a real content-loss bug: a bare .find()/single
// -pick read of this same data silently dropped 5 of Commercial Review's 6
// Commercial-category records and 1 of Financial Review's 2 Financial
// -category records (one of which — a $421K revenue-shortfall finding —
// had no other home anywhere in the portal, since Revenue's callout was
// separately hard-suppressed whenever it matched OpEx's).
export function findAllIntelligence(
  intelligence: Intelligence[],
  category: string,
  periodStart: string | null
): Intelligence[] {
  return intelligence
    .filter((i) => i.category === category && i.periodStart === periodStart)
    .sort((a, b) => b.estimatedAnnualImpact - a.estimatedAnnualImpact);
}

// The single most financially material Intelligence record for a category
// — the first result of findAllIntelligence above. Kept as its own function
// (rather than inlining `findAllIntelligence(...)[0] ?? null` at every call
// site) since most callers only ever want one record for a section's
// primary callout; Menu Engineering is still on this single-record form,
// unchanged, since it currently has no Menu-category record to lose (a
// second one would silently drop the same way Commercial/Financial's did
// until this fix — worth revisiting if that ever populates).
export function findIntelligence(
  intelligence: Intelligence[],
  category: string,
  periodStart: string | null
): Intelligence | null {
  return findAllIntelligence(intelligence, category, periodStart)[0] ?? null;
}

// Looks up one specific Intelligence record by its Finding title — the only
// per-record stable key Intelligence carries — rather than by category.
// Same exact-match/period-scoped convention as findMetricByName above,
// applied to Intelligence instead of KpiMetric. Needed when a page wants one
// named record as corroborating context for a different section than that
// record's own Intelligence Category would default to (e.g. an
// Execution-category finding surfaced on Commercial or Financial Review
// instead of wherever Execution normally routes) — findIntelligence's
// category+impact resolution can't target one specific record by title, and
// shouldn't be loosened to try, since every other caller relies on it
// picking within a category. Period-scoped for the same reason
// findIntelligence is: a record for an older period must not silently keep
// showing once a newer period exists without a same-titled record of its
// own — this returns null in that case, not stale content.
export function findIntelligenceByFinding(
  intelligence: Intelligence[],
  finding: string,
  periodStart: string | null
): Intelligence | null {
  const target = finding.trim().toLowerCase();
  return (
    intelligence.find(
      (i) => i.finding.trim().toLowerCase() === target && i.periodStart === periodStart
    ) ?? null
  );
}

// Splits a block of prose into up to `targetCount` paragraphs by grouping
// consecutive sentences into roughly-equal-sized chunks. This is a purely
// structural split, not a summary — it doesn't shorten or reword the text,
// just breaks a dense paragraph into shorter, easier-to-scan ones. Source
// text that doesn't cleanly separate into distinct ideas (e.g. every
// sentence carries both a finding and a call to action) will still produce
// paragraphs that read a bit mixed — that's a content problem the split
// itself can't fix.
export function splitIntoParagraphs(text: string, targetCount = 3): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)/g)?.map((s) => s.trim()) ?? [trimmed];
  const count = Math.min(targetCount, sentences.length);
  if (count <= 1) return [sentences.join(" ")];

  const base = Math.floor(sentences.length / count);
  const remainder = sentences.length % count;
  const paragraphs: string[] = [];
  let i = 0;
  for (let g = 0; g < count; g++) {
    const size = base + (g < remainder ? 1 : 0);
    paragraphs.push(sentences.slice(i, i + size).join(" "));
    i += size;
  }
  return paragraphs;
}

// First sentence of a block of prose, terminal period included — used to
// truncate a long Intelligence-record currentRead to a headline-length
// excerpt (Overview's Strategic Risks card) without hand-tuning the split
// to whatever the current live text happens to say, since which
// Intelligence record gets selected there is itself dynamic. Splits on
// the first literal ". " (period + space) rather than the [.!?]+ sentence
// regex splitIntoParagraphs above uses, deliberately: that regex treats
// any bare "." as a sentence end, which would wrongly cut a real dollar
// figure like "$12.80 more" off after "$12." A decimal is never followed
// by a space before its next digit, so this is safe against that failure
// mode; it doesn't try to handle "!"/"?" endings or abbreviations like
// "Mr." (not a mistake — this codebase's real Intelligence-record prose
// doesn't use either), so if a future record's text makes it read badly,
// the split point should change, not the rest of the display logic.
// Falls back to the full trimmed text when no ". " exists at all, so a
// single-sentence or unpunctuated record still renders something instead
// of nothing.
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const idx = trimmed.indexOf(". ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx + 1);
}

// Splits a Brief's Critical Drivers (or Recommended Focus) field into
// individual lines. Confirmed directly against the raw Notion API payload
// (not any rendered/cached view of it) that the Make-generated content is
// "\n"-separated within a single rich_text block — e.g. "Cover momentum
// stalling...\nSick pay anomalies...\n...". Explicit split on that
// confirmed delimiter, not a fuzzy regex, per the same reasoning as the
// rest of this file: match exactly what the source data actually does, not
// what it's assumed to do. Recommended Focus only ever has 1 real item in
// the live data so far, but the same delimiter convention applies if it's
// ever 2 (per the Brief's own "1-2 numbered items" spec).
export function parseTextLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface DaypartCoversEntry {
  day: string;      // canonical day name, e.g. "Monday"
  daypart: string;  // canonical daypart name, e.g. "Breakfast"
  covers: number;
}

// Fixed display order — not derived from the source string, which isn't
// reliable (see parseDaypartPattern below).
export const CANONICAL_DAY_ORDER = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
export const CANONICAL_DAYPART_ORDER = ["Breakfast", "Brunch", "Lunch", "Dinner"];

const DAY_ALIASES: Record<string, string> = {
  mon: "Monday", monday: "Monday",
  tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
  wed: "Wednesday", weds: "Wednesday", wednesday: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", thursday: "Thursday",
  fri: "Friday", friday: "Friday",
  sat: "Saturday", saturday: "Saturday",
  sun: "Sunday", sunday: "Sunday",
};

const DAYPART_ALIASES: Record<string, string> = {
  bkft: "Breakfast", brkfst: "Breakfast", bfast: "Breakfast", breakfast: "Breakfast",
  brunch: "Brunch",
  lunch: "Lunch",
  dinner: "Dinner",
};

// Parses a "Daypart Pattern Summary" KPI Record's Source Notes field —
// semicolon-separated day segments, each "{Day}: {Daypart} {covers} /
// {Daypart} {covers} / ...". Deliberately tolerant of real inconsistency
// confirmed directly against the live API payload: day/daypart
// abbreviations vary between records for the same property/period ("Bkft"
// / "Brkfst" / "Breakfast" all seen for the same daypart across draft
// revisions), the string's own day order isn't reliable (one real record
// started on Sunday instead of Monday), and not every day has the same set
// of dayparts present. Unrecognized day or daypart tokens are skipped
// rather than thrown on, so one malformed segment doesn't take down the
// whole grid — callers should re-sort into CANONICAL_DAY_ORDER themselves
// rather than trust the order entries come back in.
export function parseDaypartPattern(sourceNotes: string): DaypartCoversEntry[] {
  const entries: DaypartCoversEntry[] = [];
  const daySegments = sourceNotes.split(";").map((s) => s.trim()).filter(Boolean);

  for (const segment of daySegments) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) continue;
    const day = DAY_ALIASES[segment.slice(0, colonIdx).trim().toLowerCase()];
    if (!day) continue;

    const dayparts = segment.slice(colonIdx + 1).split("/");
    for (const token of dayparts) {
      const match = token.trim().match(/^([A-Za-z]+)\s+(\d+)$/);
      if (!match) continue;
      const daypart = DAYPART_ALIASES[match[1].toLowerCase()];
      if (!daypart) continue;
      entries.push({ day, daypart, covers: parseInt(match[2], 10) });
    }
  }

  return entries;
}

export interface TrendDataPoint {
  period: string;
  value: number;
  label: string;
}

export function buildTrendData(
  metrics: { periodStart: string | null; metricValue: number }[]
): TrendDataPoint[] {
  return metrics
    .filter((m) => m.periodStart != null)
    .map((m) => ({
      period: m.periodStart!,
      value: m.metricValue,
      label: formatPeriod(m.periodStart),
    }));
}

// ─── Guest headline ──────────────────────────────────────────────────────────
// The one-line lede next to Commercial Review's guest score, in order:
//   1. a core dimension (service, ambiance, food) scored below target:
//      name which held and which didn't (guestDimensionSentence);
//   2. survey volume fell against the property's own prior survey record;
//   3. every dimension held but a Guest finding for the period is flagged:
//      say so, then name the most severe finding as the one to watch;
//   4. every dimension held and nothing is flagged.
// Null when there's neither dimension data nor a flagged finding.

const WATCH_SEVERITY_RANK: Record<string, number> = {
  Critical: 4, "Action Required": 3, Monitor: 2, Validate: 1,
};

// The most severe non-Healthy Guest finding for the period. Ties keep the
// first one returned (Notion order, as `intelligence` arrives).
export function guestWatchItem(intelligence: Intelligence[], periodStart: string | null): Intelligence | null {
  let best: Intelligence | null = null;
  for (const i of intelligence) {
    if (i.category !== "Guest" || i.periodStart !== periodStart || i.severity === "Healthy") continue;
    if (!best || (WATCH_SEVERITY_RANK[i.severity] ?? 0) > (WATCH_SEVERITY_RANK[best.severity] ?? 0)) best = i;
  }
  return best;
}

// "Overall guest score of 97..." -> "overall guest score of 97...", leaving
// an all-caps first word (an acronym) alone.
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function guestHeadline(
  metrics: KpiMetric[],
  intelligence: Intelligence[],
  periodStart: string | null,
  surveyChange: { current: number; prior: number; priorPeriod: string; changePct: number } | null = null
): string | null {
  const present = GUEST_DIMENSIONS
    .map(([label, key]) => ({ label, m: findMetricByKey(metrics, key, periodStart) }))
    .filter((d): d is { label: string; m: KpiMetric } => d.m != null);
  if (present.some((d) => d.m.severity !== "Healthy")) return guestDimensionSentence(metrics, periodStart);
  if (surveyChange && surveyChange.changePct < 0) {
    return `Survey volume fell to ${surveyChange.current.toLocaleString()} responses from ${surveyChange.prior.toLocaleString()} in ${formatPeriod(surveyChange.priorPeriod)}, so read this period's scores with less confidence.`;
  }
  const watch = guestWatchItem(intelligence, periodStart);
  if (watch) {
    const title = lowerFirst(watch.finding.trim()).replace(/[.\s]+$/, "");
    const labels = present.map((d) => d.label);
    const held = labels.length === 0
      ? ""
      : `${labels.length > 1
          ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]} all`
          : labels[0]} held at healthy levels. `;
    const sentence = `${held}The one to watch: ${title}.`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }
  if (present.length === 0) return null;
  return "Every guest score held at healthy levels this period.";
}

// A record's Metric Name made fit for a UI label, for the places that can
// only show the record's own name (Evidence tables, guest sub-scores):
// no spaced hyphens, no parentheses, no reporting-month suffix.
//   "Total Covers - June 2026"                    -> "Total Covers"
//   "Cost of Sales - Food"                        -> "Cost of Sales, Food"
//   "Food and Beverage Average Check (Inc Comps)" -> "Food and Beverage Average Check Including Comps"
//   "Departmental Profit/(Loss) Percentage"       -> "Departmental Profit or Loss Percentage"
const MONTH_SUFFIX = /\s+-\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*$/;
export function displayMetricName(name: string): string {
  return name
    .replace(MONTH_SUFFIX, "")
    .replace(/\/\(Loss\)/gi, " or Loss")
    .replace(/\((?:Inc\.?|Incl\.?|Including) Comps\)/gi, "Including Comps")
    .replace(/\((?:Exc\.?|Excl\.?|Excluding) Comps\)/gi, "Excluding Comps")
    .replace(/\s+[-–—]\s+/g, ", ")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
