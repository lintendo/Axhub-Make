import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readToolSource() {
  return readFileSync(resolve(__dirname, './CanvasAiGenerationTool.tsx'), 'utf8');
}

function readModelSource() {
  return readFileSync(resolve(__dirname, './canvasAiGeneration.ts'), 'utf8');
}

function readRegistrySource() {
  return readFileSync(resolve(__dirname, './canvasAiSceneRegistry.ts'), 'utf8');
}

describe('CanvasAiGenerationTool source', () => {
  it('keeps scene metadata while the canvas tool no longer creates AI placeholder nodes', () => {
    const toolSource = readToolSource();
    const modelSource = readModelSource();
    const registrySource = readRegistrySource();

    expect(modelSource).toContain("export const CANVAS_AI_GENERATION_CUSTOM_TYPE = 'axhub-ai-generation';");
    expect(modelSource).toContain("export const CANVAS_AI_GENERATION_TITLE = 'AI 生成';");
    expect(toolSource).not.toContain('createCanvasAiGenerationElement');
    expect(toolSource).not.toContain('isCanvasAiGenerationElement');
    expect(registrySource).toContain('CANVAS_AI_SCENE_OPTIONS');
  });

  it('keeps the canvas request contract for all three purpose routes', () => {
    const source = readToolSource();

    expect(source).toContain("'placeholder-start' | 'resource-start' | 'theme-start' | 'canvas-start' | 'canvas-viewport' | 'annotation-prompt-card'");
    expect(source).toContain('provider?: string | null;');
    expect(source).toContain('model?: string | null;');
    expect(source).toContain('onSubmitCanvasAssistantPrompt?: (request: CanvasAiGenerationRequest)');
  });

  it('renders only the compact one-click canvas AI launcher', () => {
    const source = readToolSource();

    expect(source).toContain('data-axhub-canvas-start-ai-launcher');
    expect(source).toContain('aria-label={canvasViewportRunActive ? \'画布 AI 正在处理\' : \'根据当前画布生成\'}');
    expect(source).toContain('<Sparkles className="size-[17px]" aria-hidden="true" />');
    expect(source).not.toContain('SlidersHorizontal');
    expect(source).not.toContain('打开画布 AI 输入框');
    expect(source).not.toContain('data-axhub-canvas-start-composer');
    expect(source).not.toContain('<CanvasGenerationDisplayComposer');
    expect(source).not.toContain('canvasStartComposerOpen');
  });

  it('uses the configured canvas provider and model for viewport generation', () => {
    const source = readToolSource();
    const submitStart = source.indexOf('const handleCanvasViewportAiSubmit = useCallback');
    const submitSource = source.slice(submitStart, source.indexOf('useEffect(() => () => {', submitStart));

    expect(submitSource).toContain('resolveAcpPromptClientProvider(normalizePromptClientPreference(preferredPromptClient))');
    expect(submitSource).toContain("toast.warning('请先在 AI 设置中配置画布 AI');");
    expect(submitSource).toContain('provider,');
    expect(submitSource).toContain('model: preferredModel,');
    expect(submitSource).toContain("source: 'canvas-viewport'");
    expect(submitSource).toContain('referenceImages: [screenshot],');
  });

  it('shows a running state and a dedicated cancel action', () => {
    const source = readToolSource();

    expect(source).toContain('disabled={canvasViewportRunActive}');
    expect(source).toContain('<Loader2 className="size-[17px] animate-spin" aria-hidden="true" />');
    expect(source).toContain('aria-label="取消当前画布 AI 任务"');
    expect(source).toContain('onClick={handleCanvasViewportAiCancel}');
    expect(source).toContain('void canvasViewportActiveRunRef.current?.abort();');
  });

  it('keeps request failures beside the canvas AI launcher until retry or dismissal', () => {
    const source = readToolSource();
    const cancelStart = source.indexOf('const handleCanvasViewportAiCancel = useCallback');
    const cancelEnd = source.indexOf('}, []);', cancelStart) + '}, []);'.length;
    const cancelSource = source.slice(cancelStart, cancelEnd);

    expect(source).toContain('const [canvasViewportError, setCanvasViewportError] = useState<string | null>(null);');
    expect(source).toContain('const reportCanvasViewportError = useCallback((error: unknown) => {');
    expect(source).toContain('setCanvasViewportError(message);');
    expect(source).toContain('toast.error(message);');
    expect(source).toContain('setCanvasViewportError(null);');
    expect(source).toContain('data-axhub-canvas-start-ai-error');
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-label="关闭画布 AI 错误提示"');
    expect(cancelSource).not.toContain('reportCanvasViewportError');
    expect(cancelSource).not.toContain('setCanvasViewportError');
  });

  it('captures the visible canvas and preserves its direct-run conversation', () => {
    const source = readToolSource();

    expect(source).toContain('const capture = await captureViewport();');
    expect(source).toContain("const screenshot = String(capture.dataUrl || '').trim();");
    expect(source).toContain('createCanvasViewportAiSessionStore(window.localStorage)');
    expect(source).toContain('viewportRect: capture.viewportRect,');
    expect(source).toContain('visibleElementIds: capture.visibleElementIds,');
    expect(source).toContain('threadId: session.threadId,');
    expect(source).toContain('conversationId: session.conversationId,');
    expect(source).toContain('maxActiveRuns: 1');
  });

  it('logs viewport AI timing through first response and terminal state', () => {
    const source = readToolSource();
    const submitStart = source.indexOf('const handleCanvasViewportAiSubmit = useCallback');
    const submitSource = source.slice(submitStart, source.indexOf('useEffect(() => () => {', submitStart));

    expect(source).toContain("import { createCanvasViewportAiTiming } from './canvasViewportAiTiming';");
    expect(submitSource.indexOf('const timing = createCanvasViewportAiTiming({'))
      .toBeLessThan(submitSource.indexOf('const capture = await captureViewport();'));
    expect(submitSource).toContain('onEvent: timing.handleStreamEvent,');
    expect(submitSource).toContain('timing.accepted(payload);');
    expect(submitSource).toContain('timing.aborted();');
    expect(submitSource).toContain('timing.failed(result.error);');
    expect(submitSource).toContain('timing.completed();');
  });

  it('does not expose removed AI image detail entry points', () => {
    const source = readToolSource();

    expect(source).not.toContain('AiImageDetailDialog');
    expect(source).not.toContain('handleCreateImageToImage');
    expect(source).not.toContain('handleCreateImageToPrototype');
  });
});
