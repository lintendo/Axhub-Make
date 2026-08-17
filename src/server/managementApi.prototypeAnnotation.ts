import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { isPathInside, resolveProjectPath, type ProjectMetadata } from './projectCore/index.ts';

import { preprocessAnnotationSourceMarkdown } from '../../client/vite-plugins/annotationSourceMarkdown.ts';
import { readJsonBody, sendCorsJson, sendCorsPreflight } from './http.ts';

const ANNOTATION_SOURCE_FILE_NAME = 'annotation-source.json';
const DEFAULT_ANNOTATION_COLOR = '#1677FF';
const PROTOTYPE_PAGE_ID_RE = /^[a-z0-9-]+$/u;

type PrototypeAnnotationContext = {
  project: {
    root: string;
  };
  metadata?: ProjectMetadata;
};

type AnnotationSourceDocument = {
  documentVersion: 1;
  format: 'axhub-annotation-source';
  data: {
    version: 2;
    prototypeName: string;
    pageId: string;
    nodes: Array<Record<string, unknown>>;
    updatedAt: number;
  };
  markdownMap: Record<string, string>;
  assetMap: Record<string, string>;
  directory?: unknown;
};

type PrototypeAnnotationPage = {
  id: string;
  title: string;
};

type ResolveResult =
  | {
      ok: true;
      prototypeId: string;
      prototypeDir: string;
      indexFilePath: string;
      sourceFilePath: string;
      projectRelativeSourcePath: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function normalizeTargetPath(rawValue: string | null): { ok: true; id: string } | { ok: false; status: number; error: string } {
  const raw = String(rawValue ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw) {
    return { ok: false, status: 400, error: 'Missing targetPath' };
  }
  if (raw.includes('..')) {
    return { ok: false, status: 403, error: 'Invalid targetPath' };
  }
  const segments = raw.split('/').filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'prototypes') {
    return { ok: false, status: 400, error: 'targetPath must be prototypes/<id>' };
  }
  const prototypeId = segments[1];
  if (!prototypeId || prototypeId.startsWith('.') || prototypeId.includes('\0')) {
    return { ok: false, status: 400, error: 'Invalid prototype id' };
  }
  return { ok: true, id: prototypeId };
}

function getDeclaredPrototypeWriteDir(projectRoot: string, metadata?: ProjectMetadata): string | null {
  const target = metadata?.resourceWriteTargets?.prototypes;
  if (!target || target.type !== 'project-relative-path' || !target.path) {
    return null;
  }
  try {
    return resolveProjectPath(projectRoot, target.path);
  } catch {
    return null;
  }
}

function resolvePrototypeAnnotationPath(
  projectRoot: string,
  rawTargetPath: string | null,
  metadata?: ProjectMetadata,
): ResolveResult {
  const normalized = normalizeTargetPath(rawTargetPath);
  if (normalized.ok === false) {
    return normalized;
  }

  const prototypesDir = getDeclaredPrototypeWriteDir(projectRoot, metadata);
  if (!prototypesDir) {
    return { ok: false, status: 424, error: 'Prototype annotation requires declared prototype write target' };
  }
  const defaultPrototypesDir = path.join(projectRoot, 'src', 'prototypes');
  if (path.resolve(prototypesDir) !== path.resolve(defaultPrototypesDir)) {
    return { ok: false, status: 403, error: 'Prototype annotation is limited to official src/prototypes templates' };
  }

  const prototypeDir = path.resolve(prototypesDir, normalized.id);
  if (!isPathInside(projectRoot, prototypeDir) || !isPathInside(prototypesDir, prototypeDir)) {
    return { ok: false, status: 403, error: 'Invalid targetPath' };
  }

  const indexFilePath = path.join(prototypeDir, 'index.tsx');
  const sourceFilePath = path.join(prototypeDir, ANNOTATION_SOURCE_FILE_NAME);
  if (
    !isPathInside(projectRoot, indexFilePath)
    || !isPathInside(prototypeDir, indexFilePath)
    || !isPathInside(projectRoot, sourceFilePath)
    || !isPathInside(prototypeDir, sourceFilePath)
  ) {
    return { ok: false, status: 403, error: 'Invalid annotation path' };
  }

  return {
    ok: true,
    prototypeId: normalized.id,
    prototypeDir,
    indexFilePath,
    sourceFilePath,
    projectRelativeSourcePath: path.relative(projectRoot, sourceFilePath).split(path.sep).join('/'),
  };
}

