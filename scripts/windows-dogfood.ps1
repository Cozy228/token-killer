#Requires -Version 5.1
<#
.SYNOPSIS
  tk Windows full lifecycle dogfood — command proxy, VS Code shim, Copilot CLI hook.

.DESCRIPTION
  Exercises the complete delivery stack on Windows (no skips). Mutating git commands
  use --dry-run. Init steps write real user-level config unless -PreviewInit is set.

  Prerequisites (all required — missing tools fail the run):
    - Node.js >= 20, pnpm, git, rg, tree
    - VS Code (%APPDATA%\Code\User)
    - GitHub Copilot CLI (%USERPROFILE%\.copilot)
    - tk built (pnpm build) or tk on PATH
    - Target git repo (default: ..\atlas sibling of this repo)

.PARAMETER TargetRepo
  Monorepo used for compression tests. Override with -TargetRepo or $env:TK_DOGFOOD_CWD.

.PARAMETER PreviewInit
  Only dry-run init; do not write shim / hook / VS Code settings.

.PARAMETER Cleanup
  Run tk init --uninstall and tk shim uninstall after tests (best-effort).

.EXAMPLE
  pwsh -NoProfile -File scripts/windows-dogfood.ps1

.EXAMPLE
  pwsh -NoProfile -File scripts/windows-dogfood.ps1 -TargetRepo D:\Workspace\atlas
#>
[CmdletBinding()]
param(
  [string] $TargetRepo = "",
  [switch] $PreviewInit,
  [switch] $Cleanup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  Write-Host "windows-dogfood.ps1 must run on Windows (PowerShell 5.1+ or pwsh)."
  exit 1
}

$Script:Pass = 0
$Script:Fail = 0

function Write-Section([string] $Title) {
  Write-Host ""
  Write-Host "── $Title ──" -ForegroundColor Cyan
}

function Write-Pass([string] $Name, [string] $Detail = "") {
  $Script:Pass++
  if ($Detail) { Write-Host "  PASS  $Name  $Detail" -ForegroundColor Green }
  else { Write-Host "  PASS  $Name" -ForegroundColor Green }
}

function Write-Fail([string] $Name, [string] $Detail = "") {
  $Script:Fail++
  if ($Detail) { Write-Host "  FAIL  $Name  $Detail" -ForegroundColor Red }
  else { Write-Host "  FAIL  $Name" -ForegroundColor Red }
}

function Assert-Command([string] $Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Fail "prerequisite: $Name" "not found on PATH"
    return $false
  }
  Write-Pass "prerequisite: $Name"
  return $true
}

function Invoke-Tk {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Args)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Script:TkBin
  foreach ($a in $Script:TkCliArgs) { $psi.ArgumentList.Add($a) | Out-Null }
  foreach ($a in $Args) { $psi.ArgumentList.Add($a) | Out-Null }
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  return [PSCustomObject]@{
    ExitCode = $p.ExitCode
    Stdout   = $stdout
    Stderr   = $stderr
    AllText  = "$stdout$stderr"
  }
}

function Invoke-TkPipe {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Args)
  # Pipe stdout to simulate non-TTY agent context (triggers compression).
  $all = $Script:TkCliArgs + $Args
  $out = & $Script:TkBin @all 2>&1 | Out-String
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  return [PSCustomObject]@{ ExitCode = $code; AllText = $out }
}

function Test-TkStats {
  param([string] $Name, [string[]] $Args)
  $r = Invoke-TkPipe @("--stats") + $Args
  if ($r.AllText -match "## Token Savings") {
    $stats = ($r.AllText -split "`n" | Where-Object { $_ -match "^(Raw|Output|Saved):" }) -join " "
    $suffix = if ($r.ExitCode -ne 0) { " (upstream exit=$($r.ExitCode), compression ok)" } else { "" }
    Write-Pass $Name "$stats$suffix"
    return
  }
  if ($r.ExitCode -ne 0) {
    Write-Fail $Name "exit=$($r.ExitCode)"
    ($r.AllText -split "`n" | Select-Object -First 5) | ForEach-Object { Write-Host "        $_" }
    return
  }
  Write-Pass $Name "(passthrough)"
}

