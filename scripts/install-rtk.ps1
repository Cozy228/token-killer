$ErrorActionPreference = "Stop"

$binDir = "$env:USERPROFILE\.local\bin"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

Write-Host "Downloading rtk..."
$url = "https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-pc-windows-msvc.zip"
$zip = "$env:TEMP\rtk.zip"
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "Extracting..."
Expand-Archive -Path $zip -DestinationPath $binDir -Force
Remove-Item $zip

# Add to user PATH if not already present
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$binDir", "User")
    Write-Host "Added $binDir to user PATH"
} else {
    Write-Host "$binDir already in PATH"
}

Write-Host "rtk version:"
& "$binDir\rtk.exe" --version

Write-Host ""
Write-Host "Running rtk init -g..."
& "$binDir\rtk.exe" init -g

Write-Host ""
Write-Host "Testing rtk..."
& "$binDir\rtk.exe" git status
