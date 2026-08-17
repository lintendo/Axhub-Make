import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer as createViteServer, type Plugin, type ViteDevServer } from 'vite';

import { writeServerInfo } from '../scripts/utils/serverInfo.mjs';

import { clientPreviewPlugin, shouldInjectManagementRuntime } from '../vite-plugins/clientPreviewPlugin';

const originalCwd = process.cwd();
const tempRoots: string[] = [];
const viteServers: ViteDevServer[] = [];
const httpServers: http.Server[] = [];
const originalFetch = globalThis.fetch;
const originalMakeHomeDir = process.env.AXHUB_MAKE_HOME_DIR;
const requireFromTest = createRequire(import.meta.url);

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'make-project-preview-route-'));
  tempRoots.push(root);
  writeFile(path.join(root, 'src/prototypes/home/index.tsx'), 'export default function Home() { return null; }\n');
  writeFile(path.join(root, 'src/prototypes/home/style.css'), '.home { color: red; }\n');
  writeFile(path.join(root, 'src/preview-templates/dev-template.html'), [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <title>{{TITLE}}</title>',
    '  <style>html, body, #root { min-height: 100%; margin: 0; }</style>',
    '</head>',
    '<body>',
    '  <div id="root"></div>',
    '  <script type="module">',
    '{{PREVIEW_LOADER}}',
    '  </script>',
    '</body>',
    '</html>',
  ].join('\n'));
  return root;
}

function createTempMakeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'make-project-preview-home-'));
  tempRoots.push(root);
  process.env.AXHUB_MAKE_HOME_DIR = root;
}

function createMockPreviewServer() {
  let middleware: any;
  const server = {
    middlewares: {
      use: vi.fn((handler) => {
        middleware = handler;
      }),
    },
    transformIndexHtml: vi.fn(async (_url: string, html: string) => html),
  };
  return {
    server,
    getMiddleware: () => middleware,
  };
}

async function loadPluginModule(plugin: Plugin, id: string): Promise<string> {
  const load = plugin.load;
  if (!load) {
    return '';
  }
  const result = typeof load === 'function'
    ? await load.call({} as any, id)
    : await load.handler.call({} as any, id);
  return typeof result === 'string' ? result : result?.code || '';
}

beforeEach(() => {
  createTempMakeHome();
});

afterEach(() => {
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
  if (originalMakeHomeDir === undefined) {
    delete process.env.AXHUB_MAKE_HOME_DIR;
  } else {
    process.env.AXHUB_MAKE_HOME_DIR = originalMakeHomeDir;
  }
  vi.restoreAllMocks();
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
  })));
  await Promise.all(viteServers.splice(0).map((server) => server.close()));
});

function stubAdminHealth(origins: string[], options: { acceptSessionToken?: string } = {}) {
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = new URL(String(input));
    const origin = url.origin;
    if (!origins.includes(origin)) {
      throw new Error(`Unexpected health probe for ${origin}`);
    }
    if (url.pathname === '/api/access/validate') {
      if (options.acceptSessionToken) {
        return {
          ok: true,
          json: async () => ({ valid: true, passwordSet: true }),
        } as any;
      }
      return {
        ok: false,
        json: async () => ({ valid: false, passwordSet: true }),
      } as any;
    }
    if (url.pathname === '/api/access/status') {
      return {
        ok: true,
        json: async () => ({ passwordSet: true, sessionTtlMs: 604_800_000, shareTokenTtlMs: 600_000 }),
      } as any;
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        role: 'admin',
        capabilities: {
          reviewReports: true,
        },
        server: {
          pid: origin.endsWith(':5176') ? 5176 : 5174,
          port: Number(origin.split(':').pop()),
          host: 'localhost',
          origin,
          projectRoot: '/tmp/make-server',
          startedAt: '2026-05-08T00:00:00.000Z',
        },
      }),
    } as any;
  }) as any;
}

async function createPreviewViteServer(projectRoot: string) {
  const server = await createViteServer({
    root: path.join(projectRoot, 'src'),
    publicDir: false,
    plugins: [clientPreviewPlugin()],
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    resolve: {
      alias: [
        { find: /^react$/u, replacement: requireFromTest.resolve('react') },
        { find: /^react-dom\/client$/u, replacement: requireFromTest.resolve('react-dom/client') },
      ],
    },
    optimizeDeps: {
      noDiscovery: true,
      exclude: ['react', 'react-dom', 'react-dom/client'],
    },
  });
  viteServers.push(server);
  return server;
}

