import fs from 'node:fs';
import path from 'node:path';
import { getConfigPath, getGlobalServerConfigPath } from './paths.ts';
export const DEFAULT_AGENT_RUN_CONCURRENCY = 5;
export const ACP_NO_RESPONSE_MIN_SECONDS = 1200;
export const DEFAULT_VISIBLE_SERVER_CLOUD_PUBLISH_TARGETS = ['axhub'];
const CLOUD_PUBLISH_TARGETS = new Set([
    'vercel',
    'cloudflare-pages',
    's3',
    'github-pages',
    'axhub',
]);
const DEFAULT_CLOUD_PUBLISHING_CONFIG = {
    vercel: {
        token: '',
        projectName: '',
        teamId: '',
    },
    cloudflarePages: {
        apiToken: '',
        accountId: '',
        projectName: '',
        productionBranch: 'main',
    },
    s3: {
        accessKeyId: '',
        secretAccessKey: '',
        region: '',
        bucket: '',
        prefix: '',
        baseUrl: '',
        endpoint: '',
    },
    githubPages: {
        repository: '',
        branch: 'gh-pages',
        sourceDirectory: '/',
        pathPrefix: '',
    },
    publishSettings: {
        includeSource: false,
        visibleTargets: [...DEFAULT_VISIBLE_SERVER_CLOUD_PUBLISH_TARGETS],
    },
};
const DEFAULT_SERVER_CONFIG = {
    automation: {
        conversationPromptClient: null,
        conversationModel: null,
        defaultIDE: 'none',
        injectLocalAiEntry: true,
        acp: {
            mode: 'prompt',
            permission: 'approve-all',
            timeout: 1800,
        },
        annotationPromptClient: null,
        annotationModel: null,
        canvasPromptClient: null,
        canvasModel: null,
        agentRunConcurrency: DEFAULT_AGENT_RUN_CONCURRENCY,
    },
    assistant: {
        webBaseUrl: null,
        apiBaseUrl: null,
    },
    ai: {
        imageGeneration: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: null,
            model: 'gpt-image-2',
        },
    },
    uiPreferences: {
        excalidrawPropertyPanelMode: 'collapsed',
        excalidrawPropertyPanelPosition: 'right',
    },
    toolOpenState: {},
    accessControl: {
        lanPassword: {
            algorithm: 'scrypt',
            passwordHash: null,
            salt: null,
            secret: '',
            updatedAt: null,
        },
    },
    cloudPublishing: DEFAULT_CLOUD_PUBLISHING_CONFIG,
};
const PROMPT_CLIENT_VALUES = new Set([
    'acp:codex',
    'acp:claude',
    'acp:opencode',
    'acp:cursor',
    'acp:qoder',
    'acp:codebuddy',
    'acp:reasonix',
    'acp:grok-build',
    'manual',
]);
const LEGACY_PROMPT_CLIENT_VALUES = {
    codex: 'acp:codex',
    openai: 'acp:codex',
    claude: 'acp:claude',
    claudecode: 'acp:claude',
    gemini: 'acp:codex',
    'acp:gemini': 'acp:codex',
    opencode: 'acp:opencode',
    cursor: 'acp:cursor',
    qoder: 'acp:qoder',
    codebuddy: 'acp:codebuddy',
    reasonix: 'acp:reasonix',
    'grok-build': 'acp:grok-build',
};
const IDE_VALUES = new Set([
    'cursor',
    'trae',
    'trae_cn',
    'windsurf',
    'vscode',
    'antigravity',
    'qoder',
    'none',
]);
const TOOL_OPEN_MODES = new Set([
    'direct-app',
    'app-path',
    'browser-deeplink',
    'deeplink',
    'terminal',
    'managed-web',
]);
const TOOL_OPEN_KEY_PATTERN = /^(?:ide|cli|web|local-app):[a-z][a-z0-9_-]*$/u;
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
}
function normalizeNullableString(value) {
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
}
function normalizeTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeOptionalString(value, fallback) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed || fallback;
}
function normalizeBaseUrl(value, fallback) {
    const trimmed = normalizeOptionalString(value, fallback);
    const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
    try {
        const url = new URL(input);
        const pathSegments = url.pathname.split('/').filter(Boolean);
        const v1Index = pathSegments.indexOf('v1');
        const normalizedSegments = v1Index >= 0
            ? pathSegments.slice(0, v1Index + 1)
            : pathSegments.length
                ? [...pathSegments, 'v1']
                : ['v1'];
        return `${url.origin}/${normalizedSegments.join('/')}`;
    }
    catch {
        return fallback;
    }
}
function normalizePositiveInteger(value, fallback, options) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    const rounded = Math.round(value);
    if (rounded < options.min || rounded > options.max) {
        return fallback;
    }
    return rounded;
}
function normalizeAcpNoResponseSeconds(value, fallback) {
    const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    const rounded = Math.round(numeric);
    if (rounded <= 0) {
        return fallback;
    }
    return Math.min(7200, Math.max(ACP_NO_RESPONSE_MIN_SECONDS, rounded));
}
export function sanitizeAgentRunConcurrency(value, fallback = DEFAULT_AGENT_RUN_CONCURRENCY) {
    const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(10, Math.max(1, Math.trunc(numeric)));
}
function normalizeGithubPagesSourceDirectory(value, fallback) {
    const sourceDirectory = normalizeTrimmedString(value).replace(/\/+$/u, '');
    if (sourceDirectory === 'docs' || sourceDirectory === '/docs') {
        return '/docs';
    }
    if (sourceDirectory === '' && fallback === '/docs') {
        return '/docs';
    }
    return '/';
}
function normalizeVisibleCloudPublishTargets(value, fallback) {
    if (!Array.isArray(value)) {
        return [...fallback];
    }
    const targets = [];
    for (const target of value) {
        if (CLOUD_PUBLISH_TARGETS.has(target) && !targets.includes(target)) {
            targets.push(target);
        }
    }
    return targets;
}
function normalizePreservedSecretString(value, fallback) {
    const trimmed = normalizeTrimmedString(value);
    if (!trimmed || trimmed.includes('...')) {
        return fallback;
    }
    return trimmed;
}
export function normalizeServerCloudPublishingConfig(value, fallback = DEFAULT_CLOUD_PUBLISHING_CONFIG) {
    const raw = value && typeof value === 'object' ? value : {};
    const vercel = raw.vercel && typeof raw.vercel === 'object' ? raw.vercel : {};
    const cloudflarePages = raw.cloudflarePages && typeof raw.cloudflarePages === 'object' ? raw.cloudflarePages : {};
    const s3 = raw.s3 && typeof raw.s3 === 'object' ? raw.s3 : {};
    const githubPages = raw.githubPages && typeof raw.githubPages === 'object' ? raw.githubPages : {};
    const publishSettings = raw.publishSettings && typeof raw.publishSettings === 'object' ? raw.publishSettings : {};
    const fallbackVercel = fallback.vercel || DEFAULT_CLOUD_PUBLISHING_CONFIG.vercel || {};
    const fallbackCloudflarePages = fallback.cloudflarePages || DEFAULT_CLOUD_PUBLISHING_CONFIG.cloudflarePages || {};
    const fallbackS3 = fallback.s3 || DEFAULT_CLOUD_PUBLISHING_CONFIG.s3 || {};
    const fallbackGithubPages = fallback.githubPages || DEFAULT_CLOUD_PUBLISHING_CONFIG.githubPages || {};
    const fallbackPublishSettings = fallback.publishSettings || DEFAULT_CLOUD_PUBLISHING_CONFIG.publishSettings;
    return {
        vercel: {
            token: hasOwn(vercel, 'token')
                ? normalizePreservedSecretString(vercel.token, normalizeTrimmedString(fallbackVercel.token))
                : normalizeTrimmedString(fallbackVercel.token),
            projectName: hasOwn(vercel, 'projectName')
                ? normalizeTrimmedString(vercel.projectName)
                : normalizeTrimmedString(fallbackVercel.projectName),
            teamId: hasOwn(vercel, 'teamId')
                ? normalizeTrimmedString(vercel.teamId)
                : normalizeTrimmedString(fallbackVercel.teamId),
        },
        cloudflarePages: {
            apiToken: hasOwn(cloudflarePages, 'apiToken')
                ? normalizePreservedSecretString(cloudflarePages.apiToken, normalizeTrimmedString(fallbackCloudflarePages.apiToken))
                : normalizeTrimmedString(fallbackCloudflarePages.apiToken),
            accountId: hasOwn(cloudflarePages, 'accountId')
                ? normalizeTrimmedString(cloudflarePages.accountId)
                : normalizeTrimmedString(fallbackCloudflarePages.accountId),
            projectName: hasOwn(cloudflarePages, 'projectName')
                ? normalizeTrimmedString(cloudflarePages.projectName)
                : normalizeTrimmedString(fallbackCloudflarePages.projectName),
            productionBranch: hasOwn(cloudflarePages, 'productionBranch')
                ? normalizeOptionalString(cloudflarePages.productionBranch, normalizeTrimmedString(fallbackCloudflarePages.productionBranch) || 'main')
                : normalizeTrimmedString(fallbackCloudflarePages.productionBranch) || 'main',
        },
        s3: {
            accessKeyId: hasOwn(s3, 'accessKeyId')
                ? normalizePreservedSecretString(s3.accessKeyId, normalizeTrimmedString(fallbackS3.accessKeyId))
                : normalizeTrimmedString(fallbackS3.accessKeyId),
            secretAccessKey: hasOwn(s3, 'secretAccessKey')
                ? normalizePreservedSecretString(s3.secretAccessKey, normalizeTrimmedString(fallbackS3.secretAccessKey))
                : normalizeTrimmedString(fallbackS3.secretAccessKey),
            region: hasOwn(s3, 'region')
                ? normalizeTrimmedString(s3.region)
                : normalizeTrimmedString(fallbackS3.region),
            bucket: hasOwn(s3, 'bucket')
                ? normalizeTrimmedString(s3.bucket)
                : normalizeTrimmedString(fallbackS3.bucket),
            prefix: hasOwn(s3, 'prefix')
                ? normalizeTrimmedString(s3.prefix)
                : normalizeTrimmedString(fallbackS3.prefix),
            baseUrl: hasOwn(s3, 'baseUrl')
                ? normalizeTrimmedString(s3.baseUrl)
                : normalizeTrimmedString(fallbackS3.baseUrl),
            endpoint: hasOwn(s3, 'endpoint')
                ? normalizeTrimmedString(s3.endpoint)
                : normalizeTrimmedString(fallbackS3.endpoint),
        },
        githubPages: {
            repository: hasOwn(githubPages, 'repository')
                ? normalizeTrimmedString(githubPages.repository)
                : normalizeTrimmedString(fallbackGithubPages.repository),
            branch: hasOwn(githubPages, 'branch')
                ? normalizeOptionalString(githubPages.branch, normalizeTrimmedString(fallbackGithubPages.branch) || 'gh-pages')
                : normalizeTrimmedString(fallbackGithubPages.branch) || 'gh-pages',
            sourceDirectory: hasOwn(githubPages, 'sourceDirectory')
                ? normalizeGithubPagesSourceDirectory(githubPages.sourceDirectory, normalizeTrimmedString(fallbackGithubPages.sourceDirectory))
                : normalizeGithubPagesSourceDirectory(fallbackGithubPages.sourceDirectory, '/'),
            pathPrefix: hasOwn(githubPages, 'pathPrefix')
                ? normalizeTrimmedString(githubPages.pathPrefix)
                : normalizeTrimmedString(fallbackGithubPages.pathPrefix),
        },
        publishSettings: {
            includeSource: hasOwn(publishSettings, 'includeSource')
                ? publishSettings.includeSource === true
                : fallbackPublishSettings?.includeSource === true,
            visibleTargets: normalizeVisibleCloudPublishTargets(hasOwn(publishSettings, 'visibleTargets') ? publishSettings.visibleTargets : undefined, fallbackPublishSettings?.visibleTargets || DEFAULT_VISIBLE_SERVER_CLOUD_PUBLISH_TARGETS),
        },
    };
}
function normalizeAiImageGenerationLastTest(value, fallback) {
    if (value === null) {
        return undefined;
    }
    const data = value && typeof value === 'object' ? value : {};
    const status = data.status === 'passed' || data.status === 'failed'
        ? data.status
        : fallback?.status;
    const testedAt = typeof data.testedAt === 'number' && Number.isFinite(data.testedAt) && data.testedAt > 0
        ? Math.round(data.testedAt)
        : fallback?.testedAt;
    if (!status || !testedAt) {
        return fallback;
    }
    const rawMessage = hasOwn(data, 'message')
        ? normalizeTrimmedString(data.message)
        : fallback?.message || '';
    const message = (rawMessage || (status === 'passed' ? '已返回图片结果' : '测试失败')).slice(0, 500);
    return { status, message, testedAt };
}
function normalizeAiImageGenerationConfig(input, fallback) {
    const data = input && typeof input === 'object' ? input : {};
    const lastTest = hasOwn(data, 'lastTest')
        ? normalizeAiImageGenerationLastTest(data.lastTest, fallback.lastTest)
        : fallback.lastTest;
    const config = {
        baseUrl: hasOwn(data, 'baseUrl') ? normalizeBaseUrl(data.baseUrl, fallback.baseUrl) : fallback.baseUrl,
        apiKey: hasOwn(data, 'apiKey') ? normalizeNullableString(data.apiKey) : fallback.apiKey,
        model: hasOwn(data, 'model') ? normalizeOptionalString(data.model, fallback.model) : fallback.model,
    };
    if (lastTest) {
        config.lastTest = lastTest;
    }
    return config;
}
function normalizePromptClient(value, fallback) {
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    if (LEGACY_PROMPT_CLIENT_VALUES[normalized]) {
        return LEGACY_PROMPT_CLIENT_VALUES[normalized];
    }
    if (PROMPT_CLIENT_VALUES.has(normalized)) {
        return normalized;
    }
    return fallback;
}
function normalizeAnnotationPromptClient(value, fallback) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    const legacyValue = LEGACY_PROMPT_CLIENT_VALUES[normalized];
    if (legacyValue && legacyValue !== 'manual') {
        return legacyValue;
    }
    if (PROMPT_CLIENT_VALUES.has(normalized) && normalized !== 'manual') {
        return normalized;
    }
    return fallback;
}
function normalizeAcpExecutionConfig(value, fallback) {
    const data = value && typeof value === 'object' ? value : {};
    const mode = data.mode === 'exec' || data.mode === 'prompt' ? data.mode : fallback.mode;
    const permission = data.permission === 'approve-all' ? data.permission : fallback.permission;
    return {
        mode,
        permission,
        timeout: hasOwn(data, 'timeout')
            ? normalizeAcpNoResponseSeconds(data.timeout, fallback.timeout)
            : fallback.timeout,
    };
}
function normalizeToolOpenStateEntry(value, fallback = {}) {
    const data = value && typeof value === 'object' ? value : {};
    const executablePath = hasOwn(data, 'executablePath')
        ? normalizeTrimmedString(data.executablePath)
        : fallback.executablePath || '';
    const commandPath = hasOwn(data, 'commandPath')
        ? normalizeTrimmedString(data.commandPath)
        : fallback.commandPath || '';
    const appPathName = hasOwn(data, 'appPathName')
        ? normalizeTrimmedString(data.appPathName)
        : fallback.appPathName || '';
    const rawOpenMode = hasOwn(data, 'lastOpenMode')
        ? normalizeTrimmedString(data.lastOpenMode)
        : fallback.lastOpenMode || '';
    const lastOpenMode = TOOL_OPEN_MODES.has(rawOpenMode)
        ? rawOpenMode
        : '';
    const entry = {};
    if (executablePath)
        entry.executablePath = executablePath;
    if (commandPath)
        entry.commandPath = commandPath;
    if (appPathName)
        entry.appPathName = appPathName;
    if (lastOpenMode)
        entry.lastOpenMode = lastOpenMode;
    return entry;
}
function normalizeToolOpenState(value, fallback = {}) {
    const current = Object.fromEntries(Object.entries(fallback)
        .filter(([key]) => TOOL_OPEN_KEY_PATTERN.test(key))
        .map(([key, entry]) => [key, normalizeToolOpenStateEntry(entry)]));
    const data = value && typeof value === 'object' ? value : {};
    const next = { ...current };
    for (const [rawKey, rawEntry] of Object.entries(data)) {
        const key = rawKey.trim();
        if (!TOOL_OPEN_KEY_PATTERN.test(key)) {
            continue;
        }
        if (rawEntry === null) {
            delete next[key];
            continue;
        }
        const entry = normalizeToolOpenStateEntry(rawEntry, next[key]);
        if (Object.keys(entry).length > 0) {
            next[key] = entry;
        }
        else {
            delete next[key];
        }
    }
    return next;
}
function normalizeHexString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed && /^[a-f0-9]+$/iu.test(trimmed) ? trimmed.toLowerCase() : null;
}
function normalizeIsoString(value, fallback) {
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed && !Number.isNaN(Date.parse(trimmed)) ? trimmed : fallback;
}
function normalizeLanAccessPasswordConfig(value, fallback) {
    const data = value && typeof value === 'object' ? value : {};
    return {
        algorithm: 'scrypt',
        passwordHash: hasOwn(data, 'passwordHash')
            ? normalizeHexString(data.passwordHash)
            : fallback.passwordHash,
        salt: hasOwn(data, 'salt')
            ? normalizeHexString(data.salt)
            : fallback.salt,
        secret: hasOwn(data, 'secret')
            ? normalizeHexString(data.secret) || ''
            : fallback.secret,
        updatedAt: hasOwn(data, 'updatedAt')
            ? normalizeIsoString(data.updatedAt, fallback.updatedAt)
            : fallback.updatedAt,
    };
}
function normalizeIDE(value, fallback) {
    if (value === null) {
        return 'none';
    }
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (IDE_VALUES.has(normalized)) {
        return normalized;
    }
    // Accept web:* and cli:* compound open-method strings (e.g. 'web:opencode', 'cli:codex')
    if (/^(?:web|cli):[a-z][a-z0-9_-]*$/i.test(normalized)) {
        return normalized;
    }
    return fallback;
}
function normalizeExcalidrawPropertyPanelMode(value, fallback) {
    if (value === 'collapsed' || value === 'compact') {
        return 'collapsed';
    }
    if (value === 'expanded' || value === 'desktop') {
        return 'expanded';
    }
    return fallback;
}
function normalizeExcalidrawPropertyPanelPosition(value, fallback) {
    if (value === 'left' || value === 'right') {
        return value;
    }
    return fallback;
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function normalizeConfig(input, fallback = DEFAULT_SERVER_CONFIG) {
    const data = input && typeof input === 'object' ? input : {};
    const automation = data.automation && typeof data.automation === 'object' ? data.automation : {};
    const assistant = data.assistant && typeof data.assistant === 'object' ? data.assistant : {};
    const ai = data.ai && typeof data.ai === 'object' ? data.ai : {};
    const uiPreferences = data.uiPreferences && typeof data.uiPreferences === 'object' ? data.uiPreferences : {};
    const accessControl = data.accessControl && typeof data.accessControl === 'object'
        ? data.accessControl
        : {};
    const legacyPromptClient = hasOwn(automation, 'defaultPromptClient')
        ? normalizePromptClient(automation.defaultPromptClient, null)
        : null;
    const legacyAnnotationPromptClient = legacyPromptClient === 'manual'
        ? null
        : legacyPromptClient;
    const annotationPromptClientFallback = hasOwn(automation, 'defaultPromptClient')
        ? legacyAnnotationPromptClient
        : fallback.automation.annotationPromptClient;
    const conversationPromptClient = hasOwn(automation, 'conversationPromptClient')
        ? normalizePromptClient(automation.conversationPromptClient, fallback.automation.conversationPromptClient)
        : legacyPromptClient || fallback.automation.conversationPromptClient;
    const annotationPromptClient = hasOwn(automation, 'annotationPromptClient')
        ? normalizeAnnotationPromptClient(automation.annotationPromptClient, annotationPromptClientFallback)
        : annotationPromptClientFallback;
    const canvasPromptClient = hasOwn(automation, 'canvasPromptClient')
        ? normalizePromptClient(automation.canvasPromptClient, fallback.automation.canvasPromptClient)
        : legacyPromptClient || fallback.automation.canvasPromptClient;
    return {
        automation: {
            conversationPromptClient,
            conversationModel: hasOwn(automation, 'conversationModel')
                ? normalizeNullableString(automation.conversationModel)
                : fallback.automation.conversationModel,
            defaultIDE: hasOwn(automation, 'defaultIDE')
                ? normalizeIDE(automation.defaultIDE, fallback.automation.defaultIDE)
                : fallback.automation.defaultIDE,
            injectLocalAiEntry: hasOwn(automation, 'injectLocalAiEntry')
                && typeof automation.injectLocalAiEntry === 'boolean'
                ? automation.injectLocalAiEntry
                : fallback.automation.injectLocalAiEntry,
            acp: hasOwn(automation, 'acp') || hasOwn(automation, 'acpx')
                ? normalizeAcpExecutionConfig(hasOwn(automation, 'acp') ? automation.acp : automation.acpx, fallback.automation.acp)
                : fallback.automation.acp,
            annotationPromptClient,
            annotationModel: hasOwn(automation, 'annotationModel')
                ? normalizeNullableString(automation.annotationModel)
                : fallback.automation.annotationModel,
            canvasPromptClient,
            canvasModel: hasOwn(automation, 'canvasModel')
                ? normalizeNullableString(automation.canvasModel)
                : fallback.automation.canvasModel,
            agentRunConcurrency: hasOwn(automation, 'agentRunConcurrency')
                ? sanitizeAgentRunConcurrency(automation.agentRunConcurrency, fallback.automation.agentRunConcurrency)
                : fallback.automation.agentRunConcurrency,
        },
        assistant: {
            webBaseUrl: hasOwn(assistant, 'webBaseUrl')
                ? normalizeNullableString(assistant.webBaseUrl)
                : fallback.assistant.webBaseUrl,
            apiBaseUrl: hasOwn(assistant, 'apiBaseUrl')
                ? normalizeNullableString(assistant.apiBaseUrl)
                : fallback.assistant.apiBaseUrl,
        },
        ai: {
            imageGeneration: hasOwn(ai, 'imageGeneration')
                ? normalizeAiImageGenerationConfig(ai.imageGeneration, fallback.ai.imageGeneration)
                : fallback.ai.imageGeneration,
        },
        uiPreferences: {
            excalidrawPropertyPanelMode: hasOwn(uiPreferences, 'excalidrawPropertyPanelMode')
                ? normalizeExcalidrawPropertyPanelMode(uiPreferences.excalidrawPropertyPanelMode, fallback.uiPreferences.excalidrawPropertyPanelMode)
                : hasOwn(uiPreferences, 'excalidrawUiMode')
                    ? normalizeExcalidrawPropertyPanelMode(uiPreferences.excalidrawUiMode, fallback.uiPreferences.excalidrawPropertyPanelMode)
                    : fallback.uiPreferences.excalidrawPropertyPanelMode,
            excalidrawPropertyPanelPosition: hasOwn(uiPreferences, 'excalidrawPropertyPanelPosition')
                ? normalizeExcalidrawPropertyPanelPosition(uiPreferences.excalidrawPropertyPanelPosition, fallback.uiPreferences.excalidrawPropertyPanelPosition)
                : fallback.uiPreferences.excalidrawPropertyPanelPosition,
        },
        toolOpenState: hasOwn(data, 'toolOpenState')
            ? normalizeToolOpenState(data.toolOpenState, fallback.toolOpenState)
            : fallback.toolOpenState,
        accessControl: {
            lanPassword: hasOwn(accessControl, 'lanPassword')
                ? normalizeLanAccessPasswordConfig(accessControl.lanPassword, fallback.accessControl.lanPassword)
                : fallback.accessControl.lanPassword,
        },
        cloudPublishing: hasOwn(data, 'cloudPublishing')
            ? normalizeServerCloudPublishingConfig(data.cloudPublishing, fallback.cloudPublishing)
            : fallback.cloudPublishing,
    };
}
export function buildToolOpenStateKey(kind, value) {
    return `${kind}:${String(value || '').trim().toLowerCase()}`;
}
function getLegacyProjectConfig(projectRoot) {
    if (!projectRoot) {
        return DEFAULT_SERVER_CONFIG;
    }
    const legacyConfig = readJsonFile(getConfigPath(projectRoot));
    if (legacyConfig && typeof legacyConfig === 'object' && !Array.isArray(legacyConfig)) {
        const { cloudPublishing: _ignoredCloudPublishing, ...serverConfigFallback } = legacyConfig;
        return normalizeConfig(serverConfigFallback);
    }
    return normalizeConfig(legacyConfig);
}
function writeJsonAtomic(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
function serializeServerConfigForStorage(config) {
    const serialized = { ...config };
    const lanPassword = config.accessControl.lanPassword;
    if (!lanPassword.passwordHash && !lanPassword.salt && !lanPassword.secret && !lanPassword.updatedAt) {
        delete serialized.accessControl;
    }
    if (JSON.stringify(normalizeServerCloudPublishingConfig(config.cloudPublishing))
        === JSON.stringify(DEFAULT_CLOUD_PUBLISHING_CONFIG)) {
        delete serialized.cloudPublishing;
    }
    return serialized;
}
export function createServerConfigStore(options = {}) {
    const configPath = options.configPath ? path.resolve(options.configPath) : getGlobalServerConfigPath(options.homeDir);
    return {
        getConfigPath() {
            return configPath;
        },
        getConfig(getOptions = {}) {
            if (fs.existsSync(configPath)) {
                return normalizeConfig(readJsonFile(configPath));
            }
            return getLegacyProjectConfig(getOptions.activeProjectRoot);
        },
        saveConfig(input) {
            const current = fs.existsSync(configPath)
                ? normalizeConfig(readJsonFile(configPath))
                : DEFAULT_SERVER_CONFIG;
            const saved = normalizeConfig(input, current);
            writeJsonAtomic(configPath, serializeServerConfigForStorage(saved));
            return saved;
        },
    };
}
