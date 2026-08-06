(() => {
  "use strict";

  if (window.__axhubMakeUserScriptInstalled) return;
  window.__axhubMakeUserScriptInstalled = true;

  const ENTRY_ID = "axhub-make-sidebar-entry";
  const TOAST_ID = "axhub-make-toast";
  const STYLE_ID = "axhub-make-style";
  const BINDING = "__axhubMakeHostV1";
  const RESPONSE_EVENT = "axhub-make:host-response";
  const MAKE_URL = "http://127.0.0.1:53817/?surface=codex";
  const FIXED_ORIGIN = "http://127.0.0.1:53817";
  const REQUEST_TIMEOUT_MS = 20000;
  const PLUGIN_LABELS = new Set(["plugins", "插件"]);

  const pending = new Map();
  let entry = null;
  let opening = false;
  let requestSequence = 0;
  let refreshTimer = null;

  function normalizedLabel(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ENTRY_ID}[aria-busy="true"] { opacity: 0.68; cursor: progress; }
      #${ENTRY_ID}:focus-visible { outline: 2px solid var(--color-token-border, Highlight); outline-offset: 2px; }
      #${TOAST_ID} { position: fixed; inset-inline-end: 20px; bottom: 20px; z-index: 10000; display: flex; max-width: min(360px, calc(100vw - 40px)); align-items: center; gap: 12px; border: 1px solid var(--color-token-border, color-mix(in srgb, CanvasText 18%, transparent)); border-radius: 8px; padding: 10px 12px; background: var(--color-token-main-surface-primary, Canvas); color: var(--color-token-foreground, CanvasText); box-shadow: 0 8px 28px color-mix(in srgb, CanvasText 14%, transparent); font: 13px/1.45 system-ui, sans-serif; }
      #${TOAST_ID} span { min-width: 0; flex: 1; }
      #${TOAST_ID} button { flex: none; border: 1px solid var(--color-token-border, color-mix(in srgb, CanvasText 18%, transparent)); border-radius: 6px; padding: 5px 9px; background: var(--color-token-main-surface-secondary, Canvas); color: inherit; font: inherit; cursor: pointer; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function findReferenceButton() {
    const sidebar = document.querySelector("[data-app-action-sidebar-scroll]") || document.querySelector("aside");
    if (!sidebar) return null;
    return Array.from(sidebar.querySelectorAll("button")).find((button) => PLUGIN_LABELS.has(normalizedLabel(
      button.querySelector(".text-fade-truncate")?.textContent || button.getAttribute("aria-label") || button.textContent,
    ))) || null;
  }

  function replaceEntryIcon(button) {
    const icon = button.querySelector("svg");
    if (!icon) return;
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.innerHTML = '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 9h18M9 21V9"></path>';
  }

  function createEntry(reference) {
    const button = reference.cloneNode(true);
    button.id = ENTRY_ID;
    button.type = "button";
    ["disabled", "aria-controls", "aria-current", "aria-expanded", "aria-describedby", "data-state"].forEach((name) => button.removeAttribute(name));
    button.setAttribute("aria-label", "Open Axhub Make");
    button.setAttribute("title", "Axhub Make");
    button.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    const label = button.querySelector(".text-fade-truncate") || Array.from(button.querySelectorAll("span")).find((node) => PLUGIN_LABELS.has(normalizedLabel(node.textContent)));
    if (label) label.textContent = "Axhub Make";
    else button.textContent = "Axhub Make";
    replaceEntryIcon(button);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMake();
    });
    return button;
  }

  function setEntryBusy(value) {
    if (!entry) return;
    if (value) {
      entry.setAttribute("aria-busy", "true");
      entry.setAttribute("title", "Starting Axhub Make");
      return;
    }
    entry.removeAttribute("aria-busy");
    entry.setAttribute("title", "Axhub Make");
  }

  function ensureEntry() {
    installStyles();
    const reference = findReferenceButton();
    if (!reference?.parentElement) return;
    entry = document.getElementById(ENTRY_ID) || entry;
    if (!entry?.isConnected) entry = createEntry(reference);
    if (entry.parentElement !== reference.parentElement || entry.previousElementSibling !== reference) reference.after(entry);
    setEntryBusy(opening);
  }

  function dismissToast() {
    document.getElementById(TOAST_ID)?.remove();
  }

  function showError(message) {
    dismissToast();
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "alert");
    const text = document.createElement("span");
    text.textContent = message;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Retry";
    retry.addEventListener("click", openMake, { once: true });
    toast.append(text, retry);
    document.body.appendChild(toast);
  }

  function ensureMake() {
    const binding = window[BINDING];
    if (typeof binding !== "function") return Promise.reject(new Error("Axhub Companion is not running"));
    const id = `axhub-${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error("Axhub Companion did not respond"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeout });
      try {
        binding(JSON.stringify({ id, action: "ensure-make" }));
      } catch (error) {
        window.clearTimeout(timeout);
        pending.delete(id);
        reject(error);
      }
    });
  }

  function onHostResponse(event) {
    let response = event.detail;
    if (typeof response === "string") {
      try { response = JSON.parse(response); } catch { return; }
    }
    if (!response || typeof response.id !== "string") return;
    const request = pending.get(response.id);
    if (!request) return;
    window.clearTimeout(request.timeout);
    pending.delete(response.id);
    if (response.ok) request.resolve(response);
    else request.reject(new Error(response.error || "Axhub Make failed to start"));
  }

  function openInCodexBrowser(origin) {
    const url = new URL(origin);
    if (url.origin !== FIXED_ORIGIN || url.username || url.password) throw new Error("Axhub Companion returned an invalid origin");
    const sendMessage = window.electronBridge?.sendMessageFromView;
    if (typeof sendMessage !== "function") throw new Error("Codex built-in browser is unavailable");
    sendMessage.call(window.electronBridge, {
      type: "open-in-browser",
      url: MAKE_URL,
      openTarget: "in-app-browser",
      source: "manual",
      initiator: "axhub_make_sidebar",
    });
  }

  async function openMake() {
    if (opening) return;
    opening = true;
    ensureEntry();
    setEntryBusy(true);
    dismissToast();
    try {
      openInCodexBrowser((await ensureMake()).origin);
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      opening = false;
      setEntryBusy(false);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer !== null) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      ensureEntry();
    }, 80);
  }

  function mount() {
    document.removeEventListener("DOMContentLoaded", mount);
    ensureEntry();
    new MutationObserver(scheduleRefresh).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener(RESPONSE_EVENT, onHostResponse);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
