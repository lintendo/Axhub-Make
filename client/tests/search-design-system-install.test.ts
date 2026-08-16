import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { installTheme as installThemeRuntime } from '../.agents/skills/search-design-system/scripts/lib/install-theme.mjs';

const skillRoot = path.resolve(__dirname, '../.agents/skills/search-design-system');
type InstallThemeOptions = {
  themeId: string;
  platform: 'desktop' | 'mobile';
  projectRoot: string;
  snapshotRoot: string;
  fetch?: (url: URL, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
  timeoutMs?: number;
  runMetadataSync?: (projectRoot: string) => Promise<void>;
};
const installTheme = installThemeRuntime as (options: InstallThemeOptions) => ReturnType<typeof installThemeRuntime>;

function tarHeader(name: string, size: number, type = '0'): Buffer {
  const header = Buffer.alloc(512);
  const write = (offset: number, length: number, value: string) => Buffer.from(value).copy(header, offset, 0, length);
  const octal = (offset: number, length: number, value: number) => write(offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`);
  write(0, 100, name);
  octal(100, 8, 0o644);
  octal(108, 8, 0);
  octal(116, 8, 0);
  octal(124, 12, size);
  octal(136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  write(257, 6, 'ustar\0');
  write(263, 2, '00');
  write(148, 8, `${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `);
  return header;
}

function packageBytes(entries?: Array<{ name: string; body: string; type?: string }>): Buffer {
  const files = entries ?? [
    { name: 'DESIGN.md', body: '# Theme\n' },
    { name: 'SOURCE.md', body: '# Source\n' },
    { name: 'assets/tokens.json', body: '{}\n' },
    { name: 'index.tsx', body: 'export default function Theme() { return null; }\n' },
    { name: 'style.css', body: ':root {}\n' },
    { name: 'theme.json', body: '{}\n' },
  ];
  const chunks: Buffer[] = [];
  for (const entry of files) {
    const body = Buffer.from(entry.body);
    chunks.push(tarHeader(entry.name, body.length, entry.type), body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  const options: zlib.ZlibOptions & { mtime: number } = { level: 9, mtime: 0 };
  return zlib.gzipSync(Buffer.concat(chunks), options);
}

const hash = (bytes: Buffer) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

async function fixture(archive = packageBytes()) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'axhub-install-'));
  const projectRoot = path.join(root, 'project');
  const snapshotRoot = path.join(root, 'snapshot');
  await fs.mkdir(path.join(projectRoot, '.axhub/make'), { recursive: true });
  await fs.mkdir(path.join(snapshotRoot, 'indexes'), { recursive: true });
  await fs.mkdir(path.join(snapshotRoot, 'design-md'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, '.axhub/make/client.json'), '{}\n');
  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: { 'metadata:sync': 'node -e ""' } }));
  const design = Buffer.from('# Theme\n');
  await fs.writeFile(path.join(snapshotRoot, 'design-md/alpha.md'), design);
  const record = {
    schemaVersion: 1,
    id: 'alpha',
    slug: 'alpha',
    platforms: ['desktop'],
    searchable: true,
    reviewStatus: 'approved',
    publishable: true,
    reasons: [],
    artifacts: { designMdPath: 'design-md/alpha.md', designMdHash: hash(design), packagePath: 'packages/alpha.tgz', packageHash: hash(archive) },
    remoteArtifacts: { packagePath: 'packages/alpha.tgz', packageHash: hash(archive) },
  };
  const index = { schemaVersion: 1, taxonomyVersion: '1.0.0', searchContractVersion: '1.0.0', tokenizationVersion: 'nfkc-intl-segmenter-v1', platform: 'desktop', records: [record], postings: {} };
  const indexBytes = Buffer.from(`${JSON.stringify(index)}\n`);
  await fs.writeFile(path.join(snapshotRoot, 'indexes/desktop.json'), indexBytes);
  await fs.writeFile(path.join(snapshotRoot, 'indexes/mobile.json'), Buffer.from(`${JSON.stringify({ ...index, platform: 'mobile', records: [] })}\n`));
  await fs.writeFile(path.join(snapshotRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    snapshotVersion: '2026-08-13.3',
    readerVersion: { min: '1.0.0', maxExclusive: '2.0.0' },
    indexes: { desktop: { path: 'indexes/desktop.json', hash: hash(indexBytes), count: 1 }, mobile: { path: 'indexes/mobile.json', hash: hash(Buffer.from(`${JSON.stringify({ ...index, platform: 'mobile', records: [] })}\n`)), count: 0 } },
    designMd: { root: 'design-md', count: 1 },
    packageSources: { primary: 'https://lintendo.github.io/Make-Template/knowledge/versions/2026-08-13.3/', fallback: { repository: 'axhub/Make-Template', commit: 'a'.repeat(40), base: `https://gitee.com/axhub/Make-Template/raw/${'a'.repeat(40)}/knowledge/versions/2026-08-13.3/` } },
  })}\n`);
  return { archive, projectRoot, snapshotRoot };
}

function response(body: Buffer, status = 200): Response {
  return new Response(Uint8Array.from(body), { status, headers: { 'content-length': String(body.length) } });
}

describe('theme installer', () => {
  it('uses the primary package without requesting fallback', async () => {
    const base = await fixture();
    const urls: string[] = [];
    const result = await installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async (url: URL) => { urls.push(String(url)); return response(base.archive); }, runMetadataSync: async () => {} });
    expect(result.status).toBe('installed');
    expect(result.source).toBe('primary');
    expect(urls).toHaveLength(1);
    await expect(fs.readFile(path.join(base.projectRoot, 'src/themes/alpha/index.tsx'), 'utf8')).resolves.toContain('Theme');
  });

  it('falls back after a primary HTTP failure', async () => {
    const base = await fixture();
    const urls: string[] = [];
    const result = await installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async (url: URL) => { urls.push(String(url)); return urls.length === 1 ? response(Buffer.alloc(0), 404) : response(base.archive); }, runMetadataSync: async () => {} });
    expect(result.status).toBe('installed');
    expect(result.source).toBe('fallback');
    expect(urls).toHaveLength(2);
  });

  it('writes only DESIGN.md and SOURCE.md when both sources fail', async () => {
    const base = await fixture();
    const result = await installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async () => response(Buffer.alloc(0), 503), runMetadataSync: async () => { throw new Error('must not run'); } });
    expect(result.status).toBe('spec-only');
    const names = await fs.readdir(path.join(base.projectRoot, 'src/themes/alpha'));
    expect(names.sort()).toEqual(['DESIGN.md', 'SOURCE.md']);
    await expect(fs.readFile(path.join(base.projectRoot, 'src/themes/alpha/SOURCE.md'), 'utf8')).resolves.toContain('spec-only');
  });

  it('upgrades a spec-only directory atomically on a later success', async () => {
    const base = await fixture();
    await installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async () => response(Buffer.alloc(0), 503), runMetadataSync: async () => {} });
    const result = await installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async () => response(base.archive), runMetadataSync: async () => {} });
    expect(result.status).toBe('installed');
    await expect(fs.readFile(path.join(base.projectRoot, 'src/themes/alpha/index.tsx'), 'utf8')).resolves.toContain('Theme');
    await expect(fs.readFile(path.join(base.projectRoot, 'src/themes/alpha/SOURCE.md'), 'utf8')).resolves.toBe('# Source\n');
  });

  it('rejects unsafe archive paths and falls back to the local spec', async () => {
    const archive = packageBytes([{ name: '../escape', body: 'bad' }]);
    const base = await fixture(archive);
    const result = await installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async () => response(archive), runMetadataSync: async () => {} });
    expect(result.status).toBe('spec-only');
    await expect(fs.access(path.join(base.projectRoot, 'escape'))).rejects.toThrow();
  });

  it('rolls back a successful extraction when metadata sync fails', async () => {
    const base = await fixture();
    await expect(installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async () => response(base.archive), runMetadataSync: async () => { throw new Error('sync failed'); } })).rejects.toMatchObject({ code: 'METADATA_SYNC_FAILED' });
    await expect(fs.access(path.join(base.projectRoot, 'src/themes/alpha'))).rejects.toThrow();
  });

  it('aborts one source at the configured timeout before trying fallback', async () => {
    const base = await fixture();
    let calls = 0;
    const result = await installTheme({
      ...base,
      themeId: 'alpha',
      platform: 'desktop',
      timeoutMs: 5,
      fetch: async (_url: URL, init?: RequestInit) => {
        calls += 1;
        if (calls === 2) return response(base.archive);
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        });
      },
      runMetadataSync: async () => {},
    });
    expect(result.status).toBe('installed');
    expect(result.source).toBe('fallback');
    expect(calls).toBe(2);
  });

  it('rejects a user-controlled package path before any request', async () => {
    const base = await fixture();
    const indexPath = path.join(base.snapshotRoot, 'indexes/desktop.json');
    const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    index.records[0].artifacts.packagePath = '../escape.tgz';
    index.records[0].remoteArtifacts.packagePath = '../escape.tgz';
    const indexBytes = Buffer.from(`${JSON.stringify(index)}\n`);
    await fs.writeFile(indexPath, indexBytes);
    const manifestPath = path.join(base.snapshotRoot, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.indexes.desktop.hash = hash(indexBytes);
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    await expect(installTheme({ ...base, themeId: 'alpha', platform: 'desktop', fetch: async () => { throw new Error('must not request'); } })).rejects.toMatchObject({ code: 'PACKAGE_SOURCE_INVALID' });
  });

  it('keeps the runtime installer inside the mirrored skill tree', async () => {
    const source = await fs.readFile(path.join(skillRoot, 'scripts/lib/install-theme.mjs'), 'utf8');
    expect(source).toContain('DOWNLOAD_TIMEOUT');
    expect(source).toContain('PACKAGE_BOTH_SOURCES_FAILED');
  });
});
