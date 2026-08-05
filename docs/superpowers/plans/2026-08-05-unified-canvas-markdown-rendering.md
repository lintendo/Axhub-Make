# Unified Canvas Markdown Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas document previews and resource document previews use one read-only Markdown renderer, including GFM tables and matching content styles.

**Architecture:** Extract the existing XMarkdown-based read-only body renderer and its image-resolution helpers into `src/common/markdown/`. `MarkdownViewer` keeps the resource-page shell and supplies its navigation/heading overrides; `AxhubDocEmbed` keeps fetching and state handling but delegates all Markdown rendering to the shared reader.

**Tech Stack:** React 18.2.0, TypeScript 5.x, `@ant-design/x-markdown` 2.1.1, Vitest 4, pnpm.

## Global Constraints

- Do not add a Markdown dependency; reuse the installed `@ant-design/x-markdown` light theme.
- Keep React at 18.2.0 and TypeScript at 5.x.
- Preserve the existing resource page's directory, commentary, editing, save, and multi-document behaviors; the canvas remains read-only.
- Preserve `AxhubDocEmbed` URL extraction, JSON content unwrapping, refresh, loading, error, and scroll behavior.
- Do not change the stored canvas element format or its `openUrl` behavior.
- Preserve unrelated, uncommitted changes in `src/spec-template/MarkdownViewer.tsx`; make only narrow edits required for this feature.
- Use pnpm for all commands and stage only files belonging to the task.

---

### Task 1: Create the shared read-only Markdown body renderer

**Files:**
- Create: `src/common/markdown/ReadOnlyMarkdown.tsx`
- Create: `src/common/markdown/ReadOnlyMarkdown.test.ts`
- Create: `src/common/markdown/markdownImage.ts`
- Create: `src/common/markdown/markdownImage.test.ts`
- Modify: `src/spec-template/previewMarkdownContent.ts:112-153`
- Modify: `src/spec-template/previewMarkdownContent.test.ts:4-8`

**Interfaces:**
- Consumes: Markdown text, the current document URL, and optional `XMarkdown` component overrides.
- Produces: `ReadOnlyMarkdown`, `resolveMarkdownImageSrc`, `parseAxhubImageWidth`, `resolvePrototypeSpecResourceUrl`, and `resolvePrototypeSpecAssetUrl`.

- [ ] **Step 1: Write failing renderer and asset-resolution tests**

```ts
import { create } from 'react-test-renderer';
import { ReadOnlyMarkdown } from './ReadOnlyMarkdown';

it('renders GFM table cells through the shared reader', () => {
  const tree = create(<ReadOnlyMarkdown content={'| 用户 | 场景 |\n| --- | --- |\n| 销售 | 首页 |'} />).toJSON();
  expect(JSON.stringify(tree)).toContain('table');
});
```

Add focused `markdownImage` cases for an `axw` image-width query, a project document content endpoint, and a prototype-spec relative asset URL. Change the existing preview helper test imports to the new common module only if the helper is intentionally no longer re-exported there.

- [ ] **Step 2: Run tests and confirm the expected red failure**

Run: `pnpm vitest run src/common/markdown/ReadOnlyMarkdown.test.ts src/common/markdown/markdownImage.test.ts`

Expected: FAIL because the common Markdown modules do not exist yet.

- [ ] **Step 3: Implement the shared modules**

```tsx
export function ReadOnlyMarkdown({ content, documentUrl, components, className }: ReadOnlyMarkdownProps) {
  const resolvedComponents = {
    code: MarkdownCode,
    img: (props: MarkdownImageProps) => <MarkdownImage {...props} documentUrl={documentUrl} />,
    ...components,
  };

  return (
    <XMarkdown
      className={['axhub-readonly-markdown', 'x-markdown-light', className].filter(Boolean).join(' ')}
      content={content}
      components={resolvedComponents}
    />
  );
}
```

Import the XMarkdown light theme in this module. Move the existing `parseAxhubImageWidth`, project-document asset URL construction, and relative image resolution into `markdownImage.ts`. Move the prototype-spec relative-resource helpers there as pure functions, then re-export them from `previewMarkdownContent.ts` so existing callers and tests retain their public import path. Keep the Mermaid code-block behavior in `MarkdownCode`.

