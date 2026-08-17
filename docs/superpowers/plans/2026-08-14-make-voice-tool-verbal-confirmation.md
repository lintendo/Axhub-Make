# Make Voice Tool Verbal Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove programmatic authorization dialogs from every Make voice tool while retaining conversational guidance.

**Architecture:** Make remains the owner of its host-tool permissions. The Make registry declares every tool as non-confirming, while ACP keeps its generic confirmation support for other consumers.

**Tech Stack:** TypeScript, React 18, Vitest, pnpm

**Spec:** `docs/superpowers/specs/2026-08-14-make-voice-tool-verbal-confirmation-design.md`

## Global Constraints

- Use pnpm for all Make development and verification commands.
- Keep ACP's generic confirmation protocol unchanged.
- Keep verbal confirmation guidance in the Make prompt and tool descriptions.
- Preserve existing validation, persistence, idempotency, and cancellation behavior.

---

### Task 1: Make every voice tool non-confirming

**Files:**
- Modify: `src/index/domains/assistant/makeVoiceTools.test.ts`
- Modify: `src/index/domains/assistant/makeVoiceTools.ts`
- Modify: `src/server/__tests__/axhub-preview-mcp.test.ts`

**Interfaces:**
- Consumes: `createMakeVoiceToolRegistry(dependencies): MakeVoiceToolRegistration[]`
- Produces: Make registrations whose `confirmation` is always `'none'`; `toAcpVoiceHostTools` therefore emits `requiresConfirmation: false`.

- [x] **Step 1: Write the failing registry policy test**

Change the expected tuples in the existing registry behavior test so all eleven tools use `'none'`, then add an adapter assertion over the real registry:

```ts
expect(registry.every((tool) => tool.confirmation === 'none')).toBe(true);
expect(toAcpVoiceHostTools(registry).every((tool) => tool.requiresConfirmation === false)).toBe(true);
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/index/domains/assistant/makeVoiceTools.test.ts
```

Expected: FAIL because create, execute, cancel, and delete still use `'required'`.

- [x] **Step 3: Remove programmatic confirmation declarations**

Delete `confirmation: 'required'` from the four write/destructive tool definitions in `makeVoiceTools.ts`. The existing `createTool` default then normalizes every registration to `'none'`.

- [x] **Step 4: Run focused and package verification**

Run:

```bash
pnpm exec vitest run src/index/domains/assistant/makeVoiceTools.test.ts src/index/domains/assistant/makeRealtimeVoice.test.ts src/server/__tests__/axhub-preview-mcp.test.ts
pnpm exec tsc --noEmit -p tsconfig.node.json
```

Expected: all tests pass and TypeScript exits with code 0.

- [x] **Step 5: Restart and verify the Make runtime**

Restart the existing Make development server with the repository CLI, verify `http://localhost:53817` returns HTTP 200, and confirm the current registry passed to ACP contains no `requiresConfirmation: true` entries.
