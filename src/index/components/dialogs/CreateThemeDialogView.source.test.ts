import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readDialogSource() {
    return readFileSync(resolve(__dirname, './CreateThemeDialogView.tsx'), 'utf8');
}

describe('CreateThemeDialogView online theme library source', () => {
    it('requires a project for listing and direct imports', () => {
        const source = readDialogSource();

        expect(source).toContain('activeProjectId: string;');
        expect(source).toContain("fetch(withProjectScope('/api/theme-library', requireProjectScope(activeProjectId)))");
        expect(source).toContain("fetch(withProjectScope('/api/theme-library/import', requireProjectScope(activeProjectId)), {");
    });

    it('opens from the right and directly presents the online theme library', () => {
        const source = readDialogSource();

        expect(source).toContain('side="right"');
        expect(source).toContain('<SheetTitle>在线主题模板</SheetTitle>');
        expect(source).not.toContain('side="left"');
        expect(source).not.toContain("type ThemeDialogTab = 'import' | 'onlineSelect';");
        expect(source).not.toContain('<Tabs');
        expect(source).not.toContain('<TabsList');
        expect(source).not.toContain('<TabsTrigger');
    });

    it('removes ZIP upload and AI prompt import actions', () => {
        const source = readDialogSource();

        expect(source).not.toContain('<FileDropzone');
        expect(source).not.toContain('handleThemeUpload');
        expect(source).not.toContain('THEME_IMPORT_UPLOAD_TYPE');
        expect(source).not.toContain('selectedUploadFiles');
        expect(source).not.toContain('PromptActionButton');
        expect(source).not.toContain('generateThemeLibraryImportPrompt');
        expect(source).not.toContain('复制提示词');
    });

    it('loads the online library as soon as the drawer becomes visible', () => {
        const source = readDialogSource();

        expect(source).toContain('if (!visible || themeLibrary.loaded)');
        expect(source).toContain('result?.ok === false');
        expect(source).toContain("throw new Error(result?.error || '设计系统库读取失败')");
        expect(source).not.toContain("activeTab !== 'onlineSelect'");
    });

    it('reveals cards progressively with preview and one import button', () => {
        const source = readDialogSource();

        expect(source).toContain('useProgressiveLibraryItems(themeLibrary.designSystems, activeProjectId)');
        expect(source).toContain('{visibleDesignSystems.map((designSystem) => {');
        expect(source).toContain('ref={themeCasesLoadMoreRef}');
        expect(source).toContain('aria-label="继续加载主题模板"');
        expect(source).toContain('onPreview={handleThemePreviewCardClick}');
        expect(source).toContain('directImportLabel="导入"');
        expect(source).toContain('onDirectImport={(designSystem) => void handleDirectThemeLibraryImport(designSystem)}');
    });

    it('opens card previews and warns when previewUrl is missing', () => {
        const source = readDialogSource();

        expect(source).toContain("toast.warning('该主题暂不支持在线预览')");
        expect(source).toContain("window.open(previewUrl, '_blank', 'noopener,noreferrer')");
        expect(source).not.toContain('href={designSystem.previewUrl}');
    });

    it('hides implementation file paths in online theme cards', () => {
        const source = readDialogSource();

        expect(source).not.toContain('入口：{designSystem.entryPath}');
        expect(source).not.toContain('Token：{designSystem.tokenPath}');
    });
});
