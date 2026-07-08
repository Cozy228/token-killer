#Requires -Version 7.0
<#
.SYNOPSIS
  ctx real-machine acceptance — ONE unified suite for an INSTALLED ctx, with NO
  coverage switches. Everything runs every time: functional surface (every command
  + options), hook protocol, compression quality, boundary conditions, fail-safe,
  performance, shim/PATH, stateful round-trips (telemetry / support / optimize apply
  / config init), and the full install/uninstall lifecycle across every host.

.DESCRIPTION
  Design goal: the Markdown report this writes must be SELF-SUFFICIENT. Someone
  holding only the report — no access to the machine — can reproduce, diagnose, and
  fix every failure. To make that true, EVERY non-PASS result captures a full
  dossier: the exact argv invoked, exit code, wall-time, and the child's stderr +
  stdout head (stderr carries the Node stack trace, which carries the file:line).
  The dossiers are emitted as fenced code blocks (newlines/pipes survive) under
  "## Failure dossiers". A one-line `## Acceptance scope` records what was mutated
  and restored, so the report also proves the box was left clean.

  NO -Skip*/-Include*/-Allow* switches. "If we test it, we test it." Safety is not
  achieved by opting out — it is achieved by snapshot + restore. Stateful commands
  (telemetry enable/disable, config init, optimize --apply, install/uninstall for
  every host incl. claude-code) all snapshot the real artifact, exercise it for real,
  and restore the originally-detected state at the end. `ctx support` runs with its
  routing env removed so it only writes a local bundle (no mail/Teams GUI opens).
  Project-scoped optimize --apply is confined to a throwaway temp git repo.

  Cross-platform: Windows-only checks (shim .cmd / PATHEXT / VS Code settings /
  code page / GBK decode / antivirus) gate behind $IsWindows, so the rest also runs
  under pwsh on macOS/Linux for development.

.PARAMETER TargetRepo      Git repo for compression cases (default: this repo, or $env:CTX_ACCEPT_CWD).
.PARAMETER ReportPath      Markdown report path (default: reports\windows-dogfood-<stamp>.md).
.PARAMETER TkCommand       Override how ctx is invoked. e.g. -TkCommand ctx  OR  -TkCommand node,dist\cli.js
.PARAMETER PerfIterations  Samples per perf case (default 7).
.PARAMETER TimeoutSec      Per-command timeout (default 60).

.EXAMPLE
  pwsh -NoProfile -File scripts/windows-dogfood.ps1
.EXAMPLE
  pwsh -NoProfile -File scripts/windows-dogfood.ps1 -TkCommand ctx
#>
[CmdletBinding()]
param(
  [string]   $TargetRepo = "",
  [string]   $ReportPath = "",
  [string[]] $TkCommand = @(),
  [int]      $PerfIterations = 7,
  [int]      $TimeoutSec = 60,
  # Heavy commands (inspect / optimize, which scan every host's transcripts) get a
  # GENEROUS ceiling, not the 60s default. 60s killed a healthy-but-slow scan mid-run
  # and reported an opaque exit=124 with empty output — measuring nothing. We keep a
  # ceiling (a TRUE hang must still terminate the suite) but raise it so a legitimately
  # slow scan completes and we learn its real wall-time. Paired with CTX_PROGRESS=1 so
  # the dossier shows HOW FAR the scan got (file-count-bound vs one-huge-file-bound).
  [int]      $HeavyTimeoutSec = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:TimeoutSec = $TimeoutSec
$script:HeavyTimeoutSec = $HeavyTimeoutSec
# Env that forces inspect/optimize to stream progress to STDERR even though the harness
# pipes stdio (non-TTY). Captured into the dossier so a slow run is observable.
$script:HeavyEnv = @{ CTX_PROGRESS = "1" }

# ── Result model + failure dossiers ─────────────────────────────────
# The whole point of this suite: a FAIL/WARN is useless to a remote fixer unless it
# carries the payload that explains it. So every non-PASS auto-captures the last
# command execution (argv/exit/stderr/stdout) into a dossier, keyed Dnn, referenced
# from the findings list, the detailed table, and a dedicated fenced section.
$script:Results    = [System.Collections.Generic.List[object]]::new()
$script:Findings   = [System.Collections.Generic.List[string]]::new()
$script:Dossiers   = [System.Collections.Generic.List[object]]::new()
$script:ScopeNotes = [System.Collections.Generic.List[string]]::new()   # what was mutated + restored
$script:LastResult = $null   # set by Start-Proc; the best available context for a nearby assertion

function Record {
  param([string]$Phase, [string]$Name, [string]$Status, [string]$Detail = "", [double]$Ms = -1, $R = $null)
  $did = ""
  if ($Status -eq "FAIL" -or $Status -eq "WARN") {
    $cap = if ($R) { $R } else { $script:LastResult }
    if ($cap) {
      $did = "D{0:D2}" -f ($script:Dossiers.Count + 1)
      $script:Dossiers.Add([PSCustomObject]@{
          Id = $did; Phase = $Phase; Name = $Name; Status = $Status; Detail = $Detail
          File = $cap.File; Argv = $cap.Argv; Exit = $cap.ExitCode; Ms = $cap.Ms
          TimedOut = $cap.TimedOut; Stdout = $cap.Stdout; Stderr = $cap.Stderr
        })
    }
    $ref = if ($did) { " [$did]" } else { "" }
    $script:Findings.Add("$Status [$Phase] $Name$ref — $Detail")
  }
  $script:Results.Add([PSCustomObject]@{ Phase = $Phase; Name = $Name; Status = $Status; Detail = $Detail; Ms = $Ms; Dossier = $did })
  $color = switch ($Status) {
    "PASS" { "Green" } "FAIL" { "Red" } "WARN" { "Yellow" } "SKIP" { "DarkGray" } default { "Gray" }
  }
  $msText = if ($Ms -ge 0) { (" {0,6:N0}ms" -f $Ms) } else { "        " }
  $d = if ($Detail) { "  $Detail" } else { "" }
  $dref = if ($did) { " [$did]" } else { "" }
  Write-Host ("  {0,-4}{1} {2}{3}{4}" -f $Status, $msText, $Name, $d, $dref) -ForegroundColor $color
}
function Pass { param($P, $N, $D = "", $Ms = -1) Record $P $N "PASS" $D $Ms }
function Fail { param($P, $N, $D = "", $Ms = -1, $R = $null) Record $P $N "FAIL" $D $Ms $R }
function Warn { param($P, $N, $D = "", $Ms = -1, $R = $null) Record $P $N "WARN" $D $Ms $R }
function Skip { param($P, $N, $D = "") Record $P $N "SKIP" $D }
function Info { param($P, $N, $D = "", $Ms = -1) Record $P $N "INFO" $D $Ms }
function Section([string]$Title) { Write-Host ""; Write-Host "── $Title ──" -ForegroundColor Cyan }
function Note([string]$s) { $script:ScopeNotes.Add($s) }
# @() forces an array so .Count is valid even for 0/1 matches under StrictMode.
function CountBy($items, $st) { @($items | Where-Object { $_.Status -eq $st }).Count }

# Pull the first line matching $Label out of captured output and return the path
# after "<label>: ". Returns "" when the line is absent.
#
# Why a helper and not an inline one-liner: `(... | Select-Object -First 1) -replace`
# is NOT null-safe. When Where-Object matches nothing, the sub-pipeline yields an
# EMPTY ARRAY, and `-replace` maps over arrays element-wise, so it returns an empty
# array too — then `.Trim()` throws "[System.Object[]] does not contain a method
# named 'Trim'", an UNCAUGHT exception that aborts the whole suite. That is exactly
# what `ctx inspect --project` (no project-scoped sources → no HTML report emitted)
# tripped. @() + cast-to-string here keeps the absent case a clean "" so callers
# fall into their intended "no path emitted" Warn branch.
function Get-LabeledPath {
  param([string]$AllText, [string]$Label)
  $line = @($AllText -split "`n" | Where-Object { $_ -match $Label }) | Select-Object -First 1
  if (-not $line) { return "" }
  return ([string]$line -replace ".*${Label}\s*", "").Trim()
}

# ── Process runner (async reads avoid large-output deadlock; hard timeout) ──
function Start-Proc {
  param(
    [string]$File, [string[]]$PArgs, [hashtable]$Env, [string[]]$UnsetEnv,
    [string]$Stdin, [bool]$HasStdin = $false, [int]$Tmo = -1,
    # -Stream tees the child's STDERR to this console LINE BY LINE as it arrives, while
    # still buffering it for the dossier. Heavy commands (inspect/optimize) set this so
    # a slow scan shows its live "Scanning N transcripts… / Scanned M events…" progress
    # (CTX_PROGRESS milestones) instead of a frozen console — and so a TRUE timeout still
    # captures how far the scan reached. Off by default: the perf-measurement calls need
    # a clean console and precise timing, so they keep the silent buffered path.
    [switch]$Stream
  )
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
  # ctx emits UTF-8 (as do all UTF-8-aware agents that consume it). Without an explicit
  # encoding, .NET decodes the child's stdout/stdin using the console code page — cp936
  # on this GBK box — which mojibakes Chinese/emoji output (false "needle not found"
  # warns). Pin UTF-8 so the harness reads what a real agent reads. (ctx's OWN cp936
  # decode happens one layer down, on the bytes IT reads from the tool it wraps.)
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  $psi.StandardOutputEncoding = $utf8
  $psi.StandardErrorEncoding = $utf8
  if ($HasStdin) { $psi.StandardInputEncoding = $utf8 }
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  if ($Env) { foreach ($k in $Env.Keys) { $psi.Environment[$k] = [string]$Env[$k] } }
  # Remove inherited keys so a box-level env var can't change a command's behaviour
  # (e.g. CTX_SUPPORT_EMAIL would route `ctx support` to a mail GUI instead of a file).
  if ($UnsetEnv) { foreach ($k in $UnsetEnv) { if ($psi.Environment.ContainsKey($k)) { [void]$psi.Environment.Remove($k) } } }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  # A spawn failure (bad ctx resolution, ENOENT, .ps1/.cmd that can't be exec'd with
  # UseShellExecute=$false) must become a normal FAIL dossier — NOT an uncaught throw
  # that aborts the suite before the report is written. Return exit 127 with the reason.
  try { $p = [System.Diagnostics.Process]::Start($psi) }
  catch {
    $sw.Stop()
    $res = [PSCustomObject]@{ ExitCode = 127; Stdout = ""; Stderr = "spawn failed: $($_.Exception.Message)"; AllText = "spawn failed: $($_.Exception.Message)"; Ms = $sw.Elapsed.TotalMilliseconds; TimedOut = $false; File = $File; Argv = $PArgs }
    $script:LastResult = $res
    return $res
  }
  if ($HasStdin) { $p.StandardInput.Write($Stdin); $p.StandardInput.Close() }
  $op = $p.StandardOutput.ReadToEndAsync()
  # STDERR: stream-and-buffer when -Stream, else the silent buffered read. The streamed
  # path uses an ErrorDataReceived event whose handler appends to a StringBuilder passed
  # as -MessageData AND echoes the line to this console, so progress is visible live.
  $errSb = $null; $errReg = $null; $ep = $null
  if ($Stream) {
    $errSb = [System.Text.StringBuilder]::new()
    $errReg = Register-ObjectEvent -InputObject $p -EventName ErrorDataReceived -MessageData $errSb -Action {
      if ($null -ne $EventArgs.Data) {
        [void]$Event.MessageData.AppendLine($EventArgs.Data)
        [Console]::Error.WriteLine($EventArgs.Data)
      }
    }
    $p.BeginErrorReadLine()
  }
  else {
    $ep = $p.StandardError.ReadToEndAsync()
  }
  if (-not $p.WaitForExit($Tmo * 1000)) {
    try { $p.Kill($true) } catch {}
    if ($errReg) { try { Unregister-Event -SourceIdentifier $errReg.Name -ErrorAction SilentlyContinue } catch {} }
    $sw.Stop()
    # On a streamed timeout the buffer holds the progress milestones reached before the
    # kill — keep them in the dossier (how far it got), prefixed by the TIMEOUT marker.
    $partial = if ($errSb) { $errSb.ToString() } else { "" }
    $stderr = if ($partial) { "TIMEOUT ${Tmo}s`n$partial" } else { "TIMEOUT ${Tmo}s" }
    $res = [PSCustomObject]@{ ExitCode = 124; Stdout = ""; Stderr = $stderr; AllText = $stderr; Ms = $sw.Elapsed.TotalMilliseconds; TimedOut = $true; File = $File; Argv = $PArgs }
    $script:LastResult = $res
    return $res
  }
  # Child exited within the ceiling: drain the async readers, then stop the live tee.
  $p.WaitForExit()
  $sw.Stop()
  $out = $op.GetAwaiter().GetResult()
  if ($Stream) {
    Start-Sleep -Milliseconds 50   # let the last ErrorDataReceived events flush
    if ($errReg) { try { Unregister-Event -SourceIdentifier $errReg.Name -ErrorAction SilentlyContinue } catch {} }
    $err = $errSb.ToString()
  }
  else {
    $err = $ep.GetAwaiter().GetResult()
  }
  $res = [PSCustomObject]@{ ExitCode = $p.ExitCode; Stdout = $out; Stderr = $err; AllText = "$out$err"; Ms = $sw.Elapsed.TotalMilliseconds; TimedOut = $false; File = $File; Argv = $PArgs }
  $script:LastResult = $res
  $res
}
# Invoke ctx. Redirected stdout = non-TTY, so the compress path engages naturally.
function Invoke-Tk {
  param([string[]]$TkArgs, [hashtable]$Env, [string[]]$UnsetEnv, [string]$Stdin, [int]$Tmo = -1, [switch]$Stream)
  $hasStdin = $PSBoundParameters.ContainsKey('Stdin')
  Start-Proc -File $script:TkBin -PArgs ($script:TkPre + $TkArgs) -Env $Env -UnsetEnv $UnsetEnv -Stdin $Stdin -HasStdin $hasStdin -Tmo $Tmo -Stream:$Stream
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
    if ($maj -ge 20) { return "deferred — uncached compile (Node <22.8)" }
    return "UNSUPPORTED Node <22.18.0"
  } catch { return "unknown" }
}

