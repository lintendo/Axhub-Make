import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readToolbarSource() {
  return readFileSync(resolve(__dirname, './PresentationToolbar.tsx'), 'utf8');
}

describe('PresentationToolbar cloud publishing source', () => {
  it('moves the device switcher behind the sidebar toggle as an icon-only button', () => {
    const source = readToolbarSource();
    const deviceSwitcherButtonSource = source.slice(
      source.indexOf('const deviceSwitcherButton = ('),
      source.indexOf('const shouldShowDeviceSwitcher'),
    );
    const toolbarReturnSource = source.slice(
      source.lastIndexOf('\n    return ('),
      source.indexOf('{/* Center: Tools */}'),
    );

    expect(deviceSwitcherButtonSource).toContain('aria-label="设备"');
    expect(deviceSwitcherButtonSource).toContain('edgeIconButtonClass');
    expect(deviceSwitcherButtonSource).not.toContain('<span>设备</span>');
    expect(toolbarReturnSource).toContain('{deviceSwitcher}');
  });

  it('keeps the left toolbar limited to sidebar and device controls', () => {
    const source = readToolbarSource();
    const toolbarLeftSource = source.slice(
      source.indexOf('{/* Left: Sidebar Collapse */}'),
      source.indexOf('{/* Center: Tools */}'),
    );

    expect(toolbarLeftSource).toContain('{deviceSwitcher}');
    expect(toolbarLeftSource).not.toContain('leftRefreshButton');
    expect(toolbarLeftSource).not.toContain('shouldShowLeftRefreshButton');
  });

  it('does not expose a prototype canvas entry in the preview toolbar', () => {
    const source = readToolbarSource();
    const centerToolsSource = source.slice(
      source.indexOf('{/* Center: Tools */}'),
      source.indexOf('{/* Right: Export */}'),
    );

    expect(source).not.toContain('const canvasEntryButton = (');
    expect(source).not.toContain('const shouldShowCanvasEntryButton =');
    expect(source).not.toContain('<LayoutDashboard /> 画布');
    expect(source).not.toContain('<TooltipContent>进入画布</TooltipContent>');
    expect(source).not.toContain('<LayoutDashboard /> 草稿');
    expect(source).not.toContain('<TooltipContent>进入草稿</TooltipContent>');
    expect(source).not.toContain("onClick={() => setViewMode('canvas')}");
    expect(centerToolsSource).not.toContain('shouldShowCanvasEntryButton');
    expect(centerToolsSource).not.toContain('{deviceSwitcher}');
  });

  it('uses one consistent gap between centered toolbar buttons', () => {
    const source = readToolbarSource();
    const centerToolsSource = source.slice(
      source.indexOf('{/* Center: Tools */}'),
      source.indexOf('{/* Right: Export */}'),
    );

    expect(centerToolsSource).toContain('gap-1');
    expect(centerToolsSource).not.toContain('gap-2');
  });

  it('does not render a normal preview refresh button in the top toolbar', () => {
    const source = readToolbarSource();
    const normalPreviewActionsSource = source.slice(
      source.indexOf(') : viewMode === \'canvas\' ? ('),
      source.indexOf('</>', source.indexOf(') : viewMode === \'canvas\' ? (')),
    );

    expect(source).not.toContain('const leftRefreshButton = (');
    expect(source).not.toContain('const shouldShowLeftRefreshButton =');
    expect(normalPreviewActionsSource).not.toContain('<RotateCw /> 刷新');
  });

  it('describes available prototype annotation as annotating and editing the prototype', () => {
    const source = readToolbarSource();
    const quickEditTooltipSource = source.slice(
      source.indexOf('const quickEditTooltip = isDocumentEditingContent'),
      source.indexOf('const propertyPanelDisabled = quickEditDisabled'),
    );

    expect(quickEditTooltipSource.match(/'批注和编辑原型'/g)).toHaveLength(2);
    expect(quickEditTooltipSource).not.toContain('批注后快速微调');
    expect(quickEditTooltipSource).toContain('退出快速编辑');
    expect(quickEditTooltipSource).toContain('正在连接批注编辑器');
    expect(quickEditTooltipSource).toContain('当前客户端页面尚未接入 /runtime/quick-edit.js');
  });

  it('keeps HTML prototype specs annotation-only without persistence actions', () => {
    const source = readToolbarSource();

    expect(source).toContain("const isReadOnlyHtmlPrototypeSpec = contentMode === 'prototype-spec'");
    expect(source).toContain('isQuickEditActive && !isReadOnlyHtmlPrototypeSpec');
  });

  it('keeps only the default publish action, copy URL, and platform settings visible by default', () => {
    const source = readToolbarSource();

    expect(source).toContain('<span>发布</span>');
    expect(source).toContain('云服务');
    expect(source).toContain("visibleCloudPublishTargets = ['axhub']");
    expect(source).toContain("visibleCloudPublishTargetSet.has('axhub')");
    expect(source).toContain('<Cloud className="h-3.5 w-3.5" /> 发布到 Axhub');
    expect(source).toContain('<Send className="h-3.5 w-3.5" /> 发布到对象存储');
    expect(source).toContain("visibleCloudPublishTargetSet.has('s3')");
    expect(source).toContain("visibleCloudPublishTargetSet.has('vercel')");
    expect(source).toContain("visibleCloudPublishTargetSet.has('cloudflare-pages')");
    expect(source).toContain("visibleCloudPublishTargetSet.has('github-pages')");
    expect(source).toContain('复制发布地址');
    expect((source.match(/复制发布地址/g) || []).length).toBe(1);
    expect(source).not.toContain('Vercel 最近发布地址');
    expect(source).not.toContain('Cloudflare Pages 最近发布地址');
    expect(source).not.toContain('S3 最近发布地址');
    expect(source).not.toContain('发布到 S3 对象存储');
    expect(source).toContain('<Settings2 className="h-3.5 w-3.5" /> 更多平台与设置');
    expect(source).toContain("onClick={() => handleOpenCloudPublishSettings('publish-settings')}");
  });

  it('offers separate HTML export actions with and without source files', () => {
    const source = readToolbarSource();

    expect(source).toContain('handleExportHtml({ includeSource: true })');
    expect(source).toContain('导出 HTML（含源码）');
  });

  it('wires cloud publishing menu actions through explicit target handlers', () => {
    const source = readToolbarSource();

    expect(source).toContain('currentPublishResourcePath?: string;');
    expect(source).toContain('currentPublishResourcePath = \'\',');
    expect(source).toContain("visibleCloudPublishTargets?: CloudPublishTarget[];");
    expect(source).toContain('const hasCurrentPublishResource = Boolean(currentPublishResourcePath);');
    expect(source).toContain("handlePublishCloudTarget('vercel')");
    expect(source).toContain("handlePublishCloudTarget('cloudflare-pages')");
    expect(source).toContain("handlePublishCloudTarget('s3')");
    expect(source).toContain("handlePublishCloudTarget('github-pages')");
    expect(source).toContain('handleOpenAxhubPublishDialog: () => void | Promise<void>;');
    expect(source).toContain('handleOpenAxhubPublishDialog,');
    expect(source).toContain('onClick={() => handleOpenAxhubPublishDialog()}');
    expect(source).toContain('<Cloud className="h-3.5 w-3.5" /> 发布到 Axhub');
    expect(source).toContain('handleCopyLatestCloudPublishUrl()');
    expect(source).not.toContain('handleCopyLatestCloudPublishUrl(\'vercel\')');
    expect(source).not.toContain('handleCopyLatestCloudPublishUrl(\'cloudflare-pages\')');
    expect(source).not.toContain('handleCopyLatestCloudPublishUrl(\'s3\')');
    expect(source).toContain('disabled={!hasCurrentPublishResource}');
    expect(source).toContain('disabled={!latestCloudPublishUrl || !hasCurrentPublishResource}');
    expect(source).not.toContain('disabled={!latestCloudPublishUrls.vercel}');
    expect(source).not.toContain("disabled={!latestCloudPublishUrls['cloudflare-pages']}");
    expect(source).not.toContain('disabled={!latestCloudPublishUrls.s3}');
    expect(source).toContain('handleOpenCloudPublishSettings');
  });

  it('adds a publish menu action that copies the current preview screenshot', () => {
    const source = readToolbarSource();

    expect(source).toContain('handleCopyCurrentScreenshot: () => void | Promise<void>;');
    expect(source).toContain('handleCopyCurrentScreenshot,');
    expect(source).toContain('onClick={handleCopyCurrentScreenshot}');
    expect(source).toContain('<ImageIcon className="h-3.5 w-3.5" /> 复制截图');
    const exportMenuSegment = source.slice(
      source.indexOf('const exportMenuButton = ('),
      source.indexOf('</DropdownMenuContent>', source.indexOf('const exportMenuButton = (')),
    );
    expect(exportMenuSegment).toContain('复制截图');
    expect(exportMenuSegment.indexOf('复制截图')).toBeGreaterThan(exportMenuSegment.indexOf('设置'));
  });

  it('shows only lightweight Axure and export actions for theme previews', () => {
    const source = readToolbarSource();
    const exportMenuSegment = source.slice(
      source.indexOf('const exportMenuButton = ('),
      source.indexOf('</DropdownMenuContent>', source.indexOf('const exportMenuButton = (')),
    );

    expect(source).toContain("const showMakeExportEntry = isPreviewContent && viewMode === 'demo'");
    expect(source).toContain("const showInteractiveAxureExportEntry = isPreviewContent && viewMode === 'demo'");
    expect(source).toContain('const showEditableAxureCopyEntry = Boolean(currentRuntimeExportResource);');
    expect(source).toContain('const showAxureUsageGuideEntry = showInteractiveAxureExportEntry;');
    expect(exportMenuSegment).toContain('{showInteractiveAxureExportEntry ? (');
    expect(exportMenuSegment).toContain('{showEditableAxureCopyEntry ? (');
    expect(exportMenuSegment).toContain('{showAxureUsageGuideEntry ? (');
  });

  it('keeps the publish menu available when the Agent host toolbar is visible', () => {
    const source = readToolbarSource();
    const segment = source.slice(
      source.indexOf('const showExportMenuButton ='),
      source.indexOf('const exportMenuButton ='),
    );

    expect(segment).toContain("((isPreviewContent && viewMode === 'demo') || contentMode === 'theme')");
    expect(segment).toContain('(Boolean(selectedItem) || Boolean(selectedTheme))');
    expect(segment).not.toContain('shouldShowPreviewShellActions');
  });

  it('does not render the AI open menu in the top toolbar', () => {
    const source = readToolbarSource();
    const rightToolbarSource = source.slice(
      source.indexOf('{/* Right: Export */}'),
      source.indexOf('</div>', source.indexOf('{/* Right: Export */}')),
    );

    expect(source).not.toContain("import OpenInDropdown from '../sidebar/OpenInDropdown';");
    expect(rightToolbarSource).toContain('{showExportMenuButton ? exportMenuButton : null}');
    expect(rightToolbarSource).not.toContain('<OpenInDropdown');
    expect(source).not.toContain('variant="toolbar"');
    expect(rightToolbarSource).not.toContain('onOpenAISettings');
  });
});

