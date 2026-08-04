import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ResponsiveSidebarTriggerButton source', () => {
  it('renders one button from the shared runtime trigger bindings', () => {
    const source = readFileSync(resolve(__dirname, './ResponsiveSidebarTriggerButton.tsx'), 'utf8');

    expect(source).toContain('useResponsiveSidebarTriggerBindings(');
    expect(source).toContain('if (collapsedOnly && !collapsed) return null;');
    expect(source).toContain('<Button');
    expect(source).toContain('{...bindings.buttonProps}');
    expect(source).toContain('{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}');
  });
});
