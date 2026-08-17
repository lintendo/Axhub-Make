import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

describe('start prompt grid responsive layout', () => {
  it('responds to the shared start-guide container instead of viewport breakpoints', () => {
    const gridPath = resolve(__dirname, './StartPromptGrid.tsx');
    expect(existsSync(gridPath)).toBe(true);

    const grid = read('./StartPromptGrid.tsx');
    const resourceGrid = read('./ResourceStartPromptGrid.tsx');
    const themeGrid = read('./ThemeStartPromptGrid.tsx');
    const content = read('./ContentAreaView.tsx');
    const styles = read('../../app/styles/index-page.css');
    const composer = read('../../domains/shared/CanvasGenerationComposer.tsx');

    expect(grid).toContain('className="ax-start-prompt-grid"');
    expect(resourceGrid).toContain('<StartPromptGrid ariaLabel="资源生成能力">');
    expect(themeGrid).toContain("ariaLabel = '主题来源'");
    expect(themeGrid).toContain('<StartPromptGrid ariaLabel={ariaLabel}>');
    expect(resourceGrid).not.toContain('sm:grid-cols-2');
    expect(resourceGrid).not.toContain('lg:grid-cols-4');
    expect(themeGrid).not.toContain('sm:grid-cols-2');
    expect(themeGrid).not.toContain('lg:grid-cols-4');
    expect(content).toContain('ax-start-guide');
    expect(content).not.toContain('ax-start-guide-title');
    expect(styles).toContain('.ax-start-guide {\n    container-type: inline-size;\n}');
    expect(styles).not.toContain('.ax-start-guide-title');
    expect(styles).toContain('.ax-start-prompt-grid {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));\n    gap: 16px;\n    margin-top: 32px;\n}');
    expect(styles).toContain('@container (min-width: 768px) {\n    .ax-start-prompt-grid {\n        margin-top: 64px;\n    }\n}');
    expect(composer).toContain('h-8 items-center gap-1.5 whitespace-nowrap rounded-md');
  });
});
