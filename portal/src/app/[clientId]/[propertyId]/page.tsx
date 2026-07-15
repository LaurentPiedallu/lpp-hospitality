import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getProperty, getLatestKpiSummary, getKpiMetrics, getActions, getInitiatives,
  getOpportunities, getRisks, getIntelligence, hasUnpublishedFinancialData,
  getLatestPublishedBrief, getUploads,
} from "@/lib/notion-queries";
import { deriveHealth } from "@/lib/health";
import { usd, pct, compact, formatPeriod, splitIntoParagraphs } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import SectionHeader from "@/components/SectionHeader";
import CalloutBlock from "@/components/CalloutBlock";
import type { Action, Opportunity, Risk, Intelligence, Initiative, KpiMetric, Upload } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const GOLD = "#B8935A";

// Financial Snapshot caption — same weight/size as the existing sub-stat
// line (e.g. "175 covers"). Wraps to as many lines as the sentence needs;
// no clamp or truncation, since these are single sentences where the
// clipped-off tail (often the number that makes it meaningful) is the
// whole point of the caption.
const captionStyle: React.CSSProperties = {
  fontFamily: JOST,
  fontSize: 11,
  color: "rgba(18,18,15,0.45)",
  marginTop: 6,
  lineHeight: 1.4,
};

// ~10% more breathing room than the prior 48px section rhythm.
const SECTION_GAP = 53;

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function topAction(actions: Action[]): Action | null {
  if (actions.length === 0) return null;
  return [...actions].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))[0];
}

function maxIso(dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => d != null);
  return valid.length === 0 ? null : valid.reduce((max, d) => (d > max ? d : max));
}

// Initiative titles are the raw Notion page title (e.g. "Lex Yard — Commercial"),
// not a frontend-constructed string. On this single-property page the property
// name is already shown in the header and tab bar, so strip it here for display
// only — the underlying Notion title, and every other page that reads it
// (e.g. the Initiatives tab), is untouched.
function stripPropertyPrefix(title: string, propertyName: string): string {
  const prefix = `${propertyName} — `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

function PrimarySectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{ fontFamily: SERIF, fontSize: "1.9rem", fontWeight: 400, color: "#12120F", marginBottom: 24 }}>
      {title}
    </h2>
  );
}

