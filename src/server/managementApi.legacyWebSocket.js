import { sendJson } from './http.ts';
function sendLegacyWsFallback(res, pathname) {
    if (pathname === '/api/ws/clients') {
        sendJson(res, {
            clients: [],
            legacyWsUnavailable: true,
            warning: 'legacy websocket endpoint unavailable',
        });
        return;
    }
    sendJson(res, {
        ok: true,
        sent: 0,
        legacyWsUnavailable: true,
        warning: 'legacy websocket endpoint unavailable',
    });
}
function relayResponse(res, response, body) {
    res.statusCode = response.status;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(body);
}
export function handleLegacyWebSocketApi(req, res, options, pathname, handlers) {
    const isSend = pathname === '/api/ws/send';
    const isClients = pathname === '/api/ws/clients';
    if (!isSend && !isClients) {
        return false;
    }
    if ((isSend && req.method !== 'POST') || (isClients && req.method !== 'GET')) {
        sendJson(res, { error: 'Method not allowed' }, { status: 405 });
        return true;
    }
    const runtimeOrigin = String(options.runtimeOrigin || '').trim().replace(/\/+$/u, '');
    if (!runtimeOrigin) {
        sendLegacyWsFallback(res, pathname);
        return true;
    }
    (async () => {
        const requestBody = isSend ? (await handlers.readRawRequestBody(req)).toString('utf8') : undefined;
        const response = await fetch(`${runtimeOrigin}${pathname}`, {
            method: req.method,
            headers: {
                Accept: 'application/json',
                ...(req.headers['content-type'] ? { 'Content-Type': String(req.headers['content-type']) } : {}),
            },
            body: requestBody,
        });
        const body = await response.text();
        if (response.status === 404) {
            sendLegacyWsFallback(res, pathname);
            return;
        }
        relayResponse(res, response, body);
    })().catch(() => {
        sendLegacyWsFallback(res, pathname);
    });
    return true;
}
