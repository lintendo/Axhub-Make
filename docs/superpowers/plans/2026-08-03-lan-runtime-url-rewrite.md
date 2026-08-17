# LAN Runtime URL Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make embedded prototype and theme URLs reachable when the Make admin UI is opened through a LAN hostname instead of loopback.

**Architecture:** Resolve the project runtime origin exactly as today, then adapt only a loopback hostname to the incoming management request hostname at the shared runtime-link boundary. Pass request context from every resource response handler so the project resources, legacy entries, and theme APIs remain consistent without mutating persisted metadata.

**Tech Stack:** TypeScript 5.x, Node.js HTTP, Vitest 4, pnpm

## Global Constraints

- Use pnpm for repository development and tests.
- Preserve React 18.2.0 and TypeScript 5.x; add no dependencies.
- Preserve the runtime protocol, port, path, query, and fragment.
- Rewrite only loopback runtime hostnames for non-loopback admin request hostnames.
- Leave malformed values, loopback admin requests, and non-loopback runtime origins unchanged.
- Preserve existing uncommitted changes in overlapping files.

---

### Task 1: Request-Aware Make Client Runtime Links

**Files:**
- Create: `src/server/makeClientRuntimeLinks.test.ts`
- Modify: `src/server/makeClientRuntimeLinks.ts`
- Modify: `src/server/managementApi.entries.test.ts`
- Modify: `src/server/managementApi.entries.ts`
- Modify: `src/server/managementApi.projectRegistry.ts`
- Modify: `src/server/managementApi.dataTheme.ts`

**Interfaces:**
- Consumes: `IncomingMessage.headers`, persisted Make client runtime origin, and the existing `runtimeOriginOverride?: string` fallback.
- Produces: existing `backfillMakeClientPrototypePreviewLinks`, `backfillMakeClientThemePreviewLinks`, and `backfillMakeClientResourcePreviewLinks` functions with an optional final `request?: Pick<IncomingMessage, 'headers'>` parameter.

- [x] **Step 1: Add a failing handler regression test**

Add a test to `src/server/managementApi.entries.test.ts` that invokes the real handler with `headers.host` set to `192.168.1.42:53817`, `runtimeOrigin` set to `http://localhost:51720`, and a relative prototype URL. Assert that both returned URL fields use `http://192.168.1.42:51720`:

```ts
it('rewrites loopback runtime links to the LAN request hostname', () => {
  const { res, readBody } = createJsonResponse();

  handleEntriesCompatibilityApi(
    {
      url: '/api/entries.json',
      method: 'GET',
      headers: { host: '192.168.1.42:53817' },
    } as IncomingMessage,
    res,
    { runtimeOrigin: 'http://localhost:51720' } as any,
    {
      project: { id: 'demo-project', root: '/tmp/demo-project' },
      metadata: {
        resources: {
          prototypes: [{ id: 'home', name: 'home', clientUrl: '/prototypes/home?mode=review#summary' }],
          docs: [], themes: [], data: [], templates: [],
        },
      } as any,
    },
    '/api/entries.json',
  );

  expect(readBody().prototypes[0]).toMatchObject({
    clientUrl: 'http://192.168.1.42:51720/prototypes/home?mode=review#summary',
    previewUrl: 'http://192.168.1.42:51720/prototypes/home?mode=review#summary',
  });
});
```

- [x] **Step 2: Run the regression test and verify RED**

Run:

```bash
pnpm exec vitest run src/server/managementApi.entries.test.ts
```

Expected: FAIL because the response still contains `http://localhost:51720/prototypes/home?mode=review#summary`.

- [x] **Step 3: Implement request-host adaptation in the shared helper**

In `src/server/makeClientRuntimeLinks.ts`, import the Node request type and add request parsing that prefers the first `x-forwarded-host` value over `Host`, validates it with `URL`, and recognizes `localhost`, `127.0.0.1`, `::1`, and `[::1]`. Extend the shared backfill functions with an optional request parameter and adapt the selected runtime origin before resource URL construction:

```ts
import type { IncomingMessage } from 'node:http';

type RuntimeLinkRequest = Pick<IncomingMessage, 'headers'>;

function resolveRuntimeOriginForRequest(
  runtimeOrigin: string,
  request?: RuntimeLinkRequest,
): string {
  // Return runtimeOrigin unchanged unless it is loopback and the validated
  // incoming request hostname is non-loopback. Preserve all other URL parts.
}

export function backfillMakeClientPrototypePreviewLinks<T extends ResourceWithUrls>(
  prototypes: T[],
  projectRoot: string,
  runtimeOriginOverride?: string,
  request?: RuntimeLinkRequest,
): T[];
```

Use the same optional parameter shape for theme and combined resource backfills. Keep the implementation best-effort: parsing errors return the original origin.

- [x] **Step 4: Pass the incoming request from every response handler**

Update each existing backfill call without changing surrounding project reconciliation or resource mapping logic:

```ts
backfillMakeClientResourcePreviewLinks(metadata, projectRoot, options.runtimeOrigin, req)
backfillMakeClientThemePreviewLinks(themes, projectRoot, options.runtimeOrigin, req)
```

Apply this to `managementApi.entries.ts`, the project resources GET branch in `managementApi.projectRegistry.ts`, and both theme GET branches in `managementApi.dataTheme.ts`.

- [x] **Step 5: Run the handler regression test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/managementApi.entries.test.ts
```

Expected: PASS with all entries compatibility tests green.

- [x] **Step 6: Add shared-helper boundary tests**

Create `src/server/makeClientRuntimeLinks.test.ts` using real backfill functions. Cover:

```ts
expect(backfillFor('http://localhost:51720', { host: 'localhost:53817' }))
  .toBe('http://localhost:51720/prototypes/home');

expect(backfillFor('https://preview.example.test:51720', { host: '192.168.1.42:53817' }))
  .toBe('https://preview.example.test:51720/prototypes/home');

expect(backfillFor('http://127.0.0.1:51720', {
  host: 'localhost:53817',
  'x-forwarded-host': 'make.lan:53817, proxy.internal',
}))
  .toBe('http://make.lan:51720/prototypes/home');
```

Also cover a bracketed IPv6 LAN host so host parsing cannot regress to colon splitting.

- [x] **Step 7: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run src/server/makeClientRuntimeLinks.test.ts src/server/managementApi.entries.test.ts
pnpm server:build
```

Expected: both test files pass and the server TypeScript build exits successfully without diagnostics.

- [x] **Step 8: Review the final diff without staging unrelated work**

Run:

```bash
git diff --check -- src/server/makeClientRuntimeLinks.ts src/server/makeClientRuntimeLinks.test.ts src/server/managementApi.entries.ts src/server/managementApi.entries.test.ts src/server/managementApi.projectRegistry.ts src/server/managementApi.dataTheme.ts
git diff -- src/server/makeClientRuntimeLinks.ts src/server/makeClientRuntimeLinks.test.ts src/server/managementApi.entries.ts src/server/managementApi.entries.test.ts src/server/managementApi.projectRegistry.ts src/server/managementApi.dataTheme.ts
```

Expected: no whitespace errors; only the URL rewrite, request propagation, regression coverage, and pre-existing user changes appear.

- [x] **Step 9: Keep implementation changes uncommitted**

Do not create an implementation commit because `managementApi.entries.ts`, `managementApi.entries.test.ts`, and `managementApi.projectRegistry.ts` already contain overlapping user work. Report the exact modified files and verification results instead.
