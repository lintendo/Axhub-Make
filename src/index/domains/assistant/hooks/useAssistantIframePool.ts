import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AssistantIframeRunState = 'unknown' | 'running' | 'idle';

export interface AssistantIframePoolKeyInput {
    webBaseUrl: string;
    workspacePath: string;
    conversationStorePath: string;
    panelMode: 'general-ai';
}

export interface AssistantIframePoolDescriptor extends AssistantIframePoolKeyInput {
    key: string;
    src: string;
    projectId: string;
    navigationUrl: string;
    navigationThreadId: string | null;
}

export interface AssistantIframePoolEntry extends AssistantIframePoolDescriptor {
    loaded: boolean;
    runState: AssistantIframeRunState;
    runningThreadIds: string[];
    lastActiveAt: number;
    hiddenAt: number | null;
    releaseAt: number | null;
}

export interface AssistantIframePoolState {
    activeKey: string | null;
    entries: AssistantIframePoolEntry[];
}

export interface AssistantIframeRunEvent {
    runState: AssistantIframeRunState;
    threadId: string;
}

export interface AssistantIframePoolController extends AssistantIframePoolState {
    activeEntry: AssistantIframePoolEntry | null;
    activate: (descriptor: AssistantIframePoolDescriptor) => void;
    deactivate: () => void;
    markLoaded: (key: string) => void;
    markRunState: (key: string, runState: AssistantIframeRunState, threadId?: string) => void;
    markNavigation: (key: string, navigationUrl: string, navigationThreadId: string | null) => void;
    registerIframe: (key: string, iframe: HTMLIFrameElement | null) => void;
    getIframe: (key: string) => HTMLIFrameElement | null;
    findKeyByWindow: (source: MessageEventSource | null) => string | null;
}

export const ASSISTANT_IFRAME_IDLE_GRACE_MS = 30_000;
export const ASSISTANT_IFRAME_MAX_BACKGROUND_ENTRIES = 2;

function normalizeAssistantIframeBaseUrl(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    try {
        return new URL(trimmed).toString().replace(/\/+$/u, '');
    } catch {
        return trimmed.replace(/\/+$/u, '');
    }
}

function normalizeAssistantIframePath(value: string): string {
    const normalized = String(value || '').trim().replace(/\\/gu, '/').replace(/\/{2,}/gu, '/');
    return normalized.length > 1 ? normalized.replace(/\/+$/u, '') : normalized;
}

export function buildAssistantIframePoolKey(input: AssistantIframePoolKeyInput): string {
    return JSON.stringify([
        normalizeAssistantIframeBaseUrl(input.webBaseUrl),
        normalizeAssistantIframePath(input.workspacePath),
        normalizeAssistantIframePath(input.conversationStorePath) || '__default-store__',
        input.panelMode,
    ]);
}

export function createAssistantIframePoolState(): AssistantIframePoolState {
    return {
        activeKey: null,
        entries: [],
    };
}

function hideAssistantIframePoolEntry(entry: AssistantIframePoolEntry, now: number): AssistantIframePoolEntry {
    return {
        ...entry,
        hiddenAt: now,
        releaseAt: entry.runState === 'running' ? null : now + ASSISTANT_IFRAME_IDLE_GRACE_MS,
    };
}

export function pruneAssistantIframePoolState(
    state: AssistantIframePoolState,
    now: number,
): AssistantIframePoolState {
    let entries = state.entries.filter((entry) => (
        entry.key === state.activeKey
        || entry.releaseAt === null
        || entry.releaseAt > now
    ));
    const backgroundEntries = entries.filter((entry) => entry.key !== state.activeKey);
    const overflow = backgroundEntries.length - ASSISTANT_IFRAME_MAX_BACKGROUND_ENTRIES;
    if (overflow > 0) {
        const evictionKeys = new Set(backgroundEntries
            .slice()
            .sort((left, right) => {
                const leftRunning = left.runState === 'running' ? 1 : 0;
                const rightRunning = right.runState === 'running' ? 1 : 0;
                if (leftRunning !== rightRunning) return leftRunning - rightRunning;
                if (left.lastActiveAt !== right.lastActiveAt) return left.lastActiveAt - right.lastActiveAt;
                return left.key.localeCompare(right.key);
            })
            .slice(0, overflow)
            .map((entry) => entry.key));
        entries = entries.filter((entry) => !evictionKeys.has(entry.key));
    }

    return {
        activeKey: state.activeKey && entries.some((entry) => entry.key === state.activeKey)
            ? state.activeKey
            : null,
        entries,
    };
}

