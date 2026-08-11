# Hide Disabled Figma Make Publish Action

## Context

The publish menu was widened from `w-56` (224px) to `w-72` (288px) so a long `makeExportDisabledReason` could be displayed below the `导出 Figma Make` label. This makes the whole menu wider even when that disabled reason is not visible.

## Design

- Restore the publish menu to `w-56`.
- Render `导出 Figma Make` only when the existing `showMakeExportEntry` condition is true and `makeExportDisabledReason` is empty.
- Do not display the disabled reason elsewhere in this menu.
- Keep the existing capability calculation, export handler, other menu items, section order, and backend behavior unchanged.

## Verification

- Add a focused source regression assertion for the 224px width and the combined visibility condition.
- Confirm the focused `PresentationToolbar` source tests fail before the implementation change and pass afterward.
- Run the Make admin build and inspect the final scoped diff.
