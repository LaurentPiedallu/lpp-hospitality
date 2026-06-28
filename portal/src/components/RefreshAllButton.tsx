"use client";

import { useState } from "react";
import { ANALYSIS_CATEGORIES } from "@/lib/analysis-config";

interface Props {
  clientId: string;
  propertyId: string;
}

type State = "idle" | "running" | "done" | "partial" | "error";

export default function RefreshAllButton({ clientId, propertyId }: Props) {
  const [state, setState] = useState<State>("idle");
  const [succeeded, setSucceeded] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const total = ANALYSIS_CATEGORIES.length;

  const requestAll = async () => {
    setState("running");
    setSucceeded(0);
    setErrorMsg("");

    const results = await Promise.allSettled(
      ANALYSIS_CATEGORIES.map(({ id }) =>
        fetch("/api/intelligence/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, propertyId, category: id }),
        }).then(async (r) => {
          if (!r.ok) {
            const d = await r.json().catch(() => ({})) as { error?: string };
            throw new Error(d.error ?? `HTTP ${r.status}`);
          }
          return "ok";
        })
      )
    );

    const ok = results.filter((r) => r.status === "fulfilled").length;
    setSucceeded(ok);

    if (ok === total) {
      setState("done");
    } else if (ok > 0) {
      setState("partial");
      const firstErr = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      setErrorMsg(firstErr?.reason?.message ?? "Some categories failed");
    } else {
      setState("error");
      const firstErr = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      setErrorMsg(firstErr?.reason?.message ?? "All requests failed");
    }
  };

  if (state === "done" || state === "partial") {
    return (
      <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
        state === "done"
          ? "text-green-700 bg-green-50 border border-green-200"
          : "text-amber-700 bg-amber-50 border border-amber-200"
      }`}>
        <span>{state === "done" ? "✓" : "⚠"}</span>
        <span>
          {succeeded}/{total} analyses queued.{" "}
          {state === "done"
            ? "Results appear within a few minutes."
            : errorMsg}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={requestAll}
        disabled={state === "running"}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "running" ? (
          <>
            <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Requesting all {total} categories…
          </>
        ) : (
          <>
            <span className="text-gray-400">✦</span>
            Refresh all categories
          </>
        )}
      </button>
      {state === "error" && (
        <p className="text-xs text-red-500">{errorMsg}</p>
      )}
    </div>
  );
}
