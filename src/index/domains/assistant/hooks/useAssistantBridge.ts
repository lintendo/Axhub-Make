import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantContextV1 } from '@/common/assistant-context/types';
import {
    type AcpContextItem,
    type AssistantPreviewMcpConfig,
    type AssistantImageGenerationConfig,
    buildAcpPreviewMcpPostMessage,
    buildAcpContextItemsPostMessage,
    buildAcpContextPostMessage,
    buildAcpCanvasMcpPostMessage,
    buildAcpImageGenerationPostMessage,
    buildAcpThemePostMessage,
} from '../assistantAcpContext';
import type { AssistantImageAttachmentPayload } from '../assistantContextPayload';

interface AcpChatSubmitResult {
    ok: true;
    canSend: boolean;
    isRunning?: boolean;
    textLength: number;
    threadId: string;
}

export interface AcpThreadArtifactsQueryResult {
    ok: true;
    kind: 'artifacts';
    threadId?: string;
    artifacts: unknown[];
    workspaceArtifacts?: unknown[];
    imageGenerationRecords?: unknown[];
    messageCount?: number;
}

type AcpAttachmentAddResult = {
    ok: true;
    name: string;
    mimeType: string;
};

export type AcpComposerAppendResult = {
    ok: true;
    textLength: number;
};

interface UseAssistantBridgeOptions {
    onActiveThreadChanged?: (threadId: string) => void;
}

interface SubmitPromptOptions {
    newThread?: boolean;
    waitUntil?: 'started' | 'finished';
    provider?: string | null;
    model?: string | null;
    modeId?: string | null;
    thoughtLevel?: string | null;
    autoSend?: boolean;
}

interface QueryArtifactsOptions {
    threadId: string;
    workspacePath?: string;
    conversationStorePath?: string;
    source?: 'auto' | 'provider' | 'runtime';
    format?: 'ai-sdk/v6' | string;
    sinceMs?: number;
}

interface AcpPostMessageRequest {
    type: string;
    requestId: string;
    payload?: unknown;
}

interface AcpPostMessageResponse {
    type?: unknown;
    requestId?: unknown;
    payload?: any;
}

interface AcpPostMessageRetryOptions<TResult> {
    request: AcpPostMessageRequest;
    successTypes: readonly string[];
    errorTypes?: readonly string[];
    timeoutMs?: number;
    defaultErrorMessage?: string;
    mapResult?: (data: AcpPostMessageResponse) => TResult;
}

