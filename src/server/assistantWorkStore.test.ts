import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createCanvasWorkStore,
  normalizeCanvasWorkResourcePath,
  type CanvasWorkCreateInput,
} from './assistantWorkStore.ts';

const tempRoots: string[] = [];

async function createHarness() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'axhub-assistant-work-'));
  tempRoots.push(root);
  const store = createCanvasWorkStore({ projectRoot: root, projectId: 'project-1' });
  return { root, store };
}

function createInput(overrides: Partial<CanvasWorkCreateInput> = {}): CanvasWorkCreateInput {
  return {
    resourcePath: 'flows/home.excalidraw',
    operationId: 'operation-1',
    objective: '补全登录流程',
    baseRevision: 'revision-1',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Canvas Work Store', () => {
  it('normalizes safe canvas resource paths and rejects traversal/non-canvas paths', () => {
    expect(normalizeCanvasWorkResourcePath('resources\\flows\\home.excalidraw')).toBe('flows/home.excalidraw');
    expect(normalizeCanvasWorkResourcePath('/absolute/home.excalidraw')).toBeNull();
    expect(normalizeCanvasWorkResourcePath('../home.excalidraw')).toBeNull();
    expect(normalizeCanvasWorkResourcePath('flows/home.json')).toBeNull();
    expect(normalizeCanvasWorkResourcePath('node_modules/pkg/home.excalidraw')).toBeNull();
  });

  it('writes a schema-v1 sidecar atomically and creates idempotently', async () => {
    const { root, store } = await createHarness();
    const first = await store.create(createInput());
    const duplicate = await store.create(createInput({ objective: '重试同一请求' }));
    expect(duplicate.workId).toBe(first.workId);
    expect(duplicate.objective).toBe(first.objective);
    const filePath = store.getFilePath('flows/home.excalidraw');
    expect(filePath).toContain(path.join(root, '.axhub', 'make', 'runtime', 'assistant-work', 'canvas'));
    expect((await fs.readFile(filePath, 'utf8'))).toContain('"schemaVersion":1');
    expect((await fs.readdir(path.dirname(filePath))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('serializes concurrent updates and preserves unrelated works', async () => {
    const { store } = await createHarness();
    const first = await store.create(createInput());
    const second = await store.create(createInput({ operationId: 'operation-2', objective: '补全注册流程' }));
    await store.update('flows/home.excalidraw', second.workId, (work) => ({ ...work, status: 'running' }));
    await Promise.all([
      store.update('flows/home.excalidraw', first.workId, (work) => ({ ...work, status: 'running' })),
      store.update('flows/home.excalidraw', second.workId, (work) => ({ ...work, status: 'failed', errorCode: 'ACP_RUN_FAILED' })),
    ]);
    const file = await store.read('flows/home.excalidraw');
    expect(file.works).toHaveLength(2);
    expect(file.works.find((work) => work.workId === first.workId)?.status).toBe('running');
    expect(file.works.find((work) => work.workId === second.workId)?.status).toBe('failed');
  });

  it('lists by updatedAt descending with bounded cursor pagination', async () => {
    const { store } = await createHarness();
    await store.create(createInput({ operationId: 'operation-1' }));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store.create(createInput({ operationId: 'operation-2' }));
    const firstPage = await store.list('flows/home.excalidraw', { limit: 1 });
    expect(firstPage.works).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPage = await store.list('flows/home.excalidraw', { limit: 1, cursor: firstPage.nextCursor! });
    expect(secondPage.works).toHaveLength(1);
    expect(secondPage.works[0]?.workId).not.toBe(firstPage.works[0]?.workId);
  });

  it('isolates malformed sidecars and logs a structural diagnostic', async () => {
    const { root, store } = await createHarness();
    const filePath = store.getFilePath('flows/home.excalidraw');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{"schemaVersion":99,"works":[{"objective":"secret"}]}', 'utf8');
    const warnings: unknown[] = [];
    const isolated = createCanvasWorkStore({
      projectRoot: root,
      projectId: 'project-1',
      logger: { warn: (...args: unknown[]) => warnings.push(args) },
    });
    expect((await isolated.list('flows/home.excalidraw', { limit: 20 })).works).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings[0])).not.toContain('secret');
  });

  it('retains at most 200 terminal works while keeping active works', async () => {
    const { store } = await createHarness();
    const active = await store.create(createInput({ operationId: 'active' }));
    for (let index = 0; index < 205; index += 1) {
      const work = await store.create(createInput({ operationId: `terminal-${index}` }));
      await store.update('flows/home.excalidraw', work.workId, (value) => ({ ...value, status: 'running' }));
      await store.update('flows/home.excalidraw', work.workId, (value) => ({
        ...value,
        status: 'completed',
        completedAt: new Date(Date.now() + index).toISOString(),
      }));
    }
    const file = await store.read('flows/home.excalidraw');
    expect(file.works.some((work) => work.workId === active.workId)).toBe(true);
    expect(file.works.filter((work) => ['completed', 'failed', 'cancelled', 'conflict'].includes(work.status))).toHaveLength(200);
  });
});
