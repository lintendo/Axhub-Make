import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  postIframeMessageRequest,
  type IframeMessageEvent,
  type MessageEventHost,
} from './iframeMessageRequest';

type TargetWindow = {
  postMessage: (message: Record<string, unknown>, targetOrigin: string) => void;
};

function createMessageHost(hostOrigin = 'http://127.0.0.1:5173') {
  const listeners = new Set<(event: IframeMessageEvent) => void>();
  const host: MessageEventHost = {
    hostOrigin,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  };

  return {
    host,
    dispatch(event: IframeMessageEvent) {
      listeners.forEach((listener) => listener(event));
    },
    listenerCount: () => listeners.size,
  };
}

function createRequest(overrides: Partial<Parameters<typeof postIframeMessageRequest>[0]> = {}) {
  const messageHost = createMessageHost();
  const targetWindow: TargetWindow = {
    postMessage: vi.fn(),
  };
  const requestId = 'request-1';
  const targetUrl = 'http://127.0.0.1:41873/prototypes/home?mode=edit';

  return {
    messageHost,
    targetWindow,
    requestId,
    request: postIframeMessageRequest({
      host: messageHost.host,
      targetUrl,
      targetWindow,
      message: { type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE', requestId },
      requestId,
      successType: 'AXHUB_PROTOTYPE_EDITOR_STATE',
      errorType: 'AXHUB_PROTOTYPE_EDITOR_ERROR',
      timeoutMs: 3_000,
      isCurrent: () => true,
      ...overrides,
    }),
  };
}

describe('postIframeMessageRequest', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts an ACK only when source, dynamic origin, request id, and type all match', async () => {
    vi.useFakeTimers();
    const { messageHost, targetWindow, requestId, request } = createRequest();
    const otherWindow: TargetWindow = { postMessage: vi.fn() };

    await vi.advanceTimersByTimeAsync(0);
    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      { type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE', requestId },
      'http://127.0.0.1:41873',
    );

    messageHost.dispatch({
      source: otherWindow,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId, success: true },
    });
    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:5173',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId, success: true },
    });
    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId: 'other-request', success: true },
    });
    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_READY', requestId, success: true },
    });
    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId, success: true },
    });

    await expect(request).resolves.toEqual({
      type: 'AXHUB_PROTOTYPE_EDITOR_STATE',
      requestId,
      success: true,
    });
    expect(messageHost.listenerCount()).toBe(0);
  });

  it('ignores wrong source and origin before accepting a later correct ACK', async () => {
    vi.useFakeTimers();
    const { messageHost, targetWindow, requestId, request } = createRequest();
    const wrongSource: TargetWindow = { postMessage: vi.fn() };

    await vi.advanceTimersByTimeAsync(0);
    messageHost.dispatch({
      source: wrongSource,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId },
    });
    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:41874',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId },
    });
    expect(messageHost.listenerCount()).toBe(1);

    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId, success: true },
    });

    await expect(request).resolves.toMatchObject({ requestId, success: true });
  });

  it('retries at every scheduled delay and resolves exactly once after a later ACK', async () => {
    vi.useFakeTimers();
    const { messageHost, targetWindow, requestId, request } = createRequest();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(160);
    await vi.advanceTimersByTimeAsync(360);
    await vi.advanceTimersByTimeAsync(680);
    await vi.advanceTimersByTimeAsync(1_300);
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(5);

    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_STATE', requestId, success: true },
    });
    await expect(request).resolves.toMatchObject({ requestId, success: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(5);
  });

  it('resolves null and clears the listener when its iframe session becomes stale', async () => {
    vi.useFakeTimers();
    let current = true;
    const { messageHost, targetWindow, request } = createRequest({
      isCurrent: () => current,
    });

    await vi.advanceTimersByTimeAsync(0);
    current = false;
    await vi.advanceTimersByTimeAsync(160);

    await expect(request).resolves.toBeNull();
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);
    expect(messageHost.listenerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);
  });

  it('finishes with null for an invalid target URL', async () => {
    vi.useFakeTimers();
    const { messageHost, targetWindow, request } = createRequest({ targetUrl: 'http://[invalid' });

    await expect(request).resolves.toBeNull();
    expect(targetWindow.postMessage).not.toHaveBeenCalled();
    expect(messageHost.listenerCount()).toBe(0);
  });

  it('finishes with null for an error ACK', async () => {
    vi.useFakeTimers();
    const { messageHost, targetWindow, requestId, request } = createRequest();

    await vi.advanceTimersByTimeAsync(0);
    messageHost.dispatch({
      source: targetWindow,
      origin: 'http://127.0.0.1:41873',
      data: { type: 'AXHUB_PROTOTYPE_EDITOR_ERROR', requestId, message: 'not available' },
    });

    await expect(request).resolves.toBeNull();
    expect(messageHost.listenerCount()).toBe(0);
  });

  it('finishes with null on timeout', async () => {
    vi.useFakeTimers();
    const { messageHost, request } = createRequest({ timeoutMs: 2_600 });

    await vi.advanceTimersByTimeAsync(2_600);

    await expect(request).resolves.toBeNull();
    expect(messageHost.listenerCount()).toBe(0);
  });

  it('finishes with null and cleans up when postMessage throws', async () => {
    vi.useFakeTimers();
    const targetWindow: TargetWindow = {
      postMessage: vi.fn(() => {
        throw new DOMException('message could not be cloned', 'DataCloneError');
      }),
    };
    const { messageHost, request } = createRequest({ targetWindow });

    await vi.advanceTimersByTimeAsync(0);

    await expect(request).resolves.toBeNull();
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);
    expect(messageHost.listenerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);
  });
});
