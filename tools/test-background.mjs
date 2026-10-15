/**
 * test-background.mjs -- automatischer Test fuer extension/src/background.js
 *
 * Simuliert die chrome.*-APIs (storage, tabs, action, alarms, notifications)
 * und eine lokale Bruecke als Gegenstelle von fetch(). Geprueft wird das,
 * was am ehesten kaputtgehen kann:
 *
 *   * Werkzeugname  ->  richtiger HTTP-Aufruf an die Bruecke (Pfad + Parameter)
 *   * Freigaben (lesen/schreiben/befehle) und Hauptschalter blockieren korrekt
 *   * Offline-Bruecke liefert eine verstaendliche Fehlermeldung
 *   * Einstellungen und Zustand laufen rund (State-Broadcast an Arena-Tabs)
 *
 * Aufruf:  node tools/test-background.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'extension', 'src');

let failures = 0;
let checks = 0;
function check(name, condition, extra = '') {
  checks += 1;
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${name} ${extra}`);
  }
}

/* ------------------------------------------------------------------ *
 * chrome.* nachbilden
 * ------------------------------------------------------------------ */
const store = new Map();
const messageListeners = [];
const sentToTabs = [];

globalThis.chrome = {
  runtime: {
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    getManifest: () => ({ version: '1.0.0' }),
    getURL: (p) => 'chrome-extension://testid/' + String(p).replace(/^\//, '')
  },
  storage: {
    local: {
      async get(keys) {
        if (!keys) return Object.fromEntries(store);
        if (typeof keys === 'string') {
          return store.has(keys) ? { [keys]: store.get(keys) } : {};
        }
        if (Array.isArray(keys)) {
          const out = {};
          keys.forEach((k) => {
            if (store.has(k)) out[k] = store.get(k);
          });
          return out;
        }
        return Object.fromEntries(store);
      },
      async set(obj) {
        Object.entries(obj).forEach(([k, v]) => store.set(k, v));
      }
    }
  },
  tabs: {
    async query() {
      return [
        { id: 1, url: 'https://arena.ai/agent' },
        { id: 2, url: 'https://example.com/' }
      ];
    },
    async sendMessage(tabId, message) {
      sentToTabs.push({ tabId, message });
    },
    onUpdated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
    async create() {
      return { id: 99 };
    },
    async reload() {}
  },
  action: {
    async setBadgeText() {},
    async setBadgeBackgroundColor() {}
  },
  alarms: {
    create: () => {},
    onAlarm: { addListener: () => {} }
  },
  notifications: { create: () => {} }
};

/* ------------------------------------------------------------------ *
 * Bruecke nachbilden
 * ------------------------------------------------------------------ */
const calls = [];
let bridgeOffline = false;

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
    async json() {
      return payload;
    }
  };
}

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const path = u.pathname;
  calls.push({
    method: options.method || 'GET',
    path,
    query: Object.fromEntries(u.searchParams),
    headers: options.headers || {},
    body: options.body ? JSON.parse(options.body) : null
  });
  if (bridgeOffline) throw new TypeError('fetch failed');

  switch (path) {
    case '/status':
      return jsonResponse(200, {
        ok: true,
        name: 'Arena PC Bridge',
        bridge: '1.0.0',
        protocol: 1,
        port: 8765,
        root: 'C:\\Users\\Test\\Documents\\Arena Bridge Workspace',
        consent: true,
        permissions: { allowRead: true, allowWrite: false, allowCommands: false },
        message: 'Bereit.',
        tools: ['Befehl', 'Ordner', 'Datei']
      });
    case '/api/system_info':
      return jsonResponse(200, { ok: true, computer: 'TEST-PC', ramGB: 32 });
    case '/api/run_command':
      return jsonResponse(200, { ok: true, exit_code: 0, stdout: 'Befehl lief', stderr: '' });
    case '/api/list_files':
      return jsonResponse(200, { ok: true, anzahl: 1, eintraege: [{ name: 'a.txt' }] });
    case '/api/search_files':
      return jsonResponse(200, { ok: true, anzahl: 0, treffer: [] });
    case '/api/read_file':
      return jsonResponse(200, { ok: true, inhalt: 'Inhalt der Datei' });
    case '/api/get_file_info':
      return jsonResponse(200, { ok: true, groesse: 1234 });
    case '/api/write_file':
      return jsonResponse(200, { ok: true, pfad: 'bericht.md' });
    default:
      return jsonResponse(404, { ok: false, error: 'unbekannt: ' + path });
  }
};

/* ------------------------------------------------------------------ *
 * background.js laden
 * ------------------------------------------------------------------ */
