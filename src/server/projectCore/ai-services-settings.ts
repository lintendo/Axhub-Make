import type { MakeServerConfig } from './server-config.ts';

export type AiServicesSettings = MakeServerConfig['ai'];

export type AiServiceSecretPath =
  | 'imageGeneration.apiKey'
  | 'doubao.accessKey'
  | 'processing.apiKey'
  | 'vision.apiKey';

export type AiServicesSettingsPatch = {
  imageGeneration?: Partial<AiServicesSettings['imageGeneration']>;
  doubao?: Partial<AiServicesSettings['doubao']>;
  processing?: Partial<AiServicesSettings['processing']>;
  vision?: Partial<AiServicesSettings['vision']>;
};

export interface AiServicesUpdateRequest {
  patch: AiServicesSettingsPatch;
  clearSecrets: AiServiceSecretPath[];
}

const SECTION_FIELDS = {
  imageGeneration: new Set(['baseUrl', 'apiKey', 'model', 'lastTest']),
  doubao: new Set(['appId', 'accessKey', 'speaker']),
  processing: new Set(['baseUrl', 'apiKey', 'model']),
  vision: new Set(['endpoint', 'apiKey', 'model', 'family', 'responseFormat']),
} as const;

const SECRET_PATHS = new Set<AiServiceSecretPath>([
  'imageGeneration.apiKey',
  'doubao.accessKey',
  'processing.apiKey',
  'vision.apiKey',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trimmed(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`);
  return value.trim();
}

function normalizeVisionField(field: string, value: unknown): string {
  const normalized = trimmed(value, `vision.${field}`);
  if (field === 'family' && !['', 'qwen3', 'doubao-seed'].includes(normalized)) {
    throw new Error('vision.family 仅支持 qwen3 或 doubao-seed');
  }
  if (field === 'responseFormat' && !['auto', 'none'].includes(normalized)) {
    throw new Error('vision.responseFormat 仅支持 auto 或 none');
  }
  return normalized;
}

function normalizeLastTest(value: unknown): AiServicesSettings['imageGeneration']['lastTest'] {
  if (value === null) return undefined;
  const source = record(value);
  if (!source) throw new Error('imageGeneration.lastTest 必须是对象或 null');
  if (source.status !== 'passed' && source.status !== 'failed') {
    throw new Error('imageGeneration.lastTest.status 无效');
  }
  if (typeof source.message !== 'string') {
    throw new Error('imageGeneration.lastTest.message 必须是字符串');
  }
  if (typeof source.testedAt !== 'number' || !Number.isFinite(source.testedAt) || source.testedAt <= 0) {
    throw new Error('imageGeneration.lastTest.testedAt 无效');
  }
  return {
    status: source.status,
    message: source.message.trim().slice(0, 500),
    testedAt: Math.round(source.testedAt),
  };
}

export function parseAiServicesUpdateRequest(body: unknown): AiServicesUpdateRequest {
  const source = record(body);
  if (!source) throw new Error('请求必须是 JSON 对象');
  for (const key of Object.keys(source)) {
    if (key !== 'patch' && key !== 'clearSecrets') throw new Error(`不支持的请求字段：${key}`);
  }

  const rawPatch = source.patch === undefined ? {} : record(source.patch);
  if (!rawPatch) throw new Error('patch 必须是对象');
  const patch: AiServicesSettingsPatch = {};
  for (const [sectionName, rawSection] of Object.entries(rawPatch)) {
    if (!(sectionName in SECTION_FIELDS)) throw new Error(`不支持的 AI 服务配置：${sectionName}`);
    const section = record(rawSection);
    if (!section) throw new Error(`${sectionName} 必须是对象`);
    const allowedFields = SECTION_FIELDS[sectionName as keyof typeof SECTION_FIELDS];
    const normalizedSection: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(section)) {
      if (!allowedFields.has(field as never)) throw new Error(`不支持的 ${sectionName} 配置项：${field}`);
      normalizedSection[field] = field === 'lastTest'
        ? normalizeLastTest(value)
        : sectionName === 'vision'
          ? normalizeVisionField(field, value)
          : trimmed(value, `${sectionName}.${field}`);
    }
    (patch as Record<string, unknown>)[sectionName] = normalizedSection;
  }

  const rawClearSecrets = source.clearSecrets === undefined ? [] : source.clearSecrets;
  if (!Array.isArray(rawClearSecrets) || rawClearSecrets.some((item) => typeof item !== 'string')) {
    throw new Error('clearSecrets 必须是字符串数组');
  }
  const clearSecrets = rawClearSecrets.map((item) => item.trim()) as AiServiceSecretPath[];
  for (const secretPath of clearSecrets) {
    if (!SECRET_PATHS.has(secretPath)) throw new Error(`不支持清除配置项：${secretPath}`);
  }
  return { patch, clearSecrets: [...new Set(clearSecrets)] };
}

export function mergeAiServicesSettingsPatch(
  current: AiServicesSettings,
  patch: AiServicesSettingsPatch,
  options: { clearSecrets?: readonly AiServiceSecretPath[] } = {},
): AiServicesSettings {
  const next: AiServicesSettings = {
    imageGeneration: { ...current.imageGeneration },
    doubao: { ...current.doubao },
    processing: { ...current.processing },
    vision: { ...current.vision },
  };

  if (patch.imageGeneration) {
    if (Object.hasOwn(patch.imageGeneration, 'baseUrl')) next.imageGeneration.baseUrl = String(patch.imageGeneration.baseUrl || '').trim();
    if (Object.hasOwn(patch.imageGeneration, 'model')) next.imageGeneration.model = String(patch.imageGeneration.model || '').trim();
    if (Object.hasOwn(patch.imageGeneration, 'lastTest')) next.imageGeneration.lastTest = patch.imageGeneration.lastTest;
    const apiKey = String(patch.imageGeneration.apiKey || '').trim();
    if (apiKey) next.imageGeneration.apiKey = apiKey;
  }
  if (patch.doubao) {
    if (Object.hasOwn(patch.doubao, 'appId')) next.doubao.appId = String(patch.doubao.appId || '').trim();
    if (Object.hasOwn(patch.doubao, 'speaker')) next.doubao.speaker = String(patch.doubao.speaker || '').trim();
    const accessKey = String(patch.doubao.accessKey || '').trim();
    if (accessKey) next.doubao.accessKey = accessKey;
  }
  if (patch.processing) {
    if (Object.hasOwn(patch.processing, 'baseUrl')) next.processing.baseUrl = String(patch.processing.baseUrl || '').trim();
    if (Object.hasOwn(patch.processing, 'model')) next.processing.model = String(patch.processing.model || '').trim();
    const apiKey = String(patch.processing.apiKey || '').trim();
    if (apiKey) next.processing.apiKey = apiKey;
  }
  if (patch.vision) {
    if (Object.hasOwn(patch.vision, 'endpoint')) next.vision.endpoint = String(patch.vision.endpoint || '').trim();
    if (Object.hasOwn(patch.vision, 'model')) next.vision.model = String(patch.vision.model || '').trim();
    if (Object.hasOwn(patch.vision, 'family')) {
      next.vision.family = normalizeVisionField('family', patch.vision.family) as AiServicesSettings['vision']['family'];
    }
    if (Object.hasOwn(patch.vision, 'responseFormat')) {
      next.vision.responseFormat = normalizeVisionField(
        'responseFormat',
        patch.vision.responseFormat,
      ) as AiServicesSettings['vision']['responseFormat'];
    }
    const apiKey = String(patch.vision.apiKey || '').trim();
    if (apiKey) next.vision.apiKey = apiKey;
  }

  for (const secretPath of options.clearSecrets || []) {
    if (!SECRET_PATHS.has(secretPath)) throw new Error(`不支持清除配置项：${secretPath}`);
    if (secretPath === 'imageGeneration.apiKey') next.imageGeneration.apiKey = null;
    if (secretPath === 'doubao.accessKey') next.doubao.accessKey = '';
    if (secretPath === 'processing.apiKey') next.processing.apiKey = '';
    if (secretPath === 'vision.apiKey') next.vision.apiKey = '';
  }
  return next;
}

export function maskAiServicesSettings(settings: AiServicesSettings) {
  return {
    imageGeneration: {
      baseUrl: settings.imageGeneration.baseUrl,
      model: settings.imageGeneration.model,
      hasApiKey: Boolean(settings.imageGeneration.apiKey),
      ...(settings.imageGeneration.lastTest ? { lastTest: settings.imageGeneration.lastTest } : {}),
    },
    doubao: {
      appId: settings.doubao.appId,
      speaker: settings.doubao.speaker,
      hasAccessKey: Boolean(settings.doubao.accessKey),
    },
    processing: {
      baseUrl: settings.processing.baseUrl,
      model: settings.processing.model,
      hasApiKey: Boolean(settings.processing.apiKey),
    },
    vision: {
      endpoint: settings.vision.endpoint,
      model: settings.vision.model,
      family: settings.vision.family,
      responseFormat: settings.vision.responseFormat,
      hasApiKey: Boolean(settings.vision.apiKey),
    },
  };
}
