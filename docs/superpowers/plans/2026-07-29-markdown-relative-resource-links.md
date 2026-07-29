# Markdown Relative Resource Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make relative Markdown links open their existing current-project resources in the Make content area instead of navigating the iframe to invalid site-root URLs.

**Architecture:** The Markdown iframe resolves a relative link into a typed navigation target and posts it to its parent. A focused parent hook validates same-origin/source-window messages, resolves the target through the existing deep-link resource resolver, and reuses the current document selection state so the existing content-mode and URL-sync effects choose the right preview.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, Vite 5, pnpm workspace, Playwright with system Chrome for local browser verification.

## Global Constraints

- Use pnpm for repository development, tests, and builds.
- Preserve React at 18.2.0 and TypeScript at 5.x.
- Do not add compatibility behavior for legacy endpoints.
- Do not alter Markdown source files or add a second resource preview system.
- Restrict navigation to the current project and reject paths that escape their allowed document root.
- Preserve all pre-existing uncommitted work; stage only files changed by this plan.

---

## File Map

- Modify `src/spec-template/previewMarkdownContent.ts`: parse document endpoint context and resolve safe typed relative-link targets.
- Modify `src/spec-template/previewMarkdownContent.test.ts`: prove ordinary docs, internal docs, prototype specs, and rejected links.
- Modify `src/spec-template/MarkdownViewer.tsx`: dispatch ordinary document navigation separately from prototype-spec navigation.
- Create `src/index/app/hooks/useDocumentResourceNavigation.ts`: validate iframe messages and resolve/open a current-project document resource.
- Create `src/index/app/hooks/useDocumentResourceNavigation.test.ts`: exercise source/origin/type/resource validation and successful resolution.
- Modify `src/index/app/IndexPage.tsx`: connect the hook to current iframe, docs list, and existing selection setters.
- Modify `src/index/app/prototypeSpecIntegration.source.test.ts`: verify the new hook is wired without weakening the prototype-spec guard.

### Task 1: Resolve Typed Relative Links in the Markdown Iframe

**Files:**
- Modify: `src/spec-template/previewMarkdownContent.test.ts`
- Modify: `src/spec-template/previewMarkdownContent.ts`
- Modify: `src/spec-template/MarkdownViewer.tsx`

**Interfaces:**
- Produces: `resolveMarkdownDocumentLinkTarget(href: string, documentUrl: string): MarkdownDocumentLinkTarget | null`.
- Produces: `MarkdownDocumentLinkTarget = { kind: 'prototype-spec' | 'doc' | 'project-doc'; resourceId: string }`.
- Preserves: `resolvePrototypeSpecDocumentLink(href, documentUrl): string | null` as a compatibility wrapper for existing callers/tests.

- [ ] **Step 1: Write the failing resolver tests**

Add the import and cases below to `src/spec-template/previewMarkdownContent.test.ts`:

```ts
import {
  resolveMarkdownDocumentLinkTarget,
  resolvePrototypeSpecAssetUrl,
  resolvePrototypeSpecDocumentLink,
  stripMarkdownPreviewFrontmatter,
} from './previewMarkdownContent';

describe('resolveMarkdownDocumentLinkTarget', () => {
  const resourceDocUrl = '/api/projects/make-project/docs/kangbaobao%2Fprd-02-home-growth/content';

  it('resolves ordinary resource-document links relative to the selected document', () => {
    expect(resolveMarkdownDocumentLinkTarget('./PROJECT.md', resourceDocUrl)).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/PROJECT.md',
    });
    expect(resolveMarkdownDocumentLinkTarget('./sources/pages/home/screenshot.png', resourceDocUrl)).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/sources/pages/home/screenshot.png',
    });
    expect(resolveMarkdownDocumentLinkTarget('./sources/pages/home/data.json', resourceDocUrl)).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/sources/pages/home/data.json',
    });
    expect(resolveMarkdownDocumentLinkTarget('./PROJECT.md?raw=1#overview', resourceDocUrl)).toEqual({
      kind: 'doc',
      resourceId: 'kangbaobao/PROJECT.md',
    });
  });

  it('keeps project-document and prototype-spec navigation typed', () => {
    expect(resolveMarkdownDocumentLinkTarget(
      '../prd-04.md',
      '/api/projects/make-project/document-content?path=src%2Fprototypes%2Fhome%2Fdocs%2Fsections%2Fprd-03.md',
    )).toEqual({
      kind: 'project-doc',
      resourceId: 'src/prototypes/home/docs/prd-04.md',
    });
    expect(resolveMarkdownDocumentLinkTarget(
      '../flows/order.md#states',
      '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Foverview.md',
    )).toEqual({
      kind: 'prototype-spec',
      resourceId: 'flows/order.md',
    });
  });

  it('does not intercept anchors, external links, absolute paths, or escaped resource paths', () => {
    expect(resolveMarkdownDocumentLinkTarget('#states', resourceDocUrl)).toBeNull();
    expect(resolveMarkdownDocumentLinkTarget('https://example.com/guide.md', resourceDocUrl)).toBeNull();
    expect(resolveMarkdownDocumentLinkTarget('/PROJECT.md', resourceDocUrl)).toBeNull();
    expect(resolveMarkdownDocumentLinkTarget('../../outside.md', resourceDocUrl)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run:

```bash
pnpm exec vitest run src/spec-template/previewMarkdownContent.test.ts
```

Expected: FAIL because `resolveMarkdownDocumentLinkTarget` is not exported.

- [ ] **Step 3: Implement the typed resolver minimally**

In `src/spec-template/previewMarkdownContent.ts`, add the endpoint patterns, shared safe path resolver, typed resolver, and wrapper behavior:

```ts
const PROJECT_RESOURCE_DOC_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/docs\/(.+)\/content$/u;
const PROJECT_DOCUMENT_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/document-content$/u;

