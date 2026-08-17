import { CdpSession } from "../cdp/session.js";
import { listTargets } from "../cdp/targets.js";
import { readQoderWorkDevToolsActivePort } from "../hosts/qoderwork/index.js";
const TARGET_ATTEMPTS = 50;
const TARGET_INTERVAL_MS = 150;
function isQoderWorkRenderer(target) {
    return target.title?.toLowerCase() === "qoderwork"
        && target.url.startsWith("file://")
        && target.url.includes("/out/renderer/index.html");
}
export function buildQoderWorkRecentFolderSeedExpression(targetPath) {
    const encodedPath = JSON.stringify(targetPath);
    return `(() => {
    const targetPath = ${encodedPath};
    let recent = [];
    try {
      const stored = JSON.parse(localStorage.getItem("recent-work-folders") || "[]");
      if (Array.isArray(stored)) recent = stored.filter((item) => typeof item === "string");
    } catch {}
    localStorage.setItem("recent-work-folders", JSON.stringify([
      targetPath,
      ...recent.filter((item) => item !== targetPath),
    ].slice(0, 10)));
    setTimeout(() => location.reload(), 0);
    return { ok: true, code: "project-directory-seeded" };
  })()`;
}
export function buildQoderWorkFolderSelectExpression(targetPath) {
    const encodedPath = JSON.stringify(targetPath);
    return `(() => {
    const targetPath = ${encodedPath};
    const displayPath = targetPath.replace(/^\\/Users\\/[^/]+/, "~");
    const buttons = () => Array.from(document.querySelectorAll("button,[role=button]"));
    const selected = () => buttons().find((element) => element.getAttribute("aria-label") === targetPath);
    if (selected()) return { ok: true, code: "project-directory-selected" };

    const trigger = buttons().find((element) => {
      if (element.getAttribute("aria-haspopup") !== "menu") return false;
      const label = (element.getAttribute("aria-label") || "") + " " + (element.textContent || "");
      return /work.*folder|folder.*work|工作目录/iu.test(label);
    });
    if (!trigger) return { ok: false, code: "work-folder-trigger-not-found" };
    if (trigger.getAttribute("data-state") !== "open") trigger.click();

    const invokeReactClick = (element) => {
      const key = Object.keys(element).find((candidate) => candidate.startsWith("__reactProps$"));
      const handler = key ? element[key]?.onClick : undefined;
      if (typeof handler !== "function") {
        element.click();
        return;
      }
      handler({
        currentTarget: element,
        target: element,
        pointerType: "mouse",
        button: 0,
        ctrlKey: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        nativeEvent: {},
      });
    };

    const recentSubmenu = Array.from(document.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]'))[0];
    if (!recentSubmenu) return { ok: false, code: "recent-folders-menu-not-found" };
    if (recentSubmenu.getAttribute("data-state") !== "open") invokeReactClick(recentSubmenu);

    const targetItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((element) => (element.textContent || "").trim() === displayPath);
    if (!targetItem) return { ok: false, code: "recent-project-directory-not-found" };
    invokeReactClick(targetItem);
    return selected()
      ? { ok: true, code: "project-directory-selected" }
      : { ok: false, code: "project-directory-selection-pending" };
  })()`;
}
async function evaluate(target, expression, options) {
    const session = new CdpSession(target.webSocketDebuggerUrl, {
        WebSocketImpl: options.WebSocketImpl,
        commandTimeoutMs: 15_000,
    });
    await session.connect();
    try {
        await session.command("Runtime.enable", {});
        const response = await session.command("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        return response.result?.value;
    }
    finally {
        session.close();
    }
}
async function openFolderMenu(target, options) {
    const session = new CdpSession(target.webSocketDebuggerUrl, {
        WebSocketImpl: options.WebSocketImpl,
        commandTimeoutMs: 15_000,
    });
    const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    await session.connect();
    try {
        await session.command("Runtime.enable", {});
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const response = await session.command("Runtime.evaluate", {
                expression: `(() => {
          const targetPath = ${JSON.stringify(options.targetPath)};
          const buttons = Array.from(document.querySelectorAll("button,[role=button]"));
          if (buttons.some((element) => element.getAttribute("aria-label") === targetPath)) {
            return { selected: true };
          }
          const trigger = buttons.find((element) => {
            if (element.getAttribute("aria-haspopup") !== "menu") return false;
            const label = (element.getAttribute("aria-label") || "") + " " + (element.textContent || "");
            return /work.*folder|folder.*work|工作目录/iu.test(label);
          });
          if (!trigger) return null;
          const rect = trigger.getBoundingClientRect();
          return { selected: false, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`,
                returnByValue: true,
            });
            const value = response.result?.value;
            if (value?.selected)
                return;
            if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) {
                const x = value.x;
                const y = value.y;
                await session.command("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
                await session.command("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
                return;
            }
            await delay(100);
        }
    }
    finally {
        session.close();
    }
    throw new Error("QoderWork work-folder trigger did not become available.");
}
async function waitForRenderer(options, dependencies) {
    const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    for (let attempt = 0; attempt < TARGET_ATTEMPTS; attempt += 1) {
        const port = dependencies.readActivePort(options.platform, options.appPath);
        if (port) {
            try {
                const targets = await dependencies.listTargetsImpl(port, { fetchImpl: options.fetchImpl });
                const target = targets.find(isQoderWorkRenderer);
                if (target)
                    return target;
            }
            catch {
                // QoderWork may still be replacing its DevToolsActivePort endpoint during startup or reload.
            }
        }
        await delay(TARGET_INTERVAL_MS);
    }
    throw new Error("QoderWork did not expose a compatible renderer through DevToolsActivePort.");
}
export async function synchronizeQoderWorkProject(options, dependencies = {}) {
    const resolvedDependencies = {
        readActivePort: dependencies.readActivePort ?? readQoderWorkDevToolsActivePort,
        listTargetsImpl: dependencies.listTargetsImpl ?? listTargets,
    };
    const evaluateImpl = dependencies.evaluateImpl ?? evaluate;
    const openFolderMenuImpl = dependencies.openFolderMenuImpl ?? openFolderMenu;
    const initialTarget = await waitForRenderer(options, resolvedDependencies);
    await evaluateImpl(initialTarget, buildQoderWorkRecentFolderSeedExpression(options.targetPath), options);
    await (options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(400);
    const reloadedTarget = await waitForRenderer(options, resolvedDependencies);
    await openFolderMenuImpl(reloadedTarget, options);
    const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    let lastCode = "unknown-selection-error";
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const result = await evaluateImpl(reloadedTarget, buildQoderWorkFolderSelectExpression(options.targetPath), options);
        if (result && typeof result === "object" && result.ok === true)
            return;
        if (result && typeof result === "object" && typeof result.code === "string") {
            lastCode = result.code;
        }
        await delay(100);
    }
    throw new Error(`QoderWork could not select the requested project directory (${lastCode}).`);
}
//# sourceMappingURL=qoderwork.js.map