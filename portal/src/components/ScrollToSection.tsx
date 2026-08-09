"use client";

import { useEffect } from "react";

// Deep-link landing helper (Cross-tab audit Part 4) — scrolls the target
// section into view and briefly highlights it so a link that claims to
// land "pre-filtered" actually reads as having gone somewhere specific,
// not just to the top of a generic tab. No-ops silently if targetId is
// null or doesn't match any element on the page (e.g. the linked category
// has no content this period) — deep links are best-effort, never a hard
// dependency for the destination page to render correctly without one.
export default function ScrollToSection({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Belt-and-suspenders: some browsers/automation contexts silently no-op
    // a smooth scrollIntoView triggered from an effect during initial
    // hydration (confirmed in testing against this exact page). Following
    // up with an "auto" (respects CSS scroll-behavior, effectively instant
    // here) call shortly after guarantees the landing actually happens even
    // when the smooth animation didn't run — a harmless no-op otherwise.
    const settleTimer = setTimeout(() => {
      el.scrollIntoView({ behavior: "auto", block: "start" });
    }, 400);

    const prevTransition = el.style.transition;
    const prevBoxShadow = el.style.boxShadow;
    el.style.transition = "box-shadow 0.6s ease";
    el.style.boxShadow = "0 0 0 2px #B8935A";

    const timer = setTimeout(() => {
      el.style.boxShadow = prevBoxShadow;
      setTimeout(() => {
        el.style.transition = prevTransition;
      }, 700);
    }, 1800);

    return () => {
      clearTimeout(settleTimer);
      clearTimeout(timer);
    };
  }, [targetId]);

  return null;
}
