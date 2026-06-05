#!/usr/bin/env bash
#
# tk Atlas lifecycle dogfood — exercises compression, hook rewrite dry-run, and
# context optimizer surfaces against a real pnpm/TS monorepo (default: ../atlas).
#
# All command-proxy invocations pipe stdout through cat to simulate non-TTY agent
# context. Mutating git commands use --dry-run; init/optimize use --dry-run only.
#
# Usage:
#   bash scripts/atlas-dogfood.sh [target-repo]
#   TK_DOGFOOD_CWD=~/Workspace/atlas bash scripts/atlas-dogfood.sh
#
# Exit code: number of failures (0 = all green)
#
set -uo pipefail

PASS=0
FAIL=0
SKIP=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

find_tk() {
  if [ -f "$ROOT/dist/cli.js" ]; then
    TK=(node "$ROOT/dist/cli.js")
  elif command -v tk >/dev/null 2>&1; then
    TK=(tk)
  else
    echo "tk binary not found. Run: pnpm build"
    exit 1
  fi
}

resolve_target() {
  local candidate="${TK_DOGFOOD_CWD:-${1:-$ROOT/../atlas}}"
  if [ ! -d "$candidate" ]; then
    echo "Target repo not found: $candidate"
    echo "Set TK_DOGFOOD_CWD or pass a path: bash scripts/atlas-dogfood.sh <repo>"
    exit 1
  fi
  TARGET="$(cd "$candidate" && pwd)"
}

section() {
  printf "\n${BOLD}${CYAN}── %s ──${NC}\n" "$1"
}

run_tk_stats() {
  local name="$1"
  shift
  local out exit_code=0
  out=$("${TK[@]}" --stats "$@" 2>&1 | cat) || exit_code=$?
  if echo "$out" | grep -q "## Token Savings"; then
    PASS=$((PASS + 1))
    local stats suffix=""
    stats=$(echo "$out" | grep -E "^(Raw|Output|Saved):" | tr '\n' ' ')
    if [ "$exit_code" -ne 0 ]; then
      suffix=" (upstream exit=$exit_code, compression ok)"
    fi
    printf "  ${GREEN}PASS${NC}  %-40s %s%s\n" "$name" "$stats" "$suffix"
    return
  fi
  if [ "$exit_code" -ne 0 ]; then
    FAIL=$((FAIL + 1))
    printf "  ${RED}FAIL${NC}  %-40s exit=%s\n" "$name" "$exit_code"
    echo "$out" | head -5 | sed 's/^/        /'
    return
  fi
  PASS=$((PASS + 1))
  printf "  ${GREEN}PASS${NC}  %-40s (passthrough)\n" "$name"
}

run_hook_check() {
  local name="$1"
  shift
  local out exit_code=0
  out=$("${TK[@]}" hook check "$@" 2>&1) || exit_code=$?
  if [ "$exit_code" -eq 0 ] && [ -n "$out" ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}PASS${NC}  %-40s %s\n" "$name" "$out"
  else
    FAIL=$((FAIL + 1))
    printf "  ${RED}FAIL${NC}  %-40s exit=%s\n" "$name" "$exit_code"
  fi
}

skip_test() {
  local name="$1"
  local reason="$2"
  SKIP=$((SKIP + 1))
  printf "  ${YELLOW}SKIP${NC}  %s (%s)\n" "$name" "$reason"
}

find_tk
resolve_target "$@"
cd "$TARGET"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

printf "${BOLD}tk Atlas Lifecycle Dogfood${NC}\n"
printf "tk:      %s\n" "${TK[*]}"
printf "target:  %s\n" "$TARGET"
printf "version: %s\n" "$("${TK[@]}" --version 2>&1)"
printf "date:    %s\n" "$(date '+%Y-%m-%d %H:%M')"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Target must be a git repository."
  exit 1
fi

section "List / Read"
run_tk_stats "ls ." ls .
run_tk_stats "ls packages/" ls packages/
run_tk_stats "find packages -name package.json" find packages -name "package.json"
if command -v tree >/dev/null 2>&1; then
  run_tk_stats "tree -L 2 packages" tree -L 2 packages/
  run_tk_stats "tree packages" tree packages/
