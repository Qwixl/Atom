#!/usr/bin/env bash
# Start seeded NPCs + Police from ~/atom/state/npcs/*/meta.json
# Requires: bootstrap.sh, built agent-backend, ~/atom/secrets/agent.env

set -euo pipefail

OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${OPS}/../.." && pwd)"
ENV_FILE="${HOME}/atom/secrets/agent.env"
NPC_DIR="${HOME}/atom/state/npcs"
PID_DIR="${HOME}/atom/state/pids"
LOG_DIR="${HOME}/atom/logs/npcs"
BACKEND="${REPO}/packages/agent-backend"

mkdir -p "${PID_DIR}" "${LOG_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "seed_start: missing ${ENV_FILE}" >&2
  exit 2
fi
if [[ ! -f "${BACKEND}/dist/cli.js" ]]; then
  echo "seed_start: build agent-backend first:" >&2
  echo "  cd ${REPO} && pnpm --filter @qwixl/agent-backend build" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ ! -d "${NPC_DIR}" ]] || ! ls "${NPC_DIR}"/*/meta.json >/dev/null 2>&1; then
  echo "seed_start: no NPC dirs — run seed_prepare.mjs / bootstrap.sh" >&2
  exit 2
fi

gen_token() {
  # portable-ish token
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '/+=' | head -c 43
  else
    python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
  fi
}

for meta in "${NPC_DIR}"/*/meta.json; do
  dir="$(dirname "${meta}")"
  id="$(basename "${dir}")"
  port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${meta}")"
  kind="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("agentKind","swarm-npc"))' "${meta}")"
  name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("displayName",sys.argv[2]))' "${meta}" "${id}")"

  token_file="${dir}/admin.token"
  if [[ ! -f "${token_file}" ]] || [[ ! -s "${token_file}" ]]; then
    gen_token >"${token_file}"
    chmod 600 "${token_file}"
  fi
  token="$(tr -d '\n\r' <"${token_file}")"

  pid_file="${PID_DIR}/${id}.pid"
  if [[ -f "${pid_file}" ]]; then
    old_pid="$(tr -d '\n\r' <"${pid_file}")"
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
      echo "seed_start: ${id} already running pid=${old_pid}"
      continue
    fi
  fi

  # Already healthy?
  if curl -fsS --max-time 2 \
    -H "Authorization: Bearer ${token}" \
    "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    echo "seed_start: ${id} already healthy :${port}"
    continue
  fi

  log_file="${LOG_DIR}/${id}.log"
  echo "seed_start: launching ${id} :${port} (${kind})"
  nohup env \
    PORT="${port}" \
    HOST=127.0.0.1 \
    PUBLIC_BASE_URL="http://127.0.0.1:${port}" \
    AGENT_NAME="${name}" \
    ATOM_AGENT_KIND="${kind}" \
    ATOM_DATA_DIR="${dir}" \
    ATOM_AGENT_IDENTITY_PATH="${dir}/agent-identity.json" \
    ATOM_ADMIN_TOKEN="${token}" \
    ATOM_KILL_SWITCH="${ATOM_KILL_SWITCH:-0}" \
    LLM_BASE_URL="${LLM_BASE_URL:-${ATOM_LOCAL_LLM_BASE_URL:-http://127.0.0.1:11434/v1}}" \
    LLM_MODEL="${LLM_MODEL:-${ATOM_LOCAL_LLM_MODEL:-llama3.2:3b}}" \
    LLM_API_KEY="${LLM_API_KEY:-ollama}" \
    ATOM_SHELL_ORIGINS="${ATOM_SHELL_ORIGINS:-}" \
    ATOM_FOUNDER_AGENT_URL="${ATOM_FOUNDER_AGENT_URL:-}" \
    ATOM_FOUNDER_ADMIN_TOKEN="${ATOM_FOUNDER_ADMIN_TOKEN:-}" \
    ATOM_BRAIN_ALWAYS_ON="${ATOM_BRAIN_ALWAYS_ON:-1}" \
    node "${BACKEND}/dist/cli.js" \
    >>"${log_file}" 2>&1 &
  echo $! >"${pid_file}"
  sleep 0.4
done

echo "seed_start: done — next: bash ${OPS}/seed_core_sheets.sh"
echo "logs: ${LOG_DIR}/"
