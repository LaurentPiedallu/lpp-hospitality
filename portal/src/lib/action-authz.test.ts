// Run with: npm test  (node --test, no framework)
//
// Guards the client-visibility authorization gate on POST
// /api/actions/status. Now that the route performs writes on behalf of the
// client, an Action that is real and on the right property must still be
// rejected when its Client Visible flag is false.

import test from "node:test";
import assert from "node:assert/strict";
import { authorizeActionWrite } from "./action-authz.ts";
import type { Action } from "../types/portal.ts";

// Only id + clientVisible drive the gate; the rest are filled to satisfy
// the Action type at the shape the route passes in.
function action(id: string, clientVisible: boolean): Action {
  return {
    id,
    propertyId: "prop-1",
    title: `Action ${id}`,
    notes: "",
    owner: "",
    status: "Not Started",
    priority: "Medium",
    decisionRequired: false,
    dueDateIso: null,
    clientVisible,
  };
}

const actions: Action[] = [action("act-visible", true), action("act-hidden", false)];

test("rejects a valid Action on the right property when Client Visible is false", () => {
  assert.deepEqual(authorizeActionWrite(actions, "act-hidden"), {
    ok: false,
    status: 403,
    error: "Action is not client visible",
  });
});

test("allows a Client Visible Action", () => {
  const res = authorizeActionWrite(actions, "act-visible");
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.action.id, "act-visible");
});

test("404s an Action ID that is not in the property's Action set", () => {
  assert.deepEqual(authorizeActionWrite(actions, "act-unknown"), {
    ok: false,
    status: 404,
    error: "Action not found on this property",
  });
});