function Test-HookCheck {
  param([string] $Name, [string[]] $Args)
  $r = Invoke-Tk @("hook", "check") + $Args
  if ($r.ExitCode -eq 0 -and $r.AllText.Trim().Length -gt 0) {
    Write-Pass $Name $r.AllText.Trim()
  } else {
    Write-Fail $Name "exit=$($r.ExitCode)"
  }
}

function Test-HookCopilot {
  param([string] $Name, [string] $Payload, [string] $ExpectedSubstr)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Script:TkBin
  foreach ($a in $Script:TkCliArgs) { $psi.ArgumentList.Add($a) | Out-Null }
  $psi.ArgumentList.Add("hook") | Out-Null
  $psi.ArgumentList.Add("copilot") | Out-Null
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.Write($Payload)
  $p.StandardInput.Close()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -eq 0 -and $stdout -match $ExpectedSubstr) {
    Write-Pass $Name $stdout.Trim()
  } else {
    Write-Fail $Name "exit=$($p.ExitCode) stdout=$stdout stderr=$stderr"
  }
}

function Test-TkOk {
  param([string] $Name, [string[]] $Args, [scriptblock] $Assert)
  $r = Invoke-Tk @($Args)
  if ($r.ExitCode -eq 0 -and (& $Assert $r)) {
    Write-Pass $Name
  } else {
    Write-Fail $Name "exit=$($r.ExitCode)"
    ($r.AllText -split "`n" | Select-Object -First 6) | ForEach-Object { Write-Host "        $_" }
  }
}

# ── Resolve paths ───────────────────────────────────────────────────

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Root = Split-Path -Parent $ScriptDir
if (-not $TargetRepo) {
  $TargetRepo = if ($env:TK_DOGFOOD_CWD) { $env:TK_DOGFOOD_CWD } else { Join-Path (Split-Path $Root -Parent) "atlas" }
}
if (-not (Test-Path -LiteralPath $TargetRepo -PathType Container)) {
  Write-Host "Target repo not found: $TargetRepo"
  Write-Host "Pass -TargetRepo or set TK_DOGFOOD_CWD."
  exit 1
}
$TargetRepo = (Resolve-Path -LiteralPath $TargetRepo).Path

if (Test-Path -LiteralPath (Join-Path $Root "dist\cli.js")) {
  $Script:TkBin = "node"
  $Script:TkCliArgs = @((Resolve-Path (Join-Path $Root "dist\cli.js")).Path)
} elseif (Get-Command tk -ErrorAction SilentlyContinue) {
  $Script:TkBin = (Get-Command tk).Source
  $Script:TkCliArgs = @()
} else {
  Write-Host "tk not found. Run: pnpm build"
  exit 1
}

