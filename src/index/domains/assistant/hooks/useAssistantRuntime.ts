import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../../../services/index.api';

export type AssistantRuntimeState = Awaited<ReturnType<typeof apiService.getAssistantRuntime>>;

interface UseAssistantRuntimeOptions {
    defaultRuntime: AssistantRuntimeState;
    projectId?: string | null;
}

type AssistantRuntimeRequestKey = 'auto-start' | 'probe';
type AssistantRuntimeListener = (runtime: AssistantRuntimeState | null) => void;

interface AssistantRuntimeProjectStore {
    runtime: AssistantRuntimeState | null;
    initialized: boolean;
    initialProbePromise: Promise<AssistantRuntimeState> | null;
    requests: Partial<Record<AssistantRuntimeRequestKey, Promise<AssistantRuntimeState>>>;
    listeners: Set<AssistantRuntimeListener>;
}

interface AssistantRuntimePageStore {
    stores: Record<string, AssistantRuntimeProjectStore>;
}

const ASSISTANT_RUNTIME_PAGE_STORE_KEY = '__axhub_assistant_runtime_page_store__';

function createAssistantRuntimeProjectStore(): AssistantRuntimeProjectStore {
    return {
        runtime: null,
        initialized: false,
        initialProbePromise: null,
        requests: {},
        listeners: new Set(),
    };
}

function createAssistantRuntimePageStore(): AssistantRuntimePageStore {
    return {
        stores: {},
    };
}

function getAssistantRuntimePageStore(): AssistantRuntimePageStore {
    const runtimeGlobal = globalThis as typeof globalThis & {
        [ASSISTANT_RUNTIME_PAGE_STORE_KEY]?: AssistantRuntimePageStore;
    };

    if (!runtimeGlobal[ASSISTANT_RUNTIME_PAGE_STORE_KEY]) {
        runtimeGlobal[ASSISTANT_RUNTIME_PAGE_STORE_KEY] = createAssistantRuntimePageStore();
    }

    return runtimeGlobal[ASSISTANT_RUNTIME_PAGE_STORE_KEY]!;
}

function resolveAssistantRuntimeProjectKey(projectId?: string | null): string {
    return projectId?.trim() || '__none__';
}

function getAssistantRuntimeProjectStore(projectId?: string | null): AssistantRuntimeProjectStore {
    const pageStore = getAssistantRuntimePageStore();
    const projectKey = resolveAssistantRuntimeProjectKey(projectId);
    if (!pageStore.stores[projectKey]) {
        pageStore.stores[projectKey] = createAssistantRuntimeProjectStore();
    }
    return pageStore.stores[projectKey];
}

function notifyAssistantRuntimeListeners(projectId: string | null | undefined, runtime: AssistantRuntimeState | null) {
    const store = getAssistantRuntimeProjectStore(projectId);
    store.listeners.forEach((listener) => {
        listener(runtime);
    });
}

function writeAssistantRuntime(projectId: string | null | undefined, runtime: AssistantRuntimeState | null) {
    const store = getAssistantRuntimeProjectStore(projectId);
    store.runtime = runtime;
    if (runtime) {
        store.initialized = true;
    }
    notifyAssistantRuntimeListeners(projectId, runtime);
}

function subscribeAssistantRuntime(projectId: string | null | undefined, listener: AssistantRuntimeListener) {
    const store = getAssistantRuntimeProjectStore(projectId);
    store.listeners.add(listener);
    return () => {
        store.listeners.delete(listener);
    };
}

function resolveAssistantRuntimeRequestKey(options?: { autoStart?: boolean }): AssistantRuntimeRequestKey {
    return options?.autoStart === false ? 'probe' : 'auto-start';
}