describe('PresentationToolbar Agent host controls source', () => {
  it('groups annotation-session tools on the left and execution actions on the right', () => {
    const source = readToolbarSource();
    const activeToolbarSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const resourceActionButtons = (() => {'),
    );

    const executionGroupStart = activeToolbarSource.indexOf(
      'data-axhub-toolbar-group="execution"',
    );
    const toolsGroupStart = activeToolbarSource.indexOf('data-axhub-toolbar-group="tools"');

    expect(toolsGroupStart).toBeGreaterThan(-1);
    expect(executionGroupStart).toBeGreaterThan(toolsGroupStart);
    expect(activeToolbarSource.slice(toolsGroupStart, executionGroupStart)).toContain(
      '{hostToolToolbarControls}',
    );
    expect(activeToolbarSource.slice(executionGroupStart)).toContain(
      '{hostExecutionToolbarControls}',
    );
    expect(activeToolbarSource.slice(executionGroupStart)).toContain(
      '{hostClearToolbarControl}',
    );
    expect(activeToolbarSource).toContain("'host-send'");
    expect(activeToolbarSource).not.toContain("'host-copy'");
    expect(activeToolbarSource).toContain('清空');
    expect(activeToolbarSource).toContain("'host-selection-mode'");
    expect(activeToolbarSource).toContain("'host-panel'");
    expect(activeToolbarSource).not.toContain(
      '<div className="h-4 w-px bg-border" aria-hidden="true" />',
    );
    expect(source).toContain(
      "const showHostPropertyPanelAction = contentMode !== 'theme' && !isDocumentCommentActive;",
    );
    expect(source).toContain(
      'const showHostPropertyPanelToolbarAction = showHostPropertyPanelAction && canShowPrototypeDecisionActions;',
    );
    expect(source).toContain(
      'const showHostPropertyPanelMenuAction = showHostPropertyPanelAction && !canShowPrototypeDecisionActions;',
    );
  });

  it('labels open-in-editor tooltips with the resolved IDE app name', () => {
    const source = readToolbarSource();

    expect(source).toContain("import { MAIN_IDE_APP_NAMES, resolveVisibleIDEPreference } from '../../../common/ide';");
    expect(source).toContain('preferredIDE?: MainIDEPreference;');
    expect(source).toContain('ideAvailability?: IDEAvailabilityMap;');
    expect(source).toContain('resolveVisibleIDEPreference(preferredIDE, ideAvailability)');
    expect(source).toContain("const openInIdeTooltip = openInIdeName ? `在 ${openInIdeName} 中打开` : '在编辑器中打开';");
    expect(source).toContain("const getOpenInIdeTooltip = (targetLabel: string) => openInIdeName ? `在 ${openInIdeName} 中打开${targetLabel}` : `在编辑器中打开${targetLabel}`;");
    expect(source).toContain('{getOpenInIdeTooltip(currentMarkdownLabel)}');
    expect(source).toContain("{getOpenInIdeTooltip('主题')}");
    expect(source).toContain("{getOpenInIdeTooltip('数据表')}");
    expect(source).not.toContain("const openInIdeTooltip = '在编辑器中打开';");
  });

  it('keeps the device switcher button radius aligned with the other toolbar buttons', () => {
    const source = readToolbarSource();

    const segment = source.slice(
      source.indexOf('const deviceSwitcherButton = ('),
      source.indexOf('const shouldShowDeviceSwitcher'),
    );

    expect(segment).toContain('edgeIconButtonClass');
    expect(segment).not.toContain('rounded-full');
  });

  it('labels the standalone and host menu entry as design decisions', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );

    expect(source).toContain("'设计决策'");
    expect(source).toContain("'关闭设计决策'");
    expect(source).toContain('<SlidersHorizontal /> 决策');
    expect(hostMoreMenuSource).toContain("{ type: 'toggle-property-panel' }");
    expect(hostMoreMenuSource).toContain('设计决策');
    expect(hostMoreMenuSource).not.toContain('执行 Agent');
    expect(hostControlsSource).toContain("'host-panel'");
    expect(hostControlsSource).toContain('showHostPropertyPanelToolbarAction');
    expect(source).not.toContain('<SlidersHorizontal /> 调整');
    expect(source).not.toContain("'属性调整'");
    expect(source).not.toContain("'关闭属性调整'");
  });

  it('uses one theme-colored checkbox presentation for target screenshots and voice', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );

    expect(source).not.toContain("import { Switch } from '@/components/ui/switch';");
    expect(hostMoreMenuSource).toContain('hostToolbarState.captureTargetScreenshotAvailable ? (');
    expect(hostMoreMenuSource).toContain('role="menuitemcheckbox"');
    expect(hostMoreMenuSource).toContain('aria-checked={hostToolbarState.captureTargetScreenshot}');
    expect(hostMoreMenuSource).not.toContain('<Switch');
    expect(hostMoreMenuSource).toContain(
      'hostToolbarState.captureTargetScreenshot\n                                        ? <Check className={hostMenuIconClass} />\n                                        : <ImageIcon className={hostMenuIconClass} />',
    );
    expect(hostMoreMenuSource).toContain("type: 'toggle-target-screenshot'");
    expect(hostMoreMenuSource).toContain(
      'enabled: !hostToolbarState.captureTargetScreenshot',
    );
    expect(hostMoreMenuSource).toContain('附带目标截图');
    expect(source).toContain(
      'const hostMenuSelectedItemClass = "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";',
    );
    expect(hostMoreMenuSource.match(/&& hostMenuSelectedItemClass/g)).toHaveLength(2);
    expect(hostMoreMenuSource).not.toContain('&& "bg-accent text-accent-foreground"');
  });

  it('keeps host design decisions available without existing decision data outside PRD annotation', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );

    expect(source).toContain('prototypeDecisionDataAvailable?: boolean;');
    expect(source).toContain('prototypeDecisionDataAvailable = false,');
    expect(source).toContain('const canShowPrototypeDecisionActions = !isPreviewContent || prototypeDecisionDataAvailable;');
    expect(source).toContain("const showHostPropertyPanelAction = contentMode !== 'theme' && !isDocumentCommentActive;");
    expect(source).toContain('const showHostPropertyPanelToolbarAction = showHostPropertyPanelAction && canShowPrototypeDecisionActions;');
    expect(source).toContain('const showHostPropertyPanelMenuAction = showHostPropertyPanelAction && !canShowPrototypeDecisionActions;');
    expect(hostMoreMenuSource).toContain('showHostPropertyPanelMenuAction ? (');
  });

  it('hides page and save menu groups only during PRD annotation', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );
    const pageGuardStart = hostMoreMenuSource.indexOf('{!prototypeAnnotationSessionActive ? (');
    const pageGuardClosing = '\n                        ) : null}';
    const pageGuardEnd = hostMoreMenuSource.indexOf(
      `${pageGuardClosing}\n                        <div role="separator" className={hostMenuSeparatorClass} />`,
      pageGuardStart,
    ) + pageGuardClosing.length;
    const pageGuardSource = hostMoreMenuSource.slice(pageGuardStart, pageGuardEnd);
    const saveGuardStart = hostMoreMenuSource.indexOf(
      '{isQuickEditActive && !isReadOnlyHtmlPrototypeSpec && !prototypeAnnotationSessionActive ? (',
    );
    const saveGuardClosing = '\n                        ) : null}';
    const saveGuardEnd = hostMoreMenuSource.indexOf(
      `${saveGuardClosing}\n                    </>`,
      saveGuardStart,
    ) + saveGuardClosing.length;
    const saveGuardSource = hostMoreMenuSource.slice(saveGuardStart, saveGuardEnd);
    const separatorSource = '<div role="separator" className={hostMenuSeparatorClass} />';
    const agentGroupIndex = hostMoreMenuSource.indexOf('<div role="group" aria-label="Agent">');
    const helpGroupIndex = hostMoreMenuSource.indexOf('<div role="group" aria-label="帮助">');

    expect(pageGuardStart).toBeGreaterThan(-1);
    expect(pageGuardEnd).toBeGreaterThan(pageGuardStart);
    expect(pageGuardSource.match(/role="separator"/g)).toHaveLength(1);
    expect(pageGuardSource).toContain(separatorSource);
    expect(pageGuardSource).toContain('<div role="group" aria-label="页面">');
    expect(pageGuardSource).toContain("type: 'toggle-property-panel'");
    expect(pageGuardSource).toContain("type: 'toggle-page-animations'");

    expect(saveGuardStart).toBeGreaterThan(pageGuardEnd);
    expect(saveGuardEnd).toBeGreaterThan(saveGuardStart);
    expect(saveGuardSource.match(/role="separator"/g)).toHaveLength(1);
    expect(saveGuardSource).toContain(separatorSource);
    expect(saveGuardSource).toContain('<div role="group" aria-label="保存">');
    expect(saveGuardSource).toContain("getQuickEditSaveMenuActionHandlers('save-text')");
    expect(saveGuardSource).toContain("getQuickEditSaveMenuActionHandlers('save-style')");

    expect(agentGroupIndex).toBeGreaterThan(-1);
    expect(agentGroupIndex).toBeLessThan(pageGuardStart);
    expect(helpGroupIndex).toBeGreaterThan(pageGuardEnd);
    expect(helpGroupIndex).toBeLessThan(saveGuardStart);
  });

  it('adds the review action after annotation and design decisions', () => {
    const source = readToolbarSource();
    const normalPreviewActionsSource = source.slice(
      source.indexOf(') : viewMode === \'canvas\' ? ('),
      source.indexOf('{contentMode === \'doc\' || contentMode === \'template\' ? ('),
    );

    expect(source).toContain('reviewPanelOpen?: boolean');
    expect(source).toContain('onReviewPanelToggle?: () => void');
    expect(source).toContain('prototypeAnnotationSessionActive?: boolean');
    expect(source).toContain('handleOpenPrototypeAnnotationSession: () => void | Promise<void>;');
    expect(source).toContain('<MapPin /> PRD 标注');
    expect(source).toContain("'使用标注需求和生成 RRD'");
    expect(source).toContain('<ListChecks /> 评审');
    expect(source).toContain("const reviewPanelTooltip = reviewPanelOpen ? '关闭评审' : '评审';");
    expect(normalPreviewActionsSource).not.toContain('<Code2 /> 打开');
    expect(normalPreviewActionsSource.indexOf('<PencilRuler /> 批注')).toBeLessThan(
      normalPreviewActionsSource.indexOf('<MapPin /> PRD 标注'),
    );
    expect(normalPreviewActionsSource.indexOf('<MapPin /> PRD 标注')).toBeLessThan(
      normalPreviewActionsSource.indexOf('<SlidersHorizontal /> 决策'),
    );
    expect(normalPreviewActionsSource.indexOf('<SlidersHorizontal /> 决策')).toBeLessThan(
      normalPreviewActionsSource.indexOf('<ListChecks /> 评审'),
    );
  });

  it('disables PRD annotation when the shared quick-edit runtime is unavailable', () => {
    const source = readToolbarSource();
    const annotationButtonStart = source.indexOf(
      'variant={prototypeAnnotationSessionActive ? "secondary" : "ghost"}',
    );
    const annotationButtonEnd = source.indexOf('</TooltipProvider>', annotationButtonStart);
    const annotationButtonSource = source.slice(annotationButtonStart, annotationButtonEnd);

    expect(annotationButtonSource).toContain(
      'disabled={quickEditDisabled || prototypeAnnotationEnableLoading}',
    );
    expect(annotationButtonSource).toContain(': quickEditDisabled');
    expect(annotationButtonSource).toContain('? quickEditTooltip');
    expect(annotationButtonSource).toContain("? '退出标注'");
    expect(annotationButtonSource).toContain("'使用标注需求和生成 RRD'");
  });

  it('uses the standard title-description dialog when a prototype has no annotations yet', () => {
    const source = readToolbarSource();
    const annotationClickSource = source.slice(
      source.indexOf('const handlePrototypeAnnotationClick = async () => {'),
      source.indexOf('const handleManualPrototypeAnnotationEnable'),
    );
    const dialogStart = source.indexOf('<Dialog\n                open={annotationEnableDialogOpen}');
    const annotationDialogSource = source.slice(dialogStart, source.indexOf('</Dialog>', dialogStart));

    expect(source).toContain('handleCheckPrototypeAnnotationEnabled: () => Promise<boolean | null>;');
    expect(annotationClickSource).toContain('await handleCheckPrototypeAnnotationEnabled()');
    expect(annotationClickSource).toContain('if (enabled === true)');
    expect(annotationClickSource).toContain('if (enabled === false)');
    expect(annotationClickSource.indexOf('await handleCheckPrototypeAnnotationEnabled()')).toBeLessThan(
      annotationClickSource.indexOf('setAnnotationEnableDialogOpen(true)'),
    );
    expect(annotationDialogSource).toContain(
      'w-[min(92vw,460px)] max-w-[460px] text-sm',
    );
    expect(annotationDialogSource).not.toContain('[&>[data-dialog-close]]:hidden');
    expect(annotationDialogSource).toContain('onOpenChange={setAnnotationEnableDialogOpen}');
    expect(annotationDialogSource).not.toContain('if (open) {');
    expect(annotationDialogSource).not.toContain('onPointerDownOutside');
    expect(annotationDialogSource).not.toContain('onEscapeKeyDown');
    expect(annotationDialogSource).toContain('<DialogTitle className="leading-6">开启 PRD 标注</DialogTitle>');
    expect(annotationDialogSource).toContain(
      '<DialogDescription className="leading-6">\n                            当前原型还没有需求标注，请选择一种方式继续。\n                        </DialogDescription>',
    );
    expect(annotationDialogSource).not.toContain('当前原型还没有需求标注。可以手动开启，或复制提示词交给 AI 根据原型和相关资料生成。');
    expect(annotationDialogSource).not.toContain('返回预览');
    expect(annotationDialogSource).toContain(
      'DialogFooter className="gap-2 sm:space-x-0"',
    );
    expect(annotationDialogSource).toContain('复制提示词');
    expect(annotationDialogSource).toContain('手动开启');
  });

  it('renders the AI execution button in the top toolbar and keeps interrupt in more menu', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );

    expect(source).toContain('showHostExecutionControls');
    expect(source).toContain('hostToolbarState.sendVisible || hostToolbarState.interruptVisible');
    expect(hostControlsSource).toContain("'host-send'");
    expect(hostControlsSource).toContain("'AI 执行'");
    expect(hostControlsSource).not.toContain("'host-interrupt'");
    expect(hostMoreMenuSource).toContain("{ type: 'interrupt-agent' }");
    expect(hostMoreMenuSource).toContain('中断执行');
    expect(hostMoreMenuSource).not.toContain('执行 Agent');
  });

  it('keeps copy prompt in the more menu instead of the top execution toolbar', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );

    expect(hostControlsSource).not.toContain("'host-copy'");
    expect(hostControlsSource).not.toContain("{ type: 'copy-prompt' }");
    expect(hostMoreMenuSource).toContain('hostToolbarState.copyPromptVisible ? (');
    expect(hostMoreMenuSource).toContain("{...getHostMenuActionHandlers({ type: 'copy-prompt' })}");
    expect(hostMoreMenuSource).toContain('<Copy className={hostMenuIconClass} /> 复制提示词');
  });

  it('lets the editor decide whether the host copy prompt action is enabled', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );

    expect(source).not.toContain('const hostToolbarHasPrompt = Boolean(');
    expect(hostMoreMenuSource).toContain('disabled={hostToolbarState.copyPromptDisabled}');
    expect(hostMoreMenuSource).not.toContain('disabled={!hostToolbarHasPrompt}');
  });

  it('labels the host more menu with ACP UI wording instead of Agent runtime wording', () => {
    const source = readToolbarSource();

    expect(source).toContain('aria-label="更多 ACP UI 操作"');
    expect(source).not.toContain('aria-label="更多 Genie 操作"');
  });

  it('uses neutral host action menu state names for ACP UI controls', () => {
    const source = readToolbarSource();

    expect(source).toContain('hostActionMenuOpen');
    expect(source).not.toContain('hostGenieMenuOpen');
    expect(source).not.toContain('hostGenieTriggerRef');
  });

  it('opens AI settings from the host more menu instead of linking the local agent directly', () => {
    const source = readToolbarSource();

    expect(source).toContain('onOpenAISettings?: () => void;');
    expect(source).toContain('onOpenAISettings,');
    expect(source).toContain('const handleOpenAISettingsFromHostMenu = React.useCallback(() => {');
    expect(source).toContain('onOpenAISettings?.();');
    expect(source).toContain('[closeHostMenus, onOpenAISettings]');
    expect(source).toContain('onClick={handleOpenAISettingsFromHostMenu}');
    expect(source).toContain('<Settings2 className={hostMenuIconClass} /> AI 设置');
    expect(source).not.toContain('hostLocalAgentConnected');
    expect(source).not.toContain("hostLocalAgentConnected ? '已链接本地 Agent' : '链接本地 Agent'");
    expect(source).not.toContain("hostLocalAgentConnected && 'text-brand hover:bg-brand/5 hover:text-brand'");
    expect(source).not.toContain("hostLocalAgentConnected ? 'disconnect-agent' : 'wake-agent'");
    expect(source).not.toContain('链接本地 Agent');
    expect(source).not.toContain('已链接本地 Agent');
    expect(source).not.toContain("'host-local-agent'");
    expect(source).not.toContain("type: 'wake-agent'");
    expect(source).not.toContain("type: 'disconnect-agent'");
  });

  it('groups host more menu actions by purpose', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );

    expect(hostMoreMenuSource).toContain('<div className={hostMenuGroupLabelClass}>Agent</div>');
    expect(hostMoreMenuSource).not.toContain('<div className={hostMenuGroupLabelClass}>标注</div>');
    expect(hostMoreMenuSource).toContain('<div className={hostMenuGroupLabelClass}>页面</div>');
    expect(hostMoreMenuSource).toContain('<div className={hostMenuGroupLabelClass}>帮助</div>');
    expect(hostMoreMenuSource).toContain('<div className={hostMenuGroupLabelClass}>保存</div>');
    expect(hostMoreMenuSource).not.toContain('<div className={hostMenuGroupLabelClass}>保存与清理</div>');
    expect(hostMoreMenuSource).not.toContain("type: 'enable-annotation'");
    expect(hostMoreMenuSource).not.toContain('开启需求标注');
    expect(hostMoreMenuSource.indexOf('<div className={hostMenuGroupLabelClass}>Agent</div>')).toBeLessThan(
      hostMoreMenuSource.indexOf('AI 设置'),
    );
    expect(hostMoreMenuSource.indexOf('AI 设置')).toBeLessThan(
      hostMoreMenuSource.indexOf('中断执行'),
    );
    expect(hostMoreMenuSource.indexOf('中断执行')).toBeLessThan(
      hostMoreMenuSource.indexOf('<div className={hostMenuGroupLabelClass}>页面</div>'),
    );
    expect(hostMoreMenuSource.indexOf('<div className={hostMenuGroupLabelClass}>页面</div>')).toBeLessThan(
      hostMoreMenuSource.indexOf("{ type: 'toggle-page-animations' }"),
    );
    expect(hostMoreMenuSource.indexOf("{ type: 'toggle-page-animations' }")).toBeLessThan(
      hostMoreMenuSource.indexOf('<div className={hostMenuGroupLabelClass}>帮助</div>'),
    );
    expect(hostMoreMenuSource.indexOf('<div className={hostMenuGroupLabelClass}>帮助</div>')).toBeLessThan(
      hostMoreMenuSource.indexOf("{ type: 'open-keyboard-shortcuts' }"),
    );
    expect(hostMoreMenuSource.indexOf("{ type: 'open-keyboard-shortcuts' }")).toBeLessThan(
      hostMoreMenuSource.indexOf('<div className={hostMenuGroupLabelClass}>保存</div>'),
    );
  });

  it('places the more button between refresh and exit while quick editing', () => {
    const source = readToolbarSource();

    expect(source).toMatch(/<RotateCw \/> 刷新[\s\S]*\{hostMoreMenu\}[\s\S]*<CircleX \/> 退出/);
  });

  it('shows the real annotation save status and count after all quick-edit buttons only when annotations exist', () => {
    const source = readToolbarSource();
    const statusComponentSource = source.slice(
      source.indexOf('function QuickEditAnnotationSaveStatus('),
      source.indexOf('function PreviewSplitIcon()'),
    );
    const statusSource = source.slice(
      source.indexOf('const hostToolbarControls ='),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );
    const activeToolbarSource = source.slice(
      source.indexOf('const activeQuickEditToolbarButtons = ('),
      source.indexOf('const resourceActionButtons = (() => {'),
    );

    expect(source).toContain("saving: '正在保存'");
    expect(source).toContain("saved: '已保存'");
    expect(source).toContain("unsaved: '未保存'");
    expect(source).toContain("saving: '正在保存批注。'");
    expect(source).toContain("saved: '已保存，AI 可通过本链接读取。'");
    expect(source).toContain("unsaved: '保存失败，请重试。'");
    expect(source).toContain("const QUICK_EDIT_SAVED_FALLBACK_TOOLTIP = '可从「更多」复制提示词，或直接执行。';");
    expect(statusSource).toContain('const quickEditAnnotationCount = Math.max(0, hostToolbarState?.modifiedCount ?? 0);');
    expect(statusSource).toContain('const hasQuickEditAnnotationData = quickEditAnnotationCount > 0;');
    expect(statusSource).not.toContain('prototypeDecisionDataAvailable');
    expect(statusSource).toContain('const showQuickEditLocalSaveStatus = hasQuickEditAnnotationData;');
    expect(statusSource).toContain("const quickEditAnnotationSaveStatus = hostToolbarState?.annotationSaveStatus ?? 'saved';");
    expect(statusComponentSource).toContain('const visibleStatus = useSmoothedAnnotationSaveStatus(status);');
    expect(statusComponentSource).toContain('`${QUICK_EDIT_ANNOTATION_SAVE_STATUS_LABELS[visibleStatus]} · ${count} 条`');
    expect(statusComponentSource).toContain("visibleStatus === 'saved' && !canOpenSelectedSource");
    expect(statusComponentSource).toContain('? QUICK_EDIT_SAVED_FALLBACK_TOOLTIP');
    expect(statusComponentSource).toContain(': QUICK_EDIT_ANNOTATION_SAVE_STATUS_TOOLTIPS[visibleStatus];');
    expect(statusSource).not.toContain('useSmoothedAnnotationSaveStatus(');
    expect(statusSource).toContain('const quickEditLocalSaveStatus = showQuickEditLocalSaveStatus ? (');
    expect(statusSource).toContain('<QuickEditAnnotationSaveStatus');
    expect(statusSource).toContain('status={quickEditAnnotationSaveStatus}');
    expect(statusSource).toContain('count={quickEditAnnotationCount}');
    expect(statusSource).toContain(': null;');
    expect(statusComponentSource).toContain('absolute left-full top-1/2');
    expect(statusComponentSource).toContain('ml-4');
    expect(statusComponentSource).toContain('min-w-[112px]');
    expect(statusComponentSource).toContain('-translate-y-1/2');
    expect(statusComponentSource).toContain('text-foreground opacity-50');
    expect(statusComponentSource).toContain('aria-label={tooltip}');
    expect(statusComponentSource).toContain('{label}');
    expect(statusComponentSource).toContain('<TooltipContent>{tooltip}</TooltipContent>');
    expect(activeToolbarSource).toMatch(
      /\{hostMoreMenu\}[\s\S]*<CircleX \/> 退出[\s\S]*\{quickEditLocalSaveStatus\}/,
    );
    expect(activeToolbarSource).toContain('className="relative inline-flex items-center gap-3"');
    expect(activeToolbarSource).toMatch(
      /data-axhub-toolbar-group="execution"[\s\S]*<CircleX \/> 退出[\s\S]*<\/div>\s*\{quickEditLocalSaveStatus\}/,
    );
    expect(source).toMatch(
      /className="relative inline-flex items-center gap-1"[\s\S]*\{isDocumentEditActive \? documentEditTrailingActionButtons : null\}[\s\S]*\{isDocumentCommentActive \? quickEditLocalSaveStatus : null\}/,
    );
  });

  it('keeps only text and style save actions in the save menu', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );
    const activeToolbarSource = source.slice(
      source.indexOf('const activeQuickEditToolbarButtons = ('),
      source.indexOf('const resourceActionButtons = (() => {'),
    );

    expect(hostMoreMenuSource).toContain("getQuickEditSaveMenuActionHandlers('save-text')");
    expect(hostMoreMenuSource).toContain('保存文本');
    expect(hostMoreMenuSource).toContain("getQuickEditSaveMenuActionHandlers('save-style')");
    expect(hostMoreMenuSource).toContain('保存样式');
    expect(hostMoreMenuSource).not.toContain("getQuickEditSaveMenuActionHandlers('clear-style')");
    expect(hostMoreMenuSource).not.toContain('清空强制样式');
    expect(activeToolbarSource).not.toContain('quickEditSaveActions');
    expect(activeToolbarSource).not.toContain("runQuickEditSaveAction('save-text')");
    expect(activeToolbarSource).not.toContain("runQuickEditSaveAction('save-style')");
  });

  it('orders quick edit host controls as clear, refresh, more, then exit', () => {
    const source = readToolbarSource();
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );
    const clearControlSource = hostControlsSource.slice(
      hostControlsSource.indexOf('const hostClearToolbarControl ='),
      hostControlsSource.indexOf('const hostToolToolbarControls ='),
    );
    const activeToolbarSource = source.slice(
      source.indexOf('const activeQuickEditToolbarButtons = ('),
      source.indexOf('const resourceActionButtons = (() => {'),
    );

    expect(hostControlsSource).toMatch(/'host-clear'[\s\S]*'清空'[\s\S]*<Trash2 \/>/);
    expect(hostControlsSource).not.toContain('清空编辑');
    expect(hostControlsSource).toContain(
      "{ type: 'clear-edits', scope: 'prototype', target: 'completed' }",
    );
    expect(clearControlSource).not.toContain('visible:');
    expect(activeToolbarSource).not.toContain(
      "runHostAction({ type: 'clear-edits', scope: 'prototype', target: 'completed' })",
    );
    expect(activeToolbarSource).toMatch(/data-axhub-toolbar-group="execution"[\s\S]*\{hostExecutionToolbarControls\}[\s\S]*\{hostClearToolbarControl\}[\s\S]*<RotateCw \/> 刷新[\s\S]*\{hostMoreMenu\}[\s\S]*<CircleX \/> 退出/);
  });

  it('shows host execution controls based on state visibility instead of local agent connection', () => {
    const source = readToolbarSource();
    const hostExecutionControlsSource = source.slice(
      source.indexOf('const showHostExecutionControls = Boolean('),
      source.indexOf('const renderHostToolbarActionButton = ('),
    );
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );

    expect(hostExecutionControlsSource).not.toContain('hostLocalAgentConnected');
    expect(hostExecutionControlsSource).toContain('hostToolbarState.sendVisible || hostToolbarState.interruptVisible');
    expect(hostControlsSource).toContain("visible: showHostExecutionControls && hostToolbarState.sendVisible");
    expect(hostControlsSource).not.toContain("visible: showHostExecutionControls && hostToolbarState.interruptVisible");
  });

  it('adds a selection mode toggle controlled by hostToolbarState.selectionModeActive', () => {
    const source = readToolbarSource();
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );

    expect(hostControlsSource).toContain("'host-selection-mode'");
    expect(hostControlsSource).toContain('选择元素');
    expect(hostControlsSource).toContain("{ type: 'toggle-selection-mode', active: !hostToolbarState.selectionModeActive }");
    expect(hostControlsSource).toContain('active: hostToolbarState.selectionModeActive');
  });

  it('hides element selection and design decision host actions during document annotation', () => {
    const source = readToolbarSource();
    const hostMoreMenuSource = source.slice(
      source.indexOf('const hostMoreMenu = hostToolbarState?.visible ? ('),
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
    );

    expect(source).toContain('const showHostSelectionModeAction = !isDocumentCommentActive;');
    expect(source).toContain('&& !isDocumentCommentActive');
    expect(hostMoreMenuSource).toContain('showHostPropertyPanelMenuAction ? (');
  });

  it('shows the selection mode shortcut hint in the host toolbar without binding it in the parent page', () => {
    const source = readToolbarSource();
    const hostControlsSource = source.slice(
      source.indexOf('const hostExecutionToolbarControls = hostToolbarState?.visible ? ('),
      source.indexOf('const activeQuickEditToolbarButtons = ('),
    );

    expect(source).toContain("const selectionModeShortcutLabel = 'Ctrl / Cmd + S';");
    expect(source).toContain("const selectionModeTooltip = `切换（${selectionModeShortcutLabel}）`;");
    expect(hostControlsSource).toContain('selectionModeTooltip');
    expect(hostControlsSource).not.toContain('shortcutLabel: selectionModeShortcutLabel');
    expect(hostControlsSource).not.toContain('<kbd');
    expect(hostControlsSource).not.toContain("document.addEventListener('keydown'");
    expect(hostControlsSource).not.toContain("window.addEventListener('keydown'");
  });

  it('reuses the prototype active toolbar when theme annotation is active', () => {
    const source = readToolbarSource();
    const themeResourceActionsSource = source.slice(
      source.indexOf("if (contentMode === 'theme' && selectedTheme) {"),
      source.indexOf("if (contentMode === 'data' && selectedDataTable) {"),
    );

    expect(source).toContain('const activeQuickEditToolbarButtons = (');
    expect(themeResourceActionsSource).toContain('if (isQuickEditActive) {');
    expect(themeResourceActionsSource).toContain('return activeQuickEditToolbarButtons;');
    expect(themeResourceActionsSource.indexOf('return activeQuickEditToolbarButtons;')).toBeLessThan(
      themeResourceActionsSource.indexOf('<PencilRuler /> 批注'),
    );
  });

  it('adds a top online edit action for drawio document and template previews', () => {
    const source = readToolbarSource();
    const documentResourceActionsSource = source.slice(
      source.indexOf('const resourceActionButtons = (() => {'),
      source.indexOf("if (contentMode === 'theme' && selectedTheme) {"),
    );

    expect(source).toContain('drawioResourceEditAvailable?: boolean;');
    expect(source).toContain('handleOpenDrawioResourceEditor: () => void | Promise<void>;');
    expect(source).toContain('drawioResourceEditAvailable = false,');
    expect(source).toContain('handleOpenDrawioResourceEditor,');
    expect(documentResourceActionsSource).toContain('drawioResourceEditAvailable');
    expect(documentResourceActionsSource).toContain('handleOpenDrawioResourceEditor');
    expect(documentResourceActionsSource).toContain('在线编辑');
    expect(documentResourceActionsSource.indexOf('在线编辑')).toBeGreaterThan(
      documentResourceActionsSource.indexOf('打开'),
    );
  });

  it('shows the document annotation action for commentable Markdown and HTML resources', () => {
    const source = readToolbarSource();
    const documentResourceActionsSource = source.slice(
      source.indexOf('const resourceActionButtons = (() => {'),
      source.indexOf("if (contentMode === 'theme' && selectedTheme) {"),
    );

    expect(source).toContain('isDocumentCommentableResource');
    expect(documentResourceActionsSource).toContain('const canCommentOnDocument = isDocumentCommentableResource(currentMarkdownItem);');
    expect(documentResourceActionsSource).toContain('{canCommentOnDocument ? (');
    expect(documentResourceActionsSource).toContain('<PencilRuler /> 批注');
    expect(documentResourceActionsSource).toContain('<TooltipContent>{`批注${currentMarkdownLabel}`}</TooltipContent>');
    expect(documentResourceActionsSource).not.toContain('<SquarePen /> 编辑');
  });

  it('opens document annotation and editing buttons directly in their requested mode', () => {
    const source = readToolbarSource();
    const documentResourceActionsSource = source.slice(
      source.indexOf('const resourceActionButtons = (() => {'),
      source.indexOf("if (contentMode === 'theme' && selectedTheme) {"),
    );

    expect(source).toContain('handleEnableDocEdit: (mode?: SpecQuickEditMode, options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean }) => void;');
    expect(source).toContain('handleEnableDocEdit,');
    expect(documentResourceActionsSource).toContain("onClick={() => handleEnableDocEdit('comment')}");
    expect(documentResourceActionsSource).toContain("onClick={() => handleEnableDocEdit('edit')}");
    expect(documentResourceActionsSource).not.toContain('onClick={handleEnableDocEdit}');
  });

  it('reuses the page annotation host toolbar when HTML document annotation is active', () => {
    const source = readToolbarSource();
    const documentResourceActionsSource = source.slice(
      source.indexOf('const resourceActionButtons = (() => {'),
      source.indexOf("if (contentMode === 'theme' && selectedTheme) {"),
    );

    expect(source).toContain('isHtmlCommentableResource');
    expect(source).toContain('const isHtmlDocumentEditingContent = isDocumentEditingContent && isHtmlCommentableResource(currentMarkdownItem);');
    expect(source).toContain('const isQuickEditActive = quickEditActive && (!isDocumentEditingContent || isHtmlDocumentEditingContent);');
    expect(documentResourceActionsSource).toContain('if (isHtmlDocumentEditingContent && isQuickEditActive) {');
    expect(documentResourceActionsSource).toContain('return activeQuickEditToolbarButtons;');
  });
});

