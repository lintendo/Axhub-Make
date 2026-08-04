import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readUsePreviewDeviceActionsSource() {
  return readFileSync(resolve(__dirname, './usePreviewDeviceActions.ts'), 'utf8');
}

function getSourceSegment(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('usePreviewDeviceActions source', () => {
  it('can initialize multi-page columns from the current prototype page count', () => {
    const source = readUsePreviewDeviceActionsSource();
    const multiPageHandlerSource = getSourceSegment(
      source,
      'const handleActivateMultiPagePreview = useCallback',
      'const handleChangeMultiPageColumns = useCallback',
    );

    expect(source).toContain('resolveDefaultMultiPageColumns');
    expect(source).toContain('pageCount?: number');
    expect(multiPageHandlerSource).toContain('multiPageColumns: pageCount === undefined');
    expect(multiPageHandlerSource).toContain('resolveDefaultMultiPageColumns(pageCount)');
  });

  it('keeps multi-page mode active when editing the custom size', () => {
    const source = readUsePreviewDeviceActionsSource();
    const widthHandlerSource = getSourceSegment(
      source,
      'const handleChangeCustomPreviewWidth = useCallback',
      'const handleChangeCustomPreviewHeight = useCallback',
    );
    const heightHandlerSource = getSourceSegment(
      source,
      'const handleChangeCustomPreviewHeight = useCallback',
      'const handleChangeSplitPreviewWidth = useCallback',
    );

    expect(widthHandlerSource).toContain("previewMode: previous.previewMode === 'multi-page' ? 'multi-page' : 'single'");
    expect(heightHandlerSource).toContain("previewMode: previous.previewMode === 'multi-page' ? 'multi-page' : 'single'");
    expect(widthHandlerSource).toContain("singlePreset: 'custom'");
    expect(heightHandlerSource).toContain("singlePreset: 'custom'");
  });

  it('persists the custom preview size in browser storage', () => {
    const source = readUsePreviewDeviceActionsSource();
    const widthHandlerSource = getSourceSegment(
      source,
      'const handleChangeCustomPreviewWidth = useCallback',
      'const handleChangeCustomPreviewHeight = useCallback',
    );
    const heightHandlerSource = getSourceSegment(
      source,
      'const handleChangeCustomPreviewHeight = useCallback',
      'const handleChangeSplitPreviewWidth = useCallback',
    );

    expect(source).toContain('loadStoredCustomPreviewSize');
    expect(source).toContain('saveStoredCustomPreviewSize');
    expect(source).toContain('const storedCustomSize = loadStoredCustomPreviewSize();');
    expect(widthHandlerSource).toContain('saveStoredCustomPreviewSize(');
    expect(heightHandlerSource).toContain('saveStoredCustomPreviewSize(');
  });

  it('separates manual device intent from adaptive display state', () => {
    const source = readUsePreviewDeviceActionsSource();

    expect(source).toContain('const [previewIntentConfig, setPreviewIntentConfig]');
    expect(source).toContain('resolveAdaptiveDesktopPreviewConfig(previewIntentConfig, previewContainerWidth)');
    expect(source).toContain('serializePreviewDeviceParam(previewIntentConfig)');
    expect(source).toContain('handlePreviewContainerSizeChange');
  });
});
