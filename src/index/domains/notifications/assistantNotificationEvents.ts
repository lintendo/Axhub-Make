import type { NotificationIntent } from './notificationCoordinator';

type TerminalRunState = 'completed' | 'error' | 'aborted';
type AcpRunState = 'running' | TerminalRunState;

type AcpThreadEvent = {
  threadId: string;
  runState: AcpRunState;
};

export interface AssistantNotificationTracker {
  consume(data: unknown): NotificationIntent | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readRunState(value: unknown): AcpRunState | null {
  const state = readText(value);
  return state === 'running' || state === 'completed' || state === 'error' || state === 'aborted'
    ? state
    : null;
}

function readFinalizedAssistantRunState(
  messages: unknown,
  threadId: string,
): TerminalRunState | null {
  if (!Array.isArray(messages)) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = isRecord(messages[index]) ? messages[index] : null;
    const content = isRecord(entry?.content) ? entry.content : entry;
    if (!content || content.role !== 'assistant') continue;

    const metadata = isRecord(content.metadata) ? content.metadata : null;
    const custom = isRecord(metadata?.custom) ? metadata.custom : null;
    const acpRun = isRecord(custom?.acpRun) ? custom.acpRun : null;
    if (!acpRun) continue;

    const runThreadId = readText(acpRun.threadId);
    if (runThreadId && runThreadId !== threadId) continue;
    const state = readRunState(acpRun.status);
    if (state === 'completed' || state === 'error' || state === 'aborted') {
      return state;
    }
  }

  return null;
}

export function readAcpThreadEvent(data: unknown): AcpThreadEvent | null {
  if (!isRecord(data) || data.type !== 'acp.event' || !isRecord(data.payload)) return null;

  const payload = data.payload;
  const threadId = readText(payload.threadId);
  if (!threadId) return null;

  if (payload.kind === 'thread.runtime.changed') {
    const runtime = isRecord(payload.runtime) ? payload.runtime : null;
    if (runtime?.isRunning === true) {
      return { threadId, runState: 'running' };
    }
    const state = readRunState(runtime?.runState ?? payload.runState);
    return state ? { threadId, runState: state } : null;
  }

  if (payload.kind === 'thread.messages.changed') {
    const state = readFinalizedAssistantRunState(payload.messages, threadId);
    return state ? { threadId, runState: state } : null;
  }

  if (payload.kind === 'thread.idle') {
    const state = readRunState(payload.runState);
    return state === 'completed' || state === 'error' || state === 'aborted'
      ? { threadId, runState: state }
      : null;
  }

  return null;
}

export function createAssistantNotificationTracker(): AssistantNotificationTracker {
  const activeRuns = new Map<string, number>();

  return {
    consume(data) {
      const event = readAcpThreadEvent(data);
      if (!event) return null;

      if (event.runState === 'running') {
        activeRuns.set(event.threadId, (activeRuns.get(event.threadId) || 0) + 1);
        return null;
      }

      const sequence = activeRuns.get(event.threadId);
      if (!sequence) return null;
      activeRuns.delete(event.threadId);
      if (event.runState === 'aborted') return null;

      return {
        source: 'assistant-thread',
        scopeKey: event.threadId,
        outcome: event.runState === 'error' ? 'error' : 'completed',
        eventId: `assistant:${event.threadId}:${sequence}`,
      };
    },
  };
}
