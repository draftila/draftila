#!/usr/bin/env sh
set -eu

if [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  bun run --filter @draftila/api db:migrate
fi

exec bun run --filter @draftila/api start
