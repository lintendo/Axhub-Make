import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createCommentary: vi.fn(),
  getGlobalCommentaryTweakProtocol: vi.fn(),
  subscribeAcpRuntimeStatuses: vi.fn(),
}));

vi.mock('@axhub/commentary', () => ({
  createCommentary: mocked.createCommentary,
  getGlobalCommentaryTweakProtocol: mocked.getGlobalCommentaryTweakProtocol,
  subscribeAcpRuntimeStatuses: mocked.subscribeAcpRuntimeStatuses,
}));

vi.mock('../index/components/dialogs/AppDialogProvider', () => ({
  getImperativeAppDialog: () => null,
}));

import {
  buildInternalPrototypeCommentPageScope,
  createWebEditorV2Controller,
  createPrototypeCommentsPersistenceAdapter,
  readHostToolbarModeFromSearch,
  resolveHostResourceContextFromLocation,
  withTemporaryStyleHackComment,
} from './webEditorV2Integration';

beforeEach(() => {
  mocked.createCommentary.mockReset();
  mocked.getGlobalCommentaryTweakProtocol.mockReset();
  mocked.subscribeAcpRuntimeStatuses.mockReset();
  vi.unstubAllGlobals();
});

describe('temporary prototype style hack comment', () => {
  it('only treats the canonical leading header as already wrapped', () => {
    const css = '.label::after { content: "AXHUB TEMPORARY STYLE HACK"; }';

    const wrapped = withTemporaryStyleHackComment(css);

    expect(wrapped).toMatch(/^\/\*\n \* AXHUB TEMPORARY STYLE HACK/u);
    expect(wrapped).toContain(css);
  });
});

describe('createWebEditorV2Controller launch options', () => {
  it('ignores enable-time Agent bridge and editor integration options before creating the editor', async () => {
    const start = vi.fn();
    const stop = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
      getHostToolbarState: vi.fn(),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      destroy: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({
      toolbarMode: 'host',
      initialDarkMode: true,
      mobileMode: true,
      agentBridge: {
        apiBaseUrl: 'http://localhost:32124/api',
        integrationChannel: '/workspace/demo/project',
        projectPath: '/workspace/demo/project',
      },
      integrationWs: {
        enabled: true,
        apiBaseUrl: 'http://localhost:32124/api',
        channel: '/workspace/demo/project',
        clientId: 'make-editor-1234',
      },
    } as any);

    expect(mocked.createCommentary).toHaveBeenCalledWith(
      expect.objectContaining({
        mobileMode: true,
      }),
    );
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('agentBridge');
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('integrationWs');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('passes the annotation interaction profile into commentary', async () => {
    mocked.createCommentary.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
      getHostToolbarState: vi.fn(),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      destroy: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({ interactionProfile: 'annotation' } as never);

    expect(mocked.createCommentary).toHaveBeenCalledWith(
      expect.objectContaining({ interactionProfile: 'annotation' }),
    );
  });

  it('does not fetch runtime fallback for ignored AI bridge options', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const fetchRuntime = vi.fn(async () => {
      throw new Error('runtime fallback should not be fetched');
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
      getHostToolbarState: vi.fn(),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      destroy: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchRuntime as unknown as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable({
      toolbarMode: 'host',
      agentBridge: {
        apiBaseUrl: 'http://localhost:32124/api',
        integrationChannel: 'axhub',
        targetClientId: '',
      },
      integrationWs: {
        enabled: false,
        apiBaseUrl: 'http://localhost:32124/api',
        channel: 'axhub',
        clientId: '',
      },
    } as any);

    expect(fetchRuntime).not.toHaveBeenCalledWith('/api/assistant/runtime?autoStart=false', expect.anything());
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('agentBridge');
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('integrationWs');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('supplies a project-scoped ACP conversation task transport', async () => {
    const abort = vi.fn();
    mocked.subscribeAcpRuntimeStatuses.mockReturnValue({
      done: Promise.resolve({ threadId: 'thread-1', runState: 'completed' }),
      abort,
    });
    mocked.createCommentary.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
      getHostToolbarState: vi.fn(),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      destroy: vi.fn(),
    });
    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({
      annotationApiBaseUrl: 'http://localhost:53817',
      annotationProjectId: 'project-a',
    });
    const transport = mocked.createCommentary.mock.calls[0]?.[0]?.host?.conversationTaskTransport;
    const next = vi.fn();
    const subscription = transport.watch({
      commentId: 'comment-1',
      provider: 'codex',
      threadId: 'thread-1',
      requestId: 'request-1',
    }, { next });
    await subscription.done;

    expect(mocked.subscribeAcpRuntimeStatuses).toHaveBeenCalledWith({
      eventsUrl: 'http://localhost:53817/api/acp/conversations/runtime/events?projectId=project-a&targetPath=prototypes%2Fhome',
      runtimeUrl: 'http://localhost:53817/api/acp/conversations/runtime/status?projectId=project-a&targetPath=prototypes%2Fhome&threadId=thread-1',
      threadId: 'thread-1',
      provider: 'codex',
    }, next);
    subscription.abort();
    expect(abort).toHaveBeenCalledTimes(1);
  });
});

describe('readHostToolbarModeFromSearch', () => {
  it('enables host toolbar mode only for explicit host requests', () => {
    expect(readHostToolbarModeFromSearch('?agentToolbar=host')).toBe('host');
    expect(readHostToolbarModeFromSearch('?agentToolbar=inline')).toBeUndefined();
    expect(readHostToolbarModeFromSearch('')).toBeUndefined();
  });
});

describe('resolveHostResourceContextFromLocation', () => {
  it('builds stable internal prototype page scopes from Make route page ids', () => {
    expect(
      buildInternalPrototypeCommentPageScope('touch-and-talk-annotation-demo', 'common-tips'),
    ).toBe('prototypes/touch-and-talk-annotation-demo::page::common-tips');

    expect(
      buildInternalPrototypeCommentPageScope('prototypes/touch-and-talk-annotation-demo', 'voice-annotation'),
    ).toBe('prototypes/touch-and-talk-annotation-demo::page::voice-annotation');

    expect(buildInternalPrototypeCommentPageScope('demo', '../bad')).toBe('');
  });

  it('extracts reusable host resource context from prototype urls', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/prototypes/ref-dashboard',
        'http://localhost:51720/prototypes/ref-dashboard?editor=webEditorV2',
      ),
    ).toEqual({
      kind: 'prototype-entry',
      id: 'prototypes/ref-dashboard',
      path: 'prototypes/ref-dashboard',
      url: 'http://localhost:51720/prototypes/ref-dashboard?editor=webEditorV2',
      meta: {
        group: 'prototypes',
        name: 'ref-dashboard',
        commentPageScope: '/prototypes/ref-dashboard',
      },
    });
  });

  it('adds pane-specific storage scope for quick edit urls', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/prototypes/ref-dashboard',
        'http://localhost:51720/prototypes/ref-dashboard?editor=webEditorV2&axhubPane=secondary',
      ),
    ).toEqual({
      kind: 'prototype-entry',
      id: 'prototypes/ref-dashboard',
      path: 'prototypes/ref-dashboard',
      url: 'http://localhost:51720/prototypes/ref-dashboard?editor=webEditorV2&axhubPane=secondary',
      meta: {
        group: 'prototypes',
        name: 'ref-dashboard',
        storageScope: 'prototypes/ref-dashboard::quick-edit::secondary',
        commentPageScope: '/prototypes/ref-dashboard',
      },
    });
  });

  it('keeps pane-specific storage scope for embedded quick edit context urls', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/prototypes/ref-dashboard',
        'http://localhost:51720/prototypes/ref-dashboard?axhubPane=secondary&axhubQuickEditContext=1',
      ),
    ).toEqual({
      kind: 'prototype-entry',
      id: 'prototypes/ref-dashboard',
      path: 'prototypes/ref-dashboard',
      url: 'http://localhost:51720/prototypes/ref-dashboard?axhubPane=secondary&axhubQuickEditContext=1',
      meta: {
        group: 'prototypes',
        name: 'ref-dashboard',
        storageScope: 'prototypes/ref-dashboard::quick-edit::secondary',
        commentPageScope: '/prototypes/ref-dashboard',
      },
    });
  });

  it('derives stable comment page scope from business query and hash while filtering editor controls', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/prototypes/ref-dashboard',
        'http://localhost:51720/prototypes/ref-dashboard?editor=webEditorV2&tab=sales&axhubPane=secondary&filter=active&axhubQuickEditContext=1#details',
      ),
    ).toEqual({
      kind: 'prototype-entry',
      id: 'prototypes/ref-dashboard',
      path: 'prototypes/ref-dashboard',
      url: 'http://localhost:51720/prototypes/ref-dashboard?editor=webEditorV2&tab=sales&axhubPane=secondary&filter=active&axhubQuickEditContext=1#details',
      meta: {
        group: 'prototypes',
        name: 'ref-dashboard',
        storageScope: 'prototypes/ref-dashboard::quick-edit::secondary',
        commentPageScope: '/prototypes/ref-dashboard?filter=active&tab=sales#details',
      },
    });
  });

  it('resolves prototype context from index deep links with p and page query params', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/',
        'http://localhost:53817/?projectId=make-project&p=touch-and-talk-annotation-demo&page=common-tips',
      ),
    ).toEqual({
      kind: 'prototype-entry',
      id: 'prototypes/touch-and-talk-annotation-demo',
      path: 'prototypes/touch-and-talk-annotation-demo',
      url: 'http://localhost:53817/?projectId=make-project&p=touch-and-talk-annotation-demo&page=common-tips',
      meta: {
        group: 'prototypes',
        name: 'touch-and-talk-annotation-demo',
        commentPageScope: 'prototypes/touch-and-talk-annotation-demo::page::common-tips',
      },
    });
  });

  it('uses the internal prototype page scope for hash-routed prototype pages', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/prototypes/touch-and-talk-annotation-demo',
        'http://localhost:53817/prototypes/touch-and-talk-annotation-demo?agentToolbar=host#page=common-tips',
      )?.meta,
    ).toEqual({
      group: 'prototypes',
      name: 'touch-and-talk-annotation-demo',
      commentPageScope: 'prototypes/touch-and-talk-annotation-demo::page::common-tips',
    });
  });

  it('keeps numeric prototype ids valid when resolving index deep link scopes', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/',
        'http://localhost:53817/?p=demo-2026&page=step-01&projectId=make-project',
      )?.meta,
    ).toEqual({
      group: 'prototypes',
      name: 'demo-2026',
      commentPageScope: 'prototypes/demo-2026::page::step-01',
    });
  });

  it('prefers explicit comment page scope over the URL-derived scope', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/prototypes/ref-dashboard',
        'http://localhost:51720/prototypes/ref-dashboard?tab=sales#details',
        { commentPageScope: 'page:dashboard-sales' },
      )?.meta,
    ).toEqual({
      group: 'prototypes',
      name: 'ref-dashboard',
      commentPageScope: 'page:dashboard-sales',
    });
  });

  it('extracts host resource context from spec-template markdown urls', () => {
    expect(
      resolveHostResourceContextFromLocation(
        '/spec-template.html',
        'http://localhost:51720/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fdemo%252Fproject%252Fsrc%252Fresources%252Fintro.md',
      ),
    ).toEqual({
      kind: 'document',
      id: '/workspace/demo/project/src/resources/intro.md',
      path: '/workspace/demo/project/src/resources/intro.md',
      url: 'http://localhost:51720/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fdemo%252Fproject%252Fsrc%252Fresources%252Fintro.md',
      meta: {
        filePath: '/workspace/demo/project/src/resources/intro.md',
        route: '/spec-template.html',
      },
    });
  });

  it('returns null for unrelated locations', () => {
    expect(
      resolveHostResourceContextFromLocation('/preview/custom-page', 'http://localhost:51720/preview/custom-page'),
    ).toBeNull();
  });
});

