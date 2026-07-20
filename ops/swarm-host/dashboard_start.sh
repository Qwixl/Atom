#!/usr/bin/env bash
# Start Atom swarm operator dashboard on LAN (default 0.0.0.0:8080).
set -euo pipefail

OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="${HOME}/atom/state/pids"
LOG_DIR="${HOME}/atom/logs"
mkdir -p "${PID_DIR}" "${LOG_DIR}"

export NVM_DIR="${HOME}/.nvm"
# shellcheck disable=SC1091
[[ -f "${NVM_DIR}/nvm.sh" ]] && . "${NVM_DIR}/nvm.sh"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8080}"
PID_FILE="${PID_DIR}/swarm-dashboard.pid"

if [[ -f "${PID_FILE}" ]]; then
  old="$(tr -d '\n\r' <"${PID_FILE}")"
  if [[ -n "${old}" ]] && kill -0 "${old}" 2>/dev/null; then
    echo "dashboard already running pid=${old} http://${HOST}:${PORT}/"
    exit 0
  fi
fi

nohup env HOST="${HOST}" PORT="${PORT}" node "${OPS}/dashboard/server.mjs" \
  >>"${LOG_DIR}/swarm-dashboard.log" 2>&1 &
echo $! >"${PID_FILE}"
sleep 0.3
echo "dashboard started pid=$(cat "${PID_FILE}")"
echo "LAN: http://192.168.1.100:${PORT}/  (or this host's LAN IP)"
echo "Tailscale: http://100.82.22.33:${PORT}/"
