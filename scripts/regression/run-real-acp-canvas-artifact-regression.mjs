#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const midsceneRuntimeNodeModules = path.join(rootDir, 'tmp-midscene/cli-runtime/node_modules');
const puppeteer = require(path.join(midsceneRuntimeNodeModules, 'puppeteer-core'));
const { PuppeteerAgent } = require(require.resolve('@midscene/web/puppeteer', {
  paths: [midsceneRuntimeNodeModules],
}));

const SUITE_NAME = 'run-real-acp-canvas-artifact-regression';
const DEFAULT_PROJECT_ID = 'make-2-2';
const DEFAULT_ACP_WEB_BASE_URL = 'http://localhost:32124';
const DEFAULT_ACP_API_BASE_URL = 'http://localhost:32124/api';
const DEFAULT_VIEWPORT = { width: 1440, height: 1000, deviceScaleFactor: 1 };
const REAL_ACP_RUNTIME_AUTOSTART_PATH = '/api/assistant/runtime?autoStart=true';
const REAL_ACP_ENTRY_CANVAS_START = 'canvas-start';
const REAL_ACP_ENTRY_PLACEHOLDER_START = 'placeholder-start';
const REAL_ACP_RECOVERY_NONE = 'none';
const REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION = 'refresh-during-generation';
const REAL_ACP_RECOVERY_REFRESH_AFTER_CANVAS_WRITE = 'refresh-after-canvas-write';
const REQUIRED_ARTIFACT_KINDS = ['prototype', 'image', 'drawio', 'document'];
const REQUIRED_ARTIFACT_PREVIEW_KIND = {
  prototype: 'web',
  image: 'image',
  drawio: 'drawio',
  document: 'doc',
};
const CANVAS_AI_LAUNCHER_SELECTOR = '[data-axhub-canvas-start-ai-launcher]';
const CANVAS_AI_COMPOSER_ROOT_SELECTOR = '[data-axhub-canvas-start-composer]';
const CANVAS_AI_COMPOSER_SELECTOR = [
  '[data-axhub-canvas-start-composer] textarea',
  'textarea[aria-label="画布 AI 输入"]',
].join(', ');
const PROTOTYPE_PLACEHOLDER_COMPOSER_SELECTOR = 'textarea[aria-label="原型起始页 AI 输入"]';
const REAL_ACP_VISUAL_AI_CONTEXT = [
  '你是 Axhub Make 的前端回归测试员，熟悉中文 UI、画布、右侧 ACP UI iframe 和 AI 生成流程。',
  '优先根据截图里的可见控件和文案完成操作，不要依赖隐藏 DOM 或调试接口。',
  '本测试必须像真实用户一样从页面输入提示词、发送给右侧 ACP，并通过画布上可见的产物节点确认结果。',
  '关键可见文案包括：画布、画布 AI 输入、发送、ACP UI、生成记录、原型、Drawio、文档。',
].join('\n');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(filePath) {
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  const equalsIndex = withoutExport.indexOf('=');
  if (equalsIndex === -1) return null;
  const key = withoutExport.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = withoutExport.slice(equalsIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

async function readEnvFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  const result = {};
  for (const line of raw.split(/\r?\n/u)) {
    const parsed = parseEnvLine(line);
    if (parsed) result[parsed[0]] = parsed[1];
  }
  return result;
}

async function buildBaseEnv() {
  const midsceneEnv = await readEnvFile(path.join(rootDir, '.env.midscene'));
  return {
    ...midsceneEnv,
    ...process.env,
  };
}

function boolFromEnv(value, defaultValue = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function resolveRunId(env) {
  return env.AXHUB_MAKE_E2E_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function resolveCliOptionValue(argv, names) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '');
    for (const name of names) {
      if (arg === name) {
        return String(argv[index + 1] || '').trim();
      }
      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1).trim();
      }
    }
  }
  return '';
}

function resolveRealAcpEntryMode(env, argv = process.argv.slice(2)) {
  const raw = (
    resolveCliOptionValue(argv, ['--entry', '--real-acp-entry'])
    || env.AXHUB_MAKE_REAL_ACP_ENTRY
    || REAL_ACP_ENTRY_CANVAS_START
  ).trim().toLowerCase();
  if (!raw || raw === 'canvas' || raw === REAL_ACP_ENTRY_CANVAS_START) {
    return REAL_ACP_ENTRY_CANVAS_START;
  }
  if (raw === 'placeholder' || raw === 'prototype-placeholder' || raw === REAL_ACP_ENTRY_PLACEHOLDER_START) {
    return REAL_ACP_ENTRY_PLACEHOLDER_START;
  }
  throw new Error(`Unsupported real ACP regression entry mode: ${raw}. Use ${REAL_ACP_ENTRY_CANVAS_START} or ${REAL_ACP_ENTRY_PLACEHOLDER_START}.`);
}

function resolveRealAcpRecoveryMode(env, argv = process.argv.slice(2)) {
  const raw = (
    resolveCliOptionValue(argv, ['--recovery', '--real-acp-recovery'])
    || env.AXHUB_MAKE_REAL_ACP_RECOVERY_MODE
    || REAL_ACP_RECOVERY_NONE
  ).trim().toLowerCase();
  if (!raw || raw === 'off' || raw === 'false' || raw === REAL_ACP_RECOVERY_NONE) {
    return REAL_ACP_RECOVERY_NONE;
  }
  if (raw === 'refresh-running' || raw === 'refresh-during-run' || raw === REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION) {
    return REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION;
  }
  if (raw === 'refresh-after' || raw === REAL_ACP_RECOVERY_REFRESH_AFTER_CANVAS_WRITE) {
    return REAL_ACP_RECOVERY_REFRESH_AFTER_CANVAS_WRITE;
  }
  throw new Error(`Unsupported real ACP recovery mode: ${raw}. Use ${REAL_ACP_RECOVERY_NONE}, ${REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION}, or ${REAL_ACP_RECOVERY_REFRESH_AFTER_CANVAS_WRITE}.`);
}

function resolveRealAcpVisualAiEnabled(env, argv = process.argv.slice(2)) {
  const raw = (
    resolveCliOptionValue(argv, ['--visual-ai', '--real-acp-visual-ai'])
    || env.AXHUB_MAKE_REAL_ACP_VISUAL_AI
    || env.AXHUB_MAKE_E2E_VISUAL_AI
    || 'true'
  ).trim().toLowerCase();
  return !['0', 'false', 'off', 'no', 'n'].includes(raw);
}

function resolveRealAcpProjectRoot(env) {
  const raw = String(env.AXHUB_ACP_UI_PROJECT_ROOT || '').trim();
  return raw ? path.resolve(raw) : '';
}

async function getFreePort() {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Request failed: ${JSON.stringify({ url: String(url), status: response.status, payload })}`);
  }
  return payload;
}

function encodeCanvasApiPath(canvasName) {
  return String(canvasName || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function getCanvasResourcePathForPrototype(prototypeName) {
  const safeName = String(prototypeName || 'recording')
    .replace(/[^a-z0-9-]+/giu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase() || 'recording';
  return `regression/${safeName}.excalidraw`;
}

function buildResourceCanvasApiUrl(baseUrl, resourcePath) {
  return new URL(`/api/canvas/resources/${encodeCanvasApiPath(resourcePath)}`, baseUrl);
}

function appendProjectIdSearchParam(url, projectId) {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) {
    throw new Error('Project-scoped regression request requires projectId');
  }
  url.searchParams.set('projectId', normalizedProjectId);
  return url;
}

async function waitForHttpOk(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`);
}

function getPort(rawUrl) {
  const url = new URL(rawUrl);
  return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
}

async function listPortListenerPids(port) {
  if (!Number.isInteger(port) || port <= 0) return [];
  return await new Promise((resolve) => {
    const child = spawn('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('close', () => {
      resolve(Buffer.concat(chunks).toString('utf8').split(/\s+/u).filter(Boolean));
    });
    child.on('error', () => resolve([]));
  });
}

async function releasePort(port) {
  const result = await listPortListenerPids(port);
  for (const pid of result) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {}
  }
  if (result.length) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await listPortListenerPids(port)).length === 0) return result;
      await sleep(250);
    }
    const remaining = await listPortListenerPids(port);
    for (const pid of remaining) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {}
    }
    const killDeadline = Date.now() + 5000;
    while (Date.now() < killDeadline) {
      if ((await listPortListenerPids(port)).length === 0) return [...new Set([...result, ...remaining])];
      await sleep(250);
    }
    throw new Error(`Could not release port ${port}; remaining listener PIDs: ${(await listPortListenerPids(port)).join(', ')}`);
  }
  return result;
}

