import { describe, expect, it, vi } from 'vitest';

import {
    buildAssistantAutoOpenPanelModeStorageKey,
    buildAssistantAutoOpenDismissedStorageKey,
    getAssistantAutoOpenDismissed,
    getAssistantAutoOpenPanelMode,
    formatThrownError,
    findResourceItemByPathOrName,
    isHtmlCommentableResource,
    isDocumentCommentableResource,
    isMarkdownEditableResource,
    normalizeDocItem,
    normalizeDocsItems,
    normalizeTemplateItem,
    resolveDocRenameBaseName,
    replaceSidebarItemTitle,
    resolveMobileItemOpenUrl,
    setAssistantAutoOpenDismissed,
    setAssistantAutoOpenPanelMode,
} from './index-page.helpers';

describe('index page helpers', () => {
    it('formats non-Error thrown values with useful diagnostic details', () => {
        expect(formatThrownError({ error: 'Session annotation-1 failed', status: 500 })).toBe('Session annotation-1 failed；status=500');
        expect(formatThrownError({ detail: { message: 'provider unavailable' } })).toBe('provider unavailable');
        expect(formatThrownError({})).toBe('未知错误');
    });

    it('uses browser-tab session storage for assistant auto-open state by default', () => {
        const sessionValues = new Map<string, string>();
        const localValues = new Map<string, string>();
        const createStorage = (values: Map<string, string>) => ({
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                values.set(key, value);
            },
        });

        vi.stubGlobal('window', {
            location: { origin: 'http://make.local' },
            sessionStorage: createStorage(sessionValues),
            localStorage: createStorage(localValues),
        });

        try {
            const dismissedKey = buildAssistantAutoOpenDismissedStorageKey('make-project');
            const panelModeKey = buildAssistantAutoOpenPanelModeStorageKey('make-project');

            setAssistantAutoOpenDismissed(dismissedKey, true);
            setAssistantAutoOpenPanelMode(panelModeKey, 'image-ai');

            expect(sessionValues.get(dismissedKey)).toBe('1');
            expect(sessionValues.get(panelModeKey)).toBe('image-ai');
            expect(localValues.size).toBe(0);
            expect(getAssistantAutoOpenDismissed(dismissedKey)).toBe(true);
            expect(getAssistantAutoOpenPanelMode(panelModeKey)).toBe('image-ai');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps assistant auto-open enabled by default and stores real closes project-wide', () => {
        const storage = new Map<string, string>();
        const fakeStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
        };
        const guideKey = buildAssistantAutoOpenDismissedStorageKey('make-project', 'src/prototypes/beginner-guide/index.tsx');
        const otherPrototypeKey = buildAssistantAutoOpenDismissedStorageKey('make-project', 'src/prototypes/other/index.tsx');
        const otherProjectKey = buildAssistantAutoOpenDismissedStorageKey('other-project', 'src/prototypes/beginner-guide/index.tsx');

        expect(getAssistantAutoOpenDismissed(guideKey, fakeStorage)).toBe(false);
        expect(getAssistantAutoOpenDismissed(otherProjectKey, fakeStorage)).toBe(false);

        setAssistantAutoOpenDismissed(guideKey, false, fakeStorage);

        expect(getAssistantAutoOpenDismissed(guideKey, fakeStorage)).toBe(false);
        expect(getAssistantAutoOpenDismissed(otherPrototypeKey, fakeStorage)).toBe(false);
        expect(getAssistantAutoOpenDismissed(otherProjectKey, fakeStorage)).toBe(false);

        setAssistantAutoOpenDismissed(guideKey, true, fakeStorage);

        expect(getAssistantAutoOpenDismissed(guideKey, fakeStorage)).toBe(true);
        expect(getAssistantAutoOpenDismissed(otherPrototypeKey, fakeStorage)).toBe(true);
    });

    it('stores the last assistant panel mode project-wide for auto restore', () => {
        const storage = new Map<string, string>();
        const fakeStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
        };
        const guideKey = buildAssistantAutoOpenPanelModeStorageKey('make-project', 'src/prototypes/beginner-guide/index.tsx');
        const otherPrototypeKey = buildAssistantAutoOpenPanelModeStorageKey('make-project', 'src/prototypes/other/index.tsx');
        const otherProjectKey = buildAssistantAutoOpenPanelModeStorageKey('other-project', 'src/prototypes/beginner-guide/index.tsx');

        expect(getAssistantAutoOpenPanelMode(guideKey, fakeStorage)).toBe('general-ai');

        setAssistantAutoOpenPanelMode(guideKey, 'image-ai', fakeStorage);

        expect(getAssistantAutoOpenPanelMode(guideKey, fakeStorage)).toBe('image-ai');
        expect(getAssistantAutoOpenPanelMode(otherPrototypeKey, fakeStorage)).toBe('image-ai');
        expect(getAssistantAutoOpenPanelMode(otherProjectKey, fakeStorage)).toBe('general-ai');

        setAssistantAutoOpenPanelMode(guideKey, 'general-ai', fakeStorage);

        expect(getAssistantAutoOpenPanelMode(guideKey, fakeStorage)).toBe('general-ai');
        expect(getAssistantAutoOpenPanelMode(otherPrototypeKey, fakeStorage)).toBe('general-ai');
    });

    it('opens metadata clientUrl values directly from the mobile prototype list', () => {
	        expect(resolveMobileItemOpenUrl({
	            name: 'home',
	            displayName: 'Home',
	            clientUrl: 'http://localhost:51720/prototypes/home',
	            previewUrl: 'http://localhost:51720/prototypes/home',
	            jsUrl: '',
	        }, 'http://localhost:5174')).toBe('http://localhost:51720/prototypes/home');
	    });

	    it('opens relative preview paths from the mobile prototype list', () => {
	        expect(resolveMobileItemOpenUrl({
	            name: 'home',
	            displayName: 'Home',
	            previewUrl: '/prototypes/home',
	            jsUrl: '',
	        }, 'http://localhost:5174')).toBe('http://localhost:5174/prototypes/home');
    });

    it('normalizes templates without inventing a local docs template path', () => {
        const metadataOnlyTemplate = normalizeTemplateItem({
            name: 'prd-template.md',
            displayName: 'PRD Template',
        });
        expect(metadataOnlyTemplate.filePath).toBeUndefined();
        expect(metadataOnlyTemplate.absoluteFilePath).toBeUndefined();

        const sourceBackedTemplate = normalizeTemplateItem({
            name: 'prd-template.md',
            displayName: 'PRD Template',
            path: 'content/templates/prd-template.md',
            absoluteFilePath: '/workspace/content/templates/prd-template.md',
        });
        expect(sourceBackedTemplate.filePath).toBe('content/templates/prd-template.md');
        expect(sourceBackedTemplate.absoluteFilePath).toBe('/workspace/content/templates/prd-template.md');
    });

    it('builds spec-template preview URLs for local docs and templates', () => {
        const doc = normalizeDocItem({
            name: 'guide.md',
            displayName: 'Guide',
            path: 'content/docs/guide.md',
            absoluteFilePath: '/workspace/content/docs/guide.md',
        });
        const template = normalizeTemplateItem({
            name: 'prd-template.md',
            displayName: 'PRD Template',
            path: 'content/templates/prd-template.md',
            absoluteFilePath: '/workspace/content/templates/prd-template.md',
        });

        expect(doc.specUrl).toBe('/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fguide.md');
        expect(doc.previewUrl).toBe('/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fcontent%252Fdocs%252Fguide.md');
        expect(template.specUrl).toBe('/api/markdown-file?path=%2Fworkspace%2Fcontent%2Ftemplates%2Fprd-template.md');
        expect(template.previewUrl).toBe('/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fcontent%252Ftemplates%252Fprd-template.md');
    });

    it('builds rendered markdown previews for metadata-only templates', () => {
        const template = normalizeTemplateItem({
            name: 'write-prd.md',
            displayName: 'Write PRD',
        });

        expect(template.name).toBe('write-prd.md');
        expect(template.specUrl).toBe('/api/docs/templates/write-prd.md');
        expect(template.previewUrl).toBe('/spec-template.html?url=%2Fapi%2Fdocs%2Ftemplates%2Fwrite-prd.md');
        expect(template.filePath).toBeUndefined();
        expect(template.absoluteFilePath).toBeUndefined();
    });

    it('uses only the final file segment when renaming nested docs or templates', () => {
        expect(resolveDocRenameBaseName('templates/prd-template.md')).toBe('prd-template');
        expect(resolveDocRenameBaseName('templates/prd-template-v2.md', '.md')).toBe('prd-template-v2');
        expect(resolveDocRenameBaseName('templates/prd-template-v2', '.md')).toBe('prd-template-v2');
        expect(resolveDocRenameBaseName('nested\\product spec.md')).toBe('product spec');
    });

    it('uses the final file segment as the default display name for nested templates', () => {
        const template = normalizeTemplateItem({
            name: 'templates/prd-template.md',
            displayName: 'templates/prd-template',
        });

        expect(template.displayName).toBe('prd-template');
    });

    it('builds direct file preview URLs for non-markdown resources', () => {
        const image = normalizeDocItem({
            name: 'assets/logo.png',
            displayName: 'assets/logo',
            path: 'content/docs/assets/logo.png',
            absoluteFilePath: '/workspace/content/docs/assets/logo.png',
        });

        expect(image.name).toBe('assets/logo.png');
        expect(image.displayName).toBe('logo');
        expect(image.specUrl).toBe('/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fassets%2Flogo.png');
        expect(image.previewUrl).toBe('/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fassets%2Flogo.png');
    });

    it('uses project-scoped docs file URLs for pasted image resources from the docs list', () => {
        const [image] = normalizeDocsItems([
            {
                name: 'image-2.png',
                displayName: '素材/image-2',
                path: '素材/image-2.png',
                absoluteFilePath: '/workspace/content/docs/素材/image-2.png',
                fileSize: 22937,
            },
        ], 'make-project');

        expect(image.name).toBe('素材/image-2.png');
        expect(image.resourceId).toBe('素材/image-2.png');
        expect(image.displayName).toBe('image-2');
        expect(image.specUrl).toBe('/api/docs/%E7%B4%A0%E6%9D%90%2Fimage-2.png?projectId=make-project');
        expect(image.previewUrl).toBe('/api/docs/%E7%B4%A0%E6%9D%90%2Fimage-2.png?projectId=make-project');
        expect(image.absoluteFilePath).toBe('/workspace/content/docs/素材/image-2.png');
        expect(image.fileSize).toBe(22937);
    });

    it('uses the relative resource path as the identity for nested image resources from the docs list', () => {
        const [image] = normalizeDocsItems([
            {
                name: 'fabu.png',
                displayName: 'fabu',
                path: 'new-folder/fabu.png',
                absoluteFilePath: '/workspace/src/resources/new-folder/fabu.png',
                fileSize: 442175,
            },
        ], 'make-project');

        expect(image.name).toBe('new-folder/fabu.png');
        expect(image.resourceId).toBe('new-folder/fabu.png');
        expect(image.displayName).toBe('fabu');
        expect(image.specUrl).toBe('/api/docs/new-folder%2Ffabu.png?projectId=make-project');
        expect(image.previewUrl).toBe('/api/docs/new-folder%2Ffabu.png?projectId=make-project');
        expect(image.filePath).toBe('new-folder/fabu.png');
    });

    it('uses project-scoped docs file URLs for nested markdown resources from the docs list', () => {
        const [doc] = normalizeDocsItems([
            {
                name: 'fabu.md',
                displayName: 'fabu',
                path: 'new-folder/fabu.md',
                absoluteFilePath: '/workspace/src/resources/new-folder/fabu.md',
                fileSize: 128,
            },
        ], 'make-project');

        expect(doc.name).toBe('new-folder/fabu.md');
        expect(doc.resourceId).toBe('new-folder/fabu.md');
        expect(doc.displayName).toBe('fabu');
        expect(doc.specUrl).toBe('/api/docs/new-folder%2Ffabu.md?projectId=make-project');
        expect(doc.previewUrl).toBe('/spec-template.html?url=%2Fapi%2Fdocs%2Fnew-folder%252Ffabu.md%3FprojectId%3Dmake-project');
        expect(doc.filePath).toBe('new-folder/fabu.md');
    });

    it('matches renamed nested resources by path before falling back to basename', () => {
        const docs = normalizeDocsItems([
            {
                name: 'overview.md',
                displayName: 'Overview',
                path: 'overview.md',
                absoluteFilePath: '/workspace/src/resources/overview.md',
            },
            {
                name: 'fabu.png',
                displayName: 'fabu',
                path: 'new-folder/fabu.png',
                absoluteFilePath: '/workspace/src/resources/new-folder/fabu.png',
            },
        ], 'make-project');

        expect(findResourceItemByPathOrName(docs, 'new-folder/fabu.png', 'fabu.png')).toBe(docs[1]);
    });

    it('infers canvas open mode for Excalidraw files from refreshed docs lists', () => {
        const [canvas] = normalizeDocsItems([
            {
                name: 'untitled-2.excalidraw',
                displayName: 'untitled-2',
                path: 'untitled-2.excalidraw',
                absoluteFilePath: '/workspace/src/resources/untitled-2.excalidraw',
                fileSize: 171,
            },
        ], 'make-project');

        expect(canvas.name).toBe('untitled-2.excalidraw');
        expect(canvas.displayName).toBe('untitled-2');
        expect(canvas.openMode).toBe('canvas');
        expect(canvas.filePath).toBe('src/resources/untitled-2.excalidraw');
        expect(canvas.canvasFilePath).toBe('src/resources/untitled-2.excalidraw');
        expect(canvas.previewUrl).toBe('/api/docs/untitled-2.excalidraw?projectId=make-project');
    });

    it('recognizes editable Markdown resources even when the display name has no .md extension', () => {
        expect(isMarkdownEditableResource({
            name: 'api-doc',
            displayName: 'API Doc',
            filePath: 'content/docs/api-doc.md',
            absoluteFilePath: '/workspace/content/docs/api-doc.md',
	            specUrl: '',
	            previewUrl: '',
	            jsUrl: '',
	        })).toBe(true);
	        expect(isMarkdownEditableResource({
	            name: 'api-doc',
            displayName: 'API Doc',
	            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fapi-doc.md',
	            previewUrl: '/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fcontent%252Fdocs%252Fapi-doc.md',
	            jsUrl: '',
	        })).toBe(true);
	        expect(isMarkdownEditableResource({
	            name: 'plain-note',
            displayName: 'Plain Note',
            filePath: 'content/docs/plain-note.txt',
	            specUrl: '',
	            previewUrl: '',
	            jsUrl: '',
        })).toBe(false);
    });

    it('recognizes commentable HTML document resources without treating plain text as commentable', () => {
        expect(isDocumentCommentableResource({
            name: 'visual-prd',
            displayName: 'Visual PRD',
            absoluteFilePath: '/workspace/content/docs/visual-prd.html',
            specUrl: '',
            previewUrl: '',
            jsUrl: '',
        })).toBe(true);
        expect(isDocumentCommentableResource({
            name: 'visual-prd',
            displayName: 'Visual PRD',
            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            previewUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            jsUrl: '',
        })).toBe(true);
        expect(isDocumentCommentableResource({
            name: 'plain-note',
            displayName: 'Plain Note',
            filePath: 'content/docs/plain-note.txt',
            specUrl: '',
            previewUrl: '',
            jsUrl: '',
        })).toBe(false);
    });

    it('keeps Markdown and HTML commentable document resources distinguishable', () => {
        expect(isMarkdownEditableResource({
            name: 'visual-prd.html',
            displayName: 'Visual PRD',
            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            previewUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            jsUrl: '',
        })).toBe(false);
        expect(isHtmlCommentableResource({
            name: 'visual-prd.html',
            displayName: 'Visual PRD',
            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            previewUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            jsUrl: '',
        })).toBe(true);
        expect(isDocumentCommentableResource({
            name: 'visual-prd.html',
            displayName: 'Visual PRD',
            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            previewUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fvisual-prd.html',
            jsUrl: '',
        })).toBe(true);
        expect(isMarkdownEditableResource({
            name: 'api-doc.md',
            displayName: 'API Doc',
            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fapi-doc.md',
            previewUrl: '/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fcontent%252Fdocs%252Fapi-doc.md',
            jsUrl: '',
        })).toBe(true);
        expect(isHtmlCommentableResource({
            name: 'api-doc.md',
            displayName: 'API Doc',
            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fcontent%2Fdocs%2Fapi-doc.md',
            previewUrl: '/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fcontent%252Fdocs%252Fapi-doc.md',
            jsUrl: '',
        })).toBe(false);
    });

    it('updates a persisted sidebar item title without changing its placement', () => {
        const tree = [
            {
                id: 'folder:prototypes:demo',
                kind: 'folder' as const,
                title: '演示',
                children: [
                    {
                        id: 'item:prototypes:home',
                        kind: 'item' as const,
                        title: '旧名称',
                        itemKey: 'prototypes/home',
                    },
                ],
            },
            {
                id: 'item:prototypes:settings',
                kind: 'item' as const,
                title: '设置',
                itemKey: 'prototypes/settings',
            },
        ];

        const result = replaceSidebarItemTitle(tree, 'prototypes/home', '新名称');

        expect(result).toEqual({
            changed: true,
            nextTree: [
                {
                    id: 'folder:prototypes:demo',
                    kind: 'folder',
                    title: '演示',
                    children: [
                        {
                            id: 'item:prototypes:home',
                            kind: 'item',
                            title: '新名称',
                            itemKey: 'prototypes/home',
                        },
                    ],
                },
                {
                    id: 'item:prototypes:settings',
                    kind: 'item',
                    title: '设置',
                    itemKey: 'prototypes/settings',
                },
            ],
        });
        expect(tree[0].children?.[0]?.title).toBe('旧名称');
    });
});
