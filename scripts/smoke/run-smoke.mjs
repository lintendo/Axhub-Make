#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { startMakeServer } from '../../src/server/index.ts';

import {
  JOURNEY_DEFINITIONS,
  PACKAGE_ROOT,
  REPO_ROOT,
  assertOk,
  buildProjectApiUrl,
  createDefaultCanvasData,
  createEmbeddableElement,
  createImageElement,
  createSmokeOptions,
  createSmokeProject,
  createSvgDataUrl,
  createTinyPngDataUrl,
  escapeXml,
  fetchJson,
  listen,
  readJson,
  startMockAcpServer,
  writeJson,
  writeText,
  writeReport,
} from './smoke-core.mjs';

const options = createSmokeOptions({ cwd: PACKAGE_ROOT });
const selectedJourneys = options.requestedJourneyIds.length
  ? JOURNEY_DEFINITIONS.filter((journey) => options.requestedJourneyIds.includes(journey.id))
  : JOURNEY_DEFINITIONS;
const unknownJourneyIds = options.requestedJourneyIds.filter((id) => !JOURNEY_DEFINITIONS.some((journey) => journey.id === id));
if (unknownJourneyIds.length) {
  throw new Error(`Unknown smoke journey id: ${unknownJourneyIds.join(', ')}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-smoke-'));
const registryHome = path.join(tempRoot, 'home');
const mockAcp = await startMockAcpServer();
const mockS3 = await startMockS3Server();
const project = createSmokeProject({
  root: path.join(tempRoot, 'client'),
  registryHome,
  assistantOrigin: mockAcp.origin,
});
let makeServer;
const report = {
  startedAt: new Date().toISOString(),
  realAi: options.realAi,
  packageRoot: PACKAGE_ROOT,
  projectRoot: project.projectRoot,
  journeys: [],
};

function encodeResourceCanvasApiPath(resourcePath) {
  return String(resourcePath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function getSmokeCanvasResourcePath(prototypeName) {
  const safeName = String(prototypeName || 'smoke')
    .replace(/[^a-z0-9-]+/giu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase() || 'smoke';
  return `smoke/${safeName}.excalidraw`;
}

try {
  makeServer = await startMakeServer({
    projectRoot: project.projectRoot,
    host: '127.0.0.1',
    port: 0,
    adminRoot: path.join(PACKAGE_ROOT, 'missing-admin-for-smoke'),
    registryPath: project.registryPath,
    serverInfoHomeDir: registryHome,
  });
  report.origin = makeServer.origin;

  const context = {
    origin: makeServer.origin,
    projectId: 'smoke-client',
    projectRoot: project.projectRoot,
    mockAcp,
    mockS3,
    tempRoot,
    registryHome,
    createdPrototype: null,
  };

  for (const journey of selectedJourneys) {
    const startedAt = Date.now();
    const entry = {
      id: journey.id,
      title: journey.title,
      status: 'running',
      steps: [],
    };
    report.journeys.push(entry);
    console.log(`\n[smoke] ${journey.title}`);
    try {
      await runJourney(journey.id, context, entry);
      entry.status = 'passed';
      entry.durationMs = Date.now() - startedAt;
      console.log(`[smoke] PASS ${journey.id}`);
    } catch (error) {
      entry.status = 'failed';
      entry.durationMs = Date.now() - startedAt;
      entry.error = {
        message: error?.message || String(error),
        details: error?.details,
        stack: error?.stack,
      };
      console.error(`[smoke] FAIL ${journey.id}: ${entry.error.message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  report.finishedAt = new Date().toISOString();
  const reportPath = await writeReport(options, report);
  console.log(`\n[smoke] Report: ${path.relative(REPO_ROOT, reportPath)}`);
  if (makeServer) {
    await makeServer.close();
  }
  await mockAcp.close();
  await mockS3.close();
  if (!options.keepTemp) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`[smoke] Kept temp root: ${tempRoot}`);
  }
}

async function runJourney(id, context, entry) {
  if (id === 'assistant-chat') {
    await runAssistantChatJourney(context, entry);
    return;
  }
  if (id === 'create-prototype-and-image') {
    await runCreatePrototypeAndImageJourney(context, entry);
    return;
  }
  if (id === 'canvas-ai-generation') {
    await runCanvasAiGenerationJourney(context, entry);
    return;
  }
  if (id === 'comments-and-execution') {
    await runCommentsAndExecutionJourney(context, entry);
    return;
  }
  if (id === 'make-project-registration') {
    await runMakeProjectRegistrationJourney(context, entry);
    return;
  }
  if (id === 'export-and-cloud-publish') {
    await runExportAndCloudPublishJourney(context, entry);
    return;
  }
  if (id === 'library-imports') {
    await runLibraryImportsJourney(context, entry);
    return;
  }
  if (id === 'resource-crud') {
    await runResourceCrudJourney(context, entry);
    return;
  }
  if (id === 'git-versioning') {
    await runGitVersioningJourney(context, entry);
    return;
  }
  if (id === 'review-and-design-decisions') {
    await runReviewAndDesignDecisionsJourney(context, entry);
    return;
  }
  throw new Error(`Unhandled journey: ${id}`);
}

function addStep(entry, name, details = {}) {
  entry.steps.push({
    name,
    at: new Date().toISOString(),
    ...details,
  });
}

async function runAssistantChatJourney(context, entry) {
  const runtime = await fetchJson(buildProjectApiUrl(context.origin, '/api/assistant/runtime?autoStart=false', context.projectId));
  addStep(entry, 'assistant runtime is ready', {
    health: runtime.body.health,
    webBaseUrl: runtime.body.webBaseUrl,
  });
  assertOk(runtime.body.health?.status === 'ready', 'AI 助手 runtime 未就绪', runtime.body);
  assertOk(runtime.body.webBaseUrl === context.mockAcp.origin, 'AI 助手没有使用 smoke ACP 服务', runtime.body);

  const chat = await postMockAcpChat(context.mockAcp.origin, {
    id: 'smoke-assistant-chat',
    threadId: 'smoke-assistant-chat',
    provider: 'codex',
    messages: [
      {
        id: 'smoke-user',
        role: 'user',
        parts: [{ type: 'text', text: '请用一句话回复 smoke 对话已连接。' }],
      },
    ],
  });
  addStep(entry, 'assistant chat returns text', { events: chat.events });
  assertOk(chat.text.includes('Mock ACP completed'), 'AI 助手对话没有返回 mock 文本', chat);
}

