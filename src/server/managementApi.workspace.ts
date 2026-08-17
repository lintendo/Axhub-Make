import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  createSidebarTreeStore,
  isPathInside,
  resolveProjectPath,
  scanProjectEntries,
  type ProjectMetadata,
  type RegisteredProject,
  type ResourceOrderType,
  type SidebarTreeNode,
  type SidebarTreeTab,
} from './projectCore/index.ts';

import { readJsonBody, sendJson } from './http.ts';
import { runLocalCommand } from './localCommand.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import { isResourceAssetSidecarDirectoryName } from './resourceFiles.ts';

interface WorkspaceProjectContext {
  project: RegisteredProject;
  metadata: ProjectMetadata;
}

interface WorkspaceApiHandlers {
  toProjectIdentity: (project: RegisteredProject) => { id: string; name: string };
  updateRegisteredProjectTitle: (
    options: ManagementApiOptions,
    project: RegisteredProject,
    title: string,
  ) => RegisteredProject;
  getTemplatesDir: (projectRoot: string) => string;
}

export interface SystemOpenCommand {
  command: string;
  args: string[];
}

export const SIDEBAR_TREE_VERSION = 1;
const CANVAS_ITEM_EXT = '.excalidraw';

function isSidebarTreeTab(value: string): value is SidebarTreeTab {
  return value === 'prototypes' || value === 'components' || value === 'docs' || value === 'canvas' || value === 'themes';
}

function isResourceOrderType(value: string): value is ResourceOrderType {
  return value === 'themes' || value === 'data' || value === 'templates';
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function toDefaultTreeTitle(itemKey: string): string {
  const name = itemKey.split('/').pop() || itemKey;
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || name;
}

function normalizeThemeItemTitle(title: string, itemKey: string, metadata?: ProjectMetadata): string {
  const repeatedThemeTitle = title.match(/^(.+?)\s+主题\s*-\s*(.+)$/u);
  if (!repeatedThemeTitle) {
    return title;
  }

  const before = repeatedThemeTitle[1]?.trim();
  const after = repeatedThemeTitle[2]?.trim();
  if (!before || !after || before.toLowerCase() !== after.toLowerCase()) {
    return title;
  }

  const themeName = itemKey.startsWith('themes/') ? itemKey.slice('themes/'.length) : '';
  const theme = metadata?.resources?.themes?.find((item) => item.id === themeName || item.name === themeName);
  const metadataTitle = String(theme?.title || theme?.name || theme?.id || '').trim();
  return metadataTitle && metadataTitle.toLowerCase() === after.toLowerCase() ? metadataTitle : title;
}

function createStableNodeIdHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeNodeId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!/[^\u0000-\u007F]/u.test(value)) {
    return sanitized;
  }

  const readablePrefix = sanitized.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'node';
  return `${readablePrefix}-${createStableNodeIdHash(value)}`;
}

function sanitizeFolderName(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toResourceNodeTitle(relativePath: string): string {
  const baseName = path.basename(relativePath);
  return baseName.replace(/\.[^.]+$/u, '') || baseName || relativePath;
}

function isIgnoredResourceRelativePath(relativePath: string): boolean {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return true;
  const lower = normalized.toLowerCase();
  if (lower === 'readme' || lower === 'readme.md') return true;
  return normalized.split('/').some((segment) => segment.startsWith('.'));
}

function getDocsResourceRoot(projectRoot: string): string {
  return path.join(projectRoot, 'src/resources');
}

function getThemeResourceRoot(projectRoot: string, metadata: ProjectMetadata): string {
  const target = metadata.resourceWriteTargets?.themes;
  if (target?.type === 'project-relative-path' && target.path) {
    return resolveProjectPath(projectRoot, target.path);
  }
  return path.join(projectRoot, 'src/themes');
}

function hasDeclaredResourceRoot(metadata: ProjectMetadata, type: 'docs' | 'themes'): boolean {
  const target = metadata.resourceWriteTargets?.[type];
  return Boolean(target?.type === 'project-relative-path' && target.path);
}

function getResourceRootByType(projectRoot: string, metadata: ProjectMetadata, type: 'docs' | 'themes'): string {
  return type === 'themes'
    ? getThemeResourceRoot(projectRoot, metadata)
    : getDocsResourceRoot(projectRoot);
}

function normalizeResourceRelativePath(value: unknown): string | null {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || raw.includes('\0')) {
    return null;
  }
  const normalized = path.posix.normalize(raw).replace(/^\.\/+/u, '').replace(/\/+$/u, '');
  if (!normalized || normalized === '.') {
    return null;
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    return null;
  }
  return normalized;
}

function resolveResourcePath(resourceRoot: string, relativePath: string): string | null {
  const normalized = normalizeResourceRelativePath(relativePath);
  if (!normalized) {
    return null;
  }
  const absolutePath = path.resolve(resourceRoot, normalized);
  return isPathInside(resourceRoot, absolutePath) ? absolutePath : null;
}

export function buildSystemOpenCommand(
  targetPath: string,
  platform: NodeJS.Platform = process.platform,
): SystemOpenCommand {
  if (platform === 'darwin') {
    return { command: 'open', args: [targetPath] };
  }
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Invoke-Item -LiteralPath $args[0] -ErrorAction Stop',
        targetPath,
      ],
    };
  }
  return { command: 'xdg-open', args: [targetPath] };
}

export function openPathInSystem(targetPath: string): Promise<void> {
  const openCommand = buildSystemOpenCommand(targetPath);
  return runLocalCommand(openCommand.command, openCommand.args, { timeoutMs: 10000 }).then(() => undefined);
}

function createResourceFolderNodeId(relativePath: string): string {
  return `folder-docs-${sanitizeNodeId(relativePath.replace(/\//g, '-'))}`;
}

function createResourceItemNodeId(relativePath: string): string {
  return `item-docs-${sanitizeNodeId(relativePath.replace(/\//g, '-'))}`;
}

