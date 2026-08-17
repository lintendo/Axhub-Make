import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.AXHUB_MAKE_GITEE_MIRROR_SKIP_MAIN = '1';

const mirrorGitee = await import('./release-make-mirror-gitee.mjs');

const tempRoots = [];

function createTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixture(options = {}) {
  const root = createTempRoot('axhub-gitee-mirror-');
  const assetPath = path.join(root, 'artifacts', 'axhub-make-client-template.zip');
  writeFile(assetPath, 'zip payload');
  const latestManifestPath = path.join(root, 'artifacts', 'axhub-make-client-template.latest.json');
  if (options.includeLatestManifest !== false) {
    writeFile(latestManifestPath, '{"schemaVersion":1}\n');
  }
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = {
    templateVersion: '1.2.3-beta.4',
    tagName: 'make-client-template-v1.2.3-beta.4',
    templateZip: {
      path: assetPath,
      sha256: 'a'.repeat(64),
      githubReleaseAssetName: 'axhub-make-client-template.zip',
      primaryUrl: 'https://github.com/lintendo/Axhub-Make/releases/download/make-client-template-v1.2.3-beta.4/axhub-make-client-template.zip',
      mirrorUrl: 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v1.2.3-beta.4/axhub-make-client-template.zip',
    },
  };
  if (options.includeLatestManifest !== false) {
    manifest.latestManifest = {
      path: latestManifestPath,
      name: 'axhub-make-client-template.latest.json',
      mirrorUrl: 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-latest/axhub-make-client-template.latest.json',
    };
  }
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, assetPath, latestManifestPath, manifestPath };
}

