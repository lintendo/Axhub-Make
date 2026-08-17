import { describe, expect, it } from 'vitest';

import type { ItemData } from '../../types';
import {
    buildIndexDeepLinkUrl,
    buildResourceDeepLinkUrl,
    doesResourceDeepLinkRequireSidebarAssets,
    parseIndexDeepLink,
    parseResourceDeepLink,
    resolveIndexDeepLinkSelection,
    resolveResourceDeepLinkSelection,
    shouldSyncIndexDeepLinkUrl,
    type ResourceDeepLinkTarget,
} from './resourceDeepLink';

function createItem(name: string): ItemData {
    return {
        name,
        displayName: name,
        jsUrl: '',
        specUrl: '',
    };
}

describe('resource deep links', () => {
    it('does not wait for sidebar scans before opening direct project files', () => {
        expect(doesResourceDeepLinkRequireSidebarAssets({
            resourceType: 'project-doc',
            resourceId: 'src/resources/.assets/examples/demo.html/diagrams/mermaid-1.excalidraw',
        })).toBe(false);
        expect(doesResourceDeepLinkRequireSidebarAssets({
            resourceType: 'doc',
            resourceId: 'product-spec.md',
        })).toBe(true);
    });

    it('builds and parses short prototype links with encoded resource ids and project id', () => {
        const url = buildResourceDeepLinkUrl({
            resourceType: 'prototype',
            resourceId: '移动 首页/详情',
            view: 'demo',
            projectId: 'client-a',
            collapseSidebar: true,
        }, 'http://localhost:51720/current/path?ignored=1');

        expect(url).toBe('http://localhost:51720/?projectId=client-a&p=%E7%A7%BB%E5%8A%A8+%E9%A6%96%E9%A1%B5%2F%E8%AF%A6%E6%83%85&sidebar=collapsed');
        expect(parseResourceDeepLink(url)).toEqual({
            resourceType: 'prototype',
            resourceId: '移动 首页/详情',
            view: 'demo',
            projectId: 'client-a',
            collapseSidebar: true,
        });
    });

    it('preserves the Codex page surface when a deep link is generated from it', () => {
        expect(buildIndexDeepLinkUrl({
            resourceType: 'prototype',
            resourceId: 'home',
            projectId: 'client-a',
        }, 'http://localhost:51720/?surface=codex')).toBe('http://localhost:51720/?projectId=client-a&p=home&surface=codex');
    });

    it('builds and parses one canonical manual preview device parameter', () => {
        const url = buildIndexDeepLinkUrl({
            resourceType: 'prototype',
            resourceId: 'home',
            projectId: 'client-a',
            device: '1280x800',
        }, 'http://localhost:51720/current/path?ignored=1');

        expect(url).toBe('http://localhost:51720/?projectId=client-a&p=home&device=1280x800');
        expect(parseIndexDeepLink(url)).toEqual({
            resourceType: 'prototype',
            resourceId: 'home',
            view: 'demo',
            projectId: 'client-a',
            device: '1280x800',
            collapseSidebar: false,
        });
    });

    it('preserves an explicit desktop preview parameter', () => {
        const url = buildIndexDeepLinkUrl({
            resourceType: 'prototype',
            resourceId: 'home',
            projectId: 'client-a',
            device: 'desktop',
        }, 'http://localhost:51720/current/path?ignored=1');

        expect(url).toBe('http://localhost:51720/?projectId=client-a&p=home&device=desktop');
        expect(parseIndexDeepLink(url)).toEqual({
            resourceType: 'prototype',
            resourceId: 'home',
            view: 'demo',
            projectId: 'client-a',
            device: 'desktop',
            collapseSidebar: false,
        });
    });

    it('ignores invalid device values without disrupting the resource link', () => {
        expect(buildIndexDeepLinkUrl({
            resourceType: 'prototype',
            resourceId: 'home',
            projectId: 'client-a',
            device: '393×852',
        }, 'http://localhost:51720/')).toBe('http://localhost:51720/?projectId=client-a&p=home');

        expect(parseIndexDeepLink('/?projectId=client-a&p=home&device=bad')).toEqual({
            resourceType: 'prototype',
            resourceId: 'home',
            view: 'demo',
            projectId: 'client-a',
            collapseSidebar: false,
        });
    });

    it('builds and parses a project spec review link that opens the spec with the sidebar collapsed', () => {
        const target: ResourceDeepLinkTarget & { openSpec: true } = {
            resourceType: 'prototype',
            resourceId: 'home / 方案',
            projectId: 'client-a',
            openSpec: true,
            collapseSidebar: true,
        };
        const url = buildIndexDeepLinkUrl(target, 'http://localhost:51720/current/path?ignored=1');

        expect(url).toBe('http://localhost:51720/?projectId=client-a&p=home+%2F+%E6%96%B9%E6%A1%88&spec=1&sidebar=collapsed');
        expect(parseIndexDeepLink(url)).toEqual({
            resourceType: 'prototype',
            resourceId: 'home / 方案',
            view: 'demo',
            projectId: 'client-a',
            openSpec: true,
            collapseSidebar: true,
        });
    });

    it('does not preserve removed prototype canvas deep links', () => {
        const url = buildIndexDeepLinkUrl({
            resourceType: 'prototype',
            resourceId: 'express-home',
            view: 'canvas',
            projectId: 'client-a',
        }, 'http://localhost:51720/?doc=ignored');

        expect(url).toBe('http://localhost:51720/?projectId=client-a&p=express-home');
        expect(parseIndexDeepLink('http://localhost:51720/?projectId=client-a&p=express-home&v=canvas')).toEqual({
            resourceType: 'prototype',
            resourceId: 'express-home',
            view: 'demo',
            projectId: 'client-a',
            collapseSidebar: false,
        });
    });

    it('builds and parses short document, template, and theme links', () => {
        expect(buildIndexDeepLinkUrl({
            resourceType: 'doc',
            resourceId: 'product-spec.md',
            projectId: 'client-a',
        }, 'http://localhost:51720/old/path?ignored=1')).toBe('http://localhost:51720/?projectId=client-a&doc=product-spec.md');

        expect(parseIndexDeepLink('/?projectId=client-a&doc=product-spec.md')).toEqual({
            resourceType: 'doc',
            resourceId: 'product-spec.md',
            projectId: 'client-a',
            collapseSidebar: false,
        });

        expect(buildIndexDeepLinkUrl({
            resourceType: 'project-doc',
            resourceId: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
            projectId: 'client-a',
        }, 'http://localhost:51720/old/path?ignored=1')).toBe('http://localhost:51720/?projectId=client-a&docPath=src%2Fprototypes%2Fannotation-demo%2Fdocs%2Fprd-03-states.md');

        expect(parseIndexDeepLink('/?projectId=client-a&docPath=src%2Fprototypes%2Fannotation-demo%2Fdocs%2Fprd-03-states.md')).toEqual({
            resourceType: 'project-doc',
            resourceId: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
            projectId: 'client-a',
            collapseSidebar: true,
        });

        expect(buildIndexDeepLinkUrl({
            resourceType: 'template',
            resourceId: 'write-prd.md',
            projectId: 'client-a',
        }, 'http://localhost:51720/old/path?ignored=1')).toBe('http://localhost:51720/?projectId=client-a&doc=templates%2Fwrite-prd.md');

        expect(parseIndexDeepLink('/?projectId=client-a&doc=templates%2Fwrite-prd.md')).toEqual({
            resourceType: 'template',
            resourceId: 'write-prd.md',
            projectId: 'client-a',
            collapseSidebar: false,
        });

        expect(buildIndexDeepLinkUrl({
            resourceType: 'theme',
            resourceId: 'june',
            projectId: 'client-a',
        }, 'http://localhost:51720/?p=ignored')).toBe('http://localhost:51720/?projectId=client-a&theme=june');

        expect(parseIndexDeepLink('/?projectId=client-a&theme=june')).toEqual({
            resourceType: 'theme',
            resourceId: 'june',
            projectId: 'client-a',
            collapseSidebar: false,
        });
    });

    it('omits redundant canvas view from resource document short links', () => {
        const url = buildIndexDeepLinkUrl({
            resourceType: 'doc',
            resourceId: '资源演示/demo-canvas.excalidraw',
            view: 'canvas',
            projectId: 'make-project',
        }, 'http://localhost:53817/?projectId=make-project&doc=%E8%B5%84%E6%BA%90%E6%BC%94%E7%A4%BA%2Fdemo-flow.drawio.svg');

        expect(url).toBe('http://localhost:53817/?projectId=make-project&doc=%E8%B5%84%E6%BA%90%E6%BC%94%E7%A4%BA%2Fdemo-canvas.excalidraw');
        expect(parseIndexDeepLink(url)).toEqual({
            resourceType: 'doc',
            resourceId: '资源演示/demo-canvas.excalidraw',
            projectId: 'make-project',
            collapseSidebar: false,
        });
    });

    it('keeps parsing legacy resource document canvas view links', () => {
        expect(parseIndexDeepLink('http://localhost:53817/?projectId=make-project&doc=%E8%B5%84%E6%BA%90%E6%BC%94%E7%A4%BA%2Fdemo-canvas.excalidraw&view=canvas')).toEqual({
            resourceType: 'doc',
            resourceId: '资源演示/demo-canvas.excalidraw',
            view: 'canvas',
            projectId: 'make-project',
            collapseSidebar: false,
        });
    });

    it('keeps parsing legacy document and theme links', () => {
        expect(parseResourceDeepLink('/?resourceType=doc&resourceId=product-spec.md&sidebar=collapsed')).toEqual({
            resourceType: 'doc',
            resourceId: 'product-spec.md',
            collapseSidebar: true,
        });

        expect(parseResourceDeepLink('/?resourceType=theme&resourceId=brand')).toEqual({
            resourceType: 'theme',
            resourceId: 'brand',
            collapseSidebar: false,
        });
    });

    it('ignores invalid or incomplete resource links without throwing', () => {
        expect(parseResourceDeepLink('/?resourceType=prototype')).toBeNull();
        expect(parseResourceDeepLink('/?resourceType=doc&resourceId=')).toBeNull();
        expect(parseIndexDeepLink('/?projectId=client-a')).toBeNull();
        expect(parseIndexDeepLink('/?p=')).toBeNull();
    });

    it('holds URL sync until the initial deep link has been handled', () => {
        const initialTarget = {
            resourceType: 'prototype' as const,
            resourceId: 'beginner-guide',
            view: 'demo' as const,
            projectId: 'client-a',
            collapseSidebar: false,
        };
        const currentTarget = {
            resourceType: 'prototype' as const,
            resourceId: 'first-prototype',
            view: 'demo' as const,
            projectId: 'client-a',
        };

        expect(shouldSyncIndexDeepLinkUrl({
            currentTarget,
            initialTarget,
            initialTargetHandled: false,
        })).toBe(false);

        expect(shouldSyncIndexDeepLinkUrl({
            currentTarget,
            initialTarget,
            initialTargetHandled: true,
        })).toBe(true);

        expect(shouldSyncIndexDeepLinkUrl({
            currentTarget,
            initialTarget: null,
            initialTargetHandled: false,
        })).toBe(true);

        expect(shouldSyncIndexDeepLinkUrl({
            currentTarget: null,
            initialTarget,
            initialTargetHandled: true,
        })).toBe(false);
    });

    it('resolves prototype links to demo mode selection and collapsed sidebar state', () => {
        const first = createItem('first');
        const target = createItem('express-home');

        expect(resolveResourceDeepLinkSelection({
            resourceType: 'prototype',
            resourceId: 'express-home',
            view: 'demo',
            collapseSidebar: true,
        }, {
            prototypes: [first, target],
            docs: [],
        })).toEqual({
            kind: 'prototype',
            item: target,
            sidebarTab: 'prototype',
            viewMode: 'demo',
            collapseSidebar: true,
        });
    });

    it('resolves document links and returns null when the resource is missing', () => {
        const doc = createItem('product-spec.md');

        expect(resolveResourceDeepLinkSelection({
            resourceType: 'doc',
            resourceId: 'product-spec.md',
            collapseSidebar: true,
        }, {
            prototypes: [],
            docs: [doc],
        })).toEqual({
            kind: 'doc',
            item: doc,
            sidebarTab: 'document',
            viewMode: 'demo',
            collapseSidebar: true,
        });

        expect(resolveResourceDeepLinkSelection({
            resourceType: 'doc',
            resourceId: 'missing.md',
            collapseSidebar: true,
        }, {
            prototypes: [],
            docs: [doc],
        })).toBeNull();
    });

    it('resolves project document path links to temporary document items outside the resource directory', () => {
        expect(resolveIndexDeepLinkSelection({
            resourceType: 'project-doc',
            resourceId: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
            projectId: 'client-a',
            collapseSidebar: false,
        }, {
            prototypes: [],
            docs: [],
        })).toEqual({
            kind: 'doc',
            item: {
                name: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
                displayName: 'prd-03-states.md',
                jsUrl: '',
                specUrl: '/api/projects/client-a/document-content?path=src%2Fprototypes%2Fannotation-demo%2Fdocs%2Fprd-03-states.md',
                previewUrl: '/spec-template.html?url=%2Fapi%2Fprojects%2Fclient-a%2Fdocument-content%3Fpath%3Dsrc%252Fprototypes%252Fannotation-demo%252Fdocs%252Fprd-03-states.md',
                filePath: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
                projectId: 'client-a',
                resourceId: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
                projectDocumentPath: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
            },
            sidebarTab: 'document',
            viewMode: 'demo',
            collapseSidebar: false,
        });

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'project-doc',
            resourceId: 'templates/prototype-spec.html',
            projectId: 'client-a',
            collapseSidebar: false,
        }, {
            prototypes: [],
            docs: [],
        })).toEqual({
            kind: 'doc',
            item: {
                name: 'templates/prototype-spec.html',
                displayName: 'prototype-spec.html',
                jsUrl: '',
                specUrl: '/api/projects/client-a/document-content?path=templates%2Fprototype-spec.html',
                previewUrl: '/api/projects/client-a/document-content?path=templates%2Fprototype-spec.html',
                filePath: 'templates/prototype-spec.html',
                projectId: 'client-a',
                resourceId: 'templates/prototype-spec.html',
                projectDocumentPath: 'templates/prototype-spec.html',
            },
            sidebarTab: 'document',
            viewMode: 'demo',
            collapseSidebar: false,
        });
    });

    it('resolves hidden HTML-review canvas and Draw.io artifacts without listing asset folders', () => {
        const canvasPath = 'src/resources/.assets/examples/demo.html/diagrams/mermaid-1.excalidraw';
        const drawioPath = 'src/resources/.assets/examples/demo.html/diagrams/drawio-1.drawio.svg';

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'project-doc',
            resourceId: canvasPath,
            view: 'canvas',
            projectId: 'make-project',
            collapseSidebar: true,
        }, { prototypes: [], docs: [] })).toMatchObject({
            kind: 'doc',
            item: {
                name: '.assets/examples/demo.html/diagrams/mermaid-1.excalidraw',
                resourceId: '.assets/examples/demo.html/diagrams/mermaid-1.excalidraw',
                filePath: canvasPath,
                projectDocumentPath: canvasPath,
                canvasFilePath: canvasPath,
                openMode: 'canvas',
            },
            viewMode: 'canvas',
        });

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'project-doc',
            resourceId: drawioPath,
            projectId: 'make-project',
            collapseSidebar: true,
        }, { prototypes: [], docs: [] })).toMatchObject({
            kind: 'doc',
            item: {
                name: '.assets/examples/demo.html/diagrams/drawio-1.drawio.svg',
                resourceId: '.assets/examples/demo.html/diagrams/drawio-1.drawio.svg',
                filePath: drawioPath,
                projectDocumentPath: drawioPath,
                openMode: 'drawio',
            },
        });
    });

    it('resolves document canvas links back to canvas view mode', () => {
        const canvasDoc = createItem('资源演示/demo-canvas.excalidraw');

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'doc',
            resourceId: '资源演示/demo-canvas.excalidraw',
            view: 'canvas',
            projectId: 'make-project',
            collapseSidebar: false,
        }, {
            prototypes: [],
            docs: [canvasDoc],
        })).toEqual({
            kind: 'doc',
            item: canvasDoc,
            sidebarTab: 'document',
            viewMode: 'canvas',
            collapseSidebar: false,
        });
    });

    it('resolves short links for prototypes, documents, templates, and themes', () => {
        const prototype = createItem('express-home');
        const doc = createItem('product-spec.md');
        const templateDoc = createItem('templates/prd-template');
        const template = createItem('write-prd.md');
        const theme = { name: 'june', displayName: 'June' };

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'prototype',
            resourceId: 'express-home',
            view: 'demo',
            projectId: 'client-a',
            collapseSidebar: false,
        }, {
            prototypes: [prototype],
            docs: [doc],
            themes: [theme],
        })).toEqual({
            kind: 'prototype',
            item: prototype,
            sidebarTab: 'prototype',
            viewMode: 'demo',
            collapseSidebar: false,
        });

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'doc',
            resourceId: 'product-spec.md',
            projectId: 'client-a',
            collapseSidebar: false,
        }, {
            prototypes: [prototype],
            docs: [doc],
            themes: [theme],
        })).toEqual({
            kind: 'doc',
            item: doc,
            sidebarTab: 'document',
            viewMode: 'demo',
            collapseSidebar: false,
        });

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'template',
            resourceId: 'write-prd.md',
            projectId: 'client-a',
            collapseSidebar: false,
        }, {
            prototypes: [prototype],
            docs: [doc],
            templates: [template],
            themes: [theme],
        })).toEqual({
            kind: 'template',
            item: template,
            sidebarTab: 'assets',
            resourceSection: 'templates',
            collapseSidebar: false,
        });

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'template',
            resourceId: 'prd-template.md',
            projectId: 'client-a',
            collapseSidebar: false,
        }, {
            prototypes: [prototype],
            docs: [doc, templateDoc],
            templates: [],
            themes: [theme],
        })).toEqual({
            kind: 'doc',
            item: templateDoc,
            sidebarTab: 'document',
            viewMode: 'demo',
            collapseSidebar: false,
        });

        expect(resolveIndexDeepLinkSelection({
            resourceType: 'theme',
            resourceId: 'june',
            projectId: 'client-a',
            collapseSidebar: false,
        }, {
            prototypes: [prototype],
            docs: [doc],
            themes: [theme],
        })).toEqual({
            kind: 'theme',
            theme,
            sidebarTab: 'assets',
            resourceSection: 'themes',
            collapseSidebar: false,
        });
    });
});
