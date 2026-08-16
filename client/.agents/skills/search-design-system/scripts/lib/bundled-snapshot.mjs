import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SNAPSHOT_DIR = 'design-knowledge';
const HASH_RE = /^sha256:[a-f0-9]{64}$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const VERSION_RE = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const COMMIT_RE = /^[a-f0-9]{40}$/u;
const PLATFORM_VALUES = new Set(['desktop', 'mobile']);
const snapshotCache = new Map();
const indexCache = new WeakMap();

class BundledSnapshotError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'BundledSnapshotError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, details = {}) {
  throw new BundledSnapshotError(code, details);
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function compareVersion(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function parseJson(bytes, artifact) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    fail('BUNDLED_SNAPSHOT_INVALID', { artifact, reason: 'invalid-json' });
  }
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'unsafe-path' });
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..') || path.posix.normalize(value) !== value) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'unsafe-path' });
  }
  return value;
}

function containedPath(root, relative, label) {
  safeRelativePath(relative, label);
  const resolved = path.resolve(root, relative);
  const relation = path.relative(root, resolved);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'path-escape' });
  }
  return resolved;
}

async function assertRegularFile(root, relative, label) {
  safeRelativePath(relative, label);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    let info;
    try {
      info = await fs.lstat(current);
    } catch {
      fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'read-failed' });
    }
    if (info.isSymbolicLink()) fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'symlink' });
  }
  const info = await fs.lstat(current);
  if (!info.isFile()) fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'not-file' });
}

async function readVerifiedFile(snapshotRoot, relative, expectedHash, label, readFile) {
  if (!HASH_RE.test(expectedHash)) fail('BUNDLED_SNAPSHOT_INVALID', { field: `${label}.hash` });
  const resolved = containedPath(snapshotRoot, relative, label);
  await assertRegularFile(snapshotRoot, relative, label);
  let bytes;
  try {
    bytes = await readFile(resolved);
  } catch {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'read-failed' });
  }
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) fail('BUNDLED_SNAPSHOT_INVALID', { field: label, reason: 'hash-mismatch', expectedHash, actualHash });
  return { bytes, path: resolved };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.schemaVersion !== 1) {
    fail('BUNDLED_SNAPSHOT_INVALID', { artifact: 'manifest' });
  }
  if (typeof manifest.snapshotVersion !== 'string' || !manifest.snapshotVersion || manifest.snapshotVersion.includes('/') || manifest.snapshotVersion.includes('\\') || manifest.snapshotVersion.includes('..')) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: 'snapshotVersion' });
  }
  const reader = manifest.readerVersion;
  if (!VERSION_RE.test(reader?.min) || !VERSION_RE.test(reader?.maxExclusive) || compareVersion(reader.min, reader.maxExclusive) >= 0) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: 'readerVersion' });
  }
  for (const platform of PLATFORM_VALUES) {
    const descriptor = manifest.indexes?.[platform];
    if (!descriptor || !Number.isInteger(descriptor.count) || descriptor.count < 0 || !HASH_RE.test(descriptor.hash)) {
      fail('BUNDLED_SNAPSHOT_INVALID', { field: `indexes.${platform}` });
    }
    safeRelativePath(descriptor.path, `indexes.${platform}.path`);
  }
  if (!manifest.designMd || !Number.isInteger(manifest.designMd.count) || manifest.designMd.count < 0) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: 'designMd' });
  }
  safeRelativePath(manifest.designMd.root, 'designMd.root');
  if (manifest.designMd.count !== manifest.indexes.desktop.count + manifest.indexes.mobile.count) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: 'designMd.count' });
  }
  const fallback = manifest.packageSources?.fallback;
  if (typeof manifest.packageSources?.primary !== 'string' || !COMMIT_RE.test(fallback?.commit) || fallback?.repository !== 'axhub/Make-Template' || typeof fallback?.base !== 'string') {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: 'packageSources' });
  }
  const sourceUrls = {};
  for (const [field, value] of [['primary', manifest.packageSources.primary], ['fallback', fallback.base]]) {
    let url;
    try { url = new URL(value); } catch { fail('BUNDLED_SNAPSHOT_INVALID', { field: `packageSources.${field}` }); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !url.pathname.endsWith(`/knowledge/versions/${manifest.snapshotVersion}/`)) {
      fail('BUNDLED_SNAPSHOT_INVALID', { field: `packageSources.${field}` });
    }
    sourceUrls[field] = url;
  }
  if (sourceUrls.primary.origin !== 'https://lintendo.github.io' || sourceUrls.primary.pathname !== `/Make-Template/knowledge/versions/${manifest.snapshotVersion}/`
    || sourceUrls.fallback.origin !== 'https://gitee.com' || sourceUrls.fallback.pathname !== `/axhub/Make-Template/raw/${fallback.commit}/knowledge/versions/${manifest.snapshotVersion}/`) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: 'packageSources' });
  }
}

