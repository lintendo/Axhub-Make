const REVIEW_COMMENT_MAX = 4_000;

export interface CommentaryReviewCommentInput {
  element?: Element | null;
  comment?: string;
}

export interface CommentaryReviewCommentProtocol {
  setComment(input: CommentaryReviewCommentInput): boolean;
  clearComment(input: Pick<CommentaryReviewCommentInput, 'element'>): boolean;
}

export interface InstallGlobalCommentaryReviewCommentProtocolOptions {
  windowRef?: Window & Record<string, unknown>;
  isActive: () => boolean;
  setComment: (element: Element, comment: string) => void;
  clearComment: (element: Element) => void;
}

export interface CommentaryReviewCommentProtocolInstallation {
  protocol: CommentaryReviewCommentProtocol;
  dispose(): void;
}

declare global {
  interface Window {
    axhubReview?: CommentaryReviewCommentProtocol;
  }
}

function resolveConnectedElement(value: Element | null | undefined): Element | null {
  return value?.isConnected ? value : null;
}

function normalizeComment(value: unknown): string {
  return String(value ?? '').trim().slice(0, REVIEW_COMMENT_MAX);
}

export function installGlobalCommentaryReviewCommentProtocol(
  options: InstallGlobalCommentaryReviewCommentProtocolOptions,
): CommentaryReviewCommentProtocolInstallation {
  const windowRef = options.windowRef
    ?? (typeof window !== 'undefined'
      ? window as unknown as Window & Record<string, unknown>
      : undefined);
  let disposed = false;

  const canWrite = (): boolean => {
    if (disposed) return false;
    try {
      return options.isActive();
    } catch {
      return false;
    }
  };

  const protocol: CommentaryReviewCommentProtocol = {
    setComment(input) {
      if (!canWrite()) return false;
      const element = resolveConnectedElement(input?.element);
      const comment = normalizeComment(input?.comment);
      if (!element || !comment) return false;
      try {
        options.setComment(element, comment);
        return true;
      } catch {
        return false;
      }
    },
    clearComment(input) {
      if (!canWrite()) return false;
      const element = resolveConnectedElement(input?.element);
      if (!element) return false;
      try {
        options.clearComment(element);
        return true;
      } catch {
        return false;
      }
    },
  };

  if (windowRef) {
    windowRef.axhubReview = protocol;
  }

  return {
    protocol,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (windowRef?.axhubReview === protocol) {
        delete windowRef.axhubReview;
      }
    },
  };
}
