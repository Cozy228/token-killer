#Requires -Version 7.0
<#
.SYNOPSIS
  tk real-machine acceptance — one unified suite for an INSTALLED tk. Functional
  (every command + options), hook protocol, compression quality, boundary
  conditions, fail-safe, performance, shim/PATH, install/uninstall E2E, and a
  Tier-0 manual harness. Writes a Markdown report.

.DESCRIPTION
  This is the single comprehensive Windows real-machine suite. It exercises the tk
  a user actually installed (global `tk` preferred, else node dist\cli.js), not
  vitest. It is cross-platform: Windows-only checks (shim .cmd / PATHEXT / VS Code
  settings windows-env key / code page / antivirus) are gated behind $IsWindows,
  so the functional/compression/boundary/perf/fail-safe phases also run under pwsh
  on macOS/Linux for development.

  SAFE BY DEFAULT. Read-only phases always run. The install/uninstall lifecycle
  mutates real user config but snapshots it and restores the originally-detected
  install at the end. Host claude-code, network (telemetry/support), and
  optimize --apply stay OFF unless explicitly opted in.

.PARAMETER TargetRepo
  Git repo used for compression cases (default: this repo, or $env:TK_ACCEPT_CWD).

.PARAMETER ReportPath
  Markdown report path (default: reports\windows-dogfood-<stamp>.md).

.PARAMETER TkCommand
  Override how tk is invoked. e.g. -TkCommand tk  OR  -TkCommand node,dist\cli.js

.PARAMETER PerfIterations   Samples per perf case (default 7).
.PARAMETER TimeoutSec       Per-command timeout (default 60).
.PARAMETER SkipLifecycle    Do NOT run install/uninstall mutation E2E.
.PARAMETER SkipPerf         Do NOT run the performance phase.
.PARAMETER IncludeClaudeCode  Also exercise install/uninstall --host claude-code (mutates ~/.claude).
.PARAMETER IncludeNetwork   Run telemetry enable/disable round-trip + support bundle.
.PARAMETER AllowApply       Run `optimize context --apply` (backs up + restores edited files).
.PARAMETER CopilotCliE2E    If `copilot` is on PATH, drive a real `copilot -p` and check the gain delta.

.EXAMPLE
  pwsh -NoProfile -File scripts/windows-dogfood.ps1
.EXAMPLE
  pwsh -NoProfile -File scripts/windows-dogfood.ps1 -TkCommand tk -CopilotCliE2E
