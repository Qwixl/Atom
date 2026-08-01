import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hostedBusinessCommerceEnv } from "./hostedBusinessEnv.js";

describe("hostedBusinessCommerceEnv", () => {
  it("sets commerce triad for business workspaces", () => {
    assert.deepEqual(hostedBusinessCommerceEnv({ workspaceKind: "business" }), {
      ATOM_WORKSPACE_KIND: "business",
      ATOM_HOSTED: "1",
      ATOM_BUSINESS_MODE: "true",
      ATOM_COMMERCE_ELIGIBLE: "1",
    });
  });

  it("does not mark personal as commerce-eligible", () => {
    assert.deepEqual(hostedBusinessCommerceEnv({ workspaceKind: "personal" }), {
      ATOM_WORKSPACE_KIND: "personal",
      ATOM_HOSTED: "1",
    });
  });
});
