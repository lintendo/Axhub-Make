import { useEffect, useRef } from 'react';

import { buildMainPreviewIframeUrl, buildProjectPrototypeIframeUrl, buildSameOriginRuntimePreviewUrl, buildPrototypePageHashUrl } from '../../app/index-page/previewActions.helpers';
import type { ResourceDeepLinkTarget } from '../../app/index-page/resourceDeepLink';

export type PreviewResourceType = 'prototype' | 'theme' | 'doc' | 'image' | 'template' | 'resource';
export type PreviewViewportPreset = 'desktop' | 'tablet' | 'mobile';

export interface PreviewViewport {
    id: string;
    width: number;
    height: number;
}

export interface PreviewCaptureTargetInput {
    resourceType?: PreviewResourceType | string;
    resourceId?: string;
    canvasElementId?: string;
    url?: string;
}

export interface PreviewCanvasSelection {
    elementId: string;
    customData?: Record<string, unknown>;
    previewUrl?: string;
    openUrl?: string;
    resourceType?: string;
    resourceId?: string;
    previewKind?: string;
    title?: string;
}

export interface PreviewHostContext {
    projectId?: string | null;
    activeTab?: string;
    viewMode?: string;
    contentMode?: string;
    selectedItem?: any;
    selectedPageId?: string | null;
    selectedDoc?: any;
    selectedTemplate?: any;
    selectedTheme?: any;
    selectedCanvas?: any;
    currentUrl?: string;
    canvasSelection?: PreviewCanvasSelection | null;
    resources?: {
        prototypes?: any[];
        docs?: any[];
        templates?: any[];
        themes?: any[];
    };
}

export interface ResolvedPreviewCaptureTarget {
    kind: 'current' | 'resource' | 'canvasElement' | 'url';
    url: string;
    resourceType?: string;
    resourceId?: string;
    pageId?: string;
    filePath?: string;
    canvasElementId?: string;
    previewKind?: string;
    title?: string;
}

export interface PreviewCaptureArgs {
    target?: PreviewCaptureTargetInput;
    viewports?: PreviewViewportPreset | PreviewViewport | Array<PreviewViewportPreset | PreviewViewport>;
    waitSeconds?: number;
}

export type PreviewNavigateResourceType = 'prototype' | 'canvas' | 'doc' | 'template' | 'theme';

export interface PreviewNavigateTargetInput {
    resourceType?: PreviewNavigateResourceType | string;
    resourceId?: string;
    pageId?: string;
    collapseSidebar?: boolean;
    projectId?: unknown;
    url?: unknown;
}

export interface PreviewNavigateArgs {
    target?: PreviewNavigateTargetInput;
    projectId?: unknown;
    url?: unknown;
}

export interface ResolvedPreviewNavigateTarget {
    resourceType: PreviewNavigateResourceType;
    resourceId: string;
    pageId?: string;
    collapseSidebar: boolean;
    resource: any;
    deepLinkTarget: ResourceDeepLinkTarget;
}

export interface PreviewCaptureScreenshot {
    viewportId: string;
    width: number;
    height: number;
    dataUrl: string;
    mimeType: string;
    [key: string]: unknown;
}

export interface PreviewCaptureResult {
    target: ResolvedPreviewCaptureTarget;
    viewports: PreviewViewport[];
    waitSeconds: number;
    screenshots: PreviewCaptureScreenshot[];
    diagnostics: PreviewDiagnostic[];
    capturedAt: string;
}

export interface PreviewBridgeMessage {
    type: 'preview.register' | 'preview.command.request' | 'preview.command.result' | 'ping' | 'pong' | 'hello';
    requestId?: string;
    command?: string;
    timeoutMs?: number;
    ok?: boolean;
    error?: {
        code: string;
        message: string;
    };
    payload?: unknown;
}

export interface PreviewDiagnostic {
    level: 'info' | 'warning' | 'error';
    type: string;
    message: string;
    timestamp: string;
    details?: unknown;
}

interface PreviewCaptureError extends Error {
    diagnostics?: PreviewDiagnostic[];
}

export interface PreviewCaptureIframeParams {
    iframe: HTMLIFrameElement;
    target: ResolvedPreviewCaptureTarget;
    viewport: PreviewViewport;
    diagnostics: PreviewDiagnostic[];
}

export interface RunPreviewCaptureOptions {
    context: PreviewHostContext;
    args?: PreviewCaptureArgs;
    captureIframe?: (params: PreviewCaptureIframeParams) => Promise<Omit<PreviewCaptureScreenshot, 'viewportId'>>;
    waitForReady?: (iframe: HTMLIFrameElement, target: ResolvedPreviewCaptureTarget, diagnostics: PreviewDiagnostic[]) => Promise<void>;
    settleFrame?: (iframe: HTMLIFrameElement, diagnostics: PreviewDiagnostic[]) => Promise<void>;
    sleep?: (ms: number) => Promise<void>;
}

export interface RunPreviewNavigateOptions {
    context: PreviewHostContext;
    args?: PreviewNavigateArgs;
    onNavigate?: (target: ResolvedPreviewNavigateTarget) => Promise<PreviewHostContext | void> | PreviewHostContext | void;
}