# ── Resolve ctx + target + report ────────────────────────────────────
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Root = Split-Path -Parent $ScriptDir

# pwsh -File passes `-TkCommand node,dist/cli.js` as ONE token; split it back.
if ($TkCommand.Count -eq 1 -and $TkCommand[0] -match ',') { $TkCommand = @($TkCommand[0] -split ',') }
if ($TkCommand.Count -gt 0) {
  $script:TkBin = $TkCommand[0]
  $script:TkPre = @(if ($TkCommand.Count -gt 1) { $TkCommand[1..($TkCommand.Count - 1)] } else { @() })
} elseif (Test-Path -LiteralPath (Join-Path $Root "dist/cli.js")) {
  # Prefer the repo's built cli — `node` is directly spawnable. A global `ctx` is
  # often a .ps1/.cmd shim that Process.Start (UseShellExecute=$false) cannot exec.
  $script:TkBin = "node"
  $script:TkPre = @((Resolve-Path (Join-Path $Root "dist/cli.js")).Path)
} elseif (Test-Cmd "ctx") {
  $tkSrc = (Get-Command ctx).Source
  switch -regex ($tkSrc) {
    '\.ps1$' { $script:TkBin = "pwsh"; $script:TkPre = @("-NoProfile", "-File", $tkSrc) }
    '\.(cmd|bat)$' { $script:TkBin = $env:ComSpec; $script:TkPre = @("/c", $tkSrc) }
    default { $script:TkBin = $tkSrc; $script:TkPre = @() }
  }
} else {
  Write-Host "ctx not found: install it (pnpm add -g .) or run from a built repo (pnpm build)." -ForegroundColor Red
  exit 2
}
# Absolutize relative cli paths NOW (CWD is still the launch dir) so ctx resolves
# even after the boundary phase runs it from temp fixture dirs.
$script:TkPre = @($script:TkPre | ForEach-Object { if (Test-Path -LiteralPath $_ -PathType Leaf) { (Resolve-Path -LiteralPath $_).Path } else { $_ } })

if (-not $TargetRepo) { $TargetRepo = if ($env:CTX_ACCEPT_CWD) { $env:CTX_ACCEPT_CWD } else { $Root } }
$TargetRepo = (Resolve-Path -LiteralPath $TargetRepo).Path

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $ReportPath) {
  $reportsDir = Join-Path $Root "reports"
  if (-not (Test-Path -LiteralPath $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null }
  $ReportPath = Join-Path $reportsDir "windows-dogfood-$stamp.md"
}
$TmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) "ctx-accept-$stamp"
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
  "ctx invocation"      = "$($script:TkBin) $($script:TkPre -join ' ')"
  "ctx version"         = $tkVer
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
  "copilot"            = if (Test-Cmd copilot) { "yes" } else { "absent" }
  "target repo"        = $TargetRepo
  "prior install host" = if ($priorHost) { $priorHost } else { "(none)" }
}

Write-Host "ctx Real-Machine Acceptance (no switches — everything runs)" -ForegroundColor White
$EnvInfo.GetEnumerator() | ForEach-Object { Write-Host ("  {0,-20} {1}" -f $_.Key, $_.Value) }

