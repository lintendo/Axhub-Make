import type { MutableRefObject, RefObject } from 'react';
import type { IDEAvailabilityMap, MainIDEPreference } from '../../common/ide';
import type { RuntimeAgentAvailability } from '../../common/agent';
import type { AcpProvider } from '@/common/assistant-context/types';
import type {
    CloudPublishTarget,
    ReviewAxhubConfig,
    ReviewLanSubmitConfig,
    ReviewReportDetail,
    ReviewReportSummary,
    ReviewResult,
} from '../services/api';
import type {
    PreviewConfig,
    MultiPageColumns,
    PreviewScaleMode,
    PreviewSinglePreset,
} from '../domains/device/preview-layout';
import type {
    AxureCopyOptions,
    CanvasItem,
    DataType,
    ImageConfig,
    ItemData,
    PromptClientPreference,
    SidebarTreeNode,
    SidebarTreeTab,
    TabType,
    ViewMode,
} from '../types';
import type {
    DataTableResourceItem,
    TemplateAssetOption,
    TemplateResourceItem,
    ThemeResourceItem,
} from '../domains/resources/resource.types';
import type {
    CommentaryHostToolbarAction,
    CommentaryHostToolbarState,
} from '../../common/web-editor-types';
import type { LocalExportCapabilities, ProjectListItem, ProjectRuntimeStatus, ResourceWriteCapabilities } from '../services/projectResources';
import type { ExcalidrawPropertyPanelMode, ExcalidrawPropertyPanelPosition } from '../utils/excalidrawUiMode';
import type { SpecQuickEditMode } from '../utils/specQuickEdit';
import type { ReviewKind } from '../utils/uiReviewPrompt';
import type { CanvasElementContextInfo } from '../components/content/canvas-embeds/AnnotationOverlay';
import type { CanvasAiGenerationRequest, CanvasAiGenerationResult } from '../domains/ai-generation/CanvasAiGenerationTool';
import type { AssistantImageAttachmentPayload } from '../domains/assistant/assistantContextPayload';

export type ConfigurableCloudPublishTarget = Exclude<CloudPublishTarget, 'axhub'>;

export type {
    DataTableResourceItem,
    TemplateAssetOption,
    TemplateResourceItem,
    ThemeResourceItem,
};

export type SidebarTab = 'prototype' | 'document' | 'canvas' | 'assets';
export type ResourceSection = 'themes' | 'data' | 'templates';
export type PreviewPane = 'primary' | 'secondary';
export type PrototypePanePromptAction = 'copy-prompt' | 'send-to-agent';
export type QuickEditRuntimeStatus = 'idle' | 'pending' | 'ready' | 'missing' | 'error';
export type QuickEditSaveAction = 'save-text' | 'save-style' | 'clear-style';
export type CreateDialogTab = 'upload' | 'onlineImport';
export type PrototypeUploadType = 'make' | 'google_stitch' | 'axure_html' | 'figma_make' | 'v0' | 'google_aistudio';
export type AiPanelMode = 'general-ai' | 'image-ai' | null;

export interface PrototypeCreateDialogOpenOptions {
    initialTab: CreateDialogTab;
    initialUploadType?: PrototypeUploadType;
    targetPrototypeName?: string;
}

export interface SelectedResourceFolder {
    id: string;
    title: string;
    path: string;
    folderPath?: string;
    treeTab?: SidebarTreeTab;
    children?: SidebarTreeNode[];
}

export interface UploadedResourceFile {
    name?: string;
    id?: string;
    itemKey?: string;
    path?: string;
    displayName?: string;
    absoluteFilePath?: string;
}

export interface ExportAvailability {
    canOpenGenericFigmaExport: boolean;
    figmaDisabledReason: string;
    figmaDomDisabledReason: string;
    canOpenGenericAxureExport: boolean;
    axureDisabledReason: string;
    axureRuntimeDisabledReason: string;
    axureSourceDisabledReason: string;
    canUseRuntimeFeatures: boolean;
    canUseSourceFeatures: boolean;
    hasClientUrl: boolean;
    hasSourceContext: boolean;
    htmlExportDisabledReason: string;
    makeExportDisabledReason: string;
}

