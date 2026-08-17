export const AGENT_SURFACE_NAVIGATION_MESSAGE = 'axhub-agent-surface:navigation';
export const AGENT_SURFACE_MAKE_ENTRY_ID = 'axhub-make';

interface AgentSurfaceWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  location: { href: string };
  history: Pick<History, 'pushState' | 'replaceState'>;
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}

export function installAgentSurfaceNavigationReporter(
  windowLike: AgentSurfaceWindow | undefined = typeof window === 'undefined' ? undefined : window,
): () => void {
  if (!windowLike || windowLike.parent === windowLike) {
    return () => undefined;
  }

  const report = () => {
    windowLike.parent.postMessage({
      type: AGENT_SURFACE_NAVIGATION_MESSAGE,
      entryId: AGENT_SURFACE_MAKE_ENTRY_ID,
      url: windowLike.location.href,
    }, '*');
  };
  const originalPushState = windowLike.history.pushState;
  const originalReplaceState = windowLike.history.replaceState;
  const pushState: History['pushState'] = function pushState(...args) {
    const result = originalPushState.apply(windowLike.history, args);
    report();
    return result;
  };
  const replaceState: History['replaceState'] = function replaceState(...args) {
    const result = originalReplaceState.apply(windowLike.history, args);
    report();
    return result;
  };

  windowLike.history.pushState = pushState;
  windowLike.history.replaceState = replaceState;
  windowLike.addEventListener('popstate', report);
  report();

  return () => {
    if (windowLike.history.pushState === pushState) {
      windowLike.history.pushState = originalPushState;
    }
    if (windowLike.history.replaceState === replaceState) {
      windowLike.history.replaceState = originalReplaceState;
    }
    windowLike.removeEventListener('popstate', report);
  };
}
