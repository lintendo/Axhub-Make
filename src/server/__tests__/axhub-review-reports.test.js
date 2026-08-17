import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, setActiveProject, startTestServer, writeJson, writeProjectMetadata, } from './projects-api.helpers';
import { createProjectCommunicationStore, getGlobalMakeStateDir } from '../projectCore/index.ts';
afterEach(() => {
    vi.unstubAllGlobals();
    cleanupProjectApiTestRoots();
});
function writePrototype(projectRoot, prototypeId = 'home') {
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', prototypeId);
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    return prototypeDir;
}
async function readJsonResponse(response) {
    return {
        status: response.status,
        body: await response.json().catch(() => ({})),
    };
}
async function createReviewServer(projectId = 'axhub-review-client') {
    const projectRoot = createTempRoot();
    const registryHome = createTempRoot('axhub-review-home-');
    const prototypeDir = writePrototype(projectRoot);
    writeProjectMetadata(projectRoot, {
        project: { id: projectId, name: 'Axhub Review Client' },
        resources: {
            prototypes: [{ id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' }],
            themes: [],
        },
        navigation: { prototypes: ['home'] },
    });
    const server = await startTestServer(projectRoot, registryHome);
    await registerProject(server.origin, projectRoot, projectId, 'Axhub Review Client');
    await setActiveProject(server.origin, projectId);
    return { projectRoot, prototypeDir, registryHome, server };
}
function writeEnterpriseAuth(registryHome) {
    writeJson(path.join(getGlobalMakeStateDir(registryHome), 'axhub-auth.json'), {
        enterprise: {
            provider: 'enterprise',
            serverUrl: 'https://enterprise.test',
            token: 'axent_review_test',
            tokenPrefix: 'axent_review',
            name: 'Review test token',
            role: 'service',
            scopes: ['html:read', 'html:publish'],
        },
    });
}
function writeAxhubPublishBinding(prototypeDir, binding) {
    const projectRoot = path.resolve(prototypeDir, '..', '..', '..');
    const store = createProjectCommunicationStore(projectRoot);
    store.ensureDirectories();
    store.appendExportRecord({
        projectId: binding.projectId,
        resourceId: binding.prototypeId,
        resourceType: 'prototype',
        operationType: 'cloud.publish.axhub',
        status: 'success',
        timestamp: binding.publishedAt,
        metadata: {
            path: `src/prototypes/${binding.prototypeId}`,
            url: binding.url,
            axhubProjectId: binding.pid,
            axhubProjectPath: binding.path,
            prototypeId: binding.prototypeId,
        },
    });
}
describe('Axhub hosted review report APIs', () => {
    it('returns an explicit unbound state until the prototype is republished', async () => {
        const { registryHome, server } = await createReviewServer();
        writeEnterpriseAuth(registryHome);
        const originalFetch = globalThis.fetch;
        const upstreamRequests = [];
        vi.stubGlobal('fetch', vi.fn(async (input, init) => {
            const requestUrl = String(input);
            if (requestUrl.startsWith('https://enterprise.test/')) {
                upstreamRequests.push(requestUrl);
                return new Response(JSON.stringify({ code: 0, data: {} }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return originalFetch(input, init);
        }));
        try {
            const result = await fetch(`${server.origin}/api/review-reports/axhub-config?projectId=axhub-review-client&prototypeId=home`).then(readJsonResponse);
            expect(result).toEqual({
                status: 200,
                body: {
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    bound: false,
                    submitEnabled: false,
                    reviewReportCount: 0,
                },
            });
            expect(upstreamRequests).toEqual([]);
        }
        finally {
            await server.close();
        }
    });
    it('reads and updates the bound hosted submission config through the Axhub account', async () => {
        const { prototypeDir, registryHome, server } = await createReviewServer();
        writeAxhubPublishBinding(prototypeDir, {
            pid: 22,
            path: 'old-hosted-review',
            url: 'https://enterprise.test/html/old-hosted-review/',
            projectId: 'axhub-review-client',
            prototypeId: 'home',
            publishedAt: '2026-07-14T01:00:00.000Z',
        });
        writeAxhubPublishBinding(prototypeDir, {
            pid: 23,
            path: 'hosted-review',
            url: 'https://enterprise.test/html/hosted-review/',
            projectId: 'axhub-review-client',
            prototypeId: 'home',
            publishedAt: '2026-07-14T02:00:00.000Z',
        });
        writeEnterpriseAuth(registryHome);
        const originalFetch = globalThis.fetch;
        const upstreamRequests = [];
        vi.stubGlobal('fetch', vi.fn(async (input, init) => {
            const requestUrl = String(input);
            if (!requestUrl.startsWith('https://enterprise.test/')) {
                return originalFetch(input, init);
            }
            const method = init?.method || 'GET';
            upstreamRequests.push({
                url: requestUrl,
                method,
                body: init?.body ? JSON.parse(String(init.body)) : null,
            });
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    pid: 23,
                    path: 'hosted-review',
                    submitEnabled: method === 'GET',
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    reviewReportCount: 2,
                    reviewReportBytes: 128,
                    maxReportCount: 50,
                    maxReportBytes: 524288,
                    maxTotalReportBytes: 26214400,
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        try {
            const initial = await fetch(`${server.origin}/api/review-reports/axhub-config?projectId=axhub-review-client&prototypeId=home`).then(readJsonResponse);
            expect(initial).toMatchObject({
                status: 200,
                body: {
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    bound: true,
                    submitEnabled: true,
                    reviewReportCount: 2,
                    binding: {
                        pid: 23,
                        path: 'hosted-review',
                        url: 'https://enterprise.test/html/hosted-review/',
                    },
                },
            });
            const updated = await fetch(`${server.origin}/api/review-reports/axhub-config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    submitEnabled: false,
                }),
            }).then(readJsonResponse);
            expect(updated).toMatchObject({
                status: 200,
                body: {
                    bound: true,
                    submitEnabled: false,
                    reviewReportCount: 2,
                },
            });
            expect(upstreamRequests).toEqual([
                {
                    url: 'https://enterprise.test/api/runtime/axhub/html-projects/23/review-submit-config',
                    method: 'GET',
                    body: null,
                },
                {
                    url: 'https://enterprise.test/api/runtime/axhub/html-projects/23/review-submit-config',
                    method: 'PUT',
                    body: { enabled: false },
                },
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('converts a missing remote review endpoint into a local friendly service error', async () => {
        const { prototypeDir, registryHome, server } = await createReviewServer();
        writeAxhubPublishBinding(prototypeDir, {
            pid: 512211,
            path: '912a29b4d57f2e98',
            url: 'https://axhub.im/html/912a29b4d57f2e98/',
            projectId: 'axhub-review-client',
            prototypeId: 'home',
            publishedAt: '2026-07-15T01:25:11.659Z',
        });
        writeEnterpriseAuth(registryHome);
        const originalFetch = globalThis.fetch;
        vi.stubGlobal('fetch', vi.fn(async (input, init) => {
            if (!String(input).startsWith('https://enterprise.test/')) {
                return originalFetch(input, init);
            }
            return new Response('Not Found', { status: 404 });
        }));
        try {
            const result = await fetch(`${server.origin}/api/review-reports/axhub-config?projectId=axhub-review-client&prototypeId=home`).then(readJsonResponse);
            expect(result).toEqual({
                status: 503,
                body: {
                    error: 'Axhub 在线评审服务暂不可用',
                    code: 'AXHUB_REVIEW_SERVICE_UNAVAILABLE',
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('downloads hosted reports to stable local files with Axhub identity metadata', async () => {
        const { prototypeDir, registryHome, server } = await createReviewServer();
        writeAxhubPublishBinding(prototypeDir, {
            pid: 23,
            path: 'hosted-review',
            url: 'https://enterprise.test/html/hosted-review/',
            projectId: 'axhub-review-client',
            prototypeId: 'home',
            publishedAt: '2026-07-14T02:00:00.000Z',
        });
        writeEnterpriseAuth(registryHome);
        const originalFetch = globalThis.fetch;
        vi.stubGlobal('fetch', vi.fn(async (input, init) => {
            const requestUrl = String(input);
            if (!requestUrl.startsWith('https://enterprise.test/')) {
                return originalFetch(input, init);
            }
            expect(requestUrl).toBe('https://enterprise.test/api/runtime/axhub/html-projects/23/review-reports');
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    pid: 23,
                    path: 'hosted-review',
                    submitEnabled: true,
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    reviewReportCount: 2,
                    reports: [
                        {
                            id: 'remote-old',
                            title: '旧原型报告',
                            reviewer: 'Bob',
                            createdAt: '2026-07-13T03:00:00.000Z',
                            source: 'agent-review',
                            path: 'hosted-review',
                            content: '# 旧原型报告\n',
                            contentBytes: 20,
                            payloadHash: 'hash-old',
                            projectId: 'previous-client',
                            prototypeId: 'previous-prototype',
                        },
                        {
                            id: 'remote-a',
                            title: '线上路径 "C:\\reviews"',
                            reviewer: 'Alice',
                            createdAt: '2026-07-14T03:00:00.000Z',
                            score: 88,
                            source: 'agent-review',
                            path: 'hosted-review',
                            content: '---\ntitle: "嵌入元数据"\nreviewer: "旧签名"\n---\n\n# 线上需求评审\n\n首版内容。\n',
                            contentBytes: 42,
                            payloadHash: 'hash-a-v1',
                            projectId: 'axhub-review-client',
                            prototypeId: 'home',
                        },
                    ],
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        try {
            const synced = await fetch(`${server.origin}/api/review-reports/axhub-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'axhub-review-client', prototypeId: 'home' }),
            }).then(readJsonResponse);
            expect(synced).toEqual({
                status: 200,
                body: {
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    created: 1,
                    updated: 0,
                    unchanged: 0,
                    changedReportIds: ['remote-a'],
                },
            });
            const localPath = path.join(prototypeDir, '.spec', 'reviews', 'axhub-remote-a.md');
            expect(fs.existsSync(localPath)).toBe(true);
            expect(fs.readFileSync(localPath, 'utf8')).toContain([
                'title: "线上路径 \\"C:\\\\reviews\\""',
                'reviewer: "Alice"',
                'createdAt: 2026-07-14T03:00:00.000Z',
                'source: "agent-review"',
                'score: 88',
                'axhubReportId: "remote-a"',
                'axhubPayloadHash: "hash-a-v1"',
                '---',
                '',
                '# 线上需求评审',
            ].join('\n'));
            expect(fs.readFileSync(localPath, 'utf8')).not.toContain('title: "嵌入元数据"');
            const listed = await fetch(`${server.origin}/api/review-reports?projectId=axhub-review-client&prototypeId=home`).then(readJsonResponse);
            expect(listed).toMatchObject({
                status: 200,
                body: {
                    reports: [{
                            id: 'axhub-remote-a',
                            title: '线上路径 "C:\\reviews"',
                            reviewer: 'Alice',
                            score: 88,
                            source: 'agent-review',
                        }],
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('uses remote id and payload hash for idempotent create, update, and restore sync', async () => {
        const { prototypeDir, registryHome, server } = await createReviewServer();
        writeAxhubPublishBinding(prototypeDir, {
            pid: 23,
            path: 'hosted-review',
            url: 'https://enterprise.test/html/hosted-review/',
            projectId: 'axhub-review-client',
            prototypeId: 'home',
            publishedAt: '2026-07-14T02:00:00.000Z',
        });
        writeEnterpriseAuth(registryHome);
        const reports = [{
                id: 'remote-a',
                title: '线上需求评审',
                reviewer: 'Alice',
                createdAt: '2026-07-14T03:00:00.000Z',
                source: 'agent-review',
                path: 'hosted-review',
                content: '# 初版\n',
                contentBytes: 8,
                payloadHash: 'hash-a-v1',
                projectId: 'axhub-review-client',
                prototypeId: 'home',
            }];
        const originalFetch = globalThis.fetch;
        vi.stubGlobal('fetch', vi.fn(async (input, init) => {
            if (!String(input).startsWith('https://enterprise.test/')) {
                return originalFetch(input, init);
            }
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    pid: 23,
                    path: 'hosted-review',
                    submitEnabled: true,
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    reviewReportCount: reports.length,
                    reports,
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        const sync = () => fetch(`${server.origin}/api/review-reports/axhub-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: 'axhub-review-client', prototypeId: 'home' }),
        }).then(readJsonResponse);
        const localPath = path.join(prototypeDir, '.spec', 'reviews', 'axhub-remote-a.md');
        try {
            expect(await sync()).toMatchObject({
                status: 200,
                body: { created: 1, updated: 0, unchanged: 0, changedReportIds: ['remote-a'] },
            });
            expect(await sync()).toMatchObject({
                status: 200,
                body: { created: 0, updated: 0, unchanged: 1, changedReportIds: [] },
            });
            reports[0].content = '# 更新版\n';
            reports[0].payloadHash = 'hash-a-v2';
            expect(await sync()).toMatchObject({
                status: 200,
                body: { created: 0, updated: 1, unchanged: 0, changedReportIds: ['remote-a'] },
            });
            expect(fs.readFileSync(localPath, 'utf8')).toContain('# 更新版');
            fs.unlinkSync(localPath);
            expect(await sync()).toMatchObject({
                status: 200,
                body: { created: 1, updated: 0, unchanged: 0, changedReportIds: ['remote-a'] },
            });
            reports.splice(0);
            expect(await sync()).toMatchObject({
                status: 200,
                body: { created: 0, updated: 0, unchanged: 0, changedReportIds: [] },
            });
            expect(fs.existsSync(localPath)).toBe(true);
        }
        finally {
            await server.close();
        }
    });
    it('reports a stale binding when the hosted project context no longer matches', async () => {
        const { prototypeDir, registryHome, server } = await createReviewServer();
        writeAxhubPublishBinding(prototypeDir, {
            pid: 23,
            path: 'hosted-review',
            url: 'https://enterprise.test/html/hosted-review/',
            projectId: 'axhub-review-client',
            prototypeId: 'home',
            publishedAt: '2026-07-14T02:00:00.000Z',
        });
        writeEnterpriseAuth(registryHome);
        const originalFetch = globalThis.fetch;
        vi.stubGlobal('fetch', vi.fn(async (input, init) => {
            if (!String(input).startsWith('https://enterprise.test/')) {
                return originalFetch(input, init);
            }
            if (String(input).endsWith('/review-reports')) {
                return new Response(JSON.stringify({
                    code: 0,
                    data: {
                        pid: 23,
                        path: 'hosted-review',
                        submitEnabled: true,
                        projectId: 'another-client',
                        prototypeId: 'another-prototype',
                        reviewReportCount: 0,
                        reports: [],
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    pid: 23,
                    path: 'hosted-review',
                    submitEnabled: true,
                    projectId: 'another-client',
                    prototypeId: 'another-prototype',
                    reviewReportCount: 0,
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        try {
            const result = await fetch(`${server.origin}/api/review-reports/axhub-config?projectId=axhub-review-client&prototypeId=home`).then(readJsonResponse);
            expect(result).toMatchObject({
                status: 409,
                body: {
                    code: 'AXHUB_REVIEW_BINDING_INVALID',
                    error: 'Axhub 发布绑定已失效，请重新发布',
                },
            });
            const syncResult = await fetch(`${server.origin}/api/review-reports/axhub-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'axhub-review-client', prototypeId: 'home' }),
            }).then(readJsonResponse);
            expect(syncResult).toMatchObject({
                status: 409,
                body: { code: 'AXHUB_REVIEW_BINDING_INVALID' },
            });
        }
        finally {
            await server.close();
        }
    });
    it('rejects unsafe remote report ids before resolving a local file path', async () => {
        const { prototypeDir, registryHome, server } = await createReviewServer();
        writeAxhubPublishBinding(prototypeDir, {
            pid: 23,
            path: 'hosted-review',
            url: 'https://enterprise.test/html/hosted-review/',
            projectId: 'axhub-review-client',
            prototypeId: 'home',
            publishedAt: '2026-07-14T02:00:00.000Z',
        });
        writeEnterpriseAuth(registryHome);
        const originalFetch = globalThis.fetch;
        vi.stubGlobal('fetch', vi.fn(async (input, init) => {
            if (!String(input).startsWith('https://enterprise.test/')) {
                return originalFetch(input, init);
            }
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    pid: 23,
                    path: 'hosted-review',
                    submitEnabled: true,
                    projectId: 'axhub-review-client',
                    prototypeId: 'home',
                    reviewReportCount: 1,
                    reports: [{
                            id: '../../../outside',
                            title: 'Unsafe',
                            reviewer: 'Mallory',
                            createdAt: '2026-07-14T03:00:00.000Z',
                            source: 'agent-review',
                            content: '# Unsafe\n',
                            contentBytes: 9,
                            payloadHash: 'unsafe-hash',
                            projectId: 'axhub-review-client',
                            prototypeId: 'home',
                        }],
                },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        try {
            const result = await fetch(`${server.origin}/api/review-reports/axhub-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'axhub-review-client', prototypeId: 'home' }),
            }).then(readJsonResponse);
            expect(result).toMatchObject({
                status: 502,
                body: { code: 'AXHUB_REVIEW_REPORT_INVALID' },
            });
            expect(fs.existsSync(path.join(prototypeDir, '.spec', 'outside.md'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
});
