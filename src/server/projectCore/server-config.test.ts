import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getGlobalServerConfigPath,
  getGlobalServerSecretsPath,
} from './paths.ts';
import { createServerConfigStore } from './server-config.ts';
import { createServerSecretsStore } from './server-secrets.ts';

const tempHomes: string[] = [];

function createTempHome(): string {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-server-config-'));
  tempHomes.push(homeDir);
  return homeDir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(() => {
  for (const homeDir of tempHomes.splice(0)) {
    fs.rmSync(homeDir, { force: true, recursive: true });
  }
});

describe('Make server public and secret configuration boundary', () => {
  it('ignores legacy secret fields found in the public configuration file', () => {
    const homeDir = createTempHome();
    writeJson(getGlobalServerConfigPath(homeDir), {
      ai: {
        imageGeneration: {
          baseUrl: 'https://images.example/v1',
          apiKey: 'legacy-image-secret',
          model: 'image-model',
        },
        doubao: {
          appId: 'public-app-id',
          accessKey: 'legacy-doubao-secret',
          speaker: 'public-speaker',
        },
      },
      cloudPublishing: {
        vercel: {
          token: 'legacy-vercel-secret',
          projectName: 'public-project',
        },
      },
      accessControl: {
        lanPassword: {
          algorithm: 'scrypt',
          passwordHash: 'aabb',
          salt: 'ccdd',
          secret: 'eeff',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
      },
    });

    const config = createServerConfigStore({ homeDir }).getConfig();

    expect(config.ai.imageGeneration).toMatchObject({
      baseUrl: 'https://images.example/v1',
      apiKey: null,
      model: 'image-model',
    });
    expect(config.ai.doubao).toEqual({
      appId: 'public-app-id',
      accessKey: '',
      speaker: 'public-speaker',
    });
    expect(config.cloudPublishing.vercel).toEqual({
      token: '',
      projectName: 'public-project',
      teamId: '',
    });
    expect(config.accessControl.lanPassword).toEqual({
      algorithm: 'scrypt',
      passwordHash: null,
      salt: null,
      secret: '',
      updatedAt: null,
    });
  });

  it('composes the effective server configuration from public fields and the secret store', () => {
    const homeDir = createTempHome();
    writeJson(getGlobalServerConfigPath(homeDir), {
      ai: {
        imageGeneration: {
          baseUrl: 'https://images.example/v1',
          model: 'image-model',
        },
        processing: {
          baseUrl: 'https://tasks.example/v1',
          model: 'task-model',
        },
        vision: {
          endpoint: 'https://vision.example/v1/chat/completions',
          model: 'vision-model',
        },
      },
      cloudPublishing: {
        s3: {
          region: 'cn-test-1',
          bucket: 'public-bucket',
        },
      },
    });
    createServerSecretsStore({ homeDir }).replaceSecrets({
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
        s3: { accessKeyId: 's3-access', secretAccessKey: 's3-secret' },
      },
      accessControl: {
        lanPassword: {
          passwordHash: 'aabb',
          salt: 'ccdd',
          secret: 'eeff',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
      },
    });

    const config = createServerConfigStore({ homeDir }).getConfig();

    expect(config.ai.imageGeneration.apiKey).toBe('image-secret');
    expect(config.ai.doubao.accessKey).toBe('doubao-secret');
    expect(config.ai.processing).toEqual({
      baseUrl: 'https://tasks.example/v1',
      apiKey: 'processing-secret',
      model: 'task-model',
    });
    expect(config.ai.vision.apiKey).toBe('vision-secret');
    expect(config.cloudPublishing.s3).toMatchObject({
      accessKeyId: 's3-access',
      secretAccessKey: 's3-secret',
      region: 'cn-test-1',
      bucket: 'public-bucket',
    });
    expect(config.accessControl.lanPassword.passwordHash).toBe('aabb');
  });

  it('splits public fields and secrets when saving effective configuration', () => {
    const homeDir = createTempHome();
    const store = createServerConfigStore({ homeDir });

    const saved = store.saveConfig({
      ai: {
        imageGeneration: {
          baseUrl: 'https://images.example/v1',
          apiKey: 'image-secret',
          model: 'image-model',
        },
        doubao: {
          appId: 'doubao-app',
          accessKey: 'doubao-secret',
          speaker: 'speaker-1',
        },
        processing: {
          baseUrl: 'https://tasks.example/v1',
          apiKey: 'processing-secret',
          model: 'task-model',
        },
        vision: {
          endpoint: 'https://vision.example/v1/chat/completions',
          apiKey: 'vision-secret',
          model: 'vision-model',
        },
      },
      cloudPublishing: {
        vercel: { token: 'vercel-secret', projectName: 'public-project' },
        cloudflarePages: { apiToken: 'cloudflare-secret', accountId: 'public-account' },
        s3: {
          accessKeyId: 's3-access',
          secretAccessKey: 's3-secret',
          region: 'cn-test-1',
          bucket: 'public-bucket',
        },
      },
      accessControl: {
        lanPassword: {
          algorithm: 'scrypt',
          passwordHash: 'aabb',
          salt: 'ccdd',
          secret: 'eeff',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
      },
    } as never);

    expect(saved.ai.vision.apiKey).toBe('vision-secret');

    const publicConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(homeDir), 'utf8'));
    expect(publicConfig.ai.imageGeneration).not.toHaveProperty('apiKey');
    expect(publicConfig.ai.doubao).not.toHaveProperty('accessKey');
    expect(publicConfig.ai.processing).not.toHaveProperty('apiKey');
    expect(publicConfig.ai.vision).not.toHaveProperty('apiKey');
    expect(publicConfig.cloudPublishing.vercel).not.toHaveProperty('token');
    expect(publicConfig.cloudPublishing.cloudflarePages).not.toHaveProperty('apiToken');
    expect(publicConfig.cloudPublishing.s3).not.toHaveProperty('accessKeyId');
    expect(publicConfig.cloudPublishing.s3).not.toHaveProperty('secretAccessKey');
    expect(publicConfig).not.toHaveProperty('accessControl');
    expect(JSON.stringify(publicConfig)).not.toContain('secret');

    const secrets = JSON.parse(fs.readFileSync(getGlobalServerSecretsPath(homeDir), 'utf8'));
    expect(secrets).toMatchObject({
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
        s3: { accessKeyId: 's3-access', secretAccessKey: 's3-secret' },
      },
      accessControl: {
        lanPassword: {
          passwordHash: 'aabb',
          salt: 'ccdd',
          secret: 'eeff',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
      },
    });
  });
});
