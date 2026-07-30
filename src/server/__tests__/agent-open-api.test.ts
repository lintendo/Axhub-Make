import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getGlobalServerConfigPath,
  getMakeClientMarkerPath,
  getProjectMetadataPath,
  getProjectRegistryPath,
} from '../projectCore/index.ts';

const childProcessMock = vi.hoisted(() => ({
  exec: vi.fn((_command: string, callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
    callback(null, '', '');
  }),
  execFile: vi.fn((_file: string, _args: string[], optionsOrCallback?: unknown, maybeCallback?: unknown) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (typeof callback === 'function') {
      callback(null, '', '');
    }
  }),
  spawn: vi.fn(() => {
    const child = {
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'spawn') {
          setTimeout(callback, 0);
        }
        if (event === 'close') {
          setTimeout(() => callback(), 0);
        }
        return child;
      }),
      kill: vi.fn(),
      unref: vi.fn(),
      stderr: {
        on: vi.fn(),
      },
    };
    return child;
  }),
  spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
}));

vi.mock('node:child_process', () => childProcessMock);

vi.mock('../localCommand.ts', async (importActual) => {
  const actual = await importActual<typeof import('../localCommand.ts')>();
  return {
    ...actual,
    runLocalCommand: vi.fn(async (command: string, args: string[]) => ({
      stdout: '',
      stderr: '',
      command,
      escapedCommand: [command, ...args].join(' '),
    })),
  };
});

const originalFetch = globalThis.fetch.bind(globalThis);
const fetchMock = vi.fn(originalFetch);

const { runLocalCommand } = await import('../localCommand.ts');
const { startMakeServer } = await import('../index.ts');
const {
  buildLocalAppOpenCommandForPlatform,
  buildLocalAppOpenResultForPlatform,
  getMissingCLIAgentOpenError,
  getMissingLocalAppOpenError,
  getMissingWebAgentOpenError,
  openCLIAgent,
  openLocalAppAgent,
  openWebAgent,
  readManagedOpenCodeServerUrl,
} = await import('../agentOpen.ts');

const runLocalCommandMock = vi.mocked(runLocalCommand);

const tempRoots: string[] = [];

function createSpawnChildMock() {
  const child = {
    once: vi.fn((event: string, callback: (...args: any[]) => void) => {
      if (event === 'spawn') {
        setTimeout(callback, 0);
      }
      if (event === 'close') {
        setTimeout(() => callback(), 0);
      }
      return child;
    }),
    kill: vi.fn(),
    unref: vi.fn(),
    stderr: {
      on: vi.fn(),
    },
  };
  return child;
}

function createTempRoot(prefix = 'axhub-make-agent-open-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeProjectMetadata(projectRoot: string, projectId = 'agent-client', projectName = 'Agent Client') {
  writeJson(getMakeClientMarkerPath(projectRoot), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
    project: { id: projectId, name: projectName },
  });
  writeJson(path.join(projectRoot, 'package.json'), {
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
  });
  writeJson(getProjectMetadataPath(projectRoot), {
    schemaVersion: 1,
    project: { id: projectId, name: projectName },
    resources: {
      prototypes: [],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: { prototypes: [], docs: [] },
    orders: { themes: [], data: [], templates: [] },
    capabilities: { quickEdit: true, figmaExport: false, axureExport: false, multiDevicePreview: true },
  });
}

async function startTestServer(projectRoot: string, options: { serverConfig?: unknown } = {}) {
  const registryHome = createTempRoot('axhub-make-agent-open-registry-');
  const now = new Date().toISOString();
  writeJson(getProjectRegistryPath(registryHome), {
    schemaVersion: 1,
    activeProjectId: 'agent-client',
    projects: [{
      id: 'agent-client',
      name: 'Agent Client',
      root: projectRoot,
      metadataPath: getProjectMetadataPath(projectRoot),
      createdAt: now,
      updatedAt: now,
    }],
  });
  if (options.serverConfig) {
    writeJson(getGlobalServerConfigPath(registryHome), options.serverConfig);
  }
  return startMakeServer({
    projectRoot,
    host: 'localhost',
    port: 0,
    adminRoot: path.join(projectRoot, 'missing-admin'),
    registryPath: getProjectRegistryPath(registryHome),
  });
}

function projectApiUrl(origin: string, pathname: string, projectId = 'agent-client'): string {
  const url = new URL(pathname, origin);
  if (!url.searchParams.has('projectId')) {
    url.searchParams.set('projectId', projectId);
  }
  return url.toString();
}

function mockDetectedCommands(commands: string[]) {
  childProcessMock.spawnSync.mockImplementation((...input: unknown[]) => {
    const command = String(input[0] || '');
    const args = Array.isArray(input[1]) ? input[1] : [];
    const shellCommand = command.endsWith('sh') || command.endsWith('zsh') || command.endsWith('bash')
      ? String(args[args.length - 1] || '')
      : '';
    const matched = commands.find((candidate) => (
      String(args[0] || '') === candidate
      || shellCommand.includes(`command -v ${candidate}`)
    ));
    if (matched) {
      return { status: 0, stdout: `/usr/local/bin/${matched}\n`, stderr: '' };
    }
    return { status: 1, stdout: '', stderr: '' };
  });
}

function listenOnLocalPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, 'localhost', () => resolve(server));
  });
}

function closeNetServer(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  runLocalCommandMock.mockReset();
  runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => ({
    stdout: '',
    stderr: '',
    command,
    escapedCommand: [command, ...args].join(' '),
  }));
  fetchMock.mockReset();
  fetchMock.mockImplementation(originalFetch);
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('make-server agent open API', () => {
  it('keeps agent availability out of config because the open menu is fixed', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['codex', 'opencode', 'npx']);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/config'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agentAvailability).toEqual({
        cli: {},
        localApp: {},
        web: {},
      });
    } finally {
      await server.close();
    }
  });

  it('detects local AI agent versions on demand without the config availability endpoint', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const match = url.match(/^https:\/\/registry\.npmjs\.org\/([^/]+)\/latest$/u);
      if (match) {
        const packageName = decodeURIComponent(match[1] || '');
        const versions: Record<string, string> = {
          '@openai/codex': '1.3.0',
          '@anthropic-ai/claude-code': '2.4.0',
          'opencode-ai': '1.5.0',
          '@qoder-ai/qodercli': '0.2.16',
          '@tencent-ai/codebuddy-code': '2.45.0',
          reasonix: '1.9.1',
          '@xai-official/grok': '0.2.94',
        };
        return new Response(JSON.stringify({ version: versions[packageName] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    });
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if (args.includes('--version')) {
        if (command === 'codex') return { command, escapedCommand: 'codex --version', stdout: 'codex-cli 1.2.3\n', stderr: '' };
        if (command === 'claude') return { command, escapedCommand: 'claude --version', stdout: 'Claude Code 2.3.4 (Claude Code)\n', stderr: '' };
        if (command === 'opencode') throw Object.assign(new Error('command not found'), { code: 'ENOENT' });
        if (command === 'agent') return { command, escapedCommand: 'agent --version', stdout: 'Cursor Agent 0.50.0\n', stderr: '' };
        if (command === 'qodercli') return { command, escapedCommand: 'qodercli --version', stdout: 'qodercli 0.2.15\n', stderr: '' };
        if (command === 'codebuddy') return { command, escapedCommand: 'codebuddy --version', stdout: 'CodeBuddy Code 2.44.0\n', stderr: '' };
        if (command === 'reasonix') throw Object.assign(new Error('unknown flag: --version'), { code: 'EXIT_CODE' });
        if (command === 'grok') return { command, escapedCommand: 'grok --version', stdout: 'grok 0.2.93\n', stderr: '' };
      }
      if (command === 'reasonix' && args[0] === 'version') {
        return { command, escapedCommand: 'reasonix version', stdout: 'Reasonix CLI v1.8.0\n', stderr: '' };
      }
      return { command, escapedCommand: [command, ...args].join(' '), stdout: '', stderr: '' };
    });

    const server = await startTestServer(projectRoot);

    try {
      const configAvailabilityResponse = await fetch(projectApiUrl(server.origin, '/api/config/availability'));
      expect(configAvailabilityResponse.status).toBe(200);
      expect(runLocalCommandMock).not.toHaveBeenCalledWith(
        expect.stringMatching(/^(codex|claude|opencode)$/u),
        ['--version'],
        expect.any(Object),
      );

      runLocalCommandMock.mockClear();
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/versions'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        agents: {
          codex: { status: 'installed', version: '1.2.3' },
          claude: { status: 'installed', version: '2.3.4' },
          claudecode: { status: 'installed', version: '2.3.4' },
          opencode: { status: 'missing' },
          cursor: { status: 'installed', version: '0.50.0' },
          qoder: { status: 'installed', version: '0.2.15' },
          codebuddy: { status: 'installed', version: '2.44.0' },
          reasonix: { status: 'installed', version: '1.8.0' },
          'grok-build': { status: 'installed', version: '0.2.93' },
        },
        latestAgents: {
          codex: { status: 'installed', version: '1.3.0', packageName: '@openai/codex' },
          claude: { status: 'installed', version: '2.4.0', packageName: '@anthropic-ai/claude-code' },
          claudecode: { status: 'installed', version: '2.4.0', packageName: '@anthropic-ai/claude-code' },
          opencode: { status: 'installed', version: '1.5.0', packageName: 'opencode-ai' },
          qoder: { status: 'installed', version: '0.2.16', packageName: '@qoder-ai/qodercli' },
          codebuddy: { status: 'installed', version: '2.45.0', packageName: '@tencent-ai/codebuddy-code' },
          reasonix: { status: 'installed', version: '1.9.1', packageName: 'reasonix' },
          'grok-build': { status: 'installed', version: '0.2.94', packageName: '@xai-official/grok' },
        },
      });
      expect(body.agents.codex.checkedAt).toEqual(expect.any(String));
      expect(body.latestAgents.codex.checkedAt).toEqual(expect.any(String));
      expect(runLocalCommandMock).toHaveBeenCalledWith('codex', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('claude', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('opencode', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('agent', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('qodercli', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('codebuddy', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('reasonix', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('reasonix', ['version'], expect.any(Object));
      expect(runLocalCommandMock).toHaveBeenCalledWith('grok', ['--version'], expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/%40openai%2Fcodex/latest', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/%40anthropic-ai%2Fclaude-code/latest', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/opencode-ai/latest', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/%40qoder-ai%2Fqodercli/latest', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/%40tencent-ai%2Fcodebuddy-code/latest', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/reasonix/latest', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/%40xai-official%2Fgrok/latest', expect.any(Object));
    } finally {
      await server.close();
    }
  });

  it('detects only the requested local AI agent version when an agent query is provided', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://registry.npmjs.org/%40qoder-ai%2Fqodercli/latest') {
        return new Response(JSON.stringify({ version: '0.2.16' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    });
    runLocalCommandMock.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'qodercli' && args.includes('--version')) {
        return { command, escapedCommand: 'qodercli --version', stdout: 'qodercli 0.2.15\n', stderr: '' };
      }
      throw new Error(`Unexpected version command: ${command} ${args.join(' ')}`);
    });

    const server = await startTestServer(projectRoot);

    try {
      runLocalCommandMock.mockClear();
      fetchMock.mockClear();
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/versions?agent=qoder'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agents).toEqual({
        qoder: expect.objectContaining({ status: 'installed', version: '0.2.15' }),
      });
      expect(body.latestAgents).toEqual({
        qoder: expect.objectContaining({ status: 'installed', version: '0.2.16', packageName: '@qoder-ai/qodercli' }),
      });
      expect(runLocalCommandMock).toHaveBeenCalledTimes(1);
      expect(runLocalCommandMock).toHaveBeenCalledWith('qodercli', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('codex', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('claude', ['--version'], expect.any(Object));
      expect(runLocalCommandMock).not.toHaveBeenCalledWith('opencode', ['--version'], expect.any(Object));
      const registryCalls = fetchMock.mock.calls
        .map(([input]) => {
          const requestInput = input as RequestInfo | URL;
          return typeof requestInput === 'string'
            ? requestInput
            : requestInput instanceof URL
              ? requestInput.toString()
              : requestInput.url;
        })
        .filter((url) => url.startsWith('https://registry.npmjs.org/'));
      expect(registryCalls).toEqual(['https://registry.npmjs.org/%40qoder-ai%2Fqodercli/latest']);
    } finally {
      await server.close();
    }
  });

  it('reports a local AI agent probe error as unknown instead of missing', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    runLocalCommandMock.mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES' }));

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/versions?agent=cursor'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agents).toEqual({
        cursor: expect.objectContaining({
          status: 'unknown',
          command: 'agent',
          reason: 'permission denied',
        }),
      });
      expect(body.latestAgents).toEqual({});
    } finally {
      await server.close();
    }
  });

  it('does not start the OpenCode WebUI server while the web agent is temporarily disabled', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['opencode']);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body).toMatchObject({
        code: 'WEB_AGENT_MISSING',
        agent: 'opencode',
        projectId: 'agent-client',
      });
      expect(body.availability).toMatchObject({
        status: 'missing',
        source: 'web-agent-disabled',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('opens a CLI agent terminal in the active project root', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['codex']);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/cli/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'codex' }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        agent: 'codex',
        targetPath: projectRoot,
      });
      expect(body.command).toContain('codex');
      expect(childProcessMock.spawn).toHaveBeenCalled();
      const firstSpawnCall = childProcessMock.spawn.mock.calls[0] as unknown[] | undefined;
      expect(firstSpawnCall).toBeDefined();
      if (process.platform === 'darwin') {
        const spawnArgs = firstSpawnCall?.[1] as string[];
        expect(firstSpawnCall?.[0]).toBe('open');
        expect(spawnArgs).toEqual([
          '-a',
          'Terminal',
          expect.stringMatching(/axhub-make-cli-.+\.command$/u),
        ]);
        const commandFile = String(spawnArgs[2] || '');
        const commandScript = fs.readFileSync(commandFile, 'utf8');
        expect(commandScript).toContain(`cd "${projectRoot}"`);
        expect(commandScript).toContain('"/usr/local/bin/codex"');
      } else {
        expect(JSON.stringify(childProcessMock.spawn.mock.calls)).toContain('/usr/local/bin/codex');
      }
    } finally {
      await server.close();
    }
  });

  it('rejects a confirmed missing CLI agent before opening a terminal', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands([]);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/cli/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'gemini' }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'CLI_AGENT_UNSUPPORTED',
        projectId: 'agent-client',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('rejects a stored Gemini CLI command path because Gemini CLI is no longer supported', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands([]);

    const server = await startTestServer(projectRoot, {
      serverConfig: {
        toolOpenState: {
          'cli:gemini': {
            commandPath: '/stored/bin/gemini',
            lastOpenMode: 'terminal',
          },
        },
      },
    });

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/cli/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'gemini' }),
      });
      const body = await response.json();

      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(body).toMatchObject({
        code: 'CLI_AGENT_UNSUPPORTED',
        projectId: 'agent-client',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('launches Windows CLI agents without routing the command line through start parsing', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const projectRoot = createTempRoot();

    try {
      await expect(openCLIAgent({
        agent: 'claudecode',
        targetPath: projectRoot,
        availability: { status: 'installed', path: 'C:\\nvm4w\\nodejs\\claude.cmd' } as any,
      })).resolves.toMatchObject({
        success: true,
        agent: 'claudecode',
        targetPath: projectRoot,
      });

      const firstSpawnCall = childProcessMock.spawn.mock.calls[0] as unknown[] | undefined;
      expect(firstSpawnCall?.[0]).toBe('cmd.exe');
      expect(firstSpawnCall?.[1]).toEqual([
        '/d',
        '/k',
        `cd /d "${projectRoot}" && "C:\\nvm4w\\nodejs\\claude.cmd"`,
      ]);
      expect(firstSpawnCall?.[2]).toMatchObject({
        cwd: projectRoot,
        detached: true,
        shell: false,
        windowsHide: false,
      });
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });

  it('returns a CLI open failure when the terminal launcher exits unsuccessfully', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['codex']);
    childProcessMock.spawn.mockImplementationOnce(() => {
      const child = {
        once: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (event === 'spawn') {
            setTimeout(callback, 0);
          }
          if (event === 'close') {
            setTimeout(() => callback(1), 0);
          }
          return child;
        }),
        kill: vi.fn(),
        unref: vi.fn(),
        stderr: {
          on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('Terminal automation denied')), 0);
            }
            return child.stderr;
          }),
        },
      };
      return child;
    });

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/cli/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'codex' }),
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'CLI_AGENT_OPEN_FAILED',
        agent: 'codex',
        projectId: 'agent-client',
      });
      expect(body.error).toContain('Terminal automation denied');
    } finally {
      await server.close();
    }
  });

  it('opens Codex local app in the active project root', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['codex']);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/local-app/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'codex' }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        agent: 'codex',
        targetPath: projectRoot,
      });
      expect(body.command).toContain('codex app');
      expect(childProcessMock.spawn).toHaveBeenCalled();
      const firstSpawnCall = childProcessMock.spawn.mock.calls[0] as unknown[] | undefined;
      expect(firstSpawnCall?.[0]).toBe('/usr/local/bin/codex');
      expect(firstSpawnCall?.[1]).toEqual(['app', projectRoot]);
      const spawnOptions = firstSpawnCall?.[2] as { cwd?: string } | undefined;
      expect(spawnOptions?.cwd).toBe(projectRoot);
    } finally {
      await server.close();
    }
  });

  it('opens OpenCode local app with an encoded project deeplink', async () => {
    const projectRoot = createTempRoot();
    const targetDir = path.join(projectRoot, 'Axhub Runtime');
    fs.mkdirSync(targetDir, { recursive: true });
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['opencode']);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/local-app/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'opencode', targetPath: targetDir }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        agent: 'opencode',
        targetPath: targetDir,
      });
      expect(body.command).toContain('opencode://open-project?directory=');
      expect(body.command).toContain('/Axhub%20Runtime');
      expect(childProcessMock.spawn).toHaveBeenCalled();
      const spawnCalls = JSON.stringify(childProcessMock.spawn.mock.calls);
      expect(spawnCalls).toContain('opencode://open-project?directory=');
      expect(spawnCalls).toContain('/Axhub%20Runtime');
    } finally {
      await server.close();
    }
  });

  it('rejects a confirmed missing local app agent before opening', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands([]);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/local-app/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'opencode' }),
      });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body).toMatchObject({
        code: 'LOCAL_APP_AGENT_MISSING',
        agent: 'opencode',
        projectId: 'agent-client',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('builds Windows local app deeplinks with Start-Process and encoded paths', () => {
    const command = buildLocalAppOpenCommandForPlatform({
      agent: 'opencode',
      directory: 'C:\\Projects\\Axhub Runtime',
      platform: 'win32',
    });

    expect(command.command).toBe('powershell');
    expect(command.displayCommand).toBe(
      "Start-Process 'opencode://open-project?directory=C%3A%5CProjects%5CAxhub%20Runtime'",
    );
    expect(command.args.join(' ')).toContain('Start-Process');
    expect(command.args.join(' ')).toContain('C%3A%5CProjects%5CAxhub%20Runtime');
  });

  it('returns Windows local app deeplinks for browser-side execution', async () => {
    const opencode = await buildLocalAppOpenResultForPlatform({
      agent: 'opencode',
      directory: 'C:\\Projects\\Axhub Runtime',
      platform: 'win32',
    });
    const codex = await buildLocalAppOpenResultForPlatform({
      agent: 'codex',
      directory: 'C:\\Projects\\Axhub Runtime',
      platform: 'win32',
      preferDeeplink: true,
    });

    expect(opencode).toMatchObject({
      command: 'browser opencode://open-project?directory=C%3A%5CProjects%5CAxhub%20Runtime',
      url: 'opencode://open-project?directory=C%3A%5CProjects%5CAxhub%20Runtime',
      openInBrowser: true,
      openMode: 'deeplink',
    });
    expect(codex).toMatchObject({
      command: 'browser codex://threads/new?path=C%3A%5CProjects%5CAxhub%20Runtime',
      url: 'codex://threads/new?path=C%3A%5CProjects%5CAxhub%20Runtime',
      openInBrowser: true,
      openMode: 'deeplink',
    });
    expect(childProcessMock.spawn).not.toHaveBeenCalled();
  });

  it('builds Codex app commands and non-Windows OpenCode deeplinks without losing path encoding', () => {
    const codex = buildLocalAppOpenCommandForPlatform({
      agent: 'codex',
      directory: '/workspace/axhub-runtime',
      platform: 'darwin',
    });
    const macOpenCode = buildLocalAppOpenCommandForPlatform({
      agent: 'opencode',
      directory: '/workspace/axhub-runtime',
      platform: 'darwin',
    });
    const linuxOpenCode = buildLocalAppOpenCommandForPlatform({
      agent: 'opencode',
      directory: '/workspace/Axhub Runtime',
      platform: 'linux',
    });

    expect(codex).toMatchObject({
      command: 'codex',
      args: ['app', '/workspace/axhub-runtime'],
    });
    expect(codex.displayCommand).toContain('codex app');
    expect(macOpenCode).toMatchObject({
      command: 'open',
      args: ['opencode://open-project?directory=/workspace/axhub-runtime'],
    });
    expect(linuxOpenCode).toMatchObject({
      command: 'xdg-open',
      args: ['opencode://open-project?directory=/workspace/Axhub%20Runtime'],
    });
  });

  it('falls back to a Codex deeplink when direct Codex app launch fails', async () => {
    const projectRoot = createTempRoot();
    const sourcePath = path.join(projectRoot, 'src/prototypes/home/index.tsx');
    writeFile(sourcePath, 'export default function Home() { return null; }\n');
    childProcessMock.spawn
      .mockImplementationOnce(() => {
        const child = createSpawnChildMock();
        child.once.mockImplementation((event: string, callback: (error?: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('codex app failed')), 0);
          }
          return child;
        });
        return child;
      })
      .mockImplementationOnce(() => {
        return createSpawnChildMock();
      });

    const result = await openLocalAppAgent({
      agent: 'codex',
      targetPath: sourcePath,
      availability: { status: 'installed', path: '/usr/local/bin/codex' } as any,
    });

    expect(result).toMatchObject({
      success: true,
      agent: 'codex',
      targetPath: sourcePath,
    });
    expect(result.command).toContain('codex://threads/new?path=');
    expect(result.command).toContain('/src/prototypes/home');
    expect(childProcessMock.spawn).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 2);
  });

  it('uses the stored local app deeplink mode before direct Codex app launch', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['codex']);

    const server = await startTestServer(projectRoot, {
      serverConfig: {
        schemaVersion: 1,
        toolOpenState: {
          'local-app:codex': {
            commandPath: '/usr/local/bin/codex',
            lastOpenMode: 'deeplink',
          },
        },
      },
    });

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/local-app/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'codex' }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        agent: 'codex',
        targetPath: projectRoot,
      });
      expect(body.command).toContain('codex://threads/new?path=');
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(process.platform === 'win32' ? 0 : 1);
      expect(JSON.stringify(childProcessMock.spawn.mock.calls)).not.toContain('"app"');
    } finally {
      await server.close();
    }
  });

  it('opens CLI and web agents directly and reports unsupported web/CLI agent requests', async () => {
    const projectRoot = createTempRoot();
    await expect(openCLIAgent({
      agent: 'definitely-unsupported' as any,
      targetPath: projectRoot,
    })).rejects.toThrow('Unsupported CLI agent');

    await expect(openCLIAgent({
      agent: 'gemini' as any,
      targetPath: projectRoot,
      availability: { status: 'installed', path: '/usr/local/bin/gemini' } as any,
    })).rejects.toThrow('Unsupported CLI agent');

    await expect(openWebAgent({
      agent: 'opencode',
      targetPath: projectRoot,
    })).rejects.toThrow('OpenCode WebUI is temporarily disabled');

    const web = await openWebAgent({
      agent: 'acp',
      targetPath: projectRoot,
      availability: { status: 'installed', path: '/usr/local/bin/npx' } as any,
    });
    expect(web).toMatchObject({
      success: true,
      agent: 'acp',
      targetPath: projectRoot,
    });
    expect(web.command).toContain('npx @axhub/acp@latest');
  });

  it('surfaces direct launcher failures and delayed terminal launcher success', async () => {
    const projectRoot = createTempRoot();

    childProcessMock.spawn.mockImplementationOnce(() => {
      const child = createSpawnChildMock();
      child.once.mockImplementation((event: string, callback: (error?: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('deeplink failed')), 0);
        }
        return child;
      });
      return child;
    });
    await expect(openLocalAppAgent({
      agent: 'opencode',
      targetPath: projectRoot,
    })).rejects.toThrow('deeplink failed');

    childProcessMock.spawn.mockImplementationOnce(() => {
      const child = createSpawnChildMock();
      child.once.mockImplementation((event: string, callback: (error?: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('terminal failed')), 0);
        }
        return child;
      });
      return child;
    });
    await expect(openCLIAgent({
      agent: 'codex',
      targetPath: projectRoot,
      availability: { status: 'installed', path: '/usr/local/bin/codex' } as any,
    })).rejects.toThrow('terminal failed');

    vi.useFakeTimers();
    childProcessMock.spawn.mockImplementationOnce(() => {
      return createSpawnChildMock();
    });
    const cli = openCLIAgent({
      agent: 'codex',
      targetPath: projectRoot,
      availability: { status: 'installed', path: '/usr/local/bin/codex' } as any,
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(cli).resolves.toMatchObject({
      success: true,
      agent: 'codex',
      targetPath: projectRoot,
    });
    vi.useRealTimers();

    await expect(openWebAgent({
      agent: 'definitely-unsupported' as any,
      targetPath: projectRoot,
    })).rejects.toThrow('Unsupported web agent');
    expect(readManagedOpenCodeServerUrl(path.join(projectRoot, 'missing'))).toBe('');
  });

  it('builds missing-agent errors and returns no managed OpenCode URL when no server is active', () => {
    expect(getMissingCLIAgentOpenError('codex')).toMatchObject({
      statusCode: 404,
      body: { code: 'CLI_AGENT_MISSING', agent: 'codex' },
    });
    expect(getMissingWebAgentOpenError('acp')).toMatchObject({
      statusCode: 404,
      body: {
        error: '未检测到 ACP UI，请先安装后再试',
        code: 'WEB_AGENT_MISSING',
        agent: 'acp',
      },
    });
    expect(getMissingLocalAppOpenError('opencode')).toMatchObject({
      statusCode: 404,
      body: { code: 'LOCAL_APP_AGENT_MISSING', agent: 'opencode' },
    });
    expect(readManagedOpenCodeServerUrl()).toBe('');
  });

  it('rejects unsupported local app agents', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/local-app/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'gemini' }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'LOCAL_APP_AGENT_UNSUPPORTED',
        projectId: 'agent-client',
        supported: ['codex', 'opencode'],
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('rejects local app target paths outside the selected project root', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const outsidePath = path.resolve(projectRoot, '..', 'outside-local-app-project');

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/local-app/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'opencode', targetPath: outsidePath }),
      });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toMatchObject({
        code: 'PATH_OUTSIDE_PROJECT',
        projectId: 'agent-client',
      });
      expect(childProcessMock.spawn).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it.skip('starts OpenCode with its official web command without precreating a session', async () => {
    const projectRoot = createTempRoot();
    const adminRoot = path.join(projectRoot, 'missing-admin');
    writeProjectMetadata(projectRoot);
    writeFile(
      path.join(adminRoot, 'opencode-webui/index.html'),
      [
        '<html><head>',
        '<script id="axhub-opencode-runtime-config">',
        'window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "";',
        '</script>',
        '</head><body>OpenCode</body></html>',
      ].join('\n'),
    );
    mockDetectedCommands(['opencode']);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const body = await response.json();
      const openCodeSessionCreateCalls = fetchMock.mock.calls.filter(([input, init]) => {
        const requestInput = input as RequestInfo | URL;
        const requestInit = init as RequestInit | undefined;
        const url = typeof requestInput === 'string'
          ? requestInput
          : requestInput instanceof URL ? requestInput.toString() : requestInput.url;
        return /^http:\/\/localhost:\d+\/session$/u.test(url) && requestInit?.method === 'POST';
      });

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        agent: 'opencode',
        targetPath: projectRoot,
      });
      const expectedEncodedDirectory = Buffer.from(projectRoot, 'utf8').toString('base64url');
      expect(body.serverUrl).toMatch(/^http:\/\/localhost:\d+$/u);
      expect(body.url).toBe(`/opencode/${expectedEncodedDirectory}`);
      expect(body.url).not.toContain(encodeURIComponent(projectRoot));
      expect(openCodeSessionCreateCalls).toHaveLength(0);
      expect(body.command).toContain('opencode serve --hostname localhost --port');
      expect(body.command).not.toContain('--cors http://localhost:5174');
      expect(childProcessMock.spawn).toHaveBeenCalled();
      const spawnCalls = JSON.stringify(childProcessMock.spawn.mock.calls);
      expect(spawnCalls).toContain('/usr/local/bin/opencode');
      expect(spawnCalls).toContain('serve');
      expect(spawnCalls).toContain('--hostname');
      expect(spawnCalls).toContain('localhost');
      expect(spawnCalls).toContain('--port');
      expect(spawnCalls).not.toContain('--cors');
      expect(spawnCalls).not.toContain('http://localhost:5174');
      expect(body.command).toContain(`cd \"${projectRoot}\" && opencode serve`);

      const opencodeEntry = await fetch(`${server.origin}${body.url}`);
      const html = await opencodeEntry.text();
      expect(opencodeEntry.status).toBe(200);
      expect(html).toContain(`window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "${body.serverUrl}";`);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      await server.close();
    }
  });

  it.skip('reuses a managed OpenCode server when only the requested cors origin changes', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['opencode']);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const server = await startTestServer(projectRoot);

    try {
      const first = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      expect(first.status).toBe(200);

      const second = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5175',
        }),
      });
      const body = await second.json();
      const firstBody = await first.json();

      expect(second.status).toBe(200);
      expect(body.serverUrl).toBe(firstBody.serverUrl);
      const expectedEncodedDirectory = Buffer.from(projectRoot, 'utf8').toString('base64url');
      expect(body.url).toBe(`/opencode/${expectedEncodedDirectory}`);
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      await server.close();
    }
  });

  it.skip('reuses a ready managed OpenCode server for the same target path and cors origin', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['opencode']);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const server = await startTestServer(projectRoot);
    let portBlocker: net.Server | null = null;

    try {
      const first = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const firstBody = await first.json();
      const firstPort = Number(new URL(firstBody.serverUrl).port);
      portBlocker = await listenOnLocalPort(firstPort);
      const second = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const secondBody = await second.json();

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(secondBody.serverUrl).toBe(firstBody.serverUrl);
      const expectedEncodedDirectory = Buffer.from(projectRoot, 'utf8').toString('base64url');
      expect(secondBody.url).toBe(`/opencode/${expectedEncodedDirectory}`);
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      if (portBlocker) {
        await closeNetServer(portBlocker);
      }
      await server.close();
    }
  });

  it.skip('stops managed OpenCode servers when make-server closes', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['opencode']);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5174',
        }),
      });

      expect(response.status).toBe(200);
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
      const child = childProcessMock.spawn.mock.results[0]?.value;

      await server.close();

      expect(child?.kill).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      await server.close().catch(() => undefined);
    }
  });

  it.skip('restarts a managed OpenCode server when the requested target path changes', async () => {
    const projectRoot = createTempRoot();
    const firstTargetPath = path.join(projectRoot, 'apps', 'make-project');
    const secondTargetPath = path.join(projectRoot, 'apps', 'test-client');
    fs.mkdirSync(firstTargetPath, { recursive: true });
    fs.mkdirSync(secondTargetPath, { recursive: true });
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['opencode']);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const server = await startTestServer(projectRoot);

    try {
      const first = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          targetPath: firstTargetPath,
          corsOrigin: 'http://localhost:5174',
        }),
      });
      expect(first.status).toBe(200);

      const second = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          targetPath: secondTargetPath,
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const body = await second.json();

      expect(second.status).toBe(200);
      expect(body.targetPath).toBe(secondTargetPath);
      expect(body.command).toContain(`cd \"${secondTargetPath}\" && opencode serve`);
      expect(body.serverUrl).toMatch(/^http:\/\/localhost:\d+$/u);
      const expectedEncodedDirectory = Buffer.from(secondTargetPath, 'utf8').toString('base64url');
      expect(body.url).toBe(`/opencode/${expectedEncodedDirectory}`);
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(2);
      const firstChild = childProcessMock.spawn.mock.results[0]?.value;
      expect(firstChild?.kill).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      await server.close();
    }
  });

  it.skip('starts OpenCode from the containing directory when opening a selected file', async () => {
    const projectRoot = createTempRoot();
    const sourceFilePath = path.join(projectRoot, 'src/prototypes/home/index.tsx');
    const sourceDirPath = path.dirname(sourceFilePath);
    fs.mkdirSync(sourceDirPath, { recursive: true });
    fs.writeFileSync(sourceFilePath, 'export default function Home() { return null; }\n', 'utf8');
    writeProjectMetadata(projectRoot);
    mockDetectedCommands(['opencode']);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const server = await startTestServer(projectRoot);

    try {
      const response = await fetch(projectApiUrl(server.origin, '/api/agent/web/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          targetPath: 'src/prototypes/home/index.tsx',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        agent: 'opencode',
        targetPath: sourceFilePath,
      });
      expect(body.command).toContain(`cd \"${sourceDirPath}\" && opencode serve`);
      const spawnCalls = childProcessMock.spawn.mock.calls as unknown[][];
      const spawnOptions = spawnCalls[0]?.[2] as { cwd?: string } | undefined;
      expect(spawnOptions?.cwd).toBe(sourceDirPath);
      const expectedEncodedDirectory = Buffer.from(sourceDirPath, 'utf8').toString('base64url');
      expect(body.url).toBe(`/opencode/${expectedEncodedDirectory}`);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      await server.close();
    }
  });

  it.skip('opens a web agent in the explicitly selected project root', async () => {
    const activeProjectRoot = createTempRoot('axhub-make-agent-open-active-');
    const selectedProjectRoot = createTempRoot('axhub-make-agent-open-selected-');
    const adminRoot = path.join(activeProjectRoot, 'missing-admin');
    writeProjectMetadata(activeProjectRoot, 'active-agent-client', 'Active Agent Client');
    writeProjectMetadata(selectedProjectRoot, 'selected-agent-client', 'Selected Agent Client');
    writeFile(
      path.join(adminRoot, 'opencode-webui/index.html'),
      [
        '<html><head>',
        '<script id="axhub-opencode-runtime-config">',
        'window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "";',
        '</script>',
        '</head><body>OpenCode</body></html>',
      ].join('\n'),
    );
    mockDetectedCommands(['opencode']);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const registryHome = createTempRoot('axhub-make-agent-open-registry-');
    const server = await startMakeServer({
      projectRoot: activeProjectRoot,
      host: 'localhost',
      port: 0,
      adminRoot,
      registryPath: getProjectRegistryPath(registryHome),
    });

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'selected-agent-client',
          name: 'Selected Agent Client',
          root: selectedProjectRoot,
        }),
      });
      expect(registerResponse.status).toBe(201);

      const response = await fetch(projectApiUrl(server.origin, '/api/agent/web/open', 'selected-agent-client'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          projectId: 'selected-agent-client',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        agent: 'opencode',
        projectId: 'selected-agent-client',
        targetPath: selectedProjectRoot,
      });
      expect(body.targetPath).not.toBe(activeProjectRoot);
      expect(body.command).toContain(`cd \"${selectedProjectRoot}\" && opencode serve`);
      const expectedEncodedDirectory = Buffer.from(selectedProjectRoot, 'utf8').toString('base64url');
      expect(body.serverUrl).toMatch(/^http:\/\/localhost:\d+$/u);
      expect(body.url).toBe(`/opencode/${expectedEncodedDirectory}`);
      expect(body.url).not.toContain(encodeURIComponent(selectedProjectRoot));

      const selectedOpenCodeEntry = await fetch(`${server.origin}${body.url}`);
      const selectedHtml = await selectedOpenCodeEntry.text();
      expect(selectedOpenCodeEntry.status).toBe(200);
      expect(selectedHtml).toContain(`window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "${body.serverUrl}";`);

      const bareOpenCodeEntry = await fetch(`${server.origin}/opencode/`);
      const bareHtml = await bareOpenCodeEntry.text();
      expect(bareOpenCodeEntry.status).toBe(200);
      expect(bareHtml).not.toContain(`window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "${body.serverUrl}";`);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      await server.close();
    }
  });

  it.skip('does not let the bare OpenCode entry fall back to the active project server', async () => {
    const activeProjectRoot = createTempRoot('axhub-make-agent-open-active-');
    const selectedProjectRoot = createTempRoot('axhub-make-agent-open-selected-');
    const adminRoot = path.join(activeProjectRoot, 'missing-admin');
    writeProjectMetadata(activeProjectRoot, 'active-agent-client', 'Active Agent Client');
    writeProjectMetadata(selectedProjectRoot, 'selected-agent-client', 'Selected Agent Client');
    writeFile(
      path.join(adminRoot, 'opencode-webui/index.html'),
      [
        '<html><head>',
        '<script id="axhub-opencode-runtime-config">',
        'window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "";',
        '</script>',
        '</head><body>OpenCode</body></html>',
      ].join('\n'),
    );
    mockDetectedCommands(['opencode']);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (/^http:\/\/localhost:\d+\/session$/u.test(url) && init?.method === 'POST') {
        throw new Error('make-server must not create OpenCode sessions');
      }
      if (/^http:\/\/localhost:\d+\/?$/u.test(url)) {
        return new Response('', { status: 200 });
      }
      return originalFetch(input, init);
    });

    const registryHome = createTempRoot('axhub-make-agent-open-registry-');
    const server = await startMakeServer({
      projectRoot: activeProjectRoot,
      host: 'localhost',
      port: 0,
      adminRoot,
      registryPath: getProjectRegistryPath(registryHome),
    });
    let portBlocker: net.Server | null = null;

    try {
      const registerResponse = await fetch(`${server.origin}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'selected-agent-client',
          name: 'Selected Agent Client',
          root: selectedProjectRoot,
        }),
      });
      expect(registerResponse.status).toBe(201);

      const activeResponse = await fetch(projectApiUrl(server.origin, '/api/agent/web/open', 'active-agent-client'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const activeBody = await activeResponse.json();
      expect(activeResponse.status).toBe(200);
      expect(activeBody.targetPath).toBe(activeProjectRoot);
      const activePort = Number(new URL(activeBody.serverUrl).port);
      portBlocker = await listenOnLocalPort(activePort);

      const selectedResponse = await fetch(projectApiUrl(server.origin, '/api/agent/web/open', 'selected-agent-client'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'opencode',
          projectId: 'selected-agent-client',
          corsOrigin: 'http://localhost:5174',
        }),
      });
      const selectedBody = await selectedResponse.json();

      expect(selectedResponse.status).toBe(200);
      expect(selectedBody).toMatchObject({
        success: true,
        agent: 'opencode',
        projectId: 'selected-agent-client',
        targetPath: selectedProjectRoot,
      });
      expect(selectedBody.serverUrl).toMatch(/^http:\/\/localhost:\d+$/u);
      expect(selectedBody.serverUrl).not.toBe(activeBody.serverUrl);

      const selectedOpenCodeEntry = await fetch(`${server.origin}${selectedBody.url}`);
      const selectedHtml = await selectedOpenCodeEntry.text();
      expect(selectedOpenCodeEntry.status).toBe(200);
      expect(selectedHtml).toContain(`window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "${selectedBody.serverUrl}";`);

      const bareOpenCodeEntry = await fetch(`${server.origin}/opencode/`);
      const bareHtml = await bareOpenCodeEntry.text();
      expect(bareOpenCodeEntry.status).toBe(200);
      expect(bareHtml).toContain('window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "";');
      expect(bareHtml).not.toContain(`window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "${activeBody.serverUrl}";`);
      expect(bareHtml).not.toContain(`window.__AXHUB_OPENCODE_SERVER_ORIGIN__ = "${selectedBody.serverUrl}";`);
    } finally {
      fetchMock.mockImplementation(originalFetch);
      if (portBlocker) {
        await closeNetServer(portBlocker);
      }
      await server.close();
    }
  });
});
