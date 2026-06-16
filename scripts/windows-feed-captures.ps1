# Feed the REAL captured host payloads through `hook copilot` and show the decision.
# Decisive goal-3 check: does the handler rewrite the actual 1.0.62 shapes (incl. the
# event-less CLI-native payload)?
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = Split-Path -Parent $PSScriptRoot
$cli  = Join-Path $repo 'dist\cli.js'
$d    = Join-Path $repo 'reports\windows-live-captures'
Get-ChildItem $d -Filter 'payload-*.json' | Sort-Object Name | ForEach-Object {
  $in = $_.FullName
  $tmpOut = [IO.Path]::GetTempFileName()
  $p = Start-Process node -ArgumentList $cli,'hook','copilot' -RedirectStandardInput $in -RedirectStandardOutput $tmpOut -NoNewWindow -Wait -PassThru
  $out = [IO.File]::ReadAllText($tmpOut)
  Remove-Item $tmpOut -Force -ErrorAction SilentlyContinue
  Write-Host "=== $($_.Name) (exit=$($p.ExitCode)) ==="
  if ($out.Trim().Length -gt 0) {
    Write-Host "OUTPUT: $out"
    # extract rewritten command for quick read
    try {
      $j = $out | ConvertFrom-Json
      $cmd = if ($j.modifiedArgs) { $j.modifiedArgs.command } elseif ($j.hookSpecificOutput.updatedInput) { $j.hookSpecificOutput.updatedInput.command } else { '(none)' }
      Write-Host "REWRITTEN-COMMAND: $cmd"
    } catch { Write-Host "REWRITTEN-COMMAND: (output not JSON)" }
  } else {
    Write-Host "OUTPUT: (empty -> ALLOW, NO REWRITE)"
  }
  Write-Host ""
}
