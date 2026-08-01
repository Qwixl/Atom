# Atom on A2A v1.0

What an Atom agent puts on the wire, and what a peer has to produce to be understood.

This is the reference for **implementing against Atom**, whether or not you use the A2A JavaScript SDK. If you want the practical steps to stand a peer up, start with [JOIN-AS-PEER.md](../guides/JOIN-AS-PEER.md) and come back here for the bytes. For Atom's wider wire contracts — data objects, MLS, invitations — see [PROTOCOL-v1.md](PROTOCOL-v1.md).

## Status

| | |
|---|---|
| Protocol version spoken | **A2A v1.0** (spec GA 2026-07-22) |
| Older peers | **v0.3 accepted**, decided per peer from that peer's own card |
| Reference SDK | `@a2a-js/sdk@1.0.0`, compat layer enabled on both sides |
| Atom extension URI | `https://atom.qwixl.dev/a2a/data-object/v1` |
| Specification | [`draft-chapman-a2a-mls`](../../spec/) §Encapsulation (see `-01` working revision; `-00` is the Datatracker first submission) |
| Conformance vectors | [`spec/vectors/`](../../spec/vectors/) — 31, of which 9 cover encapsulation |

## Everything is JSON, not types

The A2A v1.0 types are generated from a protocol buffer schema. That has one consequence worth stating before anything else: **an implementation's in-memory shape is not the wire shape.** A protobuf `oneof` becomes a tagged union in generated TypeScript, and a `Role` becomes a numeric enum, but neither of those appears in the JSON a peer receives.

Everything below is the JSON on the wire, captured from a live exchange between two Atom agents. If you are working in the SDK, its types will look different in your editor and that is expected; if you are implementing by hand, this is what to produce.

## A complete request

`POST /a2a/jsonrpc`, `Content-Type: application/json`, `A2A-Version: 1.0`:

```json
{
  "jsonrpc": "2.0",
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "2fcc1bd8-489b-4da0-931b-4ce43b762014",
      "role": "ROLE_USER",
      "parts": [
        {
          "data": {
            "mediaType": "application/vnd.atom.data-object+json;version=1",
            "object": { "…": "signed Atom data object" }
          },
          "mediaType": "application/vnd.atom.data-object+json;version=1"
        }
      ],
      "extensions": ["https://atom.qwixl.dev/a2a/data-object/v1"]
    },
    "configuration": {}
  },
  "id": 1
}
```

Three things in there catch people out. JSON-RPC method names are PascalCase in v1.0 (`SendMessage`, not `message/send`). `role` is the enum's **name**, not a number. And empty fields are simply absent — `contextId`, `taskId`, `filename` and `metadata` are all omitted above rather than sent as `""` or `null`.

## Parts

Atom carries three kinds of payload, each in an A2A `data` part, distinguished by media type:

| Media type | Carries |
|---|---|
| `application/vnd.atom.data-object+json;version=1` | A signed Atom data object, under `object` |
| `application/vnd.atom.mls-wire+cbor;version=1` | A base64 MLS message, under `wire` |
| `application/vnd.atom.mls-handshake+json;version=1` | An MLS Welcome and ratchet tree |

A part carries its content under the member naming its content kind — `data` for all three of the above — and its media type in a `mediaType` member alongside:

```json
{
  "data": {
    "mediaType": "application/vnd.atom.mls-wire+cbor;version=1",
    "wire": "<base64 MLSMessage>"
  },
  "mediaType": "application/vnd.atom.mls-wire+cbor;version=1"
}
```

### Where the media type goes

The media type appears **twice**, and this is deliberate:

- **Send both.** Set `mediaType` on the part, and set a `mediaType` key inside the `data` object with the identical value.
- **Accept either.** A part with only the part-level member is valid — that is what a generic A2A tool with no knowledge of Atom produces. A part with only the inner key is also valid — that is what a v0.3 peer produces, because v0.3 had no part-level `mediaType` to use.
- **Reject a conflict.** If both are present and they *disagree*, refuse the part. Do not resolve in favour of either one.

That last rule is the one worth understanding rather than just implementing. A part declaring two different media types is not one kind of message or the other. If receivers resolve it by preference, then a receiver reading the part member and a receiver reading the inner key process identical bytes as different messages — and a sender who knows both exist on the network gets to choose which peer acts on what. Refusing the part removes the choice. This is conformance vector `073-part-media-type-conflict`.

The duplication is transitional. The inner key exists only for peers and modules written against the pre-v1.0 envelope, and it can be dropped once none remain reachable. Until then, a sender that omits it is conforming but less compatible.

## Messages

| Member | Note |
|---|---|
| `role` | `"ROLE_USER"` or `"ROLE_AGENT"` — the enum name |
| `extensions` | Extension URIs this message relies on. Atom SHOULD list the Governed Object URI on GO-carrying messages; MLS-only messages MUST NOT stamp that URI. The reference `atomMessage()` helper stamps GO by default; MLS helpers disable it |
| `contextId`, `taskId` | Plain strings; omitted when empty, never `null` |
| `referenceTaskIds` | Present in v1.0; Atom sends it empty |

