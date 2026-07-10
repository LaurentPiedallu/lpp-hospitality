import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getIntelligence, getLatestKpiSummary } from "@/lib/notion-queries";
import { formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import RequestAnalysisButton from "@/components/RequestAnalysisButton";
import RefreshAllButton from "@/components/RefreshAllButton";
import EmptyState from "@/components/EmptyState";
import { ANALYSIS_CATEGORIES, isStale, relativeAge } from "@/lib/analysis-config";
import type { Intelligence, Severity } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

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
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderLeft: "3px solid #B8935A", borderRadius: 0 }}>
      {/* Header strip */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(18,18,15,0.06)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.6)" }}>{item.finding}</p>
          {item.periodStart && (
            <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)", marginTop: 2 }}>{formatPeriod(item.periodStart)}</p>
          )}
        </div>
        <StatusBadge label={item.severity} variant={severityVariant(item.severity)} />
      </div>

      <div style={{ padding: "16px 20px" }} className="space-y-4">
        {/* Current read */}
        {item.currentRead && (
          <div>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 6 }}>Current Read</p>
            <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.65)", lineHeight: 1.7, fontWeight: 300 }}>{item.currentRead}</p>
          </div>
        )}

        {/* Why it matters */}
        {item.whyItMatters && (
          <div style={{ borderTop: "1px solid rgba(18,18,15,0.06)", paddingTop: 12 }}>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 6 }}>Why It Matters</p>
            <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.6)", lineHeight: 1.7, fontWeight: 300 }}>{item.whyItMatters}</p>
          </div>
        )}

        {/* Recommendation */}
        {item.suggestedDecision && (
          <div style={{ borderTop: "1px solid rgba(18,18,15,0.06)", paddingTop: 12 }}>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 6 }}>Recommendation</p>
            <p style={{ fontFamily: JOST, fontSize: 13, color: "#12120F", lineHeight: 1.7 }}>{item.suggestedDecision}</p>
          </div>
        )}

        {/* Confidence + age */}
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ borderTop: "1px solid rgba(18,18,15,0.06)", paddingTop: 10 }}>
          <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>Confidence: {item.confidence}</span>
          <span style={{ fontFamily: JOST, fontSize: 11, color: stale ? "#B8935A" : "rgba(18,18,15,0.3)" }}>
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

  const [property, allIntelligence, kpi] = await Promise.all([
    getProperty(propertyId, clientId),
    getIntelligence(propertyId),
    getLatestKpiSummary(propertyId),
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

  return (
    <PageWrapper>
      <NavBar session={session} />
      <PropertyHeader property={property} kpi={kpi} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="intelligence" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

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
                <div key={label} style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "20px 24px" }}>
                  <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>{label}</p>
                  <p style={{ fontFamily: SERIF, fontSize: "1.9rem", fontWeight: 400, color: "#12120F", lineHeight: 1 }}>{value}</p>
                  <p style={{ fontSize: 10, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>{sub}</p>
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
                        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.4)", marginTop: -12, marginBottom: 16 }}>{config.description}</p>
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
          <div className="space-y-4">
            <EmptyState
              title="No AI analysis yet"
              body="Analysis appears here after LPP reviews your data and runs the intelligence pipeline."
            />
            <div className="flex justify-center">
              <RefreshAllButton clientId={clientId} propertyId={propertyId} />
            </div>
          </div>
        )}

      </div>
    </PageWrapper>
  );
}
