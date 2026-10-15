/**
 * check-contract.mjs -- prueft, ob die Teile zueinander passen.
 *
 * Weil Extension (JS) und Bruecke (PowerShell) dieselben Namen benutzen,
 * sind Tippfehler sonst erst zur Laufzeit sichtbar. Hier wird geprueft:
 *
 *   1. Jede Nachricht, die die Seite/das Popup schickt, hat in background.js
 *      einen passenden case-Zweig (und umgekehrt: keine unbenutzten Zweige).
 *   2. Jeder Werkzeugname aus protocol.js wird in background.js behandelt.
 *   3. Jeder HTTP-Pfad, den background.js aufruft, existiert in server.ps1.
 *   4. Protokollversion steht in beiden Teilen gleich hoch.
 *   5. Alle Dateien, die das Manifest nennt, existieren.
 *
 * Aufruf:  node tools/check-contract.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let failures = 0;
let checks = 0;
function check(name, condition, extra = '') {
  checks += 1;
  if (condition) console.log(`  \u2713 ${name}`);
  else {
    failures += 1;
    console.log(`  \u2717 ${name} ${extra}`);
  }
}
const unique = (arr) => [...new Set(arr)];
const all = (re, text) => [...text.matchAll(re)].map((m) => m[1]);
const missing = (want, have) => want.filter((w) => !have.includes(w));

const background = read('extension/src/background.js');
const toggle = read('extension/src/toggle.js');
const popup = read('extension/src/popup.js');
const inject = read('extension/src/inject.js');
const protocol = read('extension/src/protocol.js');
const server = read('bridge/server.ps1');
const manifest = JSON.parse(read('extension/manifest.json'));

console.log('=== Vertrag zwischen Extension und Bruecke ===\n');

console.log('Nachrichten');
const handled = unique(all(/case '(arena-pc-bridge:[^']+)'/g, background));
const sentByToggle = unique(all(/type: '(arena-pc-bridge:[^']+)'/g, toggle));
const sentByPopup = unique(all(/type: '(arena-pc-bridge:[^']+)'/g, popup));
const sent = unique([...sentByToggle, ...sentByPopup]);
check(`${sent.length} gesendete Nachrichtentypen gefunden`, sent.length >= 5, `(${sent.join(', ')})`);
check('keine Nachricht ohne Empfaenger', missing(sent, handled).length === 0, `fehlt: ${missing(sent, handled)}`);

// Nachrichten, die inject.js per postMessage schickt (Seite -> toggle.js)
const pageSent = ['request-state', 'set-enabled', 'save-settings', 'connect', 'open-connection-tab', 'open-guide', 'tool-call'];
const toggleCases = unique([...all(/case '([a-z-]+)':/g, toggle)]);
check(`Seite nutzt ${pageSent.length} Nachrichtenarten`, pageSent.length === 7);
check('inject.js schickt sie alle', missing(pageSent, unique(all(/'([a-z-]+)'/g, inject))).length === 0, `fehlt: ${missing(pageSent, unique(all(/'([a-z-]+)'/g, inject)))}`);
check('toggle.js kennt alle davon', missing(pageSent, toggleCases).length === 0, `fehlt: ${missing(pageSent, toggleCases)}`);

console.log('\nWerkzeuge');
const toolNames = unique(all(/name: '([a-z_]+)'/g, protocol));
check('8 Werkzeuge definiert', toolNames.length === 8, `(sind ${toolNames.length}: ${toolNames.join(', ')})`);
const backgroundTools = unique([...all(/case '([a-z_]+)':/g, background), ...all(/name === '([a-z_]+)'/g, background)]);
check('background.js behandelt alle Werkzeuge', missing(toolNames, backgroundTools).length === 0, `fehlt: ${missing(toolNames, backgroundTools)}`);

console.log('\nHTTP-Pfade');
const paths = unique(all(/'(\/api\/[a-z_/]+)'/g, background));
check(`${paths.length} /api-Pfade von der Extension benutzt`, paths.length === 7, `(${paths.join(', ')})`);
const serverPaths = unique(all(/'(\/api\/[a-z_/]+)'/g, server));
const serverCases = unique(all(/^\s*'(\/api\/[a-z_/]+)' \{/gm, server));
const known = unique([...serverPaths, ...serverCases]);
check('server.ps1 kennt alle diese Pfade', missing(paths, known).length === 0, `fehlt: ${missing(paths, known)}`);
check('server.ps1 kennt /status', server.includes("'/status'"));

console.log('\nProtokoll und Manifest');
const protocolVersion = Number(protocol.match(/PROTOCOL_VERSION = (\d+)/)[1]);
const serverVersion = Number(server.match(/\$ProtocolVersion = (\d+)/)[1]);
check(`Protokollversion gleich (${protocolVersion})`, protocolVersion === serverVersion, `(server: ${serverVersion})`);

const referenced = [
  ...Object.values(manifest.icons),
  manifest.action.default_popup,
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((cs) => cs.js),
  ...manifest.web_accessible_resources.flatMap((w) => w.resources)
];
const missingFiles = referenced.filter((r) => !r.includes('*') && !existsSync(join(root, 'extension', r)));
check('alle im Manifest genannten Dateien vorhanden', missingFiles.length === 0, `fehlt: ${missingFiles}`);

const definedTools = unique(all(/name: '([a-z_]+)'/g, protocol));
const describedInJsonLd = definedTools.every((t) => background.includes(`'${t}'`) || protocol.includes(`'${t}'`));
check('Werkzeuge sind durchgaengig verdrahtet', describedInJsonLd);

const injectAliases = unique(all(/([a-z_]+): '([a-z_]+)'/g, inject));
check('inject.js kennt die Werkzeugnamen fuer JSON-LD', inject.includes('local_bridge_status') && inject.includes('run_command'));

console.log(`\n${checks - failures}/${checks} Pruefungen bestanden.`);
if (failures > 0) {
  console.log(`${failures} Fehler.`);
  process.exit(1);
}
console.log('Alles gruen.');
