import { describe, expect, it, vi } from 'vitest';

import type { ItemData } from '../../types';
import type { ThemeResourceItem } from '../../domains/resources/resource.types';
import { useIndexPageSidebarPropsBuilder } from './useIndexPageSidebarPropsBuilder';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
  };
});

function createItem(name: string): ItemData {
  return {
    name,
    displayName: name,
    jsUrl: '',
    specUrl: '',
  };
}

function createTheme(name: string): ThemeResourceItem {
  return {
    name,
    displayName: name,
    clientUrl: `/themes/${name}`,
    previewUrl: `/themes/${name}`,
  };
}

function createBuilderParams(overrides: Partial<Parameters<typeof useIndexPageSidebarPropsBuilder>[0]> = {}) {
  const selectedPrototype = createItem('prototype-a');
  const selectedDoc = createItem('doc-a');
  const selectedTheme = createTheme('theme-a');
  const setViewMode = vi.fn();
  const setSidebarTab = vi.fn();
  const setResourceSection = vi.fn();

  const params: Parameters<typeof useIndexPageSidebarPropsBuilder>[0] = {
    state: {
      collapsed: false,
      loading: false,
      sidebarTab: 'prototype',
      viewMode: 'canvas',
      data: { prototypes: [selectedPrototype], components: [] },
      docsItems: [selectedDoc],
      canvasItems: [],
      themes: [selectedTheme],
      searchText: '',
      selectedItem: selectedPrototype,
      selectedDoc,
      selectedCanvas: null,
      selectedTheme,
      resourceSection: 'themes',
      projectTitle: 'Project',
      activeProjectId: 'project-a',
      projects: [],
      resourceWriteCapabilities: {
        prototypeCreate: false,
        prototypeUpload: false,
        docCreate: false,
        docImport: false,
        themeCreate: false,
        themeImport: false,
        dataCreate: false,
        dataImport: false,
        templateCreate: false,
        templateDuplicate: false,
      },
      localExportCapabilities: {
        html: false,
        make: false,
      },
      isDarkMode: false,
      sidebarTrees: { prototypes: [], docs: [], canvas: [], themes: [] },
      webAgentPanelOpen: false,
      defaultThemeName: null,
    },
    deps: {
      preferredPromptClient: null,
      preferredIDE: 'cursor',
      setPreferredIDE: vi.fn(),
      setIsDarkMode: vi.fn(),
      openSettingsDialog: vi.fn(),
      setActiveTab: vi.fn(),
      setSidebarTab,
      setViewMode,
      setResourceSection,
      setSearchText: vi.fn(),
      switchProject: vi.fn(),
      stopProjectDevServer: vi.fn(),
      addProjectFromLocalPath: vi.fn(),
      createBlankMakeProject: vi.fn(async () => ({})),
      cloneMakeProject: vi.fn(async () => ({})),
      copyMakeProject: vi.fn(async () => ({})),
      loadProjects: vi.fn(),
      setCreateDialogVisible: vi.fn(),
      setInitialCreateDialogTab: vi.fn(),
      handleTabChange: vi.fn(),
      handleMenuClick: vi.fn(),
      handleOpenProjectInIDE: vi.fn(),
      handleOpenSelectedDocInIDE: vi.fn(async () => undefined),
      handleCopyItemPath: vi.fn(async () => undefined),
      previewHandleSelectDoc: vi.fn(),
      resources: {
        handleRenameThemeResource: vi.fn(),
        handleDeleteThemeResource: vi.fn(),
        setSelectedTheme: vi.fn(),
        handleDownloadItemSource: vi.fn(),
        handleDownloadThemeZip: vi.fn(),
        handleRenameItem: vi.fn(),
        handleDuplicateItem: vi.fn(),
        handleDeleteItem: vi.fn(),
        handleRenameDocItem: vi.fn(),
        handleDuplicateDocItem: vi.fn(),
        handleDeleteDocItem: vi.fn(),
        handleCopyDocPath: vi.fn(),
        handleDocVersionManagement: vi.fn(),
        handleImportThemeResource: vi.fn(),
        handleCreatePlaceholderPrototype: vi.fn(),
        handleCreateResourceCanvasFile: vi.fn(),
        handleCreateDrawioResourceFile: vi.fn(),
        handleCreateResource: vi.fn(),
        handleCreateDocFile: vi.fn(),
        handleUploadedResourceFiles: vi.fn(),
        handleCreateCanvasFile: vi.fn(),
        handleSelectCanvas: vi.fn(),
        handleRenameCanvasItem: vi.fn(),
        handleDuplicateCanvasItem: vi.fn(),
        handleDeleteCanvasItem: vi.fn(),
        handleCopyCanvasPath: vi.fn(),
        handleCreateFolder: vi.fn(),
        handleProjectTitleChange: vi.fn(),
        handleSidebarTreeChange: vi.fn(),
        handleSidebarTreePersist: vi.fn(),
        handleVersionManagement: vi.fn(),
        handleSetDefaultTheme: vi.fn(),
      },
    },
  };

  return {
    ...params,
    ...overrides,
    state: { ...params.state, ...overrides.state },
    deps: { ...params.deps, ...overrides.deps },
  };
}

