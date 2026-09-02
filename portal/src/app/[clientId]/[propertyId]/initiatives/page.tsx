import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getInitiatives, getActions, getLastUpdated } from "@/lib/notion-queries";
import { initiativeColumn } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import InitiativeProgress from "@/components/InitiativeProgress";
import type { Initiative, InitiativeColumn, Action } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

// Status green. The four portal tokens (dark / cream / gold / action-red)
// carry no success hue, so this reuses the "healthy" status color already
// defined in tailwind.config.ts rather than inventing a new one.
const GREEN = "#16A34A";

// ─── Derived Initiative state ─────────────────────────────────────────────────
// The Initiative's own Notion Status does not roll up from its Actions, so
// completion state is derived from the client-visible Actions instead.

type InitiativeState = "not-started" | "in-progress" | "complete";

// Client-visible Actions linked to this Initiative. Same per-Action Client
// Visible filter the rest of the tab uses, kept identical so every count on
// the page agrees.
function visibleActionsFor(initiative: Initiative, actions: Action[]): Action[] {
  return actions.filter((a) => initiative.actionIds.includes(a.id) && a.clientVisible);
}

function deriveState(visibleActions: Action[]): InitiativeState {
  if (visibleActions.length === 0) return "not-started";
  const done = visibleActions.filter((a) => a.status === "Complete").length;
  if (done === 0) return "not-started";
  if (done === visibleActions.length) return "complete";
  return "in-progress";
}

const STATE_DOT: Record<InitiativeState, string> = {
  "not-started": "rgba(18,18,15,0.25)",
  "in-progress": "#B8935A",
  "complete":    GREEN,
};

const STATE_LABEL: Record<InitiativeState, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  "complete":    "Complete",
};

const STATE_BADGE: Record<InitiativeState, "gray" | "amber" | "green"> = {
  "not-started": "gray",
  "in-progress": "amber",
  "complete":    "green",
};

// Fixed hue per Initiative Category, rendered as a left-edge bar on the
// card so the category badge text can go away without losing the signal.
const CATEGORY_HUE: Record<string, string> = {
  Commercial: "#B8935A",
  Finance:    "#3E5C76",
  Execution:  "#A6572F",
  Guest:      "#5C7355",
  Labor:      "#7A6C8A",
};
const CATEGORY_HUE_FALLBACK = "rgba(18,18,15,0.25)";

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { id: InitiativeColumn; label: string; description: string }[] = [
  { id: "Now",   label: "Now",   description: "This quarter or overdue" },
  { id: "Next",  label: "Next",  description: "Next quarter" },
  { id: "Later", label: "Later", description: "Beyond next quarter" },
];

// ─── Initiative card ──────────────────────────────────────────────────────────

