# Compatibility — Transcript Accountability v1

## Relationship to MIMI

This profile is **complementary hub-accountability** for a single-host room.
It is not a drop-in MIMI franking or audit-layer substitute.

| Concern | MIMI | This profile |
|---|---|---|
| Topology | Hub + follower providers | Single host + member agents |
| Franking | Abuse-report context stamp; hub MAY frank without member plaintext | Receipt = host accepted `objectHash@seq`; Atom hosts often held plaintext — **not franking-equivalent** |
| AppAck | MLS Proposal of seen range | Checkpoint compare + sender receipts; **MUST NOT** require MLS Proposal AppAck |
| Audit layer (`draft-burger-mimi-audit-layer-00`) | Client Merkle proofs + probabilistic broadcast for hub equivocation | **Does not solve** that problem; flat checkpoints are not a substitute |
| Drop / reorder | Franking insufficient; audit-layer unimplemented | Attribution **only** with held evidence (SPEC actors table) |

## Checkpoint shape

v1 uses a **flat signed list** (≤500 entries), matching Atom RI-06 as-built.
An optional Merkle root MAY appear in a later profile URI; it is not required
here.

## Wire purpose strings

Purpose strings `room:receipt` and `room:checkpoint` are Atom as-built.
IANA registration is a separate standards item and is **not** claimed by this
local profile.
