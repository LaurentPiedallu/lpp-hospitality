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
