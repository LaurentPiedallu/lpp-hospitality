// All query functions are edge-compatible and server-side only.
// Every public-facing query enforces Published status + client isolation.

import {
  queryDatabase, publishedAnd, relationFilter, dateEqualsFilter,
  title, richText, select, num, email, url, checkbox,
  relationId, relationIds, rollupNumber, formulaNumber, formulaString,
  updateSelectProperty, getPage,
} from "./notion-fetch";
import { NOTION_DBS } from "./notion-ids";
import { maxIso } from "./format";
import type {
  Client, Property, KpiMetric, KpiSummary, Action, Opportunity,
  Risk, Intelligence, Initiative, Brief, Benchmark, Upload,
  MenuBatch, MenuItem, MenuQuadrant,
  DataConfidence, Severity, RiskStatus, InitiativeStatus, InitiativeColumn,
  OverallHealth, ClientStatus, PropertyStatus, PublishGateStatus, PublishStatus,
} from "@/types/portal";

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  const pages = await queryDatabase({ databaseId: NOTION_DBS.CLIENTS });
  return pages.map((p) => ({
    id: p.id,
    name: title(p, "Client Name"),
    status: (select(p, "Client Status") || "Active") as ClientStatus,
    email: email(p, "Primary Contact Email"),
  }));
}

export async function getClient(clientId: string): Promise<Client | null> {
  const all = await getClients();
  return all.find((c) => c.id === clientId) ?? null;
}

// ─── Properties ───────────────────────────────────────────────────────────────

export async function getProperties(clientId: string): Promise<Property[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.PROPERTIES,
    filter: relationFilter("Client", clientId),
  });
  return pages.map((p) => ({
    id: p.id,
    clientId,
    name: title(p, "Property Name"),
    location: richText(p, "Location"),
    conceptType: select(p, "Concept Type"),
    status: (select(p, "Status") || "Active") as PropertyStatus,
    dataConfidence: (select(p, "Data Confidence") || "Medium") as DataConfidence,
  }));
}

export async function getProperty(propertyId: string, clientId: string): Promise<Property | null> {
  const all = await getProperties(clientId);
  return all.find((p) => p.id === propertyId) ?? null;
}

// ─── KPI Records ──────────────────────────────────────────────────────────────
// One row per metric — we aggregate into a KpiSummary for display.

export async function getKpiMetrics(propertyId: string): Promise<KpiMetric[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.KPI_RECORDS,
    filter: publishedAnd(relationFilter("Property", propertyId)),
    sorts: [{ property: "Reporting Period", direction: "descending" }],
  });
  return pages.map((p) => ({
    id: p.id,
    propertyId,
    kpiRecord: title(p, "KPI Record"),
    category: select(p, "KPI Category"),
    metricName: richText(p, "Metric Name"),
    lppMetricKey: (select(p, "LPP Metric Key") || null) as import("@/types/portal").LppMetricKey | null,
    segment: select(p, "Segment") || null,
    metricValue: num(p, "Metric Value"),
    unit: select(p, "Unit"),
    severity: (select(p, "Severity") || "Monitor") as Severity,
    trend: select(p, "Trend"),
    confidence: (select(p, "Confidence") || "Medium") as DataConfidence,
    benchmarkLow: p.properties?.["Benchmark Low"]?.number ?? null,
    benchmarkHigh: p.properties?.["Benchmark High"]?.number ?? null,
    targetValue: p.properties?.["Target Value"]?.number ?? null,
    interpretation: richText(p, "LPP Interpretation"),
    sourceNotes: richText(p, "Source Notes"),
    periodStart: p.properties?.["Reporting Period"]?.date?.start ?? null,
    processedAt: (p.last_edited_time as string) ?? null,
  }));
}

