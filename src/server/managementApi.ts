import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  createProjectMetadataStore,
  createProjectRegistry,
  createServerConfigStore,
  getConfigPath,
  getGlobalAdminServerInfoPath,
  getProjectMetadataPath,
  isPathInside,
  type MakeStateHealthResult,
  readMakeClientMarker,
  readServerInfo,
  resolveProjectPath,
  type ProjectMetadata,
  type RegisteredProject,
} from './projectCore/index.ts';
import {
  readProjectIdentity,
  syncProjectIdentitySource,
  updateProjectIdentityName,
} from './projectIdentity.ts';
import {
  allocateRegisteredProjectId,
  findRegisteredProjectByRoot,
} from './projectRegistration.ts';

import {
  getRequestUrl,
  readJsonBody,
  sendFile,
  sendJson,
  sendText,
  streamDirectoryAsZip,
} from './http.ts';
import { handleAiArtifactHistoryApi } from './managementApi.aiArtifactHistory.ts';
import { handleAiRunsApi } from './managementApi.aiRuns.ts';
import { handleAxhubApi } from './managementApi.axhub.ts';
import { handleAssistantPromptIde } from './managementApi.assistantIde.ts';
import { handleBridgeAndImageProxy } from './managementApi.bridge.ts';
import { handleCanvasApi } from './managementApi.canvas.ts';
import { handleCodeReviewApi } from './managementApi.codeReview.ts';
import { handleCloudPublishingApi, type CommandExecutor } from './managementApi.cloudPublishing.ts';
import { handleConfigApi, readMakeServerVersion } from './managementApi.config.ts';
import { handleProjectDataAndThemeApi } from './managementApi.dataTheme.ts';
import { handleProjectDocsApi } from './managementApi.docs.ts';
import { handleEntriesCompatibilityApi } from './managementApi.entries.ts';
import { handleSourceBackedExports, handleUnavailableManagement } from './managementApi.exports.ts';
import { handleFileOperationsApi } from './managementApi.fileOperations.ts';
import { handleGitApi, type GitWorkspaceCommandExecutor } from './managementApi.git.ts';
import { handleLegacyDocsApi } from './managementApi.legacyDocs.ts';
import { handleLegacyWebSocketApi } from './managementApi.legacyWebSocket.ts';
import { handleProjectRegistryApi } from './managementApi.projectRegistry.ts';
import { handleAxhubReviewReportsApi } from './managementApi.axhubReviewReports.ts';
import { handleReviewReportsApi } from './managementApi.reviewReports.ts';
import { handlePrototypeAnnotationApi } from './managementApi.prototypeAnnotation.ts';
import { handlePrototypeCommentsApi } from './managementApi.prototypeComments.ts';
import { handlePrototypeSpecApi } from './managementApi.prototypeSpec.ts';
import {
  handleCreatePlaceholderPrototype,
  handlePrototypeUploadApi,
  handleStartPlaceholderPrototypeGeneration,
} from './managementApi.prototypeUpload.ts';
import { handleUploadAndReferenceApis } from './managementApi.references.ts';
import { findProjectResourceByPath, getAxureArtifactPaths, resolveSourceFileFromMetadata } from './managementApi.resourceLookup.ts';
import { handleProjectSourceAndZipApi } from './managementApi.sourceZip.ts';
import { handleTemplateLibraryApi } from './managementApi.templateLibrary.ts';
import { handleThemeLibraryApi } from './managementApi.themeLibrary.ts';
import { handleWorkspaceApi, SIDEBAR_TREE_VERSION } from './managementApi.workspace.ts';
import { handleMediaApi } from './mediaApi.ts';
import { handleHtmlReviewArtifactsApi } from './htmlReviewArtifacts.ts';
import { handleHtmlResourceEditingApi } from './htmlResourceEditing.ts';
import { handleQuickEditRuntimeApi } from './quickEditRuntimeApi.ts';
import { hasFigmaMakeArtifactCapability } from './exportMakeArtifacts.ts';
import { getCanvasBridgeHub } from './canvasBridge.ts';
import { selectLocalDirectory } from './localDirectoryPicker.ts';
import {
  createAssistantRuntimeResponse,
  resolveAssistantRuntime,
} from './assistantRuntime.ts';
import type { DiagnosticLog } from './diagnosticLog.ts';

export interface ManagementApiOptions {
  projectRoot: string;
  startupProjectRoot?: string;
  adminRoot?: string;
  origin: string;
  runtimeOrigin?: string;
  registryPath?: string;
  serverInfoHomeDir?: string;
  serverInfo?: {
    pid: number;
    port: number;
    host: string;
    origin: string;
    projectRoot: string;
    startedAt: string;
  };
  makeStateHealth?: MakeStateHealthResult;
  refreshMakeStateHealth?: () => MakeStateHealthResult;
  devMode?: boolean;
  diagnosticLog?: DiagnosticLog;
  axhubOnlineBaseUrl?: string;
  cloudPublishingCommandExecutor?: CommandExecutor;
  gitWorkspaceCommandExecutor?: GitWorkspaceCommandExecutor;
}

interface ProjectRequestContext {
  project: RegisteredProject;
  metadata: ProjectMetadata;
  metadataStore: ReturnType<typeof createProjectMetadataStore>;
}

type EffectiveProjectCapabilities = ProjectMetadata['capabilities'] & { lanAccessAllowed: boolean };
type ProjectMetadataAvailabilityError = {
  message: string;
  code: 'PROJECT_METADATA_MISSING' | 'PROJECT_METADATA_INVALID';
  projectId: string;
  metadataPath: string;
};

interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

