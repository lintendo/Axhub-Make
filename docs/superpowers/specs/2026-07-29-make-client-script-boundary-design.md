# Make Client Script Boundary Design

## Goal

Keep the published Make client template limited to scripts that generated projects actually execute, while preserving Axhub-owned client-template production tools in the standalone Make repository.

## Client Template Boundary

`client/scripts/` keeps only:

- build and entry generation: `build-all.js`, `scan-entries.js`;
- readiness and metadata: `check-app-ready.mjs`, `sync-project-metadata.*`;
- runtime integration: `sync-vendor-if-present.mjs`, `chrome-export-converter.mjs`, `canvas-fig-sync.mjs`;
- runtime helpers and templates under `scripts/utils/` and `scripts/templates/`;
- basic theme creation: `capture-theme-homepage.mjs` and `capture-theme-source.mjs`.

Tests are repository validation inputs, not generated-project runtime files. No `*.test.*` file remains under `client/scripts/` or enters the template ZIP.

The release manifest replaces the broad `scripts` directory inclusion with an explicit file allowlist. Future scripts therefore require an intentional release-boundary change before they can ship.

## Repository Production Tools

Move Axhub-owned client-template production tools to `scripts/client-template-production/`:

- the mobile product screenshot collector, Apple source adapter, image pipeline, metadata model, status reporter, and source-wiring tool;
- their focused tests;
- the beginner-guide font subsetting tool and its test;
- tests for the retained theme capture scripts.

Move `smoke-preview-routes.mjs` to `scripts/regression/client-preview-routes.mjs` because it validates a running client but is not used by generated projects.

The missing `regress-mobile-theme-screenshots.mjs` command is removed rather than replaced in this migration. Adding a new visual-regression implementation is outside scope.

## Commands And Dependencies

Remove `font:subset:beginner-guide` and all `screenshots:*` commands from `client/package.json`. Keep `capture:theme` and `capture:theme-source` there.

Add Make-repository commands using a `client-template:*` prefix for the migrated font and screenshot tools. Resolve the client root explicitly from the Make repository root so commands behave consistently on macOS and Windows.

Move `sharp` and `subset-font` from client development dependencies to the standalone Make repository. Keep dependencies required by retained client scripts, including TypeScript and `iconv-lite`, in the client package.

Update `@axhub/annotation` to the approved compatible range `^1.0.17`; the lockfile continues to resolve the concrete published `1.0.17` artifact.

## Verification

Tests must prove:

1. the template ZIP contains every explicitly allowed client script and both theme capture tools;
2. the ZIP contains no test, screenshot-production, font-production, or preview-smoke script;
3. migrated tools still resolve `client/src/themes` and `client/src/prototypes/beginner-guide` correctly;
4. the screenshot status command still reports 50 themes and 150 collected assets;
5. the annotation dependency contract and both workspace lockfiles resolve `^1.0.17` to `1.0.17`;
6. focused script tests, release-helper tests, client typecheck, and client build pass.

## Non-Goals

- Do not change theme assets, theme metadata, prototypes, or current screenshot regression states.
- Do not add backward-compatible wrapper scripts at the old client paths.
- Do not publish a client template, npm package, GitHub release, or Gitee release.
- Do not modify unrelated dirty-worktree files.