// Build a summary object from the most recent period's metrics.
// Matches by KPI Category + Unit so metric naming stays flexible.
export function buildKpiSummary(metrics: KpiMetric[]): KpiSummary | null {
  if (metrics.length === 0) return null;

  // Find the most recent period
  const latestPeriod = metrics
    .map((m) => m.periodStart)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  // Use only metrics from the latest period
  const current = latestPeriod
    ? metrics.filter((m) => m.periodStart === latestPeriod)
    : metrics;

  // Lookup strictly by the canonical LPP Metric Key. No fallback matching by
  // category/unit/display name — that heuristic was silently pairing the
  // wrong record (e.g. an avg-check row) with a metric whenever a property's
  // KPI Records didn't have LPP Metric Key populated, producing bogus values
  // like a $46 "total revenue". Missing key -> null -> renders as "—", which
  // is the honest result when the source data isn't tagged correctly.
  //
  // Optional category param: "covers" is reused across two KPI Categories
  // (Revenue's "Total Covers (Revenue Customers)" vs Guest Experience's
  // "Total Covers Surveyed" / "Survey Response Count") — key alone picked
  // up whichever record Notion happened to return first. Verified this is
  // the only LPP Metric Key that repeats across categories in the current
  // dataset; every other key below maps to exactly one category.
  //
  // Segment defaults to Total (blank Segment counts as Total too — see
  // findMetricByKey in lib/format.ts for the same convention). Necessary as
  // of the Segment reclassification: "covers", "total_payroll", "total_cogs"
  // and "opex" now each have multiple same-period, same-category records
  // (Breakfast/Lunch/Dinner covers, Food/Beverage COGS, etc.) alongside the
  // Total one, and without this, .find() silently returned whichever
  // segment record happened to come first — confirmed live-wrong on the
  // Dashboard property cards (Lex Yard showing "2,400 covers" / "$26K COGS"
  // instead of the real 7,040 / $144K) before this fix.
  const byKey = (key: string, category?: string) =>
    current.find(
      (m) => m.lppMetricKey === key && (!category || m.category === category) && (m.segment ?? "Total") === "Total"
    )?.metricValue ?? null;

  // Derive worst financial severity
  const severityRank: Record<Severity, number> = {
    Healthy: 0, Monitor: 1, Validate: 1, "Action Required": 2, Critical: 3,
  };
  const financialSeverity = current.reduce<Severity>((worst, m) => {
    return severityRank[m.severity] > severityRank[worst] ? m.severity : worst;
  }, "Healthy");

  return {
    period: latestPeriod ?? "",
    revenue:         byKey("total_revenue"),
    covers:          byKey("covers", "Revenue"),
    avgSpend:        byKey("avg_spend"),
    laborDollars:    byKey("total_payroll"),
    laborPct:        byKey("labor_pct"),
    cogsDollars:     byKey("total_cogs"),
    cogsPct:         byKey("cogs_pct"),
    opexDollars:     byKey("opex"),
    opexPct:         byKey("opex_pct"),
    netProfitDollars: byKey("net_profit"),
    netProfitPct:    byKey("net_profit_pct"),
    guestOverall:    byKey("guest_overall"),
    guestFood:       byKey("guest_food"),
    guestService:    byKey("guest_service"),
    guestAmbiance:   byKey("guest_ambiance"),
    financialSeverity,
  };
}

export async function getLatestKpiSummary(propertyId: string): Promise<KpiSummary | null> {
  const metrics = await getKpiMetrics(propertyId);
  return buildKpiSummary(metrics);
}