export interface CreateDialogState {
    visible: boolean;
    activeTab: TabType;
    activeProjectId: string;
    initialTab?: CreateDialogTab;
    initialUploadType?: PrototypeUploadType;
    targetPrototypeName?: string;
    resourceWriteCapabilities: ResourceWriteCapabilities;
    preferredPromptClient: PromptClientPreference;
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    assistantOpen?: boolean;
}

export interface CreateDialogActions {
    onClose: () => void;
    onAfterCreatePromptAction: () => void;
    onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
    onUploadSuccess?: (result?: any) => void | Promise<void>;
}

export interface ExportState {
    open: boolean;
    projectId: string;
    preferencesStorageKey: string;
    imageConfig: ImageConfig;
    axureCopyOptions: AxureCopyOptions;
    isExporting: boolean;
    activeTab: TabType;
    itemName?: string;
    sourceTargetPath?: string;
    preferredPromptClient: PromptClientPreference;
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    assistantOpen?: boolean;
    onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
    initialReviewResult?: ReviewResult | null;
    exportAvailability: ExportAvailability;
}

export interface ExportActions {
    onClose: () => void;
    onInitialReviewHandled: () => void;
    setImageConfig: React.Dispatch<React.SetStateAction<ImageConfig>>;
    setAxureCopyOptions: React.Dispatch<React.SetStateAction<AxureCopyOptions>>;
    onDimensionChange: (field: 'width' | 'height', value: number | null) => void;
    onSwapDimensions: () => void;
    onDimensionBlur: () => void;
    onExport: () => void;
    onCopyRuntimeComponent: () => void;
    onCopyToAxure: (options: AxureCopyOptions) => Promise<void>;
    onCopyConfig: (exportType: string) => Promise<string>;
}

export interface NewSidebarState {
    collapsed: boolean;
    loading: boolean;
    sidebarTab: SidebarTab;
    viewMode: ViewMode;
    data: DataType;
    docsItems: ItemData[];
    canvasItems: CanvasItem[];
    themes: ThemeResourceItem[];
    defaultThemeName?: string | null;
    searchText: string;
    selectedItem: ItemData | null;
    selectedPrototypePageId?: string | null;
    selectedDoc: ItemData | null;
    selectedResourceFolder?: SelectedResourceFolder | null;
    selectedCanvas: CanvasItem | null;
    selectedTheme: ThemeResourceItem | null;
    resourceSection: ResourceSection;
    projectTitle: string;
    activeProjectId: string | null;
    projectSetupRequired?: boolean;
    makeClientUpdateAvailable?: boolean;
    makeClientUpdateReminderVisible?: boolean;
    projects: ProjectListItem[];
    resourceWriteCapabilities: ResourceWriteCapabilities;
    localExportCapabilities: LocalExportCapabilities;
    lanAccessAllowed?: boolean;
    isDarkMode: boolean;
    sidebarTrees: Record<SidebarTreeTab, SidebarTreeNode[]>;
    webAgentPanelOpen?: boolean;
    aiPanelMode?: AiPanelMode;
    prototypeStartPageActive?: boolean;
    resourceStartDraftActive?: boolean;
    themeStartDraftActive?: boolean;
}

