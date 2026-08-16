import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as cache from '../.agents/skills/search-design-system/scripts/lib/cache.mjs';

type FileSystem = Pick<typeof fs, 'mkdir' | 'open' | 'rename' | 'rm'>;
type AtomicWrite = (file: string, bytes: Buffer | string, options?: { fileSystem?: FileSystem }) => Promise<void>;
const atomicWrite = (cache as unknown as { atomicWrite?: AtomicWrite }).atomicWrite;

describe('design knowledge cache', () => {
  it.each(['EPERM', 'EEXIST'])('replaces an existing mutable ref when Windows-style %s prevents an in-place rename', async (code) => {
    expect(atomicWrite).toBeTypeOf('function');
    if (!atomicWrite) return;

    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-knowledge-cache-ref-'));
    const refPath = path.join(cacheDir, 'refs', 'current.json');
    const replacement = `{"url":"https://example.test/manifest.json","hash":"sha256:${'b'.repeat(64)}"}\n`;
    await fs.mkdir(path.dirname(refPath), { recursive: true });
    await fs.writeFile(refPath, `{"url":"https://example.test/manifest.json","hash":"sha256:${'a'.repeat(64)}"}\n`);

    let renameCalls = 0;
    const fileSystem: FileSystem = {
      mkdir: fs.mkdir,
      open: fs.open,
      rename: async (source, destination) => {
        renameCalls += 1;
        const destinationExists = await fs.access(destination).then(() => true).catch(() => false);
        if (destination === refPath && destinationExists) {
          const error = Object.assign(new Error('destination is temporarily locked'), { code });
          throw error;
        }
        return fs.rename(source, destination);
      },
      rm: fs.rm,
    };

    await atomicWrite(refPath, replacement, { fileSystem });

    await expect(fs.readFile(refPath, 'utf8')).resolves.toBe(replacement);
    expect(renameCalls).toBe(3);
  });

  it('restores the existing mutable ref when promoting its replacement fails', async () => {
    expect(atomicWrite).toBeTypeOf('function');
    if (!atomicWrite) return;

    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-knowledge-cache-restore-'));
    const refPath = path.join(cacheDir, 'refs', 'current.json');
    const original = `{"url":"https://example.test/manifest.json","hash":"sha256:${'a'.repeat(64)}"}\n`;
    await fs.mkdir(path.dirname(refPath), { recursive: true });
    await fs.writeFile(refPath, original);

    const fileSystem: FileSystem = {
      mkdir: fs.mkdir,
      open: fs.open,
      rename: async (source, destination) => {
        const destinationExists = await fs.access(destination).then(() => true).catch(() => false);
        if (destination === refPath && String(source).includes('.tmp')) {
          const error = Object.assign(new Error(destinationExists ? 'destination is locked' : 'promotion failed'), { code: 'EPERM' });
          throw error;
        }
        return fs.rename(source, destination);
      },
      rm: fs.rm,
    };

    await expect(atomicWrite(refPath, `{"url":"https://example.test/manifest.json","hash":"sha256:${'b'.repeat(64)}"}\n`, { fileSystem })).rejects.toMatchObject({ code: 'EPERM' });

    await expect(fs.readFile(refPath, 'utf8')).resolves.toBe(original);
    await expect(fs.readdir(path.dirname(refPath))).resolves.toEqual(['current.json']);
  });
});
