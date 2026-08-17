import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { getProjectMetadataPath, writeServerInfo } from '../projectCore/index.ts';

import { handleAdminStatic } from '../adminStatic.ts';
import { buildInjectScript } from '../adminStatic.ts';
import { startMakeServer } from '../index.ts';

const tempRoots: string[] = [];

function createTempRoot(prefix = 'axhub-admin-static-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath: string, value: unknown) {
  writeFile(filePath, JSON.stringify(value, null, 2));
}

function writePrototype(projectRoot: string, name: string, options: { updatedAt?: Date } = {}) {
  const prototypeDir = path.join(projectRoot, 'src/prototypes', name);
  writeFile(path.join(prototypeDir, 'index.tsx'), 'export default function Page() { return null; }');
  if (options.updatedAt) {
    fs.utimesSync(prototypeDir, options.updatedAt, options.updatedAt);
  }
}

function writeProjectMetadata(projectRoot: string, prototypes: Array<{ id: string; name?: string; updatedAt?: string }>) {
  writeJson(getProjectMetadataPath(projectRoot), {
    schemaVersion: 1,
    project: { id: 'make14', name: 'Make 14' },
    resources: {
      prototypes: prototypes.map((prototype) => ({
        id: prototype.id,
        name: prototype.name || prototype.id,
        title: prototype.name || prototype.id,
        clientUrl: `/prototypes/${prototype.name || prototype.id}`,
        updatedAt: prototype.updatedAt,
      })),
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: { prototypes: prototypes.map((prototype) => prototype.id), docs: [] },
    orders: { themes: [], data: [], templates: [] },
    capabilities: { quickEdit: true, figmaExport: false, axureExport: false, multiDevicePreview: true },
  });
}

function createRequest(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return {
    url,
    headers: {
      host: 'localhost',
      ...headers,
    },
  } as IncomingMessage;
}

function createResponse() {
  const chunks: Buffer[] = [];
  const headers = new Map<string, string>();
  const response = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  }) as ServerResponse & Writable;

  response.statusCode = 200;
  response.setHeader = function setHeader(name: string, value: string | number | readonly string[]) {
    headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value));
    return response;
  };
  response.getHeader = function getHeader(name: string) {
    return headers.get(name.toLowerCase());
  };
  response.hasHeader = function hasHeader(name: string) {
    return headers.has(name.toLowerCase());
  };
  response.removeHeader = function removeHeader(name: string) {
    headers.delete(name.toLowerCase());
  };
  const end = response.end.bind(response);
  response.end = function endResponse(
    chunk?: string | Buffer | Uint8Array,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void,
  ) {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    return end(undefined, encoding, done);
  } as ServerResponse['end'];

  const waitForFinish = () => response.writableEnded
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
    });

  return {
    response,
    waitForFinish,
    get statusCode() {
      return response.statusCode;
    },
    header(name: string) {
      return headers.get(name.toLowerCase()) || '';
    },
    body() {
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}

async function startAdminStaticServer(projectRoot: string, adminRoot: string) {
  return startMakeServer({
    projectRoot,
    adminRoot,
    host: 'localhost',
    port: 0,
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('make-server admin static assets', () => {
  it('redirects missing untitled prototype short links to the latest prototype and preserves the source p', () => {
    const projectRoot = createTempRoot('axhub-admin-placeholder-project-');
    const adminRoot = createTempRoot('axhub-admin-placeholder-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writePrototype(projectRoot, 'older');
    writePrototype(projectRoot, 'latest');
    writeProjectMetadata(projectRoot, [
      { id: 'older', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'latest', updatedAt: '2026-06-01T00:00:00.000Z' },
    ]);

    const redirect = createResponse();
    expect(handleAdminStatic(
      createRequest('/?projectId=make14&p=untitled-5&v=canvas'),
      redirect.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(true);

    expect(redirect.statusCode).toBe(302);
    expect(redirect.header('location')).toBe('/?projectId=make14&p=latest&v=canvas&fromP=untitled-5');
  });

  it('injects preview and canvas MCP tokens as transient Make runtime globals', () => {
    const script = buildInjectScript({
      adminRoot: '/tmp/admin',
      projectRoot: '/tmp/project',
      host: 'localhost',
      port: 5174,
      axhubCanvasMcpToken: 'secret-token',
      axhubPreviewMcpToken: 'preview-secret-token',
    });

    expect(script).toContain("window.__AXHUB_CANVAS_MCP_TOKEN__ = 'secret-token';");
    expect(script).toContain("window.__AXHUB_CANVAS_MCP_URL__ = '/api/mcp/axhub-canvas';");
    expect(script).toContain("window.__AXHUB_PREVIEW_MCP_TOKEN__ = 'preview-secret-token';");
    expect(script).toContain("window.__AXHUB_PREVIEW_MCP_URL__ = '/api/mcp/axhub-preview';");
    expect(script).toContain("window.__AXHUB_PREVIEW_BRIDGE_WS_URL__ = '/ws/preview-bridge';");
  });

  it('does not redirect existing placeholders, regular missing prototypes, or empty prototype lists', () => {
    const projectRoot = createTempRoot('axhub-admin-placeholder-project-');
    const adminRoot = createTempRoot('axhub-admin-placeholder-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writePrototype(projectRoot, 'untitled-5');
    writeProjectMetadata(projectRoot, [
      { id: 'untitled-5', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const existing = createResponse();
    expect(handleAdminStatic(
      createRequest('/?projectId=make14&p=untitled-5&v=canvas'),
      existing.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(true);
    expect(existing.statusCode).toBe(200);
    expect(existing.header('location')).toBe('');

    const regularMissing = createResponse();
    expect(handleAdminStatic(
      createRequest('/?projectId=make14&p=normal-old-name&v=canvas'),
      regularMissing.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(true);
    expect(regularMissing.statusCode).toBe(200);
    expect(regularMissing.header('location')).toBe('');

    const emptyProjectRoot = createTempRoot('axhub-admin-placeholder-empty-project-');
    writeProjectMetadata(emptyProjectRoot, []);
    const empty = createResponse();
    expect(handleAdminStatic(
      createRequest('/?projectId=make14&p=untitled-9&v=canvas'),
      empty.response,
      { adminRoot, projectRoot: emptyProjectRoot, host: 'localhost', port: 5174 },
    )).toBe(true);
    expect(empty.statusCode).toBe(200);
    expect(empty.header('location')).toBe('');
  });

  it('uses prototype directory mtime before falling back to the resource list order', () => {
    const projectRoot = createTempRoot('axhub-admin-placeholder-project-');
    const adminRoot = createTempRoot('axhub-admin-placeholder-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writePrototype(projectRoot, 'mtime-old', { updatedAt: new Date('2026-01-01T00:00:00.000Z') });
    writePrototype(projectRoot, 'mtime-new', { updatedAt: new Date('2026-02-01T00:00:00.000Z') });
    writeProjectMetadata(projectRoot, [
      { id: 'mtime-new', updatedAt: '2026-03-01T00:00:00.000Z' },
      { id: 'mtime-old', updatedAt: '2026-03-01T00:00:00.000Z' },
    ]);

    const redirect = createResponse();
    expect(handleAdminStatic(
      createRequest('/?projectId=make14&p=untitled&v=canvas'),
      redirect.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(true);
    expect(redirect.statusCode).toBe(302);
    expect(redirect.header('location')).toBe('/?projectId=make14&p=mtime-new&v=canvas&fromP=untitled');
  });

  it('injects runtime configuration without exposing the project root', async () => {
    const projectRoot = createTempRoot("axhub-admin-static-project-'quoted-");
    const adminRoot = createTempRoot('axhub-admin-static-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    const server = await startAdminStaticServer(projectRoot, adminRoot);

    try {
      const response = await fetch(`${server.origin}/`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(html).toContain("window.__PROJECT_PREFIX__ = '';");
      expect(html).toContain(`window.__LOCAL_PORT__ = ${server.port};`);
      expect(html).not.toContain('window.__PROJECT_ROOT__');
      expect(html).toContain('window.__AXHUB_MAKE_API_ORIGIN__ = window.location.origin;');
    } finally {
      await server.close();
    }
  });

  it('injects the detected LAN host separately from the listening host', () => {
    const script = buildInjectScript({
      adminRoot: '/tmp/admin',
      projectRoot: '/tmp/project',
      host: 'localhost',
      lanHost: '192.168.31.88',
      port: 5174,
    });

    expect(script).toContain("window.__LOCAL_IP__ = '192.168.31.88';");
  });

  it('injects configured local and LAN share hosts from project config', () => {
    const projectRoot = createTempRoot('axhub-admin-share-host-project-');
    writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
      server: {
        host: '127.0.0.1',
        allowLAN: true,
        lanHost: '10.0.8.42',
      },
    });

    const script = buildInjectScript({
      adminRoot: '/tmp/admin',
      projectRoot,
      host: 'localhost',
      lanHost: '192.168.31.88',
      port: 5174,
    });

    expect(script).toContain("window.__LOCAL_IP__ = '10.0.8.42';");
    expect(script).toContain("window.__AXHUB_SHARE_HOSTS__ = {");
    expect(script).toContain("localHost: '127.0.0.1'");
    expect(script).toContain("lanHost: '10.0.8.42'");
  });

  it('serves only admin-root HTML and assets for admin static routes', async () => {
    const projectRoot = createTempRoot('axhub-admin-static-project-');
    const adminRoot = createTempRoot('axhub-admin-static-dist-');
    const outsideRoot = createTempRoot('axhub-admin-static-outside-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Index</body></html>');
    writeFile(path.join(adminRoot, 'settings.html'), '<html><head></head><body>Settings</body></html>');
    writeFile(path.join(adminRoot, 'assets/app.js'), 'console.log(\"admin\");');
    writeFile(path.join(outsideRoot, 'secret.html'), '<html><head></head><body>Secret</body></html>');
    const server = await startAdminStaticServer(projectRoot, adminRoot);

    try {
      const adminHtml = await fetch(`${server.origin}/admin/settings.html`);
      expect(adminHtml.status).toBe(200);
      expect(await adminHtml.text()).toContain('Settings');

      const asset = await fetch(`${server.origin}/assets/app.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get('access-control-allow-origin')).toBe('*');
      expect(asset.headers.get('cache-control')).toBe('no-cache');
      expect(await asset.text()).toBe('console.log(\"admin\");');

      const versionedAsset = await fetch(`${server.origin}/assets/app.js?v=123`);
      expect(versionedAsset.status).toBe(200);
      expect(versionedAsset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(versionedAsset.headers.get('access-control-allow-origin')).toBe('*');
      expect(await versionedAsset.text()).toBe('console.log(\"admin\");');

      const escapedHtml = await fetch(`${server.origin}/admin/${encodeURIComponent(`../${path.basename(outsideRoot)}/secret.html`)}`);
      expect(escapedHtml.status).toBe(404);

      const escapedAsset = await fetch(`${server.origin}/assets/${encodeURIComponent('../secret.js')}`);
      expect(escapedAsset.status).not.toBe(200);
    } finally {
      await server.close();
    }
  });

  it('serves resource canvas template HTML without Vite dev-only module imports', async () => {
    const projectRoot = createTempRoot('axhub-canvas-static-project-');
    const adminRoot = createTempRoot('axhub-canvas-static-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writeFile(
      path.join(adminRoot, 'canvas-template.html'),
      [
        '<html><head>',
        '<meta name="axhub-canvas-name" content="{{CANVAS_NAME}}">',
        '<meta name="axhub-canvas-title" content="{{CANVAS_TITLE}}">',
        '</head><body>',
        '<script type="module">',
        "  import '/@vite/client';",
        "  import '@vitejs/plugin-react/preamble';",
        '</script>',
        '<script type="module" src="/assets/canvas-template-bootstrap.js"></script>',
        '</body></html>',
      ].join('\n'),
    );
    const server = await startAdminStaticServer(projectRoot, adminRoot);

    try {
      const response = await fetch(`${server.origin}/canvas/resources/flows/ref-antd.excalidraw`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('content="resources/flows/ref-antd.excalidraw"');
      expect(html).toContain('ref-antd - Canvas');
      expect(html).toContain('/assets/canvas-template-bootstrap.js');
      expect(html).not.toContain('/@vite/client');
      expect(html).not.toContain('@vitejs/plugin-react/preamble');
    } finally {
      await server.close();
    }
  });

  it('serves spec template HTML without Vite dev-only module imports', async () => {
    const projectRoot = createTempRoot('axhub-spec-static-project-');
    const adminRoot = createTempRoot('axhub-spec-static-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writeFile(
      path.join(adminRoot, 'spec-template.html'),
      [
        '<html><head><title>{{TITLE}} - Spec</title></head><body>',
        '<script type="module">',
        "  import '/@vite/client';",
        "  import '@vitejs/plugin-react/preamble';",
        '</script>',
        '<script type="module" src="/assets/spec-template-bootstrap.js"></script>',
        '</body></html>',
      ].join('\n'),
    );
    const server = await startAdminStaticServer(projectRoot, adminRoot);

    try {
      const response = await fetch(`${server.origin}/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3Dspec.md`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('<title>spec - Spec</title>');
      expect(html).not.toContain('{{TITLE}}');
      expect(html).toContain('/assets/spec-template-bootstrap.js');
      expect(html).not.toContain('/@vite/client');
      expect(html).not.toContain('@vitejs/plugin-react/preamble');
    } finally {
      await server.close();
    }
  });

  it('does not serve OpenCode WebUI static assets while the feature is disabled', async () => {
    const projectRoot = createTempRoot('axhub-opencode-disabled-project-');
    const adminRoot = createTempRoot('axhub-opencode-disabled-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writeFile(
      path.join(adminRoot, 'opencode-webui/index.html'),
      '<html><head></head><body><div id="root">OpenCode</div></body></html>',
    );
    writeFile(path.join(adminRoot, 'opencode-webui/assets/index.js'), 'console.log("opencode");');
    const server = await startAdminStaticServer(projectRoot, adminRoot);

    try {
      const entry = await fetch(`${server.origin}/opencode/`);
      expect(entry.status).toBe(404);

      const asset = await fetch(`${server.origin}/opencode/assets/index.js`);
      expect(asset.status).toBe(404);

      const rootAsset = createResponse();
      expect(handleAdminStatic(
        createRequest('/assets/index.js', { referer: 'http://localhost/opencode/project/session' }),
        rootAsset.response,
        {
          adminRoot,
          projectRoot,
          host: 'localhost',
          port: 5174,
        },
      )).toBe(false);
    } finally {
      await server.close();
    }
  });

  it.skip('serves OpenCode WebUI under /opencode without polluting admin assets', async () => {
    const projectRoot = createTempRoot('axhub-opencode-static-project-');
    const adminRoot = createTempRoot('axhub-opencode-static-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writeFile(path.join(adminRoot, 'assets/app.js'), 'console.log("admin");');
    writeFile(
      path.join(adminRoot, 'opencode-webui/index.html'),
      [
        '<html><head>',
        '<script id="axhub-opencode-runtime-config">',
        'window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = window.__AXHUB_OPENCODE_SERVER_ORIGIN__ || "";',
        '</script>',
        '<script type="module" src="/opencode/assets/index.js"></script>',
        '</head><body><div id="root"></div></body></html>',
      ].join('\n'),
    );
    writeFile(path.join(adminRoot, 'opencode-webui/assets/index.js'), 'console.log("opencode");');
    writeFile(path.join(adminRoot, 'opencode-webui/site.webmanifest'), '{"name":"OpenCode"}');
    writeServerInfo(projectRoot, 'runtime', {
      pid: 999999,
      port: 4999,
      host: 'localhost',
      origin: 'http://localhost:4999',
      projectRoot,
      startedAt: new Date().toISOString(),
    });
    const server = await startMakeServer({
      projectRoot,
      adminRoot,
      host: 'localhost',
      port: 0,
    });

    try {
      const entry = await fetch(`${server.origin}/opencode/`);
      const html = await entry.text();
      expect(entry.status).toBe(200);
      expect(entry.headers.get('cache-control')).toBe('no-store');
      expect(html).toContain('window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "";');
      expect(html).toContain('/opencode/assets/index.js');
      expect(html).toContain('/opencode/axhub-hug.js');

      const indexHtml = await fetch(`${server.origin}/opencode/index.html`);
      expect(indexHtml.status).toBe(200);
      const indexBody = await indexHtml.text();
      expect(indexBody).toContain('window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "";');
      expect(indexBody).toContain('/opencode/axhub-hug.js');

      const asset = await fetch(`${server.origin}/opencode/assets/index.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toContain('javascript');
      expect(await asset.text()).toBe('console.log("opencode");');

      const hugScript = await fetch(`${server.origin}/opencode/axhub-hug.js`);
      const hugScriptText = await hugScript.text();
      expect(hugScript.status).toBe(200);
      expect(hugScript.headers.get('content-type')).toContain('javascript');
      expect(hugScriptText).toContain('[Axhub Hug]');
      expect(hugScriptText).toContain('function mountOpenWindowButtonFeature()');
      expect(hugScriptText).toContain('window.self === window.top');
      expect(hugScriptText).not.toContain('if (window.self === window.top) return;\n\n  function createIcon()');
      expect(hugScriptText).toContain('opencode-titlebar-right');
      expect(hugScriptText).toContain("window.open(window.location.href, '_blank', 'noopener,noreferrer')");

      const manifest = await fetch(`${server.origin}/opencode/site.webmanifest`);
      expect(manifest.status).toBe(200);
      expect(manifest.headers.get('content-type')).toContain('json');

      const spaFallback = await fetch(`${server.origin}/opencode/encoded-dir/session/ses_123`);
      expect(spaFallback.status).toBe(200);
      expect(await spaFallback.text()).toContain('window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "";');

      const deepRouteChunk = await fetch(`${server.origin}/opencode/encoded-dir/assets/index.js`);
      expect(deepRouteChunk.status).toBe(200);
      expect(deepRouteChunk.headers.get('content-type')).toContain('javascript');
      expect(await deepRouteChunk.text()).toBe('console.log("opencode");');

      const adminAsset = await fetch(`${server.origin}/assets/app.js`);
      expect(adminAsset.status).toBe(200);
      expect(await adminAsset.text()).toBe('console.log("admin");');

      const escaped = await fetch(`${server.origin}/opencode/assets/${encodeURIComponent('../../index.html')}`);
      expect(escaped.status).not.toBe(200);
    } finally {
      await server.close();
    }
  });

  it.skip('serves root OpenCode asset references from the OpenCode static root', async () => {
    const projectRoot = createTempRoot('axhub-opencode-root-asset-project-');
    const adminRoot = createTempRoot('axhub-opencode-root-asset-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writeFile(path.join(adminRoot, 'assets/sprite.svg'), '<svg id="admin"></svg>');
    writeFile(
      path.join(adminRoot, 'opencode-webui/index.html'),
      '<html><head></head><body><div id="root"></div></body></html>',
    );
    writeFile(path.join(adminRoot, 'opencode-webui/assets/sprite.svg'), '<svg id="opencode"></svg>');

    const openCodeAsset = createResponse();
    expect(handleAdminStatic(
      createRequest('/assets/sprite.svg', { referer: 'http://localhost/opencode/project/session' }),
      openCodeAsset.response,
      {
        adminRoot,
        projectRoot,
        host: 'localhost',
        port: 5174,
      },
    )).toBe(true);
    await openCodeAsset.waitForFinish();
    expect(openCodeAsset.statusCode).toBe(200);
    expect(openCodeAsset.header('content-type')).toContain('svg');
    expect(openCodeAsset.body()).toBe('<svg id="opencode"></svg>');

    const adminAsset = createResponse();
    expect(handleAdminStatic(
      createRequest('/assets/sprite.svg'),
      adminAsset.response,
      {
        adminRoot,
        projectRoot,
        host: 'localhost',
        port: 5174,
      },
    )).toBe(true);
    await adminAsset.waitForFinish();
    expect(adminAsset.statusCode).toBe(200);
    expect(adminAsset.body()).toBe('<svg id="admin"></svg>');

    const missingOpenCodeAsset = createResponse();
    expect(handleAdminStatic(
      createRequest('/assets/missing.svg', { referer: 'http://localhost/opencode/project/session' }),
      missingOpenCodeAsset.response,
      {
        adminRoot,
        projectRoot,
        host: 'localhost',
        port: 5174,
      },
    )).toBe(true);
    expect(missingOpenCodeAsset.statusCode).toBe(404);
  });

  it.skip('does not fall back to OpenCode HTML for static asset misses', async () => {
    const projectRoot = createTempRoot('axhub-opencode-static-miss-project-');
    const adminRoot = createTempRoot('axhub-opencode-static-miss-dist-');
    writeFile(
      path.join(adminRoot, 'opencode-webui/index.html'),
      '<html><head></head><body><div id="root"></div></body></html>',
    );

    const missingAsset = createResponse();
    expect(handleAdminStatic(
      createRequest('/opencode/assets/missing.js'),
      missingAsset.response,
      {
        adminRoot,
        projectRoot,
        host: 'localhost',
        port: 5174,
      },
    )).toBe(true);
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.body()).not.toContain('<div id="root"></div>');

    const escapedAsset = createResponse();
    expect(handleAdminStatic(
      createRequest(`/opencode/assets/${encodeURIComponent('../../index.html')}`),
      escapedAsset.response,
      {
        adminRoot,
        projectRoot,
        host: 'localhost',
        port: 5174,
      },
    )).toBe(true);
    expect(escapedAsset.statusCode).toBe(404);
  });

  it('keeps admin HTML no-store while serving versioned images with immutable cache headers', async () => {
    const projectRoot = createTempRoot('axhub-admin-cache-project-');
    const adminRoot = createTempRoot('axhub-admin-cache-dist-');
    writeFile(path.join(adminRoot, 'index.html'), '<html><head></head><body>Admin</body></html>');
    writeFile(path.join(adminRoot, 'images/logo.svg'), '<svg></svg>');
    const server = await startAdminStaticServer(projectRoot, adminRoot);

    try {
      const html = await fetch(`${server.origin}/`);
      expect(html.status).toBe(200);
      expect(html.headers.get('cache-control')).toBe('no-store');

      const image = await fetch(`${server.origin}/images/logo.svg?v=cache`);
      expect(image.status).toBe(200);
      expect(image.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(image.headers.get('content-type')).toContain('svg');
    } finally {
      await server.close();
    }
  });

  it('returns false for missing templates and escaped static paths in direct handler calls', async () => {
    const projectRoot = createTempRoot('axhub-admin-static-project-');
    const adminRoot = createTempRoot('axhub-admin-static-dist-');
    writeFile(path.join(adminRoot, 'auto-debug-client.js'), 'console.log("debug");');

    const missingIndex = createResponse();
    expect(handleAdminStatic(
      createRequest('/index.html'),
      missingIndex.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(false);

    const missingCanvasTemplate = createResponse();
    expect(handleAdminStatic(
      createRequest('/canvas/resources/flows/home.excalidraw'),
      missingCanvasTemplate.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(false);

    const removedPrototypeCanvas = createResponse();
    expect(handleAdminStatic(
      createRequest('/canvas/prototypes/home/canvas.excalidraw'),
      removedPrototypeCanvas.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(false);

    const escapedHtml = createResponse();
    expect(handleAdminStatic(
      createRequest('/admin/../outside.html'),
      escapedHtml.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(false);

    const escapedAsset = createResponse();
    expect(handleAdminStatic(
      createRequest('/assets/../secret.js'),
      escapedAsset.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(false);

    const autoDebug = createResponse();
    expect(handleAdminStatic(
      createRequest('/auto-debug-client.js'),
      autoDebug.response,
      { adminRoot, projectRoot, host: 'localhost', port: 5174 },
    )).toBe(true);
    await autoDebug.waitForFinish();
    expect(autoDebug.header('cache-control')).toBe('no-store');
    expect(autoDebug.body()).toBe('console.log("debug");');
  });
});
