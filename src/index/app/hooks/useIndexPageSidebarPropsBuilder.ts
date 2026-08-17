import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type { RuntimeAgentAvailability } from '../../../common/agent';
import type { AcpProvider } from '@/common/assistant-context/types';
import type { SettingsDialogInitialTab } from '../../components/SettingsDialog';
import type { ItemData, TabType, ViewMode } from '../../types';
import type {
    CreateDialogTab,
    AiPanelMode,
    NewSidebarGroupedProps,
    PromptExecutionMeta,
    ResourceSection,
    SidebarTab,
} from '../../types/index-page.types';
import type { LocalExportCapabilities, ResourceWriteCapabilities } from '../../services/projectResources';
import type { MakeSurfaceCapabilities } from '../makeSurface';

interface UseIndexPageSidebarPropsBuilderParams {
    state: {
        collapsed: boolean;
        loading: boolean;
        sidebarTab: SidebarTab;
        viewMode: ViewMode;
        data: any;
        docsItems: any[];
        canvasItems: any[];
        themes: any[];
        defaultThemeName?: string | null;
        searchText: string;
        selectedItem: ItemData | null;
        selectedPrototypePageId?: string | null;
        resourceSection: ResourceSection;
        projectTitle: string;
        activeProjectId: string | null;
        projectSetupRequired?: boolean;
        makeClientUpdateAvailable?: boolean;
        makeClientUpdateReminderVisible?: boolean;
        projects: any[];
        resourceWriteCapabilities: ResourceWriteCapabilities;
        localExportCapabilities: LocalExportCapabilities;
        lanAccessAllowed?: boolean;
        isDarkMode: boolean;
        sidebarTrees: any;
        webAgentPanelOpen?: boolean;
        aiPanelMode?: AiPanelMode;
        surfaceCapabilities?: MakeSurfaceCapabilities;
        selectedDoc: ItemData | null;
        selectedResourceFolder?: any;
        selectedCanvas: any;
        selectedTheme: any;
        prototypeStartDraftActive?: boolean;
        resourceStartDraftActive?: boolean;
        themeStartDraftActive?: boolean;
        prototypeStartPageActive?: boolean;
    };
    deps: {
        preferredPromptClient: any;
        preferredIDE: MainIDEPreference;
        ideAvailability?: IDEAvailabilityMap;
        agentAvailability?: RuntimeAgentAvailability;
        setPreferredIDE: (ide: MainIDEPreference) => void;
        setIsDarkMode: (dark: boolean) => void;
        openSettingsDialog: (tab?: SettingsDialogInitialTab) => void;
        setVersionCollaborationDrawerOpen: Dispatch<SetStateAction<boolean>>;
        setActiveTab: Dispatch<SetStateAction<TabType>>;
        setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
        setViewMode: Dispatch<SetStateAction<ViewMode>>;
        setResourceSection: Dispatch<SetStateAction<ResourceSection>>;
        setSearchText: (text: string) => void;
        switchProject: (projectId: string) => void | Promise<void>;
        deleteProject: (projectId: string) => void | Promise<void>;
        stopProjectDevServer: (projectId: string) => void | Promise<void>;
        addProjectFromLocalPath: (root: string) => boolean | void | Promise<boolean | void>;
        createBlankMakeProject: (params: {
            parentRoot: string;
            folderName: string;
            projectName?: string;
        }) => Promise<unknown>;
        cloneMakeProject: (params: {
            parentRoot: string;
            folderName: string;
            projectName?: string;
            gitUrl: string;
        }) => Promise<unknown>;
        copyMakeProject: (params: {
            parentRoot: string;
            folderName: string;
            projectName?: string;
        }) => Promise<unknown>;
        loadProjects: () => void | Promise<void>;
        setCreateDialogVisible: Dispatch<SetStateAction<boolean>>;
        setInitialCreateDialogTab: Dispatch<SetStateAction<CreateDialogTab>>;
        handleTabChange: (tab: TabType) => void;
        handleMenuClick: (params: { key: string; pageId?: string | null }) => void | Promise<void>;
        setSelectedPrototypePageId?: Dispatch<SetStateAction<string | null>>;
        handleCreatePrototypeStartDraft?: () => void;
        handleCreateResourceStartDraft?: () => void;
        handleCreateThemeStartDraft?: () => void;
        handleOpenProjectInIDE: (ideOverride?: MainIDEPreference, targetPath?: string, projectId?: string) => boolean | Promise<boolean>;
        handleOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;
        handleOpenImageAiPanel?: () => void | Promise<void>;
        handleOpenWebAgentInPanel?: (url: string) => boolean | void | Promise<boolean | void>;
        onExecutePrompt?: (prompt: string, meta: PromptExecutionMeta) => Promise<boolean | void> | boolean | void;
        onCloseAiPanel?: () => void;
        onCloseWebAgentPanel?: () => void;
        handleOpenSelectedDocInIDE: (itemOverride?: ItemData | null, kindOverride?: 'doc' | 'template') => Promise<void>;
        handleCopyItemPath: (item: ItemData) => Promise<void>;
        previewHandleSelectDoc: (item: ItemData) => void;
        resources: any;
    };
}

