import type { ThreadMessage } from '@assistant-ui/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@axhub/acp/runtime', () => ({
  ACP_CAPABILITY_REFRESH_EVENT: 'axhub:acp-capability-refresh',
  AcpUiProvider: ({ children }: { children: unknown }) => children,
  acpApiClient: {
    cancelChat: vi.fn(),
  },
  configureAcpUiRuntime: vi.fn(),
  useAcpUiRuntimeContext: () => ({
    consumeContextBundle: () => null,
    modeId: null,
    model: null,
    provider: 'codex',
    replaceContextItems: vi.fn(),
    thoughtLevel: null,
  }),
}));

vi.mock('@axhub/acp/composer', () => ({
  AcpComposerSelectors: () => null,
  ComposerAttachments: () => null,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/input', () => ({
  Input: () => null,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: unknown }) => children,
  PopoverContent: ({ children }: { children: unknown }) => children,
  PopoverTrigger: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: () => null,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: unknown }) => children,
  DialogContent: ({ children }: { children: unknown }) => children,
  DialogFooter: ({ children }: { children: unknown }) => children,
  DialogHeader: ({ children }: { children: unknown }) => children,
  DialogTitle: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/toggle-group', () => ({
  ToggleGroup: ({ children }: { children: unknown }) => children,
  ToggleGroupItem: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: unknown }) => children,
  TooltipContent: ({ children }: { children: unknown }) => children,
  TooltipTrigger: ({ children }: { children: unknown }) => children,
}));

vi.mock('../../services/index.api', () => ({
  apiService: {
    getAssistantRuntime: vi.fn(),
  },
}));

vi.mock('./canvasReferenceClipboard', () => ({
  shouldUseCanvasReferencePaste: vi.fn(() => false),
}));

async function loadMessageExtraction() {
  const mod = await import('./CanvasGenerationComposer');
  return {
    canvasGeneralFileAttachmentAdapter: mod.canvasGeneralFileAttachmentAdapter,
    canvasReferenceImageAttachmentAdapter: mod.canvasReferenceImageAttachmentAdapter,
    applyCanvasGenerationDisplayPrompt: mod.applyCanvasGenerationDisplayPrompt,
    extractCanvasGenerationAttachmentPartsFromMessage: mod.extractCanvasGenerationAttachmentPartsFromMessage,
    extractCanvasGenerationPromptFromMessage: mod.extractCanvasGenerationPromptFromMessage,
    extractCanvasGenerationReferenceImagesFromMessage: mod.extractCanvasGenerationReferenceImagesFromMessage,
    buildCanvasProjectResourceContextItems: mod.buildCanvasProjectResourceContextItems,
    buildCanvasProjectResourceItemSelections: mod.buildCanvasProjectResourceItemSelections,
    filterCanvasProjectResourceTreeByQuery: mod.filterCanvasProjectResourceTreeByQuery,
    localContextRefsToAcpContextItems: mod.localContextRefsToAcpContextItems,
    normalizeCanvasReferencePasteResult: mod.normalizeCanvasReferencePasteResult,
    removeCanvasLocalContextRefItem: mod.removeCanvasLocalContextRefItem,
    resolveCanvasAcpRuntimeProviderOptions: mod.resolveCanvasAcpRuntimeProviderOptions,
    resolveCanvasAcpSelectorDefaults: mod.resolveCanvasAcpSelectorDefaults,
    shouldSubmitCanvasGenerationDisplayPrompt: mod.shouldSubmitCanvasGenerationDisplayPrompt,
  };
}

