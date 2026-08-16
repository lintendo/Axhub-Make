import crypto from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { main, resolveSearchSource } from '../.agents/skills/search-design-system/scripts/cli.mjs';
import { resolveBundledSnapshot } from '../.agents/skills/search-design-system/scripts/lib/bundled-snapshot.mjs';
import { search } from '../.agents/skills/search-design-system/scripts/lib/index.mjs';

const HASH_RE = /^sha256:[a-f0-9]{64}$/u;

function sha256(bytes: Buffer | string) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function request(platform: 'desktop' | 'mobile' = 'desktop') {
  return {
    schemaVersion: 1,
    readerVersion: '1.0.0',
    platform,
    terms: ['alpha'],
    limit: 3,
  };
}

function record(id: string, platform: 'desktop' | 'mobile') {
  return {
    schemaVersion: 1,
    id,
    slug: id,
    title: id,
    platforms: [platform],
    searchable: true,
    reviewStatus: 'approved',
    publishable: true,
    reasons: [],
    terms: ['alpha'],
    artifacts: {
      designMdPath: `design-md/${id}.md`,
      packagePath: `packages/${id}.tgz`,
      packageHash: `sha256:${'b'.repeat(64)}`,
    },
  };
}

async function makeSnapshot() {
  const clientRoot = await mkdtemp(path.join(os.tmpdir(), 'design-knowledge-client-'));
  const snapshotRoot = path.join(clientRoot, 'design-knowledge');
  await mkdir(path.join(snapshotRoot, 'indexes'), { recursive: true });
  await mkdir(path.join(snapshotRoot, 'design-md'), { recursive: true });
  await writeFile(path.join(clientRoot, 'template-manifest.json'), '{}\n');

  const descriptors: Record<string, { path: string; hash: string; count: number }> = {};
  for (const platform of ['desktop', 'mobile'] as const) {
    const item = record(`${platform}-alpha`, platform);
    const designBytes = `# ${item.id}\n`;
    item.artifacts.designMdHash = sha256(designBytes);
    await writeFile(path.join(snapshotRoot, item.artifacts.designMdPath), designBytes);
    const index = {
      schemaVersion: 1,
      taxonomyVersion: '1.0.0',
      searchContractVersion: '1.0.0',
      tokenizationVersion: 'nfkc-intl-segmenter-v1',
      platform,
      records: [item],
      postings: { alpha: [item.id] },
    };
    const indexBytes = `${JSON.stringify(index, null, 2)}\n`;
    const indexPath = `indexes/${platform}.json`;
    await writeFile(path.join(snapshotRoot, indexPath), indexBytes);
    descriptors[platform] = { path: indexPath, hash: sha256(indexBytes), count: 1 };
  }

  await writeFile(path.join(snapshotRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    snapshotVersion: '2026-08-13.3',
    readerVersion: { min: '1.0.0', maxExclusive: '2.0.0' },
    indexes: descriptors,
    designMd: { root: 'design-md', count: 2 },
    packageSources: {
      primary: 'https://lintendo.github.io/Make-Template/knowledge/versions/2026-08-13.3/',
      fallback: {
        repository: 'axhub/Make-Template',
        commit: 'a'.repeat(40),
        base: `https://gitee.com/axhub/Make-Template/raw/${'a'.repeat(40)}/knowledge/versions/2026-08-13.3/`,
      },
    },
  }, null, 2)}\n`);

  return { clientRoot, snapshotRoot };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bundled design knowledge search', () => {
  it('searches the bundled snapshot by default without fetching', async () => {
    const { snapshotRoot } = await makeSnapshot();
    const requestPath = path.join(snapshotRoot, 'request.json');
    await writeFile(requestPath, JSON.stringify(request()));
    const fetch = vi.fn(() => { throw new Error('network access is forbidden'); });
    vi.stubGlobal('fetch', fetch);

    const result = await main(['search', '--request', requestPath, '--snapshot-root', snapshotRoot]);

    expect(fetch).not.toHaveBeenCalled();
    expect(result.cacheStatus).toBe('bundled');
    expect(result.cacheVersion).toBe('2026-08-13.3');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].artifacts.designMd).toMatchObject({ available: true, source: 'local' });
    expect(result.results[0].artifacts.designMd.path).toBe(path.join(snapshotRoot, 'design-md/desktop-alpha.md'));
    expect(result.results[0].artifacts.package).toMatchObject({ available: true, source: 'remote', hash: `sha256:${'b'.repeat(64)}` });
    expect(result.results[0].artifacts.package.sources).toHaveLength(2);
    expect(result.results[0].artifacts.package.sources[0].url).toContain('/knowledge/versions/2026-08-13.3/packages/desktop-alpha.tgz');
  });

  it('caches a validated platform index across strict and relaxed local searches', async () => {
    const { snapshotRoot } = await makeSnapshot();
    const reads: string[] = [];
    const injectedReadFile = async (filePath: string | Buffer | URL) => {
      const resolved = String(filePath);
      reads.push(resolved);
      return readFile(filePath);
    };
    const snapshot = await resolveBundledSnapshot({ snapshotRoot, readFile: injectedReadFile });

    const first = await search({ ...request(), hardFilters: { styles: ['missing'] } }, { source: 'bundled', snapshot, readFile: injectedReadFile });
    const second = await search(request(), { source: 'bundled', snapshot, readFile: injectedReadFile });

    expect(first.results).toHaveLength(0);
    expect(second.results).toHaveLength(1);
    expect(reads.filter((filePath) => filePath.endsWith('/indexes/desktop.json'))).toHaveLength(1);
  });

  it('keeps an explicit manifest in online mode', () => {
    expect(resolveSearchSource({ manifestUrl: 'https://example.com/manifest.json' })).toEqual({
      manifestUrl: 'https://example.com/manifest.json',
    });
  });

  it.each([
    ['unknown flags', ['search', '--wat', 'value']],
    ['online without an explicit manifest', ['search', '--online']],
    ['malformed request input', ['search', '--request', path.join(os.tmpdir(), 'missing-design-request.json')]],
  ])('rejects %s as INVALID_REQUEST', async (_label, argv) => {
    await expect(main(argv)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('exposes valid hashes in the fixture snapshot', async () => {
    const { snapshotRoot } = await makeSnapshot();
    const snapshot = await resolveBundledSnapshot({ snapshotRoot });
    expect(snapshot.manifest.indexes.desktop.hash).toMatch(HASH_RE);
  });

  it('rejects tampered indexes, DESIGN.md files, and unsafe paths', async () => {
    const { snapshotRoot } = await makeSnapshot();
    await writeFile(path.join(snapshotRoot, 'design-md/desktop-alpha.md'), '# tampered\n');
    const tampered = await resolveBundledSnapshot({ snapshotRoot });
    await expect(search(request(), { source: 'bundled', snapshot: tampered })).rejects.toMatchObject({ code: 'BUNDLED_SNAPSHOT_INVALID' });

    const { snapshotRoot: unsafeRoot } = await makeSnapshot();
    const manifestPath = path.join(unsafeRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.indexes.desktop.path = '../desktop.json';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(resolveBundledSnapshot({ snapshotRoot: unsafeRoot })).rejects.toMatchObject({ code: 'BUNDLED_SNAPSHOT_INVALID' });
  });
});
