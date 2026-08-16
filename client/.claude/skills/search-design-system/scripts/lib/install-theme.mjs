import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import tarStream from 'tar-stream';

import { resolveBundledSnapshot, loadBundledIndex, readBundledDesignMd } from './bundled-snapshot.mjs';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const REQUIRED_FILES = ['DESIGN.md', 'SOURCE.md', 'assets/tokens.json', 'index.tsx', 'style.css', 'theme.json'];
const BOTH_SOURCES_FAILED = 'PACKAGE_BOTH_SOURCES_FAILED';
const DEFAULT_LIMITS = Object.freeze({ compressed: 100 * 1024 * 1024, unpacked: 250 * 1024 * 1024, files: 2_000 });

function failure(code, details = {}, cause) {
  const error = new Error(code, cause ? { cause } : undefined);
  error.code = code;
  error.details = details;
  return error;
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw failure('PACKAGE_SOURCE_INVALID', { field: label });
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw failure('PACKAGE_SOURCE_INVALID', { field: label });
  return value;
}

function packageUrl(base, relative) {
  let baseUrl;
  let url;
  try {
    baseUrl = new URL(base);
    url = new URL(relative, baseUrl);
  } catch {
    throw failure('PACKAGE_SOURCE_INVALID');
  }
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
    throw failure('PACKAGE_SOURCE_INVALID');
  }
  return url.href;
}

async function responseBytes(response, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw failure('FETCH_FAILED', { reason: 'size-limit' });
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw failure('FETCH_FAILED', { reason: 'size-limit' });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export async function fetchPackageBytes(url, { fetch: fetcher = globalThis.fetch, timeoutMs = 10_000, maxBytes = DEFAULT_LIMITS.compressed } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(new URL(url), { method: 'GET', redirect: 'error', signal: controller.signal });
    if (!response?.ok) throw failure('FETCH_FAILED', { status: response?.status });
    return await responseBytes(response, maxBytes);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw failure('DOWNLOAD_TIMEOUT', {}, error);
    if (error?.code) throw error;
    throw failure('FETCH_FAILED', { reason: 'network' }, error);
  } finally {
    clearTimeout(timer);
  }
}

async function archiveEntries(bytes, limits = DEFAULT_LIMITS) {
  const entries = [];
  const names = new Set();
  const fileNames = new Set();
  let entryCount = 0;
  let unpacked = 0;
  let rejected;
  const extract = tarStream.extract();
  extract.on('entry', (header, stream, next) => {
    const relative = header.type === 'directory' ? header.name.replace(/\/$/u, '') : header.name;
    const rejectEntry = (error) => {
      rejected ??= error;
      stream.resume();
      stream.once('end', next);
    };
    try {
      try {
        safeRelative(relative, 'archivePath');
      } catch {
        throw failure('FETCH_FAILED', { reason: 'unsafe-archive-path', path: relative });
      }
      if (!['file', 'directory'].includes(header.type)) throw failure('FETCH_FAILED', { reason: 'unsupported-archive-entry', path: relative });
      if (names.has(relative)) throw failure('FETCH_FAILED', { reason: 'duplicate-archive-path', path: relative });
      names.add(relative);
      entryCount += 1;
      unpacked += header.size ?? 0;
      if (entryCount > limits.files) throw failure('FETCH_FAILED', { reason: 'file-count-limit' });
      if (unpacked > limits.unpacked) throw failure('FETCH_FAILED', { reason: 'unpacked-size-limit' });
      if (header.type === 'directory') {
        stream.resume();
        stream.once('end', next);
        return;
      }
      const chunks = [];
      let size = 0;
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > header.size) rejected ??= failure('FETCH_FAILED', { reason: 'invalid-archive' });
        chunks.push(Buffer.from(chunk));
      });
      stream.once('end', () => {
        if (size !== header.size) {
          rejected ??= failure('FETCH_FAILED', { reason: 'invalid-archive' });
          next();
          return;
        }
        if (!rejected) {
          entries.push({ relative, bytes: Buffer.concat(chunks, size) });
          fileNames.add(relative);
        }
        next();
      });
      stream.once('error', (error) => {
        rejected ??= error;
        next();
      });
    } catch (error) {
      rejectEntry(error);
    }
  });
  try {
    await pipeline(Readable.from(bytes), zlib.createGunzip(), extract);
  } catch (error) {
    if (rejected?.code) throw rejected;
    if (error?.code === 'FETCH_FAILED') throw error;
    throw failure('FETCH_FAILED', { reason: 'invalid-archive' }, error);
  }
  if (rejected) {
    if (rejected.code) throw rejected;
    throw failure('FETCH_FAILED', { reason: 'invalid-archive' }, rejected);
  }
  if (REQUIRED_FILES.some((name) => !fileNames.has(name))) throw failure('FETCH_FAILED', { reason: 'package-file-contract' });
  return entries;
}

