/**
 * test-extension.mjs -- automatischer Test fuer extension/src/inject.js
 *
 * Simuliert eine arena.ai-Seite mit Chat-Eingabefeld und eine "Gegenstelle"
 * (das, was normalerweise toggle.js + background.js machen) und prueft:
 *
 *   1. Wird die Leiste unter der Chat-Eingabe eingefuegt?
 *   2. Klappt der Ein/Aus-Schalter (Nachricht an die Extension + Anzeige)?
 *   3. Stehen JSON-LD (#arena-local-tools) und window.ArenaLocalTools bereit?
 *   4. Kommen Werkzeug-Aufrufe (ArenaLocalTools.call) korrekt zurueck?
 *   5. Ersatz-Anzeige im Eck, wenn es kein Eingabefeld gibt?
 *   6. Keine Leiste auf der /bridge-Seite?
 *
 * Aufruf:  node tools/test-extension.mjs   (braucht: npm install)
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const injectCode = read('extension/src/inject.js');
const protocolCode = read('extension/src/protocol.js');

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Hilfsmittel: Geometrie simulieren (jsdom rechnet kein Layout)
 * ------------------------------------------------------------------ */
function installLayout(window, rects) {
  window.Element.prototype.getBoundingClientRect = function () {
    const rect = rects(this);
    return {
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON() {
        return rect;
      }
    };
  };
}

/* ------------------------------------------------------------------ *
 * "Gegenseite" der Extension (das, was toggle.js/background.js tun)
 * ------------------------------------------------------------------ */
function installFakeExtension(window, state, log) {
  let id = 0;
  const reply = (payload) => window.postMessage({ ...payload, source: 'arena-pc-bridge-ext' }, window.location.origin);

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== 'arena-pc-bridge-page') return;

    switch (data.type) {
      case 'request-state':
        reply({
          type: 'state',
          settings: { ...state.settings },
          tools: state.tools
        });
        break;
      case 'set-enabled':
        state.settings.enabled = data.enabled;
        state.settings.lastConnectedAt = data.enabled ? Date.now() : 0;
        log.push({ type: 'set-enabled', enabled: data.enabled });
        reply({ type: 'state', settings: { ...state.settings }, tools: state.tools });
        break;
      case 'connect':
        state.connected = true;
        state.settings.lastConnectedAt = Date.now();
        reply({ type: 'connect-result', id: data.id, result: { ok: true } });
        break;
      case 'tool-call':
        log.push({ type: 'tool-call', name: data.name, args: data.arguments });
        reply({
          type: 'tool-result',
          id: data.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  werkzeug: data.name,
                  argumente: data.arguments,
                  computer: 'TEST-PC'
                })
              }
            ]
          }
        });
        break;
      case 'save-settings':
        Object.assign(state.settings, data.patch);
        log.push({ type: 'save-settings', patch: data.patch });
        reply({ type: 'state', settings: { ...state.settings }, tools: state.tools });
        break;
      case 'open-connection-tab':
        log.push({ type: 'open-connection-tab' });
        break;
      case 'open-guide':
        log.push({ type: 'open-guide' });
        break;
      default:
        break;
    }
    id += 1;
  });

  // In echten Browsern ist bei window.postMessage(event.source === window).
  // jsdom setzt source nicht -> hier nachbilden.
  const originalPost = window.postMessage.bind(window);
  window.postMessage = function (data, origin) {
    const event = new window.MessageEvent('message', {
      data,
      origin: origin || window.location.origin,
      source: window
    });
    setTimeout(() => window.dispatchEvent(event), 0);
  };
  return () => originalPost;
}

/* ------------------------------------------------------------------ *
 * Seite bauen
 * ------------------------------------------------------------------ */
const PAGE = `<!DOCTYPE html><html><head><title>Arena</title></head>
<body>
  <div id="app">
    <header><input id="search" placeholder="Suchen" /></header>
    <main>Chatverlauf</main>
    <div id="composer-wrap">
      <div id="composer-inner">
        <textarea id="prompt" placeholder="Nachricht an Arena schreiben"></textarea>
        <button id="send">Senden</button>
      </div>
    </div>
  </div>
</body></html>`;

const PAGE_NO_COMPOSER = `<!DOCTYPE html><html><head><title>Arena</title></head>
<body><div id="app"><main>Chatverlauf ohne Eingabefeld</main></div></body></html>`;

