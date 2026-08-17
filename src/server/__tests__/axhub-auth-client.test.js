import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAxhubAuthClient } from '../axhubAuthClient.ts';
const tempRoots = [];
function createTempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-auth-client-'));
    tempRoots.push(root);
    return root;
}
function readAuthFile(homeDir) {
    return JSON.parse(fs.readFileSync(path.join(homeDir, '.axhub/make/axhub-auth.json'), 'utf8'));
}
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('Axhub auth client', () => {
    it('surfaces the original fetch failure details when completing authorization fails', async () => {
        const homeDir = createTempRoot();
        const client = createAxhubAuthClient({
            serverInfoHomeDir: homeDir,
            onlineBaseUrl: 'https://axhub.test',
        });
        const session = client.beginAuthorization('http://localhost:53817');
        const cause = Object.assign(new Error('unable to get local issuer certificate'), {
            code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        });
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('fetch failed', { cause });
        }));
        await expect(client.completeAuthorization(new URLSearchParams({
            state: session.state,
            ticket: 'ticket-1',
        }))).rejects.toThrow('Axhub 授权失败：TypeError: fetch failed；cause.code=UNABLE_TO_GET_ISSUER_CERT_LOCALLY；cause.message=unable to get local issuer certificate');
    });
    it('connects to Enterprise with a normalized server URL and stores the token server-side', async () => {
        const homeDir = createTempRoot();
        const fetchMock = vi.fn(async (url, init) => {
            expect(url).toBe('https://enterprise.example.com/api/runtime/axhub/me');
            expect(init?.method).toBe('GET');
            expect((init?.headers).Authorization).toBe('Bearer axent_secret_123');
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    name: 'Make 发布 Token',
                    role: 'service',
                    isPlus: true,
                    scopes: ['html:read', 'html:create', 'html:publish'],
                    serverUrl: 'https://enterprise.example.com',
                    tokenPrefix: 'axent_secret',
                },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        const client = createAxhubAuthClient({ serverInfoHomeDir: homeDir });
        const me = await client.connectEnterprise({
            serverUrl: 'https://enterprise.example.com///',
            token: 'axent_secret_123',
        });
        expect(me).toMatchObject({
            name: 'Make 发布 Token',
            role: 'service',
            isPlus: true,
            tokenPrefix: 'axent_secret',
        });
        expect(client.getStatus()).toMatchObject({
            connected: true,
            provider: 'enterprise',
            serverUrl: 'https://enterprise.example.com',
            tokenPrefix: 'axent_secret',
            name: 'Make 发布 Token',
            role: 'service',
            scopes: ['html:read', 'html:create', 'html:publish'],
        });
        const stored = readAuthFile(homeDir);
        expect(stored.tokens).toBeUndefined();
        expect(stored.enterprise).toMatchObject({
            serverUrl: 'https://enterprise.example.com',
            token: 'axent_secret_123',
            tokenPrefix: 'axent_secret',
            name: 'Make 发布 Token',
        });
    });
    it('routes Enterprise project requests to the saved server with the Enterprise token', async () => {
        const homeDir = createTempRoot();
        const calls = [];
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            calls.push({ url, init });
            if (url.endsWith('/me')) {
                return new Response(JSON.stringify({
                    code: 0,
                    data: {
                        name: 'Make 发布 Token',
                        role: 'service',
                        isPlus: true,
                        scopes: ['html:read', 'html:create', 'html:publish'],
                        tokenPrefix: 'axent_secret',
                    },
                }), { status: 200 });
            }
            return new Response(JSON.stringify({
                code: 0,
                data: [
                    { pid: 11, name: 'Enterprise Demo', path: 'demo', software: 4 },
                ],
            }), { status: 200 });
        }));
        const client = createAxhubAuthClient({ serverInfoHomeDir: homeDir });
        await client.connectEnterprise({
            serverUrl: 'https://enterprise.example.com',
            token: 'axent_secret_123',
        });
        const projects = await client.listHtmlProjects('Demo');
        expect(projects).toEqual([
            { pid: 11, name: 'Enterprise Demo', path: 'demo', software: 4 },
        ]);
        expect(calls.at(-1)).toMatchObject({
            url: 'https://enterprise.example.com/api/runtime/axhub/html-projects?keyword=Demo',
        });
        expect((calls.at(-1)?.init?.headers).Authorization).toBe('Bearer axent_secret_123');
    });
    it('disconnects Enterprise by clearing local auth without calling Online revoke', async () => {
        const homeDir = createTempRoot();
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            code: 0,
            data: {
                name: 'Make 发布 Token',
                role: 'service',
                isPlus: true,
                scopes: ['html:read'],
                tokenPrefix: 'axent_secret',
            },
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const client = createAxhubAuthClient({ serverInfoHomeDir: homeDir });
        await client.connectEnterprise({
            serverUrl: 'https://enterprise.example.com',
            token: 'axent_secret_123',
        });
        fetchMock.mockClear();
        await client.disconnect();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(client.getStatus()).toMatchObject({
            connected: false,
            provider: 'online',
        });
        const stored = readAuthFile(homeDir);
        expect(stored.enterprise).toBeUndefined();
        expect(stored.tokens).toBeUndefined();
    });
    it('clears saved Enterprise auth when Online authorization completes', async () => {
        const homeDir = createTempRoot();
        const fetchMock = vi.fn(async (url) => {
            if (url.endsWith('/me')) {
                return new Response(JSON.stringify({
                    code: 0,
                    data: {
                        name: 'Make 发布 Token',
                        role: 'service',
                        isPlus: true,
                        scopes: ['html:read'],
                        tokenPrefix: 'axent_secret',
                    },
                }), { status: 200 });
            }
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    access_token: 'online-access-token',
                    expires_in: 3600,
                    refresh_token: 'online-refresh-token',
                    refresh_expires_in: 7200,
                },
            }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const client = createAxhubAuthClient({
            serverInfoHomeDir: homeDir,
            onlineBaseUrl: 'https://axhub.test',
        });
        await client.connectEnterprise({
            serverUrl: 'https://enterprise.example.com',
            token: 'axent_secret_123',
        });
        const session = client.beginAuthorization('http://localhost:53817');
        await client.completeAuthorization(new URLSearchParams({
            state: session.state,
            ticket: 'ticket-1',
        }));
        const stored = readAuthFile(homeDir);
        expect(stored.enterprise).toBeUndefined();
        expect(stored.tokens).toMatchObject({
            accessToken: 'online-access-token',
            refreshToken: 'online-refresh-token',
        });
        expect(client.getStatus()).toMatchObject({
            connected: true,
            provider: 'online',
        });
    });
    it('rejects invalid Enterprise connection input before contacting the network', async () => {
        const homeDir = createTempRoot();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const client = createAxhubAuthClient({ serverInfoHomeDir: homeDir });
        await expect(client.connectEnterprise({
            serverUrl: 'ftp://enterprise.example.com',
            token: 'axent_secret_123',
        })).rejects.toThrow('企业版地址必须以 http:// 或 https:// 开头');
        await expect(client.connectEnterprise({
            serverUrl: 'https://enterprise.example.com',
            token: 'not-a-token',
        })).rejects.toThrow('Token 格式不正确');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('manages hosted review reports through the active Axhub bearer connection', async () => {
        const homeDir = createTempRoot();
        const calls = [];
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            calls.push({ url, init });
            if (url.endsWith('/me')) {
                return new Response(JSON.stringify({ code: 0, data: { name: 'Token', isPlus: true } }), { status: 200 });
            }
            if (url.endsWith('/review-submit-config') && init?.method === 'PUT') {
                return new Response(JSON.stringify({
                    code: 0,
                    data: { pid: 11, path: 'demo', submitEnabled: true, reviewReportCount: 2 },
                }), { status: 200 });
            }
            if (url.endsWith('/review-reports') && init?.method === 'DELETE') {
                return new Response(JSON.stringify({
                    code: 0,
                    data: { pid: 11, path: 'demo', deleted: 2, reviewReportCount: 0 },
                }), { status: 200 });
            }
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    pid: 11,
                    path: 'demo',
                    reports: [{
                            id: 'review-one',
                            title: '需求评审',
                            reviewer: '产品团队',
                            createdAt: '2026-07-14T01:00:00.000Z',
                            source: 'ai-agent',
                            path: '.axhub-review/reports/review-one.json',
                            content: '# 需求评审\n',
                            payloadHash: 'hash-one',
                        }],
                },
            }), { status: 200 });
        }));
        const client = createAxhubAuthClient({ serverInfoHomeDir: homeDir });
        await client.connectEnterprise({ serverUrl: 'https://enterprise.example.com', token: 'axent_secret_123' });
        const config = await client.updateHtmlProjectReviewConfig(11, true);
        const reports = await client.listHtmlProjectReviewReports(11);
        const cleared = await client.clearHtmlProjectReviewReports(11);
        expect(config).toMatchObject({ submitEnabled: true, reviewReportCount: 2 });
        expect(reports.reports[0]).toMatchObject({ id: 'review-one', payloadHash: 'hash-one' });
        expect(cleared).toMatchObject({ deleted: 2, reviewReportCount: 0 });
        for (const call of calls.slice(1)) {
            expect((call.init?.headers).Authorization).toBe('Bearer axent_secret_123');
        }
    });
    it('publishes HTML with the local review context in the existing request body', async () => {
        const homeDir = createTempRoot();
        let publishBody = null;
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            if (url.endsWith('/me')) {
                return new Response(JSON.stringify({ code: 0, data: { name: 'Token', isPlus: true } }), { status: 200 });
            }
            publishBody = JSON.parse(String(init?.body || '{}'));
            return new Response(JSON.stringify({
                code: 0,
                data: { pid: 11, name: 'Demo', path: 'demo', url: '/html/demo/', htmlUsedSpace: 10, generateTime: '2026-07-14T01:00:00.000Z' },
            }), { status: 200 });
        }));
        const client = createAxhubAuthClient({ serverInfoHomeDir: homeDir });
        await client.connectEnterprise({ serverUrl: 'https://enterprise.example.com', token: 'axent_secret_123' });
        await client.publishHtmlProject(11, [{
                path: 'index.html',
                contentType: 'text/html',
                body: Buffer.from('<h1>Demo</h1>'),
            }], {
            projectId: 'local-project',
            prototypeId: 'home',
        });
        expect(publishBody.reviewContext).toEqual({ projectId: 'local-project', prototypeId: 'home' });
    });
    it('maps an upstream bearer rejection to an expired Axhub account error', async () => {
        const homeDir = createTempRoot();
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url.endsWith('/me')) {
                return new Response(JSON.stringify({ code: 0, data: { name: 'Token', isPlus: true } }), { status: 200 });
            }
            return new Response(JSON.stringify({ code: 401, message: '未授权' }), { status: 200 });
        }));
        const client = createAxhubAuthClient({ serverInfoHomeDir: homeDir });
        await client.connectEnterprise({ serverUrl: 'https://enterprise.example.com', token: 'axent_secret_123' });
        await expect(client.listHtmlProjectReviewReports(11)).rejects.toMatchObject({
            status: 401,
            code: 'AXHUB_AUTH_EXPIRED',
        });
    });
});
