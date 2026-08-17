# Start Guide Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all shared start guides respond to the center workspace width so prompt cards remain readable when surrounding panels narrow the page.

**Architecture:** Add a small shared `StartPromptGrid` presentational wrapper for resource and design cards. Give the shared `StartGuide` an inline-size container and keep its width-dependent title, spacing, and grid rules in the existing index-page stylesheet, with CSS `auto-fit/minmax` handling 4/3/2/1 columns without JavaScript.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Tailwind utility classes, plain CSS container queries, Vitest 4.

## Global Constraints

- Use `pnpm` for development and verification.
- Preserve all existing start-guide actions, generation settings, card ordering, prompt selection, copying, disabled behavior, and keyboard order.
- Do not add resize listeners or React layout state.
- Do not overwrite or commit unrelated worktree changes; the target component files already contain user changes.
- Use a 16px grid gap and an approximately 208px minimum card width.
- Wide layouts retain the 34px title and 64px composer-to-grid gap; narrow content containers use 28px and 32px.

---

### Task 1: Add The Container-Responsive Start Guide Layout

**Files:**
- Create: `src/index/components/content/StartPromptGrid.tsx`
- Create: `src/index/components/content/StartPromptGrid.source.test.ts`
- Modify: `src/index/components/content/ResourceStartPromptGrid.tsx`
- Modify: `src/index/components/content/ThemeStartPromptGrid.tsx`
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/app/styles/index-page.css`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`

**Interfaces:**
- Produces: `StartPromptGrid({ ariaLabel, children }: { ariaLabel: string; children: ReactNode })`.
- Consumes: the existing `StartPromptCard` list items from resource and theme card renderers.
- CSS contract: `.ax-start-guide` is the inline-size container; `.ax-start-guide-title` and `.ax-start-prompt-grid` are responsive descendants.

- [ ] **Step 1: Write the failing source regression test**

Create `StartPromptGrid.source.test.ts` with source assertions that describe the layout contract before implementation:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

describe('start prompt grid responsive layout', () => {
  it('responds to the shared start-guide container instead of viewport breakpoints', () => {
    const gridPath = resolve(__dirname, './StartPromptGrid.tsx');
    expect(existsSync(gridPath)).toBe(true);

    const grid = read('./StartPromptGrid.tsx');
    const resourceGrid = read('./ResourceStartPromptGrid.tsx');
    const themeGrid = read('./ThemeStartPromptGrid.tsx');
    const content = read('./ContentAreaView.tsx');
    const styles = read('../../app/styles/index-page.css');

    expect(grid).toContain('className="ax-start-prompt-grid"');
    expect(resourceGrid).toContain('<StartPromptGrid ariaLabel="资源生成能力">');
    expect(themeGrid).toContain('<StartPromptGrid ariaLabel="主题来源">');
    expect(resourceGrid).not.toContain('sm:grid-cols-2');
    expect(resourceGrid).not.toContain('lg:grid-cols-4');
    expect(themeGrid).not.toContain('sm:grid-cols-2');
    expect(themeGrid).not.toContain('lg:grid-cols-4');
    expect(content).toContain('ax-start-guide');
    expect(content).toContain('ax-start-guide-title');
    expect(styles).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));');
    expect(styles).toContain('container-type: inline-size;');
    expect(styles).toContain('@container (min-width: 768px)');
  });
});
```

- [ ] **Step 2: Run the regression test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/content/StartPromptGrid.source.test.ts
```

Expected: FAIL because `StartPromptGrid.tsx` and the responsive CSS contract do not exist.

- [ ] **Step 3: Add the shared presentational grid**

Create `StartPromptGrid.tsx`:

```tsx
import type { ReactNode } from 'react';

export function StartPromptGrid({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <ul className="ax-start-prompt-grid" aria-label={ariaLabel}>
      {children}
    </ul>
  );
}
```

Replace each duplicated `<ul>` wrapper in `ResourceStartPromptGrid.tsx` and `ThemeStartPromptGrid.tsx` with `StartPromptGrid`. Keep every mapped `StartPromptCard` and handler unchanged.

- [ ] **Step 4: Add the start-guide container hooks and CSS**

Add `ax-start-guide` to the existing start-guide root, replace the heading's viewport size classes with `ax-start-guide-title`, and add the following scoped styles to `index-page.css`:

```css
.ax-start-guide {
    container-type: inline-size;
}

.ax-start-guide-title {
    font-size: 28px;
}

.ax-start-prompt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: 16px;
    margin-top: 32px;
}

@container (min-width: 768px) {
    .ax-start-guide-title {
        font-size: 34px;
    }

    .ax-start-prompt-grid {
        margin-top: 64px;
    }
}
```

Update the existing `ContentAreaView.source.test.ts` expectations for the new shared container/title classes and remove the old viewport-grid class expectations.

- [ ] **Step 5: Run the regression and focused component tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  src/index/components/content/StartPromptGrid.source.test.ts \
  src/index/components/content/StartPromptCard.test.ts \
  src/index/components/content/ThemeStartPromptGrid.source.test.ts \
  src/index/components/content/ThemeStartPromptGrid.test.ts \
  src/index/components/content/ContentAreaView.source.test.ts
```

Expected: all tests PASS with zero failures.

- [ ] **Step 6: Check the task diff**

Run:

```bash
git diff --check -- \
  src/index/components/content/StartPromptGrid.tsx \
  src/index/components/content/StartPromptGrid.source.test.ts \
  src/index/components/content/ResourceStartPromptGrid.tsx \
  src/index/components/content/ThemeStartPromptGrid.tsx \
  src/index/components/content/ContentAreaView.tsx \
  src/index/components/content/ContentAreaView.source.test.ts \
  src/index/app/styles/index-page.css
```

Expected: exit 0. Do not create a code commit because several target files contain pre-existing user changes that must not be bundled.

### Task 2: Verify Type Safety And Visible Reflow

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes the completed responsive layout from Task 1.
- Produces fresh test, type-check, and visual evidence.

- [ ] **Step 1: Run the app type check**

Run:

```bash
pnpm run client:typecheck
```

Expected: TypeScript exits 0.

- [ ] **Step 2: Start the admin development server**

Run `pnpm server:dev -- --host 127.0.0.1 --no-open` and keep the process alive for visual verification.

- [ ] **Step 3: Verify wide and narrow resource/design layouts in a browser**

Open the local admin URL with browser automation. Inspect the resource and design start guides at a wide workspace and with surrounding panels reducing the center content width.

Expected: the grid displays four columns when space permits, then three, two, and one without horizontal overflow; labels remain horizontal and readable; the title and grid spacing compact below 768px of center-container width; top actions and composer controls remain available.

- [ ] **Step 4: Capture final screenshots and close the browser**

Save wide and narrow screenshots under an ignored local output directory such as `.local/`, report their absolute paths, then close the browser automation session. Keep the development server running so the user can try the result.

- [ ] **Step 5: Re-run focused tests after visual verification**

Run the focused Vitest command from Task 1 again and read the complete result.

Expected: all focused tests PASS with zero failures.