async function runCreatePrototypeAndImageJourney(context, entry) {
  const created = await fetchJson(buildProjectApiUrl(context.origin, '/api/prototypes/create-placeholder', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  context.createdPrototype = created.body;
  addStep(entry, 'placeholder prototype is created', created.body);
  assertOk(created.status === 201, '新建原型返回状态不正确', created.body);
  assertOk(created.body?.name, '新建原型缺少 name', created.body);

  const prototypeDir = path.join(context.projectRoot, 'src/prototypes', created.body.name);
  assertOk(fs.existsSync(path.join(prototypeDir, 'index.tsx')), '新建原型缺少 index.tsx');
  assertOk(!fs.existsSync(path.join(prototypeDir, 'canvas.excalidraw')), '新建原型不应再创建 canvas.excalidraw');

  const metadata = readJson(path.join(context.projectRoot, '.axhub/make/project.json'));
  assertOk(
    metadata.resources.prototypes.some((item) => item.name === created.body.name && item.placeholder === true),
    '项目 metadata 未记录新建原型',
    metadata.resources.prototypes,
  );

  const imageRun = await postAiRun(context, {
    scene: 'image',
    prompt: '生成一张 smoke 测试图片 image',
    targetPath: `prototypes/${created.body.name}`,
    taskId: 'smoke-image-task',
    runId: 'smoke-image-run',
    conversationId: 'smoke-image-conversation',
  });
  addStep(entry, 'AI image run emits image artifact', {
    eventTypes: imageRun.events.map((event) => event.event),
    artifacts: imageRun.artifacts.map(summarizeArtifact),
  });
  assertOk(
    imageRun.artifacts.some((artifact) => artifact.kind === 'image' && artifact.dataUrl),
    'AI 图片创建流程没有返回 image artifact',
    imageRun,
  );
}

async function runCanvasAiGenerationJourney(context, entry) {
  const prototype = ensurePrototype(context);
  const canvasResourcePath = getSmokeCanvasResourcePath(prototype.name);
  const canvasApiPath = encodeResourceCanvasApiPath(canvasResourcePath);

  const canvas = createDefaultCanvasData();
  canvas.elements.push(
    createEmbeddableElement({
      id: 'smoke-prototype-embed',
      x: 40,
      y: 40,
      width: 720,
      height: 450,
      link: prototype.clientUrl,
      customData: {
        title: prototype.displayName || prototype.name,
        resourceType: 'prototype',
        resourceId: prototype.name,
        generatedBy: 'axhub-smoke',
      },
    }),
    createImageElement({
      id: 'smoke-image',
      fileId: 'smoke-image-file',
      x: 800,
      y: 40,
      width: 320,
      height: 180,
      customData: {
        title: '普通图片',
        previewKind: 'image',
      },
    }),
    createImageElement({
      id: 'smoke-drawio',
      fileId: 'smoke-drawio-file',
      x: 40,
      y: 560,
      width: 360,
      height: 260,
      customData: {
        type: 'axhub-drawio',
        title: 'Drawio 图表',
        previewKind: 'drawio',
      },
    }),
  );
  canvas.files['smoke-image-file'] = {
    id: 'smoke-image-file',
    mimeType: 'image/png',
    dataURL: createTinyPngDataUrl(),
    created: Date.now(),
    lastRetrieved: Date.now(),
  };
  canvas.files['smoke-drawio-file'] = {
    id: 'smoke-drawio-file',
    mimeType: 'image/svg+xml',
    dataURL: createSvgDataUrl('Drawio smoke'),
    created: Date.now(),
    lastRetrieved: Date.now(),
  };

  const put = await fetchJson(buildProjectApiUrl(context.origin, `/api/canvas/resources/${canvasApiPath}`, context.projectId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: canvas }),
  });
  addStep(entry, 'canvas stores prototype image and drawio elements', put.body);
  assertOk(put.body.success === true, '画布保存失败', put.body);

  const saved = await fetchJson(buildProjectApiUrl(context.origin, `/api/canvas/resources/${canvasApiPath}`, context.projectId));
  const elementTypes = saved.body.elements.map((element) => element.customData?.type || element.type);
  addStep(entry, 'canvas readback contains expected generated nodes', { elementTypes });
  assertOk(elementTypes.includes('embeddable'), '画布读回缺少原型节点', saved.body);
  assertOk(elementTypes.includes('image'), '画布读回缺少普通图片节点', saved.body);
  assertOk(elementTypes.includes('axhub-drawio'), '画布读回缺少 Drawio 节点', saved.body);

  const prototypeSpecPath = path.join(
    context.projectRoot,
    'src/prototypes',
    prototype.name,
    '.spec/spec.md',
  );
  if (!fs.existsSync(prototypeSpecPath)) {
    writeText(prototypeSpecPath, '# Smoke Prototype Spec\n\n用于验证画布 AI 生成链路。\n');
  }
  addStep(entry, 'prototype main spec is ready', {
    path: path.relative(context.projectRoot, prototypeSpecPath).split(path.sep).join('/'),
  });

  const aiRun = await postAiRun(context, {
    scene: 'prototype',
    prompt: '在画布中生成原型和 drawio 图表',
    targetPath: `prototypes/${prototype.name}`,
    canvasName: `resources/${canvasResourcePath}`,
    generatorElementId: 'smoke-prototype-embed',
    taskId: 'smoke-canvas-task',
    runId: 'smoke-canvas-run',
    conversationId: 'smoke-canvas-conversation',
  });
  addStep(entry, 'canvas AI run emits artifact', {
    eventTypes: aiRun.events.map((event) => event.event),
    artifacts: aiRun.artifacts.map(summarizeArtifact),
  });
  assertOk(aiRun.artifacts.length > 0, '画布 AI 生成没有返回 artifact', aiRun);
}

async function runCommentsAndExecutionJourney(context, entry) {
  const prototype = ensurePrototype(context);
  const document = {
    schemaVersion: 2,
    kind: 'prototype-edit-comments',
    resource: {
      id: prototype.name,
      targetPath: `prototypes/${prototype.name}`,
    },
    comments: [
      {
        id: 'comment-hero-title',
        label: '标题',
        comment: '把标题改成更明确的测试文案',
        state: 'idle',
        createdAt: new Date().toISOString(),
      },
    ],
    images: [
      {
        id: 'hero-image',
        mimeType: 'image/png',
        data: createTinyPngDataUrl(),
      },
    ],
  };
  const saved = await fetchJson(buildProjectApiUrl(context.origin, `/api/prototype-comments?targetPath=prototypes/${encodeURIComponent(prototype.name)}`, context.projectId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ document }),
  });
  addStep(entry, 'prototype comments are saved', {
    path: saved.body.path,
    commentCount: saved.body.document?.comments?.length,
    imageCount: saved.body.document?.images?.length,
  });
  assertOk(saved.body.ok === true, '批注保存失败', saved.body);
  assertOk(saved.body.document.images[0].assetPath, '批注图片没有落盘为 asset', saved.body.document.images);

  const hydrated = await fetchJson(buildProjectApiUrl(context.origin, `/api/prototype-comments?targetPath=prototypes/${encodeURIComponent(prototype.name)}&hydrateImages=1`, context.projectId));
  addStep(entry, 'prototype comments readback hydrates image assets', {
    exists: hydrated.body.exists,
    imageHasData: Boolean(hydrated.body.document?.images?.[0]?.data),
  });
  assertOk(hydrated.body.exists === true, '批注读回失败', hydrated.body);
  assertOk(Boolean(hydrated.body.document?.images?.[0]?.data), '批注图片 hydrate 失败', hydrated.body.document?.images);

  const execution = await postAiRun(context, {
    scene: 'prototype',
    prompt: '根据原型批注执行修改：把标题改成更明确的测试文案',
    targetPath: `prototypes/${prototype.name}`,
    context: {
      comments: hydrated.body.document.comments,
    },
    taskId: 'smoke-comment-task',
    runId: 'smoke-comment-run',
    conversationId: 'smoke-comment-conversation',
  });
  addStep(entry, 'comment execution AI run completes', {
    eventTypes: execution.events.map((event) => event.event),
    artifacts: execution.artifacts.map(summarizeArtifact),
  });
  assertOk(
    execution.events.some((event) => event.event === 'run.completed'),
    '批注执行没有完成 AI run',
    execution,
  );
}

