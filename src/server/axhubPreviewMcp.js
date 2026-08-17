import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PreviewBridgeError, } from './previewBridge.ts';
import { readJsonBody, sendJson } from './http.ts';
export const AXHUB_PREVIEW_MCP_PATH = '/api/mcp/axhub-preview';
export const AXHUB_PREVIEW_MCP_TOKEN_HEADER = 'x-axhub-preview-mcp-token';
export const AXHUB_PREVIEW_BRIDGE_CLIENT_ID_HEADER = 'x-axhub-preview-bridge-client-id';
export const AXHUB_PREVIEW_VOICE_TOOLS_HEADER = 'x-axhub-preview-voice-tools';
const TOOL_NAMES = [
    'preview_get_current',
    'preview_navigate',
    'preview_capture',
    'preview_get_last_diagnostics',
];
const AXHUB_MAKE_VOICE_TOOL_NAMES = [
    'axhub_make_capture_page',
    'axhub_make_get_target',
    'axhub_make_create_annotation',
    'axhub_make_start_task',
    'axhub_make_list_annotations',
    'axhub_make_list_tasks',
    'axhub_make_get_task',
    'axhub_make_cancel_task',
    'axhub_make_delete_annotation',
];
const COMMON_TOOL_PROPERTIES = {
    requestId: {
        type: 'string',
        description: 'Optional bridge request id for idempotent routing and duplicate detection.',
    },
    timeoutMs: {
        type: 'number',
        description: 'Optional command timeout in milliseconds.',
    },
};
const CAPTURE_TARGET_SCHEMA = {
    type: 'object',
    description: 'Optional capture target. Defaults to the current Axhub preview context.',
    properties: {
        resourceType: {
            enum: ['prototype', 'theme', 'doc', 'image', 'template', 'resource'],
        },
        resourceId: { type: 'string' },
        canvasElementId: { type: 'string' },
        url: { type: 'string' },
    },
    additionalProperties: true,
};
const NAVIGATE_TARGET_SCHEMA = {
    type: 'object',
    description: 'Current-project Axhub resource to show in the active Admin page.',
    properties: {
        resourceType: {
            enum: ['prototype', 'canvas', 'doc', 'theme'],
        },
        resourceId: { type: 'string' },
        pageId: { type: 'string' },
        collapseSidebar: { type: 'boolean' },
    },
    required: ['resourceType', 'resourceId'],
    additionalProperties: true,
};
const VIEWPORT_SCHEMA = {
    oneOf: [
        { enum: ['desktop', 'tablet', 'mobile'] },
        {
            type: 'object',
            properties: {
                id: { type: 'string' },
                width: { type: 'number', minimum: 1 },
                height: { type: 'number', minimum: 1 },
            },
            required: ['width', 'height'],
            additionalProperties: true,
        },
    ],
};
const AXHUB_PREVIEW_TOOLS = [
    {
        name: 'preview_get_current',
        description: 'Return current file, resource, URL, view mode, page id, and selected canvas preview node context without opening an iframe.',
        inputSchema: {
            type: 'object',
            properties: COMMON_TOOL_PROPERTIES,
            additionalProperties: true,
        },
    },
    {
        name: 'preview_navigate',
        description: 'Navigate the active Axhub Admin preview to an existing current-project prototype, canvas, doc, or theme.',
        inputSchema: {
            type: 'object',
            properties: {
                ...COMMON_TOOL_PROPERTIES,
                target: NAVIGATE_TARGET_SCHEMA,
            },
            required: ['target'],
            additionalProperties: true,
        },
    },
    {
        name: 'preview_capture',
        description: 'Capture the current or requested Axhub preview target with a short-lived hidden iframe. Supports one or more viewports.',
        inputSchema: {
            type: 'object',
            properties: {
                ...COMMON_TOOL_PROPERTIES,
                target: CAPTURE_TARGET_SCHEMA,
                viewports: {
                    oneOf: [
                        VIEWPORT_SCHEMA,
                        {
                            type: 'array',
                            items: VIEWPORT_SCHEMA,
                        },
                    ],
                },
                waitSeconds: {
                    type: 'number',
                    minimum: 0,
                    maximum: 30,
                    description: 'Extra seconds to wait after page readiness and layout settle before screenshot capture. Defaults to 0.5.',
                },
                outputPath: {
                    type: 'string',
                    description: 'Optional local file path for the screenshot. For multiple viewports, viewport suffixes are added.',
                },
                outputDir: {
                    type: 'string',
                    description: 'Optional local directory for generated screenshot files. Defaults to .local/preview-captures.',
                },
            },
            additionalProperties: true,
        },
    },
    {
        name: 'preview_get_last_diagnostics',
        description: 'Return diagnostics collected during the most recent preview_capture command.',
        inputSchema: {
            type: 'object',
            properties: COMMON_TOOL_PROPERTIES,
            additionalProperties: true,
        },
    },
];
const AXHUB_MAKE_VOICE_TOOLS = [
    {
        name: 'axhub_make_capture_page',
        description: 'Capture the current Axhub Make Commentary page.',
        inputSchema: { type: 'object', properties: COMMON_TOOL_PROPERTIES, additionalProperties: false },
    },
    {
        name: 'axhub_make_get_target',
        description: 'Read the current selected or hovered Commentary element.',
        inputSchema: { type: 'object', properties: COMMON_TOOL_PROPERTIES, additionalProperties: false },
    },
    {
        name: 'axhub_make_create_annotation',
        description: 'Create a Commentary annotation on the active target.',
        inputSchema: {
            type: 'object',
            properties: { ...COMMON_TOOL_PROPERTIES, targetId: { type: 'string' }, content: { type: 'string' } },
            required: ['targetId', 'content'],
            additionalProperties: false,
        },
    },
    {
        name: 'axhub_make_start_task',
        description: 'Start Make\'s existing Commentary task on the active target.',
        inputSchema: {
            type: 'object',
            properties: { ...COMMON_TOOL_PROPERTIES, targetId: { type: 'string' }, prompt: { type: 'string' } },
            required: ['targetId', 'prompt'],
            additionalProperties: false,
        },
    },
    {
        name: 'axhub_make_list_annotations',
        description: 'List persisted Commentary annotations for the current page.',
        inputSchema: { type: 'object', properties: COMMON_TOOL_PROPERTIES, additionalProperties: false },
    },
    {
        name: 'axhub_make_list_tasks',
        description: 'List Make\'s existing Commentary tasks.',
        inputSchema: { type: 'object', properties: COMMON_TOOL_PROPERTIES, additionalProperties: false },
    },
    {
        name: 'axhub_make_get_task',
        description: 'Get one existing Make Commentary task.',
        inputSchema: {
            type: 'object',
            properties: { ...COMMON_TOOL_PROPERTIES, taskId: { type: 'string' } },
            required: ['taskId'],
            additionalProperties: false,
        },
    },
    {
        name: 'axhub_make_cancel_task',
        description: 'Cancel one existing Make Commentary task after user confirmation.',
        inputSchema: {
            type: 'object',
            properties: { ...COMMON_TOOL_PROPERTIES, taskId: { type: 'string' } },
            required: ['taskId'],
            additionalProperties: false,
        },
    },
    {
        name: 'axhub_make_delete_annotation',
        description: 'Delete one Commentary annotation after user confirmation.',
        inputSchema: {
            type: 'object',
            properties: { ...COMMON_TOOL_PROPERTIES, annotationId: { type: 'string' } },
            required: ['annotationId'],
            additionalProperties: false,
        },
    },
];
export function createAxhubPreviewMcpToken() {
    return randomBytes(24).toString('base64url');
}
export function isAxhubPreviewMcpRequest(requestUrl) {
    try {
        return new URL(requestUrl || '/', 'http://localhost').pathname === AXHUB_PREVIEW_MCP_PATH;
    }
    catch {
        return false;
    }
}
export async function handleAxhubPreviewMcp(req, res, options) {
    if (!isAxhubPreviewMcpRequest(req.url || AXHUB_PREVIEW_MCP_PATH)) {
        return false;
    }
    if (req.method !== 'POST') {
        sendJson(res, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: 'Method Not Allowed' },
        }, { status: 405 });
        return true;
    }
    let request;
    try {
        request = await readJsonBody(req);
    }
    catch {
        sendJson(res, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
        }, { status: 400 });
        return true;
    }
    const id = request.id ?? null;
    if (!isAuthorized(req, options.token)) {
        sendJson(res, {
            jsonrpc: '2.0',
            id,
            error: { code: -32001, message: 'Unauthorized' },
        }, { status: 401 });
        return true;
    }
    if (isJsonRpcNotification(request)) {
        res.statusCode = 202;
        res.setHeader('Cache-Control', 'no-store');
        res.end();
        return true;
    }
    const response = await dispatchJsonRpcRequest(request, {
        ...options,
        bridgeClientId: normalizeHeaderValue(getHeader(req, AXHUB_PREVIEW_BRIDGE_CLIENT_ID_HEADER)),
        voiceToolsEnabled: normalizeHeaderValue(getHeader(req, AXHUB_PREVIEW_VOICE_TOOLS_HEADER)) === '1',
    });
    sendJson(res, response);
    return true;
}
function isJsonRpcNotification(request) {
    return request.jsonrpc === '2.0'
        && typeof request.method === 'string'
        && !Object.prototype.hasOwnProperty.call(request, 'id');
}
async function dispatchJsonRpcRequest(request, options) {
    const id = request.id ?? null;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
        return {
            jsonrpc: '2.0',
            id,
            error: { code: -32600, message: 'Invalid Request' },
        };
    }
    switch (request.method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'axhub-preview', version: '0.1.0' },
                },
            };
        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id,
                result: { tools: options.voiceToolsEnabled ? [...AXHUB_PREVIEW_TOOLS, ...AXHUB_MAKE_VOICE_TOOLS] : AXHUB_PREVIEW_TOOLS },
            };
        case 'tools/call':
            try {
                return {
                    jsonrpc: '2.0',
                    id,
                    result: await callTool(request.params, options),
                };
            }
            catch (error) {
                return createToolCallJsonRpcError(id, error);
            }
        default:
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: 'Method not found' },
            };
    }
}
async function callTool(params, options) {
    const { name, args } = readToolCall(params, options.voiceToolsEnabled === true);
    const { payload, commandOptions, captureOutput } = splitBridgeArguments(args);
    try {
        const result = await options.bridgeHub.sendCommand(name, payload, {
            ...commandOptions,
            ...(options.bridgeClientId ? { clientId: options.bridgeClientId } : {}),
        });
        const payloadResult = name === 'preview_capture'
            ? persistCaptureResult(result, captureOutput, options)
            : result;
        return createTextToolContent({ ok: true, payload: payloadResult });
    }
    catch (error) {
        const normalized = normalizeToolError(error);
        return {
            isError: true,
            ...createTextToolContent({ ok: false, error: normalized }),
        };
    }
}
function readToolCall(params, voiceToolsEnabled) {
    if (!isRecord(params) || typeof params.name !== 'string') {
        throw new PreviewBridgeError('invalid_tool_call', 'tools/call params must include a tool name.');
    }
    if (!isPreviewToolName(params.name, voiceToolsEnabled)) {
        throw new PreviewBridgeError('unknown_tool', `Unknown axhub preview tool "${params.name}".`);
    }
    const rawArgs = params.arguments;
    return {
        name: params.name,
        args: isRecord(rawArgs) ? rawArgs : {},
    };
}
function splitBridgeArguments(args) {
    const { requestId, timeoutMs, outputDir, outputPath, ...payload } = args;
    return {
        payload,
        commandOptions: {
            ...(typeof requestId === 'string' && requestId.trim() ? { requestId: requestId.trim() } : {}),
            ...(typeof timeoutMs === 'number' ? { timeoutMs } : {}),
        },
        captureOutput: {
            ...(typeof outputDir === 'string' && outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
            ...(typeof outputPath === 'string' && outputPath.trim() ? { outputPath: outputPath.trim() } : {}),
        },
    };
}
function createTextToolContent(payload) {
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(payload),
            }],
    };
}
function persistCaptureResult(result, outputOptions, options) {
    if (!isRecord(result) || !Array.isArray(result.screenshots)) {
        return stripScreenshotDataUrls(result);
    }
    const screenshots = result.screenshots;
    const total = screenshots.length;
    const screenshotsResult = screenshots.map((entry, index) => {
        if (!isRecord(entry))
            return stripScreenshotDataUrls(entry);
        const imageData = readScreenshotImageData(entry);
        const metadata = stripScreenshotDataUrls(entry);
        if (!isRecord(metadata) || !imageData) {
            return metadata;
        }
        const filePath = resolveScreenshotOutputPath({
            outputOptions,
            options,
            screenshot: entry,
            index,
            total,
            extension: imageData.extension,
        });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, imageData.buffer);
        return {
            ...metadata,
            filePath,
            mimeType: imageData.mimeType,
        };
    });
    const metadata = stripScreenshotDataUrls(result);
    return {
        ...(isRecord(metadata) ? metadata : {}),
        screenshots: screenshotsResult,
    };
}
function readScreenshotImageData(entry) {
    const explicitMimeType = typeof entry.mimeType === 'string' && entry.mimeType.trim()
        ? entry.mimeType.trim()
        : 'image/png';
    const dataUrl = typeof entry.dataUrl === 'string' ? entry.dataUrl.trim() : '';
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/u);
    const mimeType = match?.[1] || explicitMimeType;
    const base64 = match?.[2] || (typeof entry.data === 'string' ? entry.data.trim() : '');
    if (!base64) {
        return null;
    }
    return {
        buffer: Buffer.from(base64, 'base64'),
        mimeType,
        extension: inferScreenshotExtension(mimeType),
    };
}
function resolveScreenshotOutputPath(params) {
    const explicitOutputPath = params.outputOptions.outputPath;
    if (explicitOutputPath) {
        const resolvedOutputPath = path.resolve(explicitOutputPath);
        if (params.total === 1 && path.extname(resolvedOutputPath)) {
            return resolvedOutputPath;
        }
        const outputDir = path.extname(resolvedOutputPath)
            ? path.dirname(resolvedOutputPath)
            : resolvedOutputPath;
        const baseName = path.extname(resolvedOutputPath)
            ? path.basename(resolvedOutputPath, path.extname(resolvedOutputPath))
            : 'preview-capture';
        return path.join(outputDir, `${sanitizeFileName(baseName)}-${buildScreenshotFileSuffix(params.screenshot, params.index)}.${params.extension}`);
    }
    const outputDir = path.resolve(params.outputOptions.outputDir || params.options.captureOutputRoot || getDefaultCaptureOutputRoot());
    return path.join(outputDir, `${buildCaptureFilePrefix()}-${buildScreenshotFileSuffix(params.screenshot, params.index)}.${params.extension}`);
}
function buildCaptureFilePrefix() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nonce = randomBytes(4).toString('hex');
    return `${timestamp}-${nonce}`;
}
function buildScreenshotFileSuffix(screenshot, index) {
    const viewportId = typeof screenshot.viewportId === 'string' ? screenshot.viewportId : '';
    const width = typeof screenshot.width === 'number' ? screenshot.width : Number(screenshot.width);
    const height = typeof screenshot.height === 'number' ? screenshot.height : Number(screenshot.height);
    const sizeSuffix = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? `${Math.round(width)}x${Math.round(height)}`
        : `viewport-${index + 1}`;
    return sanitizeFileName(viewportId || sizeSuffix);
}
function inferScreenshotExtension(mimeType) {
    switch (mimeType.toLowerCase()) {
        case 'image/jpeg':
        case 'image/jpg':
            return 'jpg';
        case 'image/webp':
            return 'webp';
        case 'image/png':
        default:
            return 'png';
    }
}
function sanitizeFileName(value) {
    return value
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        || 'preview-capture';
}
function getDefaultCaptureOutputRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.local/preview-captures');
}
function stripScreenshotDataUrls(value) {
    if (Array.isArray(value)) {
        return value.map(stripScreenshotDataUrls);
    }
    if (!isRecord(value)) {
        return value;
    }
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
        if (key === 'dataUrl' || key === 'data') {
            continue;
        }
        next[key] = stripScreenshotDataUrls(entry);
    }
    return next;
}
function createToolCallJsonRpcError(id, error) {
    const normalized = normalizeToolError(error);
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code: error instanceof PreviewBridgeError
                && (error.code === 'invalid_tool_call' || error.code === 'unknown_tool')
                ? -32602
                : -32603,
            message: normalized.message,
            data: { code: normalized.code },
        },
    };
}
function normalizeToolError(error) {
    if (error instanceof PreviewBridgeError) {
        return {
            code: error.code,
            message: error.message,
        };
    }
    if (error instanceof Error) {
        return {
            code: 'preview_tool_error',
            message: error.message,
        };
    }
    return {
        code: 'preview_tool_error',
        message: 'Preview tool failed.',
    };
}
function isPreviewToolName(value, voiceToolsEnabled) {
    return TOOL_NAMES.includes(value)
        || (voiceToolsEnabled && AXHUB_MAKE_VOICE_TOOL_NAMES.includes(value));
}
function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function isAuthorized(req, expectedToken) {
    const actual = getHeader(req, AXHUB_PREVIEW_MCP_TOKEN_HEADER);
    if (!actual || !expectedToken)
        return false;
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expectedToken);
    return actualBuffer.length === expectedBuffer.length
        && timingSafeEqual(actualBuffer, expectedBuffer);
}
function getHeader(req, name) {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] || '' : value || '';
}
function normalizeHeaderValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
