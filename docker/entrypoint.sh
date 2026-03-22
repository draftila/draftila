#!/usr/bin/env sh
set -eu

if [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  bun run --filter @draftila/api db:migrate
fi

if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  bun run --filter @draftila/api db:create-admin -- --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --name "${ADMIN_NAME:-Admin}"
fi

exec bun run --filter @draftila/api start
