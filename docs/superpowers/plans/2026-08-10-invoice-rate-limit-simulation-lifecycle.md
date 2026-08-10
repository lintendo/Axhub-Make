# Invoice Rate Limit Simulation Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe dual-mode prototype that deterministically reproduces the invoice simulation effect restart loop, then demonstrates and verifies the corrected single-run lifecycle.

**Architecture:** Keep deterministic file processing in `simulation.ts`, React lifecycle ownership in `simulation-lifecycle.tsx`, and presentation in `index.tsx`. The fault hook intentionally captures `files` and stops after 12 starts; the fixed hook uses functional updates, stable callbacks, and an abortable timer registry.

**Tech Stack:** React 18.2.0, TypeScript 5.x, Vitest 4.0.16, react-test-renderer 18.2.0, Vite 5.4.21, pnpm workspace.

## Global Constraints

- Use pnpm; do not use npm or yarn for repository development.
- Keep React and react-test-renderer pinned to 18.2.0.
- Keep all prototype implementation inside `client/src/prototypes/invoice-rate-limit-a/`.
- Never permit an unbounded restart loop; fault mode stops at exactly 12 starts.
- Use no real network request and no production upload endpoint.
- Do not modify `@axhub/annotation`; omit `AnnotationViewer` from this isolated reproduction.
- Preserve every unrelated staged, unstaged, and untracked workspace change.

---

### Task 1: Deterministic bounded fault reproduction

**Files:**
- Modify: `client/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `client/src/prototypes/invoice-rate-limit-a/simulation.ts`
- Create: `client/src/prototypes/invoice-rate-limit-a/simulation-lifecycle.tsx`
- Create: `client/tests/invoice-rate-limit-a.test.tsx`

**Interfaces:**
- Produces: `createInvoiceFiles(): InvoiceFile[]`
- Produces: `runInvoiceSimulation(options: RunInvoiceSimulationOptions): Promise<void>`
- Produces: `useFaultyInvoiceSimulation(): SimulationLifecycle`
- Produces: `FAULT_START_LIMIT = 12`
- Consumes: React state/effect primitives and injected delay/telemetry callbacks only.

- [ ] **Step 1: Add lifecycle test dependencies**

Run:

```bash
pnpm --dir client add --save-dev react-test-renderer@18.2.0 @types/react-test-renderer@18.3.1
```

Expected: only `client/package.json`, `pnpm-lock.yaml`, and install metadata change; React remains 18.2.0.

- [ ] **Step 2: Write the missing-module fault reproduction test**

Create `client/tests/invoice-rate-limit-a.test.tsx` with a probe that captures the latest hook result:

```tsx
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAULT_START_LIMIT,
  useFaultyInvoiceSimulation,
  type SimulationLifecycle,
} from '../src/prototypes/invoice-rate-limit-a/simulation-lifecycle';

let latest: SimulationLifecycle | null = null;

function FaultProbe() {
  latest = useFaultyInvoiceSimulation();
  return null;
}

describe('invoice rate-limit simulation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    latest = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reproduces callback/effect churn but stops at the safety limit', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FaultProbe />);
    });
    await act(async () => {
      latest?.start();
    });

    expect(latest?.metrics.starts).toBe(FAULT_START_LIMIT);
    expect(latest?.metrics.cleanups).toBeGreaterThan(1);
    expect(latest?.metrics.peakPendingTimers).toBeGreaterThan(0);
    expect(latest?.phase).toBe('fault-reproduced');

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(latest?.metrics.pendingTimers).toBe(0);
    renderer!.unmount();
  });
});
```

- [ ] **Step 3: Run the test to prove it is red**

Run:

```bash
pnpm --dir client exec vitest run tests/invoice-rate-limit-a.test.tsx
```

Expected: FAIL because `simulation-lifecycle.tsx` does not exist.

- [ ] **Step 4: Implement deterministic simulation contracts**

Create `simulation.ts` with these concrete types and behavior:

```ts
export type InvoiceFileStatus =
  | 'queued'
  | 'uploading'
  | 'rate-limited'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface InvoiceFile {
  id: string;
  name: string;
  sizeLabel: string;
  status: InvoiceFileStatus;
  retries: number;
  progress: number;
}

export interface SimulationEvent {
  id: number;
  kind: 'start' | 'cleanup' | 'timer' | 'file' | 'guard' | 'complete';
  message: string;
}

export interface RunInvoiceSimulationOptions {
  files: readonly InvoiceFile[];
  patchFile: (id: string, patch: Partial<InvoiceFile>) => void;
  delay: (ms: number) => Promise<void>;
  isCancelled: () => boolean;
  record: (kind: SimulationEvent['kind'], message: string) => void;
}

