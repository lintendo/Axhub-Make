import http from 'node:http';
import https from 'node:https';
import { sendJson } from './http.ts';
const PROXY_PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>';
const DEFAULT_AXURE_BRIDGE_BASE_URL = 'http://localhost:32767';
const AXURE_BRIDGE_BASE_URL_ENV = 'AXHUB_AXURE_BRIDGE_BASE_URL';
function getAxureBridgeBaseUrl() {
    return String(process.env[AXURE_BRIDGE_BASE_URL_ENV] || '').trim() || DEFAULT_AXURE_BRIDGE_BASE_URL;
}
function buildAxureBridgeUrl(pathname) {
    return new URL(pathname, getAxureBridgeBaseUrl()).toString();
}
function readErrorString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function limitErrorText(value, maxLength) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}
function formatAxureProxyErrorDetails(error) {
    const parts = [];
    const message = readErrorString(error?.message);
    const causeMessage = readErrorString(error?.cause?.message);
    const code = readErrorString(error?.code) || readErrorString(error?.cause?.code);
    const errno = readErrorString(error?.errno) || readErrorString(error?.cause?.errno);
    const syscall = readErrorString(error?.syscall) || readErrorString(error?.cause?.syscall);
    const address = readErrorString(error?.address) || readErrorString(error?.cause?.address);
    const port = typeof error?.port === 'number'
        ? String(error.port)
        : typeof error?.cause?.port === 'number'
            ? String(error.cause.port)
            : '';
    if (message)
        parts.push(message);
    if (causeMessage && causeMessage !== message)
        parts.push(`cause=${causeMessage}`);
    if (code)
        parts.push(`code=${code}`);
    if (errno && errno !== code)
        parts.push(`errno=${errno}`);
    if (syscall)
        parts.push(`syscall=${syscall}`);
    if (address)
        parts.push(`address=${address}`);
    if (port)
        parts.push(`port=${port}`);
    return parts.join('; ') || 'Unknown upstream error';
}
function buildAxureBridgeUnavailablePayload(params) {
    const errorCode = readErrorString(params.error?.code)
        || readErrorString(params.error?.cause?.code)
        || undefined;
    const errorMessage = readErrorString(params.error?.message)
        || readErrorString(params.responseText)
        || (typeof params.status === 'number' ? `Axure Bridge unavailable (HTTP ${params.status})` : 'Axure Bridge unavailable');
    const details = params.error
        ? formatAxureProxyErrorDetails(params.error)
        : limitErrorText(readErrorString(params.responseText), 800) || undefined;
    return {
        available: false,
        running: false,
        success: false,
        error: errorMessage,
        details,
        code: errorCode,
        route: params.route,
        method: params.method,
        bridgeUrl: params.bridgeUrl,
        payloadBytes: params.payloadBytes || undefined,
        status: typeof params.status === 'number' ? params.status : undefined,
        statusText: readErrorString(params.statusText) || undefined,
    };
}
function isLoopbackOrPrivateHostname(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase();
    if (!normalized)
        return true;
    if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0' || normalized === '::1' || normalized === '[::1]') {
        return true;
    }
    if (/^127\./u.test(normalized) || /^10\./u.test(normalized) || /^192\.168\./u.test(normalized) || /^169\.254\./u.test(normalized)) {
        return true;
    }
    const match172 = normalized.match(/^172\.(\d{1,3})\./u);
    return Boolean(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31);
}
function isAllowedProxyImageUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !isLoopbackOrPrivateHostname(parsed.hostname);
    }
    catch {
        return false;
    }
}
function getIncomingHeaderValue(headers, name) {
    const value = headers[name.toLowerCase()];
    if (Array.isArray(value))
        return value.join(', ');
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number')
        return String(value);
    return null;
}
function isFixedLengthBridgeRejection(status, text) {
    const normalized = text.toLowerCase();
    return (status === 400 || status === 411)
        && normalized.includes('content-length')
        && normalized.includes('transfer-encoding')
        && normalized.includes('chunked');
}
function postAxureBridgeFixedLength(bridgeUrl, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        const target = new URL(bridgeUrl);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            reject(new Error(`Unsupported Axure Bridge protocol: ${target.protocol}`));
            return;
        }
        const requestBody = body || '';
        const transport = target.protocol === 'https:' ? https : http;
        let timeout = null;
        const req = transport.request(target, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Length': String(Buffer.byteLength(requestBody, 'utf8')),
            },
        }, (bridgeRes) => {
            const chunks = [];
            bridgeRes.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            bridgeRes.on('end', () => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                const responseBody = Buffer.concat(chunks).toString('utf8');
                const status = bridgeRes.statusCode || 0;
                resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    statusText: bridgeRes.statusMessage || '',
                    headers: {
                        get: (name) => getIncomingHeaderValue(bridgeRes.headers, name),
                    },
                    text: async () => responseBody,
                });
            });
        });
        req.on('error', (error) => {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            reject(error);
        });
        timeout = setTimeout(() => {
            req.destroy(new Error('Axure Bridge request timed out'));
        }, timeoutMs);
        req.end(requestBody);
    });
}
function respondWithPlaceholderImage(res, reason, details) {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('X-Axhub-Proxy-Fallback', 'placeholder');
    res.setHeader('X-Axhub-Proxy-Reason', reason);
    if (details) {
        res.setHeader('X-Axhub-Proxy-Details', JSON.stringify(details));
    }
    res.end(PROXY_PLACEHOLDER_SVG);
}
async function proxyAxureBridgeRequest(req, res, pathname) {
    const isAvailableRoute = req.method === 'GET' && pathname === '/api/axure-bridge/available';
    const isCopyRoute = req.method === 'POST' && pathname === '/api/axure-bridge/copyaxvg';
    const bridgeUrl = buildAxureBridgeUrl(isAvailableRoute ? '/available' : '/copyaxvg');
    let payloadBytes = 0;
    const readCopyBody = async () => new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8').trim();
            const body = raw.startsWith('// axvg') ? raw : `// axvg\n${raw || '{}'}`;
            payloadBytes = Buffer.byteLength(body, 'utf8');
            resolve(body);
        });
        req.on('error', reject);
    });
    const shouldRetryBridgeError = (error) => {
        const code = String(error?.code || error?.cause?.code || '').trim();
        return code === 'ECONNRESET';
    };
    const fetchBridgeWithRetry = async (body) => {
        const fetchOptions = {
            method: isAvailableRoute ? 'GET' : 'POST',
            headers: isCopyRoute ? {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Length': String(payloadBytes),
            } : undefined,
            body: isCopyRoute ? body : undefined,
            signal: AbortSignal.timeout(isAvailableRoute ? 5000 : 30000),
        };
        try {
            return await fetch(bridgeUrl, fetchOptions);
        }
        catch (error) {
            if (!shouldRetryBridgeError(error)) {
                throw error;
            }
            return fetch(bridgeUrl, fetchOptions);
        }
    };
    try {
        const requestBody = isCopyRoute ? await readCopyBody() : undefined;
        let response = await fetchBridgeWithRetry(requestBody);
        let text = await response.text();
        if (isCopyRoute && typeof requestBody === 'string' && isFixedLengthBridgeRejection(response.status, text)) {
            response = await postAxureBridgeFixedLength(bridgeUrl, requestBody, 30000);
            text = await response.text();
        }
        if (!response.ok && isAvailableRoute) {
            sendJson(res, buildAxureBridgeUnavailablePayload({
                route: pathname,
                method: req.method || 'GET',
                bridgeUrl,
                payloadBytes: payloadBytes || undefined,
                status: response.status,
                statusText: response.statusText,
                responseText: text,
            }));
            return;
        }
        res.statusCode = response.status;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
        res.end(text || (isAvailableRoute ? '{"available":true}' : '{}'));
    }
    catch (error) {
        const payload = {
            ...buildAxureBridgeUnavailablePayload({
                route: pathname,
                method: req.method || (isAvailableRoute ? 'GET' : 'POST'),
                bridgeUrl,
                payloadBytes: payloadBytes || undefined,
                error,
            }),
            causeMessage: readErrorString(error?.cause?.message) || undefined,
            bridgeUrl,
        };
        if (isAvailableRoute) {
            sendJson(res, payload);
            return;
        }
        sendJson(res, payload, { status: 502 });
    }
}
export function handleBridgeAndImageProxy(req, res, pathname, url) {
    if (pathname === '/api/export/image-proxy' && req.method === 'GET') {
        const targetUrl = String(url.searchParams.get('url') || '').trim();
        if (!targetUrl) {
            respondWithPlaceholderImage(res, 'missing-target-url');
            return true;
        }
        if (!isAllowedProxyImageUrl(targetUrl)) {
            respondWithPlaceholderImage(res, 'unsupported-target-url', { targetUrl });
            return true;
        }
        fetch(targetUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                Accept: 'image/*,*/*;q=0.8',
                'User-Agent': 'AxhubMakeExportProxy/1.0',
            },
        }).then(async (upstreamResponse) => {
            if (!upstreamResponse.ok) {
                respondWithPlaceholderImage(res, 'upstream-http-error', { status: upstreamResponse.status, targetUrl });
                return;
            }
            const contentType = String(upstreamResponse.headers.get('content-type') || '').toLowerCase();
            if (contentType && !contentType.startsWith('image/')) {
                respondWithPlaceholderImage(res, 'unsupported-content-type', { contentType, targetUrl });
                return;
            }
            const body = Buffer.from(await upstreamResponse.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', upstreamResponse.headers.get('cache-control') || 'public, max-age=600');
            res.setHeader('Content-Type', contentType || 'application/octet-stream');
            res.setHeader('Content-Length', String(body.byteLength));
            res.end(body);
        }).catch((error) => {
            respondWithPlaceholderImage(res, 'fetch-failed', { error: error?.message || 'Failed to fetch target image', targetUrl });
        });
        return true;
    }
    if ((pathname === '/api/axure-bridge/available' && req.method === 'GET') || (pathname === '/api/axure-bridge/copyaxvg' && req.method === 'POST')) {
        void proxyAxureBridgeRequest(req, res, pathname);
        return true;
    }
    return false;
}