function createEffectiveProjectCapabilities(context: ProjectRequestContext): EffectiveProjectCapabilities {
  const capabilities = context.metadata.capabilities;
  const hasTarget = (type: 'docs' | 'templates' | 'themes' | 'data' | 'media' | 'prototypes') => (
    Boolean(getDeclaredResourceWriteDir(context, type))
  );
  const hasPrototypeCreateTarget = Boolean(getPrototypeCreateDir(context));
  const hasDocsWriteTarget = Boolean(getDocsWriteDir(context));
  const hasTemplatesWriteTarget = Boolean(getTemplatesDirForContext(context));
  const hasDataWriteTarget = Boolean(getDataDir(context.project.root));

  return {
    ...capabilities,
    lanAccessAllowed: true,
    localExports: {
      html: hasTarget('prototypes'),
      make: hasFigmaMakeArtifactCapability(context.project.root, context.metadata),
    },
    resourceWrites: {
      prototypeCreate: hasPrototypeCreateTarget,
      prototypeUpload: hasTarget('prototypes'),
      docCreate: hasDocsWriteTarget,
      docImport: hasDocsWriteTarget,
      themeCreate: hasTarget('themes'),
      themeImport: hasTarget('themes'),
      dataCreate: hasDataWriteTarget,
      dataImport: false,
      templateCreate: hasTemplatesWriteTarget,
      templateDuplicate: hasTemplatesWriteTarget,
    },
  };
}

function encodeUrlPathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function readRawRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readMultipartParts(req: IncomingMessage): Promise<MultipartPart[]> {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/iu);
  const boundary = String(boundaryMatch?.[1] || boundaryMatch?.[2] || '').trim();
  if (!boundary) {
    throw new Error('Missing multipart boundary');
  }

  const body = (await readRawRequestBody(req)).toString('binary');
  const delimiter = `--${boundary}`;
  return body
    .split(delimiter)
    .slice(1, -1)
    .map((rawPart): MultipartPart | null => {
      const part = rawPart.replace(/^\r\n/u, '').replace(/\r\n$/u, '');
      const separatorIndex = part.indexOf('\r\n\r\n');
      if (separatorIndex < 0) {
        return null;
      }
      const rawHeaders = part.slice(0, separatorIndex);
      const rawContent = part.slice(separatorIndex + 4);
      const disposition = rawHeaders.match(/content-disposition:\s*([^\r\n]+)/iu)?.[1] || '';
      const name = disposition.match(/name="([^"]*)"/iu)?.[1] || '';
      if (!name) {
        return null;
      }
      const filename = disposition.match(/filename="([^"]*)"/iu)?.[1];
      const contentTypeHeader = rawHeaders.match(/content-type:\s*([^\r\n]+)/iu)?.[1]?.trim();
      return {
        name,
        filename,
        contentType: contentTypeHeader,
        data: Buffer.from(rawContent, 'binary'),
      };
    })
    .filter((part): part is MultipartPart => Boolean(part));
}

function getMultipartTextField(parts: MultipartPart[], name: string): string {
  return parts.find((part) => part.name === name && !part.filename)?.data.toString('utf8').trim() || '';
}

function getMultipartTextFields(parts: MultipartPart[], name: string): string[] {
  return parts
    .filter((part) => part.name === name && !part.filename)
    .map((part) => part.data.toString('utf8').trim());
}

function createProjectEntryBase(project: RegisteredProject) {
  const identity = readProjectIdentity(project.root, {
    metadataPath: project.metadataPath,
    fallback: project,
  });
  return {
    ...project,
    name: identity.name,
  };
}

function toProjectEntry(project: RegisteredProject) {
  const entry = createProjectEntryBase(project);
  const availabilityError = getProjectMetadataAvailabilityError(project);
  if (availabilityError) {
    return {
      ...entry,
      unavailable: true,
      error: availabilityError,
    };
  }
  return entry;
}

function toProjectIdentity(project: RegisteredProject) {
  const identity = readProjectIdentity(project.root, {
    metadataPath: project.metadataPath,
    fallback: project,
  });
  return {
    id: project.id,
    name: identity.name,
  };
}

function getProjectRegistryForRequest(options: ManagementApiOptions) {
  return createProjectRegistry(options.registryPath ? { registryPath: options.registryPath } : undefined);
}

function addOrUpdateRegistryProjectByRoot(
  registry: ReturnType<typeof createProjectRegistry>,
  params: {
    id: string;
    name: string;
    root: string;
    metadataPath: string;
  },
): RegisteredProject {
  const root = path.resolve(params.root);
  const existingByRoot = findRegisteredProjectByRoot(registry.listProjects(), root);
  if (existingByRoot) {
    const error = new Error(`Project path already registered: ${root}`) as Error & { code?: string; status?: number };
    error.code = 'MAKE_PROJECT_PATH_CONFLICT';
    error.status = 409;
    throw error;
  }
  const projectId = allocateRegisteredProjectId(
    params.id,
    (candidate) => Boolean(registry.getProject(candidate)),
  );
  const { identity } = syncProjectIdentitySource(root, {
    metadataPath: params.metadataPath,
    fallback: params,
    projectId,
  });
  return registry.addProject({
    id: identity.id,
    name: identity.name,
    root,
    metadataPath: params.metadataPath,
  });
}

function getServerConfigStoreForRequest(options: ManagementApiOptions) {
  const registryPath = options.registryPath;
  const homeDir = registryPath ? path.dirname(path.dirname(path.dirname(registryPath))) : undefined;
  return createServerConfigStore(homeDir ? { homeDir } : undefined);
}

function updateRegisteredProjectTitle(options: ManagementApiOptions, project: RegisteredProject, title: string): RegisteredProject {
  const registry = getProjectRegistryForRequest(options);
  const registeredProject = registry.getProject(project.id);
  const { identity } = updateProjectIdentityName(project.root, title, {
    metadataPath: project.metadataPath,
    fallback: project,
  });
  if (!registeredProject) {
    return registry.addProject({
      id: identity.id,
      name: identity.name,
      root: project.root,
      metadataPath: project.metadataPath,
    });
  }
  return registry.updateProject(project.id, {
    name: identity.name,
    root: project.root,
    metadataPath: project.metadataPath,
  });
}

function ensureDefaultRegisteredProject(options: ManagementApiOptions) {
  return getProjectRegistryForRequest(options).getRegistry();
}

