# WebCal connector (`connectors/webcal`)

Read-only calendar availability via **ICS/WebCal feed URLs** — no Google OAuth app verification.

## Owner flow

1. In Google Calendar, Apple Calendar, or Outlook, copy the **private iCal/WebCal subscription URL** for the calendar you want Atom to read.
2. Shell → **Settings** → **WebCal** section → paste URL → **Save feed to agent**.

The reference shell renders this as built-in React UI (`WebCalSettingsPanel`), not a registry iframe. Third-party shells may load the registry bundle from `connectors/webcal`. Feed URLs stay encrypted in the agent vault (D044).

## Agent API

```http
GET  /connectors/webcal/status
POST /connectors/webcal/invoke   { "operation": "getStatus" | "listEvents", "input": { … } }
POST /connectors/webcal/feeds    { "url": "webcal://…", "label": "Work" }
DELETE /connectors/webcal/feeds/:feedId
```

All routes require admin bearer token except none (no OAuth callback).

## Operations

| Operation | Permission | Description |
|---|---|---|
| `getStatus` | read | Feed count and labels (URLs never returned) |
| `listEvents` | read | `timeMin`, `timeMax` (ISO 8601); optional `feedId` |

No write operations — scheduling proposals over MLS/comms do not auto-create calendar events.
