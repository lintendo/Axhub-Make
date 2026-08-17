# Responsive Sidebar And Device Preview URL Design

## Goal

Keep prototype design work usable when Axhub Make is opened beside an AI conversation panel or inside another width-constrained desktop host. The workspace should release sidebar space early, preserve a mainstream desktop design viewport, and make manual single-device preview sizes shareable through the current URL.

## Scope

This change covers the desktop workspace sidebar, the default single-page prototype preview, and the preview device query parameter.

It does not change the coarse-pointer mobile workspace, split preview URL state, multi-page preview URL state, or the behavior of manually selected preview sizes.

## Responsive Targets

The responsive rules use these shared design targets:

- Main desktop design viewport: `1440x900`.
- Adaptive desktop activation width: `1280px`.
- Fixed sidebar width: `240px`.
- Preview horizontal allowance: `48px`.
- Small desktop workspace threshold: `1728px`, derived from `1440 + 240 + 48`.
- Floating sidebar top offset: `48px`, leaving the 40px presentation toolbar and an 8px gap unobstructed.

The small-versus-large workspace decision must use the actual Make desktop workspace width available after any visible in-app assistant panel. It must not depend only on the physical screen width. An external AI conversation panel naturally reduces the browser viewport and therefore also reduces this measured workspace width.

## Sidebar State Model

The sidebar has three separate concerns:

1. Responsive default: collapsed below the small desktop threshold and expanded at or above it.
2. Pinned state: the user's explicit click choice to keep the sidebar expanded or collapsed.
3. Temporary preview state: a hover- or focus-driven floating sidebar shown only while the sidebar is collapsed.

Responsive changes may update the sidebar only while no explicit pinned choice exists. Once the user clicks the trigger, that pinned choice takes priority across later size changes. An explicit collapsed deep link is also treated as an explicit choice rather than a responsive default.

The effective rendering rules are:

- Pinned expanded: the sidebar occupies its normal `240px` layout width.
- Pinned or responsively collapsed, temporary preview closed: the sidebar occupies zero layout width and its content is hidden.
- Pinned or responsively collapsed, temporary preview open: the sidebar occupies zero layout width and its content is rendered as a floating overlay.

## Sidebar Trigger Behavior

The presentation-toolbar sidebar button keeps one interaction contract at every desktop width:

- Clicking always toggles the pinned expanded/collapsed state.
- Hovering or focusing opens a temporary preview only when the sidebar is collapsed.
- Moving the pointer or focus between the trigger and floating sidebar keeps the preview open.
- Leaving both regions closes the preview after the existing short delay.
- Pressing Escape closes the temporary preview and restores focus to the trigger.
- Clicking to collapse closes the temporary preview immediately and suppresses a stale hover-open state until the pointer leaves or re-enters the trigger.
- Hover and focus handlers are inactive while the sidebar is pinned expanded.

The current compact-desktop rule that suppresses trigger clicks is removed. Responsive width affects only the default pinned state, not the button contract.

## Floating Sidebar Layout

The temporary sidebar preview is positioned below the presentation toolbar so it cannot cover the trigger:

- `top: 48px`.
- `bottom: 8px`.
- `left: 8px`.
- `width: 240px`.

It retains the existing border, background, shadow, transition, pointer retention, and focus retention. A pinned expanded sidebar remains in normal layout flow and continues to use the full workspace height.

## Adaptive Desktop Preview

Preview state distinguishes user intent from effective rendering:

- User intent is the manually selected preview configuration.
- Effective rendering may derive a temporary `1440x900` custom viewport from the default desktop intent.

The effective preview resolver applies these rules in order:

1. If the user selected mobile, tablet, custom, split, or multi-page, preserve that selection unchanged.
2. If the user is in the default desktop mode and the measured preview area can provide at least 1280 logical pixels, render the existing fluid desktop preview.
3. If the user is in the default desktop mode and the measured preview area is narrower than 1280 logical pixels, render a frameless `1440x900` custom viewport scaled to the available area.
4. When the area reaches 1280 logical pixels again, return automatically to the fluid desktop preview.

The derived `1440x900` viewport behaves like a fixed browser viewport with internal iframe scrolling. It must not use the existing custom fit-screen behavior that expands the logical height to the full document and shrinks a long page into a miniature full-page preview.

