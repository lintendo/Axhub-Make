import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getOpenCodeBridgeHub, isOpenCodeBridgeUpgrade } from './opencodeBridge.ts';
import { getCanvasBridgeHub, isCanvasBridgeUpgrade } from './canvasBridge.ts';
import { getPreviewBridgeHub, isPreviewBridgeUpgrade } from './previewBridge.ts';
import {
  createAxhubCanvasMcpToken,
  handleAxhubCanvasMcp,
} from './axhubCanvasMcp.ts';
import {
  createAxhubPreviewMcpToken,
  handleAxhubPreviewMcp,
} from './axhubPreviewMcp.ts';

import {
  checkMakeStateHealth,
  createServerConfigStore,
  createProjectRegistry,
  getServerInfoFilePath,
  getGlobalMakeStateDir,
  type AxhubServerInfo,
  type MakeStateHealthResult,
  normalizeHealthServerInfo,
  readServerInfo,
  resolveComparableProjectRoot,
  isPathInside,
  writeServerInfo,
} from './projectCore/index.ts';

import {
  buildInjectScript,
  handleAdminStatic,
  redirectMissingPlaceholderPrototypeShortLink,
  resolveAdminHtmlTitle,
} from './adminStatic.ts';
import type { AdminStaticOptions } from './adminStatic.ts';
import { DEFAULT_MAKE_SERVER_PORT } from './defaults.ts';
import { closeManagedOpenCodeServers, readManagedOpenCodeServerUrl } from './agentOpen.ts';
import { getLocalIP, getRequestUrl, sendJson } from './http.ts';
import { getMakeClientDevStatus } from './makeClientProject.ts';
import { handleManagementApi } from './managementApi.ts';
import {
  getLanAccessGateDecision,
  handleLanAccessApi,
  handleLanAccessGate,
} from './lanAccessControl.ts';
import type { CommandExecutor } from './managementApi.cloudPublishing.ts';
import type { GitWorkspaceCommandExecutor } from './managementApi.git.ts';
import { releaseListeningProcessesOnPort } from './portOccupancy.ts';
import {
  isRuntimeDevModuleRequest,
  isRuntimeOnlyRoute,
  proxyRuntimeWebSocketUpgrade,
  proxyToRuntime,
  sendRuntimeUnavailableResponse,
} from './runtimeProxy.ts';
import type { ViteDevMiddleware } from './viteDevServer.ts';
import type { DiagnosticLog } from './diagnosticLog.ts';
import { removeOwnedServerInfoFile } from './serverInfoRecord.ts';

export interface StartMakeServerOptions {
  projectRoot: string;
  port?: number;
  host?: string;
  runtimeOrigin?: string;
  adminRoot?: string;
  opencodeWebUiRoot?: string;
  registryPath?: string;
  serverInfoHomeDir?: string;
  devMode?: boolean;
  quiet?: boolean;
  logFile?: string;
  diagnosticLog?: DiagnosticLog;
  axhubOnlineBaseUrl?: string;
  cloudPublishingCommandExecutor?: CommandExecutor;
  gitWorkspaceCommandExecutor?: GitWorkspaceCommandExecutor;
}

export interface RunningMakeServer {
  port: number;
  host: string;
  origin: string;
  close: () => Promise<void>;
}

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const adminViteClientEnvPath = (() => {
  try {
    return fileURLToPath(import.meta.resolve('vite/dist/client/env.mjs'));
  } catch {
    return '';
  }
})();

export interface ResolveDefaultAdminRootOptions {
  serverDir?: string;
  execPath?: string;
  argvPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  exists?: (candidate: string) => boolean;
}

export function resolveDefaultAdminRoot(options: ResolveDefaultAdminRootOptions = {}): string {
  const currentServerDir = options.serverDir || serverDir;
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const exists = options.exists || ((candidate: string) => fs.existsSync(candidate));
  const explicitAdminRoot = env.AXHUB_MAKE_ADMIN_ROOT?.trim();

  if (explicitAdminRoot) {
    return path.resolve(cwd, explicitAdminRoot);
  }

  const candidates = [
    path.resolve(path.dirname(options.execPath || process.execPath), 'admin'),
    path.resolve(currentServerDir, '../admin'),
    path.resolve(currentServerDir, '../../dist/admin'),
    path.resolve(path.dirname(options.argvPath || process.argv[1] || ''), '../dist/admin'),
  ];

  return candidates.find((candidate) => exists(candidate)) || candidates[2];
}

