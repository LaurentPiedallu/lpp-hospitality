import { redirect } from "next/navigation";

// Intelligence tab removed (nav item dropped in PropertyTabs.tsx). Every
// Published/Client-Visible Intelligence record for the current period now
// has a native home on Commercial or Financial Review — see the
// findAllIntelligence multi-record fix and the Commentary/LPP Perspective
// toggle restoration on those two pages (same session). Redirecting rather
// than letting the old URL 404 for anyone with it bookmarked or linked.
//
// The underlying Intelligence data and lookup/cross-link logic
// (getIntelligence, findAllIntelligence, findIntelligenceByFinding,
// resolveIntelCrossLink, INTEL_CATEGORY_TAB, etc. in lib/notion-queries.ts
// and lib/deep-links.ts) is untouched — this is a navigation/route change
// only, nothing here reads or writes Intelligence records.
//
// Not addressed by this redirect: the old tab's own summary tile (13 total
// / Healthy / Monitor / Action Needed counts) has no replacement anywhere
// else in the portal — flagged as an explicit, known consequence of this
// removal, not silently dropped.
export default async function IntelligencePage({
  params,
}: {
  params: Promise<{ clientId: string; propertyId: string }>;
}) {
  const { clientId, propertyId } = await params;
  redirect(`/${clientId}/${propertyId}`);
}
