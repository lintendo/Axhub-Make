import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
function readPrototypeUploadSource() {
    return readFileSync(resolve(__dirname, '../managementApi.prototypeUpload.ts'), 'utf8');
}
function getSourceSegment(source, startNeedle, endNeedle) {
    const start = source.indexOf(startNeedle);
    const end = source.indexOf(endNeedle, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}
describe('prototype placeholder source template', () => {
    it('renders a minimal placeholder marker in newly created prototype source', () => {
        const source = readPrototypeUploadSource();
        const placeholderTemplate = getSourceSegment(source, 'function createPlaceholderIndexTsx(displayName: string): string {', 'function createPlaceholderStyleCss(): string {');
        const waitingTemplate = getSourceSegment(source, 'function createWaitingGenerationIndexTsx(displayName: string): string {', 'function createWaitingGenerationStyleCss(): string {');
        expect(placeholderTemplate).toContain('@axhub-placeholder prototype-empty');
        expect(placeholderTemplate).toContain('正在等待生成');
        expect(placeholderTemplate).toContain('<main className="placeholder-empty-page" aria-label={displayName}>');
        expect(placeholderTemplate).toContain('<span>正在等待生成</span>');
        expect(waitingTemplate).toContain('正在等待生成');
        expect(waitingTemplate).toContain('<main className="prototype-waiting-generation-page" aria-label={displayName}>');
        expect(waitingTemplate).toContain('<span>正在等待生成</span>');
        expect(waitingTemplate).not.toContain('@axhub-placeholder prototype-empty');
        expect(waitingTemplate).not.toContain('placeholder-empty-page');
        expect(source).toContain("if (targetDir === path.resolve(targetBaseDir) || !isPathInside(targetBaseDir, targetDir))");
        expect(source).not.toContain('打开左侧默认引导页继续创建');
        expect(source).not.toContain('未命名原型占位页');
        expect(source).not.toContain('<p>');
        expect(source).not.toContain('<section');
        expect(source).not.toContain('<h1>');
        expect(source).not.toContain('placeholder-empty-page__badge');
        expect(source).not.toContain('placeholder-empty-page__card');
        expect(source).not.toContain('border: 1px solid');
        expect(source).not.toContain('box-shadow');
        expect(source).not.toContain('对话技巧');
    });
});
