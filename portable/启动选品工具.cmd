@echo off
setlocal

set "ROOT=%~dp0"
set "LAUNCHER=%ROOT%Start-ProductSelection.ps1"

if not exist "%LAUNCHER%" (
  echo Missing launcher file:
  echo %LAUNCHER%
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%LAUNCHER%"