export interface ResolveMakeServerListenHostOptions {
  projectRoot?: string | null;
  explicitHost?: string;
}

export function resolveMakeServerListenHost(options: ResolveMakeServerListenHostOptions): string {
  const explicitHost = String(options.explicitHost || '').trim();
  if (explicitHost) {
    return explicitHost;
  }
  return '0.0.0.0';
}

function resolvePublicOriginHost(host: string): string {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

function listen(server: http.Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function resolveRuntimeOrigin(projectRoot?: string | null, explicitRuntimeOrigin?: string): string | undefined {
  if (explicitRuntimeOrigin) {
    return explicitRuntimeOrigin;
  }
  if (!projectRoot) {
    return undefined;
  }
  return readServerInfo(projectRoot, 'runtime')?.origin;
}

function getProjectIdFromRequestUrl(requestUrl: string): string {
  try {
    return new URL(requestUrl || '/', 'http://localhost').searchParams.get('projectId')?.trim() || '';
  } catch {
    return '';
  }
}

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function getProjectIdFromRequest(req: http.IncomingMessage, requestUrl: string): string {
  const directProjectId = getProjectIdFromRequestUrl(requestUrl);
  if (directProjectId) {
    return directProjectId;
  }
  const referer = getHeaderValue(req.headers.referer || req.headers.referrer).trim();
  return referer ? getProjectIdFromRequestUrl(referer) : '';
}

function getProjectRegistry(registryPath?: string) {
  return createProjectRegistry(
    registryPath ? { registryPath } : undefined,
  );
}

function resolveRequestProject(registryPath?: string, projectId = '') {
  const registry = getProjectRegistry(registryPath);
  return projectId ? registry.getProject(projectId) : registry.getActiveProject();
}

function resolveActiveProjectRoot(registryPath?: string, projectId = ''): string | undefined {
  return resolveRequestProject(registryPath, projectId)?.root;
}

async function resolveActiveProjectRuntimeOrigin(options: {
  registryPath?: string;
  projectId?: string;
  fallbackRuntimeOrigin?: string;
  healthTimeoutMs?: number;
}): Promise<string | undefined> {
  const activeProject = resolveRequestProject(options.registryPath, options.projectId);
  if (!activeProject) {
    return options.fallbackRuntimeOrigin;
  }

  const status = await getMakeClientDevStatus(
    activeProject.id,
    activeProject.root,
    options.healthTimeoutMs === undefined ? {} : { healthTimeoutMs: options.healthTimeoutMs },
  );
  if (status.makeClient) {
    return status.running && status.runtime?.origin
      ? String(status.runtime.origin).trim().replace(/\/+$/u, '')
      : undefined;
  }

  const runtime = readServerInfo(activeProject.root, 'runtime');
  const runtimeOrigin = String(runtime?.origin || '').trim().replace(/\/+$/u, '');
  if (!runtimeOrigin) {
    return options.fallbackRuntimeOrigin;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.healthTimeoutMs ?? 1000);
  try {
    const response = await fetch(new URL('/api/health', runtimeOrigin), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return options.fallbackRuntimeOrigin;
    }
    const health = await response.json();
    const healthRuntime = normalizeHealthServerInfo(health);
    if (
      healthRuntime
      && resolveComparableProjectRoot(healthRuntime.projectRoot) === resolveComparableProjectRoot(activeProject.root)
    ) {
      return runtimeOrigin;
    }
  } catch {
    return options.fallbackRuntimeOrigin;
  } finally {
    clearTimeout(timeout);
  }

  return options.fallbackRuntimeOrigin;
}

async function resolveRuntimeOriginForProxy(options: {
  registryPath?: string;
  projectId?: string;
  currentRuntimeOrigin?: string;
}): Promise<string | undefined> {
  return resolveActiveProjectRuntimeOrigin({
    registryPath: options.registryPath,
    projectId: options.projectId,
    fallbackRuntimeOrigin: resolveRuntimeOrigin(null, options.currentRuntimeOrigin),
  });
}

function decodeOpenCodeDirectoryFromPathname(pathname: string): string {
  const encodedDirectory = pathname.match(/^\/opencode\/([^/?#]+)/u)?.[1] || '';
  if (!encodedDirectory || encodedDirectory === 'assets' || encodedDirectory === 'index.html') {
    return '';
  }

  try {
    return Buffer.from(decodeURIComponent(encodedDirectory), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function resolveOpenCodeServerOrigin(pathname = ''): string {
  const requestTargetPath = decodeOpenCodeDirectoryFromPathname(pathname);
  if (!requestTargetPath) {
    return '';
  }

  return readManagedOpenCodeServerUrl(requestTargetPath);
}

function resolveOpenCodeWebUiRoot(adminRoot: string, explicitRoot?: string): string {
  if (explicitRoot) {
    return explicitRoot;
  }
  const adjacentRoot = path.resolve(path.dirname(adminRoot), 'opencode-webui');
  const nestedRoot = path.resolve(adminRoot, 'opencode-webui');
  return fs.existsSync(path.join(adjacentRoot, 'index.html')) ? adjacentRoot : nestedRoot;
}

export async function startMakeServer(options: StartMakeServerOptions): Promise<RunningMakeServer> {
  const requestedPort = options.port ?? DEFAULT_MAKE_SERVER_PORT;
  const adminRoot = options.adminRoot || resolveDefaultAdminRoot();
  const opencodeWebUiRoot = resolveOpenCodeWebUiRoot(adminRoot, options.opencodeWebUiRoot);
  const devMode = options.devMode === true;
  const lanHost = getLocalIP();
  const serverInfoHomeDir = options.serverInfoHomeDir
    || (options.registryPath ? path.dirname(path.dirname(path.dirname(options.registryPath))) : undefined);
  const serverConfigStore = createServerConfigStore(serverInfoHomeDir ? { homeDir: serverInfoHomeDir } : undefined);
  const startupProjectRoot = path.resolve(options.projectRoot);
  const projectRoot = getGlobalMakeStateDir(serverInfoHomeDir);
  const host = resolveMakeServerListenHost({ explicitHost: options.host });
  let runtimeOrigin = resolveRuntimeOrigin(null, options.runtimeOrigin);
  let origin = '';
  let adminServerInfo: AxhubServerInfo | null = null;
  const canvasBridgeHub = getCanvasBridgeHub();
  const axhubCanvasMcpToken = createAxhubCanvasMcpToken();
  const previewBridgeHub = getPreviewBridgeHub();
  const axhubPreviewMcpToken = createAxhubPreviewMcpToken();
  let makeStateHealth: MakeStateHealthResult = checkMakeStateHealth(
    options.registryPath ? { registryPath: options.registryPath } : { homeDir: serverInfoHomeDir },
  );

  // Vite middleware is only created in dev mode – the import is dynamic so
  // production never loads vite or its dependencies.
  let viteMiddleware: ViteDevMiddleware | null = null;
  let viteMiddlewarePromise: Promise<ViteDevMiddleware> | null = null;

  // The make-server project root (where vite.config.ts lives).
  const makeServerRoot = path.resolve(serverDir, '../..');

  // HTML path for the main admin UI entry.
  const adminIndexHtml = path.resolve(makeServerRoot, 'src/index/index.html');

  function resolveAdminRootHtmlPath(pathname: string): string {
    if (pathname === '/index.html') {
      return '';
    }
    if (!pathname.match(/^\/[^/]+\.html$/u)) {
      return '';
    }
    const htmlPath = path.resolve(adminRoot, pathname.slice(1));
    return isPathInside(adminRoot, htmlPath) ? htmlPath : '';
  }

  async function sendDevAdminHtml(pathname: string, htmlPath: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const currentViteMiddleware = await ensureViteMiddleware();
    const injectScript = buildInjectScript({
      adminRoot,
      projectRoot: startupProjectRoot,
      host,
      lanHost,
      port: Number(new URL(origin).port),
      runtimeOrigin,
      axhubCanvasMcpToken,
      axhubPreviewMcpToken,
    });
    const requestUrl = getRequestUrl(req);
    const htmlUrl = pathname || '/';
    const html = (await currentViteMiddleware.transformHtml(
      htmlUrl,
      htmlPath,
      injectScript,
    )).replace(/\{\{TITLE\}\}/gu, resolveAdminHtmlTitle(path.basename(htmlPath), requestUrl));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
  }

  async function ensureViteMiddleware(): Promise<ViteDevMiddleware> {
    if (viteMiddleware) {
      return viteMiddleware;
    }
    if (!viteMiddlewarePromise) {
      viteMiddlewarePromise = (async () => {
        const { createViteDevMiddleware } = await import('./viteDevServer.ts');
        const middleware = await createViteDevMiddleware(server, makeServerRoot);
        viteMiddleware = middleware;
        if (!options.quiet) {
          console.log('Vite HMR middleware attached (frontend hot reload enabled)');
        }
        return middleware;
      })().catch((error) => {
        viteMiddlewarePromise = null;
        throw error;
      });
    }
    return viteMiddlewarePromise;
  }

  const server = http.createServer((req, res) => {
    (async () => {
      const requestUrl = req.url || '/';
      const pathname = requestUrl.split('?')[0] || '/';
      const requestProjectId = getProjectIdFromRequest(req, requestUrl);
      const activeProjectRoot = resolveActiveProjectRoot(options.registryPath, requestProjectId);
      const runtimeProjectRoot = activeProjectRoot;
      const adminStaticOptions: AdminStaticOptions = {
        adminRoot,
        opencodeWebUiRoot,
        projectRoot: startupProjectRoot,
        activeProjectRoot,
        host,
        lanHost,
        port: Number(new URL(origin).port),
        opencodeServerOrigin: resolveOpenCodeServerOrigin(pathname),
        runtimeOrigin,
        axhubCanvasMcpToken,
        axhubPreviewMcpToken,
      };

      // ── 1. Management API ──
      runtimeOrigin = await resolveRuntimeOriginForProxy({
        registryPath: options.registryPath,
        projectId: requestProjectId,
        currentRuntimeOrigin: runtimeOrigin,
      });
      adminStaticOptions.runtimeOrigin = runtimeOrigin;
      const accessConfigOptions = {
        getConfig: () => serverConfigStore.getConfig({ activeProjectRoot: activeProjectRoot || startupProjectRoot }),
        saveConfig: serverConfigStore.saveConfig,
      };
      if (await handleLanAccessApi(req, res, accessConfigOptions)) {
        return;
      }
      if (handleLanAccessGate(req, res, accessConfigOptions)) {
        return;
      }
      if (redirectMissingPlaceholderPrototypeShortLink(req, res, adminStaticOptions)) {
        return;
      }
      if (await handleAxhubCanvasMcp(req, res, {
        token: axhubCanvasMcpToken,
        bridgeHub: canvasBridgeHub,
      })) {
        return;
      }
      if (await handleAxhubPreviewMcp(req, res, {
        token: axhubPreviewMcpToken,
        bridgeHub: previewBridgeHub,
        captureOutputRoot: path.join(activeProjectRoot || projectRoot, '.local', 'preview-captures'),
      })) {
        return;
      }
      if (await handleManagementApi(req, res, {
        projectRoot,
        startupProjectRoot,
        adminRoot,
        origin,
        runtimeOrigin,
        registryPath: options.registryPath,
        serverInfoHomeDir,
        serverInfo: adminServerInfo || undefined,
        makeStateHealth,
        refreshMakeStateHealth: () => {
          makeStateHealth = checkMakeStateHealth(
            options.registryPath ? { registryPath: options.registryPath } : { homeDir: serverInfoHomeDir },
          );
          return makeStateHealth;
        },
        devMode,
        diagnosticLog: options.diagnosticLog,
        axhubOnlineBaseUrl: options.axhubOnlineBaseUrl,
        cloudPublishingCommandExecutor: options.cloudPublishingCommandExecutor,
        gitWorkspaceCommandExecutor: options.gitWorkspaceCommandExecutor,
      })) {
        return;
      }

      // ── 2. Dev mode: Vite middleware for frontend HMR ──
      if (devMode) {
        if (isRuntimeDevModuleRequest(requestUrl, req.headers, { runtimeProjectRoot, adminViteClientEnvPath })) {
          runtimeOrigin = await resolveRuntimeOriginForProxy({
            registryPath: options.registryPath,
            projectId: requestProjectId,
            currentRuntimeOrigin: runtimeOrigin,
          });
          if (!runtimeOrigin) {
            sendRuntimeUnavailableResponse(res, requestUrl, 503);
            return;
          }
          proxyToRuntime(req, res, runtimeOrigin);
          return;
        }

        // OpenCode and canvas routes are special server-side pages that
        // need their own handling even in dev mode.
        const isServerSideRoute = pathname.startsWith('/opencode')
          || pathname.startsWith('/canvas/');

        if (isServerSideRoute) {
          if (handleAdminStatic(req, res, adminStaticOptions)) {
            return;
          }
        }

        if (pathname.startsWith('/api/')) {
          sendJson(res, { error: 'Not found' }, { status: 404 });
          return;
        }

        const devAdminHtmlPath = resolveAdminRootHtmlPath(pathname);
        if (devAdminHtmlPath && fs.existsSync(devAdminHtmlPath) && fs.statSync(devAdminHtmlPath).isFile()) {
          await sendDevAdminHtml(pathname, devAdminHtmlPath, req, res);
          return;
        }

        // Serve the main admin index HTML with Vite transforms + server vars.
        if (pathname === '/' || pathname === '/index.html') {
          const currentViteMiddleware = await ensureViteMiddleware();
          const injectScript = buildInjectScript({
            adminRoot,
            projectRoot: startupProjectRoot,
            host,
            lanHost,
            port: Number(new URL(origin).port),
            runtimeOrigin,
            axhubCanvasMcpToken,
            axhubPreviewMcpToken,
          });
          const html = await currentViteMiddleware.transformHtml(
            '/src/index/index.html',
            adminIndexHtml,
            injectScript,
          );
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(html);
          return;
        }

        // Everything else (JS modules, CSS, assets, /@vite/client, etc.)
        // is handled by Vite's connect middleware stack.
        const currentViteMiddleware = await ensureViteMiddleware();
        currentViteMiddleware.handle(req, res, () => {
          // If Vite didn't handle it, try serving from dist/admin (pre-built
          // template assets like dev-template-bootstrap.js, spec-template, etc.)
          (async () => {
            if (handleAdminStatic(req, res, adminStaticOptions)) {
              return;
            }

            // Then try runtime proxy.
            if (isRuntimeOnlyRoute(pathname)) {
              runtimeOrigin = await resolveRuntimeOriginForProxy({
                registryPath: options.registryPath,
                projectId: requestProjectId,
                currentRuntimeOrigin: runtimeOrigin,
              });
              if (!runtimeOrigin) {
                sendRuntimeUnavailableResponse(res, requestUrl, 503);
                return;
              }
              proxyToRuntime(req, res, runtimeOrigin);
              return;
            }
            sendJson(res, { error: 'Not found' }, { status: 404 });
          })().catch((error: any) => {
            if (!res.headersSent) {
              sendJson(res, { error: error?.message || 'Internal server error' }, { status: 500 });
            }
          });
        });
        return;
      }

      // ── 3. Production: static admin files ──
      if (isRuntimeDevModuleRequest(requestUrl, req.headers, { runtimeProjectRoot, adminViteClientEnvPath })) {
        runtimeOrigin = await resolveRuntimeOriginForProxy({
          registryPath: options.registryPath,
          projectId: requestProjectId,
          currentRuntimeOrigin: runtimeOrigin,
        });
        if (!runtimeOrigin) {
          sendRuntimeUnavailableResponse(res, requestUrl, 503);
          return;
        }
        proxyToRuntime(req, res, runtimeOrigin);
        return;
      }

      if (handleAdminStatic(req, res, adminStaticOptions)) {
        return;
      }

      // ── 4. Runtime proxy ──
      if (isRuntimeOnlyRoute(pathname)) {
        runtimeOrigin = await resolveRuntimeOriginForProxy({
          registryPath: options.registryPath,
          projectId: requestProjectId,
          currentRuntimeOrigin: runtimeOrigin,
        });
        if (!runtimeOrigin) {
          sendRuntimeUnavailableResponse(res, requestUrl, 503);
          return;
        }
        proxyToRuntime(req, res, runtimeOrigin);
        return;
      }

      sendJson(res, { error: 'Not found' }, { status: 404 });
    })().catch((error: any) => {
      if (!res.headersSent) {
        sendJson(res, { error: error?.message || 'Internal server error' }, { status: 500 });
      }
    });
  });

  // Attach WebSocket upgrade handlers for OpenCode context bridge, Canvas bridge, and Preview bridge.
  // In dev mode, non-bridge upgrades are left open for Vite HMR.
  const bridgeHub = getOpenCodeBridgeHub();
  canvasBridgeHub.configureProjectRoot(projectRoot);
  server.on('upgrade', (req, socket, head) => {
    const requestUrl = req.url || '/';
    const requestProjectId = getProjectIdFromRequest(req, requestUrl);
    const activeProjectRoot = resolveActiveProjectRoot(options.registryPath, requestProjectId);
    const accessDecision = getLanAccessGateDecision(req, {
      getConfig: () => serverConfigStore.getConfig({ activeProjectRoot: activeProjectRoot || startupProjectRoot }),
    });
    if (!accessDecision.allowed) {
      socket.end(`HTTP/1.1 ${accessDecision.status} ${accessDecision.status === 403 ? 'Forbidden' : 'Unauthorized'}\r\n\r\n`);
      return;
    }
    if (isOpenCodeBridgeUpgrade(req)) {
      bridgeHub.handleUpgrade(req, socket, head);
    } else if (isCanvasBridgeUpgrade(req)) {
      canvasBridgeHub.handleUpgrade(req, socket, head);
    } else if (isPreviewBridgeUpgrade(req)) {
      previewBridgeHub.handleUpgrade(req, socket, head);
    } else if (!devMode) {
      (async () => {
        const runtimeWebSocketOrigin = await resolveRuntimeOriginForProxy({
          registryPath: options.registryPath,
          projectId: requestProjectId,
          currentRuntimeOrigin: runtimeOrigin,
        });
        if (!runtimeWebSocketOrigin) {
          socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
          return;
        }
        proxyRuntimeWebSocketUpgrade(req, socket, head, runtimeWebSocketOrigin);
      })().catch(() => {
        socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });
    }
    // In dev mode, unhandled upgrades fall through to Vite's HMR WebSocket.
  });

  if (devMode && requestedPort !== 0) {
    releaseListeningProcessesOnPort(requestedPort);
  }

  const actualPort = await listen(server, requestedPort, host);
  origin = `http://${resolvePublicOriginHost(host)}:${actualPort}`;
  adminServerInfo = {
    pid: process.pid,
    port: actualPort,
    host,
    origin,
    projectRoot,
    startedAt: new Date().toISOString(),
  };
  try {
    adminServerInfo = writeServerInfo(projectRoot, 'admin', adminServerInfo, { homeDir: serverInfoHomeDir });
  } catch (error) {
    if (makeStateHealth.ok) {
      throw error;
    }
  }

  if (lanHost !== 'localhost' && !options.quiet) {
    console.log(`Axhub Make network URL: http://${lanHost}:${actualPort}`);
  }

  return {
    port: actualPort,
    host,
    origin,
    close: async () => {
      closeManagedOpenCodeServers();
      const middlewareToClose = viteMiddleware
        || (viteMiddlewarePromise ? await viteMiddlewarePromise.catch(() => null) : null);
      if (middlewareToClose) {
        await middlewareToClose.close();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
      });
      if (adminServerInfo) {
        removeOwnedServerInfoFile(
          getServerInfoFilePath(projectRoot, 'admin', { homeDir: serverInfoHomeDir }),
          adminServerInfo,
        );
      }
    },
  };
}