export interface UsePreviewBridgeHostOptions {
    context: PreviewHostContext;
    enabled?: boolean;
    onNavigate?: RunPreviewNavigateOptions['onNavigate'];
    /** Handles opt-in Make Commentary tool calls forwarded from the existing preview MCP. */
    onVoiceToolCommand?: (command: {
        name: string;
        input: unknown;
        requestId: string;
    }) => Promise<unknown> | unknown;
}

const PREVIEW_VIEWPORT_PRESETS: Record<PreviewViewportPreset, PreviewViewport> = {
    desktop: { id: 'desktop', width: 1440, height: 900 },
    tablet: { id: 'tablet', width: 820, height: 1180 },
    mobile: { id: 'mobile', width: 393, height: 852 },
};

class PreviewNavigateError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'PreviewNavigateError';
        this.code = code;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeSize(value: unknown, fallback: number): number {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
        return fallback;
    }
    return Math.max(1, Math.round(numberValue));
}

function normalizeResourceId(value: unknown): string {
    return normalizeString(value).replace(/\\/g, '/');
}

function getRuntimeOrigin(): string {
    if (typeof window === 'undefined') return '';
    return normalizeString((window as unknown as Record<string, unknown>).__RUNTIME_ORIGIN__).replace(/\/+$/u, '');
}

function getWindowOrigin(): string {
    if (typeof window === 'undefined') return 'http://localhost';
    return window.location?.origin || 'http://localhost';
}

function getCurrentUrlFallback(): string {
    if (typeof window === 'undefined') return '';
    return window.location?.href || '';
}

function sameOriginPreviewUrl(rawUrl: string, resourceType?: string): string {
    const url = normalizeString(rawUrl);
    if (!url) return '';
    if (resourceType === 'prototype' || resourceType === 'theme') {
        return buildSameOriginRuntimePreviewUrl(url);
    }
    try {
        return new URL(url, getWindowOrigin()).toString();
    } catch {
        return url;
    }
}

function getResourceId(resource: any): string {
    return normalizeResourceId(resource?.resourceId || resource?.name || resource?.id);
}

function getResourceFilePath(resource: any): string {
    return normalizeString(resource?.filePath)
        || normalizeString(resource?.path)
        || normalizeString(resource?.absoluteFilePath);
}

function getCurrentResourceType(context: PreviewHostContext): string {
    if (context.contentMode === 'theme') return 'theme';
    if (context.contentMode === 'doc') return 'doc';
    if (context.contentMode === 'template') return 'template';
    if (context.contentMode === 'canvas') return 'canvas';
    if (context.contentMode === 'preview' && context.viewMode === 'canvas') return 'canvas';
    return 'prototype';
}

function getCurrentResource(context: PreviewHostContext): any {
    if (context.contentMode === 'theme') return context.selectedTheme;
    if (context.contentMode === 'doc') return context.selectedDoc;
    if (context.contentMode === 'template') return context.selectedTemplate;
    if (context.contentMode === 'canvas') return context.selectedCanvas;
    return context.selectedItem;
}

function buildCurrentPreviewUrl(context: PreviewHostContext): string {
    if (context.contentMode === 'theme') {
        return sameOriginPreviewUrl(buildMainPreviewIframeUrl(context.selectedTheme), 'theme');
    }
    if (context.contentMode === 'doc') {
        return sameOriginPreviewUrl(context.selectedDoc?.previewUrl || context.selectedDoc?.specUrl || '', 'doc');
    }
    if (context.contentMode === 'template') {
        return sameOriginPreviewUrl(context.selectedTemplate?.previewUrl || context.selectedTemplate?.specUrl || '', 'template');
    }
    if (context.viewMode === 'canvas') {
        return '';
    }
    return sameOriginPreviewUrl(
        buildProjectPrototypeIframeUrl(context.selectedItem, undefined, context.selectedPageId),
        'prototype',
    );
}

function findResource(context: PreviewHostContext, resourceType: string, resourceId: string): any {
    const normalizedId = normalizeResourceId(resourceId);
    const resources = context.resources || {};
    const candidates = resourceType === 'theme'
        ? resources.themes || []
        : resourceType === 'doc' || resourceType === 'image'
            ? resources.docs || []
            : resourceType === 'template'
                ? resources.templates || []
                : resources.prototypes || [];
    return candidates.find((item) => (
        normalizeResourceId(item?.resourceId) === normalizedId
        || normalizeResourceId(item?.name) === normalizedId
        || normalizeResourceId(item?.id) === normalizedId
    ));
}

function buildResourcePreviewUrl(resourceType: string, resource: any, pageId?: string | null): string {
    if (!resource) return '';
    if (resourceType === 'theme') {
        return sameOriginPreviewUrl(buildMainPreviewIframeUrl(resource), 'theme');
    }
    if (resourceType === 'doc' || resourceType === 'image' || resourceType === 'template') {
        return sameOriginPreviewUrl(resource.previewUrl || resource.specUrl || resource.clientUrl || '', resourceType);
    }
    return sameOriginPreviewUrl(buildProjectPrototypeIframeUrl(resource, undefined, pageId), 'prototype');
}

