# AI Panel Tab-Session Persistence Design

**Date:** 2026-08-06

## Goal

Remember the right-side AI panel state only within the current browser tab:

- Refreshing the same tab restores an open general AI panel as general AI.
- Refreshing the same tab restores an open image AI panel as image AI.
- Refreshing after a manual close keeps the panel closed.
- A separate browser tab does not inherit the remembered state.

Browser duplicate-tab behavior does not require special handling beyond the platform's standard `sessionStorage` semantics.

## Current Behavior

`IndexPage` already records two project-scoped values through helpers in `index-page.helpers.ts`:

- whether automatic panel restoration was dismissed;
- the last restorable panel mode (`general-ai` or `image-ai`).

Both helpers currently default to `window.localStorage`. That storage is shared by same-origin browser tabs, so opening or closing either AI panel in one tab affects restoration in other tabs.

## Design

Keep the existing keys, project scoping, call sites, restoration effects, and error behavior. Change only the helpers' default browser storage from `window.localStorage` to `window.sessionStorage`.

The resulting data flow is:

1. Opening general AI records `dismissed = false` and `panelMode = general-ai` in the current tab's session storage.
2. Opening image AI records `dismissed = false` and `panelMode = image-ai` in the current tab's session storage.
3. Manually closing either panel records `dismissed = true` in the current tab's session storage.
4. On refresh, `IndexPage` reads the same tab session and restores only when `dismissed` is false, using the remembered mode.
5. A normal new browser tab starts with an independent session storage area and therefore does not consume state from another tab.

Existing `localStorage` values will not be migrated or read. This avoids cross-tab compatibility logic and lets the new tab-scoped behavior take effect immediately.

## Failure Behavior

Preserve the current conservative fallback when browser storage is unavailable or throws:

- reads treat automatic restoration as dismissed;
- panel mode falls back to `general-ai`;
- writes are ignored.

This prevents storage failures in private or embedded contexts from unexpectedly opening the AI panel.

## Testing

Use test-driven development:

1. Add a failing helper test proving that the default persistence backend uses `sessionStorage` and leaves `localStorage` untouched.
2. Keep the existing behavioral tests for project-scoped dismissed state and remembered general/image AI mode.
3. Run the focused helper test and the relevant `IndexPage` tests after implementation.
4. Run the package's required type and test verification in proportion to the change.

## Scope

In scope:

- browser-tab-scoped persistence for panel open/closed state;
- browser-tab-scoped persistence for the last general/image AI mode;
- focused regression coverage.

Out of scope:

- special coordination for browser duplicate-tab commands;
- changing panel width persistence;
- changing project-switch behavior;
- changing iframe, conversation, image generation, or AI runtime state;
- migrating historical `localStorage` values.
