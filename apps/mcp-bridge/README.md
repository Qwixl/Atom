# Atom MCP→AG-UI bridge (BK-16)

AG-UI face in, MCP tool loop out — for MCP-native brains that do not implement Atom CUSTOM events directly.

## Run locally

```bash
# stdio brain (example: npx @modelcontextprotocol/server-everything)
export MCP_BRAIN_COMMAND=npx
export MCP_BRAIN_ARGS="-y @modelcontextprotocol/server-everything"
export MCP_BRAIN_TOOL=echo
pnpm --filter @qwixl/mcp-bridge dev
```

Shell → Settings → Chat → AG-UI URL: `http://127.0.0.1:5211/agent`

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5211` | HTTP listen port |
| `MCP_BRAIN_TRANSPORT` | `stdio` | `stdio` or `streamable-http` |
| `MCP_BRAIN_COMMAND` | — | stdio spawn command |
| `MCP_BRAIN_ARGS` | — | stdio args (space-separated) |
| `MCP_BRAIN_URL` | — | Streamable HTTP endpoint |
| `MCP_BRAIN_AUTH_HEADER` | — | Optional Authorization header |
| `MCP_BRAIN_TOOL` | `chat` | MCP tool name to invoke each turn |
| `ATOM_SHELL_ORIGINS` | localhost shell ports | CORS allowlist |

## Brain tool contract

The bridge calls one MCP tool per turn with:

```json
{
  "kind": "user-text | ui-event | action-decision | data-disclosure | connector-result",
  "message": "raw shell message (bracket protocol preserved)",
  "threadId": "…",
  "messages": [{ "role": "user", "content": "…" }],
  "atomProfile": { … }
}
```

Tool output may be plain text, `{ "type": "text", "text": "…" }`, other Atom `AgentOutput` shapes, or `{ "type": "connector-invoke", … }` for shell connector passthrough.

Pair with **atom-agent** (body) for A2A, vault, and connector execution — same brain/body split as `apps/brain-stub`.