function scanResourceSidebarTree(resourceRoot: string, relativePath = ''): SidebarTreeNode[] {
  const currentDir = relativePath ? path.join(resourceRoot, relativePath) : resourceRoot;
  if (!fs.existsSync(currentDir)) {
    return [];
  }

  const folders: SidebarTreeNode[] = [];
  const files: SidebarTreeNode[] = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const entryRelativePath = normalizePath(path.join(relativePath, entry.name));
    if (isIgnoredResourceRelativePath(entryRelativePath)) continue;
    if (entry.isDirectory()) {
      if (isResourceAssetSidecarDirectoryName(entry.name)) continue;
      folders.push({
        id: createResourceFolderNodeId(entryRelativePath),
        kind: 'folder',
        title: entry.name,
        path: entryRelativePath,
        folderPath: entryRelativePath,
        children: scanResourceSidebarTree(resourceRoot, entryRelativePath),
      });
      continue;
    }
    if (!entry.isFile()) continue;
    files.push({
      id: createResourceItemNodeId(entryRelativePath),
      kind: 'item',
      title: toResourceNodeTitle(entryRelativePath),
      itemKey: `docs/${entryRelativePath}`,
      path: entryRelativePath,
    });
  }

  const byTitle = (a: SidebarTreeNode, b: SidebarTreeNode) => a.title.localeCompare(b.title);
  return [...folders.sort(byTitle), ...files.sort(byTitle)];
}

function findResourceFolderNode(nodes: SidebarTreeNode[], folderPath: string): SidebarTreeNode | null {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    if (normalizeResourceRelativePath(node.folderPath || node.path) === folderPath) {
      return node;
    }
    const nested = findResourceFolderNode(node.children || [], folderPath);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function ensureResourceFolder(resourceRoot: string, value: unknown): {
  ok: true;
  folder: SidebarTreeNode;
  absolutePath: string;
  tree: SidebarTreeNode[];
  created: boolean;
} | {
  ok: false;
  status: number;
  error: string;
} {
  const rawPath = String(value || '').trim();
  const slashNormalizedPath = rawPath.replace(/\\/g, '/');
  const rawSegments = slashNormalizedPath.split('/');
  const folderPath = normalizeResourceRelativePath(rawPath);
  if (
    !folderPath
    || /^[a-zA-Z]:\//u.test(slashNormalizedPath)
    || slashNormalizedPath.startsWith('//')
    || rawSegments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return { ok: false, status: 400, error: 'Invalid resource folder path' };
  }

  const absolutePath = resolveResourcePath(resourceRoot, folderPath);
  if (!absolutePath) {
    return { ok: false, status: 400, error: 'Invalid resource folder path' };
  }
  if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
    return { ok: false, status: 409, error: 'Resource folder path is not a directory' };
  }

  const created = !fs.existsSync(absolutePath);
  fs.mkdirSync(absolutePath, { recursive: true });
  const tree = scanResourceSidebarTree(resourceRoot);
  const folder = findResourceFolderNode(tree, folderPath);
  if (!folder) {
    return { ok: false, status: 500, error: 'Resource folder was not found after creation' };
  }
  return {
    ok: true,
    folder,
    absolutePath,
    tree,
    created,
  };
}

function shouldUseFilesystemResourceRoot(
  projectRoot: string,
  metadata: ProjectMetadata,
  type: 'docs' | 'themes',
): boolean {
  if (type === 'docs') {
    return true;
  }
  return hasDeclaredResourceRoot(metadata, type);
}

function collectResourceFolderPaths(nodes: SidebarTreeNode[]): Set<string> {
  const paths = new Set<string>();
  const walk = (list: SidebarTreeNode[]) => {
    for (const node of list) {
      if (node.kind === 'folder') {
        const folderPath = normalizeResourceRelativePath(node.folderPath || node.path);
        if (folderPath) {
          paths.add(folderPath);
        }
        walk(Array.isArray(node.children) ? node.children : []);
      }
    }
  };
  walk(nodes);
  return paths;
}

function assertNoDuplicateResourcePath(seen: Set<string>, relativePath: string): boolean {
  if (seen.has(relativePath)) {
    return false;
  }
  seen.add(relativePath);
  return true;
}

function createResourceNameConflictBody(resourcePath: string): {
  error: string;
  code: 'RESOURCE_NAME_CONFLICT';
  path: string;
} {
  return {
    error: `目标文件夹中已存在同名资源：${resourcePath}`,
    code: 'RESOURCE_NAME_CONFLICT',
    path: resourcePath,
  };
}