function tailText(value, maxLength = 20_000) {
  const text = String(value || '');
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

async function readTextFile(filePath, maxLength = 200_000) {
  const text = await fs.readFile(filePath, 'utf8').catch(() => '');
  return tailText(text, maxLength);
}

async function findSystemChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.MIDSCENE_MCP_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

async function startRealAcpServer({ acpProjectRoot, acpWebBaseUrl, baseUrl, env, logFile }) {
  const port = getPort(acpWebBaseUrl);
  const makeOrigin = new URL(baseUrl).origin;
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--port', String(port), '--cors-origin', makeOrigin, '--webpack'],
    {
      cwd: acpProjectRoot,
      env: {
        ...env,
        ACP_UI_CORS_ORIGINS: makeOrigin,
        ACP_UI_DEV_BUNDLER: 'webpack',
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const chunks = [];
  const append = (chunk) => {
    process.stderr.write(chunk);
    chunks.push(Buffer.from(chunk));
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const flushLog = async () => {
    await fs.writeFile(logFile, Buffer.concat(chunks).toString('utf8')).catch(() => {});
  };
  try {
    await waitForHttpOk(acpWebBaseUrl, 120_000);
    await waitForHttpOk(new URL('/api/chat', acpWebBaseUrl).toString(), 120_000);
  } catch (error) {
    await flushLog();
    throw error;
  }
  return {
    flushLog,
    logTail: () => tailText(Buffer.concat(chunks).toString('utf8')),
    close: async () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {}
      }
      await flushLog();
      await sleep(1000);
    },
  };
}

async function ensureStaticAdminBuild({ env, logFile }) {
  const child = spawn('pnpm', ['run', 'admin:build'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = [];
  child.stdout.on('data', (chunk) => {
    process.stderr.write(chunk);
    chunks.push(chunk);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    chunks.push(chunk);
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  await fs.writeFile(logFile, Buffer.concat(chunks).toString('utf8')).catch(() => {});
  if (exitCode !== 0) {
    throw new Error(`Failed to build static Make admin UI for real ACP regression: exit ${exitCode}`);
  }
}

async function startMakeServer({ baseUrl, env, logFile, useDevServer }) {
  const port = getPort(baseUrl);
  const args = useDevServer
    ? ['exec', 'tsx', 'src/server/cli.ts', '--', './client', '--dev', '--port', String(port), '--no-open']
    : ['exec', 'tsx', 'src/server/cli.ts', '--', './client', '--admin-root', path.join(rootDir, 'dist', 'admin'), '--port', String(port), '--no-open'];
  const child = spawn(
    'pnpm',
    args,
    {
      cwd: rootDir,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const chunks = [];
  child.stdout.on('data', (chunk) => {
    process.stderr.write(chunk);
    chunks.push(chunk);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    chunks.push(chunk);
  });
  try {
    await waitForHttpOk(baseUrl, 90_000);
  } catch (error) {
    await fs.writeFile(logFile, Buffer.concat(chunks).toString('utf8')).catch(() => {});
    throw error;
  }
  return {
    close: async () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {}
      }
      await fs.writeFile(logFile, Buffer.concat(chunks).toString('utf8')).catch(() => {});
      await sleep(1000);
    },
  };
}

async function ensureActiveProject(baseUrl, projectId) {
  await fetchJson(new URL('/api/projects/active', baseUrl), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
}

async function resolveActiveProjectRoot(baseUrl, projectId) {
  const activeProject = await fetchJson(new URL('/api/projects/active', baseUrl));
  const root = typeof activeProject?.root === 'string' ? activeProject.root.trim() : '';
  if (!root) {
    throw new Error(`Active project root is not available: ${JSON.stringify(activeProject)}`);
  }
  if (projectId && activeProject?.id !== projectId) {
    throw new Error(`Active project did not switch to ${projectId}: ${JSON.stringify(activeProject)}`);
  }
  return path.resolve(root);
}

async function createRecordingPrototype(baseUrl, projectId) {
  const url = appendProjectIdSearchParam(new URL('/api/prototypes/create-placeholder', baseUrl), projectId);
  const response = await fetch(url, { method: 'POST' });
  const payload = await response.json().catch(() => null);
  if (response.status !== 201 || !payload?.name) {
    throw new Error(`Failed to create recording prototype: ${JSON.stringify({ status: response.status, payload })}`);
  }
  return String(payload.name);
}

async function waitForAssistantRuntimeReady(baseUrl, projectId, timeoutMs = 150_000) {
  const startUrl = new URL(REAL_ACP_RUNTIME_AUTOSTART_PATH, baseUrl);
  startUrl.searchParams.set('projectId', projectId);
  let latest = await fetchJson(startUrl);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (latest?.health?.status === 'ready' && latest?.runtime?.available) return latest;
    await sleep(1500);
    const pollUrl = new URL('/api/assistant/runtime', baseUrl);
    pollUrl.searchParams.set('autoStart', 'false');
    pollUrl.searchParams.set('projectId', projectId);
    latest = await fetchJson(pollUrl);
  }
  throw new Error(`Timed out waiting for real ACP UI runtime: ${JSON.stringify(latest)}`);
}

function buildRequiredArtifacts() {
  return REQUIRED_ARTIFACT_KINDS.map((kind) => ({
    kind,
    previewKind: REQUIRED_ARTIFACT_PREVIEW_KIND[kind],
    description: {
      prototype: '可运行的 React 原型页面，并能作为 web 预览元素落到画布',
      image: '真实图片产物，可以是 SVG/PNG/JPEG/WebP，并能作为 image 预览元素落到画布',
      drawio: 'draw.io / diagram 图表产物，并能作为 drawio 预览元素落到画布',
      document: 'Markdown 或文档说明，并能作为 doc 预览元素落到画布',
    }[kind],
  }));
}

function normalizeArtifactPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/u, '');
}

function normalizeArtifactKind(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (REQUIRED_ARTIFACT_KINDS.includes(raw)) return raw;
  if (['web', 'page', 'react', 'tsx', 'jsx'].includes(raw)) return 'prototype';
  if (['doc', 'markdown', 'md', 'mdx'].includes(raw)) return 'document';
  if (raw.includes('drawio') || raw.includes('diagram')) return 'drawio';
  if (raw.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(raw)) return 'image';
  return '';
}

function artifactPathFromRecord(record) {
  const target = record?.target && typeof record.target === 'object' ? record.target : {};
  return normalizeArtifactPath(record?.path || target.path || record?.uri || target.uri || '');
}

function inferArtifactKind(record) {
  const target = record?.target && typeof record.target === 'object' ? record.target : {};
  const metadata = record?.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const direct = normalizeArtifactKind(
    record?.kind
    || record?.artifactKind
    || record?.previewKind
    || target.kind
    || target.previewKind
    || metadata.kind
    || metadata.previewKind,
  );
  if (direct) return direct;

  const searchable = [
    record?.type,
    record?.title,
    record?.path,
    record?.uri,
    record?.mimeType,
    target.path,
    target.uri,
    target.mimeType,
    metadata.title,
    metadata.mimeType,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/\.drawio(?:\.svg)?\b|drawio|mxfile|mxgraphmodel/u.test(searchable)) return 'drawio';
  if (/\.mdx?\b|markdown|text\/markdown/u.test(searchable)) return 'document';
  if (/\/prototypes\/[^/]+\/index\.(?:tsx|jsx|ts|js)\b|prototype|react/u.test(searchable)) return 'prototype';
  if (/\.(?:png|jpe?g|gif|webp|svg)\b|image\//u.test(searchable)) return 'image';
  return '';
}

function hasRequiredArtifactKinds(kinds, requiredKinds = REQUIRED_ARTIFACT_KINDS) {
  const present = new Set((kinds || []).map(normalizeArtifactKind).filter(Boolean));
  return requiredKinds.every((kind) => present.has(kind));
}

function summarizeArtifactKindCoverage(records, requiredKinds = REQUIRED_ARTIFACT_KINDS) {
  const items = (Array.isArray(records) ? records : []).map((record) => {
    const target = record?.target && typeof record.target === 'object' ? record.target : {};
    return {
      id: String(record?.id || record?.sourceArtifactId || ''),
      kind: inferArtifactKind(record),
      rawKind: String(record?.kind || record?.artifactKind || ''),
      previewKind: String(record?.previewKind || target.previewKind || ''),
      path: artifactPathFromRecord(record),
      title: String(record?.title || record?.metadata?.title || ''),
      exists: record?.exists === undefined ? undefined : Boolean(record.exists),
    };
  });
  const kindsPresent = [...new Set(items.map((item) => item.kind).filter((kind) => requiredKinds.includes(kind)))];
  return {
    requiredKinds,
    kindsPresent,
    missingKinds: requiredKinds.filter((kind) => !kindsPresent.includes(kind)),
    allRequiredKindsPresent: hasRequiredArtifactKinds(kindsPresent, requiredKinds),
    items,
  };
}

function getRealAcpEntryMetadata(entryMode) {
  return entryMode === REAL_ACP_ENTRY_PLACEHOLDER_START
    ? { source: 'placeholder-start', label: 'prototype placeholder start page' }
    : { source: 'canvas-start', label: 'canvas start page' };
}

function buildRealAcpPrompt({ runId, prototypeName }) {
  return [
    '请按真实用户需求完成一次 Make 画布 AI 生成流程：直接在当前工作区生成内容，并把产物回写到当前画布。',
    '不要只解释方案，不要询问确认，也不要只返回文本说明。请让右侧 ACP 真实执行并产出下面四类 artifact，文件名和路径由你根据当前项目自然选择即可：',
    '',
    '1. prototype：做一个可运行的 React 原型页面，表达“真实 ACP 画布回写已完成”。',
    '2. image：生成一张能在画布中预览的图片产物，画面内容要能看出是本次回归生成。',
    '3. drawio：生成一个 draw.io / diagram 流程图，表达从提示词、ACP 回复到画布落点的链路。',
    '4. document：生成一份 Markdown 或文档记录，说明本次生成流程和产物清单。',
    '',
    `本次回归 run id 是 ${runId}，请把这个 id 放进产物标题、正文或可见内容中，方便测试报告追踪。`,
    `当前资源画布是 src/resources/regression/${prototypeName}.excalidraw，请把产物落到这个当前画布，不要切换到其他项目或只创建草稿。`,
    '完成后请简短回复已生成 prototype、image、drawio、document 四类产物。',
  ].join('\n');
}

async function fetchAcpChatSessions(acpApiBaseUrl) {
  const url = new URL('/api/chat', acpApiBaseUrl);
  const response = await fetch(url).catch((error) => ({ ok: false, status: 0, error }));
  if (!response || response.error) {
    return {
      ok: false,
      status: 0,
      error: response?.error?.message || String(response?.error || 'fetch failed'),
    };
  }
  const text = await response.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return {
    ok: response.ok,
    status: response.status,
    body: json ?? text,
  };
}

async function fetchAcpConversationSummary(acpApiBaseUrl, clientRoot) {
  const url = new URL('/api/conversations', acpApiBaseUrl);
  url.searchParams.set('workspacePath', clientRoot);
  url.searchParams.set('limit', '20');
  url.searchParams.set('refreshProvider', 'false');
  const response = await fetch(url).catch((error) => ({ ok: false, status: 0, error }));
  if (!response || response.error) {
    return {
      ok: false,
      status: 0,
      error: response?.error?.message || String(response?.error || 'fetch failed'),
    };
  }
  const text = await response.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return {
    ok: response.ok,
    status: response.status,
    body: json ?? text,
  };
}

function collectObservedWorkspaceArtifactPaths({ diagnostics, pageState, persistedCanvas, history }) {
  const records = [
    ...(pageState?.generatedElements || []),
    ...(persistedCanvas?.generatedElements || []),
    ...(history?.artifacts || []),
  ];
  return [...new Set(records.map(artifactPathFromRecord).filter((filePath) => (
    filePath
    && !/^(?:https?:|data:|blob:|file:)/iu.test(filePath)
  )))];
}

async function scanObservedWorkspaceArtifacts(clientRoot, observedPaths) {
  const normalizedPaths = [...new Set((observedPaths || []).map(normalizeArtifactPath).filter(Boolean))];
  const files = await Promise.all(normalizedPaths.map(async (filePath) => {
    const absolutePath = path.join(clientRoot, filePath);
    const stat = await fs.stat(absolutePath).catch(() => null);
    const text = stat?.isFile() ? await fs.readFile(absolutePath, 'utf8').catch(() => '') : '';
    return {
      path: filePath,
      kind: inferArtifactKind({ path: filePath }),
      absolutePath,
      exists: Boolean(stat?.isFile()),
      size: Number(stat?.size || 0),
      mtimeMs: Number(stat?.mtimeMs || 0),
      textSample: text.slice(0, 1000),
    };
  }));
  const existingFileCoverage = summarizeArtifactKindCoverage(files.filter((file) => file.exists));
  return {
    requiredKinds: REQUIRED_ARTIFACT_KINDS,
    observedPaths: normalizedPaths,
    files,
    allObservedFilesExist: files.every((file) => file.exists),
    kindsPresent: existingFileCoverage.kindsPresent,
    missingKinds: existingFileCoverage.missingKinds,
    allRequiredKindsPresent: existingFileCoverage.allRequiredKindsPresent,
  };
}

function extractChatRequestWorkspacePaths(diagnostics) {
  return [...new Set(diagnostics.chatRequests.flatMap((request) => {
    const raw = String(request.postData || '');
    if (!raw) return [];
    try {
      const body = JSON.parse(raw);
      const workspacePath = typeof body?.workspacePath === 'string' ? body.workspacePath.trim() : '';
      return workspacePath ? [workspacePath] : [];
    } catch {
      return [];
    }
  }))];
}

async function installBrowserEventRecorder(page) {
  await page.evaluateOnNewDocument(() => {
    const install = () => {
      if (window.__AXHUB_REAL_ACP_EVENT_LOG__) return;
      const eventLog = [];
      Object.defineProperty(window, '__AXHUB_REAL_ACP_EVENT_LOG__', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: eventLog,
      });
      const summarizeData = (data) => {
        if (!data || typeof data !== 'object') return { rawType: typeof data };
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const artifacts = Array.isArray(payload.artifacts)
          ? payload.artifacts.map((artifact) => ({
            id: String(artifact?.id || ''),
            kind: String(artifact?.kind || ''),
            title: String(artifact?.title || ''),
            path: String(artifact?.path || ''),
            uri: String(artifact?.uri || ''),
            mimeType: String(artifact?.mimeType || ''),
            toolCallId: String(artifact?.toolCallId || ''),
            status: String(artifact?.status || ''),
          }))
          : [];
        return {
          type: String(data.type || ''),
          requestId: String(data.requestId || ''),
          payload: {
            ok: payload.ok,
            kind: String(payload.kind || ''),
            source: String(payload.source || ''),
            format: String(payload.format || ''),
            threadId: String(payload.threadId || ''),
            workspacePath: String(payload.workspacePath || ''),
            sinceMs: payload.sinceMs === undefined ? undefined : Number(payload.sinceMs || 0),
            textLength: Number(payload.textLength || 0),
            artifactCount: artifacts.length,
            artifacts,
          },
        };
      };
      const appendEvent = (entry) => {
        eventLog.push(entry);
        const recorder = window.__AXHUB_RECORD_REAL_ACP_EVENT__;
        if (typeof recorder === 'function') {
          void recorder(entry).catch(() => {});
        }
      };
      const summarizeElement = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
        const rect = element.getBoundingClientRect?.();
        return {
          tagName: element.tagName,
          title: element.getAttribute?.('title') || '',
          src: element.getAttribute?.('src') || '',
          dataAxhubAssistantPanel: element.getAttribute?.('data-axhub-assistant-panel') || '',
          dataAxhubAssistantVisible: element.getAttribute?.('data-axhub-assistant-visible') || '',
          className: String(element.className || '').slice(0, 160),
          rect: rect
            ? {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            }
            : null,
        };
      };
      const recordCanvasComposerState = (reason) => {
        const launcher = document.querySelector('[data-axhub-canvas-start-ai-launcher]');
        const composer = document.querySelector('[data-axhub-canvas-start-composer]');
        const textarea = document.querySelector('textarea[aria-label="画布 AI 输入"]');
        appendEvent({
          channel: 'canvas.composer-state',
          at: Date.now(),
          origin: window.location.origin,
          data: {
            type: 'canvas.composer-state',
            payload: {
              reason,
              launcher: summarizeElement(launcher),
              composer: summarizeElement(composer),
              textarea: summarizeElement(textarea),
            },
          },
        });
      };
      window.addEventListener('message', (event) => {
        const dataType = event?.data && typeof event.data === 'object' ? String(event.data.type || '') : '';
        if (!dataType.startsWith('acp.')) return;
        appendEvent({
          channel: 'message',
          at: Date.now(),
          origin: event.origin,
          data: summarizeData(event.data),
        });
      }, true);
      window.addEventListener('axhub:assistantArtifactsChanged', (event) => {
        const detail = event.detail || {};
        appendEvent({
          channel: 'axhub:assistantArtifactsChanged',
          at: Date.now(),
          origin: window.location.origin,
          data: {
            type: 'axhub:assistantArtifactsChanged',
            payload: {
              threadId: String(detail.threadId || ''),
              workspacePath: String(detail.workspacePath || ''),
              artifactCount: Array.isArray(detail.artifacts) ? detail.artifacts.length : 0,
              artifacts: Array.isArray(detail.artifacts)
                ? detail.artifacts.map((artifact) => ({
                  id: String(artifact?.id || ''),
                  kind: String(artifact?.kind || ''),
                  title: String(artifact?.title || ''),
                  path: String(artifact?.path || ''),
                  uri: String(artifact?.uri || ''),
                  mimeType: String(artifact?.mimeType || ''),
                  toolCallId: String(artifact?.toolCallId || ''),
                  status: String(artifact?.status || ''),
                }))
                : [],
            },
          },
        });
      }, true);
      const originalOpen = window.open;
      window.open = function axhubRealAcpWindowOpenRecorder(...args) {
        appendEvent({
          channel: 'window.open',
          at: Date.now(),
          origin: window.location.origin,
          data: {
            type: 'window.open',
            payload: {
              url: String(args[0] || ''),
              target: String(args[1] || ''),
              features: String(args[2] || ''),
            },
          },
        });
        return originalOpen.apply(this, args);
      };
      const OriginalWebSocket = window.WebSocket;
      if (typeof OriginalWebSocket === 'function' && !OriginalWebSocket.__AXHUB_REAL_ACP_WRAPPED__) {
        const WrappedWebSocket = function axhubRealAcpWebSocketRecorder(url, protocols) {
          const socket = protocols === undefined
            ? new OriginalWebSocket(url)
            : new OriginalWebSocket(url, protocols);
          const wsUrl = String(url || '');
          if (wsUrl.includes('/ws/canvas-bridge')) {
            appendEvent({
              channel: 'canvas-bridge.open',
              at: Date.now(),
              origin: window.location.origin,
              data: {
                type: 'canvas-bridge.open',
                payload: { url: wsUrl },
              },
            });
            socket.addEventListener('message', (event) => {
              let parsed = null;
              try {
                parsed = JSON.parse(String(event.data || ''));
              } catch {
                parsed = { type: 'unparsed', text: String(event.data || '').slice(0, 240) };
              }
              appendEvent({
                channel: 'canvas-bridge.message',
                at: Date.now(),
                origin: window.location.origin,
                data: {
                  type: String(parsed?.type || ''),
                  payload: parsed,
                },
              });
              if (parsed?.type === 'canvas.reload') {
                recordCanvasComposerState('before canvas.reload handling');
                window.setTimeout(() => recordCanvasComposerState('after canvas.reload handling'), 300);
              }
            });
            socket.addEventListener('close', () => {
              appendEvent({
                channel: 'canvas-bridge.close',
                at: Date.now(),
                origin: window.location.origin,
                data: {
                  type: 'canvas-bridge.close',
                  payload: { url: wsUrl },
                },
              });
            });
            const originalSend = socket.send.bind(socket);
            socket.send = (data) => {
              let parsed = null;
              try {
                parsed = JSON.parse(String(data || ''));
              } catch {
                parsed = { type: 'unparsed', text: String(data || '').slice(0, 240) };
              }
              appendEvent({
                channel: 'canvas-bridge.send',
                at: Date.now(),
                origin: window.location.origin,
                data: {
                  type: String(parsed?.type || ''),
                  payload: parsed,
                },
              });
              return originalSend(data);
            };
          }
          return socket;
        };
        WrappedWebSocket.prototype = OriginalWebSocket.prototype;
        Object.defineProperty(WrappedWebSocket, 'CONNECTING', { value: OriginalWebSocket.CONNECTING });
        Object.defineProperty(WrappedWebSocket, 'OPEN', { value: OriginalWebSocket.OPEN });
        Object.defineProperty(WrappedWebSocket, 'CLOSING', { value: OriginalWebSocket.CLOSING });
        Object.defineProperty(WrappedWebSocket, 'CLOSED', { value: OriginalWebSocket.CLOSED });
        Object.defineProperty(WrappedWebSocket, '__AXHUB_REAL_ACP_WRAPPED__', { value: true });
        window.WebSocket = WrappedWebSocket;
      }
      const observeAssistantDom = () => {
        if (window.__AXHUB_REAL_ACP_DOM_OBSERVER__) return;
        const isTrackedAssistantElement = (element) => (
          element?.matches?.('iframe[title="ACP UI"], [data-axhub-assistant-panel]')
          || element?.querySelector?.('iframe[title="ACP UI"], [data-axhub-assistant-panel]')
        );
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes || [])) {
              if (isTrackedAssistantElement(node)) {
                appendEvent({
                  channel: 'assistant-dom.added',
                  at: Date.now(),
                  origin: window.location.origin,
                  data: {
                    type: 'assistant-dom.added',
                    payload: {
                      element: summarizeElement(node.nodeType === Node.ELEMENT_NODE ? node : null),
                      assistantPanels: Array.from(document.querySelectorAll('[data-axhub-assistant-panel]')).map(summarizeElement),
                      assistantIframes: Array.from(document.querySelectorAll('iframe[title="ACP UI"]')).map(summarizeElement),
                    },
                  },
                });
              }
            }
            for (const node of Array.from(mutation.removedNodes || [])) {
              if (isTrackedAssistantElement(node)) {
                appendEvent({
                  channel: 'assistant-dom.removed',
                  at: Date.now(),
                  origin: window.location.origin,
                  data: {
                    type: 'assistant-dom.removed',
                    payload: {
                      element: summarizeElement(node.nodeType === Node.ELEMENT_NODE ? node : null),
                      assistantPanels: Array.from(document.querySelectorAll('[data-axhub-assistant-panel]')).map(summarizeElement),
                      assistantIframes: Array.from(document.querySelectorAll('iframe[title="ACP UI"]')).map(summarizeElement),
                    },
                  },
                });
              }
            }
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.__AXHUB_REAL_ACP_DOM_OBSERVER__ = observer;
      };
      if (document.documentElement) {
        observeAssistantDom();
      } else {
        document.addEventListener('DOMContentLoaded', observeAssistantDom, { once: true });
      }
    };
    install();
  });
}

async function ensureBrowserEventRecorderInstalled(page) {
  await page.evaluate(() => {
    if (window.__AXHUB_REAL_ACP_EVENT_LOG__) return;
    window.__AXHUB_REAL_ACP_EVENT_LOG__ = [];
  });
}

async function installNodeEventRecorder(page, diagnostics) {
  await page.exposeFunction('__AXHUB_RECORD_REAL_ACP_EVENT__', (entry) => {
    diagnostics.nodeEventLog.push({
      ...entry,
      recordedAt: Date.now(),
    });
  });
}

function attachBrowserDiagnostics(page, diagnostics) {
  const shouldTrackRequestUrl = (url) => /\/api\/(?:chat|canvas|assistant\/runtime|ai\/artifact-history)|localhost:32124|AssistantPanel/u.test(url);
  const isChatUrl = (url) => {
    try {
      return new URL(url).pathname === '/api/chat';
    } catch {
      return false;
    }
  };
  const isCanvasApiUrl = (url) => {
    try {
      return new URL(url).pathname.startsWith('/api/canvas');
    } catch {
      return false;
    }
  };
  const summarizeCanvasDocument = (value) => {
    const canvas = typeof value === 'string'
      ? JSON.parse(value)
      : value;
    const elements = Array.isArray(canvas?.elements) ? canvas.elements : [];
    const generatedElements = collectPersistedCanvasGeneratedElements(canvas);
    return {
      type: String(canvas?.type || ''),
      version: canvas?.version,
      elementCount: elements.length,
      generatedElementCount: generatedElements.length,
      generatedElements,
      fileCount: canvas?.files && typeof canvas.files === 'object' ? Object.keys(canvas.files).length : 0,
    };
  };
  const summarizeCanvasRequestPostData = (postData) => {
    const raw = String(postData || '');
    const summary = {
      postDataLength: raw.length,
      hasContent: false,
      canvasBridgeClientId: '',
      content: null,
      error: '',
    };
    if (!raw) return summary;
    try {
      const body = JSON.parse(raw);
      summary.hasContent = body?.content !== undefined;
      summary.canvasBridgeClientId = String(body?.canvasBridgeClientId || '');
      if (body?.content !== undefined) {
        summary.content = summarizeCanvasDocument(body.content);
      }
    } catch (error) {
      summary.error = error?.message || String(error);
    }
    return summary;
  };
  page.on('framenavigated', (frame) => {
    diagnostics.pageNavigations.push({
      url: frame.url(),
      isMainFrame: frame === page.mainFrame(),
      at: Date.now(),
    });
  });
  page.on('request', (request) => {
    const url = request.url();
    if (!shouldTrackRequestUrl(url)) return;
    diagnostics.requests.push({
      url,
      method: request.method(),
      resourceType: request.resourceType(),
      at: Date.now(),
    });
    if (isChatUrl(url)) {
      diagnostics.chatRequests.push({
        url,
        method: request.method(),
        resourceType: request.resourceType(),
        postData: request.postData() || '',
        at: Date.now(),
      });
    }
    if (isCanvasApiUrl(url)) {
      diagnostics.canvasSaveRequests.push({
        url,
        method: request.method(),
        resourceType: request.resourceType(),
        summary: summarizeCanvasRequestPostData(request.postData() || ''),
        at: Date.now(),
      });
    }
  });
  page.on('console', (message) => {
    diagnostics.console.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
      at: Date.now(),
    });
  });
  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push({ message: error.message, stack: error.stack, at: Date.now() });
  });
  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || '',
      at: Date.now(),
    });
  });
  page.on('popup', (popup) => {
    diagnostics.popups.push({
      url: popup.url(),
      at: Date.now(),
    });
  });
  page.on('response', async (response) => {
    const url = response.url();
    if (!shouldTrackRequestUrl(url)) return;
    diagnostics.responses.push({
      url,
      status: response.status(),
      method: response.request().method(),
      at: Date.now(),
    });
    if (isChatUrl(url)) {
      let body = '';
      try {
        body = await response.text();
      } catch (error) {
        body = `<<response body unavailable: ${error?.message || String(error)}>>`;
      }
      diagnostics.chatResponses.push({
        url,
        status: response.status(),
        method: response.request().method(),
        headers: response.headers(),
        body: tailText(body),
        at: Date.now(),
      });
    }
  });
}

