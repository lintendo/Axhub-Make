import { describe, expect, it } from 'vitest';

import {
  buildAcpPreviewMcpPostMessage,
  buildAcpCanvasMcpPostMessage,
  buildAcpImageGenerationPostMessage,
  buildAcpContextPostMessage,
  buildAcpThemePostMessage,
  getAcpPreviewMcpConfigSignature,
  getAcpCanvasMcpConfigSignature,
  getAcpImageGenerationConfigSignature,
  buildAcpCanvasMcpServers,
  buildAcpPreviewMcpServers,
  mapAssistantContextToAcpContextBundle,
} from './assistantAcpContext';

describe('assistant ACP context mapping', () => {
  it('maps assistant file and selected elements to an ACP context bundle', () => {
    const bundle = mapAssistantContextToAcpContextBundle({
      version: '1',
      systemContext: '',
      currentFile: {
        path: 'src/prototypes/home/index.tsx',
        displayName: 'Home',
      },
      selectedElements: [
        {
          tag: 'button',
          selector: '#save',
          label: '保存按钮',
        },
      ],
      extensions: {
        source: 'axhub-runtime',
      },
    }, new Date('2026-06-02T10:00:00.000Z'));

    expect(bundle).toEqual({
      version: '2',
      updatedAt: '2026-06-02T10:00:00.000Z',
      items: [
        {
          kind: 'file',
          id: 'axhub:file:src/prototypes/home/index.tsx',
          hidden: true,
          pinned: true,
          path: 'src/prototypes/home/index.tsx',
          name: 'Home',
          metadata: {
            source: 'axhub-runtime',
          },
        },
        {
          kind: 'annotation',
          id: 'axhub:selected-element:src/prototypes/home/index.tsx:%23save',
          body: '保存按钮',
          target: {
            type: 'web-element',
            selector: '#save',
            label: '保存按钮',
          },
          title: 'button',
          source: 'axhub-runtime',
          metadata: {
            filePath: 'src/prototypes/home/index.tsx',
            selector: '#save',
            tag: 'button',
          },
        },
      ],
    });
  });

  it('builds ACP replace/add postMessage envelopes instead of legacy update_context messages', () => {
    const message = buildAcpContextPostMessage({
      version: '1',
      systemContext: '',
      currentFile: 'src/prototypes/home/index.tsx',
      selectedElements: [],
    }, 'replace', 'request-1', new Date('2026-06-02T10:00:00.000Z'));

    expect(message).toEqual({
      type: 'acp.context.replace',
      requestId: 'request-1',
      payload: {
        items: [
          {
            kind: 'file',
            id: 'axhub:file:src/prototypes/home/index.tsx',
            hidden: true,
            pinned: true,
            path: 'src/prototypes/home/index.tsx',
            name: 'home',
            metadata: {
              source: 'axhub-runtime',
            },
          },
        ],
        messageFilter: 'snapshot',
      },
    });
    expect(JSON.stringify(message)).not.toContain('update_context');
  });

  it('builds ACP theme set postMessage envelopes from Make dark mode state', () => {
    expect(buildAcpThemePostMessage(true)).toEqual({
      type: 'acp.theme.set',
      payload: {
        theme: 'dark',
      },
    });
    expect(buildAcpThemePostMessage(false, 'theme-sync-1')).toEqual({
      type: 'acp.theme.set',
      requestId: 'theme-sync-1',
      payload: {
        theme: 'light',
      },
    });
  });

  it('maps selected canvas elements without annotations to stable ACP annotation items', () => {
    const bundle = mapAssistantContextToAcpContextBundle({
      version: '1',
      systemContext: '',
      currentFile: {
        path: 'src/resources/flows/home.excalidraw',
        displayName: 'Home Canvas',
      },
      selectedElements: [],
      extensions: {
        source: 'axhub-runtime',
        comments: [
          {
            id: 'axhub:canvas-annotation:rect-1',
            body: '',
            origin: 'canvas',
            target: {
              filePath: 'src/resources/flows/home.excalidraw',
              elementId: 'rect-1',
              elementType: 'rectangle',
            },
            preview: '主按钮',
          },
        ],
      },
    }, new Date('2026-06-02T10:00:00.000Z'));

    expect(bundle.items).toContainEqual({
      kind: 'annotation',
      id: 'axhub:canvas-annotation:rect-1',
      body: '主按钮',
      target: {
        type: 'canvas-element',
        filePath: 'src/resources/flows/home.excalidraw',
        elementId: 'rect-1',
        elementType: 'rectangle',
        label: '主按钮',
      },
      title: '主按钮',
      source: 'axhub-runtime',
      metadata: {
        filePath: 'src/resources/flows/home.excalidraw',
        elementId: 'rect-1',
        elementType: 'rectangle',
      },
    });
  });

  it('keeps canvas annotation ids stable while replacing body with the latest annotation text', () => {
    const buildContext = (body: string) => ({
      version: '1' as const,
      systemContext: '',
      currentFile: 'src/resources/flows/home.excalidraw',
      selectedElements: [],
      extensions: {
        comments: [
          {
            id: 'axhub:canvas-annotation:rect-1',
            body,
            origin: 'canvas',
            target: {
              filePath: 'src/resources/flows/home.excalidraw',
              elementId: 'rect-1',
              elementType: 'rectangle',
            },
            preview: '主按钮',
          },
        ],
      },
    });

    const before = mapAssistantContextToAcpContextBundle(buildContext('改成主 CTA'));
    const after = mapAssistantContextToAcpContextBundle(buildContext('改成品牌色主 CTA'));
    const beforeAnnotation = before.items.find((item) => item.kind === 'annotation' && item.id === 'axhub:canvas-annotation:rect-1');
    const afterAnnotation = after.items.find((item) => item.kind === 'annotation' && item.id === 'axhub:canvas-annotation:rect-1');

    expect(beforeAnnotation?.id).toBe(afterAnnotation?.id);
    expect(beforeAnnotation).toMatchObject({
      body: '改成主 CTA',
    });
    expect(afterAnnotation).toMatchObject({
      body: '改成品牌色主 CTA',
    });
  });

  it('merges canvas generation pasted context bundle and local context refs into ACP context', () => {
    const bundle = mapAssistantContextToAcpContextBundle({
      version: '1',
      systemContext: '',
      currentFile: {
        path: 'src/resources/product-canvas.excalidraw',
        displayName: 'Product Canvas',
      },
      selectedElements: [],
      extensions: {
        canvasAiGeneration: {
          contextBundle: {
            version: '2',
            items: [
              {
                kind: 'file',
                id: 'axhub:pasted-resource:brief',
                path: 'src/resources/brief.md',
                name: 'Brief',
                metadata: {
                  source: 'composer',
                },
              },
            ],
            updatedAt: '2026-06-02T09:00:00.000Z',
          },
          localContextRefs: [
            {
              resourceType: 'doc',
              resourceId: 'requirements/product-brief.md',
              title: 'Product Brief',
              paths: ['src/resources/requirements/product-brief.md'],
            },
          ],
        },
      },
    }, new Date('2026-06-02T10:00:00.000Z'));

    expect(bundle.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'file',
        id: 'axhub:pasted-resource:brief',
        path: 'src/resources/brief.md',
        name: 'Brief',
      }),
      expect.objectContaining({
        kind: 'file',
        id: 'axhub:canvas-local-context:doc:requirements/product-brief.md:src/resources/requirements/product-brief.md',
        path: 'src/resources/requirements/product-brief.md',
        name: 'Product Brief',
        metadata: expect.objectContaining({
          source: 'axhub-make-canvas',
          resourceType: 'doc',
          resourceId: 'requirements/product-brief.md',
        }),
      }),
    ]));
  });

  it('builds ACP image generation configure messages from complete Make AI settings', () => {
    const message = buildAcpImageGenerationPostMessage({
      baseUrl: ' https://api.images.example.com/v1/ ',
      apiKey: ' sk-image ',
      model: ' gpt-image-2 ',
    }, 'image-config-1');

    expect(message).toEqual({
      type: 'acp.runtime.configure',
      requestId: 'image-config-1',
      payload: {
        merge: true,
        builtinTools: ['image-generation'],
        builtinToolSettings: {
          'image-generation': {
            baseUrl: 'https://api.images.example.com/v1',
            apiKey: 'sk-image',
            model: 'gpt-image-2',
          },
        },
      },
    });
    expect(JSON.stringify(message)).not.toContain('acp.tool.imageGeneration');
    expect(JSON.stringify(message)).not.toContain('"imageGeneration"');
  });

  it('includes the transient image playground save directory in config and sync signatures', () => {
    const baseConfig = {
      baseUrl: 'https://api.images.example.com/v1',
      apiKey: 'sk-image-secret',
      model: 'gpt-image-2',
    };

    expect(buildAcpImageGenerationPostMessage({
      ...baseConfig,
      saveDirectory: ' /workspace/src/resources/brand ',
    }, 'image-save-directory')).toEqual({
      type: 'acp.runtime.configure',
      requestId: 'image-save-directory',
      payload: {
        merge: true,
        builtinTools: ['image-generation'],
        builtinToolSettings: {
          'image-generation': {
            baseUrl: 'https://api.images.example.com/v1',
            apiKey: 'sk-image-secret',
            model: 'gpt-image-2',
            saveDirectory: '/workspace/src/resources/brand',
          },
        },
      },
    });

    const firstSignature = getAcpImageGenerationConfigSignature({
      ...baseConfig,
      saveDirectory: '/workspace/src/resources/brand',
    });
    const secondSignature = getAcpImageGenerationConfigSignature({
      ...baseConfig,
      saveDirectory: '/workspace/src/resources/research',
    });
    expect(firstSignature).toContain('/workspace/src/resources/brand');
    expect(firstSignature).not.toContain('sk-image-secret');
    expect(firstSignature).not.toEqual(secondSignature);
  });

  it('builds ACP image generation clear messages when Make AI settings are incomplete', () => {
    expect(buildAcpImageGenerationPostMessage({
      baseUrl: 'https://api.images.example.com/v1',
      apiKey: '',
      model: 'gpt-image-2',
    }, 'image-config-clear')).toEqual({
      type: 'acp.runtime.clear',
      requestId: 'image-config-clear',
      payload: {
        fields: ['builtinTools', 'builtinToolSettings'],
      },
    });
    expect(buildAcpImageGenerationPostMessage(null)).toEqual({
      type: 'acp.runtime.clear',
      payload: {
        fields: ['builtinTools', 'builtinToolSettings'],
      },
    });
  });

  it('does not retain plain image generation API keys in config sync signatures', () => {
    const firstSignature = getAcpImageGenerationConfigSignature({
      baseUrl: 'https://api.images.example.com/v1',
      apiKey: 'sk-image-secret-one',
      model: 'gpt-image-2',
    });
    const secondSignature = getAcpImageGenerationConfigSignature({
      baseUrl: 'https://api.images.example.com/v1',
      apiKey: 'sk-image-secret-two',
      model: 'gpt-image-2',
    });

    expect(firstSignature).not.toContain('sk-image-secret-one');
    expect(secondSignature).not.toContain('sk-image-secret-two');
    expect(firstSignature).toContain('acp.runtime.configure');
    expect(firstSignature).toContain('image-generation');
    expect(firstSignature).not.toContain('acp.tool.imageGeneration');
    expect(firstSignature).not.toContain('"imageGeneration"');
    expect(firstSignature).not.toEqual(secondSignature);
  });

  it('builds transient ACP runtime MCP config for the Make preview endpoint', () => {
    const message = buildAcpPreviewMcpPostMessage({
      makeOrigin: ' http://localhost:5174/ ',
      previewToken: ' preview-secret ',
      previewBridgeClientId: ' preview-2 ',
      includeCanvas: false,
      canvasToken: ' canvas-secret ',
    }, 'preview-mcp-1');

    expect(message).toEqual({
      type: 'acp.runtime.configure',
      requestId: 'preview-mcp-1',
      payload: {
        merge: false,
        mcpServers: [{
          name: 'axhub-preview',
          type: 'http',
          url: 'http://localhost:5174/api/mcp/axhub-preview',
          headers: [{
            name: 'x-axhub-preview-mcp-token',
            value: 'preview-secret',
          }, {
            name: 'x-axhub-preview-bridge-client-id',
            value: 'preview-2',
          }],
        }],
      },
    });
  });

  it('adds the opt-in voice tool capability only to a requested direct run', () => {
    const servers = buildAcpPreviewMcpServers({
      makeOrigin: 'http://localhost:5174',
      previewToken: 'preview-secret',
      previewBridgeClientId: 'preview-voice',
      voiceTools: true,
    }) as any[];

    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      name: 'axhub-preview',
      headers: expect.arrayContaining([
        { name: 'x-axhub-preview-mcp-token', value: 'preview-secret' },
        { name: 'x-axhub-preview-bridge-client-id', value: 'preview-voice' },
        { name: 'x-axhub-preview-voice-tools', value: '1' },
      ]),
    });
  });

  it('adds the canvas MCP endpoint when the current assistant context is a canvas', () => {
    const message = buildAcpPreviewMcpPostMessage({
      makeOrigin: ' http://localhost:5174/ ',
      previewToken: ' preview-secret ',
      includeCanvas: true,
      canvasToken: ' canvas-secret ',
    }, 'combined-mcp-1');

    expect(message).toEqual({
      type: 'acp.runtime.configure',
      requestId: 'combined-mcp-1',
      payload: {
        merge: false,
        mcpServers: [
          {
            name: 'axhub-preview',
            type: 'http',
            url: 'http://localhost:5174/api/mcp/axhub-preview',
            headers: [{
              name: 'x-axhub-preview-mcp-token',
              value: 'preview-secret',
            }],
          },
          {
            name: 'axhub-canvas',
            type: 'http',
            url: 'http://localhost:5174/api/mcp/axhub-canvas',
            headers: [{
              name: 'x-axhub-canvas-mcp-token',
              value: 'canvas-secret',
            }],
          },
        ],
      },
    });
  });

  it('keeps the legacy canvas MCP builder as a canvas-only wrapper', () => {
    const message = buildAcpCanvasMcpPostMessage({
      makeOrigin: ' http://localhost:5174/ ',
      token: ' canvas-secret ',
    }, 'canvas-mcp-1');

    expect(message).toMatchObject({
      type: 'acp.runtime.configure',
      requestId: 'canvas-mcp-1',
      payload: {
        mcpServers: [{
          name: 'axhub-canvas',
        }],
      },
    });
  });

  it('builds reusable canvas MCP server definitions for direct API runs', () => {
    expect(buildAcpCanvasMcpServers({
      makeOrigin: ' http://localhost:5174/ ',
      token: ' canvas-secret ',
    })).toEqual([{
      name: 'axhub-canvas',
      type: 'http',
      url: 'http://localhost:5174/api/mcp/axhub-canvas',
      headers: [{
        name: 'x-axhub-canvas-mcp-token',
        value: 'canvas-secret',
      }],
    }]);
  });

  it('builds ACP runtime MCP clear messages when preview MCP details are unavailable', () => {
    expect(buildAcpPreviewMcpPostMessage({
      makeOrigin: 'http://localhost:5174',
      previewToken: '',
      includeCanvas: true,
      canvasToken: 'canvas-secret',
    }, 'preview-mcp-clear')).toEqual({
      type: 'acp.runtime.clear',
      requestId: 'preview-mcp-clear',
      payload: {
        fields: ['mcpServers'],
      },
    });
  });

  it('does not retain preview or canvas MCP tokens in config sync signatures', () => {
    const signature = getAcpPreviewMcpConfigSignature({
      makeOrigin: 'http://localhost:5174',
      previewToken: 'preview-secret',
      previewBridgeClientId: 'preview-2',
      includeCanvas: true,
      canvasToken: 'canvas-secret',
    });

    expect(signature).toContain('axhub-preview');
    expect(signature).toContain('x-axhub-preview-mcp-token');
    expect(signature).toContain('x-axhub-preview-bridge-client-id');
    expect(signature).toContain('preview-2');
    expect(signature).toContain('axhub-canvas');
    expect(signature).toContain('x-axhub-canvas-mcp-token');
    expect(signature).not.toContain('preview-secret');
    expect(signature).not.toContain('canvas-secret');
  });

  it('keeps the legacy canvas MCP signature redacted', () => {
    const signature = getAcpCanvasMcpConfigSignature({
      makeOrigin: 'http://localhost:5174',
      token: 'canvas-secret',
    });

    expect(signature).toContain('axhub-canvas');
    expect(signature).not.toContain('canvas-secret');
  });
});
