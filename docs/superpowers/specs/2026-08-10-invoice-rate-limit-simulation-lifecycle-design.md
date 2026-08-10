# Invoice Rate Limit Simulation Lifecycle Design

## Context

External review identified a React effect cycle in a generated invoice rate-limit prototype: `startSimulation` depended on `files`, the simulation replaced `files`, and an effect depended on `startSimulation`. Each file update therefore changed the callback identity, ran the effect cleanup, cleared its guard ref, and started another simulation. Ordinary cancellation flags did not clear already scheduled timers, so repeated runs could retain promises, timers, and closures until their delays expired.

The original `src/prototypes/invoice-rate-limit-a/index.tsx` is not present in the current workspace. This work creates a deterministic reproduction at the corresponding client prototype path, proves the failure mode, and adds a corrected implementation.

## Goals

- Reproduce callback/effect restart churn without allowing an unbounded OOM.
- Make the lifecycle visible through start, cancellation, active-run, pending-timer, and file-state telemetry.
- Demonstrate that the corrected lifecycle stays at one active simulation while file progress changes.
- Cancel pending timers immediately when a fixed simulation stops, unmounts, or changes mode.
- Preserve the reproduction as a long-lived regression aid with automated coverage.

## Non-goals

- Trigger an actual browser OOM or allocate memory until the process fails.
- Exercise real upload, rate-limit, or backend APIs.
- Change `@axhub/annotation` or attribute OOM behavior to `AnnotationViewer`.
- Generalize the prototype-specific hook into `src/common/`.

## Selected Approach

Use one production-quality diagnostic prototype with two isolated modes:

1. **Bounded fault reproduction** mirrors the problematic dependencies and naive cancellation. It stops after 12 starts so the effect cycle and timer retention remain observable but safe.
2. **Fixed lifecycle** uses functional file updates, stable callbacks, an `AbortController`, and an abortable delay that clears timers immediately.

Alternatives rejected:

- A fixed-only page would leave the original lifecycle difficult to demonstrate manually.
- Separate broken and fixed prototypes would duplicate presentation and fixture code.
- An unbounded broken mode would reproduce the incident too literally and could make local validation destructive.

## Prototype Structure

- `client/src/prototypes/invoice-rate-limit-a/index.tsx`: page composition, mode switching, metric cards, file table, and event log.
- `client/src/prototypes/invoice-rate-limit-a/simulation.ts`: deterministic 16-file fixtures, simulated 429/retry behavior, abortable delay, and telemetry contracts.
- `client/src/prototypes/invoice-rate-limit-a/simulation-lifecycle.tsx`: bounded faulty hook and corrected hook, kept separate so hook dependencies are explicit and testable.
- `client/src/prototypes/invoice-rate-limit-a/style.css`: Sentry-inspired diagnostic interface styles.
- `client/tests/invoice-rate-limit-a.test.tsx`: React lifecycle regression tests using fake timers.
- `client/src/prototypes/invoice-rate-limit-a/.spec/spec.md`: current prototype facts and acceptance criteria.

The client package will add `react-test-renderer@18.2.0` and its types as development dependencies only if required by the lifecycle test. React remains pinned to 18.2.0.

## UI and Interaction

The Sentry `DESIGN.md` is the visual base. The page uses a deep purple diagnostic canvas, light surfaces for dense file data, lime for healthy/fixed state, pink for unsafe/retry state, and monospace numerals for telemetry.

The single-page layout contains:

- A header describing the lifecycle issue and its safe reproduction boundary.
- A two-option mode switch: “故障复现” and “修复实现”. Switching modes fully unmounts the previous lifecycle.
- Start, stop, and reset actions.
- Metric cards for starts, cleanups, active runs, pending timers, and peak pending timers.
- A 16-file status grid showing queued, uploading, rate-limited, retrying, completed, failed, or cancelled states.
- A chronological event log that exposes the effect restart chain and abort cleanup.
- A prominent result banner: fault mode reports the bounded restart cycle; fixed mode reports a single stable run or an explicit failure.

## Simulation Data Flow

All behavior is deterministic and local:

1. Starting a run resets 16 invoice files.
2. Each file progresses through upload states using injected delay operations.
3. A fixed subset receives deterministic simulated 429 responses and retries with short exponential backoff suitable for UI validation.
4. Every delay registers and unregisters a pending-timer telemetry event.
5. File changes are delivered through a patch function.

In fault mode, file state is captured by `startSimulation`; replacing the array changes the callback identity and retriggers the effect. Cleanup sets a boolean cancellation flag but intentionally leaves scheduled timers alive. A ref counts starts and stops the reproduction at 12.

In fixed mode, `patchFile` uses `setFiles(previous => ...)`, `startSimulation` does not depend on `files`, and the effect owns an `AbortController`. Stopping or unmounting aborts the run, clears its timers, and prevents stale state writes.

## Error and Safety Handling

- Abort is represented as cancellation, not a failure.
- Unexpected simulation errors mark the affected file failed and add a diagnostic event.
- The fault mode hard cap cannot be disabled from the UI.
- Mode changes and unmounts always invoke cleanup.
- No production endpoint or network request is used.
- `AnnotationViewer` is deliberately excluded so the experiment isolates the confirmed effect lifecycle cause.

## Test Strategy

Use a red-green regression sequence:

1. Add a lifecycle test that mounts the bounded faulty hook and proves file updates cause more than one start and at least one cleanup.
2. Add a failing expectation for the corrected hook: progress updates must not increase the start count above one.
3. Implement the stable callback and functional update path until the corrected expectation passes.
4. Verify aborting the corrected run clears every pending timer and prevents later file patches.
5. Verify changing mode unmounts and cleans the previous implementation.

Final verification includes the focused Vitest file, client typecheck, `check-app-ready.mjs /prototypes/invoice-rate-limit-a`, and browser interaction in both modes.

## Acceptance Criteria

- Fault mode reaches at least two starts, records cleanup/restart events, and stops automatically at exactly 12 starts.
- Fault mode visibly demonstrates a non-zero pending-timer peak without hanging the browser.
- Fixed mode records exactly one start during a complete 16-file run.
- Fixed mode completes all 16 files under deterministic simulated rate limits.
- Stopping or leaving fixed mode reduces pending timers and active runs to zero before any stale update is applied.
- The prototype builds, typechecks, passes its lifecycle tests, and loads through Make readiness validation.