The toolbar reflects the effective derived state by showing the custom device icon and `1440x900` fields. This visual change does not convert the default user intent into a manual custom selection.

Selecting desktop explicitly clears any manual single-device setting and returns to the default adaptive desktop behavior.

Entering prototype, PRD, or HTML annotation mode may collapse the sidebar, but it must not change the current automatic viewport decision. The device state records whether the default desktop intent was fluid or derived `1440x900` before the layout change and keeps that decision for the annotation session. Exiting annotation releases the lock after restoring the sidebar. Explicit device actions clear the lock and remain effective immediately. Markdown annotation keeps its existing independent document-edit lifecycle and does not acquire this prototype viewport lock.

## URL Contract

The `device` query parameter stores only an explicit manual single-viewport size. It uses lowercase ASCII `x` as the separator:

```text
?device=393x852
?device=820x1180
?device=1280x800
```

Rules:

- Default adaptive desktop omits `device`.
- The automatically derived `1440x900` viewport also omits `device`.
- Selecting desktop removes `device`.
- Selecting mobile writes `device=393x852`.
- Selecting tablet writes `device=820x1180`.
- Selecting a custom size writes its normalized width and height.
- An exact mobile or tablet preset parsed from the URL restores the corresponding named preset.
- Any other valid size restores manual custom mode, including an explicitly supplied `device=1440x900`.
- Invalid, incomplete, non-positive, or out-of-range values are ignored without disrupting the resource deep link.
- Split and multi-page modes are not encoded in `device`.

The current resource deep-link builder and parser must preserve this optional preview setting while continuing to use `history.replaceState`. Device changes must not add browser history entries.

## Data Flow

The desktop workspace boundary measures the width available to the sidebar and presentation area after subtracting a visible in-app assistant panel. A responsive-default resolver turns that measurement into the default collapsed state.

The sidebar controller combines the responsive default, optional explicit pinned choice, and temporary preview interaction. The sidebar shell consumes the effective pinned and temporary states, while the toolbar trigger consumes stable click, pointer, focus, Escape, and accessibility bindings.

The content area already measures its preview container. A pure adaptive-preview resolver combines that measurement, the user preview configuration, and an optional annotation-session decision lock to produce the effective configuration used by layout and toolbar rendering.

The URL parser initializes the manual preview configuration. Later manual single-device changes update the resource deep-link target, while derived adaptive changes remain outside the URL state.

## Accessibility

- The trigger label always describes the click action: expand when collapsed, collapse when expanded.
- While collapsed, the trigger exposes `aria-controls` and temporary `aria-expanded` state.
- Keyboard focus opens the same temporary preview as pointer hover.
- Focus moving into the floating sidebar keeps it open.
- Escape closes the floating sidebar and restores trigger focus.
- Pinned expansion remains reachable through click, Enter, and Space at every desktop width.

## Testing

Focused tests cover:

- Responsive default resolution above and below 1728px, including visible assistant-panel width.
- Explicit user and deep-link choices taking priority over later responsive changes.
- Click toggling at all desktop widths without compact-mode suppression.
- Hover and focus opening only while collapsed.
- Pointer and focus retention between the trigger and floating panel.
- Collapse click clearing temporary hover state.
- Floating sidebar positioning below the toolbar.
- Default desktop staying fluid at 1280px or wider, including the approximately 1350px canvas in the reported embedded-browser layout.
- Default desktop deriving a fixed, internally scrollable `1440x900` viewport below 1280px.
- Annotation entry collapsing the sidebar without changing the automatic viewport decision, while explicit device actions remain effective.
- Manual mobile, tablet, custom, split, and multi-page selections bypassing automatic derivation.
- URL parsing and serialization for preset, custom, absent, and invalid `device` values.
- Resource navigation retaining the current manual device parameter without adding history entries.

After focused Vitest coverage, run the Make admin type/build validation and inspect the desktop workspace at representative wide and narrow viewports. Visual verification must confirm that the floating panel does not cover the sidebar trigger, the main prototype remains a desktop design viewport beside an AI conversation panel, and manual device links reload consistently.
