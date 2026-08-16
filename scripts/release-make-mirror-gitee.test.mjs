import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.AXHUB_MAKE_GITEE_MIRROR_SKIP_MAIN = '1';

const mirrorGiteeModule = await import('./release-make-mirror-gitee.mjs');

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

function createGitSpawnSyncMock({ currentCommit, statusOutput = '' }) {
  const calls = [];
  return {
    calls,
    spawnSyncImpl: (_command, args) => {
      calls.push(args);
      if (args[0] === 'status') {
        return { status: 0, stdout: statusOutput, stderr: '' };
      }
      if (args[0] === 'rev-parse') {
        return { status: 0, stdout: `${currentCommit}\n`, stderr: '' };
      }
      throw new Error(`Unexpected git invocation: ${args.join(' ')}`);
    },
  };
}

const mirrorGitee = {
  ...mirrorGiteeModule,
  runGiteeMirrorRelease(options) {
    const manifestIndex = options.argv.indexOf('--manifest');
    const manifestPath = options.argv[manifestIndex + 1];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const git = options.spawnSyncImpl
      ? { spawnSyncImpl: options.spawnSyncImpl }
      : createGitSpawnSyncMock({ currentCommit: manifest.sourceCommit });
    return mirrorGiteeModule.runGiteeMirrorRelease({ ...options, ...git });
  },
};

