// Extracted from financial/page.tsx's local FinancialSection (Cross-tab
// audit Part 3) so Menu Engineering can use the same Executive
// Interpretation + Evidence pattern instead of a third hand-rolled copy —
// commercial/page.tsx already has its own near-identical CommercialSection,
// so this was already duplicated once before this extraction; left that
// one alone rather than retrofitting it, since it wasn't asked for and its
// callout layout/trend color genuinely differ.
//
// Evidence and Trend sub-sections degrade gracefully by design: pass an
// empty metrics/allMetrics array (as Menu Engineering does — it has no
// KpiMetric data at all) and both simply don't render, leaving only the
// Intelligence-driven current-read callout and Executive Interpretation
// toggle. Nothing new needed to support that case, it was already built in.

import { usd, pct, buildTrendData } from "@/lib/format";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import StatusBadge from "@/components/StatusBadge";
import TrendChart from "@/components/TrendChart";
import type { KpiMetric, Intelligence, Severity } from "@/types/portal";

function severityVariant(s: Severity): "green" | "amber" | "red" {
  if (s === "Healthy") return "green";
  if (s === "Critical") return "red";
  return "amber";
}

// Real-vs-placeholder benchmark check (Financial Review refinement Fix 4)
// — Notion represents "no benchmark set yet" as literal Benchmark Low/High
// = 0/0 on many records, not as a null field. Confirmed directly against
// Lex Yard's real data: every $-unit KPI record has this exact 0/0
// pattern (Total Revenue, all Average Check segments, Sick Pay, Payroll
// Taxes, Kitchen Allocation, Total Wages, Total Benefits — checked all of
// them), while every %-unit record has a real range. A naive `!= null`
// check treats 0/0 as a real range, rendering a fake "0-0" band in the
// Evidence table and a fake zero reference line on the trend chart below.
// Same convention already established for RevPASH on Commercial Review.
function hasRealBenchmark(low: number | null | undefined, high: number | null | undefined): boolean {
  return low != null && high != null && !(low === 0 && high === 0);
}

export default function FindingSection({
  heading,
  connector,
  intelligence,
  metrics,
  allMetrics,
  primarySeverity,
  trendColor = "#2563eb",
  id,
  children,
}: {
  heading: string;
  // Short line at the top of the section linking back to what came before —
  // keeps the throughline alive for a reader going straight through without
  // making the section unreadable on its own for someone who jumped here.
  connector?: string;
  intelligence: Intelligence | null;
  metrics: KpiMetric[];   // latest period metrics for this section — [] is fine, hides Evidence
  allMetrics: KpiMetric[]; // all periods, for the trend chart — [] is fine, hides Trend
  // Severity of this section's own primary metric (e.g. labor_pct for
  // Labor) — not an arbitrary first-in-array metric, which could belong to
  // any line item in the category and mislead the badge.
  primarySeverity?: Severity;
  trendColor?: string;
  // Deep-link anchor (Cross-tab audit Part 4) — lets ScrollToSection find
  // and scroll-highlight this section from a query-param-driven landing.
  // Optional: sections that aren't a deep-link destination don't need one.
  id?: string;
  children?: React.ReactNode; // KPI cards / driver visuals — caller owns layout
}) {
  const severity = intelligence?.severity ?? primarySeverity ?? "Monitor";

  return (
    <section id={id} className="space-y-4">
      <SectionHeader title={heading} />

      {connector && (
        <p style={{ fontFamily: "'Jost', 'Inter', system-ui, sans-serif", fontSize: 12, color: "rgba(18,18,15,0.45)", fontStyle: "italic", marginTop: -8 }}>
          {connector}
        </p>
      )}

      {/* Current read callout — badge first, paragraph below. Hidden
          entirely when there's no real commentary (Financial Review
          refinement Fix 3) — an internal pipeline state ("no commentary
          published yet") must not leak into client-facing copy as a
          literal placeholder string. Same "if a field is missing, don't
          render that sub-element" rule as everywhere else in the portal. */}
      {intelligence?.currentRead && (
        <CalloutBlock>
          <div className="space-y-3">
            <StatusBadge label={severity} variant={severityVariant(severity)} />
            <p>{intelligence.currentRead}</p>
          </div>
        </CalloutBlock>
      )}

      {/* KPI cards / driver visuals */}
      {children}

      {/* Trend chart — shown if 2+ periods available */}
      {allMetrics.length >= 2 && (() => {
        const trendData = buildTrendData(allMetrics);
        const unit = allMetrics[0]?.unit ?? "%";
        const realBenchmark = hasRealBenchmark(allMetrics[0]?.benchmarkLow, allMetrics[0]?.benchmarkHigh);
        const bLow = realBenchmark ? allMetrics[0]?.benchmarkLow : undefined;
        const bHigh = realBenchmark ? allMetrics[0]?.benchmarkHigh : undefined;
        return (
          <div className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-4">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest">Trend</p>
            <TrendChart
              data={trendData}
              unit={unit}
              benchmarkLow={bLow}
              benchmarkHigh={bHigh}
              color={trendColor}
            />
          </div>
        );
      })()}

      {/* LPP Perspective toggle — renamed from "Executive Interpretation"
          (Financial Review refinement Fix 5): that label asserted a
          single objective read rather than signaling whose read this is.
          Overview already uses "LPP Perspective" for the same kind of
          content; same label, same meaning, everywhere in the portal.
          Internal structure (Why It Matters / Recommendation) unchanged. */}
      {(intelligence?.whyItMatters || intelligence?.suggestedDecision) && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden group">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>LPP Perspective</span>
            <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
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

      {/* Evidence toggle — raw metrics */}
      {metrics.length > 0 && (
        <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
          <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-700 flex items-center justify-between select-none hover:bg-gray-50 transition">
            <span>Evidence</span>
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
                      {m.unit === "$" ? usd(m.metricValue) : m.unit === "%" ? pct(m.metricValue) : m.metricValue}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-400 text-xs">
                      {hasRealBenchmark(m.benchmarkLow, m.benchmarkHigh)
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
