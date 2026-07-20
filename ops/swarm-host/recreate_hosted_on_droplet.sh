#!/usr/bin/env bash
# Droplet: rebuild atom-agent:latest and recreate atom-hosted-* keeping *-data volumes.
# Usage (as root on 209.97.183.106): bash /opt/atom/ops/swarm-host/recreate_hosted_on_droplet.sh
set -euo pipefail
cd /opt/atom
git fetch origin main
git checkout main
git pull --ff-only origin main
docker build -t atom-agent:latest -f packages/agent-backend/Dockerfile .

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
    >"${env_file}"
  # Ensure container listens correctly inside the image.
  grep -q '^PORT=' "${env_file}" || echo 'PORT=5204' >>"${env_file}"
  grep -q '^HOST=' "${env_file}" || echo 'HOST=0.0.0.0' >>"${env_file}"
  sed -i 's/^PORT=.*/PORT=5204/' "${env_file}"
  sed -i 's/^HOST=.*/HOST=0.0.0.0/' "${env_file}"

  local admin
  admin="$(sed -n 's/^ATOM_ADMIN_TOKEN=//p' "${env_file}" | head -1)"

  docker stop "${name}"
  docker rm "${name}"
  docker run -d --name "${name}" \
    --restart unless-stopped \
    -p "${host_port}:5204" \
    -v "${vol}:/data" \
    --env-file "${env_file}" \
    atom-agent:latest
  rm -f "${env_file}"
  sleep 2
  curl -fsS --max-time 10 -H "Authorization: Bearer ${admin}" "http://127.0.0.1:${host_port}/health" | head -c 200
  echo
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