function getActiveProjectContext(options: ManagementApiOptions): ProjectRequestContext | null {
  ensureDefaultRegisteredProject(options);
  const registry = getProjectRegistryForRequest(options);
  const project = registry.getActiveProject();
  if (!project) {
    return null;
  }
  const metadataStore = getAvailableMetadataStore(project);
  if (!metadataStore) {
    return null;
  }
  return {
    project,
    metadataStore,
    metadata: metadataStore.getMetadata(),
  };
}

function createStartupProjectContext(
  options: ManagementApiOptions,
  requestedProjectId = '',
): ProjectRequestContext | null {
  const startupProjectRoot = options.startupProjectRoot ? path.resolve(options.startupProjectRoot) : '';
  if (!startupProjectRoot) {
    return null;
  }
  const marker = readMakeClientMarker(startupProjectRoot);
  const metadataPath = getProjectMetadataPath(startupProjectRoot);
  if (!marker || !fs.existsSync(metadataPath)) {
    return null;
  }
  const identity = readProjectIdentity(startupProjectRoot, {
    metadataPath,
    fallback: marker.project,
  });
  if (requestedProjectId && requestedProjectId !== identity.id) {
    return null;
  }
  const metadataStore = createProjectMetadataStore(startupProjectRoot, { metadataPath });
  const timestamp = new Date().toISOString();
  const project: RegisteredProject = {
    id: identity.id,
    name: identity.name,
    root: startupProjectRoot,
    metadataPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    project,
    metadataStore,
    metadata: metadataStore.getMetadata(),
  };
}

function getRequestProjectContext(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  body?: unknown,
): ProjectRequestContext | null {
  return resolveProjectContext(req, res, options, 'active-fallback', body);
}

function createProjectContextFromBody(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  body: unknown,
): ProjectRequestContext | null {
  return resolveProjectContext(req, res, options, 'active-fallback', body);
}

function createProjectContextFromMultipartParts(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  parts: MultipartPart[],
): ProjectRequestContext | null {
  const projectId = getMultipartTextField(parts, 'projectId');
  return resolveProjectContext(req, res, options, 'active-fallback', projectId ? { projectId } : undefined);
}

function getRequestProjectId(url: URL, body?: unknown): string {
  const queryProjectId = String(url.searchParams.get('projectId') || '').trim();
  if (queryProjectId) {
    return queryProjectId;
  }
  if (body && typeof body === 'object') {
    const bodyProjectId = String((body as Record<string, unknown>).projectId || '').trim();
    if (bodyProjectId) {
      return bodyProjectId;
    }
  }
  return '';
}

function resolveProjectContext(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  mode: 'active-fallback' | 'explicit-required',
  body?: unknown,
): ProjectRequestContext | null {
  try {
    ensureDefaultRegisteredProject(options);
  } catch (error: any) {
    sendJson(res, {
      error: error?.message || 'Project metadata is invalid',
      code: 'PROJECT_METADATA_INVALID',
      projectRoot: options.projectRoot,
    }, { status: 400 });
    return null;
  }
  const url = getRequestUrl(req);
  const registry = getProjectRegistryForRequest(options);
  const requestedProjectId = getRequestProjectId(url, body);
  const project = requestedProjectId
    ? registry.getProject(requestedProjectId)
    : mode === 'active-fallback'
      ? registry.getActiveProject()
      : null;
  let startupContext: ProjectRequestContext | null = null;
  try {
    startupContext = !project && mode === 'active-fallback' && !fs.existsSync(registry.getRegistryPath())
      ? createStartupProjectContext(options, requestedProjectId)
      : null;
  } catch (error: any) {
    sendJson(res, {
      error: error?.message || 'Project metadata is invalid',
      code: 'PROJECT_METADATA_INVALID',
      projectRoot: options.startupProjectRoot,
    }, { status: 400 });
    return null;
  }
  if (startupContext) {
    return startupContext;
  }

  if (requestedProjectId && !project) {
    sendJson(res, {
      error: `Project not found: ${requestedProjectId}`,
      code: 'project-not-found',
      projectId: requestedProjectId,
    }, { status: 404 });
    return null;
  }

  if (!project) {
    sendJson(res, {
      error: 'No active project selected',
      code: 'no-active-project',
    }, { status: 409 });
    return null;
  }

  const metadataStore = getExistingMetadataStore(res, project);
  if (!metadataStore) {
    return null;
  }
  let metadata: ProjectMetadata;
  try {
    metadata = metadataStore.getMetadata();
  } catch (error: any) {
    sendJson(res, {
      error: error?.message || 'Project metadata is invalid',
      code: 'PROJECT_METADATA_INVALID',
      projectId: project.id,
      metadataPath: project.metadataPath,
    }, { status: 400 });
    return null;
  }

  return {
    project,
    metadataStore,
    metadata,
  };
}

function sendDisabledCapability(
  res: ServerResponse,
  status: number,
  payload: {
    code: string;
    error: string;
    projectId?: string;
    projectRoot?: string;
    resourceId?: string;
    path?: string;
    adapterRequired?: boolean;
    sourceRequired?: boolean;
    runtime?: Record<string, unknown>;
    details?: Record<string, unknown>;
  },
): void {
  sendJson(res, {
    ok: false,
    available: false,
    disabled: true,
    ...payload,
  }, { status });
}

