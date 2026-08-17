import {
    useCallback,
    useEffect,
    useRef,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import type {
    CommentaryExternalEditingTargetRef,
    CommentaryHostToolbarAction,
    CommentaryHostToolbarState,
    CommentaryModifiedElementSummary,
    CommentaryPageElementActivationResult,
    CommentaryPageElementSearchQuery,
    CommentaryPageElementSearchResult,
    CommentaryPageElementStructureQuery,
    CommentaryPageElementStructureResult,
    CommentaryVoiceCommentOptions,
    CommentaryVoiceCommentResult,
    CommentaryVoiceTargets,
} from '@/common/web-editor-types';
import type {
    QuickEditSaveAction,
    QuickEditSaveDraft,
} from '@/common/quickEditSave';
import type { PreviewConfig } from '../../domains/device/preview-layout';
import { resolveInjectedMakeServerOrigin } from '../../../common/makeServerOrigin';
import {
    createDefaultHostToolbarState,
    PROTOTYPE_EDITOR_BRIDGE_TIMEOUT_MS,
    readPreviewFrameEditorApi,
    resolveHostToolbarStateForDisplay,
    resolvePrototypeEditorMobileMode,
    type HostToolbarEditorsApi,
    type PreviewPane,
    type PrototypeEditorApi,
    type PrototypeEditorBridgeStateMessage as BasePrototypeEditorBridgeStateMessage,
    type PrototypeEditorContext,
    type PrototypeEditorSaveActionMessage,
} from './previewActions.helpers';
import { postIframeMessageRequest } from './iframeMessageRequest';
import { buildInternalPrototypeCommentPageScope } from '../../../common/prototypeCommentPageScope';
import { clearCompletedCommentsImmediately } from './completedCommentCleanup';

type PrototypeEditorBridgeStateMessage = BasePrototypeEditorBridgeStateMessage & {
    modifiedElements?: CommentaryModifiedElementSummary[];
};

type VoiceBridgeRpc = (
    message: Record<string, unknown>,
) => Promise<PrototypeEditorBridgeStateMessage | null>;

const STALE_VOICE_TARGET_ERROR = '页面已变化，请重新查找';
const VOICE_BRIDGE_OPERATION_ERROR = '页面操作失败，请重新获取页面目标后重试';

function requireSuccessfulVoiceBridgeResponse(
    response: PrototypeEditorBridgeStateMessage | null,
): PrototypeEditorBridgeStateMessage {
    if (response?.success === true) return response;
    throw new Error(response?.error === STALE_VOICE_TARGET_ERROR
        ? STALE_VOICE_TARGET_ERROR
        : VOICE_BRIDGE_OPERATION_ERROR);
}

type UsePrototypeEditorBridgeActionsParams = {
    projectId?: string;
    getPrimaryPreviewIframe: () => HTMLIFrameElement | null;
    getSecondaryPreviewIframe: () => HTMLIFrameElement | null;
    getPreviewIframes: () => HTMLIFrameElement[];
    getPreviewIframeGeneration: (iframe: HTMLIFrameElement | null | undefined) => number;
    getPreviewIframeTargetUrl: (iframe: HTMLIFrameElement) => string;
    getIframeOrigin: (iframe?: HTMLIFrameElement | null) => string;
    selectedEditablePreviewResource: any;
    resourceType: 'prototype' | 'theme';
    previewConfig: PreviewConfig;
    selectedPageId?: string | null;
    isDarkMode: boolean;
    isDarkModeRef: MutableRefObject<boolean>;
    agentRunConcurrency: number;
    autoClearCompletedComments: boolean;
    assistantPanelOpen: boolean;
    getAnnotationSession?: () => boolean;
    messageApi: {
        warning: (content: string) => void;
    };
    prototypeHostToolbarUnsubscribeRef: MutableRefObject<(() => void) | null>;
    setHostToolbarState: Dispatch<SetStateAction<CommentaryHostToolbarState | null>>;
};

type PrototypeEditorEnableOptions = {
    toolbarMode: 'host';
    initialDarkMode: boolean;
    mobileMode?: boolean;
    assistantPanelOpen?: boolean;
    commentPageScope?: string;
    makeServerOrigin?: string;
    annotationApiBaseUrl?: string;
    annotationProjectId?: string;
    agentRunConcurrency?: number;
    interactionProfile: 'design' | 'annotation';
};
type PrototypeEditorEnterOptions = {
    showMissingWarning?: boolean;
};
type PrototypeEditorNodeEditingState = 'editing' | 'idle' | 'completed' | 'error';
type PrototypeEditorNodeEditingTaskRef = {
    provider: string | null;
    sessionId: string | null;
    requestId: string | null;
    error?: string | null;
    code?: string | null;
    output?: string | null;
    chunk?: unknown;
    details?: unknown;
} | null;
type PrototypeEditorNodeEditingTargetRef = CommentaryExternalEditingTargetRef | null;

type PrototypeEditorBridgeActions = {
    getPrototypeEditorApi: (iframe?: HTMLIFrameElement | null) => PrototypeEditorApi | null;
    getPrototypeEditorVoiceTarget: (iframe?: HTMLIFrameElement | null) => Promise<unknown | null>;
    getPrototypeEditorVoiceTargets: (
        iframe?: HTMLIFrameElement | null,
    ) => Promise<CommentaryVoiceTargets | null>;
    findPrototypeEditorVoiceElements: (
        query: CommentaryPageElementSearchQuery,
        iframe?: HTMLIFrameElement | null,
    ) => Promise<CommentaryPageElementSearchResult | null>;
    getPrototypeEditorVoiceElementStructure: (
        query: CommentaryPageElementStructureQuery,
        iframe?: HTMLIFrameElement | null,
    ) => Promise<CommentaryPageElementStructureResult | null>;
    activatePrototypeEditorVoiceElement: (
        targetRef: string,
        iframe?: HTMLIFrameElement | null,
    ) => Promise<CommentaryPageElementActivationResult | null>;
    createPrototypeEditorVoiceComment: (
        targetRef: string,
        content: string,
        options: CommentaryVoiceCommentOptions,
        iframe?: HTMLIFrameElement | null,
    ) => Promise<CommentaryVoiceCommentResult | null>;
    refreshPrototypeEditorVoiceComments: (
        deletedCommentIds?: readonly string[],
        iframe?: HTMLIFrameElement | null,
    ) => Promise<boolean>;
    validatePrototypeEditorEditingTarget: (
        elementKey: string,
        targetRef: CommentaryExternalEditingTargetRef | null,
        iframe?: HTMLIFrameElement | null,
    ) => Promise<boolean>;
    subscribePrototypeEditorVoiceTargets: (
        listener: (targets: CommentaryVoiceTargets) => void,
        iframe?: HTMLIFrameElement | null,
    ) => Promise<() => void>;
    enterPrototypeEditor: (
        iframe?: HTMLIFrameElement | null,
        options?: PrototypeEditorEnterOptions,
    ) => Promise<boolean>;
    enterPrototypeEditorPanelOnly: (
        iframe?: HTMLIFrameElement | null,
    ) => Promise<boolean>;
    exitPrototypeEditorPanelOnly: (
        iframe?: HTMLIFrameElement | null,
    ) => void;
    postPrototypeEditorDisable: (iframe: HTMLIFrameElement) => Promise<PrototypeEditorBridgeStateMessage | null>;
    postPrototypeEditorHostToolbarAction: (
        iframe: HTMLIFrameElement,
        action: CommentaryHostToolbarAction,
    ) => Promise<PrototypeEditorBridgeStateMessage | null>;
    postPrototypeEditorSaveAction: (
        iframe: HTMLIFrameElement,
        action: QuickEditSaveAction,
    ) => Promise<PrototypeEditorBridgeStateMessage | null>;
    postPrototypeEditorPrepareSave: (
        iframe: HTMLIFrameElement,
        action: QuickEditSaveAction,
    ) => Promise<PrototypeEditorBridgeStateMessage | null>;
    postPrototypeEditorPreflightSave: (
        iframe: HTMLIFrameElement,
        draft: QuickEditSaveDraft,
    ) => Promise<PrototypeEditorBridgeStateMessage | null>;
    postPrototypeEditorCommitSave: (
        iframe: HTMLIFrameElement,
        draft: QuickEditSaveDraft,
    ) => Promise<PrototypeEditorBridgeStateMessage | null>;
    postPrototypeEditorNodeEditingState: (
        iframe: HTMLIFrameElement,
        elementKey: string,
        nextState: PrototypeEditorNodeEditingState,
        taskRef: PrototypeEditorNodeEditingTaskRef,
        targetRef?: PrototypeEditorNodeEditingTargetRef,
    ) => Promise<PrototypeEditorBridgeStateMessage | null>;
    queryPrototypeEditorState: (iframe: HTMLIFrameElement) => Promise<PrototypeEditorBridgeStateMessage | null>;
};

const HTML_TEMPLATE_BOOTSTRAP_SRC = '/assets/html-template-bootstrap.js';
const HTML_TEMPLATE_BOOTSTRAP_WAIT_MS = 2000;
const HTML_TEMPLATE_BOOTSTRAP_POLL_MS = 50;

export function isHtmlDocumentPreviewUrl(src: string, hostOrigin: string): boolean {
    let url: URL;
    try {
        url = new URL(src, hostOrigin);
    } catch {
        return false;
    }
    const isHtmlPath = /\.html?$/iu.test(url.searchParams.get('path') || '')
        || /\.html?$/iu.test(url.pathname);
    if (!isHtmlPath) {
        return false;
    }
    return url.pathname.includes('/api/docs/')
        || url.pathname.includes('/api/markdown-file')
        || /^\/api\/projects\/[^/]+\/document-content$/u.test(url.pathname)
        || (url.pathname.includes('/prototypes/') && url.pathname.endsWith('/spec/content'));
}

/**
 * Resolves the Commentary target without assuming the preview shares the Make
 * host's origin. Same-origin previews expose the API directly; cross-origin
 * previews return the same serializable snapshot through QUERY_STATE.
 */
export async function readPrototypeEditorVoiceTarget(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    queryState: () => Promise<PrototypeEditorBridgeStateMessage | null>;
}): Promise<unknown | null> {
    if (typeof input.editors?.getVoiceTarget === 'function') {
        try {
            return await Promise.resolve(input.editors.getVoiceTarget()) ?? null;
        } catch {
            // A previously same-origin preview may navigate cross-origin between
            // resolving the editor API and invoking it. Use the safe bridge.
        }
    }
    return requireSuccessfulVoiceBridgeResponse(await input.queryState()).voiceTargets?.preferred ?? null;
}

