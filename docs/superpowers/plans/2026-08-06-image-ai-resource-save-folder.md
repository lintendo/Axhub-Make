# Image AI Resource Save Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open image AI at 50% viewport width and bind its per-image save action to the selected resource folder, a selected resource file's parent folder, or an idempotent default `images` folder.

**Architecture:** Resolve the relative target folder in a pure browser helper, then ask the Make server to validate and ensure that folder under `src/resources`. The server returns the canonical tree node and absolute directory, which the page selects in the Resources sidebar and injects into ACP UI as transient `saveDirectory` runtime configuration before opening image AI.

**Tech Stack:** React 18.2, TypeScript 5.x, Vite/Vitest, Node.js filesystem APIs, Axhub Make workspace management API, ACP UI `acp.runtime.configure` postMessage bridge.

## Global Constraints

- Use pnpm for development and verification commands.
- Preserve React 18.2.0 and TypeScript 5.x compatibility.
- Do not add a new dependency.
- Keep `savePathPattern` semantics unchanged; `saveDirectory` is transient image-playground configuration only.
- Resource paths are project-relative, use forward-slash canonical form, and must remain inside `src/resources` on macOS and Windows.
- Do not revert, overwrite, or reorder unrelated user changes in the dirty worktree.

---

## File Structure

- Create `src/index/domains/assistant/imageAiResourceTarget.ts`: pure selected-resource-to-folder resolver.
- Create `src/index/domains/assistant/imageAiResourceTarget.test.ts`: direct target-resolution coverage.
- Modify `src/server/managementApi.workspace.ts`: validated idempotent `PUT` behavior for the existing navigation-folders route.
- Modify `src/server/__tests__/projects-resource-tree-api.test.ts`: filesystem API creation, reuse, and validation coverage.
- Modify `src/index/services/sidebar.api.ts`: typed `ensureSidebarFolder` client method.
- Modify `src/index/services/sidebar.api.test.ts`: request contract coverage.
- Modify `src/index/app/index-page/useIndexPageResourceActions.tsx`: prepare and select the canonical image-AI folder.
- Modify `src/index/app/index-page/useIndexPageResourceActions.test.ts`: source-level orchestration boundary coverage.
- Modify `src/index/domains/assistant/assistantAcpContext.ts`: emit and sign `saveDirectory`.
- Modify `src/index/domains/assistant/assistantAcpContext.test.ts`: runtime payload and signature coverage.
- Modify `src/index/domains/assistant/hooks/useAssistantPanelController.tsx`: accept the transient directory and initialize image AI width to 50%.
- Modify `src/index/domains/assistant/hooks/useAssistantPanelController.test.ts`: controller contract coverage.
- Modify `src/index/app/IndexPage.tsx`: resolve, prepare, configure, and open in the required order.
- Modify `src/index/app/IndexPage.test.ts`: page workflow coverage.

---

### Task 1: Resolve the image AI target folder

**Files:**
- Create: `src/index/domains/assistant/imageAiResourceTarget.ts`
- Create: `src/index/domains/assistant/imageAiResourceTarget.test.ts`

**Interfaces:**
- Consumes: `SidebarTab`, `SelectedResourceFolder`, and the path-bearing subset of `ItemData`.
- Produces: `resolveImageAiResourceTargetFolder(params): string`, returning a canonical non-empty folder relative to `src/resources`.

- [ ] **Step 1: Write the failing resolver tests**

```ts
expect(resolveImageAiResourceTargetFolder({
  sidebarTab: 'document',
  selectedFolder: { id: 'folder-docs-brand', title: 'brand', path: 'brand', treeTab: 'docs' },
  selectedResource: null,
})).toBe('brand');

expect(resolveImageAiResourceTargetFolder({
  sidebarTab: 'document',
  selectedFolder: null,
  selectedResource: { filePath: 'src/resources/brand/icons/logo.svg' },
})).toBe('brand/icons');

expect(resolveImageAiResourceTargetFolder({
  sidebarTab: 'document',
  selectedFolder: null,
  selectedResource: { filePath: 'src\\resources\\research\\brief.md' },
})).toBe('research');

expect(resolveImageAiResourceTargetFolder({
  sidebarTab: 'document',
  selectedFolder: null,
  selectedResource: { filePath: 'src/resources/cover.png' },
})).toBe('images');

expect(resolveImageAiResourceTargetFolder({
  sidebarTab: 'prototype',
  selectedFolder: null,
  selectedResource: null,
})).toBe('images');
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `pnpm exec vitest run src/index/domains/assistant/imageAiResourceTarget.test.ts`

Expected: FAIL because `imageAiResourceTarget.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure resolver**

