<#
  tk-baseline-probe.ps1
  ---------------------------------------------------------------------------
  Collects REFERENCE baseline numbers for tk runtime startup on a Windows box.

  PURPOSE: feed one real (corporate-AV) data point + magnitudes into a perf
  optimization plan. These numbers are REFERENCE ONLY — a single machine's
  Node version and a single box's AV behavior do NOT validate or size the
  field-wide result (the package is distributed across many Node versions and
  AV setups). They confirm correctness, relative ordering, and magnitudes.

  WHERE TO RUN: PowerShell on the TARGET box (Windows PowerShell 5.1 or
  PowerShell 7; VS Code integrated terminal is fine if its profile is
  PowerShell). Self-contained — resolves real git/tk by absolute path, so it
  does NOT depend on whether the tk shim is active in this shell.

  USAGE:
    powershell -ExecutionPolicy Bypass -File tk-baseline-probe.ps1
  Writes a report to %USERPROFILE%\tk-baseline-<host>-<timestamp>.txt and
  prints its path at the end. Paste that file back.
#>

$ErrorActionPreference = 'Continue'
$script:lines = New-Object System.Collections.Generic.List[string]
function Log([string]$s = '') { $script:lines.Add($s); Write-Host $s }
function Section([string]$t) { Log ''; Log ('=' * 72); Log "## $t"; Log ('=' * 72) }

# Median-of-N timer. The measured block's own stdout is discarded so only the
# timing is recorded. Returns nothing; logs a formatted line.
function Med([string]$label, [scriptblock]$cmd, [int]$n = 9) {
  $t = @()
  foreach ($i in 1..$n) {
    try { $t += (Measure-Command { & $cmd *> $null }).TotalMilliseconds }
    catch { Log ('{0,-26} ERROR: {1}' -f $label, $_.Exception.Message); return }
  }
  $sorted = $t | Sort-Object
  $median = $sorted[[int]($n / 2)]
  $min = ($t | Measure-Object -Minimum).Minimum
  $max = ($t | Measure-Object -Maximum).Maximum
  Log ('{0,-26} median {1,7:N0} ms   (min {2,6:N0} / max {3,6:N0}, n={4})' -f $label, $median, $min, $max, $n)
}

Section "tk baseline probe"
Log "generated (local time): $(Get-Date -Format o)"
Log "script version: 1"

# --------------------------------------------------------------------------
Section "1. Machine + OS (slow-box context)"
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $cs = Get-CimInstance Win32_ComputerSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  Log "OS              : $($os.Caption) build $($os.BuildNumber)"
  Log "Manufacturer    : $($cs.Manufacturer) $($cs.Model)"
  Log "CPU             : $($cpu.Name.Trim()) ($($cpu.NumberOfCores)C/$($cpu.NumberOfLogicalProcessors)T)"
  Log ("RAM (GB)        : {0:N1}" -f ($cs.TotalPhysicalMemory / 1GB))
  Log "PowerShell      : $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
  Log "Hostname        : $env:COMPUTERNAME"
} catch { Log "machine info ERROR: $($_.Exception.Message)" }

# --------------------------------------------------------------------------
Section "2. Node / tk install facts"
# NOTE: this machine's Node version is ONE SAMPLE of the distributed field, not
# a design input — used only to interpret which Node band these timings sit in.
try { Log "node --version  : $(node --version 2>&1)" } catch { Log "node --version ERROR" }
try {
  $hasCC = node -e "process.stdout.write(typeof require('node:module').enableCompileCache)" 2>&1
  Log "enableCompileCache typeof : $hasCC   ('function' => Node >= 22.8, compile cache active)"
} catch { Log "compileCache probe ERROR: $($_.Exception.Message)" }

$home2 = $env:USERPROFILE
$manifestPath = Join-Path $home2 '.token-killer\shim\manifest.json'
$node = 'node'; $cli = $null; $shimDir = $null
if (Test-Path $manifestPath) {
  try {
    $m = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $node = $m.tk.bin
    $cli = $m.tk.args[0]
    $shimDir = $m.dir
    Log "manifest schema : $($m.schema)   tk version: $($m.version)   installedAt: $($m.installedAt)"
    Log "shim dir        : $shimDir"
    Log "shim programs   : $($m.programs -join ', ')"
    Log "tk node bin     : $node"
    Log "tk cli entry    : $cli"
  } catch { Log "manifest parse ERROR: $($_.Exception.Message)" }
} else {
  Log "manifest NOT found at $manifestPath — shim not installed?"
  # fall back to resolving cli via global tk if present
  try {
    $tkCmd = (Get-Command tk -ErrorAction Stop).Source
    Log "global tk       : $tkCmd"
  } catch { Log "global tk       : NOT on PATH" }
}

