---
title: "Offline Delivery and Reachability for Agent-to-Agent Messaging"
abbrev: "A2A Offline Delivery"
docname: draft-chapman-a2a-offline-delivery-00
category: exp
submissionType: independent

ipr: trust200902
area: Security
workgroup: Independent Submission
keyword:
 - A2A
 - offline
 - store-and-forward
 - reachability
 - agent

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
  RFC8259:

informative:
  RFC7942:
  A2A:
    title: "Agent2Agent (A2A) Protocol Specification, Version 1.0"
    target: https://a2a-protocol.org/
    author:
      - org: "A2A Project (Linux Foundation)"
    date: 2026
  GOMLS:
    title: "End-to-End Encryption and Purpose-Bound Governance for Agent-to-Agent Messaging"
    target: https://datatracker.ietf.org/doc/draft-chapman-a2a-mls/
    author:
      - ins: L. D. Chapman
    date: 2026

--- abstract

Agent-to-agent protocols assume a live HTTP or streaming hop. Many deployments
cannot keep every agent always reachable: devices sleep, cost tiers duty-cycle
backends, and operators park agents outside business hours. Senders need a
machine-readable asleep signal, a bounded expectation for store-and-forward,
and validation rules so an offline agent is not a spam sink and does not act on
forged or expired messages after wake.

This document profiles offline delivery and reachability for A2A-style
JSON-RPC messaging. It defines abstract reachability modes, an asleep refusal
signal, queue bounds and distinct queue-full errors, validate-on-dequeue
requirements, and split delivery semantics (durable persist versus notify). It
is independent of Messaging Layer Security (MLS) grouping; deployments that
also use {{GOMLS}} MAY apply both profiles.

--- middle

# Introduction

{{A2A}} and similar agent protocols secure the transport hop and authenticate
callers, but leave recipient availability underspecified. Roadmaps often name
streaming reliability and push notification gaps without a minimal offline
profile that a second implementation can falsify.

This document specifies that minimal profile:

* abstract reachability modes and how they map to live accept versus
  store-and-forward;
* an asleep signal at the HTTP transport layer, with a recommended JSON-RPC
  error mapping for generic clients;
* bounded opaque store-and-forward with validate-on-dequeue;
* honest backpressure when queues cannot accept further messages;
* security considerations for spam sinks, disk exhaustion, and wake storms.

The profile is intentionally narrow. It does not specify push-notification
vendor APIs, email bridging, MLS group persistence, or payment authorisation.

# Conventions and Definitions

{::boilerplate bcp14-tagged}

The term **Governed Object** refers to a signed, purpose-bound, expiring
message envelope as described in {{GOMLS}}. Implementations that do not use
Governed Objects MUST still apply equivalent authenticity, expiry, and replay
checks before acting on dequeued application payloads.

# Reachability Modes

Implementations MUST document which abstract mode(s) they expose:

| Abstract mode | Live inbound | Store-and-forward |
|---|---|---|
| AlwaysAvailable | Accept | Not required |
| SessionOnly | Accept while session active | MUST NOT queue for later auto-delivery |
| PeriodicallyAvailable | Accept inside a published window | MAY queue outside the window |
| UnavailableStoreForward | Refuse live processing | MAY queue within bounds |

Informative Atom names: `always_on`, `session`, `hourly_wake`, `sleep`.

# Asleep Signal

When an implementation refuses live processing because the agent is not
currently accepting work (UnavailableStoreForward, or PeriodicallyAvailable
outside its window), it MUST signal refusal with a machine-readable error
token. This document uses the token `agent_asleep`.

## HTTP transport profile

For HTTP JSON-RPC endpoints (for example A2A `message/send`):

* HTTP status MUST be **503** when the request was refused for reachability
  and the payload **was** accepted into the offline queue (`queued` true).
* The response body MUST be JSON {{RFC8259}} containing at least:
  `error` (string, `agent_asleep`), `message` (string), and `queued`
  (boolean).
* When the next accept window is known, the response SHOULD include
  `retryAfterSec` (non-negative integer seconds) and SHOULD set the HTTP
  `Retry-After` header to the same value.

Example:

~~~
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=utf-8
Retry-After: 840

{"error":"agent_asleep","message":"asleep, try later","queued":true,"retryAfterSec":840}
~~~

## JSON-RPC mapping