async function writeEntries(entries, root) {
  await fs.mkdir(root, { recursive: true });
  for (const entry of entries) {
    const target = path.resolve(root, entry.relative);
    if (!isInside(root, target)) throw failure('FETCH_FAILED', { reason: 'unsafe-archive-path' });
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await fs.writeFile(target, entry.bytes, { mode: 0o644 });
  }
}

async function assertSafeExistingComponents(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (!isInside(resolvedRoot, resolved)) throw failure('INSTALL_DESTINATION_INVALID', { reason: 'themes-root' });
  let current = resolvedRoot;
  for (const part of path.relative(resolvedRoot, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) {
        throw failure('INSTALL_DESTINATION_INVALID', { reason: 'symlink', path: path.relative(resolvedRoot, current) });
      }
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      if (error?.code === 'INSTALL_DESTINATION_INVALID') throw error;
      throw failure('INSTALL_DESTINATION_INVALID', { reason: 'destination-component' }, error);
    }
  }
}

async function readProjectThemesRoot(projectRoot) {
  let root;
  try {
    root = await fs.realpath(path.resolve(projectRoot ?? ''));
  } catch (error) {
    throw failure('INSTALL_DESTINATION_INVALID', { reason: 'project-root' }, error);
  }
  await fs.realpath(path.join(root, '.axhub/make/client.json')).catch(() => { throw failure('INSTALL_DESTINATION_INVALID', { reason: 'client-marker' }); });
  let relative = 'src/themes';
  try {
    const project = JSON.parse(await fs.readFile(path.join(root, '.axhub/make/project.json'), 'utf8'));
    const target = project.resourceWriteTargets?.themes;
    if (target?.path) relative = target.path;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      if (error instanceof SyntaxError) throw failure('INSTALL_DESTINATION_INVALID', { reason: 'project-metadata' }, error);
      throw error;
    }
  }
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some((part) => part === '..')) {
    throw failure('INSTALL_DESTINATION_INVALID', { reason: 'themes-root' });
  }
  const themesRoot = path.resolve(root, relative);
  if (!isInside(root, themesRoot)) throw failure('INSTALL_DESTINATION_INVALID', { reason: 'themes-root' });
  await assertSafeExistingComponents(root, themesRoot);
  return { root, themesRoot };
}

async function isSpecOnly(target) {
  try {
    const entries = (await fs.readdir(target)).sort();
    if (JSON.stringify(entries) !== JSON.stringify(['DESIGN.md', 'SOURCE.md'])) return false;
    return (await fs.readFile(path.join(target, 'SOURCE.md'), 'utf8')).includes('mode: spec-only');
  } catch { return false; }
}

function defaultMetadataSync(projectRoot) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(command, ['run', 'metadata:sync'], { cwd: projectRoot, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`metadata:sync exited ${code}`)));
  });
}

async function installEntries({ entries, projectRoot, themesRoot, themeId, runMetadataSync }) {
  const target = path.join(themesRoot, themeId);
  await assertSafeExistingComponents(projectRoot, target);
  await fs.mkdir(themesRoot, { recursive: true });
  const targetExists = await fs.lstat(target).then(() => true).catch((error) => error?.code === 'ENOENT' ? false : Promise.reject(error));
  const replacingSpec = targetExists && await isSpecOnly(target);
  if (targetExists && !replacingSpec) throw failure('INSTALL_DESTINATION_INVALID', { reason: 'exists', themeId });
  const candidate = path.join(themesRoot, `.axhub-theme-import-${themeId}-${crypto.randomUUID()}`);
  const backup = path.join(themesRoot, `.axhub-theme-backup-${themeId}-${crypto.randomUUID()}`);
  try {
    await writeEntries(entries, candidate);
    if (replacingSpec) await fs.rename(target, backup);
    await fs.rename(candidate, target);
    try {
      await (runMetadataSync ?? defaultMetadataSync)(projectRoot);
    } catch (error) {
      await fs.rm(target, { recursive: true, force: true });
      if (replacingSpec) await fs.rename(backup, target);
      throw failure('METADATA_SYNC_FAILED', {}, error);
    }
    if (replacingSpec) await fs.rm(backup, { recursive: true, force: true });
    return target;
  } finally {
    await fs.rm(candidate, { recursive: true, force: true });
    if (!await fs.lstat(target).then(() => true).catch(() => false) && replacingSpec) {
      await fs.rename(backup, target).catch(() => {});
    }
  }
}

