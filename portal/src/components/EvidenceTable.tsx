"use client";

// The metrics table inside FindingSection's Evidence block. Split out of
// FindingSection (a server component) purely so this inner "notable rows
// only / show all" toggle can hold client state — the Evidence block's own
// expand/collapse stays a native <details> owned by FindingSection and is
// untouched. Two separate levels of disclosure, deliberately kept separate:
//   1. Evidence <details> — "do I want to look at raw metrics at all"
//   2. this toggle        — "of those, just the ones that diverge, or all"

import { useState } from "react";
import { usd, pct, hasRealBenchmark } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import type { KpiMetric, Severity } from "@/types/portal";

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

// A row earns a place in the default view when it actually adds information:
// its Status diverges from the section-level verdict, or it carries a real
// benchmark to read the value against. Rows that merely restate the section
// verdict with no benchmark are in-line detail, available via "Show all".
function isNotable(m: KpiMetric, sectionSeverity: Severity): boolean {
  return m.severity !== sectionSeverity || hasRealBenchmark(m.benchmarkLow, m.benchmarkHigh);
}

// An elevated Status ("Action Required" / "Critical") on a row that shows no
// Benchmark is a concern asserted without a visible standard behind it. For
// those rows, surface the KPI Record's own LPP Interpretation as a muted
// second line under the metric name, so the reader can see what the status
// is measured against (for these records the comparison — typically a
// budget — lives only in that prose, not in the Benchmark fields). Applies
// to any such row in any of the five Financial Review sections; nothing
// metric-specific here.
function showsRationale(m: KpiMetric): boolean {
  return (
    !hasRealBenchmark(m.benchmarkLow, m.benchmarkHigh) &&
    (m.severity === "Action Required" || m.severity === "Critical") &&
    m.interpretation.trim().length > 0
  );
}

export default function EvidenceTable({
  metrics,
  sectionSeverity,
}: {
  metrics: KpiMetric[];
  // The section's overall verdict (FindingSection's resolved `severity` —
  // intelligence.severity ?? primarySeverity ?? "Monitor").
  sectionSeverity: Severity;
}) {
  const [showAll, setShowAll] = useState(false);

  const notable = metrics.filter((m) => isNotable(m, sectionSeverity));
  const hiddenCount = metrics.length - notable.length;
  const hasHidden = hiddenCount > 0;
  // Nothing filtered out -> the toggle is a no-op, so the default view is
  // already the full list and no button renders.
  const rows = showAll || !hasHidden ? metrics : notable;

  return (
    <div className="border-t border-gray-50">
      <div className="overflow-x-auto">
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
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-2.5 text-gray-700 align-top">
                  {m.metricName || m.kpiRecord}
                  {showsRationale(m) && (
                    <p className="text-xs text-gray-500 leading-relaxed">{m.interpretation}</p>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right font-medium text-gray-900 align-top">
                  {m.unit === "$" ? usd(m.metricValue) : m.unit === "%" ? pct(m.metricValue) : m.metricValue}
                </td>
                <td className="px-5 py-2.5 text-right text-gray-400 text-xs align-top">
                  {hasRealBenchmark(m.benchmarkLow, m.benchmarkHigh)
                    ? `${m.benchmarkLow}–${m.benchmarkHigh}${m.unit}`
                    : "—"}
                </td>
                <td className="px-5 py-2.5 text-right align-top">
                  <StatusBadge label={m.severity} variant={severityVariant(m.severity)} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-3 text-xs text-gray-400">
                  Every metric here matches the section verdict; none diverge and none carry a benchmark.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasHidden && (
        <div className="border-t border-gray-50 px-5 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 transition select-none"
          >
            {showAll
              ? "Show only diverging metrics"
              : `Show all metrics (${metrics.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
