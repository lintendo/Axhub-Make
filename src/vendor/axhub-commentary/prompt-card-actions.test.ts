import { describe, expect, it, vi } from 'vitest';

import { executePromptCardCurrentElementAction } from '../../../vendor/axhub-commentary/src/ui/runtime/prompt-card-actions';
import { getAgentPromptBubbleActionState } from '../../../vendor/axhub-commentary/src/ui/agent-prompt-action';

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('prompt card current element action', () => {
  it('keeps the vendored execution action loading while its element task is running', () => {
    const state = getAgentPromptBubbleActionState({
      visualState: 'awake',
      pageTaskRunning: true,
      pageTaskSessionReady: true,
      currentTaskRunning: true,
      currentTaskSessionReady: true,
      onSendCurrentElementPromptToAgent: () => undefined,
      getAgentBridgeConnected: () => true,
      hasReusableConversation: true,
    });

    expect(state.disabled).toBe(true);
    expect(state.loading).toBe(true);
    expect(state.dismissBubble).toBe(true);
  });

  it('leaves vendored bubble dismissal to the task lifecycle', async () => {
    const target = {} as Element;
    const sendDeferred = createDeferred<void>();
    const onConfirmText = vi.fn().mockResolvedValue(undefined);
    const onConfirmNote = vi.fn().mockResolvedValue(undefined);
    const onDismissSelection = vi.fn();
    const onSendCurrentElementPromptToAgent = vi.fn(() => sendDeferred.promise);

    const actionOptions = {
      currentTarget: target,
      onConfirmText,
      onConfirmNote,
      onDismissSelection,
      onSendCurrentElementPromptToAgent,
    };
    const resultPromise = executePromptCardCurrentElementAction(actionOptions);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onConfirmText).toHaveBeenCalledTimes(1);
    expect(onConfirmNote).toHaveBeenCalledTimes(1);
    expect(onSendCurrentElementPromptToAgent).toHaveBeenCalledWith(target);
    expect(onDismissSelection).not.toHaveBeenCalled();

    sendDeferred.resolve();
    await expect(resultPromise).resolves.toBe(true);
    expect(onDismissSelection).not.toHaveBeenCalled();
  });

  it('keeps the vendored bubble available when task startup fails', async () => {
    const target = {} as Element;
    const onDismissSelection = vi.fn();

    const actionOptions = {
      currentTarget: target,
      onConfirmText: vi.fn().mockResolvedValue(undefined),
      onConfirmNote: vi.fn().mockResolvedValue(undefined),
      onDismissSelection,
      onSendCurrentElementPromptToAgent: vi.fn().mockRejectedValue(new Error('启动失败')),
    };

    await expect(executePromptCardCurrentElementAction(actionOptions)).rejects.toThrow('启动失败');

    expect(onDismissSelection).not.toHaveBeenCalled();
  });
});