export type MarkdownDocumentLinkTarget = {
  kind: 'prototype-spec' | 'doc' | 'project-doc';
  resourceId: string;
};

function resolveRelativeDocumentPath(currentPath: string, rawHref: string): string | null {
  const hrefPath = rawHref.split('#', 1)[0].split('?', 1)[0].replace(/\\/gu, '/');
  if (!hrefPath) return null;
  const baseSegments = currentPath.replace(/\\/gu, '/').split('/').filter(Boolean).slice(0, -1);
  for (const segment of hrefPath.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (baseSegments.length === 0) return null;
      baseSegments.pop();
      continue;
    }
    baseSegments.push(segment);
  }
  return baseSegments.length > 0 ? baseSegments.join('/') : null;
}

export function resolveMarkdownDocumentLinkTarget(
  href: string,
  documentUrl: string,
): MarkdownDocumentLinkTarget | null {
  const rawHref = String(href || '').trim();
  if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(rawHref)) {
    return null;
  }
  let currentUrl: URL;
  try {
    currentUrl = new URL(documentUrl, 'http://axhub.local');
  } catch {
    return null;
  }

  const prototypePath = String(currentUrl.searchParams.get('path') || '').trim();
  if (PROTOTYPE_SPEC_CONTENT_PATH_RE.test(currentUrl.pathname)) {
    const resourceId = resolveRelativeDocumentPath(prototypePath, rawHref);
    return resourceId && /\.(?:html?|md)$/iu.test(resourceId)
      ? { kind: 'prototype-spec', resourceId }
      : null;
  }

  const resourceMatch = currentUrl.pathname.match(PROJECT_RESOURCE_DOC_CONTENT_PATH_RE);
  if (resourceMatch) {
    let currentResourceId = '';
    try {
      currentResourceId = decodeURIComponent(resourceMatch[1] || '');
    } catch {
      return null;
    }
    const resourceId = resolveRelativeDocumentPath(currentResourceId, rawHref);
    return resourceId ? { kind: 'doc', resourceId } : null;
  }

  if (PROJECT_DOCUMENT_CONTENT_PATH_RE.test(currentUrl.pathname)) {
    const resourceId = resolveRelativeDocumentPath(prototypePath, rawHref);
    return resourceId && /\.mdx?$/iu.test(resourceId)
      ? { kind: 'project-doc', resourceId }
      : null;
  }
  return null;
}

export function resolvePrototypeSpecDocumentLink(href: string, documentUrl: string): string | null {
  const target = resolveMarkdownDocumentLinkTarget(href, documentUrl);
  return target?.kind === 'prototype-spec' ? target.resourceId : null;
}
```

Keep `resolvePrototypeSpecResourceUrl` unchanged so existing prototype attachments still use their content endpoint.

- [ ] **Step 4: Update the iframe link component**

Replace the target calculation and click branch in `src/spec-template/MarkdownViewer.tsx` with:

```tsx
const navigationTarget = resolveMarkdownDocumentLinkTarget(
    String(props.href || ''),
    String(currentDoc?.url || ''),
);
const resourceUrl = navigationTarget
    ? null
    : resolvePrototypeSpecResourceUrl(
        String(props.href || ''),
        String(currentDoc?.url || ''),
    );

