# A2A Extension: Governed Object (Data Object) v1

**Status:** Candidate (repository-hosted; Class D external announcement pending)  
**Identifier:** `https://atom.qwixl.dev/a2a/data-object/v1`  
**Media type:** `application/vnd.atom.data-object+json;version=1`

## Abstract

This document specifies the Atom Governed Object (GO) profile as an A2A
protocol extension. A Governed Object is a signed, purpose-bound, optionally
expiring JSON envelope carried in A2A message data parts. Adopters of this
extension are not required to implement MLS, rooms, or Atom transport
authentication.

## Document location

This specification is published in the Atom repository under
`spec/extensions/data-object-v1/`. The extension identifier is a stable URI.
HTTP resolution at `atom.qwixl.dev` for that path MAY redirect or serve this
document in the future; the identifier itself does not change when resolution
changes.

## Terminology

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this
document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when,
they appear in all capitals.

**Governed Object (GO):** the signed JSON envelope defined in §Governed Object
Structure.  
**Relying Receiver:** an implementation that accepts a Governed Object and acts
upon its payload.  
**GO part:** an A2A message part whose authoritative media type is
`application/vnd.atom.data-object+json;version=1`.

## Extension identifier

```
https://atom.qwixl.dev/a2a/data-object/v1
```

A breaking change to the wire contract of this extension MUST use a new URI
(typically a new path segment such as `/v2`). Non-breaking clarifications MAY
revise this document in place under the same URI.

## Agent Card declaration

An agent that supports this extension MUST declare it in
`capabilities.extensions` of its Agent Card:

| Field | Value |
|---|---|
| `uri` | `https://atom.qwixl.dev/a2a/data-object/v1` |
| `required` | `false` |
| `params` | omitted / absent (no GO parameters are defined) |
| `description` | A short human-readable string (implementations MAY choose wording) |

Example:

```json
{
  "uri": "https://atom.qwixl.dev/a2a/data-object/v1",
  "description": "Signed Governed Objects carried in A2A data parts",
  "required": false
}
```

Because `required` is `false`, a peer that does not declare the extension URI
MUST still be able to exchange messages with the agent for other capabilities.
Refusal based solely on absence of this URI from a client's extension
declaration MUST NOT occur for this extension.

See [schemas/agent-extension.json](./schemas/agent-extension.json).

## Media type (authoritative)

A GO part is identified by the media type:

```
application/vnd.atom.data-object+json;version=1
```

The media type is authoritative for identifying and verifying GO content.
Receivers MUST NOT rely on `message.extensions` or the HTTP `A2A-Extensions`
header to decide whether a part is a Governed Object or whether to apply GO
verification.

Encapsulation of GO parts in A2A wire JSON (placement of `mediaType` on the
part and optionally inside `data`) follows the same rules as
[draft-chapman-a2a-mls-01](../../draft-chapman-a2a-mls-01.md) §Encapsulation /
Media Type Placement. Conformance vectors `070`–`078` in `spec/vectors/` cover
that placement for GO and related part kinds.

## message.extensions

When an A2A message carries one or more GO parts, the sender SHOULD list
`https://atom.qwixl.dev/a2a/data-object/v1` in the message's `extensions`
member.

When an A2A message carries only MLS wire or MLS handshake parts (and no GO
parts), the sender MUST NOT include the GO extension URI in `extensions`.
Such messages MAY use an empty `extensions` array or omit the member where the
binding allows.

The reference implementation's `atomMessage()` helper stamps the GO URI by
default for convenience (including non-GO text acknowledgements). MLS send
helpers explicitly disable that stamp. Conforming senders other than the
reference may omit the URI on non-GO messages; they MUST still honour the
MLS-only MUST NOT above.

<!-- Editor's note: the MLS-only prohibition is the deployment choice recorded
internally as D130 "Option A". It is not a normative dependency on Atom's
decisions log. -->

Receivers MUST NOT require `message.extensions` to be present or to contain the
GO URI in order to accept or verify a GO part. Absence of the member (for
example on A2A v0.3 peers) MUST NOT weaken GO verification.

## HTTP A2A-Extensions header

Clients speaking A2A over HTTP SHOULD send the `A2A-Extensions` request header
listing extension URIs they use for the request, including this extension's URI
when the request carries or expects GO parts.

Servers SHOULD observe the header for telemetry and for enforcing *other*
extensions marked `required: true` on the Agent Card. Missing
`A2A-Extensions` MUST NOT weaken GO verification (signature, expiry, replay, or
configured purpose checks).

A server MUST refuse a client for undeclared required extensions only when the
Agent Card marks those extensions with `required: true`. This GO extension
remains `required: false`; absence of its URI from `A2A-Extensions` alone MUST
NOT cause refusal.

## Governed Object structure

