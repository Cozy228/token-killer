#!/usr/bin/env bash
#
# Remote tk operations on CozyUltra Windows via ~/.ssh/config host `cozyultra`.
#
# Usage:
#   bash scripts/ssh-windows.sh              # interactive shell
#   bash scripts/ssh-windows.sh build        # pnpm install + build
#   bash scripts/ssh-windows.sh smoke        # quick tk smoke
#   bash scripts/ssh-windows.sh dogfood      # full windows-dogfood.ps1
#   bash scripts/ssh-windows.sh dogfood-preview
#   bash scripts/ssh-windows.sh setup-rg     # winget install ripgrep
#   bash scripts/ssh-windows.sh clone-atlas  # gh repo clone atlas
#
set -euo pipefail

SSH_HOST="${TK_SSH_HOST:-cozyultra}"
TK_ROOT='C:\Users\cozy2\workspace\token-killer'
ATLAS='C:\Users\cozy2\workspace\atlas'
PWSH='C:\Program Files\PowerShell\7\pwsh.exe'

remote() {
  ssh "$SSH_HOST" "\"$PWSH\" -NoProfile -Command \"$*\""
}

cmd="${1:-shell}"
shift || true

case "$cmd" in
  shell | "")
    exec ssh "$SSH_HOST"
    ;;
  build)
    remote "Set-Location '$TK_ROOT'; pnpm install; pnpm build; node dist/cli.js --version"
    ;;
  smoke)
    remote "Set-Location '$TK_ROOT'; node dist/cli.js hook check git status; node dist/cli.js --stats git status 2>&1 | Select-Object -Last 6"
    ;;
  setup-rg)
    remote "winget install BurntSushi.ripgrep.MSVC --accept-package-agreements --accept-source-agreements; rg --version"
    ;;
  clone-atlas)
    remote "if (-not (Test-Path '$ATLAS')) { gh repo clone Cozy228/atlas '$ATLAS' } else { Write-Host 'atlas already exists: $ATLAS' }"
    ;;
  dogfood-preview)
    remote "\$env:TK_DOGFOOD_CWD='$ATLAS'; Set-Location '$TK_ROOT'; pnpm exec pwsh -NoProfile -File scripts/windows-dogfood.ps1 -PreviewInit"
    ;;
  dogfood)
    remote "\$env:TK_DOGFOOD_CWD='$ATLAS'; Set-Location '$TK_ROOT'; pnpm test:windows-dogfood"
    ;;
  status)
    remote "Write-Host '=== ssh target ==='; hostname; whoami; Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -notlike '127.*' | Select-Object InterfaceAlias, IPAddress; Write-Host '=== tk ==='; Set-Location '$TK_ROOT'; git branch --show-current; Test-Path dist/cli.js; Write-Host '=== atlas ==='; Test-Path '$ATLAS'; Write-Host '=== rg ==='; Get-Command rg -ErrorAction SilentlyContinue | Select-Object Source"
    ;;
  *)
    echo "Unknown command: $cmd"
    echo "Usage: bash scripts/ssh-windows.sh [shell|build|smoke|setup-rg|clone-atlas|dogfood-preview|dogfood|status]"
    exit 1
    ;;
esac