function getCanvasSelectionData(context: PreviewHostContext, canvasElementId?: string): PreviewCanvasSelection | null {
    const selection = context.canvasSelection || null;
    if (!selection) return null;
    const requestedId = normalizeString(canvasElementId);
    if (requestedId && selection.elementId !== requestedId) {
        return null;
    }
    return selection;
}

function resolveCanvasSelectionField(selection: PreviewCanvasSelection, key: string): string {
    return normalizeString((selection.customData || {})[key])
        || normalizeString((selection as unknown as Record<string, unknown>)[key]);
}

export function normalizePreviewCaptureViewports(input: PreviewCaptureArgs['viewports']): PreviewViewport[] {
    const items = input === undefined
        ? ['desktop']
        : Array.isArray(input)
            ? input
            : [input];
    const normalized = items
        .map((item) => {
            if (typeof item === 'string' && item in PREVIEW_VIEWPORT_PRESETS) {
                return { ...PREVIEW_VIEWPORT_PRESETS[item as PreviewViewportPreset] };
            }
            if (isRecord(item)) {
                const width = normalizeSize(item.width, 0);
                const height = normalizeSize(item.height, 0);
                if (!width || !height) return null;
                const explicitId = normalizeString(item.id);
                return {
                    id: explicitId || `custom-${width}x${height}`,
                    width,
                    height,
                };
            }
            return null;
        })
        .filter((item): item is PreviewViewport => Boolean(item));
    return normalized.length > 0 ? normalized : [{ ...PREVIEW_VIEWPORT_PRESETS.desktop }];
}

export function clampPreviewWaitSeconds(value: unknown): number {
    if (value === undefined || value === null || value === '') return 0.5;
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numberValue)) return 0.5;
    return Math.min(30, Math.max(0, numberValue));
}

export function createPreviewBridgeCurrentContext(context: PreviewHostContext): Record<string, unknown> {
    const resourceType = getCurrentResourceType(context);
    const resource = getCurrentResource(context);
    const pageId = resourceType === 'prototype' ? normalizeString(context.selectedPageId) : '';
    const url = buildCurrentPreviewUrl(context) || normalizeString(context.currentUrl) || getCurrentUrlFallback();
    return {
        projectId: normalizeString(context.projectId),
        activeTab: context.activeTab,
        viewMode: context.viewMode,
        contentMode: context.contentMode,
        resourceType,
        resourceId: getResourceId(resource),
        displayName: normalizeString(resource?.displayName || resource?.name),
        filePath: getResourceFilePath(resource),
        url,
        ...(pageId ? { pageId } : {}),
        canvasSelection: context.canvasSelection || null,
    };
}

export function resolvePreviewCaptureTarget(
    input: PreviewCaptureTargetInput | null | undefined,
    context: PreviewHostContext,
): ResolvedPreviewCaptureTarget {
    const target = input && typeof input === 'object' ? input : {};
    const explicitUrl = normalizeString(target.url);
    if (explicitUrl) {
        return {
            kind: 'url',
            url: sameOriginPreviewUrl(explicitUrl, normalizeString(target.resourceType)),
            ...(target.resourceType ? { resourceType: normalizeString(target.resourceType) } : {}),
            ...(target.resourceId ? { resourceId: normalizeResourceId(target.resourceId) } : {}),
        };
    }

    const canvasElementId = normalizeString(target.canvasElementId);
    const shouldUseCurrentCanvasSelection = !explicitUrl
        && !canvasElementId
        && !normalizeString(target.resourceType)
        && !normalizeResourceId(target.resourceId)
        && context.contentMode === 'canvas'
        && Boolean(context.canvasSelection);
    if (canvasElementId || shouldUseCurrentCanvasSelection) {
        const selection = getCanvasSelectionData(context, canvasElementId);
        if (!selection) {
            throw new Error(`Canvas preview element "${canvasElementId}" is not selected or unavailable.`);
        }
        const resourceType = resolveCanvasSelectionField(selection, 'resourceType');
        const resourceId = resolveCanvasSelectionField(selection, 'resourceId');
        const previewKind = resolveCanvasSelectionField(selection, 'previewKind');
        const rawPreviewUrl = resolveCanvasSelectionField(selection, 'previewUrl')
            || resolveCanvasSelectionField(selection, 'openUrl');
        if (!rawPreviewUrl) {
            throw new Error(`Canvas preview element "${canvasElementId}" does not expose a preview URL.`);
        }
        return {
            kind: 'canvasElement',
            url: sameOriginPreviewUrl(rawPreviewUrl, resourceType),
            canvasElementId: canvasElementId || selection.elementId,
            ...(resourceType ? { resourceType } : {}),
            ...(resourceId ? { resourceId } : {}),
            ...(previewKind ? { previewKind } : {}),
            ...(resolveCanvasSelectionField(selection, 'title') ? { title: resolveCanvasSelectionField(selection, 'title') } : {}),
        };
    }

    const resourceType = normalizeString(target.resourceType);
    const resourceId = normalizeResourceId(target.resourceId);
    if (resourceType && resourceId) {
        const resource = findResource(context, resourceType, resourceId);
        if (!resource) {
            throw new Error(`Preview resource "${resourceType}:${resourceId}" was not found in the current project context.`);
        }
        return {
            kind: 'resource',
            url: buildResourcePreviewUrl(resourceType, resource, context.selectedPageId),
            resourceType,
            resourceId: getResourceId(resource) || resourceId,
            filePath: getResourceFilePath(resource),
            ...(resourceType === 'prototype' && context.selectedPageId ? { pageId: context.selectedPageId } : {}),
        };
    }

    const current = createPreviewBridgeCurrentContext(context);
    const currentUrl = normalizeString(current.url);
    if (!currentUrl) {
        throw new Error('Current preview context does not have a capture URL.');
    }
    return {
        kind: 'current',
        url: currentUrl,
        resourceType: normalizeString(current.resourceType),
        resourceId: normalizeResourceId(current.resourceId),
        filePath: normalizeString(current.filePath),
        ...(normalizeString(current.pageId) ? { pageId: normalizeString(current.pageId) } : {}),
    };
}

