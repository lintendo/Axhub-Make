# Duplicate Make Client Project ID Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow different Make client directories with the same initial client ID to register under sequential IDs while rejecting duplicate filesystem paths and keeping both client identity files synchronized.

**Architecture:** Add a focused server helper for comparable-root lookup and first-available ID allocation. The shared registration path will reject an already registered real path before any file write, resolve an available ID, synchronize the authoritative client marker and derived project metadata, and then persist the registry entry. Existing frontend error formatting will expose the new path-conflict result.

**Tech Stack:** TypeScript 5.x, Node.js filesystem/path APIs, Vitest 4, pnpm.

## Global Constraints

- Use pnpm; do not introduce npm/yarn development commands.
- Preserve React 18.2.0 and TypeScript 5.x; add no dependencies.
- Treat `.axhub/make/client.json` as the sole identity source and `.axhub/make/project.json` as derived metadata.
- Compare real paths case-insensitively on Windows.
- Do not migrate or renumber existing registry entries.
- Do not modify unrelated user changes in the dirty worktree.

---

### Task 1: Comparable project roots and sequential IDs

**Files:**
- Create: `src/server/projectRegistration.ts`
- Create: `src/server/projectRegistration.test.ts`

**Interfaces:**
- Consumes: `resolveComparableProjectRoot(projectRoot: string): string` and `RegisteredProject` from `src/server/projectCore/index.ts`.
- Produces: `findRegisteredProjectByRoot(projects, projectRoot, platform?)` and `allocateRegisteredProjectId(sourceId, isTaken)` for the registry insertion flow.

- [ ] **Step 1: Write failing helper tests**

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { allocateRegisteredProjectId, findRegisteredProjectByRoot } from './projectRegistration';

describe('project registration identity', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds an existing project through its comparable real root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-project-root-'));
    roots.push(root);
    const project = { id: 'demo', name: 'Demo', root, metadataPath: '', createdAt: '', updatedAt: '' };
    expect(findRegisteredProjectByRoot([project], path.join(root, '.'))).toBe(project);
  });

  it('compares Windows roots case-insensitively', () => {
    const project = { id: 'demo', name: 'Demo', root: '/TMP/Project', metadataPath: '', createdAt: '', updatedAt: '' };
    expect(findRegisteredProjectByRoot([project], '/tmp/project', 'win32')).toBe(project);
  });

  it('allocates the first available numeric suffix', () => {
    const ids = new Set(['demo', 'demo-2']);
    expect(allocateRegisteredProjectId('demo', (id) => ids.has(id))).toBe('demo-3');
  });
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `pnpm exec vitest run src/server/projectRegistration.test.ts`

Expected: FAIL because `projectRegistration.ts` does not exist.

- [ ] **Step 3: Implement the focused helpers**

```ts
import { resolveComparableProjectRoot, type RegisteredProject } from './projectCore/index.ts';

function normalizeComparableRoot(projectRoot: string, platform: NodeJS.Platform): string {
  const comparableRoot = resolveComparableProjectRoot(projectRoot);
  return platform === 'win32' ? comparableRoot.toLowerCase() : comparableRoot;
}

export function findRegisteredProjectByRoot(
  projects: RegisteredProject[],
  projectRoot: string,
  platform: NodeJS.Platform = process.platform,
): RegisteredProject | null {
  const targetRoot = normalizeComparableRoot(projectRoot, platform);
  return projects.find((project) => normalizeComparableRoot(project.root, platform) === targetRoot) ?? null;
}

export function allocateRegisteredProjectId(sourceId: string, isTaken: (projectId: string) => boolean): string {
  if (!isTaken(sourceId)) return sourceId;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${sourceId}-${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
}
```

- [ ] **Step 4: Run the helper tests and verify GREEN**