#>
[CmdletBinding()]
param(
  [string]   $TargetRepo = "",
  [string]   $ReportPath = "",
  [string[]] $TkCommand = @(),
  [int]      $PerfIterations = 7,
  [int]      $TimeoutSec = 60,
  [switch]   $SkipLifecycle,
  [switch]   $SkipPerf,
  [switch]   $IncludeClaudeCode,
  [switch]   $IncludeNetwork,
  [switch]   $AllowApply,
  [switch]   $CopilotCliE2E
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:TimeoutSec = $TimeoutSec

# ── Result model ────────────────────────────────────────────────────
$script:Results = [System.Collections.Generic.List[object]]::new()
$script:Findings = [System.Collections.Generic.List[string]]::new()

function Record {
  param([string]$Phase, [string]$Name, [string]$Status, [string]$Detail = "", [double]$Ms = -1)
  $script:Results.Add([PSCustomObject]@{ Phase = $Phase; Name = $Name; Status = $Status; Detail = $Detail; Ms = $Ms })
  $color = switch ($Status) {
    "PASS" { "Green" } "FAIL" { "Red" } "WARN" { "Yellow" } "SKIP" { "DarkGray" } default { "Gray" }
  }
  $msText = if ($Ms -ge 0) { (" {0,6:N0}ms" -f $Ms) } else { "        " }
  $d = if ($Detail) { "  $Detail" } else { "" }
  Write-Host ("  {0,-4}{1} {2}{3}" -f $Status, $msText, $Name, $d) -ForegroundColor $color
}
function Pass { param($P, $N, $D = "", $Ms = -1) Record $P $N "PASS" $D $Ms }
function Fail { param($P, $N, $D = "", $Ms = -1) Record $P $N "FAIL" $D $Ms; $script:Findings.Add("FAIL [$P] $N — $D") }
function Warn { param($P, $N, $D = "", $Ms = -1) Record $P $N "WARN" $D $Ms; $script:Findings.Add("WARN [$P] $N — $D") }
function Skip { param($P, $N, $D = "") Record $P $N "SKIP" $D }
function Info { param($P, $N, $D = "", $Ms = -1) Record $P $N "INFO" $D $Ms }
function Section([string]$Title) { Write-Host ""; Write-Host "── $Title ──" -ForegroundColor Cyan }
# @() forces an array so .Count is valid even for 0/1 matches under StrictMode.
function CountBy($items, $st) { @($items | Where-Object { $_.Status -eq $st }).Count }

# ── Process runner (async reads avoid large-output deadlock; hard timeout) ──
function Start-Proc {
  param([string]$File, [string[]]$PArgs, [hashtable]$Env, [string]$Stdin, [bool]$HasStdin = $false, [int]$Tmo = -1)
  if ($Tmo -lt 0) { $Tmo = $script:TimeoutSec }
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $File
  # ProcessStartInfo defaults to the .NET process CWD, NOT PowerShell's location;
  # without this, Push-Location into a fixture dir would not reach the child.
  $psi.WorkingDirectory = (Get-Location).Path
  foreach ($a in $PArgs) { [void]$psi.ArgumentList.Add([string]$a) }
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.RedirectStandardInput = $HasStdin
  # tk emits UTF-8 (as do all UTF-8-aware agents that consume it). Without an explicit
  # encoding, .NET decodes the child's stdout/stdin using the console code page — cp936
  # on this GBK box — which mojibakes Chinese/emoji output (false "needle not found"
  # warns). Pin UTF-8 so the harness reads what a real agent reads.
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  $psi.StandardOutputEncoding = $utf8
  $psi.StandardErrorEncoding = $utf8
  if ($HasStdin) { $psi.StandardInputEncoding = $utf8 }
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  if ($Env) { foreach ($k in $Env.Keys) { $psi.Environment[$k] = [string]$Env[$k] } }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $p = [System.Diagnostics.Process]::Start($psi)
  if ($HasStdin) { $p.StandardInput.Write($Stdin); $p.StandardInput.Close() }
  $op = $p.StandardOutput.ReadToEndAsync()
  $ep = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($Tmo * 1000)) {
    try { $p.Kill($true) } catch {}
    $sw.Stop()
    return [PSCustomObject]@{ ExitCode = 124; Stdout = ""; Stderr = "TIMEOUT ${Tmo}s"; AllText = "TIMEOUT ${Tmo}s"; Ms = $sw.Elapsed.TotalMilliseconds; TimedOut = $true }
  }
  $sw.Stop()
  $out = $op.GetAwaiter().GetResult()
  $err = $ep.GetAwaiter().GetResult()
  [PSCustomObject]@{ ExitCode = $p.ExitCode; Stdout = $out; Stderr = $err; AllText = "$out$err"; Ms = $sw.Elapsed.TotalMilliseconds; TimedOut = $false }
}
# Invoke tk. Redirected stdout = non-TTY, so the compress path engages naturally.
function Invoke-Tk {
  param([string[]]$TkArgs, [hashtable]$Env, [string]$Stdin, [int]$Tmo = -1)
  $hasStdin = $PSBoundParameters.ContainsKey('Stdin')
  Start-Proc -File $script:TkBin -PArgs ($script:TkPre + $TkArgs) -Env $Env -Stdin $Stdin -HasStdin $hasStdin -Tmo $Tmo
}
function Get-Percentile { param([double[]]$V, [double]$P)
  if (-not $V -or $V.Count -eq 0) { return 0 }
  $s = $V | Sort-Object
  $i = [math]::Ceiling($P / 100.0 * $s.Count) - 1
  if ($i -lt 0) { $i = 0 } ; if ($i -ge $s.Count) { $i = $s.Count - 1 }
  [double]$s[$i]
}
function Test-Cmd([string]$Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# ── Environment fingerprint ─────────────────────────────────────────
function Get-AvProduct {
  if (-not $IsWindows) { return "n/a (non-Windows)" }
  $av = @()
  try { $d = Get-MpComputerStatus -ErrorAction Stop; if ($d.AMRunningMode) { $av += "Defender($($d.AMRunningMode))" } } catch {}
  try { Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop | ForEach-Object { $av += $_.displayName } } catch {}
  try { (Get-Service -ErrorAction Stop | Where-Object { $_.Name -match 'csagent|CrowdStrike|CSFalcon' -and $_.Status -eq 'Running' }) | ForEach-Object { $av += "CrowdStrike" } } catch {}
  if ($av.Count) { ($av | Select-Object -Unique) -join ', ' } else { "none detected" }
}
function Get-CodePage {
  if ($IsWindows) { try { return ((chcp.com) -replace '[^\d]', '') } catch {} }
  [Console]::OutputEncoding.WebName
}
function Get-NodeVersion { try { (Start-Proc -File "node" -PArgs @("--version")).Stdout.Trim() } catch { "absent" } }
function Get-CompileCacheTier([string]$nv) {
  try {
    $p = $nv.TrimStart('v').Split('.'); $maj = [int]$p[0]; $min = [int]$p[1]
    if ($maj -gt 22 -or ($maj -eq 22 -and $min -ge 8)) { return "enableCompileCache() API (Node >=22.8)" }
    if ($maj -eq 22 -and $min -ge 1) { return "shim NODE_COMPILE_CACHE env (Node 22.1-22.7)" }
    if ($maj -ge 20) { return "deferred — uncached compile (Node 20-22.0)" }
    return "UNSUPPORTED Node <20"
  } catch { return "unknown" }
}

# ── Resolve tk + target + report ────────────────────────────────────
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Root = Split-Path -Parent $ScriptDir

# pwsh -File passes `-TkCommand node,dist/cli.js` as ONE token; split it back.
if ($TkCommand.Count -eq 1 -and $TkCommand[0] -match ',') { $TkCommand = @($TkCommand[0] -split ',') }
if ($TkCommand.Count -gt 0) {
  $script:TkBin = $TkCommand[0]
  $script:TkPre = @(if ($TkCommand.Count -gt 1) { $TkCommand[1..($TkCommand.Count - 1)] } else { @() })
} elseif (Test-Path -LiteralPath (Join-Path $Root "dist/cli.js")) {
  # Prefer the repo's built cli — `node` is directly spawnable. A global `tk` is
  # often a .ps1/.cmd shim that Process.Start (UseShellExecute=$false) cannot exec.
  $script:TkBin = "node"
  $script:TkPre = @((Resolve-Path (Join-Path $Root "dist/cli.js")).Path)
} elseif (Test-Cmd "tk") {
  $tkSrc = (Get-Command tk).Source
  switch -regex ($tkSrc) {
    '\.ps1$' { $script:TkBin = "pwsh"; $script:TkPre = @("-NoProfile", "-File", $tkSrc) }
    '\.(cmd|bat)$' { $script:TkBin = $env:ComSpec; $script:TkPre = @("/c", $tkSrc) }
    default { $script:TkBin = $tkSrc; $script:TkPre = @() }
  }
} else {
  Write-Host "tk not found: install it (pnpm add -g .) or run from a built repo (pnpm build)." -ForegroundColor Red
  exit 2
}
# Absolutize relative cli paths NOW (CWD is still the launch dir) so tk resolves
# even after the boundary phase runs it from temp fixture dirs.
$script:TkPre = @($script:TkPre | ForEach-Object { if (Test-Path -LiteralPath $_ -PathType Leaf) { (Resolve-Path -LiteralPath $_).Path } else { $_ } })

if (-not $TargetRepo) { $TargetRepo = if ($env:TK_ACCEPT_CWD) { $env:TK_ACCEPT_CWD } else { $Root } }
$TargetRepo = (Resolve-Path -LiteralPath $TargetRepo).Path

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $ReportPath) {
  $reportsDir = Join-Path $Root "reports"
  if (-not (Test-Path -LiteralPath $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null }
  $ReportPath = Join-Path $reportsDir "windows-dogfood-$stamp.md"
}
$TmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) "tk-accept-$stamp"
New-Item -ItemType Directory -Path $TmpRoot -Force | Out-Null

