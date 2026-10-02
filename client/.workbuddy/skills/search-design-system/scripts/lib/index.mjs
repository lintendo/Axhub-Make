import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { cacheObject, readCachedObject, readCachedRef, sha256 } from './cache.mjs';
import { loadBundledIndex, resolveBundledSnapshot } from './bundled-snapshot.mjs';
import { assertSafeUrl, fetchRemoteBytes } from './fetch-artifact.mjs';
import { isExcluded, matchesHardFilters, scoreRecord } from './score.mjs';

export const READER_VERSION = '1.0.0';
export const CONTRACT = Object.freeze({
  schemaVersion: 1,
  taxonomyVersion: '1.0.0',
  searchContractVersion: '1.0.0',
  tokenizationVersion: 'nfkc-intl-segmenter-v1',
  minReaderVersion: '1.0.0',
  maxReaderVersionExclusive: '2.0.0',
});

export const ERROR_CODES = Object.freeze([
  'INVALID_REQUEST',
  'UNSUPPORTED_SCHEMA_VERSION',
  'INCOMPATIBLE_READER_VERSION',
  'INCOMPATIBLE_TAXONOMY_VERSION',
  'INCOMPATIBLE_SEARCH_CONTRACT_VERSION',
  'INVALID_INDEX',
  'INDEX_HASH_MISMATCH',
  'ARTIFACT_HASH_MISMATCH',
  'UNSAFE_ARTIFACT_URL',
  'FETCH_FAILED',
  'CACHE_MISS',
  'STALE_CACHE_DISALLOWED',
  'RESULT_NOT_FOUND',
  'ANNOTATION_INVALID',
  'ANNOTATION_INPUT_HASH_MISMATCH',
  'BUNDLED_SNAPSHOT_NOT_FOUND',
  'BUNDLED_SNAPSHOT_INVALID',
  'PACKAGE_SOURCE_INVALID',
  'DOWNLOAD_TIMEOUT',
  'PACKAGE_BOTH_SOURCES_FAILED',
  'INSTALL_DESTINATION_INVALID',
  'METADATA_SYNC_FAILED',
]);

export class DesignKnowledgeSearchError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'DesignKnowledgeSearchError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, details = {}) {
  throw new DesignKnowledgeSearchError(code, details);
}

function normalizeError(error) {
  if (error instanceof DesignKnowledgeSearchError) return error;
  if (ERROR_CODES.includes(error?.code)) return new DesignKnowledgeSearchError(error.code, error.details ?? {});
  return new DesignKnowledgeSearchError('FETCH_FAILED', { reason: 'unexpected' });
}

function compareVersion(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function validVersion(value) {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u.test(value);
}

const FILTER_FIELDS = new Set(['industries', 'productTypes', 'pageTypes', 'styles', 'brandTraits', 'colorFamilies', 'colorModes', 'density']);

function validateFilters(value, field) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_REQUEST', { field });
  for (const [key, values] of Object.entries(value)) {
    if (!FILTER_FIELDS.has(key) || !Array.isArray(values) || values.some((item) => typeof item !== 'string' || item.length === 0) || new Set(values).size !== values.length) {
      fail('INVALID_REQUEST', { field: `${field}.${key}` });
    }
  }
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('INVALID_REQUEST');
  const allowed = new Set(['schemaVersion', 'readerVersion', 'platform', 'terms', 'hardFilters', 'softFilters', 'exclude', 'limit']);
  const unknown = Object.keys(request).find((key) => !allowed.has(key));
  if (unknown) fail('INVALID_REQUEST', { field: unknown });
  if (request.schemaVersion !== CONTRACT.schemaVersion) fail('UNSUPPORTED_SCHEMA_VERSION', { schemaVersion: request.schemaVersion });
  if (!validVersion(request.readerVersion)) fail('INVALID_REQUEST', { field: 'readerVersion' });
  if (compareVersion(request.readerVersion, CONTRACT.minReaderVersion) < 0 || compareVersion(request.readerVersion, CONTRACT.maxReaderVersionExclusive) >= 0) {
    fail('INCOMPATIBLE_READER_VERSION', { readerVersion: request.readerVersion, minVersion: CONTRACT.minReaderVersion, maxVersionExclusive: CONTRACT.maxReaderVersionExclusive });
  }
  if (!['desktop', 'mobile'].includes(request.platform)) fail('INVALID_REQUEST', { field: 'platform' });
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 20) fail('INVALID_REQUEST', { field: 'limit' });
  if (request.terms !== undefined && (!Array.isArray(request.terms) || request.terms.some((item) => typeof item !== 'string' || item.length === 0) || new Set(request.terms).size !== request.terms.length)) fail('INVALID_REQUEST', { field: 'terms' });
  validateFilters(request.hardFilters, 'hardFilters');
  validateFilters(request.softFilters, 'softFilters');
  validateFilters(request.exclude, 'exclude');
}

