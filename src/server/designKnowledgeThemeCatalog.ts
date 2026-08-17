import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const DESIGN_KNOWLEDGE_MANIFEST_URL =
  'https://lintendo.github.io/Make-Template/knowledge/latest/manifest.json';
export const DESIGN_KNOWLEDGE_READER_VERSION = '1.0.0';
export const THEME_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

const MANIFEST_MAX_BYTES = 1024 * 1024;
const INDEX_MAX_BYTES = 20 * 1024 * 1024;
const PACKAGE_MAX_BYTES = 100 * 1024 * 1024;
const UNPACKED_PACKAGE_MAX_BYTES = 250 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 15_000;
const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const TAXONOMY_ZH: Record<string, string> = {
  'ai-developer-tools': 'AI 与开发工具',
  'enterprise-productivity': '企业服务与生产力',
  'finance-payments': '金融与支付',
  'ecommerce-retail': '电商与零售',
  'social-community': '社交与社区',
  'communication-collaboration': '通讯与协作',
  'media-entertainment-reading': '媒体、音乐、视频与阅读',
  'design-creation-content': '设计、创作与内容生产',
  'travel-maps-transport': '出行、地图与交通',
  'local-food': '本地生活与餐饮',
  'health-fitness': '健康与运动',
  'education-knowledge': '教育与知识',
  'automotive-industrial-energy': '汽车、制造、工业与能源',
  'gaming-lifestyle': '游戏、娱乐与生活方式',
  'editorial-agency-brand': '编辑、机构与品牌展示',
  'marketing-site': '营销网站',
  'consumer-app': '消费应用',
  saas: '软件即服务',
  dashboard: '仪表盘',
  'developer-tool': '开发者工具',
  'enterprise-tool': '企业工具',
  editor: '编辑器',
  marketplace: '交易市场',
  commerce: '商业交易',
  'social-network': '社交网络',
  'content-platform': '内容平台',
  'service-platform': '服务平台',
  minimal: '极简',
  editorial: '编辑风',
  professional: '专业',
  playful: '趣味',
  luxury: '奢华',
  bold: '醒目',
  experimental: '实验性',
  illustrative: '插画风',
  'data-dense': '数据密集',
  clean: '简洁',
  futuristic: '未来感',
  organic: '自然有机',
};

export type ThemeCatalogPlatform = 'desktop' | 'mobile';

export interface ThemeCatalogItem {
  id: string;
  slug: string;
  title: string;
  platform: ThemeCatalogPlatform;
  description: string;
  tags: string[];
  previewUrl: string;
  coverUrl?: string;
  canDirectImport: boolean;
  directImportDisabledReason?: string;
}

export interface ThemeCatalogLoadResult {
  platform: ThemeCatalogPlatform;
  total: number;
  stale: boolean;
  designSystems: ThemeCatalogItem[];
}

export interface ThemeCatalogRecord extends ThemeCatalogItem {
  publishable: boolean;
  reasons: string[];
  packageUrl?: string;
  packageHash?: string;
}

interface CachedPlatformCatalog {
  loadedAt: number;
  publicResult: Omit<ThemeCatalogLoadResult, 'stale'>;
  records: ThemeCatalogRecord[];
}

interface CatalogOptions {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  manifestUrl?: string;
  fetchTimeoutMs?: number;
}

function catalogError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function schemaError(message: string): never {
  throw catalogError('THEME_LIBRARY_SCHEMA_INVALID', message);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    schemaError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) schemaError(`${label} must be a non-empty string`);
  return result;
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) schemaError(`${label} must be an array`);
  const result = value.map((item, index) => asString(item, `${label}[${index}]`));
  if (new Set(result).size !== result.length) schemaError(`${label} must not contain duplicates`);
  return result;
}

