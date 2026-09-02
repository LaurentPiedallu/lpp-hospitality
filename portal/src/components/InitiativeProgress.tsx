"use client";

import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import type { Action } from "@/types/portal";

export const JOST = "'Jost', 'Inter', system-ui, sans-serif";
export const GOLD = "#B8935A";
// Status green — reuses tailwind.config.ts's "healthy" status color rather
// than a new hue. GREEN_MUTED is the completed-row text tone: clearly green,
// low-key, and still AA against white.
export const GREEN = "#16A34A";
export const GREEN_MUTED = "#3F6B45";
export const OVERDUE_RED = "#C0392B";

// Only ~8 rows render on open; longer lists collapse to the top 5 by
// priority behind a "Show all" control.
const COLLAPSE_THRESHOLD = 8;
const COLLAPSED_COUNT = 5;

// Confirmed with Laurent: reuse StatusBadge's existing palette. Priority now
// carries color: Critical / High in the action-red family, Medium in gold,
// Low neutral.
export const STATUS_VARIANT: Record<Action["status"], "green" | "amber" | "red"> = {
  "Not Started": "green",
  "In Progress": "amber",
  "Waiting on Client": "red",
  "Complete": "green",
  "Blocked": "red",
};

export const PRIORITY_VARIANT: Record<Action["priority"], "green" | "amber" | "red" | "gray"> = {
  Critical: "red",
  High: "red",
  Medium: "amber",
  Low: "gray",
};

const PRIORITY_RANK: Record<Action["priority"], number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export function formatDueDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Incomplete Actions first, completed ones sink to the bottom. Within each
// group: by priority, then by due date (undated last).
export function sortActions(actions: Action[]): Action[] {
  return [...actions].sort((a, b) => {
    const aDone = a.status === "Complete" ? 1 : 0;
    const bDone = b.status === "Complete" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;

    if (!a.dueDateIso && !b.dueDateIso) return 0;
    if (!a.dueDateIso) return 1;
    if (!b.dueDateIso) return -1;
    return a.dueDateIso.localeCompare(b.dueDateIso);
  });
}

export function Checkbox({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <label
      style={{
        display: "inline-flex",
        width: 14,
        height: 14,
        marginTop: 2,
        flexShrink: 0,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${checked ? GREEN : "rgba(18,18,15,0.3)"}`,
          borderRadius: 0,
          background: checked ? GREEN : "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6l3 3 5-6" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}

export default function InitiativeProgress({
  clientId,
  propertyId,
  actions: initialActions,
  todayIso,
}: {
  clientId: string;
  propertyId: string;
  actions: Action[];
  todayIso: string;
}) {
  const [actionsState, setActionsState] = useState(initialActions);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorId, setErrorId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (actionsState.length === 0) return null;

  const total = actionsState.length;
  const completed = actionsState.filter((a) => a.status === "Complete").length;
  const pct = Math.round((completed / total) * 100);
  const sorted = sortActions(actionsState);

  // Red progress segment: share of the whole Action set that is unchecked
  // and past its due date. Only meaningful when some Actions carry a due
  // date — skipped entirely otherwise.
  const datedCount = actionsState.filter((a) => a.dueDateIso).length;
  const overdueOpen = actionsState.filter(
    (a) => a.status !== "Complete" && a.dueDateIso != null && a.dueDateIso < todayIso
  ).length;
  const goldPct = pct;
  const overduePct = datedCount > 0 ? Math.min(100 - goldPct, Math.round((overdueOpen / total) * 100)) : 0;

  const truncating = sorted.length > COLLAPSE_THRESHOLD && !showAll;
  const visibleRows = truncating ? sorted.slice(0, COLLAPSED_COUNT) : sorted;

  async function toggle(action: Action) {
    const nextStatus: Action["status"] = action.status === "Complete" ? "Not Started" : "Complete";
    const prevStatus = action.status;

    setErrorId(null);
    setActionsState((prev) => prev.map((a) => (a.id === action.id ? { ...a, status: nextStatus } : a)));
    setPendingIds((prev) => new Set(prev).add(action.id));

    try {
      const res = await fetch("/api/actions/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, propertyId, actionId: action.id, status: nextStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      const data = (await res.json()) as { status: Action["status"] };
      // Trust the confirmed value from Notion over what we optimistically set
      setActionsState((prev) => prev.map((a) => (a.id === action.id ? { ...a, status: data.status } : a)));
    } catch {
      setActionsState((prev) => prev.map((a) => (a.id === action.id ? { ...a, status: prevStatus } : a)));
      setErrorId(action.id);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* Progress bar */}
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.4)" }}>
          {completed} of {total} complete
        </span>
        <span style={{ fontFamily: JOST, fontSize: 10, color: "rgba(18,18,15,0.5)" }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: "rgba(18,18,15,0.08)", borderRadius: 0, overflow: "hidden", display: "flex" }}>
        <div style={{ height: "100%", width: `${goldPct}%`, background: GOLD, transition: "width 0.25s ease" }} />
        {overduePct > 0 && (
          <div style={{ height: "100%", width: `${overduePct}%`, background: OVERDUE_RED, transition: "width 0.25s ease" }} />
        )}
      </div>

      {/* Expandable actions list */}
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="hover:text-[#12120F]"
          style={{
            fontFamily: JOST,
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(18,18,15,0.4)",
            cursor: "pointer",
            userSelect: "none",
            transition: "color 0.25s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: 0,
            padding: 0,
          }}
        >
          <svg
            width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
          >
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {total} action{total !== 1 ? "s" : ""}
        </button>

        {expanded && (
          <div style={{ marginTop: 10, borderTop: "1px solid rgba(18,18,15,0.08)" }}>
            {visibleRows.map((action) => {
              const isComplete = action.status === "Complete";
              const overdue = !isComplete && action.dueDateIso != null && action.dueDateIso < todayIso;
              return (
                <div
                  key={action.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(18,18,15,0.06)",
                  }}
                >
                  <Checkbox
                    checked={isComplete}
                    disabled={pendingIds.has(action.id)}
                    onChange={() => toggle(action)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontFamily: JOST,
                        fontSize: 12,
                        color: isComplete ? GREEN_MUTED : "#12120F",
                      }}
                    >
                      {action.title}
                    </p>
                    <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                      <StatusBadge label={action.status} variant={STATUS_VARIANT[action.status]} />
                      <StatusBadge label={action.priority} variant={PRIORITY_VARIANT[action.priority]} />
                    </div>
                    {errorId === action.id && (
                      <p style={{ fontFamily: JOST, fontSize: 11, color: OVERDUE_RED, marginTop: 4 }}>
                        Couldn&apos;t save · try again
                      </p>
                    )}
                  </div>
                  {action.dueDateIso && (
                    <span
                      style={{
                        fontFamily: JOST,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                        marginLeft: "auto",
                        marginTop: 1,
                        color: overdue ? OVERDUE_RED : "rgba(18,18,15,0.4)",
                      }}
                    >
                      {formatDueDate(action.dueDateIso)}
                    </span>
                  )}
                </div>
              );
            })}

            {sorted.length > COLLAPSE_THRESHOLD && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="hover:text-[#12120F]"
                style={{
                  fontFamily: JOST,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(18,18,15,0.4)",
                  cursor: "pointer",
                  background: "none",
                  border: 0,
                  padding: "10px 0 0",
                  transition: "color 0.25s ease",
                }}
              >
                {showAll ? "Show less" : `Show all ${sorted.length}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