// True when a property has financial KPI Records in Notion that exist but
// aren't Published (e.g. stuck in Draft/LPP Review/Archived) — the case where
// data was uploaded and processed but silently never surfaced in the portal.
// Call this only when a summary's financial fields are unexpectedly all null;
// most properties always have *some* non-Published rows from re-processed
// uploads, so this isn't a signal on its own.
export async function hasUnpublishedFinancialData(propertyId: string): Promise<boolean> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.KPI_RECORDS,
    filter: {
      and: [
        relationFilter("Property", propertyId),
        { property: "Publish Status", select: { does_not_equal: "Published" } },
        {
          or: ["Revenue", "Labor", "COGS", "OpEx", "Profitability"].map((cat) => ({
            property: "KPI Category",
            select: { equals: cat },
          })),
        },
      ],
    },
    pageSize: 1,
  });
  return pages.length > 0;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getActions(propertyId: string): Promise<Action[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.ACTIONS,
    filter: publishedAnd(relationFilter("Property", propertyId)),
  });
  return pages.map((p) => ({
    id: p.id,
    propertyId,
    title: title(p, "Action"),
    notes: richText(p, "Notes"),
    owner: richText(p, "Owner"),
    status: (select(p, "Status") || "Not Started") as Action["status"],
    priority: (select(p, "Priority") || "Medium") as Action["priority"],
    decisionRequired: checkbox(p, "Decision Required"),
    dueDateIso: p.properties?.["Due Date"]?.date?.start ?? null,
    clientVisible: checkbox(p, "Client Visible"),
  }));
}

// ─── Opportunities ────────────────────────────────────────────────────────────
// Internal-only database — feeds Actions and Briefs. Never render this list
// raw on a client-facing page; use it for aggregate stats or to resolve a
// Brief's "Biggest Opportunity" relation instead.

// periodIso scopes to one Reporting Period; omit only for internal/aggregate
// call sites that intentionally look across all periods (e.g. Commercial
// Review's opportunities panel, unchanged by this fix).
export async function getOpportunities(propertyId: string, periodIso?: string): Promise<Opportunity[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.OPPORTUNITIES,
    filter: publishedAnd(
      periodIso
        ? { and: [relationFilter("Property", propertyId), dateEqualsFilter("Reporting Period", periodIso)] }
        : relationFilter("Property", propertyId)
    ),
  });
  return pages.map((p) => ({
    id: p.id,
    propertyId,
    title: title(p, "Opportunity"),
    estimatedAnnualImpact: num(p, "Estimated Annual Impact"),
    estimatedMonthlyImpact: num(p, "Estimated Monthly Impact"),
    stage: select(p, "Stage"),
    category: select(p, "Opportunity Category"),
    priority: select(p, "Priority"),
    nextStep: richText(p, "Next Step"),
    sourceIntelligenceId: relationId(p, "Source Intelligence") || null,
    demandContext: (select(p, "Demand Context") || null) as import("@/types/portal").DemandContext | null,
  }));
}

// ─── Risks ────────────────────────────────────────────────────────────────────
// Internal-only database — same rules as Opportunities above.

export async function getRisks(propertyId: string, periodIso?: string): Promise<Risk[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.RISKS,
    filter: publishedAnd(
      periodIso
        ? { and: [relationFilter("Property", propertyId), dateEqualsFilter("Reporting Period", periodIso)] }
        : relationFilter("Property", propertyId)
    ),
  });
  return pages.map((p) => ({
    id: p.id,
    propertyId,
    title: title(p, "Risk"),
    mitigationPlan: richText(p, "Mitigation Plan"),
    status: (select(p, "Status") || "Open") as RiskStatus,
    impact: select(p, "Impact"),
    category: select(p, "Risk Category"),
  }));
}

// ─── Intelligence ─────────────────────────────────────────────────────────────

