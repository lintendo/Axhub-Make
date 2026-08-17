import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CanvasItem, ItemData, SidebarTreeNode, SidebarTreeTab } from '../../types';
import type { SelectedResourceFolder, UploadedResourceFile } from '../../types/index-page.types';
import PromptActionButton from '../../components/PromptActionButton';
import { openDrawioResourceEditor } from '../../domains/drawio/drawioResourceEditor';
import { sidebarApi } from '../../services/sidebar.api';
import { requireProjectScope } from '../../services/projectScope';
import { hasExplicitLocalPath } from '../../utils/localPath';
import { removeDocsSidebarTreeItem, sanitizeSidebarTree } from '../../utils/sidebarTree';
import {
    getDocDisplayName,
    getDocFileName,
    findResourceItemByPathOrName,
    isProtectedDocItemName,
    isProtectedTemplateName,
    normalizeDocItem,
    normalizeTemplateItem,
    replaceDocNameInSelections,
    replaceSidebarItemTitle,
    replaceSidebarItemKey,
    resolveDocRenameBaseName,
    sortResourceItemsByOrder,
} from '../index-page.helpers';
import {
    buildDocReferencePromptDialog,
    buildLocalSiblingPath,
    buildTemplateReferencePromptDialog,
    checkDocReferencesRequest,
    checkTemplateReferencesRequest,
    ensureStringArray,
    getLocalBasePathForItem,
    getLocalPathForItem,
    getPrototypeBasePathForItem,
    getProjectRelativeResourcePathForItem,
    withResourceProject,
    withResourceProjectBody,
} from './resourceActions.helpers';

const EMPTY_EXCALIDRAW_RESOURCE_CONTENT = JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements: [],
    appState: {
        viewBackgroundColor: '#ffffff',
    },
    files: {},
}, null, 2);
const EMPTY_DRAWIO_RESOURCE_CONTENT = '<mxfile host="embed.diagrams.net"><diagram id="axhub-drawio-default" name="Page-1"><mxGraphModel dx="960" dy="540" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>\n';

function buildCreatedPlaceholderPrototypeItem(result: any): ItemData | null {
    const name = String(result?.name || result?.folderName || '').trim();
    if (!name) {
        return null;
    }
    const displayName = String(result?.displayName || result?.title || name).trim() || name;
    const clientUrl = String(result?.clientUrl || '').trim();
    const filePath = String(result?.filePath || '').trim();
    const absoluteFilePath = String(result?.absoluteFilePath || '').trim();
    const canvasFilePath = String(result?.canvasFilePath || '').trim();
    const absoluteCanvasFilePath = String(result?.absoluteCanvasFilePath || '').trim();

    return {
        name,
        displayName,
        jsUrl: '',
        specUrl: '',
        previewUrl: clientUrl,
        clientUrl: clientUrl || undefined,
        filePath: filePath || undefined,
        absoluteFilePath: absoluteFilePath || undefined,
        canvasFilePath: canvasFilePath || undefined,
        absoluteCanvasFilePath: absoluteCanvasFilePath || undefined,
        previewDisabled: !clientUrl,
        ...(result?.placeholder === true ? { placeholder: true } : {}),
        ...(result?.placeholderGuide ? { placeholderGuide: result.placeholderGuide } : {}),
    };
}

function normalizeResourceTreePath(value: unknown): string {
    const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const marker = 'src/resources/';
    if (normalized.startsWith(marker)) {
        return normalized.slice(marker.length);
    }
    const markerIndex = normalized.indexOf(`/${marker}`);
    if (markerIndex >= 0) {
        return normalized.slice(markerIndex + marker.length + 1);
    }
    return normalized;
}

