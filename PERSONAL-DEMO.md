# Personal demo (recommended first run)

One command starts the reference shell and **your** agent backend. Follow the step-by-step panel on the left — your LLM key, your WebCal feed, your real calendar.

```bash
pnpm install
pnpm dev:demo
```

Open **http://localhost:5200**. Leave the demo terminal running; press **Ctrl+C** to stop.

## What runs

| Service | URL | Notes |
|---|---|---|
| Shell | http://localhost:5200 | Reference UI (`VITE_DEMO_MODE=1`) |
| Your agent | http://127.0.0.1:5204 | Dev token `atom-demo-alice-token` (demo only) |

Agent state lives in `~/.atom-demo-alice` (separate from production `~/.atom`).

## Steps (matches the UI)

1. **Your agent is running** — automatic when services are up.
2. **Add your LLM API key** — paste an OpenAI-compatible key; enables Live LLM for scheduling.
3. **Connect your calendar feed** — paste the **secret iCal / WebCal URL** from Google Calendar (or Apple/Outlook). Stored encrypted on your agent; read-only for busy/free context.
4. **Ask your agent to schedule a meeting** — click **Send this message** (`Schedule a team standup next week`); pick a slot in the chat.
5. **Add the meeting to your calendar** — confirm in shell chrome; **Google Calendar opens prefilled** — click **Save** there (no OAuth; WebCal feeds are read-only).
6. **Done**

## Calendar model

- **Read availability:** WebCal / ICS feed URL in the agent vault (`connectors/webcal`).
- **Write an event:** Shell opens Google Calendar with a prefilled `action=TEMPLATE` URL after you approve — you save in Google's UI.

There is no Google Calendar OAuth module in Atom.

## Not this command

For MLS + automatic proposal from a **counterpart agent**, see [DEMO-PEER.md](./DEMO-PEER.md) (`pnpm dev:demo-peer` + first-run wizard).