async function discoverSnapshotRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const templateManifest = path.join(current, 'template-manifest.json');
    const snapshotManifest = path.join(current, SNAPSHOT_DIR, 'manifest.json');
    try {
      const [templateInfo, snapshotInfo] = await Promise.all([fs.lstat(templateManifest), fs.lstat(snapshotManifest)]);
      if (templateInfo.isFile() && snapshotInfo.isFile() && !templateInfo.isSymbolicLink() && !snapshotInfo.isSymbolicLink()) return path.join(current, SNAPSHOT_DIR);
    } catch {
      // Continue walking toward the filesystem root.
    }
    const parent = path.dirname(current);
    if (parent === current) fail('BUNDLED_SNAPSHOT_NOT_FOUND', { startDir: path.resolve(startDir) });
    current = parent;
  }
}

function resolveOverrideRoot(snapshotRoot, startDir, projectRoot) {
  if (typeof snapshotRoot !== 'string' || !snapshotRoot) fail('BUNDLED_SNAPSHOT_INVALID', { field: 'snapshotRoot' });
  if (path.isAbsolute(snapshotRoot)) return path.resolve(snapshotRoot);
  const root = path.resolve(projectRoot ?? startDir);
  const resolved = path.resolve(root, snapshotRoot);
  const relation = path.relative(root, resolved);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: 'snapshotRoot', reason: 'path-escape' });
  }
  return resolved;
}

export async function resolveBundledSnapshot({ startDir = process.cwd(), snapshotRoot, projectRoot, readFile = fs.readFile } = {}) {
  const root = snapshotRoot ? resolveOverrideRoot(snapshotRoot, startDir, projectRoot) : await discoverSnapshotRoot(startDir);
  if (readFile === fs.readFile && !snapshotRoot && snapshotCache.has(root)) return snapshotCache.get(root);
  try {
    let rootInfo;
    try { rootInfo = await fs.lstat(root); } catch (error) {
      if (error?.code === 'ENOENT') fail('BUNDLED_SNAPSHOT_NOT_FOUND', { snapshotRoot: root });
      throw error;
    }
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail('BUNDLED_SNAPSHOT_INVALID', { field: 'snapshotRoot' });
    const relativeManifest = 'manifest.json';
    await assertRegularFile(root, relativeManifest, relativeManifest);
    const manifest = parseJson(await readFile(path.join(root, relativeManifest)), 'manifest');
    validateManifest(manifest);
    const snapshot = Object.freeze({ root, manifest });
    if (readFile === fs.readFile && !snapshotRoot) snapshotCache.set(root, snapshot);
    return snapshot;
  } catch (error) {
    if (error?.code === 'BUNDLED_SNAPSHOT_INVALID' || error?.code === 'BUNDLED_SNAPSHOT_NOT_FOUND') throw error;
    fail('BUNDLED_SNAPSHOT_NOT_FOUND', { snapshotRoot: root });
  }
}

