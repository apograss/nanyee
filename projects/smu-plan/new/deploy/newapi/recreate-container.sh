#!/usr/bin/env bash
set -euo pipefail

docker rm -f new-api >/dev/null 2>&1 || true

docker run -d \
  --name new-api \
  --restart always \
  -p 3001:3000 \
  --add-host nanyee.de:host-gateway \
  --add-host host.docker.internal:host-gateway \
  -v /opt/new-api/data:/data \
  -e TZ=Asia/Shanghai \
  -e SESSION_SECRET=nanyee-newapi-secret-2026 \
  calciumion/new-api:latest

sleep 4

docker network connect cpamc_default new-api || true
docker network connect grok2api_default new-api || true
docker network connect newapi-net new-api || true

sleep 4

docker inspect new-api --format '{{json .HostConfig.ExtraHosts}}'
