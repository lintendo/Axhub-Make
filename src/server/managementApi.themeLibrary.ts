import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  isPathInside,
  readServerInfo,
  type ProjectMetadata,
  type RegisteredProject,
} from './projectCore/index.ts';

import {
  designKnowledgeThemeCatalog,
  type ThemeCatalogPlatform,
  type ThemeCatalogRecord,
} from './designKnowledgeThemeCatalog.ts';
import { readJsonBody, sendJson } from './http.ts';
import { runLocalCommand } from './localCommand.ts';
import type { ManagementApiOptions } from './managementApi.ts';

interface ThemeLibraryProjectContext {
  project: RegisteredProject;
  metadata: ProjectMetadata;
  metadataStore: {
    getMetadata: () => ProjectMetadata;
    saveMetadata: (metadata: ProjectMetadata) => ProjectMetadata;
  };
}

interface ThemeLibraryHandlers {
  createProjectContextFromBody: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    body: unknown,
  ) => ThemeLibraryProjectContext | null;
  getDeclaredResourceWriteDir: (
    context: ThemeLibraryProjectContext,
    type: 'themes',
  ) => string | null;
  hasResourceWriteCapability: (
    context: ThemeLibraryProjectContext,
    capability: keyof ProjectMetadata['capabilities']['resourceWrites'],
  ) => boolean;
  sendDisabledCapability: (
    res: ServerResponse,
    status: number,
    payload: {
      code: string;
      error: string;
      projectId?: string;
      projectRoot?: string;
      adapterRequired?: boolean;
      details?: Record<string, unknown>;
    },
  ) => void;
}

const activeThemeImportTargets = new Set<string>();

function sendThemeLibraryError(
  res: ServerResponse,
  status: number,
  code: string,
  error: string,
  details?: Record<string, unknown>,
): void {
  sendJson(res, {
    ok: false,
    code,
    error,
    ...(details ? { details } : {}),
  }, { status });
}

function parsePlatform(value: unknown): ThemeCatalogPlatform | null {
  return value === 'desktop' || value === 'mobile' ? value : null;
}

function parseListPlatform(req: IncomingMessage): ThemeCatalogPlatform | null {
  const value = new URL(req.url || '/', 'http://localhost').searchParams.get('platform');
  return value === null || value === '' ? 'desktop' : parsePlatform(value);
}

function themeLibraryErrorCode(error: any): 'THEME_LIBRARY_SCHEMA_INVALID' | 'THEME_LIBRARY_REMOTE_UNAVAILABLE' {
  return error?.code === 'THEME_LIBRARY_SCHEMA_INVALID'
    ? 'THEME_LIBRARY_SCHEMA_INVALID'
    : 'THEME_LIBRARY_REMOTE_UNAVAILABLE';
}

async function execFilePromise(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return runLocalCommand(command, args, { cwd, maxBuffer: 1024 * 1024 * 10 });
}

async function extractTarball(tarballPath: string, targetDir: string): Promise<void> {
  fs.mkdirSync(targetDir, { recursive: true });
  await execFilePromise('tar', ['-xzf', tarballPath, '-C', targetDir], path.dirname(tarballPath));
}