function createFetchMock(handlers) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    for (const handler of handlers) {
      const response = await handler(url, init);
      if (response) {
        return response;
      }
    }
    return new Response(JSON.stringify({ message: `Unexpected request: ${url}` }), { status: 500 });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('gitee make release mirror helper', () => {
  it('parses the Gitee mirror release URL from the manifest', () => {
    assert.deepEqual(
      mirrorGitee.parseGiteeReleaseDownloadUrl('https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v1.2.3/axhub-make-client-template.zip'),
      {
        owner: 'axhub',
        repo: 'Axhub-Make',
        tagName: 'make-client-template-v1.2.3',
        assetName: 'axhub-make-client-template.zip',
      },
    );
  });

  it('resolves the Gitee token from env or an ignored local token file', () => {
    const root = createTempRoot('axhub-gitee-token-');
    const tokenFile = path.join(root, '.local', 'gitee-token');
    writeFile(tokenFile, ' file-token \n');

    assert.equal(mirrorGitee.resolveGiteeToken({ env: { GITEE_TOKEN: ' env-token ' }, tokenFile }), 'env-token');
    assert.equal(mirrorGitee.resolveGiteeToken({ env: {}, tokenFile }), 'file-token');
    assert.throws(
      () => mirrorGitee.resolveGiteeToken({ env: {}, tokenFile: path.join(root, 'missing') }),
      /GITEE_TOKEN/,
    );
  });

  it('creates the versioned release and replaces an existing latest manifest', async () => {
    const token = 'test-token';
    const logs = [];
    const { manifestPath } = createFixture();
    const fetchImpl = createFetchMock([
      (url) => {
        if (url.includes('/releases/tags/make-client-template-v1.2.3-beta.4')) {
          return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
        }
        if (url.includes('/releases/tags/make-client-template-latest')) {
          return new Response(JSON.stringify({ id: 43, tag_name: 'make-client-template-latest' }), { status: 200 });
        }
        return null;
      },
      (url, init) => {
        if (url.endsWith('/api/v5/repos/axhub/Axhub-Make/releases') && init.method === 'POST') {
          assert.equal(init.body.get('access_token'), token);
          const tagName = init.body.get('tag_name');
          assert.equal(tagName, 'make-client-template-v1.2.3-beta.4');
          assert.equal(init.body.get('name'), 'Axhub Make Client Template 1.2.3-beta.4');
          assert.equal(init.body.get('body'), 'Axhub Make client template 1.2.3-beta.4 mirror release.');
          assert.equal(init.body.get('prerelease'), 'true');
          assert.equal(init.body.get('target_commitish'), 'main');
          return new Response(JSON.stringify({
            id: 42,
            tag_name: tagName,
          }), { status: 201 });
        }
        return null;
      },
      (url) => {
        if (url.includes('/releases/42/attach_files') && !url.includes('/download')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url.includes('/releases/43/attach_files') && !url.includes('/download')) {
          return new Response(JSON.stringify([
            { id: 8, name: 'axhub-make-client-template.latest.json' },
          ]), { status: 200 });
        }
        return null;
      },
      (url, init) => {
        if (url.endsWith('/api/v5/repos/axhub/Axhub-Make/releases/43/attach_files/8') && init.method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        return null;
      },
      (url, init) => {
        if (url.endsWith('/api/v5/repos/axhub/Axhub-Make/releases/42/attach_files') && init.method === 'POST') {
          assert.equal(init.body.get('access_token'), token);
          assert.equal(init.body.get('file').name, 'axhub-make-client-template.zip');
          return new Response(JSON.stringify({ id: 7, name: 'axhub-make-client-template.zip' }), { status: 201 });
        }
        if (url.endsWith('/api/v5/repos/axhub/Axhub-Make/releases/43/attach_files') && init.method === 'POST') {
          assert.equal(init.body.get('access_token'), token);
          assert.equal(init.body.get('file').name, 'axhub-make-client-template.latest.json');
          return new Response(JSON.stringify({ id: 8, name: 'axhub-make-client-template.latest.json' }), { status: 201 });
        }
        return null;
      },
      (url, init) => {
        if (url === 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v1.2.3-beta.4/axhub-make-client-template.zip') {
          assert.equal(init.method, 'HEAD');
          return new Response(null, { status: 200, headers: { 'content-length': '11' } });
        }
        if (url === 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-latest/axhub-make-client-template.latest.json') {
          assert.equal(init.method, 'HEAD');
          return new Response(null, { status: 200, headers: { 'content-length': '20' } });
        }
        return null;
      },
    ]);

    const result = await mirrorGitee.runGiteeMirrorRelease({
      argv: ['--manifest', manifestPath, '--confirm-publish'],
      env: { GITEE_TOKEN: token },
      fetchImpl,
      logger: { log: (message) => logs.push(String(message)) },
    });

    assert.equal(result.uploaded, true);
    assert.equal(result.verified, true);
    assert.equal(result.latestManifest.uploaded, true);
    assert.equal(result.latestManifest.verified, true);
    assert.equal(fetchImpl.calls.some((call) => call.init.method === 'DELETE'), true);
    assert.equal(logs.join('\n').includes(token), false);
  });

  it('skips an existing template attachment unless replace is requested', async () => {
    const token = 'test-token';
    const { manifestPath } = createFixture({ includeLatestManifest: false });
    const fetchImpl = createFetchMock([
      (url) => {
        if (url.includes('/releases/tags/make-client-template-v1.2.3-beta.4')) {
          return new Response(JSON.stringify({ id: 42, tag_name: 'make-client-template-v1.2.3-beta.4' }), { status: 200 });
        }
        return null;
      },
      (url) => {
        if (url.includes('/releases/42/attach_files')) {
          return new Response(JSON.stringify([{ id: 7, name: 'axhub-make-client-template.zip' }]), { status: 200 });
        }
        return null;
      },
      (url) => {
        if (url === 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v1.2.3-beta.4/axhub-make-client-template.zip') {
          return new Response(null, { status: 200 });
        }
        return null;
      },
    ]);

    const result = await mirrorGitee.runGiteeMirrorRelease({
      argv: ['--manifest', manifestPath, '--confirm-publish'],
      env: { GITEE_TOKEN: token },
      fetchImpl,
      logger: { log: () => {} },
    });

    assert.equal(result.uploaded, false);
    assert.equal(fetchImpl.calls.some((call) => call.init.method === 'POST'), false);
  });

  it('prints a dry run without requiring or leaking a token', async () => {
    const logs = [];
    const { manifestPath } = createFixture();

    const result = await mirrorGitee.runGiteeMirrorRelease({
      argv: ['--manifest', manifestPath, '--dry-run'],
      env: {},
      fetchImpl: async () => {
        throw new Error('dry-run should not call fetch');
      },
      logger: { log: (message) => logs.push(String(message)) },
    });

    assert.equal(result.dryRun, true);
    assert.match(logs.join('\n'), /axhub\/Axhub-Make/u);
    assert.match(logs.join('\n'), /axhub-make-client-template\.zip/u);
  });

  it('requires explicit human confirmation before publishing to Gitee', async () => {
    const { manifestPath } = createFixture();

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', manifestPath],
        env: { GITEE_TOKEN: 'test-token' },
        fetchImpl: async () => {
          throw new Error('confirmation gate should run before fetch');
        },
        logger: { log: () => {} },
      }),
      /--confirm-publish/u,
    );
  });

  it('accepts the pnpm argument separator before dry-run options', async () => {
    const { manifestPath } = createFixture();

    const result = await mirrorGitee.runGiteeMirrorRelease({
      argv: ['--', '--manifest', manifestPath, '--dry-run'],
      env: {},
      fetchImpl: async () => {
        throw new Error('dry-run should not call fetch');
      },
      logger: { log: () => {} },
    });

    assert.equal(result.dryRun, true);
  });

  it('defaults to the independent make client template manifest path', async () => {
    const scriptSource = fs.readFileSync(path.resolve('scripts/release-make-mirror-gitee.mjs'), 'utf8');

    assert.match(scriptSource, /\.release\/make-client-template\/manifest\.json/u);
    assert.doesNotMatch(scriptSource, /defaultManifestPath = path\.join\(repoRoot, '\.release\/make\/manifest\.json'\)/u);
  });

  it('exposes a package script for publishing the Gitee mirror', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

    assert.equal(
      packageJson.scripts['release:make:mirror:gitee'],
      'node scripts/release-make-mirror-gitee.mjs',
    );
  });
});
