import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getInitiatives, getLatestKpiSummary } from "@/lib/notion-queries";
import { usd } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import type { Initiative, InitiativeStatus, InitiativeColumn } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

// ─── Status styling ───────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<InitiativeStatus, "green" | "amber" | "red" | "gray" | "blue"> = {
  "Not Started": "gray",
  "In Progress": "blue",
  "Blocked":     "red",
  "Complete":    "green",
  "Measured":    "green",
  "Archived":    "gray",
};

const STATUS_DOT: Record<InitiativeStatus, string> = {
  "Not Started": "bg-gray-300",
  "In Progress": "bg-blue-400",
  "Blocked":     "bg-red-400",
  "Complete":    "bg-green-400",
  "Measured":    "bg-green-500",
  "Archived":    "bg-gray-200",
};

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { id: InitiativeColumn; label: string; description: string }[] = [
  { id: "Now",   label: "Now",   description: "Active this period" },
  { id: "Next",  label: "Next",  description: "Queued for next period" },
  { id: "Later", label: "Later", description: "Backlog" },
];

// ─── Initiative card ──────────────────────────────────────────────────────────

function InitiativeCard({ initiative: i }: { initiative: Initiative }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: 16 }} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontFamily: JOST, fontSize: 13, color: "#12120F", lineHeight: 1.4 }} className="flex-1">{i.title}</p>
        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[i.status]}`} />
      </div>

      {i.category && (
        <span style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.45)", background: "rgba(18,18,15,0.04)", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "2px 8px", display: "inline-block" }}>
          {i.category}
        </span>
      )}

      {i.nextMilestone && (
        <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.5)", lineHeight: 1.5, borderLeft: "2px solid rgba(18,18,15,0.08)", paddingLeft: 8 }}>
          {i.nextMilestone}
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <StatusBadge label={i.status} variant={STATUS_VARIANT[i.status]} />
        {i.expectedImpact > 0 && (
          <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>
            {usd(i.expectedImpact)}<span style={{ color: "rgba(18,18,15,0.3)" }}>/yr</span>
          </span>
        )}
      </div>

      {(i.operationalOwner || i.financialOwner) && (
        <div style={{ paddingTop: 8, borderTop: "1px solid rgba(18,18,15,0.06)", display: "flex", gap: 16, fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)" }}>
          {i.operationalOwner && (
            <span>Ops: <span style={{ color: "rgba(18,18,15,0.6)" }}>{i.operationalOwner}</span></span>
          )}
          {i.financialOwner && (
            <span>Finance: <span style={{ color: "rgba(18,18,15,0.6)" }}>{i.financialOwner}</span></span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  initiatives,
}: {
  column: typeof COLUMNS[number];
  initiatives: Initiative[];
}) {
  const active = initiatives.filter((i) => i.status !== "Archived");
  const totalImpact = active.reduce((sum, i) => sum + (i.expectedImpact ?? 0), 0);

  return (
    <div style={{ background: "rgba(18,18,15,0.02)", border: "1px solid rgba(18,18,15,0.08)", borderTop: "3px solid #B8935A", borderRadius: 0, minHeight: "20rem" }} className="flex flex-col">
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(18,18,15,0.08)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 400, color: "#12120F" }}>{column.label}</h3>
            <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 2 }}>{column.description}</p>
          </div>
          <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.5)", background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "2px 8px" }}>
            {active.length}
          </span>
        </div>
        {totalImpact > 0 && (
          <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.4)", marginTop: 8 }}>
            Est. impact: <span style={{ color: "rgba(18,18,15,0.7)" }}>{usd(totalImpact)}/yr</span>
          </p>
        )}
      </div>

      <div className="p-3 flex flex-col gap-3 flex-1">
        {active.length === 0 ? (
          <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.3)", textAlign: "center", marginTop: 32, fontStyle: "italic" }}>No initiatives</p>
        ) : (
          active.map((i) => <InitiativeCard key={i.id} initiative={i} />)
        )}
      </div>
    </div>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ initiatives }: { initiatives: Initiative[] }) {
  const active      = initiatives.filter((i) => i.status === "In Progress").length;
  const blocked     = initiatives.filter((i) => i.status === "Blocked").length;
  const complete    = initiatives.filter((i) => i.status === "Complete" || i.status === "Measured").length;
  const total       = initiatives.filter((i) => i.status !== "Archived").length;
  const totalImpact = initiatives.reduce((sum, i) => sum + (i.expectedImpact ?? 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label: "Total",       value: String(total),                                sub: "initiatives" },
        { label: "In Progress", value: String(active),                               sub: "active now" },
        { label: "Blocked",     value: String(blocked),                              sub: blocked > 0 ? "needs attention" : "none blocked" },
        { label: "Complete",    value: String(complete),                             sub: "this cycle" },
        { label: "Est. Impact", value: totalImpact > 0 ? usd(totalImpact) : "—",   sub: "annual" },
      ].map(({ label, value, sub }) => (
        <div key={label} style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "20px 24px" }}>
          <p style={{ fontFamily: JOST, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginBottom: 8 }}>{label}</p>
          <p style={{ fontFamily: SERIF, fontSize: "1.9rem", fontWeight: 400, color: "#12120F", lineHeight: 1 }}>{value}</p>
          <p style={{ fontSize: 10, color: "rgba(18,18,15,0.35)", marginTop: 4 }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InitiativesPage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { clientId, propertyId } = await params;
  if (session.role !== "admin" && session.clientId !== clientId) redirect("/dashboard");

  const [property, initiatives, kpi] = await Promise.all([
    getProperty(propertyId, clientId),
    getInitiatives(propertyId),
    getLatestKpiSummary(propertyId),
  ]);

  if (!property) notFound();

  const byColumn = (col: InitiativeColumn) => initiatives.filter((i) => i.column === col);
  const archived = initiatives.filter((i) => i.status === "Archived");

  return (
    <PageWrapper>
      <NavBar session={session} />
      <PropertyHeader property={property} kpi={kpi} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="initiatives" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-8">

        {initiatives.length > 0 && <SummaryStrip initiatives={initiatives} />}

        {initiatives.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col.id} column={col} initiatives={byColumn(col.id)} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No initiatives yet"
            body="Initiatives appear here once added and reviewed by LPP."
          />
        )}

        {archived.length > 0 && (
          <details className="bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
            <summary className="px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-500 flex items-center justify-between select-none hover:bg-gray-50 transition">
              <span>Archived ({archived.length})</span>
              <span className="text-gray-400 text-xs">▼</span>
            </summary>
            <div className="p-4 border-t border-gray-50 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {archived.map((i) => <InitiativeCard key={i.id} initiative={i} />)}
            </div>
          </details>
        )}

      </div>
    </PageWrapper>
  );
}
