@echo off
:: Launcher for open-devcontainer.ps1
:: Double-click this .bat to reopen the Fluxer devcontainer in VS Code.
:: This file lives at: \\wsl.localhost\Ubuntu-24.04\home\math\dev\fluxer\open-devcontainer.bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-devcontainer.ps1"
