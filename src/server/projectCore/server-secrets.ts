import fs from 'node:fs';
import path from 'node:path';

import { getGlobalServerSecretsPath } from './paths.ts';

export type MakeServerSecretPath =
  | 'ai.imageGeneration.apiKey'
  | 'ai.doubao.accessKey'
  | 'ai.processing.apiKey'
  | 'ai.vision.apiKey'
  | 'cloudPublishing.vercel.token'
  | 'cloudPublishing.cloudflarePages.apiToken'
  | 'cloudPublishing.s3.accessKeyId'
  | 'cloudPublishing.s3.secretAccessKey'
  | 'accessControl.lanPassword.passwordHash'
  | 'accessControl.lanPassword.salt'
  | 'accessControl.lanPassword.secret'
  | 'accessControl.lanPassword.updatedAt';

export interface MakeServerSecrets {
  version: 1;
  ai: {
    imageGeneration: { apiKey: string };
    doubao: { accessKey: string };
    processing: { apiKey: string };
    vision: { apiKey: string };
  };
  cloudPublishing: {
    vercel: { token: string };
    cloudflarePages: { apiToken: string };
    s3: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
  accessControl: {
    lanPassword: {
      passwordHash: string;
      salt: string;
      secret: string;
      updatedAt: string;
    };
  };
}

export interface ServerSecretsStore {
  getSecrets(): MakeServerSecrets;
  replaceSecrets(next: MakeServerSecrets): MakeServerSecrets;
  updateSecrets(
    updates: Partial<Record<MakeServerSecretPath, string>>,
    options?: { clearSecrets?: readonly MakeServerSecretPath[] },
  ): MakeServerSecrets;
  getSecretsPath(): string;
}

function createDefaultSecrets(): MakeServerSecrets {
  return {
    version: 1,
    ai: {
      imageGeneration: { apiKey: '' },
      doubao: { accessKey: '' },
      processing: { apiKey: '' },
      vision: { apiKey: '' },
    },
    cloudPublishing: {
      vercel: { token: '' },
      cloudflarePages: { apiToken: '' },
      s3: { accessKeyId: '', secretAccessKey: '' },
    },
    accessControl: {
      lanPassword: {
        passwordHash: '',
        salt: '',
        secret: '',
        updatedAt: '',
      },
    },
  };
}

function exactSection(
  value: unknown,
  label: string,
  allowedFields: readonly string[],
): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`敏感配置 ${label} 必须是对象`);
  }
  const source = value as Record<string, unknown>;
  for (const field of Object.keys(source)) {
    if (!allowedFields.includes(field)) {
      throw new Error(`不支持的敏感配置项：${label}.${field}`);
    }
  }
  return source;
}

function secretText(value: unknown, label: string): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new Error(`敏感配置 ${label} 必须是字符串`);
  return value.trim();
}

function normalizeSecrets(value: unknown): MakeServerSecrets {
  const source = exactSection(value, 'root', ['version', 'ai', 'cloudPublishing', 'accessControl']);
  if (source.version !== 1) {
    throw new Error(`不支持的敏感配置版本：${String(source.version)}`);
  }
  const ai = exactSection(source.ai, 'ai', ['imageGeneration', 'doubao', 'processing', 'vision']);
  const imageGeneration = exactSection(ai.imageGeneration, 'ai.imageGeneration', ['apiKey']);
  const doubao = exactSection(ai.doubao, 'ai.doubao', ['accessKey']);
  const processing = exactSection(ai.processing, 'ai.processing', ['apiKey']);
  const vision = exactSection(ai.vision, 'ai.vision', ['apiKey']);
  const cloudPublishing = exactSection(
    source.cloudPublishing,
    'cloudPublishing',
    ['vercel', 'cloudflarePages', 's3'],
  );
  const vercel = exactSection(cloudPublishing.vercel, 'cloudPublishing.vercel', ['token']);
  const cloudflarePages = exactSection(
    cloudPublishing.cloudflarePages,
    'cloudPublishing.cloudflarePages',
    ['apiToken'],
  );
  const s3 = exactSection(
    cloudPublishing.s3,
    'cloudPublishing.s3',
    ['accessKeyId', 'secretAccessKey'],
  );
  const accessControl = exactSection(source.accessControl, 'accessControl', ['lanPassword']);
  const lanPassword = exactSection(
    accessControl.lanPassword,
    'accessControl.lanPassword',
    ['passwordHash', 'salt', 'secret', 'updatedAt'],
  );

  return {
    version: 1,
    ai: {
      imageGeneration: { apiKey: secretText(imageGeneration.apiKey, 'ai.imageGeneration.apiKey') },
      doubao: { accessKey: secretText(doubao.accessKey, 'ai.doubao.accessKey') },
      processing: { apiKey: secretText(processing.apiKey, 'ai.processing.apiKey') },
      vision: { apiKey: secretText(vision.apiKey, 'ai.vision.apiKey') },
    },
    cloudPublishing: {
      vercel: { token: secretText(vercel.token, 'cloudPublishing.vercel.token') },
      cloudflarePages: {
        apiToken: secretText(cloudflarePages.apiToken, 'cloudPublishing.cloudflarePages.apiToken'),
      },
      s3: {
        accessKeyId: secretText(s3.accessKeyId, 'cloudPublishing.s3.accessKeyId'),
        secretAccessKey: secretText(s3.secretAccessKey, 'cloudPublishing.s3.secretAccessKey'),
      },
    },
    accessControl: {
      lanPassword: {
        passwordHash: secretText(lanPassword.passwordHash, 'accessControl.lanPassword.passwordHash'),
        salt: secretText(lanPassword.salt, 'accessControl.lanPassword.salt'),
        secret: secretText(lanPassword.secret, 'accessControl.lanPassword.secret'),
        updatedAt: secretText(lanPassword.updatedAt, 'accessControl.lanPassword.updatedAt'),
      },
    },
  };
}

