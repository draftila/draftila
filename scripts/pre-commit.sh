#!/usr/bin/env bash
set -euo pipefail

echo "==> Formatting..."
bun run format:check

echo "==> Type checking..."
bun run --filter @draftila/api typecheck

echo "==> Linting..."
bun run lint

echo "==> Running tests with coverage..."
TEST_OUTPUT=$(bun run --filter @draftila/api test -- --coverage 2>&1)
echo "$TEST_OUTPUT"

CLEAN_OUTPUT=$(echo "$TEST_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

if echo "$CLEAN_OUTPUT" | grep -qE '[1-9][0-9]* fail'; then
  echo "FAIL: Tests failed."
  exit 1
fi

FAILED=0
echo "$CLEAN_OUTPUT" | grep '|' | while IFS='|' read -r file _funcs lines _uncovered; do
  file=$(echo "$file" | tr -d ' ')
  lines=$(echo "$lines" | tr -d ' ')

  [ -z "$file" ] && continue
  [[ "$file" == File ]] && continue
  [[ "$file" == Allfiles ]] && continue
  [[ "$file" == -* ]] && continue
  [[ "$file" != src/* ]] && continue

  if [ "$lines" != "100.00" ]; then
    echo "FAIL: $file has ${lines}% line coverage, expected 100%."
    exit 1
  fi
done

if [ $? -ne 0 ]; then
  exit 1
fi

echo "==> All checks passed."
