import fs from 'node:fs';
import path from 'node:path';

import {
  getProjectMetadataPath,
  resolveProjectRoot,
} from './paths.ts';

export type ProjectResourceType = 'prototypes' | 'docs' | 'themes' | 'data' | 'templates';
export type ProjectResourceWriteTargetType = ProjectResourceType | 'media';
export type PrototypePreviewMode = 'clientRuntime';

export interface PrototypeResourceArtifacts {
  [key: string]: unknown;
}

export interface PrototypeResourcePage {
  id: string;
  title: string;
  group?: string;
}

export interface PrototypePlaceholderGuide {
  kind: string;
  title: string;
  description: string;
  steps: string[];
  tips: string[];
}

export type PrototypeGenerationStatus = 'waiting';

export interface PrototypeResource {
  id: string;
  name: string;
  title: string;
  clientUrl: string;
  previewMode: PrototypePreviewMode;
  description: string;
  updatedAt: string;
  placeholder?: boolean;
  placeholderGuide?: PrototypePlaceholderGuide;
  generationStatus?: PrototypeGenerationStatus;
  filePath?: string;
  absoluteFilePath?: string;
  specFilePath?: string;
  previewDisabled?: boolean;
  artifacts?: PrototypeResourceArtifacts;
  pages?: PrototypeResourcePage[];
  defaultPageId?: string;
  importReport?: Record<string, unknown>;
}

export interface GenericProjectResource {
  id: string;
  name?: string;
  title?: string;
  [key: string]: unknown;
}

/**
 * Project metadata describes resources and capabilities owned by .axhub/make/project.json.
 *
 * capabilities.resourceWrites are normalized effective server write switches.
 * Project files do not need to declare them; make-server derives write support
 * from resourceWriteTargets plus implemented routes.
 * resourceWriteTargets are write destinations, such as docs.path = "src/resources".
 *
 * resources stores dedicated Make artifacts only. Ordinary files, including
 * Markdown docs, data files, templates, images, Drawio diagrams, and Excalidraw
 * canvases, are discovered from src/resources instead of project metadata.
 *
 * navigation stores prototype display order.
 * orders stores theme display order.
 *
 * server and projectInfo belong to .axhub/make/axhub.config.json. They are
 * project runtime/display config, not project metadata fields.
 */
export interface ProjectMetadata {
  schemaVersion: 1;
  project: {
    id: string;
    name: string;
  };
  resources: {
    prototypes: PrototypeResource[];
    themes: GenericProjectResource[];
  };
  navigation: {
    prototypes: string[];
  };
  orders: {
    themes: string[];
  };
  capabilities: {
    quickEdit: boolean;
    quickEditMode: PrototypePreviewMode;
    figmaExport: boolean;
    axureExport: boolean;
    localExports: LocalExportCapabilities;
    resourceWrites: ResourceWriteCapabilities;
  };
  resourceWriteTargets: ProjectResourceWriteTargets;
}

export interface ProjectResourceWriteTarget {
  type: 'project-relative-path';
  path: string;
}

export type ProjectResourceWriteTargets = Partial<Record<ProjectResourceWriteTargetType, ProjectResourceWriteTarget>>;

export interface ResourceWriteCapabilities {
  prototypeCreate: boolean;
  prototypeUpload: boolean;
  docCreate: boolean;
  docImport: boolean;
  themeCreate: boolean;
  themeImport: boolean;
  dataCreate: boolean;
  dataImport: boolean;
  templateCreate: boolean;
  templateDuplicate: boolean;
}

export interface LocalExportCapabilities {
  html: boolean;
  make: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

const PAGE_ID_RE = /^[a-z0-9-]+$/u;

function normalizePageId(value: unknown): string {
  const id = stringValue(value);
  return PAGE_ID_RE.test(id) ? id : '';
}

function createDefaultMetadata(projectRoot: string): ProjectMetadata {
  const name = path.basename(resolveProjectRoot(projectRoot)) || 'project';
  return {
    schemaVersion: 1,
    project: {
      id: name,
      name,
    },
    resources: {
      prototypes: [],
      themes: [],
    },
    navigation: {
      prototypes: [],
    },
    orders: {
      themes: [],
    },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: true,
      axureExport: true,
      localExports: createDefaultLocalExportCapabilities(),
      resourceWrites: createDefaultResourceWriteCapabilities(),
    },
    resourceWriteTargets: {},
  };
}

function createDefaultLocalExportCapabilities(): LocalExportCapabilities {
  return {
    html: false,
    make: false,
  };
}

function createDefaultResourceWriteCapabilities(): ResourceWriteCapabilities {
  return {
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
  };
}

function normalizeLocalExportCapabilities(value: unknown): LocalExportCapabilities {
  const defaults = createDefaultLocalExportCapabilities();
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    html: typeof raw.html === 'boolean' ? raw.html : defaults.html,
    make: typeof raw.make === 'boolean' ? raw.make : defaults.make,
  };
}

