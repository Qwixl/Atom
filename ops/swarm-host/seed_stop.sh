#!/usr/bin/env bash
# Stop seeded NPC processes (by pid files under ~/atom/state/pids).

set -euo pipefail

PID_DIR="${HOME}/atom/state/pids"
stopped=0
for pid_file in "${PID_DIR}"/*.pid; do
  [[ -f "${pid_file}" ]] || continue
  id="$(basename "${pid_file}" .pid)"
  pid="$(tr -d '\n\r' <"${pid_file}")"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" 2>/dev/null || true
    echo "seed_stop: ${id} pid=${pid}"
    stopped=$((stopped + 1))
  fi
  rm -f "${pid_file}"
done
echo "seed_stop: stopped=${stopped}"
