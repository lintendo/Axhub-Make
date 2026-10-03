import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMockState = vi.hoisted(() => ({
  effectCursor: 0,
  effectDepsByCursor: new Map<number, unknown[] | undefined>(),
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    const index = reactMockState.effectCursor;
    reactMockState.effectCursor += 1;
    const previousDeps = reactMockState.effectDepsByCursor.get(index);
    const shouldRun = !deps
      || !previousDeps
      || deps.length !== previousDeps.length
      || deps.some((dep, depIndex) => !Object.is(dep, previousDeps[depIndex]));
    reactMockState.effectDepsByCursor.set(index, deps ? [...deps] : undefined);
    if (shouldRun) {
      effect();
    }
  },
  useRef: (initialValue: unknown) => ({ current: initialValue }),
  useState: (initialValue: unknown) => [
    typeof initialValue === 'function' ? (initialValue as () => unknown)() : initialValue,
    () => undefined,
  ],
}));

import { defineHashPageRoute, parseHashPage, parseSearchPage, useHashPage } from '../src/common/useHashPage';

function renderUseHashPage(routeOrDefault?: Parameters<typeof useHashPage>[0]) {
  reactMockState.effectCursor = 0;
  return useHashPage(routeOrDefault);
}

function createPreviewWindowStub(initialHash = '', initialSearch = '') {
  const listeners = new Map<string, Array<() => void>>();
  const parent = {
    postMessage: vi.fn(),
  };
    const windowStub = {
    location: { hash: initialHash, search: initialSearch },
    parent,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== listener));
    }),
  };
  return {
    windowStub,
    parent,
    dispatch(type: string) {
      for (const listener of listeners.get(type) || []) {
        listener();
      }
    },
  };
}

describe('useHashPage route definition', () => {
  afterEach(() => {
    reactMockState.effectCursor = 0;
    reactMockState.effectDepsByCursor.clear();
    vi.unstubAllGlobals();
  });

  it('defines literal hash page routes with an explicit default page', () => {
    const route = defineHashPageRoute([
      { id: 'dashboard', title: '工作台' },
      { id: 'orders-list', title: '订单列表' },
    ], { defaultPageId: 'orders-list' });

    expect(route).toEqual({
      pages: [
        { id: 'dashboard', title: '工作台' },
        { id: 'orders-list', title: '订单列表' },
      ],
      defaultPageId: 'orders-list',
    });
  });

  it('drops invalid page ids and falls back to the first valid page', () => {
    const route = defineHashPageRoute([
      { id: 'Dashboard', title: 'Bad Case' },
      { id: 'orders-list', title: '订单列表' },
    ], { defaultPageId: 'missing' });

    expect(route).toEqual({
      pages: [{ id: 'orders-list', title: '订单列表' }],
      defaultPageId: 'orders-list',
    });
  });

  it('normalizes optional page groups without retaining blank labels', () => {
    const route = defineHashPageRoute([
      { id: 'orders-list', title: '订单列表', group: '  订单管理  ' },
      { id: 'customers', title: '客户列表', group: '   ' },
    ], { defaultPageId: 'orders-list' });

    expect(route).toEqual({
      pages: [
        { id: 'orders-list', title: '订单列表', group: '订单管理' },
        { id: 'customers', title: '客户列表' },
      ],
      defaultPageId: 'orders-list',
    });
  });

  it('parses page hashes without accepting invalid page ids', () => {
    expect(parseHashPage('#page=orders-list')).toBe('orders-list');
    expect(parseHashPage('#foo=bar&page=orders-list')).toBe('orders-list');
    expect(parseHashPage('#page=Orders')).toBeNull();
  });

  it('parses page query params as preview fallback', () => {
    expect(parseSearchPage('?projectId=make-project&p=annotation-demo&page=prototype-directory')).toBe('prototype-directory');
    expect(parseSearchPage('?page=PrototypeDirectory')).toBeNull();
  });

  it('publishes route info once on mount and keeps page-change messages for hash navigation', () => {
    const { windowStub, parent, dispatch } = createPreviewWindowStub('#page=state-annotation');
    vi.stubGlobal('window', windowStub);
    const route = defineHashPageRoute([
      { id: 'content-annotation', title: '内容标注', group: '标注类型' },
      { id: 'state-annotation', title: '状态标注', group: '标注类型' },
      { id: 'prototype-directory', title: '页面目录' },
    ], { defaultPageId: 'content-annotation' });

    const result = renderUseHashPage(route);

    expect(result.page).toBe('state-annotation');
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenNthCalledWith(1, {
      type: 'AXHUB_PROTOTYPE_ROUTE_INFO',
      pages: [
        { id: 'content-annotation', title: '内容标注', group: '标注类型' },
        { id: 'state-annotation', title: '状态标注', group: '标注类型' },
        { id: 'prototype-directory', title: '页面目录' },
      ],
      defaultPageId: 'content-annotation',
      activePageId: 'state-annotation',
    }, '*');

    windowStub.location.hash = '#page=prototype-directory';
    dispatch('hashchange');

    expect(parent.postMessage).toHaveBeenCalledTimes(2);
    expect(parent.postMessage).toHaveBeenNthCalledWith(2, {
      type: 'AXHUB_PROTOTYPE_PAGE_CHANGE',
      pageId: 'prototype-directory',
    }, '*');
    expect(parent.postMessage.mock.calls.filter(([message]) => (
      message?.type === 'AXHUB_PROTOTYPE_ROUTE_INFO'
    ))).toHaveLength(1);
  });

  it('does not republish route info when a non-default iframe page switches internally and rerenders', () => {
    const { windowStub, parent, dispatch } = createPreviewWindowStub('#page=edit-prototype');
    vi.stubGlobal('window', windowStub);
    const route = defineHashPageRoute([
      { id: 'install-agent', title: '安装 Agent' },
      { id: 'edit-prototype', title: '编辑原型' },
      { id: 'publish-prototype', title: '发布原型' },
    ], { defaultPageId: 'install-agent' });

    expect(renderUseHashPage(route).page).toBe('edit-prototype');

    windowStub.location.hash = '#page=publish-prototype';
    dispatch('hashchange');

    expect(renderUseHashPage(route).page).toBe('publish-prototype');
    expect(parent.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'AXHUB_PROTOTYPE_ROUTE_INFO',
      'AXHUB_PROTOTYPE_PAGE_CHANGE',
    ]);
  });

  it('uses query page when the preview url has no page hash', () => {
    const { windowStub } = createPreviewWindowStub('', '?projectId=make-project&p=annotation-demo&page=prototype-directory');
    vi.stubGlobal('window', windowStub);
    const route = defineHashPageRoute([
      { id: 'prototype-as-prd', title: '原型即 PRD' },
      { id: 'prototype-directory', title: '页面目录' },
    ], { defaultPageId: 'prototype-as-prd' });

    const result = renderUseHashPage(route);

    expect(result.page).toBe('prototype-directory');
  });

  it('does not publish route info for default-only hash pages', () => {
    const { windowStub, parent } = createPreviewWindowStub('');
    vi.stubGlobal('window', windowStub);

    const result = renderUseHashPage('home');

    expect(result.page).toBe('home');
    expect(parent.postMessage).not.toHaveBeenCalled();
  });
});
