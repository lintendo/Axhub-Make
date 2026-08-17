import fs from 'node:fs';
import path from 'node:path';

import { getGlobalVoiceAssistantSettingsPath } from './paths.ts';

export { getGlobalVoiceAssistantSettingsPath } from './paths.ts';

export type VoiceAssistantSecretPath =
  | 'doubao.accessKey'
  | 'processing.apiKey'
  | 'vision.apiKey';

export interface VoiceAssistantSettings {
  doubao: {
    appId: string;
    accessKey: string;
    speaker: string;
  };
  processing: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  vision: {
    endpoint: string;
    apiKey: string;
    model: string;
  };
}

export interface VoiceAssistantSettingsPublic {
  doubao: {
    appId: string;
    speaker: string;
    hasAccessKey: boolean;
  };
  processing: {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
  };
  vision: {
    endpoint: string;
    model: string;
    hasApiKey: boolean;
  };
}

export type VoiceAssistantSettingsPatch = {
  doubao?: Partial<VoiceAssistantSettings['doubao']>;
  processing?: Partial<VoiceAssistantSettings['processing']>;
  vision?: Partial<VoiceAssistantSettings['vision']>;
};

const DEFAULT_SETTINGS: VoiceAssistantSettings = {
  doubao: {
    appId: '',
    accessKey: '',
    speaker: '',
  },
  processing: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
  },
  vision: {
    endpoint: '',
    apiKey: '',
    model: '',
  },
};

const SECRET_PATHS = new Set<VoiceAssistantSecretPath>([
  'doubao.accessKey',
  'processing.apiKey',
  'vision.apiKey',
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  return host === 'localhost'
    || host === '::1'
    || host === '0:0:0:0:0:0:0:1'
    || /^127(?:\.\d{1,3}){3}$/u.test(host);
}

function normalizeHttpEndpoint(value: unknown, label: string, fallback = ''): string {
  const raw = text(value, fallback);
  if (!raw) return '';

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label}不是有效 URL`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label}不能包含账号、密码或 fragment`);
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname))) {
    throw new Error(`${label}必须使用 HTTPS；本机 loopback 地址可使用 HTTP`);
  }
  return parsed.toString().replace(/\/$/u, parsed.pathname === '/' ? '' : '/');
}

function normalizeSettings(value: unknown): VoiceAssistantSettings {
  const source = record(value);
  const doubao = record(source.doubao);
  const processing = record(source.processing);
  const vision = record(source.vision);
  return {
    doubao: {
      appId: text(doubao.appId),
      accessKey: text(doubao.accessKey),
      speaker: text(doubao.speaker),
    },
    processing: {
      baseUrl: normalizeHttpEndpoint(
        processing.baseUrl,
        '网页任务 API Base URL',
        DEFAULT_SETTINGS.processing.baseUrl,
      ),
      apiKey: text(processing.apiKey),
      model: text(processing.model, DEFAULT_SETTINGS.processing.model),
    },
    vision: {
      endpoint: normalizeHttpEndpoint(vision.endpoint, '视觉 API Endpoint'),
      apiKey: text(vision.apiKey),
      model: text(vision.model),
    },
  };
}

function cloneDefaults(): VoiceAssistantSettings {
  return {
    doubao: { ...DEFAULT_SETTINGS.doubao },
    processing: { ...DEFAULT_SETTINGS.processing },
    vision: { ...DEFAULT_SETTINGS.vision },
  };
}

export function readVoiceAssistantSettings(
  options: { homeDir?: string } = {},
): VoiceAssistantSettings {
  const settingsPath = getGlobalVoiceAssistantSettingsPath(options.homeDir);
  if (!fs.existsSync(settingsPath)) return cloneDefaults();
  const source = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  return normalizeSettings(source);
}

export function maskVoiceAssistantSettings(
  settings: VoiceAssistantSettings,
): VoiceAssistantSettingsPublic {
  return {
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
      hasApiKey: Boolean(settings.vision.apiKey),
    },
  };
}

function applyPatch(
  current: VoiceAssistantSettings,
  patch: VoiceAssistantSettingsPatch,
): VoiceAssistantSettings {
  const next: VoiceAssistantSettings = {
    doubao: { ...current.doubao },
    processing: { ...current.processing },
    vision: { ...current.vision },
  };

  if (patch.doubao) {
    if (Object.hasOwn(patch.doubao, 'appId')) next.doubao.appId = text(patch.doubao.appId);
    if (Object.hasOwn(patch.doubao, 'speaker')) next.doubao.speaker = text(patch.doubao.speaker);
    if (text(patch.doubao.accessKey)) next.doubao.accessKey = text(patch.doubao.accessKey);
  }
  if (patch.processing) {
    if (Object.hasOwn(patch.processing, 'baseUrl')) {
      next.processing.baseUrl = normalizeHttpEndpoint(
        patch.processing.baseUrl,
        '网页任务 API Base URL',
        DEFAULT_SETTINGS.processing.baseUrl,
      );
    }
    if (Object.hasOwn(patch.processing, 'model')) next.processing.model = text(patch.processing.model);
    if (text(patch.processing.apiKey)) next.processing.apiKey = text(patch.processing.apiKey);
  }
  if (patch.vision) {
    if (Object.hasOwn(patch.vision, 'endpoint')) {
      next.vision.endpoint = normalizeHttpEndpoint(patch.vision.endpoint, '视觉 API Endpoint');
    }
    if (Object.hasOwn(patch.vision, 'model')) next.vision.model = text(patch.vision.model);
    if (text(patch.vision.apiKey)) next.vision.apiKey = text(patch.vision.apiKey);
  }
  return normalizeSettings(next);
}

function clearVoiceSecret(settings: VoiceAssistantSettings, secretPath: VoiceAssistantSecretPath): void {
  if (!SECRET_PATHS.has(secretPath)) throw new Error(`不支持清除配置项：${secretPath}`);
  if (secretPath === 'doubao.accessKey') settings.doubao.accessKey = '';
  if (secretPath === 'processing.apiKey') settings.processing.apiKey = '';
  if (secretPath === 'vision.apiKey') settings.vision.apiKey = '';
}

export function mergeVoiceAssistantSettingsPatch(
  current: VoiceAssistantSettings,
  patch: VoiceAssistantSettingsPatch,
  options: { clearSecrets?: readonly VoiceAssistantSecretPath[] } = {},
): VoiceAssistantSettings {
  const next = applyPatch(current, patch);
  for (const secretPath of options.clearSecrets || []) clearVoiceSecret(next, secretPath);
  return next;
}

export function writeVoiceAssistantSettingsPatch(
  patch: VoiceAssistantSettingsPatch,
  options: {
    clearSecrets?: readonly VoiceAssistantSecretPath[];
    homeDir?: string;
  } = {},
): VoiceAssistantSettings {
  const current = readVoiceAssistantSettings({ homeDir: options.homeDir });
  const next = mergeVoiceAssistantSettingsPatch(current, patch, {
    clearSecrets: options.clearSecrets,
  });

  const settingsPath = getGlobalVoiceAssistantSettingsPath(options.homeDir);
  const settingsDir = path.dirname(settingsPath);
  fs.mkdirSync(settingsDir, { mode: 0o700, recursive: true });
  const temporaryPath = `${settingsPath}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, settingsPath);
    fs.chmodSync(settingsPath, 0o600);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return next;
}
