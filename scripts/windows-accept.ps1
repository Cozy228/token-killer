# Windows live acceptance for ctx hook fixes (#19/#20/#21) — DESIGN §12 step 4.
#
# Feeds REAL host-shaped payloads to `node dist/cli.js hook copilot` over stdin and
# asserts the rewrite output. This is the part unit tests can't prove: that the built
# binary, under a real Windows PowerShell host, rewrites a powershell/run_in_terminal
# tool call to `ctx ...` while preserving every host-supplied field (so VS Code's
# run_in_terminal schema validation does not silently drop the rewrite, #19), and that
# it survives a leading UTF-8 BOM and a string-encoded toolArgs (Copilot CLI, #20/#21).
#
# Byte-exact stdin: payloads are written to files (with/without BOM) and redirected via
# `cmd /c "node ... < file"` so PowerShell pipeline re-encoding cannot corrupt the BOM.
#
# Usage (on the box):
#   cd C:\Users\cozy2\workspace\contexa
#   pwsh -NoProfile -File scripts\windows-accept.ps1
# Exit code 0 = all PASS, 1 = at least one FAIL.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo = Split-Path -Parent $PSScriptRoot
$cli  = Join-Path $repo 'dist\cli.js'
if (-not (Test-Path $cli)) { Write-Host "FAIL: $cli not found (run pnpm build)"; exit 1 }

$capDir = Join-Path $repo 'reports\windows-accept-captures'
New-Item -ItemType Directory -Force -Path $capDir | Out-Null

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$utf8Bom   = New-Object System.Text.UTF8Encoding $true

$results = @()
function Add-Result($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ Name = $name; Pass = $ok; Detail = $detail }
  $tag = if ($ok) { '[PASS]' } else { '[FAIL]' }
  Write-Host "$tag $name — $detail"
}

# Run one payload through the hook and return parsed-stdout (or $null) + raw.
function Invoke-Hook($name, $json, [bool]$withBom) {
  $inFile  = Join-Path $capDir "$name.in.json"
  $outFile = Join-Path $capDir "$name.out.json"
  $enc = if ($withBom) { $utf8Bom } else { $utf8NoBom }
  [System.IO.File]::WriteAllText($inFile, $json, $enc)
  # cmd redirect = byte-exact stdin (preserves BOM); node resolves via PATH.
  cmd /c "node `"$cli`" hook copilot < `"$inFile`"" > $outFile 2>$null
  $raw = (Get-Content -Raw $outFile -ErrorAction SilentlyContinue)
  $parsed = $null
  if ($raw -and $raw.Trim().Length -gt 0) {
    try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $null }
  }
  return [pscustomobject]@{ Raw = $raw; Parsed = $parsed }
}

Write-Host "=== ctx hook copilot — live payload acceptance ==="
Write-Host "repo: $repo"
Write-Host "cli:  $cli"
Write-Host "captures: $capDir"
Write-Host ""

# --- T1: Copilot CLI dialect, powershell tool, toolArgs as a JSON STRING (#20/#21) ---
$t1 = '{"event":"preToolUse","toolName":"powershell","toolArgs":"{\"command\":\"git status\",\"description\":\"check repo\",\"mode\":\"sync\"}","session":"sess-cli-1","cwd":"C:\\Users\\cozy2\\workspace\\atlas"}'
$r = Invoke-Hook 't1-cli-powershell-stringargs' $t1 $false
if ($null -eq $r.Parsed) {
  Add-Result 'T1 CLI powershell (toolArgs string)' $false "no/!json output: $($r.Raw)"
} else {
  $cmd = $r.Parsed.modifiedArgs.command
  $ok = ($r.Parsed.permissionDecision -eq 'allow') -and
        ($r.Parsed.permissionDecisionReason -eq 'ctx auto-rewrite') -and
        ($cmd -like 'ctx *') -and
        ($r.Parsed.modifiedArgs.description -eq 'check repo') -and
        ($r.Parsed.modifiedArgs.mode -eq 'sync')
  Add-Result 'T1 CLI powershell (toolArgs string)' $ok "modifiedArgs.command='$cmd'; extras preserved=$($r.Parsed.modifiedArgs.description -eq 'check repo' -and $r.Parsed.modifiedArgs.mode -eq 'sync')"
}

