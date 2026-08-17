# Annotation Enable Page Directory Implementation Plan

**Goal:** Make newly enabled multi-page annotations reuse the existing Make sidebar page data and produce a clickable standard annotation directory.

**Architecture:** Send normalized `selectedItem.pages` through the existing enable request. Generate standard route nodes on the server and inject `currentPageId` plus `onDirectoryRoute` into `AnnotationViewer`. Do not add a second page state or historical migration.

## Constraints

- Preserve unrelated worktree changes.
- Do not parse prototype source to rediscover pages.
- Do not overwrite an existing annotation directory.
- Single-page prototypes keep no directory.

## Task 1: Pass the Existing Page Data

**Files:**
- `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- `src/index/app/index-page/useIndexPagePreviewActions.test.ts`

- [x] Send `normalizePrototypeRoutePages(selectedItem?.pages)` in the manual enable request.
- [x] Add a source contract assertion for the request payload.

## Task 2: Generate a Standard Clickable Directory

**Files:**
- `src/server/managementApi.prototypeAnnotation.ts`
- `src/server/__tests__/prototype-annotation-api.test.ts`

- [x] Validate and deduplicate incoming page ids/titles.
- [x] Generate one default-expanded `页面` folder for two or more valid pages.
- [x] Generate one `route` node per page in existing order.
- [x] Keep single-page sources without a directory.
- [x] Preserve an existing directory.
- [x] Inject dynamic `currentPageId` and `onDirectoryRoute` for `#page=<id>` navigation.

## Task 3: Verify the Current Example

**Runtime data:**
- `client/src/prototypes/beginner-guide-copy/annotation-source.json`

- [x] Refill the current example with its existing eight pages.
- [x] Confirm the persisted directory has eight route children in sidebar order.
- [x] Open the annotation directory and confirm a route click changes both hash and page content.

## Task 4: Regression Verification

- [x] Run the related helper, hook source-contract, and server API suites.
- [x] Run `pnpm server:build`.
- [x] Run scoped `git diff --check` and inspect the final diff.
