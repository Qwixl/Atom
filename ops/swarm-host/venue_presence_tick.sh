#!/usr/bin/env bash
# NPC home-venue shift presence (D093 / AS-19).
# On shift → join home room; off shift → leave.
# Cron (every 15 min with heartbeat is fine):
#   */15 * * * * /bin/bash /home/qwixl/atom/repos/atom/ops/swarm-host/venue_presence_tick.sh >>/home/qwixl/atom/logs/venue_presence.log 2>&1

set -euo pipefail

ENV_FILE="${HOME}/atom/secrets/agent.env"
NPC_DIR="${HOME}/atom/state/npcs"
CHRON_DIR="${HOME}/atom/state/chronicles"
mkdir -p "${CHRON_DIR}" "${HOME}/atom/logs"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "venue_presence_tick: missing ${ENV_FILE}" >&2
  exit 2
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ "${ATOM_KILL_SWITCH:-0}" == "1" ]]; then
  echo "venue_presence_tick: kill switch on — skipping"
  exit 0
fi

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DAY="$(date -u +"%Y-%m-%d")"
SEED_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/packages/agent-backend/swarm-seeds/v1-npcs.json"

if [[ ! -f "${SEED_FILE}" ]]; then
  echo "venue_presence_tick: missing seeds ${SEED_FILE}" >&2
  exit 2
fi

# NPCs with homeShift in seed file.
mapfile -t SHIFT_IDS < <(
  python3 -c '
import json,sys
raw=json.load(open(sys.argv[1]))
for n in raw.get("npcs") or []:
    hs=n.get("homeShift") or {}
    if isinstance(hs, dict) and "startHour" in hs and "endHour" in hs:
        print(n["id"])
' "${SEED_FILE}"
)

if [[ "${#SHIFT_IDS[@]}" -eq 0 ]]; then
  echo "venue_presence_tick: no homeShift NPCs in seed"
  exit 0
fi

for id in "${SHIFT_IDS[@]}"; do
  meta="${NPC_DIR}/${id}/meta.json"
  token_file="${NPC_DIR}/${id}/admin.token"
  [[ -f "${meta}" && -f "${token_file}" ]] || {
    echo "venue_presence_tick: skip ${id} (not materialized)"
    continue
  }
  port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${meta}")"
  token="$(tr -d '\n\r' <"${token_file}")"
  RESP="$(mktemp)"
  code="$(curl -sS -o "${RESP}" -w '%{http_code}' --max-time 60 \
    -X POST "http://127.0.0.1:${port}/swarm/venue/presence-tick" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d '{}' || true)"
  action="$(python3 -c 'import json,sys
try:
  b=json.load(open(sys.argv[1]))
  print(b.get("action") or b.get("reason") or b.get("error") or "")
except Exception:
  print("")
' "${RESP}" 2>/dev/null || true)"
  on_shift="$(python3 -c 'import json,sys
try:
  b=json.load(open(sys.argv[1])); print(b.get("onShift",""))
except Exception:
  print("")
' "${RESP}" 2>/dev/null || true)"
  rm -f "${RESP}"
  echo "venue_presence_tick: id=${id} http=${code} onShift=${on_shift} action=${action}"
  {
    echo "## ${TS}"
    echo
    echo "venue_presence id=${id} http=${code} onShift=${on_shift} action=${action}"
    echo
  } >>"${CHRON_DIR}/chronicle-${DAY}.md"
done

echo "venue_presence_tick: done"
