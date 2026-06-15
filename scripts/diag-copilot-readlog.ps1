# Dump hook-error context from a Copilot process log (issue #20).
#   pwsh -File diag-copilot-readlog.ps1            # latest log
#   pwsh -File diag-copilot-readlog.ps1 <substr>   # log whose name contains <substr>
param([string]$Match)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$logDir = Join-Path $env:USERPROFILE '.copilot\logs'
$logs = Get-ChildItem $logDir -Filter 'process-*.log' | Sort-Object LastWriteTime
$target = if ($Match) { $logs | Where-Object { $_.Name -like "*$Match*" } | Select-Object -Last 1 } else { $logs | Select-Object -Last 1 }
Write-Host "=== log: $($target.FullName) ($($target.Length) bytes, $($target.LastWriteTime)) ==="
Write-Host ""
$lines = Get-Content $target.FullName
$n = 0
foreach ($l in $lines) {
  $n++
  # Print every ERROR/hook line PLUS the ~12 lines after an ERROR (the stderr/stack).
  if ($l -match '\[ERROR\]|hook|HookExit|Stderr|preToolUse') {
    Write-Host ("{0,5}: {1}" -f $n, $l.TrimEnd())
  }
}
Write-Host ""
Write-Host "=== full block around first [ERROR] ==="
$idx = ($lines | Select-String -Pattern '\[ERROR\].*hook' | Select-Object -First 1).LineNumber
if ($idx) {
  $start = [Math]::Max(0, $idx - 1)
  ($lines[$start..([Math]::Min($lines.Count-1, $idx + 18))]) | ForEach-Object { Write-Host $_.TrimEnd() }
}
