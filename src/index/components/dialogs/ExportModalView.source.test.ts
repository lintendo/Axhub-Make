import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource() {
  return readFileSync(resolve(__dirname, './ExportModalView.tsx'), 'utf8');
}

describe('ExportModalView source', () => {
  it('renames the dynamic Axure prototype tab without changing the tab key', () => {
    const source = readSource();

    expect(source).toContain('<DialogTitle className="sr-only">导出带交互原型</DialogTitle>');
    expect(source).toContain('value="dynamicPrototype"');
    expect(source).toContain('带交互原型');
    expect(source).not.toContain('导出到 Axure');
    expect(source).not.toContain('动态原型');
    expect(source).not.toContain('复制 runtime 组件');
  });

  it('labels screenshot dimensions as the capture viewport instead of the final export size', () => {
    const source = readSource();

    expect(source).toContain("imageConfig.contentType === 'screenshot' ? '截图视窗' : '导出尺寸'");
    expect(source).toContain('按该视窗布局，导出完整页面');
  });

  it('offers an Axure image asset switch with placeholder behavior', () => {
    const source = readSource();

    expect(source).toContain("imageConfig.includeConfig === 'code'");
    expect(source).toContain('导出图片素材');
    expect(source).toContain('关闭后保留图片位置并使用浅灰占位');
    expect(source).toContain('checked={imageConfig.includeImageAssets}');
    expect(source).toContain('includeImageAssets: checked');
  });

  it('hides empty Axure API list details while preserving warnings and raw fallbacks', () => {
    const source = readSource();

    expect(source).toContain('const hasItems = listPreview.items.length > 0;');
    expect(source).toContain('const showDetails = hasItems || listPreview.warnings.length > 0 || showRaw;');
    expect(source).toContain('{showDetails ? (');
    expect(source).toContain('{hasItems ? (');
  });
});
