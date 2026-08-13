import { describe, expect, it } from 'vitest';

import {
  buildMakeAgentSurfaceConfig,
  buildMakeAgentSurfaceOpenOptions,
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
        hosts: ['codex', 'cursor', 'workbuddy', 'traework', 'qoderwork'],
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
    expect(resolveMakeAgentSurfaceHost('qoderwork')).toBe('qoderwork');
    expect(resolveMakeAgentSurfaceHost('opencode')).toBeNull();
  });

  it.each(['chatgpt', 'cursor', 'workbuddy', 'traework', 'qoderwork'] as const)(
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
    }).activate).toBe(true);

    expect(buildMakeAgentSurfaceOpenOptions({
      provider: 'cursor',
      makeOrigin: 'http://127.0.0.1:53817',
    }).activate).toBe(false);
  });

  it('passes an explicit TRAEWORK application path to injection-only host configuration', () => {
    const options = buildMakeAgentSurfaceOpenOptions({
      provider: 'traework',
      makeOrigin: 'http://127.0.0.1:53817',
      projectId: 'make-project',
      appPath: '/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron',
    });

    expect(options.config.hosts?.traework).toEqual({
      appPath: '/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron',
    });
  });

  it.each(['chatgpt', 'cursor', 'workbuddy', 'traework', 'qoderwork'] as const)(
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
      })).toMatchObject({
        provider: provider === 'chatgpt' ? 'codex' : provider,
        targetPath: '/workspace/project',
        appPath: '/Applications/Agent.app/Contents/MacOS/Agent',
        surface: {
          entryId: 'axhub-make',
          activate: false,
        },
      });
    },
  );

  it('builds QoderWork as one project-and-surface call', () => {
    const builder = Reflect.get(integrationApi, 'buildMakeAgentSurfaceProjectOpenOptions');
    expect(builder).toBeTypeOf('function');
    expect(builder({
      provider: 'qoderwork',
      makeOrigin: 'http://127.0.0.1:53817',
      projectId: 'make-project',
      targetPath: '/workspace/project',
      appPath: '/Applications/QoderWork.app/Contents/MacOS/QoderWork',
    })).toMatchObject({
      provider: 'qoderwork',
      targetPath: '/workspace/project',
      appPath: '/Applications/QoderWork.app/Contents/MacOS/QoderWork',
      surface: {
        entryId: 'axhub-make',
        activate: false,
      },
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
