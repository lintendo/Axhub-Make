import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const localMidsceneConfigPath = resolve(__dirname, '../../../../midscene/acp-host-regression.yaml');

function readRegressionScript() {
  return readFileSync(localMidsceneConfigPath, 'utf8');
}

function readRegressionRunner() {
  return readFileSync(resolve(__dirname, '../../../../scripts/regression/run-acp-host-regression.mjs'), 'utf8');
}

function readRealCanvasArtifactRunner() {
  return readFileSync(resolve(__dirname, '../../../../scripts/regression/run-real-acp-canvas-artifact-regression.mjs'), 'utf8');
}

function readMakePackageJson() {
  return readFileSync(resolve(__dirname, '../../../../package.json'), 'utf8');
}

const describeLocalMidsceneRegression = existsSync(localMidsceneConfigPath) ? describe : describe.skip;

describeLocalMidsceneRegression('local ACP host frontend regression script source', () => {
  it('covers canvas AI artifact display order status and insertion process', () => {
    const source = readRegressionScript();

    expect(source).toContain('Canvas AI artifact history process');
    expect(source).toContain('seed_canvas_ai_artifact_history');
    expect(source).toContain('wait_for_canvas_route_to_settle_before_ai_artifact_history');
    expect(source).toContain('wait_for_canvas_ai_artifact_history_surface');
    expect(source).toContain('wait_for_canvas_ai_artifact_history_surface_after_seed');
    expect(source).toContain('verify_canvas_ai_artifact_history_order_status');
    expect(source).toContain('verify_canvas_ai_artifact_filter_and_insert_action');
    expect(source).toContain('verify_canvas_ai_artifact_success_type_filters');
    expect(source).toContain('E2E 图片成功产物');
    expect(source).toContain('E2E 原型成功产物');
    expect(source).toContain('E2E 文档成功产物');
    expect(source).toContain('E2E Drawio 成功产物');
    expect(source).toContain('E2E 运行中样式产物');
    expect(source).toContain('E2E 失败样式产物');
    expect(source).toContain('make-e2e-ai-task-prototype-success');
    expect(source).toContain('make-e2e-ai-task-failure-visual');
    expect(source).toContain('kind: \'prototype\'');
    expect(source).toContain('kind: \'document\'');
    expect(source).toContain('kind: \'drawio\'');
    expect(source).toContain('const baseTime = Date.now();');
    expect(source).not.toContain('const baseTime = 1700000000000;');
    expect(source).toContain('生成中');
    expect(source).toContain('已创建');
    expect(source).toContain('已更新');
    expect(source).toContain('失败');
    expect(source).not.toContain('expectedKind: \'文件\'');
    expect(source).toContain('添加到画布');
  });

  it('runs canvas AI artifact checks while the initial canvas deep link is still active', () => {
    const source = readRegressionScript();

    expect(source.indexOf('Canvas AI artifact history process')).toBeGreaterThan(source.indexOf('Bootstrap canvas deep link'));
    expect(source.indexOf('Canvas AI artifact history process')).toBeGreaterThan(source.indexOf('Canvas assistant active canvas write'));
    expect(source.indexOf('Canvas AI artifact history process')).toBeLessThan(source.indexOf('Sidebar navigation and preview deep link'));
  });

  it('prioritizes realtime ACP canvas insertion before optional legacy history checks', () => {
    const source = readRegressionScript();

    expect(source.indexOf('Canvas assistant active canvas write')).toBeGreaterThan(source.indexOf('Bootstrap canvas deep link'));
    expect(source.indexOf('Canvas assistant active canvas write')).toBeLessThan(source.indexOf('Canvas AI artifact history process'));
    expect(source).toContain('window.__AXHUB_E2E_SKIP_ARTIFACT_HISTORY__');
    expect(source).toContain('Canvas AI artifact history surface is unavailable; skipping optional legacy history panel checks.');
  });

  it('keeps the canvas AI artifact process in display verification order', () => {
    const source = readRegressionScript();
    const processStart = source.indexOf('Canvas AI artifact history process');

    expect(processStart).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('wait_for_canvas_route_to_settle_before_ai_artifact_history', processStart)).toBeLessThan(source.indexOf('wait_for_canvas_ai_artifact_history_surface', processStart));
    expect(source.indexOf('wait_for_canvas_ai_artifact_history_surface', processStart)).toBeLessThan(source.indexOf('seed_canvas_ai_artifact_history', processStart));
    expect(source.indexOf('seed_canvas_ai_artifact_history', processStart)).toBeLessThan(source.indexOf('wait_for_canvas_ai_artifact_history_surface_after_seed', processStart));
    expect(source.indexOf('wait_for_canvas_ai_artifact_history_surface_after_seed', processStart)).toBeLessThan(source.indexOf('open_canvas_ai_artifact_history', processStart));
    expect(source.indexOf('open_canvas_ai_artifact_history', processStart)).toBeLessThan(source.indexOf('verify_canvas_ai_artifact_history_order_status', processStart));
    expect(source.indexOf('verify_canvas_ai_artifact_history_order_status', processStart)).toBeLessThan(source.indexOf('verify_canvas_ai_artifact_filter_and_insert_action', processStart));
    expect(source.indexOf('verify_canvas_ai_artifact_filter_and_insert_action', processStart)).toBeLessThan(source.indexOf('verify_canvas_ai_artifact_success_type_filters', processStart));
    expect(source.indexOf('verify_canvas_ai_artifact_success_type_filters', processStart)).toBeLessThan(source.indexOf('cleanup_canvas_ai_artifact_history_e2e_records', processStart));
  });

  it('switches the active project before Midscene attaches to the browser page', () => {
    const source = readRegressionScript();
    const runner = readRegressionRunner();

    expect(source).not.toContain('switch_active_project_for_regression');
    expect(source).not.toContain("fetch('/api/projects/active'");
    expect(runner).toContain('async function ensureActiveProject');
    expect(runner.indexOf('await ensureActiveProject')).toBeLessThan(runner.indexOf('chrome = await launchChromeForCdp'));
  });

  it('covers the P0 project setup and prototype creation frontend journeys', () => {
    const source = readRegressionScript();

    expect(source).toContain('Project setup P0 surface');
    expect(source).toContain('verify_project_setup_p0_controls');
    expect(source).toContain('verify_project_setup_api_contract_from_frontend');
    expect(source).toContain('Prototype creation P0 surface');
    expect(source).toContain('open_create_prototype_dialog_from_sidebar');
    expect(source).toContain('create_placeholder_prototype_from_frontend');
    expect(source).toContain('verify_created_placeholder_resource_visible');
    expect(source).toContain('切换项目');
    expect(source).toContain('项目设置');
    expect(source).toContain('/api/projects/make/folder-name-suggestion');
    expect(source).toContain('导入原型');
    expect(source).toContain('新建原型');
  });

  it('runs P0 creation checks after the baseline navigation surfaces are ready', () => {
    const source = readRegressionScript();

    expect(source.indexOf('Project setup P0 surface')).toBeGreaterThan(source.indexOf('Project placeholder surface'));
    expect(source.indexOf('Prototype creation P0 surface')).toBeGreaterThan(source.indexOf('Project setup P0 surface'));
    expect(source.indexOf('Prototype creation P0 surface')).toBeLessThan(source.indexOf('ACP runtime unavailable contract'));
  });

  it('covers deterministic prototype comment AI execution through Make APIs', () => {
    const source = readRegressionScript();
    const runner = readRegressionRunner();

    expect(source).toContain('Prototype comment AI execution smoke');
    expect(source).toContain('comment_ai_execution_smoke');
    expect(source).toContain('/api/prototype-comments');
    expect(source).toContain('/api/ai/runs');
    expect(source).toContain('/__axhub-mock-acp/requests');
    expect(source).toContain('Midscene deterministic comment text for AI execution');
    expect(source).toContain('verify_comment_ai_execution_reached_mock_acp');
    expect(source).toContain('run.completed');
    expect(source).toContain('expectedProvider');
    expect(source).toContain('Midscene deterministic comment AI smoke completed');
    expect(source).toContain('readSseResponse');
    expect(source).toContain('commentCount: saved.document.comments.length');
    expect(source.indexOf('Prototype comment AI execution smoke')).toBeGreaterThan(source.indexOf('Canvas assistant active canvas write'));
    expect(source.indexOf('Prototype comment AI execution smoke')).toBeLessThan(source.indexOf('Sidebar navigation and preview deep link'));

    expect(runner).toContain('async function startMockAcpRunServer');
    expect(runner).toContain("requestUrl.pathname === '/__axhub-mock-acp/requests'");
    expect(runner).toContain('async function configureMockAcpForRegression');
    expect(runner).toContain('AXHUB_MAKE_E2E_PROMPT_PROVIDER');
    expect(runner).toContain('REGRESSION_PROMPT_PROVIDERS');
    expect(runner).toContain('/api/config');
    expect(runner).toContain('AXHUB_MAKE_E2E_MOCK_ACP_API_BASE_URL');
    expect(runner).toContain('AXHUB_MAKE_E2E_MOCK_ACP_WEB_BASE_URL');
  });

  it('covers AI active canvas writes instead of artifact postMessage queries', () => {
    const source = readRegressionScript();
    const runner = readRegressionRunner();

    expect(source).toContain('Canvas assistant active canvas write');
    expect(source).toContain('open_canvas_start_ai_composer_for_active_canvas_write');
    expect(source).toContain('submit_canvas_start_ai_prompt_for_active_canvas_write');
    expect(source).toContain('write_active_canvas_artifacts_for_realtime_flow');
    expect(source).not.toContain("document.dispatchEvent(new CustomEvent('axhub:insertAiGeneration'");
    expect(source).toContain('window.__AXHUB_E2E_REALTIME_PROMPT_TEXT__');
    expect(source).toContain('window.__AXHUB_E2E_REALTIME_EXPECTED_ARTIFACTS__');
    expect(source).toContain('data-axhub-canvas-start-ai-launcher');
    expect(source).toContain('data-axhub-canvas-start-scene-switcher');
    expect(source).toContain('textarea[aria-label="画布 AI 输入"]');
    expect(source).toContain('button[aria-label="发送"]');
    expect(source).not.toContain("element.customData?.type === 'axhub-ai-generation'");
    expect(source).toContain("new URL('/api/canvas/resources/' + encodeCanvasApiPath(canvasName), window.location.origin)");
    expect(source).toContain("await fetch(canvasUrl, { method: 'PUT'");
    expect(source).toContain('const api = window.__AXHUB_EXCALIDRAW_API__;');
    expect(source).toContain('api.updateScene({');
    expect(source).toContain('elements: persistedElements,');
    expect(source).toContain('activeCanvasSceneUpdated: Boolean(api?.updateScene)');
    expect(source).toContain("match.element.generatedBy === 'axhub-ai-generation'");
    expect(source).toContain("kind: 'prototype'");
    expect(source).toContain("kind: 'image'");
    expect(source).toContain("kind: 'drawio'");
    expect(source).toContain("kind: 'document'");
    expect(source).toContain("previewKind: 'web'");
    expect(source).toContain("previewKind: 'image'");
    expect(source).toContain("previewKind: 'drawio'");
    expect(source).toContain("previewKind: 'doc'");
    expect(source).toContain('E2E 实时原型产物');
    expect(source).toContain('E2E 实时图片产物');
    expect(source).toContain('E2E 实时 Drawio 产物');
    expect(source).toContain('E2E 实时文档产物');
    expect(source).toContain('verify_active_canvas_write_on_canvas');
    expect(source).toContain('cleanup_realtime_assistant_artifact_canvas_state');
    expect(source).not.toContain('mock.acp.emitArtifactsChanged');
    expect(source).not.toContain('acp.artifacts.get');
    expect(source).not.toContain('acp.query.result');
    expect(source).not.toContain('thread.idle');
    expect(source).not.toContain('acp.messages.changed');
    expect(source).toContain('window.__AXHUB_EXCALIDRAW_API__?.getSceneElements');
    expect(source).toContain("candidate.customData?.sourceArtifactId === expectedSourceArtifactId");
    expect(source).toContain("match.element.aiArtifactKind === match.artifact.kind");
    expect(source).toContain('Active canvas write');
    expect(source).toContain('AI actively writes canvas.excalidraw');
    expect(source).toContain('prototype, image, drawio, and document artifacts');

    expect(runner).not.toContain('const buildRealtimeAssistantArtifacts = (runId) => [');
    expect(runner).not.toContain("message.type === 'acp.chat.submit'");
    expect(runner).not.toContain("type: 'acp.chat.result'");
    expect(runner).not.toContain('const artifactIdMatch = text.match');
    expect(runner).not.toContain('const recognizedRunId = artifactIdMatch?.[1] ||');
    expect(runner).not.toContain('textPreview: text.slice(0, 180)');
    expect(runner).toContain("message.type === 'acp.host.ready'");
    expect(runner).toContain("type: 'acp.ui.ready'");
    expect(runner).not.toContain("postThreadEvent(event, 'thread.idle'");
    expect(runner).not.toContain("message.type === 'acp.artifacts.get'");
    expect(runner).not.toContain("type: 'acp.query.result'");
    expect(runner).not.toContain("kind: 'artifacts'");
    expect(runner).not.toContain("type: 'acp.messages.changed'");
    expect(runner).not.toContain("message.type === 'mock.acp.emitArtifactsChanged'");
  });

  it('defers browser navigations until after Midscene javascript steps return', () => {
    const source = readRegressionScript();

    expect(source).toContain('scheduleNavigation(url.toString())');
    expect(source).not.toContain('window.location.href = url.toString();');
    expect(source).not.toContain('window.location.replace(url.toString());');
  });

  it('polls for canvas deep-link readiness instead of relying on one fixed bootstrap sleep', () => {
    const source = readRegressionScript();

    const bootstrapStart = source.indexOf('Bootstrap canvas deep link');
    const artifactStart = source.indexOf('Canvas assistant active canvas write');
    const bootstrapSection = source.slice(bootstrapStart, artifactStart);

    expect(bootstrapSection).toContain('const deadline = Date.now() + 75000');
    expect(bootstrapSection).toContain('await sleep(1000)');
    expect(bootstrapSection).toContain('textSample: text.slice(0, 400)');
    expect(bootstrapSection).not.toContain('- sleep: 20000');
  });

  it('serves named ACP SSE events from the mock server so AI runs can complete deterministically', () => {
    const runner = readRegressionRunner();

    expect(runner).toContain('function sseEvent(event, chunk)');
    expect(runner).toContain('async function writeMockAcpSseEvent');
    expect(runner).toContain("await writeMockAcpSseEvent(res, 'text-delta'");
    expect(runner).toContain("await writeMockAcpSseEvent(res, 'finish'");
    expect(runner).toContain("'cache-control': 'no-cache, no-transform'");
    expect(runner).toContain("'connection': 'keep-alive'");
    expect(runner).toContain('res.flushHeaders?.()');
    expect(runner).not.toContain('res.write(sseJson({');
  });

  it('verifies the project-scoped mock ACP config before running Midscene AI checks', () => {
    const source = readRegressionScript();
    const runner = readRegressionRunner();

    expect(source).toContain("projectId: '${AXHUB_MAKE_E2E_PROJECT_ID}',");
    expect(runner).toContain('async function verifyMockAcpRegressionConfig');
    expect(runner).toContain('configUrl.searchParams.set(\'projectId\', projectId)');
    expect(runner).toContain('readback?.assistant?.webBaseUrl !== mockWebBaseUrl');
    expect(runner).toContain('readback?.assistant?.apiBaseUrl !== mockApiBaseUrl');
    expect(runner.indexOf('await verifyMockAcpRegressionConfig')).toBeLessThan(runner.indexOf('await sleep(Number(runEnv.AXHUB_MAKE_E2E_CONFIG_SETTLE_MS || 10000))'));
  });

  it('keeps mock ACP ready-state iframe checks deterministic', () => {
    const source = readRegressionScript();
    const runner = readRegressionRunner();

    expect(runner).toContain('Mock ACP Host Regression');
    expect(runner).toContain("const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');");
    expect(runner).toContain("requestUrl.pathname === '/'");
    expect(runner).toContain('let runtimeConfig = { messages: [], updatedAt: new Date().toISOString() };');
    expect(runner).toContain("message.type === 'acp.runtime.configure' || message.type === 'acp.runtime.clear'");
    expect(runner).toContain("type: 'acp.runtime.result'");
    expect(runner).toContain('acp.context.replace');
    expect(runner).toContain('acp.context.add');
    expect(runner).toContain('acp.context.result');
    expect(runner).toContain("AXHUB_ACP_UI_READY: 'true'");
    expect(source).toContain('AXHUB_MAKE_E2E_MOCK_ACP_WEB_BASE_URL');
    expect(source).toContain("axhub:open-assistant-url");
    expect(source).toContain('const postContext = () => iframe.contentWindow?.postMessage(message, targetOrigin);');
    expect(source).toContain('window.setTimeout(postContext, 520)');
  });

  it('uses an isolated managed Make server unless the caller provides a base URL', () => {
    const runner = readRegressionRunner();

    expect(runner).toContain('async function resolveMakeBaseUrl');
    expect(runner).toContain('env.AXHUB_MAKE_E2E_BASE_URL || env.AXHUB_MAKE_BASE_URL');
    expect(runner).toContain('await getFreePort()');
    expect(runner).not.toContain('const baseUrl = baseEnv.AXHUB_MAKE_E2E_BASE_URL || baseEnv.AXHUB_MAKE_BASE_URL || DEFAULT_BASE_URL;');
  });
});

