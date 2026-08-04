import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AiPanelMode, PresentationAreaGroupedProps, PrototypeCreateDialogOpenOptions } from '../../types/index-page.types';
import type { ViewMode } from '../../types';
import type { ExcalidrawPropertyPanelMode, ExcalidrawPropertyPanelPosition } from '../../utils/excalidrawUiMode';
import type { CanvasElementContextInfo } from '../../components/content/canvas-embeds/AnnotationOverlay';
import type { AcpProvider } from '@/common/assistant-context/types';
import type { CanvasAiGenerationRequest, CanvasAiGenerationResult } from '../../domains/ai-generation/CanvasAiGenerationTool';
import type { AssistantImageAttachmentPayload } from '../../domains/assistant/assistantContextPayload';
import type { SettingsDialogInitialTab } from '../../components/SettingsDialog';

interface UseIndexPagePresentationPropsBuilderParams {
        state: {
            collapsed: boolean;
            selectedItem: any;
            prototypeStartDraftActive?: boolean;
            resourceStartDraftActive?: boolean;
            themeStartDraftActive?: boolean;
            viewMode: ViewMode;
        activeTab: 'prototypes';
        assistantVisible: boolean;
        isDarkMode: boolean;
        contentMode: 'preview' | 'prototype-spec' | 'doc' | 'template' | 'canvas' | 'theme' | 'data';
        docsItems?: any[];
        sidebarTrees?: any;
        selectedDoc: any;
        selectedPrototypeSpec?: any;
        prototypeSpecSupported?: boolean;
        prototypeSpecLoading?: boolean;
        selectedResourceFolder?: any;
        selectedCanvas: any;
        canvasItems?: any[];
        selectedTemplate: any;
        selectedTheme: any;
        selectedDataTable: any;
        preferredPromptClient: any;
        preferredIDE: any;
        ideAvailability?: any;
        agentAvailability?: any;
        projectRuntimeStatus: any;
        projectRuntimeStatusLoading: boolean;
        projectAccessDeniedReason?: string;
        lanAccessAllowed?: boolean;
        hasPrototypeItems: boolean;
        hasDocItems: boolean;
        excalidrawPropertyPanelMode: ExcalidrawPropertyPanelMode;
        excalidrawPropertyPanelPosition: ExcalidrawPropertyPanelPosition;
        bridgeConnected?: boolean;
        activeProjectId?: string | null;
        webAgentPanelOpen?: boolean;
        aiPanelMode?: AiPanelMode;
        assistantApiBaseUrl?: string;
        assistantProjectPath?: string;
        prototypes?: any[];
        themes?: any[];
        defaultThemeName?: string | null;
        onOpenPrototypeCreateDialog?: (options: PrototypeCreateDialogOpenOptions) => void;
    };
    preview: any;
    ui?: {
        startServerLoading?: boolean;
        startServerError?: string;
    };
    actions: {
        setCollapsed: Dispatch<SetStateAction<boolean>>;
        setViewMode: Dispatch<SetStateAction<ViewMode>>;
        handleEnterSelectedPrototypePreview?: () => void;
        handleToggleAssistant: () => void;
        handleStartCurrentProjectServer?: () => void | Promise<void>;
        handleCopyStartServerErrorPrompt?: () => void | Promise<void>;
        handleOpenIdeFile: () => void | Promise<void>;
        handleOpenSelectedDocInIDE: (itemOverride?: any, kindOverride?: 'doc' | 'template') => Promise<void>;
        handleOpenPrototypeSpec: () => void | Promise<void>;
        handlePrototypeSpecPreviewReady?: () => void;
        handleOpenSelectedThemeInIDE: (item?: any) => Promise<void>;
        handleOpenSelectedThemeDocInIDE: (item?: any) => Promise<void>;
        handleOpenSelectedDataTableInIDE: (item?: any) => Promise<void>;
        handleCopyCurrentAddress: () => void | Promise<void>;
        onSelectResourceFolder?: (folder: any) => void;
        onSelectResourceFolderItem?: (item: any) => void;
        onOpenResourceFolderInSystem?: (folderPath: string) => void | Promise<void>;
        setExcalidrawPropertyPanelMode?: (mode: ExcalidrawPropertyPanelMode) => void;
        setExcalidrawPropertyPanelPosition?: (position: ExcalidrawPropertyPanelPosition) => void;
        onAddCanvasElementToContext?: (items: CanvasElementContextInfo[]) => void;
        onAddCanvasScreenshotToAI?: (attachment: AssistantImageAttachmentPayload) => Promise<boolean> | boolean;
        onAddCanvasImageToAI?: (attachment: AssistantImageAttachmentPayload, promptText?: string) => Promise<boolean> | boolean;
        onCanvasAnnotationsChange?: (annotations: CanvasElementContextInfo[]) => void;
        onOpenCanvasInIDE?: (canvasFilePath: string) => void | Promise<void>;
        onOpenCanvasAgent?: () => void | Promise<void>;
        handleOpenProjectInIDE?: (ideOverride?: any, targetPath?: string, projectId?: string) => boolean | Promise<boolean>;
        onOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;
        onOpenImageAiPanel?: () => void | Promise<void>;
        onOpenWebAgentInPanel?: (url: string) => boolean | void | Promise<boolean | void>;
        onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
        onCloseAiPanel?: () => void;
        onCloseWebAgentPanel?: () => void;
        onPreferredIDEChange?: (ide: any) => void;
        openSettingsDialog?: (tab?: SettingsDialogInitialTab) => void;
        onCreatePrototypeForDraftStart?: () => Promise<any | null>;
        onUploadResourceFiles?: () => void;
        onCreateResourceCanvasFile?: () => void | Promise<void>;
        onCreateDrawioResourceFile?: () => void | Promise<void>;
        onOpenDesignImport?: () => void;
        onRefreshPrototypes?: (preferredName?: string) => Promise<any[]>;
        agentRunConcurrency?: number;
        onSubmitCanvasAssistantPrompt?: (request: CanvasAiGenerationRequest) => Promise<CanvasAiGenerationResult | boolean> | CanvasAiGenerationResult | boolean;
    };
}

