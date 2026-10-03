import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getProjectPublishedHtmlDir,
  getProjectPublishedRealtimeDir,
} from '../projectCore/index.ts';
import {
  readHtmlManifest,
  readRealtimeManifest,
  resolvePublishedFilePath,
  writeHtmlSnapshot,
  writeRealtimeManifest,
} from '../lanPublishingStorage.ts';

const roots: string[] = [];

function createRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-lan-publishing-storage-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('lan publishing storage', () => {
  it('uses project-local immutable publishing directories', () => {
    const root = createRoot();
    expect(getProjectPublishedHtmlDir(root)).toBe(path.join(root, '.axhub/make/exports/published-html'));
    expect(getProjectPublishedRealtimeDir(root)).toBe(path.join(root, '.axhub/make/exports/published-realtime'));
  });

  it('creates separate HTML snapshots without overwriting earlier content', async () => {
    const root = createRoot();
    const metadata = {
      projectId: 'demo',
      resourcePath: 'src/prototypes/home',
      includeSource: false,
    };
    const first = await writeHtmlSnapshot(root, [
      { path: 'index.html', contentType: 'text/html; charset=utf-8', body: Buffer.from('v1') },
    ], metadata);
    const second = await writeHtmlSnapshot(root, [
      { path: 'index.html', contentType: 'text/html; charset=utf-8', body: Buffer.from('v2') },
    ], metadata);

    expect(first.publishId).toMatch(/^[a-f0-9]{24}$/u);
    expect(first.publishId).not.toMatch(/^html-/u);
    expect(second.publishId).not.toBe(first.publishId);
    expect(fs.readFileSync(path.join(first.snapshotDir, 'index.html'), 'utf8')).toBe('v1');
    expect(fs.readFileSync(path.join(second.snapshotDir, 'index.html'), 'utf8')).toBe('v2');
    expect(readHtmlManifest(root, first.publishId)).toMatchObject({
      publishId: first.publishId,
      projectId: 'demo',
      resourcePath: 'src/prototypes/home',
      files: ['index.html'],
    });
  });

  it('rejects published file traversal outside a snapshot', async () => {
    const root = createRoot();
    const published = await writeHtmlSnapshot(root, [
      { path: 'index.html', contentType: 'text/html', body: Buffer.from('ok') },
    ], { projectId: 'demo', resourcePath: 'src/prototypes/home' });

    expect(() => resolvePublishedFilePath(root, published.publishId, '../manifest.json')).toThrow(/Invalid published file path/u);
    expect(() => resolvePublishedFilePath(root, published.publishId, '/etc/passwd')).toThrow(/Invalid published file path/u);
  });

  it('atomically replaces a realtime manifest while preserving its stable id', () => {
    const root = createRoot();
    writeRealtimeManifest(root, {
      schemaVersion: 1,
      shareId: 'share-demo',
      projectId: 'demo',
      resourcePath: 'src/prototypes/home',
      previewPath: '/prototypes/home?agentToolbar=host#page=overview',
      commentable: true,
      updatedAt: '2026-08-23T00:00:00.000Z',
    });
    writeRealtimeManifest(root, {
      schemaVersion: 1,
      shareId: 'share-demo',
      projectId: 'demo',
      resourcePath: 'src/prototypes/next',
      previewPath: '/prototypes/next#page=details',
      commentable: false,
      updatedAt: '2026-08-23T00:01:00.000Z',
    });

    expect(readRealtimeManifest(root, 'share-demo')).toMatchObject({
      shareId: 'share-demo',
      resourcePath: 'src/prototypes/next',
      previewPath: '/prototypes/next#page=details',
      commentable: false,
    });
    expect(JSON.parse(fs.readFileSync(
      path.join(getProjectPublishedRealtimeDir(root), 'share-demo.json'),
      'utf8',
    ))).not.toHaveProperty('commenterName');
    expect(fs.readdirSync(getProjectPublishedRealtimeDir(root))).toEqual(['share-demo.json']);
  });
});
