# Self-hosting the Atom agent backend

Owner-controlled agent backend for Phase 1 private comms: **did:key** identity, signed data objects, **MLS E2E** over **A2A**. MLS keys and signing keys never enter the browser shell (D017).

## What you get

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness + agent DID |
| `GET /inbox` | Received signed data objects |
| `POST /invite` | Mint contact invitation token |
| `POST /mls/connect` | Establish MLS pair session (`peerUrl` or `invite`) |
| `POST /send` | Send signed data object (plain or MLS-encrypted) |
| `POST /coordination/scheduling-proposal` | Send scheduling proposal (`title`, `slots`, `peerUrl`, `peerDid`, `encrypt?`) |
| `POST /coordination/scheduling-response` | Reply to proposal (`proposalId`, `response`, `slotId?`) |
| `POST /coordination/rsvp` | Send RSVP request (`eventTitle`, `eventAt`, `location?`) |
| `POST /coordination/rsvp-response` | Reply to RSVP (`rsvpId`, `response: yes\|maybe\|no`) |
| `GET /connectors/webcal/status` | WebCal feeds configured (read-only ICS) |
| `POST /connectors/webcal/invoke` | `getStatus` or `listEvents` (vault custody) |
| `POST /connectors/webcal/feeds` | Add ICS/WebCal feed URL to vault |
| `DELETE /connectors/webcal/feeds/:feedId` | Remove a feed |
| `POST /actions/reserve` | Mint `action:reserve` object (`refId`, `refKind`, `attestationRef`; optional peer send) |
| `GET /payments/status` | Stripe rail configured + publishable key + product id |
| `POST /payments/hold` | Place Stripe auth hold + mint `action:hold` (`transactionId`, `attestationRef`, `paymentMethodId`, `amountMinor`, `currency`) |
| `POST /payments/capture` | Capture hold + mint `action:capture` + `action:receipt` |
| `POST /payments/release` | Cancel hold + mint `action:release` |
| `POST /agent` | AG-UI SSE endpoint (LLM when `LLM_API_KEY` set). Shell forwards owner profile via `forwardedProps.atomProfile`. |
| `/.well-known/agent-card.json` | A2A agent card |
| `/a2a/jsonrpc` | A2A JSON-RPC transport |

Wire contracts: [PROTOCOL-v1.md](./PROTOCOL-v1.md).

## Admin API authentication (M13)

All admin routes require a bearer token:

```http
Authorization: Bearer <admin-token>
```

- On first start, a token is generated and saved next to the identity file (`agent-admin-token.txt` under `ATOM_DATA_DIR`, or beside `ATOM_AGENT_IDENTITY_PATH`).
- The token is printed **once** at startup when newly created.
- Set `ATOM_ADMIN_TOKEN` to use a fixed token (Docker/CI/hosted deployments).

**Public (no bearer):** A2A JSON-RPC, `/.well-known/agent-card.json`, `GET /mls/key-package` (peer MLS handshake).

Shell: Comms panel → **Admin bearer token**.

### Export / import (M13.4)

```http
POST /admin/export   { "passphrase": "…" }   → { fileName, ciphertext }
POST /admin/import   { "passphrase": "…", "ciphertext": "…" }   → { restoredFiles }
```

Passphrase-encrypted bundle: identity, business catalog, MLS peer records.

### WebCal connector (M13.5)

Owners paste a **private ICS/WebCal feed URL** in Settings. Feed URLs stay encrypted in the agent vault (D044); no Google OAuth app verification.

```http
GET  /connectors/webcal/status
POST /connectors/webcal/invoke   { "operation": "getStatus" | "listEvents", "input": { … } }
POST /connectors/webcal/feeds    { "url": "webcal://…", "label": "Work" }
DELETE /connectors/webcal/feeds/:feedId
```

Read-only — scheduling over MLS/comms does not auto-create calendar events. To add an event to Google Calendar after accepting a slot, the shell opens a prefilled Google Calendar URL (`action=TEMPLATE`) — no OAuth required.

## One command (npm)

Requires **Node 22+**.

```bash
# After @qwixl/agent-backend is published:
npx @qwixl/agent-backend

# Monorepo development:
pnpm install
pnpm build:packages
pnpm start:agent
```

