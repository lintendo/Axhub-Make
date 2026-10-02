import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    React.createElement('button', props, children)
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) => (
    open
      ? React.createElement(
          'div',
          {
            'data-dialog': 'open',
            onKeyDown: (event: { key: string }) => {
              if (event.key === 'Escape') onOpenChange(false);
            },
            onMouseDown: (event: { target: unknown; currentTarget: unknown }) => {
              if (event.target === event.currentTarget) onOpenChange(false);
            },
          },
          React.createElement('button', {
            type: 'button',
            'aria-label': '关闭',
            onClick: () => onOpenChange(false),
          }, '×'),
          children,
        )
      : null
  ),
  DialogContent: ({ children }: React.PropsWithChildren) => React.createElement('section', null, children),
  DialogDescription: ({ children }: React.PropsWithChildren) => React.createElement('p', null, children),
  DialogFooter: ({ children }: React.PropsWithChildren) => React.createElement('footer', null, children),
  DialogHeader: ({ children }: React.PropsWithChildren) => React.createElement('header', null, children),
  DialogTitle: ({ children }: React.PropsWithChildren) => React.createElement('h2', null, children),
}));

import DesktopIntegrationRestartDialog from './DesktopIntegrationRestartDialog';

function renderDialog(overrides: Record<string, unknown> = {}) {
  return create(React.createElement(DesktopIntegrationRestartDialog, {
    provider: 'cursor',
    open: true,
    loading: false,
    onOpenChange: () => {},
    onRestart: () => {},
    onOpenNormally: () => {},
    ...overrides,
  }));
}

describe('DesktopIntegrationRestartDialog', () => {
  it('renders only the two approved actions and warns before restarting', () => {
    const renderer = renderDialog();
    const actionLabels = renderer.root
      .findAllByType('button')
      .map((button) => button.props['aria-label'])
      .filter((label) => label !== '关闭');

    expect(actionLabels).toEqual(['普通打开', '重启并注入']);
    expect(actionLabels).not.toContain('取消');
    const serialized = JSON.stringify(renderer.toJSON());
    expect(serialized).toContain('需要重启 ');
    expect(serialized).toContain('Cursor');
    expect(serialized).toContain('保存正在进行的工作');
  });

  it('dismisses through the dialog close affordance without running either action', () => {
    const onOpenChange = vi.fn();
    const onRestart = vi.fn();
    const onOpenNormally = vi.fn();
    const renderer = renderDialog({
      provider: 'chatgpt',
      onOpenChange,
      onRestart,
      onOpenNormally,
    });

    act(() => renderer.root.findByProps({ 'aria-label': '关闭' }).props.onClick());

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRestart).not.toHaveBeenCalled();
    expect(onOpenNormally).not.toHaveBeenCalled();
  });

  it('dismisses through Escape and backdrop without running either action', () => {
    const onOpenChange = vi.fn();
    const onRestart = vi.fn();
    const onOpenNormally = vi.fn();
    const renderer = renderDialog({ onOpenChange, onRestart, onOpenNormally });
    const dialog = renderer.root.findByProps({ 'data-dialog': 'open' });

    act(() => dialog.props.onKeyDown({ key: 'Escape' }));
    const backdrop = {};
    act(() => dialog.props.onMouseDown({ target: backdrop, currentTarget: backdrop }));

    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false);
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
    expect(onRestart).not.toHaveBeenCalled();
    expect(onOpenNormally).not.toHaveBeenCalled();
  });

  it('disables both actions while a request is pending', () => {
    const renderer = renderDialog({ loading: true });
    const actionButtons = renderer.root.findAllByType('button').filter((button) => (
      ['重启并注入', '普通打开'].includes(button.props['aria-label'])
    ));

    expect(actionButtons).toHaveLength(2);
    expect(actionButtons.every((button) => button.props.disabled)).toBe(true);
  });
});
