$rtk = "$env:USERPROFILE\.local\bin\rtk.exe"
Set-Location "$env:USERPROFILE\workspace\contexa"

Write-Host "=== rtk --version ==="
& $rtk --version

Write-Host ""
Write-Host "=== rtk git status ==="
& $rtk git status

Write-Host ""
Write-Host "=== settings.json hook check ==="
$settings = Get-Content "$env:USERPROFILE\.claude\settings.json" -Raw | ConvertFrom-Json
$hasBash = ($settings.hooks.PreToolUse | Where-Object { $_.matcher -eq "Bash" }).Count
Write-Host "PreToolUse Bash hooks: $hasBash"

Write-Host ""
Write-Host "=== rtk.exe location ==="
Get-Command rtk.exe -ErrorAction SilentlyContinue | Select-Object Source
Write-Host ""
Write-Host "=== User PATH (rtk check) ==="
$up = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($up -like "*.local\bin*") { Write-Host "rtk in user PATH: YES" } else { Write-Host "rtk in user PATH: NO" }
