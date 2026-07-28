# Duplicate Make Client Project ID Registration Design

## Context

Axhub Make currently uses the `project.id` from `.axhub/make/client.json` as the unique key in the global project registry. Registering a second Make client from a different filesystem path fails with `MAKE_PROJECT_ID_CONFLICT` when the two clients share the same ID. Selecting an already registered path currently reuses that registry entry.

The desired behavior is the reverse:

- The same filesystem path must not be added twice.
- Different filesystem paths may be added even when their client IDs initially match.
- A conflicting ID must receive a numeric suffix, and the resolved ID must be written back to the client project.

## Identity Files

The two local identity-bearing files have deliberately different roles:

- `.axhub/make/client.json` is the committed Make client marker and the sole source of truth for project identity.
- `.axhub/make/project.json` is a generated, Git-ignored resource manifest. Its `project` field is derived from `client.json` so that the server can read identity, resources, navigation, and capabilities from one manifest.

The implementation must not treat these files as two independently editable configuration sources. It updates `client.json` as the authoritative identity and then synchronizes the derived identity in `project.json` while preserving the manifest's resource data.

## Registration Behavior

Registration follows this order:

1. Validate the selected directory as an official Make client project.
2. Resolve a comparable real filesystem path and compare it with every registered project root.
3. If the path already exists, stop before modifying client files and return HTTP `409` with code `MAKE_PROJECT_PATH_CONFLICT`.
4. Read the source ID from `client.json` and allocate the first available registry ID:
   - use the source ID when it is free;
   - otherwise try `<source-id>-2`, `<source-id>-3`, and so on.
5. When a suffix is needed, update the authoritative marker and synchronize the derived project metadata identity. The project name remains unchanged.
6. Register the project using the resolved ID. The registry ID, client marker ID, generated metadata ID, URL project scope, and API project scope therefore remain identical.

For path comparison, existing directories should be compared through their real paths. Windows comparisons must be case-insensitive so that drive-letter or casing variations cannot register the same directory twice.

The numeric suffix belongs only to the ID. The project name is not changed; the project switcher continues to show the name and filesystem path.

## Error Handling

- Same-path registration returns `MAKE_PROJECT_PATH_CONFLICT` and a user-facing message such as `该项目路径已添加`.
- The path check happens before identity synchronization, so a rejected same-path request cannot rewrite project files.
- Marker and metadata writes continue to use atomic file replacement.
- If derived metadata synchronization fails after the marker changes, `client.json` remains authoritative and a later metadata sync can rebuild `project.json`.
- If global registry persistence fails after client synchronization, the request reports the persistence error. Retrying uses the already resolved client ID and can complete registration without allocating another suffix when that ID is still free.

## Compatibility and Scope

- Existing registry entries and client IDs are not migrated or renumbered.
- No registry schema change is required.
- Removing a project from the registry does not revert the client files to an earlier ID.
- The rule lives in the shared registry insertion helper. Explicit selection of an existing client is the primary changed scenario; new, copied, and cloned projects keep their generated IDs unless one of those IDs also collides at registry insertion.
- This work does not merge `client.json` and `project.json`; their source-versus-cache separation remains intact.

## Tests

Server API coverage must prove that:

1. Re-registering the same real path returns `409 MAKE_PROJECT_PATH_CONFLICT` and does not change either identity file.
2. Registering two different roots with the same initial client ID succeeds and assigns the second root `<id>-2`.
3. When `<id>-2` is already occupied, the next duplicate receives `<id>-3`.
4. Both `client.json` and `project.json` contain the resolved ID after registration, while the project name is unchanged.
5. The suffixed projects can be independently listed, selected, and used to read their own resources.
6. The frontend maps the new path-conflict code to the intended Chinese message.
