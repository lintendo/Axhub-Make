# Document Editor Sticky Toolbar Design

**Date:** 2026-07-29

## Goal

Keep the formatting toolbar available at the top of the document viewport while a user scrolls a long document in the built-in Markdown editor.

## Current Behavior and Root Cause

`MarkdownViewer` renders `SimpleEditor` inside a page whose document height grows with the editor content. The page is the element that actually scrolls.

The reusable editor gives `.simple-editor-wrapper` `overflow: auto`. The Make host overrides that wrapper to `height: auto` so it grows with its content, but it does not override the overflow. CSS sticky positioning therefore treats the non-scrolling wrapper as the toolbar's nearest scrolling ancestor. Scrolling the page never activates the toolbar's sticky position.

## Chosen Design

Apply a host-scoped CSS override in `MarkdownViewer` so `.spec-editor-shell .simple-editor-wrapper` uses `overflow: visible`.

This keeps the existing page-level scrolling model and allows the toolbar's existing `position: sticky`, `top: 0`, and `z-index` rules to attach to the document viewport. The change remains limited to Make's built-in document editor and does not alter other consumers of `tiptap-editor`.

Horizontal overflow remains handled by the toolbar and editor's existing local overflow rules, including the toolbar's horizontal scrolling and table wrapper scrolling.

## Alternatives Considered

1. Make the editor wrapper a fixed-height internal scroll container. This would make sticky positioning work inside the editor, but would introduce nested page and editor scrolling.
2. Replace sticky positioning with a JavaScript-managed fixed toolbar. This would require toolbar placeholders, width synchronization, resize handling, and additional mobile behavior without providing a product benefit here.

## Scope

- Change the built-in Markdown document editor styling in `src/spec-template/MarkdownViewer.tsx`.
- Preserve whole-page scrolling, toolbar layout, editing behavior, mobile layout, and other `SimpleEditor` consumers.
- Do not refactor the reusable editor package.

## Verification

- Add a focused source regression test proving the spec editor wrapper releases overflow to the page while the toolbar remains sticky at the viewport top.
- Run the focused test and the relevant spec-template test suite.
- Open a long document in edit mode, scroll beyond the first viewport, and confirm the toolbar remains visible and usable without an inner vertical scrollbar.
- Check desktop and narrow viewport behavior.
