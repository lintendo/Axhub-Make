import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createCommentary: vi.fn(),
  getGlobalCommentaryTweakProtocol: vi.fn(),
}));

vi.mock('@axhub/commentary', () => ({
  createCommentary: mocked.createCommentary,
  getGlobalCommentaryTweakProtocol: mocked.getGlobalCommentaryTweakProtocol,
}));

vi.mock('../index/components/dialogs/AppDialogProvider', () => ({
  getImperativeAppDialog: () => null,
}));

import {
  createDocumentCommentsPersistenceAdapter,
  createDocumentCommentsPersistenceScope,
} from '../common/documentCommentsPersistence';
import { createPrototypeCommentsPersistenceAdapter } from './webEditorV2Integration';

const prototypeScope = {
  targetPath: 'prototypes/home',
  storageScope: 'prototypes/home',
  prototypeId: 'home',
  filePath: 'src/prototypes/home/index.tsx',
  resource: null,
};

const documentScope = createDocumentCommentsPersistenceScope({
  projectId: 'project-a',
  documentPath: 'src/resources/prd/order.md',
});

function buildDocument(
  kind: 'prototype-edit-comments' | 'document-edit-comments',
  targetPath: string,
  label: string,
) {
  return {
    schemaVersion: 2 as const,
    kind,
    resource: { id: 'comments', targetPath, filePath: '.axhub/make/comments/hash.json' },
    comments: [{
      pageScope: 'page-a',
      elementKey: 'hero',
      locator: { selectors: ['#hero'] },
      comment: label,
    }],
    images: [],
  };
}

function createFetchConcurrencyProbe(delayMs = 20) {
  let activePuts = 0;
  let maxActivePuts = 0;
  const putBodies: Record<string, any>[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'PUT') {
      activePuts += 1;
      maxActivePuts = Math.max(maxActivePuts, activePuts);
      putBodies.push(JSON.parse(String(init.body)));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      activePuts -= 1;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ exists: false, document: null }),
    };
  }) as typeof fetch;

  return {
    fetchMock,
    getMaxActivePuts: () => maxActivePuts,
    getPutBodies: () => putBodies,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('comment persistence adapter concurrency', () => {
  it('keeps the prototype adapter as a transport-only concurrent writer', async () => {
    const probe = createFetchConcurrencyProbe();
    vi.stubGlobal('fetch', probe.fetchMock);
    const adapter = createPrototypeCommentsPersistenceAdapter({
      getProjectId: () => 'project-a',
      getMakeServerOrigin: () => 'http://localhost:53817',
    });
    await adapter.read(prototypeScope);

    await Promise.all(['first', 'second', 'third'].map((label) => adapter.write(
      prototypeScope,
      buildDocument('prototype-edit-comments', prototypeScope.targetPath, label),
      'changes',
    )));

    expect(probe.getPutBodies().map((body) => body.document.comments[0].comment)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(probe.getMaxActivePuts()).toBe(3);
  });

  it('keeps the document adapter as a transport-only concurrent writer', async () => {
    const probe = createFetchConcurrencyProbe();
    vi.stubGlobal('fetch', probe.fetchMock);
    const adapter = createDocumentCommentsPersistenceAdapter(() => ({
      projectId: 'project-a',
      documentPath: 'src/resources/prd/order.md',
      makeServerOrigin: 'http://localhost:53817',
    }));
    await adapter.read(documentScope);

    await Promise.all(['first', 'second', 'third'].map((label) => adapter.write(
      documentScope,
      buildDocument('document-edit-comments', documentScope.targetPath, label),
      'changes',
    )));

    expect(probe.getPutBodies().map((body) => body.document.comments[0].comment)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(probe.getMaxActivePuts()).toBe(3);
  });

  it('allows independent prototype storage scopes to save concurrently', async () => {
    const probe = createFetchConcurrencyProbe();
    vi.stubGlobal('fetch', probe.fetchMock);
    const adapter = createPrototypeCommentsPersistenceAdapter({
      getProjectId: () => 'project-a',
      getMakeServerOrigin: () => 'http://localhost:53817',
    });
    await adapter.read(prototypeScope);
    const checkoutScope = {
      ...prototypeScope,
      targetPath: 'prototypes/checkout',
      storageScope: 'prototypes/checkout',
      prototypeId: 'checkout',
      filePath: 'src/prototypes/checkout/index.tsx',
    };

    await Promise.all([
      adapter.write(
        prototypeScope,
        buildDocument('prototype-edit-comments', prototypeScope.targetPath, 'home'),
        'changes',
      ),
      adapter.write(
        checkoutScope,
        buildDocument('prototype-edit-comments', checkoutScope.targetPath, 'checkout'),
        'changes',
      ),
    ]);

    expect(probe.getMaxActivePuts()).toBe(2);
  });
});
