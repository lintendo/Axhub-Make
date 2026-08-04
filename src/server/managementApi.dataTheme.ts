import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

import {
  isPathInside,
  resolveProjectPath,
  type ProjectMetadata,
  type RegisteredProject,
} from './projectCore/index.ts';

import { readJsonBody, sendJson } from './http.ts';
import { backfillMakeClientThemePreviewLinks } from './makeClientRuntimeLinks.ts';
import type { ManagementApiOptions } from './managementApi.ts';

interface DataThemeProjectContext {
  project: RegisteredProject;
  metadata: ProjectMetadata;
  metadataStore: {
    getMetadata: () => ProjectMetadata;
    saveMetadata: (metadata: ProjectMetadata) => ProjectMetadata;
  };
}

type ResourceWriteCapability = keyof ProjectMetadata['capabilities']['resourceWrites'];

interface DataThemeApiHandlers {
  createProjectContextFromBody: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    body: unknown,
  ) => DataThemeProjectContext | null;
  getDeclaredResourceWriteDir: (
    context: DataThemeProjectContext,
    type: 'data' | 'themes',
  ) => string | null;
  hasResourceWriteCapability: (
    context: DataThemeProjectContext,
    capability: ResourceWriteCapability,
  ) => boolean;
  sendResourceWriteAdapterRequired: (
    res: ServerResponse,
    context: DataThemeProjectContext,
    route: string,
    details?: Record<string, unknown>,
  ) => void;
  saveMetadataWithResourceOrder: (
    context: DataThemeProjectContext,
    metadata: ProjectMetadata,
  ) => ProjectMetadata;
  prependUnique: (values: string[], value: string) => string[];
  createProjectRelativePath: (projectRoot: string, absolutePath: string) => string;
  updateGenericResourceMetadata: (
    context: DataThemeProjectContext,
    type: 'data' | 'themes',
    previousKey: string,
    nextResource: Record<string, unknown>,
    previousOrderKey: string,
    nextOrderKey: string,
  ) => void;
  removeGenericResourceMetadata: (
    context: DataThemeProjectContext,
    type: 'data' | 'themes',
    key: string,
  ) => void;
  stringValue: (value: unknown) => string;
  readJsonFile: <T>(filePath: string, fallback: T) => T;
}

