#!/usr/bin/env bash
# Restart NPCs with fabric PUBLIC_BASE_URL template (force stop + start).

set -euo pipefail

OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ATOM_NPC_PUBLIC_URL_TEMPLATE='https://{port}.agents.atom.qwixl.com'

bash "${OPS}/seed_stop.sh"
bash "${OPS}/seed_start.sh"
echo "fabric_apply_urls: PUBLIC_BASE_URL template=${ATOM_NPC_PUBLIC_URL_TEMPLATE}"