describe('CanvasGenerationComposer message extraction', () => {
  it('submits display prompts on Enter but not while adding a line break or composing text', async () => {
    const { shouldSubmitCanvasGenerationDisplayPrompt } = await loadMessageExtraction();

    expect(shouldSubmitCanvasGenerationDisplayPrompt({
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
    })).toBe(true);
    expect(shouldSubmitCanvasGenerationDisplayPrompt({
      key: 'Enter',
      shiftKey: true,
      isComposing: false,
    })).toBe(false);
    expect(shouldSubmitCanvasGenerationDisplayPrompt({
      key: 'Enter',
      shiftKey: false,
      isComposing: true,
    })).toBe(false);
    expect(shouldSubmitCanvasGenerationDisplayPrompt({
      key: 'a',
      shiftKey: false,
      isComposing: false,
    })).toBe(false);
  });

  it('applies, persists, and focuses an editable display prompt', async () => {
    const { applyCanvasGenerationDisplayPrompt } = await loadMessageExtraction();
    const persist = vi.fn();
    const focus = vi.fn();
    const target = { value: 'existing draft', focus };

    expect(applyCanvasGenerationDisplayPrompt({
      target,
      prompt: '  Generate a product requirements document.  ',
      disabled: false,
      persist,
    })).toBe(true);
    expect(target.value).toBe('Generate a product requirements document.');
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith('Generate a product requirements document.');
    expect(focus).toHaveBeenCalledOnce();
  });

  it('does not apply display prompts while controls are disabled or for blank input', async () => {
    const { applyCanvasGenerationDisplayPrompt } = await loadMessageExtraction();
    const persist = vi.fn();
    const focus = vi.fn();
    const target = { value: 'keep this draft', focus };

    expect(applyCanvasGenerationDisplayPrompt({
      target,
      prompt: 'Deferred card prompt',
      disabled: true,
      persist,
    })).toBe(false);
    expect(applyCanvasGenerationDisplayPrompt({
      target,
      prompt: '   ',
      disabled: false,
      persist,
    })).toBe(false);
    expect(target.value).toBe('keep this draft');
    expect(persist).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it('applies repeated display prompt selections without retaining stale selection state', async () => {
    const { applyCanvasGenerationDisplayPrompt } = await loadMessageExtraction();
    const persist = vi.fn();
    const target = { value: '', focus: vi.fn() };

    applyCanvasGenerationDisplayPrompt({ target, prompt: 'First prompt', disabled: false, persist });
    target.value = 'User edited prompt';
    applyCanvasGenerationDisplayPrompt({ target, prompt: 'First prompt', disabled: false, persist });

    expect(target.value).toBe('First prompt');
    expect(persist).toHaveBeenCalledTimes(2);
    expect(target.focus).toHaveBeenCalledTimes(2);
  });

  it('extracts prompt text from text message parts', async () => {
    const { extractCanvasGenerationPromptFromMessage } = await loadMessageExtraction();
    const message = {
      content: [
        { type: 'text', text: 'Create a product card.' },
        { type: 'text', text: 'Use the attached screenshot.' },
      ],
    } as ThreadMessage;

    expect(extractCanvasGenerationPromptFromMessage(message)).toBe(
      'Create a product card.\n\nUse the attached screenshot.',
    );
  });

  it('extracts image reference data URLs from assistant-ui image attachments', async () => {
    const { extractCanvasGenerationReferenceImagesFromMessage } = await loadMessageExtraction();
    const dataUrl = 'data:image/png;base64,aW1hZ2U=';
    const message = {
      attachments: [
        {
          id: 'reference-1',
          type: 'image',
          name: 'reference.png',
          contentType: 'image/png',
          content: [{ type: 'image', image: dataUrl, filename: 'reference.png' }],
          status: { type: 'complete' },
        },
      ],
    } as ThreadMessage;

    expect(extractCanvasGenerationReferenceImagesFromMessage(message)).toEqual([dataUrl]);
  });

  it('extracts image reference data URLs from AI SDK file attachment content', async () => {
    const { extractCanvasGenerationReferenceImagesFromMessage } = await loadMessageExtraction();
    const dataUrl = 'data:image/png;base64,aW1hZ2U=';
    const message = {
      attachments: [
        {
          id: 'reference-1',
          type: 'image',
          name: 'reference.png',
          contentType: 'image/png',
          content: [{ type: 'file', data: dataUrl, mimeType: 'image/png', filename: 'reference.png' }],
          status: { type: 'complete' },
        },
      ],
    } as ThreadMessage;

    expect(extractCanvasGenerationReferenceImagesFromMessage(message)).toEqual([dataUrl]);
  });

  it('keeps canvas composer attachments image-only and sends assistant-ui image content', async () => {
    const { canvasReferenceImageAttachmentAdapter } = await loadMessageExtraction();
    const file = new File(['image'], 'reference.png', { type: 'image/png' });

    const pendingAttachment = await canvasReferenceImageAttachmentAdapter.add({ file });
    const completeAttachment = await canvasReferenceImageAttachmentAdapter.send(pendingAttachment);

    expect(canvasReferenceImageAttachmentAdapter.accept).toBe('image/*');
    expect(pendingAttachment.type).toBe('image');
    expect(pendingAttachment.file).toBe(file);
    expect(completeAttachment.content).toEqual([
      {
        type: 'image',
        image: 'data:image/png;base64,aW1hZ2U=',
        filename: 'reference.png',
      },
    ]);
  });

  it('lets placeholder display composer attachments accept any file and keeps file content', async () => {
    const { canvasGeneralFileAttachmentAdapter } = await loadMessageExtraction();
    const file = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' });

    const pendingAttachment = await canvasGeneralFileAttachmentAdapter.add({ file });
    const completeAttachment = await canvasGeneralFileAttachmentAdapter.send(pendingAttachment);

    expect(canvasGeneralFileAttachmentAdapter.accept).toBe('*');
    expect(pendingAttachment.type).toBe('file');
    expect(pendingAttachment.file).toBe(file);
    expect(completeAttachment.content).toEqual([
      {
        type: 'file',
        data: 'data:application/pdf;base64,cGRm',
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
      },
    ]);
  });

  it('normalizes canvas reference paste results with local context refs', async () => {
    const { normalizeCanvasReferencePasteResult } = await loadMessageExtraction();

    expect(normalizeCanvasReferencePasteResult(['data:image/png;base64,one'])).toEqual({
      referenceImages: ['data:image/png;base64,one'],
      localContextRefs: [],
    });
    expect(normalizeCanvasReferencePasteResult({
      referenceImages: ['data:image/png;base64,two'],
      localContextRefs: [
        {
          resourceType: 'doc',
          resourceId: 'requirements/product-brief.md',
          title: 'Product Brief',
          paths: ['src/resources/requirements/product-brief.md'],
        },
      ],
    })).toEqual({
      referenceImages: ['data:image/png;base64,two'],
      localContextRefs: [
        {
          resourceType: 'doc',
          resourceId: 'requirements/product-brief.md',
          title: 'Product Brief',
          paths: ['src/resources/requirements/product-brief.md'],
        },
      ],
    });
  });

  it('removes a pasted local context file item from its backing refs', async () => {
    const {
      localContextRefsToAcpContextItems,
      removeCanvasLocalContextRefItem,
    } = await loadMessageExtraction();
    const refs = [
      {
        resourceType: 'theme',
        resourceId: 'quiet-saas',
        title: 'Quiet SaaS',
        paths: [
          'src/themes/quiet-saas/DESIGN.md',
          'src/themes/quiet-saas/index.tsx',
        ],
      },
    ];
    const itemToRemove = localContextRefsToAcpContextItems(refs)[0];

    expect(removeCanvasLocalContextRefItem(refs, itemToRemove.id)).toEqual([
      {
        resourceType: 'theme',
        resourceId: 'quiet-saas',
        title: 'Quiet SaaS',
        paths: [
          'src/themes/quiet-saas/index.tsx',
        ],
      },
    ]);
  });

  it('extracts all attachment file parts while still using only images as references', async () => {
    const {
      extractCanvasGenerationAttachmentPartsFromMessage,
      extractCanvasGenerationReferenceImagesFromMessage,
    } = await loadMessageExtraction();
    const imageDataUrl = 'data:image/png;base64,aW1hZ2U=';
    const pdfDataUrl = 'data:application/pdf;base64,cGRm';
    const message = {
      attachments: [
        {
          id: 'reference-1',
          type: 'image',
          name: 'reference.png',
          contentType: 'image/png',
          content: [{ type: 'image', image: imageDataUrl, filename: 'reference.png' }],
          status: { type: 'complete' },
        },
        {
          id: 'file-1',
          type: 'file',
          name: 'brief.pdf',
          contentType: 'application/pdf',
          content: [{ type: 'file', data: pdfDataUrl, mimeType: 'application/pdf', filename: 'brief.pdf' }],
          status: { type: 'complete' },
        },
      ],
    } as ThreadMessage;

    expect(extractCanvasGenerationReferenceImagesFromMessage(message)).toEqual([imageDataUrl]);
    expect(extractCanvasGenerationAttachmentPartsFromMessage(message)).toEqual([
      {
        type: 'image',
        image: imageDataUrl,
        filename: 'reference.png',
      },
      {
        type: 'file',
        data: pdfDataUrl,
        mimeType: 'application/pdf',
        filename: 'brief.pdf',
      },
    ]);
  });

  it('limits ACP selector providers to Claude Code, Codex, OpenCode, plus the user default provider', async () => {
    const { resolveCanvasAcpSelectorDefaults } = await loadMessageExtraction();

    expect(resolveCanvasAcpSelectorDefaults('acp:codex')).toEqual({
      defaultProvider: 'codex',
      providerOptions: ['claude', 'codex', 'opencode'],
    });
    expect(resolveCanvasAcpSelectorDefaults('acp:gemini')).toEqual({
      defaultProvider: 'codex',
      providerOptions: ['claude', 'codex', 'opencode'],
    });
    expect(resolveCanvasAcpSelectorDefaults('acp:grok-build')).toEqual({
      defaultProvider: 'grok-build',
      providerOptions: ['claude', 'codex', 'opencode', 'grok-build'],
    });
  });

  it('falls back to fixed ACP provider options when the runtime context omits providerOptions', async () => {
    const { resolveCanvasAcpRuntimeProviderOptions } = await loadMessageExtraction();

    expect(resolveCanvasAcpRuntimeProviderOptions(undefined, 'codex')).toEqual(['claude', 'codex', 'opencode']);
    expect(resolveCanvasAcpRuntimeProviderOptions(undefined, 'gemini' as any)).toEqual(['claude', 'codex', 'opencode']);
    expect(resolveCanvasAcpRuntimeProviderOptions(undefined, 'grok-build')).toEqual(['claude', 'codex', 'opencode', 'grok-build']);
  });

  it('builds project resource context from selected files and folders without expanding folders', async () => {
    const { buildCanvasProjectResourceContextItems } = await loadMessageExtraction();

    const items = buildCanvasProjectResourceContextItems({
      trees: {
        prototypes: [
          {
            id: 'folder:prototypes:admin',
            kind: 'folder',
            title: '后台原型',
            folderPath: 'admin',
            children: [
              {
                id: 'item:prototypes:settings',
                kind: 'item',
                title: '设置页',
                itemKey: 'prototypes/settings',
              },
            ],
          },
          {
            id: 'item:prototypes:dashboard',
            kind: 'item',
            title: '首页',
            itemKey: 'prototypes/dashboard',
          },
        ],
        docs: [
          {
            id: 'folder:docs:assets',
            kind: 'folder',
            title: '素材',
            folderPath: 'assets',
            children: [
              {
                id: 'item:docs:assets/guide.md',
                kind: 'item',
                title: '指南',
                itemKey: 'docs/assets/guide.md',
                path: 'assets/guide.md',
              },
            ],
          },
        ],
        themes: [
          {
            id: 'folder:themes:brand',
            kind: 'folder',
            title: '品牌设计',
            folderPath: 'brand',
            children: [
              {
                id: 'item:themes:brand-dark',
                kind: 'item',
                title: '深色主题',
                itemKey: 'themes/brand-dark',
              },
            ],
          },
          {
            id: 'folder-themes-zhineng',
            kind: 'folder',
            title: '智能',
            children: [
              {
                id: 'item:themes:claude',
                kind: 'item',
                title: 'Claude',
                itemKey: 'themes/claude',
              },
            ],
          },
          {
            id: 'item:themes:brand-light',
            kind: 'item',
            title: '浅色主题',
            itemKey: 'themes/brand-light',
          },
        ],
      },
      items: {
        prototypes: [
          {
            name: 'dashboard',
            displayName: '首页',
            jsUrl: '',
            specUrl: '',
          },
          {
            name: 'settings',
            displayName: '设置页',
            jsUrl: '',
            specUrl: '',
          },
        ],
        docs: [
          {
            name: 'assets/guide.md',
            displayName: '指南',
            jsUrl: '',
            specUrl: '',
            filePath: 'assets/guide.md',
          },
        ],
        themes: [
          {
            name: 'brand-light',
            displayName: '浅色主题',
            path: 'src/themes/brand-light',
          },
          {
            name: 'brand-dark',
            displayName: '深色主题',
            path: 'src/themes/brand-dark',
          },
          {
            name: 'claude',
            displayName: 'Claude',
            path: 'src/themes/claude',
          },
        ],
      },
      selectedKeys: new Set([
        'prototypes:folder:prototypes:admin',
        'prototypes:item:prototypes:dashboard',
        'docs:folder:docs:assets',
        'themes:folder:themes:brand',
        'themes:folder-themes-zhineng',
        'themes:item:themes:brand-light',
      ]),
    });

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'file',
        id: 'axhub:project-resource-folder:prototypes:src/prototypes/admin',
        path: 'src/prototypes/admin',
        name: '后台原型',
        metadata: expect.objectContaining({
          source: 'axhub-make-placeholder-resource-picker',
          resourceType: 'prototype',
          resourceKind: 'folder',
        }),
      }),
      expect.objectContaining({
        kind: 'file',
        path: 'src/prototypes/dashboard/index.tsx',
        name: '首页',
      }),
      expect.objectContaining({
        kind: 'file',
        id: 'axhub:project-resource-folder:docs:src/resources/assets',
        path: 'src/resources/assets',
        name: '素材',
        metadata: expect.objectContaining({
          source: 'axhub-make-placeholder-resource-picker',
          resourceType: 'doc',
          resourceKind: 'folder',
        }),
      }),
      expect.objectContaining({
        kind: 'file',
        id: 'axhub:project-resource-folder:themes:src/themes/brand',
        path: 'src/themes/brand',
        name: '品牌设计',
        metadata: expect.objectContaining({
          source: 'axhub-make-placeholder-resource-picker',
          resourceType: 'theme',
          resourceKind: 'folder',
        }),
      }),
      expect.objectContaining({
        kind: 'file',
        id: 'axhub:project-resource-folder:themes:src/themes/智能',
        path: 'src/themes/智能',
        name: '智能',
        metadata: expect.objectContaining({
          source: 'axhub-make-placeholder-resource-picker',
          resourceType: 'theme',
          resourceKind: 'folder',
          inferredFolderPath: true,
        }),
      }),
      expect.objectContaining({
        kind: 'file',
        path: 'src/themes/brand-light/index.tsx',
        name: '浅色主题',
      }),
    ]);
    expect(items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'src/prototypes/settings/index.tsx' }),
      expect.objectContaining({ path: 'src/resources/assets/guide.md' }),
      expect.objectContaining({ path: 'src/themes/brand-dark/index.tsx' }),
      expect.objectContaining({ path: 'src/themes/claude/index.tsx' }),
      expect.objectContaining({ path: 'src/themes/folder-themes-zhineng' }),
    ]));
  });

  it('filters project resource trees by title and path while preserving matched ancestry', async () => {
    const { filterCanvasProjectResourceTreeByQuery } = await loadMessageExtraction();
    const tree = [
      {
        id: 'folder:prototypes:admin',
        kind: 'folder',
        title: '后台原型',
        folderPath: 'admin',
        children: [
          {
            id: 'item:prototypes:settings',
            kind: 'item',
            title: '设置页',
            itemKey: 'prototypes/settings',
          },
          {
            id: 'item:prototypes:profile',
            kind: 'item',
            title: '个人中心',
            itemKey: 'prototypes/profile',
          },
        ],
      },
      {
        id: 'item:prototypes:delivery-home',
        kind: 'item',
        title: '快递官网首页',
        itemKey: 'prototypes/delivery-home',
      },
    ];

    expect(filterCanvasProjectResourceTreeByQuery(tree, 'settings')).toEqual([
      {
        id: 'folder:prototypes:admin',
        kind: 'folder',
        title: '后台原型',
        folderPath: 'admin',
        children: [
          {
            id: 'item:prototypes:settings',
            kind: 'item',
            title: '设置页',
            itemKey: 'prototypes/settings',
          },
        ],
      },
    ]);
    expect(filterCanvasProjectResourceTreeByQuery(tree, '快递')).toEqual([
      {
        id: 'item:prototypes:delivery-home',
        kind: 'item',
        title: '快递官网首页',
        itemKey: 'prototypes/delivery-home',
      },
    ]);
    expect(filterCanvasProjectResourceTreeByQuery(tree, '后台')).toEqual([
      {
        id: 'folder:prototypes:admin',
        kind: 'folder',
        title: '后台原型',
        folderPath: 'admin',
        children: [
          {
            id: 'item:prototypes:settings',
            kind: 'item',
            title: '设置页',
            itemKey: 'prototypes/settings',
          },
          {
            id: 'item:prototypes:profile',
            kind: 'item',
            title: '个人中心',
            itemKey: 'prototypes/profile',
          },
        ],
      },
    ]);
  });

  it('builds canvas picker item selections without returning folders', async () => {
    const { buildCanvasProjectResourceItemSelections } = await loadMessageExtraction();

    const selections = buildCanvasProjectResourceItemSelections({
      trees: {
        prototypes: [
          {
            id: 'folder:prototypes:admin',
            kind: 'folder',
            title: '后台原型',
            folderPath: 'admin',
            children: [
              {
                id: 'item:prototypes:settings',
                kind: 'item',
                title: '设置页',
                itemKey: 'prototypes/settings',
              },
            ],
          },
        ],
        docs: [
          {
            id: 'folder:docs:assets',
            kind: 'folder',
            title: '素材',
            folderPath: 'assets',
            children: [
              {
                id: 'item:docs:assets/logo.png',
                kind: 'item',
                title: 'Logo',
                itemKey: 'docs/assets/logo.png',
                path: 'assets/logo.png',
              },
            ],
          },
        ],
      },
      items: {
        prototypes: [
          {
            name: 'settings',
            displayName: '设置页',
            jsUrl: '',
            specUrl: '',
          },
        ],
        docs: [
          {
            name: 'assets/logo.png',
            displayName: 'Logo',
            jsUrl: '',
            specUrl: '/api/docs/assets%2Flogo.png',
            previewUrl: '/api/docs/assets%2Flogo.png',
            filePath: 'assets/logo.png',
          },
        ],
      },
      selectedKeys: new Set([
        'prototypes:folder:prototypes:admin',
        'prototypes:item:prototypes:settings',
        'docs:folder:docs:assets',
        'docs:item:docs:assets/logo.png',
      ]),
    });

    expect(selections).toEqual([
      expect.objectContaining({
        key: 'prototypes:item:prototypes:settings',
        tab: 'prototypes',
        node: expect.objectContaining({ kind: 'item', title: '设置页' }),
        item: expect.objectContaining({ name: 'settings', displayName: '设置页' }),
      }),
      expect.objectContaining({
        key: 'docs:item:docs:assets/logo.png',
        tab: 'docs',
        node: expect.objectContaining({ kind: 'item', title: 'Logo' }),
        item: expect.objectContaining({ name: 'assets/logo.png', displayName: 'Logo' }),
      }),
    ]);
    expect(selections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ node: expect.objectContaining({ kind: 'folder' }) }),
    ]));
  });
});