Push-Location $TargetRepo
try {
  # ╔══ PHASE 1: Functional surface — every read-only command + key options ══╗
  Section "Functional — version / status / config / telemetry / gain (all views)"
  $r = Invoke-Tk @("--version")
  if ($r.ExitCode -eq 0 -and $r.AllText -match '\d+\.\d+') { Pass "func" "ctx --version" $r.AllText.Trim() $r.Ms } else { Fail "func" "ctx --version" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("--help"); if ($r.ExitCode -eq 0 -and $r.AllText -match 'Commands:') { Pass "func" "ctx --help" "" $r.Ms } else { Fail "func" "ctx --help" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("status"); if ($r.ExitCode -eq 0 -and $r.AllText -match 'host') { Pass "func" "ctx status" "" $r.Ms } else { Fail "func" "ctx status" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("config", "show"); if ($r.ExitCode -eq 0) { Pass "func" "ctx config show" "" $r.Ms } else { Fail "func" "ctx config show" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("config", "path"); if ($r.ExitCode -eq 0) { Pass "func" "ctx config path" $r.Stdout.Trim() $r.Ms } else { Fail "func" "ctx config path" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("telemetry", "status"); if ($r.ExitCode -eq 0) { Pass "func" "ctx telemetry status" "" $r.Ms } else { Fail "func" "ctx telemetry status" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("telemetry", "preview"); if ($r.ExitCode -eq 0) { Pass "func" "ctx telemetry preview" "" $r.Ms } else { Warn "func" "ctx telemetry preview" "exit=$($r.ExitCode)" $r.Ms }
  # gain — every output view must run clean (the report's four口径 live in these).
  $gainViews = @(
    @{ N = "gain --text"; A = @("gain", "--text"); Must = "" },
    @{ N = "gain --json"; A = @("gain", "--json"); Must = "{" },
    @{ N = "gain --csv"; A = @("gain", "--csv"); Must = "" },
    @{ N = "gain --history"; A = @("gain", "--history"); Must = "" },
    @{ N = "gain --daily"; A = @("gain", "--daily"); Must = "" },
    @{ N = "gain --weekly"; A = @("gain", "--weekly"); Must = "" },
    @{ N = "gain --monthly"; A = @("gain", "--monthly"); Must = "" },
    @{ N = "gain --all --graph"; A = @("gain", "--all", "--graph"); Must = "" },
    @{ N = "gain --failures"; A = @("gain", "--failures"); Must = "" },
    @{ N = "gain --quota"; A = @("gain", "--quota"); Must = "" },
    @{ N = "gain --user (cross-project aggregate)"; A = @("gain", "--user", "--text"); Must = "" }
  )
  foreach ($c in $gainViews) {
    $r = Invoke-Tk $c.A
    $ok = $r.ExitCode -eq 0 -and ($c.Must -eq "" -or $r.AllText.Contains($c.Must))
    if ($ok) { Pass "func" $c.N "" $r.Ms } else { Fail "func" $c.N "exit=$($r.ExitCode)" $r.Ms }
  }
  # Default `ctx gain` opens an HTML report whose scope line must NAME the project
  # ("Covers contexa"), not the ambiguous "this project". The terminal views above
  # never exercise that line — this is the regression guard for it. HTML is client-
  # rendered, so assert the embedded data carries the project name; CTX_NO_OPEN keeps the
  # browser shut. Same check for inspect --project (skips cleanly when it has no sources).
  function Test-HtmlScope {
    param([string]$N, [string[]]$Cmd, [string]$ProjName, [int]$Tmo = -1, [switch]$Stream)
    # CTX_PROGRESS is harmless for the light `gain` path and lets the heavy `inspect
    # --project` path stream progress; -Tmo lets the caller grant the heavy ceiling;
    # -Stream tees that progress to the console live (heavy inspect only).
    $r = Invoke-Tk $Cmd -Env @{ CTX_NO_OPEN = "1"; CTX_PROGRESS = "1" } -Tmo $Tmo -Stream:$Stream
    $htmlPath = Get-LabeledPath $r.AllText 'HTML report:'
    if ($htmlPath -and (Test-Path -LiteralPath $htmlPath)) {
      $body = Get-Content -LiteralPath $htmlPath -Raw
      if ($body -match ('"project"\s*:\s*"' + [regex]::Escape($ProjName) + '"')) { Pass "func" $N "Covers $ProjName" $r.Ms }
      elseif ($body -match '"project"\s*:\s*(null|"")' -or $body -notmatch '"project"') { Warn "func" $N "scope falls back to 'this project' — project name not set in report data" $r.Ms }
      else { Warn "func" $N "project name present but not '$ProjName'" $r.Ms }
      Remove-Item -LiteralPath $htmlPath -Force -ErrorAction SilentlyContinue
    } else { Warn "func" $N "no HTML report path emitted (exit=$($r.ExitCode))" $r.Ms }
  }
  $projName = Split-Path -Leaf $TargetRepo
  Test-HtmlScope "gain HTML names the project (not 'this project')" @("gain") $projName

  Section "Functional — inspect (one cold scan warms a cross-run cache; the rest reuse it)"
  # inspect is the heaviest command (it scans every host's transcripts). It now caches
  # each file's extracted contribution under ~/.contexa/inspect-cache, keyed by
  # (path,mtime,size) — so the FIRST scan pays the full parse, and every later inspect /
  # optimize-triggered scan / --fail-on re-parses only NEW or CHANGED files. We exploit
  # that: run ONE cold scan to warm the cache, prove a second scan is much faster, then
  # let all the remaining inspect/optimize checks ride the warm cache. -Stream tees the
  # live CTX_PROGRESS milestones to this console so a slow cold scan is never a frozen
  # screen. exit 2 = "no analyzable source here" (an empty box, Info not Fail); exit 1
  # is a real error -> Fail.
  function Test-Inspect {
    param([string]$N, [string[]]$A, [string]$Must = "", [switch]$Stream)
    $r = Invoke-Tk (@("inspect") + $A) -Env $script:HeavyEnv -Tmo $script:HeavyTimeoutSec -Stream:$Stream
    if ($r.TimedOut) { Fail "func" $N "still scanning at ${script:HeavyTimeoutSec}s ceiling — NOT a crash; see dossier stderr for how far it reached (file-count vs single huge file)" $r.Ms }
    elseif ($r.ExitCode -eq 2) { Info "func" $N "no analyzable sources here (exit 2; populated host would run it)" $r.Ms }
    elseif ($r.ExitCode -ne 0) { Fail "func" $N "exit=$($r.ExitCode)" $r.Ms }
    elseif ($Must -eq "" -or $r.AllText -match [regex]::Escape($Must)) { Pass "func" $N "" $r.Ms }
    # Clean exit, but the asserted substring is absent. This is an assertion gap, NOT a
    # crash — reporting "exit=0" here reads as a command failure and contradicts any
    # artifact-based PASS for the same run. Say what actually went wrong instead.
    else { Fail "func" $N "exit=0 but expected output '$Must' not found" $r.Ms }
    return $r
  }

  # 0) COLD warm-up: clear the scan cache, then run the canonical machine render so this
  #    invocation pays the full parse and populates the cache. Streamed so its progress
  #    is visible live. This is the only scan expected to be slow on a populated box.
  $cacheDir = Join-Path (Join-Path $HOME ".contexa") "inspect-cache"
  if (Test-Path -LiteralPath $cacheDir) { Remove-Item -LiteralPath $cacheDir -Recurse -Force -ErrorAction SilentlyContinue }
  $cold = Test-Inspect "inspect --json (cold scan, warms cache)" @("--json") '"schemaVersion"' -Stream
  # 1) WARM re-run: identical scan, now served from the cache. On a populated box this
  #    should be dramatically faster; assert the cache actually bites (warm < cold, with
  #    a margin). On an empty box (exit 2, ~0 work) the times are both tiny — skip the
  #    ratio assertion there and just record it.
  $warm = Test-Inspect "inspect --json (warm scan, cache hit)" @("--json") '"schemaVersion"'
  if ($cold.ExitCode -eq 0 -and $warm.ExitCode -eq 0) {
    if ($cold.Ms -ge 500 -and $warm.Ms -lt $cold.Ms) {
      $pct = [math]::Round((1 - $warm.Ms / $cold.Ms) * 100, 0)
      Pass "perf" "inspect scan cache warms" ("cold {0:N0}ms -> warm {1:N0}ms ({2}% faster)" -f $cold.Ms, $warm.Ms, $pct)
    }
    elseif ($cold.Ms -lt 500) {
      Info "perf" "inspect scan cache warms" ("corpus too small to time meaningfully (cold {0:N0}ms)" -f $cold.Ms)
    }
    else {
      Warn "perf" "inspect scan cache warms" ("warm not faster than cold (cold {0:N0}ms, warm {1:N0}ms) — cache may not be biting" -f $cold.Ms, $warm.Ms)
    }
  }
  # 1b) WINDOWED cold->warm: --since took the live (uncached) path before issue #38; it now
  #     reuses the per-event cache. Clear, run cold (populate), run warm (slice cached
  #     events), and assert the windowed path warms too — the previously cache-blind scan.
  if (Test-Path -LiteralPath $cacheDir) { Remove-Item -LiteralPath $cacheDir -Recurse -Force -ErrorAction SilentlyContinue }
  $sinceCold = Test-Inspect "inspect --since 7d --json (cold, warms event cache)" @("--since", "7d", "--json") '"schemaVersion"' -Stream
  $sinceWarm = Test-Inspect "inspect --since 7d --json (warm, event cache hit)" @("--since", "7d", "--json") '"schemaVersion"'
  if ($sinceCold.ExitCode -eq 0 -and $sinceWarm.ExitCode -eq 0) {
    if ($sinceCold.Ms -ge 500 -and $sinceWarm.Ms -lt $sinceCold.Ms) {
      $pct = [math]::Round((1 - $sinceWarm.Ms / $sinceCold.Ms) * 100, 0)
      Pass "perf" "inspect --since event cache warms" ("cold {0:N0}ms -> warm {1:N0}ms ({2}% faster)" -f $sinceCold.Ms, $sinceWarm.Ms, $pct)
    }
    elseif ($sinceCold.Ms -lt 500) {
      Info "perf" "inspect --since event cache warms" ("corpus too small to time meaningfully (cold {0:N0}ms)" -f $sinceCold.Ms)
    }
    else {
      Warn "perf" "inspect --since event cache warms" ("warm not faster than cold (cold {0:N0}ms, warm {1:N0}ms) — event cache may not be biting" -f $sinceCold.Ms, $sinceWarm.Ms)
    }
  }
  # 2) HTML report: default-scope (no --text/--json) MUST emit an HTML report — the
  #    surface a real user sees. Warm now, so cheap. Asserts the file is actually written
  #    and carries report data; CTX_NO_OPEN keeps the browser shut.
  Test-HtmlScope "inspect --project HTML names the project" @("inspect", "--project") $projName $script:HeavyTimeoutSec -Stream
  # 3) kitchen-sink: every composable scope/advice/render flag in ONE run, plus
  #    --write-advice so its artifacts are verified here. NOTE: --since now reuses the
  #    cross-run per-EVENT cache (issue #38) — the windowed scan slices a cached event
  #    stream instead of re-parsing raw JSON — so on a warm cache this no longer pays the
  #    full parse. (A cold/warm --since timing pair is asserted just above.)
  $ksFlags = @("--project", "--user", "--since", "7d", "--advice", "--min-confidence", "0.5",
    "--min-occurrences", "2", "--surface", "instructions", "--write-advice", "--text")
  # --write-advice intentionally suppresses the report stream (src/inspect/cli.ts), so the
  # "Contexa Inspect" report header never prints under this combo — assert the actual
  # --write-advice contract instead. The dedicated artifact check below validates the files.
  $r = Test-Inspect "inspect (scope+advice+surface+write-advice, one run)" $ksFlags "Wrote advice artifacts:" -Stream
  if ($r.ExitCode -eq 0 -and $r.AllText -match 'Wrote advice artifacts:') {
    $adv = @($r.AllText -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '\.(json|md)$' -and (Test-Path -LiteralPath $_) })
    if ($adv.Count -gt 0) { Pass "func" "inspect --write-advice writes artifacts" "$($adv.Count) file(s)" $r.Ms; $adv | ForEach-Object { Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue } }
    else { Warn "func" "inspect --write-advice" "claimed write but no artifact file found" $r.Ms }
  }
  # 4) --input-type + --session parse path on the cheap (copilot-cli is usually empty).
  Test-Inspect "inspect --input-type copilot-cli --session <id>" @("--input-type", "copilot-cli", "--session", "dogfood-no-such-session", "--text") | Out-Null
  # 5) --fail-on is a CI gate: nonzero is by-design, not a failure. Warm (cache hit).
  $r = Invoke-Tk @("inspect", "--fail-on", "error", "--text") -Env $script:HeavyEnv -Tmo $script:HeavyTimeoutSec
  Info "func" "inspect --fail-on error" "exit=$($r.ExitCode) (nonzero = findings reached threshold, by design)" $r.Ms

  Section "Functional — optimize (preview) / debug (+flags) + privacy scrub"
  # optimize triggers a full inspect when its bucket is absent, so it inherits the
  # scan cost — grant the heavy ceiling + progress here too.
  $r = Invoke-Tk @("optimize", "context", "--project") -Env $script:HeavyEnv -Tmo $script:HeavyTimeoutSec -Stream
  if ($r.ExitCode -eq 0 -and $r.AllText -match 'preview') { Pass "func" "optimize context --project (preview)" "" $r.Ms } elseif ($r.TimedOut) { Fail "func" "optimize context --project" "inspect-triggered scan still running at ${script:HeavyTimeoutSec}s ceiling — see dossier" $r.Ms } else { Fail "func" "optimize context --project" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("optimize", "context", "--user") -Env $script:HeavyEnv -Tmo $script:HeavyTimeoutSec -Stream
  if ($r.ExitCode -eq 0) { Pass "func" "optimize context --user (preview)" "" $r.Ms } else { Warn "func" "optimize context --user" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("optimize", "context", "--project", "--surface", "instructions") -Env $script:HeavyEnv -Tmo $script:HeavyTimeoutSec -Stream
  if ($r.ExitCode -eq 0) { Pass "func" "optimize --surface instructions (preview)" "" $r.Ms } else { Warn "func" "optimize --surface instructions" "exit=$($r.ExitCode)" $r.Ms }
  # debug bundle + privacy: the saved report must NOT leak the literal home path.
  function Test-DebugBundle {
    param([string]$N, [string[]]$Flags)
    $r = Invoke-Tk (@("debug") + $Flags)
    if ($r.ExitCode -eq 0 -and $r.AllText -match 'debug bundle') {
      Pass "func" "$N (writes bundle)" "" $r.Ms
      $dbgPath = Get-LabeledPath $r.AllText 'debug bundle:'
      if ($dbgPath -and (Test-Path -LiteralPath $dbgPath)) {
        $body = Get-Content -LiteralPath $dbgPath -Raw
        $userHome = [Environment]::GetFolderPath('UserProfile')
        if ($body -match [regex]::Escape($userHome)) { Warn "func" "$N scrubs home path" "leaks $userHome" } else { Pass "func" "$N scrubs home path" }
        Remove-Item -LiteralPath $dbgPath -Force -ErrorAction SilentlyContinue
      }
    } elseif ($r.ExitCode -ne 0) { Fail "func" $N "exit=$($r.ExitCode)" $r.Ms }
    # Clean exit but the 'debug bundle' confirmation line is absent — an assertion gap, not
    # a crash. Don't render it as "exit=0" (reads as a command failure).
    else { Fail "func" $N "exit=0 but no 'debug bundle' confirmation in output" $r.Ms }
  }
  Test-DebugBundle "ctx debug" @()
  Test-DebugBundle "ctx debug --full" @("--full")
  Test-DebugBundle "ctx debug --redact" @("--redact")
  # --out <path> must honor the caller-given destination (not the default reports/ dir).
  $dbgOut = Join-Path $TmpRoot "debug-custom-out.md"
  $r = Invoke-Tk @("debug", "--out", $dbgOut)
  if ($r.ExitCode -eq 0 -and (Test-Path -LiteralPath $dbgOut)) {
    Pass "func" "ctx debug --out honors custom path" $dbgOut $r.Ms
    Remove-Item -LiteralPath $dbgOut -Force -ErrorAction SilentlyContinue
  } else { Fail "func" "ctx debug --out" "exit=$($r.ExitCode); file at custom path? $(Test-Path -LiteralPath $dbgOut)" $r.Ms }

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
  if ($r.ExitCode -eq 0 -and $r.Stdout -match '"modifiedArgs"') { Pass "hook" "copilot rewrite -> modifiedArgs" $r.Stdout.Trim() $r.Ms } else { Fail "hook" "copilot rewrite" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("hook", "copilot") -Stdin '{"event":"preToolUse","tool_name":"read_file","tool_input":{"filePath":"node_modules/x/i.js"}}'
  if ($r.ExitCode -eq 0 -and $r.Stdout -match '"permissionDecision"\s*:\s*"deny"') { Pass "hook" "copilot deny node_modules" "" $r.Ms } else { Warn "hook" "copilot deny node_modules" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("hook", "copilot") -Stdin '}{'
  if ($r.ExitCode -eq 0 -and $r.Stdout.Trim().Length -eq 0) { Pass "hook" "copilot fail-open bad json (empty=allow)" "" $r.Ms } else { Fail "hook" "copilot fail-open bad json" "exit=$($r.ExitCode)" $r.Ms }

  Section "Hook — claude stdin protocol"
  $r = Invoke-Tk @("hook", "claude") -Stdin '{"tool_name":"Bash","tool_input":{"command":"git status"}}'
  if ($r.ExitCode -eq 0 -and $r.Stdout -match 'updatedInput' -and $r.Stdout -match 'ctx git status') { Pass "hook" "claude rewrite -> updatedInput" "" $r.Ms } else { Fail "hook" "claude rewrite" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("hook", "claude") -Stdin 'not json'
  if ($r.ExitCode -eq 0) { Pass "hook" "claude fail-open bad json" "" $r.Ms } else { Warn "hook" "claude fail-open bad json" "exit=$($r.ExitCode)" $r.Ms }

  # ╔══ PHASE 3: Compression — quality bars + proxy flags ══╗
  Section "Compression — large output MUST clear the bar"
  $minRaw = if ($env:CTX_ACCEPT_MIN_RAW) { [int]$env:CTX_ACCEPT_MIN_RAW } else { 1500 }
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
    # `git log -30` (no -p) = default block format. ctx drops commit bodies + reformats
    # the header, so savings scale with how verbose the bodies were. A repo with terse
    # one-line commits genuinely can't reach 40% (the prior bar assumed multi-paragraph
    # bodies); 20% is the honest floor that still proves it compresses, not passes raw.
    Test-Savings "git log -30" 20 @("git", "log", "-30")
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

  Section "Compression — proxy flags (--raw / --max-chars / --save-raw / CTX_NO_HISTORY)"
  if ($isGit) {
    # --raw must passthrough verbatim (no stats banner).
    $r = Invoke-Tk @("--raw", "git", "status")
    if ($r.AllText -notmatch '## Token Savings') { Pass "compress" "--raw passthrough (no banner)" "" $r.Ms } else { Fail "compress" "--raw passthrough" "compressed unexpectedly" $r.Ms }
    # --max-chars caps the compressed body.
    $r = Invoke-Tk @("--max-chars", "200", "git", "log", "-50")
    $bodyLen = ($r.Stdout).Length
    if ($r.ExitCode -eq 0 -and $bodyLen -le 1200) { Pass "compress" "--max-chars 200 caps body" "stdout=${bodyLen} chars" $r.Ms } else { Warn "compress" "--max-chars 200" "stdout=${bodyLen} chars (cap not obviously applied)" $r.Ms }
    # --max-lines caps the compressed body by line count.
    $r = Invoke-Tk @("--max-lines", "5", "git", "log", "-50")
    $lineCount = ($r.Stdout -split "`n").Count
    if ($r.ExitCode -eq 0 -and $lineCount -le 60) { Pass "compress" "--max-lines 5 caps body" "stdout=${lineCount} lines" $r.Ms } else { Warn "compress" "--max-lines 5" "stdout=${lineCount} lines (cap not obviously applied)" $r.Ms }
    # --save-raw writes the raw output and discloses its path; --stats reveals it.
    $r = Invoke-Tk @("--stats", "--save-raw", "git", "log", "-5")
    if ($r.AllText -match 'raw output|Raw output|saved raw|\.txt') { Pass "compress" "--save-raw discloses raw path" "" $r.Ms } else { Warn "compress" "--save-raw discloses raw path" "no raw-path disclosure seen" $r.Ms }
    # --no-save-raw is the explicit negation: no raw artifact path should be disclosed.
    $r = Invoke-Tk @("--stats", "--no-save-raw", "git", "log", "-5")
    if ($r.ExitCode -eq 0 -and $r.AllText -notmatch 'saved raw|raw output:') { Pass "compress" "--no-save-raw suppresses raw artifact" "" $r.Ms } else { Warn "compress" "--no-save-raw" "raw-path disclosure seen despite --no-save-raw" $r.Ms }
    # CTX_NO_HISTORY=1 must not append a gain row.
    $before = ((Invoke-Tk @("gain", "--history")).AllText -split "`n").Count
    Invoke-Tk @("git", "status") -Env @{ CTX_NO_HISTORY = "1" } | Out-Null
    $after = ((Invoke-Tk @("gain", "--history")).AllText -split "`n").Count
    if ($after -le $before) { Pass "compress" "CTX_NO_HISTORY=1 skips gain row" "rows $before -> $after" } else { Warn "compress" "CTX_NO_HISTORY=1" "history grew $before -> $after" }
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

    # B4 non-ASCII / unicode content + filename round-trip (UTF-8 source, no mojibake)
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
  $r = Invoke-Tk @("ctx-definitely-not-a-real-binary-xyz", "arg") -Tmo 15
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

  # B9 destructive-guard probe — NON-destructive. We learned (and the dossier proves)
  # that `ctx uninstall` does NOT validate flags: `--help` and unknown flags are ignored
  # and a REAL teardown runs. We must not trigger that here — it would uninstall the
  # tester's ctx mid-suite. So probe with --dry-run (never deletes; only plans) and
  # record the arg-validation gap as a finding. Teardown prints per-tier lines
  # ("instruction injection: removed"); a real `--help` would print usage instead.
  $r = Invoke-Tk @("uninstall", "--dry-run", "--help")
  if ($r.AllText -match 'instruction injection|usage guidance: removed') {
    Warn "boundary" "uninstall ignores --help (no arg validation)" "'uninstall --help' plans a real teardown instead of printing usage — guard with arg validation" $r.Ms
  } else { Pass "boundary" "uninstall --help prints usage (no teardown)" "" $r.Ms }
  $r = Invoke-Tk @("uninstall", "--dry-run", "--ctx-bogus-flag-xyz")
  if ($r.ExitCode -ne 0 -and $r.AllText -match 'unknown flag|Refusing') {
    Pass "boundary" "uninstall refuses unknown flag (fail closed)" "exit=$($r.ExitCode)" $r.Ms
  } else { Warn "boundary" "uninstall accepts unknown flag" "exit=$($r.ExitCode) — unknown flag not refused (dry-run); arg validation missing" $r.Ms }

  # B10 GBK / cp936 decode ladder (Windows). ctx decodes the bytes IT reads from the
  # tool it WRAPS: strict-UTF-8 first, then the legacy codepage (gb18030, a cp936
  # superset). The decode only fires for a WRAPPED tool — `cmd`/`type` are not wrapped,
  # so the old test (`ctx cmd /c type`) was correctly REFUSED by ctx and never exercised
  # the ladder at all (it tested nothing). Use git, which ctx wraps: commit KNOWN cp936
  # bytes as a blob, then `git show <rev>:<path>` — a colon-spec, which ctx's show handler
  # passes through verbatim (git/show.ts isRawPassthrough), so the only transform is
  # ctx's child-output decode. Assert the Chinese needle survives in ctx's UTF-8 stdout.
  if ($IsWindows -and (Test-Cmd git)) {
    try {
      $enc936 = [System.Text.Encoding]::GetEncoding(936)
      $gbkRepo = Join-Path $TmpRoot "gbk"; New-Item -ItemType Directory -Path $gbkRepo -Force | Out-Null
      Push-Location $gbkRepo
      try {
        & git init -q; & git config user.email a@a; & git config user.name a; & git config core.autocrlf false
        $gneedle = "项目令牌GBK验证"
        [System.IO.File]::WriteAllBytes((Join-Path $gbkRepo "gbk.txt"), $enc936.GetBytes("marker $gneedle end"))
        & git add -A; & git commit -qm gbk
        $r = Invoke-Tk @("git", "show", "HEAD:gbk.txt")
        if ($r.AllText -match [regex]::Escape($gneedle)) { Pass "boundary" "GBK/cp936 child output decoded (legacy fallback)" "" $r.Ms } else { Warn "boundary" "GBK/cp936 decode" "needle not found — see dossier for raw bytes (mojibake?)" $r.Ms }
      } finally { Pop-Location }
    } catch { Warn "boundary" "GBK/cp936 decode" "could not build cp936 fixture: $($_.Exception.Message)" }
  } else { Skip "boundary" "GBK/cp936 decode" "non-Windows or git absent (box is UTF-8; cp936 fixture needs git)" }

  # ╔══ PHASE 5: Fail-safe / resilience ══╗
  Section "Fail-safe"
  # CTX_DEBUG trace goes to stderr; stdout stays clean compressed output.
  if ($isGit) {
    $r = Invoke-Tk @("git", "status") -Env @{ CTX_DEBUG = "1" }
    if ($r.Stderr.Trim().Length -gt 0) { Pass "failsafe" "CTX_DEBUG=1 traces to stderr" "" $r.Ms } else { Warn "failsafe" "CTX_DEBUG=1 trace" "no stderr trace seen" $r.Ms }
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
  Section "Performance ($PerfIterations samples; p50/p95 ms)"
  function Measure-Many { param([scriptblock]$Action, [int]$N) $v = @(); for ($i = 0; $i -lt $N; $i++) { $v += (& $Action) } ; , $v }
  $coldVer = (Invoke-Tk @("--version")).Ms
  $verMs = Measure-Many { (Invoke-Tk @("--version")).Ms } $PerfIterations
  Info "perf" "ctx --version startup" ("cold={0:N0}ms p50={1:N0} p95={2:N0}" -f $coldVer, (Get-Percentile $verMs 50), (Get-Percentile $verMs 95)) (Get-Percentile $verMs 50)
  if ($isGit) {
    $tkMs = Measure-Many { (Invoke-Tk @("git", "status")).Ms } $PerfIterations
    $rawMs = Measure-Many { (Start-Proc -File (Get-Command git).Source -PArgs @("status", "--porcelain")).Ms } $PerfIterations
    $tk50 = Get-Percentile $tkMs 50; $raw50 = Get-Percentile $rawMs 50
    Info "perf" "ctx git status vs raw" ("ctx p50={0:N0}ms  raw p50={1:N0}ms  overhead={2:N0}ms (ctx spawns 2x: porcelain+human)" -f $tk50, $raw50, ($tk50 - $raw50)) $tk50
    $r = Invoke-Tk @("--stats", "git", "log", "-p", "-100")
    $pct = if ($r.AllText -match 'Saved:.*\(([0-9.]+)%\)') { $Matches[1] } else { "0" }
    Info "perf" "git log -p -100 compress" ("{0:N0}ms  saved={1}%" -f $r.Ms, $pct) $r.Ms
  }

  # ╔══ PHASE 7: Shim / PATH interception (Windows-relevant) ══╗
  Section "Shim / PATH"
  $r = Invoke-Tk @("shim", "status")
  Info "shim" "ctx shim status" (($r.AllText -split "`n" | Select-Object -First 1)) $r.Ms
  # Exercise the install/uninstall SUBCOMMANDS via --dry-run so they're covered
  # without mutating host configs / PATH (real mutation is the lifecycle phase's job).
  $r = Invoke-Tk @("shim", "install", "--dry-run")
  if ($r.ExitCode -eq 0) { Pass "shim" "ctx shim install --dry-run (no mutation)" "" $r.Ms } else { Fail "shim" "ctx shim install --dry-run" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("shim", "uninstall", "--dry-run")
  if ($r.ExitCode -eq 0) { Pass "shim" "ctx shim uninstall --dry-run (no mutation)" "" $r.Ms } else { Fail "shim" "ctx shim uninstall --dry-run" "exit=$($r.ExitCode)" $r.Ms }
  if ($IsWindows) {
    $shimDir = Join-Path $env:USERPROFILE ".contexa/shim"
    if (Test-Path -LiteralPath $shimDir) {
      $probePath = "$shimDir;$env:PATH"
      $where = & cmd.exe /c "set PATH=$probePath&& where git" 2>&1 | Out-String
      $synthR = [PSCustomObject]@{ File = 'cmd.exe'; Argv = @('/c', "set PATH=...&& where git"); ExitCode = $LASTEXITCODE; Ms = -1; TimedOut = $false; Stdout = $where; Stderr = '' }
      if ($where -match [regex]::Escape($shimDir)) { Pass "shim" "where git resolves through shim (PATH prepend)" $where.Trim() } else { Warn "shim" "where git through shim" "got: $($where.Trim())" -R $synthR }
    } else { Skip "shim" "where git through shim" "shim not installed yet (lifecycle phase installs it)" }
  } else { Skip "shim" "PATHEXT / where git" "non-Windows" }

  # ╔══ PHASE 8: Stateful round-trips — snapshot + exercise for real + restore ══╗
  # No switches: these mutate real state, but each one snapshots the exact artifact,
  # runs the command for real, asserts, and restores. The Acceptance-scope note in the
  # report lists every restore so the report proves the box was left clean.
  Section "Stateful round-trips (snapshot+restore)"

  # config init — write the template into a fresh location, then restore the original.
  $cfgRes = Invoke-Tk @("config", "path"); $cfgPath = $cfgRes.Stdout.Trim()
  if ($cfgPath) {
    $cfgExisted = Test-Path -LiteralPath $cfgPath
    $cfgBak = "$cfgPath.acc-init.bak"
    if ($cfgExisted) { Copy-Item -LiteralPath $cfgPath -Destination $cfgBak -Force; Remove-Item -LiteralPath $cfgPath -Force }
    try {
      $r = Invoke-Tk @("config", "init")
      if ($r.ExitCode -eq 0 -and $r.AllText -match 'Wrote config template') { Pass "roundtrip" "config init writes template" "" $r.Ms } else { Fail "roundtrip" "config init" "exit=$($r.ExitCode)" $r.Ms }
      # second init must be idempotent-safe (already exists -> refuse, not clobber).
      $r = Invoke-Tk @("config", "init")
      if ($r.AllText -match 'already exists') { Pass "roundtrip" "config init idempotent (already exists)" "" $r.Ms } else { Warn "roundtrip" "config init 2nd run" "expected 'already exists'" $r.Ms }
    } finally {
      if ($cfgExisted) { Move-Item -LiteralPath $cfgBak -Destination $cfgPath -Force; Note "config restored from snapshot" }
      else { Remove-Item -LiteralPath $cfgPath -Force -ErrorAction SilentlyContinue; Note "config init artifact removed (none existed before)" }
    }
  }

  # telemetry enable -> status(enabled) -> disable -> status(disabled). Snapshot config.
  $cfgRes = Invoke-Tk @("config", "path"); $cfgPath = $cfgRes.Stdout.Trim()
  $teleBak = $null
  if ($cfgPath -and (Test-Path -LiteralPath $cfgPath)) { $teleBak = "$cfgPath.acc-tele.bak"; Copy-Item -LiteralPath $cfgPath -Destination $teleBak -Force }
  try {
    $r = Invoke-Tk @("telemetry", "enable")
    if ($r.ExitCode -eq 0 -and $r.AllText -match 'Telemetry enabled') { Pass "roundtrip" "telemetry enable" "" $r.Ms } else { Fail "roundtrip" "telemetry enable" "exit=$($r.ExitCode)" $r.Ms }
    $r = Invoke-Tk @("telemetry", "status")
    if ($r.AllText -match 'network upload\):\s*enabled') { Pass "roundtrip" "telemetry status reflects enabled" "" $r.Ms } else { Warn "roundtrip" "telemetry status enabled" "" $r.Ms }
    $r = Invoke-Tk @("telemetry", "disable")
    if ($r.ExitCode -eq 0 -and $r.AllText -match 'Telemetry disabled') { Pass "roundtrip" "telemetry disable" "" $r.Ms } else { Fail "roundtrip" "telemetry disable" "exit=$($r.ExitCode)" $r.Ms }
    $r = Invoke-Tk @("telemetry", "status")
    if ($r.AllText -match 'network upload\):\s*disabled') { Pass "roundtrip" "telemetry status reflects disabled" "" $r.Ms } else { Warn "roundtrip" "telemetry status disabled" "" $r.Ms }
  } finally {
    if ($teleBak) { Move-Item -LiteralPath $teleBak -Destination $cfgPath -Force; Note "config restored after telemetry round-trip" }
  }

  # support — a channel arg is REQUIRED in non-interactive (cli.ts:180); with routing env
  # REMOVED and no address, ADR 0011 makes it save a bundle + clipboard and open no GUI.
  # `-y` skips the TTY prompts. We delete the bundle afterwards.
  function Test-Support {
    param([string]$N, [string]$Channel = "email", [string[]]$Flags, [bool]$ExpectBundle = $true)
    $r = Invoke-Tk (@("support", $Channel, "-y") + $Flags) -UnsetEnv @("CTX_SUPPORT_EMAIL", "CTX_SUPPORT_TEAMS")
    if (-not $ExpectBundle) {
      # `--no-attach` means "do NOT gather the error+logs bundle" (see `ctx support --help`),
      # so it MUST NOT save a bundle — it opens a bare draft. Asserting the bundle line
      # here was the harness's bug, not ctx's. Assert the bare-draft contract instead.
      if ($r.ExitCode -eq 0 -and $r.AllText -notmatch 'Saved diagnostic bundle:' -and $r.AllText -match 'BARE support draft') {
        Pass "roundtrip" $N "no bundle saved (bare draft, by design)" $r.Ms
      } else { Warn "roundtrip" $N "exit=$($r.ExitCode) — expected a bare draft with NO bundle under --no-attach" $r.Ms }
      return
    }
    if ($r.ExitCode -eq 0 -and $r.AllText -match 'Saved diagnostic bundle:') {
      Pass "roundtrip" $N "" $r.Ms
      $supPath = Get-LabeledPath $r.AllText 'Saved diagnostic bundle:'
      if ($supPath -and (Test-Path -LiteralPath $supPath)) { Remove-Item -LiteralPath $supPath -Force -ErrorAction SilentlyContinue; Note "support bundle removed: $supPath" }
    } else { Warn "roundtrip" $N "exit=$($r.ExitCode) — expected 'Saved diagnostic bundle:'" $r.Ms }
  }
  Test-Support "support email saves bundle, opens no GUI" "email" @()
  Test-Support "support email --redact runs" "email" @("--redact")
  Test-Support "support email --no-attach (bare draft, no bundle)" "email" @("--no-attach") -ExpectBundle $false
  Test-Support "support teams saves bundle (routing unset)" "teams" @()

  # optimize --apply / --restore — confined to a throwaway temp git repo (--project),
  # so user-level context files are never touched. The apply backs up; restore reverts.
  if (Test-Cmd git) {
    $optRepo = Join-Path $TmpRoot "optimize-apply"; New-Item -ItemType Directory -Path $optRepo -Force | Out-Null
    Push-Location $optRepo
    try {
      & git init -q; & git config user.email a@a; & git config user.name a
      Set-Content -LiteralPath "CLAUDE.md" -Value "# Project`n`nAlways use PNPM.`nAlways use PNPM.`n" -Encoding UTF8
      Set-Content -LiteralPath "AGENTS.md" -Value "# Agents`n`nBe concise.`n" -Encoding UTF8
      & git add -A; & git commit -qm init
      # --backup snapshots files BEFORE hand/agent edits. Pass an EXPLICIT file so it
      # snapshots only this temp repo's CLAUDE.md (a bare --backup would also snapshot
      # user-scope context). Remove the snapshot dir afterward to leave the box clean.
      $r = Invoke-Tk @("optimize", "--backup", "CLAUDE.md")
      if ($r.ExitCode -eq 0 -and $r.AllText -match 'backed up \d+ file\(s\) to (.+)') {
        Pass "roundtrip" "optimize --backup snapshots files" "" $r.Ms
        $bkDir = $Matches[1].Trim()
        if (Test-Path -LiteralPath $bkDir) { Remove-Item -LiteralPath $bkDir -Recurse -Force -ErrorAction SilentlyContinue; Note "optimize --backup snapshot removed: $bkDir" }
      } else { Warn "roundtrip" "optimize --backup" "exit=$($r.ExitCode)" $r.Ms }
      $r = Invoke-Tk @("optimize", "context", "--project", "--apply") -Env $script:HeavyEnv -Tmo $script:HeavyTimeoutSec -Stream
      if ($r.ExitCode -eq 0 -and $r.AllText -match 'ctx optimize --apply') { Pass "roundtrip" "optimize --apply (temp repo, backs up)" "" $r.Ms } elseif ($r.TimedOut) { Fail "roundtrip" "optimize --apply" "inspect-triggered scan still running at ${script:HeavyTimeoutSec}s ceiling — see dossier" $r.Ms } else { Fail "roundtrip" "optimize --apply" "exit=$($r.ExitCode)" $r.Ms }
      $r = Invoke-Tk @("optimize", "--restore")
      if ($r.ExitCode -eq 0 -and $r.AllText -match 'restored|nothing to restore') { Pass "roundtrip" "optimize --restore reverts" "" $r.Ms } else { Warn "roundtrip" "optimize --restore" "exit=$($r.ExitCode)" $r.Ms }
    } finally { Pop-Location; Note "optimize --apply confined to temp repo (discarded)" }
  }

  # ╔══ PHASE 9: Install / uninstall E2E — every host (mutating; restores prior state) ══╗
  Section "Lifecycle E2E — install / status / idempotency / uninstall (all hosts)"
  $vscSettings = if ($IsWindows) { Join-Path $env:APPDATA "Code/User/settings.json" } else { $null }
  $vscBak = $null
  if ($vscSettings -and (Test-Path -LiteralPath $vscSettings)) { $vscBak = "$vscSettings.acc.bak"; Copy-Item -LiteralPath $vscSettings -Destination $vscBak -Force }
  # claude-code mutates ~/.claude/settings.json — snapshot it too.
  $claudeSettings = Join-Path ([Environment]::GetFolderPath('UserProfile')) ".claude/settings.json"
  $claudeBak = $null
  if (Test-Path -LiteralPath $claudeSettings) { $claudeBak = "$claudeSettings.acc.bak"; Copy-Item -LiteralPath $claudeSettings -Destination $claudeBak -Force }

  # install vscode (shim primary + hook additive)
  $r = Invoke-Tk @("install", "--host", "vscode")
  if ($r.ExitCode -eq 0 -and $r.AllText -match 'Active tier') { Pass "lifecycle" "install --host vscode" (($r.AllText -split "`n" | Where-Object { $_ -match 'Active tier' })) $r.Ms } else { Fail "lifecycle" "install --host vscode" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("status"); if ($r.AllText -match 'installed') { Pass "lifecycle" "status after install" "" $r.Ms } else { Warn "lifecycle" "status after install" "" $r.Ms }
  $r = Invoke-Tk @("install", "--host", "vscode"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "install idempotent (2nd run)" "" $r.Ms } else { Fail "lifecycle" "install idempotent" "exit=$($r.ExitCode)" $r.Ms }
  if ($IsWindows) {
    $shimDir = Join-Path $env:USERPROFILE ".contexa/shim"
    if (Test-Path -LiteralPath (Join-Path $shimDir "git.cmd")) { Pass "lifecycle" "shim git.cmd written" } else { Fail "lifecycle" "shim git.cmd written" "missing" }
    if ($vscSettings -and (Test-Path -LiteralPath $vscSettings) -and ((Get-Content -LiteralPath $vscSettings -Raw) -match 'CTX_SHIM_DIR')) { Pass "lifecycle" "VS Code settings patched (CTX_SHIM_DIR)" } else { Warn "lifecycle" "VS Code settings patched" "CTX_SHIM_DIR not found" }
  }
  # copilot-cli host
  $r = Invoke-Tk @("install", "--host", "copilot-cli"); if ($r.ExitCode -eq 0 -and $r.AllText -match 'Active tier: hook') { Pass "lifecycle" "install --host copilot-cli" "" $r.Ms } else { Fail "lifecycle" "install --host copilot-cli" "exit=$($r.ExitCode)" $r.Ms }
  # claude-code host (always — snapshot above restores it)
  $r = Invoke-Tk @("install", "--host", "claude-code"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "install --host claude-code" "" $r.Ms } else { Fail "lifecycle" "install --host claude-code" "exit=$($r.ExitCode)" $r.Ms }
  # project scope round-trip
  if ($isGit) {
    $r = Invoke-Tk @("install", "--host", "vscode", "--project"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "install --project" "" $r.Ms } else { Warn "lifecycle" "install --project" "exit=$($r.ExitCode)" $r.Ms }
    $r = Invoke-Tk @("uninstall", "--project"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "uninstall --project" "" $r.Ms } else { Warn "lifecycle" "uninstall --project" "exit=$($r.ExitCode)" $r.Ms }
  }
  # --purge-data is irreversible (deletes metrics history). Exercise the flag via
  # --dry-run only: proves parsing + plan disclosure WITHOUT deleting your history.
  $r = Invoke-Tk @("uninstall", "--dry-run", "--purge-data")
  if ($r.ExitCode -eq 0 -and $r.AllText -match 'projects|purge|history|would') { Pass "lifecycle" "uninstall --purge-data (dry-run plan)" "" $r.Ms } else { Warn "lifecycle" "uninstall --purge-data dry-run" "exit=$($r.ExitCode)" $r.Ms }
  # real uninstall
  $r = Invoke-Tk @("uninstall", "--dry-run"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "uninstall --dry-run" "" $r.Ms } else { Warn "lifecycle" "uninstall --dry-run" "exit=$($r.ExitCode)" $r.Ms }
  $r = Invoke-Tk @("uninstall"); if ($r.ExitCode -eq 0) { Pass "lifecycle" "uninstall" "" $r.Ms } else { Fail "lifecycle" "uninstall" "exit=$($r.ExitCode)" $r.Ms }
  if ($IsWindows) {
    $shimDir = Join-Path $env:USERPROFILE ".contexa/shim"
    if (-not (Test-Path -LiteralPath $shimDir)) { Pass "lifecycle" "shim removed after uninstall" } else { Warn "lifecycle" "shim removed" "still present" }
  }
  # restore VS Code + claude settings + prior install host
  if ($vscBak) { Move-Item -LiteralPath $vscBak -Destination $vscSettings -Force; Note "VS Code settings restored" }
  if ($claudeBak) { Move-Item -LiteralPath $claudeBak -Destination $claudeSettings -Force; Note "~/.claude/settings.json restored" }
  elseif (Test-Path -LiteralPath $claudeSettings) { Remove-Item -LiteralPath $claudeSettings -Force -ErrorAction SilentlyContinue; Note "claude-code settings removed (none existed before)" }
  # Only re-install a REAL host. A fresh box reports "(none)"/"(not recorded)"; never
  # feed those to `install --host`.
  $knownHosts = @('claude-code', 'copilot-cli', 'vscode', 'auto')
  if ($priorHost -and ($knownHosts -contains $priorHost)) {
    $r = Invoke-Tk @("install", "--host", $priorHost)
    if ($r.ExitCode -eq 0) { Pass "lifecycle" "restore prior install ($priorHost)" "" $r.Ms; Note "prior install host '$priorHost' restored" } else { Warn "lifecycle" "restore prior install ($priorHost)" "exit=$($r.ExitCode) — re-run: ctx install --host $priorHost" $r.Ms }
  } else { Info "lifecycle" "restore prior install" "no prior real host to restore (was '$priorHost')" }

  # ╔══ PHASE 10: Tier-0 routing — health (agent-independent) + Copilot CLI E2E ══╗
  Section "Tier-0 — does the agent route through ctx?"
  # ── 10a) ROUTING HEALTH — agent-independent (issue #42). ──────────────────────
  # The authoritative "is the command-routing hook wired correctly?" gate. It
  # dry-runs the rewrite decision via `ctx hook check` — the SAME engine the live
  # hook uses (src/hook/rewrite.ts) — so a `rewrite:` verdict PROVES routing works
  # without invoking the agent or spending a token of budget. This is orthogonal to
  # agent auth/budget: it passes even when the live Copilot/VS Code call below fails
  # for "no budget" or "not logged in". The old signal (10b) inferred firing from a
  # new gain row and so conflated a mis-installed hook with an agent that simply had
  # no budget to run the wrapped command — those two are now separated.
  $hk = Invoke-Tk @("hook", "check", "git", "status")
  if ($hk.ExitCode -eq 0 -and $hk.AllText -match '(?m)^\s*rewrite:\s*ctx\b') {
    Pass "tier0" "routing health: hook rewrites 'git status' -> ctx (agent-independent)" $hk.AllText.Trim() $hk.Ms
  } else {
    # A non-rewrite verdict here means the rewrite engine itself is broken/mis-built —
    # a REAL routing defect, independent of any agent. Fail (not Warn) so it can't be
    # dismissed as "the agent had no budget".
    Fail "tier0" "routing health: hook rewrites 'git status' -> ctx" "expected 'rewrite: ctx …', got: $($hk.AllText.Trim()) (exit=$($hk.ExitCode))" $hk.Ms $hk
  }

  # ── 10b) Copilot CLI E2E — does the agent ACTUALLY route at runtime? ──────────
  $histBefore = (Invoke-Tk @("gain", "--history")).AllText
  $beforeLines = ($histBefore -split "`n").Count
  if (Test-Cmd "copilot") {
    # Get-Command resolves copilot to its .ps1 on Windows, which Process.Start
    # (UseShellExecute=$false) CANNOT exec — the prior run died with exit 127 "not a
    # valid application for this OS platform", so tier-0 routing was never actually
    # tested. Route via cmd so PATH resolves the launchable copilot.cmd shim.
    $cp = if ($IsWindows) {
      Start-Proc -File $env:ComSpec -PArgs @("/c", "copilot", "-p", "run a single command: git status") -Tmo 120
    } else {
      Start-Proc -File (Get-Command copilot).Source -PArgs @("-p", "run a single command: git status") -Tmo 120
    }
    Start-Sleep -Seconds 1
    $histAfter = (Invoke-Tk @("gain", "--history")).AllText
    if (($histAfter -split "`n").Count -gt $beforeLines) {
      Pass "tier0" "Copilot CLI routed through ctx (gain history grew)" "" $cp.Ms
    }
    elseif ($cp.ExitCode -ne 0) {
      # The AGENT call failed (exit nonzero — budget exceeded, not authed, proxy down).
      # The wrapped command never ran, so the MISSING gain row says nothing about the
      # hook. Routing health (10a) already proved the hook is installed correctly, so
      # this is an agent-environment limitation, NOT a routing defect — Info, not Warn.
      Info "tier0" "Copilot CLI E2E inconclusive (agent call failed)" "copilot exited $($cp.ExitCode) (budget/auth/proxy?) — no command ran, so no gain row; routing health proven by 10a" $cp.Ms
    }
    else {
      # Agent call SUCCEEDED (exit 0) yet no gain row appeared: the command ran but did
      # NOT go through ctx. With routing health green, this points at a delivery/PATH gap
      # at runtime (e.g. Copilot ran outside the env that carries the shim/hook).
      Warn "tier0" "Copilot CLI ran but did not route through ctx" "agent exit 0 yet no new gain row — runtime delivery/PATH gap (routing engine itself is healthy per 10a)" $cp.Ms -R $cp
    }
  } else {
    Skip "tier0" "Copilot CLI E2E" "copilot not on PATH"
  }
  Info "tier0" "VS Code + Copilot agent (MANUAL)" "baseline gain rows=$beforeLines — see report for steps"

} catch {
  # Last-resort net: a line we could not exercise on a non-Windows dev box threw. Record
  # it (message + the offending file:line + a PS stack trace in the dossier) so the report
  # STILL gets written — the report is the whole point. Phases after this point are
  # skipped, but you get a self-diagnosing report instead of a bare console stack.
  $exR = [PSCustomObject]@{ File = '(powershell)'; Argv = @('harness'); ExitCode = 1; Ms = -1; TimedOut = $false; Stdout = [string]$_.ScriptStackTrace; Stderr = [string]$_.Exception.Message }
  Fail "harness" "uncaught exception — suite stopped early here" ("{0} @ {1}" -f $_.Exception.Message, (($_.InvocationInfo.PositionMessage -split "`n") -join ' ')) -1 $exR
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

function Cap([string]$s, [int]$n) {
  if ($null -eq $s -or $s -eq "") { return "(empty)" }
  $t = $s.TrimEnd()
  if ($t.Length -le $n) { return $t }
  return $t.Substring(0, $n) + "`n…(+$($t.Length - $n) more chars truncated)"
}
function ReproLine($d) {
  $parts = @($d.Argv | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } })
  "$($d.File) " + ($parts -join ' ')
}

$md = [System.Collections.Generic.List[string]]::new()
function L([string]$s = "") { $md.Add($s) }
L "# ctx Real-Machine Acceptance Report"
L ""
L ("**{0} pass · {1} fail · {2} warn · {3} skip · {4} info**" -f $pass, $fail, $warn, $skip, $info)
L ""
L "_Self-sufficient report: every FAIL/WARN below carries a dossier (exact repro + exit + stderr + stdout) so it can be diagnosed and fixed without the machine. No coverage switches — every phase ran._"
L ""
L "## Environment"
L ""
L "| Key | Value |"
L "|---|---|"
foreach ($k in $EnvInfo.Keys) { L ("| {0} | {1} |" -f $k, ($EnvInfo[$k] -replace '\|', '\|')) }
L ""
# Acceptance scope — what was mutated and restored (proves the box was left clean).
L "## Acceptance scope (mutations + restores)"
L ""
if ($script:ScopeNotes.Count -gt 0) { foreach ($n in $script:ScopeNotes) { L ("- " + $n) } } else { L "- (no stateful mutations recorded)" }
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
# Findings first (actionable), each linking to its dossier id.
if ($script:Findings.Count -gt 0) {
  L "## Findings (fail / warn)"
  L ""
  foreach ($f in $script:Findings) { L ("- " + ($f -replace '\|', '\|')) }
  L ""
}
# Failure dossiers — the payloads that make remote diagnosis possible.
if ($script:Dossiers.Count -gt 0) {
  L "## Failure dossiers (full payloads — diagnose without the machine)"
  L ""
  foreach ($d in $script:Dossiers) {
    L ("### {0} · {1} [{2}] {3}" -f $d.Id, $d.Status, $d.Phase, $d.Name)
    L ""
    L ("- repro: ``{0}``" -f (ReproLine $d))
    L ("- exit: {0} · ms: {1:N0} · timedOut: {2}" -f $d.Exit, $d.Ms, $d.TimedOut)
    if ($d.Detail) { L ("- detail: {0}" -f $d.Detail) }
    L ""
    L "stderr:"
    L '```text'
    L (Cap $d.Stderr 4000)
    L '```'
    L "stdout (head):"
    L '```text'
    L (Cap $d.Stdout 1500)
    L '```'
    L ""
  }
}
# Detailed table (dossier id in the last column for cross-reference).
L "## Detailed results"
L ""
L "| Phase | Status | Case | Detail | ms | dossier |"
L "|---|---|---|---|--:|---|"
foreach ($r in $script:Results) {
  $ms = if ($r.Ms -ge 0) { "{0:N0}" -f $r.Ms } else { "" }
  L ("| {0} | {1} | {2} | {3} | {4} | {5} |" -f $r.Phase, $r.Status, ($r.Name -replace '\|', '\|'), ($r.Detail -replace '\|', '\|'), $ms, $r.Dossier)
}
L ""
# Manual Tier-0 instructions
L "## Manual gate — VS Code + Copilot routing (cannot be scripted)"
L ""
L "A headless script cannot drive the Copilot GUI. Do this once at the keyboard:"
L ""
L "1. ``ctx install --host vscode`` then **fully quit & reopen VS Code** (integrated terminal must pick up the new PATH)."
L "2. Open a git repo (>=20 commits) and Copilot Chat in **Agent** mode."
L "3. Prompt: *""Summarize what changed in the last 20 commits.""* (runs ``git log``). Approve the terminal run."
L "4. In the VS Code terminal: ``ctx gain --history``."
L "   - **PASS**: the command Copilot ran appears as a row with a savings %. Note whether ``ctx status`` tier is **hook** or **shim**."
L "   - **DID NOT ENGAGE**: no new row — Copilot ran outside the integrated-terminal env. A key finding: pivot to the hook tier."
L ""
L "**First isolate routing from the agent (issue #42).** Before blaming the hook for a"
L "missing gain row, run ``ctx hook check ""git status""`` — it dry-runs the rewrite with"
L "no agent and no budget. ``rewrite: ctx git status`` means routing is healthy, so a"
L "missing gain row is an *agent* problem (no budget / not logged in / ran outside the"
L "shimmed env), NOT a broken hook. The automated **tier0 / routing health** check above"
L "asserts exactly this. (Opt-in: set ``CTX_HOOK_BEACON=1`` to have the live hook inject a"
L "one-line ``ctx active`` beacon into the transcript on each rewrite for positive"
L "confirmation; default-off keeps the wire byte-identical.)"
L ""
L "_Generated by scripts/windows-dogfood.ps1_"

Set-Content -LiteralPath $ReportPath -Value ($md -join "`n") -Encoding UTF8
Write-Host "Report: $ReportPath" -ForegroundColor Yellow
if ($priorHost -and (@('claude-code', 'copilot-cli', 'vscode', 'auto') -contains $priorHost)) { Write-Host "Prior install ($priorHost) restored." -ForegroundColor DarkGray }

exit $fail
