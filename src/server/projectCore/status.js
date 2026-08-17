import fs from 'node:fs';
import path from 'node:path';
import { getAdminServerInfoPath, getRuntimeServerInfoPath, resolveProjectRoot, } from './paths.ts';
function getEffectiveServerInfoPath(projectRoot, role, options = {}) {
    return role === 'runtime'
        ? getRuntimeServerInfoPath(projectRoot)
        : getAdminServerInfoPath(projectRoot, options);
}
function normalizeServerInfo(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const value = data;
    if (typeof value.pid !== 'number' ||
        typeof value.port !== 'number' ||
        typeof value.host !== 'string' ||
        typeof value.origin !== 'string' ||
        typeof value.projectRoot !== 'string' ||
        typeof value.startedAt !== 'string') {
        return null;
    }
    return {
        pid: value.pid,
        port: value.port,
        host: value.host,
        origin: value.origin,
        projectRoot: resolveProjectRoot(value.projectRoot),
        startedAt: value.startedAt,
        ...(typeof value.timestamp === 'string' ? { timestamp: value.timestamp } : {}),
    };
}
export function resolveComparableProjectRoot(projectRoot) {
    const resolved = resolveProjectRoot(projectRoot);
    try {
        return fs.realpathSync.native(resolved);
    }
    catch {
        return resolved;
    }
}
export function getServerInfoFilePath(projectRoot, role, options = {}) {
    return getEffectiveServerInfoPath(projectRoot, role, options);
}
export { getAdminServerInfoPath, getGlobalAdminServerInfoPath, getRuntimeServerInfoPath } from './paths.ts';
export function readServerInfo(projectRoot, role, options = {}) {
    const infoPath = getEffectiveServerInfoPath(projectRoot, role, options);
    if (!fs.existsSync(infoPath)) {
        return null;
    }
    try {
        return normalizeServerInfo(JSON.parse(fs.readFileSync(infoPath, 'utf8')));
    }
    catch {
        return null;
    }
}
export function writeServerInfo(projectRoot, role, info, options = {}) {
    const timestamp = role === 'runtime'
        ? String(info.timestamp || new Date().toISOString())
        : info.timestamp;
    const normalized = {
        ...info,
        projectRoot: resolveProjectRoot(info.projectRoot),
        ...(timestamp ? { timestamp } : {}),
    };
    const infoPath = getEffectiveServerInfoPath(projectRoot, role, options);
    fs.mkdirSync(path.dirname(infoPath), { recursive: true });
    fs.writeFileSync(infoPath, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
}
export function isHealthyServerInfo(info, expectedProjectRoot) {
    if (!info) {
        return false;
    }
    return resolveComparableProjectRoot(info.projectRoot) === resolveComparableProjectRoot(expectedProjectRoot);
}
export function isProcessAlive(pid, probeProcess = process.kill) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        probeProcess(pid, 0);
        return true;
    }
    catch (error) {
        return String(error?.code || '') === 'EPERM';
    }
}
export function isLiveLocalServerInfo(info, expectedProjectRoot, options = {}) {
    if (!isHealthyServerInfo(info, expectedProjectRoot) || !isProcessAlive(info.pid, options.probeProcess)) {
        return false;
    }
    if (typeof options.maxAgeMs !== 'number') {
        return true;
    }
    if (typeof info.timestamp !== 'string') {
        return false;
    }
    const timestampMs = Date.parse(info.timestamp);
    if (!Number.isFinite(timestampMs)) {
        return false;
    }
    return (options.nowMs ?? Date.now()) - timestampMs <= options.maxAgeMs;
}
export async function fetchHealth(origin, timeoutMs = 1000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(new URL('/api/health', origin), {
            signal: controller.signal,
            headers: { accept: 'application/json' },
        });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
export function normalizeHealthServerInfo(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const value = data;
    return normalizeServerInfo(value.server ?? data);
}