function attachBrowserTargetDiagnostics(browser, diagnostics) {
  const serializeTarget = (target) => ({
    type: target.type(),
    url: target.url(),
    at: Date.now(),
  });
  browser.on('targetcreated', (target) => {
    diagnostics.browserTargets.push({ event: 'created', ...serializeTarget(target) });
  });
  browser.on('targetchanged', (target) => {
    diagnostics.browserTargets.push({ event: 'changed', ...serializeTarget(target) });
  });
  browser.on('targetdestroyed', (target) => {
    diagnostics.browserTargets.push({ event: 'destroyed', ...serializeTarget(target) });
  });
}

async function collectBrowserPageStates(browser) {
  if (!browser) return [];
  const pages = await browser.pages().catch(() => []);
  return await Promise.all(pages.map(async (page, index) => ({
    index,
    url: page.url(),
    title: await page.title().catch(() => ''),
    frames: page.frames().map((frame) => ({
      url: frame.url(),
      name: frame.name(),
      parentUrl: frame.parentFrame()?.url() || '',
    })),
  })));
}

async function annotate(page, text) {
  await page.evaluate((message) => {
    let badge = document.getElementById('__axhub_real_acp_record_badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = '__axhub_real_acp_record_badge';
      Object.assign(badge.style, {
        position: 'fixed',
        left: '24px',
        bottom: '24px',
        zIndex: 2147483647,
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(10, 20, 30, 0.88)',
        color: 'white',
        font: '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
        pointerEvents: 'none',
        maxWidth: '760px',
      });
      document.body.appendChild(badge);
    }
    badge.textContent = message;
  }, text);
}

