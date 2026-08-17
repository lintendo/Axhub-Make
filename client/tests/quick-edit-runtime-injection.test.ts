import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import {
  createManagementRuntimeLoaderSource,
  createManagementRuntimeScriptTag,
  injectManagementRuntimeScript,
  injectReactRefreshPreambleScript,
} from '../vite-plugins/clientPreviewPlugin';

function runManagementRuntimeLoader(importBootstrap: () => Promise<unknown>) {
  const appendedScripts: any[] = [];
  const messages: Array<{ message: any; targetOrigin: string }> = [];
  const listeners = new Map<string, Set<(event: any) => void>>();
  const windowStub: any = {
    DevTemplateBootstrap: undefined,
    __importBootstrap: vi.fn(importBootstrap),
    parent: {
      postMessage(message: unknown, targetOrigin: string) {
        messages.push({ message, targetOrigin });
      },
    },
    addEventListener: vi.fn((type: string, listener: (event: any) => void) => {
      const nextListeners = listeners.get(type) || new Set();
      nextListeners.add(listener);
      listeners.set(type, nextListeners);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: any) => void) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  const documentStub: any = {
    createElement: vi.fn(() => ({
      setAttribute: vi.fn(),
      src: '',
      onload: null,
      onerror: null,
    })),
    head: {
      appendChild(script: any) {
        appendedScripts.push(script);
        return script;
      },
    },
    documentElement: {
      appendChild(script: any) {
        appendedScripts.push(script);
        return script;
      },
    },
  };
  const source = createManagementRuntimeLoaderSource('http://localhost:5174')
    .replace('await import(', 'await window.__importBootstrap(');

  vm.runInNewContext(source, {
    window: windowStub,
    document: documentStub,
    console: { error: vi.fn() },
    Error,
    Promise,
    String,
  });

  return {
    appendedScripts,
    emit(type: string, event: any) {
      for (const listener of listeners.get(type) || []) {
        listener(event);
      }
    },
    messages,
    promise: windowStub.__AXHUB_MANAGEMENT_RUNTIME_BOOTSTRAP__ as Promise<void>,
    windowStub,
  };
}

describe('quick edit runtime injection', () => {
  it('injects one idempotent management runtime loader before the preview loader', () => {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head></head>',
      '<body>',
      '  <div id="root"></div>',
      '  <script type="module" data-axhub-preview-loader src="/prototypes/home/__axhub-preview-loader.js"></script>',
      '</body>',
      '</html>',
    ].join('\n');
    const nextHtml = injectManagementRuntimeScript(html, 'http://localhost:5174');

    expect(nextHtml).toContain('data-axhub-management-runtime');
    expect(nextHtml).toContain('http://localhost:5174/assets/dev-template-bootstrap.js');
    expect(nextHtml).toContain('http://localhost:5174/runtime/quick-edit.js');
    expect(nextHtml.match(/data-axhub-management-runtime/g)).toHaveLength(1);
    expect(nextHtml.indexOf('data-axhub-management-runtime')).toBeLessThan(nextHtml.indexOf('data-axhub-preview-loader'));
    expect(injectManagementRuntimeScript(nextHtml, 'http://localhost:5174')).toBe(nextHtml);
  });

  it('does not inject before Vite produces the final preview loader marker', () => {
    const html = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';

    expect(injectManagementRuntimeScript(html, 'http://localhost:5174')).toBe(html);
  });

  it('does not emit a loader without a discovered origin', () => {
    expect(createManagementRuntimeLoaderSource(null)).toBe('');
    expect(createManagementRuntimeScriptTag(null)).toBe('');
    expect(createManagementRuntimeScriptTag('')).toBe('');
  });

  it('serializes inline runtime URLs without allowing a closing script tag', () => {
    const source = createManagementRuntimeLoaderSource('http://localhost:5174</script><script>');

    expect(source).not.toContain('</script>');
    expect(source).toContain('\\u003c/script>');
  });

  it('captures preview errors before bootstrap resolves', () => {
    const bootstrapPromise = new Promise<void>(() => undefined);
    const harness = runManagementRuntimeLoader(() => bootstrapPromise);
    const resourceTarget = {
      tagName: 'SCRIPT',
      src: 'http://localhost:51720/prototypes/home/__axhub-preview-loader.js',
      href: '',
    };
    const rejection = new Error('Module import rejected');

    harness.emit('error', {
      target: resourceTarget,
      message: '',
      error: null,
      filename: '',
      lineno: 0,
      colno: 0,
    });
    harness.emit('unhandledrejection', { reason: rejection });

    expect(harness.windowStub.__AXHUB_EARLY_RUNTIME_ERROR_CAPTURE__?.queue).toEqual([
      expect.objectContaining({
        eventType: 'error',
        target: resourceTarget,
      }),
      expect.objectContaining({
        eventType: 'unhandledrejection',
        reason: rejection,
      }),
    ]);
    expect(harness.appendedScripts).toHaveLength(0);
  });

  it('waits for the editor bootstrap before appending quick-edit', async () => {
    let resolveBootstrap!: () => void;
    const bootstrapPromise = new Promise<void>((resolve) => {
      resolveBootstrap = resolve;
    });
    const harness = runManagementRuntimeLoader(() => bootstrapPromise);

    expect(harness.appendedScripts).toHaveLength(0);

    harness.windowStub.DevTemplateBootstrap = {
      editors: { enable: vi.fn() },
    };
    resolveBootstrap();
    await vi.waitFor(() => expect(harness.appendedScripts).toHaveLength(1));

    expect(harness.appendedScripts[0].src).toBe('http://localhost:5174/runtime/quick-edit.js');
    expect(harness.appendedScripts[0].setAttribute).toHaveBeenCalledWith('data-axhub-quick-edit-runtime', '');
    harness.appendedScripts[0].onload();
    await harness.promise;
  });

  it('reports bootstrap-import and stops when import fails', async () => {
    const harness = runManagementRuntimeLoader(() => Promise.reject(new Error('bootstrap failed')));

    await harness.promise;

    expect(harness.appendedScripts).toHaveLength(0);
    expect(harness.messages.at(-1)).toEqual({
      targetOrigin: '*',
      message: expect.objectContaining({
        type: 'axhub.quickEdit.error',
        stage: 'bootstrap-import',
        error: 'bootstrap failed',
      }),
    });
  });

  it('reports bootstrap-api when editors.enable is unavailable', async () => {
    const harness = runManagementRuntimeLoader(() => Promise.resolve());

    await harness.promise;

    expect(harness.appendedScripts).toHaveLength(0);
    expect(harness.messages.at(-1)?.message).toEqual(expect.objectContaining({
      type: 'axhub.quickEdit.error',
      stage: 'bootstrap-api',
    }));
  });

  it('reports quick-edit-load when the classic runtime fails', async () => {
    const harness = runManagementRuntimeLoader(() => Promise.resolve());
    harness.windowStub.DevTemplateBootstrap = {
      editors: { enable: vi.fn() },
    };
    await vi.waitFor(() => expect(harness.appendedScripts).toHaveLength(1));

    harness.appendedScripts[0].onerror();
    await harness.promise;

    expect(harness.messages.at(-1)?.message).toEqual(expect.objectContaining({
      type: 'axhub.quickEdit.error',
      stage: 'quick-edit-load',
    }));
  });

  it('injects the React refresh preamble once before the management runtime module', () => {
    const html = '<!doctype html><html><head></head><body><script type="module" data-axhub-preview-loader src="/__axhub-preview-loader.js"></script></body></html>';
    const withRuntime = injectManagementRuntimeScript(html, 'http://localhost:5174');
    const nextHtml = injectReactRefreshPreambleScript(withRuntime);

    expect(nextHtml).toContain('data-axhub-react-refresh-preamble');
    expect(nextHtml).toContain('import { injectIntoGlobalHook } from "/@react-refresh";');
    expect(nextHtml).toContain('window.$RefreshReg$ = () => {};');
    expect(nextHtml.indexOf('data-axhub-react-refresh-preamble')).toBeLessThan(nextHtml.indexOf('</head>'));
    expect(nextHtml.indexOf('data-axhub-react-refresh-preamble')).toBeLessThan(nextHtml.indexOf('data-axhub-management-runtime'));
    expect(injectReactRefreshPreambleScript(nextHtml)).toBe(nextHtml);
  });
});
