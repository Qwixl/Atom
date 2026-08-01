# Security considerations — Transcript Accountability v1

## What this profile provides

* **Sender attributability of accept:** a verified `room:receipt` is a
  host-signed commitment that a specific `objectHash` was accepted at `seq`.
* **Ordering claim attributability:** a verified `room:checkpoint` is a
  host-signed ordering claim over a contiguous signed range; compare yields
  `agree` / `contradict` / `incomplete`.
* **Substitution detection without receipts:** member reconcile of served
  plaintext versus signed payload (prerequisite) catches host substitution
  independently of this profile's receipt/checkpoint surfaces.

## What this profile does not provide

| Threat | Honest limit |
|---|---|
| Accept-and-withhold from members | Members see `omitted` via reconcile; **owner UI MUST NOT** label that as host guilt without a receipt-aware path |
| Reorder with only host-served history | A single matching checkpoint against host-only history may not surface reorder |
| Sender-manufactured gap | No receipt → `incomplete`, not host guilt |
| Checkpoint starvation | Host never mints → `incomplete` (deniability within the verdict set) |
| Split-view / equivocation | **Not detected** without gossip or an audit-layer equivalent |
| Indefinite archives | Retention windows bound dispute evidence |

## Delivery path

Receipts and checkpoints travel **out-of-band** relative to MLS application
fan-out verification allowlists. Implementations MUST NOT weaken fan-out
`ROOM_PURPOSES`-style verify by admitting receipts/checkpoints as ordinary
room messages.

## Cross-sender disputes

Member A MUST NOT conclude host guilt for member B's dropped message without
B's exported receipt. Export and third-party dispute packaging are outside
this profile's normative surface.
