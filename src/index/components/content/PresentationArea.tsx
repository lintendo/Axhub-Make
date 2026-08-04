import PresentationToolbar from './PresentationToolbar';
import ResponsiveSidebarTriggerButton from '../sidebar/ResponsiveSidebarTriggerButton';
import ContentAreaView from './ContentAreaView';
import UiReviewPanel from './UiReviewPanel';
import type {
    PresentationAreaLegacyProps,
    PresentationAreaProps,
} from '../../types/index-page.types';

function resolvePresentationAreaProps(props: PresentationAreaProps): PresentationAreaLegacyProps {
    if ('state' in props) {
        return {
            ...props.state,
            ...props.actions,
        };
    }

    return props;
}

export default function PresentationArea(rawProps: PresentationAreaProps) {
    const props = resolvePresentationAreaProps(rawProps);

    const isCanvasMode = props.contentMode === 'canvas' || props.viewMode === 'canvas';
    const isResourceFolderPreview = props.contentMode === 'doc' && Boolean(props.selectedResourceFolder);
    const isPreviewContentMode = props.contentMode === 'preview';
    const isPrototypeStartDraft = isPreviewContentMode && props.prototypeStartDraftActive === true && !props.selectedItem;
    const isResourceStartDraft = props.contentMode === 'doc' && props.resourceStartDraftActive === true && !props.selectedDoc;
    const isThemeStartDraft = props.contentMode === 'theme' && props.themeStartDraftActive === true && !props.selectedTheme;
    const isPrototypeStartPlaceholder = isPreviewContentMode && props.selectedItem?.placeholder === true && props.viewMode === 'demo';
    const shouldShowPresentationToolbar = !isCanvasMode
        && !isResourceFolderPreview
        && !isPrototypeStartDraft
        && !isResourceStartDraft
        && !isThemeStartDraft
        && !isPrototypeStartPlaceholder;
    const shouldShowAssistantPanel = props.reviewPanelOpen
        && props.viewMode !== 'canvas'
        && !isPrototypeStartDraft
        && !isResourceStartDraft
        && !isThemeStartDraft
        && !isPrototypeStartPlaceholder;

    return (
        <div className="relative flex flex-col flex-1 h-full min-h-0 min-w-0 bg-background">
            {shouldShowPresentationToolbar ? (
                <PresentationToolbar
                    collapsed={props.collapsed}
                    setCollapsed={props.setCollapsed}
                    selectedItem={props.selectedItem}
                    viewMode={props.viewMode}
                    activeTab={props.activeTab}
                    setViewMode={props.setViewMode}
                    selectedDeviceId={props.selectedDeviceId}
                    previewConfig={props.previewConfig}
                    deviceSegmentOptions={props.deviceSegmentOptions}
                    handleSelectPreviewSinglePreset={props.handleSelectPreviewSinglePreset}
                    handleSelectCustomPreview={props.handleSelectCustomPreview}
                    handleActivateSplitPreview={props.handleActivateSplitPreview}
                    handleActivateMultiPagePreview={props.handleActivateMultiPagePreview}
                    handleChangeMultiPageColumns={props.handleChangeMultiPageColumns}
                    handleChangeCustomPreviewWidth={props.handleChangeCustomPreviewWidth}
                    handleChangeCustomPreviewHeight={props.handleChangeCustomPreviewHeight}
                    handleChangeSplitPreviewWidth={props.handleChangeSplitPreviewWidth}
                    handleChangeSplitPreviewHeight={props.handleChangeSplitPreviewHeight}
                    handleChangePreviewScaleMode={props.handleChangePreviewScaleMode}
                    handleOpenWebEditor={props.handleOpenWebEditor}
                    handleExitWebEditor={props.handleExitWebEditor}
                    handleEnableDocEdit={props.handleEnableDocEdit}
                    handleSaveDocEdit={props.handleSaveDocEdit}
                    handleExitDocEdit={props.handleExitDocEdit}
                    handleSwitchDocQuickEditMode={props.handleSwitchDocQuickEditMode}
                    drawioResourceEditAvailable={props.drawioResourceEditAvailable}
                    handleOpenDrawioResourceEditor={props.handleOpenDrawioResourceEditor}
                    handleCopyMarkdownPrompt={props.handleCopyMarkdownPrompt}
                    handleRefreshElement={props.handleRefreshElement}
                    handleCopyToFigma={props.handleCopyToFigma}
                    handleCopyCurrentScreenshot={props.handleCopyCurrentScreenshot}
                    handleExportMake={props.handleExportMake}
                    handleExportHtml={props.handleExportHtml}
                    handlePublishCloudTarget={props.handlePublishCloudTarget}
                    handleOpenCloudPublishSettings={props.handleOpenCloudPublishSettings}
                    handleOpenAxhubPublishDialog={props.handleOpenAxhubPublishDialog}
                    currentPublishResourcePath={props.currentPublishResourcePath}
                    visibleCloudPublishTargets={props.visibleCloudPublishTargets}
                    latestCloudPublishUrl={props.latestCloudPublishUrl}
                    handleCopyLatestCloudPublishUrl={props.handleCopyLatestCloudPublishUrl}
                    setIsExportModalOpen={props.setIsExportModalOpen}
                    handleQuickCopyEditablePrototype={props.handleQuickCopyEditablePrototype}
                    handleOpenAxureUsageGuide={props.handleOpenAxureUsageGuide}
                    handleOpenIdeFile={props.handleOpenIdeFile}
                    handleOpenDocInIDE={props.handleOpenDocInIDE}
                    handleOpenPrototypeSpec={props.handleOpenPrototypeSpec}
                    handleOpenThemeInIDE={props.handleOpenThemeInIDE}
                    handleOpenDataTableInIDE={props.handleOpenDataTableInIDE}
                    preferredIDE={props.preferredIDE}
                    ideAvailability={props.ideAvailability}
                    quickEditAvailable={props.quickEditAvailable}
                    quickEditActive={props.quickEditActive}
                    prototypeAnnotationSessionActive={props.prototypeAnnotationSessionActive}
                    prototypeAnnotationEnabled={props.prototypeAnnotationEnabled}
                    prototypeAnnotationEnableLoading={props.prototypeAnnotationEnableLoading}
                    prototypeAnnotationPromptCopying={props.prototypeAnnotationPromptCopying}
                    handleOpenPrototypeAnnotationSession={props.handleOpenPrototypeAnnotationSession}
                    handleCheckPrototypeAnnotationEnabled={props.handleCheckPrototypeAnnotationEnabled}
                    handleEnablePrototypeAnnotation={props.handleEnablePrototypeAnnotation}
                    handleCopyPrototypeAnnotationPrompt={props.handleCopyPrototypeAnnotationPrompt}
                    docEditState={props.docEditState}
                    markdownPromptCopying={props.markdownPromptCopying}
                    quickEditRuntimeStatus={props.quickEditRuntimeStatus}
                    exportAvailability={props.exportAvailability}
                    hostToolbarState={props.hostToolbarState}
                    prototypeDecisionDataAvailable={props.prototypeDecisionDataAvailable}
                    handleRunHostToolbarAction={props.handleRunHostToolbarAction}
                    handleRunQuickEditSaveAction={props.handleRunQuickEditSaveAction}
                    contentMode={props.contentMode}
                    selectedDoc={props.selectedDoc}
                    selectedPrototypeSpec={props.selectedPrototypeSpec}
                    prototypeSpecSupported={props.prototypeSpecSupported}
                    prototypeSpecLoading={props.prototypeSpecLoading}
                    selectedTemplate={props.selectedTemplate}
                    selectedTheme={props.selectedTheme}
                    selectedDataTable={props.selectedDataTable}
                    startServerError={props.startServerError}
                    standalonePanelOpen={props.standalonePanelOpen}
                    onStandalonePanelToggle={props.onStandalonePanelToggle}
                    reviewPanelOpen={props.reviewPanelOpen}
                    onReviewPanelToggle={props.handleReviewPanelToggle}
                    onOpenAISettings={props.onOpenAISettings}
                />
            ) : (
                <div className="ax-sidebar-compact-fallback-trigger">
                    <ResponsiveSidebarTriggerButton
                        collapsedOnly
                        collapsed={props.collapsed}
                        setCollapsed={props.setCollapsed}
                        className="bg-background/90 shadow-sm"
                    />
                </div>
            )}
            <div className="flex flex-1 min-h-0">
                <div className="flex-1 min-h-0 relative">
                    <ContentAreaView
                        containerRef={props.containerRef}
                        previewIframeRef={props.previewIframeRef}
                        secondaryPreviewIframeRef={props.secondaryPreviewIframeRef}
                        selectedItem={props.selectedItem}
                        prototypeStartDraftActive={props.prototypeStartDraftActive}
                        resourceStartDraftActive={props.resourceStartDraftActive}
                        themeStartDraftActive={props.themeStartDraftActive}
                        activeTab={props.activeTab}
                        previewConfig={props.previewConfig}
                        handleChangeMultiPageColumns={props.handleChangeMultiPageColumns}
                        handleSelectPreviewSinglePreset={props.handleSelectPreviewSinglePreset}
                        handleSelectCustomPreview={props.handleSelectCustomPreview}
                        handleActivateMultiPagePreview={props.handleActivateMultiPagePreview}
                        handleChangeCustomPreviewWidth={props.handleChangeCustomPreviewWidth}
                        handleChangeCustomPreviewHeight={props.handleChangeCustomPreviewHeight}
                        handleChangePreviewScaleMode={props.handleChangePreviewScaleMode}
                        handleChangeSplitPreviewWidth={props.handleChangeSplitPreviewWidth}
                        handleChangeSplitPreviewHeight={props.handleChangeSplitPreviewHeight}
                        handlePreviewContainerSizeChange={props.handlePreviewContainerSizeChange}
                        quickEditActive={props.quickEditActive}
                        onRunPrototypePanePromptAction={props.handleRunPrototypePanePromptAction}
                        currentDevice={props.currentDevice}
                        displaySize={props.displaySize}
                        scale={props.scale}
                        elementIframeKey={props.elementIframeKey}
                        primaryIframeUrl={props.primaryIframeUrl}
                        secondaryIframeUrl={props.secondaryIframeUrl}
                        onPreviewIframeLoad={props.handlePreviewIframeLoad}
                        elementIframeSize={props.elementIframeSize}
                        setElementIframeSize={props.setElementIframeSize}
                        viewMode={props.viewMode}
                        setViewMode={props.setViewMode}
                        onEnterSelectedPrototypePreview={props.handleEnterSelectedPrototypePreview}
                        contentMode={props.contentMode}
                        docsItems={props.docsItems}
                        sidebarTrees={props.sidebarTrees}
                        selectedDoc={props.selectedDoc}
                        selectedPrototypeSpec={props.selectedPrototypeSpec}
                        selectedResourceFolder={props.selectedResourceFolder}
                        selectedTemplate={props.selectedTemplate}
                        isDarkMode={props.isDarkMode}
                        selectedTheme={props.selectedTheme}
                        selectedDataTable={props.selectedDataTable}
                        projectRuntimeStatus={props.projectRuntimeStatus}
                        projectRuntimeStatusLoading={props.projectRuntimeStatusLoading}
                        projectAccessDeniedReason={props.projectAccessDeniedReason}
                        hasPrototypeItems={props.hasPrototypeItems}
                        hasDocItems={props.hasDocItems}
                        onStartMakeProject={props.onStartCurrentProjectServer}
                        onCopyStartServerErrorPrompt={props.onCopyStartServerErrorPrompt}
                        startServerLoading={props.startServerLoading}
                        startServerError={props.startServerError}
                        collapsed={props.collapsed}
                        setCollapsed={props.setCollapsed}
                        selectedCanvas={props.selectedCanvas}
                        canvasItems={props.canvasItems}
                        excalidrawPropertyPanelMode={props.excalidrawPropertyPanelMode}
                        setExcalidrawPropertyPanelMode={props.setExcalidrawPropertyPanelMode}
                        excalidrawPropertyPanelPosition={props.excalidrawPropertyPanelPosition}
                        setExcalidrawPropertyPanelPosition={props.setExcalidrawPropertyPanelPosition}
                        bridgeConnected={props.bridgeConnected}
                        assistantVisible={props.assistantVisible}
                        onToggleAssistant={props.onToggleAssistant}
                        onAddToContext={props.onAddCanvasElementToContext}
                        onAddCanvasScreenshotToAI={props.onAddCanvasScreenshotToAI}
                        onAddCanvasImageToAI={props.onAddCanvasImageToAI}
                        onAnnotationsChange={props.onCanvasAnnotationsChange}
                        onOpenCanvasInIDE={props.onOpenCanvasInIDE}
                        onOpenCanvasAgent={props.onOpenCanvasAgent}
                        onSelectResourceFolder={props.onSelectResourceFolder}
                        onSelectResourceFolderItem={props.onSelectResourceFolderItem}
                        onOpenResourceFolderInSystem={props.onOpenResourceFolderInSystem}
                        preferredIDE={props.preferredIDE}
                        activeProjectId={props.activeProjectId}
                        ideAvailability={props.ideAvailability}
                        agentAvailability={props.agentAvailability}
                        webAgentPanelOpen={props.webAgentPanelOpen}
                        aiPanelMode={props.aiPanelMode}
                        onOpenProjectInIDE={props.handleOpenProjectInIDE}
                        onOpenAcpWebAgent={props.onOpenAcpWebAgent}
                        onOpenImageAiPanel={props.onOpenImageAiPanel}
                        onOpenWebAgentInPanel={props.onOpenWebAgentInPanel}
                        onExecutePrompt={props.onExecutePrompt}
                        onCloseAiPanel={props.onCloseAiPanel}
                        onCloseWebAgentPanel={props.onCloseWebAgentPanel}
                        onPreferredIDEChange={props.onPreferredIDEChange}
                        assistantApiBaseUrl={props.assistantApiBaseUrl}
                        assistantProjectPath={props.assistantProjectPath}
                        preferredPromptClient={props.preferredPromptClient}
                        prototypes={props.prototypes}
                        themes={props.themes}
                        defaultThemeName={props.defaultThemeName}
                        onOpenPrototypeCreateDialog={props.onOpenPrototypeCreateDialog}
                        onOpenAISettings={props.onOpenAISettings}
                        onCreatePrototypeForDraftStart={props.onCreatePrototypeForDraftStart}
                        onUploadResourceFiles={props.onUploadResourceFiles}
                        onCreateResourceCanvasFile={props.onCreateResourceCanvasFile}
                        onCreateDrawioResourceFile={props.onCreateDrawioResourceFile}
                        onOpenDesignImport={props.onOpenDesignImport}
                        onRefreshPrototypes={props.onRefreshPrototypes}
                        agentRunConcurrency={props.agentRunConcurrency}
                        onSubmitCanvasAssistantPrompt={props.onSubmitCanvasAssistantPrompt}
                    />
                </div>
                {shouldShowAssistantPanel ? (
                    <UiReviewPanel
                        reports={props.reviewReports || []}
                        selectedReport={props.selectedReviewReport || null}
                        activeReportId={props.activeReviewReportId}
                        reviewPrompt={props.reviewPrompt || ''}
                        reviewDocumentPath={props.reviewDocumentPath}
                        reviewPrompts={props.reviewPrompts}
                        reviewDocumentPaths={props.reviewDocumentPaths}
                        loading={props.reviewLoading}
                        detailLoading={props.reviewDetailLoading}
                        uploadLoading={props.reviewUploadLoading}
                        error={props.reviewError}
                        lanSubmitConfig={props.reviewLanSubmitConfig}
                        axhubSubmitConfig={props.reviewAxhubSubmitConfig}
                        onExecutePrompt={props.onExecutePrompt}
                        onSelectReport={(report) => props.handleSelectReviewReport?.(report)}
                        onBackToList={() => props.handleBackToReviewList?.()}
                        onCopyReportPath={(report) => props.handleCopyReviewReportPath?.(report)}
                        onDeleteReport={(report) => props.handleDeleteReviewReport?.(report)}
                        onStartReview={(kind) => props.handleStartReview?.(kind)}
                        onRunReviewDirect={(kind) => props.handleRunReviewDirect?.(kind)}
                        onUploadReport={(files, meta) => props.handleUploadReviewReport?.(files, meta)}
                        onLanSubmitEnabledChange={(enabled) => props.handleReviewLanSubmitEnabledChange?.(enabled)}
                        onAxhubSubmitEnabledChange={(enabled) => props.handleReviewAxhubSubmitEnabledChange?.(enabled)}
                    />
                ) : null}
            </div>
        </div>
    );
}