function createFixture(options = {}) {
  const root = createTempRoot('axhub-gitee-mirror-');
  const templateVersion = '1.2.3-beta.4';
  const sourceCommit = options.sourceCommit || 'b'.repeat(40);
  const assetPath = path.join(root, 'artifacts', 'axhub-make-client-template.zip');
  const zipBytes = Buffer.isBuffer(options.zipBytes)
    ? options.zipBytes
    : Buffer.from(options.zipBytes || 'zip payload', 'utf8');
  writeFile(assetPath, zipBytes);
  const zipSha256 = options.zipSha256 || crypto.createHash('sha256').update(zipBytes).digest('hex');
  const primaryUrl = `https://github.com/lintendo/Axhub-Make/releases/download/make-client-template-v${templateVersion}/axhub-make-client-template.zip`;
  const mirrorUrl = `https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v${templateVersion}/axhub-make-client-template.zip`;
  const latestManifestPath = path.join(root, 'artifacts', 'axhub-make-client-template.latest.json');
  let latestManifestBytes = null;
  let latestManifest = null;
  if (options.includeLatestManifest !== false) {
    latestManifest = {
      schemaVersion: 1,
      version: templateVersion,
      sourceCommit,
      releaseNotes: '# Axhub Make Client 1.2.3-beta.4',
      sha256: zipSha256,
      publishedAt: '2026-08-16T00:00:00.000Z',
      sources: [
        {
          id: 'github',
          url: primaryUrl,
          markerRepository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
          templateVersion,
        },
        {
          id: 'gitee',
          url: mirrorUrl,
          markerRepository: 'https://gitee.com/axhub/Axhub-Make/tree/main/client',
          templateVersion,
        },
      ],
      ...(options.latestOverrides || {}),
    };
    latestManifestBytes = Buffer.from(`${JSON.stringify(latestManifest, null, 2)}\n`, 'utf8');
    writeFile(latestManifestPath, latestManifestBytes);
  }
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = {
    templateVersion,
    tagName: `make-client-template-v${templateVersion}`,
    sourceCommit,
    templateZip: {
      path: assetPath,
      sha256: zipSha256,
      githubReleaseAssetName: 'axhub-make-client-template.zip',
      primaryUrl,
      mirrorUrl,
    },
  };
  if (options.includeLatestManifest !== false) {
    manifest.latestManifest = {
      path: latestManifestPath,
      name: 'axhub-make-client-template.latest.json',
      mirrorUrl: 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-latest/axhub-make-client-template.latest.json',
      sha256: crypto.createHash('sha256').update(latestManifestBytes).digest('hex'),
      manifest: latestManifest,
    };
  }
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    root,
    assetPath,
    latestManifestPath,
    manifestPath,
    sourceCommit,
    zipBytes,
    zipSha256,
    latestManifest,
    latestManifestBytes,
  };
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

  it('rejects a local template ZIP whose bytes do not match the prepared manifest', async () => {
    const { manifestPath } = createFixture({ zipSha256: 'a'.repeat(64) });

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', manifestPath, '--dry-run'],
        env: {},
        fetchImpl: async () => {
          throw new Error('local integrity validation must run before fetch');
        },
        logger: { log: () => {} },
      }),
      /SHA-256/u,
    );
  });

  it('rejects a replaced latest manifest before confirmation, token resolution, or fetch', async () => {
    const fixture = createFixture();
    const replacedLatest = {
      ...fixture.latestManifest,
      version: '9.9.9',
    };
    fs.writeFileSync(
      fixture.latestManifestPath,
      `${JSON.stringify(replacedLatest, null, 2)}\n`,
      'utf8',
    );
    let fetchCalled = false;

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', fixture.manifestPath],
        env: {},
        fetchImpl: async () => {
          fetchCalled = true;
          throw new Error('latest validation must run before fetch');
        },
        logger: { log: () => {} },
      }),
      /latest manifest SHA-256 does not match prepared manifest/u,
    );
    assert.equal(fetchCalled, false);
  });

  it('rejects latest manifest identity mismatches before Gitee dry-run or API access', async () => {
    const cases = [
      ['version', (latest) => { latest.version = '9.9.9'; }, /version does not match/u],
      ['source commit', (latest) => { latest.sourceCommit = 'c'.repeat(40); }, /sourceCommit does not match/u],
      ['GitHub URL', (latest) => {
        latest.sources.find((source) => source.id === 'github').url = 'https://example.invalid/wrong.zip';
      }, /github ZIP URL does not match/u],
      ['Gitee URL', (latest) => {
        latest.sources.find((source) => source.id === 'gitee').url = 'https://example.invalid/wrong.zip';
      }, /gitee ZIP URL does not match/u],
    ];

    for (const [label, mutateLatest, errorPattern] of cases) {
      const fixture = createFixture();
      const latestManifest = structuredClone(fixture.latestManifest);
      mutateLatest(latestManifest);
      const latestManifestBytes = Buffer.from(`${JSON.stringify(latestManifest, null, 2)}\n`, 'utf8');
      fs.writeFileSync(fixture.latestManifestPath, latestManifestBytes);
      const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
      manifest.latestManifest.sha256 = crypto.createHash('sha256').update(latestManifestBytes).digest('hex');
      manifest.latestManifest.manifest = latestManifest;
      fs.writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      let fetchCalled = false;

      await assert.rejects(
        () => mirrorGitee.runGiteeMirrorRelease({
          argv: ['--manifest', fixture.manifestPath, '--dry-run'],
          env: {},
          fetchImpl: async () => {
            fetchCalled = true;
            throw new Error('latest identity validation must run before fetch');
          },
          logger: { log: () => {} },
        }),
        errorPattern,
        label,
      );
      assert.equal(fetchCalled, false, label);
    }
  });

  it('rejects a dirty worktree before the Gitee dry-run can resolve a token or fetch', async () => {
    const { manifestPath, sourceCommit } = createFixture();
    const git = createGitSpawnSyncMock({
      currentCommit: sourceCommit,
      statusOutput: ' M scripts/release-make-mirror-gitee.mjs\n',
    });
    const fetchCalls = [];

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', manifestPath, '--dry-run'],
        env: {},
        fetchImpl: (...args) => {
          fetchCalls.push(args);
          throw new Error('fetch must not run');
        },
        logger: { log: () => {} },
        spawnSyncImpl: git.spawnSyncImpl,
      }),
      /clean worktree/u,
    );
    assert.deepEqual(git.calls, [['status', '--porcelain=v1', '--untracked-files=all']]);
    assert.equal(fetchCalls.length, 0);
  });

  it('rejects a clean worktree whose HEAD differs before Gitee confirmation can resolve a token or fetch', async () => {
    const { manifestPath, sourceCommit } = createFixture();
    const git = createGitSpawnSyncMock({ currentCommit: 'c'.repeat(40) });
    const fetchCalls = [];

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', manifestPath, '--confirm-publish'],
        env: {},
        fetchImpl: (...args) => {
          fetchCalls.push(args);
          throw new Error('fetch must not run');
        },
        logger: { log: () => {} },
        spawnSyncImpl: git.spawnSyncImpl,
      }),
      /current HEAD/u,
    );
    assert.deepEqual(git.calls, [
      ['status', '--porcelain=v1', '--untracked-files=all'],
      ['rev-parse', 'HEAD'],
    ]);
    assert.equal(fetchCalls.length, 0);
    assert.notEqual(sourceCommit, 'c'.repeat(40));
  });

  it('creates the versioned release and replaces an existing latest manifest', async () => {
    const token = 'test-token';
    const logs = [];
    const { manifestPath, sourceCommit, zipBytes, latestManifestBytes } = createFixture();
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
          assert.equal(init.body.get('target_commitish'), sourceCommit);
          return new Response(JSON.stringify({
            id: 42,
            tag_name: tagName,
            target_commitish: sourceCommit,
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
          assert.equal(init.method, 'GET');
          assert.equal(init.cache, 'no-store');
          return new Response(zipBytes, { status: 200 });
        }
        if (url === 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-latest/axhub-make-client-template.latest.json') {
          assert.equal(init.method, 'GET');
          assert.equal(init.cache, 'no-store');
          return new Response(latestManifestBytes, { status: 200 });
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

  it('uploads and verifies the ZIP and latest manifest bytes frozen by local validation', async () => {
    const token = 'test-token';
    const {
      assetPath,
      latestManifestPath,
      manifestPath,
      sourceCommit,
      zipBytes,
      latestManifestBytes,
    } = createFixture();
    const fetchImpl = createFetchMock([
      (url) => {
        if (url.includes('/releases/tags/make-client-template-v1.2.3-beta.4')) {
          fs.writeFileSync(assetPath, 'replacement ZIP bytes', 'utf8');
          fs.writeFileSync(latestManifestPath, 'replacement latest manifest bytes', 'utf8');
          return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
        }
        if (url.includes('/releases/tags/make-client-template-latest')) {
          return new Response(JSON.stringify({ id: 43, tag_name: 'make-client-template-latest' }), { status: 200 });
        }
        return null;
      },
      (url, init) => {
        if (url.endsWith('/api/v5/repos/axhub/Axhub-Make/releases') && init.method === 'POST') {
          return new Response(JSON.stringify({
            id: 42,
            tag_name: 'make-client-template-v1.2.3-beta.4',
            target_commitish: sourceCommit,
          }), { status: 201 });
        }
        return null;
      },
      (url) => {
        if (url.includes('/releases/42/attach_files') || url.includes('/releases/43/attach_files')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return null;
      },
      async (url, init) => {
        if (url.endsWith('/releases/42/attach_files') && init.method === 'POST') {
          const uploadedBytes = Buffer.from(await init.body.get('file').arrayBuffer());
          assert.deepEqual(uploadedBytes, zipBytes);
          return new Response(JSON.stringify({ id: 7, name: 'axhub-make-client-template.zip' }), { status: 201 });
        }
        if (url.endsWith('/releases/43/attach_files') && init.method === 'POST') {
          const uploadedBytes = Buffer.from(await init.body.get('file').arrayBuffer());
          assert.deepEqual(uploadedBytes, latestManifestBytes);
          return new Response(JSON.stringify({ id: 8, name: 'axhub-make-client-template.latest.json' }), { status: 201 });
        }
        return null;
      },
      (url) => {
        if (url === 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-v1.2.3-beta.4/axhub-make-client-template.zip') {
          return new Response(zipBytes, { status: 200 });
        }
        if (url === 'https://gitee.com/axhub/Axhub-Make/releases/download/make-client-template-latest/axhub-make-client-template.latest.json') {
          return new Response(latestManifestBytes, { status: 200 });
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

    assert.equal(result.verified, true);
    assert.equal(result.latestManifest.verified, true);
  });

  it('skips an existing template attachment unless replace is requested', async () => {
    const token = 'test-token';
    const { manifestPath, sourceCommit, zipBytes } = createFixture({ includeLatestManifest: false });
    const fetchImpl = createFetchMock([
      (url) => {
        if (url.includes('/releases/tags/make-client-template-v1.2.3-beta.4')) {
          return new Response(JSON.stringify({
            id: 42,
            tag_name: 'make-client-template-v1.2.3-beta.4',
            target_commitish: sourceCommit,
          }), { status: 200 });
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
          return new Response(zipBytes, { status: 200 });
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

  it('rejects stale bytes from an existing versioned Gitee ZIP', async () => {
    const token = 'test-token';
    const { manifestPath, sourceCommit } = createFixture();
    const fetchImpl = createFetchMock([
      (url) => {
        if (url.includes('/releases/tags/make-client-template-v1.2.3-beta.4')) {
          return new Response(JSON.stringify({
            id: 42,
            tag_name: 'make-client-template-v1.2.3-beta.4',
            target_commitish: sourceCommit,
          }), { status: 200 });
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
          return new Response('stale ZIP payload', { status: 200 });
        }
        return null;
      },
    ]);

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', manifestPath, '--confirm-publish'],
        env: { GITEE_TOKEN: token },
        fetchImpl,
        logger: { log: () => {} },
      }),
      /SHA-256/u,
    );
    assert.equal(fetchImpl.calls.some((call) => call.init.method === 'DELETE'), false);
    assert.equal(fetchImpl.calls.some((call) => call.url.includes('make-client-template-latest')), false);
  });

  it('rejects an existing versioned Gitee release with a different target commit', async () => {
    const token = 'test-token';
    const { manifestPath, zipBytes } = createFixture();
    const fetchImpl = createFetchMock([
      (url) => {
        if (url.includes('/releases/tags/make-client-template-v1.2.3-beta.4')) {
          return new Response(JSON.stringify({
            id: 42,
            tag_name: 'make-client-template-v1.2.3-beta.4',
            target_commitish: 'c'.repeat(40),
          }), { status: 200 });
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
          return new Response(zipBytes, { status: 200 });
        }
        return null;
      },
    ]);

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', manifestPath, '--confirm-publish'],
        env: { GITEE_TOKEN: token },
        fetchImpl,
        logger: { log: () => {} },
      }),
      /target commit/u,
    );
    assert.equal(fetchImpl.calls.some((call) => call.url.includes('/attach_files')), false);
    assert.equal(fetchImpl.calls.some((call) => call.url.includes('make-client-template-latest')), false);
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

  it('binds the Gitee target to the prepared source commit', async () => {
    const { manifestPath, sourceCommit } = createFixture();

    const result = await mirrorGitee.runGiteeMirrorRelease({
      argv: ['--manifest', manifestPath, '--dry-run'],
      env: {},
      fetchImpl: async () => {
        throw new Error('dry-run should not call fetch');
      },
      logger: { log: () => {} },
    });
    assert.equal(result.targetCommitish, sourceCommit);

    await assert.rejects(
      () => mirrorGitee.runGiteeMirrorRelease({
        argv: ['--manifest', manifestPath, '--target', 'main', '--dry-run'],
        env: {},
        fetchImpl: async () => {
          throw new Error('target validation must run before fetch');
        },
        logger: { log: () => {} },
      }),
      /target/u,
    );
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
