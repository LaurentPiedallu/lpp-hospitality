"use client";

import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { sortActions, formatShortDate } from "@/lib/format";
import type { Action } from "@/types/portal";

export const JOST = "'Jost', 'Inter', system-ui, sans-serif";
export const GOLD = "#B8935A";
export const GREEN = "#16A34A";
export const OVERDUE_RED = "#C0392B";

// Reported progress, so the nested list stays short by default: first few
// rows plus a "Show all" control.
const COLLAPSED_COUNT = 3;

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

// Non-interactive status marker. These rows report progress, they are not
// client to-dos, so there is nothing to toggle.
function ActionGlyph({ status }: { status: Action["status"] }) {
  if (status === "Complete") {
    return (
      <span style={{ display: "inline-flex", width: 14, height: 14, marginTop: 2, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6l3 3 5-6" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  const color =
    status === "Blocked" || status === "Waiting on Client"
      ? OVERDUE_RED
      : status === "In Progress"
        ? GOLD
        : "rgba(18,18,15,0.25)";
  return (
    <span style={{ display: "inline-flex", width: 14, height: 14, marginTop: 2, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: 7, height: 7, background: color }} />
    </span>
  );
}

export default function InitiativeProgress({
  actions,
  todayIso,
}: {
  actions: Action[];
  todayIso: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (actions.length === 0) return null;

  const total = actions.length;
  const completed = actions.filter((a) => a.status === "Complete").length;
  const pct = Math.round((completed / total) * 100);
  const sorted = sortActions(actions);

  // Red progress segment: share of the whole Action set that is unchecked
  // and past its due date. Only shown when some Actions carry a due date.
  const datedCount = actions.filter((a) => a.dueDateIso).length;
  const overdueOpen = actions.filter(
    (a) => a.status !== "Complete" && a.dueDateIso != null && a.dueDateIso < todayIso,
  ).length;
  const goldPct = pct;
  const overduePct = datedCount > 0 ? Math.min(100 - goldPct, Math.round((overdueOpen / total) * 100)) : 0;

  const truncating = sorted.length > COLLAPSED_COUNT && !showAll;
  const visibleRows = truncating ? sorted.slice(0, COLLAPSED_COUNT) : sorted;

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
                  <ActionGlyph status={action.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontFamily: JOST,
                        fontSize: 12,
                        color: isComplete ? "rgba(18,18,15,0.4)" : "#12120F",
                      }}
                    >
                      {action.title}
                    </p>
                    <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                      <StatusBadge label={action.status} variant={STATUS_VARIANT[action.status]} />
                      <StatusBadge label={action.priority} variant={PRIORITY_VARIANT[action.priority]} />
                    </div>
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
                      {formatShortDate(action.dueDateIso)}
                    </span>
                  )}
                </div>
              );
            })}

            {sorted.length > COLLAPSED_COUNT && (
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
