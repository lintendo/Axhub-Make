import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_IFRAME_IDLE_GRACE_MS,
  ASSISTANT_IFRAME_MAX_BACKGROUND_ENTRIES,
  activateAssistantIframePoolState,
  buildAssistantIframePoolKey,
  createAssistantIframePoolState,
  markAssistantIframePoolRunState,
  markAssistantIframePoolNavigation,
  pruneAssistantIframePoolState,
  readAssistantIframeRunEvent,
  type AssistantIframePoolDescriptor,
} from './useAssistantIframePool';

function descriptor(overrides: Partial<AssistantIframePoolDescriptor> = {}): AssistantIframePoolDescriptor {
  const webBaseUrl = overrides.webBaseUrl || 'http://localhost:32124';
  const workspacePath = overrides.workspacePath || '/workspace/project-a';
  const conversationStorePath = overrides.conversationStorePath || `${workspacePath}/.spec/acp/conversations.json`;
  return {
    key: overrides.key || buildAssistantIframePoolKey({
      webBaseUrl,
      workspacePath,
      conversationStorePath,
      panelMode: overrides.panelMode || 'general-ai',
    }),
    src: overrides.src || `${webBaseUrl}/?cwd=${encodeURIComponent(workspacePath)}`,
    projectId: overrides.projectId || 'project-a',
    webBaseUrl,
    workspacePath,
    conversationStorePath,
    panelMode: overrides.panelMode || 'general-ai',
    navigationUrl: overrides.navigationUrl || overrides.src || `${webBaseUrl}/?cwd=${encodeURIComponent(workspacePath)}`,
    navigationThreadId: overrides.navigationThreadId ?? null,
  };
}

