import { describe, expect, it, vi } from 'vitest';

import {
  NPM_MIRROR_REGISTRY,
  NPM_OFFICIAL_REGISTRY,
  chooseNpmRegistry,
  deriveRegistryProbePackages,
  isRetryableRegistryError,
  probeNpmRegistry,
  registryInstallArgs,
  resolveMakeClientRegistryRoute,
} from '../makeClientRegistryRouting.ts';

describe('make client npm registry routing', () => {
  it('derives current probe versions from the target package manifest', () => {
    expect(deriveRegistryProbePackages({
      dependencies: {
        '@axhub/annotation': '^1.0.18',
      },
      devDependencies: {
        vite: '5.4.21',
      },
    })).toEqual([
      { name: '@axhub/annotation', version: '1.0.18' },
      { name: 'vite', version: '5.4.21' },
    ]);
  });

  it('keeps package-level probes when an exact minimum version cannot be derived', () => {
    expect(deriveRegistryProbePackages({
      dependencies: {
        '@axhub/annotation': 'workspace:*',
      },
      devDependencies: {
        vite: 'latest',
      },
    })).toEqual([
      { name: '@axhub/annotation' },
      { name: 'vite' },
    ]);
  });

  it('selects npmmirror when it is materially faster', () => {
    expect(chooseNpmRegistry([
      { ...NPM_OFFICIAL_REGISTRY, durationMs: 1_200, ok: true },
      { ...NPM_MIRROR_REGISTRY, durationMs: 400, ok: true },
    ])).toMatchObject({
      alternate: NPM_OFFICIAL_REGISTRY,
      reason: 'faster',
      selected: NPM_MIRROR_REGISTRY,
    });
  });

  it('prefers npmjs when successful probe results are close', () => {
    expect(chooseNpmRegistry([
      { ...NPM_OFFICIAL_REGISTRY, durationMs: 480, ok: true },
      { ...NPM_MIRROR_REGISTRY, durationMs: 400, ok: true },
    ])).toMatchObject({
      alternate: NPM_MIRROR_REGISTRY,
      reason: 'close-to-official',
      selected: NPM_OFFICIAL_REGISTRY,
    });
  });

  it('falls back to npmjs when both probes fail', () => {
    expect(chooseNpmRegistry([
      { ...NPM_OFFICIAL_REGISTRY, durationMs: 2_000, error: 'timeout', ok: false },
      { ...NPM_MIRROR_REGISTRY, durationMs: 2_000, error: 'timeout', ok: false },
    ])).toMatchObject({
      alternate: NPM_MIRROR_REGISTRY,
      reason: 'probe-fallback',
      selected: NPM_OFFICIAL_REGISTRY,
    });
  });

  it('preserves an environment-configured registry without probing', async () => {
    const runCommand = vi.fn();
    const probeRegistry = vi.fn();

    await expect(resolveMakeClientRegistryRoute({
      cwd: 'C:\\make-client',
      env: { NPM_CONFIG_REGISTRY: 'https://registry.example.test' },
      npmCommand: 'npm.cmd',
      probePackages: [],
      probeRegistry,
      runCommand,
    })).resolves.toEqual({
      mode: 'configured',
      probes: [],
      reason: 'environment-configured',
    });
    expect(runCommand).not.toHaveBeenCalled();
    expect(probeRegistry).not.toHaveBeenCalled();
  });

  it('treats the lifecycle-provided official registry as the npm default', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('ls') ? '; "default" config from default values\n' : 'https://registry.npmjs.org/\n',
    }));
    const probeRegistry = vi.fn(async (registry: typeof NPM_OFFICIAL_REGISTRY) => ({
      ...registry,
      durationMs: registry.id === 'npmjs' ? 1_200 : 300,
      ok: true,
    }));

    await expect(resolveMakeClientRegistryRoute({
      cwd: '/tmp/make-client',
      env: { npm_config_registry: 'https://registry.npmjs.org/' },
      npmCommand: 'npm',
      probePackages: [{ name: 'vite', version: '5.4.21' }],
      probeRegistry,
      runCommand,
    })).resolves.toMatchObject({
      alternate: NPM_OFFICIAL_REGISTRY,
      mode: 'automatic',
      reason: 'faster',
      selected: NPM_MIRROR_REGISTRY,
    });
    expect(probeRegistry).toHaveBeenCalledTimes(2);
  });

  it('preserves a non-default effective npm registry without probing', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('ls') ? '' : 'https://registry.example.test/\n',
    }));
    const probeRegistry = vi.fn();

    await expect(resolveMakeClientRegistryRoute({
      cwd: '/tmp/make-client',
      env: {},
      npmCommand: 'npm',
      probePackages: [],
      probeRegistry,
      runCommand,
    })).resolves.toEqual({
      mode: 'configured',
      probes: [],
      reason: 'npm-configured',
    });
    expect(runCommand).toHaveBeenCalledWith(
      'npm',
      ['config', 'get', 'registry'],
      expect.objectContaining({ cwd: '/tmp/make-client' }),
    );
    expect(probeRegistry).not.toHaveBeenCalled();
  });

  it('preserves an explicitly configured official registry without probing', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('ls')
        ? [
            '; "default" config from default values',
            '; registry = "https://registry.npmjs.org/" ; overridden by user',
            '; "user" config from C:\\Users\\tester\\.npmrc',
            'registry = "https://registry.npmjs.org/"',
          ].join('\n')
        : 'https://registry.npmjs.org/\n',
    }));
    const probeRegistry = vi.fn();

    await expect(resolveMakeClientRegistryRoute({
      cwd: 'C:\\make-client',
      env: {},
      npmCommand: 'npm.cmd',
      probePackages: [{ name: 'vite', version: '5.4.21' }],
      probeRegistry,
      runCommand,
    })).resolves.toEqual({
      mode: 'configured',
      probes: [],
      reason: 'npm-configured',
    });
    expect(probeRegistry).not.toHaveBeenCalled();
  });

  it('preserves a scoped Axhub registry without probing', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('ls')
        ? [
            '; "default" config from default values',
            '; "user" config from /home/tester/.npmrc',
            '@axhub:registry = "https://packages.example.test/"',
          ].join('\n')
        : 'https://registry.npmjs.org/\n',
    }));
    const probeRegistry = vi.fn();

    await expect(resolveMakeClientRegistryRoute({
      cwd: '/tmp/make-client',
      env: {},
      npmCommand: 'npm',
      probePackages: [{ name: '@axhub/annotation', version: '1.0.18' }],
      probeRegistry,
      runCommand,
    })).resolves.toEqual({
      mode: 'configured',
      probes: [],
      reason: 'scoped-npm-configured',
    });
    expect(probeRegistry).not.toHaveBeenCalled();
  });

  it('probes npmjs and npmmirror when npm uses its default registry', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes('ls') ? '; "default" config from default values\n' : 'https://registry.npmjs.org/\n',
    }));
    const probeRegistry = vi.fn(async (registry: typeof NPM_OFFICIAL_REGISTRY) => ({
      ...registry,
      durationMs: registry.id === 'npmjs' ? 1_200 : 300,
      ok: true,
    }));

    await expect(resolveMakeClientRegistryRoute({
      cwd: '/tmp/make-client',
      env: {},
      npmCommand: 'npm',
      probePackages: [{ name: 'vite', version: '5.4.21' }],
      probeRegistry,
      runCommand,
    })).resolves.toMatchObject({
      alternate: NPM_OFFICIAL_REGISTRY,
      mode: 'automatic',
      reason: 'faster',
      selected: NPM_MIRROR_REGISTRY,
    });
    expect(probeRegistry).toHaveBeenCalledTimes(2);
  });

  it('checks ping and required package metadata during a registry probe', async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/-/ping')) {
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ version: '5.4.21' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });

    await expect(probeNpmRegistry(
      NPM_MIRROR_REGISTRY,
      [{ name: 'vite', version: '5.4.21' }],
      { fetchImpl, timeoutMs: 100 },
    )).resolves.toMatchObject({ id: 'npmmirror', ok: true });
    expect(requested).toEqual([
      'https://registry.npmmirror.com/-/ping',
      'https://registry.npmmirror.com/vite/5.4.21',
    ]);
  });

  it('adds a registry only to routed install commands', () => {
    expect(registryInstallArgs(['install', '--include=dev'], NPM_MIRROR_REGISTRY.url)).toEqual([
      'install',
      '--include=dev',
      '--registry=https://registry.npmmirror.com',
    ]);
    expect(registryInstallArgs(['install', '--include=dev'])).toEqual([
      'install',
      '--include=dev',
    ]);
  });

  it('retries only registry and network failures on another source', () => {
    expect(isRetryableRegistryError({ code: 'ETIMEDOUT', message: 'request timed out' })).toBe(true);
    expect(isRetryableRegistryError({ stderr: 'npm error code E503' })).toBe(true);
    expect(isRetryableRegistryError({ details: { commandErrorCode: 'ETIMEDOUT' } })).toBe(true);
    expect(isRetryableRegistryError({ stderr: 'npm error code ERESOLVE' })).toBe(false);
    expect(isRetryableRegistryError({ stderr: 'postinstall script failed' })).toBe(false);
  });
});
