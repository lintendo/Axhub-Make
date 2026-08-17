import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildLocalCommandEnv, commandExists as localCommandExists, } from './localCommand.ts';
import { releaseListeningProcessesOnPort } from './portOccupancy.ts';
const DEFAULT_ASSISTANT_WEB_BASE_URL = 'http://localhost:32124';
const DEFAULT_ASSISTANT_PORT = '32124';
const DEFAULT_ASSISTANT_PORT_NUMBER = 32124;
const ACP_UI_NPX_COMMAND = 'npx';
const ACP_UI_NPX_PACKAGE = '@axhub/acp@latest';
const ACP_UI_NPM_COMMAND = 'npm';
const ACP_UI_START_CHECK_DELAY_MS = 500;
const ACP_UI_READY_CHECK_TIMEOUT_MS = 120_000;
const ACP_UI_READY_CHECK_INTERVAL_MS = 500;
const ACP_UI_ENDPOINT_PROBE_TIMEOUT_MS = 1_500;
const COMMAND_AVAILABILITY_TIMEOUT_MS = 2_000;
const ACP_UI_SERVICE_ID = '@axhub/acp';
const ACP_UI_DEFAULT_CORS_ORIGINS = [
    'http://localhost:53817',
    'http://127.0.0.1:53817',
    'chrome-extension://cndglokmgjecikflojjieeeajbljgfae',
    'chrome-extension://inmihdeflblgkefcngaljagdmhdkghka',
];
const ACP_UI_DEFAULT_CORS_ORIGIN_SET = new Set(ACP_UI_DEFAULT_CORS_ORIGINS);
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function normalizeBaseUrl(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim().replace(/\/+$/u, '');
    if (!trimmed) {
        return null;
    }
    try {
        const url = new URL(trimmed);
        return url.toString().replace(/\/+$/u, '');
    }
    catch {
        return null;
    }
}
function quoteDisplayArg(value) {
    return /\s/u.test(value) ? JSON.stringify(value) : value;
}
function formatDisplayCommand(command, args, cwd) {
    const commandText = [command, ...args].map(quoteDisplayArg).join(' ');
    return cwd ? `cd ${quoteDisplayArg(cwd)} && ${commandText}` : commandText;
}
function normalizeCorsOriginList(...values) {
    const origins = new Set();
    for (const value of values) {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw)
            continue;
        for (const item of raw.split(/[,\s]+/u)) {
            const origin = item.trim().replace(/\/+$/u, '');
            if (origin)
                origins.add(origin);
        }
    }
    return Array.from(origins).join(',');
}
export function resolveAssistantMakeCorsOrigins(corsOrigin, options = {}) {
    const env = options.env || process.env;
    const explicitOrigins = normalizeCorsOriginList(env.AXHUB_ACP_UI_CORS_ORIGIN, env.ACP_UI_CORS_ORIGINS);
    const requestedOrigins = normalizeCorsOriginList(explicitOrigins, corsOrigin)
        .split(',')
        .filter(Boolean);
    const additionalOrigins = requestedOrigins.filter((origin) => !ACP_UI_DEFAULT_CORS_ORIGIN_SET.has(origin));
    if (additionalOrigins.length === 0) {
        return '';
    }
    // ACP's --cors-origin replaces its defaults, so every override must carry the defaults forward.
    return normalizeCorsOriginList(ACP_UI_DEFAULT_CORS_ORIGINS.join(','), additionalOrigins.join(','));
}
function normalizeLocalAcpUiProjectRoot(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function resolveAcpUiCorsOrigins(corsOrigin) {
    return resolveAssistantMakeCorsOrigins(corsOrigin);
}
function resolveAcpUiProjectRootCandidate(candidate) {
    const root = path.resolve(candidate);
    return existsSync(path.join(root, 'package.json')) ? root : '';
}
function resolveAutoDiscoveredAcpUiProjectRoot() {
    const cwd = process.cwd();
    const candidates = [
        path.resolve(cwd, 'acp-ui'),
        path.resolve(cwd, '../acp-ui'),
        path.resolve(cwd, '../../acp-ui'),
        path.resolve(cwd, '../../../acp-ui'),
        path.resolve(cwd, '../../../../acp-ui'),
    ];
    for (const candidate of candidates) {
        const root = resolveAcpUiProjectRootCandidate(candidate);
        if (root)
            return root;
    }
    return '';
}
function resolveLocalAcpUiProjectRoot() {
    const configuredRoot = normalizeLocalAcpUiProjectRoot(process.env.AXHUB_ACP_UI_PROJECT_ROOT);
    if (configuredRoot) {
        return resolveAcpUiProjectRootCandidate(configuredRoot);
    }
    return resolveAutoDiscoveredAcpUiProjectRoot();
}
function resolveAcpUiStartCommandSpec(projectPath, options = {}) {
    const port = String(options.port || DEFAULT_ASSISTANT_PORT);
    const corsOrigins = resolveAcpUiCorsOrigins(options.corsOrigin);
    const corsArgs = corsOrigins ? ['--cors-origin', corsOrigins] : [];
    const localAcpUiProjectRoot = resolveLocalAcpUiProjectRoot();
    if (localAcpUiProjectRoot) {
        const args = ['run', 'dev', '--', '--port', port, ...corsArgs];
        return {
            command: ACP_UI_NPM_COMMAND,
            args,
            cwd: localAcpUiProjectRoot,
            displayCommand: formatDisplayCommand(ACP_UI_NPM_COMMAND, args, localAcpUiProjectRoot),
        };
    }
    const args = ['-y', ACP_UI_NPX_PACKAGE, '--port', port, ...corsArgs];
    const cwd = projectPath || process.cwd();
    return {
        command: ACP_UI_NPX_COMMAND,
        args,
        cwd,
        displayCommand: formatDisplayCommand(ACP_UI_NPX_COMMAND, args),
    };
}
function buildAcpUiStartEnv(options = {}) {
    const env = buildLocalCommandEnv();
    const corsOrigins = resolveAcpUiCorsOrigins(options.corsOrigin);
    if (corsOrigins) {
        env.ACP_UI_CORS_ORIGINS = corsOrigins;
    }
    return env;
}
export function getAssistantHealthHints(options = {}) {
    const port = options.port || DEFAULT_ASSISTANT_PORT_NUMBER;
    const startSpec = resolveAcpUiStartCommandSpec('', {
        port,
        corsOrigin: options.corsOrigin,
    });
    const localAcpUiProjectRoot = resolveLocalAcpUiProjectRoot();
    return {
        installGlobal: localAcpUiProjectRoot
            ? formatDisplayCommand(ACP_UI_NPM_COMMAND, ['install'], localAcpUiProjectRoot)
            : `${ACP_UI_NPX_COMMAND} -y ${ACP_UI_NPX_PACKAGE} --help`,
        start: startSpec.displayCommand,
        status: `curl http://localhost:${port}/api/chat`,
    };
}
function createAssistantHealthInfo(params) {
    return {
        status: params.status,
        message: params.message,
        checkedAt: new Date().toISOString(),
        commandSource: params.commandSource,
        hints: getAssistantHealthHints({
            port: params.port,
            corsOrigin: params.corsOrigin,
        }),
    };
}
export function normalizeAssistantBootstrapMode(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim();
    if (normalized === 'install_global' || normalized === 'start_existing' || normalized === 'restart_existing') {
        return normalized;
    }
    return null;
}
function isLocalhostName(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}
function getRequestHostname(req) {
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    return String(forwardedHost || req.headers.host || '').split(':')[0].trim();
}
export function rewriteAssistantLocalhostUrl(rawUrl, req) {
    const requestHost = getRequestHostname(req);
    if (!requestHost || isLocalhostName(requestHost)) {
        return rawUrl;
    }
    try {
        const parsed = new URL(rawUrl);
        if (isLocalhostName(parsed.hostname)) {
            parsed.hostname = requestHost;
            return parsed.toString().replace(/\/+$/u, '');
        }
    }
    catch {
        // Keep original.
    }
    return rawUrl;
}
function getSpawnCommandSpec(command, args, platform = process.platform) {
    if (platform !== 'win32' || /\.(exe|com)$/i.test(command)) {
        return { command, args, windowsHide: platform === 'win32' };
    }
    return {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', [command, ...args].join(' ')],
        windowsHide: true,
    };
}
function resolvePortFromUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
        return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
    }
    catch {
        return null;
    }
}
function createLocalAcpEndpoints(port) {
    const webBaseUrl = `http://localhost:${port}`;
    return {
        webBaseUrl,
        apiBaseUrl: `${webBaseUrl}/api`,
        source: port === DEFAULT_ASSISTANT_PORT_NUMBER ? 'default' : 'config',
    };
}
function isLocalAssistantEndpoint(rawUrl) {
    try {
        const url = new URL(rawUrl);
        return url.protocol === 'http:' && isLocalhostName(url.hostname);
    }
    catch {
        return false;
    }
}
function isDefaultLocalAssistantEndpoint(rawUrl) {
    return isLocalAssistantEndpoint(rawUrl) && resolvePortFromUrl(rawUrl) === DEFAULT_ASSISTANT_PORT_NUMBER;
}
function isAssistantEndpointNetworkFailure(message) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('fetch failed')
        || normalized.includes('failed to fetch')
        || normalized.includes('econnrefused')
        || normalized.includes('econnreset')
        || normalized.includes('enotfound')
        || normalized.includes('timed out')
        || normalized.includes('timeout')
        || normalized.includes('operation was aborted')
        || normalized.includes('aborted');
}
function shouldUseDefaultForFailedLocalConfig(endpoints, probe) {
    return endpoints.source === 'config'
        && !probe.ok
        && isLocalAssistantEndpoint(endpoints.webBaseUrl)
        && !isDefaultLocalAssistantEndpoint(endpoints.webBaseUrl)
        && isAssistantEndpointNetworkFailure(probe.message);
}
function isAssistantEndpointCorsFailure(message) {
    return String(message || '').includes('跨域预检失败');
}
function shouldRestartLocalEndpointForAutoStart(endpoints, probe) {
    return endpoints.source !== 'env'
        && !probe.ok
        && isLocalAssistantEndpoint(endpoints.webBaseUrl)
        && isAssistantEndpointNetworkFailure(probe.message);
}
function formatPreservedSharedAcpMessage(probeMessage) {
    return `${probeMessage}；ACP UI 已在运行，为保留共享服务配置，Make 未自动重启`;
}
function formatRuntimeUnreachableMessage(probeMessage, ignoredLocalConfig) {
    if (!ignoredLocalConfig) {
        return `ACP UI 未就绪：${probeMessage}`;
    }
    return [
        `ACP UI 未就绪：默认端口 ${DEFAULT_ASSISTANT_PORT} 不可访问`,
        `已忽略失效的本地 ACP 配置 ${ignoredLocalConfig.webBaseUrl}`,
        probeMessage,
    ].join('；');
}
function resolveStartEndpoints(preferredEndpoints) {
    const preferredPort = resolvePortFromUrl(preferredEndpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER;
    return preferredPort === DEFAULT_ASSISTANT_PORT_NUMBER
        ? createLocalAcpEndpoints(DEFAULT_ASSISTANT_PORT_NUMBER)
        : preferredEndpoints;
}
async function runAcpUiCommandInBackground(projectPath, options = {}) {
    const startSpec = resolveAcpUiStartCommandSpec(projectPath, options);
    if (!(await localCommandExists(startSpec.command, { timeoutMs: COMMAND_AVAILABILITY_TIMEOUT_MS }))) {
        throw new Error(`未检测到 ${startSpec.command} 命令，请先安装 Node.js/npm 后重试`);
    }
    return new Promise((resolve, reject) => {
        const spawnSpec = getSpawnCommandSpec(startSpec.command, startSpec.args, process.platform);
        const child = spawn(spawnSpec.command, spawnSpec.args, {
            cwd: startSpec.cwd,
            detached: true,
            stdio: 'ignore',
            windowsHide: spawnSpec.windowsHide,
            shell: false,
            env: buildAcpUiStartEnv({ corsOrigin: options.corsOrigin }),
        });
        if (typeof child?.once !== 'function') {
            child.unref?.();
            resolve();
            return;
        }
        let settled = false;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            child.unref?.();
            if (error) {
                reject(error);
                return;
            }
            resolve();
        };
        child.once('error', (error) => finish(error));
        child.once('spawn', () => setTimeout(() => finish(), 150));
        setTimeout(() => finish(), 500);
    });
}
function normalizeAssistantConfig(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    return {
        webBaseUrl: normalizeBaseUrl(raw.webBaseUrl),
        apiBaseUrl: normalizeBaseUrl(raw.apiBaseUrl),
    };
}
function resolveRuntimeEndpoints(params) {
    const webBaseUrl = params.envAssistant?.webBaseUrl
        || params.configAssistant?.webBaseUrl
        || DEFAULT_ASSISTANT_WEB_BASE_URL;
    const apiBaseUrl = params.envAssistant?.apiBaseUrl
        || params.configAssistant?.apiBaseUrl
        || `${webBaseUrl}/api`;
    const source = params.envAssistant?.webBaseUrl || params.envAssistant?.apiBaseUrl
        ? 'env'
        : params.configAssistant?.webBaseUrl || params.configAssistant?.apiBaseUrl
            ? 'config'
            : 'default';
    return { webBaseUrl, apiBaseUrl, source };
}
function getCommandSourceForEndpointSource(source) {
    return source === 'default' ? 'default' : source;
}
async function fetchEndpoint(url, options = {}) {
    return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(ACP_UI_ENDPOINT_PROBE_TIMEOUT_MS),
    });
}
function isSameAssistantOrigin(sourceUrl, targetUrl) {
    try {
        return new URL(sourceUrl).origin === new URL(targetUrl).origin;
    }
    catch {
        return false;
    }
}
async function verifyAcpWebUiEndpoint(webBaseUrl) {
    const normalizedWebBaseUrl = webBaseUrl.replace(/\/+$/u, '');
    try {
        const response = await fetchEndpoint(`${normalizedWebBaseUrl}/`, {
            method: 'GET',
            redirect: 'manual',
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location') || '';
            const resolvedLocation = location ? new URL(location, normalizedWebBaseUrl).toString() : '';
            if (!resolvedLocation) {
                return { ok: false, message: 'ACP UI 页面探测失败: 首页重定向缺少 Location' };
            }
            if (!isSameAssistantOrigin(normalizedWebBaseUrl, resolvedLocation)) {
                return { ok: false, message: `ACP UI 页面探测失败: 首页重定向到不同端口 ${resolvedLocation}` };
            }
            return { ok: true, message: 'ACP UI 页面可访问' };
        }
        if (!response.ok) {
            return { ok: false, message: `ACP UI 页面探测失败: status ${response.status}` };
        }
        return { ok: true, message: 'ACP UI 页面可访问' };
    }
    catch (error) {
        return { ok: false, message: `ACP UI 页面探测失败: ${error?.message || 'unknown error'}` };
    }
}
async function verifyAcpChatEndpoint(apiBaseUrl) {
    const normalizedApiBaseUrl = apiBaseUrl.replace(/\/+$/u, '');
    try {
        const response = await fetchEndpoint(`${normalizedApiBaseUrl}/chat`, { method: 'GET' });
        if (!response.ok && response.status !== 405) {
            return { ok: false, message: `ACP UI /api/chat 探测失败: status ${response.status}` };
        }
        return { ok: true, message: 'ACP UI /api/chat 可访问' };
    }
    catch (error) {
        return { ok: false, message: `ACP UI /api/chat 探测失败: ${error?.message || 'unknown error'}` };
    }
}
async function verifyAcpServerRuntimeEndpoint(params) {
    const normalizedApiBaseUrl = params.apiBaseUrl.replace(/\/+$/u, '');
    try {
        const response = await fetchEndpoint(`${normalizedApiBaseUrl}/acp/runtime`, {
            method: 'GET',
        });
        if (response.status === 404) {
            return { ok: true, detected: false, message: 'ACP server runtime metadata unavailable' };
        }
        if (!response.ok) {
            return { ok: false, detected: true, message: `ACP server runtime 探测失败: status ${response.status}` };
        }
        const payload = await response.json().catch(() => null);
        if (!payload || typeof payload !== 'object') {
            return { ok: false, detected: true, message: 'ACP server runtime 探测失败: 响应不是 JSON 对象' };
        }
        if (payload.service?.id !== ACP_UI_SERVICE_ID) {
            return { ok: false, detected: true, message: 'ACP server runtime 探测失败: 服务身份不匹配' };
        }
        if (payload.status && payload.status !== 'ready') {
            return { ok: false, detected: true, message: `ACP server runtime 状态异常: ${String(payload.status)}` };
        }
        const runtimeWebBaseUrl = normalizeBaseUrl(payload.webBaseUrl);
        if (runtimeWebBaseUrl && !isSameAssistantOrigin(params.webBaseUrl, runtimeWebBaseUrl)) {
            return {
                ok: false,
                detected: true,
                message: `ACP server runtime 探测失败: 声明的页面地址为 ${runtimeWebBaseUrl}`,
            };
        }
        const runtimeApiBaseUrl = normalizeBaseUrl(payload.apiBaseUrl);
        if (runtimeApiBaseUrl && !isSameAssistantOrigin(params.apiBaseUrl, runtimeApiBaseUrl)) {
            return {
                ok: false,
                detected: true,
                message: `ACP server runtime 探测失败: 声明的 API 地址为 ${runtimeApiBaseUrl}`,
            };
        }
        return { ok: true, detected: true, message: 'ACP server runtime 声明通过' };
    }
    catch (error) {
        return {
            ok: true,
            detected: false,
            message: `ACP server runtime metadata unavailable: ${error?.message || 'unknown error'}`,
        };
    }
}
function headerAllowsToken(headerValue, token) {
    const normalizedToken = token.trim().toLowerCase();
    if (!normalizedToken)
        return true;
    return String(headerValue || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .some((item) => item === normalizedToken || item === '*');
}
function headerAllowsOrigin(headerValue, origin) {
    const normalizedOrigin = origin.trim().replace(/\/+$/u, '');
    if (!normalizedOrigin)
        return true;
    return String(headerValue || '')
        .split(',')
        .map((item) => item.trim().replace(/\/+$/u, ''))
        .some((item) => item === '*' || item === normalizedOrigin);
}
async function verifyAcpCorsEndpoint(params) {
    const makeOrigin = String(params.makeOrigin || '').trim().replace(/\/+$/u, '');
    if (!makeOrigin) {
        return { ok: true, message: 'ACP UI 跨域未检测：Make origin 为空' };
    }
    const normalizedApiBaseUrl = params.apiBaseUrl.replace(/\/+$/u, '');
    try {
        const response = await fetchEndpoint(`${normalizedApiBaseUrl}/chat`, {
            method: 'OPTIONS',
            headers: {
                Origin: makeOrigin,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        });
        if (!response.ok && response.status !== 204) {
            return { ok: false, message: `ACP UI 跨域预检失败: status ${response.status}` };
        }
        if (!headerAllowsOrigin(response.headers.get('access-control-allow-origin'), makeOrigin)) {
            return { ok: false, message: `ACP UI 跨域预检失败: 未允许 ${makeOrigin}` };
        }
        if (!headerAllowsToken(response.headers.get('access-control-allow-methods'), 'POST')) {
            return { ok: false, message: 'ACP UI 跨域预检失败: 未允许 POST' };
        }
        if (!headerAllowsToken(response.headers.get('access-control-allow-headers'), 'content-type')) {
            return { ok: false, message: 'ACP UI 跨域预检失败: 未允许 content-type' };
        }
        return { ok: true, message: 'ACP UI 跨域预检通过' };
    }
    catch (error) {
        return { ok: false, message: `ACP UI 跨域预检失败: ${error?.message || 'unknown error'}` };
    }
}
async function verifyAssistantRuntimeEndpoint(params) {
    const runtimeProbe = await verifyAcpServerRuntimeEndpoint(params);
    if (!runtimeProbe.ok) {
        return runtimeProbe;
    }
    const webProbe = await verifyAcpWebUiEndpoint(params.webBaseUrl);
    if (!webProbe.ok) {
        return webProbe;
    }
    const chatProbe = await verifyAcpChatEndpoint(params.apiBaseUrl);
    if (!chatProbe.ok) {
        return chatProbe;
    }
    const corsProbe = await verifyAcpCorsEndpoint({
        apiBaseUrl: params.apiBaseUrl,
        makeOrigin: params.makeOrigin,
    });
    if (!corsProbe.ok) {
        return corsProbe;
    }
    return {
        ok: true,
        message: [
            runtimeProbe.detected ? runtimeProbe.message : '',
            'ACP UI 页面、/api/chat 和跨域预检通过',
        ].filter(Boolean).join('；'),
    };
}
async function waitForAssistantRuntimeEndpoint(params) {
    const timeoutMs = Math.max(0, params.timeoutMs ?? ACP_UI_READY_CHECK_TIMEOUT_MS);
    const intervalMs = Math.max(50, params.intervalMs ?? ACP_UI_READY_CHECK_INTERVAL_MS);
    const deadline = Date.now() + timeoutMs;
    let lastProbe = await verifyAssistantRuntimeEndpoint(params);
    while (!lastProbe.ok && Date.now() < deadline) {
        await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
        lastProbe = await verifyAssistantRuntimeEndpoint(params);
    }
    return lastProbe;
}
export async function resolveAssistantRuntime(params) {
    const configAssistant = normalizeAssistantConfig(params.assistantConfig);
    const envAssistant = {
        webBaseUrl: normalizeBaseUrl(process.env.AXHUB_ASSISTANT_WEB_BASE_URL),
        apiBaseUrl: normalizeBaseUrl(process.env.AXHUB_ASSISTANT_API_BASE_URL),
    };
    let endpoints = resolveRuntimeEndpoints({ configAssistant, envAssistant });
    let initialProbe = await verifyAssistantRuntimeEndpoint({
        ...endpoints,
        makeOrigin: params.makeOrigin,
    });
    let ignoredLocalConfig = null;
    if (params.allowConfiguredLocalEndpointFallback !== false && shouldUseDefaultForFailedLocalConfig(endpoints, initialProbe)) {
        ignoredLocalConfig = endpoints;
        endpoints = createLocalAcpEndpoints(DEFAULT_ASSISTANT_PORT_NUMBER);
        initialProbe = await verifyAssistantRuntimeEndpoint({
            ...endpoints,
            makeOrigin: params.makeOrigin,
        });
        await params.onRuntimeConfigResolved?.({
            webBaseUrl: endpoints.webBaseUrl,
            apiBaseUrl: endpoints.apiBaseUrl,
        });
    }
    if (initialProbe.ok) {
        return {
            webBaseUrl: endpoints.webBaseUrl,
            apiBaseUrl: endpoints.apiBaseUrl,
            projectPath: params.projectPath,
            source: endpoints.source,
            health: createAssistantHealthInfo({
                status: 'ready',
                message: initialProbe.message,
                commandSource: getCommandSourceForEndpointSource(endpoints.source),
                port: resolvePortFromUrl(endpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER,
                corsOrigin: params.makeOrigin,
            }),
        };
    }
    if (isAssistantEndpointCorsFailure(initialProbe.message)) {
        return {
            webBaseUrl: endpoints.webBaseUrl,
            apiBaseUrl: endpoints.apiBaseUrl,
            projectPath: params.projectPath,
            source: endpoints.source,
            health: createAssistantHealthInfo({
                status: 'runtime_unreachable',
                message: formatPreservedSharedAcpMessage(initialProbe.message),
                commandSource: getCommandSourceForEndpointSource(endpoints.source),
                port: resolvePortFromUrl(endpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER,
                corsOrigin: params.makeOrigin,
            }),
        };
    }
    const shouldAutoStart = params.autoStart !== false;
    if (!shouldAutoStart) {
        return {
            webBaseUrl: endpoints.webBaseUrl,
            apiBaseUrl: endpoints.apiBaseUrl,
            projectPath: params.projectPath,
            source: endpoints.source,
            health: createAssistantHealthInfo({
                status: 'runtime_unreachable',
                message: formatRuntimeUnreachableMessage(initialProbe.message, ignoredLocalConfig),
                commandSource: getCommandSourceForEndpointSource(endpoints.source),
                port: resolvePortFromUrl(endpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER,
                corsOrigin: params.makeOrigin,
            }),
        };
    }
    try {
        const shouldRestartSameEndpoint = shouldRestartLocalEndpointForAutoStart(endpoints, initialProbe);
        const startEndpoints = shouldRestartSameEndpoint ? endpoints : resolveStartEndpoints(endpoints);
        const startPort = resolvePortFromUrl(startEndpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER;
        if (shouldRestartSameEndpoint) {
            releaseListeningProcessesOnPort(startPort);
        }
        await runAcpUiCommandInBackground(params.projectPath, {
            port: startPort,
            corsOrigin: params.makeOrigin,
        });
        if (startEndpoints.source === 'config') {
            await params.onRuntimeConfigResolved?.({
                webBaseUrl: startEndpoints.webBaseUrl,
                apiBaseUrl: startEndpoints.apiBaseUrl,
            });
        }
        await sleep(ACP_UI_START_CHECK_DELAY_MS);
        const endpointProbe = await waitForAssistantRuntimeEndpoint({
            ...startEndpoints,
            makeOrigin: params.makeOrigin,
        });
        return {
            webBaseUrl: startEndpoints.webBaseUrl,
            apiBaseUrl: startEndpoints.apiBaseUrl,
            projectPath: params.projectPath,
            source: startEndpoints.source,
            health: createAssistantHealthInfo({
                status: endpointProbe.ok ? 'ready' : 'runtime_unreachable',
                message: endpointProbe.ok
                    ? endpointProbe.message
                    : `ACP UI 启动命令已触发，但服务仍不可访问：${endpointProbe.message}`,
                commandSource: 'acp-ui',
                port: startPort,
                corsOrigin: params.makeOrigin,
            }),
        };
    }
    catch (error) {
        return {
            webBaseUrl: endpoints.webBaseUrl,
            apiBaseUrl: endpoints.apiBaseUrl,
            projectPath: params.projectPath,
            source: endpoints.source,
            health: createAssistantHealthInfo({
                status: error?.message?.includes('未检测到') ? 'missing_cli' : 'cli_error',
                message: `启动 ACP UI 失败: ${error?.message || 'unknown error'}`,
                commandSource: 'acp-ui',
                port: resolvePortFromUrl(endpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER,
                corsOrigin: params.makeOrigin,
            }),
        };
    }
}
export async function runAssistantBootstrap(params) {
    const configAssistant = normalizeAssistantConfig(params.assistantConfig);
    const envAssistant = {
        webBaseUrl: normalizeBaseUrl(process.env.AXHUB_ASSISTANT_WEB_BASE_URL),
        apiBaseUrl: normalizeBaseUrl(process.env.AXHUB_ASSISTANT_API_BASE_URL),
    };
    const endpoints = resolveRuntimeEndpoints({ configAssistant, envAssistant });
    if (params.mode === 'restart_existing' && !isLocalAssistantEndpoint(endpoints.webBaseUrl)) {
        throw new Error('只能重启本机 ACP 服务，请检查 assistant.webBaseUrl 配置');
    }
    const runningProbe = await verifyAssistantRuntimeEndpoint(endpoints);
    if (runningProbe.ok) {
        const endpointProbe = await verifyAssistantRuntimeEndpoint({
            ...endpoints,
            makeOrigin: params.makeOrigin,
        });
        return {
            webBaseUrl: endpoints.webBaseUrl,
            apiBaseUrl: endpoints.apiBaseUrl,
            projectPath: params.projectPath,
            source: endpoints.source,
            health: createAssistantHealthInfo({
                status: endpointProbe.ok ? 'ready' : 'runtime_unreachable',
                message: endpointProbe.ok
                    ? endpointProbe.message
                    : formatPreservedSharedAcpMessage(endpointProbe.message),
                commandSource: getCommandSourceForEndpointSource(endpoints.source),
                port: resolvePortFromUrl(endpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER,
                corsOrigin: params.makeOrigin,
            }),
        };
    }
    let startEndpoints = endpoints;
    if (params.mode === 'restart_existing') {
        const port = resolvePortFromUrl(endpoints.webBaseUrl);
        if (!port) {
            throw new Error('无法解析本机 ACP 服务端口');
        }
        releaseListeningProcessesOnPort(port);
    }
    else if (!isLocalAssistantEndpoint(endpoints.webBaseUrl)) {
        startEndpoints = createLocalAcpEndpoints(DEFAULT_ASSISTANT_PORT_NUMBER);
    }
    else if (resolvePortFromUrl(endpoints.webBaseUrl) === DEFAULT_ASSISTANT_PORT_NUMBER) {
        startEndpoints = resolveStartEndpoints(endpoints);
    }
    else {
        startEndpoints = endpoints;
    }
    const port = resolvePortFromUrl(startEndpoints.webBaseUrl) || DEFAULT_ASSISTANT_PORT_NUMBER;
    await runAcpUiCommandInBackground(params.projectPath, {
        port,
        corsOrigin: params.makeOrigin,
    });
    if (startEndpoints.source === 'config') {
        await params.onRuntimeConfigResolved?.({
            webBaseUrl: startEndpoints.webBaseUrl,
            apiBaseUrl: startEndpoints.apiBaseUrl,
        });
    }
    await sleep(ACP_UI_START_CHECK_DELAY_MS);
    const endpointProbe = await waitForAssistantRuntimeEndpoint({
        ...startEndpoints,
        makeOrigin: params.makeOrigin,
    });
    return {
        webBaseUrl: startEndpoints.webBaseUrl,
        apiBaseUrl: startEndpoints.apiBaseUrl,
        projectPath: params.projectPath,
        source: startEndpoints.source,
        health: createAssistantHealthInfo({
            status: endpointProbe.ok ? 'ready' : 'runtime_unreachable',
            message: endpointProbe.ok
                ? endpointProbe.message
                : `ACP UI 启动命令已触发，但服务仍不可访问：${endpointProbe.message}`,
            commandSource: 'acp-ui',
            port,
            corsOrigin: params.makeOrigin,
        }),
    };
}
export function createAssistantRuntimeResponse(params) {
    const webBaseUrl = rewriteAssistantLocalhostUrl(params.runtime.webBaseUrl, params.req);
    const apiBaseUrl = rewriteAssistantLocalhostUrl(params.runtime.apiBaseUrl, params.req);
    return {
        ...params.runtime,
        webBaseUrl,
        apiBaseUrl,
        projectId: params.projectId,
        projectRoot: params.projectRoot,
        runtime: {
            available: params.runtime.health.status === 'ready',
            ...(params.runtime.health.status === 'ready' ? {} : { code: 'assistant-runtime-unavailable' }),
        },
    };
}
