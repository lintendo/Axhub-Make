export const OPENCODE_BASE_PATH = '/opencode';
export const AXHUB_HUG_SCRIPT_PATH = `${OPENCODE_BASE_PATH}/axhub-hug.js`;
export const AXHUB_HUG_SCRIPT = String.raw `(() => {
  const namespace = window.axhub || (window.axhub = {});
  const hug = namespace.hug || (namespace.hug = {});
  const opencode = hug.opencode || (hug.opencode = {});
  const logPrefix = '[Axhub Hug]';
  const buttonMarker = 'data-axhub-hug-open-window-button';

  // ---------------------------------------------------------------------------
  // Open-in-new-window button (existing feature)
  // ---------------------------------------------------------------------------

  function createIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = '<path d="M7.91675 2.9165H2.91675V17.0832H17.0834V12.0832M12.0834 2.9165H17.0834V7.9165M9.58342 10.4165L16.6667 3.33317" fill="none" stroke="currentColor" stroke-linecap="square"/>';
    return svg;
  }

  function mountOpenWindowButton(titlebarRight) {
    if (opencode.openWindowButtonMounted) return true;
    if (titlebarRight.querySelector('[' + buttonMarker + '="1"]')) {
      opencode.openWindowButtonMounted = true;
      return true;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'titlebar-icon w-8 h-6 p-0 box-border';
    button.setAttribute(buttonMarker, '1');
    button.setAttribute('aria-label', 'Open in new window');
    button.title = 'Open in new window';
    Object.assign(button.style, {
      alignItems: 'center',
      background: 'transparent',
      border: '0',
      borderRadius: '6px',
      color: 'var(--icon-base, currentColor)',
      cursor: 'pointer',
      display: 'inline-flex',
      justifyContent: 'center',
    });
    button.appendChild(createIcon());
    button.addEventListener('click', () => {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    });

    titlebarRight.appendChild(button);
    opencode.openWindowButtonMounted = true;
    return true;
  }

  function mountWhenReady() {
    const titlebarRight = document.getElementById('opencode-titlebar-right');
    if (titlebarRight) return mountOpenWindowButton(titlebarRight);
    return false;
  }

  function mountOpenWindowButtonFeature() {
    if (opencode.openWindowButtonMounted) return;
    if (window.self === window.top) return;
    if (mountWhenReady()) return;

    const observer = new MutationObserver(() => {
      if (!mountWhenReady()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });

    console.debug(logPrefix, 'waiting for OpenCode titlebar');
  }

  // ---------------------------------------------------------------------------
  // Context Bridge — WebSocket client for receiving context from Make Admin UI
  // ---------------------------------------------------------------------------

  const bridgeMarker = 'data-axhub-hug-bridge-indicator';
  const bridge = opencode.bridge || (opencode.bridge = {});

  // State
  bridge.ws = null;
  bridge.connected = false;
  bridge.enabled = false;
  bridge.contexts = bridge.contexts || {};  // id -> context item
  bridge.reconnectTimer = null;
  bridge.reconnectDelay = 2000;
  bridge.maxReconnectDelay = 30000;
  bridge.heartbeatTimer = null;
  bridge.reconnectCount = 0;
  bridge.maxReconnectRetries = 5;
  bridge.indicatorEl = null;

  // Bridge is always enabled when hug.js is loaded into the OpenCode WebUI.
  // The server-side WS relay is always available.

  function getBridgeWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return proto + '//' + host + '/api/opencode-bridge/ws?role=opencode';
  }

  function connectBridge() {
    if (bridge.ws) return;
    bridge.enabled = true;

    try {
      const ws = new WebSocket(getBridgeWsUrl());
      bridge.ws = ws;

      ws.addEventListener('open', () => {
        bridge.connected = true;
        bridge.reconnectDelay = 2000; // reset backoff
        bridge.reconnectCount = 0;    // reset retry counter
        updateBridgeIndicator();
        console.debug(logPrefix, 'Bridge connected');

        // Start heartbeat
        bridge.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleBridgeMessage(msg);
        } catch (err) {
          console.warn(logPrefix, 'Bridge message parse error:', err);
        }
      });

      ws.addEventListener('close', () => {
        cleanup();
        if (bridge.enabled) scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        cleanup();
        if (bridge.enabled) scheduleReconnect();
      });
    } catch (err) {
      console.warn(logPrefix, 'Bridge connection failed:', err);
      cleanup();
      if (bridge.enabled) scheduleReconnect();
    }
  }

  function cleanup() {
    bridge.connected = false;
    bridge.ws = null;
    if (bridge.heartbeatTimer) {
      clearInterval(bridge.heartbeatTimer);
      bridge.heartbeatTimer = null;
    }
    updateBridgeIndicator();
  }

  function disconnectBridge() {
    bridge.enabled = false;
    if (bridge.reconnectTimer) {
      clearTimeout(bridge.reconnectTimer);
      bridge.reconnectTimer = null;
    }
    if (bridge.ws) {
      try { bridge.ws.close(); } catch {}
    }
    cleanup();
    bridge.contexts = {};
  }

  function scheduleReconnect() {
    if (bridge.reconnectTimer) return;
    if (bridge.reconnectCount >= bridge.maxReconnectRetries) {
      console.debug(logPrefix, 'Bridge max reconnect attempts reached, giving up');
      return;
    }
    bridge.reconnectCount += 1;
    const delay = bridge.reconnectDelay;
    bridge.reconnectDelay = Math.min(delay * 2, bridge.maxReconnectDelay);
    console.debug(logPrefix, 'Bridge reconnecting in ' + delay + 'ms (attempt ' + bridge.reconnectCount + '/' + bridge.maxReconnectRetries + ')');
    bridge.reconnectTimer = setTimeout(() => {
      bridge.reconnectTimer = null;
      if (bridge.enabled) connectBridge();
    }, delay);
  }

  // ---- Message handling ----------------------------------------------------

  function handleBridgeMessage(msg) {
    switch (msg.type) {
      case 'pong':
        // heartbeat response, no action needed
        break;

      case 'ping':
        if (bridge.ws && bridge.ws.readyState === WebSocket.OPEN) {
          bridge.ws.send(JSON.stringify({ type: 'pong' }));
        }
        break;

      case 'hello':
        console.debug(logPrefix, 'Bridge hello:', msg.payload);
        break;

      case 'status':
        bridge.serverStatus = msg.payload;
        updateBridgeIndicator();
        break;

      case 'context:add':
      case 'context:update':
        if (msg.payload && msg.payload.id) {
          bridge.contexts[msg.payload.id] = msg.payload;
          onContextChanged();
        }
        break;

      case 'context:remove':
        if (msg.payload && msg.payload.id) {
          delete bridge.contexts[msg.payload.id];
          onContextChanged();
        }
        break;

      case 'context:clear':
        bridge.contexts = {};
        onContextChanged();
        break;

      case 'context:sync':
        if (Array.isArray(msg.payload)) {
          bridge.contexts = {};
          for (const item of msg.payload) {
            if (item && item.id) bridge.contexts[item.id] = item;
          }
          onContextChanged();
        }
        break;
    }
  }

  // ---- Bridge context sync event -------------------------------------------
  // The bridge only transports context state. OpenCode prompt injection and
  // context UI must be handled by OpenCode's native prompt.context pipeline.

  function onContextChanged() {
    updateBridgeIndicator();

    try {
      window.dispatchEvent(new CustomEvent('axhub-bridge-context-changed', {
        detail: { contexts: Object.values(bridge.contexts) },
      }));
    } catch {}
  }

  // ---- Bridge status indicator in OpenCode titlebar ------------------------

  function createBridgeIndicatorSvg(connected) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');

    if (connected) {
      // Link icon
      svg.innerHTML = '<path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M9.646 10.5H12a3 3 0 0 0 0-6H9a3 3 0 0 0-2.83 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
    } else {
      // Unlink icon
      svg.innerHTML = '<path d="M7 5.5H4a3 3 0 0 0 0 6h1.5M9 10.5h3a3 3 0 0 0 0-6h-1.5M5 8h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>';
    }
    return svg;
  }

  function updateBridgeIndicator() {
    if (!bridge.indicatorEl) return;
    const el = bridge.indicatorEl;
    const connected = bridge.connected;
    const contextCount = Object.keys(bridge.contexts).length;

    // Update icon
    el.innerHTML = '';
    el.appendChild(createBridgeIndicatorSvg(connected));

    // Update color
    el.style.color = connected ? 'var(--color-green, #22c55e)' : 'var(--icon-muted, currentColor)';
    el.style.opacity = connected ? '1' : '0.4';

    // Update tooltip
    const status = connected ? 'Connected' : 'Disconnected';
    const ctx = contextCount > 0 ? ' (' + contextCount + ' context items)' : '';
    el.title = 'Axhub Bridge: ' + status + ctx;
  }

  function mountBridgeIndicator(titlebarRight) {
    if (bridge.indicatorEl) return;
    if (titlebarRight.querySelector('[' + bridgeMarker + '="1"]')) return;

    const indicator = document.createElement('span');
    indicator.setAttribute(bridgeMarker, '1');
    Object.assign(indicator.style, {
      alignItems: 'center',
      display: 'inline-flex',
      justifyContent: 'center',
      width: '20px',
      height: '20px',
      marginRight: '4px',
      cursor: 'default',
    });
    bridge.indicatorEl = indicator;
    updateBridgeIndicator();

    // Insert before other buttons
    if (titlebarRight.firstChild) {
      titlebarRight.insertBefore(indicator, titlebarRight.firstChild);
    } else {
      titlebarRight.appendChild(indicator);
    }
  }

  // ---- Bridge feature bootstrap --------------------------------------------

  function mountBridgeFeature() {
    if (!bridge.enabled) return;

    const titlebarRight = document.getElementById('opencode-titlebar-right');
    if (titlebarRight) {
      mountBridgeIndicator(titlebarRight);
    }
  }

  function bootBridge() {

    bridge.enabled = true;
    connectBridge();

    // Try to mount indicator when titlebar appears
    function tryMount() {
      const titlebarRight = document.getElementById('opencode-titlebar-right');
      if (titlebarRight) {
        mountBridgeIndicator(titlebarRight);
        return true;
      }
      return false;
    }

    if (!tryMount()) {
      const observer = new MutationObserver(() => {
        if (tryMount()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }
  }

  // ---- Expose API for external control (e.g. postMessage from Make Admin) --

  opencode.bridge = bridge;
  bridge.connect = connectBridge;
  bridge.disconnect = disconnectBridge;
  bridge.isEnabled = () => bridge.enabled;
  bridge.isConnected = () => bridge.connected;
  bridge.getContexts = () => Object.values(bridge.contexts);

  // ---- Boot ----------------------------------------------------------------

  function boot() {
    mountOpenWindowButtonFeature();
    bootBridge();
  }

  boot();
})();`;
