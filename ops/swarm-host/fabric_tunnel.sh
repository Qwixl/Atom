#!/usr/bin/env bash
# Maintain reverse SSH tunnels Optimus → DO fabric droplet so
# https://{port}.agents.atom.qwixl.com reaches local NPC ports.
#
# Requires: ~/.ssh/id_ed25519_atom_fabric authorized on ATOM_FABRIC_SSH_HOST.
# Caddy on the droplet already maps *.agents.atom.qwixl.com → 127.0.0.1:{port}.

set -euo pipefail

FABRIC_HOST="${ATOM_FABRIC_SSH_HOST:-root@209.97.183.106}"
IDENTITY="${ATOM_FABRIC_SSH_IDENTITY:-${HOME}/.ssh/id_ed25519_atom_fabric}"
PORTS="${ATOM_FABRIC_PORTS:-5401 5402 5403 5404 5405 5406 5407 5499}"
# Keep PID outside state/pids — seed_stop.sh kills every *.pid there.
PID_FILE="${ATOM_FABRIC_TUNNEL_PID:-${HOME}/atom/state/fabric-tunnel.pid}"
LOG_FILE="${ATOM_FABRIC_TUNNEL_LOG:-${HOME}/atom/logs/fabric-tunnel.log}"

mkdir -p "$(dirname "${PID_FILE}")" "$(dirname "${LOG_FILE}")"

if [[ ! -f "${IDENTITY}" ]]; then
  echo "fabric_tunnel: missing identity ${IDENTITY}" >&2
  exit 2
fi

build_forwards() {
  local p args=()
  for p in ${PORTS}; do
    args+=(-R "127.0.0.1:${p}:127.0.0.1:${p}")
  done
  printf '%s\n' "${args[@]}"
}

is_running() {
  if [[ ! -f "${PID_FILE}" ]]; then
    return 1
  fi
  local pid
  pid="$(tr -d '\n\r' <"${PID_FILE}")"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

cmd="${1:-start}"

case "${cmd}" in
  start)
    if is_running; then
      echo "fabric_tunnel: already running pid=$(tr -d '\n\r' <"${PID_FILE}")"
      exit 0
    fi
    mapfile -t forwards < <(build_forwards)
    echo "fabric_tunnel: starting → ${FABRIC_HOST} ports ${PORTS}"
    # Autossh preferred; plain ssh + ServerAlive as fallback.
    if command -v autossh >/dev/null 2>&1; then
      AUTOSSH_GATETIME=0 autossh -M 0 -f -N \
        -i "${IDENTITY}" \
        -o IdentitiesOnly=yes \
        -o ExitOnForwardFailure=yes \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -o StrictHostKeyChecking=accept-new \
        "${forwards[@]}" \
        "${FABRIC_HOST}"
      # autossh -f backgrounds; find child ssh
      sleep 1
      pgrep -f "ssh.*${FABRIC_HOST}.*5401" | head -1 >"${PID_FILE}" || true
    else
      nohup ssh -N \
        -i "${IDENTITY}" \
        -o IdentitiesOnly=yes \
        -o ExitOnForwardFailure=yes \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -o StrictHostKeyChecking=accept-new \
        "${forwards[@]}" \
        "${FABRIC_HOST}" \
        >>"${LOG_FILE}" 2>&1 &
      echo $! >"${PID_FILE}"
    fi
    sleep 0.5
    if is_running; then
      echo "fabric_tunnel: up pid=$(tr -d '\n\r' <"${PID_FILE}") log=${LOG_FILE}"
    else
      echo "fabric_tunnel: failed to stay up — see ${LOG_FILE}" >&2
      exit 1
    fi
    ;;
  stop)
    if ! is_running; then
      echo "fabric_tunnel: not running"
      rm -f "${PID_FILE}"
      exit 0
    fi
    pid="$(tr -d '\n\r' <"${PID_FILE}")"
    kill "${pid}" 2>/dev/null || true
    # Also kill autossh parent if present
    pkill -f "autossh.*${FABRIC_HOST}" 2>/dev/null || true
    pkill -f "ssh.*${FABRIC_HOST}.*5401" 2>/dev/null || true
    rm -f "${PID_FILE}"
    echo "fabric_tunnel: stopped"
    ;;
  status)
    if is_running; then
      echo "fabric_tunnel: running pid=$(tr -d '\n\r' <"${PID_FILE}")"
      exit 0
    fi
    echo "fabric_tunnel: stopped"
    exit 1
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac
