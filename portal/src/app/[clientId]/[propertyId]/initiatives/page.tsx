import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProperty, getInitiatives, getActions, getLastUpdated } from "@/lib/notion-queries";
import { daysBetweenIso, sortActions } from "@/lib/format";
import NavBar from "@/components/NavBar";
import PageWrapper from "@/components/PageWrapper";
import PropertyHeader from "@/components/PropertyHeader";
import PropertyTabs from "@/components/PropertyTabs";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import InitiativeProgress from "@/components/InitiativeProgress";
import type { Initiative, Action } from "@/types/portal";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";

// Reused from the a22627d KPI fix: completion state is derived from an
// Initiative's client-visible Actions, since its own Notion Status never
// rolls up. Not changed here.
type InitiativeState = "not-started" | "in-progress" | "complete";

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

// ─── Per-Initiative view model ────────────────────────────────────────────────

interface InitiativeView {
  initiative: Initiative;
  visibleActions: Action[];
  state: InitiativeState;
  isBlocked: boolean;
  isBehind: boolean;
  behindReason: "target" | "actions" | null;
  daysPastTarget: number;
  overdueActionCount: number;
  topOpenAction: Action | null;
  completed: number;
  total: number;
  pct: number;
}

function buildView(initiative: Initiative, actions: Action[], todayIso: string): InitiativeView {
  const visible = visibleActionsFor(initiative, actions);
  const state = deriveState(visible);
  const isBlocked = initiative.status === "Blocked";

  const openActions = visible.filter((a) => a.status !== "Complete");
  const overdueActions = openActions.filter((a) => a.dueDateIso != null && a.dueDateIso < todayIso);
  const targetOverdue =
    initiative.targetCompletion != null &&
    initiative.targetCompletion < todayIso &&
    state !== "complete";

  const isBehind = !isBlocked && state !== "complete" && (targetOverdue || overdueActions.length > 0);
  const behindReason: "target" | "actions" | null = !isBehind
    ? null
    : targetOverdue
      ? "target"
      : "actions";

  const completed = visible.filter((a) => a.status === "Complete").length;
  const total = visible.length;

  return {
    initiative,
    visibleActions: visible,
    state,
    isBlocked,
    isBehind,
    behindReason,
    daysPastTarget: targetOverdue ? daysBetweenIso(initiative.targetCompletion, todayIso) : 0,
    overdueActionCount: overdueActions.length,
    topOpenAction: sortActions(openActions)[0] ?? null,
    completed,
    total,
    pct: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// Behind-schedule first, then in progress, not yet underway, complete last.
// Blocked sits at the very top as the most urgent situation.
function urgencyRank(v: InitiativeView): number {
  if (v.isBlocked) return 0;
  if (v.isBehind) return 1;
  if (v.state === "in-progress") return 2;
  if (v.state === "not-started") return 3;
  return 4;
}

function orderByUrgency(views: InitiativeView[]): InitiativeView[] {
  return [...views].sort(
    (a, b) =>
      urgencyRank(a) - urgencyRank(b) ||
      b.pct - a.pct ||
      a.initiative.title.localeCompare(b.initiative.title),
  );
}

// ─── Headline ────────────────────────────────────────────────────────────────

function buildHeadline(views: InitiativeView[]): { line: string; subline: string } {
  const y = views.length;
  const onTrack = views.filter((v) => !v.isBlocked && !v.isBehind).length;
  const line = `${onTrack} of ${y} initiative${y === 1 ? "" : "s"} on track`;

  const problems = views
    .filter((v) => v.isBlocked || v.isBehind)
    .sort(
      (a, b) =>
        urgencyRank(a) - urgencyRank(b) ||
        b.daysPastTarget - a.daysPastTarget ||
        b.overdueActionCount - a.overdueActionCount,
    );

  let subline: string;
  if (problems.length > 0) {
    const p = problems[0];
    const others = problems.length - 1;
    const tail = others > 0 ? `, ${others} more need attention` : "";
    if (p.isBlocked) {
      subline = `${p.initiative.title} is blocked${tail}`;
    } else if (p.behindReason === "target") {
      const d = p.daysPastTarget;
      subline = `${p.initiative.title} is ${d} day${d === 1 ? "" : "s"} past target${tail}`;
    } else {
      const n = p.overdueActionCount;
      subline = `${p.initiative.title} has ${n} overdue action${n === 1 ? "" : "s"}${tail}`;
    }
  } else if (y > 0 && views.every((v) => v.state === "complete")) {
    subline = "Every initiative is complete this cycle";
  } else {
    const active = views.filter((v) => v.state === "in-progress");
    if (active.length > 0) {
      const trailing = [...active].sort((a, b) => a.pct - b.pct)[0];
      subline = `${trailing.initiative.title} has the most ground to cover at ${trailing.pct}%`;
    } else {
      subline = "No initiative has started yet";
    }
  }

  return { line, subline };
}

function Headline({ line, subline }: { line: string; subline: string }) {
  return (
    <div>
      <p style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 400, color: "#12120F", lineHeight: 1.15 }}>
        {line}
      </p>
      <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.55)", marginTop: 6, lineHeight: 1.5 }}>
        {subline}
      </p>
    </div>
  );
}

