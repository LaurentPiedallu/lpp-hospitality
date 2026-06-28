// All query functions are edge-compatible and server-side only.
// Every public-facing query enforces Published status + client isolation.

import {
  queryDatabase, publishedAnd, relationFilter,
  title, richText, select, num, email, url, checkbox, files,
} from "./notion-fetch";
import { NOTION_DBS } from "./notion-ids";
import type {
  Client, Property, KpiMetric, KpiSummary, Action, Opportunity,
  Risk, Intelligence, Initiative, Brief, Benchmark, Upload,
  DataConfidence, Severity, RiskStatus, InitiativeStatus, InitiativeColumn,
  OverallHealth, ClientStatus, PropertyStatus,
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

  const byCategory = (cat: string) => current.filter((m) => m.category === cat);
  const find = (cat: string, unit: string) =>
    byCategory(cat).find((m) => m.unit === unit)?.metricValue ?? null;
  const findByName = (cat: string, nameFragment: string) =>
    byCategory(cat).find((m) =>
      m.metricName.toLowerCase().includes(nameFragment.toLowerCase())
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
    revenue: find("Revenue", "$") ?? findByName("Revenue", "revenue"),
    covers: find("Revenue", "Count") ?? findByName("Revenue", "cover"),
    avgSpend: findByName("Revenue", "spend") ?? findByName("Revenue", "check"),
    laborDollars: find("Labor", "$"),
    laborPct: find("Labor", "%"),
    cogsDollars: find("COGS", "$"),
    cogsPct: find("COGS", "%"),
    opexDollars: find("OpEx", "$"),
    opexPct: find("OpEx", "%"),
    netProfitDollars: find("Profitability", "$"),
    netProfitPct: find("Profitability", "%"),
    guestOverall: findByName("Guest Experience", "overall") ?? find("Guest Experience", "Rating"),
    guestFood: findByName("Guest Experience", "food"),
    guestService: findByName("Guest Experience", "service"),
    guestAmbiance: findByName("Guest Experience", "ambiance"),
    financialSeverity,
  };
}

export async function getLatestKpiSummary(propertyId: string): Promise<KpiSummary | null> {
  const metrics = await getKpiMetrics(propertyId);
  return buildKpiSummary(metrics);
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
  }));
}

// ─── Opportunities ────────────────────────────────────────────────────────────

export async function getOpportunities(propertyId: string): Promise<Opportunity[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.OPPORTUNITIES,
    filter: publishedAnd(relationFilter("Property", propertyId)),
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
  }));
}

// ─── Risks ────────────────────────────────────────────────────────────────────

export async function getRisks(propertyId: string): Promise<Risk[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.RISKS,
    filter: publishedAnd(relationFilter("Property", propertyId)),
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
    };
  });
}

// ─── Briefs ───────────────────────────────────────────────────────────────────

export async function getBriefs(clientId: string): Promise<Brief[]> {
  const pages = await queryDatabase({
    databaseId: NOTION_DBS.BRIEFS,
    filter: publishedAnd(relationFilter("Client", clientId)),
    sorts: [{ property: "Published Date", direction: "descending" }],
  });
  return pages.map((p) => ({
    id: p.id,
    clientId,
    title: title(p, "Brief"),
    executiveSummary: richText(p, "Executive Summary"),
    overallHealth: (select(p, "Overall Health") || null) as OverallHealth | null,
    confidence: (select(p, "Confidence") || "Medium") as DataConfidence,
    estimatedAnnualImpact: num(p, "Estimated Annual Impact"),
    briefPageUrl: url(p, "Brief Page URL"),
    reportingPeriodStart: p.properties?.["Reporting Period"]?.date?.start ?? null,
    publishedDateStart: p.properties?.["Published Date"]?.date?.start ?? null,
  }));
}

export async function getLatestBrief(clientId: string, propertyId?: string): Promise<Brief | null> {
  const all = await getBriefs(clientId);
  if (!propertyId) return all[0] ?? null;
  // If we later add property-level briefs, filter here
  return all[0] ?? null;
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
    filter: publishedAnd(relationFilter("Property", propertyId)),
    sorts: [{ property: "Upload Date", direction: "descending" }],
  });
  return pages.map((p) => ({
    id: p.id,
    clientId,
    propertyId,
    fileName: title(p, "File Name"),
    fileUrl: files(p, "File") ?? url(p, "File URL") ?? "",
    uploadedAt: p.properties?.["Upload Date"]?.date?.start ?? null,
    status: (select(p, "Status") || "Pending Review") as Upload["status"],
    notes: richText(p, "Notes"),
  }));
}