function encodeRFC5987Value(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/gu, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function createAttachmentFileNameFallback(fileName: string): string {
  return fileName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/gu, '_')
    .replace(/["\\;%]/gu, '_')
    .replace(/\s+/gu, ' ')
    .trim() || 'download.fig';
}

function buildAttachmentContentDisposition(fileName: string): string {
  return `attachment; filename="${createAttachmentFileNameFallback(fileName)}"; filename*=UTF-8''${encodeRFC5987Value(fileName)}`;
}

function sendResourceWriteAdapterRequired(
  res: ServerResponse,
  context: ProjectRequestContext,
  route: string,
  details?: Record<string, unknown>,
): void {
  sendDisabledCapability(res, 424, {
    error: 'Resource write requires project-side save/write capability in make-server',
    code: 'RESOURCE_WRITE_ADAPTER_REQUIRED',
    projectId: context.project.id,
    projectRoot: context.project.root,
    adapterRequired: true,
    details: {
      route,
      reason: 'resource-layout-contract-deferred',
      ...details,
    },
  });
}

function createProjectMetadataMissingError(project: RegisteredProject): ProjectMetadataAvailabilityError {
  return {
    message: 'Project metadata not found',
    code: 'PROJECT_METADATA_MISSING',
    projectId: project.id,
    metadataPath: project.metadataPath,
  };
}

function createProjectMetadataInvalidError(project: RegisteredProject, error: unknown): ProjectMetadataAvailabilityError {
  return {
    message: error instanceof Error ? error.message : String(error || 'Project metadata is invalid'),
    code: 'PROJECT_METADATA_INVALID',
    projectId: project.id,
    metadataPath: project.metadataPath,
  };
}

function sendMissingProjectMetadata(res: ServerResponse, project: RegisteredProject): void {
  const error = createProjectMetadataMissingError(project);
  sendJson(res, {
    error: error.message,
    code: error.code,
    projectId: error.projectId,
    metadataPath: error.metadataPath,
  }, { status: 404 });
}

function readRepairableMakeClientMarker(projectRoot: string): ReturnType<typeof readMakeClientMarker> {
  try {
    return readMakeClientMarker(projectRoot);
  } catch {
    return null;
  }
}

function isProjectMetadataUnavailable(project: RegisteredProject): boolean {
  return !fs.existsSync(project.metadataPath) && !readRepairableMakeClientMarker(project.root);
}

function getProjectMetadataAvailabilityError(project: RegisteredProject): ProjectMetadataAvailabilityError | null {
  const metadataStore = getAvailableMetadataStore(project);
  if (!metadataStore) {
    return createProjectMetadataMissingError(project);
  }
  try {
    metadataStore.getMetadata();
  } catch (error) {
    return createProjectMetadataInvalidError(project, error);
  }
  return null;
}

function getAvailableMetadataStore(project: RegisteredProject): ReturnType<typeof createProjectMetadataStore> | null {
  if (!fs.existsSync(project.metadataPath)) {
    if (!readRepairableMakeClientMarker(project.root)) {
      return null;
    }
    syncProjectIdentitySource(project.root, {
      metadataPath: project.metadataPath,
      fallback: project,
    });
  }
  return createProjectMetadataStore(project.root, { metadataPath: project.metadataPath });
}

function getExistingMetadataStore(res: ServerResponse, project: RegisteredProject) {
  const metadataStore = getAvailableMetadataStore(project);
  if (!metadataStore) {
    sendMissingProjectMetadata(res, project);
    return null;
  }
  return metadataStore;
}

function readProjectConfig(projectRoot: string): any {
  const configPath = getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) {
    return { server: { host: 'localhost' } };
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { server: { host: 'localhost' } };
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getLocalProjectPickerPrompt(kind: string): string {
  if (kind === 'parent') {
    return '选择新建 Make 项目的所在位置';
  }
  return '选择 Axhub Make 客户端项目目录';
}

function selectLocalProjectRootForKind(kind: string): Promise<string | null> {
  return selectLocalDirectory({ prompt: getLocalProjectPickerPrompt(kind) });
}

function handleProjectApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions, pathname: string): boolean {
  return handleProjectRegistryApi(req, res, options, pathname, {
    getProjectRegistryForRequest,
    addOrUpdateRegistryProjectByRoot,
    toProjectEntry,
    toProjectIdentity,
    updateRegisteredProjectTitle,
    getStartupProjectContext: createStartupProjectContext,
    selectLocalProjectRootForKind,
    getExistingMetadataStore,
    createEffectiveProjectCapabilities,
  });
}

function getDocsDir(projectRoot: string): string {
  return path.join(projectRoot, 'src/resources');
}

function getTemplatesDir(projectRoot: string): string {
  return path.join(projectRoot, 'src/resources/templates');
}

function getDataDir(projectRoot: string): string {
  return path.join(projectRoot, 'src/resources/data');
}

function getStandardMakeClientPrototypeDir(context: ProjectRequestContext): string | null {
  if (!readMakeClientMarker(context.project.root)) {
    return null;
  }
  const prototypesDir = path.join(context.project.root, 'src/prototypes');
  return isPathInside(context.project.root, prototypesDir) ? prototypesDir : null;
}

function getDeclaredResourceWriteDir(
  context: ProjectRequestContext,
  type: 'docs' | 'templates' | 'themes' | 'data' | 'media' | 'prototypes',
): string | null {
  const target = context.metadata.resourceWriteTargets?.[type];
  if (!target || target.type !== 'project-relative-path' || !target.path) {
    return null;
  }
  try {
    return resolveProjectPath(context.project.root, target.path);
  } catch {
    return null;
  }
}

function getPrototypeCreateDir(context: ProjectRequestContext): string | null {
  return getDeclaredResourceWriteDir(context, 'prototypes') || getStandardMakeClientPrototypeDir(context);
}

function getDocsWriteDir(context: ProjectRequestContext): string | null {
  const docsDir = getDocsDir(context.project.root);
  return isPathInside(context.project.root, docsDir) ? docsDir : null;
}

function getDocsDirForContext(context: ProjectRequestContext): string {
  return getDocsWriteDir(context) || getDocsDir(context.project.root);
}

function getTemplatesDirForContext(context: ProjectRequestContext): string {
  return getTemplatesDir(context.project.root);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function ensureMarkdownExtension(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
}

function resolvePathInside(baseDir: string, requestedPath: string): string | null {
  const normalized = String(requestedPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const targetPath = path.resolve(baseDir, normalized);
  return isPathInside(baseDir, targetPath) ? targetPath : null;
}

function resolveLegacySpecDocPath(context: ProjectRequestContext, docUrl: string): string {
  const rawDocUrl = String(docUrl || '').trim();
  if (!rawDocUrl) {
    throw new Error('Missing docUrl');
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(rawDocUrl, 'http://localhost');
  } catch {
    parsed = null;
  }

  const pathname = parsed?.pathname || rawDocUrl;

  if (parsed?.pathname === '/api/markdown-file') {
    return resolveProjectPath(context.project.root, parsed.searchParams.get('path') || '');
  }

  if (parsed?.pathname.startsWith('/api/git/version-file/')) {
    throw new Error('Version document snapshots are read-only');
  }

  const resolveDocsPath = (
    basePath: string,
    baseDir: string,
  ): string | null => {
    if (!pathname.startsWith(basePath)) return null;
    const decodedName = ensureMarkdownExtension(safeDecodeURIComponent(pathname.slice(basePath.length)));
    if (!decodedName) return null;
    return resolvePathInside(baseDir, decodedName);
  };

  const templatePath = resolveDocsPath('/api/docs/templates/', getTemplatesDirForContext(context))
    || resolveDocsPath('/docs/templates/', getTemplatesDirForContext(context));
  if (templatePath) return templatePath;

  const docPath = resolveDocsPath('/api/docs/', getDocsDirForContext(context))
    || resolveDocsPath('/docs/', getDocsDirForContext(context));
  if (docPath) return docPath;

  return resolveProjectPath(context.project.root, ensureMarkdownExtension(rawDocUrl));
}

function normalizeMarkdownAssetPath(value: string): string | null {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || raw.includes('\0')) {
    return null;
  }
  const segments = raw.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return null;
  }
  return segments.join('/');
}

function resolveMarkdownFileAssetPath(context: ProjectRequestContext, markdownPath: string, assetPath: string): string | null {
  const docPath = resolveProjectPath(context.project.root, markdownPath);
  const normalizedAssetPath = normalizeMarkdownAssetPath(assetPath);
  if (!normalizedAssetPath) {
    return null;
  }
  const docDir = path.dirname(docPath);
  const targetPath = path.resolve(docDir, normalizedAssetPath);
  return isPathInside(docDir, targetPath) ? targetPath : null;
}

function hasResourceWriteCapability(context: ProjectRequestContext, capability: keyof ProjectMetadata['capabilities']['resourceWrites']): boolean {
  return createEffectiveProjectCapabilities(context).resourceWrites[capability] === true;
}

function normalizeResourceIdFromFileName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName));
}

