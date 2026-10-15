<#
    server.ps1 -- Arena PC Bridge (lokaler Helfer fuer die Opera/Chrome-Extension)

    Kleiner HTTP-Server, der NUR auf 127.0.0.1 lauscht und der Browser-Extension
    erlaubt, auf diesem PC zu arbeiten:
        * Ordner auflisten, Dateien lesen/suchen/schreiben (nur im Arbeitsordner)
        * Befehle ausfuehren (PowerShell/cmd) -- nur wenn freigegeben

    Aufruf normalerweise ueber start.cmd, z.B.:
        start.cmd -Port 8765 -Commands -Write
    Alle Schalter:
        -Port <int>          Port (Standard 8765)
        -Root <Pfad>         Arbeitsordner (Standard: %USERPROFILE%\Documents\Arena Bridge Workspace)
        -Read / -NoRead      Dateien lesen erlauben (Standard: an)
        -Write / -NoWrite    Dateien schreiben erlauben (Standard: aus)
        -Commands / -NoCommands  Befehle ausfuehren erlauben (Standard: aus)
        -ResetConsent        Zugriff wieder sperren (Nutzer muss erneut "Erlauben" klicken)
        -Quiet               Weniger Ausgabe

    Sicherheit:
        * Bindet ausschliesslich an 127.0.0.1 -- von aussen nicht erreichbar.
        * Prueft Host- und Origin-Header (Schutz gegen DNS-Rebinding / fremde Webseiten).
        * Alle /api-Aufrufe brauchen den Header "X-Arena-Bridge: 1".
        * Ohne einmalige Zustimmung ("Erlauben") im Browser-Tab wird nichts ausgefuehrt.
        * Befehle, Schreiben und Lesen sind einzeln abschaltbar.
#>

[CmdletBinding()]
param(
    [int]$Port = 8765,
    [string]$Root = "",
    [switch]$Read,
    [switch]$NoRead,
    [switch]$Write,
    [switch]$NoWrite,
    [switch]$Commands,
    [switch]$NoCommands,
    [int]$MaxReadBytes = 5000000,
    [int]$MaxWriteBytes = 20000000,
    [int]$MaxOutputBytes = 200000,
    [int]$MaxCommandTimeoutSec = 120,
    [switch]$OpenBrowser,
    [switch]$ResetConsent,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ProtocolVersion = 1
$BridgeVersion = '1.0.0'

# ---------------------------------------------------------------------------
# Arbeitsordner & Einstellungen
# ---------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Join-Path $env:USERPROFILE 'Documents\Arena Bridge Workspace'
}
$script:Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')

if (-not (Test-Path -LiteralPath $script:Root)) {
    New-Item -ItemType Directory -Path $script:Root -Force | Out-Null
    $readme = Join-Path $script:Root 'LIESMICH.txt'
    if (-not (Test-Path -LiteralPath $readme)) {
        @"
Arbeitsordner von "Arena PC Bridge".
====================================

Alles, was Arena (arena.ai) ueber die Extension auf diesem PC tun darf,
passiert ausschliesslich in diesem Ordner:

  * Ordner auflisten und Dateien suchen
  * Textdateien lesen
  * Dateien schreiben (nur wenn freigegeben)

Ausserhalb dieses Ordners wird nichts gelesen oder geschrieben.
Der Zugriff ist nur von deinem Browser aus moeglich (127.0.0.1) und muss
im Browser einmal mit "Erlauben" bestaetigt werden.
"@ | Set-Content -LiteralPath $readme -Encoding UTF8
    }
}

$stateDir = Join-Path $script:Root '.arena-bridge'
if (-not (Test-Path -LiteralPath $stateDir)) {
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}
$settingsFile = Join-Path $stateDir 'settings.json'
$consentFile = Join-Path $stateDir 'consent.json'

