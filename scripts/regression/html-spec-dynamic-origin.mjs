import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { startMakeServer } from '../../src/server/index.ts';
import { writeServerInfo } from '../../src/server/projectCore/status.ts';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..');

function readAdminRoot(args) {
  const index = args.indexOf('--admin-root');
  if (index < 0 || !args[index + 1]) {
    throw new Error('Usage: html-spec-dynamic-origin.mjs --admin-root <dist/admin>');
  }
  return path.resolve(args[index + 1]);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function listenOnRandomPort(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  return 'http://127.0.0.1:' + address.port;
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

function createRuntimeServer(projectRoot) {
  let origin = '';
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', origin || 'http://127.0.0.1');
    if (url.pathname === '/api/health') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        role: 'runtime',
        origin,
        projectRoot,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }));
      return;
    }
    if (url.pathname === '/prototypes/home') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html><body><h1>Runtime Home</h1></body></html>');
      return;
    }
    response.statusCode = 404;
    response.end('Not found');
  });
  return {
    server,
    setOrigin(value) {
      origin = value;
    },
  };
}

function createFixture(tempRoot, runtimeOrigin) {
  const projectRoot = path.join(tempRoot, 'client');
  const registryHome = path.join(tempRoot, 'home');
  const projectId = 'html-spec-regression';
  const now = new Date().toISOString();
  const metadataPath = path.join(projectRoot, '.axhub/make/project.json');
  fs.mkdirSync(path.join(projectRoot, 'src/prototypes/home/.spec'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'src/prototypes/home/index.tsx'),
    'export default function Home() { return null; }\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(projectRoot, 'src/prototypes/home/.spec/spec.html'),
    '<!doctype html><html><head><title>HTML Spec Browser Regression</title></head><body><main><h1>HTML Spec Ready</h1><button>Spec Action</button></main></body></html>',
    'utf8',
  );
  writeJson(path.join(projectRoot, '.axhub/make/client.json'), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'regression',
    project: { id: projectId, name: 'HTML Spec Regression' },
  });
  writeJson(metadataPath, {
    schemaVersion: 1,
    project: { id: projectId, name: 'HTML Spec Regression' },
    resources: {
      prototypes: [{
        id: 'home',
        name: 'home',
        title: 'Home',
        filePath: 'src/prototypes/home/index.tsx',
        clientUrl: runtimeOrigin + '/prototypes/home',
      }],
      docs: [],
      themes: [],
      data: [],
      templates: [],
    },
    navigation: { prototypes: ['home'], docs: [] },
    orders: { themes: [], data: [], templates: [] },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: false,
      axureExport: false,
      localExports: { html: true, make: false },
    },
    updatedAt: now,
  });
  writeJson(path.join(projectRoot, '.axhub/make/entries.json'), {
    schemaVersion: 2,
    generatedAt: now,
    items: {
      'prototypes/home': {
        group: 'prototypes',
        name: 'home',
        js: 'src/prototypes/home/index.tsx',
        html: 'src/prototypes/home/index.html',
      },
    },
    js: { 'prototypes/home': 'src/prototypes/home/index.tsx' },
    html: { 'prototypes/home': 'src/prototypes/home/index.html' },
  });
  const registryPath = path.join(registryHome, '.axhub/make/projects.json');
  writeJson(registryPath, {
    schemaVersion: 1,
    activeProjectId: projectId,
    projects: [{
      id: projectId,
      name: 'HTML Spec Regression',
      root: projectRoot,
      metadataPath,
      createdAt: now,
      updatedAt: now,
    }],
  });
  return { projectRoot, registryHome, registryPath, projectId };
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) {
        listener(message.params);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpConnection(socket);
  }

  send(method, params = {}) {
    const id = this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await predicate();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Condition timed out; last value: ' + JSON.stringify(lastValue));
}

async function waitForFile(filePath, timeoutMs = 15_000) {
  await waitFor(() => fs.existsSync(filePath), timeoutMs);
}

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error('Chrome is required; set CHROME_EXECUTABLE to a Chrome or Chromium binary');
  }
  return executable;
}

