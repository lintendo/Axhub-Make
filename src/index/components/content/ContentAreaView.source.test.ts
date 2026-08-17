import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readContentAreaViewSource() {
  return readFileSync(resolve(__dirname, './ContentAreaView.tsx'), 'utf8');
}

function readResourceStartPromptGridSource() {
  return readFileSync(resolve(__dirname, './ResourceStartPromptGrid.tsx'), 'utf8');
}

function readStartPromptCardSource() {
  return readFileSync(resolve(__dirname, './StartPromptCard.tsx'), 'utf8');
}

function readCanvasAiSceneRegistrySource() {
  return readFileSync(resolve(__dirname, '../../domains/ai-generation/canvasAiSceneRegistry.ts'), 'utf8');
}

function getSourceSegment(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('ContentAreaView Codex surface source', () => {
  it('removes the inline local-AI app list from the start guide', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(startGuideSegment).not.toContain('shouldShowInlineAppList');
    expect(startGuideSegment).not.toContain('variant="inline-app-list"');
    expect(startGuideSegment).not.toContain('externalOpenMenu = true,');
    expect(startGuideSegment).not.toContain('onOpenProjectInIDE,');
    expect(startGuideSegment).not.toContain('onPreferredIDEChange,');
    expect(startGuideSegment).not.toContain('agentAvailability,');
  });

  it('shows seven capability-focused prototype cards with copy and quick-execute actions', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );
    const prototypeCardsSegment = getSourceSegment(
      source,
      'const PROTOTYPE_START_PROMPT_CARDS = [',
      'const RESOURCE_START_PROMPT_CARDS = [',
    );

    expect(source).toContain('conversationUiEnabled?: boolean;');
    expect(source).not.toContain('CanvasGenerationDisplayComposer');
    expect(source).not.toContain('原型起始页 AI 输入');
    expect(startGuideSegment.match(/copyOnSelect/g)).toHaveLength(3);
    expect(source).toContain("title: '根据 PRD 生成原型'");
    expect(source).toContain('根据我提供的 PRD 生成原型，梳理页面和主要流程。');
    expect(source).toContain("title: '根据设计图还原原型'");
    expect(source).toContain('Figma 链接或设计稿 PNG');
    expect(source).toContain('$screenshot-to-prototype');
    expect(source).toContain('先生成售后申请流程图，再生成申请和进度页面原型。');
    expect(source).toContain("title: '生成 CRM 管理后台'");
    expect(prototypeCardsSegment).toContain("title: '运动记录 APP 首页'");
    expect(prototypeCardsSegment).toContain("title: 'Apple 风格智能家居'");
    expect(prototypeCardsSegment).toContain("id: 'axure-reference-prototype'");
    expect(prototypeCardsSegment).toContain("title: '参考 Axure 生成原型'");
    expect(prototypeCardsSegment).toContain('参考我提供的 Axure 原型');
    expect(prototypeCardsSegment).toContain('在线链接或本地导出的 HTML 文件');
    expect(prototypeCardsSegment).toContain('extract-axure-data');
    expect(prototypeCardsSegment).toContain('https://github.com/lintendo/Axhub-Skills/tree/main/skills/extract-axure-data');
    expect(prototypeCardsSegment).not.toContain("title: '生成运动记录 APP 首页'");
    expect(prototypeCardsSegment).not.toContain("title: '按 Apple 设计规范生成原型'");
    expect(prototypeCardsSegment).not.toMatch(/机械转换|像素级|照搬|复刻/);
    expect(source).toContain('参照项目内 Apple 主题规范，生成智能家居控制 App 原型');
    expect(source).not.toContain('生成数据看板');
    expect(source).not.toContain('生成审批表单流程');
    expect(source).not.toContain('生成预约服务流程');
    expect(startGuideSegment).toContain('ariaLabel="原型生成能力"');
    expect(startGuideSegment).toContain('const copyPrototypeStartCardPrompt = async (card: ThemeStartPromptCard) => {');
    expect(startGuideSegment).toContain('const executePrototypeStartCardPrompt = async (card: ThemeStartPromptCard) => {');
    expect(startGuideSegment).toContain("scene: 'start-guide-prototype-page'");
    expect(startGuideSegment).toContain('onExecutePrompt={executePrototypeStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeThemeStartCardPrompt}');
    expect(startGuideSegment).toContain('autoSend: false');
    expect(startGuideSegment).toContain('导入原型');
    expect(startGuideSegment).toContain('导入任意网页');
  });
});

