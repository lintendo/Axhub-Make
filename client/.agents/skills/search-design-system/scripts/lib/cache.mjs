import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const HASH_PATTERN = /^sha256:([a-f0-9]{64})$/u;

function failure(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function hashHex(hash) {
  const match = HASH_PATTERN.exec(String(hash ?? ''));
  if (!match) throw failure('INVALID_INDEX', { field: 'hash' });
  return match[1];
}

export function cacheKeyFor(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function objectPath(cacheDir, hash) {
  return path.join(path.resolve(cacheDir), 'objects', hashHex(hash));
}

async function replaceExistingFile(temporary, file, fileSystem, initialError) {
  const backup = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.bak`);
  try {
    await fileSystem.rename(file, backup);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      await fileSystem.rename(temporary, file);
      return;
    }
    throw initialError;
  }
  try {
    await fileSystem.rename(temporary, file);
  } catch (error) {
    try {
      await fileSystem.rename(backup, file);
    } catch (restoreError) {
      error.restoreError = restoreError;
    }
    throw error;
  }
  await fileSystem.rm(backup, { force: true }).catch(() => {});
}

export async function atomicWrite(file, bytes, { fileSystem = fs } = {}) {
  await fileSystem.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fileSystem.open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await fileSystem.rename(temporary, file);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
      await replaceExistingFile(temporary, file, fileSystem, error);
    }
  } finally {
    await handle?.close().catch(() => {});
    await fileSystem.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function cacheObject(cacheDir, expectedHash, value, sourceUrl) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) throw failure('INDEX_HASH_MISMATCH', { expectedHash, actualHash });
  const target = objectPath(cacheDir, expectedHash);
  try {
    const existing = await fs.readFile(target);
    if (sha256(existing) !== expectedHash) throw failure('INDEX_HASH_MISMATCH', { expectedHash, cachePath: target });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await atomicWrite(target, bytes);
  }
  if (sourceUrl) {
    const ref = path.join(path.resolve(cacheDir), 'refs', `${cacheKeyFor(sourceUrl)}.json`);
    await atomicWrite(ref, `${JSON.stringify({ url: String(sourceUrl), hash: expectedHash })}\n`);
  }
  return { hash: expectedHash, path: target };
}

export async function readCachedObject(cacheDir, hash) {
  const target = objectPath(cacheDir, hash);
  let bytes;
  try {
    bytes = await fs.readFile(target);
  } catch (error) {
    if (error?.code === 'ENOENT') throw failure('CACHE_MISS', { hash });
    throw error;
  }
  const actualHash = sha256(bytes);
  if (actualHash !== hash) throw failure('INDEX_HASH_MISMATCH', { expectedHash: hash, actualHash });
  return bytes;
}

export async function readCachedRef(cacheDir, sourceUrl) {
  const ref = path.join(path.resolve(cacheDir), 'refs', `${cacheKeyFor(sourceUrl)}.json`);
  try {
    const parsed = JSON.parse(await fs.readFile(ref, 'utf8'));
    if (parsed.url !== String(sourceUrl)) throw failure('CACHE_MISS', { url: String(sourceUrl) });
    hashHex(parsed.hash);
    return parsed.hash;
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) throw failure('CACHE_MISS', { url: String(sourceUrl) });
    throw error;
  }
}