// ─── Status indicator ────────────────────────────────────────────────────────
// Square, zero-radius, four states only. Blocked and behind schedule are
// different concepts sharing the one available attention color: Blocked is
// a filled red square, behind schedule is a red outline. Blocked wins when
// an Initiative is both.

function StatusDot({ view }: { view: InitiativeView }) {
  const base = { width: 9, height: 9, flexShrink: 0, marginTop: 5 } as const;
  if (view.isBlocked) return <span style={{ ...base, background: "#C0392B" }} />;
  if (view.isBehind) return <span style={{ ...base, border: "1.5px solid #C0392B" }} />;
  const bg =
    view.state === "complete"
      ? "#16A34A"
      : view.state === "in-progress"
        ? "#B8935A"
        : "rgba(18,18,15,0.25)";
  return <span style={{ ...base, background: bg }} />;
}

const STATE_LABEL: Record<InitiativeState, string> = {
  "not-started": "Not yet underway",
  "in-progress": "In progress",
  "complete": "Complete",
};

function statusLabel(view: InitiativeView): string {
  if (view.isBlocked) return "Blocked";
  if (view.isBehind) return "Behind schedule";
  return STATE_LABEL[view.state];
}

function statusVariant(view: InitiativeView): "gray" | "amber" | "green" | "red" {
  if (view.isBlocked || view.isBehind) return "red";
  if (view.state === "complete") return "green";
  if (view.state === "in-progress") return "amber";
  return "gray";
}

// ─── Initiative card ─────────────────────────────────────────────────────────

function InitiativeCard({ view, todayIso }: { view: InitiativeView; todayIso: string }) {
  const i = view.initiative;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(18,18,15,0.08)",
        borderRadius: 0,
        padding: 20,
      }}
      className="space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <p style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 400, color: "#12120F", lineHeight: 1.25 }} className="flex-1">
          {i.title}
        </p>
        <StatusDot view={view} />
      </div>

      <div>
        <StatusBadge label={statusLabel(view)} variant={statusVariant(view)} />
      </div>

      {view.topOpenAction && (
        <p style={{ fontFamily: JOST, fontSize: 12, color: "rgba(18,18,15,0.6)", lineHeight: 1.5 }}>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(18,18,15,0.35)", marginRight: 8 }}>
            Focus
          </span>
          {view.topOpenAction.title}
        </p>
      )}

      <InitiativeProgress actions={view.visibleActions} todayIso={todayIso} />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

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

  const liveViews = orderByUrgency(
    initiatives.filter((i) => i.status !== "Archived").map((i) => buildView(i, actions, todayIso)),
  );
  const archivedViews = initiatives
    .filter((i) => i.status === "Archived")
    .map((i) => buildView(i, actions, todayIso));

  const headline = buildHeadline(liveViews);

  return (
    <PageWrapper noTopPadding>
      <NavBar session={session} transparentAtTop />
      <PropertyHeader property={property} lastUpdated={lastUpdated} />
      <PropertyTabs clientId={clientId} propertyId={propertyId} active="initiatives" />

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "48px 60px 80px" }} className="space-y-8">

        {liveViews.length > 0 && <Headline line={headline.line} subline={headline.subline} />}

        {initiatives.length > 0 ? (
          <div className="space-y-4">
            {liveViews.map((v) => (
              <InitiativeCard key={v.initiative.id} view={v} todayIso={todayIso} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No initiatives yet"
            body="Initiatives appear here once added and reviewed by LPP."
          />
        )}

        {archivedViews.length > 0 && (
          <details className="group bg-white rounded-none border border-[rgba(18,18,15,0.08)] overflow-hidden">
            <summary className="list-none [&::-webkit-details-marker]:hidden px-5 py-3.5 cursor-pointer text-sm font-medium text-gray-500 flex items-center justify-between select-none hover:bg-gray-50 transition">
              <span>Archived ({archivedViews.length})</span>
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
                className="text-gray-400 transition-transform duration-200 group-open:rotate-90"
              >
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="p-4 border-t border-gray-50 space-y-4">
              {archivedViews.map((v) => (
                <InitiativeCard key={v.initiative.id} view={v} todayIso={todayIso} />
              ))}
            </div>
          </details>
        )}

      </div>
    </PageWrapper>
  );
}