function writeSecretsAtomic(secretsPath: string, secrets: MakeServerSecrets): void {
  const secretsDir = path.dirname(secretsPath);
  fs.mkdirSync(secretsDir, { mode: 0o700, recursive: true });
  if (process.platform !== 'win32') fs.chmodSync(secretsDir, 0o700);
  const temporaryPath = `${secretsPath}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(secrets, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, secretsPath);
    if (process.platform !== 'win32') fs.chmodSync(secretsPath, 0o600);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function setSecretValue(
  secrets: MakeServerSecrets,
  secretPath: string,
  value: string,
): void {
  switch (secretPath as MakeServerSecretPath) {
    case 'ai.imageGeneration.apiKey':
      secrets.ai.imageGeneration.apiKey = value;
      return;
    case 'ai.doubao.accessKey':
      secrets.ai.doubao.accessKey = value;
      return;
    case 'ai.processing.apiKey':
      secrets.ai.processing.apiKey = value;
      return;
    case 'ai.vision.apiKey':
      secrets.ai.vision.apiKey = value;
      return;
    case 'cloudPublishing.vercel.token':
      secrets.cloudPublishing.vercel.token = value;
      return;
    case 'cloudPublishing.cloudflarePages.apiToken':
      secrets.cloudPublishing.cloudflarePages.apiToken = value;
      return;
    case 'cloudPublishing.s3.accessKeyId':
      secrets.cloudPublishing.s3.accessKeyId = value;
      return;
    case 'cloudPublishing.s3.secretAccessKey':
      secrets.cloudPublishing.s3.secretAccessKey = value;
      return;
    case 'accessControl.lanPassword.passwordHash':
      secrets.accessControl.lanPassword.passwordHash = value;
      return;
    case 'accessControl.lanPassword.salt':
      secrets.accessControl.lanPassword.salt = value;
      return;
    case 'accessControl.lanPassword.secret':
      secrets.accessControl.lanPassword.secret = value;
      return;
    case 'accessControl.lanPassword.updatedAt':
      secrets.accessControl.lanPassword.updatedAt = value;
      return;
    default:
      throw new Error(`不支持的敏感配置项：${secretPath}`);
  }
}

export function createServerSecretsStore(
  options: { homeDir?: string; secretsPath?: string } = {},
): ServerSecretsStore {
  const secretsPath = options.secretsPath || getGlobalServerSecretsPath(options.homeDir);

  return {
    getSecrets() {
      if (!fs.existsSync(secretsPath)) return createDefaultSecrets();
      return normalizeSecrets(JSON.parse(fs.readFileSync(secretsPath, 'utf8')));
    },
    replaceSecrets(next) {
      const normalized = normalizeSecrets(next);
      writeSecretsAtomic(secretsPath, normalized);
      return normalized;
    },
    updateSecrets(updates, updateOptions = {}) {
      const next = this.getSecrets();
      for (const [secretPath, value] of Object.entries(updates)) {
        setSecretValue(next, secretPath, secretText(value, secretPath));
      }
      for (const secretPath of updateOptions.clearSecrets || []) {
        setSecretValue(next, secretPath, '');
      }
      return this.replaceSecrets(next);
    },
    getSecretsPath() {
      return secretsPath;
    },
  };
}