export function activateAssistantIframePoolState(
    state: AssistantIframePoolState,
    descriptor: AssistantIframePoolDescriptor,
    now: number,
): AssistantIframePoolState {
    let found = false;
    const entries = state.entries.map((entry) => {
        if (entry.key === descriptor.key) {
            found = true;
            return {
                ...entry,
                ...descriptor,
                src: entry.src,
                navigationUrl: entry.navigationUrl,
                navigationThreadId: entry.navigationThreadId,
                loaded: entry.loaded,
                runState: entry.runState,
                runningThreadIds: entry.runningThreadIds,
                lastActiveAt: now,
                hiddenAt: null,
                releaseAt: null,
            };
        }
        if (entry.key === state.activeKey) {
            return hideAssistantIframePoolEntry(entry, now);
        }
        return entry;
    });
    if (!found) {
        entries.push({
            ...descriptor,
            loaded: false,
            runState: 'unknown',
            runningThreadIds: [],
            lastActiveAt: now,
            hiddenAt: null,
            releaseAt: null,
        });
    }
    return pruneAssistantIframePoolState({
        activeKey: descriptor.key,
        entries,
    }, now);
}

export function deactivateAssistantIframePoolState(
    state: AssistantIframePoolState,
    now: number,
): AssistantIframePoolState {
    if (!state.activeKey) return pruneAssistantIframePoolState(state, now);
    return pruneAssistantIframePoolState({
        activeKey: null,
        entries: state.entries.map((entry) => (
            entry.key === state.activeKey ? hideAssistantIframePoolEntry(entry, now) : entry
        )),
    }, now);
}

export function markAssistantIframePoolLoaded(
    state: AssistantIframePoolState,
    key: string,
): AssistantIframePoolState {
    return {
        ...state,
        entries: state.entries.map((entry) => (
            entry.key === key ? { ...entry, loaded: true } : entry
        )),
    };
}

export function markAssistantIframePoolRunState(
    state: AssistantIframePoolState,
    key: string,
    runState: AssistantIframeRunState,
    now: number,
    threadId?: string,
): AssistantIframePoolState {
    return pruneAssistantIframePoolState({
        ...state,
        entries: state.entries.map((entry) => {
            if (entry.key !== key) return entry;
            const active = entry.key === state.activeKey;
            const runningThreadIds = new Set(entry.runningThreadIds);
            if (threadId) {
                if (runState === 'running') {
                    runningThreadIds.add(threadId);
                } else if (runState === 'idle') {
                    runningThreadIds.delete(threadId);
                }
            } else if (runState === 'idle') {
                runningThreadIds.clear();
            }
            const nextRunState = runningThreadIds.size > 0 ? 'running' : runState;
            return {
                ...entry,
                runState: nextRunState,
                runningThreadIds: Array.from(runningThreadIds),
                releaseAt: active || nextRunState === 'running'
                    ? null
                    : now + ASSISTANT_IFRAME_IDLE_GRACE_MS,
            };
        }),
    }, now);
}

export function markAssistantIframePoolNavigation(
    state: AssistantIframePoolState,
    key: string,
    navigationUrl: string,
    navigationThreadId: string | null,
): AssistantIframePoolState {
    return {
        ...state,
        entries: state.entries.map((entry) => (
            entry.key === key
                ? { ...entry, navigationUrl, navigationThreadId }
                : entry
        )),
    };
}

