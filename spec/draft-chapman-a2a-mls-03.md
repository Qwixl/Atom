---
title: "End-to-End Encryption and Purpose-Bound Governance for Agent-to-Agent Messaging"
abbrev: "Confidential Agent Messaging"
docname: draft-chapman-a2a-mls-03
category: exp
submissionType: independent

ipr: trust200902
area: Security
workgroup: Independent Submission
keyword:
 - MLS
 - agent
 - end-to-end encryption
 - data minimisation
 - A2A

stand_alone: yes
smart_quotes: no
pi: [toc, sortrefs, symrefs]

author:
 -
    ins: L. D. Chapman
    name: Luke Daniel Chapman
    organization: Qwixl
    email: luke.chapman@qwixl.com

normative:
  RFC2119:
  RFC8174:
  RFC9420:
  RFC8032:
  RFC8259:
  RFC4648:
  RFC8126:
  RFC8785:

informative:
  RFC7942:
  A2A:
    title: "Agent2Agent (A2A) Protocol Specification, Version 1.0"
    target: https://a2a-protocol.org/
    author:
      - org: "A2A Project (Linux Foundation)"
    date: 2026
  DIDKEY:
    title: "The did:key Method"
    target: https://w3c-ccg.github.io/did-method-key/
    author:
      - org: "W3C Credentials Community Group"
  MCP:
    title: "Model Context Protocol"
    target: https://modelcontextprotocol.io/
    author:
      - org: "Anthropic"
  GDPR:
    title: "Regulation (EU) 2016/679 (General Data Protection Regulation)"
    target: https://eur-lex.europa.eu/eli/reg/2016/679/oj
    author:
      - org: "European Union"
    date: 2016

--- abstract

Agent-to-agent protocols increasingly carry messages between autonomous software
agents acting on behalf of distinct principals, including across organisational
boundaries. Existing protocols in this space secure the transport hop and
authenticate the calling party, but do not provide message-level
confidentiality, do not provide non-repudiable evidence of what a counterparty
asserted, and do not carry machine-enforceable constraints on how a recipient
may use the data conveyed.

This document specifies a profile that addresses those three gaps. It defines a
Governed Object: a signed, purpose-bound, expiring message envelope identified
by a decentralised identifier. It specifies how such objects are exchanged
inside end-to-end encrypted sessions established using the Messaging Layer
Security (MLS) protocol {{RFC9420}}, and how the MLS credential is
cryptographically bound to the sending agent's identity. It defines the
encapsulation of these constructs as an extension to an agent-to-agent
transport, using the Agent2Agent (A2A) protocol {{A2A}} as the reference
binding, and specifies mandatory receiver-side processing rules including
replay rejection and purpose enforcement.

--- middle

# Introduction

## Problem Statement

Deployments of agent-to-agent messaging are moving from single-organisation
orchestration towards interactions between agents that represent different
principals: a person and a business, two businesses, or a citizen and a public
body. Three properties that are routinely required in such interactions are not
provided by the agent-to-agent protocols currently in use.

Confidentiality against intermediaries.
: Current practice secures the transport hop, typically with TLS, and
  authenticates the caller, typically with OAuth 2.0, OpenID Connect, or mutual
  TLS. Any intermediary that terminates TLS -- a gateway, a broker, a hosting
  provider, or the platform operating either agent -- can read the full message
  content. Where the two principals are mutually independent and the message
  content is confidential, commercially sensitive, or personal data, transport
  security is insufficient.

Non-repudiable assertion.
: A recipient frequently needs durable evidence of what the counterparty's
  agent asserted, and needs it to remain verifiable after the session has
  ended, after key rotation, and independently of any log held by an
  intermediary. Transport-level authentication does not produce such evidence,
  because it authenticates a connection rather than a statement.

Machine-enforceable use constraints.
: When an agent discloses data to a counterparty, the disclosing principal
  frequently intends the disclosure to be limited: to a stated purpose, and for
  a bounded period. Today that intent, if expressed at all, is expressed in
  prose outside the protocol and is therefore not available to the receiving
  implementation at the moment of processing.

These are not hypothetical requirements. In several jurisdictions the second and
third are closely related to statutory obligations; see {{regulatory}}.

## Scope

This document specifies:

* a signed message envelope, the Governed Object, carrying a semantic type, a
  payload, a declared purpose, and an expiry ({{governed-object}});
* an agent identity scheme based on Ed25519 {{RFC8032}} decentralised
  identifiers, and a mandatory cryptographic binding between that identity and
  the agent's MLS credential ({{identity}});
* establishment of MLS {{RFC9420}} sessions between agents, including
  publication and retrieval of MLS KeyPackages ({{sessions}});
* encapsulation of MLS wire messages and Governed Objects as an extension to an
  agent-to-agent transport, with A2A {{A2A}} as the reference binding
  ({{encapsulation}});
* mandatory receiver-side processing rules, including signature verification,
  expiry rejection, replay rejection, and purpose enforcement
  ({{processing}}).

## Non-Goals

This document does not:

* define a new agent-to-agent transport, discovery mechanism, or capability
  description format; it layers on an existing one;
* define agent tool invocation or local resource access, for which the Model
  Context Protocol {{MCP}} and comparable mechanisms are used;
* provide cryptographic enforcement of purpose limitation. The purpose field is
  signed, tamper-evident, and mandatory to enforce at the receiver, but a
  non-conforming receiver that has decrypted a message can disregard it. This
  is a deliberate limitation, discussed in {{security}};
* specify authorisation policy, business semantics, or user interface
  behaviour;
