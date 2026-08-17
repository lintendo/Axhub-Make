import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleLocalEditingApi } from '../vite-plugins/localEditingApi';

const tempRoots: string[] = [];
const servers: http.Server[] = [];

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-local-editing-api-'));
  tempRoots.push(root);

  writeFile(path.join(root, 'src/prototypes/demo/index.tsx'), 'const first = "Old copy";\n');
  writeFile(path.join(root, 'src/prototypes/demo/helper.ts'), 'export const second = "Old copy";\n');
  writeFile(path.join(root, 'src/prototypes/demo/demo.spec.ts'), 'const excluded = "Old copy";\n');
  writeFile(path.join(root, 'src/prototypes/demo/demo.local.tsx'), 'const excluded = "Old copy";\n');
  writeFile(path.join(root, 'src/prototypes/demo/.local/notes.ts'), 'const excluded = "Old copy";\n');
  writeFile(path.join(root, 'src/prototypes/demo/nested.assets/data.ts'), 'const excluded = "Old copy";\n');
  writeFile(path.join(root, 'src/prototypes/sibling/index.tsx'), 'const sibling = "Old copy";\n');
  writeFile(path.join(root, 'src/themes/brand/index.tsx'), 'const theme = "Theme copy";\n');
  return root;
}

async function listen(projectRoot: string) {
  const server = http.createServer((req, res) => {
    if (handleLocalEditingApi(req, res, projectRoot)) return;
    res.statusCode = 404;
    res.end();
  });
  servers.push(server);

  return new Promise<string>((resolve, reject) => {
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

async function post(origin: string, pathname: string, body: unknown) {
  const response = await fetch(`${origin}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json() as Record<string, unknown>,
  };
}

beforeEach(() => {
  tempRoots.length = 0;
  servers.length = 0;
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('local editing API', () => {
  it('counts and replaces text only inside the selected resource', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);

    await expect(post(origin, '/api/text-replace/count', {
      path: 'prototypes/demo',
      replacements: [{ searchText: 'Old copy' }],
    })).resolves.toMatchObject({
      status: 200,
      body: { totalCount: 2, counts: { 'Old copy': 2 } },
    });

    await expect(post(origin, '/api/text-replace/replace', {
      path: 'prototypes/demo',
      replacements: [{ searchText: 'Old copy', replaceText: 'New copy' }],
    })).resolves.toMatchObject({
      status: 200,
      body: { success: true, changedFiles: 2, totalCount: 2 },
    });

    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/index.tsx'), 'utf8')).toContain('New copy');
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/helper.ts'), 'utf8')).toContain('New copy');
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/demo.spec.ts'), 'utf8')).toContain('Old copy');
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/demo.local.tsx'), 'utf8')).toContain('Old copy');
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/.local/notes.ts'), 'utf8')).toContain('Old copy');
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/nested.assets/data.ts'), 'utf8')).toContain('Old copy');
    expect(fs.readFileSync(path.join(root, 'src/prototypes/sibling/index.tsx'), 'utf8')).toContain('Old copy');
  });

  it('applies a replacement batch against the original content without cascading', async () => {
    const root = createFixtureProject();
    writeFile(path.join(root, 'src/prototypes/demo/index.tsx'), 'const value = "Alpha Beta";\n');
    const origin = await listen(root);

    const result = await post(origin, '/api/text-replace/replace', {
      path: 'prototypes/demo',
      replacements: [
        { searchText: 'Alpha', replaceText: 'Beta' },
        { searchText: 'Beta', replaceText: 'Gamma' },
      ],
    });

    expect(result).toMatchObject({ status: 200, body: { success: true, totalCount: 2 } });
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/index.tsx'), 'utf8')).toContain('Beta Gamma');
  });

  it('supports theme resource paths', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);

    const result = await post(origin, '/api/text-replace/replace', {
      path: 'themes/brand',
      replacements: [{ searchText: 'Theme copy', replaceText: 'Updated theme' }],
    });

    expect(result).toMatchObject({ status: 200, body: { success: true, changedFiles: 1 } });
    expect(fs.readFileSync(path.join(root, 'src/themes/brand/index.tsx'), 'utf8')).toContain('Updated theme');
  });

  it.each([
    '../prototypes/demo',
    'prototypes/../themes/brand',
    'components/demo',
    '/prototypes/demo',
  ])('rejects unsafe or unsupported resource path %s', async (resourcePath) => {
    const origin = await listen(createFixtureProject());

    const result = await post(origin, '/api/text-replace/count', {
      path: resourcePath,
      replacements: [{ searchText: 'Old copy' }],
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ success: false });
  });

  it('rejects a resource directory that is a symbolic link', async () => {
    const root = createFixtureProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-local-editing-outside-'));
    tempRoots.push(outside);
    writeFile(path.join(outside, 'index.tsx'), 'const secret = "Old copy";\n');
    fs.symlinkSync(outside, path.join(root, 'src/prototypes/linked'));
    const origin = await listen(root);

    const result = await post(origin, '/api/text-replace/count', {
      path: 'prototypes/linked',
      replacements: [{ searchText: 'Old copy' }],
    });

    expect(result.status).toBe(400);
    expect(fs.readFileSync(path.join(outside, 'index.tsx'), 'utf8')).toContain('Old copy');
  });

  it('rejects a project whose src directory is a symbolic link', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-local-editing-linked-src-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-local-editing-src-target-'));
    tempRoots.push(root, outside);
    writeFile(path.join(outside, 'prototypes/demo/index.tsx'), 'const secret = "Old copy";\n');
    fs.symlinkSync(outside, path.join(root, 'src'));
    const origin = await listen(root);

    const result = await post(origin, '/api/text-replace/count', {
      path: 'prototypes/demo',
      replacements: [{ searchText: 'Old copy' }],
    });

    expect(result.status).toBe(400);
  });

  it('rejects conflicting duplicate search strings', async () => {
    const origin = await listen(createFixtureProject());

    const result = await post(origin, '/api/text-replace/replace', {
      path: 'prototypes/demo',
      replacements: [
        { searchText: 'Old copy', replaceText: 'First' },
        { searchText: 'Old copy', replaceText: 'Second' },
      ],
    });

    expect(result.status).toBe(400);
  });

  it('requires replaceText for replacement requests', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);

    const result = await post(origin, '/api/text-replace/replace', {
      path: 'prototypes/demo',
      replacements: [{ searchText: 'Old copy' }],
    });

    expect(result.status).toBe(400);
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/index.tsx'), 'utf8')).toContain('Old copy');
  });

  it('rejects browser requests from a different origin', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);

    const response = await fetch(`${origin}/api/text-replace/replace`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        origin: 'https://untrusted.example',
      },
      body: JSON.stringify({
        path: 'prototypes/demo',
        replacements: [{ searchText: 'Old copy', replaceText: 'Unsafe copy' }],
      }),
    });

    expect(response.status).toBe(403);
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/index.tsx'), 'utf8')).toContain('Old copy');
  });

  it('accepts the browser-facing origin preserved by the local runtime proxy', async () => {
    const origin = await listen(createFixtureProject());

    const response = await fetch(`${origin}/api/text-replace/count`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:53817',
        'x-forwarded-host': '127.0.0.1:53817',
      },
      body: JSON.stringify({
        path: 'prototypes/demo',
        replacements: [{ searchText: 'Old copy' }],
      }),
    });

    expect(response.status).toBe(200);
  });

  it('serializes concurrent replacements for the same resource', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);

    const results = await Promise.all([
      post(origin, '/api/text-replace/replace', {
        path: 'prototypes/demo',
        replacements: [{ searchText: 'Old copy', replaceText: 'First copy' }],
      }),
      post(origin, '/api/text-replace/replace', {
        path: 'prototypes/demo',
        replacements: [{ searchText: 'Old copy', replaceText: 'Second copy' }],
      }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const savedSources = [
      fs.readFileSync(path.join(root, 'src/prototypes/demo/index.tsx'), 'utf8'),
      fs.readFileSync(path.join(root, 'src/prototypes/demo/helper.ts'), 'utf8'),
    ].join('\n');
    expect(savedSources.includes('First copy') || savedSources.includes('Second copy')).toBe(true);
    expect(savedSources).not.toContain('Old copy');
  });

  it('rejects the entire replacement batch when any source text is missing', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);

    const result = await post(origin, '/api/text-replace/replace', {
      path: 'prototypes/demo',
      replacements: [
        { searchText: 'Old copy', replaceText: 'New copy' },
        { searchText: 'Missing copy', replaceText: 'Should not appear' },
      ],
    });

    expect(result.status).toBe(409);
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/index.tsx'), 'utf8')).toContain('Old copy');
    expect(fs.readFileSync(path.join(root, 'src/prototypes/demo/helper.ts'), 'utf8')).toContain('Old copy');
  });

  it('enforces replacement count, value length, and request body limits', async () => {
    const origin = await listen(createFixtureProject());

    expect((await post(origin, '/api/text-replace/count', {
      path: 'prototypes/demo',
      replacements: Array.from({ length: 201 }, (_, index) => ({ searchText: `copy-${index}` })),
    })).status).toBe(413);
    expect((await post(origin, '/api/text-replace/count', {
      path: 'prototypes/demo',
      replacements: [{ searchText: 'x'.repeat(10_001) }],
    })).status).toBe(413);
    expect((await post(origin, '/api/text-replace/count', {
      path: 'prototypes/demo',
      replacements: [{ searchText: 'Old copy', replaceText: 'x'.repeat(2 * 1024 * 1024) }],
    })).status).toBe(413);
  });

  it('saves, accumulates, and idempotently clears resource-local hack.css', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);
    const hackCssPath = path.join(root, 'src/prototypes/demo/hack.css');
    const header = '/*\n * AXHUB TEMPORARY STYLE HACK\n */';

    expect(await post(origin, '/api/hack-css/save', {
      path: 'prototypes/demo',
      content: `${header}\n\n.demo { color: red; }\n`,
    })).toMatchObject({ status: 200, body: { success: true, changed: true } });
    expect(fs.readFileSync(hackCssPath, 'utf8')).toContain('.demo { color: red; }');

    expect(await post(origin, '/api/hack-css/save', {
      path: 'prototypes/demo',
      content: `${header}\n\n.card { color: blue; }\n`,
    })).toMatchObject({ status: 200, body: { success: true, changed: true } });
    const accumulatedCss = fs.readFileSync(hackCssPath, 'utf8');
    expect(accumulatedCss).toContain('.demo { color: red; }');
    expect(accumulatedCss).toContain('.card { color: blue; }');
    expect(accumulatedCss.match(/AXHUB TEMPORARY STYLE HACK/gu)).toHaveLength(1);

    expect(await post(origin, '/api/hack-css/clear', { path: 'prototypes/demo' }))
      .toMatchObject({ status: 200, body: { success: true, changed: true } });
    expect(fs.existsSync(hackCssPath)).toBe(false);

    expect(await post(origin, '/api/hack-css/clear', { path: 'prototypes/demo' }))
      .toMatchObject({ status: 200, body: { success: true, changed: false } });
  });

  it('rejects CSS larger than 256 KiB', async () => {
    const origin = await listen(createFixtureProject());

    const result = await post(origin, '/api/hack-css/save', {
      path: 'prototypes/demo',
      css: 'x'.repeat(256 * 1024 + 1),
    });

    expect(result.status).toBe(413);
  });

  it('keeps the existing hack.css when accumulated CSS would exceed 256 KiB', async () => {
    const root = createFixtureProject();
    const origin = await listen(root);
    const hackCssPath = path.join(root, 'src/prototypes/demo/hack.css');
    const firstContent = `/* AXHUB TEMPORARY STYLE HACK */\n${'a'.repeat(180 * 1024)}`;

    expect((await post(origin, '/api/hack-css/save', {
      path: 'prototypes/demo',
      content: firstContent,
    })).status).toBe(200);
    const savedContent = fs.readFileSync(hackCssPath, 'utf8');

    expect((await post(origin, '/api/hack-css/save', {
      path: 'prototypes/demo',
      content: `/* AXHUB TEMPORARY STYLE HACK */\n${'b'.repeat(100 * 1024)}`,
    })).status).toBe(413);
    expect(fs.readFileSync(hackCssPath, 'utf8')).toBe(savedContent);
  });

  it('does not claim unrelated API routes', async () => {
    const root = createFixtureProject();
    const server = http.createServer((req, res) => {
      if (handleLocalEditingApi(req, res, root)) return;
      res.statusCode = 418;
      res.end('next');
    });
    servers.push(server);
    const origin = await new Promise<string>((resolve, reject) => {
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

    const response = await fetch(`${origin}/api/html-review/save`, { method: 'POST' });

    expect(response.status).toBe(418);
  });
});