function parseSemver(value: unknown, label: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(asString(value, label));
  if (!match) schemaError(`${label} must be a semantic version`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function knowledgeBasePath(manifestUrl: string): { origin: string; basePath: string } {
  let parsed: URL;
  try {
    parsed = new URL(manifestUrl);
  } catch {
    schemaError('Manifest URL is invalid');
  }
  const marker = '/knowledge/';
  const markerIndex = parsed.pathname.indexOf(marker);
  if (parsed.protocol !== 'https:' || markerIndex < 0 || parsed.username || parsed.password || parsed.search || parsed.hash) {
    schemaError('Manifest URL is outside the official knowledge path');
  }
  return {
    origin: parsed.origin,
    basePath: parsed.pathname.slice(0, markerIndex + marker.length),
  };
}

function assertArtifactUrl(value: unknown, label: string, source: { origin: string; basePath: string }): string {
  const raw = asString(value, label);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    schemaError(`${label} must be an absolute URL`);
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname).replaceAll('\\', '/');
  } catch {
    schemaError(`${label} contains invalid URL encoding`);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.origin !== source.origin
    || !decodedPath.startsWith(source.basePath)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || decodedPath.split('/').includes('..')
  ) {
    schemaError(`${label} is outside the official knowledge path`);
  }
  return parsed.href;
}

function assertHash(value: unknown, label: string): string {
  const result = asString(value, label);
  if (!HASH_PATTERN.test(result)) schemaError(`${label} must be a sha256 hash`);
  return result;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function fetchBoundedBytes(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  maxBytes: number,
  accept: string,
  timeoutMs: number,
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: accept,
          'User-Agent': '@axhub/make design-knowledge-theme-catalog',
        },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error: any) {
      throw catalogError(
        'THEME_LIBRARY_REMOTE_UNAVAILABLE',
        controller.signal.aborted ? 'Theme catalog request timed out' : error?.message || 'Theme catalog request failed',
      );
    }
    if (!response.ok) {
      throw catalogError('THEME_LIBRARY_REMOTE_UNAVAILABLE', `Theme catalog request failed (${response.status})`);
    }
    if (response.redirected || (response.url && new URL(response.url).href !== new URL(url).href)) {
      schemaError('Theme catalog artifact redirected outside its verified URL');
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      schemaError(`Theme catalog artifact exceeds ${maxBytes} bytes`);
    }
    if (!response.body) schemaError('Theme catalog artifact has no response body');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error: any) {
        throw catalogError(
          'THEME_LIBRARY_REMOTE_UNAVAILABLE',
          controller.signal.aborted ? 'Theme catalog request timed out' : error?.message || 'Theme catalog stream failed',
        );
      }
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        schemaError(`Theme catalog artifact exceeds ${maxBytes} bytes`);
      }
      chunks.push(result.value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), byteLength);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    schemaError(`${label} must be valid JSON`);
  }
}

function validateManifest(raw: unknown, manifestUrl: string) {
  const manifest = asObject(raw, 'Manifest');
  if (
    manifest.schemaVersion !== 1
    || manifest.taxonomyVersion !== '1.0.0'
    || manifest.searchContractVersion !== '1.0.0'
    || manifest.tokenizationVersion !== 'nfkc-intl-segmenter-v1'
  ) {
    schemaError('Manifest contract version is incompatible');
  }
  const reader = parseSemver(DESIGN_KNOWLEDGE_READER_VERSION, 'Reader version');
  const minimum = parseSemver(manifest.minReaderVersion, 'Manifest minReaderVersion');
  const maximum = parseSemver(manifest.maxReaderVersionExclusive, 'Manifest maxReaderVersionExclusive');
  if (compareSemver(reader, minimum) < 0 || compareSemver(reader, maximum) >= 0) {
    schemaError('Manifest reader range is incompatible');
  }
  if (!Array.isArray(manifest.records)) schemaError('Manifest records must be an array');
  asObject(manifest.sourceCommits, 'Manifest sourceCommits');
  const indexes = asObject(manifest.indexes, 'Manifest indexes');
  const source = knowledgeBasePath(manifestUrl);
  const descriptors = Object.fromEntries((['desktop', 'mobile'] as const).map((platform) => {
    const descriptor = asObject(indexes[platform], `Manifest indexes.${platform}`);
    const count = descriptor.count;
    if (!Number.isInteger(count) || Number(count) < 0) schemaError(`Manifest indexes.${platform}.count is invalid`);
    return [platform, {
      url: assertArtifactUrl(descriptor.url, `Manifest indexes.${platform}.url`, source),
      hash: assertHash(descriptor.hash, `Manifest indexes.${platform}.hash`),
      count: Number(count),
      source,
    }];
  })) as Record<ThemeCatalogPlatform, {
    url: string;
    hash: string;
    count: number;
    source: { origin: string; basePath: string };
  }>;
  return {
    descriptors,
  };
}

