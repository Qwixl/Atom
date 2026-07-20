#!/usr/bin/env bash
# Tick all seeded NPC / Police agents: POST /brain/tick (honours ATOM_KILL_SWITCH).
# Cron (hourly):
#   5 * * * * /home/qwixl/atom/repos/atom/ops/swarm-host/swarm_tick.sh >>/home/qwixl/atom/logs/swarm_tick.log 2>&1

set -euo pipefail

ENV_FILE="${HOME}/atom/secrets/agent.env"
NPC_DIR="${HOME}/atom/state/npcs"
CHRON_DIR="${HOME}/atom/state/chronicles"
mkdir -p "${CHRON_DIR}" "${HOME}/atom/logs"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "swarm_tick: missing ${ENV_FILE} — run bootstrap.sh first" >&2
  exit 2
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ "${ATOM_KILL_SWITCH:-0}" == "1" ]]; then
  echo "swarm_tick: kill switch on — skipping"
  exit 0
fi

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DAY="$(date -u +"%Y-%m-%d")"
FIRED=0
SKIPPED=0

for meta in "${NPC_DIR}"/*/meta.json; do
  [[ -f "${meta}" ]] || continue
  dir="$(dirname "${meta}")"
  id="$(basename "${dir}")"
  port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${meta}")"
  token_file="${dir}/admin.token"
  if [[ ! -f "${token_file}" ]]; then
    echo "swarm_tick: ${id} missing admin.token — skip"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  token="$(tr -d '\n\r' <"${token_file}")"
  code="$(curl -sS -o /tmp/atom-tick-${id}.json -w '%{http_code}' --max-time 120 \
    -X POST "http://127.0.0.1:${port}/brain/tick" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d '{}' || true)"
  if [[ "${code}" == "200" ]]; then
    FIRED=$((FIRED + 1))
    echo "swarm_tick: ${id} ok"
  else
    SKIPPED=$((SKIPPED + 1))
    echo "swarm_tick: ${id} http=${code}"
  fi
done

{
  echo "## ${TS}"
  echo
  echo "swarm_tick fired=${FIRED} skipped=${SKIPPED}"
  echo
} >>"${CHRON_DIR}/chronicle-${DAY}.md"

echo "swarm_tick: done fired=${FIRED} skipped=${SKIPPED}"
