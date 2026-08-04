import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readPresentationPropsBuilderSource() {
  return readFileSync(resolve(__dirname, './useIndexPagePresentationPropsBuilder.ts'), 'utf8');
}

describe('useIndexPagePresentationPropsBuilder source', () => {
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
    expect(source).toContain('onUploadResourceFiles: actions.onUploadResourceFiles,');
    expect(source).toContain('onCreateResourceCanvasFile: actions.onCreateResourceCanvasFile,');
    expect(source).toContain('onCreateDrawioResourceFile: actions.onCreateDrawioResourceFile,');
    expect(source).toContain('onOpenDesignImport: actions.onOpenDesignImport,');
  });
});
