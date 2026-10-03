export type IframeMessageEvent = {
  data: unknown;
  origin: string;
  source: unknown;
};

export type MessageEventHost = {
  hostOrigin: string;
  addEventListener: (type: 'message', listener: (event: IframeMessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: IframeMessageEvent) => void) => void;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

type MessageTargetWindow = {
  postMessage: (message: Record<string, unknown>, targetOrigin: string) => void;
};

export type PostIframeMessageRequestOptions = {
  host: MessageEventHost;
  targetUrl: string;
  targetWindow: MessageTargetWindow | null | undefined;
  message: Record<string, unknown>;
  requestId: string;
  successType: string;
  errorType?: string;
  timeoutMs: number;
  retryDelaysMs?: readonly number[];
  isCurrent: () => boolean;
};

const RETRY_DELAYS_MS = [0, 160, 520, 1200, 2500];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function postIframeMessageRequest({
  host,
  targetUrl,
  targetWindow,
  message,
  requestId,
  successType,
  errorType,
  timeoutMs,
  retryDelaysMs = RETRY_DELAYS_MS,
  isCurrent,
}: PostIframeMessageRequestOptions): Promise<Record<string, unknown> | null> {
  const target = targetWindow;
  let targetOrigin: string;
  try {
    targetOrigin = new URL(targetUrl, host.hostOrigin).origin;
  } catch {
    return Promise.resolve(null);
  }
  if (!target || !isCurrent()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const timers: unknown[] = [];

    const finish = (result: Record<string, unknown> | null) => {
      if (settled) return;
      settled = true;
      timers.forEach((timer) => host.clearTimeout(timer));
      host.removeEventListener('message', onMessage);
      resolve(result);
    };

    const onMessage = (event: IframeMessageEvent) => {
      if (!isCurrent()) {
        finish(null);
        return;
      }
      if (event.source !== target || event.origin !== targetOrigin || !isRecord(event.data)) {
        return;
      }
      if (event.data.requestId !== requestId) {
        return;
      }
      if (event.data.type === successType) {
        finish(event.data);
      } else if (errorType && event.data.type === errorType) {
        finish(null);
      }
    };

    host.addEventListener('message', onMessage);
    retryDelaysMs.forEach((delay) => {
      timers.push(host.setTimeout(() => {
        if (!isCurrent()) {
          finish(null);
          return;
        }
        try {
          target.postMessage(message, targetOrigin);
        } catch {
          finish(null);
        }
      }, delay));
    });
    timers.push(host.setTimeout(() => finish(null), timeoutMs));
  });
}
