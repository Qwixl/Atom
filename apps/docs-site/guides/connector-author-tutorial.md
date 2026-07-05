# Connector author tutorial (M14.5b)

Agent-backend connectors store owner secrets in the encrypted vault and expose **invoke** operations to the shell. This track uses **`connectors/webcal`** as the worked example — read-only ICS/WebCal feeds, no Google OAuth app verification.

## 1. Vault slot

Connector credentials live in `ConnectorVault` (`packages/agent-backend/src/connectorVault.ts`):

- WebCal: encrypted feed URLs keyed by feed id

Never return raw URLs from status or invoke responses.

## 2. Admin routes

Register routes in `connectorAdmin.ts`:

```http
GET  /connectors/:connectorId/status
POST /connectors/:connectorId/invoke   { "operation": "…", "input": { … } }
POST /connectors/webcal/feeds          { "url": "…", "label": "…" }
DELETE /connectors/webcal/feeds/:feedId
```

All routes require `Authorization: Bearer <admin-token>`.

## 3. Operations contract

Each connector declares operations with `read` or `write` permission.

WebCal example:

| Operation | Permission | Input |
|---|---|---|
| `getStatus` | read | — |
| `listEvents` | read | `timeMin`, `timeMax` (ISO 8601); optional `feedId` |

## 4. Settings UI (shell-owned)

Calendar connector UI lives in the reference shell as plain React (`WebCalSettingsPanel`) — not a registry iframe module. Registry module `connectors/webcal` documents the connector contract for third-party shells that load settings surfaces from the catalog.

## 5. Local test

```bash
pnpm build:packages
pnpm start:agent
pnpm dev
```

Settings → WebCal → paste feed URL → Save. Comms panel must have admin URL + bearer token configured.

## Related

- Renderer module track: [Module author tutorial](./module-author-tutorial.md)
- Agent backend reference: [Agent backend](../reference/agent-backend.md)
