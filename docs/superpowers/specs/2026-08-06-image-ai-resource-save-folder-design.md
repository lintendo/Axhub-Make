# Image AI Resource Save Folder Design

## Goal

When Axhub Make opens the embedded image AI playground, make the panel start at
50% of the current viewport width and bind the playground's per-image save
action to the resource folder implied by the user's current resource context.
The panel remains resizable after opening.

## User-visible behavior

Opening image AI resolves one target folder under `src/resources`:

1. If a resource folder is selected, use that folder.
2. If any resource file is selected, regardless of file type, use its parent
   folder.
3. If the selected file is at the resource root, or there is no applicable
   resource selection, use the root-level `images` folder.

The server creates `images` only when it does not already exist. After the
target is resolved, Make switches the sidebar to Resources, refreshes the
resource tree, and selects the target folder. The image AI opens only after the
folder and its absolute path are available.

Each explicit image-AI open sets the shared assistant panel width to the
current 50% viewport maximum. Existing drag-resize behavior stays enabled, so
the user can change the width afterward.

## Architecture

### Target resolution

A focused client helper normalizes resource paths, removes an optional
`src/resources/` prefix, and resolves the target relative folder. It accepts
the selected folder and selected resource metadata and returns either a
non-empty folder path or `images`.

The helper is independent of React and filesystem APIs so nested resources,
root resources, mixed path separators, and missing selections can be covered
with direct tests.

### Idempotent folder ensure API

Extend the Make workspace navigation folder endpoint with an idempotent ensure
operation for the filesystem-backed `docs` resource tree. The request supplies
a normalized relative folder path. The server:

- rejects absolute paths, traversal, empty segments, and paths outside the
  resource root;
- creates the folder recursively when missing;
- leaves an existing folder unchanged;
- rescans the resource tree; and
- returns the canonical folder node plus its absolute filesystem path.

This keeps path semantics on the server and avoids browser-side absolute-path
concatenation differences between macOS and Windows. Existing generic “new
folder” behavior remains unchanged.

### Open orchestration

The image-AI click handler performs the workflow in this order:

1. Resolve the target resource folder from current resource state.
2. Ensure the folder through the Make server.
3. Refresh the resource tree and select the returned folder.
4. Switch the sidebar to Resources.
5. Store the returned absolute path as the image AI save directory.
6. Open the image AI panel at 50% viewport width.

If folder preparation fails, Make displays the server error and does not open
the image AI, preventing a stale or incorrect save target.

### ACP runtime configuration

Add `saveDirectory?: string | null` to Make's image-generation runtime config
adapter. When present, the adapter includes the normalized absolute path at:

```text
builtinToolSettings["image-generation"].saveDirectory
```

The field participates in the runtime-config synchronization signature so a
folder change is pushed into an already mounted image playground. The API key
continues to be fingerprinted rather than retained in the signature.

`saveDirectory` is transient playground configuration. It does not replace
the existing MCP `savePathPattern`, change chat artifact storage, or persist in
Make's global AI settings.

## Error handling

- Unsafe or unsupported folder paths return a 400 response.
- A non-directory entry at the requested path returns a conflict response.
- Filesystem or resource-tree refresh failures keep image AI closed and show a
  concise error.
- An existing `images` folder is selected and reused without duplication.
- Missing or incomplete image-provider settings retain the current ACP runtime
  clear behavior.

## Verification

- Unit tests for folder target resolution from selected folders, nested files,
  root files, mixed separators, and empty selection.
- Server API tests for creating `images`, reusing it idempotently, returning
  the canonical absolute path and node, and rejecting unsafe paths.
- Runtime adapter tests proving `saveDirectory` is emitted and included in the
  secret-safe synchronization signature.
- Controller and page tests proving the open workflow switches to Resources,
  selects the resolved folder, injects the returned directory, and initializes
  the panel at 50% while preserving resize support.
- Run the focused Axhub Make test files, then the app's relevant type/lint or
  build verification if the current worktree permits it.

## Non-goals

- Automatically saving every generated image without the playground's visible
  save action.
- Moving existing generated images or changing ACP conversation artifact
  storage.
- Adding per-folder persistent image-provider settings.
- Changing the general AI panel's resize controls.
