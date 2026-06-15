# Verify the issue-#20 fix on the box (auth-free), reproducing Copilot CLI's EXACT hook
# invocation observed in the live parent-process chain: `pwsh -nop -nol -c <field-value>`.
# Both the PascalCase `command` field AND the camelCase `powershell` field are launched this
# way, so BOTH must parse + rewrite (a ParserError → exit 1 → Copilot fail-closed DENY).
# Run under pwsh 7 (ConvertFrom-Json -AsHashtable needs it for the dual schema keys).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cfgPath = Join-Path $env:USERPROFILE '.copilot\hooks\tk-rewrite.json'
$cfg = Get-Content -Raw $cfgPath | ConvertFrom-Json -AsHashtable
$fields = [ordered]@{
  'PreToolUse.command (PascalCase)' = $cfg.hooks.PreToolUse[0].command
  'preToolUse.powershell (camelCase)' = $cfg.hooks.preToolUse[0].powershell
}
$payload = '{"toolName":"powershell","toolArgs":"{\"command\":\"git status\"}"}'

foreach ($name in $fields.Keys) {
  $field = $fields[$name]
  Write-Host "=== $name ==="
  Write-Host "    field: $field"
  $tmpIn = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($tmpIn, $payload)
  $tmpOut = [IO.Path]::GetTempFileName(); $tmpErr = [IO.Path]::GetTempFileName()
  try {
    # EXACT Copilot invocation: pwsh -nop -nol -c <field>, payload on stdin, field as ONE arg.
    $p = Start-Process pwsh -ArgumentList '-nop','-nol','-c',$field `
         -RedirectStandardInput $tmpIn -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr `
         -NoNewWindow -Wait -PassThru
    $out = (Get-Content -Raw $tmpOut -ErrorAction SilentlyContinue)
    $err = (Get-Content -Raw $tmpErr -ErrorAction SilentlyContinue)
    $rewrote = $out -match '"command":"tk git status"'
    Write-Host ("    exit={0}  rewrote={1}" -f $p.ExitCode, [bool]$rewrote)
    if ($p.ExitCode -ne 0 -or -not $rewrote) {
      $msg = (($err + $out).Trim() -replace '\s+',' ')
      if ($msg.Length -gt 200) { $msg = $msg.Substring(0,200) + '...' }
      Write-Host "    PROBLEM: $msg"
    }
  } finally {
    Remove-Item $tmpIn,$tmpOut,$tmpErr -Force -ErrorAction SilentlyContinue
  }
  Write-Host ""
}
