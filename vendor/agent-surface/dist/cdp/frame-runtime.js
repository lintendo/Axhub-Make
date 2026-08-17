export const FRAME_RUNTIME_KEY = "__AXHUB_AGENT_SURFACE__";
export const FRAME_RUNTIME_VERSION = 25;
export async function evaluateFrameRuntime(session, expression) {
    const result = await session.command("Runtime.evaluate", { expression, returnByValue: true });
    const value = result && typeof result === "object"
        ? result.result?.value
        : undefined;
    if (!value || typeof value !== "object") {
        return {
            ok: false,
            code: "runtime-evaluation-failed",
            message: "The injected frame runtime returned an invalid result.",
        };
    }
    const candidate = value;
    if (typeof candidate.ok !== "boolean" || typeof candidate.code !== "string") {
        return {
            ok: false,
            code: "runtime-evaluation-failed",
            message: "The injected frame runtime returned an invalid result.",
        };
    }
    return {
        ok: candidate.ok,
        code: candidate.code,
        ...(typeof candidate.message === "string" ? { message: candidate.message } : {}),
        ...(typeof candidate.entryId === "string" ? { entryId: candidate.entryId } : {}),
    };
}
export function activateFrameEntryExpression(entryId) {
    return `window[${JSON.stringify(FRAME_RUNTIME_KEY)}]?.activate(${JSON.stringify(entryId)}) ?? ({ ok: false, code: "runtime-missing" })`;
}
export function frameRuntimeStatusExpression() {
    return `window[${JSON.stringify(FRAME_RUNTIME_KEY)}]?.status() ?? ({ ok: false, code: "runtime-missing" })`;
}
export function deactivateFrameEntryExpression() {
    const runtime = `window[${JSON.stringify(FRAME_RUNTIME_KEY)}]`;
    return `(() => { const runtime = ${runtime}; const status = runtime?.status() ?? ({ ok: false, code: "runtime-missing" }); if (!status.ok) return status; return runtime.deactivate(); })()`;
}
export function buildFrameRuntimeSource(inputEntries, inputProfile) {
    const entries = [...inputEntries]
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((entry) => ({
        id: entry.id,
        name: entry.name,
        url: entry.url,
        order: entry.order,
        ...(entry.icon === undefined ? {} : { icon: entry.icon }),
        headerActions: {
            refresh: entry.headerActions?.refresh !== false,
            copyUrl: entry.headerActions?.copyUrl !== false,
        },
    }));
    return `(() => {
  const runtimeKey = ${JSON.stringify(FRAME_RUNTIME_KEY)};
  const runtimeVersion = ${FRAME_RUNTIME_VERSION};
  const nextEntries = ${JSON.stringify(entries)};
  const nextProfile = ${JSON.stringify(inputProfile)};
  const observeMutations = nextProfile.observeMutations === true;
  const observeResize = nextProfile.observeResize !== false;
  const existing = window[runtimeKey];
  if (existing?.version === runtimeVersion && typeof existing.update === "function") {
    return existing.update(nextEntries, nextProfile);
  }
  if (typeof existing?.dispose === "function") existing.dispose();
  else if (typeof existing?.deactivate === "function") existing.deactivate();

  const menuAttribute = "data-axhub-agent-surface";
  const entryAttribute = "data-axhub-agent-surface-entry";
  const presentationAttribute = "data-axhub-agent-surface-presentation";
  const surfaceAttribute = "data-axhub-agent-surface-frame-root";
  const hostAttribute = "data-axhub-agent-surface-host";
  const hiddenAttribute = "data-axhub-agent-surface-native-hidden";
  const styleAttribute = "data-axhub-agent-surface-style";
  const headerAttribute = "data-axhub-agent-surface-header";
  const headerLeadingActionsAttribute = "data-axhub-agent-surface-header-leading-actions";
  const headerTitleAttribute = "data-axhub-agent-surface-header-title";
  const headerActionsAttribute = "data-axhub-agent-surface-header-actions";
  const headerActionAttribute = "data-axhub-agent-surface-header-action";
  const headerActionIconAttribute = "data-axhub-agent-surface-header-action-icon";
  const headerActionBoundAttribute = "data-axhub-agent-surface-header-action-bound";
  const tooltipAttribute = "data-axhub-agent-surface-tooltip";
  const toastAttribute = "data-axhub-agent-surface-toast";
  const loadingAttribute = "data-axhub-agent-surface-loading";
  const frameAttribute = "data-axhub-agent-surface-frame";
  const frameLoadedAttribute = "data-axhub-agent-surface-frame-loaded";
  const navigationMessageType = "axhub-agent-surface:navigation";
  const frameSandbox = "allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox";
  const frameAllow = "clipboard-read; clipboard-write; fullscreen";
  const frameIdleTimeoutMs = 3 * 60 * 1000;
  const postClickReconcileDelays = [100, 400, 1000, 1800];
  const state = {
    entries: nextEntries,
    profile: nextProfile,
    activeEntryId: "",
    menu: null,
    menuAvailable: false,
    surface: null,
    header: null,
    headerTitle: null,
    tooltip: null,
    toast: null,
    loading: null,
    surfaceRoot: null,
    resizeObserver: null,
    mutationObserver: null,
    nativeSelectionSnapshot: [],
    activeUrls: new Map(nextEntries.map((entry) => [entry.id, entry.url])),
    frameCleanupTimers: new Map(),
    tooltipTimer: null,
    toastTimer: null,
    keyboardNavigation: false,
    scheduled: false,
    disposed: false,
  };

  const query = (selector) => {
    if (!selector) return null;
    try { return document.querySelector(selector); } catch { return null; }
  };

  const closest = (node, selector) => {
    if (!node || !selector || typeof node.closest !== "function") return null;
    try { return node.closest(selector); } catch { return null; }
  };

  const installLayoutStyles = () => {
    if (document.querySelector("style[" + styleAttribute + "]")) return;
    const style = document.createElement("style");
    style.setAttribute(styleAttribute, "true");
    style.textContent = "[" + hostAttribute + '=\"true\"]{position:relative !important;overflow:hidden !important;}[' + hiddenAttribute + '=\"true\"]{visibility:hidden !important;pointer-events:none !important;}';
    (document.head || document.documentElement).appendChild(style);
  };

  const restoreNativeContent = () => {
    document.querySelectorAll("[" + hiddenAttribute + "]").forEach((node) => node.removeAttribute(hiddenAttribute));
    document.querySelectorAll("[" + hostAttribute + "]").forEach((node) => node.removeAttribute(hostAttribute));
  };

  const hideNativeContent = () => {
    if (!state.surfaceRoot || !state.surface) return;
    restoreNativeContent();
    state.surfaceRoot.setAttribute(hostAttribute, "true");
    Array.from(state.surfaceRoot.children).forEach((child) => {
      if (child !== state.surface) child.setAttribute(hiddenAttribute, "true");
    });
  };

  const findEntryButton = (entryId) => {
    if (!state.menu) return null;
    return Array.from(state.menu.querySelectorAll("[" + entryAttribute + "]"))
      .find((node) => node.getAttribute(entryAttribute) === entryId) || null;
  };

  const findFrame = (entryId) => {
    if (!state.surface) return null;
    return Array.from(state.surface.querySelectorAll("[" + frameAttribute + "]"))
      .find((node) => node.getAttribute(frameAttribute) === entryId) || null;
  };

  const cancelFrameCleanup = (entryId) => {
    const timer = state.frameCleanupTimers.get(entryId);
    if (timer !== undefined) clearTimeout(timer);
    state.frameCleanupTimers.delete(entryId);
  };

  const scheduleFrameCleanup = (entryId) => {
    if (!entryId) return;
    cancelFrameCleanup(entryId);
    const timer = setTimeout(() => {
      state.frameCleanupTimers.delete(entryId);
      if (state.disposed || state.activeEntryId === entryId) return;
      findFrame(entryId)?.remove();
    }, frameIdleTimeoutMs);
    state.frameCleanupTimers.set(entryId, timer);
  };

  const getInitialOrigin = (entry) => {
    try { return new URL(entry.url).origin; } catch { return ""; }
  };

  const getActiveUrl = (entry) => state.activeUrls.get(entry.id) || entry.url;

  const hideActionTooltip = () => {
    if (state.tooltipTimer) clearTimeout(state.tooltipTimer);
    state.tooltipTimer = null;
    if (!state.tooltip) return;
    state.tooltip.style.opacity = "0";
    state.tooltip.style.transform = "translate(-50%, -4px)";
  };

  const showActionTooltip = (button) => {
    if (!state.surface || !button?.isConnected) return;
    if (state.tooltipTimer) clearTimeout(state.tooltipTimer);
    state.tooltipTimer = setTimeout(() => {
      if (!state.surface || !button.isConnected) return;
      let tooltip = state.surface.querySelector("[" + tooltipAttribute + "]");
      if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.setAttribute(tooltipAttribute, "tooltip");
        tooltip.setAttribute("role", "tooltip");
        Object.assign(tooltip.style, {
          position: "absolute",
          zIndex: "3",
          maxWidth: "220px",
          padding: "6px 8px",
          borderRadius: "6px",
          color: "#f8fafc",
          background: "#0f172a",
          boxShadow: "0 6px 16px rgba(15, 23, 42, 0.18)",
          fontSize: "12px",
          fontWeight: "500",
          lineHeight: "16px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          opacity: "0",
          transform: "translate(-50%, -4px)",
          transition: "opacity 120ms ease, transform 120ms ease",
        });
        state.surface.appendChild(tooltip);
      }
      const surfaceRect = state.surface.getBoundingClientRect();
      const actionRect = button.getBoundingClientRect();
      tooltip.textContent = button.getAttribute("aria-label") || "";
      tooltip.style.left = actionRect.left - surfaceRect.left + actionRect.width / 2 + "px";
      tooltip.style.top = actionRect.bottom - surfaceRect.top + 8 + "px";
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translate(-50%, 0)";
      state.tooltip = tooltip;
      state.tooltipTimer = null;
    }, 300);
  };

  const appendFeedbackIcon = (container, tone) => {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 20 20");
    icon.setAttribute("width", "16");
    icon.setAttribute("height", "16");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "10");
    circle.setAttribute("cy", "10");
    circle.setAttribute("r", "7");
    icon.appendChild(circle);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", tone === "toast-success" ? "m6.8 10 2.1 2.1 4.5-4.5" : tone === "toast-error" ? "m7.5 7.5 5 5m0-5-5 5" : "M10 6.7v3.7m0 2.8h.01");
    icon.appendChild(path);
    container.appendChild(icon);
  };

  const showToast = (message, tone) => {
    if (!state.surface) return;
    let toast = state.surface.querySelector("[" + toastAttribute + "]");
    if (!toast) {
      toast = document.createElement("div");
      toast.setAttribute(toastAttribute, "toast");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      Object.assign(toast.style, {
        position: "absolute",
        top: "64px",
        right: "16px",
        zIndex: "4",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        maxWidth: "320px",
        padding: "9px 12px",
        border: "1px solid transparent",
        borderRadius: "8px",
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)",
        fontSize: "13px",
        fontWeight: "500",
        lineHeight: "18px",
        pointerEvents: "none",
        opacity: "0",
        transform: "translateY(-6px)",
        transition: "opacity 160ms ease, transform 160ms ease",
      });
      state.surface.appendChild(toast);
    }
    toast.replaceChildren();
    appendFeedbackIcon(toast, tone);
    toast.appendChild(document.createTextNode(message));
    const palette = tone === "toast-success"
      ? { color: "#166534", background: "#f0fdf4", borderColor: "#bbf7d0" }
      : tone === "toast-error"
        ? { color: "#b91c1c", background: "#fef2f2", borderColor: "#fecaca" }
        : { color: "#1d4ed8", background: "#eff6ff", borderColor: "#bfdbfe" };
    Object.assign(toast.style, palette);
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    state.toast = toast;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      if (state.toast !== toast) return;
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
    }, 2200);
  };

  const setButtonSelection = (button, active) => {
    button.setAttribute("aria-current", active ? "page" : "false");
    if (button.getAttribute("role") === "tab" || button.hasAttribute("aria-selected")) {
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
    const selectedClassName = state.profile.selectedClassName;
    if (selectedClassName) button.classList.toggle(selectedClassName, active);
    const inactiveClassName = state.profile.inactiveClassName;
    if (inactiveClassName) button.classList.toggle(inactiveClassName, !active);
  };

  const restoreNativeSelection = () => {
    state.nativeSelectionSnapshot.forEach((snapshot) => {
      const button = snapshot.button;
      if (!button?.isConnected) return;
      if (snapshot.selectedClassName && snapshot.hadSelectedClass) {
        button.classList.add(snapshot.selectedClassName);
      }
      if (snapshot.inactiveClassName) {
        if (snapshot.hadInactiveClass) button.classList.add(snapshot.inactiveClassName);
        else button.classList.remove(snapshot.inactiveClassName);
      }
      if (snapshot.ariaSelected === null) button.removeAttribute("aria-selected");
      else button.setAttribute("aria-selected", snapshot.ariaSelected);
      if (snapshot.ariaCurrent === null) button.removeAttribute("aria-current");
      else button.setAttribute("aria-current", snapshot.ariaCurrent);
    });
    state.nativeSelectionSnapshot = [];
  };

  const suppressNativeSelection = () => {
    state.nativeSelectionSnapshot = state.nativeSelectionSnapshot.filter((snapshot) => snapshot.button?.isConnected);
    const selector = state.profile.nativeSelectionSelector;
    if (!selector) return;
    let buttons = [];
    try { buttons = Array.from(document.querySelectorAll(selector)); } catch { return; }
    const selectedClassName = state.profile.selectedClassName;
    const inactiveClassName = state.profile.inactiveClassName;
    buttons.forEach((button) => {
      if (button.hasAttribute(entryAttribute)) return;
      const ariaSelected = button.getAttribute("aria-selected");
      const ariaCurrent = button.getAttribute("aria-current");
      const hadSelectedClass = Boolean(selectedClassName && button.classList.contains(selectedClassName));
      const hadInactiveClass = Boolean(inactiveClassName && button.classList.contains(inactiveClassName));
      const selected = hadSelectedClass
        || ariaSelected === "true"
        || Boolean(ariaCurrent && ariaCurrent !== "false");
      if (!selected) return;
      const alreadySuppressed = state.nativeSelectionSnapshot.some((snapshot) => snapshot.button === button);
      if (!alreadySuppressed) {
        state.nativeSelectionSnapshot.push({
          button,
          selectedClassName,
          hadSelectedClass,
          inactiveClassName,
          hadInactiveClass,
          ariaSelected,
          ariaCurrent,
        });
      }
      if (selectedClassName) button.classList.remove(selectedClassName);
      if (inactiveClassName) button.classList.add(inactiveClassName);
      if (ariaSelected !== null) button.setAttribute("aria-selected", "false");
      if (ariaCurrent !== null) button.setAttribute("aria-current", "false");
    });
  };

  const setButtonPresentation = (button, entry, reference) => {
    const presentation = [
      entry.id,
      entry.name,
      entry.icon || "",
      state.profile.entryIconSelector || "",
      state.profile.entryLabelSelector || "",
      state.profile.entryCleanupSelector || "",
      String(state.profile.entryIconTextGap ?? ""),
    ].join("\\n");
    if (state.profile.hideShortcutHint) {
      button.querySelectorAll?.("[class*=hotkey]").forEach((node) => node.remove());
    }
    if (state.profile.entryIconSelector) {
      try {
        button.querySelectorAll(state.profile.entryIconSelector).forEach((node) => node.remove());
      } catch {}
    }
    if (state.profile.entryCleanupSelector) {
      try {
        button.querySelectorAll(state.profile.entryCleanupSelector).forEach((node) => node.remove());
      } catch {}
    }
    if (button.getAttribute(presentationAttribute) === presentation) return;
    button.id = "";
    button.type = "button";
    button.disabled = false;
    ["aria-controls", "aria-expanded", "aria-describedby", "data-state"].forEach((name) => button.removeAttribute(name));
    button.querySelectorAll?.("[id]").forEach((node) => node.removeAttribute("id"));
    button.setAttribute(entryAttribute, entry.id);
    button.setAttribute(presentationAttribute, presentation);
    button.setAttribute("aria-label", entry.name);
    button.setAttribute("title", entry.name);
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    const requestedEntryGap = Number(state.profile.entryIconTextGap);
    button.style.gap = (Number.isFinite(requestedEntryGap) && requestedEntryGap >= 0 ? requestedEntryGap : 6) + "px";

    let label = null;
    if (reference) {
      try {
        label = button.querySelector?.(
          state.profile.entryLabelSelector || ".text-fade-truncate, [class*=label], span",
        );
      } catch {}
    }
    if (label) {
      label.textContent = entry.name;
      if (entry.icon) {
        button.querySelectorAll?.("svg, img").forEach((node) => node.remove());
        const image = document.createElement("img");
        image.src = entry.icon;
        image.alt = "";
        image.width = 16;
        image.height = 16;
        button.prepend(image);
      }
      return;
    }

    button.replaceChildren();
    if (entry.icon) {
      const image = document.createElement("img");
      image.src = entry.icon;
      image.alt = "";
      image.width = 16;
      image.height = 16;
      button.appendChild(image);
    }
    button.appendChild(document.createTextNode(entry.name));
  };

  const ensureMenu = () => {
    const reference = query(state.profile.referenceSelector);
    const slot = reference?.parentElement || query(state.profile.sidebarSlotSelector);
    if (!slot) {
      state.menu = null;
      state.menuAvailable = false;
      return null;
    }
    let menu = slot.querySelector("[" + menuAttribute + "]");
    if (!menu) {
      menu = document.createElement("div");
      menu.setAttribute(menuAttribute, "menu");
      if (reference?.parentElement === slot) reference.after(menu);
      else slot.appendChild(menu);
    } else if (reference?.parentElement === slot && menu.previousElementSibling !== reference) {
      reference.after(menu);
    }
    menu.style.display = "contents";
    state.menu = menu;
    state.menuAvailable = true;

    const expected = new Set(state.entries.map((entry) => entry.id));
    menu.querySelectorAll("[" + entryAttribute + "]").forEach((node) => {
      if (!expected.has(node.getAttribute(entryAttribute))) node.remove();
    });
    state.entries.forEach((entry) => {
      let button = findEntryButton(entry.id);
      if (!button) {
        button = reference?.cloneNode(true) || document.createElement("button");
        menu.appendChild(button);
      }
      setButtonPresentation(button, entry, reference);
      setButtonSelection(button, state.activeEntryId === entry.id);
    });
    return menu;
  };

  const resolveHeaderHeight = () => {
    const requested = Number(state.profile.surfaceHeaderHeight ?? 56);
    const contentHeight = Math.max(0, state.surfaceRoot?.getBoundingClientRect().height || 0);
    if (!Number.isFinite(requested) || requested <= 0) return Math.min(56, contentHeight);
    return Math.min(requested, contentHeight);
  };

  const setFrameLayout = (frame) => {
    const headerHeight = resolveHeaderHeight();
    Object.assign(frame.style, {
      position: "absolute",
      left: "0",
      top: headerHeight + "px",
      width: "100%",
      height: headerHeight > 0 ? "calc(100% - " + headerHeight + "px)" : "100%",
      border: "0",
      background: "#fff",
    });
    frame.style.setProperty("-webkit-app-region", "no-drag");
  };

  const setLoadingPlaceholderLayout = (loading) => {
    const headerHeight = resolveHeaderHeight();
    Object.assign(loading.style, {
      position: "absolute",
      left: "0",
      top: headerHeight + "px",
      width: "100%",
      height: headerHeight > 0 ? "calc(100% - " + headerHeight + "px)" : "100%",
      display: "none",
      placeItems: "center",
      color: "#94a3b8",
      background: "#fff",
      fontSize: "13px",
      fontWeight: "400",
      lineHeight: "20px",
      pointerEvents: "none",
      userSelect: "none",
      zIndex: "2",
    });
  };

  const ensureLoadingPlaceholder = () => {
    if (!state.surface) return null;
    let loading = state.surface.querySelector("[" + loadingAttribute + "]");
    if (!loading) {
      loading = document.createElement("div");
      loading.setAttribute(loadingAttribute, "loading");
      loading.setAttribute("role", "status");
      loading.setAttribute("aria-live", "polite");
      loading.textContent = "加载中...";
      state.surface.appendChild(loading);
    }
    setLoadingPlaceholderLayout(loading);
    state.loading = loading;
    return loading;
  };

  const syncLoadingPlaceholder = () => {
    const loading = ensureLoadingPlaceholder();
    if (!loading) return;
    const frame = state.activeEntryId ? findFrame(state.activeEntryId) : null;
    const loaded = Boolean(frame && frame.getAttribute(frameLoadedAttribute) === "true");
    loading.style.display = loaded ? "none" : "grid";
    if (!state.activeEntryId) loading.style.display = "none";
  };

  const bindFrameLoading = (frame, entryId, created) => {
    if (created) frame.setAttribute(frameLoadedAttribute, "false");
    else if (!frame.hasAttribute(frameLoadedAttribute)) frame.setAttribute(frameLoadedAttribute, "true");
    frame.onload = () => {
      frame.setAttribute(frameLoadedAttribute, "true");
      if (state.activeEntryId === entryId) syncLoadingPlaceholder();
    };
  };

  const appendActionIcon = (button, action) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const nodes = action === "refresh"
      ? [
        { tag: "path", attributes: { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" } },
        { tag: "path", attributes: { d: "M21 3v5h-5" } },
        { tag: "path", attributes: { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" } },
        { tag: "path", attributes: { d: "M8 16H3v5" } },
      ]
      : action === "expand-sidebar"
        ? [
          { tag: "path", attributes: { d: "M3 3h18v18H3z" } },
          { tag: "path", attributes: { d: "M9 3v18" } },
        ]
        : [
          { tag: "rect", attributes: { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" } },
          { tag: "path", attributes: { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" } },
        ];
    nodes.forEach((node) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", node.tag);
      Object.entries(node.attributes).forEach(([name, value]) => element.setAttribute(name, value));
      svg.appendChild(element);
    });
    button.setAttribute(headerActionIconAttribute, action);
    button.replaceChildren(svg);
  };

  const updateHeaderActionAppearance = (button) => {
    const pressed = button.getAttribute("data-axhub-agent-surface-pressed") === "true";
    const hovered = button.getAttribute("data-axhub-agent-surface-hovered") === "true";
    const focusVisible = button.getAttribute("data-axhub-agent-surface-focus-visible") === "true";
    button.style.background = pressed ? "#e2e8f0" : hovered ? "#f1f5f9" : "transparent";
    button.style.color = "#0f172a";
    button.style.transform = "none";
    button.style.outline = "none";
    button.style.outlineOffset = "0";
    button.style.boxShadow = focusVisible ? "inset 0 0 0 1px #0f172a" : "none";
  };

  const bindHeaderActionFeedback = (button) => {
    if (button.hasAttribute(headerActionBoundAttribute)) return;
    button.setAttribute(headerActionBoundAttribute, "true");
    const update = () => updateHeaderActionAppearance(button);
    button.addEventListener("mouseenter", () => {
      button.setAttribute("data-axhub-agent-surface-hovered", "true");
      update();
      showActionTooltip(button);
    });
    button.addEventListener("mouseleave", () => {
      button.setAttribute("data-axhub-agent-surface-hovered", "false");
      button.setAttribute("data-axhub-agent-surface-pressed", "false");
      update();
      if (button.getAttribute("data-axhub-agent-surface-focus-visible") !== "true") hideActionTooltip();
    });
    button.addEventListener("focus", () => {
      button.setAttribute("data-axhub-agent-surface-focus-visible", state.keyboardNavigation ? "true" : "false");
      update();
      showActionTooltip(button);
    });
    button.addEventListener("blur", () => {
      button.setAttribute("data-axhub-agent-surface-focus-visible", "false");
      button.setAttribute("data-axhub-agent-surface-pressed", "false");
      update();
      if (button.getAttribute("data-axhub-agent-surface-hovered") !== "true") hideActionTooltip();
    });
    button.addEventListener("pointerdown", () => {
      state.keyboardNavigation = false;
      button.setAttribute("data-axhub-agent-surface-focus-visible", "false");
      button.setAttribute("data-axhub-agent-surface-pressed", "true");
      update();
    });
    ["pointerup", "pointercancel"].forEach((eventName) => button.addEventListener(eventName, () => {
      button.setAttribute("data-axhub-agent-surface-pressed", "false");
      update();
    }));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        button.setAttribute("data-axhub-agent-surface-pressed", "true");
        update();
      }
    });
    button.addEventListener("keyup", () => {
      button.setAttribute("data-axhub-agent-surface-pressed", "false");
      update();
    });
  };

  const ensureHeaderAction = (actions, action, label, title) => {
    let button = actions.querySelector("[" + headerActionAttribute + "=\\\"" + action + "\\\"]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.setAttribute(headerActionAttribute, action);
      actions.appendChild(button);
    }
    button.setAttribute("aria-label", label);
    button.setAttribute("title", title);
    Object.assign(button.style, {
      width: "32px",
      height: "32px",
      border: "0",
      borderRadius: "6px",
      display: "inline-grid",
      placeItems: "center",
      padding: "0",
      color: "#475569",
      background: "transparent",
      cursor: "pointer",
      outline: "none",
      transition: "background 150ms ease, color 150ms ease, box-shadow 150ms ease",
    });
    button.style.setProperty("-webkit-app-region", "no-drag");
    if (button.getAttribute(headerActionIconAttribute) !== action) appendActionIcon(button, action);
    bindHeaderActionFeedback(button);
    updateHeaderActionAppearance(button);
    return button;
  };

  const reconcileHeaderAction = (actions, action, enabled, label) => {
    const button = actions.querySelector("[" + headerActionAttribute + "=\\\"" + action + "\\\"]");
    if (!enabled) {
      button?.remove();
      hideActionTooltip();
      return null;
    }
    return ensureHeaderAction(actions, action, label, label);
  };

  const ensureHeader = () => {
    if (!state.surface) return null;
    const headerHeight = resolveHeaderHeight();
    let header = state.surface.querySelector("[" + headerAttribute + "]");
    if (headerHeight <= 0) {
      header?.remove();
      state.header = null;
      state.headerTitle = null;
      state.tooltip = null;
      state.toast = null;
      state.surface.querySelectorAll("[" + frameAttribute + "]").forEach(setFrameLayout);
      return null;
    }
    if (!header) {
      header = document.createElement("div");
      header.setAttribute(headerAttribute, "header");
      state.surface.prepend(header);
    }
    const collapsedMarker = query(state.profile.sidebarCollapsedSelector);
    const collapsed = Boolean(state.activeEntryId && (collapsedMarker || !state.menuAvailable));
    const isMacOS = document.body.classList.contains("is-mac") || /Mac/i.test(navigator.platform || "");
    const macosCollapsedHeaderLeftInset = isMacOS && collapsed
      ? Math.max(16, Number(state.profile.macosCollapsedHeaderLeftInset ?? 16))
      : 16;
    Object.assign(header.style, {
      position: "absolute",
      inset: "0 0 auto 0",
      height: headerHeight + "px",
      display: "flex",
      alignItems: "center",
      boxSizing: "border-box",
      padding: "0 16px",
      paddingLeft: macosCollapsedHeaderLeftInset + "px",
      overflow: "hidden",
      color: "#111827",
      background: "#fff",
      borderBottom: "1px solid #e5e7eb",
      fontSize: "14px",
      fontWeight: "600",
      lineHeight: "20px",
      userSelect: "none",
      zIndex: "1",
    });
    header.style.setProperty("-webkit-app-region", "drag");
    let leadingActions = header.querySelector("[" + headerLeadingActionsAttribute + "]");
    if (!leadingActions) {
      leadingActions = document.createElement("div");
      leadingActions.setAttribute(headerLeadingActionsAttribute, "leading-actions");
      header.prepend(leadingActions);
    }
    Object.assign(leadingActions.style, {
      flex: "0 0 auto",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      marginRight: "8px",
    });
    leadingActions.style.setProperty("-webkit-app-region", "no-drag");
    const expandControl = query(state.profile.sidebarExpandControlSelector);
    const showExpandAction = collapsed && Boolean(expandControl);
    reconcileHeaderAction(leadingActions, "expand-sidebar", showExpandAction, "展开侧边栏");
    leadingActions.style.display = showExpandAction ? "inline-flex" : "none";
    let headerTitle = header.querySelector("[" + headerTitleAttribute + "]");
    if (!headerTitle) {
      headerTitle = document.createElement("span");
      headerTitle.setAttribute(headerTitleAttribute, "title");
      header.appendChild(headerTitle);
    }
    Object.assign(headerTitle.style, {
      flex: "1 1 auto",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    });
    let actions = header.querySelector("[" + headerActionsAttribute + "]");
    if (!actions) {
      actions = document.createElement("div");
      actions.setAttribute(headerActionsAttribute, "actions");
      header.appendChild(actions);
    }
    if (leadingActions.nextElementSibling !== headerTitle) {
      header.insertBefore(leadingActions, headerTitle);
    }
    if (headerTitle.nextElementSibling !== actions) {
      header.insertBefore(headerTitle, actions);
    }
    Object.assign(actions.style, {
      flex: "0 0 auto",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      marginLeft: "12px",
    });
    actions.style.setProperty("-webkit-app-region", "no-drag");
    const activeEntry = state.entries.find((entry) => entry.id === state.activeEntryId);
    const headerActions = activeEntry?.headerActions ?? { refresh: true, copyUrl: true };
    reconcileHeaderAction(actions, "refresh", headerActions.refresh, "刷新");
    reconcileHeaderAction(actions, "copy", headerActions.copyUrl, "复制地址");
    state.header = header;
    state.headerTitle = headerTitle;
    state.surface.querySelectorAll("[" + frameAttribute + "]").forEach(setFrameLayout);
    if (state.loading) setLoadingPlaceholderLayout(state.loading);
    return header;
  };

  const ensureSurface = () => {
    const surfaceRoot = state.profile.surfaceRootSelector
      ? query(state.profile.surfaceRootSelector)
      : query(state.profile.contentRootSelector);
    if (!surfaceRoot) {
      restoreNativeContent();
      state.surfaceRoot = null;
      return null;
    }
    installLayoutStyles();
    let surface = document.querySelector("[" + surfaceAttribute + "]");
    if (!surface) {
      surface = document.createElement("div");
      surface.setAttribute(surfaceAttribute, "root");
    }
    Object.assign(surface.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      display: state.activeEntryId ? "block" : "none",
      overflow: "hidden",
      background: "#fff",
      zIndex: "2147483000",
    });
    surface.style.setProperty("-webkit-app-region", "no-drag");
    state.surface = surface;
    if (state.surfaceRoot !== surfaceRoot) {
      restoreNativeContent();
      state.surfaceRoot = surfaceRoot;
      state.resizeObserver?.disconnect();
      state.resizeObserver?.observe(surfaceRoot);
    }
    if (surface.parentElement !== surfaceRoot) surfaceRoot.appendChild(surface);
    ensureHeader();
    ensureLoadingPlaceholder();
    return surface;
  };

  const updateBounds = () => {
    if (!state.surface || !state.surfaceRoot) return false;
    const rect = state.surfaceRoot.getBoundingClientRect();
    const requestedTopInset = Number(state.profile.contentTopInset);
    const topInset = Math.min(
      Math.max(0, rect.height),
      Math.max(0, Number.isFinite(requestedTopInset) ? requestedTopInset : 0),
    );
    Object.assign(state.surface.style, {
      left: "0",
      top: topInset + "px",
      width: "100%",
      height: "calc(100% - " + topInset + "px)",
    });
    return rect.width > 0 && rect.height - topInset > 0;
  };

  const ensure = () => {
    const menu = ensureMenu();
    const surface = ensureSurface();
    if (surface) updateBounds();
    if (state.activeEntryId) {
      suppressNativeSelection();
      setActiveButton();
    }
    return Boolean(menu && surface);
  };

  const setActiveButton = () => {
    if (!state.menu) return;
    state.menu.querySelectorAll("[" + entryAttribute + "]").forEach((button) => {
      const active = button.getAttribute(entryAttribute) === state.activeEntryId;
      setButtonSelection(button, active);
    });
  };

  const deactivate = () => {
    const previousEntryId = state.activeEntryId;
    state.activeEntryId = "";
    if (previousEntryId && !state.disposed) scheduleFrameCleanup(previousEntryId);
    if (state.surface) state.surface.style.display = "none";
    if (state.loading) state.loading.style.display = "none";
    setActiveButton();
    restoreNativeSelection();
    restoreNativeContent();
    return { ok: true, code: "surface-hidden" };
  };

  const activate = (entryId) => {
    ensure();
    if (!state.surface || !state.surfaceRoot) return { ok: false, code: "content-root-not-found", message: "The host content root was not found." };
    const entry = state.entries.find((candidate) => candidate.id === entryId);
    if (!entry) return { ok: false, code: "entry-not-found", message: "The entry is not installed." };
    const expandControl = query(state.profile.sidebarExpandControlSelector);
    const recoverableWithoutMenu = Boolean(!state.menu && expandControl && state.surface);
    if (!state.menu && !recoverableWithoutMenu) {
      return { ok: false, code: "sidebar-slot-not-found", message: "The host sidebar slot was not found." };
    }
    const previousEntryId = state.activeEntryId;
    cancelFrameCleanup(entry.id);
    if (previousEntryId && previousEntryId !== entry.id) scheduleFrameCleanup(previousEntryId);
    let frame = Array.from(state.surface.querySelectorAll("[" + frameAttribute + "]"))
      .find((node) => node.getAttribute(frameAttribute) === entry.id) || null;
    const created = !frame;
    if (!frame) {
      frame = document.createElement("iframe");
      frame.setAttribute(frameAttribute, entry.id);
      frame.setAttribute("sandbox", frameSandbox);
      frame.setAttribute("allow", frameAllow);
      frame.setAttribute("title", entry.name);
      bindFrameLoading(frame, entry.id, true);
      frame.src = getActiveUrl(entry);
      frame.style.display = "none";
      setFrameLayout(frame);
      state.surface.appendChild(frame);
    }
    if (!created) bindFrameLoading(frame, entry.id, false);
    setFrameLayout(frame);
    state.activeEntryId = entry.id;
    ensureHeader();
    const headerTitle = state.headerTitle;
    if (headerTitle) headerTitle.textContent = entry.name;
    state.surface.querySelectorAll("[" + frameAttribute + "]").forEach((candidate) => {
      candidate.style.display = candidate === frame ? "block" : "none";
    });
    suppressNativeSelection();
    hideNativeContent();
    state.surface.style.display = "block";
    updateBounds();
    syncLoadingPlaceholder();
    setActiveButton();
    return { ok: true, code: "surface-activated", entryId: entry.id };
  };

  const reloadActiveFrame = () => {
    const entry = state.entries.find((candidate) => candidate.id === state.activeEntryId);
    const frame = entry ? findFrame(entry.id) : null;
    if (!entry || !frame) {
      showToast("当前没有可刷新的页面", "toast-info");
      return;
    }
    const activeUrl = getActiveUrl(entry);
    frame.setAttribute(frameLoadedAttribute, "false");
    syncLoadingPlaceholder();
    frame.src = activeUrl;
    showToast("已刷新当前页面", "toast-success");
  };

  const copyActiveUrl = async () => {
    const entry = state.entries.find((candidate) => candidate.id === state.activeEntryId);
    const activeUrl = entry ? getActiveUrl(entry) : "";
    if (!activeUrl) {
      showToast("当前没有可复制的链接", "toast-info");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard?.writeText(activeUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = activeUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy-failed");
      }
      showToast("链接已复制", "toast-success");
    } catch {
      showToast("复制链接失败", "toast-error");
    }
  };

  const handleMessage = (event) => {
    const data = event.data;
    if (!data || typeof data !== "object" || data.type !== navigationMessageType) return;
    const entry = state.entries.find((candidate) => candidate.id === state.activeEntryId);
    if (!entry || data.entryId !== entry.id || typeof data.url !== "string") return;
    const frame = findFrame(entry.id);
    if (!frame || event.source !== frame.contentWindow) return;
    const initialOrigin = getInitialOrigin(entry);
    if (!initialOrigin || event.origin !== initialOrigin) return;
    let parsed;
    try { parsed = new URL(data.url); } catch { return; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    if (parsed.origin !== initialOrigin) return;
    state.activeUrls.set(entry.id, parsed.href);
  };

  const status = () => {
    ensure();
    if (!state.surface || !state.surfaceRoot) return { ok: false, code: "content-root-not-found", message: "The host content root was not found." };
    const expandControl = query(state.profile.sidebarExpandControlSelector);
    const recoverableWithoutMenu = Boolean(state.surface && expandControl);
    if (!state.menu && !recoverableWithoutMenu) {
      return { ok: false, code: "sidebar-slot-not-found", message: "The host sidebar slot was not found." };
    }
    return { ok: true, code: "injected", entryId: state.activeEntryId || undefined };
  };

  const update = (entries, profile) => {
    const previousUrls = state.activeUrls;
    state.entries = entries;
    state.profile = profile;
    state.activeUrls = new Map(entries.map((entry) => [entry.id, previousUrls.get(entry.id) || entry.url]));
    ensure();
    if (state.activeEntryId && state.entries.some((entry) => entry.id === state.activeEntryId)) activate(state.activeEntryId);
    else if (state.activeEntryId) deactivate();
    return status();
  };

  const scheduleEnsure = () => {
    if (state.disposed || state.scheduled) return;
    state.scheduled = true;
    const run = () => {
      state.scheduled = false;
      if (state.disposed) return;
      ensure();
      if (state.activeEntryId && state.surface) {
        state.surface.style.display = "block";
        updateBounds();
      }
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  };

  const schedulePostClickEnsure = () => {
    scheduleEnsure();
    postClickReconcileDelays.forEach((delayMs) => setTimeout(scheduleEnsure, delayMs));
  };

  const expandHostSidebar = () => {
    const expandControl = query(state.profile.sidebarExpandControlSelector);
    if (!expandControl || typeof expandControl.click !== "function") {
      showToast("无法展开侧边栏", "toast-error");
      return;
    }
    try {
      expandControl.click();
      schedulePostClickEnsure();
    } catch {
      showToast("无法展开侧边栏", "toast-error");
    }
  };

  const handleClick = (event) => {
    const target = event.target;
    const headerAction = closest(target, "[" + headerActionAttribute + "]");
    if (headerAction) {
      event.preventDefault();
      event.stopPropagation();
      const action = headerAction.getAttribute(headerActionAttribute);
      if (action === "expand-sidebar") expandHostSidebar();
      else if (action === "refresh") reloadActiveFrame();
      else if (action === "copy") void copyActiveUrl();
      return;
    }
    const entryButton = closest(target, "[" + entryAttribute + "]");
    if (entryButton) {
      event.preventDefault();
      event.stopPropagation();
      activate(entryButton.getAttribute(entryAttribute));
      return;
    }
    if (closest(target, state.profile.nativeNavigationSelector)) deactivate();
    if (state.activeEntryId) schedulePostClickEnsure();
  };

  const noteKeyboardNavigation = (event) => {
    if (event.key === "Tab") state.keyboardNavigation = true;
  };

  const notePointerInteraction = () => {
    state.keyboardNavigation = false;
  };

  const dispose = () => {
    state.disposed = true;
    state.frameCleanupTimers.forEach((timer) => clearTimeout(timer));
    state.frameCleanupTimers.clear();
    state.resizeObserver?.disconnect();
    state.mutationObserver?.disconnect();
    if (state.tooltipTimer) clearTimeout(state.tooltipTimer);
    if (state.toastTimer) clearTimeout(state.toastTimer);
    window.removeEventListener("resize", scheduleEnsure);
    window.removeEventListener("message", handleMessage);
    document.removeEventListener("keydown", noteKeyboardNavigation, true);
    document.removeEventListener("pointerdown", notePointerInteraction, true);
    document.removeEventListener("click", handleClick, true);
    deactivate();
  };

  if (observeResize && typeof ResizeObserver === "function") {
    state.resizeObserver = new ResizeObserver(scheduleEnsure);
  }
  if (observeMutations) {
    state.mutationObserver = new MutationObserver(scheduleEnsure);
    state.mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.addEventListener("resize", scheduleEnsure);
  window.addEventListener("message", handleMessage);
  document.addEventListener("keydown", noteKeyboardNavigation, true);
  document.addEventListener("pointerdown", notePointerInteraction, true);
  document.addEventListener("click", handleClick, true);

  window[runtimeKey] = { version: runtimeVersion, activate, deactivate, status, update, dispose };
  return status();
})()`;
}
//# sourceMappingURL=frame-runtime.js.map