function validateIndex(index, request, remote = false) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) fail('INVALID_INDEX');
  if (index.schemaVersion !== CONTRACT.schemaVersion) fail('UNSUPPORTED_SCHEMA_VERSION', { schemaVersion: index.schemaVersion });
  if (index.taxonomyVersion !== CONTRACT.taxonomyVersion) fail('INCOMPATIBLE_TAXONOMY_VERSION', { taxonomyVersion: index.taxonomyVersion });
  if (index.searchContractVersion !== CONTRACT.searchContractVersion) fail('INCOMPATIBLE_SEARCH_CONTRACT_VERSION', { searchContractVersion: index.searchContractVersion });
  if (index.tokenizationVersion !== CONTRACT.tokenizationVersion) fail('INVALID_INDEX', { field: 'tokenizationVersion' });
  if (index.platform !== request.platform || !Array.isArray(index.records) || !index.postings || typeof index.postings !== 'object' || Array.isArray(index.postings)) fail('INVALID_INDEX');
  const ids = new Set();
  for (const record of index.records) {
    const reasonsValid = Array.isArray(record?.reasons) && new Set(record.reasons).size === record.reasons.length && record.reasons.every((reason) => typeof reason === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(reason));
    const platformsValid = Array.isArray(record?.platforms) && record.platforms.length > 0 && new Set(record.platforms).size === record.platforms.length && record.platforms.every((platform) => ['desktop', 'mobile'].includes(platform));
    const publicationValid = record?.publishable !== true || (record.reviewStatus === 'approved' && record.reasons.length === 0);
    if (!record || typeof record !== 'object' || record.schemaVersion !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.id) || record.slug !== record.id || !platformsValid || !record.platforms.includes(request.platform) || record.searchable !== true || !['approved', 'deferred', 'rejected'].includes(record.reviewStatus) || typeof record.publishable !== 'boolean' || !reasonsValid || !publicationValid || ids.has(record.id)) {
      fail('INVALID_INDEX', { id: record?.id });
    }
    ids.add(record.id);
  }
  for (const [token, posting] of Object.entries(index.postings)) {
    if (!token || !Array.isArray(posting) || new Set(posting).size !== posting.length || posting.some((id) => !ids.has(id))) fail('INVALID_INDEX', { field: `postings.${token}` });
  }
  return ids;
}