function Read-JsonFile([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try {
        return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Write-JsonFile([string]$path, $object) {
    $object | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
}

$saved = Read-JsonFile $settingsFile
$allowRead = $true
$allowWrite = $false
$allowCommands = $false
if ($saved) {
    if ($null -ne $saved.allowRead) { $allowRead = [bool]$saved.allowRead }
    if ($null -ne $saved.allowWrite) { $allowWrite = [bool]$saved.allowWrite }
    if ($null -ne $saved.allowCommands) { $allowCommands = [bool]$saved.allowCommands }
}
if ($Read) { $allowRead = $true }
if ($NoRead) { $allowRead = $false }
if ($Write) { $allowWrite = $true }
if ($NoWrite) { $allowWrite = $false }
if ($Commands) { $allowCommands = $true }
if ($NoCommands) { $allowCommands = $false }

Write-JsonFile $settingsFile ([ordered]@{
    allowRead     = $allowRead
    allowWrite    = $allowWrite
    allowCommands = $allowCommands
    root          = $script:Root
    updatedAt     = (Get-Date).ToString('o')
})

$consent = Read-JsonFile $consentFile
if ($ResetConsent -or -not $consent) {
    $consent = [pscustomobject]@{ granted = $false; grantedAt = $null; origin = $null }
    Write-JsonFile $consentFile $consent
}
$script:ConsentGranted = [bool]$consent.granted

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------
$script:StartedAt = Get-Date
$script:RequestCount = 0

function Log-Info([string]$text, [string]$color = 'Gray') {
    if ($Quiet) { return }
    Write-Host ('[' + (Get-Date).ToString('HH:mm:ss') + '] ' + $text) -ForegroundColor $color
}

function Get-RelPath([string]$full) {
    $rootFull = $script:Root
    if ($full.Length -le $rootFull.Length) { return '' }
    $rel = $full.Substring($rootFull.Length).TrimStart('\')
    return $rel
}

function Resolve-SafePath([string]$requested) {
    if ([string]::IsNullOrWhiteSpace($requested)) { return $script:Root }
    $clean = $requested.Replace('/', '\').Trim()
    $candidate = $clean
    if (-not [System.IO.Path]::IsPathRooted($candidate)) {
        $candidate = Join-Path $script:Root $clean
    }
    $full = [System.IO.Path]::GetFullPath($candidate)
    $rootFull = $script:Root
    if ($full -eq $rootFull) { return $full }
    if (-not $full.StartsWith($rootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw [System.Exception]::new("Pfad liegt ausserhalb des erlaubten Ordners. Erlaubt ist nur: $rootFull")
    }
    return $full
}

# Ordner, die beim Suchen/Auflisten immer uebersprungen werden.
$script:SkipNames = @(
    '.git', '.svn', 'node_modules', '$RECYCLE.BIN', 'System Volume Information',
    'AppData', 'Windows', 'ProgramData', '.arena-bridge'
)

function Get-FilesRecursive([string]$start, [int]$maxDepth, [int]$maxItems) {
    $results = New-Object System.Collections.ArrayList
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue([pscustomobject]@{ path = $start; depth = 0 })
    while ($queue.Count -gt 0 -and $results.Count -lt $maxItems) {
        $current = $queue.Dequeue()
        $items = @()
        try {
            $items = Get-ChildItem -LiteralPath $current.path -Force -ErrorAction SilentlyContinue
        } catch {
            continue
        }
        foreach ($item in $items) {
            if ($results.Count -ge $maxItems) { break }
            $isDir = $item.PSIsContainer
            if ($script:SkipNames -contains $item.Name) { continue }
            if ($item.Attributes -band [System.IO.FileAttributes]::Hidden) { continue }
            if ($item.Attributes -band [System.IO.FileAttributes]::System) { continue }

            $entryType = 'datei'
            $entrySize = $null
            if ($isDir) {
                $entryType = 'ordner'
            } else {
                $entrySize = [int64]$item.Length
            }

            $null = $results.Add([ordered]@{
                name     = $item.Name
                path     = (Get-RelPath $item.FullName)
                type     = $entryType
                size     = $entrySize
                modified = $item.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
            })
            if ($isDir -and $current.depth -lt $maxDepth) {
                $queue.Enqueue([pscustomobject]@{ path = $item.FullName; depth = ($current.depth + 1) })
            }
        }
    }
    return $results
}

function Get-TextSmart([string]$full) {
    $bytes = [System.IO.File]::ReadAllBytes($full)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        return [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
    }
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
        return [System.Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2)
    }
    try {
        $strict = New-Object System.Text.UTF8Encoding($false, $true)
        return $strict.GetString($bytes)
    } catch {
        return [System.Text.Encoding]::GetEncoding(1252).GetString($bytes)
    }
}

function ConvertTo-Clipped([string]$text, [int]$maxBytes, [ref]$clipped) {
    if ($null -eq $text) { return '' }
    if ($text.Length -le $maxBytes) { return $text }
    $clipped.Value = $true
    $third = [int]($maxBytes / 3)
    return ($text.Substring(0, $third) + "`r`n`r`n... [gekuerzt: " + ($text.Length - $maxBytes) + ' Zeichen fehlen] ...' + "`r`n`r`n" + $text.Substring($text.Length - ($maxBytes - $third)))
}

function Invoke-Child([string]$command, [string]$shell, [string]$cwd, [int]$timeoutSec) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardInput = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $psi.WorkingDirectory = $cwd

    if ($shell -eq 'cmd') {
        $psi.FileName = 'cmd.exe'
        $psi.Arguments = '/d /s /c "' + $command + '"'
    } else {
        $prelude = '$ProgressPreference = ''SilentlyContinue''; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; '
        $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($prelude + $command))
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + $encoded
    }

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $null = $proc.Start()
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()

    $finished = $proc.WaitForExit($timeoutSec * 1000)
    if (-not $finished) {
        try { & taskkill.exe /T /F /PID $proc.Id 2>&1 | Out-Null } catch { }
        try { $proc.Kill() } catch { }
    }
    $sw.Stop()
    $stdout = ''
    $stderr = ''
    try { $stdout = $outTask.GetAwaiter().GetResult() } catch { }
    try { $stderr = $errTask.GetAwaiter().GetResult() } catch { }
    try { $proc.WaitForExit(2000) } catch { }

    $exitCode = -1
    if ($proc.HasExited) { $exitCode = $proc.ExitCode }

    return [ordered]@{
        stdout    = $stdout
        stderr    = $stderr
        exit_code = $exitCode
        timed_out = (-not $finished)
        seconds   = [math]::Round($sw.Elapsed.TotalSeconds, 2)
        shell     = $shell
        command   = $command
    }
}

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
$prefix = "http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.IgnoreWriteExceptions = $true
try {
    $listener.Start()
} catch [System.Net.HttpListenerException] {
    Write-Host ""
    Write-Host "Port $Port konnte nicht geoeffnet werden." -ForegroundColor Red
    Write-Host "Grund: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Moegliche Loesungen:" -ForegroundColor Yellow
    Write-Host "  * Anderen Port nehmen:  start.cmd -Port 8899   (und in der Extension den Port aendern)"
    Write-Host "  * Pruefen, ob schon ein Fenster 'Arena PC Bridge' laeuft."
    Write-Host "  * Einmal als Administrator starten (PowerShell -> Rechtsklick -> Als Administrator ausfuehren)."
    exit 1
}

$allowedOriginPatterns = @(
    '^chrome-extension://[a-z]+$',
    '^https?://([a-z0-9-]+\.)*arena\.ai$',
    '^https?://(127\.0\.0\.1|localhost)(:\d+)?$'
)
$allowedHosts = @("127.0.0.1:$Port", "localhost:$Port", "[::1]:$Port")

$script:LastStatus = 0

function Send-Json($context, [int]$status, $payload) {
    $script:LastStatus = $status
    $response = $context.Response
    $json = ''
    try {
        $json = ($payload | ConvertTo-Json -Depth 10 -Compress)
    } catch {
        $json = '{"error":"Antwort konnte nicht erzeugt werden"}'
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $status
    $response.ContentType = 'application/json; charset=utf-8'
    $response.Headers['Access-Control-Allow-Origin'] = '*'
    $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Arena-Bridge, X-Arena-Token'
    $response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $response.Headers['Cache-Control'] = 'no-store'
    try { $response.KeepAlive = $false } catch { }
    $response.ContentLength64 = $bytes.Length
    try {
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch { }
    try { $response.Close() } catch { }
}

function Send-Error($context, [int]$status, [string]$message) {
    Send-Json $context $status @{ ok = $false; error = $message }
}

function Get-Query($context) {
    $table = @{}
    foreach ($key in $context.Request.QueryString.AllKeys) {
        if ($null -eq $key) { continue }
        $table[$key] = $context.Request.QueryString[$key]
    }
    return $table
}

function Get-Body($context) {
    if (-not $context.Request.HasEntityBody) { return $null }
    $reader = New-Object System.IO.StreamReader($context.Request.InputStream, [System.Text.Encoding]::UTF8)
    $raw = $reader.ReadToEnd()
    $reader.Close()
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

function Test-Access($context, [string]$path) {
    $request = $context.Request
    $hostHeader = $request.Headers['Host']
    if ($hostHeader -and ($allowedHosts -notcontains $hostHeader)) {
        return 'Ungueltiger Host-Header. Dieses Fenster ist nur fuer 127.0.0.1 zustaendig.'
    }
    $origin = $request.Headers['Origin']
    if ($origin) {
        $okOrigin = $false
        foreach ($pattern in $allowedOriginPatterns) {
            if ($origin -match $pattern) { $okOrigin = $true; break }
        }
        if (-not $okOrigin) {
            return "Origin '$origin' ist nicht erlaubt. Nur die Extension und arena.ai duerfen zugreifen."
        }
    }
    if ($path.StartsWith('/api') -and $request.Headers['X-Arena-Bridge'] -ne '1') {
        return 'Der Header X-Arena-Bridge: 1 fehlt. Bitte den Aufruf ueber die Extension machen.'
    }
    return $null
}

function Get-StatusPayload {
    $statusMessage = 'Warte auf die einmalige Bestaetigung im Browser ("Erlauben").'
    if ($script:ConsentGranted) { $statusMessage = 'Bereit.' }

    return [ordered]@{
        ok           = $true
        name         = 'Arena PC Bridge'
        bridge       = $BridgeVersion
        protocol     = $ProtocolVersion
        pid          = $PID
        port         = $Port
        root         = $script:Root
        startedAt    = $script:StartedAt.ToString('o')
        requests     = $script:RequestCount
        consent      = $script:ConsentGranted
        permissions  = [ordered]@{
            allowRead     = $allowRead
            allowWrite    = $allowWrite
            allowCommands = $allowCommands
        }
        limits       = [ordered]@{
            maxReadBytes       = $MaxReadBytes
            maxWriteBytes      = $MaxWriteBytes
            maxOutputBytes     = $MaxOutputBytes
            commandTimeoutSec  = $MaxCommandTimeoutSec
        }
        api          = @(
            'GET /status',
            'GET /api/system_info',
            'GET /api/list_files',
            'GET /api/search_files',
            'GET /api/read_file',
            'GET /api/get_file_info',
            'POST /api/write_file',
            'POST /api/run_command',
            'POST /api/consent/allow',
            'POST /api/consent/reset'
        )
        message      = $statusMessage
    }
}

# ---------------------------------------------------------------------------
# Fenstertitel / Startausgabe
# ---------------------------------------------------------------------------
try { $Host.UI.RawUI.WindowTitle = "Arena PC Bridge - Port $Port" } catch { }

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor DarkCyan
Write-Host '     Arena PC Bridge  -  lokaler Helfer fuer opera/arena.ai' -ForegroundColor Cyan
Write-Host '  ============================================================' -ForegroundColor DarkCyan
Write-Host ''
Write-Host ("  Adresse        : http://127.0.0.1:{0}/" -f $Port) -ForegroundColor White
Write-Host ("  Arbeitsordner  : {0}" -f $script:Root) -ForegroundColor White
Write-Host ("  Lesen          : {0}" -f $(if ($allowRead) { 'ERLAUBT' } else { 'gesperrt' })) -ForegroundColor $(if ($allowRead) { 'Green' } else { 'DarkGray' })
Write-Host ("  Schreiben      : {0}" -f $(if ($allowWrite) { 'ERLAUBT' } else { 'gesperrt' })) -ForegroundColor $(if ($allowWrite) { 'Green' } else { 'DarkGray' })
Write-Host ("  Befehle        : {0}" -f $(if ($allowCommands) { 'ERLAUBT' } else { 'gesperrt' })) -ForegroundColor $(if ($allowCommands) { 'Green' } else { 'DarkGray' })
Write-Host ("  Zustimmung     : {0}" -f $(if ($script:ConsentGranted) { 'erteilt' } else { 'offen - im Browser auf "Erlauben" klicken' })) -ForegroundColor $(if ($script:ConsentGranted) { 'Green' } else { 'Yellow' })
Write-Host ''
Write-Host '  Dieses Fenster offen lassen. Beenden mit STRG+C.' -ForegroundColor DarkGray
Write-Host ''
Log-Info 'Warte auf Anfragen von der Extension ...' 'DarkGray'

if ($OpenBrowser -and -not $script:ConsentGranted) {
    Start-Process ("http://127.0.0.1:{0}/" -f $Port) | Out-Null
}

# ---------------------------------------------------------------------------
# Endpunkte
# ---------------------------------------------------------------------------
function Handle-Request($context) {
    $request = $context.Request
    $path = $request.Url.AbsolutePath
    $script:RequestCount++
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        if ($request.HttpMethod -eq 'OPTIONS') {
            Send-Json $context 200 @{ ok = $true; preflight = $true }
            return
        }

        $accessError = Test-Access $context $path
        if ($accessError) {
            Log-Info ("BLOCKIERT {0} {1} -> {2}" -f $request.HttpMethod, $path, $accessError) 'Yellow'
            Send-Error $context 403 $accessError
            return
        }

        $method = $request.HttpMethod

        # ---- Info-Seite (also die Adresse einfach im Browser aufrufen) ----
        if ($path -eq '/' -or $path -eq '/index.html') {
            $html = @"
<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>Arena PC Bridge laeuft</title>
<style>body{font:15px/1.6 "Segoe UI",system-ui,sans-serif;background:#0b1220;color:#dbe4f0;
margin:0;padding:40px}h1{font-size:22px}code{background:#0e1626;border:1px solid #26324a;border-radius:6px;
padding:1px 6px;color:#7dd3fc;font-family:Consolas,monospace}.ok{color:#34d399}.warn{color:#fbbf24}
button{font:inherit;cursor:pointer;border-radius:9px;border:0;padding:9px 14px;font-weight:700;
background:linear-gradient(90deg,rgba(16,185,129,.95),rgba(56,189,248,.9));color:#04121f;margin:10px 0}
pre{background:#0e1626;border:1px solid #26324a;border-radius:10px;padding:10px 12px;font-family:Consolas,monospace;
font-size:12.5px;color:#9fe6c8;white-space:pre-wrap}</style></head><body>
<h1>Arena PC Bridge laeuft <span class="ok">&#9679;</span></h1>
<p>Port <code>$Port</code> &middot; Arbeitsordner <code>$($script:Root)</code></p>
<p>Zustimmung: <b id="consent">$([string]$script:ConsentGranted)</b></p>
<p>Lesen: <b>$allowRead</b> &middot; Schreiben: <b>$allowWrite</b> &middot; Befehle: <b>$allowCommands</b></p>
<button id="allow">Jetzt erlauben (Browser-Zugriff freischalten)</button>
<p>Danach in der Extension auf arena.ai den Schalter unter der Chat-Eingabe auf AN stellen.</p>
<pre id="out">Bereit.</pre>
<script>
document.getElementById('allow').addEventListener('click', async function () {
  var out = document.getElementById('out');
  try {
    var res = await fetch('/api/consent/allow', { method: 'POST', headers: { 'X-Arena-Bridge': '1' } });
    var text = await res.text();
    out.textContent = 'HTTP ' + res.status + '\n' + text;
    if (res.ok) {
      document.getElementById('consent').textContent = 'True';
      document.getElementById('consent').className = 'ok';
    }
  } catch (err) { out.textContent = 'Fehler: ' + err.message; }
});
</script>
</body></html>
"@
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
            $response = $context.Response
            $response.StatusCode = 200
            $response.ContentType = 'text/html; charset=utf-8'
            try { $response.KeepAlive = $false } catch { }
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            return
        }

        # ---- Status (ohne Zustimmung lesbar) ----
        if ($path -eq '/status') {
            Send-Json $context 200 (Get-StatusPayload)
            return
        }

        # ---- Zustimmung ----
        if ($path -eq '/api/consent/allow') {
            $script:ConsentGranted = $true
            Write-JsonFile $consentFile ([ordered]@{
                granted   = $true
                grantedAt = (Get-Date).ToString('o')
                origin    = $request.Headers['Origin']
            })
            Log-Info 'Zustimmung erteilt - der Browser darf jetzt zugreifen.' 'Green'
            Send-Json $context 200 @{ ok = $true; granted = $true; root = $script:Root }
            return
        }
        if ($path -eq '/api/consent/reset') {
            $script:ConsentGranted = $false
            Write-JsonFile $consentFile ([ordered]@{ granted = $false; grantedAt = $null; origin = $null })
            Log-Info 'Zustimmung zurueckgesetzt.' 'Yellow'
            Send-Json $context 200 @{ ok = $true; granted = $false }
            return
        }

        # ---- ab hier ist die Zustimmung Pflicht ----
        if (-not $script:ConsentGranted) {
            Log-Info ("ABGELEHNT {0} {1} -> noch keine Zustimmung" -f $method, $path) 'Yellow'
            Send-Error $context 403 'Noch keine Zustimmung. Bitte im Browser-Tab der Extension auf "Erlauben" klicken.'
            return
        }

        $query = Get-Query $context
        $body = Get-Body $context

        switch ($path) {

            '/api/system_info' {
                $cpu = $null
                $ram = $null
                try {
                    $cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1)
                    $ram = (Get-CimInstance Win32_ComputerSystem | Select-Object -First 1)
                } catch { }
                $cpuName = $null
                $cpuCores = $null
                $ramGB = $null
                if ($cpu) {
                    $cpuName = $cpu.Name
                    $cpuCores = $cpu.NumberOfCores
                }
                if ($ram) { $ramGB = [math]::Round($ram.TotalPhysicalMemory / 1GB, 1) }
                $os = [System.Environment]::OSVersion.VersionString
                $drives = @()
                try {
                    $drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object {
                        [ordered]@{
                            name  = $_.Name
                            usedGB  = [math]::Round($_.Used / 1GB, 1)
                            freeGB  = [math]::Round($_.Free / 1GB, 1)
                        }
                    }
                } catch { }
                Send-Json $context 200 ([ordered]@{
                    ok            = $true
                    computer      = $env:COMPUTERNAME
                    benutzer      = $env:USERNAME
                    windows       = $os
                    powershell    = $PSVersionTable.PSVersion.ToString()
                    cpu           = $cpuName
                    cpu_kerne     = $cpuCores
                    ramGB         = $ramGB
                    laufwerke     = $drives
                    arbeitsordner = $script:Root
                    zeit          = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
                })
                break
            }

            '/api/list_files' {
                $target = Resolve-SafePath $query['path']
                if (-not (Test-Path -LiteralPath $target)) { Send-Error $context 404 "Nicht gefunden: $target"; break }
                $max = 200
                if ($query['max_entries']) { $max = [math]::Min([int]$query['max_entries'], 2000) }
                $depth = 2
                if ($query['depth']) { $depth = [math]::Min([int]$query['depth'], 6) }
                $items = Get-FilesRecursive $target $depth $max
                Send-Json $context 200 ([ordered]@{
                    ok      = $true
                    pfad    = (Get-RelPath ([System.IO.Path]::GetFullPath($target)))
                    anzahl  = $items.Count
                    eintraege = $items
                })
                break
            }

            '/api/search_files' {
                $searchQuery = [string]$query['query']
                if ([string]::IsNullOrWhiteSpace($searchQuery)) { Send-Error $context 400 'Parameter query fehlt.'; break }
                $max = 100
                if ($query['max_results']) { $max = [math]::Min([int]$query['max_results'], 500) }
                $start = Resolve-SafePath $query['path']
                if (-not (Test-Path -LiteralPath $start)) { Send-Error $context 404 "Startordner nicht gefunden: $start"; break }
                $pattern = $searchQuery
                if ($pattern -notmatch '[\*\?]') { $pattern = '*' + $pattern + '*' }
                $files = Get-FilesRecursive $start 6 5000
                $hits = @()
                foreach ($file in $files) {
                    if ($file.type -ne 'datei') { continue }
                    $name = $file.name
                    $match = $true
                    try { $match = $name -like $pattern } catch { $match = $false }
                    if ($match -or $name.ToLower().Contains($searchQuery.ToLower())) {
                        $hits += $file
                        if ($hits.Count -ge $max) { break }
                    }
                }
                Send-Json $context 200 ([ordered]@{
                    ok      = $true
                    suchmuster = $pattern
                    startordner = (Get-RelPath ([System.IO.Path]::GetFullPath($start)))
                    anzahl  = $hits.Count
                    treffer = $hits
                })
                break
            }

            '/api/get_file_info' {
                $target = Resolve-SafePath $query['path']
                if (-not (Test-Path -LiteralPath $target)) { Send-Error $context 404 "Nicht gefunden: $target"; break }
                $item = Get-Item -LiteralPath $target
                $itemType = 'ordner'
                $itemExtension = $null
                $itemSize = $null
                # .Length nur bei echten Dateien lesen (Ordner haben die Eigenschaft nicht).
                if (-not $item.PSIsContainer) {
                    $itemType = 'datei'
                    $itemExtension = $item.Extension
                    $itemSize = [int64]$item.Length
                }
                Send-Json $context 200 ([ordered]@{
                    ok        = $true
                    name      = $item.Name
                    pfad      = (Get-RelPath $item.FullName)
                    typ       = $itemType
                    endung    = $itemExtension
                    groesse   = $itemSize
                    erstellt  = $item.CreationTime.ToString('yyyy-MM-dd HH:mm:ss')
                    geaendert = $item.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
                    schreibgeschuetzt = [bool]$item.IsReadOnly
                })
                break
            }

            '/api/read_file' {
                if (-not $allowRead) { Send-Error $context 403 'Lesen ist nicht freigegeben (-NoRead bzw. Einstellung in der Extension).'; break }
                $target = Resolve-SafePath $query['path']
                if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { Send-Error $context 404 "Datei nicht gefunden: $target"; break }
                $maxBytes = $MaxReadBytes
                if ($query['max_bytes']) { $maxBytes = [math]::Min([int]$query['max_bytes'], $MaxReadBytes) }
                $info = Get-Item -LiteralPath $target
                if ($info.Length -gt ($maxBytes * 3)) {
                    Send-Error $context 413 ("Datei ist zu gross ({0} Bytes). Maximum: {1} Bytes." -f $info.Length, $maxBytes)
                    break
                }
                $text = Get-TextSmart $target
                $clipped = $false
                $ref = [ref]$clipped
                $out = ConvertTo-Clipped $text $maxBytes $ref
                Send-Json $context 200 ([ordered]@{
                    ok        = $true
                    pfad      = (Get-RelPath $info.FullName)
                    groesse   = [int64]$info.Length
                    geaendert = $info.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
                    gekuerzt  = $clipped
                    inhalt    = $out
                })
                break
            }

            '/api/write_file' {
                if (-not $allowWrite) { Send-Error $context 403 'Schreiben ist nicht freigegeben. In der Extension "Dateien schreiben" aktivieren und den Starter mit -Write neu starten.'; break }
                if (-not $body) { Send-Error $context 400 'JSON-Body fehlt.'; break }
                $target = Resolve-SafePath ([string]$body.path)
                $content = [string]$body.content
                if ($content.Length -gt $MaxWriteBytes) { Send-Error $context 413 'Inhalt ist zu gross.'; break }
                $dir = [System.IO.Path]::GetDirectoryName($target)
                $createDirs = $true
                if ($null -ne $body.create_dirs) { $createDirs = [bool]$body.create_dirs }
                if (-not (Test-Path -LiteralPath $dir)) {
                    if (-not $createDirs) { Send-Error $context 404 "Ordner existiert nicht: $dir"; break }
                    New-Item -ItemType Directory -Path $dir -Force | Out-Null
                }
                $utf8 = New-Object System.Text.UTF8Encoding($false)
                $append = $false
                if ($null -ne $body.append) { $append = [bool]$body.append }
                if ($append) {
                    [System.IO.File]::AppendAllText($target, $content, $utf8)
                } else {
                    [System.IO.File]::WriteAllText($target, $content, $utf8)
                }
                $info = Get-Item -LiteralPath $target
                Log-Info ("Schreibe {0} ({1} Zeichen)" -f (Get-RelPath $info.FullName), $content.Length) 'Cyan'
                Send-Json $context 200 ([ordered]@{
                    ok      = $true
                    pfad    = (Get-RelPath $info.FullName)
                    groesse = [int64]$info.Length
                    angehaengt = $append
                })
                break
            }

            '/api/run_command' {
                if (-not $allowCommands) { Send-Error $context 403 'Befehle sind nicht freigegeben. In der Extension "Befehle ausfuehren" aktivieren und den Starter mit -Commands neu starten.'; break }
                if (-not $body) { Send-Error $context 400 'JSON-Body fehlt.'; break }
                $command = [string]$body.command
                if ([string]::IsNullOrWhiteSpace($command)) { Send-Error $context 400 'Parameter command fehlt.'; break }
                $shell = 'powershell'
                if ($body.shell -eq 'cmd') { $shell = 'cmd' }
                $cwd = $script:Root
                if ($body.cwd) { $cwd = Resolve-SafePath ([string]$body.cwd) }
                if (-not (Test-Path -LiteralPath $cwd)) { $cwd = $script:Root }
                $timeoutSec = 20
                if ($body.timeout_ms) { $timeoutSec = [math]::Ceiling(([int]$body.timeout_ms) / 1000) }
                $timeoutSec = [math]::Max(1, [math]::Min($timeoutSec, $MaxCommandTimeoutSec))

                $noClip = $false
                $logCommand = ConvertTo-Clipped $command 400 ([ref]$noClip)
                Log-Info ("Fuehre aus [{0}]: {1}" -f $shell, $logCommand) 'Cyan'
                $result = Invoke-Child $command $shell $cwd $timeoutSec
                $clippedOut = $false
                $clippedErr = $false
                $refOut = [ref]$clippedOut
                $refErr = [ref]$clippedErr
                $outText = ConvertTo-Clipped $result.stdout $MaxOutputBytes $refOut
                $errText = ConvertTo-Clipped $result.stderr ([math]::Max(20000, [int]($MaxOutputBytes / 4))) $refErr
                Send-Json $context 200 ([ordered]@{
                    ok          = ($result.exit_code -eq 0 -and -not $result.timed_out)
                    exit_code   = $result.exit_code
                    timed_out   = $result.timed_out
                    dauer_s     = $result.seconds
                    shell       = $result.shell
                    befehl      = $result.command
                    stdout      = $outText
                    stderr      = $errText
                    gekuerzt    = ($clippedOut -or $clippedErr)
                    arbeitsordner = (Get-RelPath $cwd)
                })
                break
            }

            default {
                Send-Error $context 404 "Unbekannter Endpunkt: $path"
            }
        }

        Log-Info ("{0} {1} -> {2} ({3} ms)" -f $method, $path, $script:LastStatus, [math]::Round($sw.Elapsed.TotalMilliseconds)) 'DarkGray'
    } catch {
        $message = $_.Exception.Message
        Log-Info ("FEHLER {0} {1}: {2}" -f $request.HttpMethod, $path, $message) 'Red'
        if ($message -like '*ausserhalb des erlaubten Ordners*') {
            try { Send-Error $context 403 $message } catch { }
        } else {
            try { Send-Error $context 500 $message } catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# Endlosschleife
# ---------------------------------------------------------------------------
try {
    while ($true) {
        $context = $listener.GetContext()
        Handle-Request $context
    }
} finally {
    try { $listener.Stop(); $listener.Close() } catch { }
    Write-Host ''
    Log-Info 'Server beendet. Fenster kann geschlossen werden.' 'Yellow'
}
