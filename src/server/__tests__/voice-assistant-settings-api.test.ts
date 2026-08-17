import fs from 'node:fs';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { getGlobalVoiceAssistantSettingsPath } from '../projectCore/index.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

afterEach(() => cleanupProjectApiTestRoots());

describe('Make voice assistant settings API', () => {
  it('shares masked global settings across projects without exposing secrets', async () => {
    const projectA = createTempRoot('axhub-make-voice-project-a-');
    const projectB = createTempRoot('axhub-make-voice-project-b-');
    const registryHome = createTempRoot('axhub-make-voice-home-');
    writeProjectMetadata(projectA, { project: { id: 'voice-a', name: 'Voice A' } });
    writeProjectMetadata(projectB, { project: { id: 'voice-b', name: 'Voice B' } });
    const server = await startTestServer(projectA, registryHome);

    try {
      await registerProject(server.origin, projectA, 'voice-a', 'Voice A');
      await registerProject(server.origin, projectB, 'voice-b', 'Voice B');

      const savedResponse = await fetch(scopeProjectApiUrl(
        projectA,
        `${server.origin}/api/config/voice-assistant`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            doubao: {
              appId: 'app-1',
              accessKey: 'doubao-secret',
              speaker: 'voice-1',
              appKey: 'removed-secret',
              resourceId: 'removed-resource',
              realtimeUrl: 'wss://removed.example',
            },
            processing: {
              baseUrl: 'https://api.example.com/v1',
              apiKey: 'processing-secret',
              model: 'model-1',
            },
          },
        }),
      });
      const savedText = await savedResponse.text();
      expect(savedResponse.status).toBe(200);
      expect(savedText).not.toContain('doubao-secret');
      expect(savedText).not.toContain('processing-secret');
      expect(savedText).not.toContain('removed-secret');
      expect(JSON.parse(savedText)).toEqual({
        settings: {
          doubao: { appId: 'app-1', speaker: 'voice-1', hasAccessKey: true },
          processing: {
            baseUrl: 'https://api.example.com/v1',
            model: 'model-1',
            hasApiKey: true,
          },
          vision: { endpoint: '', model: '', hasApiKey: false },
        },
      });

      const projectBResponse = await fetch(scopeProjectApiUrl(
        projectB,
        `${server.origin}/api/config/voice-assistant`,
      ));
      const projectBText = await projectBResponse.text();
      expect(projectBResponse.status).toBe(200);
      expect(projectBText).not.toContain('secret');
      expect(JSON.parse(projectBText).settings.doubao).toEqual({
        appId: 'app-1',
        speaker: 'voice-1',
        hasAccessKey: true,
      });

      const stored = JSON.parse(fs.readFileSync(
        getGlobalVoiceAssistantSettingsPath(registryHome),
        'utf8',
      ));
      expect(stored.doubao.accessKey).toBe('doubao-secret');
      expect(stored.doubao).not.toHaveProperty('appKey');
      expect(stored.doubao).not.toHaveProperty('resourceId');
      expect(stored.doubao).not.toHaveProperty('realtimeUrl');
      expect(fs.statSync(getGlobalVoiceAssistantSettingsPath(registryHome)).mode & 0o777).toBe(0o600);
    } finally {
      await server.close();
    }
  });

  it('tests unsaved processing drafts with saved credentials without persisting them', async () => {
    const projectRoot = createTempRoot('axhub-make-voice-test-project-');
    const registryHome = createTempRoot('axhub-make-voice-test-home-');
    writeProjectMetadata(projectRoot, { project: { id: 'voice-test', name: 'Voice Test' } });
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
      await registerProject(server.origin, projectRoot, 'voice-test', 'Voice Test');
      const configUrl = scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/config/voice-assistant`,
      );
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
      const settingsPath = getGlobalVoiceAssistantSettingsPath(registryHome);
      const savedBeforeTests = fs.readFileSync(settingsPath, 'utf8');
      const testUrl = scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/config/voice-assistant/test`,
      );

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
      expect(fs.readFileSync(settingsPath, 'utf8')).toBe(savedBeforeTests);

      const methodResponse = await fetch(testUrl);
      expect(methodResponse.status).toBe(405);
    } finally {
      await server.close();
      await new Promise<void>((resolve, reject) => provider.close((error) => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });
});
