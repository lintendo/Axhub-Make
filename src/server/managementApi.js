import fs from 'node:fs';
import path from 'node:path';
import { createProjectMetadataStore, createProjectRegistry, createServerConfigStore, getConfigPath, getGlobalAdminServerInfoPath, getProjectMetadataPath, isPathInside, readMakeClientMarker, readServerInfo, resolveProjectPath, } from './projectCore/index.ts';
import { readProjectIdentity, syncProjectIdentitySource, updateProjectIdentityName, } from './projectIdentity.ts';
import { allocateRegisteredProjectId, findRegisteredProjectByRoot, } from './projectRegistration.ts';
import { getRequestUrl, readJsonBody, sendJson, sendText, } from './http.ts';
import { handleAiArtifactHistoryApi } from './managementApi.aiArtifactHistory.ts';
import { handleAiRunsApi } from './managementApi.aiRuns.ts';
import { handleAcpRuntimeEventsApi } from './managementApi.acpRuntimeEvents.ts';
import { handleAxhubApi } from './managementApi.axhub.ts';
import { handleAssistantPromptIde } from './managementApi.assistantIde.ts';
import { handleBridgeAndImageProxy } from './managementApi.bridge.ts';
import { handleCanvasApi } from './managementApi.canvas.ts';
import { handleCodeReviewApi } from './managementApi.codeReview.ts';
import { handleCloudPublishingApi } from './managementApi.cloudPublishing.ts';
import { handleConfigApi, readMakeServerVersion } from './managementApi.config.ts';
import { handleProjectDataAndThemeApi } from './managementApi.dataTheme.ts';
import { handleProjectDocsApi } from './managementApi.docs.ts';
import { handleEntriesCompatibilityApi } from './managementApi.entries.ts';
import { handleSourceBackedExports, handleUnavailableManagement } from './managementApi.exports.ts';
import { handleFileOperationsApi } from './managementApi.fileOperations.ts';
import { handleGitApi } from './managementApi.git.ts';
import { handleLegacyDocsApi } from './managementApi.legacyDocs.ts';
import { handleLegacyWebSocketApi } from './managementApi.legacyWebSocket.ts';
import { handleProjectRegistryApi } from './managementApi.projectRegistry.ts';
import { handleAxhubReviewReportsApi } from './managementApi.axhubReviewReports.ts';
import { handleReviewReportsApi } from './managementApi.reviewReports.ts';
import { handlePrototypeAnnotationApi } from './managementApi.prototypeAnnotation.ts';
import { handlePrototypeCommentsApi } from './managementApi.prototypeComments.ts';
import { handleDocumentCommentsApi } from './managementApi.documentComments.ts';
import { handlePrototypeSpecApi } from './managementApi.prototypeSpec.ts';
import { handleCreatePlaceholderPrototype, handlePrototypeUploadApi, handleStartPlaceholderPrototypeGeneration, } from './managementApi.prototypeUpload.ts';
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
import { createAssistantRuntimeResponse, resolveAssistantRuntime, } from './assistantRuntime.ts';
function createEffectiveProjectCapabilities(context) {
    const capabilities = context.metadata.capabilities;
    const hasTarget = (type) => (Boolean(getDeclaredResourceWriteDir(context, type)));
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
function encodeUrlPathSegments(value) {
    return value
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}
function readRawRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
async function readMultipartParts(req) {
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
        .map((rawPart) => {
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
        .filter((part) => Boolean(part));
}
function getMultipartTextField(parts, name) {
    return parts.find((part) => part.name === name && !part.filename)?.data.toString('utf8').trim() || '';
}
function getMultipartTextFields(parts, name) {
    return parts
        .filter((part) => part.name === name && !part.filename)
        .map((part) => part.data.toString('utf8').trim());
}
function createProjectEntryBase(project) {
    const identity = readProjectIdentity(project.root, {
        metadataPath: project.metadataPath,
        fallback: project,
    });
    return {
        ...project,
        name: identity.name,
    };
}
function toProjectEntry(project) {
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
function toProjectIdentity(project) {
    const identity = readProjectIdentity(project.root, {
        metadataPath: project.metadataPath,
        fallback: project,
    });
    return {
        id: project.id,
        name: identity.name,
    };
}
function getProjectRegistryForRequest(options) {
    return createProjectRegistry(options.registryPath ? { registryPath: options.registryPath } : undefined);
}
function addOrUpdateRegistryProjectByRoot(registry, params) {
    const root = path.resolve(params.root);
    const existingByRoot = findRegisteredProjectByRoot(registry.listProjects(), root);
    if (existingByRoot) {
        const error = new Error(`Project path already registered: ${root}`);
        error.code = 'MAKE_PROJECT_PATH_CONFLICT';
        error.status = 409;
        throw error;
    }
    const projectId = allocateRegisteredProjectId(params.id, (candidate) => Boolean(registry.getProject(candidate)));
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
function getServerConfigStoreForRequest(options) {
    const registryPath = options.registryPath;
    const homeDir = registryPath ? path.dirname(path.dirname(path.dirname(registryPath))) : undefined;
    return createServerConfigStore(homeDir ? { homeDir } : undefined);
}
function updateRegisteredProjectTitle(options, project, title) {
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
function ensureDefaultRegisteredProject(options) {
    return getProjectRegistryForRequest(options).getRegistry();
}
function getActiveProjectContext(options) {
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
function createStartupProjectContext(options, requestedProjectId = '') {
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
    const project = {
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
function getRequestProjectContext(req, res, options, body) {
    return resolveProjectContext(req, res, options, 'explicit-required', body);
}
function createProjectContextFromBody(req, res, options, body) {
    return resolveProjectContext(req, res, options, 'explicit-required', body);
}
function createProjectContextFromMultipartParts(req, res, options, parts) {
    const projectId = getMultipartTextField(parts, 'projectId');
    return resolveProjectContext(req, res, options, 'explicit-required', projectId ? { projectId } : undefined);
}
function getRequestProjectId(url, body) {
    const queryProjectId = String(url.searchParams.get('projectId') || '').trim();
    if (queryProjectId) {
        return queryProjectId;
    }
    if (body && typeof body === 'object') {
        const bodyProjectId = String(body.projectId || '').trim();
        if (bodyProjectId) {
            return bodyProjectId;
        }
    }
    return '';
}
function resolveProjectContext(req, res, options, _mode, body) {
    try {
        ensureDefaultRegisteredProject(options);
    }
    catch (error) {
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
    if (!requestedProjectId) {
        sendJson(res, {
            ok: false,
            code: 'PROJECT_ID_REQUIRED',
            error: 'Project-scoped API requires projectId',
        }, { status: 400 });
        return null;
    }
    const project = registry.getProject(requestedProjectId);
    let startupContext = null;
    try {
        startupContext = !project
            ? createStartupProjectContext(options, requestedProjectId)
            : null;
    }
    catch (error) {
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
    let metadata;
    try {
        metadata = metadataStore.getMetadata();
    }
    catch (error) {
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
function sendDisabledCapability(res, status, payload) {
    sendJson(res, {
        ok: false,
        available: false,
        disabled: true,
        ...payload,
    }, { status });
}
function encodeRFC5987Value(value) {
    return encodeURIComponent(value).replace(/['()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
function createAttachmentFileNameFallback(fileName) {
    return fileName
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]+/gu, '_')
        .replace(/["\\;%]/gu, '_')
        .replace(/\s+/gu, ' ')
        .trim() || 'download.fig';
}
function buildAttachmentContentDisposition(fileName) {
    return `attachment; filename="${createAttachmentFileNameFallback(fileName)}"; filename*=UTF-8''${encodeRFC5987Value(fileName)}`;
}
function sendResourceWriteAdapterRequired(res, context, route, details) {
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
function createProjectMetadataMissingError(project) {
    return {
        message: 'Project metadata not found',
        code: 'PROJECT_METADATA_MISSING',
        projectId: project.id,
        metadataPath: project.metadataPath,
    };
}
function createProjectMetadataInvalidError(project, error) {
    return {
        message: error instanceof Error ? error.message : String(error || 'Project metadata is invalid'),
        code: 'PROJECT_METADATA_INVALID',
        projectId: project.id,
        metadataPath: project.metadataPath,
    };
}
function sendMissingProjectMetadata(res, project) {
    const error = createProjectMetadataMissingError(project);
    sendJson(res, {
        error: error.message,
        code: error.code,
        projectId: error.projectId,
        metadataPath: error.metadataPath,
    }, { status: 404 });
}
function readRepairableMakeClientMarker(projectRoot) {
    try {
        return readMakeClientMarker(projectRoot);
    }
    catch {
        return null;
    }
}
function isProjectMetadataUnavailable(project) {
    return !fs.existsSync(project.metadataPath) && !readRepairableMakeClientMarker(project.root);
}
function getProjectMetadataAvailabilityError(project) {
    const metadataStore = getAvailableMetadataStore(project);
    if (!metadataStore) {
        return createProjectMetadataMissingError(project);
    }
    try {
        metadataStore.getMetadata();
    }
    catch (error) {
        return createProjectMetadataInvalidError(project, error);
    }
    return null;
}
function getAvailableMetadataStore(project) {
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
function getExistingMetadataStore(res, project) {
    const metadataStore = getAvailableMetadataStore(project);
    if (!metadataStore) {
        sendMissingProjectMetadata(res, project);
        return null;
    }
    return metadataStore;
}
function readProjectConfig(projectRoot) {
    const configPath = getConfigPath(projectRoot);
    if (!fs.existsSync(configPath)) {
        return { server: { host: 'localhost' } };
    }
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    catch {
        return { server: { host: 'localhost' } };
    }
}
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function getLocalProjectPickerPrompt(kind) {
    if (kind === 'parent') {
        return '选择新建 Make 项目的所在位置';
    }
    return '选择 Axhub Make 客户端项目目录';
}
function selectLocalProjectRootForKind(kind) {
    return selectLocalDirectory({ prompt: getLocalProjectPickerPrompt(kind) });
}
function handleProjectApi(req, res, options, pathname) {
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
function getDocsDir(projectRoot) {
    return path.join(projectRoot, 'src/resources');
}
function getTemplatesDir(projectRoot) {
    return path.join(projectRoot, 'src/resources/templates');
}
function getDataDir(projectRoot) {
    return path.join(projectRoot, 'src/resources/data');
}
function getStandardMakeClientPrototypeDir(context) {
    if (!readMakeClientMarker(context.project.root)) {
        return null;
    }
    const prototypesDir = path.join(context.project.root, 'src/prototypes');
    return isPathInside(context.project.root, prototypesDir) ? prototypesDir : null;
}
function getDeclaredResourceWriteDir(context, type) {
    const target = context.metadata.resourceWriteTargets?.[type];
    if (!target || target.type !== 'project-relative-path' || !target.path) {
        return null;
    }
    try {
        return resolveProjectPath(context.project.root, target.path);
    }
    catch {
        return null;
    }
}
function getPrototypeCreateDir(context) {
    return getDeclaredResourceWriteDir(context, 'prototypes') || getStandardMakeClientPrototypeDir(context);
}
function getDocsWriteDir(context) {
    const docsDir = getDocsDir(context.project.root);
    return isPathInside(context.project.root, docsDir) ? docsDir : null;
}
function getDocsDirForContext(context) {
    return getDocsWriteDir(context) || getDocsDir(context.project.root);
}
function getTemplatesDirForContext(context) {
    return getTemplatesDir(context.project.root);
}
function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
function ensureMarkdownExtension(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed)
        return '';
    return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
}
function resolvePathInside(baseDir, requestedPath) {
    const normalized = String(requestedPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const targetPath = path.resolve(baseDir, normalized);
    return isPathInside(baseDir, targetPath) ? targetPath : null;
}
function resolveLegacySpecDocPath(context, docUrl) {
    const rawDocUrl = String(docUrl || '').trim();
    if (!rawDocUrl) {
        throw new Error('Missing docUrl');
    }
    let parsed = null;
    try {
        parsed = new URL(rawDocUrl, 'http://localhost');
    }
    catch {
        parsed = null;
    }
    const pathname = parsed?.pathname || rawDocUrl;
    if (parsed?.pathname === '/api/markdown-file') {
        return resolveProjectPath(context.project.root, parsed.searchParams.get('path') || '');
    }
    if (parsed?.pathname.startsWith('/api/git/version-file/')) {
        throw new Error('Version document snapshots are read-only');
    }
    const resolveDocsPath = (basePath, baseDir) => {
        if (!pathname.startsWith(basePath))
            return null;
        const decodedName = ensureMarkdownExtension(safeDecodeURIComponent(pathname.slice(basePath.length)));
        if (!decodedName)
            return null;
        return resolvePathInside(baseDir, decodedName);
    };
    const templatePath = resolveDocsPath('/api/docs/templates/', getTemplatesDirForContext(context))
        || resolveDocsPath('/docs/templates/', getTemplatesDirForContext(context));
    if (templatePath)
        return templatePath;
    const docPath = resolveDocsPath('/api/docs/', getDocsDirForContext(context))
        || resolveDocsPath('/docs/', getDocsDirForContext(context));
    if (docPath)
        return docPath;
    return resolveProjectPath(context.project.root, ensureMarkdownExtension(rawDocUrl));
}
function normalizeMarkdownAssetPath(value) {
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
function resolveMarkdownFileAssetPath(context, markdownPath, assetPath) {
    const docPath = resolveProjectPath(context.project.root, markdownPath);
    const normalizedAssetPath = normalizeMarkdownAssetPath(assetPath);
    if (!normalizedAssetPath) {
        return null;
    }
    const docDir = path.dirname(docPath);
    const targetPath = path.resolve(docDir, normalizedAssetPath);
    return isPathInside(docDir, targetPath) ? targetPath : null;
}
function hasResourceWriteCapability(context, capability) {
    return createEffectiveProjectCapabilities(context).resourceWrites[capability] === true;
}
function normalizeResourceIdFromFileName(fileName) {
    return path.basename(fileName, path.extname(fileName));
}
function prependUnique(values, value) {
    return [value, ...values.filter((item) => item !== value)];
}
function createProjectRelativePath(projectRoot, absolutePath) {
    return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}
function saveMetadataWithResourceOrder(context, metadata) {
    const saved = context.metadataStore.saveMetadata(metadata);
    context.metadata = saved;
    return saved;
}
function updatePrototypeMetadataAfterUpload(context, params) {
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
function updateGenericResourceMetadata(context, type, previousKey, nextResource, previousOrderKey, nextOrderKey) {
    const current = context.metadataStore.getMetadata();
    const resources = current.resources[type];
    const orders = current.orders[type];
    saveMetadataWithResourceOrder(context, {
        ...current,
        resources: {
            ...current.resources,
            [type]: resources.map((resource) => (resource.id === previousKey || resource.name === previousKey
                ? { ...resource, ...nextResource }
                : resource)),
        },
        orders: {
            ...current.orders,
            [type]: orders.map((key) => (key === previousOrderKey ? nextOrderKey : key)),
        },
    });
}
function removeGenericResourceMetadata(context, type, key) {
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
function readJsonFile(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return fallback;
    }
}
function createUnavailableProjectEntry(project) {
    const availabilityError = getProjectMetadataAvailabilityError(project) || createProjectMetadataMissingError(project);
    return {
        ...createProjectEntryBase(project),
        unavailable: true,
        error: availabilityError,
    };
}
function createAdminContextPayload(options) {
    const registry = getProjectRegistryForRequest(options).getRegistry();
    const activeRegistryProject = registry.projects.find((project) => project.id === registry.activeProjectId) ?? null;
    const availabilityErrors = new Map();
    const getAvailabilityError = (project) => {
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
        projects: registry.projects.map((project) => (getAvailabilityError(project) ? createUnavailableProjectEntry(project) : toProjectEntry(project))),
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
function createEmptyProjectResources() {
    return {
        prototypes: [],
        themes: [],
    };
}
function createEmptyResourceOrders() {
    return {
        themes: [],
    };
}
function createUnavailableProjectCapabilities(project) {
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
function createUnavailableProjectResourcesPayload(project, error) {
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
function resolveUnavailableStartupProject(options, projectId) {
    try {
        ensureDefaultRegisteredProject(options);
    }
    catch {
        return null;
    }
    const registry = getProjectRegistryForRequest(options);
    const project = registry.getProject(projectId);
    if (!project) {
        return null;
    }
    const availabilityError = getProjectMetadataAvailabilityError(project);
    if (availabilityError?.code !== 'PROJECT_METADATA_MISSING') {
        return null;
    }
    return { project, error: availabilityError };
}
function isStartupConfigGetRoute(pathname) {
    return pathname === '/api/config'
        || pathname === '/api/config/bootstrap'
        || pathname === '/api/config/availability'
        || pathname === '/api/config/ai-image/codex-local';
}
function isStartupSidebarTreeTab(value) {
    return value === 'prototypes'
        || value === 'components'
        || value === 'docs'
        || value === 'canvas'
        || value === 'themes';
}
function isStartupResourceOrderType(value) {
    return value === 'themes' || value === 'data' || value === 'templates';
}
function handleUnavailableProjectStartupApi(req, res, options, pathname, url) {
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
    const requestedProjectId = getRequestProjectId(url);
    if (!requestedProjectId) {
        return false;
    }
    const startupProject = resolveUnavailableStartupProject(options, requestedProjectId);
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
        }).catch((error) => {
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
export async function handleManagementApi(req, res, options) {
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
        resolveProjectContext,
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
        getDeclaredResourceWriteDir: getDeclaredResourceWriteDir,
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
        getDeclaredResourceWriteDir: getDeclaredResourceWriteDir,
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
        }
        catch (error) {
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
    }))
        return true;
    if (handlePrototypeUploadApi(req, res, options, pathname, {
        readMultipartParts,
        createProjectContextFromMultipartParts,
        getDeclaredResourceWriteDir,
        hasResourceWriteCapability,
        sendDisabledCapability,
    }))
        return true;
    let bodyForProjectContext;
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!getRequestProjectId(url) && contentType.includes('application/json')) {
        try {
            bodyForProjectContext = await readJsonBody(req);
        }
        catch (error) {
            sendJson(res, { error: error?.message || 'Invalid JSON body' }, { status: 400 });
            return true;
        }
    }
    const requestContext = getRequestProjectContext(req, res, options, bodyForProjectContext);
    if (!requestContext) {
        return true;
    }
    const activeProjectRoot = requestContext.project.root;
    getCanvasBridgeHub().configureProjectRoot(requestContext.project.root);
    if (await handleHtmlResourceEditingApi(req, res, activeProjectRoot, pathname))
        return true;
    if (await handleHtmlReviewArtifactsApi(req, res, activeProjectRoot, pathname))
        return true;
    if (handleLegacyDocsApi(req, res, options, requestContext, pathname, url, {
        resolveProjectContext,
    }))
        return true;
    if (handleEntriesCompatibilityApi(req, res, options, requestContext, pathname))
        return true;
    if (handleCodeReviewApi(req, res, requestContext, pathname, {
        resolveSourceFileFromMetadata,
        findProjectResourceByPath,
        sendDisabledCapability,
    }))
        return true;
    if (handleConfigApi(req, res, options, pathname, requestContext, {
        readProjectConfig,
        getServerConfigStoreForRequest,
        stringValue,
        toProjectIdentity,
        updateRegisteredProjectTitle,
    }))
        return true;
    if (handleAiRunsApi(req, res, options, pathname, {
        resolveProjectContext,
        getServerConfigStoreForRequest,
    }))
        return true;
    if (handleAcpRuntimeEventsApi(req, res, options, requestContext, pathname, getServerConfigStoreForRequest))
        return true;
    if (handleAiArtifactHistoryApi(req, res, requestContext, pathname))
        return true;
    if (handleCloudPublishingApi(req, res, options, pathname, {
        resolveProjectContext,
        resolveSourceFileFromMetadata,
        findProjectResourceByPath,
        getDeclaredResourceWriteDir: getDeclaredResourceWriteDir,
        getServerConfigStoreForRequest,
        commandExecutor: options.cloudPublishingCommandExecutor,
        sendDisabledCapability,
    }))
        return true;
    if (handleProjectDocsApi(req, res, requestContext, options, pathname, {
        createProjectContextFromBody,
        getDeclaredResourceWriteDir,
        hasResourceWriteCapability,
        sendResourceWriteAdapterRequired,
        createProjectRelativePath,
    }))
        return true;
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
    }))
        return true;
    if (pathname === '/api/prototypes/create-placeholder' && req.method === 'POST') {
        void handleCreatePlaceholderPrototype(req, res, options, requestContext, {
            getDeclaredResourceWriteDir: ((context, type) => (type === 'prototypes' ? getPrototypeCreateDir(context) : getDeclaredResourceWriteDir(context, type))),
            hasResourceWriteCapability: hasResourceWriteCapability,
            sendDisabledCapability,
            readMultipartParts: readMultipartParts,
            createProjectContextFromMultipartParts: createProjectContextFromMultipartParts,
        });
        return true;
    }
    const startPrototypeGenerationMatch = pathname.match(/^\/api\/prototypes\/([^/]+)\/start-generation$/u);
    if (startPrototypeGenerationMatch && req.method === 'POST') {
        void handleStartPlaceholderPrototypeGeneration(req, res, options, requestContext, safeDecodeURIComponent(startPrototypeGenerationMatch[1] || ''), {
            getDeclaredResourceWriteDir: ((context, type) => (type === 'prototypes' ? getPrototypeCreateDir(context) : getDeclaredResourceWriteDir(context, type))),
            hasResourceWriteCapability: hasResourceWriteCapability,
            sendDisabledCapability,
            readMultipartParts: readMultipartParts,
            createProjectContextFromMultipartParts: createProjectContextFromMultipartParts,
        });
        return true;
    }
    if (handleTemplateLibraryApi(req, res, options, pathname, {
        createProjectContextFromBody,
        getDeclaredResourceWriteDir: getDeclaredResourceWriteDir,
        hasResourceWriteCapability: hasResourceWriteCapability,
        sendDisabledCapability,
    }))
        return true;
    if (handleThemeLibraryApi(req, res, options, pathname, {
        createProjectContextFromBody,
        getDeclaredResourceWriteDir: getDeclaredResourceWriteDir,
        hasResourceWriteCapability: hasResourceWriteCapability,
        sendDisabledCapability,
    }))
        return true;
    if (handleCanvasApi(req, res, activeProjectRoot, pathname, {
        metadata: requestContext.metadata,
        projectId: requestContext.project.id,
    }))
        return true;
    if (handlePrototypeAnnotationApi(req, res, requestContext, url))
        return true;
    if (handlePrototypeCommentsApi(req, res, requestContext, url))
        return true;
    if (handleDocumentCommentsApi(req, res, requestContext, url))
        return true;
    if (handleMediaApi(req, res, activeProjectRoot, { mediaRoot: getDeclaredResourceWriteDir(requestContext, 'media') || undefined }))
        return true;
    if (handleWorkspaceApi(req, res, options, requestContext, pathname, url, {
        toProjectIdentity,
        updateRegisteredProjectTitle,
        getTemplatesDir,
    }))
        return true;
    if (handleFileOperationsApi(req, res, activeProjectRoot, pathname, requestContext.metadataStore))
        return true;
    if (handleProjectSourceAndZipApi(req, res, options, requestContext, pathname, url, {
        resolveProjectContext,
        findProjectResourceByPath,
        resolveSourceFileFromMetadata,
        sendDisabledCapability,
    }))
        return true;
    if (handleUnavailableManagement(req, res, pathname, sendDisabledCapability))
        return true;
    if (pathname.startsWith('/api/')) {
        sendText(res, JSON.stringify({ error: 'Not found' }), 'application/json; charset=utf-8', 404);
        return true;
    }
    return false;
}