describe('PresentationToolbar multi-page preview source', () => {
  it('renders effective adaptive custom dimensions and keeps desktop selection explicit', () => {
    const source = readToolbarSource();

    expect(source).toContain("const isCustomPreview = previewConfig.previewMode === 'single' && previewConfig.singlePreset === 'custom';");
    expect(source).toContain("setCustomWidthDraft(previewConfig.customWidth ? String(previewConfig.customWidth) : '');");
    expect(source).toContain("setCustomHeightDraft(previewConfig.customHeight ? String(previewConfig.customHeight) : '');");
    expect(source).toContain("handleSelectPreviewSinglePreset('desktop');");
  });

  it('keeps the top device menu focused on choosing multi-page mode, not configuring columns', () => {
    const source = readToolbarSource();
    const deviceMenuSource = source.slice(
      source.indexOf('<DropdownMenuContent'),
      source.indexOf('</DropdownMenuContent>', source.indexOf('<DropdownMenuContent')),
    );

    expect(source).toContain('LayoutGrid');
    expect(source).toContain('handleActivateMultiPagePreview');
    expect(source).toContain('handleChangeMultiPageColumns');
    expect(source).toContain("const isMultiPagePreview = previewConfig.previewMode === 'multi-page';");
    expect(source).toContain('title="多页面"');
    expect(source).toContain('平铺当前原型页面');
    expect(source).toContain('active={isMultiPagePreview}');
    expect(source).toContain('handleActivateMultiPagePreview(selectedItem?.pages?.length)');
    expect(deviceMenuSource).not.toContain('previewConfig.multiPageColumns');
    expect(deviceMenuSource).not.toContain('handleChangeMultiPageColumns(value as MultiPageColumns)');
    expect(deviceMenuSource).not.toContain('列数');
  });

  it('hides scale mode controls in multi-page mode while keeping the toolbar icon active', () => {
    const source = readToolbarSource();
    const deviceSwitcherButtonSource = source.slice(
      source.indexOf('const deviceSwitcherButton = ('),
      source.indexOf('const shouldShowDeviceSwitcher'),
    );

    expect(source).toContain('const shouldShowScaleMode = isCustomPreview || isSplitPreview;');
    expect(source).toContain('isMultiPagePreview ? <LayoutGrid className="h-3.5 w-3.5" />');
    expect(deviceSwitcherButtonSource).toContain('isMultiPagePreview && "bg-muted text-foreground"');
    expect(deviceSwitcherButtonSource).toContain('isSplitPreview && "bg-muted text-foreground"');
  });
});