async function writeSpecOnly({ snapshot, themeId, platform, projectRoot, themesRoot, failures, now }) {
  const target = path.join(themesRoot, themeId);
  await assertSafeExistingComponents(projectRoot, target);
  if (await fs.lstat(target).then(() => true).catch(() => false)) throw failure('INSTALL_DESTINATION_INVALID', { reason: 'exists', themeId });
  const candidate = path.join(themesRoot, `.axhub-theme-spec-${themeId}-${crypto.randomUUID()}`);
  const design = await readBundledDesignMd({ snapshot, slug: themeId });
  const source = [
    '---',
    'mode: spec-only',
    `snapshotVersion: ${snapshot.manifest.snapshotVersion}`,
    `themeId: ${themeId}`,
    `platform: ${platform}`,
    `createdAt: ${(now ?? (() => new Date()))().toISOString()}`,
    `primary: ${JSON.stringify(failures.primary)}`,
    `fallback: ${JSON.stringify(failures.fallback)}`,
    '---',
    '',
    '# Theme source state',
    '',
  ].join('\n');
  await fs.mkdir(candidate, { recursive: true });
  try {
    await fs.writeFile(path.join(candidate, 'DESIGN.md'), design.content, { mode: 0o644 });
    await fs.writeFile(path.join(candidate, 'SOURCE.md'), source, { mode: 0o644 });
    await fs.rename(candidate, target);
  } finally {
    await fs.rm(candidate, { recursive: true, force: true });
  }
  return target;
}

function stableFailure(error) {
  return { code: error?.code ?? 'FETCH_FAILED', ...(Number.isInteger(error?.details?.status) ? { status: error.details.status } : {}) };
}

export async function installTheme({ themeId, platform, projectRoot, snapshotRoot, fetch, now, timeoutMs = 10_000, runMetadataSync } = {}) {
  if (!SLUG_PATTERN.test(themeId ?? '') || !['desktop', 'mobile'].includes(platform)) throw failure('INSTALL_DESTINATION_INVALID');
  const snapshot = await resolveBundledSnapshot({ startDir: process.cwd(), snapshotRoot });
  const loaded = await loadBundledIndex({ snapshot, platform });
  const record = loaded.index.records.find((item) => item.id === themeId);
  if (!record?.publishable) throw failure('PACKAGE_SOURCE_INVALID', { themeId, platform });
  const packagePath = safeRelative(record.remoteArtifacts?.packagePath ?? record.artifacts?.packagePath, 'packagePath');
  const packageHash = record.remoteArtifacts?.packageHash ?? record.artifacts?.packageHash;
  if (!HASH_PATTERN.test(packageHash ?? '')) throw failure('PACKAGE_SOURCE_INVALID', { field: 'packageHash' });
  const { root, themesRoot } = await readProjectThemesRoot(projectRoot);
  await assertSafeExistingComponents(root, path.join(themesRoot, themeId));
  const sources = [
    ['primary', packageUrl(snapshot.manifest.packageSources?.primary, packagePath)],
    ['fallback', packageUrl(snapshot.manifest.packageSources?.fallback?.base, packagePath)],
  ];
  const failures = {};
  for (const [name, url] of sources) {
    try {
      const bytes = await fetchPackageBytes(url, { fetch, timeoutMs });
      if (sha256(bytes) !== packageHash) throw failure('ARTIFACT_HASH_MISMATCH');
      const entries = await archiveEntries(bytes);
      const themeDir = await installEntries({ entries, projectRoot: root, themesRoot, themeId, runMetadataSync });
      return { status: 'installed', themeId, platform, source: name, themeDir, entryPath: path.join(themeDir, 'index.tsx'), metadataSync: 'completed' };
    } catch (error) {
      if (['INSTALL_DESTINATION_INVALID', 'METADATA_SYNC_FAILED'].includes(error?.code)) throw error;
      failures[name] = stableFailure(error);
    }
  }
  const themeDir = await writeSpecOnly({ snapshot, themeId, platform, projectRoot: root, themesRoot, failures, now });
  return { status: 'spec-only', themeId, platform, source: 'bundled-design-md', reason: BOTH_SOURCES_FAILED, designMdPath: path.join(themeDir, 'DESIGN.md'), sourceStatePath: path.join(themeDir, 'SOURCE.md'), retryable: true, failures };
}

export { DEFAULT_LIMITS };
