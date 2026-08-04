import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { StartPromptCard } from './StartPromptCard';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

describe('start prompt card', () => {
  it('does not keep the copy action visible after a pointer click leaves focus within the card', async () => {
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(StartPromptCard, {
        title: '生成设计规范',
        icon: TestIcon,
        selectionDisabled: false,
        onSelect: vi.fn(),
        onCopy: vi.fn(),
      }));
    });

    const copyButton = renderer!.root.findAllByType('button')
      .find((button) => button.props['aria-label'] === '复制提示词给本地 AI 使用')!;

    expect(copyButton.props.className).toContain('group-hover:opacity-100');
    expect(copyButton.props.className).toContain('focus-visible:opacity-100');
    expect(copyButton.props.className).not.toContain('group-focus-within:');
  });

  it('keeps card selection and local-AI copy as separate actions', async () => {
    const onSelect = vi.fn();
    const onCopy = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(StartPromptCard, {
        title: '生成设计规范',
        icon: TestIcon,
        selectionDisabled: false,
        onSelect,
        onCopy,
      }));
    });

    const buttons = renderer!.root.findAllByType('button');
    expect(buttons).toHaveLength(2);

    await act(async () => {
      buttons.find((button) => button.props['aria-label'] === '复制提示词给本地 AI 使用')!.props.onClick();
    });

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