async function runMakeProjectRegistrationJourney(context, entry) {
  const importedRoot = createMarkerBackedMakeClientProject({
    root: path.join(context.tempRoot, 'imported-client'),
    id: 'smoke-imported-client',
    name: 'Smoke Imported Client',
    assistantOrigin: context.mockAcp.origin,
  });
  const register = await fetchJson(`${context.origin}/api/projects/make/register-existing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: importedRoot }),
  });
  addStep(entry, 'marker-backed Make client project is registered', {
    status: register.status,
    projectId: register.body.project?.id,
  });
  assertOk(register.status === 201 || register.status === 200, '导入已有 Make 项目状态不正确', register.body);
  assertOk(register.body.project?.id === 'smoke-imported-client', '导入项目 id 不正确', register.body);

  const activated = await fetchJson(`${context.origin}/api/projects/active`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: 'smoke-imported-client' }),
  });
  addStep(entry, 'registered project can become active', {
    activeProjectId: activated.body.activeProject?.id,
  });
  assertOk(activated.body.activeProject?.id === 'smoke-imported-client', '导入项目无法激活', activated.body);

  const resources = await fetchJson(`${context.origin}/api/projects/smoke-imported-client/resources`);
  assertOk(
    resources.body.resources?.prototypes?.some((item) => item.name === 'imported-home'),
    '导入项目资源未读回',
    resources.body,
  );

  const status = await fetchJson(`${context.origin}/api/projects/smoke-imported-client/dev/status`);
  addStep(entry, 'dev status reports a Make client without starting it', {
    makeClient: status.body.makeClient,
    running: status.body.running,
  });
  assertOk(status.body.makeClient === true, '导入项目未识别为 Make client', status.body);
  assertOk(status.body.running === false, 'dev/status 不应隐式启动 runtime', status.body);

  const suggestion = await fetchJson(`${context.origin}/api/projects/make/folder-name-suggestion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentRoot: context.tempRoot, projectName: '烟雾 项目' }),
  });
  addStep(entry, 'folder name suggestion remains ASCII and available', suggestion.body);
  assertOk(/^[a-z0-9][a-z0-9-]*$/u.test(suggestion.body.folderName), '文件夹建议不是安全 ASCII id', suggestion.body);

  await fetchJson(`${context.origin}/api/projects/active`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: 'smoke-client' }),
  });
}

async function runExportAndCloudPublishJourney(context, entry) {
  const prototype = await ensureExportablePrototype(context);
  const exportResponse = await fetch(buildProjectApiUrl(context.origin, `/api/export-html?path=${encodeURIComponent(`prototypes/${prototype.name}`)}&includeSource=1`, context.projectId));
  const exportBlob = await exportResponse.arrayBuffer();
  addStep(entry, 'HTML export archive downloads with source option', {
    status: exportResponse.status,
    contentType: exportResponse.headers.get('content-type'),
    byteLength: exportBlob.byteLength,
  });
  assertOk(exportResponse.ok, 'HTML 导出请求失败', { status: exportResponse.status, text: Buffer.from(exportBlob).toString('utf8').slice(0, 300) });
  assertOk(exportBlob.byteLength > 100, 'HTML 导出包为空或过小', { byteLength: exportBlob.byteLength });

  const config = await fetchJson(buildProjectApiUrl(context.origin, '/api/cloud-publishing/config', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      publishSettings: { includeSource: true },
      s3: {
        accessKeyId: 'SMOKE_ACCESS_KEY',
        secretAccessKey: 'smoke-secret',
        region: 'us-east-1',
        bucket: 'smoke-sites',
        prefix: 'smoke-home',
        baseUrl: `${context.mockS3.origin}/cdn/`,
        endpoint: context.mockS3.origin,
      },
    }),
  });
  addStep(entry, 'cloud publishing config saves S3-compatible settings', {
    configured: config.body.targets?.s3?.configured,
    includeSource: config.body.targets?.publishSettings?.includeSource,
  });
  assertOk(config.body.targets?.s3?.configured === true, 'S3 发布配置未保存为可用', config.body);

  context.mockS3.reset();
  const publish = await fetchJson(buildProjectApiUrl(context.origin, '/api/cloud-publishing/publish', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: 's3', path: `prototypes/${prototype.name}` }),
  });
  addStep(entry, 'S3-compatible cloud publish uploads static files', {
    url: publish.body.url,
    uploadedFiles: context.mockS3.requests.length,
  });
  assertOk(publish.body.url === `${context.mockS3.origin}/cdn/smoke-home/index.html`, '发布 URL 不正确', publish.body);
  assertOk(context.mockS3.requests.some((request) => request.path.endsWith('/smoke-home/index.html')), 'S3 mock 未收到 index.html', context.mockS3.requests);
  assertOk(context.mockS3.requests.some((request) => request.path.includes('/smoke-home/source/')), 'includeSource 未上传源码文件', context.mockS3.requests);

  const latest = await fetchJson(buildProjectApiUrl(context.origin, `/api/cloud-publishing/latest?path=${encodeURIComponent(`prototypes/${prototype.name}`)}`, context.projectId));
  addStep(entry, 'latest cloud publish URL is recorded per resource', latest.body.targets);
  assertOk(latest.body.targets?.s3?.url === publish.body.url, 'latest 未读回刚发布的 S3 URL', latest.body);
  assertOk(latest.body.targets?.s3?.path === `src/prototypes/${prototype.name}`, 'latest 未记录规范化资源路径', latest.body);
}

