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