export function createInvoiceFiles(): InvoiceFile[] {
  return Array.from({ length: 16 }, (_, index) => ({
    id: `invoice-${String(index + 1).padStart(2, '0')}`,
    name: `invoice-2026-${String(index + 1).padStart(2, '0')}.pdf`,
    sizeLabel: `${420 + index * 37} KB`,
    status: 'queued',
    retries: 0,
    progress: 0,
  }));
}
```

`runInvoiceSimulation` must process every file concurrently, use short deterministic delays, trigger two simulated 429 retries for indexes divisible by four, check `isCancelled()` after every await, and patch cancelled files without throwing.

- [ ] **Step 5: Implement the bounded faulty lifecycle**

Create `simulation-lifecycle.tsx` with:

```tsx
export const FAULT_START_LIMIT = 12;

export interface LifecycleMetrics {
  starts: number;
  cleanups: number;
  activeRuns: number;
  pendingTimers: number;
  peakPendingTimers: number;
}

export type SimulationPhase =
  | 'idle'
  | 'running'
  | 'stopped'
  | 'fault-reproduced'
  | 'completed';

export interface SimulationLifecycle {
  files: InvoiceFile[];
  metrics: LifecycleMetrics;
  events: SimulationEvent[];
  phase: SimulationPhase;
  start(): void;
  stop(): void;
  reset(): void;
}
```

The faulty hook must deliberately use this dependency shape:

```tsx
const startSimulation = React.useCallback(() => {
  const runNumber = startCountRef.current + 1;
  startCountRef.current = runNumber;
  setFiles(files.map((file) => ({ ...file, status: 'queued', retries: 0, progress: 0 })));
  // Register naive setTimeout promises and cancellation flag.
  if (runNumber >= FAULT_START_LIMIT) setStarted(false);
  return () => {
    cancelled = true;
    // Intentionally do not clear timers in fault mode.
  };
}, [files, patchFile]);

React.useEffect(() => {
  if (started && !simulationRef.current) {
    simulationRef.current = { cancel: () => undefined };
    simulationRef.current.cancel = startSimulation();
  }
  return () => {
    simulationRef.current?.cancel();
    simulationRef.current = null;
  };
}, [started, startSimulation]);
```

All counters must use functional updates so telemetry itself does not become another dependency.

- [ ] **Step 6: Run the focused test until green**

Run:

```bash
pnpm --dir client exec vitest run tests/invoice-rate-limit-a.test.tsx
```

Expected: one test passes; fault starts equal 12 and all naive timers eventually drain.

- [ ] **Step 7: Commit the bounded reproduction**

```bash
git add client/package.json pnpm-lock.yaml client/src/prototypes/invoice-rate-limit-a/simulation.ts client/src/prototypes/invoice-rate-limit-a/simulation-lifecycle.tsx client/tests/invoice-rate-limit-a.test.tsx
git commit --only client/package.json pnpm-lock.yaml client/src/prototypes/invoice-rate-limit-a/simulation.ts client/src/prototypes/invoice-rate-limit-a/simulation-lifecycle.tsx client/tests/invoice-rate-limit-a.test.tsx -m "test(client): reproduce invoice simulation restart loop"
```

---

### Task 2: Stable and abortable fixed lifecycle

**Files:**
- Modify: `client/src/prototypes/invoice-rate-limit-a/simulation-lifecycle.tsx`
- Modify: `client/tests/invoice-rate-limit-a.test.tsx`

**Interfaces:**
- Consumes: `createInvoiceFiles`, `runInvoiceSimulation`, and `SimulationLifecycle` from Task 1.
- Produces: `useFixedInvoiceSimulation(): SimulationLifecycle`.

- [ ] **Step 1: Add failing fixed-lifecycle tests**

Extend the test file with a `FixedProbe` and two cases:

```tsx
function FixedProbe() {
  latest = useFixedInvoiceSimulation();
  return null;
}

it('keeps one simulation active while file state changes', async () => {
  await act(async () => { create(<FixedProbe />); });
  await act(async () => { latest?.start(); });
  await act(async () => { await vi.runAllTimersAsync(); });

  expect(latest?.metrics.starts).toBe(1);
  expect(latest?.files.every((file) => file.status === 'completed')).toBe(true);
  expect(latest?.metrics.activeRuns).toBe(0);
  expect(latest?.metrics.pendingTimers).toBe(0);
  expect(latest?.phase).toBe('completed');
});

