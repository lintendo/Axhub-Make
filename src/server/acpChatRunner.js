import crypto from 'node:crypto';
export class AcpChatRunError extends Error {
    code;
    statusCode;
    result;
    details;
    constructor(message, options) {
        super(message);
        this.name = 'AcpChatRunError';
        this.code = options.code;
        this.statusCode = options.statusCode;
        this.result = options.result;
        this.details = options.details;
    }
}
const DEFAULT_PROVIDER = 'codex';
const ACP_SSE_DONE = Symbol('ACP_SSE_DONE');
const RUNTIME_HEADER_KEYS = [
    'x-acp-provider',
    'x-acp-thread-id',
    'x-acp-session-key',
    'x-acp-session-id',
    'x-acp-resumed-session-id',
    'x-acp-previous-run-cancelled',
    'x-acp-previous-session-id',
    'x-acp-cold-start',
    'x-acp-run-state',
    'x-acp-model',
    'x-acp-mode-id',
    'x-acp-thought-level',
    'x-acp-warning-count',
];
function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
export function normalizeAcpChatProvider(value) {
    const normalized = normalizeString(value).toLowerCase();
    if (!normalized)
        return DEFAULT_PROVIDER;
    const acpPrefixMatch = /^acp:([a-z0-9_-]+)$/u.exec(normalized);
    if (acpPrefixMatch) {
        const provider = acpPrefixMatch[1];
        return provider === 'gemini' ? 'codex' : provider;
    }
    if (normalized === 'openai' || normalized === 'acp:codex')
        return 'codex';
    if (normalized === 'claudecode' || normalized === 'acp:claude')
        return 'claude';
    if (normalized === 'gemini' || normalized === 'acp:gemini')
        return 'codex';
    if (normalized === 'acp:opencode')
        return 'opencode';
    return normalized;
}
function normalizeAcpApiBaseUrl(value) {
    const raw = normalizeString(value).replace(/\/+$/u, '');
    if (!raw) {
        throw new AcpChatRunError('ACP API base URL is required', {
            code: 'ACP_CHAT_API_BASE_URL_EMPTY',
            statusCode: 400,
        });
    }
    try {
        return new URL(raw).toString().replace(/\/+$/u, '');
    }
    catch {
        throw new AcpChatRunError('Invalid ACP API base URL', {
            code: 'ACP_CHAT_API_BASE_URL_INVALID',
            statusCode: 400,
        });
    }
}
function buildAcpChatUrl(acpApiBaseUrl) {
    const baseUrl = normalizeAcpApiBaseUrl(acpApiBaseUrl);
    return baseUrl.endsWith('/chat') ? baseUrl : `${baseUrl}/chat`;
}
function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
function parseBooleanHeader(value) {
    if (!value)
        return undefined;
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return undefined;
}
function parseIntegerHeader(value) {
    if (!value)
        return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
}
function readHeader(headers, key) {
    return headers.get(key) || '';
}
function captureRuntimeHeaders(headers) {
    const raw = Object.fromEntries(RUNTIME_HEADER_KEYS
        .map((key) => [key, readHeader(headers, key)])
        .filter(([, value]) => value));
    const runtimeHeaders = { raw };
    const provider = raw['x-acp-provider'];
    const threadId = raw['x-acp-thread-id'];
    const sessionKey = raw['x-acp-session-key'];
    const sessionId = raw['x-acp-session-id'];
    const resumedSessionId = raw['x-acp-resumed-session-id'];
    const previousRunCancelled = parseBooleanHeader(raw['x-acp-previous-run-cancelled'] || '');
    const previousSessionId = raw['x-acp-previous-session-id'];
    const coldStart = parseBooleanHeader(raw['x-acp-cold-start'] || '');
    const runState = raw['x-acp-run-state'];
    const model = raw['x-acp-model'];
    const modeId = raw['x-acp-mode-id'];
    const thoughtLevel = raw['x-acp-thought-level'];
    const warningCount = parseIntegerHeader(raw['x-acp-warning-count'] || '');
    if (provider)
        runtimeHeaders.provider = provider;
    if (threadId)
        runtimeHeaders.threadId = safeDecodeURIComponent(threadId);
    if (sessionKey)
        runtimeHeaders.sessionKey = safeDecodeURIComponent(sessionKey);
    if (sessionId)
        runtimeHeaders.sessionId = sessionId;
    if (resumedSessionId)
        runtimeHeaders.resumedSessionId = resumedSessionId;
    if (previousRunCancelled !== undefined)
        runtimeHeaders.previousRunCancelled = previousRunCancelled;
    if (previousSessionId)
        runtimeHeaders.previousSessionId = previousSessionId;
    if (coldStart !== undefined)
        runtimeHeaders.coldStart = coldStart;
    if (runState)
        runtimeHeaders.runState = runState;
    if (model)
        runtimeHeaders.model = model;
    if (modeId)
        runtimeHeaders.modeId = modeId;
    if (thoughtLevel)
        runtimeHeaders.thoughtLevel = thoughtLevel;
    if (warningCount !== undefined)
        runtimeHeaders.warningCount = warningCount;
    return runtimeHeaders;
}
function normalizeOptionalId(value) {
    return normalizeString(value).replace(/[^A-Za-z0-9_-]/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '');
}
export function createAcpOneShotThreadId(prefix = 'exec') {
    const normalizedPrefix = normalizeOptionalId(prefix) || 'exec';
    const suffix = crypto.randomUUID().replace(/[^A-Za-z0-9_-]/gu, '');
    return `${normalizedPrefix}-${suffix}`;
}
function normalizeMessages(value) {
    return Array.isArray(value) ? value : [];
}
function createInitialResult(params) {
    return {
        success: true,
        id: params.id,
        threadId: params.threadId,
        provider: params.runtimeHeaders.provider || params.provider,
        ...(params.scene ? { scene: params.scene } : {}),
        ...(params.allowToolErrorDiagnostics ? { allowToolErrorDiagnostics: true } : {}),
        output: '',
        reasoning: '',
        toolOutputs: [],
        runtimeHeaders: params.runtimeHeaders,
        errors: [],
        chunks: [],
    };
}
function getChunkText(chunk, key) {
    return typeof chunk[key] === 'string' ? chunk[key] : '';
}
function recordChunk(result, chunk) {
    result.chunks.push(chunk);
    if (chunk.type === 'text-delta') {
        result.output += getChunkText(chunk, 'delta');
        return;
    }
    if (chunk.type === 'reasoning-delta') {
        result.reasoning += getChunkText(chunk, 'delta');
        return;
    }
    if (chunk.type === 'tool-output-available') {
        result.toolOutputs.push({
            type: 'tool-output-available',
            ...(typeof chunk.toolCallId === 'string' ? { toolCallId: chunk.toolCallId } : {}),
            ...(typeof chunk.toolName === 'string' ? { toolName: chunk.toolName } : {}),
            ...(Object.prototype.hasOwnProperty.call(chunk, 'output') ? { output: chunk.output } : {}),
            chunk,
        });
        return;
    }
    if (chunk.type === 'tool-output-error') {
        result.errors.push({
            type: 'tool-output-error',
            message: getChunkText(chunk, 'errorText') || getChunkText(chunk, 'message') || 'ACP tool output failed',
            ...(typeof chunk.toolCallId === 'string' ? { toolCallId: chunk.toolCallId } : {}),
            ...(typeof chunk.toolName === 'string' ? { toolName: chunk.toolName } : {}),
            chunk,
        });
        return;
    }
    if (chunk.type === 'error') {
        result.errors.push({
            type: 'error',
            message: getChunkText(chunk, 'errorText') || getChunkText(chunk, 'message') || 'ACP chat stream failed',
            chunk,
        });
        return;
    }
    if (chunk.type === 'finish') {
        result.finishReason = getChunkText(chunk, 'finishReason') || result.finishReason;
    }
}
function findSseEventSeparator(buffer) {
    const match = /\r?\n\r?\n/u.exec(buffer);
    if (!match || match.index === undefined)
        return null;
    return { index: match.index, length: match[0].length };
}
function parseSseEvent(rawEvent) {
    const dataLines = rawEvent
        .split(/\r?\n/u)
        .map((line) => line.trimEnd())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim());
    if (!dataLines.length)
        return [];
    const data = dataLines.join('\n').trim();
    if (!data)
        return [];
    if (data === '[DONE]')
        return [ACP_SSE_DONE];
    try {
        return [JSON.parse(data)];
    }
    catch (error) {
        throw new AcpChatRunError(`Failed to parse ACP chat SSE chunk: ${error?.message || String(error)}`, {
            code: 'ACP_CHAT_SSE_PARSE_ERROR',
            statusCode: 502,
        });
    }
}
async function* readSseJson(response) {
    if (!response.body) {
        throw new AcpChatRunError('ACP chat response body is not readable', {
            code: 'ACP_CHAT_RESPONSE_UNREADABLE',
            statusCode: 502,
        });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let separator = findSseEventSeparator(buffer);
            while (separator) {
                const rawEvent = buffer.slice(0, separator.index);
                buffer = buffer.slice(separator.index + separator.length);
                for (const parsed of parseSseEvent(rawEvent)) {
                    if (parsed === ACP_SSE_DONE)
                        return;
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        yield parsed;
                    }
                }
                separator = findSseEventSeparator(buffer);
            }
        }
    }
    catch (error) {
        mapAcpChatRequestError(error);
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
        for (const parsed of parseSseEvent(buffer)) {
            if (parsed === ACP_SSE_DONE)
                return;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                yield parsed;
            }
        }
    }
}
function createFailureFromResult(result) {
    const finishReason = normalizeString(result.finishReason).toLowerCase();
    const hasSuccessfulFinish = ['stop', 'complete', 'completed', 'success', 'done'].includes(finishReason);
    const toolError = result.errors.find((error) => error.type === 'tool-output-error');
    if (toolError) {
        if (result.allowToolErrorDiagnostics === true) {
            return null;
        }
        return new AcpChatRunError(toolError.message, {
            code: 'ACP_CHAT_TOOL_OUTPUT_ERROR',
            statusCode: 502,
            result,
        });
    }
    const streamError = result.errors.find((error) => error.type === 'error');
    if (streamError) {
        if (hasSuccessfulFinish) {
            return null;
        }
        return new AcpChatRunError(streamError.message, {
            code: 'ACP_CHAT_STREAM_ERROR',
            statusCode: 502,
            result,
        });
    }
    return null;
}
function buildAbortSignal(options) {
    if (options.signal)
        return options.signal;
    if (typeof options.timeoutMs !== 'number' || !Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
        return undefined;
    }
    return AbortSignal.timeout(Math.round(options.timeoutMs));
}
function isAbortOrTimeoutError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const name = normalizeString(error.name);
    const message = normalizeString(error.message).toLowerCase();
    return (name === 'AbortError'
        || name === 'TimeoutError'
        || message.includes('aborted due to timeout')
        || message.includes('operation was aborted'));
}
function mapAcpChatRequestError(error) {
    if (error instanceof AcpChatRunError) {
        throw error;
    }
    if (isAbortOrTimeoutError(error)) {
        throw new AcpChatRunError('ACP 暂无响应，正在确认任务状态。', {
            code: 'ACP_CHAT_NO_RESPONSE',
            statusCode: 504,
        });
    }
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    throw new AcpChatRunError(`ACP chat request failed: ${message}`, {
        code: 'ACP_CHAT_REQUEST_FAILED',
        statusCode: 502,
    });
}
async function readResponseText(response) {
    try {
        return (await response.text()).trim();
    }
    catch {
        return '';
    }
}
function parseJsonObject(text) {
    if (!text)
        return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : null;
    }
    catch {
        return null;
    }
}
function createHttpErrorFromResponse(response, text) {
    const body = parseJsonObject(text);
    const bodyCode = normalizeString(body?.code);
    const bodyError = normalizeString(body?.error);
    const bodyMessage = normalizeString(body?.message);
    return new AcpChatRunError(bodyError || bodyMessage || text || `ACP chat request failed with status ${response.status}`, {
        code: bodyCode || 'ACP_CHAT_HTTP_ERROR',
        statusCode: response.status,
        ...(body ? { details: body } : {}),
    });
}
async function startAcpChatRequest(request, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const provider = normalizeAcpChatProvider(request.provider);
    const threadId = normalizeString(request.threadId || request.id) || createAcpOneShotThreadId('exec');
    const id = normalizeString(request.id) || threadId;
    const messages = normalizeMessages(request.messages);
    if (!messages.length) {
        throw new AcpChatRunError('ACP chat messages are required', {
            code: 'ACP_CHAT_MESSAGES_EMPTY',
            statusCode: 400,
        });
    }
    const body = {
        id,
        threadId,
        provider,
        messages,
    };
    if (request.workspacePath !== undefined)
        body.workspacePath = request.workspacePath;
    if (request.conversationStorePath !== undefined)
        body.conversationStorePath = request.conversationStorePath;
    if (request.model !== undefined)
        body.model = request.model;
    if (request.modeId !== undefined)
        body.modeId = request.modeId;
    if (request.thoughtLevel !== undefined)
        body.thoughtLevel = request.thoughtLevel;
    if (request.permissionMode !== undefined)
        body.permissionMode = request.permissionMode;
    if (request.mcpServers !== undefined)
        body.mcpServers = request.mcpServers;
    if (request.builtinTools !== undefined)
        body.builtinTools = request.builtinTools;
    if (request.builtinToolSettings !== undefined)
        body.builtinToolSettings = request.builtinToolSettings;
    if (request.context !== undefined)
        body.context = request.context;
    if (request.system !== undefined)
        body.system = request.system;
    if (request.tools !== undefined)
        body.tools = request.tools;
    let response;
    try {
        response = await fetchImpl(buildAcpChatUrl(request.acpApiBaseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: buildAbortSignal(options),
        });
    }
    catch (error) {
        mapAcpChatRequestError(error);
    }
    if (!response.ok) {
        const text = await readResponseText(response);
        throw createHttpErrorFromResponse(response, text);
    }
    const result = createInitialResult({
        id,
        threadId,
        provider,
        scene: normalizeString(request.scene),
        allowToolErrorDiagnostics: request.allowToolErrorDiagnostics,
        runtimeHeaders: captureRuntimeHeaders(response.headers),
    });
    result.provider = result.runtimeHeaders.provider || provider;
    result.threadId = result.runtimeHeaders.threadId || threadId;
    return { body, response, result };
}
export async function* streamAcpChat(request, options = {}) {
    const { body, response, result } = await startAcpChatRequest(request, options);
    yield {
        type: 'start',
        result,
        requestBody: body,
    };
    for await (const chunk of readSseJson(response)) {
        recordChunk(result, chunk);
        yield {
            type: 'chunk',
            chunk,
            result,
        };
    }
    const failure = createFailureFromResult(result);
    if (failure) {
        throw failure;
    }
    yield {
        type: 'complete',
        result,
    };
}
export async function runAcpChat(request, options = {}) {
    let finalResult = null;
    for await (const event of streamAcpChat(request, options)) {
        finalResult = event.result;
    }
    if (!finalResult) {
        throw new AcpChatRunError('ACP chat stream did not start', {
            code: 'ACP_CHAT_STREAM_EMPTY',
            statusCode: 502,
        });
    }
    return finalResult;
}
export async function runAcpChatCommand(request, options = {}) {
    const prompt = normalizeString(request.prompt);
    if (!prompt) {
        throw new AcpChatRunError('Prompt 不能为空', {
            code: 'ACP_CHAT_PROMPT_EMPTY',
            statusCode: 400,
        });
    }
    const threadId = normalizeString(request.threadId || request.id) || createAcpOneShotThreadId(request.scene || 'exec');
    const id = normalizeString(request.id) || threadId;
    return runAcpChat({
        acpApiBaseUrl: request.acpApiBaseUrl,
        id,
        threadId,
        provider: request.provider,
        scene: request.scene,
        allowToolErrorDiagnostics: request.allowToolErrorDiagnostics,
        workspacePath: request.workspacePath,
        conversationStorePath: request.conversationStorePath,
        model: request.model,
        modeId: request.modeId,
        thoughtLevel: request.thoughtLevel,
        permissionMode: request.permissionMode,
        mcpServers: request.mcpServers,
        builtinTools: request.builtinTools,
        builtinToolSettings: request.builtinToolSettings,
        context: request.context,
        system: request.system,
        tools: request.tools,
        messages: [
            {
                id: `${threadId}-user`,
                role: 'user',
                parts: [{ type: 'text', text: prompt }],
            },
        ],
    }, options);
}
