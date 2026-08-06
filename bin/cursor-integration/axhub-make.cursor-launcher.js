(() => {
  "use strict";

  if (window.__axhubMakeCursorLauncherInstalled) return;
  window.__axhubMakeCursorLauncherInstalled = true;

  const ENTRY_ID = "axhub-make-cursor-entry";
  const BINDING = "__axhubMakeHostV1";
  const RESPONSE_EVENT = "axhub-make:host-response";
  const REQUEST_TIMEOUT_MS = 180000;
  const IDE_LABELS = new Set(["ide"]);

  const pending = new Map();
  let entry = null;
  let entryState = { state: "idle", message: "" };
  let errorResetTimer = null;
  let opening = false;
  let requestSequence = 0;
  let refreshTimer = null;

  function normalizedLabel(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findReferenceButton() {
    return Array.from(document.querySelectorAll("button")).find((button) => IDE_LABELS.has(normalizedLabel(
      button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent,
    ))) || null;
  }

  function replaceLabel(button, label) {
    const candidates = Array.from(button.querySelectorAll("span"));
    const textNode = candidates.find((node) => normalizedLabel(node.textContent) === "ide")
      || candidates.find((node) => normalizedLabel(node.textContent));
    if (textNode) {
      if (textNode.textContent !== label) textNode.textContent = label;
    } else if (button.textContent !== label) {
      button.textContent = label;
    }
  }

  function replaceIcon(button) {
    const icon = button.querySelector("svg");
    if (!icon) return;
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.innerHTML = '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 9h18M9 21V9"></path>';
  }

  function createEntry(reference) {
    const button = reference.cloneNode(true);
    button.id = ENTRY_ID;
    button.type = "button";
    ["disabled", "aria-controls", "aria-current", "aria-expanded", "aria-describedby", "data-state"].forEach((name) => button.removeAttribute(name));
    button.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    button.setAttribute("aria-label", "Open Axhub Make");
    button.setAttribute("title", "Axhub Make");
    replaceLabel(button, "Axhub Make");
    replaceIcon(button);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMake();
    });
    return button;
  }

  function renderEntryState() {
    if (!entry) return;
    const { state, message } = entryState;
    entry.dataset.axhubState = state;
    replaceLabel(entry, state === "starting" ? "Opening…" : state === "error" ? "Open failed" : "Axhub Make");
    if (state === "starting") {
      entry.disabled = true;
      entry.setAttribute("aria-busy", "true");
      entry.setAttribute("title", "Starting Axhub Make");
      return;
    }
    entry.disabled = false;
    entry.removeAttribute("aria-busy");
    entry.setAttribute("title", state === "error" ? message : "Axhub Make");
  }

  function setEntryState(state, message = "") {
    entryState = { state, message };
    renderEntryState();
  }

  function ensureEntry() {
    const reference = findReferenceButton();
    if (!reference?.parentElement) return;
    entry = document.getElementById(ENTRY_ID) || entry;
    if (!entry?.isConnected) entry = createEntry(reference);
    if (entry.parentElement !== reference.parentElement || entry.previousElementSibling !== reference) {
      reference.after(entry);
    }
    renderEntryState();
  }

  function requestOpenMake() {
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
        binding(JSON.stringify({ id, action: "open-make" }));
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
    else request.reject(new Error(response.error || "Axhub Make failed to open"));
  }

  async function openMake() {
    if (opening) return;
    opening = true;
    if (errorResetTimer !== null) {
      window.clearTimeout(errorResetTimer);
      errorResetTimer = null;
    }
    ensureEntry();
    setEntryState("starting");
    try {
      await requestOpenMake();
      setEntryState("idle");
    } catch (error) {
      setEntryState("error", error instanceof Error ? error.message : String(error));
      errorResetTimer = window.setTimeout(() => {
        errorResetTimer = null;
        setEntryState("idle");
      }, 3000);
    } finally {
      opening = false;
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
