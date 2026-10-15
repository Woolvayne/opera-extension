/*
 * protocol.js -- gemeinsame Konstanten und Basis-Tools.
 *
 * Diese Datei wird an ZWEI Stellen geladen und darf deshalb KEIN `export`
 * und KEIN `import` benutzen:
 *   1. als Classic-Script (importScripts) im Service-Worker
 *   2. als <script src="../src/protocol.js"> in der lokalen Bruecken-Seite
 *
 * ACHTUNG: Wenn du etwas aenderst, muss protocolVersion erhoeht werden,
 * damit Extension und lokale Bruecke wieder zusammenpassen.
 */
(function (global) {
  'use strict';

  var PROTOCOL_VERSION = 1;
  var DEFAULT_PORT = 8765;
  var LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

  var TOOL_DEFINITIONS = [
    {
      name: 'local_bridge_status',
      description:
        'Prueft, ob die lokale Bruecke auf diesem Windows-PC laeuft, und zeigt, was dort erlaubt ist (Befehl, Ordner, Lese-Rechte). Immer zuerst aufrufen, wenn eine Aufgabe den PC des Nutzers braucht.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'system_info',
      description:
        'Einfache Infos ueber den PC des Nutzers: Windows-Version, Benutzername, CPU, Arbeitsspeicher und Speicherplatz der Laufwerke.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'run_command',
      description:
        'Fuehrt einen Befehl auf dem Windows-PC des Nutzers aus (PowerShell, cmd, git, python, node, ...) und gibt stdout und stderr zurueck. Nutze das fuer Werkzeuge, die auf dem PC installiert sind, z.B. "winget list" oder "git log". Nicht fuer Web-Suchen benutzen -- dafuer gibt es die eingebaute Websuche.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Der auszufuehrende Befehl.' },
          shell: {
            type: 'string',
            enum: ['powershell', 'cmd'],
            description: 'Standard: powershell.'
          },
          cwd: {
            type: 'string',
            description: 'Optionales Arbeitsverzeichnis (nur Pfade innerhalb des erlaubten Ordners).'
          },
          timeout_ms: {
            type: 'integer',
            description: 'Maximale Laufzeit in Millisekunden (Standard 20000, Maximum 120000).'
          }
        },
        required: ['command'],
        additionalProperties: false
      }
    },
    {
      name: 'list_files',
      description:
        'Listet einen Ordner rekursiv im erlaubten Ordner auf (ohne System- und versteckte Ordner). Ideal, um vorhandene Dateien zu finden.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ordner, Standard ist der Wurzelordner.' },
          max_entries: { type: 'integer', description: 'Maximale Anzahl Eintraege (Standard 200, Maximum 2000).' }
        },
        additionalProperties: false
      }
    },
    {
      name: 'search_files',
      description:
        'Sucht Dateinamen im erlaubten Ordner. Beispiele: "*.csv", "rechnung*.pdf", "notiz*".',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Suchmuster (Wildcards * und ? erlaubt).' },
          path: { type: 'string', description: 'Startordner, Standard ist der Wurzelordner.' },
          max_results: { type: 'integer', description: 'Maximale Trefferzahl (Standard 100, Maximum 500).' }
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    {
      name: 'read_file',
      description:
        'Liest eine Textdatei aus dem erlaubten Ordner (z.B. .txt, .md, .csv, .json, .log). Fuer PDF, Word, Excel oder Bilder zuerst "get_file_info" oder "run_command" nutzen.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Pfad zur Datei.' },
          max_bytes: { type: 'integer', description: 'Maximale Anzahl Bytes (Standard 200000, Maximum 2000000).' },
          encoding: {
            type: 'string',
            enum: ['utf-8', 'auto'],
            description: 'Standard: auto (erkennt UTF-8 mit/ohne BOM und Windows-1252).'
          }
        },
        required: ['path'],
        additionalProperties: false
      }
    },
    {
      name: 'write_file',
      description:
        'Schreibt eine Textdatei in den erlaubten Ordner. Ohne append:true wird eine vorhandene Datei ueberschrieben.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Pfad zur Datei.' },
          content: { type: 'string', description: 'Inhalt der Datei.' },
          append: { type: 'boolean', description: 'true = anhaengen statt ueberschreiben.' },
          create_dirs: { type: 'boolean', description: 'Standard true: fehlende Ordner anlegen.' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    },
    {
      name: 'get_file_info',
      description: 'Zeigt Groesse, Typ und Aenderungsdatum einer Datei oder eines Ordners.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Pfad zur Datei oder zum Ordner.' }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  ];

  function joinUrl(base, path) {
    return String(base).replace(/\/+$/, '') + path;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = null;
    return new Promise(function (resolve, reject) {
      options = options || {};
      options.signal = controller.signal;
      timer = setTimeout(function () {
        try {
          controller.abort();
        } catch (e) {
          /* egal */
        }
        var err = new Error(
          'Zeitueberschreitung: Die lokale Bruecke hat nicht innerhalb von ' +
            Math.round((timeoutMs || 30000) / 1000) +
            ' s geantwortet. Laeuft das Fenster "Arena PC Bridge"?'
        );
        err.code = 'timeout';
        reject(err);
      }, timeoutMs || 30000);
      fetch(url, options).then(
        function (res) {
          clearTimeout(timer);
          resolve(res);
        },
        function (err) {
          clearTimeout(timer);
          if (err && err.name === 'AbortError') {
            var e2 = new Error('Verbindung zur lokalen Bruecke abgebrochen (Zeitueberschreitung).');
            e2.code = 'timeout';
            reject(e2);
          } else {
            reject(err);
          }
        }
      );
    });
  }

  async function bridgeFetch(bridgeUrl, path, options, timeoutMs) {
    try {
      return await fetchWithTimeout(joinUrl(bridgeUrl, path), options, timeoutMs || 30000);
    } catch (err) {
      if (err && err.code === 'timeout') throw err;
      var help =
        'Keine Verbindung zur lokalen Bruecke unter ' +
        bridgeUrl +
        '. Auf Windows: Starter installieren bzw. starten (install\\.cmd bzw. "Arena PC Bridge" auf dem Desktop) und im Browser-Tab "Arena PC Bridge - Verbindung" auf "Erlauben" klicken.';
      var e = new Error(help);
      e.code = 'bridge_offline';
      e.cause = err;
      throw e;
    }
  }

  async function getStatus(bridgeUrl) {
    var res = await bridgeFetch(bridgeUrl, '/status', { method: 'GET' }, 8000);
    if (!res.ok) throw new Error('Bruecke antwortet mit HTTP ' + res.status);
    return res.json();
  }

  function toolResult(obj) {
    return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
  }

  function toolError(message) {
    return {
      content: [{ type: 'text', text: 'Fehler: ' + message }],
      isError: true
    };
  }

  global.ArenaBridgeProtocol = {
    protocolVersion: PROTOCOL_VERSION,
    defaultPort: DEFAULT_PORT,
    localHosts: LOCAL_HOSTS,
    toolDefinitions: TOOL_DEFINITIONS,
    joinUrl: joinUrl,
    fetchWithTimeout: fetchWithTimeout,
    bridgeFetch: bridgeFetch,
    getStatus: getStatus,
    toolResult: toolResult,
    toolError: toolError
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
