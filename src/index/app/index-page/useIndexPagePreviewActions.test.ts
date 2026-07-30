import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildProjectPrototypeIframeUrl,
  buildPrototypePageHashUrl,
  DEFAULT_EXPORT_IMAGE_CONFIG,
} from './previewActions.helpers';

function readPreviewRootSource() {
  return readFileSync(resolve(__dirname, './useIndexPagePreviewActions.tsx'), 'utf8');
}

function readPreviewActionsSource() {
  return [
    './useIndexPagePreviewActions.tsx',
    './previewActions.helpers.ts',
    './usePreviewRuntimeActions.ts',
    './usePrototypeEditorBridgeActions.ts',
  ].map((fileName) => readFileSync(resolve(__dirname, fileName), 'utf8')).join('\n');
}

function readUiReviewSupportSource() {
  return [
    readFileSync(resolve(__dirname, './useIndexPagePreviewActions.tsx'), 'utf8'),
    readFileSync(resolve(__dirname, '../hooks/useIndexPagePresentationPropsBuilder.ts'), 'utf8'),
    readFileSync(resolve(__dirname, '../../utils/uiReviewPrompt.ts'), 'utf8'),
    readFileSync(resolve(__dirname, '../../utils/markdownPreview.ts'), 'utf8'),
  ].join('\n');
}

