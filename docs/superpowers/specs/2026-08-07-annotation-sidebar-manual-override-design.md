# Annotation Sidebar Manual Override Design

## Goal

Keep the existing behavior that entering annotation mode automatically collapses the left sidebar, while allowing an explicit sidebar click to expand or collapse it immediately. A manual choice made during annotation remains the user's pinned choice after annotation exits.

## Root Cause

The sidebar currently combines three state layers:

1. A responsive default derived from available workspace width.
2. An explicit pinned choice.
3. A temporary system-collapse override used by annotation entry.

The effective resolver gives the system override highest priority. Annotation sets that override to `true`, but the shared `setCollapsed` callback only updates the pinned choice. Clicking “expand” therefore writes `pinnedCollapsed = false` while `systemCollapsed = true` remains active, so the rendered sidebar stays collapsed.

The system override was introduced to avoid restoring a stale pre-annotation snapshot on exit. Reverting to snapshot restoration would reintroduce the responsive and user-choice regression that the override fixed.

## Design

Retain the existing three-layer state model and its precedence. Treat an explicit `setCollapsed` call as a user/pinned decision that also ends the temporary system override:

```text
explicit sidebar change
  -> resolve the requested collapsed value against the current effective state
  -> clear systemCollapsed
  -> store the requested value as pinnedCollapsed
```

Annotation entry continues to set `systemCollapsed = true`, so it still auto-collapses even when the sidebar was previously pinned open. If the user does not interact, annotation exit clears the system override and reveals the current responsive or pinned decision. If the user does interact, the click has already cleared the override, and exit becomes a no-op for sidebar state.

Programmatic deep-link calls currently use the same explicit setter only to request `collapsed = true`. Clearing the system override in those calls is safe because the resulting pinned value remains collapsed.

## Preview Stabilization Boundary

Do not change the `annotation-sidebar` preview layout stabilization lifecycle. It starts when annotation causes an expanded sidebar to collapse and ends when the editor exits. It remains active if the user expands or collapses the sidebar during annotation, so these internal layout changes do not alter the automatic desktop viewport decision. Real window, host, and persistent assistant-panel resizing continues to affect the responsive basis through the existing external-workspace measurement.

## Testing

Add a focused regression assertion before implementation that requires the explicit sidebar setter to clear the system override before storing the pinned choice. Keep the existing tests that prove:

- System collapse wins on annotation entry.
- Annotation owns only the `annotation-sidebar` stabilization reason.
- Editor exit clears the system override and ends stabilization.
- Responsive defaults, pinned choices, and system overrides remain separate.

Run the focused sidebar and preview-action Vitest suites, followed by the Make admin build. Browser verification covers entering annotation, clicking to expand, clicking to collapse again, exiting annotation, and resizing the desktop workspace while annotation remains active.

## Scope

- No snapshot restoration.
- No change to sidebar responsive thresholds or floating-preview behavior.
- No change to annotation editor lifecycle.
- No change to device URL serialization or preview viewport thresholds.
- No unrelated sidebar or preview refactor.
