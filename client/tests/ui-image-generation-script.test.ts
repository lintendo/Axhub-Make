import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(
  clientRoot,
  '.agents/skills/ui-image-generation/scripts/request-image.mjs',
);

function writeImageConfig(homeDir: string, baseUrl: string, apiKey = 'test-image-key') {
  const configPath = path.join(homeDir, '.axhub/make/server.config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    ai: {
      imageGeneration: {
        baseUrl,
        apiKey,
        model: 'gpt-image-2',
      },
    },
  }));
}

function runScript(args: string[], homeDir: string) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: clientRoot,
      env: {
        ...process.env,
        AXHUB_MAKE_HOME_DIR: homeDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('ui image generation request script', () => {
  it('reads the configured provider and saves a generated image', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-request-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const outputPath = path.join(tempDir, 'generated.png');
    const requests: Array<{
      method?: string;
      url?: string;
      authorization?: string;
      body: unknown;
    }> = [];
    fs.writeFileSync(promptPath, 'Create a production-ready logistics dashboard.');

    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        requests.push({
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          data: [{ b64_json: Buffer.from('generated-image').toString('base64') }],
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    writeImageConfig(tempDir, `http://127.0.0.1:${address.port}/v1`);

    try {
      const result = await runScript([
        '--prompt-file', promptPath,
        '--out', outputPath,
        '--size', '1920x1088',
        '--quality', 'medium',
      ], tempDir);

      expect(result).toEqual({ status: 0, stdout: `${outputPath}\n`, stderr: '' });
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('generated-image');
      expect(requests).toEqual([{
        method: 'POST',
        url: '/v1/images/generations',
        authorization: 'Bearer test-image-key',
        body: {
          model: 'gpt-image-2',
          prompt: 'Create a production-ready logistics dashboard.',
          size: '1920x1088',
          quality: 'medium',
        },
      }]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('uploads repeated reference images with the image request', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-reference-request-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const firstImagePath = path.join(tempDir, 'layout.png');
    const secondImagePath = path.join(tempDir, 'palette.jpg');
    const outputPath = path.join(tempDir, 'generated.png');
    const requests: Array<{
      url?: string;
      authorization?: string;
      contentType?: string;
      body: string;
    }> = [];
    fs.writeFileSync(promptPath, 'Create a new dashboard using these references.');
    fs.writeFileSync(firstImagePath, 'reference-layout');
    fs.writeFileSync(secondImagePath, 'reference-palette');

    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        requests.push({
          url: request.url,
          authorization: request.headers.authorization,
          contentType: request.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          data: [{ b64_json: Buffer.from('referenced-image').toString('base64') }],
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    writeImageConfig(tempDir, `http://127.0.0.1:${address.port}/v1`);

    try {
      const result = await runScript([
        '--prompt-file', promptPath,
        '--image', firstImagePath,
        '--image', secondImagePath,
        '--out', outputPath,
        '--size', '1440x896',
        '--quality', 'high',
      ], tempDir);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('referenced-image');
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe('/v1/images/edits');
      expect(requests[0].authorization).toBe('Bearer test-image-key');
      expect(requests[0].contentType).toMatch(/^multipart\/form-data; boundary=/u);
      expect(requests[0].body.match(/name="image\[\]"/gu)).toHaveLength(2);
      expect(requests[0].body).toContain('name="model"');
      expect(requests[0].body).toContain('gpt-image-2');
      expect(requests[0].body).toContain('name="prompt"');
      expect(requests[0].body).toContain('Create a new dashboard using these references.');
      expect(requests[0].body).toContain('name="size"');
      expect(requests[0].body).toContain('1440x896');
      expect(requests[0].body).toContain('name="quality"');
      expect(requests[0].body).toContain('high');
      expect(requests[0].body).toContain('filename="layout.png"');
      expect(requests[0].body).toContain('reference-layout');
      expect(requests[0].body).toContain('filename="palette.jpg"');
      expect(requests[0].body).toContain('reference-palette');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('saves an image returned as a data URL', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-data-url-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const outputPath = path.join(tempDir, 'generated.png');
    fs.writeFileSync(promptPath, 'Create an image.');

    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        data: [{ url: `data:image/png;base64,${Buffer.from('data-url-image').toString('base64')}` }],
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    writeImageConfig(tempDir, `http://127.0.0.1:${address.port}/v1`);

    try {
      const result = await runScript([
        '--prompt-file', promptPath,
        '--out', outputPath,
      ], tempDir);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('data-url-image');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('downloads an image returned as a remote URL', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-remote-url-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const outputPath = path.join(tempDir, 'generated.png');
    fs.writeFileSync(promptPath, 'Create an image.');

    const server = http.createServer((request, response) => {
      if (request.url === '/result.png') {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end('remote-url-image');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        data: [{ url: `http://${request.headers.host}/result.png` }],
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    writeImageConfig(tempDir, `http://127.0.0.1:${address.port}/v1`);

    try {
      const result = await runScript([
        '--prompt-file', promptPath,
        '--out', outputPath,
      ], tempDir);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('remote-url-image');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('redacts the configured API key from provider errors', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-redaction-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const outputPath = path.join(tempDir, 'generated.png');
    const apiKey = 'secret-image-key';
    fs.writeFileSync(promptPath, 'Create an image.');

    const server = http.createServer((_request, response) => {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: `Credential ${apiKey} was rejected` } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    writeImageConfig(tempDir, `http://127.0.0.1:${address.port}/v1`, apiKey);

    try {
      const result = await runScript([
        '--prompt-file', promptPath,
        '--out', outputPath,
      ], tempDir);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('HTTP 401');
      expect(result.stderr).toContain('[REDACTED]');
      expect(result.stderr).not.toContain(apiKey);
      expect(fs.existsSync(outputPath)).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('does not overwrite an existing output file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-no-overwrite-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const outputPath = path.join(tempDir, 'existing.png');
    fs.writeFileSync(promptPath, 'Create an image.');
    fs.writeFileSync(outputPath, 'original-image');

    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        data: [{ b64_json: Buffer.from('replacement-image').toString('base64') }],
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    writeImageConfig(tempDir, `http://127.0.0.1:${address.port}/v1`);

    try {
      const result = await runScript([
        '--prompt-file', promptPath,
        '--out', outputPath,
      ], tempDir);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Output already exists');
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('original-image');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('stops a provider request after the configured timeout', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-timeout-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const outputPath = path.join(tempDir, 'generated.png');
    fs.writeFileSync(promptPath, 'Create an image.');

    const server = http.createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    writeImageConfig(tempDir, `http://127.0.0.1:${address.port}/v1`);

    try {
      const result = await runScript([
        '--prompt-file', promptPath,
        '--out', outputPath,
        '--timeout-seconds', '0.05',
      ], tempDir);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('timed out after 0.05 seconds');
      expect(fs.existsSync(outputPath)).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('fails before requesting when image provider configuration is incomplete', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-image-incomplete-config-'));
    const promptPath = path.join(tempDir, 'prompt.txt');
    const outputPath = path.join(tempDir, 'generated.png');
    const configPath = path.join(tempDir, '.axhub/make/server.config.json');
    fs.writeFileSync(promptPath, 'Create an image.');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      ai: {
        imageGeneration: {
          baseUrl: 'https://images.example.com/v1',
          apiKey: '',
          model: 'gpt-image-2',
        },
      },
    }));

    const result = await runScript([
      '--prompt-file', promptPath,
      '--out', outputPath,
    ], tempDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Incomplete ai.imageGeneration configuration');
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
