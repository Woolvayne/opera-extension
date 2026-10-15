@echo off
rem ===========================================================================
rem  install.cmd - richtet "Arena PC Bridge" auf diesem PC ein
rem
rem  Macht nur drei Dinge:
rem    1. Arbeitsordner anlegen (%USERPROFILE%\Documents\Arena Bridge Workspace)
rem    2. zwei Verknuepfungen auf dem Desktop anlegen
rem    3. pruefen, ob PowerShell vorhanden ist
rem
rem  Es wird NICHTS installiert, kein Dienst eingerichtet und nichts
rem  im Autostart abgelegt. Deinstallieren = Verknuepfungen loeschen.
rem ===========================================================================
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title Arena PC Bridge - Einrichtung

echo.
echo  ============================================================
echo    Arena PC Bridge - Einrichtung
echo  ============================================================
echo.
echo  Projektordner: %~dp0
echo.

where powershell.exe >nul 2>&1
if errorlevel 1 goto nops
goto psok

:nops
echo  FEHLER: PowerShell wurde nicht gefunden. Bitte Windows Update ausfuehren.
echo.
pause
exit /b 1

:psok
set "WORKSPACE=%USERPROFILE%\Documents\Arena Bridge Workspace"
if exist "%WORKSPACE%" goto wsok
mkdir "%WORKSPACE%" >nul 2>&1
echo  [1/3] Arbeitsordner angelegt: %WORKSPACE%
goto shortcuts

:wsok
echo  [1/3] Arbeitsordner ist schon vorhanden: %WORKSPACE%

:shortcuts
echo  [2/3] Desktop-Verknuepfungen anlegen ...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-shortcuts.ps1" -ProjectDir "%~dp0."
if errorlevel 1 goto noShortcut
goto done

:noShortcut
echo  WARNUNG: Die Verknuepfungen konnten nicht angelegt werden.
echo           Kein Problem: start.cmd kann auch direkt per Doppelklick gestartet werden.

:done
echo  [3/3] Fertig.
echo.
echo  ============================================================
echo    Naechste Schritte
echo  ============================================================
echo.
echo   1. Desktop-Verknuepfung "Arena PC Bridge" starten.
echo      Das schwarze Fenster offen lassen, solange du Arena nutzt.
echo.
echo   2. In Opera:  opera://extensions
echo      - Entwicklermodus (oben rechts) einschalten
echo      - "Entpackte Erweiterung laden" anklicken
echo      - diesen Ordner waehlen:  %~dp0extension
echo.
echo   3. arena.ai oeffnen. Unter der Chat-Eingabe steht jetzt
echo      "Arena PC Bridge: AUS" - auf AN klicken.
echo.
echo   4. Einmalig erlauben: Extension-Symbol in der Leiste anklicken
echo      -^> "Verbindungs-Tab oeffnen" -^> "Jetzt erlauben" klicken.
echo.
echo   Weitere Start-Varianten:
echo      start.cmd                      nur Lesen (Standard)
echo      start.cmd -Commands            zusaetzlich Befehle erlauben
echo      start.cmd -Commands -Write     alles erlaubt
echo      start.cmd -Port 8899           anderer Port
echo      start.cmd -Root "C:\Pfad"      anderer Arbeitsordner
echo.
pause
exit /b 0
