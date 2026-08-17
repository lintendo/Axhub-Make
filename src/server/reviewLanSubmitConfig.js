import fs from 'node:fs';
import path from 'node:path';
import { getConfigPath, isPathInside } from './projectCore/index.ts';
const REVIEW_CONFIG_SCHEMA_VERSION = 1;
const REVIEW_CONFIG_FILE_NAME = 'config.json';
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function isSafePathName(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed.includes('\0'))
        return false;
    if (trimmed.includes('/') || trimmed.includes('\\'))
        return false;
    if (trimmed === '.' || trimmed === '..' || trimmed.includes('..'))
        return false;
    if (path.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed))
        return false;
    return true;
}
export function getPrototypeDir(projectRoot, prototypeId) {
    const trimmed = String(prototypeId || '').trim();
    if (!isSafePathName(trimmed)) {
        return null;
    }
    const prototypeDir = path.resolve(projectRoot, 'src', 'prototypes', trimmed);
    return isPathInside(projectRoot, prototypeDir) ? prototypeDir : null;
}
export function getPrototypeReviewsDir(prototypeDir) {
    return path.join(prototypeDir, '.spec', 'reviews');
}
export function getPrototypeReviewConfigPath(prototypeDir) {
    return path.join(getPrototypeReviewsDir(prototypeDir), REVIEW_CONFIG_FILE_NAME);
}
function readPrototypeReviewConfig(prototypeDir) {
    const configPath = getPrototypeReviewConfigPath(prototypeDir);
    if (!fs.existsSync(configPath)) {
        return { schemaVersion: REVIEW_CONFIG_SCHEMA_VERSION };
    }
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config || typeof config !== 'object' || config.schemaVersion !== REVIEW_CONFIG_SCHEMA_VERSION) {
            return { schemaVersion: REVIEW_CONFIG_SCHEMA_VERSION };
        }
        return config;
    }
    catch {
        return { schemaVersion: REVIEW_CONFIG_SCHEMA_VERSION };
    }
}
function writePrototypeReviewConfig(prototypeDir, config) {
    const configPath = getPrototypeReviewConfigPath(prototypeDir);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, `${JSON.stringify({
        ...config,
        schemaVersion: REVIEW_CONFIG_SCHEMA_VERSION,
    }, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, configPath);
}
export function readPrototypeReviewLanSubmitEnabled(prototypeDir) {
    return readPrototypeReviewConfig(prototypeDir).lanSubmitEnabled === true;
}
export function writePrototypeReviewLanSubmitConfig(prototypeDir, enabled) {
    writePrototypeReviewConfig(prototypeDir, {
        ...readPrototypeReviewConfig(prototypeDir),
        lanSubmitEnabled: enabled,
    });
}
function isLocalOnlyHostname(value) {
    const hostname = stringValue(value).toLowerCase();
    return hostname === 'localhost'
        || hostname === '0.0.0.0'
        || hostname === '::1'
        || hostname === '[::1]'
        || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
}
function readProjectLanHost(projectRoot) {
    try {
        const configPath = getConfigPath(projectRoot);
        const config = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
            : {};
        const server = config?.server && typeof config.server === 'object' ? config.server : {};
        return stringValue(server.lanHost);
    }
    catch {
        return '';
    }
}
export function resolveReviewSubmitOrigin(projectRoot, makeOrigin) {
    const rawOrigin = stringValue(makeOrigin) || 'http://localhost';
    const url = new URL(rawOrigin);
    const lanHost = readProjectLanHost(projectRoot);
    if (isLocalOnlyHostname(url.hostname) && lanHost && !isLocalOnlyHostname(lanHost)) {
        url.hostname = lanHost;
    }
    return url.origin;
}
export function createReviewSubmitUrl(params) {
    const url = new URL('/api/review-reports/submit', resolveReviewSubmitOrigin(params.projectRoot, params.makeOrigin));
    url.searchParams.set('projectId', params.projectId);
    url.searchParams.set('prototypeId', params.prototypeId);
    return url.toString();
}
export function createReviewReportExistsUrl(params) {
    const url = new URL('/api/review-reports/exists', resolveReviewSubmitOrigin(params.projectRoot, params.makeOrigin));
    url.searchParams.set('projectId', params.projectId);
    url.searchParams.set('prototypeId', params.prototypeId);
    return url.toString();
}
export function createReviewSubmitInjectionOptions(params) {
    const prototypeId = stringValue(params.prototypeId);
    const prototypeDir = getPrototypeDir(params.projectRoot, prototypeId);
    if (!prototypeDir || !readPrototypeReviewLanSubmitEnabled(prototypeDir)) {
        return undefined;
    }
    return {
        url: createReviewSubmitUrl({
            projectRoot: params.projectRoot,
            projectId: params.projectId,
            prototypeId,
            makeOrigin: params.makeOrigin,
        }),
        existsUrl: createReviewReportExistsUrl({
            projectRoot: params.projectRoot,
            projectId: params.projectId,
            prototypeId,
            makeOrigin: params.makeOrigin,
        }),
        projectId: params.projectId,
        prototypeId,
    };
}
function normalizeSlashPath(value) {
    return String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/gu, '')
        .replace(/\/index\.(t|j)sx?$/iu, '');
}
export function resolvePrototypeIdForReviewSubmit(params) {
    const normalizedTargetPath = normalizeSlashPath(params.targetPath);
    const [, pathPrototypeId = ''] = normalizedTargetPath.match(/^(?:src\/)?prototypes\/([^/]+)/u) || [];
    if (pathPrototypeId) {
        return pathPrototypeId;
    }
    const sourcePath = normalizeSlashPath(params.sourceFile);
    const [, sourcePrototypeId = ''] = sourcePath.match(/(?:^|\/)src\/prototypes\/([^/]+)/u) || [];
    if (sourcePrototypeId) {
        return sourcePrototypeId;
    }
    if (!/^(?:src\/)?prototypes(?:\/|$)/u.test(normalizedTargetPath)) {
        return '';
    }
    const resourceId = stringValue(params.resource?.id);
    if (resourceId) {
        return resourceId;
    }
    const resourceName = stringValue(params.resource?.name);
    if (resourceName) {
        return resourceName;
    }
    return '';
}
