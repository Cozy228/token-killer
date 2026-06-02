#!/usr/bin/env bash
set -euo pipefail

# ── Detect tg binary ────────────────────────────────────────────────
ROOT="$(pwd)"
if [ -f "$ROOT/dist/cli.js" ]; then
  TG="node $ROOT/dist/cli.js"
elif command -v tg &> /dev/null; then
  TG="$(command -v tg)"
else
  echo "Error: tg not found. Run 'pnpm build' or install tg globally."
  exit 1
fi

# ── Colour helpers ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # no colour

# ── Helpers ─────────────────────────────────────────────────────────
count_tokens() {
  local input="$1"
  local len=${#input}
  echo $(( (len + 3) / 4 ))
}

# ── Global counters ─────────────────────────────────────────────────
TOTAL_RAW=0
TOTAL_TG=0
GOOD_TESTS=0
WARN_TESTS=0
NEGATIVE_TESTS=0
FAIL_TESTS=0

# ── bench(name, raw_cmd, tg_cmd) ────────────────────────────────────
bench() {
  local name="$1"
  local raw_cmd="$2"
  local tg_cmd="$3"

  local raw_out tg_out raw_tokens tg_tokens icon tag savings pct

  raw_out=$(eval "$raw_cmd" 2>/dev/null || true)
  tg_out=$(eval "$tg_cmd" 2>/dev/null || true)

  raw_tokens=$(count_tokens "$raw_out")
  tg_tokens=$(count_tokens "$tg_out")

  # --- classify ---
  if [ -z "$tg_out" ] && [ -n "$raw_out" ]; then
    icon="🔴"
    tag="FAIL"
    FAIL_TESTS=$((FAIL_TESTS + 1))
    TOTAL_RAW=$((TOTAL_RAW + raw_tokens))
    TOTAL_TG=$((TOTAL_TG + raw_tokens))
  elif [ "$tg_tokens" -gt "$raw_tokens" ] && [ "$raw_tokens" -gt 0 ]; then
    icon="🔴"
    tag="NEG"
    NEGATIVE_TESTS=$((NEGATIVE_TESTS + 1))
    TOTAL_RAW=$((TOTAL_RAW + raw_tokens))
    TOTAL_TG=$((TOTAL_TG + tg_tokens))
  elif [ "$raw_tokens" -gt 0 ] && [ "$tg_tokens" -eq "$raw_tokens" ]; then
    icon="⚠️ "
    tag="WARN"
    WARN_TESTS=$((WARN_TESTS + 1))
    TOTAL_RAW=$((TOTAL_RAW + raw_tokens))
    TOTAL_TG=$((TOTAL_TG + tg_tokens))
  elif [ "$raw_tokens" -gt 0 ]; then
    savings=$(( (raw_tokens - tg_tokens) * 100 / raw_tokens ))
    if [ "$savings" -lt 60 ]; then
      icon="⚠️ "
      tag="WARN"
      WARN_TESTS=$((WARN_TESTS + 1))
    else
      icon="✅"
      tag="GOOD"
      GOOD_TESTS=$((GOOD_TESTS + 1))
    fi
    TOTAL_RAW=$((TOTAL_RAW + raw_tokens))
    TOTAL_TG=$((TOTAL_TG + tg_tokens))
  else
    icon="⏭️ "
    tag="SKIP"
    WARN_TESTS=$((WARN_TESTS + 1))
  fi

  # --- print one-line result ---
  if [ "$tag" = "FAIL" ]; then
    printf "%s %-20s │ %6d → %6s (--)\n" "$icon" "$name" "$raw_tokens" "-"
  elif [ "$tag" != "SKIP" ]; then
    if [ "$raw_tokens" -gt 0 ]; then
      pct=$(( (raw_tokens - tg_tokens) * 100 / raw_tokens ))
    else
      pct=0
    fi
    printf "%s %-20s │ %6d → %6d (%+d%%)\n" "$icon" "$name" "$raw_tokens" "$tg_tokens" "$pct"
  else
    printf "%s %-20s │ %6s → %6s (--)\n" "$icon" "$name" "-" "-"
  fi
}

# ── section header ──────────────────────────────────────────────────
section() {
  echo ""
  printf "${BOLD}${BLUE}── %s ──${NC}\n" "$1"
}

# ══════════════════════════════════════════════════════════════════════
echo ""
printf "${BOLD}${CYAN}tg Benchmark${NC}\n"
echo "════════════════════════════════════════════════════════════════"
printf "   %-20s │ %s\n" "TEST" "TOKENS (raw → tg)"
echo "────────────────────────────────────────────────────────────────"

# =====================
# ls
# =====================
section "ls"

bench "ls ." \
  "ls -la ." \
  "$TG ls ."

bench "ls src/" \
  "ls -la src/" \
  "$TG ls src/"

bench "ls -la ." \
  "ls -la ." \
  "$TG ls -la ."

# =====================
# read / cat
# =====================
section "read/cat"

if [ -f "package.json" ]; then
  bench "cat package.json" \
    "cat package.json" \
    "$TG cat package.json"
fi

if [ -f "README.md" ]; then
  bench "cat README.md" \
    "cat README.md" \
    "$TG cat README.md"
fi

if [ -f "src/cli.ts" ]; then
  bench "cat src/cli.ts" \
    "cat src/cli.ts" \
    "$TG cat src/cli.ts"
fi

# =====================
# find
# =====================
section "find"

bench "find src -name *.ts" \
  "find src -name '*.ts'" \
  "$TG find src -name \"*.ts\""

bench "find . -name *.json" \
  "find . -name '*.json' -not -path './node_modules/*' -not -path './dist/*' -not -path './.git/*'" \
  "$TG find . -name \"*.json\""

# =====================
# git
# =====================
section "git"

bench "git status" \
  "git status" \
  "$TG git status"

bench "git log -5" \
  "git --no-pager log -5" \
  "$TG git log -5"

bench "git diff" \
  "git --no-pager diff HEAD~1 2>/dev/null || echo ''" \
  "$TG git diff"

bench "git branch" \
  "git --no-pager branch" \
  "$TG git branch"

# =====================
# grep
# =====================
section "grep"

bench "rg export src/" \
  "rg 'export' src/ 2>/dev/null || echo ''" \
  "$TG rg export src/"

bench "grep -r import src/" \
  "grep -r 'import' src/ 2>/dev/null || echo ''" \
  "$TG grep -r import src/"

# =====================
# generic passthrough
# =====================
section "generic passthrough"

bench "echo hello" \
  "echo hello" \
  "$TG echo hello"

bench "node -e" \
  "node -e \"console.log('test')\"" \
  "$TG node -e \"console.log('test')\""

# =====================
# npm / pnpm (conditional)
# =====================
if command -v npm &> /dev/null; then
  section "npm"
  bench "npm list --depth=0" \
    "npm list --depth=0 2>&1 || true" \
    "$TG npm list --depth=0"
fi

if command -v pnpm &> /dev/null; then
  section "pnpm"
  bench "pnpm list --depth=0" \
    "pnpm list --depth=0 2>&1 || true" \
    "$TG pnpm list --depth=0"
fi

# =====================
# tsc (conditional)
# =====================
if { command -v tsc &> /dev/null || [ -f "node_modules/.bin/tsc" ]; } && [ -f "tsconfig.json" ]; then
  section "tsc"
  bench "tsc --noEmit" \
    "tsc --noEmit 2>&1 || true" \
    "$TG tsc --noEmit"
fi

# =====================
# Python (conditional)
# =====================
if command -v python3 &> /dev/null; then
  PY_FIXTURE=$(mktemp -d)

  cat > "$PY_FIXTURE/sample.py" << 'PYEOF'
import os
import sys
import json


def process_data(x):
    if x == None:  # E711
        return []
    result = []
    for i in range(len(x)):  # C416
        result.append(x[i] * 2)
    return result

def unused_function():  # F841
    temp = 42
    return None
PYEOF

  cat > "$PY_FIXTURE/test_sample.py" << 'PYEOF'
from sample import process_data

def test_process_data():
    assert process_data([1, 2, 3]) == [2, 4, 6]

def test_process_data_none():
    assert process_data(None) == []
PYEOF

  cd "$PY_FIXTURE"

  HAVE_PYTEST=false
  HAVE_RUFF=false
  HAVE_PIP=false

  if command -v ruff &> /dev/null; then
    HAVE_RUFF=true
  fi
  if command -v pytest &> /dev/null; then
    HAVE_PYTEST=true
  fi
  if command -v pip &> /dev/null; then
    HAVE_PIP=true
  fi

  if $HAVE_RUFF; then
    section "ruff"
    bench "ruff check ." \
      "ruff check . 2>&1 || true" \
      "$TG ruff check ."
  fi

  if $HAVE_PYTEST; then
    section "pytest"
    bench "pytest -v" \
      "pytest -v 2>&1 || true" \
      "$TG pytest -v"
  fi

  if $HAVE_PIP; then
    section "pip"
    bench "pip list" \
      "pip list 2>&1 || true" \
      "$TG pip list"
  fi

  cd "$ROOT"
  rm -rf "$PY_FIXTURE"
else
  echo ""
  echo "⏭️  Python (python3 not in PATH, skipped)"
fi

# =====================
# Java (conditional)
# =====================
if command -v javac &> /dev/null; then
  section "Java"
  bench "javac -version" \
    "javac -version 2>&1 || true" \
    "$TG javac -version"
else
  echo ""
  echo "⏭️  Java (javac not in PATH, skipped)"
fi

# ══════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════════"

TOTAL_TESTS=$((GOOD_TESTS + WARN_TESTS + NEGATIVE_TESTS + FAIL_TESTS))

if [ "$TOTAL_TESTS" -gt 0 ]; then
  if [ "$TOTAL_RAW" -gt 0 ]; then
    TOTAL_SAVED=$((TOTAL_RAW - TOTAL_TG))
    TOTAL_SAVE_PCT=$((TOTAL_SAVED * 100 / TOTAL_RAW))
  else
    TOTAL_SAVED=0
    TOTAL_SAVE_PCT=0
  fi

  echo ""
  printf "  ${GREEN}✅ %d good${NC}  ${YELLOW}⚠️  %d warn${NC}  ${RED}🔴 %d negative${NC}  ${RED}❌ %d fail${NC}\n" \
    "$GOOD_TESTS" "$WARN_TESTS" "$NEGATIVE_TESTS" "$FAIL_TESTS"
  echo ""
  printf "  Tokens: %d → %d  (${GREEN}-%d%%${NC})\n" \
    "$TOTAL_RAW" "$TOTAL_TG" "$TOTAL_SAVE_PCT"
  echo ""

  EXIT_CODE=0

  if [ "$NEGATIVE_TESTS" -gt 0 ]; then
    printf "  ${RED}✗ BENCHMARK FAILED:${NC} %d filter(s) produced more tokens than raw output\n" \
      "$NEGATIVE_TESTS"
    EXIT_CODE=1
  fi

  if [ "$FAIL_TESTS" -gt 0 ]; then
    printf "  ${RED}✗ BENCHMARK FAILED:${NC} %d filter(s) returned empty output\n" \
      "$FAIL_TESTS"
    EXIT_CODE=1
  fi

  exit $EXIT_CODE
fi
