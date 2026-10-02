import { describe, expect, it } from 'vitest';

import type {
  AssistantWorkSnapshot,
  CanvasWorkFileV1,
} from './types';

describe('frontend assistant work types', () => {
  it('keeps canvas snapshots serializable and independent from server modules', () => {
    const snapshot: AssistantWorkSnapshot = {
      workId: 'work-1',
      kind: 'canvas',
      resourcePath: 'flows/home.excalidraw',
      status: 'queued',
      objective: '补全流程',
      baseRevision: 'a'.repeat(64),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    const file: CanvasWorkFileV1 = {
      schemaVersion: 1,
      projectId: 'project-1',
      resourcePath: snapshot.resourcePath,
      works: [],
      mutationReceipts: [],
      updatedAt: snapshot.updatedAt,
    };
    expect(JSON.parse(JSON.stringify({ snapshot, file }))).toEqual({ snapshot, file });
  });
});
