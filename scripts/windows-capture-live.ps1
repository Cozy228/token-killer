# Live capture of REAL Copilot CLI hook payloads — DESIGN §12 step 4, goal 3.
#
# Temporarily swaps the installed hook command for a byte-exact tee-wrapper, drives a
# real `copilot -p` non-interactive session that triggers a shell tool call, captures
# the EXACT stdin the host sends (preserving any BOM/encoding), then restores the
# original hook config. The captured files let us confirm the real 1.0.62 schema
# (toolArgs string-vs-object, leading BOM, required fields) against the synthetic
# acceptance in windows-accept.ps1.
#
# PREREQ: copilot must be authenticated (`copilot` → /login, or set GITHUB_TOKEN) AND
# able to reach the model API from this shell (if the box uses a proxy, export it:
#   $env:HTTPS_PROXY='http://127.0.0.1:7890'; $env:HTTP_PROXY=$env:HTTPS_PROXY ).
#
# Usage (on the box):
#   cd C:\Users\cozy2\workspace\contexa
#   pwsh -NoProfile -File scripts\windows-capture-live.ps1
#   pwsh -NoProfile -File scripts\windows-capture-live.ps1 -Prompt "Run: git log --oneline -3"

param(
  [string]$Prompt = "Run this exact shell command and show me its output, nothing else: git status"
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo    = Split-Path -Parent $PSScriptRoot
$cli     = Join-Path $repo 'dist\cli.js'
$cfgPath = Join-Path $env:USERPROFILE '.copilot\hooks\ctx-rewrite.json'
$capDir  = Join-Path $repo 'reports\windows-live-captures'
$teeCmd  = Join-Path $capDir 'tee-hook.cmd'

if (-not (Test-Path $cli))     { Write-Host "FAIL: $cli not found (pnpm build first)"; exit 1 }
if (-not (Test-Path $cfgPath)) { Write-Host "FAIL: hook config absent — run 'node dist/cli.js install' first"; exit 1 }

New-Item -ItemType Directory -Force -Path $capDir | Out-Null
# Clear stale captures so we only read this run's payloads.
Get-ChildItem $capDir -Filter 'payload-*.json' -ErrorAction SilentlyContinue | Remove-Item -Force

# --- tee-wrapper: byte-exact capture of stdin, then replay to the real hook ---
# %USERPROFILE% paths are resolved here so the .cmd is self-contained.
$teeBody = @"
@echo off
powershell -NoProfile -Command "`$ts=Get-Date -Format yyyyMMdd-HHmmss-fff; `$cap=Join-Path '$capDir' ('payload-'+`$ts+'.json'); `$ms=New-Object IO.MemoryStream; [Console]::OpenStandardInput().CopyTo(`$ms); `$bytes=`$ms.ToArray(); [IO.File]::WriteAllBytes(`$cap,`$bytes); `$tmp=[IO.Path]::GetTempFileName(); [IO.File]::WriteAllBytes(`$tmp,`$bytes); `$out=[IO.Path]::GetTempFileName(); Start-Process node -ArgumentList '$cli','hook','copilot' -RedirectStandardInput `$tmp -RedirectStandardOutput `$out -NoNewWindow -Wait; [Console]::Out.Write([IO.File]::ReadAllText(`$out)); Remove-Item `$tmp,`$out -Force -ErrorAction SilentlyContinue"
"@
[System.IO.File]::WriteAllText($teeCmd, $teeBody, (New-Object System.Text.UTF8Encoding $false))

# --- swap config to point at the tee-wrapper, keeping a backup ---
$bak = "$cfgPath.live-bak"
Copy-Item $cfgPath $bak -Force
# -AsHashtable: the #20 config carries BOTH `PreToolUse` and `preToolUse`; the default
# (case-insensitive PSCustomObject) cannot hold both keys, so parse to a case-sensitive
# hashtable. Original is restored from $bak in finally, so re-serialization need not be
# byte-identical — only the three command fields must repoint at the tee-wrapper.
$cfg = Get-Content -Raw $cfgPath | ConvertFrom-Json -AsHashtable
$cfg.hooks.PreToolUse[0].command    = $teeCmd
$cfg.hooks.preToolUse[0].bash       = $teeCmd
$cfg.hooks.preToolUse[0].powershell = $teeCmd
($cfg | ConvertTo-Json -Depth 12) | Set-Content -Path $cfgPath -Encoding utf8

Write-Host "=== live capture: tee-wrapper installed, driving copilot ==="
Write-Host "prompt: $Prompt"
Write-Host ""

try {
  Set-Location $repo
  $job = Start-Job -ScriptBlock {
    param($p) copilot -p $p --allow-all-tools 2>&1
  } -ArgumentList $Prompt
  if (Wait-Job $job -Timeout 120) { Receive-Job $job | ForEach-Object { Write-Host "[copilot] $_" } }
  else { Write-Host "[copilot] TIMEOUT-120s"; Stop-Job $job }
  Remove-Job $job -Force
}
finally {
  # ALWAYS restore the original hook config.
  Copy-Item $bak $cfgPath -Force
  Remove-Item $bak -Force -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "=== hook config restored ==="
}

# --- dump captured real payloads ---
$caps = Get-ChildItem $capDir -Filter 'payload-*.json' -ErrorAction SilentlyContinue | Sort-Object Name
Write-Host ""
Write-Host "=== captured $($caps.Count) real host payload(s) in $capDir ==="
foreach ($c in $caps) {
  $bytes = [System.IO.File]::ReadAllBytes($c.FullName)
  $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  $text = [System.IO.File]::ReadAllText($c.FullName)
  Write-Host "--- $($c.Name) (bytes=$($bytes.Length), leadingBOM=$hasBom) ---"
  Write-Host $text
  Write-Host ""
}
if ($caps.Count -eq 0) {
  Write-Host "No payloads captured — copilot likely never issued a shell tool call"
  Write-Host "(check auth + model reachability above)."
}