async function runLibraryImportsJourney(context, entry) {
  const restoreFetch = installLibraryFetchMock(context.tempRoot);
  try {
    const templates = await fetchJson(buildProjectApiUrl(context.origin, '/api/template-library', context.projectId));
    addStep(entry, 'template library lists remote fixture', {
      count: templates.body.templates?.length,
      first: templates.body.templates?.[0]?.id,
    });
    assertOk(templates.body.templates?.some((item) => item.id === 'smoke-template'), '模板库 fixture 未列出', templates.body);

    const importedTemplate = await fetchJson(buildProjectApiUrl(context.origin, '/api/template-library/import', context.projectId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId: 'smoke-template' }),
    });
    addStep(entry, 'template library imports a prototype', importedTemplate.body);
    assertOk(importedTemplate.body.success === true, '模板导入失败', importedTemplate.body);
    assertOk(fs.existsSync(path.join(context.projectRoot, 'src/prototypes/smoke-template/index.tsx')), '模板原型文件未落盘');

    const themes = await fetchJson(buildProjectApiUrl(context.origin, '/api/theme-library', context.projectId));
    const designSystem = themes.body.designSystems?.find((item) => item.id === 'smoke-design') || themes.body.designSystems?.[0];
    addStep(entry, 'theme library lists fixture design system', {
      count: themes.body.designSystems?.length,
      selected: designSystem?.id,
    });
    assertOk(designSystem?.id, '设计系统库没有可导入条目', themes.body);

    const importedTheme = await fetchJson(buildProjectApiUrl(context.origin, '/api/theme-library/import', context.projectId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ designSystemId: designSystem.id }),
    });
    addStep(entry, 'theme library imports a design system', importedTheme.body);
    assertOk(importedTheme.body.success === true, '设计系统导入失败', importedTheme.body);
    assertOk(fs.existsSync(importedTheme.body.absoluteFilePath), '设计系统入口文件未落盘', importedTheme.body);

    const metadata = readJson(path.join(context.projectRoot, '.axhub/make/project.json'));
    assertOk(metadata.resources.prototypes.some((item) => item.name === 'smoke-template'), 'metadata 未记录导入模板', metadata.resources.prototypes);
    assertOk(metadata.resources.themes.some((item) => item.name === importedTheme.body.folderName), 'metadata 未记录导入设计系统', metadata.resources.themes);
  } finally {
    restoreFetch();
  }
}

async function runResourceCrudJourney(context, entry) {
  const upload = await uploadMarkdownDoc(context, 'Smoke Spec.md', '# Smoke Spec\n\n用于脚本回归。\n');
  const docName = upload.body.files?.[0]?.name;
  addStep(entry, 'document upload writes file and metadata', {
    docName,
    displayName: upload.body.files?.[0]?.displayName,
  });
  assertOk(upload.status === 201 && docName, '文档上传失败', upload.body);

  const copiedDoc = await fetchJson(buildProjectApiUrl(context.origin, `/api/docs/${encodeURIComponent(docName)}/copy`, context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Smoke Spec Copy' }),
  });
  assertOk(copiedDoc.status === 201, '文档复制失败', copiedDoc.body);
  const renamedDoc = await fetchJson(buildProjectApiUrl(context.origin, `/api/docs/${encodeURIComponent(copiedDoc.body.name)}`, context.projectId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newBaseName: 'smoke-spec-renamed' }),
  });
  addStep(entry, 'document copy and rename update metadata', {
    copied: copiedDoc.body.name,
    renamed: renamedDoc.body.name,
  });
  assertOk(renamedDoc.body.name === 'smoke-spec-renamed.md', '文档重命名结果不正确', renamedDoc.body);

  const table = await fetchJson(buildProjectApiUrl(context.origin, '/api/data/tables', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tableName: 'Smoke Orders', fileName: 'smoke-orders' }),
  });
  const imported = await fetchJson(buildProjectApiUrl(context.origin, '/api/data/smoke-orders/import', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csvData: 'id,name,total\n1,Alice,12\n2,Bob,34\n' }),
  });
  const records = await fetchJson(buildProjectApiUrl(context.origin, '/api/data/smoke-orders', context.projectId));
  const exported = await fetch(buildProjectApiUrl(context.origin, '/api/data/smoke-orders/export', context.projectId));
  const exportedCsv = await exported.text();
  addStep(entry, 'data table import export round-trips records', {
    fileName: table.body.fileName,
    recordCount: imported.body.recordCount,
  });
  assertOk(imported.body.recordCount === 2 && records.body.length === 2, '数据表导入未读回记录', { imported: imported.body, records: records.body });
  assertOk(exportedCsv.includes('"Alice"') && exportedCsv.includes('"Bob"'), '数据表 CSV 导出缺少记录', exportedCsv);

  const theme = await fetchJson(buildProjectApiUrl(context.origin, '/api/themes', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Smoke Theme', name: 'smoke-theme', design: '# Smoke Theme\n' }),
  });
  const contents = await fetchJson(buildProjectApiUrl(context.origin, '/api/themes/get-contents', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ themeName: theme.body.name }),
  });
  const sync = await fetchJson(buildProjectApiUrl(context.origin, '/api/themes/sync-design', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ themeName: theme.body.name }),
  });
  addStep(entry, 'theme create and design sync work through declared targets', {
    themeName: theme.body.name,
    sync: sync.body,
  });
  assertOk(contents.body.design.includes('Smoke Theme'), '主题内容未读回 DESIGN.md', contents.body);
  assertOk(sync.body.success === true && fs.existsSync(path.join(context.projectRoot, 'DESIGN.md')), '默认设计同步失败', sync.body);

  await fetchJson(buildProjectApiUrl(context.origin, `/api/docs/${encodeURIComponent(renamedDoc.body.name)}`, context.projectId), { method: 'DELETE' });
  await fetchJson(buildProjectApiUrl(context.origin, '/api/data/tables/smoke-orders', context.projectId), { method: 'DELETE' });
  await fetchJson(buildProjectApiUrl(context.origin, `/api/themes/${encodeURIComponent(theme.body.name)}`, context.projectId), { method: 'DELETE' });
  const metadata = readJson(path.join(context.projectRoot, '.axhub/make/project.json'));
  const renamedDocPath = path.join(context.projectRoot, 'src/resources', renamedDoc.body.path || renamedDoc.body.name);
  const dataTablePath = path.join(context.projectRoot, 'src/resources/data/smoke-orders.json');
  addStep(entry, 'resource deletes remove filesystem entries', {
    hasDeletedDoc: fs.existsSync(renamedDocPath),
    hasDeletedData: fs.existsSync(dataTablePath),
    hasDeletedTheme: metadata.resources.themes.some((item) => item.name === theme.body.name),
  });
  assertOk(!fs.existsSync(renamedDocPath), '文档删除后资源文件仍存在', renamedDocPath);
  assertOk(!fs.existsSync(dataTablePath), '数据删除后资源文件仍存在', dataTablePath);
  assertOk(!metadata.resources.themes.some((item) => item.name === theme.body.name), '主题删除后 metadata 仍有记录', metadata.resources.themes);
}

