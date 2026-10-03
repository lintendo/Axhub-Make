import { describe, expect, it } from 'vitest';

import {
    buildMarkdownFileMetaUrl,
    buildMarkdownFileUrl,
    buildSpecTemplatePreviewUrl,
    resolveMarkdownPreviewIframeUrl,
} from './markdownPreview';

describe('markdown preview url helpers', () => {
    it('scopes local Markdown file endpoints to their owning project', () => {
        expect(buildMarkdownFileUrl('/workspace/client/src/resources/local-prd.md', 'client-project'))
            .toBe('/api/markdown-file?path=%2Fworkspace%2Fclient%2Fsrc%2Fresources%2Flocal-prd.md&projectId=client-project');
        expect(buildMarkdownFileMetaUrl('/workspace/client/src/resources/local-prd.md', 'client-project'))
            .toBe('/api/markdown-file-meta?path=%2Fworkspace%2Fclient%2Fsrc%2Fresources%2Flocal-prd.md&projectId=client-project');
    });

    it('wraps metadata-only markdown templates in the rendered preview shell', () => {
        expect(resolveMarkdownPreviewIframeUrl({
            name: 'write-prd.md',
            specUrl: '/api/docs/templates/write-prd.md',
            projectId: 'client-project',
        }, 'template')).toBe('/spec-template.html?url=%2Fapi%2Fdocs%2Ftemplates%2Fwrite-prd.md%3FprojectId%3Dclient-project');
    });

    it('derives rendered preview URLs when selected markdown items skipped normalization', () => {
        expect(resolveMarkdownPreviewIframeUrl({
            name: 'write-prd.md',
            projectId: 'client-project',
        }, 'template')).toBe('/spec-template.html?url=%2Fapi%2Fdocs%2Ftemplates%2Fwrite-prd.md%3FprojectId%3Dclient-project');

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'guide.md',
            projectId: 'client-project',
        }, 'doc')).toBe('/spec-template.html?url=%2Fapi%2Fprojects%2Fclient-project%2Fdocs%2Fguide.md%2Fcontent');
    });

    it('does not wrap markdown URLs twice and leaves non-markdown previews direct', () => {
        const renderedUrl = buildSpecTemplatePreviewUrl('/api/docs/templates/write-prd.md?projectId=client-project');

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'write-prd.md',
            previewUrl: renderedUrl,
            projectId: 'client-project',
        }, 'template')).toBe(renderedUrl);

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'assets/logo.png',
            previewUrl: '/api/docs/assets%2Flogo.png',
            projectId: 'client-project',
        }, 'doc')).toBe('/api/docs/assets%2Flogo.png?projectId=client-project');
    });

    it('wraps project content endpoints and local markdown paths in the rendered preview shell', () => {
        expect(resolveMarkdownPreviewIframeUrl({
            name: 'prd',
            specUrl: '/api/projects/client-project/docs/prd/content',
        }, 'doc')).toBe('/spec-template.html?url=%2Fapi%2Fprojects%2Fclient-project%2Fdocs%2Fprd%2Fcontent');

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
            projectId: 'client-project',
            projectDocumentPath: 'src/prototypes/annotation-demo/docs/prd-03-states.md',
        }, 'doc')).toBe('/spec-template.html?url=%2Fapi%2Fprojects%2Fclient-project%2Fdocument-content%3Fpath%3Dsrc%252Fprototypes%252Fannotation-demo%252Fdocs%252Fprd-03-states.md');

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'templates/prototype-spec.html',
            filePath: 'templates/prototype-spec.html',
            projectId: 'client-project',
            projectDocumentPath: 'templates/prototype-spec.html',
        }, 'doc')).toBe('/api/projects/client-project/document-content?path=templates%2Fprototype-spec.html');

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'local-prd',
            absoluteFilePath: '/workspace/client/src/resources/local-prd.md',
            projectId: 'client-project',
        }, 'doc')).toBe('/spec-template.html?url=%2Fapi%2Fmarkdown-file%3Fpath%3D%252Fworkspace%252Fclient%252Fsrc%252Fresources%252Flocal-prd.md%26projectId%3Dclient-project');
    });

    it('keeps HTML resources on direct iframe URLs so the HTML bootstrap can expose page annotation', () => {
        expect(resolveMarkdownPreviewIframeUrl({
            name: 'visual-prd.html',
            specUrl: '/api/markdown-file?path=%2Fworkspace%2Fclient%2Fsrc%2Fresources%2Fvisual-prd.html',
            projectId: 'client-project',
        }, 'doc')).toBe('/api/markdown-file?path=%2Fworkspace%2Fclient%2Fsrc%2Fresources%2Fvisual-prd.html&projectId=client-project');

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'visual-prd.html',
            absoluteFilePath: '/workspace/client/src/resources/visual-prd.html',
            projectId: 'client-project',
        }, 'doc')).toBe('/api/markdown-file?path=%2Fworkspace%2Fclient%2Fsrc%2Fresources%2Fvisual-prd.html&projectId=client-project');

        expect(resolveMarkdownPreviewIframeUrl({
            name: 'landing.html',
            projectId: 'client-project',
        }, 'template')).toBe('/api/docs/templates/landing.html?projectId=client-project');
    });
});
