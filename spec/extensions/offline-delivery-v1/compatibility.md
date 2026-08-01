# Compatibility — Offline Delivery v1

* A2A v1.0 Agent Cards: declare under `capabilities.extensions`.
* Peers that ignore unknown extensions remain interoperable (`required: false`).
* Omitting this URI MUST NOT weaken Governed Object media-type verification or
  other Atom extensions.
* Future offline-delivery draft revisions (`-01`, …) keep this URI unless the
  discovery contract itself breaks (then bump to `/v2`).