export async function readPrototypeEditorVoiceTargets(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    rpc: VoiceBridgeRpc;
}): Promise<CommentaryVoiceTargets | null> {
    if (typeof input.editors?.getVoiceTargets === 'function') {
        try {
            return await Promise.resolve(input.editors.getVoiceTargets());
        } catch {
            // The preview may have navigated cross-origin after resolving its API.
        }
    }
    return requireSuccessfulVoiceBridgeResponse(
        await input.rpc({ type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_GET_TARGETS' }),
    ).voiceTargets ?? null;
}

export async function findPrototypeEditorVoiceElements(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    query: CommentaryPageElementSearchQuery;
    rpc: VoiceBridgeRpc;
}): Promise<CommentaryPageElementSearchResult | null> {
    if (typeof input.editors?.findVoiceElements === 'function') {
        try {
            return await Promise.resolve(input.editors.findVoiceElements(input.query));
        } catch {
            // Fall through to the origin-validated bridge.
        }
    }
    return requireSuccessfulVoiceBridgeResponse(await input.rpc({
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_FIND_ELEMENTS',
        query: input.query,
    })).voiceSearchResult ?? null;
}

export async function getPrototypeEditorVoiceElementStructure(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    query: CommentaryPageElementStructureQuery;
    rpc: VoiceBridgeRpc;
}): Promise<CommentaryPageElementStructureResult | null> {
    if (typeof input.editors?.getVoiceElementStructure === 'function') {
        try {
            return await Promise.resolve(input.editors.getVoiceElementStructure(input.query));
        } catch {
            // Fall through to the origin-validated bridge.
        }
    }
    return requireSuccessfulVoiceBridgeResponse(await input.rpc({
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_GET_STRUCTURE',
        query: input.query,
    })).voiceStructureResult ?? null;
}

