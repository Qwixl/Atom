# @qwixl/agent-backend

## 0.7.1

### Patch Changes

- fcb6daa: Interactive port conflict prompt on CLI startup: try next port [p] or kill listener and retry [k] when default PORT is busy.

## 0.7.0

### Minor Changes

- 1a1d2a8: M12 business agent: commerce intent/offer/decline objects, business owner-store schema, catalog matching, domain verification tier 1, business admin routes, shell commerce UX and catalog sync.

### Patch Changes

- Updated dependencies [1a1d2a8]
  - @qwixl/a2a-transport@0.8.0
  - @qwixl/owner-store@0.8.0
  - @qwixl/agent-llm@0.1.5
  - @qwixl/ag-ui-adapter@0.8.0

## 0.6.0

### Minor Changes

- M11.3–M11.7: two-party transaction commit, qualify VC presentations, bilateral dispute channels, and commerce receipts in owner store.

### Patch Changes

- Updated dependencies
  - @qwixl/a2a-transport@0.7.0
  - @qwixl/owner-store@0.7.0
  - @qwixl/ag-ui-adapter@0.7.0

## 0.5.1

### Patch Changes

- 3139ccd: Fix `setup:stripe` script entry-point detection on Windows (tsx passes a plain path, not a file URL).

## 0.5.0

### Minor Changes

- bfdaba7: M11.2 PaymentRail: Stripe manual-capture adapter, `/payments/{hold,capture,release}` admin routes minting signed transaction objects, `setup:stripe` catalog script.

## 0.4.2

### Patch Changes

- Updated dependencies [d98546c]
- Updated dependencies [d98546c]
  - @qwixl/agent-llm@0.1.4
  - @qwixl/a2a-transport@0.6.0

## 0.4.1

### Patch Changes

- Updated dependencies [6370756]
- Updated dependencies [6370756]
  - @qwixl/agent-llm@0.1.3
  - @qwixl/owner-store@0.5.0
  - @qwixl/ag-ui-adapter@0.5.0

## 0.4.0

### Minor Changes

- 41d7248: M10: merge shell-forwarded atomProfile into AG-UI LLM system prompt.

### Patch Changes

- Updated dependencies [41d7248]
- Updated dependencies [41d7248]
- Updated dependencies [41d7248]
  - @qwixl/ag-ui-adapter@0.4.0
  - @qwixl/agent-llm@0.1.2
  - @qwixl/owner-store@0.4.0

## 0.3.0

### Minor Changes

- c99dfac: M9: Google Calendar CalDAV proxy (`/calendar/*`) and `POST /actions/reserve` for signed soft-hold objects.

### Patch Changes

- Updated dependencies [c99dfac]
  - @qwixl/a2a-transport@0.3.0

## 0.2.0

### Minor Changes

- b353746: M8 Phase 2: coordination data objects, agent-backend `/coordination/*` routes, CommsPanel scheduling/RSVP, module store `ModulePricing` and Settings catalog.

### Patch Changes

- Updated dependencies [b353746]
  - @qwixl/a2a-transport@0.2.0
  - @qwixl/shell-core@0.2.0
  - @qwixl/ag-ui-adapter@0.2.0
  - @qwixl/agent-llm@0.1.1

## 0.1.2

### Patch Changes

- M7 completion: `POST /agent` AG-UI SSE on agent-backend with server-side LLM keys; publish `@qwixl/agent-llm` for npm-only installs.
- Updated dependencies
  - @qwixl/agent-llm@0.1.0

## 0.1.1

### Patch Changes

- M7 reference shell comms panel; browser-safe invitation tokens; publishable `atom-agent` CLI and Docker self-host packaging.
- Updated dependencies
  - @qwixl/a2a-transport@0.1.3