export interface NewSidebarActions {
    handleTabChange: (tab: TabType) => void;
    onSidebarTabChange: (tab: SidebarTab) => void;
    onPrototypeViewSelect: (item: ItemData, mode: ViewMode) => void | Promise<void>;
    onPrototypePageSelect: (item: ItemData, pageId: string) => void | Promise<void>;
    setSearchText: (text: string) => void;
    onRenameTheme: (item: ThemeResourceItem, nextName?: string) => void | Promise<void>;
    onDeleteTheme: (item: ThemeResourceItem) => void | Promise<void>;
    onSetDefaultTheme?: (themeName: string) => void | Promise<void>;
    onResourceSectionChange: (section: ResourceSection) => void;
    onSelectDoc: (item: ItemData) => void;
    onSelectResourceFolder?: (
        folder: SidebarTreeNode,
        treeTab?: SidebarTreeTab,
        options?: { preserveViewMode?: boolean },
    ) => void;
    onSelectCanvas: (item: CanvasItem) => void;
    onSelectTheme: (item: ThemeResourceItem) => void;
    handleMenuClick: (params: { key: string; pageId?: string | null }) => void;
    handleDownloadItemSource: (item: ItemData) => void;
    handleDownloadThemeZip: (item: ThemeResourceItem) => void;
    handleRenameItem: (item: ItemData, nextName: string) => void | Promise<void>;
    handleDuplicateItem: (item: ItemData) => void;
    handleDeleteItem: (item: ItemData) => void;
    handleCopyItemPath: (item: ItemData) => void;
    handleRenameDocItem: (item: ItemData, nextName: string) => void | Promise<void>;
    handleDuplicateDocItem: (item: ItemData) => void | Promise<void>;
    handleDeleteDocItem: (item: ItemData) => void | Promise<void>;
    handleCopyDocPath: (item: ItemData) => void | Promise<void>;
    handleDocVersionManagement: (item: ItemData) => void | Promise<void>;
    onOpenCreateDialog: (initialTab?: CreateDialogTab) => void;
    onUploadedResourceFiles?: (files: UploadedResourceFile[]) => void | Promise<void>;
    onCreatePlaceholderPrototype: () => void;
    onCreateResourceStart: () => void;
    onCreateThemeStart: () => void;
    onCreateResourceCanvasFile?: (targetFolder?: string | null) => void | Promise<void>;
    onCreateDrawioResourceFile?: (targetFolder?: string | null) => void | Promise<void>;
    handleRenameCanvasItem: (item: ItemData, nextName: string) => void | Promise<void>;
    handleDuplicateCanvasItem: (item: ItemData) => void | Promise<void>;
    handleDeleteCanvasItem: (item: ItemData) => void | Promise<void>;
    handleCopyCanvasPath: (item: ItemData) => void | Promise<void>;
    onCreateFolder: (tab: SidebarTreeTab) => Promise<{ createdFolderId: string } | null>;
    onSettingsClick: (tab?: 'project' | 'update') => void;
    onVersionCollaborationClick: () => void;
    onToggleTheme: () => void;
    onTitleChange: (title: string) => void | Promise<void>;
    onProjectSwitch: (projectId: string) => void | Promise<void>;
    onProjectDelete: (projectId: string) => void | Promise<void>;
    onProjectStop: (projectId: string) => void | Promise<void>;
    onAddProject: (root: string) => boolean | void | Promise<boolean | void>;
    onCreateBlankMakeProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => Promise<unknown>;
    onCloneMakeProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
        gitUrl: string;
    }) => Promise<unknown>;
    onCopyMakeProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => Promise<unknown>;
    onRefreshProjects: () => void | Promise<void>;
    onSidebarTreeChange: (tab: SidebarTreeTab, tree: SidebarTreeNode[]) => void;
    onSidebarTreePersist: (tab: SidebarTreeTab, tree: SidebarTreeNode[]) => void | Promise<void>;
    handleVersionManagement: (item: ItemData) => void;
    handleOpenProjectInIDE: (ideOverride?: MainIDEPreference, targetPath?: string, projectId?: string) => boolean | Promise<boolean>;
    onOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;
    onOpenImageAiPanel?: () => void | Promise<void>;
    onOpenWebAgentInPanel?: (url: string) => boolean | void | Promise<boolean | void>;
    onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
    onCloseAiPanel?: () => void;
    onCloseWebAgentPanel?: () => void;
    onOpenAISettings?: () => void;
}

export interface NewSidebarPreferences {
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    agentAvailability?: RuntimeAgentAvailability;
    onPreferredIDEChange?: (ide: MainIDEPreference) => void;
}

export interface NewSidebarGroupedProps {
    state: NewSidebarState;
    actions: NewSidebarActions;
    preferences: NewSidebarPreferences;
}

export type NewSidebarLegacyProps = NewSidebarState & NewSidebarActions & NewSidebarPreferences;
export type NewSidebarProps = NewSidebarGroupedProps | NewSidebarLegacyProps;

