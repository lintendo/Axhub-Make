import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHtmlResourceSaveBridge } from './htmlResourceSaveBridge';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function createDocumentStub(options: {
  resolveTarget?: boolean;
  targetCount?: number;
  targetTagName?: string;
  targetId?: string;
} = {}): Document {
  const meta = { getAttribute: (name: string) => name === 'content' ? 'revision-1' : null };
  const target = {
    tagName: options.targetTagName ?? 'P',
    id: options.targetId ?? 'second',
    getAttribute: (name: string) => name === 'data-axhub-text-key' ? 'body/p[1]/#text[0]' : null,
  };
  const targets = options.resolveTarget === false
    ? []
    : Array.from({ length: options.targetCount ?? 1 }, () => target);
  return {
    querySelector(selector: string) {
      if (selector === 'meta[name="axhub-html-revision"]') return meta;
      if (selector === '#second') return targets[0] ?? null;
      return null;
    },
    querySelectorAll(selector: string) {
      return selector === '#second' ? targets : [];
    },
  } as unknown as Document;
}

function createEditor() {
  return {
    getTargetedTextChanges: vi.fn(() => [{
      elementKey: 'second',
      locator: { selectors: ['#second'], fingerprint: 'p|id=second', path: [] },
      before: '重复',
      after: '第二处',
    }]),
    getStyleChanges: vi.fn(() => ({ cssText: '#second { color: blue; }' })),
    acknowledgeSavedTextChanges: vi.fn(),
    acknowledgeSavedStyleChanges: vi.fn(),
  };
}