export function useIndexPageSidebarPropsBuilder({
    state,
    deps,
}: UseIndexPageSidebarPropsBuilderParams): NewSidebarGroupedProps {
    return useMemo(() => {
        const prototypeStartPageActive = state.prototypeStartPageActive === true;
        const conversationUiEnabled = state.surfaceCapabilities?.conversationUi !== false;
        const externalOpenMenu = state.surfaceCapabilities?.externalOpenMenu !== false;
        const resetToPrototypeStartView = () => {
            deps.setActiveTab('prototypes');
            deps.setSidebarTab('prototype');
            deps.setViewMode('demo');
            deps.setSelectedPrototypePageId?.(null);
        };

        return ({
        state: {
            collapsed: state.collapsed,
            loading: state.loading,
            sidebarTab: state.sidebarTab,
            viewMode: state.viewMode,
            data: state.data,
            docsItems: state.docsItems,
            canvasItems: state.canvasItems,
            themes: state.themes,
            defaultThemeName: state.defaultThemeName,
            searchText: state.searchText,
            selectedItem: state.selectedItem,
            selectedPrototypePageId: state.selectedPrototypePageId,
            selectedDoc: state.selectedDoc,
            selectedResourceFolder: state.selectedResourceFolder,
            selectedCanvas: state.selectedCanvas,
            selectedTheme: state.selectedTheme,
            resourceSection: state.resourceSection,
            projectTitle: state.projectTitle,
            activeProjectId: state.activeProjectId,
            projectSetupRequired: state.projectSetupRequired,
            makeClientUpdateAvailable: state.makeClientUpdateAvailable,
            makeClientUpdateReminderVisible: state.makeClientUpdateReminderVisible,
            projects: state.projects,
            resourceWriteCapabilities: state.resourceWriteCapabilities,
            localExportCapabilities: state.localExportCapabilities,
            lanAccessAllowed: state.lanAccessAllowed,
            isDarkMode: state.isDarkMode,
            sidebarTrees: state.sidebarTrees,
            webAgentPanelOpen: prototypeStartPageActive || !conversationUiEnabled ? false : state.webAgentPanelOpen,
            aiPanelMode: prototypeStartPageActive || !conversationUiEnabled ? null : state.aiPanelMode,
            externalOpenMenu,
            prototypeStartPageActive: state.prototypeStartPageActive,
            resourceStartDraftActive: state.resourceStartDraftActive,
            themeStartDraftActive: state.themeStartDraftActive,
        },
        actions: {
            handleTabChange: deps.handleTabChange,
            onSidebarTabChange: (tab) => {
                if (tab === 'prototype') {
                    if (deps.handleCreatePrototypeStartDraft) {
                        deps.handleCreatePrototypeStartDraft();
                        return;
                    }
                }
                if (tab === 'document') {
                    if (deps.handleCreateResourceStartDraft) {
                        deps.handleCreateResourceStartDraft();
                        return;
                    }
                }
                if (tab === 'assets') {
                    if (deps.handleCreateThemeStartDraft) {
                        deps.handleCreateThemeStartDraft();
                        return;
                    }
                }
                deps.setSidebarTab(tab);
            },
            onPrototypeViewSelect: async (item, mode) => {
                await Promise.resolve(deps.handleMenuClick({ key: item.name }));
                deps.setSelectedPrototypePageId?.(null);
                deps.setSidebarTab('prototype');
                deps.setViewMode(mode);
            },
            onPrototypePageSelect: async (item, pageId) => {
                await Promise.resolve(deps.handleMenuClick({ key: item.name, pageId }));
                deps.setSelectedPrototypePageId?.(pageId);
                deps.setSidebarTab('prototype');
                deps.setViewMode('demo');
            },
            setSearchText: deps.setSearchText,
            onRenameTheme: (item) => { void deps.resources.handleRenameThemeResource(item); },
            onDeleteTheme: (item) => { void deps.resources.handleDeleteThemeResource(item); },
            onSetDefaultTheme: (themeName) => { void deps.resources.handleSetDefaultTheme(themeName); },
            onResourceSectionChange: deps.setResourceSection,
            onSelectDoc: (item) => {
                deps.resources.setSelectedResourceFolder?.(null);
                deps.previewHandleSelectDoc(item);
                deps.setViewMode('demo');
            },
            onSelectResourceFolder: deps.resources.handleSelectResourceFolder,
            onSelectCanvas: deps.resources.handleSelectCanvas,
            onSelectTheme: (item) => {
                deps.setSidebarTab('assets');
                deps.setResourceSection('themes');
                deps.resources.setSelectedTheme(item);
                deps.setViewMode('demo');
            },
            handleMenuClick: deps.handleMenuClick,
            handleDownloadItemSource: deps.resources.handleDownloadItemSource,
            handleDownloadThemeZip: deps.resources.handleDownloadThemeZip,
            handleRenameItem: deps.resources.handleRenameItem,
            handleDuplicateItem: (item) => { void deps.resources.handleDuplicateItem(item); },
            handleDeleteItem: (item) => { void deps.resources.handleDeleteItem(item, deps.preferredPromptClient, deps.preferredIDE, deps.ideAvailability); },
            handleCopyItemPath: (item) => { void deps.handleCopyItemPath(item); },
            handleRenameDocItem: deps.resources.handleRenameDocItem,
            handleDuplicateDocItem: (item) => { void deps.resources.handleDuplicateDocItem(item); },
            handleDeleteDocItem: (item) => { void deps.resources.handleDeleteDocItem(item); },
            handleCopyDocPath: (item) => { void deps.resources.handleCopyDocPath(item); },
            handleDocVersionManagement: deps.resources.handleDocVersionManagement,
            onOpenCreateDialog: (initialTab = 'onlineImport') => {
                if (state.sidebarTab === 'prototype') {
                    deps.setActiveTab('prototypes');
                }
                deps.setInitialCreateDialogTab(initialTab);
                deps.setCreateDialogVisible(true);
            },
            onCreatePlaceholderPrototype: () => {
                if (deps.handleCreatePrototypeStartDraft) {
                    deps.handleCreatePrototypeStartDraft();
                    return;
                }
                void deps.resources.handleCreatePlaceholderPrototype();
            },
            onCreateResourceStart: () => {
                deps.handleCreateResourceStartDraft?.();
            },
            onCreateThemeStart: () => {
                deps.handleCreateThemeStartDraft?.();
            },
            onCreateResourceCanvasFile: (targetFolder) => {
                void deps.resources.handleCreateResourceCanvasFile?.(targetFolder);
            },
            onCreateDrawioResourceFile: (targetFolder) => {
                void deps.resources.handleCreateDrawioResourceFile?.(targetFolder);
            },
            onUploadedResourceFiles: (files) => { void deps.resources.handleUploadedResourceFiles(files); },
            onCreateFolder: deps.resources.handleCreateFolder,
            onSettingsClick: (tab = 'project') => deps.openSettingsDialog(tab),
            onVersionCollaborationClick: () => deps.setVersionCollaborationDrawerOpen(true),
            onToggleTheme: () => deps.setIsDarkMode(!state.isDarkMode),
            onTitleChange: deps.resources.handleProjectTitleChange,
            onProjectSwitch: deps.switchProject,
            onProjectDelete: deps.deleteProject,
            onProjectStop: deps.stopProjectDevServer,
            onAddProject: async (root) => {
                const result = await Promise.resolve(deps.addProjectFromLocalPath(root));
                if (result !== false) {
                    resetToPrototypeStartView();
                }
                return result;
            },
            onCreateBlankMakeProject: async (params) => {
                const result = await deps.createBlankMakeProject(params);
                resetToPrototypeStartView();
                return result;
            },
            onCloneMakeProject: async (params) => {
                const result = await deps.cloneMakeProject(params);
                resetToPrototypeStartView();
                return result;
            },
            onCopyMakeProject: async (params) => {
                const result = await deps.copyMakeProject(params);
                resetToPrototypeStartView();
                return result;
            },
            onRefreshProjects: deps.loadProjects,
            onSidebarTreeChange: deps.resources.handleSidebarTreeChange,
            onSidebarTreePersist: deps.resources.handleSidebarTreePersist,
            handleVersionManagement: deps.resources.handleVersionManagement,
            handleOpenProjectInIDE: deps.handleOpenProjectInIDE,
            onOpenAcpWebAgent: prototypeStartPageActive || !conversationUiEnabled ? undefined : deps.handleOpenAcpWebAgent,
            onOpenImageAiPanel: prototypeStartPageActive || !conversationUiEnabled ? undefined : deps.handleOpenImageAiPanel,
            onOpenWebAgentInPanel: conversationUiEnabled ? deps.handleOpenWebAgentInPanel : undefined,
            onExecutePrompt: conversationUiEnabled ? deps.onExecutePrompt : undefined,
            onCloseAiPanel: conversationUiEnabled ? deps.onCloseAiPanel : undefined,
            onCloseWebAgentPanel: conversationUiEnabled ? deps.onCloseWebAgentPanel : undefined,
            onOpenAISettings: () => deps.openSettingsDialog('ai'),
        },
        preferences: {
            preferredIDE: deps.preferredIDE,
            ideAvailability: deps.ideAvailability,
            agentAvailability: deps.agentAvailability,
            onPreferredIDEChange: deps.setPreferredIDE,
        },
    });
    }, [deps, state]) satisfies NewSidebarGroupedProps;
}
