<#
    install-shortcuts.ps1 -- legt die Desktop-Verknuepfungen an.
    Wird von install.cmd aufgerufen.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectDir
)

$ErrorActionPreference = 'Stop'
$ProjectDir = [System.IO.Path]::GetFullPath($ProjectDir).TrimEnd('\')
$startCmd = Join-Path $ProjectDir 'start.cmd'
$icon = Join-Path $ProjectDir 'extension\icons\icon.ico'
$desktop = [Environment]::GetFolderPath('Desktop')

if (-not (Test-Path -LiteralPath $startCmd)) {
    Write-Host "  FEHLER: start.cmd nicht gefunden in $ProjectDir" -ForegroundColor Red
    exit 1
}

$shell = New-Object -ComObject WScript.Shell
$entries = @(
    [pscustomobject]@{
        Name        = 'Arena PC Bridge'
        Arguments   = '-Commands -Write'
        Description = 'Arena PC Bridge: Lesen, Schreiben und Befehle erlaubt'
    },
    [pscustomobject]@{
        Name        = 'Arena PC Bridge - nur lesen'
        Arguments   = ''
        Description = 'Arena PC Bridge: nur Dateien lesen (sicher)'
    }
)

foreach ($entry in $entries) {
    $path = Join-Path $desktop ($entry.Name + '.lnk')
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = $startCmd
    $shortcut.Arguments = $entry.Arguments
    $shortcut.WorkingDirectory = $ProjectDir
    $shortcut.Description = $entry.Description
    if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = $icon }
    $shortcut.Save()
    Write-Host ('      -> ' + $path)
}

Write-Host '  Verknuepfungen angelegt.' -ForegroundColor Green
exit 0
