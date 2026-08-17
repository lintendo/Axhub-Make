import type { Plugin } from 'vite';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  fetchHealth,
  hasAdminCapability,
  normalizeHealthServerInfo,
  readServerInfo,
} from '../scripts/utils/serverInfo.mjs';
import {
  PRODUCT_NAME,
  PROJECT_ID,
  PROJECT_NAME,
  readMakeClientProjectIdentity,
} from '../scripts/sync-project-metadata.mjs';
import { MAKE_CONFIG_RELATIVE_PATH } from './utils/makeConstants';

const DEFAULT_ADMIN_ORIGIN = 'http://localhost:53817';
const STATUS_ROUTE = '/__axhub/make-server/status';
const START_ROUTE = '/__axhub/make-server/start';
const DEFAULT_ADMIN_HEALTH_TIMEOUT_MS = 1200;
const DEFAULT_ADMIN_READY_TIMEOUT_MS = 60000;
const DEFAULT_ADMIN_READY_POLL_INTERVAL_MS = 500;
const SKIP_AUTO_START_SERVER_ENV = 'AXHUB_MAKE_SKIP_AUTO_START_SERVER';

type RegisteredProject = {
  projectId: string;
  projectName: string;
};

type MakeServerStartCommand = {
  command: string;
  args: string[];
  label: string;
};

type MakeServerStatusPayload = {
  ready: boolean;
  starting: boolean;
  adminOrigin: string | null;
  adminUrl: string | null;
  projectId: string;
  projectName: string;
  error?: string;
};

let startPromise: Promise<MakeServerStatusPayload> | null = null;

type ReusableAdminOriginOptions = {
  healthTimeoutMs?: number;
};

type MakeServerStartOptions = {
  runtimeOrigin?: string;
  adminReadyTimeoutMs?: number;
  pollIntervalMs?: number;
  healthTimeoutMs?: number;
};

