#!/usr/bin/env sh
set -eu

if [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  bun run --filter @draftila/api db:migrate
fi

if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  printf '%s' "$ADMIN_PASSWORD" | bun run --filter @draftila/api db:create-admin -- --email "$ADMIN_EMAIL" --password-stdin --name "${ADMIN_NAME:-Admin}"
fi

exec bun run --filter @draftila/api start