function InitiativeCard({
  initiative: i,
  actions,
  clientId,
  propertyId,
  todayIso,
}: {
  initiative: Initiative;
  actions: Action[];
  clientId: string;
  propertyId: string;
  todayIso: string;
}) {
  const linkedActions = visibleActionsFor(i, actions);
  const isBlocked = i.status === "Blocked";
  const state = deriveState(linkedActions);
  const dotColor = isBlocked ? "#C0392B" : STATE_DOT[state];
  const badgeLabel = isBlocked ? "Blocked" : STATE_LABEL[state];
  const badgeVariant: "gray" | "amber" | "green" | "red" = isBlocked ? "red" : STATE_BADGE[state];
  const hue = CATEGORY_HUE[i.category] ?? CATEGORY_HUE_FALLBACK;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(18,18,15,0.08)",
        borderLeft: `3px solid ${hue}`,
        borderRadius: 0,
        padding: "16px 16px 16px 18px",
      }}
      className="space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 400, color: "#12120F", lineHeight: 1.3 }} className="flex-1">
          {i.title}
        </p>
        <span
          title={badgeLabel}
          className="mt-1 w-2 h-2 rounded-full shrink-0"
          style={{ background: dotColor }}
        />
      </div>

      {i.category && <span className="sr-only">Category: {i.category}</span>}

      {i.nextMilestone && (
        <p style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.5)", lineHeight: 1.5, borderLeft: "2px solid rgba(18,18,15,0.08)", paddingLeft: 8 }}>
          {i.nextMilestone}
        </p>
      )}

      <div className="pt-1">
        <StatusBadge label={badgeLabel} variant={badgeVariant} />
      </div>

      <InitiativeProgress
        clientId={clientId}
        propertyId={propertyId}
        actions={linkedActions}
        todayIso={todayIso}
      />
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  initiatives,
  actions,
  clientId,
  propertyId,
  todayIso,
}: {
  column: typeof COLUMNS[number];
  initiatives: Initiative[];
  actions: Action[];
  clientId: string;
  propertyId: string;
  todayIso: string;
}) {
  const active = initiatives.filter((i) => i.status !== "Archived");

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
      </div>

      <div className="p-3 flex flex-col gap-3 flex-1">
        {active.length === 0 ? (
          <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.3)", textAlign: "center", marginTop: 32, fontStyle: "italic" }}>No initiatives</p>
        ) : (
          active.map((i) => (
            <InitiativeCard key={i.id} initiative={i} actions={actions} clientId={clientId} propertyId={propertyId} todayIso={todayIso} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ initiatives, actions }: { initiatives: Initiative[]; actions: Action[] }) {
  const live = initiatives.filter((i) => i.status !== "Archived");
  const states = live.map((i) => deriveState(visibleActionsFor(i, actions)));

  const total      = live.length;
  const inProgress = states.filter((s) => s === "in-progress").length;
  const complete   = states.filter((s) => s === "complete").length;

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Total",       value: String(total),      sub: "initiatives" },
        { label: "In Progress", value: String(inProgress), sub: "underway" },
        { label: "Complete",    value: String(complete),   sub: "this cycle" },
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

  const [property, initiatives, actions, lastUpdated] = await Promise.all([
    getProperty(propertyId, clientId),
    getInitiatives(propertyId),
    getActions(propertyId),
    getLastUpdated(propertyId, clientId),
  ]);

  if (!property) notFound();

  const todayIso = new Date().toISOString().slice(0, 10);

  // Recompute the Now / Next / Later bucket with the full rule now that
  // Actions are loaded: an In Progress Initiative with at least one dated
  // Action is pulled forward to Now regardless of its Target Completion.
  const columnOf = (i: Initiative): InitiativeColumn => {
    const visible = visibleActionsFor(i, actions);
    const inProgressWithDueDate =
      deriveState(visible) === "in-progress" && visible.some((a) => a.dueDateIso);
    return initiativeColumn(i.targetCompletion, inProgressWithDueDate);
  };

  const byColumn = (col: InitiativeColumn) =>
    initiatives.filter((i) => i.status !== "Archived" && columnOf(i) === col);
  const archived = initiatives.filter((i) => i.status === "Archived");

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="initiatives" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-8">

        {initiatives.length > 0 && <SummaryStrip initiatives={initiatives} actions={actions} />}

        {initiatives.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                initiatives={byColumn(col.id)}
                actions={actions}
                clientId={clientId}
                propertyId={propertyId}
                todayIso={todayIso}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No initiatives yet"
            body="Initiatives appear here once added and reviewed by LPP."
          />
        )}

        {archived.length > 0 && (
          <details className="group bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
            <summary className="list-none [&::-webkit-details-marker]:hidden px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-500 flex items-center justify-between select-none hover:bg-gray-50 transition">
              <span>Archived ({archived.length})</span>
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
                className="text-gray-400 transition-transform duration-200 group-open:rotate-90"
              >
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="p-4 border-t border-gray-50 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {archived.map((i) => (
                <InitiativeCard key={i.id} initiative={i} actions={actions} clientId={clientId} propertyId={propertyId} todayIso={todayIso} />
              ))}
            </div>
          </details>
        )}

      </div>
    </PageWrapper>
  );
}
