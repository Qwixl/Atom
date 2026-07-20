#!/usr/bin/env bash
# PUT /swarm/memory/core for each prepared NPC (from core.json next to meta.json).

set -euo pipefail

NPC_DIR="${HOME}/atom/state/npcs"
OK=0
FAIL=0

for meta in "${NPC_DIR}"/*/meta.json; do
  [[ -f "${meta}" ]] || continue
  dir="$(dirname "${meta}")"
  id="$(basename "${dir}")"
  core_file="${dir}/core.json"
  token_file="${dir}/admin.token"
  if [[ ! -f "${core_file}" ]] || [[ ! -f "${token_file}" ]]; then
    echo "core_sheets: ${id} missing core.json or admin.token"
    FAIL=$((FAIL + 1))
    continue
  fi
  port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${meta}")"
  token="$(tr -d '\n\r' <"${token_file}")"
  code="$(curl -sS -o /tmp/atom-core-${id}.json -w '%{http_code}' --max-time 30 \
    -X PUT "http://127.0.0.1:${port}/swarm/memory/core" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data-binary @"${core_file}" || true)"
  if [[ "${code}" == "200" ]]; then
    OK=$((OK + 1))
    echo "core_sheets: ${id} ok"
  else
    FAIL=$((FAIL + 1))
    echo "core_sheets: ${id} http=${code}"
  fi
done

echo "core_sheets: ok=${OK} fail=${FAIL}"
[[ "${FAIL}" -eq 0 ]]
