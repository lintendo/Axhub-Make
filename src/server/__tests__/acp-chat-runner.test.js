import { describe, expect, it, vi } from 'vitest';
async function loadRunnerModule() {
    const mod = await import('../acpChatRunner.ts').catch((error) => ({ __missing: error }));
    expect('__missing' in mod ? undefined : mod).toBeTruthy();
    return mod;
}
function createSseResponse(events, init) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const event of events) {
                controller.enqueue(encoder.encode(event));
            }
            controller.close();
        },
    }), {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            ...(init?.headers || {}),
        },
        ...init,
    });
}
function createJsonEvent(chunk) {
    return `data: ${JSON.stringify(chunk)}\n\n`;
}
function createTimeoutReadResponse() {
    return new Response(new ReadableStream({
        pull() {
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        },
    }), {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
        },
    });
}
function createDanglingDoneResponse(events) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const event of events) {
                controller.enqueue(encoder.encode(event));
            }
        },
        pull() {
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        },
    }), {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
        },
    });
}
describe('ACP chat runner', () => {
    it('creates URL-safe one-shot thread ids', async () => {
        const mod = await loadRunnerModule();
        expect(mod.createAcpOneShotThreadId('exec run')).toMatch(/^exec-run-[A-Za-z0-9_-]+$/u);
        expect(mod.createAcpOneShotThreadId('图片生成')).toMatch(/^exec-[A-Za-z0-9_-]+$/u);
    });
    it('posts command-style chat runs, aggregates stream chunks, and captures runtime headers', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async (_url, init) => {
            const body = JSON.parse(String(init.body));
            return createSseResponse([
                createJsonEvent({ type: 'start', messageId: 'assistant-1' }),
                'data: {"type":"text-delta","id":"text-1","delta":"Done "}\n\n',
                createJsonEvent({ type: 'reasoning-delta', id: 'reasoning-1', delta: 'checking tools' }),
                createJsonEvent({
                    type: 'tool-output-available',
                    toolCallId: 'call-1',
                    toolName: 'generate_image',
                    output: {
                        status: 'completed',
                        recordId: 'image-record-1',
                    },
                }),
                createJsonEvent({ type: 'text-delta', id: 'text-1', delta: 'now' }),
                createJsonEvent({ type: 'finish', finishReason: 'stop' }),
                'data: [DONE]\n\n',
            ], {
                headers: {
                    'x-acp-provider': 'codex',
                    'x-acp-thread-id': encodeURIComponent(body.threadId),
                    'x-acp-session-key': encodeURIComponent('codex:/workspace:' + body.threadId),
                    'x-acp-session-id': 'acp-session-1',
                    'x-acp-previous-run-cancelled': 'true',
                    'x-acp-previous-session-id': 'acp-session-old',
                    'x-acp-cold-start': 'true',
                    'x-acp-run-state': 'running',
                    'x-acp-warning-count': '2',
                },
            });
        });
        const result = await mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api/',
            provider: 'acp:codex',
            workspacePath: '/workspace',
            conversationStorePath: '/workspace/src/prototypes/home/.spec/acp/conversations.json',
            prompt: 'Run the requested task.',
            builtinTools: ['image-generation'],
        }, { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        const body = JSON.parse(String(init.body));
        expect(url).toBe('http://acp.local/api/chat');
        expect(init).toMatchObject({
            method: 'POST',
            headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        });
        expect(body).toMatchObject({
            id: result.threadId,
            threadId: result.threadId,
            provider: 'codex',
            workspacePath: '/workspace',
            conversationStorePath: '/workspace/src/prototypes/home/.spec/acp/conversations.json',
            builtinTools: ['image-generation'],
            messages: [
                {
                    id: `${result.threadId}-user`,
                    role: 'user',
                    parts: [{ type: 'text', text: 'Run the requested task.' }],
                },
            ],
        });
        expect(result).toMatchObject({
            success: true,
            provider: 'codex',
            output: 'Done now',
            reasoning: 'checking tools',
            finishReason: 'stop',
            errors: [],
            runtimeHeaders: {
                provider: 'codex',
                threadId: result.threadId,
                sessionId: 'acp-session-1',
                previousRunCancelled: true,
                previousSessionId: 'acp-session-old',
                coldStart: true,
                runState: 'running',
                warningCount: 2,
            },
            toolOutputs: [
                {
                    type: 'tool-output-available',
                    toolCallId: 'call-1',
                    toolName: 'generate_image',
                    output: {
                        status: 'completed',
                        recordId: 'image-record-1',
                    },
                },
            ],
        });
    });
    it('preserves provided conversation identity for non one-shot runs', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async (_url, _init) => createSseResponse([
            createJsonEvent({ type: 'text-delta', delta: 'continued' }),
            createJsonEvent({ type: 'finish', finishReason: 'stop' }),
            'data: [DONE]\n\n',
        ]));
        const result = await mod.runAcpChat({
            acpApiBaseUrl: 'http://acp.local/api',
            id: 'chat-run-1',
            threadId: 'existing_thread-1',
            provider: 'acp:gemini',
            workspacePath: '/workspace',
            messages: [
                {
                    id: 'user-2',
                    role: 'user',
                    parts: [{ type: 'text', text: 'Continue.' }],
                },
            ],
            context: { version: 2, items: [] },
            model: 'gemini-model',
            modeId: 'plan',
        }, { fetchImpl });
        const requestInit = fetchImpl.mock.calls[0]?.[1];
        expect(requestInit).toBeDefined();
        const body = JSON.parse(String(requestInit?.body));
        expect(body).toMatchObject({
            id: 'chat-run-1',
            threadId: 'existing_thread-1',
            provider: 'codex',
            workspacePath: '/workspace',
            context: { version: 2, items: [] },
            model: 'gemini-model',
            modeId: 'plan',
        });
        expect(result.output).toBe('continued');
        expect(result.threadId).toBe('existing_thread-1');
    });
    it('maps non-2xx ACP JSON errors to typed run errors with diagnostic details', async () => {
        const mod = await loadRunnerModule();
        const errorBody = {
            error: 'Failed to cancel the active ACP run before sending the new prompt.',
            code: 'ACP_CHAT_CANCEL_FAILED',
            threadId: 'existing_thread-1',
            provider: 'codex',
            cause: 'provider cleanup failed',
        };
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify(errorBody), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        }));
        await expect(mod.runAcpChat({
            acpApiBaseUrl: 'http://acp.local/api',
            id: 'chat-run-1',
            threadId: 'existing_thread-1',
            provider: 'codex',
            workspacePath: '/workspace',
            messages: [
                {
                    id: 'user-2',
                    role: 'user',
                    parts: [{ type: 'text', text: 'Continue.' }],
                },
            ],
        }, { fetchImpl })).rejects.toMatchObject({
            name: 'AcpChatRunError',
            code: 'ACP_CHAT_CANCEL_FAILED',
            statusCode: 502,
            message: 'Failed to cancel the active ACP run before sending the new prompt.',
            details: errorBody,
        });
    });
    it.each([
        ['acp:claude', 'claude'],
        ['acp:codex', 'codex'],
        ['acp:opencode', 'opencode'],
        ['acp:cursor', 'cursor'],
        ['acp:qoder', 'qoder'],
        ['acp:codebuddy', 'codebuddy'],
        ['acp:reasonix', 'reasonix'],
        ['acp:grok-build', 'grok-build'],
    ])('normalizes prompt client %s to ACP provider %s', async (promptClient, provider) => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => createSseResponse([
            createJsonEvent({ type: 'text-delta', delta: 'ok' }),
            createJsonEvent({ type: 'finish', finishReason: 'stop' }),
            'data: [DONE]\n\n',
        ]));
        await mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            provider: promptClient,
            workspacePath: '/workspace',
            prompt: 'Ping.',
        }, { fetchImpl });
        const fetchMock = fetchImpl;
        const requestInit = fetchMock.mock.calls[0]?.[1];
        expect(requestInit).toBeDefined();
        const body = JSON.parse(String(requestInit?.body));
        expect(body.provider).toBe(provider);
    });
    it('fails stream error chunks with the partial result attached', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => createSseResponse([
            createJsonEvent({ type: 'text-delta', delta: 'partial ' }),
            createJsonEvent({ type: 'error', errorText: 'ACP run failed' }),
            'data: [DONE]\n\n',
        ]));
        await expect(mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: 'Run.',
        }, { fetchImpl })).rejects.toMatchObject({
            name: 'AcpChatRunError',
            code: 'ACP_CHAT_STREAM_ERROR',
            statusCode: 502,
            result: {
                output: 'partial ',
                errors: [
                    {
                        type: 'error',
                        message: 'ACP run failed',
                    },
                ],
            },
        });
    });
    it('treats stream error chunks followed by a stop finish as non-fatal diagnostics', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => createSseResponse([
            createJsonEvent({ type: 'text-delta', delta: 'patch applied' }),
            createJsonEvent({ type: 'error', errorText: 'session status poll failed' }),
            createJsonEvent({ type: 'finish', finishReason: 'stop' }),
            'data: [DONE]\n\n',
        ]));
        const result = await mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: 'Run.',
        }, { fetchImpl });
        expect(result).toMatchObject({
            output: 'patch applied',
            finishReason: 'stop',
            errors: [
                {
                    type: 'error',
                    message: 'session status poll failed',
                },
            ],
        });
    });
    it('fails tool-output-error chunks so image runs cannot silently succeed', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => createSseResponse([
            createJsonEvent({
                type: 'tool-output-error',
                toolCallId: 'call-1',
                toolName: 'generate_image',
                errorText: 'image tool failed',
            }),
            createJsonEvent({ type: 'finish', finishReason: 'error' }),
            'data: [DONE]\n\n',
        ]));
        await expect(mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: 'Generate an image.',
            builtinTools: ['image-generation'],
        }, { fetchImpl })).rejects.toMatchObject({
            name: 'AcpChatRunError',
            code: 'ACP_CHAT_TOOL_OUTPUT_ERROR',
            statusCode: 502,
            result: {
                finishReason: 'error',
                errors: [
                    {
                        type: 'tool-output-error',
                        toolCallId: 'call-1',
                        toolName: 'generate_image',
                        message: 'image tool failed',
                    },
                ],
            },
        });
    });
    it('treats tool errors as diagnostics when explicitly allowed', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => createSseResponse([
            createJsonEvent({ type: 'text-delta', delta: 'patch applied' }),
            createJsonEvent({
                type: 'tool-output-error',
                toolCallId: 'call-check-ready',
                toolName: 'run_shell_command',
                errorText: 'node scripts/check-app-ready.mjs failed',
            }),
            'data: [DONE]\n\n',
        ]));
        const result = await mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: 'Update annotation.',
            allowToolErrorDiagnostics: true,
        }, { fetchImpl });
        expect(result).toMatchObject({
            output: 'patch applied',
            errors: [
                {
                    type: 'tool-output-error',
                    toolCallId: 'call-check-ready',
                    toolName: 'run_shell_command',
                    message: 'node scripts/check-app-ready.mjs failed',
                },
            ],
        });
    });
    it('completes when ACP sends DONE even if the response body remains open', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => createDanglingDoneResponse([
            createJsonEvent({ type: 'text-delta', delta: 'patch applied' }),
            'data: [DONE]\n\n',
        ]));
        const result = await mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: 'Update annotation.',
            allowToolErrorDiagnostics: true,
        }, { fetchImpl, timeoutMs: 30_000 });
        expect(result).toMatchObject({
            output: 'patch applied',
            errors: [],
        });
    });
    it('maps ACP chat fetch no-response aborts to a readable run error', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => {
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        });
        await expect(mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: 'Run.',
        }, { fetchImpl, timeoutMs: 30_000 })).rejects.toMatchObject({
            name: 'AcpChatRunError',
            code: 'ACP_CHAT_NO_RESPONSE',
            statusCode: 504,
            message: 'ACP 暂无响应，正在确认任务状态。',
        });
    });
    it('maps ACP chat stream read no-response aborts to a readable run error', async () => {
        const mod = await loadRunnerModule();
        const fetchImpl = vi.fn(async () => createTimeoutReadResponse());
        await expect(mod.runAcpChatCommand({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: 'Run.',
        }, { fetchImpl, timeoutMs: 30_000 })).rejects.toMatchObject({
            name: 'AcpChatRunError',
            code: 'ACP_CHAT_NO_RESPONSE',
            statusCode: 504,
            message: 'ACP 暂无响应，正在确认任务状态。',
        });
    });
});