function uniqueLabels(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const label = TAXONOMY_ZH[value] || value.replaceAll('-', ' ');
    if (label && !result.includes(label)) result.push(label);
  }
  return result;
}

function cardLabels(record: Record<string, unknown>): string[] {
  const annotation = record.annotation && typeof record.annotation === 'object' && !Array.isArray(record.annotation)
    ? record.annotation as Record<string, unknown>
    : {};
  const values = ['industries', 'productTypes', 'styles']
    .flatMap((key) => Array.isArray(annotation[key])
      ? (annotation[key] as unknown[]).filter((item): item is string => typeof item === 'string').slice(0, 2)
      : []);
  const annotationLabels = uniqueLabels(values);
  if (annotationLabels.length > 0) return annotationLabels.slice(0, 6);
  const tags = Array.isArray(record.tags)
    ? (record.tags as unknown[]).filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
  return uniqueLabels(tags).slice(0, 6);
}

function disabledReason(reasons: string[]): string {
  if (reasons.some((reason) => reason.includes('license'))) return '主题授权尚未完成';
  return '主题包尚未开放导入';
}

function validateIndex(
  raw: unknown,
  platform: ThemeCatalogPlatform,
  expectedCount: number,
  source: { origin: string; basePath: string },
): ThemeCatalogRecord[] {
  const index = asObject(raw, `${platform} index`);
  if (
    index.schemaVersion !== 1
    || index.taxonomyVersion !== '1.0.0'
    || index.searchContractVersion !== '1.0.0'
    || index.tokenizationVersion !== 'nfkc-intl-segmenter-v1'
    || index.platform !== platform
  ) {
    schemaError(`${platform} index contract is incompatible`);
  }
  if (!index.postings || typeof index.postings !== 'object' || Array.isArray(index.postings)) {
    schemaError(`${platform} index postings must be an object`);
  }
  if (!Array.isArray(index.records) || index.records.length !== expectedCount) {
    schemaError(`${platform} index count does not match the Manifest`);
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  return index.records.map((value, recordIndex) => {
    const record = asObject(value, `${platform} records[${recordIndex}]`);
    if (record.schemaVersion !== 1 || record.searchable !== true) {
      schemaError(`${platform} records[${recordIndex}] is not searchable schemaVersion 1`);
    }
    const id = asString(record.id, `${platform} records[${recordIndex}].id`);
    const slug = asString(record.slug, `${platform} records[${recordIndex}].slug`);
    if (!SAFE_ID_PATTERN.test(id) || !SAFE_ID_PATTERN.test(slug)) schemaError(`Invalid theme id or slug: ${id}`);
    if (ids.has(id) || slugs.has(slug)) schemaError(`Duplicate theme id or slug: ${id}`);
    ids.add(id);
    slugs.add(slug);
    const platforms = asStringArray(record.platforms, `${platform} records[${recordIndex}].platforms`);
    if (!platforms.includes(platform)) schemaError(`${id} is missing platform ${platform}`);
    const reviewStatus = asString(record.reviewStatus, `${id}.reviewStatus`);
    if (!['approved', 'deferred', 'rejected'].includes(reviewStatus)) schemaError(`${id}.reviewStatus is invalid`);
    if (typeof record.publishable !== 'boolean') schemaError(`${id}.publishable must be boolean`);
    const reasons = asStringArray(record.reasons, `${id}.reasons`);
    const artifacts = asObject(record.artifacts, `${id}.artifacts`);
    const previewUrl = assertArtifactUrl(artifacts.previewUrl, `${id}.artifacts.previewUrl`, source);
    const coverUrl = artifacts.previewImageUrl === undefined
      ? undefined
      : assertArtifactUrl(artifacts.previewImageUrl, `${id}.artifacts.previewImageUrl`, source);
    const packageUrl = artifacts.packageUrl === undefined
      ? undefined
      : assertArtifactUrl(artifacts.packageUrl, `${id}.artifacts.packageUrl`, source);
    const packageHash = artifacts.packageHash === undefined
      ? undefined
      : assertHash(artifacts.packageHash, `${id}.artifacts.packageHash`);
    const labels = cardLabels(record);
    const publishable = record.publishable === true;
    const canDirectImport = publishable && Boolean(packageUrl && packageHash);
    return {
      id,
      slug,
      title: asString(record.title, `${id}.title`),
      platform,
      description: labels.join(' · ') || '在线主题模板',
      tags: labels,
      previewUrl,
      ...(coverUrl ? { coverUrl } : {}),
      canDirectImport,
      ...(!canDirectImport ? { directImportDisabledReason: disabledReason(reasons) } : {}),
      publishable,
      reasons,
      ...(packageUrl ? { packageUrl } : {}),
      ...(packageHash ? { packageHash } : {}),
    };
  });
}

function toPublicResult(cached: CachedPlatformCatalog, stale: boolean): ThemeCatalogLoadResult {
  return {
    ...cached.publicResult,
    stale,
    designSystems: cached.publicResult.designSystems.map((item) => ({ ...item, tags: [...item.tags] })),
  };
}

function readTarText(buffer: Buffer, offset: number, length: number): string {
  const end = buffer.indexOf(0, offset);
  return buffer.subarray(offset, end >= offset && end < offset + length ? end : offset + length).toString('utf8');
}

export function validateThemePackageArchive(bytes: Buffer): string[] {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > PACKAGE_MAX_BYTES) {
    schemaError('Theme package exceeds the compressed size limit');
  }
  let archive: Buffer;
  try {
    archive = gunzipSync(bytes, { maxOutputLength: UNPACKED_PACKAGE_MAX_BYTES });
  } catch {
    schemaError('Theme package is not a bounded gzip archive');
  }
  const names = new Set<string>();
  let offset = 0;
  let ended = false;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      const trailer = archive.subarray(offset, offset + 1024);
      if (trailer.length < 1024 || !trailer.every((byte) => byte === 0)) {
        schemaError('Theme package has an invalid trailer');
      }
      ended = true;
      break;
    }
    const type = header[156];
    if (![0, 48, 53].includes(type)) schemaError('Theme package contains links or unsupported entries');
    const name = readTarText(header, 0, 100);
    const prefix = readTarText(header, 345, 155);
    const rawPath = prefix ? `${prefix}/${name}` : name;
    const relativePath = rawPath.replace(/\/+$/u, '');
    const parts = relativePath.split('/');
    if (
      !relativePath
      || relativePath.includes('\\')
      || relativePath.startsWith('/')
      || /^[A-Za-z]:/u.test(relativePath)
      || parts.some((part) => !part || part === '.' || part === '..')
      || names.has(relativePath)
    ) {
      schemaError('Theme package contains unsafe or duplicate paths');
    }
    names.add(relativePath);
    const sizeText = readTarText(header, 124, 12).trim();
    if (!/^[0-7]+$/u.test(sizeText)) schemaError('Theme package contains an invalid file size');
    const size = Number.parseInt(sizeText, 8);
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (!Number.isSafeInteger(size) || next > archive.length) schemaError('Theme package entry exceeds archive bounds');
    offset = next;
  }
  if (!ended || names.size === 0) schemaError('Theme package is incomplete');
  return [...names].sort();
}

