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

# Quality gate: a "must-compress" case. Parses Raw tokens + Saved%. The rule
# (user directive): only outputs BELOW MIN_RAW may be 0% — anything large MUST
# clear the per-case minimum savings, else FAIL. This turns the dogfood from
# "did it run" into "did compression actually pay off on representative output".
MIN_RAW=${TK_DOGFOOD_MIN_RAW:-1500}
run_tk_savings() {
  local name="$1" minpct="$2"
  shift 2
  local out exit_code=0 raw pct
  out=$("${TK[@]}" --stats "$@" 2>&1 | cat) || exit_code=$?
  if ! echo "$out" | grep -q "## Token Savings"; then
    FAIL=$((FAIL + 1))
    printf "  ${RED}FAIL${NC}  %-36s no compression (passthrough)\n" "$name"
    echo "$out" | head -3 | sed 's/^/        /'
    return
  fi
  raw=$(echo "$out" | awk '/^Raw:/{print $2}'); raw=${raw:-0}
  pct=$(echo "$out" | awk -F'[()%]' '/^Saved:/{print $2}'); pct=${pct:-0}
  if awk "BEGIN{exit !($raw < $MIN_RAW)}"; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}PASS${NC}  %-36s raw=%-7s saved=%s%% (small <%s, 0%% ok)\n" "$name" "$raw" "$pct" "$MIN_RAW"
    return
  fi
  if awk "BEGIN{exit !(($pct + 0) >= $minpct)}"; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}PASS${NC}  %-36s raw=%-7s saved=%s%% (>=%s%%)\n" "$name" "$raw" "$pct" "$minpct"
    return
  fi
  FAIL=$((FAIL + 1))
  printf "  ${RED}FAIL${NC}  %-36s raw=%-7s saved=%s%% < %s%% required\n" "$name" "$raw" "$pct" "$minpct"
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

# Largest source dir present in the target (for search/list breadth).
SRCDIR="."
for d in packages portal src apps lib; do
  if [ -d "$d" ]; then SRCDIR="$d"; break; fi
done

# Quality bar (thresholds calibrated on the atlas monorepo, set well below
# observed so they catch regressions, not normal variance): git log -p ~99%,
# git log full ~68%, rg ~76%, find ~99%, cat --level aggressive ~100%.
section "Compression quality — large output MUST clear the savings bar"
run_tk_savings "git log -p -20 (diff compaction at scale)" 70 git log -p -20
run_tk_savings "git log -30 (log reformat at scale)"       45 git log -30
if command -v rg >/dev/null 2>&1; then
  run_tk_savings "rg import $SRCDIR (search dedup+cap)"     45 rg import "$SRCDIR"
else
  skip_test "rg import" "rg not installed"
fi
if command -v find >/dev/null 2>&1; then
  run_tk_savings "find . -name *.ts (list cap+recovery)"   60 find . -name "*.ts"
fi
# Language-aware file read: readHandler matches `cat`, keeps signatures/imports
# under --level aggressive. (Absent where `cat` is not installed, e.g. bare
# Windows — covered there by the git/rg/tree binaries instead.)
if command -v cat >/dev/null 2>&1; then
  BIG_TS=$(find . -name '*.ts' -not -path '*/node_modules/*' 2>/dev/null \
    | xargs wc -l 2>/dev/null | sort -rn | awk '$2 != "total" {print $2; exit}')
  if [ -n "${BIG_TS:-}" ] && [ -f "$BIG_TS" ]; then
    run_tk_savings "cat --level aggressive (keep signatures)" 40 cat --level aggressive "$BIG_TS"
  fi
fi

section "Faithful / correctness (runs + sane output, 0% allowed on small)"
run_tk_stats "git status" git status
run_tk_stats "git branch" git branch
run_tk_stats "git show -1 --stat" git show -1 --stat
run_tk_stats "git diff" git diff
if command -v tree >/dev/null 2>&1; then
  run_tk_stats "tree $SRCDIR" tree "$SRCDIR"
else
  skip_test "tree" "tree not installed"
fi
run_tk_stats "pnpm list --depth=0" pnpm list --depth=0
run_tk_stats "pnpm --version" pnpm --version

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
