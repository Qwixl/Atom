#!/usr/bin/env node
/**
 * Run offline-delivery conformance vectors against this repository's implementation.
 *
 * Usage (after `pnpm build:packages`):
 *   node spec/vectors/offline-delivery/run.mjs
 */
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateInboundReachability,
  createInboundReachabilityMiddleware,
} from "../../../packages/agent-backend/dist/reachability.js";
import {
  AsleepQueueStore,
  AsleepQueueFullError,
} from "../../../packages/agent-backend/dist/asleepQueue.js";
import { dequeueAsleepMessages } from "../../../packages/agent-backend/dist/asleepDequeue.js";
import { ReplayGuardStore } from "../../../packages/agent-backend/dist/replayGuardStore.js";
import { ReplayGuard } from "../../../packages/protocol/dist/index.js";
import {
  ATOM_OFFLINE_DELIVERY_EXTENSION,
  buildAtomAgentCard,
} from "../../../packages/a2a-transport/dist/index.js";

const VECTOR_DIR = dirname(fileURLToPath(import.meta.url));
const OFFLINE_DELIVERY_URI = ATOM_OFFLINE_DELIVERY_EXTENSION;

const files = readdirSync(VECTOR_DIR)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json")
  .sort();

let passed = 0;
const failures = [];

function fail(vectorId, detail) {
  failures.push({ id: vectorId, detail });
  console.log(`  FAIL  ${vectorId}`);
  console.log(`        ${detail}`);
}

function pass(vectorId) {
  passed += 1;
  console.log(`  PASS  ${vectorId}`);
}

function tempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function cleanupDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function reachabilityConfig(vector) {
  return vector.config;
}

function evaluateReachabilityVerdict(vector) {
  const verdict = evaluateInboundReachability(
    reachabilityConfig(vector),
    new Date(vector.now),
  );
  const exp = vector.expect;
  if (verdict.accept !== exp.accept) {
    return `accept: expected ${exp.accept}, got ${verdict.accept}`;
  }
  if (exp.error && verdict.error !== exp.error) {
    return `error: expected ${exp.error}, got ${verdict.error ?? "none"}`;
  }
  if (exp.retryAfterSecMin !== undefined) {
    if (verdict.retryAfterSec === undefined || verdict.retryAfterSec < exp.retryAfterSecMin) {
      return `retryAfterSec: expected >= ${exp.retryAfterSecMin}, got ${verdict.retryAfterSec}`;
    }
  }
  return null;
}