export function createDesignKnowledgeThemeCatalog(options: CatalogOptions = {}) {
  const fetchImpl: typeof globalThis.fetch = options.fetch
    || ((input, init) => globalThis.fetch(input, init));
  const now = options.now || Date.now;
  const manifestUrl = options.manifestUrl || DESIGN_KNOWLEDGE_MANIFEST_URL;
  const fetchTimeoutMs = options.fetchTimeoutMs || REMOTE_FETCH_TIMEOUT_MS;
  const cache = new Map<ThemeCatalogPlatform, CachedPlatformCatalog>();
  const inFlight = new Map<ThemeCatalogPlatform, Promise<ThemeCatalogLoadResult>>();
  let manifestCache: { loadedAt: number; descriptors: ReturnType<typeof validateManifest>['descriptors'] } | null = null;
  let manifestInFlight: Promise<NonNullable<typeof manifestCache>> | null = null;

  const loadManifest = async (): Promise<NonNullable<typeof manifestCache>> => {
    if (manifestCache && now() - manifestCache.loadedAt < THEME_CATALOG_CACHE_TTL_MS) return manifestCache;
    if (manifestInFlight) return manifestInFlight;
    manifestInFlight = fetchBoundedBytes(
      fetchImpl,
      manifestUrl,
      MANIFEST_MAX_BYTES,
      'application/json',
      fetchTimeoutMs,
    ).then((manifestBytes) => {
      const validated = validateManifest(parseJson(manifestBytes, 'Manifest'), manifestUrl);
      manifestCache = { loadedAt: now(), descriptors: validated.descriptors };
      return manifestCache;
    }).finally(() => {
      manifestInFlight = null;
    });
    return manifestInFlight;
  };

  const refresh = async (platform: ThemeCatalogPlatform): Promise<CachedPlatformCatalog> => {
    const descriptor = (await loadManifest()).descriptors[platform];
    const indexBytes = await fetchBoundedBytes(
      fetchImpl,
      descriptor.url,
      INDEX_MAX_BYTES,
      'application/json',
      fetchTimeoutMs,
    );
    if (sha256(indexBytes) !== descriptor.hash) schemaError(`${platform} index hash does not match the Manifest`);
    const records = validateIndex(parseJson(indexBytes, `${platform} index`), platform, descriptor.count, descriptor.source);
    const designSystems = records.map((record): ThemeCatalogItem => ({
      id: record.id,
      slug: record.slug,
      title: record.title,
      platform: record.platform,
      description: record.description,
      tags: [...record.tags],
      previewUrl: record.previewUrl,
      ...(record.coverUrl ? { coverUrl: record.coverUrl } : {}),
      canDirectImport: record.canDirectImport,
      ...(record.directImportDisabledReason
        ? { directImportDisabledReason: record.directImportDisabledReason }
        : {}),
    }));
    return {
      loadedAt: now(),
      records,
      publicResult: {
        platform,
        total: designSystems.length,
        designSystems,
      },
    };
  };

  const load = async (platform: ThemeCatalogPlatform): Promise<ThemeCatalogLoadResult> => {
    if (platform !== 'desktop' && platform !== 'mobile') schemaError(`Unsupported theme platform: ${String(platform)}`);
    const cached = cache.get(platform);
    if (cached && now() - cached.loadedAt < THEME_CATALOG_CACHE_TTL_MS) return toPublicResult(cached, false);
    const pending = inFlight.get(platform);
    if (pending) return pending;
    const promise = refresh(platform)
      .then((next) => {
        cache.set(platform, next);
        return toPublicResult(next, false);
      })
      .catch((error) => {
        const stale = cache.get(platform);
        if (stale) return toPublicResult(stale, true);
        throw error;
      })
      .finally(() => {
        inFlight.delete(platform);
      });
    inFlight.set(platform, promise);
    return promise;
  };

  const getRecord = async (platform: ThemeCatalogPlatform, themeId: string): Promise<ThemeCatalogRecord | null> => {
    await load(platform);
    return cache.get(platform)?.records.find((record) => record.id === themeId) || null;
  };

  const downloadPackage = async (record: ThemeCatalogRecord): Promise<Buffer> => {
    if (!record.publishable || !record.packageUrl || !record.packageHash) {
      throw catalogError('THEME_LIBRARY_NOT_IMPORTABLE', record.directImportDisabledReason || 'Theme package is unavailable');
    }
    const bytes = await fetchBoundedBytes(
      fetchImpl,
      record.packageUrl,
      PACKAGE_MAX_BYTES,
      'application/gzip',
      fetchTimeoutMs,
    );
    if (sha256(bytes) !== record.packageHash) schemaError('Theme package hash does not match the index');
    validateThemePackageArchive(bytes);
    return bytes;
  };

  return { load, getRecord, downloadPackage };
}

export const designKnowledgeThemeCatalog = createDesignKnowledgeThemeCatalog();