function validateIndex(index, platform, descriptor, manifest) {
  if (!index || typeof index !== 'object' || Array.isArray(index) || index.schemaVersion !== 1 || index.platform !== platform || !Array.isArray(index.records) || !index.postings || typeof index.postings !== 'object' || Array.isArray(index.postings)) {
    fail('BUNDLED_SNAPSHOT_INVALID', { field: `indexes.${platform}` });
  }
  if (index.records.length !== descriptor.count) fail('BUNDLED_SNAPSHOT_INVALID', { field: `indexes.${platform}.count` });
  const ids = new Set();
  for (const record of index.records) {
    const publicationValid = record?.publishable === true && record.reviewStatus === 'approved' && Array.isArray(record.reasons) && record.reasons.length === 0;
    if (!record || record.schemaVersion !== 1 || !SLUG_RE.test(record.id) || record.slug !== record.id || !Array.isArray(record.platforms) || record.platforms.length !== 1 || record.platforms[0] !== platform || record.searchable !== true || !publicationValid || ids.has(record.id)) {
      fail('BUNDLED_SNAPSHOT_INVALID', { field: `indexes.${platform}.records`, id: record?.id });
    }
    const artifacts = record.artifacts;
    if (!artifacts || artifacts.designMdPath !== `${manifest.designMd.root}/${record.slug}.md` || !HASH_RE.test(artifacts.designMdHash)) {
      fail('BUNDLED_SNAPSHOT_INVALID', { field: `records.${record.id}.artifacts.designMd` });
    }
    safeRelativePath(artifacts.designMdPath, `records.${record.id}.artifacts.designMdPath`);
    const remoteArtifacts = record.remoteArtifacts ?? artifacts;
    if (!safePackagePath(remoteArtifacts.packagePath) || !HASH_RE.test(remoteArtifacts.packageHash)) {
      fail('PACKAGE_SOURCE_INVALID', { id: record.id });
    }
    ids.add(record.id);
  }
  for (const [token, posting] of Object.entries(index.postings)) {
    if (!token || !Array.isArray(posting) || new Set(posting).size !== posting.length || posting.some((id) => !ids.has(id))) {
      fail('BUNDLED_SNAPSHOT_INVALID', { field: `indexes.${platform}.postings` });
    }
  }
}

function safePackagePath(value) {
  if (typeof value !== 'string' || !value || !value.endsWith('.tgz')) return false;
  try { safeRelativePath(value, 'packagePath'); return true; } catch { return false; }
}

export async function loadBundledIndex({ snapshot, platform, request, readFile = fs.readFile } = {}) {
  const requestedPlatform = platform ?? request?.platform;
  if (!snapshot?.manifest || !PLATFORM_VALUES.has(requestedPlatform)) fail('BUNDLED_SNAPSHOT_INVALID', { field: 'platform' });
  let perSnapshot = indexCache.get(snapshot);
  if (!perSnapshot) {
    perSnapshot = new Map();
    indexCache.set(snapshot, perSnapshot);
  }
  if (perSnapshot.has(requestedPlatform)) return perSnapshot.get(requestedPlatform);
  const descriptor = snapshot.manifest.indexes[requestedPlatform];
  const { bytes } = await readVerifiedFile(snapshot.root, descriptor.path, descriptor.hash, `indexes.${requestedPlatform}`, readFile);
  const index = parseJson(bytes, `indexes.${requestedPlatform}`);
  validateIndex(index, requestedPlatform, descriptor, snapshot.manifest);
  for (const record of index.records) {
    await readVerifiedFile(snapshot.root, record.artifacts.designMdPath, record.artifacts.designMdHash, `records.${record.id}.artifacts.designMd`, readFile);
  }
  const loaded = Object.freeze({
    index,
    cacheStatus: 'bundled',
    cacheVersion: snapshot.manifest.snapshotVersion,
    expectedCount: descriptor.count,
    bundled: true,
    localRoot: snapshot.root,
    snapshot,
  });
  perSnapshot.set(requestedPlatform, loaded);
  return loaded;
}

export async function readBundledDesignMd({ snapshot, slug, readFile = fs.readFile, maxBytes = 2 * 1024 * 1024 } = {}) {
  if (!snapshot?.manifest || !SLUG_RE.test(slug)) fail('BUNDLED_SNAPSHOT_INVALID', { field: 'slug' });
  const indexes = await Promise.all([...PLATFORM_VALUES].map((platform) => loadBundledIndex({ snapshot, platform, readFile })));
  const record = indexes.flatMap(({ index }) => index.records).find((item) => item.slug === slug);
  if (!record) fail('BUNDLED_SNAPSHOT_INVALID', { field: 'slug', reason: 'not-found' });
  const artifact = record.artifacts;
  const verified = await readVerifiedFile(snapshot.root, artifact.designMdPath, artifact.designMdHash, `records.${slug}.artifacts.designMd`, readFile);
  if (verified.bytes.length > maxBytes) fail('BUNDLED_SNAPSHOT_INVALID', { field: `records.${slug}.artifacts.designMd`, reason: 'size-limit' });
  return { content: Buffer.from(verified.bytes).toString('utf8'), path: verified.path, hash: artifact.designMdHash, record };
}