* specify how a decentralised identifier is bound to a legal or natural
  identity. That binding, where required, is provided by credential
  presentation layered above this specification and is out of scope.

## Relationship to Existing Work

MLS {{RFC9420}} provides the group key establishment and message protection
used here. This document does not modify MLS. It specifies a ciphersuite
constraint, a credential-binding requirement, and a transport encapsulation.

A2A {{A2A}} provides agent discovery, capability description, and message
transport. A2A version 1.0 supports declared protocol extensions, and this
document is specified as such an extension; {{protocol-version}} states the
version this binding targets. Nothing here requires changes to A2A itself.

The mechanism is transport-agnostic in principle. A2A is used as the reference
binding because it is widely deployed and because its extension mechanism makes
the binding expressible without protocol changes.

# Conventions and Terminology

{::boilerplate bcp14-tagged}

Agent:
: A software process that sends and receives messages on behalf of a principal.

Principal:
: The natural person, legal person, or organisation on whose behalf an agent
  acts.

Agent Identity:
: A `did:key` identifier {{DIDKEY}} encoding an Ed25519 public key, used to
  identify an agent and to verify its signatures.

Governed Object:
: The signed message envelope specified in {{governed-object}}.

Purpose:
: A short string in a Governed Object declaring the use for which the payload is
  disclosed.

Relying Receiver:
: An implementation that accepts a Governed Object and acts upon its payload.

# Architecture Overview

Two agents, each holding an Ed25519 key pair, establish an MLS group containing
exactly two members (a pair session) or more than two members (a group
session). Application messages within that group carry Governed Objects
serialised as JSON {{RFC8259}}.

The MLS wire bytes are carried inside the agent-to-agent transport as opaque
data. The transport therefore learns the identity of the endpoints and the size
and timing of messages, but not the content.

~~~
  Principal A                                     Principal B
      |                                                 |
  +---v-----------+                             +-------v-------+
  |   Agent A     |                             |   Agent B     |
  |               |                             |               |
  | Ed25519 key   |                             | Ed25519 key   |
  | did:key:zA..  |                             | did:key:zB..  |
  +---+-----------+                             +-----------+---+
      |                                                     |
      |  (1) retrieve KeyPackage                            |
      |---------------------------------------------------->|
      |  (2) MLS Welcome + ratchet tree                     |
      |---------------------------------------------------->|
      |                                                     |
      |  (3) MLS application message                        |
      |      = AEAD( JSON( GovernedObject ) )               |
      |<--------------------------------------------------->|
      |                                                     |
   +--+-----------------------------------------------------+--+
   |          agent-to-agent transport (e.g. A2A over HTTPS)   |
   |          sees: endpoints, size, timing. not: content      |
   +----------------------------------------------------------+