function validateManifest(manifest, request) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('INVALID_INDEX', { artifact: 'manifest' });
  if (manifest.schemaVersion !== CONTRACT.schemaVersion) fail('UNSUPPORTED_SCHEMA_VERSION', { schemaVersion: manifest.schemaVersion });
  if (manifest.taxonomyVersion !== CONTRACT.taxonomyVersion) fail('INCOMPATIBLE_TAXONOMY_VERSION', { taxonomyVersion: manifest.taxonomyVersion });
  if (manifest.searchContractVersion !== CONTRACT.searchContractVersion) fail('INCOMPATIBLE_SEARCH_CONTRACT_VERSION', { searchContractVersion: manifest.searchContractVersion });
  if (manifest.tokenizationVersion !== CONTRACT.tokenizationVersion) fail('INVALID_INDEX', { field: 'tokenizationVersion' });
  if (!validVersion(manifest.minReaderVersion) || !validVersion(manifest.maxReaderVersionExclusive) || compareVersion(request.readerVersion, manifest.minReaderVersion) < 0 || compareVersion(request.readerVersion, manifest.maxReaderVersionExclusive) >= 0) {
    fail('INCOMPATIBLE_READER_VERSION', { readerVersion: request.readerVersion });
  }
  const artifact = manifest.indexes?.[request.platform];
  if (!artifact || typeof artifact.url !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(artifact.hash) || !Number.isInteger(artifact.count) || artifact.count < 0) fail('INVALID_INDEX', { field: `indexes.${request.platform}` });
  if (!Array.isArray(manifest.records) || manifest.records.some((record) => !record || record.searchable !== true || !['approved', 'deferred', 'rejected'].includes(record.reviewStatus) || typeof record.publishable !== 'boolean' || !Array.isArray(record.platforms))) fail('INVALID_INDEX', { reason: 'manifest-record-not-searchable' });
  const manifestPlatformCount = manifest.records.filter((record) => record.platforms.includes(request.platform)).length;
  if (manifestPlatformCount !== artifact.count) fail('INVALID_INDEX', { reason: 'manifest-count-mismatch', expectedCount: artifact.count, actualCount: manifestPlatformCount });
  return artifact;
}

function parseJson(bytes, artifact) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    fail('INVALID_INDEX', { artifact });
  }
}

function derivedRemotePolicy(manifestUrl, options) {
  let url;
  try {
    url = new URL(manifestUrl);
  } catch {
    fail('UNSAFE_ARTIFACT_URL', { url: String(manifestUrl) });
  }
  const directory = path.posix.dirname(url.pathname);
  return {
    allowedOrigin: options.allowedOrigin ?? url.origin,
    allowedBasePath: options.allowedBasePath ?? (directory === '.' ? '/' : directory),
  };
}

async function loadLocalIndex(options) {
  if (options.index) {
    const bytes = Buffer.from(JSON.stringify(options.index));
    const actualHash = sha256(bytes);
    if (options.expectedHash && actualHash !== options.expectedHash) fail('INDEX_HASH_MISMATCH', { expectedHash: options.expectedHash, actualHash });
    return { index: options.index, cacheStatus: 'local', cacheVersion: actualHash, localRoot: options.localRoot };
  }
  if (!options.indexPath) fail('INVALID_REQUEST', { field: 'indexPath' });
  const resolved = path.resolve(options.indexPath);
  const bytes = await fs.readFile(resolved).catch(() => fail('INVALID_INDEX', { reason: 'read-failed' }));
  const actualHash = sha256(bytes);
  if (options.expectedHash && actualHash !== options.expectedHash) fail('INDEX_HASH_MISMATCH', { expectedHash: options.expectedHash, actualHash });
  return { index: parseJson(bytes, 'index'), cacheStatus: 'local', cacheVersion: actualHash, localRoot: options.localRoot ?? path.dirname(resolved) };
}

async function cachedIndexFromKnownHash(options, hash) {
  if (!options.cacheDir || !hash) fail('CACHE_MISS');
  const bytes = await readCachedObject(options.cacheDir, hash);
  return parseJson(bytes, 'index');
}

function defaultCacheDir() {
  const configured = process.platform === 'win32' ? process.env.LOCALAPPDATA : process.env.XDG_CACHE_HOME;
  const fallback = process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local') : path.join(os.homedir(), '.cache');
  const platformRoot = configured && path.isAbsolute(configured) ? configured : fallback;
  return path.join(platformRoot, 'axhub', 'search-design-system');
}