- [ ] **Step 4: Run the new and migrated helper tests**

Run: `pnpm vitest run src/common/markdown/ReadOnlyMarkdown.test.ts src/common/markdown/markdownImage.test.ts src/spec-template/previewMarkdownContent.test.ts`

Expected: PASS with the shared reader producing a table element and all previous image URL cases retaining their URLs.

- [ ] **Step 5: Commit the shared renderer**

```bash
git add src/common/markdown/ReadOnlyMarkdown.tsx src/common/markdown/ReadOnlyMarkdown.test.ts src/common/markdown/markdownImage.ts src/common/markdown/markdownImage.test.ts src/spec-template/previewMarkdownContent.ts src/spec-template/previewMarkdownContent.test.ts
git commit -m "feat: add shared read-only markdown renderer"
```

### Task 2: Make the resource-page preview consume the shared reader

**Files:**
- Modify: `src/spec-template/MarkdownViewer.tsx:9-13,174-321,460-483,1537-1593`
- Modify: `src/spec-template/legacy-editing-boundary.test.ts:43-52,110-122`

**Interfaces:**
- Consumes: `ReadOnlyMarkdown` and `resolveMarkdownImageSrc` from `src/common/markdown/`.
- Produces: The same resource-page links, heading IDs, Mermaid blocks, image uploads, editing, comments, and contents sidebar, with its preview body rendered only by `ReadOnlyMarkdown`.

- [ ] **Step 1: Write a failing regression-boundary assertion**

Replace the direct-renderer source expectation with assertions that require the shared reader and prohibit a second `XMarkdown` mount in `MarkdownViewer.tsx`:

```ts
expect(viewerSource).toContain("import { ReadOnlyMarkdown } from '../common/markdown/ReadOnlyMarkdown';");
expect(viewerSource).toContain('<ReadOnlyMarkdown');
expect(viewerSource).not.toContain('<XMarkdown');
```

Keep the existing source assertions for document-link navigation, edit-mode image resolution, commentary, and sticky directory behavior.

- [ ] **Step 2: Run the boundary test and confirm red**

Run: `pnpm vitest run src/spec-template/legacy-editing-boundary.test.ts`

Expected: FAIL because `MarkdownViewer` still imports and mounts `XMarkdown` itself.

- [ ] **Step 3: Replace the preview body with the shared component**

```tsx
<ReadOnlyMarkdown
  content={previewContent}
  documentUrl={currentDoc?.url}
  components={{
    a: ResourceDocumentLink,
    h1: createHeading(1),
    h2: createHeading(2),
    h3: createHeading(3),
    h4: createHeading(4),
    h5: createHeading(5),
    h6: createHeading(6),
  }}
/>
```

Extract the current inline link callback into `ResourceDocumentLink` or an equivalent callback-stable local component. Leave the directory shell and `markdownStyles` in place. Delete only the duplicate `XMarkdown`, `MarkdownImage`, image helper, and `Code` declarations now supplied by the common modules; keep `createHeading` and all editor-only image resolver wiring, importing `resolveMarkdownImageSrc` from the common module.

- [ ] **Step 4: Run resource preview regressions**

Run: `pnpm vitest run src/spec-template/legacy-editing-boundary.test.ts src/spec-template/previewMarkdownContent.test.ts`

Expected: PASS; source assertions confirm one shared body renderer while document navigation, image resolution, commentary, and editor protocol remain present.

- [ ] **Step 5: Commit the resource integration**

```bash
git add src/spec-template/MarkdownViewer.tsx src/spec-template/legacy-editing-boundary.test.ts
git commit -m "refactor: share resource markdown rendering"
```

### Task 3: Replace the canvas-only parser with the shared reader

**Files:**
- Modify: `src/index/components/content/canvas-embeds/AxhubDocEmbed.tsx:1-335,438-441,468-488`
- Modify: `src/index/components/content/canvas-embeds/AxhubDocEmbed.test.ts`

**Interfaces:**
- Consumes: `ReadOnlyMarkdown`, the existing Markdown content API URL, normalized text, and current document URL.
- Produces: A read-only document node using the same Markdown body renderer as the resource page, with no resource-page interaction runtime.