function createAcpChatRequestId(): string {
    return `acp-chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAcpHostReadyRequestId(): string {
    return `acp-host-ready-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAcpSubscriptionRequestId(): string {
    return `acp-subscribe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAcpRuntimeConfigRequestId(): string {
    return `acp-runtime-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAcpContextRequestId(): string {
    return `acp-context-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAcpAttachmentRequestId(): string {
    return `acp-attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAcpComposerRequestId(): string {
    return `acp-composer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAcpArtifactsRequestId(): string {
    return `acp-artifacts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const ACP_CHAT_SUBMIT_TIMEOUT_MS = 30_000;
const ACP_ARTIFACTS_QUERY_TIMEOUT_MS = 12_000;
const ACP_POST_MESSAGE_ACK_TIMEOUT_MS = 8_000;
const ACP_POST_MESSAGE_RETRY_DELAYS_MS = [0, 160, 520, 1200, 2500] as const;

export function useAssistantBridge(iframeSrc: string, bridgeOptions?: UseAssistantBridgeOptions) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const iframeLoadedRef = useRef(false);
    const themeSyncAttemptRef = useRef(0);
    const imageGenerationConfigSyncAttemptRef = useRef(0);
    const previewMcpConfigSyncAttemptRef = useRef(0);
    const canvasMcpConfigSyncAttemptRef = useRef(0);

    useEffect(() => {
        setIframeLoaded(false);
    }, [iframeSrc]);

    useEffect(() => {
        iframeLoadedRef.current = iframeLoaded;
    }, [iframeLoaded]);

    const resolveTargetOrigin = useCallback(() => {
        try {
            return new URL(iframeSrc).origin;
        } catch {
            return '*';
        }
    }, [iframeSrc]);

    const postAcpRequestWithRetry = useCallback(<TResult = AcpPostMessageResponse>({
        request,
        successTypes,
        errorTypes = [],
        timeoutMs = ACP_POST_MESSAGE_ACK_TIMEOUT_MS,
        defaultErrorMessage = 'AI 助手响应超时',
        mapResult,
    }: AcpPostMessageRetryOptions<TResult>): Promise<TResult> => {
        const iframe = iframeRef.current;
        const targetWindow = iframe?.contentWindow;
        if (!iframe || !targetWindow) {
            return Promise.reject(new Error('AI 助手未就绪'));
        }

        const targetOrigin = resolveTargetOrigin();
        return new Promise<TResult>((resolve, reject) => {
            let settled = false;
            const cleanupTimers: number[] = [];
            const cleanup = () => {
                window.removeEventListener('message', handleMessage);
                cleanupTimers.forEach((timer) => window.clearTimeout(timer));
            };
            const finish = (data: AcpPostMessageResponse) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(mapResult ? mapResult(data) : data as TResult);
            };
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };
            const handleMessage = (event: MessageEvent) => {
                if (event.source !== targetWindow) return;
                if (targetOrigin !== '*' && event.origin !== targetOrigin) return;
                const data = event.data as AcpPostMessageResponse;
                if (!data || data.requestId !== request.requestId || typeof data.type !== 'string') return;
                if (successTypes.includes(data.type)) {
                    finish(data);
                    return;
                }
                if (errorTypes.includes(data.type)) {
                    fail(new Error(String(data.payload?.message || data.payload?.code || defaultErrorMessage)));
                }
            };
            const postRequest = () => {
                if (settled) return;
                try {
                    targetWindow.postMessage(request, targetOrigin);
                } catch (error: any) {
                    fail(error instanceof Error ? error : new Error(String(error)));
                }
            };

            window.addEventListener('message', handleMessage);
            for (const delay of ACP_POST_MESSAGE_RETRY_DELAYS_MS) {
                if (delay === 0) {
                    postRequest();
                } else {
                    cleanupTimers.push(window.setTimeout(postRequest, delay));
                }
            }
            cleanupTimers.push(window.setTimeout(() => fail(new Error(defaultErrorMessage)), timeoutMs));
        });
    }, [resolveTargetOrigin]);

    const requestHostReadyWithRetry = useCallback(() => (
        postAcpRequestWithRetry({
            request: {
                type: 'acp.host.ready',
                requestId: createAcpHostReadyRequestId(),
                payload: {
                    ui: { closeButton: false },
                },
            },
            successTypes: ['acp.ui.ready'],
            errorTypes: ['acp.query.error'],
            defaultErrorMessage: 'AI 助手握手失败',
        })
    ), [postAcpRequestWithRetry]);

    const subscribeEventsWithRetry = useCallback(async (events: readonly string[]) => {
        const requestedEvents = Array.from(new Set(events));
        const acknowledged = await postAcpRequestWithRetry<boolean>({
            request: {
                type: 'acp.subscribe',
                requestId: createAcpSubscriptionRequestId(),
                payload: { events: requestedEvents },
            },
            successTypes: ['acp.query.result'],
            errorTypes: ['acp.query.error'],
            defaultErrorMessage: 'AI 助手事件订阅失败',
            mapResult: (data) => {
                if (data.payload?.ok !== true || data.payload?.kind !== 'subscription') return false;
                const responseEvents = Array.isArray(data.payload?.subscribedEvents)
                    ? data.payload.subscribedEvents.filter((event: unknown): event is string => typeof event === 'string')
                    : [];
                return requestedEvents.every((event) => responseEvents.includes(event));
            },
        });
        if (!acknowledged) {
            throw new Error('AI 助手事件订阅未确认');
        }
        return true;
    }, [postAcpRequestWithRetry]);

    const syncContext = useCallback((context: AssistantContextV1, mode: 'replace' | 'append' = 'replace') => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
            return false;
        }

        try {
            const message = buildAcpContextPostMessage(context, mode);
            iframe.contentWindow.postMessage(message, resolveTargetOrigin());
            return true;
        } catch {
            return false;
        }
    }, [resolveTargetOrigin]);

    const syncContextWithAck = useCallback((context: AssistantContextV1, mode: 'replace' | 'append' = 'replace') => {
        const requestId = createAcpContextRequestId();
        return postAcpRequestWithRetry({
            request: {
                ...buildAcpContextPostMessage(context, mode, requestId),
                requestId,
            },
            successTypes: ['acp.context.result'],
            errorTypes: ['acp.context.error'],
            defaultErrorMessage: 'AI 助手上下文同步失败',
        });
    }, [postAcpRequestWithRetry]);

    const syncContextWithRetry = useCallback((context: AssistantContextV1, mode: 'replace' | 'append' = 'replace') => {
        syncContext(context, mode);
        if (mode === 'replace') {
            window.setTimeout(() => syncContext(context, mode), 160);
            window.setTimeout(() => syncContext(context, mode), 520);
        }
    }, [syncContext]);

    const addContextItems = useCallback((items: AcpContextItem[]) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow || !Array.isArray(items) || items.length === 0) {
            return false;
        }

        try {
            const message = buildAcpContextItemsPostMessage(items, 'append');
            iframe.contentWindow.postMessage(message, resolveTargetOrigin());
            return true;
        } catch {
            return false;
        }
    }, [resolveTargetOrigin]);

    const syncTheme = useCallback((isDarkMode: boolean) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
            return false;
        }

        try {
            const message = buildAcpThemePostMessage(isDarkMode);
            iframe.contentWindow.postMessage(message, resolveTargetOrigin());
            return true;
        } catch {
            return false;
        }
    }, [resolveTargetOrigin]);

    const syncThemeWithRetry = useCallback((isDarkMode: boolean) => {
        const attempt = themeSyncAttemptRef.current + 1;
        themeSyncAttemptRef.current = attempt;
        syncTheme(isDarkMode);
        window.setTimeout(() => {
            if (themeSyncAttemptRef.current === attempt) {
                syncTheme(isDarkMode);
            }
        }, 160);
        window.setTimeout(() => {
            if (themeSyncAttemptRef.current === attempt) {
                syncTheme(isDarkMode);
            }
        }, 520);
    }, [syncTheme]);

    const syncImageGenerationConfig = useCallback((config: AssistantImageGenerationConfig | null | undefined) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
            return false;
        }

        try {
            const message = buildAcpImageGenerationPostMessage(config);
            iframe.contentWindow.postMessage(message, resolveTargetOrigin());
            return true;
        } catch {
            return false;
        }
    }, [resolveTargetOrigin]);

    const syncImageGenerationConfigWithAck = useCallback((config: AssistantImageGenerationConfig | null | undefined) => {
        const requestId = createAcpRuntimeConfigRequestId();
        return postAcpRequestWithRetry({
            request: {
                ...buildAcpImageGenerationPostMessage(config, requestId),
                requestId,
            },
            successTypes: ['acp.runtime.result'],
            errorTypes: ['acp.runtime.error'],
            defaultErrorMessage: 'AI 助手运行时配置同步失败',
        });
    }, [postAcpRequestWithRetry]);

    const syncImageGenerationConfigWithRetry = useCallback((config: AssistantImageGenerationConfig | null | undefined) => {
        const attempt = imageGenerationConfigSyncAttemptRef.current + 1;
        imageGenerationConfigSyncAttemptRef.current = attempt;
        syncImageGenerationConfig(config);
        window.setTimeout(() => {
            if (imageGenerationConfigSyncAttemptRef.current === attempt) {
                syncImageGenerationConfig(config);
            }
        }, 160);
        window.setTimeout(() => {
            if (imageGenerationConfigSyncAttemptRef.current === attempt) {
                syncImageGenerationConfig(config);
            }
        }, 520);
    }, [syncImageGenerationConfig]);

    const syncPreviewMcpConfig = useCallback((config: AssistantPreviewMcpConfig | null | undefined) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
            return false;
        }

        try {
            const message = buildAcpPreviewMcpPostMessage(config);
            iframe.contentWindow.postMessage(message, resolveTargetOrigin());
            return true;
        } catch {
            return false;
        }
    }, [resolveTargetOrigin]);

    const syncPreviewMcpConfigWithAck = useCallback((config: AssistantPreviewMcpConfig | null | undefined) => {
        const requestId = createAcpRuntimeConfigRequestId();
        return postAcpRequestWithRetry({
            request: {
                ...buildAcpPreviewMcpPostMessage(config, requestId),
                requestId,
            },
            successTypes: ['acp.runtime.result'],
            errorTypes: ['acp.runtime.error'],
            defaultErrorMessage: 'AI 助手 MCP 配置同步失败',
        });
    }, [postAcpRequestWithRetry]);

    const syncPreviewMcpConfigWithRetry = useCallback((config: AssistantPreviewMcpConfig | null | undefined) => {
        const attempt = previewMcpConfigSyncAttemptRef.current + 1;
        previewMcpConfigSyncAttemptRef.current = attempt;
        syncPreviewMcpConfig(config);
        window.setTimeout(() => {
            if (previewMcpConfigSyncAttemptRef.current === attempt) {
                syncPreviewMcpConfig(config);
            }
        }, 160);
        window.setTimeout(() => {
            if (previewMcpConfigSyncAttemptRef.current === attempt) {
                syncPreviewMcpConfig(config);
            }
        }, 520);
    }, [syncPreviewMcpConfig]);

    const syncCanvasMcpConfig = useCallback((config: { makeOrigin?: string | null; token?: string | null } | null | undefined) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) {
            return false;
        }

        try {
            const message = buildAcpCanvasMcpPostMessage(config);
            iframe.contentWindow.postMessage(message, resolveTargetOrigin());
            return true;
        } catch {
            return false;
        }
    }, [resolveTargetOrigin]);

    const syncCanvasMcpConfigWithAck = useCallback((config: { makeOrigin?: string | null; token?: string | null } | null | undefined) => {
        const requestId = createAcpRuntimeConfigRequestId();
        return postAcpRequestWithRetry({
            request: {
                ...buildAcpCanvasMcpPostMessage(config, requestId),
                requestId,
            },
            successTypes: ['acp.runtime.result'],
            errorTypes: ['acp.runtime.error'],
            defaultErrorMessage: 'AI 助手画布 MCP 配置同步失败',
        });
    }, [postAcpRequestWithRetry]);

    const syncCanvasMcpConfigWithRetry = useCallback((config: { makeOrigin?: string | null; token?: string | null } | null | undefined) => {
        const attempt = canvasMcpConfigSyncAttemptRef.current + 1;
        canvasMcpConfigSyncAttemptRef.current = attempt;
        syncCanvasMcpConfig(config);
        window.setTimeout(() => {
            if (canvasMcpConfigSyncAttemptRef.current === attempt) {
                syncCanvasMcpConfig(config);
            }
        }, 160);
        window.setTimeout(() => {
            if (canvasMcpConfigSyncAttemptRef.current === attempt) {
                syncCanvasMcpConfig(config);
            }
        }, 520);
    }, [syncCanvasMcpConfig]);

    const waitForReady = useCallback(async (maxWaitMs = 8000) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < maxWaitMs) {
            if (iframeRef.current?.contentWindow && iframeLoadedRef.current) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
        return false;
    }, []);

    const submitPromptWithRetry = useCallback(async (text: string, submitOptions?: SubmitPromptOptions): Promise<AcpChatSubmitResult> => {
        const prompt = String(text || '').trim();
        if (!prompt) {
            throw new Error('请输入提示词');
        }
        const ready = await waitForReady();
        const iframe = iframeRef.current;
        if (!ready || !iframe?.contentWindow) {
            throw new Error('AI 助手未就绪');
        }

        const requestId = createAcpChatRequestId();
        const request = {
            type: 'acp.chat.submit',
            requestId,
            payload: {
                text: prompt,
                waitUntil: submitOptions?.waitUntil || 'started',
                ...(submitOptions?.provider ? { provider: submitOptions.provider } : {}),
                ...(submitOptions?.model ? { model: submitOptions.model } : {}),
                ...(submitOptions?.modeId ? { modeId: submitOptions.modeId } : {}),
                ...(submitOptions?.thoughtLevel ? { thoughtLevel: submitOptions.thoughtLevel } : {}),
                ...(submitOptions?.autoSend === false ? { autoSend: false } : {}),
                ...(submitOptions?.newThread === true ? { newThread: true } : {}),
            },
        };

        return await postAcpRequestWithRetry<AcpChatSubmitResult>({
            request,
            successTypes: ['acp.chat.result'],
            errorTypes: ['acp.chat.error'],
            timeoutMs: ACP_CHAT_SUBMIT_TIMEOUT_MS,
            defaultErrorMessage: 'AI 助手提交失败',
            mapResult: (data) => {
                const resultThreadId = String(data.payload?.threadId || '').trim();
                if (resultThreadId) {
                    bridgeOptions?.onActiveThreadChanged?.(resultThreadId);
                }
                return {
                    ok: true,
                    canSend: Boolean(data.payload?.canSend),
                    ...(typeof data.payload?.isRunning === 'boolean'
                        ? { isRunning: data.payload.isRunning }
                        : {}),
                    textLength: Number(data.payload?.textLength || 0),
                    threadId: resultThreadId,
                };
            },
        });
    }, [bridgeOptions, postAcpRequestWithRetry, waitForReady]);

    const queryArtifactsWithRetry = useCallback(async (query: QueryArtifactsOptions): Promise<AcpThreadArtifactsQueryResult> => {
        const threadId = String(query.threadId || '').trim();
        if (!threadId) {
            throw new Error('缺少 AI 助手线程 ID');
        }
        const ready = await waitForReady();
        const iframe = iframeRef.current;
        if (!ready || !iframe?.contentWindow) {
            throw new Error('AI 助手未就绪');
        }

        const requestId = createAcpArtifactsRequestId();
        const targetOrigin = resolveTargetOrigin();
        const request = {
            type: 'acp.artifacts.get',
            requestId,
            payload: {
                threadId,
                ...(query.workspacePath ? { workspacePath: query.workspacePath } : {}),
                ...(query.conversationStorePath ? { conversationStorePath: query.conversationStorePath } : {}),
                source: query.source || 'auto',
                format: query.format || 'ai-sdk/v6',
                ...(typeof query.sinceMs === 'number' ? { sinceMs: query.sinceMs } : {}),
            },
        };

        return await new Promise<AcpThreadArtifactsQueryResult>((resolve, reject) => {
            let settled = false;
            const cleanupTimers: number[] = [];
            const cleanup = () => {
                window.removeEventListener('message', handleMessage);
                cleanupTimers.forEach((timer) => window.clearTimeout(timer));
            };
            const finish = (result: AcpThreadArtifactsQueryResult) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(result);
            };
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };
            const handleMessage = (event: MessageEvent) => {
                if (event.source !== iframe.contentWindow) return;
                const data = event.data as { type?: unknown; requestId?: unknown; payload?: any };
                if (!data || data.requestId !== requestId) return;
                if (data.type === 'acp.query.result' && data.payload?.kind === 'artifacts') {
                    finish({
                        ok: true,
                        kind: 'artifacts',
                        threadId: String(data.payload?.threadId || threadId),
                        artifacts: Array.isArray(data.payload?.artifacts) ? data.payload.artifacts : [],
                        workspaceArtifacts: Array.isArray(data.payload?.workspaceArtifacts) ? data.payload.workspaceArtifacts : [],
                        imageGenerationRecords: Array.isArray(data.payload?.imageGenerationRecords) ? data.payload.imageGenerationRecords : [],
                        messageCount: Number(data.payload?.messageCount || 0),
                    });
                    return;
                }
                if (data.type === 'acp.query.error') {
                    fail(new Error(String(data.payload?.message || data.payload?.code || 'AI 助手产物查询失败')));
                }
            };
            const postQuery = () => {
                try {
                    iframe.contentWindow?.postMessage(request, targetOrigin);
                } catch (error: any) {
                    fail(error instanceof Error ? error : new Error(String(error)));
                }
            };

            window.addEventListener('message', handleMessage);
            postQuery();
            cleanupTimers.push(window.setTimeout(postQuery, 160));
            cleanupTimers.push(window.setTimeout(postQuery, 520));
            cleanupTimers.push(window.setTimeout(() => fail(new Error('AI 助手产物查询超时')), ACP_ARTIFACTS_QUERY_TIMEOUT_MS));
        });
    }, [resolveTargetOrigin, waitForReady]);

    const addImageAttachmentWithRetry = useCallback(async (
        attachment: AssistantImageAttachmentPayload,
    ): Promise<AcpAttachmentAddResult> => {
        const ready = await waitForReady();
        const iframe = iframeRef.current;
        if (!ready || !iframe?.contentWindow) {
            throw new Error('AI 助手未就绪');
        }

        const requestId = createAcpAttachmentRequestId();
        const request = {
            type: 'acp.attachment.add',
            requestId,
            payload: attachment,
        };

        return await postAcpRequestWithRetry<AcpAttachmentAddResult>({
            request,
            successTypes: ['acp.attachment.result'],
            errorTypes: ['acp.attachment.error'],
            defaultErrorMessage: 'AI 助手添加附件失败',
            mapResult: (data) => ({
                ok: true,
                name: String(data.payload?.name || attachment.name),
                mimeType: String(data.payload?.mimeType || attachment.mimeType),
            }),
        });
    }, [postAcpRequestWithRetry, waitForReady]);

    const appendComposerTextWithRetry = useCallback(async (text: string): Promise<AcpComposerAppendResult> => {
        const prompt = String(text || '').trim();
        if (!prompt) {
            throw new Error('请输入提示词');
        }
        const ready = await waitForReady();
        const iframe = iframeRef.current;
        if (!ready || !iframe?.contentWindow) {
            throw new Error('AI 助手未就绪');
        }

        const requestId = createAcpComposerRequestId();
        const request = {
            type: 'acp.composer.append',
            requestId,
            payload: { text: prompt },
        };

        return await postAcpRequestWithRetry<AcpComposerAppendResult>({
            request,
            successTypes: ['acp.composer.result'],
            errorTypes: ['acp.composer.error'],
            defaultErrorMessage: 'AI 助手填充提示词失败',
            mapResult: (data) => ({
                ok: true,
                textLength: Number(data.payload?.textLength || prompt.length),
            }),
        });
    }, [postAcpRequestWithRetry, waitForReady]);

    return {
        iframeRef,
        iframeLoaded,
        setIframeLoaded,
        requestHostReadyWithRetry,
        subscribeEventsWithRetry,
        syncContext,
        syncContextWithAck,
        syncContextWithRetry,
        addContextItems,
        syncTheme,
        syncThemeWithRetry,
        syncImageGenerationConfig,
        syncImageGenerationConfigWithAck,
        syncImageGenerationConfigWithRetry,
        syncPreviewMcpConfig,
        syncPreviewMcpConfigWithAck,
        syncPreviewMcpConfigWithRetry,
        syncCanvasMcpConfig,
        syncCanvasMcpConfigWithAck,
        syncCanvasMcpConfigWithRetry,
        addImageAttachmentWithRetry,
        appendComposerTextWithRetry,
        submitPromptWithRetry,
        queryArtifactsWithRetry,
        waitForReady,
    };
}