Default admin URL: `http://127.0.0.1:5204`

In the reference shell → **Comms** → set **My agent (admin URL)** to that address.

## Docker

From a clone of this repo:

```bash
docker compose up atom-agent --build
```

Identity persists in the `atom-agent-data` volume at `/data/agent-identity.json`.

### Production behind a reverse proxy

Set `PUBLIC_BASE_URL` to the HTTPS URL clients use (for agent card + invitation tokens):

```bash
PUBLIC_BASE_URL=https://agent.example.com docker compose up atom-agent -d
```

Add your shell origin to CORS:

```bash
ATOM_SHELL_ORIGINS=https://shell.example.com docker compose up atom-agent -d
```

Bind is `0.0.0.0` inside the container; expose port `5204` or terminate TLS at the proxy.

## Environment

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5204` | Listen port. If unset and the default is busy in an interactive terminal, prompts: try another port `[p]` or kill and retry `[k]`. |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Bind address |
| `PUBLIC_BASE_URL` | `http://HOST:PORT` | Public URL in agent card and invites |
| `AGENT_NAME` | `Atom agent` | Label in invitations |
| `ATOM_DATA_DIR` | `~/.atom` | Data directory |
| `ATOM_AGENT_IDENTITY_PATH` | `$ATOM_DATA_DIR/agent-identity.json` | Identity key file |
| `ATOM_SHELL_ORIGINS` | — | Extra comma-separated CORS origins for shell admin API |
| `LLM_API_KEY` | — | OpenAI-compatible API key for `POST /agent` (also accepts `OPENAI_API_KEY`) |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Model name for AG-UI responses |
| `STRIPE_SECRET_KEY` | — | Stripe secret key for payment hold/capture/release (`sk_test_...` or `sk_live_...`) |
| `STRIPE_PUBLISHABLE_KEY` | — | Stripe publishable key for shell Stripe.js (`pk_test_...` or `pk_live_...`) |
| `ATOM_STRIPE_PRODUCT_ID` | — | Stripe Product id from catalog setup (optional; groups holds in Dashboard) |

## Stripe catalog setup

Qwixl uses **dynamic-amount** PaymentIntents with manual capture (authorization holds). A Stripe Product is still useful for Dashboard reporting.

```bash
# One-time setup (test or live key):
STRIPE_SECRET_KEY=sk_live_... pnpm --filter @qwixl/agent-backend setup:stripe
```

The script creates (or reuses) **Atom Agent Commerce** product + a €1.00 placeholder price, then prints `ATOM_STRIPE_PRODUCT_ID` for your environment.

Hold flow (after owner confirms in shell chrome):

1. Shell collects a payment method via Stripe.js using `STRIPE_PUBLISHABLE_KEY`.
2. Shell calls `POST /payments/hold` with `paymentMethodId`, `amountMinor`, `currency`, `attestationRef`.
3. Agent-backend places a manual-capture PaymentIntent and returns signed `action:hold`.
4. After mutual confirm, `POST /payments/capture` or `POST /payments/release` on decline/timeout.

Never put `STRIPE_SECRET_KEY` in the browser — server-side only (D017).

### Deploy checklist (Stripe live)

Set on every agent-backend deployment:

| Variable | Example |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `ATOM_STRIPE_PRODUCT_ID` | `prod_Uow5DYOhPM0O0k` (from `setup:stripe`) |

## M11.3 transaction commit (two-party)

Choreography: payer offers hold → payee confirms in shell → payer captures → receipt to both.

| Route | Purpose |
|---|---|
| `POST /transactions/offer` | Payer: place hold + send `action:hold` + payer `action:confirm` to peer |
| `POST /transactions/confirm` | Local party confirm; sends `action:confirm`; payer auto-captures when both confirms present |
| `POST /transactions/decline` | Release hold (payer) or notify payer to release (payee) |
| `GET /transactions` | List in-memory commit states (sweeps expired holds) |
| `GET /transactions/:transactionId` | Single commit state |
| `GET /qualify` | List qualify presentations (`?subjectId=` optional filter) |
| `POST /qualify/present` | Mint `action:qualify` with VC/PSI presentation; optional peer send |
| `GET /channels` | List bilateral dispute channel snapshots |
| `GET /channels/:transactionId` | Channel log + anchors for a transaction |
| `POST /channels/:transactionId/anchor` | Sign selective head-hash anchor; optional peer send |

