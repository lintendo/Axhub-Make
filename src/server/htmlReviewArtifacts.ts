import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { parse } from 'parse5';

import { getRequestUrl, sendJson } from './http.ts';
import { isPathInside } from './projectCore/index.ts';

const MAX_HTML_BYTES = 2_000_000;
const MAX_REQUEST_BYTES = 2_000_000;
const MAX_DIAGRAM_SOURCE_BYTES = 750_000;
const MAX_SUMMARY_LINES = 12;
const MAX_SUMMARY_LINE_LENGTH = 240;

type Parse5Node = {
  nodeName?: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Parse5Node[];
  sourceCodeLocation?: {
    startOffset?: number;
    endOffset?: number;
  };
};

export interface HtmlReviewDiagramDescriptor {
  key: string;
  kind: 'mermaid' | 'drawio';
  diagramId: string;
  documentIndex: number;
  heading: string;
  source: string;
  sourceUrl: string;
  sourceHash: string;
  sourcePath: string;
  previewPath: string;
}

export interface HtmlReviewDocumentResolution {
  documentPath: string;
  absolutePath: string;
  resourcesDir: string;
  assetsPath: string;
  absoluteAssetsPath: string;
}

interface HtmlReviewDraftSession {
  version: 1;
  sessionId: string;
  documentPath: string;
  diagramKey: string;
  kind: HtmlReviewDiagramDescriptor['kind'];
  sourceHash: string;
  sourcePath: string;
  previewPath: string;
  summary: string[];
  stale: boolean;
  artifactMtimeMs: number;
  createdAt: string;
  updatedAt: string;
}

function normalizeSource(value: string): string {
  return String(value || '').replace(/\r\n?/gu, '\n').trim();
}

function hashSource(value: string): string {
  return createHash('sha256').update(normalizeSource(value)).digest('hex').slice(0, 16);
}

function getAttribute(node: Parse5Node, name: string): string {
  return node.attrs?.find((attribute) => attribute.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function getTextContent(node: Parse5Node): string {
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(getTextContent).join('');
}

function findDescendant(node: Parse5Node, predicate: (candidate: Parse5Node) => boolean): Parse5Node | null {
  for (const child of node.childNodes ?? []) {
    if (predicate(child)) return child;
    const nested = findDescendant(child, predicate);
    if (nested) return nested;
  }
  return null;
}

function slugify(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 72);
}

function resolveHtmlDocumentScope(documentPath: string): {
  documentRoot: '' | 'templates' | 'src/resources';
  relativePath: string;
} | null {
  const documentRoot = documentPath.startsWith('templates/')
    ? 'templates'
    : documentPath.startsWith('src/resources/')
      ? 'src/resources'
      : '';
  const scopedPath = documentRoot
    ? documentPath.slice(`${documentRoot}/`.length)
    : documentPath;
  const relativePath = normalizeProjectHtmlRelativePath(scopedPath);
  return relativePath ? { documentRoot, relativePath } : null;
}

function normalizeProjectHtmlRelativePath(value: unknown): string {
  const raw = String(value || '').trim().replace(/\\/gu, '/');
  if (!raw || raw.includes('\0') || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) return '';
  const normalized = path.posix.normalize(raw).replace(/^\.\/+|\/+$/gu, '');
  if (!normalized || normalized === '.') return '';
  const segments = normalized.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
    || segments.some((segment) => segment === '.git' || segment === '.axhub')
  ) {
    return '';
  }
  return normalized;
}

function isRealPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isExistingPathSafe(rootPath: string, candidatePath: string): boolean {
  try {
    const realRootPath = fs.realpathSync.native(rootPath);
    let existingPath = candidatePath;
    while (!fs.existsSync(existingPath)) {
      const parentPath = path.dirname(existingPath);
      if (parentPath === existingPath) return false;
      existingPath = parentPath;
    }
    return isRealPathInside(realRootPath, fs.realpathSync.native(existingPath));
  } catch {
    return false;
  }
}

function sidecarPaths(documentPath: string, key: string, kind: HtmlReviewDiagramDescriptor['kind']) {
  const scope = resolveHtmlDocumentScope(documentPath);
  if (!scope) {
    throw new Error('Invalid HTML review document path');
  }
  const assetRelativePath = `.assets/${scope.relativePath}`;
  const assetsPath = scope.documentRoot
    ? `${scope.documentRoot}/${assetRelativePath}`
    : assetRelativePath;
  const extension = kind === 'mermaid' ? '.excalidraw' : '.drawio.svg';
  return {
    sourcePath: `${assetsPath}/diagrams/${key}${extension}`,
    previewPath: `${assetsPath}/diagrams/${key}.png`,
  };
}

