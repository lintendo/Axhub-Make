# Responsive Sidebar Activation Threshold Design

## Goal

Keep the desktop sidebar expanded whenever the remaining preview area can still provide the existing `1280px` adaptive desktop activation width.

## Decision

The responsive sidebar collapse threshold is:

```text
1280px preview activation width + 240px sidebar width = 1520px workspace width
```

The implementation reuses `ADAPTIVE_DESKTOP_ACTIVATION_WIDTH` from the preview layout domain instead of duplicating `1280`. This keeps the sidebar threshold aligned with the preview behavior if that shared activation width changes later.

The responsive default is collapsed below `1520px` and expanded at or above `1520px`. A visible in-app assistant panel continues to reduce the available workspace width before the threshold comparison.

## Scope

- Replace the sidebar's `1440 + 240 + 48` threshold with `1280 + 240`.
- Remove the unused horizontal preview allowance from the sidebar threshold model.
- Keep explicit pinned sidebar choices unchanged.
- Keep the floating sidebar's vertical `top: 48px` position unchanged; it is independent of the horizontal threshold.
- Keep adaptive preview sizing and manual device selection unchanged.

## Testing

The focused state test must verify:

- `1519px` defaults to collapsed.
- `1520px` defaults to expanded.
- Visible assistant-panel width is still subtracted.
- Explicit pinned choices still override the responsive default.
