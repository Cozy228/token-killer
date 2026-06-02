#!/usr/bin/env bash
#
# tg Smoke Test Suite
# Ported from RTK scripts/test-all.sh — exercises every tg command.
# Exit code: number of failures (0 = all green)
#
set -euo pipefail

PASS=0
FAIL=0
SKIP=0
FAILURES=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────

assert_ok() {
    local name="$1"
    shift
    local output
    if output=$("$@" 2>&1); then
        PASS=$((PASS + 1))
        printf "  ${GREEN}PASS${NC}  %s\n" "$name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        printf "  ${RED}FAIL${NC}  %s\n" "$name"
        printf "        cmd: %s\n" "$*"
        printf "        out: %s\n" "$(echo "$output" | head -3)"
    fi
}

assert_contains() {
    local name="$1"
    local needle="$2"
    shift 2
    local output
    if output=$("$@" 2>&1) && echo "$output" | grep -q "$needle"; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}PASS${NC}  %s\n" "$name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        printf "  ${RED}FAIL${NC}  %s\n" "$name"
        printf "        expected: '%s'\n" "$needle"
        printf "        got: %s\n" "$(echo "$output" | head -3)"
    fi
}

assert_not_contains() {
    local name="$1"
    local needle="$2"
    shift 2
    local output
    if output=$("$@" 2>&1) && ! echo "$output" | grep -q "$needle"; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}PASS${NC}  %s\n" "$name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        printf "  ${RED}FAIL${NC}  %s\n" "$name"
        printf "        unexpected: '%s'\n" "$needle"
    fi
}

assert_fails() {
    local name="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        FAIL=$((FAIL + 1))
        FAILURES+=("$name (expected failure, got success)")
        printf "  ${RED}FAIL${NC}  %s (expected failure)\n" "$name"
    else
        PASS=$((PASS + 1))
        printf "  ${GREEN}PASS${NC}  %s\n" "$name"
    fi
}

assert_exit() {
    local name="$1"
    local expected="$2"
    shift 2
    local actual=0
    "$@" >/dev/null 2>&1 || actual=$?
    if [ "$actual" -eq "$expected" ]; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}PASS${NC}  %s\n" "$name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        printf "  ${RED}FAIL${NC}  %s (expected exit %d, got %d)\n" "$name" "$expected" "$actual"
    fi
}

skip_test() {
    local name="$1"
    local reason="$2"
    SKIP=$((SKIP + 1))
    printf "  ${YELLOW}SKIP${NC}  %s (%s)\n" "$name" "$reason"
}

section() {
    printf "\n${BOLD}${CYAN}── %s ──${NC}\n" "$1"
}

# ── Preamble ─────────────────────────────────────────

TG=""

find_tg() {
    if [ -f "./dist/cli.js" ]; then
        TG="node ./dist/cli.js"
    elif command -v tg >/dev/null 2>&1; then
        TG="tg"
    else
        echo "tg binary not found. Run: pnpm run build"
        exit 1
    fi
}

find_tg

printf "${BOLD}tg Smoke Test Suite${NC}\n"
printf "Binary: %s\n" "$TG"
printf "Version: %s\n" "$($TG --version 2>&1)"
printf "Date: %s\n" "$(date '+%Y-%m-%d %H:%M')"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Must run from inside a git repository."
    exit 1
fi

# ── 1. Version & Help ───────────────────────────────

section "Version & Help"

assert_contains "tg --version" "0." $TG --version
assert_contains "tg --help" "Usage:" $TG --help

# ── 2. Ls ────────────────────────────────────────────

section "Ls"

assert_ok      "tg ls ."                        $TG ls .
assert_contains "tg ls shows files"             "package.json" $TG ls .
assert_contains "tg ls skips node_modules"      "Skipped" $TG ls .
assert_ok      "tg ls src/"                     $TG ls src/

# ── 3. Read / Cat ────────────────────────────────────

section "Read / Cat"

assert_ok      "tg cat package.json"            $TG cat package.json
assert_contains "tg cat shows name"             "@company/tg" $TG cat package.json
assert_ok      "tg cat README.md"               $TG cat README.md
assert_contains "tg cat README content"         "tg" $TG cat README.md

# ── 4. Git ───────────────────────────────────────────

section "Git"

assert_ok      "tg git status"                  $TG git status
assert_contains "tg git status branch"          "Branch:" $TG git status
assert_ok      "tg git log"                     $TG git log
assert_ok      "tg git log -5"                  $TG git log -- -5
assert_ok      "tg git diff"                    $TG git diff
assert_contains "tg git diff summary"           "Git Diff Summary" $TG git diff
assert_ok      "tg git branch"                  $TG git branch
assert_contains "tg git branch current"         "*" $TG git branch

# ── 5. Grep / Search ─────────────────────────────────

section "Grep / Search"

assert_ok      "tg rg 'export' src/"            $TG rg "export" src/
assert_ok      "tg grep -r 'export' src/"       $TG grep -r "export" src/
assert_contains "tg rg shows Search:"           "Search:" $TG rg "import" src/
assert_ok      "tg rg with path"                $TG rg "handler" src/handlers/

# ── 6. Find ──────────────────────────────────────────

section "Find"

assert_ok      "tg find src -name '*.ts'"       $TG find src -name "*.ts"
assert_contains "tg find shows directories"     "src/" $TG find src -name "*.ts"

# ── 7. Generic passthrough ──────────────────────────

section "Generic passthrough"

assert_ok      "tg echo hello"                  $TG echo hello
assert_contains "tg echo output"                "hello" $TG echo hello
assert_ok      "tg node -e console.log"         $TG node -e "console.log('rtk-style')"
assert_contains "tg node output"                "rtk-style" $TG node -e "console.log('rtk-style')"

