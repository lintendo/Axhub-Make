import React from 'react';
import type { CommentaryAnnotationSaveStatus } from '@axhub/commentary';

export const QUICK_EDIT_SAVING_MIN_VISIBLE_MS = 600;

export function useSmoothedAnnotationSaveStatus(
  status: CommentaryAnnotationSaveStatus,
): CommentaryAnnotationSaveStatus {
  const [visibleStatus, setVisibleStatus] = React.useState(status);
  const savingStartedAtRef = React.useRef<number | null>(null);
  const completionTimerRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  React.useLayoutEffect(() => {
    if (completionTimerRef.current !== null) {
      globalThis.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (status === 'saving') {
      savingStartedAtRef.current = null;
      if (visibleStatus !== 'saving') {
        setVisibleStatus('saving');
      }
      return;
    }

    const savingStartedAt = savingStartedAtRef.current;
    if (visibleStatus !== 'saving' || savingStartedAt === null) {
      savingStartedAtRef.current = null;
      if (visibleStatus !== status) {
        setVisibleStatus(status);
      }
      return;
    }

    const remainingDuration = Math.max(
      0,
      QUICK_EDIT_SAVING_MIN_VISIBLE_MS - (Date.now() - savingStartedAt),
    );
    if (remainingDuration === 0) {
      savingStartedAtRef.current = null;
      setVisibleStatus(status);
      return;
    }

    completionTimerRef.current = globalThis.setTimeout(() => {
      completionTimerRef.current = null;
      savingStartedAtRef.current = null;
      setVisibleStatus(status);
    }, remainingDuration);

    return () => {
      if (completionTimerRef.current !== null) {
        globalThis.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [status, visibleStatus]);

  React.useEffect(() => {
    if (
      status === 'saving'
      && visibleStatus === 'saving'
      && savingStartedAtRef.current === null
    ) {
      // Passive effects run after the saving state has been committed and painted.
      // Starting here guarantees the user sees the full minimum duration.
      savingStartedAtRef.current = Date.now();
    }
  }, [status, visibleStatus]);

  return visibleStatus;
}
