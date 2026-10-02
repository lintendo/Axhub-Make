import fs from 'node:fs';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getGlobalServerConfigPath,
  getGlobalServerSecretsPath,
} from '../projectCore/index.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

afterEach(() => cleanupProjectApiTestRoots());

describe('Make AI services settings API', () => {
  it('shares masked settings, preserves blank secrets, and clears only explicit paths', async () => {
    const projectA = createTempRoot('axhub-make-ai-services-a-');
    const projectB = createTempRoot('axhub-make-ai-services-b-');
    const registryHome = createTempRoot('axhub-make-ai-services-home-');
    writeProjectMetadata(projectA, { project: { id: 'ai-services-a', name: 'AI Services A' } });
    writeProjectMetadata(projectB, { project: { id: 'ai-services-b', name: 'AI Services B' } });
    const server = await startTestServer(projectA, registryHome);

    try {
      await registerProject(server.origin, projectA, 'ai-services-a', 'AI Services A');
      await registerProject(server.origin, projectB, 'ai-services-b', 'AI Services B');

      const configUrl = scopeProjectApiUrl(projectA, `${server.origin}/api/config/ai-services`);
      const savedResponse = await fetch(configUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
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
              family: 'qwen3',
              responseFormat: 'auto',
            },
          },
        }),
      });
      const savedText = await savedResponse.text();

      expect(savedResponse.status).toBe(200);
      for (const secret of ['image-secret', 'doubao-secret', 'processing-secret', 'vision-secret']) {
        expect(savedText).not.toContain(secret);
      }
      expect(JSON.parse(savedText)).toEqual({
        settings: {
          imageGeneration: {
            baseUrl: 'https://images.example/v1',
            model: 'image-model',
            hasApiKey: true,
          },
          doubao: { appId: 'doubao-app', speaker: 'speaker-1', hasAccessKey: true },
          processing: {
            baseUrl: 'https://tasks.example/v1',
            model: 'task-model',
            hasApiKey: true,
          },
          vision: {
            endpoint: 'https://vision.example/v1/chat/completions',
            model: 'vision-model',
            family: 'qwen3',
            responseFormat: 'auto',
            hasApiKey: true,
          },
        },
      });

      const publicConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
      expect(JSON.stringify(publicConfig)).not.toContain('secret');
      expect(publicConfig.ai.imageGeneration).not.toHaveProperty('apiKey');
      expect(publicConfig.ai.doubao).not.toHaveProperty('accessKey');

      const secretsPath = getGlobalServerSecretsPath(registryHome);
      const secretsBeforeBlankUpdate = fs.readFileSync(secretsPath, 'utf8');
      expect(JSON.parse(secretsBeforeBlankUpdate).ai).toEqual({
        imageGeneration: { apiKey: 'image-secret' },
        doubao: { accessKey: 'doubao-secret' },
        processing: { apiKey: 'processing-secret' },
        vision: { apiKey: 'vision-secret' },
      });

      const genericConfigResponse = await fetch(scopeProjectApiUrl(
        projectA,
        `${server.origin}/api/config`,
      ), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai: {
            imageGeneration: {
              apiKey: 'generic-route-secret',
              model: 'generic-route-model',
            },
          },
        }),
      });
      expect(genericConfigResponse.status).toBe(200);
      const afterGenericWrite = await fetch(configUrl).then((response) => response.json());
      expect(afterGenericWrite.settings.imageGeneration).toMatchObject({
        model: 'image-model',
        hasApiKey: true,
      });
      expect(JSON.parse(fs.readFileSync(secretsPath, 'utf8')).ai.imageGeneration.apiKey).toBe('image-secret');

      const blankResponse = await fetch(configUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            imageGeneration: { apiKey: '' },
            processing: { apiKey: '   ' },
          },
        }),
      });
      expect(blankResponse.status).toBe(200);
      expect(JSON.parse(fs.readFileSync(secretsPath, 'utf8')).ai).toEqual({
        imageGeneration: { apiKey: 'image-secret' },
        doubao: { accessKey: 'doubao-secret' },
        processing: { apiKey: 'processing-secret' },
        vision: { apiKey: 'vision-secret' },
      });

      const clearResponse = await fetch(configUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearSecrets: ['processing.apiKey'] }),
      });
      expect(clearResponse.status).toBe(200);
      expect((await clearResponse.json()).settings.processing.hasApiKey).toBe(false);
      expect(JSON.parse(fs.readFileSync(secretsPath, 'utf8')).ai.processing.apiKey).toBe('');

      const projectBResponse = await fetch(scopeProjectApiUrl(
        projectB,
        `${server.origin}/api/config/ai-services`,
      ));
      const projectBText = await projectBResponse.text();
      expect(projectBResponse.status).toBe(200);
      expect(projectBText).not.toContain('image-secret');
      expect(JSON.parse(projectBText).settings.imageGeneration.hasApiKey).toBe(true);

      const invalidClear = await fetch(configUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearSecrets: ['cloudPublishing.vercel.token'] }),
      });
      expect(invalidClear.status).toBe(400);

      const unsupportedVisionFamily = await fetch(configUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: { vision: { family: 'gemini' } },
        }),
      });
      expect(unsupportedVisionFamily.status).toBe(400);
      expect(await unsupportedVisionFamily.json()).toMatchObject({
        error: 'vision.family 仅支持 qwen3 或 doubao-seed',
      });

      const unsupportedResponseFormat = await fetch(configUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: { vision: { responseFormat: 'json-schema' } },
        }),
      });
      expect(unsupportedResponseFormat.status).toBe(400);
      expect(await unsupportedResponseFormat.json()).toMatchObject({
        error: 'vision.responseFormat 仅支持 auto 或 none',
      });

      const oldRoute = await fetch(scopeProjectApiUrl(
        projectA,
        `${server.origin}/api/config/voice-assistant`,
      ));
      expect(oldRoute.status).toBe(404);
      const oldImageTestRoute = await fetch(scopeProjectApiUrl(
        projectA,
        `${server.origin}/api/config/ai-image/test`,
      ));
      expect(oldImageTestRoute.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('tests an unsaved processing draft with the saved secret without persisting the draft', async () => {
    const projectRoot = createTempRoot('axhub-make-ai-services-test-project-');
    const registryHome = createTempRoot('axhub-make-ai-services-test-home-');
    writeProjectMetadata(projectRoot, { project: { id: 'ai-services-test', name: 'AI Services Test' } });
    const providerRequests: Array<{ authorization: string; body: any }> = [];
    const provider = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const authorization = String(request.headers.authorization || '');
        providerRequests.push({ authorization, body });
        response.setHeader('Content-Type', 'application/json');
        if (body.model === 'draft-model') {
          response.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
          return;
        }
        response.statusCode = 401;
        response.end(JSON.stringify({ error: { message: `provider rejected ${authorization}` } }));
      });
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    const providerAddress = provider.address();
    if (!providerAddress || typeof providerAddress === 'string') throw new Error('Provider test server did not bind');
    const providerBaseUrl = `http://127.0.0.1:${providerAddress.port}/v1`;
    const server = await startTestServer(projectRoot, registryHome);

    try {
      await registerProject(server.origin, projectRoot, 'ai-services-test', 'AI Services Test');
      const configUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/ai-services`);
      const saveResponse = await fetch(configUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            processing: {
              baseUrl: providerBaseUrl,
              apiKey: 'saved-key',
              model: 'saved-model',
            },
          },
        }),
      });
      expect(saveResponse.status).toBe(200);

      const secretsPath = getGlobalServerSecretsPath(registryHome);
      const publicPath = getGlobalServerConfigPath(registryHome);
      const savedSecretsBeforeTest = fs.readFileSync(secretsPath, 'utf8');
      const savedPublicBeforeTest = fs.readFileSync(publicPath, 'utf8');
      const testUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/ai-services/test`);

      const successResponse = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'processing',
          patch: { processing: { apiKey: '', model: 'draft-model' } },
        }),
      });
      const successText = await successResponse.text();
      expect(successResponse.status).toBe(200);
      expect(successText).not.toContain('saved-key');
      expect(JSON.parse(successText)).toEqual({
        success: true,
        message: '网页任务配置连接成功',
      });
      expect(providerRequests[0]).toMatchObject({
        authorization: 'Bearer saved-key',
        body: { model: 'draft-model' },
      });

      const failureResponse = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'processing',
          patch: { processing: { apiKey: 'draft-key', model: 'failure-model' } },
        }),
      });
      const failureText = await failureResponse.text();
      expect(failureResponse.status).toBe(502);
      expect(failureText).not.toContain('saved-key');
      expect(failureText).not.toContain('draft-key');
      expect(providerRequests[1]?.authorization).toBe('Bearer draft-key');
      expect(fs.readFileSync(secretsPath, 'utf8')).toBe(savedSecretsBeforeTest);
      expect(fs.readFileSync(publicPath, 'utf8')).toBe(savedPublicBeforeTest);
    } finally {
      await server.close();
      await new Promise<void>((resolve, reject) => provider.close((error) => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });
});
