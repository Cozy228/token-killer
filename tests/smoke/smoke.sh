#!/usr/bin/env bash
#
# tk Smoke Test Suite
# Ported from RTK scripts/test-all.sh — exercises every tk command.
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

# Like assert_contains but ignores the command's exit code — for tools that
# legitimately exit non-zero on a successful run (e.g. `diff` exits 1 when the
# files differ, mirroring real diff/git diff --exit-code).
assert_contains_anyexit() {
    local name="$1"
    local needle="$2"
    shift 2
    local output
    output=$("$@" 2>&1) || true
    if echo "$output" | grep -q -- "$needle"; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}PASS${NC}  %s\n" "$name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        printf "  ${RED}FAIL${NC}  %s\n" "$name"
        printf "        expected: '%s'\n" "$needle"
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

# Run a command ONCE and assert several conditions on its exit code + combined
# stdout/stderr. Replaces the old pattern of invoking the same command via
# assert_ok plus one-or-more assert_contains, which spawned the tool 2–4× per
# logical check. Conditions precede `--`; the command follows.
#
#   assert_run "tk git status" ok has:"* " has:"package.json" -- $TK git status
#
# Specs (any order, before `--`):
#   ok        exit code must be 0
#   exit:N    exit code must equal N
#   (none)    exit code not checked (any) — for tools that legitimately exit non-zero
#   has:STR   combined output must contain STR (grep regex, same as assert_contains)
#   no:STR    combined output must NOT contain STR
# All conditions must hold for a single PASS; a failure lists each unmet condition.
assert_run() {
    local name="$1"
    shift
    local want_exit="any"
    local -a has=()
    local -a no=()
    while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
        case "$1" in
            ok) want_exit=0 ;;
            exit:*) want_exit="${1#exit:}" ;;
            has:*) has+=("${1#has:}") ;;
            no:*) no+=("${1#no:}") ;;
            *)
                printf "assert_run: unknown spec '%s'\n" "$1" >&2
                exit 2
                ;;
        esac
        shift
    done
    [ "${1:-}" = "--" ] && shift

    local output actual=0
    output=$("$@" 2>&1) || actual=$?

    local -a fails=()
    if [ "$want_exit" != "any" ] && [ "$actual" -ne "$want_exit" ]; then
        fails+=("exit $actual (wanted $want_exit)")
    fi
    local needle
    for needle in ${has[@]+"${has[@]}"}; do
        echo "$output" | grep -q -- "$needle" || fails+=("missing: '$needle'")
    done
    for needle in ${no[@]+"${no[@]}"}; do
        echo "$output" | grep -q -- "$needle" && fails+=("unexpected: '$needle'")
    done

    if [ "${#fails[@]}" -eq 0 ]; then
        PASS=$((PASS + 1))
        printf "  ${GREEN}PASS${NC}  %s\n" "$name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$name")
        printf "  ${RED}FAIL${NC}  %s\n" "$name"
        printf "        cmd: %s\n" "$*"
        local f
        for f in "${fails[@]}"; do printf "        %s\n" "$f"; done
        printf "        out: %s\n" "$(echo "$output" | head -3)"
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

# Cross-invocation session dedup ships default-on and, on the 2nd+ run of an
# identical normalized command, returns a recovery marker instead of the real
# output. The smoke suite deliberately re-exercises some commands across sections
# (e.g. `ls .` under Ls, Global flags, and Gain), so dedup would mask their output
# and break the assertions. Own the opt-out here rather than relying on the CI job
# to set it, so `bash tests/smoke/smoke.sh` is self-contained everywhere.
export TK_SESSION_DEDUP=0

TK=""

find_tk() {
    if [ -f "./dist/cli.js" ]; then
        TK="node ./dist/cli.js"
    elif command -v tk >/dev/null 2>&1; then
        TK="tk"
    else
        echo "tk binary not found. Run: pnpm run build"
        exit 1
    fi
}

find_tk

printf "${BOLD}tk Smoke Test Suite${NC}\n"
printf "Binary: %s\n" "$TK"
printf "Version: %s\n" "$($TK --version 2>&1)"
printf "Date: %s\n" "$(date '+%Y-%m-%d %H:%M')"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Must run from inside a git repository."
    exit 1
fi

# ── 1. Version & Help ───────────────────────────────

section "Version & Help"

assert_contains "tk --version" "0." $TK --version
assert_contains "tk --help" "Usage:" $TK --help

# ── 2. Ls ────────────────────────────────────────────

section "Ls"

