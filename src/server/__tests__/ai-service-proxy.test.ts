import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  scopeProjectApiUrl,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';

afterEach(() => cleanupProjectApiTestRoots());

describe('Make AI service proxies', () => {
  it('uses server-owned vision credentials and returns the fallback contract when incomplete', async () => {
    const projectRoot = createTempRoot('axhub-make-vision-proxy-project-');
    const registryHome = createTempRoot('axhub-make-vision-proxy-home-');
    writeProjectMetadata(projectRoot, { project: { id: 'vision-proxy', name: 'Vision Proxy' } });
    const providerRequests: Array<{ authorization: string; body: any }> = [];
    const provider = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        providerRequests.push({
          authorization: String(request.headers.authorization || ''),
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            regions: [{ id: 'asset-1', bounds: { left: 100, top: 200, right: 400, bottom: 500 }, confidence: 0.98 }],
          }) } }],
        }));
      });
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    const providerAddress = provider.address();
    if (!providerAddress || typeof providerAddress === 'string') throw new Error('Provider did not bind');
    const server = await startTestServer(projectRoot, registryHome);

    try {
      await registerProject(server.origin, projectRoot, 'vision-proxy', 'Vision Proxy');
      const proxyUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/ai/vision/analyze`);
      const requestBody = {
        prompt: '完整检查整张图片（含状态栏）。',
        image: { mimeType: 'image/png', base64: Buffer.from('image-bytes').toString('base64') },
        kind: 'assets',
        timeoutSeconds: 30,
      };

      const incompleteResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      expect(incompleteResponse.status).toBe(409);
      expect(await incompleteResponse.json()).toMatchObject({
        status: 'fallback-required',
        fallback: 'current-agent',
        reason: 'vision-config-incomplete',
        regions: [],
      });

      const configResponse = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/config/ai-services`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            vision: {
              endpoint: `http://127.0.0.1:${providerAddress.port}/v1`,
              apiKey: 'vision-proxy-secret',
              model: 'qwen3.5-plus',
              family: 'qwen3',
              responseFormat: 'auto',
            },
          },
        }),
      });
      expect(configResponse.status).toBe(200);

      const proxyResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const proxyText = await proxyResponse.text();

      expect(proxyResponse.status).toBe(200);
      expect(proxyText).not.toContain('vision-proxy-secret');
      expect(JSON.parse(proxyText)).toMatchObject({
        status: 'completed',
        provider: 'visual-api',
        model: 'qwen3.5-plus',
        family: 'qwen3',
        responseFormat: 'auto',
        kind: 'assets',
        ocrSubmitted: false,
        regions: [{ id: 'asset-1', bounds: { left: 100, top: 200, right: 400, bottom: 500 } }],
      });
      expect(providerRequests).toHaveLength(1);
      expect(providerRequests[0].authorization).toBe('Bearer vision-proxy-secret');
      expect(providerRequests[0].body).toMatchObject({
        model: 'qwen3.5-plus',
        response_format: { type: 'json_object' },
        enable_thinking: false,
      });
      expect(providerRequests[0].body).not.toHaveProperty('thinking');
      expect(JSON.stringify(providerRequests[0].body)).toContain('data:image/png;base64,');

      const doubaoConfigResponse = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/config/ai-services`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            vision: {
              model: 'doubao-seed-2-0-lite',
              family: 'doubao-seed',
              responseFormat: 'none',
            },
          },
        }),
      });
      expect(doubaoConfigResponse.status).toBe(200);

      const doubaoProxyResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      expect(doubaoProxyResponse.status).toBe(200);
      expect(providerRequests).toHaveLength(2);
      expect(providerRequests[1].body).toMatchObject({
        model: 'doubao-seed-2-0-lite',
        thinking: { type: 'disabled' },
      });
      expect(providerRequests[1].body).not.toHaveProperty('response_format');
      expect(providerRequests[1].body).not.toHaveProperty('enable_thinking');
    } finally {
      await server.close();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    }
  });

  it('uses server-owned image credentials for generation and reference-image edits', async () => {
    const projectRoot = createTempRoot('axhub-make-image-proxy-project-');
    const registryHome = createTempRoot('axhub-make-image-proxy-home-');
    writeProjectMetadata(projectRoot, { project: { id: 'image-proxy', name: 'Image Proxy' } });
    const providerRequests: Array<{
      url: string;
      authorization: string;
      contentType: string;
      body: string;
    }> = [];
    const provider = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        providerRequests.push({
          url: String(request.url || ''),
          authorization: String(request.headers.authorization || ''),
          contentType: String(request.headers['content-type'] || ''),
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({
          data: [{ b64_json: Buffer.from('generated-image').toString('base64') }],
          debug: 'provider used image-proxy-secret',
        }));
      });
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    const providerAddress = provider.address();
    if (!providerAddress || typeof providerAddress === 'string') throw new Error('Provider did not bind');
    const server = await startTestServer(projectRoot, registryHome);

    try {
      await registerProject(server.origin, projectRoot, 'image-proxy', 'Image Proxy');
      const configResponse = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/config/ai-services`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            imageGeneration: {
              baseUrl: `http://127.0.0.1:${providerAddress.port}/v1`,
              apiKey: 'image-proxy-secret',
              model: 'gpt-image-2',
            },
          },
        }),
      });
      expect(configResponse.status).toBe(200);

      const proxyUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/ai/image/generate`);
      const generationResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Generate dashboard', size: '1440x896', quality: 'high' }),
      });
      const generationText = await generationResponse.text();
      expect(generationResponse.status).toBe(200);
      expect(generationText).not.toContain('image-proxy-secret');
      expect(JSON.parse(generationText).data[0].b64_json).toBe(Buffer.from('generated-image').toString('base64'));

      const editResponse = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Edit dashboard',
          images: [{ fileName: 'reference.png', mimeType: 'image/png', base64: Buffer.from('reference-image').toString('base64') }],
        }),
      });
      expect(editResponse.status).toBe(200);
      expect(providerRequests).toHaveLength(2);
      expect(providerRequests[0]).toMatchObject({
        url: '/v1/images/generations',
        authorization: 'Bearer image-proxy-secret',
        contentType: 'application/json',
      });
      expect(JSON.parse(providerRequests[0].body)).toMatchObject({
        model: 'gpt-image-2',
        prompt: 'Generate dashboard',
        size: '1440x896',
        quality: 'high',
      });
      expect(providerRequests[1].url).toBe('/v1/images/edits');
      expect(providerRequests[1].authorization).toBe('Bearer image-proxy-secret');
      expect(providerRequests[1].contentType).toMatch(/^multipart\/form-data; boundary=/u);
      expect(providerRequests[1].body).toContain('filename="reference.png"');
      expect(providerRequests[1].body).toContain('reference-image');
    } finally {
      await server.close();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    }
  });
});
