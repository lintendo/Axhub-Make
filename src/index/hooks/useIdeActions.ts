import { useCallback } from 'react';
import type { IDEAvailabilityMap, MainIDEPreference } from '../../common/ide';
import { resolveVisibleIDEPreference } from '../../common/ide';
import type { ItemData } from '../types';
import type { DataTableResourceItem, ThemeResourceItem } from '../types/index-page.types';
import { openConfiguredIDEBeforeAction } from '../utils/ideAutomation';
import { normalizeMarkdownResourceName } from '../utils/markdownResourcePath';
import { buildObsidianOpenUrl } from '../utils/obsidian';
import { getExplicitLocalPath, stripIndexFilePath } from '../utils/localPath';
import { requireProjectScope, withProjectScope } from '../services/projectScope';

type MarkdownResourceKind = 'doc' | 'template';

interface MarkdownResourceSelection {
    kind: MarkdownResourceKind;
    item: ItemData | null;
    label: string;
}

interface MessageApi {
    success: (content: string) => void;
    error: (content: string) => void;
    warning: (content: string) => void;
    info: (content: string) => void;
    loading: (content: string, duration?: number) => () => void;
}

interface UseIdeActionsOptions {
    messageApi: MessageApi;
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    activeProjectId: string | null;
    selectedItem: ItemData | null;
    currentMarkdownResource: MarkdownResourceSelection;
    selectedTheme: ThemeResourceItem | null;
    selectedDataTable: DataTableResourceItem | null;
}

function stripMarkdownExtension(value: string): string {
    return String(value || '').trim().replace(/\.[^./\\]+$/u, '');
}

function isEventLike(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as {
        preventDefault?: unknown;
        stopPropagation?: unknown;
        nativeEvent?: unknown;
    };

    return typeof candidate.preventDefault === 'function'
        || typeof candidate.stopPropagation === 'function'
        || 'nativeEvent' in candidate;
}

function resolveExplicitItemFilePath(item: ItemData | null | undefined): string {
    return getExplicitLocalPath(item);
}

function resolveExplicitItemBasePath(item: ItemData | null | undefined): string {
    return stripIndexFilePath(resolveExplicitItemFilePath(item));
}

function resolveExplicitResourcePath(item: unknown): string {
    return getExplicitLocalPath(item);
}

function resolveResourceProjectId(item: unknown): string {
    if (!item || typeof item !== 'object') {
        return '';
    }
    const raw = item as { projectId?: unknown };
    return typeof raw.projectId === 'string' ? raw.projectId.trim() : '';
}

