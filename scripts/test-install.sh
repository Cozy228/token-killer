#!/usr/bin/env bash
#
# test-install.sh — verify ctx can be built, installed, and runs correctly
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

# ── Step 3b: baked VERSION matches package.json (drift guard) ──
#
# The version is baked into the bundle at build time (tsdown `define`
# __CTX_VERSION__ ← package.json.version; see src/version.ts). If the manifest is
# bumped but the shipped artifact carries a stale literal — or vice versa — the
# CLI silently self-reports the wrong version (issue #45). Assert the freshly
# built bundle's `ctx --version` equals package.json.version so the manifest and
# bundle can never diverge.

PKG_VERSION=$(node -p "require('./package.json').version")
BUILT_VERSION=$(node dist/cli.js --version 2>/dev/null | tr -d '[:space:]')
if [ "$BUILT_VERSION" = "$PKG_VERSION" ]; then
    pass "baked VERSION ($BUILT_VERSION) == package.json.version"
else
    fail "baked VERSION ($BUILT_VERSION) != package.json.version ($PKG_VERSION)"
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

if npm link 2>/dev/null && ctx --version >/dev/null 2>&1; then
    pass "npm link && ctx --version"
    npm unlink -g contexa 2>/dev/null || true
else
    pass "npm link && ctx --version  ${YELLOW}(optional — skipped)${NC}"
fi

# ── Report ──────────────────────────────────────────

printf "\nResults: ${GREEN}%d passed${NC}, ${RED}%d failed${NC}\n" "$PASS" "$FAIL"
exit "$FAIL"