function prependUnique(values: string[], value: string): string[] {
  return [value, ...values.filter((item) => item !== value)];
}

function createProjectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function saveMetadataWithResourceOrder(context: ProjectRequestContext, metadata: ProjectMetadata): ProjectMetadata {
  const saved = context.metadataStore.saveMetadata(metadata);
  context.metadata = saved;
  return saved;
}

function updatePrototypeMetadataAfterUpload(
  context: ProjectRequestContext,
  params: {
    id: string;
    title: string;
    folderPath: string;
    indexPath: string;
    clientUrl: string;
  },
): void {
  const current = context.metadataStore.getMetadata();
  const filePath = createProjectRelativePath(context.project.root, params.indexPath);
  saveMetadataWithResourceOrder(context, {
    ...current,
    resources: {
      ...current.resources,
      prototypes: [
        {
          id: params.id,
          name: params.id,
          title: params.title,
          clientUrl: params.clientUrl,
          previewMode: 'clientRuntime',
          description: '',
          updatedAt: new Date().toISOString(),
          filePath,
          absoluteFilePath: params.indexPath,
        },
        ...current.resources.prototypes.filter((prototype) => prototype.id !== params.id && prototype.name !== params.id),
      ],
    },
    navigation: {
      ...current.navigation,
      prototypes: prependUnique(current.navigation.prototypes, params.id),
    },
  });
}

function updateGenericResourceMetadata(
  context: ProjectRequestContext,
  type: 'templates' | 'data' | 'themes',
  previousKey: string,
  nextResource: Record<string, unknown>,
  previousOrderKey: string,
  nextOrderKey: string,
): void {
  const current = context.metadataStore.getMetadata();
  const resources = current.resources[type];
  const orders = current.orders[type];
  saveMetadataWithResourceOrder(context, {
    ...current,
    resources: {
      ...current.resources,
      [type]: resources.map((resource) => (
        resource.id === previousKey || resource.name === previousKey
          ? { ...resource, ...nextResource }
          : resource
      )),
    },
    orders: {
      ...current.orders,
      [type]: orders.map((key) => (key === previousOrderKey ? nextOrderKey : key)),
    },
  });
}

