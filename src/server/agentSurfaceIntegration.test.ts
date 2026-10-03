import { describe, expect, it } from 'vitest';

import {
  buildMakeAgentSurfaceConfig,
  buildMakeAgentSurfaceOpenOptions,
  mapMakeAgentSurfaceInspection,
  resolveMakeAgentSurfaceHost,
} from './agentSurfaceIntegration.ts';
import * as integrationApi from './agentSurfaceIntegration.ts';

describe('Make agent surface integration', () => {
  it('builds the projectless Make home page for CLI injection', () => {
    const config = buildMakeAgentSurfaceConfig({
      makeOrigin: 'http://127.0.0.1:53817',
    });

    expect(config.entries[0]?.url).toBe('http://127.0.0.1:53817/?surface=codex');
    expect(buildMakeAgentSurfaceConfig({
      makeOrigin: 'http://127.0.0.1:53817',
      projectId: '   ',
    }).entries[0]?.url).toBe('http://127.0.0.1:53817/?surface=codex');
  });

  it('builds a scoped Make page entry and health probe', () => {
    const config = buildMakeAgentSurfaceConfig({
      makeOrigin: 'http://127.0.0.1:53817',
      projectId: 'make-project',
    });

    expect(config).toEqual({
      schemaVersion: 1,
      entries: [{
        id: 'axhub-make',
        name: 'Axhub Make',
        icon: {
          type: 'data-url',
          value: expect.stringMatching(/^data:image\/png;base64,/u),
        },
        hosts: ['codex', 'cursor', 'workbuddy', 'traework'],
        url: 'http://127.0.0.1:53817/?projectId=make-project&surface=codex',
        healthUrl: 'http://127.0.0.1:53817/api/health',
        headerActions: {
          refresh: true,
          copyUrl: true,
        },
      }],
    });
  });

  it('maps only qualified desktop integration providers to agent-surface hosts', () => {
    expect(resolveMakeAgentSurfaceHost('chatgpt')).toBe('codex');
    expect(resolveMakeAgentSurfaceHost('cursor')).toBe('cursor');
    expect(resolveMakeAgentSurfaceHost('workbuddy')).toBe('workbuddy');
    expect(resolveMakeAgentSurfaceHost('traework')).toBe('traework');
    expect(resolveMakeAgentSurfaceHost('qoderwork')).toBeNull();
    expect(resolveMakeAgentSurfaceHost('opencode')).toBeNull();
  });

  it.each(['chatgpt', 'cursor', 'workbuddy', 'traework'] as const)(
    'injects %s without activating the current page',
    (provider) => {
      const options = buildMakeAgentSurfaceOpenOptions({
        provider,
        makeOrigin: 'http://127.0.0.1:53817',
        projectId: 'make-project',
      });

      expect(options).toMatchObject({ entryId: 'axhub-make', activate: false });
    },
  );

  it('activates a CLI surface only when explicitly requested', () => {
    expect(buildMakeAgentSurfaceOpenOptions({
      provider: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      activate: true,
      timeoutMs: 45_000,
    })).toMatchObject({ activate: true, timeoutMs: 45_000 });

    expect(buildMakeAgentSurfaceOpenOptions({
      provider: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }).activate).toBe(false);
  });

  it('maps the extra application launch preference to Agent Surface newClient', () => {
    expect(buildMakeAgentSurfaceOpenOptions({
      provider: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      newClient: false,
    })).toMatchObject({ newClient: false });

    expect(buildMakeAgentSurfaceOpenOptions({
      provider: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    })).toMatchObject({ newClient: true });
  });

  it('passes an explicit TRAEWORK application path to injection-only host configuration', () => {
    const options = buildMakeAgentSurfaceOpenOptions({
      provider: 'traework',
      makeOrigin: 'http://127.0.0.1:53817',
      projectId: 'make-project',
      appPath: '/Applications/TRAEWORK.app/Contents/MacOS/Electron',
    });

    expect(options.config.hosts?.traework).toEqual({
      appPath: '/Applications/TRAEWORK.app/Contents/MacOS/Electron',
    });
  });

  it('preserves a configuration-required inspection as an app path requirement', () => {
    expect(mapMakeAgentSurfaceInspection('win32', {
      code: 'configuration-required',
      message: 'Multiple QoderWork installations were found.',
      cdpPort: 9222,
      reusedHost: false,
      canLaunch: false,
      processRunning: false,
    })).toEqual({
      platform: 'win32',
      ready: false,
      running: false,
      installed: false,
      integrationInstalled: true,
      appPath: '',
      appPathRequired: true,
      detail: 'Multiple QoderWork installations were found.',
    });
  });

  it('marks an installed Surface host as recoverable through an isolated client', () => {
    expect(mapMakeAgentSurfaceInspection('darwin', {
      code: 'restart-required',
      message: 'An ordinary client is already running.',
      appPath: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
      cdpPort: 9229,
      reusedHost: false,
      canLaunch: false,
      processRunning: true,
    })).toMatchObject({
      ready: false,
      recoverable: true,
      running: true,
      installed: true,
    });
  });

  it.each(['chatgpt', 'cursor', 'workbuddy', 'traework'] as const)(
    'builds one %s project-and-surface call with an explicit application path',
    (provider) => {
      const builder = Reflect.get(integrationApi, 'buildMakeAgentSurfaceProjectOpenOptions');
      expect(builder).toBeTypeOf('function');
      expect(builder({
        provider,
        makeOrigin: 'http://127.0.0.1:53817',
      projectId: 'make-project',
      targetPath: '/workspace/project',
      appPath: '/Applications/Agent.app/Contents/MacOS/Agent',
      timeoutMs: 45_000,
      })).toMatchObject({
        provider: provider === 'chatgpt' ? 'codex' : provider,
        targetPath: '/workspace/project',
        appPath: '/Applications/Agent.app/Contents/MacOS/Agent',
        surface: {
          entryId: 'axhub-make',
          activate: false,
          timeoutMs: 45_000,
          newClient: true,
        },
      });
    },
  );

  it('keeps project-and-surface opening on the existing client when extra launch is disabled', () => {
    const builder = Reflect.get(integrationApi, 'buildMakeAgentSurfaceProjectOpenOptions');
    expect(builder({
      provider: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
      targetPath: '/workspace/project',
      newClient: false,
    })).toMatchObject({ surface: { newClient: false } });
  });

  it('keeps QoderWork as a legacy project-only call without Surface injection', () => {
    const builder = Reflect.get(integrationApi, 'buildMakeAgentSurfaceProjectOpenOptions');
    expect(builder).toBeTypeOf('function');
    expect(builder({
      provider: 'qoderwork',
      makeOrigin: 'http://127.0.0.1:53817',
      projectId: 'make-project',
      targetPath: '/workspace/project',
      appPath: '/Applications/QoderWork.app/Contents/MacOS/QoderWork',
    })).toEqual({
      provider: 'qoderwork',
      targetPath: '/workspace/project',
      appPath: '/Applications/QoderWork.app/Contents/MacOS/QoderWork',
    });
  });

  it('builds OpenCode as an open-only project call', () => {
    const builder = Reflect.get(integrationApi, 'buildMakeAgentSurfaceProjectOpenOptions');
    expect(builder).toBeTypeOf('function');
    expect(builder({
      provider: 'opencode',
      makeOrigin: 'http://127.0.0.1:53817',
      projectId: 'make-project',
      targetPath: '/workspace/project',
      appPath: '/Applications/OpenCode.app/Contents/MacOS/OpenCode',
    })).toEqual({
      provider: 'opencode',
      targetPath: '/workspace/project',
      appPath: '/Applications/OpenCode.app/Contents/MacOS/OpenCode',
    });
  });
});
