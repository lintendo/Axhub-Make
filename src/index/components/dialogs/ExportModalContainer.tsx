import React from 'react';
import ExportModal from './ExportModalView';
import type { ExportActions, ExportState } from '../../types/index-page.types';

interface ExportModalContainerProps {
    state: ExportState;
    actions: ExportActions;
}

export default function ExportModalContainer({ state, actions }: ExportModalContainerProps) {
    return (
        <ExportModal
            open={state.open}
            projectId={state.projectId}
            preferencesStorageKey={state.preferencesStorageKey}
            onClose={actions.onClose}
            imageConfig={state.imageConfig}
            setImageConfig={actions.setImageConfig}
            axureCopyOptions={state.axureCopyOptions}
            setAxureCopyOptions={actions.setAxureCopyOptions}
            onDimensionChange={actions.onDimensionChange}
            onSwapDimensions={actions.onSwapDimensions}
            onDimensionBlur={actions.onDimensionBlur}
            isExporting={state.isExporting}
            onExport={actions.onExport}
            onCopyRuntimeComponent={actions.onCopyRuntimeComponent}
            onCopyToAxure={actions.onCopyToAxure}
            onCopyConfig={actions.onCopyConfig}
            activeTab={state.activeTab}
            itemName={state.itemName}
            sourceTargetPath={state.sourceTargetPath}
            exportAvailability={state.exportAvailability}
            preferredPromptClient={state.preferredPromptClient}
            preferredIDE={state.preferredIDE}
            ideAvailability={state.ideAvailability}
            assistantOpen={state.assistantOpen}
            onExecutePrompt={state.onExecutePrompt}
            initialReviewResult={state.initialReviewResult}
            onInitialReviewHandled={actions.onInitialReviewHandled}
        />
    );
}