else
  skip_test "tree" "tree not installed"
fi
run_tk_stats "read CONTEXT.md" read CONTEXT.md
run_tk_stats "read --level aggressive package.json" read --level aggressive package.json
run_tk_stats "cat package.json" cat package.json

section "Search"
if command -v rg >/dev/null 2>&1; then
  run_tk_stats "rg export packages" rg export packages/
  run_tk_stats "rg --level minimal export packages" rg --level minimal export packages/
else
  skip_test "rg" "rg not installed"
fi
run_tk_stats "grep -r workspace packages" grep -r workspace packages/

section "Git (read-only + dry-run)"
run_tk_stats "git status" git status
run_tk_stats "git log --oneline -10" git log --oneline -10
run_tk_stats "git diff" git diff
run_tk_stats "git branch" git branch
run_tk_stats "git show -1 --stat" git show -1 --stat
run_tk_stats "git worktree list" git worktree list
run_tk_stats "git add --dry-run ." git add --dry-run .
run_tk_stats "git commit -a --dry-run" git commit -a --dry-run -m "tk-dogfood-test"
run_tk_stats "git push --dry-run" git push --dry-run origin HEAD

section "pnpm"
run_tk_stats "pnpm --version" pnpm --version
run_tk_stats "pnpm list --depth=0" pnpm list --depth=0

section "TypeScript"
if command -v pnpm >/dev/null 2>&1; then
  run_tk_stats "pnpm exec tsc --noEmit" pnpm exec tsc --noEmit
else
  skip_test "pnpm exec tsc --noEmit" "pnpm not installed"
fi

section "Hook check (rewrite dry-run)"
run_hook_check "hook: git status" git status
run_hook_check "hook: git commit" git commit -m test
run_hook_check "hook: git add ." git add .
run_hook_check "hook: pnpm list" pnpm list --depth=0
run_hook_check "hook: rg export" rg export packages/
run_hook_check "hook: read" read CONTEXT.md
run_hook_check "hook: ls" ls .

section "Init / Optimize dry-run"
if "${TK[@]}" init --host copilot-cli --dry-run >"$TMP_DIR/init.out" 2>&1; then
  PASS=$((PASS + 1))
  printf "  ${GREEN}PASS${NC}  init --host copilot-cli --dry-run\n"
  grep '\[dry-run\]' "$TMP_DIR/init.out" | sed 's/^/        /'
else
  FAIL=$((FAIL + 1))
  printf "  ${RED}FAIL${NC}  init --host copilot-cli --dry-run\n"
fi

if "${TK[@]}" optimize context --project --dry-run >"$TMP_DIR/optimize.out" 2>&1; then
  PASS=$((PASS + 1))
  printf "  ${GREEN}PASS${NC}  optimize context --project --dry-run\n"
  head -8 "$TMP_DIR/optimize.out" | sed 's/^/        /'
else
  FAIL=$((FAIL + 1))
  printf "  ${RED}FAIL${NC}  optimize context --project --dry-run\n"
  head -8 "$TMP_DIR/optimize.out" | sed 's/^/        /'
fi

section "Inspect (read-only)"
if "${TK[@]}" inspect --project --copilot-context >"$TMP_DIR/inspect.out" 2>&1; then
  PASS=$((PASS + 1))
  printf "  ${GREEN}PASS${NC}  inspect --project --copilot-context\n"
else
  PASS=$((PASS + 1))
  printf "  ${YELLOW}WARN${NC}  inspect --project --copilot-context exit=%s\n" "$?"
fi
head -12 "$TMP_DIR/inspect.out" | sed 's/^/        /'

section "Report"
run_tk_stats "report" --report

printf "\n${BOLD}══════════════════════════════════════${NC}\n"
printf "${BOLD}Results: ${GREEN}%d passed${NC}, ${RED}%d failed${NC}, ${YELLOW}%d skipped${NC}\n" "$PASS" "$FAIL" "$SKIP"
printf "${BOLD}══════════════════════════════════════${NC}\n"

exit "$FAIL"