async function runGitVersioningJourney(context, entry) {
  const prototype = await ensureExportablePrototype(context);
  initGitRepository(context.projectRoot);
  const initialHash = git(context.projectRoot, ['rev-parse', 'HEAD']);
  const sourcePath = path.join(context.projectRoot, 'src/prototypes', prototype.name, 'index.tsx');
  fs.appendFileSync(sourcePath, '\nexport const smokeGitChange = true;\n', 'utf8');

  const status = await fetchJson(buildProjectApiUrl(context.origin, '/api/git/status', context.projectId));
  const diff = await fetchJson(buildProjectApiUrl(context.origin, `/api/git/diff?path=${encodeURIComponent(`prototypes/${prototype.name}`)}`, context.projectId));
  addStep(entry, 'git status and diff expose prototype changes', {
    hasChanges: status.body.hasChanges,
    diffLength: diff.body.diff?.length || 0,
  });
  assertOk(status.body.available === true && status.body.hasChanges === true, 'Git status 未报告变更', status.body);
  assertOk(String(diff.body.diff || '').includes('smokeGitChange'), 'Git diff 未包含变更内容', diff.body);

  const committed = await fetchJson(buildProjectApiUrl(context.origin, '/api/git/commit', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `prototypes/${prototype.name}`, message: 'smoke git change' }),
  });
  const newHash = git(context.projectRoot, ['rev-parse', 'HEAD']);
  const history = await fetchJson(buildProjectApiUrl(context.origin, `/api/git/history?path=${encodeURIComponent(`prototypes/${prototype.name}`)}`, context.projectId));
  const version = await fetchJson(buildProjectApiUrl(context.origin, '/api/git/build-version', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `prototypes/${prototype.name}`, commitHash: initialHash }),
  });
  addStep(entry, 'git commit history and version build work for prototype source', {
    committed: committed.body.success,
    historyCount: history.body.commits?.length,
    versionId: version.body.versionId,
    hasPrototype: version.body.hasPrototype,
  });
  assertOk(committed.body.success === true && newHash !== initialHash, 'Git commit 未创建新版本', { committed: committed.body, initialHash, newHash });
  assertOk(history.body.commits?.some((commit) => commit.hash === newHash), 'Git history 未包含新提交', history.body);
  assertOk(version.body.hasPrototype === true && version.body.prototypeUrl, 'Git version 构建未生成原型文件', version.body);

  const versionEntryPath = `/api/git/version-file/${encodeURIComponent(version.body.versionId)}/prototypes/${encodeURIComponent(prototype.name)}/index.tsx`;
  const versionFile = await fetch(buildProjectApiUrl(context.origin, versionEntryPath, context.projectId));
  const versionText = await versionFile.text();
  assertOk(versionFile.ok && !versionText.includes('smokeGitChange'), '版本文件不是初始提交内容', versionText.slice(0, 300));

  await fetchJson(buildProjectApiUrl(context.origin, '/api/git/restore', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `prototypes/${prototype.name}`, commitHash: initialHash }),
  });
  const restored = fs.readFileSync(sourcePath, 'utf8');
  addStep(entry, 'git restore rolls prototype source back to selected commit', {
    restoredToInitial: !restored.includes('smokeGitChange'),
  });
  assertOk(!restored.includes('smokeGitChange'), 'Git restore 未恢复初始内容', restored.slice(-300));
}

async function runReviewAndDesignDecisionsJourney(context, entry) {
  const prototype = createSourceBackedPrototype(context, 'smoke-review', 'Smoke Review');
  const targetPath = `prototypes/${prototype.name}`;
  const sourcePath = path.join(context.projectRoot, 'src/prototypes', prototype.name, 'index.tsx');

  writeText(sourcePath, createInvalidReviewPrototypeSource());
  const defaultReview = await fetchJson(buildProjectApiUrl(context.origin, '/api/code-review', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: targetPath }),
  });
  addStep(entry, 'default code review blocks invalid prototype source', {
    passed: defaultReview.body.passed,
    rules: defaultReview.body.issues?.map((issue) => issue.rule),
  });
  assertOk(defaultReview.body.passed === false, '默认代码评审没有拦截缺少 export default 的源码', defaultReview.body);
  assertOk(
    defaultReview.body.issues?.some((issue) => issue.rule === 'export-default' && issue.blocking === true),
    '默认代码评审没有返回 export-default 阻断项',
    defaultReview.body,
  );

  writeText(sourcePath, createAxureReviewPrototypeSource());
  writeText(path.join(context.projectRoot, 'src/prototypes', prototype.name, 'style.css'), '@import "tailwindcss";\n.smoke-review { min-height: 100vh; }\n');
  const axureReview = await fetchJson(buildProjectApiUrl(context.origin, '/api/code-review', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: targetPath,
      enforceComponentExportName: true,
      mode: 'axure-export',
    }),
  });
  addStep(entry, 'axure export code review accepts compliant source', {
    passed: axureReview.body.passed,
    mode: axureReview.body.mode,
    summary: axureReview.body.summary,
    warningRules: axureReview.body.issues?.filter((issue) => issue.type === 'warning').map((issue) => issue.rule),
  });
  assertOk(axureReview.body.mode === 'axure-export', 'Axure 评审模式未生效', axureReview.body);
  assertOk(axureReview.body.passed === true, '合规 Axure 源码未通过代码评审', axureReview.body);
  assertOk(axureReview.body.summary?.blockingErrors === 0, '合规 Axure 源码仍存在阻断问题', axureReview.body);

  const axurePreview = await fetchJson(buildProjectApiUrl(context.origin, '/api/axure-api-preview', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: targetPath }),
  });
  addStep(entry, 'axure API preview parses handle lists', {
    hasAxureHandle: axurePreview.body.hasAxureHandle,
    eventCount: axurePreview.body.lists?.eventList?.items?.length,
    actionCount: axurePreview.body.lists?.actionList?.items?.length,
    varCount: axurePreview.body.lists?.varList?.items?.length,
  });
  assertOk(axurePreview.body.passedSourceCheck === true, 'Axure API 预览没有读到源码', axurePreview.body);
  assertOk(axurePreview.body.hasAxureHandle === true, 'Axure API 预览没有识别 useImperativeHandle', axurePreview.body);
  assertOk(
    axurePreview.body.lists?.eventList?.parseStatus === 'parsed'
      && axurePreview.body.lists.eventList.items.some((item) => item.name === 'submit'),
    'Axure API 预览没有解析 eventList',
    axurePreview.body,
  );
  assertOk(
    axurePreview.body.lists?.varList?.items.some((item) => item.name === 'user_name'),
    'Axure API 预览没有解析 snake_case varList',
    axurePreview.body,
  );

  const theme = await fetchJson(buildProjectApiUrl(context.origin, '/api/themes', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Smoke Review Design',
      name: 'smoke-review-design',
      design: createSmokeReviewDesignMarkdown(),
    }),
  });
  patchSmokeThemeDecisionMetadata(context, theme.body.name);
  const themes = await fetchJson(buildProjectApiUrl(context.origin, '/api/themes', context.projectId));
  const candidate = themes.body.find((item) => item.name === theme.body.name);
  const contents = await fetchJson(buildProjectApiUrl(context.origin, '/api/themes/get-contents', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ themeName: theme.body.name }),
  });
  addStep(entry, 'design candidate exposes preview link and DESIGN.md source', {
    themeName: theme.body.name,
    previewUrl: candidate?.previewUrl,
    designPath: candidate?.assets?.designMd?.path,
  });
  assertOk(candidate?.previewUrl === `${context.origin}/themes/${theme.body.name}`, '设计候选缺少可打开预览链接', candidate);
  assertOk(candidate?.assets?.designMd?.path === 'DESIGN.md', '设计候选缺少 DESIGN.md 路径 metadata', candidate);
  assertOk(contents.body.design.includes('Smoke Review Design'), '设计候选未读回 DESIGN.md 内容', contents.body);

  const specDir = path.join(context.projectRoot, 'src/prototypes', prototype.name, '.spec');
  const decisionFile = path.join(specDir, '2026-06-06-design-decisions.md');
  const uiReviewFile = path.join(specDir, 'ui-review.md');
  const prototypeReviewFile = path.join(specDir, 'prototype-review.md');
  writeText(decisionFile, createDesignDecisionArchiveMarkdown(theme.body.name));
  writeText(uiReviewFile, createUiReviewMarkdown(theme.body.name, prototype.name));
  writeText(prototypeReviewFile, createPrototypeReviewMarkdown(prototype.name));

  const [decisionReadback, uiReviewReadback, prototypeReviewReadback] = await Promise.all([
    fetchText(buildProjectApiUrl(context.origin, `/api/markdown-file?path=${encodeURIComponent(path.relative(context.projectRoot, decisionFile).split(path.sep).join('/'))}`, context.projectId)),
    fetchText(buildProjectApiUrl(context.origin, `/api/markdown-file?path=${encodeURIComponent(path.relative(context.projectRoot, uiReviewFile).split(path.sep).join('/'))}`, context.projectId)),
    fetchText(buildProjectApiUrl(context.origin, `/api/markdown-file?path=${encodeURIComponent(path.relative(context.projectRoot, prototypeReviewFile).split(path.sep).join('/'))}`, context.projectId)),
  ]);
  addStep(entry, 'review and design decision artifacts are readable from spec paths', {
    decisionPath: path.relative(context.projectRoot, decisionFile).split(path.sep).join('/'),
    uiReviewPath: path.relative(context.projectRoot, uiReviewFile).split(path.sep).join('/'),
    prototypeReviewPath: path.relative(context.projectRoot, prototypeReviewFile).split(path.sep).join('/'),
  });
  assertOk(decisionReadback.includes('最终设计决策') && decisionReadback.includes('至少 5 个设计问题'), '设计决策归档缺少关键决策内容', decisionReadback);
  assertOk(uiReviewReadback.includes('# UI Review') && uiReviewReadback.includes('## 核心元件'), 'UI Review 产物不符合基础模板', uiReviewReadback);
  assertOk(prototypeReviewReadback.includes('# Prototype Review') && prototypeReviewReadback.includes('## 完整性与项目对齐'), 'Prototype Review 产物不符合基础模板', prototypeReviewReadback);

  await fetchJson(buildProjectApiUrl(context.origin, `/api/themes/${encodeURIComponent(theme.body.name)}`, context.projectId), { method: 'DELETE' });
}

