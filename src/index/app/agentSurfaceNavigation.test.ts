import { describe, expect, it, vi } from 'vitest';

import { installAgentSurfaceNavigationReporter } from './agentSurfaceNavigation';

function createEmbeddedWindow() {
  const listeners = new Map<string, Array<() => void>>();
  const parent = { postMessage: vi.fn() };
  const history = {
    pushState: vi.fn(),
    replaceState: vi.fn(),
  };
  const windowLike = {
    parent,
    location: { href: 'http://127.0.0.1:53817/?projectId=demo&surface=codex' },
    history,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== listener));
    }),
  };
  return {
    windowLike,
    parent,
    dispatch(type: string) {
      for (const listener of listeners.get(type) || []) listener();
    },
  };
}

describe('Agent Surface navigation reporter', () => {
  it('reports initial load and browser history changes from an embedded Make page', () => {
    const { windowLike, parent, dispatch } = createEmbeddedWindow();
    const cleanup = installAgentSurfaceNavigationReporter(windowLike as never);

    expect(parent.postMessage).toHaveBeenCalledWith({
      type: 'axhub-agent-surface:navigation',
      entryId: 'axhub-make',
      url: 'http://127.0.0.1:53817/?projectId=demo&surface=codex',
    }, '*');

    windowLike.history.pushState({}, '', '/?projectId=next&surface=codex');
    windowLike.history.replaceState({}, '', '/?projectId=replace&surface=codex');
    dispatch('popstate');

    expect(parent.postMessage).toHaveBeenCalledTimes(4);
    cleanup();
  });

  it('does not install a reporter when Make is the top-level page', () => {
    const { windowLike, parent } = createEmbeddedWindow();
    windowLike.parent = windowLike as never;

    const cleanup = installAgentSurfaceNavigationReporter(windowLike as never);

    expect(parent.postMessage).not.toHaveBeenCalled();
    cleanup();
  });
});
