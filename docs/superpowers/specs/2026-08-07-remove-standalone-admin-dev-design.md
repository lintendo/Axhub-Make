# Remove Standalone Admin Dev Design

## Goal

Remove the standalone `admin:dev` entry point so local development and browser verification cannot accidentally bind the Make management port with a Vite-only UI that lacks the integrated server APIs and runtime injection.

## Root Cause

`admin:dev` currently runs `vite` directly. The Make Vite configuration binds the standard management port and redirects `/` to `/src/index/index.html` when serving standalone. That page contains the admin UI source and Vite HMR, but it is not the complete Make development server. An agent following an old browser-verification instruction can therefore occupy `127.0.0.1:53817` with a partial service and hide the expected `server:dev` process.

## Design

The supported development entry point is `server:dev`. It runs the Make server in development mode and mounts the admin UI through the integrated request pipeline.

The change will:

1. Remove the `admin:dev` script from `apps/axhub-make/package.json`.
2. Keep `admin:build`; production admin builds remain supported and unchanged.
3. Add app-level README guidance that browser verification must use `pnpm server:dev -- --host 127.0.0.1 --no-open` and must not launch standalone Vite.
4. Replace existing `admin:dev` instructions in app implementation plans with the integrated command.
5. Add a package-script contract test proving `admin:dev` is absent and `server:dev` remains available.
6. Stop only the currently verified standalone process tree after rechecking its PID, command, working directory, and listening port.

No compatibility alias will be retained. Running `pnpm admin:dev` must fail instead of silently starting a different service. Direct Vite build behavior and the development redirect plugin are outside this change because the supported command surface, documentation, and regression contract are sufficient to remove the accidental entry point without changing build routing.

## Process Cleanup

Before termination, the implementation will revalidate that the target processes still belong to the `pnpm admin:dev --host 127.0.0.1` tree and that its Vite child is the listener on port `53817`. It will send `TERM` only to those explicit PIDs. If the identities have changed, cleanup stops rather than targeting a newly reused PID.

The implementation will not start a replacement long-running server automatically. A later browser verification can start the integrated `server:dev` command when needed.

## Testing and Verification

Use TDD for the package-script contract:

1. Add a test that reads the real package manifest and expects `scripts['admin:dev']` to be absent while `scripts['server:dev']` is present.
2. Run it and confirm it fails because `admin:dev` still exists.
3. Remove the script and run the focused test again.

Final verification will also:

- parse `package.json`;
- search the app source and documentation for remaining `admin:dev` instructions;
- run `git diff --check` on task files;
- confirm no standalone Vite process from the removed command remains on port `53817`.

## Scope

- No changes to `admin:build` or release builds.
- No changes to Make client preview commands.
- No changes to runtime port selection or port-occupancy logic.
- No unrelated cleanup of existing worktree changes.
- No automatic commit of implementation files that overlap existing user work.
