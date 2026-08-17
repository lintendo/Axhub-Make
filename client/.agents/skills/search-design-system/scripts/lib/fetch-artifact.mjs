import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256 } from './cache.mjs';

const DEFAULT_LIMITS = Object.freeze({ manifest: 1024 * 1024, index: 20 * 1024 * 1024, designMd: 2 * 1024 * 1024, preview: 5 * 1024 * 1024, package: 100 * 1024 * 1024 });

function failure(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function normalizedBasePath(value) {
  const base = String(value || '/');
  const prefixed = base.startsWith('/') ? base : `/${base}`;
  return prefixed === '/' ? '/' : prefixed.replace(/\/+$/u, '');
}

export function assertSafeUrl(value, { allowedOrigin, allowedBasePath = '/' } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw failure('UNSAFE_ARTIFACT_URL', { url: String(value) });
  }
  let originUrl;
  try { originUrl = new URL(allowedOrigin); } catch { throw failure('UNSAFE_ARTIFACT_URL', { url: String(value) }); }
  if (originUrl.protocol !== 'https:' || originUrl.username || originUrl.password || originUrl.pathname !== '/' || originUrl.search || originUrl.hash) throw failure('UNSAFE_ARTIFACT_URL', { url: String(value) });
  const expectedOrigin = originUrl.origin;
  const base = normalizedBasePath(allowedBasePath);
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { throw failure('UNSAFE_ARTIFACT_URL', { url: url.href }); }
  const inBase = base === '/' || decodedPath === base || decodedPath.startsWith(`${base}/`);
  const pathParts = decodedPath.replaceAll('\\', '/').split('/');
  if (pathParts.includes('..') || url.protocol !== 'https:' || url.origin !== expectedOrigin || !inBase || url.username || url.password || url.hash) {
    throw failure('UNSAFE_ARTIFACT_URL', { url: url.href });
  }
  return url;
}

async function responseBytes(response, maxBytes, url) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw failure('FETCH_FAILED', { reason: 'size-limit', url, maxBytes });
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) {
      await response.body.cancel?.().catch(() => {});
      throw failure('FETCH_FAILED', { reason: 'size-limit', url, maxBytes });
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export async function fetchRemoteBytes(value, { fetch: fetcher = globalThis.fetch, allowedOrigin, allowedBasePath = '/', maxBytes, kind = 'artifact', maxRedirects = 5 } = {}) {
  if (typeof fetcher !== 'function') throw failure('FETCH_FAILED', { reason: 'fetch-unavailable' });
  let current = assertSafeUrl(value, { allowedOrigin, allowedBasePath });
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    let response;
    try {
      response = await fetcher(current, { method: 'GET', redirect: 'manual' });
    } catch {
      throw failure('FETCH_FAILED', { url: current.href, reason: 'network' });
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      if (!location || redirect === maxRedirects) throw failure('FETCH_FAILED', { reason: 'redirect-limit', url: current.href });
      current = assertSafeUrl(new URL(location, current).href, { allowedOrigin, allowedBasePath });
      continue;
    }
    if (!response.ok) throw failure('FETCH_FAILED', { url: current.href, status: response.status });
    if (response.url) assertSafeUrl(response.url, { allowedOrigin, allowedBasePath });
    return { bytes: await responseBytes(response, maxBytes ?? DEFAULT_LIMITS[kind] ?? DEFAULT_LIMITS.package, current.href), url: current.href };
  }
  throw failure('FETCH_FAILED', { reason: 'redirect-limit' });
}

async function localPathWithin(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw failure('UNSAFE_ARTIFACT_URL', { path: candidate });
  let realRoot;
  let realPath;
  try {
    [realRoot, realPath] = await Promise.all([fs.realpath(resolvedRoot), fs.realpath(resolved)]);
  } catch {
    throw failure('RESULT_NOT_FOUND', { path: candidate });
  }
  const realRelative = path.relative(realRoot, realPath);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw failure('UNSAFE_ARTIFACT_URL', { path: candidate });
  return realPath;
}

export async function fetchArtifact(result, options = {}) {
  const kind = options.kind ?? 'designMd';
  const artifact = result?.artifacts?.[kind];
  if (!artifact?.available && !artifact?.path && !artifact?.url) throw failure('RESULT_NOT_FOUND', { id: result?.id, kind });
  if (kind === 'package' && !result?.publishable) throw failure('RESULT_NOT_FOUND', { id: result?.id, kind, reason: 'package-not-authorized' });
  const maxBytes = options.maxBytes ?? DEFAULT_LIMITS[kind] ?? DEFAULT_LIMITS.package;
  let bytes;
  let source;
  if (artifact.path) {
    const root = options.localRoot ?? path.dirname(path.resolve(artifact.path));
    const localPath = await localPathWithin(root, artifact.path);
    const stat = await fs.stat(localPath).catch(() => { throw failure('RESULT_NOT_FOUND', { id: result?.id, kind }); });
    if (stat.size > maxBytes) throw failure('FETCH_FAILED', { reason: 'size-limit', maxBytes });
    bytes = await fs.readFile(localPath);
    source = localPath;
  } else {
    const remote = await fetchRemoteBytes(artifact.url, { ...options, kind, maxBytes });
    bytes = remote.bytes;
    source = remote.url;
  }
  const actualHash = sha256(bytes);
  if (artifact.hash && artifact.hash !== actualHash) throw failure('ARTIFACT_HASH_MISMATCH', { expectedHash: artifact.hash, actualHash });
  return { id: result.id, kind, source, hash: actualHash, body: kind === 'package' ? bytes : bytes.toString('utf8') };
}

export { DEFAULT_LIMITS };