it('clears fixed timers and blocks stale updates when stopped', async () => {
  await act(async () => { create(<FixedProbe />); });
  await act(async () => { latest?.start(); });
  expect(latest?.metrics.pendingTimers).toBeGreaterThan(0);

  await act(async () => { latest?.stop(); });
  const filesAfterStop = latest?.files;
  expect(latest?.metrics.pendingTimers).toBe(0);
  expect(latest?.metrics.activeRuns).toBe(0);

  await act(async () => { await vi.runAllTimersAsync(); });
  expect(latest?.files).toEqual(filesAfterStop);
});
```

- [ ] **Step 2: Run the new tests to prove they are red**

Run:

```bash
pnpm --dir client exec vitest run tests/invoice-rate-limit-a.test.tsx
```

Expected: FAIL because `useFixedInvoiceSimulation` is not exported.

- [ ] **Step 3: Implement stable callbacks and abortable delay**

The fixed hook must use functional file patches and an `AbortController` owned by the effect:

```tsx
const patchFile = React.useCallback((id: string, patch: Partial<InvoiceFile>) => {
  setFiles((previous) => previous.map((file) => (
    file.id === id ? { ...file, ...patch } : file
  )));
}, []);

const startSimulation = React.useCallback((signal: AbortSignal) => {
  setFiles(createInvoiceFiles());
  return runInvoiceSimulation({
    files: createInvoiceFiles(),
    patchFile,
    delay: createAbortableDelay(signal, updatePendingTimers),
    isCancelled: () => signal.aborted,
    record,
  });
}, [patchFile, record, updatePendingTimers]);

React.useEffect(() => {
  if (!started) return undefined;
  const controller = new AbortController();
  void startSimulation(controller.signal);
  return () => controller.abort();
}, [started, startSimulation]);
```

The abortable delay must remove its abort listener, call `clearTimeout`, decrement pending timers exactly once, and reject with an `AbortError`. Completion and abort handlers must use a run-generation ref so an older run cannot finalize a newer one.

- [ ] **Step 4: Run the lifecycle tests until green**

Run:

```bash
pnpm --dir client exec vitest run tests/invoice-rate-limit-a.test.tsx
```

Expected: three tests pass; fixed starts stay at one and stopping clears timers before fake timers advance.

- [ ] **Step 5: Commit the fix**

```bash
git add client/src/prototypes/invoice-rate-limit-a/simulation-lifecycle.tsx client/tests/invoice-rate-limit-a.test.tsx
git commit --only client/src/prototypes/invoice-rate-limit-a/simulation-lifecycle.tsx client/tests/invoice-rate-limit-a.test.tsx -m "fix(client): stabilize invoice simulation lifecycle"
```

---

### Task 3: Diagnostic prototype UI and end-to-end validation

**Files:**
- Create: `client/src/prototypes/invoice-rate-limit-a/index.tsx`
- Create: `client/src/prototypes/invoice-rate-limit-a/style.css`
- Modify: `client/src/prototypes/invoice-rate-limit-a/.spec/spec.md` only if implementation facts differ.

**Interfaces:**
- Consumes: `useFaultyInvoiceSimulation`, `useFixedInvoiceSimulation`, `InvoiceFileStatus`, and lifecycle metrics.
- Produces: default React prototype entry with no props.

- [ ] **Step 1: Build the mode-isolated page**

Create `index.tsx` with a keyed child component so switching modes unmounts the previous lifecycle:

```tsx
/**
 * @name 发票限流生命周期诊断
 */

import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, FileText, Play, RotateCcw, Square, TimerReset } from 'lucide-react';
import { useFaultyInvoiceSimulation, useFixedInvoiceSimulation } from './simulation-lifecycle';
import './style.css';

type Mode = 'fault' | 'fixed';