$ShimDir = Join-Path $env:USERPROFILE ".token-killer\shim"
$CopilotHook = Join-Path $env:USERPROFILE ".copilot\hooks\tk-rewrite.json"
$VscodeSettings = Join-Path $env:APPDATA "Code\User\settings.json"
$TmpDir = Join-Path $env:TEMP ("tk-dogfood-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

Write-Host "tk Windows Full Lifecycle Dogfood" -ForegroundColor White
Write-Host "tk:      $($Script:TkBin) $($Script:TkCliArgs -join ' ')"
Write-Host "root:    $Root"
Write-Host "target:  $TargetRepo"
Write-Host "preview: $PreviewInit"
Write-Host "date:    $(Get-Date -Format 'yyyy-MM-dd HH:mm')"

Push-Location $TargetRepo
try {
  # ── Phase 0: Prerequisites (no skips) ─────────────────────────────
  Write-Section "Prerequisites"
  $ok = $true
  foreach ($cmd in @("node", "pnpm", "git", "rg", "tree")) {
    if (-not (Assert-Command $cmd)) { $ok = $false }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $env:APPDATA "Code\User") -PathType Container)) {
    Write-Fail "prerequisite: VS Code" "%APPDATA%\Code\User missing"
    $ok = $false
  } else { Write-Pass "prerequisite: VS Code user dir" }
  if (-not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE ".copilot") -PathType Container)) {
    Write-Fail "prerequisite: Copilot CLI" "%USERPROFILE%\.copilot missing — install GitHub Copilot CLI"
    $ok = $false
  } else { Write-Pass "prerequisite: Copilot CLI dir" }
  if (-not $ok) {
    Write-Host ""
    Write-Host "Install missing prerequisites and re-run." -ForegroundColor Red
    exit $Script:Fail
  }

  # ── Phase 1: Build ────────────────────────────────────────────────
  Write-Section "Build"
  Push-Location $Root
  try {
    & pnpm build 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Pass "pnpm build" } else { Write-Fail "pnpm build" }
  } finally { Pop-Location }

  $ver = Invoke-Tk @("--version")
  if ($ver.ExitCode -eq 0 -and $ver.AllText -match "\d+\.\d+") { Write-Pass "tk --version" $ver.AllText.Trim() }
  else { Write-Fail "tk --version" }

  if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
    Write-Fail "target is a git repo"
    exit 1
  }
  Write-Pass "target is a git repo"

  # ── Phase 2: Command proxy compression ────────────────────────────
  Write-Section "List / Read (Windows + POSIX)"
  Test-TkStats "ls ." @("ls", ".")
  Test-TkStats "dir ." @("dir", ".")
  if (Test-Path -LiteralPath "packages" -PathType Container) {
    Test-TkStats "ls packages/" @("ls", "packages/")
    Test-TkStats "dir packages" @("dir", "packages")
    Test-TkStats "find packages -name package.json" @("find", "packages", "-name", "package.json")
    Test-TkStats "tree -L 2 packages" @("tree", "-L", "2", "packages/")
    Test-TkStats "tree packages" @("tree", "packages/")
  } else {
    Test-TkStats "ls ." @("ls", ".")
    Test-TkStats "tree ." @("tree", ".")
  }
  if (Test-Path -LiteralPath "CONTEXT.md") {
    Test-TkStats "read CONTEXT.md" @("read", "CONTEXT.md")
  }
  Test-TkStats "read --level aggressive package.json" @("read", "--level", "aggressive", "package.json")
  Test-TkStats "cat package.json" @("cat", "package.json")
  Test-TkStats "type package.json" @("type", "package.json")

  Write-Section "Search"
  if (Test-Path -LiteralPath "packages") {
    Test-TkStats "rg export packages" @("rg", "export", "packages/")
    Test-TkStats "rg --level minimal export packages" @("rg", "--level", "minimal", "export", "packages/")
    Test-TkStats "grep -r workspace packages" @("grep", "-r", "workspace", "packages/")
  } else {
    Test-TkStats "rg export ." @("rg", "export", ".")
  }

  Write-Section "Git (read-only + dry-run)"
  Test-TkStats "git status" @("git", "status")
  Test-TkStats "git log --oneline -10" @("git", "log", "--oneline", "-10")
  Test-TkStats "git diff" @("git", "diff")
  Test-TkStats "git branch" @("git", "branch")
  Test-TkStats "git show -1 --stat" @("git", "show", "-1", "--stat")
  Test-TkStats "git worktree list" @("git", "worktree", "list")
  Test-TkStats "git add --dry-run ." @("git", "add", "--dry-run", ".")
  Test-TkStats "git commit -a --dry-run" @("git", "commit", "-a", "--dry-run", "-m", "tk-dogfood-test")
  Test-TkStats "git push --dry-run" @("git", "push", "--dry-run", "origin", "HEAD")

  Write-Section "pnpm / TypeScript"
  Test-TkStats "pnpm --version" @("pnpm", "--version")
  Test-TkStats "pnpm list --depth=0" @("pnpm", "list", "--depth=0")
  Test-TkStats "pnpm exec tsc --noEmit" @("pnpm", "exec", "tsc", "--noEmit")

  # ── Phase 3: Hook check (rewrite dry-run) ─────────────────────────
  Write-Section "Hook check (rewrite dry-run)"
  Test-HookCheck "hook: git status" @("git", "status")
  Test-HookCheck "hook: git commit" @("git", "commit", "-m", "test")
  Test-HookCheck "hook: git add ." @("git", "add", ".")
  Test-HookCheck "hook: pnpm list" @("pnpm", "list", "--depth=0")
  if (Test-Path -LiteralPath "packages") {
    Test-HookCheck "hook: rg export" @("rg", "export", "packages/")
  }
  Test-HookCheck "hook: read" @("read", "CONTEXT.md")
  Test-HookCheck "hook: ls" @("ls", ".")

  # ── Phase 4: Hook copilot protocol (stdin) ────────────────────────
  Write-Section "Hook copilot (stdin protocol)"
  $rewritePayload = '{"event":"preToolUse","toolName":"bash","toolArgs":"{\"command\":\"git status\"}"}'
  Test-HookCopilot "hook copilot: rewrite git status" $rewritePayload '"rewritten_command"\s*:\s*"tk git status"'
  $denyPayload = '{"event":"preToolUse","tool_name":"read_file","tool_input":{"filePath":"node_modules/x/i.js"}}'
  Test-HookCopilot "hook copilot: deny node_modules" $denyPayload '"decision"\s*:\s*"deny"'
  Test-HookCopilot "hook copilot: fail-open bad json" "}{" '"decision"\s*:\s*"allow"'

  # ── Phase 5: VS Code shim lifecycle ───────────────────────────────
  Write-Section "VS Code shim lifecycle"
  if ($PreviewInit) {
    Test-TkOk "init --host vscode --dry-run" @("init", "--host", "vscode", "--dry-run") {
      param($r) $r.AllText -match "\[dry-run\]"
    }
  } else {
    Test-TkOk "init --host vscode" @("init", "--host", "vscode") {
      param($r) $r.AllText -match "Active tier: shim"
    }
    if (Test-Path -LiteralPath (Join-Path $ShimDir "git.cmd")) { Write-Pass "shim wrapper git.cmd exists" }
    else { Write-Fail "shim wrapper git.cmd exists" }
    if (Test-Path -LiteralPath (Join-Path $ShimDir "rg.cmd")) { Write-Pass "shim wrapper rg.cmd exists" }
    else { Write-Fail "shim wrapper rg.cmd exists" }
    $status = Invoke-Tk @("shim", "status")
    if ($status.ExitCode -eq 0 -and $status.AllText -match "probe:\s+PASS") {
      Write-Pass "shim status + probe PASS"
    } else {
      Write-Fail "shim status + probe PASS"
      ($status.AllText -split "`n") | ForEach-Object { Write-Host "        $_" }
    }
    if (Test-Path -LiteralPath $VscodeSettings) {
      $settingsText = Get-Content -LiteralPath $VscodeSettings -Raw
      if ($settingsText -match "TK_SHIM_DIR" -and $settingsText -match "terminal\.integrated\.env\.windows") {
        Write-Pass "VS Code settings.json patched (windows terminal env)"
      } else {
        Write-Fail "VS Code settings.json patched" "missing TK_SHIM_DIR or terminal.integrated.env.windows"
      }
    } else {
      Write-Fail "VS Code settings.json exists"
    }
    $probePath = "$ShimDir;$env:PATH"
    $where = & cmd.exe /c "set PATH=$probePath&& where git" 2>&1 | Out-String
    if ($where -match [regex]::Escape($ShimDir)) { Write-Pass "where git resolves through shim (PATH prepend test)" $where.Trim() }
    else { Write-Fail "where git resolves through shim" "got: $($where.Trim())" }
  }

  # ── Phase 6: Copilot CLI hook lifecycle ───────────────────────────
  Write-Section "Copilot CLI hook lifecycle"
  if ($PreviewInit) {
    Test-TkOk "init --host copilot-cli --dry-run" @("init", "--host", "copilot-cli", "--dry-run") {
      param($r) $r.AllText -match "\[dry-run\].*tk-rewrite\.json"
    }
  } else {
    Test-TkOk "init --host copilot-cli" @("init", "--host", "copilot-cli") {
      param($r) $r.AllText -match "Active tier: hook"
    }
    if (Test-Path -LiteralPath $CopilotHook) {
      $hookText = Get-Content -LiteralPath $CopilotHook -Raw
      if ($hookText -match "tk hook copilot" -and $hookText -match "PreToolUse") {
        Write-Pass "Copilot hook config tk-rewrite.json" $CopilotHook
      } else {
        Write-Fail "Copilot hook config content" $CopilotHook
      }
    } else {
      Write-Fail "Copilot hook config exists" $CopilotHook
    }
  }

  Write-Section "Init status (both hosts)"
  $show = Invoke-Tk @("init", "--show")
  if ($show.ExitCode -eq 0) {
    Write-Pass "init --show"
    ($show.AllText -split "`n" | Select-Object -First 8) | ForEach-Object { Write-Host "        $_" }
  } else {
    Write-Fail "init --show"
  }

  # ── Phase 7: Context optimizer ────────────────────────────────────
  Write-Section "Context optimizer"
  $inspectOut = Join-Path $TmpDir "inspect.out"
  $inspect = Invoke-Tk @("inspect", "--project", "--copilot-context")
  $inspect.AllText | Set-Content -LiteralPath $inspectOut
  if ($inspect.ExitCode -eq 0 -or $inspect.AllText -match "Token Guard Inspect") {
    Write-Pass "inspect --project --copilot-context"
    (Get-Content -LiteralPath $inspectOut | Select-Object -First 10) | ForEach-Object { Write-Host "        $_" }
  } else {
    Write-Fail "inspect --project --copilot-context" "exit=$($inspect.ExitCode)"
  }

  $opt = Invoke-Tk @("optimize", "context", "--project", "--dry-run")
  if ($opt.ExitCode -eq 0 -and $opt.AllText -match "--dry-run") {
    Write-Pass "optimize context --project --dry-run"
    ($opt.AllText -split "`n" | Select-Object -First 8) | ForEach-Object { Write-Host "        $_" }
  } else {
    Write-Fail "optimize context --project --dry-run"
  }

  # ── Phase 8: Meta / report ────────────────────────────────────────
  Write-Section "Meta / report"
  Test-TkStats "report" @("--report")
  Test-TkOk "config show" @("config", "show") { param($r) $r.ExitCode -eq 0 }
  Test-TkOk "telemetry status" @("telemetry", "status") { param($r) $r.ExitCode -eq 0 }

  if ($Cleanup -and -not $PreviewInit) {
    Write-Section "Cleanup"
    Invoke-Tk @("init", "--uninstall") | Out-Null
    Invoke-Tk @("shim", "uninstall") | Out-Null
    Write-Pass "cleanup (init --uninstall + shim uninstall)"
  }

} finally {
  Pop-Location
  Remove-Item -LiteralPath $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "══════════════════════════════════════" -ForegroundColor White
Write-Host "Results: $($Script:Pass) passed, $($Script:Fail) failed" -ForegroundColor White
Write-Host "══════════════════════════════════════" -ForegroundColor White

if (-not $PreviewInit -and $Script:Fail -eq 0) {
  Write-Host ""
  Write-Host "Next: restart VS Code integrated terminal, then ask Copilot agent to run:" -ForegroundColor Yellow
  Write-Host "  git status / pnpm list --depth=0 / rg export packages" -ForegroundColor Yellow
  Write-Host "Copilot CLI sessions pick up hook rewrite automatically after init." -ForegroundColor Yellow
}

exit $Script:Fail
