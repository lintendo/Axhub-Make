import { describe, expect, it, vi } from 'vitest';

import {
  createHtmlReviewBridge,
  normalizeHtmlReviewDocumentPath,
  shouldAllowHtmlReviewPageEvent,
  type HtmlReviewBridgeDeps,
} from './htmlReviewBridge.ts';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createHarness(
  overrides: Partial<HtmlReviewBridgeDeps> = {},
  diagramKind: 'mermaid' | 'drawio' = 'mermaid',
) {
  const ownerAttributes = new Map<string, string>(diagramKind === 'drawio'
    ? [['src', 'existing/architecture.drawio.svg']]
    : []);
  const setOwnerAttribute = vi.fn((name: string, value: string) => {
    ownerAttributes.set(name, value);
  });
  const owner = {
    tagName: diagramKind === 'drawio' ? 'IMG' : 'DIV',
    isConnected: true,
    getAttribute: (name: string) => ownerAttributes.get(name) ?? null,
    setAttribute: setOwnerAttribute,
  } as unknown as Element;
  const popup = { location: { href: 'about:blank' }, close: vi.fn(), focus: vi.fn() };
  const setComment = vi.fn();
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/diagrams?')) {
      return jsonResponse({
        documentPath: 'src/resources/review/demo.html',
        diagrams: [{
          key: `${diagramKind}-1`,
          kind: diagramKind,
          documentIndex: 0,
          source: 'flowchart LR\nA-->B',
          sourceHash: 'source-hash',
          sourcePath: diagramKind === 'mermaid'
            ? 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw'
            : 'src/resources/review/existing/architecture.drawio.svg',
          previewPath: diagramKind === 'mermaid'
            ? 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png'
            : 'src/resources/review/existing/architecture.drawio.svg',
        }],
      });
    }
    if (url.includes('/diagram-drafts') && !url.includes('/diagram-drafts/') && init?.method === 'POST') {
      return jsonResponse({
        sessionId: 'session-1',
        diagramKey: `${diagramKind}-1`,
        kind: diagramKind,
        sourceHash: 'source-hash',
        sourcePath: diagramKind === 'mermaid'
          ? 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw'
          : 'src/resources/review/existing/architecture.drawio.svg',
        previewPath: diagramKind === 'mermaid'
          ? 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png'
          : 'src/resources/review/existing/architecture.drawio.svg',
        summary: [],
        stale: false,
        updatedAt: '2026-07-12T00:00:00.000Z',
      }, 201);
    }
    if (url.includes('/diagram-drafts/session-1')) {
      return jsonResponse({
        sessionId: 'session-1',
        diagramKey: `${diagramKind}-1`,
        kind: diagramKind,
        sourceHash: 'source-hash',
        sourcePath: diagramKind === 'mermaid'
          ? 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw'
          : 'src/resources/review/existing/architecture.drawio.svg',
        previewPath: diagramKind === 'mermaid'
          ? 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png'
          : 'src/resources/review/existing/architecture.drawio.svg',
        summary: ['调整了支付流程方向'],
        stale: true,
        artifactMtimeMs: 1783875000000,
        updatedAt: '2026-07-12T00:01:00.000Z',
      });
    }
    return jsonResponse({ error: 'not found' }, 404);
  });
  const deps: HtmlReviewBridgeDeps = {
    documentPath: 'src/resources/review/demo.html',
    projectId: 'make-project',
    fetchImpl,
    openWindow: vi.fn(() => popup as unknown as Window),
    resolveDiagramTarget: vi.fn(() => ({
      kind: diagramKind,
      owner,
      diagramId: `${diagramKind}-1`,
      sourceUrl: diagramKind === 'drawio' ? 'existing/architecture.drawio.svg' : '',
      documentIndex: 0,
      editable: true,
    })),
    convertMermaid: vi.fn(async () => ({
      type: 'excalidraw',
      version: 2,
      source: 'https://axhub.im',
      elements: [{ id: 'shape-1' }],
      appState: {},
      files: {},
    })),
    reviewProtocol: {
      setComment,
      clearComment: vi.fn(),
    },
    storage: null,
    setIntervalImpl: vi.fn(() => 1),
    clearIntervalImpl: vi.fn(),
    ...overrides,
  };
  return {
    bridge: createHtmlReviewBridge(deps),
    deps,
    owner,
    popup,
    setComment,
    setOwnerAttribute,
    fetchImpl,
  };
}

