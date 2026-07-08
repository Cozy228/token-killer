#!/usr/bin/env bash
#
# ctx Smoke Test Suite
# Ported from RTK scripts/test-all.sh — exercises every ctx command.
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
#   assert_run "ctx git status" ok has:"* " has:"package.json" -- $CTX git status
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
export CTX_SESSION_DEDUP=0

CTX=""

find_tk() {
    if [ -f "./dist/cli.js" ]; then
        CTX="node ./dist/cli.js"
    elif command -v ctx >/dev/null 2>&1; then
        CTX="ctx"
    else
        echo "ctx binary not found. Run: pnpm run build"
        exit 1
    fi
}

find_tk

printf "${BOLD}ctx Smoke Test Suite${NC}\n"
printf "Binary: %s\n" "$CTX"
printf "Version: %s\n" "$($CTX --version 2>&1)"
printf "Date: %s\n" "$(date '+%Y-%m-%d %H:%M')"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Must run from inside a git repository."
    exit 1
fi

# ── 1. Version & Help ───────────────────────────────

section "Version & Help"

assert_contains "ctx --version" "0." $CTX --version
assert_contains "ctx --help" "Usage:" $CTX --help

# ── 2. Ls ────────────────────────────────────────────

section "Ls"

# H17: node_modules is not listed as a normal entry but DISCLOSED in a counted
# "hidden" line (never silently dropped), so it appears under that disclosure.
assert_run "ctx ls ." ok has:"package.json" has:"hidden" -- $CTX ls .
assert_run "ctx ls src/" ok -- $CTX ls src/

# ── 3. Read / Cat ────────────────────────────────────

section "Read / Cat"

assert_run "ctx cat package.json" ok has:"contexa" -- $CTX cat package.json
assert_run "ctx cat README.md" ok has:"ctx" -- $CTX cat README.md
assert_run "ctx read aggressive" ok has:"Symbols:" -- $CTX read --level aggressive tests/integration/cli.test.ts

# ── 4. Git ───────────────────────────────────────────

section "Git"

assert_run "ctx git status" ok has:"* " -- $CTX git status
assert_ok      "ctx git log"                     $CTX git log
assert_ok      "ctx git log -5"                  $CTX git log -- -5
assert_ok      "ctx git diff"                    $CTX git diff
assert_run "ctx git branch" ok has:"*" -- $CTX git branch

# ── 5. Diff ──────────────────────────────────────────

section "Diff"

DIFF_DIR="$(mktemp -d)"
printf "export const value = 1;\n" > "$DIFF_DIR/old.ts"
printf "export const value = 1;\nexport const extra = 2;\n" > "$DIFF_DIR/new.ts"
# `ctx diff` exits 1 when the files differ (mirrors real diff), so these tolerate a
# non-zero exit and assert on the compressed output.
assert_contains_anyexit "ctx diff files"         "->" $CTX diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
assert_contains_anyexit "ctx diff summary"       "+1 -0" $CTX diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
assert_contains_anyexit "ctx diff added line"    "export const extra = 2;" $CTX diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
rm -rf "$DIFF_DIR"

# ── 6. Grep / Search ─────────────────────────────────

section "Grep / Search"

assert_ok      "ctx rg 'export' src/"            $CTX rg "export" src/
assert_ok      "ctx grep -r 'export' src/"       $CTX grep -r "export" src/
assert_contains "ctx rg shows matches"           "src/" $CTX rg "import" src/
assert_ok      "ctx rg with path"                $CTX rg "handler" src/handlers/

# ── 7. Find ──────────────────────────────────────────

section "Find"

# listLike compacts a larger listing into the "NF MD:" header + per-directory
# grouping ("core/ …", "handlers/ …"). Assert that directory-grouping header
# (the "shows directories" signal) rather than a literal "src/" prefix, which only
# survives in the small-input raw-passthrough mode.
#
# `find` on Windows is System32 find.exe (a text-search tool), not GNU find — `-name`
# isn't valid there and ctx's GNU-find compression isn't exercisable, so skip rather
# than assert POSIX output. (smoke runs under git-bash, so uname reports MINGW/MSYS.)
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*)
    skip_test "ctx find src -name '*.ts'" "find is find.exe on Windows"
    ;;
  *)
    assert_run "ctx find src -name '*.ts'" ok has:"D:" -- $CTX find src -name "*.ts"
    ;;
esac

# ── 8. Generic passthrough ──────────────────────────

section "Generic passthrough (shim-invoked)"

# Post-U2 hardening: a DIRECT `ctx <unknown>` errors and spawns nothing. Generic
# passthrough runs only when the shell resolved a real tool through the shim
# (CTX_SHIM_DIR set), so these exercise it as shim-invoked.
export CTX_SHIM_DIR="${TMPDIR:-/tmp}/ctx-smoke-fake-shim"
assert_run "ctx echo hello" ok has:"hello" -- $CTX echo hello
assert_run "ctx node -e console.log" ok has:"rtk-style" -- $CTX node -e "console.log('rtk-style')"
unset CTX_SHIM_DIR

# Direct (no shim): an unknown command must error, never auto-spawn a PATH binary.
assert_fails   "ctx <unknown> errors (U2)"       $CTX definitely-not-a-real-tool-xyz

# ── 9. Global flags ─────────────────────────────────

section "Global flags"

