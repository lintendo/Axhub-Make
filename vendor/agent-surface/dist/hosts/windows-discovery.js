import { existsSync as nodeExistsSync } from "node:fs";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import path from "node:path";
const COMMAND_TIMEOUT_MS = 2_000;
const POWERSHELL_COMMAND_TIMEOUT_MS = 10_000;
const APP_PATHS_REGISTRY_ROOTS = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths",
];
const UNINSTALL_REGISTRY_PATHS = [
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
];
function toText(value) {
    if (!value)
        return "";
    if (Buffer.isBuffer(value))
        return value.toString("utf8");
    if (value instanceof Uint8Array)
        return Buffer.from(value).toString("utf8");
    return String(value);
}
function unique(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const normalized = value.trim();
        if (!normalized)
            continue;
        const key = normalized.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}
function expandWindowsEnvironment(value, env) {
    return value.replace(/%([^%]+)%/gu, (match, name) => env[name] ?? match);
}
function normalizeCandidate(value, env) {
    const withoutIconIndex = value.trim().replace(/,\s*\d+$/u, "");
    return expandWindowsEnvironment(withoutIconIndex.replace(/^"|"$/gu, ""), env);
}
function executableName(value) {
    return path.win32.basename(value).replace(/,\s*\d+$/u, "").trim();
}
function isExpectedExecutable(value, executableNames) {
    const basename = executableName(value).toLowerCase();
    return executableNames.some((name) => executableName(name).toLowerCase() === basename);
}
function existingCandidates(values, env, existsSync, executableNames) {
    return unique(values)
        .map((value) => normalizeCandidate(value, env))
        .filter((value) => (!executableNames || isExpectedExecutable(value, executableNames)) && existsSync(value));
}
function bestCandidatePerExecutable(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const name = executableName(value).toLowerCase();
        if (seen.has(name))
            continue;
        seen.add(name);
        result.push(value);
    }
    return result;
}
function runProbe(spawnSync, command, args, timeout = COMMAND_TIMEOUT_MS) {
    try {
        const result = spawnSync(command, args, {
            encoding: "utf8",
            timeout,
            windowsHide: true,
        });
        if (result.error || result.status !== 0)
            return "";
        return toText(result.stdout);
    }
    catch {
        return "";
    }
}
function outputLines(output) {
    return output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}
function powershellQuote(value) {
    return `'${value.replace(/'/gu, "''")}'`;
}
function appPathsCandidates(executableNames, spawnSync, env) {
    const results = [];
    for (const executable of executableNames) {
        for (const root of APP_PATHS_REGISTRY_ROOTS) {
            const output = runProbe(spawnSync, "reg", ["query", `${root}\\${executable}`, "/ve"]);
            const line = outputLines(output).find((candidate) => /REG_(?:SZ|EXPAND_SZ)/iu.test(candidate));
            const value = line?.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)$/iu)?.[1];
            if (value)
                results.push(normalizeCandidate(value, env));
        }
    }
    return results;
}
function appxCandidates(packages, spawnSync, env) {
    const results = [];
    for (const packageInfo of packages) {
        const command = `(Get-AppxPackage -Name ${powershellQuote(packageInfo.packageName)} -ErrorAction SilentlyContinue).InstallLocation`;
        const output = runProbe(spawnSync, "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], POWERSHELL_COMMAND_TIMEOUT_MS);
        for (const location of outputLines(output)) {
            for (const relativePath of packageInfo.relativeExecutablePaths) {
                results.push(normalizeCandidate(path.win32.join(location, relativePath), env));
            }
        }
    }
    return results;
}
function uninstallProbeCommand(executableNames) {
    const names = executableNames.map(powershellQuote).join(",");
    const roots = UNINSTALL_REGISTRY_PATHS.map(powershellQuote).join(",");
    return [
        `$names=@(${names});$roots=@(${roots})`,
        "function Candidate([object]$candidate,[object]$displayVersion){",
        "if(-not $candidate){return};$value=[Environment]::ExpandEnvironmentVariables([string]$candidate)",
        "$value=$value -replace ',\\s*\\d+$',''",
        "$value=$value.Trim('\"')",
        "if($names -notcontains [IO.Path]::GetFileName($value) -or -not (Test-Path -LiteralPath $value -PathType Leaf)){return}",
        "$item=Get-Item -LiteralPath $value",
        "try{$version=[version]([string]$displayVersion)}catch{$version=$item.VersionInfo.FileVersionRaw}",
        "[pscustomobject]@{Path=$value;Version=$version;Updated=$item.LastWriteTimeUtc}",
        "}",
        "$found=@(Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue | ForEach-Object {",
        "Candidate $_.DisplayIcon $_.DisplayVersion",
        "if($_.InstallLocation){foreach($name in $names){Candidate (Join-Path $_.InstallLocation $name) $_.DisplayVersion}}",
        "})",
        "$found | Sort-Object @{Expression={$_.Version};Descending=$true},@{Expression={$_.Updated};Descending=$true} | Select-Object -ExpandProperty Path -Unique",
    ].join(";");
}
function uninstallCandidates(executableNames, spawnSync, env) {
    const output = runProbe(spawnSync, "powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        uninstallProbeCommand(executableNames),
    ], POWERSHELL_COMMAND_TIMEOUT_MS);
    return outputLines(output).map((value) => normalizeCandidate(value, env));
}
function pathCandidates(executableNames, spawnSync, env) {
    const results = [];
    for (const executable of executableNames) {
        results.push(...outputLines(runProbe(spawnSync, "where", [executable])).map((value) => normalizeCandidate(value, env)));
    }
    return results;
}
function runningProcessCandidates(executableNames, spawnSync, env) {
    const results = [];
    for (const executable of executableNames) {
        const command = `Get-CimInstance Win32_Process -Filter \"Name = ${powershellQuote(executable)}\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ExecutablePath`;
        results.push(...outputLines(runProbe(spawnSync, "powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command,
        ], POWERSHELL_COMMAND_TIMEOUT_MS)).map((value) => normalizeCandidate(value, env)));
    }
    return results;
}
export function discoverWindowsApplicationPaths({ knownCandidates, executableNames = [], appxPackages = [], env = process.env, existsSync = nodeExistsSync, spawnSync = nodeSpawnSync, }) {
    const known = unique(knownCandidates.map((value) => normalizeCandidate(value, env)));
    const names = unique([
        ...executableNames,
        ...knownCandidates.map(executableName),
    ]).filter((value) => /\.exe$/iu.test(value));
    const installedKnown = existingCandidates(known, env, existsSync, names);
    if (names.length === 0)
        return installedKnown;
    const probes = [
        () => appPathsCandidates(names, spawnSync, env),
        () => appxCandidates(appxPackages, spawnSync, env),
        () => uninstallCandidates(names, spawnSync, env),
        () => pathCandidates(names, spawnSync, env),
        () => runningProcessCandidates(names, spawnSync, env),
    ];
    for (const probe of probes) {
        const installed = existingCandidates(probe(), env, existsSync, names);
        if (installed.length > 0)
            return bestCandidatePerExecutable(installed);
    }
    return bestCandidatePerExecutable(installedKnown);
}
//# sourceMappingURL=windows-discovery.js.map