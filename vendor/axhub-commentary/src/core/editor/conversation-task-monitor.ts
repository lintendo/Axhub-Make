import type {
  AcpRuntimeEventStatus,
  CommentaryConversationTaskQuery,
  CommentaryConversationTaskTransport,
} from '../../web-editor-types';
import type {
  ConversationTaskTerminalTransition,
  PersistedConversationTask,
} from './contracts';

interface ConversationTaskPersistence {
  listEditingConversationTasks(): PersistedConversationTask[];
  transitionConversationTaskTerminal(
    input: ConversationTaskTerminalTransition,
  ): Promise<boolean>;
}

interface ActiveConversationTask {
  task: PersistedConversationTask;
  subscription: ReturnType<CommentaryConversationTaskTransport['watch']> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  terminal: ConversationTaskTerminalTransition | null;
}

export interface ConversationTaskMonitor {
  reconcile(): void;
  stop(): void;
}

export interface ConversationTaskPageSettlement {
  hasError: boolean;
}

const RETRY_DELAYS_MS = [1000, 3000, 10_000, 30_000] as const;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProvider(value: unknown): string {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'openai' ? 'codex' : normalized;
}

function taskKey(task: PersistedConversationTask): string {
  return [task.commentId, task.provider, task.sessionId, task.requestId].join('\u0000');
}

function matchesStatus(task: PersistedConversationTask, status: AcpRuntimeEventStatus): boolean {
  return (
    normalizeText(status.threadId) === task.sessionId
    && normalizeProvider(status.provider) === normalizeProvider(task.provider)
  );
}

function toTerminalTransition(
  task: PersistedConversationTask,
  status: AcpRuntimeEventStatus,
): ConversationTaskTerminalTransition | null {
  if (status.runState === 'completed') {
    return { ...task, state: 'completed', error: null, code: null };
  }
  if (status.runState === 'aborted') {
    return {
      ...task,
      state: 'error',
      error: normalizeText(status.error) || 'ACP run aborted',
      code: 'ACP_RUN_ABORTED',
    };
  }
  if (status.runState === 'error') {
    return {
      ...task,
      state: 'error',
      error: normalizeText(status.error) || 'ACP run failed',
      code: 'ACP_RUN_FAILED',
    };
  }
  return null;
}

export function createConversationTaskMonitor(options: {
  persistence: ConversationTaskPersistence;
  transport?: CommentaryConversationTaskTransport | null;
  logger?: Pick<Console, 'warn'>;
  onTerminalPersisted?: (transition: ConversationTaskTerminalTransition) => void;
  onPageSettled?: (settlement: ConversationTaskPageSettlement) => void | Promise<void>;
}): ConversationTaskMonitor {
  const activeByCommentId = new Map<string, ActiveConversationTask>();
  const transport = options.transport ?? null;
  const logger = options.logger ?? console;
  let pageCycleActive = false;
  let pageCycleHadError = false;

  function isCurrent(entry: ActiveConversationTask): boolean {
    return activeByCommentId.get(entry.task.commentId) === entry;
  }

  function clearRetry(entry: ActiveConversationTask): void {
    if (entry.retryTimer === null) return;
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }

  function abortSubscription(entry: ActiveConversationTask): void {
    const subscription = entry.subscription;
    entry.subscription = null;
    subscription?.abort();
  }

  function discard(entry: ActiveConversationTask): void {
    if (isCurrent(entry)) activeByCommentId.delete(entry.task.commentId);
    clearRetry(entry);
    abortSubscription(entry);
  }

  function scheduleRetry(
    entry: ActiveConversationTask,
    operation: () => void,
  ): void {
    if (!isCurrent(entry) || entry.retryTimer !== null) return;
    const delay = RETRY_DELAYS_MS[Math.min(entry.retryAttempt, RETRY_DELAYS_MS.length - 1)];
    entry.retryAttempt += 1;
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      if (isCurrent(entry)) operation();
    }, delay);
  }

  async function persistTerminal(entry: ActiveConversationTask): Promise<void> {
    if (!entry.terminal || !isCurrent(entry)) return;
    try {
      const applied = await options.persistence.transitionConversationTaskTerminal(entry.terminal);
      if (!isCurrent(entry)) return;
      if (applied) {
        pageCycleHadError ||= entry.terminal.state === 'error';
        try {
          options.onTerminalPersisted?.(entry.terminal);
        } catch (error) {
          logger.warn('[Commentary] Failed to refresh persisted ACP terminal state:', error);
        }
        discard(entry);
        if (
          pageCycleActive
          && activeByCommentId.size === 0
          && options.persistence.listEditingConversationTasks().length === 0
        ) {
          const settlement = { hasError: pageCycleHadError };
          pageCycleActive = false;
          pageCycleHadError = false;
          try {
            void Promise.resolve(options.onPageSettled?.(settlement)).catch((error) => {
              logger.warn('[Commentary] Failed to notify ACP page settlement:', error);
            });
          } catch (error) {
            logger.warn('[Commentary] Failed to notify ACP page settlement:', error);
          }
        }
        return;
      }
      discard(entry);
    } catch (error) {
      logger.warn('[Commentary] Failed to persist ACP terminal state:', error);
      scheduleRetry(entry, () => {
        void persistTerminal(entry);
      });
    }
  }

  function startWatching(entry: ActiveConversationTask): void {
    if (!transport || !isCurrent(entry) || entry.terminal) return;
    clearRetry(entry);
    const query: CommentaryConversationTaskQuery = {
      commentId: entry.task.commentId,
      provider: entry.task.provider,
      threadId: entry.task.sessionId,
      requestId: entry.task.requestId,
    };
    const subscription = transport.watch(query, {
      async next(status) {
        if (!isCurrent(entry) || entry.subscription !== subscription) return;
        if (!matchesStatus(entry.task, status)) return;
        const terminal = toTerminalTransition(entry.task, status);
        if (!terminal) return;
        entry.terminal = terminal;
        abortSubscription(entry);
        await persistTerminal(entry);
      },
    });
    entry.subscription = subscription;
    void subscription.done.then(
      () => {
        if (!isCurrent(entry) || entry.subscription !== subscription || entry.terminal) return;
        entry.subscription = null;
        scheduleRetry(entry, () => startWatching(entry));
      },
      (error) => {
        if (!isCurrent(entry) || entry.subscription !== subscription || entry.terminal) return;
        entry.subscription = null;
        logger.warn('[Commentary] ACP task transport closed:', error);
        scheduleRetry(entry, () => startWatching(entry));
      },
    );
  }

  function start(task: PersistedConversationTask): void {
    const entry: ActiveConversationTask = {
      task,
      subscription: null,
      retryTimer: null,
      retryAttempt: 0,
      terminal: null,
    };
    activeByCommentId.set(task.commentId, entry);
    startWatching(entry);
  }

  function reconcile(): void {
    if (!transport) return;
    const editingTasks = options.persistence.listEditingConversationTasks();
    if (editingTasks.length > 0) pageCycleActive = true;
    const nextByCommentId = new Map(editingTasks.map((task) => [task.commentId, task]));
    for (const entry of activeByCommentId.values()) {
      const next = nextByCommentId.get(entry.task.commentId);
      if (entry.terminal && !next) continue;
      if (!next || taskKey(next) !== taskKey(entry.task)) {
        discard(entry);
        continue;
      }
      nextByCommentId.delete(entry.task.commentId);
    }
    for (const task of nextByCommentId.values()) start(task);
  }

  function stop(): void {
    for (const entry of [...activeByCommentId.values()]) discard(entry);
  }

  return { reconcile, stop };
}
