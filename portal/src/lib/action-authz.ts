// Authorization gate for client-initiated Action writes (POST
// /api/actions/status).
//
// The Initiatives tab only ever renders an Initiative's Client Visible
// Actions, but the write route accepts an arbitrary Action ID in the
// request body. A request forged with a non-client-visible Action ID must
// be rejected here even when the propertyId check has already passed. This
// was a low-risk gap while the tab was read-only; it is a real
// authorization hole now that the route performs writes.

import type { Action } from "@/types/portal";

export type ActionWriteAuth =
  | { ok: true; action: Action }
  | { ok: false; status: 403 | 404; error: string };

// `actions` is the Published Action set for the target property, as
// returned by getActions (already fetched by the route). A client may only
// toggle an Action that is present in that set AND carries Client Visible.
export function authorizeActionWrite(actions: Action[], actionId: string): ActionWriteAuth {
  const action = actions.find((a) => a.id === actionId);
  if (!action) {
    return { ok: false, status: 404, error: "Action not found on this property" };
  }
  if (!action.clientVisible) {
    return { ok: false, status: 403, error: "Action is not client visible" };
  }
  return { ok: true, action };
}
