import React from 'react';
import {
    createInvoiceFiles,
    runInvoiceSimulation,
    SimulationAbortError,
    type InvoiceFile,
    type SimulationEvent,
    type SimulationEventKind,
} from './simulation';

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

interface SimulationHandle {
    cancel: () => void;
}

interface FixedSimulationHandle extends SimulationHandle {
    controller: AbortController;
}

const EMPTY_METRICS: LifecycleMetrics = {
    starts: 0,
    cleanups: 0,
    activeRuns: 0,
    pendingTimers: 0,
    peakPendingTimers: 0,
};

function resetFile(file: InvoiceFile): InvoiceFile {
    return {
        ...file,
        status: 'queued',
        retries: 0,
        progress: 0,
    };
}

export function useFaultyInvoiceSimulation(): SimulationLifecycle {
    const [files, setFiles] = React.useState(createInvoiceFiles);
    const [metrics, setMetrics] = React.useState(EMPTY_METRICS);
    const [events, setEvents] = React.useState<SimulationEvent[]>([]);
    const [phase, setPhase] = React.useState<SimulationPhase>('idle');
    const [started, setStarted] = React.useState(false);
    const simulationRef = React.useRef<SimulationHandle | null>(null);
    const startCountRef = React.useRef(0);
    const eventIdRef = React.useRef(0);

    const record = React.useCallback((kind: SimulationEventKind, message: string) => {
        eventIdRef.current += 1;
        const event: SimulationEvent = {
            id: eventIdRef.current,
            kind,
            message,
        };
        setEvents((previous) => [...previous.slice(-159), event]);
    }, []);

    const patchFile = React.useCallback((id: string, patch: Partial<InvoiceFile>) => {
        setFiles((previous) => previous.map((file) => (
            file.id === id ? { ...file, ...patch } : file
        )));
    }, []);

    const updatePendingTimers = React.useCallback((delta: 1 | -1) => {
        setMetrics((previous) => {
            const pendingTimers = Math.max(0, previous.pendingTimers + delta);
            return {
                ...previous,
                pendingTimers,
                peakPendingTimers: Math.max(previous.peakPendingTimers, pendingTimers),
            };
        });
    }, []);

    const naiveDelay = React.useCallback((ms: number) => {
        updatePendingTimers(1);
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                updatePendingTimers(-1);
                resolve();
            }, ms);
        });
    }, [updatePendingTimers]);

    const startSimulation = React.useCallback(() => {
        let cancelled = false;
        const runNumber = startCountRef.current + 1;
        startCountRef.current = runNumber;

        setMetrics((previous) => ({
            ...previous,
            starts: runNumber,
            activeRuns: previous.activeRuns + 1,
        }));
        setPhase(runNumber >= FAULT_START_LIMIT ? 'fault-reproduced' : 'running');
        record('start', `第 ${runNumber} 次模拟启动`);

        const resetFiles = files.map(resetFile);
        setFiles(resetFiles);
        void runInvoiceSimulation({
            files: resetFiles,
            patchFile,
            delay: naiveDelay,
            isCancelled: () => cancelled,
            record,
        });

        if (runNumber >= FAULT_START_LIMIT) {
            record('guard', `达到安全上限 ${FAULT_START_LIMIT}，停止继续重启`);
            setStarted(false);
        }

        return () => {
            if (cancelled) return;
            cancelled = true;
            setMetrics((previous) => ({
                ...previous,
                cleanups: previous.cleanups + 1,
                activeRuns: Math.max(0, previous.activeRuns - 1),
            }));
            record('cleanup', `清理第 ${runNumber} 次模拟；已登记 timer 保持等待`);
        };
    }, [files, naiveDelay, patchFile, record]);

    React.useEffect(() => {
        if (started && !simulationRef.current) {
            simulationRef.current = { cancel: () => undefined };
            const cleanup = startSimulation();
            simulationRef.current.cancel = cleanup;
        }

        return () => {
            simulationRef.current?.cancel();
            simulationRef.current = null;
        };
    }, [started, startSimulation]);

    const cancelCurrent = React.useCallback(() => {
        simulationRef.current?.cancel();
        simulationRef.current = null;
    }, []);

    const start = React.useCallback(() => {
        cancelCurrent();
        startCountRef.current = 0;
        eventIdRef.current = 0;
        setFiles(createInvoiceFiles());
        setMetrics(EMPTY_METRICS);
        setEvents([]);
        setPhase('running');
        setStarted(true);
    }, [cancelCurrent]);

    const stop = React.useCallback(() => {
        cancelCurrent();
        setStarted(false);
        setPhase((current) => (
            current === 'fault-reproduced' ? current : 'stopped'
        ));
    }, [cancelCurrent]);

    const reset = React.useCallback(() => {
        cancelCurrent();
        startCountRef.current = 0;
        eventIdRef.current = 0;
        setStarted(false);
        setFiles(createInvoiceFiles());
        setMetrics(EMPTY_METRICS);
        setEvents([]);
        setPhase('idle');
    }, [cancelCurrent]);

    return {
        files,
        metrics,
        events,
        phase,
        start,
        stop,
        reset,
    };
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