async function listenPreviewViteServer(server: ViteDevServer) {
  const httpServer = http.createServer((req, res) => {
    server.middlewares(req, res, (error?: unknown) => {
      if (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(error instanceof Error ? error.message : String(error));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });
  httpServers.push(httpServer);
  return new Promise<string>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      const address = httpServer.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP server address'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

describe('client preview routes', () => {
  it('keeps git-version snapshots read-only even when the toolbar flag is manually added', () => {
    expect(shouldInjectManagementRuntime(
      '/prototypes/home?gitVersion=abc123&agentToolbar=host',
    )).toBe(false);
  });

  it('handles local text editing API requests inside the client preview runtime', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const response = await originalFetch(`${origin}/api/text-replace/count`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: 'prototypes/home',
        replacements: [{ searchText: 'Home' }],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      totalCount: 1,
    });
  });

  it('applies LAN preview authorization before local editing API requests', async () => {
    const projectRoot = createFixtureProject();
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as any;
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const response = await originalFetch(`${origin}/api/text-replace/count`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.31.42',
      },
      body: JSON.stringify({
        path: 'prototypes/home',
        replacements: [{ searchText: 'Home' }],
      }),
    });

    expect(response.status).toBe(503);
    expect(await response.text()).toContain('无法连接 Make 管理端');
  });

  it('does not trust a forged local forwarded address from a remote editing client', async () => {
    const projectRoot = createFixtureProject();
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as any;
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }

    const requestBody = JSON.stringify({
      path: 'prototypes/home',
      replacements: [{ searchText: 'Home' }],
    });
    const req = Object.assign(Readable.from([requestBody]), {
      method: 'POST',
      url: '/api/text-replace/count',
      headers: {
        host: '192.168.31.79:51720',
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(requestBody)),
        'x-forwarded-for': '127.0.0.1',
      },
      socket: { remoteAddress: '192.168.31.42' },
    });
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();

    await getMiddleware()(req, res, next);
    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());

    expect(res.statusCode).toBe(503);
    expect(String(res.end.mock.calls[0]?.[0] || '')).toContain('无法连接 Make 管理端');
    expect(next).not.toHaveBeenCalled();
  });

  it('loads persisted hack.css after style.css only while the file exists', async () => {
    const projectRoot = createFixtureProject();
    const hackCssPath = path.join(projectRoot, 'src/prototypes/home/hack.css');
    writeFile(hackCssPath, '.home { color: blue; }\n');
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }

    const renderPreview = async () => {
      const req = { method: 'GET', url: '/prototypes/home', headers: {} };
      const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
      const next = vi.fn();
      await getMiddleware()(req, res, next);
      expect(next).not.toHaveBeenCalled();
      return res.end.mock.calls[0]?.[0] as string;
    };

    const htmlWithHack = await renderPreview();
    expect(htmlWithHack).toContain('href="/prototypes/home/hack.css"');
    expect(htmlWithHack.indexOf('/prototypes/home/style.css'))
      .toBeLessThan(htmlWithHack.indexOf('/prototypes/home/hack.css'));

    fs.unlinkSync(hackCssPath);
    const htmlWithoutHack = await renderPreview();
    expect(htmlWithoutHack).not.toContain('/prototypes/home/hack.css');
  });

  it('uses a stable .html transform URL for virtual prototype previews', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home?agentToolbar=host',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(server.transformIndexHtml).toHaveBeenCalledWith(
      '/prototypes/home/',
      expect.stringContaining('<div id="root"></div>'),
    );
    const transformInput = server.transformIndexHtml.mock.calls[0]?.[1] as string;
    const html = res.end.mock.calls[0]?.[0] as string;
    expect(transformInput).not.toContain('data-axhub-management-runtime');
    expect(html).toContain('data-axhub-management-runtime');
    expect(html).toContain('http://localhost:5174/assets/dev-template-bootstrap.js');
    expect(html).toContain('http://localhost:5174/runtime/quick-edit.js');
    expect(html.match(/data-axhub-management-runtime/g)).toHaveLength(1);
    expect(html).toContain('/prototypes/home/__axhub-preview-loader.js');
    expect(html.indexOf('data-axhub-management-runtime')).toBeLessThan(html.indexOf('data-axhub-preview-loader'));
    expect(html).not.toMatch(/<script\b[^>]*src="http:\/\/localhost:5174\/runtime\/quick-edit\.js"/u);
    expect(html).not.toMatch(/<script\b[^>]*src="http:\/\/localhost:5174\/assets\/dev-template-bootstrap\.js"/u);
    expect(html).not.toContain('import PreviewComponent');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not inject a default admin origin that lacks review report APIs', async () => {
    const projectRoot = createFixtureProject();
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('http://localhost:53817');
      expect(url.pathname).toBe('/api/health');
      return {
        ok: true,
        json: async () => ({
          ok: true,
          role: 'admin',
          devMode: true,
          server: {
            pid: 12345,
            port: 53817,
            host: 'localhost',
            origin: 'http://localhost:53817',
            projectRoot,
            startedAt: '2026-05-08T00:00:00.000Z',
          },
        }),
      } as any;
    }) as any;
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home?agentToolbar=host',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = res.end.mock.calls[0]?.[0] as string;
    expect(html).not.toContain('http://localhost:53817/assets/dev-template-bootstrap.js');
    expect(html).not.toContain('http://localhost:53817/runtime/quick-edit.js');
    expect(next).not.toHaveBeenCalled();
  });

  it('uses a stable preview loader module script URL instead of Vite HTML proxy routing', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);
    stubAdminHealth(['http://localhost:5174', origin]);

    const response = await originalFetch(`${origin}/prototypes/home?projectId=make-project&agentToolbar=host`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<script type="module" data-axhub-preview-loader src="/prototypes/home/__axhub-preview-loader.js?projectId=make-project"></script>');
    expect(html.match(/data-axhub-management-runtime/g)).toHaveLength(1);
    expect(html).not.toContain('html-proxy');
  });

  it('exchanges axhubAccessToken for a client preview cookie and removes the token from the URL', async () => {
    const projectRoot = createFixtureProject();
    const adminOrigin = 'http://localhost:5174';
    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: any, init?: RequestInit) => {
      const url = new URL(String(input));
      fetchCalls.push(`${init?.method || 'GET'} ${url.pathname}`);
      if (url.origin !== adminOrigin) {
        throw new Error(`Unexpected admin access call for ${url.origin}`);
      }
      if (url.pathname === '/api/health') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            role: 'admin',
            capabilities: { reviewReports: true },
            server: {
              pid: 5174,
              port: 5174,
              host: 'localhost',
              origin: adminOrigin,
              projectRoot,
              startedAt: '2026-05-08T00:00:00.000Z',
            },
          }),
        } as any;
      }
      if (url.pathname === '/api/access/exchange') {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body).toMatchObject({ token: 'share-token' });
        return {
          ok: true,
          json: async () => ({
            success: true,
            sessionToken: 'client-session-token',
            expiresAt: '2026-05-08T00:10:00.000Z',
          }),
        } as any;
      }
      throw new Error(`Unexpected access path ${url.pathname}`);
    }) as any;
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: adminOrigin,
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const response = await originalFetch(`${origin}/prototypes/home?axhubAccessToken=share-token&projectId=make-project`, {
      redirect: 'manual',
      headers: {
        'x-forwarded-for': '192.168.1.55',
      },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/prototypes/home?projectId=make-project');
    expect(response.headers.get('set-cookie')).toContain('axhub_lan_auth=client-session-token');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(fetchCalls).toContain('POST /api/access/exchange');
  });

  it('treats the machine LAN host as local client preview access', async () => {
    const projectRoot = createFixtureProject();
    const fetchCalls: string[] = [];
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      en0: [{
        address: '192.168.31.79',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: false,
        cidr: '192.168.31.79/24',
      }],
    } as any);
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = new URL(String(input));
      fetchCalls.push(url.pathname);
      if (url.pathname.startsWith('/api/access/')) {
        throw new Error('Local LAN host access should not call admin access APIs');
      }
      return {
        ok: false,
        json: async () => null,
      } as any;
    }) as any;
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const response = await originalFetch(`${origin}/prototypes/home`, {
      headers: {
        host: '192.168.31.79:51720',
      },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('/prototypes/home/__axhub-preview-loader.js');
    expect(fetchCalls.filter((pathname) => pathname.startsWith('/api/access/'))).toEqual([]);
  });

  it('blocks non-local client preview access without a token or valid client cookie', async () => {
    const projectRoot = createFixtureProject();
    const adminOrigin = 'http://localhost:5174';
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = new URL(String(input));
      if (url.origin !== adminOrigin) {
        throw new Error(`Unexpected admin access call for ${url.origin}`);
      }
      if (url.pathname === '/api/health') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            role: 'admin',
            capabilities: { reviewReports: true },
            server: {
              pid: 5174,
              port: 5174,
              host: 'localhost',
              origin: adminOrigin,
              projectRoot,
              startedAt: '2026-05-08T00:00:00.000Z',
            },
          }),
        } as any;
      }
      if (url.pathname === '/api/access/status') {
        return {
          ok: true,
          json: async () => ({
            passwordSet: true,
            sessionTtlMs: 604_800_000,
            shareTokenTtlMs: 600_000,
          }),
        } as any;
      }
      throw new Error(`Unexpected access path ${url.pathname}`);
    }) as any;
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: adminOrigin,
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const response = await originalFetch(`${origin}/prototypes/home`, {
      headers: {
        'x-forwarded-for': '192.168.1.55',
      },
    });
    const html = await response.text();

    expect(response.status).toBe(401);
    expect(html).toContain('请从 Make 管理端复制局域网链接或二维码');
  });

  it('applies project LAN preview auth bypass changes without restarting and fails closed', async () => {
    const projectRoot = createFixtureProject();
    const adminOrigin = 'http://localhost:5174';
    const accessCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith('/api/access/')) {
        accessCalls.push(url.pathname);
      }
      if (url.pathname === '/api/health') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            role: 'admin',
            capabilities: { reviewReports: true },
            server: {
              pid: 5174,
              port: 5174,
              host: 'localhost',
              origin: adminOrigin,
              projectRoot,
              startedAt: '2026-05-08T00:00:00.000Z',
            },
          }),
        } as any;
      }
      if (url.pathname === '/api/access/status') {
        return {
          ok: true,
          json: async () => ({ passwordSet: true }),
        } as any;
      }
      throw new Error(`Unexpected access path ${url.pathname}`);
    }) as any;
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: adminOrigin,
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);
    const request = () => originalFetch(`${origin}/prototypes/home`, {
      headers: { 'x-forwarded-for': '192.168.1.55' },
    });

    expect((await request()).status).toBe(401);
    writeFile(path.join(projectRoot, '.axhub/make/axhub.config.json'), JSON.stringify({
      server: { skipLanPreviewAuth: true },
    }));
    expect((await request()).status).toBe(200);
    const callsAfterBypass = accessCalls.length;
    writeFile(path.join(projectRoot, '.axhub/make/axhub.config.json'), '{ invalid');
    expect((await request()).status).toBe(401);
    expect(accessCalls.length).toBeGreaterThan(callsAfterBypass);
  });

  it('keeps the preview Vite client script free of project query params', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);
    stubAdminHealth(['http://localhost:5174', origin]);

    const response = await originalFetch(`${origin}/prototypes/home?projectId=make-project&agentToolbar=host`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<script type="module" src="/@vite/client"></script>');
    expect(html).not.toContain('/@vite/client?projectId=');
  });

  it('installs the React refresh preamble before loading host toolbar React modules', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);
    stubAdminHealth(['http://localhost:5174', origin]);

    const response = await originalFetch(`${origin}/prototypes/home?projectId=make-project&agentToolbar=host`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-axhub-react-refresh-preamble');
    expect(html).toContain('import { injectIntoGlobalHook } from "/@react-refresh";');
    expect(html).toContain('window.$RefreshReg$ = () => {};');
    expect(html.indexOf('data-axhub-react-refresh-preamble')).toBeLessThan(html.indexOf('data-axhub-management-runtime'));
    expect(html).not.toContain('preamble?html-proxy');
  });

  it('keeps projectId on prototype entry imports inside preview loader modules', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);
    stubAdminHealth(['http://localhost:5174', origin]);

    const htmlResponse = await originalFetch(`${origin}/prototypes/home?projectId=make-project&agentToolbar=host`, {
      headers: { accept: 'text/html' },
    });
    const html = await htmlResponse.text();
    const loaderScriptPath = html.match(/src="([^"]*__axhub-preview-loader\.js[^"]*)"/u)?.[1];

    expect(htmlResponse.status).toBe(200);
    expect(loaderScriptPath).toBeTruthy();

    const response = await originalFetch(new URL(loaderScriptPath as string, origin), {
      headers: {
        referer: `${origin}/prototypes/home?projectId=make-project&agentToolbar=host`,
      },
    });
    const moduleCode = await response.text();

    expect(response.status).toBe(200);
    expect(moduleCode).toMatch(/import PreviewComponent from "[^"]*\/prototypes\/home\/index\.tsx\?projectId=make-project";/u);
    expect(moduleCode).toContain('from "/@vite/client"');
    expect(moduleCode).not.toContain('from "/@vite/client?projectId=make-project"');
    expect(moduleCode).not.toMatch(/import PreviewComponent from "[^"]*\/prototypes\/home\/index\.tsx";/u);
    expect(moduleCode).toContain('class AxhubPreviewErrorBoundary extends React.Component');
    expect(moduleCode).toContain('window.axhub?.prototypeRuntime?.reportError');
    expect(moduleCode).toContain('componentStack: errorInfo?.componentStack');
    expect(moduleCode).toContain('React.createElement(AxhubPreviewErrorBoundary');
    expect(moduleCode).toContain("type: 'AXHUB_PREVIEW_UPDATED'");
    expect(moduleCode).toContain("notifyAxhubPreviewUpdated('hmr')");
  });

  it('hides root preview scrollbars without disabling page scroll', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = server.transformIndexHtml.mock.calls[0]?.[1] as string;
    expect(html).toContain('data-axhub-preview-scrollbar-style');
    expect(html).toContain('scrollbar-width: none');
    expect(html).toContain('::-webkit-scrollbar');
    expect(html).toContain('overflow-x: hidden');
    expect(html).not.toContain('overflow: hidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes the current project path into prototype preview config', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = server.transformIndexHtml.mock.calls[0]?.[1] as string;
    const loaderScriptPath = html.match(/src="([^"]*__axhub-preview-loader\.js[^"]*)"/u)?.[1] || '';
    const loaderCode = await loadPluginModule(plugin as Plugin, loaderScriptPath);

    expect(loaderScriptPath).toBe('/prototypes/home/__axhub-preview-loader.js');
    expect(loaderCode).toContain(`projectPath: ${JSON.stringify(process.cwd())}`);
    expect(next).not.toHaveBeenCalled();
  });

  it('loads prototype previews from git version snapshots without opening source files', async () => {
    const projectRoot = createFixtureProject();
    const snapshotDir = path.join(projectRoot, '.git-versions', 'abc12345', 'src', 'prototypes', 'home');
    writeFile(path.join(snapshotDir, 'index.tsx'), 'export default function OldHome() { return null; }\n');
    writeFile(path.join(snapshotDir, 'style.css'), '.old-home { color: blue; }\n');
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home?gitVersion=abc12345',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = server.transformIndexHtml.mock.calls[0]?.[1] as string;
    const loaderScriptPath = html.match(/src="([^"]*__axhub-preview-loader\.js[^"]*)"/u)?.[1] || '';
    const loaderCode = await loadPluginModule(plugin as Plugin, loaderScriptPath);

    expect(loaderScriptPath).toBe('/prototypes/home/__axhub-preview-loader.js?gitVersion=abc12345');
    expect(loaderCode).toContain('import PreviewComponent from "/@fs/');
    expect(loaderCode).toContain('/.git-versions/abc12345/src/prototypes/home/index.tsx');
    expect(loaderCode).not.toContain('import PreviewComponent from "/prototypes/home/index.tsx"');
    expect(html).toContain('href="/prototypes/home/style.css?gitVersion=abc12345"');
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps stable preview loader context for encoded git-version prototype routes', async () => {
    const projectRoot = createFixtureProject();
    const prototypeName = '未命名';
    const gitPath = `src/prototypes/${prototypeName}`;
    const snapshotDir = path.join(projectRoot, '.git-versions', 'abc12345', ...gitPath.split('/'));
    writeFile(path.join(snapshotDir, 'index.tsx'), 'export default function SnapshotPrototype() { return null; }\n');
    writeFile(path.join(snapshotDir, 'style.css'), '.snapshot-prototype { color: blue; }\n');
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: `/prototypes/${encodeURIComponent(prototypeName)}?projectId=make-project&gitVersion=abc12345&gitPath=${encodeURIComponent(gitPath)}`,
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = server.transformIndexHtml.mock.calls[0]?.[1] as string;
    const loaderScriptPath = html.match(/src="([^"]*__axhub-preview-loader\.js[^"]*)"/u)?.[1] || '';
    const loaderCode = await loadPluginModule(plugin as Plugin, loaderScriptPath);

    expect(html).not.toContain('html-proxy');
    expect(loaderScriptPath).toBe('/prototypes/%E6%9C%AA%E5%91%BD%E5%90%8D/__axhub-preview-loader.js?projectId=make-project&gitVersion=abc12345&gitPath=src%2Fprototypes%2F%E6%9C%AA%E5%91%BD%E5%90%8D');
    expect(loaderCode).toContain('import PreviewComponent from "/@fs/');
    expect(loaderCode).toContain('/.git-versions/abc12345/src/prototypes/未命名/index.tsx?projectId=make-project');
    expect(loaderCode).not.toContain('import PreviewComponent from "/prototypes/未命名/index.tsx');
    expect(html).toContain('href="/prototypes/%E6%9C%AA%E5%91%BD%E5%90%8D/style.css?gitVersion=abc12345&gitPath=src%2Fprototypes%2F%E6%9C%AA%E5%91%BD%E5%90%8D"');
    expect(next).not.toHaveBeenCalled();
  });

  it('shows a clean unavailable page instead of falling back to current files when a git-version snapshot entry is missing', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const chunks: Buffer[] = [];
    const req = {
      method: 'GET',
      url: '/prototypes/home?gitVersion=abc12345&gitPath=src%2Fprototypes%2Fhome',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk?: string | Buffer) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = Buffer.concat(chunks).toString('utf8');
    expect(res.statusCode).toBe(404);
    expect(html).toContain('这个历史版本无法预览');
    expect(html).not.toContain('__axhub-preview-loader.js');
    expect(server.transformIndexHtml).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('serves absolute source imports from the git-version snapshot instead of current files', async () => {
    const projectRoot = createFixtureProject();
    const snapshotPrototypeDir = path.join(projectRoot, '.git-versions', 'abc12345', 'src', 'prototypes', 'home');
    const snapshotSharedDir = path.join(projectRoot, '.git-versions', 'abc12345', 'src', 'shared');
    writeFile(
      path.join(snapshotPrototypeDir, 'index.tsx'),
      'import { Badge } from "/src/shared/Badge.tsx";\nexport default function OldHome() { return Badge(); }\n',
    );
    writeFile(path.join(snapshotSharedDir, 'Badge.tsx'), 'export function Badge() { return "snapshot"; }\n');
    writeFile(path.join(projectRoot, 'src', 'shared', 'Badge.tsx'), 'export function Badge() { return "current"; }\n');
    stubAdminHealth(['http://localhost:5174']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const loaderResponse = await originalFetch(`${origin}/prototypes/home/__axhub-preview-loader.js?projectId=make-project&gitVersion=abc12345&gitPath=src%2Fprototypes%2Fhome`);
    const loaderCode = await loaderResponse.text();
    const entryUrl = loaderCode.match(/import PreviewComponent from "([^"]+)"/u)?.[1] || '';
    expect(entryUrl).toContain('/.git-versions/abc12345/src/prototypes/home/index.tsx?projectId=make-project');

    const entryResponse = await originalFetch(new URL(entryUrl, origin), {
      headers: {
        referer: `${origin}/prototypes/home?projectId=make-project&gitVersion=abc12345&gitPath=src%2Fprototypes%2Fhome`,
      },
    });
    const entryCode = await entryResponse.text();

    expect(entryResponse.status).toBe(200);
    expect(entryCode).toContain('/.git-versions/abc12345/src/shared/Badge.tsx');
    expect(entryCode).not.toContain('/src/shared/Badge.tsx";');
  });

  it('uses the embedding admin origin instead of stale stored admin info for runtime injection', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:5176']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: 'localhost',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home?agentToolbar=host',
      headers: {
        referer: 'http://localhost:5176/?projectId=make-project',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = res.end.mock.calls[0]?.[0] as string;
    expect(html).toContain('http://localhost:5176/assets/dev-template-bootstrap.js');
    expect(html).toContain('http://localhost:5176/runtime/quick-edit.js');
    expect(html).not.toContain('http://localhost:5174/runtime/quick-edit.js');
    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to the default admin origin when stored admin info is stale for runtime injection', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:53817']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 61847,
      host: '127.0.0.1',
      origin: 'http://127.0.0.1:61847',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home?projectId=make-project&agentToolbar=host',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = res.end.mock.calls[0]?.[0] as string;
    expect(html).toContain('http://localhost:53817/assets/dev-template-bootstrap.js');
    expect(html).toContain('http://localhost:53817/runtime/quick-edit.js');
    expect(html).not.toContain('http://127.0.0.1:61847/runtime/quick-edit.js');
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the forwarded admin host instead of stale stored admin info for proxied preview runtime injection', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://localhost:53817']);
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 59431,
      host: 'localhost',
      origin: 'http://localhost:59431',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home?projectId=make-project&agentToolbar=host',
      headers: {
        'x-forwarded-host': 'localhost:53817',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = res.end.mock.calls[0]?.[0] as string;
    expect(html).toContain('http://localhost:53817/assets/dev-template-bootstrap.js');
    expect(html).toContain('http://localhost:53817/runtime/quick-edit.js');
    expect(html).not.toContain('http://localhost:59431/runtime/quick-edit.js');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not inject management runtimes into a direct network preview with an admin referer', async () => {
    const projectRoot = createFixtureProject();
    stubAdminHealth(['http://192.168.31.79:5174'], { acceptSessionToken: 'valid-client-session' });
    writeServerInfo(projectRoot, 'admin', {
      pid: 12345,
      port: 5174,
      host: '0.0.0.0',
      origin: 'http://localhost:5174',
      projectRoot,
      startedAt: '2026-05-04T00:00:00.000Z',
    });
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home',
      headers: {
        host: '192.168.31.79:51720',
        cookie: 'axhub_lan_auth=valid-client-session',
        referer: 'http://192.168.31.79:5174/?projectId=make-project',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    const html = res.end.mock.calls[0]?.[0] as string;
    expect(html).not.toContain('data-axhub-management-runtime');
    expect(html).not.toContain('/assets/dev-template-bootstrap.js');
    expect(html).not.toContain('/runtime/quick-edit.js');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not serve prototype spec or PRD documents from the preview route', async () => {
    const projectRoot = createFixtureProject();
    writeFile(path.join(projectRoot, 'src/prototypes/home/prd.md'), '# Legacy PRD\n');
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/spec',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
    expect(server.transformIndexHtml).not.toHaveBeenCalled();
  });

  it('lets Vite serve HTML proxy module requests for virtual preview pages', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/@id/__x00__/prototypes/home/index.html?html-proxy&index=0.js',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
    expect(server.transformIndexHtml).not.toHaveBeenCalled();
  });

  it('serves generated preview loader module code through a real Vite middleware stack', async () => {
    const projectRoot = createFixtureProject();
    writeFile(path.join(projectRoot, 'src/prototypes/未命名/index.tsx'), 'export default function Demo() { return null; }\n');
    writeFile(path.join(projectRoot, 'src/prototypes/未命名/index.html'), '<div>stale converter html</div>\n');
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const htmlResponse = await fetch(`${origin}/prototypes/${encodeURIComponent('未命名')}`, {
      headers: { accept: 'text/html' },
    });
    const html = await htmlResponse.text();
    const loaderScriptPath = html.match(/src="([^"]*__axhub-preview-loader\.js[^"]*)"/u)?.[1];

    expect(htmlResponse.status).toBe(200);
    expect(loaderScriptPath).toBeTruthy();

    const proxyResponse = await fetch(new URL(loaderScriptPath as string, origin), {
      headers: { accept: '*/*' },
    });
    const proxyCode = await proxyResponse.text();

    expect(proxyResponse.status).toBe(200);
    expect(proxyResponse.headers.get('content-type')).toContain('javascript');
    expect(proxyCode).toContain('import PreviewComponent from');
    expect(proxyCode).toContain('index.tsx');
    expect(proxyCode).toContain('path: "/prototypes/未命名"');
  });

  it('does not mount annotation runtime from the preview loader when annotation source exists', async () => {
    const projectRoot = createFixtureProject();
    writeFile(path.join(projectRoot, 'src/prototypes/home/annotation-source.json'), `${JSON.stringify({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
    }, null, 2)}\n`);
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();

    const loaderCode = await loadPluginModule(plugin, '/prototypes/home/__axhub-preview-loader.js');

    expect(loaderCode).toContain('import PreviewComponent from');
    expect(loaderCode).not.toContain("import { createAnnotationViewer } from '@axhub/annotation';");
    expect(loaderCode).not.toContain('annotationSourceDocument from');
    expect(loaderCode).not.toContain('createAnnotationViewer({');
    expect(loaderCode).not.toContain('__AXHUB_MAKE_ANNOTATION_RUNTIME__');
    expect(loaderCode).not.toContain('__AXHUB_ANNOTATION_RUNTIME__');
    expect(loaderCode).not.toContain('annotationVersion');
  });

  it('serves source preview HTML assets without Vite dev script injection', async () => {
    const projectRoot = createFixtureProject();
    const previewHtml = '<!doctype html><html><head><title>xAI</title></head><body><h1>Source Preview</h1></body></html>\n';
    writeFile(path.join(projectRoot, 'src/themes/xai/index.tsx'), 'export default function Theme() { return null; }\n');
    writeFile(path.join(projectRoot, 'src/themes/xai/assets/preview.html'), previewHtml);
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const response = await fetch(`${origin}/themes/xai/assets/preview.html`, {
      headers: { accept: 'text/html' },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toBe(previewHtml);
    expect(html).not.toContain('/@vite/client');
    expect(html).not.toContain('/@react-refresh');
  });

  it('serves nested index HTML assets without treating them as preview entry routes', async () => {
    const projectRoot = createFixtureProject();
    const assetHtml = '<!doctype html><html><body><h1>Nested HTML Asset</h1></body></html>\n';
    writeFile(path.join(projectRoot, 'src/themes/xai/index.tsx'), 'export default function Theme() { return null; }\n');
    writeFile(path.join(projectRoot, 'src/themes/xai/assets/index.html'), assetHtml);
    process.chdir(projectRoot);
    const server = await createPreviewViteServer(projectRoot);
    const origin = await listenPreviewViteServer(server);

    const response = await fetch(`${origin}/themes/xai/assets/index.html`, {
      headers: { accept: 'text/html' },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toBe(assetHtml);
    expect(html).not.toContain('/@vite/client');
    expect(html).not.toContain('/@react-refresh');
  });

  it('lets Vite transform CSS imported by prototype modules', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/style.css',
      headers: {
        accept: '*/*',
        'sec-fetch-dest': 'script',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('lets Vite transform CSS imports when LAN browsers omit sec-fetch-dest', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/style.css',
      headers: {
        accept: '*/*',
        origin: 'http://192.168.31.79:51720',
        referer: 'http://192.168.31.79:51720/prototypes/home/index.tsx',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('lets Vite transform CSS imports when LAN browsers send the page as referer', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/style.css',
      headers: {
        accept: '*/*',
        origin: 'http://192.168.31.79:51720',
        referer: 'http://192.168.31.79:51720/prototypes/home',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('lets Vite transform CSS imports when LAN browsers omit origin and sec-fetch-dest', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/style.css',
      headers: {
        accept: '*/*',
        referer: 'http://192.168.31.79:51720/prototypes/home',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('lets Vite transform static asset imports requested by prototype modules', async () => {
    const projectRoot = createFixtureProject();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const assetPath = path.join(projectRoot, 'src/prototypes/home/assets/hero.png');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, pngBytes);
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/assets/hero.png?import',
      headers: {
        accept: '*/*',
        referer: 'http://localhost:51720/prototypes/home/index.tsx',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('serves prototype CSS assets as stylesheets for direct link requests', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/style.css',
      headers: {
        accept: 'text/css,*/*;q=0.1',
      },
    };
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk?: Buffer | string) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/css; charset=utf-8');
    expect(Buffer.concat(chunks).toString('utf8')).toBe('.home { color: red; }\n');
    expect(next).not.toHaveBeenCalled();
  });

  it('lets Vite transform direct stylesheet requests that contain Tailwind imports', async () => {
    const projectRoot = createFixtureProject();
    writeFile(path.join(projectRoot, 'src/prototypes/home/style.css'), '@import "tailwindcss";\n.home { color: red; }\n');
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/style.css',
      headers: {
        accept: 'text/css,*/*;q=0.1',
      },
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('does not serve removed prototype canvas-assets routes', async () => {
    const projectRoot = createFixtureProject();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const screenshotPath = path.join(projectRoot, 'src/prototypes/home/canvas-assets/screenshot.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, pngBytes);
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/canvas-assets/screenshot.png?v=123',
      headers: {},
    };
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk?: Buffer | string) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
    expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(0));
  });

  it('does not serve removed element screenshot canvas-assets routes', async () => {
    const projectRoot = createFixtureProject();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const screenshotPath = path.join(projectRoot, 'src/prototypes/home/canvas-assets/embed-embed-1.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, pngBytes);
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/canvas-assets/embed-embed-1.png?v=123',
      headers: {},
    };
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk?: Buffer | string) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
    expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(0));
  });

  it('does not serve removed page screenshot canvas-assets routes', async () => {
    const projectRoot = createFixtureProject();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const screenshotPath = path.join(projectRoot, 'src/prototypes/home/canvas-assets/page-order-detail.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, pngBytes);
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/canvas-assets/page-order-detail.png?v=123',
      headers: {},
    };
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk?: Buffer | string) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
    expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(0));
  });

  it('serves safely nested static assets from a prototype directory', async () => {
    const projectRoot = createFixtureProject();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const assetPath = path.join(projectRoot, 'src/prototypes/home/assets/images/u1.png');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, pngBytes);
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/assets/images/u1.png?v=123',
      headers: {},
    };
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk?: Buffer | string) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(Buffer.concat(chunks)).toEqual(pngBytes);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not serve nested static assets outside the prototype directory', async () => {
    const projectRoot = createFixtureProject();
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/assets/../index.tsx',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('rejects encoded path separators before resolving static asset routes', async () => {
    const projectRoot = createFixtureProject();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const assetPath = path.join(projectRoot, 'src/prototypes/home/assets/images/u1.png');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, pngBytes);
    process.chdir(projectRoot);
    const plugin = clientPreviewPlugin();
    const { server, getMiddleware } = createMockPreviewServer();
    const req = {
      method: 'GET',
      url: '/prototypes/home/assets%2Fimages%2Fu1.png',
      headers: {},
    };
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    const configureServer = plugin.configureServer;
    if (typeof configureServer === 'function') {
      await configureServer(server as any);
    } else {
      await configureServer?.handler(server as any);
    }
    await getMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });
});