async function runMiddlewareStep(opts) {
  const enqueued = [];
  const trackEnqueue = (input) => {
    const result = opts.enqueue(input);
    enqueued.push(input);
    return result;
  };
  const middleware = createInboundReachabilityMiddleware({
    config: reachabilityConfig(opts.vector),
    now: () => new Date(opts.vector.now),
    enqueue: trackEnqueue,
  });

  const req = Readable.from([Buffer.from(opts.request.body ?? "")]);
  req.method = opts.request.method;
  if (opts.request.atomCallerDid) {
    req.atomCallerDid = opts.request.atomCallerDid;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      end(payload) {
        if (payload) {
          chunks.push(typeof payload === "string" ? Buffer.from(payload) : payload);
        }
        resolve({
          statusCode: res.statusCode,
          headers,
          body: Buffer.concat(chunks).toString("utf8"),
          enqueued,
        });
      },
    };

    middleware(req, res, (err) => {
      if (err) reject(err);
      else {
        resolve({
          statusCode: res.statusCode,
          headers,
          body: "",
          enqueued,
        });
      }
    });
  });
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function checkHttpExpect(result, expect, label = "") {
  const prefix = label ? `${label}: ` : "";
  if (expect.passThrough) {
    if (result.statusCode !== expect.statusCode) {
      return `${prefix}expected pass-through status ${expect.statusCode}, got ${result.statusCode}`;
    }
    if (expect.enqueued === false && result.enqueued.length > 0) {
      return `${prefix}expected no enqueue, got ${result.enqueued.length}`;
    }
    return null;
  }
  if (result.statusCode !== expect.statusCode) {
    return `${prefix}statusCode: expected ${expect.statusCode}, got ${result.statusCode}`;
  }
  const parsed = parseJsonBody(result.body);
  if (expect.error && parsed.error !== expect.error) {
    return `${prefix}error: expected ${expect.error}, got ${parsed.error}`;
  }
  if (expect.queued !== undefined && parsed.queued !== expect.queued) {
    return `${prefix}queued: expected ${expect.queued}, got ${parsed.queued}`;
  }
  if (expect.kind && parsed.kind !== expect.kind) {
    return `${prefix}kind: expected ${expect.kind}, got ${parsed.kind}`;
  }
  if (expect.enqueued === true && result.enqueued.length === 0) {
    return `${prefix}expected enqueue, got none`;
  }
  if (expect.enqueued === false && result.enqueued.length > 0) {
    return `${prefix}expected no enqueue, got ${result.enqueued.length}`;
  }
  if (expect.retryAfterHeader && !result.headers["retry-after"]) {
    return `${prefix}expected Retry-After header`;
  }
  if (expect.retryAfterSecMin !== undefined) {
    const sec = parsed.retryAfterSec;
    if (sec === undefined || sec < expect.retryAfterSecMin) {
      return `${prefix}retryAfterSec expected >= ${expect.retryAfterSecMin}, got ${sec}`;
    }
  }
  if (expect.fromDid !== undefined) {
    const from = result.enqueued[0]?.fromDid;
    if (from !== expect.fromDid) {
      return `${prefix}fromDid: expected ${expect.fromDid}, got ${from}`;
    }
  }
  return null;
}

async function evaluateAsleepHttpResponse(vector) {
  const dir = tempDir("atom-od-http-");
  try {
    const queueDir = path.join(dir, "asleep-inbox");
    const caps = vector.queueCaps ?? {};
    const store = new AsleepQueueStore({ dirPath: queueDir, ...caps });
    const enqueue = (input) => {
      store.enqueue(input);
    };

    if (vector.requests) {
      const results = [];
      for (const request of vector.requests) {
        results.push(
          await runMiddlewareStep({
            vector,
            request,
            enqueue,
          }),
        );
      }
      const errFirst = checkHttpExpect(results[0], vector.expect.first, "first");
      if (errFirst) return errFirst;
      const errSecond = checkHttpExpect(results[1], vector.expect.second, "second");
      if (errSecond) return errSecond;
      return null;
    }

    const result = await runMiddlewareStep({
      vector,
      request: vector.request,
      enqueue,
    });
    return checkHttpExpect(result, vector.expect);
  } finally {
    cleanupDir(dir);
  }
}

