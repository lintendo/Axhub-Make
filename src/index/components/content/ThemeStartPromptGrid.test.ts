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
  it('fills the theme composer when a card is selected', async () => {
    const selectPrompt = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ThemeStartPromptGrid, {
        cards: [{ id: 'generate', title: '普通生成', prompt: 'Create a theme.', icon: TestIcon }],
        disabled: false,
        selectPrompt,
        onCopyPrompt: vi.fn(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': '普通生成' }).props.onClick();
    });

    expect(selectPrompt).toHaveBeenCalledOnce();
    expect(selectPrompt).toHaveBeenCalledWith('Create a theme.');
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

  it('keeps the local-AI copy action available while card selection is disabled', async () => {
    const selectPrompt = vi.fn();
    const onCopyPrompt = vi.fn();
    const TestIcon = () => React.createElement('svg');
    const card = { id: 'generate', title: '普通生成', prompt: 'Create a theme.', icon: TestIcon };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(ThemeStartPromptGrid, {
        cards: [card],
        disabled: true,
        selectPrompt,
        onCopyPrompt,
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