// clientVisibleOnly: apply at every call site that surfaces Intelligence
// *content* (finding/currentRead/whyItMatters/suggestedDecision text) to a
// client session — Overview, Financial Review, Commercial Review, the
// Intelligence tab, and the /api/data/intelligence REST endpoint. The
// "Client Visible" checkbox is already backfilled false for Data Quality
// category records and any record naming an individual by name (verified
// against live data: zero exceptions across all three properties among
// Published records). Deliberately NOT the default — two real callers need
// every record regardless of visibility: the rate-limit check in
// /api/intelligence/request (must see the true most-recent record per
// category, not just the client-visible one, or it under-limits) and
// getLastUpdated below (a max-timestamp computation, never renders
// content, so filtering it would just be a wrong "last updated" figure).
export async function getIntelligence(
  propertyId: string,
  opts?: { clientVisibleOnly?: boolean }
): Promise<Intelligence[]> {
  const propertyFilter = relationFilter("Property", propertyId);
  const scoped = opts?.clientVisibleOnly
    ? { and: [propertyFilter, { property: "Client Visible", checkbox: { equals: true } }] }
    : propertyFilter;
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.INTELLIGENCE,
    filter: publishedAnd(scoped),
    sorts: [{ property: "Reporting Period", direction: "descending" }],
  });
  return pages.map((p) => ({
    id: p.id,
    propertyId,
    finding: title(p, "Finding"),
    category: select(p, "Intelligence Category"),
    currentRead: richText(p, "Current Read"),
    whyItMatters: richText(p, "Why It Matters"),
    suggestedDecision: richText(p, "Suggested Decision"),
    severity: (select(p, "Severity") || "Monitor") as Severity,
    confidence: (select(p, "Confidence") || "Medium") as DataConfidence,
    periodStart: p.properties?.["Reporting Period"]?.date?.start ?? null,
    createdAt: (p.created_time as string) ?? null,
    processedAt: (p.last_edited_time as string) ?? null,
    estimatedAnnualImpact: num(p, "Estimated Annual Impact"),
    estimatedMonthlyImpact: num(p, "Estimated Monthly Impact"),
  }));
}

// ─── Initiatives ──────────────────────────────────────────────────────────────

function priorityToColumn(priority: string): InitiativeColumn {
  if (priority === "Critical" || priority === "High") return "Now";
  if (priority === "Medium") return "Next";
  return "Later";
}

export async function getInitiatives(propertyId: string): Promise<Initiative[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.INITIATIVES,
    filter: publishedAnd(relationFilter("Property", propertyId)),
  });
  return pages.map((p) => {
    const priority = select(p, "Priority") || "Medium";
    const completionFraction = rollupNumber(p, "Completion %");
    return {
      id: p.id,
      propertyId,
      title: title(p, "Initiative"),
      category: select(p, "Initiative Category"),
      operationalOwner: richText(p, "Operational Owner"),
      financialOwner: richText(p, "Financial Owner"),
      status: (select(p, "Status") || "Not Started") as InitiativeStatus,
      priority,
      column: priorityToColumn(priority),
      expectedImpact: num(p, "Expected Impact"),
      nextMilestone: richText(p, "Next Milestone"),
      actionIds: relationIds(p, "Actions"),
      completionPct: completionFraction != null ? Math.round(completionFraction * 100) : null,
    };
  });
}

// Update an Action's Status in Notion and return the confirmed value from
// Notion's response — the caller should trust this over whatever it optimistically
// assumed, since it's read back from the actual write result.
export async function updateActionStatus(
  actionId: string,
  status: Action["status"]
): Promise<Action["status"]> {
  const page = await updateSelectProperty(actionId, "Status", status);
  return (select(page, "Status") || status) as Action["status"];
}

// ─── Briefs ───────────────────────────────────────────────────────────────────