function createEmptyAnnotationSource(prototypeId: string): AnnotationSourceDocument {
  const now = Date.now();
  return {
    documentVersion: 1,
    format: 'axhub-annotation-source',
    data: {
      version: 2,
      prototypeName: prototypeId,
      pageId: prototypeId,
      nodes: [],
      updatedAt: now,
    },
    markdownMap: {},
    assetMap: {},
  };
}

function normalizeAnnotationSource(input: unknown, prototypeId: string): AnnotationSourceDocument {
  const fallback = createEmptyAnnotationSource(prototypeId);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fallback;
  }
  const record = input as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : {};
  const nodes = Array.isArray(data.nodes) ? data.nodes.filter((node) => node && typeof node === 'object') as Array<Record<string, unknown>> : [];
  const nodeIds = new Set(nodes.map((node) => String(node.id ?? '').trim()).filter(Boolean));
  const markdownEntries = record.markdownMap && typeof record.markdownMap === 'object' && !Array.isArray(record.markdownMap)
    ? Object.entries(record.markdownMap as Record<string, unknown>)
      .filter(([key]) => nodeIds.has(String(key).trim()))
      .map(([key, value]) => [key, String(value ?? '')])
    : [];
  return {
    documentVersion: 1,
    format: 'axhub-annotation-source',
    data: {
      version: 2,
      prototypeName: typeof data.prototypeName === 'string' && data.prototypeName.trim()
        ? data.prototypeName.trim()
        : prototypeId,
      pageId: typeof data.pageId === 'string' && data.pageId.trim()
        ? data.pageId.trim()
        : prototypeId,
      nodes,
      updatedAt: Number.isFinite(Number(data.updatedAt)) ? Number(data.updatedAt) : Date.now(),
    },
    markdownMap: Object.fromEntries(markdownEntries),
    assetMap: record.assetMap && typeof record.assetMap === 'object' && !Array.isArray(record.assetMap)
      ? Object.fromEntries(Object.entries(record.assetMap as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]))
      : {},
    ...('directory' in record ? { directory: record.directory } : {}),
  };
}

function readAnnotationSource(resolved: Extract<ResolveResult, { ok: true }>): AnnotationSourceDocument {
  if (!fs.existsSync(resolved.sourceFilePath)) {
    return createEmptyAnnotationSource(resolved.prototypeId);
  }
  return normalizeAnnotationSource(
    JSON.parse(fs.readFileSync(resolved.sourceFilePath, 'utf8')),
    resolved.prototypeId,
  );
}

function readPreprocessedAnnotationSource(resolved: Extract<ResolveResult, { ok: true }>): AnnotationSourceDocument {
  const source = readAnnotationSource(resolved);
  return preprocessAnnotationSourceMarkdown({
    projectRoot: path.resolve(resolved.prototypeDir, '../../..'),
    sourceFilePath: resolved.sourceFilePath,
    source,
    mode: 'serve',
  }).source;
}

