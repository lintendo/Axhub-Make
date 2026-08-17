import { describe, expect, it } from 'vitest';

import { applyGenerationArtifactsToCanvasElements as applyProjectArtifacts } from './canvasArtifactInsertion';

function applyGenerationArtifactsToCanvasElements(
  options: Omit<Parameters<typeof applyProjectArtifacts>[0], 'projectId'> & { projectId?: string },
) {
  return applyProjectArtifacts({ ...options, projectId: options.projectId || 'client-project' });
}
import type { GenerationArtifactRecord } from './generationArtifactHistoryStore';

function artifact(overrides: Partial<GenerationArtifactRecord> = {}): GenerationArtifactRecord {
  const id = overrides.id || 'artifact-1';
  return {
    id,
    kind: 'document',
    operation: 'created',
    title: 'Spec.md',
    prompt: '',
    source: {},
    target: { path: 'src/resources/spec.md', uri: '/?doc=spec.md' },
    createdAt: 1,
    updatedAt: 1,
    status: 'done',
    metadata: {},
    ...overrides,
  };
}

describe('canvas artifact insertion helper', () => {
  it('inserts multiple artifacts horizontally in the visible canvas area', () => {
    const result = applyGenerationArtifactsToCanvasElements({
      projectId: 'client-project',
      elements: [],
      appState: {
        scrollX: -100,
        scrollY: -200,
        width: 1200,
        height: 800,
        zoom: { value: 1 },
      },
      artifacts: [
        artifact({ id: 'artifact-1', title: 'Spec A', target: { uri: '/?doc=a.md' } }),
        artifact({ id: 'artifact-2', title: 'Spec B', target: { uri: '/?doc=b.md' } }),
      ],
    });

    expect(result.insertedElementIds).toHaveLength(2);
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0]).toMatchObject({
      type: 'embeddable',
      x: 340,
      y: 360,
      link: '/?doc=a.md',
      customData: {
        title: 'Spec A',
        sourceArtifactId: 'artifact-1',
        generatedBy: 'axhub-ai-generation',
      },
    });
    expect(result.elements[1]).toMatchObject({
      type: 'embeddable',
      x: result.elements[0].x + result.elements[0].width + 24,
      y: result.elements[0].y,
      link: '/?doc=b.md',
      customData: {
        title: 'Spec B',
        sourceArtifactId: 'artifact-2',
      },
    });
  });

  it('updates an existing element with the same sourceArtifactId instead of duplicating', () => {
    const first = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({ id: 'artifact-1', title: 'Draft', target: { uri: '/?doc=draft.md' } })],
    });
    const updated = applyGenerationArtifactsToCanvasElements({
      elements: first.elements,
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-1',
        operation: 'updated',
        title: 'Final',
        target: { uri: '/?doc=final.md' },
      })],
    });

    expect(updated.elements).toHaveLength(1);
    expect(updated.updatedElementIds).toEqual([first.elements[0].id]);
    expect(updated.elements[0]).toMatchObject({
      id: first.elements[0].id,
      link: '/?doc=final.md',
      customData: {
        title: 'Final',
        sourceArtifactId: 'artifact-1',
      },
    });
  });

  it('can force history insertions to create a fresh canvas node even when the artifact already exists', () => {
    const first = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({ id: 'artifact-1', title: 'Spec', target: { uri: '/?doc=spec.md' } })],
    });
    const insertedAgain = applyGenerationArtifactsToCanvasElements({
      elements: first.elements,
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({ id: 'artifact-1', title: 'Spec', target: { uri: '/?doc=spec.md' } })],
      forceInsert: true,
    });

    expect(insertedAgain.elements).toHaveLength(2);
    expect(insertedAgain.updatedElementIds).toEqual([]);
    expect(insertedAgain.insertedElementIds).toHaveLength(1);
    expect(insertedAgain.elements[1]).toMatchObject({
      type: 'embeddable',
      link: '/?doc=spec.md',
      customData: {
        title: 'Spec',
        sourceArtifactId: 'artifact-1',
        artifactResourceKey: 'document:spec.md',
      },
    });
    expect(insertedAgain.elements[1].id).not.toBe(first.elements[0].id);
  });

  it('uses the first artifact to replace the canvas direct annotation task node', () => {
    const taskElement = {
      id: 'canvas-direct-run-task',
      type: 'rectangle',
      x: 220,
      y: 180,
      width: 420,
      height: 156,
      isDeleted: false,
      customData: {
        annotation: '状态：AI 正在生成页面',
        annotationTaskRef: {
          kind: 'canvas-ai-direct',
          status: 'running',
          statusTaskId: 'canvas-direct-run-task',
        },
      },
    };
    const result = applyGenerationArtifactsToCanvasElements({
      elements: [taskElement],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({ id: 'artifact-1', title: 'Generated Spec', target: { uri: '/?doc=generated.md' } })],
      replaceElementId: 'canvas-direct-run-task',
    });

    expect(result.insertedElementIds).toHaveLength(1);
    expect(result.elements.find((element) => element.id === 'canvas-direct-run-task')).toMatchObject({
      isDeleted: true,
    });
    const inserted = result.elements.find((element) => element.id === result.insertedElementIds[0]);
    expect(inserted).toMatchObject({
      type: 'embeddable',
      x: 220,
      y: 180,
      link: '/?doc=generated.md',
      customData: {
        title: 'Generated Spec',
        sourceArtifactId: 'artifact-1',
      },
    });
  });

  it('updates the same prototype page by resource identity instead of duplicating when artifact ids change', () => {
    const first = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-proto-a',
        kind: 'prototype',
        title: 'Home v1',
        target: { path: 'src/prototypes/home/index.tsx' },
      })],
    });
    const updated = applyGenerationArtifactsToCanvasElements({
      elements: first.elements,
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-proto-b',
        kind: 'prototype',
        operation: 'updated',
        title: 'Home v2',
        target: { path: 'src/prototypes/home/pages/detail.tsx' },
      })],
    });

    expect(updated.elements).toHaveLength(1);
    expect(updated.updatedElementIds).toEqual([first.elements[0].id]);
    expect(updated.elements[0]).toMatchObject({
      id: first.elements[0].id,
      type: 'embeddable',
      customData: {
        title: 'Home v2',
        resourceType: 'preview',
        sourceResourceType: 'prototype',
        resourceId: 'home',
        previewKind: 'web',
        embedViewMode: 'preview',
        embedContentScale: 0.5,
        captureScreenshotOnMount: true,
        artifactResourceKey: 'prototype:home',
        sourceArtifactId: 'artifact-proto-b',
      },
    });
  });

  it('updates the same prototype page by path identity even when target artifact ids change', () => {
    const first = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-proto-target-a',
        kind: 'prototype',
        title: 'Home target A',
        target: {
          path: 'src/prototypes/home/index.tsx',
          artifactId: 'target-a',
          targetArtifactId: 'target-a',
        },
      })],
    });
    const updated = applyGenerationArtifactsToCanvasElements({
      elements: first.elements,
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-proto-target-b',
        kind: 'prototype',
        operation: 'updated',
        title: 'Home target B',
        target: {
          path: 'src/prototypes/home/pages/detail.tsx',
          artifactId: 'target-b',
          targetArtifactId: 'target-b',
        },
      })],
    });

    expect(updated.elements).toHaveLength(1);
    expect(updated.updatedElementIds).toEqual([first.elements[0].id]);
    expect(updated.elements[0]).toMatchObject({
      id: first.elements[0].id,
      customData: {
        resourceId: 'home',
        artifactResourceKey: 'prototype:home',
        sourceArtifactId: 'artifact-proto-target-b',
      },
    });
  });

  it('updates the same document file by resource identity instead of duplicating when artifact ids change', () => {
    const first = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-doc-a',
        title: 'Brief v1',
        target: { path: 'src/resources/brief.md' },
      })],
    });
    const updated = applyGenerationArtifactsToCanvasElements({
      elements: first.elements,
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-doc-b',
        operation: 'updated',
        title: 'Brief v2',
        target: { path: 'src/resources/brief.md' },
      })],
    });

    expect(updated.elements).toHaveLength(1);
    expect(updated.updatedElementIds).toEqual([first.elements[0].id]);
    expect(updated.elements[0]).toMatchObject({
      id: first.elements[0].id,
      type: 'embeddable',
      customData: {
        type: 'axhub-doc',
        title: 'Brief v2',
        resourceType: 'preview',
        sourceResourceType: 'doc',
        resourceId: 'brief.md',
        previewKind: 'doc',
        embedViewMode: 'preview',
        artifactResourceKey: 'document:brief.md',
        sourceArtifactId: 'artifact-doc-b',
      },
    });
  });

  it('inserts prototype spec markdown artifacts as document embeds', () => {
    const result = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-prototype-spec-doc',
        kind: 'document',
        title: 'Supply Chain Spec',
        target: { path: 'src/prototypes/erp-home/.spec/2026-06-10-supply-chain-home.md' },
      })],
    });

    expect(result.insertedElementIds).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({
      type: 'embeddable',
      link: '/api/markdown-file?path=src%2Fprototypes%2Ferp-home%2F.spec%2F2026-06-10-supply-chain-home.md&projectId=client-project',
      customData: {
        type: 'axhub-doc',
        title: 'Supply Chain Spec',
        resourceType: 'preview',
        sourceResourceType: 'doc',
        resourceId: 'src/prototypes/erp-home/.spec/2026-06-10-supply-chain-home.md',
        previewKind: 'doc',
        embedViewMode: 'preview',
        artifactResourceKey: 'document:src/prototypes/erp-home/.spec/2026-06-10-supply-chain-home.md',
        sourceArtifactId: 'artifact-prototype-spec-doc',
        projectId: 'client-project',
      },
    });
    expect(result.elements[0].customData).not.toHaveProperty('embedContentScale');
    expect(result.elements[0].customData).not.toHaveProperty('captureScreenshotOnMount');
  });

  it('ignores stale prototype resource keys on reclassified document artifacts', () => {
    const result = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-reclassified-doc',
        kind: 'document',
        title: 'Reclassified Spec',
        target: { path: 'src/prototypes/erp-home/.spec/supply-chain.md' },
        metadata: { artifactResourceKey: 'prototype:erp-home' },
      })],
    });

    expect(result.elements[0].customData).toMatchObject({
      type: 'axhub-doc',
      resourceType: 'preview',
      sourceResourceType: 'doc',
      resourceId: 'src/prototypes/erp-home/.spec/supply-chain.md',
      artifactResourceKey: 'document:src/prototypes/erp-home/.spec/supply-chain.md',
    });
  });

  it('inserts image artifacts as image nodes with file data', () => {
    const result = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-image-a',
        kind: 'image',
        title: 'Cover image',
        target: {
          path: 'src/resources/covers/home.png',
          uri: 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',
        },
        metadata: { mimeType: 'image/svg+xml' },
      })],
    });

    expect(result.insertedElementIds).toHaveLength(1);
    expect(result.files).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({
      type: 'image',
      fileId: result.files?.[0].id,
      customData: {
        title: 'Cover image',
        previewKind: 'image',
        artifactResourceKey: 'image:covers/home.png',
        sourceArtifactId: 'artifact-image-a',
        aiArtifact: expect.objectContaining({
          kind: 'image',
        }),
      },
    });
  });

  it('does not persist bare image MIME headers as canvas image file data', () => {
    const result = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-image-empty-data-url',
        kind: 'image',
        title: 'Broken image header',
        target: {
          path: 'src/resources/covers/missing.png',
          uri: 'data:image/svg+xml',
        },
      })],
    });

    expect(result.files?.[0].dataURL).toMatch(/^data:image\/svg\+xml;base64,/u);
    expect(result.files?.[0].dataURL).not.toBe('data:image/svg+xml');
  });

  it('inserts and updates Drawio artifacts as Drawio image nodes with stable resource identity', () => {
    const first = applyGenerationArtifactsToCanvasElements({
      elements: [],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-drawio-a',
        kind: 'drawio',
        title: 'Flow v1',
        target: { path: 'src/resources/flows/onboarding.drawio.svg' },
        metadata: { mimeType: 'image/svg+xml' },
      })],
    });

    expect(first.insertedElementIds).toHaveLength(1);
    expect(first.files).toHaveLength(1);
    expect(first.elements[0]).toMatchObject({
      type: 'image',
      fileId: first.files?.[0].id,
      width: 720,
      height: 480,
      status: 'saved',
      customData: {
        type: 'axhub-drawio',
        title: 'Flow v1',
        previewKind: 'drawio',
        resourceType: 'preview',
        sourceResourceType: 'doc',
        resourceId: 'flows/onboarding.drawio.svg',
        artifactResourceKey: 'drawio:flows/onboarding.drawio.svg',
        sourceArtifactId: 'artifact-drawio-a',
        aiArtifact: expect.objectContaining({
          kind: 'drawio',
        }),
      },
    });

    const updated = applyGenerationArtifactsToCanvasElements({
      elements: first.elements,
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact({
        id: 'artifact-drawio-b',
        kind: 'drawio',
        operation: 'updated',
        title: 'Flow v2',
        target: { path: 'src/resources/flows/onboarding.drawio.svg' },
        metadata: { mimeType: 'image/svg+xml' },
      })],
    });

    expect(updated.elements).toHaveLength(1);
    expect(updated.updatedElementIds).toEqual([first.elements[0].id]);
    expect(updated.elements[0]).toMatchObject({
      id: first.elements[0].id,
      customData: {
        type: 'axhub-drawio',
        title: 'Flow v2',
        previewKind: 'drawio',
        artifactResourceKey: 'drawio:flows/onboarding.drawio.svg',
        sourceArtifactId: 'artifact-drawio-b',
      },
    });
  });

  it('finds a nearby free row when the first visible position is occupied', () => {
    const blocker = {
      id: 'blocker',
      type: 'rectangle',
      x: 140,
      y: 110,
      width: 720,
      height: 480,
      isDeleted: false,
    };
    const result = applyGenerationArtifactsToCanvasElements({
      elements: [blocker],
      appState: { scrollX: 0, scrollY: 0, width: 1000, height: 700, zoom: { value: 1 } },
      artifacts: [artifact()],
    });

    expect(result.elements).toHaveLength(2);
    expect(result.elements[1].x).toBe(140);
    expect(result.elements[1].y).toBe(blocker.y + blocker.height + 24);
  });
});
