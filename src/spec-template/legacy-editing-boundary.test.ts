import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSpecTemplateSource(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('spec-template quick editing regression boundary', () => {
  it('exposes SPEC_EDIT parent-window protocol handlers for Markdown quick editing', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');
    const bootstrapSource = readSpecTemplateSource('index.tsx');

    expect(viewerSource).toContain('MarkdownViewerHandle');
    expect(viewerSource).toContain('SPEC_EDIT_QUERY_KEY');
    expect(viewerSource).toContain('SPEC_EDIT_ENABLE');
    expect(viewerSource).toContain('SPEC_EDIT_SET_MODE');
    expect(viewerSource).toContain('SPEC_EDIT_SAVE');
    expect(viewerSource).toContain('SPEC_EDIT_EXIT');
    expect(viewerSource).toContain('SPEC_EDIT_STATUS_REQUEST');
    expect(viewerSource).toContain('SPEC_EDIT_PROMPT_REQUEST');
    expect(viewerSource).toContain('SPEC_EDIT_PROMPT_RESPONSE');
    expect(viewerSource).toContain('SPEC_EDIT_STATUS');
    expect(bootstrapSource).toContain('window.SpecTemplateBootstrap.editors');
    expect(bootstrapSource).toContain('enable(');
    expect(bootstrapSource).toContain('disable(');
    expect(bootstrapSource).toContain('setQuickEditMode(');
    expect(bootstrapSource).toContain('getStatus(');
    expect(bootstrapSource).toContain('handleCopyPrompt(');
    expect(bootstrapSource).toContain('save(');
  });

  it('saves project document content endpoints through the original PUT API', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(viewerSource).toContain("PROJECT_DOCUMENT_CONTENT_PATH_RE.test(pathname)");
    expect(viewerSource).toContain("PROJECT_DOCUMENT_PATH_CONTENT_RE.test(pathname)");
    expect(viewerSource).toMatch(
      /if \([\s\S]*pathname === '\/api\/markdown-file'[\s\S]*pathname\.startsWith\('\/api\/docs\/'\)[\s\S]*PROJECT_DOCUMENT_CONTENT_PATH_RE\.test\(pathname\)[\s\S]*PROJECT_DOCUMENT_PATH_CONTENT_RE\.test\(pathname\)[\s\S]*\) \{[\s\S]*?method: 'PUT'/,
    );
  });

  it('resolves relative images in project document content previews through a project asset endpoint', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(viewerSource).toContain('buildProjectDocumentAssetUrl');
    expect(viewerSource).toContain("parsedUrl.pathname.match(/^\\/api\\/projects\\/([^/]+)\\/document-content$/iu)");
    expect(viewerSource).toContain('/api/projects/${encodeURIComponent(projectId)}/document-asset');
    expect(viewerSource).toContain("path=${encodeURIComponent(filePath)}");
    expect(viewerSource).toContain("asset=${encodeURIComponent(assetPath)}");
  });

  it('supports opening Markdown documents directly in edit mode from the URL', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(viewerSource).toContain("params.get('mode')");
    expect(viewerSource).toMatch(/params\.get\('mode'\)[\s\S]*['"]edit['"][\s\S]*return 'edit'/);
    expect(viewerSource).toContain("params.get('editor') === 'specComment'");
    expect(viewerSource).toContain("return 'comment'");
  });

  it('broadcasts successful markdown-file saves to directory readers', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(viewerSource).toContain('axhub-markdown-docs');
    expect(viewerSource).toContain('BroadcastChannel');
    expect(viewerSource).toContain("type: 'markdown-file-saved'");
    expect(viewerSource).toContain('resolveSavedMarkdownFilePath(currentDoc.url)');
    expect(viewerSource).toContain('path: savedMarkdownPath');
    expect(viewerSource).toContain('updatedAt: Date.now()');
  });

  it('keeps the Markdown comment prompt helper used by quick-edit comment mode', () => {
    const helperPath = resolve(__dirname, 'quickEdit.ts');
    expect(existsSync(helperPath)).toBe(true);
    const helperSource = readFileSync(helperPath, 'utf8');

    expect(helperSource).toContain('resolveMarkdownQuickEditMeta');
    expect(helperSource).toContain('buildMarkdownCommentPrompt');
    expect(helperSource).toContain('formatLocatorPath');
  });

  it('exposes synchronous Markdown comment prompt text to the preview host', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');
    const bootstrapSource = readSpecTemplateSource('index.tsx');

    expect(viewerSource).toContain('getCopyPromptText: () => string;');
    expect(viewerSource).toMatch(
      /getCopyPromptText\(\) \{[\s\S]*?return buildCommentPromptPayload\(\)\.prompt;/,
    );
    expect(bootstrapSource).toMatch(
      /getCopyPromptText\(\) \{[\s\S]*?return markdownViewerRef\.current\?\.getCopyPromptText\(\) \?\? '';/,
    );
  });

  it('unwraps JSON document content responses before rendering Markdown', () => {
    const bootstrapSource = readSpecTemplateSource('index.tsx');

    expect(bootstrapSource).toContain('readMarkdownResponseContent');
    expect(bootstrapSource).toContain("contentType.includes('application/json')");
    expect(bootstrapSource).toContain("typeof payload?.content === 'string'");
  });

  it('renders Markdown with the built-in renderer without adding a separate white page shell', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(viewerSource).toContain("import { XMarkdown } from '@ant-design/x-markdown';");
    expect(viewerSource.indexOf("import { XMarkdown } from '@ant-design/x-markdown';")).toBeLessThan(
      viewerSource.indexOf("import '@ant-design/x-markdown/themes/light.css';"),
    );
    expect(viewerSource).toContain('<XMarkdown');
    expect(viewerSource).toContain('className="x-markdown-light"');
    expect(viewerSource).not.toMatch(/\.markdown-content\s*>\s*div\s*\{[\s\S]*background:\s*#fff/);
  });

  it('keeps long Markdown table-of-contents lists scrollable and active links visible', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(viewerSource).toContain('anchor-sidebar-scroll');
    expect(viewerSource).toMatch(/\.anchor-sidebar-scroll\s*\{[\s\S]*overflow-y:\s*auto/);
    expect(viewerSource).toContain('scrollActiveAnchorIntoView');
    expect(viewerSource).toContain('onChange={scrollActiveAnchorIntoView}');
    expect(viewerSource).toContain("link.getAttribute('href') === activeHref");
    expect(viewerSource).not.toContain('targetElement.scrollIntoView');
  });

  it('keeps the document formatting toolbar sticky to the page viewport', () => {
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(viewerSource).toMatch(
      /\.spec-editor-shell \.simple-editor-wrapper\s*\{[^}]*overflow:\s*visible;/,
    );
    expect(viewerSource).toMatch(
      /\.spec-editor-shell \.tiptap-toolbar\s*\{[^}]*top:\s*0;[^}]*position:\s*sticky;/,
    );
  });

  it('initializes text comment editing for Markdown documents', () => {
    const bootstrapSource = readSpecTemplateSource('index.tsx');
    const viewerSource = readSpecTemplateSource('MarkdownViewer.tsx');

    expect(bootstrapSource).toContain('window.SpecTemplateBootstrap.editors');
    expect(bootstrapSource).toContain('enableDocumentEditor');
    expect(bootstrapSource).toContain('markdownViewerRef.current?.enableDocumentEditor');
    expect(bootstrapSource).toContain('markdownViewerRef.current?.getHostToolbarState');
    expect(bootstrapSource).toContain('markdownViewerRef.current?.subscribeHostToolbarState');
    expect(bootstrapSource).toContain('markdownViewerRef.current?.runHostToolbarAction');
    expect(bootstrapSource).not.toContain("import { createCommentary } from '@axhub/commentary';");
    expect(viewerSource).toContain("createCommentary({");
    expect(viewerSource).toContain("interactionProfile: 'text-comment'");
    expect(viewerSource).toContain("toolbarMode: 'host'");
    expect(viewerSource).toContain('initialSelectionModeActive: false');
    expect(viewerSource).toContain('hideExecutionControls: true');
    expect(viewerSource).toContain("editor.runHostToolbarAction?.({ type: 'toggle-selection-mode', active: false })");
    expect(viewerSource).toContain('initialDarkMode');
    expect(viewerSource).not.toContain('agentBridge');
    expect(viewerSource).not.toContain('integrationWs');
    expect(viewerSource).not.toContain('resolveDefaultEditorApiBaseUrl');
    expect(viewerSource).not.toContain('showCopyPromptAction: false');
    expect(viewerSource).toContain('getHostToolbarState');
    expect(viewerSource).toContain('subscribeHostToolbarState');
    expect(viewerSource).toContain('runHostToolbarAction');
    expect(viewerSource).toContain('SimpleEditor');
    expect(viewerSource).toContain('contentType="markdown"');
    expect(viewerSource).toContain('toolbarPreset="full"');
    expect(viewerSource).toContain('imageUpload={uploadImageToCurrentDoc}');
    expect(viewerSource).toContain("formData.append('docUrl'");
    expect(viewerSource).toContain("xhr.open('POST', '/api/spec-doc/upload-image')");
    expect(viewerSource).toContain('onMarkdownChange={updateCurrentDocContent}');
    expect(viewerSource).toContain('shouldIgnoreInitialMarkdownEditorChange');
    expect(viewerSource).toContain('markCurrentEditorUserChange');
    expect(viewerSource).toContain('onBeforeInputCapture');
    expect(viewerSource).toContain('onPasteCapture');
    expect(viewerSource).toContain('onDropCapture');
    expect(viewerSource).not.toContain('<textarea');
  });
});