function evaluateAsleepQueue(vector) {
  const dir = tempDir("atom-od-queue-");
  try {
    const queueDir = path.join(dir, "asleep-inbox");
    const caps = vector.caps ?? {};

    if (vector.action === "enqueue") {
      const store = new AsleepQueueStore({ dirPath: queueDir, ...caps });
      const input = vector.input;
      store.enqueue({
        blob: Buffer.from(input.blobBase64, "base64"),
        fromDid: input.fromDid,
      });
      const count = store.list().length;
      if (!vector.expect.accepted || count !== vector.expect.listCount) {
        return `listCount: expected ${vector.expect.listCount}, got ${count}`;
      }
      return null;
    }

    if (vector.action === "persist-reopen") {
      const store1 = new AsleepQueueStore({ dirPath: queueDir });
      store1.enqueue({ blob: Buffer.from(vector.input.blobBase64, "base64") });
      const store2 = new AsleepQueueStore({ dirPath: queueDir });
      const count = store2.list().length;
      if (count !== vector.expect.listCountAfterReopen) {
        return `listCountAfterReopen: expected ${vector.expect.listCountAfterReopen}, got ${count}`;
      }
      return null;
    }

    if (vector.action === "enqueue-reject") {
      const store = new AsleepQueueStore({ dirPath: queueDir, ...caps });
      const inputs = vector.inputs ?? [vector.input];
      if (vector.expect.firstAccepted !== undefined) {
        store.enqueue({
          blob: Buffer.from(inputs[0].blobBase64, "base64"),
          fromDid: inputs[0].fromDid,
        });
        try {
          store.enqueue({
            blob: Buffer.from(inputs[1].blobBase64, "base64"),
            fromDid: inputs[1].fromDid,
          });
          return "expected second enqueue to throw AsleepQueueFullError";
        } catch (error) {
          if (!(error instanceof AsleepQueueFullError)) throw error;
          if (error.kind !== vector.expect.secondKind) {
            return `secondKind: expected ${vector.expect.secondKind}, got ${error.kind}`;
          }
          return null;
        }
      }
      try {
        store.enqueue({
          blob: Buffer.from(inputs[0].blobBase64, "base64"),
          fromDid: inputs[0].fromDid,
        });
        return "expected enqueue to throw AsleepQueueFullError";
      } catch (error) {
        if (!(error instanceof AsleepQueueFullError)) throw error;
        if (error.kind !== vector.expect.rejectKind) {
          return `rejectKind: expected ${vector.expect.rejectKind}, got ${error.kind}`;
        }
        return null;
      }
    }

    if (vector.action === "ttl-expiry") {
      const enqueuedAt = new Date(vector.enqueuedAt);
      const advanced = new Date(vector.advancedNow);
      const store = new AsleepQueueStore({
        dirPath: queueDir,
        now: () => enqueuedAt,
      });
      store.enqueue({
        blob: Buffer.from(vector.input.blobBase64, "base64"),
        ttlMs: vector.input.ttlMs,
      });
      if (store.list(false).length !== vector.expect.listCountBefore) {
        return `listCountBefore: expected ${vector.expect.listCountBefore}`;
      }
      const storeLater = new AsleepQueueStore({
        dirPath: queueDir,
        now: () => advanced,
      });
      const purged = storeLater.purgeExpired();
      const after = storeLater.list(false).length;
      if (after !== vector.expect.listCountAfter) {
        return `listCountAfter: expected ${vector.expect.listCountAfter}, got ${after}`;
      }
      if (purged !== vector.expect.purged) {
        return `purged: expected ${vector.expect.purged}, got ${purged}`;
      }
      return null;
    }

    return `unknown asleep-queue action ${vector.action}`;
  } finally {
    cleanupDir(dir);
  }
}

async function dequeueWithBody(vector, queue, replay) {
  const body = vector.body
    ? Buffer.from(JSON.stringify(vector.body))
    : Buffer.from(vector.opaqueBlobBase64, "base64");

  const ttlMs = vector.ttlMs;
  const enqueuedAt = vector.enqueuedAt ? new Date(vector.enqueuedAt) : new Date();
  if (vector.opaqueBlobBase64) {
    queue.enqueue({
      blob: body,
      ttlMs,
    });
  } else {
    queue.enqueue({ blob: body });
  }

  const wakeNow = vector.wakeNow ? new Date(vector.wakeNow) : enqueuedAt;
  return dequeueAsleepMessages({
    queue,
    verifyOptions: {
      allowedPurposes: vector.permittedPurposes,
      now: wakeNow,
      replay,
    },
  });
}

