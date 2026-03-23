#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nanyee}"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"
CRON_SECRET_VALUE="${CRON_SECRET_VALUE:-${CRON_SECRET:-}}"

if [[ -z "$CRON_SECRET_VALUE" ]]; then
  echo "CRON_SECRET_VALUE or CRON_SECRET is required" >&2
  exit 1
fi

CRON_LINE="0 22 * * * curl -fsS -X POST -H 'Authorization: Bearer ${CRON_SECRET_VALUE}' ${APP_URL}/api/tools/evaluation/cron >/dev/null 2>&1"
CRON_HEADER="CRON_TZ=Asia/Shanghai"
CRON_TAG="# nanyee evaluation cron"

current_crontab="$(crontab -l 2>/dev/null || true)"
filtered_crontab="$(printf '%s\n' "$current_crontab" | grep -v 'nanyee evaluation cron' | grep -v '/api/tools/evaluation/cron' | grep -v '^CRON_TZ=Asia/Shanghai$' || true)"

{
  printf '%s\n' "$CRON_HEADER"
  if [[ -n "$filtered_crontab" ]]; then
    printf '%s\n' "$filtered_crontab"
  fi
  printf '%s\n' "$CRON_TAG"
  printf '%s\n' "$CRON_LINE"
} | crontab -

echo "Installed evaluation cron:"
crontab -l