type AdminOriginWaitOptions = ReusableAdminOriginOptions & {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

function findWorkspaceRoot(projectRoot: string): string | null {
  let current = path.resolve(projectRoot);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveLocalMakeServerCli(projectRoot: string): string | null {
  const workspaceRoot = findWorkspaceRoot(projectRoot);
  if (!workspaceRoot) {
    return null;
  }
  const candidates = [
    path.join(workspaceRoot, 'bin/cli.mjs'),
    path.join(workspaceRoot, 'apps/make-server/bin/cli.mjs'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function normalizeOrigin(origin: unknown): string | null {
  if (typeof origin !== 'string') {
    return null;
  }
  const trimmed = origin.trim().replace(/\/+$/u, '');
  return trimmed || null;
}

export function resolveMakeServerStartCommand(
  projectRoot: string,
  options: MakeServerStartOptions = {},
): MakeServerStartCommand {
  const runtimeOrigin = normalizeOrigin(options.runtimeOrigin);
  const cliPath = resolveLocalMakeServerCli(projectRoot);
  if (cliPath) {
    const args = [cliPath, projectRoot, '--dev', '--no-open'];
    if (runtimeOrigin) {
      args.push('--runtime-origin', runtimeOrigin);
    }
    return {
      command: process.execPath,
      args,
      label: 'local @axhub/make dev',
    };
  }
  const args = ['-y', '@axhub/make@latest', projectRoot, '--no-open'];
  if (runtimeOrigin) {
    args.push('--runtime-origin', runtimeOrigin);
  }
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args,
    label: 'npx -y @axhub/make@latest',
  };
}

export function createAdminUrl(adminOrigin: string, projectId?: string): string {
  const url = new URL('/', adminOrigin);
  const normalizedProjectId = projectId?.trim();
  if (normalizedProjectId) {
    url.searchParams.set('projectId', normalizedProjectId);
  }
  return url.toString();
}

export async function getReusableAdminOrigin(
  projectRoot: string,
  options: ReusableAdminOriginOptions = {},
): Promise<string | null> {
  const info = readServerInfo(projectRoot, 'admin');
  const candidates = [
    info?.origin,
    DEFAULT_ADMIN_ORIGIN,
  ].filter((origin, index, all): origin is string => Boolean(origin) && all.indexOf(origin) === index);

  for (const origin of candidates) {
    const health = await fetchHealth(origin, options.healthTimeoutMs ?? DEFAULT_ADMIN_HEALTH_TIMEOUT_MS);
    if (normalizeHealthServerInfo(health)?.origin && isReusableAdminHealth(health)) {
      return origin;
    }
  }
  return null;
}

function isReusableAdminHealth(health: unknown): boolean {
  if (!health || typeof health !== 'object') {
    return false;
  }
  const payload = health as { role?: unknown };
  if (payload.role !== 'admin') {
    return false;
  }
  return hasAdminCapability(health, 'reviewReports');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForAdminOrigin(
  projectRoot: string,
  options: AdminOriginWaitOptions = {},
): Promise<string | null> {
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_ADMIN_READY_TIMEOUT_MS);
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? DEFAULT_ADMIN_READY_POLL_INTERVAL_MS);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const origin = await getReusableAdminOrigin(projectRoot, options);
    if (origin) {
      return origin;
    }
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      break;
    }
    await sleep(Math.min(pollIntervalMs, timeoutMs - elapsedMs));
  }
  return null;
}

export async function registerOfficialProject(projectRoot: string, adminOrigin: string): Promise<RegisteredProject> {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const metadataPath = path.join(resolvedProjectRoot, '.axhub/make/project.json');
  const identity = readMakeClientProjectIdentity(resolvedProjectRoot);
  const body = {
    id: identity.id,
    name: identity.name,
    root: resolvedProjectRoot,
    metadataPath,
  };

  const projectsResponse = await fetch(new URL('/api/projects', adminOrigin), {
    headers: { accept: 'application/json' },
  });
  if (!projectsResponse.ok) {
    throw new Error(`GET /api/projects failed with ${projectsResponse.status}`);
  }
  const registry = await projectsResponse.json() as any;
  const existing = Array.isArray(registry.projects)
    ? registry.projects.find((project: any) => project.id === identity.id || path.resolve(project.root || '') === resolvedProjectRoot)
    : null;

  if (existing) {
    const response = await fetch(new URL(`/api/projects/${encodeURIComponent(existing.id)}`, adminOrigin), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: identity.name,
        root: resolvedProjectRoot,
        metadataPath,
      }),
    });
    if (!response.ok) {
      throw new Error(`PATCH /api/projects/${existing.id} failed with ${response.status}`);
    }
  } else {
    const response = await fetch(new URL('/api/projects/make/register-existing', adminOrigin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: resolvedProjectRoot }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`POST /api/projects/make/register-existing failed with ${response.status}`);
    }
  }

  return {
    projectId: existing?.id || identity.id,
    projectName: identity.name,
  };
}

function createStatusPayload(adminOrigin: string | null, registration?: RegisteredProject): MakeServerStatusPayload {
  const projectId = registration?.projectId || PROJECT_ID;
  return {
    ready: Boolean(adminOrigin),
    starting: Boolean(startPromise),
    adminOrigin,
    adminUrl: adminOrigin ? createAdminUrl(adminOrigin, projectId) : null,
    projectId,
    projectName: registration?.projectName || PROJECT_NAME,
  };
}

async function getRegisteredMakeServerStatus(
  projectRoot: string,
  options: MakeServerStartOptions = {},
): Promise<MakeServerStatusPayload> {
  if (startPromise) {
    return {
      ...createStatusPayload(null),
      starting: true,
    };
  }

  const adminOrigin = await getReusableAdminOrigin(projectRoot, {
    healthTimeoutMs: options.healthTimeoutMs,
  });
  if (!adminOrigin) {
    return createStatusPayload(null);
  }

  const registration = await registerOfficialProject(projectRoot, adminOrigin);
  return createStatusPayload(adminOrigin, registration);
}

function spawnMakeServer(projectRoot: string, options: MakeServerStartOptions = {}): Promise<void> {
  const startCommand = resolveMakeServerStartCommand(projectRoot, options);
  return new Promise((resolve, reject) => {
    const child = spawn(startCommand.command, startCommand.args, {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      console.log(`🚀 Starting Axhub Make server via ${startCommand.label}...`);
      resolve();
    });
  });
}

