# Conformance test vectors

Machine-readable vectors for every normative MUST in
[`draft-chapman-a2a-mls`](../draft-chapman-a2a-mls-01.md) (working revision;
published Datatracker first submission remains [`-00`](../draft-chapman-a2a-mls-00.md)).
31 vectors, 10 accept
and 19 reject, in two groups: 22 covering the Governed Object and its processing
rules, and 9 covering the A2A v1.0 encapsulation.

```bash
node spec/vectors/generate.mjs   # regenerate (deterministic)
node spec/vectors/run.mjs        # check this repo's implementation against them
```

`run.mjs` exits non-zero on any disagreement.

## Why these exist

An implementer who wants to interoperate with Atom currently has one option: read our
TypeScript and infer our intent. Nobody adopts a protocol on those terms. These
vectors change the offer to "here is the document, here are the files, run them, and
if you pass you interoperate" — which is something an engineer can put in front of an
architecture review board.

They are also acceptance criteria for us. They were written from the specification
text rather than generated from `@qwixl/protocol`, precisely so they are capable of
disagreeing with it. They did: see below.

## Format

One JSON file per vector. Every vector has `id`, `kind`, `description`, and
`requires`, which names the draft sections that mandate the outcome.

| `kind` | Shape |
|---|---|
| `data-object` | One `object`, one `expect` |
| `data-object-sequence` | A `sequence` of steps, each with its own `expect`; state carries across steps |
| `credential-binding` | A `credentialIdentity` and a `leafSignatureKey` to compare |
| `encapsulation-part` | A `part` as wire JSON and a `readAs` media type the receiver seeks |

Other fields:

- `expect` — `accept` or `reject`
- `reason` — on rejection, which check must catch it: `signature-invalid`,
  `signature-not-by-issuer`, `expired`, `replay`, `purpose-not-permitted`,
  `credential-key-mismatch`, `media-type-conflict`, `media-type-not-matched`,
  `malformed`
- `now` — the instant at which to evaluate, so expiry tests are deterministic
- `permittedPurposes` — the receiver's configured allowlist for this context
- `canonicalForm` — for untampered vectors, the exact string that was signed

`canonicalForm` is the field to reach for first when a new implementation fails.
Canonicalisation and signing fail identically — an invalid signature — but a
byte-comparison against `canonicalForm` separates them immediately, which turns the
usual multi-hour debugging session into a diff.

## Identities

Two fixed Ed25519 keys derived from fixed seeds, so output is byte-stable and any diff
in the committed vectors means a real semantic change.

| | DID |
|---|---|
| Alice | `did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG` |
| Bob | `did:key:z6MknGc3ocHs3zdPiJbnaaqDi58NGb4pk1Sp9WxWufuXSdxf` |

Private seeds are in `generate.mjs`. They are test keys with no value; never use them
for anything.

## The encapsulation vectors are wire JSON

Vectors `070`–`078` hold the JSON a peer actually transmits, not any implementation's
internal representation of it. The A2A v1.0 types are generated from a protocol buffer
schema, so a generated implementation presents part content as a tagged union — and
that form never appears on the wire.

The distinction is not pedantry. It is invisible to a single implementation, which
writes and reads its own internal shape and always agrees with itself, and it surfaces
only when a second implementation in another language tries to interoperate from a
description. Atom's own public documentation described the internal shape as though it
were the wire format for the whole of the v1.0 migration, and nothing in the test suite
could have caught it.

These vectors are consumed twice, deliberately:

- `run.mjs` maps the wire JSON to the internal form with **its own** hand-written
  mapping, so a runner cannot fail to notice the implementation misreading the wire.
- `packages/a2a-transport/src/encapsulation.vectors.test.ts` runs the same files
  through the **real** SDK deserialiser, which is what handles every live inbound
  message.

Neither alone is sufficient: the first would not catch the SDK diverging from the spec,
and the second could not catch our codec and our understanding of the wire being wrong
in the same direction.

## What passing currently means, precisely

All 31 vectors pass against shipped library code.

**Verified in `@qwixl/protocol`.** Canonicalisation including key ordering, non-ASCII
keys, nested objects and array order; Ed25519 signing and verification; detection of
tampered payload, purpose and expiry; `did:key` derivation without network resolution;
expiry by TTL, by absolute timestamp, and by the earlier of the two; purpose
allowlisting; structural rejection of bad version, bad algorithm, missing purpose
and non-`did:key` issuers; **replay rejection** via `ReplayGuard` on
`(issuerDid, id)`; and **credential binding** via `assertCredentialBinding` /
`credentialBindingHolds`.

**Verified in `@qwixl/mls-session`.** KeyPackages are generated with
`generateKeyPackageWithKey` so the LeafNode signature key is the Agent Identity
key, and inbound KeyPackages are rejected unless the credential identity matches
that leaf key (and the expected peer DID when one is supplied).

**Verified in `@qwixl/a2a-transport`.** Encapsulation part media-type placement,
including rejection of conflicting `mediaType` members.

## What the vectors caught

Twice now, a vector written from the specification has disagreed with the
implementation and been right.

### `073-part-media-type-conflict`

A part declaring one media type in its `mediaType` member and a *different* one inside
its `data` object was **accepted**. `readAtomDataPart` matched on the part member and
never compared it to the envelope key.

The consequence is worse than a parsing nicety. A receiver reading the part member and
a receiver reading the envelope key resolve identical bytes to different media types, so
the same message is a data object to one peer and MLS wire to another. Both behaviours
were reachable on the network at once — the envelope key exists precisely because peers
and modules read it — which means a sender could decide which of two receivers acted on
a payload by disagreeing with itself about what the payload was.

The fix rejects the part outright rather than preferring either member, in
`packages/a2a-transport/src/dataPart.ts`. The draft now requires that rejection
explicitly, in the Media Type Placement section.

### `023-expiry-earlier-of-both-wins-ttl`

Failed on first run of the original suite.

`resolveExpiry` returned `expiresAt` whenever it was present and never compared it to
the TTL. So an object with `ttlSeconds: 60` and an `expiresAt` a year out was treated
as valid for a year. A sender could extend any short-lived object's life indefinitely
by adding a second, generous expiry field — and because the governance block is inside
the signature, this looked entirely legitimate to every other check.

It was fixed in `packages/protocol/src/governance.ts`, which now takes the earlier of
the two candidates, with unit tests in `protocol.test.ts` covering both directions so
the fix does not depend on the vectors to stay fixed.

The mirror vector `022` passed before the fix, which is what made the bug survive: the
obvious test case was the one the code happened to get right.

## Second implementation

A minimal Python codec that consumes the same wire JSON lives in
[`../second-impl/`](../second-impl/). Run `python3 spec/second-impl/run_vectors.py`
after regenerating or editing encapsulation vectors. Adversarial mutations that
must reject are in [`../hostile/`](../hostile/).