describe('createWebEditorV2Controller', () => {
  it('uses neutral editor debug title wording instead of the old Agent runtime label', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const setIntervalMock = vi.fn(() => 1);
    const clearIntervalMock = vi.fn();
    const documentMock = { title: 'Prototype Preview', body: {} };

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      getDebugState: vi.fn(() => ({
        connected: false,
        available: true,
        hasReusableConversation: false,
        currentConversation: null,
        currentElementTask: null,
        visibleTasks: [],
        selectedElementKey: null,
        bridgeConfig: null,
      })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
      destroy: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?editorDebugTitle=1',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
      },
      setInterval: setIntervalMock,
      clearInterval: clearIntervalMock,
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('document', documentMock);

    const controller = createWebEditorV2Controller();
    await controller.enable();

    expect(documentMock.title).toContain('[EditorDebug]');
    expect(documentMock.title).not.toContain('[GenieDebug]');
    expect(setIntervalMock).toHaveBeenCalledWith(expect.any(Function), 250);
  });

  it('creates the editor from the shared package without forwarding runtime bridge options', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const getState = vi.fn(() => ({ active: false, version: 2 }));
    const acknowledgeSavedTextChanges = vi.fn();
    const acknowledgeSavedStyleChanges = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      getState,
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      subscribeStatus: vi.fn(() => () => undefined),
      getSelectedElement: vi.fn(() => null),
      getModifiedElements: vi.fn(() => []),
      getTextChanges: vi.fn(() => []),
      getStyleChanges: vi.fn(() => ({ cssText: '' })),
      getEditedSnapshot: vi.fn(() => ({
        resource: null,
        selectedElement: null,
        modifiedElements: [],
        textChanges: [],
        styleChanges: { cssText: '' },
      })),
      getDebugState: vi.fn(() => null),
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges,
      clearSelection: vi.fn(),
      revertElement: vi.fn(),
      clearElementEdits: vi.fn(),
      clearAllEdits: vi.fn(),
      destroy: vi.fn(),
      toggle: vi.fn(() => false),
    });

    vi.stubGlobal('window', {
      location: {
        search:
          '?agentApiBaseUrl=http://localhost:32124/api&agentIntegrationChannel=make&agentTargetClientId=frontend-1&cwd=%2Fworkspace%2Fdemo%2Fproject&provider=codex&editorIntegrationWs=1&editorApiBaseUrl=http://localhost:32124/api&editorIntegrationChannel=make&editorClientId=make-editor-abcd&editorSessionId=session-001&editorMobileMode=true',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home?editor=webEditorV2',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ health: { status: 'ready' } }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable();

    expect(mocked.createCommentary).toHaveBeenCalledTimes(1);
    expect(mocked.createCommentary).toHaveBeenCalledWith(
      expect.objectContaining({
        mobileMode: true,
        ui: {
          breadcrumbs: true,
          getAssistantPanelOpen: expect.any(Function),
          getAnnotationEnableAvailable: expect.any(Function),
          getAnnotationEnableLoading: expect.any(Function),
          getAnnotationEnabled: expect.any(Function),
          onEnableAnnotation: expect.any(Function),
          propertyPanel: true,
          showCopyPromptAction: true,
        },
        host: expect.objectContaining({
          buildCopyPrompt: expect.any(Function),
          canEditAnnotationMarkdown: expect.any(Function),
          getCreateAnnotationBlockReason: expect.any(Function),
          getAnnotationDocumentEditUrl: expect.any(Function),
          getAnnotationMarkdown: expect.any(Function),
          onDeleteAnnotationNode: expect.any(Function),
          getResourceContext: expect.any(Function),
          onAnnotationMarkdownChange: expect.any(Function),
          persistenceAdapter: expect.any(Object),
        }),
      }),
    );
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('agentBridge');
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('integrationWs');

    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;
    expect(host?.getResourceContext?.()).toEqual({
      kind: 'prototype-entry',
      id: 'prototypes/home',
      path: 'prototypes/home',
      url: 'http://localhost:51720/prototypes/home?editor=webEditorV2',
      meta: {
        group: 'prototypes',
        name: 'home',
        commentPageScope: '/prototypes/home',
      },
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('blocks only new annotations whose URL page differs from the mounted Runtime page', async () => {
    const start = vi.fn();
    const runtime = {
      getMetadata: vi.fn(() => ({ currentPageId: 'merchant-dashboard' })),
    };
    const location = {
      search: '?projectId=make-project&p=merchant-dashboard&page=overview',
      pathname: '/',
      href: 'http://localhost:53817/?projectId=make-project&p=merchant-dashboard&page=overview',
      protocol: 'http:',
      hostname: 'localhost',
    };

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });
    vi.stubGlobal('window', {
      location,
      __AXHUB_ANNOTATION_RUNTIME__: runtime,
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: true, source: null }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBe(
      '无法准确定位标注位置，该标注需要由 AI 生成',
    );

    const runtimeWindow = window as Window & {
      __AXHUB_ANNOTATION_RUNTIME__?: typeof runtime | Record<string, never>;
      __AXHUB_MAKE_ANNOTATION_RUNTIME__?: typeof runtime;
    };
    runtimeWindow.__AXHUB_ANNOTATION_RUNTIME__ = undefined;
    runtimeWindow.__AXHUB_MAKE_ANNOTATION_RUNTIME__ = runtime;
    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBe(
      '无法准确定位标注位置，该标注需要由 AI 生成',
    );
    runtimeWindow.__AXHUB_ANNOTATION_RUNTIME__ = runtime;
    runtimeWindow.__AXHUB_MAKE_ANNOTATION_RUNTIME__ = undefined;

    runtime.getMetadata.mockReturnValue({ currentPageId: 'overview' });
    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBeUndefined();

    runtime.getMetadata.mockReturnValue({ currentPageId: '' });
    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBeUndefined();

    runtimeWindow.__AXHUB_ANNOTATION_RUNTIME__ = {};
    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBeUndefined();

    runtimeWindow.__AXHUB_ANNOTATION_RUNTIME__ = runtime;
    runtime.getMetadata.mockReturnValue({ currentPageId: 'merchant-dashboard' });
    location.href = 'http://localhost:53817/?projectId=make-project&p=merchant-dashboard';
    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBeUndefined();
  });

  it('blocks new annotations using the cached annotation source page when the Runtime global is unavailable', async () => {
    const start = vi.fn();
    const location = {
      search: '?projectId=make-project&p=merchant-dashboard&page=overview',
      pathname: '/',
      href: 'http://localhost:53817/?projectId=make-project&p=merchant-dashboard&page=overview',
      protocol: 'http:',
      hostname: 'localhost',
    };

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });
    vi.stubGlobal('window', {
      location,
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        enabled: true,
        source: {
          documentVersion: 1,
          format: 'axhub-annotation-source',
          data: {
            version: 2,
            prototypeName: 'merchant-dashboard',
            pageId: 'merchant-dashboard',
            nodes: [],
            updatedAt: 1,
          },
        },
      }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable({ annotationProjectId: 'make-project' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBe(
      '无法准确定位标注位置，该标注需要由 AI 生成',
    );
  });

  it('reads an updated mounted source page when the API does not provide a source', async () => {
    const start = vi.fn();
    const location = {
      search: '?projectId=make-project&p=merchant-dashboard&page=overview',
      pathname: '/',
      href: 'http://localhost:53817/?projectId=make-project&p=merchant-dashboard&page=overview',
      protocol: 'http:',
      hostname: 'localhost',
    };
    const createSource = (pageId: string) => ({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'merchant-dashboard',
        pageId,
        nodes: [],
        updatedAt: 1,
      },
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });
    vi.stubGlobal('window', {
      location,
      __AXHUB_ANNOTATION_SOURCE_DOCUMENT__: createSource('merchant-dashboard'),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: true, source: null }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable({ annotationProjectId: 'make-project' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBe(
      '无法准确定位标注位置，该标注需要由 AI 生成',
    );

    (window as Window & {
      __AXHUB_ANNOTATION_SOURCE_DOCUMENT__?: ReturnType<typeof createSource>;
    }).__AXHUB_ANNOTATION_SOURCE_DOCUMENT__ = createSource('overview');

    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBeUndefined();
  });

  it('clears a cached API page when a later status refresh rejects', async () => {
    const start = vi.fn();
    const location = {
      search: '?projectId=make-project&p=merchant-dashboard&page=overview',
      pathname: '/',
      href: 'http://localhost:53817/?projectId=make-project&p=merchant-dashboard&page=overview',
      protocol: 'http:',
      hostname: 'localhost',
    };
    const createSource = (pageId: string) => ({
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'merchant-dashboard',
        pageId,
        nodes: [],
        updatedAt: 1,
      },
    });
    let annotationStatusRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/__axhub/make-server/status') {
        return { ok: false, json: async () => ({}) };
      }
      if (url.startsWith('/api/prototype-annotation?')) {
        annotationStatusRequests += 1;
        if (annotationStatusRequests === 1) {
          return {
            ok: true,
            json: async () => ({ enabled: true, source: createSource('merchant-dashboard') }),
          };
        }
        throw new Error('status unavailable');
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });
    vi.stubGlobal('window', {
      location,
      __AXHUB_ANNOTATION_SOURCE_DOCUMENT__: createSource('merchant-dashboard'),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable({ annotationProjectId: 'make-project' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBe(
      '无法准确定位标注位置，该标注需要由 AI 生成',
    );

    (window as Window & {
      __AXHUB_ANNOTATION_SOURCE_DOCUMENT__?: ReturnType<typeof createSource>;
    }).__AXHUB_ANNOTATION_SOURCE_DOCUMENT__ = createSource('overview');

    await controller.enable({ annotationProjectId: 'make-project' });

    expect(annotationStatusRequests).toBe(2);
    expect(host.getCreateAnnotationBlockReason?.({} as Element)).toBeUndefined();
  });

  it('uses prototype comment file adapter for host persistence', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (String(input).startsWith('/api/prototype-comments?') && init?.method !== 'PUT') {
        return {
          ok: true,
          json: async () => ({
            exists: true,
            document: {
              schemaVersion: 2,
              kind: 'prototype-edit-comments',
              resource: {
                id: 'home',
                targetPath: 'prototypes/home',
                filePath: '.axhub/make/comments/58e608f3612448e797ba90e2b2c5ae14189f971fd468bfcbddf7cfd2bb95882e.json',
              },
              comments: [],
              images: [],
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createPrototypeCommentsPersistenceAdapter({
      getProjectId: () => 'project-a',
    });
    const scope = {
      targetPath: 'prototypes/home',
      storageScope: 'prototypes/home',
      prototypeId: 'home',
      filePath: 'src/prototypes/home/index.tsx',
      resource: null,
    };

    await expect(adapter.read(scope)).resolves.toMatchObject({
      kind: 'prototype-edit-comments',
      resource: {
        targetPath: 'prototypes/home',
      },
    });
    const observedTombstones = [{
      kind: 'comment' as const,
      pageScope: 'page-a',
      elementKey: 'hero',
      deletedAt: 1784624000000,
    }];
    await expect(adapter.write(scope, {
      schemaVersion: 2,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: '.axhub/make/comments/58e608f3612448e797ba90e2b2c5ae14189f971fd468bfcbddf7cfd2bb95882e.json',
      },
      comments: [],
      images: [],
    }, 'restore', { observedTombstones })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/__axhub/make-server/status',
      { method: 'GET' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/prototype-comments?targetPath=prototypes%2Fhome&hydrateImages=1&projectId=project-a',
      { method: 'GET' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/__axhub/make-server/status',
      { method: 'GET' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/prototype-comments?targetPath=prototypes%2Fhome&projectId=project-a',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
    const putInit = fetchMock.mock.calls[3]?.[1];
    expect(JSON.parse(String(putInit?.body))).toEqual({
      document: expect.objectContaining({
        kind: 'prototype-edit-comments',
      }),
      reason: 'restore',
      observedTombstones,
    });
  });

  it('surfaces rejected prototype comment writes to the persistence runtime', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (String(input).startsWith('/api/prototype-comments?') && init?.method === 'PUT') {
        return {
          ok: false,
          status: 409,
          json: async () => ({}),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createPrototypeCommentsPersistenceAdapter();

    await expect(adapter.write({
      targetPath: 'prototypes/home',
      storageScope: 'prototypes/home',
      prototypeId: 'home',
      filePath: 'src/prototypes/home/index.tsx',
      resource: null,
    }, {
      schemaVersion: 2,
      kind: 'prototype-edit-comments',
      resource: { id: 'home', targetPath: 'prototypes/home', filePath: '' },
      comments: [],
      images: [],
    }, 'restore')).rejects.toThrow('Failed to write prototype comments: 409');
  });

  it('sends prototype comment persistence requests to the Make server origin when the preview runs on another port', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/__axhub/make-server/status') {
        return {
          ok: true,
          json: async () => ({
            ready: true,
            adminOrigin: 'http://localhost:53817',
          }),
        };
      }
      if (url.startsWith('http://localhost:53817/api/prototype-comments?') && init?.method !== 'PUT') {
        return {
          ok: true,
          json: async () => ({
            exists: true,
            document: {
              schemaVersion: 2,
              kind: 'prototype-edit-comments',
              resource: {
                id: 'home',
                targetPath: 'prototypes/home',
                filePath: '.axhub/make/comments/58e608f3612448e797ba90e2b2c5ae14189f971fd468bfcbddf7cfd2bb95882e.json',
              },
              comments: [],
              images: [],
            },
          }),
        };
      }
      if (url.startsWith('http://localhost:53817/api/prototype-comments?') && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ ok: true }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createPrototypeCommentsPersistenceAdapter();
    const scope = {
      targetPath: 'prototypes/home',
      storageScope: 'prototypes/home',
      prototypeId: 'home',
      filePath: 'src/prototypes/home/index.tsx',
      resource: null,
    };

    await adapter.read(scope);
    await adapter.write(scope, {
      schemaVersion: 2,
      kind: 'prototype-edit-comments',
      resource: {
        id: 'home',
        targetPath: 'prototypes/home',
        filePath: '.axhub/make/comments/58e608f3612448e797ba90e2b2c5ae14189f971fd468bfcbddf7cfd2bb95882e.json',
      },
      comments: [],
      images: [],
    }, 'changes');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/__axhub/make-server/status', { method: 'GET' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:53817/api/prototype-comments?targetPath=prototypes%2Fhome&hydrateImages=1',
      { method: 'GET' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:53817/api/prototype-comments?targetPath=prototypes%2Fhome',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
  });

  it('does not fetch assistant runtime defaults for editor bridge setup', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const acknowledgeSavedTextChanges = vi.fn();
    const acknowledgeSavedStyleChanges = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges,
    });

    vi.stubGlobal('window', {
      location: {
        search: '?editorIntegrationWs=1&editorIntegrationChannel=make&editorClientId=make-editor-abcd',
        pathname: '/prototypes/home',
        href: 'http://127.0.0.1:51720/prototypes/home?editor=webEditorV2',
        protocol: 'http:',
        hostname: '127.0.0.1',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/assistant/runtime?autoStart=false') {
        return {
          ok: true,
          json: async () => ({
            apiBaseUrl: 'http://127.0.0.1:32124/api',
            projectPath: '/workspace/demo/project',
            health: { status: 'ready' },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable();

    expect(fetchMock).not.toHaveBeenCalledWith('/api/assistant/runtime?autoStart=false', expect.anything());
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('agentBridge');
    expect(mocked.createCommentary.mock.calls[0]?.[0]).not.toHaveProperty('integrationWs');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('confirms before enabling local prototype annotations with user-facing copy and leaves cancellation as a no-op', async () => {
    const start = vi.fn();
    const reload = vi.fn();
    const confirm = vi.fn(() => false);
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: false, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      confirm,
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const ui = mocked.createCommentary.mock.calls[0]?.[0]?.ui;

    await expect(ui.onEnableAnnotation()).resolves.toBe(false);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('开启需求标注功能'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('如果之后需要关闭，请让 AI 帮你处理'));
    expect(confirm).not.toHaveBeenCalledWith(expect.stringContaining('annotation-source.json'));
    expect(confirm).not.toHaveBeenCalledWith(expect.stringContaining('运行时'));
    expect(confirm).not.toHaveBeenCalledWith(expect.stringContaining('注入'));
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/prototype-annotation/enable',
      expect.anything(),
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('enables local prototype annotations without reloading while Vite hot-updates the viewer', async () => {
    const start = vi.fn();
    const refresh = vi.fn();
    const reload = vi.fn();
    const source = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: false, source: null }),
        };
      }
      if (input === '/api/prototype-annotation/enable' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ enabled: true, changedIndex: true, source }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      refresh,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      setTimeout: vi.fn((handler: () => void) => {
        handler();
        return 1;
      }),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const ui = mocked.createCommentary.mock.calls[0]?.[0]?.ui;
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(ui.onEnableAnnotation()).resolves.toBe(true);

    expect(ui.getAnnotationEnabled()).toBe(true);
    expect(host.canEditAnnotationMarkdown({} as Element)).toBe(true);
    expect(refresh).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('delegates annotation enabling to the parent Make host in host toolbar mode', async () => {
    const start = vi.fn();
    const refresh = vi.fn();
    const reload = vi.fn();
    const listeners = new Map<string, Set<EventListener>>();
    const parentPostMessage = vi.fn();
    const parentWindow = { postMessage: parentPostMessage };
    const addEventListener = vi.fn((type: string, listener: EventListener) => {
      const current = listeners.get(type) ?? new Set<EventListener>();
      current.add(listener);
      listeners.set(type, current);
    });
    const removeEventListener = vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    });
    let statusReadCount = 0;
    const source = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'annotation-demo',
        pageId: 'prototype-as-prd',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://localhost:53817/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo&projectId=make-2-2') {
        statusReadCount += 1;
        return {
          ok: true,
          json: async () => statusReadCount > 1
            ? ({ enabled: true, source })
            : ({ enabled: false, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      refresh,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:51720/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      parent: parentWindow,
      addEventListener,
      removeEventListener,
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    parentPostMessage.mockImplementation((message: any) => {
      const [messageListener] = Array.from(listeners.get('message') ?? []);
      messageListener?.({
        data: {
          type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT',
          requestId: message.requestId,
          handled: true,
        },
        source: parentWindow,
      } as MessageEvent);
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({
      toolbarMode: 'host',
      annotationApiBaseUrl: 'http://localhost:53817',
      annotationProjectId: 'make-2-2',
    } as any);
    const ui = mocked.createCommentary.mock.calls[0]?.[0]?.ui;
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(ui.onEnableAnnotation()).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalledWith('/__axhub/make-server/status', expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:53817/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo&projectId=make-2-2',
      { method: 'GET' },
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:53817/api/prototype-annotation/enable?projectId=make-2-2',
      expect.anything(),
    );
    expect(parentPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST',
        action: { type: 'enable-annotation' },
      }),
      '*',
    );
    expect(ui.getAnnotationEnabled()).toBe(true);
    expect(host.canEditAnnotationMarkdown({} as Element)).toBe(true);
    expect(refresh).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('skips the local annotation enable API when the runtime is already mounted', async () => {
    const start = vi.fn();
    const refresh = vi.fn();
    const runtimeRefresh = vi.fn();
    const replaceSource = vi.fn();
    const reload = vi.fn();
    const source = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      refresh,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      __AXHUB_MAKE_ANNOTATION_RUNTIME__: { replaceSource, refresh: runtimeRefresh },
      setTimeout: vi.fn((handler: () => void) => {
        handler();
        return 1;
      }),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const ui = mocked.createCommentary.mock.calls[0]?.[0]?.ui;

    await expect(ui.onEnableAnnotation()).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalledWith('/api/prototype-annotation/enable', expect.anything());
    expect(replaceSource).not.toHaveBeenCalled();
    expect(runtimeRefresh).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not show a second local failure dialog when host-owned annotation enabling fails', async () => {
    const start = vi.fn();
    const reload = vi.fn();
    const alert = vi.fn();
    const listeners = new Map<string, Set<EventListener>>();
    const parentPostMessage = vi.fn();
    const parentWindow = { postMessage: parentPostMessage };
    const addEventListener = vi.fn((type: string, listener: EventListener) => {
      const current = listeners.get(type) ?? new Set<EventListener>();
      current.add(listener);
      listeners.set(type, current);
    });
    const removeEventListener = vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (url === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: false, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      parent: parentWindow,
      addEventListener,
      removeEventListener,
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
      confirm: vi.fn(() => true),
      alert,
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    parentPostMessage.mockImplementation((message: any) => {
      const [messageListener] = Array.from(listeners.get('message') ?? []);
      messageListener?.({
        data: {
          type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT',
          requestId: message.requestId,
          handled: false,
          error: 'Not found',
        },
        source: parentWindow,
      } as MessageEvent);
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const ui = mocked.createCommentary.mock.calls[0]?.[0]?.ui;

    await expect(ui.onEnableAnnotation()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalledWith('/api/prototype-annotation/enable', expect.anything());
    expect(alert).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('treats an already mounted annotation runtime as enabled for host toolbar state', async () => {
    const start = vi.fn();
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: false, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:53817/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: {},
      __AXHUB_ANNOTATION_SOURCE__: {
        directory: null,
        nodes: [{ id: 'prototype-as-prd', hasMarkdown: true }],
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const ui = mocked.createCommentary.mock.calls[0]?.[0]?.ui;
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    expect(ui.getAnnotationEnabled()).toBe(true);
    expect(ui.getAnnotationEnableAvailable()).toBe(true);
    expect(host.canEditAnnotationMarkdown({} as Element)).toBe(true);
  });

  it('reads local annotation markdown from the mounted runtime source when the API source is unavailable', async () => {
    const start = vi.fn();
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: false, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:53817/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: {},
      __AXHUB_ANNOTATION_SOURCE__: {
        directory: null,
        nodes: [{ id: 'prototype-as-prd-purpose', hasMarkdown: true }],
      },
      __AXHUB_ANNOTATION_SOURCE_DOCUMENT__: {
        documentVersion: 1,
        format: 'axhub-annotation-source',
        data: {
          version: 2,
          prototypeName: 'annotation-demo',
          pageId: 'prototype-as-prd',
          updatedAt: 1,
          nodes: [
            {
              id: 'prototype-as-prd-purpose',
              hasMarkdown: true,
              locator: { selectors: ['#purpose'], fingerprint: 'section|id=purpose', path: [] },
            },
          ],
        },
        markdownMap: {
          'prototype-as-prd-purpose': '# 原型是主需求载体\n\n标注用于说明原因、边界、例外和未决事项。',
        },
        assetMap: {},
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const panelElement = {
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-panel-node-id' ? 'prototype-as-prd-purpose' : null
      )),
      closest: vi.fn(() => null),
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.getAnnotationMarkdown(panelElement)).resolves.toBe(
      '# 原型是主需求载体\n\n标注用于说明原因、边界、例外和未决事项。',
    );
  });

  it('reads existing local annotation markdown when selecting the annotation marker itself', async () => {
    const start = vi.fn();
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: false, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:53817/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: {},
      __AXHUB_ANNOTATION_SOURCE__: {
        directory: null,
        nodes: [{ id: 'prototype-as-prd-purpose', hasMarkdown: true }],
      },
      __AXHUB_ANNOTATION_SOURCE_DOCUMENT__: {
        documentVersion: 1,
        format: 'axhub-annotation-source',
        data: {
          version: 2,
          prototypeName: 'annotation-demo',
          pageId: 'prototype-as-prd',
          updatedAt: 1,
          nodes: [
            {
              id: 'prototype-as-prd-purpose',
              hasMarkdown: true,
              locator: { selectors: ['.annotation-guide-hero'], fingerprint: 'section', path: [] },
            },
          ],
        },
        markdownMap: {
          'prototype-as-prd-purpose': '# 原型是主需求载体\n\n标注用于说明原因、边界、例外和未决事项。',
        },
        assetMap: {},
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const markerElement = {
      id: '',
      tagName: 'BUTTON',
      getAttribute: vi.fn((name: string) => {
        if (name === 'data-axhub-annotation-marker') return 'true';
        if (name === 'data-axhub-annotation-node-id') return 'prototype-as-prd-purpose';
        return null;
      }),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.getAnnotationMarkdown(markerElement)).resolves.toBe(
      '# 原型是主需求载体\n\n标注用于说明原因、边界、例外和未决事项。',
    );
  });

  it('reads existing local annotation markdown by matching element selectors without requiring locator metadata to be identical', async () => {
    const start = vi.fn();
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            source: {
              documentVersion: 1,
              format: 'axhub-annotation-source',
              data: {
                version: 2,
                prototypeName: 'annotation-demo',
                pageId: 'prototype-as-prd',
                updatedAt: 1,
                nodes: [
                  {
                    id: 'prototype-as-prd-purpose',
                    hasMarkdown: true,
                    locator: { selectors: ['.annotation-guide-hero'] },
                  },
                ],
              },
              markdownMap: {
                'prototype-as-prd-purpose': '# 原型是主需求载体',
              },
              assetMap: {},
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:53817/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: {},
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: '',
      tagName: 'SECTION',
      classList: {
        contains: (className: string) => className === 'annotation-guide-hero',
      },
      getAttribute: vi.fn((name: string) => {
        if (name === 'data-annotation-id') return null;
        if (name === 'class') return 'annotation-guide-hero';
        return null;
      }),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.getAnnotationMarkdown(element)).resolves.toBe('# 原型是主需求载体');
  });

  it('falls back to mounted annotation snapshot text when the runtime source document is unavailable', async () => {
    const start = vi.fn();
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: false, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:53817/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_SOURCE__: {
        directory: null,
        nodes: [
          {
            id: 'prototype-as-prd-purpose',
            hasMarkdown: true,
            annotationText: '# 原型是主需求载体\n\n当原型已经能表达页面结构、交互路径和状态变化时，PRD 的重点就从重复描述界面转向补充判断依据。',
          },
        ],
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const panelElement = {
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-panel-node-id' ? 'prototype-as-prd-purpose' : null
      )),
      closest: vi.fn(() => null),
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.getAnnotationMarkdown(panelElement)).resolves.toBe(
      '# 原型是主需求载体\n\n当原型已经能表达页面结构、交互路径和状态变化时，PRD 的重点就从重复描述界面转向补充判断依据。',
    );
  });

  it('only allows local annotation markdown editing from annotation bubble panel targets', async () => {
    const start = vi.fn();
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: null }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:53817/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: {},
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const bubblePanel = {
      getAttribute: vi.fn((name: string) => {
        if (name === 'data-axhub-annotation-panel-target') return 'true';
        if (name === 'data-axhub-annotation-panel-node-id') return 'prototype-as-prd-purpose';
        return null;
      }),
      closest: vi.fn(() => null),
    } as unknown as Element;
    const directoryArticleParagraph = {
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-comment-target' ? 'true' : null
      )),
      closest: vi.fn((selector: string) => {
        if (selector === '[data-axhub-annotation-panel-target="true"]') return null;
        if (selector === '[data-axhub-annotation-panel-node-id]') return null;
        return null;
      }),
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    expect(host.canEditAnnotationMarkdown(bubblePanel)).toBe(true);
    expect(host.canEditAnnotationMarkdown(directoryArticleParagraph)).toBe(false);
  });

  it('exposes directory markdown document editing through the commentary host only while annotation comments are enabled', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const source = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [
          {
            type: 'folder',
            id: 'folder-docs',
            title: 'Docs',
            children: [
              {
                type: 'markdown',
                id: 'nested-prd',
                title: 'Nested PRD',
                markdownPath: 'docs/nested/prd.md',
                markdown: '# Nested PRD',
              },
            ],
          },
          {
            type: 'markdown',
            id: 'prd',
            title: 'PRD',
            markdownPath: 'docs/prd.md',
            markdown: '# Home PRD',
          },
          {
            type: 'markdown',
            id: 'unsafe',
            title: 'Unsafe',
            markdownPath: '../secret.md',
            markdown: '# Unsafe',
          },
        ],
      },
    };

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: {},
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return { ok: false, json: async () => ({}) };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return { ok: true, json: async () => ({ enabled: true, source }) };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    }) as typeof fetch);

    const controller = createWebEditorV2Controller();

    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;
    const directoryMarkdownBlock = {
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-directory-markdown-id' ? 'prd' : null
      )),
      closest: vi.fn((selector: string) => (
        selector === '[data-axhub-annotation-directory-markdown-block="true"]'
          ? directoryMarkdownBlock
          : null
      )),
    } as unknown as Element & { closest: ReturnType<typeof vi.fn> };
    const directoryMarkdownRoot = {
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-directory-markdown-id' ? 'prd' : null
      )),
      closest: vi.fn(() => null),
    } as unknown as Element;
    const plainAnnotationTarget = {
      getAttribute: vi.fn(() => null),
      closest: vi.fn(() => null),
    } as unknown as Element;
    const nestedDirectoryMarkdownChild = {
      getAttribute: vi.fn(() => null),
      closest: vi.fn((selector: string) => (
        selector === '[data-axhub-annotation-directory-markdown-block="true"]'
          ? {
              getAttribute: vi.fn((name: string) => (
                name === 'data-axhub-annotation-directory-markdown-id' ? 'nested-prd' : null
              )),
            }
          : null
      )),
    } as unknown as Element;
    const unsafeDirectoryMarkdownBlock = {
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-directory-markdown-id' ? 'unsafe' : null
      )),
      closest: vi.fn((selector: string) => (
        selector === '[data-axhub-annotation-directory-markdown-block="true"]'
          ? unsafeDirectoryMarkdownBlock
          : null
      )),
    } as unknown as Element & { closest: ReturnType<typeof vi.fn> };

    expect(host.getAnnotationDocumentEditUrl(directoryMarkdownBlock)).toBe(
      '/?docPath=src%2Fprototypes%2Fhome%2Fdocs%2Fprd.md',
    );
    expect(host.getAnnotationDocumentEditUrl(nestedDirectoryMarkdownChild)).toBe(
      '/?docPath=src%2Fprototypes%2Fhome%2Fdocs%2Fnested%2Fprd.md',
    );
    expect(host.getAnnotationDocumentEditUrl(directoryMarkdownRoot)).toBe('');
    expect(host.getAnnotationDocumentEditUrl(plainAnnotationTarget)).toBe('');
    expect(host.getAnnotationDocumentEditUrl(unsafeDirectoryMarkdownBlock)).toBe('');
    controller.disable();

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('opens directory markdown document editing on the configured Make origin with the active project id', async () => {
    const start = vi.fn();
    const source = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'annotation-demo',
        pageId: 'prototype-as-prd',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [
          {
            type: 'markdown',
            id: 'prd',
            title: 'PRD',
            markdownPath: 'docs/prd.md',
            markdown: '# PRD',
          },
        ],
      },
    };

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-4&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:51724/?projectId=make-4&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: {},
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (
        input
        === 'http://localhost:53817/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo&projectId=make-4'
      ) {
        return { ok: true, json: async () => ({ enabled: true, source }) };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    }) as typeof fetch);

    const controller = createWebEditorV2Controller();

    await controller.enable({
      annotationApiBaseUrl: 'http://localhost:53817',
      annotationProjectId: 'make-4',
    } as any);
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;
    const directoryMarkdownBlock = {
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-directory-markdown-id' ? 'prd' : null
      )),
      closest: vi.fn((selector: string) => (
        selector === '[data-axhub-annotation-directory-markdown-block="true"]'
          ? directoryMarkdownBlock
          : null
      )),
    } as unknown as Element & { closest: ReturnType<typeof vi.fn> };

    expect(host.getAnnotationDocumentEditUrl(directoryMarkdownBlock)).toBe(
      'http://localhost:53817/?projectId=make-4&docPath=src%2Fprototypes%2Fannotation-demo%2Fdocs%2Fprd.md',
    );
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('refreshes directory markdown source after injected editor saves the referenced file', async () => {
    const start = vi.fn();
    const refresh = vi.fn();
    const replaceSource = vi.fn();
    const source = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
      directory: {
        nodes: [
          {
            type: 'markdown',
            id: 'prd',
            title: 'PRD',
            markdownPath: 'docs/prd.md',
            markdown: '# Old PRD',
          },
        ],
      },
    };
    const nextSource = {
      ...source,
      directory: {
        nodes: [
          {
            type: 'markdown',
            id: 'prd',
            title: 'PRD',
            markdownPath: 'docs/prd.md',
            markdown: '# New PRD',
          },
        ],
      },
    };
    const messageHandlers: Array<(event: MessageEvent) => void> = [];
    class MockBroadcastChannel {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      addEventListener(type: string, handler: (event: MessageEvent) => void) {
        if (type === 'message') {
          messageHandlers.push(handler);
        }
      }
      close = vi.fn();
    }
    let statusCallCount = 0;

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      refresh,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_RUNTIME__: { replaceSource },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel as unknown as typeof BroadcastChannel);
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input === '/__axhub/make-server/status') {
        return { ok: false, json: async () => ({}) };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        statusCallCount += 1;
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            source: statusCallCount === 1 ? source : nextSource,
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    }) as typeof fetch);

    const controller = createWebEditorV2Controller();

    await controller.enable();
    await messageHandlers[0]?.({
      data: {
        type: 'markdown-file-saved',
        path: 'src/prototypes/home/docs/prd.md',
        updatedAt: 1,
      },
    } as MessageEvent);

    await vi.waitFor(() => {
      expect(replaceSource).toHaveBeenCalledWith(nextSource);
    });
    expect(refresh).toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('writes local annotation markdown without touching prompt edits and refreshes the annotation runtime', async () => {
    const start = vi.fn();
    const replaceSource = vi.fn();
    const refresh = vi.fn();
    const reload = vi.fn();
    const nextSource = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [
          {
            id: 'annotation-1',
            locator: {
              selectors: ['#target'],
              fingerprint: 'button|id=target',
              path: [{ tag: 'button', index: 0 }],
            },
            hasMarkdown: true,
          },
        ],
        updatedAt: 1,
      },
      markdownMap: { 'annotation-1': '新的标注' },
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: nextSource }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ source: nextSource }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      __AXHUB_ANNOTATION_RUNTIME__: { replaceSource, refresh },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: 'target',
      tagName: 'BUTTON',
      getAttribute: vi.fn((name: string) => (name === 'data-axhub-annotation-panel-node-id' ? null : '')),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    expect(host.canEditAnnotationMarkdown(element)).toBe(true);
    await expect(host.onAnnotationMarkdownChange(element, '新的标注')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/prototype-annotation/node',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"markdown":"新的标注"'),
      }),
    );
    expect(replaceSource).toHaveBeenCalledWith(nextSource);
    expect(refresh).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('deletes a local annotation node by writing empty markdown and refreshing the annotation runtime', async () => {
    const start = vi.fn();
    const replaceSource = vi.fn();
    const refresh = vi.fn();
    const nextSource = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [],
        updatedAt: 1,
      },
      markdownMap: {},
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: nextSource }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ source: nextSource }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload: vi.fn(),
      },
      __AXHUB_ANNOTATION_RUNTIME__: { replaceSource, refresh },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: 'target',
      tagName: 'BUTTON',
      getAttribute: vi.fn((name: string) => (
        name === 'data-axhub-annotation-node-id'
          ? 'annotation-1'
          : ''
      )),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.onDeleteAnnotationNode(element)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/prototype-annotation/node',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"markdown":""'),
      }),
    );
    expect(replaceSource).toHaveBeenCalledWith(nextSource);
    expect(refresh).toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('deletes a mounted annotation node by resolving the selected element locator to a node id', async () => {
    const start = vi.fn();
    const replaceSource = vi.fn();
    const refresh = vi.fn();
    let requestBody: Record<string, unknown> | null = null;
    const mountedSource = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'annotation-demo',
        pageId: 'agent-read',
        nodes: [
          {
            id: 'agent-read-skill',
            pageId: 'agent-read',
            locator: {
              selectors: ['[data-annotation-id="agent-read-skill"]'],
            },
            hasMarkdown: true,
          },
        ],
        updatedAt: 1,
      },
      markdownMap: {
        'agent-read-skill': '# Agent 读取',
      },
      assetMap: {},
    };
    const nextSource = {
      ...mountedSource,
      data: {
        ...mountedSource.data,
        nodes: [],
        updatedAt: 2,
      },
      markdownMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: mountedSource }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        requestBody = JSON.parse(String(init.body));
        return {
          ok: true,
          json: async () => ({ source: nextSource }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?agentToolbar=host',
        pathname: '/prototypes/annotation-demo',
        href: 'http://localhost:51721/prototypes/annotation-demo?agentToolbar=host#page=agent-read',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_ANNOTATION_SOURCE_DOCUMENT__: mountedSource,
      __AXHUB_ANNOTATION_RUNTIME__: { replaceSource, refresh },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: '',
      tagName: 'DIV',
      getAttribute: vi.fn((name: string) => {
        if (name === 'data-annotation-id') return 'agent-read-skill';
        if (name === 'class') return 'annotation-guide-agent-read';
        return null;
      }),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.onDeleteAnnotationNode(element)).resolves.toBeUndefined();

    expect(requestBody).toEqual({
      targetPath: 'prototypes/annotation-demo',
      nodeId: 'agent-read-skill',
      markdown: '',
    });
    expect(replaceSource).toHaveBeenCalledWith(nextSource);
    expect(refresh).toHaveBeenCalled();
  });

  it('refreshes the make annotation runtime wrapper after creating a local annotation node', async () => {
    const start = vi.fn();
    const replaceSource = vi.fn(async () => undefined);
    const refresh = vi.fn();
    const nextSource = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [
          {
            id: 'annotation-1',
            locator: {
              selectors: ['#target'],
              fingerprint: 'button|id=target',
              path: [{ tag: 'button', index: 0 }],
            },
            hasMarkdown: true,
          },
        ],
        updatedAt: 1,
      },
      markdownMap: { 'annotation-1': '新的标注' },
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: nextSource }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ source: nextSource }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      __AXHUB_MAKE_ANNOTATION_RUNTIME__: { replaceSource, refresh },
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: 'target',
      tagName: 'BUTTON',
      getAttribute: vi.fn((name: string) => (name === 'data-axhub-annotation-panel-node-id' ? null : '')),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.onAnnotationMarkdownChange(element, '新的标注')).resolves.toBeUndefined();

    expect(replaceSource).toHaveBeenCalledWith(nextSource);
    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('waits for async annotation runtime source replacement before completing local annotation writes', async () => {
    const start = vi.fn();
    let resolveReplaceSource: (() => void) | null = null;
    const replaceSource = vi.fn(() => new Promise<void>((resolve) => {
      resolveReplaceSource = resolve;
    }));
    const refresh = vi.fn();
    const reload = vi.fn();
    const nextSource = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [
          {
            id: 'annotation-1',
            locator: {
              selectors: ['#target'],
              fingerprint: 'button|id=target',
              path: [{ tag: 'button', index: 0 }],
            },
            hasMarkdown: true,
          },
        ],
        updatedAt: 1,
      },
      markdownMap: { 'annotation-1': '新的标注' },
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: nextSource }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ source: nextSource }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      __AXHUB_ANNOTATION_RUNTIME__: { replaceSource, refresh },
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: 'target',
      tagName: 'BUTTON',
      getAttribute: vi.fn((name: string) => (name === 'data-axhub-annotation-panel-node-id' ? null : '')),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    let writeSettled = false;
    const writePromise = host.onAnnotationMarkdownChange(element, '新的标注').then(() => {
      writeSettled = true;
    });

    await vi.waitFor(() => {
      expect(replaceSource).toHaveBeenCalledWith(nextSource);
    });
    expect(writeSettled).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    resolveReplaceSource?.();
    await expect(writePromise).resolves.toBeUndefined();

    expect(writeSettled).toBe(true);
    expect(refresh).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('keeps local annotation writes successful when async runtime source replacement rejects', async () => {
    const start = vi.fn();
    let rejectReplaceSource: ((error: Error) => void) | null = null;
    const replaceSource = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectReplaceSource = reject;
    }));
    const refresh = vi.fn();
    const reload = vi.fn();
    const nextSource = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'home',
        pageId: 'home',
        nodes: [
          {
            id: 'annotation-1',
            locator: {
              selectors: ['#target'],
              fingerprint: 'button|id=target',
              path: [{ tag: 'button', index: 0 }],
            },
            hasMarkdown: true,
          },
        ],
        updatedAt: 1,
      },
      markdownMap: { 'annotation-1': '新的标注' },
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: nextSource }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ source: nextSource }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
        reload,
      },
      __AXHUB_ANNOTATION_RUNTIME__: { replaceSource, refresh },
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: 'target',
      tagName: 'BUTTON',
      getAttribute: vi.fn((name: string) => (name === 'data-axhub-annotation-panel-node-id' ? null : '')),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    const writePromise = host.onAnnotationMarkdownChange(element, '新的标注');

    await vi.waitFor(() => {
      expect(replaceSource).toHaveBeenCalledWith(nextSource);
    });
    rejectReplaceSource?.(new Error('runtime replace failed'));

    await expect(writePromise).resolves.toBeUndefined();

    expect(refresh).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('writes a structural selector fallback when creating local annotation nodes from repeated classes', async () => {
    const start = vi.fn();
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fhome') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: null }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        requestBody = JSON.parse(String(init.body));
        return {
          ok: true,
          json: async () => ({
            source: {
              documentVersion: 1,
              format: 'axhub-annotation-source',
              data: {
                version: 2,
                prototypeName: 'home',
                pageId: 'home',
                nodes: [],
                updatedAt: 1,
              },
              markdownMap: {},
              assetMap: {},
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const body = { tagName: 'BODY', children: [] as unknown[] };
    const root = {
      id: '',
      tagName: 'DIV',
      getAttribute: vi.fn((name: string) => (name === 'class' ? '' : null)),
      parentElement: body,
      children: [] as unknown[],
    };
    const main = {
      id: '',
      tagName: 'MAIN',
      getAttribute: vi.fn((name: string) => (name === 'class' ? '' : null)),
      parentElement: root,
      children: [] as unknown[],
    };
    const article = {
      id: '',
      tagName: 'ARTICLE',
      getAttribute: vi.fn((name: string) => (name === 'class' ? '' : null)),
      parentElement: main,
      children: [] as unknown[],
    };
    const firstSection = {
      id: '',
      tagName: 'SECTION',
      getAttribute: vi.fn((name: string) => (name === 'class' ? 'annotation-guide-manuscript' : null)),
      parentElement: article,
      children: [] as unknown[],
    };
    const target = {
      id: '',
      tagName: 'SECTION',
      getAttribute: vi.fn((name: string) => (name === 'class' ? 'annotation-guide-manuscript' : null)),
      closest: vi.fn(() => null),
      parentElement: article,
      children: [] as unknown[],
    };
    body.children = [root];
    root.children = [main];
    main.children = [article];
    article.children = [firstSection, target];

    const controller = createWebEditorV2Controller();
    await controller.enable();
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.onAnnotationMarkdownChange(target as unknown as Element, '新的标注')).resolves.toBeUndefined();

    expect(requestBody?.locator).toMatchObject({
      selectors: [
        '.annotation-guide-manuscript',
        'div > main > article > section:nth-of-type(2)',
      ],
    });
  });

  it('includes the current prototype page id when creating a local annotation node', async () => {
    const start = vi.fn();
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: null }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        requestBody = JSON.parse(String(init.body));
        return {
          ok: true,
          json: async () => ({
            source: {
              documentVersion: 1,
              format: 'axhub-annotation-source',
              data: {
                version: 2,
                prototypeName: 'annotation-demo',
                pageId: 'prototype-as-prd',
                nodes: [],
                updatedAt: 1,
              },
              markdownMap: {},
              assetMap: {},
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?agentToolbar=host',
        pathname: '/prototypes/annotation-demo',
        href: 'http://localhost:53817/prototypes/annotation-demo?agentToolbar=host#page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const element = {
      id: 'purpose',
      tagName: 'SECTION',
      getAttribute: vi.fn((name: string) => (name === 'data-axhub-annotation-panel-node-id' ? null : '')),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.onAnnotationMarkdownChange(element, '新增标注')).resolves.toBeUndefined();

    expect(requestBody).toMatchObject({
      targetPath: 'prototypes/annotation-demo',
      pageId: 'prototype-as-prd',
      markdown: '新增标注',
    });
    expect(requestBody).not.toHaveProperty('nodeId');
    expect(requestBody?.locator).toMatchObject({
      selectors: expect.arrayContaining(['#purpose']),
    });
  });

  it('writes local annotation markdown to the existing annotation node when selecting a marker', async () => {
    const start = vi.fn();
    const nextSource = {
      documentVersion: 1,
      format: 'axhub-annotation-source',
      data: {
        version: 2,
        prototypeName: 'annotation-demo',
        pageId: 'prototype-as-prd',
        nodes: [
          {
            id: 'prototype-as-prd-purpose',
            locator: {
              selectors: ['.annotation-guide-hero'],
            },
            hasMarkdown: true,
          },
        ],
        updatedAt: 1,
      },
      markdownMap: { 'prototype-as-prd-purpose': '更新后的标注' },
      assetMap: {},
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/__axhub/make-server/status') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      if (input === '/api/prototype-annotation?targetPath=prototypes%2Fannotation-demo') {
        return {
          ok: true,
          json: async () => ({ enabled: true, source: nextSource }),
        };
      }
      if (input === '/api/prototype-annotation/node' && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ source: nextSource }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        pathname: '/',
        href: 'http://localhost:53817/?projectId=make-2-2&p=annotation-demo&page=prototype-as-prd',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const markerElement = {
      id: '',
      tagName: 'BUTTON',
      getAttribute: vi.fn((name: string) => {
        if (name === 'data-axhub-annotation-marker') return 'true';
        if (name === 'data-axhub-annotation-node-id') return 'prototype-as-prd-purpose';
        return null;
      }),
      closest: vi.fn(() => null),
      parentElement: null,
    } as unknown as Element;

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;

    await expect(host.onAnnotationMarkdownChange(markerElement, '更新后的标注')).resolves.toBeUndefined();

    const writeCall = fetchMock.mock.calls.find(([input, init]) => (
      input === '/api/prototype-annotation/node'
      && init?.method === 'PUT'
    ));
    expect(writeCall).toBeTruthy();
    expect(JSON.parse(String(writeCall?.[1]?.body))).toEqual({
      targetPath: 'prototypes/annotation-demo',
      nodeId: 'prototype-as-prd-purpose',
      markdown: '更新后的标注',
    });
  });

  it('normalizes project-local skillInstallSource entries before forwarding them to createCommentary', async () => {
    const start = vi.fn();
    const stop = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search:
          '?agentApiBaseUrl=http://localhost:32124/api&agentIntegrationChannel=make&agentTargetClientId=frontend-1',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home?editor=webEditorV2',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ health: { status: 'ready' } }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller({
      ui: {
        skillInstallSource: [
          '.agents/skills/explore-options/SKILL.md',
          '.claude\\skills\\handle-comments\\SKILL.md',
        ].join('\n'),
      },
    });
    await controller.enable();

    expect(mocked.createCommentary).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: {
          breadcrumbs: true,
          getAssistantPanelOpen: expect.any(Function),
          getAnnotationEnableAvailable: expect.any(Function),
          getAnnotationEnableLoading: expect.any(Function),
          getAnnotationEnabled: expect.any(Function),
          onEnableAnnotation: expect.any(Function),
          propertyPanel: true,
          showCopyPromptAction: true,
          skillInstallSource: [
            '.agents/skills/explore-options/SKILL.md',
            '.claude/skills/handle-comments/SKILL.md',
          ].join('\n'),
        },
      }),
    );
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('forwards explicit host toolbar mode from the embedded preview url', async () => {
    const start = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      getHostToolbarState: vi.fn(() => ({ toolbarMode: 'host', visible: true })),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?agentToolbar=host',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home?agentToolbar=host',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ health: { status: 'ready' } }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable();

    expect(mocked.createCommentary).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: expect.objectContaining({
          toolbarMode: 'host',
        }),
      }),
    );
    expect(controller.getHostToolbarState()).toEqual({
      toolbarMode: 'host',
      visible: true,
    });
    await expect(controller.runHostToolbarAction({ type: 'wake-agent' })).resolves.toBe(true);
  });

  it('forwards host toolbar mode from direct dev-template enable options', async () => {
    const start = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      getHostToolbarState: vi.fn(() => ({ toolbarMode: 'host', visible: true })),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ health: { status: 'ready' } }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });

    expect(mocked.createCommentary).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: expect.objectContaining({
          toolbarMode: 'host',
        }),
      }),
    );
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('exposes a parent host toolbar action bridge for prompt card AI execution', async () => {
    const start = vi.fn();
    const listeners = new Map<string, Set<EventListener>>();
    const parentWindow = { postMessage: vi.fn() };
    const addEventListener = vi.fn((type: string, listener: EventListener) => {
      const current = listeners.get(type) ?? new Set<EventListener>();
      current.add(listener);
      listeners.set(type, current);
    });
    const removeEventListener = vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    });

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      getHostToolbarState: vi.fn(() => ({ toolbarMode: 'host', visible: true })),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      parent: parentWindow,
      addEventListener,
      removeEventListener,
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });

    const editorOptions = mocked.createCommentary.mock.calls[0]?.[0];
    const actionPromise = editorOptions.ui.onHostToolbarAction({ type: 'wake-agent' });
    const request = parentWindow.postMessage.mock.calls[0]?.[0] as {
      requestId: string;
      type: string;
      action: unknown;
    };

    expect(request).toEqual(expect.objectContaining({
      type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST',
      action: { type: 'wake-agent' },
    }));

    const [messageListener] = Array.from(listeners.get('message') ?? []);
    messageListener?.({
      data: {
        type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT',
        requestId: request.requestId,
        handled: true,
      },
      source: parentWindow,
    } as MessageEvent);

    await expect(actionPromise).resolves.toBe(true);

    expect(editorOptions.ui.onRequestFullExit).toEqual(expect.any(Function));
    const fullExitPromise = editorOptions.ui.onRequestFullExit();
    const fullExitRequest = parentWindow.postMessage.mock.calls[1]?.[0] as {
      requestId: string;
      type: string;
      action: unknown;
    };

    expect(fullExitRequest).toEqual(expect.objectContaining({
      type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST',
      action: { type: 'full-exit' },
    }));

    const [fullExitMessageListener] = Array.from(listeners.get('message') ?? []);
    fullExitMessageListener?.({
      data: {
        type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT',
        requestId: fullExitRequest.requestId,
        handled: true,
      },
      source: parentWindow,
    } as MessageEvent);

    await expect(fullExitPromise).resolves.toBeUndefined();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('forwards host dark mode from direct dev-template enable options', async () => {
    const start = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: false, version: 2 })),
      getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
      getHostToolbarState: vi.fn(() => ({ toolbarMode: 'host', visible: true, darkMode: true })),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ health: { status: 'ready' } }),
    })) as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host', initialDarkMode: true });

    expect(mocked.createCommentary).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: expect.objectContaining({
          toolbarMode: 'host',
          initialDarkMode: true,
        }),
      }),
    );
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('updates assistant panel visibility for an existing editor and refreshes runtime UI', async () => {
    const start = vi.fn();
    const refresh = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      refresh,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getHostToolbarState: vi.fn(() => ({ toolbarMode: 'host', visible: true })),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
        protocol: 'http:',
        hostname: 'localhost',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({ toolbarMode: 'host' });
    const ui = mocked.createCommentary.mock.calls[0]?.[0]?.ui;

    expect(ui?.getAssistantPanelOpen?.()).toBe(false);

    await controller.enable({ assistantPanelOpen: true });

    expect(mocked.createCommentary).toHaveBeenCalledTimes(1);
    expect(ui?.getAssistantPanelOpen?.()).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('uses enable-time internal comment page scope for resource context and refreshes route state when it changes', async () => {
    const start = vi.fn();
    const refresh = vi.fn();
    const dispatchEvent = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      refresh,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getHostToolbarState: vi.fn(() => ({ toolbarMode: 'host', visible: true })),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?agentToolbar=host#page=voice-annotation',
        pathname: '/prototypes/touch-and-talk-annotation-demo',
        href: 'http://localhost:51720/prototypes/touch-and-talk-annotation-demo?agentToolbar=host#page=voice-annotation',
        protocol: 'http:',
        hostname: 'localhost',
      },
      dispatchEvent,
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });

    const controller = createWebEditorV2Controller();
    await controller.enable({
      toolbarMode: 'host',
      commentPageScope: 'prototypes/touch-and-talk-annotation-demo::page::common-tips',
    });

    const host = mocked.createCommentary.mock.calls[0]?.[0]?.host;
    expect(host?.getResourceContext?.()?.meta?.commentPageScope)
      .toBe('prototypes/touch-and-talk-annotation-demo::page::common-tips');

    await controller.enable({
      toolbarMode: 'host',
      commentPageScope: 'prototypes/touch-and-talk-annotation-demo::page::voice-annotation',
    });

    expect(host?.getResourceContext?.()?.meta?.commentPageScope)
      .toBe('prototypes/touch-and-talk-annotation-demo::page::voice-annotation');
    expect(refresh).toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'axhub-web-editor-route-change',
    }));
  });

  it('refreshes scoped comments when an active editor is enabled again for the same page scope', async () => {
    const start = vi.fn();
    const refresh = vi.fn();
    const dispatchEvent = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start,
      stop: vi.fn(),
      refresh,
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getHostToolbarState: vi.fn(() => ({ toolbarMode: 'host', visible: true })),
      subscribeHostToolbarState: vi.fn(() => () => undefined),
      runHostToolbarAction: vi.fn(async () => true),
      acknowledgeSavedTextChanges: vi.fn(),
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    vi.stubGlobal('window', {
      location: {
        search: '?agentToolbar=host#page=common-tips',
        pathname: '/prototypes/touch-and-talk-annotation-demo',
        href: 'http://localhost:51720/prototypes/touch-and-talk-annotation-demo?agentToolbar=host#page=common-tips',
        protocol: 'http:',
        hostname: 'localhost',
      },
      dispatchEvent,
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });

    const controller = createWebEditorV2Controller();
    const enableOptions = {
      toolbarMode: 'host' as const,
      commentPageScope: 'prototypes/touch-and-talk-annotation-demo::page::common-tips',
    };

    await controller.enable(enableOptions);
    dispatchEvent.mockClear();
    refresh.mockClear();

    await controller.enable(enableOptions);

    expect(refresh).toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'axhub-web-editor-route-change',
    }));
  });

  it('reports page tweak entries as decision data for parent preview auto-open checks', () => {
    const listEntries = vi.fn(() => [
      { element: {}, schema: { fields: [] }, values: null },
      { element: {}, schema: { fields: [] }, values: null },
    ]);
    mocked.getGlobalCommentaryTweakProtocol.mockReturnValue({ listEntries });
    vi.stubGlobal('document', { body: {} });

    const controller = createWebEditorV2Controller();

    expect(controller.getDecisionDataCount()).toBe(2);
    expect(listEntries).toHaveBeenCalledWith(document);
  });

  it('uses explicit save and clear methods instead of action strings', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const acknowledgeSavedTextChanges = vi.fn();
    const acknowledgeSavedStyleChanges = vi.fn();
    const subscribeStatus = vi.fn((listener: (status: unknown) => void) => {
      listener({ active: true, undoCount: 2, redoCount: 1 });
      return () => undefined;
    });
    const getState = vi.fn(() => ({ active: true, version: 2 }));
    const getStatus = vi.fn(() => ({ active: true, undoCount: 2, redoCount: 1 }));
    const getEditedSnapshot = vi.fn(() => ({
      resource: { kind: 'prototype-entry', path: 'prototypes/home' },
      selectedElement: null,
      modifiedElements: [],
      textChanges: [{ before: '旧标题', after: '新标题' }],
      styleChanges: { cssText: '.card { color: red; }' },
    }));
    const getTextChanges = vi.fn(() => [{ before: '旧标题', after: '新标题' }]);
    const getStyleChanges = vi.fn(() => ({ cssText: '.card { color: red; }' }));

    mocked.createCommentary.mockReturnValue({
      start,
      stop,
      subscribeStatus,
      getState,
      getStatus,
      getEditedSnapshot,
      getTextChanges,
      getStyleChanges,
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges,
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/assistant/runtime?autoStart=false') {
        return {
          ok: true,
          json: async () => ({ health: { status: 'ready' } }),
        };
      }
      if (input === '/api/text-replace/count') {
        return {
          ok: true,
          json: async () => ({ count: 1 }),
        };
      }
      if (input === '/api/text-replace/replace') {
        return {
          ok: true,
          json: async () => ({ success: true, changedFiles: 1 }),
        };
      }
      if (input === '/api/hack-css/save') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      if (input === '/api/hack-css/clear') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();

    await controller.enable();
    await controller.saveTextChanges();
    await controller.saveStyleChanges();
    await controller.clearForcedStyles();
    controller.disable();

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(getEditedSnapshot).toHaveBeenCalledTimes(3);
    expect(getTextChanges).toHaveBeenCalledTimes(1);
    expect(getStyleChanges).toHaveBeenCalledTimes(1);
    expect(acknowledgeSavedTextChanges).toHaveBeenCalledTimes(1);
    expect(acknowledgeSavedStyleChanges).toHaveBeenCalledTimes(2);
    const hackSaveCall = fetchMock.mock.calls.find(([input]) => input === '/api/hack-css/save');
    const hackSaveBody = JSON.parse(String(hackSaveCall?.[1]?.body ?? '{}'));
    expect(hackSaveBody.content).toContain('AXHUB TEMPORARY STYLE HACK');
    expect(hackSaveBody.content).toContain('临时覆盖样式，不是最终实现');
    expect(hackSaveBody.content.match(/\.card \{ color: red; \}/gu)).toHaveLength(1);
    expect(controller.getStatus()).toEqual({
      active: true,
      undoCount: 2,
      redoCount: 1,
    });
  });

  it('does not acknowledge local text changes when save is cancelled', async () => {
    const acknowledgeSavedTextChanges = vi.fn();
    const acknowledgeSavedStyleChanges = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getEditedSnapshot: vi.fn(() => ({
        resource: { kind: 'prototype-entry', path: 'prototypes/home' },
        selectedElement: null,
        modifiedElements: [],
        textChanges: [{ before: '旧标题', after: '新标题' }],
        styleChanges: { cssText: '' },
      })),
      getTextChanges: vi.fn(() => [{ before: '旧标题', after: '新标题' }]),
      getStyleChanges: vi.fn(() => ({ cssText: '' })),
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges,
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
      },
      confirm: vi.fn(() => false),
      alert: vi.fn(),
    });
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/assistant/runtime?autoStart=false') {
        return {
          ok: true,
          json: async () => ({ health: { status: 'ready' } }),
        };
      }
      if (input === '/api/text-replace/count') {
        return {
          ok: true,
          json: async () => ({ count: 1 }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.saveTextChanges();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(acknowledgeSavedTextChanges).not.toHaveBeenCalled();
  });

  it('does not fall back to a second native confirm when the parent dialog times out', async () => {
    const acknowledgeSavedTextChanges = vi.fn();
    mocked.createCommentary.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getEditedSnapshot: vi.fn(() => ({
        resource: { kind: 'prototype-entry', path: 'prototypes/home' },
        selectedElement: null,
        modifiedElements: [],
        textChanges: [{ before: '旧标题', after: '新标题' }],
        styleChanges: { cssText: '' },
      })),
      getTextChanges: vi.fn(() => [{ before: '旧标题', after: '新标题' }]),
      getStyleChanges: vi.fn(() => ({ cssText: '' })),
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    let timeoutCallback: (() => void) | null = null;
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
      },
      parent: { postMessage: vi.fn() },
      confirm: nativeConfirm,
      alert: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: vi.fn((callback: () => void) => {
        timeoutCallback = callback;
        return 1;
      }),
      clearTimeout: vi.fn(),
    });
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/text-replace/count') {
        return { ok: true, json: async () => ({ totalCount: 1 }) };
      }
      if (input === '/api/text-replace/replace') {
        return { ok: true, json: async () => ({ success: true, changedFiles: 1 }) };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    const savePromise = controller.saveTextChanges();
    await vi.waitFor(() => expect(timeoutCallback).not.toBeNull());
    timeoutCallback?.();
    await savePromise;

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(acknowledgeSavedTextChanges).not.toHaveBeenCalled();
  });

  it('keeps waiting for the parent result after the host acknowledges dialog ownership', async () => {
    const acknowledgeSavedTextChanges = vi.fn();
    mocked.createCommentary.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getEditedSnapshot: vi.fn(() => ({
        resource: { kind: 'prototype-entry', path: 'prototypes/home' },
        selectedElement: null,
        modifiedElements: [],
        textChanges: [{ before: '旧标题', after: '新标题' }],
        styleChanges: { cssText: '' },
      })),
      getTextChanges: vi.fn(() => [{ before: '旧标题', after: '新标题' }]),
      getStyleChanges: vi.fn(() => ({ cssText: '' })),
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    let messageHandler: ((event: MessageEvent) => void) | null = null;
    let timeoutCallback: (() => void) | null = null;
    let confirmRequestId = '';
    const parentWindow = {
      postMessage: vi.fn((payload: { type?: string; requestId?: string }) => {
        if (payload.type !== 'WEB_EDITOR_DIALOG_REQUEST') return;
        confirmRequestId = payload.requestId ?? '';
        messageHandler?.({
          data: { type: 'WEB_EDITOR_DIALOG_ACK', requestId: confirmRequestId },
        } as MessageEvent);
      }),
    };
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
      },
      parent: parentWindow,
      confirm: nativeConfirm,
      alert: vi.fn(),
      addEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
        messageHandler = handler;
      }),
      removeEventListener: vi.fn(),
      setTimeout: vi.fn((callback: () => void) => {
        timeoutCallback = callback;
        return 1;
      }),
      clearTimeout: vi.fn(),
    });
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/text-replace/count') {
        return { ok: true, json: async () => ({ totalCount: 1 }) };
      }
      if (input === '/api/text-replace/replace') {
        return { ok: true, json: async () => ({ success: true, changedFiles: 1 }) };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    const savePromise = controller.saveTextChanges();
    await vi.waitFor(() => expect(timeoutCallback).not.toBeNull());
    timeoutCallback?.();
    messageHandler?.({
      data: {
        type: 'WEB_EDITOR_DIALOG_RESPONSE',
        requestId: confirmRequestId,
        confirmed: true,
      },
      source: parentWindow,
    } as MessageEvent);
    await savePromise;

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(acknowledgeSavedTextChanges).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge local text changes when replace fails', async () => {
    const acknowledgeSavedTextChanges = vi.fn();
    const acknowledgeSavedStyleChanges = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getEditedSnapshot: vi.fn(() => ({
        resource: { kind: 'prototype-entry', path: 'prototypes/home' },
        selectedElement: null,
        modifiedElements: [],
        textChanges: [{ before: '旧标题', after: '新标题' }],
        styleChanges: { cssText: '' },
      })),
      getTextChanges: vi.fn(() => [{ before: '旧标题', after: '新标题' }]),
      getStyleChanges: vi.fn(() => ({ cssText: '' })),
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges,
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
      },
      confirm: vi.fn(() => true),
      alert: vi.fn(),
    });
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/assistant/runtime?autoStart=false') {
        return {
          ok: true,
          json: async () => ({ health: { status: 'ready' } }),
        };
      }
      if (input === '/api/text-replace/count') {
        return {
          ok: true,
          json: async () => ({ count: 1 }),
        };
      }
      if (input === '/api/text-replace/replace') {
        return {
          ok: true,
          json: async () => ({ success: false, changedFiles: 0 }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await expect(controller.saveTextChanges()).rejects.toThrow('保存文本失败');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(acknowledgeSavedTextChanges).not.toHaveBeenCalled();
  });

  it('blocks saving when the same source text maps to multiple target texts', async () => {
    const acknowledgeSavedTextChanges = vi.fn();

    mocked.createCommentary.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(() => ({ active: true, version: 2 })),
      getStatus: vi.fn(() => ({ active: true, undoCount: 0, redoCount: 0 })),
      getEditedSnapshot: vi.fn(() => ({
        resource: { kind: 'prototype-entry', path: 'prototypes/home' },
        selectedElement: null,
        modifiedElements: [],
        textChanges: [
          { before: '旧标题', after: '新标题A' },
          { before: '旧标题', after: '新标题B' },
        ],
        styleChanges: { cssText: '' },
      })),
      getTextChanges: vi.fn(() => [
        { before: '旧标题', after: '新标题A' },
        { before: '旧标题', after: '新标题B' },
      ]),
      getStyleChanges: vi.fn(() => ({ cssText: '' })),
      acknowledgeSavedTextChanges,
      acknowledgeSavedStyleChanges: vi.fn(),
    });

    const alertMock = vi.fn();
    const postMessageMock = vi.fn();
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/assistant/runtime?autoStart=false') {
        return {
          ok: true,
          json: async () => ({ health: { status: 'ready' } }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });

    vi.stubGlobal('window', {
      location: {
        search: '',
        pathname: '/prototypes/home',
        href: 'http://localhost:51720/prototypes/home',
      },
      parent: {
        postMessage: postMessageMock,
      },
      confirm: vi.fn(() => true),
      alert: alertMock,
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const controller = createWebEditorV2Controller();
    await controller.saveTextChanges();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    expect(postMessageMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'WEB_EDITOR_NOTICE',
    }), '*');
    expect(acknowledgeSavedTextChanges).not.toHaveBeenCalled();
  });
});