function normalizeResourceSidebarTreePayload(tree: unknown): {
  valid: true;
  tree: SidebarTreeNode[];
  folders: Array<{ previousPath: string; nextPath: string }>;
  files: Array<{ previousPath: string; nextPath: string }>;
} | { valid: false; status: number; error: string; code?: string; path?: string } {
  if (!Array.isArray(tree)) {
    return { valid: false, status: 400, error: 'tree must be an array' };
  }

  const usedIds = new Set<string>();
  const seenPaths = new Set<string>();
  let duplicateResourcePath = '';
  const folders: Array<{ previousPath: string; nextPath: string }> = [];
  const files: Array<{ previousPath: string; nextPath: string }> = [];
  const makeUniqueId = (seed: string) => {
    let candidate = seed;
    let count = 1;
    while (usedIds.has(candidate)) {
      count += 1;
      candidate = `${seed}-${count}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const normalizeNodes = (nodes: any[], parentPath: string, depth: number): SidebarTreeNode[] | null => {
    if (depth > 32) {
      return null;
    }
    const normalized: SidebarTreeNode[] = [];
    for (const rawNode of nodes) {
      if (!rawNode || typeof rawNode !== 'object') {
        return null;
      }
      const kind = rawNode.kind;
      if (kind !== 'folder' && kind !== 'item') {
        return null;
      }
      const rawSourcePath = rawNode.folderPath || rawNode.path || (kind === 'item'
        ? String(rawNode.itemKey || '').replace(/^docs\//u, '')
        : '');
      let sourcePath = normalizeResourceRelativePath(rawSourcePath);
      if (!sourcePath && String(rawSourcePath || '').trim()) {
        return null;
      }
      const title = String(rawNode.title || path.basename(sourcePath)).trim();
      if (!title) {
        return null;
      }
      const sourceBaseName = sourcePath ? path.basename(sourcePath) : '';
      const targetName = kind === 'folder'
        ? title === sourceBaseName && sourceBaseName
          ? sourceBaseName
          : sanitizeFolderName(title) || sourceBaseName
        : sourceBaseName;
      const targetPath = normalizeResourceRelativePath(parentPath ? `${parentPath}/${targetName}` : targetName);
      if (!targetPath) {
        return null;
      }
      if (!assertNoDuplicateResourcePath(seenPaths, targetPath)) {
        duplicateResourcePath = targetPath;
        return null;
      }
      if (!sourcePath) {
        if (kind !== 'folder') {
          return null;
        }
        sourcePath = targetPath;
      }
      const rawId = typeof rawNode.id === 'string' ? rawNode.id.trim() : '';
      const id = makeUniqueId(rawId || (kind === 'folder'
        ? createResourceFolderNodeId(targetPath)
        : createResourceItemNodeId(targetPath)));

      if (kind === 'folder') {
        const children = normalizeNodes(Array.isArray(rawNode.children) ? rawNode.children : [], targetPath, depth + 1);
        if (!children) {
          return null;
        }
        folders.push({ previousPath: sourcePath, nextPath: targetPath });
        normalized.push({
          id,
          kind: 'folder',
          title: targetName,
          path: targetPath,
          folderPath: targetPath,
          children,
        });
        continue;
      }

      files.push({ previousPath: sourcePath, nextPath: targetPath });
      normalized.push({
        id,
        kind: 'item',
        title,
        itemKey: `docs/${targetPath}`,
        path: targetPath,
      });
    }
    return normalized;
  };

  const normalized = normalizeNodes(tree as any[], '', 0);
  if (!normalized) {
    if (duplicateResourcePath) {
      const conflict = createResourceNameConflictBody(duplicateResourcePath);
      return {
        valid: false,
        status: 409,
        ...conflict,
      };
    }
    const serialized = JSON.stringify(tree);
    if (serialized.includes('../') || serialized.includes('..\\\\') || serialized.includes('"/')) {
      return { valid: false, status: 403, error: 'Forbidden' };
    }
    return { valid: false, status: 400, error: 'Invalid tree payload' };
  }

  return { valid: true, tree: normalized, folders, files };
}

function hasVisibleDirectoryEntries(directoryPath: string): boolean {
  if (!fs.existsSync(directoryPath)) {
    return false;
  }

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);
    if (!entry.isDirectory()) {
      return true;
    }
    if (hasVisibleDirectoryEntries(entryPath)) {
      return true;
    }
  }

  return false;
}

function movePathIfNeeded(sourcePath: string, targetPath: string): void {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedSource === resolvedTarget) {
    return;
  }
  fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
  fs.renameSync(resolvedSource, resolvedTarget);
}

type ResourceMove = {
  previousPath: string;
  nextPath: string;
};

type ResourceMoveOperation = ResourceMove & {
  kind: 'file' | 'folder';
  sourcePath: string;
  targetPath: string;
  originalSourcePath: string;
};

function isFolderMoveImpliedByAncestor(move: ResourceMove, moves: ResourceMove[]): boolean {
  return moves.some((ancestor) => {
    if (ancestor === move || !move.previousPath.startsWith(`${ancestor.previousPath}/`)) {
      return false;
    }
    const suffix = move.previousPath.slice(ancestor.previousPath.length + 1);
    return move.nextPath === `${ancestor.nextPath}/${suffix}`;
  });
}

function reduceImpliedFolderMoves(moves: ResourceMove[]): ResourceMove[] {
  return moves.filter((move) => !isFolderMoveImpliedByAncestor(move, moves));
}

function resolvePathAfterFolderMoves(
  previousPath: string,
  folderMoves: ResourceMove[],
  excludedMove?: ResourceMove,
): string {
  const ancestor = folderMoves
    .filter((move) => move !== excludedMove && previousPath.startsWith(`${move.previousPath}/`))
    .sort((a, b) => b.previousPath.length - a.previousPath.length)[0];
  if (!ancestor) {
    return previousPath;
  }
  const suffix = previousPath.slice(ancestor.previousPath.length + 1);
  return `${ancestor.nextPath}/${suffix}`;
}

function preflightResourceMoveOperations(
  operations: ResourceMoveOperation[],
): { ok: true } | { ok: false; status: number; body: Record<string, unknown> } {
  const targetPaths = new Set<string>();
  for (const operation of operations) {
    if (!fs.existsSync(operation.originalSourcePath)) {
      return {
        ok: false,
        status: 400,
        body: { error: `Resource ${operation.kind} not found: ${operation.previousPath}` },
      };
    }
    if (targetPaths.has(operation.targetPath) || fs.existsSync(operation.targetPath)) {
      return {
        ok: false,
        status: 409,
        body: createResourceNameConflictBody(operation.nextPath),
      };
    }
    targetPaths.add(operation.targetPath);
  }
  return { ok: true };
}

function isPathNestedWithin(candidatePath: string, parentPath: string): boolean {
  return candidatePath.startsWith(`${parentPath}${path.sep}`);
}

function createFolderMoveExecutionPlan(operations: ResourceMoveOperation[]): ResourceMoveOperation[] | null {
  const pending = [...operations];
  const plan: ResourceMoveOperation[] = [];
  while (pending.length > 0) {
    const nextIndex = pending.findIndex((operation) => pending.every((dependency) => (
      dependency === operation
        || (!isPathNestedWithin(operation.sourcePath, dependency.targetPath)
          && !isPathNestedWithin(operation.targetPath, dependency.targetPath))
    )));
    if (nextIndex < 0) {
      return null;
    }
    plan.push(pending.splice(nextIndex, 1)[0]);
  }
  return plan;
}

function createResourceAssetMoveOperation(
  assetRoot: string,
  resourceRoot: string,
  operation: ResourceMoveOperation,
): ResourceMoveOperation | null {
  const sourceRelativePath = normalizePath(path.relative(resourceRoot, operation.sourcePath));
  const sourcePath = resolveResourcePath(assetRoot, sourceRelativePath);
  const targetPath = resolveResourcePath(assetRoot, operation.nextPath);
  const originalSourcePath = resolveResourcePath(assetRoot, operation.previousPath);
  if (!sourcePath || !targetPath || !originalSourcePath || !fs.existsSync(originalSourcePath)) {
    return null;
  }
  return { ...operation, sourcePath, targetPath, originalSourcePath };
}

function applyResourceSidebarTree(resourceRoot: string, payload: {
  tree: SidebarTreeNode[];
  folders: Array<{ previousPath: string; nextPath: string }>;
  files: Array<{ previousPath: string; nextPath: string }>;
}): { ok: true } | { ok: false; status: number; body: Record<string, unknown> } {
  for (const { previousPath, nextPath } of [...payload.folders, ...payload.files]) {
    if (!resolveResourcePath(resourceRoot, previousPath) || !resolveResourcePath(resourceRoot, nextPath)) {
      return { ok: false, status: 403, body: { error: 'Forbidden' } };
    }
  }

  const changedFolderMoves = payload.folders
    .filter(({ previousPath, nextPath }) => previousPath !== nextPath);
  const movedFolders = reduceImpliedFolderMoves(changedFolderMoves)
    .sort((a, b) => b.previousPath.length - a.previousPath.length);
  const movedFolderSources = new Set(changedFolderMoves.map((move) => move.previousPath));
  const nextFolderPaths = collectResourceFolderPaths(payload.tree);
  const currentFolderPaths = collectResourceFolderPaths(scanResourceSidebarTree(resourceRoot));
  const removedFolderPaths = Array.from(currentFolderPaths)
    .filter((folderPath) => !nextFolderPaths.has(folderPath) && !movedFolderSources.has(folderPath))
    .sort((a, b) => b.length - a.length);

  for (const folderPath of removedFolderPaths) {
    const folderAbsolutePath = resolveResourcePath(resourceRoot, folderPath);
    if (!folderAbsolutePath) {
      return { ok: false, status: 403, body: { error: 'Forbidden' } };
    }
    if (hasVisibleDirectoryEntries(folderAbsolutePath)) {
      return {
        ok: false,
        status: 409,
        body: {
          error: '文件夹非空，不能删除',
          code: 'DIRECTORY_NOT_EMPTY',
          folderPath,
        },
      };
    }
  }

  const createOperation = (
    move: ResourceMove,
    kind: ResourceMoveOperation['kind'],
    sourceRelativePath: string,
  ): ResourceMoveOperation | null => {
    const sourcePath = resolveResourcePath(resourceRoot, sourceRelativePath);
    const targetPath = resolveResourcePath(resourceRoot, move.nextPath);
    const originalSourcePath = resolveResourcePath(resourceRoot, move.previousPath);
    if (!sourcePath || !targetPath || !originalSourcePath) {
      return null;
    }
    return { ...move, kind, sourcePath, targetPath, originalSourcePath };
  };

  const folderOperations: ResourceMoveOperation[] = [];
  for (const move of movedFolders) {
    const operation = createOperation(
      move,
      'folder',
      resolvePathAfterFolderMoves(move.previousPath, movedFolders, move),
    );
    if (!operation) {
      return { ok: false, status: 403, body: { error: 'Forbidden' } };
    }
    folderOperations.push(operation);
  }

  const fileOperations: ResourceMoveOperation[] = [];
  for (const move of payload.files) {
    if (move.previousPath === move.nextPath) continue;
    const sourceRelativePath = resolvePathAfterFolderMoves(move.previousPath, movedFolders);
    if (sourceRelativePath === move.nextPath) continue;
    const operation = createOperation(move, 'file', sourceRelativePath);
    if (!operation) {
      return { ok: false, status: 403, body: { error: 'Forbidden' } };
    }
    fileOperations.push(operation);
  }

  const assetRoot = path.resolve(resourceRoot, '.assets');
  const assetFolderOperations: ResourceMoveOperation[] = [];
  const assetFileOperations: ResourceMoveOperation[] = [];
  for (const operation of folderOperations) {
    const assetOperation = createResourceAssetMoveOperation(assetRoot, resourceRoot, operation);
    if (assetOperation) {
      assetFolderOperations.push(assetOperation);
    }
  }
  for (const operation of fileOperations) {
    const assetOperation = createResourceAssetMoveOperation(assetRoot, resourceRoot, operation);
    if (assetOperation) {
      assetFileOperations.push(assetOperation);
    }
  }

  const folderExecutionPlan = createFolderMoveExecutionPlan(folderOperations);
  if (!folderExecutionPlan) {
    return {
      ok: false,
      status: 409,
      body: createResourceNameConflictBody(folderOperations[0]?.nextPath || ''),
    };
  }
  const assetFolderExecutionPlan = createFolderMoveExecutionPlan(assetFolderOperations);
  if (!assetFolderExecutionPlan) {
    return {
      ok: false,
      status: 409,
      body: createResourceNameConflictBody(assetFolderOperations[0]?.nextPath || ''),
    };
  }
  const preflight = preflightResourceMoveOperations([
    ...folderOperations,
    ...fileOperations,
    ...assetFolderOperations,
    ...assetFileOperations,
  ]);
  if (preflight.ok === false) {
    return preflight;
  }

  for (const operation of folderExecutionPlan) {
    movePathIfNeeded(operation.sourcePath, operation.targetPath);
  }
  for (const operation of fileOperations) {
    movePathIfNeeded(operation.sourcePath, operation.targetPath);
  }
  for (const operation of assetFolderExecutionPlan) {
    movePathIfNeeded(operation.sourcePath, operation.targetPath);
  }
  for (const operation of assetFileOperations) {
    movePathIfNeeded(operation.sourcePath, operation.targetPath);
  }

  for (const folderPath of removedFolderPaths) {
    const folderAbsolutePath = resolveResourcePath(resourceRoot, folderPath);
    if (folderAbsolutePath && fs.existsSync(folderAbsolutePath)) {
      fs.rmSync(folderAbsolutePath, { recursive: true, force: true });
    }
  }

  return { ok: true };
}

function createUniqueResourceFolder(resourceRoot: string): { folderPath: string; absolutePath: string } {
  let folderName = 'new-folder';
  let absolutePath = path.join(resourceRoot, folderName);
  let suffix = 2;
  while (fs.existsSync(absolutePath)) {
    folderName = `new-folder-${suffix}`;
    absolutePath = path.join(resourceRoot, folderName);
    suffix += 1;
  }
  fs.mkdirSync(absolutePath, { recursive: true });
  return { folderPath: folderName, absolutePath };
}

function buildDefaultSidebarTree(allowedItemKeys: Set<string>): SidebarTreeNode[] {
  return Array.from(allowedItemKeys)
    .sort((a, b) => a.localeCompare(b))
    .map((itemKey) => ({
      id: `item-${sanitizeNodeId(itemKey)}`,
      kind: 'item' as const,
      title: toDefaultTreeTitle(itemKey),
      itemKey,
    }));
}

function resolveOrderedThemeKeys(projectRoot: string, metadata?: ProjectMetadata): string[] {
  const metadataOrder = metadata?.orders?.themes || [];
  if (metadataOrder.length === 0) {
    return [];
  }
  const allowedKeys = collectThemeKeys(projectRoot);
  const seen = new Set<string>();
  const orderedKeys: string[] = [];
  for (const key of metadataOrder) {
    if (!allowedKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    orderedKeys.push(key);
  }
  const remainingKeys = Array.from(allowedKeys)
    .filter((key) => !seen.has(key))
    .sort((a, b) => a.localeCompare(b));
  return [...orderedKeys, ...remainingKeys];
}

function resolveOrderedThemeItemKeys(projectRoot: string, metadata?: ProjectMetadata): string[] {
  return resolveOrderedThemeKeys(projectRoot, metadata).map((key) => `themes/${key}`);
}

function sortFlatSidebarTreeByItemOrder(tree: SidebarTreeNode[], orderedItemKeys: string[]): SidebarTreeNode[] {
  if (orderedItemKeys.length === 0 || !tree.every((node) => node.kind === 'item')) {
    return tree;
  }
  const orderIndex = new Map(orderedItemKeys.map((itemKey, index) => [itemKey, index]));
  return [...tree].sort((first, second) => {
    const firstIndex = first.itemKey ? orderIndex.get(first.itemKey) : undefined;
    const secondIndex = second.itemKey ? orderIndex.get(second.itemKey) : undefined;
    if (firstIndex !== undefined && secondIndex !== undefined) {
      return firstIndex - secondIndex;
    }
    if (firstIndex !== undefined) {
      return -1;
    }
    if (secondIndex !== undefined) {
      return 1;
    }
    return (first.itemKey || first.title).localeCompare(second.itemKey || second.title);
  });
}

function normalizeAndValidateSidebarTree(
  tree: unknown,
  tab: SidebarTreeTab,
  allowedItemKeys: Set<string>,
): { valid: true; tree: SidebarTreeNode[] } | { valid: false; error: string } {
  if (!Array.isArray(tree)) {
    return { valid: false, error: 'tree must be an array' };
  }

  const usedIds = new Set<string>();
  const seenItemKeys = new Set<string>();
  const makeUniqueId = (seed: string) => {
    let candidate = seed;
    let count = 1;
    while (usedIds.has(candidate)) {
      count += 1;
      candidate = `${seed}-${count}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const normalizeNodes = (nodes: any[], depth: number): SidebarTreeNode[] | null => {
    if (depth > 32) {
      return null;
    }
    const normalized: SidebarTreeNode[] = [];
    for (const rawNode of nodes) {
      if (!rawNode || typeof rawNode !== 'object') {
        return null;
      }
      const id = typeof rawNode.id === 'string' ? rawNode.id.trim() : '';
      const kind = rawNode.kind;
      const title = typeof rawNode.title === 'string' ? rawNode.title.trim() : '';
      if (!id || !title) return null;
      if (kind !== 'folder' && kind !== 'item') {
        return null;
      }
      const nextId = makeUniqueId(id);

      if (kind === 'item') {
        const itemKey = typeof rawNode.itemKey === 'string' ? rawNode.itemKey.trim() : '';
        if (!itemKey || !itemKey.startsWith(`${tab}/`) || !allowedItemKeys.has(itemKey)) {
          return null;
        }
        if (seenItemKeys.has(itemKey)) {
          continue;
        }
        seenItemKeys.add(itemKey);
        normalized.push({ id: nextId, kind: 'item', title, itemKey });
        continue;
      }

      const children = normalizeNodes(Array.isArray(rawNode.children) ? rawNode.children : [], depth + 1);
      if (!children) {
        return null;
      }
      const rawItemKey = typeof rawNode.itemKey === 'string' ? rawNode.itemKey.trim() : '';
      const itemKey = rawItemKey && rawItemKey.startsWith(`${tab}/`) && allowedItemKeys.has(rawItemKey)
        ? rawItemKey
        : undefined;
      if (itemKey) {
        seenItemKeys.add(itemKey);
      }
      normalized.push({
        id: nextId,
        kind: 'folder',
        title,
        ...(itemKey ? { itemKey } : {}),
        children,
      });
    }
    return normalized;
  };

  const normalizedTree = normalizeNodes(tree as any[], 0);
  if (!normalizedTree) {
    return { valid: false, error: 'Invalid tree payload' };
  }
  return { valid: true, tree: normalizedTree };
}

function reconcileSidebarTree(
  tree: SidebarTreeNode[],
  tab: SidebarTreeTab,
  allowedItemKeys: Set<string>,
  metadata?: ProjectMetadata,
): SidebarTreeNode[] {
  const usedIds = new Set<string>();
  const seenItemKeys = new Set<string>();
  const makeUniqueId = (seed: string) => {
    let candidate = seed;
    let count = 1;
    while (usedIds.has(candidate)) {
      count += 1;
      candidate = `${seed}-${count}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const normalizeNodes = (nodes: SidebarTreeNode[], depth: number): SidebarTreeNode[] => {
    if (!Array.isArray(nodes) || depth > 32) return [];
    const result: SidebarTreeNode[] = [];
    for (const rawNode of nodes) {
      if (!rawNode || typeof rawNode !== 'object') continue;
      const title = typeof rawNode.title === 'string' ? rawNode.title.trim() : '';
      if (!title) continue;
      const rawId = typeof rawNode.id === 'string' ? rawNode.id.trim() : '';
      const id = makeUniqueId(rawId || `node-${Date.now()}`);
      if (rawNode.kind === 'item') {
        const itemKey = typeof rawNode.itemKey === 'string' ? rawNode.itemKey.trim() : '';
        if (!itemKey || !itemKey.startsWith(`${tab}/`) || !allowedItemKeys.has(itemKey)) {
          continue;
        }
        if (seenItemKeys.has(itemKey)) {
          continue;
        }
        seenItemKeys.add(itemKey);
        result.push({
          id,
          kind: 'item',
          title: tab === 'themes' ? normalizeThemeItemTitle(title, itemKey, metadata) : title,
          itemKey,
        });
        continue;
      }
      if (rawNode.kind === 'folder') {
        const children = normalizeNodes(Array.isArray(rawNode.children) ? rawNode.children : [], depth + 1);
        const rawFolderItemKey = typeof rawNode.itemKey === 'string' ? rawNode.itemKey.trim() : '';
        const folderItemKey = rawFolderItemKey
          && rawFolderItemKey.startsWith(`${tab}/`)
          && allowedItemKeys.has(rawFolderItemKey)
          ? rawFolderItemKey
          : undefined;
        const folderNode: SidebarTreeNode = { id, kind: 'folder', title, children };
        if (folderItemKey) {
          seenItemKeys.add(folderItemKey);
          folderNode.itemKey = folderItemKey;
        }
        result.push(folderNode);
      }
    }
    return result;
  };

  const normalizedTree = normalizeNodes(tree, 0);
  const missingItemKeys = Array.from(allowedItemKeys).filter((itemKey) => !seenItemKeys.has(itemKey));
  const nextMissingNodes = missingItemKeys
    .sort((a, b) => a.localeCompare(b))
    .map((itemKey) => ({
      id: makeUniqueId(`item-${sanitizeNodeId(itemKey)}`),
      kind: 'item' as const,
      title: toDefaultTreeTitle(itemKey),
      itemKey,
    }));
  return [...nextMissingNodes, ...normalizedTree];
}

function collectSidebarTreeIds(nodes: SidebarTreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: SidebarTreeNode[]) => {
    for (const node of list) {
      if (!node || typeof node !== 'object') continue;
      const id = typeof node.id === 'string' ? node.id.trim() : '';
      if (id) {
        ids.add(id);
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

function createUniqueFolderNodeId(existingIds: Set<string>): string {
  let candidate = '';
  do {
    candidate = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } while (existingIds.has(candidate));
  return candidate;
}

function createRootFolderTitle(nodes: SidebarTreeNode[]): string {
  const rootFolderTitles = new Set<string>();
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    const title = typeof node.title === 'string' ? node.title.trim() : '';
    if (title) {
      rootFolderTitles.add(title);
    }
  }

  const defaultTitle = '新建文件夹';
  if (!rootFolderTitles.has(defaultTitle)) {
    return defaultTitle;
  }
  let suffix = 2;
  while (rootFolderTitles.has(`${defaultTitle}-${suffix}`)) {
    suffix += 1;
  }
  return `${defaultTitle}-${suffix}`;
}

function collectDocItemKeys(projectRoot: string): Set<string> {
  const docsDir = path.join(projectRoot, 'src/resources');
  const keys: string[] = [];
  if (!fs.existsSync(docsDir)) {
    return new Set();
  }

  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolutePath = path.join(currentDir, entry.name);
      const rel = normalizePath(path.relative(docsDir, absolutePath));
      if (isIgnoredResourceRelativePath(rel)) continue;
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      keys.push(`docs/${rel}`);
    }
  };

  walk(docsDir);
  return new Set(keys.sort((a, b) => a.localeCompare(b)));
}

function collectCanvasItemKeys(projectRoot: string): Set<string> {
  const resourcesDir = path.join(projectRoot, 'src/resources');
  const keys: string[] = [];
  if (!fs.existsSync(resourcesDir)) {
    return new Set();
  }

  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolutePath = path.join(currentDir, entry.name);
      const rel = normalizePath(path.relative(resourcesDir, absolutePath));
      if (isIgnoredResourceRelativePath(rel)) continue;
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(CANVAS_ITEM_EXT)) continue;
      keys.push(`canvas/${rel}`);
    }
  };

  walk(resourcesDir);
  return new Set(keys.sort((a, b) => a.localeCompare(b)));
}

function getPrototypeResourceRoot(projectRoot: string, metadata?: ProjectMetadata): string {
  const target = metadata?.resourceWriteTargets?.prototypes;
  if (target?.type === 'project-relative-path' && target.path) {
    return resolveProjectPath(projectRoot, target.path);
  }
  return path.join(projectRoot, 'src/prototypes');
}

function collectMetadataPrototypeItemKeys(metadata: ProjectMetadata): Set<string> {
  const keys = new Set<string>();
  for (const prototype of metadata.resources.prototypes) {
    const candidates = [prototype.id, prototype.name]
      .map((value) => String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);
    for (const candidate of candidates) {
      keys.add(`prototypes/${candidate}`);
    }
  }
  return keys;
}

function collectPrototypeItemKeys(projectRoot: string, metadata?: ProjectMetadata): Set<string> {
  const hasDeclaredRoot = Boolean(metadata?.resourceWriteTargets?.prototypes?.type === 'project-relative-path'
    && metadata.resourceWriteTargets.prototypes.path);
  const prototypesDir = getPrototypeResourceRoot(projectRoot, metadata);
  if (!fs.existsSync(prototypesDir)) {
    if (!hasDeclaredRoot && metadata) {
      return collectMetadataPrototypeItemKeys(metadata);
    }
    return new Set();
  }
  return new Set(fs
    .readdirSync(prototypesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(prototypesDir, entry.name, 'index.tsx')))
    .map((entry) => `prototypes/${entry.name}`)
    .sort((a, b) => a.localeCompare(b)));
}

function resolveAllowedItemKeys(projectRoot: string, tab: SidebarTreeTab, metadata?: ProjectMetadata): Set<string> {
  if (tab === 'docs') {
    return collectDocItemKeys(projectRoot);
  }
  if (tab === 'canvas') {
    return collectCanvasItemKeys(projectRoot);
  }
  if (tab === 'themes') {
    const themeKeys = collectThemeKeys(projectRoot);
    return new Set(Array.from(themeKeys).map((key) => `themes/${key}`));
  }
  if (tab === 'prototypes') {
    return collectPrototypeItemKeys(projectRoot, metadata);
  }
  const manifest = scanProjectEntries(projectRoot);
  return new Set(Object.keys(manifest.items)
    .filter((key) => key.startsWith(`${tab}/`))
    .sort((a, b) => a.localeCompare(b)));
}

function collectThemeKeys(projectRoot: string): Set<string> {
  const themesDir = path.join(projectRoot, 'src/themes');
  if (!fs.existsSync(themesDir)) {
    return new Set();
  }
  return new Set(fs
    .readdirSync(themesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name));
}

function collectDataTableKeys(projectRoot: string): Set<string> {
  const databaseDir = path.join(projectRoot, 'src/resources/data');
  if (!fs.existsSync(databaseDir)) {
    return new Set();
  }
  return new Set(fs
    .readdirSync(databaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.replace(/\.json$/i, ''))
    .filter(Boolean));
}

function collectTemplateKeys(projectRoot: string, handlers: WorkspaceApiHandlers): Set<string> {
  const templatesDir = handlers.getTemplatesDir(projectRoot);
  const keys = new Set<string>();
  if (!fs.existsSync(templatesDir)) {
    return keys;
  }
  const walk = (dirPath: string) => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = normalizePath(path.relative(templatesDir, fullPath));
      if (relativePath) {
        keys.add(relativePath);
      }
    }
  };
  walk(templatesDir);
  return keys;
}

function resolveAllowedResourceKeys(projectRoot: string, type: ResourceOrderType, handlers: WorkspaceApiHandlers): Set<string> {
  if (type === 'themes') {
    return collectThemeKeys(projectRoot);
  }
  if (type === 'data') {
    return collectDataTableKeys(projectRoot);
  }
  return collectTemplateKeys(projectRoot, handlers);
}

function reconcileResourceOrder(order: string[], allowedKeys: Set<string>): string[] {
  const seen = new Set<string>();
  const nextOrder: string[] = [];
  for (const key of order) {
    if (!allowedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    nextOrder.push(key);
  }
  const remaining = Array.from(allowedKeys).filter((key) => !seen.has(key));
  remaining.sort((a, b) => a.localeCompare(b));
  return [...remaining, ...nextOrder];
}

export function handleWorkspaceApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  context: WorkspaceProjectContext,
  pathname: string,
  url: URL,
  handlers: WorkspaceApiHandlers,
): boolean {
  if (!pathname.startsWith('/api/workspace/')) {
    return false;
  }

  const projectRoot = context.project.root;
  const sidebarTreeStore = createSidebarTreeStore(projectRoot, {
    version: SIDEBAR_TREE_VERSION,
  });

  if (pathname === '/api/workspace/project') {
    if (req.method === 'GET') {
      sendJson(res, { title: handlers.toProjectIdentity(context.project).name });
      return true;
    }
    if (req.method === 'PATCH') {
      readJsonBody(req).then((body) => {
        const title = String(body?.title || '').trim();
        if (/[\u0000-\u001F\u007F]/.test(title)) {
          sendJson(res, { error: 'title contains invalid control characters' }, { status: 400 });
          return;
        }
        const updatedProject = handlers.updateRegisteredProjectTitle(options, context.project, title);
        sendJson(res, { success: true, title: handlers.toProjectIdentity(updatedProject).name });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
  }

  if (pathname === '/api/workspace/navigation') {
    const tab = String(url.searchParams.get('tab') || '').trim();
    if (!isSidebarTreeTab(tab)) {
      sendJson(res, { error: 'Invalid tab, expected prototypes|components|docs|canvas|themes' }, { status: 400 });
      return true;
    }
    if (req.method === 'GET') {
      if (tab === 'docs' && shouldUseFilesystemResourceRoot(projectRoot, context.metadata, 'docs')) {
        const resourceRoot = getDocsResourceRoot(projectRoot);
        const tree = scanResourceSidebarTree(resourceRoot);
        sendJson(res, { tab, version: SIDEBAR_TREE_VERSION, tree });
        return true;
      }
      const allowedItemKeys = resolveAllowedItemKeys(projectRoot, tab, context.metadata);
      const storedTree = sidebarTreeStore.getTree(tab);
      const sourceTree = storedTree.length > 0 ? storedTree : buildDefaultSidebarTree(allowedItemKeys);
      const tree = tab === 'themes'
        ? sortFlatSidebarTreeByItemOrder(
          reconcileSidebarTree(sourceTree, tab, allowedItemKeys, context.metadata),
          resolveOrderedThemeItemKeys(projectRoot, context.metadata),
        )
        : reconcileSidebarTree(sourceTree, tab, allowedItemKeys, context.metadata);
      if (JSON.stringify(tree) !== JSON.stringify(storedTree)) {
        sidebarTreeStore.setTree(tab, tree);
      }
      sendJson(res, { tab, version: SIDEBAR_TREE_VERSION, tree });
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        if (tab === 'docs' && shouldUseFilesystemResourceRoot(projectRoot, context.metadata, 'docs')) {
          const normalized = normalizeResourceSidebarTreePayload(body?.tree);
          if (normalized.valid === false) {
            sendJson(res, {
              error: normalized.error,
              ...(normalized.code ? { code: normalized.code } : {}),
              ...(normalized.path ? { path: normalized.path } : {}),
            }, { status: normalized.status });
            return;
          }
          const resourceRoot = getDocsResourceRoot(projectRoot);
          const applied = applyResourceSidebarTree(resourceRoot, normalized);
          if (applied.ok === false) {
            sendJson(res, applied.body, { status: applied.status });
            return;
          }
          const tree = scanResourceSidebarTree(resourceRoot);
          sendJson(res, { success: true, tab, version: SIDEBAR_TREE_VERSION, tree });
          return;
        }
        const allowedItemKeys = resolveAllowedItemKeys(projectRoot, tab, context.metadata);
        const normalized = normalizeAndValidateSidebarTree(body?.tree, tab, allowedItemKeys);
        if (normalized.valid === false) {
          sendJson(res, { error: normalized.error }, { status: 400 });
          return;
        }
        sidebarTreeStore.setTree(tab, normalized.tree);
        sendJson(res, { success: true, tab, version: SIDEBAR_TREE_VERSION, tree: normalized.tree });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
  }

  if (pathname === '/api/workspace/navigation/folders') {
    const tab = String(url.searchParams.get('tab') || '').trim();
    if (!isSidebarTreeTab(tab)) {
      sendJson(res, { error: 'Invalid tab, expected prototypes|components|docs|canvas|themes' }, { status: 400 });
      return true;
    }
    if (req.method === 'POST') {
      if (tab === 'docs' && shouldUseFilesystemResourceRoot(projectRoot, context.metadata, 'docs')) {
        const resourceRoot = getDocsResourceRoot(projectRoot);
        const { folderPath } = createUniqueResourceFolder(resourceRoot);
        const tree = scanResourceSidebarTree(resourceRoot);
        sendJson(res, {
          success: true,
          tab,
          version: SIDEBAR_TREE_VERSION,
          tree,
          createdFolderId: createResourceFolderNodeId(folderPath),
        }, { status: 201 });
        return true;
      }
      const allowedItemKeys = resolveAllowedItemKeys(projectRoot, tab, context.metadata);
      const storedTree = sidebarTreeStore.getTree(tab);
      const sourceTree = storedTree.length > 0 ? storedTree : buildDefaultSidebarTree(allowedItemKeys);
      const tree = reconcileSidebarTree(sourceTree, tab, allowedItemKeys, context.metadata);
      const existingIds = collectSidebarTreeIds(tree);
      const createdFolderId = createUniqueFolderNodeId(existingIds);
      const nextTree: SidebarTreeNode[] = [
        {
          id: createdFolderId,
          kind: 'folder',
          title: createRootFolderTitle(tree),
          children: [],
        },
        ...tree,
      ];
      sidebarTreeStore.setTree(tab, nextTree);
      sendJson(res, { success: true, tab, version: SIDEBAR_TREE_VERSION, tree: nextTree, createdFolderId }, { status: 201 });
      return true;
    }
    if (req.method === 'PUT') {
      if (tab !== 'docs' || !shouldUseFilesystemResourceRoot(projectRoot, context.metadata, 'docs')) {
        sendJson(res, { error: 'Named folders are only supported for filesystem resources' }, { status: 400 });
        return true;
      }
      readJsonBody(req).then((body) => {
        const result = ensureResourceFolder(getDocsResourceRoot(projectRoot), body?.folderPath);
        if (result.ok === false) {
          sendJson(res, { error: result.error }, { status: result.status });
          return;
        }
        sendJson(res, {
          success: true,
          tab,
          version: SIDEBAR_TREE_VERSION,
          tree: result.tree,
          folder: result.folder,
          absolutePath: result.absolutePath,
          created: result.created,
        }, { status: result.created ? 201 : 200 });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
  }

  if (pathname === '/api/workspace/resources/open-system') {
    if (req.method !== 'POST') {
      return false;
    }
    readJsonBody(req).then(async (body) => {
      const resourceType = String(body?.type || 'docs').trim();
      if (resourceType !== 'docs' && resourceType !== 'themes') {
        sendJson(res, { error: 'Invalid resource type, expected docs|themes' }, { status: 400 });
        return;
      }
      if (!shouldUseFilesystemResourceRoot(projectRoot, context.metadata, resourceType)) {
        sendJson(res, {
          error: 'Resource filesystem open requires an available resource root',
          code: 'RESOURCE_ROOT_REQUIRED',
          type: resourceType,
        }, { status: 424 });
        return;
      }
      const relativePath = normalizeResourceRelativePath(body?.path);
      if (!relativePath) {
        sendJson(res, { error: 'Forbidden' }, { status: 403 });
        return;
      }
      const resourceRoot = getResourceRootByType(projectRoot, context.metadata, resourceType);
      const targetPath = resolveResourcePath(resourceRoot, relativePath);
      if (!targetPath) {
        sendJson(res, { error: 'Forbidden' }, { status: 403 });
        return;
      }
      if (!fs.existsSync(targetPath)) {
        sendJson(res, { error: 'Resource not found' }, { status: 404 });
        return;
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isFile() && !stat.isDirectory()) {
        sendJson(res, { error: 'Unsupported resource path' }, { status: 400 });
        return;
      }
      const requestedKind = String(body?.kind || '').trim();
      if (requestedKind === 'file' && !stat.isFile()) {
        sendJson(res, { error: 'Resource is not a file' }, { status: 400 });
        return;
      }
      if (requestedKind === 'folder' && !stat.isDirectory()) {
        sendJson(res, { error: 'Resource is not a folder' }, { status: 400 });
        return;
      }
      const openTargetPath = stat.isFile() ? path.dirname(targetPath) : targetPath;
      try {
        await openPathInSystem(openTargetPath);
        sendJson(res, {
          success: true,
          type: resourceType,
          path: relativePath,
          kind: stat.isDirectory() ? 'directory' : 'file',
        });
      } catch (error: any) {
        sendJson(res, { error: error?.message || 'Failed to open resource' }, { status: 500 });
      }
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  if (pathname === '/api/workspace/resources/order') {
    const type = String(url.searchParams.get('type') || '').trim();
    if (!isResourceOrderType(type)) {
      sendJson(res, { error: 'Invalid type, expected themes|data|templates' }, { status: 400 });
      return true;
    }
    if (req.method === 'GET') {
      const allowedKeys = resolveAllowedResourceKeys(projectRoot, type, handlers);
      const storedOrder = sidebarTreeStore.getResourceOrder(type);
      const metadataThemeOrder = type === 'themes' ? resolveOrderedThemeKeys(projectRoot, context.metadata) : [];
      const order = metadataThemeOrder.length > 0
        ? metadataThemeOrder
        : reconcileResourceOrder(storedOrder, allowedKeys);
      if (JSON.stringify(order) !== JSON.stringify(storedOrder)) {
        sidebarTreeStore.setResourceOrder(type, order);
      }
      sendJson(res, { type, version: SIDEBAR_TREE_VERSION, order });
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        if (!Array.isArray(body?.order)) {
          sendJson(res, { error: 'order must be an array' }, { status: 400 });
          return;
        }
        const requestedOrder = body.order
          .filter((key: unknown): key is string => typeof key === 'string')
          .map((key) => key.trim())
          .filter(Boolean);
        const allowedKeys = resolveAllowedResourceKeys(projectRoot, type, handlers);
        const invalidKey = requestedOrder.find((key) => !allowedKeys.has(key));
        if (invalidKey) {
          sendJson(res, { error: `Invalid resource key: ${invalidKey}` }, { status: 400 });
          return;
        }
        const order = reconcileResourceOrder(requestedOrder, allowedKeys);
        sidebarTreeStore.setResourceOrder(type, order);
        sendJson(res, { success: true, type, version: SIDEBAR_TREE_VERSION, order });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
  }

  return false;
}