~~~
{: #fig-arch title="Confidential agent messaging"}

# Agent Identity {#identity}

## Identifier Construction

An Agent Identity is a `did:key` identifier {{DIDKEY}} encoding an Ed25519
public key. The identifier is the string `did:key:` followed by the multibase
base58btc encoding (prefix `z`) of the multicodec `ed25519-pub` header
(`0xed 0x01`) concatenated with the 32-byte public key.

Verifiers MUST derive the public key from the identifier itself. Conforming
implementations MUST NOT require network resolution of the identifier in order
to verify a signature. This property is required so that a Governed Object
remains verifiable offline and after the issuer's service has ceased to
operate.

Implementations MAY support additional DID methods. Implementations MUST support
`did:key`.

## MLS Ciphersuite

Implementations MUST support MLS ciphersuite
`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (value `0x0001` in the MLS
Ciphersuites registry established by {{RFC9420}}).

This ciphersuite is mandatory because its signature scheme is Ed25519, matching
the Agent Identity key type and enabling the binding specified in
{{credential-binding}}. Implementations MAY negotiate other ciphersuites,
subject to that section.

## Credential Binding {#credential-binding}

An agent's MLS credential MUST be a `basic` credential whose identity is the
UTF-8 encoding of the agent's Agent Identity.

Furthermore, the MLS `signature_key` in the agent's LeafNode MUST be the same
Ed25519 public key that is encoded in that Agent Identity.

This requirement is the load-bearing element of this section. Without it, an
attacker who can publish a KeyPackage may assert an arbitrary DID string in the
credential, and a receiver has no cryptographic basis for concluding that
messages from that MLS member originate from the holder of the corresponding
DID. With it, MLS membership and Governed Object authorship are bound to a
single key.

On receiving a KeyPackage or LeafNode, an implementation MUST verify that the
credential identity parses as a `did:key` Ed25519 identifier and that the
public key so derived is octet-for-octet equal to the LeafNode
`signature_key`. If the check fails, the implementation MUST reject the
KeyPackage and MUST NOT add the member to a group.

Where a ciphersuite whose signature scheme is not Ed25519 is negotiated, the
binding of {{credential-binding}} cannot be expressed by key equality. In that
case implementations MUST instead require the credential identity to be
accompanied by a proof of possession: a signature, made with the Agent
Identity key, over the MLS `signature_key`. Definition of that proof's
encoding is deferred to a future revision of this document; until it is
specified, implementations that require the binding MUST use ciphersuite
`0x0001`.

# The Governed Object {#governed-object}

## Structure

A Governed Object is a JSON object {{RFC8259}} with the following members. All
listed members are mandatory unless stated otherwise.

| Member | Type | Description |
|---|---|---|
| `version` | number | Format version. MUST be `1` for this specification. |
| `id` | string | Unique object identifier. MUST be unique per issuer. |
| `issuerDid` | string | Agent Identity of the signer. |
| `issuedAt` | string | Issuance time, RFC 3339 date-time in UTC. |
| `semantic` | object | Type descriptor; see below. |
| `payload` | object | Application data. |
| `governance` | object | Use constraints; see {{governance}}. |
| `signatureAlgorithm` | string | MUST be `"ed25519"`. |
| `signature` | string | Base64 {{RFC4648}} Ed25519 signature. |

The `semantic` member has a mandatory `schema` member containing an absolute
URI identifying the payload type, and OPTIONAL `version` and `embeddingHint`
members.

The `id` member MUST be unique per issuer and SHOULD be a UUID or other value
with negligible collision probability. Receivers rely on this for replay
rejection ({{replay}}).

## Governance {#governance}

The `governance` member carries:

| Member | Type | Description |
|---|---|---|
| `purpose` | string | Mandatory. Declared use for the payload. |
| `ttlSeconds` | number | OPTIONAL. Lifetime in seconds from `issuedAt`. |
| `expiresAt` | string | OPTIONAL. Absolute expiry, RFC 3339 date-time. |

If both `ttlSeconds` and `expiresAt` are present, the earlier resulting instant
is the effective expiry. If neither is present, the object does not expire, and
receivers SHOULD apply a locally configured maximum lifetime.

Purpose strings are lowercase, colon-delimited, and hierarchical, for example
`comms:message` or `coordination:proposal`. Purpose values are application
domain vocabulary; this document does not define a registry, but see
{{iana}} for a discussion of whether one is warranted.

## Canonical Serialisation {#canonical}

The signature is computed over a canonical serialisation of the object's
content, excluding `signatureAlgorithm` and `signature`.

The input to canonicalisation is the JSON object {{RFC8259}} consisting of
exactly the members `version`, `id`, `issuerDid`, `issuedAt`, `semantic`,
`payload`, and `governance`. Members that are not present in that abstract
JSON object are omitted. The JSON value `null` is retained where present.
JSON has no `undefined` value; implementations in languages that expose an
undefined or missing-property concept MUST treat such properties as absent
members (omit them) before canonicalisation, and MUST NOT emit a distinct
undefined token.

The canonical form MUST be the JSON Canonicalization Scheme (JCS)
serialisation of that object as specified in {{RFC8785}}. In particular, JCS
orders object member names lexicographically by UTF-16 code unit sequence
and emits no insignificant whitespace. Implementations MUST NOT invent a
parallel key-order or whitespace rule set that diverges from {{RFC8785}}.

Payload authors SHOULD avoid floating-point numbers, because canonical
serialisation of floating-point values is a known source of cross-language
interoperability failure. Where numeric precision matters, payloads SHOULD
encode values as strings or as integers in a stated minor unit.

## Signing

The signature is `Ed25519(privateKey, UTF8(canonicalForm))` as specified in
{{RFC8032}}, encoded per {{RFC4648}} Section 4 (base64 with padding).

## Verification

A verifier MUST:

1. confirm `version` equals `1`;
2. confirm `signatureAlgorithm` equals `"ed25519"`;
3. derive the Ed25519 public key from `issuerDid` per {{identity}};
4. recompute the canonical form per {{canonical}};
5. verify the signature.

Verification failure MUST cause the object to be rejected.

# Session Establishment {#sessions}

## KeyPackage Publication

An agent that accepts incoming sessions publishes MLS KeyPackages. Where the
A2A binding of {{encapsulation}} is used, the agent SHOULD expose them at the
path `/mls/key-package` relative to its A2A service endpoint, returning a JSON
object with members `did` (the Agent Identity) and `wire` (the base64-encoded
MLS KeyPackage).

Publishing endpoints MUST rate-limit KeyPackage retrieval. KeyPackages are
single-use in MLS; unbounded retrieval permits exhaustion of an agent's
pre-published supply.

Retrievers MUST perform the credential binding check of
{{credential-binding}} on the retrieved KeyPackage before use.

## Establishing a Pair Session

The initiating agent creates an MLS group containing itself, then commits an Add
proposal for the responding agent using the retrieved KeyPackage, and delivers
the resulting Welcome message and ratchet tree to the responder using the
handshake encapsulation of {{handshake-part}}.

Where the responder's identity was learned from an out-of-band invitation that
asserted a specific Agent Identity, the initiator MUST verify that the
retrieved KeyPackage's credential identity equals the asserted identity, and
MUST abort establishment on mismatch. Absent this check, an attacker who
controls the endpoint named in an invitation can substitute their own identity.

## Group Sessions {#group-sessions}

Sessions with more than two members follow MLS {{RFC9420}} group semantics.
Implementations MUST apply the credential binding check of
{{credential-binding}} to every joining member.

### Designated committer profile

Deployments MAY adopt a **designated committer** profile in which a single
member (the committer) is the only party authorised to create MLS Commit
messages for the group. Atom room sessions use this profile with the room host
as committer. Under that profile:

* Receivers MUST reject public MLS Commit messages whose claimed sender
  identity (for example, the MLS wire part's `senderDid` member) is not the
  designated committer.
* Receivers SHOULD additionally verify that the MLS-authenticated Commit
  author matches the designated committer, and MUST NOT treat envelope
  `senderDid` alone as cryptographic proof of Commit authorship.
* Other members MUST NOT create Add or Remove commits.

This document does not require MLS commit democracy. Deployments that grant
commit rights more broadly remain responsible for their own membership policy,
but MUST still apply {{commit-fanout}}.

### Membership change and commit fan-out {#commit-fanout}

When the designated committer (or other authorised committer) adds a member:

1. The committer creates an MLS Commit containing an Add proposal and advances
   its local epoch.
2. The committer MUST deliver the resulting **public Commit** to every other
   **current** member (all members other than the committer and, until they
   have joined, the new member) as an MLS message on the **MLS wire** part of
   {{mls-wire-part}} (the same A2A part used for application messages).
3. Each existing member that receives that Commit MUST process it before
   relying on the new epoch for application traffic.
4. The committer delivers the Welcome and ratchet tree to the joining member
   using the handshake encapsulation of {{handshake-part}}.

The joining member MUST NOT treat Welcome alone as evidence that other members
have advanced to the new epoch. Absent Commit delivery to existing members,
those members remain on the prior epoch and cannot decrypt subsequent
application messages -- the N-member failure mode this section exists to
prevent.

When a member is removed:

1. The committer creates an MLS Commit containing a Remove proposal.
2. The committer MUST deliver the public Commit on the MLS wire to every
   **remaining** member.
3. The leaving member MUST NOT be required to process the Remove Commit.

Optional conveyance of a base64-encoded Commit inside a handshake object does
not replace {{commit-fanout}}. Where both a handshake `commit` member and an
MLS wire Commit are present, the MLS wire Commit is authoritative for existing
members.

This document does not specify compensating recovery when Commit fan-out
reaches only a subset of members after the committer has already advanced
locally. Deployments MUST treat such epoch splits as out of scope for this
revision and recover by failing closed (drop session and re-establish), not by
silent continuation.

## Session Persistence {#session-persistence}

Implementations that persist MLS group state across process restarts MUST
protect that state at rest under the same deployment controls used for the
agent's long-term private key material (for example, filesystem permissions
on a dedicated agent data directory). This document does not require
application-layer encryption of on-disk group state beyond those controls.

Implementations SHOULD persist group state using an encoding that separates
the ratchet tree from the remaining group secrets, storing the tree alongside
the truncated state, and MAY accept a legacy encoding that embeds the tree
when migrating older stores.

On restore failure (corrupt, truncated, or undecodable state), implementations
MUST fail closed: discard the unusable session, and require re-establishment
(re-join or re-handshake). Implementations MUST NOT continue with a partially
hydrated group session.

# Encapsulation {#encapsulation}

This section specifies the A2A {{A2A}} binding.

## Protocol Version {#protocol-version}

This binding is specified against A2A version 1.0. Two properties of that
version are relied upon: a message part carries a `mediaType` member of its own,
and a message may enumerate the extensions it depends upon.

A2A version 0.3 provided neither. Implementations MAY interoperate with peers
speaking version 0.3 by applying {{version-compat}}, and the reference
implementation does so, but a conforming implementation of this document
transmits version 1.0.

Throughout this section, part and message members are named as they appear in
the JSON serialisation on the wire. An implementation generated from the A2A
protocol buffer schema will present the part content as a language-level tagged
union; that representation is an artefact of code generation and is not
observable by a peer.

## Extension Declaration

An agent supporting the **Governed Object** profile defined in this document
MUST declare the extension URI `https://atom.qwixl.dev/a2a/data-object/v1` in
the `capabilities.extensions` member of its Agent Card, with `required` set to
false.

A message carrying one or more **Governed Object** parts SHOULD list that URI
in the message's `extensions` member. A message that carries only MLS wire or
MLS handshake parts MUST NOT stamp the Governed Object URI in `extensions`
(the GO claim stays narrow; MLS MAY later ship under its own extension URI).
A receiver MUST NOT require the `extensions` member to be present, since a peer
speaking A2A version 0.3 has no such member to populate, and MUST NOT rely upon
it to identify a part: the media type is authoritative.

The A2A extension specification for the Governed Object profile alone (without
MLS) is published under `spec/extensions/data-object-v1/` in the reference
implementation repository. This Internet-Draft remains the broader provenance
document covering Governed Objects together with MLS session mechanics.

Editor's note: this URI reflects the deployed reference implementation. Should
this document be adopted by a standards body, the URI is expected to be
reassigned under that body's namespace. Implementations SHOULD treat the URI as
an opaque identifier.

## Media Type Placement {#media-type-placement}

Each part specified below is identified by one of the media types in {{iana}}.
A sender MUST set the media type in the part's `mediaType` member, and SHOULD
also set a `mediaType` member within the part's `data` object with the identical
value.

A receiver MUST determine the media type from the part's `mediaType` member when
that member is present and non-empty, and MUST fall back to the `mediaType`
member within the `data` object otherwise. Where both are present and they
disagree, the receiver MUST reject the part.

The duplication exists because version 0.3 of A2A had no `mediaType` member on a
part, obliging deployments written against A2A version 0.3 to carry the
media type inside the payload. A receiver that reads only the inner member
therefore continues to interoperate. A sender MAY omit the inner member once no
such receiver remains reachable; this document retains it as a SHOULD rather
than a MUST for that reason.

## Governed Object Part

A Governed Object MAY be carried unencrypted in an A2A message part whose `data`
member is a JSON object with members `mediaType`, set to
`application/vnd.atom.data-object+json;version=1` per
{{media-type-placement}}, and `object`, set to the Governed Object.

~~~
{
  "data": {
    "mediaType": "application/vnd.atom.data-object+json;version=1",
    "object": { ... Governed Object ... }
  },
  "mediaType": "application/vnd.atom.data-object+json;version=1"
}
~~~

Unencrypted carriage provides authenticity and governance metadata but not
confidentiality. Implementations MUST NOT use unencrypted carriage for personal
data or otherwise confidential payloads where an MLS session can be
established. Implementations SHOULD default to encrypted carriage.

## MLS Wire Part {#mls-wire-part}

MLS wire messages -- including application PrivateMessages and public Commit
messages used for {{commit-fanout}} -- are carried in an A2A message part whose
`data` member is a JSON object with members `mediaType`, set to
`application/vnd.atom.mls-wire+cbor;version=1` per {{media-type-placement}},
and `wire`, set to the base64 encoding {{RFC4648}} of the MLSMessage as
serialised per {{RFC9420}}. For room or other multi-recipient fan-out, the
object MAY also carry a `senderDid` member naming the Agent Identity of the
sender; receivers under the designated committer profile of {{group-sessions}}
MUST reject Commits whose claimed `senderDid` is not the designated committer,
and SHOULD bind that claim to MLS authentication of the Commit where available.

~~~
{
  "data": {
    "mediaType": "application/vnd.atom.mls-wire+cbor;version=1",
    "wire": "<base64 MLSMessage>"
  },
  "mediaType": "application/vnd.atom.mls-wire+cbor;version=1"
}
~~~

The decrypted application message plaintext is the UTF-8 encoding of a JSON
object with a member `object` containing a Governed Object. Implementations MAY
define additional members; receivers MUST ignore members they do not
recognise.

## Handshake Part {#handshake-part}

MLS Welcome messages and the accompanying ratchet tree are carried in an A2A
message part whose `data` member is a JSON object with member `mediaType` set to
`application/vnd.atom.mls-handshake+json;version=1` per
{{media-type-placement}}, and members conveying:

* `initiatorDid` -- the Agent Identity of the party that created the Welcome
  (or, for commit-oriented handshake objects, the designated committer);
* `welcome` -- base64-encoded Welcome (required when admitting a new member;
  MAY be omitted for commit-only objects that are not the normative fan-out
  path);
* `ratchetTree` -- base64-encoded ratchet tree accompanying Welcome (REQUIRED
  when `welcome` is present; OPTIONAL when `welcome` is absent);
* `commit` -- optional base64-encoded public Commit. Existing members MUST
  still receive Commits per {{commit-fanout}} on the MLS wire; a handshake
  `commit` member alone is not sufficient for N-member correctness;
* `memberDids` -- optional hint listing Agent Identities after the membership
  change. Authoritative membership is the MLS ratchet tree after Welcome or
  Commit processing.

Where both Welcome and `ratchetTree` are supplied, the joiner MUST abort if
MLS join fails to accept the tree with the Welcome (inconsistent or
substituted tree).

## Agent Card {#agent-card}

An agent's endpoints are declared in the `supportedInterfaces` member of its
Agent Card, an ordered list in which the first entry is the sender's preferred
interface and each entry states the A2A protocol version that interface speaks.
A2A version 0.3 instead declared a single endpoint in a top-level `url` member;
an implementation reading a card MUST NOT depend on that member.

An agent MAY declare more than one interface at the same URL in order to serve
more than one protocol version, and the reference implementation does so.

An Agent Card MAY carry one or more JWS signatures in its `signatures` member.
Where an agent's identity is a `did:key` as specified in {{identity}}, the
signature's `kid` header parameter SHOULD be that identifier, because the
verifying key is then recoverable from the identifier itself and card
verification requires no key distribution mechanism and no further network
retrieval.

A relying party that verifies a card signature MUST treat the identifier in
`kid` as the identity that produced the card, and MUST NOT infer from a valid
signature that the card's contents are endorsed by any other identity named
within it. Transport security establishes control of the origin serving a card;
it establishes nothing about the agent the card describes. An unsigned card
therefore permits any party controlling an origin to publish a card asserting
any agent identity, and a relying party that acts on such an assertion -- for
instance, to associate a domain with an agent -- SHOULD require a signature whose
`kid` matches the asserted identity.

## Version Compatibility {#version-compat}

An implementation MAY accept and originate A2A version 0.3 messages in addition
to version 1.0. Where it does:

* The version of a received message is determined by the `A2A-Version` header
  field. Its absence denotes version 0.3.
* The version to use towards a given peer is determined by that peer's Agent
  Card, per {{agent-card}}.
* A part received from a version 0.3 peer carries the media type only within
  the `data` object, which {{media-type-placement}} accommodates.

Deployment order is not symmetric, and this has operational consequence. A
receiver that accepts both versions is compatible with senders of either, but a
sender that has begun transmitting version 1.0 is not compatible with a receiver
that accepts only version 0.3. In a network upgraded incrementally, every
receiver MUST therefore be capable of the newer version before any sender
originates it.

## Transport Authentication

The transport carrying these parts MUST authenticate the calling party using a
mechanism defined by the underlying protocol, such as those enumerated in
{{A2A}}.

An unauthenticated transport endpoint permits an unbounded set of parties to
consume the receiver's resources, to enqueue messages, and to attempt session
establishment. End-to-end encryption does not mitigate this: MLS protects
content, not availability. Implementations MUST NOT expose an unauthenticated
message-submission endpoint in production.

# Receiver Processing Rules {#processing}

## Mandatory Ordered Checks

On receiving a Governed Object, whether from a decrypted MLS application message
or from unencrypted carriage, a Relying Receiver MUST perform the following
checks, and MUST perform them in this order:

1. Structural validation against {{governed-object}}. Reject on failure.
2. Signature verification per {{governed-object}}. Reject on failure.
3. Where the object arrived inside an MLS session, confirm that `issuerDid`
   equals the Agent Identity in the credential of the MLS member that sent the
   message. Reject on mismatch.
4. Expiry evaluation per {{governance}}. Reject if expired.
5. Replay rejection per {{replay}}. Reject if already seen.
6. Purpose enforcement per {{purpose-enforcement}}. Reject if not permitted.

Only after all six checks succeed may the receiver act upon `payload`.

Check 3 is essential and is easily omitted. Without it, any member of a group
can emit an object bearing another member's `issuerDid`; the signature check
alone does not detect this, because the signature is valid -- it is simply not
made by the party that sent it. Implementations MUST NOT treat a valid signature
as evidence of who transmitted the message.

## Replay Rejection {#replay}

A Relying Receiver MUST reject a Governed Object whose `id` it has previously
accepted from the same `issuerDid`.

Receivers MUST retain accepted `(issuerDid, id)` pairs for at least the maximum
object lifetime they will accept. Where a receiver applies a maximum accepted
lifetime, retention for that period is sufficient, because an older object is
rejected by check 4 regardless.

Absent this requirement, a passive observer of unencrypted carriage, or any
member of an MLS group, can re-present a previously valid object. Where objects
convey instructions with side effects -- a payment authorisation, a booking
confirmation, a consent grant -- replay is directly exploitable.

## Purpose Enforcement {#purpose-enforcement}

A Relying Receiver MUST maintain, per processing context, a set of permitted
purpose values, and MUST reject an object whose `governance.purpose` is not in
that set.

The set MUST be determined by the receiver's own configuration for the context
in which the object is being processed. It MUST NOT be derived from the object
itself, nor from any value under the sender's control.

Receivers MUST NOT use a payload for a purpose other than the one declared, and
MUST NOT retain it beyond its expiry, save where an independent legal obligation
requires retention.

## Rejection Behaviour

A receiver rejecting an object SHOULD emit a diagnostic distinguishable by
cause, for operator use. A receiver SHOULD NOT return to the sender information
that distinguishes between rejection causes beyond what is necessary for
interoperability, because fine-grained rejection reasons assist an attacker in
probing receiver configuration -- in particular in enumerating the permitted
purpose set.

# Regulatory Alignment {#regulatory}

This section is informative.

The constructs specified here correspond to obligations that exist independently
of this document in several jurisdictions. In the European Union, {{GDPR}}
Article 5(1)(b) requires that personal data be collected for specified purposes
and not further processed incompatibly with them; Article 5(1)(c) requires data
minimisation; and Article 5(1)(e) requires that data be kept no longer than
necessary.

A Governed Object carries the specified purpose and the retention limit as
signed metadata available to the receiving implementation at the moment of
processing, rather than as prose in an agreement negotiated out of band. The
mandatory receiver-side enforcement of {{purpose-enforcement}} makes those
constraints operative in code.

This does not constitute compliance, and this document does not offer legal
advice. It observes only that the mechanism places the relevant facts where an
implementation can act on them, which is a precondition for compliance being
demonstrable rather than merely asserted.

# Security Considerations {#security}

## What This Specification Provides

Within an MLS session, message content is confidential from the transport and
from any intermediary, with the forward secrecy and post-compromise security
properties of {{RFC9420}}. Governed Objects are authenticated and integrity
protected by Ed25519 signatures that remain verifiable independently of the
session and after it ends, providing durable evidence of authorship. The
credential binding of {{credential-binding}} ties MLS membership to the same
key, so that transmission and authorship cannot be separated.

## What It Does Not Provide

Purpose limitation is not cryptographically enforced. A receiver that has
decrypted a message is in possession of the plaintext and can disregard the
declared purpose and expiry. The mechanism provides a signed, non-repudiable
record of the constraint under which disclosure was made, which converts an
undetectable breach into an attributable one. It does not prevent the breach.
Constructions that would provide stronger enforcement, such as purpose-bound
decryption keys or confidential computing attestation, are out of scope.

A DID is not an identity. It denotes control of a key. Binding a DID to a legal
or natural person requires a credential presentation layer above this
specification.

Compromise of an agent's Ed25519 private key compromises both its MLS
membership and its ability to sign Governed Objects, precisely because
{{credential-binding}} unifies them. Implementations MUST protect this key
accordingly, and SHOULD use non-exportable key storage where the platform
provides it. The unification is a deliberate trade: it eliminates a class of
impersonation attack at the cost of concentrating key-compromise impact.

MLS provides no protection against traffic analysis, and this specification adds
none. Endpoints, message sizes, and timing are visible to the transport.

## Availability

An unauthenticated message-submission endpoint is a denial-of-service vector
regardless of encryption; see {{encapsulation}}. KeyPackage exhaustion is a
related vector; see {{sessions}}.

Implementations that queue messages for offline recipients MUST bound queue size
and MUST apply the checks of {{processing}} on dequeue rather than only on
enqueue. Deferring validation to dequeue without bounding the queue permits an
attacker to cause unbounded storage consumption with unvalidated input.

## Group Session Threats

The following threats are specific to N-member sessions and motivate
{{group-sessions}} and {{session-persistence}}:

* Epoch skew after Add (T1).
  : Mitigated by {{commit-fanout}}. Partial delivery after the committer has
    already advanced remains a deployment recovery problem; this revision does
    not specify compensating fan-out.

* Peer-injected Commit (T2).
  : Mitigated under the designated committer profile by rejecting Commits whose
    claimed sender is not the committer. Binding that claim to MLS-authenticated
    Commit authorship is RECOMMENDED; envelope-only checks are weaker against a
    compromised or spoofed transport path.

* Half-restored group secrets (T3).
  : Mitigated by MUST fail-closed restore in {{session-persistence}}.

* Spec ahead of code (T4).
  : This revision limits normative group behaviour to surfaces proven in the
    reference implementation's three-agent loopback suite.

* Folding offline delivery into MLS (T5).
  : Offline / asleep-queue behaviour is specified separately and MUST NOT be
    inferred from this document's MLS sections.

* Roster versus MLS membership desync.
  : Application rosters that diverge from MLS leaves (for example, host
    self-leave without a Remove Commit) are out of scope for this revision;
    deployments MUST treat MLS membership as authoritative for decryption.

* Handshake ratchet-tree substitution.
  : Joiners MUST abort when Welcome does not accept the supplied ratchet tree.

* Stale Commit replay.
  : MLS processing rejects Commits already applied to local state; deployments
    SHOULD retain that failure mode rather than inventing a separate
    application-layer Commit replay cache.

# IANA Considerations {#iana}

## Media Types

This document uses three media types, currently registered in neither the
standards nor the vendor tree. The deployed reference implementation uses
vendor-tree names.

If this document advances, the author requests registration of the following in
the standards tree, with the vendor-tree names retained as deprecated aliases:

| Proposed | Deployed | Purpose |
|---|---|---|
| `application/governed-object+json` | `application/vnd.atom.data-object+json` | Governed Object |
| `application/mls-wire+cbor` | `application/vnd.atom.mls-wire+cbor` | MLS wire message |
| `application/mls-handshake+json` | `application/vnd.atom.mls-handshake+json` | Welcome and ratchet tree |

Complete registration templates will be supplied in a subsequent revision.

## Purpose Value Registry

This document requests the creation of a new IANA registry entitled
**Governed Object Purpose Values**.

Each entry has: Value (string), Prefix, Description, Payload schema (HTTPS
URI), Reference, Status (`provisional`, `permanent`, or `obsolete`), and
Change Controller.

Registration procedures: Expert Review for `provisional` and `obsolete`
entries; Standards Action for `permanent` entries ({{RFC8126}}).
Provisional entries MUST be revised, promoted, or obsoleted within 24 months
of last substantive change.

IANA registration of a purpose MUST NOT be interpreted as (i) permission to
process, (ii) default allowlist membership, or (iii) authorisation for side
effects. Receivers that move money, mutate durable external state, or disclose
secrets MUST apply separate confirmation and policy controls; purpose alone is
insufficient. Registered purposes remain subject to receiver-configured
allowlists; an empty or absent allowlist is a deployment profile that does not
grant cross-implementation purpose alignment (see also the Atom Governed Object
A2A extension deployment-profile note).

Purpose values identify the *kind* of Governed Object. Strings such as
`action:reserve`, `room:receipt`, and `room:checkpoint` may appear in
implementations but are not part of the initial IANA contents; they remain
implementation-defined until proposed with a stable payload contract.
`action:qualify` is intentionally omitted from the initial contents.

Initial provisional contents (payment rail cluster):

| Value | Prefix | Description (summary) | Payload schema | Status |
|---|---|---|---|---|
| `action:hold` | action | Authorization hold on a payment rail. MUST NOT auto-place holds from purpose alone. | https://atom.qwixl.dev/schema/ActionHold | provisional |
| `action:confirm` | action | Party confirmation before capture. MUST NOT capture funds. | https://atom.qwixl.dev/schema/ActionConfirm | provisional |
| `action:capture` | action | Capture of a previously placed hold. MUST NOT capture without prior hold + confirm policy. | https://atom.qwixl.dev/schema/ActionCapture | provisional |
| `action:release` | action | Compensating release of a hold. | https://atom.qwixl.dev/schema/ActionRelease | provisional |
| `action:receipt` | action | Signed receipt after capture. | https://atom.qwixl.dev/schema/ActionReceipt | provisional |

Additional application-specific purposes (for example product UI verbs under
vendor or product prefixes) are implementation-defined and MUST NOT be claimed
as registered solely because they appear in a particular deployment.

# Implementation Status {#implementation-status}

This section is to be removed before publication as an RFC, per {{RFC7942}}.

An open source implementation exists under the Apache License 2.0 at
`https://github.com/Qwixl/Atom`, and is deployed in a small public network.

Implemented and interoperability-tested between two independent processes over
HTTP:

* Governed Object construction, canonical serialisation, Ed25519 signing, and
  verification, including tamper and expiry rejection.
* `did:key` Ed25519 identity derivation without network resolution.
* MLS pair and group sessions using ciphersuite `0x0001` via the `ts-mls`
  library in a single open-source implementation (`https://github.com/Qwixl/Atom`),
  including KeyPackage publication and retrieval, Welcome and ratchet tree
  delivery to joiners, public Commit fan-out to existing members on the MLS
  wire for Add and Remove, application message encryption and decryption,
  designated-committer admission of room Commits via host `senderDid` gating
  on inbound public Commits (MLS-authenticated Commit author binding remains
  a SHOULD), WithoutTree-style group snapshot restore with optional
  ratchet-tree sidecar, fail-closed discard of corrupt snapshots, and a
  three-agent loopback restart proof. Compensating recovery after partial
  Commit fan-out, and host self-leave without a Remove Commit, remain deferred.
* The A2A binding of {{encapsulation}} at protocol version 1.0, including
  extension declaration in the Agent Card and per message, all three part
  encodings, and media type placement in both positions per
  {{media-type-placement}}.
* Version compatibility with A2A version 0.3 per {{version-compat}}, in both
  directions, tested against the published version 0.3 implementation rather
  than against a substitute: a version 1.0 sender delivering to a version 0.3
  receiver, and a version 0.3 sender delivering to a version 1.0 receiver.
* Agent Card signing and verification per {{agent-card}}, with `kid` set to the
  agent's `did:key` and the verifying key recovered from that identifier without
  network retrieval. The relying check described there -- requiring the signing
  identity to match an asserted identity before associating a domain with an
  agent -- is applied.
* Purpose enforcement by receiver-configured allowlist, and expiry rejection.
* Out-of-band invitation with identity assertion, and abort on identity
  mismatch.
* Transport authentication on the message-submission endpoint
  ({{encapsulation}}): Agent Cards declare an HTTP Bearer scheme
  (`atomDidBearer`), and `/a2a/jsonrpc` requires an Atom DID Bearer token
  (`Authorization: Bearer atom.<payload>.<sig>`) signed by the caller's
  `did:key`, with audience bound to the peer's public base URL.

Previously deferred and now implemented in the reference libraries:

* The credential binding key-equality check of {{credential-binding}}
  (`@qwixl/protocol` + `@qwixl/mls-session` KeyPackage generation and admission).
* Replay rejection ({{replay}}) via `ReplayGuard` in `@qwixl/protocol`, wired
  through the agent backend receive paths.
* Check 3 of {{processing}}, confirming `issuerDid` against the sending MLS
  member's LeafNode credential (`decrypt` returns `senderDid`;
  `verifyDataObject({ expectedMlsSenderDid })`).
