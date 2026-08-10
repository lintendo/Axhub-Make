import React from 'react';
import {
    act,
    create,
    type ReactTestRenderer,
} from 'react-test-renderer';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    FAULT_START_LIMIT,
    useFixedInvoiceSimulation,
    useFaultyInvoiceSimulation,
    type SimulationLifecycle,
} from '../src/prototypes/invoice-rate-limit-a/simulation-lifecycle';

let latestLifecycle: SimulationLifecycle | null = null;

function FaultProbe() {
    latestLifecycle = useFaultyInvoiceSimulation();
    return null;
}

function FixedProbe() {
    latestLifecycle = useFixedInvoiceSimulation();
    return null;
}

describe('invoice rate-limit simulation lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        latestLifecycle = null;
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
            latestLifecycle?.start();
        });

        expect(latestLifecycle?.metrics.starts).toBe(FAULT_START_LIMIT);
        expect(latestLifecycle?.metrics.cleanups).toBeGreaterThan(1);
        expect(latestLifecycle?.metrics.peakPendingTimers).toBeGreaterThan(0);
        expect(latestLifecycle?.phase).toBe('fault-reproduced');

        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(latestLifecycle?.metrics.pendingTimers).toBe(0);

        await act(async () => {
            renderer!.unmount();
        });
    });

    it('completes one fixed run without restarting the effect', async () => {
        let renderer: ReactTestRenderer;

        await act(async () => {
            renderer = create(<FixedProbe />);
        });
        await act(async () => {
            latestLifecycle?.start();
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(latestLifecycle?.metrics.starts).toBe(1);
        expect(latestLifecycle?.metrics.cleanups).toBe(1);
        expect(latestLifecycle?.metrics.activeRuns).toBe(0);
        expect(latestLifecycle?.metrics.pendingTimers).toBe(0);
        expect(latestLifecycle?.files).toHaveLength(16);
        expect(latestLifecycle?.files.every((file) => file.status === 'completed')).toBe(true);
        expect(latestLifecycle?.phase).toBe('completed');

        await act(async () => {
            renderer!.unmount();
        });
    });

    it('aborts and clears all fixed-run timers immediately when stopped', async () => {
        let renderer: ReactTestRenderer;

        await act(async () => {
            renderer = create(<FixedProbe />);
        });
        await act(async () => {
            latestLifecycle?.start();
        });

        expect(latestLifecycle?.metrics.starts).toBe(1);
        expect(latestLifecycle?.metrics.pendingTimers).toBeGreaterThan(0);

        await act(async () => {
            latestLifecycle?.stop();
        });

        const filesAfterStop = latestLifecycle?.files;
        expect(latestLifecycle?.metrics.activeRuns).toBe(0);
        expect(latestLifecycle?.metrics.pendingTimers).toBe(0);
        expect(latestLifecycle?.phase).toBe('stopped');

        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(latestLifecycle?.files).toEqual(filesAfterStop);

        await act(async () => {
            renderer!.unmount();
        });
    });
});
