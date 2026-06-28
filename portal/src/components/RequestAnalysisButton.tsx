"use client";

import { useState } from "react";

interface Props {
  clientId: string;
  propertyId: string;
  category?: string;
  label?: string;
}

type State = "idle" | "loading" | "done" | "error";

export default function RequestAnalysisButton({
  clientId,
  propertyId,
  category,
  label = "Request fresh analysis",
}: Props) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  const trigger = async () => {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/intelligence/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, propertyId, category }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Something went wrong.");
      } else {
        setState("done");
        setMessage(data.message ?? "Analysis requested.");
      }
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  };

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <span className="text-green-500">✓</span>
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={trigger}
        disabled={state === "loading"}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 bg-white rounded-lg px-3 py-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "loading" ? (
          <>
            <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Requesting…
          </>
        ) : (
          <>
            <span className="text-gray-400">✦</span>
            {label}
          </>
        )}
      </button>
      {state === "error" && message && (
        <p className="text-xs text-red-500">{message}</p>
      )}
    </div>
  );
}