export function readAssistantIframeRunEvent(data: unknown): AssistantIframeRunEvent | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as { type?: unknown; payload?: unknown };
    if (record.type !== 'acp.event' || !record.payload || typeof record.payload !== 'object') return null;
    const payload = record.payload as {
        kind?: unknown;
        threadId?: unknown;
        runState?: unknown;
        runtime?: { isRunning?: unknown; runState?: unknown };
    };
    const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : '';
    if (!threadId) return null;
    if (payload.kind === 'thread.idle') {
        return { runState: 'idle', threadId };
    }
    if (payload.kind !== 'thread.runtime.changed') return null;
    const runtimeRunState = payload.runtime?.runState ?? payload.runState;
    const isRunning = payload.runtime?.isRunning === true || runtimeRunState === 'running';
    return {
        runState: isRunning ? 'running' : 'idle',
        threadId,
    };
}

export function useAssistantIframePool(): AssistantIframePoolController {
    const [state, setState] = useState<AssistantIframePoolState>(createAssistantIframePoolState);
    const iframeElementsRef = useRef(new Map<string, HTMLIFrameElement>());

    const activate = useCallback((descriptor: AssistantIframePoolDescriptor) => {
        setState((current) => activateAssistantIframePoolState(current, descriptor, Date.now()));
    }, []);

    const deactivate = useCallback(() => {
        setState((current) => deactivateAssistantIframePoolState(current, Date.now()));
    }, []);

    const markLoaded = useCallback((key: string) => {
        setState((current) => markAssistantIframePoolLoaded(current, key));
    }, []);

    const markRunState = useCallback((key: string, runState: AssistantIframeRunState, threadId?: string) => {
        setState((current) => markAssistantIframePoolRunState(current, key, runState, Date.now(), threadId));
    }, []);

    const markNavigation = useCallback((
        key: string,
        navigationUrl: string,
        navigationThreadId: string | null,
    ) => {
        setState((current) => markAssistantIframePoolNavigation(
            current,
            key,
            navigationUrl,
            navigationThreadId,
        ));
    }, []);

    const registerIframe = useCallback((key: string, iframe: HTMLIFrameElement | null) => {
        if (iframe) {
            iframeElementsRef.current.set(key, iframe);
        } else {
            iframeElementsRef.current.delete(key);
        }
    }, []);

    const getIframe = useCallback((key: string) => iframeElementsRef.current.get(key) || null, []);

    const findKeyByWindow = useCallback((source: MessageEventSource | null) => {
        if (!source) return null;
        for (const [key, iframe] of iframeElementsRef.current.entries()) {
            if (iframe.contentWindow === source) return key;
        }
        return null;
    }, []);

    useEffect(() => {
        const nextReleaseAt = state.entries
            .filter((entry) => entry.key !== state.activeKey && entry.releaseAt !== null)
            .reduce<number | null>((earliest, entry) => (
                earliest === null || entry.releaseAt! < earliest ? entry.releaseAt! : earliest
            ), null);
        if (nextReleaseAt === null) return undefined;
        const timer = window.setTimeout(() => {
            setState((current) => pruneAssistantIframePoolState(current, Date.now()));
        }, Math.max(0, nextReleaseAt - Date.now()));
        return () => window.clearTimeout(timer);
    }, [state.activeKey, state.entries]);

    const activeEntry = state.activeKey
        ? state.entries.find((entry) => entry.key === state.activeKey) || null
        : null;

    return useMemo(() => ({
        ...state,
        activeEntry,
        activate,
        deactivate,
        markLoaded,
        markRunState,
        markNavigation,
        registerIframe,
        getIframe,
        findKeyByWindow,
    }), [
        activate,
        activeEntry,
        deactivate,
        findKeyByWindow,
        getIframe,
        markLoaded,
        markNavigation,
        markRunState,
        registerIframe,
        state,
    ]);
}
