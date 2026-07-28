# Toolbar Sidebar Hover Trigger Design

## Goal

Remove the duplicate compact-sidebar button shown in the narrow desktop workspace and reuse the existing presentation-toolbar sidebar icon as the only compact-sidebar trigger.

## Responsive Behavior

The sidebar icon has mode-specific behavior:

- In compact desktop mode, defined by `(max-width: 1024px) and (hover: hover) and (pointer: fine)`, pointer hover or keyboard focus on the toolbar icon temporarily opens the floating sidebar. Clicking the icon does not toggle sidebar state or pin the floating panel.
- In full desktop mode, the toolbar icon keeps its existing click-to-expand/collapse behavior. Hover and focus do not open a floating sidebar.
- Mobile mode continues to use the existing mobile layout and does not use this interaction.

The compact sidebar stays open while the pointer or keyboard focus is on either the toolbar trigger or the floating sidebar. It closes after the existing short delay when both are outside. Escape closes it and returns focus to the toolbar trigger.

## Component Design

Keep one shared compact-sidebar interaction controller at the desktop layout boundary. The toolbar trigger and sidebar content consume that controller so they coordinate one open state without duplicating buttons or sidebar content.

The responsive sidebar shell will render only the sidebar content. In compact desktop mode its flex width and visible chrome are zero, while the existing 240px content is positioned as a floating overlay. The removed 40px rail must not leave a border, background, hit target, or layout gap.

The toolbar's existing sidebar icon becomes the trigger. It receives pointer, focus, blur, and Escape handling from the shared controller. Its click handler checks the active responsive mode: compact desktop clicks are ignored, while full desktop clicks call the existing `setCollapsed` action.

## Accessibility

Keyboard focus must provide the same temporary preview as hover. The trigger exposes its expanded state and controls relationship to the floating sidebar. Moving focus into the sidebar keeps it open; Escape closes it and restores focus to the trigger.

## Verification

Add focused tests before implementation to prove that:

- The sidebar shell does not render a second button.
- Compact desktop CSS reserves zero width and contains no 40px trigger rail.
- The existing toolbar button is wired to the shared hover/focus controller.
- Clicking is suppressed in compact desktop mode but still toggles the sidebar in full desktop mode.
- Existing delayed close, focus retention, and Escape behavior continue to pass.

Run the focused Vitest suites for the sidebar shell, toolbar, and responsive workspace styles, followed by the relevant TypeScript/build validation if the focused change exposes cross-component type errors.
