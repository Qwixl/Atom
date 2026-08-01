# Transcript Accountability Profile v1

**Status:** Local (Atom reference)  
**Identifier:** `https://atom.qwixl.dev/profiles/transcript-accountability/v1`  
**Decision:** RTP-01

## Abstract

This profile specifies the smallest MLS-compatible accountability surface for
a **single-host room**: host-signed acceptance receipts for senders, and
on-demand flat signed checkpoints for ordering claims. It delivers
**attributability where a party holds evidence**. It does not detect split-view
equivocation without out-of-band gossip, and it does not require MLS Proposal
AppAck or Merkle inclusion proofs.

## Terminology

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this
document are to be interpreted as described in RFC 2119 and RFC 8174 when, and
only when, they appear in all capitals.

## Profile identifier

```
https://atom.qwixl.dev/profiles/transcript-accountability/v1
```

A breaking change to normative semantics MUST use a new URI. Clarifications
MAY revise this document under the same URI.

## Actors

| Actor | Evidence held | Permitted conclusions |
|---|---|---|
| **Sender** | Verified `room:receipt` | Host non-repudiably accepted `objectHash` at `seq` |
| **Sender** | Receipt + covering checkpoint compare | Host ordering/accept claim vs local evidence (`agree` / `contradict` / `incomplete`) |
| **Member** | Fan-out + local reconcile of served history | `verified` / `substituted` / `omitted` / … — **omission is visible, not host-attributed** |
| **Member** | Verified checkpoint + **served local objects** | `agree` / `contradict` / `incomplete`; **`incomplete` is not host guilt** |
| **Sender** | Own receipts covering seqs in a checkpoint | Same compare set; receipts do **not** travel with member fan-out by default |
| **Third party** | Only if a party exports receipts/checkpoints | Dispute resolution outside the live UI |

A member MUST NOT treat another sender's drop as host guilt without that
sender's exported receipt.

## Prerequisites

An implementation of this profile MUST also implement:

1. Signed application objects for room messages (Governed Object / DataObject).
2. Per-sender hash continuity (chain counter `n` / `prevHash`).
3. Host-stored signed objects so history is verifiable without live fan-out alone.
4. Member-side reconcile of what the host serves versus what was signed
   (substitution detection independent of receipts).

## Host acceptance receipts (`room:receipt`)

### Purpose and schema

| Field | Value |
|---|---|
| `governance.purpose` | `room:receipt` |
| `semantic.schema` | `https://atom.qwixl.dev/schema/RoomReceipt` |
| Issuer DID | Room **host** |

### Payload

| Field | Type | Constraint |
|---|---|---|
| `roomId` | string | Non-empty; MUST match the room |
| `objectId` | string | Non-empty; admitted object id |
| `objectHash` | string | Chain hash of the admitted signed object |
| `seq` | integer | Host-assigned transcript sequence (≥ 1) |
| `acceptedAt` | string | ISO-8601 timestamp of durable accept |

### Mint rules

* A host MAY mint a receipt only **after** durable accept of the object
  (append + durable flush completed).
* Idempotent retry of the same accept MUST return the stored receipt without a
  second append when the acceptance index still holds it.
* Receipts MUST NOT be required on the application-object fan-out allowlist
  used to verify `room:message` / activity / mutation / moderation /
  member-update objects. Delivery of receipts is **out-of-band** relative to
  that allowlist (HTTP accept / relay response to the sender).

### Sender rules

* A sender that receives a receipt MUST verify: host DID, `roomId`,
  `objectId`, and `objectHash` bind to the object it sent.
* A sender SHOULD retain verified receipts for at least the local dispute
  window (see Retention).
* Absence of a receipt MUST NOT be presented as proof of host guilt (the
  sender may have failed to obtain or retain it).

## Transcript checkpoints (`room:checkpoint`)

### Purpose and schema

| Field | Value |
|---|---|
| `governance.purpose` | `room:checkpoint` |
| `semantic.schema` | `https://atom.qwixl.dev/schema/RoomCheckpoint` |
| Issuer DID | Room **host** |

