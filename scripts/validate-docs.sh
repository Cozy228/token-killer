#!/usr/bin/env bash
set -e

# validate-docs.sh — CI guard: README.md must document all handler-covered commands
# Ported from RTK scripts/validate-docs.sh

README="README.md"
PASS=0
FAIL=0
EXIT_CODE=0

# All program names covered by src/handlers/*.ts
PROGRAMS=(
    cat type less           # common/readLike.ts
    ls dir find tree         # common/listLike.ts
    rg grep                  # common/searchLike.ts
    git                      # git/{status,diff,log,branch,show}.ts
    pytest ruff mypy pip     # python/*.ts
    npm pnpm yarn vitest jest # js/{test,packageList}.ts
    eslint tsc               # js/{eslint,tsc}.ts
    mvn gradle javac         # java/*.ts
)

FLAGS=(
    --raw
    --stats
    --report
)

echo "validate-docs: checking README.md documents all handler-covered commands..."
echo ""

check_mention() {
    local label="$1"
    local pattern="$2"
    if grep -q -- "$pattern" "$README"; then
        printf "  PASS   %s\n" "$label"
        PASS=$((PASS + 1))
    else
        printf "  FAIL   %s (not found in %s)\n" "$label" "$README"
        FAIL=$((FAIL + 1))
        EXIT_CODE=1
    fi
}

echo "--- Commands ---"
for prog in "${PROGRAMS[@]}"; do
    check_mention "$prog" "$prog"
done

echo ""
echo "--- Flags ---"
for flag in "${FLAGS[@]}"; do
    check_mention "$flag" "$flag"
done

TOTAL=$((PASS + FAIL))
echo ""
echo "validate-docs: $PASS/$TOTAL passed, $FAIL failed"

if [ "$EXIT_CODE" -ne 0 ]; then
    echo "validate-docs: FAILED — README.md is missing handler-covered items"
else
    echo "validate-docs: all handler-covered items documented — OK"
fi

exit "$EXIT_CODE"