function copyDirectoryRecursive(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function createProjectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function prependUnique(values: string[], value: string): string[] {
  return [value, ...values.filter((item) => item !== value)];
}

function resolveThemeClientUrl(
  options: ManagementApiOptions,
  context: ThemeLibraryProjectContext,
  themeId: string,
): string {
  const projectRuntimeOrigin = readServerInfo(context.project.root, 'runtime')?.origin;
  const base = (projectRuntimeOrigin || options.runtimeOrigin || options.origin || '').replace(/\/+$/u, '');
  return `${base}/themes/${encodeURIComponent(themeId)}`;
}

function updateThemeMetadataAfterImport(
  context: ThemeLibraryProjectContext,
  params: {
    theme: ThemeCatalogRecord;
    themeDir: string;
    entryPath: string;
    clientUrl: string;
  },
): string {
  const current = context.metadataStore.getMetadata();
  const themePath = createProjectRelativePath(context.project.root, params.themeDir);
  const filePath = createProjectRelativePath(context.project.root, params.entryPath);
  context.metadata = context.metadataStore.saveMetadata({
    ...current,
    resources: {
      ...current.resources,
      themes: [
        {
          id: params.theme.slug,
          name: params.theme.slug,
          title: params.theme.title,
          path: themePath,
          sourcePath: themePath,
          filePath,
          absoluteFilePath: params.entryPath,
          clientUrl: params.clientUrl,
          previewUrl: params.clientUrl,
          description: params.theme.description,
          updatedAt: new Date().toISOString(),
        },
        ...current.resources.themes.filter((theme) => theme.id !== params.theme.slug && theme.name !== params.theme.slug),
      ],
    },
    orders: {
      ...current.orders,
      themes: prependUnique(current.orders.themes, params.theme.slug),
    },
  });
  return filePath;
}

function requireThemeImportTarget(
  res: ServerResponse,
  context: ThemeLibraryProjectContext,
  handlers: ThemeLibraryHandlers,
): string | null {
  const targetBaseDir = handlers.getDeclaredResourceWriteDir(context, 'themes');
  if (!handlers.hasResourceWriteCapability(context, 'themeImport') || !targetBaseDir) {
    handlers.sendDisabledCapability(res, 424, {
      error: 'Theme library import requires project-side theme write capability in make-server',
      code: 'THEME_LIBRARY_IMPORT_ADAPTER_REQUIRED',
      projectId: context.project.id,
      projectRoot: context.project.root,
      adapterRequired: true,
      details: {
        route: '/api/theme-library/import',
        reason: 'missing-theme-import-capability-or-target',
      },
    });
    return null;
  }
  return targetBaseDir;
}

async function handleListThemeLibrary(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const platform = parseListPlatform(req);
  if (!platform) {
    sendThemeLibraryError(res, 400, 'THEME_LIBRARY_PLATFORM_INVALID', 'platform must be desktop or mobile');
    return;
  }

  try {
    const result = await designKnowledgeThemeCatalog.load(platform);
    sendJson(res, {
      schemaVersion: 1,
      ...result,
    });
  } catch (error: any) {
    const code = themeLibraryErrorCode(error);
    sendThemeLibraryError(res, 502, code, error?.message || 'Failed to load theme library');
  }
}

async function handleImportThemeLibrary(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  handlers: ThemeLibraryHandlers,
): Promise<void> {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, { error: 'Invalid JSON body', code: 'INVALID_JSON_BODY' }, { status: 400 });
    return;
  }

  const context = handlers.createProjectContextFromBody(req, res, options, body);
  if (!context) return;

  const targetBaseDir = requireThemeImportTarget(res, context, handlers);
  if (!targetBaseDir) return;

  const themeId = typeof body?.themeId === 'string' ? body.themeId.trim() : '';
  if (!themeId) {
    sendThemeLibraryError(res, 400, 'THEME_LIBRARY_THEME_ID_REQUIRED', 'Missing themeId');
    return;
  }
  const platform = parsePlatform(body?.platform);
  if (!platform) {
    sendThemeLibraryError(res, 400, 'THEME_LIBRARY_PLATFORM_INVALID', 'platform must be desktop or mobile');
    return;
  }

  const tempRoot = path.join(context.project.root, 'temp', 'theme-library');
  const tempDir = path.join(tempRoot, `${Date.now()}-${randomUUID()}`);
  let targetDir = '';
  let stagingDir = '';
  let activeTargetKey = '';
  let ownsActiveTarget = false;
  let publishedTarget = false;
  try {
    const theme = await designKnowledgeThemeCatalog.getRecord(platform, themeId);
    if (!theme) {
      sendThemeLibraryError(res, 404, 'THEME_LIBRARY_THEME_NOT_FOUND', `Theme not found: ${themeId}`);
      return;
    }
    if (!theme.canDirectImport) {
      sendThemeLibraryError(
        res,
        409,
        'THEME_LIBRARY_NOT_IMPORTABLE',
        theme.directImportDisabledReason || 'This theme does not provide a verified import package',
        { themeId, platform },
      );
      return;
    }

    targetDir = path.join(targetBaseDir, theme.slug);
    if (!isPathInside(targetBaseDir, targetDir) || targetDir === path.resolve(targetBaseDir)) {
      throw new Error('Theme target path is unsafe');
    }
    activeTargetKey = path.resolve(targetDir);
    if (activeThemeImportTargets.has(activeTargetKey)) {
      sendThemeLibraryError(
        res,
        409,
        'THEME_LIBRARY_IMPORT_IN_PROGRESS',
        `Theme import is already in progress: ${theme.slug}`,
        { themeId, folderName: theme.slug },
      );
      return;
    }
    activeThemeImportTargets.add(activeTargetKey);
    ownsActiveTarget = true;
    if (fs.existsSync(targetDir)) {
      sendThemeLibraryError(
        res,
        409,
        'THEME_LIBRARY_TARGET_EXISTS',
        `Theme folder already exists: ${theme.slug}`,
        { themeId, folderName: theme.slug },
      );
      return;
    }

    fs.mkdirSync(tempDir, { recursive: true });
    const tarballPath = path.join(tempDir, 'package.tar.gz');
    fs.writeFileSync(tarballPath, await designKnowledgeThemeCatalog.downloadPackage(theme));
    const extractDir = path.join(tempDir, 'extract');
    await extractTarball(tarballPath, extractDir);

    const sourceEntryPath = path.join(extractDir, 'index.tsx');
    if (!isPathInside(extractDir, sourceEntryPath) || !fs.existsSync(sourceEntryPath) || !fs.statSync(sourceEntryPath).isFile()) {
      throw new Error('Theme package must contain index.tsx at its root');
    }

    fs.mkdirSync(targetBaseDir, { recursive: true });
    stagingDir = path.join(targetBaseDir, `.axhub-theme-import-${theme.slug}-${randomUUID()}`);
    if (!isPathInside(targetBaseDir, stagingDir)) throw new Error('Theme staging path is unsafe');
    copyDirectoryRecursive(extractDir, stagingDir);
    if (fs.existsSync(targetDir)) {
      sendThemeLibraryError(
        res,
        409,
        'THEME_LIBRARY_TARGET_EXISTS',
        `Theme folder already exists: ${theme.slug}`,
        { themeId, folderName: theme.slug },
      );
      return;
    }
    fs.renameSync(stagingDir, targetDir);
    stagingDir = '';
    publishedTarget = true;
    const entryPath = path.join(targetDir, 'index.tsx');
    const clientUrl = resolveThemeClientUrl(options, context, theme.slug);
    const filePath = updateThemeMetadataAfterImport(context, {
      theme,
      themeDir: targetDir,
      entryPath,
      clientUrl,
    });
    sendJson(res, {
      success: true,
      projectId: context.project.id,
      themeId: theme.id,
      platform: theme.platform,
      folderName: theme.slug,
      path: `themes/${theme.slug}`,
      filePath,
      absoluteFilePath: entryPath,
      clientUrl,
    });
  } catch (error: any) {
    if (publishedTarget && targetDir && fs.existsSync(targetDir) && isPathInside(targetBaseDir, targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
      sendThemeLibraryError(res, 409, 'THEME_LIBRARY_TARGET_EXISTS', 'Theme folder already exists');
      return;
    }
    const code = error?.code === 'THEME_LIBRARY_SCHEMA_INVALID'
      || error?.code === 'THEME_LIBRARY_REMOTE_UNAVAILABLE'
      ? themeLibraryErrorCode(error)
      : 'THEME_LIBRARY_IMPORT_FAILED';
    sendThemeLibraryError(
      res,
      code === 'THEME_LIBRARY_IMPORT_FAILED' ? 400 : 502,
      code,
      error?.message || 'Theme library import failed',
    );
  } finally {
    if (stagingDir) fs.rmSync(stagingDir, { recursive: true, force: true });
    if (ownsActiveTarget && activeTargetKey) activeThemeImportTargets.delete(activeTargetKey);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function handleThemeLibraryApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  handlers: ThemeLibraryHandlers,
): boolean {
  if (pathname === '/api/theme-library') {
    if (req.method !== 'GET') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    void handleListThemeLibrary(req, res);
    return true;
  }

  if (pathname === '/api/theme-library/import') {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Method not allowed' }, { status: 405 });
      return true;
    }
    void handleImportThemeLibrary(req, res, options, handlers);
    return true;
  }

  return false;
}