### Payload

| Field | Type | Constraint |
|---|---|---|
| `roomId` | string | Non-empty |
| `fromSeq` | integer | Inclusive start (≥ 1) |
| `toSeq` | integer | Inclusive end (≥ `fromSeq`) |
| `entries` | array | Length = `toSeq - fromSeq + 1`; ≤ 500 |

Each entry:

| Field | Type | Constraint |
|---|---|---|
| `seq` | integer | Contiguous from `fromSeq` to `toSeq` |
| `objectHash` | string | Chain hash of the signed object at that seq |

### Mint rules

* A host MAY mint a checkpoint **on demand** over a contiguous inclusive range
  where **every** seq has a signed application object. Unsigned leave/ban rows
  MUST sit outside the minted range (mint adjacent ranges instead).
* Implementations MUST NOT require periodic checkpoint publication.
* Idempotent remint of the same range with identical hashes MUST return the
  stored checkpoint. Conflicting remint MUST fail.
* Checkpoints MUST NOT be required on the application-object fan-out
  allowlist. Members obtain them via out-of-band list/fetch APIs.

### Compare verdicts

Given a verified checkpoint and local evidence in range (served objects for
members; a sender MAY also use **its own** receipts), a verifier MUST emit
exactly one of:

| Verdict | Meaning |
|---|---|
| `agree` | Every seq in range is covered by local hash or receipt, and hashes match |
| `contradict` | At least one covered seq disagrees on `objectHash` |
| `incomplete` | At least one seq lacks local/receipt coverage (and no contradict) |

Overlapping checkpoints that disagree on any shared `(seq, objectHash)` MUST
be treated as `contradict` for that overlap.

## Retention and dispute window

Evidence is **bounded**. Implementations SHOULD document:

* Sender receipt retention (reference: on the order of hundreds of recent
  accepts).
* Host acceptance index retention (same order).
* Checkpoint retention (reference: dozens of recent mints).
* Object governance TTL (reference: ~14 days default).

Historical verification of archived objects SHOULD use verify-as-of the
object's own `issuedAt` (Governed Object TTL semantics), not “still within
live TTL now”.

Past retention roll-off, parties MUST treat missing evidence as
`incomplete`, not as host guilt.

JSON Schema under `schemas/` is **minimal shape only**. Contiguity,
`entries.length === toSeq - fromSeq + 1`, and related mint rules in this
section are normative and MUST be enforced by implementers beyond schema
validation.

## MUST / MUST NOT summary

### MUST

1. Implement prerequisites (signed objects, per-sender continuity, stored
   objects, member reconcile).
2. Allow host mint of `room:receipt` after durable accept; enable senders to
   verify binds.
3. Allow host on-demand mint of flat `room:checkpoint` over contiguous signed
   ranges; use only `agree` / `contradict` / `incomplete`.
4. Deliver receipts and checkpoints out-of-band relative to application
   fan-out purposes.
5. Use the actor model above for normative claims.

### MUST NOT

* Require Merkle roots, gossip, or MLS Proposal AppAck for conformance to
  this profile.
* Claim owner-UI host guilt from omission alone.
* Claim Deployed / field-validated scale for this profile text.
* Register `room:receipt` / `room:checkpoint` with IANA as part of this
  profile revision (separate standards item).
* Imply periodic checkpoint publication.
* Claim franking-equivalence with MIMI hub franking, or claim to solve
  hub equivocation addressed by `draft-burger-mimi-audit-layer`.

## Non-normative Atom roadmap

The following are **not** required by this profile URI:

* Receipt-aware owner `/verification` UI
* Member-initiated checkpoint compare API surfacing
* Sender receipt export packaging for third-party disputes
* Production soak metrics
* Gossip / audit-layer equivalent

## Security considerations

See [security.md](./security.md).

## Compatibility

See [compatibility.md](./compatibility.md).
