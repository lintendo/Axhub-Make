import { ItemData, ViewMode } from '../types';

export interface BuildEditorUrlOptions {
    width?: number;
    mobileMode?: boolean;
    hostToolbar?: boolean;
    annotationSession?: boolean;
}

const STALE_AGENT_BRIDGE_QUERY_PARAMS = [
    'agentApiBaseUrl',
    'apiBaseUrl',
    'agentIntegrationChannel',
    'integrationChannel',
    'agentTargetClientId',
    'integrationClientId',
    'cwd',
    'workdir',
    'provider',
    'tool',
    'targetPath',
    'context',
    'editorIntegrationWs',
    'editorApiBaseUrl',
    'editorIntegrationChannel',
    'editorClientId',
    'editorSessionId',
    'editorPageUrl',
    'editorMobileMode',
    'mobileMode',
    'agentToolbar',
    'annotationSession',
    'inspecta',
] as const;

function clearStaleAgentBridgeQueryParams(url: URL) {
    for (const key of STALE_AGENT_BRIDGE_QUERY_PARAMS) {
        url.searchParams.delete(key);
    }
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function appendEditorLaunchOptionsToUrl(
    inputUrl: URL,
    options?: BuildEditorUrlOptions,
): URL {
    const url = inputUrl;
    clearStaleAgentBridgeQueryParams(url);

    if (typeof options?.mobileMode === 'boolean') {
        url.searchParams.set('editorMobileMode', options.mobileMode ? 'true' : 'false');
    }

    if (options?.hostToolbar) {
        url.searchParams.set('agentToolbar', 'host');
    }

    if (options?.annotationSession) {
        url.searchParams.set('annotationSession', '1');
    }

    return url;
}

function isLocalOnlyHostname(value: unknown): boolean {
    const hostname = normalizeString(value).toLowerCase();
    return hostname === 'localhost'
        || hostname === '0.0.0.0'
        || hostname === '::1'
        || hostname === '[::1]'
        || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
}

function getLANHostname(): string {
    const configuredLANHost = normalizeString(window.__AXHUB_SHARE_HOSTS__?.lanHost);
    if (configuredLANHost && !isLocalOnlyHostname(configuredLANHost)) {
        return configuredLANHost;
    }
    const injectedHost = normalizeString(window.__LOCAL_IP__);
    if (injectedHost && !isLocalOnlyHostname(injectedHost)) {
        return injectedHost;
    }
    const currentHost = normalizeString(window.location?.hostname);
    if (currentHost && !isLocalOnlyHostname(currentHost)) {
        return currentHost;
    }
    return injectedHost || currentHost || 'localhost';
}

function rewriteLocalOnlyUrlHost(url: URL, hostname: string): URL {
    const nextUrl = new URL(url.toString());
    nextUrl.hostname = hostname;
    return nextUrl;
}

function rewriteLocalOnlyUrlToLocalShareHost(url: URL): URL {
    if (!isLocalOnlyHostname(url.hostname)) {
        return url;
    }
    const configuredLocalHost = normalizeString(window.__AXHUB_SHARE_HOSTS__?.localHost);
    if (!configuredLocalHost) {
        return url;
    }
    return rewriteLocalOnlyUrlHost(url, configuredLocalHost);
}

function rewriteLocalOnlyUrlToLAN(url: URL): URL {
    if (!isLocalOnlyHostname(url.hostname)) {
        return url;
    }
    const lanHostname = getLANHostname();
    if (!lanHostname || isLocalOnlyHostname(lanHostname)) {
        return url;
    }
    return rewriteLocalOnlyUrlHost(url, lanHostname);
}

export function buildItemUrl(
    selectedItem: ItemData | null,
    viewMode: ViewMode,
): URL | null {
    const url = buildRawItemUrl(selectedItem, viewMode);
    return url ? rewriteLocalOnlyUrlToLocalShareHost(url) : null;
}

function buildRawItemUrl(
    selectedItem: ItemData | null,
    viewMode: ViewMode,
): URL | null {
    if (!selectedItem) return null;
    const baseUrl = viewMode === 'canvas'
        ? ''
        : viewMode === 'demo'
            ? (selectedItem.clientUrl || selectedItem.previewUrl)
            : selectedItem.specUrl;
    if (!baseUrl) return null;
    return new URL(baseUrl, window.location.origin);
}

export function buildLANItemUrl(
    selectedItem: ItemData | null,
    viewMode: ViewMode,
): string {
    const url = buildRawItemUrl(selectedItem, viewMode);
    if (!url) return '';
    return rewriteLocalOnlyUrlToLAN(url).toString();
}

/**
 * URL 相关工具函数
 */

/**
 * 获取局域网 URL
 */
export function getLocalUrl(
    selectedItem: ItemData | null,
    viewMode: ViewMode,
): string {
    return buildLANItemUrl(selectedItem, viewMode);
}

export function buildEditorUrl(
    selectedItem: ItemData | null,
    viewMode: ViewMode,
    options?: BuildEditorUrlOptions
): string {
    const url = buildItemUrl(selectedItem, viewMode);
    if (!url) return '';
    const displayName = String(selectedItem?.displayName || '').trim();

    if (displayName) {
        url.searchParams.set('axhubDisplayName', displayName);
    } else {
        url.searchParams.delete('axhubDisplayName');
    }

    appendEditorLaunchOptionsToUrl(url, options);
    url.searchParams.delete('editor');
    url.searchParams.delete('specEdit');
    if (options?.width && Number.isFinite(options.width)) {
        url.searchParams.set('width', String(Math.round(options.width)));
    } else {
        url.searchParams.delete('width');
    }
    return url.toString();
}

/**
 * 获取组件源路径
 */
export function getItemSourcePath(item: ItemData, activeTab: string): string {
    void activeTab;
    const anyItem = item as ItemData & { filePath?: string; absoluteFilePath?: string };
    const explicitPath = String(anyItem.filePath || anyItem.absoluteFilePath || '').trim();
    if (explicitPath) {
        const srcIndex = explicitPath.indexOf('src/');
        if (srcIndex >= 0) {
            let rel = explicitPath.substring(srcIndex);
            rel = rel.replace(/\/index\.(t|j)sx?$/i, '');
            return rel;
        }
        return explicitPath.replace(/\/index\.(t|j)sx?$/i, '');
    }
    return '';
}
