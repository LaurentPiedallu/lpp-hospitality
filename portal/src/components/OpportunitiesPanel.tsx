// Extracted from commercial/page.tsx's local OpportunitiesPanel (Redesign
// prompt Step 1) so Financial Review and Menu Engineering can use the same
// Value Creation Opportunities card grid instead of a third and fourth
// hand-rolled copy. Extracted faithfully, including STAGE_VARIANT's keys —
// they don't match the real Opportunity Stage enum (Detected/Validated/
// Recommended/Approved/In Progress/Implemented/Measured/Archived; this map
// has "Identified"/"Closed", which don't exist, so most real stages fall
// through to the "gray" default) — that's a pre-existing bug on Commercial
// Review, not something this extraction fixes silently; flagged separately.
//
// "use client" (Commercial Review Phase 6) for the optional topCount
// collapse below — same client-boundary pattern InitiativeProgress already
// uses for its own expandable Action list, receiving server-fetched,
// plain-JSON props (Opportunity has no functions/Dates on it).

"use client";

import { useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import { usd } from "@/lib/format";
import type { Opportunity, DataConfidence } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";

const STAGE_VARIANT: Record<string, "green" | "amber" | "blue" | "gray"> = {
  Identified: "gray",
  "In Progress": "amber",
  Validated: "green",
  Closed: "gray",
};

// Same mapping Overview's Top 3 Priorities already uses for the identical
// field (Financial Review refinement Fix 7).
const CONFIDENCE_VARIANT: Record<DataConfidence, "green" | "amber" | "red" | "gray"> = {
  High: "green",
  Medium: "amber",
  Low: "red",
  "Requires Validation": "gray",
};

// Demand Context — whether the underlying issue is "full and mismanaging
// it" (Capacity-Constrained) vs. "empty and needs filling"
// (Demand-Constrained), which changes what kind of action makes sense.
const DEMAND_CONTEXT_TAG: Record<string, { label: string; variant: "amber" | "gray" }> = {
  "Capacity-Constrained": { label: "At Capacity", variant: "amber" },
  "Demand-Constrained": { label: "Building Demand", variant: "gray" },
  Mixed: { label: "Mixed", variant: "gray" },
};

export default function OpportunitiesPanel({
  opportunities,
  id,
  heading = "Value Creation Opportunities",
  connector,
  confidenceById,
  showTotalValue = false,
  topCount,
}: {
  opportunities: Opportunity[];
  // Deep-link anchor (Cross-tab audit Part 4 convention) — optional.
  id?: string;
  heading?: string;
  // Short connector line above the heading, same convention as
  // FindingSection/CommercialSection — optional (Financial Review doesn't
  // use one here; Commercial Review's Portal-Wide restructure does).
  connector?: string;
  // Confidence badge (Financial Review refinement Fix 7) — Opportunity
  // itself has no confidence field; the real signal lives on the linked
  // Intelligence record via sourceIntelligenceId, same resolution
  // lib/priorities.ts already does for Overview's Top 3 Priorities.
  // Optional and keyed by opportunity id rather than baked into the
  // Opportunity type, so callers that don't have an Intelligence array on
  // hand (Commercial Review, Menu Engineering) are unaffected.
  confidenceById?: Record<string, DataConfidence>;
  // When true, render a one-line total above the card grid summing
  // estimatedAnnualImpact across all opportunities (computed from the same
  // `sorted` array as the card list). Financial Review only — defaults to
  // false so Commercial Review and Menu Engineering's call sites, which
  // don't pass it, render exactly as before.
  showTotalValue?: boolean;
  // When set, only the first `topCount` opportunities (by impact,
  // already-sorted) render as full cards; the rest collapse into a
  // compact "additional opportunities" list — title and dollar figure
  // only — that expands on click, same interaction InitiativeProgress's
  // Action list already uses (Commercial Review Phase 6). Display-only:
  // every opportunity still renders, just not all as full cards. Omitted
  // by Financial Review and Menu Engineering, which keep rendering every
  // opportunity as a full card, unchanged.
  topCount?: number;
}) {
  const [showAll, setShowAll] = useState(false);

  if (opportunities.length === 0) return null;
  // Sorted by impact descending (Fix 7) — matches the sort Overview's Top
  // 3 Priorities already uses, so the same set of opportunities reads in
  // the same order wherever it appears.
  const sorted = [...opportunities].sort((a, b) => b.estimatedAnnualImpact - a.estimatedAnnualImpact);
  const fullCards = topCount != null ? sorted.slice(0, topCount) : sorted;
  const additional = topCount != null ? sorted.slice(topCount) : [];
  return (
    <section id={id} className="space-y-4">
      <SectionHeader title={heading} />
      {connector && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.45)", fontStyle: "italic", marginTop: -8 }}>
          {connector}
        </p>
      )}
      {/* Total-value summary — same serif body treatment as Financial
          Review's Financial Synthesis block; the figure carries the weight
          bump the Profitability net line uses. Section's own space-y-4
          handles the gap to the grid below. Sum is over Math.round(...) of
          each impact, not the raw values, so this total always equals a
          hand-sum of the per-card figures below (each shown via usd(), which
          rounds to whole dollars) rather than a round of the raw sum. */}
      {showTotalValue && (
        <p
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(0.95rem, 1.3vw, 1.05rem)",
            fontWeight: 400,
            lineHeight: 1.7,
            color: "#12120F",
          }}
        >
          Total identified opportunity value:{" "}
          <span style={{ fontWeight: 600 }}>
            {usd(sorted.reduce((sum, o) => sum + Math.round(o.estimatedAnnualImpact), 0))} / yr
          </span>{" "}
          across {opportunities.length} opportunities
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {fullCards.map((opp) => {
          const demandTag = opp.demandContext ? DEMAND_CONTEXT_TAG[opp.demandContext] : null;
          const confidence = confidenceById?.[opp.id];
          return (
            <div key={opp.id} className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-gray-900 leading-snug">{opp.title}</p>
                <div className="flex items-center flex-shrink-0 flex-wrap justify-end" style={{ gap: 6 }}>
                  {confidence && <StatusBadge label={confidence} variant={CONFIDENCE_VARIANT[confidence]} />}
                  {demandTag && <StatusBadge label={demandTag.label} variant={demandTag.variant} />}
                  <StatusBadge
                    label={opp.stage}
                    variant={STAGE_VARIANT[opp.stage] ?? "gray"}
                  />
                </div>
              </div>
              {opp.nextStep && (
                <p className="text-xs text-gray-500 leading-relaxed mb-3">Next: {opp.nextStep}</p>
              )}
              {/* Real "who needs to approve this" text (Portal-Wide
                  refinement) — surfaced as-is rather than collapsed into a
                  fabricated Operational/Ownership badge; see the
                  clientDecisionNeeded field comment in types/portal.ts. */}
              {opp.clientDecisionNeeded && (
                <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(184,147,90,0.9)" }}>
                  Decision needed: {opp.clientDecisionNeeded}
                </p>
              )}
              {opp.estimatedAnnualImpact != null && (
                <p className="text-xs text-gray-400">
                  Est. impact: <span className="font-medium text-gray-700">{usd(opp.estimatedAnnualImpact)} / yr</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapsed remainder (Commercial Review Phase 6) — title + dollar
          figure only, expandable. Same toggle styling as
          InitiativeProgress's "Show all N" control, for one consistent
          expand/collapse idiom across the portal. */}
      {additional.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="hover:text-[#12120F]"
            style={{
              fontFamily: JOST,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(18,18,15,0.4)",
              cursor: "pointer",
              userSelect: "none",
              transition: "color 0.25s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: 0,
              padding: 0,
            }}
          >
            <svg
              width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"
              style={{ transform: showAll ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
            >
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showAll ? "Show less" : `${additional.length} additional opportunit${additional.length === 1 ? "y" : "ies"}`}
          </button>

          {showAll && (
            <div style={{ marginTop: 10, borderTop: "1px solid rgba(18,18,15,0.08)" }}>
              {additional.map((opp) => (
                <div
                  key={opp.id}
                  className="flex items-baseline justify-between"
                  style={{ padding: "10px 0", borderBottom: "1px solid rgba(18,18,15,0.06)" }}
                >
                  <span style={{ fontFamily: JOST, fontSize: 12.5, color: "rgba(18,18,15,0.7)" }}>{opp.title}</span>
                  {opp.estimatedAnnualImpact != null && (
                    <span style={{ fontFamily: JOST, fontSize: 12.5, color: "#12120F", fontWeight: 500, whiteSpace: "nowrap", marginLeft: 12 }}>
                      {usd(opp.estimatedAnnualImpact)} / yr
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