export function useIndexPagePresentationPropsBuilder({
    state,
    preview,
    ui,
    actions,
}: UseIndexPagePresentationPropsBuilderParams): PresentationAreaGroupedProps {
    return useMemo(() => ({
        state: {
            collapsed: state.collapsed,
            selectedItem: state.selectedItem,
            prototypeStartDraftActive: state.prototypeStartDraftActive,
            resourceStartDraftActive: state.resourceStartDraftActive,
            themeStartDraftActive: state.themeStartDraftActive,
            viewMode: state.viewMode,
            activeTab: state.activeTab,
            selectedDeviceId: preview.selectedDeviceId,
            previewConfig: preview.previewConfig,
            deviceSegmentOptions: preview.deviceSegmentOptions,
            visibleCloudPublishTargets: preview.visibleCloudPublishTargets,
            qrCodeVisible: preview.qrCodeVisible,
            quickEditAvailable: preview.quickEditAvailable,
            quickEditActive: preview.editorStatus.mode === 'quickEdit',
            prototypeAnnotationSessionActive: preview.prototypeAnnotationSessionActive,
            prototypeAnnotationEnabled: preview.prototypeAnnotationEnabled,
            prototypeAnnotationEnableLoading: preview.prototypeAnnotationEnableLoading,
            prototypeAnnotationPromptCopying: preview.prototypeAnnotationPromptCopying,
            docEditState: preview.docEditState,
            markdownPromptCopying: preview.markdownPromptCopying,
            drawioResourceEditAvailable: preview.drawioResourceEditAvailable,
            reviewPanelOpen: preview.reviewPanelOpen,
            activeReviewReportId: preview.activeReviewReportId,
            reviewReports: preview.reviewReports,
            selectedReviewReport: preview.selectedReviewReport,
            reviewLoading: preview.reviewLoading,
            reviewDetailLoading: preview.reviewDetailLoading,
            reviewUploadLoading: preview.reviewUploadLoading,
            reviewError: preview.reviewError,
            reviewLanSubmitConfig: preview.reviewLanSubmitConfig,
            reviewAxhubSubmitConfig: preview.reviewAxhubSubmitConfig,
            reviewPrompt: preview.reviewPrompt,
            reviewDocumentPath: preview.reviewDocumentPath,
            reviewPrompts: preview.reviewPrompts,
            reviewDocumentPaths: preview.reviewDocumentPaths,
            quickEditRuntimeStatus: preview.quickEditRuntimeStatus,
            exportAvailability: preview.exportAvailability,
            editorMode: preview.editorStatus.mode,
            hostToolbarState: preview.hostToolbarState,
            prototypeDecisionDataAvailable: preview.prototypeDecisionDataAvailable,
            allowLAN: state.lanAccessAllowed !== false,
            assistantVisible: state.assistantVisible,
            containerRef: preview.containerRef,
            previewIframeRef: preview.previewIframeRef,
            secondaryPreviewIframeRef: preview.secondaryPreviewIframeRef,
            handlePreviewIframeLoad: (iframe?: HTMLIFrameElement | null) => {
                preview.handlePreviewIframeLoad(iframe);
                if (state.contentMode === 'prototype-spec') {
                    actions.handlePrototypeSpecPreviewReady?.();
                }
            },
            currentDevice: preview.currentDevice,
            displaySize: preview.displaySize,
            scale: preview.scale,
            elementIframeKey: preview.elementIframeKey,
            iframeUrl: preview.iframeUrl,
            primaryIframeUrl: preview.primaryIframeUrl,
            secondaryIframeUrl: preview.secondaryIframeUrl,
            localShareUrl: preview.localShareUrl,
            elementIframeSize: preview.elementIframeSize,
            contentMode: state.contentMode,
            docsItems: state.docsItems || [],
            sidebarTrees: state.sidebarTrees,
            selectedDoc: state.selectedDoc,
            selectedPrototypeSpec: state.selectedPrototypeSpec,
            prototypeSpecSupported: state.prototypeSpecSupported,
            prototypeSpecLoading: state.prototypeSpecLoading,
            selectedResourceFolder: state.selectedResourceFolder,
            selectedCanvas: state.selectedCanvas,
            canvasItems: state.canvasItems || [],
            selectedTemplate: state.selectedTemplate,
            isDarkMode: state.isDarkMode,
            selectedTheme: state.selectedTheme,
            selectedDataTable: state.selectedDataTable,
            preferredPromptClient: state.preferredPromptClient,
            preferredIDE: state.preferredIDE,
            ideAvailability: state.ideAvailability,
            agentAvailability: state.agentAvailability,
            projectRuntimeStatus: state.projectRuntimeStatus,
            projectRuntimeStatusLoading: state.projectRuntimeStatusLoading,
            projectAccessDeniedReason: state.projectAccessDeniedReason,
            hasPrototypeItems: state.hasPrototypeItems,
            hasDocItems: state.hasDocItems,
            excalidrawPropertyPanelMode: state.excalidrawPropertyPanelMode,
            excalidrawPropertyPanelPosition: state.excalidrawPropertyPanelPosition,
            startServerLoading: Boolean(ui?.startServerLoading),
            startServerError: ui?.startServerError || '',
            standalonePanelOpen: preview.standalonePanelOpen,
            bridgeConnected: state.bridgeConnected,
            activeProjectId: state.activeProjectId,
            webAgentPanelOpen: state.webAgentPanelOpen,
            aiPanelMode: state.aiPanelMode,
            assistantApiBaseUrl: state.assistantApiBaseUrl,
            assistantProjectPath: state.assistantProjectPath,
            prototypes: state.prototypes || [],
            themes: state.themes || [],
            defaultThemeName: state.defaultThemeName,
            onOpenPrototypeCreateDialog: state.onOpenPrototypeCreateDialog,
        },
        actions: {
            setCollapsed: actions.setCollapsed,
            setViewMode: actions.setViewMode,
            handleEnterSelectedPrototypePreview: actions.handleEnterSelectedPrototypePreview,
            setSelectedDeviceId: preview.setSelectedDeviceId,
            handleSelectPreviewSinglePreset: preview.handleSelectPreviewSinglePreset,
            handleSelectCustomPreview: preview.handleSelectCustomPreview,
            handleActivateSplitPreview: preview.handleActivateSplitPreview,
            handleActivateMultiPagePreview: preview.handleActivateMultiPagePreview,
            handleChangeMultiPageColumns: preview.handleChangeMultiPageColumns,
            handleChangeCustomPreviewWidth: preview.handleChangeCustomPreviewWidth,
            handleChangeCustomPreviewHeight: preview.handleChangeCustomPreviewHeight,
            handleChangeSplitPreviewWidth: preview.handleChangeSplitPreviewWidth,
            handleChangeSplitPreviewHeight: preview.handleChangeSplitPreviewHeight,
            handleChangePreviewScaleMode: preview.handleChangePreviewScaleMode,
            handlePreviewContainerSizeChange: preview.handlePreviewContainerSizeChange,
            handleOpenWebEditor: preview.handleOpenWebEditor,
            handleOpenPrototypeAnnotationSession: preview.handleOpenPrototypeAnnotationSession,
            handleCheckPrototypeAnnotationEnabled: preview.handleCheckPrototypeAnnotationEnabled,
            handleEnablePrototypeAnnotation: preview.handleEnablePrototypeAnnotation,
            handleCopyPrototypeAnnotationPrompt: preview.handleCopyPrototypeAnnotationPrompt,
            handleEnableDocEdit: preview.handleEnableDocEdit,
            handleSaveDocEdit: preview.handleSaveDocEdit,
            handleExitDocEdit: preview.handleExitDocEdit,
            handleSwitchDocQuickEditMode: preview.handleSwitchDocQuickEditMode,
            handleOpenDrawioResourceEditor: preview.handleOpenDrawioResourceEditor,
            handleCopyMarkdownPrompt: preview.handleCopyMarkdownPrompt,
            handleReviewPanelToggle: preview.handleReviewPanelToggle,
            handleSelectReviewReport: preview.handleSelectReviewReport,
            handleBackToReviewList: preview.handleBackToReviewList,
            handleStartReview: preview.handleStartReview,
            handleRunReviewDirect: preview.handleRunReviewDirect,
            handleUploadReviewReport: preview.handleUploadReviewReport,
            handleReviewLanSubmitEnabledChange: preview.handleReviewLanSubmitEnabledChange,
            handleReviewAxhubSubmitEnabledChange: preview.handleReviewAxhubSubmitEnabledChange,
            handleRunHostToolbarAction: preview.runHostToolbarAction,
            handleRunPrototypePanePromptAction: preview.runPrototypePanePromptAction,
            handleRunQuickEditSaveAction: preview.runQuickEditSaveAction,
            handleExitWebEditor: preview.handleExitWebEditor,
            handleRefreshElement: preview.handleRefreshElement,
            handleCopyLocalLink: preview.handleCopyLocalLink,
            handleCopyLANLink: preview.handleCopyLANLink,
            getLANUrl: preview.getLANUrl,
            setQrCodeVisible: preview.setQrCodeVisible,
            handleCopyToFigma: preview.handleCopyToFigma,
            handleCopyCurrentScreenshot: preview.handleCopyCurrentScreenshot,
            handleExportMake: preview.handleExportMake,
            handleExportHtml: preview.handleExportHtml,
            handlePublishCloudTarget: preview.handlePublishCloudTarget,
            handleOpenCloudPublishSettings: preview.handleOpenCloudPublishSettings,
            handleOpenAxhubPublishDialog: preview.handleOpenAxhubPublishDialog,
            currentPublishResourcePath: preview.currentPublishResourcePath,
            latestCloudPublishUrl: preview.latestCloudPublishUrl,
            handleCopyLatestCloudPublishUrl: preview.handleCopyLatestCloudPublishUrl,
            setIsExportModalOpen: preview.setIsExportModalOpen,
            handleQuickCopyEditablePrototype: preview.handleQuickCopyEditablePrototype,
            handleQuickCopyRuntimeComponent: preview.handleQuickCopyRuntimeComponent,
            handleQuickDownloadRuntimeCover: preview.handleQuickDownloadRuntimeCover,
            handleOpenAxureUsageGuide: preview.handleOpenAxureUsageGuide,
            handleOpenIdeFile: actions.handleOpenIdeFile,
            handleOpenDocInIDE: state.contentMode === 'prototype-spec'
                ? () => actions.handleOpenSelectedDocInIDE(state.selectedPrototypeSpec, 'doc')
                : actions.handleOpenSelectedDocInIDE,
            handleOpenPrototypeSpec: actions.handleOpenPrototypeSpec,
            handleOpenThemeInIDE: actions.handleOpenSelectedThemeInIDE,
            handleOpenThemeDocInIDE: actions.handleOpenSelectedThemeDocInIDE,
            handleOpenDataTableInIDE: actions.handleOpenSelectedDataTableInIDE,
            handleCopyCurrentAddress: actions.handleCopyCurrentAddress,
            onSelectResourceFolder: actions.onSelectResourceFolder,
            onSelectResourceFolderItem: actions.onSelectResourceFolderItem,
            onOpenResourceFolderInSystem: actions.onOpenResourceFolderInSystem,
            onToggleAssistant: actions.handleToggleAssistant,
            onStartCurrentProjectServer: actions.handleStartCurrentProjectServer,
            onCopyStartServerErrorPrompt: actions.handleCopyStartServerErrorPrompt,
            setElementIframeSize: preview.setElementIframeSize,
            onStandalonePanelToggle: preview.handleStandalonePanelToggle,
            setExcalidrawPropertyPanelMode: actions.setExcalidrawPropertyPanelMode,
            setExcalidrawPropertyPanelPosition: actions.setExcalidrawPropertyPanelPosition,
            onAddCanvasElementToContext: actions.onAddCanvasElementToContext,
            onAddCanvasScreenshotToAI: actions.onAddCanvasScreenshotToAI,
            onAddCanvasImageToAI: actions.onAddCanvasImageToAI,
            onCanvasAnnotationsChange: actions.onCanvasAnnotationsChange,
            onOpenCanvasInIDE: actions.onOpenCanvasInIDE,
            onOpenCanvasAgent: actions.onOpenCanvasAgent,
            handleOpenProjectInIDE: actions.handleOpenProjectInIDE,
            onOpenAcpWebAgent: actions.onOpenAcpWebAgent,
            onOpenImageAiPanel: actions.onOpenImageAiPanel,
            onOpenWebAgentInPanel: actions.onOpenWebAgentInPanel,
            onExecutePrompt: actions.onExecutePrompt,
            onCloseAiPanel: actions.onCloseAiPanel,
            onCloseWebAgentPanel: actions.onCloseWebAgentPanel,
            onPreferredIDEChange: actions.onPreferredIDEChange,
            onOpenAISettings: actions.openSettingsDialog ? () => actions.openSettingsDialog?.('ai') : undefined,
            onCreatePrototypeForDraftStart: actions.onCreatePrototypeForDraftStart,
            onUploadResourceFiles: actions.onUploadResourceFiles,
            onCreateResourceCanvasFile: actions.onCreateResourceCanvasFile,
            onCreateDrawioResourceFile: actions.onCreateDrawioResourceFile,
            onOpenDesignImport: actions.onOpenDesignImport,
            onRefreshPrototypes: actions.onRefreshPrototypes,
            agentRunConcurrency: actions.agentRunConcurrency,
            onSubmitCanvasAssistantPrompt: actions.onSubmitCanvasAssistantPrompt,
        },
    }), [actions, preview, state, ui]) satisfies PresentationAreaGroupedProps;
}