async function capture(page, frames, frameDir, label) {
  await annotate(page, label).catch(() => {});
  await sleep(250);
  const filename = `frame-${String(frames.length + 1).padStart(3, '0')}.png`;
  const filePath = path.join(frameDir, filename);
  await page.screenshot({ path: filePath, fullPage: false });
  frames.push({ filename, label, filePath });
}

async function writeHtmlReport({ htmlPath, frames, metadata }) {
  const frameItems = frames.map((frame) => ({ src: `frames/${frame.filename}`, label: frame.label }));
  const safeJson = JSON.stringify({ frames: frameItems, metadata }).replace(/</gu, '\\u003c');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Real ACP Canvas Artifact Regression</title>
  <style>
    body { margin: 0; background: #11161b; color: #edf3f7; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { padding: 18px 22px; border-bottom: 1px solid rgba(255,255,255,.12); }
    h1 { margin: 0 0 8px; font-size: 18px; }
    main { padding: 18px 22px 28px; }
    .stage { max-width: 1440px; margin: 0 auto; }
    .viewport { background: #000; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; overflow: hidden; }
    img { display: block; width: 100%; height: auto; }
    .caption { margin-top: 10px; color: #d8e5ed; min-height: 20px; }
    .controls { display: flex; gap: 8px; align-items: center; margin: 14px 0; }
    button { border: 1px solid rgba(255,255,255,.22); background: #147d62; color: white; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
    button.secondary { background: #28323c; }
    input[type=range] { flex: 1; }
    code { color: #bfead8; }
    pre { overflow: auto; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 12px; color: #d8e5ed; }
    .meta { color: #aebbc7; line-height: 1.6; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .chip { border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 4px 8px; color: #d8e6ee; background: rgba(255,255,255,.06); }
  </style>
</head>
<body>
  <header>
    <h1>Real ACP Canvas Artifact Regression</h1>
    <div class="meta">Suite <code>${metadata.suiteName}</code> · Run <code>${metadata.runId}</code> · Status <code>${metadata.status}</code> · Entry <code>${metadata.entryMode || 'canvas-start'}</code> · Recovery <code>${metadata.recoveryMode || 'none'}</code> · Visual AI <code>${metadata.visualAiEnabled === false ? 'disabled' : 'enabled'}</code></div>
    <div class="chips">
      ${(metadata.requiredArtifacts || []).map((artifact) => `<span class="chip">${artifact.kind}: <code>${artifact.previewKind}</code></span>`).join('')}
    </div>
  </header>
  <main>
    <div class="stage">
      <div class="viewport"><img id="frame" alt="recorded frame" src="${frameItems[0]?.src || ''}"></div>
      <div class="caption" id="caption">${frameItems[0]?.label || ''}</div>
      <div class="controls">
        <button id="play">播放</button>
        <button class="secondary" id="prev">上一帧</button>
        <button class="secondary" id="next">下一帧</button>
        <input id="scrub" type="range" min="0" max="${Math.max(0, frameItems.length - 1)}" value="0">
      </div>
      <p class="meta">这份记录只接受真实右侧 ACP UI：画布 composer 提交 prompt 后，Make 打开 <code>iframe[title="ACP UI"]</code> 并发起真实 provider 请求；成功条件是 AI 主动写入 <code>canvas.excalidraw</code>，前端通过 canvas reload 与持久化文件确认 prototype / image / drawio / document 四类元素已经出现在画布上。</p>
      <pre id="metadata"></pre>
    </div>
  </main>
  <script>
    const data = ${safeJson};
    const frames = data.frames;
    let index = 0;
    let timer = null;
    const image = document.getElementById('frame');
    const caption = document.getElementById('caption');
    const scrub = document.getElementById('scrub');
    document.getElementById('metadata').textContent = JSON.stringify(data.metadata, null, 2);
    function show(next) {
      if (!frames.length) return;
      index = (next + frames.length) % frames.length;
      image.src = frames[index].src;
      caption.textContent = frames[index].label;
      scrub.value = String(index);
    }
    function stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
      document.getElementById('play').textContent = '播放';
    }
    document.getElementById('play').addEventListener('click', () => {
      if (timer) { stop(); return; }
      document.getElementById('play').textContent = '暂停';
      timer = window.setInterval(() => show(index + 1), 1200);
    });
    document.getElementById('prev').addEventListener('click', () => { stop(); show(index - 1); });
    document.getElementById('next').addEventListener('click', () => { stop(); show(index + 1); });
    scrub.addEventListener('input', () => { stop(); show(Number(scrub.value)); });
  </script>
</body>
</html>`;
  await fs.writeFile(htmlPath, html);
}

async function pollPageCondition(page, description, predicate, arg, timeoutMs, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate, arg)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}: ${lastError?.message || 'condition not met'}`);
}

async function waitForCanvasReady(page) {
  await pollPageCondition(
    page,
    'canvas Excalidraw API',
    () => Boolean(window.__AXHUB_EXCALIDRAW_API__?.getSceneElements),
    null,
    120_000,
  );
}

async function waitForPrototypePlaceholderStartPage(page) {
  await pollPageCondition(
    page,
    'prototype placeholder start page',
    (selector) => {
      const textarea = document.querySelector(selector);
      return Boolean(
        textarea
        && textarea.getBoundingClientRect().width > 0
        && document.body?.innerText?.includes('我们先从哪里开始呢?')
      );
    },
    PROTOTYPE_PLACEHOLDER_COMPOSER_SELECTOR,
    120_000,
  );
}

async function waitForCanvasUrlAfterPlaceholderStart(page, prototypeName) {
  await pollPageCondition(
    page,
    'canvas URL after prototype placeholder start',
    (expectedPrototypeName) => {
      const url = new URL(window.location.href);
      return url.searchParams.get('p') === expectedPrototypeName
        && url.searchParams.get('v') === 'canvas'
        && Boolean(window.__AXHUB_EXCALIDRAW_API__?.getSceneElements);
    },
    prototypeName,
    120_000,
  );
}

async function waitForVisibleComposerTextarea(page, selector, description = 'AI composer textarea', timeoutMs = 45_000) {
  await pollPageCondition(
    page,
    description,
    (composerSelector) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect?.();
        const style = window.getComputedStyle?.(element);
        return Boolean(
          rect
          && rect.width > 0
          && rect.height > 0
          && style?.display !== 'none'
          && style?.visibility !== 'hidden'
          && Number(style?.opacity || 1) > 0
        );
      };
      return Array.from(document.querySelectorAll(composerSelector)).some(isVisible);
    },
    selector,
    timeoutMs,
    500,
  );
}

async function openCanvasAiComposerFromCanvasStartLauncher(page) {
  await page.evaluate((launcherSelector) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect?.();
      const style = window.getComputedStyle?.(element);
      return Boolean(
        rect
        && rect.width > 0
        && rect.height > 0
        && style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && Number(style?.opacity || 1) > 0
      );
    };
    const launcher = Array.from(document.querySelectorAll(launcherSelector)).find(isVisible);
    if (!launcher) {
      throw new Error('Canvas AI start launcher is not visible.');
    }
    launcher.click();
  }, CANVAS_AI_LAUNCHER_SELECTOR);

  await pollPageCondition(
    page,
    'canvas start AI composer',
    (composerSelector) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect?.();
        const style = window.getComputedStyle?.(element);
        return Boolean(
          rect
          && rect.width > 0
          && rect.height > 0
          && style?.display !== 'none'
          && style?.visibility !== 'hidden'
          && Number(style?.opacity || 1) > 0
        );
      };
      const composer = Array.from(document.querySelectorAll(composerSelector)).find(isVisible);
      return Boolean(composer);
    },
    CANVAS_AI_COMPOSER_SELECTOR,
    45_000,
  );
}

