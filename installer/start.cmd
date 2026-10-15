@echo off
rem ===========================================================================
rem  start.cmd - startet die lokale Bruecke "Arena PC Bridge"
rem
rem  Doppelklick = Standard (Port 8765, nur Lesen erlaubt)
rem  Mit Schaltern:
rem      start.cmd -Port 8899
rem      start.cmd -Commands
rem      start.cmd -Write
rem      start.cmd -Root "C:\Users\DEINNAME\Downloads"
rem      start.cmd -ResetConsent
rem ===========================================================================
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title Arena PC Bridge

set "PORT=8765"
set "ROOT=%USERPROFILE%\Documents\Arena Bridge Workspace"
set "EXTRA="

:parse
if "%~1"=="" goto run
if /i "%~1"=="-Port"         goto setport
if /i "%~1"=="-Root"         goto setroot
if /i "%~1"=="-Commands"     set "EXTRA=%EXTRA% -Commands"
if /i "%~1"=="-Write"        set "EXTRA=%EXTRA% -Write"
if /i "%~1"=="-NoRead"       set "EXTRA=%EXTRA% -NoRead"
if /i "%~1"=="-NoCommands"   set "EXTRA=%EXTRA% -NoCommands"
if /i "%~1"=="-NoWrite"      set "EXTRA=%EXTRA% -NoWrite"
if /i "%~1"=="-ResetConsent" set "EXTRA=%EXTRA% -ResetConsent"
if /i "%~1"=="-OpenBrowser"  set "EXTRA=%EXTRA% -OpenBrowser"
if /i "%~1"=="-Quiet"        set "EXTRA=%EXTRA% -Quiet"
shift
goto parse

:setport
set "PORT=%~2"
shift
shift
goto parse

:setroot
set "ROOT=%~2"
shift
shift
goto parse

:run
where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo.
    echo  FEHLER: PowerShell wurde nicht gefunden.
    echo  Windows 10/11 hat PowerShell normalerweise dabei.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT% -Root "%ROOT%" %EXTRA%
set "CODE=%ERRORLEVEL%"

echo.
if not "%CODE%"=="0" (
    echo  Der Starter wurde mit Fehlercode %CODE% beendet.
) else (
    echo  Starter beendet.
)
echo  Fenster kann geschlossen werden ^(Enter^).
pause >nul
exit /b %CODE%