export function useFixedInvoiceSimulation(): SimulationLifecycle {
    const [files, setFiles] = React.useState(createInvoiceFiles);
    const [metrics, setMetrics] = React.useState(EMPTY_METRICS);
    const [events, setEvents] = React.useState<SimulationEvent[]>([]);
    const [phase, setPhase] = React.useState<SimulationPhase>('idle');
    const [started, setStarted] = React.useState(false);
    const filesRef = React.useRef(files);
    const simulationRef = React.useRef<FixedSimulationHandle | null>(null);
    const startCountRef = React.useRef(0);
    const eventIdRef = React.useRef(0);
    const pendingTimersRef = React.useRef(0);

    filesRef.current = files;

    const record = React.useCallback((kind: SimulationEventKind, message: string) => {
        eventIdRef.current += 1;
        const event: SimulationEvent = {
            id: eventIdRef.current,
            kind,
            message,
        };
        setEvents((previous) => [...previous.slice(-159), event]);
    }, []);

    const patchFile = React.useCallback((id: string, patch: Partial<InvoiceFile>) => {
        setFiles((previous) => previous.map((file) => (
            file.id === id ? { ...file, ...patch } : file
        )));
    }, []);

    const updatePendingTimers = React.useCallback((delta: 1 | -1) => {
        pendingTimersRef.current = Math.max(0, pendingTimersRef.current + delta);
        setMetrics((previous) => {
            const pendingTimers = pendingTimersRef.current;
            return {
                ...previous,
                pendingTimers,
                peakPendingTimers: Math.max(previous.peakPendingTimers, pendingTimers),
            };
        });
    }, []);

    const delay = React.useCallback((ms: number, signal: AbortSignal) => {
        if (signal.aborted) {
            return Promise.reject(new SimulationAbortError());
        }

        updatePendingTimers(1);
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const settle = (callback: () => void) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                updatePendingTimers(-1);
                callback();
            };
            const onAbort = () => {
                clearTimeout(timer);
                settle(() => reject(new SimulationAbortError()));
            };
            const timer = setTimeout(() => {
                settle(resolve);
            }, ms);
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }, [updatePendingTimers]);

    const startSimulation = React.useCallback((): FixedSimulationHandle => {
        const controller = new AbortController();
        const runNumber = startCountRef.current + 1;
        startCountRef.current = runNumber;
        let finalized = false;

        const finalize = (outcome: 'complete' | 'cancel') => {
            if (finalized) return;
            finalized = true;
            setMetrics((previous) => ({
                ...previous,
                cleanups: previous.cleanups + 1,
                activeRuns: Math.max(0, previous.activeRuns - 1),
                pendingTimers: pendingTimersRef.current,
            }));
            record('cleanup', outcome === 'complete'
                ? `第 ${runNumber} 次模拟完成后清理资源`
                : `停止第 ${runNumber} 次模拟并清理资源`);
            if (outcome === 'complete') {
                setPhase('completed');
                record('complete', '16 个发票文件均已完成上传');
            }
        };

        setMetrics((previous) => ({
            ...previous,
            starts: runNumber,
            activeRuns: previous.activeRuns + 1,
        }));
        setPhase('running');
        record('start', `第 ${runNumber} 次模拟启动（固定生命周期）`);

        const currentFiles = filesRef.current.map(resetFile);
        setFiles(currentFiles);

        void runInvoiceSimulation({
            files: currentFiles,
            patchFile,
            delay: (ms) => delay(ms, controller.signal),
            isCancelled: () => controller.signal.aborted,
            record,
        }).then(() => {
            if (!controller.signal.aborted) {
                finalize('complete');
                setStarted(false);
            }
        }).catch((error: unknown) => {
            if (!isAbortError(error)) {
                record('guard', `模拟异常终止：${String(error)}`);
                finalize('cancel');
                setPhase('stopped');
                setStarted(false);
            }
        });

        return {
            controller,
            cancel: () => {
                if (finalized) return;
                controller.abort();
                finalize('cancel');
            },
        };
    }, [delay, patchFile, record]);

    React.useEffect(() => {
        if (started && !simulationRef.current) {
            simulationRef.current = startSimulation();
        }

        return () => {
            simulationRef.current?.cancel();
            simulationRef.current = null;
        };
    }, [started, startSimulation]);

    const cancelCurrent = React.useCallback(() => {
        simulationRef.current?.cancel();
        simulationRef.current = null;
    }, []);

    const start = React.useCallback(() => {
        cancelCurrent();
        startCountRef.current = 0;
        eventIdRef.current = 0;
        pendingTimersRef.current = 0;
        setFiles(createInvoiceFiles());
        setMetrics(EMPTY_METRICS);
        setEvents([]);
        setPhase('running');
        setStarted(true);
    }, [cancelCurrent]);

    const stop = React.useCallback(() => {
        cancelCurrent();
        setStarted(false);
        setPhase('stopped');
    }, [cancelCurrent]);

    const reset = React.useCallback(() => {
        cancelCurrent();
        startCountRef.current = 0;
        eventIdRef.current = 0;
        pendingTimersRef.current = 0;
        setStarted(false);
        setFiles(createInvoiceFiles());
        setMetrics(EMPTY_METRICS);
        setEvents([]);
        setPhase('idle');
    }, [cancelCurrent]);

    return {
        files,
        metrics,
        events,
        phase,
        start,
        stop,
        reset,
    };
}