```ts
const DEFAULT_IMAGE_AI_RESOURCE_FOLDER = 'images';

function normalizeResourceRelativePath(value: unknown): string {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const marker = 'src/resources/';
  const markerIndex = normalized.indexOf(marker);
  return markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
}

export function resolveImageAiResourceTargetFolder(params: ResolveImageAiResourceTargetFolderParams): string {
  if (params.sidebarTab !== 'document') return DEFAULT_IMAGE_AI_RESOURCE_FOLDER;
  const folderPath = params.selectedFolder?.treeTab === 'docs'
    ? normalizeResourceRelativePath(params.selectedFolder.folderPath || params.selectedFolder.path)
    : '';
  if (folderPath) return folderPath;
  const resourcePath = normalizeResourceRelativePath(
    params.selectedResource?.filePath
      || params.selectedResource?.resourceId
      || params.selectedResource?.name,
  );
  const separatorIndex = resourcePath.lastIndexOf('/');
  return separatorIndex > 0
    ? resourcePath.slice(0, separatorIndex)
    : DEFAULT_IMAGE_AI_RESOURCE_FOLDER;
}
```

- [ ] **Step 4: Run the resolver test and verify GREEN**

Run: `pnpm exec vitest run src/index/domains/assistant/imageAiResourceTarget.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the resolver**

```bash
git add src/index/domains/assistant/imageAiResourceTarget.ts src/index/domains/assistant/imageAiResourceTarget.test.ts
git commit -m "feat: resolve image AI resource folders"
```

---

### Task 2: Ensure a named resource folder on the Make server

**Files:**
- Modify: `src/server/managementApi.workspace.ts`
- Modify: `src/server/__tests__/projects-resource-tree-api.test.ts`
- Modify: `src/index/services/sidebar.api.ts`
- Modify: `src/index/services/sidebar.api.test.ts`

**Interfaces:**
- Consumes: `PUT /api/workspace/navigation/folders?tab=docs` with JSON `{ folderPath: string }`.
- Produces: `{ success, tab, version, tree, folder, absolutePath, created }`, where `folder` is the canonical `SidebarTreeNode` and `absolutePath` is server-local.
- Produces: `sidebarApi.ensureSidebarFolder(folderPath, scope): Promise<EnsureSidebarFolderResponse>`.

- [ ] **Step 1: Add failing server tests**

Add one test that sends `folderPath: 'images'` twice and asserts:

```ts
expect(firstResponse.status).toBe(201);
expect(firstBody.created).toBe(true);
expect(firstBody.folder).toMatchObject({
  id: 'folder-docs-images',
  kind: 'folder',
  path: 'images',
  folderPath: 'images',
});
expect(firstBody.absolutePath).toBe(path.join(projectRoot, 'src/resources/images'));
expect(secondResponse.status).toBe(200);
expect(secondBody.created).toBe(false);
expect(secondBody.absolutePath).toBe(firstBody.absolutePath);
expect(fs.readdirSync(path.join(projectRoot, 'src/resources')).filter((name) => name === 'images')).toHaveLength(1);
```

Add unsafe-path cases for `../outside`, `/absolute`, `C:\\absolute`, and a file collision at `src/resources/images`, expecting 400 for unsafe input and 409 for a non-directory collision.

- [ ] **Step 2: Run the server test and verify RED**

Run: `pnpm exec vitest run src/server/__tests__/projects-resource-tree-api.test.ts`

Expected: FAIL because the route has no `PUT` ensure behavior.

- [ ] **Step 3: Implement validated idempotent ensure behavior**

Add a recursive folder-node finder and an ensure helper:

```ts
function findResourceFolderNode(nodes: SidebarTreeNode[], folderPath: string): SidebarTreeNode | null {
  for (const node of nodes) {
    if (node.kind !== 'folder') continue;
    if (normalizeResourceRelativePath(node.folderPath || node.path) === folderPath) return node;
    const nested = findResourceFolderNode(node.children || [], folderPath);
    if (nested) return nested;
  }
  return null;
}