function buildWindow(html, url, state) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    failures += 1;
    console.log('  \u2717 jsdom-Fehler:', err.message);
  });
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const window = dom.window;
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });

  const log = [];
  const restore = installFakeExtension(window, state, log);

  // Layout nachbilden
  installLayout(window, (el) => {
    const id = el.id || '';
    if (el.tagName === 'ARENA-PC-BRIDGE-BAR') return { left: 300, top: 780, width: 700, height: 24 };
    if (id === 'search') return { left: 500, top: 20, width: 400, height: 32 };
    if (id === 'prompt') return { left: 320, top: 700, width: 620, height: 64 };
    if (id === 'send') return { left: 950, top: 700, width: 60, height: 40 };
    if (id === 'composer-inner') return { left: 300, top: 680, width: 700, height: 100 };
    if (id === 'composer-wrap') return { left: 300, top: 676, width: 700, height: 108 };
    if (id === 'app') return { left: 0, top: 0, width: 1400, height: 900 };
    return { left: 0, top: 0, width: 0, height: 0 };
  });

  window.eval(protocolCode);
  const tools = window.ArenaBridgeProtocol.toolDefinitions;
  state.tools = tools;
  window.eval(injectCode);
  return { dom, window, log, restore, tools };
}

/* ================================================================== *
 * Test 1: Normale Chat-Seite
 * ================================================================== */
