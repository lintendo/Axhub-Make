# Responsive Preview Layout Stabilization Design

## Goal

Keep the default desktop prototype preview responsive to real workspace resizing while preventing temporary Make UI surfaces from changing the automatic desktop viewport decision.

The reported failure occurs when the preview starts in the derived fixed `1440x900` mode, a layout-affecting surface opens, and the outer window later becomes wider. The current session-wide boolean lock keeps the old automatic decision and therefore prevents the preview from returning to fluid desktop mode.

## Root Cause

The current preview device controller combines three independent concerns:

1. User intent, such as desktop, mobile, tablet, custom, split, or multi-page.
2. Live preview-container measurement.
3. A `lockedAdaptiveDesktop` boolean used by annotation and review UI.

The boolean can preserve a decision, but it cannot identify why the container width changed. It treats sidebar collapse, review-panel insertion, browser resizing, host resizing, and persistent assistant-panel resizing as the same event. Once locked, every later width change is ignored until an unrelated close path releases the lock.

The same boolean is also shared by annotation and review. Overlapping layout-affecting surfaces can therefore release each other's lock in the wrong order.

## Terminology

A **preview layout stabilization scope** is the lifetime of a temporary Make UI surface whose own layout change must not alter the automatic preview device decision.

Initial reasons are:

- `annotation-sidebar`: annotation temporarily collapses an expanded left sidebar.
- `review-panel`: review temporarily inserts the right-side review panel.

This is a UI layout concept. It is not an AI conversation, task, annotation data session, or review report session.

## State Ownership

Preview state remains separated into four layers:

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Device intent | Preview device actions | Stores explicit user choices and URL-serializable device state. |
| Actual preview measurement | Content area | Measures the rendered preview container width and height. |
| Stable external workspace measurement | Desktop workspace boundary | Measures width changes outside the temporary preview-affecting surfaces, including window, host, and persistent assistant-panel changes. |
| Stabilization scope | Preview responsive controller | Anchors the automatic preview basis while one or more named temporary layout reasons are active. |

The adaptive desktop resolver remains a pure function. It receives a responsive basis width and must not know about sidebars, panels, animation timing, React refs, or scope lifecycles.

## Responsive Basis Model

Without an active stabilization scope, the responsive basis is the live preview-container width.

When the first stabilization reason starts, the controller captures:

- `anchorPreviewWidth`: the current responsive basis width.
- `anchorExternalWorkspaceWidth`: the current stable external workspace width.

While at least one reason remains active, the responsive basis is:

```text
anchorPreviewWidth
  + (currentExternalWorkspaceWidth - anchorExternalWorkspaceWidth)
```

This formula has two intentional effects:

- Internal layout changes from the active annotation sidebar or review panel do not affect the automatic preview choice.
- Real changes to the window, host area, or persistent assistant panel continue to move the responsive basis one-for-one.

The model does not depend on the sidebar currently being `240px`, the review panel currently being `380px`, or CSS transition completion.

## Stabilization Lifecycle

The controller maintains a set of active reasons rather than a shared boolean.

- Adding the first reason captures the anchor.
- Adding another reason preserves the existing anchor.
- Removing one reason leaves stabilization active while any other reason remains.
- Removing the last reason releases the anchor and immediately returns to the live preview-container width.
- Adding a reason that produces no layout change is allowed and harmless, but annotation should add `annotation-sidebar` only when it actually collapses the sidebar.
- Manual device choices remain effective immediately because non-default modes bypass adaptive desktop derivation. They do not mutate or clear layout reasons.

Annotation cleanup must remove `annotation-sidebar` in the same guaranteed exit path that restores the sidebar. Review cleanup must derive `review-panel` directly from the rendered open state so unmounts and resource switches cannot leave a stale reason.

Sidebar ownership is split into three layers: responsive default, explicit user pin, and a temporary system-collapse override used by editor entry. Clearing the system override restores the current responsive/pinned decision instead of pinning the value observed at editor entry. Review stabilization follows the same rendered-panel predicate used by `PresentationArea`, so switching to canvas, a start-draft surface, or a placeholder releases the scope even if the review toggle remains true.

## External Workspace Measurement

`IndexPageDesktop` is the top-level owner because it already measures the desktop workspace and knows the persistent assistant panel's visibility and width.

It reports this stable value:

```text
desktop workspace client width - visible persistent assistant panel width
```

Temporary left-sidebar collapse and the in-presentation review panel are intentionally not subtracted here. Their effects belong to stabilization scopes.

The callback must report the initial value and subsequent `ResizeObserver`, assistant visibility, and assistant width changes. Invalid or zero measurements are ignored without destroying the last valid value.

## Component Flow

```text
IndexPageDesktop
  -> reports stable external workspace width

ContentAreaView
  -> reports actual preview-container width
  -> uses actual width and height for final iframe layout

Preview responsive controller
  -> stores live measurements
  -> stores named stabilization reasons and anchor
  -> derives responsive basis width

Adaptive desktop resolver
  -> default desktop + basis < 1280: derived fixed 1440x900
  -> default desktop + basis >= 1280: fluid desktop
  -> manual modes: unchanged
```

The final iframe layout continues to use the actual preview-container dimensions. Only the choice between fluid desktop and derived fixed `1440x900` uses the stabilized responsive basis.

## Failure Handling

- A missing initial external workspace measurement falls back to the live preview-container width.
- Starting stabilization before a usable preview width exists records the reason and captures the first valid pair of measurements later.
- Invalid or transient zero measurements preserve the last valid values.
- Repeated begin/end calls for the same reason are idempotent.
- Resource changes and editor exit paths remove their owned reason without clearing reasons owned by another surface.

## Testing

Pure controller tests cover:

- No scope: live preview width drives the responsive basis.
- Annotation scope: sidebar-caused container growth does not change the basis.
- Annotation scope plus real workspace growth: the basis grows by the external delta and crosses back to fluid desktop.
- Review scope: panel-caused container shrink does not change the basis.
- Overlapping annotation and review reasons: closing either one does not release the other's stabilization.
- Last reason removal: the live container width becomes authoritative immediately.
- Invalid and delayed measurements.

Integration/source tests cover:

- The desktop workspace reports stable external available width.
- Annotation adds and removes only `annotation-sidebar`.
- Review open state owns `review-panel` without imperative lock/unlock races.
- `lockedAdaptiveDesktop`, `lockAdaptiveDesktopPreview`, and `unlockAdaptiveDesktopPreview` are removed.

Browser verification covers:

1. Start narrower than the activation threshold and confirm derived `1440x900`.
2. Open annotation so the sidebar collapses; confirm the viewport decision stays stable.
3. Resize the window wider while annotation remains open; confirm the preview returns to fluid desktop.
4. Resize narrower again; confirm it returns to derived `1440x900`.
5. Repeat with the review panel.
6. Open annotation and review together, close them in both orders, and confirm no stale stabilization remains.
7. Confirm manual mobile, tablet, custom, split, and multi-page modes remain unchanged.

## Scope Boundaries

- Do not change the `1280px` adaptive activation threshold.
- Do not change the fixed adaptive desktop viewport size of `1440x900`.
- Do not change device URL serialization.
- Do not add backward-compatibility state for `lockedAdaptiveDesktop`; it is transient React state and has no persisted contract.
- Do not refactor unrelated sidebar, review, iframe measurement, or device-menu behavior.