export function useIdeActions({
    messageApi,
    preferredIDE,
    ideAvailability,
    activeProjectId,
    selectedItem,
    currentMarkdownResource,
    selectedTheme,
    selectedDataTable,
}: UseIdeActionsOptions) {
    const openDeeplinkUrl = useCallback((url: string) => {
        try {
            const opened = window.open(url, '_blank', 'noopener,noreferrer');
            if (opened) {
                return true;
            }

            window.location.href = url;
            return true;
        } catch {
            return false;
        }
    }, []);

    const resolveMarkdownAbsoluteFilePath = useCallback(async (
        item: ItemData,
        kind: MarkdownResourceKind,
        projectId: string | null | undefined,
    ): Promise<string> => {
        const currentAbsoluteFilePath = String((item as ItemData & { absoluteFilePath?: string }).absoluteFilePath || '').trim();
        if (currentAbsoluteFilePath) {
            return currentAbsoluteFilePath;
        }

        try {
            const endpoint = kind === 'template' ? '/api/docs/templates' : '/api/docs';
            const response = await fetch(withProjectScope(endpoint, requireProjectScope(projectId)));
            if (!response.ok) {
                return '';
            }

            const payload = await response.json().catch(() => []);
            if (!Array.isArray(payload)) {
                return '';
            }

            const targetName = String(item.name || '').trim();
            const normalizedTargetName = normalizeMarkdownResourceName(kind, targetName);
            const normalizedTargetFilePath = normalizeMarkdownResourceName(kind, String(item.filePath || '').trim());
            const normalizedTargetDisplayName = stripMarkdownExtension(String(item.displayName || '').trim());
            const targetCandidates = new Set(
                [
                    targetName,
                    normalizedTargetName,
                    normalizedTargetFilePath,
                    stripMarkdownExtension(targetName),
                    stripMarkdownExtension(normalizedTargetName),
                    normalizedTargetDisplayName,
                ]
                    .map((candidate) => String(candidate || '').trim())
                    .filter(Boolean),
            );

            const matchedItem = payload.find((candidate) => {
                const candidateName = String(candidate?.name || '').trim();
                const normalizedCandidateName = normalizeMarkdownResourceName(kind, candidateName);
                const candidateDisplayName = stripMarkdownExtension(String(candidate?.displayName || '').trim());
                return [
                    candidateName,
                    normalizedCandidateName,
                    stripMarkdownExtension(candidateName),
                    candidateDisplayName,
                ].some((candidateValue) => targetCandidates.has(String(candidateValue || '').trim()));
            });

            if (!matchedItem) {
                console.warn('[Obsidian] absolute path lookup missed', {
                    kind,
                    targetName,
                    normalizedTargetName,
                    normalizedTargetFilePath,
                    normalizedTargetDisplayName,
                });
            }
            return String(matchedItem?.absoluteFilePath || '').trim();
        } catch {
            return '';
        }
    }, []);

    const openFileInIDE = useCallback(async ({
        filePath,
        copyText,
        projectId,
        emptySelectionMessage,
    }: {
        filePath?: string;
        copyText?: string;
        projectId?: string;
        emptySelectionMessage: string;
    }) => {
        const targetPath = (filePath || '').trim();
        if (!targetPath) {
            messageApi.warning(emptySelectionMessage);
            return;
        }

        const hide = messageApi.loading('正在打开 IDE...', 0);
        let copySucceeded = false;

        try {
            if (copyText && navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(copyText);
                    copySucceeded = true;
                } catch (error) {
                    console.warn('Failed to copy IDE helper text:', error);
                }
            }

            const openedByIDECommand = await openConfiguredIDEBeforeAction({
                preferredIDE: resolveVisibleIDEPreference(preferredIDE, ideAvailability),
                projectId: requireProjectScope(projectId?.trim() || activeProjectId).projectId,
                targetPath,
            });

            if (!openedByIDECommand) {
                return;
            }

            messageApi.success(copySucceeded
                ? '已在编辑器中打开，并复制了文件标题，可前往编辑'
                : '已在编辑器中打开，可前往编辑');
        } catch (error: any) {
            messageApi.error(error?.message || '打开失败');
        } finally {
            hide();
        }
    }, [activeProjectId, ideAvailability, messageApi, preferredIDE]);

    const handleOpenIdeFile = useCallback(async () => {
        let filePath = '';
        let copyText = '';
        if (selectedItem) {
            const itemBasePath = resolveExplicitItemBasePath(selectedItem);
            if (!itemBasePath) {
                await openFileInIDE({
                    emptySelectionMessage: '当前资源未声明本地文件路径，无法在 IDE 中打开',
                });
                return;
            }
            filePath = resolveExplicitItemFilePath(selectedItem) || `${itemBasePath}/index.tsx`;
            copyText = `[${selectedItem.displayName}](${itemBasePath})`;
            if (!filePath) {
                await openFileInIDE({
                    emptySelectionMessage: '当前资源未声明本地文件路径，无法在 IDE 中打开',
                });
                return;
            }
        } else {
            await openFileInIDE({
                emptySelectionMessage: '请先选择条目',
            });
            return;
        }
        await openFileInIDE({
            filePath,
            copyText,
            projectId: selectedItem.projectId,
            emptySelectionMessage: '请先选择条目',
        });
    }, [openFileInIDE, selectedItem]);

    const handleOpenSelectedDocInIDE = useCallback(async (itemOverride?: ItemData | null, kindOverride?: MarkdownResourceKind) => {
        const effectiveKind = kindOverride ?? currentMarkdownResource.kind;
        const effectiveItem = isEventLike(itemOverride) ? currentMarkdownResource.item : (itemOverride ?? currentMarkdownResource.item);
        const effectiveLabel = effectiveKind === 'template' ? '模板' : '资源';
        if (!effectiveItem) {
            messageApi.warning(`请先选择${effectiveLabel}`);
            return;
        }

        const filePath = resolveExplicitResourcePath(effectiveItem);
        if (!filePath) {
            await openFileInIDE({
                emptySelectionMessage: '当前资源未声明本地文件路径，无法在 IDE 中打开',
            });
            return;
        }
        const copyText = `[${effectiveItem.displayName || effectiveItem.name}](${filePath})`;
        await openFileInIDE({
            filePath,
            copyText,
            projectId: resolveResourceProjectId(effectiveItem),
            emptySelectionMessage: `请先选择${effectiveLabel}`,
        });
    }, [currentMarkdownResource.item, currentMarkdownResource.kind, messageApi, openFileInIDE]);

    const handleOpenSelectedDocInObsidian = useCallback(async (itemOverride?: ItemData | null, kindOverride?: MarkdownResourceKind) => {
        const effectiveKind = kindOverride ?? currentMarkdownResource.kind;
        const effectiveItem = isEventLike(itemOverride) ? currentMarkdownResource.item : (itemOverride ?? currentMarkdownResource.item);
        const effectiveLabel = effectiveKind === 'template' ? '模板' : '资源';

        if (!effectiveItem) {
            messageApi.warning(`请先选择${effectiveLabel}`);
            return;
        }

        const absoluteFilePath = await resolveMarkdownAbsoluteFilePath(
            effectiveItem,
            effectiveKind,
            resolveResourceProjectId(effectiveItem) || activeProjectId,
        );
        const deeplinkUrl = buildObsidianOpenUrl(absoluteFilePath);
        if (!deeplinkUrl) {
            messageApi.warning(`当前${effectiveLabel}缺少绝对路径，无法在 Obsidian 中打开`);
            return;
        }

        if (!openDeeplinkUrl(deeplinkUrl)) {
            messageApi.error(`无法在 Obsidian 中打开${effectiveLabel}`);
        }
    }, [activeProjectId, currentMarkdownResource.item, currentMarkdownResource.kind, messageApi, openDeeplinkUrl, resolveMarkdownAbsoluteFilePath]);

    const handleOpenSelectedThemeInIDE = useCallback(async (themeOverride?: ThemeResourceItem | null) => {
        const targetTheme = isEventLike(themeOverride) ? selectedTheme : (themeOverride ?? selectedTheme);
        if (!targetTheme) {
            messageApi.warning('请先选择设计');
            return;
        }

        const themeBasePath = resolveExplicitResourcePath(targetTheme);
        if (!themeBasePath) {
            await openFileInIDE({
                emptySelectionMessage: '当前资源未声明本地文件路径，无法在 IDE 中打开',
            });
            return;
        }
        const filePath = targetTheme.hasIndexTsx === false
            ? `${themeBasePath}/designToken.json`
            : `${themeBasePath}/index.tsx`;
        const copyText = `[${targetTheme.displayName}](${themeBasePath})`;
        await openFileInIDE({
            filePath,
            copyText,
            projectId: targetTheme.projectId,
            emptySelectionMessage: '请先选择设计',
        });
    }, [messageApi, openFileInIDE, selectedTheme]);

    const handleOpenSelectedThemeDocInIDE = useCallback(async (themeOverride?: ThemeResourceItem | null) => {
        const targetTheme = isEventLike(themeOverride) ? selectedTheme : (themeOverride ?? selectedTheme);
        if (!targetTheme) {
            messageApi.warning('请先选择设计');
            return;
        }
        if (!targetTheme.hasDoc) {
            messageApi.warning('当前设计暂无规范资源');
            return;
        }

        const themeBasePath = resolveExplicitResourcePath(targetTheme);
        if (!themeBasePath) {
            await openFileInIDE({
                emptySelectionMessage: '当前资源未声明本地文件路径，无法在 IDE 中打开',
            });
            return;
        }
        const filePath = `${themeBasePath}/README.md`;
        const copyText = `[${targetTheme.displayName} 规范资源](${filePath})`;
        await openFileInIDE({
            filePath,
            copyText,
            projectId: targetTheme.projectId,
            emptySelectionMessage: '请先选择设计',
        });
    }, [messageApi, openFileInIDE, selectedTheme]);

    const handleOpenSelectedDataTableInIDE = useCallback(async (tableOverride?: DataTableResourceItem | null) => {
        const targetTable = isEventLike(tableOverride) ? selectedDataTable : (tableOverride ?? selectedDataTable);
        if (!targetTable) {
            messageApi.warning('请先选择数据表');
            return;
        }

        const filePath = resolveExplicitResourcePath(targetTable);
        if (!filePath) {
            await openFileInIDE({
                emptySelectionMessage: '当前资源未声明本地文件路径，无法在 IDE 中打开',
            });
            return;
        }
        const copyText = `[${targetTable.tableName}](${filePath})`;
        await openFileInIDE({
            filePath,
            copyText,
            projectId: resolveResourceProjectId(targetTable),
            emptySelectionMessage: '请先选择数据表',
        });
    }, [messageApi, openFileInIDE, selectedDataTable]);

    const handleOpenProjectInIDE = useCallback(async (
        ideOverride?: MainIDEPreference,
        targetPath?: string,
        projectIdOverride?: string,
    ): Promise<boolean> => {
        return openConfiguredIDEBeforeAction({
            preferredIDE: ideOverride || preferredIDE,
            projectId: requireProjectScope(projectIdOverride?.trim() || activeProjectId).projectId,
            targetPath: targetPath?.trim() || undefined,
        });
    }, [activeProjectId, preferredIDE]);

    const handleCopyItemPath = useCallback(async (item: ItemData) => {
        let copyText = '';

        const itemBasePath = resolveExplicitItemBasePath(item);

        if (!itemBasePath) {
            messageApi.warning('当前资源未声明本地文件路径，无法复制路径');
            return;
        }
        copyText = `[${item.displayName}](${itemBasePath})`;

        if (!copyText) {
            messageApi.warning('无法获取路径');
            return;
        }

        try {
            await navigator.clipboard.writeText(copyText);
            messageApi.success('路径已复制');
        } catch (error) {
            console.error('Failed to copy: ', error);
            messageApi.error('复制失败');
        }
    }, [messageApi]);

    return {
        openFileInIDE,
        handleOpenIdeFile,
        handleOpenSelectedDocInIDE,
        handleOpenSelectedDocInObsidian,
        handleOpenSelectedThemeInIDE,
        handleOpenSelectedThemeDocInIDE,
        handleOpenSelectedDataTableInIDE,
        handleOpenProjectInIDE,
        handleCopyItemPath,
    };
}

export type IdeActions = ReturnType<typeof useIdeActions>;