function getSourceSegment(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('useIndexPagePreviewActions source', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enables image asset export by default', () => {
    expect(DEFAULT_EXPORT_IMAGE_CONFIG.includeImageAssets).toBe(true);
  });

  it('opens a selected Draw.io review draft once from the openDrawio deep link', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("searchParams.get('openDrawio')");
    expect(source).toContain("searchParams.delete('openDrawio')");
    expect(source).toContain('window.history.replaceState');
    expect(source).toContain('void openDrawioResourceEditor({');
  });

  it('returns minified export config json for copy-config flow', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('return JSON.stringify(configData);');
    expect(source).not.toContain('return JSON.stringify(configData, null, 2);');
  });

  it('keeps focus on the host document before requesting host-side figma clipboard writes', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('copyToClipboard');
    expect(source).toContain('writeFigmaOfficialClipboardPayload');
    const requestCopyToFigmaSegment = getSourceSegment(
      source,
      'const requestCopyToFigma = useCallback(() => {',
      'const requestCurrentScreenshot = useCallback',
    );

    expect(requestCopyToFigmaSegment).not.toContain('targetIframe.focus();');
    expect(requestCopyToFigmaSegment).not.toContain('targetIframe.contentWindow?.focus?.();');
    expect(source).toContain("type: 'axhub.quickEdit.export.copyToFigma'");
    expect(source).toContain("clipboardWriteTarget: 'host'");
    expect(source).toContain("event.data.type !== 'axhub.quickEdit.export.copyToFigmaResult'");
    expect(source).toContain('writeFigmaOfficialClipboardPayload(result.payloadText);');
    expect(source).not.toContain("type: 'COPY_TO_FIGMA'");
    expect(source).not.toContain("event.data.type !== 'COPY_TO_FIGMA_RESULT'");
  });

  it('does not mention the old page-switch figma paste workaround after copy succeeds', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("messageApi.success('复制成功');");
    expect(source).not.toContain('粘贴后若文本不显示，需切换页面再返回');
  });

  it('keeps split preview intact and enables pane-aware quick edit orchestration', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('secondaryPreviewIframeRef');
    expect(source).toContain('const iframeUrlMode =');
    expect(source).toContain('primaryIframeUrl');
    expect(source).toContain('secondaryIframeUrl');
    expect(source).toContain("axhubPane', pane");
    expect(source).toContain('resolvePrototypeEditorMobileMode(');
    const bridgeHookSource = getSourceSegment(
      source,
      'const prototypeEditorBridgeActions = usePrototypeEditorBridgeActions({',
      'const getPrototypeEditorApi = prototypeEditorBridgeActions.getPrototypeEditorApi;',
    );
    expect(bridgeHookSource).toContain('previewConfig,');
    expect(source).toContain('getPrimaryPreviewIframe');
    expect(source).toContain('getSecondaryPreviewIframe');
    expect(source).toContain('getPreviewIframes');
    expect(source).not.toContain("webEditorRequested || editorStatus.mode === 'webEditorV2'");
    expect(source).not.toContain('setPreviewConfig(createDefaultPreviewConfig())');
    expect(source).not.toContain('setPreviewConfig(previewConfigBeforeWebEditorRef.current)');
  });

  it('keeps preview device state and actions in a dedicated hook module', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("import { usePreviewDeviceActions } from './usePreviewDeviceActions';");
    expect(source).toContain('const previewDeviceActions = usePreviewDeviceActions();');
    expect(source).toContain('previewDeviceActions.previewConfig');
    expect(source).toContain('previewDeviceActions.handleActivateSplitPreview');
    expect(source).not.toContain("from 'lucide-react'");
    expect(source).not.toContain('const [previewConfig, setPreviewConfig] = useState<PreviewConfig>');
  });

  it('uses shared content mode resolution so resource tab browsing does not exit prototype canvas', () => {
    const source = readPreviewRootSource();

    expect(source).toContain("import { resolveIndexContentMode } from './contentMode';");
    expect(source).toContain('const resolvedContentMode = resolveIndexContentMode({');
    expect(source).toContain('const contentMode = contentModeOverride || resolvedContentMode;');
    expect(source).toContain('viewMode,');
    expect(source).toContain('selectedDocOpenMode: selectedDoc?.openMode');
  });

  it('keeps preview iframe refs and pane-aware posting in a dedicated hook module', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("import { usePreviewIframeActions } from './usePreviewIframeActions';");
    expect(source).toContain('const previewIframeActions = usePreviewIframeActions({');
    expect(source).toContain('previewMode: previewConfig.previewMode');
    expect(source).toContain('messageApi');
    expect(source).toContain('const previewIframeRef = previewIframeActions.previewIframeRef;');
    expect(source).toContain('const getPreviewIframes = previewIframeActions.getPreviewIframes;');
    expect(source).toContain('const postToPreview = previewIframeActions.postToPreview;');
    expect(source).not.toContain('const previewIframeRef = useRef<HTMLIFrameElement | null>(null);');
    expect(source).not.toContain('const secondaryPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);');
  });

  it('keeps quick-edit runtime postMessage helpers in a dedicated hook module', () => {
    const source = readPreviewRootSource();

    expect(source).toContain("import { usePreviewRuntimeActions } from './usePreviewRuntimeActions';");
    expect(source).toContain('const previewRuntimeActions = usePreviewRuntimeActions({');
    expect(source).toContain('postToPreview');
    expect(source).toContain('const forwardQuickEditPatch = previewRuntimeActions.forwardQuickEditPatch;');
    expect(source).toContain('const reportQuickEditRuntimeError = previewRuntimeActions.reportQuickEditRuntimeError;');
    expect(source).toContain('const exitQuickEditRuntime = previewRuntimeActions.exitQuickEditRuntime;');
    expect(source).toContain('const saveQuickEditRuntime = previewRuntimeActions.saveQuickEditRuntime;');
    expect(source).not.toContain('const forwardQuickEditPatch = useCallback((patch: unknown, iframe?: HTMLIFrameElement | null) => {');
    expect(source).not.toContain('const reportQuickEditRuntimeError = useCallback((message: string, iframe?: HTMLIFrameElement | null) => {');
  });

  it('keeps prototype editor bridge request lifecycle in a dedicated hook module', () => {
    const rootSource = readPreviewRootSource();
    const combinedSource = readPreviewActionsSource();

    expect(rootSource).toContain("import { usePrototypeEditorBridgeActions } from './usePrototypeEditorBridgeActions';");
    expect(rootSource).toContain('const prototypeEditorBridgeActions = usePrototypeEditorBridgeActions({');
    expect(rootSource).toContain('const getPrototypeEditorApi = prototypeEditorBridgeActions.getPrototypeEditorApi;');
    expect(rootSource).toContain('const enterPrototypeEditor = prototypeEditorBridgeActions.enterPrototypeEditor;');
    expect(rootSource).toContain('const postPrototypeEditorHostToolbarAction = prototypeEditorBridgeActions.postPrototypeEditorHostToolbarAction;');
    expect(rootSource).not.toContain('const prototypeEditorBridgeRequestSeqRef = useRef(0);');
    expect(rootSource).not.toContain('const postPrototypeEditorBridgeMessage = useCallback((');
    expect(rootSource).not.toContain("event.data?.type !== 'AXHUB_PROTOTYPE_EDITOR_STATE'");
    expect(combinedSource).toContain('PROTOTYPE_EDITOR_BRIDGE_TIMEOUT_MS');
    expect(combinedSource).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE'");
    expect(combinedSource).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE_PANEL_ONLY'");
    expect(combinedSource).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_DISABLE_PANEL_ONLY'");
    expect(combinedSource).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_DISABLE'");
    expect(combinedSource).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION'");
    expect(combinedSource).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_SAVE_ACTION'");
    expect(combinedSource).toContain('enablePanelOnly');
    expect(combinedSource).toContain('disablePanelOnly');
    expect(combinedSource).toContain("'AXHUB_PROTOTYPE_EDITOR_STATE'");
  });

  it('handles iframe-originated host toolbar action requests through the Make host runtime', () => {
    const source = readPreviewRootSource();

    expect(source).toContain("data.type !== 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_RESULT'");
    expect(source).toContain('const sourcePane = resolvePreviewPaneForIframe(targetIframe);');
    expect(source).toContain('const action = sourcePane');
    expect(source).toContain('? { ...data.action, pane: sourcePane } as CommentaryHostToolbarAction');
    expect(source).toContain('const handled = await runHostToolbarAction(action);');
    expect(source).toContain('event.source !== targetIframe.contentWindow');
    expect(source).toContain('targetIframe.contentWindow?.postMessage(');
  });

  it('wires prototype review report list state, report APIs, and removes prompt copy/page zoom actions', () => {
    const source = readUiReviewSupportSource();
    const previewRootSource = readPreviewRootSource();

    expect(source).toContain("const [reviewPanelOpen, setReviewPanelOpen] = useState(false);");
    expect(source).toContain("const [activeReviewReportId, setActiveReviewReportId] = useState<string | null>(null);");
    expect(source).toContain("const [reviewReports, setReviewReports] = useState<ReviewReportSummary[]>([]);");
    expect(source).toContain("const [selectedReviewReport, setSelectedReviewReport] = useState<ReviewReportDetail | null>(null);");
    expect(source).toContain("const [reviewLoading, setReviewLoading] = useState(false);");
    expect(source).toContain("const [reviewDetailLoading, setReviewDetailLoading] = useState(false);");
    expect(source).toContain("const [reviewUploadLoading, setReviewUploadLoading] = useState(false);");
    expect(source).toContain("const [reviewLanSubmitConfig, setReviewLanSubmitConfig] = useState<ReviewLanSubmitConfig | null>(null);");
    expect(source).not.toContain('ReviewFeishuConfig');
    expect(source).not.toContain('reviewFeishu');
    expect(source).toContain("const [reviewError, setReviewError] = useState('');");
    expect(source).toContain('const reviewDocumentPaths = useMemo');
    expect(source).toContain("design: resolveReviewDocumentPath(selectedItem, 'design')");
    expect(source).toContain("requirements: resolveReviewDocumentPath(selectedItem, 'requirements')");
    expect(source).toContain('const reviewPrompts = useMemo');
    expect(source).toContain("resolveReviewDocumentPath(selectedItem, 'design')");
    expect(source).toContain('buildReviewPrompt({');
    expect(source).toContain("kind: 'design'");
    expect(source).toContain("kind: 'requirements'");
    expect(source).toContain('rules/ui-review-guide.md');
    expect(source).toContain('rules/prototype-review-guide.md');
    expect(source).toContain('apiService.listReviewReports');
    expect(source).toContain('apiService.getReviewReport');
    expect(source).toContain('apiService.uploadReviewReport');
    expect(source).toContain('apiService.deleteReviewReport');
    expect(source).toContain('apiService.getReviewLanSubmitConfig');
    expect(source).toContain('apiService.getReviewLanSubmitConfig(projectId, selectedPrototypeIdentity)');
    expect(source).toContain('apiService.updateReviewLanSubmitConfig');
    expect(source).not.toContain('getReviewFeishuConfig');
    expect(source).not.toContain('updateReviewFeishuConfig');
    expect(source).not.toContain('syncReviewFeishuReports');
    expect(source).not.toContain('handleReviewFeishu');
    expect(source).not.toContain('handleSyncReviewFeishu');
    expect(source).not.toContain('handleOpenReviewFeishu');
    expect(source).toContain('prototypeId: selectedPrototypeIdentity');
    expect(source).toContain('handleReviewPanelToggle');
    expect(source).toContain('handleSelectReviewReport');
    expect(source).toContain('handleBackToReviewList');
    expect(source).toContain('handleCopyReviewReportPath');
    expect(source).toContain('const copyText = `[${report.title}](${report.path})`;');
    expect(source).toContain('await navigator.clipboard.writeText(copyText);');
    expect(source).toContain("messageApi.success('路径已复制');");
    expect(source).toContain("messageApi.error('复制路径失败');");
    expect(source).toContain('handleDeleteReviewReport');
    expect(source).toContain('handleStartReview');
    expect(source).toContain('handleRunReviewDirect');
    expect(source).toContain('handleUploadReviewReport');
    expect(source).toContain('handleReviewLanSubmitEnabledChange');
    expect(source).toContain('reviewPrompt,');
    expect(source).toContain('reviewDocumentPath,');
    expect(source).toContain('reviewPrompts,');
    expect(source).toContain('reviewDocumentPaths,');
    expect(source).toContain('reviewPanelOpen,');
    expect(source).toContain('activeReviewReportId,');
    expect(source).toContain('reviewReports,');
    expect(source).toContain('selectedReviewReport,');
    expect(source).toContain('reviewLoading,');
    expect(source).toContain('reviewDetailLoading,');
    expect(source).toContain('reviewUploadLoading,');
    expect(source).toContain('reviewError,');
    expect(source).toContain('reviewLanSubmitConfig,');
    expect(source).toContain('handleReviewPanelToggle,');
    expect(source).toContain('handleSelectReviewReport,');
    expect(source).toContain('handleBackToReviewList,');
    expect(source).toContain('handleCopyReviewReportPath,');
    expect(source).toContain('handleDeleteReviewReport,');
    expect(source).toContain('handleStartReview,');
    expect(source).toContain('handleRunReviewDirect,');
    expect(source).toContain('handleUploadReviewReport,');
    expect(source).toContain('handleReviewLanSubmitEnabledChange,');
    expect(source).not.toContain('handleCopyReviewPrompt');
    expect(source).not.toContain('handleToggleReviewPageZoom');
    expect(source).not.toContain('reviewPageZoomEnabled');
    expect(previewRootSource).not.toContain('/api/markdown-file-meta?path=');
  });

  it('does not sync Axhub reports until the review panel is open', () => {
    const source = readUiReviewSupportSource();
    const previewRootSource = readPreviewRootSource();

    expect(previewRootSource).toContain('type ReviewAxhubConfig,');
    expect(previewRootSource).toContain('const [reviewAxhubSubmitConfig, setReviewAxhubSubmitConfig] = useState<ReviewAxhubConfig | null>(null);');
    expect(previewRootSource).toContain('const reviewAxhubSyncInFlightRef = useRef<Map<string, Promise<void>>>(new Map());');
    expect(previewRootSource).toContain('const activeReviewScopeKeyRef = useRef');
    expect(previewRootSource).toContain('if (activeReviewScopeKeyRef.current !== requestScopeKey)');
    expect(previewRootSource).toContain('const isCurrentReviewScope = () => activeReviewScopeKeyRef.current === syncKey;');
    expect(previewRootSource).toContain('if (!isCurrentReviewScope()) return;');
    expect(previewRootSource).toContain('apiService.getReviewAxhubConfig(projectId, selectedPrototypeIdentity)');
    expect(previewRootSource).toContain('apiService.updateReviewAxhubConfig({');
    expect(previewRootSource).toContain('apiService.syncReviewAxhubReports({');
    expect(previewRootSource).toContain('if (config.submitEnabled !== true) return;');
    expect(previewRootSource).toContain('const prototypeChanged = previousPrototypeIdentity !== selectedPrototypeIdentity;');
    expect(previewRootSource).toContain("if (reviewPanelOpen) {\n            void loadReviewReports();\n            void loadReviewLanSubmitConfig();\n            void syncReviewAxhubReports();\n        }");
    expect(previewRootSource).not.toContain('if (reviewPanelOpen || prototypeChanged) {');
    expect(previewRootSource).toContain('if (enabled) {');
    expect(previewRootSource).toContain('await syncReviewAxhubReports(config);');
    expect(previewRootSource).toContain('result.created + result.updated');
    expect(previewRootSource).toContain('await loadReviewReports();');
    expect(previewRootSource).toContain("messageApi.success(`已同步 Axhub 评审报告：新增 ${result.created}，更新 ${result.updated}`);");
    expect(previewRootSource).toContain("error?.code === 'AXHUB_AUTH_REQUIRED' || error?.code === 'AXHUB_AUTH_EXPIRED'");
    expect(previewRootSource).toContain("messageApi.error('Axhub 账号已失效，请重新连接');");
    expect(previewRootSource).toContain("error?.code === 'AXHUB_REVIEW_SERVICE_UNAVAILABLE'");
    expect(previewRootSource).toContain("messageApi.error('Axhub 在线评审服务暂不可用');");
    expect(previewRootSource).toContain("error?.code === 'AXHUB_REVIEW_BINDING_INVALID'");
    expect(previewRootSource).toContain("messageApi.error('Axhub 发布绑定已失效，请重新发布');");
    expect(previewRootSource).not.toContain('setInterval(syncReviewAxhubReports');
    expect(previewRootSource).not.toContain('handleGetAxhub');
    expect(source).toContain('reviewAxhubSubmitConfig,');
    expect(source).toContain('handleReviewAxhubSubmitEnabledChange,');
  });

  it('does not request Axhub review config without a current-resource publish binding', () => {
    const source = readPreviewRootSource();
    const syncSource = getSourceSegment(
      source,
      'const syncReviewAxhubReports = useCallback',
      'const handleReviewPanelToggle = useCallback',
    );

    expect(source).toContain("const [latestCloudPublishResourcePath, setLatestCloudPublishResourcePath] = useState('');");
    expect(source).toContain('const latestCloudPublishRequestRef = useRef(0);');
    expect(source).toContain('const requestId = ++latestCloudPublishRequestRef.current;');
    expect(source).toContain('if (requestId !== latestCloudPublishRequestRef.current) return;');
    expect(syncSource).toContain('latestCloudPublishResourcePath !== currentPublishResourcePath');
    expect(syncSource).toContain('!latestCloudPublishItems.axhub?.axhubProjectId');
    expect(syncSource).toContain('bound: false');
    expect(syncSource.indexOf('latestCloudPublishResourcePath !== currentPublishResourcePath'))
      .toBeLessThan(syncSource.indexOf('apiService.getReviewAxhubConfig'));
  });

  it('drops stale async review results after switching prototype scope', () => {
    const source = readPreviewRootSource();
    const scopedSegments = [
      getSourceSegment(source, 'const refreshReviewReportsAfterDirectRun = useCallback', 'const loadReviewLanSubmitConfig = useCallback'),
      getSourceSegment(source, 'const loadReviewLanSubmitConfig = useCallback', 'const syncReviewAxhubReports = useCallback'),
      getSourceSegment(source, 'const openReviewReportDetail = useCallback', 'const handleSelectReviewReport = useCallback'),
      getSourceSegment(source, 'const handleDeleteReviewReport = useCallback', 'const handleStartReview = useCallback'),
      getSourceSegment(source, 'const handleRunReviewDirect = useCallback', 'const handleUploadReviewReport = useCallback'),
      getSourceSegment(source, 'const handleUploadReviewReport = useCallback', 'const handleReviewLanSubmitEnabledChange = useCallback'),
      getSourceSegment(source, 'const handleReviewLanSubmitEnabledChange = useCallback', 'const handleReviewAxhubSubmitEnabledChange = useCallback'),
    ];

    for (const segment of scopedSegments) {
      expect(segment).toContain("const requestScopeKey = `${projectId || ''}:${selectedPrototypeIdentity}`;");
      expect(segment).toContain('activeReviewScopeKeyRef.current');
    }
    expect(source).toContain('setReviewLanSubmitConfig(null);');
    expect(source).toContain('setReviewLoading(false);');
    expect(source).toContain('setReviewDetailLoading(false);');
    expect(source).toContain('setReviewUploadLoading(false);');
  });

  it('runs review AI directly through the API and opens the generated report after refresh', () => {
    const source = readUiReviewSupportSource();
    const previewRootSource = readPreviewRootSource();
    const directRunSource = getSourceSegment(
      previewRootSource,
      'const handleRunReviewDirect = useCallback(async (kind: ReviewKind) => {',
      'const handleUploadReviewReport = useCallback',
    );

    expect(source).toContain('onRunReviewAssistantPromptViaApi');
    expect(source).toContain('handleRunReviewDirect');
    expect(directRunSource).toContain('const prompt = reviewPrompts[kind] || reviewPrompt;');
    expect(directRunSource).toContain('const targetPath = reviewDocumentPaths[kind] || reviewDocumentPath || null;');
    expect(directRunSource).toContain('await onRunReviewAssistantPromptViaApi({');
    expect(directRunSource).toContain('context: buildReviewDirectRunAssistantContext(targetPath),');
    expect(directRunSource).toContain('prompt,');
    expect(directRunSource).toContain('targetPath,');
    expect(directRunSource).not.toContain("messageApi.loading('AI 正在执行评审，请稍候...', 0);");
    expect(directRunSource).toContain("messageApi.success('AI 评审已完成');");
    expect(directRunSource).toContain('const reports = await refreshReviewReportsAfterDirectRun();');
    expect(directRunSource).toContain('const reportToOpen = findReviewReportForDirectRun(reports, targetPath) || reports[0] || null;');
    expect(directRunSource).toContain('await openReviewReportDetail(reportToOpen);');
    expect(directRunSource).not.toContain('onExecutePrompt');
    expect(directRunSource).not.toContain('openAssistantWithContextAndSubmitPrompt');
    expect(source).toContain('refreshReviewReportsAfterDirectRun');
    expect(source).toContain('findReviewReportForDirectRun');
    expect(source).toContain('buildReviewDirectRunAssistantContext');
  });

  it('keeps quick-edit runtime handshake state and timeout lifecycle in the runtime hook', () => {
    const rootSource = readPreviewRootSource();
    const combinedSource = readPreviewActionsSource();

    expect(rootSource).toContain('selectedItem');
    expect(rootSource).toContain('viewMode');
    expect(rootSource).toContain('const quickEditRuntimeStatus = previewRuntimeActions.quickEditRuntimeStatus;');
    expect(rootSource).toContain('const setQuickEditRuntimeStatus = previewRuntimeActions.setQuickEditRuntimeStatus;');
    expect(rootSource).toContain('const clearQuickEditRuntimeTimeout = previewRuntimeActions.clearQuickEditRuntimeTimeout;');
    expect(rootSource).toContain('const beginQuickEditRuntimeHandshake = previewRuntimeActions.beginQuickEditRuntimeHandshake;');
    expect(rootSource).not.toContain('const quickEditRuntimeTimeoutRef = useRef<number | null>(null);');
    expect(rootSource).not.toContain('const quickEditRuntimeHandshakeSeqRef = useRef(0);');
    expect(rootSource).not.toContain("const [quickEditRuntimeStatus, setQuickEditRuntimeStatus] = useState<QuickEditRuntimeStatus>('idle');");
    expect(combinedSource).toContain('QUICK_EDIT_RUNTIME_MISSING_TIMEOUT_MS');
    expect(combinedSource).toContain("postProjectCommunicationRecord(selectedItem, 'sessions'");
    expect(combinedSource).toContain('getClientUrlOrigin(selectedItem.clientUrl)');
  });

  it('does not mount host-owned Space temporary interaction forwarding', () => {
    const source = readPreviewRootSource();

    expect(source).not.toContain('QUICK_EDIT_TEMPORARY_INTERACTION_MESSAGE_TYPE');
    expect(source).not.toContain('QUICK_EDIT_TEMPORARY_INTERACTION_LONG_PRESS_MS');
    expect(source).not.toContain('shouldHandleQuickEditSpaceTemporaryInteractionEvent');
    expect(source).not.toContain('getQuickEditTemporaryInteractionTargets');
    expect(source).not.toContain('postTemporaryInteraction');
    expect(source).not.toContain('AXHUB_WEB_EDITOR_SPACE_PASS_THROUGH_KEY');
  });

  it('restarts the quick-edit runtime handshake when selecting a hash-routed prototype page', () => {
    const source = readPreviewRootSource();
    const pageHandshakeSource = getSourceSegment(
      source,
      'const getRuntimeDocumentUrlKey = useCallback',
      'useEffect(() => {\n        const handleQuickEditRuntimeMessage',
    );

    expect(pageHandshakeSource).toContain('lastQuickEditRuntimeDocumentUrlKeyRef');
    expect(pageHandshakeSource).toContain('url.hash =');
    expect(pageHandshakeSource).toContain('const waitingForPrototypeRuntime = Boolean(');
    expect(pageHandshakeSource).toContain('const runtimeReadyForPrimaryIframe = isQuickEditRuntimeReadyForIframe(');
    expect(pageHandshakeSource).toContain('&& runtimeReadyForPrimaryIframe');
    expect(pageHandshakeSource).toContain('lastQuickEditRuntimeDocumentUrlKeyRef.current === currentDocumentUrlKey');
    expect(pageHandshakeSource).toContain('Hash-routed prototype subpages keep the same iframe document.');
    expect(pageHandshakeSource).toContain('beginQuickEditRuntimeHandshake(primaryIframe);');
    expect(pageHandshakeSource).toContain('lastQuickEditRuntimeDocumentUrlKeyRef.current = currentDocumentUrlKey;');
    expect(pageHandshakeSource).toContain('if (!currentDocumentIsHtml) {');
  });

  it('queues annotation entry until the replacement preview iframe runtime is ready', () => {
    const source = readPreviewRootSource();
    const loadSegment = getSourceSegment(
      source,
      'const handlePreviewIframeLoad = useCallback((iframe?: HTMLIFrameElement | null) => {',
      'useEffect(() => {\n        const handleQuickEditRuntimeMessage',
    );
    const runtimeReadySegment = getSourceSegment(
      source,
      "if (event.data?.type === 'axhub.quickEdit.runtimeReady') {",
      "if (event.data?.type === 'axhub.quickEdit.patch') {",
    );
    const openSegment = getSourceSegment(
      source,
      'const handleOpenWebEditor = useCallback(async () => {',
      'const handleExitWebEditor = useCallback',
    );

    expect(source).toContain('const quickEditRuntimeReadyIframeRef = useRef<HTMLIFrameElement | null>(null);');
    expect(source).toContain('const pendingPrototypeEditorOpenIntentRef = useRef(false);');
    expect(loadSegment).toContain('isQuickEditRuntimeReadyForIframe(');
    expect(loadSegment).toContain('quickEditRuntimeReadyIframeRef.current');
    expect(runtimeReadySegment).toContain('quickEditRuntimeReadyIframeRef.current = previewIframe;');
    expect(runtimeReadySegment).toContain('if (getPreviewIframeGeneration(previewIframe) <= 0) {');
    expect(runtimeReadySegment).toContain('markPreviewIframeLoaded(previewIframe);');
    expect(runtimeReadySegment).toContain('void restorePendingPrototypeEditor(previewIframe, { requireRuntimeReady: true });');
    expect(openSegment).toContain('pendingPrototypeEditorRestoreRef.current = prototypeEditorLaunchOptions;');
    expect(openSegment).toContain('pendingPrototypeEditorOpenIntentRef.current = true;');
    expect(openSegment).toContain('getPreviewIframeGeneration(primaryIframe) > 0');
    expect(openSegment).toContain('beginQuickEditRuntimeHandshake(primaryIframe);');
    expect(source).toContain("quickEditRuntimeStatus === 'pending'");
  });

  it('keeps queued annotation intent available until an iframe editor restore succeeds', () => {
    const source = readPreviewRootSource();
    const restoreSegment = getSourceSegment(
      source,
      'const restorePendingPrototypeEditor = useCallback(async (',
      'const restorePendingStandalonePanel = useCallback',
    );
    const restoreAttemptIndex = restoreSegment.indexOf(
      'const restored = await reenterPrototypeEditorAfterIframeLoad(\n                restoreOptions,\n                expectedPrimaryIframe,\n                isRestoreCurrent,\n            );',
    );
    const consumeIntentIndex = restoreSegment.indexOf(
      'pendingPrototypeEditorRestoreRef.current = null;',
    );

    expect(restoreAttemptIndex).toBeGreaterThan(-1);
    expect(consumeIntentIndex).toBeGreaterThan(restoreAttemptIndex);
    expect(restoreSegment).toContain('for (let attempt = 0; attempt < 3; attempt += 1)');
    expect(restoreSegment).toContain('await new Promise<void>((resolve) => {');
    expect(restoreSegment).toContain('pendingPrototypeEditorRestoreRef.current === restoreOptions');

    const unavailableCleanupSegment = getSourceSegment(
      source,
      'if (!pendingPrototypeEditorOpenIntentRef.current',
      'const setAnnotationAssistantToolbarState = useCallback',
    );
    expect(unavailableCleanupSegment).toContain("quickEditRuntimeStatus !== 'error'");
    expect(unavailableCleanupSegment).not.toContain("quickEditRuntimeStatus !== 'missing'");

    const resetEffectSegment = getSourceSegment(
      source,
      'useEffect(() => {\n        const prototypeIdentityChanged = selectedPrototypeIdentityRef.current !== selectedPrototypeIdentity;',
      'const quickEditAvailable = Boolean(selectedEditablePreviewResource)',
    );
    expect(resetEffectSegment).toContain('const waitingForQueuedPrototypeEditor = Boolean(');
    expect(resetEffectSegment).toContain('if (waitingForQueuedPrototypeEditor) {\n            return;\n        }');
  });

  it('binds async queued restore retries to the runtime-ready iframe generation and latest sequence', () => {
    const source = readPreviewRootSource();
    const reenterSegment = getSourceSegment(
      source,
      'const reenterPrototypeEditorAfterIframeLoad = useCallback(async (',
      'const restorePendingPrototypeEditor = useCallback',
    );
    const restoreSegment = getSourceSegment(
      source,
      'const restorePendingPrototypeEditor = useCallback(async (',
      'const restorePendingStandalonePanel = useCallback',
    );
    const runtimeReadySegment = getSourceSegment(
      source,
      "if (event.data?.type === 'axhub.quickEdit.runtimeReady') {",
      "if (event.data?.type === 'axhub.quickEdit.patch') {",
    );
    const runtimeErrorSegment = getSourceSegment(
      source,
      "if (event.data?.type === 'axhub.quickEdit.error') {",
      '        };\n\n        window.addEventListener',
    );
    const exitSegment = getSourceSegment(
      source,
      'const handleExitWebEditor = useCallback',
      'exitWebEditorRef.current = handleExitWebEditor;',
    );

    expect(source).toContain('const prototypeEditorRestoreSeqRef = useRef(0);');
    expect(reenterSegment).toContain('expectedPrimaryIframe: HTMLIFrameElement');
    expect(reenterSegment).toContain('isRestoreCurrent: () => boolean');
    expect(reenterSegment).toContain('enterPrototypeEditor(expectedPrimaryIframe, { showMissingWarning: false })');
    expect(reenterSegment).not.toContain('const primaryIframe = getPrimaryPreviewIframe();');
    expect((reenterSegment.match(/if \(!isRestoreCurrent\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(4);

    expect(restoreSegment).toContain('expectedPrimaryIframe: HTMLIFrameElement | null');
    expect(restoreSegment).toContain('const expectedGeneration = getPreviewIframeGeneration(expectedPrimaryIframe);');
    expect(restoreSegment).toContain('const restoreSequence = prototypeEditorRestoreSeqRef.current += 1;');
    expect(restoreSegment).toContain('getPrimaryPreviewIframe() === expectedPrimaryIframe');
    expect(restoreSegment).toContain('quickEditRuntimeReadyIframeRef.current === expectedPrimaryIframe');
    expect(restoreSegment).toContain('getPreviewIframeGeneration(expectedPrimaryIframe) === expectedGeneration');
    expect(restoreSegment).toContain('prototypeEditorRestoreSeqRef.current === restoreSequence');
    expect(restoreSegment).toContain('pendingPrototypeEditorRestoreRef.current === restoreOptions');
    expect(restoreSegment).toContain('reenterPrototypeEditorAfterIframeLoad(\n                restoreOptions,\n                expectedPrimaryIframe,\n                isRestoreCurrent,\n            )');
    expect((restoreSegment.match(/if \(!isRestoreCurrent\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(3);

    expect(runtimeReadySegment).toContain('void restorePendingPrototypeEditor(previewIframe, { requireRuntimeReady: true });');
    expect(runtimeErrorSegment).toContain('prototypeEditorRestoreSeqRef.current += 1;');
    expect(exitSegment).toContain('prototypeEditorRestoreSeqRef.current += 1;');
  });

  it('does not probe prototype runtime bridges when the loaded iframe is an HTML document', () => {
    const source = readPreviewRootSource();
    const loadSegment = getSourceSegment(
      source,
      'const handlePreviewIframeLoad = useCallback((iframe?: HTMLIFrameElement | null) => {',
      'useEffect(() => {\n        const handleQuickEditRuntimeMessage',
    );

    expect(loadSegment).toContain('const loadedIframe = iframe ?? primaryIframe;');
    expect(loadSegment).toContain('markPreviewIframeLoaded(loadedIframe);');
    expect(loadSegment).toContain('if (loadedIframe && loadedIframe !== primaryIframe) {');
    expect(loadSegment).toContain('if (!currentDocumentIsHtml) {');
    expect(loadSegment).toContain('void maybeAutoOpenStandaloneDecisionPanel(primaryIframe, decisionPanelAutoOpenSeq);');
    expect(loadSegment).toContain('beginQuickEditRuntimeHandshake(primaryIframe);');
    expect(loadSegment).toContain('clearQuickEditRuntimeTimeout();');
    expect(loadSegment).toContain("setQuickEditRuntimeStatus('idle');");
    expect(source).toContain('const previewIframeTargetUrlsRef = useRef({');
    expect(source).toContain('previewIframeTargetUrlsRef.current.primary');
    expect(source).toContain('getPreviewIframeTargetUrl,');
  });

  it('listens for hash-routed prototype page changes from the active preview iframe', () => {
    const source = readPreviewRootSource();

    expect(source).toContain("onPrototypePageChange");
    expect(source).toContain("event.data?.type === 'AXHUB_PROTOTYPE_PAGE_CHANGE'");
    expect(source).toContain('event.source !== targetIframe.contentWindow');
    expect(source).toContain('onPrototypePageChange?.(nextPageId || null);');
  });

  it('accepts runtime prototype route info from the active preview iframe', () => {
    const source = readPreviewRootSource();
    const routePageNormalizer = getSourceSegment(
      source,
      'function normalizePrototypeRoutePages(',
      'function normalizePrototypeRouteInfo(',
    );

    expect(source).toContain("onPrototypeRouteInfo");
    expect(source).toContain("event.data?.type === 'AXHUB_PROTOTYPE_ROUTE_INFO'");
    expect(source).toContain('event.source !== targetIframe.contentWindow');
    expect(source).toContain('defaultPageId');
    expect(source).toContain('activePageId');
    expect(source).toContain('pages');
    expect(routePageNormalizer).toContain("const group = typeof page?.group === 'string' ? page.group.trim() : '';");
    expect(routePageNormalizer).toContain('...(group ? { group } : {})');
  });

  it('declares iframe URLs before callbacks that depend on them', () => {
    const source = readPreviewRootSource();

    expect(source.indexOf('const primaryIframeUrl = useMemo')).toBeLessThan(
      source.indexOf('const handlePreviewIframeLoad = useCallback'),
    );
  });

  it('declares editor status refresh before callbacks that depend on it', () => {
    const source = readPreviewRootSource();

    const refreshDeclarationIndex = source.indexOf('const refreshEditorStatus = useCallback');
    const reenterDeclarationIndex = source.indexOf('const reenterPrototypeEditorAfterIframeLoad = useCallback');

    expect(refreshDeclarationIndex).toBeGreaterThan(-1);
    expect(reenterDeclarationIndex).toBeGreaterThan(-1);
    expect(refreshDeclarationIndex).toBeLessThan(reenterDeclarationIndex);
  });

  it('refreshes screenshot preview whenever the export modal opens in screenshot mode', () => {
    const source = readPreviewActionsSource();
    const requestScreenshotSegment = getSourceSegment(
      source,
      'const handleRequestScreenshot = useCallback((width?: number, height?: number) => {',
      'const handleDimensionChange = useCallback',
    );
    const screenshotResultSegment = getSourceSegment(
      source,
      "if (event.data.type !== 'axhub.quickEdit.export.captureScreenshotResult') return;",
      "if (event.data?.type === 'AXHUB_PROTOTYPE_PAGE_CHANGE')",
    );

    expect(source).toContain("if (!isExportModalOpen || imageConfig.contentType !== 'screenshot') return;");
    expect(source).toContain("rawScreenshotUrl: ''");
    expect(source).toContain('handleRequestScreenshot();');
    expect(source).toContain('const currentPreviewScreenshotSize = useMemo(');
    expect(requestScreenshotSegment).toContain('resolveExportScreenshotViewportSize({');
    expect(requestScreenshotSegment).toContain('currentPreviewSize: currentPreviewScreenshotSize,');
    expect(requestScreenshotSegment).toContain('if (screenshotViewport.shouldSyncConfig) {');
    expect(requestScreenshotSegment).toContain('width: screenshotViewport.width,');
    expect(requestScreenshotSegment).toContain('height: screenshotViewport.height,');
    expect(requestScreenshotSegment).toContain('payload.targetWidth = screenshotViewport.width;');
    expect(requestScreenshotSegment).toContain('payload.targetHeight = screenshotViewport.height;');
    expect(source).toContain('currentPreviewScreenshotSize.width}x${currentPreviewScreenshotSize.height}');
    expect(source).toContain('const previousExportContentTypeRef = useRef(DEFAULT_EXPORT_IMAGE_CONFIG.contentType);');
    expect(source).toContain('const contentTypeChanged = previousExportContentTypeRef.current !== imageConfig.contentType;');
    expect(source).toContain("if (imageConfig.contentType === 'screenshot' && !userSetDimensionsRef.current) {");
    expect(source).toContain("if (imageConfig.contentType !== 'screenshot') {");
    expect(source).toContain('screenshotModalRefreshKeyRef.current = \'\';');
    expect(source).toContain('const selectedPrototypeContextKey = `${selectedPrototypeProjectKey}:${selectedPrototypeIdentity}`;');
    expect(source).toContain('}, [selectedPrototypeContextKey]);');
    expect(source).not.toContain('width: imageConfig.screenshotWidth');
    expect(source).not.toContain('height: imageConfig.screenshotHeight');
    expect(source).not.toContain('if (imageConfig.width === screenshotDefaultSize.width && imageConfig.height === screenshotDefaultSize.height)');
    expect(screenshotResultSegment).toContain('screenshotWidth: event.data.width,');
    expect(screenshotResultSegment).toContain('screenshotHeight: event.data.height,');
    expect(screenshotResultSegment).not.toContain('\n                        width: event.data.width,');
    expect(screenshotResultSegment).not.toContain('\n                        height: event.data.height,');
  });

  it('does not send obsolete screenshot style reset messages when closing the export modal', () => {
    const source = readPreviewRootSource();
    const resetEffect = getSourceSegment(
      source,
      'useEffect(() => {\n        if (!isExportModalOpen || imageConfig.contentType !== \'screenshot\') return;',
      '    return {',
    );

    expect(resetEffect).not.toContain('exportModalWasOpenRef');
    expect(resetEffect).not.toContain('RESET_SCREENSHOT_STYLES');
    expect(resetEffect).not.toContain('getIframeOrigin(targetIframe)');
  });

  it('routes runtime-component clipboard writes through the shared clipboard helper', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("from '../../utils/clipboard'");
    expect(source).toContain('await copyToClipboard(`// axvg\\n${JSON.stringify(payload)}`);');
  });

  it('copies editable Axure prototypes from the current preview runtime without reading source or artifact files', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('const payload = await requestAxureJson(options);');
    expect(source).toContain('if (exportAvailability.axureRuntimeDisabledReason)');
    expect(source).not.toContain('resolveServerBackedAxurePayload');
    expect(source).not.toContain('apiService.fetchAxureExportCode');
    expect(source).not.toContain('serverBackedPayload');
  });

  it('routes lightweight runtime exports and HTML export through the active theme resource', () => {
    const source = readPreviewRootSource();

    expect(source).toContain("const currentRuntimeExportResource = contentMode === 'theme' ? selectedTheme : selectedItem;");
    expect(source).toContain("const currentRuntimeExportResourceType: 'prototype' | 'theme' = contentMode === 'theme' ? 'theme' : 'prototype';");
    expect(source).toContain('selectedItem: currentRuntimeExportResource,\n                resourceType: currentRuntimeExportResourceType,');
    expect(source).toContain("postProjectCommunicationRecord(currentRuntimeExportResource, 'exports'");
    expect(source).toContain('}, currentRuntimeExportResourceType).catch');
    expect(source).toContain('const targetPath = currentPublishResourcePath;');
    expect(source).toContain('const itemLabel = currentRuntimeExportResource.displayName || currentRuntimeExportResource.name;');
  });

  it('opens quick edit without probing or starting the AI runtime', () => {
    const source = readPreviewRootSource();
    const handleOpenWebEditorSource = getSourceSegment(
      source,
      'const handleOpenWebEditor = useCallback(async () => {',
      'const handleExitWebEditor = useCallback',
    );

    expect(handleOpenWebEditorSource).toContain('enterPrototypeEditor(primaryIframe)');
    expect(handleOpenWebEditorSource).not.toContain('probeAssistantRuntimeSilently');
    expect(handleOpenWebEditorSource).not.toContain('connectAssistantRuntimeSilently');
    expect(handleOpenWebEditorSource).not.toContain('startDeferredAssistantRuntimeProbe');
    expect(handleOpenWebEditorSource).not.toContain('startAssistantRuntimeForWebEditor');
  });

  it('keeps the preview iframe launch URL stable while quick edit is active', () => {
    const source = readPreviewRootSource();
    const buildPaneIframeUrlSource = getSourceSegment(
      source,
      'const buildPaneIframeUrl = useCallback',
      'const primaryIframeUrl = useMemo',
    );
    const exitWebEditorSource = getSourceSegment(
      source,
      'const handleExitWebEditor = useCallback',
      'exitWebEditorRef.current = handleExitWebEditor;',
    );

    expect(source).toContain('type PrototypeEditorRestoreOptions = typeof prototypeEditorLaunchOptions & {');
    expect(source).toContain('selectionModeActive?: boolean;');
    expect(source).toContain('const activePrototypeEditorLaunchOptionsRef = useRef<PrototypeEditorRestoreOptions | null>(null);');
    expect(source).toContain("const iframePrototypeEditorLaunchOptions = editorStatus.mode === 'quickEdit'");
    expect(source).toContain('activePrototypeEditorLaunchOptionsRef.current = prototypeEditorLaunchOptions;');
    expect(buildPaneIframeUrlSource).toContain('iframePrototypeEditorLaunchOptions');
    expect(buildPaneIframeUrlSource).not.toContain('prototypeEditorLaunchOptions, selectedPageId');
    expect(exitWebEditorSource).toContain('activePrototypeEditorLaunchOptionsRef.current = null;');
  });

  it('does not keep the removed quick-edit new-page launch flow', () => {
    const source = readPreviewActionsSource();

    expect(source).not.toContain('const quickEditLaunchUrl =');
    expect(source).not.toContain('const nextUrl = new URL(quickEditLaunchUrl, window.location.origin);');
    expect(source).not.toContain("nextUrl.searchParams.set('axhubQuickEditContext', '1');");
    expect(source).not.toContain('handleOpenQuickEditInNewPage');
    expect(source).not.toContain("buildEditorUrl(selectedItem, viewMode, 'webEditorV2'");
  });

  it('uses clientUrl from selected prototype metadata instead of make-server preview endpoints', () => {
    const source = readPreviewActionsSource();
    const buildPaneIframeUrlSource = getSourceSegment(
      readPreviewRootSource(),
      'const buildPaneIframeUrl = useCallback',
      'const primaryIframeUrl = useMemo',
    );

    expect(source).toContain('buildProjectPrototypeIframeUrl');
    expect(source).toContain('selectedItem.clientUrl');
    expect(source).toContain('selectedItem.previewDisabled');
    expect(source).not.toContain('buildPrototypePreviewEndpoint');
    expect(buildPaneIframeUrlSource).not.toContain('`/prototypes/${encodeURIComponent');
    expect(source).not.toContain("const label = activeTab === 'components' ? '组件' : '原型'");
  });

  it('strips legacy agent and editor WebSocket launch options from client prototype iframe URLs', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://admin.local:5173',
      },
    });

    const url = new URL(buildProjectPrototypeIframeUrl({
      name: 'home',
      clientUrl: 'http://client.local:4173/prototypes/home?agentIntegrationChannel=stale',
    }, {
      agentBridge: {
        apiBaseUrl: 'http://localhost:32124/api',
        integrationChannel: '/workspace/demo/project',
        projectPath: '/workspace/demo/project',
        targetClientId: 'frontend-1234',
      },
      integrationWs: {
        enabled: true,
        apiBaseUrl: 'http://localhost:32124/api',
        channel: '/workspace/demo/project',
        clientId: 'make-editor-1234',
      },
    } as any));

    expect(url.searchParams.get('agentApiBaseUrl')).toBeNull();
    expect(url.searchParams.get('agentIntegrationChannel')).toBeNull();
    expect(url.searchParams.get('agentTargetClientId')).toBeNull();
    expect(url.searchParams.get('cwd')).toBeNull();
    expect(url.searchParams.get('editorIntegrationWs')).toBeNull();
    expect(url.searchParams.get('editorApiBaseUrl')).toBeNull();
    expect(url.searchParams.get('editorIntegrationChannel')).toBeNull();
    expect(url.searchParams.get('editorClientId')).toBeNull();
  });

  it('resolves relative prototype client URLs against the make client runtime origin', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://admin.local:53817',
      },
      __RUNTIME_ORIGIN__: 'http://localhost:51720',
    });

    const url = new URL(buildProjectPrototypeIframeUrl({
      name: 'fitness-home',
      clientUrl: '/prototypes/fitness-home',
    }));

    expect(url.origin).toBe('http://localhost:51720');
    expect(url.pathname).toBe('/prototypes/fitness-home');
  });

  it('builds and clears prototype page hash URLs without disturbing launch query params', () => {
    const url = new URL(buildPrototypePageHashUrl(
      'http://client.local/prototypes/orders?agentToolbar=host#page=old',
      'orders-list',
    ));

    expect(url.searchParams.get('agentToolbar')).toBe('host');
    expect(url.hash).toBe('#page=orders-list');
    expect(buildPrototypePageHashUrl(url.toString(), null)).toBe('http://client.local/prototypes/orders?agentToolbar=host');
  });

  it('uses the selected prototype page id when building demo iframe URLs', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://admin.local:5173',
      },
    });

    const url = new URL(buildProjectPrototypeIframeUrl({
      name: 'orders',
      clientUrl: 'http://client.local:4173/prototypes/orders#page=old',
    }, undefined, 'orders-list'));

    expect(url.hash).toBe('#page=orders-list');
  });

  it('exposes a top-toolbar HTML export action using the active publish resource path', () => {
    const source = readPreviewRootSource();

    expect(source).toContain("import { downloadExportHtmlArchive } from '../../domains/export/export.api';");
    expect(source).toContain('const handleExportHtml = useCallback(async (options: { includeSource?: boolean } = {}) => {');
    expect(source).toContain('if (exportAvailability.htmlExportDisabledReason) {');
    expect(source).toContain('const targetPath = currentPublishResourcePath;');
    expect(source).toContain('await downloadExportHtmlArchive(targetPath, requireProjectScope(projectId), { includeSource: options.includeSource === true });');
    expect(source).toContain('HTML 导出完成，已开始下载');
    expect(source).toContain('handleExportHtml,');
  });

  it('does not build prototype Canvas iframe URLs after canvas moved to resources', () => {
    const source = readPreviewActionsSource();
    const buildPaneIframeUrlSource = getSourceSegment(
      readPreviewRootSource(),
      'const buildPaneIframeUrl = useCallback',
      'const primaryIframeUrl = useMemo',
    );

    expect(source).not.toContain('buildPrototypeCanvasIframeUrl');
    expect(buildPaneIframeUrlSource).toContain("viewMode === 'canvas'");
    expect(source).not.toContain('/canvas/prototypes');
    expect(source).not.toContain('canvas.excalidraw`');
    expect(buildPaneIframeUrlSource).toContain("viewMode !== 'demo'");
    expect(buildPaneIframeUrlSource).not.toContain("sidebarTab === 'canvas'");
  });

  it('tracks desired editor mode for iframe refresh resync', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("const quickEditRuntimeActiveRef = useRef(false);");
    expect(source).toContain('enterPrototypeEditor');
    expect(source).toContain('exitQuickEditRuntime');
    expect(source).toContain("url.searchParams.set('axhubQuickEditContext', '1');");
    expect(source).not.toContain('desiredEditorModeRef');
    expect(source).toContain('const enableEditors = async (resolvedEditors: PrototypeEditorApi) => {');
    expect(source).toContain("resolvedEditors.enable('webEditorV2', buildPrototypeEditorEnableOptions(context))");
    expect(source).not.toContain('if (!isSinglePaneHostToolbarPreview) {\n                setHostToolbarState(null);\n            }');
  });

  it('keeps prototype editor launch options free of assistant runtime bridge config', () => {
    const source = readPreviewRootSource();

    expect(source).toContain('const prototypeEditorLaunchOptions = useMemo(() => ({');
    expect(source).toContain('hostToolbar: true,');
    expect(source).not.toContain('assistantWebEditorClientId');
    expect(source).not.toContain('agentBridge:');
    expect(source).not.toContain('integrationWs:');
    expect(source).not.toContain('editorClientId');
  });

  it('restores prototype quick edit and selection mode across iframe URL changes', () => {
    const source = readPreviewRootSource();
    const resetEffectSource = getSourceSegment(
      source,
      'useEffect(() => {\n        const prototypeIdentityChanged = selectedPrototypeIdentityRef.current !== selectedPrototypeIdentity;',
      'const quickEditAvailable = Boolean(selectedEditablePreviewResource)',
    );
    const reenterSource = getSourceSegment(
      source,
      'const reenterPrototypeEditorAfterIframeLoad = useCallback(async (',
      'const maybeAutoOpenStandaloneDecisionPanel = useCallback',
    );
    const refreshSource = getSourceSegment(
      source,
      'const handleRefreshElement = useCallback(() => {',
      'const notifyPreviewMessage = useCallback',
    );

    expect(resetEffectSource).toContain('pendingPrototypeEditorRestoreRef.current = {');
    expect(resetEffectSource).toContain('selectionModeActive: hostToolbarStateRef.current?.selectionModeActive ?? true');
    expect(resetEffectSource).toContain('setEditorStatus({ mode: \'quickEdit\' });');
    expect(resetEffectSource).toMatch(/if \(shouldRestoreQuickEdit\) \{[\s\S]*return;/);
    expect(reenterSource).toContain("type: 'toggle-selection-mode'");
    expect(reenterSource).toContain('active: restoreOptions.selectionModeActive');
    expect(reenterSource).toContain('selectionModeActive: restoreOptions.selectionModeActive');
    expect(refreshSource).toContain('selectionModeActive: hostToolbarStateRef.current?.selectionModeActive ?? true');
  });

  it('does not let cross-origin preview frame API reads block editor exit cleanup', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('function readPreviewFrameEditorApi');
    expect(source).toContain('catch (error) {');
    expect(source).toContain("error instanceof DOMException && error.name === 'SecurityError'");
    expect(source).toContain('const editors = readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, \'DevTemplateBootstrap\');');
    expect(source).toContain("return readPreviewFrameEditorApi<DocumentEditorApi>(iframe, 'SpecTemplateBootstrap');");
    expect(source).toContain("return editors ?? readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, 'HtmlTemplateBootstrap');");
    expect(source).toMatch(/await Promise\.all\(getPreviewIframes\(\)\.map\(async \(iframe\) => \{[\s\S]*await postPrototypeEditorDisable\(iframe\);[\s\S]*const editors = getPrototypeEditorApi\(iframe\);/s);
    expect(source).toMatch(/documentEditorActiveRef\.current = false;[\s\S]*quickEditRuntimeActiveRef\.current = false;[\s\S]*setEditorStatus\(\{ mode: 'none' \}\);[\s\S]*setHostToolbarState\(null\);/s);
  });

  it('drives prototype quick edit through the embedded WebEditor bridge and keeps restored Markdown quick editing separate', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_ENABLE_PANEL_ONLY'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_DISABLE_PANEL_ONLY'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_DISABLE'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION'");
    expect(source).toContain("type: 'AXHUB_PROTOTYPE_EDITOR_SAVE_ACTION'");
    expect(source).toContain("'AXHUB_PROTOTYPE_EDITOR_STATE'");
    expect(source).toContain('postPrototypeEditorEnable');
    expect(source).toContain('postPrototypeEditorDisable');
    expect(source).toContain('postPrototypeEditorHostToolbarAction');
    expect(source).toContain('postPrototypeEditorSaveAction');
    expect(source).toContain('runQuickEditSaveAction');
    expect(source).toContain("saveWebEditorTextChanges");
    expect(source).toContain("saveWebEditorStyleChanges");
    expect(source).toContain("clearWebEditorForcedStyles");
    expect(source).toContain("type: 'axhub.quickEdit.exit'");
    expect(source).toContain("type: 'axhub.quickEdit.save'");
    expect(source).toContain("type: 'axhub.quickEdit.patch'");
    expect(source).toContain("type: 'axhub.quickEdit.error'");
    expect(source).toContain('getPrototypeEditorApi');
    expect(source).toContain('const enableEditors = async (resolvedEditors: PrototypeEditorApi) => {');
    expect(source).toContain("resolvedEditors.enable('webEditorV2', buildPrototypeEditorEnableOptions(context))");
    expect(source).toContain('editors = await ensureHtmlDocumentPreviewEditorApi(iframe);');
    expect(source).toContain("messageApi.warning('当前客户端页面尚未接入真正的快速编辑器，请确认预览页已加载 DevTemplateBootstrap 或 HtmlTemplateBootstrap')");
    expect(source).toContain('projectId: selectedEditablePreviewResource?.projectId');
    expect(source).toContain('resourceId: selectedEditablePreviewResource?.resourceId || selectedEditablePreviewResource?.name');
    expect(source).toContain('resourceType,');
    expect(source).toContain('SPEC_EDIT_ENABLE');
    expect(source).toContain('SPEC_EDIT_SET_MODE');
    expect(source).toContain('SPEC_EDIT_SAVE');
    expect(source).toContain('SPEC_EDIT_EXIT');
    expect(source).toContain('SPEC_EDIT_STATUS_REQUEST');
    expect(source).toContain('SPEC_EDIT_PROMPT_REQUEST');
    expect(source).toContain('docEditState');
    expect(source).toContain('handleEnableDocEdit');
    expect(source).toContain('isDocumentCommentableResource(currentMarkdownItem)');
    expect(source).toContain("messageApi.warning(`仅支持 Markdown 或 HTML ${currentMarkdownLabel}批注`);");
    expect(source).toContain('isHtmlCommentableResource(currentMarkdownItem)');
    expect(source).toContain('return enterHtmlDocumentEditor(options);');
    expect(source).not.toContain("currentMarkdownItem.name || currentMarkdownItem.filePath || currentMarkdownItem.absoluteFilePath");
    expect(source).toContain('handleSwitchDocQuickEditMode');
    expect(source).not.toContain('handleEnableSpecEdit');
    expect(source).not.toContain('handleSwitchSpecQuickEditMode');
    expect(source).toContain('handleCopyMarkdownPrompt');
    expect(source).toContain('resolveSpecQuickEditSwitchDecision');
    expect(source).not.toContain("url.searchParams.set('agentToolbar', 'host');");
    expect(source).not.toContain("url.searchParams.set('editor', 'webEditorV2');");
    expect(source).not.toContain("editorStatus.mode === 'webEditorV2'");
    expect(source).not.toContain("'specComment'");
    expect(source).not.toContain("editors.enable?.('comment'");
    expect(source).not.toContain("type: 'axhub.quickEdit.enter'");
    expect(source).not.toContain('TEXT_EDIT_');
    expect(source).not.toContain('const isSinglePaneHostToolbarPreview =');
    expect(source).toContain('hostToolbarState');
    expect(source).toContain('runHostToolbarAction');
  });

  it('acknowledges parent-owned editor dialogs before waiting for the user result', () => {
    const source = readPreviewActionsSource();
    const dialogBridgeSource = getSourceSegment(
      source,
      "if (event.data?.type === 'WEB_EDITOR_DIALOG_REQUEST')",
      "        };\n        window.addEventListener('message', handleMessage);",
    );

    expect(dialogBridgeSource).toContain("type: 'WEB_EDITOR_DIALOG_ACK'");
    expect(dialogBridgeSource.indexOf("type: 'WEB_EDITOR_DIALOG_ACK'")).toBeLessThan(
      dialogBridgeSource.indexOf('await appDialog.confirm({'),
    );
  });

  it('drives theme quick edit through the same embedded editor bridge without enabling prototype-only devices', () => {
    const rootSource = readPreviewRootSource();
    const combinedSource = readPreviewActionsSource();
    const buildPaneIframeUrlSource = getSourceSegment(
      rootSource,
      'const buildPaneIframeUrl = useCallback',
      'const primaryIframeUrl = useMemo',
    );
    const quickEditAvailableSource = getSourceSegment(
      rootSource,
      'const quickEditAvailable = Boolean',
      'const exportAvailability = useMemo',
    );

    expect(rootSource).toContain('selectedTheme');
    expect(rootSource).toContain('const selectedEditablePreviewResource =');
    expect(rootSource).toContain("contentMode === 'theme'");
    expect(rootSource).toContain('buildMainPreviewIframeUrl');
    expect(buildPaneIframeUrlSource).toContain("if (contentMode === 'theme')");
    expect(buildPaneIframeUrlSource).toContain(
      'return buildMainPreviewIframeUrl(selectedTheme, iframePrototypeEditorLaunchOptions);',
    );
    expect(quickEditAvailableSource).toContain('selectedEditablePreviewResource');
    expect(quickEditAvailableSource).toContain("resourceType === 'theme'");
    expect(combinedSource).toContain("const resourceType: 'prototype' | 'theme' = contentMode === 'theme' ? 'theme' : 'prototype';");
    expect(combinedSource).toContain('resourceId: selectedEditablePreviewResource?.resourceId || selectedEditablePreviewResource?.name');
    expect(combinedSource).toContain('const context = buildPrototypeEditorContext(iframe);');
    expect(combinedSource).toContain('context: buildPrototypeEditorScopedContext(context)');
    expect(combinedSource).toContain('options: buildPrototypeEditorEnableOptions(context)');
    expect(rootSource).not.toContain('selectedDeviceId = selectedTheme');
  });

  it('tracks Markdown quick edit status and prompt responses from the spec-template iframe', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('createDefaultMarkdownQuickEditState');
    expect(source).not.toContain('type PendingPromptRequest');
    expect(source).not.toContain('specPromptRequestMapRef');
    expect(source).not.toContain('specPromptCacheRef');
    expect(source).toContain("event.data?.type === 'SPEC_EDIT_STATUS'");
    expect(source).toContain("event.data?.type !== 'SPEC_EDIT_PROMPT_RESPONSE'");
    expect(source).toContain('setDocEditState');
    expect(source).not.toContain('setSpecEditState');
    expect(source).not.toContain('setSpecQuickEditMode');
    expect(source).toContain('requestMarkdownEditPrompt');
    expect(source).toContain('saveBeforePrompt');
    expect(source).toContain('navigator.clipboard.writeText(result.prompt)');
  });

  it('shows progress and failure feedback for editor-owned AI connect actions', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('resolveHostToolbarStateForDisplay');
    expect(source).toContain('isHostToolbarWakePendingState(nextState)');
    expect(source).toContain('return previousState;');
    expect(source).toContain("if (nextState.toolbarMode === 'host' && !nextState.visible) {");
    expect(source).toContain('...createDefaultHostToolbarState(),');
    expect(source).toContain('visible: true,');
    expect(source).toContain('setHostToolbarState((previousState) => resolveHostToolbarStateForDisplay(previousState, nextState, isDarkMode));');
    expect(source).toContain('previousState?: CommentaryHostToolbarState | null');
    expect(source).toContain('connectAnnotationAcpRuntime');
    expect(source).toContain('runAnnotationAcpChatPrompt');
    expect(source).toContain('waitForHostToolbarActionState');
    expect(source).toContain("nextAction.type === 'wake-agent'");
    expect(source).toContain('!isHostToolbarWakePendingState(state)');
    expect(source).not.toContain('const runtime = await startAssistantRuntimeForWebEditor?.();');
    expect(source).not.toContain("runtime.health?.status !== 'ready'");
    expect(source).toContain("nextState.robotState === 'awake' || nextState.robotState === 'working'");
    expect(source).toContain('finish(previousState ?? null);');
    expect(source).toContain('const previousState = editors?.getHostToolbarState?.() ?? hostToolbarStateRef.current;');
    expect(source).toContain("messageApi.success('本地 AI 已连接');");
    expect(source).toContain('hideLoading?.();');
    expect(source).not.toContain("nextAction.type === 'copy-global-panel-prompt'");
    expect(source).toContain("nextAction.type === 'toggle-dark-mode'");
    expect(source).not.toContain("nextAction.type === 'toggle-page-zoom'");
    expect(source).toContain("nextAction.type === 'full-exit'");
  });

  it('owns prototype annotation enabling in the Make host toolbar instead of delegating it to the iframe editor', () => {
    const source = readPreviewActionsSource();
    const runHostToolbarActionSource = getSourceSegment(
      source,
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );
    const enableAnnotationSource = getSourceSegment(
      source,
      'const enablePrototypeAnnotationFromHost = useCallback(async () => {',
      'const runQuickEditHostToolbarAction = useCallback',
    );

    expect(runHostToolbarActionSource).toContain("nextAction.type === 'enable-annotation'");
    expect(runHostToolbarActionSource).toContain('return enablePrototypeAnnotationFromHost();');
    expect(runHostToolbarActionSource).not.toContain("nextAction.type === 'enable-annotation' && !handled");
    expect(runHostToolbarActionSource).not.toContain("messageApi.error('需求标注没有开启成功，请刷新页面后再试')");
    expect(enableAnnotationSource).toContain('const projectScope = requireProjectScope(projectId);');
    expect(enableAnnotationSource).toContain("fetch(withProjectScope('/api/prototype-annotation/enable', projectScope)");
    expect(enableAnnotationSource).toContain('const targetPath = resolvePrototypeAnnotationTargetPath(selectedItem);');
    expect(enableAnnotationSource).toContain('targetPath,');
    expect(enableAnnotationSource).toContain('projectId: projectScope.projectId,');
    expect(enableAnnotationSource).not.toContain('window.location.search');
    expect(enableAnnotationSource).toContain('annotationEnabled: true');
    expect(enableAnnotationSource).toContain("annotationEnableTitle: '需求标注已开启'");
    expect(enableAnnotationSource).toContain("messageApi.success('需求标注已开启，可直接在当前页面查看和编辑')");
    expect(enableAnnotationSource).toContain("messageApi.error('需求标注没有开启成功，请刷新页面后再试')");
    expect(enableAnnotationSource).not.toContain("messageApi.success('需求标注已准备，请刷新页面后查看')");
    expect(enableAnnotationSource).not.toContain("messageApi.success('需求标注已接入，正在刷新预览')");
    expect(enableAnnotationSource).not.toContain('setElementIframeKey((previous) => previous + 1);');
    expect(enableAnnotationSource).not.toContain('contentWindow?.location.reload();');
    expect(enableAnnotationSource).not.toContain('iframe.src = currentSrc;');
  });

  it('uses the latest host toolbar state ref when connecting local AI from fallback quick edit mode', () => {
    const source = readPreviewRootSource();
    const fallbackActionSource = getSourceSegment(
      source,
      'const runQuickEditHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
    );

    expect(fallbackActionSource).toContain('getHostToolbarState: () => hostToolbarStateRef.current ?? createDefaultHostToolbarState()');
    expect(fallbackActionSource).toContain('listener(hostToolbarStateRef.current ?? createDefaultHostToolbarState());');
    expect(fallbackActionSource).not.toContain('getHostToolbarState: () => hostToolbarState ?? createDefaultHostToolbarState()');
  });

  it('runs host toolbar send actions through the API path without a wake precheck', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('isHostToolbarAgentAwake');
    expect(source).not.toContain('isHostToolbarGenieAwake');
    expect(source).not.toContain("requestedAction.type === 'send-to-agent' && !isHostToolbarAgentAwake(hostToolbarStateRef.current)");
    expect(source).not.toContain("const wakeHandled = await runResolvedHostToolbarAction({ type: 'wake-agent' });");
    expect(source).toContain('return runResolvedHostToolbarAction(requestedAction);');
  });

  it('does not auto-start ACP when entering annotation editing modes', () => {
    const source = readPreviewRootSource();
    const enterDocumentEditorSource = getSourceSegment(
      source,
      'const enterDocumentEditor = useCallback(async (mode: SpecQuickEditMode = \'comment\', options?: { preserveSidebar?: boolean }) => {',
      'const handleEnableDocEdit = useCallback',
    );
    const handleOpenWebEditorSource = getSourceSegment(
      source,
      'const handleOpenWebEditor = useCallback(async () => {',
      'const handleExitWebEditor = useCallback',
    );
    const runHostToolbarActionSource = getSourceSegment(
      source,
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );

    expect(enterDocumentEditorSource).not.toContain('startAnnotationAcpRuntimeConnection();');
    expect(handleOpenWebEditorSource).not.toContain('startAnnotationAcpRuntimeConnection();');
    expect(runHostToolbarActionSource).not.toContain("const wakeHandled = await runResolvedHostToolbarAction({ type: 'wake-agent' });");
    expect(runHostToolbarActionSource).toContain('return runResolvedHostToolbarAction(requestedAction);');
  });

  it('maps annotation host toolbar AI actions to abortable API direct ACP runs without opening the assistant panel', () => {
    const source = readPreviewActionsSource();
    const directRunSource = getSourceSegment(
      source,
      'const runAnnotationAcpChatPrompt = useCallback(async (input: string | null | undefined | AnnotationPromptRunRequest) => {',
      'const abortAnnotationDirectRun = useCallback',
    );
    const runHostToolbarActionSource = getSourceSegment(
      source,
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );
    const fallbackActionSource = getSourceSegment(
      source,
      'const runQuickEditHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
    );

    expect(source).toContain('openAnnotationAssistantWithContext');
    expect(source).toContain('onOpenAnnotationAssistant?.(assistantContextV1)');
    expect(source).toContain('connectAnnotationAcpRuntime');
    expect(runHostToolbarActionSource).toContain("if (nextAction.type === 'wake-agent') {");
    expect(runHostToolbarActionSource).toContain('return connectAnnotationAcpRuntime({ showFeedback: true });');
    expect(runHostToolbarActionSource).not.toContain('return openAnnotationAssistantWithContext();');
    expect(source).toContain("robotState: 'awake' as const");
    expect(source).toContain("messageApi.success('本地 AI 已连接');");

    expect(source).toContain('runAnnotationAcpChatPrompt');
    expect(source).toContain('onRunAnnotationAssistantPromptViaApi');
    expect(source).toContain('resolveAnnotationActionEditingTargets');
    expect(source).toContain('editors?.getEditedSnapshot?.()?.modifiedElements ?? []');
    expect(source).toContain("locator: action.locator ?? null");
    expect(source).toContain("label: String(action.label || '').trim() || elementKey");
    expect(source).toContain('annotationDirectRunRegistryRef.current.startRun({');
    expect(source).toContain('context: assistantContextV1,');
    expect(source).toContain('editingTargets: request.editingTargets,');
    expect(source).toContain('submit: (submitRequest) => onRunAnnotationAssistantPromptViaApi({');
    expect(source).toContain('context: submitRequest.context,');
    expect(source).toContain('signal: submitRequest.signal,');
    expect(source).toContain('onPrepared: submitRequest.onPrepared,');
    expect(source).toContain('onAccepted: submitRequest.onAccepted,');
    expect(source).toContain("case 'started':");
    expect(source).toContain("case 'prepared':");
    expect(source).toContain("case 'accepted':");
    expect(source).toContain("case 'completed':");
    expect(source).toContain("case 'aborted':");
    expect(source).toContain("case 'error':");
    expect(directRunSource).toContain('await persistAcceptedAnnotationEditingState(event, applyAnnotationEditingTaskState);');
    expect(directRunSource).toContain("await applyAnnotationEditingTaskState(event.editingTargets, 'completed', event.taskRef);");
    expect(directRunSource).toContain("await applyAnnotationEditingTaskState(event.editingTargets, 'idle', event.taskRef);");
    expect(directRunSource).toContain("await applyAnnotationEditingTaskState(event.editingTargets, 'error', terminalTaskRef);");
    expect(source).toContain('editors.setNodeEditingState(target.elementKey, nextState, taskRef, target.targetRef ?? null)');
    expect(source).toContain('target.targetRef ?? null');
    expect(source).toContain('getAnnotationActionPromptText(action, editors)');
    expect(source).toContain('editors?.getElementPromptText?.(elementKey)');
    expect(source).toContain("if (action?.type !== 'send-to-agent')");
    expect(source).not.toContain('const activeAnnotationDirectRunMapRef = useRef');
    expect(source).not.toContain('const annotationDirectRunSeqRef = useRef(0);');
    expect(source).not.toContain('annotationDirectRunSeqRef.current += 1');
    expect(source).not.toContain('activeAnnotationDirectRunMapRef.current.set(runKey, {');
    expect(source).toContain('signal: submitRequest.signal,');
    expect(source).toContain('interruptDisabled: false');
    expect(source).toContain('abortAnnotationDirectRun');
    expect(source).toContain('activeRunCount >= maxAnnotationDirectRunCount');
    expect(source).toContain("messageApi.info(<span>已有 {startResult.activeRunCount} 个 AI 执行正在进行，请稍后再试，或");
    expect(source).toContain("onClick={(event) => { event.preventDefault(); openSettingsDialog?.('ai'); }}");
    expect(source).toContain('去设置');
    expect(source).not.toContain('activeAnnotationDirectRunRef.current?.controller.abort();');
    expect(source).not.toContain('await onSubmitAnnotationAssistantPrompt(assistantContextV1, prompt)');
    expect(source).not.toContain('openAssistantWithContextAndSubmitPrompt');
    expect(source).not.toContain('runAiText({');
    expect(source).not.toContain("scene: 'annotation-quick-edit'");
    expect(source).toContain("if (nextAction.type === 'send-to-agent') {");
    expect(fallbackActionSource).toContain("nextAction.type === 'copy-prompt'");
    expect(fallbackActionSource).not.toContain("nextAction.type === 'send-to-agent'");
    expect(fallbackActionSource).not.toContain("nextAction.type === 'interrupt-agent'");

    expect(source).toContain("if (nextAction.type === 'interrupt-agent') {");
    expect(source).toContain('return abortAnnotationDirectRun();');
    expect(source).not.toContain("messageApi.warning('当前 ACP 执行暂不支持中断');");
    expect(source).not.toContain('warnAnnotationAcpInterruptUnsupported');
    expect(source).not.toContain('acp.chat.submit');
    expect(source).not.toContain('acp.chat.interrupt');
    expect(source).not.toContain('/api/prompt/execute');
  });

  it('handles direct ACP interruption from both host toolbar fallbacks', () => {
    const source = readPreviewRootSource();
    const fallbackActionSource = getSourceSegment(
      source,
      'const runQuickEditHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
    );
    const runHostToolbarActionSource = getSourceSegment(
      source,
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );
    const abortSource = getSourceSegment(
      source,
      'const abortAnnotationDirectRun = useCallback',
      'const copyHostToolbarPromptText = useCallback',
    );

    expect(fallbackActionSource).toContain("if (action.type === 'interrupt-agent') {");
    expect(fallbackActionSource).toContain('return abortAnnotationDirectRun();');
    expect(runHostToolbarActionSource).toContain("if (nextAction.type === 'interrupt-agent') {");
    expect(runHostToolbarActionSource).toContain('return abortAnnotationDirectRun();');
    expect(abortSource).toContain('await annotationDirectRunRegistryRef.current.abortAll();');
    expect(abortSource).toContain('interruptLoading: true');
    expect(abortSource).toContain("messageApi.info('已终止 AI 执行');");
  });

  it('preserves direct annotation run toolbar controls across editor state sync', () => {
    const source = readPreviewRootSource();
    const stateTrackingSource = getSourceSegment(
      source,
      'const resolveAnnotationDirectRunToolbarState = useCallback((state: CommentaryHostToolbarState | null) => {',
      'const previewDeviceActions = usePreviewDeviceActions();',
    );
    const directRunSource = getSourceSegment(
      source,
      'const runAnnotationAcpChatPrompt = useCallback(async (input: string | null | undefined | AnnotationPromptRunRequest) => {',
      'const abortAnnotationDirectRun = useCallback',
    );
    const refreshSource = getSourceSegment(
      source,
      'const refreshAnnotationDirectRunToolbarState = useCallback(() => {',
      'const previewDeviceActions = usePreviewDeviceActions();',
    );

    expect(source).toContain('resolveActiveAnnotationDirectRunToolbarState');
    expect(stateTrackingSource).toContain('annotationDirectRunRegistryRef.current.getActiveRunCount()');
    expect(stateTrackingSource).toContain('maxRunCount: maxAnnotationDirectRunCount');
    expect(refreshSource).toContain('activeRunCount <= 0');
    expect(refreshSource).toContain("robotState: 'awake' as const");
    expect(refreshSource).toContain('sendDisabled: false');
    expect(refreshSource).toContain('interruptDisabled: true');
    expect(stateTrackingSource).toContain('const resolvedState = resolveAnnotationDirectRunToolbarState(state);');
    expect(stateTrackingSource).toContain('const resolvedState = resolveAnnotationDirectRunToolbarState(nextResolvedState);');
    expect(directRunSource).toContain("case 'settled':");
    expect(directRunSource).toContain('refreshAnnotationDirectRunToolbarState();');
  });

  it('uses a direct annotation run registry instead of inline active run bookkeeping', () => {
    const source = readPreviewRootSource();
    const directRunSource = getSourceSegment(
      source,
      'const runAnnotationAcpChatPrompt = useCallback(async (input: string | null | undefined | AnnotationPromptRunRequest) => {',
      'const abortAnnotationDirectRun = useCallback',
    );
    const abortSource = getSourceSegment(
      source,
      'const abortAnnotationDirectRun = useCallback',
      'const copyHostToolbarPromptText = useCallback',
    );

    expect(source).toContain('createAnnotationDirectRunRegistry');
    expect(source).toContain('annotationDirectRunRegistryRef');
    expect(source).not.toContain('activeAnnotationDirectRunMapRef');
    expect(source).not.toContain('annotationDirectRunSeqRef');
    expect(directRunSource).not.toContain('new AbortController()');
    expect(directRunSource).not.toContain('activeAnnotationDirectRunMapRef.current.set');
    expect(directRunSource).toContain('annotationDirectRunRegistryRef.current.startRun({');
    expect(directRunSource).toContain("case 'started':");
    expect(directRunSource).toContain("case 'prepared':");
    expect(directRunSource).toContain("case 'accepted':");
    expect(directRunSource).toContain("case 'completed':");
    expect(directRunSource).toContain("case 'aborted':");
    expect(directRunSource).toContain("case 'error':");
    expect(abortSource).toContain('await annotationDirectRunRegistryRef.current.abortAll();');
  });

  it('aborts active direct annotation runs when globally exiting the editor', () => {
    const source = readPreviewRootSource();
    const fallbackActionSource = getSourceSegment(
      source,
      'const runQuickEditHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
    );

    expect(source).not.toContain('onInvalidateAnnotationAssistantConversation');
    expect(source).toContain('await annotationDirectRunRegistryRef.current.abortAll();');
    expect(fallbackActionSource).toContain("nextAction.type === 'full-exit'");
    expect(fallbackActionSource).toContain("await abortAnnotationDirectRun({ showFeedback: false });");
  });

  it('keeps host-delegated card sends pane-scoped before split prompt collection', () => {
    const source = readPreviewRootSource();
    const webEditorTypesSource = readFileSync(
      resolve(__dirname, '../../../../vendor/axhub-commentary/src/web-editor-types.ts'),
      'utf8',
    );
    const messageListenerSource = getSourceSegment(
      source,
      "data.type !== 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION_REQUEST'",
      "window.addEventListener('message', handleMessage);",
    );
    const runHostToolbarActionSource = getSourceSegment(
      source,
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );

    expect(messageListenerSource).toContain('resolvePreviewPaneForIframe(targetIframe)');
    expect(messageListenerSource).toContain('const sourcePane = resolvePreviewPaneForIframe(targetIframe);');
    expect(messageListenerSource).toContain('const action = sourcePane');
    expect(messageListenerSource).toContain('? { ...data.action, pane: sourcePane } as CommentaryHostToolbarAction');
    expect(messageListenerSource).toContain(': data.action;');
    expect(runHostToolbarActionSource).toContain("if (nextAction.type === 'send-to-agent' && nextAction.elementKey && nextAction.pane) {");
    expect(webEditorTypesSource).toContain('promptText?: string;');
    expect(source).toContain("if (action?.type === 'send-to-agent' && typeof action.promptText === 'string')");
    expect(runHostToolbarActionSource).toContain('const panePrompt = await collectPrototypePrompt(nextAction.pane, nextAction);');
    expect(runHostToolbarActionSource).toContain('return runAnnotationAcpChatPrompt(panePrompt);');
  });

  it('does not show a persistent sending toast for direct annotation API runs', () => {
    const source = readPreviewRootSource();
    const directRunSource = getSourceSegment(
      source,
      'const runAnnotationAcpChatPrompt = useCallback(async (input: string | null | undefined | AnnotationPromptRunRequest) => {',
      'const copyHostToolbarPromptText = useCallback',
    );

    expect(directRunSource).not.toContain("messageApi.loading('正在发送给 AI...', 0)");
    expect(directRunSource).toContain("messageApi.success('AI 已执行');");
    expect(directRunSource).toContain('formatThrownError(event.error)');
    expect(directRunSource).toContain('messageApi.error(`AI 执行失败：${formatThrownError(event.error)}`);');
    expect(directRunSource).not.toContain("messageApi.error(error?.message || 'AI 执行失败');");
  });

  it('passes structured direct annotation API run errors into external editing task refs', () => {
    const source = readPreviewRootSource();
    const directRunSource = getSourceSegment(
      source,
      'const runAnnotationAcpChatPrompt = useCallback(async (input: string | null | undefined | AnnotationPromptRunRequest) => {',
      'const copyHostToolbarPromptText = useCallback',
    );

    expect(source).toContain('function buildAnnotationEditingErrorTaskRef(');
    expect(source).toContain('(error as { data?: Record<string, unknown> }).data');
    expect(source).toContain('details: data');
    expect(source).toContain('chunk }');
    expect(directRunSource).toContain('formatThrownError(event.error)');
    expect(directRunSource).toContain('const terminalTaskRef = buildAnnotationEditingErrorTaskRef(event.taskRef, event.error);');
    expect(directRunSource).toContain("applyAnnotationEditingTaskState(event.editingTargets, 'error', terminalTaskRef)");
  });

  it('keeps explicit selection mode actions reflected in host toolbar state', () => {
    const source = readPreviewRootSource();
    const runHostToolbarActionSource = getSourceSegment(
      source,
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );
    const fallbackActionSource = getSourceSegment(
      source,
      'const runQuickEditHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
    );

    expect(fallbackActionSource).toContain("if (nextAction.type === 'toggle-selection-mode') {");
    expect(fallbackActionSource).toContain('selectionModeActive: nextAction.active ?? !(hostToolbarStateRef.current?.selectionModeActive ?? true)');
    expect(runHostToolbarActionSource).toContain("if (nextAction.type === 'toggle-selection-mode' && typeof nextAction.active === 'boolean') {");
    expect(runHostToolbarActionSource).toContain('selectionModeActive: nextAction.active');
    expect(runHostToolbarActionSource).toContain('resolveHostToolbarStateForDisplay(hostToolbarStateRef.current, explicitSelectionState, isDarkMode)');
  });

  it('does not keep Web Editor Agent request handling in the preview host', () => {
    const source = readPreviewActionsSource();

    expect(source).not.toContain('AXHUB_WEB_EDITOR_GENIE_REQUEST');
    expect(source).not.toContain('isWebEditorGenieRequestMessage');
    expect(source).not.toContain('handleWebEditorGenieRequest');
  });

  it('copies host toolbar prompt text through Make even when the editor action API exists', () => {
    const source = readPreviewActionsSource();
    const runHostToolbarActionSource = getSourceSegment(
      readPreviewRootSource(),
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );

    expect(source).toContain('getCopyPromptText?: () => string;');
    expect(runHostToolbarActionSource).toContain("nextAction.type === 'copy-prompt'");
    expect(runHostToolbarActionSource).toContain('const promptText = editors?.getCopyPromptText?.();');
    expect(runHostToolbarActionSource).toContain('return copyHostToolbarPromptText(promptText);');
    expect(runHostToolbarActionSource).toContain('clipboard: \'host\'');
    expect(runHostToolbarActionSource).not.toContain("nextAction.type === 'copy-prompt' && !editors?.runHostToolbarAction");
  });

  it('aggregates split prototype prompts for top host toolbar copy and send actions', () => {
    const source = readPreviewActionsSource();
    const runHostToolbarActionSource = getSourceSegment(
      readPreviewRootSource(),
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );

    expect(source).toContain('buildCombinedPrototypePrompt');
    expect(source).toContain('const collectPrototypePrompt = useCallback(async (');
    expect(source).toContain('action?: CommentaryHostToolbarAction | null,');
    expect(source).toContain('const collectSplitPrototypePrompts = useCallback(async (');
    expect(source).toContain('collectSplitPrototypePrompts(nextAction)');
    expect(runHostToolbarActionSource).toContain("previewConfig.previewMode === 'split'");
    expect(runHostToolbarActionSource).toContain('const splitPrompts = await collectSplitPrototypePrompts(nextAction);');
    expect(runHostToolbarActionSource).toContain('const combinedPrompt = buildCombinedPrototypePrompt(splitPrompts);');
    expect(runHostToolbarActionSource).toContain('return copyHostToolbarPromptText(combinedPrompt);');
    expect(runHostToolbarActionSource).toContain('return runAnnotationAcpChatPrompt({');
    expect(runHostToolbarActionSource).toContain('editingTargets: splitPrompts.flatMap((item) => item.editingTargets || []),');
    expect(runHostToolbarActionSource).toContain("await collectPrototypePrompt('primary', nextAction)");
    expect(runHostToolbarActionSource).toMatch(
      /if \(previewConfig\.previewMode === 'split'\) \{[\s\S]*?return runAnnotationAcpChatPrompt\(\{[\s\S]*?editingTargets: splitPrompts\.flatMap[\s\S]*?\}\);[\s\S]*?\}\s*return runAnnotationAcpChatPrompt\([\s\S]*?await collectPrototypePrompt\('primary', nextAction\)/,
    );
    expect(runHostToolbarActionSource).toMatch(
      /if \(previewConfig\.previewMode === 'split'\) \{[\s\S]*?return copyHostToolbarPromptText\(combinedPrompt\);[\s\S]*?\}\s*const promptText = editors\?\.getCopyPromptText\?\.\(\);/,
    );
  });

  it('uses bridge modified elements when collecting cross-origin annotation execution targets', () => {
    const source = readPreviewRootSource();
    const collectPrototypePromptSource = getSourceSegment(
      source,
      'const collectPrototypePrompt = useCallback(async (',
      'const collectSplitPrototypePrompts = useCallback(async (',
    );
    const runHostToolbarActionSource = getSourceSegment(
      source,
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );

    expect(collectPrototypePromptSource).toContain('resolveAnnotationActionEditingTargets(action, bridgeResult?.modifiedElements ?? [])');
    expect(runHostToolbarActionSource).toContain("await collectPrototypePrompt('primary', nextAction)");
  });

  it('exposes pane-scoped prototype prompt actions for split preview title buttons', () => {
    const source = readPreviewActionsSource();
    const presentationBuilderSource = readFileSync(resolve(__dirname, '../hooks/useIndexPagePresentationPropsBuilder.ts'), 'utf8');

    expect(source).toContain('const runPrototypePanePromptAction = useCallback(async (');
    expect(source).toContain('pane: PreviewPane,');
    expect(source).toContain('action: PrototypePanePromptAction,');
    expect(source).toContain('runPrototypePanePromptAction,');
    expect(presentationBuilderSource).toContain('handleRunPrototypePanePromptAction: preview.runPrototypePanePromptAction');
  });

  it('wires drawio resource previews to the shared online Draw.io editor', () => {
    const rootSource = readPreviewRootSource();
    const presentationBuilderSource = readFileSync(resolve(__dirname, '../hooks/useIndexPagePresentationPropsBuilder.ts'), 'utf8');

    expect(rootSource).toContain("from '../../domains/drawio/drawioResourceEditor'");
    expect(rootSource).toContain('isDrawioResource(currentMarkdownItem)');
    expect(rootSource).toContain('const drawioResourceEditAvailable = Boolean(');
    expect(rootSource).toContain('const handleOpenDrawioResourceEditor = useCallback(() => {');
    expect(rootSource).toContain('openDrawioResourceEditor({');
    expect(rootSource).toContain('resource: {');
    expect(rootSource).toContain('...currentMarkdownItem,');
    expect(rootSource).toContain('projectId: requireProjectScope(projectId).projectId,');
    expect(rootSource).toContain('kind: currentMarkdownResource.kind');
    expect(rootSource).toContain('onSaved: handleRefreshElement');
    expect(rootSource).toContain('drawioResourceEditAvailable,');
    expect(rootSource).toContain('handleOpenDrawioResourceEditor,');
    expect(presentationBuilderSource).toContain('drawioResourceEditAvailable: preview.drawioResourceEditAvailable');
    expect(presentationBuilderSource).toContain('handleOpenDrawioResourceEditor: preview.handleOpenDrawioResourceEditor');
  });

  it('clears stale host toolbar prompt state after clear-edits actions', () => {
    const source = readPreviewActionsSource();
    const runHostToolbarActionSource = getSourceSegment(
      readPreviewRootSource(),
      'const runHostToolbarAction = useCallback(async (action: CommentaryHostToolbarAction) => {',
      'const runQuickEditSaveAction = useCallback',
    );

    expect(source).toContain('resolveHostToolbarStateAfterClearEdits');
    expect(source).toContain('copyPromptDisabled: true');
    expect(runHostToolbarActionSource).toContain("nextAction.type === 'clear-edits' && handled");
    expect(runHostToolbarActionSource).toContain('resolveHostToolbarStateAfterClearEdits(hostToolbarStateRef.current, resolvedState, isDarkMode)');
    expect(runHostToolbarActionSource).toContain('setResolvedHostToolbarState(clearedState);');
  });

  it('tracks quick-edit runtime handshake from the active preview iframe before enabling runtime operations', () => {
    const source = readPreviewActionsSource();
    const runtimeMessageSource = getSourceSegment(
      readPreviewRootSource(),
      'useEffect(() => {\n        const handleQuickEditRuntimeMessage = (event: MessageEvent) => {',
      'window.addEventListener(\'message\', handleQuickEditRuntimeMessage);',
    );

    expect(source).toContain("type QuickEditRuntimeStatus = 'idle' | 'pending' | 'ready' | 'missing' | 'error';");
    expect(source).toContain("isQuickEditRuntimeMessage(event.data)");
    expect(source).toContain("event.data?.type === 'axhub.quickEdit.runtimeReady'");
    expect(source).toContain("event.data?.type === 'axhub.quickEdit.patch'");
    expect(source).toContain("event.data?.type === 'axhub.quickEdit.save'");
    expect(source).toContain("event.data?.type === 'axhub.quickEdit.error'");
    expect(runtimeMessageSource).toContain('event.source !== previewIframe.contentWindow');
    expect(runtimeMessageSource).toContain('const expectedOrigin = getClientUrlOrigin(selectedItem.clientUrl);');
    expect(runtimeMessageSource).toContain('if (event.origin !== expectedOrigin) {');
    expect(runtimeMessageSource).toContain("errorMessage: 'runtimeReady origin mismatch'");
    expect(source).toContain("setQuickEditRuntimeStatus('pending');");
    expect(source).toContain("setQuickEditRuntimeStatus('ready');");
    expect(source).toContain("setQuickEditRuntimeStatus('missing');");
    expect(source).toContain('projectCapabilities?.quickEdit !== false');
    expect(source).toContain("quickEditRuntimeStatus !== 'ready'");
    expect(source).toContain("messageApi.warning('当前客户端页面尚未接入 /runtime/quick-edit.js，请通过 script、Vite 插件或 Webpack 插件加载后再使用快速编辑')");
  });

  it('resets preview-scoped side panels when the preview iframe target changes outside quick edit', () => {
    const source = readPreviewRootSource();
    const resetSegment = getSourceSegment(
      source,
      'useEffect(() => {\n        const prototypeIdentityChanged = selectedPrototypeIdentityRef.current !== selectedPrototypeIdentity;',
      'const quickEditAvailable = Boolean(selectedEditablePreviewResource)',
    );

    expect(resetSegment).toMatch(/if \(shouldRestoreQuickEdit\) \{[\s\S]*return;/);
    expect(resetSegment).toContain('setStandalonePanelOpen(false);');
    expect(resetSegment).toContain('setReviewPanelOpen(false);');
    expect(resetSegment).toContain('decisionPanelAutoOpenSeqRef.current += 1;');
    expect(resetSegment).toContain('resourceType');
    expect(resetSegment).toContain('selectedEditablePreviewResource');
  });

  it('auto-opens the standalone design decision panel when the loaded prototype has decisions', () => {
    const source = readPreviewRootSource();
    const loadSegment = getSourceSegment(
      source,
      'const handlePreviewIframeLoad = useCallback((iframe?: HTMLIFrameElement | null) => {',
      'useEffect(() => {\n        const handleQuickEditRuntimeMessage = (event: MessageEvent) => {',
    );

    expect(source).toContain('const decisionPanelAutoOpenSeqRef = useRef(0);');
    expect(source).toContain('function hasHostToolbarDecisionData(state: CommentaryHostToolbarState | null | undefined): boolean');
    expect(loadSegment).toContain('const decisionPanelAutoOpenSeq = decisionPanelAutoOpenSeqRef.current + 1;');
    expect(loadSegment).toContain('decisionPanelAutoOpenSeqRef.current = decisionPanelAutoOpenSeq;');
    expect(loadSegment).toContain('void maybeAutoOpenStandaloneDecisionPanel(primaryIframe, decisionPanelAutoOpenSeq);');
    expect(source).toContain('const maybeAutoOpenStandaloneDecisionPanel = useCallback(async (iframe: HTMLIFrameElement | null, sequence: number) => {');
    expect(source).toContain('if (sequence !== decisionPanelAutoOpenSeqRef.current)');
    expect(source).toContain('hasHostToolbarDecisionData(nextState)');
    expect(source).toContain('decisionDataCount');
    expect(source).toContain('queryPrototypeEditorState(iframe)');
    expect(source).toContain('await enterPrototypeEditorPanelOnly(iframe)');
    expect(source).toContain('setStandalonePanelOpen(opened);');
  });

  it('tracks whether the loaded prototype has design decision data for the toolbar entry', () => {
    const source = readPreviewRootSource();
    const loadSegment = getSourceSegment(
      source,
      'const maybeAutoOpenStandaloneDecisionPanel = useCallback(async (iframe: HTMLIFrameElement | null, sequence: number) => {',
      'const handlePreviewIframeLoad = useCallback((iframe?: HTMLIFrameElement | null) => {',
    );
    const resetEffectSource = getSourceSegment(
      source,
      'useEffect(() => {\n        const prototypeIdentityChanged = selectedPrototypeIdentityRef.current !== selectedPrototypeIdentity;',
      'const quickEditAvailable = Boolean(selectedEditablePreviewResource)',
    );
    const returnSegment = source.slice(source.indexOf('return {'));

    expect(source).toContain('const [prototypeDecisionDataAvailable, setPrototypeDecisionDataAvailable] = useState(false);');
    expect(source).toContain('const loadedPrototypeDecisionDataAvailableRef = useRef(false);');
    expect(source).toContain('function hasPrototypeDecisionData(');
    expect(source).toContain('const setTrackedHostToolbarState = useCallback((nextState: SetStateAction<CommentaryHostToolbarState | null>) => {');
    expect(source).toContain('setHostToolbarState: setTrackedHostToolbarState,');
    expect(loadSegment).toContain('const hasDecisionData = hasPrototypeDecisionData(nextState, decisionDataCount);');
    expect(loadSegment).toContain('loadedPrototypeDecisionDataAvailableRef.current = hasDecisionData;');
    expect(loadSegment).toContain('setPrototypeDecisionDataAvailable(hasDecisionData);');
    expect(loadSegment).toContain('if (!hasDecisionData) {');
    expect(resetEffectSource).toContain('setPrototypeDecisionDataAvailable(false);');
    expect(returnSegment).toContain('prototypeDecisionDataAvailable,');
  });

  it('runs quick edit save text and style through direct editor APIs before bridge fallback', () => {
    const source = readPreviewRootSource();
    const saveActionSource = getSourceSegment(
      source,
      'const runQuickEditSaveAction = useCallback(async (action: QuickEditSaveAction) => {',
      'useEffect(() => {',
    );

    expect(saveActionSource).toMatch(/if \(action === 'save-text'\) \{[\s\S]*editors\.saveWebEditorTextChanges[\s\S]*return true;/);
    expect(saveActionSource).toMatch(/else if \(action === 'save-style'\) \{[\s\S]*editors\.saveWebEditorStyleChanges[\s\S]*return true;/);
    expect(saveActionSource).toContain('const bridgeResult = await postPrototypeEditorSaveAction(iframe, action);');
    expect(saveActionSource).toContain('return Boolean(bridgeResult?.handled ?? bridgeResult?.success);');
  });

  it('keeps annotation and selection state active until the refreshed runtime is ready', () => {
    const source = readPreviewRootSource();
    const refreshSegment = getSourceSegment(
      source,
      'const handleRefreshElement = useCallback(() => {',
      'const notifyPreviewMessage = useCallback',
    );
    const iframeLoadSegment = getSourceSegment(
      source,
      'const handlePreviewIframeLoad = useCallback((iframe?: HTMLIFrameElement | null) => {',
      'const notifyPreviewMessage = useCallback',
    );
    const runtimeReadySegment = getSourceSegment(
      source,
      "if (event.data?.type === 'axhub.quickEdit.runtimeReady') {",
      "if (event.data?.type === 'axhub.quickEdit.patch') {",
    );

    expect(refreshSegment).toContain('const refreshSnapshot = createPreviewRefreshRestoreSnapshot({');
    expect(refreshSegment).toContain('selectionModeActive: hostToolbarStateRef.current?.selectionModeActive ?? true,');
    expect(refreshSegment).toContain('pendingPrototypeEditorRestoreRef.current = refreshSnapshot.prototypeEditor;');
    expect(refreshSegment).toContain("setEditorStatus({ mode: 'quickEdit' });");
    expect(refreshSegment).not.toContain('exitPrototypeEditorPanelOnly();');
    expect(refreshSegment).not.toContain('setHostToolbarState(null);');
    expect(iframeLoadSegment).toContain('if (pendingPrototypeEditorRestoreRef.current) {');
    expect(iframeLoadSegment).toContain('if (currentDocumentIsHtml) {');
    expect(iframeLoadSegment).toContain('void restorePendingPrototypeEditor(primaryIframe);');
    expect(runtimeReadySegment).toContain('void restorePendingPrototypeEditor(previewIframe, { requireRuntimeReady: true });');
  });

  it('exits prototype annotation mode instead of restoring quick edit when the selected prototype changes', () => {
    const source = readPreviewRootSource();
    const identityHelperSource = getSourceSegment(
      source,
      'function resolveSelectedPrototypeIdentity(selectedItem: any): string {',
      'export function useIndexPagePreviewActions(params: any) {',
    );
    const switchEffectSource = getSourceSegment(
      source,
      'useEffect(() => {\n        const previousPrototypeIdentity = selectedPrototypeIdentityRef.current;',
      'const handleCopyQuickEditPrompt = useCallback',
    );

    expect(identityHelperSource).toContain('selectedItem?.resourceId');
    expect(identityHelperSource).toContain('selectedItem?.name');
    expect(source).toContain('const selectedPrototypeIdentity = useMemo(() => resolveSelectedPrototypeIdentity(selectedItem), [selectedItem]);');
    expect(source).toContain('const selectedPrototypeIdentityRef = useRef(selectedPrototypeIdentity);');
    expect(source).toContain('const prototypeIdentityChanged = selectedPrototypeIdentityRef.current !== selectedPrototypeIdentity;');
    expect(source).toContain('const shouldRestoreQuickEdit = quickEditRuntimeActiveRef.current && !prototypeIdentityChanged;');
    expect(source).toContain('if (prototypeIdentityChanged && quickEditRuntimeActiveRef.current)');
    expect(switchEffectSource).toContain('previousPrototypeIdentity === selectedPrototypeIdentity');
    expect(switchEffectSource).toContain('quickEditRuntimeActiveRef.current');
    expect(switchEffectSource).toContain('pendingPrototypeEditorRestoreRef.current = null;');
    expect(switchEffectSource).toContain('setReviewPanelOpen(false);');
    expect(switchEffectSource).toContain('void handleExitWebEditor({ restoreDevice: false, restorePanelOnly: false });');
  });

  it('preserves standalone panel and host toolbar state while refreshing the preview iframe', () => {
    const source = readPreviewRootSource();
    const refreshSegment = getSourceSegment(
      source,
      'const handleRefreshElement = useCallback(() => {',
      'const notifyPreviewMessage = useCallback',
    );

    expect(refreshSegment).toContain('pendingStandalonePanelRestoreRef.current = refreshSnapshot.standalonePanelOpen;');
    expect(refreshSegment).not.toContain('exitPrototypeEditorPanelOnly();');
    expect(refreshSegment).not.toContain('setStandalonePanelOpen(false);');
    expect(refreshSegment).toContain('decisionPanelAutoOpenSeqRef.current += 1;');
    expect(refreshSegment).toContain('setElementIframeKey((previous) => previous + 1);');
  });

  it('restores specifications and Markdown documents in their saved comment or edit mode after refresh', () => {
    const source = readPreviewRootSource();
    const refreshSegment = getSourceSegment(
      source,
      'const handleRefreshElement = useCallback(() => {',
      'const notifyPreviewMessage = useCallback',
    );
    const statusSegment = getSourceSegment(
      source,
      "if (event.data?.type === 'SPEC_EDIT_STATUS') {",
      "if (event.data?.type === 'SPEC_EDIT_STATUS_REQUEST') {",
    );

    expect(refreshSegment).toContain('pendingDocumentEditorRestoreModeRef.current = refreshSnapshot.documentQuickEditMode;');
    expect(refreshSegment).toContain('documentQuickEditMode: docEditState.quickEditMode,');
    expect(statusSegment).toContain('resolveDocumentRefreshRestoreStatus(');
    expect(statusSegment).toContain('pendingDocumentEditorRestoreModeRef.current = null;');
    expect(statusSegment).toContain('handleEnableDocEdit(refreshStatusAction.restoreMode, { preserveSidebar: true });');
    expect(statusSegment.indexOf('resolveDocumentRefreshRestoreStatus('))
      .toBeLessThan(statusSegment.indexOf('prototypeSpecMarkdownStatusGateRef.current.handle'));
  });

  it('declares runtime postMessage action bindings before the handshake effect depends on them', () => {
    const source = readPreviewRootSource();
    const effectIndex = source.indexOf('window.addEventListener(\'message\', handleQuickEditRuntimeMessage);');
    const previewRuntimeActionsIndex = source.indexOf('const previewRuntimeActions = usePreviewRuntimeActions');
    const forwardPatchIndex = source.indexOf('const forwardQuickEditPatch = previewRuntimeActions.forwardQuickEditPatch;');
    const reportErrorIndex = source.indexOf('const reportQuickEditRuntimeError = previewRuntimeActions.reportQuickEditRuntimeError;');

    expect(previewRuntimeActionsIndex).toBeGreaterThan(-1);
    expect(forwardPatchIndex).toBeGreaterThan(-1);
    expect(reportErrorIndex).toBeGreaterThan(-1);
    expect(effectIndex).toBeGreaterThan(-1);
    expect(previewRuntimeActionsIndex).toBeLessThan(effectIndex);
    expect(forwardPatchIndex).toBeLessThan(effectIndex);
    expect(reportErrorIndex).toBeLessThan(effectIndex);
  });

  it('keeps Space temporary interaction local to the iframe runtime', () => {
    const source = readPreviewRootSource();

    expect(source).not.toContain('QUICK_EDIT_TEMPORARY_INTERACTION_MESSAGE_TYPE');
    expect(source).not.toContain('QUICK_EDIT_TEMPORARY_INTERACTION_LONG_PRESS_MS');
    expect(source).not.toContain('shouldHandleQuickEditSpaceTemporaryInteractionEvent(event)');
    expect(source).not.toContain('getQuickEditTemporaryInteractionTargets({');
    expect(source).not.toContain('postTemporaryInteraction(true)');
    expect(source).not.toContain('postTemporaryInteraction(false)');
  });

  it('derives export availability from project capabilities runtime state and explicit source context', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('type ExportAvailability');
    expect(source).toContain('const exportAvailability = useMemo<ExportAvailability>');
    expect(source).toContain('projectCapabilities?.figmaExport !== false');
    expect(source).toContain('projectCapabilities?.axureExport !== false');
    expect(source).toContain('projectCapabilities?.localExports?.html === true');
    expect(source).toContain('projectCapabilities?.localExports?.make === true');
    expect(source).toContain("quickEditRuntimeStatus === 'ready'");
    expect(source).toContain('hasExplicitSourceContext(selectedItem)');
    expect(source).toContain('figmaDomDisabledReason');
    expect(source).toContain('axureSourceDisabledReason');
    expect(source).toContain('htmlExportDisabledReason');
    expect(source).toContain('makeExportDisabledReason');
  });

  it('keeps the Make export workflow available from source or Figma artifact context before local .fig assets exist', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('function hasFigmaMakeExportContext(selectedItem: any): boolean');
    expect(source).toContain('const hasMakeExportContext = hasFigmaMakeExportContext(selectedItem);');
    expect(source).toContain('const makeExportContextMissingReason = hasMakeExportContext');
    expect(source).toContain("!figmaEnabled\n                ? '当前项目未启用 Figma 导出能力'");
    expect(source).toContain(': makeExportContextMissingReason;');
    expect(source).not.toContain("!localMakeExportEnabled\n                ? '当前项目未启用 Make 本地导出能力'");
  });

  it('keeps generic Figma and Axure availability independent from client runtime state', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('const canOpenGenericFigmaExport = Boolean(currentRuntimeExportResource) && figmaEnabled;');
    expect(source).toContain('const canOpenGenericAxureExport = Boolean(currentRuntimeExportResource) && axureEnabled;');
    expect(source).toContain("const canUseRuntimeFeatures = contentMode === 'theme'");
    expect(source).toContain("? hasClientUrl\n            : viewMode === 'demo' && hasClientUrl && quickEditRuntimeStatus === 'ready';");
    expect(source).toContain('const canUseSourceFeatures = viewMode === \'demo\' && hasSourceContext && axureEnabled;');
    expect(source).toContain('figmaDomDisabledReason: figmaDisabledReason || runtimeMissingReason');
    expect(source).toContain('axureRuntimeDisabledReason: axureDisabledReason || runtimeMissingReason');
    expect(source).not.toContain(": !hasClientUrl\\n                ? '当前原型缺少 clientUrl'\\n                : !figmaEnabled");
    expect(source).not.toContain(": !hasClientUrl\\n                ? '当前原型缺少 clientUrl'\\n                : !axureEnabled");
  });

  it('uses explicit source metadata for Make export, bundle, and review requests', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("import { hasExplicitLocalPath } from '../../utils/localPath';");
    expect(source).toContain("import { getExplicitLocalPath, stripIndexFilePath } from '../../utils/localPath';");
    expect(source).toContain('function getSelectedSourcePath(selectedItem: any): string');
    expect(source).toContain('function getSelectedResourceTargetPath(selectedItem: any): string');
    expect(source).toContain('const targetPath = getSelectedResourceTargetPath(selectedItem);');
    expect(source).toContain('const sourcePath = getSelectedSourceBasePath(selectedItem);');
    expect(source).not.toContain('const sourceCodePath = getSelectedSourceBasePath(selectedItem);');
    expect(source).toContain('const fetchRuntimeExportBundle = useCallback(async (): Promise<ExportIndexBundle> => {');
    expect(source).toContain('apiService.fetchExportIndexBundle(getSelectedResourceTargetPath(selectedItem), requireProjectScope(projectId), {');
    expect(source).toContain('includeImageAssets: imageConfig.includeImageAssets,');
    expect(source).not.toContain('const targetPath = `prototypes/${selectedItem.name}`;');
    expect(source).not.toContain('const path = `${activeTab}/${selectedItem.name}`;');
    expect(source).not.toContain('`/api/source?path=${encodeURIComponent(`${activeTab}/${selectedItem.name}`)}`');
    expect(source).not.toContain('apiService.fetchExportIndexBundle(`${activeTab}/${selectedItem.name}`)');
  });

  it('uses Markdown preview URLs for document and template panes', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("resolveMarkdownPreviewIframeUrl } from '../../utils/markdownPreview';");
    expect(source).toContain("return resolveMarkdownPreviewIframeUrl(selectedDoc, 'doc');");
    expect(source).toContain("return resolveMarkdownPreviewIframeUrl(selectedTemplate, 'template');");
    expect(source).not.toContain("return selectedDoc?.previewUrl || selectedDoc?.specUrl || '';");
    expect(source).not.toContain("return selectedTemplate?.previewUrl || selectedTemplate?.specUrl || '';");
  });

  it('routes Markdown document editing through the spec-template text comment editor', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain("contentMode === 'doc' || contentMode === 'template'");
    expect(source).not.toContain("contentMode === 'doc' || contentMode === 'template' || viewMode === 'spec'");
    expect(source).toContain('enterDocumentEditor');
    expect(source).toContain('enableDocumentEditor({');
    expect(source).toContain("toolbarMode: 'host'");
    expect(source).toContain('quickEditMode: mode');
    expect(source).toContain('initialDarkMode: isDarkMode');
    expect(source).toContain('assistantPanelOpen: assistantContextAppendAvailable');
    expect(source).toContain('documentHostToolbarUnsubscribeRef.current = editorApi.subscribeHostToolbarState?.((nextState) => {');
    expect(source).toContain('setResolvedHostToolbarState(resolveHostToolbarStateForDisplay(null, editorApi.getHostToolbarState?.() ?? createDefaultHostToolbarState(), isDarkMode));');
    expect(source).toContain('void enterDocumentEditor(mode, options);');
    expect(source).toContain('return readPreviewFrameEditorApi<DocumentEditorApi>(iframe, \'SpecTemplateBootstrap\');');
    expect(source).not.toContain("return api ?? readPreviewFrameEditorApi<DocumentEditorApi>(iframe, 'HtmlTemplateBootstrap');");
    expect(source).toContain("setEditorStatus({ mode: 'quickEdit' });");
    expect(source).not.toContain("messageApi.warning('文档模式下无法进行编辑');");
  });

  it('routes HTML document annotation through the HTML page editor bridge', () => {
    const source = readPreviewActionsSource();
    const enterHtmlDocumentEditorSource = getSourceSegment(
      source,
      'const enterHtmlDocumentEditor = useCallback',
      'const handleEnableDocEdit = useCallback',
    );
    const handleEnableDocEditSource = getSourceSegment(
      source,
      'const handleEnableDocEdit = useCallback',
      'const handleSaveDocEdit = useCallback',
    );

    expect(source).toContain('const currentDocumentIsHtml = Boolean(');
    expect(source).toContain('isHtmlCommentableResource(currentMarkdownItem)');
    expect(source).toContain('const enterHtmlDocumentEditor = useCallback(async (options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean }) => {');
    expect(source).toContain('if (!options?.preserveSidebar) {');
    expect(source).toContain('if (isHtmlCommentableResource(currentMarkdownItem)) {');
    expect(handleEnableDocEditSource).toContain('const handleEnableDocEdit = useCallback(async (');
    expect(handleEnableDocEditSource).toContain('): Promise<boolean> => {');
    expect(handleEnableDocEditSource).toContain('return enterHtmlDocumentEditor(options);');
    expect(handleEnableDocEditSource).toContain('return false;');
    expect(handleEnableDocEditSource).toContain('return true;');
    expect(source).toContain("type: 'toggle-selection-mode'");
    expect(source).toContain('active: false');
    expect(enterHtmlDocumentEditorSource).toContain('const selectionModeResult = await postPrototypeEditorHostToolbarAction(primaryIframe, {');
    expect(enterHtmlDocumentEditorSource).toContain('...(selectionModeResult?.hostToolbarState ?? hostToolbarStateRef.current ?? createDefaultHostToolbarState()),');
    expect(enterHtmlDocumentEditorSource).toContain('selectionModeActive: false,');
    expect(enterHtmlDocumentEditorSource).toContain('setResolvedHostToolbarState(resolveHostToolbarStateForDisplay(');
    expect(source).toContain('if (currentDocumentIsHtml) {');
    expect(source).toContain('await enterHtmlDocumentEditor();');
    expect(source).toContain("const selectedEditablePreviewResource = currentDocumentIsHtml");
    expect(source).toContain("readPreviewFrameEditorApi<PrototypeEditorApi>(iframe, 'HtmlTemplateBootstrap')");
    expect(source).not.toContain("readPreviewFrameEditorApi<DocumentEditorApi>(iframe, 'HtmlTemplateBootstrap')");
  });

  it('keeps document and prototype quick edit themes synchronized with the host theme', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('isDarkMode = false');
    expect(source).toContain('setIsDarkMode');
    expect(source).toContain('const isDarkModeRef = useRef(isDarkMode);');
    expect(source).toContain('isDarkModeRef.current = isDarkMode;');
    expect(source).toContain('options: buildPrototypeEditorEnableOptions(context)');
    expect(source).toContain("resolvedEditors.enable('webEditorV2', buildPrototypeEditorEnableOptions(context))");
    expect(source).toContain('assistantPanelOpen: assistantContextAppendAvailable');
    expect(source).toContain("requestedAction = action.type === 'toggle-dark-mode'");
    expect(source).toContain("setIsDarkMode?.(nextAction.darkMode)");
    expect(source).toContain("void editorApi?.runHostToolbarAction?.({ type: 'toggle-dark-mode', darkMode: isDarkMode });");
    expect(source).toContain("editors.runHostToolbarAction({ type: 'toggle-dark-mode', darkMode: isDarkMode })");
    expect(source).toContain("postPrototypeEditorHostToolbarAction(iframe, { type: 'toggle-dark-mode', darkMode: isDarkMode })");
    expect(source).not.toContain('setIsDarkMode?.(nextState.darkMode)');
    expect(source).not.toContain('setIsDarkMode?.(nextToolbarState.darkMode)');
    expect(source).not.toContain('setIsDarkMode?.(message.hostToolbarState.darkMode)');
  });

  it('sends runtime export messages with project and resource identity', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('createRuntimeExportMessage');
    expect(source).toContain('requestId');
    expect(source).toContain("resourceType: `${normalizedResourceType}s`");
    expect(source).toContain('projectId: selectedItem.projectId');
    expect(source).toContain('resourceId: selectedItem.resourceId || selectedItem.name');
    expect(source).toContain('clientUrl: selectedItem.clientUrl || selectedItem.previewUrl');
    expect(source).toContain("type: 'axhub.quickEdit.export.captureScreenshot'");
    expect(source).toContain("type: 'axhub.quickEdit.export.axureJson'");
    expect(source).toContain("event.data.type !== 'axhub.quickEdit.export.captureScreenshotResult'");
    expect(source).toContain("event.data.type !== 'axhub.quickEdit.export.axureJsonResult'");
    expect(source).not.toContain("type: 'CAPTURE_SCREENSHOT'");
    expect(source).not.toContain("type: 'EXPORT_AXURE_JSON'");
    expect(source).not.toContain("event.data.type !== 'AXURE_JSON_READY'");
  });

  it('requests high-quality Runtime cover screenshots with an 8 MB hard limit', () => {
    const source = readPreviewRootSource();
    const screenshotSegment = getSourceSegment(
      source,
      'const handleRequestScreenshot = useCallback',
      "    const handleDimensionChange = useCallback",
    );

    expect(screenshotSegment).toContain("payload.format = 'jpeg';");
    expect(screenshotSegment).toContain('payload.quality = 0.92;');
    expect(screenshotSegment).toContain('payload.maxBytes = 8 * 1024 * 1024;');
  });

  it('records quick-edit runtime save messages as edit-history records', () => {
    const source = readPreviewActionsSource();

    expect(source).toMatch(/event\.data\?\.type === 'axhub\.quickEdit\.save'[\s\S]*postProjectCommunicationRecord\(selectedItem, 'edit-history', \{\s*operationType: 'quickEdit\.save',\s*status: 'success'/s);
  });

  it('records runtime-backed and source-backed export outcomes through project communication APIs', () => {
    const source = readPreviewActionsSource();

    expect(source).toMatch(/postProjectCommunicationRecord\(currentRuntimeExportResource, 'exports', \{\s*operationType: 'axure\.copy',\s*status: 'success'/s);
    expect(source).toMatch(/postProjectCommunicationRecord\(currentRuntimeExportResource, 'exports', \{\s*operationType: 'axure\.copy',\s*status: 'failed'/s);
    expect(source).toMatch(/postProjectCommunicationRecord\(currentRuntimeExportResource, 'exports', \{\s*operationType: 'figma\.copy',\s*status: 'success'/s);
    expect(source).toMatch(/postProjectCommunicationRecord\(currentRuntimeExportResource, 'exports', \{\s*operationType: 'figma\.copy',\s*status: 'failed'/s);
    expect(source).toMatch(/postProjectCommunicationRecord\(selectedItem, 'exports', \{\s*operationType: 'make\.export',\s*status: 'success'/s);
    expect(source).toMatch(/metadata: \{\s*fileName,\s*\}/s);
    expect(source).toMatch(/postProjectCommunicationRecord\(selectedItem, 'exports', \{\s*operationType: 'make\.export',\s*status: 'failed'/s);
    expect(source).toContain("errorMessage: String(error?.message || '导出 Figma Make 失败')");
  });

  it('builds Axure runtime cover and copy config from Axure-compatible export code', () => {
    const source = readPreviewActionsSource();
    const coverSegment = getSourceSegment(
      readPreviewRootSource(),
      'const buildRuntimeCoverSvg = useCallback(async () => {',
      '    const handleExport = useCallback',
    );
    const copyConfigSegment = getSourceSegment(
      readPreviewRootSource(),
      'const handleCopyConfig = useCallback(async (exportType: string): Promise<string> => {',
      '    const handleQuickCopyRuntimeComponent = useCallback',
    );

    expect(coverSegment).toContain('const axureRuntimeCode = indexBundle.entry.axureCode || indexBundle.entry.code;');
    expect(coverSegment).toContain('indexBundle = await fetchRuntimeExportBundle();');
    expect(coverSegment).toContain('indexBundle: embeddedIndexBundle');
    expect(coverSegment).toContain('svgElement.setAttribute(\'AxExtraData\'');
    expect(coverSegment).toContain('svgElement.setAttribute(\'AxData\'');
    expect(coverSegment).not.toContain('fetchDocs');
    expect(coverSegment).not.toContain('code: indexBundle.entry.code');
    expect(coverSegment).not.toContain('axSpec');
    expect(copyConfigSegment).toContain('const axureRuntimeCode = indexBundle.entry.axureCode || indexBundle.entry.code;');
    expect(copyConfigSegment).toContain('code: axureRuntimeCode');
    expect(copyConfigSegment).toContain('codeLink: indexBundle.entry.axureCodePath');
    expect(copyConfigSegment).toContain('indexBundle: embeddedIndexBundle');
    expect(copyConfigSegment).toContain('const indexBundle = await fetchRuntimeExportBundle();');
    expect(copyConfigSegment).not.toContain('fetchDocs');
    expect(copyConfigSegment).not.toContain('codeAndDocs');
    expect(source).toContain('const payload = await requestAxureJson(options);');
  });

  it('uses the generated full-page SVG size for copied Runtime component bounds', () => {
    const source = readPreviewRootSource();
    const buildCoverSegment = getSourceSegment(
      source,
      'const buildRuntimeCoverSvg = useCallback(async () => {',
      '    const handleExport = useCallback',
    );
    const copyRuntimeSegment = getSourceSegment(
      source,
      'const handleCopyRuntimeComponent = useCallback',
      '    const handleCopyConfig = useCallback',
    );

    expect(buildCoverSegment).toContain("const coverWidth = Number(svgElement.getAttribute('width')) || imageConfig.width;");
    expect(buildCoverSegment).toContain("const coverHeight = Number(svgElement.getAttribute('height')) || imageConfig.height;");
    expect(buildCoverSegment).toContain('coverWidth,');
    expect(buildCoverSegment).toContain('coverHeight,');
    expect(copyRuntimeSegment).toContain('const { updatedSvg, coverWidth, coverHeight } = await buildRuntimeCoverSvg();');
    expect(copyRuntimeSegment).toContain('width: coverWidth,');
    expect(copyRuntimeSegment).toContain('height: coverHeight,');
    expect(copyRuntimeSegment).not.toContain('width: imageConfig.width,');
    expect(copyRuntimeSegment).not.toContain('height: imageConfig.height,');
  });

  it('opens the Figma Make guide dialog before attempting export download', () => {
    const source = readPreviewRootSource();
    const exportMakeSegment = getSourceSegment(
      source,
      'const handleExportMake = useCallback',
      '    const ensureAxureExportReviewPassed = useCallback',
    );

    expect(source).toContain('const [isFigmaMakeExportDialogOpen, setIsFigmaMakeExportDialogOpen] = useState(false);');
    expect(source).toContain('isFigmaMakeExportDialogOpen');
    expect(source).toContain('setIsFigmaMakeExportDialogOpen');
    expect(exportMakeSegment).toContain('setIsFigmaMakeExportDialogOpen(true);');
    expect(exportMakeSegment).not.toContain('/api/export-make?path=');
    expect(exportMakeSegment).not.toContain('navigator.clipboard.writeText(result.prompt)');
    expect(exportMakeSegment).not.toContain("messageApi.loading('正在导出 Figma Make...'");
  });

  it('publishes cloud targets through project config and opens target settings when config is missing', () => {
    const source = readPreviewRootSource();

    expect(source).toContain('const [cloudPublishSettingsOpen, setCloudPublishSettingsOpen] = useState(false);');
    expect(source).toContain('const [axhubPublishDialogOpen, setAxhubPublishDialogOpen] = useState(false);');
    expect(source).toContain("const [cloudPublishSettingsInitialTarget, setCloudPublishSettingsInitialTarget] = useState<CloudPublishSettingsInitialTarget>('s3');");
    expect(source).toContain('const [latestCloudPublishItems, setLatestCloudPublishItems] = useState');
    expect(source).toContain("const [visibleCloudPublishTargets, setVisibleCloudPublishTargets] = useState<CloudPublishTarget[]>(['axhub']);");
    expect(source).toContain('const currentPublishResourcePath = useMemo');
    expect(source).toContain('resolveCurrentPublishResourcePath({');
    expect(source).toContain('contentMode,');
    expect(source).toContain('selectedItem,');
    expect(source).toContain('selectedTheme,');
    expect(source).toContain('apiService.getCloudPublishingLatest(requestedResourcePath, requireProjectScope(projectId))');
    expect(source).toContain("...(latest.targets.githubPages ? { 'github-pages': latest.targets.githubPages } : {})");
    expect(source).toContain("...(latest.targets.axhub ? { axhub: latest.targets.axhub } : {})");
    expect(source).toContain("const handleOpenCloudPublishSettings = useCallback((target: CloudPublishSettingsInitialTarget = 's3')");
    expect(source).toContain('const handleOpenAxhubPublishDialog = useCallback');
    expect(source).toContain('const handleAxhubPublished = useCallback((result: AxhubPublishResponse)');
    expect(source).toContain('const handlePublishCloudTarget = useCallback');
    expect(source).toContain('const handleCopyLatestCloudPublishUrl = useCallback');
    expect(source).toContain("messageApi.warning('暂无发布地址');");
    expect(source).toContain("toast.success('发布地址已复制');");
    expect(source).toContain("messageApi.error(error?.message || '复制发布地址失败');");
    expect(source).not.toContain("messageApi.warning('暂无最近发布地址');");
    expect(source).toContain('const latestCloudPublishUrl = useMemo');
    expect(source).toContain('sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))');
    expect(source).toContain('apiService.getCloudPublishingConfig(requireProjectScope(projectId))');
    expect(source).toContain('setVisibleCloudPublishTargets(config.targets.publishSettings.visibleTargets || [\'axhub\']);');
    expect(source).toContain('const handleCloudPublishSettingsSaved = useCallback');
    expect(source).toContain('config.targets.publishSettings.visibleTargets || [\'axhub\']');
    expect(source).toContain('refreshCloudPublishingConfig');
    expect(source).toContain('visibleCloudPublishTargets,');
    expect(source).toContain("'github-pages': 'GitHub Pages'");
    expect(source).toContain("axhub: 'Axhub'");
    expect(source).toContain("if (target === 'axhub')");
    expect(source).toContain('handleOpenAxhubPublishDialog();');
    expect(source).toContain('apiService.publishCloudTarget({');
    expect(source).toContain('path: currentPublishResourcePath');
    expect(source).toContain('}, requireProjectScope(projectId));');
    expect(source).not.toContain('path: targetPath');
    expect(source).toContain('setCloudPublishSettingsOpen(true);');
    expect(source).toContain("error?.code === 'CONFIG_REQUIRED'");
    expect(source).toContain("toast.success(`已发布到 ${targetLabel}`");
    expect(source).toContain('duration: Infinity');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noreferrer"');
    expect(source).toContain('setLatestCloudPublishItems((current) => ({');
    expect(source).toContain('copyToClipboard(latestUrl)');
    expect(source).toContain('currentPublishResourcePath,');
  });

  it('copies the current primary preview screenshot through the image clipboard helper', () => {
    const source = readPreviewRootSource();
    const requestCurrentScreenshotSegment = getSourceSegment(
      source,
      'const requestCurrentScreenshot = useCallback(() => {',
      'const checkAxureAvailable = useCallback',
    );

    expect(source).toContain("import { copyImageDataUrlToClipboard, copyToClipboard, writeFigmaOfficialClipboardPayload } from '../../utils/clipboard';");
    expect(source).toContain('const requestCurrentScreenshot = useCallback');
    expect(source).toContain('getPrimaryPreviewIframe()');
    expect(source).toContain("type: 'axhub.quickEdit.export.captureScreenshot'");
    expect(source).toContain('const screenshotSize = resolveCurrentPreviewScreenshotSize(previewConfig, screenshotDefaultSize);');
    expect(requestCurrentScreenshotSegment).toContain('targetWidth: screenshotSize.width');
    expect(requestCurrentScreenshotSegment).toContain('targetHeight: screenshotSize.height');
    expect(source).toContain('await copyImageDataUrlToClipboard(result.dataUrl);');
    expect(source).toContain("messageApi.success('截图已复制到剪贴板');");
    expect(source).toContain('handleCopyCurrentScreenshot,');
  });

  it('does not keep the legacy standalone TEXT_EDIT parent-window protocol', () => {
    const source = readPreviewActionsSource();

    expect(source).not.toContain('TEXT_EDIT_');
    expect(source).not.toContain('textEditState');
    expect(source).not.toContain('textEditAvailable');
  });

  it('keeps user-triggerable Markdown comment/edit parent-window protocols without old prototype comment mode', () => {
    const source = readPreviewActionsSource();

    expect(source).toContain('SPEC_EDIT_');
    expect(source).not.toContain('handleOpenAnnotation');
    expect(source).not.toContain('handleToggleAnnotation');
    expect(source).not.toContain('handleEnableSpecEdit');
    expect(source).not.toContain('handleSwitchSpecQuickEditMode');
    expect(source).toContain('handleSwitchDocQuickEditMode');
    expect(source).toContain("'comment'");
    expect(source).not.toContain("'specComment'");
  });

  it('passes the requested Markdown document mode when enabling comment or edit mode', () => {
    const source = readPreviewRootSource();
    const handleEnableDocEditSource = getSourceSegment(
      source,
      'const handleEnableDocEdit = useCallback(async (',
      'const handleSaveDocEdit = useCallback',
    );
    const enterDocumentEditorSource = getSourceSegment(
      source,
      'const enterDocumentEditor = useCallback(async (mode: SpecQuickEditMode = \'comment\', options?: { preserveSidebar?: boolean }) => {',
      'const enterHtmlDocumentEditor = useCallback',
    );

    expect(handleEnableDocEditSource).toContain("postToPreview({ type: 'SPEC_EDIT_ENABLE', mode })");
    expect(handleEnableDocEditSource).toContain('quickEditMode: mode');
    expect(handleEnableDocEditSource).toContain('enterDocumentEditor(mode, options)');
    expect(handleEnableDocEditSource).toContain('options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean }');
    expect(enterDocumentEditorSource).toContain('quickEditMode: mode');
    expect(enterDocumentEditorSource).toContain('if (!options?.preserveSidebar) {');
  });

  it('consumes commentary settlement sounds at the host boundary', () => {
    const source = readPreviewRootSource();

    expect(source).toContain('onAiNotification,');
    expect(source).toContain("if (nextAction.type === 'play-notification-sound') {");
    expect(source).toContain("source: 'commentary-page'");
    expect(source).toContain('onAiNotification?.({');
    expect(source).toContain('return true;');
  });
});