function assertNoForbiddenNavigateFields(args: PreviewNavigateArgs, target: PreviewNavigateTargetInput): void {
    if (hasNestedField(args, 'projectId')) {
        throw new PreviewNavigateError('invalid_target', 'projectId is not supported by preview_navigate.');
    }
    if (hasNestedField(args, 'url')) {
        throw new PreviewNavigateError('invalid_target', 'url is not supported by preview_navigate.');
    }
}

function hasNestedField(value: unknown, fieldName: string): boolean {
    if (Array.isArray(value)) {
        return value.some((item) => hasNestedField(item, fieldName));
    }
    if (!isRecord(value)) {
        return false;
    }
    if (Object.prototype.hasOwnProperty.call(value, fieldName)) {
        return true;
    }
    return Object.values(value).some((item) => hasNestedField(item, fieldName));
}

function normalizePreviewNavigateResourceType(value: unknown): PreviewNavigateResourceType {
    const resourceType = normalizeString(value);
    if (
        resourceType === 'prototype'
        || resourceType === 'canvas'
        || resourceType === 'doc'
        || resourceType === 'template'
        || resourceType === 'theme'
    ) {
        return resourceType;
    }
    throw new PreviewNavigateError('invalid_target', `Unsupported preview navigation resource type "${resourceType}".`);
}

function buildNavigateDeepLinkTarget(params: {
    resourceType: PreviewNavigateResourceType;
    resourceId: string;
    pageId: string;
    collapseSidebar: boolean;
}): ResourceDeepLinkTarget {
    if (params.resourceType === 'canvas') {
        return {
            resourceType: 'prototype',
            resourceId: params.resourceId,
            view: 'canvas',
            collapseSidebar: params.collapseSidebar,
        };
    }
    if (params.resourceType === 'prototype') {
        return {
            resourceType: 'prototype',
            resourceId: params.resourceId,
            view: 'demo',
            ...(params.pageId ? { pageId: params.pageId } : {}),
            collapseSidebar: params.collapseSidebar,
        };
    }
    return {
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        collapseSidebar: params.collapseSidebar,
    };
}

export function resolvePreviewNavigateTarget(
    input: PreviewNavigateArgs | null | undefined,
    context: PreviewHostContext,
): ResolvedPreviewNavigateTarget {
    const args = input && typeof input === 'object' ? input : {};
    const target = isRecord(args.target) ? args.target as PreviewNavigateTargetInput : {};
    assertNoForbiddenNavigateFields(args, target);

    if (!isRecord(args.target)) {
        throw new PreviewNavigateError('invalid_target', 'preview_navigate requires a target object.');
    }

    const resourceType = normalizePreviewNavigateResourceType(target.resourceType);
    const resourceId = normalizeResourceId(target.resourceId);
    if (!resourceId) {
        throw new PreviewNavigateError('invalid_target', 'preview_navigate requires target.resourceId.');
    }

    const lookupType = resourceType === 'canvas' ? 'prototype' : resourceType;
    const resource = findResource(context, lookupType, resourceId);
    if (!resource) {
        throw new PreviewNavigateError('resource_not_found', `Preview navigation resource was not found: ${resourceType}:${resourceId}.`);
    }

    const resolvedResourceId = getResourceId(resource) || resourceId;
    const pageId = resourceType === 'prototype' ? normalizeString(target.pageId) : '';
    const collapseSidebar = Boolean(target.collapseSidebar);
    return {
        resourceType,
        resourceId: resolvedResourceId,
        ...(pageId ? { pageId } : {}),
        collapseSidebar,
        resource,
        deepLinkTarget: buildNavigateDeepLinkTarget({
            resourceType,
            resourceId: resolvedResourceId,
            pageId,
            collapseSidebar,
        }),
    };
}

export async function runPreviewNavigate(options: RunPreviewNavigateOptions): Promise<Record<string, unknown>> {
    const target = resolvePreviewNavigateTarget(options.args, options.context);
    if (!options.onNavigate) {
        throw new PreviewNavigateError('navigation_unavailable', 'Preview navigation is not available in this Admin host.');
    }
    const nextContext = await options.onNavigate(target);
    return {
        navigated: true,
        current: createPreviewBridgeCurrentContext(nextContext || options.context),
    };
}