Shell payee UX: incoming `action:hold` in comms thread → Confirm / Decline (shell chrome attestation required).

## M11.6 qualify (VC presentation)

Before ring-fence, counterpart may require `action:qualify` with a VC/SD-JWT presentation and minimal claim summary (`eligible`, `fundsAvailable`, etc.). Issuer trust and full VC crypto verify are policy-layer concerns; the protocol verifies the signed Atom envelope only.

## M11.7 dispute channels

Each transaction builds an append-only bilateral channel of signed object fingerprints. `POST /channels/:transactionId/anchor` exports a signed head hash for external notarization (selective anchoring — not every event is anchored).

## M12 business agent (commerce)

Business agents use the same backend with `ATOM_BUSINESS_MODE=true`. Catalog lives in-memory on the server; sync from the shell profile panel or manage via admin routes.

| Route | Purpose |
|---|---|
| `GET /business/catalog` | List catalog items |
| `POST /business/catalog` | Upsert one catalog item (`catalogItemId`, `label`, `currency`, `amountMinor`, …) |
| `POST /business/catalog/sync` | Replace catalog from `{ items: [...] }` |
| `DELETE /business/catalog/:catalogItemId` | Remove catalog item |
| `GET /business/verification` | Current tier-1 domain verification (re-checks DNS/well-known) |
| `POST /business/verification/claim` | Claim domain `{ domain }` — automated tier-1 proof |
| `POST /business/verification/revoke` | Revoke verification `{ reason? }` |
| `POST /business/intent` | Send `commerce:intent` to peer (`intentId`, `catalogItemId` or `query`, `replyUrl`, `peerUrl`, `peerDid`) |
| `POST /business/offer` | Manual offer reply (`intentId`, `catalogItemId`, `peerUrl`, `peerDid?`) |

With business mode enabled, inbound `commerce:intent` objects are matched against the catalog; the agent replies with signed `commerce:offer` or `commerce:decline` to the buyer's `replyUrl`.

Domain verification (tier 1, D039): publish DNS TXT at `_atom.<domain>` with `atom-did=<agent-did>`, or serve a matching agent card at `https://<domain>/.well-known/agent-card.json`. For local dev, set `ATOM_BUSINESS_DOMAIN=example.com` to grant tier 1 without DNS.

| Variable | Default | Description |
|---|---|---|
| `ATOM_BUSINESS_MODE` | off | `true` or `1` — enable catalog, intent ingestion, business agent card fields |
| `ATOM_BUSINESS_DOMAIN` | — | Dev shortcut: grant tier-1 domain verification without DNS |

Agent card includes optional `business` extension when verified: `verificationTier`, `businessDomain`, `tierLabel`.

## AG-UI (shell chat)

The reference shell can point its AG-UI transport at the same backend as comms:

```
http://127.0.0.1:5204/agent
```

Set `LLM_API_KEY` (or `OPENAI_API_KEY`) on the agent backend process. Without a key, `POST /agent` returns a short fallback message; use `pnpm dev:ag-ui` for the mock scenario server during local development.

## Connect two agents

```bash
# Agent A
pnpm start:agent

# Agent B (second terminal)
PORT=5205 PUBLIC_BASE_URL=http://127.0.0.1:5205 pnpm start:agent
```

In the shell **Comms** panel on each side: copy invite from A, connect from B, send encrypted messages.

## Security notes

- Identity file contains the Ed25519 private key — restrict permissions (`0600`) and back up safely.
- MLS session state is in-memory; process restart requires re-handshake (D025).
- Admin API has no auth in v1 — bind to localhost or protect with network policy / reverse-proxy auth before exposing publicly.

## Related

- [PROTOCOL-v1.md](./PROTOCOL-v1.md) — data objects, MLS, invitations
- [SECRET-STORE.md](./SECRET-STORE.md) — shell credential adapters (separate from agent keys)
