#!/usr/bin/env bash
# Occasional NPC↔NPC conversation openers (D091 / AS-17).
# Caps: ≤1 new opener per run (swarm-wide); per-NPC daily opener + pair cooldown enforced in agent.
# Cron (hourly, after swarm_tick is fine):
#   15 * * * * /home/qwixl/atom/repos/atom/ops/swarm-host/social_tick.sh >>/home/qwixl/atom/logs/social_tick.log 2>&1

set -euo pipefail

ENV_FILE="${HOME}/atom/secrets/agent.env"
NPC_DIR="${HOME}/atom/state/npcs"
STATE_DIR="${HOME}/atom/state/social"
CHRON_DIR="${HOME}/atom/state/chronicles"
mkdir -p "${STATE_DIR}" "${CHRON_DIR}" "${HOME}/atom/logs"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "social_tick: missing ${ENV_FILE}" >&2
  exit 2
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ "${ATOM_KILL_SWITCH:-0}" == "1" ]]; then
  echo "social_tick: kill switch on — skipping"
  exit 0
fi

if [[ "${ATOM_NPC_SOCIAL:-1}" == "0" ]]; then
  echo "social_tick: ATOM_NPC_SOCIAL=0 — skipping"
  exit 0
fi

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DAY="$(date -u +"%Y-%m-%d")"

# Collect up NPCs (exclude police): id|port|token_file|did
mapfile -t CANDIDATES < <(
  for meta in "${NPC_DIR}"/*/meta.json; do
    [[ -f "${meta}" ]] || continue
    dir="$(dirname "${meta}")"
    id="$(basename "${dir}")"
    [[ "${id}" == police-* ]] && continue
    port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${meta}")"
    token_file="${dir}/admin.token"
    identity_file="${dir}/agent-identity.json"
    [[ -f "${token_file}" && -f "${identity_file}" ]] || continue
    token="$(tr -d '\n\r' <"${token_file}")"
    did="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("did",""))' "${identity_file}")"
    [[ -n "${did}" ]] || continue
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
      -H "Authorization: Bearer ${token}" \
      "http://127.0.0.1:${port}/health" || true)"
    if [[ "${code}" == "200" ]]; then
      echo "${id}|${port}|${token_file}|${did}"
    fi
  done
)

if [[ "${#CANDIDATES[@]}" -lt 2 ]]; then
  echo "social_tick: need ≥2 up NPCs — have ${#CANDIDATES[@]}"
  exit 0
fi

HOUR_KEY="$(date -u +"%Y%m%d%H")"
IDX=$(( 10#${HOUR_KEY} % ${#CANDIDATES[@]} ))
IFS='|' read -r INIT_ID INIT_PORT INIT_TOKEN_FILE INIT_DID <<<"${CANDIDATES[$IDX]}"

# Pick a different friend (deterministic for the hour).
FRIEND_IDX=$(( (IDX + 1 + (10#${HOUR_KEY} % (${#CANDIDATES[@]} - 1))) % ${#CANDIDATES[@]} ))
if [[ "${FRIEND_IDX}" -eq "${IDX}" ]]; then
  FRIEND_IDX=$(( (IDX + 1) % ${#CANDIDATES[@]} ))
fi
IFS='|' read -r FRIEND_ID FRIEND_PORT _FRIEND_TOKEN FRIEND_DID <<<"${CANDIDATES[$FRIEND_IDX]}"

# Co-hosted NPCs: MLS/deliver via loopback (fabric hairpin is flaky for Node fetch).
FRIEND_PEER_URL="http://127.0.0.1:${FRIEND_PORT}/a2a/jsonrpc"

token="$(tr -d '\n\r' <"${INIT_TOKEN_FILE}")"
BODY_FILE="$(mktemp)"
python3 -c 'import json,sys; json.dump({"friend":sys.argv[1],"peerDid":sys.argv[2],"peerUrl":sys.argv[3]}, open(sys.argv[4],"w"))' \
  "${FRIEND_ID}" "${FRIEND_DID}" "${FRIEND_PEER_URL}" "${BODY_FILE}"

RESP_FILE="$(mktemp)"
code="$(curl -sS -o "${RESP_FILE}" -w '%{http_code}' --max-time 180 \
  -X POST "http://127.0.0.1:${INIT_PORT}/swarm/social/open" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary @"${BODY_FILE}" || true)"
rm -f "${BODY_FILE}"

# Log outcome without peer DIDs.
ok_friend="$(python3 -c 'import json,sys; b=json.load(open(sys.argv[1])); print(b.get("friend") or b.get("reason") or "")' "${RESP_FILE}" 2>/dev/null || true)"
rm -f "${RESP_FILE}"

echo "social_tick: initiator=${INIT_ID} friend=${FRIEND_ID} http=${code} result=${ok_friend}"
echo "${TS} initiator=${INIT_ID} friend=${FRIEND_ID} http=${code}" >>"${STATE_DIR}/opens.log"

{
  echo "## ${TS}"
  echo
  echo "social_tick initiator=${INIT_ID} friend=${FRIEND_ID} http=${code}"
  echo
} >>"${CHRON_DIR}/chronicle-${DAY}.md"

if [[ "${code}" == "200" ]]; then
  echo "social_tick: opened ok"
  exit 0
fi
echo "social_tick: no open (cap/cooldown/busy) — ok"
exit 0
