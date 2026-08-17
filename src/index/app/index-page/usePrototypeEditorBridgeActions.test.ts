import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  activatePrototypeEditorVoiceElement,
  createPrototypeEditorVoiceComment,
  findPrototypeEditorVoiceElements,
  getPrototypeEditorVoiceElementStructure,
  isHtmlDocumentPreviewUrl,
  isPrototypeEditorVoiceTargetsEvent,
  refreshPrototypeEditorVoiceComments,
  readPrototypeEditorVoiceTargets,
  readPrototypeEditorVoiceTarget,
} from './usePrototypeEditorBridgeActions';

describe('usePrototypeEditorBridgeActions source', () => {
  function readSource() {
    return readFileSync(resolve(__dirname, './usePrototypeEditorBridgeActions.ts'), 'utf8');
  }

  it('enables prototype editors without assistant runtime bridge options', () => {
    const source = readSource();
    const buildContextSource = source.slice(
      source.indexOf('const buildPrototypeEditorContext = useCallback'),
      source.indexOf('const buildPrototypeEditorEnableOptions = useCallback'),
    );

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
    expect(source).toContain('makeServerOrigin: resolveInjectedMakeServerOrigin(window)');
    expect(buildContextSource).toContain('makeServerOrigin: resolveInjectedMakeServerOrigin(window)');
    expect(buildContextSource).not.toContain('context.makeServerOrigin');
    expect(source).not.toContain('annotationApiBaseUrl: window.location.origin');
    expect(source).toContain('annotationProjectId: context.projectId');
    expect(source).toContain("interactionProfile: 'design' | 'annotation';");
    expect(source).toContain("interactionProfile: getAnnotationSession?.() ? 'annotation' : 'design',");
    expect(source).toContain('selectedPageId?: string | null;');
    expect(source).toContain('agentRunConcurrency: number;');
    expect(source).toContain('autoClearCompletedComments: boolean;');
    expect(source).toContain('agentRunConcurrency,');
    expect(source).toContain('pageId: normalizePrototypeEditorPageId(selectedPageId) || readPrototypeEditorPageIdFromIframe(iframe)');
    expect(source).toContain('const commentPageScope = buildPrototypeEditorCommentPageScope(context);');
    expect(source).toContain('? { ...context, commentPageScope }');
    expect(source).toContain('buildPrototypeEditorEnableOptions(context)');
    expect(source).toContain('agentRunConcurrency,');
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION'");
    expect(source).toContain('if (!autoClearCompletedComments) return;');
    expect(source).toContain("target: 'completed'");
    expect(source).toContain('await clearCompletedCommentsForIframe(iframe, resolvedEditors);');
    expect(source).toContain('await clearCompletedCommentsForIframe(iframe);');
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

  it('uses the non-retrying request policy for commit messages', () => {
    const source = readSource();

    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_PREPARE_SAVE'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_PREFLIGHT_SAVE'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_COMMIT_SAVE'");
    expect(source).toContain('retryDelaysMs: [0]');
  });

  it('uses the non-retrying request policy for voice comment writes', () => {
    const source = readSource();
    const createSource = source.slice(
      source.indexOf('const createVoiceComment = useCallback'),
      source.indexOf('const refreshVoiceComments = useCallback'),
    );

    expect(createSource).toContain('retryDelaysMs: [0]');
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
    expect(isHtmlDocumentPreviewUrl(
      '/api/projects/project/document-content?path=templates%2Fprototype-spec.html',
      'http://127.0.0.1:64900',
    )).toBe(true);
  });

  it('returns the preferred bounded target from a cross-origin preview state response', async () => {
    const target = {
      targetRef: 'page.1.1',
      label: 'div',
      textExcerpt: '会议发起',
      tagName: 'div',
      role: null,
      path: 'body > section > div',
      childCount: 0,
    };

    await expect(readPrototypeEditorVoiceTarget({
      editors: null,
      queryState: async () => ({
        type: 'AXHUB_PROTOTYPE_EDITOR_STATE',
        success: true,
        voiceTargets: {
          selected: target,
          hovered: null,
          preferred: target,
        },
      }),
    })).resolves.toEqual(target);
  });

  it('uses the direct preview API when it is safely available', async () => {
    const directTarget = {
      source: 'selected',
      elementKey: 'meeting-launch',
    };
    const queryState = vi.fn(async () => ({
      type: 'AXHUB_PROTOTYPE_EDITOR_STATE' as const,
      success: true,
      voiceTarget: { source: 'hovered', elementKey: 'other' },
    }));

    await expect(readPrototypeEditorVoiceTarget({
      editors: { getVoiceTarget: () => directTarget },
      queryState,
    })).resolves.toEqual(directTarget);
    expect(queryState).not.toHaveBeenCalled();
  });

  it('uses direct bounded page voice APIs before the cross-origin RPC fallback', async () => {
    const targets = { selected: null, hovered: null, preferred: null };
    const search = { elements: [], nextCursor: null };
    const rpc = vi.fn(async () => ({
      type: 'AXHUB_PROTOTYPE_EDITOR_STATE' as const,
      success: true,
      voiceTargets: { selected: null, hovered: null, preferred: null },
      voiceSearchResult: search,
    }));
    const editors = {
      getVoiceTargets: () => targets,
      findVoiceElements: () => search,
    };

    await expect(readPrototypeEditorVoiceTargets({ editors, rpc })).resolves.toEqual(targets);
    await expect(findPrototypeEditorVoiceElements({
      editors,
      query: { role: 'button', limit: 5 },
      rpc,
    })).resolves.toEqual(search);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses typed cross-origin page voice RPC results when direct APIs are unavailable', async () => {
    const targets = { selected: null, hovered: null, preferred: null };
    const search = { elements: [], nextCursor: 'page.1.20' };
    const structure = { elements: [], nextCursor: null };
    const activation = { activated: true as const, targetRef: 'page.1.1' };
    const comment = {
      applied: true as const,
      targetRef: 'page.1.1',
      commentId: 'comment-9',
      target: {
        targetRef: 'page.1.1',
        label: 'button',
        textExcerpt: '提交',
        tagName: 'button',
        role: 'button',
        path: 'body > button',
        childCount: 0,
      },
    };
    const rpc = vi.fn(async (message: Record<string, unknown>) => ({
      type: 'AXHUB_PROTOTYPE_EDITOR_STATE' as const,
      success: true,
      ...(message.type === 'AXHUB_PROTOTYPE_EDITOR_VOICE_GET_TARGETS' ? { voiceTargets: targets } : {}),
      ...(message.type === 'AXHUB_PROTOTYPE_EDITOR_VOICE_FIND_ELEMENTS' ? { voiceSearchResult: search } : {}),
      ...(message.type === 'AXHUB_PROTOTYPE_EDITOR_VOICE_GET_STRUCTURE' ? { voiceStructureResult: structure } : {}),
      ...(message.type === 'AXHUB_PROTOTYPE_EDITOR_VOICE_ACTIVATE_ELEMENT' ? { voiceActivationResult: activation } : {}),
      ...(message.type === 'AXHUB_PROTOTYPE_EDITOR_VOICE_CREATE_COMMENT' ? { voiceCommentResult: comment } : {}),
    }));

    await expect(readPrototypeEditorVoiceTargets({ editors: null, rpc })).resolves.toEqual(targets);
    await expect(findPrototypeEditorVoiceElements({
      editors: null,
      query: { text: '提交' },
      rpc,
    })).resolves.toEqual(search);
    await expect(getPrototypeEditorVoiceElementStructure({
      editors: null,
      query: { depth: 2 },
      rpc,
    })).resolves.toEqual(structure);
    await expect(activatePrototypeEditorVoiceElement({
      editors: null,
      targetRef: 'page.1.1',
      rpc,
    })).resolves.toEqual(activation);
    await expect(createPrototypeEditorVoiceComment({
      editors: null,
      targetRef: 'page.1.1',
      content: '修正文案',
      options: { anchorPlacement: 'target', operationId: 'operation-1' },
      rpc,
    })).resolves.toEqual(comment);
    await expect(refreshPrototypeEditorVoiceComments({
      editors: null,
      deletedCommentIds: ['comment-9'],
      rpc,
    })).resolves.toBe(true);

    expect(rpc.mock.calls.map(([message]) => message)).toEqual([
      { type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_GET_TARGETS' },
      { type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_FIND_ELEMENTS', query: { text: '提交' } },
      { type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_GET_STRUCTURE', query: { depth: 2 } },
      { type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_ACTIVATE_ELEMENT', targetRef: 'page.1.1' },
      {
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_CREATE_COMMENT',
        targetRef: 'page.1.1',
        content: '修正文案',
        options: { anchorPlacement: 'target', operationId: 'operation-1' },
      },
      {
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_REFRESH_COMMENTS',
        deletedCommentIds: ['comment-9'],
      },
    ]);
    expect(structuredClone({ targets, search, structure, activation, comment })).toEqual({
      targets,
      search,
      structure,
      activation,
      comment,
    });
  });

  it('rejects failed voice RPC responses without exposing preview internals', async () => {
    const staleRpc = vi.fn(async () => ({
      type: 'AXHUB_PROTOTYPE_EDITOR_STATE' as const,
      success: false,
      error: '页面已变化，请重新查找',
    }));
    const privateRpc = vi.fn(async () => ({
      type: 'AXHUB_PROTOTYPE_EDITOR_STATE' as const,
      success: false,
      error: 'Element #private-selector was not found',
    }));

    await expect(findPrototypeEditorVoiceElements({
      editors: null,
      query: { text: '提交' },
      rpc: staleRpc,
    })).rejects.toThrow('页面已变化，请重新查找');
    await expect(createPrototypeEditorVoiceComment({
      editors: null,
      targetRef: 'page.1.1',
      content: '修正文案',
      options: { anchorPlacement: 'target' },
      rpc: privateRpc,
    })).rejects.toThrow('页面操作失败，请重新获取页面目标后重试');
    await expect(createPrototypeEditorVoiceComment({
      editors: null,
      targetRef: 'page.1.1',
      content: '修正文案',
      options: { anchorPlacement: 'target' },
      rpc: privateRpc,
    })).rejects.not.toThrow(/private-selector/u);
  });

  it('accepts voice target events only from the subscribed iframe, origin, and generation', () => {
    const sourceWindow = {} as Window;
    const iframe = { contentWindow: sourceWindow } as HTMLIFrameElement;
    const event = {
      source: sourceWindow,
      origin: 'http://localhost:51720',
      data: {
        type: 'AXHUB_PROTOTYPE_EDITOR_VOICE_TARGETS_CHANGED',
        subscriptionId: 'voice-sub-1',
        voiceTargets: { selected: null, hovered: null, preferred: null },
      },
    } as unknown as MessageEvent;

    expect(isPrototypeEditorVoiceTargetsEvent(
      event,
      iframe,
      'http://localhost:51720',
      'voice-sub-1',
      4,
      4,
    )).toBe(true);
    expect(isPrototypeEditorVoiceTargetsEvent(
      { ...event, origin: 'http://attacker.invalid' } as MessageEvent,
      iframe,
      'http://localhost:51720',
      'voice-sub-1',
      4,
      4,
    )).toBe(false);
    expect(isPrototypeEditorVoiceTargetsEvent(
      { ...event, source: {} as Window } as MessageEvent,
      iframe,
      'http://localhost:51720',
      'voice-sub-1',
      4,
      4,
    )).toBe(false);
    expect(isPrototypeEditorVoiceTargetsEvent(
      event,
      iframe,
      'http://localhost:51720',
      'voice-sub-1',
      5,
      4,
    )).toBe(false);
  });
});
