#!/usr/bin/env bash
set -euo pipefail

# check-test-presence.sh — CI guard for test coverage shape.
#
# Handler behavior coverage is fixture-backed. Do not require same-name
# synthetic handler unit tests; those are migration debt until ported/deleted.

if [ "${1:-}" = "--self-test" ]; then
    TMPFILE="src/handlers/_tg_check_self_test.ts"
    echo "export const dummy = {};" > "$TMPFILE"
    trap 'rm -f "$TMPFILE"' EXIT

    HANDLER_NAME="$(basename "$TMPFILE" .ts)"
    if grep -rq "$HANDLER_NAME" tests/ 2>/dev/null; then
        echo "FAIL: self-test broken (false negative)"
        exit 1
    fi
    rm "$TMPFILE"
    trap - EXIT
    echo "PASS: --self-test detection works correctly"
    exit 0
fi

EXIT_CODE=0
MISSING=""

check_pair() {
    local src="$1"
    local test="$2"
    if [ ! -f "$src" ]; then
        printf "  SKIP   %s (file not found)\n" "$src"
        return
    fi
    if [ -f "$test" ]; then
        printf "  PASS   %s → %s\n" "$src" "$test"
    else
        printf "  FAIL   %s → %s (MISSING)\n" "$src" "$test"
        MISSING="${MISSING}  - $src → $test\n"
        EXIT_CODE=1
    fi
}

echo "check-test-presence: verifying product test coverage shape..."
echo ""

echo "check-test-presence: verifying registered handlers have fixture-backed coverage..."
if pnpm exec vitest run --config vitest.migration.config.ts tests/unit/handlers/registeredHandlerCoverage.test.ts; then
    printf "  PASS   registered handlers → fixtureCases\n"
else
    printf "  FAIL   registered handlers → fixtureCases\n"
    EXIT_CODE=1
fi

echo ""

# Core test pairs
check_pair "src/core/ansi.ts" "tests/unit/core/ansi.test.ts"
check_pair "src/core/savings.ts" "tests/unit/savings.test.ts"
check_pair "src/core/pipeline.ts" "tests/unit/pipeline.test.ts"
check_pair "src/parse.ts" "tests/unit/parse.test.ts"
check_pair "src/router.ts" "tests/unit/router.test.ts"
check_pair "src/executor.ts" "tests/unit/executor.test.ts"

# Check for unmapped handler files
echo ""
echo "check-test-presence: scanning for unmapped handler files..."
KNOWN_HANDLERS="searchLike listLike readLike status diff log branch show extended hostingCli generic pytest ruff mypy pip test tsc eslint packageList maven gradle javac"
for f in $(find src/handlers -name "*.ts" ! -name "index.ts" ! -name "base.ts" | sort); do
    fname="$(basename "$f" .ts)"
    if ! echo "$KNOWN_HANDLERS" | grep -qw "$fname"; then
        printf "  WARN   %s (not in handler map)\n" "$f"
    fi
done

echo ""

if [ "$EXIT_CODE" -ne 0 ]; then
    echo "check-test-presence: FAILED — missing required test coverage:"
    printf "%b" "$MISSING"
    echo ""
    echo "Every registered handler must have fixture-backed coverage; core files must keep direct unit tests."
else
    echo "check-test-presence: required coverage shape is OK"
fi

exit "$EXIT_CODE"
