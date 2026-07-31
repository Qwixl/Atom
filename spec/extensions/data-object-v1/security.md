# Security considerations — Governed Object v1

This document accompanies
[SPEC.md](./SPEC.md) (`https://atom.qwixl.dev/a2a/data-object/v1`).

## What this extension provides

- **Authenticity and integrity** of the envelope via Ed25519 signatures bound
  to `issuerDid` (`did:key`).
- **Replay resistance** when receivers retain accepted `(issuerDid, id)` pairs.
- **Expiry** when `governance.ttlSeconds` and/or `governance.expiresAt` are set
  and enforced.
- **Purpose binding as signed metadata**, enforceable when the receiver
  configures an allowlist.

Unencrypted GO carriage does **not** provide confidentiality. Do not use
unencrypted GO parts for personal or otherwise confidential payloads when a
confidential channel is available.

## What it does not provide

- **Purpose limitation is not cryptographically enforced.** A receiver that
  accepts the object can ignore declared purpose and expiry. The signature
  makes misuse attributable; it does not prevent misuse.
- **Transport authentication** is out of scope. HTTP endpoints still need an
  independent auth profile (for example Atom DID Bearer). Missing or present
  `A2A-Extensions` is not a GO security control.
- **MLS credential binding** (matching `issuerDid` to the MLS sender) is out of
  scope for this GO-only extension. When GO payloads arrive inside MLS, apply
  the session draft's binding checks separately.
- **A DID is not a legal identity.** Binding `did:key` to a person or
  organisation requires layers above this extension.

## Downgrade and omission

Omitting `message.extensions` or the HTTP `A2A-Extensions` header MUST NOT
skip signature, expiry, replay, or configured purpose verification for GO
parts. The media type identifies the part; verification is mandatory for
conforming receivers.

## Purpose allowlist deployments

An empty or absent allowlist MAY accept any purpose under this extension's
documented deployment-profile delta. That choice weakens purpose limitation.
Security-sensitive deployments SHOULD configure explicit allowlists.

## Rejection diagnostics

Receivers SHOULD distinguish rejection causes for operators, and SHOULD NOT
expose fine-grained reasons to senders beyond what interoperability requires,
to avoid assisting allowlist enumeration.
