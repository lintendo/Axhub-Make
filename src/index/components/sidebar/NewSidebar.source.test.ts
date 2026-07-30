import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readNewSidebarSource() {
  return readFileSync(resolve(__dirname, './NewSidebar.tsx'), 'utf8');
}

describe('NewSidebar chrome styles source', () => {
  it('delegates fixed and compact chrome to the responsive sidebar shell', () => {
    const source = readNewSidebarSource();

    expect(source).toContain("import ResponsiveSidebarShell from './ResponsiveSidebarShell';");
    expect(source).toContain('<ResponsiveSidebarShell collapsed={collapsed}>');
    expect(source).toContain('</ResponsiveSidebarShell>');
  });

  it('does not restart the current section when a tab change event repeats the active tab', () => {
    const source = readNewSidebarSource();
    const handlerStart = source.indexOf('const handleSidebarTabChange = (tab: SidebarTab) => {');
    const handlerEnd = source.indexOf('\n    };', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('if (tab === sidebarTab)');
    expect(handlerSource).toContain('return;');
  });
});
