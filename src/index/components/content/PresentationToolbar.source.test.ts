import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource() {
  return readFileSync(resolve(__dirname, './PresentationToolbar.tsx'), 'utf8');
}

function getSourceSegment(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('PresentationToolbar source', () => {
  it('uses updated Figma and Axure export menu labels', () => {
    const source = readSource();
    const exportMenuSegment = getSourceSegment(
      source,
      '<DropdownMenuContent align="end" className="w-56 text-sm">',
      '{showHtmlExportEntry ? (',
    );

    expect(exportMenuSegment).toContain('导出 Figma Make');
    expect(exportMenuSegment).toContain('导出带交互原型');
    expect(exportMenuSegment).toContain('复制可编辑原型');
    expect(exportMenuSegment).toContain('使用说明');
    expect(exportMenuSegment).not.toContain('导出 Make');
    expect(exportMenuSegment).not.toContain('导出到 Axure');
    expect(exportMenuSegment).not.toContain('复制到 RunTime 组件');
    expect(exportMenuSegment).not.toContain('复制 RunTime 组件');
    expect(exportMenuSegment).not.toContain('复制 Runtime 组件');
    expect(exportMenuSegment).not.toContain('复制 runtime 组件');
  });

  it('hides Figma Make when export is disabled and keeps the compact menu width', () => {
    const source = readSource();
    const exportMenuSegment = getSourceSegment(
      source,
      '<DropdownMenuContent align="end" className="w-56 text-sm">',
      '{showHtmlExportEntry ? (',
    );

    expect(exportMenuSegment).toContain('{showMakeExportEntry && !makeExportDisabledReason ? (');
    expect(exportMenuSegment).toContain('onClick={handleExportMake}');
    expect(exportMenuSegment).not.toContain('{makeExportDisabledReason}');
    expect(exportMenuSegment).not.toContain('w-72');
  });

  it('groups contextual actions and publish under the same adaptive visibility class', () => {
    const source = readSource();

    expect(source).toContain('ax-presentation-toolbar');
    expect(source.match(/ax-toolbar-adaptive-action/g)).toHaveLength(2);
    expect(source).toContain('{actionButtons}');
    expect(source).toContain('{showExportMenuButton ? exportMenuButton : null}');
  });

  it('reuses the toolbar sidebar icon as the compact hover and focus trigger', () => {
    const source = readSource();

    expect(source).toContain("import ResponsiveSidebarTriggerButton from '../sidebar/ResponsiveSidebarTriggerButton';");
    expect(source).toContain('<ResponsiveSidebarTriggerButton');
    expect(source).toContain('collapsed={collapsed}');
    expect(source).toContain('setCollapsed={setCollapsed}');
  });

  it('keeps pending prototype annotation entry available with a connecting tooltip', () => {
    const source = readSource();

    expect(source).toContain("quickEditRuntimeStatus === 'pending'");
    expect(source).toContain("? '正在连接批注编辑器'");
  });

  it('does not expose source open actions for resources or themes', () => {
    const source = readSource();
    const documentActions = getSourceSegment(
      source,
      'const resourceActionButtons = (() => {',
      "if (contentMode === 'theme' && selectedTheme) {",
    );
    const themeActions = getSourceSegment(
      source,
      "if (contentMode === 'theme' && selectedTheme) {",
      "if (contentMode === 'data' && selectedDataTable) {",
    );

    expect(documentActions).not.toContain('<Code2 /> 打开');
    expect(documentActions).not.toContain('canOpenMarkdownSource');
    expect(themeActions).not.toContain('<Code2 /> 打开');
    expect(themeActions).not.toContain('canOpenThemeSource');
  });
});
