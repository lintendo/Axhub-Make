import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  createProjectCommunicationStore,
  createProjectMetadataStore,
  getProjectMetadataPath,
  isPathInside,
  readMakeClientMarker,
  type ProjectMetadata,
  type RegisteredProject,
} from './projectCore/index.ts';

import { getRequestUrl, readJsonBody, sendFile, sendJson } from './http.ts';
import { sendHtmlDocumentPreview } from './htmlDocumentPreview.ts';
import { LocalCommandError } from './localCommand.ts';
import { backfillMakeClientResourcePreviewLinks } from './makeClientRuntimeLinks.ts';
import { getMakeClientDevStatus } from './makeClientProject.ts';
import { handleProjectFolderBrowserApi } from './managementApi.folderBrowser.ts';
import { handleMakeClientProjectApi } from './managementApi.makeClient.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import { PROTOTYPE_PLACEHOLDER_GUIDE } from './prototypePlaceholderGuide.ts';
import { scanResourceFiles, type ResourceFileOpenMode } from './resourceFiles.ts';

type ProjectMetadataStore = ReturnType<typeof createProjectMetadataStore>;
type EffectiveProjectCapabilities = ProjectMetadata['capabilities'] & { lanAccessAllowed: boolean };
interface FilesystemDocResource {
  id: string;
  name: string;
  title: string;
  path: string;
  description: string;
  updatedAt: string;
  filePath?: string;
  ext?: string;
  size?: number;
  fileSize?: number;
  absoluteFilePath?: string;
  openMode?: ResourceFileOpenMode;
}