async function loadRemoteIndex(request, options) {
  const policy = derivedRemotePolicy(options.manifestUrl, options);
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const cacheOptions = { ...options, cacheDir };
  if (options.offline && options.cachedIndexHash) return { index: await cachedIndexFromKnownHash(cacheOptions, options.cachedIndexHash), cacheStatus: 'stale', cacheVersion: options.cachedIndexHash, remote: true, remotePolicy: policy, baseUrl: options.manifestUrl };

  let manifest;
  let manifestWasStale = false;
  if (options.offline) {
    const manifestHash = await readCachedRef(cacheDir, options.manifestUrl);
    manifest = parseJson(await readCachedObject(cacheDir, manifestHash), 'manifest');
    manifestWasStale = true;
  } else {
    try {
      const remote = await fetchRemoteBytes(options.manifestUrl, { ...policy, fetch: options.fetch, kind: 'manifest', maxBytes: options.maxManifestBytes });
      const manifestHash = sha256(remote.bytes);
      await cacheObject(cacheDir, manifestHash, remote.bytes, options.manifestUrl);
      manifest = parseJson(remote.bytes, 'manifest');
    } catch (error) {
      let staleHash;
      try { staleHash = await readCachedRef(cacheDir, options.manifestUrl); } catch {}
      if (!staleHash && options.cachedIndexHash) {
        if (!options.allowStaleCache) fail('STALE_CACHE_DISALLOWED', { artifact: 'index' });
        return { index: await cachedIndexFromKnownHash(cacheOptions, options.cachedIndexHash), cacheStatus: 'stale', cacheVersion: options.cachedIndexHash, remote: true, remotePolicy: policy, baseUrl: options.manifestUrl };
      }
      if (!staleHash) throw normalizeError(error);
      if (!options.allowStaleCache) fail('STALE_CACHE_DISALLOWED', { artifact: 'manifest' });
      manifest = parseJson(await readCachedObject(cacheDir, staleHash), 'manifest');
      manifestWasStale = true;
    }
  }

  const artifact = validateManifest(manifest, request);
  for (const record of manifest.records) validateRemoteRecordUrls(record, policy, options.manifestUrl);
  const indexUrl = new URL(artifact.url, options.manifestUrl).href;
  if (manifestWasStale) return { index: parseJson(await readCachedObject(cacheDir, artifact.hash), 'index'), cacheStatus: 'stale', cacheVersion: artifact.hash, expectedCount: artifact.count, remote: true, remotePolicy: policy, baseUrl: options.manifestUrl };

  try {
    const remote = await fetchRemoteBytes(indexUrl, { ...policy, fetch: options.fetch, kind: 'index', maxBytes: options.maxIndexBytes });
    if (sha256(remote.bytes) !== artifact.hash) fail('INDEX_HASH_MISMATCH', { expectedHash: artifact.hash, actualHash: sha256(remote.bytes) });
    await cacheObject(cacheDir, artifact.hash, remote.bytes, indexUrl);
    return { index: parseJson(remote.bytes, 'index'), cacheStatus: 'fresh', cacheVersion: artifact.hash, expectedCount: artifact.count, remote: true, remotePolicy: policy, baseUrl: options.manifestUrl };
  } catch (error) {
    let cached;
    try { cached = await readCachedObject(cacheDir, artifact.hash); } catch {}
    if (!cached) throw normalizeError(error);
    if (!options.allowStaleCache) fail('STALE_CACHE_DISALLOWED', { artifact: 'index' });
    return { index: parseJson(cached, 'index'), cacheStatus: 'stale', cacheVersion: artifact.hash, expectedCount: artifact.count, remote: true, remotePolicy: policy, baseUrl: options.manifestUrl };
  }
}

function safeLocalPath(candidate, localRoot) {
  if (typeof candidate !== 'string' || !candidate) return undefined;
  const root = path.resolve(localRoot ?? process.cwd());
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  return resolved;
}

