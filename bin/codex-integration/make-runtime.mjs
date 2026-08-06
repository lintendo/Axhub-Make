import { spawn } from 'node:child_process';

const FIXED_ORIGIN = 'http://127.0.0.1:53817';
const PACKAGE_SPEC_PATTERN = /^@axhub\/make@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

export async function probeMake(origin, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(`${origin}/api/health`, {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true && body?.role === 'admin';
  } catch {
    return false;
  }
}

export function createMakeEnsurer({
  origin,
  probe = () => probeMake(origin),
  spawnServer,
  maxAttempts = 80,
  retryDelayMs = 250,
}) {
  if (origin !== FIXED_ORIGIN) throw new Error(`loopback origin must be ${FIXED_ORIGIN}`);
  if (typeof spawnServer !== 'function') throw new Error('spawnServer callback is required');
  let inFlight = null;

  return function ensureMake() {
    if (inFlight) return inFlight;
    const operation = (async () => {
      if (await probe()) return { origin, reused: true };
      await spawnServer();
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (await probe()) return { origin, reused: false };
        if (attempt + 1 < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
      throw new Error(`Axhub Make did not become healthy at ${origin}`);
    })();
    inFlight = operation.finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function spawnMake(config, { spawnImpl = spawn } = {}) {
  if (config?.origin !== FIXED_ORIGIN) throw new Error(`loopback origin must be ${FIXED_ORIGIN}`);
  if (!PACKAGE_SPEC_PATTERN.test(config?.packageSpec || '')) {
    throw new Error('an exact @axhub/make package spec is required');
  }
  if (typeof config?.nodePath !== 'string' || typeof config?.npxCliPath !== 'string') {
    throw new Error('recorded Node.js and npm paths are required');
  }

  return new Promise((resolve, reject) => {
    const child = spawnImpl(config.nodePath, [
      config.npxCliPath,
      '--yes',
      '--package', config.packageSpec,
      'axhub-make',
      '--host', '127.0.0.1',
      '--port', '53817',
      '--no-open',
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