# H17: node_modules is not listed as a normal entry but DISCLOSED in a counted
# "hidden" line (never silently dropped), so it appears under that disclosure.
assert_run "tk ls ." ok has:"package.json" has:"hidden" -- $TK ls .
assert_run "tk ls src/" ok -- $TK ls src/

# ── 3. Read / Cat ────────────────────────────────────

section "Read / Cat"

assert_run "tk cat package.json" ok has:"token-killer" -- $TK cat package.json
assert_run "tk cat README.md" ok has:"tk" -- $TK cat README.md
assert_run "tk read aggressive" ok has:"Symbols:" -- $TK read --level aggressive tests/integration/cli.test.ts

# ── 4. Git ───────────────────────────────────────────

section "Git"

assert_run "tk git status" ok has:"* " -- $TK git status
assert_ok      "tk git log"                     $TK git log
assert_ok      "tk git log -5"                  $TK git log -- -5
assert_ok      "tk git diff"                    $TK git diff
assert_run "tk git branch" ok has:"*" -- $TK git branch

# ── 5. Diff ──────────────────────────────────────────

section "Diff"

DIFF_DIR="$(mktemp -d)"
printf "export const value = 1;\n" > "$DIFF_DIR/old.ts"
printf "export const value = 1;\nexport const extra = 2;\n" > "$DIFF_DIR/new.ts"
# `tk diff` exits 1 when the files differ (mirrors real diff), so these tolerate a
# non-zero exit and assert on the compressed output.
assert_contains_anyexit "tk diff files"         "->" $TK diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
assert_contains_anyexit "tk diff summary"       "+1 -0" $TK diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
assert_contains_anyexit "tk diff added line"    "export const extra = 2;" $TK diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
rm -rf "$DIFF_DIR"

# ── 6. Grep / Search ─────────────────────────────────

section "Grep / Search"

assert_ok      "tk rg 'export' src/"            $TK rg "export" src/
assert_ok      "tk grep -r 'export' src/"       $TK grep -r "export" src/
assert_contains "tk rg shows matches"           "src/" $TK rg "import" src/
assert_ok      "tk rg with path"                $TK rg "handler" src/handlers/

# ── 7. Find ──────────────────────────────────────────

section "Find"

# listLike compacts a larger listing into the "NF MD:" header + per-directory
# grouping ("core/ …", "handlers/ …"). Assert that directory-grouping header
# (the "shows directories" signal) rather than a literal "src/" prefix, which only
# survives in the small-input raw-passthrough mode.
#
# `find` on Windows is System32 find.exe (a text-search tool), not GNU find — `-name`
# isn't valid there and tk's GNU-find compression isn't exercisable, so skip rather
# than assert POSIX output. (smoke runs under git-bash, so uname reports MINGW/MSYS.)
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*)
    skip_test "tk find src -name '*.ts'" "find is find.exe on Windows"
    ;;
  *)
    assert_run "tk find src -name '*.ts'" ok has:"D:" -- $TK find src -name "*.ts"
    ;;
esac

# ── 8. Generic passthrough ──────────────────────────

section "Generic passthrough (shim-invoked)"

# Post-U2 hardening: a DIRECT `tk <unknown>` errors and spawns nothing. Generic
# passthrough runs only when the shell resolved a real tool through the shim
# (TK_SHIM_DIR set), so these exercise it as shim-invoked.
export TK_SHIM_DIR="${TMPDIR:-/tmp}/tk-smoke-fake-shim"
assert_run "tk echo hello" ok has:"hello" -- $TK echo hello
assert_run "tk node -e console.log" ok has:"rtk-style" -- $TK node -e "console.log('rtk-style')"
unset TK_SHIM_DIR

# Direct (no shim): an unknown command must error, never auto-spawn a PATH binary.
assert_fails   "tk <unknown> errors (U2)"       $TK definitely-not-a-real-tool-xyz

# ── 9. Global flags ─────────────────────────────────

section "Global flags"

assert_contains "tk --stats shows savings"      "## Token Savings" $TK --stats ls .
assert_run "tk --raw ls" ok has:"package.json" -- $TK --raw ls .
assert_ok      "tk --max-lines 5 ls"            $TK --max-lines 5 ls .
assert_ok      "tk --max-chars 500 ls"          $TK --max-chars 500 ls .
assert_ok      "tk --save-raw ls"               $TK --save-raw ls .
assert_ok      "tk --no-save-raw ls"            $TK --no-save-raw ls .

# ── 10. Gain (savings report) ────────────────────────

section "Gain"

