export type AssistantWorkKind = 'comment' | 'canvas';

export type AssistantWorkStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'conflict';

export type AssistantWorkErrorCode =
  | 'WORK_NOT_FOUND'
  | 'WORK_FOLLOW_UP_ALREADY_QUEUED'
  | 'WORK_CONCURRENCY_LIMIT'
  | 'WORK_CANCELLED'
  | 'CANVAS_NOT_CONNECTED'
  | 'CANVAS_UNSAVED'
  | 'CANVAS_REVISION_CONFLICT'
  | 'CANVAS_TOOL_TIMEOUT'
  | 'ACP_RUN_REJECTED'
  | 'ACP_RUN_ABORTED'
  | 'ACP_RUN_FAILED'
  | 'ACP_RUN_UNRECOVERABLE';

export interface AssistantWorkSnapshot {
  workId: string;
  kind: AssistantWorkKind;
  resourcePath: string;
  status: AssistantWorkStatus;
  objective: string;
  summary?: string;
  errorCode?: AssistantWorkErrorCode;
  threadId?: string;
  runId?: string;
  baseRevision?: string;
  resultRevision?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CanvasMutationReceipt {
  workId: string;
  requestId: string;
  toolName: string;
  expectedRevision: string;
  resultRevision: string;
  affectedElementIds: string[];
  completedAt: string;
}

export interface CanvasWorkRecordV1 {
  workId: string;
  createOperationId: string;
  projectId: string;
  resourcePath: string;
  objective: string;
  status: AssistantWorkStatus;
  threadId?: string;
  runId?: string;
  baseRevision: string;
  resultRevision?: string;
  summary?: string;
  errorCode?: AssistantWorkErrorCode;
  pendingFollowUp?: {
    operationId: string;
    content: string;
    queuedAt: string;
  };
  attempts: Array<{
    runId: string;
    operationId: string;
    objective: string;
    status: Exclude<AssistantWorkStatus, 'waiting'>;
    baseRevision: string;
    resultRevision?: string;
    startedAt?: string;
    completedAt?: string;
    errorCode?: AssistantWorkErrorCode;
  }>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CanvasWorkFileV1 {
  schemaVersion: 1;
  projectId: string;
  resourcePath: string;
  works: CanvasWorkRecordV1[];
  mutationReceipts: CanvasMutationReceipt[];
  updatedAt: string;
}

export interface MapAcpRunStateToWorkStatusOptions {
  hasPendingFollowUp?: boolean;
  cancelRequested?: boolean;
}

const ASSISTANT_WORK_STATUSES: readonly AssistantWorkStatus[] = [
  'queued',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'conflict',
] as const;

const ASSISTANT_WORK_STATUS_SET = new Set<string>(ASSISTANT_WORK_STATUSES);

const ASSISTANT_WORK_ERROR_CODES: readonly AssistantWorkErrorCode[] = [
  'WORK_NOT_FOUND',
  'WORK_FOLLOW_UP_ALREADY_QUEUED',
  'WORK_CONCURRENCY_LIMIT',
  'WORK_CANCELLED',
  'CANVAS_NOT_CONNECTED',
  'CANVAS_UNSAVED',
  'CANVAS_REVISION_CONFLICT',
  'CANVAS_TOOL_TIMEOUT',
  'ACP_RUN_REJECTED',
  'ACP_RUN_ABORTED',
  'ACP_RUN_FAILED',
  'ACP_RUN_UNRECOVERABLE',
];

const ASSISTANT_WORK_ERROR_CODE_SET = new Set<string>(ASSISTANT_WORK_ERROR_CODES);

const ASSISTANT_WORK_TERMINAL_STATUSES: ReadonlySet<AssistantWorkStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'conflict',
]);

const ASSISTANT_WORK_TRANSITIONS: Record<AssistantWorkStatus, ReadonlySet<AssistantWorkStatus>> = {
  queued: new Set(['queued', 'running', 'waiting', 'cancelled', 'failed']),
  running: new Set(['running', 'waiting', 'queued', 'completed', 'failed', 'cancelled', 'conflict']),
  waiting: new Set(['waiting', 'queued', 'running', 'cancelled', 'failed', 'conflict']),
  completed: new Set(['completed', 'queued']),
  failed: new Set(['failed', 'queued']),
  cancelled: new Set(['cancelled', 'queued']),
  conflict: new Set(['conflict', 'queued']),
};

function normalizeStatusInput(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function coerceAssistantWorkStatus(value: unknown): AssistantWorkStatus | null {
  const normalized = normalizeStatusInput(value);
  return ASSISTANT_WORK_STATUS_SET.has(normalized) ? normalized as AssistantWorkStatus : null;
}

export function normalizeAssistantWorkStatus(value: unknown): AssistantWorkStatus | null {
  return coerceAssistantWorkStatus(value);
}

export function normalizeAssistantWorkErrorCode(value: unknown): AssistantWorkErrorCode | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ASSISTANT_WORK_ERROR_CODE_SET.has(normalized)
    ? normalized as AssistantWorkErrorCode
    : null;
}

export function mapAcpRunStateToWorkStatus(
  runState: unknown,
  options: MapAcpRunStateToWorkStatusOptions = {},
): AssistantWorkStatus | null {
  const normalizedRunState = normalizeStatusInput(runState);
  const hasPendingFollowUp = options.hasPendingFollowUp === true;
  const cancelRequested = options.cancelRequested === true;

  switch (normalizedRunState) {
    case 'queued':
      return hasPendingFollowUp ? 'waiting' : 'queued';
    case 'running':
      return hasPendingFollowUp ? 'waiting' : 'running';
    case 'completed':
      return 'completed';
    case 'aborted':
      return cancelRequested ? 'cancelled' : 'failed';
    case 'error':
      return 'failed';
    default:
      return null;
  }
}

export function isTerminalAssistantWorkStatus(status: unknown): status is Extract<AssistantWorkStatus, 'completed' | 'failed' | 'cancelled' | 'conflict'> {
  const normalizedStatus = coerceAssistantWorkStatus(status);
  return normalizedStatus ? ASSISTANT_WORK_TERMINAL_STATUSES.has(normalizedStatus) : false;
}

export function assertAssistantWorkTransition(fromStatus: unknown, toStatus: unknown): void {
  const normalizedFromStatus = coerceAssistantWorkStatus(fromStatus);
  const normalizedToStatus = coerceAssistantWorkStatus(toStatus);

  if (!normalizedFromStatus || !normalizedToStatus) {
    throw new Error(`Invalid assistant work transition: ${String(fromStatus)} -> ${String(toStatus)}`);
  }

  const allowedTargets = ASSISTANT_WORK_TRANSITIONS[normalizedFromStatus];
  if (allowedTargets.has(normalizedToStatus)) {
    return;
  }

  throw new Error(`Invalid assistant work transition: ${normalizedFromStatus} -> ${normalizedToStatus}`);
}