- [ ] **Step 1: Write the failing canvas integration test**

```tsx
it('passes fetched table Markdown to the shared read-only reader', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => '| 用户 | 场景 |\n| --- | --- |\n| 销售 | 首页 |',
  }));

  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(<AxhubDocEmbed url="/api/markdown-file?path=src%2Fresources%2Fcrm.md" width={720} height={480} elementId="doc-1" />);
  });

  const reader = renderer!.root.findByType(ReadOnlyMarkdown);
  expect(reader.props.content).toContain('| 用户 | 场景 |');
  expect(reader.props.documentUrl).toContain('/api/markdown-file');
});
```

Import `act`, `create`, `ReactTestRenderer`, `vi`, `AxhubDocEmbed`, and `ReadOnlyMarkdown`; restore mocked globals after each test.

- [ ] **Step 2: Run the canvas test and confirm red**

Run: `pnpm vitest run src/index/components/content/canvas-embeds/AxhubDocEmbed.test.ts`

Expected: FAIL because `AxhubDocEmbed` has not imported or mounted `ReadOnlyMarkdown`.

- [ ] **Step 3: Delete the bespoke parser and mount the shared reader**

Delete `MarkdownBlock`, all block/inline parsing functions, and their local block styles. Keep `extractMarkdownUrl`, `normalizeFetchedMarkdownContent`, fetch lifecycle, loading/error/empty states, and memoization as needed. Replace the rendered blocks with:

```tsx
<ReadOnlyMarkdown
  content={markdownContent}
  documentUrl={markdownUrl}
  className="axhub-doc-embed__markdown"
/>
```

Give the scroll container an `axhub-doc-embed` class and add scoped table overflow rules so a wide table remains inside the node's scrollable viewport instead of changing its canvas dimensions.

- [ ] **Step 4: Run focused canvas and reader tests**

Run: `pnpm vitest run src/common/markdown/ReadOnlyMarkdown.test.ts src/common/markdown/markdownImage.test.ts src/index/components/content/canvas-embeds/AxhubDocEmbed.test.ts src/index/components/content/canvas-embeds/embedPreviewSession.test.ts`

Expected: PASS; canvas still classifies document previews correctly and passes fetched table text into the same reader used by the resource page.

- [ ] **Step 5: Commit the canvas integration**

```bash
git add src/index/components/content/canvas-embeds/AxhubDocEmbed.tsx src/index/components/content/canvas-embeds/AxhubDocEmbed.test.ts
git commit -m "fix: render canvas documents with shared markdown"
```

### Task 4: Verify the unified rendering contract

**Files:**
- Modify only if a failing verification exposes a concrete regression in Task 1–3 files.

**Interfaces:**
- Consumes: The shared renderer and both integration points.
- Produces: Test and build evidence that the feature compiles and the two surfaces share the same body renderer.

- [ ] **Step 1: Run the complete focused regression set**

Run: `pnpm vitest run src/common/markdown/ReadOnlyMarkdown.test.ts src/common/markdown/markdownImage.test.ts src/spec-template/previewMarkdownContent.test.ts src/spec-template/legacy-editing-boundary.test.ts src/index/components/content/canvas-embeds/AxhubDocEmbed.test.ts src/index/components/content/canvas-embeds/embedPreviewSession.test.ts`

Expected: PASS with zero test failures.

- [ ] **Step 2: Build the Make admin bundle**

Run: `pnpm admin:build`

Expected: exit code 0, including successful compilation of both the main admin entry and `spec-template.html` entry.

- [ ] **Step 3: Inspect the scoped diff and whitespace**

Run: `git diff HEAD~3..HEAD --check && git diff HEAD~3..HEAD --stat`

Expected: no whitespace errors; changed files are limited to the shared reader, its tests, the resource preview, the canvas preview, and their focused tests.

- [ ] **Step 4: Commit only a necessary verification repair**

If and only if a verification failure required a change after Task 3:

```bash
git add src/common/markdown src/spec-template/MarkdownViewer.tsx src/spec-template/previewMarkdownContent.ts src/index/components/content/canvas-embeds/AxhubDocEmbed.tsx
git commit -m "fix: complete unified markdown rendering"
```