export async function activatePrototypeEditorVoiceElement(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    targetRef: string;
    rpc: VoiceBridgeRpc;
}): Promise<CommentaryPageElementActivationResult | null> {
    if (typeof input.editors?.activateVoiceElement === 'function') {
        try {
            return await input.editors.activateVoiceElement(input.targetRef);
        } catch {
            // Fall through to the origin-validated bridge.
        }
    }
    return requireSuccessfulVoiceBridgeResponse(await input.rpc({
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_ACTIVATE_ELEMENT',
        targetRef: input.targetRef,
    })).voiceActivationResult ?? null;
}

export async function createPrototypeEditorVoiceComment(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    targetRef: string;
    content: string;
    options: CommentaryVoiceCommentOptions;
    rpc: VoiceBridgeRpc;
}): Promise<CommentaryVoiceCommentResult | null> {
    if (typeof input.editors?.createVoiceComment === 'function') {
        try {
            return await input.editors.createVoiceComment(
                input.targetRef,
                input.content,
                input.options,
            );
        } catch {
            // Fall through to the origin-validated bridge.
        }
    }
    return requireSuccessfulVoiceBridgeResponse(await input.rpc({
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_CREATE_COMMENT',
        targetRef: input.targetRef,
        content: input.content,
        options: input.options,
    })).voiceCommentResult ?? null;
}

export async function refreshPrototypeEditorVoiceComments(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    deletedCommentIds?: readonly string[];
    rpc: VoiceBridgeRpc;
}): Promise<boolean> {
    if (typeof input.editors?.refreshPersistedComments === 'function') {
        try {
            await input.editors.refreshPersistedComments(input.deletedCommentIds);
            return true;
        } catch {
            // Fall through when a same-origin preview navigates cross-origin.
        }
    }
    const response = await input.rpc({
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_REFRESH_COMMENTS',
        deletedCommentIds: [...(input.deletedCommentIds ?? [])],
    });
    return response?.success === true;
}

export async function validatePrototypeEditorEditingTarget(input: {
    editors: HostToolbarEditorsApi | null | undefined;
    elementKey: string;
    targetRef: CommentaryExternalEditingTargetRef | null;
    rpc: VoiceBridgeRpc;
}): Promise<boolean> {
    if (typeof input.editors?.validateExternalEditingTarget === 'function') {
        try {
            return await Promise.resolve(input.editors.validateExternalEditingTarget(
                input.elementKey,
                input.targetRef,
            )) === true;
        } catch {
            // Fall through after a same-origin preview navigation.
        }
    }
    const response = await input.rpc({
        type: 'AXHUB_PROTOTYPE_EDITOR_VALIDATE_EDITING_TARGET',
        elementKey: input.elementKey,
        targetRef: input.targetRef,
    });
    return response?.success === true && response.editingTargetValid === true;
}

export function isPrototypeEditorVoiceTargetsEvent(
    event: MessageEvent,
    iframe: HTMLIFrameElement,
    expectedOrigin: string,
    subscriptionId: string,
    currentGeneration: number,
    expectedGeneration: number,
): event is MessageEvent<{ type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_TARGETS_CHANGED'; voiceTargets: CommentaryVoiceTargets }> {
    return event.source === iframe.contentWindow
        && event.origin === expectedOrigin
        && currentGeneration === expectedGeneration
        && event.data?.type === 'AXHUB_PROTOTYPE_EDITOR_VOICE_TARGETS_CHANGED'
        && event.data?.subscriptionId === subscriptionId
        && Boolean(event.data?.voiceTargets);
}

