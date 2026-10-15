/* popup.js -- Steuerzentrale der Extension (Icon in der Browserleiste). */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  async function send(message) {
    try {
      return (await chrome.runtime.sendMessage(message)) || { ok: false, error: 'keine Antwort' };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  function setBadge(text, cls) {
    const badge = $('badge');
    badge.textContent = text;
    badge.className = 'badge ' + (cls || '');
  }

  function fmt(ts) {
    try {
      return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
      return '';
    }
  }

  async function refresh() {
    const answer = await send({ type: 'arena-pc-bridge:get-state' });
    if (!answer.ok) {
      setBadge('Fehler', 'err');
      $('bridgeMessage').textContent = answer.error || 'Unbekannter Fehler';
      return;
    }
    const s = answer.settings;
    $('version').textContent = 'Version ' + answer.version + ' · Protokoll ok';
    $('enabled').checked = !!s.enabled;
    $('enabledText').textContent = s.enabled ? 'AN' : 'AUS';
    $('bridgeUrl').textContent = s.bridgeUrl;
    $('port').value = s.port;
    $('allowRead').checked = !!s.allowRead;
    $('allowWrite').checked = !!s.allowWrite;
    $('allowCommands').checked = !!s.allowCommands;

    const connected = Date.now() - (s.lastConnectedAt || 0) < 45000;
    if (!s.enabled) setBadge('aus', '');
    else if (connected) setBadge('verbunden', 'ok');
    else setBadge('nicht verbunden', 'warn');

    const tools = answer.tools || [];
    $('toolCount').textContent = '(' + tools.length + ')';
    const list = $('tools');
    list.innerHTML = '';
    tools.forEach(function (tool) {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = tool.name;
      const span = document.createElement('span');
      span.textContent = tool.description;
      li.appendChild(code);
      li.appendChild(span);
      list.appendChild(li);
    });

    const history = (await chrome.storage.local.get('history')).history || [];
    const histList = $('history');
    histList.innerHTML = '';
    history.slice(0, 12).forEach(function (entry) {
      const li = document.createElement('li');
      if (!entry.ok) li.className = 'fail';
      const b = document.createElement('b');
      b.textContent = entry.tool + (entry.ok === false ? ' ✗' : ' ✓');
      li.appendChild(b);
      li.appendChild(document.createTextNode(' ' + (entry.detail || '') + ' · ' + fmt(entry.at)));
      histList.appendChild(li);
    });

    const msg = await chrome.storage.local.get(['bridgeMessage', 'lastBridgeUrl']);
    $('bridgeMessage').textContent = connected
      ? 'Verbunden mit ' + (msg.lastBridgeUrl || s.bridgeUrl) + (msg.bridgeMessage ? ' · ' + msg.bridgeMessage : '')
      : 'Keine Verbindung. Auf Windows install\\start.cmd starten (oder Desktop-Verknüpfung "Arena PC Bridge"), dann testen.';
  }

  $('enabled').addEventListener('change', async function (e) {
    await send({ type: 'arena-pc-bridge:set-enabled', enabled: e.target.checked });
    await refresh();
  });

  ['allowRead', 'allowWrite', 'allowCommands'].forEach(function (key) {
    $(key).addEventListener('change', async function (e) {
      const patch = {};
      patch[key] = e.target.checked;
      await send({ type: 'arena-pc-bridge:save-settings', patch: patch });
      await refresh();
    });
  });

  $('savePort').addEventListener('click', async function () {
    await send({ type: 'arena-pc-bridge:save-settings', patch: { port: Number($('port').value) } });
    await send({ type: 'arena-pc-bridge:connect' });
    await refresh();
  });

  $('check').addEventListener('click', async function () {
    setBadge('prüfe …', '');
    const result = await send({ type: 'arena-pc-bridge:connect' });
    await refresh();
    if (!result.ok) {
      $('bridgeMessage').textContent = 'Fehler: ' + (result.error || 'unbekannt');
      setBadge('nicht verbunden', 'warn');
    }
  });

  $('openConnectTab').addEventListener('click', async function () {
    await send({ type: 'arena-pc-bridge:open-connection-tab' });
  });

  $('clearHistory').addEventListener('click', async function () {
    await chrome.runtime.sendMessage({ type: 'arena-pc-bridge:clear-history' });
    await refresh();
  });

  $('guide').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/guide.html') });
  });

  $('reloadArena').addEventListener('click', async function () {
    const tabs = await chrome.tabs.query({});
    const arena = tabs.filter((t) => t.url && /arena\.ai/i.test(t.url));
    if (!arena.length) {
      chrome.tabs.create({ url: 'https://arena.ai' });
      return;
    }
    for (const tab of arena) {
      await chrome.tabs.reload(tab.id);
    }
    window.close();
  });

  refresh();
  setInterval(refresh, 4000);
})();
