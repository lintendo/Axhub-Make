import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertAssistantWorkTransition,
  isTerminalAssistantWorkStatus,
  normalizeAssistantWorkErrorCode,
  normalizeAssistantWorkStatus,
  type AssistantWorkErrorCode,
  type AssistantWorkStatus,
  type CanvasMutationReceipt,
  type CanvasWorkFileV1,
  type CanvasWorkRecordV1,
} from './assistantWorkProtocol.ts';

const MAX_OBJECTIVE_LENGTH = 8_000;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_FOLLOW_UP_LENGTH = 4_000;
const MAX_TERMINAL_WORKS = 200;

export interface CanvasWorkCreateInput {
  resourcePath: string;
  operationId: string;
  objective: string;
  baseRevision: string;
  workId?: string;
  threadId?: string;
  now?: string;
}

export interface CanvasWorkListResult {
  works: CanvasWorkRecordV1[];
  nextCursor: string | null;
  total: number;
}

export interface CanvasWorkStore {
  getFilePath(resourcePath: string): string;
  listResourcePaths(): Promise<string[]>;
  read(resourcePath: string): Promise<CanvasWorkFileV1>;
  create(input: CanvasWorkCreateInput): Promise<CanvasWorkRecordV1>;
  update(
    resourcePath: string,
    workId: string,
    updater: (work: CanvasWorkRecordV1) => CanvasWorkRecordV1 | Promise<CanvasWorkRecordV1>,
  ): Promise<CanvasWorkRecordV1>;
  list(resourcePath: string, options?: { cursor?: string; limit?: number }): Promise<CanvasWorkListResult>;
  findByOperationId(resourcePath: string, operationId: string): Promise<CanvasWorkRecordV1 | null>;
  findByWorkId(resourcePath: string, workId: string): Promise<CanvasWorkRecordV1 | null>;
  recordMutationReceipt(resourcePath: string, receipt: CanvasMutationReceipt): Promise<CanvasMutationReceipt>;
  findMutationReceipt(resourcePath: string, requestId: string): Promise<CanvasMutationReceipt | null>;
  waitForIdle(resourcePath?: string): Promise<void>;
}

export class CanvasWorkStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CanvasWorkStoreError';
    this.code = code;
  }
}

