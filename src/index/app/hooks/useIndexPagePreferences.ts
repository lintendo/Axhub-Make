import { useCallback, useEffect, useState } from 'react';

import { apiService } from '../../services/index.api';
import { requireProjectScope } from '../../services/projectScope';
import { normalizePromptClientPreference } from '@/common/promptExecution';
import type { PromptClientPreference } from '../../types';
import type { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type { RuntimeAgentAvailability } from '../../../common/agent';
import type { AssistantImageGenerationConfig } from '../../domains/assistant/assistantAcpContext';
import {
    persistExcalidrawPropertyPanelModePreference,
    persistExcalidrawPropertyPanelPositionPreference,
    sanitizeExcalidrawPropertyPanelMode,
    sanitizeExcalidrawPropertyPanelPosition,
    type ExcalidrawPropertyPanelMode,
    type ExcalidrawPropertyPanelPosition,
} from '../../utils/excalidrawUiMode';

const EMPTY_AGENT_AVAILABILITY: RuntimeAgentAvailability = { cli: {}, localApp: {}, web: {} };

function sanitizeAgentRunConcurrency(value: unknown): number {
    const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
    if (!Number.isFinite(numeric)) {
        return 5;
    }
    return Math.min(10, Math.max(1, Math.trunc(numeric)));
}

export interface UseIndexPagePreferencesParams {
    setDefaultThemeName: (name: string | null) => void;
    activeProjectId?: string | null;
    enabled?: boolean;
    onProjectConfigSaved?: () => void | Promise<void>;
    onExcalidrawPropertyPanelModeLoaded?: (mode: ExcalidrawPropertyPanelMode) => void;
    onExcalidrawPropertyPanelPositionLoaded?: (position: ExcalidrawPropertyPanelPosition) => void;
}

export interface UseIndexPagePreferencesResult {
    conversationPromptClient: PromptClientPreference;
    conversationModel: string | null;
    preferredIDE: MainIDEPreference;
    ideAvailability: IDEAvailabilityMap;
    agentAvailability: RuntimeAgentAvailability;
    assistantImageGenerationConfig: AssistantImageGenerationConfig | null;
    annotationPromptClient: PromptClientPreference;
    annotationModel: string | null;
    canvasPromptClient: PromptClientPreference;
    canvasModel: string | null;
    agentRunConcurrency: number;
    autoClearCompletedComments: boolean;
    initialPreferencesLoaded: boolean;
    setPreferredIDE: (ide: MainIDEPreference) => void;
    handleSettingsSaved: () => void;
}

export function useIndexPagePreferences({
    setDefaultThemeName,
    activeProjectId,
    enabled = true,
    onProjectConfigSaved,
    onExcalidrawPropertyPanelModeLoaded,
    onExcalidrawPropertyPanelPositionLoaded,
}: UseIndexPagePreferencesParams): UseIndexPagePreferencesResult {
    const [conversationPromptClient, setConversationPromptClient] = useState<PromptClientPreference>(null);
    const [conversationModel, setConversationModel] = useState<string | null>(null);
    const [preferredIDE, setPreferredIDE] = useState<MainIDEPreference>(null);
    const [ideAvailability, setIDEAvailability] = useState<IDEAvailabilityMap>({});
    const [agentAvailability, setAgentAvailability] = useState<RuntimeAgentAvailability>(EMPTY_AGENT_AVAILABILITY);
    const [assistantImageGenerationConfig, setAssistantImageGenerationConfig] = useState<AssistantImageGenerationConfig | null>(null);
    const [annotationPromptClient, setAnnotationPromptClient] = useState<PromptClientPreference>(null);
    const [annotationModel, setAnnotationModel] = useState<string | null>(null);
    const [canvasPromptClient, setCanvasPromptClient] = useState<PromptClientPreference>(null);
    const [canvasModel, setCanvasModel] = useState<string | null>(null);
    const [agentRunConcurrency, setAgentRunConcurrency] = useState(5);
    const [autoClearCompletedComments, setAutoClearCompletedComments] = useState(true);
    const [initialPreferencesLoaded, setInitialPreferencesLoaded] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setInitialPreferencesLoaded(false);
            return undefined;
        }
        if (!activeProjectId?.trim()) {
            setInitialPreferencesLoaded(false);
            return undefined;
        }

        let canceled = false;
        apiService.getBootstrapConfig(requireProjectScope(activeProjectId))
            .then((config) => {
                if (canceled) return;
                setConversationPromptClient(normalizePromptClientPreference(config?.automation?.conversationPromptClient));
                setConversationModel(config?.automation?.conversationModel || null);
                setPreferredIDE(config?.automation?.defaultIDE || null);
                setAssistantImageGenerationConfig(config?.ai?.imageGeneration || null);
                setAnnotationPromptClient(normalizePromptClientPreference(config?.automation?.annotationPromptClient));
                setAnnotationModel(config?.automation?.annotationModel || null);
                setCanvasPromptClient(normalizePromptClientPreference(config?.automation?.canvasPromptClient));
                setCanvasModel(config?.automation?.canvasModel || null);
                setAgentRunConcurrency(sanitizeAgentRunConcurrency(config?.automation?.agentRunConcurrency));
                setAutoClearCompletedComments(config?.automation?.autoClearCompletedComments !== false);
                setInitialPreferencesLoaded(true);
                setDefaultThemeName((config as any)?.projectDefaults?.defaultTheme || null);
                onExcalidrawPropertyPanelModeLoaded?.(persistExcalidrawPropertyPanelModePreference(
                    sanitizeExcalidrawPropertyPanelMode(config?.uiPreferences?.excalidrawPropertyPanelMode ?? config?.uiPreferences?.excalidrawUiMode),
                ));
                onExcalidrawPropertyPanelPositionLoaded?.(persistExcalidrawPropertyPanelPositionPreference(
                    sanitizeExcalidrawPropertyPanelPosition(config?.uiPreferences?.excalidrawPropertyPanelPosition),
                ));
            })
            .catch(() => {
                if (!canceled) {
                    setConversationPromptClient(null);
                    setConversationModel(null);
                    setPreferredIDE(null);
                    setAssistantImageGenerationConfig(null);
                    setAnnotationPromptClient(null);
                    setAnnotationModel(null);
                    setCanvasPromptClient(null);
                    setCanvasModel(null);
                    setAgentRunConcurrency(5);
                    setAutoClearCompletedComments(true);
                    setInitialPreferencesLoaded(true);
                    setIDEAvailability({});
                    setAgentAvailability(EMPTY_AGENT_AVAILABILITY);
                    setDefaultThemeName(null);
                }
            });

        return () => {
            canceled = true;
        };
    }, [activeProjectId, enabled, onExcalidrawPropertyPanelModeLoaded, onExcalidrawPropertyPanelPositionLoaded, setDefaultThemeName]);

    const handleSettingsSaved = useCallback(() => {
        if (!enabled) {
            return;
        }
        if (!activeProjectId?.trim()) {
            return;
        }

        apiService.getConfig(requireProjectScope(activeProjectId))
            .then((config) => {
                setConversationPromptClient(normalizePromptClientPreference(config?.automation?.conversationPromptClient));
                setConversationModel(config?.automation?.conversationModel || null);
                setPreferredIDE(config?.automation?.defaultIDE || null);
                setAssistantImageGenerationConfig(config?.ai?.imageGeneration || null);
                setAnnotationPromptClient(normalizePromptClientPreference(config?.automation?.annotationPromptClient));
                setAnnotationModel(config?.automation?.annotationModel || null);
                setCanvasPromptClient(normalizePromptClientPreference(config?.automation?.canvasPromptClient));
                setCanvasModel(config?.automation?.canvasModel || null);
                setAgentRunConcurrency(sanitizeAgentRunConcurrency(config?.automation?.agentRunConcurrency));
                setAutoClearCompletedComments(config?.automation?.autoClearCompletedComments !== false);
                setIDEAvailability(config?.ideAvailability || {});
                setAgentAvailability(config?.agentAvailability || EMPTY_AGENT_AVAILABILITY);
                setDefaultThemeName((config as any)?.projectDefaults?.defaultTheme || null);
                onExcalidrawPropertyPanelModeLoaded?.(persistExcalidrawPropertyPanelModePreference(
                    sanitizeExcalidrawPropertyPanelMode(config?.uiPreferences?.excalidrawPropertyPanelMode ?? config?.uiPreferences?.excalidrawUiMode),
                ));
                onExcalidrawPropertyPanelPositionLoaded?.(persistExcalidrawPropertyPanelPositionPreference(
                    sanitizeExcalidrawPropertyPanelPosition(config?.uiPreferences?.excalidrawPropertyPanelPosition),
                ));
                void Promise.resolve(onProjectConfigSaved?.()).catch(() => undefined);
            })
            .catch(() => {
                setConversationPromptClient(null);
                setConversationModel(null);
                setPreferredIDE(null);
                setAssistantImageGenerationConfig(null);
                setAnnotationPromptClient(null);
                setAnnotationModel(null);
                setCanvasPromptClient(null);
                setCanvasModel(null);
                setAgentRunConcurrency(5);
                setAutoClearCompletedComments(true);
                setIDEAvailability({});
                setAgentAvailability(EMPTY_AGENT_AVAILABILITY);
                setDefaultThemeName(null);
            });
    }, [activeProjectId, enabled, onExcalidrawPropertyPanelModeLoaded, onExcalidrawPropertyPanelPositionLoaded, onProjectConfigSaved, setDefaultThemeName]);

    return {
        conversationPromptClient,
        conversationModel,
        preferredIDE,
        ideAvailability,
        agentAvailability,
        assistantImageGenerationConfig,
        annotationPromptClient,
        annotationModel,
        canvasPromptClient,
        canvasModel,
        agentRunConcurrency,
        autoClearCompletedComments,
        initialPreferencesLoaded,
        setPreferredIDE,
        handleSettingsSaved,
    };
}
