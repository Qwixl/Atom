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

## Discover

`discover-index.seed.json` — seed listings (`agentKind: swarm-npc`). Police is internal.