A Governed Object is a JSON object ([RFC 8259](https://www.rfc-editor.org/rfc/rfc8259))
with the following members. All listed members are mandatory unless stated
otherwise.

| Member | Type | Description |
|---|---|---|
| `version` | number | Format version. MUST be `1` for this specification. |
| `id` | string | Unique object identifier. MUST be unique per issuer. |
| `issuerDid` | string | Agent identity of the signer (`did:key` for this profile). |
| `issuedAt` | string | Issuance time, RFC 3339 date-time in UTC. |
| `semantic` | object | Type descriptor; MUST contain `schema` (absolute URI). MAY contain `version` and `embeddingHint`. |
| `payload` | object | Application data. |
| `governance` | object | Use constraints; see below. |
| `signatureAlgorithm` | string | MUST be `"ed25519"`. |
| `signature` | string | Base64 ([RFC 4648](https://www.rfc-editor.org/rfc/rfc4648)) Ed25519 signature. |

### governance

| Member | Type | Description |
|---|---|---|
| `purpose` | string | Mandatory. Declared use for the payload. |
| `ttlSeconds` | number | OPTIONAL. Lifetime in seconds from `issuedAt`. |
| `expiresAt` | string | OPTIONAL. Absolute expiry, RFC 3339 date-time. |

If both `ttlSeconds` and `expiresAt` are present, the earlier resulting instant
is the effective expiry. If neither is present, the object does not declare an
expiry; receivers MAY apply a locally configured maximum lifetime.

See [schemas/governed-object.json](./schemas/governed-object.json).

### Canonicalisation and signing

The signature is computed over a canonical serialisation of the object
excluding `signatureAlgorithm` and `signature`. Canonical form and Ed25519
signing match
[draft-chapman-a2a-mls-03](../../draft-chapman-a2a-mls-03.md) §Canonical
Serialisation and Signing: implementations SHOULD use
[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JCS); absent a JCS library
they MUST still apply the deterministic key-order / no-whitespace profile
described there. The Atom reference stack uses `stableStringify` until a
dedicated JCS library lands.

## Receiver requirements

On receiving a Governed Object (unencrypted GO part), a Relying Receiver MUST:

1. Validate structure against this specification.
2. Verify the Ed25519 signature under the public key derived from `issuerDid`.
3. Evaluate expiry; reject if expired.
4. Reject live replays: reject an object whose `(issuerDid, id)` pair was
   previously accepted (retain pairs at least for the maximum accepted
   lifetime).
5. When a purpose allowlist is configured for the processing context, reject
   objects whose `governance.purpose` is not in that set.

Only after these checks succeed MAY the receiver act upon `payload`.

### Deployment-profile delta: purpose allowlist

Stricter profiles (including the Internet-Draft's purpose-enforcement language)
require a configured permitted-purpose set per context. This GO extension
documents an honest deployment-profile delta: an empty or absent allowlist MAY
accept any purpose. Profiles that need purpose limitation SHOULD configure
explicit allowlists. Absence of an allowlist MUST NOT be treated as "allow
whatever the sender prefers" in security-sensitive deployments without an
explicit local policy decision.

IANA registration of a purpose value (see Internet-Draft
`draft-chapman-a2a-mls` Purpose Value Registry, from `-02`) **SHOULD** be used
as an informative shared vocabulary for high-consequence purposes. Registration
**MUST NOT** be treated as (i) permission to process, (ii) default allowlist
membership, or (iii) authorisation for side effects. Empty/absent allowlist
deployments remain a local profile choice and do not imply cross-implementation
purpose alignment.

## Relationship to Part.data / encapsulation

GO parts use A2A `data` parts. On the wire, the part is JSON with `mediaType`
set to the GO media type and `data` containing at least `object` (the Governed
Object) and, typically, a matching inner `mediaType`. See examples under
[examples/](./examples/) and encapsulation vectors `070`–`078` in
`spec/vectors/`.

## Out of scope

The following are **not** part of this extension:

- MLS sessions, KeyPackages, wire or handshake parts
- Rooms / multi-party group application semantics beyond what GO payloads encode
- Transport authentication (including Atom DID Bearer)
- Settlement or payment rails
- Identity registries or DID methods other than key material carried in
  `did:key` for signature verification

MLS may be published later under a separate extension URI. GO adopters are not
required to implement MLS.

## Versioning

- Breaking wire or semantic changes ⇒ new extension URI.
- Clarifications and non-breaking errata ⇒ same URI, revised document.

## Conformance, security, compatibility

- [conformance.md](./conformance.md)
- [security.md](./security.md)
- [compatibility.md](./compatibility.md)

## Provenance

Structure, canonicalisation, signing, and receiver processing for Governed
Objects were first specified in the combined GO+MLS Internet-Draft:

- [draft-chapman-a2a-mls-01](../../draft-chapman-a2a-mls-01.md)

This extension publishes the GO-only A2A binding for self-service A2A extension
adoption. Where this document and the draft both normatively address the same
GO check, they are intended to agree; file issues against the repository if they
diverge.