$nodeVer = Get-NodeVersion
$verRes = Invoke-Tk @("--version")
$tkVer = ($verRes.Stdout + $verRes.Stderr).Trim()
$initialStatus = Invoke-Tk @("status")
$priorHost = ""
foreach ($ln in ($initialStatus.AllText -split "`n")) {
  if ($ln -match "installed host:\s*(\S.*)$") { $priorHost = $Matches[1].Trim(); break }
}

$EnvInfo = [ordered]@{
  "date"               = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  "tk invocation"      = "$($script:TkBin) $($script:TkPre -join ' ')"
  "tk version"         = $tkVer
  "OS"                 = if ($IsWindows) { "Windows" } elseif ($IsMacOS) { "macOS" } else { "Linux" }
  "OS detail"          = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
  "PowerShell"         = $PSVersionTable.PSVersion.ToString()
  "Node"               = $nodeVer
  "compile-cache tier" = (Get-CompileCacheTier $nodeVer)
  "code page / enc"    = (Get-CodePage)
  "antivirus"          = (Get-AvProduct)
  "git"                = if (Test-Cmd git) { "yes" } else { "ABSENT" }
  "ripgrep (rg)"       = if (Test-Cmd rg) { "yes" } else { "absent" }
  "tree"               = if (Test-Cmd tree) { "yes" } else { "absent" }
  "pnpm"               = if (Test-Cmd pnpm) { "yes" } else { "absent" }
  "target repo"        = $TargetRepo
  "prior install host" = if ($priorHost) { $priorHost } else { "(none)" }
}

Write-Host "tk Real-Machine Acceptance" -ForegroundColor White
$EnvInfo.GetEnumerator() | ForEach-Object { Write-Host ("  {0,-20} {1}" -f $_.Key, $_.Value) }

