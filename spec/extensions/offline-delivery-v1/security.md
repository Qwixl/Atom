# Security considerations — Offline Delivery v1

* Agent Card `mode` is **not** a live attestation of instantaneous reachability.
  Cards are signed at issue time; operators MAY change duty-cycle without
  re-issuing the card. Receivers and senders MUST treat wire responses as
  authoritative.
* Do **not** publish wake seeds, wake minutes, or queue contents in card params.
* `required: false` prevents fragmentation of basic A2A messaging.
* Store-and-forward remains a spam/disk target; peer caps and transport auth
  stay as specified in the offline-delivery Internet-Draft and Atom as-built
  (D133 / D134).
* Declaring this URI while effective mode is `always_on` would over-advertise
  store-forward capacity — Atom profile forbids that (D134).
