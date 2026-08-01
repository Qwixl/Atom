# A2A Extension: Offline Delivery v1

**Status:** Candidate (repository-hosted; Class D external announcement pending)  
**Identifier:** `https://atom.qwixl.dev/a2a/offline-delivery/v1`  
**Decision:** D134 / ST-04c

## Abstract

This document specifies an A2A protocol extension that advertises support for
the offline-delivery / reachability profile defined in Internet-Draft
`draft-chapman-a2a-offline-delivery-00`. The draft owns wire semantics (asleep
signal, queue bounds, validate-on-dequeue, backpressure). This extension owns
**Agent Card discovery only**.

## Terminology

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this
document are to be interpreted as described in RFC 2119 and RFC 8174 when, and
only when, they appear in all capitals.

## Extension identifier

```
https://atom.qwixl.dev/a2a/offline-delivery/v1
```

A breaking change to the discovery contract MUST use a new URI. Non-breaking
clarifications MAY revise this document under the same URI.

## Scope (card-only)

This extension:

* MUST be declared only in Agent Card `capabilities.extensions`
* MUST NOT define a media type
* MUST NOT require stamping the URI into `message.extensions` or
  `A2A-Extensions` for ordinary message exchange
* MUST NOT redefine HTTP status codes or error tokens from
  `draft-chapman-a2a-offline-delivery-00`

## Agent Card declaration

| Field | Value |
|---|---|
| `uri` | `https://atom.qwixl.dev/a2a/offline-delivery/v1` |
| `required` | `false` |
| `params.mode` | One of `sleep` \| `hourly_wake` (effective mode at card issue) |
| `description` | Human-readable string |

`required` MUST be `false`. A peer MUST NOT refuse other A2A traffic solely
because this URI is absent from a card.

### When to declare (Atom profile)

An implementation that uses Atom reachability modes MUST declare this extension
when its **effective** reachability mode is `sleep` or `hourly_wake`. It MUST
NOT declare this extension solely because JSON-RPC is enabled when the
effective mode is `always_on` or `session` (those modes do not enter
store-and-forward enqueue).

The `mode` param MUST reflect `effectiveReachabilityMode()` (including
force-always-on / community-host overrides), not an unused env string.

### Fixed wire tokens (not card params)

| Token | Role |
|---|---|
| `agent_asleep` | Asleep refusal after successful enqueue (`queued: true`) |
| `asleep_queue_full` | Cap refusal (`queued: false`) |
| `asleep_enqueue_requires_auth` | Store-forward refused without verified transport DID (Atom as-built; candidate for offline draft `-01`) |

Cards MUST NOT advertise alternate asleep/queue-full tokens.

## Sender behaviour

* Senders MAY treat `params.mode` as a **hint** only.
* Runtime HTTP responses (503 / 507 / 429 / 401 with the tokens above) are
  **authoritative** over a stale signed card.
* Senders MUST handle asleep / queue-full / auth-refusal responses even when
  the card is absent, outdated, or omitted this extension.

## Normative reference

Wire behaviour: Internet-Draft `draft-chapman-a2a-offline-delivery-00`
(https://datatracker.ietf.org/doc/draft-chapman-a2a-offline-delivery/).

## Security considerations

See [security.md](./security.md).
