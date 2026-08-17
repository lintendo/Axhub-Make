import { spawn } from "node:child_process";
export function startCommand(command, { platform = process.platform, cwd, spawnImpl = spawn, env = process.env, } = {}) {
    const child = spawnImpl(command.executable, command.args, {
        cwd: command.cwd ?? cwd,
        env,
        shell: false,
        detached: true,
        stdio: "ignore",
        windowsHide: platform === "win32",
    });
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
    child.unref();
    return { child, pid: child.pid, spawned, exited };
}
//# sourceMappingURL=start-command.js.map