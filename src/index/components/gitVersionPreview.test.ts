import { describe, expect, it, vi } from 'vitest';

import { buildGitVersionEntryProbeUrl, probeGitVersionEntry } from './gitVersionPreview';

describe('git version preview probes', () => {
  it('builds an encoded version entry URL for the selected project', () => {
    expect(buildGitVersionEntryProbeUrl({
      commitHash: '8b8f52da12345678',
      targetPath: 'prototypes/未命名',
      projectId: 'make-project',
    })).toBe('/api/git/version-file/8b8f52da/prototypes/%E6%9C%AA%E5%91%BD%E5%90%8D/index.tsx?projectId=make-project');
  });

  it('treats only a successful version entry request as ready', async () => {
    const readyFetch = vi.fn(async () => new Response('export default null', { status: 200 }));
    const missingFetch = vi.fn(async () => new Response('missing', { status: 404 }));
    const options = {
      commitHash: '8b8f52da12345678',
      targetPath: 'prototypes/home',
      projectId: 'make-project',
    };

    await expect(probeGitVersionEntry(options, readyFetch)).resolves.toBe(true);
    await expect(probeGitVersionEntry(options, missingFetch)).resolves.toBe(false);
    expect(readyFetch).toHaveBeenCalledWith(
      '/api/git/version-file/8b8f52da/prototypes/home/index.tsx?projectId=make-project',
      { cache: 'no-store' },
    );
  });

  it('treats probe request failures as not ready', async () => {
    const failedFetch = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(probeGitVersionEntry({
      commitHash: '8b8f52da12345678',
      targetPath: 'prototypes/home',
      projectId: 'make-project',
    }, failedFetch)).resolves.toBe(false);
  });
});