function writeAnnotationSource(resolved: Extract<ResolveResult, { ok: true }>, source: AnnotationSourceDocument): void {
  fs.mkdirSync(resolved.prototypeDir, { recursive: true });
  fs.writeFileSync(resolved.sourceFilePath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
}

function isEnabled(resolved: Extract<ResolveResult, { ok: true }>): boolean {
  if (!fs.existsSync(resolved.sourceFilePath) || !fs.existsSync(resolved.indexFilePath)) {
    return false;
  }
  return hasExplicitAnnotationViewerIntegration(fs.readFileSync(resolved.indexFilePath, 'utf8'));
}

function hasExplicitAnnotationViewerIntegration(indexSource: string): boolean {
  return hasLocalNamedImport(indexSource, '@axhub/annotation', 'AnnotationViewer')
    && hasDefaultImportFromModule(indexSource, './annotation-source.json')
    && /<AnnotationViewer(?:\s|\/|>)/u.test(indexSource);
}

function createTsxSourceFile(indexSource: string): ts.SourceFile {
  return ts.createSourceFile('index.tsx', indexSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function getImportModuleName(statement: ts.ImportDeclaration): string {
  return ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
}

function hasLocalNamedImport(indexSource: string, moduleName: string, localName: string): boolean {
  const sourceFile = createTsxSourceFile(indexSource);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || getImportModuleName(statement) !== moduleName) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    if (namedBindings.elements.some((element) => element.name.text === localName)) {
      return true;
    }
  }
  return false;
}

function hasDefaultImportFrom(indexSource: string, moduleName: string, localName: string): boolean {
  const sourceFile = createTsxSourceFile(indexSource);
  return sourceFile.statements.some((statement) => (
    ts.isImportDeclaration(statement)
    && getImportModuleName(statement) === moduleName
    && statement.importClause?.name?.text === localName
  ));
}

function hasDefaultImportFromModule(indexSource: string, moduleName: string): boolean {
  const sourceFile = createTsxSourceFile(indexSource);
  return sourceFile.statements.some((statement) => (
    ts.isImportDeclaration(statement)
    && getImportModuleName(statement) === moduleName
    && Boolean(statement.importClause?.name)
  ));
}

function findLastImportInsertionIndex(indexSource: string): number {
  const sourceFile = createTsxSourceFile(indexSource);
  let lastImportEnd = 0;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    lastImportEnd = statement.end;
  }
  return lastImportEnd;
}

function ensureAnnotationImports(indexSource: string): string {
  const imports: string[] = [];
  const annotationImportSpecifiers: string[] = [];
  if (!hasLocalNamedImport(indexSource, '@axhub/annotation', 'AnnotationViewer')) {
    annotationImportSpecifiers.push('AnnotationViewer');
  }
  if (!hasLocalNamedImport(indexSource, '@axhub/annotation', 'AnnotationSourceDocument')) {
    annotationImportSpecifiers.push('type AnnotationSourceDocument');
  }
  if (annotationImportSpecifiers.length > 0) {
    imports.push(`import { ${annotationImportSpecifiers.join(', ')} } from '@axhub/annotation';`);
  }
  if (!hasDefaultImportFrom(indexSource, './annotation-source.json', 'annotationSourceDocument')) {
    imports.push("import annotationSourceDocument from './annotation-source.json';");
  }
  if (imports.length === 0) {
    return indexSource;
  }

  const insertAt = findLastImportInsertionIndex(indexSource);
  const prefix = indexSource.slice(0, insertAt);
  const suffix = indexSource.slice(insertAt);
  const importBlock = `${insertAt > 0 ? '\n' : ''}${imports.join('\n')}`;
  return `${prefix}${importBlock}${suffix.startsWith('\n') ? '' : '\n'}${suffix}`;
}

function unwrapParenthesizedExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isJsxLikeExpression(expression: ts.Expression): boolean {
  const unwrapped = unwrapParenthesizedExpression(expression);
  return ts.isJsxElement(unwrapped)
    || ts.isJsxSelfClosingElement(unwrapped)
    || ts.isJsxFragment(unwrapped);
}

function findJsxSpanFromExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
): { start: number; end: number } | null {
  const unwrapped = unwrapParenthesizedExpression(expression);
  if (!isJsxLikeExpression(unwrapped)) {
    return null;
  }
  return {
    start: unwrapped.getStart(sourceFile),
    end: unwrapped.getEnd(),
  };
}

