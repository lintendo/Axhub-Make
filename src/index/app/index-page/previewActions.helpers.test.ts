import { afterEach, describe, expect, it, vi } from 'vitest';

import * as helpers from './previewActions.helpers';
import { createDefaultPreviewConfig } from '../../domains/device/preview-layout';
import {
  buildCombinedPrototypePrompt,
  buildMainPreviewIframeUrl,
  buildProjectPrototypeIframeUrl,
  buildProjectPrototypeScreenshotIframeUrl,
  createDefaultHostToolbarState,
  getClientUrlOrigin,
  isQuickEditRuntimeReadyForIframe,
  resolveActiveAnnotationDirectRunToolbarState,
  resolvePrototypeAnnotationTargetPath,
  resolveCurrentPublishResourcePath,
  resolveCurrentPreviewScreenshotSize,
  resolveExportScreenshotViewportSize,
  resolveHostToolbarStateForDisplay,
  resolveAnnotationActionEditingTargets,
  waitForHostToolbarActionState,
} from './previewActions.helpers';

describe('previewActions.helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('binds quick-edit runtime readiness to the current iframe identity', () => {
    const readyIframe = {} as HTMLIFrameElement;
    const replacementIframe = {} as HTMLIFrameElement;

    expect(isQuickEditRuntimeReadyForIframe('ready', readyIframe, readyIframe)).toBe(true);
    expect(isQuickEditRuntimeReadyForIframe('ready', readyIframe, replacementIframe)).toBe(false);
    expect(isQuickEditRuntimeReadyForIframe('pending', readyIframe, readyIframe)).toBe(false);
    expect(isQuickEditRuntimeReadyForIframe('ready', readyIframe, null)).toBe(false);
  });

  it('uses mobile annotation interaction only for phone-sized prototype previews', () => {
    const resolveMobileMode = (helpers as Record<string, unknown>)
      .resolvePrototypeEditorMobileMode as undefined | ((
        resourceType: 'prototype' | 'theme',
        pane: 'primary' | 'secondary',
        previewConfig: ReturnType<typeof createDefaultPreviewConfig>,
      ) => boolean);
    const defaultConfig = createDefaultPreviewConfig();

    expect(typeof resolveMobileMode).toBe('function');
    expect(resolveMobileMode?.('prototype', 'primary', {
      ...defaultConfig,
      singlePreset: 'mobile',
    })).toBe(true);
    expect(resolveMobileMode?.('prototype', 'primary', {
      ...defaultConfig,
      singlePreset: 'tablet',
    })).toBe(false);
    expect(resolveMobileMode?.('prototype', 'primary', {
      ...defaultConfig,
      singlePreset: 'custom',
      customWidth: 640,
    })).toBe(true);
    expect(resolveMobileMode?.('prototype', 'primary', {
      ...defaultConfig,
      singlePreset: 'custom',
      customWidth: 1024,
    })).toBe(false);
    expect(resolveMobileMode?.('prototype', 'secondary', defaultConfig)).toBe(true);
    expect(resolveMobileMode?.('theme', 'secondary', defaultConfig)).toBe(false);
  });

  it('maps cross-origin modified elements to top-level AI execution targets', () => {
    const locatorA = { selectors: ['[data-card="a"]'], fingerprint: 'card-a', path: [0] };
    const locatorB = { selectors: ['[data-card="b"]'], fingerprint: 'card-b', path: [1] };

    expect(resolveAnnotationActionEditingTargets(
      { type: 'send-to-agent' },
      [
        { elementKey: 'card-a', locator: locatorA, label: 'Card A', note: 'A', imageCount: 0, changeKinds: [] },
        { elementKey: 'card-b', locator: locatorB, label: 'Card B', note: 'B', imageCount: 0, changeKinds: [] },
      ],
    )).toEqual([
      { elementKey: 'card-a', targetRef: { locator: locatorA, label: 'Card A' } },
      { elementKey: 'card-b', targetRef: { locator: locatorB, label: 'Card B' } },
    ]);
  });

  it('keeps an explicit element action scoped to that element', () => {
    const locatorA = { selectors: ['[data-card="a"]'], fingerprint: 'card-a', path: [0] };
    const locatorB = { selectors: ['[data-card="b"]'], fingerprint: 'card-b', path: [1] };

    expect(resolveAnnotationActionEditingTargets({
      type: 'send-to-agent',
      elementKey: 'card-a',
      locator: locatorA,
      label: 'Card A',
    }, [{ elementKey: 'card-b', locator: locatorB, label: 'Card B', note: 'B', imageCount: 0, changeKinds: [] }]))
      .toEqual([{ elementKey: 'card-a', targetRef: { locator: locatorA, label: 'Card A' } }]);
  });

  it('ignores blank modified element keys and keeps the first duplicate target', () => {
    const firstLocator = { selectors: ['[data-card="first"]'], fingerprint: 'first', path: [0] };
    const duplicateLocator = { selectors: ['[data-card="duplicate"]'], fingerprint: 'duplicate', path: [1] };

    expect(resolveAnnotationActionEditingTargets(null, [
      { elementKey: ' ', locator: null, label: '', note: '', imageCount: 0, changeKinds: [] },
      { elementKey: 'card-a', locator: firstLocator, label: 'First', note: '', imageCount: 0, changeKinds: [] },
      { elementKey: 'card-a', locator: duplicateLocator, label: 'Duplicate', note: '', imageCount: 0, changeKinds: [] },
    ])).toEqual([{ elementKey: 'card-a', targetRef: { locator: firstLocator, label: 'First' } }]);
  });

  it('resolves relative client URLs against the runtime origin instead of the admin origin', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723',
    });

    expect(getClientUrlOrigin('/prototypes/%E6%A0%87%E6%B3%A8%E6%BC%94%E7%A4%BA')).toBe('http://localhost:51723');
  });

  it('builds relative prototype iframe URLs from the runtime origin instead of the admin origin', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723',
    });

    expect(buildProjectPrototypeIframeUrl({
      name: 'beginner-guide',
      displayName: '新手指导',
      clientUrl: '/prototypes/beginner-guide',
      previewUrl: '/prototypes/beginner-guide',
    })).toBe('http://localhost:51723/prototypes/beginner-guide');
  });

  it('builds relative theme iframe URLs from the runtime origin instead of the admin origin', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723',
    });

    expect(buildMainPreviewIframeUrl({
      name: 'brand',
      clientUrl: '/themes/brand',
      previewUrl: '/themes/brand',
    })).toBe('http://localhost:51723/themes/brand');
  });

  it('adds the host toolbar marker to embedded theme preview URLs', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51720',
    });

    const url = new URL(buildMainPreviewIframeUrl({
      name: 'brand',
      clientUrl: 'http://localhost:51720/themes/brand?variant=dark#tokens',
    }, { hostToolbar: true }));

    expect(url.pathname).toBe('/themes/brand');
    expect(url.searchParams.get('variant')).toBe('dark');
    expect(url.searchParams.get('agentToolbar')).toBe('host');
    expect(url.hash).toBe('#tokens');
  });

  it('keeps relative prototype iframe URLs usable from the current origin when runtime origin is unavailable', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: '',
    });

    expect(buildProjectPrototypeIframeUrl({
      name: 'annotation-demo',
      displayName: '标注演示',
      clientUrl: '/prototypes/annotation-demo',
      previewUrl: '/prototypes/annotation-demo',
    })).toBe('http://localhost:53817/prototypes/annotation-demo');
  });

  it('keeps runtime-origin prototype iframe URLs on the runtime origin', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723',
    });

    expect(buildProjectPrototypeIframeUrl({
      name: 'annotation-demo',
      displayName: '标注演示',
      clientUrl: 'http://localhost:51723/prototypes/annotation-demo?variant=dark',
      previewUrl: 'http://localhost:51723/prototypes/annotation-demo',
    })).toBe('http://localhost:51723/prototypes/annotation-demo?variant=dark');

    expect(getClientUrlOrigin('http://localhost:51723/prototypes/annotation-demo')).toBe('http://localhost:51723');
  });

  it('keeps runtime-origin prototype iframe URLs direct while preserving query and hash params', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51720',
    });

    const url = new URL(buildProjectPrototypeIframeUrl({
      name: 'touch-and-talk-annotation-demo',
      displayName: '批注演示',
      projectId: 'make-project',
      clientUrl: 'http://localhost:51720/prototypes/touch-and-talk-annotation-demo?variant=dark',
      previewUrl: 'http://localhost:51720/prototypes/touch-and-talk-annotation-demo',
      pages: [
        { id: 'more-scenarios', title: '更多场景' },
      ],
    }, { hostToolbar: true }, 'more-scenarios'));

    expect(url.origin).toBe('http://localhost:51720');
    expect(url.pathname).toBe('/prototypes/touch-and-talk-annotation-demo');
    expect(url.searchParams.get('variant')).toBe('dark');
    expect(url.searchParams.get('agentToolbar')).toBe('host');
    expect(url.hash).toBe('#page=more-scenarios');
  });

  it('adds annotation session mode to prototype editor urls', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51720',
    });

    const url = new URL(buildProjectPrototypeIframeUrl({
      name: 'annotation-demo',
      clientUrl: 'http://localhost:51720/prototypes/annotation-demo',
      previewUrl: 'http://localhost:51720/prototypes/annotation-demo',
    }, { hostToolbar: true, annotationSession: true }));

    expect(url.searchParams.get('agentToolbar')).toBe('host');
    expect(url.searchParams.get('annotationSession')).toBe('1');
  });

  it('builds same-origin prototype screenshot iframe URLs from runtime-origin previews', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723',
    });

    const url = new URL(buildProjectPrototypeScreenshotIframeUrl({
      name: 'touch-and-talk-annotation-demo',
      displayName: '批注演示',
      clientUrl: 'http://localhost:51723/prototypes/touch-and-talk-annotation-demo?agentToolbar=host',
      previewUrl: 'http://localhost:51723/prototypes/touch-and-talk-annotation-demo',
    }, 'cover'));

    expect(url.origin).toBe('http://localhost:53817');
    expect(url.pathname).toBe('/prototypes/touch-and-talk-annotation-demo');
    expect(url.searchParams.get('agentToolbar')).toBeNull();
    expect(url.hash).toBe('#page=cover');
  });

  it('keeps unrelated absolute prototype origins unchanged even when the injected runtime origin is different', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51722',
    });

    expect(buildProjectPrototypeIframeUrl({
      name: 'beginner-guide',
      displayName: '新手指导',
      clientUrl: 'http://localhost:51721/prototypes/beginner-guide',
      previewUrl: 'http://localhost:51721/prototypes/beginner-guide',
    })).toBe('http://localhost:51721/prototypes/beginner-guide');

    expect(getClientUrlOrigin('http://localhost:51721/prototypes/beginner-guide')).toBe('http://localhost:51721');
  });

  it('keeps explicit client URL origins unchanged', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723',
    });

    expect(getClientUrlOrigin('http://client.local:4173/prototypes/home')).toBe('http://client.local:4173');
  });

  it('includes the make admin origin in quick-edit export messages', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723/',
    });

    expect(helpers.createRuntimeExportMessage({
      type: 'axhub.quickEdit.export.captureScreenshot',
      selectedItem: {
        projectId: 'project-1',
        resourceId: 'home',
        clientUrl: 'http://localhost:51721/prototypes/home',
      },
      requestId: 'copy-screenshot-1',
    })).toMatchObject({
      type: 'axhub.quickEdit.export.captureScreenshot',
      requestId: 'copy-screenshot-1',
      runtimeOrigin: 'http://localhost:53817',
    });
  });

  it('sends the standalone admin module URL only with Axure export requests', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51720',
    });
    const selectedItem = {
      projectId: 'project-1',
      resourceId: 'home',
      name: 'home',
      clientUrl: 'http://localhost:51720/prototypes/home',
    };

    expect(helpers.createRuntimeExportMessage({
      type: 'axhub.quickEdit.export.axureJson',
      selectedItem,
      requestId: 'axure-1',
    })).toMatchObject({
      runtimeOrigin: 'http://localhost:53817',
      axureExportModuleUrl: 'http://localhost:53817/assets/axure-export-runtime.js',
    });
    expect(helpers.createRuntimeExportMessage({
      type: 'axhub.quickEdit.export.copyToFigma',
      selectedItem,
      requestId: 'figma-1',
    })).not.toHaveProperty('axureExportModuleUrl');
  });

  it('identifies theme runtime export requests and communication records as theme resources', async () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51720',
    });
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const selectedTheme = {
      projectId: 'project-1',
      name: 'brand',
      clientUrl: 'http://localhost:51720/themes/brand',
    };

    expect(helpers.createRuntimeExportMessage({
      type: 'axhub.quickEdit.export.axureJson',
      selectedItem: selectedTheme,
      resourceType: 'theme',
      requestId: 'theme-axure-1',
    })).toMatchObject({
      projectId: 'project-1',
      resourceId: 'brand',
      resourceType: 'themes',
      clientUrl: 'http://localhost:51720/themes/brand',
    });

    await helpers.postProjectCommunicationRecord(selectedTheme, 'exports', {
      operationType: 'axure.copy',
      status: 'success',
    }, 'theme');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/communication/exports',
      expect.objectContaining({
        body: JSON.stringify({
          projectId: 'project-1',
          resourceId: 'brand',
          resourceType: 'theme',
          operationType: 'axure.copy',
          status: 'success',
        }),
      }),
    );
  });

  it('keeps unrelated relative preview URLs on the current origin', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51723',
    });

    expect(getClientUrlOrigin('/api/markdown-file?path=README.md')).toBe('http://localhost:53817');
    expect(buildProjectPrototypeIframeUrl({
      name: 'markdown-preview',
      clientUrl: '/api/markdown-file?path=README.md',
    })).toBe('http://localhost:53817/api/markdown-file?path=README.md');
  });

  it('opens the prototype default hash page when no explicit page is selected', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
      },
    });

    const url = new URL(buildProjectPrototypeIframeUrl({
      name: 'beginner-guide',
      clientUrl: 'http://client.local:4173/prototypes/beginner-guide',
      pages: [
        { id: 'install-agent', title: '安装 Agent' },
        { id: 'choose-model', title: '选对模型' },
      ],
      defaultPageId: 'install-agent',
    }, undefined, null));

    expect(url.hash).toBe('#page=install-agent');
  });

  it('resolves the current publish path from the active prototype or theme resource', () => {
    expect(resolveCurrentPublishResourcePath({
      contentMode: 'preview',
      selectedItem: {
        name: 'home',
        displayName: 'Home',
        jsUrl: '',
        specUrl: '',
        filePath: 'src/prototypes/home/index.tsx',
      },
      selectedTheme: null,
    })).toBe('src/prototypes/home');

    expect(resolveCurrentPublishResourcePath({
      contentMode: 'theme',
      selectedItem: null,
      selectedTheme: {
        name: 'brand',
        displayName: 'Brand',
        absoluteFilePath: '/workspace/src/themes/brand/index.tsx',
      },
    })).toBe('src/themes/brand');

    expect(resolveCurrentPublishResourcePath({
      contentMode: 'theme',
      selectedItem: null,
      selectedTheme: {
        name: 'brand',
        displayName: 'Brand',
        path: 'themes/brand',
        absoluteFilePath: '/workspace/src/themes/other/index.tsx',
      },
    })).toBe('src/themes/brand');
  });

  it('resolves prototype annotation target paths for the Make server API', () => {
    expect(resolvePrototypeAnnotationTargetPath({
      resourceId: 'home',
      filePath: 'src/prototypes/home/index.tsx',
    })).toBe('prototypes/home');

    expect(resolvePrototypeAnnotationTargetPath({
      filePath: 'src/prototypes/checkout/index.tsx',
    })).toBe('prototypes/checkout');

    expect(resolvePrototypeAnnotationTargetPath({
      clientUrl: 'http://localhost:51721/prototypes/untitled-79?mode=demo#page=summary',
    })).toBe('prototypes/untitled-79');
  });

  it('resolves screenshot copy dimensions from the current preview mode and primary split pane', () => {
    expect(resolveCurrentPreviewScreenshotSize({
      previewMode: 'single',
      singlePreset: 'custom',
      customWidth: 1024,
      customHeight: 1365,
      multiPageColumns: 3,
      splitWidths: { primary: 1440, secondary: 393 },
      splitHeights: { primary: 900, secondary: 852 },
      scaleMode: 'fit-screen',
    }, { width: 1920, height: 1080 })).toEqual({ width: 1024, height: 1365 });

    expect(resolveCurrentPreviewScreenshotSize({
      previewMode: 'split',
      singlePreset: 'desktop',
      customWidth: null,
      customHeight: null,
      multiPageColumns: 3,
      splitWidths: { primary: 1280, secondary: 390 },
      splitHeights: { primary: 720, secondary: 846 },
      scaleMode: 'fit-screen',
    }, { width: 1920, height: 1080 })).toEqual({ width: 1280, height: 720 });
  });

  it('resolves automatic Axure screenshot viewports from the current preview size', () => {
    expect(resolveExportScreenshotViewportSize({
      currentPreviewSize: { width: 1366, height: 820 },
      configuredSize: { width: 500, height: 300 },
      userSetDimensions: false,
    })).toEqual({ width: 1366, height: 820, shouldSyncConfig: true });
  });

  it('preserves manually configured Axure screenshot viewport dimensions', () => {
    expect(resolveExportScreenshotViewportSize({
      currentPreviewSize: { width: 1366, height: 820 },
      configuredSize: { width: 1024, height: 768 },
      userSetDimensions: true,
    })).toEqual({ width: 1024, height: 768, shouldSyncConfig: false });
  });

  it('keeps a settled local AI connection visible after a wake action succeeds', () => {
    const sleepingState = createDefaultHostToolbarState();
    const awakeState = {
      ...sleepingState,
      robotState: 'awake' as const,
      robotLoading: false,
      sendDisabled: false,
    };

    const resolvedState = resolveHostToolbarStateForDisplay(sleepingState, awakeState, false);

    expect(resolvedState?.robotState).toBe('awake');
    expect(resolvedState?.robotLoading).toBe(false);
    expect(resolvedState?.sendDisabled).toBe(false);
  });

  it('keeps direct annotation runs interruptible and sendable until concurrency is full', () => {
    const syncedIdleState = {
      ...createDefaultHostToolbarState(),
      robotState: 'awake' as const,
      sendDisabled: false,
      sendLoading: false,
      interruptDisabled: true,
      interruptLoading: false,
      propertyPanelOpen: true,
    };

    const activeRunState = resolveActiveAnnotationDirectRunToolbarState(syncedIdleState, {
      activeRunCount: 1,
      maxRunCount: 3,
    });

    expect(activeRunState).toMatchObject({
      robotState: 'working',
      robotLoading: false,
      sendDisabled: false,
      sendLoading: false,
      interruptVisible: true,
      interruptDisabled: false,
      interruptLoading: false,
      propertyPanelOpen: true,
    });
    expect(resolveActiveAnnotationDirectRunToolbarState(syncedIdleState, {
      activeRunCount: 3,
      maxRunCount: 3,
    })).toMatchObject({
      sendDisabled: true,
      sendLoading: true,
      interruptDisabled: false,
    });
    expect(resolveActiveAnnotationDirectRunToolbarState(syncedIdleState, {
      activeRunCount: 0,
      maxRunCount: 3,
    })).toBe(syncedIdleState);
    expect(resolveActiveAnnotationDirectRunToolbarState(null, {
      activeRunCount: 1,
      maxRunCount: 3,
    })).toBeNull();
  });

  it('preserves the selection mode flag when showing a hidden host toolbar state', () => {
    const hiddenHostState = {
      ...createDefaultHostToolbarState(),
      visible: false,
      selectionModeActive: false,
    };

    const resolvedState = resolveHostToolbarStateForDisplay(null, hiddenHostState, false);

    expect(resolvedState?.visible).toBe(true);
    expect(resolvedState?.selectionModeActive).toBe(false);
  });

  it('keeps copy prompt disabled in the fallback toolbar state until an editor reports promptable edits', () => {
    const fallbackState = createDefaultHostToolbarState();

    expect(fallbackState.copyPromptVisible).toBe(true);
    expect(fallbackState.copyPromptDisabled).toBe(true);
    expect(fallbackState.clearEditsDisabled).toBe(true);
    expect(fallbackState.modifiedCount).toBe(0);
  });

  it('waits for the next host toolbar state when wake starts from a stale sleeping snapshot', async () => {
    vi.useFakeTimers();
    const sleepingState = createDefaultHostToolbarState();
    const awakeState = {
      ...sleepingState,
      robotState: 'awake' as const,
      robotLoading: false,
      sendDisabled: false,
    };
    let listener: ((state: typeof sleepingState) => void) | null = null;
    const waitPromise = waitForHostToolbarActionState({
      getHostToolbarState: () => sleepingState,
      subscribeHostToolbarState: (nextListener) => {
        listener = nextListener;
        return () => undefined;
      },
    }, { type: 'wake-agent' }, sleepingState);

    listener?.(awakeState);

    await expect(waitPromise).resolves.toEqual(awakeState);
    vi.useRealTimers();
  });

  it('waits for annotation enable state after the enable action starts from a stale snapshot', async () => {
    vi.useFakeTimers();
    const disabledState = {
      ...createDefaultHostToolbarState(),
      annotationEnableAvailable: true,
      annotationEnableDisabled: false,
    };
    const enabledState = {
      ...disabledState,
      annotationEnabled: true,
      annotationEnableDisabled: true,
      annotationEnableTitle: '需求标注已开启',
    };
    let listener: ((state: typeof disabledState) => void) | null = null;
    const waitPromise = waitForHostToolbarActionState({
      getHostToolbarState: () => disabledState,
      subscribeHostToolbarState: (nextListener) => {
        listener = nextListener;
        return () => undefined;
      },
    }, { type: 'enable-annotation' }, disabledState);

    listener?.(enabledState);

    await expect(waitPromise).resolves.toEqual(enabledState);
    vi.useRealTimers();
  });

  it('combines split prototype prompts with pane labels and skips empty panes', () => {
    expect(buildCombinedPrototypePrompt([
      { pane: 'primary', promptText: 'PC prompt' },
      { pane: 'secondary', promptText: '  手机 prompt  ' },
    ])).toBe([
      '请同时处理以下两个端的批注修改。',
      '',
      '## PC 端',
      'PC prompt',
      '',
      '## 手机端',
      '手机 prompt',
    ].join('\n'));

    expect(buildCombinedPrototypePrompt([
      { pane: 'primary', promptText: '' },
      { pane: 'secondary', promptText: '手机 only' },
    ])).toBe([
      '请处理以下手机端的批注修改。',
      '',
      '## 手机端',
      '手机 only',
    ].join('\n'));
  });

  it('closes prototype specs only after Markdown editing has fully exited', () => {
    const createGate = (helpers as Record<string, unknown>).createPrototypeSpecMarkdownStatusGate;

    expect(typeof createGate).toBe('function');
    const gate = (createGate as () => {
      handle: (params: {
        contentMode: string;
        enabled: boolean;
        saving: boolean;
      }) => 'enable' | 'close' | null;
      reset: (options?: { autoEnable?: boolean }) => void;
    })();
    const initialDisabledStatus = {
      contentMode: 'prototype-spec',
      enabled: false,
      saving: false,
    };

    gate.reset({ autoEnable: true });
    expect(gate.handle(initialDisabledStatus)).toBe('enable');
    expect(gate.handle(initialDisabledStatus)).toBeNull();
    expect(gate.handle({ ...initialDisabledStatus, enabled: true })).toBeNull();
    expect(gate.handle({ ...initialDisabledStatus, saving: true })).toBeNull();
    expect(gate.handle(initialDisabledStatus)).toBe('close');
    expect(gate.handle(initialDisabledStatus)).toBeNull();

    gate.reset({ autoEnable: true });
    expect(gate.handle({ ...initialDisabledStatus, enabled: true })).toBeNull();
    expect(gate.handle(initialDisabledStatus)).toBe('close');
    gate.reset();
    expect(gate.handle(initialDisabledStatus)).toBeNull();
    expect(gate.handle({
      contentMode: 'doc',
      enabled: false,
      saving: false,
    })).toBeNull();
  });

  it('captures only iframe-owned state needed after preview refresh', () => {
    const createSnapshot = (helpers as Record<string, unknown>).createPreviewRefreshRestoreSnapshot;

    expect(typeof createSnapshot).toBe('function');
    const capture = createSnapshot as (params: {
      prototypeEditorActive: boolean;
      documentEditorActive: boolean;
      prototypeEditorLaunchOptions: { hostToolbar: boolean };
      selectionModeActive: boolean;
      documentQuickEditMode: 'comment' | 'edit';
      standalonePanelOpen: boolean;
    }) => {
      prototypeEditor: { hostToolbar: boolean; selectionModeActive: boolean } | null;
      documentQuickEditMode: 'comment' | 'edit' | null;
      standalonePanelOpen: boolean;
    };

    expect(capture({
      prototypeEditorActive: true,
      documentEditorActive: false,
      prototypeEditorLaunchOptions: { hostToolbar: true },
      selectionModeActive: true,
      documentQuickEditMode: 'comment',
      standalonePanelOpen: false,
    })).toEqual({
      prototypeEditor: { hostToolbar: true, selectionModeActive: true },
      documentQuickEditMode: null,
      standalonePanelOpen: false,
    });

    expect(capture({
      prototypeEditorActive: false,
      documentEditorActive: true,
      prototypeEditorLaunchOptions: { hostToolbar: true },
      selectionModeActive: false,
      documentQuickEditMode: 'edit',
      standalonePanelOpen: false,
    })).toEqual({
      prototypeEditor: null,
      documentQuickEditMode: 'edit',
      standalonePanelOpen: false,
    });

    expect(capture({
      prototypeEditorActive: false,
      documentEditorActive: false,
      prototypeEditorLaunchOptions: { hostToolbar: true },
      selectionModeActive: false,
      documentQuickEditMode: 'comment',
      standalonePanelOpen: true,
    })).toEqual({
      prototypeEditor: null,
      documentQuickEditMode: null,
      standalonePanelOpen: true,
    });
  });

  it('restores the saved Markdown mode instead of accepting the transient disabled refresh status', () => {
    const resolveStatus = (helpers as Record<string, unknown>).resolveDocumentRefreshRestoreStatus;

    expect(typeof resolveStatus).toBe('function');
    const resolveRefreshStatus = resolveStatus as (
      pendingMode: 'comment' | 'edit' | null,
      status: { enabled: boolean },
    ) => { acceptStatus: boolean; restoreMode: 'comment' | 'edit' | null };

    expect(resolveRefreshStatus('edit', { enabled: false })).toEqual({
      acceptStatus: false,
      restoreMode: 'edit',
    });
    expect(resolveRefreshStatus('comment', { enabled: false })).toEqual({
      acceptStatus: false,
      restoreMode: 'comment',
    });
    expect(resolveRefreshStatus('edit', { enabled: true })).toEqual({
      acceptStatus: true,
      restoreMode: null,
    });
    expect(resolveRefreshStatus(null, { enabled: false })).toEqual({
      acceptStatus: true,
      restoreMode: null,
    });
  });

  it('does not expose host Space temporary interaction forwarding helpers', () => {
    expect('getQuickEditTemporaryInteractionTargets' in helpers).toBe(false);
    expect('shouldHandleQuickEditSpaceTemporaryInteractionEvent' in helpers).toBe(false);
    expect('QUICK_EDIT_TEMPORARY_INTERACTION_MESSAGE_TYPE' in helpers).toBe(false);
    expect('QUICK_EDIT_SPACE_PASS_THROUGH_MESSAGE_TYPE' in helpers).toBe(false);
  });

});
