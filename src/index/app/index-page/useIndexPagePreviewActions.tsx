import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { copyImageDataUrlToClipboard, copyToClipboard, writeFigmaOfficialClipboardPayload } from '../../utils/clipboard';
import { buildEditorUrl, buildItemUrl, buildLANItemUrl } from '../../utils/url';
import { generateSvgContent, svgToPng } from '../../utils/svg';
import {
    apiService,
    type AxhubPublishResponse,
    type CloudPublishingConfigResponse,
    type CloudPublishLatestItem,
    type CloudPublishTarget,
    type ExportIndexBundle,
    type ReviewAxhubConfig,
    type ReviewLanSubmitConfig,
    type ReviewReportDetail,
    type ReviewReportSummary,
    type ReviewResult,
} from '../../services/api';
import { downloadExportHtmlArchive } from '../../domains/export/export.api';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
import { resolveInjectedMakeServerOrigin } from '../../../common/makeServerOrigin';
import { buildPrototypeAnnotationAcpPrompt, buildQuickEditAcpPrompt } from '../../utils/quickEditPrompts';
import { resolveMarkdownPreviewIframeUrl } from '../../utils/markdownPreview';
import { buildReviewPrompt, resolveReviewDocumentPath, type ReviewKind } from '../../utils/uiReviewPrompt';
import { resolveSpecQuickEditSwitchDecision, type SpecQuickEditMode } from '../../utils/specQuickEdit';
import { createExportReviewFailureResult } from '../../utils/exportReviewPrompt';
import { isDrawioResource, openDrawioResourceEditor } from '../../domains/drawio/drawioResourceEditor';
import {
    buildExportModalPreferencesStorageKey,
    mergeExportModalPreferences,
    readExportModalPreferences,
    type ExportModalTabKey,
} from '../../utils/exportModalPreferences';
import { getAssistantContextCurrentFilePath } from '../../utils/assistantContext';
import {
    createAnnotationDirectRunRegistry,
    type AnnotationDirectRunEditingTarget,
    type AnnotationDirectRunEvent,
    type AnnotationDirectRunTaskRef,
} from '../../domains/assistant/annotationDirectRunManager';
import type { AiRunSseEvent } from '../../domains/ai-generation/aiRunClient';
import type { NotificationIntent } from '../../domains/notifications/notificationCoordinator';
import type {
    CommentaryPageElementSearchQuery,
    CommentaryPageElementStructureQuery,
    CommentaryHostToolbarAction,
    CommentaryHostToolbarState,
    CommentaryVoiceCommentOptions,
} from '@/common/web-editor-types';
import type {
    QuickEditSaveDraft,
} from '@/common/quickEditSave';
import { type ExportAvailability } from '../../types/index-page.types';
import {
    AXURE_BRIDGE_API_BASE_URL,
    AXURE_UNAVAILABLE_HINT,
    TITLE_EXPORT_DEFAULT_SIZE,
    buildAxureBridgeMessage,
    buildAxureBridgeUserMessage,
    createDefaultMarkdownQuickEditState,
    formatThrownError,
    getScreenshotExportDefaultSize,
    isDocumentCommentableResource,
    isHtmlCommentableResource,
    isMarkdownEditableResource,
    readJsonOrTextResponse,
} from '../index-page.helpers';
import {
    getPreviewExportDeviceId,
} from '../../domains/device/preview-layout';
import { hasExplicitLocalPath } from '../../utils/localPath';
import { resolveIndexContentMode } from './contentMode';
import { usePreviewDeviceActions } from './usePreviewDeviceActions';
import { usePreviewIframeActions } from './usePreviewIframeActions';
import { usePrototypeEditorBridgeActions } from './usePrototypeEditorBridgeActions';
import { clearCompletedCommentsImmediately } from './completedCommentCleanup';
import { createQuickEditSaveCoordinator, type QuickEditSaveTarget } from './quickEditSaveCoordinator';
import { usePreviewRuntimeActions } from './usePreviewRuntimeActions';
import {
    buildCombinedPrototypePrompt,
    buildMainPreviewIframeUrl,
    buildProjectPrototypeIframeUrl,
    buildRuntimeComponentAxvgPayload,
    createPreviewRefreshRestoreSnapshot,
    createPrototypeSpecMarkdownStatusGate,
    createDefaultHostToolbarState,
    createEmbeddedIndexBundle,
    createRuntimeExportMessage,
    createRuntimeExportRequestId,
    DEFAULT_AXURE_COPY_OPTIONS,
    DEFAULT_EXPORT_IMAGE_CONFIG,
    getSelectedResourceTargetPath,
    getSelectedSourceBasePath,
    hasExplicitSourceContext,
    hasFigmaMakeExportContext,
    hasPrototypeDecisionData,
    getClientUrlOrigin,
    isAssistantRuntimeReady,
    isHostToolbarAgentAwake,
    isHostToolbarWakePendingState,
    isQuickEditRuntimeMessage,
    isQuickEditRuntimeReadyForIframe,
    postProjectCommunicationRecord,
    readPreviewFrameEditorApi,
    resolveCurrentPublishResourcePath,
    resolveCurrentPreviewScreenshotSize,
    resolveExportScreenshotViewportSize,
    resolveActiveAnnotationDirectRunToolbarState,
    resolveHostToolbarStateAfterClearEdits,
    resolveHostToolbarStateForDisplay,
    resolveDocumentRefreshRestoreStatus,
    resolvePrototypeAnnotationTargetPath,
    resolveAnnotationActionEditingTargets,
    waitForHostToolbarActionState,
    type DocumentEditorApi,
    type HostToolbarEditorsApi,
    type PreviewPane,
    type PrototypePanePromptAction,
    type QuickEditSaveAction,
} from './previewActions.helpers';

const CLOUD_PUBLISH_TARGET_LABELS: Record<CloudPublishTarget, string> = {
    vercel: 'Vercel',
    'cloudflare-pages': 'Cloudflare Pages',
    s3: '对象存储',
    'github-pages': 'GitHub Pages',
    axhub: 'Axhub',
};

type LatestCloudPublishItems = Partial<Record<CloudPublishTarget, CloudPublishLatestItem>>;
type ConfigurableCloudPublishTarget = Exclude<CloudPublishTarget, 'axhub'>;
type CloudPublishSettingsInitialTarget = ConfigurableCloudPublishTarget | 'publish-settings';

type AnnotationPromptRunRequest = {
    promptText: string | null | undefined;
    operationId?: string;
    editingTargets?: AnnotationDirectRunEditingTarget[];
    mcpServers?: unknown[];
    onStreamEvent?: (event: AiRunSseEvent) => void | Promise<void>;
	showCompletionFeedback?: boolean;
    /** Return the existing registry request id as soon as the run starts. */
    returnExecutionHandle?: boolean;
};

function buildAnnotationEditingErrorTaskRef(
    taskRef: AnnotationDirectRunTaskRef,
    error: unknown,
): AnnotationDirectRunTaskRef {
    const data = error && typeof error === 'object'
        ? (error as { data?: Record<string, unknown> }).data
        : undefined;
    const errorRecord = error && typeof error === 'object'
        ? error as Record<string, unknown>
        : {};
    const errorMessage = typeof data?.error === 'string' && data.error.trim()
        ? data.error.trim()
        : typeof errorRecord.message === 'string' && errorRecord.message.trim()
            ? errorRecord.message.trim()
            : formatThrownError(error);
    const code = typeof data?.code === 'string' && data.code.trim()
        ? data.code.trim()
        : typeof errorRecord.code === 'string' && errorRecord.code.trim()
            ? errorRecord.code.trim()
            : null;
    const output = typeof data?.output === 'string' && data.output.trim()
        ? data.output.trim()
        : null;
    const chunk = data && Object.prototype.hasOwnProperty.call(data, 'chunk')
        ? data.chunk
        : undefined;

    return {
        ...taskRef,
        sessionId: typeof data?.threadId === 'string' && data.threadId.trim()
            ? data.threadId.trim()
            : taskRef.sessionId,
        requestId: typeof data?.runId === 'string' && data.runId.trim()
            ? data.runId.trim()
            : taskRef.requestId,
        error: errorMessage || null,
        code,
        output,
        ...(chunk !== undefined ? { chunk } : {}),
        ...(data ? { details: data } : {}),
    };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeReviewReportPath(value: unknown): string {
    const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/u, '');
    const prototypeIndex = normalized.indexOf('src/prototypes/');
    return prototypeIndex >= 0 ? normalized.slice(prototypeIndex) : normalized;
}

function findReviewReportForDirectRun(
    reports: ReviewReportSummary[],
    targetPath: string | null | undefined,
): ReviewReportSummary | null {
    const normalizedTargetPath = normalizeReviewReportPath(targetPath);
    if (!normalizedTargetPath) return null;
    return reports.find((report) => normalizeReviewReportPath(report.path) === normalizedTargetPath) || null;
}

function getAnnotationActionPromptText(
    action: CommentaryHostToolbarAction | null | undefined,
    editors: HostToolbarEditorsApi | null | undefined,
): string | undefined {
    if (action?.type === 'send-to-agent' && typeof action.promptText === 'string') {
        return action.promptText;
    }
    if (action?.type !== 'send-to-agent') {
        return editors?.getCopyPromptText?.();
    }
    const elementKey = String(action.elementKey || '').trim();
    if (!elementKey) {
        return editors?.getCopyPromptText?.();
    }
    return editors?.getElementPromptText?.(elementKey);
}

function buildAnnotationDirectRunEditingTargets(
    pane: PreviewPane,
    iframe: HTMLIFrameElement | null | undefined,
    targets: Array<Pick<AnnotationDirectRunEditingTarget, 'commentId' | 'elementKey' | 'targetRef'>>,
): AnnotationDirectRunEditingTarget[] {
    const uniqueTargets = new Map<string, AnnotationDirectRunEditingTarget>();
    for (const target of targets) {
        const elementKey = String(target?.elementKey || '').trim();
        if (!elementKey || uniqueTargets.has(elementKey)) continue;
        uniqueTargets.set(elementKey, {
            ...(String(target.commentId || '').trim()
                ? { commentId: String(target.commentId).trim() }
                : {}),
            pane,
            iframe: iframe ?? null,
            elementKey,
            targetRef: target.targetRef ?? null,
        });
    }
    return Array.from(uniqueTargets.values());
}

function normalizeAnnotationPromptRunRequest(
    request: string | null | undefined | AnnotationPromptRunRequest,
): AnnotationPromptRunRequest {
    if (request && typeof request === 'object') {
        return request;
    }
    return { promptText: request };
}

const PROTOTYPE_PAGE_ID_RE = /^[a-z0-9-]+$/u;

function normalizePrototypePageId(value: unknown): string {
    const id = typeof value === 'string' ? value.trim() : '';
    return PROTOTYPE_PAGE_ID_RE.test(id) ? id : '';
}

function normalizePrototypeRoutePages(pages: unknown): { id: string; title: string; group?: string }[] {
    if (!Array.isArray(pages)) {
        return [];
    }
    return pages
        .map((page) => {
            const id = normalizePrototypePageId(page?.id);
            const title = typeof page?.title === 'string' ? page.title.trim() : '';
            const group = typeof page?.group === 'string' ? page.group.trim() : '';
            return id && title ? { id, title, ...(group ? { group } : {}) } : null;
        })
        .filter((page): page is { id: string; title: string; group?: string } => Boolean(page));
}

function normalizePrototypeRouteInfo(payload: any) {
    const pages = normalizePrototypeRoutePages(payload?.pages);
    if (pages.length === 0) {
        return null;
    }
    const defaultPageId = normalizePrototypePageId(payload?.defaultPageId) || pages[0]?.id || '';
    const activePageId = normalizePrototypePageId(payload?.activePageId) || defaultPageId;
    if (!defaultPageId || !activePageId) {
        return null;
    }
    return {
        pages,
        defaultPageId,
        activePageId,
    };
}

function resolveSelectedPrototypeIdentity(selectedItem: any): string {
    const resourceId = String(selectedItem?.resourceId || '').trim();
    if (resourceId) return resourceId;
    return String(selectedItem?.name || '').trim();
}

