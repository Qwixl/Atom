#!/usr/bin/env node
/**
 * Generate conformance vectors for draft-chapman-a2a-offline-delivery-00.
 *
 * Deliberately independent of @qwixl/* (D110): signing and wake-seed jitter are
 * duplicated from the specification text. Regenerate with:
 *   node spec/vectors/offline-delivery/generate.mjs
 */
import { createPrivateKey, createPublicKey, sign as edSign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const WAKE_SEED = "wake-vector-seed";
const DATA_OBJECT_MEDIA_TYPE = "application/vnd.atom.data-object+json;version=1";
const OFFLINE_DELIVERY_URI = "https://atom.qwixl.dev/a2a/offline-delivery/v1";
const CALLER_DID = "did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG";
const TRANSPORT_DID = "did:key:z6MknGc3ocHs3zdPiJbnaaqDi58NGb4pk1Sp9WxWufuXSdxf";
const FORGED_ISSUER_DID = "did:key:z6Mkforged00000000000000000000000000000000001";

/* ------------------------------------------------------------------ keys --- */

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function keyPairFromSeed(seedHex) {
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seedHex, "hex")]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return { privateKey, publicKey: Buffer.from(spki.subarray(spki.length - 32)) };
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58btcEncode(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1;
  return (
    "1".repeat(leadingZeros) +
    digits
      .reverse()
      .map((d) => BASE58_ALPHABET[d])
      .join("")
      .replace(/^1+/, (m) => (leadingZeros > 0 ? "" : m))
  );
}

function didKeyFromPublicKey(publicKey) {
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), publicKey]);
  return `did:key:z${base58btcEncode(multicodec)}`;
}

/* --------------------------------------------------- canonical form + sign --- */

function canonicalise(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`).join(",")}}`;
}

function signingPayload(object) {
  return canonicalise({
    version: object.version,
    id: object.id,
    issuerDid: object.issuerDid,
    issuedAt: object.issuedAt,
    semantic: object.semantic,
    payload: object.payload,
    governance: object.governance,
  });
}

function sign(unsigned, privateKey) {
  const canonicalForm = signingPayload(unsigned);
  const signature = edSign(null, Buffer.from(canonicalForm, "utf8"), privateKey);
  return {
    object: { ...unsigned, signatureAlgorithm: "ed25519", signature: signature.toString("base64") },
    canonicalForm,
  };
}

/* -------------------------------------------------------- wake-seed jitter --- */

