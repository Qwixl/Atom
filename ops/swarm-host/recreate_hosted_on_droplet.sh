#!/usr/bin/env bash
# Droplet: rebuild atom-agent:latest and recreate atom-hosted-* keeping *-data volumes.
# Prefer adminToken from control-plane hosted-agents.json when present (env can be empty).
# Usage (as root on 209.97.183.106): bash /opt/atom/ops/swarm-host/recreate_hosted_on_droplet.sh
set -euo pipefail
cd /opt/atom
git fetch origin main
git checkout main
git pull --ff-only origin main
docker build -t atom-agent:latest -f packages/agent-backend/Dockerfile .

REGISTRY_JSON="/var/lib/docker/volumes/atom_control-plane-data/_data/hosted-agents.json"

registry_token_for() {
  local name="$1"
  [[ -f "${REGISTRY_JSON}" ]] || return 0
  python3 - "$name" "${REGISTRY_JSON}" <<'PY'
import json, sys
name, path = sys.argv[1], sys.argv[2]
data = json.load(open(path))
agents = data if isinstance(data, list) else data.get("agents") or []
for a in agents:
    n = a.get("containerName") or a.get("name") or ""
    if n == name:
        print(a.get("adminToken") or "")
        break
PY
}

recreate_one() {
  local name="$1"
  echo "=== recreate ${name} ==="
  local host_port vol
  host_port="$(docker inspect -f '{{(index (index .NetworkSettings.Ports "5204/tcp") 0).HostPort}}' "${name}")"
  vol="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "${name}")"
  local env_file
  env_file="$(mktemp)"
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${name}" \
    | grep -E '^(PORT|HOST|PUBLIC_BASE_URL|AGENT_NAME|LLM_|ATOM_|NODE_ENV)=' \
    | grep -v '^ATOM_ADMIN_TOKEN=' \
    >"${env_file}" || true
  echo 'PORT=5204' >>"${env_file}"
  echo 'HOST=0.0.0.0' >>"${env_file}"
  local admin
  admin="$(registry_token_for "${name}")"
  if [[ -z "${admin}" ]]; then
    admin="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${name}" | sed -n 's/^ATOM_ADMIN_TOKEN=//p' | head -1)"
  fi
  if [[ -z "${admin}" ]]; then
    echo "missing admin token for ${name}" >&2
    rm -f "${env_file}"
    return 1
  fi
  echo "ATOM_ADMIN_TOKEN=${admin}" >>"${env_file}"
  # dedupe keys
  python3 - "${env_file}" <<'PY'
import sys
path = sys.argv[1]
kv = {}
for line in open(path):
    line = line.strip()
    if not line or "=" not in line:
        continue
    k, v = line.split("=", 1)
    kv[k] = v
kv["PORT"] = "5204"
kv["HOST"] = "0.0.0.0"
open(path, "w").write("\n".join(f"{k}={v}" for k, v in kv.items()) + "\n")
PY

  docker stop "${name}"
  docker rm "${name}"
  docker run -d --name "${name}" \
    --restart unless-stopped \
    -p "${host_port}:5204" \
    -v "${vol}:/data" \
    --env-file "${env_file}" \
    atom-agent:latest
  rm -f "${env_file}"
  local ok=0
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 3 -H "Authorization: Bearer ${admin}" "http://127.0.0.1:${host_port}/health" >/tmp/hosted_health.json; then
      head -c 200 /tmp/hosted_health.json
      echo
      ok=1
      break
    fi
    sleep 1
  done
  [[ "${ok}" -eq 1 ]] || { echo "health failed ${name}" >&2; return 1; }
  echo "OK ${name} :${host_port} vol=${vol}"
}

mapfile -t hosts < <(docker ps -a --format '{{.Names}}' | grep '^atom-hosted-' || true)
if [[ "${#hosts[@]}" -eq 0 ]]; then
  echo "no atom-hosted-* containers" >&2
  exit 1
fi
for c in "${hosts[@]}"; do
  recreate_one "${c}"
done
echo RECREATE_OK