describe('real ACP canvas artifact regression source', () => {
  it('has a real ACP sidebar canvas artifact regression without a mock sidebar', () => {
    const runner = readRealCanvasArtifactRunner();

    expect(runner).toContain('AXHUB_ACP_UI_PROJECT_ROOT');
    expect(runner).not.toMatch(/\/Users\/[^'"\s]+\/rd\/acp-ui/u);
    expect(runner).toContain('/api/assistant/runtime?autoStart=true');
    expect(runner).toContain('iframe[title="ACP UI"]');
    expect(runner).toContain('waitForRealAcpChatRequest');
    expect(runner).toContain('waitForRealAcpCanvasActiveWrite');
    expect(runner).not.toContain('waitForRealAcpChatResult');
    expect(runner).not.toContain('waitForRealAcpArtifactQueryResult');
    expect(runner).not.toContain('fetchAcpThreadOutputArtifacts');
    expect(runner).not.toContain('queryRealAcpArtifactsFromIframe');
    expect(runner).not.toContain("type: 'acp.artifacts.get'");
    expect(runner).not.toContain("type === 'acp.query.result'");
    expect(runner).not.toContain("payload?.kind === 'thread.idle'");
    expect(runner).not.toContain('waitForRealAcpArtifactsChanged');
    expect(runner).toContain("require.resolve('@midscene/web/puppeteer'");
    expect(runner).toContain('PuppeteerAgent');
    expect(runner).toContain('REAL_ACP_VISUAL_AI_CONTEXT');
    expect(runner).toContain('AXHUB_MAKE_REAL_ACP_VISUAL_AI');
    expect(runner).toContain('resolveRealAcpVisualAiEnabled');
    expect(runner).toContain('createRealAcpVisualAgent');
    expect(runner).toContain('runRealAcpVisualStep');
    expect(runner).toContain('visualAiSteps');
    expect(runner).toContain('visualAiEnabled');
    expect(runner).toContain('visualAiAgent.aiAct(prompt');
    expect(runner).toContain('不要寻找顶部 AI 添加节点入口，也不要等待画布里出现旧 AI 生成占位节点。');
    expect(runner).toContain('visual_open_canvas_ai_composer_from_canvas_start_launcher');
    expect(runner).toContain('visual_fill_canvas_ai_composer_prompt_for_capture');
    expect(runner).toContain('visual_send_canvas_ai_composer_prompt_for_real_acp');
    expect(runner).toContain('visual_verify_canvas_has_real_acp_artifacts');
    expect(runner).toContain('不要只根据右侧聊天回复判断');
    expect(runner).toContain('openCanvasAiComposerFromCanvasStartLauncher');
    expect(runner).toContain('CANVAS_AI_LAUNCHER_SELECTOR');
    expect(runner).toContain('CANVAS_AI_COMPOSER_ROOT_SELECTOR');
    expect(runner).toContain('data-axhub-canvas-start-composer');
    expect(runner).toContain('textarea[aria-label="画布 AI 输入"]');
    expect(runner).toContain('async function waitForVisibleComposerTextarea');
    expect(runner).toContain('document.querySelectorAll(composerSelector)');
    expect(runner).toContain('textarea?.closest(composerRootSelector)');
    expect(runner).not.toContain('data-axhub-ai-generation-composer');
    expect(runner).not.toContain('data-axhub-prototype-composer');
    expect(runner).not.toContain('textarea[aria-label="AI 原型生成提示词"]');
    expect(runner).not.toContain("document.dispatchEvent(new CustomEvent('axhub:insertAiGeneration'");
    expect(runner).not.toContain('data-axhub-ai-generation-toolbar-btn');
    expect(runner).not.toContain('openCanvasAiComposerFromVisibleToolbar');
    expect(runner).not.toContain('data-axhub-ai-image-composer');
    expect(runner).not.toContain('textarea[aria-label="AI 图片生成提示词"]');
    expect(runner).toContain('buildRealAcpPrompt');
    expect(runner).toContain('文件名和路径由你根据当前项目自然选择即可');
    expect(runner).toContain('buildRequiredArtifacts');
    expect(runner).toContain('REQUIRED_ARTIFACT_KINDS');
    expect(runner).toContain('summarizeArtifactKindCoverage');
    expect(runner).toContain('scanObservedWorkspaceArtifacts');
    expect(runner).not.toContain('路径必须完全一致');
    expect(runner).not.toContain('createExpectedArtifacts');
    expect(runner).not.toContain('eventContainsExpectedArtifactPaths');
    expect(runner).not.toContain('scanExpectedWorkspaceArtifacts');
    expect(runner).not.toContain('insertCanvasAiNodeForSidebarFlow');
    expect(runner).toContain('async function startRealAcpServer');
    expect(runner).toContain('async function ensureStaticAdminBuild');
    expect(runner).toContain('AXHUB_MAKE_E2E_USE_DEV_SERVER');
    expect(runner).toContain("['run', 'admin:build']");
    expect(runner).toContain("'--admin-root'");
    expect(runner).toContain("path.join(rootDir, 'dist', 'admin')");
    expect(runner).toContain('acp-server.log');
    expect(runner).toContain('chatRequests');
    expect(runner).toContain('chatResponses');
    expect(runner).toContain('submissionStates');
    expect(runner).toContain('async function collectSubmissionState');
    expect(runner).toContain('async function recordSubmissionState');
    expect(runner).toContain('composerTextareas');
    expect(runner).toContain('sendButtons');
    expect(runner).toContain('assistantIframes');
    expect(runner).toContain('messageSurfaces');
    expect(runner).toContain('browserTargets');
    expect(runner).toContain('browserPageStates');
    expect(runner).toContain('function attachBrowserTargetDiagnostics');
    expect(runner).toContain('async function collectBrowserPageStates');
    expect(runner).toContain('pageNavigations');
    expect(runner).toContain('nodeEventLog');
    expect(runner).toContain('__AXHUB_RECORD_REAL_ACP_EVENT__');
    expect(runner).toContain('async function fetchAcpChatSessions');
    expect(runner).toContain('async function resolveActiveProjectRoot');
    expect(runner).toContain('const explicitClientRoot');
    expect(runner).toContain('clientRoot = explicitClientRoot || await resolveActiveProjectRoot');
    expect(runner).toContain("new URL('/api/projects/active', baseUrl)");
    expect(runner).toContain('workspaceArtifacts');
    expect(runner).toContain('acpSessions');
    expect(runner).toContain('diagnostics.requests.push');
    expect(runner).toContain('request.postData()');
    expect(runner).toContain('await response.text()');
    expect(runner).toContain("includes('/api/chat')");
    expect(runner).toContain("url.pathname === '/api/chat'");
    expect(runner).toContain('async function listPortListenerPids');
    expect(runner).toContain("'-sTCP:LISTEN'");
    expect(runner).toContain("'SIGKILL'");
    expect(runner).toContain('async function pollPageCondition');
    expect(runner).not.toContain('real ACP artifact query result');
    expect(runner).not.toContain('real ACP artifacts changed postMessage');
    expect(runner).toContain('real ACP canvas active write result');
    expect(runner).toContain('real ACP canvas artifact elements');
    expect(runner).toContain('waitForPersistedCanvasArtifactElements');
    expect(runner).toContain('real ACP persisted canvas artifact elements');
    expect(runner).toContain('function getCanvasResourcePathForPrototype(prototypeName)');
    expect(runner).toContain('function buildResourceCanvasApiUrl(baseUrl, resourcePath)');
    expect(runner).toContain('buildResourceCanvasApiUrl(baseUrl, canvasResourcePath)');
    expect(runner).toContain('function appendProjectIdSearchParam(url, projectId)');
    expect(runner).toContain('appendProjectIdSearchParam(url, projectId);');
    expect(runner).toContain('projectId,');
    expect(runner).toContain('persistedCanvas = await waitForPersistedCanvasArtifactElements(baseUrl, canvasPrototype, projectId, requiredKinds);');
    expect(runner).toContain("pathname.startsWith('/api/canvas')");
    expect(runner).toContain('diagnostics.canvasSaveRequests');
    expect(runner).toContain('persistedCanvas');
    expect(runner).toContain('3. 画布 composer 已通过真实可见输入填入 prompt，准备提交到右侧 ACP UI');
    expect(runner).toContain('4. composer 提交后，右侧真实 ACP UI iframe 已打开并开始真实生成');
    expect(runner).toContain('prototype');
    expect(runner).toContain('image');
    expect(runner).toContain('drawio');
    expect(runner).toContain('document');
    expect(runner).toContain("const REQUIRED_ARTIFACT_KINDS = ['prototype', 'image', 'drawio', 'document']");
    expect(runner).toContain('customData?.generatedBy ===');
    expect(runner).toContain('customData?.aiArtifact?.kind');
    expect(runner).toContain('run-real-acp-canvas-artifact-regression');
    expect(runner).not.toContain('createMockAcp');
    expect(runner).not.toContain('Mock ACP');
    expect(runner).not.toContain('mock.acp.emitArtifactsChanged');
    expect(runner).not.toContain("type: 'acp.messages.changed'");
  });

  it('keeps the real ACP canvas journey ordered from visible prompt submission to canvas artifacts', () => {
    const runner = readRealCanvasArtifactRunner();
    const realJourneyStart = runner.indexOf('const prompt = buildRealAcpPrompt');
    const placeholderBranch = runner.slice(
      runner.indexOf('if (entryMode === REAL_ACP_ENTRY_PLACEHOLDER_START)', realJourneyStart),
      runner.indexOf('} else {', runner.indexOf('if (entryMode === REAL_ACP_ENTRY_PLACEHOLDER_START)', realJourneyStart)),
    );
    const canvasBranch = runner.slice(
      runner.indexOf('} else {', runner.indexOf('if (entryMode === REAL_ACP_ENTRY_PLACEHOLDER_START)', realJourneyStart)),
      runner.indexOf('if (recoveryMode === REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION)', realJourneyStart),
    );
    const placeholderSubmit = placeholderBranch.indexOf('submitPrototypePlaceholderStartPromptWithRealUserFlow');
    const placeholderCanvasUrl = placeholderBranch.indexOf('await waitForCanvasUrlAfterPlaceholderStart(page, canvasPrototype);');
    const placeholderIframe = placeholderBranch.indexOf('await waitForRealAcpIframe(page, acpOrigin);');
    const canvasOpen = canvasBranch.indexOf('openCanvasAiComposerWithRealUserFlow');
    const canvasFill = canvasBranch.indexOf('visual_fill_canvas_ai_composer_prompt_for_capture');
    const canvasValueCheck = canvasBranch.indexOf('await waitForComposerPromptValue(page, CANVAS_AI_COMPOSER_SELECTOR, prompt);');
    const canvasSend = canvasBranch.indexOf('visual_send_canvas_ai_composer_prompt_for_real_acp');
    const canvasIframeOpened = canvasBranch.indexOf('await waitForRealAcpIframe(page, acpOrigin);');
    const chatRequest = runner.indexOf('await waitForRealAcpChatRequest(diagnostics, acpOrigin);', realJourneyStart);
    const activeWrite = runner.indexOf('activeCanvasWriteResult = await waitForRealAcpCanvasActiveWrite({', realJourneyStart);
    const canvasElements = runner.indexOf('await waitForRealAcpCanvasElements(page, requiredArtifacts);', realJourneyStart);
    const visualCanvasCheck = runner.indexOf('await verifyCanvasArtifactsWithVisualAi({', realJourneyStart);
    const persistedCanvas = runner.indexOf('persistedCanvas = await waitForPersistedCanvasArtifactElements', realJourneyStart);
    const history = runner.indexOf('history = await waitForGenerationHistory', realJourneyStart);

    expect(realJourneyStart).toBeGreaterThan(-1);
    expect(placeholderSubmit).toBeGreaterThan(-1);
    expect(placeholderCanvasUrl).toBeGreaterThan(placeholderSubmit);
    expect(placeholderIframe).toBeGreaterThan(placeholderCanvasUrl);
    expect(canvasOpen).toBeGreaterThan(-1);
    expect(canvasFill).toBeGreaterThan(canvasOpen);
    expect(canvasValueCheck).toBeGreaterThan(canvasFill);
    expect(canvasSend).toBeGreaterThan(canvasValueCheck);
    expect(canvasIframeOpened).toBeGreaterThan(canvasSend);
    expect(chatRequest).toBeGreaterThan(realJourneyStart);
    expect(activeWrite).toBeGreaterThan(chatRequest);
    expect(canvasElements).toBeGreaterThan(activeWrite);
    expect(visualCanvasCheck).toBeGreaterThan(canvasElements);
    expect(persistedCanvas).toBeGreaterThan(visualCanvasCheck);
    expect(history).toBeGreaterThan(persistedCanvas);
  });

  it('records visual evidence for each real ACP recovery and canvas artifact stage', () => {
    const runner = readRealCanvasArtifactRunner();

    expect(runner).toContain('await capture(page, frames, frameDir, \'1. 真实 Make 画布已打开，准备通过画布 AI composer 调起右侧 ACP UI\');');
    expect(runner).toContain('await capture(page, frames, frameDir, \'3. 画布 composer 已通过真实可见输入填入 prompt，准备提交到右侧 ACP UI\');');
    expect(runner).toContain('await capture(page, frames, frameDir, \'4. composer 提交后，右侧真实 ACP UI iframe 已打开并开始真实生成\');');
    expect(runner).toContain('await capture(page, frames, frameDir, \'5. 已通过真实可见输入触发右侧 ACP，并发起真实 /api/chat provider 请求\');');
    expect(runner).toContain('await capture(page, frames, frameDir, \'6. AI 主动写入 canvas.excalidraw 后，prototype / image / drawio / document 四类真实产物均已落入画布\');');
    expect(runner).not.toContain('await capture(page, frames, frameDir, \'6. 真实 ACP UI 已从 provider diff 派发 acp.messages.changed\');');
    expect(runner).not.toContain('查询桥');
    expect(runner).toContain('await capture(page, frames, frameDir, \'7. canvas.excalidraw 已持久化四类真实产物元素，重开画布仍可显示\');');
    expect(runner).toContain('await capture(page, frames, frameDir, \'8. 生成记录已写入当前资源画布，四类 artifact 可被历史接口读取\');');
    expect(runner).toContain('await capture(page, frames, frameDir, `${label}：刷新前现场`);');
    expect(runner).toContain('await capture(page, frames, frameDir, `${label}：刷新后画布和真实 ACP iframe 已恢复`);');
    expect(runner).toContain('promptPreview: String(prompt || \'\').slice(0, 1200),');
    expect(runner).toContain('diagnostics.visualAiSteps.push({');
    expect(runner).toContain('<img id="frame" alt="recorded frame"');
  });

  it('can run real ACP canvas artifact recovery checks after refresh', () => {
    const runner = readRealCanvasArtifactRunner();
    const packageJson = readMakePackageJson();

    expect(runner).toContain('AXHUB_MAKE_REAL_ACP_RECOVERY_MODE');
    expect(runner).toContain("const REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION = 'refresh-during-generation';");
    expect(runner).toContain("const REAL_ACP_RECOVERY_REFRESH_AFTER_CANVAS_WRITE = 'refresh-after-canvas-write';");
    expect(runner).toContain('function resolveRealAcpRecoveryMode');
    expect(runner).toContain('async function refreshCanvasPageForRecovery');
    expect(runner).toContain('function countRealAcpPostMessageTypes');
    expect(runner).toContain('async function waitForRealAcpRefreshPostMessageAcks');
    expect(runner).toContain("const expectedTypes = ['acp.ui.ready', 'acp.runtime.result', 'acp.context.result'];");
    expect(runner).toContain('const deadline = Date.now() + 20_000;');
    expect(runner).toContain('throw new Error(`Timed out waiting for real ACP refresh postMessage ready/runtime/context acknowledgements');
    expect(runner).toContain('page.reload({ waitUntil: \'domcontentloaded\'');
    expect(runner).toContain('await ensureBrowserEventRecorderInstalled(page);');
    expect(runner).toContain('await waitForCanvasReady(page);');
    expect(runner).toContain('await waitForRealAcpIframe(page, acpOrigin);');
    expect(runner).toContain('await waitForRealAcpRefreshPostMessageAcks(page, diagnostics, refreshStartedAt);');
    expect(runner).toContain('recoveryMode === REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION');
    expect(runner).toContain('recoveryMode === REAL_ACP_RECOVERY_REFRESH_AFTER_CANVAS_WRITE');
    expect(runner).toContain('visual_verify_refresh_during_generation_recovery');
    expect(runner).toContain('visual_verify_refresh_after_canvas_write_recovery');
    expect(packageJson).toContain('test:frontend:real-acp-canvas-artifact:refresh-running');
    expect(packageJson).toContain('--recovery=refresh-during-generation');
    expect(packageJson).toContain('test:frontend:real-acp-canvas-artifact:refresh-after-canvas-write');
    expect(packageJson).toContain('--recovery=refresh-after-canvas-write');
    expect(packageJson).toContain('test:frontend:real-acp-canvas-artifact:placeholder-refresh-running');
    expect(packageJson).toContain('--entry=placeholder-start --recovery=refresh-during-generation');
    expect(packageJson).toContain('test:frontend:real-acp-canvas-artifact:placeholder-refresh-after-canvas-write');
    expect(packageJson).toContain('--entry=placeholder-start --recovery=refresh-after-canvas-write');
  });

  it('can run the real ACP canvas artifact regression from the prototype placeholder start page', () => {
    const runner = readRealCanvasArtifactRunner();
    const packageJson = readMakePackageJson();

    expect(runner).toContain('AXHUB_MAKE_REAL_ACP_ENTRY');
    expect(runner).toContain("const REAL_ACP_ENTRY_CANVAS_START = 'canvas-start';");
    expect(runner).toContain("const REAL_ACP_ENTRY_PLACEHOLDER_START = 'placeholder-start';");
    expect(runner).toContain('function resolveRealAcpEntryMode');
    expect(runner).toContain('async function submitPrototypePlaceholderStartPrompt');
    expect(runner).toContain('submitPrototypePlaceholderStartPromptWithRealUserFlow');
    expect(runner).toContain('visual_submit_prototype_placeholder_start_prompt');
    expect(runner).toContain('textarea[aria-label="原型起始页 AI 输入"]');
    expect(runner).toContain('await submitPrototypePlaceholderStartPromptWithRealUserFlow({');
    expect(runner).toContain('await waitForCanvasUrlAfterPlaceholderStart(page, canvasPrototype);');
    expect(runner).toContain("entryMode === REAL_ACP_ENTRY_PLACEHOLDER_START");
    expect(runner).toContain("source: 'placeholder-start'");
    expect(runner).toContain('prototype placeholder start page');
    expect(runner).toContain('entryUrl');
    expect(runner).toContain('entryMode');
    expect(packageJson).toContain('test:frontend:real-acp-canvas-artifact:placeholder');
    const placeholderBranch = runner.slice(
      runner.indexOf('if (entryMode === REAL_ACP_ENTRY_PLACEHOLDER_START)'),
      runner.indexOf('await waitForRealAcpChatResult'),
    );
    expect(placeholderBranch).not.toContain("document.dispatchEvent(new CustomEvent('axhub:insertAiGeneration'");
  });
});