* Validation on dequeue for messages queued to offline recipients
  ({{security}}): `dequeueAsleepMessages` applies {{processing}} when the
  agent wakes; the queue remains size-bounded at enqueue.

The author notes that several of these items were identified by the exercise
of writing this specification, having not been apparent from the working
implementation. This is offered as evidence for the general proposition that
specification and implementation are not redundant activities.

A further instance arose in preparing this document. The reference
implementation's own documentation described a part using the tagged-union form
produced by its code generator, rather than the JSON actually transmitted. The
discrepancy was invisible to that implementation, which both produced and
consumed the same internal representation, and would have been discovered only
by a second implementation in another language attempting to interoperate from
the description. The requirement in {{protocol-version}} that members be named
as they appear on the wire, and the encapsulation vectors of {{vectors}}, exist
to prevent a recurrence.

# Changes from draft-chapman-a2a-mls-02

- Expanded {{group-sessions}} with a designated committer profile and
  normative {{commit-fanout}} requiring public Commit delivery on the MLS wire
  for Add/Remove, correcting the N-member epoch-skew failure mode.
- Replaced thin {{session-persistence}} text with deployment/OS at-rest
  controls, RECOMMENDED WithoutTree-style encoding, and MUST fail-closed
  restore.
- Clarified {{handshake-part}} optional `commit` / `memberDids` and that MLS
  wire Commits remain authoritative for existing members.