function DiagnosticPanelView({ mode, lifecycle }: {
  mode: Mode;
  lifecycle: ReturnType<typeof useFaultyInvoiceSimulation>;
}) {
  const metricEntries = [
    ['启动次数', lifecycle.metrics.starts],
    ['清理次数', lifecycle.metrics.cleanups],
    ['活动任务', lifecycle.metrics.activeRuns],
    ['等待计时器', lifecycle.metrics.pendingTimers],
    ['计时器峰值', lifecycle.metrics.peakPendingTimers],
  ] as const;

  return (
    <main className="diagnostic-panel" data-mode={mode}>
      <section className="result-banner" aria-live="polite">
        <AlertTriangle aria-hidden="true" />
        <div><strong>{mode === 'fault' ? '有界故障复现' : '稳定生命周期'}</strong><p>{lifecycle.phase}</p></div>
      </section>
      <div className="action-row">
        <button type="button" onClick={lifecycle.start}><Play aria-hidden="true" />启动</button>
        <button type="button" onClick={lifecycle.stop}><Square aria-hidden="true" />停止</button>
        <button type="button" onClick={lifecycle.reset}><RotateCcw aria-hidden="true" />重置</button>
      </div>
      <section className="metric-grid" aria-label="生命周期指标">
        {metricEntries.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </section>
      <section className="file-grid" aria-label="发票文件状态">
        {lifecycle.files.map((file) => (
          <article key={file.id} data-status={file.status}>
            <FileText aria-hidden="true" /><strong>{file.name}</strong><span>{file.status}</span><span>{file.progress}%</span>
          </article>
        ))}
      </section>
      <section className="event-log"><h2><Activity aria-hidden="true" />事件日志</h2><ol>
        {lifecycle.events.map((event) => <li key={event.id}><code>{event.kind}</code><span>{event.message}</span></li>)}
      </ol></section>
    </main>
  );
}

function FaultDiagnosticPanel() {
  return <DiagnosticPanelView mode="fault" lifecycle={useFaultyInvoiceSimulation()} />;
}

function FixedDiagnosticPanel() {
  return <DiagnosticPanelView mode="fixed" lifecycle={useFixedInvoiceSimulation()} />;
}

export default function InvoiceRateLimitLifecyclePrototype() {
  const [mode, setMode] = React.useState<Mode>('fault');
  return (
    <div className="invoice-lifecycle-page">
      <header><p>Runtime lab / React 18.2</p><h1>发票限流生命周期诊断</h1></header>
      <nav aria-label="诊断模式">
        <button type="button" aria-pressed={mode === 'fault'} onClick={() => setMode('fault')}>故障复现</button>
        <button type="button" aria-pressed={mode === 'fixed'} onClick={() => setMode('fixed')}>修复实现</button>
      </nav>
      {mode === 'fault' ? <FaultDiagnosticPanel key="fault" /> : <FixedDiagnosticPanel key="fixed" />}
    </div>
  );
}
```

The separate fault and fixed components guarantee a stable hook order, and switching modes unmounts the previous lifecycle before mounting the next one.

- [ ] **Step 2: Add Sentry-derived responsive styling**

Create `style.css` with local custom properties based on `src/themes/sentry/DESIGN.md`:

```css
.invoice-lifecycle-page {
  --invoice-night: #150f23;
  --invoice-surface: #1f1633;
  --invoice-lime: #c2ef4e;
  --invoice-pink: #fa7faa;
  --invoice-violet: #6a5fc1;
  min-height: 100vh;
  color: #fff;
  background: var(--invoice-night);
  font-family: Rubik, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Use a 12-column desktop grid, collapse metrics to two columns below 900px, and use one column below 620px. Give every button visible hover/focus states and use tabular monospace numerals for metrics and events.

- [ ] **Step 3: Run focused tests and client typecheck**

Run:

```bash
pnpm --dir client exec vitest run tests/invoice-rate-limit-a.test.tsx
pnpm --dir client typecheck
```

Expected: lifecycle tests pass and TypeScript exits 0.

- [ ] **Step 4: Run Make readiness validation**

Run from `client/`:

```bash
node scripts/check-app-ready.mjs /prototypes/invoice-rate-limit-a
```

Expected: JSON contains `"status":"READY"` and no runtime errors.

- [ ] **Step 5: Validate both modes in a browser**

Open the readiness `serverUrl`, run fault mode, and verify starts stop at 12 while the page remains responsive. Switch to fixed mode, run to completion, and verify starts stay at 1, all 16 files complete, and pending timers return to 0. Capture a screenshot of the fixed completed state under the ignored `midscene_run/` output.

- [ ] **Step 6: Re-run the complete scoped verification**

```bash
pnpm --dir client exec vitest run tests/invoice-rate-limit-a.test.tsx
pnpm --dir client typecheck
node client/scripts/check-app-ready.mjs /prototypes/invoice-rate-limit-a
git diff --check
```

Expected: 0 test failures, typecheck exit 0, readiness `READY`, and no whitespace errors in task files.

- [ ] **Step 7: Commit the prototype UI**

```bash
git add client/src/prototypes/invoice-rate-limit-a/index.tsx client/src/prototypes/invoice-rate-limit-a/style.css client/src/prototypes/invoice-rate-limit-a/.spec/spec.md
git commit --only client/src/prototypes/invoice-rate-limit-a/index.tsx client/src/prototypes/invoice-rate-limit-a/style.css client/src/prototypes/invoice-rate-limit-a/.spec/spec.md -m "feat(client): add invoice lifecycle diagnostic prototype"
```
