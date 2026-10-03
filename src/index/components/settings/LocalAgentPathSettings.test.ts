import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { LocalAgentPathSettings } from './LocalAgentPathSettings';

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (predicate(node)) return node;
  return findElement((node.props as { children?: ReactNode }).children, predicate);
}

describe('LocalAgentPathSettings', () => {
  it('keeps the path guidance in the label hint instead of a duplicate description', () => {
    const source = readFileSync(resolve(__dirname, './LocalAgentPathSettings.tsx'), 'utf8');

    expect(source).toContain('<FieldLabelWithHint hint="每一项只保存一个应用和它的本地启动路径；Windows 找不到应用时可手动填写。">');
    expect(source).toContain('SETTINGS_COMPACT_CONTROL_CLASS_NAME');
    expect(source).toContain('<SettingsSectionSurface className="p-2.5">');
    expect(source).toContain('启动路径');
    expect(source).not.toContain('<FieldDescription>');
    expect(source).not.toContain('用于从 Make 打开桌面 Agent。');
    expect(source).not.toContain('用于从 Make 打开 CLI Agent；保存的路径也会用于版本检测。');
  });

  it('preserves a path entered before the desktop Agent is selected', () => {
    const onChange = vi.fn();
    const tree = LocalAgentPathSettings({
      group: 'desktop',
      options: [{
        agent: 'cursor',
        label: 'Cursor',
        stateKey: 'ide:cursor',
        pathField: 'executablePath',
      }],
      value: [{ agent: '', path: 'C:\\Program Files\\Cursor\\Cursor.exe' }],
      onChange,
    });
    const select = findElement(
      tree,
      (element) => typeof (element.props as { onValueChange?: unknown }).onValueChange === 'function',
    );

    expect(select).not.toBeNull();
    (select?.props as { onValueChange: (agent: string) => void }).onValueChange('cursor');

    expect(onChange).toHaveBeenCalledWith([
      { agent: 'cursor', path: 'C:\\Program Files\\Cursor\\Cursor.exe' },
    ]);
  });
});
