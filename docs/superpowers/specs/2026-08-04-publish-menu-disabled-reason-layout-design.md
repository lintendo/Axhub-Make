# Publish Menu Disabled-Reason Layout

## Problem

The publish menu is fixed at `w-56`, and each action uses a fixed `h-7`. The disabled Figma Make action appends its full unavailable reason to the action label. Long reasons wrap to multiple lines without increasing the row height, so the text overlaps the next section.

The existing `title` attribute is not an adequate fallback because disabled Radix menu items use `pointer-events: none`, which makes the reason difficult to discover by hovering.

## Design

- Keep the action name `导出 Figma Make` on its own line.
- When the action is unavailable, render the reason as a smaller secondary line inside the same menu item.
- Let this item grow to fit its content; keep the icon aligned with the primary label and prevent it from shrinking.
- Increase this publish menu from 224px to 288px so technical reasons remain readable without making the menu excessively wide.
- Preserve the current disabled behavior and action handlers. Other menu entries and section ordering remain unchanged.

## Scope

Only the publish menu in `PresentationToolbar` and its focused regression test are changed. Shared dropdown primitives, export-availability rules, and backend export behavior remain untouched.

## Verification

- Add a source regression assertion that the Figma Make label and disabled reason are rendered as separate elements and that the item is not fixed-height.
- Run the focused Vitest file and TypeScript/build verification appropriate to the Make admin app.
- Open the admin UI and inspect the menu at desktop and narrow viewport widths, confirming that no label or section overlaps and that the disabled reason remains readable.
