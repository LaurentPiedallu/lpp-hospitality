import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getMenuBatches, getMenuItems, getIntelligence, getOpportunities, getLastUpdated } from "@/lib/notion-queries";
import { formatPeriod, findIntelligence } from "@/lib/format";
import { MENU_CATEGORY_ORDER, menuCategoryLabel } from "@/lib/menu";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import KpiCard from "@/components/KpiCard";
import EmptyState from "@/components/EmptyState";
import OrientationBlock from "@/components/OrientationBlock";
import MenuCategorySection from "@/components/MenuCategorySection";
import MenuQuadrantScorecard from "@/components/MenuQuadrantScorecard";
import FindingSection from "@/components/FindingSection";
import ScrollToSection from "@/components/ScrollToSection";
import OpportunitiesPanel from "@/components/OpportunitiesPanel";
import { MENU_CATEGORY_SECTION } from "@/lib/deep-links";
import type { Opportunity } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";

// ─── Period selector — plain links (batch is chosen server-side via
// searchParams), consistent with how PropertyTabs navigates elsewhere on
// this app rather than introducing client-side tab state. Only rendered
// when 2+ Published batches exist for this property (see Page below) — one
// data point doesn't need a switcher, and this stays ready for when a
// second period lands without any further work. ──────────────────────────

