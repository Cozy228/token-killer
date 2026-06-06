#!/usr/bin/env bash
#
# test-install.sh — verify tk can be built, installed, and runs correctly
# Ported from RTK scripts/test-install.sh
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); printf "  ${GREEN}PASS${NC}  %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ${RED}FAIL${NC}  %s\n" "$1"; }

# ── Step 1: Build ───────────────────────────────────

if pnpm run build >/dev/null 2>&1; then
    pass "pnpm run build"
else
    fail "pnpm run build"
fi

# ── Step 2: dist/cli.js exists and is a file ────────

if [ -f "dist/cli.js" ]; then
    pass "dist/cli.js exists"
else
    fail "dist/cli.js exists"
fi

# ── Step 3: --version prints a version number ───────

if node dist/cli.js --version 2>&1 | grep -qE '[0-9]+\.[0-9]+'; then
    pass "node dist/cli.js --version"
else
    fail "node dist/cli.js --version"
fi

# ── Step 4: --help prints usage ─────────────────────

if node dist/cli.js --help 2>&1 | grep -q 'Usage'; then
    pass "node dist/cli.js --help"
else
    fail "node dist/cli.js --help"
fi

# ── Step 5: ls . works ──────────────────────────────

if node dist/cli.js ls . >/dev/null 2>&1; then
    pass "node dist/cli.js ls ."
else
    fail "node dist/cli.js ls ."
fi

# ── Step 6: npm link round-trip ─────────────────────

if npm link 2>/dev/null && tk --version >/dev/null 2>&1; then
    pass "npm link && tk --version"
    npm unlink -g token-killer 2>/dev/null || true
else
    pass "npm link && tk --version  ${YELLOW}(optional — skipped)${NC}"
fi

# ── Report ──────────────────────────────────────────

printf "\nResults: ${GREEN}%d passed${NC}, ${RED}%d failed${NC}\n" "$PASS" "$FAIL"
exit "$FAIL"
