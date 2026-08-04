import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readPresentationAreaSource() {
  return readFileSync(resolve(__dirname, './PresentationArea.tsx'), 'utf8');
}

function readPresentationPropsBuilderSource() {
  return readFileSync(resolve(__dirname, '../../app/hooks/useIndexPagePresentationPropsBuilder.ts'), 'utf8');
}

describe('PresentationArea resource folder source', () => {
  it('hides the presentation toolbar while previewing a resource folder', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain("const isResourceFolderPreview = props.contentMode === 'doc' && Boolean(props.selectedResourceFolder);");
    expect(source).toContain('const shouldShowPresentationToolbar = !isCanvasMode');
    expect(source).toContain('{shouldShowPresentationToolbar ? (');
  });

  it('keeps one compact sidebar trigger when the full presentation toolbar is hidden', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain("import ResponsiveSidebarTriggerButton from '../sidebar/ResponsiveSidebarTriggerButton';");
    expect(source).toContain('className="ax-sidebar-compact-fallback-trigger"');
    expect(source).toContain('<ResponsiveSidebarTriggerButton');
    expect(source).toContain('collapsedOnly');
    expect(source).toContain('collapsed={props.collapsed}');
    expect(source).toContain('setCollapsed={props.setCollapsed}');
  });

  it('hides the presentation toolbar on the prototype start draft page', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain('const isPrototypeStartDraft = isPreviewContentMode && props.prototypeStartDraftActive === true && !props.selectedItem;');
    expect(source).toContain('&& !isPrototypeStartDraft');
  });

  it('hides the presentation toolbar on resource and design start draft pages', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain("const isResourceStartDraft = props.contentMode === 'doc' && props.resourceStartDraftActive === true && !props.selectedDoc;");
    expect(source).toContain("const isThemeStartDraft = props.contentMode === 'theme' && props.themeStartDraftActive === true && !props.selectedTheme;");
    expect(source).toContain('&& !isResourceStartDraft');
    expect(source).toContain('&& !isThemeStartDraft');
    expect(source).toContain('&& !isResourceStartDraft');
    expect(source).toContain('&& !isThemeStartDraft');
  });

  it('hides the presentation toolbar on existing placeholder prototype start pages', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain("const isPrototypeStartPlaceholder = isPreviewContentMode && props.selectedItem?.placeholder === true && props.viewMode === 'demo';");
    expect(source).toContain('&& !isPrototypeStartPlaceholder');
  });

  it('hides the assistant side panel on prototype start pages even when it is open', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain('const shouldShowAssistantPanel = props.reviewPanelOpen');
    expect(source).toContain('&& !isPrototypeStartDraft');
    expect(source).toContain('&& !isPrototypeStartPlaceholder');
    expect(source).toContain('{shouldShowAssistantPanel ? (');
    expect(source).not.toContain("{props.reviewPanelOpen && props.viewMode !== 'canvas' ? (");
  });

  it('does not expose prototype start canvas actions', () => {
    const source = readPresentationAreaSource();
    const startActionSource = source.slice(
      source.indexOf('return ('),
      source.indexOf('{shouldShowPresentationToolbar ? ('),
    );

    expect(source).not.toContain('const shouldShowPrototypeStartActions =');
    expect(source).not.toContain('{shouldShowPrototypeStartActions ? (');
    expect(source).not.toContain('const handleOpenPrototypeStartCanvas = async () => {');
    expect(source).not.toContain("props.setViewMode?.('canvas');");
    expect(source).toContain('className="relative flex flex-col flex-1 h-full min-h-0 min-w-0 bg-background"');
    expect(startActionSource).not.toContain('aria-label="打开画布"');
    expect(startActionSource).not.toContain('handleOpenPrototypeStartCanvas');
    expect(startActionSource).not.toContain('<span>画布</span>');
    expect(startActionSource).not.toContain('<PresentationToolbar');
  });

  it('scopes prototype start actions to prototype preview content so document pages keep their toolbar', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain("const isPreviewContentMode = props.contentMode === 'preview';");
    expect(source).toContain('const isPrototypeStartDraft = isPreviewContentMode');
    expect(source).toContain('const isPrototypeStartPlaceholder = isPreviewContentMode');
  });

  it('passes review report list state into the review layout without panel close or zoom wiring', () => {
    const source = readPresentationAreaSource();
    const propsBuilderSource = readPresentationPropsBuilderSource();
    const reviewPanelSource = source.slice(
      source.indexOf('{shouldShowAssistantPanel ? ('),
      source.indexOf('</div>', source.indexOf('{shouldShowAssistantPanel ? (')),
    );

    expect(source).toContain('{shouldShowAssistantPanel ? (');
    expect(reviewPanelSource).toContain('reports={props.reviewReports || []}');
    expect(reviewPanelSource).toContain('selectedReport={props.selectedReviewReport || null}');
    expect(reviewPanelSource).toContain('activeReportId={props.activeReviewReportId}');
    expect(reviewPanelSource).toContain('reviewPrompt={props.reviewPrompt || \'\'}');
    expect(reviewPanelSource).toContain('reviewDocumentPath={props.reviewDocumentPath}');
    expect(reviewPanelSource).toContain('reviewPrompts={props.reviewPrompts}');
    expect(reviewPanelSource).toContain('reviewDocumentPaths={props.reviewDocumentPaths}');
    expect(reviewPanelSource).toContain('lanSubmitConfig={props.reviewLanSubmitConfig}');
    expect(reviewPanelSource).toContain('axhubSubmitConfig={props.reviewAxhubSubmitConfig}');
    expect(reviewPanelSource).not.toContain('feishuConfig');
    expect(reviewPanelSource).not.toContain('Feishu');
    expect(reviewPanelSource).toContain('onExecutePrompt={props.onExecutePrompt}');
    expect(reviewPanelSource).toContain('onSelectReport={(report) => props.handleSelectReviewReport?.(report)}');
    expect(reviewPanelSource).toContain('onBackToList={() => props.handleBackToReviewList?.()}');
    expect(reviewPanelSource).toContain('onCopyReportPath={(report) => props.handleCopyReviewReportPath?.(report)}');
    expect(reviewPanelSource).toContain('onDeleteReport={(report) => props.handleDeleteReviewReport?.(report)}');
    expect(reviewPanelSource).toContain('onStartReview={(kind) => props.handleStartReview?.(kind)}');
    expect(reviewPanelSource).toContain('onRunReviewDirect={(kind) => props.handleRunReviewDirect?.(kind)}');
    expect(reviewPanelSource).toContain('onUploadReport={(files, meta) => props.handleUploadReviewReport?.(files, meta)}');
    expect(reviewPanelSource).toContain('onLanSubmitEnabledChange={(enabled) => props.handleReviewLanSubmitEnabledChange?.(enabled)}');
    expect(reviewPanelSource).toContain('onAxhubSubmitEnabledChange={(enabled) => props.handleReviewAxhubSubmitEnabledChange?.(enabled)}');
    expect(propsBuilderSource).toContain('reviewAxhubSubmitConfig: preview.reviewAxhubSubmitConfig');
    expect(propsBuilderSource).toContain('handleReviewAxhubSubmitEnabledChange: preview.handleReviewAxhubSubmitEnabledChange');
    expect(propsBuilderSource).not.toContain('reviewFeishu');
    expect(propsBuilderSource).not.toContain('ReviewFeishu');
    expect(reviewPanelSource).not.toContain('onClose');
    expect(reviewPanelSource).not.toContain('handleReviewPanelToggle');
    expect(reviewPanelSource).not.toContain('reviewPageZoomEnabled');
    expect(reviewPanelSource).not.toContain('handleToggleReviewPageZoom');
  });

  it('forwards pane-scoped prototype prompt actions into the content area', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain('onRunPrototypePanePromptAction={props.handleRunPrototypePanePromptAction}');
  });

  it('forwards prototype decision availability into the presentation toolbar', () => {
    const source = readPresentationAreaSource();
    const toolbarSource = source.slice(
      source.indexOf('<PresentationToolbar'),
      source.indexOf('/>', source.indexOf('<PresentationToolbar')),
    );

    expect(toolbarSource).toContain('prototypeDecisionDataAvailable={props.prototypeDecisionDataAvailable}');
  });

  it('forwards AI settings actions into the presentation toolbar', () => {
    const source = readPresentationAreaSource();
    const toolbarSource = source.slice(
      source.indexOf('<PresentationToolbar'),
      source.indexOf('/>', source.indexOf('<PresentationToolbar')),
    );

    expect(toolbarSource).toContain('onOpenAISettings={props.onOpenAISettings}');
  });

  it('forwards canvas AI prompt submissions into the content area', () => {
    const source = readPresentationAreaSource();

    expect(source).toContain('onSubmitCanvasAssistantPrompt={props.onSubmitCanvasAssistantPrompt}');
    expect(source).not.toContain('onSubmitPrototypeAssistantPrompt={props.onSubmitPrototypeAssistantPrompt}');
  });
});
