/**
 * Hostile-peer cases for encapsulation — must all be rejected by readAtomDataPart.
 *
 * Fixed vectors 070–078 stay the third-party corpus; these mutations catch silent
 * preference / shape-inference bugs (D110).
 */

import { describe, expect, it } from "vitest";
import { readAtomDataPart } from "./dataPart.js";
import type { Part } from "@a2a-js/sdk";

const DATA_OBJECT = "application/vnd.atom.data-object+json;version=1";
const MLS_WIRE = "application/vnd.atom.mls-wire+cbor;version=1";

const object = {
  version: 1,
  id: "01948f00-0000-7000-8000-000000000070",
  issuerDid: "did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG",
  issuedAt: "2026-01-15T11:59:00.000Z",
  semantic: { schema: "https://atom.qwixl.dev/schema/CommsMessage" },
  payload: { text: "hello" },
  governance: { purpose: "comms:message", ttlSeconds: 3600 },
  signatureAlgorithm: "ed25519",
  signature: "ti4vkUKcn84E0YovTj/9SNh2She+rPCwcwYvCMUWfN84/xee7hgm3xEEdbqAeK9DzafrovQWG2FXhjVmpq7WCw==",
};

function dataPart(value: object, mediaType: string): Part {
  return {
    content: { $case: "data", value },
    mediaType,
    filename: "",
    metadata: undefined,
  };
}

const cases: { id: string; part: Part; readAs: string }[] = [
  {
    id: "H001-conflict-swapped",
    part: dataPart({ mediaType: MLS_WIRE, object }, DATA_OBJECT),
    readAs: DATA_OBJECT,
  },
  {
    id: "H005-null-data",
    part: {
      content: { $case: "data", value: null as unknown as object },
      mediaType: DATA_OBJECT,
      filename: "",
      metadata: undefined,
    },
    readAs: DATA_OBJECT,
  },
  {
    id: "H006-array-data",
    part: {
      content: { $case: "data", value: [] as unknown as object },
      mediaType: DATA_OBJECT,
      filename: "",
      metadata: undefined,
    },
    readAs: DATA_OBJECT,
  },
  {
    id: "H008-text-claiming-data-object",
    part: {
      content: { $case: "text", value: "not-an-envelope" },
      mediaType: DATA_OBJECT,
      filename: "",
      metadata: undefined,
    },
    readAs: DATA_OBJECT,
  },
  {
    id: "H011-seek-mls-but-offer-data-object",
    part: dataPart({ mediaType: DATA_OBJECT, object }, DATA_OBJECT),
    readAs: MLS_WIRE,
  },
];

describe("hostile encapsulation peers", () => {
  for (const c of cases) {
    it(`${c.id} is rejected`, () => {
      expect(readAtomDataPart(c.part, c.readAs)).toBeUndefined();
    });
  }
});