# dist chunk count + total size (AV file-count argument for single-file bundle)
if ($cli -and (Test-Path $cli)) {
  try {
    $dist = Split-Path $cli
    $js = Get-ChildItem $dist -Filter *.js -ErrorAction Stop
    $sum = ($js | Measure-Object Length -Sum).Sum
    Log "dist dir        : $dist"
    Log ("dist .js chunks : {0} files, {1:N0} KB total" -f $js.Count, ($sum / 1KB))
  } catch { Log "dist scan ERROR: $($_.Exception.Message)" }
}

# --------------------------------------------------------------------------
Section "3. PATH / PATHEXT (resolveProgram fs.stat-storm magnitude)"
$pathEntries = ($env:PATH -split ';') | Where-Object { $_ }
$pathExt = ($env:PATHEXT -split ';') | Where-Object { $_ }
Log "PATH entries    : $($pathEntries.Count)"
Log "PATHEXT entries : $($pathExt.Count)   ($($pathExt -join ';'))"
Log ("worst-case stat per command (entries x ext) : {0}" -f ($pathEntries.Count * $pathExt.Count))
Log ''
Log "PATH (one per line):"
$i = 0; foreach ($p in $pathEntries) { $i++; Log ("  [{0,2}] {1}" -f $i, $p) }

# resolve real git (NOT the tk shim wrapper) for an honest bare-git baseline
$realGit = $null
try {
  $cands = where.exe git 2>$null
  $realGit = $cands | Where-Object { $_ -notmatch '\.token-killer' } | Select-Object -First 1
} catch {}
if (-not $realGit) { $realGit = 'git' }
Log ''
Log "real git resolved to : $realGit"

# --------------------------------------------------------------------------
Section "4. Endpoint security / AV present (env that amplifies fixed cost)"
try {
  $mp = Get-MpComputerStatus -ErrorAction Stop
  Log "Defender RealTimeProtectionEnabled : $($mp.RealTimeProtectionEnabled)"
  Log "Defender AntimalwareEnabled        : $($mp.AntivirusEnabled)"
} catch { Log "Get-MpComputerStatus unavailable (likely 3rd-party AV is primary)" }
try {
  $edr = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'CSFalcon|CrowdStrike|csagent|cb|carbonblack|Sophos|Sentinel|cylance|MsMpEng|SecurityHealth|wdfilter' } |
    Select-Object -ExpandProperty Name -Unique
  if ($edr) { Log "EDR/AV processes : $($edr -join ', ')" } else { Log "EDR/AV processes : none matched (may be kernel-only)" }
} catch { Log "EDR scan ERROR: $($_.Exception.Message)" }

# --------------------------------------------------------------------------
Section "5. Segment baselines (medians replace the single-shot I5 numbers)"
Log "cwd: $(Get-Location)"
if (-not (Test-Path .git) -and -not (git rev-parse --git-dir 2>$null)) {
  Log "WARNING: cwd is not a git repo — 'git status' timings will not be representative."
  Log "         Re-run from inside a real repo (e.g. the tk source checkout)."
}
Log ''
Med 'node -e 0 (cold floor)'      { node -e "0" }
if ($cli) {
  Med 'node cli --version'        { & $node $cli --version }
  Med 'tk git status'             { & $node $cli git status }
  Med 'tk --raw git status'       { & $node $cli --raw git status }
}
Med 'bare git status --short'     { & $realGit status --short }

# --------------------------------------------------------------------------
Section "6. Compile-cache cold->warm (reference; effective only on Node >= 22.1)"
if ($cli) {
  $cold = Join-Path $env:TEMP ('tkcc-' + [guid]::NewGuid().ToString('N'))
  Remove-Item $cold -Recurse -Force -ErrorAction SilentlyContinue
  $env:NODE_COMPILE_CACHE = $cold
  Log "fresh NODE_COMPILE_CACHE = $cold"
  Log "5 sequential 'node cli --version' runs (run #1 builds cache, #2+ should drop if cache works):"
  foreach ($k in 1..5) {
    try {
      $ms = (Measure-Command { & $node $cli --version *> $null }).TotalMilliseconds
      Log ("  run #{0}: {1,7:N0} ms" -f $k, $ms)
    } catch { Log "  run #$k ERROR: $($_.Exception.Message)" }
  }
  $cacheFiles = 0
  if (Test-Path $cold) { $cacheFiles = (Get-ChildItem $cold -Recurse -File -ErrorAction SilentlyContinue).Count }
  Log "compile-cache files written: $cacheFiles  (0 => Node < 22.1 ignored NODE_COMPILE_CACHE, no caching)"
  Remove-Item Env:\NODE_COMPILE_CACHE -ErrorAction SilentlyContinue
  Remove-Item $cold -Recurse -Force -ErrorAction SilentlyContinue
} else {
  Log "skipped — tk cli entry not resolved."
}

# --------------------------------------------------------------------------
Section "Done"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $home2 ("tk-baseline-$env:COMPUTERNAME-$stamp.txt")
$script:lines | Out-File -FilePath $out -Encoding utf8
Write-Host ''
Write-Host "Report written to: $out" -ForegroundColor Green
Write-Host "Paste that file back." -ForegroundColor Green
