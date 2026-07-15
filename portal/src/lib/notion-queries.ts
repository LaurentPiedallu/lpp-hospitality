// All query functions are edge-compatible and server-side only.
// Every public-facing query enforces Published status + client isolation.

import {
  queryDatabase, publishedAnd, relationFilter, dateEqualsFilter,
  title, richText, select, num, email, url, checkbox,
  relationId, relationIds, rollupNumber, updateSelectProperty, getPage,
} from "./notion-fetch";
import { NOTION_DBS } from "./notion-ids";
import type {
  Client, Property, KpiMetric, KpiSummary, Action, Opportunity,
  Risk, Intelligence, Initiative, Brief, Benchmark, Upload,
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
    metricValue: num(p, "Metric Value"),
    unit: select(p, "Unit"),
    severity: (select(p, "Severity") || "Monitor") as Severity,
    trend: select(p, "Trend"),
    confidence: (select(p, "Confidence") || "Medium") as DataConfidence,
    benchmarkLow: p.properties?.["Benchmark Low"]?.number ?? null,
    benchmarkHigh: p.properties?.["Benchmark High"]?.number ?? null,
    targetValue: p.properties?.["Target Value"]?.number ?? null,
    interpretation: richText(p, "LPP Interpretation"),
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
  const byKey = (key: string, category?: string) =>
    current.find((m) => m.lppMetricKey === key && (!category || m.category === category))?.metricValue ?? null;

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

export async function getIntelligence(propertyId: string): Promise<Intelligence[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.INTELLIGENCE,
    filter: publishedAnd(relationFilter("Property", propertyId)),
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
    overallHealth: (select(p, "Overall Health") || null) as OverallHealth | null,
    confidence: (select(p, "Confidence") || "Medium") as DataConfidence,
    estimatedAnnualImpact: num(p, "Estimated Annual Impact"),
    briefPageUrl: url(p, "Brief Page URL"),
    reportingPeriodStart: p.properties?.["Reporting Period"]?.date?.start ?? null,
    publishedDateStart: p.properties?.["Published Date"]?.date?.start ?? null,
    biggestOpportunityId: relationId(p, "Biggest Opportunity") || null,
    biggestRiskId: relationId(p, "Biggest Risk") || null,
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
