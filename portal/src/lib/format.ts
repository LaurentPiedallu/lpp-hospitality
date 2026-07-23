import type { KpiMetric, Intelligence } from "@/types/portal";

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

// Looks up a single KPI Record by its canonical LPP Metric Key for a
// specific period — never by category/unit/name-substring, which silently
// picks up whichever sibling record happens to share those (e.g. matching
// "Labor" + "$" alone returns "Sick Pay" just as readily as the intended
// "Total Payroll" record). Optional category constrains further for keys
// reused across categories for different concepts (e.g. "covers" also
// exists under Guest Experience as a survey sample size, distinct from the
// real total under Revenue).
//
// Segment defaults to "Total" — most call sites want the headline figure,
// not a daypart/wage-type/COGS-type slice. A record with a blank/null
// Segment is treated as Total too: Segment is a second axis added after a
// lot of KPI Records already existed and were Published, and blank-means-
// Total was a deliberate backward-compatibility choice so nothing already
// Published needed to change. Pass an explicit segment (e.g. "Breakfast",
// "Food", "Wages Total") to get a specific slice instead.
export function findMetricByKey(
  metrics: KpiMetric[],
  key: string,
  periodStart: string | null,
  category?: string,
  segment: string = "Total"
): KpiMetric | null {
  return (
    metrics.find(
      (m) =>
        m.lppMetricKey === key &&
        m.periodStart === periodStart &&
        (!category || m.category === category) &&
        (m.segment ?? "Total") === segment
    ) ?? null
  );
}

// Looks up the Intelligence record for a category, scoped to a specific
// period — critically, period-scoped, unlike a bare category filter. Without
// that, a category with no record for the current period silently falls
// through to an older period's record with the same category (confirmed
// cause of a real bug: Financial Review's COGS narrative was showing a
// March record because June's COGS finding happened to be categorized
// "Data Quality" instead of "COGS").
//
// When a period has more than one record sharing a category — the model has
// no field that otherwise disambiguates which one belongs to a given
// section — this prefers the one with the larger Estimated Annual Impact,
// on the reasoning that the more financially material finding is the more
// relevant one for a financial-review context. Verified this cleanly picks
// the right record where it mattered (a $4.58M finding vs. a $60K one), but
// it's a heuristic, not a real link, and won't always be correct.
export function findIntelligence(
  intelligence: Intelligence[],
  category: string,
  periodStart: string | null
): Intelligence | null {
  const candidates = intelligence.filter((i) => i.category === category && i.periodStart === periodStart);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, i) => (i.estimatedAnnualImpact > best.estimatedAnnualImpact ? i : best));
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