function text(value: unknown, maximum: number): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.slice(0, maximum);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeResourcePathInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let normalized = value.trim().replace(/\\/gu, '/');
  if (!normalized || normalized.includes('\u0000')) return null;
  if (normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized)) return null;
  normalized = normalized.replace(/^\.\//u, '');
  normalized = normalized.replace(/^src\/resources\//u, '').replace(/^resources\//u, '');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  if (parts.some((part) => part.toLowerCase() === 'node_modules' || part.toLowerCase() === '.git' || part.toLowerCase() === '.axhub')) return null;
  if (path.posix.extname(normalized).toLowerCase() !== '.excalidraw') return null;
  return parts.join('/');
}

export function normalizeCanvasWorkResourcePath(value: unknown): string | null {
  return normalizeResourcePathInput(value);
}

function createEmptyFile(projectId: string, resourcePath: string): CanvasWorkFileV1 {
  return {
    schemaVersion: 1,
    projectId,
    resourcePath,
    works: [],
    mutationReceipts: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeAttempt(value: unknown): CanvasWorkRecordV1['attempts'][number] | null {
  if (!isRecord(value)) return null;
  const status = normalizeAssistantWorkStatus(value.status);
  const runId = text(value.runId, 256);
  const operationId = text(value.operationId, 256);
  const objective = text(value.objective, MAX_OBJECTIVE_LENGTH);
  const baseRevision = text(value.baseRevision, 256);
  if (!status || status === 'waiting' || !runId || !operationId || !objective || !baseRevision) return null;
  return {
    runId,
    operationId,
    objective,
    status,
    baseRevision,
    ...(text(value.resultRevision, 256) ? { resultRevision: text(value.resultRevision, 256) } : {}),
    ...(text(value.startedAt, 64) ? { startedAt: text(value.startedAt, 64) } : {}),
    ...(text(value.completedAt, 64) ? { completedAt: text(value.completedAt, 64) } : {}),
    ...(normalizeAssistantWorkErrorCode(value.errorCode) ? { errorCode: normalizeAssistantWorkErrorCode(value.errorCode)! } : {}),
  };
}

function normalizeWork(value: unknown, projectId: string, resourcePath: string): CanvasWorkRecordV1 | null {
  if (!isRecord(value)) return null;
  const status = normalizeAssistantWorkStatus(value.status);
  const workId = text(value.workId, 256);
  const createOperationId = text(value.createOperationId, 256);
  const recordProjectId = text(value.projectId, 256);
  const recordPath = normalizeResourcePathInput(value.resourcePath);
  const objective = text(value.objective, MAX_OBJECTIVE_LENGTH);
  const baseRevision = text(value.baseRevision, 256);
  const createdAt = text(value.createdAt, 64);
  const updatedAt = text(value.updatedAt, 64);
  if (!status || !workId || !createOperationId || recordProjectId !== projectId || recordPath !== resourcePath || !objective || !baseRevision || !createdAt || !updatedAt) return null;
  if (!Array.isArray(value.attempts)) return null;
  const attempts = value.attempts.map(normalizeAttempt).filter((item): item is CanvasWorkRecordV1['attempts'][number] => Boolean(item));
  const pending = isRecord(value.pendingFollowUp)
    ? {
        operationId: text(value.pendingFollowUp.operationId, 256),
        content: text(value.pendingFollowUp.content, MAX_FOLLOW_UP_LENGTH),
        queuedAt: text(value.pendingFollowUp.queuedAt, 64),
      }
    : null;
  if (pending && (!pending.operationId || !pending.content || !pending.queuedAt)) return null;
  return {
    workId,
    createOperationId,
    projectId,
    resourcePath,
    objective,
    status,
    ...(text(value.threadId, 256) ? { threadId: text(value.threadId, 256) } : {}),
    ...(text(value.runId, 256) ? { runId: text(value.runId, 256) } : {}),
    baseRevision,
    ...(text(value.resultRevision, 256) ? { resultRevision: text(value.resultRevision, 256) } : {}),
    ...(text(value.summary, MAX_SUMMARY_LENGTH) ? { summary: text(value.summary, MAX_SUMMARY_LENGTH) } : {}),
    ...(normalizeAssistantWorkErrorCode(value.errorCode) ? { errorCode: normalizeAssistantWorkErrorCode(value.errorCode)! } : {}),
    ...(pending ? { pendingFollowUp: pending } : {}),
    attempts,
    createdAt,
    updatedAt,
    ...(text(value.startedAt, 64) ? { startedAt: text(value.startedAt, 64) } : {}),
    ...(text(value.completedAt, 64) ? { completedAt: text(value.completedAt, 64) } : {}),
  };
}

function normalizeReceipt(value: unknown, projectId: string, resourcePath: string): CanvasMutationReceipt | null {
  if (!isRecord(value)) return null;
  const workId = text(value.workId, 256);
  const requestId = text(value.requestId, 256);
  const toolName = text(value.toolName, 128);
  const expectedRevision = text(value.expectedRevision, 256);
  const resultRevision = text(value.resultRevision, 256);
  const completedAt = text(value.completedAt, 64);
  const ids = Array.isArray(value.affectedElementIds) ? value.affectedElementIds.map((id) => text(id, 256)).filter(Boolean) : [];
  void projectId;
  void resourcePath;
  if (!workId || !requestId || !toolName || !expectedRevision || !resultRevision || !completedAt) return null;
  return { workId, requestId, toolName, expectedRevision, resultRevision, affectedElementIds: ids, completedAt };
}

function decodeCursor(value: string | undefined): { updatedAt: string; workId: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { updatedAt?: string; workId?: string };
    return parsed?.updatedAt && parsed?.workId ? { updatedAt: parsed.updatedAt, workId: parsed.workId } : null;
  } catch {
    return null;
  }
}

function encodeCursor(work: CanvasWorkRecordV1): string {
  return Buffer.from(JSON.stringify({ updatedAt: work.updatedAt, workId: work.workId }), 'utf8').toString('base64url');
}

export function createCanvasWorkStore(options: {
  projectRoot: string;
  projectId: string;
  logger?: Pick<Console, 'warn'>;
}): CanvasWorkStore {
  const projectRoot = path.resolve(options.projectRoot);
  const projectId = text(options.projectId, 256);
  const logger = options.logger ?? console;
  const tails = new Map<string, Promise<void>>();

  function resourcePath(value: unknown): string {
    const normalized = normalizeResourcePathInput(value);
    if (!normalized) throw new CanvasWorkStoreError('INVALID_RESOURCE_PATH', 'Invalid canvas resource path.');
    return normalized;
  }

  function filePathFor(normalized: string): string {
    const key = createHash('sha256').update(normalized).digest('hex');
    return path.join(projectRoot, '.axhub', 'make', 'runtime', 'assistant-work', 'canvas', `${key}.json`);
  }

  function enqueue<T>(normalized: string, operation: () => Promise<T>): Promise<T> {
    const previous = tails.get(normalized) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(() => undefined, () => undefined);
    tails.set(normalized, settled);
    void settled.then(() => {
      if (tails.get(normalized) === settled) tails.delete(normalized);
    });
    return next;
  }

  async function readRaw(normalized: string): Promise<CanvasWorkFileV1> {
    const filePath = filePathFor(normalized);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error: any) {
      if (error?.code === 'ENOENT') return createEmptyFile(projectId, normalized);
      logger.warn('[assistant-work] ignored malformed Canvas Work sidecar', { code: error?.code || 'INVALID_JSON' });
      return createEmptyFile(projectId, normalized);
    }
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || text(parsed.projectId, 256) !== projectId || normalizeResourcePathInput(parsed.resourcePath) !== normalized || !Array.isArray(parsed.works) || !Array.isArray(parsed.mutationReceipts)) {
      logger.warn('[assistant-work] ignored malformed Canvas Work sidecar', { code: 'INVALID_SCHEMA' });
      return createEmptyFile(projectId, normalized);
    }
    const works = parsed.works.map((value) => normalizeWork(value, projectId, normalized)).filter((value): value is CanvasWorkRecordV1 => Boolean(value));
    const mutationReceipts = parsed.mutationReceipts.map((value) => normalizeReceipt(value, projectId, normalized)).filter((value): value is CanvasMutationReceipt => Boolean(value));
    return {
      schemaVersion: 1,
      projectId,
      resourcePath: normalized,
      works,
      mutationReceipts,
      updatedAt: text(parsed.updatedAt, 64) || new Date(0).toISOString(),
    };
  }

  async function writeRaw(normalized: string, file: CanvasWorkFileV1): Promise<void> {
    const filePath = filePathFor(normalized);
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(file)}\n`, 'utf8');
    try {
      await fs.rename(temporaryPath, filePath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  function prune(file: CanvasWorkFileV1): CanvasWorkFileV1 {
    const active = file.works.filter((work) => !isTerminalAssistantWorkStatus(work.status));
    const terminal = file.works
      .filter((work) => isTerminalAssistantWorkStatus(work.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.workId.localeCompare(a.workId))
      .slice(0, MAX_TERMINAL_WORKS);
    const keptIds = new Set([...active, ...terminal].map((work) => work.workId));
    return {
      ...file,
      works: [...active, ...terminal],
      mutationReceipts: file.mutationReceipts.filter((receipt) => keptIds.has(receipt.workId)),
    };
  }

  async function read(resource: string): Promise<CanvasWorkFileV1> {
    return readRaw(resourcePath(resource));
  }

  return {
    getFilePath(resource) {
      return filePathFor(resourcePath(resource));
    },
    async listResourcePaths() {
      const directory = path.join(projectRoot, '.axhub', 'make', 'runtime', 'assistant-work', 'canvas');
      let entries: string[];
      try {
        entries = await fs.readdir(directory);
      } catch (error: any) {
        if (error?.code === 'ENOENT') return [];
        throw error;
      }
      const resources = new Set<string>();
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        try {
          const parsed = JSON.parse(await fs.readFile(path.join(directory, entry), 'utf8')) as Record<string, unknown>;
          const candidate = normalizeResourcePathInput(parsed.resourcePath);
          if (candidate && text(parsed.projectId, 256) === projectId) resources.add(candidate);
        } catch {
          // Malformed sidecars are isolated by readRaw and omitted from recovery.
        }
      }
      return [...resources];
    },
    read,
    create(input) {
      const normalized = resourcePath(input.resourcePath);
      return enqueue(normalized, async () => {
        const current = await readRaw(normalized);
        const operationId = text(input.operationId, 256);
        if (!operationId) throw new CanvasWorkStoreError('INVALID_OPERATION_ID', 'Operation id is required.');
        const existing = current.works.find((work) => work.createOperationId === operationId);
        if (existing) return clone(existing);
        const now = input.now || new Date().toISOString();
        const work: CanvasWorkRecordV1 = {
          workId: text(input.workId, 256) || `canvas-work-${randomUUID()}`,
          createOperationId: operationId,
          projectId,
          resourcePath: normalized,
          objective: text(input.objective, MAX_OBJECTIVE_LENGTH),
          status: 'queued',
          ...(text(input.threadId, 256) ? { threadId: text(input.threadId, 256) } : {}),
          baseRevision: text(input.baseRevision, 256),
          attempts: [],
          createdAt: now,
          updatedAt: now,
        };
        if (!work.objective || !work.baseRevision) throw new CanvasWorkStoreError('INVALID_WORK_INPUT', 'Objective and base revision are required.');
        const next = prune({ ...current, works: [...current.works, work], updatedAt: now });
        await writeRaw(normalized, next);
        return clone(work);
      });
    },
    update(resource, workId, updater) {
      const normalized = resourcePath(resource);
      return enqueue(normalized, async () => {
        const current = await readRaw(normalized);
        const index = current.works.findIndex((work) => work.workId === text(workId, 256));
        if (index < 0) throw new CanvasWorkStoreError('WORK_NOT_FOUND', 'Canvas work was not found.');
        const previous = current.works[index];
        const nextWork = await updater(clone(previous));
        if (!nextWork || nextWork.workId !== previous.workId || nextWork.projectId !== projectId || nextWork.resourcePath !== normalized) {
          throw new CanvasWorkStoreError('INVALID_WORK_UPDATE', 'Canvas work update changed its identity.');
        }
        assertAssistantWorkTransition(previous.status, nextWork.status);
        const normalizedNext: CanvasWorkRecordV1 = {
          ...nextWork,
          objective: text(nextWork.objective, MAX_OBJECTIVE_LENGTH),
          summary: text(nextWork.summary, MAX_SUMMARY_LENGTH) || undefined,
          updatedAt: new Date().toISOString(),
        };
        const works = [...current.works];
        works[index] = normalizedNext;
        const next = prune({ ...current, works, updatedAt: normalizedNext.updatedAt });
        await writeRaw(normalized, next);
        return clone(normalizedNext);
      });
    },
    async list(resource, options = {}) {
      const normalized = resourcePath(resource);
      await this.waitForIdle(normalized);
      const file = await readRaw(normalized);
      const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 20)));
      const sorted = [...file.works].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.workId.localeCompare(a.workId));
      const cursor = decodeCursor(options.cursor);
      const start = cursor
        ? Math.max(0, sorted.findIndex((work) => work.updatedAt === cursor.updatedAt && work.workId === cursor.workId) + 1)
        : 0;
      const works = sorted.slice(start, start + limit).map(clone);
      return { works, total: sorted.length, nextCursor: start + limit < sorted.length && works.length ? encodeCursor(works[works.length - 1]) : null };
    },
    async findByOperationId(resource, operationId) {
      const file = await read(resource);
      const found = file.works.find((work) => work.createOperationId === text(operationId, 256));
      return found ? clone(found) : null;
    },
    async findByWorkId(resource, workId) {
      const file = await read(resource);
      const found = file.works.find((work) => work.workId === text(workId, 256));
      return found ? clone(found) : null;
    },
    recordMutationReceipt(resource, receipt) {
      const normalized = resourcePath(resource);
      return enqueue(normalized, async () => {
        const current = await readRaw(normalized);
        const existing = current.mutationReceipts.find((value) => value.requestId === receipt.requestId);
        if (existing) return clone(existing);
        const next = prune({ ...current, mutationReceipts: [...current.mutationReceipts, clone(receipt)], updatedAt: new Date().toISOString() });
        await writeRaw(normalized, next);
        return clone(receipt);
      });
    },
    async findMutationReceipt(resource, requestId) {
      const file = await read(resource);
      const found = file.mutationReceipts.find((receipt) => receipt.requestId === text(requestId, 256));
      return found ? clone(found) : null;
    },
    async waitForIdle(resource) {
      if (resource) {
        const normalized = resourcePath(resource);
        await tails.get(normalized);
        return;
      }
      await Promise.all([...tails.values()]);
    },
  };
}

export type { AssistantWorkErrorCode, AssistantWorkStatus };