// inside onClick
if (event.defaultPrevented || !navigationTarget) return;
event.preventDefault();
if (navigationTarget.kind === 'prototype-spec') {
    postToParent({ type: 'axhub-prototype-spec:navigate', path: navigationTarget.resourceId });
    return;
}
postToParent({
    type: 'axhub-document-resource:navigate',
    resourceType: navigationTarget.kind,
    resourceId: navigationTarget.resourceId,
});
```

Update the import to use `resolveMarkdownDocumentLinkTarget` instead of calling `resolvePrototypeSpecDocumentLink` directly.

- [ ] **Step 5: Run Task 1 tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/spec-template/previewMarkdownContent.test.ts src/spec-template/legacy-editing-boundary.test.ts
```

Expected: both files PASS; existing prototype-spec asset and document-link assertions remain green.

- [ ] **Step 6: Commit Task 1 only**

```bash
git add src/spec-template/previewMarkdownContent.ts src/spec-template/previewMarkdownContent.test.ts src/spec-template/MarkdownViewer.tsx
git commit -m "fix: resolve markdown relative resource links"
```

Before committing, inspect `git diff --cached` because `MarkdownViewer.tsx` already contains unrelated user edits; stage only this task's hunks with `git add -p` if necessary.

### Task 2: Validate Navigation Messages and Reuse Document Selection

**Files:**
- Create: `src/index/app/hooks/useDocumentResourceNavigation.ts`
- Create: `src/index/app/hooks/useDocumentResourceNavigation.test.ts`
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/prototypeSpecIntegration.source.test.ts`

**Interfaces:**
- Consumes iframe messages `{ type: 'axhub-document-resource:navigate'; resourceType: 'doc' | 'project-doc'; resourceId: string }`.
- Consumes `resolveIndexDeepLinkSelection()` and the current project `docs` list.
- Produces `useDocumentResourceNavigation(options): void`.
- Produces `handleDocumentResourceNavigationMessage(event, options): boolean` for deterministic unit tests.

- [ ] **Step 1: Write the failing parent-navigation tests**

Create `src/index/app/hooks/useDocumentResourceNavigation.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ItemData } from '../../types';
import { handleDocumentResourceNavigationMessage } from './useDocumentResourceNavigation';

function doc(name: string, openMode: ItemData['openMode']): ItemData {
  return { name, resourceId: name, displayName: name, jsUrl: '', specUrl: '', openMode };
}

describe('handleDocumentResourceNavigationMessage', () => {
  const sourceWindow = {} as Window;
  const projectDoc = doc('kangbaobao/PROJECT', 'document');
  const screenshot = doc('kangbaobao/pages/home/screenshot.png', 'image');

  it('resolves current-project Markdown and image resources', () => {
    const navigate = vi.fn();
    const base = {
      enabled: true,
      appOrigin: 'http://localhost:53817',
      sourceWindow,
      projectId: 'make-project',
      docs: [projectDoc, screenshot],
      navigate,
    };
    expect(handleDocumentResourceNavigationMessage({
      origin: base.appOrigin,
      source: sourceWindow,
      data: { type: 'axhub-document-resource:navigate', resourceType: 'doc', resourceId: 'kangbaobao/PROJECT.md' },
    } as MessageEvent, base)).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith(projectDoc, 'demo');

    expect(handleDocumentResourceNavigationMessage({
      origin: base.appOrigin,
      source: sourceWindow,
      data: { type: 'axhub-document-resource:navigate', resourceType: 'doc', resourceId: screenshot.name },
    } as MessageEvent, base)).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith(screenshot, 'demo');
  });

  it('rejects the wrong origin, source window, message type, and missing resources', () => {
    const navigate = vi.fn();
    const options = {
      enabled: true,
      appOrigin: 'http://localhost:53817',
      sourceWindow,
      projectId: 'make-project',
      docs: [projectDoc],
      navigate,
    };
    for (const event of [
      { origin: 'http://evil.example', source: sourceWindow, data: { type: 'axhub-document-resource:navigate', resourceType: 'doc', resourceId: 'kangbaobao/PROJECT.md' } },
      { origin: options.appOrigin, source: {} as Window, data: { type: 'axhub-document-resource:navigate', resourceType: 'doc', resourceId: 'kangbaobao/PROJECT.md' } },
      { origin: options.appOrigin, source: sourceWindow, data: { type: 'other', resourceType: 'doc', resourceId: 'kangbaobao/PROJECT.md' } },
      { origin: options.appOrigin, source: sourceWindow, data: { type: 'axhub-document-resource:navigate', resourceType: 'doc', resourceId: 'missing.md' } },
    ]) {
      expect(handleDocumentResourceNavigationMessage(event as MessageEvent, options)).toBe(false);
    }
    expect(navigate).not.toHaveBeenCalled();
  });
});
```

Add a source assertion to `src/index/app/prototypeSpecIntegration.source.test.ts`:

```ts
const documentNavigationSource = readSource('./hooks/useDocumentResourceNavigation.ts');
expect(indexSource).toContain('useDocumentResourceNavigation({');
expect(documentNavigationSource).toContain("event.data?.type !== 'axhub-document-resource:navigate'");
expect(documentNavigationSource).toContain('event.source !== sourceWindow');
expect(guardSource).toContain("event.data?.type !== 'axhub-prototype-spec:navigate'");
```

- [ ] **Step 2: Run parent-navigation tests and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/useDocumentResourceNavigation.test.ts src/index/app/prototypeSpecIntegration.source.test.ts
```