function ensureResourceFolder(resourceRoot: string, value: unknown) {
  const raw = String(value || '').trim();
  const folderPath = normalizeResourceRelativePath(raw);
  if (!folderPath || /^[a-zA-Z]:[\\/]/u.test(raw) || raw.startsWith('\\\\')) {
    return { ok: false as const, status: 400, error: 'Invalid resource folder path' };
  }
  const absolutePath = resolveResourcePath(resourceRoot, folderPath);
  if (!absolutePath) return { ok: false as const, status: 400, error: 'Invalid resource folder path' };
  if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
    return { ok: false as const, status: 409, error: 'Resource folder path is not a directory' };
  }
  const created = !fs.existsSync(absolutePath);
  fs.mkdirSync(absolutePath, { recursive: true });
  const tree = scanResourceSidebarTree(resourceRoot);
  const folder = findResourceFolderNode(tree, folderPath);
  if (!folder) return { ok: false as const, status: 500, error: 'Resource folder was not found after creation' };
  return { ok: true as const, folderPath, absolutePath, folder, tree, created };
}
```

Handle only `PUT` + `tab=docs` with filesystem resources; keep existing `POST` semantics unchanged. Send 201 when created and 200 when reused.

- [ ] **Step 4: Add the failing sidebar client test**

```ts
await sidebarApi.ensureSidebarFolder('brand/images', scope);

expect(fetchMock).toHaveBeenCalledWith(
  '/api/workspace/navigation/folders?tab=docs&projectId=project-b',
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: 'brand/images' }),
  },
);
```

- [ ] **Step 5: Implement the typed sidebar client**

```ts
interface EnsureSidebarFolderResponse extends SidebarTreeResponse {
  success: boolean;
  folder: SidebarTreeNode;
  absolutePath: string;
  created: boolean;
}

