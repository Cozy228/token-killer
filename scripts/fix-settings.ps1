$settingsPath = "$env:USERPROFILE\.claude\settings.json"
$json = @'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "rtk hook claude"
          }
        ]
      }
    ]
  }
}
'@
Set-Content -Path $settingsPath -Value $json
Write-Host "settings.json written:"
Get-Content $settingsPath
