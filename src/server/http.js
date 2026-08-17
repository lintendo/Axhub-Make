import fs from 'node:fs';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import archiver from 'archiver';
export const LOCAL_API_CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
export function getLocalNetworkHostsFromInterfaces(interfaces) {
    const hosts = new Set();
    for (const nets of Object.values(interfaces)) {
        for (const net of nets || []) {
            if (net.family === 'IPv4' && !net.internal) {
                hosts.add(net.address);
            }
        }
    }
    return Array.from(hosts);
}
export function getLocalNetworkHosts() {
    return getLocalNetworkHostsFromInterfaces(networkInterfaces());
}
export function getLocalIP() {
    const [firstHost] = getLocalNetworkHosts();
    if (firstHost) {
        return firstHost;
    }
    return 'localhost';
}
export function getRequestUrl(req) {
    return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}
export function sendJson(res, data, options = {}) {
    res.statusCode = options.status ?? 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    for (const [key, value] of Object.entries(options.headers || {})) {
        res.setHeader(key, value);
    }
    res.end(JSON.stringify(data));
}
export function sendCorsJson(res, data, options = {}) {
    sendJson(res, data, {
        ...options,
        headers: {
            ...LOCAL_API_CORS_HEADERS,
            ...options.headers,
        },
    });
}
export function sendCorsPreflight(res) {
    res.statusCode = 204;
    for (const [key, value] of Object.entries(LOCAL_API_CORS_HEADERS)) {
        res.setHeader(key, value);
    }
    res.end();
}
export function sendText(res, text, contentType = 'text/plain; charset=utf-8', status = 200) {
    res.statusCode = status;
    res.setHeader('Content-Type', contentType);
    res.end(text);
}
const jsonBodyReads = new WeakMap();
export function readJsonBody(req) {
    const existing = jsonBodyReads.get(req);
    if (existing)
        return existing;
    const reading = new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            }
            catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
    jsonBodyReads.set(req, reading);
    return reading;
}
export function sendFile(res, filePath, options = {}) {
    let stats;
    try {
        stats = fs.statSync(filePath);
    }
    catch {
        return false;
    }
    if (!stats.isFile()) {
        return false;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
        '.css': 'text/css; charset=utf-8',
        '.gif': 'image/gif',
        '.html': 'text/html; charset=utf-8',
        '.ico': 'image/x-icon',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.map': 'application/json; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain; charset=utf-8',
        '.webp': 'image/webp',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', String(stats.size));
    if (options.cacheControl) {
        res.setHeader('Cache-Control', options.cacheControl);
    }
    if (ext === '.js' || ext === '.css' || ext === '.woff' || ext === '.woff2') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
        if (!res.headersSent) {
            sendJson(res, { error: error.message }, { status: 500 });
            return;
        }
        res.destroy(error);
    });
    stream.pipe(res);
    return true;
}
export function streamDirectoryAsZip(res, sourceDir, fileName) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (warning) => {
        console.warn('[ZIP] Archive warning:', warning);
    });
    archive.on('error', (error) => {
        if (!res.headersSent) {
            sendJson(res, { error: error.message }, { status: 500 });
        }
        else {
            res.destroy(error);
        }
    });
    archive.pipe(res);
    archive.directory(sourceDir, false);
    archive.finalize().catch((error) => {
        if (!res.headersSent) {
            sendJson(res, { error: error.message }, { status: 500 });
        }
        else {
            res.destroy(error);
        }
    });
}
