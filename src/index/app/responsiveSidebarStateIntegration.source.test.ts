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
    expect(source).toContain('resolveResponsiveWorkspaceAvailableWidth');
    expect(source).toContain('responsiveSidebar.onDefaultCollapsedChange');
    expect(source).toContain('workspaceMetrics.onExternalAvailableWidthChange(externalAvailableWidth)');
    expect(source).toContain('workspaceRef.current.clientWidth');
    expect(source).toContain('assistantVisible: assistantPanel.visible');
    expect(source).toContain('assistantWidth: assistantPanel.width');
    expect(source).toContain('new ResizeObserver(updateWorkspaceMeasurements)');
  });

  it('routes stable workspace measurements directly to preview device state', () => {
    const indexPageSource = readSource('./IndexPage.tsx');
    const layoutSource = readSource('../components/app/IndexPageLayout.tsx');

    expect(indexPageSource).toContain('workspaceMetricsProps={{');
    expect(indexPageSource).toContain('onExternalAvailableWidthChange: preview.handlePreviewExternalWorkspaceWidthChange');
    expect(layoutSource).toContain("workspaceMetricsProps: React.ComponentProps<typeof IndexPageDesktop>['workspaceMetrics'];");
    expect(layoutSource).toContain('workspaceMetrics={workspaceMetricsProps}');
  });

  it('keeps responsive default state separate from a pinned user choice', () => {
    const source = readSource('./IndexPage.tsx');

    expect(source).toContain('const [responsiveSidebarDefaultCollapsed, setResponsiveSidebarDefaultCollapsed]');
    expect(source).toContain('const [sidebarPinnedCollapsed, setSidebarPinnedCollapsed]');
    expect(source).toContain('const [sidebarSystemCollapsed, setSidebarSystemCollapsed]');
    expect(source).toContain('resolveEffectiveSidebarCollapsed({');
    expect(source).toContain('pinnedCollapsed: sidebarPinnedCollapsed');
    expect(source).toContain('systemCollapsed: sidebarSystemCollapsed');
    expect(source).toContain('setSidebarPinnedCollapsed(');
    expect(source).not.toContain('const [collapsed, setCollapsed] = useState(false);');
  });

  it('lets an explicit sidebar choice end the temporary system collapse', () => {
    const source = readSource('./IndexPage.tsx');
    const setterSource = source.slice(
      source.indexOf('const setCollapsed = useCallback'),
      source.indexOf('const setSystemCollapsed = useCallback'),
    );

    expect(setterSource).toContain('setSidebarSystemCollapsed(null);');
    expect(setterSource.indexOf('setSidebarSystemCollapsed(null);'))
      .toBeLessThan(setterSource.indexOf('setSidebarPinnedCollapsed('));
  });

  it('adds only the manual device parameter to the current prototype deep link', () => {
    const source = readSource('./IndexPage.tsx');

    expect(source).toContain('device: preview.previewDeviceParam || undefined');
  });

  it('passes rendered review-panel visibility into stabilization ownership', () => {
    const indexPageSource = readSource('./IndexPage.tsx');
    const previewSource = readSource('./index-page/useIndexPagePreviewActions.tsx');

    expect(indexPageSource).toContain('const reviewPanelVisible = viewMode !== \'canvas\'');
    const visibilitySource = indexPageSource.slice(
      indexPageSource.indexOf('const reviewPanelVisible = viewMode'),
      indexPageSource.indexOf('const prototypeStartPageActive'),
    );
    expect(visibilitySource).not.toContain('placeholder');
    expect(indexPageSource).toContain('reviewPanelVisible,');
    expect(previewSource).toContain('reviewPanelVisible = true');
    expect(previewSource).toContain('const reviewPanelStabilizationActive = reviewPanelOpen && reviewPanelVisible;');
  });
});