/** FNV-1a 32-bit — duplicate of packages/agent-backend/src/reachability.ts */
function hashWakeSeed(seed) {
  let hash = 2_166_136_261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function hourlyWakeMinute(seed) {
  return hashWakeSeed(seed) % 60;
}

function isInHourlyWakeWindow(nowIso, seed) {
  const now = new Date(nowIso);
  const wakeMinute = hourlyWakeMinute(seed);
  const minute = now.getUTCMinutes();
  const offset = (minute - wakeMinute + 60) % 60;
  return offset < 5;
}

const ALICE = keyPairFromSeed("00".repeat(31) + "01");
const ALICE_DID = didKeyFromPublicKey(ALICE.publicKey);

const WAKE_MINUTE = hourlyWakeMinute(WAKE_SEED);
const NOW_INSIDE_WAKE = `2026-01-15T12:${String(WAKE_MINUTE).padStart(2, "0")}:10.000Z`;
const NOW_OUTSIDE_WAKE = `2026-01-15T12:${String((WAKE_MINUTE + 30) % 60).padStart(2, "0")}:00.000Z`;
const NOW_SLEEP = "2026-01-15T12:00:00.000Z";
const WAKE_AT_DEQUEUE = "2026-01-15T14:00:00.000Z";

function baseObject(overrides = {}) {
  return {
    version: 1,
    id: "01948f00-0000-7000-8000-000000000101",
    issuerDid: ALICE_DID,
    issuedAt: "2026-01-15T13:59:00.000Z",
    semantic: { schema: "https://atom.qwixl.dev/schema/CommsMessage" },
    payload: { text: "offline-delivery vector" },
    governance: { purpose: "comms:message", ttlSeconds: 3600 },
    ...overrides,
  };
}

function jsonRpcBody(object) {
  return {
    jsonrpc: "2.0",
    method: "message/send",
    params: {
      message: {
        parts: [{ mediaType: DATA_OBJECT_MEDIA_TYPE, object }],
      },
    },
  };
}

const VALID_GO = sign(baseObject(), ALICE.privateKey).object;

/** Long TTL so ReplayGuard retention survives wall-clock load in od-060. */
const RESTART_GO = sign(
  baseObject({
    id: "01948f00-0000-7000-8000-000000000160",
    governance: { purpose: "comms:message", ttlSeconds: 63_072_000 },
  }),
  ALICE.privateKey,
).object;

const vectors = [];

function push(vector) {
  vectors.push(vector);
}

/* --- reachability-verdict --- */

push({
  id: "od-001",
  kind: "reachability-verdict",
  description: "always_on accepts inbound at any instant.",
  requires: ["reachability"],
  config: { mode: "always_on", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  expect: { accept: true },
});

push({
  id: "od-002",
  kind: "reachability-verdict",
  description: "session accepts inbound (no asleep store-and-forward).",
  requires: ["reachability"],
  config: { mode: "session", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  expect: { accept: true },
});

push({
  id: "od-003",
  kind: "reachability-verdict",
  description: "sleep rejects with agent_asleep.",
  requires: ["reachability"],
  config: { mode: "sleep", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  expect: { accept: false, error: "agent_asleep" },
});

push({
  id: "od-004",
  kind: "reachability-verdict",
  description: "hourly_wake outside the five-minute UTC window rejects with retryAfterSec.",
  requires: ["reachability", "hourly-wake"],
  config: { mode: "hourly_wake", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_OUTSIDE_WAKE,
  expect: { accept: false, error: "agent_asleep", retryAfterSecMin: 1 },
});

push({
  id: "od-005",
  kind: "reachability-verdict",
  description: "hourly_wake inside the jittered window accepts.",
  requires: ["reachability", "hourly-wake"],
  config: { mode: "hourly_wake", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_INSIDE_WAKE,
  expect: { accept: true },
});

/* --- asleep-http-response --- */

const SAMPLE_POST_BODY = JSON.stringify({
  jsonrpc: "2.0",
  method: "message/send",
  params: { message: { parts: [] } },
});

push({
  id: "od-010",
  kind: "asleep-http-response",
  description: "sleep + verified transport DID → 503 agent_asleep, queued.",
  requires: ["asleep-http", "store-and-forward"],
  config: { mode: "sleep", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  request: { method: "POST", body: SAMPLE_POST_BODY, atomCallerDid: CALLER_DID },
  expect: {
    statusCode: 503,
    error: "agent_asleep",
    queued: true,
    enqueued: true,
  },
});

push({
  id: "od-011",
  kind: "asleep-http-response",
  description: "hourly_wake outside window + caller → 503, Retry-After, queued.",
  requires: ["asleep-http", "hourly-wake"],
  config: { mode: "hourly_wake", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_OUTSIDE_WAKE,
  request: { method: "POST", body: "{}", atomCallerDid: CALLER_DID },
  expect: {
    statusCode: 503,
    error: "agent_asleep",
    queued: true,
    enqueued: true,
    retryAfterHeader: true,
    retryAfterSecMin: 1,
  },
});

push({
  id: "od-012",
  kind: "asleep-http-response",
  description: "hourly_wake inside window → pass-through, no enqueue.",
  requires: ["asleep-http", "hourly-wake"],
  config: { mode: "hourly_wake", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_INSIDE_WAKE,
  request: { method: "POST", body: "should-not-queue", atomCallerDid: CALLER_DID },
  expect: { passThrough: true, statusCode: 200, enqueued: false },
});

push({
  id: "od-013",
  kind: "asleep-http-response",
  description: "GET during sleep → pass-through, no enqueue.",
  requires: ["asleep-http"],
  config: { mode: "sleep", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  request: { method: "GET", body: "" },
  expect: { passThrough: true, statusCode: 200, enqueued: false },
});

push({
  id: "od-014",
  kind: "asleep-http-response",
  description: "session POST → pass-through, no enqueue (SessionOnly MUST NOT queue).",
  requires: ["asleep-http", "reachability"],
  config: { mode: "session", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  request: { method: "POST", body: SAMPLE_POST_BODY, atomCallerDid: CALLER_DID },
  expect: { passThrough: true, statusCode: 200, enqueued: false },
});

push({
  id: "od-015",
  kind: "asleep-http-response",
  description: "sleep without atomCallerDid → 401 asleep_enqueue_requires_auth, not queued.",
  requires: ["asleep-http", "transport-auth"],
  config: { mode: "sleep", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  request: {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      params: { message: { issuerDid: FORGED_ISSUER_DID } },
    }),
  },
  expect: {
    statusCode: 401,
    error: "asleep_enqueue_requires_auth",
    queued: false,
    enqueued: false,
  },
});

push({
  id: "od-020",
  kind: "asleep-http-response",
  description: "maxMessages=1 → second POST returns 507 asleep_queue_full kind messages.",
  requires: ["asleep-http", "queue-caps"],
  config: { mode: "sleep", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  queueCaps: { maxMessages: 1 },
  requests: [
    { method: "POST", body: "one", atomCallerDid: CALLER_DID },
    { method: "POST", body: "two", atomCallerDid: CALLER_DID },
  ],
  expect: {
    first: { statusCode: 503, queued: true },
    second: { statusCode: 507, error: "asleep_queue_full", kind: "messages", queued: false, enqueued: false },
  },
});

push({
  id: "od-021",
  kind: "asleep-http-response",
  description: "byte cap exceeded → 507 asleep_queue_full kind bytes.",
  requires: ["asleep-http", "queue-caps"],
  config: { mode: "sleep", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  queueCaps: { maxTotalBytes: 8 },
  request: { method: "POST", body: "0123456789abcdef", atomCallerDid: CALLER_DID },
  expect: {
    statusCode: 507,
    error: "asleep_queue_full",
    kind: "bytes",
    queued: false,
    enqueued: false,
  },
});

push({
  id: "od-022",
  kind: "asleep-http-response",
  description:
    "Peer cap uses transport atomCallerDid, not body issuerDid — second message 429 kind peer.",
  requires: ["asleep-http", "queue-caps", "transport-auth"],
  config: { mode: "sleep", wakeSeed: WAKE_SEED, forceAlwaysOn: false },
  now: NOW_SLEEP,
  queueCaps: { maxPendingPerPeer: 1 },
  requests: [
    {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: { message: { issuerDid: FORGED_ISSUER_DID } },
      }),
      atomCallerDid: TRANSPORT_DID,
    },
    {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: { message: { issuerDid: FORGED_ISSUER_DID } },
      }),
      atomCallerDid: TRANSPORT_DID,
    },
  ],
  expect: {
    first: { statusCode: 503, queued: true, fromDid: TRANSPORT_DID },
    second: { statusCode: 429, error: "asleep_queue_full", kind: "peer", queued: false, enqueued: false },
  },
});

/* --- asleep-queue --- */

push({
  id: "od-030",
  kind: "asleep-queue",
  description: "Enqueue opaque blob within default caps.",
  requires: ["asleep-queue"],
  action: "enqueue",
  input: { blobBase64: Buffer.from("opaque-ok").toString("base64"), fromDid: CALLER_DID },
  expect: { accepted: true, listCount: 1 },
});

push({
  id: "od-031",
  kind: "asleep-queue",
  description: "Persisted index survives a new AsleepQueueStore on the same directory.",
  requires: ["asleep-queue", "persistence"],
  action: "persist-reopen",
  input: { blobBase64: Buffer.from("survives-restart").toString("base64") },
  expect: { listCountAfterReopen: 1 },
});

push({
  id: "od-040",
  kind: "asleep-queue",
  description: "maxMessages cap rejects enqueue.",
  requires: ["asleep-queue", "queue-caps"],
  action: "enqueue-reject",
  caps: { maxMessages: 1 },
  inputs: [
    { blobBase64: Buffer.from("first").toString("base64") },
    { blobBase64: Buffer.from("second").toString("base64") },
  ],
  expect: { firstAccepted: true, secondKind: "messages" },
});

push({
  id: "od-041",
  kind: "asleep-queue",
  description: "maxTotalBytes cap rejects enqueue.",
  requires: ["asleep-queue", "queue-caps"],
  action: "enqueue-reject",
  caps: { maxTotalBytes: 4 },
  inputs: [{ blobBase64: Buffer.from("0123456789").toString("base64") }],
  expect: { rejectKind: "bytes" },
});

push({
  id: "od-042",
  kind: "asleep-queue",
  description: "maxPendingPerPeer cap rejects enqueue.",
  requires: ["asleep-queue", "queue-caps"],
  action: "enqueue-reject",
  caps: { maxPendingPerPeer: 1 },
  inputs: [
    { blobBase64: Buffer.from("a").toString("base64"), fromDid: CALLER_DID },
    { blobBase64: Buffer.from("b").toString("base64"), fromDid: CALLER_DID },
  ],
  expect: { firstAccepted: true, secondKind: "peer" },
});

push({
  id: "od-043",
  kind: "asleep-queue",
  description: "Short ttlMs → advance now → list(false) empty after purgeExpired.",
  requires: ["asleep-queue", "ttl"],
  action: "ttl-expiry",
  input: { blobBase64: Buffer.from("expires").toString("base64"), ttlMs: 1000 },
  enqueuedAt: "2026-01-15T10:00:00.000Z",
  advancedNow: "2026-01-15T10:00:02.000Z",
  expect: { listCountBefore: 1, listCountAfter: 0, purged: 1 },
});

/* --- asleep-dequeue-sequence --- */

const VALID_BODY = jsonRpcBody(VALID_GO);
const VALID_BODY_JSON = JSON.stringify(VALID_BODY);

const tamperedObject = structuredClone(VALID_GO);
tamperedObject.payload = { text: "tampered-after-sign" };

const expiredObject = sign(
  baseObject({
    id: "01948f00-0000-7000-8000-000000000152",
    issuedAt: "2026-01-15T10:00:00.000Z",
    governance: { purpose: "comms:message", ttlSeconds: 60 },
  }),
  ALICE.privateKey,
).object;

push({
  id: "od-050",
  kind: "asleep-dequeue",
  description: "Valid Governed Object in JSON-RPC body → accepted on dequeue.",
  requires: ["asleep-dequeue", "processing"],
  body: VALID_BODY,
  wakeNow: WAKE_AT_DEQUEUE,
  permittedPurposes: ["comms:message"],
  expect: { acceptedMin: 1, processedMin: 1, queueEmpty: true },
});

push({
  id: "od-051",
  kind: "asleep-dequeue",
  description: "Tampered payload after sign → rejected on dequeue.",
  requires: ["asleep-dequeue", "processing"],
  body: jsonRpcBody(tamperedObject),
  wakeNow: WAKE_AT_DEQUEUE,
  permittedPurposes: ["comms:message"],
  expect: { rejectedMin: 1, accepted: 0, queueEmpty: true },
});

push({
  id: "od-052",
  kind: "asleep-dequeue",
  description: "GO expired at wake now → rejected on dequeue.",
  requires: ["asleep-dequeue", "processing", "governance"],
  body: jsonRpcBody(expiredObject),
  wakeNow: WAKE_AT_DEQUEUE,
  permittedPurposes: ["comms:message"],
  expect: { rejectedMin: 1, accepted: 0, queueEmpty: true },
});

push({
  id: "od-053",
  kind: "asleep-dequeue-sequence",
  description: "Same-process replay: accept then re-enqueue identical body → reject.",
  requires: ["asleep-dequeue", "replay"],
  body: VALID_BODY,
  wakeNow: WAKE_AT_DEQUEUE,
  permittedPurposes: ["comms:message"],
  steps: ["dequeue-accept", "re-enqueue", "dequeue-reject"],
  expect: { firstAcceptedMin: 1, secondRejectedMin: 1, queueEmpty: true },
});

push({
  id: "od-054",
  kind: "asleep-dequeue",
  description: "Opaque non-GO blob → deferred, not drained.",
  requires: ["asleep-dequeue"],
  opaqueBlobBase64: Buffer.from("not-a-governed-object").toString("base64"),
  expect: { deferredMin: 1, processed: 0, queueCount: 1 },
});

push({
  id: "od-055",
  kind: "asleep-dequeue",
  description: "Deferred opaque with short TTL → advance now → purged.",
  requires: ["asleep-dequeue", "ttl"],
  opaqueBlobBase64: Buffer.from("deferred-ttl").toString("base64"),
  ttlMs: 500,
  enqueuedAt: "2026-01-15T10:00:00.000Z",
  advancedNow: "2026-01-15T10:00:01.000Z",
  expect: { deferredMin: 1, listCountAfterPurge: 0 },
});

push({
  id: "od-060",
  kind: "asleep-dequeue-restart",
  description:
    "Replay survives restart: dequeue+ReplayGuardStore.flush → new queue + loaded guard rejects re-enqueue.",
  requires: ["asleep-dequeue", "replay", "persistence"],
  body: jsonRpcBody(RESTART_GO),
  wakeNow: WAKE_AT_DEQUEUE,
  permittedPurposes: ["comms:message"],
  expect: { firstAcceptedMin: 1, secondRejectedMin: 1 },
});

/* --- agent-card-extension (ST-04c / founder 3B) --- */

push({
  id: "card-od-001",
  kind: "agent-card-extension",
  description: "Valid sleep offline-delivery extension passes schema checks.",
  requires: ["agent-card", "offline-delivery-extension"],
  extension: {
    uri: OFFLINE_DELIVERY_URI,
    description: "Offline delivery profile",
    required: false,
    params: { mode: "sleep" },
  },
  expect: { schemaOk: true },
});

push({
  id: "card-od-002",
  kind: "agent-card-extension",
  description: "Valid hourly_wake offline-delivery extension passes schema checks.",
  requires: ["agent-card", "offline-delivery-extension"],
  extension: {
    uri: OFFLINE_DELIVERY_URI,
    description: "Offline delivery profile",
    required: false,
    params: { mode: "hourly_wake" },
  },
  expect: { schemaOk: true },
});

push({
  id: "card-od-003",
  kind: "agent-card-extension",
  description: "required:true is rejected by the agent-extension schema.",
  requires: ["agent-card", "offline-delivery-extension"],
  extension: {
    uri: OFFLINE_DELIVERY_URI,
    description: "Offline delivery profile",
    required: true,
    params: { mode: "sleep" },
  },
  expect: { schemaOk: false },
});

push({
  id: "card-od-004",
  kind: "agent-card-extension",
  description: "params.mode always_on is rejected (only sleep | hourly_wake).",
  requires: ["agent-card", "offline-delivery-extension"],
  extension: {
    uri: OFFLINE_DELIVERY_URI,
    description: "Offline delivery profile",
    required: false,
    params: { mode: "always_on" },
  },
  expect: { schemaOk: false },
});

push({
  id: "card-od-005",
  kind: "agent-card-extension",
  description: "Missing params.mode is rejected.",
  requires: ["agent-card", "offline-delivery-extension"],
  extension: {
    uri: OFFLINE_DELIVERY_URI,
    description: "Offline delivery profile",
    required: false,
    params: {},
  },
  expect: { schemaOk: false },
});

push({
  id: "card-od-006",
  kind: "agent-card-extension",
  description: "Wrong extension URI is rejected.",
  requires: ["agent-card", "offline-delivery-extension"],
  extension: {
    uri: "https://example.com/wrong",
    description: "Offline delivery profile",
    required: false,
    params: { mode: "sleep" },
  },
  expect: { schemaOk: false },
});

push({
  id: "card-od-007",
  kind: "agent-card-build",
  description:
    "buildAtomAgentCard declares extension when offlineDeliveryMode is set; omits when unset.",
  requires: ["agent-card", "offline-delivery-extension"],
  buildOptions: {
    baseUrl: "https://agent.example.test",
    name: "Vector Agent",
    description: "offline-delivery card vector",
  },
  cases: [
    { offlineDeliveryMode: "sleep", expectExtension: true, expectMode: "sleep" },
    { expectExtension: false },
  ],
});

/* -------------------------------------------------------------------- emit --- */

mkdirSync(OUT_DIR, { recursive: true });

for (const vector of vectors) {
  writeFileSync(join(OUT_DIR, `${vector.id}.json`), `${JSON.stringify(vector, null, 2)}\n`, "utf8");
}

const manifest = {
  specification: "draft-chapman-a2a-offline-delivery-00",
  generated: "deterministic — regenerate with `node spec/vectors/offline-delivery/generate.mjs`",
  d110Note: "generate.mjs uses node:crypto/fs only; run.mjs imports packages/*/dist after build.",
  wakeSeed: WAKE_SEED,
  wakeMinuteUtc: WAKE_MINUTE,
  wakeWindowInsideExample: NOW_INSIDE_WAKE,
  wakeWindowOutsideExample: NOW_OUTSIDE_WAKE,
  identities: {
    alice: { did: ALICE_DID, publicKeyBase64: ALICE.publicKey.toString("base64") },
    caller: { did: CALLER_DID },
    transportPeer: { did: TRANSPORT_DID },
  },
  counts: {
    total: vectors.length,
    byKind: vectors.reduce((acc, v) => {
      acc[v.kind] = (acc[v.kind] ?? 0) + 1;
      return acc;
    }, {}),
  },
  vectors: vectors.map((v) => ({ id: v.id, kind: v.kind, requires: v.requires })),
};

writeFileSync(join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`wrote ${vectors.length} vectors + manifest.json to ${OUT_DIR}`);
console.log(`  wakeSeed=${WAKE_SEED} wakeMinute=${WAKE_MINUTE} inside=${isInHourlyWakeWindow(NOW_INSIDE_WAKE, WAKE_SEED)}`);
console.log(`  alice ${ALICE_DID}`);
