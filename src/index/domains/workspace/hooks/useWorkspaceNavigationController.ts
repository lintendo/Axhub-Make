import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasItem, DataType, ItemData, SidebarTreeNode, SidebarTreeTab } from '../../../types';
import type { DataTableResourceItem, ThemeResourceItem } from '../../../types/index-page.types';
import type { TemplateAssetOption } from '../../../types';
import { sidebarApi } from '../../../services/sidebar.api';
import { requireProjectScope, withProjectScope } from '../../../services/projectScope';
import {
    DEFAULT_LOCAL_EXPORT_CAPABILITIES,
    DEFAULT_PROJECT_CAPABILITIES,
    DEFAULT_RESOURCE_WRITE_CAPABILITIES,
    normalizeProjectResourcesPayload,
    normalizeProjectRuntimeStatusPayload,
    normalizeProjectsPayload,
    type ProjectCapabilities,
    type ProjectListItem,
    type ProjectRuntimeStatus,
} from '../../../services/projectResources';
import { buildDefaultTree, sanitizeSidebarTree } from '../../../utils/sidebarTree';
import {
    normalizeCanvasItems,
    normalizeDocsItems,
    resolveSidebarTreeTab,
    scheduleIdleTask,
    sortResourceItemsByOrder,
    type SidebarTab,
} from '../../../app/index-page.helpers';
import { formatMakeClientProjectError } from '../../../utils/projectSetupErrors';

interface MessageApi {
    error: (content: string) => void;
    warning: (content: string) => void;
}

interface UseWorkspaceNavigationControllerOptions {
    messageApi: MessageApi;
}

const UNTITLED_PROJECT_LABEL = '未命名项目';
const MAKE_CLIENT_DEV_START_TIMEOUT_MS = 60_000;

interface MakeClientProgressStepPayload {
    id?: unknown;
    label?: unknown;
    durationMs?: unknown;
    status?: unknown;
}

interface MakeClientProgressPayload {
    status?: unknown;
    totalMs?: unknown;
    steps?: unknown;
}

function formatMakeClientProgressDuration(durationMs: number): string {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return '未知';
    }
    if (durationMs >= 1000) {
        return `${(durationMs / 1000).toFixed(2)}s`;
    }
    return `${Math.round(durationMs)}ms`;
}

function readMakeClientCreateProgress(payload: unknown): { status: string; totalMs: number; steps: Array<{ id: string; label: string; durationMs: number; status: string }> } | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const progress = (payload as { progress?: MakeClientProgressPayload }).progress;
    if (!progress || typeof progress !== 'object') {
        return null;
    }
    const steps = Array.isArray(progress.steps)
        ? progress.steps.map((step: MakeClientProgressStepPayload) => ({
            id: typeof step?.id === 'string' ? step.id : '',
            label: typeof step?.label === 'string' ? step.label : '',
            durationMs: typeof step?.durationMs === 'number' && Number.isFinite(step.durationMs) ? step.durationMs : 0,
            status: typeof step?.status === 'string' ? step.status : '',
        })).filter((step) => step.id || step.label)
        : [];
    const totalMs = typeof progress.totalMs === 'number' && Number.isFinite(progress.totalMs)
        ? progress.totalMs
        : steps.reduce((sum, step) => sum + step.durationMs, 0);
    return {
        status: typeof progress.status === 'string' ? progress.status : 'unknown',
        totalMs,
        steps,
    };
}

function logMakeClientCreateProgress(payload: unknown): void {
    const progress = readMakeClientCreateProgress(payload);
    if (!progress || typeof console === 'undefined') {
        return;
    }
    const rows = progress.steps.map((step, index) => ({
        '#': index + 1,
        阶段: step.label || step.id,
        id: step.id,
        状态: step.status || '-',
        耗时: formatMakeClientProgressDuration(step.durationMs),
        durationMs: Math.round(step.durationMs),
    }));
    console.groupCollapsed(`[Axhub Make] 新建项目耗时 ${formatMakeClientProgressDuration(progress.totalMs)} (${progress.status})`);
    console.table(rows);
    console.info('totalMs', Math.round(progress.totalMs), 'status', progress.status);
    console.groupEnd();
}

