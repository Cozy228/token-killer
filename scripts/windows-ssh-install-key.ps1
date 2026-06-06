# Install Mac SSH public key for administrators_authorized_keys (Windows OpenSSH).
# Run in elevated PowerShell: Right-click pwsh -> Run as administrator
#Requires -RunAsAdministrator

$pub = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA2rEujGe1KnGGgkgAbwKHvDNsSwk75SKDe0BBqOXZOS cozy2@mac"
$ak = "$env:PROGRAMDATA\ssh\administrators_authorized_keys"

New-Item -ItemType File -Path $ak -Force | Out-Null
Set-Content -Path $ak -Value $pub -Encoding utf8
icacls $ak /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null

Restart-Service sshd
Write-Host "OK: installed key to $ak"
Get-Content $ak