export interface PresentationAreaState {
    collapsed: boolean;
    selectedItem: ItemData | null;
    prototypeStartDraftActive?: boolean;
    resourceStartDraftActive?: boolean;
    themeStartDraftActive?: boolean;
    viewMode: ViewMode;
    activeTab: TabType;
    selectedDeviceId: string;
    previewConfig: PreviewConfig;
    deviceSegmentOptions: Array<{ value: string; icon: React.ReactNode }>;
    visibleCloudPublishTargets?: CloudPublishTarget[];
    qrCodeVisible: boolean;
    localShareUrl: string;
    quickEditAvailable: boolean;
    quickEditActive?: boolean;
    prototypeAnnotationSessionActive?: boolean;
    prototypeAnnotationEnabled?: boolean;
    prototypeAnnotationEnableLoading?: boolean;
    prototypeAnnotationPromptCopying?: boolean;
    docEditState?: {
        enabled: boolean;
        dirty: boolean;
        saving: boolean;
        quickEditMode: SpecQuickEditMode;
    };
    markdownPromptCopying?: boolean;
    drawioResourceEditAvailable?: boolean;
    reviewPanelOpen?: boolean;
    activeReviewReportId?: string | null;
    reviewReports?: ReviewReportSummary[];
    selectedReviewReport?: ReviewReportDetail | null;
    reviewLoading?: boolean;
    reviewDetailLoading?: boolean;
    reviewUploadLoading?: boolean;
    reviewError?: string;
    reviewLanSubmitConfig?: ReviewLanSubmitConfig | null;
    reviewAxhubSubmitConfig?: ReviewAxhubConfig | null;
    reviewPrompt?: string;
    reviewDocumentPath?: string;
    reviewPrompts?: Partial<Record<ReviewKind, string>>;
    reviewDocumentPaths?: Partial<Record<ReviewKind, string>>;
    quickEditRuntimeStatus?: QuickEditRuntimeStatus;
    exportAvailability?: ExportAvailability;
    editorMode?: 'none' | 'quickEdit';
    hostToolbarState?: CommentaryHostToolbarState | null;
    prototypeDecisionDataAvailable?: boolean;
    allowLAN: boolean;
    projectAccessDeniedReason?: string;
    assistantVisible?: boolean;
    startServerLoading?: boolean;
    containerRef: RefObject<HTMLDivElement>;
    previewIframeRef: MutableRefObject<HTMLIFrameElement | null>;
    secondaryPreviewIframeRef: MutableRefObject<HTMLIFrameElement | null>;
    handlePreviewIframeLoad?: (iframe?: HTMLIFrameElement | null) => void;
    currentDevice: { id: string; [key: string]: any };
    displaySize: { width: number; height: number };
    scale: number;
    elementIframeKey: number;
    iframeUrl: string;
    primaryIframeUrl: string;
    secondaryIframeUrl: string;
    elementIframeSize: { width: number; height: number };
    contentMode?: 'preview' | 'prototype-spec' | 'doc' | 'template' | 'canvas' | 'theme' | 'data';
    docsItems?: ItemData[];
    sidebarTrees?: Partial<Record<SidebarTreeTab, SidebarTreeNode[]>>;
    selectedDoc?: ItemData | null;
    selectedResourceFolder?: SelectedResourceFolder | null;
    selectedCanvas?: CanvasItem | null;
    canvasItems?: CanvasItem[];
    selectedTemplate?: ItemData | null;
    selectedPrototypeSpec?: ItemData | null;
    prototypeSpecSupported?: boolean;
    prototypeSpecLoading?: boolean;
    isDarkMode?: boolean;
    selectedTheme?: ThemeResourceItem | null;
    selectedDataTable?: DataTableResourceItem | null;
    projectRuntimeStatus?: ProjectRuntimeStatus | null;
    projectRuntimeStatusLoading?: boolean;
    hasPrototypeItems?: boolean;
    hasDocItems?: boolean;
    excalidrawPropertyPanelMode?: ExcalidrawPropertyPanelMode;
    excalidrawPropertyPanelPosition?: ExcalidrawPropertyPanelPosition;
    startServerError?: string;
    preferredPromptClient: PromptClientPreference;
    preferredIDE: MainIDEPreference;
    standalonePanelOpen?: boolean;
    bridgeConnected?: boolean;
    activeProjectId?: string | null;
    ideAvailability?: IDEAvailabilityMap;
    agentAvailability?: RuntimeAgentAvailability;
    webAgentPanelOpen?: boolean;
    aiPanelMode?: AiPanelMode;
    assistantApiBaseUrl?: string;
    assistantProjectPath?: string;
    prototypes?: ItemData[];
    themes?: ThemeResourceItem[];
    defaultThemeName?: string | null;
    onOpenPrototypeCreateDialog?: (options: PrototypeCreateDialogOpenOptions) => void;
    onRefreshPrototypes?: (preferredName?: string) => Promise<ItemData[]>;
}

