# Atom swarm host (Optimus)

Canonical ops for the NPC ecosphere on `~/atom/` (separate from Qwixl `~/qwixl/`).

## Layout

```text
~/atom/secrets/agent.env      # LLM + kill switch + founder alert
~/atom/state/npcs/<id>/       # data dir, identity, admin.token, core.json
~/atom/state/pids/            # seed_start pid files
~/atom/logs/npcs/             # per-NPC stdout
~/atom/repos/atom/            # this git clone
```

## Bootstrap (once)

```bash
cd ~/atom/repos/atom
bash ops/swarm-host/bootstrap.sh
# edit ~/atom/secrets/agent.env
pnpm install
pnpm --filter @qwixl/agent-backend build
bash ops/swarm-host/seed_start.sh
bash ops/swarm-host/seed_core_sheets.sh
```

## Cron

```cron
*/15 * * * * /home/qwixl/atom/repos/atom/ops/swarm-host/heartbeat.sh >>/home/qwixl/atom/logs/heartbeat.log 2>&1
5 * * * * /home/qwixl/atom/repos/atom/ops/swarm-host/swarm_tick.sh >>/home/qwixl/atom/logs/swarm_tick.log 2>&1
```

Qwixl `scripts/atom_host_*.sh` wrappers exec these paths when `~/atom/repos/atom` is present.

## Kill switch

`ATOM_KILL_SWITCH=1` in `agent.env` — BrainScheduler skips; `swarm_tick.sh` exits early.

## Public fabric (Atom membership)

NPCs **compute** on Optimus; **addressing** is the DO fabric (`https://{port}.agents.atom.qwixl.com`).

Droplet has no Tailscale today — use reverse SSH so Caddy’s existing `*.agents… → 127.0.0.1:{port}` reaches Optimus:

```bash
# once: key at ~/.ssh/id_ed25519_atom_fabric authorized on root@209.97.183.106
bash ops/swarm-host/fabric_tunnel.sh start
# cron every 5m: fabric_tunnel.sh start  (no-op if up)

export ATOM_NPC_PUBLIC_URL_TEMPLATE='https://{port}.agents.atom.qwixl.com'
bash ops/swarm-host/fabric_apply_urls.sh   # stop+start NPCs with fabric PUBLIC_BASE_URL

curl -fsS -H "Authorization: Bearer $(cat ~/atom/state/npcs/mira-barista/admin.token)" \
  https://5401.agents.atom.qwixl.com/health
```

Laptop / air-gapped: omit the template (default `http://127.0.0.1:{port}`).

## Discover

`discover-index.seed.json` — seed listings (`agentKind: swarm-npc`). Shipped community index:
`apps/shell/public/community-index/index.json` (HTTPS hostUrl). Police is internal (omit from Discover).

## Operator dashboard (LAN)

Aggregates live NPC mood/goals/intents/memories/logs + police findings.

```bash
bash ops/swarm-host/dashboard_start.sh
# http://192.168.1.100:8080/  (or Tailscale IP :8080)
bash ops/swarm-host/dashboard_stop.sh
```
