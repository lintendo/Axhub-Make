import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getGlobalServerSecretsPath } from './paths.ts';
import {
  createServerSecretsStore,
  type MakeServerSecrets,
} from './server-secrets.ts';

const tempHomes: string[] = [];

function createTempHome(): string {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-server-secrets-'));
  tempHomes.push(homeDir);
  return homeDir;
}

function populatedSecrets(): MakeServerSecrets {
  return {
    version: 1,
    ai: {
      imageGeneration: { apiKey: 'image-secret' },
      doubao: { accessKey: 'doubao-secret' },
      processing: { apiKey: 'processing-secret' },
      vision: { apiKey: 'vision-secret' },
    },
    cloudPublishing: {
      vercel: { token: 'vercel-secret' },
      cloudflarePages: { apiToken: 'cloudflare-secret' },
      s3: {
        accessKeyId: 's3-access-key',
        secretAccessKey: 's3-secret',
      },
    },
    accessControl: {
      lanPassword: {
        passwordHash: 'password-hash',
        salt: 'password-salt',
        secret: 'signing-secret',
        updatedAt: '2026-08-28T00:00:00.000Z',
      },
    },
  };
}

afterEach(() => {
  for (const homeDir of tempHomes.splice(0)) {
    fs.rmSync(homeDir, { force: true, recursive: true });
  }
});

describe('Make unified server secrets store', () => {
  it('returns the complete version 1 schema when no file exists', () => {
    const store = createServerSecretsStore({ homeDir: createTempHome() });

    expect(store.getSecrets()).toEqual({
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
    });
  });

  it('replaces secrets atomically and writes the file with private permissions', () => {
    const homeDir = createTempHome();
    const store = createServerSecretsStore({ homeDir });

    expect(store.replaceSecrets(populatedSecrets())).toEqual(populatedSecrets());

    const secretsPath = getGlobalServerSecretsPath(homeDir);
    expect(JSON.parse(fs.readFileSync(secretsPath, 'utf8'))).toEqual(populatedSecrets());
    if (process.platform !== 'win32') {
      expect(fs.statSync(secretsPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(secretsPath)).mode & 0o777).toBe(0o700);
    }
    expect(fs.readdirSync(path.dirname(secretsPath)).filter((name) => name.includes('.tmp-'))).toEqual([]);
  });

  it('updates only supported secret paths and clears secrets explicitly', () => {
    const store = createServerSecretsStore({ homeDir: createTempHome() });
    store.replaceSecrets(populatedSecrets());

    const updated = store.updateSecrets({
      'ai.vision.apiKey': 'next-vision-secret',
      'cloudPublishing.s3.accessKeyId': 'next-access-key',
    }, {
      clearSecrets: ['ai.doubao.accessKey'],
    });

    expect(updated.ai.vision.apiKey).toBe('next-vision-secret');
    expect(updated.ai.doubao.accessKey).toBe('');
    expect(updated.ai.processing.apiKey).toBe('processing-secret');
    expect(updated.cloudPublishing.s3.accessKeyId).toBe('next-access-key');
    expect(updated.cloudPublishing.s3.secretAccessKey).toBe('s3-secret');

    expect(() => store.updateSecrets({
      'ai.unknown.apiKey': 'not-allowed',
    } as never)).toThrow(/不支持的敏感配置项/u);
  });

  it('rejects unsupported schema versions instead of guessing', () => {
    const homeDir = createTempHome();
    const secretsPath = getGlobalServerSecretsPath(homeDir);
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
    fs.writeFileSync(secretsPath, JSON.stringify({ version: 2 }));

    expect(() => createServerSecretsStore({ homeDir }).getSecrets()).toThrow(/不支持的敏感配置版本/u);
  });

  it('rejects unknown fields and non-string secret values', () => {
    const unknownFieldHome = createTempHome();
    const unknownFieldPath = getGlobalServerSecretsPath(unknownFieldHome);
    writeSecretsFile(unknownFieldPath, {
      version: 1,
      ai: {
        vision: {
          apiKey: 'vision-secret',
          fallbackApiKey: 'not-supported',
        },
      },
    });

    expect(() => createServerSecretsStore({ homeDir: unknownFieldHome }).getSecrets())
      .toThrow(/不支持的敏感配置项/u);

    const invalidValueHome = createTempHome();
    const invalidValuePath = getGlobalServerSecretsPath(invalidValueHome);
    writeSecretsFile(invalidValuePath, {
      version: 1,
      cloudPublishing: {
        vercel: { token: 123 },
      },
    });

    expect(() => createServerSecretsStore({ homeDir: invalidValueHome }).getSecrets())
      .toThrow(/必须是字符串/u);
  });
});

function writeSecretsFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}