function ensurePrototype(context) {
  if (context.createdPrototype) return context.createdPrototype;
  const metadata = readJson(path.join(context.projectRoot, '.axhub/make/project.json'));
  const existing = metadata.resources.prototypes[0];
  assertOk(existing, '当前 smoke 上下文没有可用原型');
  context.createdPrototype = {
    name: existing.name,
    displayName: existing.title,
    clientUrl: existing.clientUrl,
  };
  return context.createdPrototype;
}

async function ensureExportablePrototype(context) {
  const metadata = readJson(path.join(context.projectRoot, '.axhub/make/project.json'));
  const metadataPrototype = Array.isArray(metadata.resources?.prototypes) ? metadata.resources.prototypes[0] : null;
  const existing = context.createdPrototype || (metadataPrototype
    ? {
      name: metadataPrototype.name,
      displayName: metadataPrototype.title || metadataPrototype.name,
      clientUrl: metadataPrototype.clientUrl,
    }
    : createSourceBackedPrototype(context));
  const sourcePath = path.join(context.projectRoot, 'src/prototypes', existing.name, 'index.tsx');
  if (!fs.existsSync(sourcePath)) {
    return createSourceBackedPrototype(context, existing.name || 'smoke-page', existing.displayName || 'Smoke Page');
  }
  const content = fs.readFileSync(sourcePath, 'utf8');
  if (!content.includes('export default function') || !content.includes('React')) {
    return createSourceBackedPrototype(context, existing.name || 'smoke-page', existing.displayName || 'Smoke Page');
  }
  syncPrototypeMetadata(context, existing.name, existing.displayName || existing.name, sourcePath);
  return {
    ...existing,
    filePath: path.relative(context.projectRoot, sourcePath).split(path.sep).join('/'),
  };
}

function createSourceBackedPrototype(context, name = 'smoke-page', title = 'Smoke Page') {
  const safeName = name.replace(/[^a-z0-9-]/giu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '') || 'smoke-page';
  const prototypeDir = path.join(context.projectRoot, 'src/prototypes', safeName);
  fs.mkdirSync(prototypeDir, { recursive: true });
  const sourcePath = path.join(prototypeDir, 'index.tsx');
  writeText(sourcePath, `import React from 'react';
import './style.css';

export default function SmokePrototype() {
  return (
    <main className="smoke-prototype">
      <h1>${escapeXml(title)}</h1>
      <p>Smoke regression export surface.</p>
    </main>
  );
}
`);
  writeText(path.join(prototypeDir, 'style.css'), `.smoke-prototype {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #ffffff;
  color: #172554;
  font-family: Arial, sans-serif;
}
`);
  syncPrototypeMetadata(context, safeName, title, sourcePath);
  context.createdPrototype = {
    name: safeName,
    displayName: title,
    clientUrl: `${context.origin}/prototypes/${encodeURIComponent(safeName)}`,
    filePath: path.relative(context.projectRoot, sourcePath).split(path.sep).join('/'),
  };
  return context.createdPrototype;
}

