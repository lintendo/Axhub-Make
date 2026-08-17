import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAcpConversationRunState, resolveAiRunTimeoutMs, } from '../managementApi.aiRuns.ts';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, setActiveProject, startTestServer, writeJson, writeProjectMetadata, } from './projects-api.helpers';
const acpChatServers = [];
function sseJson(chunk) {
    return `data: ${JSON.stringify(chunk)}\n\n`;
}
async function readRequestBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString('utf8');
}
async function startAcpRunTestServer(options = {}) {
    const requests = [];
    const recordsRequests = [];
    const server = createServer(async (req, res) => {
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end('<!doctype html><title>Mock ACP UI</title>');
            return;
        }
        if (req.method === 'GET' && req.url === '/api/chat') {
            res.writeHead(405, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        if (req.method === 'OPTIONS' && req.url === '/api/chat') {
            const origin = String(req.headers.origin || '*');
            res.writeHead(204, {
                'access-control-allow-origin': origin,
                'access-control-allow-methods': 'POST, OPTIONS',
                'access-control-allow-headers': 'content-type',
            });
            res.end();
            return;
        }
        if (req.method === 'POST' && req.url === '/api/chat') {
            const rawBody = await readRequestBody(req);
            const body = rawBody ? JSON.parse(rawBody) : {};
            requests.push({ method: req.method, url: req.url, body });
            if (options.chatError) {
                res.writeHead(options.chatError.status, { 'content-type': 'application/json' });
                res.end(JSON.stringify(options.chatError.body));
                return;
            }
            res.writeHead(200, {
                'content-type': 'text/event-stream',
                'x-acp-provider': String(body.provider || 'codex'),
                'x-acp-thread-id': encodeURIComponent(String(body.threadId || 'default')),
                'x-acp-session-id': `session-${body.threadId || 'default'}`,
            });
            for (const event of options.streamEvents || [
                { type: 'text-delta', delta: 'done' },
                { type: 'finish', finishReason: 'stop' },
            ]) {
                res.write(sseJson(event));
            }
            res.end('data: [DONE]\n\n');
            return;
        }
        if (req.method === 'GET' && req.url?.startsWith('/api/tools/image-generation/records')) {
            recordsRequests.push({ method: req.method, url: req.url });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(options.recordsResponse || {
                records: [
                    {
                        id: 'record-fallback',
                        status: 'succeeded',
                        revisedPrompt: 'fallback prompt',
                        images: [
                            { url: 'data:image/png;base64,ZmFsbGJhY2s=', fileName: 'fallback.png', mimeType: 'image/png' },
                        ],
                    },
                ],
            }));
            return;
        }
        res.writeHead(404).end();
    });
    acpChatServers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to start ACP run test server');
    }
    return {
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        recordsRequests,
    };
}
async function startRegisteredTestServer(projectRoot, acp, serverConfig = {}) {
    const server = await startTestServer(projectRoot, createTempRoot('axhub-ai-runs-home-'), {
        serverConfig: {
            ...serverConfig,
            assistant: {
                webBaseUrl: acp.origin,
                apiBaseUrl: `${acp.origin}/api`,
                ...(serverConfig.assistant || {}),
            },
        },
    });
    try {
        const projectId = String(JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'project.json'), 'utf8'))?.project?.id || path.basename(projectRoot));
        await registerProject(server.origin, projectRoot, projectId, projectId);
        return { ...server, projectId };
    }
    catch (error) {
        await server.close();
        throw error;
    }
}
function projectAiRunsUrl(server) {
    return `${server.origin}/api/ai/runs?projectId=${encodeURIComponent(server.projectId)}`;
}
async function collectRunEvents(response) {
    const text = await response.text();
    return text
        .split(/\r?\n\r?\n/u)
        .map((rawEvent) => rawEvent.trim())
        .filter(Boolean)
        .map((rawEvent) => {
        const event = rawEvent
            .split(/\r?\n/u)
            .find((line) => line.startsWith('event:'))
            ?.slice('event:'.length)
            .trim() || 'message';
        const data = rawEvent
            .split(/\r?\n/u)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice('data:'.length).trim())
            .join('\n');
        return {
            event,
            data: data ? JSON.parse(data) : null,
        };
    });
}
afterEach(async () => {
    for (const server of acpChatServers.splice(0)) {
        await new Promise((resolve) => server.close(() => resolve()));
    }
    cleanupProjectApiTestRoots();
});
describe('AI runs API', () => {
    it('rejects a missing projectId before invoking ACP', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-project-required-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-project-required', name: 'AI Runs Project Required' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(`${server.origin}/api/ai/runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '不应执行',
                }),
            });
            expect(response.status).toBe(400);
            expect(await response.json()).toMatchObject({
                ok: false,
                code: 'PROJECT_ID_REQUIRED',
                error: 'Project-scoped API requires projectId',
            });
            expect(acp.requests).toHaveLength(0);
        }
        finally {
            await server.close();
        }
    });
    it('runs and persists against the explicit project while another project is active', async () => {
        const projectARoot = createTempRoot('axhub-ai-runs-scope-a-');
        const projectBRoot = createTempRoot('axhub-ai-runs-scope-b-');
        for (const [root, id] of [[projectARoot, 'ai-runs-scope-a'], [projectBRoot, 'ai-runs-scope-b']]) {
            writeProjectMetadata(root, {
                project: { id, name: id },
                resourceWriteTargets: {
                    prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
                },
            });
        }
        const acp = await startAcpRunTestServer({
            streamEvents: [
                {
                    type: 'diff',
                    toolCallId: 'tool-call-project-b',
                    path: 'src/resources/project-b.md',
                    oldText: '',
                    newText: 'project b',
                    patch: '@@ -0,0 +1 @@',
                },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startTestServer(projectARoot, createTempRoot('axhub-ai-runs-scope-registry-'), {
            serverConfig: {
                assistant: {
                    webBaseUrl: acp.origin,
                    apiBaseUrl: `${acp.origin}/api`,
                },
            },
        });
        try {
            await registerProject(server.origin, projectARoot, 'ai-runs-scope-a');
            await registerProject(server.origin, projectBRoot, 'ai-runs-scope-b');
            await setActiveProject(server.origin, 'ai-runs-scope-a');
            const response = await fetch(`${server.origin}/api/ai/runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: 'ai-runs-scope-b',
                    scene: 'document',
                    prompt: '写入 B 项目',
                    targetPath: 'prototypes/home',
                    taskId: 'task-project-b',
                    conversationId: 'conversation-project-b',
                    canvasId: 'canvas-project-b',
                }),
            });
            await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(acp.requests[0].body.workspacePath).toBe(projectBRoot);
            expect(fs.existsSync(path.join(projectBRoot, 'src/prototypes/home/.spec/generation-artifacts.json'))).toBe(true);
            expect(fs.existsSync(path.join(projectBRoot, 'src/prototypes/home/.spec/generation-tasks.json'))).toBe(true);
            expect(fs.existsSync(path.join(projectARoot, 'src/prototypes/home/.spec/generation-artifacts.json'))).toBe(false);
            expect(fs.existsSync(path.join(projectARoot, 'src/prototypes/home/.spec/generation-tasks.json'))).toBe(false);
            expect(await fetch(`${server.origin}/api/projects/active`).then((value) => value.json())).toMatchObject({
                id: 'ai-runs-scope-a',
            });
        }
        finally {
            await server.close();
        }
    });
    it('blocks prototype Agent runs until the target prototype has a main spec', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-prototype-spec-required-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-prototype-spec-required', name: 'Prototype Spec Required' },
            resources: {
                prototypes: [{
                        id: 'home',
                        name: 'home',
                        title: 'Home',
                        clientUrl: 'http://localhost:3000/home',
                        filePath: 'src/prototypes/home/index.tsx',
                    }],
                themes: [],
            },
        });
        const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
        fs.mkdirSync(prototypeDir, { recursive: true });
        fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'prototype',
                    targetPath: 'prototypes/home',
                    prompt: '更新首页',
                }),
            });
            expect(response.status).toBe(409);
            expect(await response.json()).toMatchObject({
                code: 'PROTOTYPE_SPEC_REQUIRED',
                action: 'open-prototype-spec',
                prototypeId: 'home',
            });
            expect(acp.requests).toHaveLength(0);
        }
        finally {
            await server.close();
        }
    });
    it('applies the prototype spec gate to source-file target paths', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-prototype-spec-source-path-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-prototype-spec-source-path', name: 'Prototype Spec Source Path' },
            resources: {
                prototypes: [{
                        id: 'home',
                        name: 'home',
                        title: 'Home',
                        clientUrl: 'http://localhost:3000/home',
                        filePath: 'src/prototypes/home/index.tsx',
                    }],
                themes: [],
            },
        });
        const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
        fs.mkdirSync(prototypeDir, { recursive: true });
        fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'prototype',
                    targetPath: 'src/prototypes/home/index.tsx',
                    prompt: '更新首页',
                }),
            });
            expect(response.status).toBe(409);
            expect(await response.json()).toMatchObject({
                code: 'PROTOTYPE_SPEC_REQUIRED',
                prototypeId: 'home',
            });
            expect(acp.requests).toHaveLength(0);
        }
        finally {
            await server.close();
        }
    });
    it('adds the preferred main spec to allowed prototype Agent prompts', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-prototype-spec-prompt-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-prototype-spec-prompt', name: 'Prototype Spec Prompt' },
            resources: {
                prototypes: [{
                        id: 'home',
                        name: 'home',
                        title: 'Home',
                        clientUrl: 'http://localhost:3000/home',
                        filePath: 'src/prototypes/home/index.tsx',
                    }],
                themes: [],
            },
        });
        const prototypeDir = path.join(projectRoot, 'src/prototypes/home');
        fs.mkdirSync(path.join(prototypeDir, '.spec'), { recursive: true });
        fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
        fs.writeFileSync(path.join(prototypeDir, '.spec/spec.md'), '# Markdown\n', 'utf8');
        fs.writeFileSync(path.join(prototypeDir, '.spec/spec.html'), '<h1>HTML</h1>\n', 'utf8');
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'prototype',
                    targetPath: 'prototypes/home',
                    prompt: '更新首页',
                }),
            });
            await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('src/prototypes/home/.spec/spec.html');
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('同步更新规格文档');
        }
        finally {
            await server.close();
        }
    });
    it('sends direct-run reference images as ACP image message parts', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-image-context-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-image-context', name: 'AI Runs Direct Image Context' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '根据当前画布继续。',
                    referenceImages: ['data:image/png;base64,dmVycG9ydA=='],
                }),
            });
            await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(acp.requests[0].body.messages[0].parts).toEqual([
                { type: 'text', text: '根据当前画布继续。' },
                { type: 'image', image: 'data:image/png;base64,dmVycG9ydA==' },
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('returns a structured open-settings run error when ACP runtime is unavailable', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-runtime-unavailable-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-runtime-unavailable', name: 'AI Runs Runtime Unavailable' },
        });
        const acp = {
            origin: 'http://127.0.0.1:1',
            requests: [],
            recordsRequests: [],
        };
        const server = await startRegisteredTestServer(projectRoot, acp, {
            assistant: {
                webBaseUrl: 'http://127.0.0.1:1',
                apiBaseUrl: 'http://127.0.0.1:1/api',
            },
        });
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'prototype',
                    prompt: '生成一个 dashboard 页面',
                    autoStart: false,
                }),
            });
            const events = await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(events.map((event) => event.event)).toEqual([
                'run.accepted',
                'run.stage',
                'run.error',
            ]);
            expect(events.at(-1)).toMatchObject({
                event: 'run.error',
                data: {
                    status: 'error',
                    code: 'ACP_RUNTIME_UNAVAILABLE',
                    action: 'open-ai-settings',
                    runtime: expect.objectContaining({
                        webBaseUrl: expect.any(String),
                        apiBaseUrl: expect.any(String),
                        projectPath: projectRoot,
                        health: expect.objectContaining({
                            status: expect.not.stringMatching(/^ready$/u),
                            hints: expect.objectContaining({
                                start: expect.any(String),
                                status: expect.any(String),
                            }),
                        }),
                    }),
                },
            });
            expect(acp.requests).toHaveLength(0);
        }
        finally {
            await server.close();
        }
    });
    it('keeps ACP runs above the long no-response confirmation floor', () => {
        expect(resolveAiRunTimeoutMs('direct', { automation: { acp: { timeout: 30 } } })).toBe(1_200_000);
        expect(resolveAiRunTimeoutMs('prototype', { automation: { acp: { timeout: 30 } } })).toBe(1_200_000);
        expect(resolveAiRunTimeoutMs('image', { automation: { acp: { timeout: 222 } } })).toBe(1_200_000);
    });
    it('resolves completed direct ACP no-response state from the conversation store', () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-no-response-store-');
        const conversationStorePath = path.join(projectRoot, 'src/prototypes/home/.spec/acp/conversations.json');
        fs.mkdirSync(path.dirname(conversationStorePath), { recursive: true });
        fs.writeFileSync(conversationStorePath, JSON.stringify({
            version: 1,
            conversations: [
                {
                    threadId: 'annotation-no-response',
                    provider: 'codex',
                    providerSessionId: 'session-no-response',
                    status: 'active',
                    lastActiveAt: '2026-07-02T17:32:32.832Z',
                },
            ],
            sessions: [
                {
                    threadId: 'annotation-no-response',
                    acpSessionId: 'session-no-response',
                    provider: 'codex',
                    closedAt: null,
                },
            ],
            messages: {
                'annotation-no-response': {
                    headId: 'assistant-message',
                    messages: [
                        {
                            id: 'user-message',
                            role: 'user',
                            content: {
                                parts: [{ type: 'text', text: '修改批注' }],
                                metadata: {
                                    custom: {
                                        acpRun: {
                                            status: 'running',
                                            threadId: 'annotation-no-response',
                                            acpSessionId: 'session-no-response',
                                        },
                                    },
                                },
                            },
                        },
                        {
                            id: 'assistant-message',
                            role: 'assistant',
                            content: {
                                parts: [
                                    { type: 'text', text: '我开始修改 home 节点', state: 'done' },
                                    { type: 'text', text: '完成。已调整样式并清理批注。', state: 'streaming' },
                                ],
                                metadata: {
                                    custom: {
                                        acpRun: {
                                            status: 'completed',
                                            threadId: 'annotation-no-response',
                                            acpSessionId: 'session-no-response',
                                            updatedAt: 1783013552755,
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        }, null, 2), 'utf8');
        const state = resolveAcpConversationRunState({
            conversationStorePath,
            runId: 'annotation-no-response',
            threadId: 'annotation-no-response',
            conversationId: 'annotation-no-response',
            provider: 'codex',
        });
        expect(state).toMatchObject({
            status: 'completed',
            result: {
                id: 'annotation-no-response',
                threadId: 'annotation-no-response',
                provider: 'codex',
                output: '完成。已调整样式并清理批注。',
                finishReason: 'completed',
                runtimeHeaders: {
                    provider: 'codex',
                    threadId: 'annotation-no-response',
                    sessionId: 'session-no-response',
                },
            },
        });
    });
    it('emits run.error and persists task diagnostics when ACP active-run cancellation fails', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-cancel-failed-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-cancel-failed', name: 'AI Runs Cancel Failed' },
            resourceWriteTargets: {
                prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
            },
        });
        const errorBody = {
            error: 'Failed to cancel the active ACP run before sending the new prompt.',
            code: 'ACP_CHAT_CANCEL_FAILED',
            threadId: 'thread-home',
            provider: 'codex',
            cause: 'provider cleanup failed',
        };
        const acp = await startAcpRunTestServer({
            chatError: {
                status: 502,
                body: errorBody,
            },
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '继续修改这个批注。',
                    runId: 'run-cancel-failed',
                    threadId: 'thread-home',
                    conversationId: 'conversation-home',
                    taskId: 'task-cancel-failed',
                    targetPath: 'prototypes/home',
                }),
            });
            const events = await collectRunEvents(response);
            expect(events.map((event) => event.event)).toEqual([
                'run.accepted',
                'run.stage',
                'run.error',
            ]);
            expect(events.at(-1)).toMatchObject({
                event: 'run.error',
                data: {
                    status: 'error',
                    runId: 'run-cancel-failed',
                    threadId: 'thread-home',
                    conversationId: 'conversation-home',
                    code: 'ACP_CHAT_CANCEL_FAILED',
                    error: 'Failed to cancel the active ACP run before sending the new prompt.',
                    details: errorBody,
                },
            });
            const taskPath = path.join(projectRoot, 'src/prototypes/home/.spec/generation-tasks.json');
            const taskHistory = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
            expect(taskHistory.tasks).toEqual([
                expect.objectContaining({
                    id: 'task-cancel-failed',
                    status: 'error',
                    error: 'Failed to cancel the active ACP run before sending the new prompt.',
                    metadata: expect.objectContaining({
                        errorCode: 'ACP_CHAT_CANCEL_FAILED',
                        errorDetails: errorBody,
                    }),
                }),
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('normalizes AI settings provider tests from prompt clients before calling ACP chat', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-agent-provider-test-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-agent-provider-test', name: 'AI Runs Agent Provider Test' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'agent-provider-test',
                    client: 'acp:cursor',
                    prompt: '请只返回 AXHUB_AGENT_TEST_OK，不要返回其他文字。',
                }),
            });
            await collectRunEvents(response);
            expect(acp.requests[0].body).toMatchObject({
                provider: 'cursor',
                workspacePath: projectRoot,
            });
        }
        finally {
            await server.close();
        }
    });
    it('uses independent conversation, annotation, and canvas defaults with explicit request overrides', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-purpose-defaults-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-purpose-defaults', name: 'AI Runs Purpose Defaults' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp, {
            automation: {
                conversationPromptClient: 'acp:qoder',
                conversationModel: 'conversation-model',
                annotationPromptClient: 'acp:cursor',
                annotationModel: 'annotation-model',
                canvasPromptClient: 'acp:codebuddy',
                canvasModel: 'canvas-model',
            },
        });
        try {
            for (const body of [
                { scene: 'direct', prompt: '对话' },
                { scene: 'prototype-review-direct', prompt: '评审' },
                { scene: 'canvas-page-direct', prompt: '画布' },
                {
                    scene: 'direct',
                    prompt: '显式覆盖',
                    preferredPromptClient: 'acp:reasonix',
                    model: 'explicit-model',
                },
            ]) {
                const response = await fetch(projectAiRunsUrl(server), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                await collectRunEvents(response);
                expect(response.status).toBe(200);
            }
            expect(acp.requests.map((request) => ({
                provider: request.body.provider,
                model: request.body.model,
            }))).toEqual([
                { provider: 'qoder', model: 'conversation-model' },
                { provider: 'cursor', model: 'annotation-model' },
                { provider: 'codebuddy', model: 'canvas-model' },
                { provider: 'reasonix', model: 'explicit-model' },
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('streams image generation artifacts through one unified AI run endpoint', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-image-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-image', name: 'AI Runs Image' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                { type: 'text-delta', delta: 'starting' },
                {
                    type: 'tool-output-available',
                    toolCallId: 'tool-call-image-1',
                    toolName: 'generate_image',
                    output: {
                        status: 'succeeded',
                        recordId: 'record-one',
                        revisedPrompt: '第一个',
                        images: [
                            { base64: 'b25l', mimeType: 'image/png', fileName: 'one.png' },
                            { url: 'data:image/png;base64,dHdv', revisedPrompt: '第二个', fileName: 'two.png' },
                        ],
                    },
                },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'image',
                    prompt: '生成两张图',
                    params: {
                        size: '1440x896',
                        quality: 'high',
                        output_format: 'png',
                        n: 2,
                    },
                }),
            });
            const events = await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/event-stream');
            expect(events.map((event) => event.event)).toEqual([
                'run.accepted',
                'run.stage',
                'run.text.delta',
                'artifact.created',
                'artifact.created',
                'run.completed',
            ]);
            expect(events.filter((event) => event.event === 'artifact.created').map((event) => event.data.artifact)).toEqual([
                expect.objectContaining({
                    kind: 'image',
                    operation: 'created',
                    dataUrl: 'data:image/png;base64,b25l',
                    revisedPrompt: '第一个',
                    metadata: expect.objectContaining({ fileName: 'one.png' }),
                }),
                expect.objectContaining({
                    kind: 'image',
                    operation: 'created',
                    dataUrl: 'data:image/png;base64,dHdv',
                    revisedPrompt: '第二个',
                    metadata: expect.objectContaining({ fileName: 'two.png' }),
                }),
            ]);
            expect(events.at(-1)?.data).toMatchObject({
                status: 'done',
                output: 'starting',
                artifacts: [
                    expect.objectContaining({ kind: 'image' }),
                    expect.objectContaining({ kind: 'image' }),
                ],
            });
            expect(acp.requests[0].body).toMatchObject({
                provider: 'codex',
                workspacePath: projectRoot,
                builtinTools: ['image-generation'],
            });
            expect(acp.requests[0].body.params).toBeUndefined();
            expect(acp.requests[0].body.settings).toBeUndefined();
            expect(acp.requests[0].body.messages).toEqual([
                expect.objectContaining({
                    role: 'user',
                    parts: [
                        expect.objectContaining({
                            type: 'text',
                            text: expect.stringContaining('Requested image parameters:'),
                        }),
                    ],
                }),
            ]);
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('- size: 1440x896');
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('- quality: high');
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('- count: 2');
            expect(acp.requests[0].body.builtinToolSettings).toEqual({
                imageGeneration: {
                    baseUrl: 'https://api.openai.com/v1',
                    model: 'gpt-image-2',
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('does not forward prototype settings as structured ACP chat fields', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-prototype-settings-prompt-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-prototype-settings-prompt', name: 'AI Runs Prototype Settings Prompt' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'prototype',
                    prompt: [
                        '生成 CRM 首页',
                        '',
                        '原型生成设置：',
                        '- 生成数量：3 个',
                        '- 设计系统：linear',
                    ].join('\n'),
                    settings: {
                        count: 3,
                        themeName: 'linear',
                    },
                }),
            });
            await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(acp.requests[0].body.params).toBeUndefined();
            expect(acp.requests[0].body.settings).toBeUndefined();
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('原型生成设置：');
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('- 生成数量：3 个');
            expect(acp.requests[0].body.messages[0].parts[0].text).toContain('- 设计系统：linear');
        }
        finally {
            await server.close();
        }
    });
    it('passes per-run image generation settings from settings tests to ACP', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-image-settings-test-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-image-settings-test', name: 'AI Runs Image Settings Test' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp, {
            ai: {
                imageGeneration: {
                    baseUrl: 'https://saved.example.com/v1',
                    apiKey: 'sk-saved',
                    model: 'saved-image-model',
                },
            },
        });
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'image',
                    prompt: '测试图片配置',
                    builtinToolSettings: {
                        imageGeneration: {
                            baseUrl: 'https://current.example.com/v1',
                            apiKey: 'sk-current',
                            model: 'current-image-model',
                        },
                    },
                }),
            });
            await collectRunEvents(response);
            expect(acp.requests[0].body.builtinToolSettings).toEqual({
                imageGeneration: {
                    baseUrl: 'https://current.example.com/v1',
                    apiKey: 'sk-current',
                    model: 'current-image-model',
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('enables image generation builtin tool for direct annotation runs with image settings', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-image-settings-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-image-settings', name: 'AI Runs Direct Image Settings' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp, {
            ai: {
                imageGeneration: {
                    baseUrl: 'https://saved.example.com/v1',
                    apiKey: 'sk-saved',
                    model: 'saved-image-model',
                },
            },
        });
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '这个批注需要生成一张参考图。',
                    builtinToolSettings: {
                        imageGeneration: {
                            baseUrl: 'https://current.example.com/v1',
                            apiKey: 'sk-current',
                            model: 'current-image-model',
                        },
                    },
                }),
            });
            await collectRunEvents(response);
            expect(acp.requests[0].body).toMatchObject({
                builtinTools: ['image-generation'],
                builtinToolSettings: {
                    imageGeneration: {
                        baseUrl: 'https://current.example.com/v1',
                        apiKey: 'sk-current',
                        model: 'current-image-model',
                    },
                },
            });
            expect(acp.requests[0].body.mcpServers).toBeUndefined();
        }
        finally {
            await server.close();
        }
    });
    it('forwards per-run MCP servers to direct ACP runs', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-mcp-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-mcp', name: 'AI Runs Direct MCP' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '在当前画布新增节点。',
                    mcpServers: [{
                            name: 'axhub-canvas',
                            type: 'http',
                            url: `${server.origin}/api/mcp/axhub-canvas`,
                            headers: [{
                                    name: 'x-axhub-canvas-mcp-token',
                                    value: 'canvas-secret',
                                }],
                        }],
                }),
            });
            await collectRunEvents(response);
            expect(acp.requests[0].body.mcpServers).toEqual([{
                    name: 'axhub-canvas',
                    type: 'http',
                    url: `${server.origin}/api/mcp/axhub-canvas`,
                    headers: [{
                            name: 'x-axhub-canvas-mcp-token',
                            value: 'canvas-secret',
                        }],
                }]);
        }
        finally {
            await server.close();
        }
    });
    it('forwards bypass permissions for direct file runs without MCP servers', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-file-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-file', name: 'AI Runs Direct File' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '直接修改当前画布文件。',
                    permissionMode: 'bypassPermissions',
                }),
            });
            await collectRunEvents(response);
            expect(acp.requests[0].body.permissionMode).toBe('bypassPermissions');
            expect(acp.requests[0].body.mcpServers).toBeUndefined();
        }
        finally {
            await server.close();
        }
    });
    it('forwards prototype conversation store paths to direct ACP runs', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-store-path-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-store-path', name: 'AI Runs Direct Store Path' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        const conversationStorePath = path.join(projectRoot, 'src', 'prototypes', 'home', '.spec', 'acp', 'conversations.json');
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '把当前批注应用到原型。',
                    conversationStorePath,
                }),
            });
            await collectRunEvents(response);
            expect(acp.requests[0].body).toMatchObject({
                conversationStorePath,
            });
        }
        finally {
            await server.close();
        }
    });
    it('uses the shared ACP no-response floor for image runs instead of image-generation timeout settings', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-image-timeout-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-image-timeout', name: 'AI Runs Image Timeout' },
        });
        const acp = await startAcpRunTestServer();
        const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
        const server = await startRegisteredTestServer(projectRoot, acp, {
            automation: {
                acp: {
                    timeout: 222,
                },
            },
            ai: {
                imageGeneration: {
                    timeout: 45,
                },
            },
        });
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'image',
                    prompt: '生成一张图',
                }),
            });
            await collectRunEvents(response);
            expect(timeoutSpy.mock.calls.map(([timeoutMs]) => timeoutMs)).toContain(1_200_000);
            expect(timeoutSpy.mock.calls.map(([timeoutMs]) => timeoutMs)).not.toContain(222_000);
            expect(timeoutSpy.mock.calls.map(([timeoutMs]) => timeoutMs)).not.toContain(45_000);
        }
        finally {
            timeoutSpy.mockRestore();
            await server.close();
        }
    });
    it('removes obsolete execution endpoints instead of keeping compatibility shims', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-old-routes-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-old-routes', name: 'AI Runs Old Routes' },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const withProjectId = (pathname) => (`${server.origin}${pathname}?projectId=${encodeURIComponent(server.projectId)}`);
            const [promptExecute, sessionRun, imageGenerate] = await Promise.all([
                fetch(withProjectId('/api/prompt/execute'), { method: 'POST', body: '{}' }),
                fetch(withProjectId('/api/prototype-generation/session-run'), { method: 'POST', body: '{}' }),
                fetch(withProjectId('/api/ai-image/generate'), { method: 'POST', body: '{}' }),
            ]);
            expect(promptExecute.status).toBe(404);
            expect(sessionRun.status).toBe(404);
            expect(imageGenerate.status).toBe(404);
            expect(acp.requests).toHaveLength(0);
        }
        finally {
            await server.close();
        }
    });
    it('falls back to ACP image records when image tool output is not in the chat stream', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-image-fallback-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-image-fallback', name: 'AI Runs Image Fallback' },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                { type: 'text-delta', delta: 'image record created' },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'image',
                    prompt: '生成 fallback 图',
                    params: { n: 1 },
                }),
            });
            const events = await collectRunEvents(response);
            const artifacts = events.filter((event) => event.event === 'artifact.created').map((event) => event.data.artifact);
            expect(response.status).toBe(200);
            expect(artifacts).toEqual([
                expect.objectContaining({
                    kind: 'image',
                    dataUrl: 'data:image/png;base64,ZmFsbGJhY2s=',
                    revisedPrompt: 'fallback prompt',
                }),
            ]);
            expect(acp.recordsRequests).toHaveLength(1);
            const recordsUrl = new URL(acp.recordsRequests[0].url, acp.origin);
            expect(recordsUrl.pathname).toBe('/api/tools/image-generation/records');
            expect(recordsUrl.searchParams.get('workspacePath')).toBe(projectRoot);
            expect(recordsUrl.searchParams.get('threadId')).toBe(acp.requests[0].body.threadId);
        }
        finally {
            await server.close();
        }
    });
    it('normalizes canvas artifacts from ACP resource links and file diffs', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-artifacts-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-artifacts', name: 'AI Runs Artifacts' },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                {
                    type: 'resource_link',
                    toolCallId: 'tool-call-resource-link',
                    uri: 'file://src/prototypes/home/pages/dashboard.tsx',
                    name: 'Dashboard page',
                    mimeType: 'text/tsx',
                },
                {
                    type: 'resource',
                    toolCallId: 'tool-call-resource',
                    uri: 'file://src/resources/brief.md',
                    name: 'Brief',
                    mimeType: 'text/markdown',
                    text: '# Brief',
                },
                {
                    type: 'diff',
                    toolCallId: 'tool-call-diff',
                    path: 'src/prototypes/home/index.tsx',
                    oldText: 'old',
                    newText: 'new',
                    patch: '@@ -1 +1 @@',
                },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'prototype',
                    prompt: '生成一个 dashboard 页面',
                    canvasId: 'canvas-home',
                    generatorElementId: 'generator-1',
                    targetArtifactId: 'prototype-home',
                }),
            });
            const events = await collectRunEvents(response);
            const artifactEvents = events
                .filter((event) => event.event === 'artifact.created' || event.event === 'artifact.updated');
            expect(response.status).toBe(200);
            expect(artifactEvents.map((event) => event.event)).toEqual([
                'artifact.updated',
            ]);
            expect(artifactEvents.map((event) => event.data.artifact)).toEqual([
                expect.objectContaining({
                    kind: 'prototype',
                    operation: 'updated',
                    target: expect.objectContaining({
                        path: 'src/prototypes/home/index.tsx',
                    }),
                    source: expect.objectContaining({
                        type: 'acp-diff',
                        toolCallId: 'tool-call-diff',
                    }),
                }),
            ]);
            expect(events.at(-1)?.data.artifacts).toHaveLength(1);
        }
        finally {
            await server.close();
        }
    });
    it('persists streamed canvas artifacts into the project generation artifact history', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-artifact-history-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-artifact-history', name: 'AI Runs Artifact History' },
            resourceWriteTargets: {
                prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
            },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                {
                    type: 'resource_link',
                    toolCallId: 'tool-call-drawio',
                    uri: 'file://src/resources/flows/onboarding.drawio.svg',
                    name: 'Onboarding flow',
                    mimeType: 'image/svg+xml',
                },
                {
                    type: 'resource',
                    toolCallId: 'tool-call-plain-svg',
                    uri: 'file://src/resources/icons/plain.svg',
                    name: 'Plain SVG',
                    mimeType: 'image/svg+xml',
                },
                {
                    type: 'diff',
                    toolCallId: 'tool-call-doc',
                    path: 'src/resources/brief.md',
                    oldText: 'old',
                    newText: 'new',
                    patch: '@@ -1 +1 @@',
                },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'document',
                    prompt: '生成流程图和说明文档',
                    targetPath: 'prototypes/home',
                    taskId: 'task-document-history',
                    conversationId: 'conversation-document-history',
                    canvasId: 'canvas-home',
                    generatorElementId: 'generator-history',
                }),
            });
            const events = await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(events.filter((event) => event.event === 'artifact.created' || event.event === 'artifact.updated')).toHaveLength(1);
            const historyPath = path.join(projectRoot, 'src/prototypes/home/.spec/generation-artifacts.json');
            expect(fs.existsSync(historyPath)).toBe(true);
            const stored = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            expect(stored).toMatchObject({
                schemaVersion: 1,
                kind: 'generation-artifacts',
                targetPath: 'prototypes/home',
            });
            expect(stored.artifacts).toHaveLength(1);
            expect(stored.artifacts).toEqual([
                expect.objectContaining({
                    taskId: 'task-document-history',
                    conversationId: 'conversation-document-history',
                    kind: 'document',
                    operation: 'updated',
                    runId: expect.any(String),
                    threadId: expect.any(String),
                    target: expect.objectContaining({ path: 'src/resources/brief.md' }),
                    status: 'done',
                }),
            ]);
            expect(fs.existsSync(path.join(projectRoot, 'src/prototypes/home/.spec/ai-image-history.json'))).toBe(false);
            const historyResponse = await fetch(`${server.origin}/api/ai/artifact-history?targetPath=prototypes/home&projectId=${server.projectId}`);
            const historyBody = await historyResponse.json();
            expect(historyResponse.status).toBe(200);
            expect(historyBody.artifacts).toHaveLength(1);
            expect(historyBody.artifacts.map((artifact) => artifact.kind)).toEqual(['document']);
            const taskPath = path.join(projectRoot, 'src/prototypes/home/.spec/generation-tasks.json');
            expect(fs.existsSync(taskPath)).toBe(true);
            const taskHistory = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
            expect(taskHistory.tasks).toEqual([
                expect.objectContaining({
                    id: 'task-document-history',
                    taskId: 'task-document-history',
                    conversationId: 'conversation-document-history',
                    prompt: '生成流程图和说明文档',
                    status: 'done',
                    runId: expect.any(String),
                    threadId: expect.any(String),
                }),
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('upserts task and artifact history incrementally and revives artifacts reported again after soft delete', async () => {
        const projectRoot = createTempRoot('axhub-ai-history-incremental-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-history-incremental', name: 'AI History Incremental' },
            resourceWriteTargets: {
                prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
            },
        });
        const acp = await startAcpRunTestServer();
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const target = new URLSearchParams({
                targetPath: 'prototypes/home',
                projectId: server.projectId,
            }).toString();
            const [firstArtifact, secondArtifact] = await Promise.all([
                fetch(`${server.origin}/api/ai/artifact-history?${target}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        artifact: {
                            id: 'artifact-a',
                            taskId: 'task-a',
                            conversationId: 'conversation-a',
                            kind: 'document',
                            operation: 'created',
                            title: 'A',
                            source: {},
                            target: { path: 'src/resources/a.md' },
                            createdAt: 1,
                            updatedAt: 1,
                            status: 'done',
                            metadata: {},
                        },
                    }),
                }),
                fetch(`${server.origin}/api/ai/artifact-history?${target}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        artifacts: [{
                                id: 'artifact-b',
                                taskId: 'task-b',
                                conversationId: 'conversation-b',
                                kind: 'document',
                                operation: 'created',
                                title: 'B',
                                source: {},
                                target: { path: 'src/resources/b.md' },
                                createdAt: 2,
                                updatedAt: 2,
                                status: 'done',
                                metadata: {},
                            }],
                    }),
                }),
            ]);
            expect(firstArtifact.status).toBe(200);
            expect(secondArtifact.status).toBe(200);
            const deleteResponse = await fetch(`${server.origin}/api/ai/artifact-history?${target}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: ['artifact-a'] }),
            });
            expect(deleteResponse.status).toBe(200);
            const stalePut = await fetch(`${server.origin}/api/ai/artifact-history?${target}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artifacts: [{ id: 'artifact-a' }, { id: 'artifact-b' }] }),
            });
            expect(stalePut.status).toBe(405);
            const staleUpsert = await fetch(`${server.origin}/api/ai/artifact-history?${target}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artifacts: [{
                            id: 'artifact-a',
                            kind: 'document',
                            operation: 'updated',
                            title: 'A stale',
                            source: {},
                            target: { path: 'src/resources/a-stale.md' },
                            createdAt: 1,
                            updatedAt: 10,
                            status: 'done',
                            metadata: {},
                        }],
                }),
            });
            expect(staleUpsert.status).toBe(200);
            const historyResponse = await fetch(`${server.origin}/api/ai/artifact-history?${target}`);
            const historyBody = await historyResponse.json();
            expect(historyBody.artifacts.map((artifact) => artifact.id)).toEqual(['artifact-a', 'artifact-b']);
            expect(historyBody.artifacts.find((artifact) => artifact.id === 'artifact-a')).toEqual(expect.objectContaining({
                title: 'A stale',
                target: expect.objectContaining({ path: 'src/resources/a-stale.md' }),
            }));
            const stored = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/prototypes/home/.spec/generation-artifacts.json'), 'utf8'));
            expect(stored.artifacts.find((artifact) => artifact.id === 'artifact-a')).toEqual(expect.objectContaining({
                id: 'artifact-a',
                title: 'A stale',
            }));
            expect(stored.artifacts.find((artifact) => artifact.id === 'artifact-a')?.deletedAt).toBeUndefined();
            expect(stored.artifacts.find((artifact) => artifact.id === 'artifact-b')).toEqual(expect.objectContaining({
                id: 'artifact-b',
                taskId: 'task-b',
            }));
        }
        finally {
            await server.close();
        }
    });
    it('stores streamed image artifacts as project asset references in the generic artifact history', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-image-artifact-history-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-image-artifact-history', name: 'AI Runs Image Artifact History' },
            resourceWriteTargets: {
                prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
            },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                {
                    type: 'tool-output-available',
                    toolCallId: 'tool-call-image-history',
                    toolName: 'generate_image',
                    output: {
                        status: 'succeeded',
                        recordId: 'record-image-history',
                        images: [
                            { base64: 'aW1hZ2UtaGlzdG9yeQ==', mimeType: 'image/png', fileName: 'history.png' },
                        ],
                    },
                },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp, {
            ai: {
                imageGeneration: {
                    baseUrl: 'https://images.example.com/v1',
                    apiKey: 'sk-image',
                    model: 'gpt-image-2',
                },
            },
        });
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'image',
                    prompt: '生成项目内图片资产',
                    targetPath: 'prototypes/home',
                    taskId: 'task-image-history',
                    conversationId: 'conversation-image-history',
                    params: { n: 1, output_format: 'png' },
                }),
            });
            await collectRunEvents(response);
            const historyPath = path.join(projectRoot, 'src/prototypes/home/.spec/generation-artifacts.json');
            const stored = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            expect(JSON.stringify(stored)).not.toContain('aW1hZ2UtaGlzdG9yeQ==');
            expect(stored.artifacts).toEqual([
                expect.objectContaining({
                    kind: 'image',
                    taskId: 'task-image-history',
                    conversationId: 'conversation-image-history',
                    assetRef: expect.objectContaining({
                        assetPath: expect.stringMatching(/^generation-assets\/images\/history-[a-f0-9]{12}\.png$/u),
                        mimeType: 'image/png',
                        url: expect.stringMatching(/\/api\/ai\/artifact-history\/assets\?.*projectId=ai-runs-image-artifact-history/u),
                    }),
                }),
            ]);
            const assetPath = stored.artifacts[0].assetRef.assetPath;
            expect(fs.readFileSync(path.join(projectRoot, 'src/prototypes/home/.spec', assetPath), 'utf8')).toBe('image-history');
            expect(fs.existsSync(path.join(projectRoot, 'src/prototypes/home/.spec/ai-image-history.json'))).toBe(false);
            expect(acp.requests[0].body.builtinToolSettings).toEqual({
                imageGeneration: {
                    baseUrl: 'https://images.example.com/v1',
                    apiKey: 'sk-image',
                    model: 'gpt-image-2',
                    savePathPattern: 'src/prototypes/home/.spec/generation-assets/images/image-<index>.<ext>',
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('does not stream a terminal run error for direct ACP diagnostics when the run finishes normally', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-warning-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-warning', name: 'AI Runs Direct Warning' },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                { type: 'text-delta', delta: '修改已应用' },
                { type: 'error', errorText: 'session status poll failed' },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '修改批注',
                    threadId: 'annotation-mqz16rps-081z7c',
                }),
            });
            const events = await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(events.map((event) => event.event)).toEqual([
                'run.accepted',
                'run.stage',
                'run.text.delta',
                'run.completed',
            ]);
            expect(events.some((event) => event.event === 'run.error')).toBe(false);
            expect(events.at(-1)).toMatchObject({
                event: 'run.completed',
                data: {
                    status: 'done',
                    output: '修改已应用',
                    finishReason: 'stop',
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('does not stream a terminal run error for direct ACP tool diagnostics when the run finishes normally', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-tool-warning-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-tool-warning', name: 'AI Runs Direct Tool Warning' },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                { type: 'text-delta', delta: '修改已应用' },
                {
                    type: 'tool-output-error',
                    toolCallId: 'call-check-ready',
                    toolName: 'run_shell_command',
                    errorText: 'node scripts/check-app-ready.mjs failed',
                },
                { type: 'finish', finishReason: 'stop' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '修改批注',
                    threadId: 'annotation-mqz16rps-081z7c',
                }),
            });
            const events = await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(events.map((event) => event.event)).toEqual([
                'run.accepted',
                'run.stage',
                'run.text.delta',
                'run.completed',
            ]);
            expect(events.some((event) => event.event === 'run.error')).toBe(false);
            expect(events.at(-1)).toMatchObject({
                event: 'run.completed',
                data: {
                    status: 'done',
                    output: '修改已应用',
                    finishReason: 'stop',
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('streams original ACP error diagnostics for failed direct runs', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-direct-error-diagnostics-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-direct-error-diagnostics', name: 'AI Runs Direct Error Diagnostics' },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                { type: 'text-delta', delta: '修改已应用' },
                { type: 'error', errorText: 'session status poll failed', code: 'SESSION_STATUS_FAILED' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'direct',
                    prompt: '修改批注',
                    threadId: 'annotation-mqz16rps-081z7c',
                }),
            });
            const events = await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(events.at(-1)).toMatchObject({
                event: 'run.error',
                data: {
                    status: 'error',
                    error: 'session status poll failed',
                    code: 'ACP_CHAT_STREAM_ERROR',
                    output: '修改已应用',
                    chunk: {
                        type: 'error',
                        errorText: 'session status poll failed',
                        code: 'SESSION_STATUS_FAILED',
                    },
                    errors: [
                        {
                            type: 'error',
                            message: 'session status poll failed',
                            chunk: {
                                type: 'error',
                                errorText: 'session status poll failed',
                                code: 'SESSION_STATUS_FAILED',
                            },
                        },
                    ],
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('streams ACP image tool failures as run error events', async () => {
        const projectRoot = createTempRoot('axhub-ai-runs-image-error-');
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-runs-image-error', name: 'AI Runs Image Error' },
        });
        const acp = await startAcpRunTestServer({
            streamEvents: [
                {
                    type: 'tool-output-error',
                    toolCallId: 'tool-call-image-1',
                    toolName: 'generate_image',
                    errorText: 'image tool failed',
                },
                { type: 'finish', finishReason: 'error' },
            ],
        });
        const server = await startRegisteredTestServer(projectRoot, acp);
        try {
            const response = await fetch(projectAiRunsUrl(server), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene: 'image',
                    prompt: '生成失败图',
                    params: { n: 1 },
                }),
            });
            const events = await collectRunEvents(response);
            expect(response.status).toBe(200);
            expect(events.at(-1)).toMatchObject({
                event: 'run.error',
                data: {
                    status: 'error',
                    error: 'image tool failed',
                    code: 'ACP_CHAT_TOOL_OUTPUT_ERROR',
                },
            });
        }
        finally {
            await server.close();
        }
    });
});
