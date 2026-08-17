import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  registerProject,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers';
import { resolvePromptExecutionAcpConfig } from '../managementApi.assistantIde.ts';

async function startRegisteredTestServer(projectRoot: string) {
  const server = await startTestServer(projectRoot, createTempRoot('axhub-make-obsolete-exec-home-'));
  try {
    const projectId = String(JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'project.json'), 'utf8'))?.project?.id || path.basename(projectRoot));
    await registerProject(server.origin, projectRoot, projectId, projectId);
    return server;
  } catch (error) {
    await server.close();
    throw error;
  }
}

afterEach(() => {
  cleanupProjectApiTestRoots();
});

describe('obsolete prompt execution APIs', () => {
  it('does not keep the obsolete acpx spawn executor after migrating execution to ACP chat', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../acpxPromptExecutor.ts'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, '../acpxPromptExecutor.js'))).toBe(false);
  });

  it('keeps the canvas prototype generation config helper for existing settings migration', () => {
    expect(resolvePromptExecutionAcpConfig('canvas-prototype-generation', {
      mode: 'prompt',
      permission: 'approve-all',
      timeout: 1800,
    })).toEqual({
      permission: 'approve-all',
      timeout: 600,
      ttl: 30,
    });

    expect(resolvePromptExecutionAcpConfig('fix-tests', {
      mode: 'prompt',
      timeout: 1800,
    })).toEqual({
      mode: 'prompt',
      timeout: 1800,
    });
  });

  it('returns 404 for deleted execution endpoints', async () => {
    const projectRoot = createTempRoot('axhub-make-obsolete-exec-');
    writeProjectMetadata(projectRoot, {
      project: { id: 'obsolete-exec-client', name: 'Obsolete Exec Client' },
    });
    const server = await startRegisteredTestServer(projectRoot);

    try {
      const [promptExecute, sessionRun] = await Promise.all([
        fetch(`${server.origin}/api/prompt/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: 'obsolete-exec-client', prompt: 'run' }),
        }),
        fetch(`${server.origin}/api/prototype-generation/session-run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: 'obsolete-exec-client', prompt: 'run' }),
        }),
      ]);

      expect(promptExecute.status).toBe(404);
      expect(sessionRun.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
