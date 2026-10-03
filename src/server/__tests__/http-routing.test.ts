import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startMakeServer } from '../index.ts';
import { writeMakeClientMarker, writeServerInfo } from '../projectCore/index.ts';

const tempRoots: string[] = [];
const httpServers: http.Server[] = [];

function createTempRoot(prefix = 'axhub-http-routing-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function startRoutingServer(projectRoot: string, options: {
  devMode?: boolean;
  activeProjectId?: string;
  projects?: Array<{
    id: string;
    name: string;
    root: string;
    metadataPath?: string;
  }>;
} = {}) {
  const makeStateDir = path.join(projectRoot, '.axhub', 'make');
  fs.mkdirSync(makeStateDir, { recursive: true });
  const metadataPath = path.join(makeStateDir, 'project.json');
  const now = '2026-05-29T00:00:00.000Z';
  const projects = options.projects || [{
    id: 'routing-project',
    name: 'Routing Project',
    root: projectRoot,
    metadataPath,
  }];
  fs.writeFileSync(metadataPath, JSON.stringify({
    schemaVersion: 1,
    project: {
      id: 'routing-project',
      name: 'Routing Project',
    },
    resources: {
      prototypes: [],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: {
      prototypes: [],
      docs: [],
    },
    orders: {
      themes: [],
      data: [],
      templates: [],
    },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: true,
      axureExport: true,
      localExports: {
        html: false,
        make: false,
      },
      resourceWrites: {
        prototypeCreate: false,
        prototypeUpload: false,
        docCreate: false,
        docImport: false,
        themeCreate: false,
        themeImport: false,
        dataCreate: false,
        dataImport: false,
        templateCreate: false,
        templateDuplicate: false,
      },
    },
    resourceWriteTargets: {},
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(makeStateDir, 'projects.json'), JSON.stringify({
    schemaVersion: 1,
    activeProjectId: options.activeProjectId || projects[0]?.id || null,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      root: project.root,
      metadataPath: project.metadataPath || path.join(project.root, '.axhub', 'make', 'project.json'),
      createdAt: now,
      updatedAt: now,
    })),
  }, null, 2), 'utf8');
  return startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: path.join(makeStateDir, 'projects.json'),
    devMode: options.devMode,
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

afterEach(async () => {
  await Promise.all(httpServers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  })));
});