export async function startOrReuseMakeServer(
  projectRoot: string,
  options: MakeServerStartOptions = {},
): Promise<MakeServerStatusPayload> {
  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    try {
      const reuseOptions = {
        healthTimeoutMs: options.healthTimeoutMs,
      };
      const reusableOrigin = await getReusableAdminOrigin(projectRoot, reuseOptions);
      if (reusableOrigin) {
        const registration = await registerOfficialProject(projectRoot, reusableOrigin);
        return createStatusPayload(reusableOrigin, registration);
      }

      await spawnMakeServer(projectRoot, options);
      const adminOrigin = await waitForAdminOrigin(projectRoot, {
        ...reuseOptions,
        timeoutMs: options.adminReadyTimeoutMs,
        pollIntervalMs: options.pollIntervalMs,
      });
      if (!adminOrigin) {
        return {
          ...createStatusPayload(null),
          error: `Started but did not become ready in time. Open make-server and register ${metadataPathForLog(projectRoot)} manually if needed.`,
        };
      }

      const registration = await registerOfficialProject(projectRoot, adminOrigin);
      return createStatusPayload(adminOrigin, registration);
    } catch (error: any) {
      return {
        ...createStatusPayload(null),
        error: error?.message || String(error),
      };
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

function sendJson(res: ServerResponse, payload: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function handleMakeServerEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  options: MakeServerStartOptions = {},
): boolean {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === STATUS_ROUTE) {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return true;
    }
    getRegisteredMakeServerStatus(projectRoot, options)
      .then((payload) => sendJson(res, payload))
      .catch((error: any) => sendJson(res, {
        ...createStatusPayload(null),
        error: error?.message || String(error),
      }));
    return true;
  }

  if (url.pathname === START_ROUTE) {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, 405);
      return true;
    }
    startOrReuseMakeServer(projectRoot, options)
      .then((payload) => sendJson(res, payload))
      .catch((error: any) => sendJson(res, {
        ...createStatusPayload(null),
        error: error?.message || String(error),
      }));
    return true;
  }

  return false;
}

function resolveRuntimeOriginFromViteServer(server: any): string | undefined {
  const actualPort = server.httpServer?.address()?.port || server.config.server?.port;
  if (!actualPort) {
    return undefined;
  }

  const configPath = path.resolve(process.cwd(), MAKE_CONFIG_RELATIVE_PATH);
  let displayHost = 'localhost';
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (typeof config?.server?.host === 'string' && config.server.host.trim()) {
        displayHost = config.server.host.trim();
      }
    } catch {
      // Ignore config parse errors and keep default.
    }
  }

  return `http://${displayHost}:${actualPort}`;
}

export function autoStartMakeServerPlugin(): Plugin {
  return {
    name: 'auto-start-make-server',
    configureServer(server: any) {
      const projectRoot = path.resolve(process.cwd());

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (handleMakeServerEndpoint(req, res, projectRoot, {
          runtimeOrigin: resolveRuntimeOriginFromViteServer(server),
        })) {
          return;
        }
        next();
      });

      if (process.env[SKIP_AUTO_START_SERVER_ENV] === '1') {
        return;
      }

      server.httpServer?.once('listening', async () => {
        try {
          const payload = await startOrReuseMakeServer(projectRoot, {
            runtimeOrigin: resolveRuntimeOriginFromViteServer(server),
          });
          if (payload.ready && payload.adminOrigin) {
            console.log(`✅ Axhub Make server ready at ${payload.adminOrigin}`);
            console.log(`✅ Registered ${payload.projectName || 'unnamed project'} in ${PRODUCT_NAME}; admin URL ${payload.adminUrl}`);
            return;
          }
          console.warn(`[make-server] ${payload.error || `Open make-server and register ${metadataPathForLog(projectRoot)} manually if needed.`}`);
        } catch (error: any) {
          console.warn('[make-server] Auto-start failed:', error?.message || error);
        }
      });
    },
  };
}

function metadataPathForLog(projectRoot: string) {
  return path.join(projectRoot, '.axhub/make/project.json');
}