describe('useIndexPageSidebarPropsBuilder', () => {
  it('keeps canvas visible when only switching resource tabs but opens the document when a document is selected', () => {
    const setViewMode = vi.fn();
    const previewHandleSelectDoc = vi.fn();
    const setSelectedResourceFolder = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: { sidebarTab: 'document' },
      deps: {
        setViewMode,
        previewHandleSelectDoc,
        resources: {
          ...createBuilderParams().deps.resources,
          setSelectedResourceFolder,
        },
      },
    }));

    props.actions.onSidebarTabChange('document');
    expect(setViewMode).not.toHaveBeenCalled();

    props.actions.onSelectDoc(createItem('doc-b'));

    expect(previewHandleSelectDoc).toHaveBeenCalledWith(expect.objectContaining({ name: 'doc-b' }));
    expect(setSelectedResourceFolder).toHaveBeenCalledWith(null);
    expect(setViewMode).toHaveBeenCalledWith('demo');
  });

  it('opens a selected theme even when prototype canvas mode was active', () => {
    const setViewMode = vi.fn();
    const setSelectedTheme = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: { sidebarTab: 'assets', resourceSection: 'themes' },
      deps: {
        setViewMode,
        resources: {
          ...createBuilderParams().deps.resources,
          setSelectedTheme,
        },
      },
    }));

    props.actions.onSelectTheme(createTheme('theme-b'));

    expect(setSelectedTheme).toHaveBeenCalledWith(expect.objectContaining({ name: 'theme-b' }));
    expect(setViewMode).toHaveBeenCalledWith('demo');
  });

  it('lands on the matching new-item start page when switching sidebar sections', () => {
    const handleCreatePrototypeStartDraft = vi.fn();
    const handleCreateResourceStartDraft = vi.fn();
    const handleCreateThemeStartDraft = vi.fn();
    const setSidebarTab = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: {
        setSidebarTab,
        handleCreatePrototypeStartDraft,
        handleCreateResourceStartDraft,
        handleCreateThemeStartDraft,
      },
    }));

    props.actions.onSidebarTabChange('prototype');
    props.actions.onSidebarTabChange('document');
    props.actions.onSidebarTabChange('assets');

    expect(handleCreatePrototypeStartDraft).toHaveBeenCalledTimes(1);
    expect(handleCreateResourceStartDraft).toHaveBeenCalledTimes(1);
    expect(handleCreateThemeStartDraft).toHaveBeenCalledTimes(1);
    expect(setSidebarTab).not.toHaveBeenCalled();
  });

  it('routes prototype page child clicks through parent selection and page id state', async () => {
    const handleMenuClick = vi.fn();
    const setSelectedPrototypePageId = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: {
        handleMenuClick,
        setSelectedPrototypePageId,
      } as any,
    }));

    await props.actions.onPrototypePageSelect(createItem('prototype-a'), 'orders-list');

    expect(handleMenuClick).toHaveBeenCalledWith({ key: 'prototype-a', pageId: 'orders-list' });
    expect(setSelectedPrototypePageId).toHaveBeenCalledWith('orders-list');
  });

  it('passes default design state and action into the sidebar', () => {
    const handleSetDefaultTheme = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: { defaultThemeName: 'theme-a' },
      deps: {
        resources: {
          ...createBuilderParams().deps.resources,
          handleSetDefaultTheme,
        },
      },
    }));

    expect(props.state.defaultThemeName).toBe('theme-a');

    props.actions.onSetDefaultTheme?.('theme-b');

    expect(handleSetDefaultTheme).toHaveBeenCalledWith('theme-b');
  });

  it('disables manual assistant opening on the prototype start page', () => {
    const handleOpenAcpWebAgent = vi.fn();
    const handleOpenImageAiPanel = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: {
        prototypeStartPageActive: true,
        webAgentPanelOpen: true,
        aiPanelMode: 'general-ai',
      },
      deps: {
        handleOpenAcpWebAgent,
        handleOpenImageAiPanel,
      },
    }));

    expect(props.state.webAgentPanelOpen).toBe(false);
    expect(props.state.aiPanelMode).toBeNull();
    expect(props.actions.onOpenAcpWebAgent).toBeUndefined();
    expect(props.actions.onOpenImageAiPanel).toBeUndefined();
  });

  it('removes conversation controls and the external open menu on the Codex surface', () => {
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: {
        webAgentPanelOpen: true,
        aiPanelMode: 'general-ai',
        surfaceCapabilities: {
          conversationUi: false,
          externalOpenMenu: false,
          directAiTools: true,
        },
      } as any,
      deps: {
        handleOpenAcpWebAgent: vi.fn(),
        handleOpenImageAiPanel: vi.fn(),
        handleOpenWebAgentInPanel: vi.fn(),
        onExecutePrompt: vi.fn(),
        onCloseAiPanel: vi.fn(),
        onCloseWebAgentPanel: vi.fn(),
      },
    }));

    expect(props.state.externalOpenMenu).toBe(false);
    expect(props.state.webAgentPanelOpen).toBe(false);
    expect(props.state.aiPanelMode).toBeNull();
    expect(props.actions.onOpenAcpWebAgent).toBeUndefined();
    expect(props.actions.onOpenImageAiPanel).toBeUndefined();
    expect(props.actions.onOpenWebAgentInPanel).toBeUndefined();
    expect(props.actions.onExecutePrompt).toBeUndefined();
    expect(props.actions.onCloseAiPanel).toBeUndefined();
    expect(props.actions.onCloseWebAgentPanel).toBeUndefined();
  });

  it('forwards uploaded document resources so the resource layer can select the new file', () => {
    const handleUploadedResourceFiles = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: {
        resources: {
          ...createBuilderParams().deps.resources,
          handleUploadedResourceFiles,
        },
      },
    }));
    const uploadedFiles = [{ name: 'assets/screens/pasted-image.png' }];

    (props.actions.onUploadedResourceFiles as any)?.(uploadedFiles);

    expect(handleUploadedResourceFiles).toHaveBeenCalledWith(uploadedFiles);
  });

  it('passes project setup required state into the sidebar', () => {
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: { projectSetupRequired: true },
    }));

    expect(props.state.projectSetupRequired).toBe(true);
  });

  it('resets successful project setup, clone, and copy to the prototype start page instead of preserving canvas mode', async () => {
    const setActiveTab = vi.fn();
    const setSidebarTab = vi.fn();
    const setViewMode = vi.fn();
    const setSelectedPrototypePageId = vi.fn();
    const createBlankMakeProject = vi.fn(async () => ({ project: { id: 'new-project' } }));
    const cloneMakeProject = vi.fn(async () => ({ project: { id: 'cloned-project' } }));
    const copyMakeProject = vi.fn(async () => ({ project: { id: 'copied-project' } }));
    const addProjectFromLocalPath = vi.fn(async () => true);
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: {
        sidebarTab: 'prototype',
        viewMode: 'canvas',
        selectedPrototypePageId: 'old-page',
      },
      deps: {
        setActiveTab,
        setSidebarTab,
        setViewMode,
        setSelectedPrototypePageId,
        createBlankMakeProject,
        cloneMakeProject,
        copyMakeProject,
        addProjectFromLocalPath,
      },
    }));

    await props.actions.onCreateBlankMakeProject({
      parentRoot: '/tmp',
      folderName: 'new-project',
      projectName: '',
    });
    await props.actions.onCopyMakeProject({
      parentRoot: '/tmp',
      folderName: 'copied-project',
      projectName: 'Copied Project',
    });
    await props.actions.onCloneMakeProject({
      parentRoot: '/tmp',
      folderName: 'cloned-project',
      projectName: 'Cloned Project',
      gitUrl: 'https://github.com/example/full-client.git',
    });
    await props.actions.onAddProject('/tmp/existing-project');

    expect(createBlankMakeProject).toHaveBeenCalledWith({
      parentRoot: '/tmp',
      folderName: 'new-project',
      projectName: '',
    });
    expect(copyMakeProject).toHaveBeenCalledWith({
      parentRoot: '/tmp',
      folderName: 'copied-project',
      projectName: 'Copied Project',
    });
    expect(cloneMakeProject).toHaveBeenCalledWith({
      parentRoot: '/tmp',
      folderName: 'cloned-project',
      projectName: 'Cloned Project',
      gitUrl: 'https://github.com/example/full-client.git',
    });
    expect(addProjectFromLocalPath).toHaveBeenCalledWith('/tmp/existing-project');
    expect(setActiveTab).toHaveBeenCalledTimes(4);
    expect(setActiveTab).toHaveBeenNthCalledWith(1, 'prototypes');
    expect(setActiveTab).toHaveBeenNthCalledWith(2, 'prototypes');
    expect(setActiveTab).toHaveBeenNthCalledWith(3, 'prototypes');
    expect(setActiveTab).toHaveBeenNthCalledWith(4, 'prototypes');
    expect(setSidebarTab).toHaveBeenCalledTimes(4);
    expect(setSidebarTab).toHaveBeenNthCalledWith(1, 'prototype');
    expect(setSidebarTab).toHaveBeenNthCalledWith(2, 'prototype');
    expect(setSidebarTab).toHaveBeenNthCalledWith(3, 'prototype');
    expect(setSidebarTab).toHaveBeenNthCalledWith(4, 'prototype');
    expect(setViewMode).toHaveBeenCalledTimes(4);
    expect(setViewMode).toHaveBeenNthCalledWith(1, 'demo');
    expect(setViewMode).toHaveBeenNthCalledWith(2, 'demo');
    expect(setViewMode).toHaveBeenNthCalledWith(3, 'demo');
    expect(setViewMode).toHaveBeenNthCalledWith(4, 'demo');
    expect(setSelectedPrototypePageId).toHaveBeenCalledTimes(4);
    expect(setSelectedPrototypePageId).toHaveBeenNthCalledWith(1, null);
    expect(setSelectedPrototypePageId).toHaveBeenNthCalledWith(2, null);
    expect(setSelectedPrototypePageId).toHaveBeenNthCalledWith(3, null);
    expect(setSelectedPrototypePageId).toHaveBeenNthCalledWith(4, null);
  });

  it('does not pass the legacy document-to-prototype drawer action into the sidebar', () => {
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams());

    expect(props.actions).not.toHaveProperty('onCreatePrototypeFromDoc');
  });

  it('opens create dialog only on import tabs while sidebar plus creates a placeholder prototype', () => {
    const setInitialCreateDialogTab = vi.fn();
    const setCreateDialogVisible = vi.fn();
    const setActiveTab = vi.fn();
    const handleCreatePlaceholderPrototype = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: {
        setActiveTab,
        setInitialCreateDialogTab,
        setCreateDialogVisible,
        resources: {
          ...createBuilderParams().deps.resources,
          handleCreatePlaceholderPrototype,
        },
      },
    }));

    props.actions.onOpenCreateDialog();
    props.actions.onOpenCreateDialog('upload');
    props.actions.onOpenCreateDialog('onlineImport');
    props.actions.onCreatePlaceholderPrototype();

    expect(setActiveTab).toHaveBeenCalledTimes(3);
    expect(setActiveTab).toHaveBeenCalledWith('prototypes');
    expect(setInitialCreateDialogTab).toHaveBeenCalledTimes(3);
    expect(setInitialCreateDialogTab).toHaveBeenNthCalledWith(1, 'onlineImport');
    expect(setInitialCreateDialogTab).toHaveBeenNthCalledWith(2, 'upload');
    expect(setInitialCreateDialogTab).toHaveBeenNthCalledWith(3, 'onlineImport');
    expect(setInitialCreateDialogTab).not.toHaveBeenCalledWith('ai');
    expect(setInitialCreateDialogTab).not.toHaveBeenCalledWith('create');
    expect(setCreateDialogVisible).toHaveBeenCalledWith(true);
    expect(handleCreatePlaceholderPrototype).toHaveBeenCalledTimes(1);
  });

  it('starts a front-end prototype draft from the sidebar plus without creating a placeholder', () => {
    const handleCreatePrototypeStartDraft = vi.fn();
    const handleCreatePlaceholderPrototype = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: {
        handleCreatePrototypeStartDraft,
        resources: {
          ...createBuilderParams().deps.resources,
          handleCreatePlaceholderPrototype,
        },
      } as any,
    }));

    props.actions.onCreatePlaceholderPrototype();

    expect(handleCreatePrototypeStartDraft).toHaveBeenCalledTimes(1);
    expect(handleCreatePlaceholderPrototype).not.toHaveBeenCalled();
  });

  it('starts resource and design draft pages from the sidebar plus actions', () => {
    const handleCreateResourceStartDraft = vi.fn();
    const handleCreateThemeStartDraft = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: {
        handleCreateResourceStartDraft,
        handleCreateThemeStartDraft,
      } as any,
    }));

    props.actions.onCreateResourceStart();
    props.actions.onCreateThemeStart();

    expect(handleCreateResourceStartDraft).toHaveBeenCalledTimes(1);
    expect(handleCreateThemeStartDraft).toHaveBeenCalledTimes(1);
  });

  it('forwards resource start file actions into the sidebar', () => {
    const handleCreateResourceCanvasFile = vi.fn();
    const handleCreateDrawioResourceFile = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: {
        resources: {
          ...createBuilderParams().deps.resources,
          handleCreateResourceCanvasFile,
          handleCreateDrawioResourceFile,
        },
      },
    }));

    props.actions.onCreateResourceCanvasFile?.('flows');
    props.actions.onCreateDrawioResourceFile?.('flows');

    expect(handleCreateResourceCanvasFile).toHaveBeenCalledWith('flows');
    expect(handleCreateDrawioResourceFile).toHaveBeenCalledWith('flows');
  });

  it('opens project settings with the requested tab', () => {
    const openSettingsDialog = vi.fn();
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      deps: { openSettingsDialog },
    }));

    props.actions.onSettingsClick();
    props.actions.onSettingsClick('update');

    expect(openSettingsDialog).toHaveBeenNthCalledWith(1, 'project');
    expect(openSettingsDialog).toHaveBeenNthCalledWith(2, 'update');
  });

  it('passes make client update availability into sidebar state', () => {
    const props = useIndexPageSidebarPropsBuilder(createBuilderParams({
      state: { makeClientUpdateAvailable: true } as any,
    }));

    expect(props.state.makeClientUpdateAvailable).toBe(true);
  });
});
