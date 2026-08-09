import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getMenuBatches, getMenuItems, getIntelligence, getLastUpdated } from "@/lib/notion-queries";
import { formatPeriod, findIntelligence } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import KpiCard from "@/components/KpiCard";
import EmptyState from "@/components/EmptyState";
import MenuQuadrantScatter from "@/components/MenuQuadrantScatter";
import MenuItemsTable from "@/components/MenuItemsTable";
import FindingSection from "@/components/FindingSection";
import ScrollToSection from "@/components/ScrollToSection";

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

  // Deep-link anchor (Cross-tab audit Part 4) — the only category that maps
  // here is Menu, landing on the Menu Insights FindingSection below (which
  // itself only renders when a Menu-category Intelligence finding exists
  // for the active batch's period — ScrollToSection no-ops if it's absent).
  const scrollTargetId = categoryParam === "Menu" ? "menu-insights" : null;

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
  const [items, intelligence] = await Promise.all([
    getMenuItems(activeBatchId),
    getIntelligence(propertyId, { clientVisibleOnly: true }),
  ]);

  // Same Executive Interpretation + Evidence pattern Financial Review uses
  // (Cross-tab audit Part 3), via the shared FindingSection component.
  // Menu Engineering has no KpiMetric data (Menu Items/Batches are a
  // different shape entirely), so metrics/allMetrics are always empty —
  // FindingSection already degrades gracefully for that (no Evidence
  // table, no Trend chart), leaving just the current-read callout and
  // Executive Interpretation toggle, driven entirely by the Menu-category
  // Intelligence finding for this batch's own Reporting Period.
  const menuIntel = findIntelligence(intelligence, "Menu", activeBatch.reportingPeriod);

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <SectionHeader title="Menu Engineering" />
        {batches.length > 1 && (
          <PeriodSelector batches={batches} activeBatchId={activeBatchId} basePath={basePath} />
        )}
      </div>

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
          <MenuQuadrantScatter items={items} avgMarginPct={activeBatch.avgMarginPct} />
          <MenuItemsTable items={items} />
        </>
      )}
    </>
  );
}
