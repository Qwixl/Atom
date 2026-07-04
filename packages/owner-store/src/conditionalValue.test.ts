import { describe, expect, it } from "vitest";
import { OwnerStore } from "./OwnerStore.js";
import {
  formatConditionalValue,
  hasTagContextConflict,
  resolveRecordValue,
} from "./conditionalValue.js";

describe("conditionalValue", () => {
  it("resolves the most specific matching branch", () => {
    const record = {
      value: "premium-economy",
      conditions: [
        { contextTags: ["short-haul"], value: "economy" },
        { contextTags: ["short-haul", "with-kids"], value: "economy-plus" },
      ],
    };
    expect(resolveRecordValue(record, [])).toBe("premium-economy");
    expect(resolveRecordValue(record, ["short-haul"])).toBe("economy");
    expect(resolveRecordValue(record, ["short-haul", "with-kids"])).toBe("economy-plus");
  });

  it("detects tag context conflict for diverging values", () => {
    const store = new OwnerStore();
    store.upsert({
      category: "preferences",
      label: "Cabin",
      value: "premium-economy",
      guarded: false,
    });
    const record = store.list()[0]!;
    store.appendEvidence(record.id, "confirmed", "usual choice", ["business-trip"]);
    store.appendEvidence(record.id, "overridden", "short hop", ["short-haul-with-kids"]);
    const updated = store.list()[0]!;
    expect(hasTagContextConflict(updated, ["short-haul-with-kids"])).toBe(false);
    expect(hasTagContextConflict(updated, ["weekend-leisure"])).toBe(true);
  });

  it("formats conditional values for profile display", () => {
    const text = formatConditionalValue({
      value: "premium-economy",
      conditions: [{ contextTags: ["short-haul"], value: "economy" }],
    });
    expect(text).toContain("default:");
    expect(text).toContain("short-haul");
  });
});

describe("OwnerStore conditional splits", () => {
  it("proposes and accepts a conditional split", () => {
    const store = new OwnerStore();
    store.upsert({
      category: "preferences",
      label: "Cabin",
      value: "premium-economy",
      guarded: false,
    });
    const proposal = store.proposeConditionalSplit({
      category: "preferences",
      label: "Cabin",
      defaultValue: "premium-economy",
      conditions: [{ contextTags: ["short-haul-with-kids"], value: "economy" }],
      reason: "Different cabin on short hops with kids",
    });
    expect(proposal?.splitConditions).toHaveLength(1);
    store.acceptProposal(proposal!.id);
    const record = store.list()[0]!;
    expect(record.conditions).toHaveLength(1);
    expect(resolveRecordValue(record, ["short-haul-with-kids"])).toBe("economy");
    expect(resolveRecordValue(record, [])).toBe("premium-economy");
  });

  it("routes tag-conflicting curator ingest to a split proposal", () => {
    const store = new OwnerStore();
    store.upsert({
      category: "preferences",
      label: "Cabin",
      value: "premium-economy",
      guarded: false,
    });
    const record = store.list()[0]!;
    store.appendEvidence(record.id, "confirmed", "usual", ["business-trip"]);
    store.appendEvidence(record.id, "overridden", "kids trip", ["short-haul-with-kids"]);
    const proposal = store.ingestCuratorProposal({
      category: "preferences",
      label: "Cabin",
      value: "economy",
      contextTags: ["short-haul-with-kids"],
      reason: "Economy on short hops with kids",
    });
    expect(proposal?.splitConditions?.length).toBe(1);
  });

  it("contextSlice resolves values for session tags", () => {
    const store = new OwnerStore();
    store.upsert({
      category: "preferences",
      label: "Cabin",
      value: "premium-economy",
      guarded: false,
    });
    const record = store.list()[0]!;
    store.applyConditions(record.id, [
      { contextTags: ["short-haul-with-kids"], value: "economy" },
    ]);
    const slice = store.contextSlice(["short-haul-with-kids"]);
    expect(slice.open[0]?.value).toBe("economy");
    expect(slice.open[0]?.defaultValue).toBe("premium-economy");
  });
});