Generic JSON-RPC clients may ignore HTTP status and only parse JSON-RPC error
objects. Implementations that wrap the asleep signal in a JSON-RPC error
object SHOULD use:

* `code`: `-32003` (implementation-defined server error in the reserved
  range), or a future registry code if standardised;
* `message`: a short human string;
* `data.error`: `agent_asleep`;
* `data.queued`: boolean as above;
* `data.retryAfterSec`: optional.

Deployments MAY expose both shapes (HTTP 503 body and JSON-RPC error) during
transition; they MUST NOT claim a message was queued unless enqueue succeeded.

# Store-and-Forward

An implementation that queues for offline recipients:

* MAY store opaque ciphertext or protocol frames without decrypting them;
* MUST bound the queue by maximum message count, maximum total bytes, and
  maximum pending messages per peer;
* MUST apply a time-to-live to each queue record and purge or reject expired
  records;
* MUST authenticate the transport caller before enqueue when the deployment
  advertises authenticated A2A access, so unauthenticated traffic cannot fill
  the queue.

Recommended reference bounds (informative): 500 messages, 2 MiB total, 50
pending per peer, 7-day default queue TTL. Implementations MUST publish their
actual bounds.

## Identity for per-peer caps

Per-peer accounting MUST bind a **verified transport caller identity** (for
example the DID authenticated by the A2A transport token). Implementations
MUST NOT use unverified body fields (such as an application-level
`issuerDid` scraped from ciphertext or plaintext JSON) as the sole peer-cap
key.

# Validate-on-Dequeue

Before an implementation acts on a dequeued Governed Object (or equivalent
application payload), it MUST:

* verify authenticity and governance constraints (signature, purpose policy,
  object TTL) using wall-clock time at dequeue — not only enqueue time;
* reject replayed object identifiers via a replay cache that survives process
  restart where the queue itself survives restart;
* drain or otherwise discard queue records that fail validation so they do not
  block later messages indefinitely.

Opaque non-application blobs MAY remain deferred until a suitable processor
exists; they MUST still respect queue TTL and bounds.

Implementations MUST NOT automatically perform consequential side effects
(payment capture, secret disclosure, irreversible external mutation) solely
because a message was dequeued after wake. Owner or policy confirmation
remains out of band to this profile.

# Delivery Semantics

This profile splits two layers:

1. **Persistence.** Queue records that were successfully enqueued MUST survive
   process restart for their remaining TTL (at-least-once storage).
2. **Notify after validation.** After validate-on-dequeue, implementations
   that remove the record before durable application accept provide
   **at-most-once notify**. Receivers MUST be idempotent on object `id` via
   the replay cache.

Implementations that retain the queue record until durable accept (true
at-least-once notify) MUST document that path. The reference behaviour
described here is the split path above.

# Backpressure

When a queue cannot accept a new message because a bound would be exceeded,
the implementation MUST signal failure distinctly from `agent_asleep`.

* Error token: `asleep_queue_full`
* HTTP status: **507** for global message or byte caps; **429** for per-peer
  caps
* Response body MUST include `error` (`asleep_queue_full`), `queued` false,
  and SHOULD include `kind` (`messages`, `bytes`, or `peer`)

The token `agent_asleep` MUST NOT be returned when enqueue failed. A
successful asleep response MUST set `queued` true only after enqueue
succeeds.

# Security Considerations

Offline queues are attractive spam and disk-exhaustion targets. Bounds,
transport authentication before enqueue, and per-peer caps mitigate that.
Validate-on-dequeue prevents acting on forged, expired, or replayed objects
that sat in storage. Distinct queue-full signals prevent senders from
treating a refused enqueue as a successful store.

Wake windows SHOULD be jittered across agents to reduce thundering herds.
Ciphertext queued for an owner MUST remain under owner-volume custody where
the deployment model separates control-plane and owner storage.

# IANA Considerations

This document makes no requests of IANA.

# Implementation Status

NOTE: Please remove this section and the reference to {{RFC7942}} before
publication as an RFC.

Atom implements this profile in its agent backend asleep-queue and
reachability modules. Evidence includes restart persistence, queue bounds,
expiry-while-queued, replay rejection on dequeue, sleep 503 with enqueue,
hourly wake Retry-After behaviour, and distinct `asleep_queue_full` responses
when enqueue fails.

--- back

# Acknowledgments

Review comments on companion Governed Object / MLS work informed the
validate-on-dequeue and purpose-governance posture referenced here.