async function testNormalPage() {
  console.log('\nTest 1: Chat-Seite mit Eingabefeld');
  const state = {
    connected: false,
    settings: {
      enabled: false,
      port: 8765,
      bridgeUrl: 'http://127.0.0.1:8765',
      allowRead: true,
      allowWrite: false,
      allowCommands: false,
      lastConnectedAt: 0
    },
    tools: []
  };
  const { window, log, tools } = buildWindow(PAGE, 'https://arena.ai/agent', state);

  await sleep(400);
  const bar = window.document.querySelector('arena-pc-bridge-bar');
  check('Leiste wurde eingefuegt', !!bar);
  check('Werkzeugliste hat 8 Eintraege', tools.length === 8, `(sind ${tools.length})`);

  const shadow = bar && bar.shadowRoot;
  check('Shadow-DOM vorhanden', !!shadow);
  const label = shadow && shadow.querySelector('.switch-label');
  check(
    'Beschriftung zeigt AUS',
    !!label && /AUS/.test(label.textContent),
    label ? `(ist "${label.textContent}")` : ''
  );

  // Platzierung: Leiste muss im normalen Fluss direkt NACH dem Eingabebereich sitzen
  const composer = window.document.getElementById('prompt');
  const previous = bar && bar.previousElementSibling;
  const directlyAfterComposer = !!previous && (previous === composer || previous.contains(composer));
  check(
    'Leiste sitzt direkt unter der Chat-Eingabe (im Fluss)',
    !!bar && !bar.classList.contains('arena-pc-bridge-fixed') && directlyAfterComposer,
    bar
      ? `(parent=${bar.parentElement && bar.parentElement.id}, davor=${previous && previous.id}, fixed=${bar.classList.contains(
          'arena-pc-bridge-fixed'
        )})`
      : ''
  );

  // JSON-LD
  const ld = window.document.getElementById('arena-local-tools');
  check('JSON-LD #arena-local-tools vorhanden', !!ld);
  if (ld) {
    let parsed = null;
    try {
      parsed = JSON.parse(ld.textContent);
    } catch (e) {
      /* ignore */
    }
    check('JSON-LD ist gueltiges JSON', !!parsed);
    if (parsed) {
      check('JSON-LD enthaelt 8 Werkzeuge', (parsed.tools || []).length === 8);
      check('JSON-LD meldet enabled=false', parsed.protocol && parsed.protocol.enabled === false);
      check(
        'JSON-LD zeigt auf 127.0.0.1',
        !!(parsed.protocol && parsed.protocol.endpoint === 'http://127.0.0.1:8765')
      );
    }
  }

  // window-API
  check('window.ArenaLocalTools vorhanden', typeof window.ArenaLocalTools === 'object');
  const status = window.ArenaLocalTools.status();
  check('status() meldet aus + nicht verbunden', status.enabled === false && status.connected === false);

  // Werkzeugaufruf
  const answer = await window.ArenaLocalTools.call('system_info', {});
  check('call(system_info) liefert Antwort', answer && answer.ok === true && answer.computer === 'TEST-PC');
  check(
    'Aufruf wurde an die Extension weitergegeben',
    log.some((e) => e.type === 'tool-call' && e.name === 'system_info')
  );

  // Schalter umlegen
  const switchBtn = shadow.querySelector('.switch');
  switchBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  check(
    'Klick auf den Schalter schaltet ein',
    log.some((e) => e.type === 'set-enabled' && e.enabled === true)
  );
  check('Anzeige wechselt auf AN', bar.classList.contains('on'));
  check(
    'Beschriftung zeigt AN',
    /AN/.test(shadow.querySelector('.switch-label').textContent),
    shadow.querySelector('.switch-label').textContent
  );
  check('Verbindung wird als verbunden angezeigt', /verbunden/i.test(shadow.querySelector('.status').textContent));
  const ld2 = JSON.parse(window.document.getElementById('arena-local-tools').textContent);
  check('JSON-LD aktualisiert auf enabled=true', ld2.protocol.enabled === true);

  // Einstellungen im Panel
  shadow.querySelector('.gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  const panel = shadow.querySelector('.panel');
  check('Einstellungs-Panel oeffnet', panel && panel.hidden === false);
  const boxes = panel.querySelectorAll('input[type="checkbox"]');
  check('drei Freigabe-Haekchen im Panel', boxes.length === 3, `(sind ${boxes.length})`);
  check('Prompt-Vorlagen-Knopf vorhanden', !!panel.querySelector('button.wide'));
  const template = window.ArenaLocalTools.promptTemplate();
  check('Prompt-Vorlage nennt alle 8 Werkzeuge', ['local_bridge_status','system_info','run_command','list_files','search_files','read_file','write_file','get_file_info'].every((n) => template.includes(n)));
  check('Prompt-Vorlage nennt die Freigaben', /Freigaben:/.test(template) && /Befehle=/.test(template));
  check('Prompt-Vorlage endet mit der Aufgabe', /Meine Aufgabe:/.test(template));

  if (boxes.length === 3) {
    boxes[2].checked = true;
    boxes[2].dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(120);
    check(
      'Haekchen sendet save-settings',
      log.some((e) => e.type === 'save-settings' && e.patch && e.patch.allowCommands === true)
    );
  }

  window.close();
}

/* ================================================================== *
 * Test 2: Seite ohne Eingabefeld -> Ersatz-Anzeige
 * ================================================================== */
async function testFallback() {
  console.log('\nTest 2: Seite ohne Chat-Eingabefeld');
  const state = {
    connected: false,
    settings: { enabled: false, port: 8765, bridgeUrl: 'http://127.0.0.1:8765', lastConnectedAt: 0 },
    tools: []
  };
  const { window } = buildWindow(PAGE_NO_COMPOSER, 'https://arena.ai/', state);
  await sleep(400);
  const bar = window.document.querySelector('arena-pc-bridge-bar');
  check('Ersatz-Anzeige im Eck ist eingefuegt', !!bar && bar.classList.contains('arena-pc-bridge-fixed'));
  check('Ersatz-Anzeige haengt an body', !!bar && bar.parentElement === window.document.body);
  window.close();
}

/* ================================================================== *
 * Test 3: Nicht-Arena-Pfad /bridge wird ausgelassen
 * ================================================================== */
async function testBridgePath() {
  console.log('\nTest 3: Pfad /bridge');
  const state = {
    connected: false,
    settings: { enabled: false, port: 8765, bridgeUrl: 'http://127.0.0.1:8765', lastConnectedAt: 0 },
    tools: []
  };
  const { window } = buildWindow(PAGE, 'https://arena.ai/bridge', state);
  await sleep(400);
  const bar = window.document.querySelector('arena-pc-bridge-bar');
  check('keine Leiste auf /bridge', !bar);
  window.close();
}

/* ================================================================== *
 * Test 4: SPA-Wechsel (Eingabefeld erscheint spaeter)
 * ================================================================== */
async function testSpaAppear() {
  console.log('\nTest 4: Eingabefeld erscheint erst spaeter (SPA)');
  const state = {
    connected: false,
    settings: { enabled: false, port: 8765, bridgeUrl: 'http://127.0.0.1:8765', lastConnectedAt: 0 },
    tools: []
  };
  const { window } = buildWindow(PAGE_NO_COMPOSER, 'https://arena.ai/', state);
  await sleep(300);
  check('vorher: Ersatz-Anzeige', !!window.document.querySelector('arena-pc-bridge-bar'));

  const wrap = window.document.createElement('div');
  wrap.id = 'composer-wrap';
  const inner = window.document.createElement('div');
  inner.id = 'composer-inner';
  const ta = window.document.createElement('textarea');
  ta.id = 'prompt';
  inner.appendChild(ta);
  wrap.appendChild(inner);
  window.document.getElementById('app').appendChild(wrap);

  await sleep(3000); // MutationObserver + Intervall
  const bar = window.document.querySelector('arena-pc-bridge-bar');
  check('Leiste wurde nachgezogen', !!bar);
  check(
    'Leiste sitzt jetzt unter der Eingabe',
    !!bar && (bar.closest('#composer-wrap') !== null || bar.classList.contains('arena-pc-bridge-fixed'))
  );
  window.close();
}

console.log('=== Tests fuer extension/src/inject.js ===');
await testNormalPage();
await testFallback();
await testBridgePath();
await testSpaAppear();

console.log(`\n${checks - failures}/${checks} Pruefungen bestanden.`);
if (failures > 0) {
  console.log(`${failures} Fehler.`);
  process.exit(1);
}
console.log('Alles gruen.');
process.exit(0);
