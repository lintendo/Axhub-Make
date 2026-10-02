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

    expect(source).toContain('{actionButtons}');
    expect(source).toContain('{showExportMenuButton ? exportMenuButton : null}');
    expect(source).not.toContain('ax-toolbar-adaptive-action');
  });

  it('places the prototype Git popover immediately before publish', () => {
    const source = readSource();
    const popoverSource = readFileSync(resolve(__dirname, '../PrototypeVersionPopover.tsx'), 'utf8');

    expect(source).toContain("import PrototypeVersionPopover from '../PrototypeVersionPopover';");
    expect(popoverSource).toContain('<GitBranch');
    expect(source).toContain('<PrototypeVersionPopover');
    expect(source.indexOf('<PrototypeVersionPopover')).toBeLessThan(source.indexOf('{showExportMenuButton ? exportMenuButton : null}'));
    expect(source).toContain('item={selectedItem}');
    expect(source).toContain("projectId={activeProjectId || ''}");
  });

  it('keeps toolbar controls icon-only below the small breakpoint', () => {
    const source = readSource();
    const popoverSource = readFileSync(resolve(__dirname, '../PrototypeVersionPopover.tsx'), 'utf8');

    expect(source).toContain('const toolbarTextButtonClass = "ax-presentation-toolbar-compact-button gap-1.5');
    expect(source).toContain('const toolbarPillButtonClass = "ax-presentation-toolbar-compact-button h-8 rounded-md px-3 gap-1.5 text-[12px]');
    expect(source).not.toContain('toolbarTextButtonClass = "ax-presentation-toolbar-compact-button h-7 w-7');
    expect(source).not.toContain('toolbarPillButtonClass = "ax-presentation-toolbar-compact-button h-8 w-7');
    expect(popoverSource).toContain('aria-label="版本"');
    expect(popoverSource).toContain('className="ax-presentation-toolbar-label"');
    expect(popoverSource).not.toContain('hidden md:inline');
  });

  it('keeps the right-side version and publish controls visible when center tools are wide', () => {
    const source = readSource();
    const toolbarStart = source.indexOf('<div className="ax-presentation-toolbar relative h-10');
    const toolbarSource = source.slice(toolbarStart, source.indexOf('<Dialog', toolbarStart));

    expect(toolbarSource).toContain('relative h-10 flex items-center justify-between');
    expect(toolbarSource).toContain('absolute left-1/2 top-1/2');
    expect(toolbarSource).not.toContain('flex-1 flex justify-center items-center gap-1 absolute');
    expect(toolbarSource).toContain('flex items-center justify-end gap-1.5 z-10');
  });

  it('uses the shared responsive sidebar trigger in the top toolbar', () => {
    const source = readSource();

    expect(source).toContain("import ResponsiveSidebarTriggerButton from '../sidebar/ResponsiveSidebarTriggerButton';");
    expect(source).toContain('<ResponsiveSidebarTriggerButton');
    expect(source).toContain('collapsed={collapsed}');
    expect(source).toContain('setCollapsed={setCollapsed}');
    expect(source).not.toContain('onClick={() => setCollapsed(!collapsed)}');
  });

  it('uses the toolbar container width for compact controls instead of only the viewport breakpoint', () => {
    const source = readSource();
    const styles = readFileSync(resolve(__dirname, '../../app/styles/index-page.css'), 'utf8');

    expect(source).toContain('ax-presentation-toolbar-label');
    expect(source).toContain('ax-presentation-toolbar-compact-button');
    expect(styles).toContain('container-name: presentation-toolbar;');
    expect(styles).toContain('@container presentation-toolbar (max-width: 1100px)');
    expect(styles).toContain('.ax-presentation-toolbar-label');
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
