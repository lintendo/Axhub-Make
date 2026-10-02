import { spawn, spawnSync } from "node:child_process";
function trackStartedCommand(child, unref) {
    const spawned = new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
    });
    // Callers that only need fire-and-forget semantics must not create an
    // unhandled rejection; callers that await the original promise still see it.
    void spawned.catch(() => undefined);
    const exited = new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };
        child.once("error", (error) => finish({ code: null, signal: null, error }));
        child.once("close", (code, signal) => finish({ code, signal }));
    });
    if (unref)
        child.unref();
    return { child, pid: child.pid, spawned, exited };
}
export function startCommand(command, { platform = process.platform, cwd, spawnImpl = spawn, env = process.env, } = {}) {
    const child = spawnImpl(command.executable, command.args, {
        cwd: command.cwd ?? cwd,
        env,
        shell: false,
        detached: true,
        stdio: "ignore",
        windowsHide: platform === "win32",
    });
    return trackStartedCommand(child, true);
}
export function startPipeCommand(command, { platform = process.platform, cwd, spawnImpl = spawn, env = process.env, } = {}) {
    const child = spawnImpl(command.executable, command.args, {
        cwd: command.cwd ?? cwd,
        env,
        shell: false,
        detached: false,
        stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
        windowsHide: platform === "win32",
    });
    return trackStartedCommand(child, false);
}
export function terminateStartedCommand(started, { platform = process.platform, spawnSyncImpl = spawnSync, } = {}) {
    if (platform === "win32" && started.pid) {
        const result = spawnSyncImpl("taskkill.exe", ["/PID", String(started.pid), "/T", "/F"], {
            shell: false,
            windowsHide: true,
            stdio: "ignore",
        });
        if (!result.error && result.status === 0)
            return;
    }
    try {
        started.child.kill("SIGTERM");
    }
    catch {
        // The detached launcher may already have exited.
    }
}
//# sourceMappingURL=start-command.js.map