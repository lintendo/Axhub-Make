import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { assertHtmlTemplateBootstrapImport } from '../../scripts/regression/html-template-production-import.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createAdminRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-html-bootstrap-import-'));
  temporaryDirectories.push(directory);
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
  return directory;
}

describe('HTML template production import', () => {
  it('is exposed through the named fresh-production package command', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );

    expect(packageJson.scripts['test:production:html-bootstrap']).toBe(
      'pnpm admin:build && node scripts/regression/html-template-production-import.mjs --admin-root dist/admin',
    );
  });

  it('fails clearly when the production entry is absent', async () => {
    const adminRoot = createAdminRoot();

    await expect(assertHtmlTemplateBootstrapImport({ adminRoot })).rejects.toThrow(
      /HTML template bootstrap entry does not exist/u,
    );
  });

  it('executes the production entry module instead of checking only its presence', async () => {
    const adminRoot = createAdminRoot();
    fs.writeFileSync(
      path.join(adminRoot, 'assets', 'html-template-bootstrap.js'),
      'globalThis.__AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__ = (globalThis.__AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__ || 0) + 1;\n',
      'utf8',
    );

    delete (globalThis as typeof globalThis & { __AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__?: number })
      .__AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__;
    await assertHtmlTemplateBootstrapImport({ adminRoot });

    expect(
      (globalThis as typeof globalThis & { __AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__?: number })
        .__AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__,
    ).toBe(1);
    delete (globalThis as typeof globalThis & { __AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__?: number })
      .__AXHUB_HTML_BOOTSTRAP_IMPORT_COUNT__;
  });

  it('treats the browser document boundary as a successful module-graph smoke result', async () => {
    const adminRoot = createAdminRoot();
    fs.writeFileSync(
      path.join(adminRoot, 'assets', 'html-template-bootstrap.js'),
      "throw new ReferenceError('document is not defined');\n",
      'utf8',
    );

    await expect(assertHtmlTemplateBootstrapImport({ adminRoot })).resolves.toMatchObject({
      browserRuntimeRequired: true,
    });
  });
});