globalThis.importScripts = (...scripts) => {
  scripts.forEach((s) => {
    const file = join(srcDir, s.replace(/^\.\.\//, ''));
    vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });
  });
};
vm.runInThisContext(readFileSync(join(srcDir, 'background.js'), 'utf8'), {
  filename: join(srcDir, 'background.js')
});

function sendMessage(message) {
  return new Promise((resolve) => {
    if (!messageListeners.length) throw new Error('kein Listener registriert');
    messageListeners[0](message, { id: 'testid' }, resolve);
  });
}

const lastCall = (path) => [...calls].reverse().find((c) => c.path === path);

/* ================================================================== *
 * Tests
 * ================================================================== */
console.log('=== Tests fuer extension/src/background.js ===\n');

console.log('Zustand und Einstellungen');
let answer = await sendMessage({ type: 'arena-pc-bridge:get-state' });
check('get-state antwortet', answer.ok === true);
check('Standard: eingeschaltet', answer.settings.enabled === true);
check('Standard: Bruecken-URL auf 127.0.0.1:8765', answer.settings.bridgeUrl === 'http://127.0.0.1:8765');
check('Standard: Lesen erlaubt', answer.settings.allowRead === true);
check('Standard: Schreiben gesperrt', answer.settings.allowWrite === false);
check('Standard: Befehle gesperrt', answer.settings.allowCommands === false);
check('8 Werkzeuge werden gemeldet', (answer.tools || []).length === 8, `(sind ${(answer.tools || []).length})`);
check(
  'Werkzeuge haben JSON-Schema',
  (answer.tools || []).every((t) => t.name && t.description && t.input_schema && t.input_schema.type)
);

answer = await sendMessage({ type: 'arena-pc-bridge:tools/list' });
check('tools/list antwortet', answer.ok === true && answer.tools.length === 8);

console.log('\nVerbindungstest');
answer = await sendMessage({ type: 'arena-pc-bridge:connect' });
check('connect ist erfolgreich', answer.ok === true);
check('Zustand der Bruecke wird gelesen (root)', /Arena Bridge Workspace/.test(answer.status.root));
check('Verbunden-Zeitstempel gespeichert', Number(store.get('lastConnectedAt')) > 0);
check('State-Broadcast an Arena-Tab(s)', sentToTabs.some((s) => s.tabId === 1));
check(
  'Broadcast enthaelt Einstellungen',
  sentToTabs.some((s) => s.tabId === 1 && s.message.settings && s.message.settings.bridgeUrl)
);

console.log('\nlocal_bridge_status');
answer = await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'local_bridge_status', arguments: {} });
let payload = JSON.parse(answer.content[0].text);
check('meldet verbunden', payload.verbunden === true);
check('nennt den Arbeitsordner', /Arena Bridge Workspace/.test(payload.erlaubter_ordner));
check('nennt die Freigaben', payload.erlaubnis_befehle === false && payload.erlaubnis_schreiben === false);

console.log('\nErlaubte Werkzeuge (nur lesen)');
for (const [tool, args, expectedPath] of [
  ['system_info', {}, '/api/system_info'],
  ['list_files', { path: '', max_entries: 50 }, '/api/list_files'],
  ['search_files', { query: '*.pdf' }, '/api/search_files'],
  ['read_file', { path: 'notizen.txt' }, '/api/read_file'],
  ['get_file_info', { path: 'notizen.txt' }, '/api/get_file_info']
]) {
  calls.length = 0;
  answer = await sendMessage({ type: 'arena-pc-bridge:tools/call', name: tool, arguments: args });
  check(`${tool}: Aufruf an ${expectedPath}`, !!lastCall(expectedPath));
  check(
    `${tool}: Pflicht-Header gesetzt`,
    !!lastCall(expectedPath) && lastCall(expectedPath).headers['X-Arena-Bridge'] === '1'
  );
  check(`${tool}: Ergebnis ohne Fehler`, !answer.isError);
  check(`${tool}: Ergebnis ist JSON-Text`, !!answer.content && !!answer.content[0] && !!answer.content[0].text);
}
calls.length = 0;
await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'search_files', arguments: { query: '*rechnung*', path: 'Unterordner', max_results: 7 } });
check('search_files: query/path/max_results in der URL', lastCall('/api/search_files') && lastCall('/api/search_files').query.query === '*rechnung*' && lastCall('/api/search_files').query.path === 'Unterordner' && lastCall('/api/search_files').query.max_results === '7');
calls.length = 0;
await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'read_file', arguments: { path: 'a\\b.txt', max_bytes: 1234 } });
check('read_file: max_bytes in der URL', lastCall('/api/read_file') && lastCall('/api/read_file').query.max_bytes === '1234');
calls.length = 0;
await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'list_files', arguments: { max_entries: 42 } });
check('list_files: max_entries in der URL', lastCall('/api/list_files') && lastCall('/api/list_files').query.max_entries === '42');