// Compact summary — name, category, priority, and only the single
// highest-priority open Action's short description. Full Action-level
// detail (status, due date, every action) lives only on the Initiatives
// page. Priority is sourced from the top linked Action, not the Initiative
// itself — Initiative.priority is unset on every real Initiative record
// (Notion's own default silently renders as "Medium" for all of them,
// which isn't a real signal), while linked Actions carry genuine,
// varied Critical/High/Medium priority.
function InitiativeCompactCard({ initiative, openActions, propertyName }: { initiative: Initiative; openActions: Action[]; propertyName: string }) {
  if (openActions.length === 0) return null;
  const next = topAction(openActions);
  const displayTitle = stripPropertyPrefix(initiative.title, propertyName);

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "22px 26px", marginBottom: 12 }}>
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: next ? 10 : 0 }}>
        <div>
          <h3 style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 400, color: "#12120F" }}>{displayTitle}</h3>
          {initiative.category && (
            <span
              style={{
                fontFamily: JOST,
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(18,18,15,0.4)",
                marginTop: 4,
                display: "inline-block",
              }}
            >
              {initiative.category}
            </span>
          )}
        </div>
        {next?.priority && (
          <span style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, flexShrink: 0 }}>
            {next.priority}
          </span>
        )}
      </div>
      {next && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.55)", lineHeight: 1.6 }}>
          Next · {next.title}
        </p>
      )}
    </div>
  );
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, kpi, allMetrics, actions, initiatives, intelligence, latestBrief, uploads] = await Promise.all([
    getProperty(propertyId, clientId),
    getLatestKpiSummary(propertyId),
    getKpiMetrics(propertyId),
    getActions(propertyId),
    getInitiatives(propertyId),
    getIntelligence(propertyId),
    getLatestPublishedBrief(propertyId, clientId),
    getUploads(clientId, propertyId),
  ]);

  if (!property) notFound();

  // Opportunities and Risks are internal-only analytical inputs (they feed
  // Actions and the Brief) and must be scoped to the current Reporting
  // Period — the most recent Published Brief's period — never aggregated
  // across every period ever generated for this property.
  const currentPeriod = latestBrief?.reportingPeriodStart ?? null;
  const [opportunities, risks] = currentPeriod
    ? await Promise.all([
        getOpportunities(propertyId, currentPeriod),
        getRisks(propertyId, currentPeriod),
      ])
    : [[] as Opportunity[], [] as Risk[]];

  const health = deriveHealth(kpi);
  const openActions = (actions as Action[]).filter((a) => a.clientVisible && a.status !== "Complete");

  // Initiatives with at least one Client Visible, still-open Action — the
  // grouped replacement for the old flat Actions list. Initiatives with
  // nothing left for the client to act on are omitted entirely below.
  const initiativesWithOpenWork = (initiatives as Initiative[]).filter((init) =>
    (actions as Action[]).some(
      (a) => init.actionIds.includes(a.id) && a.clientVisible && a.status !== "Complete"
    )
  );
  const annualOpportunity = (opportunities as Opportunity[]).reduce((s, o) => s + o.estimatedAnnualImpact, 0);
  const biggestOpportunity = latestBrief?.biggestOpportunityId
    ? (opportunities as Opportunity[]).find((o) => o.id === latestBrief.biggestOpportunityId) ?? null
    : null;
  const biggestRisk = latestBrief?.biggestRiskId
    ? (risks as Risk[]).find((r) => r.id === latestBrief.biggestRiskId) ?? null
    : null;

  // The Opportunity record itself has no field for the causal "why" (only
  // a headline title and a "Next Step" action) — the driving Intelligence
  // finding behind it does, so pull that instead of fabricating a field.
  const opportunityDriver = biggestOpportunity?.sourceIntelligenceId
    ? (intelligence as Intelligence[]).find((i) => i.id === biggestOpportunity.sourceIntelligenceId)?.finding ?? null
    : null;

  // Pending uploads — compares upload types seen in prior periods for this
  // property against the current period, so it only flags a type as
  // "pending" when this specific property has actually established a
  // pattern of uploading it. No universal "expected" list is assumed.
  const priorPeriodUploadTypes = new Set(
    (uploads as Upload[])
      .filter((u) => u.reportingPeriod && u.reportingPeriod !== currentPeriod && u.uploadType && u.status !== "Failed")
      .map((u) => u.uploadType)
  );
  const currentPeriodUploadTypes = new Set(
    (uploads as Upload[])
      .filter((u) => u.reportingPeriod === currentPeriod && u.uploadType && u.status !== "Failed")
      .map((u) => u.uploadType)
  );
  const pendingUploadTypes = [...priorPeriodUploadTypes].filter((t) => !currentPeriodUploadTypes.has(t));
  const hasUploadHistory = priorPeriodUploadTypes.size > 0 && currentPeriod != null;

  // Admin-only signal: financial numbers are all missing even though a
  // summary exists — check whether real data is sitting unpublished in Notion.
  const financialFieldsAllNull =
    kpi != null &&
    kpi.revenue == null && kpi.cogsPct == null &&
    kpi.laborPct == null && kpi.netProfitDollars == null;
  const unpublishedFinancialData =
    session.role === "admin" && financialFieldsAllNull
      ? await hasUnpublishedFinancialData(propertyId)
      : false;

  const latestPeriod = (allMetrics as KpiMetric[])
    .map((m) => m.periodStart).filter(Boolean).sort().reverse()[0] ?? null;

  // Financial Snapshot captions — the LPP Interpretation from the specific
  // KPI Record driving that card's value, not a generic property-level
  // field. Left blank (not a placeholder) when the record or its
  // interpretation doesn't exist yet for this property/period.
  function metricInterpretation(key: string): string {
    return (allMetrics as KpiMetric[])
      .find((m) => m.lppMetricKey === key && m.periodStart === latestPeriod)
      ?.interpretation?.trim() ?? "";
  }
  const revenueInterpretation    = metricInterpretation("total_revenue");
  const laborInterpretation      = metricInterpretation("labor_pct");
  const cogsInterpretation       = metricInterpretation("cogs_pct");
  const netProfitInterpretation  = metricInterpretation("net_profit_pct");

  // "Last updated" — no "Processed At" property exists on KPI Records or
  // Intelligence; this uses Notion's own last_edited_time as the honest
  // proxy, taken across this property's current-period records.
  const periodMetrics = currentPeriod ? (allMetrics as KpiMetric[]).filter((m) => m.periodStart === currentPeriod) : (allMetrics as KpiMetric[]);
  const periodIntel = currentPeriod ? (intelligence as Intelligence[]).filter((i) => i.periodStart === currentPeriod) : (intelligence as Intelligence[]);
  const lastUpdated = maxIso([
    ...periodMetrics.map((m) => m.processedAt),
    ...periodIntel.map((i) => i.processedAt),
  ]);

  // Guest Experience — if more than one source value lands in the same
  // period for the same metric key (e.g. two survey uploads), show a range
  // rather than silently averaging or picking one arbitrarily.
  function guestMetric(key: string, fallback: number | null): { display: string; isRange: boolean } | null {
    const raw = (allMetrics as KpiMetric[])
      .filter((m) => m.lppMetricKey === key && m.periodStart === latestPeriod)
      .map((m) => m.metricValue);
    if (raw.length === 0) {
      return fallback != null ? { display: fallback.toFixed(1), isRange: false } : null;
    }
    const uniq = [...new Set(raw)];
    if (uniq.length === 1) return { display: uniq[0].toFixed(1), isRange: false };
    const lo = Math.min(...uniq), hi = Math.max(...uniq);
    return { display: `${lo.toFixed(0)}–${hi.toFixed(0)}`, isRange: true };
  }

  const guestCards = [
    { label: "Overall",  key: "guest_overall",  fallback: kpi?.guestOverall ?? null },
    { label: "Food",     key: "guest_food",     fallback: kpi?.guestFood ?? null },
    { label: "Service",  key: "guest_service",  fallback: kpi?.guestService ?? null },
    { label: "Ambiance", key: "guest_ambiance", fallback: kpi?.guestAmbiance ?? null },
  ]
    .map(({ label, key, fallback }) => ({ label, metric: guestMetric(key, fallback) }))
    .filter((c): c is { label: string; metric: { display: string; isRange: boolean } } => c.metric != null);

  // Structural split only — groups sentences into shorter paragraphs, does
  // not shorten or reword. See splitIntoParagraphs in lib/format.ts.
  const currentReadParagraphs = latestBrief?.executiveSummary
    ? splitIntoParagraphs(latestBrief.executiveSummary, 3)
    : [];

  return (
    <PageWrapper>
      <NavBar session={session} />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="overview" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 0" }}>

        {/* At a glance — a quiet reference strip; Current Read below is the page's visual anchor */}
        <section style={{ marginBottom: SECTION_GAP }}>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2" style={{ paddingBottom: 12, borderBottom: "1px solid rgba(18,18,15,0.06)" }}>
            {[
              { label: "Overall Health", value: health.status },
              { label: "Annual Opportunity", value: annualOpportunity > 0 ? compact(annualOpportunity) : "—" },
              { label: "Actions Needed", value: String(openActions.length) },
              { label: "Data Confidence", value: property.dataConfidence },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: JOST, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(18,18,15,0.3)" }}>
                  {label}
                </span>
                <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.55)", fontWeight: 400 }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Current read — the top-line state, given real visual weight and placed first */}
        {currentReadParagraphs.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
              Current Read
            </p>
            <div style={{ borderLeft: "3px solid #B8935A", paddingLeft: 24 }} className="space-y-3">
              {currentReadParagraphs.map((paragraph, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: SERIF,
                    fontSize: "clamp(0.95rem, 1.3vw, 1.05rem)",
                    fontWeight: 400,
                    lineHeight: 1.7,
                    color: "#12120F",
                  }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* Immediate priorities — compact, links through to the full Initiatives tab for detail */}
        {initiativesWithOpenWork.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <PrimarySectionHeader title="Immediate Priorities" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {initiativesWithOpenWork.map((initiative) => (
                <InitiativeCompactCard
                  key={initiative.id}
                  initiative={initiative}
                  propertyName={property.name}
                  openActions={(actions as Action[]).filter(
                    (a) => initiative.actionIds.includes(a.id) && a.clientVisible && a.status !== "Complete"
                  )}
                />
              ))}
            </div>
            <div className="text-right" style={{ marginTop: 4 }}>
              <Link
                href={`/${clientId}/${propertyId}/initiatives`}
                className="hover:text-[#D4AF7A]"
                style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, textDecoration: "none", transition: "color 0.25s ease" }}
              >
                View all Initiatives →
              </Link>
            </div>
          </section>
        )}
      </div>

      {/* Biggest opportunity — full-bleed hero treatment, rivals the property Hero above */}
      {biggestOpportunity && (
        <section style={{ marginBottom: SECTION_GAP }}>
          <div style={{ marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)", background: "#12120F" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 60px" }}>
              <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: GOLD, marginBottom: 18 }}>
                Biggest Opportunity
              </p>
              <p style={{ fontFamily: SERIF, fontSize: "clamp(1.3rem, 2vw, 1.6rem)", fontWeight: 300, color: "rgba(242,237,228,0.85)", lineHeight: 1.5, maxWidth: 640, marginBottom: opportunityDriver ? 10 : 22 }}>
                {biggestOpportunity.title}
              </p>
              {opportunityDriver && (
                <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(242,237,228,0.45)", maxWidth: 640, marginBottom: 22 }}>
                  {opportunityDriver}
                </p>
              )}
              {biggestOpportunity.estimatedAnnualImpact > 0 && (
                <p style={{ fontFamily: SERIF, fontSize: "clamp(2.8rem, 6vw, 4.2rem)", fontWeight: 300, color: "#B8935A", lineHeight: 1 }}>
                  {compact(biggestOpportunity.estimatedAnnualImpact)}
                  <span style={{ fontFamily: JOST, fontSize: "0.95rem", color: "rgba(242,237,228,0.4)", marginLeft: 14 }}>
                    estimated annual impact
                  </span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 60px 80px" }}>

        {/* Financial snapshot */}
        {kpi && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <SectionHeader title="Financial Snapshot" />
              {latestPeriod && (
                <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>{formatPeriod(latestPeriod)}</span>
              )}
            </div>
            {unpublishedFinancialData && (
              <div style={{ marginBottom: 16, padding: "10px 16px", background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.15)", fontFamily: JOST, fontSize: 13, color: "#C0392B" }}>
                Admin only: financial data exists in Notion for this property but isn&apos;t Published — it won&apos;t appear until published.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Revenue */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Revenue</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, color: "#12120F", lineHeight: 1 }}>
                  {kpi.revenue != null ? compact(kpi.revenue) : "—"}
                </p>
                {kpi.covers != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{kpi.covers.toLocaleString()} covers</p>}
                {revenueInterpretation && <p style={captionStyle}>{revenueInterpretation}</p>}
              </div>

              {/* Labor */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Labor</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.laborPct == null ? "#12120F" : kpi.laborPct <= 42 ? "#12120F" : "#C0392B" }}>
                  {kpi.laborPct != null ? pct(kpi.laborPct) : "—"}
                </p>
                {kpi.laborDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.laborDollars)}</p>}
                {laborInterpretation && <p style={captionStyle}>{laborInterpretation}</p>}
              </div>

              {/* COGS */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Food COGS</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.cogsPct == null ? "#12120F" : kpi.cogsPct <= 34 ? "#12120F" : "#C0392B" }}>
                  {kpi.cogsPct != null ? pct(kpi.cogsPct) : "—"}
                </p>
                {kpi.cogsDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.cogsDollars)}</p>}
                {cogsInterpretation && <p style={captionStyle}>{cogsInterpretation}</p>}
              </div>

              {/* Net profit */}
              <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>Net Profit</p>
                <p style={{ fontFamily: SERIF, fontSize: "2.2rem", fontWeight: 400, lineHeight: 1, color: kpi.netProfitPct == null ? "#12120F" : kpi.netProfitPct >= 6 ? "#12120F" : "#C0392B" }}>
                  {kpi.netProfitPct != null ? pct(kpi.netProfitPct) : "—"}
                </p>
                {kpi.netProfitDollars != null && <p style={{ fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 6 }}>{usd(kpi.netProfitDollars)}</p>}
                {netProfitInterpretation && <p style={captionStyle}>{netProfitInterpretation}</p>}
              </div>
            </div>

            {/* Deep-dive link */}
            <div className="text-right" style={{ marginTop: 12 }}>
              <Link
                href={`/${clientId}/${propertyId}/financial`}
                className="hover:text-[#D4AF7A]"
                style={{ fontFamily: JOST, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#B8935A", textDecoration: "none", transition: "color 0.25s ease" }}
              >
                Full financial review →
              </Link>
            </div>
          </section>
        )}

        {/* Guest experience */}
        {guestCards.length > 0 && (
          <section style={{ marginBottom: SECTION_GAP }}>
            <SectionHeader title="Guest Experience" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {guestCards.map(({ label, metric }) => (
                <div key={label} style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "24px 28px" }}>
                  <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>
                    {label}
                  </p>
                  <p style={{ fontFamily: SERIF, fontSize: metric.isRange ? "1.8rem" : "2.2rem", fontWeight: 400, lineHeight: 1, color: "#12120F" }}>
                    {metric.display}
                    {!metric.isRange && <span style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.3)", fontWeight: 300 }}> / 100</span>}
                  </p>
                  {metric.isRange && (
                    <p style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>
                      Range across {`${label.toLowerCase()}`} sources this period
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Watch item — same underlying "Biggest Risk" data, client-facing label softened */}
        {biggestRisk && (
          <section style={{ marginBottom: hasUploadHistory ? SECTION_GAP : 0 }}>
            <SectionHeader title="Watch Item" />
            <CalloutBlock>
              <p>{biggestRisk.title}</p>
              {biggestRisk.mitigationPlan && (
                <p style={{ marginTop: 8, opacity: 0.8 }}>{biggestRisk.mitigationPlan}</p>
              )}
            </CalloutBlock>
          </section>
        )}

        {/* What happens next — only Pending Uploads has real data behind it today;
            Next Scheduled Review and Last Client Action are omitted, see notes below */}
        {hasUploadHistory && (
          <section>
            <SectionHeader title="What Happens Next" />
            <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "22px 26px" }}>
              <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 10 }}>
                Pending Uploads
              </p>
              {pendingUploadTypes.length > 0 ? (
                <ul className="space-y-1.5">
                  {pendingUploadTypes.map((t) => (
                    <li key={t} style={{ fontFamily: JOST, fontSize: 13, color: "#12120F" }}>
                      {t} · Not yet received
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontFamily: JOST, fontSize: 13, color: "rgba(18,18,15,0.55)" }}>
                  All expected files received for the current period
                </p>
              )}
            </div>
          </section>
        )}

      </div>
    </PageWrapper>
  );
}