# --- T2: Copilot CLI dialect, toolArgs as an OBJECT (not string) ---
$t2 = '{"event":"preToolUse","toolName":"powershell","toolArgs":{"command":"git log --oneline -5","description":"recent","mode":"sync"},"session":"sess-cli-2"}'
$r = Invoke-Hook 't2-cli-powershell-objargs' $t2 $false
if ($null -eq $r.Parsed) {
  Add-Result 'T2 CLI powershell (toolArgs object)' $false "no/!json output: $($r.Raw)"
} else {
  $cmd = $r.Parsed.modifiedArgs.command
  $ok = ($r.Parsed.permissionDecision -eq 'allow') -and ($cmd -like 'ctx *') -and ($r.Parsed.modifiedArgs.description -eq 'recent')
  Add-Result 'T2 CLI powershell (toolArgs object)' $ok "modifiedArgs.command='$cmd'"
}

# --- T3: VS Code dialect, run_in_terminal, full schema fields (#19) ---
# The rewrite must REPLACE tool_input wholesale yet preserve explanation/isBackground,
# else VS Code's run_in_terminal schema rejects updatedInput and silently ignores it.
$t3 = '{"hook_event_name":"PreToolUse","tool_name":"run_in_terminal","tool_input":{"command":"git status","explanation":"Check the working tree","isBackground":false}}'
$r = Invoke-Hook 't3-vscode-run-in-terminal' $t3 $false
if ($null -eq $r.Parsed) {
  Add-Result 'T3 VS Code run_in_terminal (updatedInput full fields)' $false "no/!json output: $($r.Raw)"
} else {
  $ui = $r.Parsed.hookSpecificOutput.updatedInput
  $ok = ($r.Parsed.hookSpecificOutput.permissionDecision -eq 'allow') -and
        ($r.Parsed.hookSpecificOutput.hookEventName -eq 'PreToolUse') -and
        ($ui.command -like 'ctx *') -and
        ($ui.explanation -eq 'Check the working tree') -and
        ($ui.isBackground -eq $false)
  Add-Result 'T3 VS Code run_in_terminal (updatedInput full fields)' $ok "updatedInput.command='$($ui.command)'; explanation+isBackground preserved=$($ui.explanation -eq 'Check the working tree' -and $ui.isBackground -eq $false)"
}

# --- T4: Copilot CLI payload with a LEADING UTF-8 BOM (Windows host quirk) ---
$r = Invoke-Hook 't4-cli-leading-bom' $t1 $true
if ($null -eq $r.Parsed) {
  Add-Result 'T4 CLI leading BOM (stripped, still rewrites)' $false "no/!json output: $($r.Raw)"
} else {
  $cmd = $r.Parsed.modifiedArgs.command
  $ok = ($cmd -like 'ctx *') -and ($r.Parsed.modifiedArgs.description -eq 'check repo')
  Add-Result 'T4 CLI leading BOM (stripped, still rewrites)' $ok "modifiedArgs.command='$cmd'"
}

# --- T5: non-shell direct tool → no rewrite (fail-open / pass-through) ---
$t5 = '{"event":"preToolUse","toolName":"read_file","toolArgs":{"path":"README.md"}}'
$r = Invoke-Hook 't5-cli-direct-read' $t5 $false
$ok = ($null -eq $r.Parsed) -or ($null -eq $r.Parsed.modifiedArgs)
Add-Result 'T5 non-shell tool (no rewrite)' $ok "output empty or no modifiedArgs (raw len=$([string]::Format('{0}', ($r.Raw | Measure-Object -Character).Characters)))"

Write-Host ""
$fail = ($results | Where-Object { -not $_.Pass }).Count
$pass = ($results | Where-Object { $_.Pass }).Count
Write-Host "=== SUMMARY: $pass passed, $fail failed ==="
Write-Host "Captured payloads + outputs in: $capDir"
if ($fail -gt 0) { exit 1 } else { exit 0 }
