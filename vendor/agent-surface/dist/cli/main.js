#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { doctor } from "../runtime/doctor.js";
import { injectEntries } from "../runtime/inject-entries.js";
import { openEntry } from "../runtime/open-entry.js";
const HOSTS = new Set(["codex", "cursor", "workbuddy", "traework", "qoderwork", "trae"]);
function parseArgs(argv) {
    const parsed = { json: false, help: false };
    const [command, ...rest] = argv;
    if (command === "open" || command === "inject" || command === "doctor")
        parsed.command = command;
    else if (command === "--help" || command === "-h" || command === undefined)
        parsed.help = true;
    else
        throw new Error(`Unknown command: ${command}`);
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (token === "--json")
            parsed.json = true;
        else if (token === "--help" || token === "-h")
            parsed.help = true;
        else if (token === "--host") {
            const value = rest[++index];
            if (!value || !HOSTS.has(value))
                throw new Error("--host must be codex, cursor, workbuddy, traework, qoderwork, or trae");
            parsed.host = value;
        }
        else if (token === "--entry")
            parsed.entry = rest[++index];
        else if (token === "--config")
            parsed.configPath = rest[++index];
        else if (token === "--app-path")
            parsed.appPath = rest[++index];
        else
            throw new Error(`Unknown option: ${token}`);
    }
    return parsed;
}
function helpText() {
    return `Agent Surface - one-shot CDP launcher

Usage:
  agent-surface open --host <host> --entry <id> --config <file> [--app-path <path>] [--json]
  agent-surface inject --host <host> --config <file> [--app-path <path>] [--json]
  agent-surface doctor [--host <host>] [--config <file>] [--app-path <path>] [--json]

The command exits after readiness, iframe injection, and activation. It does not install a daemon.`;
}
async function loadConfig(path, readFileImpl) {
    const absolutePath = resolve(path);
    const raw = await readFileImpl(absolutePath, "utf8");
    return { config: JSON.parse(raw), configDir: dirname(absolutePath) };
}
function applyAppPath(config, host, appPath) {
    if (!config || !appPath)
        return config;
    return { ...config, hosts: { ...config.hosts, [host]: { ...config.hosts?.[host], appPath } } };
}
export async function runCli(argv, dependencies = {}) {
    const stdout = dependencies.stdout ?? ((message) => process.stdout.write(`${message}\n`));
    const stderr = dependencies.stderr ?? ((message) => process.stderr.write(`${message}\n`));
    try {
        const args = parseArgs(argv);
        if (args.help) {
            stdout(helpText());
            return 0;
        }
        if (!args.command)
            throw new Error("A command is required");
        if (args.command !== "doctor" && !args.host)
            throw new Error("--host is required");
        if ((args.command === "open" || args.command === "inject") && !args.configPath)
            throw new Error("--config is required");
        if (args.command === "open" && !args.entry)
            throw new Error("--entry is required");
        if (args.appPath && !args.host)
            throw new Error("--app-path requires --host");
        const loaded = args.configPath ? await loadConfig(args.configPath, dependencies.readFileImpl ?? readFile) : undefined;
        const hosts = args.host ? [args.host] : [...HOSTS];
        const config = args.host ? applyAppPath(loaded?.config, args.host, args.appPath) : loaded?.config;
        let result;
        if (args.command === "open") {
            result = await (dependencies.openEntryImpl ?? openEntry)({
                host: args.host, entryId: args.entry, config: config, configDir: loaded?.configDir,
            });
        }
        else if (args.command === "inject") {
            result = await (dependencies.injectEntriesImpl ?? injectEntries)({
                host: args.host, config: config, configDir: loaded?.configDir,
            });
        }
        else {
            result = await (dependencies.doctorImpl ?? doctor)({
                hosts,
                config,
                ...(args.host && args.appPath ? { hostConfigs: { [args.host]: { appPath: resolve(args.appPath) } } } : {}),
            });
        }
        if (args.json)
            stdout(JSON.stringify(result, null, 2));
        else if ("hosts" in result)
            result.hosts.forEach((report) => stdout(`${report.host}: ${report.status} - ${report.message}`));
        else
            stdout(result.message);
        return result.ok ? 0 : 1;
    }
    catch (error) {
        stderr(error instanceof Error ? error.message : String(error));
        return 1;
    }
}
let invokedPath = "";
if (process.argv[1]) {
    try {
        invokedPath = pathToFileURL(realpathSync(resolve(process.argv[1]))).href;
    }
    catch {
        invokedPath = pathToFileURL(resolve(process.argv[1])).href;
    }
}
if (import.meta.url === invokedPath) {
    runCli(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
//# sourceMappingURL=main.js.map