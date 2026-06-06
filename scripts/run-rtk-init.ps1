$ErrorActionPreference = "Stop"
$rtk = "$env:USERPROFILE\.local\bin\rtk.exe"

Write-Host "=== rtk cargo test ==="
& $rtk cargo test

Write-Host ""
Write-Host "=== Patching settings.json for hook ==="
$settingsPath = "$env:USERPROFILE\.claude\settings.json"
$hookConfig = @{
    hooks = @{
        PreToolUse = @(
            @{
                matcher = "Bash"
                hooks = @(
                    @{
                        type = "command"
                        command = "rtk hook claude"
                    }
                )
            }
        )
    }
}

if (Test-Path $settingsPath) {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
    $settings = @{}
}

# Check if hook already exists
$hasHook = $false
if ($settings.hooks -and $settings.hooks.PreToolUse) {
    foreach ($hook in $settings.hooks.PreToolUse) {
        if ($hook.matcher -eq "Bash") {
            foreach ($h in $hook.hooks) {
                if ($h.command -eq "rtk hook claude") {
                    $hasHook = $true
                    break
                }
            }
        }
    }
}

if (-not $hasHook) {
    if (-not $settings.hooks) { $settings | Add-Member -MemberType NoteProperty -Name hooks -Value @{} }
    if (-not $settings.hooks.PreToolUse) { $settings.hooks | Add-Member -MemberType NoteProperty -Name PreToolUse -Value @() }
    $settings.hooks.PreToolUse += $hookConfig.hooks.PreToolUse[0]
    $settings | ConvertTo-Json -Depth 4 | Set-Content $settingsPath
    Write-Host "Patched $settingsPath with rtk hook"
} else {
    Write-Host "Hook already present in $settingsPath"
}