function createRealAcpVisualAgent(page, { runId, visualAiEnabled }) {
  if (!visualAiEnabled) return null;
  return new PuppeteerAgent(page, {
    groupName: 'Axhub Make Real ACP Canvas Artifact Regression',
    groupDescription: 'Uses visual AI to drive the real Make canvas, right-side ACP UI, refresh recovery, and canvas artifact verification.',
    testId: `real-acp-canvas-artifact-${runId}`,
    aiActContext: REAL_ACP_VISUAL_AI_CONTEXT,
    replanningCycleLimit: 40,
    waitForNavigationTimeout: 15_000,
    waitForNetworkIdleTimeout: 0,
    forceSameTabNavigation: true,
    generateReport: false,
    cache: {
      id: 'axhub-make-real-acp-canvas-artifact',
      strategy: 'read-write',
    },
  });
}

async function runRealAcpVisualStep(visualAiAgent, diagnostics, name, prompt) {
  if (!visualAiAgent) {
    diagnostics.visualAiSteps.push({
      name,
      skipped: true,
      reason: 'visual AI disabled',
      at: Date.now(),
    });
    return null;
  }

  const startedAt = Date.now();
  try {
    const result = await visualAiAgent.aiAct(prompt, {
      cacheable: false,
    });
    diagnostics.visualAiSteps.push({
      name,
      status: 'passed',
      startedAt,
      endedAt: Date.now(),
      promptLength: String(prompt || '').length,
      promptPreview: String(prompt || '').slice(0, 1200),
      result: String(result || '').slice(0, 1000),
    });
    return result;
  } catch (error) {
    diagnostics.visualAiSteps.push({
      name,
      status: 'failed',
      startedAt,
      endedAt: Date.now(),
      promptLength: String(prompt || '').length,
      promptPreview: String(prompt || '').slice(0, 1200),
      error: error?.message || String(error),
      stack: error?.stack || '',
    });
    throw error;
  }
}

async function openCanvasAiComposerWithRealUserFlow({ page, visualAiAgent, diagnostics }) {
  await openCanvasAiComposerFromCanvasStartLauncher(page);

  if (visualAiAgent) {
    await runRealAcpVisualStep(
      visualAiAgent,
      diagnostics,
      'visual_open_canvas_ai_composer_from_canvas_start_launcher',
      '在当前 Make 画布里确认底部画布 AI 输入框已经打开。不要寻找顶部 AI 添加节点入口，也不要等待画布里出现旧 AI 生成占位节点。',
    );
  }

  await pollPageCondition(
    page,
    'canvas start AI composer opened by real user flow',
    (composerSelector) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect?.();
        const style = window.getComputedStyle?.(element);
        return Boolean(
          rect
          && rect.width > 0
          && rect.height > 0
          && style?.display !== 'none'
          && style?.visibility !== 'hidden'
          && Number(style?.opacity || 1) > 0
        );
      };
      return Array.from(document.querySelectorAll(composerSelector)).some(isVisible);
    },
    CANVAS_AI_COMPOSER_SELECTOR,
    45_000,
  );
}

async function submitPrototypePlaceholderStartPromptWithRealUserFlow({ page, visualAiAgent, diagnostics, prompt }) {
  if (visualAiAgent) {
    await runRealAcpVisualStep(
      visualAiAgent,
      diagnostics,
      'visual_submit_prototype_placeholder_start_prompt',
      `在原型占位初始页中找到主要的 AI 输入框，输入下面这段完整真实需求，然后点击可见的发送按钮提交。不要打开开发者工具，不要跳过页面。\n\n${prompt}`,
    );
  } else {
    await submitPrototypePlaceholderStartPrompt(page, prompt);
  }
}

async function waitForComposerPromptValue(page, selector, prompt) {
  await pollPageCondition(
    page,
    'real prompt text in AI composer',
    ({ composerSelector, expectedRunId, minLength }) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect?.();
        const style = window.getComputedStyle?.(element);
        return Boolean(
          rect
          && rect.width > 0
          && rect.height > 0
          && style?.display !== 'none'
          && style?.visibility !== 'hidden'
          && Number(style?.opacity || 1) > 0
        );
      };
      const textarea = Array.from(document.querySelectorAll(composerSelector)).find(isVisible);
      const value = String(textarea?.value || '');
      return value.length >= minLength && value.includes(expectedRunId);
    },
    {
      composerSelector: selector,
      expectedRunId: (String(prompt).match(/run id 是 ([^，,\s]+)/u) || [])[1] || '',
      minLength: Math.min(80, String(prompt).trim().length),
    },
    30_000,
    500,
  );
}

async function verifyCanvasArtifactsWithVisualAi({ visualAiAgent, diagnostics, runId }) {
  await runRealAcpVisualStep(
    visualAiAgent,
    diagnostics,
    'visual_verify_canvas_has_real_acp_artifacts',
    [
      `观察当前画布截图，确认本次 run id ${runId} 的真实 ACP 生成结果已经落到画布上。`,
      '画布中应该能看到四类产物节点或预览：prototype / 原型、image / 图片、drawio / 流程图、document / 文档。',
      '如果四类产物没有全部出现在画布上，请让这一步失败；不要只根据右侧聊天回复判断。',
    ].join('\n'),
  );
}

async function fillComposerPrompt(page, selector, prompt) {
  await waitForVisibleComposerTextarea(page, selector);
  const valueLength = await page.evaluate(({ composerSelector, expectedPrompt }) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect?.();
      const style = window.getComputedStyle?.(element);
      return Boolean(
        rect
        && rect.width > 0
        && rect.height > 0
        && style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && Number(style?.opacity || 1) > 0
      );
    };
    const textarea = Array.from(document.querySelectorAll(composerSelector)).find(isVisible);
    if (!textarea) return 0;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    valueSetter?.call(textarea, expectedPrompt);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: expectedPrompt }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    return textarea.value.trim().length;
  }, { composerSelector: selector, expectedPrompt: prompt });

  if (valueLength < Math.min(80, prompt.trim().length)) {
    throw new Error(`Canvas AI composer prompt was not filled: ${JSON.stringify({ valueLength, expectedLength: prompt.trim().length })}`);
  }
}

async function clickComposerSend(page, selector, prompt) {
  await waitForVisibleComposerTextarea(page, selector);
  await page.evaluate(({ composerSelector, promptText }) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect?.();
      const style = window.getComputedStyle?.(element);
      return Boolean(
        rect
        && rect.width > 0
        && rect.height > 0
        && style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && Number(style?.opacity || 1) > 0
      );
    };
    const textarea = Array.from(document.querySelectorAll(composerSelector)).find(isVisible);
    if (!textarea) {
      throw new Error('Canvas AI composer textarea is not available.');
    }
    if (!textarea.value.trim()) {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      valueSetter?.call(textarea, promptText);
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: promptText }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
    textarea.focus();
  }, { composerSelector: selector, promptText: prompt });

  await page.evaluate(({ composerSelector, composerRootSelector }) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect?.();
      const style = window.getComputedStyle?.(element);
      return Boolean(
        rect
        && rect.width > 0
        && rect.height > 0
        && style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && Number(style?.opacity || 1) > 0
      );
    };
    const textarea = Array.from(document.querySelectorAll(composerSelector)).find(isVisible);
    const root = textarea?.closest(composerRootSelector)
      || textarea?.closest('.ax-placeholder-display-composer')
      || textarea?.closest('.ax-ai-image-composer-host')
      || document;
    const buttons = Array.from(root.querySelectorAll('button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !button.disabled;
    });
    const sendButton = root.querySelector('.aui-composer-send, button[aria-label="发送"], button[aria-label="发送消息"], button[aria-label="AI 生成"], button[title="发送"], button[title="发送消息"], button[type="submit"]')
      || buttons.find((button) => /发送|send|submit/i.test([
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.className,
        button.textContent,
      ].filter(Boolean).join(' ')))
      || buttons.at(-1);
    if (!sendButton) {
      throw new Error(`Canvas AI composer send button is not available: ${JSON.stringify(buttons.map((button) => ({
        ariaLabel: button.getAttribute('aria-label'),
        title: button.getAttribute('title'),
        className: String(button.className || ''),
        text: button.textContent?.trim() || '',
      })))}`);
    }
    sendButton.click();
  }, { composerSelector: selector, composerRootSelector: CANVAS_AI_COMPOSER_ROOT_SELECTOR });
}

async function fillCanvasAiComposerPrompt(page, prompt) {
  await fillComposerPrompt(page, CANVAS_AI_COMPOSER_SELECTOR, prompt);
}

async function clickCanvasAiComposerSend(page, prompt) {
  await clickComposerSend(page, CANVAS_AI_COMPOSER_SELECTOR, prompt);
}

async function submitPrototypePlaceholderStartPrompt(page, prompt) {
  await fillComposerPrompt(page, PROTOTYPE_PLACEHOLDER_COMPOSER_SELECTOR, prompt);
  await clickComposerSend(page, PROTOTYPE_PLACEHOLDER_COMPOSER_SELECTOR, prompt);
}

