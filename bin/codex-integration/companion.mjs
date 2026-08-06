import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { attachCodexTarget, listCodexTargets } from './cdp-session.mjs';
import { createMakeEnsurer, spawnMake } from './make-runtime.mjs';

const FIXED_ORIGIN = 'http://127.0.0.1:53817';
const FIXED_DEBUG_PORT = 9229;
const PACKAGE_SPEC_PATTERN = /^@axhub\/make@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const DEFAULT_POLL_INTERVAL_MS = 1000;

export function parseOptions(argv) {
  if (argv.length !== 2 || argv[0] !== '--config') {
    const unknown = argv.find((value, index) => index % 2 === 0 && value !== '--config');
    if (unknown) throw new Error(`unknown option: ${unknown}`);
    throw new Error('Usage: node companion.mjs --config <absolute-config-path>');
  }
  if (!path.isAbsolute(argv[1])) throw new Error('config path must be absolute');
  return { configPath: argv[1] };
}

export function validateConfig(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) {
    throw new Error('invalid companion config schema');
  }
  if (!PACKAGE_SPEC_PATTERN.test(value.packageSpec || '')) {
    throw new Error('an exact @axhub/make package spec is required');
  }
  if (typeof value.nodePath !== 'string' || !path.isAbsolute(value.nodePath)) {
    throw new Error('Node.js path must be absolute');
  }
  if (typeof value.npxCliPath !== 'string' || !path.isAbsolute(value.npxCliPath)) {
    throw new Error('npx-cli.js path must be absolute');
  }
  if (value.debugPort !== FIXED_DEBUG_PORT) {
    throw new Error(`debug port must be ${FIXED_DEBUG_PORT}`);
  }
  if (value.origin !== FIXED_ORIGIN) {
    throw new Error(`loopback origin must be ${FIXED_ORIGIN}`);
  }
  if (typeof value.installedAt !== 'string') throw new Error('installedAt is required');
  return {
    schemaVersion: 1,
    packageSpec: value.packageSpec,
    nodePath: value.nodePath,
    npxCliPath: value.npxCliPath,
    debugPort: FIXED_DEBUG_PORT,
    origin: FIXED_ORIGIN,
    installedAt: value.installedAt,
  };
}

export async function readConfig(configPath, readFile = fs.readFile) {
  return validateConfig(JSON.parse(await readFile(configPath, 'utf8')));
}

function isCdpUnavailable(error) {
  const code = error?.cause?.code || error?.code;
  return error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || (error instanceof TypeError && error.message === 'fetch failed')
    || [
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ].includes(code);
}

export function createCompanion(config, {
  listTargets = listCodexTargets,
  attachTarget = attachCodexTarget,
  makeEnsurer = createMakeEnsurer,
  spawnRuntime = spawnMake,
  sidebarSource,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  onError = (error) => console.error(error),
} = {}) {
  const validated = validateConfig(config);
  if (typeof sidebarSource !== 'string' || !sidebarSource.trim()) {
    throw new Error('sidebar source is required');
  }
  const sessions = new Map();
  const attaching = new Set();
  const ensureMake = makeEnsurer({
    origin: validated.origin,
    spawnServer: () => spawnRuntime(validated),
  });
  let running = false;
  let timer = null;

  async function poll() {
    let targets;
    try {
      targets = await listTargets(validated.debugPort);
    } catch (error) {
      if (!isCdpUnavailable(error)) throw error;
      for (const session of sessions.values()) session.close();
      sessions.clear();
      return;
    }
    const liveTargetIds = new Set(targets.map((target) => target.id));
    for (const [id, session] of sessions) {
      if (!liveTargetIds.has(id)) {
        sessions.delete(id);
        session.close();
      }
    }
    await Promise.all(targets.map(async (target) => {
      if (sessions.has(target.id) || attaching.has(target.id)) return;
      attaching.add(target.id);
      let session;
      try {
        session = await attachTarget(target, {
          ensureMake,
          sidebarSource,
          onClose: () => {
            if (sessions.get(target.id) === session) sessions.delete(target.id);
          },
        });
        sessions.set(target.id, session);
      } finally {
        attaching.delete(target.id);
      }
    }));
  }

  function schedule() {
    if (!running) return;
    timer = setTimeout(async () => {
      try {
        await poll();
      } catch (error) {
        onError(error);
      } finally {
        schedule();
      }
    }, pollIntervalMs);
  }

  function start() {
    if (running) return;
    running = true;
    void poll().catch(onError).finally(schedule);
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
    for (const session of sessions.values()) session.close();
    sessions.clear();
  }

  return {
    poll,
    start,
    stop,
    get sessionCount() {
      return sessions.size;
    },
  };
}

async function runCli() {
  const { configPath } = parseOptions(process.argv.slice(2));
  const config = await readConfig(configPath);
  const sidebarSource = await fs.readFile(path.join(path.dirname(configPath), 'axhub-make.sidebar.js'), 'utf8');
  const companion = createCompanion(config, { sidebarSource });
  const stop = () => companion.stop();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  companion.start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
