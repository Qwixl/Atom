import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BUSINESS_BRAND_CATEGORY, BUSINESS_POLICY_CATEGORY } from "@qwixl/owner-store";
import { BusinessContextStore } from "./businessContextStore.js";

describe("BusinessContextStore", () => {
  it("persists brand and policy records and formats prompt lines", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-business-context-"));
    const store = new BusinessContextStore(path.join(dir, "business-context.json"));
    store.upsert({
      category: BUSINESS_BRAND_CATEGORY,
      label: "Tone",
      value: "Warm, concise, community-first.",
    });
    store.upsert({
      category: BUSINESS_POLICY_CATEGORY,
      label: "House rules",
      value: "Be kind; no spam; respect privacy.",
    });
    const lines = store.brandPolicyLines();
    expect(lines.brandLines).toEqual(["Tone: Warm, concise, community-first."]);
    expect(lines.policyLines).toEqual(["House rules: Be kind; no spam; respect privacy."]);
  });
});
