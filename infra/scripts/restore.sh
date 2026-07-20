#!/usr/bin/env bash
set -euo pipefail

required=(
  NANYEE_RESTORE_DATABASE_URL
  NANYEE_RESTORE_DATABASE_NAME
  NANYEE_RESTORE_BLOB_NAME
  NANYEE_BACKUP_STORAGE_ACCOUNT
  NANYEE_BACKUP_STORAGE_CONTAINER
  NANYEE_BACKUP_AGE_IDENTITY
  NANYEE_CONFIRM_RESTORE
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'missing required environment variable: %s\n' "$name" >&2
    exit 2
  fi
done
if [[ "$NANYEE_CONFIRM_RESTORE" != "$NANYEE_RESTORE_DATABASE_NAME" ]]; then
  printf 'restore confirmation must exactly equal the target database name\n' >&2
  exit 4
fi
for command_name in pg_restore age az; do
  command -v "$command_name" >/dev/null || {
    printf 'required command is unavailable: %s\n' "$command_name" >&2
    exit 2
  }
done

encrypted_file="$(mktemp --suffix=.dump.age)"
cleanup() {
  rm -f -- "$encrypted_file"
}
trap cleanup EXIT INT TERM
chmod 600 "$encrypted_file"

az storage blob download \
  --account-name "$NANYEE_BACKUP_STORAGE_ACCOUNT" \
  --container-name "$NANYEE_BACKUP_STORAGE_CONTAINER" \
  --auth-mode login \
  --name "$NANYEE_RESTORE_BLOB_NAME" \
  --file "$encrypted_file" \
  --overwrite true \
  --only-show-errors

age --decrypt --identity "$NANYEE_BACKUP_AGE_IDENTITY" "$encrypted_file" \
  | pg_restore \
      --dbname "$NANYEE_RESTORE_DATABASE_URL" \
      --clean \
      --if-exists \
      --no-owner \
      --no-acl \
      --exit-on-error
printf 'restore completed for database: %s\n' "$NANYEE_RESTORE_DATABASE_NAME"
