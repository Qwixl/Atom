# Conformance — Transcript Accountability v1

## Normative checklist

1. Prerequisites present: signed application objects, per-sender continuity,
   host-stored objects, member reconcile (including `substituted`).
2. `room:receipt` purpose/schema/issuer as in SPEC; mint only after durable
   accept; idempotent retry returns stored receipt.
3. Sender verifies host DID + roomId + objectId + objectHash binds.
4. Receipts excluded from application fan-out purpose allowlist.
5. `room:checkpoint` purpose/schema/issuer as in SPEC; on-demand contiguous
   signed ranges only; ≤500 entries; remint conflict fails.
6. Checkpoints excluded from application fan-out purpose allowlist.
7. Compare **logic** (reference: `compareCheckpointToLocal`) emits only
   `agree` | `contradict` | `incomplete`. Public member compare API surfacing
   is out of this URI (RTP-01a).
8. Owner-facing copy does not claim host guilt from omission alone.
9. No claim of Deployed soak / split-view detection / franking-equivalence /
   MLS AppAck requirement.
10. Checkpoint JSON Schema treated as minimal shape; SPEC contiguity/length
    rules enforced in mint/verify code paths.

## Reference evidence (Atom)

| Claim | Evidence |
|---|---|
| Receipt mint + idempotent accept | `packages/agent-backend/src/roomInbound.test.ts` (+ accept path in PR #146) |
| Checkpoint mint + compare | `packages/agent-backend/src/roomCheckpoint.test.ts` |
| Substitution / omission reconcile | `roomsIntegrity.integration.test.ts` (RI-09; not receipt UI) |
| Owner copy: omission ≠ host guilt | `apps/shell/src/RoomVerificationBanner.tsx` (+ unit test) |

## Out of conformance for this URI

* Receipt-aware `/verification` UI (RTP-01a)
* Member checkpoint-compare API surfacing (RTP-01a)
* End-to-end member `GET /checkpoints` → compare integration (deferred with RTP-01a)
* Sender export packaging (RTP-01b)
* IANA registration
* Field soak metrics
