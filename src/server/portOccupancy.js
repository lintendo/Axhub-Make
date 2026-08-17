import { spawnSync } from 'node:child_process';
function parsePidList(output) {
    const seen = new Set();
    for (const line of output.split(/\r?\n/u)) {
        const pid = Number(line.trim());
        if (Number.isInteger(pid) && pid > 0) {
            seen.add(pid);
        }
    }
    return Array.from(seen);
}
export function findListeningPidsOnPort(port, options = {}) {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        return [];
    }
    const platform = options.platform || process.platform;
    const run = options.spawnSync || spawnSync;
    if (platform === 'win32') {
        const result = run('powershell.exe', [
            '-NoProfile',
            '-Command',
            `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
        ], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 2000,
        });
        return parsePidList(String(result.stdout || ''));
    }
    const result = run('lsof', [
        '-nP',
        `-tiTCP:${port}`,
        '-sTCP:LISTEN',
    ], {
        encoding: 'utf8',
        timeout: 2000,
    });
    return parsePidList(String(result.stdout || ''));
}
function waitForPortRelease(port, options) {
    const deadline = Date.now() + Math.max(0, options.waitMs ?? 1500);
    while (Date.now() < deadline) {
        if (findListeningPidsOnPort(port, options).length === 0) {
            return;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
}
function findProcessGroupId(pid, options) {
    const run = options.spawnSync || spawnSync;
    const result = run('ps', ['-o', 'pgid=', '-p', String(pid)], {
        encoding: 'utf8',
        timeout: 2000,
    });
    const pgid = Number(String(result.stdout || '').trim());
    return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
}
function resolvePosixKillTargets(pids, options) {
    const currentPid = options.currentPid ?? process.pid;
    const currentPgid = findProcessGroupId(currentPid, options);
    const targets = new Set();
    for (const pid of pids) {
        const pgid = findProcessGroupId(pid, options);
        if (pgid && pgid !== currentPgid) {
            targets.add(-pgid);
        }
        else {
            targets.add(pid);
        }
    }
    return Array.from(targets);
}
function signalTargets(targets, signal, killPid) {
    for (const target of targets) {
        try {
            killPid(target, signal);
        }
        catch {
            // Process may have exited between lookup and signal.
        }
    }
}
export function releaseListeningProcessesOnPort(port, options = {}) {
    const currentPid = options.currentPid ?? process.pid;
    const pids = findListeningPidsOnPort(port, options).filter((pid) => pid !== currentPid);
    if (pids.length === 0) {
        return [];
    }
    if ((options.platform || process.platform) === 'win32') {
        const run = options.spawnSync || spawnSync;
        for (const pid of pids) {
            run('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 5000,
            });
        }
    }
    else {
        const killPid = options.killPid || process.kill.bind(process);
        const targets = resolvePosixKillTargets(pids, options);
        signalTargets(targets, 'SIGTERM', killPid);
        waitForPortRelease(port, options);
        const remainingTargets = resolvePosixKillTargets(findListeningPidsOnPort(port, options).filter((pid) => pid !== currentPid), options);
        signalTargets(remainingTargets, 'SIGKILL', killPid);
        waitForPortRelease(port, options);
    }
    return pids;
}
