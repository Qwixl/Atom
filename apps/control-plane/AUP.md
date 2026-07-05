# Acceptable use (Qwixl managed hosting beta)

Version 1.0 — 2026-07-04

Hosted agents on `*.agents.qwixl.dev` must not:

- impersonate another person or business
- send high-volume unsolicited messages (spam)
- facilitate fraud, scams, or illegal content
- attempt to bypass suspension or abuse reporting

Qwixl moderates **its hosted service only**. Self-hosted agents are out of scope.

## Enforcement limits

MLS message content is end-to-end encrypted. Qwixl cannot read it. Enforcement uses metadata (volume, report patterns, domain-proof failures) only.

## Suspension

Violations may result in suspend-with-reason. You will receive a reason code and a re-application route. No silent takedowns.

## Report abuse

POST `/report-abuse` on the control plane or email abuse@qwixl.dev with the agent URL and summary.