assert_run "tk gain --text" ok has:"Token savings" -- $TK gain --text
assert_run "tk gain --json" ok has:'"commands"' -- $TK gain --json
assert_run "tk gain --csv" ok has:"commands,raw_tokens" -- $TK gain --csv
assert_contains "tk gain default → HTML"        "Generated HTML report" env TK_NO_OPEN=1 $TK gain

# ── 11. Error handling ──────────────────────────────

section "Error handling"

# Bare `tk` prints the command list (like --help) and exits 0 by design.
assert_contains "tk (no command) prints help"   "Commands:" $TK
# Exit-code passthrough is a shim-invoked concern (a direct `tk node` errors, U2).
export TK_SHIM_DIR="${TMPDIR:-/tmp}/tk-smoke-fake-shim"
assert_exit    "tk exit code passthrough" 7     $TK node -e "process.exit(7)"
assert_exit    "tk failed command" 1            $TK node -e "process.exit(1)"
unset TK_SHIM_DIR

# ── 12. Tsc (conditional) ───────────────────────────

section "Tsc (TypeScript)"

if command -v tsc >/dev/null 2>&1; then
    assert_ok   "tk tsc --noEmit"              $TK tsc --noEmit
else
    skip_test "tk tsc" "tsc not installed"
fi

# ── 13. Python (conditional) ────────────────────────

section "Python (conditional)"

if command -v pytest >/dev/null 2>&1; then
    assert_ok   "tk pytest --version"           $TK pytest --version
else
    skip_test "tk pytest" "pytest not installed"
fi

if command -v ruff >/dev/null 2>&1; then
    assert_ok   "tk ruff --version"             $TK ruff --version
else
    skip_test "tk ruff" "ruff not installed"
fi

if command -v pip >/dev/null 2>&1; then
    assert_ok   "tk pip --version"              $TK pip --version
else
    skip_test "tk pip" "pip not installed"
fi

if command -v mypy >/dev/null 2>&1; then
    assert_ok   "tk mypy --version"             $TK mypy --version
else
    skip_test "tk mypy" "mypy not installed"
fi

# ── 14. JS Testing (conditional) ────────────────────

section "JS Testing (conditional)"

if command -v vitest >/dev/null 2>&1; then
    assert_ok   "tk vitest --version"           $TK vitest --version
else
    skip_test "tk vitest" "vitest not installed"
fi

if command -v jest >/dev/null 2>&1; then
    assert_ok   "tk jest --version"             $TK jest --version
else
    skip_test "tk jest" "jest not installed"
fi

# ── 15. ESLint (conditional) ────────────────────────

section "ESLint (conditional)"

if command -v eslint >/dev/null 2>&1; then
    assert_ok   "tk eslint --version"           $TK eslint --version
else
    skip_test "tk eslint" "eslint not installed"
fi

# ── 16. Npm / Pnpm (conditional) ────────────────────

section "Npm / Pnpm (conditional)"

assert_ok      "tk npm --version"               $TK npm --version
assert_contains "tk npm list"                   "packages" $TK npm list --depth=0 2>&1 || true
assert_ok      "tk pnpm --version"              $TK pnpm --version
assert_ok      "tk pnpm list"                   $TK pnpm list --depth=0 2>&1 || true

# ── 17. Java (conditional) ──────────────────────────

section "Java (conditional)"

if command -v mvn >/dev/null 2>&1; then
    assert_ok "tk mvn --version"                $TK mvn --version
else
    skip_test "tk mvn" "maven not installed"
fi

if command -v gradle >/dev/null 2>&1; then
    assert_ok "tk gradle --version"             $TK gradle --version
else
    skip_test "tk gradle" "gradle not installed"
fi

if command -v javac >/dev/null 2>&1; then
    assert_ok "tk javac -version"               $TK javac -version
else
    skip_test "tk javac" "javac not installed"
fi

# ── 18. Large output compression ────────────────────

section "Large output passthrough"

# Shim-invoked passthrough (a direct `tk node` errors post-U2).
export TK_SHIM_DIR="${TMPDIR:-/tmp}/tk-smoke-fake-shim"
LARGE_OUT=$($TK node -e "for(let i=0;i<200;i++) console.log('line '+i)" 2>&1)
unset TK_SHIM_DIR
LARGE_OUT_LINES="$(printf "%s\n" "$LARGE_OUT" | wc -l | tr -d ' ')"
if [ "$LARGE_OUT_LINES" -eq 200 ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}PASS${NC}  %s\n" "tk passes through large generic output"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("tk passes through large generic output")
    printf "  ${RED}FAIL${NC}  %s (expected 200 lines, got %s)\n" "tk passes through large generic output" "$LARGE_OUT_LINES"
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
