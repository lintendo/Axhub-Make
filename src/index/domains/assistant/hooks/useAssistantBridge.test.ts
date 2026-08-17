import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useAssistantBridge source', () => {
  it('uses a shared ACP postMessage request helper for ready and acked runtime/context sync', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');

    expect(source).toContain('const ACP_POST_MESSAGE_RETRY_DELAYS_MS = [0, 160, 520, 1200, 2500] as const;');
    expect(source).toContain('interface AcpPostMessageRetryOptions<TResult>');
    expect(source).toContain('const postAcpRequestWithRetry = useCallback(<TResult = AcpPostMessageResponse>({');
    expect(source).toContain('if (event.source !== targetWindow) return;');
    expect(source).toContain("if (targetOrigin !== '*' && event.origin !== targetOrigin) return;");
    expect(source).toContain('if (!data || data.requestId !== request.requestId || typeof data.type !== \'string\') return;');
    expect(source).toContain('for (const delay of ACP_POST_MESSAGE_RETRY_DELAYS_MS) {');
    expect(source).toContain('targetWindow.postMessage(request, targetOrigin);');
    expect(source).toContain("successTypes: ['acp.ui.ready']");
    expect(source).toContain("type: 'acp.subscribe',");
    expect(source).toContain("successTypes: ['acp.query.result'],");
    expect(source).toContain("data.payload?.kind !== 'subscription'");
    expect(source).toContain('data.payload?.subscribedEvents');
    expect(source).toContain("successTypes: ['acp.runtime.result']");
    expect(source).toContain('const syncCanvasMcpConfigWithAck = useCallback((config: { makeOrigin?: string | null; token?: string | null } | null | undefined) => {');
    expect(source).toContain('...buildAcpCanvasMcpPostMessage(config, requestId),');
    expect(source).toContain("successTypes: ['acp.context.result']");
    expect(source).toContain("errorTypes: ['acp.runtime.error']");
    expect(source).toContain("errorTypes: ['acp.context.error']");
    expect(source).toContain("errorTypes: ['acp.query.error']");
    expect(source).toContain('syncCanvasMcpConfigWithAck,');
  });

  it('reuses the shared helper for request/response composer actions instead of duplicating message listeners', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantBridge.ts'), 'utf8');

    expect(source).toContain("type: 'acp.chat.submit'");
    expect(source).toContain("successTypes: ['acp.chat.result']");
    expect(source).toContain("errorTypes: ['acp.chat.error']");
    expect(source).toContain("type: 'acp.attachment.add'");
    expect(source).toContain("successTypes: ['acp.attachment.result']");
    expect(source).toContain("errorTypes: ['acp.attachment.error']");
    expect(source).toContain("type: 'acp.composer.append'");
    expect(source).toContain("successTypes: ['acp.composer.result']");
    expect(source).toContain("errorTypes: ['acp.composer.error']");
    expect(source).not.toContain('const postSubmit = () => {');
    expect(source).not.toContain('const postAttachment = () => {');
    expect(source).not.toContain('const postComposerAppend = () => {');
  });
});