export interface PresentationAreaActions {
    setCollapsed: (collapsed: boolean) => void;
    setViewMode: (mode: ViewMode) => void;
    handleEnterSelectedPrototypePreview?: () => void;
    setSelectedDeviceId: (id: string) => void;
    handleSelectPreviewSinglePreset: (preset: PreviewSinglePreset) => void;
    handleSelectCustomPreview: () => void;
    handleActivateSplitPreview: () => void;
    handleActivateMultiPagePreview: (pageCount?: number) => void;
    handleChangeMultiPageColumns: (columns: MultiPageColumns) => void;
    handleChangeCustomPreviewWidth: (width: number) => void;
    handleChangeCustomPreviewHeight: (height: number) => void;
    handleChangeSplitPreviewWidth: (pane: 'primary' | 'secondary', width: number) => void;
    handleChangeSplitPreviewHeight: (pane: 'primary' | 'secondary', height: number) => void;
    handleChangePreviewScaleMode: (mode: PreviewScaleMode) => void;
    handlePreviewContainerSizeChange: (width: number) => void;
    handleOpenWebEditor: () => void | Promise<void>;
    handleOpenPrototypeAnnotationSession: () => void | Promise<void>;
    handleCheckPrototypeAnnotationEnabled: () => Promise<boolean | null>;
    handleEnablePrototypeAnnotation: () => Promise<boolean>;
    handleCopyPrototypeAnnotationPrompt: () => void | Promise<void>;
    handleEnableDocEdit: (mode?: SpecQuickEditMode, options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean }) => void;
    handleSaveDocEdit: () => void;
    handleExitDocEdit: () => void;
    handleSwitchDocQuickEditMode: (mode: SpecQuickEditMode) => void;
    handleOpenDrawioResourceEditor: () => void | Promise<void>;
    handleCopyMarkdownPrompt: () => void | Promise<void>;
    handleReviewPanelToggle?: () => void | Promise<void>;
    handleSelectReviewReport?: (report: ReviewReportSummary) => void | Promise<void>;
    handleBackToReviewList?: () => void;
    handleCopyReviewReportPath?: (report: ReviewReportDetail) => void | Promise<void>;
    handleDeleteReviewReport?: (report: ReviewReportDetail) => void | Promise<void>;
    handleStartReview?: (kind: ReviewKind) => void | Promise<void>;
    handleRunReviewDirect?: (kind: ReviewKind) => void | Promise<boolean | void>;
    handleUploadReviewReport?: (files: File[], meta: { title?: string; reviewer?: string }) => void | Promise<void>;
    handleReviewLanSubmitEnabledChange?: (enabled: boolean) => void | Promise<void>;
    handleReviewAxhubSubmitEnabledChange?: (enabled: boolean) => void | Promise<void>;
    handleRunHostToolbarAction?: (action: CommentaryHostToolbarAction) => void | Promise<boolean>;
    handleRunPrototypePanePromptAction?: (
        pane: PreviewPane,
        action: PrototypePanePromptAction,
    ) => void | Promise<boolean>;
    handleRunQuickEditSaveAction?: (action: QuickEditSaveAction) => void | Promise<boolean>;
    handleExitWebEditor: () => void;
    handleRefreshElement: () => void;
    handleCopyLocalLink: () => void;
    handleCopyLANLink: () => void;
    getLANUrl: () => string;
    setQrCodeVisible: (visible: boolean) => void;
    handleCopyToFigma: () => void;
    handleCopyCurrentScreenshot: () => void | Promise<void>;
    handleExportMake: () => void;
    handleExportHtml: (options?: { includeSource?: boolean }) => void;
    handlePublishCloudTarget: (target: CloudPublishTarget) => void | Promise<void>;
    handleOpenCloudPublishSettings: (target?: ConfigurableCloudPublishTarget | 'publish-settings') => void;
    handleOpenAxhubPublishDialog: () => void | Promise<void>;
    currentPublishResourcePath: string;
    latestCloudPublishUrl: string;
    handleCopyLatestCloudPublishUrl: () => void | Promise<void>;
    setIsExportModalOpen: (open: boolean) => void;
    handleQuickCopyEditablePrototype: () => void;
    handleQuickCopyRuntimeComponent: () => void;
    handleQuickDownloadRuntimeCover: () => void;
    handleOpenAxureUsageGuide: () => void;
    handleOpenIdeFile: () => void | Promise<void>;
    handleOpenDocInIDE: () => void | Promise<void>;
    handleOpenPrototypeSpec: () => void | Promise<void>;
    handleOpenThemeInIDE: () => void | Promise<void>;
    handleOpenThemeDocInIDE: () => void | Promise<void>;
    handleOpenDataTableInIDE: () => void | Promise<void>;
    handleCopyCurrentAddress: () => void | Promise<void>;
    onSelectResourceFolder?: (folder: SidebarTreeNode) => void;
    onSelectResourceFolderItem?: (item: ItemData) => void;
    onOpenResourceFolderInSystem?: (folderPath: string) => void | Promise<void>;
    onToggleAssistant?: () => void;
    onStartCurrentProjectServer?: () => void | Promise<void>;
    onCopyStartServerErrorPrompt?: () => void | Promise<void>;
    setElementIframeSize: (size: { width: number; height: number }) => void;
    onStandalonePanelToggle?: () => void;
    setExcalidrawPropertyPanelMode?: (mode: ExcalidrawPropertyPanelMode) => void;
    setExcalidrawPropertyPanelPosition?: (position: ExcalidrawPropertyPanelPosition) => void;
    onAddCanvasElementToContext?: (items: CanvasElementContextInfo[]) => void;
    onCanvasAnnotationsChange?: (annotations: CanvasElementContextInfo[]) => void;
    onOpenCanvasInIDE?: (canvasFilePath: string) => void | Promise<void>;
    onOpenCanvasAgent?: () => void | Promise<void>;
    handleOpenProjectInIDE?: (ideOverride?: MainIDEPreference, targetPath?: string, projectId?: string) => boolean | Promise<boolean>;
    onOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;
    onOpenImageAiPanel?: () => void | Promise<void>;
    onOpenWebAgentInPanel?: (url: string) => boolean | void | Promise<boolean | void>;
    onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
    onCloseAiPanel?: () => void;
    onCloseWebAgentPanel?: () => void;
    onPreferredIDEChange?: (ide: MainIDEPreference) => void;
    onOpenAISettings?: () => void;
    onCreatePrototypeForDraftStart?: () => Promise<ItemData | null>;
    onUploadResourceFiles?: () => void;
    onCreateResourceCanvasFile?: () => void | Promise<void>;
    onCreateDrawioResourceFile?: () => void | Promise<void>;
    onOpenDesignImport?: () => void;
    onRefreshPrototypes?: (preferredName?: string) => Promise<ItemData[]>;
    agentRunConcurrency?: number;
    onSubmitCanvasAssistantPrompt?: (request: CanvasAiGenerationRequest) => Promise<CanvasAiGenerationResult | boolean> | CanvasAiGenerationResult | boolean;
    onAddCanvasScreenshotToAI?: (attachment: AssistantImageAttachmentPayload) => Promise<boolean> | boolean;
    onAddCanvasImageToAI?: (attachment: AssistantImageAttachmentPayload, promptText?: string) => Promise<boolean> | boolean;
}

export interface PresentationAreaGroupedProps {
    state: PresentationAreaState;
    actions: PresentationAreaActions;
}

export type PresentationAreaLegacyProps = PresentationAreaState & PresentationAreaActions;
export type PresentationAreaProps = PresentationAreaGroupedProps | PresentationAreaLegacyProps;