describe('HTML review bridge', () => {
  it('keeps standard review controls interactive while leaving ordinary page elements selectable', () => {
    const reviewControl = {
      matches: (selector: string) => selector.includes('input:not([type="file"])'),
    };
    const customControl = {
      matches: (selector: string) => selector.includes('[data-axhub-review-interactive]'),
    };
    const ordinaryElement = { matches: () => false };

    expect(shouldAllowHtmlReviewPageEvent({
      composedPath: () => [reviewControl],
      target: reviewControl,
    } as unknown as Event)).toBe(true);
    expect(shouldAllowHtmlReviewPageEvent({
      composedPath: () => [customControl],
      target: customControl,
    } as unknown as Event)).toBe(true);
    expect(shouldAllowHtmlReviewPageEvent({
      composedPath: () => [ordinaryElement],
      target: ordinaryElement,
    } as unknown as Event)).toBe(false);
  });

  it('normalizes Make resource ids and absolute preview paths to project-relative HTML paths', () => {
    expect(normalizeHtmlReviewDocumentPath('examples/demo.html')).toBe('src/resources/examples/demo.html');
    expect(normalizeHtmlReviewDocumentPath('src/resources/examples/demo.html')).toBe('src/resources/examples/demo.html');
    expect(normalizeHtmlReviewDocumentPath('src/prototypes/order/.spec/spec.html')).toBe('src/prototypes/order/.spec/spec.html');
    expect(normalizeHtmlReviewDocumentPath('templates/prototype-spec.html')).toBe('templates/prototype-spec.html');
    expect(normalizeHtmlReviewDocumentPath('/workspace/client/src/resources/examples/demo.html')).toBe('src/resources/examples/demo.html');
    expect(normalizeHtmlReviewDocumentPath('/api/markdown-file')).toBe('');
    expect(normalizeHtmlReviewDocumentPath('../demo.html')).toBe('');
  });

  it('shows one host tool only for editable Mermaid and Draw.io targets', () => {
    const { bridge, owner } = createHarness();
    expect(bridge.getElementTools(owner)).toEqual([
      { id: 'open-diagram', label: '在画布中打开', icon: 'diagram' },
    ]);

    const drawio = createHarness({
      resolveDiagramTarget: vi.fn(() => ({
        kind: 'drawio', owner, diagramId: 'architecture', sourceUrl: '', documentIndex: 0, editable: true,
      })),
    }).bridge;
    expect(drawio.getElementTools(owner)[0]?.label).toBe('在 Draw.io 中打开');

    const plain = createHarness({ resolveDiagramTarget: vi.fn(() => null) }).bridge;
    expect(plain.getElementTools(owner)).toEqual([]);
  });

  it('opens a placeholder synchronously and creates a Mermaid canvas without putting source in feedback', async () => {
    const { bridge, deps, owner, popup, fetchImpl, setComment } = createHarness();
    await bridge.onElementToolAction({ id: 'open-diagram', label: '在画布中打开' }, owner);

    expect(deps.openWindow).toHaveBeenCalledWith('about:blank', '_blank');
    const post = fetchImpl.mock.calls.find((call) => (
      String(call[0]).includes('/diagram-drafts') && !String(call[0]).includes('/diagram-drafts/')
    ));
    expect(post).toBeTruthy();
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body).toMatchObject({ path: 'src/resources/review/demo.html', diagramKey: 'mermaid-1' });
    expect(body.excalidraw.elements).toEqual([{ id: 'shape-1' }]);
    expect(popup.location.href).toContain('docPath=src%2Fresources%2F.assets%2Freview%2Fdemo.html%2Fdiagrams%2Fmermaid-1.excalidraw');
    expect(popup.location.href).toContain('view=canvas');
    expect(setComment).not.toHaveBeenCalled();
  });

  it('opens hidden Draw.io review artifacts through a direct project-file deep link', async () => {
    const openDrawioEditor = vi.fn(async () => true);
    const { bridge, owner, popup } = createHarness({
      resolveDiagramTarget: vi.fn(() => ({
        kind: 'drawio', owner, diagramId: 'drawio-1', sourceUrl: '', documentIndex: 0, editable: true,
      })),
      openDrawioEditor,
    }, 'drawio');

    await bridge.onElementToolAction({ id: 'open-diagram', label: '在 Draw.io 中打开' }, owner);

    expect(openDrawioEditor).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'doc',
      popupWindow: popup,
      resource: expect.objectContaining({
        name: 'review/existing/architecture.drawio.svg',
        filePath: 'src/resources/review/existing/architecture.drawio.svg',
      }),
    }));
    expect(popup.location.href).toBe('about:blank');
  });

  it('refreshes the linked Draw.io image after the edited source is saved', async () => {
    const openDrawioEditor = vi.fn(async () => true);
    const { bridge, owner, setOwnerAttribute } = createHarness({ openDrawioEditor }, 'drawio');

    await bridge.onElementToolAction({ id: 'open-diagram', label: '在 Draw.io 中打开' }, owner);
    await bridge.refreshDrafts();

    expect(setOwnerAttribute).toHaveBeenCalledWith(
      'src',
      '/api/docs/review%2Fexisting%2Farchitecture.drawio.svg?projectId=make-project&axhubReviewVersion=1783875000000',
    );
  });

  it('surfaces popup blocking before performing asynchronous work', async () => {
    const { bridge, owner, fetchImpl } = createHarness({ openWindow: vi.fn(() => null) });
    await expect(bridge.onElementToolAction({ id: 'open-diagram', label: '在画布中打开' }, owner))
      .rejects.toThrow('浏览器阻止了新窗口');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('recovers session updates as one path-only ordinary comment with stale-source status', async () => {
    const { bridge, owner, setComment } = createHarness();
    await bridge.onElementToolAction({ id: 'open-diagram', label: '在画布中打开' }, owner);
    await bridge.refreshDrafts();
    await bridge.refreshDrafts();

    expect(setComment).toHaveBeenCalledWith({
      element: owner,
      comment: [
        '图表修改：mermaid-1',
        '状态：已更新（原 HTML 图表源已变化）',
        '修改概览：调整了支付流程方向',
        '源文件：src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
        '预览文件：src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
        '源版本：source-hash',
      ].join('\n'),
    });
    expect(setComment).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(setComment.mock.calls)).not.toContain('flowchart LR');
    expect(JSON.stringify(setComment.mock.calls)).not.toContain('shape-1');
  });

  it('keeps only the newest review session for one diagram', async () => {
    let postCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/diagrams?')) {
        return jsonResponse({
          diagrams: [{
            key: 'mermaid-1', kind: 'mermaid', documentIndex: 0,
            source: 'flowchart LR\nA-->B', sourceHash: 'source-hash',
            sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
            previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
          }],
        });
      }
      if (url.endsWith('/diagram-drafts?projectId=make-project') && init?.method === 'POST') {
        postCount += 1;
        return jsonResponse({
          sessionId: postCount === 1 ? 'session-old' : 'session-new',
          diagramKey: 'mermaid-1', kind: 'mermaid', sourceHash: 'source-hash',
          sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
          previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
          summary: [], stale: false,
          updatedAt: postCount === 1 ? '2026-07-12T00:00:00.000Z' : '2026-07-12T00:01:00.000Z',
        }, 201);
      }
      const isOld = url.includes('/diagram-drafts/session-old');
      if (isOld || url.includes('/diagram-drafts/session-new')) {
        return jsonResponse({
          sessionId: isOld ? 'session-old' : 'session-new',
          diagramKey: 'mermaid-1', kind: 'mermaid', sourceHash: 'source-hash',
          sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
          previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
          summary: [isOld ? '旧修改' : '新修改'], stale: false,
          updatedAt: isOld ? '2026-07-12T00:00:00.000Z' : '2026-07-12T00:01:00.000Z',
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    const { bridge, owner, setComment } = createHarness({ fetchImpl });

    await bridge.onElementToolAction({ id: 'open-diagram', label: '在画布中打开' }, owner);
    await bridge.onElementToolAction({ id: 'open-diagram', label: '在画布中打开' }, owner);
    await bridge.refreshDrafts();

    expect(setComment).toHaveBeenCalledTimes(1);
    expect(setComment.mock.calls[0]?.[0]?.comment).toContain('新修改');
    expect(setComment.mock.calls[0]?.[0]?.comment).not.toContain('旧修改');
  });

  it('does not write an in-flight draft into a replacement editor after disposal', async () => {
    let resolveDraft: ((response: Response) => void) | null = null;
    const pendingDraft = new Promise<Response>((resolve) => {
      resolveDraft = resolve;
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/diagrams?')) {
        return jsonResponse({ diagrams: [{
          key: 'mermaid-1', kind: 'mermaid', documentIndex: 0,
          source: 'flowchart LR\nA-->B', sourceHash: 'source-hash',
          sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
          previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
        }] });
      }
      if (url.includes('/diagram-drafts') && !url.includes('/diagram-drafts/') && init?.method === 'POST') {
        return jsonResponse({
          sessionId: 'session-1', diagramKey: 'mermaid-1', kind: 'mermaid', sourceHash: 'source-hash',
          sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
          previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
          summary: [], stale: false, updatedAt: '2026-07-12T00:00:00.000Z',
        }, 201);
      }
      if (url.includes('/diagram-drafts/session-1')) return pendingDraft;
      return jsonResponse({ error: 'not found' }, 404);
    });
    const { bridge, owner, setComment } = createHarness({ fetchImpl });
    await bridge.onElementToolAction({ id: 'open-diagram', label: '在画布中打开' }, owner);

    const refresh = bridge.refreshDrafts();
    bridge.dispose();
    resolveDraft?.(jsonResponse({
      sessionId: 'session-1', diagramKey: 'mermaid-1', kind: 'mermaid', sourceHash: 'source-hash',
      sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
      previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
      summary: ['不应写入'], stale: false, updatedAt: '2026-07-12T00:01:00.000Z',
    }));
    await refresh;

    expect(setComment).not.toHaveBeenCalled();
  });

  it('recovers a stored diagram session by its exact descriptor index', async () => {
    const firstOwner = { id: 'first-owner' } as unknown as Element;
    const secondOwner = { id: 'second-owner' } as unknown as Element;
    const setComment = vi.fn();
    const storageValues = new Map<string, string>([[
      'axhub-html-review-drafts:src/resources/review/demo.html',
      JSON.stringify(['session-2']),
    ]]);
    const storage = {
      get length() { return storageValues.size; },
      clear: () => storageValues.clear(),
      getItem: (key: string) => storageValues.get(key) ?? null,
      key: (index: number) => [...storageValues.keys()][index] ?? null,
      removeItem: (key: string) => storageValues.delete(key),
      setItem: (key: string, value: string) => storageValues.set(key, value),
    } as Storage;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/diagrams?')) {
        return jsonResponse({ diagrams: [
          {
            key: 'mermaid-1', kind: 'mermaid', documentIndex: 0,
            source: 'flowchart LR\nA-->B', sourceHash: 'first-hash',
            sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw',
            previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.png',
          },
          {
            key: 'mermaid-2', kind: 'mermaid', documentIndex: 1,
            source: 'flowchart LR\nC-->D', sourceHash: 'second-hash',
            sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-2.excalidraw',
            previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-2.png',
          },
        ] });
      }
      if (url.includes('/diagram-drafts/session-2')) {
        return jsonResponse({
          sessionId: 'session-2', diagramKey: 'mermaid-2', kind: 'mermaid', sourceHash: 'second-hash',
          sourcePath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-2.excalidraw',
          previewPath: 'src/resources/.assets/review/demo.html/diagrams/mermaid-2.png',
          summary: ['恢复第二张图'], stale: false, updatedAt: '2026-07-12T00:02:00.000Z',
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    const bridge = createHtmlReviewBridge({
      documentPath: 'src/resources/review/demo.html',
      fetchImpl,
      openWindow: vi.fn(() => null),
      storage,
      documentRef: { querySelectorAll: () => [firstOwner, secondOwner] } as unknown as Document,
      resolveDiagramTarget: vi.fn((element) => element === firstOwner
        ? { kind: 'mermaid', owner: firstOwner, diagramId: 'first', sourceUrl: '', documentIndex: 0, editable: true }
        : { kind: 'mermaid', owner: secondOwner, diagramId: 'second', sourceUrl: '', documentIndex: 1, editable: true }),
      reviewProtocol: { setComment, clearComment: vi.fn() },
      setIntervalImpl: vi.fn(() => 1),
      clearIntervalImpl: vi.fn(),
    });

    await bridge.refreshDrafts();

    expect(setComment).toHaveBeenCalledWith(expect.objectContaining({
      element: secondOwner,
      comment: expect.stringContaining('恢复第二张图'),
    }));
  });
});
