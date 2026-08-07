// Top 3 Priorities ranking — shared between the property Overview page and
// the /dashboard portfolio cards, so both read from one implementation
// rather than drifting into two different ranking rules over time.
//
// Ranks Opportunities directly rather than Initiatives: checked the real
// data first — Initiative.expectedImpact and Initiative.priority are null
// on every real Initiative record (only linked Actions carry genuine
// priority), while Opportunities carry real, populated Estimated Annual
// Impact and Priority for the current dataset.

import type { Opportunity, Intelligence, DataConfidence } from "@/types/portal";

export const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export interface TopPriority {
  id: string;
  title: string;
  category: string;
  impactAnnual: number;
  confidence: DataConfidence | null;
  nextStep: string;
}

export function selectTopPriorities(opportunities: Opportunity[], intelligence: Intelligence[]): TopPriority[] {
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
    // Intelligence finding that drove it. Null (not shown) when there's
    // no linked finding or it predates this relation being populated.
    confidence: o.sourceIntelligenceId
      ? intelligence.find((i) => i.id === o.sourceIntelligenceId)?.confidence ?? null
      : null,
    nextStep: o.nextStep,
  }));
}
