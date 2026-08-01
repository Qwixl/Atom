# Offline delivery conformance vectors

Machine-readable vectors for
[`draft-chapman-a2a-offline-delivery-00`](../../draft-chapman-a2a-offline-delivery-00.md)
(reachability verdicts, asleep HTTP middleware, queue caps, dequeue validation,
replay persistence, and ST-04c Agent Card extension fixtures).

```bash
pnpm build:packages   # or filter protocol, a2a-transport, agent-backend
node spec/vectors/offline-delivery/generate.mjs
node spec/vectors/offline-delivery/run.mjs
```

`run.mjs` exits non-zero on any disagreement.

## D110 independence

`generate.mjs` **must not** import any `@qwixl/*` package. Governed Object signing and
FNV-1a wake-seed jitter are duplicated from the specification text (same algorithm as
`packages/agent-backend/src/reachability.ts` `hourlyWakeMinute`).

`run.mjs` imports built packages from `packages/*/dist/` after `pnpm build:packages`.
Third parties may point the runner at their own build output.

## Wake-seed algorithm

Hourly wake uses FNV-1a 32-bit over the UTF-16 code units of `wakeSeed`, then
`hash % 60` for the UTC minute. The agent is reachable for five consecutive UTC
minutes starting at that minute. All hourly_wake vectors use `wakeSeed`:
`"wake-vector-seed"` (see `manifest.json` for the derived minute and example instants).

## Vector kinds

| `kind` | Exercises |
|---|---|
| `reachability-verdict` | `evaluateInboundReachability` |
| `asleep-http-response` | `createInboundReachabilityMiddleware` + real `AsleepQueueStore` where caps matter |
| `asleep-queue` | `AsleepQueueStore` enqueue, persistence, caps, TTL |
| `asleep-dequeue` | `dequeueAsleepMessages` + `verifyDataObject` |
| `asleep-dequeue-sequence` | Same-process replay through dequeue |
| `asleep-dequeue-restart` | `ReplayGuardStore` flush/load across queue restart (`od-060`) |
| `agent-card-extension` | Hand-check against `agent-extension.json` (no AJV) |
| `agent-card-build` | `buildAtomAgentCard` + `ATOM_OFFLINE_DELIVERY_EXTENSION` |

## Deferred / out of scope

- JSON-RPC error code `-32003` for asleep responses (not emitted by reference middleware today).
- ASLEEP-persist TOCTOU between verdict and enqueue (documented; not vectorised).
- Transport-auth signing vectors beyond `atomCallerDid` presence (see founder gate 3B scope).

## Related

- Governed Object vectors: [`../README.md`](../README.md)
- Extension card rules: [`../../extensions/offline-delivery-v1/conformance.md`](../../extensions/offline-delivery-v1/conformance.md)
