# Instrument the live Copilot CLI hook to capture ground truth (issue #20: hook errors on
# EVERY tool call, even non-shell — so the failure is structural, not command-parsing).
#
#   pwsh -File scripts\windows-hook-instrument.ps1            # install logging shims
#   pwsh -File scripts\windows-hook-instrument.ps1 -Restore   # restore original config
#
# Points each hook field (command / bash / powershell) at a no-space .cmd shim that runs
# scripts\hooklog.js (logs invocation context + runs the REAL ctx hook, captures its
# exit/stderr, passes stdout through, ALWAYS exits 0). After one `copilot -p` run, read
# C:\Users\cozy2\ctx-hooklog.txt to see which field fires, how, and whether ctx errors.
param([switch]$Restore)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$home2   = 'C:\Users\cozy2'
$cfgPath = Join-Path $env:USERPROFILE '.copilot\hooks\ctx-rewrite.json'
$bak     = "$cfgPath.instrument-bak"
$logFile = Join-Path $home2 'ctx-hooklog.txt'
$node    = 'C:\Program Files\nodejs\node.exe'
$hooklog = Join-Path $home2 'workspace\contexa\scripts\hooklog.cjs'

if ($Restore) {
  if (Test-Path $bak) { Copy-Item $bak $cfgPath -Force; Remove-Item $bak -Force; Write-Host "restored $cfgPath" }
  else { Write-Host "no backup found at $bak" }
  Get-ChildItem $home2 -Filter 'ctx-hl-*.cmd' -ErrorAction SilentlyContinue | Remove-Item -Force
  return
}

# Back up the real config (only once — don't clobber an existing backup).
if (-not (Test-Path $bak)) { Copy-Item $cfgPath $bak -Force }
Remove-Item $logFile -Force -ErrorAction SilentlyContinue

# Write one no-space .cmd shim per field. A bare no-space .cmd path spawns cleanly under
# cmd / powershell / CreateProcess, so it removes the "can Copilot even launch it" variable.
foreach ($f in @('command','bash','powershell')) {
  $cmdPath = Join-Path $home2 "ctx-hl-$f.cmd"
  # The .cmd quotes the node path (cmd handles a quoted exe) and passes the field name.
  $body = "@echo off`r`n`"$node`" `"$hooklog`" $f`r`n"
  [System.IO.File]::WriteAllText($cmdPath, $body, (New-Object System.Text.ASCIIEncoding))
  Write-Host "wrote $cmdPath"
}

# Repoint each field at its shim (case-sensitive hashtable: dual PreToolUse/preToolUse keys).
$cfg = Get-Content -Raw $cfgPath | ConvertFrom-Json -AsHashtable
$cfg.hooks.PreToolUse[0].command    = (Join-Path $home2 'ctx-hl-command.cmd')
$cfg.hooks.preToolUse[0].bash       = (Join-Path $home2 'ctx-hl-bash.cmd')
$cfg.hooks.preToolUse[0].powershell = (Join-Path $home2 'ctx-hl-powershell.cmd')
($cfg | ConvertTo-Json -Depth 12) | Set-Content -Path $cfgPath -Encoding utf8

Write-Host ""
Write-Host "instrumented. Now run ONE copilot session, e.g.:"
Write-Host "  copilot -p `"Run this exact shell command and show its output, nothing else: git status`""
Write-Host "then read: $logFile"
