# Personal demo

One command — your agent, your LLM key, your calendar feed.

```bash
pnpm dev:demo
```

Open `http://localhost:5200` and follow the numbered panel on the left:

1. Agent running (automatic)
2. Paste LLM API key
3. Paste secret iCal / WebCal feed URL
4. Send the scheduling prompt; pick a slot
5. Confirm in shell chrome → Google Calendar opens prefilled → click Save

Read-only calendar via WebCal; no Google OAuth module.

Full detail: [PERSONAL-DEMO.md](https://github.com/Qwixl/Atom/blob/main/PERSONAL-DEMO.md).

For MLS + counterpart agent, see [Demo peer agent](./demo-peer.md).
