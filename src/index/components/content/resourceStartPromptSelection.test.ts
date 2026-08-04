import React, { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { resolveResourceStartPromptSelection } from './resourceStartPromptSelection';
import * as resourceStartPromptSelection from './resourceStartPromptSelection';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

describe('resource start prompt selection', () => {
  it('applies prompts immediately when the card already matches the active scene', () => {
    expect(resolveResourceStartPromptSelection({
      card: { scene: 'design', prompt: 'Generate an app design.' },
      activeScene: 'design',
    })).toEqual({
      type: 'apply',
      prompt: 'Generate an app design.',
    });
  });

  it('switches scenes before applying a card from another resource type', () => {
    expect(resolveResourceStartPromptSelection({
      card: { scene: 'document', prompt: 'Generate a PRD.' },
      activeScene: 'design',
    })).toEqual({
      type: 'switch-scene',
      scene: 'document',
      prompt: 'Generate a PRD.',
    });
  });

  it('merges an explicit image size without replacing other image settings', () => {
    const applyResourceStartImageSize = Reflect.get(
      resourceStartPromptSelection,
      'applyResourceStartImageSize',
    ) as ((params: Record<string, unknown>, size: string) => Record<string, unknown>) | undefined;

    expect(applyResourceStartImageSize).toBeTypeOf('function');
    expect(applyResourceStartImageSize?.({
      size: 'auto',
      quality: 'high',
      n: 4,
      output_format: 'png',
    }, '2048x1152')).toEqual({
      size: '2048x1152',
      quality: 'high',
      n: 4,
      output_format: 'png',
    });
  });

  it('routes a cross-scene card and applies its prompt after the scene changes', async () => {
    const { ResourceStartPromptGrid } = await import('./ResourceStartPromptGrid');
    const selectPrompt = vi.fn();
    const sceneChange = vi.fn();
    const TestIcon = () => React.createElement('svg');
    const cards = [
      { id: 'design', scene: 'design' as const, title: 'Design', prompt: 'Design prompt', icon: TestIcon },
      { id: 'document', scene: 'document' as const, title: 'Document', prompt: 'Document prompt', icon: TestIcon },
    ];
    function Harness() {
      const [activeScene, setActiveScene] = useState<'design' | 'document'>('design');
      return React.createElement(ResourceStartPromptGrid, {
        cards,
        activeScene,
        disabled: false,
        selectPrompt,
        onCopyPrompt: vi.fn(),
        onImageSizeChange: vi.fn(),
        onPrdPlanningChange: vi.fn(),
        onSceneChange: (scene) => {
          sceneChange(scene);
          setActiveScene(scene);
        },
      });
    }

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': 'Document' }).props.onClick();
    });

    expect(sceneChange).toHaveBeenCalledOnce();
    expect(sceneChange).toHaveBeenCalledWith('document');
    expect(selectPrompt).toHaveBeenCalledOnce();
    expect(selectPrompt).toHaveBeenCalledWith('Document prompt');
  });

  it('applies explicit image sizes from enabled design cards', async () => {
    const { ResourceStartPromptGrid } = await import('./ResourceStartPromptGrid');
    const imageSizeChange = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(ResourceStartPromptGrid, {
        cards: [
          { id: 'app', scene: 'design', title: 'APP', prompt: 'APP prompt', icon: TestIcon, imageSize: '1152x2048' },
          { id: 'dashboard', scene: 'design', title: 'Dashboard', prompt: 'Dashboard prompt', icon: TestIcon, imageSize: '2048x1152' },
        ],
        activeScene: 'design',
        disabled: false,
        selectPrompt: vi.fn(),
        onCopyPrompt: vi.fn(),
        onSceneChange: vi.fn(),
        onImageSizeChange: imageSizeChange,
        onPrdPlanningChange: vi.fn(),
      }));
    });

    for (const title of ['APP', 'Dashboard']) {
      await act(async () => {
        renderer.root.findByProps({ 'aria-label': title }).props.onClick();
      });
    }

    expect(imageSizeChange.mock.calls).toEqual([['1152x2048'], ['2048x1152']]);
  });

  it('applies only explicit PRD-planning policies from enabled cards', async () => {
    const { ResourceStartPromptGrid } = await import('./ResourceStartPromptGrid');
    const planningChange = vi.fn();
    const TestIcon = () => React.createElement('svg');
    const cards = [
      { id: 'prd', scene: 'document' as const, title: 'PRD', prompt: 'PRD prompt', icon: TestIcon, prdPlanning: 'enable' as const },
      { id: 'flow', scene: 'document' as const, title: 'Flow', prompt: 'Flow prompt', icon: TestIcon, prdPlanning: 'disable' as const },
      { id: 'design', scene: 'design' as const, title: 'Design', prompt: 'Design prompt', icon: TestIcon },
    ];
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(ResourceStartPromptGrid, {
        cards,
        activeScene: 'document',
        disabled: false,
        selectPrompt: vi.fn(),
        onCopyPrompt: vi.fn(),
        onSceneChange: vi.fn(),
        onImageSizeChange: vi.fn(),
        onPrdPlanningChange: planningChange,
      }));
    });

    for (const title of ['PRD', 'Flow', 'Design']) {
      await act(async () => {
        renderer.root.findByProps({ 'aria-label': title }).props.onClick();
      });
    }

    expect(planningChange.mock.calls).toEqual([[true], [false]]);
  });

  it('does not route or apply cards while the grid is disabled', async () => {
    const { ResourceStartPromptGrid } = await import('./ResourceStartPromptGrid');
    const selectPrompt = vi.fn();
    const sceneChange = vi.fn();
    const planningChange = vi.fn();
    const imageSizeChange = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(ResourceStartPromptGrid, {
        cards: [{ id: 'document', scene: 'document', title: 'Document', prompt: 'Document prompt', icon: TestIcon, imageSize: '2048x1152' }],
        activeScene: 'design',
        disabled: true,
        selectPrompt,
        onCopyPrompt: vi.fn(),
        onSceneChange: sceneChange,
        onImageSizeChange: imageSizeChange,
        onPrdPlanningChange: planningChange,
      }));
    });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': 'Document' }).props.onClick();
    });

    expect(sceneChange).not.toHaveBeenCalled();
    expect(selectPrompt).not.toHaveBeenCalled();
    expect(planningChange).not.toHaveBeenCalled();
    expect(imageSizeChange).not.toHaveBeenCalled();
  });

  it('keeps the local-AI copy action available while card selection is disabled', async () => {
    const { ResourceStartPromptGrid } = await import('./ResourceStartPromptGrid');
    const onCopyPrompt = vi.fn();
    const selectPrompt = vi.fn();
    const TestIcon = () => React.createElement('svg');
    const card = { id: 'document', scene: 'document' as const, title: 'Document', prompt: 'Document prompt', icon: TestIcon };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ResourceStartPromptGrid, {
        cards: [card],
        activeScene: 'document',
        disabled: true,
        selectPrompt,
        onCopyPrompt,
        onSceneChange: vi.fn(),
        onImageSizeChange: vi.fn(),
        onPrdPlanningChange: vi.fn(),
      } as any));
    });

    const copyButton = renderer!.root.findByProps({ 'aria-label': '复制提示词给本地 AI 使用' });
    await act(async () => {
      copyButton.props.onClick();
    });

    expect(onCopyPrompt).toHaveBeenCalledWith(card);
    expect(selectPrompt).not.toHaveBeenCalled();
  });
});
