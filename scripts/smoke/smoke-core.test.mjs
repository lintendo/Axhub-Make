import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  JOURNEY_DEFINITIONS,
  buildProjectApiUrl,
  createSmokeOptions,
  createSmokeReportPath,
  shouldUseRealAi,
  startMockAcpServer,
} from './smoke-core.mjs';

describe('make smoke runner configuration', () => {
  it('builds explicitly project-scoped Admin API URLs', () => {
    assert.equal(
      buildProjectApiUrl('http://127.0.0.1:53817', '/api/git/diff?path=prototypes%2Fhome', 'smoke-client'),
      'http://127.0.0.1:53817/api/git/diff?path=prototypes%2Fhome&projectId=smoke-client',
    );
  });

  it('keeps the critical Make journeys enabled by default', () => {
    assert.deepEqual(
      JOURNEY_DEFINITIONS.map((journey) => journey.id),
      [
        'assistant-chat',
        'create-prototype-and-image',
        'canvas-ai-generation',
        'comments-and-execution',
        'make-project-registration',
        'export-and-cloud-publish',
        'library-imports',
        'resource-crud',
        'git-versioning',
        'review-and-design-decisions',
      ],
    );
  });

  it('writes generated smoke reports under the ignored .local test-results tree', () => {
    const options = createSmokeOptions({
      argv: [],
      env: {},
      cwd: '/repo/apps/axhub-make',
      now: new Date('2026-06-06T12:34:56.789Z'),
    });

    assert.equal(
      options.reportDir,
      path.resolve('/repo/apps/axhub-make', '../../.local/test-results/axhub-make-smoke'),
    );
    assert.equal(
      createSmokeReportPath(options),
      path.resolve('/repo/apps/axhub-make', '../../.local/test-results/axhub-make-smoke/smoke-2026-06-06T12-34-56-789Z.json'),
    );
  });

  it('enables real AI only when explicitly requested', () => {
    assert.equal(shouldUseRealAi({ env: {}, argv: [] }), false);
    assert.equal(shouldUseRealAi({ env: { AXHUB_SMOKE_REAL_AI: '1' }, argv: [] }), true);
    assert.equal(shouldUseRealAi({ env: {}, argv: ['--real-ai'] }), true);
    assert.equal(shouldUseRealAi({ env: { AXHUB_SMOKE_REAL_AI: '1' }, argv: ['--mock-ai'] }), false);
  });

  it('exposes a browser-compatible CORS preflight from the mock ACP server', async () => {
    const server = await startMockAcpServer();
    try {
      const origin = 'http://127.0.0.1:53817';
      const response = await fetch(`${server.origin}/api/chat`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.match(response.headers.get('access-control-allow-methods') || '', /POST/iu);
      assert.match(response.headers.get('access-control-allow-headers') || '', /content-type/iu);
    } finally {
      await server.close();
    }
  });
});