async function collectSubmissionState(page, label = '') {
  return await page.evaluate((stateLabel) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity || 1) > 0;
    };
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const dataAttributesFor = (element) => {
      const result = {};
      let current = element;
      while (current && current !== document.body && Object.keys(result).length < 10) {
        for (const attribute of Array.from(current.attributes || [])) {
          if (attribute.name.startsWith('data-')) {
            result[attribute.name] = attribute.value || 'true';
          }
        }
        current = current.parentElement;
      }
      return result;
    };
    const textareas = Array.from(document.querySelectorAll('textarea')).map((textarea) => ({
      ariaLabel: textarea.getAttribute('aria-label') || '',
      placeholder: textarea.getAttribute('placeholder') || '',
      valueLength: textarea.value.length,
      valueSample: textarea.value.slice(0, 240),
      disabled: Boolean(textarea.disabled),
      visible: isVisible(textarea),
      rect: rectFor(textarea),
      dataAttributes: dataAttributesFor(textarea),
    }));
    const sendButtons = Array.from(document.querySelectorAll('button'))
      .map((button) => ({
        ariaLabel: button.getAttribute('aria-label') || '',
        title: button.getAttribute('title') || '',
        text: (button.textContent || '').trim().slice(0, 120),
        className: String(button.className || '').slice(0, 240),
        disabled: Boolean(button.disabled),
        visible: isVisible(button),
        rect: rectFor(button),
        dataAttributes: dataAttributesFor(button),
      }))
      .filter((button) => (
        button.visible
        && (/发送|send|submit|AI 生成/i.test([button.ariaLabel, button.title, button.text, button.className].join(' '))
          || button.className.includes('aui-composer-send'))
      ));
    const assistantIframes = Array.from(document.querySelectorAll('iframe')).map((iframe) => ({
      title: iframe.getAttribute('title') || '',
      src: iframe.src || '',
      visible: isVisible(iframe),
      rect: rectFor(iframe),
    }));
    const messageSurfaces = Array.from(document.querySelectorAll('.ant-message, .ant-message-notice, [data-sonner-toast], [role="alert"], [aria-live], .toast'))
      .map((element) => ({
        text: (element.textContent || '').trim().slice(0, 300),
        className: String(element.className || '').slice(0, 160),
        visible: isVisible(element),
        rect: rectFor(element),
      }))
      .filter((surface) => surface.text);
    const canvasStartLauncher = document.querySelector('[data-axhub-canvas-start-ai-launcher]');
    const canvasStartComposer = document.querySelector('[data-axhub-canvas-start-composer]');
    return {
      label: stateLabel,
      at: Date.now(),
      url: window.location.href,
      bodyTextSample: String(document.body?.innerText || '').slice(0, 1200),
      activeElement: {
        tagName: document.activeElement?.tagName || '',
        ariaLabel: document.activeElement?.getAttribute?.('aria-label') || '',
        className: String(document.activeElement?.className || '').slice(0, 160),
      },
      composerTextareas: textareas,
      sendButtons,
      assistantIframes,
      messageSurfaces,
      canvasStartLauncher: canvasStartLauncher ? rectFor(canvasStartLauncher) : null,
      canvasStartComposer: canvasStartComposer ? rectFor(canvasStartComposer) : null,
    };
  }, label).catch((error) => ({
    label,
    at: Date.now(),
    error: error?.message || String(error),
  }));
}

async function recordSubmissionState(page, diagnostics, label) {
  const state = await collectSubmissionState(page, label);
  diagnostics.submissionStates.push(state);
  return state;
}

async function waitForRealAcpIframe(page, acpOrigin) {
  await pollPageCondition(
    page,
    'real ACP UI iframe',
    (expectedOrigin) => {
      const iframe = document.querySelector('iframe[title="ACP UI"]');
      if (!iframe?.contentWindow) return false;
      try {
        const iframeOrigin = new URL(iframe.src).origin;
        return iframeOrigin === expectedOrigin && iframe.clientWidth >= 280 && iframe.clientHeight >= 400;
      } catch {
        return false;
      }
    },
    acpOrigin,
    90_000,
  );
}

async function waitForRealAcpChatRequest(diagnostics, acpOrigin, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = diagnostics.requests.some((request) => {
      const rawUrl = String(request.url || '');
      if (!rawUrl.includes('/api/chat')) return false;
      try {
        const url = new URL(rawUrl);
        return url.origin === acpOrigin
          && url.pathname === '/api/chat'
          && String(request.method || '').toUpperCase() === 'POST';
      } catch {
        return false;
      }
    });
    if (found) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for real ACP /api/chat POST request: ${JSON.stringify(diagnostics.requests.slice(-20))}`);
}

async function waitForRealAcpCanvasActiveWrite({
  baseUrl,
  projectId,
  prototypeName,
  diagnostics,
  requiredKinds = REQUIRED_ARTIFACT_KINDS,
  timeoutMs = 420_000,
}) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  let latestCoverage = null;
  let latestReloadEvents = [];
  let latestCanvasRequests = [];

  while (Date.now() < deadline) {
    const canvasResourcePath = getCanvasResourcePathForPrototype(prototypeName);
    const canvasApiPath = `/api/canvas/resources/${encodeCanvasApiPath(canvasResourcePath)}`;
    const url = buildResourceCanvasApiUrl(baseUrl, canvasResourcePath);
    appendProjectIdSearchParam(url, projectId);
    latest = await fetchJson(url).catch((error) => ({
      error: error?.message || String(error),
    }));
    const generatedElements = collectPersistedCanvasGeneratedElements(latest);
    latestCoverage = summarizeArtifactKindCoverage(generatedElements, requiredKinds);
    latestReloadEvents = (diagnostics.nodeEventLog || [])
      .filter((event) => event?.channel === 'canvas-bridge.message' && event.data?.type === 'canvas.reload');
    latestCanvasRequests = (diagnostics.canvasSaveRequests || [])
      .filter((request) => {
        try {
          const requestUrl = new URL(request.url);
          return requestUrl.pathname.includes(canvasApiPath);
        } catch {
          return false;
        }
      });
    if (latestCoverage.allRequiredKindsPresent) {
      return {
        source: 'canvas-file',
        canvasName: `resources/${canvasResourcePath}`,
        elementCount: Array.isArray(latest?.elements) ? latest.elements.length : 0,
        requiredKinds,
        generatedElements,
        coverage: latestCoverage,
        canvasBridgeReloadCount: latestReloadEvents.length,
        latestCanvasBridgeReload: latestReloadEvents.at(-1) || null,
        canvasRequests: latestCanvasRequests.slice(-20),
      };
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for real ACP canvas active write result: ${JSON.stringify({
    canvasName: `resources/${getCanvasResourcePathForPrototype(prototypeName)}`,
    latestCoverage,
    latestCanvasBridgeReloadCount: latestReloadEvents.length,
    latestCanvasRequests: latestCanvasRequests.slice(-20),
    latest,
  })}`);
}

async function waitForRealAcpCanvasElements(page, requiredArtifacts) {
  await pollPageCondition(
    page,
    'real ACP canvas artifact elements',
    ({ required, previewKindByArtifactKind }) => {
      const elements = window.__AXHUB_EXCALIDRAW_API__?.getSceneElements?.() || [];
      const generated = elements
        .filter((element) => (
          !element?.isDeleted
          && element?.customData?.generatedBy === 'axhub-ai-generation'
        ));
      const matches = required.map((artifact) => {
        const expectedPreviewKind = previewKindByArtifactKind[artifact.kind] || artifact.previewKind || '';
        return generated.find((element) => {
          const customData = element?.customData || {};
          return customData?.aiArtifact?.kind === artifact.kind
            && (!expectedPreviewKind || customData?.previewKind === expectedPreviewKind);
        }) || null;
      });
      const generatedSummary = generated.map((element) => ({
        elementId: element.id || '',
        sourceArtifactId: element.customData?.sourceArtifactId || '',
        kind: element.customData?.aiArtifact?.kind || '',
        previewKind: element.customData?.previewKind || '',
        path: element.customData?.aiArtifact?.target?.path || '',
        title: element.customData?.title || '',
      }));
      window.__AXHUB_REAL_ACP_CANVAS_MATCHES__ = matches.map((match, index) => ({
        required: required[index],
        found: Boolean(match),
        elementId: match?.id || '',
        sourceArtifactId: match?.customData?.sourceArtifactId || '',
        kind: match?.customData?.aiArtifact?.kind || '',
        previewKind: match?.customData?.previewKind || '',
        path: match?.customData?.aiArtifact?.target?.path || '',
      }));
      window.__AXHUB_REAL_ACP_CANVAS_GENERATED_SUMMARY__ = generatedSummary;
      return matches.every(Boolean);
    },
    {
      required: requiredArtifacts,
      previewKindByArtifactKind: REQUIRED_ARTIFACT_PREVIEW_KIND,
    },
    60_000,
  );
}

async function waitForGenerationHistory(baseUrl, projectId, prototypeName, requiredKinds = REQUIRED_ARTIFACT_KINDS, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  let latestCoverage = null;
  while (Date.now() < deadline) {
    const url = new URL('/api/ai/artifact-history', baseUrl);
    url.searchParams.set('targetPath', `prototypes/${prototypeName}`);
    appendProjectIdSearchParam(url, projectId);
    latest = await fetchJson(url);
    const records = Array.isArray(latest?.artifacts) ? latest.artifacts : [];
    latestCoverage = summarizeArtifactKindCoverage(records, requiredKinds);
    if (latestCoverage.allRequiredKindsPresent) {
      return {
        ...latest,
        requiredKinds,
        coverage: latestCoverage,
      };
    }
    await sleep(750);
  }
  throw new Error(`Timed out waiting for generation history records: ${JSON.stringify({
    latest,
    coverage: latestCoverage,
  })}`);
}

function collectPersistedCanvasGeneratedElements(canvasDocument) {
  const elements = Array.isArray(canvasDocument?.elements) ? canvasDocument.elements : [];
  return elements
    .filter((element) => (
      !element?.isDeleted
      && element?.customData?.generatedBy === 'axhub-ai-generation'
    ))
    .map((element) => ({
      id: String(element.id || ''),
      type: String(element.type || ''),
      sourceArtifactId: String(element.customData?.sourceArtifactId || ''),
      kind: String(element.customData?.aiArtifact?.kind || ''),
      previewKind: String(element.customData?.previewKind || ''),
      path: String(element.customData?.aiArtifact?.target?.path || ''),
      title: String(element.customData?.title || ''),
    }));
}

