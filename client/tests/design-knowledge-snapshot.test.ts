import crypto from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { main, resolveSearchSource } from '../.agents/skills/search-design-system/scripts/cli.mjs';
import { loadBundledIndex, resolveBundledSnapshot } from '../.agents/skills/search-design-system/scripts/lib/bundled-snapshot.mjs';
import { readCachedRef } from '../.agents/skills/search-design-system/scripts/lib/cache.mjs';
import { search } from '../.agents/skills/search-design-system/scripts/lib/index.mjs';

const HASH_RE = /^sha256:[a-f0-9]{64}$/u;
const BUNDLED_SNAPSHOT_ROOT = path.resolve(__dirname, '../design-knowledge');
type BundledSnapshot = Awaited<ReturnType<typeof resolveBundledSnapshot>>;
type BundledIndex = Awaited<ReturnType<typeof loadBundledIndex>>;
type BinaryReadFile = (filePath: string | Buffer | URL) => Promise<Buffer>;
const resolveSnapshot = resolveBundledSnapshot as (options?: {
  startDir?: string;
  snapshotRoot?: string;
  projectRoot?: string;
  readFile?: BinaryReadFile;
}) => Promise<BundledSnapshot>;
const loadIndex = loadBundledIndex as (options: {
  snapshot: BundledSnapshot;
  platform: string;
  request?: ReturnType<typeof request>;
  readFile?: BinaryReadFile;
}) => Promise<BundledIndex>;

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
      designMdHash: '',
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

function remoteManifest(record: object, indexBytes: Buffer) {
  return Buffer.from(JSON.stringify({
    schemaVersion: 1,
    taxonomyVersion: '1.0.0',
    searchContractVersion: '1.0.0',
    tokenizationVersion: 'nfkc-intl-segmenter-v1',
    minReaderVersion: '1.0.0',
    maxReaderVersionExclusive: '2.0.0',
    indexes: { desktop: { url: 'desktop.json', hash: sha256(indexBytes), count: 1 } },
    records: [record],
  }));
}

function remoteCatalog() {
  const manifestUrl = 'https://example.test/catalog/manifest.json';
  const record = {
    schemaVersion: 1,
    id: 'alpha',
    slug: 'alpha',
    title: 'Alpha',
    platforms: ['desktop'],
    searchable: true,
    reviewStatus: 'approved',
    publishable: true,
    reasons: [],
  };
  const indexBytes = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    taxonomyVersion: '1.0.0',
    searchContractVersion: '1.0.0',
    tokenizationVersion: 'nfkc-intl-segmenter-v1',
    platform: 'desktop',
    records: [record],
    postings: { alpha: ['alpha'] },
  }));
  return { manifestUrl, manifestBytes: remoteManifest(record, indexBytes), indexBytes, record };
}

