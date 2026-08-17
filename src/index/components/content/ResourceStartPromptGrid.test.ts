import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ResourceStartPromptGrid } from './ResourceStartPromptGrid';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

describe('resource start prompt grid', () => {
  it('copies a prompt instead of selecting it in copy-only mode', async () => {
    const selectPrompt = vi.fn();
    const onCopyPrompt = vi.fn();
    const onSceneChange = vi.fn();
    const onImageSizeChange = vi.fn();
    const onPrdPlanningChange = vi.fn();
    const TestIcon = () => React.createElement('svg');
    const card = {
      id: 'document',
      scene: 'document' as const,
      title: '生成产品需求文档',
      prompt: 'Create a PRD.',
      icon: TestIcon,
      prdPlanning: 'enable' as const,
    };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ResourceStartPromptGrid, {
        cards: [card],
        activeScene: 'design',
        disabled: false,
        copyOnSelect: true,
        selectPrompt,
        onCopyPrompt,
        onSceneChange,
        onImageSizeChange,
        onPrdPlanningChange,
      }));
    });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': card.title }).props.onClick();
    });

    expect(onCopyPrompt).toHaveBeenCalledWith(card);
    expect(selectPrompt).not.toHaveBeenCalled();
    expect(onSceneChange).not.toHaveBeenCalled();
    expect(onImageSizeChange).not.toHaveBeenCalled();
    expect(onPrdPlanningChange).not.toHaveBeenCalled();
  });
});
