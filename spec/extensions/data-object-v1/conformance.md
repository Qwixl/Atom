# Conformance — Governed Object v1

## Primary corpus

Machine-readable conformance for Governed Object structure, processing, and A2A
encapsulation lives in:

- [`spec/vectors/`](../../vectors/) — **31** vectors (Governed Object +
  encapsulation, including media-type placement `070`–`078`)

Run against the TypeScript reference stack:

```bash
node spec/vectors/run.mjs
```

## Second implementation

A minimal Python second implementation verifies the same vector files
(GO verification and encapsulation), independent of TypeScript:

- [`spec/second-impl/`](../../second-impl/)

```bash
python3 -m pip install -r spec/second-impl/requirements.txt
python3 spec/second-impl/run_vectors.py
```

## Hostile suite

Adversarial encapsulation mutations that MUST reject:

- [`spec/hostile/`](../../hostile/)

```bash
python3 spec/hostile/run_hostile.py
```

## Coverage honesty

| Area | Covered by |
|---|---|
| GO structure, signature, expiry, replay, purpose (when allowlisted), encapsulation media-type placement | `spec/vectors` (31); Python `second-impl`; TypeScript protocol / a2a-transport runners |
| Hostile encapsulation mutations | `spec/hostile` |
| GO URI stamp on messages; MLS-only messages without GO URI; `A2A-Extensions` parse/format; observe-without-weaken; required-extension refusal | TypeScript `packages/a2a-transport/src/a2aExtensions.test.ts` |

**Honest gap:** the Python second implementation covers GO verification and
encapsulation vectors. It does **not** exercise HTTP `A2A-Extensions` header
negotiation. That behaviour is covered by the TypeScript suite above
(`a2aExtensions.test.ts`), not by `spec/vectors`.

Passing the 31 vectors demonstrates GO and encapsulation interoperability. It
does not alone prove A2A extension header or message-stamp policy conformance;
use the TypeScript tests (or an equivalent harness) for that slice.
