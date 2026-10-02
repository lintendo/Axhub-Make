import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readPresentationPropsBuilderSource() {
  return readFileSync(resolve(__dirname, './useIndexPagePresentationPropsBuilder.ts'), 'utf8');
}

describe('useIndexPagePresentationPropsBuilder source', () => {
  it('preserves the manual-send flag in the prompt execution contract', () => {
    const source = readPresentationPropsBuilderSource();

    expect(source).toContain('PromptExecutionMeta');
    expect(source).toContain('onExecutePrompt?: (prompt: string, meta: PromptExecutionMeta)');
  });

  it('forwards the Make shell-owned Commentary voice entry to the presentation area', () => {
    const source = readPresentationPropsBuilderSource();

    expect(source).toContain('commentaryVoiceEntry?: ReactNode;');
    expect(source).toContain('commentaryVoiceEntry: state.commentaryVoiceEntry,');
  });

  it('forwards preview container width measurements into preview actions', () => {
    const source = readPresentationPropsBuilderSource();

    expect(source).toContain('handlePreviewContainerSizeChange: preview.handlePreviewContainerSizeChange,');
  });

  it('forwards resource and design start draft state into the presentation area', () => {
    const source = readPresentationPropsBuilderSource();

    expect(source).toContain('resourceStartDraftActive?: boolean;');
    expect(source).toContain('themeStartDraftActive?: boolean;');
    expect(source).toContain('resourceStartDraftActive: state.resourceStartDraftActive,');
    expect(source).toContain('themeStartDraftActive: state.themeStartDraftActive,');
  });

  it('forwards resource and design start actions into the presentation area', () => {
    const source = readPresentationPropsBuilderSource();

    expect(source).toContain('onUploadResourceFiles?: () => void;');
    expect(source).toContain('onCreateResourceCanvasFile?: () => void | Promise<void>;');
    expect(source).toContain('onCreateDrawioResourceFile?: () => void | Promise<void>;');
    expect(source).toContain('onOpenDesignImport?: () => void;');
    expect(source).toContain('onRefreshThemes?: () => void | Promise<void>;');
    expect(source).toContain('onUploadResourceFiles: actions.onUploadResourceFiles,');
    expect(source).toContain('onCreateResourceCanvasFile: actions.onCreateResourceCanvasFile,');
    expect(source).toContain('onCreateDrawioResourceFile: actions.onCreateDrawioResourceFile,');
    expect(source).toContain('onOpenDesignImport: actions.onOpenDesignImport,');
    expect(source).toContain('onRefreshThemes: actions.onRefreshThemes,');
  });

  it('forwards conversation and canvas AI defaults independently', () => {
    const source = readPresentationPropsBuilderSource();

    expect(source).toContain('preferredModel: state.preferredModel,');
    expect(source).toContain('canvasPromptClient: state.canvasPromptClient,');
    expect(source).toContain('canvasModel: state.canvasModel,');
  });

  it('uses surface capabilities to remove conversation UI without disabling direct canvas execution', () => {
    const source = readPresentationPropsBuilderSource();

    expect(source).toContain('surfaceCapabilities?: MakeSurfaceCapabilities;');
    expect(source).toContain('const conversationUiEnabled = state.surfaceCapabilities?.conversationUi !== false;');
    expect(source).toContain('conversationUiEnabled,');
    expect(source).toContain('assistantVisible: conversationUiEnabled ? state.assistantVisible : false,');
    expect(source).toContain('onSubmitCanvasAssistantPrompt: actions.onSubmitCanvasAssistantPrompt,');
  });
});