async function evaluateAsleepDequeue(vector) {
  const dir = tempDir("atom-od-dq-");
  try {
    const queue = new AsleepQueueStore({
      dirPath: path.join(dir, "asleep-inbox"),
      ...(vector.enqueuedAt ? { now: () => new Date(vector.enqueuedAt) } : {}),
    });
    const replay = new ReplayGuard();

    if (vector.opaqueBlobBase64 && vector.advancedNow) {
      const outcome = await dequeueWithBody(vector, queue, replay);
      if (outcome.deferred < vector.expect.deferredMin) {
        return `deferred: expected >= ${vector.expect.deferredMin}, got ${outcome.deferred}`;
      }
      const advanced = new Date(vector.advancedNow);
      const queueLater = new AsleepQueueStore({
        dirPath: path.join(dir, "asleep-inbox"),
        now: () => advanced,
      });
      queueLater.purgeExpired();
      const count = queueLater.list(false).length;
      if (count !== vector.expect.listCountAfterPurge) {
        return `listCountAfterPurge: expected ${vector.expect.listCountAfterPurge}, got ${count}`;
      }
      return null;
    }

    const outcome = await dequeueWithBody(vector, queue, replay);
    const exp = vector.expect;

    if (exp.acceptedMin !== undefined && outcome.accepted < exp.acceptedMin) {
      return `accepted: expected >= ${exp.acceptedMin}, got ${outcome.accepted}`;
    }
    if (exp.processedMin !== undefined && outcome.processed < exp.processedMin) {
      return `processed: expected >= ${exp.processedMin}, got ${outcome.processed}`;
    }
    if (exp.rejectedMin !== undefined && outcome.rejected < exp.rejectedMin) {
      return `rejected: expected >= ${exp.rejectedMin}, got ${outcome.rejected}`;
    }
    if (exp.deferredMin !== undefined && outcome.deferred < exp.deferredMin) {
      return `deferred: expected >= ${exp.deferredMin}, got ${outcome.deferred}`;
    }
    if (exp.accepted === 0 && outcome.accepted !== 0) {
      return `accepted: expected 0, got ${outcome.accepted}`;
    }
    if (exp.processed === 0 && outcome.processed !== 0) {
      return `processed: expected 0, got ${outcome.processed}`;
    }
    if (exp.queueEmpty && queue.list().length !== 0) {
      return `queue not empty: ${queue.list().length} remaining`;
    }
    if (exp.queueCount !== undefined && queue.list().length !== exp.queueCount) {
      return `queueCount: expected ${exp.queueCount}, got ${queue.list().length}`;
    }
    return null;
  } finally {
    cleanupDir(dir);
  }
}

async function evaluateAsleepDequeueSequence(vector) {
  const dir = tempDir("atom-od-dq-seq-");
  try {
    const queueDir = path.join(dir, "asleep-inbox");
    const queue = new AsleepQueueStore({ dirPath: queueDir });
    const replay = new ReplayGuard();
    const body = Buffer.from(JSON.stringify(vector.body));
    const verifyOptions = {
      allowedPurposes: vector.permittedPurposes,
      now: new Date(vector.wakeNow),
      replay,
    };

    queue.enqueue({ blob: body });
    const first = await dequeueAsleepMessages({ queue, verifyOptions });
    if (first.accepted < vector.expect.firstAcceptedMin) {
      return `first accepted: expected >= ${vector.expect.firstAcceptedMin}, got ${first.accepted}`;
    }

    queue.enqueue({ blob: body });
    const second = await dequeueAsleepMessages({ queue, verifyOptions });
    if (second.rejected < vector.expect.secondRejectedMin) {
      return `second rejected: expected >= ${vector.expect.secondRejectedMin}, got ${second.rejected}`;
    }
    if (vector.expect.queueEmpty && queue.list().length !== 0) {
      return `queue not empty after sequence`;
    }
    return null;
  } finally {
    cleanupDir(dir);
  }
}

async function evaluateAsleepDequeueRestart(vector) {
  const dir = tempDir("atom-od-dq-restart-");
  try {
    const queueDir1 = path.join(dir, "asleep-inbox-1");
    const replayPath = path.join(dir, "replay-guard.json");
    const body = Buffer.from(JSON.stringify(vector.body));
    const verifyOptions = {
      allowedPurposes: vector.permittedPurposes,
      now: new Date(vector.wakeNow),
    };

    const queue1 = new AsleepQueueStore({ dirPath: queueDir1 });
    const replayStore1 = new ReplayGuardStore(new ReplayGuard(), replayPath);
    await replayStore1.load();
    verifyOptions.replay = replayStore1.guard;

    queue1.enqueue({ blob: body });
    const first = await dequeueAsleepMessages({ queue: queue1, verifyOptions });
    if (first.accepted < vector.expect.firstAcceptedMin) {
      return `first accepted: expected >= ${vector.expect.firstAcceptedMin}, got ${first.accepted}`;
    }
    await replayStore1.flush();

    const queueDir2 = path.join(dir, "asleep-inbox-2");
    const queue2 = new AsleepQueueStore({ dirPath: queueDir2 });
    const replayStore2 = new ReplayGuardStore(new ReplayGuard(), replayPath);
    await replayStore2.load();
    const verifyOptions2 = { ...verifyOptions, replay: replayStore2.guard };

    queue2.enqueue({ blob: body });
    const second = await dequeueAsleepMessages({ queue: queue2, verifyOptions: verifyOptions2 });
    if (second.rejected < vector.expect.secondRejectedMin) {
      return `second rejected after restart: expected >= ${vector.expect.secondRejectedMin}, got ${second.rejected}`;
    }
    return null;
  } finally {
    cleanupDir(dir);
  }
}

