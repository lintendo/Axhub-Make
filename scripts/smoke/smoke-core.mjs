import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(__dirname, '../..');
export const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');

export const JOURNEY_DEFINITIONS = [
  {
    id: 'assistant-chat',
    title: 'AI 助手启动和对话',
  },
  {
    id: 'create-prototype-and-image',
    title: '新建原型，原型和图片创建',
  },
  {
    id: 'canvas-ai-generation',
    title: '画布内原型和图片，Drawio 图表，AI 生成',
  },
  {
    id: 'comments-and-execution',
    title: '批注功能，批注与执行',
  },
  {
    id: 'make-project-registration',
    title: 'Make 项目导入、激活和运行状态',
  },
  {
    id: 'export-and-cloud-publish',
    title: 'HTML 导出和云服务发布',
  },
  {
    id: 'library-imports',
    title: '模板库和设计系统库导入',
  },
  {
    id: 'resource-crud',
    title: '文档、数据和主题资源增删改',
  },
  {
    id: 'git-versioning',
    title: 'Git 版本、差异、构建和恢复',
  },
  {
    id: 'review-and-design-decisions',
    title: '代码评审、UI/原型评审和设计决策归档',
  },
];

export function shouldUseRealAi({ env = process.env, argv = process.argv.slice(2) } = {}) {
  if (argv.includes('--mock-ai')) return false;
  return argv.includes('--real-ai') || env.AXHUB_SMOKE_REAL_AI === '1';
}

function readArgValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return '';
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : '';
}

