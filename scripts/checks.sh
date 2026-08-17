#!/usr/bin/env bash
set -euo pipefail

BOLD="\033[1m"
DIM="\033[2m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

FIX=0
for arg in "$@"; do
  case "$arg" in
    --fix) FIX=1 ;;
  esac
done

SPINNER_FRAMES=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
PASS="✓"
FAIL="✗"

steps=()
statuses=()
errors=()
durations=()
total_start=$SECONDS

format_duration() {
  local secs=$1
  if [ "$secs" -ge 60 ]; then
    printf "%dm %ds" $((secs / 60)) $((secs % 60))
  else
    printf "%ds" "$secs"
  fi
}

spin() {
  local pid=$1
  local idx=0
  while kill -0 "$pid" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    printf "\r  ${YELLOW}%s${RESET} ${DIM}%s${RESET} ${DIM}%s${RESET}" "${SPINNER_FRAMES[$idx]}" "$current_step" "$(format_duration $elapsed)"
    idx=$(( (idx + 1) % ${#SPINNER_FRAMES[@]} ))
    sleep 0.08
  done
  printf "\r\033[K"
}

run_step() {
  local name="$1"
  shift
  current_step="$name"
  steps+=("$name")
  step_start=$SECONDS

  local tmpfile
  tmpfile=$(mktemp)

  ("$@" > "$tmpfile" 2>&1) &
  local pid=$!
  spin "$pid"

  local exit_code=0
  wait "$pid" || exit_code=$?

  local elapsed=$(( SECONDS - step_start ))
  local dur
  dur=$(format_duration $elapsed)
  durations+=("$dur")

  if [ "$exit_code" -eq 0 ]; then
    statuses+=("pass")
    errors+=("")
    printf "  ${GREEN}${PASS}${RESET} %s ${DIM}%s${RESET}\n" "$name" "$dur"
  else
    statuses+=("fail")
    errors+=("$(cat "$tmpfile")")
    printf "  ${RED}${FAIL}${RESET} %s ${DIM}%s${RESET}\n" "$name" "$dur"
  fi

  rm -f "$tmpfile"
  return "$exit_code"
}

run_step_capture() {
  local name="$1"
  shift
  current_step="$name"
  steps+=("$name")
  step_start=$SECONDS

  local tmpfile
  tmpfile=$(mktemp)

  ("$@" > "$tmpfile" 2>&1) &
  local pid=$!
  spin "$pid"

  local exit_code=0
  wait "$pid" || exit_code=$?

  local elapsed=$(( SECONDS - step_start ))
  local dur
  dur=$(format_duration $elapsed)
  durations+=("$dur")

  CAPTURED_OUTPUT=$(cat "$tmpfile")
  rm -f "$tmpfile"

  if [ "$exit_code" -eq 0 ]; then
    statuses+=("pass")
    errors+=("")
    printf "  ${GREEN}${PASS}${RESET} %s ${DIM}%s${RESET}\n" "$name" "$dur"
  else
    statuses+=("fail")
    errors+=("$CAPTURED_OUTPUT")
    printf "  ${RED}${FAIL}${RESET} %s ${DIM}%s${RESET}\n" "$name" "$dur"
  fi

  return "$exit_code"
}

coverage_base_ref() {
  git merge-base HEAD "${COVERAGE_BASE_REF:-main}" 2>/dev/null
}

added_api_sources() {
  local base
  base=$(coverage_base_ref) || return 0

  {
    git diff --diff-filter=A --name-only "$base" -- apps/api/src 2>/dev/null
    git ls-files --others --exclude-standard -- apps/api/src 2>/dev/null
  } | sed 's|^apps/api/||' | sort -u
}

modified_api_sources() {
  local base
  base=$(coverage_base_ref) || return 0

  {
    git diff --diff-filter=M --name-only "$base" -- apps/api/src 2>/dev/null
    git diff --diff-filter=M --name-only -- apps/api/src 2>/dev/null
  } | sed 's|^apps/api/||' | sort -u
}

check_api_coverage() {
  CLEAN_OUTPUT=$(echo "$CAPTURED_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/^@draftila\/api test: //')

  if echo "$CLEAN_OUTPUT" | grep -qE '[1-9][0-9]* fail'; then
    return 1
  fi

  if ! coverage_base_ref >/dev/null; then
    echo "WARN COVERAGE: cannot resolve ${COVERAGE_BASE_REF:-main}; coverage is not being enforced." >&2
    return 0
  fi

  local added modified
  added=$(added_api_sources)
  modified=$(modified_api_sources)
  [ -z "$added" ] && [ -z "$modified" ] && return 0

  local report
  report=$(echo "$CLEAN_OUTPUT" | grep '|' | while IFS='|' read -r file _funcs lines _uncovered; do
    file=$(echo "$file" | tr -d ' ')
    lines=$(echo "$lines" | tr -d ' ')

    [ -z "$file" ] && continue
    [[ "$file" == File ]] && continue
    [[ "$file" == Allfiles ]] && continue
    [[ "$file" == -* ]] && continue
    [[ "$file" != src/* ]] && continue
    [ "$lines" = "100.00" ] && continue

    if printf '%s\n' "$added" | grep -qxF "$file"; then
      echo "FAIL COVERAGE: $file has ${lines}% line coverage, expected 100% (added on this branch)."
    elif printf '%s\n' "$modified" | grep -qxF "$file"; then
      echo "WARN COVERAGE: $file has ${lines}% line coverage (modified on this branch, not enforced)."
    fi
  done)

  local reported
  reported=$(echo "$CLEAN_OUTPUT" | grep '|' | cut -d'|' -f1 | tr -d ' ' | grep '^src/' || true)

  local unreported
  unreported=$(printf '%s\n' "$added" | while read -r file; do
    [ -z "$file" ] && continue
    printf '%s\n' "$reported" | grep -qxF "$file" && continue
    echo "FAIL COVERAGE: $file is not reached by any test (absent from the coverage report)."
  done)

  report=$(printf '%s\n%s' "$report" "$unreported" | grep -v '^$' || true)

  [ -n "$report" ] && printf '%s\n' "$report" >&2

  if printf '%s\n' "$report" | grep -q '^FAIL COVERAGE:'; then
    return 1
  fi

  return 0
}

printf "\n"

failed=0

if [ "$FIX" -eq 1 ]; then
  run_step "Formatting (fix)" bun run format || failed=1
else
  run_step "Formatting" bun run format:check || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "Typecheck API" bun run --filter @draftila/api typecheck || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "Typecheck Web" bun run --filter @draftila/web typecheck || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "Typecheck CLI" bun run --filter @draftila/cli typecheck || failed=1
fi

if [ "$failed" -eq 0 ]; then
  if [ "$FIX" -eq 1 ]; then
    run_step "Linting (fix)" bun run lint:fix || failed=1
  else
    run_step "Linting" bun run lint || failed=1
  fi
fi

if [ "$failed" -eq 0 ]; then
  run_step "Engine tests" bun run --filter @draftila/engine test || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "Web tests" bun run --filter @draftila/web test || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "CLI tests" bun run --filter @draftila/cli test || failed=1
fi

if [ "$failed" -eq 0 ]; then
  CAPTURED_OUTPUT=""
  run_step_capture "API tests" bun run --filter @draftila/api test -- --coverage || failed=1

  if [ "$failed" -eq 0 ]; then
    cov_start=$SECONDS
    coverage_error=$(check_api_coverage 2>&1) || {
      failed=1
      cov_dur=$(format_duration $(( SECONDS - cov_start )))
      steps+=("API coverage")
      statuses+=("fail")
      errors+=("$coverage_error")
      durations+=("$cov_dur")
      printf "  ${RED}${FAIL}${RESET} API coverage ${DIM}%s${RESET}\n" "$cov_dur"
    }
    if [ "$failed" -eq 0 ]; then
      cov_dur=$(format_duration $(( SECONDS - cov_start )))
      steps+=("API coverage")
      statuses+=("pass")
      errors+=("")
      durations+=("$cov_dur")
      printf "  ${GREEN}${PASS}${RESET} API coverage ${DIM}%s${RESET}\n" "$cov_dur"
    fi
  fi
fi

printf "\n"

total_dur=$(format_duration $(( SECONDS - total_start )))

if [ "$failed" -ne 0 ]; then
  printf "${RED}${BOLD}  Failed${RESET} ${DIM}in %s${RESET}\n\n" "$total_dur"
  for i in "${!steps[@]}"; do
    if [ "${statuses[$i]}" = "fail" ] && [ -n "${errors[$i]}" ]; then
      printf "${DIM}─── %s ───${RESET}\n" "${steps[$i]}"
      echo "${errors[$i]}" | tail -30
      printf "\n"
    fi
  done
  exit 1
else
  printf "${GREEN}${BOLD}  All checks passed${RESET} ${DIM}in %s${RESET}\n\n" "$total_dur"
fi
