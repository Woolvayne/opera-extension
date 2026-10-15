/* guide.js -- Verbinden-Knopf fuer die lokale Bruecke. */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const base = (params.get('bridge') || 'http://127.0.0.1:8765').replace(/\/+$/, '');
  const logEl = document.getElementById('log');
  const urlEl = document.getElementById('url');
  urlEl.textContent = base;

  function log(text, isError) {
    logEl.textContent = text;
    logEl.className = 'log' + (isError ? ' err' : '');
  }

  async function call(path, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
    try {
      const res = await fetch(base + path, Object.assign({ signal: controller.signal }, options || {}));
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = { raw: text };
      }
      return { ok: res.ok, status: res.status, data: data };
    } finally {
      clearTimeout(timer);
    }
  }

  async function test() {
    log('Teste ' + base + ' …');
    try {
      const res = await call('/status', { method: 'GET', headers: { 'X-Arena-Bridge': '1' } });
      if (!res.ok) {
        log('Die Bruecke antwortet mit HTTP ' + res.status + '.\n' + JSON.stringify(res.data, null, 2), true);
        return null;
      }
      log(JSON.stringify(res.data, null, 2));
      return res.data;
    } catch (err) {
      log(
        'Keine Verbindung zu ' + base + '\n\n' +
          'Sieht so aus, als laeuft der Starter nicht.\n' +
          '1) Projektordner oeffnen\n' +
          '2) installer\\install.cmd ausfuehren\n' +
          '3) Desktop-Verknuepfung "Arena PC Bridge" starten\n' +
          '4) hier erneut testen\n\n' +
          'Technischer Fehler: ' + String((err && err.message) || err),
        true
      );
      return null;
    }
  }

  document.getElementById('test').addEventListener('click', test);

  document.getElementById('allow').addEventListener('click', async function () {
    log('Erlaube Zugriff …');
    try {
      // Ohne Content-Type-Header: dadurch entfaellt der CORS-Preflight.
      const res = await call('/api/consent/allow', {
        method: 'POST',
        headers: { 'X-Arena-Bridge': '1' }
      });
      if (!res.ok || !res.data || res.data.ok !== true) {
        log('Der Zugriff konnte nicht erlaubt werden.\n' + JSON.stringify(res.data, null, 2), true);
        return;
      }
      log('Erlaubt! Der Browser darf ab jetzt mit der Bruecke sprechen.\n\n' + JSON.stringify(res.data, null, 2));
      const status = await test();
      if (status && status.enabled !== undefined) {
        window.setTimeout(function () {
          log(
            'Alles bereit. Jetzt kannst du diesen Tab schliessen und auf arena.ai den Schalter unter der Chat-Eingabe auf AN stellen.\n\n' +
              JSON.stringify(status, null, 2)
          );
        }, 600);
      }
    } catch (err) {
      log('Fehler: ' + String((err && err.message) || err), true);
    }
  });

  test();
})();
