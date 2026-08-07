"use client";

// Wraps native <details>/<summary> — the same disclosure mechanism already
// used elsewhere in the portal (Financial/Commercial/Initiatives/Upload's
// "Supporting detail"/"Commentary" toggles), styled to match the property
// Overview page's own typography instead of that older gray-Tailwind
// treatment. Expanded by default everywhere (identical to how these
// sections rendered before this existed), except on small viewports —
// checked once on mount against the same 768px / `md:` breakpoint already
// used throughout this page for responsive layout, not a new convention.
// Always remains user-toggleable at any viewport once rendered; only the
// *default* open/closed state is viewport-dependent.

import { useEffect, useState } from "react";

const JOST = "'Jost', 'Inter', system-ui, sans-serif";

export default function CollapsibleOnMobile({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  }, []);

  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="group">
      <summary className="flex items-center justify-between cursor-pointer select-none" style={{ listStyle: "none" }}>
        <div style={{ flex: 1 }}>{header}</div>
        <span
          className="group-open:rotate-180 transition-transform"
          style={{ fontFamily: JOST, fontSize: 11, color: "rgba(18,18,15,0.3)", flexShrink: 0, marginLeft: 12 }}
        >
          ▼
        </span>
      </summary>
      <div style={{ marginTop: 20 }}>{children}</div>
    </details>
  );
}