function createHiddenPreviewIframe(target: ResolvedPreviewCaptureTarget): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', target.url);
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    Object.assign(iframe.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: `${PREVIEW_VIEWPORT_PRESETS.desktop.width}px`,
        height: `${PREVIEW_VIEWPORT_PRESETS.desktop.height}px`,
        opacity: '0',
        pointerEvents: 'none',
        border: '0',
        visibility: 'hidden',
    });
    document.body.appendChild(iframe);
    return iframe;
}

function pushDiagnostic(
    diagnostics: PreviewDiagnostic[],
    diagnostic: Omit<PreviewDiagnostic, 'timestamp'> & { timestamp?: string },
): void {
    diagnostics.push({
        ...diagnostic,
        timestamp: diagnostic.timestamp || new Date().toISOString(),
    });
}

function collectCaptureDiagnostics(
    iframe: HTMLIFrameElement,
    diagnostics: PreviewDiagnostic[],
): () => void {
    const targetWindow = iframe.contentWindow;
    const handleMessage = (event: MessageEvent) => {
        if (targetWindow && event.source !== targetWindow) return;
        const data = event.data as Record<string, unknown> | null;
        if (!data || typeof data !== 'object') return;
        const messageType = normalizeString(data.type);
        if (!messageType.startsWith('axhub.quickEdit.')) return;
        if (!messageType.includes('error') && !messageType.includes('diagnostic')) return;
        pushDiagnostic(diagnostics, {
            level: 'error',
            type: messageType,
            message: normalizeString(data.message)
                || normalizeString(data.error)
                || normalizeString((data.payload as Record<string, unknown> | undefined)?.message)
                || messageType,
            details: data,
        });
    };
    const handleIframeLoad = () => {
        try {
            iframe.contentWindow?.addEventListener('error', handleFrameError);
            iframe.contentWindow?.addEventListener('unhandledrejection', handleFrameRejection);
        } catch {
            // Cross-origin errors are ignored; capture itself requires same-origin before observation.
        }
    };
    const handleFrameError = (event: ErrorEvent) => {
        pushDiagnostic(diagnostics, {
            level: 'error',
            type: 'runtime-error',
            message: event.message || 'Preview iframe runtime error.',
            details: {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            },
        });
    };
    const handleFrameRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        pushDiagnostic(diagnostics, {
            level: 'error',
            type: 'unhandled-rejection',
            message: reason instanceof Error ? reason.message : String(reason || 'Preview iframe unhandled rejection.'),
        });
    };

    window.addEventListener('message', handleMessage);
    iframe.addEventListener('load', handleIframeLoad);
    handleIframeLoad();

    return () => {
        window.removeEventListener('message', handleMessage);
        iframe.removeEventListener('load', handleIframeLoad);
        try {
            iframe.contentWindow?.removeEventListener('error', handleFrameError);
            iframe.contentWindow?.removeEventListener('unhandledrejection', handleFrameRejection);
        } catch {
            // noop
        }
    };
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setIframeViewport(iframe: HTMLIFrameElement, viewport: PreviewViewport): void {
    iframe.style.width = `${viewport.width}px`;
    iframe.style.height = `${viewport.height}px`;
    try {
        iframe.width = String(viewport.width);
        iframe.height = String(viewport.height);
    } catch {
        // ignore readonly test doubles
    }
}

export async function runPreviewCapture(options: RunPreviewCaptureOptions): Promise<PreviewCaptureResult> {
    const target = resolvePreviewCaptureTarget(options.args?.target, options.context);
    const viewports = normalizePreviewCaptureViewports(options.args?.viewports);
    const waitSeconds = clampPreviewWaitSeconds(options.args?.waitSeconds);
    const diagnostics: PreviewDiagnostic[] = [];
    const iframe = createHiddenPreviewIframe(target);
    const stopCollectingDiagnostics = collectCaptureDiagnostics(iframe, diagnostics);
    const sleep = options.sleep || defaultSleep;
    const waitForReady = options.waitForReady || defaultWaitForPreviewReady;
    const settleFrame = options.settleFrame || defaultSettlePreviewFrame;
    const captureIframe = options.captureIframe || captureIframeViaQuickEditRuntime;

    try {
        await waitForReady(iframe, target, diagnostics);
        const screenshots: PreviewCaptureScreenshot[] = [];
        for (const viewport of viewports) {
            setIframeViewport(iframe, viewport);
            await settleFrame(iframe, diagnostics);
            if (waitSeconds > 0) {
                await sleep(waitSeconds * 1000);
            }
            const screenshot = await captureIframe({ iframe, target, viewport, diagnostics });
            screenshots.push({
                viewportId: viewport.id,
                width: screenshot.width,
                height: screenshot.height,
                dataUrl: screenshot.dataUrl,
                mimeType: screenshot.mimeType || 'image/png',
                ...screenshot,
            });
        }
        return {
            target,
            viewports,
            waitSeconds,
            screenshots,
            diagnostics,
            capturedAt: new Date().toISOString(),
        };
    } catch (error) {
        diagnostics.push({
            level: 'error',
            type: 'capture-error',
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        });
        if (error && typeof error === 'object') {
            (error as PreviewCaptureError).diagnostics = [...diagnostics];
        }
        throw error;
    } finally {
        stopCollectingDiagnostics();
        iframe.remove();
    }
}

