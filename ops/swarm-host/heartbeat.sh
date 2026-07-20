#!/usr/bin/env bash
# Atom swarm liveness. Cron:
#   */15 * * * * /home/qwixl/atom/repos/atom/ops/swarm-host/heartbeat.sh >>/home/qwixl/atom/logs/heartbeat.log 2>&1

set -euo pipefail

ENV_FILE="${HOME}/atom/secrets/agent.env"
STATE_DIR="${HOME}/atom/state/heartbeat"
NPC_DIR="${HOME}/atom/state/npcs"
LOG_DIR="${HOME}/atom/logs"
mkdir -p "${STATE_DIR}" "${LOG_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOST="$(hostname -s 2>/dev/null || hostname)"
REDIS_OK=0
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -u "${ATOM_REDIS_URL:-redis://127.0.0.1:6379/0}" ping 2>/dev/null | grep -q PONG; then
    REDIS_OK=1
  fi
elif docker ps -qf name=atom-bus >/dev/null 2>&1; then
  cid="$(docker ps -qf name=atom-bus | head -n1)"
  if [[ -n "${cid}" ]] && docker exec "${cid}" redis-cli ping 2>/dev/null | grep -q PONG; then
    REDIS_OK=1
  fi
fi

NPC_UP=0
NPC_TOTAL=0
if [[ -d "${NPC_DIR}" ]]; then
  for meta in "${NPC_DIR}"/*/meta.json; do
    [[ -f "${meta}" ]] || continue
    NPC_TOTAL=$((NPC_TOTAL + 1))
    dir="$(dirname "${meta}")"
    port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("port",""))' "${meta}" 2>/dev/null || true)"
    token=""
    if [[ -f "${dir}/admin.token" ]]; then
      token="$(tr -d '\n\r' <"${dir}/admin.token")"
    fi
    if [[ -n "${port}" ]] && [[ -n "${token}" ]] && \
      curl -fsS --max-time 2 -H "Authorization: Bearer ${token}" \
        "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      NPC_UP=$((NPC_UP + 1))
    fi
  done
fi

OUT="${STATE_DIR}/heartbeat.json"
cat >"${OUT}.tmp" <<EOF
{
  "ts": "${TS}",
  "host": "${HOST}",
  "stack": "atom",
  "kill_switch": "${ATOM_KILL_SWITCH:-0}",
  "redis_ok": ${REDIS_OK},
  "npcs_up": ${NPC_UP},
  "npcs_total": ${NPC_TOTAL},
  "agent_env": "${ENV_FILE}"
}
EOF
mv "${OUT}.tmp" "${OUT}"
echo "atom heartbeat ok ${TS} redis_ok=${REDIS_OK} npcs=${NPC_UP}/${NPC_TOTAL}"
