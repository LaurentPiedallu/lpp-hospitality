import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getIntelligence, getLastUpdated } from "@/lib/notion-queries";
import { formatPeriod } from "@/lib/format";
import { resolveIntelCrossLink } from "@/lib/deep-links";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import RefreshAllButton from "@/components/RefreshAllButton";
import EmptyState from "@/components/EmptyState";
import { ANALYSIS_CATEGORIES, isStale, relativeAge } from "@/lib/analysis-config";
import type { Intelligence, Severity } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

// ─── Category config — sourced from analysis-config so it stays in sync ──────

const CATEGORY_ORDER = ANALYSIS_CATEGORIES.map((c) => c.id);

const CATEGORY_LABELS = Object.fromEntries(
  ANALYSIS_CATEGORIES.map((c) => [c.id, { label: c.label, description: c.description }])
) as Record<string, { label: string; description: string }>;

// Filterable category options — Data Quality is a real entry in
// ANALYSIS_CATEGORIES (Overview's Drivers grouping needs it there to
// exclude it explicitly) but must never be offered as something a client
// can select, even though it would always resolve to zero results (Part 6's
// Client Visible gate already excludes it from allIntelligence upstream).
// Not just relying on the empty result — the filter pill itself shouldn't
// exist.
const FILTERABLE_CATEGORIES: string[] = CATEGORY_ORDER.filter((id) => id !== "Data Quality");

function severityVariant(s: Severity): "green" | "amber" | "red" | "gray" {
  if (s === "Healthy") return "green";
  if (s === "Critical" || s === "Action Required") return "red";
  if (s === "Validate") return "gray";
  return "amber";
}

// ─── Filter bar (Redesign prompt Step 5) — plain Link-driven navigation,
// same convention as Menu Engineering's period selector and every other
// query-param-driven control on this portal, rather than introducing
// client-side filter state. ──────────────────────────────────────────────

function PeriodSelector({
  periods,
  selected,
  basePath,
  categoryParam,
}: {
  periods: string[];
  selected: string;
  basePath: string;
  categoryParam?: string;
}) {
  if (periods.length < 2) return null;
  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      {periods.map((p) => {
        const active = p === selected;
        const qs = new URLSearchParams();
        qs.set("period", p);
        if (categoryParam) qs.set("category", categoryParam);
        return (
          <Link
            key={p}
            href={`${basePath}?${qs.toString()}`}
            style={{
              fontFamily: JOST,
              fontSize: 12,
              padding: "6px 14px",
              border: active ? "1px solid #B8935A" : "1px solid rgba(18,18,15,0.12)",
              color: active ? "#B8935A" : "rgba(18,18,15,0.55)",
              background: active ? "rgba(184,147,90,0.06)" : "#FFFFFF",
              textDecoration: "none",
            }}
          >
            {formatPeriod(p)}
          </Link>
        );
      })}
    </div>
  );
}

