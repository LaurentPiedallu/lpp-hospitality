// Extracted from commercial/page.tsx's local OpportunitiesPanel (Redesign
// prompt Step 1) so Financial Review and Menu Engineering can use the same
// Value Creation Opportunities card grid instead of a third and fourth
// hand-rolled copy. Extracted faithfully, including STAGE_VARIANT's keys —
// they don't match the real Opportunity Stage enum (Detected/Validated/
// Recommended/Approved/In Progress/Implemented/Measured/Archived; this map
// has "Identified"/"Closed", which don't exist, so most real stages fall
// through to the "gray" default) — that's a pre-existing bug on Commercial
// Review, not something this extraction fixes silently; flagged separately.

import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import { usd } from "@/lib/format";
import type { Opportunity, DataConfidence } from "@/types/portal";

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
  confidenceById,
}: {
  opportunities: Opportunity[];
  // Deep-link anchor (Cross-tab audit Part 4 convention) — optional.
  id?: string;
  heading?: string;
  // Confidence badge (Financial Review refinement Fix 7) — Opportunity
  // itself has no confidence field; the real signal lives on the linked
  // Intelligence record via sourceIntelligenceId, same resolution
  // lib/priorities.ts already does for Overview's Top 3 Priorities.
  // Optional and keyed by opportunity id rather than baked into the
  // Opportunity type, so callers that don't have an Intelligence array on
  // hand (Commercial Review, Menu Engineering) are unaffected.
  confidenceById?: Record<string, DataConfidence>;
}) {
  if (opportunities.length === 0) return null;
  // Sorted by impact descending (Fix 7) — matches the sort Overview's Top
  // 3 Priorities already uses, so the same set of opportunities reads in
  // the same order wherever it appears.
  const sorted = [...opportunities].sort((a, b) => b.estimatedAnnualImpact - a.estimatedAnnualImpact);
  return (
    <section id={id} className="space-y-4">
      <SectionHeader title={heading} />
      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((opp) => {
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
              {opp.estimatedAnnualImpact != null && (
                <p className="text-xs text-gray-400">
                  Est. impact: <span className="font-medium text-gray-700">{usd(opp.estimatedAnnualImpact)} / yr</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
