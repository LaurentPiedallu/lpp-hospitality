"use client";

import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { JOST, GOLD, PRIORITY_VARIANT, formatDueDate, sortActions, Checkbox } from "@/components/InitiativeProgress";
import type { Action, Initiative } from "@/types/portal";

const SERIF = "'Cormorant Garamond', Georgia, serif";

export default function InitiativeSummaryCard({
  initiative,
  actions: initialActions,
  clientId,
  propertyId,
}: {
  initiative: Initiative;
  actions: Action[]; // ALL actions linked to this initiative (unfiltered) — keeps the bar's math
  // identical to Notion's Completion % rollup even though the list below only
  // shows a Client-Visible, still-open subset.
  clientId: string;
  propertyId: string;
}) {
  const [actionsState, setActionsState] = useState(initialActions);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorId, setErrorId] = useState<string | null>(null);

  const total = actionsState.length;
  const completed = actionsState.filter((a) => a.status === "Complete").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const visibleOpen = sortActions(actionsState.filter((a) => a.clientVisible && a.status !== "Complete"));

  // No empty-card clutter — an Initiative with nothing left for the client to
  // act on just doesn't render here.
  if (visibleOpen.length === 0) return null;

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
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,18,15,0.08)", borderRadius: 0, padding: "20px 24px", marginBottom: 12 }}>
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 400, color: "#12120F" }}>{initiative.title}</h3>
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
        <span style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.5)", flexShrink: 0 }}>{pct}%</span>
      </div>

      <div style={{ height: 3, background: "rgba(18,18,15,0.08)", borderRadius: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: GOLD, borderRadius: 0, transition: "width 0.25s ease" }} />
      </div>

      <div>
        {visibleOpen.map((action) => (
          <div
            key={action.id}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(18,18,15,0.06)" }}
          >
            <Checkbox checked={false} disabled={pendingIds.has(action.id)} onChange={() => toggle(action)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: JOST, fontSize: 12, color: "#12120F" }}>{action.title}</p>
              <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 6 }}>
                <StatusBadge label={action.priority} variant={PRIORITY_VARIANT[action.priority]} />
                {action.dueDateIso && <StatusBadge label={formatDueDate(action.dueDateIso)} variant="gray" />}
              </div>
              {errorId === action.id && (
                <p style={{ fontFamily: JOST, fontSize: 11, color: "#C0392B", marginTop: 4 }}>Couldn&apos;t save · try again</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
