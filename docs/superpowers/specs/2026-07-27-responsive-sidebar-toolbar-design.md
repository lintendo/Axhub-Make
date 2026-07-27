# Responsive Sidebar and Toolbar Design

## Goal

Prevent narrow desktop windows from accidentally entering the mobile resource-list UI, while adding a compact desktop mode that preserves workspace context without permanently consuming sidebar width.

## Scope

This change applies to the Make Admin index workspace:

- Mobile layout activation.
- The project sidebar's desktop, compact, and mobile presentation.
- The presentation toolbar and its publish action.

It does not redesign the mobile resource list, change resource actions, add persistent sidebar preferences, or introduce an overflow menu for hidden toolbar actions.

## Responsive Modes

The UI has three mutually exclusive modes:

| Mode | Condition | Sidebar | Toolbar |
| --- | --- | --- | --- |
| Mobile | `(max-width: 640px) and (hover: none) and (pointer: coarse)` | Existing mobile resource list | Existing mobile layout only |
| Compact desktop | Hover-capable environment at or below 1024px | Closed by default; opened temporarily as a floating card | Contextual actions and publish hide together only when the toolbar container lacks room |
| Full desktop | Hover-capable environment above 1024px | Existing fixed 240px sidebar | Existing controls remain visible while room allows |

The mobile rule is deliberately device-aware. A desktop browser narrowed below 640px remains in the compact desktop workspace rather than switching to the mobile list.

## Compact Sidebar

Compact desktop mode renders a 40px visible sidebar trigger at the left workspace edge. The normal sidebar content remains one component; it is not duplicated for compact mode.

Pointer entry or keyboard focus on the trigger opens the sidebar content as a positioned floating card:

- The card has the existing sidebar content at 240px width.
- It overlays the workspace with elevation and a bounded transition; it never changes the content area's flex width.
- Moving the pointer from the trigger into the card keeps it open. Leaving both closes it after a short delay so normal pointer travel does not flicker.
- Keyboard focus inside the trigger or card keeps it open; focus leaving the card closes it. Escape closes an open card.
- Touch/mobile mode does not depend on hover and does not render this compact desktop interaction.

The compact mode is always visually collapsed. Toolbar controls or deep links that currently set the sidebar's `collapsed` state must not make the sidebar consume workspace width in compact mode.

## Adaptive Toolbar

The presentation toolbar will expose its available inline size as a CSS query container. Its leading controls retain their existing placement. Contextual page actions and the publish button belong to one adaptive action group:

- With sufficient inline room, all existing actions and publish remain visible.
- At `max-width: 600px` of available toolbar inline size, the contextual action group and publish button hide together.
- The group becomes visible again automatically when the container regains room, including when an assistant or review panel closes.
- No new "more" menu is introduced. Hidden actions are intentionally unavailable until sufficient workspace width returns.

The implementation uses a simple container-query threshold rather than JavaScript width measurement. That makes the behavior local to the toolbar's actual allocated space, including side panels, without resize observers, debounce logic, or a new interaction state machine.

## Implementation Boundaries

- Keep responsive-mode classification and compact-sidebar interaction local to the index layout/sidebar components.
- Keep toolbar visibility rules in the presentation toolbar and its stylesheet/classes.
- Do not route viewport state through server configuration, project metadata, or persisted UI preferences.
- Reuse current sidebar and toolbar actions; this change only alters their presentation and availability under constrained width.

## Verification

Add focused automated coverage for:

- The mobile CSS media rule requiring both narrow width and touch/non-hover capability.
- Compact desktop behavior at the 1024px boundary and preservation of the desktop workspace below 640px on hover-capable devices.
- A compact sidebar trigger/card implementation that overlays instead of changing the flex layout, including keyboard focus and escape-close semantics.
- Toolbar container-query rules that hide and restore the contextual action group and publish together.

Run the affected Vitest suites and the Make package's required type/build validation before delivery.