function toBrief(p: Awaited<ReturnType<typeof queryDatabase>>[number], clientId: string): Brief {
  return {
    id: p.id,
    clientId,
    propertyId: relationId(p, "Property") || null,
    title: title(p, "Brief"),
    executiveSummary: richText(p, "Executive Summary"),
    executiveRead: richText(p, "Executive Read"),
    criticalDrivers: richText(p, "Critical Drivers"),
    lppPerspective: richText(p, "LPP Perspective"),
    recommendedFocus: richText(p, "Recommended Focus"),
    decisionsRequired: richText(p, "Decisions Required"),
    overallHealth: (select(p, "Overall Health") || null) as OverallHealth | null,
    confidence: (select(p, "Confidence") || "Medium") as DataConfidence,
    estimatedAnnualImpact: num(p, "Estimated Annual Impact"),
    briefPageUrl: url(p, "Brief Page URL"),
    reportingPeriodStart: p.properties?.["Reporting Period"]?.date?.start ?? null,
    publishedDateStart: p.properties?.["Published Date"]?.date?.start ?? null,
    biggestOpportunityId: relationId(p, "Biggest Opportunity") || null,
    biggestRiskId: relationId(p, "Biggest Risk") || null,
    // Not yet real Briefs properties — see the Brief type's comments on
    // these two fields. richText() returns "" for a property that doesn't
    // exist on the page, so this is safe to read now.
    outlook: richText(p, "Outlook"),
    ownershipQuestions: richText(p, "Ownership Discussion"),
    driverFindingIds: relationIds(p, "Driver Findings"),
  };
}

export async function getBriefs(clientId: string): Promise<Brief[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.BRIEFS,
    filter: publishedAnd(relationFilter("Client", clientId)),
    sorts: [{ property: "Published Date", direction: "descending" }],
  });
  return pages.map((p) => toBrief(p, clientId));
}

// The most recent Published Brief for a specific property — this establishes
// "the current Reporting Period" for that property. Every period-scoped query
// on the property overview should be anchored to this Brief's period, not to
// "everything ever generated for this property."
export async function getLatestPublishedBrief(propertyId: string, clientId: string): Promise<Brief | null> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.BRIEFS,
    filter: publishedAnd(relationFilter("Property", propertyId)),
    sorts: [{ property: "Reporting Period", direction: "descending" }],
    pageSize: 1,
  });
  return pages[0] ? toBrief(pages[0], clientId) : null;
}

// Every Published Brief for a property, newest first — unlike
// getLatestPublishedBrief above, not capped to one. Used to find the prior
// *reviewed* period for period-over-period deltas (e.g. Overview's "Since
// Last Review"), which must be the prior Published Brief's period, not just
// any period that happens to have KPI Records — a property can have KPI
// data for a period whose Brief was never published to the client (e.g.
// Peacock Alley has real March + June KPI data, but only March has ever
// been Published as a Brief).
export async function getPublishedBriefs(propertyId: string, clientId: string): Promise<Brief[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.BRIEFS,
    filter: publishedAnd(relationFilter("Property", propertyId)),
    sorts: [{ property: "Reporting Period", direction: "descending" }],
  });
  return pages.map((p) => toBrief(p, clientId));
}

