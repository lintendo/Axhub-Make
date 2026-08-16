# ACP Probe Timeout by Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use a 15-second ACP endpoint probe timeout for Axhub Make `--dev` processes and a 3-second timeout for all other processes.

**Architecture:** Add one pure timeout resolver beside the existing assistant runtime constants. The existing `fetchEndpoint` helper will call it when creating its abort signal, leaving probe order, retries, startup, port release, and kill behavior unchanged.

**Tech Stack:** TypeScript 5, Node.js `process.argv`, Vitest 4

## Global Constraints

- Development timeout is exactly 15,000 milliseconds.
- Non-development timeout is exactly 3,000 milliseconds.
- Development mode is detected from the existing exact `--dev` CLI argument.
- Do not add environment variables, settings, PID tracking, or service identity changes.
- Preserve all existing uncommitted changes in the implementation and test files.

---

### Task 1: Environment-aware ACP endpoint probe timeout

**Files:**
- Modify: `src/server/assistantRuntime.ts:16-22,481-487`
- Test: `src/server/__tests__/assistant-runtime-api.test.ts:56-64,344`

**Interfaces:**
- Consumes: `process.argv` or an injected `readonly string[]` for deterministic tests.
- Produces: `resolveAssistantEndpointProbeTimeoutMs(options?: { argv?: readonly string[] }): number`.

- [ ] **Step 1: Write the failing tests**

Extend the assistant runtime import and add focused tests:

```ts
const {
  resolveAssistantEndpointProbeTimeoutMs,
  resolveAssistantMakeCorsOrigins,
  resolveAssistantRuntime,
  runAssistantBootstrap,
} = await import('../assistantRuntime.ts');

describe('resolveAssistantEndpointProbeTimeoutMs', () => {
  it('uses 15 seconds when Axhub Make is started with --dev', () => {
    expect(resolveAssistantEndpointProbeTimeoutMs({
      argv: ['node', 'src/server/cli.ts', '--', '--dev'],
    })).toBe(15_000);
  });

  it('uses 3 seconds outside Axhub Make development mode', () => {
    expect(resolveAssistantEndpointProbeTimeoutMs({
      argv: ['node', 'src/server/cli.ts'],
    })).toBe(3_000);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/__tests__/assistant-runtime-api.test.ts -t resolveAssistantEndpointProbeTimeoutMs --coverage.enabled=false
```

Expected: FAIL because `resolveAssistantEndpointProbeTimeoutMs` is not exported.

- [ ] **Step 3: Implement the minimum timeout resolver**

Replace the fixed endpoint timeout with named development and production constants, export the pure resolver, and call it from `fetchEndpoint`:

```ts
const ACP_UI_DEVELOPMENT_ENDPOINT_PROBE_TIMEOUT_MS = 15_000;
const ACP_UI_PRODUCTION_ENDPOINT_PROBE_TIMEOUT_MS = 3_000;

export function resolveAssistantEndpointProbeTimeoutMs(
  options: { argv?: readonly string[] } = {},
): number {
  const argv = options.argv || process.argv;
  return argv.includes('--dev')
    ? ACP_UI_DEVELOPMENT_ENDPOINT_PROBE_TIMEOUT_MS
    : ACP_UI_PRODUCTION_ENDPOINT_PROBE_TIMEOUT_MS;
}

async function fetchEndpoint(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(resolveAssistantEndpointProbeTimeoutMs()),
  });
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/__tests__/assistant-runtime-api.test.ts -t resolveAssistantEndpointProbeTimeoutMs --coverage.enabled=false
```

Expected: 2 tests pass with no failures.

- [ ] **Step 5: Run package-level verification**

Run:

```bash
pnpm exec vitest run src/server/__tests__/assistant-runtime-api.test.ts --coverage.enabled=false
pnpm server:build
```

Expected: the new timeout tests pass; record any pre-existing failures from the already-modified assistant runtime suite separately. The TypeScript server build exits successfully.

- [ ] **Step 6: Inspect the final scoped diff**

Run:

```bash
git diff --check -- src/server/assistantRuntime.ts src/server/__tests__/assistant-runtime-api.test.ts
git diff -- src/server/assistantRuntime.ts src/server/__tests__/assistant-runtime-api.test.ts
```

Expected: no whitespace errors, and the diff contains only the timeout resolver/test additions plus the user's pre-existing changes.
