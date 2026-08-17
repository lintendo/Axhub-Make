import type { AiImageTaskParams } from '../../domains/ai-image/aiImageStore';
import type { CanvasDocumentFormat } from '../../domains/ai-generation/canvasGenerationPromptSettings';

export interface PrototypePlaceholderSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type PlaceholderImageStartParams = Partial<Pick<
  AiImageTaskParams,
  'size' | 'quality' | 'output_format' | 'background' | 'n' | 'disable_prompt_optimization'
>>;

export interface PrototypePlaceholderSettingsSnapshot {
  prototypeGenerationCount?: number;
  prototypeNeedsRequirementsAnalysis?: boolean;
  selectedThemeName?: string;
  imageStartParams?: PlaceholderImageStartParams;
  documentFormat?: CanvasDocumentFormat | '';
  documentHtmlVisualSpec?: string;
  documentUsePrdPlanning?: boolean;
  selectedDocumentTemplateName?: string;
}

const PROTOTYPE_PLACEHOLDER_SETTINGS_STORAGE_PREFIX = 'axhub:prototype-placeholder-settings:v1';
const VALID_IMAGE_QUALITIES = new Set(['auto', 'low', 'medium', 'high']);
const VALID_IMAGE_FORMATS = new Set(['png', 'jpeg', 'webp']);
const VALID_IMAGE_BACKGROUNDS = new Set(['auto', 'transparent']);
const VALID_DOCUMENT_FORMATS = new Set(['html', 'md', 'mermaid', 'drawio']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStorageKeyPart(part: string | null | undefined): string {
  return String(part || '').trim().replace(/\\/g, '/');
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizePrototypeCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const count = Math.round(value);
  return count >= 1 && count <= 4 ? count : undefined;
}

function normalizeImageCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const count = Math.round(value);
  return count >= 1 && count <= 10 ? count : undefined;
}

function normalizeImageSize(value: unknown): string | undefined {
  const size = normalizeString(value);
  if (!size) return undefined;
  return size === 'auto' || /^\d+x\d+$/u.test(size) ? size : undefined;
}

function normalizeImageStartParams(value: unknown): PlaceholderImageStartParams | undefined {
  if (!isRecord(value)) return undefined;
  const next: PlaceholderImageStartParams = {};
  const size = normalizeImageSize(value.size);
  const quality = typeof value.quality === 'string' && VALID_IMAGE_QUALITIES.has(value.quality) ? value.quality : undefined;
  const outputFormat = typeof value.output_format === 'string' && VALID_IMAGE_FORMATS.has(value.output_format) ? value.output_format : undefined;
  const background = typeof value.background === 'string' && VALID_IMAGE_BACKGROUNDS.has(value.background) ? value.background : undefined;
  const n = normalizeImageCount(value.n);
  const disablePromptOptimization = normalizeBoolean(value.disable_prompt_optimization);

  if (size) next.size = size;
  if (quality) next.quality = quality;
  if (outputFormat) next.output_format = outputFormat;
  if (background) next.background = background;
  if (n) next.n = n;
  if (disablePromptOptimization !== undefined) next.disable_prompt_optimization = disablePromptOptimization;

  return Object.keys(next).length ? next : undefined;
}

function normalizeDocumentFormat(value: unknown): CanvasDocumentFormat | '' | undefined {
  if (value === '') return '';
  return typeof value === 'string' && VALID_DOCUMENT_FORMATS.has(value)
    ? value as CanvasDocumentFormat
    : undefined;
}

function normalizeSnapshot(value: unknown): PrototypePlaceholderSettingsSnapshot {
  if (!isRecord(value)) return {};
  const next: PrototypePlaceholderSettingsSnapshot = {};
  const prototypeGenerationCount = normalizePrototypeCount(value.prototypeGenerationCount);
  const prototypeNeedsRequirementsAnalysis = normalizeBoolean(value.prototypeNeedsRequirementsAnalysis);
  const selectedThemeName = normalizeString(value.selectedThemeName);
  const imageStartParams = normalizeImageStartParams(value.imageStartParams);
  const documentFormat = normalizeDocumentFormat(value.documentFormat);
  const documentHtmlVisualSpec = normalizeString(value.documentHtmlVisualSpec);
  const documentUsePrdPlanning = normalizeBoolean(value.documentUsePrdPlanning);
  const selectedDocumentTemplateName = normalizeString(value.selectedDocumentTemplateName);

  if (prototypeGenerationCount !== undefined) next.prototypeGenerationCount = prototypeGenerationCount;
  if (prototypeNeedsRequirementsAnalysis !== undefined) next.prototypeNeedsRequirementsAnalysis = prototypeNeedsRequirementsAnalysis;
  if (selectedThemeName) next.selectedThemeName = selectedThemeName;
  if (imageStartParams) next.imageStartParams = imageStartParams;
  if (documentFormat !== undefined) next.documentFormat = documentFormat;
  if (documentHtmlVisualSpec) next.documentHtmlVisualSpec = documentHtmlVisualSpec;
  if (documentUsePrdPlanning !== undefined) next.documentUsePrdPlanning = documentUsePrdPlanning;
  if (selectedDocumentTemplateName) next.selectedDocumentTemplateName = selectedDocumentTemplateName;

  return next;
}

export function createPrototypePlaceholderSettingsStorageKey(
  parts: Array<string | null | undefined>,
): string {
  const normalizedParts = parts
    .map(normalizeStorageKeyPart)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part));
  return [PROTOTYPE_PLACEHOLDER_SETTINGS_STORAGE_PREFIX, ...normalizedParts].join(':');
}

export function getPrototypePlaceholderSettingsStorage(): PrototypePlaceholderSettingsStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPrototypePlaceholderSettings(
  storage: PrototypePlaceholderSettingsStorage | null | undefined,
  key: string | null | undefined,
): PrototypePlaceholderSettingsSnapshot {
  if (!storage || !key) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writePrototypePlaceholderSettings(
  storage: PrototypePlaceholderSettingsStorage | null | undefined,
  key: string | null | undefined,
  snapshot: PrototypePlaceholderSettingsSnapshot,
): void {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify(normalizeSnapshot(snapshot)));
  } catch {
    // localStorage may be unavailable in private or embedded browsing contexts.
  }
}