async function existingLocalArtifact(candidate, hash, localRoot) {
  const resolved = safeLocalPath(candidate, localRoot);
  if (!resolved) return { available: false };
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) return { available: false };
    return { available: true, source: 'local', path: resolved, ...(hash ? { hash } : {}) };
  } catch {
    return { available: false };
  }
}

function remoteArtifact(url, hash, remotePolicy, baseUrl) {
  if (typeof url !== 'string' || !url) return { available: false };
  const resolved = new URL(url, baseUrl).href;
  assertSafeUrl(resolved, remotePolicy);
  return { available: true, source: 'remote', url: resolved, ...(hash ? { hash } : {}) };
}

function bundledPackageArtifact(record, snapshot) {
  if (!record.publishable) return { available: false };
  const artifacts = record.artifacts ?? {};
  const remoteArtifacts = record.remoteArtifacts ?? artifacts;
  const packagePath = remoteArtifacts.packagePath ?? remoteArtifacts.package?.path;
  const packageHash = remoteArtifacts.packageHash ?? remoteArtifacts.package?.hash;
  if (typeof packagePath !== 'string' || !packagePath || path.posix.isAbsolute(packagePath) || path.win32.isAbsolute(packagePath) || packagePath.includes('\\') || packagePath.split('/').some((part) => !part || part === '.' || part === '..') || path.posix.normalize(packagePath) !== packagePath || !/^sha256:[a-f0-9]{64}$/u.test(packageHash)) {
    fail('PACKAGE_SOURCE_INVALID', { id: record.id });
  }
  const sources = [
    { name: 'primary', url: new URL(packagePath, snapshot.manifest.packageSources.primary).href },
    { name: 'fallback', url: new URL(packagePath, snapshot.manifest.packageSources.fallback.base).href },
  ];
  return { available: true, source: 'remote', path: packagePath, hash: packageHash, snapshotVersion: snapshot.manifest.snapshotVersion, sources };
}

function validateRemoteRecordUrls(record, remotePolicy, baseUrl) {
  const artifacts = record.artifacts ?? {};
  const preview = record.preview ?? {};
  remoteArtifact(artifacts.designMdUrl ?? artifacts.designMd?.url, artifacts.designMdHash ?? artifacts.designMd?.hash, remotePolicy, baseUrl);
  remoteArtifact(preview.pageUrl ?? artifacts.previewUrl ?? artifacts.preview?.url, preview.pageHash ?? artifacts.previewHash ?? artifacts.preview?.hash, remotePolicy, baseUrl);
  remoteArtifact(artifacts.previewImageUrl ?? artifacts.previewImage?.url, artifacts.previewImageHash ?? artifacts.previewImage?.hash, remotePolicy, baseUrl);
  remoteArtifact(artifacts.packageUrl ?? artifacts.package?.url, artifacts.packageHash ?? artifacts.package?.hash, remotePolicy, baseUrl);
}