function isHtmlDocumentPreviewIframe(iframe: HTMLIFrameElement): boolean {
    const src = iframe.getAttribute('src') || iframe.src || '';
    return isHtmlDocumentPreviewUrl(src, window.location.origin);
}

function isPreviewIframeAtTargetUrl(iframe: HTMLIFrameElement, targetUrl: string): boolean {
    const currentUrl = iframe.getAttribute('src') || iframe.src;
    try {
        return new URL(currentUrl, window.location.origin).href
            === new URL(targetUrl, window.location.origin).href;
    } catch {
        return false;
    }
}

function waitForHtmlDocumentPreviewEditorApi(iframe: HTMLIFrameElement): Promise<PrototypeEditorApi | null> {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const check = () => {
            const editors = readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, 'HtmlTemplateBootstrap');
            if (editors?.enable) {
                resolve(editors);
                return;
            }
            if (Date.now() - startedAt >= HTML_TEMPLATE_BOOTSTRAP_WAIT_MS) {
                resolve(null);
                return;
            }
            window.setTimeout(check, HTML_TEMPLATE_BOOTSTRAP_POLL_MS);
        };
        check();
    });
}

async function ensureHtmlDocumentPreviewEditorApi(iframe: HTMLIFrameElement): Promise<PrototypeEditorApi | null> {
    const existing = readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, 'HtmlTemplateBootstrap');
    if (existing?.enable) {
        return existing;
    }
    if (!isHtmlDocumentPreviewIframe(iframe)) {
        return null;
    }

    let doc: Document | null | undefined;
    try {
        doc = iframe.contentDocument;
        const contentType = doc?.contentType?.toLowerCase() || '';
        if (contentType && !contentType.includes('html')) {
            return null;
        }
    } catch {
        return null;
    }
    if (!doc) {
        return null;
    }

    if (!doc.querySelector('script[src*="html-template-bootstrap.js"]')) {
        const script = doc.createElement('script');
        script.type = 'module';
        script.src = HTML_TEMPLATE_BOOTSTRAP_SRC;
        doc.head?.appendChild(script) ?? doc.documentElement.appendChild(script);
    }
    return waitForHtmlDocumentPreviewEditorApi(iframe);
}