function normalizeResourceWriteCapabilities(value: unknown): ResourceWriteCapabilities {
  const defaults = createDefaultResourceWriteCapabilities();
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    prototypeCreate: typeof raw.prototypeCreate === 'boolean' ? raw.prototypeCreate : defaults.prototypeCreate,
    prototypeUpload: typeof raw.prototypeUpload === 'boolean' ? raw.prototypeUpload : defaults.prototypeUpload,
    docCreate: typeof raw.docCreate === 'boolean' ? raw.docCreate : defaults.docCreate,
    docImport: typeof raw.docImport === 'boolean' ? raw.docImport : defaults.docImport,
    themeCreate: typeof raw.themeCreate === 'boolean' ? raw.themeCreate : defaults.themeCreate,
    themeImport: typeof raw.themeImport === 'boolean' ? raw.themeImport : defaults.themeImport,
    dataCreate: typeof raw.dataCreate === 'boolean' ? raw.dataCreate : defaults.dataCreate,
    dataImport: typeof raw.dataImport === 'boolean' ? raw.dataImport : defaults.dataImport,
    templateCreate: typeof raw.templateCreate === 'boolean' ? raw.templateCreate : defaults.templateCreate,
    templateDuplicate: typeof raw.templateDuplicate === 'boolean' ? raw.templateDuplicate : defaults.templateDuplicate,
  };
}

function isDefaultResourceWriteCapabilities(value: ResourceWriteCapabilities): boolean {
  const defaults = createDefaultResourceWriteCapabilities();
  return (Object.keys(defaults) as Array<keyof ResourceWriteCapabilities>)
    .every((key) => value[key] === defaults[key]);
}

function serializeMetadataForWrite(metadata: ProjectMetadata): ProjectMetadata | Record<string, unknown> {
  if (!isDefaultResourceWriteCapabilities(metadata.capabilities.resourceWrites)) {
    return metadata;
  }
  const { resourceWrites: _resourceWrites, ...capabilities } = metadata.capabilities;
  return {
    ...metadata,
    capabilities,
  };
}

function normalizeGenericResources(value: unknown): GenericProjectResource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const id = stringValue(item.id) || stringValue(item.name);
      if (!id) {
        return null;
      }
      return {
        ...item,
        id,
        ...(stringValue(item.name) ? { name: stringValue(item.name) } : {}),
        ...(stringValue(item.title) ? { title: stringValue(item.title) } : {}),
      };
    })
    .filter((item): item is GenericProjectResource => Boolean(item));
}

function normalizePrototypePlaceholderGuide(value: unknown): PrototypePlaceholderGuide | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const kind = stringValue(raw.kind);
  const title = stringValue(raw.title);
  const description = stringValue(raw.description);
  if (!kind || !title || !description) {
    return undefined;
  }
  return {
    kind,
    title,
    description,
    steps: stringList(raw.steps),
    tips: stringList(raw.tips),
  };
}

function normalizePrototypeRoutePages(value: unknown): PrototypeResourcePage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const id = normalizePageId(item.id);
      const title = stringValue(item.title);
      const group = stringValue(item.group);
      return id && title ? { id, title, ...(group ? { group } : {}) } : null;
    })
    .filter((item): item is PrototypeResourcePage => Boolean(item));
}

function normalizePrototypeGenerationStatus(value: unknown): PrototypeGenerationStatus | undefined {
  return value === 'waiting' ? 'waiting' : undefined;
}

function normalizePrototypeResources(value: unknown): PrototypeResource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const id = stringValue(item.id) || stringValue(item.name);
      const name = stringValue(item.name) || id;
      const title = stringValue(item.title) || name;
      const clientUrl = stringValue(item.clientUrl);
      if (!id || !name || !title || !clientUrl) {
        return null;
      }
      const filePath = stringValue(item.filePath);
      const absoluteFilePath = stringValue(item.absoluteFilePath);
      const specFilePath = stringValue(item.specFilePath);
      const artifacts = item.artifacts && typeof item.artifacts === 'object' && !Array.isArray(item.artifacts)
        ? item.artifacts as PrototypeResourceArtifacts
        : null;
      const placeholderGuide = normalizePrototypePlaceholderGuide(item.placeholderGuide);
      const generationStatus = normalizePrototypeGenerationStatus(item.generationStatus);
      const pages = normalizePrototypeRoutePages(item.pages);
      const requestedDefaultPageId = normalizePageId(item.defaultPageId);
      const defaultPageId = pages.some((page) => page.id === requestedDefaultPageId)
        ? requestedDefaultPageId
        : pages[0]?.id || '';
      const importReport = item.importReport && typeof item.importReport === 'object' && !Array.isArray(item.importReport)
        ? item.importReport as Record<string, unknown>
        : null;
      return {
        id,
        name,
        title,
        clientUrl,
        previewMode: 'clientRuntime' as const,
        description: stringValue(item.description),
        updatedAt: stringValue(item.updatedAt) || nowIso(),
        ...(item.placeholder === true ? { placeholder: true } : {}),
        ...(placeholderGuide ? { placeholderGuide } : {}),
        ...(generationStatus ? { generationStatus } : {}),
        ...(filePath ? { filePath } : {}),
        ...(absoluteFilePath ? { absoluteFilePath } : {}),
        ...(specFilePath ? { specFilePath } : {}),
        ...(item.previewDisabled === true ? { previewDisabled: true } : {}),
        ...(artifacts ? { artifacts } : {}),
        ...(pages.length > 0 ? { pages, defaultPageId } : {}),
        ...(importReport ? { importReport } : {}),
      };
    })
    .filter((item): item is PrototypeResource => Boolean(item));
}

