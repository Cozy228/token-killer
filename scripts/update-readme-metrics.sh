#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTEXA_HOME="${CONTEXA_HOME:-$HOME/.contexa}"
HISTORY="${CTX_HISTORY_FILE:-$(node -e "
  const { createHash } = require('node:crypto');
  const { realpathSync } = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const cwd = process.argv[1];
  const home = process.env.CONTEXA_HOME || path.join(os.homedir(), '.contexa');
  let root = cwd;
  try { root = realpathSync(cwd); } catch { root = path.resolve(cwd); }
  const fp = 'repo:' + createHash('sha256').update(root).digest('hex').slice(0, 12);
  process.stdout.write(path.join(home, 'projects', fp, 'history.jsonl'));
" "$REPO_ROOT")}"
README="README.md"
MARKER_S="<!-- BENCHMARK_TABLE_START -->"
MARKER_E="<!-- BENCHMARK_TABLE_END -->"

# Step 1: Check history file
if [[ ! -f "$HISTORY" ]] || [[ ! -s "$HISTORY" ]]; then
  echo "No history data found. Run some ctx commands first, then re-run this script."
  exit 0
fi

[[ -f "$README" ]] || { echo "Error: $README not found"; exit 1; }

# Number formatting helper (portable awk-based comma insertion)
fmt() { awk -v n="$1" 'BEGIN {
  s = sprintf("%d", n); l = length(s);
  for (i = l - 2; i > 1; i -= 3) s = substr(s, 1, i-1) "," substr(s, i);
  print s
}'; }

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

# Step 2-3: Parse JSONL, compute per-handler aggregates
# Output: handler|commands|raw_tokens|output_tokens|saved_tokens
if command -v jq &>/dev/null; then
  jq -rs '
    group_by(.handler) | map({
      handler:  .[0].handler,
      commands: length,
      raw_tokens:    map(.raw_tokens)    | add,
      output_tokens: map(.output_tokens) | add,
      saved_tokens:  map(.saved_tokens)  | add
    }) | sort_by(-.saved_tokens) | .[]
    | "\(.handler)|\(.commands)|\(.raw_tokens)|\(.output_tokens)|\(.saved_tokens)"
  ' "$HISTORY" > "$TMPFILE"
else
  # Fallback: parse flat JSONL with awk (split on double-quotes)
  awk -F'"' '{
    for (i = 1; i <= NF; i++) {
      if ($i == "handler")       h = $(i+2);
      if ($i == "raw_tokens")    r = $(i+2);
      if ($i == "output_tokens") o = $(i+2);
      if ($i == "saved_tokens")  s = $(i+2);
    }
    printf "%s|1|%d|%d|%d\n", h, r, o, s;
  }' "$HISTORY" | awk -F'|' '
    { h[$1]++; r[$1] += $3; o[$1] += $4; s[$1] += $5 }
    END { for (k in h) printf "%s|%d|%d|%d|%d\n", k, h[k], r[k], o[k], s[k] }
  ' | sort -t'|' -k5,5nr > "$TMPFILE"
fi

# Step 4: Build markdown table rows from aggregated data
TOTAL_CMDS=0; TOTAL_RAW=0; TOTAL_OUT=0; TOTAL_SAVED=0
ROWS=""

while IFS='|' read -r handler cmds raw out saved; do
  TOTAL_CMDS=$((TOTAL_CMDS + cmds))
  TOTAL_RAW=$((TOTAL_RAW + raw))
  TOTAL_OUT=$((TOTAL_OUT + out))
  TOTAL_SAVED=$((TOTAL_SAVED + saved))

  pct=$(awk -v s="$saved" -v r="$raw" \
    'BEGIN { if (r > 0) printf "%.1f%%", (s / r) * 100; else print "0.0%" }')
  printf -v row "| %s | %s | %s | %s | %s |\n" \
    "$handler" "$(fmt "$raw")" "$(fmt "$out")" "$(fmt "$saved")" "$pct"
  ROWS+="$row"
done < "$TMPFILE"

HANDLER_COUNT=$(wc -l < "$TMPFILE" | tr -d ' ')

# Total row
TPCT=$(awk -v s="$TOTAL_SAVED" -v r="$TOTAL_RAW" \
  'BEGIN { if (r > 0) printf "%.1f%%", (s / r) * 100; else print "0.0%" }')
TOTAL_ROW=$(printf "| **TOTAL** | **%s** | **%s** | **%s** | **%s** |" \
  "$(fmt "$TOTAL_RAW")" "$(fmt "$TOTAL_OUT")" "$(fmt "$TOTAL_SAVED")" "$TPCT")

# Assemble full table block
TABLE="$MARKER_S
| Command | Raw Tokens | Output Tokens | Saved | Savings % |
|---------|-----------|---------------|-------|-----------|
${ROWS}${TOTAL_ROW}
${MARKER_E}"

# Step 5-6: Update README
if grep -qF "$MARKER_S" "$README" && grep -qF "$MARKER_E" "$README"; then
  awk -v start="$MARKER_S" -v end="$MARKER_E" -v table="$TABLE" '
    BEGIN { in_block = 0 }
    $0 == start { print table; in_block = 1; next }
    in_block && $0 == end { in_block = 0; next }
    !in_block
  ' "$README" > "${README}.tmp" && mv "${README}.tmp" "$README"
  echo "Replaced existing benchmark table in $README"
else
  printf '\n%s\n' "$TABLE" >> "$README"
  echo "Appended benchmark table to $README"
fi

# Print summary
echo "Benchmark metrics updated:"
echo "  Total commands:   ${TOTAL_CMDS}"
echo "  Raw tokens:       $(fmt "$TOTAL_RAW")"
echo "  Output tokens:    $(fmt "$TOTAL_OUT")"
echo "  Saved tokens:     $(fmt "$TOTAL_SAVED") (${TPCT})"
echo "  Unique handlers:  ${HANDLER_COUNT}"