- Honest {{implementation-status}} for group persistence and three-agent
  proofs; deferred partial fan-out recovery and host self-leave without Remove.
- Tightened {{canonical}}: MUST use {{RFC8785}} JCS; removed JS-specific
  "undefined" wording; clarify absent members vs JSON `null`.

# Changes from draft-chapman-a2a-mls-01

- Replaced the Purpose Value Registry solicit-input text with a concrete IANA
  registry request for **Governed Object Purpose Values**, Expert Review /
  Standards Action procedures, and five provisional payment-rail purposes
  (`action:hold`, `action:confirm`, `action:capture`, `action:release`,
  `action:receipt`). Registration is not authorisation; empty allowlists remain
  a deployment-profile choice.
- Added {{RFC8126}} as a normative reference for registration procedures.

# Changes from draft-chapman-a2a-mls-00

- Clarified {{encapsulation}} Extension Declaration: messages carrying only MLS
  wire or MLS handshake parts MUST NOT stamp the Governed Object extension URI;
  GO-carrying messages SHOULD list it. The Agent Card declaration for the GO
  URI uses `required` false.
- Noted the separately published GO-only A2A extension profile under
  `spec/extensions/data-object-v1/` in the reference implementation repository.
  This document remains the broader GO+MLS provenance draft.