Declaring the GO extension URI in `extensions` is how v1.0 lets a message say what GO-carrying traffic depends on. Atom's `atomMessage()` stamps it by default; MLS-only sends pass `declareDataObjectExtension: false` and MUST omit it. Do not *require* the member on receipt: a v0.3 peer has no such member, and the media type is what identifies a part. Full GO-only profile: [`spec/extensions/data-object-v1/`](../../spec/extensions/data-object-v1/).

## Agent card

Served at `/.well-known/agent-card.json`. In v1.0 there is **no** top-level `url` and **no** top-level `protocolVersion`; both moved into `supportedInterfaces`, an ordered list whose first entry is the preferred one:

```json
{
  "name": "Atom agent",
  "version": "0.1.0",
  "supportedInterfaces": [
    { "url": "https://peer.example/a2a/jsonrpc", "protocolBinding": "JSONRPC", "protocolVersion": "1.0", "tenant": "" },
    { "url": "https://peer.example/a2a/jsonrpc", "protocolBinding": "JSONRPC", "protocolVersion": "0.3", "tenant": "" }
  ],
  "capabilities": {
    "extensions": [
      {
        "uri": "https://atom.qwixl.dev/a2a/data-object/v1",
        "description": "Signed Atom data objects carried in A2A data parts",
        "required": false
      }
    ]
  }
}
```

Atom declares **two interfaces on the same URL**, v1.0 first. One endpoint serves both versions, dispatching on the `A2A-Version` request header, and a peer of either version finds an interface it can use rather than a card it cannot.

Other v1.0 card changes: `security` was renamed `securityRequirements`; skills now require `examples`, `inputModes`, `outputModes` and `securityRequirements`; each declared extension requires a `description`; `additionalInterfaces` is gone.

### Card signatures

v1.0 cards may carry JWS `signatures`. Atom signs with the agent's own `did:key`, `alg: EdDSA`, and — the part that matters — `kid` set to the DID itself. The verifying key is then recoverable from the identifier being claimed, so verifying a card needs no key server, no JWKS endpoint and no second network request.

What a valid signature proves is narrow, and worth being precise about. It proves the card was produced by the holder of that DID's private key. It does not endorse anything else the card says. Transport security is what proves control of the origin serving the card, and that is a different claim again: **HTTPS alone lets any domain publish a card asserting any agent's DID.** So where Atom acts on such an assertion — associating a business domain with an agent — a signed card must verify *and* its signer must equal the agent DID being claimed. Unsigned cards fall back to the older, weaker check rather than being rejected, because a v0.3 peer cannot sign at all.

## Version negotiation, and the order to deploy in

An Atom agent decides the version **per peer**, reading that peer's card. There is no flag day.

Version on the wire is carried by the `A2A-Version` header, and **its absence means v0.3**. Two headers were also renamed: `X-A2A-Extensions` became `A2A-Extensions`.

Upgrading is not symmetric, and getting it backwards breaks delivery:

> A server that accepts both versions works with senders of either. A client that has started speaking v1.0 does **not** work with a server that only accepts v0.3.

So **upgrade every server before any client** — yours and, if you operate a fleet, all of it. Servers accept both and clients negotiate down; the reverse order fails.

On the SDK, compat is opt-in on both sides and must be configured in two places that agree. Server: `createAtomA2aExpressApp` enables it on the card handler and the JSON-RPC handler. Client: `createAtomPeerClient(peerUrl)` enables it on the card resolver **and** the transport factory — the resolver stamps `protocolVersion: "0.3"` on interfaces it synthesises from a v0.3 card, and the transport factory reads that stamp to choose a transport. Configure one without the other and negotiation silently stops working.

This is tested rather than asserted: `packages/a2a-transport/src/compat.integration.test.ts` runs a real `@a2a-js/sdk@0.3.14` peer and exercises both directions.

## Proving conformance

Governed Object A2A extension (GO-only profile): [`spec/extensions/data-object-v1/`](../../spec/extensions/data-object-v1/).

The encapsulation rules above have machine-readable vectors, so you can check an implementation without coordinating with us:

```bash
node spec/vectors/run.mjs
```

Vectors `070`–`078` cover the part serialisation specifically: media type in either position, in both, in neither, the conflict case, a text part masquerading as a data part, and a well-formed part of the wrong media type. They are JSON, so an implementation in any language can consume them; the reference runner is JavaScript (`spec/vectors/run.mjs`), and a minimal **Python** second implementation lives at `spec/second-impl/` (hostile mutations at `spec/hostile/`).


The vectors are written from the specification text rather than generated from this implementation, which is what lets them disagree with it — and they have twice, each time correctly. See [`spec/vectors/README.md`](../../spec/vectors/README.md).

## SDK helpers

If you build on `@qwixl/a2a-transport`, these do the above for you:

| Helper | Does |
|---|---|
| `toAtomDataPart` / `readAtomDataPart` | Part encoding, including both media-type positions and the conflict rule |
| `atomMessage` / `textPart` | Message construction, role translation, extension declaration |
| `buildAtomAgentCard` | Card with both interfaces, correct skill and extension shapes |
| `agentCardUrl` / `rebindAtomAgentCard` | Read the preferred interface URL; repoint every interface |
| `createAtomPeerClient` / `fetchAtomAgentCard` | Dial or inspect a peer with negotiation configured correctly |
| `signAtomAgentCard` / `verifyAtomAgentCard` | Card signing and verification with `did:key` |
