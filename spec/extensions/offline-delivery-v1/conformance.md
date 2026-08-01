# Conformance — Offline Delivery v1

Card-declaration checks (Atom reference):

1. URI exactly `https://atom.qwixl.dev/a2a/offline-delivery/v1`
2. `required === false`
3. When declared, `params.mode` ∈ {`sleep`, `hourly_wake`}
4. Not declared when effective mode is `always_on` or `session`
5. Peer absence of URI does not block other extensions / GO verify

Wire asleep / queue-full behaviour is governed by
`draft-chapman-a2a-offline-delivery-00` and **ST-04-vectors** (D110) — not by
this package alone.
