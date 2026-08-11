import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readDialogSource() {
    return readFileSync(resolve(__dirname, './CreateDialogView.tsx'), 'utf8');
}

function readTemplateLibraryCardSource() {
    return readFileSync(resolve(__dirname, './TemplateLibraryCard.tsx'), 'utf8');
}

describe('CreateDialogView online template library source', () => {
    it('opens the prototype import drawer from the right-side action area', () => {
        const source = readDialogSource();

        expect(source).toContain('side="right"');
        expect(source).not.toContain('side="left"');
    });

    it('only exposes prototype import tabs and removes legacy AI create prompt UI', () => {
        const source = readDialogSource();

        expect(source).toContain("type CreateDialogViewTab = 'upload' | 'onlineImport';");
        expect(source).toContain("initialTab?: CreateDialogTab;");
        expect(source).toContain("initialTab = 'onlineImport'");
        expect(source).toContain("useState<CreateDialogViewTab>('onlineImport')");
        expect(source).toContain("value === 'upload' || value === 'onlineImport'");
        expect(source).not.toContain("value === 'ai'");
        expect(source).not.toContain("value === 'create'");
        expect(source).not.toContain('AiCreateGuideContent');
        expect(source).not.toContain('MultiSelect');
        expect(source).not.toContain('selectedThemes');
        expect(source).not.toContain('selectedDocs');
        expect(source).not.toContain('selectedDataAssets');
        expect(source).not.toContain('buildCreatePrompt');
        expect(source).not.toContain('AI 新建');
        expect(source).not.toContain('生成 Prompt');
        expect(source).not.toContain('新建原型 /');
    });

    it('offers Axure HTML imports as a direct deterministic prototype upload source', () => {
        const source = readDialogSource();

        expect(source).toContain("key: 'axure_html'");
        expect(source).toContain("title: 'Axure HTML 原型'");
        expect(source).toContain('Axure HTML ZIP（实验性）');
        expect(source).not.toContain('Axure HTML ZIP 或文件夹');
        expect(source).not.toContain('Axure 导出的 HTML ZIP 或文件夹，直接转换为 React 多页面');
        expect(source).toContain("type === 'axure_html'");
        expect(source).toContain('requiresAi: false');
    });

    it('includes optional preview and author metadata in online template library item type', () => {
        const source = readDialogSource();
        const typeMatch = source.match(/interface TemplateLibraryItem[\s\S]*?\n}/);

        expect(typeMatch).not.toBeNull();
        expect(typeMatch?.[0] || '').toContain('previewUrl?: string;');
        expect(typeMatch?.[0] || '').toContain('author?: string;');
        expect(typeMatch?.[0] || '').toContain('authorUrl?: string;');
    });

    it('treats ok false template library payloads as failed loads', () => {
        const source = readDialogSource();
        const effectMatch = source.match(/fetch\('\/api\/template-library'\)[\s\S]*?setTemplateLibrary\(\{/);

        expect(effectMatch).not.toBeNull();
        expect(effectMatch?.[0] || '').toContain('result?.ok === false');
        expect(effectMatch?.[0] || '').toContain("throw new Error(result?.error || '模板库读取失败')");
    });

    it('does not cancel the online template library request when marking it as loading', () => {
        const source = readDialogSource();
        const effectMatch = source.match(/useEffect\(\(\) => \{[\s\S]*?fetch\('\/api\/template-library'\)[\s\S]*?\}, \[([^\]]+)\]\);/);

        expect(effectMatch).not.toBeNull();
        const dependencies = effectMatch?.[1] || '';
        expect(dependencies).not.toContain('templateLibrary.loading');
        expect(effectMatch?.[0] || '').not.toContain('|| templateLibrary.loading ||');
        expect(effectMatch?.[0] || '').not.toContain('PLACEHOLDER_TEMPLATE_LIBRARY_CACHE_KEY');
    });

    it('can be opened directly on online import and keeps online import realtime', () => {
        const source = readDialogSource();

        expect(source).toContain("type CreateDialogViewTab = 'upload' | 'onlineImport';");
        expect(source).toContain('initialTab?: CreateDialogTab;');
        expect(source).toContain("import type { CreateDialogTab, PrototypeUploadType } from '../../types/index-page.types';");
        expect(source).toContain("setActiveKey(initialTab === 'upload' && canUploadPrototype ? 'upload' : 'onlineImport')");
        expect(source).toContain("fetch('/api/template-library')");
        expect(source).not.toContain('readPlaceholderTemplateLibraryCache');
    });

    it('passes the target placeholder prototype into upload and direct template import requests', () => {
        const source = readDialogSource();

        expect(source).toContain('activeProjectId?: string | null;');
        expect(source).toContain("formData.append('projectId', activeProjectId)");
        expect(source).toContain('targetPrototypeName?: string;');
        expect(source).toContain('initialUploadType?: PrototypeUploadType;');
        expect(source).toContain("setUploadType(initialUploadType || 'make')");
        expect(source).toContain("formData.append('targetPrototypeName', targetPrototypeName)");
        expect(source).toContain('body: JSON.stringify({ templateId: template.id, targetPrototypeName })');
    });

    it('imports every lucide icon used by upload options', () => {
        const source = readDialogSource();
        const importMatch = source.match(/import \{([^}]+)\} from 'lucide-react';/);
        const uploadOptionsMatch = source.match(/const uploadOptions = useMemo(?:<[\s\S]*?>)?\(\(\) => \{[\s\S]*?\n    \}, \[\]\);/);

        expect(importMatch).not.toBeNull();
        expect(uploadOptionsMatch).not.toBeNull();

        const importedIcons = new Set((importMatch?.[1] || '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean));
        const usedIcons = Array.from((uploadOptionsMatch?.[0] || '').matchAll(/icon:\s*<([A-Z][A-Za-z0-9_]*)\b/g))
            .map((match) => match[1]);

        expect(usedIcons.length).toBeGreaterThan(0);
        expect(usedIcons.filter((name) => !importedIcons.has(name))).toEqual([]);
    });

    it('makes the selected upload type visibly use the brand border', () => {
        const source = readDialogSource();

        expect(source).toContain("import { cn } from '@/lib/utils';");
        expect(source).toContain("'flex min-w-0 items-center gap-2.5 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'");
        expect(source).toContain("style={selected ? { borderColor: 'hsl(var(--brand))' } : undefined}");
        expect(source).toContain("'border-border/80 hover:border-primary/30 hover:bg-muted/30'");
        expect(source).not.toContain("? 'border-primary'");
        expect(source).not.toContain('border-2 p-3');
        expect(source).not.toContain('shadow-sm');
        expect(source).not.toContain('ring-1 ring-primary');
        expect(source).toContain('className="truncate text-[12px] leading-4 text-muted-foreground" title={option.description}');
    });

    it('opens template previews from the whole card and warns when previewUrl is missing', () => {
        const source = readDialogSource();
        const cardSource = readTemplateLibraryCardSource();

        expect(source).toContain('onPreview={handleTemplatePreviewCardClick}');
        expect(cardSource).toContain('onClick={() => onPreview?.(template)}');
        expect(cardSource).toContain('cursor-pointer');
        expect(cardSource).toContain("template.previewUrl ? '点击打开在线预览' : '该模板暂不支持在线预览'");
        expect(source).toContain("toast.warning('该模板暂不支持在线预览')");
        expect(cardSource).not.toContain('<Globe className="h-3.5 w-3.5" />');
        expect(cardSource).not.toContain('href={template.previewUrl}');
    });

    it('renders author metadata in the old path position and keeps actions low emphasis', () => {
        const source = readDialogSource();
        const cardSource = readTemplateLibraryCardSource();

        expect(cardSource).toContain("const authorLabel = String(template.author || '').trim();");
        expect(cardSource).toContain('authorLabel ? (');
        expect(cardSource).toContain('href={template.authorUrl}');
        expect(cardSource).toContain('作者：{authorLabel}');
        expect(cardSource).toContain('{template.sourcePath}');
        expect(cardSource).toContain('title={metaTitle}');
        expect(cardSource).toContain('title={template.title}');
        expect(cardSource).toContain('title={template.description}');
        expect(cardSource).toContain('min-w-0 truncate');
        expect(cardSource).toContain('shrink-0');
        expect(cardSource).toContain('break-words text-[12px] leading-5 text-muted-foreground [overflow-wrap:anywhere]');
        expect(cardSource).toContain("compact ? 'line-clamp-2 min-h-10' : 'line-clamp-2'");
        expect(cardSource).toContain('variant="ghost"');
        expect(source).toContain('type="borderless"');
        expect(cardSource).toContain('onClick={(event) => event.stopPropagation()}');
        expect(cardSource).toContain('onKeyDown={(event) => event.stopPropagation()}');
        expect(source).toContain('const directDisabled = Boolean(disabledReason) || !template.canDirectImport || Boolean(templateImportingId);');
        expect(source).toContain('targetPrototypeName,');
        expect(source).not.toContain('directDisabled = Boolean(template.previewUrl)');
    });

    it('allows each library to choose its direct import button label', () => {
        const cardSource = readTemplateLibraryCardSource();

        expect(cardSource).toContain('directImportLabel?: string;');
        expect(cardSource).toContain("directImportLabel = '直接导入'");
        expect(cardSource).toContain('{directImportLabel}');
    });

    it('keeps template cover failures as a silent gray placeholder', () => {
        const cardSource = readTemplateLibraryCardSource();

        expect(cardSource).toContain('const [coverLoadFailed, setCoverLoadFailed] = React.useState(false);');
        expect(cardSource).toContain('setCoverLoadFailed(false);');
        expect(cardSource).toContain("const shouldRenderCoverImage = Boolean(template.coverUrl) && !coverLoadFailed;");
        expect(cardSource).toContain("className={compact ? 'aspect-[10/7] overflow-hidden rounded border bg-[#edf1f5]' : 'h-[112px] overflow-hidden rounded border bg-[#edf1f5]'}");
        expect(cardSource).toContain('{shouldRenderCoverImage ? (');
        expect(cardSource).toContain('onError={() => setCoverLoadFailed(true)}');
        expect(cardSource).not.toContain('图片加载失败');
        expect(cardSource).not.toContain('封面加载失败');
    });
});
