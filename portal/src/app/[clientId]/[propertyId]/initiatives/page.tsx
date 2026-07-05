import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getInitiatives } from "@/lib/notion-queries";
import { usd, formatPeriod } from "@/lib/format";
import NavBar from "@/components/NavBar";
import SubPageHeader from "@/components/SubPageHeader";
import StatusBadge from "@/components/StatusBadge";
import type { Initiative, InitiativeStatus, InitiativeColumn } from "@/types/portal";

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

const COLUMNS: { id: InitiativeColumn; label: string; description: string; accentBorder: string }[] = [
  { id: "Now",   label: "Now",  description: "Active this period",      accentBorder: "border-t-blue-500" },
  { id: "Next",  label: "Next", description: "Queued for next period",  accentBorder: "border-t-amber-400" },
  { id: "Later", label: "Later", description: "Backlog",                accentBorder: "border-t-gray-300" },
];

// ─── Initiative card ──────────────────────────────────────────────────────────

function InitiativeCard({ initiative: i }: { initiative: Initiative }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 leading-snug flex-1">{i.title}</p>
        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[i.status]}`} />
      </div>

      {i.category && (
        <span className="inline-block text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-2 py-0.5">
          {i.category}
        </span>
      )}

      {i.nextMilestone && (
        <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-gray-100 pl-2">
          {i.nextMilestone}
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <StatusBadge label={i.status} variant={STATUS_VARIANT[i.status]} />
        {i.expectedImpact > 0 && (
          <span className="text-xs text-gray-400">
            {usd(i.expectedImpact)}<span className="text-gray-300">/yr</span>
          </span>
        )}
      </div>

      {(i.operationalOwner || i.financialOwner) && (
        <div className="pt-1 border-t border-gray-50 flex gap-4 text-xs text-gray-400">
          {i.operationalOwner && (
            <span>Ops: <span className="text-gray-600">{i.operationalOwner}</span></span>
          )}
          {i.financialOwner && (
            <span>Finance: <span className="text-gray-600">{i.financialOwner}</span></span>
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
    <div className={`flex flex-col rounded-2xl border border-gray-100 border-t-4 ${column.accentBorder} bg-gray-50/50 min-h-[20rem]`}>
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{column.label}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{column.description}</p>
          </div>
          <span className="text-xs font-medium text-gray-500 bg-white border border-gray-100 rounded-full px-2 py-0.5">
            {active.length}
          </span>
        </div>
        {totalImpact > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Est. impact: <span className="font-medium text-gray-700">{usd(totalImpact)}/yr</span>
          </p>
        )}
      </div>

      <div className="p-3 flex flex-col gap-3 flex-1">
        {active.length === 0 ? (
          <p className="text-xs text-gray-300 text-center mt-8 italic">No initiatives</p>
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
        <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">{label}</p>
          <p className="text-xl font-semibold text-gray-900">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
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

  const [property, initiatives] = await Promise.all([
    getProperty(propertyId, clientId),
    getInitiatives(propertyId),
  ]);

  if (!property) notFound();

  const byColumn = (col: InitiativeColumn) => initiatives.filter((i) => i.column === col);
  const archived = initiatives.filter((i) => i.status === "Archived");

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar session={session} clientId={clientId} propertyId={propertyId} />
      <SubPageHeader
        title="Initiatives"
        property={property}
        period={formatPeriod(null)}
        clientId={clientId}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {initiatives.length > 0 && <SummaryStrip initiatives={initiatives} />}

        {initiatives.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col.id} column={col} initiatives={byColumn(col.id)} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <p className="text-sm text-gray-400">No initiatives published for this property yet.</p>
            <p className="text-xs text-gray-300 mt-1">Initiatives appear here once added and reviewed by LPP.</p>
          </div>
        )}

        {archived.length > 0 && (
          <details className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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
    </div>
  );
}