function syncPrototypeMetadata(context, name, title, sourcePath) {
  const metadataPath = path.join(context.projectRoot, '.axhub/make/project.json');
  const metadata = readJson(metadataPath);
  const filePath = path.relative(context.projectRoot, sourcePath).split(path.sep).join('/');
  const prototypes = Array.isArray(metadata.resources?.prototypes) ? metadata.resources.prototypes : [];
  writeJson(metadataPath, {
    ...metadata,
    resources: {
      ...metadata.resources,
      prototypes: [
        {
          id: name,
          name,
          title,
          clientUrl: `${context.origin}/prototypes/${encodeURIComponent(name)}`,
          previewMode: 'clientRuntime',
          filePath,
          absoluteFilePath: sourcePath,
          updatedAt: new Date().toISOString(),
        },
        ...prototypes.filter((item) => item.id !== name && item.name !== name),
      ],
    },
    navigation: {
      ...metadata.navigation,
      prototypes: [name, ...(metadata.navigation?.prototypes || []).filter((item) => item !== name)],
    },
    updatedAt: new Date().toISOString(),
  });
}

function createMarkerBackedMakeClientProject({ root, id, name, assistantOrigin }) {
  fs.mkdirSync(path.join(root, 'src/prototypes/imported-home'), { recursive: true });
  fs.mkdirSync(path.join(root, '.axhub/make'), { recursive: true });
  writeJson(path.join(root, 'package.json'), {
    name: id,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
  });
  writeJson(path.join(root, '.axhub/make/client.json'), {
    schemaVersion: 2,
    kind: 'axhub-make-client',
    repository: 'smoke',
    project: { id, name },
  });
  writeJson(path.join(root, '.axhub/make/axhub.config.json'), {
    assistant: {
      webBaseUrl: assistantOrigin,
      apiBaseUrl: `${assistantOrigin}/api`,
    },
  });
  writeText(path.join(root, 'src/prototypes/imported-home/index.tsx'), `import React from 'react';

export default function ImportedHome() {
  return <main>Imported smoke project</main>;
}
`);
  writeJson(path.join(root, '.axhub/make/project.json'), {
    schemaVersion: 2,
    project: { id, name },
    resources: {
      prototypes: [
        {
          id: 'imported-home',
          name: 'imported-home',
          title: 'Imported Home',
          clientUrl: 'http://127.0.0.1:5173/prototypes/imported-home',
          filePath: 'src/prototypes/imported-home/index.tsx',
        },
      ],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: { prototypes: ['imported-home'], docs: [] },
    orders: { themes: [], data: [], templates: [] },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: false,
      axureExport: false,
      resourceWrites: {
        prototypeCreate: false,
        prototypeUpload: true,
        docCreate: true,
        docImport: true,
        themeCreate: true,
        themeImport: true,
        dataCreate: true,
        dataImport: false,
        templateCreate: true,
        templateDuplicate: true,
      },
    },
    resourceWriteTargets: {
      prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
      docs: { type: 'project-relative-path', path: 'src/resources' },
      themes: { type: 'project-relative-path', path: 'src/themes' },
      data: { type: 'project-relative-path', path: 'src/resources/data' },
      templates: { type: 'project-relative-path', path: 'src/resources/templates' },
      media: { type: 'project-relative-path', path: 'src/resources/media' },
    },
    updatedAt: new Date().toISOString(),
  });
  return root;
}