async function resultArtifacts(record, { remote, bundled, snapshot, localRoot, remotePolicy, baseUrl }) {
  const artifacts = record.artifacts ?? {};
  const preview = record.preview ?? {};
  if (remote) {
    return {
      designMd: remoteArtifact(artifacts.designMdUrl ?? artifacts.designMd?.url, artifacts.designMdHash ?? artifacts.designMd?.hash, remotePolicy, baseUrl),
      preview: remoteArtifact(preview.pageUrl ?? artifacts.previewUrl ?? artifacts.preview?.url, preview.pageHash ?? artifacts.previewHash ?? artifacts.preview?.hash, remotePolicy, baseUrl),
      previewImage: remoteArtifact(artifacts.previewImageUrl ?? artifacts.previewImage?.url, artifacts.previewImageHash ?? artifacts.previewImage?.hash, remotePolicy, baseUrl),
      package: record.publishable
        ? remoteArtifact(artifacts.packageUrl ?? artifacts.package?.url, artifacts.packageHash ?? artifacts.package?.hash, remotePolicy, baseUrl)
        : { available: false },
    };
  }
  if (bundled) {
    return {
      designMd: await existingLocalArtifact(artifacts.designMdPath ?? artifacts.designMd?.path, artifacts.designMdHash ?? artifacts.designMd?.hash, localRoot),
      preview: { available: false },
      previewImage: { available: false },
      package: bundledPackageArtifact(record, snapshot),
    };
  }
  return {
    designMd: await existingLocalArtifact(artifacts.designMdPath ?? artifacts.designMd?.path, artifacts.designMdHash ?? artifacts.designMd?.hash, localRoot),
    preview: await existingLocalArtifact(artifacts.previewPath ?? artifacts.preview?.path ?? preview.pagePath ?? preview.sourcePath, artifacts.previewHash ?? artifacts.preview?.hash, localRoot),
    previewImage: await existingLocalArtifact(artifacts.previewImagePath ?? artifacts.previewImage?.path, artifacts.previewImageHash ?? artifacts.previewImage?.hash, localRoot),
    package: record.publishable ? await existingLocalArtifact(artifacts.packagePath ?? artifacts.package?.path, artifacts.packageHash ?? artifacts.package?.hash, localRoot) : { available: false },
  };
}

export async function search(request, options = {}) {
  try {
    validateRequest(request);
    const loaded = options.source === 'bundled'
      ? await loadBundledIndex({ request, snapshot: options.snapshot ?? await resolveBundledSnapshot({ ...options, startDir: options.startDir ?? options.projectRoot ?? process.cwd() }), readFile: options.readFile })
      : options.manifestUrl ? await loadRemoteIndex(request, options) : await loadLocalIndex(options);
    validateIndex(loaded.index, request, loaded.remote);
    if (loaded.expectedCount !== undefined && loaded.index.records.length !== loaded.expectedCount) fail('INVALID_INDEX', { reason: 'manifest-count-mismatch', expectedCount: loaded.expectedCount, actualCount: loaded.index.records.length });
    if (loaded.remote) for (const record of loaded.index.records) validateRemoteRecordUrls(record, loaded.remotePolicy, loaded.baseUrl);
    const candidates = loaded.index.records
      .filter((record) => matchesHardFilters(record, request.hardFilters) && !isExcluded(record, request.exclude))
      .map((record) => ({ record, ...scoreRecord(record, request) }))
      .sort((left, right) => right.score - left.score || (left.record.id < right.record.id ? -1 : left.record.id > right.record.id ? 1 : 0))
      .slice(0, request.limit);
    const results = [];
    for (const candidate of candidates) {
      results.push({
        id: candidate.record.id,
        title: candidate.record.title ?? candidate.record.id,
        score: candidate.score,
        matched: candidate.matched,
        unmatched: candidate.unmatched,
        scoreBreakdown: candidate.scoreBreakdown,
        reviewStatus: candidate.record.reviewStatus,
        publishable: candidate.record.publishable,
        artifacts: await resultArtifacts(candidate.record, { remote: loaded.remote, bundled: loaded.bundled, snapshot: loaded.snapshot, localRoot: loaded.localRoot, remotePolicy: loaded.remotePolicy, baseUrl: loaded.baseUrl }),
      });
    }
    return {
      schemaVersion: CONTRACT.schemaVersion,
      taxonomyVersion: CONTRACT.taxonomyVersion,
      searchContractVersion: CONTRACT.searchContractVersion,
      cacheStatus: loaded.cacheStatus,
      ...(loaded.cacheVersion ? { cacheVersion: loaded.cacheVersion } : {}),
      resultSummary: {
        requested: request.limit,
        returned: results.length,
        ...(results.length < request.limit ? { reason: 'insufficient-results' } : {}),
      },
      results,
    };
  } catch (error) {
    throw normalizeError(error);
  }
}

export { fetchArtifact } from './fetch-artifact.mjs';
