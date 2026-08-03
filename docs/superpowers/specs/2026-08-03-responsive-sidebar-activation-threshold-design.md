# Responsive Sidebar Activation Threshold Design

## Goal

Keep the desktop sidebar expanded until the whole available Make workspace becomes narrower than the existing `1280px` adaptive desktop activation width.

## Decision

The responsive sidebar collapse threshold is the workspace width itself:

```text
1280px workspace width
```

The implementation reuses `ADAPTIVE_DESKTOP_ACTIVATION_WIDTH` from the preview layout domain instead of duplicating `1280`. It does not add the `240px` sidebar width. This keeps automatic collapse conservative while leaving the existing adaptive preview behavior responsible for narrower preview areas.

The responsive default is collapsed below `1280px` and expanded at or above `1280px`. A visible in-app assistant panel continues to reduce the available workspace width before the threshold comparison.

## Responsive Order

Adaptive preview scaling and sidebar collapse remain separate decisions and occur in this order as the workspace narrows:

1. The expanded sidebar remains in layout while the preview container is measured independently.
2. When the remaining preview container becomes narrower than `1280px`, the existing adaptive preview enters its scaled `1440x900` mode.
3. The sidebar stays expanded through that scaled-preview range.
4. Only when the whole effective Make workspace becomes narrower than `1280px` does the sidebar default to collapsed.

Collapsing the sidebar must not be used as the first response to a preview container below `1280px`. Preview scaling takes priority, and the two thresholds must not be combined.

## Scope

- Replace the sidebar's `1440 + 240 + 48` threshold with the shared `1280` activation width.
- Remove the unused horizontal preview allowance from the sidebar threshold model.
- Do not add the sidebar width to the responsive threshold.
- Keep explicit pinned sidebar choices unchanged.
- Keep the floating sidebar's vertical `top: 48px` position unchanged; it is independent of the horizontal threshold.
- Keep adaptive preview sizing and manual device selection unchanged.
- Keep preview scaling active before the narrower workspace reaches the sidebar-collapse threshold.

## Testing

The focused state test must verify:

- `1279px` defaults to collapsed.
- `1280px` defaults to expanded.
- Visible assistant-panel width is still subtracted.
- Explicit pinned choices still override the responsive default.
- Source-level integration keeps adaptive preview activation based on preview-container width and sidebar collapse based on effective workspace width.