function getSameOriginDocument(iframe: HTMLIFrameElement): Document {
    try {
        const doc = iframe.contentDocument;
        if (!doc) throw new Error('missing contentDocument');
        return doc;
    } catch (error) {
        throw new Error(`Preview capture requires a same-origin iframe (${String(error)})`);
    }
}

function getIframeCurrentUrl(iframe: HTMLIFrameElement, doc: Document): string {
    try {
        return iframe.contentWindow?.location.href || doc.location?.href || '';
    } catch {
        return doc.location?.href || '';
    }
}

function normalizeComparableUrl(value: string): string {
    try {
        const url = new URL(value, getWindowOrigin());
        url.pathname = url.pathname.replace(/\/+$/u, '');
        return url.toString();
    } catch {
        return value;
    }
}

function hasIframeReachedTarget(iframe: HTMLIFrameElement, doc: Document, target: ResolvedPreviewCaptureTarget): boolean {
    const currentUrl = getIframeCurrentUrl(iframe, doc);
    if (!target.url || target.url === 'about:blank') return true;
    return normalizeComparableUrl(currentUrl) === normalizeComparableUrl(target.url);
}

function waitForIframeLoad(iframe: HTMLIFrameElement, timeoutMs = 12_000): Promise<void> {
    return new Promise((resolve, reject) => {
        let timer: number | null = null;
        const cleanup = () => {
            iframe.removeEventListener('load', handleLoad);
            if (timer !== null) window.clearTimeout(timer);
        };
        const handleLoad = () => {
            cleanup();
            resolve();
        };
        timer = window.setTimeout(() => {
            cleanup();
            reject(new Error(`Preview iframe load timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
        iframe.addEventListener('load', handleLoad);
    });
}

async function waitForDocumentComplete(iframe: HTMLIFrameElement, target: ResolvedPreviewCaptureTarget): Promise<Document> {
    let doc = getSameOriginDocument(iframe);
    while (doc.readyState !== 'complete' || !hasIframeReachedTarget(iframe, doc, target)) {
        await waitForIframeLoad(iframe);
        doc = getSameOriginDocument(iframe);
    }
    return doc;
}

function requestRuntimeReady(iframe: HTMLIFrameElement, timeoutMs = 1500): Promise<boolean> {
    const requestId = `preview-runtime-ready-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const targetWindow = iframe.contentWindow;
    if (!targetWindow) {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        let timer: number | null = null;
        const cleanup = () => {
            window.removeEventListener('message', handleMessage);
            if (timer !== null) window.clearTimeout(timer);
        };
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== targetWindow) return;
            const data = event.data as { type?: unknown; requestId?: unknown };
            if (data?.type !== 'axhub.quickEdit.runtimeReady') return;
            if (data.requestId && data.requestId !== requestId) return;
            cleanup();
            resolve(true);
        };
        window.addEventListener('message', handleMessage);
        timer = window.setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeoutMs);
        targetWindow.postMessage({
            type: 'axhub.quickEdit.requestRuntimeReady',
            requestId,
            runtimeOrigin: getWindowOrigin(),
        }, '*');
    });
}

async function waitForImagesBestEffort(doc: Document): Promise<void> {
    const images = Array.from(doc.images || []);
    await Promise.all(images.map(async (image) => {
        if (image.complete) return;
        try {
            if (typeof image.decode === 'function') {
                await image.decode();
                return;
            }
        } catch {
            return;
        }
        await new Promise<void>((resolve) => {
            const done = () => {
                image.removeEventListener('load', done);
                image.removeEventListener('error', done);
                resolve();
            };
            image.addEventListener('load', done, { once: true });
            image.addEventListener('error', done, { once: true });
        });
    }));
}

function nextFrame(win: Window): Promise<void> {
    return new Promise((resolve) => {
        const raf = win.requestAnimationFrame || window.requestAnimationFrame;
        if (typeof raf === 'function') {
            raf.call(win, () => resolve());
            return;
        }
        window.setTimeout(resolve, 16);
    });
}

export async function defaultWaitForPreviewReady(
    iframe: HTMLIFrameElement,
    target: ResolvedPreviewCaptureTarget,
    diagnostics: PreviewDiagnostic[],
): Promise<void> {
    const doc = await waitForDocumentComplete(iframe, target);
    const runtimeReady = await requestRuntimeReady(iframe);
    if (!runtimeReady) {
        diagnostics.push({
            level: 'info',
            type: 'runtime-ready-fallback',
            message: 'QuickEdit runtime ready signal was unavailable; fell back to DOM ready.',
            timestamp: new Date().toISOString(),
        });
    }
    await Promise.resolve(doc.fonts?.ready).catch(() => undefined);
    await waitForImagesBestEffort(doc).catch((error) => {
        diagnostics.push({
            level: 'warning',
            type: 'image-settle-error',
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        });
    });
    const frameWindow = iframe.contentWindow || window;
    await nextFrame(frameWindow);
    await nextFrame(frameWindow);
}

export async function defaultSettlePreviewFrame(iframe: HTMLIFrameElement): Promise<void> {
    try {
        const eventCtor = iframe.contentWindow?.Event || Event;
        iframe.contentWindow?.dispatchEvent(new eventCtor('resize'));
    } catch {
        // noop
    }
    const frameWindow = iframe.contentWindow || window;
    await nextFrame(frameWindow);
    await nextFrame(frameWindow);
}

export function captureIframeViaQuickEditRuntime({
    iframe,
    target,
    viewport,
}: PreviewCaptureIframeParams): Promise<Omit<PreviewCaptureScreenshot, 'viewportId'>> {
    const targetWindow = iframe.contentWindow;
    if (!targetWindow) {
        return Promise.reject(new Error('Preview iframe contentWindow is unavailable.'));
    }
    const requestId = `preview-capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
        let timer: number | null = null;
        const cleanup = () => {
            window.removeEventListener('message', handleMessage);
            if (timer !== null) window.clearTimeout(timer);
        };
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== targetWindow) return;
            const data = event.data as {
                type?: unknown;
                requestId?: unknown;
                success?: unknown;
                dataUrl?: unknown;
                width?: unknown;
                height?: unknown;
                error?: unknown;
            };
            if (data?.type !== 'axhub.quickEdit.export.captureScreenshotResult') return;
            if (data.requestId !== requestId) return;
            cleanup();
            if (data.success === false) {
                reject(new Error(String(data.error || 'Preview screenshot failed.')));
                return;
            }
            const dataUrl = normalizeString(data.dataUrl);
            if (!dataUrl) {
                reject(new Error('Preview screenshot returned an empty image.'));
                return;
            }
            resolve({
                dataUrl,
                width: normalizeSize(data.width, viewport.width),
                height: normalizeSize(data.height, viewport.height),
                mimeType: dataUrl.match(/^data:([^;,]+)/u)?.[1] || 'image/png',
            });
        };
        window.addEventListener('message', handleMessage);
        timer = window.setTimeout(() => {
            cleanup();
            reject(new Error('Preview screenshot timed out.'));
        }, 30_000);
        targetWindow.postMessage({
            type: 'axhub.quickEdit.export.captureScreenshot',
            requestId,
            resourceType: target.resourceType,
            resourceId: target.resourceId,
            clientUrl: target.url,
            runtimeOrigin: getWindowOrigin(),
            targetWidth: viewport.width,
            targetHeight: viewport.height,
            targetPixelRatio: 1,
        }, '*');
    });
}

export function resolvePreviewUrlForResourceType(resourceType: string, resource: any, pageId?: string | null): string {
    return buildResourcePreviewUrl(resourceType, resource, pageId);
}

export function normalizePreviewUrlForPage(rawUrl: string, pageId?: string | null): string {
    if (!pageId) return sameOriginPreviewUrl(rawUrl);
    try {
        return buildPrototypePageHashUrl(new URL(sameOriginPreviewUrl(rawUrl), getWindowOrigin()), pageId);
    } catch {
        return sameOriginPreviewUrl(rawUrl);
    }
}

function getPreviewBridgeWebSocketUrl(): string {
    if (typeof window === 'undefined') return '';
    const rawPath = normalizeString((window as unknown as Record<string, unknown>).__AXHUB_PREVIEW_BRIDGE_WS_URL__);
    if (!rawPath) return '';
    try {
        const url = new URL(rawPath, window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return url.toString();
    } catch {
        return '';
    }
}

function normalizePreviewBridgeError(error: unknown): { code: string; message: string } {
    if (error instanceof PreviewNavigateError) {
        return {
            code: error.code,
            message: error.message,
        };
    }
    if (error instanceof Error) {
        return {
            code: 'preview_command_failed',
            message: error.message,
        };
    }
    return {
        code: 'preview_command_failed',
        message: String(error || 'Preview command failed.'),
    };
}

async function executePreviewBridgeCommand(
    command: string,
    payload: unknown,
    context: PreviewHostContext,
    lastDiagnosticsRef: { current: PreviewDiagnostic[] },
    onNavigate?: RunPreviewNavigateOptions['onNavigate'],
): Promise<unknown> {
    switch (command) {
        case 'preview_get_current':
            return {
                current: createPreviewBridgeCurrentContext(context),
            };
        case 'preview_navigate':
            return runPreviewNavigate({
                context,
                args: isRecord(payload) ? payload as PreviewNavigateArgs : {},
                onNavigate,
            });
        case 'preview_capture': {
            try {
                const result = await runPreviewCapture({
                    context,
                    args: isRecord(payload) ? payload as PreviewCaptureArgs : {},
                });
                lastDiagnosticsRef.current = result.diagnostics;
                return result;
            } catch (error) {
                lastDiagnosticsRef.current = Array.isArray((error as PreviewCaptureError | null)?.diagnostics)
                    ? [...((error as PreviewCaptureError).diagnostics || [])]
                    : [{
                        level: 'error',
                        type: 'capture-error',
                        message: error instanceof Error ? error.message : String(error),
                        timestamp: new Date().toISOString(),
                    }];
                throw error;
            }
        }
        case 'preview_get_last_diagnostics':
            return {
                diagnostics: lastDiagnosticsRef.current,
            };
        default:
            throw new Error(`Unsupported preview command: ${command}`);
    }
}

export function usePreviewBridgeHost(options: UsePreviewBridgeHostOptions): void {
    const contextRef = useRef(options.context);
    const onNavigateRef = useRef(options.onNavigate);
    const onVoiceToolCommandRef = useRef(options.onVoiceToolCommand);
    const canvasSelectionRef = useRef<PreviewCanvasSelection | null>(options.context.canvasSelection || null);
    const lastDiagnosticsRef = useRef<PreviewDiagnostic[]>([]);
    const commandHandlerRef = useRef<((msg: PreviewBridgeMessage) => void) | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    onNavigateRef.current = options.onNavigate;
    onVoiceToolCommandRef.current = options.onVoiceToolCommand;
    contextRef.current = {
        ...options.context,
        canvasSelection: canvasSelectionRef.current || options.context.canvasSelection || null,
    };

    useEffect(() => {
        const handleSelectionChanged = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            const elementId = normalizeString(detail?.elementId);
            if (!elementId) return;
            if (!detail?.isSelected) {
                if (canvasSelectionRef.current?.elementId === elementId) {
                    canvasSelectionRef.current = null;
                    contextRef.current = {
                        ...contextRef.current,
                        canvasSelection: null,
                    };
                }
                return;
            }
            canvasSelectionRef.current = {
                elementId,
                previewUrl: normalizeString(detail.previewUrl),
                openUrl: normalizeString(detail.openUrl),
                title: normalizeString(detail.title),
                previewKind: normalizeString(detail.previewKind),
                resourceType: normalizeString(detail.resourceType),
                resourceId: normalizeString(detail.resourceId),
                customData: isRecord(detail.customData) ? detail.customData : {},
            };
            contextRef.current = {
                ...contextRef.current,
                canvasSelection: canvasSelectionRef.current,
            };
        };

        window.addEventListener('axhub:embedSelectionChanged', handleSelectionChanged);
        return () => {
            window.removeEventListener('axhub:embedSelectionChanged', handleSelectionChanged);
        };
    }, []);

    useEffect(() => {
        commandHandlerRef.current = (msg: PreviewBridgeMessage) => {
            const ws = socketRef.current;
            const requestId = String(msg.requestId || '');
            const command = String(msg.command || '');
            if (!ws || !requestId || !command) return;
            const execute = command.startsWith('axhub_make_')
                ? onVoiceToolCommandRef.current?.({ name: command, input: msg.payload, requestId })
                : executePreviewBridgeCommand(command, msg.payload, contextRef.current, lastDiagnosticsRef, onNavigateRef.current);
            if (!execute) {
                const error = new Error(`Unsupported preview command: ${command}`);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'preview.command.result',
                        requestId,
                        ok: false,
                        error: normalizePreviewBridgeError(error),
                    }));
                }
                return;
            }
            void Promise.resolve(execute)
                .then((payload) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'preview.command.result',
                            requestId,
                            ok: true,
                            payload,
                        }));
                    }
                })
                .catch((error) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'preview.command.result',
                            requestId,
                            ok: false,
                            error: normalizePreviewBridgeError(error),
                        }));
                    }
                });
        };
        return () => {
            commandHandlerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (options.enabled === false || typeof window === 'undefined' || typeof WebSocket === 'undefined') {
            return undefined;
        }
        const url = getPreviewBridgeWebSocketUrl();
        if (!url) {
            return undefined;
        }

        let closed = false;
        let reconnectTimer: number | null = null;
        const cleanupReconnect = () => {
            if (reconnectTimer !== null) {
                window.clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };
        const connect = () => {
            cleanupReconnect();
            if (closed) return;
            const ws = new WebSocket(url);
            socketRef.current = ws;
            ws.addEventListener('open', () => {
                ws.send(JSON.stringify({
                    type: 'preview.register',
                    payload: {
                        url: window.location.href,
                    },
                }));
            });
            ws.addEventListener('message', (event) => {
                let msg: PreviewBridgeMessage | null = null;
                try {
                    msg = JSON.parse(String(event.data || ''));
                } catch {
                    return;
                }
                if (!msg) return;
                if (msg.type === 'hello') {
                    const clientId = normalizeString((msg.payload as Record<string, unknown> | null)?.clientId);
                    if (clientId) {
                        (window as unknown as Record<string, unknown>).__AXHUB_PREVIEW_BRIDGE_CLIENT_ID__ = clientId;
                    }
                    return;
                }
                if (msg.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                    return;
                }
                if (msg.type === 'preview.command.request') {
                    commandHandlerRef.current?.(msg);
                }
            });
            ws.addEventListener('close', () => {
                if (socketRef.current === ws) {
                    socketRef.current = null;
                    const globals = window as unknown as Record<string, unknown>;
                    if (globals.__AXHUB_PREVIEW_BRIDGE_CLIENT_ID__) {
                        delete globals.__AXHUB_PREVIEW_BRIDGE_CLIENT_ID__;
                    }
                }
                if (!closed) {
                    reconnectTimer = window.setTimeout(connect, 1000);
                }
            });
            ws.addEventListener('error', () => {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    ws.close();
                }
            });
        };

        connect();

        return () => {
            closed = true;
            cleanupReconnect();
            const ws = socketRef.current;
            socketRef.current = null;
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close();
            }
        };
    }, [options.enabled]);
}
