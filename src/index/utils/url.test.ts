import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildEditorUrl, buildLANItemUrl, buildLANServerUrl, getItemSourcePath } from './url';

describe('url helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not invent a local source path for metadata-only resources', () => {
	    expect(getItemSourcePath({
	      name: 'home',
	      displayName: 'Home',
	      jsUrl: '',
	      specUrl: '',
	      clientUrl: 'http://localhost:3000/home',
	    }, 'prototypes')).toBe('');
  });

  it('uses explicit metadata file paths when available', () => {
	    expect(getItemSourcePath({
	      name: 'home',
	      displayName: 'Home',
	      jsUrl: '',
	      specUrl: '',
	      filePath: 'custom/screens/home/index.tsx',
	    }, 'prototypes')).toBe('custom/screens/home');
  });

  it('strips Agent bridge and editor WebSocket launch options from editor URLs', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://admin.local:5173',
      },
    });

    const url = new URL(buildEditorUrl({
      name: 'home',
      displayName: 'Home',
      jsUrl: '',
      specUrl: '',
      clientUrl: 'http://client.local:4173/prototypes/home?agentApiBaseUrl=http://stale/api&editorClientId=stale-client',
    }, 'demo', {
      width: 390,
      mobileMode: true,
      hostToolbar: true,
      mockExternalComments: true,
      agentBridge: {
        apiBaseUrl: 'http://localhost:32124/api',
        integrationChannel: '/workspace/demo/project',
        projectPath: '/workspace/demo/project',
        targetClientId: 'frontend-1234',
      },
      integrationWs: {
        enabled: true,
        apiBaseUrl: 'http://localhost:32124/api',
        channel: '/workspace/demo/project',
        clientId: 'make-editor-1234',
        sessionId: 'session-001',
      },
    } as any));

    expect(url.searchParams.get('agentApiBaseUrl')).toBeNull();
    expect(url.searchParams.get('agentIntegrationChannel')).toBeNull();
    expect(url.searchParams.get('agentTargetClientId')).toBeNull();
    expect(url.searchParams.get('cwd')).toBeNull();
    expect(url.searchParams.get('provider')).toBeNull();
    expect(url.searchParams.get('editorIntegrationWs')).toBeNull();
    expect(url.searchParams.get('editorApiBaseUrl')).toBeNull();
    expect(url.searchParams.get('editorIntegrationChannel')).toBeNull();
    expect(url.searchParams.get('editorClientId')).toBeNull();
    expect(url.searchParams.get('editorSessionId')).toBeNull();
    expect(url.searchParams.get('editorMobileMode')).toBe('true');
    expect(url.searchParams.get('agentToolbar')).toBe('host');
    expect(url.searchParams.get('mockExternalComments')).toBe('1');
    expect(url.searchParams.get('width')).toBe('390');
  });

  it('rewrites localhost client URLs to the injected LAN host', () => {
    vi.stubGlobal('window', {
      __LOCAL_IP__: '192.168.1.88',
      location: {
        origin: 'http://localhost:5174',
        protocol: 'http:',
        hostname: 'localhost',
        port: '5174',
      },
    });

    expect(buildLANItemUrl({
      name: 'home',
      displayName: 'Home',
      jsUrl: '',
      specUrl: '',
      clientUrl: 'http://localhost:51720/prototypes/home?mode=demo#screen',
    }, 'demo')).toBe('http://192.168.1.88:51720/prototypes/home?mode=demo#screen');
  });

  it('uses configured local and LAN hosts when building share URLs', () => {
    vi.stubGlobal('window', {
      __AXHUB_SHARE_HOSTS__: {
        localHost: 'make.local',
        lanHost: '10.0.8.42',
      },
      __LOCAL_IP__: '192.168.1.88',
      location: {
        origin: 'http://localhost:5174',
        protocol: 'http:',
        hostname: 'localhost',
        port: '5174',
      },
    });

    const item = {
      name: 'home',
      displayName: 'Home',
      jsUrl: '',
      specUrl: '',
      clientUrl: 'http://localhost:51720/prototypes/home?mode=demo#screen',
    };

    expect(buildEditorUrl(item, 'demo')).toBe('http://make.local:51720/prototypes/home?mode=demo&axhubDisplayName=Home#screen');
    expect(buildLANItemUrl(item, 'demo')).toBe('http://10.0.8.42:51720/prototypes/home?mode=demo#screen');
  });

  it('rewrites published server URLs to the configured LAN host while preserving routes', () => {
    vi.stubGlobal('window', {
      __LOCAL_IP__: '192.168.1.88',
      __AXHUB_SHARE_HOSTS__: {
        localHost: '127.0.0.1',
        lanHost: '10.0.8.42',
      },
      location: {
        origin: 'http://127.0.0.1:51720',
        hostname: '127.0.0.1',
      },
    });

    expect(buildLANServerUrl('http://127.0.0.1:51720/published/html/id/index.html?version=1#top'))
      .toBe('http://10.0.8.42:51720/published/html/id/index.html?version=1#top');
  });

  it('does not invent prototype canvas share URLs', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:5174',
        protocol: 'http:',
        hostname: 'localhost',
        port: '5174',
      },
    });

    const item = {
      name: 'home',
      displayName: 'Home',
      jsUrl: '',
      specUrl: '',
      clientUrl: 'http://localhost:51720/prototypes/home?mode=demo',
    };

    expect(buildLANItemUrl(item, 'canvas')).toBe('');
    expect(buildEditorUrl(item, 'canvas')).toBe('');
  });
});