Push-Location $TargetRepo
try {
  # ╔══ PHASE 1: Functional surface — every command + key options ══╗
  Section "Functional — version / status / config / telemetry / gain"
  $r = Invoke-Tk @("--version")
  if ($r.ExitCode -eq 0 -and $r.AllText -match '\d+\.\d+') { Pass "func" "tk --version" $r.AllText.Trim() $r.Ms } else { Fail "func" "tk --version" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("--help"); if ($r.ExitCode -eq 0 -and $r.AllText -match 'Commands:') { Pass "func" "tk --help" "" $r.Ms } else { Fail "func" "tk --help" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("status"); if ($r.ExitCode -eq 0 -and $r.AllText -match 'host') { Pass "func" "tk status" "" $r.Ms } else { Fail "func" "tk status" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("config", "show"); if ($r.ExitCode -eq 0) { Pass "func" "tk config show" "" $r.Ms } else { Fail "func" "tk config show" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("config", "path"); if ($r.ExitCode -eq 0) { Pass "func" "tk config path" $r.Stdout.Trim() $r.Ms } else { Fail "func" "tk config path" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("telemetry", "status"); if ($r.ExitCode -eq 0) { Pass "func" "tk telemetry status" "" $r.Ms } else { Fail "func" "tk telemetry status" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("telemetry", "preview"); if ($r.ExitCode -eq 0) { Pass "func" "tk telemetry preview" "" $r.Ms } else { Warn "func" "tk telemetry preview" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("gain", "--text"); if ($r.ExitCode -eq 0) { Pass "func" "tk gain --text" "" $r.Ms } else { Fail "func" "tk gain --text" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("gain", "--history"); if ($r.ExitCode -eq 0) { Pass "func" "tk gain --history" "" $r.Ms } else { Fail "func" "tk gain --history" "exit=$($r.ExitCode)" $r.Ms }

  Section "Functional — inspect (all option combos)"
  $inspectCases = @(
    @{ N = "inspect --text"; A = @("inspect", "--text"); Must = "Token Killer Inspect" },
    @{ N = "inspect --json"; A = @("inspect", "--json"); Must = '"schemaVersion"' },
    @{ N = "inspect --project --text"; A = @("inspect", "--project", "--text"); Must = "" },
    @{ N = "inspect --user --text"; A = @("inspect", "--user", "--text"); Must = "" },
    @{ N = "inspect --since 7d --text"; A = @("inspect", "--since", "7d", "--text"); Must = "" },
    @{ N = "inspect --advice --text"; A = @("inspect", "--advice", "--text"); Must = "" },
    @{ N = "inspect --surface instructions --text"; A = @("inspect", "--surface", "instructions", "--text"); Must = "" }
  )
  foreach ($c in $inspectCases) {
    $r = Invoke-Tk $c.A
    $ok = $r.ExitCode -eq 0 -and ($c.Must -eq "" -or $r.AllText -match [regex]::Escape($c.Must))
    if ($ok) { Pass "func" $c.N "" $r.Ms } else { Fail "func" $c.N "exit=$($r.ExitCode)" $r.Ms }
  }
  # --fail-on is a CI gate: nonzero is by-design, not a failure. Record the exit code.
  $r = Invoke-Tk @("inspect", "--fail-on", "error", "--text")
  Info "func" "inspect --fail-on error" "exit=$($r.ExitCode) (nonzero = findings reached threshold, by design)" $r.Ms

  Section "Functional — optimize (preview) / debug + privacy scrub"
  $r = Invoke-Tk @("optimize", "context", "--project")
  if ($r.ExitCode -eq 0 -and $r.AllText -match 'preview') { Pass "func" "optimize context --project (preview)" "" $r.Ms } else { Fail "func" "optimize context --project" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("optimize", "context", "--user")
  if ($r.ExitCode -eq 0) { Pass "func" "optimize context --user (preview)" "" $r.Ms } else { Warn "func" "optimize context --user" "exit=$($r.ExitCode)" $r.Ms }
  # debug bundle + privacy: the saved report must NOT leak the literal home path.
  $r = Invoke-Tk @("debug")
  if ($r.ExitCode -eq 0 -and $r.AllText -match 'debug bundle') {
    Pass "func" "tk debug (writes bundle)" "" $r.Ms
    $dbgPath = ($r.AllText -split "`n" | Where-Object { $_ -match 'debug bundle:' } | Select-Object -First 1) -replace '.*bundle:\s*', ''
    $dbgPath = $dbgPath.Trim()
    if ($dbgPath -and (Test-Path -LiteralPath $dbgPath)) {
      $body = Get-Content -LiteralPath $dbgPath -Raw
      $userHome = [Environment]::GetFolderPath('UserProfile')
      if ($body -match [regex]::Escape($userHome)) { Warn "func" "debug bundle scrubs home path" "leaks $userHome" } else { Pass "func" "debug bundle scrubs home path" }
      # On Windows/Unix a freshly written report should not be world-anything-fancy; existence is the floor.
      Remove-Item -LiteralPath $dbgPath -Force -ErrorAction SilentlyContinue
    }
  } else { Fail "func" "tk debug" "exit=$($r.ExitCode)" $r.Ms }

  # ╔══ PHASE 2: Hook protocol (copilot / claude / check) ══╗
  Section "Hook — check (rewrite dry-run, no execution)"
  foreach ($hc in @(
      @{ N = "hook check git status"; A = @("hook", "check", "git", "status") },
      @{ N = "hook check git commit"; A = @("hook", "check", "git", "commit", "-m", "x") },
      @{ N = "hook check git add ."; A = @("hook", "check", "git", "add", ".") },
      @{ N = "hook check rg foo ."; A = @("hook", "check", "rg", "foo", ".") },
      @{ N = "hook check read CONTEXT.md"; A = @("hook", "check", "read", "CONTEXT.md") }
    )) {
    $r = Invoke-Tk $hc.A
    if ($r.ExitCode -eq 0 -and $r.AllText.Trim().Length -gt 0) { Pass "hook" $hc.N $r.AllText.Trim() $r.Ms } else { Fail "hook" $hc.N "exit=$($r.ExitCode)" $r.Ms }
  }

  Section "Hook — copilot stdin protocol (per-dialect shapes)"
  $r = Invoke-Tk @("hook", "copilot") -Stdin '{"event":"preToolUse","toolName":"bash","toolArgs":"{\"command\":\"git status\"}"}'
  if ($r.ExitCode -eq 0 -and $r.Stdout -match '"modifiedArgs"') { Pass "hook" "copilot rewrite -> modifiedArgs" $r.Stdout.Trim() $r.Ms } else { Fail "hook" "copilot rewrite" "exit=$($r.ExitCode) out=$($r.Stdout)" $r.Ms }
  $r = Invoke-Tk @("hook", "copilot") -Stdin '{"event":"preToolUse","tool_name":"read_file","tool_input":{"filePath":"node_modules/x/i.js"}}'
  if ($r.ExitCode -eq 0 -and $r.Stdout -match '"permissionDecision"\s*:\s*"deny"') { Pass "hook" "copilot deny node_modules" "" $r.Ms } else { Warn "hook" "copilot deny node_modules" "exit=$($r.ExitCode) out=$($r.Stdout)" $r.Ms }
  $r = Invoke-Tk @("hook", "copilot") -Stdin '}{'
  if ($r.ExitCode -eq 0 -and $r.Stdout.Trim().Length -eq 0) { Pass "hook" "copilot fail-open bad json (empty=allow)" "" $r.Ms } else { Fail "hook" "copilot fail-open bad json" "exit=$($r.ExitCode) out=$($r.Stdout)" $r.Ms }

  Section "Hook — claude stdin protocol"
  $r = Invoke-Tk @("hook", "claude") -Stdin '{"tool_name":"Bash","tool_input":{"command":"git status"}}'
  if ($r.ExitCode -eq 0 -and $r.Stdout -match 'updatedInput' -and $r.Stdout -match 'tk git status') { Pass "hook" "claude rewrite -> updatedInput" "" $r.Ms } else { Fail "hook" "claude rewrite" "exit=$($r.ExitCode) out=$($r.Stdout)" $r.Ms }
  $r = Invoke-Tk @("hook", "claude") -Stdin 'not json'
  if ($r.ExitCode -eq 0) { Pass "hook" "claude fail-open bad json" "" $r.Ms } else { Warn "hook" "claude fail-open bad json" "exit=$($r.ExitCode)" $r.Ms }

  # ╔══ PHASE 3: Compression — quality bars + faithful/small ══╗
  Section "Compression — large output MUST clear the bar"
  $minRaw = if ($env:TK_ACCEPT_MIN_RAW) { [int]$env:TK_ACCEPT_MIN_RAW } else { 1500 }
  function Test-Savings {
    param([string]$N, [double]$MinPct, [string[]]$Cmd)
    if (-not (Test-Cmd $Cmd[0])) { Skip "compress" $N "$($Cmd[0]) absent"; return }
    $r = Invoke-Tk (@("--stats") + $Cmd)
    if ($r.AllText -notmatch '## Token Savings') { Fail "compress" $N "no compression (passthrough)" $r.Ms; return }
    $raw = 0; $pct = 0.0
    if ($r.AllText -match 'Raw:\s*(\d+)\s*tokens') { $raw = [int]$Matches[1] }
    if ($r.AllText -match 'Saved:.*\(([0-9.]+)%\)') { $pct = [double]$Matches[1] }
    if ($raw -lt $minRaw) { Pass "compress" $N "raw=$raw saved=$pct% (small, 0% ok)" $r.Ms }
    elseif ($pct -ge $MinPct) { Pass "compress" $N "raw=$raw saved=$pct% (>=$MinPct%)" $r.Ms }
    else { Fail "compress" $N "raw=$raw saved=$pct% < $MinPct%" $r.Ms }
  }
  function Test-Stats {
    param([string]$N, [string[]]$Cmd)
    if (-not (Test-Cmd $Cmd[0])) { Skip "compress" $N "$($Cmd[0]) absent"; return }
    $r = Invoke-Tk (@("--stats") + $Cmd)
    if ($r.AllText -match '## Token Savings') {
      $s = ($r.AllText -split "`n" | Where-Object { $_ -match '^(Raw|Output|Saved):' }) -join " "
      Pass "compress" $N $s $r.Ms
    } elseif ($r.ExitCode -ne 0) { Fail "compress" $N "exit=$($r.ExitCode)" $r.Ms }
    else { Pass "compress" $N "(passthrough)" $r.Ms }
  }
  $isGit = (Invoke-Tk @("git", "rev-parse", "--is-inside-work-tree")).AllText -match 'true'
  if ($isGit) {
    Test-Savings "git log -p -20" 60 @("git", "log", "-p", "-20")
    Test-Savings "git log -30" 40 @("git", "log", "-30")
  } else { Skip "compress" "git log cases" "target not a git repo" }
  $dir = if (Test-Path -LiteralPath "src" -PathType Container) { "src" } else { "." }
  Test-Savings "rg import $dir" 40 @("rg", "import", $dir)

  Section "Compression — faithful / small (runs + sane, 0% ok)"
  if ($isGit) {
    Test-Stats "git status" @("git", "status")
    Test-Stats "git branch" @("git", "branch")
    Test-Stats "git show -1 --stat" @("git", "show", "-1", "--stat")
    Test-Stats "git diff" @("git", "diff")
  }
  Test-Stats "tree $dir" @("tree", $dir)
  Test-Stats "pnpm --version" @("pnpm", "--version")
  Test-Stats "npx --version" @("npx", "--version")
  # --raw must passthrough verbatim (no stats banner).
  if ($isGit) {
    $r = Invoke-Tk @("--raw", "git", "status")
    if ($r.AllText -notmatch '## Token Savings') { Pass "compress" "--raw passthrough (no banner)" "" $r.Ms } else { Fail "compress" "--raw passthrough" "compressed unexpectedly" $r.Ms }
  }

  # ╔══ PHASE 4: Boundary conditions (real fixtures) ══╗
  Section "Boundary conditions"
  # B1 non-git dir -> "Not a git repository"
  $nonGit = Join-Path $TmpRoot "nongit"; New-Item -ItemType Directory -Path $nonGit -Force | Out-Null
  Push-Location $nonGit
  try {
    $r = Invoke-Tk @("git", "status")
    if ($r.AllText -match 'Not a git repository|not a git repository') { Pass "boundary" "non-git dir -> clear error" "" $r.Ms } else { Warn "boundary" "non-git dir" "got: $($r.AllText.Trim().Substring(0,[math]::Min(60,$r.AllText.Trim().Length)))" $r.Ms }
  } finally { Pop-Location }

  if (Test-Cmd git) {
    # B2 empty git repo (no commits)
    $emptyRepo = Join-Path $TmpRoot "empty"; New-Item -ItemType Directory -Path $emptyRepo -Force | Out-Null
    Push-Location $emptyRepo
    try {
      & git init -q; & git config user.email a@a; & git config user.name a
      $r = Invoke-Tk @("git", "status"); if ($r.ExitCode -eq 0) { Pass "boundary" "empty repo: git status" "" $r.Ms } else { Fail "boundary" "empty repo: git status" "exit=$($r.ExitCode)" $r.Ms }
      $r = Invoke-Tk @("git", "log"); Info "boundary" "empty repo: git log" "exit=$($r.ExitCode) (no commits)" $r.Ms
    } finally { Pop-Location }

    # B3 untracked-directory collapse (git default) + -uall expansion
    $churn = Join-Path $TmpRoot "churn"; New-Item -ItemType Directory -Path $churn -Force | Out-Null
    Push-Location $churn
    try {
      & git init -q; & git config user.email a@a; & git config user.name a
      Set-Content -LiteralPath "tracked.txt" -Value "a"; & git add -A; & git commit -qm init
      New-Item -ItemType Directory -Path "newdir" -Force | Out-Null
      Set-Content -LiteralPath "newdir/one.txt" -Value 1; Set-Content -LiteralPath "newdir/two.txt" -Value 2
      $r = Invoke-Tk @("git", "status")
      if ($r.AllText -match '\?\?\s+newdir/' -and $r.AllText -notmatch 'newdir/one\.txt') { Pass "boundary" "untracked dir collapses to dir/" "" $r.Ms } else { Fail "boundary" "untracked dir collapse" "expected '?? newdir/' without files" $r.Ms }
      $r = Invoke-Tk @("git", "status", "-uall")
      if ($r.AllText -match 'newdir/one\.txt') { Pass "boundary" "-uall expands dir (passthrough)" "" $r.Ms } else { Warn "boundary" "-uall expands dir" "" $r.Ms }
    } finally { Pop-Location }

    # B4 non-ASCII / unicode content + filename round-trip (no mojibake)
    $uni = Join-Path $TmpRoot "unicode"; New-Item -ItemType Directory -Path $uni -Force | Out-Null
    Push-Location $uni
    try {
      & git init -q; & git config user.email a@a; & git config user.name a
      $needle = "项目令牌中文😀"
      Set-Content -LiteralPath "中文文件.txt" -Value "marker $needle here" -Encoding UTF8
      if (Test-Cmd rg) {
        $r = Invoke-Tk @("rg", "marker", ".")
        if ($r.AllText -match [regex]::Escape($needle)) { Pass "boundary" "unicode content survives (rg)" "" $r.Ms } else { Warn "boundary" "unicode content (rg)" "needle not found verbatim — possible mojibake" $r.Ms }
      } else { Skip "boundary" "unicode content (rg)" "rg absent" }
      $r = Invoke-Tk @("read", "中文文件.txt")
      if ($r.AllText -match [regex]::Escape($needle)) { Pass "boundary" "unicode content survives (read)" "" $r.Ms } else { Warn "boundary" "unicode content (read)" "needle not found verbatim" $r.Ms }
    } finally { Pop-Location }

    # B5 huge output is capped, fast, no crash
    $big = Join-Path $TmpRoot "big.txt"
    Set-Content -LiteralPath $big -Value ((1..20000 | ForEach-Object { "line $_ import token killer sample content" }) -join "`n")
    $r = Invoke-Tk @("read", "--max-lines", "200", $big)
    $lc = ($r.Stdout -split "`n").Count
    if ($r.ExitCode -eq 0 -and $lc -le 400) { Pass "boundary" "huge file read --max-lines 200 capped" "out~${lc} lines" $r.Ms } else { Warn "boundary" "huge file read cap" "out~${lc} lines exit=$($r.ExitCode)" $r.Ms }
  }

  # B6 failing command preserves exit code + stderr
  $r = Invoke-Tk @("git", "nosuchsubcmd-xyz")
  if ($r.ExitCode -ne 0) { Pass "boundary" "failing cmd preserves nonzero exit" "exit=$($r.ExitCode)" $r.Ms } else { Fail "boundary" "failing cmd exit" "expected nonzero, got 0" $r.Ms }

  # B7 unknown/unavailable program -> no fork-bomb, bounded
  $r = Invoke-Tk @("tk-definitely-not-a-real-binary-xyz", "arg") -Tmo 15
  if ($r.TimedOut) { Fail "boundary" "unknown binary no fork-bomb" "TIMED OUT (possible loop!)" $r.Ms } else { Pass "boundary" "unknown binary bounded (no fork-bomb)" "exit=$($r.ExitCode)" $r.Ms }

  # B8 path with spaces
  if (Test-Cmd git) {
    $spaced = Join-Path $TmpRoot "dir with spaces"; New-Item -ItemType Directory -Path $spaced -Force | Out-Null
    Push-Location $spaced
    try {
      & git init -q; & git config user.email a@a; & git config user.name a
      $r = Invoke-Tk @("git", "status")
      if ($r.ExitCode -eq 0) { Pass "boundary" "path with spaces" "" $r.Ms } else { Fail "boundary" "path with spaces" "exit=$($r.ExitCode)" $r.Ms }
    } finally { Pop-Location }
  }

  # B9 destructive-guard: `tk uninstall` must fail closed on unrecognised input.
  # `--help` prints usage and tears nothing down; an unknown flag is REFUSED (exit!=0)
  # rather than falling through into a real uninstall. Safe to exercise for real now.
  # Teardown prints per-tier lines ("instruction injection: removed"); usage never
  # mentions "instruction injection", so its absence proves nothing was torn down.
  $r = Invoke-Tk @("uninstall", "--help")
  if ($r.ExitCode -eq 0 -and $r.AllText -match 'tk uninstall' -and $r.AllText -notmatch 'instruction injection') {
    Pass "boundary" "uninstall --help prints usage (no teardown)" "" $r.Ms
  } else { Warn "boundary" "uninstall --help" "exit=$($r.ExitCode) — expected usage, no teardown" $r.Ms }
  $r = Invoke-Tk @("uninstall", "--tk-bogus-flag-xyz")
  if ($r.ExitCode -ne 0 -and $r.AllText -match 'unknown flag|Refusing') {
    Pass "boundary" "uninstall refuses unknown flag (fail closed)" "exit=$($r.ExitCode)" $r.Ms
  } else { Warn "boundary" "uninstall unknown flag" "exit=$($r.ExitCode) — expected refusal, got teardown?" $r.Ms }

  # ╔══ PHASE 5: Fail-safe / resilience ══╗
  Section "Fail-safe"
  # TK_DEBUG trace goes to stderr; stdout stays clean compressed output.
  if ($isGit) {
    $r = Invoke-Tk @("git", "status") -Env @{ TK_DEBUG = "1" }
    if ($r.Stderr.Trim().Length -gt 0) { Pass "failsafe" "TK_DEBUG=1 traces to stderr" "" $r.Ms } else { Warn "failsafe" "TK_DEBUG=1 trace" "no stderr trace seen" $r.Ms }
  }
  # Corrupt config -> real command still runs (fail-open).
  $cfgRes = Invoke-Tk @("config", "path"); $cfgPath = $cfgRes.Stdout.Trim()
  if ($cfgPath -and (Test-Path -LiteralPath $cfgPath)) {
    $bak = "$cfgPath.acc.bak"; Copy-Item -LiteralPath $cfgPath -Destination $bak -Force
    try {
      Set-Content -LiteralPath $cfgPath -Value "{ this is : not valid json ,,," -Encoding UTF8
      $r = Invoke-Tk @("git", "status")
      if ($r.ExitCode -eq 0 -or $r.AllText.Trim().Length -gt 0) { Pass "failsafe" "corrupt config -> real cmd still runs" "" $r.Ms } else { Fail "failsafe" "corrupt config fail-open" "exit=$($r.ExitCode)" $r.Ms }
    } finally { Move-Item -LiteralPath $bak -Destination $cfgPath -Force }
  } else { Skip "failsafe" "corrupt config fail-open" "no config file" }

  # ╔══ PHASE 6: Performance ══╗
  if (-not $SkipPerf) {
    Section "Performance ($PerfIterations samples; p50/p95 ms)"
    function Measure-Many { param([scriptblock]$Action, [int]$N) $v = @(); for ($i = 0; $i -lt $N; $i++) { $v += (& $Action) } ; , $v }
    # tk --version cold-ish (first) vs warm
    $coldVer = (Invoke-Tk @("--version")).Ms
    $verMs = Measure-Many { (Invoke-Tk @("--version")).Ms } $PerfIterations
    Info "perf" "tk --version startup" ("cold={0:N0}ms p50={1:N0} p95={2:N0}" -f $coldVer, (Get-Percentile $verMs 50), (Get-Percentile $verMs 95)) (Get-Percentile $verMs 50)
    if ($isGit) {
      $tkMs = Measure-Many { (Invoke-Tk @("git", "status")).Ms } $PerfIterations
      $rawMs = Measure-Many { (Start-Proc -File (Get-Command git).Source -PArgs @("status", "--porcelain")).Ms } $PerfIterations
      $tk50 = Get-Percentile $tkMs 50; $raw50 = Get-Percentile $rawMs 50
      Info "perf" "tk git status vs raw" ("tk p50={0:N0}ms  raw p50={1:N0}ms  overhead={2:N0}ms (tk spawns 2x: porcelain+human)" -f $tk50, $raw50, ($tk50 - $raw50)) $tk50
      # Large compression wall-time + savings
      $r = Invoke-Tk @("--stats", "git", "log", "-p", "-100")
      $pct = if ($r.AllText -match 'Saved:.*\(([0-9.]+)%\)') { $Matches[1] } else { "0" }
      Info "perf" "git log -p -100 compress" ("{0:N0}ms  saved={1}%" -f $r.Ms, $pct) $r.Ms
    }
  } else { Skip "perf" "performance phase" "-SkipPerf" }

  # ╔══ PHASE 7: Shim / PATH interception (Windows-relevant) ══╗
  Section "Shim / PATH"
  $r = Invoke-Tk @("shim", "status")
  Info "shim" "tk shim status" (($r.AllText -split "`n" | Select-Object -First 1)) $r.Ms
  if ($IsWindows) {
    $shimDir = Join-Path $env:USERPROFILE ".token-killer/shim"
    if (Test-Path -LiteralPath $shimDir) {
      $probePath = "$shimDir;$env:PATH"
      $where = & cmd.exe /c "set PATH=$probePath&& where git" 2>&1 | Out-String
      if ($where -match [regex]::Escape($shimDir)) { Pass "shim" "where git resolves through shim (PATH prepend)" $where.Trim() } else { Warn "shim" "where git through shim" "got: $($where.Trim())" }
    } else { Skip "shim" "where git through shim" "shim not installed (run with lifecycle)" }
  } else { Skip "shim" "PATHEXT / where git" "non-Windows" }

  # ╔══ PHASE 8: Install / uninstall E2E (mutating; restores prior state) ══╗
  if (-not $SkipLifecycle) {
    Section "Lifecycle E2E — install / status / idempotency / uninstall"
    $vscSettings = if ($IsWindows) { Join-Path $env:APPDATA "Code/User/settings.json" } else { $null }
    $vscBak = $null
    if ($vscSettings -and (Test-Path -LiteralPath $vscSettings)) { $vscBak = "$vscSettings.acc.bak"; Copy-Item -LiteralPath $vscSettings -Destination $vscBak -Force }
    # install vscode (shim primary + hook additive)
    $r = Invoke-Tk @("install", "--host", "vscode")
    if ($r.ExitCode -eq 0 -and $r.AllText -match 'Active tier') { Pass "lifecycle" "install --host vscode" (($r.AllText -split "`n" | Where-Object { $_ -match 'Active tier' })) $r.Ms } else { Fail "lifecycle" "install --host vscode" "exit=$($r.ExitCode)" $r.Ms }
    $r = Invoke-Tk @("status"); if ($r.AllText -match 'installed') { Pass "lifecycle" "status after install" "" $r.Ms } else { Warn "lifecycle" "status after install" "" $r.Ms }
    # idempotency
    $r = Invoke-Tk @("install", "--host", "vscode"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "install idempotent (2nd run)" "" $r.Ms } else { Fail "lifecycle" "install idempotent" "exit=$($r.ExitCode)" $r.Ms }
    if ($IsWindows) {
      $shimDir = Join-Path $env:USERPROFILE ".token-killer/shim"
      if (Test-Path -LiteralPath (Join-Path $shimDir "git.cmd")) { Pass "lifecycle" "shim git.cmd written" } else { Fail "lifecycle" "shim git.cmd written" "missing" }
      if ($vscSettings -and (Test-Path -LiteralPath $vscSettings) -and ((Get-Content -LiteralPath $vscSettings -Raw) -match 'TK_SHIM_DIR')) { Pass "lifecycle" "VS Code settings patched (TK_SHIM_DIR)" } else { Warn "lifecycle" "VS Code settings patched" "TK_SHIM_DIR not found" }
    }
    # copilot-cli host
    $r = Invoke-Tk @("install", "--host", "copilot-cli"); if ($r.ExitCode -eq 0 -and $r.AllText -match 'Active tier: hook') { Pass "lifecycle" "install --host copilot-cli" "" $r.Ms } else { Fail "lifecycle" "install --host copilot-cli" "exit=$($r.ExitCode)" $r.Ms }
    # claude-code (opt-in only)
    if ($IncludeClaudeCode) {
      $r = Invoke-Tk @("install", "--host", "claude-code"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "install --host claude-code" "" $r.Ms } else { Fail "lifecycle" "install --host claude-code" "exit=$($r.ExitCode)" $r.Ms }
    } else { Skip "lifecycle" "install --host claude-code" "-IncludeClaudeCode off" }
    # uninstall
    $r = Invoke-Tk @("uninstall", "--dry-run"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "uninstall --dry-run" "" $r.Ms } else { Warn "lifecycle" "uninstall --dry-run" "exit=$($r.ExitCode)" $r.Ms }
    $r = Invoke-Tk @("uninstall"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "uninstall" "" $r.Ms } else { Fail "lifecycle" "uninstall" "exit=$($r.ExitCode)" $r.Ms }
    if ($IsWindows) {
      $shimDir = Join-Path $env:USERPROFILE ".token-killer/shim"
      if (-not (Test-Path -LiteralPath $shimDir)) { Pass "lifecycle" "shim removed after uninstall" } else { Warn "lifecycle" "shim removed" "still present" }
    }
    # restore VS Code settings + prior install host
    if ($vscBak) { Move-Item -LiteralPath $vscBak -Destination $vscSettings -Force }
    if ($priorHost -and $priorHost -ne "(none)") {
      $r = Invoke-Tk @("install", "--host", $priorHost)
      if ($r.ExitCode -eq 0) { Pass "lifecycle" "restore prior install ($priorHost)" "" $r.Ms } else { Warn "lifecycle" "restore prior install ($priorHost)" "exit=$($r.ExitCode) — re-run: tk install --host $priorHost" $r.Ms }
    }
  } else { Skip "lifecycle" "install/uninstall E2E" "-SkipLifecycle" }

  # ╔══ PHASE 9: Tier-0 routing — manual harness (+ optional Copilot CLI E2E) ══╗
  Section "Tier-0 — does the agent route through tk?"
  $histBefore = (Invoke-Tk @("gain", "--history")).AllText
  $beforeLines = ($histBefore -split "`n").Count
  if ($CopilotCliE2E -and (Test-Cmd "copilot")) {
    $cp = Start-Proc -File (Get-Command copilot).Source -PArgs @("-p", "run a single command: git status") -Tmo 120
    Start-Sleep -Seconds 1
    $histAfter = (Invoke-Tk @("gain", "--history")).AllText
    if (($histAfter -split "`n").Count -gt $beforeLines) { Pass "tier0" "Copilot CLI routed through tk (gain history grew)" "" $cp.Ms } else { Warn "tier0" "Copilot CLI routing" "no new gain row — hook may not have fired" $cp.Ms }
  } else {
    Skip "tier0" "Copilot CLI E2E" "-CopilotCliE2E off or copilot not on PATH"
  }
  Info "tier0" "VS Code + Copilot agent (MANUAL)" "baseline gain rows=$beforeLines — see report for steps"

} finally {
  Pop-Location
  Remove-Item -LiteralPath $TmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# ── Summary + report ────────────────────────────────────────────────
$pass = CountBy $script:Results "PASS"
$fail = CountBy $script:Results "FAIL"
$warn = CountBy $script:Results "WARN"
$skip = CountBy $script:Results "SKIP"
$info = CountBy $script:Results "INFO"

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ("Results: {0} pass · {1} fail · {2} warn · {3} skip · {4} info" -f $pass, $fail, $warn, $skip, $info) -ForegroundColor White
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor White

$md = [System.Collections.Generic.List[string]]::new()
function L([string]$s = "") { $md.Add($s) }
L "# tk Real-Machine Acceptance Report"
L ""
L ("**{0} pass · {1} fail · {2} warn · {3} skip · {4} info**" -f $pass, $fail, $warn, $skip, $info)
L ""
L "## Environment"
L ""
L "| Key | Value |"
L "|---|---|"
foreach ($k in $EnvInfo.Keys) { L ("| {0} | {1} |" -f $k, ($EnvInfo[$k] -replace '\|', '\|')) }
L ""
# Per-phase rollup
L "## Summary by phase"
L ""
L "| Phase | pass | fail | warn | skip | info |"
L "|---|--:|--:|--:|--:|--:|"
foreach ($ph in ($script:Results | Select-Object -ExpandProperty Phase -Unique)) {
  $g = $script:Results | Where-Object { $_.Phase -eq $ph }
  L ("| {0} | {1} | {2} | {3} | {4} | {5} |" -f $ph,
    (CountBy $g 'PASS'), (CountBy $g 'FAIL'),
    (CountBy $g 'WARN'), (CountBy $g 'SKIP'),
    (CountBy $g 'INFO'))
}
L ""
# Findings first (actionable)
if ($script:Findings.Count -gt 0) {
  L "## Findings (fail / warn)"
  L ""
  foreach ($f in $script:Findings) { L ("- " + ($f -replace '\|', '\|')) }
  L ""
}
# Detailed table
L "## Detailed results"
L ""
L "| Phase | Status | Case | Detail | ms |"
L "|---|---|---|---|--:|"
foreach ($r in $script:Results) {
  $ms = if ($r.Ms -ge 0) { "{0:N0}" -f $r.Ms } else { "" }
  L ("| {0} | {1} | {2} | {3} | {4} |" -f $r.Phase, $r.Status, ($r.Name -replace '\|', '\|'), ($r.Detail -replace '\|', '\|'), $ms)
}
L ""
# Manual Tier-0 instructions
L "## Manual gate — VS Code + Copilot routing (cannot be scripted)"
L ""
L "A headless script cannot drive the Copilot GUI. Do this once at the keyboard:"
L ""
L "1. ``tk install --host vscode`` then **fully quit & reopen VS Code** (integrated terminal must pick up the new PATH)."
L "2. Open a git repo (>=20 commits) and Copilot Chat in **Agent** mode."
L "3. Prompt: *""Summarize what changed in the last 20 commits.""* (runs ``git log``). Approve the terminal run."
L "4. In the VS Code terminal: ``tk gain --history``."
L "   - **PASS**: the command Copilot ran appears as a row with a savings %. Note whether ``tk status`` tier is **hook** or **shim**."
L "   - **DID NOT ENGAGE**: no new row — Copilot ran outside the integrated-terminal env. A key finding: pivot to the hook tier."
L ""
L "_Generated by scripts/windows-dogfood.ps1_"

Set-Content -LiteralPath $ReportPath -Value ($md -join "`n") -Encoding UTF8
Write-Host "Report: $ReportPath" -ForegroundColor Yellow
if (-not $SkipLifecycle -and $priorHost -and $priorHost -ne "(none)") { Write-Host "Prior install ($priorHost) restored." -ForegroundColor DarkGray }

exit $fail
