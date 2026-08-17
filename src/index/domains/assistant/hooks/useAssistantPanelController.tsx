import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type {
    CanvasItem,
    AssistantContextV1,
    ItemData,
    PromptClientPreference,
    TabType,
    ViewMode,
} from '../../../types';
import type { DataTableResourceItem, ThemeResourceItem } from '../../../domains/resources/resource.types';
import { apiService } from '../../../services/index.api';
import { ASSISTANT_OPEN_URL_EVENT, STORAGE_KEY_ASSISTANT_WIDTH } from '../../../constants';
import {
    type AssistantContentMode,
    type AssistantMarkdownResourceSelection,
    buildAssistantContextWithCanvasComments,
    buildAssistantCurrentFileSyncContext,
    getAssistantCanvasCommentsSignature,
    getAssistantContextCurrentFilePath,
    mergeAssistantContextForActiveFile,
    resolveAssistantCurrentFile,
    shouldSyncAssistantCurrentFile,
} from '../../../utils/assistantContext';
import type { CanvasElementContextInfo } from '../../../components/content/canvas-embeds/AnnotationOverlay';
import { useAssistantBridge } from './useAssistantBridge';
import {
    buildAssistantIframePoolKey,
    readAssistantIframeRunEvent,
    useAssistantIframePool,
} from './useAssistantIframePool';
import { useAssistantRuntime } from './useAssistantRuntime';
import { createAssistantNotificationTracker } from '../../notifications/assistantNotificationEvents';
import { notificationDiagnostics } from '../../notifications/notificationDiagnostics';
import type { NotificationIntent } from '../../notifications/notificationCoordinator';
import {
    type AcpContextItem,
    type AssistantImageGenerationConfig,
    type AssistantPreviewMcpConfig,
    buildAcpContextPostMessage,
    getAcpImageGenerationConfigSignature,
    getAcpPreviewMcpConfigSignature,
} from '../assistantAcpContext';
import { buildAssistantContextItemsFromCanvasElements, type AssistantImageAttachmentPayload } from '../assistantContextPayload';
import {
    getAssistantResourceThreadId,
    getAssistantResourceThreadIdWithFallback,
    getAssistantStoreThreadId,
    resolvePrototypeConversationStorePath,
    setAssistantResourceThreadId,
    setAssistantStoreThreadId,
} from '../assistantResourceThread';
import {
    getAssistantCurrentFilePath,
    mergeAssistantContextV1,
    normalizeAssistantCurrentFileV1,
} from '@/common/assistant-context/bridge';
import type { AcpProvider } from '@/common/assistant-context/types';
import { resolveAcpPromptClientProvider } from '@/common/acpModelConfig';
import { readAssistantImageSavedEvent, type AssistantImageSavedEvent } from '../assistantImageSavedEvent';

type AssistantTriggerSource = 'button' | 'event';
type AssistantRuntimeState = Awaited<ReturnType<typeof apiService.getAssistantRuntime>>;
export type AssistantAiPanelMode = 'general-ai' | 'image-ai' | 'external' | null;
type EnsureAssistantOpenOptions = {
    loadingText?: string | false;
    suppressResourceThreadBinding?: boolean;
    openSettingsOnFailure?: boolean;
    panelMode?: AssistantAiPanelMode;
};
type OpenAssistantSubmitOptions = {
    forceNewThread?: boolean;
    waitUntil?: 'started' | 'finished';
    collectArtifacts?: boolean;
    artifactSource?: 'auto' | 'provider' | 'runtime';
    ignoredArtifactPaths?: string[];
    provider?: string | null;
    model?: string | null;
    mode?: string | null;
    thought?: string | null;
    autoSend?: boolean;
};
type OpenAssistantSubmitResult = {
    ok: boolean;
    threadId?: string;
    artifacts?: unknown[];
    workspaceArtifacts?: unknown[];
    imageGenerationRecords?: unknown[];
};
type AcpNavigationChangedMessage = {
    href: string;
    threadId?: string | null;
    conversationStorePath?: string | null;
};
const ACP_NAVIGATION_CHANGED_EVENT = 'acp.navigation.changed';
const ACP_HOST_READY_EVENTS = [
    'thread.runtime.changed',
    'thread.messages.changed',
    'thread.artifacts.changed',
    'thread.idle',
] as const;

const LEGACY_ASSISTANT_OPEN_PARAMS = [
    'context',
    'prompt',
    'provider',
    'model',
    'modeId',
    'thoughtLevel',
    'permissionMode',
    'integrationWs',
    'integrationClientId',
    'integrationChannel',
    'agentApiBaseUrl',
    'agentIntegrationChannel',
    'agentTargetClientId',
    'editorClientId',
    'editorIntegrationWs',
    'editorApiBaseUrl',
    'editorIntegrationChannel',
    'editorSessionId',
    'editorMobileMode',
    'slashCommands',
] as const;

function removeLegacyAssistantOpenParams(url: URL): void {
    for (const paramName of LEGACY_ASSISTANT_OPEN_PARAMS) {
        url.searchParams.delete(paramName);
    }
}

function readAcpNavigationChangedMessage(data: unknown): AcpNavigationChangedMessage | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const record = data as { type?: unknown; payload?: unknown };
    if (record.type !== ACP_NAVIGATION_CHANGED_EVENT || !record.payload || typeof record.payload !== 'object') {
        return null;
    }

    const payload = record.payload as { href?: unknown; threadId?: unknown; conversationStorePath?: unknown };
    const href = typeof payload.href === 'string' ? payload.href.trim() : '';
    if (!href) {
        return null;
    }

    const threadId = typeof payload.threadId === 'string'
        ? payload.threadId.trim() || null
        : payload.threadId === null
            ? null
            : undefined;
    const conversationStorePath = typeof payload.conversationStorePath === 'string'
        ? payload.conversationStorePath.trim() || null
        : payload.conversationStorePath === null
            ? null
            : undefined;

    return {
        href,
        ...(threadId !== undefined ? { threadId } : {}),
        ...(conversationStorePath !== undefined ? { conversationStorePath } : {}),
    };
}

function readAcpEventDiagnosticDetails(data: unknown): { kind: string; threadId: string | null } | null {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const record = data as { type?: unknown; payload?: unknown };
    if (record.type !== 'acp.event' || !record.payload || typeof record.payload !== 'object') {
        return null;
    }
    const payload = record.payload as { kind?: unknown; threadId?: unknown };
    const kind = typeof payload.kind === 'string' ? payload.kind.trim() : '';
    const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : '';
    return {
        kind: kind || 'unknown',
        threadId: threadId || null,
    };
}

function resolveAcpNavigationThreadId(navigationUrl: string): string | null {
    try {
        const url = new URL(navigationUrl);
        const match = url.pathname.match(/^\/thread\/([^/]+)\/?$/u);
        if (!match) {
            return null;
        }
        try {
            return decodeURIComponent(match[1]).trim() || null;
        } catch {
            return match[1]?.trim() || null;
        }
    } catch {
        return null;
    }
}

function waitForAssistantPanelPaint(): Promise<void> {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
        });
    });
}

function normalizeAcpArtifactPath(value: unknown): string {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/u, '');
}

function getAcpArtifactPath(artifact: unknown): string {
    if (!artifact || typeof artifact !== 'object') {
        return '';
    }
    const record = artifact as { path?: unknown; target?: unknown; title?: unknown };
    const target = record.target && typeof record.target === 'object'
        ? record.target as { path?: unknown }
        : {};
    return normalizeAcpArtifactPath(record.path || target.path || record.title);
}

