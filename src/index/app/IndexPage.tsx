import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantContextV1, ItemData, TabType, ViewMode } from '../types';
import { useCreateDialog } from '../hooks';
import { useAssistantPanelController } from '../domains/assistant/hooks/useAssistantPanelController';
import { usePreviewBridgeHost, type PreviewHostContext, type ResolvedPreviewNavigateTarget } from '../domains/preview/previewBridgeHost';
import { useWorkspaceNavigationController } from '../domains/workspace/hooks/useWorkspaceNavigationController';
import { useIdeActions } from '../hooks/useIdeActions';
import { useAxhubBridge } from '../hooks/useAxhubBridge';
import { useOpenCodeBridgeSync } from '../hooks/useOpenCodeBridgeSync';
import { resolveOpenCodeCanvasAnnotationContext, resolveOpenCodeCurrentFilePath } from '../hooks/openCodeBridgeContext';
import type { CanvasElementContextInfo } from '../components/content/canvas-embeds/AnnotationOverlay';
import IndexPageLayout from '../components/app/IndexPageLayout';
import type { SettingsDialogAIContext, SettingsDialogInitialTab } from '../components/SettingsDialog';
import type {
    ResourceSection,
    SidebarTab,
    UploadedResourceFile,
} from '../types/index-page.types';
import { useIndexPageResourceActions } from './index-page/useIndexPageResourceActions';
import { useIndexPagePreviewActions } from './index-page/useIndexPagePreviewActions';
import { useIndexPagePreferences } from './hooks/useIndexPagePreferences';
import { normalizePromptClientPreference } from '@/common/promptExecution';
import { resolveAcpPromptClientProvider } from '@/common/acpModelConfig';
import { useIndexPagePresentationPropsBuilder } from './hooks/useIndexPagePresentationPropsBuilder';
import { useIndexPageSelectionSync } from './hooks/useIndexPageSelectionSync';
import { useIndexPageSidebarPropsBuilder } from './hooks/useIndexPageSidebarPropsBuilder';
import { useIndexPageUiBridge } from './hooks/useIndexPageUiBridge';
import {
    shouldClosePrototypeSpecAfterAnnotationAttempt,
    usePrototypeSpecController,
} from './hooks/usePrototypeSpecController';
import { useDocumentResourceNavigation } from './hooks/useDocumentResourceNavigation';
import { usePrototypeSpecNavigationGuard } from './hooks/usePrototypeSpecNavigationGuard';
import { resolveIndexContentMode, type IndexContentMode } from './index-page/contentMode';
import { buildIndexDeepLinkUrl, parseResourceDeepLink, shouldSyncIndexDeepLinkUrl, type ResourceDeepLinkTarget } from './index-page/resourceDeepLink';
import {
    buildAssistantAutoOpenPanelModeStorageKey,
    buildAssistantAutoOpenDismissedStorageKey,
    getAssistantAutoOpenPanelMode,
    getAssistantAutoOpenDismissed,
    resolveMobileItemOpenUrl,
    setAssistantAutoOpenPanelMode,
    setAssistantAutoOpenDismissed,
} from './index-page.helpers';
import { getSelectedResourceTargetPath } from './index-page/previewActions.helpers';
import { apiService } from '../services/index.api';
import { requireProjectScope, withProjectScope } from '../services/projectScope';
import type { MakeClientUpdateStatus } from '../services/api';
import type { AcpProvider } from '@/common/assistant-context/types';
import { DEFAULT_LOCAL_EXPORT_CAPABILITIES, DEFAULT_RESOURCE_WRITE_CAPABILITIES, normalizeProjectResourcesPayload } from '../services/projectResources';
import type { PendingReturnTarget } from './hooks/useIndexPageSelectionSync';
import { getExplicitLocalPath, stripIndexFilePath } from '../utils/localPath';
import { copyToClipboard } from '../utils/clipboard';
import { getAssistantContextCurrentFilePath, resolveAssistantCurrentFile } from '../utils/assistantContext';
import { buildMakeClientStartupFailurePrompt } from '../utils/projectSetupErrors';
import type { ExcalidrawPropertyPanelMode, ExcalidrawPropertyPanelPosition } from '../utils/excalidrawUiMode';
import type { CanvasAiGenerationRequest } from '../domains/ai-generation/CanvasAiGenerationTool';
import { mapCanvasDirectRunArtifacts } from '../domains/ai-generation/canvasDirectRun';
import {
    submitAnnotationPromptViaApi,
} from '../domains/assistant/annotationDirectRun';
import { buildAcpCanvasMcpServers } from '../domains/assistant/assistantAcpContext';
import type { AssistantImageAttachmentPayload } from '../domains/assistant/assistantContextPayload';
import {
    createNotificationCoordinator,
    type NotificationCoordinator,
    type NotificationIntent,
} from '../domains/notifications/notificationCoordinator';
import {
    installNotificationDebugApi,
    notificationDiagnostics,
} from '../domains/notifications/notificationDiagnostics';
import { createNotificationPlayer, type NotificationPlayer } from '../domains/notifications/notificationPlayer';
import { readNotificationSettings } from '../domains/notifications/notificationSettings';
import './styles/index-page.css';

interface AppInnerProps {
    isDarkMode: boolean;
    setIsDarkMode: (dark: boolean) => void;
    excalidrawPropertyPanelMode: ExcalidrawPropertyPanelMode;
    setExcalidrawPropertyPanelMode: (mode: ExcalidrawPropertyPanelMode) => void;
    excalidrawPropertyPanelPosition: ExcalidrawPropertyPanelPosition;
    setExcalidrawPropertyPanelPosition: (position: ExcalidrawPropertyPanelPosition) => void;
}

type PrototypeRouteInfo = {
    pages: { id: string; title: string; group?: string }[];
    defaultPageId: string;
    activePageId: string;
};

const PROTOTYPE_ROUTE_PAGE_ID_RE = /^[a-z0-9-]+$/u;
const MAKE_STATE_DIR_NOT_WRITABLE = 'MAKE_STATE_DIR_NOT_WRITABLE';
const MAKE_CLIENT_UPDATE_REMINDER_DISMISSED_PREFIX = 'axhub.make.clientUpdateReminder.dismissed';

type MakeClientUpdateReminderTarget = {
    projectId: string;
    targetVersion: string;
};

function normalizePrototypeRoutePageId(value: unknown): string {
    const id = typeof value === 'string' ? value.trim() : '';
    return PROTOTYPE_ROUTE_PAGE_ID_RE.test(id) ? id : '';
}

function normalizePrototypeRoutePage(value: { id?: unknown; title?: unknown; group?: unknown } | null | undefined) {
    const id = normalizePrototypeRoutePageId(value?.id);
    const title = typeof value?.title === 'string' ? value.title.trim() : '';
    const group = typeof value?.group === 'string' ? value.group.trim() : '';
    return id && title ? { id, title, ...(group ? { group } : {}) } : null;
}

function resolveSelectedPrototypePageAfterRouteInfo(
    previousPageId: string | null,
    routeInfo: PrototypeRouteInfo,
    pages: { id: string; title: string }[],
): string | null {
    const previous = normalizePrototypeRoutePageId(previousPageId);
    if (previous && pages.some((page) => page.id === previous)) {
        return previous;
    }
    const active = normalizePrototypeRoutePageId(routeInfo.activePageId);
    if (active && pages.some((page) => page.id === active)) {
        return active;
    }
    const fallback = normalizePrototypeRoutePageId(routeInfo.defaultPageId) || pages[0]?.id || '';
    return fallback || null;
}

function readRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function isCanvasMcpResourcePath(value: unknown): boolean {
    const normalized = typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
    return /^src\/resources\/.+\.excalidraw$/u.test(normalized);
}

function buildCanvasMcpServersForDirectRun(canvasFilePath: string): unknown[] | undefined {
    if (!isCanvasMcpResourcePath(canvasFilePath) || typeof window === 'undefined') {
        return undefined;
    }
    const globals = window as unknown as Record<string, unknown>;
    const canvasToken = String(globals.__AXHUB_CANVAS_MCP_TOKEN__ || '').trim();
    const mcpServers = buildAcpCanvasMcpServers({
        makeOrigin: window.location.origin,
        token: canvasToken,
    });
    return mcpServers || undefined;
}

function buildCreatedPrototypeStartItem(result: any): ItemData | null {
    const name = String(result?.name || result?.folderName || '').trim();
    if (!name) {
        return null;
    }
    const displayName = String(result?.displayName || result?.title || name).trim() || name;
    const clientUrl = String(result?.clientUrl || '').trim();
    const filePath = String(result?.filePath || '').trim();
    const absoluteFilePath = String(result?.absoluteFilePath || '').trim();
    const canvasFilePath = String(result?.canvasFilePath || '').trim();
    const absoluteCanvasFilePath = String(result?.absoluteCanvasFilePath || '').trim();
    return {
        name,
        displayName,
        jsUrl: '',
        specUrl: '',
        previewUrl: clientUrl,
        clientUrl: clientUrl || undefined,
        filePath: filePath || undefined,
        absoluteFilePath: absoluteFilePath || undefined,
        canvasFilePath: canvasFilePath || undefined,
        absoluteCanvasFilePath: absoluteCanvasFilePath || undefined,
        previewDisabled: !clientUrl,
        ...(result?.placeholder === true ? { placeholder: true } : {}),
        ...(result?.placeholderGuide ? { placeholderGuide: result.placeholderGuide } : {}),
    };
}

function buildMakeStatePermissionPrompt(health: unknown): string {
    const record = readRecord(health);
    const details = readRecord(record.details);
    const error = readRecord(record.error || details.error);
    const stateDir = String(record.stateDir || details.stateDir || '');
    const registryPath = String(record.registryPath || details.registryPath || '');
    return [
        '请帮我修复 Axhub Make 本机项目列表保存失败的问题。',
        '',
        `Make 数据目录：${stateDir || '(未返回)'}`,
        `项目列表文件：${registryPath || '(未返回)'}`,
        `错误：${String(error.code || record.code || MAKE_STATE_DIR_NOT_WRITABLE)} ${String(error.message || record.error || '')}`.trim(),
        '',
        '请判断当前系统是 macOS、Windows 还是 Linux，检查目录权限和残留 projects.json.tmp-* 文件。',
        '能安全处理时再执行修复；不要直接使用 sudo，除非用户确认。',
        '',
        '修复后请让我刷新 Axhub Make 页面或重新新建项目。',
    ].join('\n');
}

function buildMakeClientUpdateReminderDismissedKey(projectId: string, targetVersion: string): string {
    return `${MAKE_CLIENT_UPDATE_REMINDER_DISMISSED_PREFIX}.${encodeURIComponent(projectId)}.${encodeURIComponent(targetVersion)}`;
}

function readMakeClientUpdateReminderDismissed(projectId: string, targetVersion: string): boolean {
    if (!projectId || !targetVersion || typeof window === 'undefined') {
        return false;
    }
    try {
        return window.localStorage.getItem(buildMakeClientUpdateReminderDismissedKey(projectId, targetVersion)) === '1';
    } catch {
        return false;
    }
}

function writeMakeClientUpdateReminderDismissed(projectId: string, targetVersion: string): void {
    if (!projectId || !targetVersion || typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(buildMakeClientUpdateReminderDismissedKey(projectId, targetVersion), '1');
    } catch {
        // Ignore storage failures; the update entry remains available without the one-time dismissal memory.
    }
}