async function startChrome(tempRoot) {
  const profileRoot = path.join(tempRoot, 'chrome-profile');
  fs.mkdirSync(profileRoot, { recursive: true });
  const child = spawn(resolveChromeExecutable(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profileRoot,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const activePortPath = path.join(profileRoot, 'DevToolsActivePort');
  await waitForFile(activePortPath);
  const [port, browserPath] = fs.readFileSync(activePortPath, 'utf8').trim().split(/\s+/u);
  return {
    child,
    debugOrigin: 'http://127.0.0.1:' + port,
    browserWebSocketUrl: 'ws://127.0.0.1:' + port + browserPath,
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

const FRAME_STATE_EXPRESSION = '(function () { return Array.from(document.querySelectorAll("iframe")).map(function (iframe) { try { return { src: iframe.getAttribute("src") || iframe.src, href: iframe.contentWindow.location.href, hasHtmlBootstrap: Boolean(iframe.contentWindow.HtmlTemplateBootstrap && iframe.contentWindow.HtmlTemplateBootstrap.editors && iframe.contentWindow.HtmlTemplateBootstrap.editors.enable), bodyText: iframe.contentDocument.body ? iframe.contentDocument.body.innerText : "" }; } catch (error) { return { src: iframe.getAttribute("src") || iframe.src, crossOrigin: true }; } }); })()';

async function getFrames(pageCdp) {
  return evaluate(pageCdp, FRAME_STATE_EXPRESSION);
}

async function navigateAndWaitForFrame(pageCdp, url, predicate) {
  await pageCdp.send('Page.navigate', { url });
  try {
    return await waitFor(async () => {
      const frames = await getFrames(pageCdp);
      return frames.find(predicate) || null;
    });
  } catch (error) {
    const pageState = await evaluate(pageCdp, '(function () { return { href: location.href, title: document.title, bodyText: document.body ? document.body.innerText : "", frames: ' + FRAME_STATE_EXPRESSION + ' }; })()');
    throw new Error(error.message + '; page state: ' + JSON.stringify(pageState));
  }
}

async function enableHtmlEditor(pageCdp, projectId) {
  return evaluate(pageCdp, '(function () { var iframe = Array.from(document.querySelectorAll("iframe")).find(function (frame) { try { return frame.contentDocument && frame.contentDocument.body && frame.contentDocument.body.innerText.includes("HTML Spec Ready"); } catch (error) { return false; } }); var editors = iframe && iframe.contentWindow && iframe.contentWindow.HtmlTemplateBootstrap && iframe.contentWindow.HtmlTemplateBootstrap.editors; if (!editors || !editors.enable) return { available: false }; return Promise.resolve(editors.enable("webEditorV2", { toolbarMode: "host", annotationApiBaseUrl: window.location.origin, annotationProjectId: "' + projectId + '" })).then(function () { return { available: true }; }); })()');
}

const adminRoot = readAdminRoot(process.argv.slice(2));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-html-spec-regression-'));
const runtime = createRuntimeServer(path.join(tempRoot, 'client'));
const runtimeOrigin = await listenOnRandomPort(runtime.server);
runtime.setOrigin(runtimeOrigin);
const fixture = createFixture(tempRoot, runtimeOrigin);
const runtimeUrl = new URL(runtimeOrigin);
writeServerInfo(fixture.projectRoot, 'runtime', {
  pid: process.pid,
  port: Number(runtimeUrl.port),
  host: runtimeUrl.hostname,
  origin: runtimeOrigin,
  projectRoot: fixture.projectRoot,
  startedAt: new Date().toISOString(),
  timestamp: new Date().toISOString(),
});
let makeServer;
let chrome;
let browserCdp;
let pageCdp;

try {
  makeServer = await startMakeServer({
    projectRoot: fixture.projectRoot,
    host: '127.0.0.1',
    port: 0,
    adminRoot,
    registryPath: fixture.registryPath,
    serverInfoHomeDir: fixture.registryHome,
    runtimeOrigin,
  });
  chrome = await startChrome(tempRoot);
  browserCdp = await CdpConnection.connect(chrome.browserWebSocketUrl);
  const target = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
  const targets = await waitFor(async () => fetch(chrome.debugOrigin + '/json/list').then((response) => response.json()));
  const pageTarget = targets.find((item) => item.id === target.targetId);
  if (!pageTarget) {
    throw new Error('Chrome page target was not available');
  }
  pageCdp = await CdpConnection.connect(pageTarget.webSocketDebuggerUrl);
  await pageCdp.send('Page.enable');
  await pageCdp.send('Runtime.enable');
  await pageCdp.send('Log.enable');

  const errors = [];
  pageCdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    errors.push({ kind: 'exception', text: exceptionDetails.exception?.description || exceptionDetails.text });
  });
  pageCdp.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error' || entry.level === 'warning') {
      errors.push({ kind: 'log:' + entry.level, text: entry.text, url: entry.url });
    }
  });
  pageCdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error' || type === 'warning') {
      errors.push({
        kind: 'console:' + type,
        text: args.map((argument) => argument.value || argument.description || '').join(' '),
      });
    }
  });

  const runtimeDeepLink = makeServer.origin + '/?projectId=' + fixture.projectId + '&p=home&sidebar=collapsed';
  const specDeepLink = runtimeDeepLink + '&spec=1';
  await navigateAndWaitForFrame(pageCdp, runtimeDeepLink, (frame) => (
    (frame.href || frame.src || '').startsWith(runtimeOrigin + '/prototypes/home')
  ));
  const firstHtmlFrame = await navigateAndWaitForFrame(
    pageCdp,
    specDeepLink,
    (frame) => frame.bodyText.includes('HTML Spec Ready') && frame.hasHtmlBootstrap,
  );
  const firstEnableResult = await enableHtmlEditor(pageCdp, fixture.projectId);
  await navigateAndWaitForFrame(pageCdp, runtimeDeepLink, (frame) => (
    (frame.href || frame.src || '').startsWith(runtimeOrigin + '/prototypes/home')
  ));
  const secondHtmlFrame = await navigateAndWaitForFrame(
    pageCdp,
    specDeepLink,
    (frame) => frame.bodyText.includes('HTML Spec Ready') && frame.hasHtmlBootstrap,
  );
  const secondEnableResult = await enableHtmlEditor(pageCdp, fixture.projectId);

  if (!firstEnableResult.available || !secondEnableResult.available) {
    throw new Error('HtmlTemplateBootstrap.editors.enable was not available after a runtime/spec transition');
  }
  const relevantErrors = errors.filter((entry) => /cannot access|before initialization|target origin provided/iu.test(entry.text || ''));
  if (relevantErrors.length > 0) {
    throw new Error('HTML spec dynamic-origin regression errors: ' + JSON.stringify(relevantErrors));
  }
  console.log(JSON.stringify({
    makeOrigin: makeServer.origin,
    runtimeOrigin,
    firstHtmlFrame,
    secondHtmlFrame,
    firstEnableResult,
    secondEnableResult,
    relevantErrors,
  }, null, 2));
} finally {
  pageCdp?.close();
  browserCdp?.close();
  if (chrome?.child && chrome.child.exitCode === null) {
    chrome.child.kill('SIGTERM');
    await Promise.race([
      once(chrome.child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
  await makeServer?.close();
  await closeServer(runtime.server);
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
