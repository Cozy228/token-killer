#!/usr/bin/env bash
set -euo pipefail

# check-installation.sh — verify ctx is properly installed with all dependencies
# Ported from RTK scripts/check-installation.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
EXIT_CODE=0

check() {
    local label="$1"; shift
    if "$@"; then
        printf "  ${GREEN}PASS${NC}   %s\n" "$label"
        PASS=$((PASS + 1))
    else
        printf "  ${RED}FAIL${NC}   %s\n" "$label"
        FAIL=$((FAIL + 1))
        EXIT_CODE=1
    fi
}

check_opt() {
    local label="$1"; shift
    if "$@"; then
        printf "  ${GREEN}avail${NC}  %s\n" "$label"
        PASS=$((PASS + 1))
    else
        printf "  ${YELLOW}none${NC}   %s\n" "$label"
        SKIP=$((SKIP + 1))
    fi
}

echo "check-installation: verifying ctx and dependencies..."
echo ""

# Step 1: node >= 20
echo "--- Core runtime ---"
check "node >= 20" bash -c 'node -e "process.exit(parseInt(process.versions.node) < 20 ? 1 : 0)"'

# Step 2: pnpm
check "pnpm available" bash -c 'command -v pnpm >/dev/null 2>&1'

# Step 3: ctx binary
echo ""
echo "--- ctx binary ---"
if command -v ctx >/dev/null 2>&1; then
    printf "  ${GREEN}PASS${NC}   ctx (global command)\n"
    PASS=$((PASS + 1))
    CTX_CMD="ctx"
elif [ -x "dist/cli.js" ] && node -e "" 2>/dev/null; then
    printf "  ${GREEN}PASS${NC}   ctx via node dist/cli.js\n"
    PASS=$((PASS + 1))
    CTX_CMD="node dist/cli.js"
else
    printf "  ${RED}FAIL${NC}   ctx binary not found\n"
    FAIL=$((FAIL + 1))
    EXIT_CODE=1
    CTX_CMD=""
fi

# Step 4: ctx --version
echo ""
echo "--- Version check ---"
if [ -n "$CTX_CMD" ]; then
    if VERSION=$($CTX_CMD --version 2>/dev/null || true); then
        printf "  ${GREEN}PASS${NC}   ctx version: %s\n" "$VERSION"
        PASS=$((PASS + 1))
    else
        printf "  ${RED}FAIL${NC}   ctx --version failed\n"
        FAIL=$((FAIL + 1))
        EXIT_CODE=1
    fi
else
    printf "  ${RED}FAIL${NC}   ctx --version skipped (no binary)\n"
    FAIL=$((FAIL + 1))
    EXIT_CODE=1
fi

# Step 5: git
echo ""
echo "--- Git ---"
check "git available" bash -c 'command -v git >/dev/null 2>&1'

# Step 6: optional tools
echo ""
echo "--- Optional tools ---"
check_opt "rg (ripgrep)"   bash -c 'command -v rg >/dev/null 2>&1'
check_opt "tsc"            bash -c 'command -v tsc >/dev/null 2>&1'
check_opt "pytest"         bash -c 'command -v pytest >/dev/null 2>&1'
check_opt "ruff"           bash -c 'command -v ruff >/dev/null 2>&1'
check_opt "mypy"           bash -c 'command -v mypy >/dev/null 2>&1'
check_opt "pip"            bash -c 'command -v pip >/dev/null 2>&1'
check_opt "eslint"         bash -c 'command -v eslint >/dev/null 2>&1'
check_opt "vitest"         bash -c 'command -v vitest >/dev/null 2>&1'
check_opt "jest"           bash -c 'command -v jest >/dev/null 2>&1'
check_opt "mvn"            bash -c 'command -v mvn >/dev/null 2>&1'
check_opt "gradle"         bash -c 'command -v gradle >/dev/null 2>&1'
check_opt "javac"          bash -c 'command -v javac >/dev/null 2>&1'

# Summary
echo ""
echo "────────────────────────────────────────"
printf "Results: ${GREEN}%d passed${NC}, ${YELLOW}%d not-installed${NC}" "$PASS" "$SKIP"
if [ "$FAIL" -gt 0 ]; then
    printf ", ${RED}%d failed${NC}" "$FAIL"
fi
echo ""
echo "────────────────────────────────────────"

if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "check-installation: ${RED}FAILED${NC} — critical checks did not pass."
else
    echo ""
    echo "check-installation: ${GREEN}OK${NC} — ctx is ready."
fi

exit "$EXIT_CODE"
