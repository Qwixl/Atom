/**
 * Run the draft's encapsulation conformance vectors through the real A2A
 * deserialiser.
 *
 * `spec/vectors/run.mjs` also runs these vectors, but maps the wire JSON to the
 * tagged-union form with its own hand-written mapping, so that a runner cannot
 * miss this implementation misreading the wire. That independence costs
 * something: it leaves the SDK's actual `Part.fromJSON` untested against the
 * vectors, and the SDK is what deserialises every real inbound message. This
 * test closes that, so a divergence between the two mappings fails here rather
 * than in production against a peer in another language.
 *
 * The vectors are read from `spec/` rather than duplicated, because two copies of
 * a conformance corpus is one copy too many.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Part } from "@a2a-js/sdk";
import { describe, expect, it } from "vitest";
import { readAtomDataPart } from "./dataPart.js";

interface EncapsulationVector {
  id: string;
  kind: string;
  description: string;
  expect: "accept" | "reject";
  readAs: string;
  part: Record<string, unknown>;
}

const VECTOR_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../spec/vectors");

function loadEncapsulationVectors(): EncapsulationVector[] {
  return readdirSync(VECTOR_DIR)
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort()
    .map((file) => JSON.parse(readFileSync(join(VECTOR_DIR, file), "utf8")) as EncapsulationVector)
    .filter((vector) => vector.kind === "encapsulation-part");
}

const vectors = loadEncapsulationVectors();

describe("draft-chapman-a2a-mls encapsulation vectors", () => {
  it("finds the vector corpus", () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  for (const vector of vectors) {
    it(`${vector.id}: ${vector.expect}`, () => {
      let resolved: unknown;
      try {
        resolved = readAtomDataPart(Part.fromJSON(vector.part), vector.readAs);
      } catch {
        // A part the SDK refuses to deserialise is one no receiver can act on,
        // which is the rejection the vector asserts.
        resolved = undefined;
      }
      const outcome = resolved === undefined ? "reject" : "accept";
      expect(outcome, vector.description).toBe(vector.expect);
    });
  }
});