function normalizeResourceTargetFolder(value: unknown): string {
    return normalizeResourceTreePath(value)
        .replace(/^resources\//u, '')
        .replace(/\/+/gu, '/')
        .replace(/^\/+|\/+$/gu, '');
}

function buildUniqueResourceFileName(items: ItemData[], targetFolder: string | null | undefined, baseName: string): string {
    const normalizedFolder = normalizeResourceTargetFolder(targetFolder);
    const normalizedBaseName = String(baseName || 'untitled').trim().replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'untitled';
    const dotIndex = normalizedBaseName.lastIndexOf('.');
    const stem = dotIndex > 0 ? normalizedBaseName.slice(0, dotIndex) : normalizedBaseName;
    const ext = dotIndex > 0 ? normalizedBaseName.slice(dotIndex) : '';
    const existingPaths = new Set(items
        .map((item) => normalizeResourceTreePath(item.filePath || item.resourceId || item.name))
        .filter(Boolean));
    const buildCandidate = (suffix = '') => (
        normalizedFolder ? `${normalizedFolder}/${stem}${suffix}${ext}` : `${stem}${suffix}${ext}`
    );
    let candidate = buildCandidate();
    let counter = 2;
    while (existingPaths.has(candidate)) {
        candidate = buildCandidate(`-${counter}`);
        counter += 1;
    }
    return candidate;
}

function getResourceItemPath(item: ItemData): string {
    return normalizeResourceTreePath(item.filePath || item.name || item.resourceId || '');
}

function toSelectedResourceFolder(folder: SidebarTreeNode, treeTab: SidebarTreeTab = 'docs'): SelectedResourceFolder {
    const folderPath = String(folder.folderPath || folder.path || '').trim();
    return {
        id: folder.id,
        title: folder.title,
        path: folderPath,
        folderPath,
        treeTab,
        children: Array.isArray(folder.children) ? folder.children : [],
    };
}

function findResourceFolder(
    nodes: SidebarTreeNode[],
    selected: SelectedResourceFolder | null,
): SidebarTreeNode | null {
    if (!selected) {
        return null;
    }
    for (const node of nodes) {
        if (node.kind === 'folder') {
            const nodePath = String(node.folderPath || node.path || '').trim();
            if (node.id === selected.id || (selected.path && nodePath === selected.path)) {
                return node;
            }
            const childMatch = findResourceFolder(node.children || [], selected);
            if (childMatch) {
                return childMatch;
            }
        }
    }
    return null;
}

function normalizeUploadedDocIdentifier(value: unknown): string {
    let normalized = String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/');

    if (!normalized) {
        return '';
    }

    const prefixes = [
        'api/docs/',
        'docs/',
        'src/resources/',
    ];
    for (const prefix of prefixes) {
        if (normalized.startsWith(prefix)) {
            normalized = normalized.slice(prefix.length);
            break;
        }
    }
    return normalized;
}

function buildUploadedDocCandidates(uploadedFile: UploadedResourceFile): Set<string> {
    const candidates = new Set<string>();
    for (const value of [uploadedFile.name, uploadedFile.path, uploadedFile.itemKey, uploadedFile.id]) {
        const normalized = normalizeUploadedDocIdentifier(value);
        if (normalized) {
            candidates.add(normalized);
        }
    }
    return candidates;
}

function findUploadedDocItem(items: ItemData[], uploadedFiles: UploadedResourceFile[]): ItemData | null {
    for (const uploadedFile of uploadedFiles) {
        const candidates = buildUploadedDocCandidates(uploadedFile);
        if (candidates.size === 0) {
            continue;
        }
        const matched = items.find((item) => (
            candidates.has(normalizeUploadedDocIdentifier(item.name))
            || candidates.has(normalizeUploadedDocIdentifier(item.resourceId))
            || candidates.has(normalizeUploadedDocIdentifier(item.filePath))
        ));
        if (matched) {
            return matched;
        }
    }
    return null;
}

export function useIndexPageResourceActions(params: any) {
    const {
        activeTab,
        activeProjectId,
        data,
        docsItems,
        canvasItems,
        themes,
        setThemes,
        dataTables,
        setDataTables,
        templateAssets,
        setTemplateAssets,
        resourceOrders,
        setResourceOrders,
        sidebarTrees,
        setSidebarTrees,
        projectTitle,
        setProjectTitle,
        messageApi,
        modal,
        appDialog,
        setActiveTab,
        setSelectedItem,
        setSidebarTab,
        setViewMode,
        setResourceSection,
        setPendingReturnTarget,
        loadData,
        loadProjects,
        reloadSidebarAssets,
        reloadDocsItems,
        reloadCanvasItems,
        getSidebarTabItems,
        loadSidebarTree,
        resourceStartDraftActive,
        themeStartDraftActive,
    } = params;

    const [defaultThemeName, setDefaultThemeName] = useState<string | null>(null);
    const [selectedDoc, setSelectedDoc] = useState<ItemData | null>(null);
    const [selectedResourceFolder, setSelectedResourceFolder] = useState<SelectedResourceFolder | null>(null);
    const selectedDocsResourceFolder = selectedResourceFolder?.treeTab === 'docs' ? selectedResourceFolder : null;
    const [selectedTemplate, setSelectedTemplate] = useState<ItemData | null>(null);
    const [selectedCanvas, setSelectedCanvas] = useState<CanvasItem | null>(null);
    const [selectedTheme, setSelectedTheme] = useState<any>(null);
    const [selectedDataTable, setSelectedDataTable] = useState<any>(null);
    const [themeCreateDialogVisible, setThemeCreateDialogVisible] = useState(false);
    const [versionDialogVisible, setVersionDialogVisible] = useState(false);
    const [currentVersionItem, setCurrentVersionItem] = useState<ItemData | null>(null);
    const [docReferencePromptDialog, setDocReferencePromptDialog] = useState<any>(null);

    const buildResourceUrl = useCallback((url: string) => (
        withResourceProject(url, activeProjectId)
    ), [activeProjectId]);

    const buildResourceBody = useCallback((body: Record<string, unknown>) => (
        withResourceProjectBody(body, activeProjectId)
    ), [activeProjectId]);

    useEffect(() => {
        setSelectedDoc((previous) => {
            if (resourceStartDraftActive) {
                return previous;
            }
            if (selectedDocsResourceFolder) {
                return previous && docsItems.some((item: ItemData) => item.name === previous.name) ? previous : null;
            }
            if (!previous) {
                return docsItems[0] || null;
            }
            if (previous.projectDocumentPath) {
                return previous;
            }
            return docsItems.find((item: ItemData) => item.name === previous.name) || docsItems[0] || null;
        });
    }, [docsItems, resourceStartDraftActive, selectedDocsResourceFolder]);

    useEffect(() => {
        setSelectedResourceFolder((previous) => {
            const treeTab = previous?.treeTab || 'docs';
            const latestFolder = findResourceFolder(sidebarTrees[treeTab] || [], previous);
            return latestFolder ? toSelectedResourceFolder(latestFolder, treeTab) : null;
        });
    }, [sidebarTrees]);

    useEffect(() => {
        setSelectedTemplate((previous) => {
            if (!previous) {
                return templateAssets[0] ? normalizeTemplateItem(templateAssets[0], activeProjectId) : null;
            }
            const matchedTemplate = templateAssets.find((item: any) => item.name === previous.name);
            return matchedTemplate
                ? normalizeTemplateItem(matchedTemplate, activeProjectId)
                : (templateAssets[0] ? normalizeTemplateItem(templateAssets[0], activeProjectId) : null);
        });
    }, [activeProjectId, templateAssets]);

    useEffect(() => {
        setSelectedCanvas((previous) => (
            previous && canvasItems.some((item: any) => item.name === previous.name)
                ? previous
                : (canvasItems[0] || null)
        ));
    }, [canvasItems]);

    useEffect(() => {
        setSelectedTheme((previous: any) => (
            themeStartDraftActive
                ? previous
                : previous && themes.some((item: any) => item.name === previous.name)
                ? previous
                : (themes[0] || null)
        ));
    }, [themeStartDraftActive, themes]);

    useEffect(() => {
        setSelectedDataTable((previous: any) => (
            previous && dataTables.some((item: any) => item.fileName === previous.fileName)
                ? previous
                : (dataTables[0] || null)
        ));
    }, [dataTables]);

    const checkDocReferences = useCallback(async (
        docName: string,
        action: 'rename' | 'delete',
        nextBaseName?: string,
    ) => {
        return checkDocReferencesRequest(docName, action, nextBaseName, activeProjectId);
    }, [activeProjectId]);

    const checkTemplateReferences = useCallback(async (
        templateName: string,
        action: 'rename' | 'delete',
        nextBaseName?: string,
    ) => {
        return checkTemplateReferencesRequest(templateName, action, nextBaseName, activeProjectId);
    }, [activeProjectId]);

    const openDocReferencePromptDialog = useCallback((dialogParams: {
        action: 'rename' | 'delete';
        item: ItemData;
        references: string[];
        nextBaseName?: string;
    }) => {
        setDocReferencePromptDialog(buildDocReferencePromptDialog(dialogParams));
    }, []);

    const openTemplateReferencePromptDialog = useCallback((dialogParams: {
        action: 'rename' | 'delete';
        item: any;
        references: string[];
        nextBaseName?: string;
    }) => {
        setDocReferencePromptDialog(buildTemplateReferencePromptDialog(dialogParams));
    }, []);

    const refreshSidebarAssets = useCallback(async () => {
        await reloadSidebarAssets();
    }, [reloadSidebarAssets]);

    const refreshDocsResources = useCallback(async () => {
        const nextDocs = await reloadDocsItems();
        if (typeof loadSidebarTree === 'function') {
            await loadSidebarTree('docs', { force: true, items: nextDocs });
        }
    }, [loadSidebarTree, reloadDocsItems]);

    const handleUploadedResourceFiles = useCallback(async (uploadedFiles: UploadedResourceFile[] = []) => {
        const nextDocs = await reloadDocsItems();
        if (typeof loadSidebarTree === 'function') {
            await loadSidebarTree('docs', { force: true, items: nextDocs });
        }
        const uploadedDoc = findUploadedDocItem(nextDocs, uploadedFiles);
        if (uploadedDoc) {
            setSidebarTab('document');
            setViewMode('demo');
            setSelectedResourceFolder(null);
            setSelectedDoc(uploadedDoc);
        }
    }, [loadSidebarTree, reloadDocsItems, setSidebarTab, setViewMode]);

    const findCreatedResourceDoc = useCallback((items: ItemData[], createdName: string): ItemData => {
        const normalizedCreatedName = normalizeResourceTreePath(createdName);
        const matchedDoc = items.find((doc) => (
            normalizeResourceTreePath(doc.filePath || doc.resourceId || doc.name) === normalizedCreatedName
            || normalizeResourceTreePath(doc.name) === normalizedCreatedName
        ));
        if (matchedDoc) {
            return matchedDoc;
        }
        return normalizeDocItem({
            name: createdName,
            path: `src/resources/${createdName}`,
        }, activeProjectId);
    }, [activeProjectId]);

    const handleCreateResourceCanvasFile = useCallback(async (targetFolder?: string | null) => {
        const createdName = buildUniqueResourceFileName(docsItems, targetFolder, 'untitled.excalidraw');
        const hide = messageApi.loading('正在创建画布...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(createdName)}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({ content: EMPTY_EXCALIDRAW_RESOURCE_CONTENT })),
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                throw new Error(payload?.error || '创建画布失败');
            }
            const nextDocs = await reloadDocsItems();
            if (typeof loadSidebarTree === 'function') {
                await loadSidebarTree('docs', { force: true, items: nextDocs });
            }
            const createdDoc = findCreatedResourceDoc(nextDocs, createdName);
            const createdCanvasFilePath = `src/resources/${createdName}`;
            const selectedCanvasDoc: ItemData = {
                ...createdDoc,
                openMode: 'canvas',
                resourceId: createdDoc.resourceId || createdName,
                ext: createdDoc.ext || '.excalidraw',
                filePath: createdDoc.filePath || createdCanvasFilePath,
                canvasFilePath: createdDoc.canvasFilePath || createdDoc.filePath || createdCanvasFilePath,
            };
            setSidebarTab('document');
            setViewMode('canvas');
            setSelectedResourceFolder(null);
            setSelectedDoc(selectedCanvasDoc);
            messageApi.success('画布已创建');
        } catch (error: any) {
            messageApi.error(error?.message || '创建画布失败');
        } finally {
            hide();
        }
    }, [
        activeProjectId,
        buildResourceBody,
        buildResourceUrl,
        docsItems,
        findCreatedResourceDoc,
        loadSidebarTree,
        messageApi,
        reloadDocsItems,
        setSidebarTab,
        setViewMode,
    ]);

    const handleCreateDrawioResourceFile = useCallback(async (targetFolder?: string | null) => {
        const createdName = buildUniqueResourceFileName(docsItems, targetFolder, 'untitled.drawio');
        const hide = messageApi.loading('正在创建 Drawio 图表...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(createdName)}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({ content: EMPTY_DRAWIO_RESOURCE_CONTENT })),
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                throw new Error(payload?.error || '创建 Drawio 图表失败');
            }
            const nextDocs = await reloadDocsItems();
            if (typeof loadSidebarTree === 'function') {
                await loadSidebarTree('docs', { force: true, items: nextDocs });
            }
            const createdDoc = {
                ...findCreatedResourceDoc(nextDocs, createdName),
                openMode: 'drawio' as const,
            };
            setSidebarTab('document');
            setViewMode('demo');
            setSelectedResourceFolder(null);
            setSelectedDoc(createdDoc);
            await openDrawioResourceEditor({
                resource: {
                    ...createdDoc,
                    projectId: requireProjectScope(activeProjectId).projectId,
                },
                kind: 'doc',
                messageApi,
                onSaved: reloadDocsItems,
            });
        } catch (error: any) {
            messageApi.error(error?.message || '创建 Drawio 图表失败');
        } finally {
            hide();
        }
    }, [
        buildResourceBody,
        buildResourceUrl,
        docsItems,
        findCreatedResourceDoc,
        loadSidebarTree,
        messageApi,
        reloadDocsItems,
        setSidebarTab,
        setViewMode,
    ]);

    const handleSelectResourceFolder = useCallback((
        folder: SidebarTreeNode,
        treeTab: SidebarTreeTab = 'docs',
        options: { preserveViewMode?: boolean } = {},
    ) => {
        if (folder.kind !== 'folder') {
            return;
        }
        if (treeTab === 'docs') {
            setSidebarTab('document');
            setSelectedDoc(null);
        } else if (treeTab === 'canvas') {
            setSidebarTab('canvas');
        } else if (treeTab === 'themes') {
            setSidebarTab('assets');
            setResourceSection('themes');
        }
        if (treeTab === 'docs' && !options.preserveViewMode) {
            setViewMode('demo');
        }
        setSelectedResourceFolder(toSelectedResourceFolder(folder, treeTab));
    }, [setResourceSection, setSidebarTab, setViewMode]);

    const handleOpenResourceFolderInSystem = useCallback(async (folderPath: string) => {
        const normalizedPath = String(folderPath || '').trim();
        if (!normalizedPath) {
            messageApi.warning('当前文件夹没有可打开的本地路径');
            return;
        }
        try {
            await sidebarApi.openResourceInSystem(normalizedPath, requireProjectScope(activeProjectId), 'docs', 'folder');
            messageApi.success('已打开目录');
        } catch (error: any) {
            messageApi.error(error?.message || '打开目录失败');
        }
    }, [activeProjectId, messageApi]);

    const setSelectedDocAndClearFolder = useCallback<React.Dispatch<React.SetStateAction<ItemData | null>>>((nextValue) => {
        setSelectedResourceFolder(null);
        setSelectedDoc(nextValue);
    }, []);

    const handleCreateDialogUploadSuccess = useCallback(async (result?: any) => {
        await Promise.all([loadData(), reloadSidebarAssets(), refreshDocsResources()]);
        const createdFromResult = buildCreatedPlaceholderPrototypeItem(result);
        if (!createdFromResult) {
            return;
        }
        const items = getSidebarTabItems?.('prototypes') || data?.prototypes || [];
        const refreshedCreated = items.find((item: any) => item.name === createdFromResult.name);
        const created = refreshedCreated || createdFromResult;
        setSelectedItem(created);
        setSidebarTab('prototype');
        setActiveTab('prototypes');
        setViewMode('demo');
    }, [data?.prototypes, getSidebarTabItems, loadData, refreshDocsResources, reloadSidebarAssets, setActiveTab, setSelectedItem, setSidebarTab, setViewMode]);

    const clearThemeCreateDialogState = useCallback(() => {
        setThemeCreateDialogVisible(false);
    }, []);

    const handleThemeCreateCancel = useCallback(() => {
        clearThemeCreateDialogState();
    }, [clearThemeCreateDialogState]);

    const handleSetDefaultTheme = useCallback(async (themeName: string) => {
        const nextValue = defaultThemeName === themeName ? null : themeName;
        setDefaultThemeName(nextValue);
        try {
            const currentConfigResponse = await fetch(buildResourceUrl('/api/config'));
            const currentConfig = currentConfigResponse.ok ? await currentConfigResponse.json() : {};
            const config = {
                ...currentConfig,
                projectDefaults: {
                    ...(currentConfig.projectDefaults || {}),
                    defaultTheme: nextValue,
                },
            };
            const response = await fetch(buildResourceUrl('/api/config'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || '设置默认设计失败');
            }
            const syncResponse = await fetch(buildResourceUrl('/api/themes/sync-design'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ themeName: nextValue || '' }),
            });
            if (!syncResponse.ok) {
                const payload = await syncResponse.json().catch(() => ({}));
                throw new Error(payload?.error || '同步默认设计失败');
            }
            messageApi.success(nextValue ? '已设为默认设计' : '已取消默认设计');
        } catch (error: any) {
            setDefaultThemeName(defaultThemeName);
            messageApi.error(error?.message || '设置默认设计失败');
        }
    }, [buildResourceUrl, defaultThemeName, messageApi]);

    const handleReorderThemes = useCallback(async (orderedNames: string[]) => {
        const nextOrder = ensureStringArray(orderedNames);
        setThemes((previous: any[]) => sortResourceItemsByOrder(previous, nextOrder, (item: any) => item.name));
        setResourceOrders((previous: any) => ({ ...previous, themes: nextOrder }));
        try {
            await sidebarApi.saveResourceOrder('themes', nextOrder, requireProjectScope(activeProjectId));
        } catch (error: any) {
            messageApi.error(error?.message || '保存主题排序失败');
        }
    }, [activeProjectId, messageApi, setResourceOrders, setThemes]);

    const handleReorderDataTables = useCallback(async (orderedFileNames: string[]) => {
        const nextOrder = ensureStringArray(orderedFileNames);
        setDataTables((previous: any[]) => sortResourceItemsByOrder(previous, nextOrder, (item: any) => item.fileName));
        setResourceOrders((previous: any) => ({ ...previous, data: nextOrder }));
        try {
            await sidebarApi.saveResourceOrder('data', nextOrder, requireProjectScope(activeProjectId));
        } catch (error: any) {
            messageApi.error(error?.message || '保存数据表排序失败');
        }
    }, [activeProjectId, messageApi, setDataTables, setResourceOrders]);

    const handleReorderTemplates = useCallback(async (orderedNames: string[]) => {
        const nextOrder = ensureStringArray(orderedNames);
        setTemplateAssets((previous: any[]) => sortResourceItemsByOrder(previous, nextOrder, (item: any) => item.name));
        setResourceOrders((previous: any) => ({ ...previous, templates: nextOrder }));
        try {
            await sidebarApi.saveResourceOrder('templates', nextOrder, requireProjectScope(activeProjectId));
        } catch (error: any) {
            messageApi.error(error?.message || '保存模板排序失败');
        }
    }, [activeProjectId, messageApi, setResourceOrders, setTemplateAssets]);

    const handleDownloadZipByPath = useCallback(async (targetPath: string, fallbackFileName: string) => {
        const hide = messageApi.loading('正在导出 ZIP...', 0);
        try {
            const baseUrl = buildResourceUrl(`/api/zip?path=${encodeURIComponent(targetPath)}`);
            const probeResponse = await fetch(`${baseUrl}&probe=1`);
            if (!probeResponse.ok) {
                const payload = await probeResponse.json().catch(() => ({} as any));
                throw new Error(payload?.error || `导出失败（${probeResponse.status}）`);
            }
            const a = document.createElement('a');
            a.href = `${baseUrl}&download=1&_ts=${Date.now()}`;
            a.download = fallbackFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            messageApi.success('已开始下载 ZIP');
        } catch (error: any) {
            messageApi.error(error?.message || 'ZIP 导出失败');
        } finally {
            hide();
        }
    }, [buildResourceUrl, messageApi]);

    const handleDownloadThemeZip = useCallback((item: any) => {
        if (!hasExplicitLocalPath(item)) {
            messageApi.warning('当前资源未声明本地文件路径，无法导出源码');
            return;
        }
        void handleDownloadZipByPath(getLocalBasePathForItem(item), `${item.name}.zip`);
    }, [handleDownloadZipByPath, messageApi]);

    const handleRenameThemeResource = useCallback(async (item: any, nextName?: string) => {
        const nextNameInput = typeof nextName === 'string'
            ? nextName
            : await appDialog.prompt({
                title: '重命名主题',
                description: '请输入新的主题名称。',
                label: '主题名称',
                defaultValue: item.displayName || item.name,
                confirmText: '确认重命名',
                cancelText: '取消',
                validate: (value: string) => String(value || '').trim() ? null : '主题名称不能为空',
            });
        if (nextNameInput == null) return;
        const trimmedName = String(nextNameInput || '').trim();
        if (!trimmedName || trimmedName === (item.displayName || item.name)) return;
        const hide = messageApi.loading('正在重命名主题...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/themes/${encodeURIComponent(item.name)}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: trimmedName }),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error((payload as any)?.error || '主题重命名失败');
            }
            setThemes((previous: any[]) => previous.map((theme) => (
                theme.name === item.name ? { ...theme, displayName: trimmedName } : theme
            )));
            setSelectedTheme((previous: any) => (
                previous?.name === item.name ? { ...previous, displayName: trimmedName } : previous
            ));
            messageApi.success('主题重命名成功');
        } catch (error: any) {
            messageApi.error(error?.message || '主题重命名失败');
        } finally {
            hide();
        }
    }, [appDialog, buildResourceUrl, messageApi, setThemes]);

    const handleDeleteThemeResource = useCallback(async (item: any) => {
        const confirmed = await appDialog.confirm({
            title: `删除主题「${item.displayName || item.name}」？`,
            description: '删除后无法恢复，请确认是否继续。',
            confirmText: '确认删除',
            cancelText: '取消',
            tone: 'destructive',
            dismissible: false,
        });
        if (!confirmed) return;
        const hide = messageApi.loading('正在删除主题...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/themes/${encodeURIComponent(item.name)}`), {
                method: 'DELETE',
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error((payload as any)?.error || '删除失败');
            }
            setThemes((previous: any[]) => previous.filter((theme) => theme.name !== item.name));
            setSelectedTheme((previous: any) => (previous?.name === item.name ? null : previous));
            const nextOrder = resourceOrders.themes.filter((name: string) => name !== item.name);
            setResourceOrders((previous: any) => ({ ...previous, themes: nextOrder }));
            void sidebarApi.saveResourceOrder('themes', nextOrder, requireProjectScope(activeProjectId)).catch(() => undefined);
            messageApi.success('主题删除成功');
        } catch (error: any) {
            messageApi.error(error?.message || '主题删除失败');
        } finally {
            hide();
        }
    }, [activeProjectId, appDialog, buildResourceUrl, messageApi, resourceOrders.themes, setResourceOrders, setThemes]);

    const handleRenameDataTableResource = useCallback(async (item: any, nextName?: string) => {
        const nextNameInput = typeof nextName === 'string'
            ? nextName
            : await appDialog.prompt({
                title: '重命名数据表',
                description: '请输入新的数据表名称。',
                label: '数据表名称',
                defaultValue: item.tableName,
                confirmText: '确认重命名',
                cancelText: '取消',
                validate: (value: string) => String(value || '').trim() ? null : '数据表名称不能为空',
            });
        if (nextNameInput == null) return;
        const trimmedName = String(nextNameInput || '').trim();
        if (!trimmedName || trimmedName === item.tableName) return;
        const hide = messageApi.loading('正在重命名数据表...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/data/tables/${encodeURIComponent(item.fileName)}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tableName: trimmedName }),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error((payload as any)?.error || '重命名失败');
            }
            setDataTables((previous: any[]) => previous.map((table) => (
                table.fileName === item.fileName ? { ...table, tableName: trimmedName } : table
            )));
            setSelectedDataTable((previous: any) => (
                previous?.fileName === item.fileName ? { ...previous, tableName: trimmedName } : previous
            ));
            messageApi.success('数据表重命名成功');
        } catch (error: any) {
            messageApi.error(error?.message || '数据表重命名失败');
        } finally {
            hide();
        }
    }, [appDialog, buildResourceUrl, messageApi, setDataTables]);

    const handleDeleteDataTableResource = useCallback(async (item: any) => {
        const confirmed = await appDialog.confirm({
            title: `删除数据表「${item.tableName}」？`,
            description: '删除后无法恢复，请确认是否继续。',
            confirmText: '确认删除',
            cancelText: '取消',
            tone: 'destructive',
            dismissible: false,
        });
        if (!confirmed) return;
        const hide = messageApi.loading('正在删除数据表...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/data/tables/${encodeURIComponent(item.fileName)}`), {
                method: 'DELETE',
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error((payload as any)?.error || '删除失败');
            }
            setDataTables((previous: any[]) => previous.filter((table) => table.fileName !== item.fileName));
            setSelectedDataTable((previous: any) => (previous?.fileName === item.fileName ? null : previous));
            const nextOrder = resourceOrders.data.filter((name: string) => name !== item.fileName);
            setResourceOrders((previous: any) => ({ ...previous, data: nextOrder }));
            void sidebarApi.saveResourceOrder('data', nextOrder, requireProjectScope(activeProjectId)).catch(() => undefined);
            messageApi.success('数据表删除成功');
        } catch (error: any) {
            messageApi.error(error?.message || '数据表删除失败');
        } finally {
            hide();
        }
    }, [activeProjectId, appDialog, buildResourceUrl, messageApi, resourceOrders.data, setDataTables, setResourceOrders]);

    const handleRenameTemplateResource = useCallback(async (item: any, nextNameOverride?: string) => {
        const currentName = item.name;
        const dotIndex = currentName.lastIndexOf('.');
        const currentExt = dotIndex > 0 ? currentName.slice(dotIndex) : '';
        const currentBaseName = resolveDocRenameBaseName(currentName, currentExt);
        let nextBaseName = typeof nextNameOverride === 'string' ? nextNameOverride : '';
        if (!nextBaseName) {
            const nextNameInput = await appDialog.prompt({
                title: '重命名模板',
                description: '请输入新的模板文件名。',
                label: '模板文件名',
                defaultValue: currentBaseName,
                confirmText: '确认重命名',
                cancelText: '取消',
                validate: (value: string) => String(value || '').trim() ? null : '模板文件名不能为空',
            });
            if (nextNameInput == null) return;
            nextBaseName = nextNameInput;
        }
        const hide = messageApi.loading('正在重命名模板...', 0);
        try {
            if (isProtectedTemplateName(currentName)) {
                throw new Error('系统模板不支持重命名');
            }
            let trimmedName = String(nextBaseName || '').trim();
            if (!trimmedName) {
                throw new Error('模板文件名不能为空');
            }
            if (currentExt && trimmedName.toLowerCase().endsWith(currentExt.toLowerCase())) {
                trimmedName = trimmedName.slice(0, -currentExt.length).trim();
            }
            trimmedName = resolveDocRenameBaseName(trimmedName);
            if (!trimmedName || trimmedName === currentBaseName) {
                return;
            }
            const checkResult = await checkTemplateReferences(currentName, 'rename', trimmedName);
            if (checkResult.protected || isProtectedTemplateName(currentName)) {
                throw new Error(checkResult.error || '系统模板不支持重命名');
            }
            if (checkResult.references.length > 0) {
                openTemplateReferencePromptDialog({
                    action: 'rename',
                    item,
                    references: checkResult.references,
                    nextBaseName: trimmedName,
                });
                return;
            }
            const response = await fetch(buildResourceUrl(`/api/docs/templates/${encodeURIComponent(currentName)}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({ newBaseName: trimmedName })),
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                if (payload.code === 'PROTECTED_TEMPLATE') {
                    throw new Error(payload.error || '系统模板不支持重命名');
                }
                if (payload.code === 'TEMPLATE_REFERENCED' && Array.isArray(payload.references) && payload.references.length > 0) {
                    openTemplateReferencePromptDialog({
                        action: 'rename',
                        item,
                        references: payload.references,
                        nextBaseName: trimmedName,
                    });
                    return;
                }
                throw new Error(payload.error || '重命名失败');
            }
            const renamedName = typeof payload?.name === 'string' ? payload.name : `${trimmedName}${currentExt}`;
            const renamedPath = String(payload?.path || '').trim() || undefined;
            const renamedAbsoluteFilePath = String(payload?.absoluteFilePath || '').trim() || undefined;
            const renamedTemplate = normalizeTemplateItem({
                name: renamedName,
                path: renamedPath,
                absoluteFilePath: renamedAbsoluteFilePath,
            }, activeProjectId);
            setSelectedTemplate((previous) => previous?.name === currentName ? renamedTemplate : previous);
            setTemplateAssets((previous: any[]) => previous.map((template) => (
                template.name === currentName
                    ? {
                        ...template,
                        name: renamedName,
                        displayName: renamedTemplate.displayName,
                        path: renamedTemplate.filePath || template.path,
                        absoluteFilePath: renamedTemplate.absoluteFilePath || template.absoluteFilePath,
                    }
                    : template
            )));
            setResourceOrders((previous: any) => {
                const nextOrder = replaceDocNameInSelections(previous.templates, currentName, renamedName);
                void sidebarApi.saveResourceOrder('templates', nextOrder, requireProjectScope(activeProjectId)).catch(() => undefined);
                return { ...previous, templates: nextOrder };
            });
            messageApi.success('模板重命名成功');
        } catch (error: any) {
            messageApi.error(error?.message || '模板重命名失败');
        } finally {
            hide();
        }
    }, [
        activeProjectId,
        appDialog,
        buildResourceBody,
        buildResourceUrl,
        checkTemplateReferences,
        messageApi,
        openTemplateReferencePromptDialog,
        setResourceOrders,
        setTemplateAssets,
    ]);

    const handleDuplicateTemplateResource = useCallback(async (item: any) => {
        const hide = messageApi.loading('正在创建模板副本...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/docs/templates/${encodeURIComponent(item.name)}/copy`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({})),
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                throw new Error(payload.error || '创建副本失败');
            }
            await reloadSidebarAssets();
            const duplicatedName = String(payload?.name || '').trim();
            if (duplicatedName) {
                setSelectedTemplate(normalizeTemplateItem({
                    name: duplicatedName,
                    path: String(payload?.path || '').trim() || undefined,
                    absoluteFilePath: String(payload?.absoluteFilePath || '').trim() || undefined,
                }, activeProjectId));
                setResourceOrders((previous: any) => {
                    const nextOrder = previous.templates.includes(duplicatedName)
                        ? previous.templates
                        : [duplicatedName, ...previous.templates];
                    void sidebarApi.saveResourceOrder('templates', nextOrder, requireProjectScope(activeProjectId)).catch(() => undefined);
                    return { ...previous, templates: nextOrder };
                });
            }
            messageApi.success('模板副本创建成功');
        } catch (error: any) {
            messageApi.error(error?.message || '创建模板副本失败');
        } finally {
            hide();
        }
    }, [activeProjectId, buildResourceBody, buildResourceUrl, messageApi, reloadSidebarAssets, setResourceOrders]);

    const handleDeleteTemplateResource = useCallback(async (item: any) => {
        const hideChecking = messageApi.loading('正在检查模板引用...', 0);
        try {
            const checkResult = await checkTemplateReferences(item.name, 'delete');
            if (checkResult.protected || isProtectedTemplateName(item.name)) {
                messageApi.error(checkResult.error || '系统模板不支持删除');
                return;
            }
            if (checkResult.references.length > 0) {
                openTemplateReferencePromptDialog({
                    action: 'delete',
                    item,
                    references: checkResult.references,
                });
                return;
            }
        } catch (error: any) {
            messageApi.error(error?.message || '检查模板引用失败');
            return;
        } finally {
            hideChecking();
        }
        const confirmed = await appDialog.confirm({
            title: `删除模板「${item.displayName}」？`,
            description: '删除后无法恢复，请确认是否继续。',
            confirmText: '确认删除',
            cancelText: '取消',
            tone: 'destructive',
            dismissible: false,
        });
        if (!confirmed) return;
        const hide = messageApi.loading('正在删除模板...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/docs/templates/${encodeURIComponent(item.name)}`), {
                method: 'DELETE',
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                if (payload.code === 'PROTECTED_TEMPLATE') {
                    throw new Error(payload.error || '系统模板不支持删除');
                }
                if (payload.code === 'TEMPLATE_REFERENCED' && Array.isArray(payload.references) && payload.references.length > 0) {
                    openTemplateReferencePromptDialog({
                        action: 'delete',
                        item,
                        references: payload.references,
                    });
                    return;
                }
                throw new Error(payload.error || '删除失败');
            }
            setTemplateAssets((previous: any[]) => previous.filter((template) => template.name !== item.name));
            setSelectedTemplate((previous) => previous?.name === item.name ? null : previous);
            const nextOrder = resourceOrders.templates.filter((name: string) => name !== item.name);
            setResourceOrders((previous: any) => ({ ...previous, templates: nextOrder }));
            void sidebarApi.saveResourceOrder('templates', nextOrder, requireProjectScope(activeProjectId)).catch(() => undefined);
            messageApi.success('模板删除成功');
        } catch (error: any) {
            messageApi.error(error?.message || '模板删除失败');
        } finally {
            hide();
        }
    }, [
        appDialog,
        buildResourceUrl,
        checkTemplateReferences,
        messageApi,
        openTemplateReferencePromptDialog,
        resourceOrders.templates,
        setResourceOrders,
        setTemplateAssets,
    ]);

    const handleCopyTemplatePath = useCallback(async (item: any) => {
        try {
            const localPath = getLocalPathForItem(item);
            if (!localPath) {
                messageApi.warning('当前资源未声明本地文件路径，无法复制路径');
                return;
            }
            await navigator.clipboard.writeText(localPath);
            messageApi.success('路径已复制');
        } catch {
            messageApi.error('复制失败');
        }
    }, [messageApi]);

    const handleTemplateVersionManagement = useCallback((item: any) => {
        setCurrentVersionItem(normalizeTemplateItem(item, activeProjectId));
        setVersionDialogVisible(true);
    }, [activeProjectId]);

    const handleDownloadItemSource = useCallback((item: ItemData) => {
        const localBasePath = getPrototypeBasePathForItem(item);
        if (!localBasePath) {
            messageApi.warning('当前资源未声明本地文件路径，无法导出源码');
            return;
        }
        void handleDownloadZipByPath(localBasePath, `${item.name}.zip`);
    }, [handleDownloadZipByPath, messageApi]);

    const handleRenameItem = useCallback(async (item: ItemData, nextNameOverride?: string) => {
        const localBasePath = getPrototypeBasePathForItem(item);
        if (!localBasePath) {
            messageApi.warning('当前资源未声明本地文件路径，无法重命名');
            return;
        }
        let nextName = typeof nextNameOverride === 'string' ? nextNameOverride : '';
        if (!nextName) {
            const nextNameInput = await appDialog.prompt({
                title: '重命名原型',
                description: '请输入新的显示名称。',
                label: '显示名称',
                defaultValue: item.displayName,
                confirmText: '确认重命名',
                cancelText: '取消',
                validate: (value: string) => String(value || '').trim() ? null : '名称不能为空',
            });
            if (nextNameInput == null) return;
            nextName = nextNameInput;
        }
        const trimmedName = String(nextName || '').trim();
        if (!trimmedName || trimmedName === item.displayName) return;
        const hide = messageApi.loading('正在重命名...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/prototypes/${encodeURIComponent(item.name)}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({ displayName: trimmedName })),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error((payload as any).error || '重命名失败');
            }
            const itemKey = `prototypes/${item.name}`;
            const { nextTree, changed } = replaceSidebarItemTitle(sidebarTrees.prototypes || [], itemKey, trimmedName);
            if (changed) {
                const optimisticPrototypes = data.prototypes.map((prototype: ItemData) => (
                    prototype.name === item.name
                        ? { ...prototype, displayName: trimmedName }
                        : prototype
                ));
                const normalizedTree = sanitizeSidebarTree('prototypes', nextTree, optimisticPrototypes);
                setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({
                    ...previous,
                    prototypes: normalizedTree,
                }));
                try {
                    await sidebarApi.saveSidebarTree('prototypes', normalizedTree, requireProjectScope(activeProjectId));
                } catch {
                    messageApi.warning('原型已重命名，但侧边栏名称保存失败，刷新后可能需要重新命名');
                }
            }
            setSelectedItem((previous: ItemData | null) => (
                previous?.name === item.name
                    ? { ...previous, displayName: trimmedName }
                    : previous
            ));
            messageApi.success('原型重命名成功');
            await loadData();
            if (typeof loadSidebarTree === 'function') {
                await loadSidebarTree('prototypes', { force: true });
            }
        } catch (error: any) {
            messageApi.error(error?.message || '重命名失败');
        } finally {
            hide();
        }
    }, [appDialog, buildResourceBody, buildResourceUrl, data.prototypes, loadData, loadSidebarTree, messageApi, setSelectedItem, setSidebarTrees, sidebarTrees.prototypes]);

    const handleDuplicateItem = useCallback(async (item: ItemData) => {
        const localBasePath = getPrototypeBasePathForItem(item);
        if (!localBasePath) {
            messageApi.warning('当前资源未声明本地文件路径，无法创建副本');
            return;
        }
        const existingNames = data.prototypes.map((entry: ItemData) => entry.name);
        const generateDuplicateName = (baseName: string) => {
            let newName = `${baseName}-copy`;
            let counter = 1;
            while (existingNames.includes(newName)) {
                counter += 1;
                newName = `${baseName}-copy${counter}`;
            }
            return newName;
        };
        const hide = messageApi.loading('正在创建副本...', 0);
        try {
            const newName = generateDuplicateName(item.name);
            const response = await fetch(buildResourceUrl('/api/copy'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({
                    sourcePath: localBasePath,
                    targetPath: buildLocalSiblingPath(localBasePath, newName),
                })),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error((payload as any).error || '创建副本失败');
            }
            messageApi.success(`副本 "${newName}" 创建成功`);
            await loadData();
        } catch (error: any) {
            messageApi.error(error?.message || '创建副本失败');
        } finally {
            hide();
        }
    }, [buildResourceBody, buildResourceUrl, data.prototypes, loadData, messageApi]);

    const handleDeleteItem = useCallback(async (
        item: ItemData,
        preferredPromptClient?: any,
        preferredIDE?: any,
        ideAvailabilityOverride?: any,
    ) => {
        const localBasePath = getPrototypeBasePathForItem(item);
        if (!localBasePath) {
            messageApi.warning('当前资源未声明本地文件路径，无法删除');
            return;
        }
        const itemType = 'prototypes';
        const itemTypeLabel = '原型';
        const deleteTargetLabel = item.displayName || item.name;

        const performDelete = async () => {
            const hide = messageApi.loading('正在删除...', 0);
            try {
                const response = await fetch(buildResourceUrl('/api/delete'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildResourceBody({ path: localBasePath })),
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error((payload as any).error || '删除失败');
                }
                setSelectedItem(null);
                await loadData();
                messageApi.success('删除成功');
            } catch (error: any) {
                messageApi.error(error?.message || '删除失败');
                throw error;
            } finally {
                hide();
            }
        };

        const hide = messageApi.loading('正在检查引用...', 0);
        try {
            const checkResponse = await fetch(buildResourceUrl('/api/items/check-references'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({ itemType, itemName: item.name })),
            });
            const checkPayload = checkResponse.ok ? await checkResponse.json().catch(() => null) : null;
            const references = ensureStringArray(checkPayload?.references);
            const deleteTargetList = [`- ${deleteTargetLabel}`].join('\n');

            if (references.length > 0) {
                const referenceList = references.map((reference) => `- ${reference}`).join('\n');
                const prompt = [
                    `我希望删除${itemTypeLabel} "${item.displayName}" (${item.name})。`,
                    '本次将删除以下目录：',
                    deleteTargetList,
                    '',
                    `已检测到以下文件引用了本次待删除的${itemTypeLabel}：`,
                    referenceList,
                    '',
                    '请帮我执行以下检查和操作：',
                    '1. 核对上述引用是否准确，并补充遗漏的引用文件（优先检查项目元数据中的 prototypes 与 docs）。',
                    '2. 如果确认继续删除，请协助我将这些引用替换为合适的实现，并更新引用路径，使这些原型不再依赖上述目录。',
                    '3. 完成上述解耦操作后，再彻底删除以上目录。',
                ].join('\n');

                modal.confirm({
                    title: `检测到${itemTypeLabel}引用`,
                    width: 720,
                    okText: '关闭',
                    cancelText: '取消',
                    content: (
                        <div>
                            <div style={{ marginBottom: 8 }}>本次将删除以下目录：</div>
                            <pre style={{ maxHeight: 160, overflow: 'auto', background: 'hsl(var(--muted))', padding: 12, borderRadius: 6 }}>
                                {deleteTargetList}
                            </pre>
                            <div style={{ marginTop: 12, marginBottom: 8 }}>
                                已检测到以下文件引用了本次待删除的{itemTypeLabel}：
                            </div>
                            <pre style={{ maxHeight: 260, overflow: 'auto', background: 'hsl(var(--muted))', padding: 12, borderRadius: 6 }}>
                                {referenceList}
                            </pre>
                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <PromptActionButton
                                    type="primary"
                                    preferredClient={preferredPromptClient ?? null}
                                    preferredIDE={preferredIDE ?? null}
                                    ideAvailability={ideAvailabilityOverride}
                                    getIdeTargetPath={() => localBasePath}
                                    scene={`delete-ref-fix-${itemType}`}
                                    buildPrompt={() => prompt}
                                    copySuccessMessage="已复制处理提示，请返回编辑器让 AI 处理。"
                                    executeSuccessMessage="已打开新会话"
                                    fallbackMessage="自动执行失败，已回退为复制 Prompt"
                                />
                            </div>
                        </div>
                    ),
                });
                return;
            }
        } catch (error: any) {
            messageApi.error(error?.message || '检查引用失败');
            return;
        } finally {
            hide();
        }

        modal.confirm({
            title: `确定要删除${itemTypeLabel} "${item.displayName}" 吗？`,
            content: '未检测到引用文件。删除后无法恢复，请谨慎操作。',
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: performDelete,
        });
    }, [activeTab, buildResourceBody, buildResourceUrl, loadData, messageApi, modal, setSelectedItem]);

    const handleRenameDocItem = useCallback(async (item: ItemData, nextName: string) => {
        const currentName = item.name;
        const currentResourcePath = getResourceItemPath(item);
        const dotIndex = currentName.lastIndexOf('.');
        const currentExt = dotIndex > 0 ? currentName.slice(dotIndex) : '';
        const currentBaseName = resolveDocRenameBaseName(currentName, currentExt);
        const hide = messageApi.loading('正在重命名...', 0);
        try {
            let trimmedName = String(nextName || '').trim();
            if (!trimmedName) {
                throw new Error('资源名称不能为空');
            }
            if (currentExt && trimmedName.toLowerCase().endsWith(currentExt.toLowerCase())) {
                trimmedName = trimmedName.slice(0, -currentExt.length).trim();
            }
            trimmedName = resolveDocRenameBaseName(trimmedName);
            if (!trimmedName || trimmedName === currentBaseName) {
                return;
            }
            const checkResult = await checkDocReferences(currentName, 'rename', trimmedName);
            if (checkResult.protected || isProtectedDocItemName(currentName)) {
                throw new Error(checkResult.error || '项目总览入口资源禁止改名，可继续编辑内容');
            }
            if (checkResult.references.length > 0) {
                openDocReferencePromptDialog({
                    action: 'rename',
                    item,
                    references: checkResult.references,
                    nextBaseName: trimmedName,
                });
                return;
            }
            const response = await fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({ newBaseName: trimmedName })),
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                if (payload.code === 'PROTECTED_DOC') {
                    throw new Error(payload.error || '项目总览入口资源禁止改名，可继续编辑内容');
                }
                if (payload.code === 'DOC_REFERENCED' && Array.isArray(payload.references) && payload.references.length > 0) {
                    openDocReferencePromptDialog({
                        action: 'rename',
                        item,
                        references: payload.references,
                        nextBaseName: trimmedName,
                    });
                    return;
                }
                throw new Error(payload.error || '重命名失败');
            }
            const renamedDocName = typeof payload?.name === 'string' ? payload.name : `${trimmedName}${currentExt}`;
            const renamedPath = String(payload?.path || '').trim() || undefined;
            const renamedResourcePath = renamedPath || renamedDocName;
            const renamedDisplayName = getDocDisplayName(getDocFileName(renamedDocName)) || renamedDocName;
            const renamedAbsoluteFilePath = String(payload?.absoluteFilePath || '').trim() || undefined;
            const optimisticDocs = (() => {
                let replaced = false;
                const mapped = docsItems.map((doc: ItemData) => {
                    if (doc.name !== currentName && doc.filePath !== currentResourcePath) return doc;
                    replaced = true;
                    return {
                        ...doc,
                        name: renamedDocName,
                        displayName: renamedDisplayName,
                        filePath: renamedPath,
                        absoluteFilePath: renamedAbsoluteFilePath || doc.absoluteFilePath,
                    };
                });
                if (!replaced) {
                    mapped.push(normalizeDocItem({
                        name: renamedDocName,
                        path: renamedPath,
                        absoluteFilePath: renamedAbsoluteFilePath,
                    }, activeProjectId));
                }
                return mapped;
            })();
            const oldItemKey = `docs/${currentResourcePath}`;
            const newItemKey = `docs/${renamedResourcePath}`;
            const { nextTree: remappedTree, replaced } = replaceSidebarItemKey(
                sidebarTrees.docs,
                oldItemKey,
                newItemKey,
                renamedDisplayName,
            );
            if (replaced) {
                const normalizedTree = sanitizeSidebarTree('docs', remappedTree, optimisticDocs);
                setSidebarTrees((previous: any) => ({ ...previous, docs: normalizedTree }));
                try {
                    await sidebarApi.saveSidebarTree('docs', normalizedTree, requireProjectScope(activeProjectId));
                } catch {
                }
            }
            const nextDocs = await reloadDocsItems();
            const renamedDoc = findResourceItemByPathOrName(nextDocs, renamedResourcePath, renamedDocName);
            setSelectedDoc(renamedDoc || nextDocs[0] || null);
            messageApi.success('重命名成功');
        } catch (error: any) {
            messageApi.error(error?.message || '重命名失败');
        } finally {
            hide();
        }
    }, [
        buildResourceBody,
        buildResourceUrl,
        checkDocReferences,
        docsItems,
        messageApi,
        openDocReferencePromptDialog,
        reloadDocsItems,
        setSidebarTrees,
        sidebarTrees.docs,
    ]);

    const handleDuplicateDocItem = useCallback(async (item: ItemData) => {
        const currentResourcePath = getResourceItemPath(item);
        const hide = messageApi.loading('正在创建副本...', 0);
        try {
            const response = await fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}/copy`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildResourceBody({})),
            });
            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                throw new Error(payload.error || '创建副本失败');
            }
            const nextDocs = await reloadDocsItems();
            const duplicatedPath = String(payload?.path || '').trim();
            const duplicated = nextDocs.find((doc) => doc.filePath === duplicatedPath || doc.name === payload?.name);
            if (duplicated) {
                setSelectedDoc(duplicated);
            }
            messageApi.success('资源副本创建成功');
        } catch (error: any) {
            messageApi.error(error?.message || '创建副本失败');
        } finally {
            hide();
        }
    }, [buildResourceBody, buildResourceUrl, messageApi, reloadDocsItems]);

    const handleDeleteDocItem = useCallback(async (item: ItemData) => {
        const currentResourcePath = getResourceItemPath(item);
        const hideChecking = messageApi.loading('正在检查引用...', 0);
        try {
            const checkResult = await checkDocReferences(item.name, 'delete');
            if (checkResult.protected || isProtectedDocItemName(item.name)) {
                messageApi.error(checkResult.error || '项目总览入口资源禁止删除');
                return;
            }
            if (checkResult.references.length > 0) {
                openDocReferencePromptDialog({
                    action: 'delete',
                    item,
                    references: checkResult.references,
                });
                return;
            }
        } catch (error: any) {
            messageApi.error(error?.message || '检查资源引用失败');
            return;
        } finally {
            hideChecking();
        }
        modal.confirm({
            title: `确定要删除资源 "${item.displayName}" 吗？`,
            content: '删除后无法恢复，请谨慎操作。',
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                const hide = messageApi.loading('正在删除...', 0);
                try {
                    const response = await fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}`), { method: 'DELETE' });
                    const payload = await response.json().catch(() => ({} as any));
                    if (!response.ok) {
                        if (payload.code === 'PROTECTED_DOC') {
                            throw new Error(payload.error || '项目总览入口资源禁止删除');
                        }
                        if (payload.code === 'DOC_REFERENCED' && Array.isArray(payload.references) && payload.references.length > 0) {
                            openDocReferencePromptDialog({
                                action: 'delete',
                                item,
                                references: payload.references,
                            });
                            return;
                        }
                        throw new Error(payload.error || '删除失败');
                    }
                    const nextDocs = await reloadDocsItems();
                    setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({
                        ...previous,
                        docs: removeDocsSidebarTreeItem(
                            sanitizeSidebarTree('docs', previous.docs || [], nextDocs),
                            currentResourcePath,
                        ),
                    }));
                    if (typeof loadSidebarTree === 'function') {
                        await loadSidebarTree('docs', { force: true, items: nextDocs });
                        setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({
                            ...previous,
                            docs: removeDocsSidebarTreeItem(previous.docs || [], currentResourcePath),
                        }));
                    }
                    setSelectedDoc((previous) => {
                        if (previous && previous.name !== item.name) {
                            return nextDocs.find((doc) => doc.name === previous.name) || nextDocs[0] || null;
                        }
                        return nextDocs[0] || null;
                    });
                    messageApi.success('删除成功');
                } catch (error: any) {
                    messageApi.error(error?.message || '删除失败');
                } finally {
                    hide();
                }
            },
        });
    }, [buildResourceUrl, checkDocReferences, loadSidebarTree, messageApi, modal, openDocReferencePromptDialog, reloadDocsItems, setSidebarTrees]);

    const handleCopyDocPath = useCallback(async (item: ItemData) => {
        try {
            const localPath = getProjectRelativeResourcePathForItem(item);
            if (!localPath) {
                messageApi.warning('当前资源未声明本地文件路径，无法复制路径');
                return;
            }
            await navigator.clipboard.writeText(localPath);
            messageApi.success('路径已复制');
        } catch {
            messageApi.error('复制失败');
        }
    }, [messageApi]);

    const handleDocVersionManagement = useCallback((item: ItemData) => {
        setCurrentVersionItem(item);
        setVersionDialogVisible(true);
    }, []);

    const handleImportThemeResource = useCallback(() => {
        setSidebarTab('assets');
        setResourceSection('themes');
        setThemeCreateDialogVisible(true);
    }, [setResourceSection, setSidebarTab]);

    const handleCreatePlaceholderPrototype = useCallback(async () => {
        try {
            const response = await fetch(buildResourceUrl('/api/prototypes/create-placeholder'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error((payload as any)?.error || '创建原型失败');
            }
            const result = await response.json();
            const createdName = String(result?.name || '').trim();
            if (createdName && typeof setPendingReturnTarget === 'function') {
                setPendingReturnTarget({
                    sidebarTab: 'prototype',
                    resourceId: createdName,
                    pageId: null,
                    viewMode: 'demo',
                });
            }
            await loadData();
            // Select the newly created prototype and show its Admin-owned empty guide.
            const items = getSidebarTabItems?.('prototypes') || data?.prototypes || [];
            const createdFromResult = buildCreatedPlaceholderPrototypeItem(result);
            const refreshedCreated = items.find((item: any) => item.name === result.name);
            const created = refreshedCreated?.placeholder === true
                ? refreshedCreated
                : createdFromResult;
            if (created) {
                setSelectedItem(created);
                setSidebarTab('prototype');
                setActiveTab('prototypes');
                setViewMode('demo');
            }
        } catch (error: any) {
            messageApi.error(error?.message || '创建原型失败');
        }
    }, [buildResourceUrl, messageApi, loadData, data, getSidebarTabItems, setSelectedItem, setSidebarTab, setActiveTab, setPendingReturnTarget, setViewMode]);

    const handleCreateFolder = useCallback(async (tab: SidebarTreeTab) => {
        try {
            const response = await sidebarApi.createSidebarFolder(tab, requireProjectScope(activeProjectId));
            const items = getSidebarTabItems(tab);
            const nextTree = sanitizeSidebarTree(tab, Array.isArray(response.tree) ? response.tree : [], items);
            setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, [tab]: nextTree }));
            return { createdFolderId: response.createdFolderId };
        } catch (error: any) {
            messageApi.error(error?.message || '新建文件夹失败');
            return null;
        }
    }, [activeProjectId, getSidebarTabItems, messageApi, setSidebarTrees]);

    const prepareImageAiResourceFolder = useCallback(async (folderPath: string) => {
        try {
            const response = await sidebarApi.ensureSidebarFolder(folderPath, requireProjectScope(activeProjectId));
            const items = getSidebarTabItems('docs');
            const nextTree = sanitizeSidebarTree('docs', Array.isArray(response.tree) ? response.tree : [], items);
            setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, docs: nextTree }));
            handleSelectResourceFolder(response.folder, 'docs');
            return {
                folder: toSelectedResourceFolder(response.folder, 'docs'),
                absolutePath: response.absolutePath,
            };
        } catch (error: any) {
            messageApi.error(error?.message || '准备图片保存文件夹失败');
            return null;
        }
    }, [activeProjectId, getSidebarTabItems, handleSelectResourceFolder, messageApi, setSidebarTrees]);

    const handleSidebarTreeChange = useCallback((tab: SidebarTreeTab, nextTree: SidebarTreeNode[]) => {
        const items = getSidebarTabItems(tab);
        const normalizedTree = sanitizeSidebarTree(tab, nextTree, items);
        setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, [tab]: normalizedTree }));
    }, [getSidebarTabItems, setSidebarTrees]);

    const handleSidebarTreePersist = useCallback(async (tab: SidebarTreeTab, nextTree: SidebarTreeNode[]) => {
        const items = getSidebarTabItems(tab);
        const normalizedTree = sanitizeSidebarTree(tab, nextTree, items);
        setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, [tab]: normalizedTree }));
        try {
            const response = await sidebarApi.saveSidebarTree(tab, normalizedTree, requireProjectScope(activeProjectId));
            const latestItems = tab === 'docs'
                ? await reloadDocsItems()
                : getSidebarTabItems(tab);
            const persistedTree = sanitizeSidebarTree(tab, Array.isArray(response.tree) ? response.tree : [], latestItems);
            setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, [tab]: persistedTree }));
        } catch (error: any) {
            messageApi.error(error?.message || '保存侧栏结构失败');
            try {
                const response = await sidebarApi.getSidebarTree(tab, requireProjectScope(activeProjectId));
                const latestItems = getSidebarTabItems(tab);
                const serverTree = sanitizeSidebarTree(tab, Array.isArray(response.tree) ? response.tree : [], latestItems);
                setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, [tab]: serverTree }));
            } catch {
            }
        }
    }, [activeProjectId, getSidebarTabItems, messageApi, reloadDocsItems, setSidebarTrees]);

    const handleVersionManagement = useCallback((item: ItemData) => {
        const localBasePath = getPrototypeBasePathForItem(item);
        if (!localBasePath) {
            messageApi.warning('当前资源未声明本地文件路径，无法查看版本');
            return;
        }
        setCurrentVersionItem({ ...item, filePath: localBasePath });
        setVersionDialogVisible(true);
    }, [messageApi]);

    const handleCopyItemPath = useCallback(async (item: ItemData) => {
        try {
            const localPath = getPrototypeBasePathForItem(item);
            if (!localPath) {
                messageApi.warning('当前资源未声明本地文件路径，无法复制路径');
                return;
            }
            await navigator.clipboard.writeText(localPath);
            messageApi.success('路径已复制');
        } catch {
            messageApi.error('复制路径失败');
        }
    }, [messageApi]);

    const orderedThemes = useMemo(
        () => sortResourceItemsByOrder(themes, resourceOrders.themes, (item: any) => item.name),
        [resourceOrders.themes, themes],
    );
    const orderedDataTables = useMemo(
        () => sortResourceItemsByOrder(dataTables, resourceOrders.data, (item: any) => item.fileName),
        [dataTables, resourceOrders.data],
    );
    const orderedTemplates = useMemo(
        () => sortResourceItemsByOrder(templateAssets, resourceOrders.templates, (item: any) => item.name),
        [resourceOrders.templates, templateAssets],
    );

    return {
        defaultThemeName,
        setDefaultThemeName,
        selectedDoc,
        setSelectedDoc: setSelectedDocAndClearFolder,
        selectedResourceFolder,
        setSelectedResourceFolder,
        handleSelectResourceFolder,
        handleOpenResourceFolderInSystem,
        selectedTemplate,
        setSelectedTemplate,
        selectedCanvas,
        handleSelectCanvas: setSelectedCanvas,
        selectedTheme,
        setSelectedTheme,
        selectedDataTable,
        setSelectedDataTable,
        themeCreateDialogVisible,
        setThemeCreateDialogVisible,
        versionDialogVisible,
        setVersionDialogVisible,
        currentVersionItem,
        setCurrentVersionItem,
        docReferencePromptDialog,
        setDocReferencePromptDialog,
        themes: orderedThemes,
        dataTables: orderedDataTables,
        templateAssets: orderedTemplates,
        clearThemeCreateDialogState,
        handleThemeCreateCancel,
        refreshSidebarAssets,
        refreshDocsResources,
        handleCreateDialogUploadSuccess,
        handleReorderThemes,
        handleReorderDataTables,
        handleReorderTemplates,
        handleSetDefaultTheme,
        handleRenameThemeResource,
        handleDownloadThemeZip,
        handleDeleteThemeResource,
        handleRenameDataTableResource,
        handleDeleteDataTableResource,
        handleRenameTemplateResource,
        handleDuplicateTemplateResource,
        handleDeleteTemplateResource,
        handleCopyTemplatePath,
        handleTemplateVersionManagement,
        handleDownloadItemSource,
        handleRenameItem,
        handleDuplicateItem,
        handleDeleteItem,
        handleRenameDocItem,
        handleDuplicateDocItem,
        handleDeleteDocItem,
        handleCopyDocPath,
        handleDocVersionManagement,
        handleImportThemeResource,
        handleUploadedResourceFiles,
        handleCreateResourceCanvasFile,
        handleCreateDrawioResourceFile,
        handleCreatePlaceholderPrototype,
        handleCreateFolder,
        prepareImageAiResourceFolder,
        handleProjectTitleChange: async (title: string) => {
            const nextTitle = title.trim();
            const previousTitle = projectTitle;
            setProjectTitle(nextTitle);
            try {
                await sidebarApi.updateProjectTitle(nextTitle, requireProjectScope(activeProjectId));
                await Promise.resolve(loadProjects?.());
            } catch (error: any) {
                setProjectTitle(previousTitle);
                messageApi.error(error?.message || '项目标题保存失败');
            }
        },
        handleSidebarTreeChange,
        handleSidebarTreePersist,
        handleVersionManagement,
        handleCopyTemplatePrompt: async () => {
            if (!selectedTemplate) {
                messageApi.warning('请先选择一个模板');
                return;
            }
            await handleCopyTemplatePath(selectedTemplate);
        },
        handleCopyItemPath,
    };
}
