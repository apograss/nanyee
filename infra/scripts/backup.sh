#!/usr/bin/env bash
set -euo pipefail

required=(
  NANYEE_BACKUP_DATABASE_URL
  NANYEE_BACKUP_AGE_RECIPIENT
  NANYEE_BACKUP_STORAGE_ACCOUNT
  NANYEE_BACKUP_STORAGE_CONTAINER
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'missing required environment variable: %s\n' "$name" >&2
    exit 2
  fi
done
for command_name in pg_dump age az; do
  command -v "$command_name" >/dev/null || {
    printf 'required command is unavailable: %s\n' "$command_name" >&2
    exit 2
  }
done

container_bytes="$({
  az storage blob list \
    --account-name "$NANYEE_BACKUP_STORAGE_ACCOUNT" \
    --container-name "$NANYEE_BACKUP_STORAGE_CONTAINER" \
    --auth-mode login \
    --query '[].properties.contentLength' \
    --output tsv
} | awk '{ total += $1 } END { print total + 0 }')"
max_bytes=$((4 * 1024 * 1024 * 1024))
if (( container_bytes >= max_bytes )); then
  printf 'backup container has reached the 4 GiB safety limit\n' >&2
  exit 3
fi

encrypted_file="$(mktemp --suffix=.dump.age)"
cleanup() {
  rm -f -- "$encrypted_file"
}
trap cleanup EXIT INT TERM
chmod 600 "$encrypted_file"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
blob_name="daily/nanyee-${timestamp}.dump.age"
pg_dump "$NANYEE_BACKUP_DATABASE_URL" --format=custom --no-owner --no-acl \
  | age --recipient "$NANYEE_BACKUP_AGE_RECIPIENT" --output "$encrypted_file"

encrypted_bytes="$(stat --format='%s' "$encrypted_file")"
if (( container_bytes + encrypted_bytes > max_bytes )); then
  printf 'encrypted backup would exceed the 4 GiB safety limit\n' >&2
  exit 3
fi

az storage blob upload \
  --account-name "$NANYEE_BACKUP_STORAGE_ACCOUNT" \
  --container-name "$NANYEE_BACKUP_STORAGE_CONTAINER" \
  --auth-mode login \
  --name "$blob_name" \
  --file "$encrypted_file" \
  --overwrite false \
  --only-show-errors
printf 'uploaded encrypted backup: %s (%s bytes)\n' "$blob_name" "$encrypted_bytes"