export function usePrototypeEditorBridgeActions({
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
    assistantPanelOpen,
    getAnnotationSession,
    messageApi,
    prototypeHostToolbarUnsubscribeRef,
    setHostToolbarState,
}: UsePrototypeEditorBridgeActionsParams): PrototypeEditorBridgeActions {
    const prototypeEditorBridgeRequestSeqRef = useRef(0);

    const normalizePrototypeEditorPageId = useCallback((value: unknown): string => {
        const pageId = typeof value === 'string' ? value.trim() : '';
        return /^[a-z0-9-]+$/u.test(pageId) ? pageId : '';
    }, []);

    const readPrototypeEditorPageIdFromIframe = useCallback((iframe: HTMLIFrameElement): string => {
        try {
            const href = iframe.contentWindow?.location?.href || iframe.src || '';
            const url = new URL(href, window.location.origin);
            const hashPageId = normalizePrototypeEditorPageId(new URLSearchParams(url.hash.replace(/^#/, '')).get('page'));
            return hashPageId || normalizePrototypeEditorPageId(url.searchParams.get('page'));
        } catch {
            return '';
        }
    }, [normalizePrototypeEditorPageId]);

    const buildPrototypeEditorCommentPageScope = useCallback((context: PrototypeEditorContext): string => {
        if (context.resourceType !== 'prototype' || !context.pageId) {
            return '';
        }
        return buildInternalPrototypeCommentPageScope(context.resourceId, context.pageId);
    }, []);

    const getPrototypeEditorApi = useCallback((iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe()): PrototypeEditorApi | null => {
        const editors = readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, 'DevTemplateBootstrap');
        return editors ?? readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, 'HtmlTemplateBootstrap');
    }, [getPrimaryPreviewIframe]);

    const buildPrototypeEditorContext = useCallback((iframe: HTMLIFrameElement): PrototypeEditorContext => {
        const pane: PreviewPane = iframe === getSecondaryPreviewIframe() ? 'secondary' : 'primary';
        return {
            projectId: selectedEditablePreviewResource?.projectId || projectId,
            resourceId: selectedEditablePreviewResource?.resourceId || selectedEditablePreviewResource?.name,
            documentPath: selectedEditablePreviewResource?.projectDocumentPath
                || selectedEditablePreviewResource?.filePath,
            makeServerOrigin: resolveInjectedMakeServerOrigin(window),
            resourceType,
            pane,
            pageId: normalizePrototypeEditorPageId(selectedPageId) || readPrototypeEditorPageIdFromIframe(iframe),
            mobileMode: resolvePrototypeEditorMobileMode(
                resourceType,
                pane,
                previewConfig,
            ),
        };
    }, [
        getSecondaryPreviewIframe,
        normalizePrototypeEditorPageId,
        previewConfig,
        readPrototypeEditorPageIdFromIframe,
        resourceType,
        selectedEditablePreviewResource,
        selectedPageId,
        projectId,
    ]);

    const buildPrototypeEditorEnableOptions = useCallback((context: PrototypeEditorContext): PrototypeEditorEnableOptions => {
        const commentPageScope = buildPrototypeEditorCommentPageScope(context);
        return {
            toolbarMode: 'host',
            initialDarkMode: isDarkMode,
            mobileMode: context.mobileMode,
            assistantPanelOpen,
            makeServerOrigin: resolveInjectedMakeServerOrigin(window),
            annotationProjectId: context.projectId,
            agentRunConcurrency,
            interactionProfile: getAnnotationSession?.() ? 'annotation' : 'design',
            ...(commentPageScope ? { commentPageScope } : {}),
        };
    }, [
        agentRunConcurrency,
        assistantPanelOpen,
        buildPrototypeEditorCommentPageScope,
        getAnnotationSession,
        isDarkMode,
    ]);

    const buildPrototypeEditorScopedContext = useCallback((context: PrototypeEditorContext): PrototypeEditorContext => {
        const commentPageScope = buildPrototypeEditorCommentPageScope(context);
        return commentPageScope
            ? { ...context, commentPageScope }
            : context;
    }, [buildPrototypeEditorCommentPageScope]);

    const postPrototypeEditorBridgeMessage = useCallback((
        iframe: HTMLIFrameElement,
        payload: Record<string, unknown>,
        options: { retryDelaysMs?: readonly number[] } = {},
    ): Promise<PrototypeEditorBridgeStateMessage | null> => {
        const targetWindow = iframe.contentWindow;
        if (!targetWindow) {
            return Promise.resolve(null);
        }
        const requestId = `prototype-editor-${Date.now()}-${prototypeEditorBridgeRequestSeqRef.current += 1}`;
        const targetUrl = getPreviewIframeTargetUrl(iframe);
        const generation = getPreviewIframeGeneration(iframe);
        if (!targetUrl || generation <= 0) {
            return Promise.resolve(null);
        }
        return postIframeMessageRequest({
            host: {
                hostOrigin: window.location.origin,
                addEventListener: (type, listener) => window.addEventListener(type, listener as unknown as EventListener),
                removeEventListener: (type, listener) => window.removeEventListener(type, listener as unknown as EventListener),
                setTimeout: (callback, delay) => window.setTimeout(callback, delay),
                clearTimeout: (timer) => window.clearTimeout(timer as number),
            },
            targetUrl,
            targetWindow,
            message: {
                ...payload,
                requestId,
            },
            requestId,
            successType: 'AXHUB_PROTOTYPE_EDITOR_STATE',
            timeoutMs: Math.max(PROTOTYPE_EDITOR_BRIDGE_TIMEOUT_MS, 3000),
            retryDelaysMs: options.retryDelaysMs,
            isCurrent: () => iframe.contentWindow === targetWindow
                && getPreviewIframeTargetUrl(iframe) === targetUrl
                && isPreviewIframeAtTargetUrl(iframe, targetUrl)
                && getPreviewIframeGeneration(iframe) === generation
                && getPreviewIframes().includes(iframe),
        }).then((message) => message as PrototypeEditorBridgeStateMessage | null);
    }, [getPreviewIframeGeneration, getPreviewIframeTargetUrl, getPreviewIframes]);

    const postPrototypeEditorEnable = useCallback((
        iframe: HTMLIFrameElement,
        context: PrototypeEditorContext,
    ) => postPrototypeEditorBridgeMessage(iframe, {
        type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE',
        context: buildPrototypeEditorScopedContext(context),
        options: buildPrototypeEditorEnableOptions(context),
    }), [
        buildPrototypeEditorEnableOptions,
        buildPrototypeEditorScopedContext,
        postPrototypeEditorBridgeMessage,
    ]);

    const postPrototypeEditorDisable = useCallback((iframe: HTMLIFrameElement) => (
        postPrototypeEditorBridgeMessage(iframe, {
            type: 'AXHUB_PROTOTYPE_EDITOR_DISABLE',
        })
    ), [postPrototypeEditorBridgeMessage]);

    const postPrototypeEditorHostToolbarAction = useCallback((
        iframe: HTMLIFrameElement,
        action: CommentaryHostToolbarAction,
    ) => postPrototypeEditorBridgeMessage(iframe, {
        type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION',
        action,
        options: buildPrototypeEditorEnableOptions(buildPrototypeEditorContext(iframe)),
    }), [
        buildPrototypeEditorContext,
        buildPrototypeEditorEnableOptions,
        postPrototypeEditorBridgeMessage,
    ]);

    const clearCompletedCommentsForIframe = useCallback(async (
        iframe: HTMLIFrameElement,
        editors?: PrototypeEditorApi | null,
    ) => {
        if (!autoClearCompletedComments) return;
        const clearedLocally = await clearCompletedCommentsImmediately(
            editors ?? getPrototypeEditorApi(iframe),
            true,
        );
        if (clearedLocally) return;
        try {
            await postPrototypeEditorHostToolbarAction(iframe, {
                type: 'clear-edits',
                skipConfirm: true,
                scope: 'page',
                target: 'completed',
            });
        } catch {
            // Cleanup is best-effort and must not block editor entry.
        }
    }, [
        autoClearCompletedComments,
        getPrototypeEditorApi,
        postPrototypeEditorHostToolbarAction,
    ]);

    const postPrototypeEditorSaveAction = useCallback((
        iframe: HTMLIFrameElement,
        action: QuickEditSaveAction,
    ) => postPrototypeEditorBridgeMessage(iframe, {
        type: 'AXHUB_PROTOTYPE_EDITOR_SAVE_ACTION',
        action,
    } satisfies PrototypeEditorSaveActionMessage), [postPrototypeEditorBridgeMessage]);

    const postPrototypeEditorPrepareSave = useCallback((
        iframe: HTMLIFrameElement,
        action: QuickEditSaveAction,
    ) => postPrototypeEditorBridgeMessage(iframe, {
        type: 'AXHUB_PROTOTYPE_EDITOR_PREPARE_SAVE',
        action,
    }), [postPrototypeEditorBridgeMessage]);

    const postPrototypeEditorPreflightSave = useCallback((
        iframe: HTMLIFrameElement,
        draft: QuickEditSaveDraft,
    ) => postPrototypeEditorBridgeMessage(iframe, {
        type: 'AXHUB_PROTOTYPE_EDITOR_PREFLIGHT_SAVE',
        draft,
    }), [postPrototypeEditorBridgeMessage]);

    const postPrototypeEditorCommitSave = useCallback((
        iframe: HTMLIFrameElement,
        draft: QuickEditSaveDraft,
    ) => postPrototypeEditorBridgeMessage(iframe, {
        type: 'AXHUB_PROTOTYPE_EDITOR_COMMIT_SAVE',
        draft,
    }, { retryDelaysMs: [0] }), [postPrototypeEditorBridgeMessage]);

    const postPrototypeEditorNodeEditingState = useCallback((
        iframe: HTMLIFrameElement,
        elementKey: string,
        nextState: PrototypeEditorNodeEditingState,
        taskRef: PrototypeEditorNodeEditingTaskRef,
        targetRef?: PrototypeEditorNodeEditingTargetRef,
    ) => postPrototypeEditorBridgeMessage(iframe, {
        type: 'AXHUB_PROTOTYPE_EDITOR_NODE_EDITING_STATE',
        elementKey,
        nextState,
        taskRef,
        targetRef: targetRef ?? null,
    }), [postPrototypeEditorBridgeMessage]);

    const queryPrototypeEditorState = useCallback((iframe: HTMLIFrameElement) => (
        postPrototypeEditorBridgeMessage(iframe, {
            type: 'AXHUB_PROTOTYPE_EDITOR_QUERY_STATE',
        })
    ), [postPrototypeEditorBridgeMessage]);

    const getPrototypeEditorVoiceTarget = useCallback((
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(null);
        return readPrototypeEditorVoiceTarget({
            editors: getPrototypeEditorApi(iframe),
            queryState: () => queryPrototypeEditorState(iframe),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, queryPrototypeEditorState]);

    const getPrototypeEditorVoiceTargets = useCallback((
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(null);
        return readPrototypeEditorVoiceTargets({
            editors: getPrototypeEditorApi(iframe),
            rpc: (message) => postPrototypeEditorBridgeMessage(iframe, message),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, postPrototypeEditorBridgeMessage]);

    const findVoiceElements = useCallback((
        query: CommentaryPageElementSearchQuery,
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(null);
        return findPrototypeEditorVoiceElements({
            editors: getPrototypeEditorApi(iframe),
            query,
            rpc: (message) => postPrototypeEditorBridgeMessage(iframe, message),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, postPrototypeEditorBridgeMessage]);

    const getVoiceElementStructure = useCallback((
        query: CommentaryPageElementStructureQuery,
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(null);
        return getPrototypeEditorVoiceElementStructure({
            editors: getPrototypeEditorApi(iframe),
            query,
            rpc: (message) => postPrototypeEditorBridgeMessage(iframe, message),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, postPrototypeEditorBridgeMessage]);

    const activateVoiceElement = useCallback((
        targetRef: string,
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(null);
        return activatePrototypeEditorVoiceElement({
            editors: getPrototypeEditorApi(iframe),
            targetRef,
            rpc: (message) => postPrototypeEditorBridgeMessage(iframe, message),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, postPrototypeEditorBridgeMessage]);

    const createVoiceComment = useCallback((
        targetRef: string,
        content: string,
        options: CommentaryVoiceCommentOptions,
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(null);
        return createPrototypeEditorVoiceComment({
            editors: getPrototypeEditorApi(iframe),
            targetRef,
            content,
            options,
            rpc: (message) => postPrototypeEditorBridgeMessage(iframe, message, {
                retryDelaysMs: [0],
            }),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, postPrototypeEditorBridgeMessage]);

    const refreshVoiceComments = useCallback((
        deletedCommentIds?: readonly string[],
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(false);
        return refreshPrototypeEditorVoiceComments({
            editors: getPrototypeEditorApi(iframe),
            deletedCommentIds,
            rpc: (message) => postPrototypeEditorBridgeMessage(iframe, message),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, postPrototypeEditorBridgeMessage]);

    const subscribePrototypeEditorVoiceTargets = useCallback(async (
        listener: (targets: CommentaryVoiceTargets) => void,
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ): Promise<() => void> => {
        if (!iframe) return () => undefined;
        const editors = getPrototypeEditorApi(iframe);
        if (typeof editors?.subscribeVoiceTargets === 'function') {
            try {
                return editors.subscribeVoiceTargets(listener);
            } catch {
                // Fall through after a same-origin preview navigation.
            }
        }
        const subscriptionGeneration = getPreviewIframeGeneration(iframe);
        if (subscriptionGeneration <= 0) return () => undefined;
        const subscriptionId = `voice-targets-${Date.now()}-${prototypeEditorBridgeRequestSeqRef.current += 1}`;
        const response = await postPrototypeEditorBridgeMessage(iframe, {
            type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_SUBSCRIBE_TARGETS',
            subscriptionId,
        });
        if (!response?.success || response.subscriptionId !== subscriptionId) {
            return () => undefined;
        }
        if (response.voiceTargets) listener(response.voiceTargets);
        const handleTargets = (event: MessageEvent) => {
            if (isPrototypeEditorVoiceTargetsEvent(
                event,
                iframe,
                getIframeOrigin(iframe),
                subscriptionId,
                getPreviewIframeGeneration(iframe),
                subscriptionGeneration,
            )) {
                listener(event.data.voiceTargets);
            }
        };
        window.addEventListener('message', handleTargets);
        return () => {
            window.removeEventListener('message', handleTargets);
            if (getPreviewIframeGeneration(iframe) !== subscriptionGeneration) return;
            void postPrototypeEditorBridgeMessage(iframe, {
                type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_UNSUBSCRIBE_TARGETS',
                subscriptionId,
            }, { retryDelaysMs: [0] });
        };
    }, [
        getIframeOrigin,
        getPrimaryPreviewIframe,
        getPreviewIframeGeneration,
        getPrototypeEditorApi,
        postPrototypeEditorBridgeMessage,
    ]);

    const validateEditingTarget = useCallback((
        elementKey: string,
        targetRef: CommentaryExternalEditingTargetRef | null,
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe) return Promise.resolve(false);
        return validatePrototypeEditorEditingTarget({
            editors: getPrototypeEditorApi(iframe),
            elementKey,
            targetRef,
            rpc: (message) => postPrototypeEditorBridgeMessage(iframe, message),
        });
    }, [getPrimaryPreviewIframe, getPrototypeEditorApi, postPrototypeEditorBridgeMessage]);

    const enterPrototypeEditor = useCallback(async (
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
        options: PrototypeEditorEnterOptions = {},
    ) => {
        if (!iframe?.contentWindow) {
            if (options.showMissingWarning !== false) {
                messageApi.warning('未找到可操作的预览窗口');
            }
            return false;
        }
        const context = buildPrototypeEditorContext(iframe);
        const enableEditors = async (resolvedEditors: PrototypeEditorApi) => {
            if (!resolvedEditors.enable) {
                return false;
            }
            resolvedEditors.setContext?.(buildPrototypeEditorScopedContext(context));
            await Promise.resolve(resolvedEditors.enable('webEditorV2', buildPrototypeEditorEnableOptions(context)));
            await clearCompletedCommentsForIframe(iframe, resolvedEditors);

            if (context.pane === 'primary') {
                prototypeHostToolbarUnsubscribeRef.current?.();
                prototypeHostToolbarUnsubscribeRef.current = resolvedEditors.subscribeHostToolbarState?.((nextState) => {
                    setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(
                        previousState,
                        nextState,
                        isDarkModeRef.current,
                    ));
                }) ?? null;
                const nextState = resolvedEditors.getHostToolbarState?.() ?? createDefaultHostToolbarState();
                setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));
            }

            return true;
        };

        let editors = getPrototypeEditorApi(iframe);
        if (editors?.enable) {
            return enableEditors(editors);
        }

        editors = await ensureHtmlDocumentPreviewEditorApi(iframe);
        if (editors?.enable) {
            return enableEditors(editors);
        }

        const bridgeResult = await postPrototypeEditorEnable(iframe, context);
        if (bridgeResult?.hostToolbarState && context.pane === 'primary') {
            setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, bridgeResult.hostToolbarState ?? null, isDarkMode));
        } else if (bridgeResult?.success && context.pane === 'primary') {
            setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, createDefaultHostToolbarState(), isDarkMode));
        }
        if (bridgeResult?.success) {
            await clearCompletedCommentsForIframe(iframe);
            // Schedule a delayed state sync to catch async host editor connection.
            // The initial enable response may have robotState:'sleeping' because the
            // bridge hasn't connected yet. This re-query catches the state update.
            const DELAYED_STATE_SYNC_MS = 2500;
            window.setTimeout(async () => {
                if (!iframe.contentWindow || iframe !== getPrimaryPreviewIframe()) return;
                const syncResult = await queryPrototypeEditorState(iframe);
                if (syncResult?.hostToolbarState && iframe === getPrimaryPreviewIframe()) {
                    setHostToolbarState((prev) =>
                        resolveHostToolbarStateForDisplay(prev, syncResult.hostToolbarState ?? null, isDarkModeRef.current),
                    );
                }
            }, DELAYED_STATE_SYNC_MS);
            return true;
        }
        if (options.showMissingWarning !== false) {
            messageApi.warning('当前客户端页面尚未接入真正的快速编辑器，请确认预览页已加载 DevTemplateBootstrap 或 HtmlTemplateBootstrap');
        }
        return false;
    }, [
        buildPrototypeEditorContext,
        buildPrototypeEditorEnableOptions,
        buildPrototypeEditorScopedContext,
        getPrimaryPreviewIframe,
        getPrototypeEditorApi,
        isDarkModeRef,
        messageApi,
        postPrototypeEditorEnable,
        clearCompletedCommentsForIframe,
        prototypeHostToolbarUnsubscribeRef,
        queryPrototypeEditorState,
        setHostToolbarState,
    ]);

    useEffect(() => {
        const handlePrototypeEditorBridgeMessage = (event: MessageEvent) => {
            if (event.data?.type !== 'AXHUB_PROTOTYPE_EDITOR_STATE') {
                return;
            }
            const message = event.data as PrototypeEditorBridgeStateMessage;
            const targetIframe = getPreviewIframes().find((iframe) => iframe.contentWindow === event.source)
                ?? null;
            if (!targetIframe || event.source !== targetIframe.contentWindow) {
                return;
            }
            if (event.origin !== getIframeOrigin(targetIframe)) {
                return;
            }
            if (message.hostToolbarState && targetIframe === getPrimaryPreviewIframe()) {
                setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(
                    previousState,
                    message.hostToolbarState ?? null,
                    isDarkModeRef.current,
                ));
            }
        };

        window.addEventListener('message', handlePrototypeEditorBridgeMessage);
        return () => window.removeEventListener('message', handlePrototypeEditorBridgeMessage);
    }, [
        getIframeOrigin,
        getPreviewIframes,
        getPrimaryPreviewIframe,
        isDarkModeRef,
        setHostToolbarState,
    ]);

    const enterPrototypeEditorPanelOnly = useCallback(async (
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe?.contentWindow) {
            return false;
        }
        const editors = getPrototypeEditorApi(iframe);
        if (editors?.enablePanelOnly) {
            const context = buildPrototypeEditorContext(iframe);
            editors.setContext?.(buildPrototypeEditorScopedContext(context));
            await Promise.resolve(editors.enablePanelOnly(buildPrototypeEditorEnableOptions(context)));
            await clearCompletedCommentsForIframe(iframe, editors);

            prototypeHostToolbarUnsubscribeRef.current?.();
            prototypeHostToolbarUnsubscribeRef.current = editors.subscribeHostToolbarState?.((nextState) => {
                setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(
                    previousState,
                    nextState,
                    isDarkModeRef.current,
                ));
            }) ?? null;
            const nextState = editors.getHostToolbarState?.() ?? createDefaultHostToolbarState();
            setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));

            return true;
        }
        // Fallback: bridge message for panel-only mode
        const context = buildPrototypeEditorContext(iframe);
        const bridgeResult = await postPrototypeEditorBridgeMessage(iframe, {
            type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE_PANEL_ONLY',
            context: buildPrototypeEditorScopedContext(context),
            options: buildPrototypeEditorEnableOptions(context),
        });
        if (bridgeResult?.success) {
            await clearCompletedCommentsForIframe(iframe);
            if (bridgeResult.hostToolbarState) {
                setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, bridgeResult.hostToolbarState ?? null, isDarkMode));
            }
            return true;
        }
        return false;
    }, [
        getPrototypeEditorApi,
        getPrimaryPreviewIframe,
        buildPrototypeEditorContext,
        buildPrototypeEditorEnableOptions,
        buildPrototypeEditorScopedContext,
        clearCompletedCommentsForIframe,
        isDarkMode,
        isDarkModeRef,
        postPrototypeEditorBridgeMessage,
        prototypeHostToolbarUnsubscribeRef,
        setHostToolbarState,
    ]);

    const exitPrototypeEditorPanelOnly = useCallback((
        iframe: HTMLIFrameElement | null = getPrimaryPreviewIframe(),
    ) => {
        if (!iframe?.contentWindow) return;
        const editors = getPrototypeEditorApi(iframe);
        if (editors?.disablePanelOnly) {
            editors.disablePanelOnly();
        } else {
            void postPrototypeEditorBridgeMessage(iframe, {
                type: 'AXHUB_PROTOTYPE_EDITOR_DISABLE_PANEL_ONLY',
            });
        }
        prototypeHostToolbarUnsubscribeRef.current?.();
        prototypeHostToolbarUnsubscribeRef.current = null;
        setHostToolbarState(null);
    }, [
        getPrototypeEditorApi,
        getPrimaryPreviewIframe,
        postPrototypeEditorBridgeMessage,
        prototypeHostToolbarUnsubscribeRef,
        setHostToolbarState,
    ]);

    return {
        getPrototypeEditorApi,
        enterPrototypeEditor,
        enterPrototypeEditorPanelOnly,
        exitPrototypeEditorPanelOnly,
        postPrototypeEditorDisable,
        postPrototypeEditorHostToolbarAction,
        postPrototypeEditorSaveAction,
        postPrototypeEditorPrepareSave,
        postPrototypeEditorPreflightSave,
        postPrototypeEditorCommitSave,
        postPrototypeEditorNodeEditingState,
        queryPrototypeEditorState,
        getPrototypeEditorVoiceTarget,
        getPrototypeEditorVoiceTargets,
        findPrototypeEditorVoiceElements: findVoiceElements,
        getPrototypeEditorVoiceElementStructure: getVoiceElementStructure,
        activatePrototypeEditorVoiceElement: activateVoiceElement,
        createPrototypeEditorVoiceComment: createVoiceComment,
        refreshPrototypeEditorVoiceComments: refreshVoiceComments,
        validatePrototypeEditorEditingTarget: validateEditingTarget,
        subscribePrototypeEditorVoiceTargets,
    };
}