function remoteResponse(bytes: Buffer, status = 200) {
  return new Response(Uint8Array.from(bytes), { status, headers: { 'content-length': String(bytes.length) } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bundled design knowledge search', () => {
  it('locks the committed immutable snapshot and artifact metadata', async () => {
    const snapshot = await resolveSnapshot({ snapshotRoot: BUNDLED_SNAPSHOT_ROOT });

    expect(snapshot.manifest.snapshotVersion).toBe('2026-08-14.2');
    expect(snapshot.manifest.indexes.desktop).toEqual({
      path: 'indexes/desktop.json',
      hash: 'sha256:fc1f387825decbc194b556cef7faf35accce582cd9967bf98b7e09be9daacce1',
      count: 123,
    });
    expect(snapshot.manifest.indexes.mobile).toEqual({
      path: 'indexes/mobile.json',
      hash: 'sha256:e7b43f02e495ae17850eb9d464d4608f497ac3e55893f9be96c00295c01a0b28',
      count: 100,
    });
    expect(snapshot.manifest.designMd).toEqual({ root: 'design-md', count: 223 });

    const indexes = await Promise.all(['desktop', 'mobile'].map((platform) => loadIndex({ snapshot, platform })));
    const records = indexes.flatMap(({ index }) => index.records);
    expect(records).toHaveLength(223);
    expect(new Set(records.map(({ id }) => id)).size).toBe(223);

    for (const record of records) {
      const { artifacts, remoteArtifacts } = record;
      expect(sha256(await readFile(path.join(BUNDLED_SNAPSHOT_ROOT, artifacts.designMdPath)))).toBe(artifacts.designMdHash);
      expect(artifacts.packagePath).toBe(`packages/${record.id}.tgz`);
      expect(artifacts.packageHash).toMatch(HASH_RE);
      expect(remoteArtifacts).toEqual({ packagePath: artifacts.packagePath, packageHash: artifacts.packageHash });
    }

    expect(records.find(({ id }) => id === '8returns')?.artifacts).toMatchObject({
      packagePath: 'packages/8returns.tgz',
      packageHash: 'sha256:97c7469d1d3011f61fe19a62300268f7ed6ef15cc41882a014f1f203e9c71663',
    });
    expect(records.find(({ id }) => id === 'airbnb-mobile')?.remoteArtifacts).toEqual({
      packagePath: 'packages/airbnb-mobile.tgz',
      packageHash: 'sha256:13e839143796d9c5a80f8f50baa68f3a3aa16b1d97cec12e1052e0b9467782d5',
    });
  });

  it('searches the bundled snapshot by default without fetching', async () => {
    const { snapshotRoot } = await makeSnapshot();
    const requestPath = path.join(snapshotRoot, 'request.json');
    await writeFile(requestPath, JSON.stringify(request()));
    const fetch = vi.fn(() => { throw new Error('network access is forbidden'); });
    vi.stubGlobal('fetch', fetch);

    const result = await main(['search', '--request', requestPath, '--snapshot-root', snapshotRoot]);

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toHaveProperty('results');
    if (!('results' in result)) throw new Error('Expected search result');
    expect(result.cacheStatus).toBe('bundled');
    expect(result.cacheVersion).toBe('2026-08-13.3');
    expect(result.results).toHaveLength(1);
    const artifacts = result.results[0].artifacts;
    expect(artifacts.designMd).toMatchObject({ available: true, source: 'local' });
    expect(artifacts.designMd).toHaveProperty('path');
    if (!('path' in artifacts.designMd)) throw new Error('Expected local DESIGN.md path');
    expect(artifacts.designMd.path).toBe(path.join(snapshotRoot, 'design-md/desktop-alpha.md'));
    expect(artifacts.package).toMatchObject({ available: true, source: 'remote', hash: `sha256:${'b'.repeat(64)}` });
    expect(artifacts.package).toHaveProperty('sources');
    if (!('sources' in artifacts.package) || !Array.isArray(artifacts.package.sources)) throw new Error('Expected remote package sources');
    expect(artifacts.package.sources).toHaveLength(2);
    expect(artifacts.package.sources[0].url).toContain('/knowledge/versions/2026-08-13.3/packages/desktop-alpha.tgz');
  });

  it('caches a validated platform index across strict and relaxed local searches', async () => {
    const { snapshotRoot } = await makeSnapshot();
    const injectedReadFile = vi.fn(async (filePath: string | Buffer | URL) => readFile(filePath));
    const snapshot = await resolveSnapshot({ snapshotRoot, readFile: injectedReadFile });

    const first = await search({ ...request(), hardFilters: { styles: ['missing'] } }, { source: 'bundled', snapshot, readFile: injectedReadFile });
    const second = await search(request(), { source: 'bundled', snapshot, readFile: injectedReadFile });

    expect(first.results).toHaveLength(0);
    expect(second.results).toHaveLength(1);
    expect(injectedReadFile.mock.calls.filter(([filePath]) => String(filePath).endsWith('/indexes/desktop.json'))).toHaveLength(1);
  });

  it('keeps an explicit manifest in online mode', () => {
    expect(resolveSearchSource({ manifestUrl: 'https://example.com/manifest.json' })).toEqual({
      manifestUrl: 'https://example.com/manifest.json',
    });
  });

  it('retains the last valid remote manifest ref for an offline retry after a bad index refresh', async () => {
    const remote = remoteCatalog();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'design-knowledge-cache-'));
    const fetchValid = async (url: URL) => url.pathname.endsWith('/manifest.json')
      ? remoteResponse(remote.manifestBytes)
      : remoteResponse(remote.indexBytes);

    await expect(search(request(), {
      manifestUrl: remote.manifestUrl,
      cacheDir,
      fetch: fetchValid,
      allowStaleCache: true,
    })).resolves.toMatchObject({ cacheStatus: 'fresh', results: [{ id: 'alpha' }] });
    const lastKnownGood = await readCachedRef(cacheDir, remote.manifestUrl);

    const malformedIndex = Buffer.from('not valid JSON');
    await expect(search(request(), {
      manifestUrl: remote.manifestUrl,
      cacheDir,
      fetch: async (url: URL) => url.pathname.endsWith('/manifest.json')
        ? remoteResponse(remoteManifest(remote.record, malformedIndex))
        : remoteResponse(malformedIndex),
      allowStaleCache: false,
    })).rejects.toBeDefined();

    await expect(readCachedRef(cacheDir, remote.manifestUrl)).resolves.toBe(lastKnownGood);
    await expect(search(request(), {
      manifestUrl: remote.manifestUrl,
      cacheDir,
      offline: true,
      allowStaleCache: true,
    })).resolves.toMatchObject({ cacheStatus: 'stale', results: [{ id: 'alpha' }] });
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
    const snapshot = await resolveSnapshot({ snapshotRoot });
    expect(snapshot.manifest.indexes.desktop.hash).toMatch(HASH_RE);
  });

  it('rejects tampered indexes, DESIGN.md files, and unsafe paths', async () => {
    const { snapshotRoot } = await makeSnapshot();
    await writeFile(path.join(snapshotRoot, 'design-md/desktop-alpha.md'), '# tampered\n');
    const tampered = await resolveSnapshot({ snapshotRoot });
    await expect(search(request(), { source: 'bundled', snapshot: tampered })).rejects.toMatchObject({ code: 'BUNDLED_SNAPSHOT_INVALID' });

    const { snapshotRoot: unsafeRoot } = await makeSnapshot();
    const manifestPath = path.join(unsafeRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.indexes.desktop.path = '../desktop.json';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(resolveSnapshot({ snapshotRoot: unsafeRoot })).rejects.toMatchObject({ code: 'BUNDLED_SNAPSHOT_INVALID' });
  });
});