function removeGenericResourceMetadata(
  context: ProjectRequestContext,
  type: 'templates' | 'data' | 'themes',
  key: string,
): void {
  const current = context.metadataStore.getMetadata();
  saveMetadataWithResourceOrder(context, {
    ...current,
    resources: {
      ...current.resources,
      [type]: current.resources[type].filter((resource) => resource.id !== key && resource.name !== key),
    },
    orders: {
      ...current.orders,
      [type]: current.orders[type].filter((orderKey) => orderKey !== key),
    },
  });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function createUnavailableProjectEntry(project: RegisteredProject) {
  const availabilityError = getProjectMetadataAvailabilityError(project) || createProjectMetadataMissingError(project);
  return {
    ...createProjectEntryBase(project),
    unavailable: true,
    error: availabilityError,
  };
}

function createAdminContextPayload(options: ManagementApiOptions) {
  const registry = getProjectRegistryForRequest(options).getRegistry();
  const activeRegistryProject = registry.projects.find((project) => project.id === registry.activeProjectId) ?? null;
  const availabilityErrors = new Map<string, ProjectMetadataAvailabilityError | null>();
  const getAvailabilityError = (project: RegisteredProject) => {
    if (!availabilityErrors.has(project.id)) {
      availabilityErrors.set(project.id, getProjectMetadataAvailabilityError(project));
    }
    return availabilityErrors.get(project.id) ?? null;
  };
  const activeProjectAvailabilityError = activeRegistryProject ? getAvailabilityError(activeRegistryProject) : null;
  const activeProjectContext = activeProjectAvailabilityError ? null : getActiveProjectContext(options);
  const activeProject = activeProjectContext?.project
    ?? activeRegistryProject
    ?? null;
  const runtime = activeProjectContext ? readServerInfo(activeProjectContext.project.root, 'runtime') : null;

  return {
    projectRoot: options.projectRoot,
    activeProject: activeProjectAvailabilityError && activeProject
      ? createUnavailableProjectEntry(activeProject)
      : activeProjectContext?.project ?? null,
    projects: registry.projects.map((project) => (
      getAvailabilityError(project) ? createUnavailableProjectEntry(project) : toProjectEntry(project)
    )),
    capabilities: activeProjectContext ? createEffectiveProjectCapabilities(activeProjectContext) : {},
    admin: {
      origin: options.origin,
      infoPath: getGlobalAdminServerInfoPath(options.serverInfoHomeDir),
    },
    makeState: options.makeStateHealth,
    runtime: runtime
      ? { available: true, ...runtime }
      : { available: false },
  };
}

function createEmptyProjectResources(): ProjectMetadata['resources'] {
  return {
    prototypes: [],
    themes: [],
  };
}

function createEmptyResourceOrders(): ProjectMetadata['orders'] {
  return {
    themes: [],
  };
}

function createUnavailableProjectCapabilities(project: RegisteredProject): EffectiveProjectCapabilities {
  return {
    quickEdit: false,
    quickEditMode: 'clientRuntime',
    figmaExport: false,
    axureExport: false,
    lanAccessAllowed: true,
    localExports: {
      html: false,
      make: false,
    },
    resourceWrites: {
      prototypeCreate: false,
      prototypeUpload: false,
      docCreate: false,
      docImport: false,
      themeCreate: false,
      themeImport: false,
      dataCreate: false,
      dataImport: false,
      templateCreate: false,
      templateDuplicate: false,
    },
  };
}

function createUnavailableProjectResourcesPayload(
  project: RegisteredProject,
  error: ProjectMetadataAvailabilityError,
) {
  return {
    unavailable: true,
    error,
    project: {
      id: project.id,
      name: project.name,
    },
    resources: createEmptyProjectResources(),
    navigation: {
      prototypes: [],
    },
    orders: createEmptyResourceOrders(),
    capabilities: createUnavailableProjectCapabilities(project),
  };
}

function resolveUnavailableStartupProject(
  options: ManagementApiOptions,
  projectId?: string,
): { project: RegisteredProject; error: ProjectMetadataAvailabilityError } | null {
  try {
    ensureDefaultRegisteredProject(options);
  } catch {
    return null;
  }

  const registry = getProjectRegistryForRequest(options);
  const project = projectId ? registry.getProject(projectId) : registry.getActiveProject();
  if (!project) {
    return null;
  }

  const availabilityError = getProjectMetadataAvailabilityError(project);
  if (availabilityError?.code !== 'PROJECT_METADATA_MISSING') {
    return null;
  }

  return { project, error: availabilityError };
}

function isStartupConfigGetRoute(pathname: string): boolean {
  return pathname === '/api/config'
    || pathname === '/api/config/bootstrap'
    || pathname === '/api/config/availability'
    || pathname === '/api/config/ai-image/codex-local';
}

function isStartupSidebarTreeTab(value: string): boolean {
  return value === 'prototypes'
    || value === 'components'
    || value === 'docs'
    || value === 'canvas'
    || value === 'themes';
}

function isStartupResourceOrderType(value: string): boolean {
  return value === 'themes' || value === 'data' || value === 'templates';
}

function handleUnavailableProjectStartupApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  url: URL,
): boolean {
  const projectResourcesMatch = pathname.match(/^\/api\/projects\/([^/]+)\/resources$/u);
  if (projectResourcesMatch && req.method === 'GET') {
    const projectId = decodeURIComponent(projectResourcesMatch[1]);
    const startupProject = resolveUnavailableStartupProject(options, projectId);
    if (!startupProject) {
      return false;
    }
    sendJson(res, createUnavailableProjectResourcesPayload(startupProject.project, startupProject.error));
    return true;
  }

  if (req.method !== 'GET') {
    return false;
  }

  const startupProject = resolveUnavailableStartupProject(options, getRequestProjectId(url));
  if (!startupProject) {
    return false;
  }
  const { project } = startupProject;

  if (isStartupConfigGetRoute(pathname)) {
    return handleConfigApi(req, res, options, pathname, { project }, {
      readProjectConfig,
      getServerConfigStoreForRequest,
      stringValue,
      toProjectIdentity,
      updateRegisteredProjectTitle,
    });
  }

  if (pathname === '/api/assistant/runtime') {
    const serverConfigStore = getServerConfigStoreForRequest(options);
    const config = serverConfigStore.getConfig({ activeProjectRoot: project.root });
    resolveAssistantRuntime({
      projectPath: project.root,
      assistantConfig: config.assistant,
      autoStart: url.searchParams.get('autoStart') === 'true',
      makeOrigin: url.origin,
      onRuntimeConfigResolved: (assistant) => {
        serverConfigStore.saveConfig({ assistant });
      },
    }).then((runtime) => {
      sendJson(res, createAssistantRuntimeResponse({
        runtime,
        projectId: project.id,
        projectRoot: project.root,
        req,
      }));
    }).catch((error: any) => {
      sendJson(res, {
        error: error?.message || 'Failed to resolve assistant runtime',
        code: 'ASSISTANT_RUNTIME_RESOLVE_FAILED',
        projectId: project.id,
        projectRoot: project.root,
      }, { status: 500 });
    });
    return true;
  }

  if (pathname === '/api/cloud-publishing/latest') {
    return handleCloudPublishingApi(req, res, options, pathname, {
      resolveProjectContext: () => ({ project }),
      resolveSourceFileFromMetadata,
      findProjectResourceByPath,
      getServerConfigStoreForRequest,
      commandExecutor: options.cloudPublishingCommandExecutor,
      sendDisabledCapability,
    });
  }

  if (pathname === '/api/entries.json') {
    sendJson(res, { components: [], prototypes: [] });
    return true;
  }

  if (pathname === '/api/workspace/project') {
    sendJson(res, { title: project.name });
    return true;
  }

  if (pathname === '/api/workspace/navigation') {
    const tab = String(url.searchParams.get('tab') || '').trim();
    if (!isStartupSidebarTreeTab(tab)) {
      sendJson(res, { error: 'Invalid tab, expected prototypes|components|docs|canvas|themes' }, { status: 400 });
      return true;
    }
    sendJson(res, { tab, version: SIDEBAR_TREE_VERSION, tree: [] });
    return true;
  }

  if (pathname === '/api/docs' || pathname === '/api/docs/') {
    sendJson(res, []);
    return true;
  }

  if (pathname === '/api/themes' || pathname === '/api/themes/') {
    sendJson(res, []);
    return true;
  }

  if (pathname === '/api/workspace/resources/order') {
    const type = String(url.searchParams.get('type') || '').trim();
    if (!isStartupResourceOrderType(type)) {
      sendJson(res, { error: 'Invalid type, expected themes|data|templates' }, { status: 400 });
      return true;
    }
    sendJson(res, { type, version: SIDEBAR_TREE_VERSION, order: [] });
    return true;
  }

  return false;
}

