# open-devcontainer.ps1
# Double-click this (or run from PowerShell) to reopen the Fluxer dev container
# in VS Code from Windows, even after you've closed the window.
#
# Prerequisites: VS Code + the "Dev Containers" extension must be installed.
# If you haven't already pinned this script somewhere handy, its Windows path is:
#   \\wsl.localhost\Ubuntu-24.04\home\math\dev\fluxer\open-devcontainer.ps1

$wslPath  = "/home/math/dev/fluxer"
$distro   = "Ubuntu-24.04"
# \\wsl.localhost\ is the modern UNC syntax (Windows 11); fall back to \\wsl$\ on older builds
$uncPath  = "\\wsl.localhost\$distro$($wslPath.Replace('/', '\'))"
if (-not (Test-Path $uncPath)) {
    $uncPath = "\\wsl$\$distro$($wslPath.Replace('/', '\'))"
}

if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
    Write-Error "VS Code CLI ('code') not found on PATH. Open VS Code once and enable 'Shell Command: Install code command in PATH' (Ctrl+Shift+P)."
    pause
    exit 1
}

Write-Host "Opening Fluxer devcontainer in VS Code..." -ForegroundColor Cyan
Write-Host "  Path: $uncPath" -ForegroundColor DarkGray

# -n opens a new window dedicated to this folder; VS Code auto-detects .devcontainer
# and reconnects to the running container (or offers to rebuild if it was stopped).
code -n $uncPath
