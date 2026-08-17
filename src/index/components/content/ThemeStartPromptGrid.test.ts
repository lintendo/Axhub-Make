import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ThemeStartPromptGrid } from './ThemeStartPromptGrid';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

describe('theme start prompt grid', () => {
  it('uses a supplied accessible label for prototype capability cards', async () => {
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ThemeStartPromptGrid, {
        cards: [{ id: 'prd', title: '根据 PRD 生成原型', prompt: '根据 PRD 生成原型。', icon: TestIcon }],
        ariaLabel: '原型生成能力',
        disabled: false,
        selectPrompt: vi.fn(),
        onCopyPrompt: vi.fn(),
      }));
    });

    expect(renderer!.root.findByProps({ 'aria-label': '原型生成能力' })).toBeTruthy();
  });

  it('copies the prompt when a card is selected in the start guide', async () => {
    const selectPrompt = vi.fn();
    const onCopyPrompt = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ThemeStartPromptGrid, {
        cards: [{ id: 'generate', title: '普通生成', prompt: 'Create a theme.', icon: TestIcon }],
        disabled: false,
        copyOnSelect: true,
        selectPrompt,
        onCopyPrompt,
        onExecutePrompt: vi.fn(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': '普通生成' }).props.onClick();
    });

    expect(onCopyPrompt).toHaveBeenCalledOnce();
    expect(onCopyPrompt).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Create a theme.' }));
    expect(selectPrompt).not.toHaveBeenCalled();
  });

  it('does not fill the composer while disabled', async () => {
    const selectPrompt = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ThemeStartPromptGrid, {
        cards: [{ id: 'generate', title: '普通生成', prompt: 'Create a theme.', icon: TestIcon }],
        disabled: true,
        selectPrompt,
        onCopyPrompt: vi.fn(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': '普通生成' }).props.onClick();
    });

    expect(selectPrompt).not.toHaveBeenCalled();
  });

  it('keeps the local-AI execute action available while card selection is disabled', async () => {
    const selectPrompt = vi.fn();
    const onCopyPrompt = vi.fn();
    const onExecutePrompt = vi.fn();
    const TestIcon = () => React.createElement('svg');
    const card = { id: 'generate', title: '普通生成', prompt: 'Create a theme.', icon: TestIcon };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ThemeStartPromptGrid, {
        cards: [card],
        disabled: true,
        selectPrompt,
        onCopyPrompt,
        onExecutePrompt,
      } as any));
    });

    const executeButton = renderer!.root.findByProps({ 'aria-label': '快速执行' });
    await act(async () => {
      executeButton.props.onClick();
    });

    expect(onExecutePrompt).toHaveBeenCalledWith(card);
    expect(onCopyPrompt).not.toHaveBeenCalled();
    expect(selectPrompt).not.toHaveBeenCalled();
  });

  it('copies a prompt instead of selecting it in copy-only mode', async () => {
    const selectPrompt = vi.fn();
    const onCopyPrompt = vi.fn();
    const TestIcon = () => React.createElement('svg');
    const card = { id: 'generate', title: '普通生成', prompt: 'Create a theme.', icon: TestIcon };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ThemeStartPromptGrid, {
        cards: [card],
        disabled: false,
        copyOnSelect: true,
        selectPrompt,
        onCopyPrompt,
      }));
    });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': card.title }).props.onClick();
    });

    expect(onCopyPrompt).toHaveBeenCalledWith(card);
    expect(selectPrompt).not.toHaveBeenCalled();
  });
});