async function uploadMarkdownDoc(context, filename, content) {
  const boundary = `----axhub-smoke-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/markdown\r\n\r\n`, 'utf8'),
    Buffer.from(content, 'utf8'),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);
  return fetchJson(buildProjectApiUrl(context.origin, '/api/docs/upload', context.projectId), {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${init.method || 'GET'} ${url} returned ${response.status}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return text;
}

function createInvalidReviewPrototypeSource() {
  return `import React from 'react';

export function SmokeReviewBroken() {
  return <main>Missing default export for smoke review.</main>;
}
`;
}

function createAxureReviewPrototypeSource() {
  return `/**
 * @name Smoke Review
 * @mode axure
 * @see /rules/axure-export-workflow.md
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import './style.css';
import type { AxureHandle, AxureProps } from '../../common/axure-types';

const eventList = [
  { name: 'submit', label: 'Submit', payload: 'string' },
];
const actionList = [
  { name: 'set_label', label: 'Set label' },
];
const varList = [
  { name: 'user_name', label: 'User name', type: 'string' },
];
const configList = [
  { name: 'tone', label: 'Tone', type: 'select' },
];
const dataList = [
  { name: 'orders', label: 'Orders' },
];

const Component = forwardRef<AxureHandle, AxureProps>((props, ref) => {
  useImperativeHandle(ref, () => ({
    eventList,
    actionList,
    varList,
    configList,
    dataList,
    getVar(name) {
      return name === 'user_name' ? 'Smoke' : '';
    },
    fireAction(name) {
      props.onEvent?.('action', String(name));
    },
  }));

  return <main className="smoke-review flex">Smoke review export surface</main>;
});

export default Component;
`;
}

function createSmokeReviewDesignMarkdown() {
  return `# Smoke Review Design

## Brand Basis

Smoke Review Design 是脚本回归使用的设计基底，用于验证 DESIGN.md 候选、预览链接和评审产物契约。

## Tokens

- Primary color: #1d4ed8
- Radius: 8px
- Typography: system sans
`;
}

function patchSmokeThemeDecisionMetadata(context, themeName) {
  const metadataPath = path.join(context.projectRoot, '.axhub/make/project.json');
  const metadata = readJson(metadataPath);
  writeJson(metadataPath, {
    ...metadata,
    resources: {
      ...metadata.resources,
      themes: metadata.resources.themes.map((theme) => (
        theme.name === themeName || theme.id === themeName
          ? {
            ...theme,
            title: 'Smoke Review Design',
            description: 'Smoke design candidate for review and design decision regression.',
            clientUrl: `${context.origin}/themes/${themeName}`,
            previewUrl: `${context.origin}/themes/${themeName}`,
            tags: {
              category: ['smoke', 'review'],
              scenario: ['design-decision'],
            },
            display: {
              variant: 'light',
              distributionTags: ['smoke', 'review'],
            },
            identity: {
              slug: themeName,
              title: 'Smoke Review Design',
              description: 'Smoke design candidate with DESIGN.md source metadata.',
            },
            assets: {
              designMd: {
                path: 'DESIGN.md',
              },
            },
          }
          : theme
      )),
    },
  });
}

function createDesignDecisionArchiveMarkdown(themeName) {
  return `# 2026-06-06 设计决策归档

- 采用的 DESIGN.md：src/themes/${themeName}/DESIGN.md
- 主题预览：/themes/${themeName}
- 决策性质：已确认快照

## 关键设计决策

1. 首屏目标：优先表达核心任务入口。
2. 信息层级：主要状态前置，辅助说明延后。
3. 布局模式：采用紧凑工作台布局。
4. 交互路径：高频操作效率优先。
5. 数据呈现：示例数据只用于解释状态。

## 最终设计决策

至少 5 个设计问题已收敛，后续 UI Review 只按选定 DESIGN.md 评估，不另起视觉系统。
`;
}

function createUiReviewMarkdown(themeName, prototypeName) {
  return `# UI Review

- 审查目标：src/prototypes/${prototypeName}
- 使用设计依据：src/themes/${themeName}/DESIGN.md
- 生成时间：2026-06-06 00:00

## 总体点评

Smoke UI Review 用于验证评审文件路径和模板结构。

## P0-P3 优先级问题

无 P0-P3 阻断项。

## 核心元件

### Main Surface

核心元件按 DESIGN.md 基底检查。

## 响应式与可访问性

已检查基础结构。

## 证据与评估说明

- 独立评估：degraded，脚本 smoke 仅验证产物契约。
`;
}

function createPrototypeReviewMarkdown(prototypeName) {
  return `# Prototype Review

- 审查目标：src/prototypes/${prototypeName}
- 用户资料/参考资料：.spec 设计决策、当前原型源码、metadata
- 生成时间：2026-06-06 00:00

## 总体点评

Smoke Prototype Review 用于验证需求评审文件路径和模板结构。

## P0-P3 优先级问题

无 P0-P3 阻断项。

## 完整性与项目对齐

核心用户、入口、状态和项目资源保持一致。

## 业务逻辑连贯性

流程顺序和状态迁移已按 smoke 基线检查。

## 状态、异常、边界与恢复

脚本覆盖基础可读性和归档契约。

## 证据与评估说明

- 独立评估：degraded，脚本 smoke 仅验证产物契约。
`;
}

function initGitRepository(projectRoot) {
  if (fs.existsSync(path.join(projectRoot, '.git'))) {
    return;
  }
  git(projectRoot, ['init']);
  git(projectRoot, ['config', 'user.email', 'smoke@example.com']);
  git(projectRoot, ['config', 'user.name', 'Smoke Runner']);
  git(projectRoot, ['add', '.']);
  git(projectRoot, ['commit', '-m', 'smoke initial']);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function installLibraryFetchMock(tempRoot) {
  const previousFetch = globalThis.fetch;
  const fixture = createLibraryFixture(tempRoot);
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href === 'https://api.github.com/repos/lintendo/Make-Template') {
      return new Response(JSON.stringify({ default_branch: 'main' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.endsWith('/templates.json')) {
      return new Response(JSON.stringify(fixture.templateIndex), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.endsWith('/design-systems.json')) {
      return new Response(JSON.stringify(fixture.themeIndex), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.includes('https://codeload.github.com/lintendo/Make-Template/tar.gz/')) {
      return new Response(fs.readFileSync(fixture.tarballPath), {
        status: 200,
        headers: { 'content-type': 'application/gzip' },
      });
    }
    return previousFetch(url, init);
  };
  return () => {
    globalThis.fetch = previousFetch;
  };
}

function createLibraryFixture(tempRoot) {
  const repoRoot = path.join(tempRoot, 'mock-template-repo', 'Make-Template-main');
  const templateDir = path.join(repoRoot, 'templates/smoke-template');
  const themeDir = path.join(repoRoot, 'design-systems/smoke-design');
  fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
  fs.mkdirSync(templateDir, { recursive: true });
  fs.mkdirSync(themeDir, { recursive: true });
  writeText(path.join(templateDir, 'index.tsx'), `import React from 'react';

export default function SmokeTemplate() {
  return <main>Smoke template import</main>;
}
`);
  writeText(path.join(templateDir, 'style.css'), 'main { color: #123456; }\n');
  writeText(path.join(themeDir, 'index.tsx'), `import React from 'react';

export default function SmokeDesignPreview() {
  return <main>Smoke design system</main>;
}
`);
  writeText(path.join(themeDir, 'DESIGN.md'), '# Smoke Design\n');
  writeText(path.join(themeDir, 'designToken.json'), JSON.stringify({ name: 'Smoke Design' }, null, 2));
  writeText(path.join(themeDir, 'globals.css'), ':root { color: #123456; }\n');
  const tarballPath = path.join(tempRoot, 'mock-template-repo.tar.gz');
  fs.rmSync(tarballPath, { force: true });
  execFileSync('tar', ['-czf', tarballPath, 'Make-Template-main'], { cwd: path.dirname(repoRoot) });
  return {
    tarballPath,
    templateIndex: {
      schemaVersion: 2,
      templates: [
        {
          id: 'smoke-template',
          title: 'Smoke Template',
          slug: 'smoke-template',
          sourcePath: 'templates/smoke-template',
          coverPath: 'covers/smoke-template.png',
          description: 'Smoke template fixture',
          previewUrl: 'https://example.com/smoke-template',
          extraDependencies: [],
        },
      ],
    },
    themeIndex: {
      schemaVersion: 2,
      designSystems: [
        {
          id: 'smoke-design',
          title: 'Smoke Design',
          slug: 'smoke-design',
          sourcePath: 'design-systems/smoke-design',
          entryPath: 'design-systems/smoke-design/index.tsx',
          tokenPath: 'design-systems/smoke-design/designToken.json',
          stylePath: 'design-systems/smoke-design/globals.css',
          coverPath: 'design-systems/smoke-design/cover.png',
          description: 'Smoke design fixture',
          previewUrl: 'https://example.com/smoke-design',
        },
      ],
    },
  };
}

async function startMockS3Server() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      method: req.method,
      path: req.url || '',
      byteLength: Buffer.concat(chunks).length,
      authorization: String(req.headers.authorization || ''),
      contentType: String(req.headers['content-type'] || ''),
    });
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ok');
  });
  await listen(server);
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    reset() {
      requests.splice(0);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function postMockAcpChat(origin, body) {
  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Mock ACP chat 请求失败: ${response.status} ${await response.text()}`);
  }
  return readSseResponse(response);
}

async function postAiRun(context, body) {
  const response = await fetch(buildProjectApiUrl(context.origin, '/api/ai/runs', context.projectId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, projectId: context.projectId }),
  });
  if (!response.ok) {
    throw new Error(`AI run 请求失败: ${response.status} ${await response.text()}`);
  }
  return readSseResponse(response);
}

async function readSseResponse(response) {
  const raw = await response.text();
  const events = raw
    .split(/\r?\n\r?\n/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseSseBlock);
  return {
    raw,
    events,
    text: events
      .filter((event) => event.data?.delta)
      .map((event) => event.data.delta)
      .join(''),
    artifacts: events
      .filter((event) => event.data?.artifact)
      .map((event) => event.data.artifact),
  };
}

function parseSseBlock(block) {
  const lines = block.split(/\r?\n/u);
  const event = lines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim() || 'message';
  const dataText = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');
  let data = null;
  try {
    data = dataText ? JSON.parse(dataText) : null;
  } catch {
    data = dataText;
  }
  return { event, data };
}

function summarizeArtifact(artifact) {
  return {
    id: artifact.id,
    kind: artifact.kind,
    operation: artifact.operation,
    target: artifact.target,
    hasDataUrl: Boolean(artifact.dataUrl),
  };
}