function CategorySelector({
  selected,
  basePath,
  periodParam,
}: {
  selected: string; // category id, or "all"
  basePath: string;
  periodParam?: string;
}) {
  const options = [{ id: "all", label: "All Categories" }, ...FILTERABLE_CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id].label }))];
  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      {options.map(({ id, label }) => {
        const active = id === selected;
        const qs = new URLSearchParams();
        if (id !== "all") qs.set("category", id);
        if (periodParam) qs.set("period", periodParam);
        const qsString = qs.toString();
        return (
          <Link
            key={id}
            href={qsString ? `${basePath}?${qsString}` : basePath}
            style={{
              fontFamily: JOST,
              fontSize: 11,
              padding: "5px 12px",
              border: active ? "1px solid #B8935A" : "1px solid rgba(18,18,15,0.12)",
              color: active ? "#B8935A" : "rgba(18,18,15,0.5)",
              background: active ? "rgba(184,147,90,0.06)" : "#FFFFFF",
              textDecoration: "none",
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Intelligence card ────────────────────────────────────────────────────────

function IntelligenceCard({ item, clientId, propertyId }: { item: Intelligence; clientId: string; propertyId: string }) {
  const stale = isStale(item.createdAt);
  const age = relativeAge(item.createdAt);
  const crossLink = resolveIntelCrossLink(item.category);

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

        {/* Cross-link — Cross-tab audit Part 4 convention, reused here
            (Redesign prompt Step 5). No link renders for a category with
            no tab mapping (there are none in the live client-visible set,
            but this stays defensive rather than assuming). */}
        {crossLink && (
          <div className="text-right" style={{ borderTop: "1px solid rgba(18,18,15,0.06)", paddingTop: 10 }}>
            <Link
              href={`/${clientId}/${propertyId}${crossLink.segment}?category=${encodeURIComponent(item.category)}`}
              className="hover:text-[#D4AF7A]"
              style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, textDecoration: "none", transition: "color 0.25s ease" }}
            >
              View in {crossLink.label} →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IntelligencePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
  searchParams: Promise<{ period?: string; category?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const { period: periodParam, category: categoryParam } = await searchParams;

  const [property, allIntelligence, lastUpdated] = await Promise.all([
    getProperty(propertyId, clientId),
    getIntelligence(propertyId, { clientVisibleOnly: true }),
    getLastUpdated(propertyId, clientId),
  ]);

  if (!property) notFound();

  const basePath = `/${clientId}/${propertyId}/intelligence`;

  // Period filter (Redesign prompt Step 5) — defaults to the most recent
  // period with any client-visible data for this property. Distinct
  // periods only, newest first — same "no batch/period entity, just raw
  // ISO date strings" shape Financial/Commercial Review's own period
  // logic already uses (latestPeriod helpers), not a stored Period record.
  const periods = [
    ...new Set((allIntelligence as Intelligence[]).map((i) => i.periodStart).filter((p): p is string => !!p)),
  ].sort().reverse();
  const selectedPeriod = periodParam && periods.includes(periodParam) ? periodParam : (periods[0] ?? null);
  const periodIntelligence = selectedPeriod
    ? (allIntelligence as Intelligence[]).filter((i) => i.periodStart === selectedPeriod)
    : (allIntelligence as Intelligence[]);

  // Category filter — "all" (default) or one of FILTERABLE_CATEGORIES.
  // Data Quality can never be selected (see FILTERABLE_CATEGORIES above);
  // an unrecognized/absent param falls back to "all", not silently to the
  // first category.
  const selectedCategory =
    categoryParam && FILTERABLE_CATEGORIES.includes(categoryParam) ? categoryParam : "all";
  const displayIntelligence =
    selectedCategory === "all" ? periodIntelligence : periodIntelligence.filter((i) => i.category === selectedCategory);

  // Group by category, preserve order — built from the period-filtered set
  // so summary counts below reflect "this period", while the category
  // filter only narrows which of those groups are currently shown.
  const byCategory = new Map<string, Intelligence[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);

  for (const item of displayIntelligence) {
    const cat = item.category || "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const hasAny = periodIntelligence.length > 0;
  const hasDisplay = displayIntelligence.length > 0;

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="intelligence" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-12">

        {/* Refresh all — shown when there's existing data */}
        {hasAny && (
          <div className="flex justify-end">
            <RefreshAllButton clientId={clientId} propertyId={propertyId} />
          </div>
        )}

        {/* Filter bar */}
        {hasAny && (
          <div className="space-y-3">
            <PeriodSelector periods={periods} selected={selectedPeriod ?? ""} basePath={basePath} categoryParam={categoryParam} />
            <CategorySelector selected={selectedCategory} basePath={basePath} periodParam={periodParam} />
          </div>
        )}

        {/* Summary counts — scoped to the selected period, not the category
            filter (a stable "how much is there this period" reading while
            the category filter only changes which of it is visible below). */}
        {hasAny && (() => {
          const counts = {
            total:     periodIntelligence.length,
            healthy:   periodIntelligence.filter((i) => i.severity === "Healthy").length,
            monitor:   periodIntelligence.filter((i) => i.severity === "Monitor").length,
            attention: periodIntelligence.filter((i) => i.severity === "Action Required" || i.severity === "Critical").length,
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
        {!hasAny ? (
          <div className="space-y-4">
            <EmptyState
              title="No AI analysis yet"
              body="Analysis appears here after LPP reviews your data and runs the intelligence pipeline."
            />
            <div className="flex justify-center">
              <RefreshAllButton clientId={clientId} propertyId={propertyId} />
            </div>
          </div>
        ) : !hasDisplay ? (
          // Real data exists for this property/period, just not for the
          // selected category — a lighter message than "no AI analysis
          // yet", since that CTA (run the pipeline) would be wrong here.
          <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.4)", textAlign: "center", padding: "40px 0" }}>
            No {CATEGORY_LABELS[selectedCategory]?.label ?? selectedCategory} findings for this period.
          </p>
        ) : (
          [...byCategory.entries()]
            .filter(([, items]) => items.length > 0)
            .map(([cat, items]) => {
              const config = CATEGORY_LABELS[cat] ?? { label: cat, description: "" };
              return (
                <section key={cat} className="space-y-4">
                  <SectionHeader title={config.label} />
                  {config.description && (
                    <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.4)", marginTop: -12, marginBottom: 16 }}>{config.description}</p>
                  )}
                  <div className="space-y-4">
                    {items.map((item) => (
                      <IntelligenceCard key={item.id} item={item} clientId={clientId} propertyId={propertyId} />
                    ))}
                  </div>
                </section>
              );
            })
        )}

      </div>
    </PageWrapper>
  );
}