export default function IndexPage({
    isDarkMode,
    setIsDarkMode,
    excalidrawPropertyPanelMode,
    setExcalidrawPropertyPanelMode,
    excalidrawPropertyPanelPosition,
    setExcalidrawPropertyPanelPosition,
}: AppInnerProps) {
    const { appDialog, messageApi, modal } = useIndexPageUiBridge();
    const workspace = useWorkspaceNavigationController({ messageApi });
    const bridge = useAxhubBridge();
    const notificationPlayerRef = useRef<NotificationPlayer | null>(null);
    if (!notificationPlayerRef.current) {
        notificationPlayerRef.current = createNotificationPlayer();
    }
    const notificationCoordinatorRef = useRef<NotificationCoordinator | null>(null);
    if (!notificationCoordinatorRef.current) {
        notificationCoordinatorRef.current = createNotificationCoordinator({
            getSettings: readNotificationSettings,
            player: notificationPlayerRef.current,
        });
    }
    const notifyAiNotification = useCallback((intent: NotificationIntent) => {
        void notificationCoordinatorRef.current?.notify(intent);
    }, []);
    useEffect(() => installNotificationDebugApi({
        diagnostics: notificationDiagnostics,
        player: notificationPlayerRef.current!,
    }), []);
    useEffect(() => {
        const primeNotificationAudio = () => {
            notificationPlayerRef.current?.prime?.();
        };
        window.addEventListener('pointerdown', primeNotificationAudio, { capture: true, once: true });
        window.addEventListener('keydown', primeNotificationAudio, { capture: true, once: true });
        return () => {
            window.removeEventListener('pointerdown', primeNotificationAudio, { capture: true });
            window.removeEventListener('keydown', primeNotificationAudio, { capture: true });
        };
    }, []);

    const [collapsed, setCollapsed] = useState(false);
    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
    const [settingsDialogInitialTab, setSettingsDialogInitialTab] = useState<SettingsDialogInitialTab>('project');
    const [settingsDialogAIContext, setSettingsDialogAIContext] = useState<SettingsDialogAIContext | null>(null);
    const [makeClientUpdateAvailable, setMakeClientUpdateAvailable] = useState(false);
    const [makeClientUpdateReminderVisible, setMakeClientUpdateReminderVisible] = useState(false);
    const [versionCollaborationDrawerOpen, setVersionCollaborationDrawerOpen] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('demo');
    const [activeTab, setActiveTab] = useState<TabType>('prototypes');
    const [selectedItem, setSelectedItem] = useState<ItemData | null>(null);
    const [prototypeStartDraftActive, setPrototypeStartDraftActive] = useState(false);
    const [resourceStartDraftActive, setResourceStartDraftActive] = useState(false);
    const [themeStartDraftActive, setThemeStartDraftActive] = useState(false);
    const [selectedPrototypePageId, setSelectedPrototypePageId] = useState<string | null>(null);
    const [sidebarTab, setSidebarTab] = useState<SidebarTab>('prototype');
    const [resourceSection, setResourceSection] = useState<ResourceSection>('themes');
    const [startServerLoading, setStartServerLoading] = useState(false);
    const [startServerError, setStartServerError] = useState('');
    const [startServerErrorPrompt, setStartServerErrorPrompt] = useState('');
    const [pendingReturnTarget, setPendingReturnTarget] = useState<PendingReturnTarget | null>(null);
    const onlineOpenAutoTriggeredRef = useRef('');
    const onlineOpenAutoRestorePendingRef = useRef('');
    const previousAssistantAutoOpenProjectScopeRef = useRef('');
    const assistantAutoOpenSuppressedProjectScopeRef = useRef('');
    const closedPrototypePlaceholderAutoCloseKeyRef = useRef('');
    const openedPrototypeWaitingGenerationKeyRef = useRef('');
    const startGuideResourceUploadInputRef = useRef<HTMLInputElement | null>(null);
    const makeClientUpdateReminderTargetRef = useRef<MakeClientUpdateReminderTarget | null>(null);
    const makeClientUpdateReminderPendingSeenProjectIdRef = useRef('');
    const initialResourceDeepLink = useMemo(() => parseResourceDeepLink(), []);
    const [initialResourceDeepLinkHandled, setInitialResourceDeepLinkHandled] = useState(() => !initialResourceDeepLink);
    const handleInitialResourceDeepLinkHandled = useCallback(() => {
        setInitialResourceDeepLinkHandled(true);
    }, []);
    useEffect(() => {
        if (!prototypeStartDraftActive) return;
        if (selectedItem || sidebarTab !== 'prototype' || viewMode !== 'demo') {
            setPrototypeStartDraftActive(false);
        }
    }, [prototypeStartDraftActive, selectedItem, sidebarTab, viewMode]);

    const markMakeClientUpdateReminderSeen = useCallback(() => {
        const activeProjectId = String(workspace.activeProjectId || '').trim();
        const reminderTarget = makeClientUpdateReminderTargetRef.current;
        if (reminderTarget && reminderTarget.projectId === activeProjectId) {
            writeMakeClientUpdateReminderDismissed(reminderTarget.projectId, reminderTarget.targetVersion);
            makeClientUpdateReminderPendingSeenProjectIdRef.current = '';
        } else if (activeProjectId) {
            makeClientUpdateReminderPendingSeenProjectIdRef.current = activeProjectId;
        }
        setMakeClientUpdateReminderVisible(false);
    }, [workspace.activeProjectId]);

    const openSettingsDialog = useCallback((tab: SettingsDialogInitialTab = 'project', aiContext?: SettingsDialogAIContext | null) => {
        if (tab === 'update') {
            markMakeClientUpdateReminderSeen();
        }
        setSettingsDialogInitialTab(tab);
        setSettingsDialogAIContext(tab === 'ai' ? aiContext || null : null);
        setSettingsDialogOpen(true);
    }, [markMakeClientUpdateReminderSeen]);

    const openVersionCollaborationFromSettings = useCallback(() => {
        setSettingsDialogOpen(false);
        setVersionCollaborationDrawerOpen(true);
    }, []);

    const handleMakeClientUpdateAvailabilityChange = useCallback((status: MakeClientUpdateStatus | null) => {
        const updateAvailable = status?.updateAvailable === true;
        setMakeClientUpdateAvailable(updateAvailable);
        const projectId = String(status?.projectId || workspace.activeProjectId || '').trim();
        const targetVersion = String(status?.targetVersion || '').trim();
        if (!updateAvailable || !projectId || !targetVersion) {
            makeClientUpdateReminderTargetRef.current = null;
            if (makeClientUpdateReminderPendingSeenProjectIdRef.current === projectId) {
                makeClientUpdateReminderPendingSeenProjectIdRef.current = '';
            }
            setMakeClientUpdateReminderVisible(false);
            return;
        }
        makeClientUpdateReminderTargetRef.current = { projectId, targetVersion };
        if (makeClientUpdateReminderPendingSeenProjectIdRef.current === projectId) {
            writeMakeClientUpdateReminderDismissed(projectId, targetVersion);
            makeClientUpdateReminderPendingSeenProjectIdRef.current = '';
            setMakeClientUpdateReminderVisible(false);
            return;
        }
        setMakeClientUpdateReminderVisible(updateAvailable && !readMakeClientUpdateReminderDismissed(projectId, targetVersion));
    }, [workspace.activeProjectId]);

    useEffect(() => {
        const activeProjectId = workspace.activeProjectId;
        if (!activeProjectId || workspace.projectSetupRequired) {
            setMakeClientUpdateAvailable(false);
            setMakeClientUpdateReminderVisible(false);
            makeClientUpdateReminderTargetRef.current = null;
            makeClientUpdateReminderPendingSeenProjectIdRef.current = '';
            return;
        }

        let cancelled = false;
        void apiService.getMakeClientUpdateStatus(activeProjectId)
            .then((status) => {
                if (!cancelled) {
                    const updateAvailable = status.updateAvailable === true;
                    setMakeClientUpdateAvailable(updateAvailable);
                    if (updateAvailable && status.targetVersion) {
                        makeClientUpdateReminderTargetRef.current = { projectId: activeProjectId, targetVersion: status.targetVersion };
                        if (makeClientUpdateReminderPendingSeenProjectIdRef.current === activeProjectId) {
                            writeMakeClientUpdateReminderDismissed(activeProjectId, status.targetVersion);
                            makeClientUpdateReminderPendingSeenProjectIdRef.current = '';
                            setMakeClientUpdateReminderVisible(false);
                            return;
                        }
                        setMakeClientUpdateReminderVisible(updateAvailable && !readMakeClientUpdateReminderDismissed(activeProjectId, status.targetVersion));
                    } else {
                        makeClientUpdateReminderTargetRef.current = null;
                        if (makeClientUpdateReminderPendingSeenProjectIdRef.current === activeProjectId) {
                            makeClientUpdateReminderPendingSeenProjectIdRef.current = '';
                        }
                        setMakeClientUpdateReminderVisible(false);
                    }
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setMakeClientUpdateAvailable(false);
                    setMakeClientUpdateReminderVisible(false);
                    makeClientUpdateReminderTargetRef.current = null;
                    if (makeClientUpdateReminderPendingSeenProjectIdRef.current === activeProjectId) {
                        makeClientUpdateReminderPendingSeenProjectIdRef.current = '';
                    }
                }
            });

        return () => {
            cancelled = true;
        };
    }, [workspace.activeProjectId, workspace.projectSetupRequired]);

    const handleExcalidrawPropertyPanelModeChange = useCallback((mode: ExcalidrawPropertyPanelMode) => {
        setExcalidrawPropertyPanelMode(mode);
        void apiService.saveServerPreferences({
            uiPreferences: {
                excalidrawPropertyPanelMode: mode,
            },
        }, requireProjectScope(workspace.activeProjectId)).catch((error) => {
            console.warn('Failed to save Excalidraw property panel preference:', error);
        });
    }, [setExcalidrawPropertyPanelMode, workspace.activeProjectId]);

    const handleExcalidrawPropertyPanelPositionChange = useCallback((position: ExcalidrawPropertyPanelPosition) => {
        setExcalidrawPropertyPanelPosition(position);
        void apiService.saveServerPreferences({
            uiPreferences: {
                excalidrawPropertyPanelPosition: position,
            },
        }, requireProjectScope(workspace.activeProjectId)).catch((error) => {
            console.warn('Failed to save Excalidraw property panel position preference:', error);
        });
    }, [setExcalidrawPropertyPanelPosition, workspace.activeProjectId]);

    const availableDocOptions = useMemo(
        () => workspace.docsItems.map((doc) => ({ name: doc.name, displayName: doc.displayName || doc.name })),
        [workspace.docsItems],
    );
    const availablePrototypeOptions = useMemo(
        () => (workspace.data?.prototypes || []).map((item) => ({ name: item.name, displayName: item.displayName || item.name })),
        [workspace.data?.prototypes],
    );
    const {
        createDialogVisible,
        initialCreateDialogTab,
        initialCreateDialogUploadType,
        createDialogTargetPrototypeName,
        setCreateDialogVisible,
        setInitialCreateDialogTab,
        setInitialCreateDialogUploadType,
        setCreateDialogTargetPrototypeName,
        clearCreateDialogState,
        handleCreateCancel,
    } = useCreateDialog(activeTab, workspace.data);

    const handleCreatePrototypeStartDraft = useCallback(() => {
        setActiveTab('prototypes');
        setSidebarTab('prototype');
        setViewMode('demo');
        setSelectedItem(null);
        setSelectedPrototypePageId(null);
        setResourceStartDraftActive(false);
        setThemeStartDraftActive(false);
        setPrototypeStartDraftActive(true);
    }, []);

    const handleOpenPrototypeCreateDialog = useCallback((options: {
        initialTab: typeof initialCreateDialogTab;
        initialUploadType?: typeof initialCreateDialogUploadType;
        targetPrototypeName?: string;
    }) => {
        setActiveTab('prototypes');
        setInitialCreateDialogTab(options.initialTab);
        setInitialCreateDialogUploadType(options.initialUploadType);
        setCreateDialogTargetPrototypeName(options.targetPrototypeName);
        setCreateDialogVisible(true);
    }, [
        setActiveTab,
        setCreateDialogTargetPrototypeName,
        setCreateDialogVisible,
        setInitialCreateDialogTab,
        setInitialCreateDialogUploadType,
    ]);

    const resources = useIndexPageResourceActions({
        activeTab,
        activeProjectId: workspace.activeProjectId,
        data: workspace.data,
        docsItems: workspace.docsItems,
        canvasItems: workspace.canvasItems,
        themes: workspace.themes,
        setThemes: workspace.setThemes,
        dataTables: workspace.dataTables,
        setDataTables: workspace.setDataTables,
        templateAssets: workspace.templateAssets,
        setTemplateAssets: workspace.setTemplateAssets,
        resourceOrders: workspace.resourceOrders,
        setResourceOrders: workspace.setResourceOrders,
        sidebarTrees: workspace.sidebarTrees,
        setSidebarTrees: workspace.setSidebarTrees,
        projectTitle: workspace.projectTitle,
        setProjectTitle: workspace.setProjectTitle,
        availableDocOptions,
        availablePrototypeOptions,
        messageApi,
        modal,
        appDialog,
        preferredPromptClient: null,
        preferredIDE: null,
        setActiveTab,
        setSelectedItem,
        setSidebarTab,
        setViewMode,
        setResourceSection,
        setPendingReturnTarget,
        loadData: workspace.loadData,
        loadProjects: workspace.loadProjects,
        reloadSidebarAssets: workspace.reloadSidebarAssets,
        reloadDocsItems: workspace.reloadDocsItems,
        reloadCanvasItems: workspace.reloadCanvasItems,
        getSidebarTabItems: workspace.getSidebarTabItems,
        loadSidebarTree: workspace.loadSidebarTree,
        resourceStartDraftActive,
        themeStartDraftActive,
    });

    useEffect(() => {
        if (!resourceStartDraftActive) return;
        if (resources.selectedDoc || resources.selectedResourceFolder || sidebarTab !== 'document' || viewMode !== 'demo') {
            setResourceStartDraftActive(false);
        }
    }, [resourceStartDraftActive, resources.selectedDoc, resources.selectedResourceFolder, sidebarTab, viewMode]);

    useEffect(() => {
        if (!themeStartDraftActive) return;
        if (resources.selectedTheme || sidebarTab !== 'assets' || resourceSection !== 'themes' || viewMode !== 'demo') {
            setThemeStartDraftActive(false);
        }
    }, [resourceSection, resources.selectedTheme, sidebarTab, themeStartDraftActive, viewMode]);

    const handleCreateResourceStartDraft = useCallback(() => {
        setSidebarTab('document');
        setViewMode('demo');
        resources.setSelectedResourceFolder(null);
        resources.setSelectedDoc(null);
        setPrototypeStartDraftActive(false);
        setThemeStartDraftActive(false);
        setResourceStartDraftActive(true);
    }, [resources, setSidebarTab, setViewMode]);

    const handleCreateThemeStartDraft = useCallback(() => {
        setSidebarTab('assets');
        setResourceSection('themes');
        setViewMode('demo');
        resources.setSelectedTheme(null);
        setPrototypeStartDraftActive(false);
        setResourceStartDraftActive(false);
        setThemeStartDraftActive(true);
    }, [resources, setResourceSection, setSidebarTab, setViewMode]);

    const handleOpenStartGuideResourceUpload = useCallback(() => {
        startGuideResourceUploadInputRef.current?.click();
    }, []);

    const handleUploadStartGuideResourceFiles = useCallback(async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        const hide = messageApi.loading('正在上传资源...', 0);
        try {
            const formData = new FormData();
            formData.append('projectId', requireProjectScope(workspace.activeProjectId).projectId);
            for (const file of Array.from(files)) {
                formData.append('file', file, file.name);
            }
            const response = await fetch(withProjectScope('/api/docs/upload', requireProjectScope(workspace.activeProjectId)), {
                method: 'POST',
                body: formData,
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                throw new Error(payload?.error || '上传失败');
            }
            const uploadedFiles = Array.isArray(payload?.files)
                ? payload.files as UploadedResourceFile[]
                : [];
            await resources.handleUploadedResourceFiles(uploadedFiles);
            messageApi.success(`已上传 ${uploadedFiles.length || files.length} 个资源文件`);
        } catch (error: any) {
            messageApi.error(error?.message || '资源上传失败');
        } finally {
            hide();
        }
    }, [messageApi, resources, workspace.activeProjectId]);

    const selectedPrototypeId = String(selectedItem?.resourceId || selectedItem?.name || '').trim();
    const shouldAutoOpenInitialPrototypeSpec = Boolean(
        initialResourceDeepLink?.resourceType === 'prototype'
        && initialResourceDeepLink.openSpec
        && initialResourceDeepLink.resourceId === selectedPrototypeId,
    );
    const prototypeSpec = usePrototypeSpecController({
        activeProjectId: workspace.activeProjectId,
        selectedItem,
        autoOpen: shouldAutoOpenInitialPrototypeSpec,
        onError: messageApi.error,
    });
    const prototypeSpecAnnotationAttemptIdRef = useRef(0);
    const currentPrototypeSpecItemRef = useRef(prototypeSpec.currentItem);
    currentPrototypeSpecItemRef.current = prototypeSpec.currentItem;
    useEffect(() => {
        if (prototypeSpec.isOpen && sidebarTab !== 'prototype') prototypeSpec.close();
    }, [prototypeSpec.isOpen, prototypeSpec.close, sidebarTab]);

    const baseContentMode = useMemo<IndexContentMode>(() => resolveIndexContentMode({
        sidebarTab,
        resourceSection,
        viewMode,
        selectedDocOpenMode: resources.selectedDoc?.openMode,
    }), [resourceSection, resources.selectedDoc?.openMode, sidebarTab, viewMode]);
    const contentMode: IndexContentMode = prototypeSpec.isOpen ? 'prototype-spec' : baseContentMode;

    const currentMarkdownResource = useMemo(() => {
        if (contentMode === 'prototype-spec') {
            return { item: prototypeSpec.currentItem, kind: 'doc' as const };
        }
        if (contentMode === 'doc') {
            return { item: resources.selectedDoc, kind: 'doc' as const };
        }
        if (contentMode === 'template') {
            return { item: resources.selectedTemplate, kind: 'template' as const };
        }
        return { item: null, kind: 'doc' as const };
    }, [contentMode, prototypeSpec.currentItem, resources.selectedDoc, resources.selectedTemplate]);
    const currentMarkdownItem = currentMarkdownResource.item;
    const currentMarkdownLabel = currentMarkdownResource.kind === 'template' ? '模板' : '文档';
    const prototypePlaceholderActive = contentMode === 'preview' && viewMode === 'demo' && selectedItem?.placeholder === true;
    const prototypeStartPageActive = prototypeStartDraftActive || prototypePlaceholderActive;
    const prototypePlaceholderAutoCloseKey = prototypePlaceholderActive && selectedItem
        ? selectedItem.resourceId || selectedItem.name
        : '';
    const prototypeWaitingGenerationActive = contentMode === 'preview' && viewMode === 'demo' && selectedItem?.generationStatus === 'waiting' && selectedItem?.placeholder !== true;
    const prototypeWaitingGenerationAutoOpenKey = prototypeWaitingGenerationActive && selectedItem
        ? selectedItem.resourceId || selectedItem.name
        : '';

    const preferences = useIndexPagePreferences({
        setDefaultThemeName: resources.setDefaultThemeName,
        activeProjectId: workspace.activeProjectId,
        enabled: !workspace.loading,
        onProjectConfigSaved: workspace.loadProjectResources,
        onExcalidrawPropertyPanelModeLoaded: setExcalidrawPropertyPanelMode,
        onExcalidrawPropertyPanelPositionLoaded: setExcalidrawPropertyPanelPosition,
    });

    const assistantAutoOpenProjectScope = workspace.activeProjectId
        || workspace.projectTitle;
    const assistantAutoOpenDismissedStorageKey = useMemo(() => (
        buildAssistantAutoOpenDismissedStorageKey(assistantAutoOpenProjectScope)
    ), [assistantAutoOpenProjectScope]);
    const assistantAutoOpenPanelModeStorageKey = useMemo(() => (
        buildAssistantAutoOpenPanelModeStorageKey(assistantAutoOpenProjectScope)
    ), [assistantAutoOpenProjectScope]);
    const initialAssistantPanelMode = useMemo(() => (
        getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey)
    ), [assistantAutoOpenPanelModeStorageKey]);
    const currentAssistantCanvasResource = useMemo(() => (
        resources.selectedDoc?.openMode === 'canvas'
            ? resources.selectedDoc
            : resources.selectedCanvas
    ), [
        resources.selectedCanvas,
        resources.selectedDoc,
    ]);

    const assistantController = useAssistantPanelController({
        messageApi,
        modal,
        preferredPromptClient: null,
        onOpenAISettings: (runtime, message) => openSettingsDialog('ai', {
            runtime,
            failureSource: '右侧 ACP UI 助手面板',
            failureMessage: message,
        }),
        onAiNotification: notifyAiNotification,
        activeProjectId: workspace.activeProjectId,
        activeTab,
        viewMode,
        isDarkMode,
        selectedItem,
        contentMode,
        currentMarkdownResource,
        initialAssistantPanelMode,
        assistantImageGenerationConfig: preferences.assistantImageGenerationConfig,
        currentCanvas: currentAssistantCanvasResource,
        currentTheme: resources.selectedTheme,
        currentDataTable: resources.selectedDataTable,
    });
    const restoreAssistantPanel = assistantController.restoreAssistantPanel;
    const syncAssistantCanvasComments = assistantController.syncAssistantCanvasComments;
    const assistantCurrentFilePath = getAssistantContextCurrentFilePath(assistantController.assistantContextV1);
    const assistantAutoOpenTargetPath = assistantCurrentFilePath
        || (selectedItem ? getSelectedResourceTargetPath(selectedItem) : undefined);
    const buildAssistantAutoOpenKeyForTarget = useCallback((_targetPath?: string) => (
        buildAssistantAutoOpenDismissedStorageKey(
            assistantAutoOpenProjectScope,
        )
    ), [
        assistantAutoOpenProjectScope,
    ]);

    useEffect(() => {
        const nextScope = assistantAutoOpenProjectScope;
        const previousScope = previousAssistantAutoOpenProjectScopeRef.current;
        if (previousScope && nextScope && previousScope !== nextScope && !assistantController.assistantVisible) {
            assistantAutoOpenSuppressedProjectScopeRef.current = nextScope;
        }
        if (previousScope !== nextScope) {
            onlineOpenAutoTriggeredRef.current = '';
            onlineOpenAutoRestorePendingRef.current = '';
        }
        previousAssistantAutoOpenProjectScopeRef.current = nextScope;
    }, [
        assistantAutoOpenProjectScope,
        assistantController.assistantVisible,
    ]);

    const ensureDefaultAiConfigured = useCallback((promptClient: unknown) => {
        if (resolveAcpPromptClientProvider(normalizePromptClientPreference(promptClient))) return true;
        openSettingsDialog('ai');
        messageApi.warning('请先在 AI 设置中选择本地 AI Agent');
        return false;
    }, [messageApi, openSettingsDialog]);

    const handleSubmitAnnotationAssistantPrompt = useCallback(async (
        context: AssistantContextV1,
        promptText: string,
        options?: {
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
        },
    ) => {
        const prompt = String(promptText || '').trim();
        if (!prompt) {
            messageApi.warning('请输入提示词');
            return false;
        }
        if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return false;
        const annotationPromptClient = preferences.annotationPromptClient || preferences.preferredPromptClient;
        const annotationProvider = resolveAcpPromptClientProvider(annotationPromptClient);
        if (!annotationProvider) return false;
        const annotationModel = preferences.annotationModel || null;
        assistantAutoOpenSuppressedProjectScopeRef.current = '';
        setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, false);
        return assistantController.openAssistantWithContextAndSubmitPrompt(context, prompt, {
            ...options,
            provider: options?.provider ?? annotationProvider,
            model: options?.model ?? annotationModel,
            autoSend: options?.autoSend,
        });
    }, [
        assistantAutoOpenDismissedStorageKey,
        assistantController.openAssistantWithContextAndSubmitPrompt,
        ensureDefaultAiConfigured,
        messageApi,
        preferences.annotationModel,
        preferences.annotationPromptClient,
        preferences.preferredPromptClient,
    ]);

    const handleRunAnnotationAssistantPromptViaApi = useCallback(async (request: {
        context: AssistantContextV1;
        prompt: string;
        onPrepared?: (payload: any) => void | Promise<void>;
        onAccepted?: (payload: any) => void | Promise<void>;
        signal?: AbortSignal;
    }) => {
        const prompt = String(request.prompt || '').trim();
        if (!prompt) {
            messageApi.warning('请输入提示词');
            return false;
        }
        if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return false;
        const annotationPromptClient = preferences.annotationPromptClient || preferences.preferredPromptClient;
        const annotationProvider = resolveAcpPromptClientProvider(annotationPromptClient);
        if (!annotationProvider) return false;
        const annotationModel = preferences.annotationModel || null;
        return submitAnnotationPromptViaApi({
            context: request.context,
            prompt,
            projectPath: assistantController.assistantProjectPath,
            projectScope: workspace.activeProjectId || assistantController.assistantProjectPath || workspace.projectTitle,
            projectId: requireProjectScope(workspace.activeProjectId).projectId,
            preferredPromptClient: annotationPromptClient || `acp:${annotationProvider}`,
            provider: annotationProvider,
            model: annotationModel,
            agentRunConcurrency: preferences.agentRunConcurrency,
            builtinToolSettings: preferences.assistantImageGenerationConfig
                ? { imageGeneration: preferences.assistantImageGenerationConfig }
                : undefined,
            onRunStarting: (message) => messageApi.info(message),
            onPrepared: request.onPrepared,
            onAccepted: request.onAccepted,
            signal: request.signal,
        });
    }, [
        assistantController.assistantProjectPath,
        ensureDefaultAiConfigured,
        messageApi,
        preferences.annotationModel,
        preferences.annotationPromptClient,
        preferences.agentRunConcurrency,
        preferences.assistantImageGenerationConfig,
        preferences.preferredPromptClient,
        workspace.activeProjectId,
        workspace.projectTitle,
    ]);

    const handleRunReviewAssistantPromptViaApi = useCallback(async (request: {
        context: AssistantContextV1;
        prompt: string;
        targetPath?: string | null;
    }) => {
        const prompt = String(request.prompt || '').trim();
        if (!prompt) {
            messageApi.warning('请输入提示词');
            return false;
        }
        if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return false;
        const annotationPromptClient = preferences.annotationPromptClient || preferences.preferredPromptClient;
        const annotationProvider = resolveAcpPromptClientProvider(annotationPromptClient);
        if (!annotationProvider) return false;
        const annotationModel = preferences.annotationModel || null;
        return submitAnnotationPromptViaApi({
            context: request.context,
            prompt,
            projectPath: assistantController.assistantProjectPath,
            projectScope: workspace.activeProjectId || assistantController.assistantProjectPath || workspace.projectTitle,
            projectId: requireProjectScope(workspace.activeProjectId).projectId,
            preferredPromptClient: annotationPromptClient || `acp:${annotationProvider}`,
            scene: 'prototype-review-direct',
            provider: annotationProvider,
            model: annotationModel,
            targetPath: request.targetPath || undefined,
            agentRunConcurrency: preferences.agentRunConcurrency,
            builtinToolSettings: preferences.assistantImageGenerationConfig
                ? { imageGeneration: preferences.assistantImageGenerationConfig }
                : undefined,
        });
    }, [
        assistantController.assistantProjectPath,
        ensureDefaultAiConfigured,
        messageApi,
        preferences.annotationModel,
        preferences.annotationPromptClient,
        preferences.agentRunConcurrency,
        preferences.assistantImageGenerationConfig,
        preferences.preferredPromptClient,
        workspace.activeProjectId,
        workspace.projectTitle,
    ]);

    const buildPromptActionAssistantContext = useCallback((targetPath?: string | null): AssistantContextV1 => {
        const normalizedTargetPath = String(targetPath || '').trim();
        if (!normalizedTargetPath) {
            return assistantController.assistantContextV1;
        }
        const currentFileDirectory = normalizedTargetPath.replace(/\/[^/]+$/u, '');
        return {
            ...assistantController.assistantContextV1,
            currentFile: {
                path: normalizedTargetPath,
                displayName: normalizedTargetPath.split('/').filter(Boolean).pop() || normalizedTargetPath,
            },
            extensions: {
                ...(assistantController.assistantContextV1.extensions || {}),
                paths: {
                    ...(readRecord(assistantController.assistantContextV1.extensions?.paths) || {}),
                    currentFilePath: normalizedTargetPath,
                    currentFileDirectory,
                },
                updatedAt: new Date().toISOString(),
            },
        };
    }, [assistantController.assistantContextV1]);

    const handleExecutePromptAction = useCallback(async (
        prompt: string,
        meta: { scene: string; targetPath?: string | null; autoSend?: boolean },
    ) => {
        const submitted = await handleSubmitAnnotationAssistantPrompt(
            buildPromptActionAssistantContext(meta.targetPath),
            prompt,
            { waitUntil: 'started', autoSend: meta.autoSend },
        );
        return Boolean(submitted);
    }, [buildPromptActionAssistantContext, handleSubmitAnnotationAssistantPrompt]);

    const handlePreviewNavigate = useCallback(async (target: ResolvedPreviewNavigateTarget): Promise<PreviewHostContext> => {
        const deepLinkTarget = target.deepLinkTarget;
        const resourceType = String(target.resourceType || '').trim();
        const resourceId = String(target.resourceId || '').trim();
        if (!resourceType || !resourceId || !deepLinkTarget) {
            throw new Error('preview_navigate requires a resource target');
        }
        handleInitialResourceDeepLinkHandled();

        const buildNextContext = (overrides: Partial<PreviewHostContext>): PreviewHostContext => ({
            projectId: requireProjectScope(workspace.activeProjectId).projectId,
            activeTab,
            viewMode,
            contentMode,
            selectedItem,
            selectedPageId: selectedPrototypePageId,
            selectedDoc: resources.selectedDoc,
            selectedTemplate: resources.selectedTemplate,
            selectedTheme: resources.selectedTheme,
            selectedCanvas: resources.selectedCanvas,
            currentUrl: buildIndexDeepLinkUrl({
                ...deepLinkTarget,
                ...(workspace.activeProjectId ? { projectId: workspace.activeProjectId } : {}),
            }),
            canvasSelection: null,
            resources: {
                prototypes: workspace.data?.prototypes || [],
                docs: workspace.docsItems,
                templates: resources.templateAssets,
                themes: resources.themes,
            },
            ...overrides,
        });

        if (target.resourceType === 'prototype' || target.resourceType === 'canvas') {
            const nextPageId = target.resourceType === 'canvas' ? null : target.pageId || null;
            setActiveTab('prototypes');
            setSidebarTab('prototype');
            setSelectedItem(target.resource);
            setSelectedPrototypePageId(nextPageId);
            if (target.resourceType === 'canvas') {
                setViewMode('canvas');
            } else {
                setViewMode('demo');
            }
            if (target.collapseSidebar) {
                setCollapsed(true);
            }
            return buildNextContext({
                activeTab: 'prototypes',
                viewMode: target.resourceType === 'canvas' ? 'canvas' : 'demo',
                contentMode: 'preview',
                selectedItem: target.resource,
                selectedPageId: nextPageId,
            });
        }

        if (target.resourceType === 'doc') {
            setActiveTab('prototypes');
            setSidebarTab('document');
            resources.setSelectedDoc(target.resource);
            setViewMode('demo');
            if (target.collapseSidebar) {
                setCollapsed(true);
            }
            return buildNextContext({
                activeTab: 'prototypes',
                viewMode: 'demo',
                contentMode: 'doc',
                selectedDoc: target.resource,
            });
        }

        if (target.resourceType === 'template') {
            setActiveTab('prototypes');
            setSidebarTab('assets');
            setResourceSection('templates');
            resources.setSelectedTemplate(target.resource);
            setViewMode('demo');
            if (target.collapseSidebar) {
                setCollapsed(true);
            }
            return buildNextContext({
                activeTab: 'prototypes',
                viewMode: 'demo',
                contentMode: 'template',
                selectedTemplate: target.resource,
            });
        }

        if (target.resourceType === 'theme') {
            setActiveTab('prototypes');
            setSidebarTab('assets');
            setResourceSection('themes');
            resources.setSelectedTheme(target.resource);
            setViewMode('demo');
            if (target.collapseSidebar) {
                setCollapsed(true);
            }
            return buildNextContext({
                activeTab: 'prototypes',
                viewMode: 'demo',
                contentMode: 'theme',
                selectedTheme: target.resource,
            });
        }

        throw new Error(`Unsupported preview resource type: ${resourceType}`);
    }, [
        activeTab,
        contentMode,
        resources.selectedCanvas,
        resources.selectedDoc,
        resources.selectedTemplate,
        resources.selectedTheme,
        resources.setSelectedDoc,
        resources.setSelectedTemplate,
        resources.setSelectedTheme,
        resources.templateAssets,
        resources.themes,
        handleInitialResourceDeepLinkHandled,
        setActiveTab,
        setCollapsed,
        setResourceSection,
        setSelectedItem,
        setSelectedPrototypePageId,
        setSidebarTab,
        setViewMode,
        selectedItem,
        selectedPrototypePageId,
        viewMode,
        workspace.activeProjectId,
        workspace.data?.prototypes,
        workspace.docsItems,
    ]);

    const preview = useIndexPagePreviewActions({
        projectId: workspace.activeProjectId,
        activeTab,
        collapsed,
        setCollapsed,
        sidebarTab,
        setSidebarTab,
        resourceSection,
        setResourceSection,
        selectedItem,
        selectedPageId: selectedPrototypePageId,
        onPrototypePageChange: setSelectedPrototypePageId,
        selectedDoc: resources.selectedDoc,
        selectedPrototypeSpec: prototypeSpec.currentItem,
        contentModeOverride: contentMode,
        onPrototypeSpecExit: prototypeSpec.close,
        setSelectedDoc: resources.setSelectedDoc,
        selectedTemplate: resources.selectedTemplate,
        setSelectedTemplate: resources.setSelectedTemplate,
        selectedTheme: resources.selectedTheme,
        projectCapabilities: workspace.projectCapabilities,
        messageApi,
        modal,
        appDialog,
        viewMode,
        isDarkMode,
        setIsDarkMode,
        openSettingsDialog,
        agentRunConcurrency: preferences.agentRunConcurrency,
        assistantContextV1: assistantController.assistantContextV1,
        assistantProjectPath: assistantController.assistantProjectPath,
        assistantContextAppendAvailable: assistantController.assistantContextAppendAvailable,
        onOpenAnnotationAssistant: assistantController.openAssistantWithContext,
        onSubmitAnnotationAssistantPrompt: handleSubmitAnnotationAssistantPrompt,
        onRunAnnotationAssistantPromptViaApi: handleRunAnnotationAssistantPromptViaApi,
        onRunReviewAssistantPromptViaApi: handleRunReviewAssistantPromptViaApi,
        probeAssistantRuntimeSilently: assistantController.probeAssistantRuntimeSilently,
        connectAssistantRuntimeSilently: assistantController.connectAssistantRuntimeSilently,
        syncAssistantCanvasComments: assistantController.syncAssistantCanvasComments,
        clearAssistantSelectedElementsOnExit: assistantController.clearAssistantSelectedElementsOnExit,
        onAiNotification: notifyAiNotification,
        onPrototypeRouteInfo: (routeInfo: PrototypeRouteInfo) => {
            if (!selectedItem) {
                return;
            }
            const nextPages = Array.isArray(routeInfo.pages)
                ? routeInfo.pages.map((page) => normalizePrototypeRoutePage(page)).filter((page): page is { id: string; title: string; group?: string } => Boolean(page))
                : [];
            if (nextPages.length === 0) {
                return;
            }
            workspace.setData((previous) => ({
                ...previous,
                prototypes: previous.prototypes.map((item) => {
                    if (!selectedItem || item.name !== selectedItem.name) {
                        return item;
                    }
                    return {
                        ...item,
                        pages: nextPages,
                        defaultPageId: normalizePrototypeRoutePageId(routeInfo.defaultPageId) || nextPages[0]?.id || '',
                    };
                }),
            }));
            setSelectedItem((previous) => {
                if (!previous || previous.name !== selectedItem?.name) {
                    return previous;
                }
                return {
                    ...previous,
                    pages: nextPages,
                    defaultPageId: normalizePrototypeRoutePageId(routeInfo.defaultPageId) || nextPages[0]?.id || '',
                };
            });
            setSelectedPrototypePageId((previousPageId) => (
                resolveSelectedPrototypePageAfterRouteInfo(previousPageId, routeInfo, nextPages)
            ));
        },
    });

    const prototypeSpecNavigation = usePrototypeSpecNavigationGuard({
        enabled: contentMode === 'prototype-spec' && prototypeSpec.isOpen,
        currentPath: prototypeSpec.currentPath,
        modifiedCount: preview.hostToolbarState?.modifiedCount ?? 0,
        getSourceWindow: () => preview.previewIframeRef.current?.contentWindow ?? null,
        navigate: prototypeSpec.navigate,
        clearCurrentPageAnnotations: () => preview.runHostToolbarAction({
            type: 'clear-edits',
            scope: 'page',
            skipConfirm: true,
        }),
        onError: (message) => {
            messageApi.error(message);
        },
    });

    useDocumentResourceNavigation({
        enabled: contentMode === 'doc',
        projectId: workspace.activeProjectId,
        docs: workspace.docsItems,
        getSourceWindow: () => preview.previewIframeRef.current?.contentWindow ?? null,
        navigate: (item, nextViewMode) => {
            setActiveTab('prototypes');
            setSidebarTab('document');
            resources.setSelectedResourceFolder(null);
            resources.setSelectedDoc(item);
            setViewMode(nextViewMode);
        },
    });

    const handlePrototypeSpecPreviewReady = useCallback(() => {
        const attemptedItem = prototypeSpec.currentItem;
        if (!attemptedItem || String(attemptedItem.name || '').toLowerCase().endsWith('.md')) return;
        const attemptId = prototypeSpecAnnotationAttemptIdRef.current + 1;
        prototypeSpecAnnotationAttemptIdRef.current = attemptId;
        void (async () => {
            const annotationEnabled = await preview.handleEnableDocEdit('comment', { disableSelectionMode: true, preserveSidebar: true });
            if (!shouldClosePrototypeSpecAfterAnnotationAttempt({
                enabled: annotationEnabled,
                attemptedItem,
                currentItem: currentPrototypeSpecItemRef.current,
                attemptId,
                latestAttemptId: prototypeSpecAnnotationAttemptIdRef.current,
            })) {
                return;
            }
            prototypeSpec.close();
        })();
    }, [preview.handleEnableDocEdit, prototypeSpec.close, prototypeSpec.currentItem]);

    const selection = useIndexPageSelectionSync({
        projectId: workspace.activeProjectId,
        loading: workspace.loading,
        data: workspace.data,
        docsItems: workspace.docsItems,
        templateAssets: resources.templateAssets,
        themes: workspace.themes,
        sidebarAssetsLoaded: workspace.sidebarAssetsLoaded,
        searchText: workspace.searchText,
        setSearchText: workspace.setSearchText,
        activeTab,
        setActiveTab,
        selectedItem,
        setSelectedItem,
        setSelectedPrototypePageId,
        setSelectedDoc: resources.setSelectedDoc,
        setSelectedResourceFolder: resources.setSelectedResourceFolder,
        setSelectedTemplate: resources.setSelectedTemplate,
        setSelectedTheme: resources.setSelectedTheme,
        sidebarTrees: workspace.sidebarTrees,
        sidebarTab,
        setSidebarTab,
        resourceSection,
        setResourceSection,
        viewMode,
        setViewMode,
        pendingReturnTarget,
        setPendingReturnTarget,
        prototypeStartDraftActive,
        initialResourceDeepLink: initialResourceDeepLinkHandled ? null : initialResourceDeepLink,
        onInitialResourceDeepLinkHandled: handleInitialResourceDeepLinkHandled,
        setCollapsed,
        editorMode: preview.editorStatus.mode,
        onExitWebEditor: preview.handleExitWebEditor,
    });

    const currentDeepLinkTarget = useMemo<ResourceDeepLinkTarget | null>(() => {
        const activeProjectId = workspace.activeProjectId;
        const currentContentIsDocumentResource = contentMode === 'doc' || (contentMode === 'canvas' && sidebarTab === 'document');
        if (contentMode === 'prototype-spec' && selectedItem) {
            return {
                resourceType: 'prototype',
                resourceId: selectedItem.resourceId || selectedItem.name,
                projectId: activeProjectId || undefined,
                openSpec: true,
                collapseSidebar: true,
            };
        }
        if (contentMode === 'preview' && selectedItem) {
            return {
                resourceType: 'prototype',
                resourceId: selectedItem.resourceId || selectedItem.name,
                view: viewMode,
                pageId: selectedPrototypePageId || undefined,
                projectId: activeProjectId || undefined,
            };
        }
        if (currentContentIsDocumentResource && resources.selectedDoc) {
            return {
                resourceType: resources.selectedDoc.projectDocumentPath ? 'project-doc' : 'doc',
                resourceId: resources.selectedDoc.projectDocumentPath || resources.selectedDoc.resourceId || resources.selectedDoc.name,
                view: contentMode === 'canvas' ? 'canvas' : 'demo',
                projectId: activeProjectId || undefined,
            };
        }
        if (contentMode === 'template' && resources.selectedTemplate) {
            return {
                resourceType: 'template',
                resourceId: resources.selectedTemplate.resourceId || resources.selectedTemplate.name,
                projectId: activeProjectId || undefined,
            };
        }
        if (contentMode === 'theme' && resources.selectedTheme) {
            return {
                resourceType: 'theme',
                resourceId: resources.selectedTheme.name,
                projectId: activeProjectId || undefined,
            };
        }
        return null;
    }, [contentMode, resources.selectedDoc, resources.selectedTemplate, resources.selectedTheme, selectedItem, selectedPrototypePageId, sidebarTab, viewMode, workspace.activeProjectId]);

    const currentDeepLinkUrl = useMemo(() => (
        currentDeepLinkTarget ? buildIndexDeepLinkUrl(currentDeepLinkTarget) : ''
    ), [currentDeepLinkTarget]);

    const previewBridgeContext = useMemo(() => ({
        projectId: workspace.activeProjectId,
        activeTab,
        viewMode,
        contentMode,
        selectedItem,
        selectedPageId: selectedPrototypePageId,
        selectedDoc: resources.selectedDoc,
        selectedTemplate: resources.selectedTemplate,
        selectedTheme: resources.selectedTheme,
        selectedCanvas: resources.selectedCanvas,
        currentUrl: currentDeepLinkUrl || (typeof window !== 'undefined' ? window.location.href : ''),
        canvasSelection: null,
        resources: {
            prototypes: workspace.data?.prototypes || [],
            docs: workspace.docsItems,
            templates: resources.templateAssets,
            themes: resources.themes,
        },
    }), [
        activeTab,
        contentMode,
        currentDeepLinkUrl,
        resources.selectedDoc,
        resources.selectedTemplate,
        resources.selectedTheme,
        resources.selectedCanvas,
        resources.templateAssets,
        resources.themes,
        selectedItem,
        selectedPrototypePageId,
        viewMode,
        workspace.activeProjectId,
        workspace.data?.prototypes,
        workspace.docsItems,
    ]);
    usePreviewBridgeHost({
        context: previewBridgeContext,
        onNavigate: handlePreviewNavigate,
    });

    const canSyncCurrentDeepLinkUrl = shouldSyncIndexDeepLinkUrl({
        currentTarget: currentDeepLinkTarget,
        initialTarget: initialResourceDeepLink,
        initialTargetHandled: initialResourceDeepLinkHandled,
    });

    useEffect(() => {
        if (!canSyncCurrentDeepLinkUrl || !currentDeepLinkUrl || typeof window === 'undefined') {
            return;
        }
        if (window.location.href === currentDeepLinkUrl) {
            return;
        }
        window.history.replaceState(window.history.state, '', currentDeepLinkUrl);
    }, [canSyncCurrentDeepLinkUrl, currentDeepLinkUrl]);

    const handleCopyCurrentAddress = useCallback(async () => {
        const targetUrl = currentDeepLinkUrl || (typeof window !== 'undefined' ? window.location.href : '');
        if (!targetUrl) {
            messageApi.error('当前没有可复制的地址');
            return;
        }
        try {
            await copyToClipboard(targetUrl);
            messageApi.success('当前地址已复制');
        } catch (error: any) {
            messageApi.error(error?.message || '复制地址失败');
        }
    }, [currentDeepLinkUrl, messageApi]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch('/api/make-state/health');
                const health = await response.json().catch(() => null);
                if (cancelled || !response.ok || readRecord(health).code !== MAKE_STATE_DIR_NOT_WRITABLE) {
                    return;
                }
                const confirmed = await appDialog.confirm({
                    title: '无法保存项目列表',
                    description: '本机数据目录不可写，新建项目可能失败。',
                    confirmText: '复制给 AI 处理',
                    cancelText: '稍后处理',
                    tone: 'brand',
                    dismissible: true,
                });
                if (!confirmed) {
                    return;
                }
                await copyToClipboard(buildMakeStatePermissionPrompt(health));
                messageApi.success('已复制给 AI 的处理说明');
            } catch {
                // Health checks should not block the main Make UI.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [appDialog, messageApi]);

    useEffect(() => {
        if (!preferences.initialPreferencesLoaded || !assistantAutoOpenTargetPath) {
            return;
        }
        if (prototypePlaceholderActive) {
            return;
        }
        if (prototypeWaitingGenerationActive) {
            return;
        }
        const autoOpenTargetKey = assistantAutoOpenTargetPath;
        if (onlineOpenAutoTriggeredRef.current === autoOpenTargetKey) {
            return;
        }
        if (onlineOpenAutoRestorePendingRef.current === autoOpenTargetKey) {
            return;
        }
        if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {
            return;
        }
        if (assistantAutoOpenSuppressedProjectScopeRef.current === assistantAutoOpenProjectScope) {
            return;
        }
        const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);
        onlineOpenAutoRestorePendingRef.current = autoOpenTargetKey;
        void Promise.resolve(restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode))
            .then((opened) => {
                if (opened) {
                    onlineOpenAutoTriggeredRef.current = autoOpenTargetKey;
                }
            })
            .finally(() => {
                if (onlineOpenAutoRestorePendingRef.current === autoOpenTargetKey) {
                    onlineOpenAutoRestorePendingRef.current = '';
                }
            });
    }, [
        assistantAutoOpenProjectScope,
        assistantAutoOpenTargetPath,
        assistantAutoOpenPanelModeStorageKey,
        assistantAutoOpenDismissedStorageKey,
        preferences.initialPreferencesLoaded,
        prototypePlaceholderActive,
        prototypeWaitingGenerationActive,
        restoreAssistantPanel,
    ]);

    const handleOpenAcpWebAgent = useCallback((targetPath?: string, provider?: AcpProvider) => {
        if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return;
        assistantAutoOpenSuppressedProjectScopeRef.current = '';
        setAssistantAutoOpenDismissed(buildAssistantAutoOpenKeyForTarget(targetPath), false);
        setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, 'general-ai');
        assistantController.handleOpenAcpWebAgent(targetPath, provider);
    }, [
        assistantController,
        assistantAutoOpenPanelModeStorageKey,
        buildAssistantAutoOpenKeyForTarget,
        ensureDefaultAiConfigured,
        preferences.preferredPromptClient,
    ]);

    const handleOpenImageAiPanel = useCallback(() => {
        if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return;
        assistantAutoOpenSuppressedProjectScopeRef.current = '';
        setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, false);
        setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, 'image-ai');
        assistantController.openImageAiPanel();
    }, [
        assistantAutoOpenDismissedStorageKey,
        assistantAutoOpenPanelModeStorageKey,
        assistantController,
        ensureDefaultAiConfigured,
        preferences.preferredPromptClient,
    ]);

    const handleCloseAiPanel = useCallback(() => {
        if (!assistantController.assistantVisible) {
            return;
        }
        setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, true);
        assistantController.hideAssistantPanelTemporarily();
    }, [
        assistantAutoOpenDismissedStorageKey,
        assistantController,
    ]);

    const handleCloseWebAgentPanel = useCallback(() => {
        if (assistantController.assistantVisible) {
            setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, true);
        }
        assistantController.handleToggleAssistant();
    }, [
        assistantAutoOpenDismissedStorageKey,
        assistantController,
    ]);

    const handleToggleAssistantPanel = useCallback(() => {
        if (!assistantController.assistantVisible) {
            assistantAutoOpenSuppressedProjectScopeRef.current = '';
        }
        setAssistantAutoOpenDismissed(
            assistantAutoOpenDismissedStorageKey,
            assistantController.assistantVisible,
        );
        assistantController.handleToggleAssistant();
    }, [
        assistantAutoOpenDismissedStorageKey,
        assistantController,
    ]);

    useEffect(() => {
        if (!prototypePlaceholderAutoCloseKey) {
            closedPrototypePlaceholderAutoCloseKeyRef.current = '';
            return;
        }
        if (!assistantController.assistantVisible) {
            return;
        }
        if (closedPrototypePlaceholderAutoCloseKeyRef.current === prototypePlaceholderAutoCloseKey) {
            return;
        }

        closedPrototypePlaceholderAutoCloseKeyRef.current = prototypePlaceholderAutoCloseKey;
        assistantController.hideAssistantPanelTemporarily();
    }, [
        assistantController.assistantVisible,
        assistantController.hideAssistantPanelTemporarily,
        prototypePlaceholderAutoCloseKey,
    ]);

    useEffect(() => {
        if (!assistantController.assistantPanelMounted) {
            return;
        }
        if (assistantController.assistantVisible) {
            return;
        }
        if (!preferences.initialPreferencesLoaded) {
            return;
        }
        if (prototypePlaceholderActive) {
            return;
        }
        if (prototypeWaitingGenerationActive) {
            return;
        }
        if (!assistantAutoOpenTargetPath) {
            return;
        }
        if (getAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey)) {
            return;
        }
        if (assistantAutoOpenSuppressedProjectScopeRef.current === assistantAutoOpenProjectScope) {
            return;
        }

        const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);
        restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);
    }, [
        assistantAutoOpenProjectScope,
        assistantAutoOpenDismissedStorageKey,
        assistantAutoOpenPanelModeStorageKey,
        assistantAutoOpenTargetPath,
        assistantController.assistantPanelMounted,
        assistantController.assistantVisible,
        preferences.initialPreferencesLoaded,
        prototypePlaceholderActive,
        prototypeWaitingGenerationActive,
        restoreAssistantPanel,
    ]);

    useEffect(() => {
        if (!prototypeWaitingGenerationActive) {
            openedPrototypeWaitingGenerationKeyRef.current = '';
            return;
        }
        if (!preferences.initialPreferencesLoaded) {
            return;
        }
        if (!prototypeWaitingGenerationAutoOpenKey) {
            return;
        }
        const waitingGenerationAutoOpenKey = prototypeWaitingGenerationAutoOpenKey;
        if (openedPrototypeWaitingGenerationKeyRef.current === waitingGenerationAutoOpenKey) {
            return;
        }
        if (!assistantAutoOpenTargetPath) {
            return;
        }
        assistantAutoOpenSuppressedProjectScopeRef.current = '';
        setAssistantAutoOpenDismissed(assistantAutoOpenDismissedStorageKey, false);
        const rememberedAiPanelMode = getAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey);
        setAssistantAutoOpenPanelMode(assistantAutoOpenPanelModeStorageKey, rememberedAiPanelMode);
        openedPrototypeWaitingGenerationKeyRef.current = waitingGenerationAutoOpenKey;
        void restoreAssistantPanel(assistantAutoOpenTargetPath, rememberedAiPanelMode);
    }, [
        assistantAutoOpenDismissedStorageKey,
        assistantAutoOpenPanelModeStorageKey,
        assistantAutoOpenTargetPath,
        preferences.initialPreferencesLoaded,
        prototypeWaitingGenerationActive,
        prototypeWaitingGenerationAutoOpenKey,
        restoreAssistantPanel,
    ]);

    useEffect(() => {
        workspace.ensureSidebarTreeLoaded(sidebarTab);
    }, [sidebarTab, workspace.ensureSidebarTreeLoaded, workspace.loading]);

    const resourceWriteCapabilities = workspace.projectCapabilities.resourceWrites || DEFAULT_RESOURCE_WRITE_CAPABILITIES;
    const localExportCapabilities = workspace.projectCapabilities.localExports || DEFAULT_LOCAL_EXPORT_CAPABILITIES;
    const lanAccessAllowed = workspace.projectCapabilities.lanAccessAllowed !== false;

    const ideActions = useIdeActions({
        messageApi,
        preferredIDE: preferences.preferredIDE,
        ideAvailability: preferences.ideAvailability,
        activeProjectId: workspace.activeProjectId,
        selectedItem,
        currentMarkdownResource: {
            kind: currentMarkdownResource.kind,
            item: currentMarkdownItem,
            label: currentMarkdownLabel,
        },
        selectedTheme: resources.selectedTheme,
        selectedDataTable: resources.selectedDataTable,
    });
    const openFileInIDE = ideActions.openFileInIDE;
    const prototypes = workspace.data?.prototypes;
    const docsItems = workspace.docsItems;

    const getCurrentReturnTarget = (): PendingReturnTarget => ({
        sidebarTab,
        resourceId: sidebarTab === 'prototype'
            ? selectedItem?.name ?? null
            : sidebarTab === 'document'
                ? resources.selectedDoc?.name ?? null
                : null,
        pageId: sidebarTab === 'prototype' ? selectedPrototypePageId : null,
        viewMode,
    });

    const handleStartCurrentProjectServer = async () => {
        if (startServerLoading) {
            return;
        }
        setPendingReturnTarget((previous) => previous ?? getCurrentReturnTarget());
        setStartServerError('');
        setStartServerErrorPrompt('');
        setStartServerLoading(true);
        const hide = messageApi.loading('正在启动客户端...', 0);
        try {
            const payload = await workspace.startActiveProjectServer();
            setStartServerErrorPrompt('');
            messageApi.success(payload?.reused ? '客户端已在运行' : '客户端已启动');
        } catch (error: any) {
            const message = error?.message || '启动客户端失败';
            const diagnostic = error?.diagnostic || error;
            setStartServerError(message);
            setStartServerErrorPrompt(buildMakeClientStartupFailurePrompt(diagnostic, {
                projectName: workspace.projectTitle,
                displayMessage: message,
                currentUrl: typeof window !== 'undefined' ? window.location.href : '',
            }));
            messageApi.error(message);
        } finally {
            hide();
            setStartServerLoading(false);
        }
    };

    const handleCopyStartServerErrorPrompt = useCallback(async () => {
        const fallbackPrompt = startServerError
            ? buildMakeClientStartupFailurePrompt({
                projectId: workspace.activeProjectId,
                error: startServerError,
            }, {
                projectName: workspace.projectTitle,
                displayMessage: startServerError,
                currentUrl: typeof window !== 'undefined' ? window.location.href : '',
            })
            : '';
        const prompt = startServerErrorPrompt || fallbackPrompt;
        if (!prompt) {
            messageApi.error('当前没有可复制的启动错误');
            return;
        }
        try {
            await copyToClipboard(prompt);
            messageApi.success('已复制给 AI 的处理说明');
        } catch (error: any) {
            messageApi.error(error?.message || '复制失败');
        }
    }, [messageApi, startServerError, startServerErrorPrompt, workspace.activeProjectId, workspace.projectTitle]);

    const handleOpenCanvasInIDE = useCallback(async (canvasFilePath: string) => {
        const targetPath = canvasFilePath.trim();
        await openFileInIDE({
            filePath: targetPath,
            copyText: targetPath ? `[画布](${targetPath})` : undefined,
            projectId: workspace.activeProjectId?.trim() || undefined,
            emptySelectionMessage: '当前画布文件路径不可用，无法在编辑器中打开',
        });
    }, [openFileInIDE, workspace.activeProjectId]);

    const handleOpenCanvasAgent = useCallback(async () => {
        await Promise.resolve(handleOpenAcpWebAgent());
    }, [handleOpenAcpWebAgent]);

    const handleRefreshCanvasPrototypeItems = useCallback(async (preferredName?: string) => {
        await workspace.loadData();
        let nextPrototypes: ItemData[] = workspace.data.prototypes;
        const projectId = workspace.activeProjectId?.trim();
        if (projectId) {
            const projectResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/resources`).catch(() => null);
            if (projectResponse?.ok) {
                const payload = await projectResponse.json().catch(() => null);
                nextPrototypes = normalizeProjectResourcesPayload(payload, projectId).data.prototypes;
            }
        }
        if (projectId && nextPrototypes === workspace.data.prototypes) {
            const response = await fetch(withProjectScope('/api/entries.json', { projectId })).catch(() => null);
            if (response?.ok) {
                const body = await response.json().catch(() => null);
                nextPrototypes = Array.isArray(body?.prototypes) ? body.prototypes : workspace.data.prototypes;
            }
        }
        const targetName = String(preferredName || selectedItem?.name || '').trim();
        const refreshedSelectedItem = targetName
            ? nextPrototypes.find((item) => item.name === targetName)
            : null;
        if (refreshedSelectedItem) {
            setSelectedItem(refreshedSelectedItem);
        }
        return nextPrototypes;
    }, [selectedItem?.name, setSelectedItem, workspace]);

    const handleCreatePrototypeForDraftStart = useCallback(async (): Promise<ItemData | null> => {
        try {
            const result = await apiService.createPlaceholderPrototype(requireProjectScope(workspace.activeProjectId));
            const createdFromResult = buildCreatedPrototypeStartItem(result);
            if (!createdFromResult) {
                throw new Error('创建原型失败');
            }
            const refreshedPrototypes = await handleRefreshCanvasPrototypeItems(createdFromResult.name);
            const created = refreshedPrototypes.find((item) => item.name === createdFromResult.name) || createdFromResult;
            setSelectedItem(created);
            setSelectedPrototypePageId(null);
            setSidebarTab('prototype');
            setViewMode('demo');
            setPrototypeStartDraftActive(false);
            return created;
        } catch (error: any) {
            messageApi.error(error?.message || '创建原型失败');
            return null;
        }
    }, [
        handleRefreshCanvasPrototypeItems,
        messageApi,
        setSelectedItem,
        setSelectedPrototypePageId,
        setSidebarTab,
        setViewMode,
        workspace.activeProjectId,
    ]);

    const buildCanvasAssistantContext = useCallback((request: CanvasAiGenerationRequest): AssistantContextV1 => {
        const canvasFilePath = String(request.canvasFilePath || '').trim();
        const requestPrototypeItem = request.createdPrototype || selectedItem;
        const isPrototypePlaceholderStart = request.source === 'placeholder-start' && request.scene === 'page';
        const isStartGuideCanvasGeneration = request.source === 'placeholder-start'
            || request.source === 'resource-start'
            || request.source === 'theme-start';
        const placeholderStartCurrentFile = isPrototypePlaceholderStart
            ? resolveAssistantCurrentFile({
                selectedItem: requestPrototypeItem,
                activeTab,
                viewMode: 'demo',
                contentMode: 'preview',
                currentMarkdownResource,
                currentCanvas: resources.selectedCanvas,
                currentTheme: resources.selectedTheme,
                currentDataTable: resources.selectedDataTable,
            })
            : null;
        const canvasCurrentFile = canvasFilePath
            ? {
                path: canvasFilePath,
                displayName: canvasFilePath.split('/').filter(Boolean).pop() || 'canvas.excalidraw',
            }
            : resolveAssistantCurrentFile({
            selectedItem: requestPrototypeItem,
            activeTab,
            viewMode,
            contentMode,
            currentMarkdownResource,
            currentCanvas: resources.selectedCanvas,
            currentTheme: resources.selectedTheme,
            currentDataTable: resources.selectedDataTable,
        });
        const currentFile = isPrototypePlaceholderStart
            ? placeholderStartCurrentFile || ''
            : canvasCurrentFile || '';
        const currentFilePath = isPrototypePlaceholderStart ? getAssistantContextCurrentFilePath({ currentFile }) : canvasFilePath || getAssistantContextCurrentFilePath({ currentFile });
        const currentFileDirectory = currentFilePath.replace(/\/[^/]+$/u, '');

        return {
            version: '1',
            systemContext: '',
            currentFile,
            selectedElements: [],
            extensions: {
                ...(assistantController.assistantContextV1.extensions || {}),
                viewMode: isPrototypePlaceholderStart ? 'demo' : isStartGuideCanvasGeneration ? 'demo' : 'canvas',
                activeTab,
                contentMode,
                selectedItem: requestPrototypeItem
                    ? {
                        name: requestPrototypeItem.name,
                        displayName: requestPrototypeItem.displayName,
                        clientUrl: requestPrototypeItem.clientUrl,
                        previewUrl: requestPrototypeItem.previewUrl,
                        specUrl: requestPrototypeItem.specUrl,
                    }
                    : null,
                paths: {
                    currentFilePath,
                    currentFileDirectory,
                },
                canvasAiGeneration: {
                    scene: request.scene,
                    source: request.source || 'canvas-node',
                    generatorId: request.generatorId,
                    canvasFilePath: isStartGuideCanvasGeneration ? undefined : request.canvasFilePath,
                    attachments: request.attachments || [],
                    referenceImages: request.referenceImages || [],
                    localContextRefs: isPrototypePlaceholderStart ? [] : request.localContextRefs || [],
                    provider: request.provider,
                    model: request.model,
                    mode: request.mode,
                    thought: request.thought,
                    contextBundle: request.contextBundle,
                    statusTaskId: request.statusTaskId,
                    canvasContext: {
                        canvasFilePath: request.canvasFilePath,
                        canvasName: currentFilePath,
                        generatorElementId: request.generatorId,
                        source: request.source || 'canvas-node',
                        statusTaskId: request.statusTaskId,
                    },
                },
                updatedAt: new Date().toISOString(),
            },
        };
    }, [
        activeTab,
        assistantController.assistantContextV1.extensions,
        contentMode,
        currentMarkdownResource,
        resources.selectedCanvas,
        resources.selectedDataTable,
        resources.selectedTheme,
        selectedItem,
        viewMode,
    ]);

    const handleSubmitCanvasAssistantPrompt = useCallback(async (request: CanvasAiGenerationRequest) => {
        const prompt = String(request.prompt || '').trim();
        if (!prompt) {
            messageApi.warning('请输入提示词');
            return { ok: false };
        }
        if (!ensureDefaultAiConfigured(preferences.preferredPromptClient)) return { ok: false };
        const annotationPromptClient = preferences.annotationPromptClient || preferences.preferredPromptClient;
        const annotationProvider = resolveAcpPromptClientProvider(annotationPromptClient);
        if (!annotationProvider) return { ok: false };
        const selectedProvider = resolveAcpPromptClientProvider(request.provider) || annotationProvider;
        const annotationModel = preferences.annotationModel || null;
        const canvasAssistantContext = buildCanvasAssistantContext(request);
        const shouldOpenStartGuideConversation = request.source === 'resource-start'
            || request.source === 'theme-start';
        if (shouldOpenStartGuideConversation) {
            const submitted = await handleSubmitAnnotationAssistantPrompt(
                canvasAssistantContext,
                prompt,
                {
                    forceNewThread: true,
                    waitUntil: 'started',
                    provider: selectedProvider,
                    model: request.model ?? annotationModel,
                    mode: request.mode,
                    thought: request.thought,
                },
            );
            return { ok: Boolean(submitted && (typeof submitted !== 'object' || submitted.ok !== false)) };
        }
        const result = await submitAnnotationPromptViaApi({
            context: canvasAssistantContext,
            prompt,
            projectPath: assistantController.assistantProjectPath,
            projectScope: workspace.activeProjectId || assistantController.assistantProjectPath || workspace.projectTitle,
            projectId: requireProjectScope(workspace.activeProjectId).projectId,
            preferredPromptClient: selectedProvider ? `acp:${selectedProvider}` : annotationPromptClient,
            scene: `canvas-${request.scene}-direct`,
            provider: selectedProvider,
            model: request.model ?? annotationModel,
            mode: request.mode,
            thought: request.thought,
            targetPath: request.canvasFilePath || undefined,
            agentRunConcurrency: preferences.agentRunConcurrency,
            mcpServers: buildCanvasMcpServersForDirectRun(getAssistantContextCurrentFilePath(canvasAssistantContext)),
            builtinToolSettings: preferences.assistantImageGenerationConfig
                ? { imageGeneration: preferences.assistantImageGenerationConfig }
                : undefined,
            onPrepared: request.onPrepared,
            onAccepted: request.onAccepted,
            signal: request.signal,
        });
        if (!result) {
            return { ok: false };
        }
        const artifacts = mapCanvasDirectRunArtifacts((result.artifacts || []) as Record<string, unknown>[], {
            canvasFilePath: request.canvasFilePath,
            taskId: result.runId,
            runId: result.runId,
            threadId: result.threadId,
        });
        return { ok: true, artifacts };
    }, [
        assistantController.assistantProjectPath,
        buildCanvasAssistantContext,
        ensureDefaultAiConfigured,
        handleSubmitAnnotationAssistantPrompt,
        messageApi,
        preferences.annotationModel,
        preferences.annotationPromptClient,
        preferences.agentRunConcurrency,
        preferences.assistantImageGenerationConfig,
        preferences.preferredPromptClient,
        workspace.activeProjectId,
        workspace.projectTitle,
    ]);

    const switchProjectWithReturnTarget = async (projectId: string) => {
        setPendingReturnTarget(getCurrentReturnTarget());
        await workspace.switchProject(projectId);
    };

    const connectBridge = bridge.connect;
    const clearBridgeContext = bridge.clearContext;
    const disconnectBridge = bridge.disconnect;
    const assistantVisible = assistantController.assistantVisible;

    // Connect the bridge when the OpenCode panel opens;
    // disconnect when it closes. The hook handles reconnection internally.
    useEffect(() => {
        if (assistantVisible) {
            connectBridge();
        } else {
            clearBridgeContext();
            disconnectBridge();
        }
    }, [assistantVisible, connectBridge, clearBridgeContext, disconnectBridge]);

    // Auto-sync bridge context when the user's active selection changes.
    useOpenCodeBridgeSync({
        bridge,
        selectedItem,
        selectedDoc: resources.selectedDoc,
        selectedCanvas: resources.selectedCanvas,
        selectedTheme: resources.selectedTheme,
        resourceSection,
        sidebarTab,
        viewMode,
    });

    // ── Canvas → Bridge context callbacks ──
    const handleAddCanvasElementsToContext = useCallback((elements: CanvasElementContextInfo[]) => {
        const currentFilePath = resolveOpenCodeCurrentFilePath({
            selectedItem,
            selectedDoc: resources.selectedDoc,
            selectedCanvas: resources.selectedCanvas,
            selectedTheme: resources.selectedTheme,
            resourceSection,
            sidebarTab,
            viewMode,
        }) || assistantCurrentFilePath || '';

        assistantController.addCanvasElementsToAssistantContext(elements, currentFilePath);

        if (bridge.connectionState !== 'connected') return;
        for (const info of elements) {
            const comment = [
                info.title ? `元素: ${info.title}` : `元素: ${info.type}`,
                info.annotation ? `标注: ${info.annotation}` : '',
                info.link ? `链接: ${info.link}` : '',
            ].filter(Boolean).join('\n');
            bridge.addContext({
                id: `axhub:canvas-element:${info.elementId}`,
                type: 'file',
                path: currentFilePath,
                comment,
                preview: info.title || info.type || info.elementId,
            });
        }
    }, [assistantController.addCanvasElementsToAssistantContext, assistantCurrentFilePath, bridge, resourceSection, selectedItem, resources.selectedDoc, resources.selectedCanvas, resources.selectedTheme, sidebarTab, viewMode]);

    const [canvasAnnotations, setCanvasAnnotations] = useState<CanvasElementContextInfo[]>([]);
    const handleCanvasAnnotationsChange = useCallback((annotations: CanvasElementContextInfo[]) => {
        setCanvasAnnotations(annotations);
    }, []);

    const handleAddCanvasScreenshotToAssistant = useCallback(async (attachment: AssistantImageAttachmentPayload) => {
        return assistantController.addImageAttachment(attachment);
    }, [assistantController.addImageAttachment]);

    const handleAddCanvasImageToAssistant = useCallback(async (attachment: AssistantImageAttachmentPayload, promptText?: string) => {
        const added = await assistantController.addImageAttachment(attachment);
        if (!added) return false;
        const prompt = String(promptText || '').trim();
        if (!prompt) return true;
        return assistantController.appendComposerText(prompt);
    }, [assistantController.addImageAttachment, assistantController.appendComposerText]);

    // Auto-sync annotations to bridge context
    const prevSyncedAnnotationIdsRef = React.useRef<Set<string>>(new Set());
    useEffect(() => {
        const currentIds = new Set(canvasAnnotations.map(a => a.elementId));
        const prevIds = prevSyncedAnnotationIdsRef.current;

        const currentFilePath = resolveOpenCodeCurrentFilePath({
            selectedItem,
            selectedDoc: resources.selectedDoc,
            selectedCanvas: resources.selectedCanvas,
            selectedTheme: resources.selectedTheme,
            resourceSection,
            sidebarTab,
            viewMode,
        }) || '';

        syncAssistantCanvasComments(canvasAnnotations, assistantCurrentFilePath);

        if (bridge.connectionState === 'connected') {
            // Remove annotations that no longer exist
            for (const prevId of prevIds) {
                if (!currentIds.has(prevId)) {
                    bridge.removeContext(`axhub:canvas-annotation:${prevId}`);
                }
            }

            // Add or update current annotations
            for (const ann of canvasAnnotations) {
                const item = resolveOpenCodeCanvasAnnotationContext(ann, currentFilePath);
                if (!item) continue;
                if (prevIds.has(ann.elementId)) {
                    bridge.updateContext(item);
                } else {
                    bridge.addContext(item);
                }
            }
        }

        prevSyncedAnnotationIdsRef.current = currentIds;
    }, [assistantCurrentFilePath, bridge, canvasAnnotations, resourceSection, selectedItem, resources.selectedDoc, resources.selectedCanvas, resources.selectedTheme, sidebarTab, syncAssistantCanvasComments, viewMode]);

    // Handle "open in editor" from canvas embed toolbar
    useEffect(() => {
        function handleEmbedOpenInEditorDetail(detail: any) {
            if (!detail?.link) return;

            const embedLink = String(detail.link).trim();
            const embedKind = detail.kind; // 'web' | 'doc'
            const embedTitle = detail.title || '';

            // Resolve embed URL to an item with a file path
            let matchedItem: ItemData | null = null;
            if (embedKind === 'doc') {
                // Doc embeds: match by specUrl or previewUrl
                matchedItem = docsItems.find((item) =>
                    item.specUrl === embedLink || item.previewUrl === embedLink,
                ) ?? null;
            } else {
                // Prototype embeds: match by previewUrl or clientUrl
                matchedItem = (prototypes || []).find((item) =>
                    item.previewUrl === embedLink || item.clientUrl === embedLink,
                ) ?? null;
            }

            if (!matchedItem) {
                // Fallback: try matching by name substring from URL
                // e.g., /preview/my-prototype → prototypes find by name
                const urlPath = embedLink.replace(/^https?:\/\/[^/]+/, '');
                matchedItem = (prototypes || []).find((item) =>
                    urlPath.includes(item.name),
                ) ?? docsItems.find((item) =>
                    urlPath.includes(item.name),
                ) ?? null;
            }

            const filePath = getExplicitLocalPath(matchedItem);
            const basePath = filePath ? stripIndexFilePath(filePath) : '';

            void openFileInIDE({
                filePath: filePath || undefined,
                copyText: matchedItem && filePath
                    ? `[${matchedItem.displayName || embedTitle}](${basePath || filePath})`
                    : undefined,
                projectId: matchedItem?.projectId,
                emptySelectionMessage: matchedItem
                    ? '当前资源未声明本地文件路径，无法在 IDE 中打开'
                    : '未找到对应的本地文件路径，无法在 IDE 中打开',
            });
        }

        const handler = (e: Event) => {
            handleEmbedOpenInEditorDetail((e as CustomEvent).detail);
        };

        const messageHandler = (event: MessageEvent) => {
            if (event.source === window) return;
            if (event.origin !== window.location.origin) return;

            const payload = event.data;
            if (payload?.type !== 'axhub:embedOpenInEditor') return;
            handleEmbedOpenInEditorDetail(payload.detail);
        };

        window.addEventListener('axhub:embedOpenInEditor', handler);
        window.addEventListener('message', messageHandler);
        return () => {
            window.removeEventListener('axhub:embedOpenInEditor', handler);
            window.removeEventListener('message', messageHandler);
        };
    }, [openFileInIDE, prototypes, docsItems]);

    const sidebarProps = useIndexPageSidebarPropsBuilder({
        state: {
            collapsed,
            loading: workspace.loading,
            sidebarTab,
            viewMode,
            data: workspace.data,
            docsItems: workspace.docsItems,
            canvasItems: workspace.canvasItems,
            themes: workspace.themes,
            defaultThemeName: resources.defaultThemeName,
            searchText: workspace.searchText,
            selectedItem,
            prototypeStartDraftActive,
            resourceStartDraftActive,
            themeStartDraftActive,
            selectedPrototypePageId,
            resourceSection,
            projectTitle: workspace.projectTitle,
            activeProjectId: workspace.activeProjectId,
            projectSetupRequired: workspace.projectSetupRequired,
            makeClientUpdateAvailable,
            makeClientUpdateReminderVisible,
            projects: workspace.projects,
            resourceWriteCapabilities,
            localExportCapabilities,
            lanAccessAllowed,
            isDarkMode,
            sidebarTrees: workspace.sidebarTrees,
            prototypeStartPageActive,
            webAgentPanelOpen: assistantController.assistantVisible,
            aiPanelMode: assistantController.aiPanelMode,
            selectedDoc: resources.selectedDoc,
            selectedResourceFolder: resources.selectedResourceFolder,
            selectedCanvas: resources.selectedCanvas,
            selectedTheme: resources.selectedTheme,
        },
        deps: {
            preferredPromptClient: preferences.preferredPromptClient,
            preferredIDE: preferences.preferredIDE,
            ideAvailability: preferences.ideAvailability,
            agentAvailability: preferences.agentAvailability,
            setPreferredIDE: preferences.setPreferredIDE,
            setIsDarkMode,
            openSettingsDialog,
            setVersionCollaborationDrawerOpen,
            setActiveTab,
            setSidebarTab,
            setViewMode,
            setResourceSection,
            setSearchText: workspace.setSearchText,
            switchProject: switchProjectWithReturnTarget,
            deleteProject: workspace.deleteProject,
            stopProjectDevServer: workspace.stopProjectDevServer,
            addProjectFromLocalPath: workspace.addProjectFromLocalPath,
            createBlankMakeProject: workspace.createBlankMakeProject,
            cloneMakeProject: workspace.cloneMakeProject,
            copyMakeProject: workspace.copyMakeProject,
            loadProjects: workspace.loadProjects,
            setCreateDialogVisible,
            setInitialCreateDialogTab,
            handleTabChange: selection.handleTabChange,
            handleMenuClick: selection.handleMenuClick,
            setSelectedPrototypePageId,
            handleCreatePrototypeStartDraft,
            handleCreateResourceStartDraft,
            handleCreateThemeStartDraft,
            handleOpenProjectInIDE: ideActions.handleOpenProjectInIDE,
            handleOpenAcpWebAgent,
            handleOpenImageAiPanel,
            handleOpenWebAgentInPanel: assistantController.openRawUrlInAssistantPanel,
            onExecutePrompt: handleExecutePromptAction,
            onCloseAiPanel: handleCloseAiPanel,
            onCloseWebAgentPanel: handleCloseWebAgentPanel,
            handleOpenSelectedDocInIDE: ideActions.handleOpenSelectedDocInIDE,
            handleOpenSelectedThemeInIDE: ideActions.handleOpenSelectedThemeInIDE,
            handleOpenSelectedThemeDocInIDE: ideActions.handleOpenSelectedThemeDocInIDE,
            handleCopyItemPath: ideActions.handleCopyItemPath,
            previewHandleSelectDoc: preview.handleSelectDoc,
            resources,
        },
    });

    const handleEnterSelectedPrototypePreview = useCallback(() => {
        setActiveTab('prototypes');
        setSidebarTab('prototype');
        setViewMode('demo');
    }, [setActiveTab, setSidebarTab, setViewMode]);

    const presentationAreaProps = useIndexPagePresentationPropsBuilder({
        state: {
            collapsed,
            selectedItem,
            prototypeStartDraftActive,
            resourceStartDraftActive,
            themeStartDraftActive,
            viewMode,
            activeTab,
            assistantVisible: assistantController.assistantVisible,
            isDarkMode,
            contentMode,
            docsItems: workspace.docsItems,
            sidebarTrees: workspace.sidebarTrees,
            selectedDoc: resources.selectedDoc,
            selectedPrototypeSpec: prototypeSpec.currentItem,
            prototypeSpecSupported: prototypeSpec.isSupported,
            prototypeSpecLoading: prototypeSpec.loading,
            selectedResourceFolder: resources.selectedResourceFolder,
            selectedTemplate: resources.selectedTemplate,
            selectedCanvas: resources.selectedCanvas,
            canvasItems: workspace.canvasItems,
            selectedTheme: resources.selectedTheme,
            selectedDataTable: resources.selectedDataTable,
            defaultThemeName: resources.defaultThemeName,
            preferredPromptClient: preferences.preferredPromptClient,
            preferredIDE: preferences.preferredIDE,
            ideAvailability: preferences.ideAvailability,
            agentAvailability: preferences.agentAvailability,
            projectRuntimeStatus: workspace.projectRuntimeStatus,
            projectRuntimeStatusLoading: workspace.projectRuntimeStatusLoading,
            projectAccessDeniedReason: workspace.projectAccessDeniedReason,
            projectSetupRequired: workspace.projectSetupRequired,
            lanAccessAllowed,
            hasPrototypeItems: workspace.data.prototypes.length > 0,
            hasDocItems: workspace.docsItems.length > 0,
            excalidrawPropertyPanelMode,
            excalidrawPropertyPanelPosition,
            bridgeConnected: assistantController.assistantContextAppendAvailable,
            activeProjectId: workspace.activeProjectId,
            webAgentPanelOpen: assistantController.assistantVisible,
            aiPanelMode: assistantController.aiPanelMode,
            assistantApiBaseUrl: assistantController.assistantApiBaseUrl,
            assistantProjectPath: assistantController.assistantProjectPath,
            prototypes: workspace.data.prototypes,
            themes: workspace.themes,
            onOpenPrototypeCreateDialog: handleOpenPrototypeCreateDialog,
        },
        preview,
        actions: {
            setCollapsed,
            setViewMode,
            handleEnterSelectedPrototypePreview,
            handleToggleAssistant: handleToggleAssistantPanel,
            handleStartCurrentProjectServer,
            handleCopyStartServerErrorPrompt,
            handleOpenIdeFile: ideActions.handleOpenIdeFile,
            handleOpenSelectedDocInIDE: ideActions.handleOpenSelectedDocInIDE,
            handleOpenPrototypeSpec: prototypeSpec.open,
            handlePrototypeSpecPreviewReady,
            handleOpenSelectedThemeInIDE: ideActions.handleOpenSelectedThemeInIDE,
            handleOpenSelectedThemeDocInIDE: ideActions.handleOpenSelectedThemeDocInIDE,
            handleOpenSelectedDataTableInIDE: ideActions.handleOpenSelectedDataTableInIDE,
            handleCopyCurrentAddress,
            onSelectResourceFolder: resources.handleSelectResourceFolder,
            onSelectResourceFolderItem: (item) => {
                resources.setSelectedResourceFolder(null);
                preview.handleSelectDoc(item);
                setViewMode('demo');
            },
            onOpenResourceFolderInSystem: resources.handleOpenResourceFolderInSystem,
            setExcalidrawPropertyPanelMode: handleExcalidrawPropertyPanelModeChange,
            setExcalidrawPropertyPanelPosition: handleExcalidrawPropertyPanelPositionChange,
            onAddCanvasElementToContext: handleAddCanvasElementsToContext,
            onCanvasAnnotationsChange: handleCanvasAnnotationsChange,
            onAddCanvasScreenshotToAI: handleAddCanvasScreenshotToAssistant,
            onAddCanvasImageToAI: handleAddCanvasImageToAssistant,
            onOpenCanvasInIDE: handleOpenCanvasInIDE,
            onOpenCanvasAgent: handleOpenCanvasAgent,
            handleOpenProjectInIDE: ideActions.handleOpenProjectInIDE,
            onOpenAcpWebAgent: handleOpenAcpWebAgent,
            onOpenImageAiPanel: handleOpenImageAiPanel,
            onOpenWebAgentInPanel: assistantController.openRawUrlInAssistantPanel,
            onExecutePrompt: handleExecutePromptAction,
            onCloseAiPanel: handleCloseAiPanel,
            onCloseWebAgentPanel: handleCloseWebAgentPanel,
            onPreferredIDEChange: preferences.setPreferredIDE,
            openSettingsDialog,
            onCreatePrototypeForDraftStart: handleCreatePrototypeForDraftStart,
            onUploadResourceFiles: handleOpenStartGuideResourceUpload,
            onCreateResourceCanvasFile: resources.handleCreateResourceCanvasFile,
            onCreateDrawioResourceFile: resources.handleCreateDrawioResourceFile,
            onOpenDesignImport: resources.handleImportThemeResource,
            onRefreshPrototypes: handleRefreshCanvasPrototypeItems,
            agentRunConcurrency: preferences.agentRunConcurrency,
            onSubmitCanvasAssistantPrompt: handleSubmitCanvasAssistantPrompt,
        },
        ui: {
            startServerLoading,
            startServerError,
        },
    });

    const handleMobileItemClick = (item: ItemData) => {
        const targetUrl = resolveMobileItemOpenUrl(item);
        if (!targetUrl) {
            return;
        }
        window.open(targetUrl, '_blank');
    };

    const assistantPanelProps = {
        mounted: assistantController.assistantPanelMounted,
        visible: assistantController.assistantVisible,
        width: assistantController.assistantPanelWidth,
        minWidth: assistantController.assistantPanelMinWidth,
        maxWidth: assistantController.assistantPanelMaxWidth,
        iframeEntries: assistantController.assistantIframeEntries,
        activeIframeKey: assistantController.assistantActiveIframeKey,
        onIframeRef: assistantController.handleAssistantIframeRef,
        onIframeLoad: assistantController.handleAssistantIframeLoad,
        onResize: assistantController.setAssistantPanelWidth,
        onAddContextItems: assistantController.addContextItems,
        onToggle: handleToggleAssistantPanel,
    };

    const dialogsProps = {
        prototypeSpecPromptDialog: prototypeSpec.promptOpen ? {
            prompt: prototypeSpec.prompt,
            targetPath: prototypeSpec.promptTargetPath,
            onOpenChange: prototypeSpec.setPromptOpen,
        } : null,
        prototypeSpecNavigationDialog: prototypeSpecNavigation.pendingTargetPath ? {
            targetPath: prototypeSpecNavigation.pendingTargetPath,
            annotationCount: preview.hostToolbarState?.modifiedCount ?? 0,
            clearing: prototypeSpecNavigation.clearing,
            onContinue: prototypeSpecNavigation.continueNavigation,
            onClearAndContinue: prototypeSpecNavigation.clearAndContinue,
            onCancel: prototypeSpecNavigation.cancelNavigation,
        } : null,
        docReferencePromptDialog: resources.docReferencePromptDialog,
        setDocReferencePromptDialog: resources.setDocReferencePromptDialog,
        preferredPromptClient: preferences.preferredPromptClient,
        preferredIDE: preferences.preferredIDE,
        ideAvailability: preferences.ideAvailability,
        assistantOpen: assistantController.assistantVisible && assistantController.aiPanelMode === 'general-ai',
        onExecutePrompt: handleExecutePromptAction,
        createDialog: {
            visible: createDialogVisible,
            activeTab: selection.activeTab,
            activeProjectId: workspace.activeProjectId || '',
            initialTab: initialCreateDialogTab,
            initialUploadType: initialCreateDialogUploadType,
            targetPrototypeName: createDialogTargetPrototypeName,
            resourceWriteCapabilities,
            ideAvailability: preferences.ideAvailability,
            assistantOpen: assistantController.assistantVisible && assistantController.aiPanelMode === 'general-ai',
            onClose: handleCreateCancel,
            onAfterCreatePromptAction: clearCreateDialogState,
            onExecutePrompt: handleExecutePromptAction,
            onUploadSuccess: resources.handleCreateDialogUploadSuccess,
        },
        createThemeDialog: {
            visible: resources.themeCreateDialogVisible,
            activeProjectId: workspace.activeProjectId || '',
            initialTab: resources.initialThemeDialogTab,
            resourceWriteCapabilities,
            ideAvailability: preferences.ideAvailability,
            assistantOpen: assistantController.assistantVisible && assistantController.aiPanelMode === 'general-ai',
            onClose: resources.handleThemeCreateCancel,
            onAfterCreatePromptAction: resources.clearThemeCreateDialogState,
            onExecutePrompt: handleExecutePromptAction,
            onImportSuccess: resources.refreshSidebarAssets,
        },
        exportDialog: {
            open: preview.isExportModalOpen,
            projectId: workspace.activeProjectId || '',
            preferencesStorageKey: preview.exportPreferencesStorageKey,
            imageConfig: preview.imageConfig,
            axureCopyOptions: preview.axureCopyOptions,
            isExporting: preview.isExporting,
            activeTab: selection.activeTab,
            itemName: selection.selectedItem?.name,
            sourceTargetPath: stripIndexFilePath(getExplicitLocalPath(selection.selectedItem)),
            initialReviewResult: preview.pendingExportReviewResult,
            exportAvailability: preview.exportAvailability,
            ideAvailability: preferences.ideAvailability,
            assistantOpen: assistantController.assistantVisible && assistantController.aiPanelMode === 'general-ai',
            onExecutePrompt: handleExecutePromptAction,
            onClose: () => preview.setIsExportModalOpen(false),
            onInitialReviewHandled: () => preview.setPendingExportReviewResult(null),
            setImageConfig: preview.setImageConfig as any,
            setAxureCopyOptions: preview.setAxureCopyOptions,
            onDimensionChange: preview.handleDimensionChange,
            onSwapDimensions: preview.handleSwapDimensions,
            onDimensionBlur: preview.handleDimensionBlur,
            onExport: preview.handleExport,
            onCopyRuntimeComponent: preview.handleCopyRuntimeComponent,
            onCopyToAxure: preview.handleCopyToAxure,
            onCopyConfig: preview.handleCopyConfig,
        },
        figmaMakeExportDialog: {
            open: preview.isFigmaMakeExportDialogOpen,
            projectId: workspace.activeProjectId || '',
            itemName: selection.selectedItem?.name,
            itemDisplayName: selection.selectedItem?.displayName,
            targetPath: selection.selectedItem ? getSelectedResourceTargetPath(selection.selectedItem) : '',
            ideTargetPath: stripIndexFilePath(getExplicitLocalPath(selection.selectedItem)),
            onOpenChange: preview.setIsFigmaMakeExportDialogOpen,
            onDownloadSuccess: preview.handleFigmaMakeExportDownloadSuccess,
            onDownloadFailure: preview.handleFigmaMakeExportDownloadFailure,
        },
        cloudPublishSettingsDialog: {
            open: preview.cloudPublishSettingsOpen,
            projectId: workspace.activeProjectId || '',
            initialTarget: preview.cloudPublishSettingsInitialTarget,
            onOpenChange: preview.setCloudPublishSettingsOpen,
            onSaved: preview.handleCloudPublishSettingsSaved,
        },
        axhubPublishDialog: {
            open: preview.axhubPublishDialogOpen,
            targetPath: preview.currentPublishResourcePath,
            projectId: workspace.activeProjectId || '',
            onOpenChange: preview.setAxhubPublishDialogOpen,
            onPublished: preview.handleAxhubPublished,
        },
        settingsDialogProjectId: workspace.activeProjectId || '',
        settingsDialogOpen,
        settingsDialogInitialTab,
        settingsDialogAIContext,
        setSettingsDialogOpen,
        makeClientUpdateReminderVisible,
        onMakeClientUpdateReminderSeen: markMakeClientUpdateReminderSeen,
        onMakeClientUpdateAvailabilityChange: handleMakeClientUpdateAvailabilityChange,
        onOpenVersionCollaborationFromSettings: openVersionCollaborationFromSettings,
        versionCollaborationDrawerOpen,
        setVersionCollaborationDrawerOpen,
        onSettingsSaved: preferences.handleSettingsSaved,
        excalidrawPropertyPanelMode,
        setExcalidrawPropertyPanelMode,
        excalidrawPropertyPanelPosition,
        setExcalidrawPropertyPanelPosition,
        versionDialogVisible: resources.versionDialogVisible,
        setVersionDialogVisible: resources.setVersionDialogVisible,
        currentVersionItem: resources.currentVersionItem,
    };

    const mobileProps = {
        loading: workspace.loading,
        items: workspace.data.prototypes,
        searchText: workspace.searchText,
        onSearchTextChange: workspace.setSearchText,
        onCopyProjectDirectory: assistantController.handleCopyProjectDirectory,
        onOpenAssistant: assistantController.handleOpenAssistantInNewWindowNoContext,
        onOpenImageAiPanel: assistantController.handleOpenImageAiPanelInNewWindow,
        onOpenItem: handleMobileItemClick,
        onOpenAssistantWithItemContext: assistantController.handleOpenAssistantWithItemContext,
    };

    return (
        <>
            <input
                ref={startGuideResourceUploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                    if (event.target.files && event.target.files.length > 0) {
                        void handleUploadStartGuideResourceFiles(event.target.files);
                    }
                    event.currentTarget.value = '';
                }}
            />
            <IndexPageLayout
                sidebarProps={sidebarProps}
                presentationAreaProps={presentationAreaProps}
                assistantPanelProps={assistantPanelProps}
                dialogsProps={dialogsProps}
                mobileProps={mobileProps}
            />
        </>
    );
}
