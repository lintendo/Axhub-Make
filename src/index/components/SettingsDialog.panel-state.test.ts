import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lobehub/icons', () => {
  const Icon = () => React.createElement('span', { 'aria-hidden': 'true' });
  return {
    ClaudeCode: { Color: Icon },
    Codex: { Color: Icon },
    Cursor: Icon,
    DeepSeek: { Color: Icon },
    Grok: Icon,
    OpenCode: Icon,
  };
});

vi.mock('@/components/ui/sheet', () => {
  const Element = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return {
    Sheet: Element,
    SheetContent: Element,
    SheetFooter: Element,
    SheetHeader: Element,
    SheetTitle: Element,
  };
});

import SettingsDialog from './SettingsDialog';

function readPanelExpandedState(markup: string, title: string): boolean {
  const triggerMatch = Array.from(markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gu))
    .find((match) => match[2].includes(title));

  if (!triggerMatch) {
    throw new Error(`未找到设置面板：${title}`);
  }

  const expandedMatch = triggerMatch[1].match(/\baria-expanded="(true|false)"/u);
  if (!expandedMatch) {
    throw new Error(`设置面板缺少 aria-expanded：${title}`);
  }

  return expandedMatch[1] === 'true';
}

describe('SettingsDialog contextual panel state', () => {
  it('keeps unrelated panels collapsed for a voice configuration error', () => {
    const markup = renderToStaticMarkup(React.createElement(SettingsDialog, {
      open: true,
      projectId: 'project-one',
      standalone: 'ai',
      initialTab: 'ai',
      initialVoiceSection: 'voice-doubao',
      onClose: () => undefined,
    }));

    expect(readPanelExpandedState(markup, '本地 ACP 服务')).toBe(false);
    expect(readPanelExpandedState(markup, '本地 CLI Agent')).toBe(false);
  });
});
