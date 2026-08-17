# Fixed Document Templates Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move five built-in document templates into a fixed root-level directory and manage them from Project Settings with preview, edit, missing-state, and explicit restore behavior.

**Architecture:** A shared immutable registry maps stable IDs to `templates/` paths. A project-scoped API lists, reads, writes, previews, and explicitly restores only registered templates; the settings UI consumes this API and reuses the existing Markdown and HTML preview/edit surfaces. Make Client updates treat existing templates as project-owned content and only fill missing files.

**Tech Stack:** TypeScript 5, Node.js filesystem APIs, React 18.2, Vitest, existing Markdown viewer, existing HTML quick-edit bootstrap.

## Global Constraints

- Use `pnpm` for repository development and verification.
- Do not add system/project template categories or custom template CRUD.
- Fixed templates only support preview, edit, and restore when missing.
- Never create an empty template when a file is missing.
- Project updates may add missing template files but must not overwrite existing template content.
- Preserve unrelated user changes in the dirty worktree.

---

### Task 1: Fixed registry and template files

**Files:**
- Create: `src/common/documentTemplates.ts`
- Test: `src/common/documentTemplates.test.ts`
- Move: `client/src/resources/templates/*` to `client/templates/*`
- Modify: `client/template-manifest.json`
- Modify: `client/tests/prd-template-profiles.test.ts`

**Interfaces:**
- Produces: `DOCUMENT_TEMPLATES`, `DocumentTemplateId`, and `getDocumentTemplate(id)` with stable ID, label, format, description, and project-relative path.

- [x] **Step 1: Write registry and publication tests that expect the five fixed IDs and new paths.**
- [x] **Step 2: Run the focused tests and verify they fail because the registry and files do not exist.**
- [x] **Step 3: Add the registry, move the five files, and update the publication manifest and PRD assertions.**
- [x] **Step 4: Run the focused tests and verify they pass.**

### Task 2: Fixed project-scoped API and missing recovery

**Files:**
- Create: `src/server/managementApi.documentTemplates.ts`
- Modify: `src/server/managementApi.ts`
- Modify: `src/server/htmlReviewArtifacts.ts`
- Test: `src/server/__tests__/projects-document-templates-api.test.ts`

**Interfaces:**
- Produces: `GET /api/document-templates`, `GET|PUT /api/document-templates/:id`, and `POST /api/document-templates/:id/restore`.
- The list DTO contains `id`, `displayName`, `description`, `format`, `path`, `exists`, `previewUrl`, and `editUrl`.

- [x] **Step 1: Write API tests for fixed order, Markdown and HTML preview, PUT, unknown IDs, missing 404, and explicit restore without overwriting existing files.**
- [x] **Step 2: Run the API tests and verify they fail because the route is absent.**
- [x] **Step 3: Implement registry-only path resolution and bounded read/write behavior.**
- [x] **Step 4: Implement restore from a server-owned default-template source and extend HTML quick-edit resolution to `templates/*.html`.**
- [x] **Step 5: Run the API and HTML-editing tests and verify they pass.**

### Task 3: Project Settings fixed list

**Files:**
- Create: `src/index/components/settings/FixedDocumentTemplateSettings.tsx`
- Create: `src/index/components/settings/documentTemplateSettings.ts`
- Test: `src/index/components/settings/documentTemplateSettings.test.ts`
- Modify: `src/index/components/SettingsDialog.tsx`
- Modify: `src/index/components/SettingsDialog.source.test.ts`

**Interfaces:**
- Consumes: the fixed template API DTO.
- Produces: a Project Settings list with Preview, Edit, and missing-only Restore actions.

- [x] **Step 1: Write frontend tests for scoped URLs, fixed rows, no CRUD controls, and the missing restore state.**
- [x] **Step 2: Run the focused tests and verify they fail because the settings section is absent.**
- [x] **Step 3: Implement the focused settings component and add it below project defaults.**
- [x] **Step 4: Open Markdown with the existing viewer in `mode=edit`; open HTML with the existing same-origin preview and quick-edit bootstrap.**
- [x] **Step 5: Run the focused settings tests and verify they pass.**

### Task 4: Consumers, resource entry removal, and update preservation

**Files:**
- Modify: `src/index/services/prototypeSpecs.ts`
- Modify: `src/index/utils/uiReviewPrompt.ts`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/services/projectResources.ts`
- Modify: `src/server/makeClientProject.ts`
- Modify: relevant `.agents`, `.claude`, `client/rules`, and tests that reference old paths.

**Interfaces:**
- Consumes: registry paths and fixed list API.
- Produces: all generation/review instructions use `templates/*`; normal resources contain no template-management entrance; client updates fill only missing templates.

- [x] **Step 1: Update existing tests to expect new paths, the Project Settings hint, and preservation of existing templates during update.**
- [x] **Step 2: Run the focused tests and verify they fail on old paths and overwrite behavior.**
- [x] **Step 3: Update consumers and rules, remove dynamic template management from normal resource data, and make update writes skip existing `templates/` files.**
- [x] **Step 4: Run the focused tests and verify they pass.**

### Task 5: Full verification

**Files:**
- Verify all files changed by Tasks 1–4.

**Interfaces:**
- Produces: evidence that API, UI source contracts, Markdown/HTML editing, publication, and build remain valid.

- [x] **Step 1: Run all focused Vitest files covering the registry, API, settings, preview bridges, consumers, publication, and update behavior.**
- [x] **Step 2: Run `pnpm server:build`, `pnpm client:typecheck`, and `pnpm admin:build`.**
- [x] **Step 3: Run `git diff --check`, inspect the scoped diff, and confirm unrelated work was not staged or overwritten.**
