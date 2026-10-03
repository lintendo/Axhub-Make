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
      .find((button) => button.props['aria-label'] === '快速执行')!;

    expect(copyButton.props.className).toContain('group-hover:opacity-100');
    expect(copyButton.props.className).toContain('focus-visible:opacity-100');
    expect(copyButton.props.className).not.toContain('group-focus-within:');
  });

  it('keeps card selection and local-AI copy as separate actions', async () => {
    const onSelect = vi.fn();
    const onCopy = vi.fn();
    const onExecute = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(StartPromptCard, {
        title: '生成设计规范',
        icon: TestIcon,
        selectionDisabled: false,
        onSelect,
        onCopy,
        onExecute,
      }));
    });

    const buttons = renderer!.root.findAllByType('button');
    expect(buttons).toHaveLength(2);

    await act(async () => {
      buttons.find((button) => button.props['aria-label'] === '快速执行')!.props.onClick();
    });

    expect(onExecute).toHaveBeenCalledOnce();
    expect(onCopy).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('delegates the card body action to the grid-selected default', async () => {
    const onSelect = vi.fn();
    const onCopy = vi.fn();
    const onExecute = vi.fn();
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(StartPromptCard, {
        title: '生成设计规范',
        icon: TestIcon,
        selectionDisabled: false,
        onSelect,
        onCopy,
        onExecute,
      }));
    });

    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '生成设计规范' }).props.onClick();
    });

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onCopy).not.toHaveBeenCalled();
    expect(onExecute).not.toHaveBeenCalled();
  });

  it('keeps concise capability labels visible on one line', async () => {
    const TestIcon = () => React.createElement('svg');
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(StartPromptCard, {
        title: '参考 Axure 生成原型',
        icon: TestIcon,
        selectionDisabled: false,
        onSelect: vi.fn(),
        onCopy: vi.fn(),
      }));
    });

    const cardButton = renderer!.root.findByProps({ 'aria-label': '参考 Axure 生成原型' });
    const title = cardButton.findByType('span');

    expect(cardButton.props.className).toContain('pr-10');
    expect(cardButton.props.className).not.toContain('pr-12');
    expect(title.props.className).toContain('whitespace-nowrap');
    expect(title.props.className).not.toContain('truncate');
  });
});
