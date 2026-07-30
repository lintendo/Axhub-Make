import React from 'react';
import type { SidebarTab } from './IconNavigation';
import ContentPanel from './ContentPanel';
import ResponsiveSidebarShell from './ResponsiveSidebarShell';
import { ItemData, SidebarTreeTab } from '../../types';
import type {
    NewSidebarLegacyProps,
    NewSidebarProps,
} from '../../types/index-page.types';
import type { ThemeResourceItem } from '../../domains/resources/resource.types';

function resolveNewSidebarProps(props: NewSidebarProps): NewSidebarLegacyProps {
    if ('state' in props) {
        return {
            ...props.state,
            ...props.actions,
            ...props.preferences,
        };
    }

    return props;
}

export default function NewSidebar(rawProps: NewSidebarProps) {
    const {
        collapsed,
        loading,
        handleTabChange,
        sidebarTab,
        viewMode,
        onSidebarTabChange,
        onPrototypeViewSelect,
        onPrototypePageSelect,
        data,
        docsItems,
        themes,
        defaultThemeName,
        searchText,
        setSearchText,
        selectedItem,
        selectedPrototypePageId,
        selectedDoc,
        selectedResourceFolder,
        selectedTheme,
        onRenameTheme,
        onDeleteTheme,
        onSetDefaultTheme,
        onSelectDoc,
        onSelectResourceFolder,
        onSelectTheme,
        handleMenuClick,
        handleRenameItem,
        handleDuplicateItem,
        handleDeleteItem,
        handleCopyItemPath,
        handleRenameDocItem,
        handleDuplicateDocItem,
        handleDeleteDocItem,
        handleCopyDocPath,
        handleDocVersionManagement,
        onOpenCreateDialog,
        onUploadedResourceFiles,
        onCreatePlaceholderPrototype,
        onCreateResourceStart,
        onCreateThemeStart,
        onCreateFolder,
        handleDownloadItemSource,
        handleDownloadThemeZip,
        preferredIDE,
        ideAvailability,
        agentAvailability,
        onOpenAcpWebAgent,
        onOpenImageAiPanel,
        onOpenWebAgentInPanel,
        onExecutePrompt,
        onCloseAiPanel,
        onCloseWebAgentPanel,
        onSettingsClick,
        onVersionCollaborationClick,
        onOpenAISettings,
        onToggleTheme,
        projectTitle,
        activeProjectId,
        projectSetupRequired,
        makeClientUpdateAvailable,
        makeClientUpdateReminderVisible,
        projects,
        resourceWriteCapabilities,
        onTitleChange,
        onProjectSwitch,
        onProjectDelete,
        onProjectStop,
        onAddProject,
        onCreateBlankMakeProject,
        onCloneMakeProject,
        onCopyMakeProject,
        onRefreshProjects,
        handleOpenProjectInIDE,
        onPreferredIDEChange,
        isDarkMode,
        handleVersionManagement,
        sidebarTrees,
        onSidebarTreeChange,
        onSidebarTreePersist,
        webAgentPanelOpen,
        aiPanelMode,
    } = resolveNewSidebarProps(rawProps);

    const handleSidebarTabChange = (tab: SidebarTab) => {
        if (tab === sidebarTab) {
            return;
        }
        onSidebarTabChange(tab);
        if (tab === 'prototype') {
            handleTabChange('prototypes');
        }
    };

    const currentTreeTab: SidebarTreeTab = sidebarTab === 'prototype'
        ? 'prototypes'
        : sidebarTab === 'document'
            ? 'docs'
            : 'themes';

    const themesAsItemData: ItemData[] = themes.map((theme) => ({
        name: theme.name,
        displayName: theme.displayName || theme.name,
        jsUrl: '',
        specUrl: '',
        filePath: theme.path,
        absoluteFilePath: theme.absoluteFilePath,
        previewUrl: theme.previewUrl || theme.clientUrl,
        clientUrl: theme.clientUrl || theme.previewUrl,
        projectId: theme.projectId,
        resourceId: theme.name,
    }));
    const selectedThemeItem = selectedTheme
        ? themesAsItemData.find((t) => t.name === selectedTheme.name)
        || {
            name: selectedTheme.name,
            displayName: selectedTheme.displayName || selectedTheme.name,
            jsUrl: '',
            specUrl: '',
            filePath: selectedTheme.path,
            absoluteFilePath: selectedTheme.absoluteFilePath,
            previewUrl: selectedTheme.previewUrl || selectedTheme.clientUrl,
            clientUrl: selectedTheme.clientUrl || selectedTheme.previewUrl,
            projectId: selectedTheme.projectId,
            resourceId: selectedTheme.name,
        }
        : null;

    const currentItems = currentTreeTab === 'prototypes'
        ? data.prototypes
        : currentTreeTab === 'docs'
            ? docsItems
            : themesAsItemData;
    const selectedResourceFolderTreeTab = selectedResourceFolder?.treeTab || 'docs';
    const currentSelectedFolder = selectedResourceFolder && selectedResourceFolderTreeTab === currentTreeTab
        ? selectedResourceFolder
        : null;

    const currentSelectedItem = sidebarTab === 'document'
        ? selectedDoc
        : sidebarTab === 'assets'
            ? selectedThemeItem
            : selectedItem;

    const renameHandler = currentTreeTab === 'docs'
        ? handleRenameDocItem
        : currentTreeTab === 'themes'
            ? (item: ItemData, nextName: string) => { void onRenameTheme(themes.find((t) => t.name === item.name) || item as any, nextName); }
            : handleRenameItem;
    const duplicateHandler = currentTreeTab === 'docs'
        ? handleDuplicateDocItem
        : handleDuplicateItem;
    const deleteHandler = currentTreeTab === 'docs'
        ? handleDeleteDocItem
        : currentTreeTab === 'themes'
            ? (item: ItemData) => { void onDeleteTheme(themes.find((t) => t.name === item.name) || item as any); }
            : handleDeleteItem;
    const copyPathHandler = currentTreeTab === 'docs'
        ? handleCopyDocPath
        : handleCopyItemPath;
    const versionHandler = currentTreeTab === 'docs' ? handleDocVersionManagement : handleVersionManagement;

    return (
        <ResponsiveSidebarShell collapsed={collapsed}>
            <ContentPanel
                activeTab={sidebarTab}
                viewMode={viewMode}
                onTabChange={handleSidebarTabChange}
                onPrototypeViewSelect={onPrototypeViewSelect}
                onPrototypePageSelect={onPrototypePageSelect}
                projectTitle={projectTitle}
                activeProjectId={activeProjectId}
                projectSetupRequired={projectSetupRequired}
                makeClientUpdateAvailable={makeClientUpdateAvailable}
                makeClientUpdateReminderVisible={makeClientUpdateReminderVisible}
                projects={projects}
                resourceWriteCapabilities={resourceWriteCapabilities}
                onTitleChange={onTitleChange}
                onProjectSwitch={onProjectSwitch}
                onProjectDelete={onProjectDelete}
                onProjectStop={onProjectStop}
                onAddProject={onAddProject}
                onCreateBlankMakeProject={onCreateBlankMakeProject}
                onCloneMakeProject={onCloneMakeProject}
                onCopyMakeProject={onCopyMakeProject}
                onRefreshProjects={onRefreshProjects}
                tree={sidebarTrees[currentTreeTab] || []}
                onTreeChange={(nextTree) => onSidebarTreeChange(currentTreeTab, nextTree)}
                onTreePersist={(nextTree) => onSidebarTreePersist(currentTreeTab, nextTree)}
                items={currentItems}
                selectedItem={currentSelectedItem}
                selectedPrototypePageId={sidebarTab === 'prototype' ? selectedPrototypePageId : null}
                selectedFolder={currentSelectedFolder}
                onItemClick={(item) => {
                    if (sidebarTab === 'document') {
                        onSelectDoc(item);
                        return;
                    }
                    if (sidebarTab === 'assets') {
                        const themeItem = themes.find((t) => t.name === item.name);
                        if (themeItem) {
                            onSelectTheme(themeItem);
                        }
                        return;
                    }
                    void onPrototypeViewSelect(item, 'demo');
                }}
                onFolderClick={currentTreeTab === 'docs' || currentTreeTab === 'themes'
                    ? (folder) => onSelectResourceFolder?.(folder, currentTreeTab, { preserveViewMode: viewMode === 'canvas' })
                    : undefined}
                onSearch={setSearchText}
                searchText={searchText}
                onCreateFile={onCreatePlaceholderPrototype}
                onCreateResourceStart={onCreateResourceStart}
                onCreateThemeStart={onCreateThemeStart}
                onUploadedResourceFiles={onUploadedResourceFiles}
                onCreateFolder={onCreateFolder}
                handleDownloadItemSource={handleDownloadItemSource}
                handleDownloadThemeZip={(theme) => {
                    const themeItem = themes.find((item) => item.name === theme.name) || theme as ThemeResourceItem;
                    void Promise.resolve(handleDownloadThemeZip(themeItem));
                }}
                loading={loading}
                handleOpenProjectInIDE={handleOpenProjectInIDE}
                preferredIDE={preferredIDE}
                ideAvailability={ideAvailability}
                agentAvailability={agentAvailability}
                onOpenAcpWebAgent={onOpenAcpWebAgent}
                onOpenImageAiPanel={onOpenImageAiPanel}
                onOpenWebAgentInPanel={onOpenWebAgentInPanel}
                onExecutePrompt={onExecutePrompt}
                webAgentPanelOpen={webAgentPanelOpen}
                aiPanelMode={aiPanelMode}
                onCloseAiPanel={onCloseAiPanel}
                onCloseWebAgentPanel={onCloseWebAgentPanel}
                onPreferredIDEChange={onPreferredIDEChange}
                onOpenAISettings={onOpenAISettings}
                isDarkMode={isDarkMode}
                handleRenameItem={renameHandler}
                handleDuplicateItem={duplicateHandler}
                handleCopyItemPath={copyPathHandler}
                handleVersionManagement={versionHandler}
                handleDeleteItem={deleteHandler}
                onSettingsClick={onSettingsClick}
                onVersionCollaborationClick={onVersionCollaborationClick}
                onToggleTheme={onToggleTheme}
                selectedTheme={selectedTheme}
                defaultThemeName={defaultThemeName}
                onSetDefaultTheme={onSetDefaultTheme}
            />
        </ResponsiveSidebarShell>
    );
}
