#!/usr/bin/env bash
set -euo pipefail
PID_FILE="${HOME}/atom/state/pids/swarm-dashboard.pid"
if [[ -f "${PID_FILE}" ]]; then
  pid="$(tr -d '\n\r' <"${PID_FILE}")"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" || true
    echo "stopped dashboard pid=${pid}"
  fi
  rm -f "${PID_FILE}"
else
  echo "no dashboard pid file"
fi
