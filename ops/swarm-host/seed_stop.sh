#!/usr/bin/env bash
# Stop seeded NPC processes (by pid files under ~/atom/state/pids).
# Does not touch fabric-tunnel or unrelated services (dashboard uses swarm-dashboard.pid — excluded).

set -euo pipefail

PID_DIR="${HOME}/atom/state/pids"
NPC_DIR="${HOME}/atom/state/npcs"
stopped=0

for meta in "${NPC_DIR}"/*/meta.json; do
  [[ -f "${meta}" ]] || continue
  id="$(basename "$(dirname "${meta}")")"
  pid_file="${PID_DIR}/${id}.pid"
  if [[ -f "${pid_file}" ]]; then
    pid="$(tr -d '\n\r' <"${pid_file}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      echo "seed_stop: ${id} pid=${pid}"
      stopped=$((stopped + 1))
    fi
    rm -f "${pid_file}"
  fi
  port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${meta}")"
  # Reap orphans still bound to the NPC port.
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  else
    pids="$(ss -ltnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u)"
    for opid in ${pids}; do
      kill "${opid}" 2>/dev/null || true
      echo "seed_stop: reaped orphan pid=${opid} port=${port}"
      stopped=$((stopped + 1))
    done
  fi
done

# Wait for ports to free (up to ~5s)
for _ in 1 2 3 4 5 6 7 8 9 10; do
  busy=0
  for meta in "${NPC_DIR}"/*/meta.json; do
    port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${meta}")"
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${port}\$"; then
      busy=1
      break
    fi
  done
  [[ "${busy}" -eq 0 ]] && break
  sleep 0.5
done

echo "seed_stop: stopped=${stopped}"