function isFunctionLikeNode(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function findReturnJsxSpan(
  sourceFile: ts.SourceFile,
  root: ts.Node,
): { start: number; end: number } | null {
  let result: { start: number; end: number } | null = null;
  const visit = (node: ts.Node) => {
    if (result) {
      return;
    }
    if (node !== root && isFunctionLikeNode(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      result = findJsxSpanFromExpression(sourceFile, node.expression);
      if (result) {
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}

function hasDefaultModifier(node: { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
}

function findDefaultComponentJsxSpan(indexSource: string): { start: number; end: number } | null {
  const sourceFile = ts.createSourceFile('index.tsx', indexSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let defaultExportName = '';
  let defaultFunction: ts.FunctionDeclaration | null = null;

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasDefaultModifier(statement)) {
      defaultFunction = statement;
      break;
    }
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      defaultExportName = statement.expression.text;
    }
  }

  if (defaultFunction) {
    return findReturnJsxSpan(sourceFile, defaultFunction);
  }

  if (!defaultExportName) {
    return null;
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === defaultExportName) {
      return findReturnJsxSpan(sourceFile, statement);
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== defaultExportName || !declaration.initializer) {
        continue;
      }
      const initializer = declaration.initializer;
      if (ts.isArrowFunction(initializer)) {
        if (ts.isBlock(initializer.body)) {
          return findReturnJsxSpan(sourceFile, initializer.body);
        }
        return findJsxSpanFromExpression(sourceFile, initializer.body);
      }
      if (ts.isFunctionExpression(initializer)) {
        return findReturnJsxSpan(sourceFile, initializer);
      }
    }
  }

  return null;
}

function getLineIndentAt(indexSource: string, offset: number): string {
  const lineStart = indexSource.lastIndexOf('\n', offset - 1) + 1;
  return indexSource.slice(lineStart, offset).match(/^\s*/u)?.[0] ?? '';
}

function indentBlock(text: string, indent: string): string {
  return text.split('\n').map((line) => `${indent}${line}`).join('\n');
}

function createAnnotationViewerJsx(pageId: string, indent: string): string {
  const pageIdLiteral = JSON.stringify(pageId);
  return [
    `${indent}<AnnotationViewer`,
    `${indent}  source={annotationSourceDocument as unknown as AnnotationSourceDocument}`,
    `${indent}  options={{`,
    `${indent}    currentPageId: (() => {`,
    `${indent}      const hashPageId = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('page');`,
    `${indent}      const searchPageId = new URLSearchParams(window.location.search.replace(/^\\?/, '')).get('page');`,
    `${indent}      const pageId = hashPageId || searchPageId;`,
    `${indent}      return typeof pageId === 'string' && /^[a-z0-9-]+$/u.test(pageId)`,
    `${indent}        ? pageId`,
    `${indent}        : ${pageIdLiteral};`,
    `${indent}    })(),`,
    `${indent}    onDirectoryRoute: (node) => {`,
    `${indent}      if (typeof node.route === 'string' && /^[a-z0-9-]+$/u.test(node.route)) {`,
    `${indent}        window.location.hash = \`page=\${node.route}\`;`,
    `${indent}      }`,
    `${indent}    },`,
    `${indent}    toolbarEdge: 'right',`,
    `${indent}    showToolbar: true,`,
    `${indent}    showThemeToggle: true,`,
    `${indent}    showColorFilter: true,`,
    `${indent}    emptyWhenNoData: true,`,
    `${indent}  }}`,
    `${indent}/>`,
  ].join('\n');
}

function injectAnnotationViewer(indexSource: string, pageId: string): string {
  if (hasExplicitAnnotationViewerIntegration(indexSource)) {
    return indexSource;
  }

  const span = findDefaultComponentJsxSpan(indexSource);
  if (!span) {
    throw new Error('Unable to enable annotation automatically: default prototype component must return JSX');
  }

  const baseIndent = getLineIndentAt(indexSource, span.start);
  const childIndent = `${baseIndent}  `;
  const expressionText = indexSource.slice(span.start, span.end);
  const replacement = [
    '<>',
    indentBlock(expressionText, childIndent),
    createAnnotationViewerJsx(pageId, childIndent),
    `${baseIndent}</>`,
  ].join('\n');

  return `${indexSource.slice(0, span.start)}${replacement}${indexSource.slice(span.end)}`;
}

function ensureAnnotationViewerIntegration(
  resolved: Extract<ResolveResult, { ok: true }>,
  source: AnnotationSourceDocument,
): boolean {
  if (!fs.existsSync(resolved.indexFilePath)) {
    throw new Error('Prototype entry index.tsx not found');
  }

  const indexSource = fs.readFileSync(resolved.indexFilePath, 'utf8');
  if (hasExplicitAnnotationViewerIntegration(indexSource)) {
    return false;
  }

  const pageId = normalizePrototypePageId(source.data.pageId) || resolved.prototypeId;
  const nextSource = ensureAnnotationImports(injectAnnotationViewer(indexSource, pageId));
  fs.writeFileSync(resolved.indexFilePath, nextSource, 'utf8');
  return true;
}

function sanitizeNodeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function createNodeId(source: AnnotationSourceDocument): string {
  const used = new Set(source.data.nodes.map((node) => String(node.id || '')));
  let index = source.data.nodes.length + 1;
  while (used.has(`annotation-${index}`)) {
    index += 1;
  }
  return `annotation-${index}`;
}

function normalizePrototypePageId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return PROTOTYPE_PAGE_ID_RE.test(normalized) ? normalized : '';
}

function normalizePrototypeAnnotationPages(input: unknown): PrototypeAnnotationPage[] {
  if (!Array.isArray(input)) return [];
  const pages: PrototypeAnnotationPage[] = [];
  const seenIds = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = normalizePrototypePageId(record.id);
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!id || !title || seenIds.has(id)) continue;
    seenIds.add(id);
    pages.push({ id, title });
  }
  return pages;
}

