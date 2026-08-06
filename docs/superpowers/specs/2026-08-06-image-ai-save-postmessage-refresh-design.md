# Image AI Save PostMessage Refresh Design

## Goal

When the embedded ACP image playground saves an image into Make's configured
resource directory, Make should update the current resource file list and
sidebar tree without a page reload. Existing image-playground buttons keep
their current layout and labels; their save-related click behavior is routed to
the configured directory.

## User-visible behavior

- The task-card save action writes to the configured resource directory.
- Detail-view actions for the current image, original image, all outputs, and
  partial-step images write to the same directory instead of triggering a
  browser download or ZIP download.
- A successful single or batch save causes the Make Resources view to refresh
  its items and tree immediately. The selected resource folder remains
  selected.
- A save failure keeps the existing ACP UI error toast and does not refresh the
  resource view.

## Architecture

The ACP UI owns image bytes and the existing `/api/tools/image-generation/save`
route. Its save helper returns the saved path and emits one host event after a
single or batch operation succeeds:

```text
save button -> saveAcpImage(...) -> acp.image.saved -> parent Make window
```

The event is an additive `postMessage` envelope with a stable type and a small
payload (`paths`, `savedCount`, `requestedCount`). It is sent to the parent
window only when one or more images were written. Make continues to validate
the source iframe and expected origin before handling it.

Make's assistant panel controller recognizes the event and calls an injected
`onImageSaved` callback. `IndexPage` connects that callback to the existing
`prepare/refresh docs resources` action. The refresh re-fetches `/api/docs`,
rescans the docs sidebar tree, and relies on the current folder selection
reconciliation already used by resource mutations.

## Compatibility and failure handling

- ACP UI remains fully functional when opened standalone because no parent
  listener is required for saving.
- Make ignores unknown postMessage types and events from non-active or
  unexpected origins.
- Batch saves report partial failures using the existing toast; a refresh is
  emitted only for the files actually saved.
- Browser download and ZIP helpers remain available for unrelated non-resource
  export paths, but the image-playground resource actions use the fixed save
  directory when it is configured.

## Verification

- ACP UI unit tests cover save-event payloads and single/batch fixed-directory
  saves.
- Make source/unit tests cover iframe origin-checked event handling and the
  resource refresh callback.
- Run the focused Make Vitest files, ACP image-playground tests, and both app
  builds where the current worktrees permit it.
