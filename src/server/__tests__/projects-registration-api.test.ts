import fs from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getMakeClientMarkerPath,
  getProjectMetadataPath,
} from '../projectCore/index.ts';
import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers.ts';

async function registerExisting(origin: string, root: string) {
  const response = await fetch(`${origin}/api/projects/make/register-existing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root }),
  });
  return { response, payload: await response.json() };
}

function readIdentity(root: string) {
  const marker = JSON.parse(fs.readFileSync(getMakeClientMarkerPath(root), 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(root), 'utf8'));
  return {
    markerId: marker.project.id,
    metadataId: metadata.project.id,
    name: marker.project.name,
  };
}

afterEach(cleanupProjectApiTestRoots);

describe('Make client project registration identity', () => {
  it('rejects an already registered real path without rewriting identity files', async () => {
    const root = createTempRoot('axhub-register-same-root-');
    writeProjectMetadata(root, { project: { id: 'demo', name: 'Demo' } });
    const server = await startTestServer(root);
    try {
      expect((await registerExisting(server.origin, root)).response.status).toBe(201);
      const markerBefore = fs.readFileSync(getMakeClientMarkerPath(root), 'utf8');
      const metadataBefore = fs.readFileSync(getProjectMetadataPath(root), 'utf8');

      const second = await registerExisting(server.origin, root);
      expect(second.response.status).toBe(409);
      expect(second.payload).toMatchObject({ code: 'MAKE_PROJECT_PATH_CONFLICT', root });
      expect(fs.readFileSync(getMakeClientMarkerPath(root), 'utf8')).toBe(markerBefore);
      expect(fs.readFileSync(getProjectMetadataPath(root), 'utf8')).toBe(metadataBefore);
    } finally {
      await server.close();
    }
  });

  it('suffixes duplicate client ids and preserves independent project scopes', async () => {
    const roots = [
      createTempRoot('axhub-register-id-a-'),
      createTempRoot('axhub-register-id-b-'),
      createTempRoot('axhub-register-id-c-'),
    ];
    roots.forEach((root, index) => writeProjectMetadata(root, {
      project: { id: 'demo', name: 'Demo' },
      resources: {
        prototypes: [{
          id: 'home',
          name: 'home',
          title: `Home ${index + 1}`,
          clientUrl: '/prototypes/home',
        }],
        themes: [],
      },
    }));
    const server = await startTestServer(roots[0]);
    try {
      const registrations = [];
      for (const root of roots) {
        registrations.push(await registerExisting(server.origin, root));
      }
      expect(registrations.map(({ response }) => response.status)).toEqual([201, 201, 201]);
      expect(registrations.map(({ payload }) => payload.project.id)).toEqual(['demo', 'demo-2', 'demo-3']);
      expect(readIdentity(roots[1])).toEqual({ markerId: 'demo-2', metadataId: 'demo-2', name: 'Demo' });
      expect(readIdentity(roots[2])).toEqual({ markerId: 'demo-3', metadataId: 'demo-3', name: 'Demo' });

      const list = await fetch(`${server.origin}/api/projects`).then((response) => response.json());
      expect(list.projects.map((project: { id: string }) => project.id)).toEqual(['demo', 'demo-2', 'demo-3']);
      const secondResources = await fetch(`${server.origin}/api/projects/demo-2/resources`).then((response) => response.json());
      const thirdResources = await fetch(`${server.origin}/api/projects/demo-3/resources`).then((response) => response.json());
      expect(secondResources).toMatchObject({
        project: { id: 'demo-2' },
        resources: { prototypes: [{ title: 'Home 2' }] },
      });
      expect(thirdResources).toMatchObject({
        project: { id: 'demo-3' },
        resources: { prototypes: [{ title: 'Home 3' }] },
      });
      const activeUpdate = await fetch(`${server.origin}/api/projects/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'demo-2' }),
      }).then((response) => response.json());
      expect(activeUpdate.activeProject).toMatchObject({ id: 'demo-2', root: roots[1] });
    } finally {
      await server.close();
    }
  });
});
