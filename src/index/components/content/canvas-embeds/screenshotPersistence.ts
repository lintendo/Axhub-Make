import { withProjectScope } from '../../../services/projectScope';

export interface PersistPrototypeScreenshotParams {
    projectId: string;
    previewUrl: string;
    dataUrl: string;
    canvasFilePath?: string | null;
    canvasName?: string | null;
    prototypeId?: string | null;
    pageId?: string | null;
    elementId?: string;
    fileName?: string;
    width?: number;
    height?: number;
}

export interface PersistedPrototypeScreenshot {
    screenshotUrl: string;
    path?: string;
    absoluteFilePath?: string;
    width?: number;
    height?: number;
}

const PROTOTYPE_PAGE_ID_RE = /^[a-z0-9-]+$/u;

function normalizePrototypeId(value: string): string | null {
    const decoded = decodeURIComponent(value || '').trim();
    if (
        !decoded
        || decoded === '.'
        || decoded === '..'
        || decoded.includes('/')
        || decoded.includes('\\')
    ) {
        return null;
    }
    return decoded;
}

function normalizeScreenshotFileBase(value: string): string | null {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-z0-9]+/giu, '-')
        .replace(/-+/gu, '-')
        .replace(/^-|-$/gu, '')
        .toLowerCase();
    return normalized || null;
}

function normalizePrototypePageId(value: unknown): string | null {
    const pageId = typeof value === 'string' ? value.trim() : '';
    return PROTOTYPE_PAGE_ID_RE.test(pageId) ? pageId : null;
}

export function getPrototypeIdFromCanvasName(canvasName: string): string | null {
    void canvasName;
    return null;
}

export function createElementScreenshotFileName(elementId: string): string | undefined {
    const safeElementId = normalizeScreenshotFileBase(elementId);
    return safeElementId ? `embed-${safeElementId}.png` : undefined;
}

export function getPrototypePageScreenshotFileName(pageId: unknown): string | undefined {
    const safePageId = normalizePrototypePageId(pageId);
    return safePageId ? `page-${safePageId}.png` : undefined;
}

export function getPrototypeIdFromPreviewUrl(previewUrl: string): string | null {
    if (!previewUrl) return null;
    try {
        const parsed = new URL(previewUrl, window.location.origin);
        const match = parsed.pathname.match(/^\/prototypes\/([^/]+)/iu);
        return match?.[1] ? normalizePrototypeId(match[1]) : null;
    } catch {
        return null;
    }
}

export function derivePrototypeScreenshotUrl(previewUrl: string): string | undefined {
    void previewUrl;
    return undefined;
}

export function derivePrototypePageScreenshotUrl(
    previewUrl: string,
    prototypeIdOrPageId: string | null | undefined,
    pageId?: string | null,
): string | undefined {
    const resolvedPageId = pageId === undefined ? prototypeIdOrPageId : pageId;
    const fileName = getPrototypePageScreenshotFileName(resolvedPageId);
    if (!fileName) return undefined;
    const prototypeId = pageId === undefined
        ? getPrototypeIdFromPreviewUrl(previewUrl)
        : prototypeIdOrPageId;
    return derivePrototypeScreenshotUrlFromId(previewUrl, prototypeId, fileName);
}

export function derivePrototypeScreenshotUrlFromId(
    previewUrl: string,
    prototypeId: string | null | undefined,
    fileName = 'screenshot.png',
): string | undefined {
    void previewUrl;
    void prototypeId;
    void fileName;
    return undefined;
}

function encodeCanvasApiPath(canvasPath: string): string {
    return canvasPath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
}

export function resolveResourceCanvasPath(canvasFilePath?: string | null, canvasName?: string | null): string {
    const resourcesMarker = 'src/resources/';
    const candidates = [canvasFilePath, canvasName];
    for (const candidate of candidates) {
        const normalized = String(candidate || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalized) continue;
        if (normalized.startsWith(resourcesMarker)) {
            return normalized.slice(resourcesMarker.length);
        }
        const markerIndex = normalized.indexOf(`/${resourcesMarker}`);
        if (markerIndex >= 0) {
            return normalized.slice(markerIndex + resourcesMarker.length + 1);
        }
    }
    return '';
}

export function deriveResourceCanvasScreenshotUrl(
    projectId: string,
    canvasFilePath?: string | null,
    fileName = 'screenshot.png',
    canvasName?: string | null,
): string | undefined {
    const resourceCanvasPath = resolveResourceCanvasPath(canvasFilePath, canvasName);
    if (fileName.includes('/') || fileName.includes('\\')) return undefined;
    const safeFileBase = normalizeScreenshotFileBase(fileName.replace(/\.png$/iu, ''));
    if (!resourceCanvasPath || !safeFileBase) return undefined;
    try {
        return new URL(
            withProjectScope(
                `/api/canvas/resources/${encodeCanvasApiPath(resourceCanvasPath)}/asset/${safeFileBase}.png`,
                { projectId },
            ),
            window.location.origin,
        ).toString();
    } catch {
        return undefined;
    }
}

export async function persistPrototypeScreenshot(
    params: PersistPrototypeScreenshotParams,
): Promise<PersistedPrototypeScreenshot | null> {
    const resourceCanvasPath = resolveResourceCanvasPath(params.canvasFilePath, params.canvasName);
    if (!resourceCanvasPath) {
        return null;
    }

    const pageScreenshotFileName = getPrototypePageScreenshotFileName(params.pageId);
    const fileName = params.fileName
        || pageScreenshotFileName
        || (params.elementId ? createElementScreenshotFileName(params.elementId) : undefined);
    const elementId = pageScreenshotFileName ? undefined : params.elementId;
    const pageId = pageScreenshotFileName ? normalizePrototypePageId(params.pageId) : undefined;

    const response = await fetch(withProjectScope(
        `/api/canvas/resources/${encodeCanvasApiPath(resourceCanvasPath)}/screenshot`,
        { projectId: params.projectId },
    ), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            elementId,
            pageId,
            fileName,
            dataUrl: params.dataUrl,
            width: params.width,
            height: params.height,
        }),
    });
    if (!response.ok) {
        throw new Error(`保存截图失败 (${response.status})`);
    }

    const payload = await response.json();
    const screenshotUrl = typeof payload?.screenshotUrl === 'string' ? payload.screenshotUrl : '';
    if (!screenshotUrl) {
        return null;
    }
    let resolvedScreenshotUrl = screenshotUrl;
    if (screenshotUrl.startsWith('/')) {
        try {
            resolvedScreenshotUrl = new URL(
                withProjectScope(screenshotUrl, { projectId: params.projectId }),
                window.location.origin,
            ).toString();
        } catch {
            resolvedScreenshotUrl = screenshotUrl;
        }
    }

    return {
        screenshotUrl: resolvedScreenshotUrl,
        path: typeof payload.path === 'string' ? payload.path : undefined,
        absoluteFilePath: typeof payload.absoluteFilePath === 'string' ? payload.absoluteFilePath : undefined,
        width: typeof payload.width === 'number' ? payload.width : undefined,
        height: typeof payload.height === 'number' ? payload.height : undefined,
    };
}