// "Last updated" for the property hero — most recent Notion last_edited_time
// (see KpiMetric.processedAt / Intelligence.processedAt) across this
// property's current-period KPI Records and Intelligence, where "current
// period" is anchored to the latest Published Brief's Reporting Period, same
// definition the Overview page uses. Self-contained (fetches its own data)
// so every property tab can call it identically regardless of what else
// that page already has loaded.
export async function getLastUpdated(propertyId: string, clientId: string): Promise<string | null> {
  const [metrics, intelligence, brief] = await Promise.all([
    getKpiMetrics(propertyId),
    getIntelligence(propertyId),
    getLatestPublishedBrief(propertyId, clientId),
  ]);

  const currentPeriod = brief?.reportingPeriodStart ?? null;
  const periodMetrics = currentPeriod ? metrics.filter((m) => m.periodStart === currentPeriod) : metrics;
  const periodIntel = currentPeriod ? intelligence.filter((i) => i.periodStart === currentPeriod) : intelligence;

  return maxIso([
    ...periodMetrics.map((m) => m.processedAt),
    ...periodIntel.map((i) => i.processedAt),
  ]);
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────
// No Publish Status in Benchmarks DB — return all records.

export async function getBenchmarks(conceptType?: string): Promise<Benchmark[]> {
  const filter = conceptType
    ? { property: "Concept Type", select: { equals: conceptType } }
    : undefined;

  const pages = await queryDatabase({
    databaseId: NOTION_DBS.BENCHMARKS,
    filter,
  });
  return pages.map((p) => ({
    id: p.id,
    title: title(p, "Benchmark"),
    metricName: richText(p, "Metric Name"),
    conceptType: select(p, "Concept Type"),
    market: select(p, "Market"),
    lowRange: p.properties?.["Low Range"]?.number ?? null,
    highRange: p.properties?.["High Range"]?.number ?? null,
    topQuartile: p.properties?.["Top Quartile"]?.number ?? null,
    unit: select(p, "Unit"),
  }));
}

// ─── Uploads ──────────────────────────────────────────────────────────────────

export async function getUploads(clientId: string, propertyId: string): Promise<Upload[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.UPLOADS,
    // Uploads have no Publish Status — filter only by property relation
    filter: relationFilter("Property", propertyId),
    sorts: [{ property: "Upload Date", direction: "descending" }],
  });
  return pages.map((p) => ({
    id: p.id,
    clientId,
    propertyId,
    fileName: title(p, "Upload Name"),
    fileUrl: url(p, "File URL") ?? "",
    uploadedAt: p.properties?.["Upload Date"]?.date?.start ?? null,
    status: (select(p, "Processing Status") || "Pending") as Upload["status"],
    notes: richText(p, "Validation Notes"),
    uploadType: select(p, "Upload Type"),
    reportingPeriod: p.properties?.["Reporting Period"]?.date?.start ?? null,
  }));
}

// ─── Menu Engineering ─────────────────────────────────────────────────────────
// Menu Batches: one per property + reporting period. Menu Items: one per dish,
// linked back to a batch. Both Published-only, same convention as everywhere
// else on this page.

export async function getMenuBatches(propertyId: string): Promise<MenuBatch[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.MENU_BATCHES,
    filter: publishedAnd(relationFilter("Batch Property", propertyId)),
    sorts: [{ property: "Reporting Period", direction: "descending" }],
  });
  return pages.map((p) => ({
    id: p.id,
    propertyId,
    reportingPeriod: p.properties?.["Reporting Period"]?.date?.start ?? null,
    totalPortions: rollupNumber(p, "Total Portions"),
    itemCount: rollupNumber(p, "Item Count"),
    avgMarginPct: rollupNumber(p, "Average Margin Pct"),
  }));
}

export async function getMenuItems(menuBatchId: string): Promise<MenuItem[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.MENU_ITEMS,
    filter: publishedAnd(relationFilter("Menu Batch", menuBatchId)),
  });
  return pages.map((p) => ({
    id: p.id,
    menuBatchId,
    itemName: title(p, "Item Name"),
    category: select(p, "Category"),
    daypart: select(p, "Daypart"),
    portionsSold: num(p, "Portions Sold"),
    price: num(p, "Price"),
    foodCost: num(p, "Food Cost"),
    contributionMargin: formulaNumber(p, "Contribution Margin"),
    marginPct: formulaNumber(p, "Margin Pct"),
    foodCostPct: formulaNumber(p, "Food Cost Pct"),
    revenue: formulaNumber(p, "Revenue"),
    popularityIndex: formulaNumber(p, "Popularity Index"),
    quadrant: (formulaString(p, "Quadrant") || "Pending") as MenuQuadrant,
  }));
}

// ─── Admin: publish-gate status ────────────────────────────────────────────
// Deliberately reads every record regardless of Publish Status — the whole
// point is to see what's still sitting unreviewed. Never call this from a
// client-facing page; gate it at the route level (session.role === "admin").

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawPage = Record<string, any>;

function rawReportingPeriod(p: RawPage): string | null {
  return p.properties?.["Reporting Period"]?.date?.start ?? null;
}

function rawPublishStatus(p: RawPage): string {
  return p.properties?.["Publish Status"]?.select?.name ?? "Draft";
}