function PeriodSelector({
  batches,
  activeBatchId,
  basePath,
}: {
  batches: { id: string; reportingPeriod: string | null }[];
  activeBatchId: string;
  basePath: string;
}) {
  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      {batches.map((b) => {
        const active = b.id === activeBatchId;
        return (
          <Link
            key={b.id}
            href={`${basePath}?batch=${b.id}`}
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
            {formatPeriod(b.reportingPeriod)}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
  searchParams: Promise<{ batch?: string; category?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  const { batch: batchParam, category: categoryParam } = await searchParams;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  // Deep-link anchor (Cross-tab audit Part 4, routing map centralized in
  // src/lib/deep-links.ts for Redesign prompt Step 5) — the only category
  // that maps here is Menu, landing on the Menu Insights FindingSection
  // below (which itself only renders when a Menu-category Intelligence
  // finding exists for the active batch's period — ScrollToSection no-ops
  // if it's absent).
  const scrollTargetId = categoryParam ? MENU_CATEGORY_SECTION[categoryParam] ?? null : null;

  const [property, menuBatches, lastUpdated] = await Promise.all([
    getProperty(propertyId, clientId),
    getMenuBatches(propertyId),
    getLastUpdated(propertyId, clientId),
  ]);

  if (!property) notFound();

  const basePath = `/${clientId}/${propertyId}/menu`;

  return (
    <PageWrapper noTopPadding>
      <ScrollToSection targetId={scrollTargetId} />
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="menu" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-8">
        {menuBatches.length === 0 ? (
          <EmptyState
            title="No menu data yet"
            body="Upload a menu engineering report to activate item-level performance analysis for this property."
            ctaLabel="Go to Upload →"
            ctaHref={`/${clientId}/${propertyId}/upload`}
          />
        ) : (
          (() => {
            // menuBatches is already sorted newest-first (Reporting Period
            // descending) by getMenuBatches — first entry is the default.
            const active = menuBatches.find((b) => b.id === batchParam) ?? menuBatches[0];
            return <MenuBatchView clientId={clientId} propertyId={propertyId} batches={menuBatches} activeBatchId={active.id} basePath={basePath} />;
          })()
        )}
      </div>
    </PageWrapper>
  );
}

// Split out so the batch-scoped Menu Items fetch only happens once a batch
// is resolved (needs an await, so it can't live inline in the JSX above).
async function MenuBatchView({
  propertyId,
  batches,
  activeBatchId,
  basePath,
}: {
  clientId: string;
  propertyId: string;
  batches: { id: string; reportingPeriod: string | null; totalPortions: number | null; itemCount: number | null; avgMarginPct: number | null }[];
  activeBatchId: string;
  basePath: string;
}) {
  const activeBatch = batches.find((b) => b.id === activeBatchId)!;
  const [items, intelligence, opportunities] = await Promise.all([
    getMenuItems(activeBatchId),
    getIntelligence(propertyId, { clientVisibleOnly: true }),
    activeBatch.reportingPeriod ? getOpportunities(propertyId, activeBatch.reportingPeriod) : Promise.resolve([]),
  ]);

  // Opportunities panel (Redesign prompt Step 2) — same pattern as Financial
  // Review Step 1, filtered to Menu category and this batch's own period.
  const menuOpportunities = (opportunities as Opportunity[]).filter((o) => o.category === "Menu");

  // Same Executive Interpretation + Evidence pattern Financial Review uses
  // (Cross-tab audit Part 3), via the shared FindingSection component.
  // Menu Engineering has no KpiMetric data (Menu Items/Batches are a
  // different shape entirely), so metrics/allMetrics are always empty —
  // FindingSection already degrades gracefully for that (no Evidence
  // table, no Trend chart), leaving just the current-read callout and
  // Executive Interpretation toggle, driven entirely by the Menu-category
  // Intelligence finding for this batch's own Reporting Period.
  const menuIntel = findIntelligence(intelligence, "Menu", activeBatch.reportingPeriod);

  // Daypart scope (Menu Engineering rebuild, Phase 0 item 3) — computed
  // from the real items rather than assumed. Confirmed directly against
  // Notion that Lex Yard's current batch is Dinner-only (all 50 Published
  // items), but this stays honest if a future batch genuinely mixes
  // dayparts instead of silently treating every batch as Dinner-only.
  const daypartsPresent = [...new Set(items.map((i) => i.daypart))];
  const daypartScopeLabel =
    daypartsPresent.length === 1
      ? `${daypartsPresent[0]} menu`
      : daypartsPresent.length > 1
      ? `${daypartsPresent.join(", ")} menus`
      : null;

  // Items grouped by category, in the fixed display order (Phase 1 item 1)
  // — "Other" (displayed as Market Menu) always last, confirmed exclusively
  // Market Menu items (Phase 0 item 2). Only categories with real items
  // render a section.
  const itemsByCategory = MENU_CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((i) => i.category === category),
  })).filter((c) => c.items.length > 0);

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <SectionHeader title="Menu Engineering" />
        {batches.length > 1 && (
          <PeriodSelector batches={batches} activeBatchId={activeBatchId} basePath={basePath} />
        )}
      </div>

      {/* Orientation — for a reader landing here directly, and the explicit
          daypart-scope statement Phase 0 item 3 requires (Menu Engineering
          rebuild). */}
      {daypartScopeLabel && (
        <OrientationBlock>
          Item-level performance for the {daypartScopeLabel}, organized by category to match how the menu is actually built and priced — {itemsByCategory.map((c) => menuCategoryLabel(c.category)).join(", ")}.
        </OrientationBlock>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Items Published" value={(activeBatch.itemCount ?? items.length).toLocaleString()} />
        <KpiCard label="Total Portions" value={activeBatch.totalPortions != null ? activeBatch.totalPortions.toLocaleString() : "—"} />
        <KpiCard
          label="Average Margin"
          value={activeBatch.avgMarginPct != null ? `${activeBatch.avgMarginPct.toFixed(1)}%` : "—"}
          variant="amber"
        />
      </div>

      {(menuIntel?.currentRead || menuIntel?.whyItMatters || menuIntel?.suggestedDecision) && (
        <FindingSection id="menu-insights" heading="Menu Insights" intelligence={menuIntel} metrics={[]} allMetrics={[]} trendColor="#B8935A" />
      )}

      {items.length === 0 ? (
        <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.4)", padding: "24px 0" }}>
          This batch has no Published items yet.
        </p>
      ) : (
        <>
          {/* Category-level scorecard (Phase 2) — the number an owner wants
              first: is a given category structurally healthy. Built from
              the same items every scatter plot and subtotal row below
              uses. */}
          <section className="space-y-4">
            <SectionHeader title="Quadrant Scorecard" />
            <MenuQuadrantScorecard itemsByCategory={itemsByCategory} />
          </section>

          {/* Per-category sections (Phase 1) — own subtotal, own scatter
              plot, own item table, replacing the old single flat list and
              undifferentiated chart. */}
          {itemsByCategory.map(({ category, items: categoryItems }) => (
            <MenuCategorySection
              key={category}
              category={category}
              items={categoryItems}
              batchAvgMarginPct={activeBatch.avgMarginPct}
              id={`category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            />
          ))}
        </>
      )}

      {/* Opportunities — moved to close the tab, after the findings that
          motivate them, matching the pattern established on Financial and
          Commercial Review. */}
      <OpportunitiesPanel opportunities={menuOpportunities} />
    </>
  );
}