async ensureSidebarFolder(folderPath: string, scope: ProjectScope): Promise<EnsureSidebarFolderResponse> {
  const response = await fetch(withProjectScope(`${WORKSPACE_API_ROUTES.navigationFolders}?tab=docs`, scope), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  return parseJsonResponse<EnsureSidebarFolderResponse>(response, '准备图片保存文件夹失败');
}
```

- [ ] **Step 6: Run server and sidebar client tests and verify GREEN**

Run: `pnpm exec vitest run src/server/__tests__/projects-resource-tree-api.test.ts src/index/services/sidebar.api.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the ensure API**

```bash
git add src/server/managementApi.workspace.ts src/server/__tests__/projects-resource-tree-api.test.ts src/index/services/sidebar.api.ts src/index/services/sidebar.api.test.ts
git commit -m "feat: ensure image save resource folders"
```

---

### Task 3: Prepare and select the canonical resource folder

**Files:**
- Modify: `src/index/app/index-page/useIndexPageResourceActions.tsx`
- Modify: `src/index/app/index-page/useIndexPageResourceActions.test.ts`

**Interfaces:**
- Consumes: `sidebarApi.ensureSidebarFolder(folderPath, requireProjectScope(activeProjectId))`.
- Produces: `prepareImageAiResourceFolder(folderPath): Promise<{ folder: SelectedResourceFolder; absolutePath: string } | null>`.

- [ ] **Step 1: Add a failing source contract test**

Assert the resource action calls `ensureSidebarFolder`, installs the returned docs tree, calls `handleSelectResourceFolder(response.folder, 'docs')`, and returns the absolute path. Also assert the failure path calls `messageApi.error` and returns `null`.

- [ ] **Step 2: Run the resource action test and verify RED**

Run: `pnpm exec vitest run src/index/app/index-page/useIndexPageResourceActions.test.ts`

Expected: FAIL because `prepareImageAiResourceFolder` is absent.

- [ ] **Step 3: Implement the preparation action**

```ts
const prepareImageAiResourceFolder = useCallback(async (folderPath: string) => {
  try {
    const response = await sidebarApi.ensureSidebarFolder(folderPath, requireProjectScope(activeProjectId));
    const items = getSidebarTabItems('docs');
    const nextTree = sanitizeSidebarTree('docs', response.tree || [], items);
    setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, docs: nextTree }));
    handleSelectResourceFolder(response.folder, 'docs');
    return {
      folder: toSelectedResourceFolder(response.folder, 'docs'),
      absolutePath: response.absolutePath,
    };
  } catch (error: any) {
    messageApi.error(error?.message || '准备图片保存文件夹失败');
    return null;
  }
}, [activeProjectId, getSidebarTabItems, handleSelectResourceFolder, messageApi, setSidebarTrees]);
```

Expose `prepareImageAiResourceFolder` from the hook result.

- [ ] **Step 4: Run the resource action test and verify GREEN**

Run: `pnpm exec vitest run src/index/app/index-page/useIndexPageResourceActions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit folder preparation**

```bash
git add src/index/app/index-page/useIndexPageResourceActions.tsx src/index/app/index-page/useIndexPageResourceActions.test.ts
git commit -m "feat: select image AI save folders"
```

---

### Task 4: Carry `saveDirectory` through ACP runtime configuration

**Files:**
- Modify: `src/index/domains/assistant/assistantAcpContext.ts`
- Modify: `src/index/domains/assistant/assistantAcpContext.test.ts`

**Interfaces:**
- Consumes: `AssistantImageGenerationConfig.saveDirectory?: string | null`.
- Produces: `builtinToolSettings['image-generation'].saveDirectory` and a secret-safe signature that changes when the directory changes.

- [ ] **Step 1: Add failing adapter assertions**

```ts
const message = buildAcpImageGenerationPostMessage({
  baseUrl: 'https://api.images.example.com/v1',
  apiKey: 'sk-image',
  model: 'gpt-image-2',
  saveDirectory: ' /workspace/src/resources/brand ',
});
expect(message.payload.builtinToolSettings['image-generation']).toMatchObject({
  saveDirectory: '/workspace/src/resources/brand',
});

expect(getAcpImageGenerationConfigSignature({ ...base, saveDirectory: '/a' }))
  .not.toEqual(getAcpImageGenerationConfigSignature({ ...base, saveDirectory: '/b' }));
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `pnpm exec vitest run src/index/domains/assistant/assistantAcpContext.test.ts`

Expected: FAIL because `saveDirectory` is neither typed nor emitted.

- [ ] **Step 3: Implement payload and signature support**

Add `saveDirectory?: string | null` to the interface, normalize it with `normalizeOptionalPostMessageString`, and spread it into both the real payload and signature payload:

```ts
const saveDirectory = normalizeOptionalPostMessageString(config?.saveDirectory);
const imageGenerationSettings = {
  // existing fields
  ...(saveDirectory ? { saveDirectory } : {}),
};
```

- [ ] **Step 4: Run the adapter test and verify GREEN**

Run: `pnpm exec vitest run src/index/domains/assistant/assistantAcpContext.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit runtime configuration support**

```bash
git add src/index/domains/assistant/assistantAcpContext.ts src/index/domains/assistant/assistantAcpContext.test.ts
git commit -m "feat: configure image AI save directories"
```

---

### Task 5: Orchestrate image AI opening and initialize 50% width

**Files:**
- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.tsx`
- Modify: `src/index/domains/assistant/hooks/useAssistantPanelController.test.ts`
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/IndexPage.test.ts`

**Interfaces:**
- Consumes: `imageAiSaveDirectory?: string | null` in `useAssistantPanelController`.
- Consumes: `resources.prepareImageAiResourceFolder(targetFolder)` and `resolveImageAiResourceTargetFolder(...)`.
- Produces: image AI opens only after the folder is prepared, with a runtime config containing the absolute directory and initial width equal to `getAssistantPanelMaxWidth()`.

- [ ] **Step 1: Add failing controller tests**

Assert source contracts for:

```ts
imageAiSaveDirectory?: string | null;
const effectiveAssistantImageGenerationConfig = useMemo(() => ({
  ...assistantImageGenerationConfig,
  ...(imageAiSaveDirectory ? { saveDirectory: imageAiSaveDirectory } : {}),
}), [assistantImageGenerationConfig, imageAiSaveDirectory]);
setAssistantPanelWidthValue(getAssistantPanelMaxWidth());
```

Also assert that existing `setAssistantPanelWidth` remains returned so drag resizing is preserved.

- [ ] **Step 2: Add failing page workflow tests**

Assert that `handleOpenImageAiPanel`:

```ts
const targetFolder = resolveImageAiResourceTargetFolder({
  sidebarTab,
  selectedFolder: resources.selectedResourceFolder,
  selectedResource: resources.selectedDoc,
});
const preparedFolder = await resources.prepareImageAiResourceFolder(targetFolder);
if (!preparedFolder) return;
setImageAiSaveDirectory(preparedFolder.absolutePath);
assistantController.openImageAiPanel();
```

Assert the controller receives `imageAiSaveDirectory` and the click handler is async.

- [ ] **Step 3: Run controller and page tests and verify RED**

Run: `pnpm exec vitest run src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/app/IndexPage.test.ts`

Expected: FAIL because the directory state and ordered preparation workflow are absent.

- [ ] **Step 4: Implement effective runtime config and opening width**

In the controller, accept `imageAiSaveDirectory`, derive `effectiveAssistantImageGenerationConfig`, and replace all runtime-post/signature reads of the raw config with the effective config. At the start of `openImageAiPanel`, set:

```ts
setAssistantPanelWidthValue(getAssistantPanelMaxWidth());
```

Do not remove `setAssistantPanelWidth`; dragging continues to update and persist the width after open.

- [ ] **Step 5: Implement ordered page orchestration**

Add `imageAiSaveDirectory` state before constructing the controller, pass it to the controller, import the target resolver, and make `handleOpenImageAiPanel` await folder preparation before setting the directory and opening the panel. Keep the existing provider-configuration guard first.

- [ ] **Step 6: Run controller and page tests and verify GREEN**

Run: `pnpm exec vitest run src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/app/IndexPage.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the opening workflow**

```bash
git add src/index/domains/assistant/hooks/useAssistantPanelController.tsx src/index/domains/assistant/hooks/useAssistantPanelController.test.ts src/index/app/IndexPage.tsx src/index/app/IndexPage.test.ts
git commit -m "feat: open image AI in resource folders"
```

---

### Task 6: Focused and build verification

**Files:**
- Verify all files changed in Tasks 1–5.

**Interfaces:**
- Consumes: all completed task outputs.
- Produces: fresh test, type, lint, and diff evidence for delivery.

- [ ] **Step 1: Run the focused feature suite**

Run:

```bash
pnpm exec vitest run \
  src/index/domains/assistant/imageAiResourceTarget.test.ts \
  src/index/services/sidebar.api.test.ts \
  src/index/app/index-page/useIndexPageResourceActions.test.ts \
  src/index/domains/assistant/assistantAcpContext.test.ts \
  src/index/domains/assistant/hooks/useAssistantPanelController.test.ts \
  src/index/app/IndexPage.test.ts \
  src/server/__tests__/projects-resource-tree-api.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run server TypeScript verification**

Run: `pnpm server:build`

Expected: exit code 0.

- [ ] **Step 3: Run formatting/lint checks on changed source files**

Run: `pnpm exec biome check <changed TypeScript files>` when Biome is configured for the app; otherwise run the repository's applicable lint command and record any unrelated pre-existing failures.

Expected: no new diagnostics in changed files.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- src/index/domains/assistant/imageAiResourceTarget.ts src/index/services/sidebar.api.ts src/index/app/index-page/useIndexPageResourceActions.tsx src/index/domains/assistant/assistantAcpContext.ts src/index/domains/assistant/hooks/useAssistantPanelController.tsx src/index/app/IndexPage.tsx src/server/managementApi.workspace.ts
```

Expected: no whitespace errors and no unrelated edits attributed to this task.

- [ ] **Step 5: Commit any verification-only corrections**

```bash
git add <only files corrected during verification>
git commit -m "test: verify image AI resource storage"
```

Skip this commit when verification requires no corrections.