async function requestAssistantRuntime(projectId: string, options?: { autoStart?: boolean }): Promise<AssistantRuntimeState> {
    const store = getAssistantRuntimeProjectStore(projectId);
    const requestKey = resolveAssistantRuntimeRequestKey(options);
    const existingRequest = store.requests[requestKey];
    if (existingRequest) {
        return existingRequest;
    }

    const request = (async () => {
        const nextRuntime = await apiService.getAssistantRuntime({
            autoStart: options?.autoStart ?? true,
            projectId,
        }) as AssistantRuntimeState;
        writeAssistantRuntime(projectId, nextRuntime);
        return nextRuntime;
    })().finally(() => {
        const currentStore = getAssistantRuntimeProjectStore(projectId);
        if (currentStore.requests[requestKey] === request) {
            delete currentStore.requests[requestKey];
        }
    });

    store.requests[requestKey] = request;
    return request;
}

async function ensureAssistantRuntimeInitialized(
    projectId: string | null | undefined,
    defaultRuntime: AssistantRuntimeState,
): Promise<AssistantRuntimeState> {
    const normalizedProjectId = projectId?.trim() || '';
    if (!normalizedProjectId) {
        writeAssistantRuntime(projectId, defaultRuntime);
        return defaultRuntime;
    }
    const store = getAssistantRuntimeProjectStore(projectId);

    if (store.initialized && store.runtime) {
        return store.runtime;
    }

    if (store.runtime) {
        store.initialized = true;
        return store.runtime;
    }

    if (store.initialProbePromise) {
        return store.initialProbePromise;
    }

    store.initialProbePromise = requestAssistantRuntime(normalizedProjectId, { autoStart: false })
        .catch(() => {
            writeAssistantRuntime(projectId, defaultRuntime);
            return defaultRuntime;
        })
        .finally(() => {
            const currentStore = getAssistantRuntimeProjectStore(projectId);
            currentStore.initialized = true;
            currentStore.initialProbePromise = null;
        });

    return store.initialProbePromise;
}

export function useAssistantRuntime({ defaultRuntime, projectId }: UseAssistantRuntimeOptions) {
    const defaultRuntimeRef = useRef(defaultRuntime);
    const projectKey = resolveAssistantRuntimeProjectKey(projectId);
    const [runtimeSnapshot, setRuntimeSnapshot] = useState<{
        projectKey: string;
        runtime: AssistantRuntimeState | null;
    }>(() => {
        return {
            projectKey,
            runtime: getAssistantRuntimeProjectStore(projectId).runtime,
        };
    });
    const [checking, setChecking] = useState(false);
    const runtime = runtimeSnapshot.projectKey === projectKey
        ? runtimeSnapshot.runtime
        : getAssistantRuntimeProjectStore(projectId).runtime;

    useEffect(() => {
        defaultRuntimeRef.current = defaultRuntime;
    }, [defaultRuntime]);

    const setRuntime = useCallback((nextRuntime: AssistantRuntimeState | null) => {
        writeAssistantRuntime(projectId, nextRuntime);
    }, [projectId]);

    const refreshRuntime = useCallback(async (options?: { autoStart?: boolean }) => {
        const normalizedProjectId = projectId?.trim() || '';
        if (!normalizedProjectId) {
            writeAssistantRuntime(projectId, defaultRuntimeRef.current);
            return defaultRuntimeRef.current;
        }
        return requestAssistantRuntime(normalizedProjectId, {
            autoStart: options?.autoStart ?? false,
        });
    }, [projectId]);

    useEffect(() => {
        let canceled = false;
        const nextProjectKey = resolveAssistantRuntimeProjectKey(projectId);

        setRuntimeSnapshot({
            projectKey: nextProjectKey,
            runtime: getAssistantRuntimeProjectStore(projectId).runtime,
        });

        const unsubscribe = subscribeAssistantRuntime(projectId, (nextRuntime) => {
            if (canceled) {
                return;
            }
            setRuntimeSnapshot({ projectKey: nextProjectKey, runtime: nextRuntime });
        });

        void ensureAssistantRuntimeInitialized(projectId, defaultRuntimeRef.current).then((nextRuntime) => {
            if (canceled) {
                return;
            }
            setRuntimeSnapshot({ projectKey: nextProjectKey, runtime: nextRuntime });
        });

        return () => {
            canceled = true;
            unsubscribe();
        };
    }, [projectId]);

    return {
        runtime,
        setRuntime,
        checking,
        setChecking,
        refreshRuntime,
    };
}