function toKebabBaseName(input: string, fallbackPrefix: string): string {
  const normalized = String(input || '')
    .trim()
    .replace(/\.[^.]+$/u, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return normalized || `${fallbackPrefix}-${Date.now()}`;
}

function getDataDir(projectRoot: string): string {
  return path.join(projectRoot, 'src/resources/data');
}

function getThemesDir(projectRoot: string): string {
  return path.join(projectRoot, 'src/themes');
}

function getDataDirForContext(context: DataThemeProjectContext, handlers: DataThemeApiHandlers): string {
  return getDataDir(context.project.root);
}

function getThemesDirForContext(context: DataThemeProjectContext, handlers: DataThemeApiHandlers): string {
  return handlers.getDeclaredResourceWriteDir(context, 'themes') || getThemesDir(context.project.root);
}

function getTablePathInDir(databaseDir: string, fileName: string): string | null {
  const normalized = String(fileName || '').trim();
  if (!normalized || normalized.includes('..') || /[\\/]/.test(normalized)) {
    return null;
  }
  const tablePath = path.resolve(databaseDir, `${normalized}.json`);
  return isPathInside(databaseDir, tablePath) ? tablePath : null;
}

function readTableFileFromDir(databaseDir: string, fileName: string) {
  const tablePath = getTablePathInDir(databaseDir, fileName);
  if (!tablePath || !fs.existsSync(tablePath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
  const records = Array.isArray(parsed.records) ? parsed.records : [];
  return {
    tablePath,
    tableName: typeof parsed.tableName === 'string' ? parsed.tableName : fileName,
    records,
  };
}

function sendDataError(res: ServerResponse, status: number, code: string, error: string, details?: unknown): void {
  sendJson(res, {
    error,
    code,
    ...(details ? { details } : {}),
    timestamp: new Date().toISOString(),
  }, { status });
}

function writeTableFile(tablePath: string, tableName: string, records: any[]): void {
  fs.mkdirSync(path.dirname(tablePath), { recursive: true });
  fs.writeFileSync(tablePath, JSON.stringify({ tableName, records }, null, 2), 'utf8');
}

function nextRecordId(records: any[]): string {
  const numericIds = records
    .map((record) => Number(record?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (numericIds.length > 0) {
    return String(Math.max(...numericIds) + 1);
  }
  return randomUUID();
}

function resolveThemeDirInDir(themesDir: string, themeName: string): string | null {
  const normalized = String(themeName || '').trim();
  if (!normalized) {
    return null;
  }
  const themeDir = path.resolve(themesDir, normalized);
  return isPathInside(themesDir, themeDir) && themeDir !== path.resolve(themesDir) ? themeDir : null;
}

function listThemesFromDir(themesDir: string) {
  if (!fs.existsSync(themesDir)) {
    return [];
  }
  return fs.readdirSync(themesDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => {
      const themeDir = path.join(themesDir, item.name);
      const designTokenPath = path.join(themeDir, 'designToken.json');
      const readmePath = path.join(themeDir, 'README.md');
      let displayName = item.name;
      if (fs.existsSync(designTokenPath)) {
        try {
          displayName = JSON.parse(fs.readFileSync(designTokenPath, 'utf8')).name || displayName;
        } catch {
          // Keep fallback.
        }
      }
      return {
        name: item.name,
        displayName,
        description: fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8').split('\n')[0].replace(/^#\s*/u, '') : '',
        hasDoc: fs.existsSync(readmePath),
        hasDesignToken: fs.existsSync(designTokenPath),
        hasGlobals: fs.existsSync(path.join(themeDir, 'globals.css')),
        hasDesignSpec: fs.existsSync(path.join(themeDir, 'DESIGN.md')) || fs.existsSync(path.join(themeDir, 'DESIGN-SPEC.md')),
        hasIndexTsx: fs.existsSync(path.join(themeDir, 'index.tsx')),
      };
    });
}

function resolveThemeSourceDirFromMetadata(
  projectRoot: string,
  themesDir: string,
  themeName: string,
  themeResource: Record<string, unknown>,
  handlers: DataThemeApiHandlers,
): string | null {
  const sourceCandidate = handlers.stringValue(themeResource.sourcePath)
    || handlers.stringValue(themeResource.path)
    || handlers.stringValue(themeResource.filePath)
    || handlers.stringValue(themeResource.absoluteFilePath);
  if (sourceCandidate) {
    try {
      const resolved = resolveProjectPath(projectRoot, sourceCandidate);
      if (fs.existsSync(resolved)) {
        return fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
      }
    } catch {
      // Ignore invalid local paths; theme links come from metadata URLs.
    }
  }
  return resolveThemeDirInDir(themesDir, themeName);
}

function normalizeThemeMetadataResource(
  projectRoot: string,
  themesDir: string,
  themeResource: Record<string, unknown>,
  handlers: DataThemeApiHandlers,
  directoryTheme?: Record<string, unknown>,
) {
  const id = handlers.stringValue(themeResource.id) || handlers.stringValue(themeResource.name);
  const name = id || handlers.stringValue(themeResource.name);
  if (!name) {
    return null;
  }

  const displayName = handlers.stringValue(themeResource.title)
    || handlers.stringValue(themeResource.displayName)
    || handlers.stringValue(themeResource.name)
    || name;
  const previewUrl = handlers.stringValue(themeResource.clientUrl)
    || handlers.stringValue(themeResource.previewUrl);
  const sourcePath = handlers.stringValue(themeResource.sourcePath);
  const localPath = sourcePath
    || handlers.stringValue(themeResource.path)
    || handlers.stringValue(themeResource.filePath)
    || handlers.stringValue(themeResource.absoluteFilePath);
  const sourceDir = resolveThemeSourceDirFromMetadata(projectRoot, themesDir, name, themeResource, handlers);
  const hasExistingSourceDir = Boolean(sourceDir && fs.existsSync(sourceDir));

  const {
    designTokenPath: _designTokenPath,
    clientUrl: _clientUrl,
    previewUrl: _previewUrl,
    displayName: _displayName,
    name: _rawName,
    ...restResource
  } = themeResource;

  return {
    ...directoryTheme,
    ...restResource,
    id,
    name,
    displayName,
    title: handlers.stringValue(themeResource.title) || displayName,
    description: handlers.stringValue(themeResource.description) || handlers.stringValue(directoryTheme?.description),
    hasDoc: typeof themeResource.hasDoc === 'boolean' ? themeResource.hasDoc : directoryTheme?.hasDoc,
    hasDesignToken: typeof themeResource.hasDesignToken === 'boolean' ? themeResource.hasDesignToken : directoryTheme?.hasDesignToken,
    hasGlobals: typeof themeResource.hasGlobals === 'boolean' ? themeResource.hasGlobals : directoryTheme?.hasGlobals,
    hasDesignSpec: typeof themeResource.hasDesignSpec === 'boolean' ? themeResource.hasDesignSpec : directoryTheme?.hasDesignSpec,
    hasIndexTsx: typeof themeResource.hasIndexTsx === 'boolean' ? themeResource.hasIndexTsx : directoryTheme?.hasIndexTsx,
    ...(previewUrl ? { clientUrl: previewUrl, previewUrl } : {}),
    ...(sourcePath ? { sourcePath } : {}),
    ...(localPath ? { path: localPath } : {}),
    ...(handlers.stringValue(themeResource.absoluteFilePath) ? { absoluteFilePath: handlers.stringValue(themeResource.absoluteFilePath) } : {}),
    ...(!handlers.stringValue(themeResource.absoluteFilePath) && hasExistingSourceDir ? { absoluteFilePath: sourceDir } : {}),
  };
}

function listThemesForContext(context: DataThemeProjectContext, themesDir: string, handlers: DataThemeApiHandlers) {
  const directoryThemes = listThemesFromDir(themesDir);
  const directoryThemeByName = new Map(directoryThemes.map((theme) => [theme.name, theme]));
  const metadataThemes = Array.isArray(context.metadata.resources.themes)
    ? context.metadata.resources.themes
    : [];
  const seenThemeNames = new Set<string>();
  const normalizedThemes = metadataThemes
    .map((themeResource) => {
      const rawTheme = themeResource as Record<string, unknown>;
      const name = handlers.stringValue(rawTheme.id) || handlers.stringValue(rawTheme.name);
      const normalized = normalizeThemeMetadataResource(
        context.project.root,
        themesDir,
        rawTheme,
        handlers,
        name ? directoryThemeByName.get(name) : undefined,
      );
      if (normalized) {
        seenThemeNames.add(normalized.name);
      }
      return normalized;
    })
    .filter((theme): theme is NonNullable<typeof theme> => Boolean(theme));

  const directoryOnlyThemes = directoryThemes.filter((theme) => !seenThemeNames.has(theme.name));
  const themes = [...normalizedThemes, ...directoryOnlyThemes];
  const orderIndex = new Map(context.metadata.orders.themes.map((themeName, index) => [themeName, index]));
  return themes.sort((first, second) => {
    const firstId = handlers.stringValue((first as Record<string, unknown>).id);
    const secondId = handlers.stringValue((second as Record<string, unknown>).id);
    const firstIndex = orderIndex.get(first.name) ?? orderIndex.get(firstId);
    const secondIndex = orderIndex.get(second.name) ?? orderIndex.get(secondId);
    if (firstIndex == null && secondIndex == null) {
      return 0;
    }
    if (firstIndex == null) {
      return 1;
    }
    if (secondIndex == null) {
      return -1;
    }
    return firstIndex - secondIndex;
  });
}

function listDataTablesFromDir(databaseDir: string) {
  if (!fs.existsSync(databaseDir)) {
    return [];
  }
  return fs.readdirSync(databaseDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fileName = file.replace(/\.json$/u, '');
      try {
        const data = JSON.parse(fs.readFileSync(path.join(databaseDir, file), 'utf8'));
        return { fileName, tableName: data.tableName || fileName };
      } catch {
        return { fileName, tableName: fileName };
      }
    });
}

export function handleProjectDataAndThemeApi(
  req: IncomingMessage,
  res: ServerResponse,
  projectContext: DataThemeProjectContext,
  options: ManagementApiOptions,
  pathname: string,
  handlers: DataThemeApiHandlers,
): boolean {
  if (handleThemes(req, res, projectContext, options, pathname, handlers)) {
    return true;
  }
  if (handleData(req, res, projectContext, options, pathname, handlers)) {
    return true;
  }
  return false;
}

function handleThemes(
  req: IncomingMessage,
  res: ServerResponse,
  projectContext: DataThemeProjectContext,
  options: ManagementApiOptions,
  pathname: string,
  handlers: DataThemeApiHandlers,
): boolean {
  let projectRoot = projectContext.project.root;
  let themesDir = getThemesDirForContext(projectContext, handlers);
  const updateResolvedProjectContext = (nextContext: DataThemeProjectContext) => {
    projectContext = nextContext;
    projectRoot = projectContext.project.root;
    themesDir = getThemesDirForContext(projectContext, handlers);
  };
  if (!pathname.startsWith('/api/themes')) {
    return false;
  }
  if (pathname === '/api/themes/check-references' && req.method === 'POST') {
    readJsonBody(req).then((body) => {
      const themeName = String(body?.themeName || '').trim();
      sendJson(res, {
        themeName,
        action: String(body?.action || ''),
        references: [],
        hasReferences: false,
      });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }
  if (pathname === '/api/themes/sync-design' && req.method === 'POST') {
    readJsonBody(req).then((body) => {
      const themeName = String(body?.themeName || '').trim();
      const rootDesignPath = path.join(projectRoot, 'DESIGN.md');
      if (!themeName) {
        fs.rmSync(rootDesignPath, { force: true });
        sendJson(res, { success: true, removed: true });
        return;
      }
      const themeDir = resolveThemeDirInDir(themesDir, themeName);
      if (!themeDir) {
        sendJson(res, { error: 'Invalid theme name' }, { status: 400 });
        return;
      }
      const designPath = path.join(themeDir, 'DESIGN.md');
      if (!fs.existsSync(designPath)) {
        fs.rmSync(rootDesignPath, { force: true });
        sendJson(res, { success: true, skipped: true });
        return;
      }
      fs.copyFileSync(designPath, rootDesignPath);
      sendJson(res, { success: true });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }
  if (pathname === '/api/themes/get-contents' && req.method === 'POST') {
    readJsonBody(req).then((body) => {
      const themeName = String(body?.themeName || body?.name || '').trim();
      const themeDir = resolveThemeDirInDir(themesDir, themeName);
      if (!themeDir || !fs.existsSync(themeDir)) {
        sendJson(res, { error: 'Theme not found' }, { status: 404 });
        return;
      }
      const readOptional = (fileName: string) => {
        const filePath = path.join(themeDir, fileName);
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      };
      sendJson(res, {
        themeName,
        design: readOptional('DESIGN.md'),
        designSpec: readOptional('DESIGN-SPEC.md'),
        globals: readOptional('globals.css'),
        readme: readOptional('README.md'),
      });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }
  if (req.method === 'GET' && (pathname === '/api/themes' || pathname === '/api/themes/')) {
    sendJson(res, backfillMakeClientThemePreviewLinks(
      listThemesForContext(projectContext, themesDir, handlers),
      projectRoot,
      options.runtimeOrigin,
      req,
    ));
    return true;
  }
  if (req.method === 'POST' && (pathname === '/api/themes' || pathname === '/api/themes/')) {
    readJsonBody(req).then((body) => {
      const bodyContext = handlers.createProjectContextFromBody(req, res, options, body);
      if (!bodyContext) return;
      updateResolvedProjectContext(bodyContext);
      if (!handlers.hasResourceWriteCapability(projectContext, 'themeCreate') || !handlers.getDeclaredResourceWriteDir(projectContext, 'themes')) {
        handlers.sendResourceWriteAdapterRequired(res, projectContext, '/api/themes');
        return;
      }
      const displayName = String(body?.displayName || body?.title || body?.name || '').trim();
      if (!displayName) {
        sendJson(res, { error: 'Missing displayName' }, { status: 400 });
        return;
      }
      const themeName = toKebabBaseName(String(body?.name || displayName), 'theme');
      const themeDir = resolveThemeDirInDir(themesDir, themeName);
      if (!themeDir) {
        sendJson(res, { error: 'Invalid theme name' }, { status: 400 });
        return;
      }
      if (fs.existsSync(themeDir)) {
        sendJson(res, { error: 'Theme already exists' }, { status: 400 });
        return;
      }
      fs.mkdirSync(themeDir, { recursive: true });
      const design = String(body?.design || body?.designSpec || '').trim();
      fs.writeFileSync(path.join(themeDir, 'designToken.json'), JSON.stringify({ name: displayName }, null, 2), 'utf8');
      fs.writeFileSync(path.join(themeDir, 'README.md'), `# ${displayName}\n`, 'utf8');
      fs.writeFileSync(path.join(themeDir, 'DESIGN.md'), design ? `${design}\n`.replace(/\n\n$/u, '\n') : `# ${displayName}\n`, 'utf8');
      const current = projectContext.metadataStore.getMetadata();
      handlers.saveMetadataWithResourceOrder(projectContext, {
        ...current,
        resources: {
          ...current.resources,
          themes: [
            {
              id: themeName,
              name: themeName,
              title: displayName,
              path: handlers.createProjectRelativePath(projectRoot, themeDir),
            },
            ...current.resources.themes.filter((theme) => theme.id !== themeName && theme.name !== themeName),
          ],
        },
        orders: {
          ...current.orders,
          themes: handlers.prependUnique(current.orders.themes, themeName),
        },
      });
      sendJson(res, {
        success: true,
        projectId: projectContext.project.id,
        name: themeName,
        displayName,
        absoluteFilePath: themeDir,
      }, { status: 201 });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }
  const themeName = decodeURIComponent(pathname.slice('/api/themes/'.length));
  const themeDir = resolveThemeDirInDir(themesDir, themeName);
  if (!themeDir) {
    sendJson(res, { error: 'Invalid theme name' }, { status: 400 });
    return true;
  }
  if (req.method === 'GET') {
    if (!fs.existsSync(themeDir)) {
      sendJson(res, { error: 'Theme not found' }, { status: 404 });
      return true;
    }
    sendJson(res, backfillMakeClientThemePreviewLinks(
      listThemesForContext(projectContext, themesDir, handlers),
      projectRoot,
      options.runtimeOrigin,
      req,
    ).find((theme) => (
      theme.name === themeName || handlers.stringValue((theme as Record<string, unknown>).id) === themeName
    )) || { name: themeName });
    return true;
  }
  if (req.method === 'DELETE') {
    fs.rmSync(themeDir, { recursive: true, force: true });
    handlers.removeGenericResourceMetadata(projectContext, 'themes', themeName);
    sendJson(res, { success: true });
    return true;
  }
  if (req.method === 'PUT') {
    readJsonBody(req).then((body) => {
      if (!fs.existsSync(themeDir)) {
        sendJson(res, { error: 'Theme not found' }, { status: 404 });
        return;
      }
      const requestedName = String(body?.name || body?.newName || '').trim();
      const nextName = requestedName ? toKebabBaseName(requestedName, themeName) : themeName;
      const nextThemeDir = resolveThemeDirInDir(themesDir, nextName);
      if (!nextThemeDir) {
        sendJson(res, { error: 'Invalid theme name' }, { status: 400 });
        return;
      }
      if (nextName !== themeName && fs.existsSync(nextThemeDir)) {
        sendJson(res, { error: 'Theme already exists' }, { status: 400 });
        return;
      }
      const displayName = String(body?.displayName || body?.title || requestedName || themeName).trim();
      if (!displayName) {
        sendJson(res, { error: 'Missing displayName' }, { status: 400 });
        return;
      }
      if (nextName !== themeName) {
        fs.renameSync(themeDir, nextThemeDir);
      }
      const designTokenPath = path.join(nextThemeDir, 'designToken.json');
      const designToken = handlers.readJsonFile<any>(designTokenPath, {});
      fs.writeFileSync(designTokenPath, JSON.stringify({ ...designToken, name: displayName }, null, 2), 'utf8');
      handlers.updateGenericResourceMetadata(projectContext, 'themes', themeName, {
        id: nextName,
        name: nextName,
        title: displayName,
        path: handlers.createProjectRelativePath(projectRoot, nextThemeDir),
      }, themeName, nextName);
      sendJson(res, { success: true, name: nextName, previousName: themeName, displayName });
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }
  return false;
}

function handleData(
  req: IncomingMessage,
  res: ServerResponse,
  projectContext: DataThemeProjectContext,
  options: ManagementApiOptions,
  pathname: string,
  handlers: DataThemeApiHandlers,
): boolean {
  let projectRoot = projectContext.project.root;
  let databaseDir = getDataDirForContext(projectContext, handlers);
  const updateResolvedProjectContext = (nextContext: DataThemeProjectContext) => {
    projectContext = nextContext;
    projectRoot = projectContext.project.root;
    databaseDir = getDataDirForContext(projectContext, handlers);
  };
  if (!pathname.startsWith('/api/data')) {
    return false;
  }
  if (pathname === '/api/data/tables') {
    if (req.method === 'GET') {
      sendJson(res, listDataTablesFromDir(databaseDir));
      return true;
    }
    if (req.method === 'POST') {
      readJsonBody(req).then((body) => {
        const bodyContext = handlers.createProjectContextFromBody(req, res, options, body);
        if (!bodyContext) return;
        updateResolvedProjectContext(bodyContext);
        if (!handlers.hasResourceWriteCapability(projectContext, 'dataCreate')) {
          handlers.sendResourceWriteAdapterRequired(res, projectContext, '/api/data/tables');
          return;
        }
        const tableName = String(body?.tableName || body?.displayName || '').trim();
        if (!tableName) {
          sendDataError(res, 400, 'VALIDATION_ERROR', 'Missing tableName');
          return;
        }
        const fileName = toKebabBaseName(String(body?.fileName || tableName), 'table');
        const tablePath = getTablePathInDir(databaseDir, fileName);
        if (!tablePath) {
          sendDataError(res, 400, 'VALIDATION_ERROR', 'Invalid fileName');
          return;
        }
        if (fs.existsSync(tablePath)) {
          sendDataError(res, 400, 'TABLE_EXISTS', `Table '${fileName}' already exists`);
          return;
        }
        writeTableFile(tablePath, tableName, []);
        sendJson(res, {
          success: true,
          projectId: projectContext.project.id,
          fileName,
          tableName,
          absoluteFilePath: tablePath,
        }, { status: 201 });
      }).catch((error) => sendDataError(res, 400, 'INVALID_JSON', error.message));
      return true;
    }
  }

  const tableAdminMatch = pathname.match(/^\/api\/data\/tables\/([^/]+)$/u);
  if (tableAdminMatch) {
    const fileName = decodeURIComponent(tableAdminMatch[1]);
    const tablePath = getTablePathInDir(databaseDir, fileName);
    if (!tablePath) {
      sendDataError(res, 400, 'VALIDATION_ERROR', 'Invalid fileName');
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        const table = readTableFileFromDir(databaseDir, fileName);
        if (!table) {
          sendDataError(res, 404, 'NOT_FOUND', `Table '${fileName}' not found`);
          return;
        }
        const nextFileName = String(body?.fileName || body?.name || fileName).trim();
        const nextTablePath = getTablePathInDir(databaseDir, nextFileName);
        if (!nextTablePath) {
          sendDataError(res, 400, 'VALIDATION_ERROR', 'Invalid fileName');
          return;
        }
        if (nextTablePath !== table.tablePath && fs.existsSync(nextTablePath)) {
          sendDataError(res, 400, 'TABLE_EXISTS', `Table '${nextFileName}' already exists`);
          return;
        }
        const tableName = String(body?.tableName || table.tableName).trim() || table.tableName;
        writeTableFile(nextTablePath, tableName, table.records);
        if (nextTablePath !== table.tablePath) {
          fs.rmSync(table.tablePath, { force: true });
        }
        sendJson(res, { success: true, fileName: nextFileName, previousFileName: fileName, tableName });
      }).catch((error) => sendDataError(res, 400, 'INVALID_JSON', error.message));
      return true;
    }
    if (req.method === 'DELETE') {
      if (!fs.existsSync(tablePath)) {
        sendDataError(res, 404, 'NOT_FOUND', `Table '${fileName}' not found`);
        return true;
      }
      fs.rmSync(tablePath, { force: true });
      sendJson(res, { success: true });
      return true;
    }
  }

  const exportMatch = pathname.match(/^\/api\/data\/([^/]+)\/export$/u);
  if (exportMatch && req.method === 'GET') {
    const fileName = decodeURIComponent(exportMatch[1]);
    const table = readTableFileFromDir(databaseDir, fileName);
    if (!table) {
      sendDataError(res, 404, 'NOT_FOUND', `Table '${fileName}' not found`);
      return true;
    }
    const csv = Papa.unparse(table.records, { quotes: true, header: true });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${fileName}.csv`)}"`);
    res.end(csv);
    return true;
  }

  const importMatch = pathname.match(/^\/api\/data\/([^/]+)\/import$/u);
  if (importMatch && req.method === 'POST') {
    const fileName = decodeURIComponent(importMatch[1]);
    readJsonBody(req).then((body) => {
      const table = readTableFileFromDir(databaseDir, fileName);
      if (!table) {
        sendDataError(res, 404, 'NOT_FOUND', `Table '${fileName}' not found`);
        return;
      }
      const csvData = String(body?.csvData || '');
      if (!csvData) {
        sendDataError(res, 400, 'VALIDATION_ERROR', 'Missing or invalid csvData parameter');
        return;
      }
      const parseResult = Papa.parse<Record<string, unknown>>(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
      });
      if (parseResult.errors.length > 0) {
        sendDataError(res, 400, 'CSV_PARSE_ERROR', 'Failed to parse CSV file', { errors: parseResult.errors });
        return;
      }
      const records = parseResult.data.map((record) => {
        const id = (record as any).id;
        return id === undefined || id === null || id === '' ? { ...record, id: randomUUID() } : record;
      });
      writeTableFile(table.tablePath, table.tableName, records);
      sendJson(res, { success: true, recordCount: records.length, records });
    }).catch((error) => sendDataError(res, 400, 'INVALID_JSON', error.message));
    return true;
  }

  const tableMatch = pathname.match(/^\/api\/data\/([^/]+)$/u);
  if (tableMatch) {
    const fileName = decodeURIComponent(tableMatch[1]);
    const table = readTableFileFromDir(databaseDir, fileName);
    if (!table) {
      sendDataError(res, 404, 'NOT_FOUND', `Table '${fileName}' not found`);
      return true;
    }
    if (req.method === 'GET') {
      sendJson(res, table.records);
      return true;
    }
    if (req.method === 'POST') {
      readJsonBody(req).then((body) => {
        const id = body?.id ?? nextRecordId(table.records);
        if (table.records.some((record) => String(record?.id) === String(id))) {
          sendDataError(res, 400, 'DUPLICATE_ID', `Record with id '${id}' already exists`);
          return;
        }
        const record = { ...body, id };
        writeTableFile(table.tablePath, table.tableName, [...table.records, record]);
        sendJson(res, record, { status: 201 });
      }).catch((error) => sendDataError(res, 400, 'INVALID_JSON', error.message));
      return true;
    }
  }

  const recordMatch = pathname.match(/^\/api\/data\/([^/]+)\/([^/]+)$/u);
  if (recordMatch) {
    const fileName = decodeURIComponent(recordMatch[1]);
    const recordId = decodeURIComponent(recordMatch[2]);
    const table = readTableFileFromDir(databaseDir, fileName);
    if (!table) {
      sendDataError(res, 404, 'NOT_FOUND', `Table '${fileName}' not found`);
      return true;
    }
    const recordIndex = table.records.findIndex((record) => String(record?.id) === String(recordId));
    if (recordIndex < 0) {
      sendDataError(res, 404, 'NOT_FOUND', `Record with id '${recordId}' not found`);
      return true;
    }
    if (req.method === 'GET') {
      sendJson(res, table.records[recordIndex]);
      return true;
    }
    if (req.method === 'PUT') {
      readJsonBody(req).then((body) => {
        const updatedRecord = {
          ...table.records[recordIndex],
          ...body,
          id: table.records[recordIndex].id,
        };
        const records = [...table.records];
        records[recordIndex] = updatedRecord;
        writeTableFile(table.tablePath, table.tableName, records);
        sendJson(res, updatedRecord);
      }).catch((error) => sendDataError(res, 400, 'INVALID_JSON', error.message));
      return true;
    }
    if (req.method === 'DELETE') {
      writeTableFile(table.tablePath, table.tableName, table.records.filter((_, index) => index !== recordIndex));
      sendJson(res, { success: true });
      return true;
    }
  }
  return false;
}