export function createSmokeOptions({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  now = new Date(),
} = {}) {
  const reportDir = readArgValue(argv, '--report-dir')
    || env.AXHUB_SMOKE_REPORT_DIR
    || path.resolve(cwd, '../../.local/test-results/axhub-make-smoke');
  return {
    cwd,
    now,
    keepTemp: argv.includes('--keep-temp') || env.AXHUB_SMOKE_KEEP_TEMP === '1',
    realAi: shouldUseRealAi({ env, argv }),
    reportDir: path.resolve(cwd, reportDir),
    requestedJourneyIds: readArgValue(argv, '--journey')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export function createSmokeReportPath(options) {
  const timestamp = options.now.toISOString().replace(/[:.]/gu, '-');
  return path.join(options.reportDir, `smoke-${timestamp}.json`);
}

export function assertOk(condition, message, details = undefined) {
  if (condition) return;
  const error = new Error(message);
  if (details !== undefined) {
    error.details = details;
  }
  throw error;
}

export function createJsonResponse(body, status = 200, headers = {}) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const error = new Error(`${init.method || 'GET'} ${url} returned ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return {
    status: response.status,
    body,
    headers: response.headers,
  };
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function createTinyPngDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
}

export function createSvgDataUrl(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" rx="12" fill="#f1f5f9"/><text x="24" y="96" font-family="Arial" font-size="20" fill="#0f172a">${escapeXml(label)}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

export function createDefaultCanvasData() {
  return {
    type: 'excalidraw',
    version: 2,
    source: '@axhub/make-smoke',
    elements: [],
    appState: {
      viewBackgroundColor: '#ffffff',
    },
    files: {},
  };
}

export function createImageElement({
  id,
  fileId,
  x,
  y,
  width,
  height,
  customData,
}) {
  return {
    id,
    type: 'image',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    fileId,
    status: 'saved',
    scale: [1, 1],
    crop: null,
    customData,
  };
}

export function createEmbeddableElement({
  id,
  x,
  y,
  width,
  height,
  link,
  customData,
}) {
  return {
    id,
    type: 'embeddable',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#008f5d',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: { type: 3 },
    seed: 2,
    version: 1,
    versionNonce: 2,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link,
    locked: false,
    customData,
  };
}

function smokeProjectMetadata(projectRoot, assistantOrigin) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    project: {
      id: 'smoke-client',
      name: 'Axhub Make Smoke Client',
    },
    resources: {
      prototypes: [],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: {
      prototypes: [],
      docs: [],
    },
    orders: {
      themes: [],
      data: [],
      templates: [],
    },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: false,
      axureExport: false,
      localExports: {
        html: true,
        make: false,
      },
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
      prototypes: {
        type: 'project-relative-path',
        path: 'src/prototypes',
      },
      docs: {
        type: 'project-relative-path',
        path: 'src/resources',
      },
      themes: {
        type: 'project-relative-path',
        path: 'src/themes',
      },
      data: {
        type: 'project-relative-path',
        path: 'src/resources/data',
      },
      templates: {
        type: 'project-relative-path',
        path: 'src/resources/templates',
      },
      media: {
        type: 'project-relative-path',
        path: 'src/resources/media',
      },
    },
    updatedAt: now,
    smoke: {
      assistantOrigin,
      projectRoot,
    },
  };
}

export function createSmokeProject({ root, registryHome, assistantOrigin }) {
  const projectRoot = root || fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-smoke-client-'));
  fs.mkdirSync(path.join(projectRoot, 'src/prototypes'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src/docs'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.axhub/make'), { recursive: true });
  writeJson(path.join(projectRoot, 'package.json'), {
    name: 'axhub-make-smoke-client',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
    dependencies: {
      react: '18.2.0',
      'react-dom': '18.2.0',
    },
  });
  writeJson(path.join(projectRoot, '.axhub/make/client.json'), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'smoke',
    project: {
      id: 'smoke-client',
      name: 'Axhub Make Smoke Client',
    },
  });
  writeJson(path.join(projectRoot, '.axhub/make/project.json'), smokeProjectMetadata(projectRoot, assistantOrigin));
  writeJson(path.join(projectRoot, '.axhub/make/axhub.config.json'), {
    assistant: {
      webBaseUrl: assistantOrigin,
      apiBaseUrl: `${assistantOrigin}/api`,
    },
    automation: {
      defaultPromptClient: 'codex',
      acp: {
        timeout: 30,
      },
    },
  });
  const now = new Date().toISOString();
  const registryPath = path.join(registryHome, '.axhub/make/projects.json');
  writeJson(registryPath, {
    schemaVersion: 1,
    activeProjectId: 'smoke-client',
    projects: [
      {
        id: 'smoke-client',
        name: 'Axhub Make Smoke Client',
        root: projectRoot,
        metadataPath: path.join(projectRoot, '.axhub/make/project.json'),
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  return {
    projectRoot,
    registryPath,
    metadataPath: path.join(projectRoot, '.axhub/make/project.json'),
  };
}

export async function startMockAcpServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const requestOrigin = String(req.headers.origin || '*');
    const corsHeaders = {
      'access-control-allow-origin': requestOrigin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...corsHeaders });
      res.end('<!doctype html><title>Mock ACP UI</title><main>Mock ACP UI ready</main>');
      return;
    }
    if (req.url?.startsWith('/api/chat') && req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }
    if (req.url?.startsWith('/api/chat') && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders });
      res.end(JSON.stringify({ sessions: [], mock: true }));
      return;
    }
    if (req.url?.startsWith('/api/chat') && req.method === 'POST') {
      const body = await readRequestJson(req);
      requests.push(body);
      const prompt = extractPromptText(body);
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-acp-provider': body.provider || 'codex',
        'x-acp-thread-id': encodeURIComponent(body.threadId || 'mock-thread'),
        ...corsHeaders,
      });
      const toolOutput = createMockToolOutput(prompt);
      writeSse(res, { type: 'text-delta', delta: `Mock ACP completed: ${prompt.slice(0, 80)}` });
      if (toolOutput) {
        writeSse(res, {
          type: 'tool-output-available',
          toolCallId: 'mock-tool-1',
          toolName: toolOutput.toolName,
          output: toolOutput.output,
        });
      }
      writeSse(res, { type: 'finish', finishReason: 'stop' });
      res.end();
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await listen(server);
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    requests,
    close: () => closeServer(server),
  };
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function extractPromptText(body) {
  const message = Array.isArray(body.messages) ? body.messages.at(-1) : null;
  const part = Array.isArray(message?.parts) ? message.parts.find((item) => item?.type === 'text') : null;
  return String(part?.text || '');
}

function createMockToolOutput(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('image') || prompt.includes('图片')) {
    return {
      toolName: 'image-generation',
      output: {
        images: [
          {
            url: createTinyPngDataUrl(),
            dataUrl: createTinyPngDataUrl(),
            mimeType: 'image/png',
            fileName: 'smoke-generated-image.png',
            revisedPrompt: 'smoke generated image',
          },
        ],
      },
    };
  }
  if (lower.includes('drawio') || prompt.includes('图表')) {
    return {
      toolName: 'write-file',
      output: {
        diffs: [
          {
            path: 'src/prototypes/untitled/.spec/generation-assets/diagrams/smoke.drawio',
            title: 'Smoke Drawio',
            mimeType: 'application/vnd.jgraph.mxfile',
            operation: 'created',
          },
        ],
      },
    };
  }
  return {
    toolName: 'write-file',
    output: {
      diffs: [
        {
          path: 'src/prototypes/untitled/index.tsx',
          title: 'Smoke Prototype',
          mimeType: 'text/typescript',
          operation: 'updated',
        },
      ],
    },
  };
}

function writeSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

export async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

export async function writeReport(options, report) {
  const reportPath = createSmokeReportPath(options);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}
export function buildProjectApiUrl(origin, apiPath, projectId) {
  const url = new URL(apiPath, origin);
  url.searchParams.set('projectId', String(projectId || '').trim());
  return url.toString();
}
