import type { AiRunSseEvent } from './aiRunClient';

export const CANVAS_VIEWPORT_AI_TIMING_LOG_PREFIX = '[canvas-viewport-ai:timing]';

interface CanvasViewportAiRunIdentity {
  runId?: string | null;
  threadId?: string | null;
}

interface CanvasViewportAiTimingOptions {
  provider: string;
  canvasFilePath: string;
  now?: () => number;
  log?: (message: string, metadata: Record<string, unknown>) => void;
}

export interface CanvasViewportAiTiming {
  accepted(payload?: CanvasViewportAiRunIdentity): void;
  handleStreamEvent(event: AiRunSseEvent): void;
  completed(payload?: CanvasViewportAiRunIdentity): void;
  failed(error: unknown): void;
  aborted(): void;
}

function normalizeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const message = String(error || '').trim();
  return message || 'Unknown error';
}

export function createCanvasViewportAiTiming(
  options: CanvasViewportAiTimingOptions,
): CanvasViewportAiTiming {
  const now = options.now || (() => performance.now());
  const log = options.log || ((message, metadata) => console.info(message, metadata));
  const startedAt = now();
  let firstResponseLogged = false;
  let terminalLogged = false;
  let runId: string | null = null;
  let threadId: string | null = null;

  const elapsedMs = () => Math.max(0, Math.round(now() - startedAt));
  const emit = (event: string, metadata: Record<string, unknown>) => {
    try {
      log(`${CANVAS_VIEWPORT_AI_TIMING_LOG_PREFIX} ${event}`, metadata);
    } catch {
      // Diagnostics must never affect the AI request.
    }
  };
  const rememberRun = (payload?: CanvasViewportAiRunIdentity) => {
    runId = normalizeIdentifier(payload?.runId) || runId;
    threadId = normalizeIdentifier(payload?.threadId) || threadId;
  };
  const emitTerminal = (
    event: 'completed' | 'error' | 'aborted',
    metadata: Record<string, unknown> = {},
  ) => {
    if (terminalLogged) return;
    terminalLogged = true;
    emit(event, { elapsedMs: elapsedMs(), runId, threadId, ...metadata });
  };

  emit('started', {
    provider: options.provider,
    canvasFilePath: options.canvasFilePath,
  });

  return {
    accepted(payload) {
      rememberRun(payload);
      emit('accepted', { elapsedMs: elapsedMs(), runId, threadId });
    },
    handleStreamEvent(event) {
      const isResponseEvent = event.event === 'run.text.delta'
        || event.event === 'run.reasoning.delta';
      if (
        terminalLogged
        || firstResponseLogged
        || !isResponseEvent
        || !String(event.data.delta || '').trim()
      ) {
        return;
      }
      firstResponseLogged = true;
      emit('first-response', {
        elapsedMs: elapsedMs(),
        responseEvent: event.event,
        runId,
        threadId,
      });
    },
    completed(payload) {
      rememberRun(payload);
      emitTerminal('completed');
    },
    failed(error) {
      emitTerminal('error', { error: normalizeErrorMessage(error) });
    },
    aborted() {
      emitTerminal('aborted');
    },
  };
}
