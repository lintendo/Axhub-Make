# Empty Project Bootstrap Crash Fix Design

## Problem

`@axhub/make` 0.6.8 changed the initial project preference request to call
`requireProjectScope(activeProjectId)`. When a new installation has no registered
project, workspace loading finishes with `activeProjectId === null`. The preference
effect then throws synchronously before its Promise error handler exists, unmounting
the Admin React tree instead of showing the required project-creation dialog.

## Required Behavior

- An empty project registry is a valid first-run state.
- `projectSetupRequired` continues to force the existing project-creation dialog open.
- The forced project-creation dialog cannot be dismissed until a project exists.
- Project-owned preference requests are paused while `activeProjectId` is empty.
- After project creation or selection supplies an ID, preferences load normally for
  that explicit project.
- Explicit project scoping remains strict for every request that is actually sent.

## Design

Keep project setup ownership in `ContentPanel`; do not add a second setup gate or
change dialog dismissal rules. In `useIndexPagePreferences`, treat an empty
`activeProjectId` like a not-yet-ready dependency: reset the initial preference
loading flag and return before constructing a `ProjectScope`. Apply the same guard to
the settings-saved refresh callback so no user action can synchronously validate an
empty project during setup.

Do not weaken `requireProjectScope`. Once a project ID exists, the hook continues to
use the strict scope helper and therefore cannot fall back to another active project.

## Testing

Add a regression test that covers the first-run transition:

1. Render the preference hook with loading enabled and `activeProjectId === null`.
2. Verify it does not throw and does not request bootstrap configuration.
3. Rerender with a concrete project ID.
4. Verify configuration is requested with that project ID.

Retain the existing `ContentPanel` contract assertions that `projectSetupRequired`
opens the project setup dialog and disables dismissal. Run the focused preference and
sidebar tests, then build the Admin bundle and verify the empty-project path no longer
calls `requireProjectScope`.