function resolveLinkedDrawioProjectPath(documentPath: string, sourceUrl: string): string {
  let cleanUrl = String(sourceUrl || '').trim().split(/[?#]/u, 1)[0]?.replace(/\\/gu, '/') ?? '';
  if (!cleanUrl || cleanUrl.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(cleanUrl)) return '';
  try {
    cleanUrl = decodeURIComponent(cleanUrl);
  } catch {
    // Keep the encoded path when it cannot be decoded safely.
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), cleanUrl));
  const scope = resolveHtmlDocumentScope(documentPath);
  if (!scope || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) return '';
  return !scope.documentRoot || resolved.startsWith(`${scope.documentRoot}/`) ? resolved : '';
}

function sourceSlice(html: string, node: Parse5Node): string {
  const start = node.sourceCodeLocation?.startOffset;
  const end = node.sourceCodeLocation?.endOffset;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return '';
  return html.slice(start as number, end as number);
}

export function extractHtmlReviewDiagrams(html: string, documentPath: string): HtmlReviewDiagramDescriptor[] {
  const document = parse(String(html || ''), { sourceCodeLocationInfo: true }) as Parse5Node;
  const diagrams: HtmlReviewDiagramDescriptor[] = [];
  const usedKeys = new Set<string>();
  let currentHeading = '';
  let mermaidOrdinal = 0;
  let drawioOrdinal = 0;

  const addDiagram = (params: {
    kind: HtmlReviewDiagramDescriptor['kind'];
    node: Parse5Node;
    source: string;
    sourceUrl?: string;
  }) => {
    const kindOrdinal = params.kind === 'mermaid' ? ++mermaidOrdinal : ++drawioOrdinal;
    const explicitId = slugify(getAttribute(params.node, 'id'));
    const headingId = slugify(currentHeading);
    const baseId = explicitId || headingId || String(kindOrdinal);
    let diagramId = baseId;
    let key = `${params.kind}-${diagramId}`;
    let collision = 2;
    while (usedKeys.has(key)) {
      diagramId = `${baseId}-${collision}`;
      key = `${params.kind}-${diagramId}`;
      collision += 1;
    }
    usedKeys.add(key);
    const source = normalizeSource(params.source);
    let { sourcePath, previewPath } = sidecarPaths(documentPath, key, params.kind);
    const sourceUrl = String(params.sourceUrl || '').trim().replace(/\\/gu, '/');
    const linkedDrawioPath = params.kind === 'drawio'
      ? resolveLinkedDrawioProjectPath(documentPath, sourceUrl)
      : '';
    if (linkedDrawioPath) {
      sourcePath = linkedDrawioPath;
      previewPath = linkedDrawioPath;
    }
    diagrams.push({
      key,
      kind: params.kind,
      diagramId,
      documentIndex: kindOrdinal - 1,
      heading: currentHeading.slice(0, MAX_SUMMARY_LINE_LENGTH),
      source: Buffer.byteLength(source, 'utf8') <= MAX_DIAGRAM_SOURCE_BYTES ? source : '',
      sourceUrl,
      sourceHash: hashSource(source || params.sourceUrl || key),
      sourcePath,
      previewPath,
    });
  };

  const visit = (node: Parse5Node) => {
    const tagName = String(node.tagName || '').toLowerCase();
    if (/^h[1-6]$/u.test(tagName)) {
      currentHeading = normalizeSource(getTextContent(node)).slice(0, MAX_SUMMARY_LINE_LENGTH);
    }

    const classNames = getAttribute(node, 'class').split(/\s+/u).filter(Boolean);
    if (classNames.includes('mermaid')) {
      addDiagram({ kind: 'mermaid', node, source: getTextContent(node) });
      return;
    }

    if (tagName === 'svg') {
      const metadata = findDescendant(node, (candidate) => (
        candidate.tagName === 'metadata' && getAttribute(candidate, 'id') === 'drawio-source'
      ));
      if (getAttribute(node, 'data-drawio') || metadata) {
        addDiagram({ kind: 'drawio', node, source: sourceSlice(html, node) || getTextContent(metadata ?? node) });
        return;
      }
    }

    if (tagName === 'img' || tagName === 'object') {
      const sourceUrl = getAttribute(node, tagName === 'img' ? 'src' : 'data');
      if (/\.drawio\.svg(?:[?#].*)?$/iu.test(sourceUrl)) {
        addDiagram({ kind: 'drawio', node, source: '', sourceUrl });
      }
    }

    for (const child of node.childNodes ?? []) visit(child);
  };

  visit(document);
  return diagrams;
}

export function resolveHtmlReviewDocument(
  projectRoot: string,
  resourcePath: unknown,
): HtmlReviewDocumentResolution | null {
  const raw = String(resourcePath || '').trim().replace(/\\/gu, '/');
  if (
    raw.includes('\0')
    || raw.split('/').some((segment) => segment === '..' || segment === '.')
    || path.posix.isAbsolute(raw)
    || path.win32.isAbsolute(raw)
    || !/\.html?$/iu.test(raw)
  ) {
    return null;
  }
  const scope = resolveHtmlDocumentScope(raw);
  if (!scope) {
    return null;
  }
  const normalized = scope.documentRoot
    ? `${scope.documentRoot}/${scope.relativePath}`
    : scope.relativePath;
  const resourcesDir = scope.documentRoot
    ? path.resolve(projectRoot, ...scope.documentRoot.split('/'))
    : path.resolve(projectRoot);
  const absolutePath = path.resolve(projectRoot, ...normalized.split('/'));
  if (
    !isPathInside(resourcesDir, absolutePath)
    || !isPathInside(projectRoot, absolutePath)
    || !isExistingPathSafe(resourcesDir, absolutePath)
  ) return null;
  const assetRelativePath = `.assets/${scope.relativePath}`;
  const absoluteAssetsPath = path.resolve(resourcesDir, ...assetRelativePath.split('/'));
  if (!assetRelativePath || !absoluteAssetsPath || !isExistingPathSafe(resourcesDir, absoluteAssetsPath)) return null;
  const assetsPath = scope.documentRoot
    ? `${scope.documentRoot}/${assetRelativePath}`
    : assetRelativePath;
  return { documentPath: normalized, absolutePath, resourcesDir, assetsPath, absoluteAssetsPath };
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readDiagramDocument(resolution: HtmlReviewDocumentResolution): HtmlReviewDiagramDescriptor[] {
  const stats = fs.statSync(resolution.absolutePath);
  if (!stats.isFile() || stats.size > MAX_HTML_BYTES) throw new Error('HTML_REVIEW_DOCUMENT_TOO_LARGE');
  return extractHtmlReviewDiagrams(fs.readFileSync(resolution.absolutePath, 'utf8'), resolution.documentPath);
}

async function readBoundedJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw Object.assign(new Error('Request body is too large'), { status: 413 });
  }
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(Object.assign(new Error('Request body is too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) as Record<string, unknown> : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sessionPath(resolution: HtmlReviewDocumentResolution, sessionId: string): string {
  return path.join(resolution.absoluteAssetsPath, '.sessions', `${sessionId}.json`);
}

function sanitizeSummary(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_SUMMARY_LINES)
    .map((line) => String(line || '').trim().slice(0, MAX_SUMMARY_LINE_LENGTH))
    .filter(Boolean);
}

function manifestPath(resolution: HtmlReviewDocumentResolution): string {
  return path.join(resolution.absoluteAssetsPath, 'diagram-manifest.json');
}

function writeManifest(
  resolution: HtmlReviewDocumentResolution,
  diagrams: HtmlReviewDiagramDescriptor[],
  session: HtmlReviewDraftSession,
): void {
  const existing = readJsonFile<{ diagrams?: Array<Record<string, unknown>> }>(manifestPath(resolution));
  const records = Array.isArray(existing?.diagrams) ? existing.diagrams : [];
  const descriptor = diagrams.find((item) => item.key === session.diagramKey);
  const nextRecord = {
    key: session.diagramKey,
    kind: session.kind,
    documentIndex: descriptor?.documentIndex ?? -1,
    heading: descriptor?.heading ?? '',
    sourceHash: session.sourceHash,
    sourcePath: session.sourcePath,
    previewPath: session.previewPath,
    summary: session.summary,
    sessionId: session.sessionId,
    updatedAt: session.updatedAt,
  };
  atomicWriteJson(manifestPath(resolution), {
    version: 1,
    documentPath: resolution.documentPath,
    diagrams: [...records.filter((record) => record.key !== session.diagramKey), nextRecord],
  });
}

function resolveLinkedDrawioSource(
  resolution: HtmlReviewDocumentResolution,
  descriptor: HtmlReviewDiagramDescriptor,
): string {
  if (descriptor.source) return descriptor.source;
  const cleanUrl = descriptor.sourceUrl.split(/[?#]/u)[0];
  const absolutePath = path.resolve(path.dirname(resolution.absolutePath), ...cleanUrl.split('/'));
  if (
    !isPathInside(resolution.resourcesDir, absolutePath)
    || !isExistingPathSafe(resolution.resourcesDir, absolutePath)
    || !fs.statSync(absolutePath).isFile()
  ) {
    throw Object.assign(new Error('Linked Draw.io source is unavailable'), { status: 404 });
  }
  const stats = fs.statSync(absolutePath);
  if (stats.size > MAX_DIAGRAM_SOURCE_BYTES) {
    throw Object.assign(new Error('Linked Draw.io source is too large'), { status: 413 });
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function publicSession(session: HtmlReviewDraftSession) {
  return { ...session };
}

function findDraftSessionPath(projectRoot: string, sessionId: string): string {
  const roots = [
    path.join(projectRoot, '.assets'),
    path.join(projectRoot, 'templates', '.assets'),
    path.join(projectRoot, 'src', 'resources', '.assets'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root) || !isExistingPathSafe(projectRoot, root)) continue;
    const queue = [root];
    while (queue.length > 0) {
      const directory = queue.shift() as string;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const candidate = path.join(directory, entry.name);
        if (!isExistingPathSafe(projectRoot, candidate)) continue;
        if (entry.name === '.sessions') {
          const filePath = path.join(candidate, `${sessionId}.json`);
          if (fs.existsSync(filePath) && isExistingPathSafe(projectRoot, filePath)) return filePath;
          continue;
        }
        queue.push(candidate);
      }
    }
  }
  return '';
}

export async function handleHtmlReviewArtifactsApi(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/html-review/')) return false;
  const url = getRequestUrl(req);

  try {
    if (pathname === '/api/html-review/diagrams') {
      if (req.method !== 'GET') {
        sendJson(res, { error: 'Method not allowed' }, { status: 405 });
        return true;
      }
      const resolution = resolveHtmlReviewDocument(projectRoot, url.searchParams.get('path'));
      if (!resolution) {
        sendJson(res, { error: 'Invalid HTML resource path' }, { status: 400 });
        return true;
      }
      if (!fs.existsSync(resolution.absolutePath)) {
        sendJson(res, { error: 'HTML review document not found' }, { status: 404 });
        return true;
      }
      sendJson(res, { documentPath: resolution.documentPath, diagrams: readDiagramDocument(resolution) });
      return true;
    }

    if (pathname === '/api/html-review/diagram-drafts') {
      if (req.method !== 'POST') {
        sendJson(res, { error: 'Method not allowed' }, { status: 405 });
        return true;
      }
      const body = await readBoundedJson(req);
      if ('sourcePath' in body || 'previewPath' in body || 'outputPath' in body) {
        sendJson(res, { error: 'Draft output paths are server-derived' }, { status: 400 });
        return true;
      }
      const resolution = resolveHtmlReviewDocument(projectRoot, body.path);
      if (!resolution || !fs.existsSync(resolution.absolutePath)) {
        sendJson(res, { error: 'Invalid HTML resource path' }, { status: 400 });
        return true;
      }
      const diagrams = readDiagramDocument(resolution);
      const descriptor = diagrams.find((item) => item.key === String(body.diagramKey || ''));
      if (!descriptor) {
        sendJson(res, { error: 'Diagram not found' }, { status: 404 });
        return true;
      }
      const absoluteSourcePath = path.resolve(projectRoot, ...descriptor.sourcePath.split('/'));
      fs.mkdirSync(path.dirname(absoluteSourcePath), { recursive: true });
      if (descriptor.kind === 'mermaid') {
        const excalidraw = body.excalidraw && typeof body.excalidraw === 'object'
          ? body.excalidraw
          : { type: 'excalidraw', version: 2, source: 'https://axhub.im', elements: [], appState: {}, files: {} };
        atomicWriteJson(absoluteSourcePath, excalidraw);
      } else {
        fs.writeFileSync(absoluteSourcePath, resolveLinkedDrawioSource(resolution, descriptor), 'utf8');
      }
      const timestamp = new Date().toISOString();
      const session: HtmlReviewDraftSession = {
        version: 1,
        sessionId: randomUUID().toLowerCase(),
        documentPath: resolution.documentPath,
        diagramKey: descriptor.key,
        kind: descriptor.kind,
        sourceHash: descriptor.sourceHash,
        sourcePath: descriptor.sourcePath,
        previewPath: descriptor.previewPath,
        summary: [],
        stale: false,
        artifactMtimeMs: fs.statSync(absoluteSourcePath).mtimeMs,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      atomicWriteJson(sessionPath(resolution, session.sessionId), session);
      writeManifest(resolution, diagrams, session);
      sendJson(res, publicSession(session), { status: 201 });
      return true;
    }

    const sessionMatch = pathname.match(/^\/api\/html-review\/diagram-drafts\/([a-z0-9-]+)$/u);
    if (!sessionMatch) return false;
    const sessionId = sessionMatch[1];
    const foundPath = findDraftSessionPath(projectRoot, sessionId);
    let session = foundPath ? readJsonFile<HtmlReviewDraftSession>(foundPath) : null;
    if (!session) {
      sendJson(res, { error: 'Diagram draft session not found' }, { status: 404 });
      return true;
    }
    const resolution = resolveHtmlReviewDocument(projectRoot, session.documentPath);
    if (!resolution) {
      sendJson(res, { error: 'Invalid draft session' }, { status: 409 });
      return true;
    }
    if (req.method === 'GET') {
      const diagrams = readDiagramDocument(resolution);
      const currentDescriptor = diagrams.find((item) => item.key === session.diagramKey);
      const absoluteSourcePath = path.resolve(projectRoot, ...session.sourcePath.split('/'));
      const artifactMtimeMs = fs.existsSync(absoluteSourcePath)
        ? fs.statSync(absoluteSourcePath).mtimeMs
        : session.artifactMtimeMs;
      const artifactUpdated = Number.isFinite(artifactMtimeMs)
        && artifactMtimeMs > Number(session.artifactMtimeMs || 0) + 1;
      const stale = Boolean(currentDescriptor && currentDescriptor.sourceHash !== session.sourceHash);
      if (artifactUpdated || stale !== session.stale) {
        session = {
          ...session,
          summary: artifactUpdated && session.summary.length === 0
            ? ['图表源文件已更新']
            : session.summary,
          stale,
          artifactMtimeMs,
          updatedAt: new Date().toISOString(),
        };
        atomicWriteJson(foundPath, session);
        writeManifest(resolution, diagrams, session);
      }
      sendJson(res, publicSession(session));
      return true;
    }
    if (req.method !== 'PUT') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    const body = await readBoundedJson(req);
    if (
      ('sourcePath' in body && body.sourcePath !== session.sourcePath)
      || ('previewPath' in body && body.previewPath !== session.previewPath)
    ) {
      sendJson(res, { error: 'Draft paths cannot be changed' }, { status: 400 });
      return true;
    }
    const diagrams = readDiagramDocument(resolution);
    const currentDescriptor = diagrams.find((item) => item.key === session.diagramKey);
    const absoluteSourcePath = path.resolve(projectRoot, ...session.sourcePath.split('/'));
    const updated: HtmlReviewDraftSession = {
      ...session,
      summary: sanitizeSummary(body.summary),
      stale: Boolean(
        (typeof body.sourceHash === 'string' && body.sourceHash !== session.sourceHash)
        || (currentDescriptor && currentDescriptor.sourceHash !== session.sourceHash)
      ),
      artifactMtimeMs: fs.existsSync(absoluteSourcePath)
        ? fs.statSync(absoluteSourcePath).mtimeMs
        : session.artifactMtimeMs,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(foundPath, updated);
    writeManifest(resolution, diagrams, updated);
    sendJson(res, publicSession(updated));
    return true;
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0)
      || ((error as Error)?.message === 'HTML_REVIEW_DOCUMENT_TOO_LARGE' ? 413 : 500);
    sendJson(res, { error: error instanceof Error ? error.message : 'HTML review artifact operation failed' }, { status });
    return true;
  }
}
