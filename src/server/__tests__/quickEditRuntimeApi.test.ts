import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUICK_EDIT_RUNTIME_SCRIPT } from '../quickEditRuntimeApi.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('quick edit runtime script', () => {
  function createRuntimeHarness(
    extraWindow: Record<string, any> = {},
    importedModules: Record<string, Record<string, unknown>> = {},
  ) {
    const listeners = new Map<string, Array<(...args: any[]) => void>>();
    const messages: Array<{ message: any; targetOrigin: string }> = [];
    const appendedElements: any[] = [];
    const copiedPlainTexts: string[] = [];
    const sessionValues = new Map<string, string>();
    const localValues = new Map<string, string>();
    const addListener = (key: string, listener: (...args: any[]) => void) => {
      const nextListeners = listeners.get(key) || [];
      nextListeners.push(listener);
      listeners.set(key, nextListeners);
    };
    const createElementStub = (tagName: string) => {
      let ownTextContent = '';
      const elementListeners = new Map<string, Array<(...args: any[]) => void>>();
      const element: any = {
        tagName: tagName.toUpperCase(),
        innerHTML: '',
        style: {},
        children: [],
        listeners: elementListeners,
        dataset: {},
        attributes: new Map<string, string>(),
        setAttribute: vi.fn((name: string, value: string) => {
          element.attributes.set(name, String(value));
          if (name === 'data-axhub-quick-edit-ignore') {
            element.dataset.axhubQuickEditIgnore = String(value);
          }
        }),
        getAttribute: vi.fn((name: string) => element.attributes.get(name) || null),
        appendChild: vi.fn((child: any) => {
          element.children.push(child);
          return child;
        }),
        addEventListener: vi.fn((type: string, listener: (...args: any[]) => void) => {
          const nextElementListeners = elementListeners.get(type) || [];
          nextElementListeners.push(listener);
          elementListeners.set(type, nextElementListeners);
          addListener(`element:${tagName}:${type}:${element.children.length}`, listener);
        }),
        remove: vi.fn(() => {
          const index = appendedElements.indexOf(element);
          if (index >= 0) {
            appendedElements.splice(index, 1);
          }
        }),
        focus: vi.fn(),
        select: vi.fn(),
      };
      Object.defineProperty(element, 'textContent', {
        get() {
          return ownTextContent + element.children.map((child: any) => child.textContent || '').join('');
        },
        set(value) {
          ownTextContent = String(value ?? '');
        },
      });
      return element;
    };
    const windowStub: any = {
      axhub: undefined,
      location: {
        href: 'http://localhost:51720/prototypes/ref-app-home',
        pathname: '/prototypes/ref-app-home',
        origin: 'http://localhost:51720',
        reload: vi.fn(),
      },
      navigator: {
        userAgent: 'Vitest Browser',
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
      sessionStorage: {
        getItem: vi.fn((key: string) => sessionValues.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          sessionValues.set(key, String(value));
        }),
        removeItem: vi.fn((key: string) => {
          sessionValues.delete(key);
        }),
      },
      localStorage: {
        getItem: vi.fn((key: string) => localValues.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localValues.set(key, String(value));
        }),
        removeItem: vi.fn((key: string) => {
          localValues.delete(key);
        }),
      },
      fetch: vi.fn(),
      parent: {
        postMessage(message: any, targetOrigin: string) {
          messages.push({ message, targetOrigin });
        },
      },
      addEventListener: vi.fn((type: string, listener: (...args: any[]) => void) => {
        addListener(`window:${type}`, listener);
      }),
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
      focus: vi.fn(),
      ...extraWindow,
    };
    const importModule = vi.fn(async (moduleUrl: string) => importedModules[moduleUrl]);
    windowStub.__importModule = importModule;
    const emitCopyListeners = (event: any) => {
      for (const listener of listeners.get('document:copy') || []) {
        listener(event);
      }
    };
    const documentStub: any = {
      readyState: 'complete',
      documentElement: {
        dataset: {},
        appendChild: vi.fn((element: any) => {
          appendedElements.push(element);
          return element;
        }),
      },
      body: {
        appendChild: vi.fn((element: any) => element),
      },
      addEventListener: vi.fn((type: string, listener: (...args: any[]) => void) => {
        addListener(`document:${type}`, listener);
      }),
      removeEventListener: vi.fn(),
      createElement: vi.fn(createElementStub),
      execCommand: vi.fn((command: string) => {
        if (command !== 'copy') return false;
        const clipboardData = new Map<string, string>();
        emitCopyListeners({
          clipboardData: {
            setData(type: string, value: string) {
              clipboardData.set(type, value);
            },
          },
          preventDefault: vi.fn(),
        });
        const plainText = clipboardData.get('text/plain');
        if (typeof plainText === 'string') {
          copiedPlainTexts.push(plainText);
        }
        return clipboardData.size > 0;
      }),
      elementFromPoint: vi.fn(),
    };

    const runtimeScriptForTest = QUICK_EDIT_RUNTIME_SCRIPT.replace(
      'axureExportModulePromise = import(moduleUrl).then',
      'axureExportModulePromise = window.__importModule(moduleUrl).then',
    );
    vm.runInNewContext(runtimeScriptForTest, {
      window: windowStub,
      document: documentStub,
      navigator: windowStub.navigator,
      CSS: { escape: (value: string) => value },
      console,
      fetch: windowStub.fetch,
      Set,
      WeakMap,
      Map,
      Array,
      Object,
      String,
      Date,
      URL,
    });

    const emit = (key: string, event: any) => {
      for (const listener of listeners.get(key) || []) {
        listener(event);
      }
    };

    return { appendedElements, copiedPlainTexts, documentStub, emit, importModule, listeners, messages, windowStub };
  }

  function expectStoredTransientRetryToken(windowStub: any, token: string) {
    expect(windowStub.sessionStorage.setItem).toHaveBeenCalledWith(
      '__axhub_quick_edit_transient_vite_retry__',
      expect.any(String),
    );
    const rawValue = windowStub.sessionStorage.setItem.mock.calls.at(-1)?.[1] || '{}';
    expect(JSON.parse(rawValue)).toMatchObject({
      token,
      createdAt: expect.any(Number),
    });
  }

  function findByText(element: any, text: string): any {
    if (element.textContent === text) {
      return element;
    }
    for (const child of element.children || []) {
      const found = findByText(child, text);
      if (found) {
        return found;
      }
    }
    return null;
  }

  it('posts runtimeReady from a client page so make-server can detect the runtime handshake', () => {
    const messages: Array<{ message: any; targetOrigin: string }> = [];
    const windowStub: any = {
      axhub: undefined,
      location: {
        href: 'http://localhost:51720/prototypes/ref-app-home',
      },
      parent: {
        postMessage(message: any, targetOrigin: string) {
          messages.push({ message, targetOrigin });
        },
      },
      addEventListener: vi.fn(),
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    };
    const documentStub: any = {
      readyState: 'complete',
      documentElement: {
        dataset: {},
        appendChild: vi.fn(),
      },
      body: {},
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({
        setAttribute: vi.fn(),
        style: {},
      })),
      elementFromPoint: vi.fn(),
    };

    vm.runInNewContext(QUICK_EDIT_RUNTIME_SCRIPT, {
      window: windowStub,
      document: documentStub,
      CSS: { escape: (value: string) => value },
      console,
      Set,
      WeakMap,
      Map,
      Array,
      Object,
      String,
    });

    expect(messages).toEqual([
      {
        targetOrigin: '*',
        message: expect.objectContaining({
          type: 'axhub.quickEdit.runtimeReady',
          protocolVersion: 1,
          runtimeVersion: '0.3.0',
          href: 'http://localhost:51720/prototypes/ref-app-home',
          capabilities: expect.arrayContaining(['handshake', 'patch', 'save', 'exit']),
        }),
      },
    ]);
    expect(messages[0].message.capabilities).not.toContain('inline-text');
    expect(windowStub.axhub.quickEdit.postReady).toEqual(expect.any(Function));
  });

  it('responds to host runtimeReady requests after the initial page load message', () => {
    const { listeners, messages, windowStub } = createRuntimeHarness();

    expect(messages).toHaveLength(1);

    listeners.get('window:message')?.[0]?.({
      data: { type: 'axhub.quickEdit.requestRuntimeReady' },
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({
      targetOrigin: '*',
      message: expect.objectContaining({
        type: 'axhub.quickEdit.runtimeReady',
        protocolVersion: 1,
        runtimeVersion: '0.3.0',
        href: 'http://localhost:51720/prototypes/ref-app-home',
        capabilities: expect.arrayContaining(['handshake', 'patch', 'save', 'exit']),
      }),
    });
    expect(windowStub.axhub.quickEdit.postReady).toEqual(expect.any(Function));
  });

  it('selects page elements without enabling legacy inline text editing', () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const messages: Array<{ message: any; targetOrigin: string }> = [];
    const rect = {
      left: 12,
      top: 24,
      width: 120,
      height: 32,
      toJSON: () => ({ left: 12, top: 24, width: 120, height: 32 }),
    };
    const element: any = {
      nodeType: 1,
      id: 'headline',
      tagName: 'H1',
      textContent: 'Hello',
      children: [],
      closest: vi.fn(() => null),
      matches: vi.fn(() => false),
      getBoundingClientRect: vi.fn(() => rect),
      getAttribute: vi.fn(() => null),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      focus: vi.fn(),
    };
    const overlay: any = {
      setAttribute: vi.fn(),
      style: {},
    };
    const windowStub: any = {
      axhub: undefined,
      location: {
        href: 'http://localhost:51720/prototypes/ref-app-home',
      },
      parent: {
        postMessage(message: any, targetOrigin: string) {
          messages.push({ message, targetOrigin });
        },
      },
      addEventListener: vi.fn((type: string, listener: (...args: any[]) => void) => {
        listeners.set(`window:${type}`, listener);
      }),
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    };
    const documentStub: any = {
      readyState: 'complete',
      documentElement: {
        dataset: {},
        appendChild: vi.fn(),
      },
      body: {},
      addEventListener: vi.fn((type: string, listener: (...args: any[]) => void) => {
        listeners.set(`document:${type}`, listener);
      }),
      removeEventListener: vi.fn(),
      createElement: vi.fn(() => overlay),
      elementFromPoint: vi.fn(() => element),
    };

    vm.runInNewContext(QUICK_EDIT_RUNTIME_SCRIPT, {
      window: windowStub,
      document: documentStub,
      CSS: { escape: (value: string) => value },
      console,
      Set,
      WeakMap,
      Map,
      Array,
      Object,
      String,
      Date,
    });

    windowStub.axhub.quickEdit.enter({ projectId: 'project-1', resourceId: 'home' });
    listeners.get('document:click')?.[0]?.({
      target: element,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(element.setAttribute).not.toHaveBeenCalledWith('contenteditable', 'true');
    expect(element.removeAttribute).not.toHaveBeenCalledWith('contenteditable');
    expect(windowStub.axhub.quickEdit.capabilities).not.toContain('inline-text');
    expect(documentStub.addEventListener).not.toHaveBeenCalledWith('input', expect.any(Function), true);
  });

  it('returns a Figma clipboard payload for copy-to-figma export requests without writing from the iframe', async () => {
    const capturedDocument = { root: { id: 'root' } };
    const captureDocumentForFigmaNew = vi.fn(async () => capturedDocument);
    const buildOfficialClipboardPayloadFromCapturedDocument = vi.fn(async () => '{"figma":true}');
    const copyDocumentForFigmaNewOfficialClipboard = vi.fn();
    const { listeners, messages, windowStub } = createRuntimeHarness({
      axhubExportCore: {
        copyDocumentForFigmaNewOfficialClipboard,
        captureDocumentForFigmaNew,
        buildOfficialClipboardPayloadFromCapturedDocument,
      },
    });

    listeners.get('window:message')?.[0]?.({
      data: {
        type: 'axhub.quickEdit.export.copyToFigma',
        requestId: 'copy-1',
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
      },
    });
    await vi.waitFor(() => {
      expect(messages.at(-1)?.message?.type).toBe('axhub.quickEdit.export.copyToFigmaResult');
    });

    expect(windowStub.focus).not.toHaveBeenCalled();
    expect(captureDocumentForFigmaNew).toHaveBeenCalledWith('#root');
    expect(buildOfficialClipboardPayloadFromCapturedDocument).toHaveBeenCalledWith(capturedDocument);
    expect(copyDocumentForFigmaNewOfficialClipboard).not.toHaveBeenCalled();
    expect(messages.at(-1)).toEqual({
      targetOrigin: '*',
      message: expect.objectContaining({
        type: 'axhub.quickEdit.export.copyToFigmaResult',
        requestId: 'copy-1',
        success: true,
        payloadText: '{"figma":true}',
        payloadSizeKb: 0,
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
      }),
    });
  });

  it('returns a Figma clipboard payload for host-side clipboard writes without writing from the iframe', async () => {
    const capturedDocument = { root: { id: 'root' } };
    const captureDocumentForFigmaNew = vi.fn(async () => capturedDocument);
    const buildOfficialClipboardPayloadFromCapturedDocument = vi.fn(async () => '{"figma":true}');
    const copyDocumentForFigmaNewOfficialClipboard = vi.fn();
    const { listeners, messages, windowStub } = createRuntimeHarness({
      axhubExportCore: {
        copyDocumentForFigmaNewOfficialClipboard,
        captureDocumentForFigmaNew,
        buildOfficialClipboardPayloadFromCapturedDocument,
      },
    });

    listeners.get('window:message')?.[0]?.({
      data: {
        type: 'axhub.quickEdit.export.copyToFigma',
        requestId: 'copy-host-1',
        clipboardWriteTarget: 'host',
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
      },
    });
    await vi.waitFor(() => {
      expect(messages.at(-1)?.message?.type).toBe('axhub.quickEdit.export.copyToFigmaResult');
    });

    expect(windowStub.focus).not.toHaveBeenCalled();
    expect(captureDocumentForFigmaNew).toHaveBeenCalledWith('#root');
    expect(buildOfficialClipboardPayloadFromCapturedDocument).toHaveBeenCalledWith(capturedDocument);
    expect(copyDocumentForFigmaNewOfficialClipboard).not.toHaveBeenCalled();
    expect(messages.at(-1)).toEqual({
      targetOrigin: '*',
      message: expect.objectContaining({
        type: 'axhub.quickEdit.export.copyToFigmaResult',
        requestId: 'copy-host-1',
        success: true,
        payloadText: '{"figma":true}',
        payloadSizeKb: 0,
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
      }),
    });
  });

  it('exposes Figma payload builders from the browser runtime export bundle', () => {
    const source = readFileSync(resolve(__dirname, '../../runtime-export-core.ts'), 'utf8');

    expect(source).toContain('captureDocumentForFigmaNew as captureDocumentForFigmaNewImpl');
    expect(source).toContain('buildOfficialClipboardPayloadFromCapturedDocument as buildOfficialClipboardPayloadFromCapturedDocumentImpl');
    expect(source).toContain('export function captureDocumentForFigmaNew');
    expect(source).toContain('export function buildOfficialClipboardPayloadFromCapturedDocument');
  });

  it('loads the browser runtime export bundle with a runtime version cache buster', () => {
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain("'/assets/runtime-export-core.js?v='");
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain('encodeURIComponent(runtimeVersion)');
    expect(QUICK_EDIT_RUNTIME_SCRIPT).not.toContain("return runtimeOrigin + '/assets/runtime-export-core.js';");
  });

  it('prefers the host runtime origin from export messages when loading the export bundle', () => {
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain('let hostRuntimeOrigin =');
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain("return (hostRuntimeOrigin || runtimeOrigin) + '/assets/runtime-export-core.js?v='");
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain('function updateHostRuntimeOrigin(data)');

    const messageHandlerStart = QUICK_EDIT_RUNTIME_SCRIPT.indexOf("window.addEventListener('message'");
    const messageHandlerSource = QUICK_EDIT_RUNTIME_SCRIPT.slice(messageHandlerStart);
    expect(messageHandlerSource).toContain("if (data.type === 'axhub.quickEdit.export.copyToFigma') {\n      updateHostRuntimeOrigin(data);");
    expect(messageHandlerSource).toContain("if (data.type === 'axhub.quickEdit.export.captureScreenshot') {\n      updateHostRuntimeOrigin(data);");
    expect(messageHandlerSource).not.toContain("if (data.type === 'axhub.quickEdit.export.axureJson') {\n      updateHostRuntimeOrigin(data);");
  });

  it('loads Axure from the exact module URL supplied by the admin host', () => {
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain('let axureExportModulePromise = null;');
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain('function loadAxureExportModule(moduleUrl)');
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain('axureExportModulePromise = import(moduleUrl)');
    expect(QUICK_EDIT_RUNTIME_SCRIPT).toContain('const exportCore = await loadAxureExportModule(data.axureExportModuleUrl);');

    const axureBranch = QUICK_EDIT_RUNTIME_SCRIPT.slice(
      QUICK_EDIT_RUNTIME_SCRIPT.indexOf('async function exportAxureJson(data)'),
      QUICK_EDIT_RUNTIME_SCRIPT.indexOf('async function captureScreenshot(data)'),
    );
    expect(axureBranch).not.toContain('loadExportCore()');
    expect(axureBranch).not.toContain('getRuntimeExportCoreUrl()');
  });

  it('handles editable Axure export requests in the make-server runtime and returns the matching request id', async () => {
    const axurePayload = { scene: { items: [] }, imageMap: {} };
    const axureExportModuleUrl = 'http://localhost:53817/assets/axure-export-runtime.js';
    const htmlToAxure = vi.fn(async () => axurePayload);
    const { importModule, listeners, messages, windowStub } = createRuntimeHarness({}, {
      [axureExportModuleUrl]: { htmlToAxure },
    });

    listeners.get('window:message')?.[0]?.({
      data: {
        type: 'axhub.quickEdit.export.axureJson',
        requestId: 'axure-1',
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
        axureExportModuleUrl,
        rootName: 'Home Page',
        preserveHierarchy: true,
        preserveSvgIcons: false,
      },
    });
    await vi.waitFor(() => {
      expect(messages.at(-1)?.message?.type).toBe('axhub.quickEdit.export.axureJsonResult');
    });

    expect(importModule).toHaveBeenCalledWith(axureExportModuleUrl);
    expect(windowStub.focus).toHaveBeenCalled();
    expect(htmlToAxure).toHaveBeenCalledWith('#root', {
      rootName: 'Home Page',
      preserveHierarchy: true,
      preserveSvgIcons: false,
    });
    expect(messages.at(-1)).toEqual({
      targetOrigin: '*',
      message: expect.objectContaining({
        type: 'axhub.quickEdit.export.axureJsonResult',
        requestId: 'axure-1',
        success: true,
        payload: axurePayload,
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
      }),
    });
  });

  it('handles screenshot capture requests in the make-server runtime and returns the matching request id', async () => {
    const captureDocumentScreenshot = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==',
      width: 390,
      height: 846,
    }));
    const { listeners, messages } = createRuntimeHarness({
      axhubExportCore: {
        captureDocumentScreenshot,
      },
    });

    listeners.get('window:message')?.[0]?.({
      data: {
        type: 'axhub.quickEdit.export.captureScreenshot',
        requestId: 'screenshot-1',
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
        payload: {
          targetWidth: 390,
          targetHeight: 846,
          targetPixelRatio: 1,
          format: 'jpeg',
          quality: 0.92,
          maxBytes: 8 * 1024 * 1024,
          scope: 'viewport',
        },
      },
    });
    await vi.waitFor(() => {
      expect(messages.at(-1)?.message?.type).toBe('axhub.quickEdit.export.captureScreenshotResult');
    });

    expect(captureDocumentScreenshot).toHaveBeenCalledWith('#root', {
      targetWidth: 390,
      targetHeight: 846,
      targetPixelRatio: 1,
      format: 'jpeg',
      quality: 0.92,
      maxBytes: 8 * 1024 * 1024,
      scope: 'viewport',
    });
    expect(messages.at(-1)).toEqual({
      targetOrigin: '*',
      message: expect.objectContaining({
        type: 'axhub.quickEdit.export.captureScreenshotResult',
        requestId: 'screenshot-1',
        success: true,
        dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==',
        width: 390,
        height: 846,
        projectId: 'project-1',
        resourceId: 'home',
        resourceType: 'prototypes',
      }),
    });
  });

  it('returns copy-to-figma export failures instead of leaving make-server waiting for timeout', async () => {
    const { listeners, messages } = createRuntimeHarness({
      axhubExportCore: {
        copyDocumentForFigmaNewOfficialClipboard: vi.fn(async () => {
          throw new Error('clipboard denied');
        }),
      },
    });

    listeners.get('window:message')?.[0]?.({
      data: {
        type: 'axhub.quickEdit.export.copyToFigma',
        requestId: 'copy-2',
      },
    });
    await vi.waitFor(() => {
      expect(messages.at(-1)?.message?.type).toBe('axhub.quickEdit.export.copyToFigmaResult');
    });

    expect(messages.at(-1)).toEqual({
      targetOrigin: '*',
      message: expect.objectContaining({
        type: 'axhub.quickEdit.export.copyToFigmaResult',
        requestId: 'copy-2',
        success: false,
        error: 'Error: make-server export core missing Figma payload builders',
      }),
    });
  });

  it('exposes prototype runtime error reporting with the dialog capability', () => {
    const { appendedElements, windowStub } = createRuntimeHarness();

    expect(windowStub.axhub.quickEdit.capabilities).toContain('prototype-error-dialog');
    expect(windowStub.axhub.quickEdit.runtimeVersion).toBe('0.3.0');
    expect(windowStub.axhub.prototypeRuntime.reportError).toEqual(expect.any(Function));

    windowStub.axhub.prototypeRuntime.reportError(new Error('Render exploded'), {
      type: 'react-render',
      sourceFile: '/src/prototypes/home/index.tsx',
      line: 12,
      column: 8,
      componentStack: '\n    at Home',
      resourceType: 'prototype',
      resourceId: 'home',
    });

    expect(appendedElements).toHaveLength(1);
    expect(appendedElements[0].getAttribute('data-axhub-quick-edit-ignore')).toBe('1');
    expect(appendedElements[0].textContent).toContain('Render exploded');
    expect(appendedElements[0].textContent).toContain('/src/prototypes/home/index.tsx:12:8');
  });

  it('replays early runtime errors after installing the full handlers', () => {
    const stopEarlyCapture = vi.fn();
    const earlyCaptureState = {
      queue: [{
        eventType: 'error',
        error: new Error('Queued module failure'),
        message: 'Queued module failure',
        filename: '/src/prototypes/home/index.tsx',
        lineno: 12,
        colno: 8,
        target: null,
      }],
      stop: stopEarlyCapture,
    };

    const { appendedElements } = createRuntimeHarness({
      __AXHUB_EARLY_RUNTIME_ERROR_CAPTURE__: earlyCaptureState,
    });

    expect(stopEarlyCapture).toHaveBeenCalledTimes(1);
    expect(earlyCaptureState.queue).toHaveLength(0);
    expect(appendedElements).toHaveLength(1);
    expect(appendedElements[0].textContent).toContain('Queued module failure');
    expect(appendedElements[0].textContent).toContain('/src/prototypes/home/index.tsx:12:8');
  });

  it('renders prototype error dialog with a top-right close button, ignore action, and refresh label', () => {
    const { appendedElements, windowStub } = createRuntimeHarness();

    windowStub.axhub.prototypeRuntime.reportError(new Error('Render exploded'), {
      type: 'react-render',
      sourceFile: '/src/prototypes/home/index.tsx',
      line: 12,
      column: 8,
      resourceType: 'prototype',
      resourceId: 'home',
    });

    const dialog = appendedElements[0];
    expect(dialog.textContent).toContain('忽略');
    expect(dialog.textContent).toContain('刷新');
    expect(dialog.textContent).not.toContain('重新加载');
    expect(dialog.textContent).not.toContain('关闭');
    expect(dialog.style.padding).toBe('18px');

    const closeButton = findByText(dialog, '×');
    expect(closeButton).toBeTruthy();
    expect(closeButton.getAttribute('aria-label')).toBe('关闭');
    expect(closeButton.style.position).toBe('absolute');
    expect(closeButton.style.top).toBe('10px');
    expect(closeButton.style.right).toBe('10px');

    const title = findByText(dialog, '原型运行错误');
    expect(title).toBeTruthy();
    expect(title.style.paddingRight).toBe('30px');

    const refreshButton = findByText(dialog, '刷新');
    expect(refreshButton).toBeTruthy();
    refreshButton.listeners.get('click')?.[0]?.({});
    expect(windowStub.location.reload).toHaveBeenCalledTimes(1);

    closeButton.listeners.get('click')?.[0]?.({});
    expect(appendedElements).toHaveLength(0);
  });

  it('persists ignored prototype runtime errors locally and suppresses matching reports', () => {
    const { appendedElements, windowStub } = createRuntimeHarness();
    const reportHomeError = () => windowStub.axhub.prototypeRuntime.reportError(new Error('Render exploded'), {
      type: 'react-render',
      sourceFile: '/src/prototypes/home/index.tsx',
      line: 12,
      column: 8,
      resourceType: 'prototype',
      resourceId: 'home',
    });

    reportHomeError();
    const ignoreButton = findByText(appendedElements[0], '忽略');
    expect(ignoreButton).toBeTruthy();
    ignoreButton.listeners.get('click')?.[0]?.({});

    expect(appendedElements).toHaveLength(0);
    expect(windowStub.localStorage.setItem).toHaveBeenCalledWith(
      '__axhub_prototype_runtime_ignored_errors__',
      expect.any(String),
    );

    reportHomeError();
    expect(appendedElements).toHaveLength(0);

    windowStub.axhub.prototypeRuntime.reportError(new Error('Different crash'), {
      type: 'react-render',
      sourceFile: '/src/prototypes/home/index.tsx',
      line: 12,
      column: 8,
      resourceType: 'prototype',
      resourceId: 'home',
    });
    expect(appendedElements).toHaveLength(1);
  });

  it('scopes ignored prototype runtime errors to the current prototype URL', () => {
    const { appendedElements, windowStub } = createRuntimeHarness();
    const reportError = () => windowStub.axhub.prototypeRuntime.reportError(new Error('Render exploded'), {
      type: 'react-render',
      sourceFile: '/src/prototypes/home/index.tsx',
      line: 12,
      column: 8,
      resourceType: 'prototype',
      resourceId: 'home',
    });

    reportError();
    const ignoreButton = findByText(appendedElements[0], '忽略');
    expect(ignoreButton).toBeTruthy();
    ignoreButton.listeners.get('click')?.[0]?.({});
    expect(appendedElements).toHaveLength(0);

    windowStub.location.href = 'http://localhost:51720/prototypes/other-home';
    windowStub.location.pathname = '/prototypes/other-home';
    reportError();

    expect(appendedElements).toHaveLength(1);
  });

  it('copies prototype error diagnostics without calling the iframe Clipboard API', () => {
    const writeText = vi.fn(async () => {
      throw new Error("Failed to execute 'writeText' on 'Clipboard': Permissions policy violation.");
    });
    const { appendedElements, copiedPlainTexts, documentStub, messages, windowStub } = createRuntimeHarness({
      navigator: {
        userAgent: 'Vitest Browser',
        clipboard: { writeText },
      },
    });

    windowStub.axhub.prototypeRuntime.reportError(new Error('Render exploded'), {
      type: 'react-render',
      sourceFile: '/src/prototypes/home/index.tsx',
      line: 12,
      column: 8,
      componentStack: '\n    at Home',
      resourceType: 'prototype',
      resourceId: 'home',
    });
    const dialog = appendedElements[0];
    const actions = dialog.children[3];
    const copyButton = actions.children[0];
    copyButton.listeners.get('click')?.[0]?.({});

    expect(writeText).not.toHaveBeenCalled();
    expect(documentStub.execCommand).toHaveBeenCalledWith('copy');
    expect(copiedPlainTexts[0]).toContain('Render exploded');
    expect(copiedPlainTexts[0]).toContain('/src/prototypes/home/index.tsx');
    expect(copyButton.textContent).toBe('已复制');
    expect(messages).not.toContainEqual(expect.objectContaining({
      message: expect.objectContaining({ type: 'axhub.quickEdit.error' }),
    }));
  });

  it('opens one prototype error dialog for window errors, unhandled rejections, and resource load failures', () => {
    const { appendedElements, emit } = createRuntimeHarness();

    emit('window:error', {
      message: 'Top-level crash',
      error: new Error('Top-level crash'),
      filename: '/src/prototypes/home/index.tsx',
      lineno: 4,
      colno: 2,
    });
    emit('window:unhandledrejection', {
      reason: new Error('Async crash'),
    });
    emit('window:error', {
      target: {
        tagName: 'SCRIPT',
        src: '/src/prototypes/home/missing-module.tsx',
      },
    });

    expect(appendedElements).toHaveLength(1);
    expect(appendedElements[0].textContent).toContain('资源加载失败: /src/prototypes/home/missing-module.tsx');
  });

  it('reloads once instead of reporting transient Vite html-proxy script failures', async () => {
    const proxyUrl = 'http://localhost:51720/@id/__x00__/prototypes/ref-app-home/index.html?html-proxy&index=0.js';
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/@vite/client' || input === proxyUrl) {
        return { ok: true };
      }
      throw new Error(`Unexpected fetch url: ${input}`);
    });
    const { appendedElements, emit, windowStub } = createRuntimeHarness({ fetch: fetchMock });

    emit('window:error', {
      target: {
        tagName: 'SCRIPT',
        src: proxyUrl,
      },
    });
    await vi.waitFor(() => {
      expect(windowStub.location.reload).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/@vite/client',
    ]);
    expectStoredTransientRetryToken(
      windowStub,
      '/prototypes/ref-app-home::html-proxy:/@id/__x00__/prototypes/ref-app-home/index.html?html-proxy&index=0.js',
    );
    expect(appendedElements).toHaveLength(0);
  });

  it('reloads once instead of reporting transient preview loader script failures', async () => {
    const loaderUrl = 'http://localhost:51720/prototypes/ref-app-home/__axhub-preview-loader.js';
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/@vite/client' || input === loaderUrl) {
        return { ok: true };
      }
      throw new Error(`Unexpected fetch url: ${input}`);
    });
    const { appendedElements, emit, windowStub } = createRuntimeHarness({ fetch: fetchMock });

    emit('window:error', {
      target: {
        tagName: 'SCRIPT',
        src: loaderUrl,
      },
    });
    await vi.waitFor(() => {
      expect(windowStub.location.reload).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/@vite/client',
      loaderUrl,
    ]);
    expectStoredTransientRetryToken(
      windowStub,
      '/prototypes/ref-app-home::preview-loader:/prototypes/ref-app-home/__axhub-preview-loader.js',
    );
    expect(appendedElements).toHaveLength(0);
  });

  it('reloads stale Vite html-proxy script failures even when the old proxy URL is gone', async () => {
    const proxyUrl = 'http://localhost:51720/@id/__x00__/prototypes/ref-app-home/index.html?html-proxy&index=0.js';
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/@vite/client') {
        return { ok: true };
      }
      if (input === proxyUrl) {
        return { ok: false };
      }
      throw new Error(`Unexpected fetch url: ${input}`);
    });
    const { appendedElements, emit, windowStub } = createRuntimeHarness({ fetch: fetchMock });

    emit('window:error', {
      target: {
        tagName: 'SCRIPT',
        src: proxyUrl,
      },
    });
    await vi.waitFor(() => {
      expect(windowStub.location.reload).toHaveBeenCalledTimes(1);
    });

    expectStoredTransientRetryToken(
      windowStub,
      '/prototypes/ref-app-home::html-proxy:/@id/__x00__/prototypes/ref-app-home/index.html?html-proxy&index=0.js',
    );
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/@vite/client',
    ]);
    expect(appendedElements).toHaveLength(0);
  });

  it('recovers html-proxy failures when an old pathname-only retry token exists', async () => {
    const proxyUrl = 'http://localhost:51720/@id/__x00__/prototypes/ref-app-home/index.html?html-proxy&index=0.js';
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/@vite/client') {
        return { ok: true };
      }
      throw new Error(`Unexpected fetch url: ${input}`);
    });
    const { appendedElements, emit, windowStub } = createRuntimeHarness({ fetch: fetchMock });

    windowStub.sessionStorage.setItem(
      '__axhub_quick_edit_transient_vite_retry__',
      '/prototypes/ref-app-home',
    );
    emit('window:error', {
      target: {
        tagName: 'SCRIPT',
        src: proxyUrl,
      },
    });
    await vi.waitFor(() => {
      expect(windowStub.location.reload).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/@vite/client',
    ]);
    expect(appendedElements).toHaveLength(0);
  });

  it('reports the Vite transform error behind a repeated preview-loader failure', async () => {
    const loaderUrl = 'http://localhost:51720/prototypes/ref-app-home/__axhub-preview-loader.js';
    const entryUrl = 'http://localhost:51720/prototypes/ref-app-home/index.tsx';
    const viteError = {
      message: '/project/src/prototypes/ref-app-home/index.tsx: Did not expect a type annotation here. (432:18)',
      stack: 'SyntaxError: Did not expect a type annotation here',
      id: '/project/src/prototypes/ref-app-home/index.tsx',
      frame: '430| foo\n431| bar\n432| ) : null\n   |   ^',
      plugin: 'vite:react-babel',
      loc: { line: 432, column: 18 },
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/@vite/client') {
        return { ok: true, status: 200, text: async () => '' };
      }
      if (input === loaderUrl) {
        return {
          ok: true,
          status: 200,
          text: async () => `import PreviewComponent from "${entryUrl}";\n`,
        };
      }
      if (input === entryUrl) {
        return {
          ok: false,
          status: 500,
          text: async () => `<script type="module">const error = ${JSON.stringify(viteError)};</script>`,
        };
      }
      throw new Error(`Unexpected fetch url: ${input}`);
    });
    const { appendedElements, copiedPlainTexts, emit, windowStub } = createRuntimeHarness({ fetch: fetchMock });
    windowStub.sessionStorage.setItem(
      '__axhub_quick_edit_transient_vite_retry__',
      JSON.stringify({
        token: '/prototypes/ref-app-home::preview-loader:/prototypes/ref-app-home/__axhub-preview-loader.js',
        createdAt: Date.now(),
      }),
    );

    emit('window:error', {
      target: {
        tagName: 'SCRIPT',
        src: loaderUrl,
      },
    });

    await vi.waitFor(() => {
      expect(appendedElements).toHaveLength(1);
    });
    expect(windowStub.location.reload).not.toHaveBeenCalled();
    expect(appendedElements[0].textContent).toContain('原型编译失败');
    expect(appendedElements[0].textContent).toContain('/project/src/prototypes/ref-app-home/index.tsx:432:18');
    expect(appendedElements[0].textContent).not.toContain('资源加载失败: ' + loaderUrl);

    const copyButton = findByText(appendedElements[0], '复制错误给 AI');
    await copyButton.addEventListener.mock.calls.find(([type]: [string]) => type === 'click')?.[1]();
    const diagnostic = copiedPlainTexts[0];
    expect(diagnostic).toContain('type: vite-transform-error');
    expect(diagnostic).toContain('loaderFile: ' + loaderUrl);
    expect(diagnostic).toContain('entryFile: ' + entryUrl);
    expect(diagnostic).toContain('vitePlugin: vite:react-babel');
    expect(diagnostic).toContain('frame:\n430| foo');
  });

  it('labels repeated preview-loader failures without an entry transform error as module graph failures', async () => {
    const loaderUrl = 'http://localhost:51720/prototypes/ref-app-home/__axhub-preview-loader.js';
    const entryUrl = 'http://localhost:51720/prototypes/ref-app-home/index.tsx';
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/@vite/client') {
        return { ok: true, status: 200, text: async () => '' };
      }
      if (input === loaderUrl) {
        return {
          ok: true,
          status: 200,
          text: async () => `import PreviewComponent from "${entryUrl}";\n`,
        };
      }
      if (input === entryUrl) {
        return { ok: true, status: 200, text: async () => 'export default function Demo() {}' };
      }
      throw new Error(`Unexpected fetch url: ${input}`);
    });
    const { appendedElements, emit, windowStub } = createRuntimeHarness({ fetch: fetchMock });
    windowStub.sessionStorage.setItem(
      '__axhub_quick_edit_transient_vite_retry__',
      JSON.stringify({
        token: '/prototypes/ref-app-home::preview-loader:/prototypes/ref-app-home/__axhub-preview-loader.js',
        createdAt: Date.now(),
      }),
    );

    emit('window:error', {
      target: {
        tagName: 'SCRIPT',
        src: loaderUrl,
      },
    });

    await vi.waitFor(() => {
      expect(appendedElements).toHaveLength(1);
    });
    expect(appendedElements[0].textContent).toContain('原型模块依赖加载失败');
    expect(appendedElements[0].textContent).toContain(entryUrl);
  });

  it('updates the existing prototype error dialog when a later error is reported', () => {
    const { appendedElements, windowStub } = createRuntimeHarness();

    windowStub.axhub.prototypeRuntime.reportError(new Error('First crash'), {
      sourceFile: '/src/prototypes/home/first.tsx',
      line: 1,
      column: 2,
    });
    windowStub.axhub.prototypeRuntime.reportError(new Error('Second crash'), {
      sourceFile: '/src/prototypes/home/second.tsx',
      line: 3,
      column: 4,
    });

    expect(appendedElements).toHaveLength(1);
    expect(appendedElements[0].textContent).toContain('Second crash');
    expect(appendedElements[0].textContent).toContain('/src/prototypes/home/second.tsx:3:4');
    expect(appendedElements[0].textContent).not.toContain('First crash');
  });

  it('copies prototype error diagnostics with stack, component stack, URL, user agent, timestamp, and resource path', async () => {
    const fixedNow = new Date('2026-05-29T10:11:12.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    const { appendedElements, copiedPlainTexts, windowStub } = createRuntimeHarness();
    const error = new Error('Render exploded');
    error.stack = 'Error: Render exploded\n    at Home (/src/prototypes/home/index.tsx:12:8)';

    windowStub.axhub.prototypeRuntime.reportError(error, {
      type: 'react-render',
      sourceFile: '/src/prototypes/home/index.tsx',
      line: 12,
      column: 8,
      componentStack: '\n    at Home',
      resourceType: 'prototype',
      resourceId: 'home',
    });

    const findByText = (element: any, text: string): any => {
      if (element.textContent === text) {
        return element;
      }
      for (const child of element.children || []) {
        const found = findByText(child, text);
        if (found) {
          return found;
        }
      }
      return null;
    };
    const copyButton = findByText(appendedElements[0], '复制错误给 AI');
    expect(copyButton).toBeTruthy();
    await copyButton.addEventListener.mock.calls.find(([type]: [string]) => type === 'click')?.[1]();

    expect(windowStub.navigator.clipboard.writeText).not.toHaveBeenCalled();
    const diagnostic = copiedPlainTexts[0];
    expect(diagnostic).toContain('message: Render exploded');
    expect(diagnostic).toContain('stack:\nError: Render exploded');
    expect(diagnostic).toContain('componentStack:\n    at Home');
    expect(diagnostic).toContain('sourceFile: /src/prototypes/home/index.tsx');
    expect(diagnostic).toContain('line: 12');
    expect(diagnostic).toContain('column: 8');
    expect(diagnostic).toContain('url: http://localhost:51720/prototypes/ref-app-home');
    expect(diagnostic).toContain('userAgent: Vitest Browser');
    expect(diagnostic).toContain('timestamp: 2026-05-29T10:11:12.000Z');
    expect(diagnostic).toContain('resourcePath: /prototypes/ref-app-home');
    vi.useRealTimers();
  });

  it('does not automatically open the prototype error dialog outside prototype pages', () => {
    const { appendedElements, emit, windowStub } = createRuntimeHarness({
      location: {
        href: 'http://localhost:51720/themes/brand',
        pathname: '/themes/brand',
        origin: 'http://localhost:51720',
        reload: vi.fn(),
      },
    });

    emit('window:error', {
      message: 'Theme preview crash',
      error: new Error('Theme preview crash'),
    });

    expect(appendedElements).toHaveLength(0);
    expect(windowStub.axhub.prototypeRuntime.reportError(new Error('Manual theme report'))).toBeTruthy();
    expect(appendedElements).toHaveLength(1);
  });
});
