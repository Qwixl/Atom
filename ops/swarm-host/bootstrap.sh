#!/usr/bin/env bash
# Bootstrap Atom swarm dirs + secrets on Optimus (qwixl-agents).
# Usage (from Atom clone): bash ops/swarm-host/bootstrap.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Atom layout (repo=${ROOT}) ==="
mkdir -p "${HOME}/atom"/{repos,state,logs,secrets}
mkdir -p /mnt/d/atom/{models,state,logs} 2>/dev/null || true
mkdir -p "${HOME}/atom/state"/{redis,chronicles,heartbeat,npcs,pids}

if [[ -d /mnt/d/atom/models ]] && [[ ! -L "${HOME}/atom/models" ]]; then
  rm -rf "${HOME}/atom/models"
  ln -sfn /mnt/d/atom/models "${HOME}/atom/models"
fi
chmod 700 "${HOME}/atom/secrets"

# Point repos/atom at this clone when running from a checked-out tree on the host
if [[ ! -e "${HOME}/atom/repos/atom" ]]; then
  ln -sfn "${ROOT}" "${HOME}/atom/repos/atom"
  echo "linked ~/atom/repos/atom -> ${ROOT}"
fi

cp -a "${OPS}/docker-compose.yml" "${HOME}/atom/repos/docker-compose.yml"
mkdir -p "${HOME}/atom/repos/swarm-seed"
cp -a "${ROOT}/packages/agent-backend/swarm-seeds/." "${HOME}/atom/repos/swarm-seed/"

if [[ ! -f "${HOME}/atom/secrets/agent.env" ]]; then
  cat >"${HOME}/atom/secrets/agent.env" <<'EOF'
# Atom swarm — separate from Qwixl. Never put Qwixl SUPABASE_SERVICE_ROLE_KEY here.
ATOM_KILL_SWITCH=0

# Shared LLM for NPC ticks (loopback Ollama preferred)
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=llama3.2:3b
LLM_API_KEY=ollama
ATOM_LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1
ATOM_LOCAL_LLM_MODEL=llama3.2:3b

# Optional OpenRouter fallback for richer 1:1
# ATOM_OPENROUTER_API_KEY=
# LLM_BASE_URL=https://openrouter.ai/api/v1
# LLM_MODEL=openai/gpt-4o-mini

ATOM_REDIS_URL=redis://127.0.0.1:6379/0
ATOM_SHELL_ORIGINS=https://atom.qwixl.com,http://127.0.0.1:5200

# Police → founder Class C (fill with your hosted/local agent)
# ATOM_FOUNDER_AGENT_URL=http://127.0.0.1:5311
# ATOM_FOUNDER_ADMIN_TOKEN=
EOF
  chmod 600 "${HOME}/atom/secrets/agent.env"
  echo "created ~/atom/secrets/agent.env — edit secrets before seed_start"
else
  echo "atom agent.env already exists"
fi

echo "=== Atom compose (bus) ==="
docker compose -f "${HOME}/atom/repos/docker-compose.yml" up -d atom-bus
docker compose -f "${HOME}/atom/repos/docker-compose.yml" ps

echo "=== Prepare NPC data dirs ==="
node "${OPS}/seed_prepare.mjs"

echo "=== Atom bootstrap done ==="
echo "Next:"
echo "  1. Edit ~/atom/secrets/agent.env"
echo "  2. cd ~/atom/repos/atom && pnpm install && pnpm --filter @qwixl/agent-backend build"
echo "  3. bash ops/swarm-host/seed_start.sh"
echo "  4. bash ops/swarm-host/seed_core_sheets.sh"
