/*
 * background.js -- Service Worker der Extension.
 *
 * Aufgaben:
 *  - Einstellungen speichern (an/aus, Port, Werkzeug-Freigaben, Verlauf)
 *  - Den Zustand an alle Tabs schicken, in denen arena.ai offen ist
 *  - Die lokale Bruecke (http://127.0.0.1:8765) aufrufen und Ergebnisse
 *    an das Content-Script zurueckgeben. Das klappt ohne CORS-Aerger,
 *    weil der Service-Worker dafuer host_permissions besitzt.
 */
importScripts('protocol.js');

const P = globalThis.ArenaBridgeProtocol;
const ARENA_MATCH = /^https?:\/\/([a-z0-9-]+\.)*arena\.ai(\/|$)/i;

const DEFAULT_SETTINGS = {
  enabled: true,
  port: P.defaultPort,
  token: '',
  allowRead: true,
  allowWrite: false,
  allowCommands: false,
  lastBridgeUrl: '',
  lastConnectedAt: 0
};

// --------------------------------------------------------------------------
// Einstellungen
// --------------------------------------------------------------------------

async function getSettings() {
  const stored = await chrome.storage.local.get(null);
  return Object.assign({}, DEFAULT_SETTINGS, stored);
}

async function setSettings(patch) {
  await chrome.storage.local.set(patch);
  return getSettings();
}

function bridgeUrlFor(settings) {
  return 'http://127.0.0.1:' + (settings.port || P.defaultPort);
}

function publicSettings(settings) {
  return {
    enabled: !!settings.enabled,
    port: settings.port || P.defaultPort,
    bridgeUrl: bridgeUrlFor(settings),
    allowRead: !!settings.allowRead,
    allowWrite: !!settings.allowWrite,
    allowCommands: !!settings.allowCommands,
    lastConnectedAt: settings.lastConnectedAt || 0
  };
}

// --------------------------------------------------------------------------
// Kontakt zur Arena-Seite
// --------------------------------------------------------------------------

async function arenaTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter(
    (t) =>
      t.id &&
      ((t.url && ARENA_MATCH.test(t.url)) ||
        (t.pendingUrl && ARENA_MATCH.test(t.pendingUrl)))
  );
}

async function broadcastState() {
  const settings = await getSettings();
  const payload = {
    type: 'arena-pc-bridge:state',
    settings: publicSettings(settings),
    tools: P.toolDefinitions.map(function (t) {
      return { name: t.name, description: t.description };
    })
  };
  const tabs = await arenaTabs();
  await Promise.all(
    tabs.map((tab) =>
      chrome.tabs.sendMessage(tab.id, payload).catch(function () {})
    )
  );
  await updateBadge(settings);
}

async function updateBadge(settings) {
  let text = '';
  let color = '#5b6478';
  if (settings.enabled) {
    const connected = Date.now() - (settings.lastConnectedAt || 0) < 25000;
    text = connected ? 'AN' : '!';
    color = connected ? '#12b981' : '#f59e0b';
  }
  try {
    await chrome.action.setBadgeBackgroundColor({ color: color });
    await chrome.action.setBadgeText({ text: text });
  } catch (e) {
    /* Badge ist nicht kritisch */
  }
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: title,
      message: message,
      priority: 0
    });
  } catch (e) {
    /* egal */
  }
}

// --------------------------------------------------------------------------
// Bruecke testen
// --------------------------------------------------------------------------

async function testBridge(settings) {
  const url = bridgeUrlFor(settings);
  try {
    const status = await P.getStatus(url);
    const connectedAt = Date.now();
    await setSettings({
      lastConnectedAt: connectedAt,
      lastBridgeUrl: url,
      protocol: status.protocol || 0,
      bridgeRoot: status.root || '',
      bridgeMessage: status.message || ''
    });
    return { ok: true, status: status, at: connectedAt };
  } catch (err) {
    await setSettings({ lastConnectedAt: 0 });
    return { ok: false, error: String(err.message || err) };
  }
}

let connectTimer = null;
function scheduleConnectTest(delayMs) {
  if (connectTimer) clearTimeout(connectTimer);
  connectTimer = setTimeout(async function () {
    connectTimer = null;
    const settings = await getSettings();
    if (!settings.enabled) {
      await broadcastState();
      return;
    }
    await testBridge(settings);
    await broadcastState();
  }, delayMs || 200);
}

// --------------------------------------------------------------------------
// Werkzeuge -> lokale Bruecke
// --------------------------------------------------------------------------