function listenHttpServer(server: http.Server): Promise<string> {
  httpServers.push(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP server address'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function openWebSocketUpgrade(origin: string, requestPath: string): Promise<string> {
  const url = new URL(origin);
  const socket = net.createConnection({
    host: url.hostname,
    port: Number(url.port),
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out opening websocket upgrade for ${requestPath}`));
    }, 2000);
    let buffer = Buffer.alloc(0);

    socket.on('connect', () => {
      socket.write([
        `GET ${requestPath} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }
      clearTimeout(timer);
      const header = buffer.subarray(0, headerEnd).toString('utf8');
      socket.end();
      resolve(header);
    });

    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe('make-server HTTP routing', () => {
  it('returns stable method errors for server-owned routes', async () => {
    const projectRoot = createTempRoot();
    const server = await startRoutingServer(projectRoot, { devMode: true });

    try {
      const runtime = await fetch(`${server.origin}/runtime/quick-edit.js`, { method: 'POST' });
      expect(runtime.status).toBe(405);
      expect(runtime.headers.get('content-type')).toContain('text/plain');
      expect(await runtime.text()).toBe('Method Not Allowed');
    } finally {
      await server.close();
    }
  });

  it('returns JSON 404 for unknown API routes without falling through to static or runtime handlers', async () => {
    const projectRoot = createTempRoot();
    const server = await startRoutingServer(projectRoot);

    try {
      const response = await fetch(`${server.origin}/api/unknown-route?projectId=routing-project`);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({ error: 'Not found' });
    } finally {
      await server.close();
    }
  });

  it('returns an HTML 503 for direct prototype navigation when no runtime is available', async () => {
    const projectRoot = createTempRoot();
    const server = await startRoutingServer(projectRoot);

    try {
      const response = await fetch(`${server.origin}/prototypes/home`, {
        headers: { accept: 'text/html' },
      });
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(body).toContain('Make 客户端未启动');
      expect(body).toContain('/prototypes/home');
    } finally {
      await server.close();
    }
  });

  it('keeps runtime module requests JSON when no runtime is available', async () => {
    const projectRoot = createTempRoot();
    const server = await startRoutingServer(projectRoot);

    try {
      const response = await fetch(`${server.origin}/@vite/client`);

      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toMatchObject({
        error: 'Runtime unavailable',
        runtime: { available: false },
      });
    } finally {
      await server.close();
    }
  });

  it('proxies dev prototype document routes before admin Vite can serve its HTML fallback', async () => {
    const projectRoot = createTempRoot();
    const runtime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><title>Runtime Preview</title><main>${req.url}</main>`);
    });
    const runtimeOrigin = await listenHttpServer(runtime);
    writeMakeClientMarker(projectRoot, {
      schemaVersion: 1,
      kind: 'axhub-make-client',
      repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
      project: {
        id: 'routing-project',
        name: 'Routing Project',
      },
    });
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(runtimeOrigin).port),
      host: '127.0.0.1',
      origin: runtimeOrigin,
      projectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    const server = await startRoutingServer(projectRoot);

    try {
      const response = await fetch(`${server.origin}/prototypes/touch-and-talk-annotation-demo?projectId=routing-project&agentToolbar=host`, {
        headers: { accept: 'text/html' },
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(body).toContain('<title>Runtime Preview</title>');
      expect(body).toContain('/prototypes/touch-and-talk-annotation-demo?projectId=routing-project&agentToolbar=host');
      expect(body).not.toContain('/src/index/index.tsx');
      expect(body).not.toContain('可以通过 npx -y @axhub/make@latest 启动管理页面。');
    } finally {
      await server.close();
    }
  });

  it('uses the explicit projectId to choose the runtime origin for proxied prototype documents', async () => {
    const selectedProjectRoot = createTempRoot('axhub-http-routing-selected-');
    const activeProjectRoot = createTempRoot('axhub-http-routing-active-');
    const selectedMakeStateDir = path.join(selectedProjectRoot, '.axhub', 'make');
    const activeMakeStateDir = path.join(activeProjectRoot, '.axhub', 'make');
    fs.mkdirSync(selectedMakeStateDir, { recursive: true });
    fs.mkdirSync(activeMakeStateDir, { recursive: true });
    const selectedRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><title>Selected Runtime</title><main>${req.url}</main>`);
    });
    const activeRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><title>Active Runtime</title><main>${req.url}</main>`);
    });
    const selectedRuntimeOrigin = await listenHttpServer(selectedRuntime);
    const activeRuntimeOrigin = await listenHttpServer(activeRuntime);
    for (const [root, projectId] of [[selectedProjectRoot, 'selected-project'], [activeProjectRoot, 'active-project']] as const) {
      writeMakeClientMarker(root, {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: {
          id: projectId,
          name: projectId,
        },
      });
    }
    writeServerInfo(selectedProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(selectedRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: selectedRuntimeOrigin,
      projectRoot: selectedProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    writeServerInfo(activeProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(activeRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: activeRuntimeOrigin,
      projectRoot: activeProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    const server = await startRoutingServer(selectedProjectRoot, {
      devMode: true,
      activeProjectId: 'active-project',
      projects: [
        {
          id: 'selected-project',
          name: 'Selected Project',
          root: selectedProjectRoot,
          metadataPath: path.join(selectedMakeStateDir, 'project.json'),
        },
        {
          id: 'active-project',
          name: 'Active Project',
          root: activeProjectRoot,
          metadataPath: path.join(activeMakeStateDir, 'project.json'),
        },
      ],
    });

    try {
      const response = await fetch(`${server.origin}/prototypes/touch-and-talk-annotation-demo?projectId=selected-project&agentToolbar=host`, {
        headers: { accept: 'text/html' },
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('<title>Selected Runtime</title>');
      expect(body).toContain('/prototypes/touch-and-talk-annotation-demo?projectId=selected-project&agentToolbar=host');
      expect(body).not.toContain('<title>Active Runtime</title>');

      const runtimeWithoutProject = await fetch(
        `${server.origin}/prototypes/touch-and-talk-annotation-demo/index.tsx`,
        { headers: { accept: 'application/javascript' } },
      );
      expect(runtimeWithoutProject.status).toBe(503);
      expect(await runtimeWithoutProject.text()).toContain('Runtime unavailable');
    } finally {
      await server.close();
    }
  });

  it('inherits projectId from prototype document referers for runtime module requests', async () => {
    const selectedProjectRoot = createTempRoot('axhub-http-routing-selected-');
    const activeProjectRoot = createTempRoot('axhub-http-routing-active-');
    const selectedRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.end(`globalThis.runtimeOrigin = "selected";\n// ${req.url}`);
    });
    const activeRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.end(`globalThis.runtimeOrigin = "active";\n// ${req.url}`);
    });
    const selectedRuntimeOrigin = await listenHttpServer(selectedRuntime);
    const activeRuntimeOrigin = await listenHttpServer(activeRuntime);
    for (const [root, projectId] of [[selectedProjectRoot, 'selected-project'], [activeProjectRoot, 'active-project']] as const) {
      writeMakeClientMarker(root, {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: {
          id: projectId,
          name: projectId,
        },
      });
    }
    writeServerInfo(selectedProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(selectedRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: selectedRuntimeOrigin,
      projectRoot: selectedProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    writeServerInfo(activeProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(activeRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: activeRuntimeOrigin,
      projectRoot: activeProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    const server = await startRoutingServer(selectedProjectRoot, {
      devMode: true,
      activeProjectId: 'active-project',
      projects: [
        {
          id: 'selected-project',
          name: 'Selected Project',
          root: selectedProjectRoot,
        },
        {
          id: 'active-project',
          name: 'Active Project',
          root: activeProjectRoot,
        },
      ],
    });

    try {
      const response = await fetch(`${server.origin}/@vite/client`, {
        headers: {
          referer: `${server.origin}/prototypes/touch-and-talk-annotation-demo?projectId=selected-project&agentToolbar=host`,
        },
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('runtimeOrigin = "selected"');
      expect(body).not.toContain('runtimeOrigin = "active"');
    } finally {
      await server.close();
    }
  });

  it('proxies runtime source modules from embedded prototype previews in production routing', async () => {
    const selectedProjectRoot = createTempRoot('axhub-http-routing-selected-');
    const activeProjectRoot = createTempRoot('axhub-http-routing-active-');
    const selectedRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.end(`globalThis.runtimeOrigin = "selected";\n// ${req.url}`);
    });
    const activeRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.end(`globalThis.runtimeOrigin = "active";\n// ${req.url}`);
    });
    const selectedRuntimeOrigin = await listenHttpServer(selectedRuntime);
    const activeRuntimeOrigin = await listenHttpServer(activeRuntime);
    for (const [root, projectId] of [[selectedProjectRoot, 'selected-project'], [activeProjectRoot, 'active-project']] as const) {
      writeMakeClientMarker(root, {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: {
          id: projectId,
          name: projectId,
        },
      });
    }
    writeServerInfo(selectedProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(selectedRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: selectedRuntimeOrigin,
      projectRoot: selectedProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    writeServerInfo(activeProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(activeRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: activeRuntimeOrigin,
      projectRoot: activeProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    const server = await startRoutingServer(selectedProjectRoot, {
      activeProjectId: 'active-project',
      projects: [
        {
          id: 'selected-project',
          name: 'Selected Project',
          root: selectedProjectRoot,
        },
        {
          id: 'active-project',
          name: 'Active Project',
          root: activeProjectRoot,
        },
      ],
    });

    try {
      const runtimeModulePaths = [
        '/common/useHashPage.ts',
        '/hooks/use-mobile.ts',
        '/lib/utils.ts',
        '/types/index.ts',
        '/styles/globals.css',
        '/public/card.glb',
      ];

      for (const modulePath of runtimeModulePaths) {
        const response = await fetch(`${server.origin}${modulePath}?projectId=selected-project`, {
          headers: {
            referer: `${server.origin}/prototypes/beginner-guide?projectId=selected-project&agentToolbar=host#page=advanced-guide`,
          },
        });
        const body = await response.text();

        expect(response.status, modulePath).toBe(200);
        expect(body, modulePath).toContain('runtimeOrigin = "selected"');
        expect(body, modulePath).toContain(`${modulePath}?projectId=selected-project`);
        expect(body, modulePath).not.toContain('runtimeOrigin = "active"');
      }
    } finally {
      await server.close();
    }
  });

  it('adds projectId to proxied runtime module imports so nested dependencies keep project context', async () => {
    const selectedProjectRoot = createTempRoot('axhub-http-routing-selected-');
    const activeProjectRoot = createTempRoot('axhub-http-routing-active-');
    const selectedRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end([
        'import { createHotContext } from "/@vite/client";',
        'import * as RefreshRuntime from "/@react-refresh";',
        'import React from "/@fs/workspace/selected/node_modules/react.js";',
        'import "/common/useHashPage.ts";',
        `export const requestUrl = ${JSON.stringify(req.url)};`,
      ].join('\n'));
    });
    const activeRuntime = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><title>Active Runtime</title>');
    });
    const selectedRuntimeOrigin = await listenHttpServer(selectedRuntime);
    const activeRuntimeOrigin = await listenHttpServer(activeRuntime);
    for (const [root, projectId] of [[selectedProjectRoot, 'selected-project'], [activeProjectRoot, 'active-project']] as const) {
      writeMakeClientMarker(root, {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: {
          id: projectId,
          name: projectId,
        },
      });
    }
    writeServerInfo(selectedProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(selectedRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: selectedRuntimeOrigin,
      projectRoot: selectedProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    writeServerInfo(activeProjectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(activeRuntimeOrigin).port),
      host: '127.0.0.1',
      origin: activeRuntimeOrigin,
      projectRoot: activeProjectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    const server = await startRoutingServer(selectedProjectRoot, {
      devMode: true,
      activeProjectId: 'active-project',
      projects: [
        {
          id: 'selected-project',
          name: 'Selected Project',
          root: selectedProjectRoot,
        },
        {
          id: 'active-project',
          name: 'Active Project',
          root: activeProjectRoot,
        },
      ],
    });

    try {
      const response = await fetch(`${server.origin}/prototypes/home/index.tsx?projectId=selected-project`, {
        headers: {
          referer: `${server.origin}/@id/__x00__/prototypes/home/index.html?html-proxy&index=0.js`,
        },
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('import { createHotContext } from "/@vite/client";');
      expect(body).not.toContain('/@vite/client?projectId=');
      expect(body).toContain('import * as RefreshRuntime from "/@react-refresh";');
      expect(body).toContain('import React from "/@fs/workspace/selected/node_modules/react.js?projectId=selected-project";');
      expect(body).toContain('import "/common/useHashPage.ts?projectId=selected-project";');
      expect(body).toContain('requestUrl = "/prototypes/home/index.tsx?projectId=selected-project"');
    } finally {
      await server.close();
    }
  });

  it('proxies runtime websocket upgrades through production routing', async () => {
    const projectRoot = createTempRoot();
    const runtime = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end('not found');
    });
    runtime.on('upgrade', (req, socket) => {
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
        `X-Runtime-Path: ${req.url || ''}`,
        '',
        '',
      ].join('\r\n'));
      socket.end();
    });
    const runtimeOrigin = await listenHttpServer(runtime);
    writeMakeClientMarker(projectRoot, {
      schemaVersion: 1,
      kind: 'axhub-make-client',
      repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
      project: {
        id: 'routing-project',
        name: 'Routing Project',
      },
    });
    writeServerInfo(projectRoot, 'runtime', {
      pid: process.pid,
      port: Number(new URL(runtimeOrigin).port),
      host: '127.0.0.1',
      origin: runtimeOrigin,
      projectRoot,
      startedAt: '2026-05-29T00:00:00.000Z',
    });
    const server = await startRoutingServer(projectRoot);

    try {
      const header = await openWebSocketUpgrade(server.origin, '/?projectId=routing-project&token=vite-hmr');

      expect(header).toContain('HTTP/1.1 101 Switching Protocols');
      expect(header).toContain('X-Runtime-Path: /?projectId=routing-project&token=vite-hmr');
    } finally {
      await server.close();
    }
  });
});
