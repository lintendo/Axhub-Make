import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  initGitRepo,
  registerProject,
  scopeProjectApiUrl,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';
import { handleGitApi } from '../managementApi.git.ts';

const GIT_INTEGRATION_TIMEOUT_MS = 15_000;

async function commitAll(projectRoot: string, message: string) {
  const { execFile } = await import('node:child_process');
  const run = (args: string[]) => new Promise<void>((resolve, reject) => {
    execFile('git', args, { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || stdout || error.message)));
        return;
      }
      resolve();
    });
  });
  await run(['add', '.']);
  await run(['commit', '-m', message]);
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanupProjectApiTestRoots();
});

describe('make-server project git APIs', () => {
  it('exposes Git API handling from its domain module', () => {
    expect(handleGitApi).toBeTypeOf('function');
  });

  it('returns git-unavailable status for non-git projects and rejects root-escaping git paths', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'non-git', name: 'Non Git' },
    });
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'home'), { recursive: true });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'non-git', 'Non Git');
      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/status`));
      const statusBody = await status.json();
      expect(status.status).toBe(200);
      expect(statusBody).toMatchObject({
        available: false,
        code: 'git-unavailable',
        projectId: 'non-git',
      });

      const history = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/history?path=${encodeURIComponent('../outside')}`));
      const historyBody = await history.json();
      expect(history.status).toBe(403);
      expect(historyBody).toMatchObject({
        code: 'PATH_OUTSIDE_PROJECT',
      });
    } finally {
      await server.close();
    }
  });

  it('serves git history, diff, build-version, and version files from the selected project root', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot, {
      project: { id: 'git-client', name: 'Git Client' },
    });
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    await initGitRepo(projectRoot);
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return "changed"; }\n', 'utf8');

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'git-client', 'Git Client');
      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/status`)).then((response) => response.json());
      expect(status).toMatchObject({
        available: true,
        isGitRepo: true,
        hasCommits: true,
        projectId: 'git-client',
      });

      const history = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/history?path=${encodeURIComponent('prototypes/home')}`))
        .then((response) => response.json());
      expect(history).toMatchObject({
        historyReady: true,
        hasUncommitted: true,
        projectId: 'git-client',
      });
      expect(history.commits.length).toBeGreaterThan(0);
      const historyVersionId = history.commits[0].hash.slice(0, 8);
      const historyPrototypeUrl = `/prototypes/home?projectId=git-client&gitVersion=${historyVersionId}&gitPath=src%2Fprototypes%2Fhome`;
      expect(history.commits[0].prototypeUrl).toBe(historyPrototypeUrl);

      const versionEntryUrl = `${server.origin}/api/git/version-file/${historyVersionId}/prototypes/home/index.tsx?projectId=git-client`;
      expect((await fetch(versionEntryUrl)).status).toBe(404);

      const diff = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/diff?path=${encodeURIComponent('prototypes/home')}`))
        .then((response) => response.json());
      expect(diff.diff).toContain('changed');
      expect(diff.projectId).toBe('git-client');

      const version = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/build-version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home', commitHash: history.commits[0].hash }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(version).toMatchObject({
        status: 200,
        body: {
          success: true,
          hasPrototype: true,
          projectId: 'git-client',
        },
      });
      expect(version.body).not.toHaveProperty('hasSpec');
      expect(version.body).not.toHaveProperty('specUrl');
      expect(version.body.prototypeUrl).toBe(`/prototypes/home?projectId=git-client&gitVersion=${version.body.versionId}&gitPath=src%2Fprototypes%2Fhome`);
      expect(version.body.prototypeUrl).not.toContain('/api/git/version-file/');
      expect(version.body.prototypeUrl).not.toContain('/index.tsx');
      expect((await fetch(versionEntryUrl)).status).toBe(200);

      const missingMessage = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/commit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(missingMessage).toMatchObject({
        status: 400,
        body: { error: 'Missing message parameter' },
      });

      const committed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/commit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home', message: 'update home prototype' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(committed).toMatchObject({
        status: 200,
        body: {
          success: true,
          projectId: 'git-client',
        },
      });

      const updatedContent = 'export default function Home() { return "after commit"; }\n';
      fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), updatedContent, 'utf8');
      const missingCommitHash = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/restore`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(missingCommitHash).toMatchObject({
        status: 400,
        body: { error: 'Missing commitHash parameter' },
      });

      const restore = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/restore`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home', commitHash: history.commits[0].hash }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(restore).toMatchObject({
        status: 200,
        body: {
          success: true,
          projectId: 'git-client',
        },
      });
      expect(fs.readFileSync(path.join(prototypeDir, 'index.tsx'), 'utf8'))
        .toBe('export default function Home() { return null; }\n');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('omits prototype history entries that do not contain the current prototype entry', async () => {
    const projectRoot = createTempRoot('axhub-git-history-prototype-presence-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'git-history-prototype-presence', name: 'Git History Prototype Presence' },
    });
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return "v1"; }\n', 'utf8');
    await initGitRepo(projectRoot);
    fs.rmSync(path.join(prototypeDir, 'index.tsx'));
    await commitAll(projectRoot, '删除首页原型入口');
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return "v2"; }\n', 'utf8');
    await commitAll(projectRoot, '恢复首页原型入口');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'git-history-prototype-presence', 'Git History Prototype Presence');
      const history = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/history?path=${encodeURIComponent('prototypes/home')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(history.status).toBe(200);
      expect(history.body.commits).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: '恢复首页原型入口', hasPrototype: true }),
        expect.objectContaining({ message: 'initial', hasPrototype: true }),
      ]));
      expect(history.body.commits).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ message: '删除首页原型入口' }),
      ]));
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('resolves git target paths from prototype metadata and resource file paths', async () => {
    const projectRoot = createTempRoot();
    const prototypeDir = path.join(projectRoot, 'custom', 'screens', 'home');
    const docPath = path.join(projectRoot, 'src', 'resources', 'spec.md');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    fs.writeFileSync(docPath, '# Spec v1\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'metadata-git-client', name: 'Metadata Git Client' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: 'Home',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'custom/screens/home/index.tsx',
          },
        ],
        themes: [],
      },
    });
    await initGitRepo(projectRoot);
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return "metadata path"; }\n', 'utf8');
    fs.writeFileSync(docPath, '# Spec v2\n', 'utf8');

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'metadata-git-client', 'Metadata Git Client');
      const prototypeDiff = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/diff?path=${encodeURIComponent('prototypes/home')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(prototypeDiff.status).toBe(200);
      expect(prototypeDiff.body.diff).toContain('metadata path');
      expect(prototypeDiff.body.changedFiles).toEqual([
        expect.objectContaining({ file: 'custom/screens/home/index.tsx' }),
      ]);

      const docDiff = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/diff?path=${encodeURIComponent('src/resources/spec.md')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(docDiff.status).toBe(200);
      expect(docDiff.body.diff).toContain('Spec v2');
      expect(docDiff.body.changedFiles).toEqual([
        expect.objectContaining({ file: 'src/resources/spec.md' }),
      ]);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('builds historical prototype previews with files imported from outside the prototype directory', async () => {
    const projectRoot = createTempRoot('axhub-git-version-preview-deps-');
    const prototypeDir = path.join(projectRoot, 'custom', 'screens', 'home');
    const sharedDir = path.join(projectRoot, 'src', 'shared');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(path.join(sharedDir, 'Badge.tsx'), 'export function Badge() { return "shared"; }\n', 'utf8');
    fs.writeFileSync(
      path.join(prototypeDir, 'index.tsx'),
      'import { Badge } from "../../../src/shared/Badge";\nexport default function Home() { return Badge(); }\n',
      'utf8',
    );
    writeProjectMetadata(projectRoot, {
      project: { id: 'git-version-preview-deps', name: 'Git Version Preview Deps' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: 'Home',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'custom/screens/home/index.tsx',
          },
        ],
        themes: [],
      },
    });
    await initGitRepo(projectRoot);
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'git-version-preview-deps', 'Git Version Preview Deps');
      const history = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/history?path=${encodeURIComponent('prototypes/home')}`))
        .then((response) => response.json());
      const version = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/build-version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home', commitHash: history.commits[0].hash }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(version.status).toBe(200);
      expect(version.body.prototypeUrl).toBe(`/prototypes/home?projectId=git-version-preview-deps&gitVersion=${version.body.versionId}&gitPath=custom%2Fscreens%2Fhome`);
      expect(fs.existsSync(path.join(projectRoot, '.git-versions', version.body.versionId, 'custom', 'screens', 'home', 'index.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, '.git-versions', version.body.versionId, 'src', 'shared', 'Badge.tsx'))).toBe(true);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('builds historical prototype previews for non-ascii prototype paths without exposing git byte errors', async () => {
    const projectRoot = createTempRoot('axhub-git-version-preview-unicode-');
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', '未命名');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function UnicodeHome() { return null; }\n', 'utf8');
    fs.writeFileSync(path.join(prototypeDir, 'style.css'), '.unicode-home { color: blue; }\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'git-version-preview-unicode', name: 'Git Version Preview Unicode' },
      resources: {
        prototypes: [
          {
            id: 'unicode-home',
            name: '未命名',
            title: '未命名',
            clientUrl: 'http://localhost:3000/unicode-home',
            filePath: 'src/prototypes/未命名/index.tsx',
          },
        ],
        themes: [],
      },
    });
    await initGitRepo(projectRoot);
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'git-version-preview-unicode', 'Git Version Preview Unicode');
      const history = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/history?path=${encodeURIComponent('prototypes/未命名')}`))
        .then((response) => response.json());
      const version = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/build-version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/未命名', commitHash: history.commits[0].hash }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(version.status).toBe(200);
      expect(version.body).toMatchObject({
        success: true,
        hasPrototype: true,
        projectId: 'git-version-preview-unicode',
      });
      expect(version.body.prototypeUrl).toBe(`/prototypes/${encodeURIComponent('未命名')}?projectId=git-version-preview-unicode&gitVersion=${version.body.versionId}&gitPath=src%2Fprototypes%2F%E6%9C%AA%E5%91%BD%E5%90%8D`);
      expect(fs.existsSync(path.join(projectRoot, '.git-versions', version.body.versionId, 'src', 'prototypes', '未命名', 'index.tsx'))).toBe(true);
      const versionEntry = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/version-file/${version.body.versionId}/prototypes/${encodeURIComponent('未命名')}/index.tsx?projectId=git-version-preview-unicode`));
      expect(versionEntry.status).toBe(200);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('decodes git blob stderr as text when building a historical preview fails', async () => {
    const projectRoot = createTempRoot('axhub-git-version-preview-error-');
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'git-version-preview-error', name: 'Git Version Preview Error' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: 'Home',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
        ],
        themes: [],
      },
    });
    await initGitRepo(projectRoot);
    const commandExecutor = vi.fn(async (command: string, args: string[]) => {
      if (command !== 'git') throw new Error(command);
      if (args.join(' ') === '--version') return { stdout: 'git version 2.44.0', stderr: '' };
      if (args.join(' ') === 'rev-parse --is-inside-work-tree') return { stdout: 'true', stderr: '' };
      if (args.join(' ') === 'rev-parse --verify HEAD') return { stdout: 'HEAD', stderr: '' };
      if (args.join(' ') === 'status --porcelain -- src/prototypes/home') return { stdout: '', stderr: '' };
      if (args[0] === 'log') return { stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|Test User|test@example.com|1700000000|initial', stderr: '' };
      if (args[0] === 'cat-file') return { stdout: '', stderr: '' };
      if (args.join(' ') === 'ls-tree -rz --name-only aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') {
        return { stdout: 'src/prototypes/home/index.tsx\0', stderr: '' };
      }
      if (args[0] === 'show' && args[1] === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:src/prototypes/home/index.tsx') {
        const error = new Error('Git command failed') as Error & { stderr?: Uint8Array };
        error.stderr = new Uint8Array(Buffer.from("fatal: path 'src/prototypes/home/index.tsx' exists on disk, but not in 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'", 'utf8'));
        throw error;
      }
      if (args[0] === 'show') return { stdout: 'snapshot file\n', stderr: '' };
      throw new Error(`${command} ${args.join(' ')}`);
    });
    const server = await startTestServer(projectRoot, createTempRoot('axhub-git-version-preview-error-home-'), {
      gitWorkspaceCommandExecutor: commandExecutor,
    });

    try {
      await registerProject(server.origin, projectRoot, 'git-version-preview-error', 'Git Version Preview Error');
      const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/build-version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home', commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      }).then(async (res) => ({ status: res.status, body: await res.json() }));

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('这个历史版本文件不完整，无法预览当前原型。');
      expect(response.body.detail).toContain("fatal: path 'src/prototypes/home/index.tsx'");
      expect(response.body.detail).not.toMatch(/(?:\d{2,3},){3,}\d{2,3}/u);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('reports workspace git status with user-friendly change groups', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-status-');
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    const themeDir = path.join(projectRoot, 'design-systems', 'brand');
    const skillsDir = path.join(projectRoot, 'skills', 'writer');
    const rulesDir = path.join(projectRoot, 'rules');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.mkdirSync(themeDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    fs.writeFileSync(path.join(themeDir, 'index.tsx'), 'export default function Brand() { return null; }\n', 'utf8');
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '# Writer\n', 'utf8');
    fs.writeFileSync(path.join(rulesDir, 'product.md'), '# Product\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-git-client', name: 'Workspace Git Client' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: '首页原型',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
        ],
        docs: [],
        themes: [
          {
            id: 'brand',
            name: 'brand',
            title: '品牌主题',
            path: 'design-systems/brand/index.tsx',
          },
        ],
        data: [],
        templates: [],
      },
      resourceWriteTargets: {
        themes: { type: 'project-relative-path', path: 'design-systems' },
      },
    });
    await initGitRepo(projectRoot);
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return "changed"; }\n', 'utf8');
    const nestedPrototypeDir = path.join(projectRoot, 'client', 'src', 'prototypes', 'home');
    fs.mkdirSync(nestedPrototypeDir, { recursive: true });
    fs.writeFileSync(path.join(nestedPrototypeDir, 'canvas.excalidraw'), '{"type":"excalidraw"}\n', 'utf8');
    fs.writeFileSync(path.join(themeDir, 'index.tsx'), 'export default function Brand() { return "changed"; }\n', 'utf8');
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '# Writer v2\n', 'utf8');
    fs.writeFileSync(path.join(rulesDir, 'product.md'), '# Product v2\n', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'notes.txt'), 'loose note\n', 'utf8');

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-git-client', 'Workspace Git Client');
      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({
        available: true,
        projectId: 'workspace-git-client',
        hasChanges: true,
        currentBranch: expect.any(String),
      });
      expect(status.body.changeSummary.groups).toEqual(expect.arrayContaining([
        expect.objectContaining({
          key: 'prototypes',
          label: '原型',
          fileCount: 2,
          items: [expect.objectContaining({ name: '首页原型' })],
        }),
        expect.objectContaining({
          key: 'themes',
          label: '主题',
          fileCount: 1,
          items: [expect.objectContaining({ name: '品牌主题' })],
        }),
        expect.objectContaining({
          key: 'skills',
          label: '技能',
          fileCount: 1,
          items: [expect.objectContaining({ name: 'writer' })],
        }),
        expect.objectContaining({
          key: 'rules',
          label: '规范',
          fileCount: 1,
          items: [expect.objectContaining({ name: 'product.md' })],
        }),
        expect.objectContaining({
          key: 'other',
          label: '其他',
          items: expect.arrayContaining([expect.objectContaining({ name: 'notes.txt' })]),
        }),
      ]));
      const otherGroup = status.body.changeSummary.groups.find((group: any) => group.key === 'other');
      expect(otherGroup?.items || []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'canvas.excalidraw' }),
      ]));

      const missingBranch = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?branch=missing`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(missingBranch).toMatchObject({
        status: 404,
        body: { code: 'BRANCH_NOT_FOUND' },
      });
      expect(missingBranch.body).not.toHaveProperty('prompt');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('reports workspace current and historical version commit details', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-version-details-');
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return "v1"; }\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-version-details', name: 'Workspace Version Details' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: '首页原型',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
    });
    await initGitRepo(projectRoot);
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return "v2"; }\n', 'utf8');
    await commitAll(projectRoot, '更新首页原型到第二版');
    fs.writeFileSync(path.join(projectRoot, 'notes.txt'), 'dirty\n', 'utf8');

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-version-details', 'Workspace Version Details');

      const currentStatus = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(currentStatus.status).toBe(200);
      expect(currentStatus.body).toMatchObject({
        isHistoricalVersion: false,
        hasChanges: true,
        currentCommit: {
          hash: expect.stringMatching(/^[0-9a-f]{40}$/u),
          shortHash: expect.stringMatching(/^[0-9a-f]{7}$/u),
          message: '更新首页原型到第二版',
        },
      });
      expect(currentStatus.body.recentCommits).toEqual([
        expect.objectContaining({
          hash: currentStatus.body.currentCommit.hash,
          shortHash: currentStatus.body.currentCommit.shortHash,
          message: '更新首页原型到第二版',
          fullMessage: '更新首页原型到第二版',
        }),
        expect.objectContaining({
          hash: expect.stringMatching(/^[0-9a-f]{40}$/u),
          shortHash: expect.stringMatching(/^[0-9a-f]{7}$/u),
        }),
      ]);

      const historicalStatus = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?gitVersion=${currentStatus.body.currentCommit.shortHash}&branch=missing`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(historicalStatus.status).toBe(200);
      expect(historicalStatus.body).not.toHaveProperty('branchView');
      expect(historicalStatus.body).toMatchObject({
        isHistoricalVersion: true,
        hasChanges: true,
        changedFilesCount: 1,
        currentCommit: {
          hash: currentStatus.body.currentCommit.hash,
          shortHash: currentStatus.body.currentCommit.shortHash,
          message: '更新首页原型到第二版',
        },
      });
      expect(historicalStatus.body.changeSummary.groups).toEqual([
        expect.objectContaining({
          key: 'prototypes',
          fileCount: 1,
          items: [expect.objectContaining({ name: '首页原型' })],
        }),
      ]);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('automatically detects the origin remote when Make metadata is missing', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-detect-origin-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-detect-origin', name: 'Workspace Detect Origin' },
    });
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Detect origin\n', 'utf8');
    await initGitRepo(projectRoot);
    const { execFile } = await import('node:child_process');
    await new Promise<void>((resolve, reject) => {
      execFile(
        'git',
        ['remote', 'add', 'origin', 'git@gitee.com:axhub/workspace-detect-origin.git'],
        { cwd: projectRoot },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(String(stderr || stdout || error.message)));
            return;
          }
          resolve();
        },
      );
    });
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-detect-origin', 'Workspace Detect Origin');

      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body.remote).toEqual({
        url: 'git@gitee.com:axhub/workspace-detect-origin.git',
      });
      expect(status.body.remoteComparison.reason).not.toBe('remote-not-configured');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('filters workspace git status to a prototype path when requested', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-scoped-status-');
    const homeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    const aboutDir = path.join(projectRoot, 'src', 'prototypes', 'about');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(aboutDir, { recursive: true });
    fs.writeFileSync(path.join(homeDir, 'index.tsx'), 'export default function Home() { return "v1"; }\n', 'utf8');
    fs.writeFileSync(path.join(aboutDir, 'index.tsx'), 'export default function About() { return "v1"; }\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-scoped-status', name: 'Workspace Scoped Status' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: '首页原型',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
          {
            id: 'about',
            name: 'about',
            title: '关于原型',
            clientUrl: 'http://localhost:3000/about',
            filePath: 'src/prototypes/about/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
    });
    await initGitRepo(projectRoot);
    fs.writeFileSync(path.join(homeDir, 'index.tsx'), 'export default function Home() { return "v2"; }\n', 'utf8');
    fs.writeFileSync(path.join(aboutDir, 'index.tsx'), 'export default function About() { return "v2"; }\n', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-scoped-status', 'Workspace Scoped Status');

      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?path=${encodeURIComponent('prototypes/home')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({
        hasChanges: true,
        changedFilesCount: 1,
        changeSummary: {
          totalFiles: 1,
          groups: [
            expect.objectContaining({
              key: 'prototypes',
              fileCount: 1,
              items: [expect.objectContaining({ name: '首页原型' })],
            }),
          ],
        },
      });
      expect(JSON.stringify(status.body.changeSummary)).not.toContain('关于原型');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('commits only the requested prototype path through workspace commit', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-scoped-commit-');
    const homeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    const aboutDir = path.join(projectRoot, 'src', 'prototypes', 'about');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(aboutDir, { recursive: true });
    fs.writeFileSync(path.join(homeDir, 'index.tsx'), 'export default function Home() { return "v1"; }\n', 'utf8');
    fs.writeFileSync(path.join(aboutDir, 'index.tsx'), 'export default function About() { return "v1"; }\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-scoped-commit', name: 'Workspace Scoped Commit' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: '首页原型',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
          {
            id: 'about',
            name: 'about',
            title: '关于原型',
            clientUrl: 'http://localhost:3000/about',
            filePath: 'src/prototypes/about/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
    });
    await initGitRepo(projectRoot);
    fs.writeFileSync(path.join(homeDir, 'index.tsx'), 'export default function Home() { return "home v2"; }\n', 'utf8');
    fs.writeFileSync(path.join(aboutDir, 'index.tsx'), 'export default function About() { return "about v2"; }\n', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-scoped-commit', 'Workspace Scoped Commit');

      const committed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/commit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'prototypes/home', message: '更新首页原型' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(committed.status).toBe(200);
      const homeStatus = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?path=${encodeURIComponent('prototypes/home')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      const aboutStatus = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?path=${encodeURIComponent('prototypes/about')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(homeStatus.body).toMatchObject({
        hasChanges: false,
        changedFilesCount: 0,
      });
      expect(aboutStatus.body).toMatchObject({
        hasChanges: true,
        changedFilesCount: 1,
      });
      expect(JSON.stringify(aboutStatus.body.changeSummary)).toContain('关于原型');
      expect(JSON.stringify(aboutStatus.body.changeSummary)).not.toContain('首页原型');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('reports online-only and local-only workspace differences for connected remotes', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-remote-comparison-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-remote-comparison', name: 'Workspace Remote Comparison' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: '首页原型',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
    });
    fs.mkdirSync(path.join(projectRoot, '.axhub', 'make'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), JSON.stringify({
      versionCollaboration: {
        remote: {
          url: 'https://example.com/team/workspace-remote-comparison.git',
          defaultBranch: 'main',
        },
      },
    }), 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Remote comparison\n', 'utf8');
    await initGitRepo(projectRoot);
    const commandExecutor = vi.fn(async (command: string, args: string[], options: { cwd: string }) => {
      if (command !== 'git') throw new Error(command);
      if (args.join(' ') === '--version') return { stdout: 'git version 2.44.0', stderr: '' };
      if (args.join(' ') === 'rev-parse --is-inside-work-tree') return { stdout: 'true', stderr: '' };
      if (args.join(' ') === 'rev-parse --verify HEAD') return { stdout: 'HEAD', stderr: '' };
      if (args.join(' ') === 'branch --show-current') return { stdout: 'feature', stderr: '' };
      if (args.join(' ') === 'status --porcelain -uall') return { stdout: '', stderr: '' };
      if (args.join(' ') === 'branch --format=%(refname:short)') return { stdout: 'feature', stderr: '' };
      if (args.join(' ') === 'branch -r --format=%(refname:short)') return { stdout: 'origin/main\norigin/feature', stderr: '' };
      if (args.join(' ') === 'rev-parse --verify origin/main') return { stdout: 'origin/main', stderr: '' };
      if (args.join(' ') === 'rev-parse --verify origin/feature') return { stdout: 'origin/feature', stderr: '' };
      if (args.join(' ') === 'diff --name-status HEAD..origin/main') {
        return { stdout: 'M\tsrc/prototypes/home/index.tsx\nA\tclient/src/prototypes/home/canvas.excalidraw', stderr: '' };
      }
      if (args.join(' ') === 'diff --name-status origin/main..HEAD') {
        return { stdout: 'M\tskills/writer/SKILL.md\nM\tpackage.json', stderr: '' };
      }
      if (args.join(' ') === 'diff --name-status feature..origin/feature') return { stdout: '', stderr: '' };
      if (args.join(' ') === 'diff --name-status origin/feature..feature') return { stdout: '', stderr: '' };
      if (args[0] === 'log' && args[1] === '-1' && args[2]?.startsWith('--pretty=format:')) {
        const ref = args[3] || '';
        if (ref === 'HEAD') {
          return { stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|Local User|local@example.com|1700000300|本地版本头', stderr: '' };
        }
        if (ref === 'origin/main') {
          return { stdout: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|Remote User|remote@example.com|1700000200|线上版本头', stderr: '' };
        }
      }
      if (args[0] === 'log' && args[1]?.startsWith('--pretty=format:') && args[2] === 'HEAD..origin/main') {
        return {
          stdout: [
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\x1fRemote User\x1fremote@example.com\x1f1700000200\x1f线上版本头\n\n完整线上更新日志\x1e',
            'cccccccccccccccccccccccccccccccccccccccc\x1fDesigner\x1fdesigner@example.com\x1f1700000100\x1f补充首页素材\x1e',
          ].join(''),
          stderr: '',
        };
      }
      if (args[0] === 'log' && args[1]?.startsWith('--pretty=format:') && args[2] === 'origin/main..HEAD') {
        return {
          stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x1fLocal User\x1flocal@example.com\x1f1700000300\x1f本地版本头\x1e',
          stderr: '',
        };
      }
      throw new Error(`${command} ${args.join(' ')} in ${options.cwd}`);
    });
    const server = await startTestServer(projectRoot, createTempRoot('axhub-workspace-git-remote-comparison-home-'), {
      gitWorkspaceCommandExecutor: commandExecutor,
    });

    try {
      await registerProject(server.origin, projectRoot, 'workspace-remote-comparison', 'Workspace Remote Comparison');

      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body.remoteComparison).toMatchObject({
        available: true,
        branch: 'main',
        targetRef: 'origin/main',
        localHead: expect.objectContaining({
          shortHash: 'aaaaaaa',
          message: '本地版本头',
          author: 'Local User',
        }),
        remoteHead: expect.objectContaining({
          shortHash: 'bbbbbbb',
          message: '线上版本头',
          author: 'Remote User',
        }),
        aheadCount: 1,
        behindCount: 2,
        incomingCommits: [
          expect.objectContaining({
            shortHash: 'bbbbbbb',
            message: '线上版本头',
            fullMessage: '线上版本头\n\n完整线上更新日志',
          }),
          expect.objectContaining({
            shortHash: 'ccccccc',
            message: '补充首页素材',
          }),
        ],
        outgoingCommits: [
          expect.objectContaining({
            shortHash: 'aaaaaaa',
            message: '本地版本头',
          }),
        ],
        incoming: {
          totalFiles: 2,
          groups: [
            expect.objectContaining({
              key: 'prototypes',
              fileCount: 2,
              items: [expect.objectContaining({ name: '首页原型' })],
            }),
          ],
        },
        outgoing: {
          totalFiles: 2,
          groups: expect.arrayContaining([
            expect.objectContaining({
              key: 'skills',
              items: [expect.objectContaining({ name: 'writer' })],
            }),
            expect.objectContaining({
              key: 'other',
              items: [expect.objectContaining({ name: 'package.json' })],
            }),
          ]),
        },
      });
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('uses explicit refs for branch views and never executes branch mutations', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-explicit-branch-view-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-explicit-branch-view', name: 'Workspace Explicit Branch View' },
    });
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Main\n', 'utf8');
    await initGitRepo(projectRoot);

    const { execFile } = await import('node:child_process');
    const run = (command: string, args: string[], cwd: string) => new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(command, args, { cwd }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ stdout: String(stdout), stderr: String(stderr) });
        });
      },
    );
    const runGit = async (args: string[]) => (await run('git', args, projectRoot)).stdout.trim();

    const workspaceBranch = await runGit(['branch', '--show-current']);
    const workspaceHead = await runGit(['rev-parse', 'HEAD']);
    await runGit(['switch', '-c', 'feature']);
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Feature\n', 'utf8');
    await commitAll(projectRoot, 'feature version');
    const featureHead = await runGit(['rev-parse', 'HEAD']);
    await runGit(['switch', workspaceBranch]);
    await runGit(['update-ref', `refs/remotes/origin/${workspaceBranch}`, workspaceHead]);
    await runGit(['update-ref', 'refs/remotes/origin/feature', featureHead]);
    fs.writeFileSync(path.join(projectRoot, 'scratch.txt'), 'dirty\n', 'utf8');
    fs.mkdirSync(path.join(projectRoot, '.axhub', 'make'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), JSON.stringify({
      versionCollaboration: {
        remote: {
          url: 'https://example.com/team/branch-view.git',
          defaultBranch: workspaceBranch,
        },
      },
    }), 'utf8');

    const commandExecutor = vi.fn((command: string, args: string[], options: { cwd: string }) => (
      run(command, args, options.cwd).then((result) => ({
        stdout: result.stdout.trimEnd(),
        stderr: result.stderr.trimEnd(),
      }))
    ));
    const server = await startTestServer(
      projectRoot,
      createTempRoot('axhub-workspace-git-explicit-branch-view-home-'),
      { gitWorkspaceCommandExecutor: commandExecutor },
    );

    try {
      await registerProject(
        server.origin,
        projectRoot,
        'workspace-explicit-branch-view',
        'Workspace Explicit Branch View',
      );
      const status = await fetch(
        scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?branch=feature&remoteBranch=feature`),
      ).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({
        currentBranch: workspaceBranch,
        hasChanges: true,
        branchView: {
          branch: 'feature',
          remoteBranch: 'feature',
          commit: { hash: featureHead },
        },
      });
      expect(commandExecutor).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-status', 'feature..origin/feature'],
        { cwd: projectRoot },
      );
      expect(commandExecutor).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-status', 'origin/feature..feature'],
        { cwd: projectRoot },
      );

      const forbidden = new Set(['switch', 'checkout', 'merge', 'rebase', 'reset', 'stash']);
      for (const [, args] of commandExecutor.mock.calls) {
        expect(forbidden.has(args[0])).toBe(false);
        expect(args.slice(0, 2)).not.toEqual(['branch', '-f']);
      }

      commandExecutor.mockClear();
      const missingRemote = await fetch(
        scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?branch=feature&remoteBranch=missing`),
      ).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(missingRemote.status).toBe(200);
      expect(missingRemote.body.branchView.remoteComparison).toMatchObject({
        available: false,
        reason: 'remote-branch-missing',
      });
      expect(commandExecutor.mock.calls.some(([, args]) => args.some((arg) => arg.includes('origin/missing')))).toBe(false);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('filters online differences to a prototype path when requested', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-scoped-remote-comparison-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-scoped-remote-comparison', name: 'Workspace Scoped Remote Comparison' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: '首页原型',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
          {
            id: 'about',
            name: 'about',
            title: '关于原型',
            clientUrl: 'http://localhost:3000/about',
            filePath: 'src/prototypes/about/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
    });
    fs.mkdirSync(path.join(projectRoot, '.axhub', 'make'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), JSON.stringify({
      versionCollaboration: {
        remote: {
          url: 'https://example.com/team/workspace-scoped-remote-comparison.git',
          defaultBranch: 'main',
        },
      },
    }), 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Remote comparison\n', 'utf8');
    await initGitRepo(projectRoot);
    const commandExecutor = vi.fn(async (command: string, args: string[], options: { cwd: string }) => {
      if (command !== 'git') throw new Error(command);
      if (args.join(' ') === '--version') return { stdout: 'git version 2.44.0', stderr: '' };
      if (args.join(' ') === 'rev-parse --is-inside-work-tree') return { stdout: 'true', stderr: '' };
      if (args.join(' ') === 'rev-parse --verify HEAD') return { stdout: 'HEAD', stderr: '' };
      if (args.join(' ') === 'branch --show-current') return { stdout: 'feature', stderr: '' };
      if (args.join(' ') === 'status --porcelain -uall') return { stdout: '', stderr: '' };
      if (args.join(' ') === 'branch --format=%(refname:short)') return { stdout: 'feature', stderr: '' };
      if (args.join(' ') === 'branch -r --format=%(refname:short)') return { stdout: 'origin/main\norigin/feature', stderr: '' };
      if (args.join(' ') === 'rev-parse --verify origin/main') return { stdout: 'origin/main', stderr: '' };
      if (args.join(' ') === 'rev-parse --verify origin/feature') return { stdout: 'origin/feature', stderr: '' };
      if (args.join(' ') === 'diff --name-status HEAD..origin/main') {
        return { stdout: 'M\tsrc/prototypes/home/index.tsx\nM\tsrc/prototypes/about/index.tsx', stderr: '' };
      }
      if (args.join(' ') === 'diff --name-status origin/main..HEAD') {
        return { stdout: 'M\tsrc/prototypes/home/style.css\nM\tsrc/prototypes/about/style.css', stderr: '' };
      }
      if (args.join(' ') === 'diff --name-status feature..origin/feature') return { stdout: '', stderr: '' };
      if (args.join(' ') === 'diff --name-status origin/feature..feature') return { stdout: '', stderr: '' };
      if (args[0] === 'log') {
        return { stdout: '1111111111111111111111111111111111111111|Test User|test@example.com|1700000000|initial', stderr: '' };
      }
      throw new Error(`${command} ${args.join(' ')} in ${options.cwd}`);
    });
    const server = await startTestServer(projectRoot, createTempRoot('axhub-workspace-git-scoped-remote-comparison-home-'), {
      gitWorkspaceCommandExecutor: commandExecutor,
    });

    try {
      await registerProject(server.origin, projectRoot, 'workspace-scoped-remote-comparison', 'Workspace Scoped Remote Comparison');

      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?path=${encodeURIComponent('prototypes/home')}`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body.remoteComparison).toMatchObject({
        available: true,
        incoming: {
          totalFiles: 1,
          groups: [
            expect.objectContaining({
              key: 'prototypes',
              fileCount: 1,
              items: [expect.objectContaining({ name: '首页原型' })],
            }),
          ],
        },
        outgoing: {
          totalFiles: 1,
          groups: [
            expect.objectContaining({
              key: 'prototypes',
              fileCount: 1,
              items: [expect.objectContaining({ name: '首页原型' })],
            }),
          ],
        },
      });
      expect(JSON.stringify(status.body.remoteComparison)).not.toContain('关于原型');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('reports committed local files as pending online sync when the remote branch does not exist yet', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-missing-remote-branch-');
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', 'home');
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-missing-remote-branch', name: 'Workspace Missing Remote Branch' },
      resources: {
        prototypes: [
          {
            id: 'home',
            name: 'home',
            title: '首页原型',
            clientUrl: 'http://localhost:3000/home',
            filePath: 'src/prototypes/home/index.tsx',
          },
        ],
        docs: [],
        themes: [],
        data: [],
        templates: [],
      },
    });
    fs.mkdirSync(path.join(projectRoot, '.axhub', 'make'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), JSON.stringify({
      versionCollaboration: {
        remote: {
          url: 'https://example.com/team/workspace-missing-remote-branch.git',
          defaultBranch: 'main',
        },
      },
    }), 'utf8');
    await initGitRepo(projectRoot);
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-missing-remote-branch', 'Workspace Missing Remote Branch');

      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body.remoteComparison).toMatchObject({
        available: true,
        reason: 'remote-branch-missing',
        branch: 'main',
        targetRef: 'origin/main',
        incoming: { totalFiles: 0, groups: [] },
        outgoing: {
          totalFiles: expect.any(Number),
          groups: expect.arrayContaining([
            expect.objectContaining({
              key: 'prototypes',
              items: [expect.objectContaining({ name: '首页原型' })],
            }),
          ]),
        },
      });
      expect(status.body.remoteComparison.outgoing.totalFiles).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('supports workspace init, remote configuration, commit, and safe sync guards', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-actions-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-actions', name: 'Workspace Actions' },
    });
    fs.mkdirSync(path.join(projectRoot, 'src', 'prototypes', 'home'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'home', 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-actions', 'Workspace Actions');

      const init = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/init`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(init.status).toBe(200);
      expect(init.body).toMatchObject({ success: true, initialized: true });

      fs.writeFileSync(path.join(projectRoot, 'src', 'prototypes', 'home', 'index.tsx'), 'export default function Home() { return "v2"; }\n', 'utf8');
      const committed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/commit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '更新首页原型' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(committed.status).toBe(200);
      expect(committed.body).toMatchObject({ success: true });

      const remote = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/remote`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/team/workspace-actions.git', defaultBranch: 'main' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(remote.status).toBe(200);
      expect(remote.body).toMatchObject({
        success: true,
        remote: {
          url: 'https://example.com/team/workspace-actions.git',
          defaultBranch: 'main',
        },
      });
      const config = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
      expect(config.versionCollaboration).toEqual({
        remote: {
          url: 'https://example.com/team/workspace-actions.git',
          defaultBranch: 'main',
        },
      });

      fs.writeFileSync(path.join(projectRoot, 'scratch.txt'), 'dirty\n', 'utf8');
      const syncDown = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/sync-down`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(syncDown.status).toBe(409);
      expect(syncDown.body).toMatchObject({
        code: 'DIRTY_WORKTREE',
        promptScene: 'merge-required',
      });
      expect(syncDown.body.prompt).toContain('不要自动合并');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('reads another branch without switching HEAD or rejecting a dirty worktree', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-branch-view-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-branch-view', name: 'Workspace Branch View' },
    });
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Main\n', 'utf8');
    await initGitRepo(projectRoot);

    const { execFile } = await import('node:child_process');
    const runGit = (args: string[]) => new Promise<string>((resolve, reject) => {
      execFile('git', args, { cwd: projectRoot }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr || stdout || error.message)));
          return;
        }
        resolve(String(stdout).trim());
      });
    });

    const workspaceBranch = await runGit(['branch', '--show-current']);
    await runGit(['switch', '-c', 'feature']);
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Feature\n', 'utf8');
    await commitAll(projectRoot, 'feature version');
    const featureHead = await runGit(['rev-parse', 'HEAD']);
    await runGit(['switch', workspaceBranch]);
    fs.writeFileSync(path.join(projectRoot, 'scratch.txt'), 'dirty\n', 'utf8');

    const server = await startTestServer(projectRoot);

    try {
      await registerProject(server.origin, projectRoot, 'workspace-branch-view', 'Workspace Branch View');

      const status = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/status?branch=feature`))
        .then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({
        currentBranch: workspaceBranch,
        hasChanges: true,
        branchView: {
          branch: 'feature',
          commit: { hash: featureHead, message: 'feature version' },
          recentCommits: expect.arrayContaining([expect.objectContaining({ hash: featureHead })]),
        },
      });
      expect(await runGit(['branch', '--show-current'])).toBe(workspaceBranch);
      expect(await runGit(['status', '--porcelain'])).toContain('scratch.txt');

      const removedSwitchRoute = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/branch`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'feature' }),
      });
      expect(removedSwitchRoute.status).toBe(404);
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('creates remote repositories through lightweight CLI detection and falls back to AI prompts', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-create-remote-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-create-remote', name: 'Workspace Create Remote' },
    });
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Remote\n', 'utf8');
    await initGitRepo(projectRoot);
    const commands: Array<{ command: string; args: string[] }> = [];
    const commandExecutor = vi.fn(async (command: string, args: string[]) => {
      commands.push({ command, args });
      if (command === 'git') {
        if (args[0] === '--version') return { stdout: 'git version 2.44.0', stderr: '' };
        if (args.join(' ') === 'rev-parse --is-inside-work-tree') return { stdout: 'true', stderr: '' };
        if (args.join(' ') === 'rev-parse --verify HEAD') return { stdout: 'HEAD', stderr: '' };
        if (args.join(' ') === 'branch --show-current') return { stdout: 'main', stderr: '' };
        if (args.join(' ') === 'branch --format=%(refname:short)') return { stdout: 'main', stderr: '' };
        if (args.join(' ') === 'branch -r --format=%(refname:short)') return { stdout: '', stderr: '' };
        if (args.join(' ') === 'status --porcelain -uall') return { stdout: '', stderr: '' };
        if (args[0] === 'remote') return { stdout: '', stderr: '' };
      }
      if (command === 'gh') {
        return { stdout: 'created', stderr: '' };
      }
      throw new Error(`${command} ${args.join(' ')}`);
    });
    const server = await startTestServer(projectRoot, createTempRoot('axhub-workspace-git-create-remote-home-'), {
      gitWorkspaceCommandExecutor: commandExecutor,
    });

    try {
      await registerProject(server.origin, projectRoot, 'workspace-create-remote', 'Workspace Create Remote');

      const created = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/create-remote-repository`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://github.com/acme/workspace-create-remote.git', visibility: 'private' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({
        success: true,
        mode: 'gh',
        remote: { url: 'https://github.com/acme/workspace-create-remote.git' },
      });
      expect(commands).toContainEqual({
        command: 'gh',
        args: ['repo', 'create', 'acme/workspace-create-remote', '--private', '--source=.', '--remote=origin', '--confirm'],
      });

      const createdByName = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/create-remote-repository`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryName: 'workspace-create-remote-name', visibility: 'public' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(createdByName.status).toBe(200);
      expect(createdByName.body).toMatchObject({
        success: true,
        mode: 'gh',
      });
      expect(commands).toContainEqual({
        command: 'gh',
        args: ['repo', 'create', 'workspace-create-remote-name', '--public', '--source=.', '--remote=origin', '--confirm'],
      });

      const fallback = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/create-remote-repository`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'ssh://git.example.internal/team/workspace-create-remote.git' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));
      expect(fallback.status).toBe(409);
      expect(fallback.body).toMatchObject({
        code: 'CREATE_REMOTE_PROMPT_REQUIRED',
        promptScene: 'create-remote',
      });
      expect(fallback.body.prompt).toContain('目标仓库地址：ssh://git.example.internal/team/workspace-create-remote.git');
      expect(fallback.body.prompt).toContain('请根据仓库地址判断平台');
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);

  it('persists the origin remote created by the repository CLI', async () => {
    const projectRoot = createTempRoot('axhub-workspace-git-persist-created-remote-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'workspace-persist-created-remote', name: 'Workspace Persist Created Remote' },
    });
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Created remote\n', 'utf8');
    await initGitRepo(projectRoot);
    let originUrl = '';
    const commandExecutor = vi.fn(async (command: string, args: string[]) => {
      if (command === 'git') {
        if (args[0] === '--version') return { stdout: 'git version 2.44.0', stderr: '' };
        if (args.join(' ') === 'rev-parse --is-inside-work-tree') return { stdout: 'true', stderr: '' };
        if (args.join(' ') === 'rev-parse --verify HEAD') return { stdout: 'HEAD', stderr: '' };
        if (args.join(' ') === 'branch --show-current') return { stdout: 'main', stderr: '' };
        if (args.join(' ') === 'branch --format=%(refname:short)') return { stdout: 'main', stderr: '' };
        if (args.join(' ') === 'branch -r --format=%(refname:short)') return { stdout: '', stderr: '' };
        if (args.join(' ') === 'status --porcelain -uall') return { stdout: '', stderr: '' };
        if (args.join(' ') === 'remote get-url origin' && originUrl) return { stdout: originUrl, stderr: '' };
        if (args[0] === 'remote') throw new Error('origin is not configured');
      }
      if (command === 'gh') {
        originUrl = 'git@github.com:acme/workspace-created.git';
        return { stdout: 'created', stderr: '' };
      }
      throw new Error(`${command} ${args.join(' ')}`);
    });
    const server = await startTestServer(projectRoot, createTempRoot('axhub-workspace-git-persist-created-remote-home-'), {
      gitWorkspaceCommandExecutor: commandExecutor,
    });

    try {
      await registerProject(server.origin, projectRoot, 'workspace-persist-created-remote', 'Workspace Persist Created Remote');

      const created = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/git/workspace/create-remote-repository`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryName: 'acme/workspace-created', visibility: 'private' }),
      }).then(async (response) => ({ status: response.status, body: await response.json() }));

      expect(created.status).toBe(200);
      expect(created.body.remote).toEqual({
        url: 'git@github.com:acme/workspace-created.git',
      });
      expect(commandExecutor).toHaveBeenCalledWith(
        'gh',
        ['repo', 'create', 'acme/workspace-created', '--private', '--source=.', '--remote=origin', '--confirm'],
        { cwd: projectRoot },
      );
      const config = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
      expect(config.versionCollaboration.remote).toEqual({
        url: 'git@github.com:acme/workspace-created.git',
      });
    } finally {
      await server.close();
    }
  }, GIT_INTEGRATION_TIMEOUT_MS);
});
