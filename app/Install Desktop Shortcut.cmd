@echo off
setlocal

cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-desktop-shortcut.ps1"

echo.
pause

endlocal