describe('Canvas ACP config submenu viewport layout', () => {
  it('shifts the submenu into the viewport before reducing its height', async () => {
    const mod = await import('./CanvasGenerationComposer');
    const resolveLayout = (mod as Record<string, unknown>).resolveCanvasAcpSubmenuViewportLayout;

    expect(resolveLayout).toBeTypeOf('function');
    if (typeof resolveLayout !== 'function') return;

    expect(resolveLayout({
      anchorRect: { left: 90, top: 70, right: 410, bottom: 510 },
      submenuWidth: 352,
      submenuContentHeight: 300,
      viewportWidth: 900,
      viewportHeight: 320,
    })).toEqual({
      left: 418,
      top: 12,
      maxHeight: 300,
      placement: 'right',
    });
  });

  it('flips the submenu left when the right side would overflow', async () => {
    const { resolveCanvasAcpSubmenuViewportLayout } = await import('./CanvasGenerationComposer');

    expect(resolveCanvasAcpSubmenuViewportLayout({
      anchorRect: { left: 500, top: 100, right: 820, bottom: 480 },
      submenuWidth: 300,
      submenuContentHeight: 200,
      viewportWidth: 900,
      viewportHeight: 700,
    })).toEqual({
      left: 192,
      top: 100,
      maxHeight: 200,
      placement: 'left',
    });
  });

  it('reduces the submenu height only when the viewport is too short', async () => {
    const { resolveCanvasAcpSubmenuViewportLayout } = await import('./CanvasGenerationComposer');

    expect(resolveCanvasAcpSubmenuViewportLayout({
      anchorRect: { left: 80, top: 40, right: 400, bottom: 220 },
      submenuWidth: 300,
      submenuContentHeight: 400,
      viewportWidth: 900,
      viewportHeight: 240,
    })).toEqual({
      left: 408,
      top: 8,
      maxHeight: 224,
      placement: 'right',
    });
  });
});