async function waitForAcpArtifacts(
    readArtifacts: () => Promise<{
        artifacts?: unknown[];
        workspaceArtifacts?: unknown[];
        imageGenerationRecords?: unknown[];
    }>,
    options: {
        timeoutMs?: number;
        intervalMs?: number;
        ignoredArtifactPaths?: string[];
    } = {},
) {
    const timeoutMs = options.timeoutMs ?? 420_000;
    const intervalMs = options.intervalMs ?? 3000;
    const ignoredPaths = new Set((options.ignoredArtifactPaths || [])
        .map(normalizeAcpArtifactPath)
        .filter(Boolean));
    const filterArtifacts = (artifacts?: unknown[]) => {
        const list = Array.isArray(artifacts) ? artifacts : [];
        if (!ignoredPaths.size) {
            return list;
        }
        return list.filter((artifact) => !ignoredPaths.has(getAcpArtifactPath(artifact)));
    };
    const startedAt = Date.now();
    let latest = await readArtifacts();
    while (Date.now() - startedAt < timeoutMs) {
        const artifacts = filterArtifacts(latest.artifacts);
        const workspaceArtifacts = filterArtifacts(latest.workspaceArtifacts);
        if (artifacts.length || workspaceArtifacts.length || latest.imageGenerationRecords?.length) {
            return {
                ...latest,
                artifacts,
                workspaceArtifacts,
            };
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        latest = await readArtifacts();
    }
    return {
        ...latest,
        artifacts: filterArtifacts(latest.artifacts),
        workspaceArtifacts: filterArtifacts(latest.workspaceArtifacts),
    };
}

function resolveAssistantFallbackResourcePathFromUrl(targetPath?: string): string {
    void targetPath;
    return '';
}

function isAssistantCanvasMcpPath(value: unknown): boolean {
    const currentFilePath = typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
    return /^src\/resources\/.+\.excalidraw$/u.test(currentFilePath);
}

function isAssistantCanvasMcpContext(context: AssistantContextV1): boolean {
    return isAssistantCanvasMcpPath(getAssistantContextCurrentFilePath(context));
}

function getAssistantPreviewMcpRuntimeConfig(context: AssistantContextV1, targetPath?: string): AssistantPreviewMcpConfig | null {
    if (typeof window === 'undefined') {
        return null;
    }
    const globals = window as unknown as Record<string, unknown>;
    const previewToken = String(globals.__AXHUB_PREVIEW_MCP_TOKEN__ || '').trim();
    if (!previewToken) {
        return null;
    }
    const previewBridgeClientId = String(globals.__AXHUB_PREVIEW_BRIDGE_CLIENT_ID__ || '').trim();
    const includeCanvas = isAssistantCanvasMcpContext(context) || isAssistantCanvasMcpPath(targetPath);
    const canvasToken = String(globals.__AXHUB_CANVAS_MCP_TOKEN__ || '').trim();
    return {
        makeOrigin: window.location.origin,
        previewToken,
        previewBridgeClientId,
        ...(includeCanvas && canvasToken ? { includeCanvas: true, canvasToken } : {}),
    };
}

function resolveStoredAssistantPanelMode(mode: AssistantAiPanelMode): AssistantAiPanelMode {
    return mode === 'image-ai' ? 'image-ai' : 'general-ai';
}

interface AssistantMessageApi {
    success: (content: string) => void;
    error: (content: string) => void;
    warning: (content: string) => void;
    info: (content: string) => void;
    loading: (content: string, duration?: number) => () => void;
}

interface AssistantModalApi {
    confirm: (config: any) => void;
}

interface OpenAssistantUrlEventDetail {
    url?: string;
    targetPath?: string;
}

interface ResolvedAssistantUrl {
    url: string;
    resourceThreadStoragePath: string;
    conversationStorePath: string;
}

interface UseAssistantPanelControllerParams {
    messageApi: AssistantMessageApi;
    modal: AssistantModalApi;
    preferredPromptClient: PromptClientPreference;
    preferredModel?: string | null;
    onOpenAISettings?: (runtime?: AssistantRuntimeState | null, message?: string) => void;
    onAiNotification?: (intent: NotificationIntent) => void;
    onImageSaved?: (event: AssistantImageSavedEvent) => void;
    activeProjectId: string | null;
    activeTab: TabType;
    viewMode: ViewMode;
    isDarkMode: boolean;
    selectedItem: ItemData | null;
    contentMode: AssistantContentMode;
    currentMarkdownResource: AssistantMarkdownResourceSelection;
    initialAssistantPanelMode?: AssistantAiPanelMode;
    assistantImageGenerationConfig?: AssistantImageGenerationConfig | null;
    imageAiSaveDirectory?: string | null;
    currentCanvas?: CanvasItem | null;
    currentTheme?: ThemeResourceItem | null;
    currentDataTable?: DataTableResourceItem | null;
}

export function useAssistantPanelController({
    messageApi,
    modal: _modal,
    preferredPromptClient,
    preferredModel = null,
    onOpenAISettings,
    onAiNotification,
    onImageSaved,
    activeProjectId,
    activeTab,
    viewMode,
    isDarkMode,
    selectedItem,
    contentMode,
    currentMarkdownResource,
    initialAssistantPanelMode = null,
    assistantImageGenerationConfig = null,
    imageAiSaveDirectory = null,
    currentCanvas = null,
    currentTheme = null,
    currentDataTable = null,
}: UseAssistantPanelControllerParams) {
    const ASSISTANT_RUNTIME_UI_LOG_PREFIX = '[assistant-runtime-ui]';
    const DEFAULT_ASSISTANT_WEB_BASE_URL = 'http://localhost:32124';
    const DEFAULT_ASSISTANT_INSTALL_CMD = 'npx -y @axhub/acp --port 32124';
    const DEFAULT_ASSISTANT_PANEL_WIDTH = 320;
    const MIN_ASSISTANT_PANEL_WIDTH = 320;
    const ASSISTANT_PANEL_MAX_VIEWPORT_RATIO = 0.5;
    function getAssistantPanelMaxWidth(): number {
        return Math.max(
            MIN_ASSISTANT_PANEL_WIDTH,
            Math.round(window.innerWidth * ASSISTANT_PANEL_MAX_VIEWPORT_RATIO),
        );
    }
    function clampAssistantPanelWidth(width: number): number {
        return Math.min(Math.max(width, MIN_ASSISTANT_PANEL_WIDTH), getAssistantPanelMaxWidth());
    }
    const projectId = activeProjectId?.trim() || undefined;
    const DEFAULT_ASSISTANT_RUNTIME_STATE: AssistantRuntimeState = {
        webBaseUrl: DEFAULT_ASSISTANT_WEB_BASE_URL,
        apiBaseUrl: `${DEFAULT_ASSISTANT_WEB_BASE_URL}/api`,
        projectPath: '',
        source: 'default',
        health: {
            status: 'runtime_unreachable',
            message: 'AI 助手不可用，请先启动 AI 助手。',
            checkedAt: new Date().toISOString(),
            commandSource: 'default',
            hints: {
                installGlobal: DEFAULT_ASSISTANT_INSTALL_CMD,
                start: DEFAULT_ASSISTANT_INSTALL_CMD,
                status: 'curl http://localhost:32124/api/chat',
            },
        },
    };

    const [assistantVisible, setAssistantVisible] = useState(false);
    const [assistantPanelMounted, setAssistantPanelMounted] = useState(false);
    const [assistantPanelMaxWidth, setAssistantPanelMaxWidth] = useState(getAssistantPanelMaxWidth);
    const [assistantPanelWidth, setAssistantPanelWidthValue] = useState<number>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_ASSISTANT_WIDTH);
        const parsed = saved ? Number(saved) : Number.NaN;
        if (Number.isFinite(parsed) && parsed >= MIN_ASSISTANT_PANEL_WIDTH) {
            return clampAssistantPanelWidth(parsed);
        }
        return clampAssistantPanelWidth(DEFAULT_ASSISTANT_PANEL_WIDTH);
    });
    const setAssistantPanelWidth = useCallback((nextWidth: number) => {
        setAssistantPanelWidthValue(clampAssistantPanelWidth(nextWidth));
    }, []);
    const [assistantIframeOverrideUrl, setAssistantIframeOverrideUrl] = useState<string | null>(null);
    const [assistantPanelMode, setAssistantPanelMode] = useState<AssistantAiPanelMode>(() => resolveStoredAssistantPanelMode(initialAssistantPanelMode));
    const [assistantExternalContext, setAssistantExternalContext] = useState<AssistantContextV1 | null>(null);
    const assistantCurrentFilePathRef = useRef('');
    const assistantContextCommentsSignatureRef = useRef('');
    const assistantIframeLoadSyncSignatureRef = useRef('');
    const assistantThemeSyncSignatureRef = useRef('');
    const assistantImageGenerationConfigSyncSignatureRef = useRef('');
    const assistantPreviewMcpConfigSyncSignatureRef = useRef('');
    const assistantIframeBridgeRecoveringRef = useRef(false);
    const assistantIframeBridgeRecoveryIdRef = useRef(0);
    const previousAssistantActiveIframeKeyRef = useRef<string | null>(null);
    const assistantIframeCurrentUrlRef = useRef('');
    const assistantIframeResourceSwitchSignatureRef = useRef('');
    const latestAssistantSyncContextRef = useRef<AssistantContextV1 | null>(null);
    const latestAssistantResourcePathRef = useRef('');
    const latestAssistantConversationStorePathRef = useRef('');
    const latestAssistantNavigationThreadIdRef = useRef<string | null | undefined>(undefined);
    const assistantResourceThreadBindingSuppressedRef = useRef(false);
    const previousAssistantProjectIdRef = useRef(projectId || '');
    const currentAssistantProjectIdRef = useRef(projectId || '');
    currentAssistantProjectIdRef.current = projectId || '';
    const assistantOpenRequestIdRef = useRef(0);
    const assistantIframePool = useAssistantIframePool();
    const assistantNotificationTrackerRef = useRef(createAssistantNotificationTracker(notificationDiagnostics));
    const {
        runtime: assistantRuntime,
        setRuntime: setAssistantRuntime,
        checking: assistantChecking,
        setChecking: setAssistantChecking,
        refreshRuntime,
    } = useAssistantRuntime({
        defaultRuntime: DEFAULT_ASSISTANT_RUNTIME_STATE,
        projectId,
    });
    const assistantRuntimeReadyForCurrentProject = Boolean(
        assistantRuntime
        && assistantRuntime.health.status === 'ready'
        && (!projectId || assistantRuntime.projectId === projectId),
    );

    const buildAssistantIframeUrlForRuntime = useCallback((
        runtime?: AssistantRuntimeState | null,
        conversationStorePath?: string | null,
    ) => {
        const webBaseUrl = (runtime?.webBaseUrl || DEFAULT_ASSISTANT_WEB_BASE_URL).replace(/\/+$/g, '');
        const url = new URL(`${webBaseUrl}/`);
        const projectPath = runtime?.projectPath || '';
        if (projectPath) {
            url.searchParams.set('cwd', projectPath);
        }
        const preferredProvider = resolveAcpPromptClientProvider(preferredPromptClient);
        if (preferredProvider) {
            url.searchParams.set('provider', preferredProvider);
        }
        const normalizedPreferredModel = String(preferredModel || '').trim();
        if (normalizedPreferredModel) {
            url.searchParams.set('model', normalizedPreferredModel);
        }
        const normalizedConversationStorePath = String(conversationStorePath || '').trim();
        if (normalizedConversationStorePath) {
            url.searchParams.set('conversationStorePath', normalizedConversationStorePath);
            url.searchParams.set('restoreLastThread', '1');
        }
        return url.toString();
    }, [preferredModel, preferredPromptClient]);

    const buildImagePlaygroundUrlForRuntime = useCallback((runtime?: AssistantRuntimeState | null) => {
        const webBaseUrl = (runtime?.webBaseUrl || DEFAULT_ASSISTANT_WEB_BASE_URL).replace(/\/+$/g, '');
        const url = new URL(`${webBaseUrl}/image-playground`);
        const projectPath = runtime?.projectPath || '';
        if (projectPath) {
            url.searchParams.set('cwd', projectPath);
        }
        return url.toString();
    }, []);

    const assistantIframeUrl = useMemo(() => (
        buildAssistantIframeUrlForRuntime(assistantRuntime)
    ), [assistantRuntime, buildAssistantIframeUrlForRuntime]);

    const assistantFallbackIframeSrc = assistantIframeOverrideUrl || assistantIframeUrl;
    const assistantSupportsAcpContext = assistantPanelMode === 'general-ai';
    const assistantAcceptsImageRuntimeConfig = assistantPanelMode === 'general-ai' || assistantPanelMode === 'image-ai';
    const effectiveAssistantImageGenerationConfig = useMemo<AssistantImageGenerationConfig>(() => ({
        ...(assistantImageGenerationConfig || {}),
        ...(imageAiSaveDirectory ? { saveDirectory: imageAiSaveDirectory } : {}),
    }), [assistantImageGenerationConfig, imageAiSaveDirectory]);
    const assistantContextAppendAvailable = assistantSupportsAcpContext && assistantVisible;
    const assistantIframeSrc = assistantSupportsAcpContext
        ? assistantIframePool.activeEntry?.src || assistantFallbackIframeSrc
        : assistantFallbackIframeSrc;
    const assistantNonPooledIframeKey = `assistant-single:${assistantPanelMode || 'none'}:${assistantFallbackIframeSrc}`;
    const assistantIframeEntries = useMemo(() => {
        const pooledEntries = assistantIframePool.entries.map((entry) => ({
            key: entry.key,
            src: entry.src,
        }));
        if (assistantSupportsAcpContext || !assistantPanelMounted) {
            return pooledEntries;
        }
        return [
            ...pooledEntries,
            {
                key: assistantNonPooledIframeKey,
                src: assistantFallbackIframeSrc,
            },
        ];
    }, [
        assistantFallbackIframeSrc,
        assistantIframePool.entries,
        assistantNonPooledIframeKey,
        assistantPanelMounted,
        assistantSupportsAcpContext,
    ]);
    const assistantActiveIframeKey = assistantSupportsAcpContext
        ? assistantIframePool.activeKey
        : assistantPanelMounted ? assistantNonPooledIframeKey : null;

    useEffect(() => {
        assistantIframeCurrentUrlRef.current = assistantSupportsAcpContext
            ? assistantIframePool.activeEntry?.navigationUrl || assistantIframeSrc
            : assistantIframeSrc;
    }, [
        assistantIframePool.activeEntry?.navigationUrl,
        assistantIframeSrc,
        assistantSupportsAcpContext,
    ]);

    const handleAssistantActiveThreadChange = useCallback((threadId: string | null | undefined) => {
        if (assistantResourceThreadBindingSuppressedRef.current) {
            return;
        }
        const resourcePath = latestAssistantResourcePathRef.current;
        const conversationStorePath = latestAssistantConversationStorePathRef.current;
        if (!resourcePath) {
            if (conversationStorePath) {
                setAssistantStoreThreadId({
                    projectScope: projectId || assistantRuntime?.projectPath || '',
                    conversationStorePath,
                }, threadId);
            }
            return;
        }
        setAssistantResourceThreadId({
            projectScope: projectId || assistantRuntime?.projectPath || '',
            resourcePath,
        }, threadId);
        if (conversationStorePath) {
            setAssistantStoreThreadId({
                projectScope: projectId || assistantRuntime?.projectPath || '',
                conversationStorePath,
            }, threadId);
        }
    }, [
        assistantRuntime?.projectPath,
        projectId,
    ]);
    const assistantBridgeOptions = useMemo(() => ({
        onActiveThreadChanged: handleAssistantActiveThreadChange,
    }), [handleAssistantActiveThreadChange]);

    const {
        iframeRef: assistantIframeRef,
        iframeLoaded: assistantIframeLoaded,
        setIframeLoaded: setAssistantIframeLoaded,
        requestHostReadyWithRetry,
        subscribeEventsWithRetry: subscribeAssistantEventsWithRetry,
        syncContext: postAssistantContextToIframe,
        syncContextWithAck: postAssistantContextToIframeWithAck,
        syncContextWithRetry: postAssistantContextToIframeWithRetry,
        addContextItems: postAssistantContextItemsToIframe,
        syncThemeWithRetry: postAssistantThemeToIframeWithRetry,
        syncImageGenerationConfigWithAck: postAssistantImageGenerationConfigToIframeWithAck,
        syncImageGenerationConfigWithRetry: postAssistantImageGenerationConfigToIframeWithRetry,
        syncPreviewMcpConfigWithAck: postAssistantPreviewMcpConfigToIframeWithAck,
        syncPreviewMcpConfigWithRetry: postAssistantPreviewMcpConfigToIframeWithRetry,
        addImageAttachmentWithRetry,
        appendComposerTextWithRetry,
        submitPromptWithRetry,
        queryArtifactsWithRetry,
        waitForReady: waitForAssistantIframeReady,
    } = useAssistantBridge(assistantIframeSrc, assistantBridgeOptions);

    const handleAssistantIframeRef = useCallback((key: string, iframe: HTMLIFrameElement | null) => {
        assistantIframePool.registerIframe(key, iframe);
        if (key === assistantActiveIframeKey) {
            assistantIframeRef.current = iframe;
        }
    }, [assistantActiveIframeKey, assistantIframePool.registerIframe, assistantIframeRef]);

    useEffect(() => {
        assistantIframeBridgeRecoveryIdRef.current += 1;
        assistantIframeBridgeRecoveringRef.current = false;
    }, [assistantActiveIframeKey]);

    useEffect(() => {
        assistantIframeRef.current = assistantActiveIframeKey
            ? assistantIframePool.getIframe(assistantActiveIframeKey)
            : null;
        if (assistantSupportsAcpContext) {
            setAssistantIframeLoaded(assistantIframePool.activeEntry?.loaded || false);
        }
    }, [
        assistantActiveIframeKey,
        assistantIframePool.activeEntry?.loaded,
        assistantIframePool.getIframe,
        assistantIframeRef,
        assistantSupportsAcpContext,
        setAssistantIframeLoaded,
    ]);

    const resolveAssistantNavigationUrl = useCallback((href: string, sourceUrl?: string) => {
        const baseUrl = sourceUrl || assistantIframeCurrentUrlRef.current || assistantIframeSrc || assistantIframeUrl;
        try {
            const navigationUrl = new URL(href, baseUrl);
            const assistantUrl = new URL(baseUrl, window.location.origin);
            if (navigationUrl.origin !== assistantUrl.origin) {
                return '';
            }
            return navigationUrl.toString();
        } catch {
            return '';
        }
    }, [
        assistantIframeSrc,
        assistantIframeUrl,
    ]);

    useEffect(() => {
        const handleAssistantNavigationChanged = (event: MessageEvent) => {
            const iframeKey = assistantIframePool.findKeyByWindow(event.source);
            if (!iframeKey) {
                return;
            }
            const iframeEntry = assistantIframePool.entries.find((entry) => entry.key === iframeKey);
            if (!iframeEntry) {
                return;
            }
            let expectedOrigin = '';
            try {
                expectedOrigin = new URL(iframeEntry.src, window.location.origin).origin;
            } catch {
                return;
            }
            if (event.origin !== expectedOrigin) {
                return;
            }

            const navigation = readAcpNavigationChangedMessage(event.data);
            if (!navigation) {
                return;
            }

            const navigationUrl = resolveAssistantNavigationUrl(
                navigation.href,
                iframeEntry.navigationUrl || iframeEntry.src,
            );
            if (!navigationUrl) {
                return;
            }

            const navigationThreadId = navigation.threadId ?? resolveAcpNavigationThreadId(navigationUrl);
            assistantIframePool.markNavigation(
                iframeKey,
                navigationUrl,
                navigationThreadId,
            );
            if (iframeKey !== assistantIframePool.activeKey) {
                return;
            }

            assistantIframeCurrentUrlRef.current = navigationUrl;
            latestAssistantConversationStorePathRef.current = navigation.conversationStorePath
                || iframeEntry.conversationStorePath;
            latestAssistantNavigationThreadIdRef.current = navigationThreadId;
            handleAssistantActiveThreadChange(navigationThreadId);
        };

        window.addEventListener('message', handleAssistantNavigationChanged);
        return () => {
            window.removeEventListener('message', handleAssistantNavigationChanged);
        };
    }, [
        assistantIframePool,
        handleAssistantActiveThreadChange,
        resolveAssistantNavigationUrl,
    ]);

    useEffect(() => {
        const handleAssistantIframeRunEvent = (event: MessageEvent) => {
            const diagnosticEvent = readAcpEventDiagnosticDetails(event.data);
            const iframeKey = assistantIframePool.findKeyByWindow(event.source);
            if (!iframeKey) {
                if (diagnosticEvent) {
                    notificationDiagnostics.record('assistant.event.received', {
                        ...diagnosticEvent,
                        origin: event.origin || null,
                        expectedOrigin: null,
                        sourceMatched: false,
                        originMatched: false,
                        reason: 'unmatched-source',
                    });
                }
                return;
            }
            const iframeEntry = assistantIframePool.entries.find((entry) => entry.key === iframeKey);
            const iframeElement = assistantIframePool.getIframe(iframeKey);
            const iframeSrc = iframeEntry?.src || iframeElement?.src;
            if (!iframeSrc) {
                if (diagnosticEvent) {
                    notificationDiagnostics.record('assistant.event.received', {
                        ...diagnosticEvent,
                        origin: event.origin || null,
                        expectedOrigin: null,
                        sourceMatched: true,
                        originMatched: false,
                        reason: 'missing-iframe-source',
                    });
                }
                return;
            }
            let expectedOrigin = '';
            try {
                expectedOrigin = new URL(iframeSrc, window.location.origin).origin;
            } catch {
                if (diagnosticEvent) {
                    notificationDiagnostics.record('assistant.event.received', {
                        ...diagnosticEvent,
                        origin: event.origin || null,
                        expectedOrigin: null,
                        sourceMatched: true,
                        originMatched: false,
                        reason: 'invalid-iframe-origin',
                    });
                }
                return;
            }
            if (event.origin !== expectedOrigin) {
                if (diagnosticEvent) {
                    notificationDiagnostics.record('assistant.event.received', {
                        ...diagnosticEvent,
                        origin: event.origin || null,
                        expectedOrigin,
                        sourceMatched: true,
                        originMatched: false,
                        reason: 'origin-mismatch',
                    });
                }
                return;
            }
            const runEvent = readAssistantIframeRunEvent(event.data);
            if (diagnosticEvent) {
                notificationDiagnostics.record('assistant.event.received', {
                    ...diagnosticEvent,
                    origin: event.origin || null,
                    expectedOrigin,
                    sourceMatched: true,
                    originMatched: true,
                    runState: runEvent?.runState ?? null,
                    reason: 'accepted',
                });
            }
            if (runEvent) {
                assistantIframePool.markRunState(iframeKey, runEvent.runState, runEvent.threadId);
            }
            const imageSavedEvent = readAssistantImageSavedEvent(event.data);
            if (imageSavedEvent) {
                onImageSaved?.(imageSavedEvent);
            }
            const notificationIntent = assistantNotificationTrackerRef.current.consume(event.data);
            if (notificationIntent) {
                onAiNotification?.(notificationIntent);
            }
        };

        window.addEventListener('message', handleAssistantIframeRunEvent);
        return () => {
            window.removeEventListener('message', handleAssistantIframeRunEvent);
        };
    }, [assistantIframePool, onAiNotification, onImageSaved]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_ASSISTANT_WIDTH, String(Math.round(assistantPanelWidth)));
    }, [assistantPanelWidth]);

    useEffect(() => {
        const handleWindowResize = () => {
            setAssistantPanelMaxWidth(getAssistantPanelMaxWidth());
            setAssistantPanelWidthValue((currentWidth) => clampAssistantPanelWidth(currentWidth));
        };

        window.addEventListener('resize', handleWindowResize);
        return () => {
            window.removeEventListener('resize', handleWindowResize);
        };
    }, []);

    const syncAssistantContextToTargets = useCallback((
        context: AssistantContextV1,
        mode: 'replace' | 'append' = 'replace',
        options: {
            retryIframe?: boolean;
        } = {},
    ) => {
        latestAssistantSyncContextRef.current = context;

        if (assistantSupportsAcpContext && assistantVisible && assistantIframeLoaded && assistantIframeRef.current?.contentWindow) {
            if (options.retryIframe ?? mode === 'replace') {
                postAssistantContextToIframeWithRetry(context, mode);
            } else {
                postAssistantContextToIframe(context, mode);
            }
        }
    }, [
        assistantIframeLoaded,
        assistantIframeRef,
        assistantSupportsAcpContext,
        assistantVisible,
        postAssistantContextToIframe,
        postAssistantContextToIframeWithRetry,
    ]);

    const syncAssistantContextToIframeWithAck = useCallback(async (
        context: AssistantContextV1,
        mode: 'replace' | 'append' = 'replace',
        options: { requireLoaded?: boolean; requireVisible?: boolean } = {},
    ) => {
        latestAssistantSyncContextRef.current = context;
        const requireLoaded = options.requireLoaded !== false;
        const requireVisible = options.requireVisible !== false;
        if (
            !assistantSupportsAcpContext
            || (requireVisible && !assistantVisible)
            || (requireLoaded && !assistantIframeLoaded)
            || !assistantIframeRef.current?.contentWindow
        ) {
            return false;
        }

        await postAssistantContextToIframeWithAck(context, mode);
        return true;
    }, [
        assistantIframeLoaded,
        assistantIframeRef,
        assistantSupportsAcpContext,
        assistantVisible,
        postAssistantContextToIframeWithAck,
    ]);

    const syncAssistantImageGenerationConfigToIframe = useCallback((options: { requireLoaded?: boolean; requireVisible?: boolean; force?: boolean } = {}) => {
        const requireLoaded = options.requireLoaded !== false;
        const requireVisible = options.requireVisible !== false;
        if (
            !assistantAcceptsImageRuntimeConfig
            || (requireVisible && !assistantVisible)
            || (requireLoaded && !assistantIframeLoaded)
            || !assistantIframeRef.current?.contentWindow
        ) {
            return;
        }

        const imageConfigSignature = getAcpImageGenerationConfigSignature(effectiveAssistantImageGenerationConfig);
        if (!options.force && assistantImageGenerationConfigSyncSignatureRef.current === imageConfigSignature) {
            return;
        }

        assistantImageGenerationConfigSyncSignatureRef.current = imageConfigSignature;
        postAssistantImageGenerationConfigToIframeWithRetry(effectiveAssistantImageGenerationConfig);
    }, [
        assistantIframeLoaded,
        assistantIframeRef,
        assistantAcceptsImageRuntimeConfig,
        effectiveAssistantImageGenerationConfig,
        assistantVisible,
        postAssistantImageGenerationConfigToIframeWithRetry,
    ]);

    const syncAssistantImageGenerationConfigToIframeWithAck = useCallback(async (options: { requireLoaded?: boolean; requireVisible?: boolean; force?: boolean } = {}) => {
        const requireLoaded = options.requireLoaded !== false;
        const requireVisible = options.requireVisible !== false;
        if (
            !assistantAcceptsImageRuntimeConfig
            || (requireVisible && !assistantVisible)
            || (requireLoaded && !assistantIframeLoaded)
            || !assistantIframeRef.current?.contentWindow
        ) {
            return false;
        }

        const imageConfigSignature = getAcpImageGenerationConfigSignature(effectiveAssistantImageGenerationConfig);
        if (!options.force && assistantImageGenerationConfigSyncSignatureRef.current === imageConfigSignature) {
            return true;
        }

        await postAssistantImageGenerationConfigToIframeWithAck(effectiveAssistantImageGenerationConfig);
        assistantImageGenerationConfigSyncSignatureRef.current = imageConfigSignature;
        return true;
    }, [
        assistantIframeLoaded,
        assistantIframeRef,
        assistantAcceptsImageRuntimeConfig,
        effectiveAssistantImageGenerationConfig,
        assistantVisible,
        postAssistantImageGenerationConfigToIframeWithAck,
    ]);

    const postAssistantContextToWindowWithRetry = useCallback((
        targetWindow: Window | null,
        targetUrl: string,
        context: AssistantContextV1 | null | undefined,
    ) => {
        if (!targetWindow || !context) {
            return;
        }

        let targetOrigin = '*';
        try {
            targetOrigin = new URL(targetUrl, window.location.origin).origin;
        } catch {
            // Keep wildcard only for malformed URLs that still opened.
        }

        const postContext = () => {
            try {
                targetWindow.postMessage(buildAcpContextPostMessage(context, 'replace'), targetOrigin);
            } catch (error) {
                console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} child window context sync failed`, error);
            }
        };

        postContext();
        window.setTimeout(postContext, 160);
        window.setTimeout(postContext, 520);
        window.setTimeout(postContext, 1200);
    }, []);

    const assistantBaseContextV1 = useMemo<AssistantContextV1>(() => {
        const currentFile = resolveAssistantCurrentFile({
            selectedItem,
            activeTab,
            viewMode,
            contentMode,
            currentMarkdownResource,
            currentCanvas,
            currentTheme,
            currentDataTable,
        });
        const currentFilePath = getAssistantCurrentFilePath(currentFile);
        const currentFileDirectory = currentFilePath.replace(/\/[^/]+$/u, '');
        const currentMarkdownItem = currentMarkdownResource.item;
        const selectedResource = contentMode === 'doc' || contentMode === 'template'
            ? currentMarkdownItem
            : selectedItem;

        return {
            version: '1',
            systemContext: '',
            currentFile,
            selectedElements: [],
            extensions: {
                source: 'axhub-runtime',
                projectPath: assistantRuntime?.projectPath || '',
                viewMode,
                activeTab,
                contentMode,
                selectedItem: selectedResource
	                    ? {
	                        name: selectedResource.name,
	                        displayName: selectedResource.displayName,
	                        clientUrl: selectedResource.clientUrl,
	                        previewUrl: selectedResource.previewUrl,
	                        specUrl: selectedResource.specUrl,
	                    }
                    : null,
                paths: {
                    currentFilePath,
                    currentFileDirectory,
                },
                updatedAt: new Date().toISOString(),
            },
        };
    }, [
        activeTab,
        assistantRuntime?.projectPath,
        contentMode,
        currentCanvas,
        currentDataTable,
        currentMarkdownResource,
        currentTheme,
        selectedItem,
        viewMode,
    ]);

    const assistantContextV1 = useMemo<AssistantContextV1>(() => (
        mergeAssistantContextForActiveFile(assistantBaseContextV1, assistantExternalContext)
    ), [assistantBaseContextV1, assistantExternalContext]);

    const syncAssistantThemeToIframe = useCallback((options: { requireLoaded?: boolean; requireVisible?: boolean; force?: boolean } = {}) => {
        const requireLoaded = options.requireLoaded !== false;
        const requireVisible = options.requireVisible === true;
        if (
            !assistantAcceptsImageRuntimeConfig
            || (requireVisible && !assistantVisible)
            || (requireLoaded && !assistantIframeLoaded)
            || !assistantIframeRef.current?.contentWindow
        ) {
            return;
        }

        const themeSignature = isDarkMode ? 'dark' : 'light';
        if (!options.force && assistantThemeSyncSignatureRef.current === themeSignature) {
            return;
        }

        assistantThemeSyncSignatureRef.current = themeSignature;
        postAssistantThemeToIframeWithRetry(isDarkMode);
    }, [
        assistantAcceptsImageRuntimeConfig,
        assistantIframeLoaded,
        assistantIframeRef,
        assistantVisible,
        isDarkMode,
        postAssistantThemeToIframeWithRetry,
    ]);

    const syncAssistantPreviewMcpConfigToIframe = useCallback((options: { requireLoaded?: boolean; requireVisible?: boolean; force?: boolean; context?: AssistantContextV1 | null } = {}) => {
        const requireLoaded = options.requireLoaded !== false;
        const requireVisible = options.requireVisible !== false;
        if (
            !assistantSupportsAcpContext
            || (requireVisible && !assistantVisible)
            || (requireLoaded && !assistantIframeLoaded)
            || !assistantIframeRef.current?.contentWindow
        ) {
            return;
        }

        const previewMcpContext = options.context || assistantContextV1;
        const previewMcpConfig = getAssistantPreviewMcpRuntimeConfig(previewMcpContext, latestAssistantResourcePathRef.current);
        const previewMcpConfigSignature = getAcpPreviewMcpConfigSignature(previewMcpConfig);
        if (!options.force && assistantPreviewMcpConfigSyncSignatureRef.current === previewMcpConfigSignature) {
            return;
        }

        assistantPreviewMcpConfigSyncSignatureRef.current = previewMcpConfigSignature;
        postAssistantPreviewMcpConfigToIframeWithRetry(previewMcpConfig);
    }, [
        assistantContextV1,
        assistantIframeLoaded,
        assistantIframeRef,
        assistantSupportsAcpContext,
        assistantVisible,
        postAssistantPreviewMcpConfigToIframeWithRetry,
    ]);

    const syncAssistantPreviewMcpConfigToIframeWithAck = useCallback(async (options: { requireLoaded?: boolean; requireVisible?: boolean; force?: boolean; context?: AssistantContextV1 | null } = {}) => {
        const requireLoaded = options.requireLoaded !== false;
        const requireVisible = options.requireVisible !== false;
        if (
            !assistantSupportsAcpContext
            || (requireVisible && !assistantVisible)
            || (requireLoaded && !assistantIframeLoaded)
            || !assistantIframeRef.current?.contentWindow
        ) {
            return false;
        }

        const previewMcpContext = options.context || assistantContextV1;
        const previewMcpConfig = getAssistantPreviewMcpRuntimeConfig(previewMcpContext, latestAssistantResourcePathRef.current);
        const previewMcpConfigSignature = getAcpPreviewMcpConfigSignature(previewMcpConfig);
        if (!options.force && assistantPreviewMcpConfigSyncSignatureRef.current === previewMcpConfigSignature) {
            return true;
        }

        await postAssistantPreviewMcpConfigToIframeWithAck(previewMcpConfig);
        assistantPreviewMcpConfigSyncSignatureRef.current = previewMcpConfigSignature;
        return true;
    }, [
        assistantContextV1,
        assistantIframeLoaded,
        assistantIframeRef,
        assistantSupportsAcpContext,
        assistantVisible,
        postAssistantPreviewMcpConfigToIframeWithAck,
    ]);

    useEffect(() => {
        if (assistantResourceThreadBindingSuppressedRef.current) {
            return;
        }
        latestAssistantResourcePathRef.current = getAssistantContextCurrentFilePath(assistantContextV1);
        latestAssistantConversationStorePathRef.current = resolvePrototypeConversationStorePath({
            projectPath: assistantRuntime?.projectPath || '',
            resourcePath: latestAssistantResourcePathRef.current,
        });
    }, [assistantContextV1, assistantRuntime?.projectPath]);

    const buildAssistantContextForItem = useCallback((
        item: ItemData,
        options?: {
            viewMode?: ViewMode;
            activeTab?: TabType;
            externalContext?: AssistantContextV1 | null;
        },
    ): AssistantContextV1 => {
        const resolvedViewMode = options?.viewMode ?? 'demo';
        const resolvedActiveTab = options?.activeTab ?? activeTab;
        const currentFile = resolveAssistantCurrentFile({
            selectedItem: item,
            activeTab: resolvedActiveTab,
            viewMode: resolvedViewMode,
            contentMode: 'preview',
            currentMarkdownResource: { kind: 'doc', item: null },
        });
        const currentFilePath = getAssistantCurrentFilePath(currentFile);
        const currentFileDirectory = currentFilePath.replace(/\/[^/]+$/u, '');

        const baseContext: AssistantContextV1 = {
            version: '1',
            systemContext: '',
            currentFile,
            selectedElements: [],
            extensions: {
                source: 'axhub-runtime',
                projectPath: assistantRuntime?.projectPath || '',
                viewMode: resolvedViewMode,
                activeTab: resolvedActiveTab,
	                selectedItem: {
	                    name: item.name,
	                    displayName: item.displayName,
	                    clientUrl: item.clientUrl,
	                    previewUrl: item.previewUrl,
	                    specUrl: item.specUrl,
	                },
                paths: {
                    currentFilePath,
                    currentFileDirectory,
                },
                updatedAt: new Date().toISOString(),
            },
        };

        const externalContext = options?.externalContext;
        if (!externalContext) {
            return baseContext;
        }

        return mergeAssistantContextV1(baseContext, externalContext) ?? baseContext;
    }, [activeTab, assistantRuntime?.projectPath]);

    useEffect(() => {
        const nextCurrentFilePath = getAssistantContextCurrentFilePath(assistantBaseContextV1);
        const previousCurrentFilePath = assistantCurrentFilePathRef.current;
        const nextContext = buildAssistantCurrentFileSyncContext(assistantBaseContextV1);

        assistantCurrentFilePathRef.current = nextCurrentFilePath;

        if (!shouldSyncAssistantCurrentFile(previousCurrentFilePath, nextCurrentFilePath)) {
            return;
        }

        setAssistantExternalContext((prev) => {
            if (!prev) {
                return prev;
            }

            const normalizedCurrentFile = normalizeAssistantCurrentFileV1(assistantBaseContextV1.currentFile);
            if (getAssistantCurrentFilePath(prev.currentFile) !== normalizedCurrentFile.path) {
                return null;
            }
            if (
                prev.selectedElements.length === 0
            ) {
                return prev;
            }

            return {
                ...prev,
                currentFile: normalizedCurrentFile,
                selectedElements: [],
            };
        });

        syncAssistantContextToTargets(nextContext, 'replace', {
            retryIframe: true,
        });
    }, [
        assistantBaseContextV1,
        syncAssistantContextToTargets,
    ]);

    useEffect(() => {
        syncAssistantContextToTargets(assistantContextV1, 'replace');
    }, [assistantContextV1, syncAssistantContextToTargets]);

    useEffect(() => {
        syncAssistantThemeToIframe();
    }, [syncAssistantThemeToIframe]);

    useEffect(() => {
        if (assistantIframeBridgeRecoveringRef.current) {
            return;
        }
        syncAssistantImageGenerationConfigToIframe();
    }, [syncAssistantImageGenerationConfigToIframe]);

    useEffect(() => {
        if (assistantIframeBridgeRecoveringRef.current) {
            return;
        }
        syncAssistantPreviewMcpConfigToIframe();
    }, [syncAssistantPreviewMcpConfigToIframe]);

    const forceSyncAssistantRuntimeConfigToIframe = useCallback(() => {
        assistantThemeSyncSignatureRef.current = '';
        assistantImageGenerationConfigSyncSignatureRef.current = '';
        assistantPreviewMcpConfigSyncSignatureRef.current = '';
        syncAssistantThemeToIframe({
            requireLoaded: false,
            requireVisible: false,
            force: true,
        });
        void (async () => {
            try {
                const imageConfigAcked = await syncAssistantImageGenerationConfigToIframeWithAck({
                    requireLoaded: false,
                    requireVisible: false,
                    force: true,
                });
                const previewMcpAcked = await syncAssistantPreviewMcpConfigToIframeWithAck({
                    requireLoaded: false,
                    requireVisible: false,
                    force: true,
                });
                if (!imageConfigAcked || !previewMcpAcked) {
                    throw new Error('AI 助手 iframe 未就绪');
                }
            } catch (error) {
                console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} runtime config ack sync fell back to retry sync`, error);
                syncAssistantImageGenerationConfigToIframe({
                    requireLoaded: false,
                    requireVisible: false,
                    force: true,
                });
                syncAssistantPreviewMcpConfigToIframe({
                    requireLoaded: false,
                    requireVisible: false,
                    force: true,
                });
            }
        })();
    }, [
        syncAssistantThemeToIframe,
        syncAssistantImageGenerationConfigToIframe,
        syncAssistantImageGenerationConfigToIframeWithAck,
        syncAssistantPreviewMcpConfigToIframe,
        syncAssistantPreviewMcpConfigToIframeWithAck,
    ]);

    const recoverAssistantIframeBridge = useCallback(async () => {
        if (!assistantSupportsAcpContext || !assistantIframeRef.current?.contentWindow) {
            assistantIframeBridgeRecoveringRef.current = false;
            return false;
        }

        const recoveryId = assistantIframeBridgeRecoveryIdRef.current + 1;
        assistantIframeBridgeRecoveryIdRef.current = recoveryId;
        const recoveryIframe = assistantIframeRef.current;
        const recoveryIsCurrent = () => (
            assistantIframeBridgeRecoveryIdRef.current === recoveryId
            && assistantIframeRef.current === recoveryIframe
        );
        assistantIframeBridgeRecoveringRef.current = true;
        try {
            await requestHostReadyWithRetry();
            if (!recoveryIsCurrent()) return false;
            await subscribeAssistantEventsWithRetry(ACP_HOST_READY_EVENTS);
            if (!recoveryIsCurrent()) return false;
            syncAssistantThemeToIframe({ requireLoaded: false, requireVisible: false, force: true });
            await syncAssistantImageGenerationConfigToIframeWithAck({ requireLoaded: false, requireVisible: false, force: true });
            if (!recoveryIsCurrent()) return false;
            await syncAssistantPreviewMcpConfigToIframeWithAck({ requireLoaded: false, requireVisible: false, force: true });
            if (!recoveryIsCurrent()) return false;
            await syncAssistantContextToIframeWithAck(assistantContextV1, 'replace', {
                requireLoaded: false,
                requireVisible: false,
            });
            if (!recoveryIsCurrent()) return false;
            assistantIframeLoadSyncSignatureRef.current = JSON.stringify(assistantContextV1);
            return true;
        } catch (error) {
            if (!recoveryIsCurrent()) return false;
            console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} iframe refresh recovery fell back to retry sync`, error);
            syncAssistantImageGenerationConfigToIframe({
                requireLoaded: false,
                requireVisible: false,
                force: true,
            });
            syncAssistantThemeToIframe({
                requireLoaded: false,
                requireVisible: false,
                force: true,
            });
            syncAssistantPreviewMcpConfigToIframe({
                requireLoaded: false,
                requireVisible: false,
                force: true,
            });
            syncAssistantContextToTargets(assistantContextV1, 'replace', {
                retryIframe: true,
            });
            return false;
        } finally {
            if (recoveryIsCurrent()) {
                assistantIframeBridgeRecoveringRef.current = false;
            }
        }
    }, [
        assistantContextV1,
        assistantIframeRef,
        assistantSupportsAcpContext,
        requestHostReadyWithRetry,
        subscribeAssistantEventsWithRetry,
        syncAssistantContextToIframeWithAck,
        syncAssistantContextToTargets,
        syncAssistantImageGenerationConfigToIframe,
        syncAssistantImageGenerationConfigToIframeWithAck,
        syncAssistantPreviewMcpConfigToIframe,
        syncAssistantPreviewMcpConfigToIframeWithAck,
        syncAssistantThemeToIframe,
    ]);

    useEffect(() => {
        const activeIframeChanged = previousAssistantActiveIframeKeyRef.current !== assistantActiveIframeKey;
        previousAssistantActiveIframeKeyRef.current = assistantActiveIframeKey;
        if (!assistantSupportsAcpContext || !assistantActiveIframeKey) {
            return;
        }
        if (!activeIframeChanged || !assistantIframePool.activeEntry?.loaded) {
            return;
        }

        assistantIframeRef.current = assistantIframePool.getIframe(assistantActiveIframeKey);
        if (!assistantIframeRef.current?.contentWindow) {
            return;
        }
        assistantIframeLoadSyncSignatureRef.current = '';
        assistantThemeSyncSignatureRef.current = '';
        assistantImageGenerationConfigSyncSignatureRef.current = '';
        assistantPreviewMcpConfigSyncSignatureRef.current = '';
        setAssistantIframeLoaded(true);
        void recoverAssistantIframeBridge();
    }, [
        assistantActiveIframeKey,
        assistantIframePool.activeEntry?.loaded,
        assistantIframePool.getIframe,
        assistantIframeRef,
        assistantSupportsAcpContext,
        recoverAssistantIframeBridge,
        setAssistantIframeLoaded,
    ]);

    useEffect(() => {
        if (!assistantSupportsAcpContext || !assistantVisible || !assistantIframeLoaded) {
            return;
        }
        if (assistantIframeBridgeRecoveringRef.current) {
            return;
        }

        const contextSignature = JSON.stringify(assistantContextV1);
        if (assistantIframeLoadSyncSignatureRef.current === contextSignature) {
            return;
        }

        assistantIframeLoadSyncSignatureRef.current = contextSignature;
        syncAssistantContextToTargets(assistantContextV1, 'replace', {
            retryIframe: true,
        });
    }, [
        assistantContextV1,
        assistantIframeLoaded,
        assistantSupportsAcpContext,
        assistantVisible,
        syncAssistantContextToTargets,
    ]);

    const resolveAssistantThreadLandingUrl = useCallback((
        sourceUrl: string,
        targetPath?: string,
        runtimeOverride?: AssistantRuntimeState | null,
    ): ResolvedAssistantUrl => {
        const resourceThreadStoragePath = String(targetPath || '').trim();
        const runtimeForUrl = runtimeOverride || assistantRuntime;
        const conversationStorePath = resolvePrototypeConversationStorePath({
            projectPath: runtimeForUrl?.projectPath || '',
            resourcePath: targetPath,
        });
        const sourceUrlWithStore = (() => {
            if (!conversationStorePath) {
                return sourceUrl;
            }
            try {
                const parsedUrl = new URL(sourceUrl, window.location.origin);
                parsedUrl.searchParams.set('conversationStorePath', conversationStorePath);
                parsedUrl.searchParams.set('restoreLastThread', '1');
                return parsedUrl.toString();
            } catch {
                return sourceUrl;
            }
        })();
        if (!targetPath) {
            return {
                url: sourceUrlWithStore,
                resourceThreadStoragePath,
                conversationStorePath,
            };
        }

        const projectScope = projectId || runtimeForUrl?.projectPath || '';
        const fallbackResourcePath = resolveAssistantFallbackResourcePathFromUrl(targetPath);
        const storeThreadId = getAssistantStoreThreadId({
            projectScope,
            conversationStorePath,
        });
        const threadId = getAssistantResourceThreadId({
            projectScope,
            resourcePath: targetPath,
        });
        const resourceFallbackThreadId = getAssistantResourceThreadIdWithFallback({
            projectScope,
            resourcePath: targetPath,
            fallbackResourcePath,
        });
        const resolvedThreadId = storeThreadId || threadId || resourceFallbackThreadId;
        if (!resolvedThreadId) {
            return {
                url: sourceUrlWithStore,
                resourceThreadStoragePath,
                conversationStorePath,
            };
        }
        const resolvedResourceThreadStoragePath = threadId || storeThreadId
            ? resourceThreadStoragePath
            : fallbackResourcePath || resourceThreadStoragePath;

        try {
            const parsedUrl = new URL(sourceUrlWithStore, window.location.origin);
            parsedUrl.pathname = `/thread/${encodeURIComponent(resolvedThreadId)}`;
            return {
                url: parsedUrl.toString(),
                resourceThreadStoragePath: resolvedResourceThreadStoragePath,
                conversationStorePath,
            };
        } catch {
            return {
                url: sourceUrlWithStore,
                resourceThreadStoragePath,
                conversationStorePath,
            };
        }
    }, [
        assistantRuntime,
        projectId,
    ]);

    const resolveAssistantUrl = useCallback((
        targetUrl?: string,
        targetPath?: string,
        runtimeOverride?: AssistantRuntimeState | null,
    ) => {
        const runtimeForUrl = runtimeOverride || assistantRuntime;
        const conversationStorePath = resolvePrototypeConversationStorePath({
            projectPath: runtimeForUrl?.projectPath || '',
            resourcePath: targetPath,
        });
        const sourceUrl = targetUrl || buildAssistantIframeUrlForRuntime(runtimeForUrl, conversationStorePath);
        let nextUrl = sourceUrl;

        try {
            const parsedUrl = new URL(sourceUrl, window.location.origin);
            removeLegacyAssistantOpenParams(parsedUrl);
            const runtimeProjectPath = runtimeForUrl?.projectPath || '';

            if (!parsedUrl.searchParams.get('cwd') && runtimeProjectPath) {
                parsedUrl.searchParams.set('cwd', runtimeProjectPath);
            }

            nextUrl = parsedUrl.toString();
        } catch {
            nextUrl = sourceUrl;
        }

        return resolveAssistantThreadLandingUrl(nextUrl, targetPath, runtimeForUrl);
    }, [
        assistantRuntime,
        buildAssistantIframeUrlForRuntime,
        resolveAssistantThreadLandingUrl,
    ]);

    const buildGeneralAssistantIframeDescriptor = useCallback((
        resolvedAssistantUrl: ResolvedAssistantUrl,
        runtimeOverride?: AssistantRuntimeState | null,
    ) => {
        const runtimeForUrl = runtimeOverride || assistantRuntime;
        const webBaseUrl = (runtimeForUrl?.webBaseUrl || DEFAULT_ASSISTANT_WEB_BASE_URL).replace(/\/+$/g, '');
        const workspacePath = runtimeForUrl?.projectPath || '';
        const assistantIframeKey = buildAssistantIframePoolKey({
            webBaseUrl,
            workspacePath,
            conversationStorePath: resolvedAssistantUrl.conversationStorePath,
            panelMode: 'general-ai',
        });
        return {
            key: assistantIframeKey,
            src: resolvedAssistantUrl.url,
            projectId: runtimeForUrl?.projectId || projectId || '',
            webBaseUrl,
            workspacePath,
            conversationStorePath: resolvedAssistantUrl.conversationStorePath,
            panelMode: 'general-ai' as const,
            navigationUrl: resolvedAssistantUrl.url,
            navigationThreadId: resolveAcpNavigationThreadId(resolvedAssistantUrl.url),
        };
    }, [assistantRuntime, projectId]);

    useEffect(() => {
        if (!assistantPanelMounted || !assistantVisible || !assistantSupportsAcpContext) {
            return;
        }
        if (assistantPanelMode !== 'general-ai') {
            return;
        }
        const targetProjectId = projectId || '';
        if (previousAssistantProjectIdRef.current !== targetProjectId) {
            return;
        }
        if (!assistantRuntimeReadyForCurrentProject) {
            return;
        }

        const targetPath = getAssistantContextCurrentFilePath(assistantContextV1);
        const resolvedAssistantUrl = resolveAssistantUrl(undefined, targetPath);
        const assistantIframeDescriptor = buildGeneralAssistantIframeDescriptor(resolvedAssistantUrl);
        const targetPoolEntry = assistantIframePool.entries.find(
            (entry) => entry.key === assistantIframeDescriptor.key,
        );
        const signature = `${targetPath}::${resolvedAssistantUrl.url}`;
        if (assistantIframeResourceSwitchSignatureRef.current === signature) {
            return;
        }

        assistantIframeResourceSwitchSignatureRef.current = signature;
        latestAssistantResourcePathRef.current = resolvedAssistantUrl.resourceThreadStoragePath;
        latestAssistantConversationStorePathRef.current = targetPoolEntry?.conversationStorePath
            || resolvedAssistantUrl.conversationStorePath;
        latestAssistantNavigationThreadIdRef.current = targetPoolEntry
            ? targetPoolEntry.navigationThreadId
            : resolveAcpNavigationThreadId(resolvedAssistantUrl.url);
        assistantIframePool.activate(assistantIframeDescriptor);
        const activeTargetAlreadyMounted = assistantIframePool.activeKey === assistantIframeDescriptor.key;
        assistantIframeCurrentUrlRef.current = targetPoolEntry?.navigationUrl || resolvedAssistantUrl.url;
        setAssistantIframeLoaded(activeTargetAlreadyMounted
            ? assistantIframePool.activeEntry?.loaded || false
            : false);
        if (!targetPoolEntry) {
            setAssistantIframeOverrideUrl(resolvedAssistantUrl.url);
        }
    }, [
        assistantContextV1,
        assistantIframePool,
        assistantPanelMode,
        assistantPanelMounted,
        assistantRuntime?.projectId,
        assistantRuntimeReadyForCurrentProject,
        assistantSupportsAcpContext,
        buildGeneralAssistantIframeDescriptor,
        assistantVisible,
        projectId,
        resolveAssistantUrl,
        setAssistantIframeLoaded,
    ]);

    const openAssistantWithUrl = useCallback((
        targetUrl?: string,
        targetPath?: string,
        runtimeOverride?: AssistantRuntimeState | null,
        options: Pick<EnsureAssistantOpenOptions, 'suppressResourceThreadBinding' | 'panelMode'> = {},
    ) => {
        assistantResourceThreadBindingSuppressedRef.current = options.suppressResourceThreadBinding === true;
        const resolvedAssistantUrl = resolveAssistantUrl(targetUrl, targetPath, runtimeOverride);
        latestAssistantResourcePathRef.current = options.suppressResourceThreadBinding === true
            ? ''
            : resolvedAssistantUrl.resourceThreadStoragePath;
        const nextUrl = resolvedAssistantUrl.url;
        const nextPanelMode = options.panelMode || assistantPanelMode || 'general-ai';
        const assistantIframeDescriptor = nextPanelMode === 'general-ai'
            ? buildGeneralAssistantIframeDescriptor(resolvedAssistantUrl, runtimeOverride)
            : null;
        const targetPoolEntry = assistantIframeDescriptor
            ? assistantIframePool.entries.find((entry) => entry.key === assistantIframeDescriptor.key)
            : null;
        const targetNavigationUrl = targetPoolEntry?.navigationUrl || nextUrl;
        latestAssistantConversationStorePathRef.current = options.suppressResourceThreadBinding === true
            ? ''
            : targetPoolEntry?.conversationStorePath || resolvedAssistantUrl.conversationStorePath;
        assistantIframeCurrentUrlRef.current = targetNavigationUrl;
        assistantIframeResourceSwitchSignatureRef.current = `${latestAssistantResourcePathRef.current}::${nextUrl}`;
        latestAssistantNavigationThreadIdRef.current = targetPoolEntry
            ? targetPoolEntry.navigationThreadId
            : resolveAcpNavigationThreadId(nextUrl);

        flushSync(() => {
            setAssistantPanelMode(nextPanelMode);
            setAssistantPanelMounted(true);
            setAssistantVisible(true);
            if (assistantIframeDescriptor) {
                assistantIframePool.activate({
                    ...assistantIframeDescriptor,
                });
                setAssistantIframeLoaded(targetPoolEntry?.loaded || false);
                if (!targetPoolEntry) {
                    setAssistantIframeOverrideUrl(nextUrl);
                }
            } else {
                assistantIframePool.deactivate();
                setAssistantIframeLoaded(false);
                setAssistantIframeOverrideUrl(nextUrl);
            }
        });
    }, [
        assistantIframePool,
        assistantPanelMode,
        buildGeneralAssistantIframeDescriptor,
        resolveAssistantUrl,
        setAssistantIframeLoaded,
    ]);

    const openRawUrlInAssistantPanel = useCallback((url: string) => {
        const nextUrl = String(url || '').trim();
        if (!nextUrl) {
            return false;
        }

        assistantIframeCurrentUrlRef.current = nextUrl;
        latestAssistantConversationStorePathRef.current = '';
        assistantIframeResourceSwitchSignatureRef.current = '';
        latestAssistantNavigationThreadIdRef.current = undefined;
        assistantIframePool.deactivate();
        setAssistantPanelMode('external');
        setAssistantPanelMounted(true);
        setAssistantVisible(true);
        setAssistantIframeLoaded(false);
        setAssistantIframeOverrideUrl(nextUrl);
        return true;
    }, [assistantIframePool, setAssistantIframeLoaded]);

    const openAssistantInNewWindowWithUrl = useCallback((
        targetUrl?: string,
        targetPath?: string,
        runtimeOverride?: AssistantRuntimeState | null,
        contextOverride?: AssistantContextV1 | null,
    ) => {
        assistantResourceThreadBindingSuppressedRef.current = false;
        const resolvedAssistantUrl = resolveAssistantUrl(targetUrl, targetPath, runtimeOverride);
        latestAssistantResourcePathRef.current = resolvedAssistantUrl.resourceThreadStoragePath;
        latestAssistantConversationStorePathRef.current = resolvedAssistantUrl.conversationStorePath;
        const nextUrl = resolvedAssistantUrl.url;
        assistantIframeCurrentUrlRef.current = nextUrl;
        assistantIframeResourceSwitchSignatureRef.current = `${latestAssistantResourcePathRef.current}::${nextUrl}`;
        latestAssistantNavigationThreadIdRef.current = resolveAcpNavigationThreadId(nextUrl);
        const windowFeatures = contextOverride ? undefined : 'noopener,noreferrer';
        const childWindow = window.open(nextUrl, '_blank', windowFeatures);
        postAssistantContextToWindowWithRetry(childWindow, nextUrl, contextOverride);
    }, [postAssistantContextToWindowWithRetry, resolveAssistantUrl]);

    const openAISettingsForAssistantRuntime = useCallback((
        runtime?: AssistantRuntimeState | null,
        message?: string,
    ) => {
        onOpenAISettings?.(runtime, message);
    }, [onOpenAISettings]);

    const waitForAssistantRuntimeReady = useCallback(async (runtime: AssistantRuntimeState): Promise<AssistantRuntimeState> => {
        if (runtime.health.status !== 'runtime_unreachable') {
            return runtime;
        }

        let latestRuntime = runtime;
        const maxAttempts = 5;
        const intervalMs = 700;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));

            try {
                const nextRuntime = await refreshRuntime({ autoStart: false }) as AssistantRuntimeState;
                latestRuntime = nextRuntime;
                setAssistantRuntime(nextRuntime);

                if (nextRuntime.health.status === 'ready') {
                    return nextRuntime;
                }

                if (
                    nextRuntime.health.status === 'missing_cli'
                    || nextRuntime.health.status === 'needs_update'
                    || nextRuntime.health.status === 'cli_error'
                ) {
                    return nextRuntime;
                }
            } catch (pollError) {
                console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} runtime poll failed`, pollError);
                break;
            }
        }

        return latestRuntime;
    }, [refreshRuntime]);

    const ensureAssistantReadyThenOpen = useCallback(async (
        trigger: AssistantTriggerSource,
        targetUrl?: string,
        targetPath?: string,
        openTarget: 'iframe' | 'window' = 'iframe',
        contextOverride?: AssistantContextV1 | null,
        options: EnsureAssistantOpenOptions = {},
    ): Promise<boolean> => {
        if (assistantChecking && trigger === 'button') {
            return false;
        }

        const requestId = assistantOpenRequestIdRef.current + 1;
        assistantOpenRequestIdRef.current = requestId;
        const requestedProjectId = projectId || '';
        setAssistantChecking(true);
        const hideLoading = options.loadingText === false
            ? () => undefined
            : messageApi.loading(options.loadingText || '正在打开 AI...', 0);
        const shouldOpenSettingsOnFailure = options.openSettingsOnFailure !== false;
        console.info(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} begin runtime check`, {
            trigger,
            openTarget,
            targetUrl: targetUrl || null,
            targetPath: targetPath || null,
        });

        try {
            const runtime = await apiService.getAssistantRuntime({
                autoStart: true,
                projectId: requestedProjectId,
            }) as AssistantRuntimeState;
            if (requestId !== assistantOpenRequestIdRef.current
                || currentAssistantProjectIdRef.current !== requestedProjectId
                || (requestedProjectId && runtime.projectId !== requestedProjectId)) {
                console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} ignored stale runtime response`, {
                    expectedProjectId: requestedProjectId || null,
                    receivedProjectId: runtime.projectId || null,
                });
                return false;
            }
            setAssistantRuntime(runtime);
            console.info(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} runtime response`, {
                status: runtime.health.status,
                message: runtime.health.message,
                source: runtime.source,
                commandSource: runtime.health.commandSource,
                webBaseUrl: runtime.webBaseUrl,
                apiBaseUrl: runtime.apiBaseUrl,
            });

            const resolvedRuntime = await waitForAssistantRuntimeReady(runtime);
            if (requestId !== assistantOpenRequestIdRef.current
                || currentAssistantProjectIdRef.current !== requestedProjectId) {
                return false;
            }

            if (resolvedRuntime.health.status === 'ready') {
                const resolvedTargetUrl = options.panelMode === 'image-ai'
                    ? buildImagePlaygroundUrlForRuntime(resolvedRuntime)
                    : targetUrl;
                if (openTarget === 'window') {
                    openAssistantInNewWindowWithUrl(resolvedTargetUrl, targetPath, resolvedRuntime, contextOverride);
                } else {
                    openAssistantWithUrl(resolvedTargetUrl, targetPath, resolvedRuntime, {
                        suppressResourceThreadBinding: options.suppressResourceThreadBinding,
                        panelMode: options.panelMode,
                    });
                }
                return true;
            }

            console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} runtime not ready`, {
                status: resolvedRuntime.health.status,
                message: resolvedRuntime.health.message,
                hints: resolvedRuntime.health.hints,
            });
            if (shouldOpenSettingsOnFailure) {
                openAISettingsForAssistantRuntime(resolvedRuntime, resolvedRuntime.health.message || '本地 ACP 服务未链接');
                messageApi.warning('已打开 AI 设置，请检查本地 ACP 服务');
            }
        } catch (error: any) {
            if (requestId !== assistantOpenRequestIdRef.current
                || currentAssistantProjectIdRef.current !== requestedProjectId) {
                return false;
            }
            const runtime = assistantRuntime || DEFAULT_ASSISTANT_RUNTIME_STATE;
            setAssistantRuntime(runtime);
            console.error(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} runtime check failed`, error);
            if (shouldOpenSettingsOnFailure) {
                messageApi.error(error?.message || '检测 AI 助手状态失败');
                openAISettingsForAssistantRuntime(runtime, error?.message || '检测 AI 助手状态失败');
                messageApi.warning('已打开 AI 设置，请检查本地 ACP 服务');
            }
        } finally {
            hideLoading();
            if (requestId === assistantOpenRequestIdRef.current) {
                setAssistantChecking(false);
            }
        }

        return false;
    }, [
        assistantChecking,
        assistantRuntime,
        buildImagePlaygroundUrlForRuntime,
        messageApi,
        openAssistantInNewWindowWithUrl,
        openAssistantWithUrl,
        projectId,
        setAssistantChecking,
        openAISettingsForAssistantRuntime,
        waitForAssistantRuntimeReady,
        DEFAULT_ASSISTANT_RUNTIME_STATE,
    ]);

    useEffect(() => {
        const nextProjectId = projectId || '';
        if (previousAssistantProjectIdRef.current === nextProjectId) {
            return;
        }

        previousAssistantProjectIdRef.current = nextProjectId;
        const reopenMountedAssistantForProjectChange = assistantPanelMounted
            && assistantVisible
            && assistantSupportsAcpContext;
        if (!assistantPanelMounted || !assistantSupportsAcpContext) {
            return;
        }

        assistantResourceThreadBindingSuppressedRef.current = false;
        assistantIframeCurrentUrlRef.current = '';
        assistantIframeResourceSwitchSignatureRef.current = '';
        latestAssistantResourcePathRef.current = getAssistantContextCurrentFilePath(assistantContextV1);
        latestAssistantConversationStorePathRef.current = resolvePrototypeConversationStorePath({
            projectPath: assistantRuntime?.projectPath || '',
            resourcePath: latestAssistantResourcePathRef.current,
        });
        latestAssistantNavigationThreadIdRef.current = undefined;
        assistantIframeLoadSyncSignatureRef.current = '';
        assistantThemeSyncSignatureRef.current = '';
        assistantImageGenerationConfigSyncSignatureRef.current = '';
        assistantPreviewMcpConfigSyncSignatureRef.current = '';
        setAssistantIframeLoaded(false);
        assistantIframePool.deactivate();

        if (!reopenMountedAssistantForProjectChange) {
            return;
        }

        void ensureAssistantReadyThenOpen('event', undefined, getAssistantContextCurrentFilePath(assistantContextV1), 'iframe', null, {
            panelMode: 'general-ai',
            loadingText: false,
            openSettingsOnFailure: false,
        });
    }, [
        assistantContextV1,
        assistantIframePool,
        assistantPanelMounted,
        assistantSupportsAcpContext,
        assistantVisible,
        ensureAssistantReadyThenOpen,
        projectId,
        setAssistantIframeLoaded,
    ]);

    const syncAssistantCanvasComments = useCallback((annotations: CanvasElementContextInfo[], currentFilePath: string) => {
        const nextContext = buildAssistantContextWithCanvasComments(
            assistantBaseContextV1,
            annotations,
            currentFilePath,
        );
        const nextSignature = getAssistantCanvasCommentsSignature(nextContext);
        if (assistantContextCommentsSignatureRef.current === nextSignature) {
            return;
        }

        assistantContextCommentsSignatureRef.current = nextSignature;
        setAssistantExternalContext(nextContext);
        syncAssistantContextToTargets(nextContext, 'replace', {
            retryIframe: true,
        });
    }, [
        assistantBaseContextV1,
        syncAssistantContextToTargets,
    ]);

    const addContextItems = useCallback((items: AcpContextItem[]) => {
        if (!assistantContextAppendAvailable || !Array.isArray(items) || items.length === 0) {
            return false;
        }

        const postItems = () => {
            postAssistantContextItemsToIframe(items);
        };

        if (assistantIframeLoaded && assistantIframeRef.current?.contentWindow) {
            postItems();
            return true;
        }

        void waitForAssistantIframeReady().then((ready) => {
            if (ready) {
                postItems();
            }
        });
        return true;
    }, [
        assistantContextAppendAvailable,
        assistantIframeLoaded,
        assistantIframeRef,
        postAssistantContextItemsToIframe,
        waitForAssistantIframeReady,
    ]);

    const addImageAttachment = useCallback(async (attachment: AssistantImageAttachmentPayload) => {
        if (!assistantSupportsAcpContext || !assistantVisible) {
            messageApi.warning('请先打开 AI 助手');
            return false;
        }
        try {
            await addImageAttachmentWithRetry(attachment);
            return true;
        } catch (error: any) {
            messageApi.error(error?.message || '添加图片到 AI 失败');
            return false;
        }
    }, [
        addImageAttachmentWithRetry,
        assistantSupportsAcpContext,
        assistantVisible,
        messageApi,
    ]);

    const appendComposerText = useCallback(async (text: string) => {
        if (!assistantSupportsAcpContext || !assistantVisible) {
            messageApi.warning('请先打开 AI 助手');
            return false;
        }
        try {
            await appendComposerTextWithRetry(text);
            return true;
        } catch (error: any) {
            messageApi.error(error?.message || '填充 AI 提示词失败');
            return false;
        }
    }, [
        appendComposerTextWithRetry,
        assistantSupportsAcpContext,
        assistantVisible,
        messageApi,
    ]);

    const addCanvasElementsToAssistantContext = useCallback((
        elements: CanvasElementContextInfo[],
        currentFilePath: string,
    ) => {
        if (!assistantContextAppendAvailable || !Array.isArray(elements) || elements.length === 0) {
            return false;
        }

        return addContextItems(buildAssistantContextItemsFromCanvasElements(elements, currentFilePath));
    }, [
        addContextItems,
        assistantContextAppendAvailable,
    ]);

    const handleToggleAssistant = useCallback(() => {
        if (assistantVisible) {
            setAssistantVisible(false);
            return;
        }

        if (assistantPanelMounted) {
            if (!assistantSupportsAcpContext) {
                setAssistantVisible(true);
                forceSyncAssistantRuntimeConfigToIframe();
                return;
            }
            if (!assistantRuntimeReadyForCurrentProject) {
                void ensureAssistantReadyThenOpen('button', undefined, getAssistantContextCurrentFilePath(assistantContextV1), 'iframe', null, {
                    panelMode: 'general-ai',
                });
                return;
            }

            const currentTargetPath = getAssistantContextCurrentFilePath(assistantContextV1);
            const currentTargetDescriptor = buildGeneralAssistantIframeDescriptor(
                resolveAssistantUrl(undefined, currentTargetPath, assistantRuntime),
                assistantRuntime,
            );
            if (assistantIframePool.activeKey !== currentTargetDescriptor.key) {
                openAssistantWithUrl(undefined, currentTargetPath, assistantRuntime, { panelMode: 'general-ai' });
                return;
            }
            setAssistantVisible(true);
            forceSyncAssistantRuntimeConfigToIframe();
            return;
        }

        void ensureAssistantReadyThenOpen(
            'button',
            undefined,
            getAssistantContextCurrentFilePath(assistantContextV1),
            'iframe',
            null,
            {
                panelMode: 'general-ai',
            },
        );
    }, [
        assistantContextV1,
        assistantIframePool,
        assistantRuntime,
        assistantRuntimeReadyForCurrentProject,
        buildGeneralAssistantIframeDescriptor,
        assistantPanelMounted,
        assistantVisible,
        ensureAssistantReadyThenOpen,
        forceSyncAssistantRuntimeConfigToIframe,
        openAssistantWithUrl,
        resolveAssistantUrl,
    ]);

    const handleOpenAcpWebAgent = useCallback((targetPath?: string, _provider?: AcpProvider) => {
        void ensureAssistantReadyThenOpen('button', undefined, targetPath, 'iframe', null, {
            panelMode: 'general-ai',
        });
    }, [ensureAssistantReadyThenOpen]);

    const openImageAiPanel = useCallback(() => {
        const imagePanelWidth = getAssistantPanelMaxWidth();
        setAssistantPanelMaxWidth(imagePanelWidth);
        setAssistantPanelWidthValue(getAssistantPanelMaxWidth());
        void ensureAssistantReadyThenOpen('button', undefined, undefined, 'iframe', null, {
            panelMode: 'image-ai',
            suppressResourceThreadBinding: true,
        });
    }, [
        ensureAssistantReadyThenOpen,
    ]);

    const handleOpenImageAiPanelInNewWindow = useCallback(() => {
        void ensureAssistantReadyThenOpen('button', undefined, undefined, 'window', null, {
            panelMode: 'image-ai',
            suppressResourceThreadBinding: true,
        });
    }, [
        ensureAssistantReadyThenOpen,
    ]);

    const hideAssistantPanelTemporarily = useCallback(() => {
        setAssistantVisible(false);
    }, []);

    const restoreAssistantPanel = useCallback((targetPath?: string, panelMode: AssistantAiPanelMode = assistantPanelMode) => {
        const restoreMode = panelMode === 'image-ai' || panelMode === 'general-ai'
            ? panelMode
            : 'general-ai';
        const canReuseMountedAssistant = restoreMode !== 'general-ai'
            || assistantRuntimeReadyForCurrentProject;
        if (assistantPanelMounted && canReuseMountedAssistant) {
            const nextTargetUrl = restoreMode === 'image-ai'
                ? buildImagePlaygroundUrlForRuntime(assistantRuntime)
                : buildAssistantIframeUrlForRuntime(assistantRuntime);
            const nextGeneralIframeDescriptor = restoreMode === 'general-ai'
                ? buildGeneralAssistantIframeDescriptor(
                    resolveAssistantUrl(nextTargetUrl, targetPath, assistantRuntime),
                    assistantRuntime,
                )
                : null;
            const shouldReloadForRestoreMode = restoreMode !== assistantPanelMode
                || (restoreMode === 'image-ai' && assistantIframeOverrideUrl !== nextTargetUrl)
                || (nextGeneralIframeDescriptor !== null
                    && assistantIframePool.activeKey !== nextGeneralIframeDescriptor.key);
            if (shouldReloadForRestoreMode) {
                openAssistantWithUrl(nextTargetUrl, targetPath, assistantRuntime, {
                    panelMode: restoreMode,
                    suppressResourceThreadBinding: restoreMode === 'image-ai',
                });
                return true;
            }
            if (assistantVisible) {
                return true;
            }
            setAssistantVisible(true);
            forceSyncAssistantRuntimeConfigToIframe();
            return true;
        }
        return ensureAssistantReadyThenOpen('event', undefined, targetPath, 'iframe', null, {
            panelMode: restoreMode,
            loadingText: false,
            openSettingsOnFailure: false,
            suppressResourceThreadBinding: restoreMode === 'image-ai',
        });
    }, [
        assistantPanelMounted,
        assistantPanelMode,
        assistantIframePool.activeKey,
        assistantIframeOverrideUrl,
        assistantRuntime,
        assistantRuntimeReadyForCurrentProject,
        assistantVisible,
        buildGeneralAssistantIframeDescriptor,
        buildAssistantIframeUrlForRuntime,
        buildImagePlaygroundUrlForRuntime,
        ensureAssistantReadyThenOpen,
        forceSyncAssistantRuntimeConfigToIframe,
        openAssistantWithUrl,
        resolveAssistantUrl,
    ]);

    useEffect(() => {
        const handleOpenAssistantUrl = (event: Event) => {
            const customEvent = event as CustomEvent<OpenAssistantUrlEventDetail>;
            const detail = customEvent.detail;
            const targetUrl = detail?.url;
            if (!targetUrl || typeof targetUrl !== 'string') {
                return;
            }

            void ensureAssistantReadyThenOpen('event', targetUrl, detail?.targetPath, 'iframe', null, {
                panelMode: 'general-ai',
            });
            customEvent.preventDefault();
        };

        window.addEventListener(ASSISTANT_OPEN_URL_EVENT, handleOpenAssistantUrl as EventListener);
        return () => {
            window.removeEventListener(ASSISTANT_OPEN_URL_EVENT, handleOpenAssistantUrl as EventListener);
        };
    }, [ensureAssistantReadyThenOpen]);

    const clearAssistantSelectedElementsOnExit = useCallback(() => {
        setAssistantExternalContext((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                selectedElements: [],
            };
        });

        syncAssistantContextToTargets({
            version: assistantContextV1.version,
            systemContext: assistantContextV1.systemContext,
            currentFile: assistantContextV1.currentFile,
            selectedElements: [],
            extensions: assistantContextV1.extensions,
        }, 'replace', {
            retryIframe: true,
        });
    }, [
        assistantContextV1,
        syncAssistantContextToTargets,
    ]);

    const handleOpenAssistantInNewWindowNoContext = useCallback((targetPath?: string) => {
        void ensureAssistantReadyThenOpen('button', assistantIframeUrl, targetPath, 'window', null, {
            panelMode: 'general-ai',
        });
    }, [assistantIframeUrl, ensureAssistantReadyThenOpen]);

    const handleOpenAssistantWithItemContext = useCallback((item: ItemData) => {
        const itemContext = buildAssistantContextForItem(item, {
            viewMode: 'demo',
            activeTab: 'prototypes',
        });
        const targetPath = getAssistantCurrentFilePath(itemContext.currentFile);
        setAssistantExternalContext(itemContext);
        latestAssistantSyncContextRef.current = itemContext;

        try {
            const url = new URL(assistantIframeUrl);
            removeLegacyAssistantOpenParams(url);
            void ensureAssistantReadyThenOpen('button', url.toString(), targetPath, 'window', itemContext, {
                panelMode: 'general-ai',
            });
        } catch {
            void ensureAssistantReadyThenOpen('button', assistantIframeUrl, targetPath, 'window', itemContext, {
                panelMode: 'general-ai',
            });
        }
    }, [assistantIframeUrl, buildAssistantContextForItem, ensureAssistantReadyThenOpen]);

    const openAssistantWithContext = useCallback(async (context: AssistantContextV1 | null) => {
        if (context) {
            setAssistantExternalContext(context);
            latestAssistantSyncContextRef.current = context;
        }
        const targetPath = context ? getAssistantContextCurrentFilePath(context) : undefined;
        return ensureAssistantReadyThenOpen('button', assistantIframeUrl, targetPath, 'iframe', context, {
            panelMode: 'general-ai',
        });
    }, [assistantIframeUrl, ensureAssistantReadyThenOpen]);

    const openAssistantWithContextAndSubmitPrompt = useCallback(async (
        context: AssistantContextV1 | null,
        prompt: string,
        options: OpenAssistantSubmitOptions = {},
    ) => {
        const text = String(prompt || '').trim();
        if (!text) {
            messageApi.warning('请输入提示词');
            return false;
        }

        const shouldForceNewThread = options.forceNewThread === true;
        assistantResourceThreadBindingSuppressedRef.current = shouldForceNewThread;
        if (shouldForceNewThread) {
            latestAssistantNavigationThreadIdRef.current = undefined;
        }
        const panelAlreadyOpen = assistantSupportsAcpContext
            && (assistantVisible || assistantPanelMounted)
            && Boolean(assistantIframeRef.current?.contentWindow);
        if (panelAlreadyOpen && !assistantVisible) {
            setAssistantVisible(true);
        }
        let hideLoading = panelAlreadyOpen
            ? () => undefined
            : messageApi.loading('正在连接 AI...', 0);
        const closeLoading = () => {
            hideLoading();
            hideLoading = () => undefined;
        };
        try {
            if (context) {
                setAssistantExternalContext(context);
                latestAssistantSyncContextRef.current = context;
                if (!shouldForceNewThread) {
                    syncAssistantContextToTargets(context, 'replace', {
                        retryIframe: true,
                    });
                }
            }

            const targetPath = shouldForceNewThread
                ? undefined
                : context ? getAssistantContextCurrentFilePath(context) : undefined;
            const assistantOpenUrl = assistantIframeUrl;
            if (shouldForceNewThread) {
                latestAssistantResourcePathRef.current = '';
            } else if (targetPath) {
                latestAssistantResourcePathRef.current = targetPath;
            }
            const opened = panelAlreadyOpen
                ? true
                : await ensureAssistantReadyThenOpen('button', assistantOpenUrl, targetPath, 'iframe', context, {
                    panelMode: 'general-ai',
                    loadingText: false,
                    suppressResourceThreadBinding: shouldForceNewThread,
                });
            if (!opened) {
                return false;
            }

            await waitForAssistantPanelPaint();
            const ready = panelAlreadyOpen
                ? await waitForAssistantIframeReady(8_000)
                : await waitForAssistantIframeReady(30_000);
            if (!ready) {
                messageApi.error('AI 助手未就绪，请稍后重试');
                return false;
            }

            await syncAssistantPreviewMcpConfigToIframeWithAck({
                requireLoaded: false,
                requireVisible: false,
                force: true,
                context,
            });

            if (context) {
                postAssistantContextToIframeWithRetry(context, 'replace');
            }

            closeLoading();
            const artifactSinceMs = Date.now();
            const submitResult = await submitPromptWithRetry(text, {
                newThread: shouldForceNewThread,
                waitUntil: options.collectArtifacts === true ? 'started' : options.waitUntil || 'started',
                provider: options.provider,
                model: options.model,
                modeId: options.mode,
                thoughtLevel: options.thought,
                autoSend: options.autoSend,
            });
            if (assistantIframePool.activeKey && typeof submitResult.isRunning === 'boolean') {
                assistantIframePool.markRunState(
                    assistantIframePool.activeKey,
                    submitResult.isRunning === true ? 'running' : 'idle',
                    submitResult.threadId || undefined,
                );
            }
            if (submitResult.isRunning === true && submitResult.canSend === false) {
                messageApi.info('已填入输入框，等待当前回复结束后发送');
                return {
                    ok: false,
                    threadId: submitResult.threadId,
                } satisfies OpenAssistantSubmitResult;
            }
            if (options.collectArtifacts === true && submitResult.threadId) {
                const artifactResult = await waitForAcpArtifacts(() => queryArtifactsWithRetry({
                    threadId: submitResult.threadId,
                    workspacePath: assistantRuntime?.projectPath || undefined,
                    conversationStorePath: latestAssistantConversationStorePathRef.current || undefined,
                    source: options.artifactSource || 'auto',
                    format: 'ai-sdk/v6',
                    sinceMs: artifactSinceMs,
                }), {
                    ignoredArtifactPaths: options.ignoredArtifactPaths,
                });
                return {
                    ok: true,
                    threadId: submitResult.threadId,
                    artifacts: artifactResult.artifacts || [],
                    workspaceArtifacts: artifactResult.workspaceArtifacts,
                    imageGenerationRecords: artifactResult.imageGenerationRecords,
                } satisfies OpenAssistantSubmitResult;
            }
            return {
                ok: true,
                threadId: submitResult.threadId,
            } satisfies OpenAssistantSubmitResult;
        } catch (error: any) {
            messageApi.error(error?.message || '提交 AI 助手对话失败');
            return false;
        } finally {
            if (shouldForceNewThread) {
                assistantResourceThreadBindingSuppressedRef.current = false;
                latestAssistantResourcePathRef.current = context ? getAssistantContextCurrentFilePath(context) : getAssistantContextCurrentFilePath(assistantContextV1);
                latestAssistantConversationStorePathRef.current = resolvePrototypeConversationStorePath({
                    projectPath: assistantRuntime?.projectPath || '',
                    resourcePath: latestAssistantResourcePathRef.current,
                });
                const latestNavigationThreadId = latestAssistantNavigationThreadIdRef.current;
                if (latestNavigationThreadId !== undefined) {
                    handleAssistantActiveThreadChange(latestNavigationThreadId);
                }
            }
            closeLoading();
        }
    }, [
        assistantContextV1,
        assistantIframePool,
        assistantIframeLoaded,
        assistantIframeRef,
        assistantIframeUrl,
        assistantPanelMounted,
        assistantSupportsAcpContext,
        assistantVisible,
        ensureAssistantReadyThenOpen,
        handleAssistantActiveThreadChange,
        messageApi,
        postAssistantContextToIframeWithRetry,
        queryArtifactsWithRetry,
        submitPromptWithRetry,
        syncAssistantPreviewMcpConfigToIframeWithAck,
        syncAssistantContextToTargets,
        waitForAssistantIframeReady,
    ]);

    const probeAssistantRuntimeSilently = useCallback(async () => {
        if (assistantChecking) {
            return assistantRuntime;
        }

        if (assistantRuntime?.health.status === 'ready') {
            return assistantRuntime;
        }

        try {
            const runtime = await refreshRuntime({ autoStart: false }) as AssistantRuntimeState;
            setAssistantRuntime(runtime);
            return runtime;
        } catch (error) {
            console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} silent runtime probe failed`, error);
            return assistantRuntime;
        }
    }, [assistantChecking, assistantRuntime, refreshRuntime, setAssistantRuntime]);

    const connectAssistantRuntimeSilently = useCallback(async () => {
        if (assistantChecking) {
            return assistantRuntime;
        }

        try {
            const runtime = await refreshRuntime({ autoStart: true }) as AssistantRuntimeState;
            setAssistantRuntime(runtime);
            const resolvedRuntime = await waitForAssistantRuntimeReady(runtime);
            setAssistantRuntime(resolvedRuntime);
            return resolvedRuntime;
        } catch (error) {
            console.warn(`${ASSISTANT_RUNTIME_UI_LOG_PREFIX} silent runtime connect failed`, error);
            return assistantRuntime;
        }
    }, [
        assistantChecking,
        assistantRuntime,
        refreshRuntime,
        setAssistantRuntime,
        waitForAssistantRuntimeReady,
    ]);

    const handleCopyProjectDirectoryForMobile = useCallback(async () => {
        const projectPath = (assistantRuntime?.projectPath || '').trim();
        if (!projectPath) {
            messageApi.warning('当前未获取到项目目录');
            return;
        }

        try {
            await navigator.clipboard.writeText(projectPath);
            messageApi.success('项目目录已复制');
        } catch (error) {
            console.error('Failed to copy project path: ', error);
            messageApi.error('复制失败');
        }
    }, [assistantRuntime?.projectPath, messageApi]);

    const handleAssistantIframeLoad = useCallback((key: string) => {
        if (assistantIframePool.entries.some((entry) => entry.key === key)) {
            assistantIframePool.markLoaded(key);
        }
        if (key !== assistantActiveIframeKey) {
            return;
        }
        assistantIframeRef.current = assistantIframePool.getIframe(key);
        assistantIframeBridgeRecoveringRef.current = true;
        assistantIframeLoadSyncSignatureRef.current = '';
        assistantThemeSyncSignatureRef.current = '';
        assistantImageGenerationConfigSyncSignatureRef.current = '';
        assistantPreviewMcpConfigSyncSignatureRef.current = '';
        setAssistantIframeLoaded(true);
        syncAssistantThemeToIframe({
            requireLoaded: false,
            requireVisible: false,
            force: true,
        });
        if (assistantPanelMode === 'image-ai') {
            syncAssistantImageGenerationConfigToIframe({
                requireLoaded: false,
                requireVisible: false,
                force: true,
            });
            return;
        }
        void recoverAssistantIframeBridge();
    }, [
        assistantActiveIframeKey,
        assistantIframePool,
        assistantIframeRef,
        assistantPanelMode,
        recoverAssistantIframeBridge,
        setAssistantIframeLoaded,
        syncAssistantImageGenerationConfigToIframe,
        syncAssistantThemeToIframe,
    ]);

    const visibleAiPanelMode = assistantPanelMode === 'general-ai' || assistantPanelMode === 'image-ai'
        ? assistantPanelMode
        : null;

    return {
        assistantVisible,
        assistantContextAppendAvailable,
        assistantPanelMounted,
        assistantPanelWidth,
        setAssistantPanelWidth,
        assistantPanelMinWidth: Math.min(MIN_ASSISTANT_PANEL_WIDTH, assistantPanelMaxWidth),
        assistantPanelMaxWidth,
        assistantIframeEntries,
        assistantActiveIframeKey,
        handleAssistantIframeRef,
        assistantIframeRef,
        assistantIframeSrc,
        handleAssistantIframeLoad,
        assistantContextV1,
        assistantProjectPath: assistantRuntime?.projectPath || '',
		assistantWebBaseUrl: (assistantRuntime?.webBaseUrl || DEFAULT_ASSISTANT_RUNTIME_STATE.webBaseUrl).trim(),
        assistantApiBaseUrl: (assistantRuntime?.apiBaseUrl || DEFAULT_ASSISTANT_RUNTIME_STATE.apiBaseUrl).trim(),
        probeAssistantRuntimeSilently,
        connectAssistantRuntimeSilently,
        addCanvasElementsToAssistantContext,
        addContextItems,
        addImageAttachment,
        appendComposerText,
        handleToggleAssistant,
        handleOpenAcpWebAgent,
        openImageAiPanel,
        handleOpenImageAiPanelInNewWindow,
        hideAssistantPanelTemporarily,
        restoreAssistantPanel,
        openRawUrlInAssistantPanel,
        syncAssistantCanvasComments,
        clearAssistantSelectedElementsOnExit,
        handleOpenAssistantInNewWindowNoContext,
        handleOpenAssistantWithItemContext,
        openAssistantWithContext,
        openAssistantWithContextAndSubmitPrompt,
        handleCopyProjectDirectory: handleCopyProjectDirectoryForMobile,
        aiPanelMode: assistantVisible ? visibleAiPanelMode : null,
    };
}
