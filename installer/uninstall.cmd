@echo off
rem ===========================================================================
rem  uninstall.cmd - entfernt die Verknuepfungen wieder
rem
rem  -Shortcuts : nur die Desktop-Verknuepfungen loeschen (Standard)
rem  -Reset     : Zugriff sperren (Zustimmung zuruecknehmen)
rem  -All       : zusaetzlich den Arbeitsordner loeschen (mit Nachfrage)
rem ===========================================================================
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title Arena PC Bridge - Deinstallation

set "ALL=0"
set "RESET=0"

:parse
if "%~1"=="" goto run
if /i "%~1"=="-Shortcuts" set "ALL=%ALL%"
if /i "%~1"=="-All"       set "ALL=1"
if /i "%~1"=="-Reset"     set "RESET=1"
shift
goto parse

:run
echo.
echo  Entferne Desktop-Verknuepfungen ...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0remove-shortcuts.ps1"
if not "%RESET%"=="1" goto checkall
echo  Sperre den Zugriff (Zustimmung zuruecknehmen) ...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -ResetConsent -Quiet
echo  Zugriff gesperrt. Beim naechsten Start muss wieder "Erlauben" geklickt werden.

:checkall
if not "%ALL%"=="1" goto end
echo.
echo  ACHTUNG: Der Arbeitsordner wird komplett geloescht:
echo           %USERPROFILE%\Documents\Arena Bridge Workspace
set /p ANSWER="  Wirklich loeschen? (j/n) "
if /i "%ANSWER%"=="j" goto dodelete
echo  Arbeitsordner bleibt erhalten.
goto end

:dodelete
if exist "%USERPROFILE%\Documents\Arena Bridge Workspace" rmdir /s /q "%USERPROFILE%\Documents\Arena Bridge Workspace"
echo  Arbeitsordner entfernt.

:end
echo.
echo  Fertig. Die Extension selbst entfernst du in Opera unter
echo  opera://extensions ueber die Schaltflaeche "Entfernen".
echo.
pause
exit /b 0
