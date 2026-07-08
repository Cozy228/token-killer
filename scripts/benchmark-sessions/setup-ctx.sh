#!/usr/bin/env bash
# Install and enable ctx (contexa) on a benchmark "ON" VM.
#
# Ported alongside scripts/benchmark-sessions/lib/runner.py (which pushes this
# script to ON VMs and runs it). Adapted to ctx conventions: builds the ctx Node
# CLI from the deployed codebase and installs the Claude Code command-rewrite
# hook so every command Claude runs is routed through ctx.
set -euo pipefail

CODEBASE_DIR="${CODEBASE_DIR:-/home/ubuntu/codebase}"

echo "[setup-ctx] Installing pnpm (if missing)..."
if ! command -v pnpm >/dev/null 2>&1; then
  curl -fsSL https://get.pnpm.io/install.sh | sh -
  export PATH="$HOME/.local/share/pnpm:$PATH"
fi

echo "[setup-ctx] Building ctx from $CODEBASE_DIR..."
cd "$CODEBASE_DIR"
pnpm install --frozen-lockfile
pnpm build

echo "[setup-ctx] Linking ctx globally..."
pnpm link --global

echo "[setup-ctx] Installing Claude Code command-rewrite hook..."
# Route every Bash command Claude issues through `ctx` so its output is filtered.
HOOK_DIR="$HOME/.claude"
mkdir -p "$HOOK_DIR"
cat > "$HOOK_DIR/settings.json" <<'JSON'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "ctx rewrite" }
        ]
      }
    ]
  }
}
JSON

echo "[setup-ctx] ctx ready: $(ctx --version)"