console.log('\nGesperrte Werkzeuge');
calls.length = 0;
answer = await sendMessage({
  type: 'arena-pc-bridge:tools/call',
  name: 'run_command',
  arguments: { command: 'dir' }
});
check('run_command ohne Freigabe wird abgelehnt', answer.isError === true && /Befehle/.test(answer.content[0].text));
check('kein Aufruf an die Bruecke', !lastCall('/api/run_command'));

calls.length = 0;
answer = await sendMessage({
  type: 'arena-pc-bridge:tools/call',
  name: 'write_file',
  arguments: { path: 'x.txt', content: 'hallo' }
});
check('write_file ohne Freigabe wird abgelehnt', answer.isError === true && /Schreiben/.test(answer.content[0].text));
check('kein Aufruf an die Bruecke (schreiben)', !lastCall('/api/write_file'));

console.log('\nFreigaben einschalten');
answer = await sendMessage({
  type: 'arena-pc-bridge:save-settings',
  patch: { allowCommands: true, allowWrite: true, port: 8765 }
});
check('save-settings antwortet', answer.ok === true && answer.settings.allowCommands === true && answer.settings.allowWrite === true);

calls.length = 0;
answer = await sendMessage({
  type: 'arena-pc-bridge:tools/call',
  name: 'run_command',
  arguments: { command: 'Get-ChildItem', shell: 'powershell', timeout_ms: 15000 }
});
check('run_command geht jetzt an die Bruecke', !!lastCall('/api/run_command'));
check('run_command ist POST', lastCall('/api/run_command').method === 'POST');
check(
  'run_command sendet command/shell/timeout',
  lastCall('/api/run_command').body.command === 'Get-ChildItem' &&
    lastCall('/api/run_command').body.shell === 'powershell' &&
    lastCall('/api/run_command').body.timeout_ms === 15000
);
check('run_command liefert stdout zurueck', !answer.isError && /Befehl lief/.test(answer.content[0].text));

calls.length = 0;
answer = await sendMessage({
  type: 'arena-pc-bridge:tools/call',
  name: 'write_file',
  arguments: { path: 'bericht.md', content: '# Bericht', append: true }
});
check('write_file ist POST', lastCall('/api/write_file') && lastCall('/api/write_file').method === 'POST');
check(
  'write_file sendet path/content/append',
  lastCall('/api/write_file').body.path === 'bericht.md' &&
    lastCall('/api/write_file').body.content === '# Bericht' &&
    lastCall('/api/write_file').body.append === true
);

console.log('\nVerlauf');
check('Verlauf enthaelt Befehls-Aufruf', (store.get('history') || []).some((h) => h.tool === 'run_command'));
check('Verlauf enthaelt Schreib-Aufruf', (store.get('history') || []).some((h) => h.tool === 'write_file'));
answer = await sendMessage({ type: 'arena-pc-bridge:clear-history' });
check(
  'Verlauf laesst sich loeschen',
  answer.ok === true && (store.get('history') || []).length === 0
);

console.log('\nHauptschalter aus');
await sendMessage({ type: 'arena-pc-bridge:set-enabled', enabled: false });
calls.length = 0;
answer = await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'system_info', arguments: {} });
check('system_info wird bei AUS abgelehnt', answer.isError === true && /AUS/.test(answer.content[0].text));
check('kein Aufruf an die Bruecke bei AUS', !lastCall('/api/system_info'));
answer = await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'local_bridge_status', arguments: {} });
check('Status-Abfrage bleibt erlaubt', !answer.isError);

await sendMessage({ type: 'arena-pc-bridge:set-enabled', enabled: true });

console.log('\nBruecke offline');
bridgeOffline = true;
answer = await sendMessage({ type: 'arena-pc-bridge:connect' });
check('connect meldet Fehler', answer.ok === false && !!answer.error);
answer = await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'system_info', arguments: {} });
check('Werkzeug meldet Fehler', answer.isError === true);
check(
  'Fehlermeldung nennt starter/verbindung',
  /Bruecke|Starter|install/i.test(answer.content[0].text),
  answer.content[0].text.slice(0, 120)
);
bridgeOffline = false;

console.log('\nUnbekanntes Werkzeug');
answer = await sendMessage({ type: 'arena-pc-bridge:tools/call', name: 'gibt_es_nicht', arguments: {} });
check('unbekanntes Werkzeug wird abgelehnt', answer.isError === true);

console.log(`\n${checks - failures}/${checks} Pruefungen bestanden.`);
if (failures > 0) {
  console.log(`${failures} Fehler.`);
  process.exit(1);
}
console.log('Alles gruen.');
process.exit(0);