function fillPageDirectory(
  source: AnnotationSourceDocument,
  pages: PrototypeAnnotationPage[],
): AnnotationSourceDocument {
  if ('directory' in source || pages.length <= 1) return source;
  return {
    ...source,
    directory: {
      nodes: [{
        type: 'folder',
        id: 'directory-pages',
        title: '页面',
        defaultExpanded: true,
        children: pages.map((page) => ({
          type: 'route',
          id: `route-${page.id}`,
          title: page.title,
          route: page.id,
        })),
      }],
    },
  };
}

function nodeMatchesRequestedPageId(node: Record<string, unknown>, pageId: string): boolean {
  if (!pageId) {
    return true;
  }
  const nodePageIds = Array.isArray(node.pageId) ? node.pageId : [node.pageId];
  return nodePageIds.some((item) => normalizePrototypePageId(item) === pageId);
}

function findNodeByLocator(
  source: AnnotationSourceDocument,
  locator: unknown,
  pageId = '',
): Record<string, unknown> | null {
  const serializedLocator = JSON.stringify(locator ?? null);
  const exactMatch = source.data.nodes.find((node) => (
    nodeMatchesRequestedPageId(node, pageId)
    && JSON.stringify(node.locator ?? null) === serializedLocator
  ));
  if (exactMatch) {
    return exactMatch;
  }

  const selectorSet = new Set(readLocatorSelectors(locator));
  if (selectorSet.size === 0) {
    return null;
  }
  return source.data.nodes.find((node) => (
    nodeMatchesRequestedPageId(node, pageId)
    && readLocatorSelectors(node.locator).some((selector) => selectorSet.has(selector))
  )) ?? null;
}

function readLocatorSelectors(locator: unknown): string[] {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) return [];
  const selectors = (locator as { selectors?: unknown }).selectors;
  if (!Array.isArray(selectors)) return [];
  return selectors
    .map((selector) => String(selector ?? '').trim())
    .filter(Boolean);
}