function permissionProblem(settings, toolName) {
  if (!settings.enabled) {
    return 'Der Schalter unter der Chat-Eingabe steht auf AUS. Der Nutzer muss ihn erst auf AN stellen.';
  }
  if (toolName === 'run_command' && !settings.allowCommands) {
    return 'Befehle sind in der Bruecke nicht erlaubt. Der Nutzer muss in der Extension-Einstellung "Befehle ausfuehren" (allowCommands) aktivieren und die Bruecke neu starten.';
  }
  if (toolName === 'write_file' && !settings.allowWrite) {
    return 'Schreiben ist in der Bruecke nicht erlaubt. Der Nutzer muss in der Extension-Einstellung "Dateien schreiben" (allowWrite) aktivieren und die Bruecke neu starten.';
  }
  if (
    ['read_file', 'list_files', 'search_files', 'get_file_info'].indexOf(toolName) >= 0 &&
    !settings.allowRead
  ) {
    return 'Lesen ist in der Bruecke nicht erlaubt. Der Nutzer muss in der Extension-Einstellung "Dateien lesen" (allowRead) aktivieren und die Bruecke neu starten.';
  }
  return null;
}

async function callBridge(settings, path, options, timeoutMs) {
  const url = bridgeUrlFor(settings);
  const headers = Object.assign(
    { 'X-Arena-Bridge': '1' },
    (options && options.headers) || {}
  );
  if (settings.token) headers['X-Arena-Token'] = settings.token;
  if (options && options.body) headers['Content-Type'] = 'application/json';
  const res = await P.bridgeFetch(
    url,
    path,
    Object.assign({}, options, { headers: headers }),
    timeoutMs
  );
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || 'HTTP ' + res.status;
    const err = new Error(msg);
    err.httpStatus = res.status;
    throw err;
  }
  return data;
}

function qs(params) {
  const parts = [];
  Object.keys(params).forEach(function (key) {
    const value = params[key];
    if (value === undefined || value === null || value === '') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

async function addHistory(entry) {
  const settings = await getSettings();
  const history = settings.history || [];
  history.unshift(Object.assign({ at: Date.now() }, entry));
  await chrome.storage.local.set({ history: history.slice(0, 40) });
}

async function executeTool(name, args) {
  const settings = await getSettings();
  args = args || {};

  if (name === 'local_bridge_status') {
    const result = await testBridge(settings);
    await broadcastState();
    if (!result.ok) {
      return P.toolResult({
        verbunden: false,
        bridgeUrl: bridgeUrlFor(settings),
        fehler: result.error,
        hinweis:
          'Der Nutzer muss auf Windows den Starter ausfuehren: install\\start.cmd bzw. die Verknuepfung "Arena PC Bridge" auf dem Desktop. Danach im neu geoeffneten Tab auf "Erlauben" klicken.'
      });
    }
    return P.toolResult({
      verbunden: true,
      bridgeUrl: bridgeUrlFor(settings),
      schalter_unter_chat: settings.enabled ? 'AN' : 'AUS',
      erlaubnis_befehle: !!settings.allowCommands,
      erlaubnis_schreiben: !!settings.allowWrite,
      erlaubnis_lesen: !!settings.allowRead,
      erlaubter_ordner: result.status.root,
      bruecke_meldung: result.status.message,
      werkzeuge: result.status.tools
    });
  }

  const permissionError = permissionProblem(settings, name);
  if (permissionError) return P.toolError(permissionError);

  try {
    let data;
    switch (name) {
      case 'system_info':
        data = await callBridge(settings, '/api/system_info', { method: 'GET' }, 20000);
        break;

      case 'run_command': {
        const body = {
          command: String(args.command || ''),
          shell: args.shell || 'powershell',
          cwd: args.cwd || '',
          timeout_ms: Math.min(Math.max(Number(args.timeout_ms) || 20000, 1000), 120000)
        };
        data = await callBridge(
          settings,
          '/api/run_command',
          { method: 'POST', body: JSON.stringify(body) },
          body.timeout_ms + 15000
        );
        await addHistory({
          tool: 'run_command',
          detail: body.command.slice(0, 160),
          ok: !!data.ok,
          exit_code: data.exit_code
        });
        break;
      }

      case 'list_files': {
        const params = qs({
          path: args.path || '',
          max_entries: args.max_entries || 200
        });
        data = await callBridge(settings, '/api/list_files' + params, { method: 'GET' }, 30000);
        break;
      }

      case 'search_files': {
        const params = qs({
          query: args.query || '*',
          path: args.path || '',
          max_results: args.max_results || 100
        });
        data = await callBridge(settings, '/api/search_files' + params, { method: 'GET' }, 30000);
        break;
      }

      case 'read_file': {
        const params = qs({
          path: args.path || '',
          max_bytes: args.max_bytes || 200000,
          encoding: args.encoding || 'auto'
        });
        data = await callBridge(settings, '/api/read_file' + params, { method: 'GET' }, 30000);
        break;
      }

      case 'get_file_info': {
        const params = qs({ path: args.path || '' });
        data = await callBridge(settings, '/api/get_file_info' + params, { method: 'GET' }, 15000);
        break;
      }

      case 'write_file': {
        const body = {
          path: args.path || '',
          content: args.content === undefined ? '' : String(args.content),
          append: !!args.append,
          create_dirs: args.create_dirs === undefined ? true : !!args.create_dirs
        };
        data = await callBridge(
          settings,
          '/api/write_file',
          { method: 'POST', body: JSON.stringify(body) },
          30000
        );
        await addHistory({
          tool: 'write_file',
          detail: body.path + ' (' + body.content.length + ' Zeichen)',
          ok: !!data.ok
        });
        break;
      }

      default:
        return P.toolError('Unbekanntes Werkzeug: ' + name);
    }
    return P.toolResult(data);
  } catch (err) {
    await addHistory({ tool: name, detail: String(args.command || args.path || ''), ok: false });
    const message = String(err.message || err);
    if (err.httpStatus === 403) {
      return P.toolError(message);
    }
    if (err.httpStatus === 404) {
      return P.toolError(
        'Die Bruecke kennt diesen Befehl nicht. Alte Version? Bitte die Dateien aus dem Repo einmal neu starten.'
      );
    }
    return P.toolError(message);
  }
}

// --------------------------------------------------------------------------
// Nachrichten vom Content-Script / Popup
// --------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  (async function () {
    try {
      switch (message && message.type) {
        case 'arena-pc-bridge:get-state': {
          const settings = await getSettings();
          sendResponse({
            ok: true,
            settings: publicSettings(settings),
            tools: P.toolDefinitions,
            version: chrome.runtime.getManifest().version
          });
          return;
        }

        case 'arena-pc-bridge:set-enabled': {
          await setSettings({ enabled: !!message.enabled });
          await broadcastState();
          if (message.enabled) notify('Arena PC Bridge', 'Schalter ist AN - Arena darf auf den PC zugreifen (je nach Freigaben).');
          sendResponse({ ok: true, settings: publicSettings(await getSettings()) });
          return;
        }

        case 'arena-pc-bridge:open-connection-tab': {
          const settings = await getSettings();
          const url =
            chrome.runtime.getURL('src/guide.html') +
            '?bridge=' +
            encodeURIComponent(bridgeUrlFor(settings));
          await chrome.tabs.create({ url: url, active: true });
          sendResponse({ ok: true, url: url });
          return;
        }

        case 'arena-pc-bridge:connect': {
          const settings = await getSettings();
          const result = await testBridge(settings);
          await broadcastState();
          sendResponse(result);
          return;
        }

        case 'arena-pc-bridge:tools/list': {
          const settings = await getSettings();
          sendResponse({ ok: true, tools: P.toolDefinitions, settings: publicSettings(settings) });
          return;
        }

        case 'arena-pc-bridge:tools/call': {
          const result = await executeTool(message.name, message.arguments);
          sendResponse(result);
          return;
        }

        case 'arena-pc-bridge:save-settings': {
          const patch = message.patch || {};
          const allowed = {};
          ['port', 'allowRead', 'allowWrite', 'allowCommands', 'enabled'].forEach(function (key) {
            if (patch[key] !== undefined) allowed[key] = patch[key];
          });
          if (allowed.port) allowed.port = Number(allowed.port) || P.defaultPort;
          await setSettings(allowed);
          await broadcastState();
          if (allowed.port) {
            await testBridge(await getSettings());
            await broadcastState();
          }
          sendResponse({ ok: true, settings: publicSettings(await getSettings()) });
          return;
        }

        case 'arena-pc-bridge:open-guide': {
          await chrome.tabs.create({ url: chrome.runtime.getURL('src/guide.html') });
          sendResponse({ ok: true });
          return;
        }

        case 'arena-pc-bridge:clear-history': {
          await chrome.storage.local.set({ history: [] });
          sendResponse({ ok: true });
          return;
        }

        default:
          sendResponse({ ok: false, error: 'Unbekannte Nachricht: ' + (message && message.type) });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    }
  })();
  return true; // Antwort kommt asynchron
});