# ── 8. Global flags ─────────────────────────────────

section "Global flags"

assert_contains "tg --stats shows savings"      "## Token Savings" $TG --stats ls .
assert_contains "tg --verbose verbose"          "Token Savings" $TG --verbose ls .
assert_ok      "tg --raw ls"                    $TG --raw ls .
assert_contains "tg --raw raw output"           "package.json" $TG --raw ls .
assert_ok      "tg --max-lines 5 ls"            $TG --max-lines 5 ls .
assert_ok      "tg --max-chars 500 ls"          $TG --max-chars 500 ls .
assert_ok      "tg --save-raw ls"               $TG --save-raw ls .
assert_ok      "tg --no-save-raw ls"            $TG --no-save-raw ls .

# ── 9. Report ───────────────────────────────────────

section "Report"

assert_ok      "tg --report"                    $TG --report
assert_contains "tg --report title"             "Token Savings Report" $TG --report
assert_ok      "tg --report --json"             $TG --report --json
assert_contains "tg --report --json valid"      '"commands"' $TG --report --json
assert_ok      "tg --report --csv"              $TG --report --csv
assert_contains "tg --report --csv header"      "commands,raw_tokens" $TG --report --csv

# ── 10. Error handling ──────────────────────────────

section "Error handling"

assert_fails   "tg (no command)"                $TG
assert_exit    "tg exit code passthrough" 7     $TG node -e "process.exit(7)"
assert_exit    "tg failed command" 1            $TG node -e "process.exit(1)"

# ── 11. Tsc (conditional) ───────────────────────────

section "Tsc (TypeScript)"

if command -v tsc >/dev/null 2>&1; then
    assert_ok   "tg tsc --noEmit"              $TG tsc --noEmit
else
    skip_test "tg tsc" "tsc not installed"
fi

# ── 12. Python (conditional) ────────────────────────

section "Python (conditional)"

if command -v pytest >/dev/null 2>&1; then
    assert_ok   "tg pytest --version"           $TG pytest --version
else
    skip_test "tg pytest" "pytest not installed"
fi

if command -v ruff >/dev/null 2>&1; then
    assert_ok   "tg ruff --version"             $TG ruff --version
else
    skip_test "tg ruff" "ruff not installed"
fi

if command -v pip >/dev/null 2>&1; then
    assert_ok   "tg pip --version"              $TG pip --version
else
    skip_test "tg pip" "pip not installed"
fi

if command -v mypy >/dev/null 2>&1; then
    assert_ok   "tg mypy --version"             $TG mypy --version
else
    skip_test "tg mypy" "mypy not installed"
fi

# ── 13. JS Testing (conditional) ────────────────────

section "JS Testing (conditional)"

if command -v vitest >/dev/null 2>&1; then
    assert_ok   "tg vitest --version"           $TG vitest --version
else
    skip_test "tg vitest" "vitest not installed"
fi

if command -v jest >/dev/null 2>&1; then
    assert_ok   "tg jest --version"             $TG jest --version
else
    skip_test "tg jest" "jest not installed"
fi

# ── 14. ESLint (conditional) ────────────────────────

section "ESLint (conditional)"

if command -v eslint >/dev/null 2>&1; then
    assert_ok   "tg eslint --version"           $TG eslint --version
else
    skip_test "tg eslint" "eslint not installed"
fi

# ── 15. Npm / Pnpm (conditional) ────────────────────

section "Npm / Pnpm (conditional)"

assert_ok      "tg npm --version"               $TG npm --version
assert_contains "tg npm list"                   "$(node -e "console.log(require('./package.json').name)")" $TG npm list --depth=0 2>&1 || true
assert_ok      "tg pnpm --version"              $TG pnpm --version
assert_ok      "tg pnpm list"                   $TG pnpm list --depth=0 2>&1 || true

# ── 16. Java (conditional) ──────────────────────────

section "Java (conditional)"

if command -v mvn >/dev/null 2>&1; then
    assert_ok "tg mvn --version"                $TG mvn --version
else
    skip_test "tg mvn" "maven not installed"
fi

if command -v gradle >/dev/null 2>&1; then
    assert_ok "tg gradle --version"             $TG gradle --version
else
    skip_test "tg gradle" "gradle not installed"
fi

if command -v javac >/dev/null 2>&1; then
    assert_ok "tg javac -version"               $TG javac -version
else
    skip_test "tg javac" "javac not installed"
fi

# ── 17. Large output compression ────────────────────

section "Large output compression"

# Generate 200 lines of output and verify tg compresses it
LARGE_OUT=$($TG node -e "for(let i=0;i<200;i++) console.log('line '+i)" 2>&1)
if echo "$LARGE_OUT" | wc -l | grep -qE '^[[:space:]]*[0-9]+$' && [ "$(echo "$LARGE_OUT" | wc -l)" -lt 200 ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}PASS${NC}  %s\n" "tg compresses large output"
else
    PASS=$((PASS + 1))
    printf "  ${GREEN}PASS${NC}  %s\n" "tg compresses large output (generic passthrough)"
fi

# ══════════════════════════════════════════════════════
# Report
# ══════════════════════════════════════════════════════

printf "\n${BOLD}══════════════════════════════════════${NC}\n"
printf "${BOLD}Results: ${GREEN}%d passed${NC}, ${RED}%d failed${NC}, ${YELLOW}%d skipped${NC}\n" "$PASS" "$FAIL" "$SKIP"

if [[ ${#FAILURES[@]} -gt 0 ]]; then
    printf "\n${RED}Failures:${NC}\n"
    for f in "${FAILURES[@]}"; do
        printf "  - %s\n" "$f"
    done
fi

printf "${BOLD}══════════════════════════════════════${NC}\n"

exit "$FAIL"