describe('assistant iframe pool', () => {
  it('relies on React ref cleanup so non-pooled iframe registrations are preserved', () => {
    const source = readFileSync(resolve(__dirname, './useAssistantIframePool.ts'), 'utf8');

    expect(source).not.toContain('const entryKeys = new Set(state.entries.map((entry) => entry.key));');
  });

  it('normalizes equivalent URLs and Windows paths into the same session key', () => {
    expect(buildAssistantIframePoolKey({
      webBaseUrl: 'http://localhost:32124/',
      workspacePath: 'C:\\work\\demo\\',
      conversationStorePath: 'C:\\work\\demo\\.spec\\acp\\conversations.json',
      panelMode: 'general-ai',
    })).toBe(buildAssistantIframePoolKey({
      webBaseUrl: 'http://localhost:32124',
      workspacePath: 'C:/work/demo',
      conversationStorePath: 'C:/work/demo/.spec/acp/conversations.json',
      panelMode: 'general-ai',
    }));
  });

  it('keeps the original iframe src when activating an existing key', () => {
    const first = descriptor({ src: 'http://localhost:32124/?cwd=%2Fworkspace%2Fproject-a' });
    const navigated = markAssistantIframePoolNavigation(
      activateAssistantIframePoolState(createAssistantIframePoolState(), first, 0),
      first.key,
      'http://localhost:32124/thread/thread-1?cwd=%2Fworkspace%2Fproject-a',
      'thread-1',
    );
    const second = descriptor({
      ...first,
      src: 'http://localhost:32124/thread/thread-2?cwd=%2Fworkspace%2Fproject-a',
      navigationUrl: 'http://localhost:32124/thread/thread-2?cwd=%2Fworkspace%2Fproject-a',
      navigationThreadId: 'thread-2',
    });
    const state = activateAssistantIframePoolState(navigated, second, 10);

    expect(state.activeKey).toBe(first.key);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].src).toBe(first.src);
    expect(state.entries[0].navigationUrl).toContain('/thread/thread-1');
    expect(state.entries[0].navigationThreadId).toBe('thread-1');
    expect(state.entries[0].lastActiveAt).toBe(10);
  });

  it('tracks navigation independently for a hidden iframe entry', () => {
    const first = descriptor();
    const second = descriptor({ projectId: 'project-b', workspacePath: '/workspace/project-b' });
    let state = activateAssistantIframePoolState(createAssistantIframePoolState(), first, 0);
    state = activateAssistantIframePoolState(state, second, 1);
    state = markAssistantIframePoolNavigation(
      state,
      first.key,
      'http://localhost:32124/thread/background-thread',
      'background-thread',
    );

    const hiddenEntry = state.entries.find((entry) => entry.key === first.key);
    expect(state.activeKey).toBe(second.key);
    expect(hiddenEntry?.navigationUrl).toContain('/thread/background-thread');
    expect(hiddenEntry?.navigationThreadId).toBe('background-thread');
  });

  it('keeps hidden running entries without a time-based release deadline', () => {
    const first = descriptor();
    const second = descriptor({
      projectId: 'project-b',
      workspacePath: '/workspace/project-b',
    });
    let state = activateAssistantIframePoolState(createAssistantIframePoolState(), first, 0);
    state = markAssistantIframePoolRunState(state, first.key, 'running', 1);
    state = activateAssistantIframePoolState(state, second, 2);
    state = pruneAssistantIframePoolState(state, ASSISTANT_IFRAME_IDLE_GRACE_MS * 3);

    expect(state.entries.map((entry) => entry.key)).toContain(first.key);
    expect(state.entries.find((entry) => entry.key === first.key)?.releaseAt).toBeNull();
  });

  it('stays running until every running thread in the iframe becomes idle', () => {
    const first = descriptor();
    let state = activateAssistantIframePoolState(createAssistantIframePoolState(), first, 0);
    state = markAssistantIframePoolRunState(state, first.key, 'running', 1, 'thread-a');
    state = markAssistantIframePoolRunState(state, first.key, 'running', 2, 'thread-b');
    state = markAssistantIframePoolRunState(state, first.key, 'idle', 3, 'thread-a');

    expect(state.entries[0].runState).toBe('running');
    expect(state.entries[0].runningThreadIds).toEqual(['thread-b']);

    state = markAssistantIframePoolRunState(state, first.key, 'idle', 4, 'thread-b');
    expect(state.entries[0].runState).toBe('idle');
    expect(state.entries[0].runningThreadIds).toEqual([]);
  });

  it('releases hidden idle entries after the grace period', () => {
    const first = descriptor();
    const second = descriptor({
      projectId: 'project-b',
      workspacePath: '/workspace/project-b',
    });
    let state = activateAssistantIframePoolState(createAssistantIframePoolState(), first, 0);
    state = markAssistantIframePoolRunState(state, first.key, 'idle', 1);
    state = activateAssistantIframePoolState(state, second, 2);

    expect(pruneAssistantIframePoolState(state, 2 + ASSISTANT_IFRAME_IDLE_GRACE_MS - 1).entries)
      .toHaveLength(2);
    expect(pruneAssistantIframePoolState(state, 2 + ASSISTANT_IFRAME_IDLE_GRACE_MS).entries)
      .toHaveLength(1);
  });

  it('limits background entries and prefers evicting idle entries before running ones', () => {
    const first = descriptor();
    const second = descriptor({ projectId: 'project-b', workspacePath: '/workspace/project-b' });
    const third = descriptor({ projectId: 'project-c', workspacePath: '/workspace/project-c' });
    const fourth = descriptor({ projectId: 'project-d', workspacePath: '/workspace/project-d' });
    let state = activateAssistantIframePoolState(createAssistantIframePoolState(), first, 0);
    state = markAssistantIframePoolRunState(state, first.key, 'running', 1);
    state = activateAssistantIframePoolState(state, second, 2);
    state = markAssistantIframePoolRunState(state, second.key, 'idle', 3);
    state = activateAssistantIframePoolState(state, third, 4);
    state = markAssistantIframePoolRunState(state, third.key, 'running', 5);
    state = activateAssistantIframePoolState(state, fourth, 6);

    const backgroundKeys = state.entries.filter((entry) => entry.key !== state.activeKey).map((entry) => entry.key);
    expect(backgroundKeys).toHaveLength(ASSISTANT_IFRAME_MAX_BACKGROUND_ENTRIES);
    expect(backgroundKeys).not.toContain(second.key);
    expect(backgroundKeys).toContain(first.key);
    expect(backgroundKeys).toContain(third.key);
  });

  it('parses only ACP runtime and idle events', () => {
    expect(readAssistantIframeRunEvent({
      type: 'acp.event',
      payload: {
        kind: 'thread.runtime.changed',
        threadId: 'thread-1',
        runtime: { isRunning: true },
      },
    })).toEqual({ runState: 'running', threadId: 'thread-1' });
    expect(readAssistantIframeRunEvent({
      type: 'acp.event',
      payload: {
        kind: 'thread.idle',
        threadId: 'thread-1',
        runState: 'completed',
      },
    })).toEqual({ runState: 'idle', threadId: 'thread-1' });
    expect(readAssistantIframeRunEvent({ type: 'acp.chat.result', payload: { isRunning: true } })).toBeNull();
    expect(readAssistantIframeRunEvent(null)).toBeNull();
  });
});
