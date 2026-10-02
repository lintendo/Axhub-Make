import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CanvasRevisionConflictError,
  computeCanvasRevision,
  createCanvasWriteCoordinator,
} from './canvasWriteCoordinator.ts';

const roots: string[] = [];

async function harness() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'axhub-canvas-coordinator-'));
  roots.push(root);
  const canvasPath = path.join(root, 'flows', 'home.excalidraw');
  await fs.mkdir(path.dirname(canvasPath), { recursive: true });
  await fs.writeFile(canvasPath, '{"elements":[]}', 'utf8');
  const sendCommand = vi.fn(async (_command: string, _payload: unknown) => ({
    resultRevision: computeCanvasRevision(canvasPath),
    affectedElementIds: [],
    summary: 'saved',
  }));
  const coordinator = createCanvasWriteCoordinator({
    projectRoot: root,
    bridgeHub: { sendCommand },
    resolveCanvasPath: () => canvasPath,
  });
  return { root, canvasPath, sendCommand, coordinator };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('CanvasWriteCoordinator', () => {
  it('rejects a stale revision before sending a bridge mutation', async () => {
    const { coordinator, sendCommand } = await harness();
    await expect(coordinator.enqueue({
      projectId: 'project-1',
      resourcePath: 'flows/home.excalidraw',
      expectedRevision: 'stale',
      requestId: 'request-1',
      toolName: 'canvas_update_elements',
      payload: { updates: [] },
    })).rejects.toBeInstanceOf(CanvasRevisionConflictError);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('serializes writes for one canvas in arrival order', async () => {
    const { coordinator, canvasPath, sendCommand } = await harness();
    const revision = computeCanvasRevision(canvasPath);
    let active = 0;
    let maxActive = 0;
    sendCommand.mockImplementation(async (_command, payload: any) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, payload.delay));
      active -= 1;
      return { resultRevision: revision, affectedElementIds: [payload.id], summary: payload.id };
    });
    const first = coordinator.enqueue({
      projectId: 'project-1', resourcePath: 'flows/home.excalidraw', expectedRevision: revision,
      requestId: 'request-1', toolName: 'canvas_update_elements', payload: { id: 'first', delay: 15 },
    });
    const second = coordinator.enqueue({
      projectId: 'project-1', resourcePath: 'flows/home.excalidraw', expectedRevision: revision,
      requestId: 'request-2', toolName: 'canvas_update_elements', payload: { id: 'second', delay: 1 },
    });
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
    expect(sendCommand.mock.calls.map((call) => (call[1] as any).id)).toEqual(['first', 'second']);
  });

  it('allows different canvases to run concurrently', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'axhub-canvas-coordinator-two-'));
    roots.push(root);
    const firstPath = path.join(root, 'flows', 'a.excalidraw');
    const secondPath = path.join(root, 'flows', 'b.excalidraw');
    await fs.mkdir(path.dirname(firstPath), { recursive: true });
    await fs.writeFile(firstPath, 'a', 'utf8');
    await fs.writeFile(secondPath, 'b', 'utf8');
    let active = 0;
    let maxActive = 0;
    const sendCommand = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return {};
    });
    const coordinator = createCanvasWriteCoordinator({
      projectRoot: root,
      bridgeHub: { sendCommand },
      resolveCanvasPath: (resourcePath) => resourcePath.endsWith('/a.excalidraw') ? firstPath : secondPath,
    });
    await Promise.all([
      coordinator.enqueue({ projectId: 'project-1', resourcePath: 'flows/a.excalidraw', expectedRevision: computeCanvasRevision(firstPath), requestId: 'a', toolName: 'update', payload: {} }),
      coordinator.enqueue({ projectId: 'project-1', resourcePath: 'flows/b.excalidraw', expectedRevision: computeCanvasRevision(secondPath), requestId: 'b', toolName: 'update', payload: {} }),
    ]);
    expect(maxActive).toBe(2);
  });

  it('replays a duplicate request without sending a second mutation', async () => {
    const { coordinator, canvasPath, sendCommand } = await harness();
    const revision = computeCanvasRevision(canvasPath);
    const input = { projectId: 'project-1', resourcePath: 'flows/home.excalidraw', expectedRevision: revision, requestId: 'request-1', toolName: 'canvas_update_elements', payload: {} };
    const first = await coordinator.enqueue(input);
    const second = await coordinator.enqueue(input);
    expect(sendCommand).toHaveBeenCalledTimes(1);
    expect(second.replayed).toBe(true);
    expect(second.resultRevision).toBe(first.resultRevision);
  });
});
