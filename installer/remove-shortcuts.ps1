<#
    remove-shortcuts.ps1 -- loescht die Desktop-Verknuepfungen wieder.
    Wird von uninstall.cmd aufgerufen.
#>
[CmdletBinding()]
param()

$desktop = [Environment]::GetFolderPath('Desktop')
$names = @('Arena PC Bridge.lnk', 'Arena PC Bridge - nur lesen.lnk')
foreach ($name in $names) {
    $path = Join-Path $desktop $name
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
        Write-Host ('  geloescht: ' + $name)
    }
}
exit 0