Run: `pnpm exec vitest run src/server/projectRegistration.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the isolated helper task**

```bash
git add src/server/projectRegistration.ts src/server/projectRegistration.test.ts
git commit -m "feat: allocate unique make project registrations"
```

### Task 2: Registration behavior and client identity synchronization

**Files:**
- Create: `src/server/__tests__/projects-registration-api.test.ts`
- Modify: `src/server/projectIdentity.ts`
- Modify: `src/server/managementApi.ts` in `addOrUpdateRegistryProjectByRoot`
- Modify: `src/server/__tests__/projects-api.test.ts` in the existing same-path expectation

**Interfaces:**
- Consumes: Task 1's `findRegisteredProjectByRoot` and `allocateRegisteredProjectId`.
- Produces: `syncProjectIdentitySource(..., { projectId })`, `MAKE_PROJECT_PATH_CONFLICT`, and API behavior returning IDs `demo`, `demo-2`, `demo-3`.

- [ ] **Step 1: Write failing API tests for duplicate paths and sequential IDs**

Create `src/server/__tests__/projects-registration-api.test.ts` with the complete focused coverage:

```ts
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getMakeClientMarkerPath, getProjectMetadataPath } from '../projectCore/index.ts';
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
        prototypes: [{ id: 'home', name: 'home', title: `Home ${index + 1}` }],
        themes: [],
      },
    }));
    const server = await startTestServer(roots[0]);
    try {
      const registrations = [];
      for (const root of roots) registrations.push(await registerExisting(server.origin, root));
      expect(registrations.map(({ response }) => response.status)).toEqual([201, 201, 201]);
      expect(registrations.map(({ payload }) => payload.project.id)).toEqual(['demo', 'demo-2', 'demo-3']);
      expect(readIdentity(roots[1])).toEqual({ markerId: 'demo-2', metadataId: 'demo-2', name: 'Demo' });
      expect(readIdentity(roots[2])).toEqual({ markerId: 'demo-3', metadataId: 'demo-3', name: 'Demo' });

      const list = await fetch(`${server.origin}/api/projects`).then((response) => response.json());
      expect(list.projects.map((project: { id: string }) => project.id)).toEqual(['demo', 'demo-2', 'demo-3']);
      const secondResources = await fetch(`${server.origin}/api/projects/demo-2/resources`).then((response) => response.json());
      const thirdResources = await fetch(`${server.origin}/api/projects/demo-3/resources`).then((response) => response.json());
      expect(secondResources).toMatchObject({ project: { id: 'demo-2' }, resources: { prototypes: [{ title: 'Home 2' }] } });
      expect(thirdResources).toMatchObject({ project: { id: 'demo-3' }, resources: { prototypes: [{ title: 'Home 3' }] } });
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run only the duplicate-path test and verify RED**

Run: `pnpm exec vitest run src/server/__tests__/projects-registration-api.test.ts -t "rejects an already registered real path"`

Expected: FAIL because the current endpoint returns 200.

- [ ] **Step 3: Run only the suffix test and verify RED**

Run: `pnpm exec vitest run src/server/__tests__/projects-registration-api.test.ts -t "suffixes duplicate client ids"`

Expected: FAIL because the second root currently returns `409 MAKE_PROJECT_ID_CONFLICT`.

- [ ] **Step 4: Allow identity synchronization to receive a resolved ID**

Extend the options of `syncProjectIdentitySource`:

```ts
options: {
  metadataPath?: string;
  fallback?: ProjectIdentityFallback;
  projectId?: string;
} = {},
```

Replace the marker branch with:

```ts
if (marker) {
  const normalizedMarker = writeMakeClientMarker(projectRoot, {
    ...marker,
    project: {
      ...marker.project,
      id: stringValue(options.projectId) || marker.project.id,
    },
  });
  const savedMetadata = saveMetadataIdentity(metadataStore, metadata, normalizedMarker.project);
  return {
    identity: {
      id: normalizedMarker.project.id,
      name: normalizedMarker.project.name,
      source: 'make-client',
    },
    metadata: savedMetadata,
  };
}
```

This keeps the marker authoritative and updates only the derived `project` identity inside existing metadata.

- [ ] **Step 5: Replace ID rejection with path rejection and ID allocation**

In `addOrUpdateRegistryProjectByRoot`:

```ts
const projects = registry.listProjects();
const existingByRoot = findRegisteredProjectByRoot(projects, root);
if (existingByRoot) {
  const error = new Error(`Project path already registered: ${root}`) as Error & { code?: string; status?: number };
  error.code = 'MAKE_PROJECT_PATH_CONFLICT';
  error.status = 409;
  throw error;
}
const projectId = allocateRegisteredProjectId(params.id, (candidate) => Boolean(registry.getProject(candidate)));
const { identity } = syncProjectIdentitySource(root, {
  metadataPath: params.metadataPath,
  fallback: params,
  projectId,
});
return registry.addProject({ id: identity.id, name: identity.name, root, metadataPath: params.metadataPath });
```

Import both helpers from `./projectRegistration.ts`. Remove the old `existingById` conflict branch and the same-root update branch.

- [ ] **Step 6: Update the pre-existing same-path API assertion**

Change the duplicate registration assertion in `projects-api.test.ts` from status 200 to:

```ts
expect(duplicate.status).toBe(409);
expect(await duplicate.json()).toMatchObject({ code: 'MAKE_PROJECT_PATH_CONFLICT' });
```

- [ ] **Step 7: Run API tests and verify GREEN**

Run: `pnpm exec vitest run src/server/__tests__/projects-registration-api.test.ts src/server/__tests__/projects-api.test.ts`

Expected: both files pass, including the new focused registration tests and the existing 23 API tests.

- [ ] **Step 8: Commit only task-owned hunks**

Stage the new files and clean identity file normally. Stage only the registration hunk from dirty `managementApi.ts` and only the adjusted assertion from dirty `projects-api.test.ts`, preserving all unrelated worktree changes.

```bash
git commit -m "fix: allow duplicate make client source ids"
```

### Task 3: User-facing path conflict and final verification

**Files:**
- Modify: `src/index/utils/projectSetupErrors.test.ts`
- Modify: `src/index/utils/projectSetupErrors.ts`

**Interfaces:**
- Consumes: service error code `MAKE_PROJECT_PATH_CONFLICT` from Task 2.
- Produces: Chinese UI message `该项目路径已添加`.

- [ ] **Step 1: Write the failing formatter test**

```ts
it('formats an already registered project path', () => {
  expect(formatMakeClientProjectError({
    code: 'MAKE_PROJECT_PATH_CONFLICT',
    error: 'Project path already registered',
  })).toBe('该项目路径已添加');
});
```

- [ ] **Step 2: Run the formatter test and verify RED**

Run: `pnpm exec vitest run src/index/utils/projectSetupErrors.test.ts -t "formats an already registered project path"`

Expected: FAIL with the raw English service error.

- [ ] **Step 3: Add the error mapping**

Add this entry to `MAKE_CLIENT_ERROR_MESSAGES`:

```ts
MAKE_PROJECT_PATH_CONFLICT: '该项目路径已添加',
```

- [ ] **Step 4: Run formatter and registration tests and verify GREEN**

Run: `pnpm exec vitest run src/index/utils/projectSetupErrors.test.ts src/server/projectRegistration.test.ts src/server/__tests__/projects-registration-api.test.ts src/server/__tests__/projects-api.test.ts`

Expected: all selected files pass with zero failures.

- [ ] **Step 5: Run server typechecking**

Run: `pnpm exec tsc --noEmit -p tsconfig.node.json`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 6: Review the final diff and whitespace**

Run: `git diff --check` and inspect diffs only for the plan-owned files/hunks. Confirm no client project fixture or unrelated user change was overwritten.

- [ ] **Step 7: Commit the frontend mapping**

```bash
git add src/index/utils/projectSetupErrors.ts src/index/utils/projectSetupErrors.test.ts
git commit -m "fix: explain duplicate make project paths"
```

- [ ] **Step 8: Request code review and address findings**

Review the implementation against `docs/superpowers/specs/2026-07-28-duplicate-make-client-project-id-registration-design.md`, fix all critical or important findings, and rerun Steps 4–6 before reporting completion.