export async function handleManagementApi(req: IncomingMessage, res: ServerResponse, options: ManagementApiOptions): Promise<boolean> {
  const url = getRequestUrl(req);
  const pathname = url.pathname;
  const { projectRoot } = options;

  if (pathname === '/api/health') {
    sendJson(res, {
      ok: true,
      role: 'admin',
      projectRoot,
      origin: options.origin,
      runtimeOrigin: options.runtimeOrigin || null,
      devMode: options.devMode === true,
      capabilities: {
        reviewReports: true,
      },
      server: options.serverInfo || readServerInfo(projectRoot, 'admin', { homeDir: options.serverInfoHomeDir }),
      makeState: options.makeStateHealth,
    });
    return true;
  }

  if (pathname === '/api/make-state/health') {
    sendJson(res, options.refreshMakeStateHealth ? options.refreshMakeStateHealth() : options.makeStateHealth);
    return true;
  }

  if (pathname === '/api/version') {
    const activeProject = getProjectRegistryForRequest(options).getActiveProject();
    sendJson(res, { version: readMakeServerVersion(), projectId: activeProject?.id ?? null });
    return true;
  }

  if (handleQuickEditRuntimeApi(req, res, pathname)) {
    return true;
  }

  if (handleUnavailableProjectStartupApi(req, res, options, pathname, url)) {
    return true;
  }

  if (handlePrototypeSpecApi(req, res, options, pathname, {
    resolveProjectContext,
  })) {
    return true;
  }

  if (handleProjectApi(req, res, options, pathname)) {
    return true;
  }

  if (handleLegacyDocsApi(req, res, options, null, pathname, url, {
    getActiveProjectContext,
  })) {
    return true;
  }

  if (handleBridgeAndImageProxy(req, res, pathname, url)) {
    return true;
  }

  if (handleAxhubApi(req, res, options, pathname, {
    resolveProjectContext,
    resolveSourceFileFromMetadata,
    findProjectResourceByPath,
    getDeclaredResourceWriteDir: getDeclaredResourceWriteDir as any,
    readProjectConfig,
    sendDisabledCapability,
  })) {
    return true;
  }

  if (handleLegacyWebSocketApi(req, res, options, pathname, {
    readRawRequestBody,
  })) {
    return true;
  }

  if (handleAssistantPromptIde(req, res, options, pathname, {
    resolveProjectContext,
    getServerConfigStoreForRequest,
    sendDisabledCapability,
  })) {
    return true;
  }

  if (handleAiRunsApi(req, res, options, pathname, {
    resolveProjectContext,
    getServerConfigStoreForRequest,
  })) {
    return true;
  }

  if (handleGitApi(req, res, options, pathname, url, {
    resolveProjectContext,
    findProjectResourceByPath,
    commandExecutor: options.gitWorkspaceCommandExecutor,
  })) {
    return true;
  }

  if (await handleSourceBackedExports(req, res, options, pathname, url, {
    resolveProjectContext,
    resolveSourceFileFromMetadata,
    getAxureArtifactPaths,
    readJsonFile,
    getDeclaredResourceWriteDir: getDeclaredResourceWriteDir as any,
    sendDisabledCapability,
    buildAttachmentContentDisposition,
  })) {
    return true;
  }

  if (handleUploadAndReferenceApis(req, res, options, pathname, {
    resolveProjectContext,
    readMultipartParts,
    resolveMarkdownFileAssetPath,
    resolveLegacySpecDocPath,
    getDeclaredResourceWriteDir,
    sendResourceWriteAdapterRequired,
    encodeUrlPathSegments,
  })) {
    return true;
  }

  if (handleAxhubReviewReportsApi(req, res, options, pathname, url, {
    resolveProjectContext,
    createProjectContextFromBody,
  })) {
    return true;
  }

  if (handleReviewReportsApi(req, res, options, pathname, url, {
    resolveProjectContext,
    createProjectContextFromBody,
    createProjectContextFromMultipartParts,
    readMultipartParts,
    readProjectConfig,
  })) {
    return true;
  }

  if (pathname === '/api/admin/context') {
    try {
      ensureDefaultRegisteredProject(options);
    } catch (error: any) {
      sendJson(res, {
        error: error?.message || 'Project metadata is invalid',
        code: 'PROJECT_METADATA_INVALID',
        projectRoot: options.projectRoot,
      }, { status: 400 });
      return true;
    }
    const registry = getProjectRegistryForRequest(options).getRegistry();
    if (!registry.activeProjectId) {
      sendJson(res, {
        error: 'No active project selected',
        code: 'no-active-project',
      }, { status: 409 });
      return true;
    }
    sendJson(res, createAdminContextPayload(options));
    return true;
  }

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  if (pathname === '/api/docs/upload' && handleProjectDocsApi(req, res, null, options, pathname, {
    createProjectContextFromBody,
    getDeclaredResourceWriteDir,
    hasResourceWriteCapability,
    sendResourceWriteAdapterRequired,
    createProjectRelativePath,
  })) return true;

  const requestContext = getRequestProjectContext(req, res, options);
  if (!requestContext) {
    return true;
  }
  const activeProjectRoot = requestContext.project.root;
  const activeProjectContextForBridge = getActiveProjectContext(options);
  if (activeProjectContextForBridge) {
    getCanvasBridgeHub().configureProjectRoot(activeProjectContextForBridge.project.root);
  }

  if (await handleHtmlResourceEditingApi(req, res, activeProjectRoot, pathname)) return true;
  if (await handleHtmlReviewArtifactsApi(req, res, activeProjectRoot, pathname)) return true;

  if (handleLegacyDocsApi(req, res, options, activeProjectRoot, pathname, url, {
    getActiveProjectContext,
  })) return true;

  if (handleEntriesCompatibilityApi(req, res, options, pathname, {
    getActiveProjectContext,
  })) return true;

  if (handleCodeReviewApi(req, res, requestContext, pathname, {
    resolveSourceFileFromMetadata,
    findProjectResourceByPath,
    sendDisabledCapability,
  })) return true;

  if (handleConfigApi(req, res, options, pathname, requestContext, {
    readProjectConfig,
    getServerConfigStoreForRequest,
    stringValue,
    toProjectIdentity,
    updateRegisteredProjectTitle,
  })) return true;

  if (handleAiRunsApi(req, res, options, pathname, {
    resolveProjectContext,
    getServerConfigStoreForRequest,
  })) return true;

  if (handleAiArtifactHistoryApi(req, res, requestContext, pathname)) return true;

  if (handleCloudPublishingApi(req, res, options, pathname, {
    resolveProjectContext,
    resolveSourceFileFromMetadata,
    findProjectResourceByPath,
    getDeclaredResourceWriteDir: getDeclaredResourceWriteDir as any,
    getServerConfigStoreForRequest,
    commandExecutor: options.cloudPublishingCommandExecutor,
    sendDisabledCapability,
  })) return true;

  if (handleProjectDocsApi(req, res, requestContext, options, pathname, {
    createProjectContextFromBody,
    getDeclaredResourceWriteDir,
    hasResourceWriteCapability,
    sendResourceWriteAdapterRequired,
    createProjectRelativePath,
  })) return true;
  if (handleProjectDataAndThemeApi(req, res, requestContext, options, pathname, {
    createProjectContextFromBody,
    getDeclaredResourceWriteDir,
    hasResourceWriteCapability,
    sendResourceWriteAdapterRequired,
    saveMetadataWithResourceOrder,
    prependUnique,
    createProjectRelativePath,
    updateGenericResourceMetadata,
    removeGenericResourceMetadata,
    stringValue,
    readJsonFile,
  })) return true;
  if (pathname === '/api/prototypes/create-placeholder' && req.method === 'POST') {
    void handleCreatePlaceholderPrototype(req, res, options, requestContext, {
      getDeclaredResourceWriteDir: ((context, type) => (
        type === 'prototypes' ? getPrototypeCreateDir(context) : getDeclaredResourceWriteDir(context, type)
      )) as any,
      hasResourceWriteCapability: hasResourceWriteCapability as any,
      sendDisabledCapability,
      readMultipartParts: readMultipartParts as any,
      createProjectContextFromMultipartParts: createProjectContextFromMultipartParts as any,
    });
    return true;
  }
  const startPrototypeGenerationMatch = pathname.match(/^\/api\/prototypes\/([^/]+)\/start-generation$/u);
  if (startPrototypeGenerationMatch && req.method === 'POST') {
    void handleStartPlaceholderPrototypeGeneration(
      req,
      res,
      options,
      requestContext,
      safeDecodeURIComponent(startPrototypeGenerationMatch[1] || ''),
      {
        getDeclaredResourceWriteDir: ((context, type) => (
          type === 'prototypes' ? getPrototypeCreateDir(context) : getDeclaredResourceWriteDir(context, type)
        )) as any,
        hasResourceWriteCapability: hasResourceWriteCapability as any,
        sendDisabledCapability,
        readMultipartParts: readMultipartParts as any,
        createProjectContextFromMultipartParts: createProjectContextFromMultipartParts as any,
      },
    );
    return true;
  }
  if (handlePrototypeUploadApi(req, res, options, pathname, {
    readMultipartParts,
    createProjectContextFromMultipartParts,
    getDeclaredResourceWriteDir,
    hasResourceWriteCapability,
    sendDisabledCapability,
  })) return true;
  if (handleTemplateLibraryApi(req, res, options, pathname, {
    createProjectContextFromBody,
    getDeclaredResourceWriteDir: getDeclaredResourceWriteDir as any,
    hasResourceWriteCapability: hasResourceWriteCapability as any,
    sendDisabledCapability,
  })) return true;
  if (handleThemeLibraryApi(req, res, options, pathname, {
    createProjectContextFromBody,
    getDeclaredResourceWriteDir: getDeclaredResourceWriteDir as any,
    hasResourceWriteCapability: hasResourceWriteCapability as any,
    sendDisabledCapability,
  })) return true;
  if (handleCanvasApi(req, res, activeProjectRoot, pathname, { metadata: requestContext.metadata })) return true;
  if (handlePrototypeAnnotationApi(req, res, requestContext, url)) return true;
  if (handlePrototypeCommentsApi(req, res, requestContext, url)) return true;
  if (handleMediaApi(req, res, activeProjectRoot, { mediaRoot: getDeclaredResourceWriteDir(requestContext, 'media') || undefined })) return true;
  if (handleWorkspaceApi(req, res, options, requestContext, pathname, url, {
    toProjectIdentity,
    updateRegisteredProjectTitle,
    getTemplatesDir,
  })) return true;
  if (handleFileOperationsApi(req, res, activeProjectRoot, pathname, requestContext.metadataStore)) return true;
  if (handleProjectSourceAndZipApi(req, res, options, requestContext, pathname, url, {
    resolveProjectContext,
    findProjectResourceByPath,
    resolveSourceFileFromMetadata,
    sendDisabledCapability,
  })) return true;
  if (handleUnavailableManagement(req, res, pathname, sendDisabledCapability)) return true;

  if (pathname.startsWith('/api/')) {
    sendText(res, JSON.stringify({ error: 'Not found' }), 'application/json; charset=utf-8', 404);
    return true;
  }

  return false;
}
