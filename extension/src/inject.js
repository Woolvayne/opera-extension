/*
 * inject.js -- laeuft auf arena.ai in der MAIN-Welt (also im Kontext der Seite).
 *
 * Zwei Aufgaben:
 *  1) Unter der Chat-Eingabe eine Leiste mit Ein/Aus-Schalter einblenden.
 *  2) Die lokalen Werkzeuge als JSON-LD (#arena-local-tools) und als
 *     window.ArenaLocalTools() bereitstellen, damit Assistenten, die
 *     Seiten-Tools unterstuetzen, sie automatisch finden.
 *
 * Diese Datei darf KEINE chrome.*-APIs benutzen. Alles laeuft ueber
 * window.postMessage und wird von toggle.js (ISOLATED) vermittelt.
 */
(function () {
  'use strict';

  const PAGE_SOURCE = 'arena-pc-bridge-page';
  const EXT_SOURCE = 'arena-pc-bridge-ext';
  const TAG = 'arena-pc-bridge-bar';
  const PROTOCOL_URL = 'https://arena.ai/bridge';
  const CALL_TIMEOUT_MS = 180000;

  const state = {
    connected: false,
    settings: { enabled: false, port: 8765, bridgeUrl: 'http://127.0.0.1:8765' },
    tools: [],
    lastError: '',
    mode: 'none' // 'flow' | 'fixed' | 'corner' | 'none'
  };

  // ------------------------------------------------------------------
  // 1) Nachrichten an die Extension
  // ------------------------------------------------------------------

  let msgId = 0;
  const pending = new Map();

  function toExtension(payload) {
    payload.source = PAGE_SOURCE;
    window.postMessage(payload, window.location.origin);
  }

  function request(mutate, idPrefix) {
    const id = idPrefix + '-' + ++msgId;
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error('Keine Antwort von der Extension (Zeitueberschreitung).'));
      }, CALL_TIMEOUT_MS);
      pending.set(id, {
        resolve: function (value) {
          clearTimeout(timer);
          pending.delete(id);
          resolve(value);
        },
        reject: function (err) {
          clearTimeout(timer);
          pending.delete(id);
          reject(err);
        }
      });
      toExtension(mutate(id));
    });
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== EXT_SOURCE) return;

    if (data.type === 'state') {
      applyState(data);
      return;
    }
    if (data.type === 'tool-result') {
      const waiter = pending.get(data.id);
      if (!waiter) return;
      const result = data.result || {};
      if (result && result.content) waiter.resolve(result);
      else waiter.reject(new Error((result && result.error) || 'Unbekannter Fehler'));
      return;
    }
    if (data.type === 'connect-result') {
      const waiter = pending.get(data.id);
      if (waiter) waiter.resolve(data.result);
    }
  });

  // ------------------------------------------------------------------
  // 2) UI
  // ------------------------------------------------------------------

  let ui = null;

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString('de-DE');
    } catch (e) {
      return '';
    }
  }

  function applyState(data) {
    state.settings = data.settings || state.settings;
    state.tools = data.tools || state.tools;
    state.connected = Date.now() - (state.settings.lastConnectedAt || 0) < 45000;
    if (ui) ui.render();
    updateJsonLd();
  }

  class BridgeBar {
    constructor() {
      this.host = document.createElement(TAG);
      this.host.setAttribute('data-arena-pc-bridge', '1');
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.panelOpen = false;
      this.detailsOpen = false;
      this.build();
    }

    build() {
      const style = document.createElement('style');
      style.textContent = CSS_TEXT;
      this.shadow.appendChild(style);

      this.wrap = document.createElement('div');
      this.wrap.className = 'wrap';
      this.shadow.appendChild(this.wrap);

      // ---- Leiste ----
      this.bar = document.createElement('div');
      this.bar.className = 'bar';
      this.wrap.appendChild(this.bar);

      this.switch = document.createElement('button');
      this.switch.type = 'button';
      this.switch.className = 'switch';
      this.switch.setAttribute('role', 'switch');
      this.switch.addEventListener('click', () => this.onToggle());
      this.switch.innerHTML =
        '<span class="track"><span class="knob"></span></span><span class="switch-label"></span>';
      this.bar.appendChild(this.switch);

      this.status = document.createElement('span');
      this.status.className = 'status';
      this.bar.appendChild(this.status);

      const spacer = document.createElement('span');
      spacer.className = 'spacer';
      this.bar.appendChild(spacer);

      this.gear = document.createElement('button');
      this.gear.type = 'button';
      this.gear.className = 'gear';
      this.gear.title = 'Einstellungen der lokalen Bruecke';
      this.gear.addEventListener('click', () => this.togglePanel());
      this.bar.appendChild(this.gear);

      // ---- Panel ----
      this.panel = document.createElement('div');
      this.panel.className = 'panel';
      this.panel.hidden = true;
      this.wrap.appendChild(this.panel);
    }

    togglePanel() {
      this.panelOpen = !this.panelOpen;
      this.panel.hidden = !this.panelOpen;
      this.render(true);
    }

    async onToggle() {
      const next = !state.settings.enabled;
      state.settings.enabled = next; // sofort anzeigen
      this.render();
      toExtension({ type: 'set-enabled', enabled: next });
      if (next) this.check();
    }

    async check() {
      try {
        await request((id) => ({ type: 'connect', id: id }), 'check');
      } catch (e) {
        /* Zustand kommt gleich per Broadcast */
      }
    }

    render(force) {
      const enabled = !!state.settings.enabled;
      const port = state.settings.port || 8765;
      // Nur neu zeichnen, wenn sich etwas geaendert hat. Sonst wuerde der
      // 2,5-Sekunden-Takt offene Einstellungen staendig neu aufbauen.
      const signature = JSON.stringify([
        enabled,
        state.connected,
        port,
        !!state.settings.allowRead,
        !!state.settings.allowWrite,
        !!state.settings.allowCommands,
        state.settings.lastConnectedAt > 0,
        (state.tools || []).length,
        this.panelOpen
      ]);
      if (!force && signature === this.lastSignature) return;
      this.lastSignature = signature;

      this.host.classList.toggle('on', enabled);
      this.switch.setAttribute('aria-checked', enabled ? 'true' : 'false');
      this.switch.querySelector('.switch-label').textContent = enabled
        ? 'Arena PC Bridge: AN'
        : 'Arena PC Bridge: AUS';
      this.switch.title = enabled
        ? 'Klicken, um den PC-Zugriff fuer Arena abzuschalten'
        : 'Klicken, um Arena Zugriff auf diesen PC zu geben';

      let dotClass = 'dot';
      let statusText = 'Bruecke nicht gestartet';
      if (enabled && state.connected) {
        dotClass = 'dot on';
        statusText = 'PC verbunden · Port ' + port + (fmtTime(state.settings.lastConnectedAt) ? ' · ' + fmtTime(state.settings.lastConnectedAt) : '');
      } else if (enabled) {
        dotClass = 'dot warn';
        statusText = 'Keine Verbindung zu 127.0.0.1:' + port + ' – Starter starten';
      } else {
        dotClass = 'dot off';
        statusText = 'Aus · Arena nutzt nur die eigene Websuche';
      }
      this.status.innerHTML = '';
      const dot = document.createElement('i');
      dot.className = dotClass;
      this.status.appendChild(dot);
      this.status.appendChild(document.createTextNode(' ' + statusText));

      this.gear.textContent = '⚙ ' + (state.tools.length || 8) + ' Werkzeuge';

      if (this.panelOpen) this.renderPanel();
    }

    renderPanel() {
      const s = state.settings;
      this.panel.innerHTML = '';

      const head = document.createElement('div');
      head.className = 'panel-head';
      head.textContent = 'Arena PC Bridge · lokale Bruecke';
      this.panel.appendChild(head);

      const row = (label, valueNode) => {
        const r = document.createElement('div');
        r.className = 'row';
        const l = document.createElement('span');
        l.className = 'row-label';
        l.textContent = label;
        r.appendChild(l);
        r.appendChild(valueNode);
        return r;
      };

      const url = document.createElement('code');
      url.textContent = s.bridgeUrl || 'http://127.0.0.1:' + s.port;
      this.panel.appendChild(row('Adresse', url));

      const actions = document.createElement('span');
      actions.className = 'actions';
      const btnCheck = document.createElement('button');
      btnCheck.type = 'button';
      btnCheck.textContent = 'Erneut prüfen';
      btnCheck.addEventListener('click', () => this.check());
      const btnHelp = document.createElement('button');
      btnHelp.type = 'button';
      btnHelp.textContent = 'Starter starten';
      btnHelp.title = 'Oeffnet einen Hinweis-Tab mit dem Verbinden-Knopf fuer die Bruecke';
      btnHelp.addEventListener('click', () => toExtension({ type: 'open-connection-tab', bridgeUrl: s.bridgeUrl }));
      actions.appendChild(btnCheck);
      actions.appendChild(btnHelp);
      this.panel.appendChild(row('Aktion', actions));

      // Freigaben
      const perms = document.createElement('div');
      perms.className = 'perms';
      const mkPerm = (key, label, hint) => {
        const wrapEl = document.createElement('label');
        wrapEl.className = 'perm';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!s[key];
        cb.addEventListener('change', () => {
          const patch = {};
          patch[key] = cb.checked;
          toExtension({ type: 'save-settings', patch: patch });
          setTimeout(() => toExtension({ type: 'request-state' }), 300);
        });
        const span = document.createElement('span');
        span.innerHTML = '<b>' + label + '</b><small>' + hint + '</small>';
        wrapEl.appendChild(cb);
        wrapEl.appendChild(span);
        return wrapEl;
      };
      perms.appendChild(mkPerm('allowRead', 'Dateien lesen', 'Ordner auflisten, Dateien lesen und durchsuchen'));
      perms.appendChild(mkPerm('allowWrite', 'Dateien schreiben', 'Neue Dateien anlegen oder Texte speichern'));
      perms.appendChild(mkPerm('allowCommands', 'Befehle ausführen', 'PowerShell/cmd auf diesem PC starten (z. B. git, winget, python)'));
      this.panel.appendChild(perms);

      if (!state.connected) {
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent =
          'Kein Kontakt zur lokalen Bruecke. Auf Windows: im Projektordner installer\\start.cmd starten (oder die Desktop-Verknuepfung "Arena PC Bridge"). Danach hier auf "Erneut prüfen".';
        this.panel.appendChild(hint);
      }

      // Werkzeugliste
      const details = document.createElement('details');
      details.open = this.detailsOpen;
      details.addEventListener('toggle', () => {
        this.detailsOpen = details.open;
      });
      const summary = document.createElement('summary');
      summary.textContent = 'Werkzeuge, die Arena nutzen darf (' + state.tools.length + ')';
      details.appendChild(summary);
      const list = document.createElement('ul');
      list.className = 'tools';
      (state.tools || []).forEach(function (tool) {
        const li = document.createElement('li');
        const code = document.createElement('code');
        code.textContent = tool.name;
        li.appendChild(code);
        li.appendChild(document.createTextNode(' ' + (tool.description || '')));
        list.appendChild(li);
      });
      details.appendChild(list);
      this.panel.appendChild(details);

      const foot = document.createElement('p');
      foot.className = 'hint';
      foot.textContent =
        'Der Schalter liegt zusätzlich in der Extension-Leiste (Icon anklicken). Alles läuft ausschließlich über 127.0.0.1 – nichts wird nach außen gesendet.';
      this.panel.appendChild(foot);

      const btnGuide = document.createElement('button');
      btnGuide.type = 'button';
      btnGuide.className = 'wide';
      btnGuide.textContent = 'Einrichtung öffnen (Port, Freigaben, Starter)';
      btnGuide.addEventListener('click', () => toExtension({ type: 'open-guide' }));
      this.panel.appendChild(btnGuide);
    }
  }

  const CSS_TEXT = `
:host { all: initial; display: block; width: 100%; box-sizing: border-box; }
:host(.arena-pc-bridge-fixed) { position: fixed; z-index: 2147483000; width: auto; }
* { box-sizing: border-box; }
.wrap { font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; font-size: 11.5px;
        color: #9aa4b8; display: flex; flex-direction: column; gap: 4px; }
.bar { display: flex; align-items: center; gap: 8px; padding: 3px 2px; }
.switch { display: inline-flex; align-items: center; gap: 7px; background: transparent; border: 0;
          padding: 2px 4px; border-radius: 8px; cursor: pointer; color: inherit; font: inherit; }
.switch:hover { background: rgba(148,163,184,0.12); }
.track { width: 30px; height: 16px; border-radius: 999px; background: #475569; position: relative;
         transition: background .15s ease; flex: 0 0 auto; }
.knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
        background: #e2e8f0; transition: transform .15s ease; }
:host(.on) .track { background: #10b981; }
:host(.on) .knob { transform: translateX(14px); }
.switch-label { font-weight: 600; letter-spacing: .01em; white-space: nowrap; color: #cbd5e1; }
:host(.on) .switch-label { color: #34d399; }
.status { display: inline-flex; align-items: center; opacity: .95; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; }
.spacer { flex: 1 1 auto; }
.gear { background: transparent; border: 0; color: #8b95a9; cursor: pointer; font: inherit;
        padding: 2px 6px; border-radius: 8px; white-space: nowrap; }
.gear:hover { background: rgba(148,163,184,0.12); color: #cbd5e1; }
i.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
i.dot.on { background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.18); }
i.dot.warn { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,.18); }
i.dot.off { background: #64748b; }
.panel { background: #0f172a; border: 1px solid #27334a; border-radius: 12px; padding: 10px 12px;
         box-shadow: 0 12px 32px rgba(0,0,0,.45); color: #cbd5e1; display: flex;
         flex-direction: column; gap: 7px; max-width: 560px; }
.panel-head { font-weight: 700; color: #e2e8f0; }
.row { display: flex; align-items: center; gap: 8px; }
.row-label { min-width: 74px; color: #8b95a9; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions button, .wide { background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
         border-radius: 8px; padding: 3px 9px; cursor: pointer; font: inherit; }
.actions button:hover, .wide:hover { background: #243349; color: #e2e8f0; }
.wide { width: 100%; padding: 6px; }
code { background: #111c30; border: 1px solid #24314a; border-radius: 6px; padding: 1px 5px;
       color: #7dd3fc; font-family: Consolas, monospace; font-size: 11px; }
.perms { display: flex; flex-direction: column; gap: 5px; }
.perm { display: flex; align-items: flex-start; gap: 7px; }
.perm small { display: block; color: #7c879c; }
.hint { margin: 0; color: #8b95a9; line-height: 1.45; }
details summary { cursor: pointer; color: #93b4d8; }
ul.tools { margin: 6px 0 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }
ul.tools li { line-height: 1.4; }
@media (prefers-color-scheme: light) {
  .wrap { color: #55606f; }
  .switch-label { color: #334155; }
  :host(.on) .switch-label { color: #047857; }
  .panel { background: #ffffff; border-color: #d7dee8; color: #334155; }
  .panel-head { color: #0f172a; }
  code { background: #f1f5f9; border-color: #dbe3ee; color: #0b6bab; }
  .actions button, .wide { background: #f4f7fb; border-color: #d7dee8; color: #334155; }
  .hint, .row-label { color: #64748b; }
}
`;

  // ------------------------------------------------------------------
  // 3) Composer finden und Leiste platzieren
  // ------------------------------------------------------------------

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 12) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    // opacity kann in manchen Umgebungen leer sein -> nur pruefen, wenn gesetzt.
    if (style.opacity && Number(style.opacity) === 0) return false;
    return rect.bottom > 0 && rect.top < window.innerHeight + 200;
  }

  function scoreComposer(el) {
    let score = 0;
    const rect = el.getBoundingClientRect();
    const hint = (
      (el.getAttribute('placeholder') || '') +
      ' ' +
      (el.getAttribute('aria-label') || '') +
      ' ' +
      (el.getAttribute('data-placeholder') || '') +
      ' ' +
      (el.getAttribute('data-testid') || '') +
      ' ' +
      (el.className && typeof el.className === 'string' ? el.className : '')
    ).toLowerCase();

    if (/message|prompt|frag|nachricht|schreib|ask|chat|input/.test(hint)) score += 40;
    if (rect.width > 260) score += 20;
    if (rect.bottom > window.innerHeight * 0.5) score += 30;
    if (rect.bottom > window.innerHeight * 0.8) score += 20;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) score += 15;
    if (el.getAttribute('role') === 'textbox') score += 10;
    if (el.id && /prompt|input|chat/.test(el.id.toLowerCase())) score += 10;
    // Ein Suchfeld oben auf der Seite ist kein Chat-Eingabefeld.
    if (rect.bottom < window.innerHeight * 0.35) score -= 60;
    return score;
  }

  function findComposer() {
    const nodes = Array.prototype.slice.call(
      document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
    );
    let best = null;
    let bestScore = 0;
    nodes.forEach(function (node) {
      if (!isVisible(node)) return;
      if (node.closest('#' + TAG)) return;
      const score = scoreComposer(node);
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    });
    return bestScore >= 40 ? best : null;
  }

  function composerBox(composer) {
    // Moeglichst nah am Eingabefeld bleiben, aber nicht hoeher als 240px.
    let node = composer;
    for (let i = 0; i < 5 && node.parentElement; i += 1) {
      const parent = node.parentElement;
      if (parent === document.body || parent === document.documentElement) break;
      const rect = parent.getBoundingClientRect();
      if (rect.width < 260 || rect.height > 240) break;
      node = parent;
    }
    return node;
  }

  function detach() {
    if (!ui) return;
    if (ui.host.parentElement) ui.host.parentElement.removeChild(ui.host);
    ui.host.classList.remove('arena-pc-bridge-fixed');
    ui.host.style.cssText = '';
    ui.ref = null;
    state.mode = 'none';
  }

  function tryFlowMount(composer) {
    let child = composerBox(composer);
    for (let i = 0; i < 3 && child && child.parentElement; i += 1) {
      const parent = child.parentElement;
      if (parent === document.body || parent === document.documentElement) break;
      const style = window.getComputedStyle(parent);
      const isRow = style.display.indexOf('flex') >= 0 && /row/.test(style.flexDirection);
      if (!isRow) {
        parent.insertBefore(ui.host, child.nextSibling);
        if (barIsUnderComposer(composer)) {
          state.mode = 'flow';
          ui.ref = child;
          return true;
        }
        if (ui.host.parentElement) ui.host.parentElement.removeChild(ui.host);
      }
      child = parent;
    }
    return false;
  }

  function barIsUnderComposer(composer) {
    const barRect = ui.host.getBoundingClientRect();
    const rect = composer.getBoundingClientRect();
    // Nicht messbar (z. B. Layout noch nicht berechnet)? Dann dem Einfuegen vertrauen:
    // wir haben bereits geprueft, dass der Container keine Zeilen-Flexbox ist.
    if (barRect.width === 0 && barRect.height === 0) return true;
    if (barRect.width < 120) return false;
    const gapTop = barRect.top - rect.bottom;
    return gapTop > -rect.height * 0.5 && gapTop < 90;
  }

  function mountFixed(composer) {
    ui.host.classList.add('arena-pc-bridge-fixed');
    document.body.appendChild(ui.host);
    syncFixedPosition(composer);
    state.mode = 'fixed';
    ui.ref = composer;
  }

  function syncFixedPosition(composer) {
    if (state.mode !== 'fixed' || !ui || !composer || !composer.isConnected) return;
    const box = composerBox(composer);
    const rect = box.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      ui.host.style.visibility = 'hidden';
      return;
    }
    ui.host.style.visibility = 'visible';
    ui.host.style.left = Math.max(8, rect.left) + 'px';
    ui.host.style.width = Math.max(200, Math.min(rect.width, window.innerWidth - 16)) + 'px';
    ui.host.style.top = Math.min(window.innerHeight - 18, rect.bottom + 4) + 'px';
  }

  function mountCorner() {
    // Notfall-Anzeige, falls kein Chat-Eingabefeld gefunden wird.
    ui.host.classList.add('arena-pc-bridge-fixed');
    ui.host.style.right = '16px';
    ui.host.style.bottom = '16px';
    ui.host.style.left = 'auto';
    ui.host.style.top = 'auto';
    ui.host.style.width = 'auto';
    document.body.appendChild(ui.host);
    state.mode = 'corner';
    ui.ref = null;
  }

  let syncQueued = false;
  function scheduleMountCheck() {
    if (syncQueued) return;
    syncQueued = true;
    window.setTimeout(function () {
      syncQueued = false;
      ensureMounted();
    }, 250);
  }

  function ensureMounted() {
    if (!/^https?:$/.test(window.location.protocol)) return;
    if (/^\/bridge(\/|$)/.test(window.location.pathname)) {
      detach();
      return;
    }
    if (!document.body) return;

    if (!ui) ui = new BridgeBar();

    const composer = findComposer();
    const stillThere =
      ui.host.isConnected &&
      (state.mode === 'corner' || (ui.ref && ui.ref.isConnected && isVisible(ui.ref)));

    if (stillThere) {
      if (composer && state.mode === 'fixed' && ui.ref !== composer) {
        ui.ref = composer;
      }
      if (composer && state.mode === 'fixed') syncFixedPosition(composer);
      if (composer && state.mode === 'flow' && ui.ref !== composerBox(composer)) {
        detach();
        if (!tryFlowMount(composer)) mountFixed(composer);
      }
      ui.render();
      return;
    }

    detach();
    if (!composer) {
      if (!ui.host.isConnected) mountCorner();
      ui.render();
      return;
    }
    if (!tryFlowMount(composer)) {
      mountFixed(composer);
    }
    ui.render();
  }

  // ------------------------------------------------------------------
  // 4) Oeffentliche Schnittstelle fuer die Seite (JSON-LD + window-API)
  // ------------------------------------------------------------------

  const TOOL_ALIASES = {
    local_bridge_status: 'bruecke_status',
    system_info: 'system_info',
    run_command: 'befehl_ausfuehren',
    list_files: 'dateien_auflisten',
    search_files: 'dateien_suchen',
    read_file: 'datei_lesen',
    write_file: 'datei_schreiben',
    get_file_info: 'datei_info'
  };

  function buildDescriptor() {
    const enabled = !!state.settings.enabled;
    const tools = (state.tools || []).map(function (tool) {
      return {
        name: tool.name,
        alias: TOOL_ALIASES[tool.name] || null,
        description: tool.description,
        input_schema: tool.input_schema || { type: 'object', properties: {} }
      };
    });

    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Arena PC Bridge',
      description: enabled
        ? 'Arena darf über die lokale Bruecke auf diesem Windows-PC arbeiten: Ordner auflisten, Dateien lesen/suchen/schreiben und Befehle ausfuehren. Alles laeuft ausschliesslich ueber http://127.0.0.1.'
        : 'Der PC-Zugriff ist aktuell AUS. Der Nutzer muss den Schalter "Arena PC Bridge" unter der Chat-Eingabe einschalten.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Windows, macOS, Linux',
      isAccessibleForFree: true,
      softwareVersion: '1.0.0',
      url: PROTOCOL_URL,
      protocol: {
        transport: 'http',
        endpoint: state.settings.bridgeUrl,
        local_only: true,
        enabled: enabled,
        connected: state.connected,
        discovery_element: '#arena-local-tools',
        bridge_probe: state.settings.bridgeUrl + '/status',
        requires_user_action: true,
        note:
          'Wenn enabled=false ist, NICHT die Werkzeuge aufrufen. Stattdessen den Nutzer fragen, den Schalter unter der Chat-Eingabe einzuschalten.'
      },
      permissions: {
        read_files: !!state.settings.allowRead,
        write_files: !!state.settings.allowWrite,
        run_commands: !!state.settings.allowCommands
      },
      tools: tools,
      invoke: {
        browser_console: {
          sentence:
            'Fuehre in den Entwicklertools (F12) auf dieser Seite aus: await ArenaLocalTools.call("system_info", {})'
        },
        local_agent: {
          sentence:
            'Lokale Programme koennen die Bruecke direkt benutzen, z.B. POST ' +
            state.settings.bridgeUrl +
            '/api/run_command mit {"command":"dir","shell":"cmd"}'
        }
      }
    };
  }

  function updateJsonLd() {
    const id = 'arena-local-tools';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    const json = JSON.stringify(buildDescriptor());
    if (el.textContent === json) return;
    el.textContent = json;
  }

  function installConsoleApi() {
    const fakeResult = function (name, args) {
      return request(
        function (id) {
          return { type: 'tool-call', id: id, name: name, arguments: args || {} };
        },
        'tool'
      );
    };

    const api = {
      version: '1.0.0',
      endpoint: function () {
        return state.settings.bridgeUrl;
      },
      status: function () {
        return {
          enabled: !!state.settings.enabled,
          connected: state.connected,
          bridgeUrl: state.settings.bridgeUrl,
          permissions: {
            allowRead: !!state.settings.allowRead,
            allowWrite: !!state.settings.allowWrite,
            allowCommands: !!state.settings.allowCommands
          }
        };
      },
      list: function () {
        return (state.tools || []).map(function (t) {
          return t.name;
        });
      },
      call: function (name, args) {
        return fakeResult(name, args).then(function (result) {
          const text = (result.content || []).map(function (c) {
            return c.text;
          }).join('\n');
          try {
            return JSON.parse(text);
          } catch (e) {
            return text;
          }
        });
      },
      describe: function () {
        return buildDescriptor();
      }
    };

    Object.defineProperty(window, 'ArenaLocalTools', {
      configurable: true,
      get: function () {
        return api;
      }
    });
  }

  // ------------------------------------------------------------------
  // 5) Start
  // ------------------------------------------------------------------

  function boot() {
    installConsoleApi();

    const startUi = function () {
      updateJsonLd();
      ensureMounted();

      const observer = new MutationObserver(function () {
        scheduleMountCheck();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });

      window.addEventListener('resize', function () {
        if (state.mode === 'fixed') ensureMounted();
      });
      window.addEventListener('scroll', function () {
        if (state.mode === 'fixed') scheduleMountCheck();
      }, true);
      window.setInterval(function () {
        if (document.hidden) return;
        ensureMounted();
      }, 2500);

      // SPA-Navigation
      let lastUrl = window.location.href;
      window.setInterval(function () {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          setTimeout(ensureMounted, 200);
          setTimeout(updateJsonLd, 400);
        }
      }, 700);

      toExtension({ type: 'request-state' });
      window.setInterval(function () {
        toExtension({ type: 'request-state' });
      }, 30000);
    };

    if (document.body) startUi();
    else document.addEventListener('DOMContentLoaded', startUi, { once: true });
  }

  boot();
})();