--- back

# Test Vectors {#vectors}

Machine-readable test vectors accompany this document, comprising: signed
Governed Objects with known Ed25519 key pairs and their canonical
serialisations; objects with mutated payloads that MUST fail verification;
expired objects; objects whose declared purpose is outside a stated permitted
set; a replayed object pair; and a KeyPackage whose credential identity does not
match its signature key, which MUST be rejected per {{credential-binding}}.

A second group of vectors covers the encapsulation of {{encapsulation}} as
serialised JSON, independently of any Governed Object contained within: parts
carrying the media type in the part member, in the `data` member, and in both;
a part whose two media type members disagree, which MUST be rejected per
{{media-type-placement}}; and a part bearing no media type in either position.
These vectors exist because the encapsulation is the layer at which two
implementations in different languages first fail to interoperate, and it is the
layer least well served by reading either implementation's source.

Vectors are published at `https://github.com/Qwixl/Atom` under `spec/vectors/`.
An implementation claiming conformance to this document SHOULD produce the
specified outcome for every vector.

The vectors were derived from this document's text rather than generated from the
reference implementation, so that the two are capable of disagreeing. On first
execution they did: the reference implementation treated `governance.expiresAt`
as authoritative whenever present and never compared it to the interval implied
by `ttlSeconds`, so a sender could extend a short-lived object's lifetime
indefinitely by supplying an additional distant absolute expiry. Because the
governance block is covered by the signature, the resulting object was valid
under every other check. This is the origin of the requirement in
{{governance}} that the earlier instant govern, and it is offered as a
concrete instance of why vectors written from specification text are worth the
effort of producing.

# Acknowledgements
{:numbered="false"}

This work builds directly on the MLS protocol {{RFC9420}} and on the A2A
protocol {{A2A}}. The author thanks the authors and contributors of both.