function readInitialProjectIdFromUrl(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        const projectId = new URLSearchParams(window.location.search).get('projectId')?.trim();
        return projectId || null;
    } catch {
        return null;
    }
}

function replaceBrowserProjectId(projectId: string | null): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const url = new URL(window.location.href);
        if (projectId) {
            url.searchParams.set('projectId', projectId);
        } else {
            url.searchParams.delete('projectId');
        }
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
        // Keep project loading functional in restricted browser environments.
    }
}

function isLANHostname(hostname: string): boolean {
    const normalized = String(hostname || '').trim().toLowerCase();
    if (!normalized) return false;
    return normalized !== 'localhost'
        && normalized !== '0.0.0.0'
        && normalized !== '::1'
        && normalized !== '[::1]'
        && !/^127(?:\.\d{1,3}){3}$/u.test(normalized);
}

function withActiveProjectParam(url: string, activeProjectId: string | null): string {
    return withProjectScope(url, requireProjectScope(activeProjectId));
}

export function useWorkspaceNavigationController({ messageApi }: UseWorkspaceNavigationControllerOptions) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<DataType>({ components: [], prototypes: [] });
    const [docsItems, setDocsItems] = useState<ItemData[]>([]);
    const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
    const [themes, setThemes] = useState<ThemeResourceItem[]>([]);
    const [dataTables, setDataTables] = useState<DataTableResourceItem[]>([]);
    const [templateAssets, setTemplateAssets] = useState<TemplateAssetOption[]>([]);
    const [projects, setProjects] = useState<ProjectListItem[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [projectCapabilities, setProjectCapabilities] = useState<ProjectCapabilities>(DEFAULT_PROJECT_CAPABILITIES);
    const [projectRuntimeStatus, setProjectRuntimeStatus] = useState<ProjectRuntimeStatus | null>(null);
    const [projectRuntimeStatusLoading, setProjectRuntimeStatusLoading] = useState(false);
    const [resourceOrders, setResourceOrders] = useState<{ themes: string[]; data: string[]; templates: string[] }>({
        themes: [],
        data: [],
        templates: [],
    });
    const [sidebarTrees, setSidebarTrees] = useState<Record<SidebarTreeTab, SidebarTreeNode[]>>({
        prototypes: [],
        docs: [],
        canvas: [],
        themes: [],
    });
    const [sidebarAssetsLoaded, setSidebarAssetsLoaded] = useState(false);
    const [projectSetupRequired, setProjectSetupRequired] = useState(false);
    const [projectAccessDeniedReason, setProjectAccessDeniedReason] = useState('');
    const [projectTitle, setProjectTitle] = useState(UNTITLED_PROJECT_LABEL);
    const [searchText, setSearchText] = useState('');

    const loadedSidebarTreeTabsRef = useRef<Set<SidebarTreeTab>>(new Set());
    const loadingSidebarTreeTabsRef = useRef<Set<SidebarTreeTab>>(new Set());
    const sidebarTreeRequestVersionRef = useRef<Partial<Record<SidebarTreeTab, number>>>({});
    const sidebarAssetsRequestedRef = useRef(false);
    const projectResourcesLoadedRef = useRef(false);
    const projectSetupRequiredRef = useRef(false);
    const projectAccessDeniedRef = useRef(false);
    const initialProjectIdRef = useRef<string | null>(readInitialProjectIdFromUrl());

    const applyProjectResourceBundle = useCallback((bundle: ReturnType<typeof normalizeProjectResourcesPayload>) => {
        projectAccessDeniedRef.current = false;
        setProjectAccessDeniedReason('');
        setData(bundle.data);
        setDocsItems(bundle.docs);
        setThemes(sortResourceItemsByOrder(bundle.themes, bundle.orders.themes, (item: ThemeResourceItem) => item.name));
        setDataTables([]);
        setTemplateAssets([]);
        setResourceOrders({ themes: bundle.orders.themes, data: [], templates: [] });
        const resourceWriteCapabilities = bundle.capabilities.resourceWrites || DEFAULT_RESOURCE_WRITE_CAPABILITIES;
        const localExportCapabilities = bundle.capabilities.localExports || DEFAULT_LOCAL_EXPORT_CAPABILITIES;
        if (
            resourceWriteCapabilities === bundle.capabilities.resourceWrites
            && localExportCapabilities === bundle.capabilities.localExports
        ) {
            setProjectCapabilities(bundle.capabilities);
        } else {
            setProjectCapabilities({
                ...bundle.capabilities,
                localExports: localExportCapabilities,
                resourceWrites: resourceWriteCapabilities,
            });
        }
        if (typeof bundle.projectName === 'string') {
            setProjectTitle(bundle.projectName || UNTITLED_PROJECT_LABEL);
        }
        setActiveProjectId(bundle.projectId);
        const themeItems = bundle.themes.map((theme: ThemeResourceItem) => ({
            name: theme.name,
            displayName: theme.displayName || theme.name,
            jsUrl: '',
            specUrl: '',
        } as ItemData));
        setSidebarTrees((previous) => ({
            ...previous,
            prototypes: loadedSidebarTreeTabsRef.current.has('prototypes')
                ? sanitizeSidebarTree('prototypes', previous.prototypes, bundle.data.prototypes)
                : buildDefaultTree('prototypes', bundle.data.prototypes),
            docs: loadedSidebarTreeTabsRef.current.has('docs')
                ? sanitizeSidebarTree('docs', previous.docs, bundle.docs)
                : buildDefaultTree('docs', bundle.docs),
            themes: loadedSidebarTreeTabsRef.current.has('themes')
                ? sanitizeSidebarTree('themes', previous.themes, themeItems)
                : buildDefaultTree('themes', themeItems),
        }));
    }, []);

    const loadProjects = useCallback(async (): Promise<ReturnType<typeof normalizeProjectsPayload>> => {
        const response = await fetch('/api/projects');
        if (!response.ok) {
            const fallback = { activeProjectId: null, projects: [] };
            setProjects([]);
            setActiveProjectId(null);
            setProjectSetupRequired(true);
            projectSetupRequiredRef.current = true;
            setProjectCapabilities(DEFAULT_PROJECT_CAPABILITIES);
            setProjectAccessDeniedReason('');
            projectAccessDeniedRef.current = false;
            return fallback;
        }
        const payload = normalizeProjectsPayload(await response.json().catch(() => null));
        const requestedProjectId = initialProjectIdRef.current;
        const requestedProjectExists = Boolean(
            requestedProjectId
            && payload.projects.some((project) => project.id === requestedProjectId),
        );
        if (requestedProjectId && !requestedProjectExists) {
            messageApi.warning(payload.activeProjectId
                ? '链接中的项目不存在或未注册，已切换到当前项目'
                : '链接中的项目不存在或未注册，请重新选择项目');
            replaceBrowserProjectId(payload.activeProjectId);
            initialProjectIdRef.current = null;
        }
        setProjects(payload.projects);
        setActiveProjectId(requestedProjectExists ? requestedProjectId : payload.activeProjectId);
        setProjectSetupRequired(payload.projects.length === 0);
        projectSetupRequiredRef.current = payload.projects.length === 0;
        return payload;
    }, [messageApi]);

    const probeProjectRuntimeStatus = useCallback(async (projectId: string | null): Promise<ProjectRuntimeStatus | null> => {
        if (!projectId) {
            setProjectRuntimeStatus(null);
            return null;
        }
        setProjectRuntimeStatusLoading(true);
        try {
            const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dev/status`);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || '检测 Make 客户端状态失败');
            }
            const normalized = normalizeProjectRuntimeStatusPayload(payload, projectId);
            setProjectRuntimeStatus(normalized);
            return normalized;
        } catch (error) {
            const fallback = normalizeProjectRuntimeStatusPayload({
                projectId,
                makeClient: false,
                running: false,
                reason: 'status-unavailable',
            }, projectId);
            setProjectRuntimeStatus(fallback);
            return fallback;
        } finally {
            setProjectRuntimeStatusLoading(false);
        }
    }, []);

    const loadProjectResourcesFor = useCallback(async (projectId: string | null): Promise<boolean> => {
        if (!projectId) {
            setProjectCapabilities(DEFAULT_PROJECT_CAPABILITIES);
            setProjectRuntimeStatus(null);
            setProjectAccessDeniedReason('');
            projectAccessDeniedRef.current = false;
            return false;
        }
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/resources`);
        if (!response.ok) {
            projectResourcesLoadedRef.current = false;
            return false;
        }
        const payload = await response.json();
        const bundle = normalizeProjectResourcesPayload(payload, projectId);
        if (
            typeof window !== 'undefined'
            && isLANHostname(window.location.hostname)
            && bundle.capabilities.lanAccessAllowed === false
        ) {
            projectAccessDeniedRef.current = true;
            setProjectAccessDeniedReason('当前项目未开启局域网访问');
            messageApi.error('当前项目未开启局域网访问');
            setProjectCapabilities(bundle.capabilities);
            setProjectRuntimeStatus(null);
            projectResourcesLoadedRef.current = false;
            return false;
        }
        applyProjectResourceBundle(bundle);
        void probeProjectRuntimeStatus(projectId);
        projectResourcesLoadedRef.current = true;
        setSidebarAssetsLoaded(true);
        return true;
    }, [applyProjectResourceBundle, messageApi, probeProjectRuntimeStatus]);

    const loadProjectResources = useCallback(async (): Promise<boolean> => {
        const projectList = await loadProjects();
        const requestedProjectId = initialProjectIdRef.current;
        if (projectList.projects.length === 0) {
            setProjectCapabilities(DEFAULT_PROJECT_CAPABILITIES);
            setProjectRuntimeStatus(null);
            setProjectAccessDeniedReason('');
            projectResourcesLoadedRef.current = false;
            return false;
        }
        if (requestedProjectId) {
            const requestedExists = projectList.projects.some((project) => project.id === requestedProjectId);
            if (requestedExists && await loadProjectResourcesFor(requestedProjectId)) {
                return true;
            }
            if (projectAccessDeniedRef.current) {
                return false;
            }
            initialProjectIdRef.current = null;
        }
        return loadProjectResourcesFor(projectList.activeProjectId);
    }, [loadProjectResourcesFor, loadProjects]);

    const loadData = useCallback(async () => {
        try {
            if (await loadProjectResources()) {
                return;
            }
            if (projectSetupRequiredRef.current) {
                return;
            }
            if (projectAccessDeniedRef.current) {
                return;
            }
            if (!activeProjectId) {
                setData({ components: [], prototypes: [] });
                return;
            }
            const response = await fetch(withActiveProjectParam('/api/entries.json', activeProjectId));
            if (!response.ok) {
                throw new Error('Failed to fetch data');
            }
            const jsonData = await response.json();
            setData({
                components: [],
                prototypes: Array.isArray(jsonData?.prototypes) ? jsonData.prototypes : [],
            });
        } catch (error: any) {
            messageApi.error(`加载数据失败: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [activeProjectId, loadProjectResources, messageApi]);

    const resetProjectScopedState = useCallback(() => {
        loadedSidebarTreeTabsRef.current.clear();
        loadingSidebarTreeTabsRef.current.clear();
        sidebarAssetsRequestedRef.current = false;
        projectResourcesLoadedRef.current = false;
        setSidebarAssetsLoaded(false);
        setProjectCapabilities(DEFAULT_PROJECT_CAPABILITIES);
        setProjectRuntimeStatus(null);
        setProjectAccessDeniedReason('');
        projectAccessDeniedRef.current = false;
        setSidebarTrees({
            prototypes: [],
            docs: [],
            canvas: [],
            themes: [],
        });
        setSearchText('');
    }, []);

    const ensureProjectDevServer = useCallback(async (projectId: string) => {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dev/ensure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeoutMs: MAKE_CLIENT_DEV_START_TIMEOUT_MS }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(formatMakeClientProjectError(payload, '启动 Make 客户端失败'));
            (error as Error & { diagnostic?: unknown }).diagnostic = payload;
            throw error;
        }
        return payload;
    }, []);

    const startActiveProjectServer = useCallback(async () => {
        if (!activeProjectId) {
            throw new Error('请先选择项目');
        }
        const payload = await ensureProjectDevServer(activeProjectId);
        await loadProjectResourcesFor(activeProjectId);
        await probeProjectRuntimeStatus(activeProjectId);
        return payload;
    }, [activeProjectId, ensureProjectDevServer, loadProjectResourcesFor, probeProjectRuntimeStatus]);

    const switchProject = useCallback(async (projectId: string) => {
        const normalizedProjectId = projectId.trim();
        const alreadyActiveProject = normalizedProjectId === activeProjectId;
        if (!normalizedProjectId) {
            return;
        }
        initialProjectIdRef.current = null;
        const response = await fetch('/api/projects/active', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: normalizedProjectId }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || '切换项目失败');
        }
        if (alreadyActiveProject && projectResourcesLoadedRef.current) {
            await loadProjects();
            await probeProjectRuntimeStatus(normalizedProjectId);
            return;
        }
        resetProjectScopedState();
        setLoading(true);
        try {
            await loadProjects();
            const loaded = await loadProjectResourcesFor(normalizedProjectId);
            if (!loaded) {
                throw new Error('加载项目资源失败');
            }
            await probeProjectRuntimeStatus(normalizedProjectId);
        } finally {
            setLoading(false);
        }
    }, [activeProjectId, loadProjectResourcesFor, loadProjects, probeProjectRuntimeStatus, resetProjectScopedState]);

    const deleteProject = useCallback(async (projectId: string) => {
        const normalizedProjectId = projectId.trim();
        if (!normalizedProjectId) {
            return;
        }
        const wasActiveProject = normalizedProjectId === activeProjectId;
        const response = await fetch(`/api/projects/${encodeURIComponent(normalizedProjectId)}`, {
            method: 'DELETE',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(payload?.error || '移除项目失败');
        }

        initialProjectIdRef.current = null;
        const projectList = await loadProjects();
        if (wasActiveProject) {
            resetProjectScopedState();
            if (!projectList.activeProjectId) {
                setProjectCapabilities(DEFAULT_PROJECT_CAPABILITIES);
                setProjectRuntimeStatus(null);
                return;
            }
            setLoading(true);
            try {
                const loaded = await loadProjectResourcesFor(projectList.activeProjectId);
                if (!loaded) {
                    throw new Error('加载项目资源失败');
                }
                await probeProjectRuntimeStatus(projectList.activeProjectId);
            } finally {
                setLoading(false);
            }
        }
    }, [activeProjectId, loadProjectResourcesFor, loadProjects, probeProjectRuntimeStatus, resetProjectScopedState]);

    const stopProjectDevServer = useCallback(async (projectId: string) => {
        const normalizedProjectId = projectId.trim();
        if (!normalizedProjectId) {
            return;
        }
        const response = await fetch(`/api/projects/${encodeURIComponent(normalizedProjectId)}/dev/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(formatMakeClientProjectError(payload, '终止客户端失败'));
        }
        await loadProjects();
        if (normalizedProjectId === activeProjectId) {
            await probeProjectRuntimeStatus(normalizedProjectId);
        }
    }, [activeProjectId, loadProjects, probeProjectRuntimeStatus]);

    const addProjectFromLocalPath = useCallback(async (root: string) => {
        const normalizedRoot = root.trim();
        if (!normalizedRoot) {
            return false;
        }
        const createResponse = await fetch('/api/projects/make/register-existing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ root: normalizedRoot }),
        });
        const createPayload = await createResponse.json().catch(() => null);
        if (!createResponse.ok) {
            const error = new Error(formatMakeClientProjectError(createPayload, '添加项目失败'));
            (error as Error & { diagnostic?: unknown }).diagnostic = createPayload;
            throw error;
        }
        const projectId = typeof createPayload?.project?.id === 'string' ? createPayload.project.id.trim() : '';
        if (!projectId) {
            throw new Error('添加项目后未返回项目 ID');
        }
        await switchProject(projectId);
        return true;
    }, [switchProject]);

    const createBlankMakeProject = useCallback(async (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => {
        const response = await fetch('/api/projects/make/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        const payload = await response.json().catch(() => null);
        logMakeClientCreateProgress(payload);
        if (!response.ok) {
            const error = new Error(formatMakeClientProjectError(payload, '新建空白项目失败'));
            (error as Error & { diagnostic?: unknown }).diagnostic = payload;
            throw error;
        }
        const projectId = typeof payload?.project?.id === 'string' ? payload.project.id.trim() : '';
        if (!projectId) {
            throw new Error('新建项目后未返回项目 ID');
        }
        resetProjectScopedState();
        setActiveProjectId(projectId);
        setProjectTitle(typeof payload?.project?.name === 'string' ? payload.project.name || UNTITLED_PROJECT_LABEL : projectId);
        setLoading(true);
        try {
            await loadProjects();
            const loaded = await loadProjectResourcesFor(projectId);
            if (!loaded) {
                messageApi.error('项目已创建，但加载资源失败，请刷新或重新切换项目');
            }
        } finally {
            setLoading(false);
        }
        return payload;
    }, [loadProjectResourcesFor, loadProjects, messageApi, resetProjectScopedState]);

    const cloneMakeProject = useCallback(async (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
        gitUrl: string;
    }) => {
        const response = await fetch('/api/projects/make/clone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        const payload = await response.json().catch(() => null);
        logMakeClientCreateProgress(payload);
        if (!response.ok) {
            const error = new Error(formatMakeClientProjectError(payload, '克隆项目失败'));
            (error as Error & { diagnostic?: unknown }).diagnostic = payload;
            throw error;
        }
        const projectId = typeof payload?.project?.id === 'string' ? payload.project.id.trim() : '';
        if (!projectId) {
            throw new Error('克隆项目后未返回项目 ID');
        }
        resetProjectScopedState();
        setActiveProjectId(projectId);
        setProjectTitle(typeof payload?.project?.name === 'string' ? payload.project.name || UNTITLED_PROJECT_LABEL : projectId);
        setLoading(true);
        try {
            await loadProjects();
            const loaded = await loadProjectResourcesFor(projectId);
            if (!loaded) {
                messageApi.error('项目已克隆，但加载资源失败，请刷新或重新切换项目');
            }
        } finally {
            setLoading(false);
        }
        return payload;
    }, [loadProjectResourcesFor, loadProjects, messageApi, resetProjectScopedState]);

    const copyMakeProject = useCallback(async (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => {
        if (!activeProjectId) {
            throw new Error('请先选择项目');
        }
        const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/make-client/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        const payload = await response.json().catch(() => null);
        logMakeClientCreateProgress(payload);
        if (!response.ok) {
            const error = new Error(formatMakeClientProjectError(payload, '复制项目失败'));
            (error as Error & { diagnostic?: unknown }).diagnostic = payload;
            throw error;
        }
        const projectId = typeof payload?.project?.id === 'string' ? payload.project.id.trim() : '';
        if (!projectId) {
            throw new Error('复制项目后未返回项目 ID');
        }
        resetProjectScopedState();
        setActiveProjectId(projectId);
        setProjectTitle(typeof payload?.project?.name === 'string' ? payload.project.name || UNTITLED_PROJECT_LABEL : projectId);
        setLoading(true);
        try {
            await loadProjects();
            const loaded = await loadProjectResourcesFor(projectId);
            if (!loaded) {
                messageApi.error('项目已复制，但加载资源失败，请刷新或重新切换项目');
            }
        } finally {
            setLoading(false);
        }
        return payload;
    }, [activeProjectId, loadProjectResourcesFor, loadProjects, messageApi, resetProjectScopedState]);

    const reloadSidebarAssets = useCallback(async () => {
        try {
            if (await loadProjectResources()) {
                return;
            }
            if (projectSetupRequiredRef.current) {
                return;
            }
            if (projectAccessDeniedRef.current) {
                return;
            }
            const [
                docsResponse,
                themesResponse,
                themeOrderResponse,
            ] = await Promise.all([
                fetch(withActiveProjectParam('/api/docs', activeProjectId)),
                fetch(withActiveProjectParam('/api/themes', activeProjectId)),
                sidebarApi.getResourceOrder('themes', requireProjectScope(activeProjectId)).catch(() => null),
            ]);

            const themeOrder = Array.isArray(themeOrderResponse?.order) ? themeOrderResponse.order : [];
            setDataTables([]);
            setTemplateAssets([]);
            setResourceOrders({ themes: themeOrder, data: [], templates: [] });

            if (docsResponse.ok) {
                const docs = await docsResponse.json();
                setDocsItems(normalizeDocsItems(docs, activeProjectId));
            }

            if (themesResponse.ok) {
                const themesData = await themesResponse.json();
                const nextThemes = Array.isArray(themesData) ? themesData : [];
                setThemes(sortResourceItemsByOrder(nextThemes, themeOrder, (item: ThemeResourceItem) => item.name));
            }

        } catch (error) {
            console.warn('Failed to load docs/themes assets:', error);
        } finally {
            setSidebarAssetsLoaded(true);
        }
    }, [activeProjectId, loadProjectResources]);

    const reloadDocsItems = useCallback(async (): Promise<ItemData[]> => {
        const response = await fetch(withActiveProjectParam('/api/docs', activeProjectId));
        if (!response.ok) {
            throw new Error('Failed to fetch docs');
        }
        const docs = await response.json();
        const docsList = normalizeDocsItems(docs, activeProjectId);
        setDocsItems(docsList);
        return docsList;
    }, [activeProjectId]);

    const reloadCanvasItems = useCallback(async (): Promise<CanvasItem[]> => {
        setCanvasItems([]);
        return [];
    }, []);

    const getSidebarTabItems = useCallback((tab: SidebarTreeTab): ItemData[] => {
        if (tab === 'docs') {
            return docsItems;
        }
        if (tab === 'canvas') {
            return docsItems.filter((item) => item.openMode === 'canvas');
        }
        if (tab === 'themes') {
            return themes.map((theme) => ({
                name: theme.name,
                displayName: theme.displayName || theme.name,
                jsUrl: '',
                specUrl: '',
            }));
        }
        return data.prototypes;
    }, [data.prototypes, docsItems, themes]);

    const loadSidebarTree = useCallback(async (tab: SidebarTreeTab, options?: { force?: boolean; items?: ItemData[] }) => {
        if (!options?.force && loadedSidebarTreeTabsRef.current.has(tab)) {
            return;
        }
        if (!options?.force && loadingSidebarTreeTabsRef.current.has(tab)) {
            return;
        }
        if (tab === 'prototypes' && loading) {
            return;
        }
        if ((tab === 'docs' || tab === 'canvas' || tab === 'themes') && !sidebarAssetsLoaded) {
            return;
        }

        const requestVersion = (sidebarTreeRequestVersionRef.current[tab] || 0) + 1;
        sidebarTreeRequestVersionRef.current[tab] = requestVersion;
        const items = options?.items || getSidebarTabItems(tab);
        setSidebarTrees((previous) => ({
            ...previous,
            [tab]: previous[tab].length > 0 ? previous[tab] : buildDefaultTree(tab, items),
        }));

        loadingSidebarTreeTabsRef.current.add(tab);
        try {
            const response = await sidebarApi.getSidebarTree(tab, requireProjectScope(activeProjectId));
            const nextTree = sanitizeSidebarTree(
                tab,
                Array.isArray(response.tree) ? response.tree : [],
                items,
            );
            if (sidebarTreeRequestVersionRef.current[tab] !== requestVersion) {
                return;
            }
            loadedSidebarTreeTabsRef.current.add(tab);
            setSidebarTrees((previous) => ({ ...previous, [tab]: nextTree }));
        } catch {
            if (sidebarTreeRequestVersionRef.current[tab] !== requestVersion) {
                return;
            }
            loadedSidebarTreeTabsRef.current.add(tab);
            setSidebarTrees((previous) => ({ ...previous, [tab]: buildDefaultTree(tab, items) }));
        } finally {
            if (sidebarTreeRequestVersionRef.current[tab] === requestVersion) {
                loadingSidebarTreeTabsRef.current.delete(tab);
            }
        }
    }, [activeProjectId, getSidebarTabItems, loading, sidebarAssetsLoaded]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!activeProjectId) {
            setProjectTitle(UNTITLED_PROJECT_LABEL);
        }
    }, [activeProjectId]);

    useEffect(() => {
        document.title = `${projectTitle || UNTITLED_PROJECT_LABEL} - Axhub Make`;
    }, [projectTitle]);

    useEffect(() => {
        if (sidebarAssetsRequestedRef.current) {
            return;
        }
        if (sidebarAssetsLoaded || projectResourcesLoadedRef.current) {
            return;
        }

        sidebarAssetsRequestedRef.current = true;
        return scheduleIdleTask(() => {
            void reloadSidebarAssets();
        });
    }, [reloadSidebarAssets, sidebarAssetsLoaded]);

    useEffect(() => {
        setSidebarTrees((previous) => {
            let changed = false;
            const nextTrees = { ...previous };
            const treeTabs: SidebarTreeTab[] = ['prototypes', 'docs', 'themes'];

            for (const tab of treeTabs) {
                if (!loadedSidebarTreeTabsRef.current.has(tab)) {
                    continue;
                }

                const sanitizedTree = sanitizeSidebarTree(tab, previous[tab] || [], getSidebarTabItems(tab));
                if (sanitizedTree !== previous[tab]) {
                    nextTrees[tab] = sanitizedTree;
                    changed = true;
                }
            }

            return changed ? nextTrees : previous;
        });
    }, [getSidebarTabItems]);

    const ensureSidebarTreeLoaded = useCallback((sidebarTab: SidebarTab) => {
        const activeTreeTab = resolveSidebarTreeTab(sidebarTab);
        void loadSidebarTree(activeTreeTab, activeTreeTab === 'docs' ? { force: true } : undefined);
    }, [loadSidebarTree]);

    return {
        loading,
        setLoading,
        data,
        setData,
        docsItems,
        setDocsItems,
        canvasItems,
        setCanvasItems,
        themes,
        setThemes,
        dataTables,
        setDataTables,
        templateAssets,
        setTemplateAssets,
        projects,
        setProjects,
        activeProjectId,
        setActiveProjectId,
        resourceOrders,
        setResourceOrders,
        sidebarTrees,
        setSidebarTrees,
        sidebarAssetsLoaded,
        setSidebarAssetsLoaded,
        projectTitle,
        setProjectTitle,
        projectCapabilities,
        projectSetupRequired,
        projectAccessDeniedReason,
        setProjectCapabilities,
        projectRuntimeStatus,
        setProjectRuntimeStatus,
        projectRuntimeStatusLoading,
        probeProjectRuntimeStatus,
        searchText,
        setSearchText,
        loadedSidebarTreeTabsRef,
        sidebarAssetsRequestedRef,
        loadData,
        loadProjects,
        loadProjectResources,
        startActiveProjectServer,
        stopProjectDevServer,
        switchProject,
        deleteProject,
        addProjectFromLocalPath,
        createBlankMakeProject,
        cloneMakeProject,
        copyMakeProject,
        reloadSidebarAssets,
        reloadDocsItems,
        reloadCanvasItems,
        getSidebarTabItems,
        loadSidebarTree,
        ensureSidebarTreeLoaded,
    };
}
