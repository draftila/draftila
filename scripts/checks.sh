#!/usr/bin/env bash
set -euo pipefail

BOLD="\033[1m"
DIM="\033[2m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

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

check_api_coverage() {
  CLEAN_OUTPUT=$(echo "$CAPTURED_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

  if echo "$CLEAN_OUTPUT" | grep -qE '[1-9][0-9]* fail'; then
    return 1
  fi

  local coverage_fail=0
  echo "$CLEAN_OUTPUT" | grep '|' | while IFS='|' read -r file _funcs lines _uncovered; do
    file=$(echo "$file" | tr -d ' ')
    lines=$(echo "$lines" | tr -d ' ')

    [ -z "$file" ] && continue
    [[ "$file" == File ]] && continue
    [[ "$file" == Allfiles ]] && continue
    [[ "$file" == -* ]] && continue
    [[ "$file" != src/* ]] && continue

    if [ "$lines" != "100.00" ]; then
      echo "COVERAGE: $file has ${lines}% line coverage, expected 100%."
      exit 1
    fi
  done

  if [ $? -ne 0 ]; then
    return 1
  fi

  return 0
}

printf "\n"

failed=0

run_step "Formatting" bun run format:check || failed=1

if [ "$failed" -eq 0 ]; then
  run_step "Typecheck API" bun run --filter @draftila/api typecheck || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "Typecheck Web" bun run --filter @draftila/web typecheck || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "Linting" bun run lint || failed=1
fi

if [ "$failed" -eq 0 ]; then
  run_step "Frontend tests" bun run --filter @draftila/web test -- --coverage || failed=1
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