assert_contains "ctx --stats shows savings"      "## Token Savings" $CTX --stats ls .
assert_run "ctx --raw ls" ok has:"package.json" -- $CTX --raw ls .
assert_ok      "ctx --max-lines 5 ls"            $CTX --max-lines 5 ls .
assert_ok      "ctx --max-chars 500 ls"          $CTX --max-chars 500 ls .
assert_ok      "ctx --save-raw ls"               $CTX --save-raw ls .
assert_ok      "ctx --no-save-raw ls"            $CTX --no-save-raw ls .

# ── 10. Gain (savings report) ────────────────────────

section "Gain"

assert_run "ctx gain --text" ok has:"Token Savings" -- $CTX gain --text
assert_run "ctx gain --json" ok has:'"commands"' -- $CTX gain --json
assert_run "ctx gain --csv" ok has:"commands,input_tokens,output_tokens,saved_tokens,savings_pct" -- $CTX gain --csv
assert_contains "ctx gain default → HTML"        "Generated HTML report" env CTX_NO_OPEN=1 $CTX gain

# ── 11. Error handling ──────────────────────────────

section "Error handling"

# Bare `ctx` prints the command list (like --help) and exits 0 by design.
assert_contains "ctx (no command) prints help"   "Commands:" $CTX
# Exit-code passthrough is a shim-invoked concern (a direct `ctx node` errors, U2).
export CTX_SHIM_DIR="${TMPDIR:-/tmp}/ctx-smoke-fake-shim"
assert_exit    "ctx exit code passthrough" 7     $CTX node -e "process.exit(7)"
assert_exit    "ctx failed command" 1            $CTX node -e "process.exit(1)"
unset CTX_SHIM_DIR

# ── 12. Tsc (conditional) ───────────────────────────

section "Tsc (TypeScript)"

if command -v tsc >/dev/null 2>&1; then
    assert_ok   "ctx tsc --noEmit"              $CTX tsc --noEmit
else
    skip_test "ctx tsc" "tsc not installed"
fi

# ── 13. Python (conditional) ────────────────────────

section "Python (conditional)"

if command -v pytest >/dev/null 2>&1; then
    assert_ok   "ctx pytest --version"           $CTX pytest --version
else
    skip_test "ctx pytest" "pytest not installed"
fi

if command -v ruff >/dev/null 2>&1; then
    assert_ok   "ctx ruff --version"             $CTX ruff --version
else
    skip_test "ctx ruff" "ruff not installed"
fi

if command -v pip >/dev/null 2>&1; then
    assert_ok   "ctx pip --version"              $CTX pip --version
else
    skip_test "ctx pip" "pip not installed"
fi

if command -v mypy >/dev/null 2>&1; then
    assert_ok   "ctx mypy --version"             $CTX mypy --version
else
    skip_test "ctx mypy" "mypy not installed"
fi

# ── 14. JS Testing (conditional) ────────────────────

section "JS Testing (conditional)"

if command -v vitest >/dev/null 2>&1; then
    assert_ok   "ctx vitest --version"           $CTX vitest --version
else
    skip_test "ctx vitest" "vitest not installed"
fi

if command -v jest >/dev/null 2>&1; then
    assert_ok   "ctx jest --version"             $CTX jest --version
else
    skip_test "ctx jest" "jest not installed"
fi

# ── 15. ESLint (conditional) ────────────────────────

section "ESLint (conditional)"

if command -v eslint >/dev/null 2>&1; then
    assert_ok   "ctx eslint --version"           $CTX eslint --version
else
    skip_test "ctx eslint" "eslint not installed"
fi

# ── 16. Npm / Pnpm (conditional) ────────────────────

section "Npm / Pnpm (conditional)"

assert_ok      "ctx npm --version"               $CTX npm --version
assert_contains "ctx npm list"                   "packages" $CTX npm list --depth=0 2>&1 || true
assert_ok      "ctx pnpm --version"              $CTX pnpm --version
assert_ok      "ctx pnpm list"                   $CTX pnpm list --depth=0 2>&1 || true

# ── 17. Java (conditional) ──────────────────────────

section "Java (conditional)"

if command -v mvn >/dev/null 2>&1; then
    assert_ok "ctx mvn --version"                $CTX mvn --version
else
    skip_test "ctx mvn" "maven not installed"
fi

if command -v gradle >/dev/null 2>&1; then
    assert_ok "ctx gradle --version"             $CTX gradle --version
else
    skip_test "ctx gradle" "gradle not installed"
fi

if command -v javac >/dev/null 2>&1; then
    assert_ok "ctx javac -version"               $CTX javac -version
else
    skip_test "ctx javac" "javac not installed"
fi

# ── 18. Large output compression ────────────────────

section "Large output passthrough"

# Shim-invoked passthrough (a direct `ctx node` errors post-U2).
export CTX_SHIM_DIR="${TMPDIR:-/tmp}/ctx-smoke-fake-shim"
LARGE_OUT=$($CTX node -e "for(let i=0;i<200;i++) console.log('line '+i)" 2>&1)
unset CTX_SHIM_DIR
LARGE_OUT_LINES="$(printf "%s\n" "$LARGE_OUT" | wc -l | tr -d ' ')"
if [ "$LARGE_OUT_LINES" -eq 200 ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}PASS${NC}  %s\n" "ctx passes through large generic output"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("ctx passes through large generic output")
    printf "  ${RED}FAIL${NC}  %s (expected 200 lines, got %s)\n" "ctx passes through large generic output" "$LARGE_OUT_LINES"
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