export function useIndexPagePreviewActions(params: any) {
    const {
        projectId,
        activeTab,
        collapsed,
        setSystemCollapsed,
        sidebarTab,
        resourceSection,
        setSidebarTab,
        setResourceSection,
        selectedItem,
        selectedPageId,
        onPrototypePageChange,
        onPrototypeRouteInfo,
        selectedDoc,
        selectedPrototypeSpec,
        contentModeOverride,
        reviewPanelVisible = true,
        onPrototypeSpecExit,
        setSelectedDoc,
        selectedTemplate,
        setSelectedTemplate,
        selectedTheme,
        projectCapabilities,
        messageApi,
        appDialog,
        viewMode,
        isDarkMode = false,
        setIsDarkMode,
        openSettingsDialog,
        agentRunConcurrency = 5,
        autoClearCompletedComments = true,
        assistantContextV1,
        assistantProjectPath,
        assistantContextAppendAvailable = false,
        onOpenAnnotationAssistant,
        onRunAnnotationAssistantPromptViaApi,
        onRunReviewAssistantPromptViaApi,
        probeAssistantRuntimeSilently,
        connectAssistantRuntimeSilently,
        clearAssistantSelectedElementsOnExit,
        onAiNotification,
    } = params;

    const userSetDimensionsRef = useRef(false);
    const previousExportContentTypeRef = useRef(DEFAULT_EXPORT_IMAGE_CONFIG.contentType);
    const standalonePanelBeforeQuickEditRef = useRef<boolean>(false);
    const decisionPanelAutoOpenSeqRef = useRef(0);
    const [standalonePanelOpen, setStandalonePanelOpen] = useState(false);
    const exportPreferencesLoadedKeyRef = useRef<string | null>(null);
    const exportPreferencesReadyRef = useRef(false);
    const skipExportContentTypeResetRef = useRef(false);
    const pendingClipboardScreenshotRequestIdsRef = useRef<Set<string>>(new Set());
    const screenshotModalRefreshKeyRef = useRef('');
    const latestCloudPublishRequestRef = useRef(0);
    const markdownPromptCacheRef = useRef<{ key: string; result: any } | null>(null);
    const pendingDocSwitchRef = useRef<{ kind: 'doc' | 'template'; item: any } | null>(null);
    const lastQuickEditRuntimeDocumentUrlKeyRef = useRef<string>('');
    const quickEditRuntimeReadyIframeRef = useRef<HTMLIFrameElement | null>(null);
    const quickEditRuntimeActiveRef = useRef(false);
    const documentEditorActiveRef = useRef(false);
    const pendingDocumentEditorRestoreModeRef = useRef<SpecQuickEditMode | null>(null);
    const pendingStandalonePanelRestoreRef = useRef(false);
    const prototypeSpecMarkdownStatusGateRef = useRef(createPrototypeSpecMarkdownStatusGate());
    const documentHostToolbarUnsubscribeRef = useRef<(() => void) | null>(null);
    const prototypeHostToolbarUnsubscribeRef = useRef<(() => void) | null>(null);
    const isDarkModeRef = useRef(isDarkMode);
    const exitWebEditorRef = useRef<((options?: { restoreDevice?: boolean; restorePanelOnly?: boolean }) => Promise<void>) | null>(null);
    const [elementIframeSize, setElementIframeSize] = useState({ width: 600, height: 400 });
    const [elementIframeKey, setElementIframeKey] = useState(0);
    const [qrCodeVisible, setQrCodeVisible] = useState(false);
    const [pendingExportReviewResult, setPendingExportReviewResult] = useState<ReviewResult | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isFigmaMakeExportDialogOpen, setIsFigmaMakeExportDialogOpen] = useState(false);
    const [axhubPublishDialogOpen, setAxhubPublishDialogOpen] = useState(false);
    const [cloudPublishSettingsOpen, setCloudPublishSettingsOpen] = useState(false);
    const [cloudPublishSettingsInitialTarget, setCloudPublishSettingsInitialTarget] = useState<CloudPublishSettingsInitialTarget>('s3');
    const [latestCloudPublishItems, setLatestCloudPublishItems] = useState<LatestCloudPublishItems>({});
    const [latestCloudPublishResourcePath, setLatestCloudPublishResourcePath] = useState('');
    const [visibleCloudPublishTargets, setVisibleCloudPublishTargets] = useState<CloudPublishTarget[]>(['axhub']);
    const [isExporting, setIsExporting] = useState(false);
    const [axureCopyOptions, setAxureCopyOptions] = useState(DEFAULT_AXURE_COPY_OPTIONS);
    const [imageConfig, setImageConfig] = useState(DEFAULT_EXPORT_IMAGE_CONFIG);
    const [editorStatus, setEditorStatus] = useState<{ mode: 'none' | 'quickEdit' }>({
        mode: 'none',
    });
    const [prototypeAnnotationSessionActive, setPrototypeAnnotationSessionActive] = useState(false);
    const [prototypeAnnotationStatusLoading, setPrototypeAnnotationStatusLoading] = useState(false);
    const [prototypeAnnotationPromptCopying, setPrototypeAnnotationPromptCopying] = useState(false);
    const [docEditState, setDocEditState] = useState(createDefaultMarkdownQuickEditState);
    const [markdownPromptCopying, setMarkdownPromptCopying] = useState(false);
    const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
    const [pendingReviewKind, setPendingReviewKind] = useState<ReviewKind>('design');
    const [activeReviewReportId, setActiveReviewReportId] = useState<string | null>(null);
    const [reviewReports, setReviewReports] = useState<ReviewReportSummary[]>([]);
    const [selectedReviewReport, setSelectedReviewReport] = useState<ReviewReportDetail | null>(null);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewDetailLoading, setReviewDetailLoading] = useState(false);
    const [reviewUploadLoading, setReviewUploadLoading] = useState(false);
    const [reviewLanSubmitConfig, setReviewLanSubmitConfig] = useState<ReviewLanSubmitConfig | null>(null);
    const [reviewAxhubSubmitConfig, setReviewAxhubSubmitConfig] = useState<ReviewAxhubConfig | null>(null);
    const [reviewError, setReviewError] = useState('');
    const reviewAxhubSyncInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
    const activeReviewScopeKeyRef = useRef('');
    const previousReviewPrototypeIdentityRef = useRef('');
    const [quickEditPromptCopying, setQuickEditPromptCopying] = useState(false);
    const [hostToolbarState, setHostToolbarState] = useState<CommentaryHostToolbarState | null>(null);
    const [prototypeDecisionDataAvailable, setPrototypeDecisionDataAvailable] = useState(false);
    const hostToolbarStateRef = useRef(hostToolbarState);
    const annotationDirectRunRegistryRef = useRef(createAnnotationDirectRunRegistry());
    const quickEditSaveCoordinatorRef = useRef(createQuickEditSaveCoordinator());
    const loadedPrototypeDecisionDataAvailableRef = useRef(false);
    const maxAnnotationDirectRunCount = useMemo(() => {
        const value = Math.floor(Number(agentRunConcurrency));
        return Number.isFinite(value) ? Math.min(10, Math.max(1, value)) : 5;
    }, [agentRunConcurrency]);

    useEffect(() => {
        isDarkModeRef.current = isDarkMode;
    }, [isDarkMode]);
    useEffect(() => {
        hostToolbarStateRef.current = hostToolbarState;
    }, [hostToolbarState]);

    const resolveAnnotationDirectRunToolbarState = useCallback((state: CommentaryHostToolbarState | null) => {
        const activeRunCount = annotationDirectRunRegistryRef.current.getActiveRunCount();
        return resolveActiveAnnotationDirectRunToolbarState(state, {
            activeRunCount,
            maxRunCount: maxAnnotationDirectRunCount,
        });
    }, [maxAnnotationDirectRunCount]);

    const setResolvedHostToolbarState = useCallback((state: CommentaryHostToolbarState | null) => {
        const resolvedState = resolveAnnotationDirectRunToolbarState(state);
        hostToolbarStateRef.current = resolvedState;
        setHostToolbarState(resolvedState);
        setPrototypeDecisionDataAvailable(
            loadedPrototypeDecisionDataAvailableRef.current || hasPrototypeDecisionData(resolvedState),
        );
    }, [resolveAnnotationDirectRunToolbarState]);

    const setTrackedHostToolbarState = useCallback((nextState: SetStateAction<CommentaryHostToolbarState | null>) => {
        setHostToolbarState((previousState) => {
            const nextResolvedState = typeof nextState === 'function'
                ? (nextState as (value: CommentaryHostToolbarState | null) => CommentaryHostToolbarState | null)(previousState)
                : nextState;
            const resolvedState = resolveAnnotationDirectRunToolbarState(nextResolvedState);
            hostToolbarStateRef.current = resolvedState;
            setPrototypeDecisionDataAvailable(
                loadedPrototypeDecisionDataAvailableRef.current || hasPrototypeDecisionData(resolvedState),
            );
            return resolvedState;
        });
    }, [resolveAnnotationDirectRunToolbarState]);

    const refreshAnnotationDirectRunToolbarState = useCallback(() => {
        const activeRunCount = annotationDirectRunRegistryRef.current.getActiveRunCount();
        if (activeRunCount <= 0) {
            setResolvedHostToolbarState({
                ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                robotState: 'awake' as const,
                robotLoading: false,
                sendDisabled: false,
                sendLoading: false,
                interruptDisabled: true,
                interruptLoading: false,
            });
            return;
        }
        setResolvedHostToolbarState(hostToolbarStateRef.current ?? createDefaultHostToolbarState());
    }, [setResolvedHostToolbarState]);

    const previewDeviceActions = usePreviewDeviceActions();
    const previewConfig = previewDeviceActions.previewConfig;
    const previewDeviceParam = previewDeviceActions.previewDeviceParam;
    const handlePreviewContainerSizeChange = previewDeviceActions.handlePreviewContainerSizeChange;
    const handlePreviewExternalWorkspaceWidthChange = previewDeviceActions.handlePreviewExternalWorkspaceWidthChange;
    const startPreviewLayoutStabilization = previewDeviceActions.startPreviewLayoutStabilization;
    const endPreviewLayoutStabilization = previewDeviceActions.endPreviewLayoutStabilization;
    const selectedDeviceId = previewDeviceActions.selectedDeviceId;
    const setSelectedDeviceId = previewDeviceActions.setSelectedDeviceId;
    const deviceSegmentOptions = previewDeviceActions.deviceSegmentOptions;
    const handleSelectPreviewSinglePreset = previewDeviceActions.handleSelectPreviewSinglePreset;
    const handleSelectCustomPreview = previewDeviceActions.handleSelectCustomPreview;
    const handleActivateSplitPreview = previewDeviceActions.handleActivateSplitPreview;
    const handleActivateMultiPagePreview = previewDeviceActions.handleActivateMultiPagePreview;
    const handleChangeMultiPageColumns = previewDeviceActions.handleChangeMultiPageColumns;
    const handleChangeCustomPreviewWidth = previewDeviceActions.handleChangeCustomPreviewWidth;
    const handleChangeCustomPreviewHeight = previewDeviceActions.handleChangeCustomPreviewHeight;
    const handleChangeSplitPreviewWidth = previewDeviceActions.handleChangeSplitPreviewWidth;
    const handleChangeSplitPreviewHeight = previewDeviceActions.handleChangeSplitPreviewHeight;
    const handleChangePreviewScaleMode = previewDeviceActions.handleChangePreviewScaleMode;
    const currentDevice = previewDeviceActions.currentDevice;
    const displaySize = previewDeviceActions.displaySize;
    const previewIframeActions = usePreviewIframeActions({
        previewMode: previewConfig.previewMode,
        messageApi,
    });
    const containerRef = previewIframeActions.containerRef;
    const previewIframeRef = previewIframeActions.previewIframeRef;
    const secondaryPreviewIframeRef = previewIframeActions.secondaryPreviewIframeRef;
    const getPrimaryPreviewIframe = previewIframeActions.getPrimaryPreviewIframe;
    const getSecondaryPreviewIframe = previewIframeActions.getSecondaryPreviewIframe;
    const getPreviewIframe = previewIframeActions.getPreviewIframe;
    const getPreviewIframes = previewIframeActions.getPreviewIframes;
    const markPreviewIframeLoaded = previewIframeActions.markPreviewIframeLoaded;
    const getPreviewIframeGeneration = previewIframeActions.getPreviewIframeGeneration;
    const getIframeOrigin = previewIframeActions.getIframeOrigin;
    const postToPreview = previewIframeActions.postToPreview;
    const resolvePreviewPaneForIframe = useCallback((iframe: HTMLIFrameElement | null | undefined): PreviewPane | null => {
        if (!iframe) {
            return null;
        }
        return iframe === getSecondaryPreviewIframe() ? 'secondary' : 'primary';
    }, [getSecondaryPreviewIframe]);

    const previewRuntimeActions = usePreviewRuntimeActions({
        postToPreview,
        selectedItem,
        viewMode,
    });
    const quickEditRuntimeStatus = previewRuntimeActions.quickEditRuntimeStatus;
    const setQuickEditRuntimeStatus = previewRuntimeActions.setQuickEditRuntimeStatus;
    const clearQuickEditRuntimeTimeout = previewRuntimeActions.clearQuickEditRuntimeTimeout;
    const beginQuickEditRuntimeHandshake = previewRuntimeActions.beginQuickEditRuntimeHandshake;
    const forwardQuickEditPatch = previewRuntimeActions.forwardQuickEditPatch;
    const reportQuickEditRuntimeError = previewRuntimeActions.reportQuickEditRuntimeError;
    const exitQuickEditRuntime = previewRuntimeActions.exitQuickEditRuntime;
    const saveQuickEditRuntime = previewRuntimeActions.saveQuickEditRuntime;
    const resolvedContentMode = resolveIndexContentMode({
        sidebarTab,
        resourceSection,
        viewMode,
        selectedDocOpenMode: selectedDoc?.openMode,
    });
    const contentMode = contentModeOverride || resolvedContentMode;
    const isDocumentEditingContent = contentMode === 'doc' || contentMode === 'template' || contentMode === 'prototype-spec';
    const currentMarkdownResource = useMemo(() => {
        if (contentMode === 'prototype-spec') {
            return { item: selectedPrototypeSpec, kind: 'doc' as const };
        }
        if (contentMode === 'doc') {
            return { item: selectedDoc, kind: 'doc' as const };
        }
        if (contentMode === 'template') {
            return { item: selectedTemplate, kind: 'template' as const };
        }
        return { item: null, kind: 'doc' as const };
    }, [contentMode, selectedDoc, selectedPrototypeSpec, selectedTemplate]);
    const currentMarkdownItem = currentMarkdownResource.item;
    const currentMarkdownLabel = currentMarkdownResource.kind === 'template' ? '模板' : '文档';
    const currentDocumentIsHtml = Boolean(
        isDocumentEditingContent
        && currentMarkdownItem
        && isHtmlCommentableResource(currentMarkdownItem),
    );
    const drawioResourceEditAvailable = Boolean(
        isDocumentEditingContent
        && currentMarkdownItem
        && isDrawioResource(currentMarkdownItem),
    );
    const selectedEditablePreviewResource = currentDocumentIsHtml
        ? currentMarkdownItem
        : contentMode === 'theme'
            ? selectedTheme
            : selectedItem;
    const resourceType: 'prototype' | 'theme' = contentMode === 'theme' ? 'theme' : 'prototype';
    const currentRuntimeExportResource = contentMode === 'theme' ? selectedTheme : selectedItem;
    const currentRuntimeExportResourceType: 'prototype' | 'theme' = contentMode === 'theme' ? 'theme' : 'prototype';
    const selectedPrototypeIdentity = useMemo(() => resolveSelectedPrototypeIdentity(selectedItem), [selectedItem]);
    const selectedPrototypeProjectKey = String(selectedItem?.projectId || projectId || '').trim();
    const selectedPrototypeContextKey = `${selectedPrototypeProjectKey}:${selectedPrototypeIdentity}`;
    const selectedPrototypeIdentityRef = useRef(selectedPrototypeIdentity);
    activeReviewScopeKeyRef.current = `${projectId || ''}:${selectedPrototypeIdentity || ''}`;
    const currentPublishResourcePath = useMemo(() => resolveCurrentPublishResourcePath({
        contentMode,
        selectedItem,
        selectedTheme,
    }), [
        contentMode,
        selectedItem,
        selectedTheme,
    ]);
    const reviewDocumentPaths = useMemo<Record<ReviewKind, string>>(
        () => ({
            design: resolveReviewDocumentPath(selectedItem, 'design'),
            requirements: resolveReviewDocumentPath(selectedItem, 'requirements'),
        }),
        [selectedItem],
    );
    const reviewPrompts = useMemo<Record<ReviewKind, string>>(
        () => ({
            design: buildReviewPrompt({
                selectedItem,
                reviewDocumentPath: reviewDocumentPaths.design,
                kind: 'design',
            }),
            requirements: buildReviewPrompt({
                selectedItem,
                reviewDocumentPath: reviewDocumentPaths.requirements,
                kind: 'requirements',
            }),
        }),
        [reviewDocumentPaths, selectedItem],
    );
    const reviewDocumentPath = useMemo(
        () => reviewDocumentPaths[pendingReviewKind],
        [pendingReviewKind, reviewDocumentPaths],
    );
    const reviewPrompt = useMemo(
        () => reviewPrompts[pendingReviewKind],
        [pendingReviewKind, reviewPrompts],
    );
    const buildReviewDirectRunAssistantContext = useCallback((targetPath?: string | null) => {
        const normalizedTargetPath = String(targetPath || '').trim().replace(/\\/g, '/');
        if (!normalizedTargetPath) {
            return assistantContextV1;
        }
        const currentFileDirectory = normalizedTargetPath.replace(/\/[^/]+$/u, '');
        const currentExtensions = assistantContextV1?.extensions && typeof assistantContextV1.extensions === 'object'
            ? assistantContextV1.extensions
            : {};
        const currentPaths = currentExtensions.paths && typeof currentExtensions.paths === 'object' && !Array.isArray(currentExtensions.paths)
            ? currentExtensions.paths as Record<string, unknown>
            : {};
        return {
            ...assistantContextV1,
            currentFile: {
                path: normalizedTargetPath,
                displayName: normalizedTargetPath.split('/').filter(Boolean).pop() || normalizedTargetPath,
            },
            extensions: {
                ...currentExtensions,
                paths: {
                    ...currentPaths,
                    currentFilePath: normalizedTargetPath,
                    currentFileDirectory,
                },
                updatedAt: new Date().toISOString(),
            },
        };
    }, [assistantContextV1]);
    const activePromptResource = useMemo(() => {
        if (contentMode === 'prototype-spec' && selectedPrototypeSpec) {
            return { kind: 'doc' as const, label: '规格', cacheKey: `prototype-spec:${selectedPrototypeSpec.name}` };
        }
        if (contentMode === 'doc' && selectedDoc) {
            return { kind: 'doc' as const, label: '文档', cacheKey: `doc:${selectedDoc.name}` };
        }
        if (contentMode === 'template' && selectedTemplate) {
            return { kind: 'template' as const, label: '模板', cacheKey: `template:${selectedTemplate.name}` };
        }
        return null;
    }, [contentMode, selectedDoc, selectedPrototypeSpec, selectedTemplate]);
    useEffect(() => {
        prototypeSpecMarkdownStatusGateRef.current.reset({
            autoEnable: contentMode === 'prototype-spec'
                && Boolean(selectedPrototypeSpec)
                && isMarkdownEditableResource(selectedPrototypeSpec),
        });
    }, [activePromptResource?.cacheKey, contentMode, selectedPrototypeSpec]);
    const scale = 1;
    const screenshotDefaultSize = useMemo(
        () => getScreenshotExportDefaultSize(activeTab, getPreviewExportDeviceId(previewConfig)),
        [activeTab, previewConfig],
    );
    const currentPreviewScreenshotSize = useMemo(
        () => resolveCurrentPreviewScreenshotSize(previewConfig, screenshotDefaultSize),
        [previewConfig, screenshotDefaultSize],
    );
    const exportPreferencesStorageKey = useMemo(
        () => buildExportModalPreferencesStorageKey(assistantProjectPath),
        [assistantProjectPath],
    );
    type PrototypeEditorLaunchOptions = {
        hostToolbar: boolean;
        annotationSession?: boolean;
    };
    const prototypeEditorLaunchOptions = useMemo(() => ({
        hostToolbar: true,
    }) as PrototypeEditorLaunchOptions, []);
    type PrototypeEditorRestoreOptions = typeof prototypeEditorLaunchOptions & {
        selectionModeActive?: boolean;
    };
    const activePrototypeEditorLaunchOptionsRef = useRef<PrototypeEditorRestoreOptions | null>(null);
    const pendingPrototypeAnnotationSessionOpenRef = useRef(false);
    const skipPrototypeAnnotationEnableConfirmationRef = useRef(false);
    const getAnnotationSession = useCallback(() => (
        activePrototypeEditorLaunchOptionsRef.current?.annotationSession === true
    ), []);
    const pendingPrototypeEditorRestoreRef = useRef<PrototypeEditorRestoreOptions | null>(null);
    const pendingPrototypeEditorOpenIntentRef = useRef(false);
    const prototypeEditorRestoreSeqRef = useRef(0);
    const iframePrototypeEditorLaunchOptions = editorStatus.mode === 'quickEdit'
        && activePrototypeEditorLaunchOptionsRef.current
        ? activePrototypeEditorLaunchOptionsRef.current
        : prototypeEditorLaunchOptions;
    const buildPaneIframeUrl = useCallback((pane: PreviewPane) => {
        if (contentMode === 'prototype-spec') {
            return resolveMarkdownPreviewIframeUrl(selectedPrototypeSpec, 'doc');
        }
        if (contentMode === 'doc') {
            return resolveMarkdownPreviewIframeUrl(selectedDoc, 'doc');
        }
        if (contentMode === 'template') {
            return resolveMarkdownPreviewIframeUrl(selectedTemplate, 'template');
        }
        if (contentMode === 'theme') {
            return buildMainPreviewIframeUrl(selectedTheme, iframePrototypeEditorLaunchOptions);
        }
        const baseUrl = viewMode === 'demo'
            ? buildProjectPrototypeIframeUrl(selectedItem, iframePrototypeEditorLaunchOptions, selectedPageId)
            : viewMode === 'canvas'
                ? ''
                : buildEditorUrl(selectedItem, viewMode, iframePrototypeEditorLaunchOptions);
        if (previewConfig.previewMode !== 'split' || !baseUrl) {
            return baseUrl;
        }
        if (viewMode !== 'demo') {
            return baseUrl;
        }
        try {
            const url = new URL(baseUrl, window.location.origin);
            url.searchParams.set('axhubPane', pane);
            url.searchParams.set('axhubQuickEditContext', '1');
            return url.toString();
        } catch {
            return baseUrl;
        }
    }, [
        previewConfig.previewMode,
        contentMode,
        selectedDoc,
        selectedPrototypeSpec,
        selectedItem,
        selectedPageId,
        selectedTemplate,
        selectedTheme,
        iframePrototypeEditorLaunchOptions,
        viewMode,
    ]);
    const primaryIframeUrl = useMemo(() => buildPaneIframeUrl('primary'), [buildPaneIframeUrl]);
    const secondaryIframeUrl = useMemo(
        () => (previewConfig.previewMode === 'split' ? buildPaneIframeUrl('secondary') : primaryIframeUrl),
        [buildPaneIframeUrl, previewConfig.previewMode, primaryIframeUrl],
    );
    const previewIframeTargetUrlsRef = useRef({
        primary: primaryIframeUrl,
        secondary: secondaryIframeUrl,
    });
    previewIframeTargetUrlsRef.current.primary = primaryIframeUrl;
    previewIframeTargetUrlsRef.current.secondary = secondaryIframeUrl;
    const getPreviewIframeTargetUrl = useCallback((iframe: HTMLIFrameElement) => (
        iframe === getSecondaryPreviewIframe()
            ? previewIframeTargetUrlsRef.current.secondary
            : previewIframeTargetUrlsRef.current.primary
    ), [getSecondaryPreviewIframe]);
    const iframeUrlMode = previewConfig.previewMode;
    const iframeUrl = primaryIframeUrl;
    const getDocumentEditorApi = useCallback((): DocumentEditorApi | null => {
        const iframe = getPrimaryPreviewIframe();
        return readPreviewFrameEditorApi<DocumentEditorApi>(iframe, 'SpecTemplateBootstrap');
    }, [getPrimaryPreviewIframe]);
    const setDocumentEditorContext = useCallback((editorApi: DocumentEditorApi | null) => {
        const item = currentMarkdownItem as any;
        const documentPath = String(item?.projectDocumentPath || item?.filePath || '').trim().replace(/\\/g, '/');
        const scopedProjectId = String(item?.projectId || projectId || '').trim();
        if (!editorApi?.setContext || !documentPath || !scopedProjectId) return;
        editorApi.setContext({
            projectId: scopedProjectId,
            documentPath,
            makeServerOrigin: resolveInjectedMakeServerOrigin(window),
        });
    }, [currentMarkdownItem, projectId]);
    const prototypeEditorBridgeActions = usePrototypeEditorBridgeActions({
        projectId,
        getPrimaryPreviewIframe,
        getSecondaryPreviewIframe,
        getPreviewIframes,
        getPreviewIframeGeneration,
        getPreviewIframeTargetUrl,
        getIframeOrigin,
        selectedEditablePreviewResource,
        resourceType,
        previewConfig,
        selectedPageId,
        isDarkMode,
        isDarkModeRef,
        agentRunConcurrency,
        autoClearCompletedComments,
        assistantPanelOpen: assistantContextAppendAvailable,
        getAnnotationSession,
        messageApi,
        prototypeHostToolbarUnsubscribeRef,
        setHostToolbarState: setTrackedHostToolbarState,
    });
    const getPrototypeEditorApi = prototypeEditorBridgeActions.getPrototypeEditorApi;
    const getPrototypeEditorVoiceTarget = prototypeEditorBridgeActions.getPrototypeEditorVoiceTarget;
    const getCommentaryVoiceEditorApi = useCallback((): HostToolbarEditorsApi | null => {
        const iframe = getPrimaryPreviewIframe();
        if (isDocumentEditingContent) {
            if (currentDocumentIsHtml) {
                return readPreviewFrameEditorApi<HostToolbarEditorsApi>(iframe, 'HtmlTemplateBootstrap');
            }
            return getDocumentEditorApi();
        }
        return getPrototypeEditorApi(iframe);
    }, [currentDocumentIsHtml, getDocumentEditorApi, getPrimaryPreviewIframe, getPrototypeEditorApi, isDocumentEditingContent]);
    const getCommentaryVoiceTarget = useCallback(async () => {
        const iframe = getPrimaryPreviewIframe();
        if (isDocumentEditingContent) {
            return getCommentaryVoiceEditorApi()?.getVoiceTarget?.() ?? null;
        }
        return getPrototypeEditorVoiceTarget(iframe);
    }, [
        getCommentaryVoiceEditorApi,
        getPrimaryPreviewIframe,
        getPrototypeEditorVoiceTarget,
        isDocumentEditingContent,
    ]);
    const getCommentaryVoiceTargets = useCallback(async () => {
        const editors = getCommentaryVoiceEditorApi();
        if (isDocumentEditingContent && typeof editors?.getVoiceTargets === 'function') {
            return editors.getVoiceTargets();
        }
        return prototypeEditorBridgeActions.getPrototypeEditorVoiceTargets();
    }, [getCommentaryVoiceEditorApi, isDocumentEditingContent, prototypeEditorBridgeActions]);
    const findCommentaryVoiceElements = useCallback(async (
        query: CommentaryPageElementSearchQuery,
    ) => {
        const editors = getCommentaryVoiceEditorApi();
        if (isDocumentEditingContent && typeof editors?.findVoiceElements === 'function') {
            return editors.findVoiceElements(query);
        }
        return prototypeEditorBridgeActions.findPrototypeEditorVoiceElements(query);
    }, [getCommentaryVoiceEditorApi, isDocumentEditingContent, prototypeEditorBridgeActions]);
    const getCommentaryVoiceElementStructure = useCallback(async (
        query: CommentaryPageElementStructureQuery,
    ) => {
        const editors = getCommentaryVoiceEditorApi();
        if (isDocumentEditingContent && typeof editors?.getVoiceElementStructure === 'function') {
            return editors.getVoiceElementStructure(query);
        }
        return prototypeEditorBridgeActions.getPrototypeEditorVoiceElementStructure(query);
    }, [getCommentaryVoiceEditorApi, isDocumentEditingContent, prototypeEditorBridgeActions]);
    const activateCommentaryVoiceElement = useCallback(async (targetRef: string) => {
        const editors = getCommentaryVoiceEditorApi();
        if (isDocumentEditingContent && typeof editors?.activateVoiceElement === 'function') {
            return editors.activateVoiceElement(targetRef);
        }
        return prototypeEditorBridgeActions.activatePrototypeEditorVoiceElement(targetRef);
    }, [getCommentaryVoiceEditorApi, isDocumentEditingContent, prototypeEditorBridgeActions]);
    const createCommentaryVoiceComment = useCallback(async (
        targetRef: string,
        content: string,
        options: CommentaryVoiceCommentOptions,
    ) => {
        const editors = getCommentaryVoiceEditorApi();
        if (isDocumentEditingContent && typeof editors?.createVoiceComment === 'function') {
            return editors.createVoiceComment(targetRef, content, options);
        }
        return prototypeEditorBridgeActions.createPrototypeEditorVoiceComment(
            targetRef,
            content,
            options,
        );
    }, [getCommentaryVoiceEditorApi, isDocumentEditingContent, prototypeEditorBridgeActions]);
    const refreshCommentaryVoicePersistedComments = useCallback(async (deletedCommentIds?: readonly string[]) => {
        const editors = getCommentaryVoiceEditorApi();
        if (isDocumentEditingContent && typeof editors?.refreshPersistedComments === 'function') {
            await editors.refreshPersistedComments(deletedCommentIds);
            return true;
        }
        return prototypeEditorBridgeActions.refreshPrototypeEditorVoiceComments(deletedCommentIds);
    }, [getCommentaryVoiceEditorApi, isDocumentEditingContent, prototypeEditorBridgeActions]);
    const getAnnotationDirectRunOperation = useCallback((operationId: string) => (
        annotationDirectRunRegistryRef.current.getOperation(operationId)
    ), []);
    const enterPrototypeEditor = prototypeEditorBridgeActions.enterPrototypeEditor;
    const enterPrototypeEditorPanelOnly = prototypeEditorBridgeActions.enterPrototypeEditorPanelOnly;
    const exitPrototypeEditorPanelOnly = prototypeEditorBridgeActions.exitPrototypeEditorPanelOnly;
    const postPrototypeEditorDisable = prototypeEditorBridgeActions.postPrototypeEditorDisable;
    const postPrototypeEditorHostToolbarAction = prototypeEditorBridgeActions.postPrototypeEditorHostToolbarAction;
    const postPrototypeEditorPrepareSave = prototypeEditorBridgeActions.postPrototypeEditorPrepareSave;
    const postPrototypeEditorPreflightSave = prototypeEditorBridgeActions.postPrototypeEditorPreflightSave;
    const postPrototypeEditorCommitSave = prototypeEditorBridgeActions.postPrototypeEditorCommitSave;
    const postPrototypeEditorNodeEditingState = prototypeEditorBridgeActions.postPrototypeEditorNodeEditingState;
    const queryPrototypeEditorState = prototypeEditorBridgeActions.queryPrototypeEditorState;

    const resolveCommentaryExecutionContext = useCallback(async (commentId: string) => {
        const normalizedCommentId = String(commentId || '').trim();
        if (!normalizedCommentId) return null;
        const action: CommentaryHostToolbarAction = {
            type: 'send-to-agent',
            commentId: normalizedCommentId,
        };
        const iframe = getPrimaryPreviewIframe();
        const editors = getCommentaryVoiceEditorApi();
        const localTarget = buildAnnotationDirectRunEditingTargets(
            'primary',
            iframe,
            resolveAnnotationActionEditingTargets(
                action,
                editors?.getEditedSnapshot?.()?.modifiedElements ?? [],
            ),
        )[0];
        const localPrompt = localTarget
            ? String(editors?.getElementPromptText?.(localTarget.elementKey) || '').trim()
            : '';
        if (localTarget && localPrompt) {
            return { promptText: localPrompt, editingTarget: localTarget };
        }
        if (!iframe?.contentWindow) return null;
        const bridgeResult = await postPrototypeEditorHostToolbarAction(iframe, action);
        const bridgeTarget = buildAnnotationDirectRunEditingTargets(
            'primary',
            iframe,
            resolveAnnotationActionEditingTargets(action, bridgeResult?.modifiedElements ?? []),
        )[0];
        const bridgePrompt = String(bridgeResult?.promptText || '').trim();
        return bridgeTarget && bridgePrompt
            ? { promptText: bridgePrompt, editingTarget: bridgeTarget }
            : null;
    }, [
        getCommentaryVoiceEditorApi,
        getPrimaryPreviewIframe,
        postPrototypeEditorHostToolbarAction,
    ]);

    const clearCompletedCommentsForTargets = useCallback(async (
        targets: AnnotationDirectRunEditingTarget[] | null | undefined,
    ) => {
        if (!autoClearCompletedComments) return;
        const iframes = new Set<HTMLIFrameElement>();
        for (const target of targets || []) {
            const iframe = target.iframe ?? getPreviewIframe(target.pane || 'primary');
            if (iframe) iframes.add(iframe);
        }
        await Promise.all(Array.from(iframes).map(async (iframe) => {
            const clearedLocally = await clearCompletedCommentsImmediately(getPrototypeEditorApi(iframe), true);
            if (clearedLocally) return;
            try {
                await postPrototypeEditorHostToolbarAction(iframe, {
                    type: 'clear-edits',
                    skipConfirm: true,
                    scope: 'page',
                    target: 'completed',
                });
            } catch {
                // Cleanup is best-effort and must not block the completed task.
            }
        }));
    }, [
        autoClearCompletedComments,
        getPreviewIframe,
        getPrototypeEditorApi,
        postPrototypeEditorHostToolbarAction,
    ]);

    useEffect(() => {
        if (!quickEditRuntimeActiveRef.current || resourceType !== 'prototype') {
            return;
        }
        void Promise.all(getPreviewIframes().map((iframe) =>
            enterPrototypeEditor(iframe, { showMissingWarning: false }),
        ));
    }, [
        enterPrototypeEditor,
        getPreviewIframes,
        resourceType,
        selectedPageId,
    ]);

    const getRuntimeDocumentUrlKey = useCallback((rawUrl: string) => {
        if (!rawUrl) return '';
        try {
            const url = new URL(rawUrl, window.location.origin);
            url.hash = '';
            return url.toString();
        } catch {
            return rawUrl.replace(/#.*$/u, '');
        }
    }, []);

    const refreshEditorStatus = useCallback(() => {
        const quickEditActive = quickEditRuntimeActiveRef.current;
        setEditorStatus({
            mode: quickEditActive || documentEditorActiveRef.current ? 'quickEdit' : 'none',
        });
        setPrototypeAnnotationSessionActive(
            quickEditActive && activePrototypeEditorLaunchOptionsRef.current?.annotationSession === true,
        );
    }, []);

    const completePrototypeEditorOpen = useCallback(() => {
        setStandalonePanelOpen(false);
        if (!collapsed) {
            startPreviewLayoutStabilization('annotation-sidebar');
        }
        setSystemCollapsed(true);
    }, [collapsed, setSystemCollapsed, startPreviewLayoutStabilization]);

    const reenterPrototypeEditorAfterIframeLoad = useCallback(async (
        restoreOptions: PrototypeEditorRestoreOptions,
        expectedPrimaryIframe: HTMLIFrameElement,
        isRestoreCurrent: () => boolean,
    ) => {
        if (!isRestoreCurrent()) {
            return false;
        }
        activePrototypeEditorLaunchOptionsRef.current = restoreOptions;
        if (!isRestoreCurrent()) {
            return false;
        }
        const primaryEntered = await enterPrototypeEditor(expectedPrimaryIframe, { showMissingWarning: false });
        if (!isRestoreCurrent() || !primaryEntered) {
            return false;
        }
        if (previewConfig.previewMode === 'split') {
            const secondaryIframe = getSecondaryPreviewIframe();
            if (secondaryIframe?.contentWindow) {
                if (!isRestoreCurrent()) {
                    return false;
                }
                await enterPrototypeEditor(secondaryIframe, { showMissingWarning: false });
                if (!isRestoreCurrent()) {
                    return false;
                }
            }
        }
        if (typeof restoreOptions.selectionModeActive === 'boolean') {
            const selectionAction: CommentaryHostToolbarAction = {
                type: 'toggle-selection-mode',
                active: restoreOptions.selectionModeActive,
            };
            const restoreIframes = getPreviewIframes();
            if (!isRestoreCurrent() || !restoreIframes.includes(expectedPrimaryIframe)) {
                return false;
            }
            await Promise.all(restoreIframes.map(async (iframe) => {
                if (!isRestoreCurrent()) {
                    return;
                }
                const editors = getPrototypeEditorApi(iframe);
                if (editors?.runHostToolbarAction) {
                    await Promise.resolve(editors.runHostToolbarAction(selectionAction));
                    return;
                }
                if (iframe.contentWindow) {
                    await postPrototypeEditorHostToolbarAction(iframe, selectionAction);
                }
            }));
            if (!isRestoreCurrent()) {
                return false;
            }
            const explicitSelectionState = {
                ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                selectionModeActive: restoreOptions.selectionModeActive,
            };
            const resolvedState = resolveHostToolbarStateForDisplay(
                hostToolbarStateRef.current,
                explicitSelectionState,
                isDarkMode,
            );
            setResolvedHostToolbarState(resolvedState);
        }
        if (!isRestoreCurrent()) {
            return false;
        }
        quickEditRuntimeActiveRef.current = true;
        setEditorStatus({ mode: 'quickEdit' });
        refreshEditorStatus();
        return true;
    }, [
        enterPrototypeEditor,
        getPreviewIframes,
        getPrototypeEditorApi,
        getSecondaryPreviewIframe,
        isDarkMode,
        postPrototypeEditorHostToolbarAction,
        previewConfig.previewMode,
        refreshEditorStatus,
        setResolvedHostToolbarState,
    ]);

    const restorePendingPrototypeEditor = useCallback(async (
        expectedPrimaryIframe: HTMLIFrameElement | null,
        options: { requireRuntimeReady?: boolean } = {},
    ) => {
        const restoreOptions = pendingPrototypeEditorRestoreRef.current;
        if (!restoreOptions || !expectedPrimaryIframe) {
            return false;
        }
        const expectedGeneration = getPreviewIframeGeneration(expectedPrimaryIframe);
        const restoreSequence = prototypeEditorRestoreSeqRef.current += 1;
        const isRestoreCurrent = () => (
            prototypeEditorRestoreSeqRef.current === restoreSequence
            && getPrimaryPreviewIframe() === expectedPrimaryIframe
            && getPreviewIframeGeneration(expectedPrimaryIframe) === expectedGeneration
            && pendingPrototypeEditorRestoreRef.current === restoreOptions
            && (!options.requireRuntimeReady
                || quickEditRuntimeReadyIframeRef.current === expectedPrimaryIframe)
        );
        if (!isRestoreCurrent()) {
            return false;
        }
        activePrototypeEditorLaunchOptionsRef.current = restoreOptions;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (!isRestoreCurrent()) {
                return false;
            }
            const restored = await reenterPrototypeEditorAfterIframeLoad(
                restoreOptions,
                expectedPrimaryIframe,
                isRestoreCurrent,
            );
            if (!isRestoreCurrent()) {
                return false;
            }
            if (restored) {
                const pendingOpenIntent = pendingPrototypeEditorOpenIntentRef.current;
                pendingPrototypeEditorRestoreRef.current = null;
                pendingPrototypeEditorOpenIntentRef.current = false;
                if (pendingOpenIntent) {
                    completePrototypeEditorOpen();
                }
                return true;
            }
            if (attempt < 2) {
                await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, 100);
                });
                if (!isRestoreCurrent()) {
                    return false;
                }
            }
        }
        return false;
    }, [
        completePrototypeEditorOpen,
        getPreviewIframeGeneration,
        getPrimaryPreviewIframe,
        reenterPrototypeEditorAfterIframeLoad,
    ]);

    const restorePendingStandalonePanel = useCallback(async () => {
        if (!pendingStandalonePanelRestoreRef.current) {
            return false;
        }
        const restored = await enterPrototypeEditorPanelOnly(getPrimaryPreviewIframe());
        if (restored) {
            pendingStandalonePanelRestoreRef.current = false;
        }
        return restored;
    }, [enterPrototypeEditorPanelOnly, getPrimaryPreviewIframe]);

    const maybeAutoOpenStandaloneDecisionPanel = useCallback(async (iframe: HTMLIFrameElement | null, sequence: number) => {
        if (!iframe?.contentWindow) {
            return;
        }
        if (sequence !== decisionPanelAutoOpenSeqRef.current) {
            return;
        }
        if (resourceType !== 'prototype' || viewMode !== 'demo') {
            return;
        }
        if (quickEditRuntimeActiveRef.current || documentEditorActiveRef.current || standalonePanelOpen) {
            return;
        }

        let nextState = getPrototypeEditorApi(iframe)?.getHostToolbarState?.() ?? null;
        let decisionDataCount = getPrototypeEditorApi(iframe)?.getDecisionDataCount?.() ?? 0;
        if (!hasPrototypeDecisionData(nextState, decisionDataCount)) {
            const bridgeState = await queryPrototypeEditorState(iframe);
            nextState = bridgeState?.hostToolbarState ?? nextState;
            decisionDataCount = bridgeState?.decisionDataCount ?? decisionDataCount;
        }
        if (sequence !== decisionPanelAutoOpenSeqRef.current || iframe !== getPrimaryPreviewIframe()) {
            return;
        }
        const hasDecisionData = hasPrototypeDecisionData(nextState, decisionDataCount);
        loadedPrototypeDecisionDataAvailableRef.current = hasDecisionData;
        setPrototypeDecisionDataAvailable(hasDecisionData);
        if (!hasDecisionData) {
            return;
        }

        const opened = await enterPrototypeEditorPanelOnly(iframe);
        if (sequence !== decisionPanelAutoOpenSeqRef.current || iframe !== getPrimaryPreviewIframe()) {
            return;
        }
        setStandalonePanelOpen(opened);
    }, [
        enterPrototypeEditorPanelOnly,
        getPrimaryPreviewIframe,
        getPrototypeEditorApi,
        queryPrototypeEditorState,
        resourceType,
        standalonePanelOpen,
        viewMode,
    ]);

    const handlePreviewIframeLoad = useCallback((iframe?: HTMLIFrameElement | null) => {
        const currentDocumentUrlKey = getRuntimeDocumentUrlKey(primaryIframeUrl);
        const primaryIframe = getPrimaryPreviewIframe();
        const loadedIframe = iframe ?? primaryIframe;
        const runtimeReadyForPrimaryIframe = isQuickEditRuntimeReadyForIframe(
            quickEditRuntimeStatus,
            quickEditRuntimeReadyIframeRef.current,
            primaryIframe,
        );
        markPreviewIframeLoaded(loadedIframe);
        if (loadedIframe && loadedIframe !== primaryIframe) {
            if (quickEditRuntimeActiveRef.current) {
                void enterPrototypeEditor(loadedIframe, { showMissingWarning: false });
            }
            return;
        }
        const decisionPanelAutoOpenSeq = decisionPanelAutoOpenSeqRef.current + 1;
        decisionPanelAutoOpenSeqRef.current = decisionPanelAutoOpenSeq;
        if (!currentDocumentIsHtml) {
            void maybeAutoOpenStandaloneDecisionPanel(primaryIframe, decisionPanelAutoOpenSeq);
        }
        const waitingForPrototypeRuntime = Boolean(
            pendingPrototypeEditorRestoreRef.current
            && !currentDocumentIsHtml,
        );
        if (currentDocumentIsHtml) {
            clearQuickEditRuntimeTimeout();
            prototypeEditorRestoreSeqRef.current += 1;
            quickEditRuntimeReadyIframeRef.current = null;
            setQuickEditRuntimeStatus('idle');
        } else {
            if (!waitingForPrototypeRuntime
                && runtimeReadyForPrimaryIframe
                && lastQuickEditRuntimeDocumentUrlKeyRef.current === currentDocumentUrlKey) {
                // Hash-routed prototype subpages keep the same iframe document.
                // The runtime script is already connected, so avoid flipping the
                // toolbar back to a pending/missing state while preserving editor
                // re-entry below.
            } else {
                prototypeEditorRestoreSeqRef.current += 1;
                quickEditRuntimeReadyIframeRef.current = null;
                lastQuickEditRuntimeDocumentUrlKeyRef.current = currentDocumentUrlKey;
                beginQuickEditRuntimeHandshake(primaryIframe);
            }
        }
        if (documentEditorActiveRef.current && !pendingDocumentEditorRestoreModeRef.current) {
            const editorApi = getDocumentEditorApi();
            if (editorApi?.enableDocumentEditor) {
                setDocumentEditorContext(editorApi);
                void Promise.resolve(editorApi.enableDocumentEditor({
                    toolbarMode: 'host',
                    quickEditMode: docEditState.quickEditMode,
                    initialDarkMode: isDarkMode,
                    assistantPanelOpen: assistantContextAppendAvailable,
                })).then(() => {
                    const nextState = editorApi.getHostToolbarState?.() ?? null;
                    setResolvedHostToolbarState(resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode));
                    documentHostToolbarUnsubscribeRef.current?.();
                    documentHostToolbarUnsubscribeRef.current = editorApi.subscribeHostToolbarState?.((nextToolbarState) => {
                        setResolvedHostToolbarState(resolveHostToolbarStateForDisplay(
                            hostToolbarStateRef.current,
                            nextToolbarState,
                            isDarkModeRef.current,
                        ));
                    }) ?? null;
                });
            }
        }
        if (pendingPrototypeEditorRestoreRef.current) {
            if (currentDocumentIsHtml) {
                void restorePendingPrototypeEditor(primaryIframe);
            }
            return;
        }
        if (pendingStandalonePanelRestoreRef.current) {
            if (currentDocumentIsHtml) {
                void restorePendingStandalonePanel();
            }
            return;
        }
        if (quickEditRuntimeActiveRef.current) {
            void enterPrototypeEditor(primaryIframe, { showMissingWarning: false });
            if (previewConfig.previewMode === 'split') {
                const secondaryIframe = getSecondaryPreviewIframe();
                if (secondaryIframe?.contentWindow) {
                    void enterPrototypeEditor(secondaryIframe, { showMissingWarning: false });
                }
            }
        }
    }, [
        assistantContextAppendAvailable,
        beginQuickEditRuntimeHandshake,
        clearQuickEditRuntimeTimeout,
        currentDocumentIsHtml,
        docEditState.quickEditMode,
        enterPrototypeEditor,
        getDocumentEditorApi,
        setDocumentEditorContext,
        getRuntimeDocumentUrlKey,
        getPrimaryPreviewIframe,
        getSecondaryPreviewIframe,
        isDarkMode,
        markPreviewIframeLoaded,
        maybeAutoOpenStandaloneDecisionPanel,
        primaryIframeUrl,
        previewConfig.previewMode,
        quickEditRuntimeStatus,
        restorePendingPrototypeEditor,
        restorePendingStandalonePanel,
        setResolvedHostToolbarState,
        setQuickEditRuntimeStatus,
    ]);

    useEffect(() => {
        const handleQuickEditRuntimeMessage = (event: MessageEvent) => {
            if (!isQuickEditRuntimeMessage(event.data)) {
                return;
            }
            const previewIframe = getPrimaryPreviewIframe();
            if (!previewIframe || event.source !== previewIframe.contentWindow) {
                return;
            }
            if (selectedItem?.clientUrl) {
                try {
                    const expectedOrigin = getClientUrlOrigin(selectedItem.clientUrl);
                    if (!expectedOrigin) {
                        prototypeEditorRestoreSeqRef.current += 1;
                        setQuickEditRuntimeStatus('error');
                        void postProjectCommunicationRecord(selectedItem, 'sessions', {
                            status: 'error',
                            errorMessage: 'invalid clientUrl origin',
                        }).catch(() => undefined);
                        return;
                    }
                    if (event.origin !== expectedOrigin) {
                        prototypeEditorRestoreSeqRef.current += 1;
                        setQuickEditRuntimeStatus('error');
                        void postProjectCommunicationRecord(selectedItem, 'sessions', {
                            status: 'error',
                            clientUrlOrigin: event.origin,
                            errorMessage: 'runtimeReady origin mismatch',
                        }).catch(() => undefined);
                        return;
                    }
                } catch {
                    prototypeEditorRestoreSeqRef.current += 1;
                    setQuickEditRuntimeStatus('error');
                    void postProjectCommunicationRecord(selectedItem, 'sessions', {
                        status: 'error',
                        errorMessage: 'invalid clientUrl origin',
                    }).catch(() => undefined);
                    return;
                }
            }
            if (event.data?.type === 'axhub.quickEdit.runtimeReady') {
                clearQuickEditRuntimeTimeout();
                if (getPreviewIframeGeneration(previewIframe) <= 0) {
                    markPreviewIframeLoaded(previewIframe);
                }
                quickEditRuntimeReadyIframeRef.current = previewIframe;
                setQuickEditRuntimeStatus('ready');
                void restorePendingPrototypeEditor(previewIframe, { requireRuntimeReady: true });
                void restorePendingStandalonePanel();
                void postProjectCommunicationRecord(selectedItem, 'sessions', {
                    status: 'ready',
                    clientUrlOrigin: event.origin,
                    runtimeVersion: event.data.runtimeVersion,
                }).catch(() => undefined);
                return;
            }
            if (event.data?.type === 'axhub.quickEdit.patch') {
                setResolvedHostToolbarState({
                    ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                    clearEditsDisabled: false,
                    modifiedCount: Math.max(1, hostToolbarStateRef.current?.modifiedCount ?? 0),
                });
                forwardQuickEditPatch(event.data.patch, previewIframe);
                void postProjectCommunicationRecord(selectedItem, 'runtime-message', {
                    messageType: event.data.type,
                    status: 'success',
                }).catch(() => undefined);
                return;
            }
            if (event.data?.type === 'axhub.quickEdit.save') {
                setResolvedHostToolbarState({
                    ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                    clearEditsDisabled: true,
                    modifiedCount: 0,
                });
                messageApi.success('Quick Edit 更改已提交');
                void postProjectCommunicationRecord(selectedItem, 'edit-history', {
                    operationType: 'quickEdit.save',
                    status: 'success',
                }).catch(() => undefined);
                return;
            }
            if (event.data?.type === 'axhub.quickEdit.error') {
                prototypeEditorRestoreSeqRef.current += 1;
                if (quickEditRuntimeReadyIframeRef.current === previewIframe) {
                    quickEditRuntimeReadyIframeRef.current = null;
                }
                setQuickEditRuntimeStatus('error');
                messageApi.error(event.data.message || event.data.error || 'Quick Edit runtime 执行失败');
                reportQuickEditRuntimeError(event.data.message || event.data.error || 'Quick Edit runtime 执行失败', previewIframe);
                void postProjectCommunicationRecord(selectedItem, 'runtime-message', {
                    messageType: event.data.type,
                    status: 'error',
                    errorMessage: event.data.message || event.data.error || 'Quick Edit runtime 执行失败',
                }).catch(() => undefined);
            }
        };

        window.addEventListener('message', handleQuickEditRuntimeMessage);
        return () => window.removeEventListener('message', handleQuickEditRuntimeMessage);
    }, [
        clearQuickEditRuntimeTimeout,
        forwardQuickEditPatch,
        getPreviewIframeGeneration,
        getPrimaryPreviewIframe,
        markPreviewIframeLoaded,
        messageApi,
        reportQuickEditRuntimeError,
        restorePendingPrototypeEditor,
        restorePendingStandalonePanel,
        selectedItem,
        setResolvedHostToolbarState,
    ]);

    useEffect(() => {
        if (!pendingPrototypeEditorOpenIntentRef.current
            || quickEditRuntimeStatus !== 'error') {
            return;
        }
        prototypeEditorRestoreSeqRef.current += 1;
        pendingPrototypeEditorRestoreRef.current = null;
        pendingPrototypeEditorOpenIntentRef.current = false;
        activePrototypeEditorLaunchOptionsRef.current = null;
    }, [quickEditRuntimeStatus]);

    const setAnnotationAssistantToolbarState = useCallback((nextState: Partial<CommentaryHostToolbarState>) => {
        const resolvedState = resolveHostToolbarStateForDisplay(
            hostToolbarStateRef.current,
            {
                ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                ...nextState,
            },
            isDarkMode,
        );
        setResolvedHostToolbarState(resolvedState);
        return resolvedState;
    }, [isDarkMode, setResolvedHostToolbarState]);

    const connectAnnotationAcpRuntime = useCallback(async (options?: { showFeedback?: boolean }) => {
        const showFeedback = options?.showFeedback !== false;
        const wakingState = {
            ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
            robotState: 'waking' as const,
            robotLoading: true,
            robotDisabled: true,
            sendDisabled: true,
            sendLoading: false,
            interruptDisabled: true,
            interruptLoading: false,
            darkMode: isDarkMode,
        };
        hostToolbarStateRef.current = wakingState;
        setHostToolbarState(wakingState);

        const hideLoading = showFeedback ? messageApi.loading('正在连接本地 AI...', 0) : null;
        try {
            const runtime = await (connectAssistantRuntimeSilently?.() ?? probeAssistantRuntimeSilently?.());
            if (!isAssistantRuntimeReady(runtime)) {
                setAnnotationAssistantToolbarState({
                    robotState: 'sleeping' as const,
                    robotLoading: false,
                    robotDisabled: false,
                    sendDisabled: true,
                    sendLoading: false,
                    interruptDisabled: true,
                    interruptLoading: false,
                });
                if (showFeedback) {
                    messageApi.warning('本地 AI 暂未连接，请确认本地服务已启动');
                }
                return false;
            }

            setAnnotationAssistantToolbarState({
                robotState: 'awake' as const,
                robotLoading: false,
                robotDisabled: false,
                sendDisabled: false,
                sendLoading: false,
                interruptDisabled: true,
                interruptLoading: false,
            });
            if (showFeedback) {
                messageApi.success('本地 AI 已连接');
            }
            return true;
        } catch (error) {
            console.warn('[Axhub] 批注本地 AI 连接失败:', error);
            setAnnotationAssistantToolbarState({
                robotState: 'sleeping' as const,
                robotLoading: false,
                robotDisabled: false,
                sendDisabled: true,
                sendLoading: false,
                interruptDisabled: true,
                interruptLoading: false,
            });
            if (showFeedback) {
                messageApi.warning('本地 AI 暂未连接，请确认本地服务已启动');
            }
            return false;
        } finally {
            hideLoading?.();
        }
    }, [
        connectAssistantRuntimeSilently,
        isDarkMode,
        messageApi,
        probeAssistantRuntimeSilently,
        setAnnotationAssistantToolbarState,
    ]);

    const openAnnotationAssistantWithContext = useCallback(async () => {
        if (!onOpenAnnotationAssistant) {
            messageApi.warning('AI 助手入口未就绪');
            return false;
        }
        const opened = await onOpenAnnotationAssistant?.(assistantContextV1);
        if (opened === false) {
            messageApi.warning('AI 助手暂未打开');
            return false;
        }
        setAnnotationAssistantToolbarState({
            robotState: 'awake' as const,
            robotLoading: false,
            robotDisabled: false,
            sendDisabled: false,
            sendLoading: false,
            interruptDisabled: true,
            interruptLoading: false,
        });
        messageApi.success('AI 已打开');
        return true;
    }, [
        assistantContextV1,
        messageApi,
        onOpenAnnotationAssistant,
        setAnnotationAssistantToolbarState,
    ]);

    const applyAnnotationEditingTaskState = useCallback(async (
        targets: AnnotationDirectRunEditingTarget[] | null | undefined,
        nextState: 'editing' | 'idle' | 'completed' | 'error',
        taskRef: AnnotationDirectRunTaskRef,
    ) => {
        const uniqueTargets = new Map<string, AnnotationDirectRunEditingTarget>();
        for (const target of targets || []) {
            const elementKey = String(target?.elementKey || '').trim();
            if (!elementKey) continue;
            const pane = target.pane || 'primary';
            uniqueTargets.set(`${pane}:${elementKey}`, {
                ...target,
                pane,
                elementKey,
            });
        }
        await Promise.all(Array.from(uniqueTargets.values()).map(async (target) => {
            const iframe = target.iframe ?? getPreviewIframe(target.pane || 'primary');
            const editors = getPrototypeEditorApi(iframe);
            let synced = false;
            if (editors?.setNodeEditingState) {
                try {
                    await editors.setNodeEditingState(target.elementKey, nextState, taskRef, target.targetRef ?? null);
                    synced = true;
                } catch {
                    synced = false;
                }
            }
            if (!synced && iframe?.contentWindow) {
                try {
                    await postPrototypeEditorNodeEditingState(
                        target.iframe ?? iframe,
                        target.elementKey,
                        nextState,
                        taskRef,
                        target.targetRef ?? null,
                    );
                } catch {
                    // State sync is best-effort; the API run should not fail because an overlay is unavailable.
                }
            }
        }));
    }, [
        getPreviewIframe,
        getPrototypeEditorApi,
        postPrototypeEditorNodeEditingState,
    ]);

    const runAnnotationAcpChatPrompt = useCallback(async (input: string | null | undefined | AnnotationPromptRunRequest) => {
        const request = normalizeAnnotationPromptRunRequest(input);
        const prompt = String(request.promptText || '').trim();
        if (!prompt) {
            messageApi.info('没有可发送的提示词内容');
            return false;
        }

        if (!onRunAnnotationAssistantPromptViaApi) {
            messageApi.warning('AI 助手入口未就绪');
            return false;
        }

        const handleDirectRunEvent = async (event: AnnotationDirectRunEvent) => {
            switch (event.type) {
                case 'started':
                case 'prepared':
                case 'accepted':
                    await applyAnnotationEditingTaskState(event.editingTargets, 'editing', event.taskRef);
                    break;
                case 'completed':
                    await applyAnnotationEditingTaskState(event.editingTargets, 'completed', event.taskRef);
                    await clearCompletedCommentsForTargets(event.editingTargets);
                    if (request.showCompletionFeedback !== false) messageApi.success('AI 已执行');
                    break;
                case 'aborted':
                case 'skipped':
                    await applyAnnotationEditingTaskState(event.editingTargets, 'idle', event.taskRef);
                    break;
                case 'error': {
                    const terminalTaskRef = buildAnnotationEditingErrorTaskRef(event.taskRef, event.error);
                    await applyAnnotationEditingTaskState(event.editingTargets, 'error', terminalTaskRef);
                    messageApi.error(`AI 执行失败：${formatThrownError(event.error)}`);
                    break;
                }
                case 'settled':
                    refreshAnnotationDirectRunToolbarState();
                    break;
                default:
                    break;
            }
        };

        const startResult = annotationDirectRunRegistryRef.current.startRun({
            context: assistantContextV1,
            prompt,
            requestId: request.operationId,
            editingTargets: request.editingTargets,
            mcpServers: request.mcpServers,
            maxActiveRuns: maxAnnotationDirectRunCount,
            submit: (submitRequest) => onRunAnnotationAssistantPromptViaApi({
                context: submitRequest.context,
                prompt: submitRequest.prompt,
                editingTargets: submitRequest.editingTargets,
                mcpServers: submitRequest.mcpServers,
                signal: submitRequest.signal,
                onPrepared: submitRequest.onPrepared,
                onAccepted: submitRequest.onAccepted,
                onEvent: submitRequest.onEvent as ((event: AiRunSseEvent) => void | Promise<void>) | undefined,
            }),
            onEvent: handleDirectRunEvent,
            onStreamEvent: request.onStreamEvent,
        });
        if (!startResult.started) {
            messageApi.info(<span>已有 {startResult.activeRunCount} 个 AI 执行正在进行，请稍后再试，或 <a href="#" onClick={(event) => { event.preventDefault(); openSettingsDialog?.('ai'); }}>去设置</a> 调整并发数</span>);
            return false;
        }
        const activeRunCount = annotationDirectRunRegistryRef.current.getActiveRunCount();
        setAnnotationAssistantToolbarState({
            robotState: 'working' as const,
            robotLoading: false,
            sendDisabled: activeRunCount >= maxAnnotationDirectRunCount,
            sendLoading: activeRunCount >= maxAnnotationDirectRunCount,
            interruptDisabled: false,
            interruptLoading: false,
        });
        if (request.returnExecutionHandle) {
            return {
                accepted: true,
                executionId: String(request.operationId || startResult.runKey),
                status: 'running',
            };
        }
        return startResult.promise;
    }, [
        assistantContextV1,
        applyAnnotationEditingTaskState,
        clearCompletedCommentsForTargets,
        maxAnnotationDirectRunCount,
        messageApi,
        openSettingsDialog,
        onRunAnnotationAssistantPromptViaApi,
        refreshAnnotationDirectRunToolbarState,
        setAnnotationAssistantToolbarState,
    ]);

    const abortAnnotationDirectRun = useCallback(async (options?: {
        showFeedback?: boolean;
        taskId?: string;
    }) => {
        const taskId = String(options?.taskId || '').trim();
        const cancelledCount = taskId
            ? Number(await annotationDirectRunRegistryRef.current.abortRun(taskId))
            : await annotationDirectRunRegistryRef.current.abortAll();
        if (cancelledCount <= 0) {
            setAnnotationAssistantToolbarState({
                interruptDisabled: true,
                interruptLoading: false,
            });
            return false;
        }
        setAnnotationAssistantToolbarState({
            interruptDisabled: false,
            interruptLoading: true,
        });
        if (options?.showFeedback !== false) {
            messageApi.info('已终止 AI 执行');
        }
        return true;
    }, [
        messageApi,
        setAnnotationAssistantToolbarState,
    ]);

    const copyHostToolbarPromptText = useCallback(async (promptText: string | null | undefined) => {
        if (!promptText) {
            messageApi.info('没有可复制的提示词内容');
            return true;
        }
        try {
            await navigator.clipboard.writeText(promptText);
            messageApi.success('已复制到剪贴板');
        } catch {
            messageApi.warning('自动复制失败，请手动复制');
        }
        return true;
    }, [messageApi]);

    const enablePrototypeAnnotationFromHost = useCallback(async () => {
        const skipConfirmation = skipPrototypeAnnotationEnableConfirmationRef.current;
        skipPrototypeAnnotationEnableConfirmationRef.current = false;
        const targetPath = resolvePrototypeAnnotationTargetPath(selectedItem);
        if (!targetPath) {
            messageApi.error('需求标注没有开启成功，请刷新页面后再试');
            return false;
        }

        if (!skipConfirmation) {
            const confirmed = await appDialog.confirm({
                title: '开启需求标注',
                description: '开启需求标注功能后，你可以在当前原型里查看和编辑需求标注。这个入口开启后不能在这里关闭；如果之后需要关闭，请让 AI 帮你处理。',
                confirmText: '开启',
                cancelText: '取消',
                tone: 'brand',
                dismissible: false,
            });
            if (!confirmed) {
                return false;
            }
        }

        const projectScope = requireProjectScope(projectId);

        try {
            const response = await fetch(withProjectScope('/api/prototype-annotation/enable', projectScope), {
                method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     targetPath,
                     pages: normalizePrototypeRoutePages(selectedItem?.pages),
                     projectId: projectScope.projectId,
                 }),
            });
            const payload = await response.json().catch(() => null) as {
                enabled?: boolean;
                changedIndex?: boolean;
                error?: string;
            } | null;
            if (!response.ok || payload?.enabled !== true) {
                throw new Error(payload?.error || '需求标注没有开启成功，请刷新页面后再试');
            }

            const nextState = {
                ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                annotationEnabled: true,
                annotationEnableAvailable: true,
                annotationEnableLoading: false,
                annotationEnableDisabled: true,
                annotationEnableTitle: '需求标注已开启',
            };
            hostToolbarStateRef.current = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
            setHostToolbarState(hostToolbarStateRef.current);
            messageApi.success('需求标注已开启，可直接在当前页面查看和编辑');
            return true;
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : '需求标注没有开启成功，请刷新页面后再试');
            return false;
        }
    }, [
        appDialog,
        isDarkMode,
        messageApi,
        projectId,
        selectedItem,
    ]);

    const runQuickEditHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {
        if (action.type === 'wake-agent') {
            return connectAnnotationAcpRuntime({ showFeedback: true });
        }
        if (action.type === 'send-to-agent') {
            return runAnnotationAcpChatPrompt(null);
        }
        if (action.type === 'interrupt-agent') {
            return abortAnnotationDirectRun();
        }

        const editors: HostToolbarEditorsApi = {
            getHostToolbarState: () => hostToolbarStateRef.current ?? createDefaultHostToolbarState(),
            subscribeHostToolbarState: (listener) => {
                listener(hostToolbarStateRef.current ?? createDefaultHostToolbarState());
                return () => undefined;
            },
            runHostToolbarAction: async (nextAction) => {
                if (nextAction.type === 'disconnect-agent') {
                    const nextState = {
                        ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                        robotState: 'sleeping' as const,
                        sendDisabled: true,
                        interruptDisabled: true,
                    };
                    hostToolbarStateRef.current = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
                    setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));
                    return true;
                }
                if (nextAction.type === 'clear-edits') {
                    const handled = await saveQuickEditRuntime();
                    if (handled) {
                        const clearedState = resolveHostToolbarStateAfterClearEdits(
                            hostToolbarStateRef.current,
                            hostToolbarStateRef.current ?? hostToolbarState ?? createDefaultHostToolbarState(),
                            isDarkMode,
                        );
                        hostToolbarStateRef.current = clearedState;
                        setHostToolbarState(clearedState);
                    }
                    return handled;
                }
                if (nextAction.type === 'toggle-property-panel') {
                    const nextState = {
                        ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                        propertyPanelOpen: nextAction.open ?? !(hostToolbarStateRef.current?.propertyPanelOpen ?? false),
                    };
                    hostToolbarStateRef.current = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
                    setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));
                    return true;
                }
                if (nextAction.type === 'toggle-dark-mode') {
                    const nextDarkMode = typeof nextAction.darkMode === 'boolean'
                        ? nextAction.darkMode
                        : !isDarkMode;
                    setIsDarkMode?.(nextDarkMode);
                    const nextState = {
                        ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                        darkMode: nextDarkMode,
                    };
                    hostToolbarStateRef.current = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, nextDarkMode);
                    setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, nextDarkMode));
                    return true;
                }
                if (nextAction.type === 'toggle-page-animations') {
                    const nextState = {
                        ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                        disablePageAnimations: !(hostToolbarStateRef.current?.disablePageAnimations ?? false),
                    };
                    hostToolbarStateRef.current = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
                    setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));
                    return true;
                }
                if (nextAction.type === 'toggle-selection-mode') {
                    const nextState = {
                        ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                        selectionModeActive: nextAction.active ?? !(hostToolbarStateRef.current?.selectionModeActive ?? true),
                    };
                    hostToolbarStateRef.current = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
                    setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));
                    return true;
                }
                if (
                    nextAction.type === 'copy-prompt'
                    || nextAction.type === 'set-active-agent'
                    || nextAction.type === 'copy-skill-install-prompt'
                    || nextAction.type === 'open-keyboard-shortcuts'
                ) {
                    messageApi.info('Quick Edit runtime 已接收宿主工具栏操作');
                    return true;
                }
                return false;
            },
        };
        const previousState = editors.getHostToolbarState?.() ?? hostToolbarState;
        const hideLoading = action.type === 'wake-agent'
            ? messageApi.loading('正在连接本地 AI...', 0)
            : null;
        try {
            if (action.type === 'wake-agent') {
                const wakingState = {
                    ...(hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                    robotState: 'waking' as const,
                    robotLoading: true,
                };
                hostToolbarStateRef.current = wakingState;
                setHostToolbarState((previous) => ({
                    ...(previous ?? createDefaultHostToolbarState()),
                    robotState: 'waking',
                    robotLoading: true,
                }));
            }
            const handled = await editors.runHostToolbarAction?.(action);
            const nextState = await waitForHostToolbarActionState(editors, action, previousState);
            hostToolbarStateRef.current = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
            setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));
            if (action.type === 'wake-agent') {
                if (nextState.robotState === 'awake' || nextState.robotState === 'working') {
                    messageApi.success('本地 AI 已连接');
                } else {
                    messageApi.warning('本地 AI 暂未连接，请确认本地服务已启动');
                }
            }
            return Boolean(handled);
        } finally {
            hideLoading?.();
        }
    }, [
        hostToolbarState,
        isDarkMode,
        messageApi,
        connectAnnotationAcpRuntime,
        runAnnotationAcpChatPrompt,
        saveQuickEditRuntime,
        setIsDarkMode,
        abortAnnotationDirectRun,
    ]);

    const collectPrototypePrompt = useCallback(async (
        pane: PreviewPane,
        action?: CommentaryHostToolbarAction | null,
    ): Promise<AnnotationPromptRunRequest> => {
        const iframe = getPreviewIframe(pane);
        const editors = getPrototypeEditorApi(iframe);
        const editingTargets = buildAnnotationDirectRunEditingTargets(
            pane,
            iframe,
            resolveAnnotationActionEditingTargets(action, editors?.getEditedSnapshot?.()?.modifiedElements ?? []),
        );
        const promptText = getAnnotationActionPromptText(action, editors);
        if (typeof promptText === 'string') {
            return {
                promptText,
                editingTargets,
            };
        }
        if (!iframe?.contentWindow) {
            return { promptText: '', editingTargets };
        }
        const bridgeResult = await postPrototypeEditorHostToolbarAction(iframe, action?.type === 'send-to-agent' && action.elementKey
            ? action
            : {
                type: 'copy-prompt',
                clipboard: 'host',
            });
        return {
            promptText: bridgeResult?.promptText ?? '',
            editingTargets: buildAnnotationDirectRunEditingTargets(
                pane,
                iframe,
                resolveAnnotationActionEditingTargets(action, bridgeResult?.modifiedElements ?? []),
            ),
        };
    }, [
        getPreviewIframe,
        getPrototypeEditorApi,
        postPrototypeEditorHostToolbarAction,
    ]);

    const collectSplitPrototypePrompts = useCallback(async (
        action?: CommentaryHostToolbarAction | null,
    ) => {
        const [primaryPrompt, secondaryPrompt] = await Promise.all([
            collectPrototypePrompt('primary', action),
            collectPrototypePrompt('secondary', action),
        ]);
        return [
            { pane: 'primary' as const, ...primaryPrompt },
            { pane: 'secondary' as const, ...secondaryPrompt },
        ];
    }, [collectPrototypePrompt]);

    const runPrototypePanePromptAction = useCallback(async (
        pane: PreviewPane,
        action: PrototypePanePromptAction,
    ): Promise<boolean> => {
        const prompt = await collectPrototypePrompt(
            pane,
            action === 'send-to-agent' ? { type: 'send-to-agent' } : null,
        );
        if (action === 'copy-prompt') {
            return copyHostToolbarPromptText(prompt.promptText);
        }
        return runAnnotationAcpChatPrompt(prompt);
    }, [
        collectPrototypePrompt,
        copyHostToolbarPromptText,
        runAnnotationAcpChatPrompt,
    ]);

    const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {
        const requestedAction = action.type === 'toggle-dark-mode'
            ? { ...action, darkMode: typeof action.darkMode === 'boolean' ? action.darkMode : !isDarkMode }
            : action;
        const runResolvedHostToolbarAction = async (nextAction: CommentaryHostToolbarAction) => {
            if (nextAction.type === 'play-notification-sound') {
                onAiNotification?.({
                    source: 'commentary-page',
                    scopeKey: String(selectedItem?.resourceId || selectedItem?.name || 'current-page'),
                    outcome: nextAction.sound === 'reminder' ? 'error' : 'completed',
                } satisfies NotificationIntent);
                return true;
            }
            if (nextAction.type === 'enable-annotation') {
                return enablePrototypeAnnotationFromHost();
            }
            if (nextAction.type === 'wake-agent') {
                return connectAnnotationAcpRuntime({ showFeedback: true });
            }
            if (nextAction.type === 'interrupt-agent') {
                return abortAnnotationDirectRun();
            }
            if (nextAction.type === 'full-exit') {
                if (!exitWebEditorRef.current) {
                    return false;
                }
                await abortAnnotationDirectRun({ showFeedback: false });
                await exitWebEditorRef.current({ restorePanelOnly: false });
                return true;
            }
            if (quickEditRuntimeActiveRef.current && nextAction.type === 'toggle-target-screenshot') {
                const handledResults = await Promise.all(getPreviewIframes().map(async (iframe) => {
                    const paneEditors = getPrototypeEditorApi(iframe);
                    if (paneEditors?.runHostToolbarAction) {
                        return Boolean(await Promise.resolve(paneEditors.runHostToolbarAction(nextAction)));
                    }
                    if (!iframe.contentWindow) return false;
                    const bridgeResult = await postPrototypeEditorHostToolbarAction(iframe, nextAction);
                    return Boolean(bridgeResult?.handled ?? bridgeResult?.success);
                }));
                const primaryState = getPrototypeEditorApi()?.getHostToolbarState?.() ?? hostToolbarStateRef.current;
                let resolvedState = resolveHostToolbarStateForDisplay(
                    hostToolbarStateRef.current,
                    primaryState,
                    isDarkMode,
                );
                if (typeof nextAction.enabled === 'boolean') {
                    const explicitTargetScreenshotState = {
                        ...(resolvedState ?? hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                        captureTargetScreenshot: nextAction.enabled,
                    };
                    resolvedState = resolveHostToolbarStateForDisplay(
                        hostToolbarStateRef.current,
                        explicitTargetScreenshotState,
                        isDarkMode,
                    );
                }
                setResolvedHostToolbarState(resolvedState);
                return handledResults.some(Boolean);
            }
            if (documentEditorActiveRef.current) {
                const editorApi = getDocumentEditorApi();
                const previousState = editorApi?.getHostToolbarState?.() ?? hostToolbarStateRef.current;
                const hideLoading = nextAction.type === 'wake-agent'
                    ? messageApi.loading('正在连接本地 AI...', 0)
                    : null;
                try {
                    if (nextAction.type === 'send-to-agent') {
                        return runAnnotationAcpChatPrompt({
                            promptText: editorApi?.getCopyPromptText?.(),
                        });
                    }
                    if (nextAction.type === 'copy-prompt') {
                        const promptText = editorApi?.getCopyPromptText?.();
                        if (typeof promptText === 'string') {
                            return copyHostToolbarPromptText(promptText);
                        }
                    }
                    const handled = await editorApi?.runHostToolbarAction?.(nextAction);
                    const nextState = editorApi?.getHostToolbarState?.() ?? previousState ?? null;
                    if (nextAction.type === 'toggle-dark-mode') {
                        setIsDarkMode?.(nextAction.darkMode);
                    }
                    let resolvedState = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
                    if (nextAction.type === 'toggle-selection-mode' && typeof nextAction.active === 'boolean') {
                        const explicitSelectionState = {
                            ...(resolvedState ?? hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                            selectionModeActive: nextAction.active,
                        };
                        resolvedState = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, explicitSelectionState, isDarkMode);
                    }
                    if (nextAction.type === 'toggle-target-screenshot' && typeof nextAction.enabled === 'boolean') {
                        const explicitTargetScreenshotState = {
                            ...(resolvedState ?? hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                            captureTargetScreenshot: nextAction.enabled,
                        };
                        resolvedState = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, explicitTargetScreenshotState, isDarkMode);
                    }
                    if (nextAction.type === 'clear-edits' && handled) {
                        const clearedState = resolveHostToolbarStateAfterClearEdits(hostToolbarStateRef.current, resolvedState, isDarkMode);
                        setResolvedHostToolbarState(clearedState);
                    } else {
                        setResolvedHostToolbarState(resolvedState);
                    }
                    if (nextAction.type === 'wake-agent') {
                        if (isHostToolbarAgentAwake(nextState)) {
                            messageApi.success('本地 AI 已连接');
                        } else if (!handled) {
                            messageApi.warning('本地 AI 暂未连接，请确认本地服务已启动');
                        }
                    }
                    return Boolean(handled);
                } finally {
                    hideLoading?.();
                }
            }
            if (quickEditRuntimeActiveRef.current) {
                const editors = getPrototypeEditorApi();
                const previousState = editors?.getHostToolbarState?.() ?? hostToolbarStateRef.current;
                const hideLoading = nextAction.type === 'wake-agent'
                    ? messageApi.loading('正在连接本地 AI...', 0)
                    : null;
                try {
                    if (nextAction.type === 'send-to-agent') {
                        if (nextAction.elementKey && nextAction.pane) {
                            const panePrompt = await collectPrototypePrompt(nextAction.pane, nextAction);
                            return runAnnotationAcpChatPrompt(panePrompt);
                        }
                        if (previewConfig.previewMode === 'split') {
                            const splitPrompts = await collectSplitPrototypePrompts(nextAction);
                            const combinedPrompt = buildCombinedPrototypePrompt(splitPrompts);
                            return runAnnotationAcpChatPrompt({
                                promptText: combinedPrompt,
                                editingTargets: splitPrompts.flatMap((item) => item.editingTargets || []),
                            });
                        }
                        const promptText = getAnnotationActionPromptText(nextAction, editors);
                        if (typeof promptText === 'string') {
                            return runAnnotationAcpChatPrompt({
                                promptText,
                                editingTargets: buildAnnotationDirectRunEditingTargets(
                                    'primary',
                                    getPrimaryPreviewIframe(),
                                    resolveAnnotationActionEditingTargets(
                                        nextAction,
                                        editors?.getEditedSnapshot?.()?.modifiedElements ?? [],
                                    ),
                                ),
                            });
                        }
                        const primaryIframe = getPrimaryPreviewIframe();
                        if (primaryIframe?.contentWindow) {
                            const bridgeResult = await postPrototypeEditorHostToolbarAction(
                                primaryIframe,
                                nextAction.elementKey
                                    ? nextAction
                                    : { ...nextAction, type: 'copy-prompt' as const, clipboard: 'host' as const },
                            );
                            return runAnnotationAcpChatPrompt({
                                promptText: bridgeResult?.promptText,
                                editingTargets: buildAnnotationDirectRunEditingTargets(
                                    'primary',
                                    primaryIframe,
                                    resolveAnnotationActionEditingTargets(
                                        nextAction,
                                        editors?.getEditedSnapshot?.()?.modifiedElements ?? [],
                                    ),
                                ),
                            });
                        }
                        return runAnnotationAcpChatPrompt(null);
                    }

                    if (nextAction.type === 'copy-prompt') {
                        if (previewConfig.previewMode === 'split') {
                            const combinedPrompt = buildCombinedPrototypePrompt(await collectSplitPrototypePrompts());
                            return copyHostToolbarPromptText(combinedPrompt);
                        }
                        const promptText = editors?.getCopyPromptText?.();
                        if (typeof promptText === 'string') {
                            return copyHostToolbarPromptText(promptText);
                        }
                        const primaryIframe = getPrimaryPreviewIframe();
                        if (primaryIframe?.contentWindow) {
                            const bridgeResult = await postPrototypeEditorHostToolbarAction(primaryIframe, {
                                ...nextAction,
                                clipboard: 'host',
                            });
                            return copyHostToolbarPromptText(bridgeResult?.promptText);
                        }
                    }

                    let handled = await editors?.runHostToolbarAction?.(nextAction);
                    let nextState = await waitForHostToolbarActionState(editors ?? {}, nextAction, previousState);
                    if (!editors?.runHostToolbarAction) {
                        const primaryIframe = getPrimaryPreviewIframe();
                        if (primaryIframe?.contentWindow) {
                            const bridgeResult = await postPrototypeEditorHostToolbarAction(primaryIframe, nextAction);
                            handled = bridgeResult?.handled ?? bridgeResult?.success ?? false;
                            nextState = bridgeResult?.hostToolbarState ?? nextState;
                        }
                    }
                    if (nextAction.type === 'toggle-dark-mode') {
                        setIsDarkMode?.(nextAction.darkMode);
                    }
                    let resolvedState = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, nextState, isDarkMode);
                    if (nextAction.type === 'toggle-selection-mode' && typeof nextAction.active === 'boolean') {
                        const explicitSelectionState = {
                            ...(resolvedState ?? hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                            selectionModeActive: nextAction.active,
                        };
                        resolvedState = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, explicitSelectionState, isDarkMode);
                    }
                    if (nextAction.type === 'toggle-target-screenshot' && typeof nextAction.enabled === 'boolean') {
                        const explicitTargetScreenshotState = {
                            ...(resolvedState ?? hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                            captureTargetScreenshot: nextAction.enabled,
                        };
                        resolvedState = resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, explicitTargetScreenshotState, isDarkMode);
                    }
                    if (nextAction.type === 'clear-edits' && handled) {
                        const clearedState = resolveHostToolbarStateAfterClearEdits(hostToolbarStateRef.current, resolvedState, isDarkMode);
                        setResolvedHostToolbarState(clearedState);
                    } else {
                        setResolvedHostToolbarState(resolvedState);
                    }
                    if (nextAction.type === 'wake-agent') {
                        if (isHostToolbarAgentAwake(nextState)) {
                            messageApi.success('本地 AI 已连接');
                        } else if (!handled) {
                            messageApi.warning('本地 AI 暂未连接，请确认本地服务已启动');
                        }
                    }
                    return Boolean(handled);
                } finally {
                    hideLoading?.();
                }
            }
            return runQuickEditHostToolbarAction(nextAction);
        };
        return runResolvedHostToolbarAction(requestedAction);
    }, [
        connectAnnotationAcpRuntime,
        collectPrototypePrompt,
        collectSplitPrototypePrompts,
        copyHostToolbarPromptText,
        enablePrototypeAnnotationFromHost,
         getDocumentEditorApi,
         getPreviewIframes,
         getPrimaryPreviewIframe,
        getPrototypeEditorApi,
        isDarkMode,
        messageApi,
        postPrototypeEditorHostToolbarAction,
        previewConfig.previewMode,
        runQuickEditHostToolbarAction,
        runAnnotationAcpChatPrompt,
        onAiNotification,
        selectedItem,
        setIsDarkMode,
        setResolvedHostToolbarState,
        abortAnnotationDirectRun,
    ]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const data = event.data as {
                type?: string;
                requestId?: unknown;
                action: CommentaryHostToolbarAction;
            } | undefined;
            if (!data || data.type !== 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST') {
                return;
            }

            const targetIframe = getPreviewIframes().find((iframe) => iframe.contentWindow === event.source);
            if (!targetIframe || event.source !== targetIframe.contentWindow) {
                return;
            }
            const targetOrigin = getIframeOrigin(targetIframe);
            if (targetOrigin !== '*' && event.origin !== targetOrigin) {
                return;
            }

            void (async () => {
                const requestId = typeof data.requestId === 'string' ? data.requestId : '';
                let response: {
                    type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT';
                    requestId: string;
                    handled: boolean;
                    error?: string;
                };
                try {
                    const sourcePane = resolvePreviewPaneForIframe(targetIframe);
                    const action = sourcePane
                        ? { ...data.action, pane: sourcePane } as CommentaryHostToolbarAction
                        : data.action;
                    const handled = await runHostToolbarAction(action);
                    response = {
                        type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT',
                        requestId,
                        handled,
                    };
                } catch (error) {
                    response = {
                        type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT',
                        requestId,
                        handled: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
                targetIframe.contentWindow?.postMessage(response, targetOrigin);
            })();
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [
        getIframeOrigin,
        getPreviewIframes,
        resolvePreviewPaneForIframe,
        runHostToolbarAction,
    ]);

    const runQuickEditSaveAction = useCallback(async (action: QuickEditSaveAction) => {
        if (!quickEditRuntimeActiveRef.current) {
            return false;
        }

        const targets: QuickEditSaveTarget[] = getPreviewIframes().map((iframe, index) => {
            const targetId = iframe === getSecondaryPreviewIframe() ? 'secondary' : index === 0 ? 'primary' : `preview-${index}`;
            return {
                id: targetId,
                prepare: async (nextAction) => {
                    const editors = getPrototypeEditorApi(iframe);
                    if (editors?.prepareQuickEditSave) {
                        return {
                            supported: true,
                            draft: await editors.prepareQuickEditSave(nextAction),
                        };
                    }
                    if (!iframe.contentWindow) {
                        return { supported: false, draft: null };
                    }
                    const bridgeResult = await postPrototypeEditorPrepareSave(iframe, nextAction);
                    return {
                        supported: Boolean(bridgeResult?.handled ?? bridgeResult?.success),
                        draft: bridgeResult?.saveDraft ?? null,
                    };
                },
                preflight: async (draft: QuickEditSaveDraft) => {
                    const editors = getPrototypeEditorApi(iframe);
                    if (editors?.preflightQuickEditSave) {
                        return editors.preflightQuickEditSave(draft);
                    }
                    if (!iframe.contentWindow) {
                        throw new Error('快速编辑预览窗口不可用');
                    }
                    const bridgeResult = await postPrototypeEditorPreflightSave(iframe, draft);
                    if (!bridgeResult?.savePreflight) {
                        throw new Error('快速编辑预览页未返回保存预检查结果');
                    }
                    return bridgeResult.savePreflight;
                },
                commit: async (draft: QuickEditSaveDraft) => {
                    const editors = getPrototypeEditorApi(iframe);
                    if (editors?.commitQuickEditSave) {
                        return editors.commitQuickEditSave(draft);
                    }
                    if (!iframe.contentWindow) {
                        throw new Error('快速编辑预览窗口不可用');
                    }
                    const bridgeResult = await postPrototypeEditorCommitSave(iframe, draft);
                    if (!bridgeResult?.saveCommitResult) {
                        throw new Error('快速编辑预览页未返回保存结果');
                    }
                    return bridgeResult.saveCommitResult;
                },
            } satisfies QuickEditSaveTarget;
        });

        const result = await quickEditSaveCoordinatorRef.current.run({
            action,
            targets,
            confirm: (dialog) => appDialog.confirm(dialog),
            notify: messageApi,
        });
        return result.handled;
    }, [
        appDialog,
        getSecondaryPreviewIframe,
        getPreviewIframes,
        getPrototypeEditorApi,
        messageApi,
        postPrototypeEditorCommitSave,
        postPrototypeEditorPrepareSave,
        postPrototypeEditorPreflightSave,
        quickEditSaveCoordinatorRef,
    ]);

    useEffect(() => {
        if (!documentEditorActiveRef.current && !quickEditRuntimeActiveRef.current) {
            setHostToolbarState((previousState) => (
                previousState
                    ? { ...previousState, darkMode: isDarkMode }
                    : previousState
            ));
            return;
        }

        setHostToolbarState((previousState) => (
            previousState
                ? { ...previousState, darkMode: isDarkMode }
                : previousState
        ));

        if (documentEditorActiveRef.current) {
            const editorApi = getDocumentEditorApi();
            setDocumentEditorContext(editorApi);
            void Promise.resolve(editorApi?.enableDocumentEditor?.({
                toolbarMode: 'host',
                quickEditMode: docEditState.quickEditMode,
                initialDarkMode: isDarkMode,
                assistantPanelOpen: assistantContextAppendAvailable,
            })).then(() => {
                void editorApi?.runHostToolbarAction?.({ type: 'toggle-dark-mode', darkMode: isDarkMode });
            });
            return;
        }

        if (quickEditRuntimeActiveRef.current) {
            const applyPrototypeRuntimeOptions = async (iframe: HTMLIFrameElement) => {
                await enterPrototypeEditor(iframe, { showMissingWarning: false });
                const editors = getPrototypeEditorApi(iframe);
                if (editors?.runHostToolbarAction) {
                    await Promise.resolve(editors.runHostToolbarAction({ type: 'toggle-dark-mode', darkMode: isDarkMode }));
                    return;
                }
                await postPrototypeEditorHostToolbarAction(iframe, { type: 'toggle-dark-mode', darkMode: isDarkMode });
            };

            void Promise.all(getPreviewIframes().map(applyPrototypeRuntimeOptions));
        }
    }, [
        assistantContextAppendAvailable,
        docEditState.quickEditMode,
        enterPrototypeEditor,
        getDocumentEditorApi,
        setDocumentEditorContext,
        getPreviewIframes,
        getPrototypeEditorApi,
        isDarkMode,
        postPrototypeEditorHostToolbarAction,
    ]);

    useEffect(() => {
        const prototypeIdentityChanged = selectedPrototypeIdentityRef.current !== selectedPrototypeIdentity;
        const waitingForQueuedPrototypeEditor = Boolean(
            !prototypeIdentityChanged
            && pendingPrototypeEditorRestoreRef.current
            && pendingPrototypeEditorOpenIntentRef.current,
        );
        if (waitingForQueuedPrototypeEditor) {
            return;
        }
        const shouldRestoreQuickEdit = quickEditRuntimeActiveRef.current && !prototypeIdentityChanged;
        if (shouldRestoreQuickEdit) {
            prototypeEditorRestoreSeqRef.current += 1;
            pendingPrototypeEditorRestoreRef.current = {
                ...(activePrototypeEditorLaunchOptionsRef.current ?? prototypeEditorLaunchOptions),
                selectionModeActive: hostToolbarStateRef.current?.selectionModeActive ?? true,
            };
            setEditorStatus({ mode: 'quickEdit' });
            refreshEditorStatus();
            return;
        }
        if (prototypeIdentityChanged && quickEditRuntimeActiveRef.current) {
            prototypeEditorRestoreSeqRef.current += 1;
            pendingPrototypeEditorRestoreRef.current = null;
            pendingPrototypeEditorOpenIntentRef.current = false;
            return;
        }
        decisionPanelAutoOpenSeqRef.current += 1;
        documentHostToolbarUnsubscribeRef.current?.();
        documentHostToolbarUnsubscribeRef.current = null;
        prototypeHostToolbarUnsubscribeRef.current?.();
        prototypeHostToolbarUnsubscribeRef.current = null;
        prototypeEditorRestoreSeqRef.current += 1;
        documentEditorActiveRef.current = false;
        quickEditRuntimeActiveRef.current = false;
        quickEditRuntimeReadyIframeRef.current = null;
        activePrototypeEditorLaunchOptionsRef.current = null;
        pendingPrototypeEditorOpenIntentRef.current = false;
        pendingDocSwitchRef.current = null;
        pendingDocumentEditorRestoreModeRef.current = null;
        pendingStandalonePanelRestoreRef.current = false;
        markdownPromptCacheRef.current = null;
        setDocEditState(createDefaultMarkdownQuickEditState());
        setStandalonePanelOpen(false);
        setReviewPanelOpen(false);
        exitPrototypeEditorPanelOnly();
        loadedPrototypeDecisionDataAvailableRef.current = false;
        setPrototypeDecisionDataAvailable(false);
        setHostToolbarState(null);
        refreshEditorStatus();
    }, [
        exitPrototypeEditorPanelOnly,
        primaryIframeUrl,
        prototypeEditorLaunchOptions,
        refreshEditorStatus,
        resourceType,
        selectedEditablePreviewResource,
        selectedPrototypeIdentity,
    ]);

    const quickEditAvailable = Boolean(selectedEditablePreviewResource)
        && (viewMode === 'demo' || resourceType === 'theme')
        && projectCapabilities?.quickEdit !== false
        && (quickEditRuntimeStatus === 'ready'
            || quickEditRuntimeStatus === 'pending'
            || resourceType === 'theme');
    const exportAvailability = useMemo<ExportAvailability>(() => {
        const hasClientUrl = Boolean(currentRuntimeExportResource?.clientUrl || currentRuntimeExportResource?.previewUrl);
        const hasSourceContext = hasExplicitSourceContext(selectedItem);
        const hasMakeExportContext = hasFigmaMakeExportContext(selectedItem);
        const figmaEnabled = projectCapabilities?.figmaExport !== false;
        const axureEnabled = projectCapabilities?.axureExport !== false;
        const canOpenGenericFigmaExport = Boolean(currentRuntimeExportResource) && figmaEnabled;
        const canOpenGenericAxureExport = Boolean(currentRuntimeExportResource) && axureEnabled;
        const canUseRuntimeFeatures = contentMode === 'theme'
            ? hasClientUrl
            : viewMode === 'demo' && hasClientUrl && quickEditRuntimeStatus === 'ready';
        const canUseSourceFeatures = viewMode === 'demo' && hasSourceContext && axureEnabled;
        const localHtmlExportEnabled = projectCapabilities?.localExports?.html === true;
        const localMakeExportEnabled = projectCapabilities?.localExports?.make === true;
        const figmaDisabledReason = !currentRuntimeExportResource
            ? '请先选择一个可导出资源'
            : !figmaEnabled
                ? '当前项目未启用 Figma 导出能力'
                : '';
        const axureDisabledReason = !currentRuntimeExportResource
            ? '请先选择一个可导出资源'
            : !axureEnabled
                ? '当前项目未启用 Axure 导出能力'
                : '';
        const runtimeMissingReason = !hasClientUrl
            ? '当前资源缺少预览地址'
            : contentMode === 'theme'
                ? ''
                : viewMode !== 'demo'
                ? '当前视图不支持原型 runtime 操作'
                : quickEditRuntimeStatus !== 'ready'
                ? '复制当前页面需要接入 /runtime/quick-edit.js'
                : '';
        const sourceMissingReason = hasSourceContext
            ? ''
            : '源码或 artifact metadata 缺失';
        const makeExportContextMissingReason = hasMakeExportContext
            ? ''
            : '源码或 Figma Make artifact metadata 缺失';
        const localExportSourceMissingReason = hasExplicitLocalPath(currentRuntimeExportResource)
            ? ''
            : '当前资源未声明本地文件路径';
        const htmlExportDisabledReason = !currentRuntimeExportResource
            ? '请先选择一个可导出资源'
            : !localHtmlExportEnabled
                ? '当前项目未启用 HTML 本地导出能力'
                : localExportSourceMissingReason;
        const makeExportDisabledReason = !selectedItem
            ? '请先选择一个原型页面'
            : !figmaEnabled
                ? '当前项目未启用 Figma 导出能力'
                : makeExportContextMissingReason;

        return {
            canOpenGenericFigmaExport,
            figmaDisabledReason,
            figmaDomDisabledReason: figmaDisabledReason || runtimeMissingReason,
            canOpenGenericAxureExport,
            axureDisabledReason,
            axureRuntimeDisabledReason: axureDisabledReason || runtimeMissingReason,
            axureSourceDisabledReason: axureDisabledReason || sourceMissingReason,
            canUseRuntimeFeatures,
            canUseSourceFeatures,
            hasClientUrl,
            hasSourceContext,
            htmlExportDisabledReason,
            makeExportDisabledReason,
        };
    }, [
        contentMode,
        currentRuntimeExportResource,
        projectCapabilities?.axureExport,
        projectCapabilities?.figmaExport,
        projectCapabilities?.localExports?.html,
        projectCapabilities?.localExports?.make,
        quickEditRuntimeStatus,
        selectedItem,
        viewMode,
    ]);
    const quickEditPromptAvailable = Boolean(
        selectedItem
        && viewMode === 'demo'
        && getAssistantContextCurrentFilePath(assistantContextV1),
    );

    const localShareUrl = useMemo(() => {
        const url = buildItemUrl(selectedItem, viewMode);
        return url ? url.toString() : '';
    }, [selectedItem, viewMode]);

    const getLANUrl = useCallback(() => {
        return buildLANItemUrl(selectedItem, viewMode);
    }, [selectedItem, viewMode]);

    const handleCopyLocalLink = useCallback(() => {
        if (!localShareUrl) {
            messageApi.error('当前没有可复制的链接');
            return;
        }
        void navigator.clipboard.writeText(localShareUrl).then(() => {
            toast.success('本地链接已复制');
            setQrCodeVisible(false);
        }).catch(() => {
            messageApi.error('复制失败');
        });
    }, [localShareUrl, messageApi]);

    const handleCopyLANLink = useCallback(() => {
        void navigator.clipboard.writeText(getLANUrl()).then(() => {
            toast.success('局域网链接已复制');
            setQrCodeVisible(false);
        }).catch(() => {
            messageApi.error('复制失败');
        });
    }, [getLANUrl, messageApi]);

    const handleRefreshElement = useCallback(() => {
        const refreshSnapshot = createPreviewRefreshRestoreSnapshot({
            prototypeEditorActive: quickEditRuntimeActiveRef.current,
            documentEditorActive: documentEditorActiveRef.current,
            prototypeEditorLaunchOptions: activePrototypeEditorLaunchOptionsRef.current ?? prototypeEditorLaunchOptions,
            selectionModeActive: hostToolbarStateRef.current?.selectionModeActive ?? true,
            documentQuickEditMode: docEditState.quickEditMode,
            standalonePanelOpen,
        });
        prototypeEditorRestoreSeqRef.current += 1;
        pendingPrototypeEditorRestoreRef.current = refreshSnapshot.prototypeEditor;
        pendingDocumentEditorRestoreModeRef.current = refreshSnapshot.documentQuickEditMode;
        pendingStandalonePanelRestoreRef.current = refreshSnapshot.standalonePanelOpen;
        if (refreshSnapshot.prototypeEditor || refreshSnapshot.documentQuickEditMode) {
            setEditorStatus({ mode: 'quickEdit' });
        }
        decisionPanelAutoOpenSeqRef.current += 1;
        setElementIframeKey((previous) => previous + 1);
    }, [
        docEditState.quickEditMode,
        prototypeEditorLaunchOptions,
        standalonePanelOpen,
    ]);

    const handleOpenDrawioResourceEditor = useCallback(() => {
        if (!currentMarkdownItem || !isDrawioResource(currentMarkdownItem)) {
            messageApi.warning('请先选择 Draw.io 资源');
            return;
        }
        void openDrawioResourceEditor({
            resource: {
                ...currentMarkdownItem,
                projectId: requireProjectScope(projectId).projectId,
            },
            kind: currentMarkdownResource.kind,
            messageApi,
            onSaved: handleRefreshElement,
        });
    }, [
        projectId,
        currentMarkdownItem,
        currentMarkdownResource.kind,
        handleRefreshElement,
        messageApi,
    ]);

    useEffect(() => {
        const url = new URL(window.location.href);
        const searchParams = url.searchParams;
        if (searchParams.get('openDrawio') !== '1') return;
        if (!currentMarkdownItem || !isDrawioResource(currentMarkdownItem)) return;

        searchParams.delete('openDrawio');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        void openDrawioResourceEditor({
            resource: {
                ...currentMarkdownItem,
                projectId: requireProjectScope(projectId).projectId,
            },
            kind: currentMarkdownResource.kind,
            messageApi,
            onSaved: handleRefreshElement,
        });
    }, [
        projectId,
        currentMarkdownItem,
        currentMarkdownResource.kind,
        handleRefreshElement,
        messageApi,
    ]);

    const notifyPreviewMessage = useCallback((level: unknown, content: unknown) => {
        const normalizedContent = typeof content === 'string' ? content.trim() : '';
        if (!normalizedContent) return;
        const messageLevel = typeof level === 'string' ? level : 'info';
        const notify = (messageApi as any)[messageLevel] || messageApi.info;
        notify(normalizedContent);
    }, [messageApi]);

    const resetDocEditState = useCallback(() => {
        pendingDocSwitchRef.current = null;
        setDocEditState(createDefaultMarkdownQuickEditState());
    }, []);

    const switchMarkdownSelection = useCallback((kind: 'doc' | 'template', item: any) => {
        markdownPromptCacheRef.current = null;
        if (kind === 'doc') {
            setSidebarTab('document');
            setSelectedDoc(item);
            return;
        }
        setSidebarTab('assets');
        setResourceSection('templates');
        setSelectedTemplate(item);
    }, [setResourceSection, setSelectedDoc, setSelectedTemplate, setSidebarTab]);

    const handleSelectMarkdownResource = useCallback((kind: 'doc' | 'template', item: any) => {
        if (!docEditState.enabled || !currentMarkdownItem || currentMarkdownItem.name === item.name) {
            switchMarkdownSelection(kind, item);
            return;
        }

        const switchWithoutSave = () => {
            resetDocEditState();
            switchMarkdownSelection(kind, item);
        };

        if (!docEditState.dirty) {
            postToPreview({ type: 'SPEC_EDIT_EXIT' });
            switchWithoutSave();
            return;
        }

        void (async () => {
            const confirmed = await appDialog.confirm({
                title: `切换${kind === 'template' ? '模板' : '文档'}`,
                description: `当前${currentMarkdownLabel}有未保存更改，是否先保存再切换？`,
                confirmText: '保存并切换',
                cancelText: '不保存切换',
                tone: 'brand',
                dismissible: false,
            });
            if (confirmed) {
                pendingDocSwitchRef.current = { item, kind };
                if (postToPreview({ type: 'SPEC_EDIT_SAVE', exitAfterSave: true })) {
                    setDocEditState((previous) => ({ ...previous, saving: true }));
                } else {
                    pendingDocSwitchRef.current = null;
                }
                return;
            }
            postToPreview({ type: 'SPEC_EDIT_EXIT', discardChanges: true });
            switchWithoutSave();
        })();
    }, [
        appDialog,
        currentMarkdownItem,
        currentMarkdownLabel,
        docEditState.dirty,
        docEditState.enabled,
        postToPreview,
        resetDocEditState,
        switchMarkdownSelection,
    ]);

    const handleSelectDoc = useCallback((item: any) => {
        handleSelectMarkdownResource('doc', item);
    }, [handleSelectMarkdownResource]);

    const handleSelectTemplate = useCallback((item: any) => {
        handleSelectMarkdownResource('template', item);
    }, [handleSelectMarkdownResource]);

    const requestMarkdownEditPrompt = useCallback((options?: { saveBeforePrompt?: boolean }) => {
        return new Promise<any>((resolve, reject) => {
            const promptResource = activePromptResource;
            if (!promptResource) {
                reject(new Error(
                    sidebarTab === 'assets' && resourceSection === 'templates'
                        ? '请先选择一个模板'
                        : sidebarTab === 'document'
                            ? '请先选择一个文档'
                            : '请先选择一个文档或模板',
                ));
                return;
            }

            if (!docEditState.enabled) {
                reject(new Error(`请先开启${promptResource.label}编辑`));
                return;
            }

            if (docEditState.quickEditMode !== 'comment') {
                reject(new Error('请先切换到批注模式'));
                return;
            }

            const cacheKey = promptResource.cacheKey;
            const cache = markdownPromptCacheRef.current;
            if (!docEditState.dirty && cache && cache.key === cacheKey) {
                resolve(cache.result);
                return;
            }

            const requestId = `markdown-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            let removePromptResponseListener: (() => void) | null = null;
            const timeoutId = window.setTimeout(() => {
                removePromptResponseListener?.();
                reject(new Error('生成 Prompt 超时，请重试'));
            }, 10000);

            const posted = postToPreview({
                type: 'SPEC_EDIT_PROMPT_REQUEST',
                requestId,
                saveBeforePrompt: Boolean(options?.saveBeforePrompt),
            });

            if (!posted) {
                window.clearTimeout(timeoutId);
                reject(new Error('未找到可操作的预览窗口'));
                return;
            }

            const handlePromptResponse = (event: MessageEvent) => {
                if (event.data?.type !== 'SPEC_EDIT_PROMPT_RESPONSE') return;
                if (event.data.requestId !== requestId) return;
                window.clearTimeout(timeoutId);
                removePromptResponseListener?.();
                if (event.data.success) {
                    const result = {
                        prompt: event.data.prompt,
                        targetPath: event.data.targetPath,
                        context: event.data.context,
                    };
                    markdownPromptCacheRef.current = { key: cacheKey, result };
                    resolve(result);
                    return;
                }
                reject(new Error(event.data.error || '生成 Prompt 失败'));
            };
            removePromptResponseListener = () => {
                window.removeEventListener('message', handlePromptResponse);
                removePromptResponseListener = null;
            };
            window.addEventListener('message', handlePromptResponse);
        });
    }, [
        activePromptResource,
        docEditState.dirty,
        docEditState.enabled,
        docEditState.quickEditMode,
        postToPreview,
        resourceSection,
        sidebarTab,
    ]);

    const requestAxureJson = useCallback((options: any) => {
        return new Promise<any>((resolve, reject) => {
            const targetIframe = getPreviewIframe();
            if (!targetIframe || !targetIframe.contentWindow) {
                reject(new Error('未找到可导出的预览窗口'));
                return;
            }
            if (!currentRuntimeExportResource) {
                reject(new Error('请先选择一个条目'));
                return;
            }
            const requestId = createRuntimeExportRequestId('axure-json');
            const targetOrigin = getIframeOrigin(targetIframe);
            const timeout = window.setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('导出超时，请重试'));
            }, 15000);
            const handleMessage = (event: MessageEvent) => {
                if (event.source !== targetIframe.contentWindow) return;
                if (event.origin !== targetOrigin) return;
                if (!event.data || event.data.type !== 'axhub.quickEdit.export.axureJsonResult') return;
                if (event.data.requestId !== requestId) return;
                window.removeEventListener('message', handleMessage);
                window.clearTimeout(timeout);
                if (event.data.success) {
                    resolve(event.data.payload ?? event.data.json ?? event.data.data);
                    return;
                }
                reject(new Error(event.data.error || '导出失败'));
            };
            window.addEventListener('message', handleMessage);
            targetIframe.contentWindow.postMessage(createRuntimeExportMessage({
                type: 'axhub.quickEdit.export.axureJson',
                selectedItem: currentRuntimeExportResource,
                resourceType: currentRuntimeExportResourceType,
                requestId,
                payload: {
                    rootName: currentRuntimeExportResource.displayName || currentRuntimeExportResource.name,
                    preserveHierarchy: options.preserveHierarchy,
                    preserveSvgIcons: options.preserveSvgIcons,
                },
            }), targetOrigin);
        });
    }, [
        currentRuntimeExportResource,
        currentRuntimeExportResourceType,
        getIframeOrigin,
        getPreviewIframe,
    ]);

    const requestCopyToFigma = useCallback(() => {
        return new Promise<{ payloadSizeKb?: number; payloadText: string }>((resolve, reject) => {
            const targetIframe = getPreviewIframe();
            if (!targetIframe || !targetIframe.contentWindow) {
                reject(new Error('未找到可导出的预览窗口'));
                return;
            }
            if (!currentRuntimeExportResource) {
                reject(new Error('请先选择一个条目'));
                return;
            }
            const requestId = createRuntimeExportRequestId('copy-figma');
            const targetOrigin = getIframeOrigin(targetIframe);
            const timeout = window.setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                reject(new Error('复制到 Figma 超时，请重试'));
            }, 15000);
            const handleMessage = (event: MessageEvent) => {
                if (event.source !== targetIframe.contentWindow) return;
                if (event.origin !== targetOrigin) return;
                if (!event.data || event.data.type !== 'axhub.quickEdit.export.copyToFigmaResult') return;
                if (event.data.requestId !== requestId) return;
                window.removeEventListener('message', handleMessage);
                window.clearTimeout(timeout);
                if (event.data.success) {
                    const payloadText = typeof event.data.payloadText === 'string' ? event.data.payloadText : '';
                    if (!payloadText) {
                        reject(new Error('Figma 剪贴板 payload 为空，请刷新预览后重试'));
                        return;
                    }
                    resolve({
                        payloadSizeKb: typeof event.data.payloadSizeKb === 'number' ? event.data.payloadSizeKb : undefined,
                        payloadText,
                    });
                    return;
                }
                reject(new Error(event.data.error || '复制到 Figma 失败'));
            };
            window.addEventListener('message', handleMessage);
            targetIframe.contentWindow.postMessage(createRuntimeExportMessage({
                type: 'axhub.quickEdit.export.copyToFigma',
                selectedItem: currentRuntimeExportResource,
                resourceType: currentRuntimeExportResourceType,
                requestId,
                clipboardWriteTarget: 'host',
            }), targetOrigin);
        });
    }, [
        currentRuntimeExportResource,
        currentRuntimeExportResourceType,
        getIframeOrigin,
        getPreviewIframe,
    ]);

    const requestCurrentScreenshot = useCallback((scope: 'viewport' | 'full-page' = 'full-page') => {
        return new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
            const targetIframe = getPrimaryPreviewIframe();
            if (!targetIframe || !targetIframe.contentWindow) {
                reject(new Error('未找到可截图的主预览窗口'));
                return;
            }
            if (!currentRuntimeExportResource) {
                reject(new Error('请先选择一个可导出资源'));
                return;
            }
            if (exportAvailability.axureRuntimeDisabledReason) {
                reject(new Error(exportAvailability.axureRuntimeDisabledReason));
                return;
            }
            const requestId = createRuntimeExportRequestId('copy-screenshot');
            pendingClipboardScreenshotRequestIdsRef.current.add(requestId);
            const targetOrigin = getIframeOrigin(targetIframe);
            const timeout = window.setTimeout(() => {
                pendingClipboardScreenshotRequestIdsRef.current.delete(requestId);
                window.removeEventListener('message', handleMessage);
                reject(new Error('截图生成超时，请重试'));
            }, 15000);
            const handleMessage = (event: MessageEvent) => {
                if (event.source !== targetIframe.contentWindow) return;
                if (event.origin !== targetOrigin) return;
                if (!event.data || event.data.type !== 'axhub.quickEdit.export.captureScreenshotResult') return;
                if (event.data.requestId !== requestId) return;
                pendingClipboardScreenshotRequestIdsRef.current.delete(requestId);
                window.removeEventListener('message', handleMessage);
                window.clearTimeout(timeout);
                if (event.data.success) {
                    const dataUrl = typeof event.data.dataUrl === 'string' ? event.data.dataUrl : '';
                    if (!dataUrl) {
                        reject(new Error('截图数据为空，请刷新预览后重试'));
                        return;
                    }
                    resolve({
                        dataUrl,
                        width: typeof event.data.width === 'number' ? event.data.width : 0,
                        height: typeof event.data.height === 'number' ? event.data.height : 0,
                    });
                    return;
                }
                reject(new Error(event.data.error || '截图生成失败'));
            };
            window.addEventListener('message', handleMessage);
            const screenshotSize = resolveCurrentPreviewScreenshotSize(previewConfig, screenshotDefaultSize);
            targetIframe.contentWindow.postMessage(createRuntimeExportMessage({
                type: 'axhub.quickEdit.export.captureScreenshot',
                selectedItem: currentRuntimeExportResource,
                resourceType: currentRuntimeExportResourceType,
                requestId,
                payload: {
                    scope,
                    targetWidth: screenshotSize.width,
                    targetHeight: screenshotSize.height,
                },
            }), targetOrigin);
        });
    }, [
        currentRuntimeExportResource,
        currentRuntimeExportResourceType,
        exportAvailability.axureRuntimeDisabledReason,
        getIframeOrigin,
        getPrimaryPreviewIframe,
        previewConfig,
        screenshotDefaultSize,
    ]);

    const checkAxureAvailable = useCallback(async (): Promise<boolean> => {
        let response: Response;
        try {
            response = await fetch(`${AXURE_BRIDGE_API_BASE_URL}/available`, {
                method: 'GET',
                cache: 'no-store',
            });
        } catch (error: any) {
            throw new Error(`无法连接到 Axure Bridge（localhost:32767）：${formatThrownError(error)}`);
        }
        const { body, text } = await readJsonOrTextResponse(response);
        if (!response.ok) {
            throw new Error(buildAxureBridgeMessage(`Axure Bridge 不可用（HTTP ${response.status}）`, body, text));
        }
        if (typeof body === 'boolean') return body;
        if (body && typeof body === 'object') {
            if (body.available === false || body.running === false || body.success === false) {
                throw new Error(buildAxureBridgeMessage('Axure Bridge 报告当前不可用', body, text));
            }
            if (typeof body.available === 'boolean') return body.available;
            if (typeof body.running === 'boolean') return body.running;
            if (typeof body.success === 'boolean') return body.success;
        }
        return true;
    }, []);

    const postCopyAxvg = useCallback(async (payload: any) => {
        let response: Response;
        try {
            response = await fetch(`${AXURE_BRIDGE_API_BASE_URL}/copyaxvg`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error: any) {
            throw new Error(`请求 Axure Bridge 失败：${formatThrownError(error)}`);
        }
        const { body, text } = await readJsonOrTextResponse(response);
        if (!response.ok) {
            throw new Error(`复制到 Axure 失败：${buildAxureBridgeMessage(
                response.statusText || `HTTP ${response.status}`,
                body,
                text,
            )}`);
        }
        if (body && typeof body === 'object' && (body.success === false || body.available === false)) {
            throw new Error(`复制到 Axure 失败：${buildAxureBridgeMessage('服务返回失败', body, text)}`);
        }
    }, []);

    const handleRequestScreenshot = useCallback((width?: number, height?: number) => {
        if (exportAvailability.axureRuntimeDisabledReason) {
            notifyPreviewMessage('warning', exportAvailability.axureRuntimeDisabledReason);
            return;
        }
        if (!selectedItem) {
            return;
        }
        const payload: any = {};
        const screenshotViewport = resolveExportScreenshotViewportSize({
            currentPreviewSize: currentPreviewScreenshotSize,
            configuredSize: { width: imageConfig.width, height: imageConfig.height },
            userSetDimensions: userSetDimensionsRef.current,
            explicitWidth: width,
            explicitHeight: height,
        });
        if (screenshotViewport.shouldSyncConfig) {
            setImageConfig((previous) => previous.width === screenshotViewport.width
                && previous.height === screenshotViewport.height
                ? previous
                : {
                    ...previous,
                    width: screenshotViewport.width,
                    height: screenshotViewport.height,
                });
        }
        payload.targetWidth = screenshotViewport.width;
        payload.targetHeight = screenshotViewport.height;
        payload.format = 'jpeg';
        payload.quality = 0.92;
        payload.maxBytes = 8 * 1024 * 1024;
        const targetIframe = getPreviewIframe();
        if (targetIframe && targetIframe.contentWindow) {
            const requestId = createRuntimeExportRequestId('capture-screenshot');
            targetIframe.contentWindow.postMessage(createRuntimeExportMessage({
                type: 'axhub.quickEdit.export.captureScreenshot',
                selectedItem,
                requestId,
                payload,
            }), getIframeOrigin(targetIframe));
        }
    }, [
        currentPreviewScreenshotSize.height,
        currentPreviewScreenshotSize.width,
        exportAvailability.axureRuntimeDisabledReason,
        getIframeOrigin,
        getPreviewIframe,
        imageConfig.height,
        imageConfig.width,
        notifyPreviewMessage,
        selectedItem,
    ]);

    const handleDimensionChange = useCallback((field: 'width' | 'height', value: number | null) => {
        userSetDimensionsRef.current = true;
        setImageConfig((previous) => ({ ...previous, [field]: value || 0 }));
    }, []);

    const handleDimensionBlur = useCallback(() => {
        if (imageConfig.contentType === 'screenshot' && isExportModalOpen) {
            handleRequestScreenshot();
        }
    }, [handleRequestScreenshot, imageConfig.contentType, isExportModalOpen]);

    const handleSwapDimensions = useCallback(() => {
        userSetDimensionsRef.current = true;
        setImageConfig((previous) => ({
            ...previous,
            width: previous.height,
            height: previous.width,
        }));
        setTimeout(() => {
            if (imageConfig.contentType === 'screenshot' && isExportModalOpen) {
                handleRequestScreenshot(imageConfig.height, imageConfig.width);
            }
        }, 0);
    }, [handleRequestScreenshot, imageConfig.contentType, imageConfig.height, imageConfig.width, isExportModalOpen]);

    const enterDocumentEditor = useCallback(async (mode: SpecQuickEditMode = 'comment', options?: { preserveSidebar?: boolean }) => {
        const editorApi = getDocumentEditorApi();
        if (!editorApi?.enableDocumentEditor) {
            messageApi.warning('当前文档预览尚未就绪，请稍后再试');
            return;
        }
        try {
            setDocumentEditorContext(editorApi);
            await Promise.resolve(editorApi.enableDocumentEditor({
                toolbarMode: 'host',
                quickEditMode: mode,
                initialDarkMode: isDarkMode,
                assistantPanelOpen: assistantContextAppendAvailable,
            }));
            documentEditorActiveRef.current = true;
            quickEditRuntimeActiveRef.current = false;
            documentHostToolbarUnsubscribeRef.current?.();
            documentHostToolbarUnsubscribeRef.current = editorApi.subscribeHostToolbarState?.((nextState) => {
                setResolvedHostToolbarState(resolveHostToolbarStateForDisplay(
                    hostToolbarStateRef.current,
                    nextState,
                    isDarkModeRef.current,
                ));
            }) ?? null;
            setResolvedHostToolbarState(resolveHostToolbarStateForDisplay(null, editorApi.getHostToolbarState?.() ?? createDefaultHostToolbarState(), isDarkMode));
            setEditorStatus({ mode: 'quickEdit' });
            refreshEditorStatus();
            if (!options?.preserveSidebar) {
                setSystemCollapsed(true);
            }
        } catch (error) {
            console.error('[Axhub] 启动文档编辑器失败:', error);
            messageApi.error('启动文档编辑器失败');
        }
    }, [
        assistantContextAppendAvailable,
        collapsed,
        getDocumentEditorApi,
        isDarkMode,
        messageApi,
        refreshEditorStatus,
        setDocumentEditorContext,
        setSystemCollapsed,
        setResolvedHostToolbarState,
    ]);

    const enterHtmlDocumentEditor = useCallback(async (options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean }) => {
        const primaryIframe = getPrimaryPreviewIframe();
        if (!primaryIframe?.contentWindow) {
            messageApi.warning('未找到可操作的预览窗口');
            return false;
        }
        try {
            activePrototypeEditorLaunchOptionsRef.current = prototypeEditorLaunchOptions;
            if (!await enterPrototypeEditor(primaryIframe)) {
                activePrototypeEditorLaunchOptionsRef.current = null;
                return false;
            }
            if (options?.disableSelectionMode) {
                const selectionModeResult = await postPrototypeEditorHostToolbarAction(primaryIframe, {
                    type: 'toggle-selection-mode',
                    active: false,
                });
                const explicitSelectionState = {
                    ...(selectionModeResult?.hostToolbarState ?? hostToolbarStateRef.current ?? createDefaultHostToolbarState()),
                    selectionModeActive: false,
                };
                setResolvedHostToolbarState(resolveHostToolbarStateForDisplay(
                    hostToolbarStateRef.current,
                    explicitSelectionState,
                    isDarkMode,
                ));
            }
            documentEditorActiveRef.current = false;
            quickEditRuntimeActiveRef.current = true;
            setStandalonePanelOpen(false);
            setEditorStatus({ mode: 'quickEdit' });
            refreshEditorStatus();
            if (!options?.preserveSidebar) {
                if (!collapsed) {
                    startPreviewLayoutStabilization('annotation-sidebar');
                }
                setSystemCollapsed(true);
            }
            return true;
        } catch (error) {
            activePrototypeEditorLaunchOptionsRef.current = null;
            console.error('[Axhub] 启动 HTML 批注编辑器失败:', error);
            messageApi.error('启动 HTML 批注失败');
            return false;
        }
    }, [
        collapsed,
        enterPrototypeEditor,
        getPrimaryPreviewIframe,
        isDarkMode,
        messageApi,
        prototypeEditorLaunchOptions,
        postPrototypeEditorHostToolbarAction,
        refreshEditorStatus,
        setSystemCollapsed,
        setResolvedHostToolbarState,
        startPreviewLayoutStabilization,
    ]);

    const handleEnableDocEdit = useCallback(async (
        mode: SpecQuickEditMode = 'comment',
        options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean },
    ): Promise<boolean> => {
        if (!currentMarkdownItem) {
            messageApi.warning(`请先选择${currentMarkdownLabel}`);
            return false;
        }
        if (!isDocumentCommentableResource(currentMarkdownItem)) {
            messageApi.warning(`仅支持 Markdown 或 HTML ${currentMarkdownLabel}批注`);
            return false;
        }
        if (isHtmlCommentableResource(currentMarkdownItem)) {
            return enterHtmlDocumentEditor(options);
        }
        if (!postToPreview({ type: 'SPEC_EDIT_ENABLE', mode })) {
            return false;
        }
        markdownPromptCacheRef.current = null;
        setDocEditState((previous) => ({ ...previous, enabled: true, quickEditMode: mode }));
        void enterDocumentEditor(mode, options);
        return true;
    }, [
        currentMarkdownItem,
        currentMarkdownLabel,
        enterDocumentEditor,
        enterHtmlDocumentEditor,
        messageApi,
        postToPreview,
    ]);

    const handleSaveDocEdit = useCallback(() => {
        if (!currentMarkdownItem) {
            messageApi.warning(`请先选择${currentMarkdownLabel}`);
            return;
        }
        if (!docEditState.enabled) {
            messageApi.warning(`请先开启${currentMarkdownLabel}编辑`);
            return;
        }
        if (!docEditState.dirty) {
            messageApi.info(`当前${currentMarkdownLabel}没有需要保存的更改`);
            return;
        }
        if (docEditState.saving) {
            return;
        }
        if (postToPreview({ type: 'SPEC_EDIT_SAVE' })) {
            setDocEditState((previous) => ({ ...previous, saving: true }));
        }
    }, [
        currentMarkdownItem,
        currentMarkdownLabel,
        docEditState.dirty,
        docEditState.enabled,
        docEditState.saving,
        messageApi,
        postToPreview,
    ]);

    const handleSwitchDocQuickEditMode = useCallback((mode: SpecQuickEditMode) => {
        const decision = resolveSpecQuickEditSwitchDecision({
            enabled: docEditState.enabled,
            currentMode: docEditState.quickEditMode,
            nextMode: mode,
            dirty: docEditState.dirty,
        });
        if (decision.type === 'noop') return;
        markdownPromptCacheRef.current = null;
        if (decision.type === 'switch') {
            postToPreview({ type: 'SPEC_EDIT_SET_MODE', mode: decision.mode });
            setDocEditState((previous) => ({ ...previous, quickEditMode: decision.mode }));
            return;
        }
        void (async () => {
            const confirmed = await appDialog.confirm({
                title: '切换到批注模式',
                description: `检测到未保存的${currentMarkdownLabel}更改，是否先保存后再切换到批注模式？`,
                confirmText: '保存并切换',
                cancelText: '不保存切换',
                tone: 'brand',
                dismissible: false,
            });
            if (confirmed) {
                postToPreview({ type: 'SPEC_EDIT_SET_MODE', mode: 'comment', saveBehavior: 'save' });
                setDocEditState((previous) => ({ ...previous, saving: true }));
                return;
            }
            postToPreview({ type: 'SPEC_EDIT_SET_MODE', mode: 'comment', saveBehavior: 'discard' });
            setDocEditState((previous) => ({ ...previous, quickEditMode: 'comment' }));
        })();
    }, [
        appDialog,
        currentMarkdownLabel,
        docEditState.dirty,
        docEditState.enabled,
        docEditState.quickEditMode,
        postToPreview,
    ]);

    const handleExitDocEdit = useCallback(() => {
        if (!docEditState.enabled || docEditState.saving) {
            return;
        }
        if (docEditState.dirty) {
            void (async () => {
                const confirmed = await appDialog.confirm({
                    title: `退出${currentMarkdownLabel}编辑`,
                    description: `检测到未保存的${currentMarkdownLabel}更改，是否先保存后退出？`,
                    confirmText: '保存并退出',
                    cancelText: '不保存退出',
                    tone: 'brand',
                    dismissible: false,
                });
                if (confirmed) {
                    if (postToPreview({ type: 'SPEC_EDIT_SAVE', exitAfterSave: true })) {
                        setDocEditState((previous) => ({ ...previous, saving: true }));
                    }
                    return;
                }
                postToPreview({ type: 'SPEC_EDIT_EXIT', discardChanges: true });
                resetDocEditState();
                setEditorStatus({ mode: quickEditRuntimeActiveRef.current ? 'quickEdit' : 'none' });
            })();
            return;
        }
        postToPreview({ type: 'SPEC_EDIT_EXIT' });
        resetDocEditState();
        setEditorStatus({ mode: quickEditRuntimeActiveRef.current ? 'quickEdit' : 'none' });
    }, [
        appDialog,
        currentMarkdownLabel,
        docEditState.dirty,
        docEditState.enabled,
        docEditState.saving,
        postToPreview,
        resetDocEditState,
    ]);

    const handleCopyMarkdownPrompt = useCallback(async () => {
        if (markdownPromptCopying) return;
        if (docEditState.quickEditMode !== 'comment') {
            messageApi.warning('请先切换到批注模式');
            return;
        }
        setMarkdownPromptCopying(true);
        try {
            const result = await requestMarkdownEditPrompt({ saveBeforePrompt: true });
            await navigator.clipboard.writeText(result.prompt);
            messageApi.success('Prompt 已复制到剪贴板');
        } catch (error: any) {
            messageApi.error(error?.message || '复制 Prompt 失败');
        } finally {
            setMarkdownPromptCopying(false);
        }
    }, [
        docEditState.quickEditMode,
        messageApi,
        requestMarkdownEditPrompt,
        markdownPromptCopying,
    ]);

    const loadReviewReports = useCallback(async (): Promise<ReviewReportSummary[]> => {
        if (!selectedPrototypeIdentity) {
            setReviewReports([]);
            setSelectedReviewReport(null);
            setActiveReviewReportId(null);
            setReviewError('');
            return [];
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        setReviewLoading(true);
        setReviewError('');
        try {
            const result = await apiService.listReviewReports({
                projectId,
                prototypeId: selectedPrototypeIdentity,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return [];
            setReviewReports(result.reports);
            setSelectedReviewReport((current) => {
                if (!current) return current;
                const exists = result.reports.some((report) => report.id === current.id);
                if (!exists) {
                    setActiveReviewReportId(null);
                    return null;
                }
                return current;
            });
            return result.reports;
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return [];
            setReviewReports([]);
            setReviewError(error?.message || '加载评审报告失败');
            return [];
        } finally {
            if (activeReviewScopeKeyRef.current === requestScopeKey) {
                setReviewLoading(false);
            }
        }
    }, [projectId, selectedPrototypeIdentity]);

    const refreshReviewReportsAfterDirectRun = useCallback(async (): Promise<ReviewReportSummary[]> => {
        if (!selectedPrototypeIdentity) {
            setReviewReports([]);
            setSelectedReviewReport(null);
            setActiveReviewReportId(null);
            setReviewError('');
            return [];
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        setReviewLoading(true);
        setReviewError('');
        try {
            const result = await apiService.listReviewReports({
                projectId,
                prototypeId: selectedPrototypeIdentity,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return [];
            setReviewReports(result.reports);
            setSelectedReviewReport((current) => {
                if (!current) return current;
                const exists = result.reports.some((report) => report.id === current.id);
                if (!exists) {
                    setActiveReviewReportId(null);
                    return null;
                }
                return current;
            });
            return result.reports;
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return [];
            setReviewReports([]);
            setReviewError(error?.message || '加载评审报告失败');
            return [];
        } finally {
            if (activeReviewScopeKeyRef.current === requestScopeKey) {
                setReviewLoading(false);
            }
        }
    }, [projectId, selectedPrototypeIdentity]);

    const loadReviewLanSubmitConfig = useCallback(async () => {
        if (!selectedPrototypeIdentity) {
            setReviewLanSubmitConfig(null);
            return;
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        try {
            const config = await apiService.getReviewLanSubmitConfig(projectId, selectedPrototypeIdentity);
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setReviewLanSubmitConfig(config);
        } catch {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setReviewLanSubmitConfig(null);
        }
    }, [projectId, selectedPrototypeIdentity]);

    const syncReviewAxhubReports = useCallback(async (knownConfig?: ReviewAxhubConfig): Promise<void> => {
        if (!selectedPrototypeIdentity) {
            setReviewAxhubSubmitConfig(null);
            return;
        }
        if (
            latestCloudPublishResourcePath !== currentPublishResourcePath
            || !latestCloudPublishItems.axhub?.axhubProjectId
        ) {
            setReviewAxhubSubmitConfig({
                projectId: String(projectId || ''),
                prototypeId: selectedPrototypeIdentity,
                bound: false,
                submitEnabled: false,
                reviewReportCount: 0,
            });
            return;
        }
        const syncKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        const isCurrentReviewScope = () => activeReviewScopeKeyRef.current === syncKey;
        const existing = reviewAxhubSyncInFlightRef.current.get(syncKey);
        if (existing) {
            await existing;
            return;
        }

        const syncPromise = (async () => {
            try {
                const config = knownConfig || await apiService.getReviewAxhubConfig(projectId, selectedPrototypeIdentity);
                if (!isCurrentReviewScope()) return;
                setReviewAxhubSubmitConfig(config);
                if (config.submitEnabled !== true) return;
                const result = await apiService.syncReviewAxhubReports({
                    projectId,
                    prototypeId: selectedPrototypeIdentity,
                });
                if (!isCurrentReviewScope()) return;
                if (result.created + result.updated > 0) {
                    await loadReviewReports();
                    if (!isCurrentReviewScope()) return;
                    messageApi.success(`已同步 Axhub 评审报告：新增 ${result.created}，更新 ${result.updated}`);
                }
            } catch (error: any) {
                if (!isCurrentReviewScope()) return;
                if (error?.code === 'AXHUB_AUTH_REQUIRED' || error?.code === 'AXHUB_AUTH_EXPIRED') {
                    messageApi.error('Axhub 账号已失效，请重新连接');
                    return;
                }
                if (error?.code === 'AXHUB_REVIEW_SERVICE_UNAVAILABLE') {
                    messageApi.error('Axhub 在线评审服务暂不可用');
                    return;
                }
                if (error?.code === 'AXHUB_REVIEW_BINDING_INVALID') {
                    setReviewAxhubSubmitConfig(null);
                    messageApi.error('Axhub 发布绑定已失效，请重新发布');
                    return;
                }
                messageApi.error(error?.message || '同步 Axhub 评审报告失败');
            }
        })();
        reviewAxhubSyncInFlightRef.current.set(syncKey, syncPromise);
        try {
            await syncPromise;
        } finally {
            if (reviewAxhubSyncInFlightRef.current.get(syncKey) === syncPromise) {
                reviewAxhubSyncInFlightRef.current.delete(syncKey);
            }
        }
    }, [
        currentPublishResourcePath,
        latestCloudPublishItems.axhub?.axhubProjectId,
        latestCloudPublishResourcePath,
        loadReviewReports,
        messageApi,
        projectId,
        selectedPrototypeIdentity,
    ]);

    const reviewPanelStabilizationActive = reviewPanelOpen && reviewPanelVisible;

    useLayoutEffect(() => {
        if (!reviewPanelStabilizationActive) {
            return;
        }
        startPreviewLayoutStabilization('review-panel');
        return () => {
            endPreviewLayoutStabilization('review-panel');
        };
    }, [endPreviewLayoutStabilization, reviewPanelStabilizationActive, startPreviewLayoutStabilization]);

    const handleReviewPanelToggle = useCallback(() => {
        setReviewPanelOpen((previous) => !previous);
    }, []);

    const openReviewReportDetail = useCallback(async (report: ReviewReportSummary | null) => {
        if (!report) return;
        if (!selectedPrototypeIdentity) return;
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        setActiveReviewReportId(report.id);
        setReviewDetailLoading(true);
        setReviewError('');
        try {
            const result = await apiService.getReviewReport({
                projectId,
                prototypeId: selectedPrototypeIdentity,
                reportId: report.id,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setSelectedReviewReport(result.report);
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setSelectedReviewReport(null);
            setReviewError(error?.message || '读取评审报告失败');
        } finally {
            if (activeReviewScopeKeyRef.current === requestScopeKey) {
                setReviewDetailLoading(false);
            }
        }
    }, [projectId, selectedPrototypeIdentity]);

    const handleSelectReviewReport = useCallback(async (report: ReviewReportSummary) => {
        await openReviewReportDetail(report);
    }, [openReviewReportDetail]);

    const handleBackToReviewList = useCallback(() => {
        setSelectedReviewReport(null);
        setActiveReviewReportId(null);
    }, []);

    const handleCopyReviewReportPath = useCallback(async (report: ReviewReportDetail) => {
        if (!report.path) {
            messageApi.warning('当前评审报告未声明路径，无法复制路径');
            return;
        }
        const copyText = `[${report.title}](${report.path})`;
        try {
            await navigator.clipboard.writeText(copyText);
            messageApi.success('路径已复制');
        } catch {
            messageApi.error('复制路径失败');
        }
    }, [messageApi]);

    const handleDeleteReviewReport = useCallback(async (report: ReviewReportDetail) => {
        if (!selectedPrototypeIdentity) {
            messageApi.warning('请先选择一个原型');
            return;
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        setReviewError('');
        try {
            await apiService.deleteReviewReport({
                projectId,
                prototypeId: selectedPrototypeIdentity,
                reportId: report.id,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setSelectedReviewReport(null);
            setActiveReviewReportId(null);
            await loadReviewReports();
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            messageApi.success('评审报告已删除');
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setReviewError(error?.message || '删除评审报告失败');
            messageApi.error(error?.message || '删除评审报告失败');
        }
    }, [loadReviewReports, messageApi, projectId, selectedPrototypeIdentity]);

    const handleStartReview = useCallback((kind: ReviewKind) => {
        setPendingReviewKind(kind);
    }, []);

    const handleRunReviewDirect = useCallback(async (kind: ReviewKind) => {
        if (!selectedPrototypeIdentity) {
            messageApi.warning('请先选择一个原型');
            return false;
        }
        if (!onRunReviewAssistantPromptViaApi) {
            messageApi.warning('AI 助手入口未就绪');
            return false;
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        setPendingReviewKind(kind);
        const prompt = reviewPrompts[kind] || reviewPrompt;
        const targetPath = reviewDocumentPaths[kind] || reviewDocumentPath || null;
        if (!String(prompt || '').trim()) {
            messageApi.info('没有可发送的提示词内容');
            return false;
        }
        setReviewError('');
        try {
            const result = await onRunReviewAssistantPromptViaApi({
                context: buildReviewDirectRunAssistantContext(targetPath),
                prompt,
                targetPath,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return false;
            if (result === false) {
                return false;
            }
            const reports = await refreshReviewReportsAfterDirectRun();
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return false;
            const reportToOpen = findReviewReportForDirectRun(reports, targetPath) || reports[0] || null;
            await openReviewReportDetail(reportToOpen);
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return false;
            messageApi.success('AI 评审已完成');
            return true;
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return false;
            const message = error?.message || 'AI 评审执行失败';
            setReviewError(message);
            messageApi.error(message);
            return false;
        }
    }, [
        buildReviewDirectRunAssistantContext,
        messageApi,
        onRunReviewAssistantPromptViaApi,
        openReviewReportDetail,
        refreshReviewReportsAfterDirectRun,
        reviewDocumentPath,
        reviewDocumentPaths,
        reviewPrompt,
        reviewPrompts,
        selectedPrototypeIdentity,
    ]);

    const handleUploadReviewReport = useCallback(async (files: File[], meta: { title?: string; reviewer?: string }) => {
        if (!selectedPrototypeIdentity) {
            messageApi.warning('请先选择一个原型');
            return;
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        setReviewUploadLoading(true);
        setReviewError('');
        try {
            const result = await apiService.uploadReviewReport({
                projectId,
                prototypeId: selectedPrototypeIdentity,
                files,
                title: meta.title,
                reviewer: meta.reviewer,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setSelectedReviewReport(result.report);
            setActiveReviewReportId(result.report.id);
            await loadReviewReports();
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            messageApi.success('评审报告已上传');
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setReviewError(error?.message || '上传评审报告失败');
            messageApi.error(error?.message || '上传评审报告失败');
        } finally {
            if (activeReviewScopeKeyRef.current === requestScopeKey) {
                setReviewUploadLoading(false);
            }
        }
    }, [loadReviewReports, messageApi, projectId, selectedPrototypeIdentity]);

    const handleReviewLanSubmitEnabledChange = useCallback(async (enabled: boolean) => {
        if (!selectedPrototypeIdentity) {
            messageApi.warning('请先选择一个原型');
            return;
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        try {
            const config = await apiService.updateReviewLanSubmitConfig({
                projectId,
                prototypeId: selectedPrototypeIdentity,
                lanSubmitEnabled: enabled,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setReviewLanSubmitConfig(config);
            messageApi.success(enabled ? '已开启局域网提交' : '已关闭局域网提交');
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            messageApi.error(error?.message || '更新局域网提交配置失败');
            throw error;
        }
    }, [messageApi, projectId, selectedPrototypeIdentity]);

    const handleReviewAxhubSubmitEnabledChange = useCallback(async (enabled: boolean) => {
        if (!selectedPrototypeIdentity) {
            messageApi.warning('请先选择一个原型');
            return;
        }
        const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;
        try {
            const config = await apiService.updateReviewAxhubConfig({
                projectId,
                prototypeId: selectedPrototypeIdentity,
                submitEnabled: enabled,
            });
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            setReviewAxhubSubmitConfig(config);
            messageApi.success(enabled ? '已开启 Axhub 提交' : '已关闭 Axhub 提交');
            if (enabled) {
                await syncReviewAxhubReports(config);
            }
        } catch (error: any) {
            if (activeReviewScopeKeyRef.current !== requestScopeKey) return;
            if (error?.code === 'AXHUB_AUTH_REQUIRED' || error?.code === 'AXHUB_AUTH_EXPIRED') {
                messageApi.error('Axhub 账号已失效，请重新连接');
            } else if (error?.code === 'AXHUB_REVIEW_SERVICE_UNAVAILABLE') {
                messageApi.error('Axhub 在线评审服务暂不可用');
            } else if (error?.code === 'AXHUB_REVIEW_NOT_BOUND' || error?.code === 'AXHUB_REVIEW_BINDING_INVALID') {
                messageApi.error('Axhub 发布绑定已失效，请重新发布');
            } else {
                messageApi.error(error?.message || '更新 Axhub 提交配置失败');
            }
            throw error;
        }
    }, [messageApi, projectId, selectedPrototypeIdentity, syncReviewAxhubReports]);

    useEffect(() => {
        const previousPrototypeIdentity = previousReviewPrototypeIdentityRef.current;
        const prototypeChanged = previousPrototypeIdentity !== selectedPrototypeIdentity;
        previousReviewPrototypeIdentityRef.current = selectedPrototypeIdentity;
        setSelectedReviewReport(null);
        setActiveReviewReportId(null);
        if (prototypeChanged) {
            setReviewAxhubSubmitConfig(null);
            setReviewLanSubmitConfig(null);
            setReviewLoading(false);
            setReviewDetailLoading(false);
            setReviewUploadLoading(false);
        }
        if (reviewPanelOpen) {
            void loadReviewReports();
            void loadReviewLanSubmitConfig();
            void syncReviewAxhubReports();
        }
    }, [loadReviewLanSubmitConfig, loadReviewReports, reviewPanelOpen, selectedPrototypeIdentity, syncReviewAxhubReports]);

    const handleOpenWebEditor = useCallback(async () => {
        if (isDocumentEditingContent) {
            if (currentDocumentIsHtml) {
                await enterHtmlDocumentEditor();
            } else {
                await enterDocumentEditor();
            }
            return;
        }

        if (!selectedEditablePreviewResource) {
            messageApi.warning('请先选择一个条目');
            return;
        }
        const annotationSession = resourceType === 'prototype' && pendingPrototypeAnnotationSessionOpenRef.current;
        pendingPrototypeAnnotationSessionOpenRef.current = false;
        const launchOptions: PrototypeEditorLaunchOptions = annotationSession
            ? { ...prototypeEditorLaunchOptions, annotationSession: true }
            : prototypeEditorLaunchOptions;
        const primaryIframe = getPrimaryPreviewIframe();
        const runtimeReadyForPrimaryIframe = isQuickEditRuntimeReadyForIframe(
            quickEditRuntimeStatus,
            quickEditRuntimeReadyIframeRef.current,
            primaryIframe,
        );
        const canWaitForPrimaryIframe = Boolean(primaryIframe?.contentWindow)
            && (quickEditRuntimeStatus === 'pending'
                || (quickEditRuntimeStatus === 'ready' && !runtimeReadyForPrimaryIframe));
        if (resourceType === 'prototype' && !runtimeReadyForPrimaryIframe) {
            if (canWaitForPrimaryIframe) {
                standalonePanelBeforeQuickEditRef.current = standalonePanelOpen;
                if (annotationSession) {
                    activePrototypeEditorLaunchOptionsRef.current = launchOptions;
                    pendingPrototypeEditorRestoreRef.current = launchOptions;
                } else {
                    activePrototypeEditorLaunchOptionsRef.current = prototypeEditorLaunchOptions;
                    pendingPrototypeEditorRestoreRef.current = prototypeEditorLaunchOptions;
                }
                prototypeEditorRestoreSeqRef.current += 1;
                pendingPrototypeEditorOpenIntentRef.current = true;
                setQuickEditRuntimeStatus('pending');
                if (getPreviewIframeGeneration(primaryIframe) > 0) {
                    beginQuickEditRuntimeHandshake(primaryIframe);
                }
                return;
            }
            messageApi.warning('当前客户端页面尚未接入 /runtime/quick-edit.js，请通过 script、Vite 插件或 Webpack 插件加载后再使用快速编辑');
            return;
        }
        if (projectCapabilities?.quickEdit === false) {
            messageApi.warning('当前项目未启用 Quick Edit 能力');
            return;
        }
        try {
            standalonePanelBeforeQuickEditRef.current = standalonePanelOpen;
            activePrototypeEditorLaunchOptionsRef.current = annotationSession
                ? launchOptions
                : prototypeEditorLaunchOptions;
            if (!await enterPrototypeEditor(primaryIframe)) {
                activePrototypeEditorLaunchOptionsRef.current = null;
                return;
            }
            if (previewConfig.previewMode === 'split') {
                const secondaryIframe = getSecondaryPreviewIframe();
                if (secondaryIframe?.contentWindow) {
                    await enterPrototypeEditor(secondaryIframe, { showMissingWarning: false });
                }
            }
            quickEditRuntimeActiveRef.current = true;
            setPrototypeAnnotationSessionActive(annotationSession);
            setEditorStatus({ mode: 'quickEdit' });
            refreshEditorStatus();
            completePrototypeEditorOpen();
        } catch (error) {
            activePrototypeEditorLaunchOptionsRef.current = null;
            console.error('[Axhub] 启动编辑器失败:', error);
            messageApi.error('启动编辑器失败');
        }
    }, [
        collapsed,
        beginQuickEditRuntimeHandshake,
        completePrototypeEditorOpen,
        currentDocumentIsHtml,
        enterDocumentEditor,
        enterHtmlDocumentEditor,
        enterPrototypeEditor,
        getSecondaryPreviewIframe,
        getPrimaryPreviewIframe,
        getPreviewIframeGeneration,
        isDocumentEditingContent,
        messageApi,
        previewConfig,
        prototypeEditorLaunchOptions,
        projectCapabilities?.quickEdit,
        quickEditRuntimeStatus,
        refreshEditorStatus,
        resourceType,
        selectedEditablePreviewResource,
        selectedItem,
        standalonePanelOpen,
        viewMode,
    ]);

    const handleExitWebEditor = useCallback(async (options?: { restoreDevice?: boolean; restorePanelOnly?: boolean }) => {
        const isPrototypeAnnotationSession = activePrototypeEditorLaunchOptionsRef.current?.annotationSession === true;
        const shouldRestorePanelOnly = options?.restorePanelOnly === false || isPrototypeAnnotationSession
            ? false
            : standalonePanelBeforeQuickEditRef.current;
        quickEditRuntimeActiveRef.current = false;
        standalonePanelBeforeQuickEditRef.current = false;
        activePrototypeEditorLaunchOptionsRef.current = null;
        setPrototypeAnnotationSessionActive(false);
        prototypeEditorRestoreSeqRef.current += 1;
        pendingPrototypeEditorRestoreRef.current = null;
        pendingPrototypeEditorOpenIntentRef.current = false;
        pendingDocumentEditorRestoreModeRef.current = null;
        pendingStandalonePanelRestoreRef.current = false;
        try {
            getPreviewIframes().forEach((iframe) => {
                exitQuickEditRuntime(iframe);
            });
            documentHostToolbarUnsubscribeRef.current?.();
            documentHostToolbarUnsubscribeRef.current = null;
            prototypeHostToolbarUnsubscribeRef.current?.();
            prototypeHostToolbarUnsubscribeRef.current = null;
            const editorApi = getDocumentEditorApi();
            await Promise.resolve(editorApi?.disableDocumentEditor?.());
            await Promise.all(getPreviewIframes().map(async (iframe) => {
                await postPrototypeEditorDisable(iframe);
                const editors = getPrototypeEditorApi(iframe);
                if (editors?.disable) {
                    await Promise.resolve(editors.disable());
                }
            }));
            documentEditorActiveRef.current = false;
            clearAssistantSelectedElementsOnExit();
            setEditorStatus({ mode: 'none' });
            loadedPrototypeDecisionDataAvailableRef.current = false;
            setPrototypeDecisionDataAvailable(false);
            setHostToolbarState(null);
            refreshEditorStatus();
            // Restore standalone panel-only mode if it was active before quick edit.
            if (shouldRestorePanelOnly) {
                const primaryIframe = getPrimaryPreviewIframe();
                const restored = await enterPrototypeEditorPanelOnly(primaryIframe);
                setStandalonePanelOpen(restored);
            } else {
                setStandalonePanelOpen(false);
            }
            if (contentModeOverride === 'prototype-spec') {
                onPrototypeSpecExit?.();
            }
        } catch (error) {
            console.error('[Axhub] 退出编辑器失败:', error);
            messageApi.error('退出编辑器失败');
        } finally {
            setSystemCollapsed(null);
            endPreviewLayoutStabilization('annotation-sidebar');
        }
    }, [
        clearAssistantSelectedElementsOnExit,
        contentModeOverride,
        endPreviewLayoutStabilization,
        enterPrototypeEditorPanelOnly,
        exitQuickEditRuntime,
        getDocumentEditorApi,
        getPrimaryPreviewIframe,
        getPrototypeEditorApi,
        getPreviewIframes,
        messageApi,
        onPrototypeSpecExit,
        postPrototypeEditorDisable,
        refreshEditorStatus,
        setSystemCollapsed,
    ]);
    exitWebEditorRef.current = handleExitWebEditor;

    useEffect(() => {
        const previousPrototypeIdentity = selectedPrototypeIdentityRef.current;
        if (previousPrototypeIdentity === selectedPrototypeIdentity) {
            return;
        }
        selectedPrototypeIdentityRef.current = selectedPrototypeIdentity;
        if (!previousPrototypeIdentity || !quickEditRuntimeActiveRef.current) {
            return;
        }
        pendingPrototypeEditorRestoreRef.current = null;
        setReviewPanelOpen(false);
        void handleExitWebEditor({ restoreDevice: false, restorePanelOnly: false });
    }, [
        handleExitWebEditor,
        selectedPrototypeIdentity,
    ]);

    const handleCopyQuickEditPrompt = useCallback(async () => {
        if (quickEditPromptCopying) return;
        const currentFilePath = getAssistantContextCurrentFilePath(assistantContextV1);
        if (!currentFilePath) {
            messageApi.warning('当前文件路径为空，无法生成快速编辑 Prompt');
            return;
        }
        setQuickEditPromptCopying(true);
        try {
            const prompt = buildQuickEditAcpPrompt({
                currentFilePath,
                currentFileDisplayName: selectedItem?.displayName || '',
                projectPath: assistantProjectPath,
                selectedElements: assistantContextV1.selectedElements,
            });
            await navigator.clipboard.writeText(prompt);
            messageApi.success('Prompt 已复制到剪贴板');
        } catch (error: any) {
            messageApi.error(error?.message || '复制 Prompt 失败');
        } finally {
            setQuickEditPromptCopying(false);
        }
    }, [assistantContextV1, assistantProjectPath, messageApi, quickEditPromptCopying, selectedItem]);

    const handleCheckPrototypeAnnotationEnabled = useCallback(async (): Promise<boolean | null> => {
        const targetPath = resolvePrototypeAnnotationTargetPath(selectedItem);
        if (!targetPath) {
            messageApi.error('读取需求标注状态失败，请稍后重试');
            return null;
        }
        setPrototypeAnnotationStatusLoading(true);
        try {
            const projectScope = requireProjectScope(projectId);
            const status = await apiService.getPrototypeAnnotationStatus(targetPath, projectScope);
            return status.enabled === true;
        } catch (error) {
            console.error('[Axhub] 读取需求标注状态失败:', error);
            messageApi.error('读取需求标注状态失败，请稍后重试');
            return null;
        } finally {
            setPrototypeAnnotationStatusLoading(false);
        }
    }, [messageApi, projectId, selectedItem]);

    const handleEnablePrototypeAnnotation = useCallback(
        () => {
            skipPrototypeAnnotationEnableConfirmationRef.current = true;
            return enablePrototypeAnnotationFromHost();
        },
        [enablePrototypeAnnotationFromHost],
    );

    const handleOpenPrototypeAnnotationSession = useCallback(async () => {
        const wasQuickEditActive = quickEditRuntimeActiveRef.current;
        pendingPrototypeAnnotationSessionOpenRef.current = true;
        if (wasQuickEditActive) {
            await handleExitWebEditor({ restoreDevice: false, restorePanelOnly: false });
        }
        return handleOpenWebEditor();
    }, [handleExitWebEditor, handleOpenWebEditor]);

    const handleCopyPrototypeAnnotationPrompt = useCallback(async () => {
        if (prototypeAnnotationPromptCopying) return;
        const currentFilePath = getAssistantContextCurrentFilePath(assistantContextV1);
        if (!currentFilePath) {
            messageApi.warning('当前文件路径为空，无法生成需求标注 Prompt');
            return;
        }
        setPrototypeAnnotationPromptCopying(true);
        try {
            const prompt = buildPrototypeAnnotationAcpPrompt({
                currentFilePath,
                currentFileDisplayName: selectedItem?.displayName || '',
                projectPath: assistantProjectPath,
            });
            await navigator.clipboard.writeText(prompt);
            messageApi.success('需求标注 Prompt 已复制到剪贴板');
        } catch (error: any) {
            messageApi.error(error?.message || '复制需求标注 Prompt 失败');
        } finally {
            setPrototypeAnnotationPromptCopying(false);
        }
    }, [assistantContextV1, assistantProjectPath, messageApi, prototypeAnnotationPromptCopying, selectedItem]);

    const showCrossOriginPreviewActionHint = useCallback(() => {
        const targetIframe = getPreviewIframe();
        if (!targetIframe || getIframeOrigin(targetIframe) === window.location.origin) {
            return;
        }
        toast.info('当前预览与宿主页面跨源，此操作可能受内置浏览器限制；请改用 Chrome 浏览器重试', {
            id: 'axhub-preview-cross-origin-action',
        });
    }, [getIframeOrigin, getPreviewIframe]);

    const handleCopyToAxure = useCallback(async (options: any) => {
        if (!currentRuntimeExportResource) {
            messageApi.warning('请先选择一个条目');
            return;
        }
        if (exportAvailability.axureRuntimeDisabledReason) {
            messageApi.warning(exportAvailability.axureRuntimeDisabledReason);
            return;
        }
        const hide = messageApi.loading('正在复制到 Axure...', 0);
        try {
            const payload = await requestAxureJson(options);
            const available = await checkAxureAvailable();
            if (!available) {
                throw new Error(`Axure Bridge 可用性检查返回 false；${AXURE_UNAVAILABLE_HINT}`);
            }
            await postCopyAxvg(payload);
            void postProjectCommunicationRecord(currentRuntimeExportResource, 'exports', {
                operationType: 'axure.copy',
                status: 'success',
            }, currentRuntimeExportResourceType).catch(() => undefined);
            messageApi.success('已复制到 Axure');
        } catch (error: any) {
            console.error('复制到 Axure 失败:', error);
            void postProjectCommunicationRecord(currentRuntimeExportResource, 'exports', {
                operationType: 'axure.copy',
                status: 'failed',
                errorMessage: String(error?.message || '复制到 Axure 失败'),
            }, currentRuntimeExportResourceType).catch(() => undefined);
            showCrossOriginPreviewActionHint();
            messageApi.error(buildAxureBridgeUserMessage(String(error?.message || '')));
        } finally {
            hide();
        }
    }, [
        checkAxureAvailable,
        currentRuntimeExportResource,
        currentRuntimeExportResourceType,
        exportAvailability.axureRuntimeDisabledReason,
        messageApi,
        postCopyAxvg,
        requestAxureJson,
        showCrossOriginPreviewActionHint,
    ]);

    const handleCopyToFigma = useCallback(async () => {
        if (!currentRuntimeExportResource) {
            messageApi.warning('请先选择一个条目');
            return;
        }
        if (exportAvailability.figmaDomDisabledReason) {
            messageApi.warning(exportAvailability.figmaDomDisabledReason);
            return;
        }
        const hide = messageApi.loading('正在复制到 Figma...', 0);
        try {
            const result = await requestCopyToFigma();
            await writeFigmaOfficialClipboardPayload(result.payloadText);
            void postProjectCommunicationRecord(currentRuntimeExportResource, 'exports', {
                operationType: 'figma.copy',
                status: 'success',
                metadata: {
                    payloadSizeKb: result.payloadSizeKb,
                },
            }, currentRuntimeExportResourceType).catch(() => undefined);
            messageApi.success('复制成功');
        } catch (error: any) {
            void postProjectCommunicationRecord(currentRuntimeExportResource, 'exports', {
                operationType: 'figma.copy',
                status: 'failed',
                errorMessage: String(error?.message || '复制到 Figma 失败'),
            }, currentRuntimeExportResourceType).catch(() => undefined);
            showCrossOriginPreviewActionHint();
            messageApi.error(error?.message || '复制到 Figma 失败');
        } finally {
            hide();
        }
    }, [
        currentRuntimeExportResource,
        currentRuntimeExportResourceType,
        exportAvailability.figmaDomDisabledReason,
        messageApi,
        requestCopyToFigma,
        showCrossOriginPreviewActionHint,
    ]);

    const handleCopyCurrentScreenshot = useCallback(async () => {
        if (!currentRuntimeExportResource) {
            messageApi.warning('请先选择一个可导出资源');
            return;
        }
        const hide = messageApi.loading('正在复制截图...', 0);
        try {
            const result = await requestCurrentScreenshot();
            await copyImageDataUrlToClipboard(result.dataUrl);
            messageApi.success('截图已复制到剪贴板');
        } catch (error: any) {
            showCrossOriginPreviewActionHint();
            messageApi.error(error?.message || '复制截图失败');
        } finally {
            hide();
        }
    }, [currentRuntimeExportResource, messageApi, requestCurrentScreenshot, showCrossOriginPreviewActionHint]);

    const handleExportMake = useCallback(async () => {
        if (activeTab !== 'prototypes' || !selectedItem) {
            messageApi.warning('请先选择一个原型页面');
            return;
        }
        if (exportAvailability.makeExportDisabledReason) {
            messageApi.warning(exportAvailability.makeExportDisabledReason);
            return;
        }

        const targetPath = getSelectedResourceTargetPath(selectedItem);
        if (!targetPath) {
            messageApi.warning('当前资源未声明可导出资源上下文，无法导出 Figma Make');
            return;
        }
        setIsFigmaMakeExportDialogOpen(true);
    }, [
        activeTab,
        exportAvailability.makeExportDisabledReason,
        messageApi,
        selectedItem,
    ]);

    const handleExportHtml = useCallback(async (options: { includeSource?: boolean } = {}) => {
        if (activeTab !== 'prototypes' || !currentRuntimeExportResource) {
            messageApi.warning('请先选择一个可导出资源');
            return;
        }
        if (exportAvailability.htmlExportDisabledReason) {
            messageApi.warning(exportAvailability.htmlExportDisabledReason);
            return;
        }

        const targetPath = currentPublishResourcePath;
        if (!targetPath) {
            messageApi.warning('当前资源未声明本地文件路径，无法导出 HTML');
            return;
        }

        const itemLabel = currentRuntimeExportResource.displayName || currentRuntimeExportResource.name;
        const hide = messageApi.loading(`正在导出「${itemLabel}」HTML，时间较长时请耐心等待...`, 0);
        try {
            await downloadExportHtmlArchive(targetPath, requireProjectScope(projectId), { includeSource: options.includeSource === true });
            void postProjectCommunicationRecord(currentRuntimeExportResource, 'exports', {
                operationType: 'export-html',
                status: 'success',
                metadata: {
                    targetPath,
                    ...(options.includeSource === true ? { includeSource: true } : {}),
                },
            }, currentRuntimeExportResourceType).catch(() => undefined);
            messageApi.success(`「${itemLabel}」HTML 导出完成，已开始下载`);
        } catch (error: any) {
            void postProjectCommunicationRecord(currentRuntimeExportResource, 'exports', {
                operationType: 'export-html',
                status: 'failed',
                errorMessage: String(error?.message || 'HTML 导出失败'),
            }, currentRuntimeExportResourceType).catch(() => undefined);
            messageApi.error(error?.message || 'HTML 导出失败');
        } finally {
            hide();
        }
    }, [
        activeTab,
        currentPublishResourcePath,
        currentRuntimeExportResource,
        currentRuntimeExportResourceType,
        exportAvailability.htmlExportDisabledReason,
        messageApi,
        projectId,
    ]);

    const refreshCloudPublishingConfig = useCallback(async () => {
        try {
            const config = await apiService.getCloudPublishingConfig(requireProjectScope(projectId));
            setVisibleCloudPublishTargets(config.targets.publishSettings.visibleTargets || ['axhub']);
        } catch {
            setVisibleCloudPublishTargets(['axhub']);
        }
    }, [projectId]);

    useEffect(() => {
        void refreshCloudPublishingConfig();
    }, [refreshCloudPublishingConfig]);

    const handleCloudPublishSettingsSaved = useCallback((config: CloudPublishingConfigResponse) => {
        setVisibleCloudPublishTargets(config.targets.publishSettings.visibleTargets || ['axhub']);
        void refreshCloudPublishingConfig();
    }, [refreshCloudPublishingConfig]);

    const handleOpenCloudPublishSettings = useCallback((target: CloudPublishSettingsInitialTarget = 's3') => {
        setCloudPublishSettingsInitialTarget(target);
        setCloudPublishSettingsOpen(true);
    }, []);

    const refreshLatestCloudPublishUrls = useCallback(async () => {
        const requestId = ++latestCloudPublishRequestRef.current;
        if (!currentPublishResourcePath) {
            setLatestCloudPublishItems({});
            setLatestCloudPublishResourcePath('');
            return;
        }
        const requestedResourcePath = currentPublishResourcePath;
        setLatestCloudPublishItems({});
        setLatestCloudPublishResourcePath('');
        try {
            const latest = await apiService.getCloudPublishingLatest(requestedResourcePath, requireProjectScope(projectId));
            if (requestId !== latestCloudPublishRequestRef.current) return;
            setLatestCloudPublishItems({
                ...(latest.targets.vercel ? { vercel: latest.targets.vercel } : {}),
                ...(latest.targets.cloudflarePages ? { 'cloudflare-pages': latest.targets.cloudflarePages } : {}),
                ...(latest.targets.s3 ? { s3: latest.targets.s3 } : {}),
                ...(latest.targets.githubPages ? { 'github-pages': latest.targets.githubPages } : {}),
                ...(latest.targets.axhub ? { axhub: latest.targets.axhub } : {}),
            });
            setLatestCloudPublishResourcePath(requestedResourcePath);
        } catch {
            if (requestId !== latestCloudPublishRequestRef.current) return;
            setLatestCloudPublishItems({});
            setLatestCloudPublishResourcePath(requestedResourcePath);
        }
    }, [currentPublishResourcePath, projectId]);

    useEffect(() => {
        void refreshLatestCloudPublishUrls();
    }, [refreshLatestCloudPublishUrls]);

    const latestCloudPublishUrl = useMemo(() => {
        return Object.values(latestCloudPublishItems)
            .filter((item): item is CloudPublishLatestItem => Boolean(item?.url))
            .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0]?.url || '';
    }, [latestCloudPublishItems]);

    const handleCopyLatestCloudPublishUrl = useCallback(async () => {
        const latestUrl = latestCloudPublishUrl;
        if (!latestUrl) {
            messageApi.warning('暂无发布地址');
            return;
        }
        try {
            await copyToClipboard(latestUrl);
            toast.success('发布地址已复制');
        } catch (error: any) {
            messageApi.error(error?.message || '复制发布地址失败');
        }
    }, [latestCloudPublishUrl, messageApi]);

    const handleOpenAxhubPublishDialog = useCallback(() => {
        if (!currentPublishResourcePath) {
            messageApi.warning('请先选择一个可发布资源');
            return;
        }
        setAxhubPublishDialogOpen(true);
    }, [currentPublishResourcePath, messageApi]);

    const handleAxhubPublished = useCallback((result: AxhubPublishResponse) => {
        setLatestCloudPublishItems((current) => ({
            ...current,
            axhub: {
                url: result.url,
                target: 'axhub',
                deployedAt: result.project.generateTime || new Date().toISOString(),
                path: result.path,
                axhubProjectId: result.project.pid,
                axhubProjectPath: result.project.path,
            },
        }));
        setLatestCloudPublishResourcePath(currentPublishResourcePath);
    }, [currentPublishResourcePath]);

    const handlePublishCloudTarget = useCallback(async (target: CloudPublishTarget) => {
        if (target === 'axhub') {
            handleOpenAxhubPublishDialog();
            return;
        }

        if (!currentPublishResourcePath) {
            messageApi.warning('请先选择一个可发布资源');
            return;
        }

        const targetLabel = CLOUD_PUBLISH_TARGET_LABELS[target];
        try {
            const config = await apiService.getCloudPublishingConfig(requireProjectScope(projectId));
            const targetConfig = target === 'cloudflare-pages'
                ? config.targets.cloudflarePages
                : target === 'github-pages'
                    ? config.targets.githubPages
                : config.targets[target];
            if (!targetConfig?.configured) {
                setCloudPublishSettingsInitialTarget(target);
                setCloudPublishSettingsOpen(true);
                return;
            }
        } catch (error: any) {
            messageApi.error(error?.message || '加载云服务发布配置失败');
            return;
        }

        const hide = messageApi.loading(`正在发布到 ${targetLabel}...`, 0);
        try {
            const result = await apiService.publishCloudTarget({
                target,
                path: currentPublishResourcePath,
            }, requireProjectScope(projectId));
            setLatestCloudPublishItems((current) => ({
                ...current,
                [target]: {
                    ...result,
                },
            }));
            toast.success(`已发布到 ${targetLabel}`, {
                duration: Infinity,
                description: (
                    <a href={result.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        {result.url}
                    </a>
                ),
            });
        } catch (error: any) {
            if (error?.code === 'CONFIG_REQUIRED') {
                setCloudPublishSettingsInitialTarget(target);
                setCloudPublishSettingsOpen(true);
                return;
            }
            messageApi.error(error?.message || '云服务发布失败');
        } finally {
            hide();
        }
    }, [
        currentPublishResourcePath,
        handleOpenAxhubPublishDialog,
        messageApi,
        projectId,
    ]);

    const handleFigmaMakeExportDownloadSuccess = useCallback((fileName: string) => {
        void postProjectCommunicationRecord(selectedItem, 'exports', {
            operationType: 'make.export',
            status: 'success',
            metadata: {
                fileName,
            },
        }).catch(() => undefined);
    }, [selectedItem]);

    const handleFigmaMakeExportDownloadFailure = useCallback((error: any) => {
        void postProjectCommunicationRecord(selectedItem, 'exports', {
            operationType: 'make.export',
            status: 'failed',
            errorMessage: String(error?.message || '导出 Figma Make 失败'),
        }).catch(() => undefined);
    }, [selectedItem]);

    const ensureAxureExportReviewPassed = useCallback(async () => {
        if (!selectedItem) {
            messageApi.warning('请先选择一个条目');
            return false;
        }
        const canUseSourceFeatures = exportAvailability.canUseSourceFeatures;
        if (!canUseSourceFeatures) {
            return true;
        }
        try {
            const sourcePath = getSelectedSourceBasePath(selectedItem);
            if (!sourcePath) {
                return true;
            }
            const result = await apiService.reviewCode(sourcePath, requireProjectScope(projectId), {
                enforceComponentExportName: true,
                mode: 'axure-export',
            });
            if (result?.passed) {
                return true;
            }
            const issues = Array.isArray(result?.issues) ? result.issues : [];
            const firstIssue = issues.find((issue: any) => issue?.blocking && issue?.type === 'error')
                || issues.find((issue: any) => issue?.type === 'error')
                || issues[0];
            setPendingExportReviewResult(result);
            console.warn('[Axure Export Review]', firstIssue?.message || '代码检查未通过');
            return false;
        } catch (error: any) {
            setPendingExportReviewResult(createExportReviewFailureResult({
                activeTab,
                itemName: selectedItem.name,
                sourceTargetPath: getSelectedSourceBasePath(selectedItem),
                message: error?.message || '代码检查接口调用失败',
            }));
            console.warn('[Axure Export Review]', error?.message || '代码检查失败');
            return false;
        }
    }, [activeTab, exportAvailability.canUseSourceFeatures, messageApi, projectId, selectedItem]);

    const fetchRuntimeExportBundle = useCallback(async (): Promise<ExportIndexBundle> => {
        if (!selectedItem) {
            throw new Error('未选择项目');
        }
        if (exportAvailability.axureSourceDisabledReason) {
            throw new Error(exportAvailability.axureSourceDisabledReason);
        }

        return apiService.fetchExportIndexBundle(getSelectedResourceTargetPath(selectedItem), requireProjectScope(projectId), {
            includeImageAssets: imageConfig.includeImageAssets,
        });
    }, [activeTab, exportAvailability.axureSourceDisabledReason, imageConfig.includeImageAssets, projectId, selectedItem]);

    const buildRuntimeCoverSvg = useCallback(async () => {
        if (!selectedItem) {
            throw new Error('未选择项目');
        }
        if (exportAvailability.axureSourceDisabledReason) {
            throw new Error(exportAvailability.axureSourceDisabledReason);
        }
        if (imageConfig.contentType === 'screenshot' && !imageConfig.rawScreenshotUrl) {
            throw new Error('正在生成截图，请稍候...');
        }
        const hackCss = await apiService.fetchHackCss(activeTab, selectedItem.name);
        let indexBundle: ExportIndexBundle | null = null;
        let embeddedIndexBundle: ExportIndexBundle | null = null;
        if (imageConfig.includeConfig !== 'none') {
            indexBundle = await fetchRuntimeExportBundle();
            embeddedIndexBundle = createEmbeddedIndexBundle(indexBundle);
        }
        const label = '原型';
        let svgContent = '';
        if (imageConfig.contentType === 'title') {
            const titleSvg = generateSvgContent('', imageConfig, selectedItem.displayName, label);
            const pngDataUrl = await svgToPng(titleSvg, imageConfig.width, imageConfig.height, 2);
            svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${imageConfig.width}" height="${imageConfig.height}" viewBox="0 0 ${imageConfig.width} ${imageConfig.height}"><rect width="100%" height="100%" fill="transparent" /><image x="0" y="0" width="${imageConfig.width}" height="${imageConfig.height}" preserveAspectRatio="xMidYMin meet" xlink:href="${pngDataUrl}"/></svg>`;
        } else {
            svgContent = generateSvgContent(imageConfig.rawScreenshotUrl, imageConfig, selectedItem.displayName, label);
        }
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svgElement = svgDoc.querySelector('svg');
        if (!svgElement) {
            throw new Error('SVG generation failed');
        }
        const coverWidth = Number(svgElement.getAttribute('width')) || imageConfig.width;
        const coverHeight = Number(svgElement.getAttribute('height')) || imageConfig.height;
        if (imageConfig.includeConfig !== 'none') {
            const axureRuntimeCode = indexBundle.entry.axureCode || indexBundle.entry.code;
            const configPayload: Record<string, unknown> = {
                codeLink: indexBundle.entry.axureCodePath ? `${window.location.origin}${indexBundle.entry.axureCodePath}` : undefined,
            };
            if (activeTab === 'prototypes' && imageConfig.isFullScreen) {
                configPayload.isFullScreen = true;
            }
            if (hackCss) {
                configPayload.hackCss = hackCss;
            }
            svgElement.setAttribute('AxExtraData', encodeURIComponent(JSON.stringify({
                code: axureRuntimeCode,
                indexBundle: embeddedIndexBundle,
            })));
            svgElement.setAttribute('AxData', encodeURIComponent(JSON.stringify({
                time: Date.now(),
                config: configPayload,
            })));
        }
        const serializer = new XMLSerializer();
        return {
            updatedSvg: serializer.serializeToString(svgDoc),
            fileName: `${selectedItem.name}.svg`,
            coverWidth,
            coverHeight,
        };
    }, [activeTab, exportAvailability.axureSourceDisabledReason, fetchRuntimeExportBundle, imageConfig, selectedItem]);

    const handleExport = useCallback(async () => {
        if (!selectedItem) return;
        const hide = messageApi.loading('正在下载 Runtime 封面...', 0);
        setIsExporting(true);
        try {
            const { updatedSvg, fileName } = await buildRuntimeCoverSvg();
            const blob = new Blob([updatedSvg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            messageApi.success('Runtime 封面下载成功');
            setIsExportModalOpen(false);
        } catch (error: any) {
            messageApi.error(error?.message || '下载 Runtime 封面失败');
        } finally {
            hide();
            setIsExporting(false);
        }
    }, [buildRuntimeCoverSvg, messageApi, selectedItem]);

    const handleCopyRuntimeComponent = useCallback(async () => {
        if (!selectedItem) return;
        const hide = messageApi.loading('正在复制 Runtime 组件...', 0);
        setIsExporting(true);
        try {
            const { updatedSvg, coverWidth, coverHeight } = await buildRuntimeCoverSvg();
            const payload = buildRuntimeComponentAxvgPayload({
                svgContent: updatedSvg,
                width: coverWidth,
                height: coverHeight,
            });
            await copyToClipboard(`// axvg\n${JSON.stringify(payload)}`);
            messageApi.success('Runtime 组件已复制到剪贴板');
        } catch (error: any) {
            messageApi.error(error?.message || '复制 Runtime 组件失败');
        } finally {
            hide();
            setIsExporting(false);
        }
    }, [buildRuntimeCoverSvg, messageApi, selectedItem]);

    const handleCopyConfig = useCallback(async (exportType: string): Promise<string> => {
        void exportType;
        if (!selectedItem) {
            throw new Error('未选择项目');
        }
        if (exportAvailability.axureSourceDisabledReason) {
            throw new Error(exportAvailability.axureSourceDisabledReason);
        }
        const hackCss = await apiService.fetchHackCss(activeTab, selectedItem.name);
        const indexBundle = await fetchRuntimeExportBundle();
        const embeddedIndexBundle = createEmbeddedIndexBundle(indexBundle);
        const axureRuntimeCode = indexBundle.entry.axureCode || indexBundle.entry.code;
        const configData: any = {
            time: Date.now(),
            config: {
                code: axureRuntimeCode,
                codeLink: indexBundle.entry.axureCodePath ? `${window.location.origin}${indexBundle.entry.axureCodePath}` : undefined,
                indexBundle: embeddedIndexBundle,
                ...(activeTab === 'prototypes' && imageConfig.isFullScreen ? { isFullScreen: true } : {}),
                ...(hackCss ? { hackCss } : {}),
            },
        };
        return JSON.stringify(configData);
    }, [activeTab, exportAvailability.axureSourceDisabledReason, fetchRuntimeExportBundle, imageConfig.isFullScreen, selectedItem]);

    const handleQuickCopyEditablePrototype = useCallback(() => {
        void handleCopyToAxure(axureCopyOptions);
    }, [axureCopyOptions, handleCopyToAxure]);

    const handleQuickCopyRuntimeComponent = useCallback(() => {
        void (async () => {
            if (exportAvailability.axureSourceDisabledReason) {
                messageApi.warning(exportAvailability.axureSourceDisabledReason);
                return;
            }
            const passed = await ensureAxureExportReviewPassed();
            if (!passed) return;
            await handleCopyRuntimeComponent();
        })();
    }, [ensureAxureExportReviewPassed, exportAvailability.axureSourceDisabledReason, handleCopyRuntimeComponent, messageApi]);

    const handleQuickDownloadRuntimeCover = useCallback(() => {
        void (async () => {
            if (exportAvailability.axureSourceDisabledReason) {
                messageApi.warning(exportAvailability.axureSourceDisabledReason);
                return;
            }
            const passed = await ensureAxureExportReviewPassed();
            if (!passed) return;
            await handleExport();
        })();
    }, [ensureAxureExportReviewPassed, exportAvailability.axureSourceDisabledReason, handleExport, messageApi]);

    const handleOpenAxureUsageGuide = useCallback(() => {
        mergeExportModalPreferences(exportPreferencesStorageKey, {
            activeTabKey: 'usageGuide' satisfies ExportModalTabKey,
        });
        setIsExportModalOpen(true);
    }, [exportPreferencesStorageKey]);

    useEffect(() => {
        if (exportPreferencesLoadedKeyRef.current === exportPreferencesStorageKey) {
            return;
        }

        exportPreferencesLoadedKeyRef.current = exportPreferencesStorageKey;
        exportPreferencesReadyRef.current = false;

        const preferences = readExportModalPreferences(exportPreferencesStorageKey);
        const savedContentType = preferences.imageConfig?.contentType ?? DEFAULT_EXPORT_IMAGE_CONFIG.contentType;

        // Resolve dimensions based on contentType rather than blindly restoring saved w/h.
        // For 'title' mode, always use the title card defaults (500×300).
        // For 'screenshot' mode, use the device-appropriate defaults; the actual screenshot
        // dimensions will be auto-synced once a capture returns.
        const resolvedDimensions = savedContentType === 'screenshot'
            ? { width: currentPreviewScreenshotSize.width, height: currentPreviewScreenshotSize.height }
            : { width: TITLE_EXPORT_DEFAULT_SIZE.width, height: TITLE_EXPORT_DEFAULT_SIZE.height };

        const nextImageConfig = preferences.imageConfig
            ? {
                ...DEFAULT_EXPORT_IMAGE_CONFIG,
                ...preferences.imageConfig,
                ...resolvedDimensions,
                rawScreenshotUrl: '',
                screenshotWidth: 0,
                screenshotHeight: 0,
                previewUrl: '',
            }
            : DEFAULT_EXPORT_IMAGE_CONFIG;
        const nextAxureCopyOptions = preferences.axureCopyOptions
            ? { ...DEFAULT_AXURE_COPY_OPTIONS, ...preferences.axureCopyOptions }
            : DEFAULT_AXURE_COPY_OPTIONS;

        skipExportContentTypeResetRef.current = true;
        userSetDimensionsRef.current = false;
        setImageConfig(nextImageConfig);
        setAxureCopyOptions(nextAxureCopyOptions);
        exportPreferencesReadyRef.current = true;
    }, [
        currentPreviewScreenshotSize.height,
        currentPreviewScreenshotSize.width,
        exportPreferencesStorageKey,
    ]);

    useEffect(() => {
        if (!exportPreferencesReadyRef.current) return;

        mergeExportModalPreferences(exportPreferencesStorageKey, {
            imageConfig: {
                width: imageConfig.width,
                height: imageConfig.height,
                includeConfig: imageConfig.includeConfig,
                includeImageAssets: imageConfig.includeImageAssets,
                contentType: imageConfig.contentType,
                isFullScreen: imageConfig.isFullScreen,
            },
            axureCopyOptions: {
                preserveHierarchy: axureCopyOptions.preserveHierarchy,
                preserveSvgIcons: axureCopyOptions.preserveSvgIcons,
            },
        });
    }, [
        axureCopyOptions.preserveHierarchy,
        axureCopyOptions.preserveSvgIcons,
        exportPreferencesStorageKey,
        imageConfig.contentType,
        imageConfig.height,
        imageConfig.includeConfig,
        imageConfig.includeImageAssets,
        imageConfig.isFullScreen,
        imageConfig.width,
    ]);

    useEffect(() => {
        const contentTypeChanged = previousExportContentTypeRef.current !== imageConfig.contentType;
        previousExportContentTypeRef.current = imageConfig.contentType;
        if (skipExportContentTypeResetRef.current) {
            skipExportContentTypeResetRef.current = false;
            return;
        }
        if (contentTypeChanged) {
            userSetDimensionsRef.current = false;
            if (imageConfig.contentType !== 'screenshot') {
                screenshotModalRefreshKeyRef.current = '';
            }
        }
        if (imageConfig.contentType === 'screenshot' && !userSetDimensionsRef.current) {
            setImageConfig((previous) => ({
                ...previous,
                width: currentPreviewScreenshotSize.width,
                height: currentPreviewScreenshotSize.height,
                screenshotWidth: 0,
                screenshotHeight: 0,
                rawScreenshotUrl: '',
            }));
        } else if (contentTypeChanged) {
            setImageConfig((previous) => ({
                ...previous,
                width: 500,
                height: 300,
            }));
        }
    }, [
        currentPreviewScreenshotSize.height,
        currentPreviewScreenshotSize.width,
        imageConfig.contentType,
    ]);

    useEffect(() => {
        userSetDimensionsRef.current = false;
        setImageConfig((previous) => ({
            ...previous,
            rawScreenshotUrl: '',
            screenshotWidth: 0,
            screenshotHeight: 0,
            previewUrl: '',
        }));
    }, [selectedPrototypeContextKey]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const targetIframe = previewIframeRef.current;
            if (!targetIframe || event.source !== targetIframe.contentWindow) {
                return;
            }
            const previewOrigin = getIframeOrigin(targetIframe);
            if (previewOrigin !== '*' && event.origin !== previewOrigin) {
                return;
            }
            if (event.data?.type === 'SPEC_EDIT_STATUS') {
                const nextMode: SpecQuickEditMode = event.data.quickEditMode === 'edit' ? 'edit' : 'comment';
                const nextState = {
                    enabled: Boolean(event.data.enabled),
                    dirty: Boolean(event.data.dirty),
                    saving: Boolean(event.data.saving),
                };
                const pendingDocumentMode = pendingDocumentEditorRestoreModeRef.current;
                const refreshStatusAction = resolveDocumentRefreshRestoreStatus(
                    pendingDocumentMode,
                    nextState,
                );
                if (pendingDocumentMode) {
                    pendingDocumentEditorRestoreModeRef.current = null;
                }
                if (!refreshStatusAction.acceptStatus && refreshStatusAction.restoreMode) {
                    handleEnableDocEdit(refreshStatusAction.restoreMode, { preserveSidebar: true });
                    return;
                }
                setDocEditState({
                    ...nextState,
                    quickEditMode: nextMode,
                });
                const pendingSwitch = pendingDocSwitchRef.current;
                if (pendingSwitch && !nextState.saving && !nextState.enabled) {
                    pendingDocSwitchRef.current = null;
                    switchMarkdownSelection(pendingSwitch.kind, pendingSwitch.item);
                }
                const prototypeSpecStatusAction = prototypeSpecMarkdownStatusGateRef.current.handle({
                    contentMode: contentModeOverride,
                    enabled: nextState.enabled,
                    saving: nextState.saving,
                });
                if (prototypeSpecStatusAction === 'enable') {
                    handleEnableDocEdit('comment', { disableSelectionMode: true, preserveSidebar: true });
                    return;
                }
                if (prototypeSpecStatusAction === 'close') {
                    documentEditorActiveRef.current = false;
                    quickEditRuntimeActiveRef.current = false;
                    setEditorStatus({ mode: 'none' });
                    onPrototypeSpecExit?.();
                    return;
                }
                if (!nextState.enabled && !quickEditRuntimeActiveRef.current && !documentEditorActiveRef.current) {
                    setEditorStatus({ mode: 'none' });
                }
                return;
            }
            if (event.data?.type === 'SPEC_EDIT_STATUS_REQUEST') {
                postToPreview({
                    type: 'SPEC_EDIT_STATUS',
                    enabled: docEditState.enabled,
                    dirty: docEditState.dirty,
                    saving: docEditState.saving,
                    activeDocKey: activePromptResource?.cacheKey ?? '',
                    quickEditMode: docEditState.quickEditMode,
                });
                return;
            }
            if (typeof event.data?.type === 'string' && event.data.type.startsWith('axhub.quickEdit.export.')) {
                if (event.data.type !== 'axhub.quickEdit.export.captureScreenshotResult') return;
                if (pendingClipboardScreenshotRequestIdsRef.current.has(event.data.requestId)) return;
                if (event.data.success) {
                    setImageConfig((previous) => ({
                        ...previous,
                        rawScreenshotUrl: event.data.dataUrl,
                        screenshotWidth: event.data.width,
                        screenshotHeight: event.data.height,
                    }));
                    return;
                }
                setImageConfig((previous) => ({
                    ...previous,
                    rawScreenshotUrl: '',
                    screenshotWidth: 0,
                    screenshotHeight: 0,
                    previewUrl: '',
                }));
                notifyPreviewMessage('error', event.data.error || '截图生成失败');
                return;
            }
            if (event.data?.type === 'AXHUB_PROTOTYPE_PAGE_CHANGE') {
                const nextPageId = typeof event.data.pageId === 'string' && /^[a-z0-9-]+$/u.test(event.data.pageId.trim())
                    ? event.data.pageId.trim()
                    : '';
                onPrototypePageChange?.(nextPageId || null);
                return;
            }
            if (event.data?.type === 'AXHUB_PROTOTYPE_ROUTE_INFO') {
                const nextRouteInfo = normalizePrototypeRouteInfo(event.data);
                if (!nextRouteInfo) {
                    return;
                }
                onPrototypeRouteInfo?.(nextRouteInfo);
                return;
            }
            if (event.data?.type === 'WEB_EDITOR_DIALOG_REQUEST') {
                const requestId = typeof event.data.requestId === 'string' ? event.data.requestId.trim() : '';
                const kind = event.data.kind === 'confirm' ? 'confirm' : 'alert';
                if (!requestId) {
                    return;
                }

                const title = typeof event.data.title === 'string' && event.data.title.trim()
                    ? event.data.title.trim()
                    : kind === 'confirm'
                        ? '确认操作'
                        : '提示';
                const description = typeof event.data.description === 'string' ? event.data.description : '';
                const confirmText = typeof event.data.confirmText === 'string' && event.data.confirmText.trim()
                    ? event.data.confirmText.trim()
                    : kind === 'confirm'
                        ? '确定'
                        : '知道了';
                const cancelText = typeof event.data.cancelText === 'string' && event.data.cancelText.trim()
                    ? event.data.cancelText.trim()
                    : '取消';
                const dismissible = event.data.dismissible !== false;
                const tone = event.data.tone === 'destructive'
                    ? 'destructive'
                    : event.data.tone === 'default'
                        ? 'default'
                        : 'brand';
                postToPreview({
                    type: 'WEB_EDITOR_DIALOG_ACK',
                    requestId,
                }, targetIframe);

                void (async () => {
                    if (kind === 'confirm') {
                        const confirmed = await appDialog.confirm({
                            title,
                            description,
                            confirmText,
                            cancelText,
                            tone,
                            dismissible,
                        });
                        postToPreview({
                            type: 'WEB_EDITOR_DIALOG_RESPONSE',
                            requestId,
                            confirmed,
                        }, targetIframe);
                        return;
                    }

                    notifyPreviewMessage(
                        event.data.level ?? (
                            tone === 'destructive'
                                ? 'error'
                                : title === '提示'
                                    ? 'info'
                                    : 'info'
                        ),
                        description,
                    );
                    postToPreview({
                        type: 'WEB_EDITOR_DIALOG_RESPONSE',
                        requestId,
                        confirmed: true,
                    }, targetIframe);
                })();
                return;
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [
        appDialog,
        activePromptResource?.cacheKey,
        contentModeOverride,
        docEditState.dirty,
        docEditState.enabled,
        docEditState.quickEditMode,
        docEditState.saving,
        getIframeOrigin,
        handleEnableDocEdit,
        onPrototypeSpecExit,
        notifyPreviewMessage,
        onPrototypePageChange,
        onPrototypeRouteInfo,
        selectedPrototypeIdentity,
        postToPreview,
        switchMarkdownSelection,
    ]);

    useEffect(() => {
        if (!isExportModalOpen || !selectedItem) return;
        if (imageConfig.contentType === 'screenshot' && !imageConfig.rawScreenshotUrl) {
            setImageConfig((previous) => ({ ...previous, previewUrl: '' }));
            return;
        }
        let disposed = false;
        let currentUrl = '';
        const label = '原型';
        (async () => {
            try {
                let svgContent = '';
                if (imageConfig.contentType === 'title') {
                    const titleSvg = generateSvgContent('', imageConfig, selectedItem.displayName, label);
                    const pngDataUrl = await svgToPng(titleSvg, imageConfig.width, imageConfig.height, 2);
                    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${imageConfig.width}" height="${imageConfig.height}" viewBox="0 0 ${imageConfig.width} ${imageConfig.height}"><rect width="100%" height="100%" fill="transparent" /><image x="0" y="0" width="${imageConfig.width}" height="${imageConfig.height}" preserveAspectRatio="xMidYMin meet" xlink:href="${pngDataUrl}"/></svg>`;
                } else {
                    svgContent = generateSvgContent(imageConfig.rawScreenshotUrl, imageConfig, selectedItem.displayName, label);
                }
                const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
                currentUrl = URL.createObjectURL(blob);
                if (!disposed) {
                    setImageConfig((previous) => ({ ...previous, previewUrl: currentUrl }));
                }
            } catch {
                if (!disposed) {
                    setImageConfig((previous) => ({ ...previous, previewUrl: '' }));
                }
            }
        })();
        return () => {
            disposed = true;
            if (currentUrl) {
                URL.revokeObjectURL(currentUrl);
            }
        };
    }, [
        activeTab,
        imageConfig.contentType,
        imageConfig.height,
        imageConfig.rawScreenshotUrl,
        imageConfig.width,
        isExportModalOpen,
        selectedItem,
    ]);

    useEffect(() => {
        if (!isExportModalOpen || imageConfig.contentType !== 'screenshot') return;
        if (!selectedItem) return;
        const projectKey = String(selectedItem?.projectId || projectId || '').trim();
        const resourceKey = resolveSelectedPrototypeIdentity(selectedItem) || 'selected';
        const pageKey = String(selectedPageId || '').trim();
        const refreshKey = `${projectKey}:${resourceKey}:${pageKey}:${currentPreviewScreenshotSize.width}x${currentPreviewScreenshotSize.height}`;
        if (screenshotModalRefreshKeyRef.current === refreshKey) return;
        screenshotModalRefreshKeyRef.current = refreshKey;
        setImageConfig((previous) => ({
            ...previous,
            rawScreenshotUrl: '',
            screenshotWidth: 0,
            screenshotHeight: 0,
            previewUrl: '',
        }));
        handleRequestScreenshot();
    }, [
        handleRequestScreenshot,
        imageConfig.contentType,
        isExportModalOpen,
        projectId,
        currentPreviewScreenshotSize.height,
        currentPreviewScreenshotSize.width,
        selectedItem,
        selectedPageId,
    ]);

    useEffect(() => {
        if (!isExportModalOpen) {
            screenshotModalRefreshKeyRef.current = '';
        }
    }, [isExportModalOpen]);

    const handleStandalonePanelToggle = useCallback(async () => {
        if (standalonePanelOpen) {
            pendingStandalonePanelRestoreRef.current = false;
            exitPrototypeEditorPanelOnly();
            setStandalonePanelOpen(false);
        } else {
            pendingStandalonePanelRestoreRef.current = false;
            const primaryIframe = getPrimaryPreviewIframe();
            const success = await enterPrototypeEditorPanelOnly(primaryIframe);
            if (success) {
                setStandalonePanelOpen(true);
            }
        }
    }, [
        enterPrototypeEditorPanelOnly,
        exitPrototypeEditorPanelOnly,
        getPrimaryPreviewIframe,
        standalonePanelOpen,
    ]);

    return {
        selectedDeviceId,
        previewConfig,
        previewDeviceParam,
        handlePreviewContainerSizeChange,
        handlePreviewExternalWorkspaceWidthChange,
        setSelectedDeviceId,
        deviceSegmentOptions,
        handleSelectPreviewSinglePreset,
        handleSelectCustomPreview,
        handleActivateSplitPreview,
        handleActivateMultiPagePreview,
        handleChangeMultiPageColumns,
        handleChangeCustomPreviewWidth,
        handleChangeCustomPreviewHeight,
        handleChangeSplitPreviewWidth,
        handleChangeSplitPreviewHeight,
        handleChangePreviewScaleMode,
        qrCodeVisible,
        setQrCodeVisible,
        quickEditAvailable,
        quickEditPromptAvailable,
        quickEditPromptCopying,
        prototypeAnnotationSessionActive,
        prototypeAnnotationPromptCopying,
        prototypeAnnotationEnabled: hostToolbarState?.annotationEnabled === true,
        prototypeAnnotationEnableLoading: prototypeAnnotationStatusLoading
            || hostToolbarState?.annotationEnableLoading === true,
        exportAvailability,
        editorStatus,
        docEditState,
        markdownPromptCopying,
        drawioResourceEditAvailable,
        reviewPanelOpen,
        activeReviewReportId,
        reviewReports,
        selectedReviewReport,
        reviewLoading,
        reviewDetailLoading,
        reviewUploadLoading,
        reviewError,
        reviewLanSubmitConfig,
        reviewAxhubSubmitConfig,
        reviewPrompt,
        reviewDocumentPath,
        reviewPrompts,
        reviewDocumentPaths,
        quickEditRuntimeStatus,
        hostToolbarState,
        prototypeDecisionDataAvailable,
        containerRef,
        previewIframeRef,
        secondaryPreviewIframeRef,
        handlePreviewIframeLoad,
        currentDevice,
        displaySize,
        scale,
        elementIframeKey,
        iframeUrl,
        primaryIframeUrl,
        secondaryIframeUrl,
        localShareUrl,
        elementIframeSize,
        setElementIframeSize,
        isExportModalOpen,
        setIsExportModalOpen,
        isFigmaMakeExportDialogOpen,
        setIsFigmaMakeExportDialogOpen,
        axhubPublishDialogOpen,
        setAxhubPublishDialogOpen,
        cloudPublishSettingsOpen,
        cloudPublishSettingsInitialTarget,
        setCloudPublishSettingsOpen,
        pendingExportReviewResult,
        setPendingExportReviewResult,
        exportPreferencesStorageKey,
        isExporting,
        imageConfig,
        setImageConfig,
        axureCopyOptions,
        setAxureCopyOptions,
        handleDimensionChange,
        handleSwapDimensions,
        handleDimensionBlur,
        handleExport,
        handleCopyRuntimeComponent,
        handleCopyToAxure,
        handleCopyConfig,
        handleSelectDoc,
        handleSelectTemplate,
        handleOpenWebEditor,
        handleOpenPrototypeAnnotationSession,
        handleCheckPrototypeAnnotationEnabled,
        handleEnablePrototypeAnnotation,
        handleEnableDocEdit,
        handleSaveDocEdit,
        handleExitDocEdit,
        handleSwitchDocQuickEditMode,
        handleOpenDrawioResourceEditor,
        handleCopyMarkdownPrompt,
        handleReviewPanelToggle,
        handleSelectReviewReport,
        handleBackToReviewList,
        handleCopyReviewReportPath,
        handleDeleteReviewReport,
        handleStartReview,
        handleRunReviewDirect,
        handleUploadReviewReport,
        handleReviewLanSubmitEnabledChange,
        handleReviewAxhubSubmitEnabledChange,
        runHostToolbarAction,
        runPrototypePanePromptAction,
        runQuickEditSaveAction,
        handleExitWebEditor,
        handleCopyQuickEditPrompt,
        handleCopyPrototypeAnnotationPrompt,
        handleRefreshElement,
        handleCopyLocalLink,
        handleCopyLANLink,
        getLANUrl,
        handleCopyToFigma,
        handleCopyCurrentScreenshot,
        handleExportMake,
        handleExportHtml,
        handlePublishCloudTarget,
        handleOpenCloudPublishSettings,
        handleCloudPublishSettingsSaved,
        handleOpenAxhubPublishDialog,
        handleAxhubPublished,
        currentPublishResourcePath,
        visibleCloudPublishTargets,
        latestCloudPublishUrl,
        handleCopyLatestCloudPublishUrl,
        handleFigmaMakeExportDownloadSuccess,
        handleFigmaMakeExportDownloadFailure,
        handleQuickCopyEditablePrototype,
        handleQuickCopyRuntimeComponent,
        handleQuickDownloadRuntimeCover,
        handleOpenAxureUsageGuide,
        getCommentaryVoiceTarget,
        getCommentaryVoiceTargets,
        findCommentaryVoiceElements,
        getCommentaryVoiceElementStructure,
        activateCommentaryVoiceElement,
        createCommentaryVoiceComment,
        refreshCommentaryVoicePersistedComments,
        resolveCommentaryExecutionContext,
        getAnnotationDirectRunOperation,
        requestCurrentScreenshot,
        runAnnotationAcpChatPrompt,
        abortAnnotationDirectRun,
        clearAssistantSelectedElementsOnExit,
        handleOpenAssistantIframe: openAnnotationAssistantWithContext,
        assistantProjectPath,
        standalonePanelOpen,
        handleStandalonePanelToggle,
    };
}
