import type { SidebarTreeNode, SidebarTreeTab } from '../types';
import type { ProjectScope } from './projectScope';
import { withProjectScope } from './projectScope';

const WORKSPACE_API_ROUTES = {
    project: '/api/workspace/project',
    navigation: '/api/workspace/navigation',
    navigationFolders: '/api/workspace/navigation/folders',
    openResourceInSystem: '/api/workspace/resources/open-system',
    resourcesOrder: '/api/workspace/resources/order',
} as const;

interface SidebarTreeResponse {
    tab: SidebarTreeTab;
    version: number;
    tree: SidebarTreeNode[];
}

interface UpdateProjectTitleResponse {
    success: boolean;
    title: string;
}

interface SaveSidebarTreeResponse extends SidebarTreeResponse {
    success: boolean;
}

interface CreateSidebarFolderResponse extends SidebarTreeResponse {
    success: boolean;
    createdFolderId: string;
}

interface EnsureSidebarFolderResponse extends SidebarTreeResponse {
    success: boolean;
    folder: SidebarTreeNode;
    absolutePath: string;
    created: boolean;
}

interface OpenResourceInSystemResponse {
    success: boolean;
    type?: 'docs' | 'themes';
    path: string;
    kind: 'file' | 'directory';
}

type ResourceOrderType = 'themes' | 'data' | 'templates';

interface ResourceOrderResponse {
    type: ResourceOrderType;
    version: number;
    order: string[];
}

interface SaveResourceOrderResponse extends ResourceOrderResponse {
    success: boolean;
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any)?.error || fallbackMessage);
    }
    return response.json() as Promise<T>;
}

export const sidebarApi = {
    async getProjectTitle(scope: ProjectScope): Promise<string> {
        const response = await fetch(withProjectScope(WORKSPACE_API_ROUTES.project, scope));
        const data = await parseJsonResponse<{ title?: string }>(response, '加载项目标题失败');
        return typeof data.title === 'string' ? data.title.trim() : '';
    },

    async updateProjectTitle(title: string, scope: ProjectScope): Promise<UpdateProjectTitleResponse> {
        const response = await fetch(withProjectScope(WORKSPACE_API_ROUTES.project, scope), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        });
        return parseJsonResponse<UpdateProjectTitleResponse>(response, '保存项目标题失败');
    },

    async getSidebarTree(tab: SidebarTreeTab, scope: ProjectScope): Promise<SidebarTreeResponse> {
        const response = await fetch(withProjectScope(`${WORKSPACE_API_ROUTES.navigation}?tab=${encodeURIComponent(tab)}`, scope));
        return parseJsonResponse<SidebarTreeResponse>(response, '加载侧边栏树失败');
    },

    async saveSidebarTree(tab: SidebarTreeTab, tree: SidebarTreeNode[], scope: ProjectScope): Promise<SaveSidebarTreeResponse> {
        const response = await fetch(withProjectScope(`${WORKSPACE_API_ROUTES.navigation}?tab=${encodeURIComponent(tab)}`, scope), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tree }),
        });
        return parseJsonResponse<SaveSidebarTreeResponse>(response, '保存侧边栏树失败');
    },

    async createSidebarFolder(tab: SidebarTreeTab, scope: ProjectScope): Promise<CreateSidebarFolderResponse> {
        const response = await fetch(withProjectScope(`${WORKSPACE_API_ROUTES.navigationFolders}?tab=${encodeURIComponent(tab)}`, scope), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        return parseJsonResponse<CreateSidebarFolderResponse>(response, '新建文件夹失败');
    },

    async ensureSidebarFolder(folderPath: string, scope: ProjectScope): Promise<EnsureSidebarFolderResponse> {
        const response = await fetch(withProjectScope(`${WORKSPACE_API_ROUTES.navigationFolders}?tab=docs`, scope), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath }),
        });
        return parseJsonResponse<EnsureSidebarFolderResponse>(response, '准备图片保存文件夹失败');
    },

    async openResourceInSystem(
        resourcePath: string,
        scope: ProjectScope,
        type: 'docs' | 'themes' = 'docs',
        kind?: 'file' | 'folder',
    ): Promise<OpenResourceInSystemResponse> {
        const response = await fetch(withProjectScope(WORKSPACE_API_ROUTES.openResourceInSystem, scope), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: resourcePath,
                ...(type !== 'docs' ? { type } : {}),
                ...(kind ? { kind } : {}),
            }),
        });
        return parseJsonResponse<OpenResourceInSystemResponse>(response, '打开本地文件系统失败');
    },

    async getResourceOrder(type: ResourceOrderType, scope: ProjectScope): Promise<ResourceOrderResponse> {
        const response = await fetch(withProjectScope(`${WORKSPACE_API_ROUTES.resourcesOrder}?type=${encodeURIComponent(type)}`, scope));
        return parseJsonResponse<ResourceOrderResponse>(response, '加载资源排序失败');
    },

    async saveResourceOrder(type: ResourceOrderType, order: string[], scope: ProjectScope): Promise<SaveResourceOrderResponse> {
        const response = await fetch(withProjectScope(`${WORKSPACE_API_ROUTES.resourcesOrder}?type=${encodeURIComponent(type)}`, scope), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order }),
        });
        return parseJsonResponse<SaveResourceOrderResponse>(response, '保存资源排序失败');
    },
};