function hasExplicitThemeLocalPath(theme: ProjectMetadata['resources']['themes'][number]): boolean {
  return ['sourcePath', 'path', 'filePath', 'absoluteFilePath'].some((key) => {
    const value = theme[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function collectLocalThemeDirectories(projectRoot: string, themesDir: string): Map<string, string> | null {
  if (!fs.existsSync(themesDir)) {
    return null;
  }
  try {
    const realProjectRoot = fs.realpathSync.native(projectRoot);
    const realThemesDir = fs.realpathSync.native(themesDir);
    if (!isPathInside(realProjectRoot, realThemesDir)) {
      return null;
    }

    const directories = new Map<string, string>();
    for (const entry of fs.readdirSync(themesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const themeDir = path.join(themesDir, entry.name);
      const realThemeDir = fs.realpathSync.native(themeDir);
      if (isPathInside(realThemesDir, realThemeDir)) {
        directories.set(entry.name, themeDir);
      }
    }
    return directories;
  } catch {
    return null;
  }
}

function reconcilePrototypeFilesystemFields(
  prototype: ProjectMetadata['resources']['prototypes'][number],
  scannedPrototype: ProjectMetadata['resources']['prototypes'][number],
): ProjectMetadata['resources']['prototypes'][number] {
  const fields = ['filePath', 'absoluteFilePath', 'specFilePath', 'previewDisabled'] as const;
  if (fields.every((field) => prototype[field] === scannedPrototype[field])) {
    return prototype;
  }
  const {
    filePath: _filePath,
    absoluteFilePath: _absoluteFilePath,
    specFilePath: _specFilePath,
    previewDisabled: _previewDisabled,
    ...rest
  } = prototype;
  return {
    ...rest,
    ...(scannedPrototype.filePath ? { filePath: scannedPrototype.filePath } : {}),
    ...(scannedPrototype.absoluteFilePath ? { absoluteFilePath: scannedPrototype.absoluteFilePath } : {}),
    ...(scannedPrototype.specFilePath ? { specFilePath: scannedPrototype.specFilePath } : {}),
    ...(scannedPrototype.previewDisabled === true ? { previewDisabled: true } : {}),
  };
}

/**
 * Reconcile metadata resources with actual filesystem state.
 * - Reconciles prototype entries against the declared/default local source root.
 * - Discovers theme directories that aren't in metadata.
 * This makes the filesystem the single source of truth — no manual sync needed.
 */
function reconcileMetadataWithFilesystem(
  metadataStore: ProjectMetadataStore,
  projectRoot: string,
): ProjectMetadata {
  const metadata = metadataStore.getMetadata();
  let changed = false;

  // --- Prototypes reconciliation ---
  const { prototypesDir, shouldReconcile: shouldReconcilePrototypes } = getPrototypeResourceRoot(projectRoot, metadata);
  const scannedPrototypes = shouldReconcilePrototypes ? scanFilesystemPrototypeResources(projectRoot, prototypesDir) : [];
  const scannedPrototypeIds = new Set(scannedPrototypes.map((prototype) => prototype.id));
  const scannedPrototypeByKey = new Map<string, ProjectMetadata['resources']['prototypes'][number]>();
  for (const prototype of scannedPrototypes) {
    scannedPrototypeByKey.set(prototype.id, prototype);
    scannedPrototypeByKey.set(prototype.name, prototype);
  }
  const stalePrototypeIds: string[] = [];
  const reconciledPrototypes = metadata.resources.prototypes
    .filter((prototype) => {
      if (!shouldReconcilePrototypes) {
        return true;
      }
      if (scannedPrototypeIds.has(prototype.id) || scannedPrototypeIds.has(prototype.name)) {
        return true;
      }
      stalePrototypeIds.push(prototype.id);
      return false;
    })
    .map((prototype) => {
      const scannedPrototype = shouldReconcilePrototypes
        ? scannedPrototypeByKey.get(prototype.id) ?? scannedPrototypeByKey.get(prototype.name)
        : null;
      if (scannedPrototype) {
        const filesystemPrototype = reconcilePrototypeFilesystemFields(prototype, scannedPrototype);
        if (filesystemPrototype !== prototype) {
          changed = true;
        }
        if (scannedPrototype.placeholder === true) {
          if (filesystemPrototype.placeholder === true && filesystemPrototype.placeholderGuide) {
            return filesystemPrototype;
          }
          changed = true;
          return {
            ...filesystemPrototype,
            placeholder: true,
            placeholderGuide: scannedPrototype.placeholderGuide || PROTOTYPE_PLACEHOLDER_GUIDE,
          };
        }
        if (scannedPrototype.generationStatus === 'waiting' && filesystemPrototype.generationStatus !== 'waiting') {
          changed = true;
          const { placeholder: _placeholder, placeholderGuide: _placeholderGuide, ...rest } = filesystemPrototype;
          return {
            ...rest,
            generationStatus: 'waiting',
          };
        }
        if (filesystemPrototype.placeholder === true || filesystemPrototype.placeholderGuide) {
          changed = true;
          const { placeholder: _placeholder, placeholderGuide: _placeholderGuide, ...rest } = filesystemPrototype;
          return rest;
        }
        if (scannedPrototype.generationStatus !== 'waiting' && filesystemPrototype.generationStatus) {
          changed = true;
          const { generationStatus: _generationStatus, ...rest } = filesystemPrototype;
          return rest;
        }
        return filesystemPrototype;
      }
      if (prototype.placeholder !== true || prototype.placeholderGuide) {
        return prototype;
      }
      changed = true;
      return {
        ...prototype,
        placeholderGuide: PROTOTYPE_PLACEHOLDER_GUIDE,
      };
    });
  if (stalePrototypeIds.length > 0) {
    changed = true;
  }
  const existingPrototypeIds = new Set(reconciledPrototypes.flatMap((prototype) => [prototype.id, prototype.name].filter(Boolean)));
  const discoveredPrototypes = scannedPrototypes.filter((prototype) => {
    if (existingPrototypeIds.has(prototype.id) || existingPrototypeIds.has(prototype.name)) {
      return false;
    }
    existingPrototypeIds.add(prototype.id);
    existingPrototypeIds.add(prototype.name);
    return true;
  });
  if (discoveredPrototypes.length > 0) {
    changed = true;
  }
  const allPrototypes = [...reconciledPrototypes, ...discoveredPrototypes];

  // --- Themes reconciliation (only when themes dir exists) ---
  const themesTarget = metadata.resourceWriteTargets?.themes;
  const themesDir = themesTarget?.type === 'project-relative-path' && themesTarget.path
    ? path.resolve(projectRoot, themesTarget.path)
    : path.join(projectRoot, 'src/themes');

  let reconciledThemes = metadata.resources.themes;
  const discoveredThemes: typeof metadata.resources.themes = [];
  const localThemeDirectories = collectLocalThemeDirectories(projectRoot, themesDir);
  if (localThemeDirectories) {
    // Remove stale themes (directory deleted from disk)
    const existingThemeIds = new Set(metadata.resources.themes.map((t) => t.id));
    reconciledThemes = metadata.resources.themes.flatMap((theme) => {
      const themeSubDir = localThemeDirectories.get(theme.id);
      if (!themeSubDir) {
        return [];
      }
      if (hasExplicitThemeLocalPath(theme)) {
        return [theme];
      }
      changed = true;
      return [{
        ...theme,
        sourcePath: createProjectRelativePath(projectRoot, themeSubDir),
      }];
    });
    // Discover new themes (directories in src/themes not in metadata)
    for (const [themeName, themeDir] of localThemeDirectories) {
      if (existingThemeIds.has(themeName)) continue;
      discoveredThemes.push({
        id: themeName,
        name: themeName,
        title: themeName,
        sourcePath: createProjectRelativePath(projectRoot, themeDir),
      });
    }
    if (reconciledThemes.length !== metadata.resources.themes.length || discoveredThemes.length > 0) {
      changed = true;
    }
  }

  const stalePrototypeIdSet = new Set(stalePrototypeIds);
  const allowedPrototypeIds = new Set(allPrototypes.flatMap((prototype) => [prototype.id, prototype.name].filter(Boolean)));
  const nextNavigationPrototypes: string[] = [];
  const seenNavigationPrototypes = new Set<string>();
  for (const prototypeId of metadata.navigation.prototypes) {
    if (!allowedPrototypeIds.has(prototypeId) || stalePrototypeIdSet.has(prototypeId) || seenNavigationPrototypes.has(prototypeId)) {
      changed = true;
      continue;
    }
    seenNavigationPrototypes.add(prototypeId);
    nextNavigationPrototypes.push(prototypeId);
  }
  for (const prototype of discoveredPrototypes) {
    if (seenNavigationPrototypes.has(prototype.id)) {
      continue;
    }
    seenNavigationPrototypes.add(prototype.id);
    nextNavigationPrototypes.push(prototype.id);
  }

  const allThemes = [...reconciledThemes, ...discoveredThemes];

  if (!changed) {
    return metadata;
  }

  return metadataStore.saveMetadata({
    ...metadata,
    resources: {
      ...metadata.resources,
      prototypes: allPrototypes,
      themes: allThemes,
    },
    navigation: {
      ...metadata.navigation,
      prototypes: nextNavigationPrototypes,
    },
    orders: {
      ...metadata.orders,
      themes: [
        ...metadata.orders.themes.filter((key) => allThemes.some((t) => t.id === key || t.name === key)),
        ...discoveredThemes.map((t) => t.id),
      ],
    },
  });
}

function getDocsResourceRoot(projectRoot: string): string {
  return path.join(projectRoot, 'src/resources');
}

function getPrototypeResourceRoot(projectRoot: string, metadata: ProjectMetadata): {
  prototypesDir: string;
  shouldReconcile: boolean;
} {
  const target = metadata.resourceWriteTargets?.prototypes;
  if (target?.type === 'project-relative-path' && target.path) {
    const resolvedTarget = path.resolve(projectRoot, target.path);
    if (isPathInside(projectRoot, resolvedTarget)) {
      return {
        prototypesDir: resolvedTarget,
        shouldReconcile: true,
      };
    }
  }

  const defaultDir = path.join(projectRoot, 'src/prototypes');
  return {
    prototypesDir: defaultDir,
    shouldReconcile: fs.existsSync(defaultDir),
  };
}

function normalizeRelativePath(baseDir: string, absolutePath: string): string {
  return path.relative(baseDir, absolutePath).split(path.sep).join('/');
}

function readPrototypeTitle(indexFilePath: string, fallback: string): string {
  try {
    const source = fs.readFileSync(indexFilePath, 'utf8');
    const title = source.match(/@name\s+([^\n]+)/u)?.[1]?.replace(/\*\/\s*$/u, '').trim();
    return title || fallback;
  } catch {
    return fallback;
  }
}

function hasGeneratedPlaceholderSource(indexFilePath: string): boolean {
  try {
    const source = fs.readFileSync(indexFilePath, 'utf8');
    const hasGeneratedShell = source.includes('placeholder-empty-page')
      && source.includes('export default function Placeholder');
    return hasGeneratedShell && (
      source.includes('@axhub-placeholder prototype-empty')
      || source.includes('className="placeholder-empty-page"')
    );
  } catch {
    return false;
  }
}

function hasWaitingGenerationSource(indexFilePath: string): boolean {
  try {
    const source = fs.readFileSync(indexFilePath, 'utf8');
    return source.includes('prototype-waiting-generation-page')
      && source.includes('正在等待生成')
      && source.includes('export default function WaitingGeneration');
  } catch {
    return false;
  }
}

function readFileUpdatedAt(filePath: string): string {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function readMarkdownTitle(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

function findMainPrototypeSpec(prototypeDir: string): string | null {
  const specDir = path.join(prototypeDir, '.spec');
  for (const name of ['spec.html', 'spec.md']) {
    const specPath = path.join(specDir, name);
    try {
      if (fs.statSync(specPath).isFile()) return specPath;
    } catch {
      // Missing or invalid specs are not discoverable resources.
    }
  }
  return null;
}

function readPrototypeSpecTitle(filePath: string, fallback: string): string {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    return path.extname(filePath).toLowerCase() === '.md'
      ? readMarkdownTitle(filePath) || fallback
      : source.match(/<title[^>]*>\s*([^<]+?)\s*<\/title>/iu)?.[1]?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function createProjectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function scanFilesystemPrototypeResources(
  projectRoot: string,
  prototypesDir: string,
): ProjectMetadata['resources']['prototypes'] {
  if (!fs.existsSync(prototypesDir)) {
    return [];
  }

  const prototypes: ProjectMetadata['resources']['prototypes'] = [];
  for (const entry of fs.readdirSync(prototypesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    const prototypeDir = path.join(prototypesDir, entry.name);
    const indexFilePath = path.join(prototypeDir, 'index.tsx');
    const specFilePath = findMainPrototypeSpec(prototypeDir);
    if (!fs.existsSync(indexFilePath) && !specFilePath) {
      continue;
    }
    if (!fs.existsSync(indexFilePath) && specFilePath) {
      prototypes.push({
        id: entry.name,
        name: entry.name,
        title: readPrototypeSpecTitle(specFilePath, entry.name),
        clientUrl: `/prototypes/${encodeURIComponent(entry.name)}`,
        previewMode: 'clientRuntime',
        previewDisabled: true,
        description: '',
        updatedAt: readFileUpdatedAt(specFilePath),
        specFilePath: createProjectRelativePath(projectRoot, specFilePath),
      });
      continue;
    }
    const hasGeneratedPlaceholder = hasGeneratedPlaceholderSource(indexFilePath);
    const placeholder = hasGeneratedPlaceholder;
    const generationStatus = !placeholder && hasWaitingGenerationSource(indexFilePath)
      ? 'waiting' as const
      : undefined;
    prototypes.push({
      id: entry.name,
      name: entry.name,
      title: readPrototypeTitle(indexFilePath, entry.name),
      clientUrl: `/prototypes/${encodeURIComponent(entry.name)}`,
      previewMode: 'clientRuntime',
      description: '',
      updatedAt: readFileUpdatedAt(indexFilePath),
      filePath: createProjectRelativePath(projectRoot, indexFilePath),
      absoluteFilePath: indexFilePath,
      ...(specFilePath ? { specFilePath: createProjectRelativePath(projectRoot, specFilePath) } : {}),
      ...(placeholder ? { placeholder: true, placeholderGuide: PROTOTYPE_PLACEHOLDER_GUIDE } : {}),
      ...(generationStatus ? { generationStatus } : {}),
    });
  }
  return prototypes.sort((a, b) => a.id.localeCompare(b.id));
}

function scanFilesystemDocResources(projectRoot: string): FilesystemDocResource[] {
  return scanResourceFiles(projectRoot);
}

function createProjectResourcesPayload(metadata: ProjectMetadata, projectRoot: string) {
  return {
    prototypes: metadata.resources.prototypes,
    docs: scanFilesystemDocResources(projectRoot),
    themes: metadata.resources.themes,
  };
}

function createProjectNavigationPayload(metadata: ProjectMetadata) {
  return {
    prototypes: metadata.navigation.prototypes,
  };
}

function createProjectOrdersPayload(metadata: ProjectMetadata) {
  return {
    themes: metadata.orders.themes,
  };
}


type ProjectRegistry = {
  getRegistryPath: () => string;
  getRegistry: () => {
    activeProjectId?: string | null;
    projects: RegisteredProject[];
  };
  getProject: (projectId: string) => RegisteredProject | null;
  getActiveProject: () => RegisteredProject | null;
  listProjects: () => RegisteredProject[];
  addProject: (project: {
    id: string;
    name: string;
    root: string;
    metadataPath: string;
  }) => RegisteredProject;
  updateProject: (projectId: string, updates: Partial<RegisteredProject>) => RegisteredProject;
  removeProject: (projectId: string) => void;
  setActiveProject: (projectId: string) => void;
};

interface ProjectRegistryRequestContext {
  project: RegisteredProject;
  metadata: ProjectMetadata;
  metadataStore: ProjectMetadataStore;
}

interface ProjectRegistryApiHandlers {
  getProjectRegistryForRequest: (options: ManagementApiOptions) => ProjectRegistry;
  addOrUpdateRegistryProjectByRoot: (
    registry: ProjectRegistry,
    params: {
      id: string;
      name: string;
      root: string;
      metadataPath: string;
    },
  ) => RegisteredProject;
  toProjectEntry: (project: RegisteredProject) => RegisteredProject;
  toProjectIdentity: (project: RegisteredProject) => { id: string; name: string };
  updateRegisteredProjectTitle: (options: ManagementApiOptions, project: RegisteredProject, title: string) => RegisteredProject;
  getStartupProjectContext?: (options: ManagementApiOptions, projectId?: string) => ProjectRegistryRequestContext | null;
  selectLocalProjectRootForKind: (kind: string) => Promise<string | null>;
  getExistingMetadataStore: (res: ServerResponse, project: RegisteredProject) => ProjectMetadataStore | null;
  createEffectiveProjectCapabilities: (context: ProjectRegistryRequestContext) => EffectiveProjectCapabilities;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function getLocalCommandErrorPayload(error: unknown): Record<string, unknown> {
  if (!(error instanceof LocalCommandError)) {
    return {};
  }
  return {
    command: error.command,
    args: error.args,
    escapedCommand: error.escapedCommand,
    exitCode: error.exitCode,
    stderr: error.stderr,
    stdout: error.stdout,
  };
}

function getDocPathOutsideProjectResourceId(error: unknown): string | null {
  const match = getErrorMessage(error).match(/^Doc resource (.+) is outside project root$/u);
  return match?.[1] || null;
}

function isIgnoredResourceRelativePath(relativePath: string): boolean {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return true;
  if (normalized.toLowerCase() === 'readme.md') return true;
  return normalized.split('/').some((segment) => segment.startsWith('.'));
}

function isIgnoredProjectDocumentPath(relativePath: string): boolean {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return true;
  return normalized.split('/').some((segment) => ['.git', '.axhub'].includes(segment.toLowerCase()));
}

function normalizeDocContentRequestPath(value: string): string {
  const rawValue = String(value || '').trim().replace(/\\/g, '/');
  if (!rawValue || rawValue.includes('\0') || rawValue.startsWith('/') || path.win32.isAbsolute(rawValue) || path.posix.isAbsolute(rawValue)) {
    return '';
  }
  const segments = rawValue.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    return '';
  }
  return segments.join('/');
}

function resolveDocContentFileByRelativePath(
  projectRoot: string,
  resourceId: string,
): FilesystemDocResource | null {
  const requestedPath = normalizeDocContentRequestPath(resourceId);
  if (!requestedPath || isIgnoredResourceRelativePath(requestedPath)) {
    return null;
  }

  const docsDir = getDocsResourceRoot(projectRoot);
  const candidatePaths = [requestedPath];
  if (!requestedPath.toLowerCase().endsWith('.md')) {
    candidatePaths.push(`${requestedPath}.md`);
  }

  for (const candidatePath of [...new Set(candidatePaths)]) {
    if (isIgnoredResourceRelativePath(candidatePath)) {
      continue;
    }
    if (path.extname(candidatePath).toLowerCase() !== '.md') {
      continue;
    }
    const targetPath = path.resolve(docsDir, candidatePath);
    if (!isPathInside(docsDir, targetPath) || !isPathInside(projectRoot, targetPath)) {
      continue;
    }
    try {
      if (!fs.statSync(targetPath).isFile()) {
        continue;
      }
    } catch {
      continue;
    }
    const id = candidatePath.replace(/\.[^.]+$/u, '');
    return {
      id,
      name: id,
      title: readMarkdownTitle(targetPath) || id,
      path: targetPath,
      description: '',
      updatedAt: readFileUpdatedAt(targetPath),
    };
  }

  return null;
}

function normalizeProjectDocumentRequestPath(value: string): string {
  const rawValue = String(value || '').trim().replace(/\\/g, '/');
  if (!rawValue || rawValue.includes('\0') || rawValue.startsWith('/') || path.win32.isAbsolute(rawValue) || path.posix.isAbsolute(rawValue)) {
    return '';
  }
  const segments = rawValue.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    return '';
  }
  const normalized = segments.join('/');
  if (isIgnoredProjectDocumentPath(normalized)) {
    return '';
  }
  if (!['.md', '.htm', '.html'].includes(path.extname(normalized).toLowerCase())) {
    return '';
  }
  return normalized;
}

function isResolvedProjectPathSafe(projectRoot: string, candidatePath: string): boolean {
  try {
    const realProjectRoot = fs.realpathSync.native(projectRoot);
    let existingPath = candidatePath;
    while (!fs.existsSync(existingPath)) {
      const parentPath = path.dirname(existingPath);
      if (parentPath === existingPath) return false;
      existingPath = parentPath;
    }
    return isPathInside(realProjectRoot, fs.realpathSync.native(existingPath));
  } catch {
    return false;
  }
}

function resolveProjectDocumentContentFile(projectRoot: string, requestedPath: string): {
  path: string;
  projectRelativePath: string;
} | null {
  const projectRelativePath = normalizeProjectDocumentRequestPath(requestedPath);
  if (!projectRelativePath) {
    return null;
  }
  const targetPath = path.resolve(projectRoot, projectRelativePath);
  if (!isPathInside(projectRoot, targetPath) || !isResolvedProjectPathSafe(projectRoot, targetPath)) {
    return null;
  }
  return {
    path: targetPath,
    projectRelativePath,
  };
}

function buildProjectDocumentPreviewResourceUrl(
  projectId: string,
  documentPath: string,
  rawValue: string,
): { value: string } {
  const value = String(rawValue || '').trim();
  if (!value || value.startsWith('#') || value.startsWith('?') || value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return { value: rawValue };
  }
  const hashIndex = value.indexOf('#');
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf('?');
  const encodedAssetPath = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  let assetPath = encodedAssetPath;
  try {
    assetPath = decodeURIComponent(encodedAssetPath);
  } catch {
    return { value: rawValue };
  }
  const params = new URLSearchParams({ path: documentPath, asset: assetPath });
  for (const [key, paramValue] of new URLSearchParams(query)) params.append(key, paramValue);
  return { value: `/api/projects/${encodeURIComponent(projectId)}/document-asset?${params.toString()}${hash}` };
}

function normalizeProjectDocumentAssetPath(value: string): string {
  const rawValue = String(value || '').trim().replace(/\\/g, '/');
  if (!rawValue || rawValue.includes('\0') || rawValue.startsWith('/') || path.win32.isAbsolute(rawValue) || path.posix.isAbsolute(rawValue)) {
    return '';
  }
  const normalized = path.posix.normalize(rawValue).replace(/^\.\/+/, '');
  return normalized && normalized !== '.' ? normalized : '';
}

const projectDocumentImagePlaceholderPattern = /^__ANNOTATION_IMAGE_([A-Z0-9]+(?:_[A-Z0-9]+)*)__$/u;
const projectDocumentImageAssetExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

function getProjectDocumentPlaceholderAssetBaseName(assetPath: string): string {
  const match = String(assetPath || '').trim().match(projectDocumentImagePlaceholderPattern);
  if (!match) {
    return '';
  }
  return match[1].toLowerCase().replace(/_/gu, '-');
}

function resolveProjectDocumentPlaceholderAssetFile(
  projectRoot: string,
  doc: { path: string; projectRelativePath: string },
  requestedAssetPath: string,
): string | null {
  const assetBaseName = getProjectDocumentPlaceholderAssetBaseName(requestedAssetPath);
  if (!assetBaseName) {
    return null;
  }

  const prototypeMatch = doc.projectRelativePath.match(/^src\/prototypes\/([^/]+)\/docs(?:\/|$)/u);
  if (!prototypeMatch) {
    return null;
  }

  try {
    if (!fs.statSync(doc.path).isFile() || !fs.readFileSync(doc.path, 'utf8').includes(requestedAssetPath)) {
      return null;
    }
  } catch {
    return null;
  }

  const assetsDir = path.resolve(projectRoot, 'src', 'prototypes', prototypeMatch[1], 'assets');
  if (!isPathInside(projectRoot, assetsDir)) {
    return null;
  }

  for (const extension of projectDocumentImageAssetExtensions) {
    const candidatePath = path.join(assetsDir, `${assetBaseName}${extension}`);
    if (!isPathInside(assetsDir, candidatePath) || !isPathInside(projectRoot, candidatePath)) {
      continue;
    }
    try {
      if (fs.statSync(candidatePath).isFile()) {
        return candidatePath;
      }
    } catch {
      continue;
    }
  }

  return path.join(assetsDir, `${assetBaseName}.png`);
}

function resolveProjectDocumentAssetFile(projectRoot: string, requestedDocPath: string, requestedAssetPath: string): string | null {
  const doc = resolveProjectDocumentContentFile(projectRoot, requestedDocPath);
  const assetPath = normalizeProjectDocumentAssetPath(requestedAssetPath);
  if (!doc || !assetPath) {
    return null;
  }

  const placeholderAssetPath = resolveProjectDocumentPlaceholderAssetFile(projectRoot, doc, requestedAssetPath);
  if (placeholderAssetPath) {
    return placeholderAssetPath;
  }

  const docDir = path.dirname(doc.path);
  const targetPath = path.resolve(docDir, assetPath);
  return isPathInside(projectRoot, targetPath)
    && isResolvedProjectPathSafe(projectRoot, targetPath)
    ? targetPath
    : null;
}

function sendProjectMetadataError(
  res: ServerResponse,
  error: unknown,
  context: {
    project?: RegisteredProject;
    projectId?: string;
    projectRoot?: string;
    metadataPath?: string;
  } = {},
): void {
  const resourceId = getDocPathOutsideProjectResourceId(error);
  if (resourceId) {
    sendJson(res, {
      error: 'Doc path is outside project root',
      code: 'DOC_PATH_OUTSIDE_PROJECT',
      ...(context.projectId || context.project?.id ? { projectId: context.projectId || context.project?.id } : {}),
      resourceId,
      ...(context.project?.root || context.projectRoot ? { projectRoot: context.project?.root || context.projectRoot } : {}),
      ...(context.project?.metadataPath || context.metadataPath ? { metadataPath: context.project?.metadataPath || context.metadataPath } : {}),
    }, { status: 403 });
    return;
  }

  sendJson(res, {
    error: getErrorMessage(error) || 'Project metadata is invalid',
    code: 'PROJECT_METADATA_INVALID',
    ...(context.projectId || context.project?.id ? { projectId: context.projectId || context.project?.id } : {}),
    ...(context.project?.root || context.projectRoot ? { projectRoot: context.project?.root || context.projectRoot } : {}),
    ...(context.project?.metadataPath || context.metadataPath ? { metadataPath: context.project?.metadataPath || context.metadataPath } : {}),
  }, { status: 400 });
}

function readProjectMetadataOrSendError(
  res: ServerResponse,
  metadataStore: ProjectMetadataStore,
  context: {
    project: RegisteredProject;
    projectId: string;
  },
): ProjectMetadata | null {
  try {
    return metadataStore.getMetadata();
  } catch (error) {
    sendProjectMetadataError(res, error, context);
    return null;
  }
}

export function handleProjectRegistryApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  handlers: ProjectRegistryApiHandlers,
): boolean {
  if (!pathname.startsWith('/api/projects')) {
    return false;
  }

  const registry = handlers.getProjectRegistryForRequest(options);
  if (handleProjectFolderBrowserApi(req, res, pathname, getRequestUrl(req))) {
    return true;
  }

  if (handleMakeClientProjectApi(req, res, options, pathname, registry, {
    addOrUpdateMakeClientRegistryProject: (params) => handlers.addOrUpdateRegistryProjectByRoot(registry, {
      ...params,
      metadataPath: params.metadataPath || getProjectMetadataPath(params.root),
    }),
    toProjectEntry: handlers.toProjectEntry,
  })) {
    return true;
  }

  if (pathname === '/api/projects/select-root' && req.method === 'POST') {
    const kind = String(getRequestUrl(req).searchParams.get('kind') || '').trim();
    handlers.selectLocalProjectRootForKind(kind || 'existing')
      .then((root) => sendJson(res, root ? { root } : { root: null, cancelled: true }))
      .catch((error) => sendJson(res, {
        error: error.message,
        code: 'LOCAL_PROJECT_PICKER_UNAVAILABLE',
        ...getLocalCommandErrorPayload(error),
      }, { status: 501 }));
    return true;
  }

  if (pathname === '/api/projects' && req.method === 'GET') {
    const data = registry.getRegistry();
    Promise.all(data.projects.map(async (project) => ({
      ...handlers.toProjectEntry(project),
      runtimeStatus: await getMakeClientDevStatus(project.id, project.root),
    })))
      .then((projects) => sendJson(res, {
        activeProjectId: data.activeProjectId,
        projects,
      }))
      .catch((error) => sendJson(res, { error: error.message }, { status: 500 }));
    return true;
  }

  if (pathname === '/api/projects' && req.method === 'POST') {
    sendJson(res, {
      error: 'Generic project registration is no longer supported. Register an official Make client project instead.',
      code: 'MAKE_CLIENT_PROJECT_REQUIRED',
      route: '/api/projects/make/register-existing',
    }, { status: 410 });
    return true;
  }

  if (pathname === '/api/projects/active') {
    if (req.method === 'GET') {
      const activeProject = registry.getActiveProject();
      sendJson(res, activeProject ? { ...activeProject } : {});
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        const projectId = String(body?.projectId || body?.id || '').trim();
        if (!projectId) {
          sendJson(res, { error: 'Missing projectId' }, { status: 400 });
          return;
        }
        registry.setActiveProject(projectId);
        sendJson(res, { activeProject: registry.getActiveProject() });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
  }

  const match = pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/u);
  if (!match) {
    return false;
  }
  const projectId = decodeURIComponent(match[1]);
  const rest = match[2] || '';
  const registryProject = registry.getProject(projectId);
  const startupContext = !registryProject && !fs.existsSync(registry.getRegistryPath())
    ? handlers.getStartupProjectContext?.(options, projectId) ?? null
    : null;
  const project = registryProject || startupContext?.project || null;
  if (!project) {
    sendJson(res, {
      error: `Project not found: ${projectId}`,
      code: 'project-not-found',
      projectId,
    }, { status: 404 });
    return true;
  }

  if (handleMakeClientProjectApi(req, res, options, pathname, registry, {
    addOrUpdateMakeClientRegistryProject: (params) => handlers.addOrUpdateRegistryProjectByRoot(registry, {
      ...params,
      metadataPath: params.metadataPath || getProjectMetadataPath(params.root),
    }),
    toProjectEntry: handlers.toProjectEntry,
  }, { projectId, rest, project })) {
    return true;
  }

  if (!rest && req.method === 'PATCH') {
    readJsonBody(req).then((body) => {
      let updated = registry.updateProject(projectId, {
        ...(typeof body?.root === 'string' ? { root: body.root } : {}),
        ...(typeof body?.metadataPath === 'string' ? { metadataPath: body.metadataPath } : {}),
      });
      if (typeof body?.name === 'string') {
        updated = handlers.updateRegisteredProjectTitle(options, updated, body.name);
      }
      sendJson(res, { project: handlers.toProjectEntry(updated) });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  if (!rest && req.method === 'DELETE') {
    registry.removeProject(projectId);
    sendJson(res, { success: true });
    return true;
  }

  if (rest.startsWith('communication/')) {
    const metadataStore = handlers.getExistingMetadataStore(res, project);
    if (!metadataStore) {
      return true;
    }
    if (!readProjectMetadataOrSendError(res, metadataStore, { project, projectId })) {
      return true;
    }
    const communicationStore = createProjectCommunicationStore(project.root);
    const communicationTarget = rest.slice('communication/'.length);
    if (req.method !== 'POST') {
      return false;
    }
    readJsonBody(req).then((body) => {
      const baseInput = {
        projectId,
        resourceId: typeof body?.resourceId === 'string' ? body.resourceId : undefined,
        resourceType: typeof body?.resourceType === 'string' ? body.resourceType : undefined,
        status: typeof body?.status === 'string' ? body.status : 'pending',
        errorMessage: typeof body?.errorMessage === 'string' ? body.errorMessage : typeof body?.error === 'string' ? body.error : '',
        timestamp: typeof body?.timestamp === 'string' ? body.timestamp : undefined,
      };
      let result;
      if (communicationTarget === 'sessions') {
        result = communicationStore.appendSessionRecord({
          ...baseInput,
          clientUrlOrigin: typeof body?.clientUrlOrigin === 'string' ? body.clientUrlOrigin : undefined,
          runtimeVersion: typeof body?.runtimeVersion === 'string' ? body.runtimeVersion : undefined,
          messageType: typeof body?.messageType === 'string' ? body.messageType : undefined,
          diagnosticOnly: body?.diagnosticOnly === true,
        });
      } else if (communicationTarget === 'exports') {
        result = communicationStore.appendExportRecord({
          ...baseInput,
          operationType: typeof body?.operationType === 'string' ? body.operationType : 'export',
          metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
        });
      } else if (communicationTarget === 'edit-history') {
        result = communicationStore.appendEditHistoryRecord({
          ...baseInput,
          operationType: typeof body?.operationType === 'string' ? body.operationType : 'quickEdit',
          metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
        });
      } else if (communicationTarget === 'runtime-message') {
        result = communicationStore.appendRuntimeMessageRecord({
          ...baseInput,
          messageType: typeof body?.messageType === 'string' ? body.messageType : 'axhub.quickEdit.unknown',
        });
      } else {
        sendJson(res, { error: 'Unknown communication record target' }, { status: 404 });
        return;
      }
      sendJson(res, {
        success: true,
        kind: result.kind,
        record: result.record,
        filePath: result.filePath,
      }, { status: 201 });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  if (rest === 'resources') {
    const metadataStore = handlers.getExistingMetadataStore(res, project);
    if (!metadataStore) {
      return true;
    }
    if (req.method === 'GET') {
      let metadata: ProjectMetadata;
      try {
        metadata = backfillMakeClientResourcePreviewLinks(
          reconcileMetadataWithFilesystem(metadataStore, project.root),
          project.root,
          options.runtimeOrigin,
          req,
        );
      } catch (error) {
        sendProjectMetadataError(res, error, { project, projectId });
        return true;
      }
      sendJson(res, {
        project: handlers.toProjectIdentity(project),
        resources: createProjectResourcesPayload(metadata, project.root),
        navigation: createProjectNavigationPayload(metadata),
        orders: createProjectOrdersPayload(metadata),
        capabilities: handlers.createEffectiveProjectCapabilities({ project, metadata, metadataStore }),
      });
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        const current = metadataStore.getMetadata();
        const updated = metadataStore.saveMetadata({
          ...current,
          resources: body?.resources ?? current.resources,
          navigation: body?.navigation ?? current.navigation,
          orders: body?.orders ?? current.orders,
          capabilities: body?.capabilities ?? current.capabilities,
        });
        sendJson(res, {
          project: handlers.toProjectIdentity(project),
          resources: updated.resources,
          navigation: createProjectNavigationPayload(updated),
          orders: createProjectOrdersPayload(updated),
          capabilities: handlers.createEffectiveProjectCapabilities({ project, metadata: updated, metadataStore }),
        });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
  }

  if (rest === 'document-content') {
    const metadataStore = handlers.getExistingMetadataStore(res, project);
    if (!metadataStore) {
      return true;
    }
    const metadata = readProjectMetadataOrSendError(res, metadataStore, { project, projectId });
    if (!metadata) {
      return true;
    }
    void metadata;
    const requestedPath = getRequestUrl(req).searchParams.get('path') || '';
    const doc = resolveProjectDocumentContentFile(project.root, requestedPath);
    if (!doc) {
      sendJson(res, {
        error: 'Document path is forbidden',
        code: 'DOCUMENT_PATH_FORBIDDEN',
        projectId,
        projectRoot: project.root,
      }, { status: 403 });
      return true;
    }
    if (req.method === 'GET') {
      if (!fs.existsSync(doc.path) || !fs.statSync(doc.path).isFile()) {
        sendJson(res, {
          error: 'Document file not found',
          code: 'DOCUMENT_FILE_MISSING',
          projectId,
          path: doc.path,
          projectRelativePath: doc.projectRelativePath,
        }, { status: 404 });
        return true;
      }
      if (sendHtmlDocumentPreview(req, res, doc.path, {
        documentName: doc.projectRelativePath,
        projectId,
        rewriteRelativeUrl: (value) => buildProjectDocumentPreviewResourceUrl(
          projectId,
          doc.projectRelativePath,
          value,
        ),
      })) {
        return true;
      }
      sendJson(res, {
        content: fs.readFileSync(doc.path, 'utf8'),
        path: doc.path,
        projectRelativePath: doc.projectRelativePath,
      });
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        fs.mkdirSync(path.dirname(doc.path), { recursive: true });
        fs.writeFileSync(doc.path, String(body?.content ?? ''), 'utf8');
        sendJson(res, {
          success: true,
          path: doc.path,
          projectRelativePath: doc.projectRelativePath,
        });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
    return false;
  }

  if (rest === 'document-asset') {
    const metadataStore = handlers.getExistingMetadataStore(res, project);
    if (!metadataStore) {
      return true;
    }
    const metadata = readProjectMetadataOrSendError(res, metadataStore, { project, projectId });
    if (!metadata) {
      return true;
    }
    void metadata;

    if (req.method !== 'GET') {
      return false;
    }

    const url = getRequestUrl(req);
    const targetPath = resolveProjectDocumentAssetFile(
      project.root,
      url.searchParams.get('path') || '',
      url.searchParams.get('asset') || '',
    );
    if (!targetPath) {
      sendJson(res, {
        error: 'Document asset path is forbidden',
        code: 'DOCUMENT_ASSET_PATH_FORBIDDEN',
        projectId,
        projectRoot: project.root,
      }, { status: 403 });
      return true;
    }
    if (!sendFile(res, targetPath)) {
      sendJson(res, {
        error: 'Document asset not found',
        code: 'DOCUMENT_ASSET_MISSING',
        projectId,
      }, { status: 404 });
    }
    return true;
  }

  const docMatch = rest.match(/^docs\/([^/]+)\/content$/u);
  if (docMatch) {
    const metadataStore = handlers.getExistingMetadataStore(res, project);
    if (!metadataStore) {
      return true;
    }
    const resourceId = decodeURIComponent(docMatch[1]);
    const metadata = readProjectMetadataOrSendError(res, metadataStore, { project, projectId });
    if (!metadata) {
      return true;
    }
    const doc = resolveDocContentFileByRelativePath(project.root, resourceId);
    if (!doc) {
      sendJson(res, { error: 'Doc not found' }, { status: 404 });
      return true;
    }
    if (!isPathInside(project.root, doc.path)) {
      sendJson(res, {
        error: 'Doc path is outside project root',
        code: 'DOC_PATH_OUTSIDE_PROJECT',
        projectId,
        resourceId: doc.id,
        path: doc.path,
        projectRoot: project.root,
      }, { status: 403 });
      return true;
    }
    if (req.method === 'GET') {
      if (!fs.existsSync(doc.path)) {
        sendJson(res, {
          error: 'Doc file not found',
          code: 'DOC_FILE_MISSING',
          projectId,
          resourceId: doc.id,
          path: doc.path,
        }, { status: 404 });
        return true;
      }
      sendJson(res, { content: fs.readFileSync(doc.path, 'utf8'), path: doc.path });
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        fs.writeFileSync(doc.path, String(body?.content ?? ''), 'utf8');
        sendJson(res, { success: true, path: doc.path });
      }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
      return true;
    }
  }

  return false;
}
