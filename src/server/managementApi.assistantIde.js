import crypto from 'node:crypto';
import { resolveProjectPath } from './projectCore/index.ts';
import { createAssistantRuntimeResponse, normalizeAssistantBootstrapMode, resolveAssistantRuntime, runAssistantBootstrap, } from './assistantRuntime.ts';
import { detectAgentAvailabilityAtStartup } from './agentAvailability.ts';
import { LOCAL_APP_AGENT_VALUES, } from './agentTypes.ts';
import { getMissingCLIAgentOpenError, getMissingLocalAppOpenError, getMissingWebAgentOpenError, normalizeCLIAgent, normalizeLocalAppAgent, normalizeWebAgent, openCLIAgent, openLocalAppApplication, openLocalAppAgent, openWebAgent, } from './agentOpen.ts';
import { coordinateDesktopIntegrationOpen, DESKTOP_INTEGRATION_PROVIDERS, normalizeDesktopIntegrationOpenAction, normalizeDesktopIntegrationProvider, } from './desktopIntegrationOpen.ts';
import { closeMakeAgentSurfaceHost, inspectMakeAgentSurfaceHost, openMakeAgentProjectOnly, openMakeAgentSurface, openMakeAgentSurfaceProject, } from './agentSurfaceIntegration.ts';
import { getRequestUrl, readJsonBody, sendJson } from './http.ts';
import { normalizeMainIDE, openIDEPath } from './ideOpen.ts';
import { runLocalCommand } from './localCommand.ts';
import { buildToolOpenStateKey } from './projectCore/server-config.ts';
const CANVAS_PROTOTYPE_GENERATION_SCENE = 'canvas-prototype-generation';
const CANVAS_PROTOTYPE_GENERATION_TIMEOUT_SECONDS = 600;
const CANVAS_PROTOTYPE_GENERATION_SESSION_TTL_SECONDS = 30;
const AGENT_VERSION_TIMEOUT_MS = 2_000;
const AGENT_LATEST_VERSION_TIMEOUT_MS = 3_000;
const TRAEWORK_PROJECT_OPEN_UNSUPPORTED_MESSAGE = 'TRAEWORK 暂不支持自动打开当前项目';
const TRAEWORK_SURFACE_ONLY_NOTICE = 'TRAEWORK 已打开并注入 Axhub Make，但不支持自动打开目录，请在 TRAEWORK 中手动选择当前项目目录。';
const TRAEWORK_APPLICATION_ONLY_NOTICE = 'TRAEWORK 已打开，但不支持自动打开目录，请在 TRAEWORK 中手动选择当前项目目录。';
const AGENT_VERSION_COMMANDS = {
    claude: [{ command: 'claude', args: ['--version'] }],
    codex: [{ command: 'codex', args: ['--version'] }],
    opencode: [{ command: 'opencode', args: ['--version'] }],
    cursor: [{ command: 'agent', args: ['--version'] }],
    qoder: [{ command: 'qodercli', args: ['--version'] }],
    codebuddy: [{ command: 'codebuddy', args: ['--version'] }],
    reasonix: [
        { command: 'reasonix', args: ['--version'] },
        { command: 'reasonix', args: ['version'] },
    ],
    'grok-build': [{ command: 'grok', args: ['--version'] }],
};
const AGENT_NPM_PACKAGES = {
    claude: '@anthropic-ai/claude-code',
    codex: '@openai/codex',
    opencode: 'opencode-ai',
    qoder: '@qoder-ai/qodercli',
    codebuddy: '@tencent-ai/codebuddy-code',
    reasonix: 'reasonix',
    'grok-build': '@xai-official/grok',
};
function normalizeAgentVersionKey(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized)
        return null;
    return Object.prototype.hasOwnProperty.call(AGENT_VERSION_COMMANDS, normalized)
        ? normalized
        : null;
}
function getConfiguredCliAgentCommandPath(config, agent) {
    const cliAgent = agent === 'claude' ? 'claudecode' : agent;
    const commandPath = config?.toolOpenState?.[buildToolOpenStateKey('cli', cliAgent)]?.commandPath;
    const normalized = String(commandPath || '').trim();
    return normalized || undefined;
}
function resolveConfiguredMainIDE(projectRoot, options, handlers) {
    const config = handlers.getServerConfigStoreForRequest(options).getConfig({ activeProjectRoot: projectRoot });
    return normalizeMainIDE(config.automation.defaultIDE);
}
function withStoredCommandAvailability(availability, toolOpenState) {
    const storedCommandPath = String(toolOpenState?.commandPath || '').trim();
    if (!storedCommandPath) {
        return availability;
    }
    return {
        ...availability,
        status: 'installed',
        confidence: availability?.confidence || 'high',
        checkedAt: availability?.checkedAt || new Date().toISOString(),
        source: availability?.source || 'tool-open-state',
        path: storedCommandPath,
    };
}
function resolveDesktopProjectOpenContext({ provider, projectRoot, options, handlers, }) {
    const config = handlers.getServerConfigStoreForRequest(options).getConfig({ activeProjectRoot: projectRoot });
    if (provider === 'cursor') {
        const toolOpenStateKey = buildToolOpenStateKey('ide', 'cursor');
        const appPath = String(config.toolOpenState?.[toolOpenStateKey]?.executablePath || '').trim() || undefined;
        return { toolOpenStateKey, appPath };
    }
    const localAppByProvider = {
        chatgpt: 'codex',
        workbuddy: 'workbuddy',
        traework: 'traework',
        qoderwork: 'qoderwork',
    };
    const localApp = localAppByProvider[provider];
    const availability = detectAgentAvailabilityAtStartup();
    const toolOpenStateKey = buildToolOpenStateKey('local-app', localApp);
    const agentAvailability = withStoredCommandAvailability(availability.localApp[localApp], config.toolOpenState?.[toolOpenStateKey]);
    if (agentAvailability?.status === 'missing') {
        throw new Error(getMissingLocalAppOpenError(localApp).body.error);
    }
    return { toolOpenStateKey, appPath: agentAvailability?.path };
}
async function openDesktopIntegrationOperation({ provider, mode, targetPath, projectRoot, makeOrigin, projectId, projectOpenContext, options, handlers, }) {
    const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
    const { appPath, toolOpenStateKey } = projectOpenContext;
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
        if (mode !== 'normal' || provider !== 'cursor') {
            throw new Error(`${provider} project opening does not support ${process.platform}.`);
        }
        const existingToolOpenState = serverConfigStore
            .getConfig({ activeProjectRoot: projectRoot })
            .toolOpenState?.[toolOpenStateKey];
        const legacyResult = await openIDEPath({
            ide: 'cursor',
            targetPath,
            toolOpenState: existingToolOpenState,
        });
        serverConfigStore.saveConfig({
            toolOpenState: {
                [toolOpenStateKey]: {
                    executablePath: legacyResult.executablePath || appPath,
                    appPathName: legacyResult.appPathName,
                    lastOpenMode: legacyResult.openMode,
                },
            },
        });
        return { url: legacyResult.url, openInBrowser: legacyResult.openInBrowser };
    }
    if (provider === 'traework') {
        if (mode === 'integrated') {
            const surface = await openMakeAgentSurface({
                provider,
                makeOrigin,
                projectId,
                appPath,
            });
            if (!surface.ok)
                throw new Error(surface.message);
        }
        else {
            if (!appPath)
                throw new Error('TRAEWORK application path is required.');
            await openLocalAppApplication({ applicationPath: appPath, platform: process.platform });
        }
        serverConfigStore.saveConfig({
            toolOpenState: {
                [toolOpenStateKey]: {
                    commandPath: appPath,
                    lastOpenMode: 'direct-app',
                },
            },
        });
        return {
            noticeCode: 'project-selection-required',
            notice: mode === 'integrated'
                ? TRAEWORK_SURFACE_ONLY_NOTICE
                : TRAEWORK_APPLICATION_ONLY_NOTICE,
        };
    }
    const open = mode === 'integrated'
        ? openMakeAgentSurfaceProject
        : openMakeAgentProjectOnly;
    const result = await open({
        provider,
        makeOrigin,
        projectId,
        targetPath,
        appPath,
    });
    if (!result.ok)
        throw new Error(result.message);
    serverConfigStore.saveConfig({
        toolOpenState: {
            [toolOpenStateKey]: provider === 'cursor'
                ? {
                    executablePath: appPath,
                    lastOpenMode: result.url ? 'deeplink' : 'direct-app',
                }
                : {
                    commandPath: appPath,
                    lastOpenMode: result.url ? 'deeplink' : 'direct-app',
                },
        },
    });
    return { url: result.url, openInBrowser: result.openInBrowser };
}
function firstVersionLine(...outputs) {
    return outputs
        .map((output) => String(output || ''))
        .join('\n')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find(Boolean) || '';
}
function normalizeVersionOutput(...outputs) {
    const line = firstVersionLine(...outputs);
    const match = line.match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/u);
    return match?.[1] || line;
}
async function detectAgentVersion(agent, commandOverride) {
    const commands = commandOverride
        ? [{ command: commandOverride, args: ['--version'] }]
        : AGENT_VERSION_COMMANDS[agent];
    const checkedAt = new Date().toISOString();
    let lastError = null;
    let lastCommand = commands[0]?.command || agent;
    for (const spec of commands) {
        lastCommand = spec.command;
        try {
            const result = await runLocalCommand(spec.command, spec.args, {
                timeoutMs: AGENT_VERSION_TIMEOUT_MS,
                maxBuffer: 32 * 1024,
            });
            const version = normalizeVersionOutput(result.stdout, result.stderr);
            return {
                status: 'installed',
                checkedAt,
                command: spec.command,
                version: version || spec.command,
            };
        }
        catch (error) {
            lastError = error;
            if (error?.code === 'ETIMEDOUT') {
                return {
                    status: 'unknown',
                    checkedAt,
                    command: spec.command,
                    reason: error?.message || String(error),
                };
            }
        }
    }
    return {
        status: lastError?.code === 'ENOENT' ? 'missing' : 'unknown',
        checkedAt,
        command: lastCommand,
        reason: lastError?.message || String(lastError),
    };
}
async function detectLatestAgentVersion(agent) {
    const packageName = AGENT_NPM_PACKAGES[agent];
    const checkedAt = new Date().toISOString();
    if (!packageName) {
        return null;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AGENT_LATEST_VERSION_TIMEOUT_MS);
    try {
        const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
            },
        });
        const result = await response.json().catch(() => ({}));
        const version = typeof result?.version === 'string' ? result.version.trim() : '';
        if (!response.ok || !version) {
            return {
                status: 'unknown',
                checkedAt,
                command: packageName,
                packageName,
                reason: response.ok ? 'npm latest version is missing' : `npm registry returned ${response.status}`,
            };
        }
        return {
            status: 'installed',
            checkedAt,
            command: packageName,
            packageName,
            version,
        };
    }
    catch (error) {
        return {
            status: 'unknown',
            checkedAt,
            command: packageName,
            packageName,
            reason: error?.message || String(error),
        };
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function detectAgentVersionMap(detector) {
    const baseEntries = await Promise.all(Object.keys(AGENT_VERSION_COMMANDS).map(async (agent) => [
        agent,
        await detector(agent),
    ]));
    const entries = baseEntries.filter((entry) => Boolean(entry[1]));
    const result = Object.fromEntries(entries);
    if (result.claude) {
        result.claudecode = result.claude;
    }
    return result;
}
async function detectAgentVersions(commandOverrides = {}) {
    const [agents, latestAgents] = await Promise.all([
        detectAgentVersionMap((agent) => detectAgentVersion(agent, commandOverrides[agent])),
        detectAgentVersionMap(detectLatestAgentVersion),
    ]);
    return { agents, latestAgents };
}
async function detectSingleAgentVersions(agent, commandOverride) {
    const [version, latestVersion] = await Promise.all([
        detectAgentVersion(agent, commandOverride),
        detectLatestAgentVersion(agent),
    ]);
    const agents = {
        [agent]: version,
    };
    const latestAgents = latestVersion ? {
        [agent]: latestVersion,
    } : {};
    if (agent === 'claude') {
        agents.claudecode = version;
        if (latestVersion) {
            latestAgents.claudecode = latestVersion;
        }
    }
    return { agents, latestAgents };
}
export function resolvePromptExecutionAcpConfig(scene, legacyConfig) {
    if (typeof scene !== 'string' || scene.trim() !== CANVAS_PROTOTYPE_GENERATION_SCENE) {
        return legacyConfig;
    }
    const configuredTimeout = typeof legacyConfig?.timeout === 'number' && Number.isFinite(legacyConfig.timeout)
        ? legacyConfig.timeout
        : CANVAS_PROTOTYPE_GENERATION_TIMEOUT_SECONDS;
    const { mode: _ignoredMode, ttl: _ignoredTtl, ...baseConfig } = legacyConfig || {};
    return {
        ...baseConfig,
        timeout: Math.min(configuredTimeout, CANVAS_PROTOTYPE_GENERATION_TIMEOUT_SECONDS),
        ttl: CANVAS_PROTOTYPE_GENERATION_SESSION_TTL_SECONDS,
    };
}
function sanitizeAcpxSessionSegment(value) {
    const raw = String(value || '').trim();
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/gu, '-')
        .replace(/^-+|-+$/gu, '');
}
function sanitizeAcpxSessionSegmentWithFallback(value, fallbackPrefix) {
    const raw = String(value || '').trim();
    const sanitized = sanitizeAcpxSessionSegment(raw);
    if (sanitized)
        return sanitized;
    if (!raw)
        return '';
    const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10);
    return `${fallbackPrefix}-${hash}`;
}
function resolvePrototypeIdFromTargetPath(value) {
    const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/u, '');
    const match = normalized.match(/^prototypes\/([^/]+)$/u);
    if (!match?.[1] || match[1].startsWith('.') || match[1].includes('..') || match[1].includes('\0')) {
        return null;
    }
    return match[1];
}
export function resolveCanvasPrototypeGenerationSessionName(projectId, targetPath) {
    const projectSegment = sanitizeAcpxSessionSegmentWithFallback(projectId, 'project');
    const prototypeSegment = sanitizeAcpxSessionSegmentWithFallback(resolvePrototypeIdFromTargetPath(targetPath), 'prototype');
    if (!projectSegment || !prototypeSegment)
        return null;
    return `axhub-${projectSegment}-${prototypeSegment}`;
}
export function handleAssistantPromptIde(req, res, options, pathname, handlers) {
    if (!pathname.startsWith('/api/assistant/')
        && pathname !== '/api/desktop-integration/open'
        && pathname !== '/api/ide/open'
        && pathname !== '/api/agent/versions'
        && pathname !== '/api/agent/cli/open'
        && pathname !== '/api/agent/local-app/open'
        && pathname !== '/api/agent/web/open') {
        return false;
    }
    if (pathname === '/api/desktop-integration/open' && req.method !== 'POST') {
        sendJson(res, { error: 'Method not allowed' }, { status: 405 });
        return true;
    }
    if (pathname === '/api/desktop-integration/open' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', body);
            if (!context)
                return;
            const provider = normalizeDesktopIntegrationProvider(body?.provider);
            if (!provider) {
                sendJson(res, {
                    error: `Unsupported desktop integration provider: ${String(body?.provider || '(empty)')}`,
                    code: 'DESKTOP_INTEGRATION_PROVIDER_UNSUPPORTED',
                    projectId: context.project.id,
                    supported: DESKTOP_INTEGRATION_PROVIDERS,
                }, { status: 400 });
                return;
            }
            const action = normalizeDesktopIntegrationOpenAction(body?.action);
            if (!action) {
                sendJson(res, {
                    error: `Unsupported desktop integration action: ${String(body?.action || '(empty)')}`,
                    code: 'DESKTOP_INTEGRATION_ACTION_UNSUPPORTED',
                    projectId: context.project.id,
                    supported: ['prepare', 'restart', 'normal'],
                }, { status: 400 });
                return;
            }
            const rawTargetPath = String(body?.path || body?.targetPath || '').trim();
            const targetPath = rawTargetPath || context.project.root;
            let absoluteTargetPath = '';
            try {
                absoluteTargetPath = resolveProjectPath(context.project.root, targetPath);
            }
            catch (error) {
                sendJson(res, {
                    error: error.message,
                    code: 'PATH_OUTSIDE_PROJECT',
                    projectId: context.project.id,
                }, { status: 403 });
                return;
            }
            const serverConfig = handlers.getServerConfigStoreForRequest(options)
                .getConfig({ activeProjectRoot: context.project.root });
            const injectLocalAiEntry = serverConfig.automation.injectLocalAiEntry !== false;
            const effectiveAction = process.platform === 'darwin' || process.platform === 'win32'
                ? injectLocalAiEntry ? action : 'normal'
                : 'normal';
            const makeOrigin = getRequestUrl(req).origin;
            try {
                const preferredProjectOpenContext = resolveDesktopProjectOpenContext({
                    provider,
                    projectRoot: context.project.root,
                    options,
                    handlers,
                });
                const supportsAgentSurfaceProjectOpen = process.platform === 'darwin' || process.platform === 'win32';
                const initialInspection = supportsAgentSurfaceProjectOpen
                    ? await inspectMakeAgentSurfaceHost(provider, {
                        appPath: preferredProjectOpenContext.appPath,
                    })
                    : null;
                const projectOpenContext = {
                    ...preferredProjectOpenContext,
                    appPath: preferredProjectOpenContext.appPath || initialInspection?.appPath || undefined,
                };
                const open = (mode) => openDesktopIntegrationOperation({
                    provider,
                    mode,
                    targetPath: absoluteTargetPath,
                    projectRoot: context.project.root,
                    makeOrigin,
                    projectId: context.project.id,
                    projectOpenContext,
                    options,
                    handlers,
                });
                const adapters = {
                    inspect: () => inspectMakeAgentSurfaceHost(provider, { appPath: projectOpenContext.appPath }),
                    // The combined project-and-surface call owns launching and injection.
                    launch: async () => ({ launched: true, reused: false }),
                    close: () => closeMakeAgentSurfaceHost(provider, { appPath: projectOpenContext.appPath }),
                    open,
                };
                const result = await coordinateDesktopIntegrationOpen({
                    provider,
                    action: effectiveAction,
                }, adapters);
                sendJson(res, {
                    success: true,
                    ...result,
                    projectId: context.project.id,
                });
            }
            catch (error) {
                sendJson(res, {
                    error: error?.message || 'Failed to open desktop integration',
                    code: 'DESKTOP_INTEGRATION_OPEN_FAILED',
                    projectId: context.project.id,
                    provider,
                    action: effectiveAction,
                    targetPath: absoluteTargetPath,
                }, { status: 500 });
            }
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/assistant/runtime' && req.method === 'GET') {
        const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
        if (!context)
            return true;
        const url = getRequestUrl(req);
        const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
        const config = serverConfigStore.getConfig({ activeProjectRoot: context.project.root });
        resolveAssistantRuntime({
            projectPath: context.project.root,
            assistantConfig: config.assistant,
            autoStart: url.searchParams.get('autoStart') === 'true',
            makeOrigin: url.origin,
            onRuntimeConfigResolved: (assistant) => {
                serverConfigStore.saveConfig({ assistant });
            },
        }).then((runtime) => {
            sendJson(res, createAssistantRuntimeResponse({
                runtime,
                projectId: context.project.id,
                projectRoot: context.project.root,
                req,
            }));
        }).catch((error) => {
            sendJson(res, {
                error: error?.message || 'Failed to resolve assistant runtime',
                code: 'ASSISTANT_RUNTIME_RESOLVE_FAILED',
                projectId: context.project.id,
                projectRoot: context.project.root,
            }, { status: 500 });
        });
        return true;
    }
    if (pathname === '/api/agent/versions') {
        if (req.method !== 'GET') {
            sendJson(res, { error: 'Method not allowed' }, { status: 405 });
            return true;
        }
        const url = getRequestUrl(req);
        const agentQuery = url.searchParams.get('agent');
        const agent = agentQuery ? normalizeAgentVersionKey(agentQuery) : null;
        if (agentQuery && !agent) {
            sendJson(res, {
                error: `Unsupported agent: ${agentQuery}`,
                code: 'AGENT_VERSION_UNSUPPORTED',
                supported: Object.keys(AGENT_VERSION_COMMANDS),
            }, { status: 400 });
            return true;
        }
        const serverConfig = handlers.getServerConfigStoreForRequest(options).getConfig({
            activeProjectRoot: options.startupProjectRoot || options.projectRoot,
        });
        const commandOverrides = {};
        for (const versionKey of ['claude', 'codex', 'opencode']) {
            const commandPath = getConfiguredCliAgentCommandPath(serverConfig, versionKey);
            if (commandPath) {
                commandOverrides[versionKey] = commandPath;
            }
        }
        const detectVersions = agent
            ? detectSingleAgentVersions(agent, commandOverrides[agent])
            : detectAgentVersions(commandOverrides);
        detectVersions
            .then((result) => sendJson(res, result))
            .catch((error) => sendJson(res, {
            error: error?.message || 'Failed to detect agent versions',
        }, { status: 500 }));
        return true;
    }
    if (pathname === '/api/ide/open' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', body);
            if (!context)
                return;
            const rawTargetPath = String(body?.path || body?.targetPath || '').trim();
            const targetPath = rawTargetPath || context.project.root;
            let absoluteTargetPath = '';
            try {
                absoluteTargetPath = resolveProjectPath(context.project.root, targetPath);
            }
            catch (error) {
                sendJson(res, {
                    error: error.message,
                    code: 'PATH_OUTSIDE_PROJECT',
                    projectId: context.project.id,
                }, { status: 403 });
                return;
            }
            const rawExplicitIDE = typeof body?.ide === 'string' ? body.ide.trim() : '';
            const explicitIDE = normalizeMainIDE(rawExplicitIDE);
            if (rawExplicitIDE && !explicitIDE) {
                sendJson(res, {
                    error: `Unsupported main IDE: ${rawExplicitIDE}`,
                    code: 'MAIN_IDE_UNSUPPORTED',
                    projectId: context.project.id,
                    supported: ['cursor', 'trae', 'vscode', 'trae_cn', 'windsurf', 'qoder', 'antigravity'],
                }, { status: 400 });
                return;
            }
            const ide = explicitIDE || resolveConfiguredMainIDE(context.project.root, options, handlers);
            if (!ide) {
                sendJson(res, {
                    error: 'Main IDE is not configured',
                    code: 'MAIN_IDE_NOT_CONFIGURED',
                    projectId: context.project.id,
                }, { status: 400 });
                return;
            }
            const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
            const config = serverConfigStore.getConfig({ activeProjectRoot: context.project.root });
            const toolOpenStateKey = buildToolOpenStateKey('ide', ide);
            const existingToolOpenState = config.toolOpenState?.[toolOpenStateKey];
            try {
                const result = await openIDEPath({
                    ide,
                    targetPath: absoluteTargetPath,
                    toolOpenState: existingToolOpenState,
                });
                serverConfigStore.saveConfig({
                    toolOpenState: {
                        [toolOpenStateKey]: {
                            executablePath: result.executablePath,
                            appPathName: result.appPathName,
                            lastOpenMode: result.openMode,
                        },
                    },
                });
                sendJson(res, {
                    ...result,
                    projectId: context.project.id,
                });
            }
            catch (error) {
                sendJson(res, {
                    error: error?.message || 'Failed to open IDE',
                    code: 'IDE_OPEN_FAILED',
                    projectId: context.project.id,
                    ide,
                    targetPath: absoluteTargetPath,
                }, { status: 500 });
            }
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/agent/cli/open' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', body);
            if (!context)
                return;
            const rawTargetPath = String(body?.path || body?.targetPath || '').trim();
            const targetPath = rawTargetPath || context.project.root;
            let absoluteTargetPath = '';
            try {
                absoluteTargetPath = resolveProjectPath(context.project.root, targetPath);
            }
            catch (error) {
                sendJson(res, {
                    error: error.message,
                    code: 'PATH_OUTSIDE_PROJECT',
                    projectId: context.project.id,
                }, { status: 403 });
                return;
            }
            const rawAgent = typeof body?.agent === 'string' ? body.agent.trim() : '';
            const agent = normalizeCLIAgent(rawAgent);
            if (!agent) {
                sendJson(res, {
                    error: `Unsupported CLI agent: ${rawAgent || '(empty)'}`,
                    code: 'CLI_AGENT_UNSUPPORTED',
                    projectId: context.project.id,
                    supported: ['codex', 'claudecode', 'opencode'],
                }, { status: 400 });
                return;
            }
            const availability = detectAgentAvailabilityAtStartup();
            const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
            const config = serverConfigStore.getConfig({ activeProjectRoot: context.project.root });
            const toolOpenStateKey = buildToolOpenStateKey('cli', agent);
            const agentAvailability = withStoredCommandAvailability(availability.cli[agent], config.toolOpenState?.[toolOpenStateKey]);
            if (agentAvailability?.status === 'missing') {
                const missingAgentOpenError = getMissingCLIAgentOpenError(agent);
                sendJson(res, {
                    ...missingAgentOpenError.body,
                    projectId: context.project.id,
                    availability: agentAvailability,
                }, { status: missingAgentOpenError.statusCode });
                return;
            }
            try {
                const result = await openCLIAgent({
                    agent,
                    targetPath: absoluteTargetPath,
                    availability: agentAvailability,
                });
                serverConfigStore.saveConfig({
                    toolOpenState: {
                        [toolOpenStateKey]: {
                            commandPath: agentAvailability?.path,
                            lastOpenMode: 'terminal',
                        },
                    },
                });
                sendJson(res, {
                    ...result,
                    projectId: context.project.id,
                });
            }
            catch (error) {
                sendJson(res, {
                    error: error?.message || 'Failed to open CLI agent',
                    code: 'CLI_AGENT_OPEN_FAILED',
                    projectId: context.project.id,
                    agent,
                    targetPath: absoluteTargetPath,
                }, { status: 500 });
            }
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/agent/local-app/open' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', body);
            if (!context)
                return;
            const rawTargetPath = String(body?.path || body?.targetPath || '').trim();
            const targetPath = rawTargetPath || context.project.root;
            let absoluteTargetPath = '';
            try {
                absoluteTargetPath = resolveProjectPath(context.project.root, targetPath);
            }
            catch (error) {
                sendJson(res, {
                    error: error.message,
                    code: 'PATH_OUTSIDE_PROJECT',
                    projectId: context.project.id,
                }, { status: 403 });
                return;
            }
            const rawAgent = typeof body?.agent === 'string' ? body.agent.trim() : '';
            const agent = normalizeLocalAppAgent(rawAgent);
            if (!agent) {
                sendJson(res, {
                    error: `Unsupported local app agent: ${rawAgent || '(empty)'}`,
                    code: 'LOCAL_APP_AGENT_UNSUPPORTED',
                    projectId: context.project.id,
                    supported: LOCAL_APP_AGENT_VALUES,
                }, { status: 400 });
                return;
            }
            if (agent === 'traework') {
                sendJson(res, {
                    error: TRAEWORK_PROJECT_OPEN_UNSUPPORTED_MESSAGE,
                    code: 'PROJECT_OPEN_UNSUPPORTED',
                    projectId: context.project.id,
                    agent,
                    targetPath: absoluteTargetPath,
                }, { status: 422 });
                return;
            }
            const availability = detectAgentAvailabilityAtStartup();
            const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
            const config = serverConfigStore.getConfig({ activeProjectRoot: context.project.root });
            const toolOpenStateKey = buildToolOpenStateKey('local-app', agent);
            const agentAvailability = withStoredCommandAvailability(availability.localApp[agent], config.toolOpenState?.[toolOpenStateKey]);
            if (agentAvailability?.status === 'missing') {
                const missingAgentOpenError = getMissingLocalAppOpenError(agent);
                sendJson(res, {
                    ...missingAgentOpenError.body,
                    projectId: context.project.id,
                    availability: agentAvailability,
                }, { status: missingAgentOpenError.statusCode });
                return;
            }
            try {
                const result = await openLocalAppAgent({
                    agent,
                    targetPath: absoluteTargetPath,
                    availability: agentAvailability,
                    toolOpenState: config.toolOpenState?.[toolOpenStateKey],
                });
                serverConfigStore.saveConfig({
                    toolOpenState: {
                        [toolOpenStateKey]: {
                            commandPath: agentAvailability?.path,
                            lastOpenMode: result.openMode || (result.url || result.command.includes('://') ? 'deeplink' : 'direct-app'),
                        },
                    },
                });
                sendJson(res, {
                    ...result,
                    projectId: context.project.id,
                });
            }
            catch (error) {
                sendJson(res, {
                    error: error?.message || 'Failed to open local app agent',
                    code: 'LOCAL_APP_AGENT_OPEN_FAILED',
                    projectId: context.project.id,
                    agent,
                    targetPath: absoluteTargetPath,
                }, { status: 500 });
            }
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/agent/web/open' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', body);
            if (!context)
                return;
            const rawTargetPath = String(body?.path || body?.targetPath || '').trim();
            const targetPath = rawTargetPath || context.project.root;
            let absoluteTargetPath = '';
            try {
                absoluteTargetPath = resolveProjectPath(context.project.root, targetPath);
            }
            catch (error) {
                sendJson(res, {
                    error: error.message,
                    code: 'PATH_OUTSIDE_PROJECT',
                    projectId: context.project.id,
                }, { status: 403 });
                return;
            }
            const rawAgent = typeof body?.agent === 'string' ? body.agent.trim() : '';
            const agent = normalizeWebAgent(rawAgent);
            if (!agent) {
                sendJson(res, {
                    error: `Unsupported web agent: ${rawAgent || '(empty)'}`,
                    code: 'WEB_AGENT_UNSUPPORTED',
                    projectId: context.project.id,
                    supported: ['opencode', 'acp'],
                }, { status: 400 });
                return;
            }
            const availability = detectAgentAvailabilityAtStartup();
            const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
            const config = serverConfigStore.getConfig({ activeProjectRoot: context.project.root });
            const toolOpenStateKey = buildToolOpenStateKey('web', agent);
            const agentAvailability = withStoredCommandAvailability(availability.web[agent], config.toolOpenState?.[toolOpenStateKey]);
            if (agentAvailability?.status === 'missing') {
                const missingAgentOpenError = getMissingWebAgentOpenError(agent);
                sendJson(res, {
                    ...missingAgentOpenError.body,
                    projectId: context.project.id,
                    availability: agentAvailability,
                }, { status: missingAgentOpenError.statusCode });
                return;
            }
            try {
                const result = await openWebAgent({
                    agent,
                    targetPath: absoluteTargetPath,
                    availability: agentAvailability,
                    corsOrigin: typeof body?.corsOrigin === 'string' ? body.corsOrigin.trim() : '',
                });
                serverConfigStore.saveConfig({
                    toolOpenState: {
                        [toolOpenStateKey]: {
                            commandPath: agentAvailability?.path,
                            lastOpenMode: result.serverUrl ? 'managed-web' : 'terminal',
                        },
                    },
                });
                sendJson(res, {
                    ...result,
                    projectId: context.project.id,
                });
            }
            catch (error) {
                sendJson(res, {
                    error: error?.message || 'Failed to open web agent',
                    code: 'WEB_AGENT_OPEN_FAILED',
                    projectId: context.project.id,
                    agent,
                    targetPath: absoluteTargetPath,
                }, { status: 500 });
            }
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    if (pathname === '/api/assistant/bootstrap' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.resolveProjectContext(req, res, options, 'explicit-required', body);
            if (!context)
                return;
            const mode = normalizeAssistantBootstrapMode(body?.mode);
            if (!mode) {
                sendJson(res, {
                    error: 'Unsupported assistant bootstrap mode',
                    code: 'ASSISTANT_BOOTSTRAP_MODE_INVALID',
                    projectId: context.project.id,
                    supportedModes: ['install_global', 'start_existing', 'restart_existing'],
                }, { status: 400 });
                return;
            }
            const url = getRequestUrl(req);
            const serverConfigStore = handlers.getServerConfigStoreForRequest(options);
            const config = serverConfigStore.getConfig({ activeProjectRoot: context.project.root });
            try {
                const runtime = await runAssistantBootstrap({
                    mode,
                    projectPath: context.project.root,
                    assistantConfig: config.assistant,
                    makeOrigin: url.origin,
                    onRuntimeConfigResolved: (assistant) => {
                        serverConfigStore.saveConfig({ assistant });
                    },
                });
                sendJson(res, {
                    success: true,
                    mode,
                    message: 'ACP UI 启动或复用检查已完成',
                    runtime: createAssistantRuntimeResponse({
                        runtime,
                        projectId: context.project.id,
                        projectRoot: context.project.root,
                        req,
                    }),
                });
            }
            catch (error) {
                sendJson(res, {
                    error: error?.message || 'Failed to bootstrap assistant runtime',
                    code: 'ASSISTANT_BOOTSTRAP_FAILED',
                    projectId: context.project.id,
                    projectRoot: context.project.root,
                }, { status: 500 });
            }
        }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
        return true;
    }
    return false;
}
