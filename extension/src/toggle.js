/*
 * toggle.js -- Content-Script in der "ISOLATED" Welt.
 *
 * Es hat Zugriff auf chrome.runtime und vermittelt zwischen der Seite
 * (inject.js, MAIN-Welt) und dem Service-Worker der Extension.
 *
 * Ablauf:
 *   Seite  --window.postMessage-->  toggle.js  --chrome.runtime-->  Worker
 *   Worker --> toggle.js --window.postMessage--> Seite (Anzeige)
 */
(function () {
  'use strict';

  const PAGE_SOURCE = 'arena-pc-bridge-page';
  const EXT_SOURCE = 'arena-pc-bridge-ext';

  function postToPage(payload) {
    payload.source = EXT_SOURCE;
    window.postMessage(payload, window.location.origin);
  }

  async function send(message) {
    try {
      const answer = await chrome.runtime.sendMessage(message);
      return answer || { ok: false, error: 'Keine Antwort vom Hintergrund' };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  async function pushState() {
    const answer = await send({ type: 'arena-pc-bridge:get-state' });
    if (answer && answer.ok) {
      postToPage({ type: 'state', settings: answer.settings, tools: answer.tools });
    }
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (!message || message.type !== 'arena-pc-bridge:state') return;
    postToPage({
      type: 'state',
      settings: message.settings,
      tools: message.tools
    });
  });

  window.addEventListener('message', async function (event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== PAGE_SOURCE) return;

    switch (data.type) {
      case 'request-state':
        await pushState();
        break;

      case 'set-enabled': {
        await send({ type: 'arena-pc-bridge:set-enabled', enabled: !!data.enabled });
        await pushState();
        break;
      }

      case 'save-settings': {
        await send({ type: 'arena-pc-bridge:save-settings', patch: data.patch || {} });
        await pushState();
        break;
      }

      case 'connect': {
        const result = await send({ type: 'arena-pc-bridge:connect' });
        postToPage({ type: 'connect-result', id: data.id, result: result });
        await pushState();
        break;
      }

      case 'open-connection-tab':
        await send({
          type: 'arena-pc-bridge:open-connection-tab',
          bridgeUrl: data.bridgeUrl
        });
        break;

      case 'open-guide':
        await send({ type: 'arena-pc-bridge:open-guide' });
        break;

      case 'tool-call': {
        const result = await send({
          type: 'arena-pc-bridge:tools/call',
          name: data.name,
          arguments: data.arguments || {}
        });
        postToPage({ type: 'tool-result', id: data.id, result: result });
        break;
      }

      default:
        break;
    }
  });

  pushState();
})();
