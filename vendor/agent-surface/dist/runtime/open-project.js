import { startCommand } from "../core/start-command.js";
import { getProjectOpenSupport, projectOpenUnsupportedMessage } from "../project/capabilities.js";
import { buildProjectOpenCommands } from "../project/providers.js";
import { synchronizeQoderWorkProject } from "../project/qoderwork.js";
const COMMAND_ACCEPTANCE_WINDOW_MS = 100;
function failure(options, code, message) {
    return {
        ok: false,
        code,
        message,
        provider: options.provider,
        targetPath: options.targetPath,
        ...(options.appPath ? { appPath: options.appPath } : {}),
    };
}
export function validateProjectOpenOptions(options) {
    if (getProjectOpenSupport(options.provider) === "unsupported") {
        return failure(options, "project-open-unsupported", projectOpenUnsupportedMessage(options.provider));
    }
    const platform = options.platform ?? process.platform;
    if (platform !== "darwin" && platform !== "win32") {
        return failure(options, "unsupported-platform", `Project opening does not support ${platform}.`);
    }
    try {
        buildProjectOpenCommands({ ...options, platform });
        return null;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return failure(options, /appPath.*required/iu.test(message) ? "app-path-required" : "invalid-project-options", message);
    }
}
export async function openProject(options, dependencies = {}) {
    const platform = options.platform ?? process.platform;
    const validation = validateProjectOpenOptions(options);
    if (validation)
        return validation;
    const commands = buildProjectOpenCommands({ ...options, platform });
    try {
        const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
        let command = "";
        for (const [index, spec] of commands.entries()) {
            const started = startCommand(spec, {
                platform,
                cwd: options.targetPath,
                spawnImpl: options.spawnImpl,
            });
            await started.spawned;
            const waitForExit = platform === "darwin"
                && (spec.executable === "open" || options.provider === "cursor" || (options.provider === "codex" && !spec.url));
            const acceptance = waitForExit
                ? { kind: "exit", exit: await started.exited }
                : await Promise.race([
                    started.exited.then((exit) => ({ kind: "exit", exit })),
                    delay(COMMAND_ACCEPTANCE_WINDOW_MS).then(() => ({ kind: "accepted" })),
                ]);
            if (acceptance.kind === "exit") {
                const { error, code, signal } = acceptance.exit;
                if (error)
                    throw error;
                if (signal)
                    throw new Error(`The ${options.provider} launcher exited with signal ${signal}.`);
                if (code !== null && code !== 0) {
                    throw new Error(`The ${options.provider} launcher exited with code ${code}.`);
                }
            }
            command = [spec.executable, ...spec.args].join(" ");
            if (index + 1 < commands.length)
                await delay(250);
        }
        if (options.provider === "qoderwork") {
            await (dependencies.synchronizeQoderWorkProjectImpl ?? synchronizeQoderWorkProject)({
                targetPath: options.targetPath,
                appPath: options.appPath,
                platform,
                delay,
            });
        }
        return {
            ok: true,
            code: "project-opened",
            message: `Opened ${options.provider} project at ${options.targetPath}.`,
            provider: options.provider,
            targetPath: options.targetPath,
            ...(options.appPath ? { appPath: options.appPath } : {}),
            command,
            ...(commands[commands.length - 1]?.url ? { url: commands[commands.length - 1].url } : {}),
        };
    }
    catch (error) {
        return failure(options, "project-open-failed", error instanceof Error ? error.message : String(error));
    }
}
//# sourceMappingURL=open-project.js.map