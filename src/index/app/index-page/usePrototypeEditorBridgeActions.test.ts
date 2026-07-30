import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isHtmlDocumentPreviewUrl } from './usePrototypeEditorBridgeActions';

describe('usePrototypeEditorBridgeActions source', () => {
  function readSource() {
    return readFileSync(resolve(__dirname, './usePrototypeEditorBridgeActions.ts'), 'utf8');
  }

  it('enables prototype editors without assistant runtime bridge options', () => {
    const source = readSource();

    expect(source).not.toContain('assistantApiBaseUrl');
    expect(source).not.toContain('assistantProjectPath');
    expect(source).not.toContain('assistantWebEditorClientId');
    expect(source).not.toContain('runtimeOverride');
    expect(source).not.toContain('agentBridge:');
    expect(source).not.toContain('integrationWs:');
    expect(source).not.toContain('initialSelectionModeActive');
    expect(source).toContain("toolbarMode: 'host'");
    expect(source).toContain('mobileMode: context.mobileMode');
    expect(source).toContain('previewConfig: PreviewConfig;');
    expect(source).toContain('resolvePrototypeEditorMobileMode(');
    expect(source).toMatch(/resolvePrototypeEditorMobileMode\(\s*resourceType,\s*pane,\s*previewConfig,/u);
    expect(source).not.toContain("mobileMode: resourceType === 'prototype' ? pane === 'secondary' : false");
    expect(source).toContain('annotationApiBaseUrl: window.location.origin');
    expect(source).toContain('annotationProjectId: context.projectId');
    expect(source).toContain('selectedPageId?: string | null;');
    expect(source).toContain('agentRunConcurrency: number;');
    expect(source).toContain('agentRunConcurrency,');
    expect(source).toContain('pageId: normalizePrototypeEditorPageId(selectedPageId) || readPrototypeEditorPageIdFromIframe(iframe)');
    expect(source).toContain('const commentPageScope = buildPrototypeEditorCommentPageScope(context);');
    expect(source).toContain('? { ...context, commentPageScope }');
    expect(source).toContain('buildPrototypeEditorEnableOptions(context)');
    expect(source).toContain('agentRunConcurrency,');
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION'");
  });

  it('exposes a query-state bridge action so preview load can inspect decision data before opening panels', () => {
    const source = readSource();

    expect(source).toContain('queryPrototypeEditorState: (iframe: HTMLIFrameElement) => Promise<PrototypeEditorBridgeStateMessage | null>;');
    expect(source).toContain('const queryPrototypeEditorState = useCallback((iframe: HTMLIFrameElement) => (');
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_QUERY_STATE'");
    expect(source).toContain('queryPrototypeEditorState,');
  });

  it('accepts modified annotation elements from cross-origin prompt responses', () => {
    const source = readSource();

    expect(source).toContain('modifiedElements?: CommentaryModifiedElementSummary[];');
  });

  it('exposes a node editing state bridge for cross-origin direct API runs', () => {
    const source = readSource();

    expect(source).toContain('postPrototypeEditorNodeEditingState: (');
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_NODE_EDITING_STATE'");
    expect(source).toContain('elementKey,');
    expect(source).toContain('nextState,');
    expect(source).toContain('taskRef,');
    expect(source).toContain('targetRef: targetRef ?? null,');
    expect(source).toContain('postPrototypeEditorNodeEditingState,');
  });

  it('falls back to the postMessage bridge when same-origin editor APIs are unavailable', () => {
    const source = readSource();

    const enterSource = source.slice(
      source.indexOf('const enterPrototypeEditor = useCallback'),
      source.indexOf('useEffect(() => () =>', source.indexOf('const enterPrototypeEditor = useCallback')),
    );

    expect(enterSource).toContain('let editors = getPrototypeEditorApi(iframe);');
    expect(enterSource).toContain('if (editors?.enable) {');
    expect(enterSource).toContain('const bridgeResult = await postPrototypeEditorEnable(iframe, context);');
    expect(source).toContain('postIframeMessageRequest({');
    expect(source).toContain('targetUrl,');
    expect(source).toContain('targetWindow,');
    expect(source).toContain('isCurrent: () =>');
    expect(source).toContain('getPreviewIframeTargetUrl(iframe) === targetUrl');
    expect(source).toContain('generation <= 0');
    expect(source).toContain('getPreviewIframeGeneration(iframe) === generation');
    expect(source).not.toContain("postMessage('*')");
    expect(source).toContain('if (!targetIframe || event.source !== targetIframe.contentWindow) {');
    expect(source).toContain('if (event.origin !== getIframeOrigin(targetIframe)) {');
  });

  it('injects the HTML template bootstrap into raw same-origin HTML docs before falling back to postMessage', () => {
    const source = readSource();
    const enterSource = source.slice(
      source.indexOf('const enterPrototypeEditor = useCallback'),
      source.indexOf('useEffect(() => () =>', source.indexOf('const enterPrototypeEditor = useCallback')),
    );

    expect(source).toContain("const HTML_TEMPLATE_BOOTSTRAP_SRC = '/assets/html-template-bootstrap.js';");
    expect(source).toContain('function isHtmlDocumentPreviewIframe');
    expect(source).toContain("url.pathname.includes('/api/docs/')");
    expect(source).toContain("url.pathname.includes('/api/markdown-file')");
    expect(source).toContain("url.pathname.includes('/prototypes/')");
    expect(source).toContain("url.pathname.endsWith('/spec/content')");
    expect(source).toContain("script.src = HTML_TEMPLATE_BOOTSTRAP_SRC;");
    expect(source).toContain('doc.head?.appendChild(script) ?? doc.documentElement.appendChild(script);');
    expect(source).toContain("readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, 'HtmlTemplateBootstrap')");
    expect(enterSource).toContain('let editors = getPrototypeEditorApi(iframe);');
    expect(enterSource).toContain('editors = await ensureHtmlDocumentPreviewEditorApi(iframe);');
    expect(enterSource).toMatch(/if \(editors\?\.enable\) \{[\s\S]*editors = await ensureHtmlDocumentPreviewEditorApi\(iframe\);[\s\S]*if \(editors\?\.enable\) \{/);
  });

  it('recognizes same-origin HTML prototype spec content URLs without relying on a fixed port', () => {
    expect(isHtmlDocumentPreviewUrl(
      '/api/projects/project/prototypes/home/spec/content?path=spec.html',
      'http://127.0.0.1:64900',
    )).toBe(true);
    expect(isHtmlDocumentPreviewUrl(
      '/api/projects/project/prototypes/home/spec/content?path=spec.md',
      'http://127.0.0.1:64900',
    )).toBe(false);
    expect(isHtmlDocumentPreviewUrl(
      'http://127.0.0.1:41873/api/projects/project/prototypes/home/spec/content?path=nested%2Fspec.html',
      'http://127.0.0.1:64900',
    )).toBe(true);
  });
});
