import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('responsive sidebar state integration', () => {
  it('measures the desktop workspace and accounts for the assistant panel', () => {
    const source = readSource('../components/app/IndexPageDesktop.tsx');

    expect(source).toContain('resolveResponsiveSidebarDefaultCollapsed');
    expect(source).toContain('responsiveSidebar.onDefaultCollapsedChange');
    expect(source).toContain('workspaceRef.current.clientWidth');
    expect(source).toContain('assistantVisible: assistantPanel.visible');
    expect(source).toContain('assistantWidth: assistantPanel.width');
    expect(source).toContain('new ResizeObserver(updateResponsiveSidebarDefault)');
  });

  it('keeps responsive default state separate from a pinned user choice', () => {
    const source = readSource('./IndexPage.tsx');

    expect(source).toContain('const [responsiveSidebarDefaultCollapsed, setResponsiveSidebarDefaultCollapsed]');
    expect(source).toContain('const [sidebarPinnedCollapsed, setSidebarPinnedCollapsed]');
    expect(source).toContain('resolveEffectiveSidebarCollapsed({');
    expect(source).toContain('pinnedCollapsed: sidebarPinnedCollapsed');
    expect(source).toContain('setSidebarPinnedCollapsed(');
    expect(source).not.toContain('const [collapsed, setCollapsed] = useState(false);');
  });

  it('adds only the manual device parameter to the current prototype deep link', () => {
    const source = readSource('./IndexPage.tsx');

    expect(source).toContain('device: preview.previewDeviceParam || undefined');
  });
});