Expected: FAIL because the new hook module and IndexPage wiring do not exist.

- [ ] **Step 3: Implement the message handler and hook**

Create `src/index/app/hooks/useDocumentResourceNavigation.ts`:

```ts
import { useEffect, useRef } from 'react';
import type { ItemData, ViewMode } from '../../types';
import { resolveIndexDeepLinkSelection } from '../index-page/resourceDeepLink';

type DocumentResourceNavigationOptions = {
  enabled: boolean;
  appOrigin?: string;
  sourceWindow: Window | null;
  projectId: string | null;
  docs: ItemData[];
  navigate: (item: ItemData, viewMode: ViewMode) => void;
};

export function handleDocumentResourceNavigationMessage(
  event: MessageEvent,
  options: DocumentResourceNavigationOptions,
): boolean {
  const appOrigin = options.appOrigin || window.location.origin;
  if (!options.enabled || !options.projectId || event.origin !== appOrigin) return false;
  if (!options.sourceWindow || event.source !== options.sourceWindow) return false;
  if (event.data?.type !== 'axhub-document-resource:navigate') return false;
  const resourceType = event.data?.resourceType;
  if (resourceType !== 'doc' && resourceType !== 'project-doc') return false;
  const resourceId = String(event.data?.resourceId || '').trim();
  if (!resourceId) return false;

  const resolved = resolveIndexDeepLinkSelection({
    resourceType,
    resourceId,
    projectId: options.projectId,
    collapseSidebar: false,
  }, { prototypes: [], docs: options.docs });
  if (!resolved || resolved.kind !== 'doc') return false;
  options.navigate(resolved.item, resolved.viewMode);
  return true;
}

export function useDocumentResourceNavigation(options: Omit<DocumentResourceNavigationOptions, 'appOrigin' | 'sourceWindow'> & {
  getSourceWindow: () => Window | null;
}): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const current = optionsRef.current;
      handleDocumentResourceNavigationMessage(event, {
        ...current,
        appOrigin: window.location.origin,
        sourceWindow: current.getSourceWindow(),
      });
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
}
```

- [ ] **Step 4: Wire document selection in IndexPage**

Import and call the hook in `src/index/app/IndexPage.tsx` near the existing prototype-spec navigation guard:

```ts
useDocumentResourceNavigation({
    enabled: contentMode === 'doc',
    projectId: workspace.activeProjectId,
    docs: workspace.docsItems,
    getSourceWindow: () => preview.previewIframeRef.current?.contentWindow ?? null,
    navigate: (item, nextViewMode) => {
        setActiveTab('prototypes');
        setSidebarTab('document');
        resources.setSelectedResourceFolder(null);
        resources.setSelectedDoc(item);
        setViewMode(nextViewMode);
    },
});
```

Do not write `history.replaceState` here. The existing `currentDeepLinkTarget` and URL-sync effect must produce the updated `?projectId=...&doc=...` URL from the selected document.