async function waitForPersistedCanvasArtifactElements(baseUrl, prototypeName, projectId, requiredKinds = REQUIRED_ARTIFACT_KINDS, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  let latestCoverage = null;
  const canvasResourcePath = getCanvasResourcePathForPrototype(prototypeName);
  while (Date.now() < deadline) {
    const url = buildResourceCanvasApiUrl(baseUrl, canvasResourcePath);
    appendProjectIdSearchParam(url, projectId);
    latest = await fetchJson(url).catch((error) => ({
      error: error?.message || String(error),
    }));
    const generatedElements = collectPersistedCanvasGeneratedElements(latest);
    latestCoverage = summarizeArtifactKindCoverage(generatedElements, requiredKinds);
    if (latestCoverage.allRequiredKindsPresent) {
      return {
        canvasName: `resources/${canvasResourcePath}`,
        elementCount: Array.isArray(latest?.elements) ? latest.elements.length : 0,
        requiredKinds,
        generatedElements,
        coverage: latestCoverage,
      };
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for real ACP persisted canvas artifact elements: ${JSON.stringify({
    latest,
    coverage: latestCoverage,
  })}`);
}

async function focusRealAcpCanvasElements(page, requiredKinds = REQUIRED_ARTIFACT_KINDS) {
  await page.evaluate((kinds) => {
    const api = window.__AXHUB_EXCALIDRAW_API__;
    const elements = api?.getSceneElements?.() || [];
    const required = new Set(kinds);
    const targets = elements.filter((element) => (
      !element?.isDeleted
      && element.customData?.generatedBy === 'axhub-ai-generation'
      && required.has(element.customData?.aiArtifact?.kind)
    ));
    if (targets.length) {
      api.scrollToContent(targets[targets.length - 1].id, { fitToContent: true, animate: false });
    }
  }, requiredKinds);
}

function countRealAcpPostMessageTypes(events, minAt, expectedTypes) {
  const counts = Object.fromEntries(expectedTypes.map((type) => [type, 0]));
  for (const event of events || []) {
    const type = String(event?.data?.type || '');
    if (event?.channel !== 'message' || !expectedTypes.includes(type)) continue;
    if (Number(event?.at || event?.recordedAt || 0) < minAt) continue;
    counts[type] += 1;
  }
  return counts;
}

async function waitForRealAcpRefreshPostMessageAcks(page, diagnostics, startedAt) {
  const expectedTypes = ['acp.ui.ready', 'acp.runtime.result', 'acp.context.result'];
  const deadline = Date.now() + 20_000;
  let latest = null;
  while (Date.now() < deadline) {
    const browserEvents = await page.evaluate(() => window.__AXHUB_REAL_ACP_EVENT_LOG__ || []).catch(() => []);
    const events = (diagnostics.nodeEventLog || []).concat(browserEvents);
    const counts = countRealAcpPostMessageTypes(events, startedAt, expectedTypes);
    const missingTypes = expectedTypes.filter((type) => counts[type] < 1);
    latest = {
      counts,
      missingTypes,
    };
    if (missingTypes.length === 0) {
      return latest;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for real ACP refresh postMessage ready/runtime/context acknowledgements: ${JSON.stringify(latest)}`);
}

async function refreshCanvasPageForRecovery({ page, frames, frameDir, label, acpOrigin, diagnostics }) {
  await capture(page, frames, frameDir, `${label}：刷新前现场`);
  const refreshStartedAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await ensureBrowserEventRecorderInstalled(page);
  await waitForCanvasReady(page);
  await waitForRealAcpIframe(page, acpOrigin);
  await waitForRealAcpRefreshPostMessageAcks(page, diagnostics, refreshStartedAt);
  await capture(page, frames, frameDir, `${label}：刷新后画布和真实 ACP iframe 已恢复`);
}

async function getPageState(page) {
  return await page.evaluate(() => {
    const events = window.__AXHUB_REAL_ACP_EVENT_LOG__ || [];
    const elements = window.__AXHUB_EXCALIDRAW_API__?.getSceneElements?.() || [];
    return {
      url: window.location.href,
      textSample: String(document.body?.innerText || '').slice(0, 2000),
      assistantIframe: Array.from(document.querySelectorAll('iframe[title="ACP UI"]')).map((iframe) => ({
        src: iframe.src,
        width: iframe.clientWidth,
        height: iframe.clientHeight,
      })),
      eventLog: events.slice(-80),
      canvasMatches: window.__AXHUB_REAL_ACP_CANVAS_MATCHES__ || [],
      generatedElements: elements
        .filter((element) => !element?.isDeleted && element.customData?.generatedBy === 'axhub-ai-generation')
        .map((element) => ({
          id: element.id,
          type: element.type,
          sourceArtifactId: element.customData?.sourceArtifactId || '',
          kind: element.customData?.aiArtifact?.kind || '',
          previewKind: element.customData?.previewKind || '',
          path: element.customData?.aiArtifact?.target?.path || '',
          title: element.customData?.title || '',
        })),
    };
  }).catch((error) => ({ error: error?.message || String(error) }));
}

async function main() {
  const baseEnv = await buildBaseEnv();
  Object.assign(process.env, baseEnv);
  const runId = resolveRunId(baseEnv);
  const entryMode = resolveRealAcpEntryMode(baseEnv);
  const recoveryMode = resolveRealAcpRecoveryMode(baseEnv);
  const visualAiEnabled = resolveRealAcpVisualAiEnabled(baseEnv);
  const entryMetadata = getRealAcpEntryMetadata(entryMode);
  const requiredArtifacts = buildRequiredArtifacts();
  const requiredKinds = REQUIRED_ARTIFACT_KINDS;
  const projectId = baseEnv.AXHUB_MAKE_E2E_PROJECT_ID || DEFAULT_PROJECT_ID;
  const acpProjectRoot = resolveRealAcpProjectRoot(baseEnv);
  const explicitClientRoot = baseEnv.AXHUB_MAKE_E2E_WORKSPACE_PATH
    ? path.resolve(baseEnv.AXHUB_MAKE_E2E_WORKSPACE_PATH)
    : '';
  let clientRoot = explicitClientRoot;
  const acpWebBaseUrl = (baseEnv.AXHUB_ASSISTANT_WEB_BASE_URL || baseEnv.AXHUB_ACP_UI_BASE_URL || DEFAULT_ACP_WEB_BASE_URL).replace(/\/+$/u, '');
  const acpApiBaseUrl = (baseEnv.AXHUB_ASSISTANT_API_BASE_URL || DEFAULT_ACP_API_BASE_URL).replace(/\/+$/u, '');
  const acpOrigin = new URL(acpWebBaseUrl).origin;
  const restartAcp = boolFromEnv(baseEnv.AXHUB_MAKE_REAL_ACP_RESTART, true);
  const keepServers = boolFromEnv(baseEnv.AXHUB_MAKE_E2E_KEEP_SERVERS, false);
  const useDevServer = boolFromEnv(baseEnv.AXHUB_MAKE_E2E_USE_DEV_SERVER, false);
  const port = Number(baseEnv.AXHUB_MAKE_E2E_PORT || 0) || await getFreePort();
  const baseUrl = baseEnv.AXHUB_MAKE_E2E_BASE_URL || `http://127.0.0.1:${port}`;
  const artifactsRoot = path.resolve(
    baseEnv.AXHUB_MAKE_E2E_ARTIFACTS_DIR || path.join(rootDir, 'automation-reports', 'visual', `real-acp-canvas-artifact-${runId}`),
  );
  const frameDir = path.join(artifactsRoot, 'frames');
  const htmlPath = path.join(artifactsRoot, 'real-acp-canvas-artifact.html');
  const summaryPath = path.join(artifactsRoot, 'summary.json');
  const diagnostics = {
    console: [],
    pageErrors: [],
    requests: [],
    requestFailures: [],
    responses: [],
    chatRequests: [],
    chatResponses: [],
    canvasSaveRequests: [],
    submissionStates: [],
    pageNavigations: [],
    popups: [],
    browserTargets: [],
    browserPageStates: [],
    nodeEventLog: [],
    visualAiSteps: [],
  };
  const frames = [];
  let acpServer = null;
  let makeServer = null;
  let browser = null;
  let visualAiAgent = null;
  let runtime = null;
  let canvasPrototype = '';
  let entryUrl = '';
  let canvasUrl = '';
  let status = 'failed';
  let failure = null;
  let history = null;
  let pageState = null;
  let persistedCanvas = null;
  let workspaceArtifacts = null;
  let acpSessions = null;
  let acpConversations = null;
  let acpServerLogTail = '';
  let chatRequestWorkspacePaths = [];
  let activeCanvasWriteResult = null;

  const refreshExternalDiagnostics = async () => {
    const observedPaths = collectObservedWorkspaceArtifactPaths({
      diagnostics,
      pageState,
      persistedCanvas,
      history,
    });
    workspaceArtifacts = clientRoot
      ? await scanObservedWorkspaceArtifacts(clientRoot, observedPaths).catch((error) => ({
        error: error?.message || String(error),
      }))
      : workspaceArtifacts;
    chatRequestWorkspacePaths = extractChatRequestWorkspacePaths(diagnostics);
    acpSessions = await fetchAcpChatSessions(acpApiBaseUrl).catch((error) => ({
      ok: false,
      status: 0,
      error: error?.message || String(error),
    }));
    acpConversations = await fetchAcpConversationSummary(acpApiBaseUrl, clientRoot).catch((error) => ({
      ok: false,
      status: 0,
      error: error?.message || String(error),
    }));
    acpServerLogTail = acpServer?.logTail?.() || await readTextFile(path.join(artifactsRoot, 'acp-server.log')).catch(() => '');
  };

  await fs.mkdir(frameDir, { recursive: true });

  const runEnv = {
    ...baseEnv,
    AXHUB_ASSISTANT_WEB_BASE_URL: acpWebBaseUrl,
    AXHUB_ASSISTANT_API_BASE_URL: acpApiBaseUrl,
    AXHUB_MAKE_E2E_PROJECT_ID: projectId,
  };
  if (acpProjectRoot) {
    runEnv.AXHUB_ACP_UI_PROJECT_ROOT = acpProjectRoot;
  }

  try {
    if (!acpProjectRoot) {
      throw new Error('AXHUB_ACP_UI_PROJECT_ROOT is required for real ACP UI regression. Set it to your local acp-ui checkout, for example: AXHUB_ACP_UI_PROJECT_ROOT=/path/to/acp-ui pnpm test:frontend:real-acp-canvas-artifact');
    }
    if (!(await pathExists(path.join(acpProjectRoot, 'package.json')))) {
      throw new Error(`Real ACP UI project root is not available: ${acpProjectRoot}`);
    }

    if (!useDevServer) {
      await ensureStaticAdminBuild({
        env: runEnv,
        logFile: path.join(artifactsRoot, 'make-admin-build.log'),
      });
    }

    makeServer = await startMakeServer({
      baseUrl,
      env: runEnv,
      logFile: path.join(artifactsRoot, 'make-server.log'),
      useDevServer,
    });
    await ensureActiveProject(baseUrl, projectId);
    clientRoot = explicitClientRoot || await resolveActiveProjectRoot(baseUrl, projectId);
    if (!(await pathExists(path.join(clientRoot, 'package.json')))) {
      throw new Error(`Make client workspace is not available: ${clientRoot}`);
    }

    runEnv.ACP_UI_DEFAULT_WORKSPACE_PATH = clientRoot;

    if (restartAcp) {
      await releasePort(getPort(acpWebBaseUrl));
    }

    acpServer = await startRealAcpServer({
      acpProjectRoot,
      acpWebBaseUrl,
      baseUrl,
      env: runEnv,
      logFile: path.join(artifactsRoot, 'acp-server.log'),
    });

    canvasPrototype = await createRecordingPrototype(baseUrl, projectId);

    runtime = await waitForAssistantRuntimeReady(baseUrl, projectId);
    if (new URL(runtime.webBaseUrl).origin !== acpOrigin) {
      throw new Error(`Assistant runtime did not resolve to the expected ACP origin: ${JSON.stringify({ expected: acpOrigin, runtime })}`);
    }

    const executablePath = await findSystemChrome();
    if (!executablePath) {
      throw new Error('Could not find Chrome/Chromium for real ACP canvas artifact regression.');
    }
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      defaultViewport: DEFAULT_VIEWPORT,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--window-size=${DEFAULT_VIEWPORT.width},${DEFAULT_VIEWPORT.height}`,
      ],
      protocolTimeout: 180_000,
    });
    attachBrowserTargetDiagnostics(browser, diagnostics);
    const page = await browser.newPage();
    attachBrowserDiagnostics(page, diagnostics);
    await installNodeEventRecorder(page, diagnostics);
    await installBrowserEventRecorder(page);
    visualAiAgent = createRealAcpVisualAgent(page, { runId, visualAiEnabled });

    const canvasTargetUrl = new URL(baseUrl);
    canvasTargetUrl.searchParams.set('projectId', projectId);
    canvasTargetUrl.searchParams.set('p', canvasPrototype);
    canvasTargetUrl.searchParams.set('v', 'canvas');
    canvasUrl = canvasTargetUrl.toString();

    const entryTargetUrl = new URL(baseUrl);
    entryTargetUrl.searchParams.set('projectId', projectId);
    entryTargetUrl.searchParams.set('p', canvasPrototype);
    if (entryMode === REAL_ACP_ENTRY_CANVAS_START) {
      entryTargetUrl.searchParams.set('v', 'canvas');
    }
    entryUrl = entryTargetUrl.toString();

    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await ensureBrowserEventRecorderInstalled(page);

    const prompt = buildRealAcpPrompt({ runId, prototypeName: canvasPrototype });

    if (entryMode === REAL_ACP_ENTRY_PLACEHOLDER_START) {
      await waitForPrototypePlaceholderStartPage(page);
      await recordSubmissionState(page, diagnostics, 'prototype placeholder start page ready');
      await capture(page, frames, frameDir, '1. 原型占位初始页已打开，准备从起始输入框提交给真实右侧 ACP UI');

      await submitPrototypePlaceholderStartPromptWithRealUserFlow({
        page,
        visualAiAgent,
        diagnostics,
        prompt,
      });
      await recordSubmissionState(page, diagnostics, 'after submitting prototype placeholder start prompt');
      await capture(page, frames, frameDir, '2. 原型占位页 prompt 已通过真实可见输入提交，页面正在进入空画布并打开右侧 ACP UI');

      await waitForCanvasUrlAfterPlaceholderStart(page, canvasPrototype);
      canvasUrl = page.url();
      await waitForRealAcpIframe(page, acpOrigin);
      await recordSubmissionState(page, diagnostics, 'after placeholder start opened canvas and real ACP iframe');
      await capture(page, frames, frameDir, '3. 占位页提交后已进入空画布，右侧真实 ACP UI iframe 已打开并开始真实生成');
    } else {
      await waitForCanvasReady(page);
      await capture(page, frames, frameDir, '1. 真实 Make 画布已打开，准备通过画布 AI composer 调起右侧 ACP UI');

      await openCanvasAiComposerWithRealUserFlow({
        page,
        visualAiAgent,
        diagnostics,
      });
      await capture(page, frames, frameDir, '2. 画布 AI 元素和 composer 已出现，用户需求仍从画布输入');

      if (!visualAiAgent) {
        await fillCanvasAiComposerPrompt(page, prompt);
      } else {
        await runRealAcpVisualStep(
          visualAiAgent,
          diagnostics,
          'visual_fill_canvas_ai_composer_prompt_for_capture',
          `在已经打开的画布 AI 生成输入框中输入下面这段完整真实需求。输入完成后不要发送，停留在输入框里。\n\n${prompt}`,
        );
      }
      await waitForComposerPromptValue(page, CANVAS_AI_COMPOSER_SELECTOR, prompt);
      await recordSubmissionState(page, diagnostics, 'after filling canvas composer prompt');
      await capture(page, frames, frameDir, '3. 画布 composer 已通过真实可见输入填入 prompt，准备提交到右侧 ACP UI');

      if (!visualAiAgent) {
        await clickCanvasAiComposerSend(page, prompt);
      } else {
        await runRealAcpVisualStep(
          visualAiAgent,
          diagnostics,
          'visual_send_canvas_ai_composer_prompt_for_real_acp',
          '点击当前画布 AI 生成输入框旁边可见的发送按钮，把已经输入的真实需求发送给右侧 ACP UI。',
        );
      }
      await recordSubmissionState(page, diagnostics, 'after clicking canvas composer send');
      await waitForRealAcpIframe(page, acpOrigin);
      await recordSubmissionState(page, diagnostics, 'after real ACP iframe opened');
      await capture(page, frames, frameDir, '4. composer 提交后，右侧真实 ACP UI iframe 已打开并开始真实生成');
    }

    if (recoveryMode === REAL_ACP_RECOVERY_REFRESH_DURING_GENERATION) {
      await refreshCanvasPageForRecovery({
        page,
        frames,
        frameDir,
        label: '4R. 生成中刷新恢复',
        acpOrigin,
        diagnostics,
      });
      await runRealAcpVisualStep(
        visualAiAgent,
        diagnostics,
        'visual_verify_refresh_during_generation_recovery',
        '确认刷新后仍然位于当前 Make 画布，右侧 ACP UI iframe 已恢复可见，页面不是空白页或错误页，真实生成会话可以继续等待。',
      );
    }

    await waitForRealAcpChatRequest(diagnostics, acpOrigin);
    await refreshExternalDiagnostics();
    await capture(page, frames, frameDir, '5. 已通过真实可见输入触发右侧 ACP，并发起真实 /api/chat provider 请求');

    activeCanvasWriteResult = await waitForRealAcpCanvasActiveWrite({
      diagnostics,
      baseUrl,
      projectId,
      prototypeName: canvasPrototype,
      requiredKinds,
    });

    if (recoveryMode === REAL_ACP_RECOVERY_REFRESH_AFTER_CANVAS_WRITE) {
      await refreshCanvasPageForRecovery({
        page,
        frames,
        frameDir,
        label: '6R. 画布写入后刷新恢复',
        acpOrigin,
        diagnostics,
      });
      await runRealAcpVisualStep(
        visualAiAgent,
        diagnostics,
        'visual_verify_refresh_after_canvas_write_recovery',
        '确认刷新后仍然位于当前 Make 画布，右侧 ACP UI iframe 已恢复可见，AI 主动写入的画布产物没有变成空白或错误状态。',
      );
    }

    await waitForRealAcpCanvasElements(page, requiredArtifacts);
    await focusRealAcpCanvasElements(page, requiredKinds);
    await sleep(800);
    await verifyCanvasArtifactsWithVisualAi({
      visualAiAgent,
      diagnostics,
      runId,
    });
    await capture(page, frames, frameDir, '6. AI 主动写入 canvas.excalidraw 后，prototype / image / drawio / document 四类真实产物均已落入画布');

    persistedCanvas = await waitForPersistedCanvasArtifactElements(baseUrl, canvasPrototype, projectId, requiredKinds);
    await refreshExternalDiagnostics();
    await capture(page, frames, frameDir, '7. canvas.excalidraw 已持久化四类真实产物元素，重开画布仍可显示');

    history = await waitForGenerationHistory(baseUrl, projectId, canvasPrototype, requiredKinds);
    await refreshExternalDiagnostics();
    await capture(page, frames, frameDir, '8. 生成记录已写入当前资源画布，四类 artifact 可被历史接口读取');
    pageState = await getPageState(page);
    await refreshExternalDiagnostics();
    diagnostics.browserPageStates = await collectBrowserPageStates(browser);
    status = 'passed';

    await writeHtmlReport({
      htmlPath,
      frames,
      metadata: {
        suiteName: SUITE_NAME,
        status,
        runId,
        entryMode,
        recoveryMode,
        entryUrl,
        entryMetadata,
        baseUrl,
        canvasUrl,
        acpWebBaseUrl,
        acpApiBaseUrl,
        acpProjectRoot,
        clientRoot,
        explicitClientRoot,
        chatRequestWorkspacePaths,
        projectId,
        canvasPrototype,
        runtime,
        visualAiEnabled,
        requiredArtifacts,
        requiredKinds,
        activeCanvasWriteResult,
        persistedCanvas,
        workspaceArtifacts,
        acpSessions,
        acpConversations,
        acpServerLogTail,
        pageState,
        diagnostics,
      },
    });
  } catch (error) {
    failure = {
      message: error?.message || String(error),
      stack: error?.stack || '',
    };
    if (browser) {
      const pages = await browser.pages().catch(() => []);
      const page = pages[pages.length - 1];
      if (page) {
        await recordSubmissionState(page, diagnostics, `failure: ${failure.message}`).catch(() => {});
        pageState = await getPageState(page);
        diagnostics.browserPageStates = await collectBrowserPageStates(browser);
        await capture(page, frames, frameDir, `失败现场：${failure.message}`).catch(() => {});
      }
    }
    await refreshExternalDiagnostics().catch(() => {});
    await writeHtmlReport({
      htmlPath,
      frames,
      metadata: {
        suiteName: SUITE_NAME,
        status,
        failure,
        runId,
        entryMode,
        recoveryMode,
        entryUrl,
        entryMetadata,
        baseUrl,
        canvasUrl,
        acpWebBaseUrl,
        acpApiBaseUrl,
        acpProjectRoot,
        clientRoot,
        explicitClientRoot,
        chatRequestWorkspacePaths,
        projectId,
        canvasPrototype,
        runtime,
        visualAiEnabled,
        requiredArtifacts,
        requiredKinds,
        persistedCanvas,
        workspaceArtifacts,
        acpSessions,
        acpConversations,
        acpServerLogTail,
        pageState,
        diagnostics,
      },
    }).catch(() => {});
  } finally {
    const summary = {
      suiteName: SUITE_NAME,
      status,
      failure,
      htmlPath,
      artifactsRoot,
      frameCount: frames.length,
      runId,
      entryMode,
      recoveryMode,
      entryUrl,
      entryMetadata,
      baseUrl,
      canvasUrl,
      acpWebBaseUrl,
      acpApiBaseUrl,
      acpProjectRoot,
      clientRoot,
      explicitClientRoot,
      chatRequestWorkspacePaths,
      projectId,
      canvasPrototype,
      requiredArtifacts,
      requiredKinds,
      activeCanvasWriteResult,
      runtime,
      visualAiEnabled,
      history,
      persistedCanvas,
      workspaceArtifacts,
      acpSessions,
      acpConversations,
      acpServerLogTail,
      pageState,
      diagnostics,
      keepServers,
    };
    await visualAiAgent?.destroy().catch((error) => {
      diagnostics.visualAiSteps.push({
        name: 'visual_ai_agent_destroy',
        status: 'failed',
        error: error?.message || String(error),
        at: Date.now(),
      });
    });
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`).catch(() => {});
    if (!keepServers) {
      await browser?.close().catch(() => {});
      await makeServer?.close().catch(() => {});
      await acpServer?.close().catch(() => {});
    } else {
      await browser?.close().catch(() => {});
      await acpServer?.flushLog?.().catch(() => {});
    }
    console.log(JSON.stringify({
      status,
      htmlPath,
      summaryPath,
      artifactsRoot,
      entryMode,
      entryUrl,
      canvasUrl,
      visualAiEnabled,
      failure,
      keepServers,
    }, null, 2));
  }

  if (status !== 'passed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