/** Hand-check against spec/extensions/offline-delivery-v1/schemas/agent-extension.json */
function validateOfflineDeliveryExtension(extension) {
  if (!extension || typeof extension !== "object") return false;
  if (extension.uri !== OFFLINE_DELIVERY_URI) return false;
  if (extension.required !== false) return false;
  if (typeof extension.description !== "string" || extension.description.length < 1) return false;
  const params = extension.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return false;
  const extra = Object.keys(params).filter((k) => k !== "mode");
  if (extra.length > 0) return false;
  if (params.mode !== "sleep" && params.mode !== "hourly_wake") return false;
  const topExtra = Object.keys(extension).filter(
    (k) => !["uri", "description", "required", "params"].includes(k),
  );
  if (topExtra.length > 0) return false;
  return true;
}

function evaluateAgentCardExtension(vector) {
  const ok = validateOfflineDeliveryExtension(vector.extension);
  if (ok !== vector.expect.schemaOk) {
    return `schemaOk: expected ${vector.expect.schemaOk}, got ${ok}`;
  }
  return null;
}

function evaluateAgentCardBuild(vector) {
  const opts = vector.buildOptions;
  for (const testCase of vector.cases) {
    const card = buildAtomAgentCard({
      ...opts,
      offlineDeliveryMode: testCase.offlineDeliveryMode,
    });
    const ext = card.capabilities?.extensions?.find((e) => e.uri === OFFLINE_DELIVERY_URI);
    if (testCase.expectExtension) {
      if (!ext) return `expected offline-delivery extension for mode ${testCase.offlineDeliveryMode}`;
      if (ext.params?.mode !== testCase.expectMode) {
        return `expected params.mode ${testCase.expectMode}, got ${ext.params?.mode}`;
      }
      if (!validateOfflineDeliveryExtension(ext)) {
        return "built extension failed schema hand-check";
      }
    } else if (ext) {
      return `expected no offline-delivery extension for always_on`;
    }
  }
  return null;
}

async function evaluateVector(vector) {
  switch (vector.kind) {
    case "reachability-verdict":
      return evaluateReachabilityVerdict(vector);
    case "asleep-http-response":
      return evaluateAsleepHttpResponse(vector);
    case "asleep-queue":
      return evaluateAsleepQueue(vector);
    case "asleep-dequeue":
      return evaluateAsleepDequeue(vector);
    case "asleep-dequeue-sequence":
      return evaluateAsleepDequeueSequence(vector);
    case "asleep-dequeue-restart":
      return evaluateAsleepDequeueRestart(vector);
    case "agent-card-extension":
      return evaluateAgentCardExtension(vector);
    case "agent-card-build":
      return evaluateAgentCardBuild(vector);
    default:
      return `unknown kind ${vector.kind}`;
  }
}

for (const file of files) {
  const vector = JSON.parse(readFileSync(join(VECTOR_DIR, file), "utf8"));
  try {
    const error = await evaluateVector(vector);
    if (error) fail(vector.id, error);
    else pass(vector.id);
  } catch (error) {
    fail(vector.id, error instanceof Error ? error.message : String(error));
  }
}

console.log(`\n${passed}/${files.length} vectors pass`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  ${f.id}: ${f.detail}`);
  }
  process.exit(1);
}
