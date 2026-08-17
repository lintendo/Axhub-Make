# Local ACP Voice Dist Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Axhub Make consume the current local ACP voice build and disable ACP-owned voice tools while preserving Make host tools.

**Architecture:** Keep the existing `file:../../../acp-ui` dependency as a temporary pre-release integration. Rebuild ACP's public package, refresh pnpm's installed local-package snapshot, and make Make opt out of ACP tools at its single public voice component boundary.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4, pnpm 10, ACP public API build scripts.

## Global Constraints

- Keep `@axhub/acp` sourced from `file:../../../acp-ui`; do not switch to `link:` or npm in this task.
- Do not publish or change the version of `@axhub/acp` or `@axhub/make`.
- Do not add an automatic ACP rebuild/watch script to Make.
- Disable only ACP built-in voice tools; preserve every tool supplied through Make's `tools` prop.
- Use pnpm for Make dependency installation and tests.
- Preserve unrelated dirty-worktree changes and do not commit without an explicit user request.

---

### Task 1: Disable ACP-owned voice tools at the Make boundary

**Files:**
- Modify: `src/index/components/content/MakeCommentaryVoiceEntry.source.test.ts`
- Modify: `src/index/components/content/MakeCommentaryVoiceEntry.tsx`

**Interfaces:**
- Consumes: `AcpVoiceAssistant` and its public `injectAcpTools?: boolean` option from `@axhub/acp/voice`.
- Produces: a Make voice session with ACP tools disabled and the existing `tools={tools}` host catalog unchanged.

- [ ] **Step 1: Add the failing source assertion**

Add this assertion beside the existing prop-forwarding checks:

```ts
expect(source).toContain('injectAcpTools={false}');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/components/content/MakeCommentaryVoiceEntry.source.test.ts
```

Expected: FAIL because `MakeCommentaryVoiceEntry.tsx` does not yet pass `injectAcpTools={false}`.

- [ ] **Step 3: Implement the minimal opt-out**

Add the prop to the existing component without changing any other session input:

```tsx
<AcpVoiceAssistant
  injectAcpTools={false}
  serviceBaseUrl={serviceBaseUrl}
  tools={tools}
  prompt={prompt}
  checkVoiceConfiguration={checkVoiceConfiguration}
  openSettings={openSettings}
  className={className}
/>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2 again.

Expected: the source test passes.

### Task 2: Rebuild and refresh the temporary local ACP package snapshot

**Files:**
- Regenerate outside Make: `/Users/jianzhoulin/rd/acp-ui/dist/**`
- Refresh generated install state: `node_modules/.pnpm/@axhub+acp@file+*/node_modules/@axhub/acp/**`
- Update only if pnpm requires it: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: the local `/Users/jianzhoulin/rd/acp-ui` public package source and Make's existing `file:../../../acp-ui` dependency.
- Produces: Make-resolved ACP voice modules byte-identical to the current local public build.

- [ ] **Step 1: Capture the stale installed-package evidence**

Compare SHA-256 for these files before refreshing:

```text
dist/public-api/voice.mjs
dist/components/assistant-ui/voice/acp-voice-assistant.mjs
dist/components/assistant-ui/voice/shared-voice-surface.mjs
```

Expected: at least the assistant and shared-surface module hashes differ between local ACP and Make's resolved package.

- [ ] **Step 2: Build ACP's current public API**

Run from `/Users/jianzhoulin/rd/acp-ui`:

```bash
npm run build:public-api
```

Expected: TypeScript public build succeeds and regenerates `dist`.

- [ ] **Step 3: Verify the ACP package before installation**

Run from `/Users/jianzhoulin/rd/acp-ui`:

```bash
npm run test:public-api-package
```

Expected: all public export, runtime import, and package fixture checks pass.

- [ ] **Step 4: Refresh Make's local-directory dependency snapshot**

Run from `apps/axhub-make`:

```bash
pnpm install --force
```

Expected: pnpm recreates the local `@axhub/acp` virtual-store package from the current local directory while retaining `file:../../../acp-ui` in `package.json`.

- [ ] **Step 5: Verify the installed package is current**

Confirm:

- the installed package version remains `0.1.12`;
- `dist/public-api/voice.d.ts` contains `AcpVoiceAssistant` and the voice contract contains `injectAcpTools?: boolean`;
- the three file hashes from Step 1 now match the local ACP build.

### Task 3: Run Make regression and compilation checks

**Files:**
- Verify: `src/index/components/content/MakeCommentaryVoiceEntry.tsx`
- Verify: `src/index/components/content/MakeCommentaryVoiceEntry.source.test.ts`
- Verify: `src/index/domains/assistant/makeVoiceBoundary.source.test.ts`
- Verify: `src/index/domains/assistant/makeRealtimeVoice.test.ts`

**Interfaces:**
- Consumes: the refreshed ACP public package and Make's opt-out wrapper.
- Produces: evidence that Make compiles against the current public contract while retaining host tools and style boundaries.

- [ ] **Step 1: Run focused voice regressions**

Run:

```bash
pnpm exec vitest run \
  src/index/components/content/MakeCommentaryVoiceEntry.source.test.ts \
  src/index/domains/assistant/makeVoiceBoundary.source.test.ts \
  src/index/domains/assistant/makeRealtimeVoice.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run Make server TypeScript validation**

Run:

```bash
pnpm server:build
```

Expected: vendor synchronization and `tsc --noEmit -p tsconfig.node.json` succeed.

- [ ] **Step 3: Run the Make admin production build**

Run:

```bash
pnpm admin:build
```

Expected: the production Vite builds succeed with the current ACP public modules and Tailwind source paths.

- [ ] **Step 4: Inspect final scope**

Check relevant diffs and whitespace. Confirm `package.json` still uses `file:../../../acp-ui`, no versions changed, no npm publish occurred, and no unrelated dirty changes were modified intentionally.
