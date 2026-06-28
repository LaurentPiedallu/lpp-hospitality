import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getIntelligence } from "@/lib/notion-queries";
import { formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import SubPageHeader from "@/components/SubPageHeader";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import RequestAnalysisButton from "@/components/RequestAnalysisButton";
import RefreshAllButton from "@/components/RefreshAllButton";
import { ANALYSIS_CATEGORIES, isStale, relativeAge } from "@/lib/analysis-config";
import type { Intelligence, Severity } from "@/types/portal";

// ─── Category config — sourced from analysis-config so it stays in sync ──────

const CATEGORY_ORDER = ANALYSIS_CATEGORIES.map((c) => c.id);

const CATEGORY_LABELS = Object.fromEntries(
  ANALYSIS_CATEGORIES.map((c) => [c.id, { label: c.label, description: c.description }])
) as Record<string, { label: string; description: string }>;

function severityVariant(s: Severity): "green" | "amber" | "red" | "gray" {
  if (s === "Healthy") return "green";
  if (s === "Critical" || s === "Action Required") return "red";
  if (s === "Validate") return "gray";
  return "amber";
}

// ─── Intelligence card ────────────────────────────────────────────────────────

function IntelligenceCard({ item }: { item: Intelligence }) {
  const stale = isStale(item.createdAt);
  const age = relativeAge(item.createdAt);

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${stale ? "border-amber-100" : "border-gray-100"}`}>
      {/* Header strip */}
      <div className={`px-5 py-3 border-b border-gray-50 flex items-start justify-between gap-3 ${
        item.severity === "Healthy" ? "bg-green-50" :
        item.severity === "Critical" || item.severity === "Action Required" ? "bg-red-50" :
        item.severity === "Validate" ? "bg-gray-50" :
        "bg-amber-50"
      }`}>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-700">{item.finding}</p>
          {item.periodStart && (
            <p className="text-xs text-gray-400 mt-0.5">{formatPeriod(item.periodStart)}</p>
          )}
        </div>
        <StatusBadge label={item.severity} variant={severityVariant(item.severity)} />
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Current read */}
        {item.currentRead && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1.5">Current Read</p>
            <p className="text-sm text-gray-800 leading-relaxed">{item.currentRead}</p>
          </div>
        )}

        {/* Why it matters */}
        {item.whyItMatters && (
          <div className="border-t border-gray-50 pt-3">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1.5">Why It Matters</p>
            <p className="text-sm text-gray-600 leading-relaxed">{item.whyItMatters}</p>
          </div>
        )}

        {/* Recommendation */}
        {item.suggestedDecision && (
          <div className="border-t border-gray-50 pt-3">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1.5">Recommendation</p>
            <p className="text-sm text-gray-700 leading-relaxed font-medium">{item.suggestedDecision}</p>
          </div>
        )}

        {/* Confidence + age */}
        <div className="border-t border-gray-50 pt-2 flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-gray-400">Confidence: {item.confidence}</span>
          <span className={`text-xs ${stale ? "text-amber-500" : "text-gray-300"}`}>
            {stale ? `⚠ ${age}` : age}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IntelligencePage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, allIntelligence] = await Promise.all([
    getProperty(propertyId, clientId),
    getIntelligence(propertyId),
  ]);

  if (!property) notFound();

  // Group by category, preserve order
  const byCategory = new Map<string, Intelligence[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);

  for (const item of allIntelligence as Intelligence[]) {
    const cat = item.category || "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const hasAny = [...byCategory.values()].some((items) => items.length > 0);

  // Most recent period with any intelligence
  const latestPeriod = (allIntelligence as Intelligence[])
    .map((i) => i.periodStart)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} />
      <SubPageHeader
        title="AI Intelligence"
        property={property}
        period={formatPeriod(latestPeriod)}
        clientId={clientId}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* Refresh all — shown when there's existing data */}
        {hasAny && (
          <div className="flex justify-end">
            <RefreshAllButton clientId={clientId} propertyId={propertyId} />
          </div>
        )}

        {/* Summary counts */}
        {hasAny && (() => {
          const all = allIntelligence as Intelligence[];
          const counts = {
            total:     all.length,
            healthy:   all.filter((i) => i.severity === "Healthy").length,
            monitor:   all.filter((i) => i.severity === "Monitor").length,
            attention: all.filter((i) => i.severity === "Action Required" || i.severity === "Critical").length,
          };
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Signals",  value: counts.total,     sub: "published" },
                { label: "Healthy",        value: counts.healthy,   sub: "on track" },
                { label: "Monitor",        value: counts.monitor,   sub: "watch closely" },
                { label: "Action Needed",  value: counts.attention, sub: "requires response" },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-xl font-semibold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Category sections */}
        {hasAny ? (
          [...byCategory.entries()]
            .filter(([, items]) => items.length > 0)
            .map(([cat, items]) => {
              const config = CATEGORY_LABELS[cat] ?? { label: cat, description: "" };
              return (
                <section key={cat} className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <SectionHeader title={config.label} />
                      {config.description && (
                        <p className="text-xs text-gray-400 -mt-3 mb-4">{config.description}</p>
                      )}
                    </div>
                    <RequestAnalysisButton
                      clientId={clientId}
                      propertyId={propertyId}
                      category={cat}
                      label={`Refresh ${config.label.toLowerCase()}`}
                    />
                  </div>
                  <div className="space-y-4">
                    {items.map((item) => (
                      <IntelligenceCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              );
            })
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center space-y-4">
            <p className="text-sm text-gray-400">No AI analysis published yet.</p>
            <p className="text-xs text-gray-300">
              Analysis appears here after LPP reviews your data and runs the intelligence pipeline.
            </p>
            <div className="flex justify-center pt-2">
              <RefreshAllButton clientId={clientId} propertyId={propertyId} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
