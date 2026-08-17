# Make Client Source Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Make client template downloads between GitHub and Gitee without waiting for a full primary timeout, and route unconfigured dependency installs between npmjs and npmmirror.

**Architecture:** Add a focused server module for npm registry probing, selection, argument construction, and retry classification. Keep template ZIP validation and cache ownership in `makeClientProject.ts`; prefer a valid cache, otherwise probe GitHub and Gitee concurrently with lightweight requests, then download and validate one full ZIP at a time with sequential fallback. Existing explicit template and npm registry configuration always wins.

**Tech Stack:** TypeScript 5.x, Node.js fetch/AbortController, execa-backed local commands, Vitest.

## Global Constraints

- Use pnpm for repository commands, while generated client installs remain npm/pnpm compatible on macOS and Windows.
- Do not modify user `.npmrc` files or global npm configuration.
- Use only `https://registry.npmjs.org` and `https://registry.npmmirror.com` for automatic npm selection.
- Keep `AXHUB_MAKE_CLIENT_TEMPLATE_URL` as a single explicit template source.
- Preserve the existing Make client template ZIP cache and version checks.
- Do not commit unrelated existing worktree changes.

---

### Task 1: npm registry routing unit

**Files:**
- Create: `src/server/makeClientRegistryRouting.ts`
- Test: `src/server/__tests__/make-client-registry-routing.test.ts`

**Interfaces:**
- Produces: `resolveMakeClientRegistryRoute(options)`, `registryInstallArgs(args, route)`, and `isRetryableRegistryError(error)`.
- Consumes: an injected `runCommand` for `npm config get registry` and injected `fetch` for bounded probes.

- [x] **Step 1: Write failing tests** for custom registry preservation, npmjs/npmmirror selection, close-result npmjs preference, failed-probe fallback, command argument construction, and retryable network errors.
- [x] **Step 2: Run tests to verify RED** with `pnpm exec vitest run src/server/__tests__/make-client-registry-routing.test.ts`; expect missing exports/module failures.
- [x] **Step 3: Implement minimal routing** by deriving `@axhub/annotation` and `vite` probe versions from the target project's `package.json`, using package-level probes when a precise minimum cannot be extracted, a 2-second request timeout, and a 150 ms close-result preference for npmjs.
- [x] **Step 4: Run tests to verify GREEN** with the same Vitest command; expect all routing tests to pass.

### Task 2: dependency install integration

**Files:**
- Modify: `src/server/makeClientProject.ts`
- Modify: `src/server/__tests__/projects-make-client-api.test.ts`

**Interfaces:**
- Consumes: registry route returned by Task 1.
- Produces: npm and pnpm install commands carrying one explicit `--registry` only when automatic routing selected a public registry.

- [x] **Step 1: Write failing API tests** proving npmmirror selection, configured-registry preservation, network-only alternate retry, and shared registry use by pnpm fallback.
- [x] **Step 2: Run the focused API tests to verify RED** with `pnpm exec vitest run src/server/__tests__/projects-make-client-api.test.ts -t "registry"`.
- [x] **Step 3: Integrate routing** into initial dependency installation and update installation without changing metadata or dev commands.
- [x] **Step 4: Run focused tests to verify GREEN** and then run the complete Make client API file.

### Task 3: template source routing

**Files:**
- Modify: `src/server/makeClientProject.ts`
- Modify: `src/server/__tests__/projects-make-client-api.test.ts`

**Interfaces:**
- Consumes: ordered GitHub/Gitee sources from the bundled or online manifest.
- Produces: a valid cached template when available; otherwise a probe-ranked source order followed by exactly one full ZIP download at a time.

- [x] **Step 1: Write failing API tests** proving GitHub and Gitee receive concurrent lightweight `HEAD` probes, only the selected source receives the first full `GET`, a failed or invalid selected download falls back with a later full `GET`, a valid cache skips probing, and an explicit template URL remains single-source without probing.
- [x] **Step 2: Run focused tests to verify RED** with `pnpm exec vitest run src/server/__tests__/projects-make-client-api.test.ts -t "template source|template probe|single full"`.
- [x] **Step 3: Implement template routing** with a 2-second probe timeout, 150 ms preference for GitHub when healthy results are close, successful probes ranked before failed probes, and sequential cache/download/extraction attempts. Probe failure must not permanently exclude a source because some servers reject `HEAD` while allowing `GET`.
- [x] **Step 4: Run focused tests to verify GREEN** and then run the complete Make client API file.

### Task 4: verification

**Files:**
- Verify: `src/server/makeClientRegistryRouting.ts`
- Verify: `src/server/makeClientProject.ts`
- Verify: related tests

- [x] **Step 1: Run unit and API tests** with `pnpm exec vitest run src/server/__tests__/make-client-registry-routing.test.ts src/server/__tests__/projects-make-client-api.test.ts`.
- [x] **Step 2: Run typecheck** with `pnpm typecheck` if defined; otherwise run the package's documented build/type verification command.
- [x] **Step 3: Inspect scoped diff** and confirm no unrelated user changes were rewritten.
