# Canvas Viewport AI Intent Design

## Goal

Make the one-click canvas viewport AI distinguish whether the user intends to edit existing canvas content, add related content, or clarify an ambiguous request before changing the `.excalidraw` file.

## Root Cause

The current viewport prompt always prefers placing new content to the right and then below, and says not to replace existing content. That unconditional placement rule overrides visual evidence such as a rough circle, pointer arrow, or nearby instruction that targets an existing node or connection. The `canvas-workspace` skill explains file editing mechanics but does not define how to interpret temporary visual editing marks.

## Intent Classification

Before writing, classify the visible request as exactly one of these modes:

| Mode | Evidence | Action |
| --- | --- | --- |
| `edit` | A mark or instruction points to existing elements and asks to change, remove, reconnect, replace, or correct them. | Modify the targeted original elements and relationships in place. Preserve stable IDs when the element identity remains the same. |
| `add` | The user explicitly asks to add, generate, extend, or supplement content without replacing a targeted existing structure. | Place the new content in a nearby non-overlapping area chosen from any direction according to available space, semantic relationship, and reading order. |
| `unclear` | The screenshot and canvas file do not establish one reliable interpretation. | Ask the clarification questions needed to resolve the ambiguity and do not write speculative changes. |

Visual marks are evidence, not an automatic edit command by element type alone. Use the screenshot together with element positions, styles, text, bindings, grouping, and visible element IDs from the current file. Do not classify every `freedraw`, `arrow`, or text element as temporary annotation.

Do not impose a numeric limit on clarification questions. Ask only when the intent or target is genuinely unclear, combine related unknowns when practical, and avoid questions whose answers can be inferred safely from the screenshot and current file.

## In-Place Editing

For `edit` intent:

1. Resolve the marked target from screenshot geometry and the current file.
2. Apply the requested semantic change to the original node, branch, connector, label, group, or surrounding structure.
3. Update Excalidraw version fields and repair bindings, containers, groups, and arrow references.
4. Re-read the file immediately before writing and preserve unrelated canvas content.

For the acceptance-flow example, the note and rough pointer indicate that the failed acceptance branch should enter the existing negotiation flow. The correct behavior is to reconnect or restructure the original flow, not create a second explanatory flow beside it.

## Annotation Cleanup

After applying the change, remove only operation marks that obscure formal nodes, labels, or connectors, or that would make the finished diagram ambiguous. Preserve non-obstructing explanatory text unless the user asks to remove it.

In the example:

- Remove the thick rough circle and pointer where they overlap the acceptance diamond and connectors.
- Preserve the nearby explanatory sentence because it does not obstruct the formal diagram.

Never bulk-delete elements only because their type is `freedraw`, `arrow`, or `text`.

## Prompt And Skill Changes

- Replace the fixed right-then-below rule in `canvasViewportAiPrompt.ts` with the three-mode intent contract.
- Keep the direct-file-only and no-MCP constraints unchanged.
- Add the reusable intent and cleanup recipe to both mirrored `canvas-workspace` skills under `.agents` and `.claude`.
- Add detailed JSON-level cleanup and relationship checks to `references/canvas-read-write.md` in both mirrors.

## Testing

- Extend the viewport prompt test to require all three modes, in-place editing, direction-neutral nearby placement, obstruction-based cleanup, and unrestricted but necessary clarification questions.
- Assert the prompt no longer contains the fixed right-then-below placement rule.
- Extend the client skill mirroring test to require identical skill/reference copies and the intent recipe in both mirrors.
- Run the focused prompt, canvas generation, and client skill tests, then the relevant production builds.

## Non-Goals

- Computer-vision element matching outside the model's existing screenshot and file-reading ability.
- Automatic deletion of every handwritten or freeform element.
- Creating a new annotation data model or placeholder element.
- Reintroducing Canvas MCP into the one-click viewport request.
