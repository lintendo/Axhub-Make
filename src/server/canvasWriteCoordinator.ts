import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { CanvasBridgeError, type CanvasBridgeHub } from './canvasBridge.ts';
import {
  normalizeCanvasWorkResourcePath,
  type CanvasWorkStore,
} from './assistantWorkStore.ts';
import { isPathInside } from './projectCore/index.ts';

export interface CanvasWriteRequest {
  projectId: string;
  resourcePath: string;
  expectedRevision: string;
  requestId: string;
  toolName: string;
  payload: Record<string, unknown>;
  canvasName?: string;
  workId?: string;
}

export interface CanvasWriteResult {
  resultRevision: string;
  affectedElementIds: string[];
  summary: string;
  replayed: boolean;
}

export class CanvasRevisionConflictError extends Error {
  readonly code = 'CANVAS_REVISION_CONFLICT' as const;
  readonly expectedRevision: string;
  readonly actualRevision: string;

  constructor(expectedRevision: string, actualRevision: string) {
    super('Canvas changed while the assistant was working.');
    this.name = 'CanvasRevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export interface CanvasWriteCoordinator {
  enqueue(request: CanvasWriteRequest): Promise<CanvasWriteResult>;
  getQueueLength(key: string): number;
}

function normalizedResourcePath(value: string): string {
  const normalized = normalizeCanvasWorkResourcePath(value);
  if (!normalized) throw new CanvasBridgeError('invalid_canvas_path', 'Invalid canvas resource path.');
  return normalized;
}

function requestKey(request: Pick<CanvasWriteRequest, 'projectId' | 'resourcePath'>): string {
  return `${request.projectId}\u0000${normalizedResourcePath(request.resourcePath)}`;
}

function text(value: unknown, maximum = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function arrayOfIds(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item, 256)).filter(Boolean) : [];
}

export function computeCanvasRevision(filePath: string): string {
  let content: Buffer;
  try {
    content = fs.readFileSync(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') content = Buffer.alloc(0);
    else throw error;
  }
  return createHash('sha256').update(content).digest('hex');
}

export function createCanvasWriteCoordinator(options: {
  projectRoot: string;
  bridgeHub: Pick<CanvasBridgeHub, 'sendCommand'>;
  resolveCanvasPath?: (resourcePath: string) => string;
  store?: CanvasWorkStore;
}): CanvasWriteCoordinator {
  const projectRoot = path.resolve(options.projectRoot);
  const resolveCanvasPath = options.resolveCanvasPath ?? ((resourcePath: string) => path.join(projectRoot, resourcePath));
  const tails = new Map<string, Promise<void>>();
  const localReceipts = new Map<string, CanvasWriteResult>();

  function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(() => undefined, () => undefined);
    tails.set(key, settled);
    void settled.then(() => {
      if (tails.get(key) === settled) tails.delete(key);
    });
    return next;
  }

  return {
    enqueue(request) {
      const resourcePath = normalizedResourcePath(request.resourcePath);
      const normalizedRequest = { ...request, resourcePath };
      const key = requestKey(normalizedRequest);
      return enqueue(key, async () => {
        const localReceiptKey = `${key}\u0000${text(request.requestId, 256)}`;
        const localReceipt = localReceipts.get(localReceiptKey);
        if (localReceipt) return { ...localReceipt, replayed: true };

        const persistedReceipt = options.store
          ? await options.store.findMutationReceipt(resourcePath, request.requestId)
          : null;
        if (persistedReceipt) {
          const replayed = {
            resultRevision: persistedReceipt.resultRevision,
            affectedElementIds: [...persistedReceipt.affectedElementIds],
            summary: 'replayed',
            replayed: true,
          } satisfies CanvasWriteResult;
          localReceipts.set(localReceiptKey, replayed);
          return replayed;
        }

        const filePath = path.resolve(resolveCanvasPath(resourcePath));
        if (!isPathInside(projectRoot, filePath)) {
          throw new CanvasBridgeError('invalid_canvas_path', 'Canvas path is outside the active project.');
        }
        try {
          const realProjectRoot = fs.realpathSync(projectRoot);
          if (fs.existsSync(filePath) && !isPathInside(realProjectRoot, fs.realpathSync(filePath))) {
            throw new CanvasBridgeError('invalid_canvas_path', 'Canvas path is outside the active project.');
          }
        } catch (error) {
          if (error instanceof CanvasBridgeError) throw error;
        }
        const actualRevision = computeCanvasRevision(filePath);
        if (actualRevision !== request.expectedRevision) {
          throw new CanvasRevisionConflictError(request.expectedRevision, actualRevision);
        }

        const bridgePayload = {
          ...request.payload,
          expectedRevision: request.expectedRevision,
          requestId: request.requestId,
        };
        let bridgeResult: any;
        try {
          bridgeResult = await options.bridgeHub.sendCommand(request.toolName, bridgePayload, {
            canvasName: request.canvasName || resourcePath,
            requestId: request.requestId,
          });
        } catch (error) {
          if (error instanceof CanvasBridgeError) throw error;
          throw new CanvasBridgeError('CANVAS_TOOL_TIMEOUT', error instanceof Error ? error.message : 'Canvas tool failed.');
        }

        const resultRevision = text(bridgeResult?.resultRevision, 256) || computeCanvasRevision(filePath);
        const result: CanvasWriteResult = {
          resultRevision,
          affectedElementIds: arrayOfIds(bridgeResult?.affectedElementIds || bridgeResult?.updatedElementIds || bridgeResult?.insertedElementIds || bridgeResult?.deletedElementIds),
          summary: text(bridgeResult?.summary, 2_000) || 'Canvas mutation completed.',
          replayed: false,
        };
        localReceipts.set(localReceiptKey, result);
        if (options.store && request.workId) {
          await options.store.recordMutationReceipt(resourcePath, {
            workId: request.workId,
            requestId: request.requestId,
            toolName: request.toolName,
            expectedRevision: request.expectedRevision,
            resultRevision,
            affectedElementIds: result.affectedElementIds,
            completedAt: new Date().toISOString(),
          });
        }
        return result;
      });
    },
    getQueueLength(key) {
      return tails.has(key) ? 1 : 0;
    },
  };
}
