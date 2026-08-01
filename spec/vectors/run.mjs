#!/usr/bin/env node
/**
 * Run the conformance vectors against this repository's implementation.
 *
 * Reports, per vector, whether the implementation's outcome matches the outcome the
 * specification requires. A failure here is not necessarily a bug in the vectors:
 * it means the implementation and the specification disagree, and one of them must
 * change. Exits non-zero if any vector fails.
 *
 * Usage:  node spec/vectors/run.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Imported by path, not by package name, so that spec/ stays outside the app build
// and a third party can point this runner at any implementation. Requires
// `pnpm --filter @qwixl/protocol build` first.
import {
  ReplayGuard,
  assertCredentialBinding,
  credentialBindingHolds,
  verifyDataObject,
  verifyDataObjectSignature,
} from "../../packages/protocol/dist/index.js";
import { readAtomDataPart } from "../../packages/a2a-transport/dist/index.js";

const VECTOR_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Apply the draft's mandatory ordered receiver checks using the library.
 */
async function evaluate(object, { now, permittedPurposes, replay }) {
  try {
    await verifyDataObject(object, {
      now: new Date(now),
      ...(permittedPurposes ? { allowedPurposes: permittedPurposes } : {}),
      ...(replay ? { replay } : {}),
    });
  } catch (error) {
    return { outcome: "reject", detail: error instanceof Error ? error.message : String(error) };
  }
  return { outcome: "accept", detail: "" };
}

function evaluateCredentialBinding(vector) {
  const { credentialIdentity, leafSignatureKey } = vector;
  const leaf = Buffer.from(leafSignatureKey, "base64");
  if (!credentialBindingHolds(credentialIdentity, leaf)) {
    try {
      assertCredentialBinding(credentialIdentity, leaf);
    } catch (error) {
      return {
        outcome: "reject",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { outcome: "accept", detail: "" };
}

/** Content members of an A2A part, one of which a part carries. */
const PART_CONTENT_MEMBERS = ["text", "data", "raw", "url"];

/**
 * Map a part from its wire JSON to the tagged-union form this implementation
 * works in.
 *
 * Deliberately hand-written from the specification rather than delegated to the
 * A2A SDK, for the same reason the vectors do not import `@qwixl/protocol`: a
 * runner that used the implementation's own deserialiser could not detect the
 * implementation misreading the wire form. `Part.fromJSON` is exercised against
 * these same vectors by `packages/a2a-transport/src/encapsulation.vectors.test.ts`,
 * so the SDK's mapping and this one are checked against each other.
 */
function partFromWireJson(json) {
  if (typeof json !== "object" || json === null) throw new Error("part is not an object");
  const present = PART_CONTENT_MEMBERS.filter((member) => json[member] !== undefined);
  if (present.length !== 1) {
    throw new Error(`part must carry exactly one content member, found ${present.length}`);
  }
  const [member] = present;
  return { content: { $case: member, value: json[member] }, mediaType: json.mediaType ?? "" };
}

/**
 * Resolve a part supplied as wire JSON to the media type the receiver seeks.
 *
 * A part that cannot be deserialised counts as rejected: a receiver that cannot
 * parse a part cannot act on it, which is the outcome the vector asserts anyway.
 */
function evaluateEncapsulation(vector) {
  let part;
  try {
    part = partFromWireJson(vector.part);
  } catch (error) {
    return { outcome: "reject", detail: `undeserialisable part: ${error.message}` };
  }
  if (readAtomDataPart(part, vector.readAs) === undefined) {
    return { outcome: "reject", detail: `part did not resolve to ${vector.readAs}` };
  }
  return { outcome: "accept", detail: "" };
}

const files = readdirSync(VECTOR_DIR)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json")
  .sort();

let passed = 0;
const failures = [];

for (const file of files) {
  const vector = JSON.parse(readFileSync(join(VECTOR_DIR, file), "utf8"));
  const results = [];

  if (vector.kind === "credential-binding") {
    results.push({ expected: vector.expect, ...evaluateCredentialBinding(vector) });
  } else if (vector.kind === "encapsulation-part") {
    results.push({ expected: vector.expect, ...evaluateEncapsulation(vector) });
  } else if (vector.kind === "data-object-sequence") {
    const replay = new ReplayGuard();
    for (const step of vector.sequence) {
      results.push({
        expected: step.expect,
        ...(await evaluate(step.object, {
          now: vector.now,
          permittedPurposes: vector.permittedPurposes,
          replay,
        })),
      });
    }
  } else {
    const replay = new ReplayGuard();
    results.push({
      expected: vector.expect,
      ...(await evaluate(vector.object, {
        now: vector.now,
        permittedPurposes: vector.permittedPurposes,
        replay,
      })),
    });

    // Vector 013 asserts a signature valid in itself but not made by the stated
    // issuer. Confirm the library binds signature to issuerDid rather than merely
    // checking that some signature verifies.
    if (vector.reason === "signature-not-by-issuer" && results[0].outcome === "accept") {
      const boundToIssuer = await verifyDataObjectSignature(vector.object).catch(() => false);
      results[0] = {
        expected: vector.expect,
        outcome: boundToIssuer ? "accept" : "reject",
        detail: "signature not verifiable under issuerDid",
      };
    }
  }

  const ok = results.every((r) => r.outcome === r.expected);
  if (ok) {
    passed += 1;
    console.log(`  pass  ${vector.id}`);
  } else {
    const detail = results
      .map((r, i) => `step ${i + 1}: expected ${r.expected}, got ${r.outcome}${r.detail ? ` (${r.detail})` : ""}`)
      .join("; ");
    failures.push({ id: vector.id, requires: vector.requires, detail });
    console.log(`  FAIL  ${vector.id}`);
    console.log(`        ${detail}`);
  }
}

console.log(`\n${passed}/${files.length} vectors pass`);

if (failures.length > 0) {
  console.log("\nSpecification/implementation disagreements:");
  for (const f of failures) {
    console.log(`  ${f.id}  [${(f.requires || []).join(", ")}]`);
    console.log(`    ${f.detail}`);
  }
  process.exit(1);
}
