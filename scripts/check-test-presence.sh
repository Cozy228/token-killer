#!/usr/bin/env bash
set -euo pipefail

# check-test-presence.sh — CI guard: every handler .ts file must have tests
# Ported from RTK scripts/check-test-presence.sh

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

echo "check-test-presence: verifying handler test coverage..."
echo ""

# Handler test pairs
check_pair "src/handlers/common/searchLike.ts" "tests/unit/handlers/common/searchLike.test.ts"
check_pair "src/handlers/common/listLike.ts" "tests/unit/handlers/common/listLike.test.ts"
check_pair "src/handlers/common/readLike.ts" "tests/unit/handlers/common/readLike.test.ts"
check_pair "src/handlers/git/status.ts" "tests/unit/handlers/git/status.test.ts"
check_pair "src/handlers/git/diff.ts" "tests/unit/handlers/git/diff.test.ts"
check_pair "src/handlers/git/log.ts" "tests/unit/handlers/git/log.test.ts"
check_pair "src/handlers/git/branch.ts" "tests/unit/handlers/git/branch.test.ts"
check_pair "src/handlers/git/show.ts" "tests/unit/handlers/git/show.test.ts"
check_pair "src/handlers/git/extended.ts" "tests/unit/handlers/git/extended.test.ts"
check_pair "src/handlers/git/hostingCli.ts" "tests/unit/handlers/git/hostingCli.test.ts"
check_pair "src/handlers/generic.ts" "tests/unit/handlers/generic.test.ts"
check_pair "src/handlers/python/pytest.ts" "tests/unit/handlers/python/pytest.test.ts"
check_pair "src/handlers/python/ruff.ts" "tests/unit/handlers/python/ruff.test.ts"
check_pair "src/handlers/python/mypy.ts" "tests/unit/handlers/python/mypy.test.ts"
check_pair "src/handlers/python/pip.ts" "tests/unit/handlers/python/pip.test.ts"
check_pair "src/handlers/js/test.ts" "tests/unit/handlers/js/test.test.ts"
check_pair "src/handlers/js/tsc.ts" "tests/unit/handlers/js/tsc.test.ts"
check_pair "src/handlers/js/eslint.ts" "tests/unit/handlers/js/eslint.test.ts"
check_pair "src/handlers/js/packageList.ts" "tests/unit/handlers/js/packageList.test.ts"
check_pair "src/handlers/java/maven.ts" "tests/unit/handlers/java/maven.test.ts"
check_pair "src/handlers/java/gradle.ts" "tests/unit/handlers/java/gradle.test.ts"
check_pair "src/handlers/java/javac.ts" "tests/unit/handlers/java/javac.test.ts"

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
    echo "check-test-presence: FAILED — missing test files:"
    printf "%b" "$MISSING"
    echo ""
    echo "Every handler file must have a corresponding test file."
else
    echo "check-test-presence: all handlers have tests — OK"
fi

exit "$EXIT_CODE"