function normalizeProjectRelativeWriteTargetPath(projectRoot: string, resourceType: string, value: unknown): string {
  const rawPath = stringValue(value);
  if (!rawPath) {
    return '';
  }
  if (path.isAbsolute(rawPath)) {
    throw new Error(`Resource write target ${resourceType} must use a project-relative path`);
  }
  const normalized = path.posix.normalize(rawPath.replace(/\\/g, '/'));
  const trimmed = normalized.replace(/^\.\/+/u, '').replace(/\/+$/u, '');
  if (!trimmed || trimmed === '.') {
    return '';
  }
  const resolved = path.resolve(projectRoot, trimmed);
  const relative = path.relative(projectRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Resource write target ${resourceType} is outside project root`);
  }
  return trimmed;
}

function normalizeResourceWriteTargets(value: unknown, projectRoot: string): ProjectResourceWriteTargets {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const result: ProjectResourceWriteTargets = {};
  const keys: ProjectResourceWriteTargetType[] = ['docs', 'templates', 'themes', 'data', 'media', 'prototypes'];

  for (const key of keys) {
    const target = raw[key];
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      continue;
    }
    const targetRecord = target as Record<string, unknown>;
    const targetType = stringValue(targetRecord.type) || 'project-relative-path';
    if (targetType !== 'project-relative-path') {
      throw new Error(`Resource write target ${key} has unsupported type: ${targetType}`);
    }
    const targetPath = normalizeProjectRelativeWriteTargetPath(projectRoot, key, targetRecord.path);
    if (!targetPath) {
      continue;
    }
    result[key] = {
      type: 'project-relative-path',
      path: targetPath,
    };
  }

  return result;
}

function normalizeMetadata(data: unknown, projectRoot: string): ProjectMetadata {
  const defaults = createDefaultMetadata(projectRoot);
  if (!data || typeof data !== 'object') {
    return defaults;
  }
  const parsed = data as any;
  const resources = parsed.resources && typeof parsed.resources === 'object' ? parsed.resources : {};
  const navigation = parsed.navigation && typeof parsed.navigation === 'object' ? parsed.navigation : {};
  const orders = parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {};
  const capabilities = parsed.capabilities && typeof parsed.capabilities === 'object' ? parsed.capabilities : {};
  const project = parsed.project && typeof parsed.project === 'object' ? parsed.project : {};
  return {
    schemaVersion: 1,
    project: {
      id: stringValue(project.id) || defaults.project.id,
      name: typeof project.name === 'string' ? project.name.trim() : stringValue(project.id) || defaults.project.name,
    },
    resources: {
      prototypes: normalizePrototypeResources(resources.prototypes),
      themes: normalizeGenericResources(resources.themes),
    },
    navigation: {
      prototypes: stringList(navigation.prototypes),
    },
    orders: {
      themes: stringList(orders.themes),
    },
    capabilities: {
      quickEdit: typeof capabilities.quickEdit === 'boolean' ? capabilities.quickEdit : defaults.capabilities.quickEdit,
      quickEditMode: 'clientRuntime',
      figmaExport: typeof capabilities.figmaExport === 'boolean' ? capabilities.figmaExport : defaults.capabilities.figmaExport,
      axureExport: typeof capabilities.axureExport === 'boolean' ? capabilities.axureExport : defaults.capabilities.axureExport,
      localExports: normalizeLocalExportCapabilities(capabilities.localExports),
      resourceWrites: normalizeResourceWriteCapabilities(capabilities.resourceWrites),
    },
    resourceWriteTargets: normalizeResourceWriteTargets(parsed.resourceWriteTargets, projectRoot),
  };
}

export function createProjectMetadataStore(projectRoot: string, options?: { metadataPath?: string }) {
  const resolvedProjectRoot = resolveProjectRoot(projectRoot);
  const metadataPath = options?.metadataPath ? path.resolve(options.metadataPath) : getProjectMetadataPath(resolvedProjectRoot);

  const getMetadata = () => normalizeMetadata(readJsonFile(metadataPath), resolvedProjectRoot);

  return {
    getMetadataPath() {
      return metadataPath;
    },
    getMetadata,
    saveMetadata(metadata: unknown) {
      const normalized = normalizeMetadata(metadata, resolvedProjectRoot);
      writeJsonAtomic(metadataPath, serializeMetadataForWrite(normalized));
      return normalized;
    },
  };
}