describe('HTML resource save bridge', () => {
  it('uses the parent dialog and notice bridge when running inside the preview iframe', async () => {
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    const parent = {
      postMessage: vi.fn((payload: { type?: string; requestId?: string; kind?: string }) => {
        if (payload.type === 'WEB_EDITOR_DIALOG_REQUEST' && payload.kind === 'confirm') {
          messageHandler?.({
            data: {
              type: 'WEB_EDITOR_DIALOG_RESPONSE',
              requestId: payload.requestId,
              confirmed: true,
            },
          } as MessageEvent);
        }
      }),
    };
    const nativeConfirm = vi.fn(() => true);
    const windowStub = {
      parent,
      confirm: nativeConfirm,
      addEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
        messageHandler = handler;
      }),
      removeEventListener: vi.fn(),
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    };
    vi.stubGlobal('window', windowStub);
    const editor = createEditor();
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: '' }),
      documentRef: createDocumentStub(),
      fetchImpl: vi.fn(async () => jsonResponse({ success: true, changedCount: 1, revision: 'revision-2' })) as typeof fetch,
      reload: vi.fn(),
    });

    await bridge.saveTextChanges();

    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'WEB_EDITOR_DIALOG_REQUEST',
      kind: 'confirm',
    }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'WEB_EDITOR_DIALOG_REQUEST',
      kind: 'alert',
      level: 'success',
    }), '*');
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('does not fall back to a second native confirm when the parent dialog times out', async () => {
    let timeoutCallback: (() => void) | null = null;
    const parent = { postMessage: vi.fn() };
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('window', {
      parent,
      confirm: nativeConfirm,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: vi.fn((callback: () => void) => {
        timeoutCallback = callback;
        return 1;
      }),
      clearTimeout: vi.fn(),
    });
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, changedCount: 1 }));
    const bridge = createHtmlResourceSaveBridge({
      getEditor: createEditor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: '' }),
      documentRef: createDocumentStub(),
      fetchImpl: fetchImpl as typeof fetch,
      notify: vi.fn(),
      reload: vi.fn(),
    });

    const savePromise = bridge.saveTextChanges();
    await vi.waitFor(() => expect(timeoutCallback).not.toBeNull());
    timeoutCallback?.();
    await savePromise;

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps waiting for the parent result after the host acknowledges dialog ownership', async () => {
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    let timeoutCallback: (() => void) | null = null;
    let confirmRequestId = '';
    const parent = {
      postMessage: vi.fn((payload: { type?: string; requestId?: string; kind?: string }) => {
        if (payload.type !== 'WEB_EDITOR_DIALOG_REQUEST' || payload.kind !== 'confirm') return;
        confirmRequestId = payload.requestId ?? '';
        messageHandler?.({
          data: {
            type: 'WEB_EDITOR_DIALOG_ACK',
            requestId: confirmRequestId,
          },
        } as MessageEvent);
      }),
    };
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('window', {
      parent,
      confirm: nativeConfirm,
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
    const editor = createEditor();
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, changedCount: 1 }));
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: '' }),
      documentRef: createDocumentStub(),
      fetchImpl: fetchImpl as typeof fetch,
      notify: vi.fn(),
      reload: vi.fn(),
    });

    const savePromise = bridge.saveTextChanges();
    await vi.waitFor(() => expect(timeoutCallback).not.toBeNull());
    timeoutCallback?.();
    messageHandler?.({
      data: {
        type: 'WEB_EDITOR_DIALOG_RESPONSE',
        requestId: confirmRequestId,
        confirmed: true,
      },
    } as MessageEvent);
    await savePromise;

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(editor.acknowledgeSavedTextChanges).toHaveBeenCalledTimes(1);
  });

  it('saves targeted text with the source key and acknowledges only after success', async () => {
    const editor = createEditor();
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, changedCount: 1, revision: 'revision-2' }));
    const reload = vi.fn();
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: 'project-1' }),
      documentRef: createDocumentStub(),
      fetchImpl: fetchImpl as typeof fetch,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      reload,
    });

    await bridge.saveTextChanges();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/html-review/text-edits?projectId=project-1');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      path: 'src/resources/demo.html',
      revision: 'revision-1',
      edits: [{ key: 'body/p[1]/#text[0]', before: '重复', after: '第二处' }],
    });
    expect(editor.acknowledgeSavedTextChanges).toHaveBeenCalledTimes(1);
    expect(editor.acknowledgeSavedStyleChanges).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('separates HTML text preparation, preflight, and commit side effects', async () => {
    const editor = createEditor();
    const fetchImpl = vi.fn(async () => jsonResponse({
      success: true,
      changedCount: 1,
      revision: 'revision-2',
    }));
    const confirm = vi.fn(async () => true);
    const reload = vi.fn();
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: 'project-1' }),
      documentRef: createDocumentStub(),
      fetchImpl: fetchImpl as typeof fetch,
      confirm,
      notify: vi.fn(),
      reload,
    });

    const draft = await bridge.prepareQuickEditSave('save-text');
    expect(draft).toEqual({
      kind: 'html-text',
      action: 'save-text',
      resource: {
        engine: 'html',
        projectId: 'project-1',
        path: 'src/resources/demo.html',
        revision: 'revision-1',
      },
      edits: [{ key: 'body/p[1]/#text[0]', before: '重复', after: '第二处' }],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(editor.acknowledgeSavedTextChanges).not.toHaveBeenCalled();

    await expect(bridge.preflightQuickEditSave(draft!)).resolves.toEqual({
      action: 'save-text',
      changeCount: 1,
      affectedCount: 1,
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(bridge.commitQuickEditSave(draft!)).resolves.toMatchObject({
      changed: true,
      changedCount: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(editor.acknowledgeSavedTextChanges).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('saves and clears temporary styles with the matching HTTP methods', async () => {
    const editor = createEditor();
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => (
      jsonResponse({ success: true, changed: true, revision: init?.method === 'PUT' ? 'revision-2' : 'revision-3' })
    ));
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: '' }),
      documentRef: createDocumentStub(),
      fetchImpl: fetchImpl as typeof fetch,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      reload: vi.fn(),
    });

    await bridge.saveStyleChanges();
    await bridge.clearForcedStyles();

    expect(fetchImpl.mock.calls.map((call) => call[1]?.method)).toEqual(['PUT', 'DELETE']);
    expect(editor.acknowledgeSavedStyleChanges).toHaveBeenCalledTimes(2);
    expect(editor.acknowledgeSavedTextChanges).not.toHaveBeenCalled();
  });

  it('saves HTML text and style changes together with the updated revision', async () => {
    const editor = createEditor();
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'POST'
        ? jsonResponse({ success: true, changedCount: 1, revision: 'revision-2' })
        : jsonResponse({ success: true, changed: true, revision: 'revision-3' })
    ));
    const reload = vi.fn();
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'templates/prototype-spec.html', projectId: 'project-1' }),
      documentRef: createDocumentStub(),
      fetchImpl: fetchImpl as typeof fetch,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      reload,
    });

    await expect(bridge.saveAllChanges()).resolves.toEqual({
      changed: true,
      changedCount: 2,
      message: 'HTML 文本和样式已保存。',
    });

    expect(fetchImpl.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'PUT']);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toMatchObject({
      path: 'templates/prototype-spec.html',
      revision: 'revision-2',
    });
    expect(editor.acknowledgeSavedTextChanges).toHaveBeenCalledTimes(1);
    expect(editor.acknowledgeSavedStyleChanges).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported changed targets before writing or acknowledging', async () => {
    const editor = createEditor();
    const fetchImpl = vi.fn();
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: '' }),
      documentRef: createDocumentStub({ resolveTarget: false }),
      fetchImpl: fetchImpl as typeof fetch,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      reload: vi.fn(),
    });

    await expect(bridge.saveTextChanges()).rejects.toThrow('无法精确定位');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(editor.acknowledgeSavedTextChanges).not.toHaveBeenCalled();
  });

  it('rejects ambiguous or fingerprint-mismatched selectors before writing', async () => {
    for (const documentRef of [
      createDocumentStub({ targetCount: 2 }),
      createDocumentStub({ targetTagName: 'DIV' }),
    ]) {
      const editor = createEditor();
      const fetchImpl = vi.fn();
      const bridge = createHtmlResourceSaveBridge({
        getEditor: () => editor,
        getContext: () => ({ path: 'src/resources/demo.html', projectId: '' }),
        documentRef,
        fetchImpl: fetchImpl as typeof fetch,
        confirm: vi.fn(async () => true),
        notify: vi.fn(),
        reload: vi.fn(),
      });

      await expect(bridge.saveTextChanges()).rejects.toThrow('无法精确定位');
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(editor.acknowledgeSavedTextChanges).not.toHaveBeenCalled();
    }
  });

  it('keeps edits unacknowledged when the server reports a conflict', async () => {
    const editor = createEditor();
    const bridge = createHtmlResourceSaveBridge({
      getEditor: () => editor,
      getContext: () => ({ path: 'src/resources/demo.html', projectId: '' }),
      documentRef: createDocumentStub(),
      fetchImpl: vi.fn(async () => jsonResponse({ error: 'HTML document changed', code: 'HTML_DOCUMENT_CHANGED' }, 409)) as typeof fetch,
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
      reload: vi.fn(),
    });

    await expect(bridge.saveTextChanges()).rejects.toThrow('源文件已更新，请刷新后重新修改。');
    expect(editor.acknowledgeSavedTextChanges).not.toHaveBeenCalled();
  });
});
