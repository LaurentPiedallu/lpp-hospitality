"use client";

import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import type { Action } from "@/types/portal";

export const JOST = "'Jost', 'Inter', system-ui, sans-serif";
export const GOLD = "#B8935A";

// Confirmed with Laurent: 3-tone mapping reusing StatusBadge's existing palette.
// Reuse this exact mapping anywhere Action Status/Priority renders — don't
// invent a second one.
export const STATUS_VARIANT: Record<Action["status"], "green" | "amber" | "red"> = {
  "Not Started": "green",
  "In Progress": "amber",
  "Waiting on Client": "red",
  "Complete": "green",
  "Blocked": "red",
};

export const PRIORITY_VARIANT: Record<Action["priority"], "green" | "amber" | "red"> = {
  Critical: "red",
  High: "amber",
  Medium: "green",
  Low: "green",
};

const PRIORITY_RANK: Record<Action["priority"], number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export function formatDueDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function sortActions(actions: Action[]): Action[] {
  return [...actions].sort((a, b) => {
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
          border: `1px solid ${checked ? GOLD : "rgba(18,18,15,0.3)"}`,
          borderRadius: 0,
          background: checked ? GOLD : "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6l3 3 5-6" stroke="#12120F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
}: {
  clientId: string;
  propertyId: string;
  actions: Action[];
}) {
  const [actionsState, setActionsState] = useState(initialActions);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorId, setErrorId] = useState<string | null>(null);

  if (actionsState.length === 0) return null;

  const total = actionsState.length;
  const completed = actionsState.filter((a) => a.status === "Complete").length;
  const pct = Math.round((completed / total) * 100);
  const sorted = sortActions(actionsState);

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
      <div style={{ height: 3, background: "rgba(18,18,15,0.08)", borderRadius: 0, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: GOLD, borderRadius: 0, transition: "width 0.25s ease" }} />
      </div>

      {/* Expandable actions list */}
      <details style={{ marginTop: 10 }}>
        <summary
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
          }}
        >
          {total} action{total !== 1 ? "s" : ""}
        </summary>
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(18,18,15,0.08)" }}>
          {sorted.map((action) => {
            const isComplete = action.status === "Complete";
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
                      color: isComplete ? "rgba(18,18,15,0.4)" : "#12120F",
                      textDecoration: isComplete ? "line-through" : "none",
                    }}
                  >
                    {action.title}
                  </p>
                  <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                    <StatusBadge label={action.status} variant={STATUS_VARIANT[action.status]} />
                    <StatusBadge label={action.priority} variant={PRIORITY_VARIANT[action.priority]} />
                    {action.dueDateIso && <StatusBadge label={formatDueDate(action.dueDateIso)} variant="gray" />}
                    {action.owner && (
                      <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.35)" }}>{action.owner}</span>
                    )}
                  </div>
                  {errorId === action.id && (
                    <p style={{ fontFamily: JOST, fontSize: 11, color: "#C0392B", marginTop: 4 }}>
                      Couldn&apos;t save · try again
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
