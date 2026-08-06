# AI Panel Tab-Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the general AI and image AI panel open/closed state only in the current browser tab while preserving restoration after refresh.

**Architecture:** Keep `IndexPage` and the assistant panel controller unchanged. Change the shared auto-open helpers' default storage backend from origin-wide `localStorage` to tab-scoped `sessionStorage`, with one focused unit test proving that default reads and writes do not touch `localStorage`.

**Tech Stack:** TypeScript 5.x, React 18.2.0, Vitest 4, browser Web Storage API, pnpm.

## Global Constraints

- Use pnpm for all repository commands.
- Preserve the existing project-scoped storage keys and `general-ai` / `image-ai` values.
- Preserve manual-close semantics: a close remains closed after refresh in the same browser tab.
- Do not migrate or read historical `localStorage` values.
- Do not add special handling for browser duplicate-tab commands.
- Preserve unrelated uncommitted changes, including existing edits in both target files.
- Do not change assistant panel width, project-switch, iframe, conversation, image generation, or runtime behavior.

---

## File Structure

- `src/index/app/index-page.helpers.ts`: owns the default browser storage selection and the existing auto-open read/write helpers.
- `src/index/app/index-page.helpers.test.ts`: verifies the default storage boundary plus existing dismissed-state and panel-mode behavior.
- `src/index/app/IndexPage.test.ts`: existing source-level regression coverage for restore, close, project-switch, and general/image panel flows; no code changes expected.

### Task 1: Move AI Panel Restoration State Into the Current Browser Tab

**Files:**
- Modify: `src/index/app/index-page.helpers.test.ts:1-100`
- Modify: `src/index/app/index-page.helpers.ts:93-200`
- Test: `src/index/app/index-page.helpers.test.ts`
- Regression: `src/index/app/IndexPage.test.ts`

**Interfaces:**
- Consumes: `buildAssistantAutoOpenDismissedStorageKey(projectScope?, targetPath?)`, `buildAssistantAutoOpenPanelModeStorageKey(projectScope?, targetPath?)`, `getAssistantAutoOpenDismissed(storageKey, storage?)`, `setAssistantAutoOpenDismissed(storageKey, dismissed, storage?)`, `getAssistantAutoOpenPanelMode(storageKey, storage?)`, and `setAssistantAutoOpenPanelMode(storageKey, mode, storage?)`.
- Produces: the same exported helper signatures and storage key format, with omitted `storage` arguments resolving to `window.sessionStorage` instead of `window.localStorage`.

- [ ] **Step 1: Write the failing default-storage test**

Change the Vitest import in `src/index/app/index-page.helpers.test.ts` to include `vi`:

```ts
import { describe, expect, it, vi } from 'vitest';
```

Add this test immediately after the `formats non-Error thrown values` test:

```ts
    it('uses browser-tab session storage for assistant auto-open state by default', () => {
        const sessionValues = new Map<string, string>();
        const localValues = new Map<string, string>();
        const createStorage = (values: Map<string, string>) => ({
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                values.set(key, value);
            },
        });

        vi.stubGlobal('window', {
            location: { origin: 'http://make.local' },
            sessionStorage: createStorage(sessionValues),
            localStorage: createStorage(localValues),
        });

        try {
            const dismissedKey = buildAssistantAutoOpenDismissedStorageKey('make-project');
            const panelModeKey = buildAssistantAutoOpenPanelModeStorageKey('make-project');

            setAssistantAutoOpenDismissed(dismissedKey, true);
            setAssistantAutoOpenPanelMode(panelModeKey, 'image-ai');

            expect(sessionValues.get(dismissedKey)).toBe('1');
            expect(sessionValues.get(panelModeKey)).toBe('image-ai');
            expect(localValues.size).toBe(0);
            expect(getAssistantAutoOpenDismissed(dismissedKey)).toBe(true);
            expect(getAssistantAutoOpenPanelMode(panelModeKey)).toBe('image-ai');
        } finally {
            vi.unstubAllGlobals();
        }
    });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/app/index-page.helpers.test.ts
```

Expected: FAIL in `uses browser-tab session storage for assistant auto-open state by default`; `sessionValues.get(dismissedKey)` is `undefined` because the current helper writes to `localStorage`.

- [ ] **Step 3: Switch the helper default to session storage**

In `src/index/app/index-page.helpers.ts`, replace the storage type and default resolver with:

```ts
type AssistantAutoOpenStorage = Pick<Storage, 'getItem' | 'setItem'>;
type AssistantAutoOpenPanelMode = 'general-ai' | 'image-ai';

function getAssistantAutoOpenStorage(): AssistantAutoOpenStorage | null {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}
```

Update all four helper parameters to use the renamed type and resolver:

```ts
storage: AssistantAutoOpenStorage | null = getAssistantAutoOpenStorage(),
```

Apply that exact default to `getAssistantAutoOpenDismissed`, `setAssistantAutoOpenDismissed`, `getAssistantAutoOpenPanelMode`, and `setAssistantAutoOpenPanelMode`. Do not change their fallback return values, key builders, or write formats.

- [ ] **Step 4: Run the focused helper test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/index/app/index-page.helpers.test.ts
```

Expected: PASS, including the new default-storage test and the existing project-scoped dismissed/mode tests.

- [ ] **Step 5: Run the assistant restoration regression tests**

Run:

```bash
pnpm exec vitest run src/index/app/index-page.helpers.test.ts src/index/app/IndexPage.test.ts
```

Expected: both test files PASS. This confirms the storage boundary changed without altering the existing restore, close, project-switch, or general/image panel call flow.

- [ ] **Step 6: Inspect the final task diff**

Run:

```bash
git diff --check -- src/index/app/index-page.helpers.ts src/index/app/index-page.helpers.test.ts
git diff -- src/index/app/index-page.helpers.ts src/index/app/index-page.helpers.test.ts
```

Expected: no whitespace errors. The task-specific hunks contain only the Vitest import, the new session-storage test, the storage type/resolver rename, and four default resolver updates. Existing normalizer and URL changes later in these files remain untouched.

- [ ] **Step 7: Commit only the task-specific hunks**

Both files already contain unrelated user edits. Stage only hunks mentioning `vi`, `browser-tab session storage`, `AssistantAutoOpenStorage`, `getAssistantAutoOpenStorage`, or `window.sessionStorage`; do not stage the later document normalizer and URL hunks.

```bash
git add -p src/index/app/index-page.helpers.ts src/index/app/index-page.helpers.test.ts
git diff --cached --check
git diff --cached -- src/index/app/index-page.helpers.ts src/index/app/index-page.helpers.test.ts
git commit -m "fix: scope AI panel restoration to browser tab"
```

Expected: the staged diff contains only this task's storage and test changes, and the commit succeeds without including pre-existing worktree edits.