// --------------------------------------------------------------------------
// Lebenszyklus
// --------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async function (details) {
  const settings = await getSettings();
  await chrome.storage.local.set(settings);
  await broadcastState();
  if (details.reason === 'install') {
    notify(
      'Arena PC Bridge installiert',
      'Jetzt noch den Starter auf Windows ausfuehren (install\\start.cmd), dann auf arena.ai den Schalter unter der Chat-Eingabe einschalten.'
    );
  }
});

chrome.runtime.onStartup.addListener(function () {
  scheduleConnectTest(1000);
});

chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
  if (info.status !== 'complete') return;
  const url = tab && (tab.url || tab.pendingUrl);
  if (url && ARENA_MATCH.test(url)) scheduleConnectTest(400);
});

chrome.tabs.onRemoved.addListener(function () {
  updateBadgeLater();
});

function updateBadgeLater() {
  setTimeout(async function () {
    await updateBadge(await getSettings());
  }, 300);
}

// Alle 20 Sekunden pruefen, ob die Bruecke noch laeuft, solange ein Arena-Tab offen ist.
chrome.alarms.create('arena-pc-bridge-heartbeat', { periodInMinutes: 0.34 });
chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name !== 'arena-pc-bridge-heartbeat') return;
  const settings = await getSettings();
  if (!settings.enabled) return;
  const tabs = await arenaTabs();
  if (!tabs.length) return;
  await testBridge(settings);
  await broadcastState();
});

scheduleConnectTest(500);