describe('ContentAreaView review zoom source', () => {
  it('keeps preview loading alive when a cross-origin iframe cannot accept resize listeners', () => {
    const source = readContentAreaViewSource();
    const measurementSegment = getSourceSegment(
      source,
      'const attachIframeMeasurement = (',
      '    const handleSingleIframeLoad = () => {',
    );

    expect(measurementSegment).toContain('try {\n            const frameWindow = iframe.contentWindow;');
    expect(measurementSegment).not.toContain('toast.info(');
    expect(measurementSegment).not.toContain('axhub-preview-cross-origin-measurement');
    expect(source).toContain('onPreviewIframeLoad?.(previewIframeRef.current);');
  });

  it('reports stable preview width changes through the existing resize observer', () => {
    const source = readContentAreaViewSource();
    const measurementEffect = getSourceSegment(
      source,
      'const updateSize = () => {',
      '    const previewLayout = useMemo',
    );

    expect(source).toContain('handlePreviewContainerSizeChange: (width: number) => void;');
    expect(source).toContain('handlePreviewContainerSizeChange,');
    expect(measurementEffect).toContain('resolveStablePreviewContainerSize');
    expect(measurementEffect).toContain('horizontalInset: 0,');
    expect(measurementEffect).toContain('handlePreviewContainerSizeChange(next.width)');
    expect((measurementEffect.match(/new ResizeObserver/g) || []).length).toBe(1);
  });

  it('pairs the custom scaled preview width reservation with symmetric 8px padding', () => {
    const source = readContentAreaViewSource();
    const customPreviewBranch = getSourceSegment(
      source,
      ") : previewLayout.single.kind === 'custom' ? (",
      ') : (\n                        <div className="flex h-full w-full items-start justify-center pt-4">',
    );

    expect(source).toContain('const SCALED_PREVIEW_HORIZONTAL_GAP = 8;');
    expect(source).toContain('singleReservedWidth: SCALED_PREVIEW_HORIZONTAL_GAP * 2,');
    expect(customPreviewBranch).toContain('px-2');
  });

  it('allows embedded prototype and theme preview iframes to write clipboard text', () => {
    const source = readContentAreaViewSource();
    const scaledIframeHelper = getSourceSegment(
      source,
      'const renderScaledIframe = (',
      '    if (projectAccessDeniedReason) {',
    );
    const themePreviewBranch = getSourceSegment(
      source,
      "    if (contentMode === 'theme') {",
      "    if (contentMode === 'data') {",
    );
    const desktopBranch = getSourceSegment(
      source,
      "previewLayout.single.kind === 'desktop' ? (",
      ") : previewLayout.single.kind === 'custom' ? (",
    );

    expect(scaledIframeHelper).toContain('allow="clipboard-write"');
    expect(themePreviewBranch).toContain('allow="clipboard-write"');
    expect(themePreviewBranch).toContain('const themePreviewUrl = primaryIframeUrl;');
    expect(desktopBranch).toContain('allow="clipboard-write"');
  });

  it('does not keep the removed review-specific page zoom layout', () => {
    const source = readContentAreaViewSource();

    expect(source).not.toContain('reviewPageZoomEnabled');
    expect(source).not.toContain('desktopReviewZoomLayout');
    expect(source).not.toContain('reviewPageZoom');
  });

  it('explains disabled runtime preview without claiming a spec-only prototype lacks clientUrl', () => {
    const source = readContentAreaViewSource();

    expect(source).toContain("selectedItem.clientUrl ? '当前原型尚未生成可运行页面' : '当前原型缺少 clientUrl，无法打开预览'");
  });

  it('wraps the resource canvas render path in a scoped error boundary', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );
    const legacyPrototypeCanvasBranch = getSourceSegment(
      source,
      ") : viewMode === 'canvas' ? (",
      ") : (",
    );

    expect(source).toContain('class CanvasErrorBoundary extends React.Component');
    expect(source).toContain('static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState');
    expect(source).toContain("console.error('[Axhub Make] Canvas render failed', error, errorInfo);");
    expect(source).not.toContain('data-canvas-error');
    expect(source).toContain('import.meta.env.DEV');
    expect(source).toContain('__AXHUB_CANVAS_RENDER_ERROR__');
    expect(source).toContain('componentDidUpdate(prevProps: CanvasErrorBoundaryProps)');
    expect(source).toContain('if (prevProps.resetKey !== this.props.resetKey && this.state.hasError)');
    expect(source).toContain('画布加载失败');
    expect(source).toContain('请刷新页面，或切换到其他画布后再回来重试。');
    expect(source).toContain("import { lazyWithRetry } from '../../utils/lazyWithRetry';");
    expect(source).toContain("const ExcalidrawCanvas = React.lazy(() => lazyWithRetry(() => import('./ExcalidrawCanvas')));");
    expect(source).not.toContain('草稿加载失败');
    expect(source).not.toContain('请刷新页面，或切换到其他草稿后再回来重试。');
    expect(standaloneCanvasBranch).toContain('<CanvasErrorBoundary resetKey={currentCanvasItem.name}>');
    expect(standaloneCanvasBranch).toContain('</CanvasErrorBoundary>');
    expect(legacyPrototypeCanvasBranch).toContain('画布现在作为资源文件管理，请在资源中打开 .excalidraw 文件');
    expect(legacyPrototypeCanvasBranch).not.toContain('<ExcalidrawCanvas');
    expect(legacyPrototypeCanvasBranch).not.toContain('selectedPrototypeCanvasName');
  });

  it('uses draft wording for the standalone canvas empty state', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '        return (\n            <div className="h-full min-h-0 relative bg-background">',
    );

    expect(standaloneCanvasBranch).toContain('请从左侧选择或新建一个画布');
    expect(standaloneCanvasBranch).not.toContain('请从左侧选择或新建一个草稿');
  });

  it('renders Excalidraw resource files from the resource tree as the current canvas', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );

    expect(source).toContain("const selectedResourceCanvas = selectedDoc?.openMode === 'canvas' ? selectedDoc : null;");
    expect(source).toContain('const selectedResourceCanvasFilePath = selectedResourceCanvas');
    expect(standaloneCanvasBranch).toContain('const currentCanvasItem = selectedResourceCanvas || selectedCanvas;');
    expect(standaloneCanvasBranch).toContain('canvasName={currentCanvasItem.name}');
    expect(standaloneCanvasBranch).toContain('canvasFilePath={currentCanvasFilePath}');
    expect(standaloneCanvasBranch).toContain('<CanvasErrorBoundary resetKey={currentCanvasItem.name}>');
  });

  it('does not render the custom canvas welcome guide overlay', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );

    expect(source).not.toContain("import CanvasWelcomeGuide from './CanvasWelcomeGuide';");
    expect(standaloneCanvasBranch).not.toContain('<CanvasWelcomeGuide />');
    expect(source).not.toContain('axhub-canvas-welcome-dismissed');
    expect(source).not.toContain('画布使用技巧');
  });

  it('forwards theme lists and default design into the canvas', () => {
    const source = readContentAreaViewSource();
    const propsSegment = getSourceSegment(
      source,
      'export default function ContentArea({',
      '}: ContentAreaProps)',
    );

    expect(propsSegment).toContain('themes,');
    expect(propsSegment).toContain('defaultThemeName,');
    expect(source).toContain('themes={themes}');
    expect(source).toContain('defaultThemeName={defaultThemeName}');
  });

  it('forwards the active project id into the resource canvas render path', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );

    expect(standaloneCanvasBranch).toContain("activeProjectId={activeProjectId || ''}");
  });

  it('shows a copyable AI prompt action for make client startup failures in both empty states', () => {
    const source = readContentAreaViewSource();
    const projectEmptyStateSegment = getSourceSegment(
      source,
      'function ProjectContentEmptyState({',
      'function ClientPreviewUnavailableState({',
    );
    const previewUnavailableSegment = getSourceSegment(
      source,
      'function ClientPreviewUnavailableState({',
      'function PrototypeClientUnavailableState',
    );

    expect(source).toContain('onCopyStartServerErrorPrompt?: () => void | Promise<void>;');
    expect(projectEmptyStateSegment).toContain('onCopyStartServerErrorPrompt');
    expect(projectEmptyStateSegment).toContain('复制给 AI 处理');
    expect(projectEmptyStateSegment).toContain('startServerError && onCopyStartServerErrorPrompt');
    expect(previewUnavailableSegment).toContain('onCopyStartServerErrorPrompt');
    expect(previewUnavailableSegment).toContain('复制给 AI 处理');
    expect(previewUnavailableSegment).toContain('startServerError && onCopyStartServerErrorPrompt');
  });

  it('reuses the client unavailable state when the runtime proxy reports an unavailable preview document', () => {
    const source = readContentAreaViewSource();

    expect(source).toContain("payload.type !== 'axhub:runtime-unavailable'");
    expect(source).toContain('setRuntimeUnavailablePreviewPath(requestPath)');
    expect(source).toContain("runtimeUnavailablePathMatchesResource(runtimeUnavailablePreviewPath, 'prototypes', selectedItem?.name)");
    expect(source).toContain("runtimeUnavailablePathMatchesResource(runtimeUnavailablePreviewPath, 'themes', selectedTheme?.name)");
    expect(source).toContain('const selectedPrototypeClientUnavailable = selectedPrototypeRuntimeUnavailable || (');
    expect(source).toContain('const selectedThemeClientUnavailable = selectedThemeRuntimeUnavailable || (');
  });

  it('renders reusable start guides with scoped scenes and aligned actions', () => {
    const source = readContentAreaViewSource();
    const registrySource = readCanvasAiSceneRegistrySource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).not.toContain("import { Segmented } from 'antd';");
    expect(source).toContain("import TemplateLibraryCard, { type TemplateLibraryCardItem } from '../dialogs/TemplateLibraryCard';");
    expect(source).toContain("import PromptActionButton from '../PromptActionButton';");
    expect(source).toContain("import { generateTemplateImportPrompt, type TemplateLibraryPromptItem } from '../../utils/templateImportPrompts';");
    expect(source).toContain("import { getUserFriendlyUploadErrorMessage } from '../../utils/uploadErrors';");
    expect(source).not.toContain("import '../../domains/ai-image/AiImageGenerationComposer.css';");
    expect(source).not.toContain('CANVAS_AI_SCENE_OPTIONS');
    expect(source).not.toContain('getCanvasAiStartPlaceholders');
    expect(source).not.toContain('getCanvasAiPrototypeStartQuickPrompts');
    expect(source).not.toContain('getCanvasAiStartSystemPrompt');
    expect(source).not.toContain('getCanvasAiSceneDefinition');
    expect(source).not.toContain('pickCanvasAiStartPlaceholder');
    expect(source).not.toContain("import { createCanvasGenerationComposerDraftStorageKey } from '../../domains/shared/canvasGenerationComposerDraft';");
    expect(source).not.toContain('CanvasGenerationDisplayComposer');
    expect(source).toContain("type StartGuideKind = 'prototype' | 'resource' | 'design';");
    expect(source).toContain("const shouldShowPrototypeActions = kind === 'prototype';");
    expect(source).toContain("const shouldShowResourceActions = kind === 'resource';");
    expect(source).toContain("const shouldShowTopActions = shouldShowPrototypeActions || shouldShowResourceActions;");
    expect(source).not.toContain("const shouldShowDesignImportAction = kind === 'design';");
    expect(source).toContain("const shouldShowPrototypeCases = kind === 'prototype';");
    expect(source).not.toContain("const shouldUseImageStartSettings = activeScene === 'design' && kind !== 'design';");
    expect(source).toContain('onCreateResourceCanvasFile?: () => void | Promise<void>;');
    expect(source).toContain('onCreateDrawioResourceFile?: () => void | Promise<void>;');
    expect(startGuideSegment).not.toContain('onOpenDesignImport');
    expect(startGuideSegment).not.toContain('导入设计规范');
    expect(source).toContain('PrototypeStartSettingsPopover');
    expect(source).toContain('DocumentStartSettingsPopover');
    expect(startGuideSegment).toContain('我们先从哪里开始呢?');
    expect(startGuideSegment).toContain('px-6 py-10');
    expect(startGuideSegment).toContain('max-w-[960px]');
    expect(startGuideSegment).toContain('max-w-[1080px]');
    expect(startGuideSegment).not.toContain('<Segmented');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeThemeStartCardPrompt}');
    expect(startGuideSegment).not.toContain('更多模板');
    expect(startGuideSegment).toContain('导入原型');
    expect(startGuideSegment).toContain('导入任意网页');
    expect(startGuideSegment).toContain('Drawio 图表');
    expect(startGuideSegment).not.toContain('导入设计规范');
    expect(startGuideSegment).not.toContain('导入设计稿');
    expect(startGuideSegment).not.toContain('打开在线模板库');
    expect(startGuideSegment).toContain('原型案例');
    expect(startGuideSegment).toContain('templateCases');
    expect(startGuideSegment).toContain('TemplateLibraryCard');
    expect(startGuideSegment).toContain('renderTemplateCaseCard');
    expect(startGuideSegment).toContain('{shouldShowPrototypeCases ? (');
    expect(startGuideSegment).toContain('className="mb-3 flex flex-wrap items-center justify-between gap-3"');
    expect(startGuideSegment).toContain("fetch(withProjectScope('/api/template-library', requireProjectScope(activeProjectId)))");
    expect(startGuideSegment).toContain("if (!shouldShowPrototypeCases) {");
    expect(startGuideSegment).toContain('setTemplateCases([]);');
    expect(startGuideSegment).toContain('generateTemplateImportPrompt({');
    expect(startGuideSegment).toContain('void onRefreshPrototypes?.(String(result?.folderName || result?.name || \'\').trim());');
    expect(startGuideSegment).toContain('assistantProjectPath?: string;');
    for (const scene of ['页面', '设计图', '文档']) {
      expect(registrySource).toContain(scene);
    }
    expect(registrySource).not.toContain("label: '图表'");
    expect(registrySource).not.toContain("label: '其他'");
    expect(source).not.toContain("['页面', '设计稿', '文档', '图表', '其他']");
    expect(source).not.toContain('PROTOTYPE_PLACEHOLDER_SCENE_OPTIONS');
    expect(source).not.toContain('PROTOTYPE_PLACEHOLDER_QUICK_PROMPTS');
    expect(source).not.toContain('resolvePrototypePlaceholderScene');
    expect(source).not.toContain('上传设计稿');
    expect(startGuideSegment).not.toContain('showSelectors');
    expect(startGuideSegment).not.toContain('projectResourceTrees');
    expect(startGuideSegment).not.toContain('projectResourceItems');
    expect(startGuideSegment).not.toContain('externalFileDropTargetRef');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeThemeStartCardPrompt}');
    expect(startGuideSegment).toContain('autoSend: false');
    expect(startGuideSegment).not.toContain('w-full pt-24');
    expect(startGuideSegment).not.toContain('onClick={() => onSubmitPrototypeStartRequest?.({');
    expect(startGuideSegment).not.toContain('mt-5 flex flex-wrap items-center justify-center gap-2');
    expect(startGuideSegment).not.toContain('rounded-md border border-slate-200 bg-white px-3.5');
    expect(startGuideSegment).not.toContain('rounded-full border border-slate-200 bg-white px-4');
    expect(startGuideSegment).not.toContain('shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50');
    expect(startGuideSegment).not.toContain('打开画布创作原型');
    expect(startGuideSegment).not.toContain('新手对话技巧');
    expect(startGuideSegment).not.toContain('variant="inline-app-list"');
  });

  it('renders every resource capability in a quiet title-free grid', () => {
    const source = readContentAreaViewSource();
    const resourceGridSegment = readResourceStartPromptGridSource();
    const startPromptCardSegment = readStartPromptCardSource();
    const resourceCardsSegment = getSourceSegment(
      source,
      'const RESOURCE_START_PROMPT_CARDS',
      'type ImageStartParams',
    );
    const appDesignCardSegment = getSourceSegment(
      resourceCardsSegment,
      "id: 'city-roaming-app-design'",
      "id: 'park-control-dashboard'",
    );
    const dashboardCardSegment = getSourceSegment(
      resourceCardsSegment,
      "id: 'park-control-dashboard'",
      "id: 'axure-warehouse-prd'",
    );
    const documentCardsSegment = getSourceSegment(
      resourceCardsSegment,
      "id: 'axure-warehouse-prd'",
      '] as const satisfies readonly ResourceStartPromptCard[];',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    for (const title of [
      '生成 APP 设计图',
      '生成驾驶舱大屏',
      'Axure 转产品文档',
      '网页链接转产品文档',
      'APP 截图转产品文档',
      '生成产品需求文档',
      '生成业务流程图',
      '生成 Drawio 图表',
    ]) {
      expect(source).toContain(title);
    }
    expect(source).toContain('const RESOURCE_START_PROMPT_CARDS');
    expect(appDesignCardSegment).toContain("title: '生成 APP 设计图'");
    expect(appDesignCardSegment).toContain("imageSize: '1152x2048'");
    expect(appDesignCardSegment).not.toContain("imageSize: '2048x1152'");
    expect(dashboardCardSegment).toContain("title: '生成驾驶舱大屏'");
    expect(dashboardCardSegment).toContain("imageSize: '2048x1152'");
    expect(dashboardCardSegment).not.toContain("imageSize: '1152x2048'");
    expect(documentCardsSegment).not.toContain('imageSize:');
    expect(resourceCardsSegment).toContain('请访问并分析我提供的网页链接');
    expect(resourceCardsSegment).toContain('内容信息、功能模块、交互流程');
    expect(resourceCardsSegment).not.toContain('后台链接');
    expect(resourceCardsSegment).not.toContain('角色权限');
    expect(source.match(/prdPlanning: 'enable'/g)).toHaveLength(4);
    expect(source.match(/prdPlanning: 'disable'/g)).toHaveLength(2);
    expect(source).not.toContain('仓易通');
    expect(source).not.toContain('轻食订餐');
    expect(source).not.toContain('推断「');
    expect(source).toContain('信息不足处请标注待确认');
    expect(source).not.toContain("resource: ['document', 'design']");
    expect(source).not.toContain('const shouldShowSceneSwitcher = availableScenes.length > 1;');
    expect(startGuideSegment).not.toContain('常用资源');
    expect(startGuideSegment).toContain('<ResourceStartPromptGrid');
    expect(startGuideSegment).toContain('copyOnSelect');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onPrdPlanningChange={() => undefined}');
    expect(startGuideSegment).toContain('onImageSizeChange={() => undefined}');
    expect(resourceGridSegment).toContain('<StartPromptGrid ariaLabel="资源生成能力">');
    expect(resourceGridSegment).toContain('<StartPromptCard');
    expect(resourceGridSegment).toContain('key={card.id}');
    expect(resourceGridSegment).toContain('title={card.title}');
    expect(resourceGridSegment).not.toContain('role="listitem"');
    expect(resourceGridSegment).toContain('selectionDisabled={disabled}');
    expect(resourceGridSegment).not.toContain('sm:grid-cols-2');
    expect(resourceGridSegment).not.toContain('lg:grid-cols-4');
    expect(startPromptCardSegment).toContain('min-h-16');
    expect(startPromptCardSegment).toContain('rounded-[10px]');
    expect(startPromptCardSegment).not.toContain('shadow-');
    expect(resourceGridSegment).toContain('copyOnSelect');
    expect(resourceGridSegment).toContain('onExecute');
    expect(startGuideSegment).toContain('card.title.trim() && card.prompt.trim()');
  });

  it('renders theme source cards only on the design start guide', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).toContain("const THEME_START_PROMPT_CARDS");
    expect(startGuideSegment).toContain("kind === 'design'");
    expect(startGuideSegment).toContain('<ThemeStartPromptGrid');
    expect(startGuideSegment).toContain('cards={activeThemePromptCards}');
    expect(startGuideSegment).toContain('copyOnSelect');
    expect(startGuideSegment).toContain('onCopyPrompt={copyThemeStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeThemeStartCardPrompt}');
  });

  it('passes homepage project resource trees and file drop targets into placeholder composers', () => {
    const source = readContentAreaViewSource();
    const contentPropsSegment = getSourceSegment(
      source,
      'interface ContentAreaProps {',
      'function ProjectContentEmptyState(',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );
    const contentDestructureSegment = getSourceSegment(
      source,
      'export default function ContentArea({',
      '}: ContentAreaProps)',
    );
    const selectedPlaceholderRenderSegment = getSourceSegment(
      source,
      '<StartGuide',
      ') : viewMode === \'canvas\' ? (',
    );
    const draftPlaceholderRenderSegment = source.slice(
      source.lastIndexOf('<StartGuide'),
      source.indexOf(') : (\n                !hasPrototypeItems ? ('),
    );

    expect(contentPropsSegment).toContain('sidebarTrees?: Partial<Record<SidebarTreeTab, SidebarTreeNode[]>>;');
    expect(contentDestructureSegment).toContain('sidebarTrees,');
    expect(startGuideSegment).not.toContain('placeholderDropZoneRef');
    expect(startGuideSegment).not.toContain('projectResourceTrees={{');
    expect(startGuideSegment).not.toContain('projectResourceItems={{');
    expect(startGuideSegment).not.toContain('externalFileDropTargetRef={placeholderDropZoneRef}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeThemeStartCardPrompt}');
    expect(selectedPlaceholderRenderSegment).toContain('sidebarTrees={sidebarTrees}');
    expect(selectedPlaceholderRenderSegment).toContain('docsItems={docsItems}');
    expect(selectedPlaceholderRenderSegment).toContain('prototypes={prototypes}');
    expect(selectedPlaceholderRenderSegment).toContain('themes={themes}');
    expect(draftPlaceholderRenderSegment).toContain('sidebarTrees={sidebarTrees}');
    expect(draftPlaceholderRenderSegment).toContain('docsItems={docsItems}');
    expect(draftPlaceholderRenderSegment).toContain('prototypes={prototypes}');
    expect(draftPlaceholderRenderSegment).toContain('themes={themes}');
  });

  it('passes homepage placeholder scene settings and context into prompt optimization', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );
    expect(source).not.toContain("import { optimizeCanvasPrompt } from '../../domains/ai-generation/canvasPromptOptimization';");
    expect(source).not.toContain('CanvasPromptOptimizationRequest');
    expect(startGuideSegment).not.toContain('onOptimizePrompt=');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('autoSend: false');
  });

  it('opens start-guide prompts through the ordinary assistant entry without generation side effects', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(source, 'function StartGuide({', 'export default function ContentArea({');

    expect(source).toContain("import type { PromptExecutionMeta, PrototypeCreateDialogOpenOptions, SelectedResourceFolder } from '../../types/index-page.types';");
    expect(source).toContain('onExecutePrompt?: (prompt: string, meta: PromptExecutionMeta) => Promise<boolean | void> | boolean | void;');
    expect(startGuideSegment).toContain('onExecutePrompt={executePrototypeStartCardPrompt}');
    expect(startGuideSegment).toContain('autoSend: false');
    expect(source).not.toContain('handleSubmitPrototypeStartRequest');
    expect(source).not.toContain('onSubmitPrototypeStartRequest');
    expect(source).not.toContain('onCreatePrototypeForDraftStart');
    expect(source).not.toContain('startPlaceholderPrototypeGeneration');
  });

  it('uses conversation defaults for start guides and canvas defaults inside Excalidraw', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );

    expect(source).toContain('preferredModel?: string | null;');
    expect(source).toContain('canvasPromptClient?: PromptClientPreference;');
    expect(source).toContain('canvasModel?: string | null;');
    expect(source).toContain('preferredModel={preferredModel}');
    expect(standaloneCanvasBranch).toContain('preferredPromptClient={canvasPromptClient}');
    expect(standaloneCanvasBranch).toContain('preferredModel={canvasModel}');
  });

  it('persists prototype placeholder settings beside the retained composer draft', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).not.toContain("from './prototypePlaceholderSettingsStorage';");
    expect(source).not.toContain('createPrototypePlaceholderSettingsStorageKey');
    expect(source).not.toContain('writePrototypePlaceholderSettings');
    expect(startGuideSegment).not.toContain('placeholderStartSettingsStorageKey');
    expect(startGuideSegment).not.toContain('CanvasGenerationDisplayComposer');
  });

  it('keeps placeholder generation settings unspecified until the user picks values', () => {
    const source = readContentAreaViewSource();
    const prototypeSettingsSegment = getSourceSegment(
      source,
      'function PrototypeStartSettingsPopover({',
      'function ImageStartSettingsPopover({',
    );
    const imageSettingsSegment = getSourceSegment(
      source,
      'function ImageStartSettingsPopover({',
      'function StartGuide({',
    );
    const documentSettingsSegment = getSourceSegment(
      source,
      'function DocumentStartSettingsPopover({',
      'function StartGuide({',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).toContain("const UNSPECIFIED_START_SETTING_VALUE = '__unspecified__';");
    expect(source).toContain('type ImageStartParams = Omit<AiImageTaskParams');
    expect(source).toContain('output_format: undefined');
    expect(source).toContain('n: undefined');
    expect(startGuideSegment).not.toContain('useState<number | undefined>(undefined)');
    expect(startGuideSegment).not.toContain('useState<ImageStartParams>(DEFAULT_IMAGE_START_PARAMS)');
    expect(prototypeSettingsSegment).toContain("const summary = summaryItems.join(' · ') || '未指定';");
    expect(prototypeSettingsSegment).toContain('<SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>');
    expect(prototypeSettingsSegment).toContain('未指定');
    expect(prototypeSettingsSegment).toContain('value === UNSPECIFIED_START_SETTING_VALUE ? undefined : Number(value)');
    expect(imageSettingsSegment).toContain("].filter(Boolean).join(' · ') || '未指定';");
    expect(imageSettingsSegment).toContain('value={typeof params.n === \'number\' ? String(params.n) : UNSPECIFIED_START_SETTING_VALUE}');
    expect(imageSettingsSegment).toContain("updateParam('n', value === UNSPECIFIED_START_SETTING_VALUE ? undefined : Number(value))");
    expect(imageSettingsSegment).toContain('value={params.output_format || UNSPECIFIED_START_SETTING_VALUE}');
    expect(imageSettingsSegment).toContain("updateParam('output_format', value === UNSPECIFIED_START_SETTING_VALUE ? undefined : value as AiImageTaskParams['output_format'])");
    expect(prototypeSettingsSegment).toContain('FieldLabelWithHint');
    expect(prototypeSettingsSegment).toContain('label="方案数量"');
    expect(source).toContain('加载本地 explore-options（多方案探索）技能提示');
    expect(prototypeSettingsSegment).not.toContain('生成数量');
    expect(imageSettingsSegment).toContain('FieldLabelWithHint');
    expect(imageSettingsSegment).toContain('label="方案数量"');
    expect(source).toContain('移动端 1K');
    expect(source).toContain('移动端 2K');
    expect(source).toContain('移动端 4K');
    expect(source).toContain('PC 端 1K');
    expect(source).toContain('PC 端 2K');
    expect(source).toContain('PC 端 4K');
    expect(imageSettingsSegment).not.toContain('图片数量');
    expect(startGuideSegment).not.toContain("useState<CanvasDocumentFormat | ''>('')");
    expect(startGuideSegment).not.toContain('buildDocumentStartSettings');
    expect(startGuideSegment).not.toContain('documentTemplatesApi.read');
    expect(startGuideSegment).not.toContain('templateContent');
    expect(source).toContain("const DOCUMENT_START_FORMAT_OPTIONS = [\n    { label: 'Markdown 文档', value: 'md' },\n    { label: 'HTML 文档', value: 'html' },\n    { label: 'Mermaid 图表', value: 'mermaid' },\n    { label: 'Drawio 图表', value: 'drawio' },\n]");
    expect(source).not.toContain("{ label: 'HTML', value: 'html' }");
    expect(source).not.toContain("{ label: 'MD', value: 'md' }");
    expect(documentSettingsSegment).toContain("format: CanvasDocumentFormat | '';");
    expect(documentSettingsSegment).toContain("onFormatChange: (format: CanvasDocumentFormat | '') => void;");
    expect(documentSettingsSegment).toContain("const formatLabel = DOCUMENT_START_FORMAT_OPTIONS.find((option) => option.value === format)?.label || '';");
    expect(documentSettingsSegment).toContain("const summary = [formatLabel, visualSpecSummaryLabel, templateLabel, usePrdPlanning ? 'PRD 规划' : ''].filter(Boolean).join(' · ') || '未指定';");
    expect(documentSettingsSegment).toContain('value={format || UNSPECIFIED_START_SETTING_VALUE}');
    expect(documentSettingsSegment).toContain("onFormatChange(value === UNSPECIFIED_START_SETTING_VALUE ? '' : value as CanvasDocumentFormat)");
    expect(documentSettingsSegment).toContain('<SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>');
    expect(documentSettingsSegment).toContain('未指定');
    expect(documentSettingsSegment).toContain('FieldLabelWithHint');
    expect(documentSettingsSegment).toContain('label="文档格式"');
    expect(source).toContain('HTML 文档有更好的视觉效果，但会消耗更多 token');
    expect(documentSettingsSegment).toContain('label="模板"');
    expect(source).toContain('可以在项目设置中预览和编辑文档模板');
    expect(documentSettingsSegment).not.toContain("|| 'MD'");
  });

  it('shows split HTML visual themes with descriptions and keeps the default empty', () => {
    const source = readContentAreaViewSource();
    const documentSettingsSegment = getSourceSegment(
      source,
      'function DocumentStartSettingsPopover({',
      'function StartGuide({',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).toContain('type HtmlVisualSpecSkillId =');
    expect(source).toContain('DOCUMENT_HTML_VISUAL_SPEC_OPTIONS');
    expect(source).toContain("value: 'kami'");
    expect(source).toContain("label: 'Kami 纸感文档'");
    expect(source).toContain("description: '暖白纸张、墨蓝点缀、衬线标题，适合白皮书、简历、作品集和正式长文。'");
    expect(source).toContain("skillName: 'kami'");
    expect(source).toContain("githubUrl: 'https://github.com/tw93/kami'");
    expect(source).toContain("value: 'baoyu-classic'");
    expect(source).toContain("label: 'Baoyu 经典文章'");
    expect(source).toContain("themeInstruction: '使用 baoyu-markdown-to-html 的 default 主题：传统公众号文章排版，居中标题、分隔线和醒目的二级标题。'");
    expect(source).toContain("value: 'baoyu-grace'");
    expect(source).toContain("label: 'Baoyu 优雅文章'");
    expect(source).toContain("themeInstruction: '使用 baoyu-markdown-to-html 的 grace 主题：阴影、圆角卡片和精致引用块。'");
    expect(source).toContain("value: 'baoyu-simple'");
    expect(source).toContain("label: 'Baoyu 极简文章'");
    expect(source).toContain("themeInstruction: '使用 baoyu-markdown-to-html 的 simple 主题：干净留白和不对称圆角。'");
    expect(source).toContain("value: 'baoyu-modern'");
    expect(source).toContain("label: 'Baoyu 现代文章'");
    expect(source).toContain("themeInstruction: '使用 baoyu-markdown-to-html 的 modern 主题：大圆角、胶囊标题和更松的阅读节奏。'");
    expect(source).toContain("githubUrl: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html'");
    expect(source).toContain("value: 'html-presentations-terminal'");
    expect(source).toContain("label: 'HTML Presentation · Terminal'");
    expect(source).toContain("themeInstruction: '使用 html-presentations 的 terminal.css 主题：黑底绿字、等宽字体和终端扫描线感。'");
    expect(source).toContain("value: 'html-presentations-catppuccin'");
    expect(source).toContain("label: 'HTML Presentation · Catppuccin'");
    expect(source).toContain("themeInstruction: '使用 html-presentations 的 catppuccin 主题：暖暗色底和柔和粉彩强调色。'");
    expect(source).toContain("value: 'html-presentations-nord'");
    expect(source).toContain("label: 'HTML Presentation · Nord'");
    expect(source).toContain("themeInstruction: '使用 html-presentations 的 nord 主题：蓝灰冷调、克制安静。'");
    expect(source).toContain("githubUrl: 'https://github.com/ericmjl/skills/tree/main/skills/html-presentations'");
    expect(source).toContain("value: 'guizang-editorial'");
    expect(source).toContain("label: 'Guizang · 电子杂志风'");
    expect(source).toContain("themeInstruction: '使用 guizang-ppt-skill 的 Style A 电子杂志风：电子墨水、杂志排版和强叙事节奏。'");
    expect(source).toContain("value: 'guizang-swiss'");
    expect(source).toContain("label: 'Guizang · 瑞士国际主义'");
    expect(source).toContain("themeInstruction: '使用 guizang-ppt-skill 的 Style B 瑞士国际主义：网格、直角色块、发丝线和高饱和锚点色。'");
    expect(source).toContain("githubUrl: 'https://github.com/op7418/guizang-ppt-skill'");
    expect(startGuideSegment).not.toContain("useState<HtmlVisualSpecSkillId | ''>('')");
    expect(documentSettingsSegment).toContain("htmlVisualSpec: HtmlVisualSpecSkillId | '';");
    expect(documentSettingsSegment).toContain("onHtmlVisualSpecChange: (visualSpec: HtmlVisualSpecSkillId | '') => void;");
    expect(documentSettingsSegment).toContain('const visualSpecOption = DOCUMENT_HTML_VISUAL_SPEC_OPTIONS.find((option) => option.value === htmlVisualSpec) || null;');
    expect(documentSettingsSegment).toContain("const visualSpecSummaryLabel = format === 'html' ? visualSpecOption?.label : '';");
    expect(documentSettingsSegment).toContain("const summary = [formatLabel, visualSpecSummaryLabel, templateLabel, usePrdPlanning ? 'PRD 规划' : ''].filter(Boolean).join(' · ') || '未指定';");
    expect(documentSettingsSegment).toContain("value={htmlVisualSpec || UNSPECIFIED_START_SETTING_VALUE}");
    expect(documentSettingsSegment).toContain("onHtmlVisualSpecChange(value === UNSPECIFIED_START_SETTING_VALUE ? '' : value as HtmlVisualSpecSkillId)");
    expect(documentSettingsSegment).toContain('DOCUMENT_HTML_VISUAL_SPEC_OPTIONS.map((option) => (');
    expect(documentSettingsSegment).toContain("<SelectValue>{visualSpecOption?.label || '未指定'}</SelectValue>");
    expect(documentSettingsSegment).toContain('{option.description}');
    expect(documentSettingsSegment).not.toContain('暂未配置');
    expect(documentSettingsSegment).not.toContain('type="checkbox"');
  });

  it('keeps prototype alignment and exposes an opt-in PRD planning workflow for documents', () => {
    const source = readContentAreaViewSource();
    const prototypeSettingsSegment = getSourceSegment(
      source,
      'function PrototypeStartSettingsPopover({',
      'function ImageStartSettingsPopover({',
    );
    const documentSettingsSegment = getSourceSegment(
      source,
      'function DocumentStartSettingsPopover({',
      'function StartGuide({',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(startGuideSegment).not.toContain('prototypeNeedsRequirementsAnalysis');
    expect(startGuideSegment).not.toContain('documentUsePrdPlanning');
    expect(prototypeSettingsSegment).toContain('needsRequirementsAnalysis,');
    expect(prototypeSettingsSegment).toContain('onNeedsRequirementsAnalysisChange,');
    expect(documentSettingsSegment).toContain('usePrdPlanning,');
    expect(documentSettingsSegment).toContain('onUsePrdPlanningChange,');
    expect(prototypeSettingsSegment).toContain('需求分析');
    expect(documentSettingsSegment).toContain('PRD 规划');
    expect(prototypeSettingsSegment).toContain('label="需求分析"');
    expect(documentSettingsSegment).toContain('label="PRD 规划"');
    expect(source).toContain('不确定最终需要几篇 PRD 时开启');
    expect(source).toContain('需求和目标文档已经明确时关闭');
    expect(source).not.toContain('$requirements-exploration');
    expect(prototypeSettingsSegment).toContain('className="col-span-2 space-y-1.5"');
    expect(documentSettingsSegment).toContain('className="col-span-2 space-y-1.5"');
    expect(prototypeSettingsSegment).toContain('aria-label="原型需要需求分析"');
    expect(documentSettingsSegment).toContain('aria-label="文档使用 PRD 规划流程"');
    expect(prototypeSettingsSegment).toContain('checked={needsRequirementsAnalysis}');
    expect(documentSettingsSegment).toContain('checked={usePrdPlanning}');
    expect(prototypeSettingsSegment).toContain('onCheckedChange={(checked) => onNeedsRequirementsAnalysisChange(checked === true)}');
    expect(documentSettingsSegment).toContain('onCheckedChange={(checked) => onUsePrdPlanningChange(checked === true)}');
    expect(startGuideSegment).not.toContain('needsRequirementsAnalysis: prototypeNeedsRequirementsAnalysis');
    expect(startGuideSegment).not.toContain('documentUsePrdPlanning');
  });

  it('copies local AI prompt text from the composer and resource or design cards', () => {
    const source = readContentAreaViewSource();
    const prototypeSettingsSegment = getSourceSegment(
      source,
      'function PrototypeStartSettingsPopover({',
      'function ImageStartSettingsPopover({',
    );
    const imageSettingsSegment = getSourceSegment(
      source,
      'function ImageStartSettingsPopover({',
      'function DocumentStartSettingsPopover({',
    );
    const documentSettingsSegment = getSourceSegment(
      source,
      'function DocumentStartSettingsPopover({',
      'function StartGuide({',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).not.toContain('stripCanvasUpdateInstruction,');
    expect(source).not.toContain('CanvasGenerationDisplayComposer');
    expect(source).toContain("import { copyToClipboard } from '../../utils/clipboard';");
    expect(source).toContain("import { buildStartGuidePrompt } from './startGuidePrompt';");
    expect(startGuideSegment).toContain('const copyResourceStartCardPrompt = async (card: ResourceStartPromptCard) => {');
    expect(startGuideSegment).toContain('const copyThemeStartCardPrompt = async (card: ThemeStartPromptCard) => {');
    expect(startGuideSegment).toContain("finalGuide: 'local-ai-acknowledgement',");
    expect(startGuideSegment).toContain('scene: card.scene,');
    expect(startGuideSegment).toContain('card.imageSize ? applyResourceStartImageSize(effectiveImageStartParams, card.imageSize)');
    expect(startGuideSegment).toContain("usePrdPlanning: card.prdPlanning === 'enable',");
    expect(startGuideSegment).toContain('await copyToClipboard(prompt);');
    expect(startGuideSegment).toContain("toast.success('提示词已复制，请交给本地 AI 使用');");
    expect(startGuideSegment).toContain("toast.error(error instanceof Error ? error.message : '复制提示词失败');");
    expect(startGuideSegment).toContain('onCopyPrompt={copyResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onCopyPrompt={copyThemeStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeThemeStartCardPrompt}');
    expect(startGuideSegment).toContain('autoSend: false');
    expect(source).not.toContain("const COPY_START_PROMPT_TOOLTIP = '复制提示词给本地AI使用';");
    expect(source).not.toContain('function StartSettingsCopyPromptButton({ onCopyPrompt }');
    expect(source).not.toContain('aria-label={COPY_START_PROMPT_TOOLTIP}');
    for (const segment of [prototypeSettingsSegment, imageSettingsSegment, documentSettingsSegment]) {
      expect(segment).not.toContain('onCopyPrompt,');
      expect(segment).not.toContain('onCopyPrompt?: () => void;');
      expect(segment).not.toContain('<StartSettingsCopyPromptButton onCopyPrompt={onCopyPrompt} />');
    }
  });

  it('adds scoped placeholder header actions without restoring a design import entry', () => {
    const source = readContentAreaViewSource();
    const propsSegment = getSourceSegment(
      source,
      'interface ContentAreaProps {',
      'function ProjectContentEmptyState',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(propsSegment).toContain('onOpenPrototypeCreateDialog?: (options: PrototypeCreateDialogOpenOptions) => void;');
    expect(startGuideSegment).toContain('onOpenPrototypeCreateDialog');
    const topActionsSegment = getSourceSegment(
      startGuideSegment,
      '{shouldShowTopActions ? (',
      '<div className="w-full">',
    );
    expect(startGuideSegment).not.toContain("onOpenPrototypeCreateDialog?.({ initialTab: 'onlineImport', targetPrototypeName: draftActive ? undefined : item.name })");
    expect(startGuideSegment).toContain("onOpenPrototypeCreateDialog?.({ initialTab: 'upload', targetPrototypeName: draftActive ? undefined : item.name })");
    expect(topActionsSegment).not.toContain('更多模板');
    expect(startGuideSegment).not.toContain('更多模板');
    expect(startGuideSegment).not.toContain('更多模型');
    expect(topActionsSegment).toContain('导入原型');
    expect(startGuideSegment).toContain('导入任意网页');
    expect(topActionsSegment).toContain('上传资源');
    expect(topActionsSegment).toContain('画布');
    expect(topActionsSegment).toContain('Drawio 图表');
    expect(topActionsSegment).not.toContain('导入设计规范');
    expect(topActionsSegment).not.toContain('导入设计稿');
    expect(startGuideSegment).not.toContain('CanvasGenerationDisplayComposer');
    expect(startGuideSegment).toContain('Axhub Make / Axure / V0 / aistudio / Stitch / Figma Make');
    expect(startGuideSegment).toContain('使用 Chrome 扩展可以采集任意网页');
    expect(startGuideSegment).toContain('cursor-default');
    expect(startGuideSegment).not.toContain('ExternalLink');
    expect(startGuideSegment).toContain('UploadCloud');
    expect(startGuideSegment).toContain('Globe');
    expect(startGuideSegment).not.toContain('hover:underline');
  });

  it('progressively reveals the complete prototype template library in nine-item batches', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).toContain("import { useProgressiveLibraryItems } from '../../hooks/useProgressiveLibraryItems';");
    expect(startGuideSegment).toContain('useProgressiveLibraryItems(templateCases, activeProjectId)');
    expect(startGuideSegment).toContain('{visibleTemplateCases.map(renderTemplateCaseCard)}');
    expect(startGuideSegment).toContain('ref={templateCasesLoadMoreRef}');
    expect(startGuideSegment).toContain('aria-label="继续加载原型模板"');
    expect(startGuideSegment).not.toContain('PLACEHOLDER_TEMPLATE_CASE_LIMIT');
    expect(startGuideSegment).not.toContain('更多模板');
    expect(startGuideSegment).not.toContain("initialTab: 'onlineImport'");
  });

  it('shows the complete platform theme libraries with card previews and one import action', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(startGuideSegment).toContain("const shouldShowThemeCases = kind === 'design';");
    expect(source).toContain("type ThemeCatalogPlatform = 'desktop' | 'mobile';");
    expect(startGuideSegment).toContain("const [themePlatform, setThemePlatform] = useState<ThemeCatalogPlatform>('desktop');");
    expect(startGuideSegment).toContain('const [themeCatalogs, setThemeCatalogs] = useState<Record<ThemeCatalogPlatform, ThemeCatalogState>>');
    expect(startGuideSegment).toContain('const activeThemeCatalog = themeCatalogs[themePlatform].projectId === activeProjectId');
    expect(startGuideSegment).toContain("`/api/theme-library?platform=${requestedPlatform}`");
    expect(startGuideSegment).toContain('useProgressiveLibraryItems(');
    expect(startGuideSegment).toContain('activeThemeCatalog.items,');
    expect(startGuideSegment).toContain('themeProgressiveLoadArmed,');
    expect(startGuideSegment).toContain('const [themeProgressiveLoadArmed, setThemeProgressiveLoadArmed] = useState(false);');
    expect(startGuideSegment).toContain('setThemeProgressiveLoadArmed(false);');
    expect(startGuideSegment).toContain('if (shouldShowThemeCases) setThemeProgressiveLoadArmed(true);');
    expect(startGuideSegment).toContain("handleThemePlatformChange('desktop')");
    expect(startGuideSegment).toContain("handleThemePlatformChange('mobile')");
    expect(startGuideSegment).toContain("formatThemePlatformLabel('PC 端', themeCatalogs.desktop, activeProjectId)");
    expect(startGuideSegment).toContain("formatThemePlatformLabel('移动端', themeCatalogs.mobile, activeProjectId)");
    expect(source).toContain("const THEME_CATALOG_CACHE_KEY = 'axhub:start-guide-theme-catalogs:v1';");
    expect(source).toContain('function readThemeCatalogCache(): ThemeCatalogCache');
    expect(source).toContain('function writeThemeCatalogCacheEntry(');
    expect(startGuideSegment).toContain('createThemeCatalogStatesFromCache(activeProjectId)');
    expect(startGuideSegment).toContain('THEME_CATALOG_PLATFORMS.forEach((requestedPlatform) => {');
    expect(startGuideSegment).toContain('writeThemeCatalogCacheEntry(requestedPlatform, nextCatalog);');
    expect(startGuideSegment).toContain('正在使用已缓存目录');
    expect(startGuideSegment).toContain('>主题模板</h2>');
    expect(startGuideSegment).toContain('{visibleThemeCases.map(renderThemeCaseCard)}');
    expect(startGuideSegment).toContain('ref={themeCasesLoadMoreRef}');
    expect(startGuideSegment).toContain('aria-label="继续加载主题模板"');
    expect(startGuideSegment).toContain('onPreview={handlePreviewThemeCase}');
    expect(startGuideSegment).toContain('directImportLabel="导入"');
    expect(startGuideSegment).toContain('body: JSON.stringify({ themeId: theme.id, platform: theme.platform })');
    expect(source).toContain('onRefreshThemes?: () => void | Promise<void>;');
    expect(startGuideSegment).toContain('void onRefreshThemes?.();');
    expect(startGuideSegment).not.toContain('generateThemeLibraryImportPrompt');
    expect(startGuideSegment).not.toContain('designSystemId: theme.id');
    expect(source).toContain('function normalizeThemeCatalogCases(value: unknown): TemplateLibraryCardItem[]');
    expect(source).toContain("metaLabel: platform === 'desktop' ? 'PC 端' : '移动端'");
  });

  it('keeps placeholder header actions on a separate row below the desktop xl breakpoint', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );
    const contentStartIndex = startGuideSegment.indexOf('<div className="flex min-h-[76vh] w-full items-center justify-center">');
    const topActionsIndex = startGuideSegment.indexOf('{shouldShowTopActions ? (');
    const titleIndex = startGuideSegment.indexOf('我们先从哪里开始呢?');

    expect(contentStartIndex).toBeGreaterThan(-1);
    expect(topActionsIndex).toBeGreaterThan(contentStartIndex);
    expect(topActionsIndex).toBeLessThan(titleIndex);
    expect(startGuideSegment).toContain(
      'className="z-10 mb-5 flex w-full flex-wrap items-center justify-center gap-2 text-[12px] xl:absolute xl:right-6 xl:top-5 xl:mb-0 xl:w-auto xl:justify-end"',
    );
  });

  it('threads the resource upload start action through content area props', () => {
    const source = readContentAreaViewSource();
    const propsSegment = getSourceSegment(
      source,
      'interface ContentAreaProps {',
      'function ProjectContentEmptyState',
    );
    const contentDestructureSegment = getSourceSegment(
      source,
      'export default function ContentArea({',
      '}: ContentAreaProps)',
    );
    const resourceStartBranch = getSourceSegment(
      source,
      "if (contentMode === 'doc' && resourceStartDraftActive && !selectedDoc && !selectedResourceFolder) {",
      "        if (contentMode === 'doc' && selectedResourceFolder) {",
    );

    expect(propsSegment).toContain('onUploadResourceFiles?: () => void;');
    expect(contentDestructureSegment).toContain('onUploadResourceFiles,');
    expect(resourceStartBranch).toContain('onUploadResourceFiles={onUploadResourceFiles}');
  });

  it('adds a PNG-only transparent background switch to image start settings', () => {
    const source = readContentAreaViewSource();
    const imageSettingsSegment = getSourceSegment(
      source,
      'function ImageStartSettingsPopover({',
      'function StartGuide({',
    );

    expect(source).toContain("import { Switch } from '@/components/ui/switch';");
    expect(source).toContain("background: 'auto'");
    expect(imageSettingsSegment).toContain("const transparentBackgroundChecked = params.output_format === 'png' && params.background === 'transparent';");
    expect(imageSettingsSegment).toContain("transparentBackgroundChecked ? '透明背景' : null,");
    expect(imageSettingsSegment).toContain('aria-label="透明背景"');
    expect(imageSettingsSegment).toContain('透明背景');
    expect(imageSettingsSegment).toContain('label="透明背景"');
    expect(imageSettingsSegment).toContain("onCheckedChange={(checked) => updateParam('background', checked === true ? 'transparent' : 'auto')}");
    expect(imageSettingsSegment).toContain("disabled={!canUseTransparentBackground}");
    expect(imageSettingsSegment).not.toContain('<span className="text-xs font-medium text-muted-foreground">审核</span>');
    expect(imageSettingsSegment).not.toContain('moderation');
  });

  it('keeps design system and prompt optimization controls in image start settings', () => {
    const source = readContentAreaViewSource();
    const imageSettingsSegment = getSourceSegment(
      source,
      'function ImageStartSettingsPopover({',
      'function StartGuide({',
    );
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(imageSettingsSegment).toContain('selectedThemeName,');
    expect(imageSettingsSegment).toContain('themeLabel,');
    expect(imageSettingsSegment).toContain('themes,');
    expect(imageSettingsSegment).toContain('onThemeChange,');
    expect(imageSettingsSegment).toContain("const hasSelectedTheme = selectedThemeName !== NO_PROTOTYPE_THEME_VALUE;");
    expect(imageSettingsSegment).toContain("hasSelectedTheme ? themeLabel : null,");
    expect(imageSettingsSegment).toContain('设计系统');
    expect(imageSettingsSegment).toContain('label="设计系统"');
    expect(imageSettingsSegment).toContain('label="禁止优化提示词"');
    expect(imageSettingsSegment).toContain('<PrototypeThemeSearchSelect');
    expect(imageSettingsSegment).toContain('themes={themes}');
    expect(imageSettingsSegment).toContain('value={selectedThemeName}');
    expect(imageSettingsSegment).toContain('onValueChange={onThemeChange}');
    expect(imageSettingsSegment).toContain("const disablePromptOptimizationChecked = hasSelectedTheme || params.disable_prompt_optimization === true;");
    expect(imageSettingsSegment).toContain('aria-label="禁止优化提示词"');
    expect(imageSettingsSegment).toContain('禁止优化提示词');
    expect(imageSettingsSegment).toContain("onCheckedChange={(checked) => updateParam('disable_prompt_optimization', checked === true)}");
    expect(imageSettingsSegment).toContain('disabled={hasSelectedTheme}');
    expect(imageSettingsSegment).toContain('className="grid grid-cols-2 gap-3"');
    expect(imageSettingsSegment).toContain('className="col-span-2 space-y-1.5"');
    expect(imageSettingsSegment).toContain('className="col-span-2 grid grid-cols-2 gap-3"');
    expect(imageSettingsSegment).toContain('className={`space-y-1.5 text-xs font-medium');
    expect(imageSettingsSegment).not.toContain('className="space-y-2 pt-1"');
    expect(imageSettingsSegment).not.toContain('rounded-md border border-border/60 bg-muted/20 p-2');
    expect(imageSettingsSegment).not.toContain('justify-between gap-3 rounded-sm px-1.5');
    expect(startGuideSegment).toContain('themeName: selectedThemeName === NO_PROTOTYPE_THEME_VALUE ? \'\' : selectedTheme?.name || \'\'');
    expect(startGuideSegment).toContain('disable_prompt_optimization: selectedThemeName !== NO_PROTOTYPE_THEME_VALUE');
    expect(startGuideSegment).not.toContain('<ImageStartSettingsPopover');
  });

  it('uses ACP selector-sized icons for prototype start settings triggers only', () => {
    const source = readContentAreaViewSource();

    expect(source).toContain('data-axhub-prototype-start-settings-trigger');
    expect(source).toContain('data-axhub-image-start-settings-trigger');
    expect(source).toContain('<SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />');
    expect(source).toContain('<ChevronDown className="size-3 shrink-0" aria-hidden="true" />');
  });

  it('uses the searchable design system selector in prototype start settings', () => {
    const source = readContentAreaViewSource();

    expect(source).toContain("import { PrototypeThemeSearchSelect } from '../../domains/prototype-generation/PrototypeThemeSearchSelect';");
    expect(source).toContain('<PrototypeThemeSearchSelect');
    expect(source).toContain('themes={themes}');
    expect(source).toContain('value={selectedThemeName}');
    expect(source).toContain('onValueChange={onThemeChange}');
    expect(source).not.toContain('<span className="text-xs font-medium text-muted-foreground">设计系统</span>\n                            <Select value={selectedThemeName}');
  });

  it('keeps unsupported resource fallback metadata and open action aligned across docs and templates', () => {
    const source = readContentAreaViewSource();
    const markdownPreviewSegment = getSourceSegment(
      source,
      "if (contentMode === 'doc' || contentMode === 'template' || contentMode === 'prototype-spec') {",
      "    if (contentMode === 'theme') {",
    );
    const unsupportedFallbackSegment = getSourceSegment(
      source,
      'if (!canPreviewInIframe) {',
      '        return (\n            <div className="h-full min-h-0 bg-background">',
    );

    expect(source).toContain("import { resolveMarkdownPreviewIframeUrl } from '../../utils/markdownPreview';");
    expect(markdownPreviewSegment).toContain("contentMode === 'template' ? 'template' : 'doc',");
    expect(markdownPreviewSegment).toContain("const canPreviewInIframe = markdownIframeUrl.includes('/spec-template.html') || candidateFields.some(");
    expect(markdownPreviewSegment).toContain('src={markdownIframeUrl}');
    expect(markdownPreviewSegment).not.toContain('src={selectedMarkdownItem.previewUrl || selectedMarkdownItem.specUrl}');
    expect(unsupportedFallbackSegment).toContain('const fileSize = selectedMarkdownItem.fileSize;');
    expect(unsupportedFallbackSegment).toContain("type: contentMode === 'template' ? 'templates' : 'docs'");
    expect(unsupportedFallbackSegment).not.toContain('const fileSize = (selectedMarkdownItem as any).fileSize;');
  });

  it('passes ACP selector and project resource context into start guide composers', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );
    const placeholderRenderSegment = getSourceSegment(
      source,
      '<StartGuide',
      ') : viewMode === \'canvas\' ? (',
    );
    const contentAreaPropsSegment = getSourceSegment(
      source,
      'export default function ContentArea({',
      '}: ContentAreaProps)',
    );
    expect(contentAreaPropsSegment).toContain('assistantVisible,');
    expect(contentAreaPropsSegment).toContain('preferredPromptClient,');
    expect(contentAreaPropsSegment).toContain('aiPanelMode,');
    expect(contentAreaPropsSegment).toContain('onExecutePrompt,');
    expect(startGuideSegment).toContain('preferredPromptClient,');
    expect(startGuideSegment).toContain('preferredPromptClient?: PromptClientPreference;');
    expect(startGuideSegment).not.toContain('showSelectors');
    expect(startGuideSegment).not.toContain('disableEditingWithoutConfiguredAgent');
    expect(startGuideSegment).not.toContain('workspacePath={assistantProjectPath}');
    expect(startGuideSegment).not.toContain('projectResourceTrees={{');
    expect(startGuideSegment).not.toContain('projectResourceItems={{');
    expect(startGuideSegment).toContain('onExecutePrompt={executeResourceStartCardPrompt}');
    expect(startGuideSegment).toContain('onExecutePrompt={executeThemeStartCardPrompt}');
    expect(startGuideSegment).toContain('autoSend: false');
    expect(placeholderRenderSegment).toContain('preferredPromptClient={preferredPromptClient}');
    expect(placeholderRenderSegment).toContain('sidebarTrees={sidebarTrees}');
    expect(placeholderRenderSegment).toContain('docsItems={docsItems}');
    expect(placeholderRenderSegment).toContain('prototypes={prototypes}');
  });

  it('uses the project default design for prototype start settings until the user picks one', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(source).toContain('defaultThemeName?: string | null;');
    expect(startGuideSegment).toContain('defaultThemeName,');
    expect(startGuideSegment).toContain('resolvePrototypeGenerationInitialThemeName(themes, defaultThemeName)');
    expect(startGuideSegment).not.toContain('previousDefaultThemeNameRef');
    expect(startGuideSegment).not.toContain('userSelectedThemeRef');
    expect(startGuideSegment).toContain('const selectedThemeName = resolvePrototypeGenerationInitialThemeName(themes, defaultThemeName);');
  });

  it('keeps placeholder content free of the obsolete waiting-generation submission path', () => {
    const source = readContentAreaViewSource();

    expect(source).not.toContain('apiService.startPlaceholderPrototypeGeneration');
    expect(source).not.toContain('onRefreshPrototypes?.(startItem.name)');
    expect(source).not.toContain('createdPrototype: startItem');
    expect(source).not.toContain('onSubmitPrototypeStartRequest=');
    expect(source).toContain('assistantProjectPath={assistantProjectPath}');
  });

  it('keeps prototype start drafts as prompt-only guides until the user creates a resource', () => {
    const source = readContentAreaViewSource();
    const propsSegment = getSourceSegment(
      source,
      'interface ContentAreaProps {',
      'function ProjectContentEmptyState',
    );
    const draftStartBranch = getSourceSegment(
      source,
      ') : prototypeStartDraftActive ? (',
      ') : (',
    );

    expect(propsSegment).toContain('prototypeStartDraftActive?: boolean;');
    expect(propsSegment).not.toContain('onCreatePrototypeForDraftStart');
    expect(source).toContain('const draftPrototypeStartItem = useMemo<ItemData>(() => ({');
    expect(source).not.toContain('onCreatePrototypeForDraftStart?.()');
    expect(source).not.toContain('startPrototypeLocalContextRef');
    expect(draftStartBranch).toContain('item={draftPrototypeStartItem}');
    expect(draftStartBranch).toContain('draftActive={prototypeStartDraftActive && !selectedItem}');
    expect(draftStartBranch).toContain('onExecutePrompt={onExecutePrompt}');
  });

  it('does not render the prototype start canvas action inside the placeholder content', () => {
    const source = readContentAreaViewSource();
    const startGuideSegment = getSourceSegment(
      source,
      'function StartGuide({',
      'export default function ContentArea({',
    );

    expect(startGuideSegment).not.toContain('onOpenPrototypeStartCanvas?: () => void | Promise<void>;');
    expect(startGuideSegment).not.toContain('onOpenPrototypeStartCanvas,');
    expect(startGuideSegment).not.toContain('className="sticky top-0 z-10 flex justify-end px-2 pb-4"');
    expect(startGuideSegment).not.toContain('aria-label="打开画布"');
    expect(startGuideSegment).not.toContain('<PencilRuler className="h-4 w-4" />');
    expect(source).not.toContain('const handleOpenPrototypeStartCanvas = async () => {');
    expect(source).not.toContain('onOpenPrototypeStartCanvas={handleOpenPrototypeStartCanvas}');
  });

  it('keeps the placeholder start canvas empty while the sidebar owns generation', () => {
    const source = readContentAreaViewSource();
    const prototypeCanvasBranch = getSourceSegment(
      source,
      ") : viewMode === 'canvas' ? (",
      ") : (",
    );

    expect(prototypeCanvasBranch).not.toContain('pendingAiGenerationRequest=');
    expect(prototypeCanvasBranch).not.toContain('onPendingAiGenerationRequestConsumed=');
    expect(source).toContain('onSubmitCanvasAssistantPrompt={onSubmitCanvasAssistantPrompt}');
  });

  it('renders waiting generation prototypes through the normal preview iframe path', () => {
    const source = readContentAreaViewSource();
    const selectedItemBranchStart = source.indexOf('{selectedItem ? (');
    const canvasBranchStart = source.indexOf(") : viewMode === 'canvas' ? (", selectedItemBranchStart);
    expect(selectedItemBranchStart).toBeGreaterThan(-1);
    expect(canvasBranchStart).toBeGreaterThan(selectedItemBranchStart);
    const selectedPrototypeBranch = source.slice(selectedItemBranchStart, canvasBranchStart);

    expect(source).not.toContain('function PrototypeWaitingGenerationState({');
    expect(source).not.toContain('正在生成原型');
    expect(selectedPrototypeBranch).not.toContain("selectedItem.generationStatus === 'waiting' && viewMode === 'demo' ? (");
    expect(selectedPrototypeBranch).toContain("selectedItem.placeholder === true && viewMode === 'demo' ? (");
    expect(source).toContain('renderScaledIframe(');
  });

  it('passes sidebar-owned canvas AI submissions into both canvas render paths', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );

    expect(standaloneCanvasBranch).toContain('onSubmitCanvasAssistantPrompt={onSubmitCanvasAssistantPrompt}');
    expect(source).not.toContain('onSubmitPrototypeAssistantPrompt={');
  });

  it('does not pass assistant artifact query callbacks into canvas render paths', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );
    const prototypeCanvasBranch = getSourceSegment(
      source,
      ") : viewMode === 'canvas' ? (",
      ") : (",
    );

    expect(source).not.toContain("import type { AssistantArtifactsQuery } from '../../domains/assistant/assistantArtifactBridge';");
    expect(source).not.toContain('getAssistantArtifacts?: AssistantArtifactsQuery;');
    expect(standaloneCanvasBranch).not.toContain('getAssistantArtifacts=');
    expect(prototypeCanvasBranch).not.toContain('getAssistantArtifacts=');
  });

  it('removes the prototype preview button from canvas overlays and forwards AI menu props', () => {
    const source = readContentAreaViewSource();
    const standaloneCanvasBranch = getSourceSegment(
      source,
      "if (contentMode === 'canvas') {",
      '    return (\n        <div\n            ref={containerRef}',
    );
    const prototypeCanvasBranch = getSourceSegment(
      source,
      ") : viewMode === 'canvas' ? (",
      ") : (",
    );

    expect(source).not.toContain('function CanvasPlayPrototypeButton');
    expect(source).not.toContain('<CanvasPlayPrototypeButton');
    expect(source).not.toContain('<Play />');
    expect(source).not.toContain('<span>预览</span>');

    expect(standaloneCanvasBranch).toContain('preferredIDE={preferredIDE}');
    expect(standaloneCanvasBranch).toContain('ideAvailability={ideAvailability}');
    expect(standaloneCanvasBranch).toContain('agentAvailability={agentAvailability}');
    expect(standaloneCanvasBranch).toContain('onOpenAcpWebAgent={onOpenAcpWebAgent}');
    expect(standaloneCanvasBranch).toContain('webAgentPanelOpen={webAgentPanelOpen}');
    expect(standaloneCanvasBranch).toContain('onCloseWebAgentPanel={onCloseWebAgentPanel}');
    expect(standaloneCanvasBranch).toContain('onPreferredIDEChange={onPreferredIDEChange}');
    expect(standaloneCanvasBranch).not.toContain('onRefreshAvailability={onRefreshAvailability}');
    expect(standaloneCanvasBranch).toContain('onOpenAISettings={onOpenAISettings}');
    expect(standaloneCanvasBranch).toContain('overlayChildren={<CanvasFloatingToolbar />}');
    expect(prototypeCanvasBranch).toContain('画布现在作为资源文件管理，请在资源中打开 .excalidraw 文件');
    expect(prototypeCanvasBranch).not.toContain('preferredIDE={preferredIDE}');
    expect(prototypeCanvasBranch).not.toContain('overlayChildren={<CanvasFloatingToolbar />}');
    expect(prototypeCanvasBranch).not.toContain('showPrototypePreviewHint={canPlayPrototypePreview}');
  });

  it('uses the normal desktop iframe path after removing review-specific zoom', () => {
    const source = readContentAreaViewSource();
    const desktopBranch = getSourceSegment(
      source,
      ") : previewLayout.single.kind === 'desktop' ? (",
      ") : previewLayout.single.kind === 'custom' ? (",
    );

    expect(source).toContain('DEVICE_PRESET_SIZES');
    expect(source).not.toContain('reviewPageZoomEnabled?: boolean;');
    expect(source).not.toContain('const desktopReviewZoomLayout = useMemo');
    expect(source).not.toContain('reviewPageZoomEnabled && viewMode === \'demo\'');
    expect(desktopBranch).toContain('<iframe');
    expect(desktopBranch).toContain('ref={previewIframeRef}');
    expect(desktopBranch).toContain('src={primaryIframeUrl}');
    expect(desktopBranch).not.toContain('desktopReviewZoomLayout.enabled');
    expect(desktopBranch).not.toContain('renderScaledIframe(');
    expect(desktopBranch).not.toContain('handleChangePreviewScaleMode');
  });

  it('preserves usable preview dimensions and remeasures after device mode changes', () => {
    const source = readContentAreaViewSource();
    const measurementEffect = getSourceSegment(
      source,
      '    useEffect(() => {\n        const node = containerRef.current;',
      '    const previewLayout = useMemo',
    );

    expect(source).toContain('resolveStablePreviewContainerSize,');
    expect(measurementEffect).toContain('const previous = previewContainerSizeRef.current;');
    expect(measurementEffect).toContain('const next = resolveStablePreviewContainerSize({');
    expect(measurementEffect).toContain('setPreviewContainerSize(next);');
    expect(measurementEffect).toContain('handlePreviewContainerSizeChange(next.width);');
    expect(measurementEffect).toContain('clientWidth: node.clientWidth,');
    expect(measurementEffect).toContain('clientHeight: node.clientHeight,');
    expect(measurementEffect).toContain('const animationFrameId = window.requestAnimationFrame(updateSize);');
    expect(measurementEffect).toContain('window.cancelAnimationFrame(animationFrameId);');
    expect(measurementEffect).toContain('assistantVisible,');
    expect(measurementEffect).toContain('previewConfig.previewMode,');
    expect(measurementEffect).toContain('previewConfig.singlePreset,');
    expect(measurementEffect).not.toContain('Math.max(1, node.clientWidth - 48)');
    expect(measurementEffect).not.toContain('Math.max(1, node.clientHeight - 32)');
  });

  it('shows pane-scoped prompt buttons in split preview title bars only while quick edit is active', () => {
    const source = readContentAreaViewSource();
    const splitBranch = getSourceSegment(
      source,
      "previewLayout.mode === 'split' ? (",
      ") : previewLayout.single.kind === 'desktop' ? (",
    );

    expect(source).toContain("from 'lucide-react';");
    expect(source).toContain('Monitor');
    expect(source).toContain('Smartphone');
    expect(source).toContain('Play');
    expect(source).toContain('CircleHelp');
    expect(source).toContain('quickEditActive?: boolean;');
    expect(source).toContain("onRunPrototypePanePromptAction?: (pane: 'primary' | 'secondary', action: 'copy-prompt' | 'send-to-agent') => void | Promise<boolean>;");
    expect(source).toContain('const renderSplitPromptActions = (pane:');
    expect(source).toContain("title=\"复制本视窗提示词\"");
    expect(source).toContain("aria-label=\"复制本视窗提示词\"");
    expect(source).toContain("title=\"执行本视窗批注\"");
    expect(source).toContain("aria-label=\"执行本视窗批注\"");
    expect(source).toContain('quickEditActive && onRunPrototypePanePromptAction');
    expect(splitBranch).toContain("renderSplitPromptActions('primary')");
    expect(splitBranch).toContain("renderSplitPromptActions('secondary')");
  });

  it('routes multi-page preview through the dedicated canvas without changing split or single branches', () => {
    const source = readContentAreaViewSource();
    const multiPageBranch = getSourceSegment(
      source,
      "previewLayout.mode === 'multi-page' ? (",
      ") : previewLayout.mode === 'split' ? (",
    );

    expect(source).toContain("import MultiPagePreviewCanvas from './MultiPagePreviewCanvas';");
    expect(source).toContain('handleChangeMultiPageColumns: (columns: MultiPageColumns) => void;');
    expect(source).toContain('handleChangeMultiPageColumns,');
    expect(source).toContain('handleSelectPreviewSinglePreset,');
    expect(source).toContain('handleSelectCustomPreview,');
    expect(source).toContain('handleActivateMultiPagePreview,');
    expect(source).toContain('handleChangeCustomPreviewWidth,');
    expect(source).toContain('handleChangeCustomPreviewHeight,');
    expect(source).toContain('handleChangePreviewScaleMode,');
    expect(source).toContain("previewLayout.mode === 'split' || previewLayout.mode === 'multi-page' ? 'overflow-hidden' : 'overflow-auto'");
    expect(multiPageBranch).toContain('<MultiPagePreviewCanvas');
    expect(multiPageBranch).toContain('selectedItem={selectedItem}');
    expect(multiPageBranch).toContain('previewConfig={previewConfig}');
    expect(multiPageBranch).toContain('layout={previewLayout.multiPage}');
    expect(multiPageBranch).toContain('previewUrl={primaryIframeUrl}');
    expect(multiPageBranch).toContain('iframeKey={elementIframeKey}');
    expect(multiPageBranch).toContain('previewIframeRef={previewIframeRef}');
    expect(multiPageBranch).toContain('onPreviewIframeLoad={onPreviewIframeLoad}');
    expect(multiPageBranch).toContain('handleChangeMultiPageColumns={handleChangeMultiPageColumns}');
    expect(multiPageBranch).toContain('handleSelectPreviewSinglePreset={handleSelectPreviewSinglePreset}');
    expect(multiPageBranch).toContain('handleSelectCustomPreview={handleSelectCustomPreview}');
    expect(multiPageBranch).toContain('handleActivateMultiPagePreview={handleActivateMultiPagePreview}');
    expect(multiPageBranch).toContain('handleChangeCustomPreviewWidth={handleChangeCustomPreviewWidth}');
    expect(multiPageBranch).toContain('handleChangeCustomPreviewHeight={handleChangeCustomPreviewHeight}');
    expect(multiPageBranch).not.toContain('handleChangePreviewScaleMode={handleChangePreviewScaleMode}');
  });
});
