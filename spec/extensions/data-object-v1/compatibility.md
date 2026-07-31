# Compatibility — Governed Object v1

## A2A protocol versions

This extension is specified against **A2A v1.0**, which provides:

- a `mediaType` member on message parts;
- a message-level `extensions` member.

**A2A v0.3** lacked both. Interoperability notes:

- Receivers MUST accept GO parts identified by media type even when
  `message.extensions` is absent (v0.3 peers cannot populate it).
- Senders SHOULD still duplicate `mediaType` inside the part's `data` object
  when speaking to mixed v0.3/v1.0 deployments, per the encapsulation rules in
  [draft-chapman-a2a-mls-00](../../draft-chapman-a2a-mls-00.md).
- Agent Cards that list both v1.0 and v0.3 interfaces on the same endpoint MAY
  be used; this extension does not require dual interfaces.

## Unknown extensions

Receivers MUST ignore unknown entries in `capabilities.extensions`,
`message.extensions`, and `A2A-Extensions` that they do not implement. Presence
of additional URIs MUST NOT by itself cause rejection of otherwise valid GO
parts.

## Optional card declaration

This extension's Agent Card entry uses `required: false`. Peers that never
declare the URI remain reachable for non-GO traffic. GO parts remain verifiable
by media type regardless of card or header advertisement.

## Forward compatibility of the envelope

Unknown members inside `semantic` or `payload` SHOULD be preserved through
verify-and-forward paths where possible. The reference verifier currently
retains only known `governance` keys when normalising input; profiles that need
to forward unknown governance members MUST document that behaviour separately.
Verifiers MUST still canonicalise only the members included in the signed
subset defined by the draft (and MUST fail closed on signature failure). New
top-level GO members require a new extension URI if they affect the signed set
or verification rules.