- [ ] **Step 5: Run Task 2 tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/app/hooks/useDocumentResourceNavigation.test.ts src/index/app/prototypeSpecIntegration.source.test.ts src/index/app/index-page/resourceDeepLink.test.ts
```

Expected: all three files PASS, including extension-insensitive Markdown matching and exact image/JSON resource matching.

- [ ] **Step 6: Commit Task 2 only**

```bash
git add src/index/app/hooks/useDocumentResourceNavigation.ts src/index/app/hooks/useDocumentResourceNavigation.test.ts
git add -p src/index/app/IndexPage.tsx src/index/app/prototypeSpecIntegration.source.test.ts
git commit -m "fix: open markdown links as project resources"
```

Inspect staged hunks before committing because both modified existing files contain unrelated user changes.

### Task 3: Full Regression and Real-Page Verification

**Files:**
- Verify only; temporary browser artifacts belong under `.local/test-scripts/artifacts/` and must not be committed.

**Interfaces:**
- Consumes the real document URL and the running Make dev server at `http://localhost:53817`.
- Produces fresh unit, build, and browser evidence for the original symptom.

- [ ] **Step 1: Run the focused regression suite**

```bash
pnpm exec vitest run \
  src/spec-template/previewMarkdownContent.test.ts \
  src/spec-template/legacy-editing-boundary.test.ts \
  src/index/app/hooks/useDocumentResourceNavigation.test.ts \
  src/index/app/prototypeSpecIntegration.source.test.ts \
  src/index/app/index-page/resourceDeepLink.test.ts \
  src/index/app/hooks/useIndexPageSelectionSync.test.ts
```

Expected: all test files PASS with zero failed tests.

- [ ] **Step 2: Build the Make admin UI**

```bash
pnpm admin:build
```

Expected: Vite admin and Axure export builds exit 0. Do not treat unrelated pre-existing warnings as failures, but record them in the handoff.

- [ ] **Step 3: Verify the original page with system Chrome**

Run a temporary Playwright script from `.local/test-scripts/` using:

```js
import { chromium } from './node_modules/playwright/index.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const badResponses = [];
page.on('response', (response) => {
  if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() });
});
await page.goto('http://localhost:53817/?projectId=make-project&doc=kangbaobao%2Fprd-02-home-growth');
await page.waitForTimeout(3000);
let frame = page.frames().find((candidate) => candidate.url().includes('spec-template.html'));
await frame.getByRole('link', { name: 'PROJECT.md', exact: true }).click();
await page.waitForTimeout(1000);
if (!page.url().includes('doc=kangbaobao%2FPROJECT')) throw new Error(`Unexpected PROJECT URL: ${page.url()}`);

await page.goto('http://localhost:53817/?projectId=make-project&doc=kangbaobao%2Fprd-02-home-growth');
await page.waitForTimeout(2000);
frame = page.frames().find((candidate) => candidate.url().includes('spec-template.html'));
await frame.getByRole('link', { name: '截图', exact: true }).first().click();
await page.waitForTimeout(1000);
if (!page.url().includes('screenshot.png')) throw new Error(`Unexpected screenshot URL: ${page.url()}`);

await page.goto('http://localhost:53817/?projectId=make-project&doc=kangbaobao%2Fprd-02-home-growth');
await page.waitForTimeout(2000);
frame = page.frames().find((candidate) => candidate.url().includes('spec-template.html'));
await frame.getByRole('link', { name: '组件数据', exact: true }).first().click();
await page.waitForTimeout(1000);
if (!page.url().includes('data.json')) throw new Error(`Unexpected JSON URL: ${page.url()}`);

if (badResponses.some(({ url }) => /\/(?:PROJECT\.md|sources\/)/u.test(new URL(url).pathname))) {
  throw new Error(`Root-relative link request detected: ${JSON.stringify(badResponses)}`);
}
await page.screenshot({
  path: '.local/test-scripts/artifacts/kangbaobao-markdown-links-after.png',
  fullPage: true,
});
await browser.close();
```

Expected: PROJECT Markdown, first screenshot, and first JSON link each update the Make `doc` deep link; no request targets `/PROJECT.md` or a site-root `/sources/...` path.

- [ ] **Step 4: Inspect final scope and whitespace**

```bash
git diff --check
git status --short
git diff -- src/spec-template/previewMarkdownContent.ts src/spec-template/previewMarkdownContent.test.ts src/spec-template/MarkdownViewer.tsx src/index/app/hooks/useDocumentResourceNavigation.ts src/index/app/hooks/useDocumentResourceNavigation.test.ts src/index/app/IndexPage.tsx src/index/app/prototypeSpecIntegration.source.test.ts
```

Expected: no whitespace errors; only intended hunks are attributed to this fix, with unrelated user changes left intact.