export async function getPublishGateStatus(
  propertyId: string,
  propertyName: string,
  clientId: string
): Promise<PublishGateStatus> {
  const [oppPages, riskPages, intelPages] = await Promise.all([
    queryDatabase({ databaseId: NOTION_DBS.OPPORTUNITIES, filter: relationFilter("Property", propertyId) }),
    queryDatabase({ databaseId: NOTION_DBS.RISKS, filter: relationFilter("Property", propertyId) }),
    queryDatabase({ databaseId: NOTION_DBS.INTELLIGENCE, filter: relationFilter("Property", propertyId) }),
  ]);

  const allPeriods = [...oppPages, ...riskPages, ...intelPages]
    .map(rawReportingPeriod)
    .filter((d): d is string => d != null);

  if (allPeriods.length === 0) {
    return {
      propertyId, propertyName, clientId, period: null,
      intelOppRisk: null, actions: null, briefStatus: null, initiativeMismatchCount: 0,
    };
  }

  const period = allPeriods.sort().reverse()[0];
  const inPeriod = (p: RawPage) => rawReportingPeriod(p) === period;

  const periodRecords = [...oppPages, ...riskPages, ...intelPages].filter(inPeriod);
  const intelOppRisk = {
    total: periodRecords.length,
    published: periodRecords.filter((p) => rawPublishStatus(p) === "Published").length,
  };

  // Actions carry no Reporting Period of their own — trace through their
  // Source Opportunity/Source Risk to attribute them to this period.
  const periodSourceIds = new Set(periodRecords.map((p) => p.id));
  const actionPages = await queryDatabase({
    databaseId: NOTION_DBS.ACTIONS,
    filter: relationFilter("Property", propertyId),
  });
  const periodActions = actionPages.filter((a) => {
    if (!checkbox(a, "Client Visible")) return false;
    const srcOppId = a.properties?.["Source Opportunity"]?.relation?.[0]?.id;
    const srcRiskId = a.properties?.["Source Risk"]?.relation?.[0]?.id;
    return (srcOppId && periodSourceIds.has(srcOppId)) || (srcRiskId && periodSourceIds.has(srcRiskId));
  });
  const actions = {
    total: periodActions.length,
    published: periodActions.filter((p) => rawPublishStatus(p) === "Published").length,
  };

  const briefPages = await queryDatabase({
    databaseId: NOTION_DBS.BRIEFS,
    filter: relationFilter("Property", propertyId),
  });
  const periodBrief = briefPages.find(inPeriod);
  const briefStatus = periodBrief ? (rawPublishStatus(periodBrief) as PublishStatus) : null;

  // Data-linking check: an Action correctly scoped to this Property, but
  // whose linked Initiative's own Property points elsewhere. This is
  // otherwise invisible — the Action still queries fine by its own Property,
  // it just silently never groups under any Initiative for this property.
  // Not period-scoped: check every Action for this property, any period.
  const actionsWithInitiative = actionPages.filter((a) => a.properties?.["Initiative"]?.relation?.[0]?.id);
  const uniqueInitiativeIds = [
    ...new Set(actionsWithInitiative.map((a) => a.properties["Initiative"].relation[0].id as string)),
  ];
  const initiativePropertyIds = new Map<string, string | null>();
  await Promise.all(
    uniqueInitiativeIds.map(async (initId) => {
      const initPage = await getPage(initId);
      initiativePropertyIds.set(initId, initPage.properties?.["Property"]?.relation?.[0]?.id ?? null);
    })
  );
  const initiativeMismatchCount = actionsWithInitiative.filter((a) => {
    const initId = a.properties["Initiative"].relation[0].id as string;
    const initPropId = initiativePropertyIds.get(initId);
    return initPropId != null && initPropId !== propertyId;
  }).length;

  return { propertyId, propertyName, clientId, period, intelOppRisk, actions, briefStatus, initiativeMismatchCount };
}