function writeNodeMarkdown(
  resolved: Extract<ResolveResult, { ok: true }>,
  body: Record<string, unknown>,
): { source: AnnotationSourceDocument; nodeId: string } {
  const source = readAnnotationSource(resolved);
  const rawNodeId = typeof body.nodeId === 'string' ? sanitizeNodeId(body.nodeId) : '';
  const locator = body.locator && typeof body.locator === 'object' ? body.locator : null;
  const pageId = normalizePrototypePageId(body.pageId);
  const markdown = String(body.markdown ?? '');
  const now = Date.now();
  let node = rawNodeId
    ? source.data.nodes.find((item) => item.id === rawNodeId) ?? null
    : null;
  if (!node && locator) {
    node = findNodeByLocator(source, locator, pageId);
  }
  const deleteAnnotation = markdown.trim().length === 0;
  if (deleteAnnotation) {
    const nodeId = String(node?.id || rawNodeId || '').trim();
    if (nodeId) {
      source.data.nodes = source.data.nodes.filter((item) => item.id !== nodeId);
      delete source.markdownMap[nodeId];
      source.data.updatedAt = now;
      writeAnnotationSource(resolved, source);
    }
    return { source, nodeId };
  }
  if (!node) {
    if (!locator) {
      throw new Error('Missing locator for new annotation node');
    }
    const nodeId = rawNodeId || createNodeId(source);
    node = {
      id: nodeId,
      index: source.data.nodes.reduce((max, item) => Math.max(max, Number(item.index ?? 0)), 0) + 1,
      locator,
      aiPrompt: '',
      annotationText: '',
      hasMarkdown: true,
      color: DEFAULT_ANNOTATION_COLOR,
      images: [],
      ...(pageId ? { pageId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    source.data.nodes.push(node);
  }
  const nodeId = String(node.id || rawNodeId || createNodeId(source));
  node.id = nodeId;
  node.hasMarkdown = true;
  node.annotationText = '';
  node.updatedAt = now;
  if (!node.color) {
    node.color = DEFAULT_ANNOTATION_COLOR;
  }
  if (!Array.isArray(node.images)) {
    node.images = [];
  }
  source.markdownMap[nodeId] = markdown;
  source.data.updatedAt = now;
  writeAnnotationSource(resolved, source);
  return { source, nodeId };
}

export function handlePrototypeAnnotationApi(
  req: IncomingMessage,
  res: ServerResponse,
  context: PrototypeAnnotationContext,
  url: URL,
): boolean {
  const isStatusRoute = url.pathname === '/api/prototype-annotation';
  const isEnableRoute = url.pathname === '/api/prototype-annotation/enable';
  const isNodeRoute = url.pathname === '/api/prototype-annotation/node';
  if (!isStatusRoute && !isEnableRoute && !isNodeRoute) return false;

  if (req.method === 'OPTIONS') {
    sendCorsPreflight(res);
    return true;
  }

  if (isStatusRoute) {
    const resolved = resolvePrototypeAnnotationPath(context.project.root, url.searchParams.get('targetPath'), context.metadata);
    if (resolved.ok === false) {
      sendCorsJson(res, { error: resolved.error }, { status: resolved.status });
      return true;
    }
    const exists = fs.existsSync(resolved.sourceFilePath);
    const enabled = isEnabled(resolved);
    sendCorsJson(res, {
      enabled,
      exists,
      source: exists ? readPreprocessedAnnotationSource(resolved) : null,
      path: resolved.projectRelativeSourcePath,
    });
    return true;
  }

  if (isEnableRoute && req.method === 'POST') {
    readJsonBody(req)
      .then((body) => {
        const targetPath = body && typeof body === 'object' ? String((body as { targetPath?: unknown }).targetPath ?? '') : '';
        const resolved = resolvePrototypeAnnotationPath(context.project.root, targetPath, context.metadata);
        if (resolved.ok === false) {
          sendCorsJson(res, { error: resolved.error }, { status: resolved.status });
          return;
        }
        const pages = normalizePrototypeAnnotationPages(
          body && typeof body === 'object' ? (body as { pages?: unknown }).pages : undefined,
        );
        const source = fillPageDirectory(readAnnotationSource(resolved), pages);
        writeAnnotationSource(resolved, source);
        const changedIndex = ensureAnnotationViewerIntegration(resolved, source);
        sendCorsJson(res, {
          ok: true,
          enabled: isEnabled(resolved),
          changedIndex,
          source,
          path: resolved.projectRelativeSourcePath,
        });
      })
      .catch((error) => sendCorsJson(res, { error: error?.message || 'Failed to enable annotation' }, { status: 400 }));
    return true;
  }

  if (isNodeRoute && req.method === 'PUT') {
    readJsonBody(req)
      .then((body) => {
        const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const resolved = resolvePrototypeAnnotationPath(context.project.root, String(record.targetPath ?? ''), context.metadata);
        if (resolved.ok === false) {
          sendCorsJson(res, { error: resolved.error }, { status: resolved.status });
          return;
        }
        const { source, nodeId } = writeNodeMarkdown(resolved, record);
        sendCorsJson(res, {
          ok: true,
          nodeId,
          source,
          path: resolved.projectRelativeSourcePath,
        });
      })
      .catch((error) => sendCorsJson(res, { error: error?.message || 'Failed to write annotation node' }, { status: 400 }));
    return true;
  }

  sendCorsJson(res, { error: 'Method not allowed' }, { status: 405 });
  return true;
}
