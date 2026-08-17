import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiService } from '../../services/index.api';
import { useIndexPagePreferences } from './useIndexPagePreferences';

vi.mock('../../services/index.api', () => ({
  apiService: {
    getBootstrapConfig: vi.fn(),
    getConfig: vi.fn(),
  },
}));

vi.mock('@/common/promptExecution', () => ({
  normalizePromptClientPreference: (value: unknown) => value || null,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('useIndexPagePreferences source', () => {
  it('waits for a project before loading preferences, then loads the selected project', async () => {
    const getBootstrapConfig = vi.mocked(apiService.getBootstrapConfig);
    getBootstrapConfig.mockResolvedValue({} as any);
    const setDefaultThemeName = vi.fn();

    function Harness({ projectId }: { projectId: string | null }) {
      useIndexPagePreferences({
        activeProjectId: projectId,
        enabled: true,
        setDefaultThemeName,
      });
      return null;
    }

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(Harness, { projectId: null }));
    });

    expect(getBootstrapConfig).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(React.createElement(Harness, { projectId: '   ' }));
    });

    expect(getBootstrapConfig).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(React.createElement(Harness, { projectId: 'project-a' }));
    });

    expect(getBootstrapConfig).toHaveBeenCalledOnce();
    expect(getBootstrapConfig).toHaveBeenCalledWith({ projectId: 'project-a' });
  });

  it('ignores settings refresh while no project is selected', async () => {
    const getConfig = vi.mocked(apiService.getConfig);
    let handleSettingsSaved: (() => void) | null = null;

    function Harness() {
      handleSettingsSaved = useIndexPagePreferences({
        activeProjectId: null,
        enabled: true,
        setDefaultThemeName: vi.fn(),
      }).handleSettingsSaved;
      return null;
    }

    await act(async () => {
      create(React.createElement(Harness));
    });

    expect(handleSettingsSaved).not.toBeNull();
    expect(() => handleSettingsSaved?.()).not.toThrow();
    expect(getConfig).not.toHaveBeenCalled();
  });

  it('uses lightweight bootstrap config initially without probing local IDE or agent availability', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const initialEffectStart = source.indexOf('useEffect(() => {');
    const handleSettingsStart = source.indexOf('const handleSettingsSaved = useCallback', initialEffectStart);
    const initialEffectSource = source.slice(initialEffectStart, handleSettingsStart);

    expect(source).toContain('activeProjectId?: string | null;');
    expect(source).toContain('enabled?: boolean;');
    expect(source).toContain('activeProjectId,');
    expect(source).toContain('enabled = true,');
    expect(initialEffectSource).toContain('if (!enabled) {');
    expect(initialEffectSource).toContain('setInitialPreferencesLoaded(false);');
    expect(initialEffectSource).toContain('apiService.getBootstrapConfig(requireProjectScope(activeProjectId))');
    expect(initialEffectSource).not.toContain('apiService.getConfigAvailability()');
    expect(initialEffectSource).not.toContain('apiService.getConfig()');
    expect(initialEffectSource).toContain('[activeProjectId, enabled,');
    expect(source).not.toContain('refreshAvailability');
    expect(source).not.toContain('getConfigAvailability');
  });

  it('exposes when the initial bootstrap preferences have loaded', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');

    expect(source).toContain('initialPreferencesLoaded: boolean;');
    expect(source).toContain('const [initialPreferencesLoaded, setInitialPreferencesLoaded] = useState(false);');
    expect(source).toContain('setInitialPreferencesLoaded(true);');
    expect(source).toContain('initialPreferencesLoaded,');
  });

  it('keeps settings save refresh on the full config endpoint', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const handleSettingsStart = source.indexOf('const handleSettingsSaved = useCallback');
    const returnStart = source.indexOf('return {', handleSettingsStart);
    const handleSettingsSource = source.slice(handleSettingsStart, returnStart);

    expect(handleSettingsSource).toContain('if (!enabled) {');
    expect(handleSettingsSource).toContain('apiService.getConfig(requireProjectScope(activeProjectId))');
    expect(handleSettingsSource).not.toContain('apiService.getBootstrapConfig()');
    expect(handleSettingsSource).toContain('[activeProjectId, enabled, onExcalidrawPropertyPanelModeLoaded,');
  });

  it('caches assistant image generation config from bootstrap and settings refresh', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const initialEffectStart = source.indexOf('useEffect(() => {');
    const handleSettingsStart = source.indexOf('const handleSettingsSaved = useCallback', initialEffectStart);
    const initialEffectSource = source.slice(initialEffectStart, handleSettingsStart);
    const returnStart = source.indexOf('return {', handleSettingsStart);
    const handleSettingsSource = source.slice(handleSettingsStart, returnStart);

    expect(source).toContain('assistantImageGenerationConfig: AssistantImageGenerationConfig | null;');
    expect(source).toContain('const [assistantImageGenerationConfig, setAssistantImageGenerationConfig] = useState<AssistantImageGenerationConfig | null>(null);');
    expect(initialEffectSource).toContain('setAssistantImageGenerationConfig(config?.ai?.imageGeneration || null);');
    expect(handleSettingsSource).toContain('setAssistantImageGenerationConfig(config?.ai?.imageGeneration || null);');
    expect(source).toContain('assistantImageGenerationConfig,');
  });

  it('marks initial preferences loaded only after caching assistant image generation config', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const initialEffectStart = source.indexOf('useEffect(() => {');
    const handleSettingsStart = source.indexOf('const handleSettingsSaved = useCallback', initialEffectStart);
    const initialEffectSource = source.slice(initialEffectStart, handleSettingsStart);
    const imageConfigIndex = initialEffectSource.indexOf('setAssistantImageGenerationConfig(config?.ai?.imageGeneration || null);');
    const loadedIndex = initialEffectSource.indexOf('setInitialPreferencesLoaded(true);');

    expect(imageConfigIndex).toBeGreaterThan(-1);
    expect(loadedIndex).toBeGreaterThan(imageConfigIndex);
  });

  it('caches annotation AI preferences from bootstrap and settings refresh', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const initialEffectStart = source.indexOf('useEffect(() => {');
    const handleSettingsStart = source.indexOf('const handleSettingsSaved = useCallback', initialEffectStart);
    const initialEffectSource = source.slice(initialEffectStart, handleSettingsStart);
    const returnStart = source.indexOf('return {', handleSettingsStart);
    const handleSettingsSource = source.slice(handleSettingsStart, returnStart);

    expect(source).toContain('annotationPromptClient: PromptClientPreference;');
    expect(source).toContain('annotationModel: string | null;');
    expect(source).toContain('agentRunConcurrency: number;');
    expect(source).toContain('autoClearCompletedComments: boolean;');
    expect(source).toContain('const [annotationPromptClient, setAnnotationPromptClient] = useState<PromptClientPreference>(null);');
    expect(source).toContain('const [annotationModel, setAnnotationModel] = useState<string | null>(null);');
    expect(source).toContain('const [agentRunConcurrency, setAgentRunConcurrency] = useState(5);');
    expect(source).toContain('const [autoClearCompletedComments, setAutoClearCompletedComments] = useState(true);');
    expect(initialEffectSource).toContain('setAnnotationPromptClient(normalizePromptClientPreference(config?.automation?.annotationPromptClient));');
    expect(initialEffectSource).toContain('setAnnotationModel(config?.automation?.annotationModel || null);');
    expect(initialEffectSource).toContain('setAgentRunConcurrency(sanitizeAgentRunConcurrency(config?.automation?.agentRunConcurrency));');
    expect(initialEffectSource).toContain('setAutoClearCompletedComments(config?.automation?.autoClearCompletedComments !== false);');
    expect(handleSettingsSource).toContain('setAnnotationPromptClient(normalizePromptClientPreference(config?.automation?.annotationPromptClient));');
    expect(handleSettingsSource).toContain('setAnnotationModel(config?.automation?.annotationModel || null);');
    expect(handleSettingsSource).toContain('setAgentRunConcurrency(sanitizeAgentRunConcurrency(config?.automation?.agentRunConcurrency));');
    expect(handleSettingsSource).toContain('setAutoClearCompletedComments(config?.automation?.autoClearCompletedComments !== false);');
    expect(source).toContain('setAnnotationPromptClient(null);');
    expect(source).toContain('setAnnotationModel(null);');
    expect(source).toContain('setAgentRunConcurrency(5);');
    expect(source).toContain('setAutoClearCompletedComments(true);');
    expect(source).toContain('annotationPromptClient,');
    expect(source).toContain('annotationModel,');
    expect(source).toContain('agentRunConcurrency,');
    expect(source).toContain('autoClearCompletedComments,');
  });

  it('loads, resets, and returns independent conversation and canvas AI preferences', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const initialEffectStart = source.indexOf('useEffect(() => {');
    const handleSettingsStart = source.indexOf('const handleSettingsSaved = useCallback', initialEffectStart);
    const initialEffectSource = source.slice(initialEffectStart, handleSettingsStart);
    const returnStart = source.indexOf('return {', handleSettingsStart);
    const handleSettingsSource = source.slice(handleSettingsStart, returnStart);

    expect(source).toContain('conversationPromptClient: PromptClientPreference;');
    expect(source).toContain('conversationModel: string | null;');
    expect(source).toContain('canvasPromptClient: PromptClientPreference;');
    expect(source).toContain('canvasModel: string | null;');
    expect(source).toContain('const [conversationPromptClient, setConversationPromptClient] = useState<PromptClientPreference>(null);');
    expect(source).toContain('const [conversationModel, setConversationModel] = useState<string | null>(null);');
    expect(source).toContain('const [canvasPromptClient, setCanvasPromptClient] = useState<PromptClientPreference>(null);');
    expect(source).toContain('const [canvasModel, setCanvasModel] = useState<string | null>(null);');
    expect(initialEffectSource).toContain('setConversationPromptClient(normalizePromptClientPreference(config?.automation?.conversationPromptClient));');
    expect(initialEffectSource).toContain('setConversationModel(config?.automation?.conversationModel || null);');
    expect(initialEffectSource).toContain('setCanvasPromptClient(normalizePromptClientPreference(config?.automation?.canvasPromptClient));');
    expect(initialEffectSource).toContain('setCanvasModel(config?.automation?.canvasModel || null);');
    expect(handleSettingsSource).toContain('setConversationPromptClient(normalizePromptClientPreference(config?.automation?.conversationPromptClient));');
    expect(handleSettingsSource).toContain('setConversationModel(config?.automation?.conversationModel || null);');
    expect(handleSettingsSource).toContain('setCanvasPromptClient(normalizePromptClientPreference(config?.automation?.canvasPromptClient));');
    expect(handleSettingsSource).toContain('setCanvasModel(config?.automation?.canvasModel || null);');
    expect(source).toContain('setConversationPromptClient(null);');
    expect(source).toContain('setConversationModel(null);');
    expect(source).toContain('setCanvasPromptClient(null);');
    expect(source).toContain('setCanvasModel(null);');
    expect(source).toContain('conversationPromptClient,');
    expect(source).toContain('conversationModel,');
    expect(source).toContain('canvasPromptClient,');
    expect(source).toContain('canvasModel,');
    expect(source).not.toContain('preferredPromptClient: PromptClientPreference;');
  });

  it('restores default design state from project defaults', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const initialEffectStart = source.indexOf('useEffect(() => {');
    const handleSettingsStart = source.indexOf('const handleSettingsSaved = useCallback', initialEffectStart);
    const initialEffectSource = source.slice(initialEffectStart, handleSettingsStart);
    const returnStart = source.indexOf('return {', handleSettingsStart);
    const handleSettingsSource = source.slice(handleSettingsStart, returnStart);

    expect(source).toContain('setDefaultThemeName: (name: string | null) => void;');
    expect(source).toContain('setDefaultThemeName,');
    expect(initialEffectSource).toContain('setDefaultThemeName((config as any)?.projectDefaults?.defaultTheme || null);');
    expect(handleSettingsSource).toContain('setDefaultThemeName((config as any)?.projectDefaults?.defaultTheme || null);');
    expect(source).toContain('setDefaultThemeName(null);');
  });

  it('does not expose the removed welcome guide dialog or prompt document', () => {
    const source = readFileSync(resolve(__dirname, './useIndexPagePreferences.ts'), 'utf8');
    const constantsSource = readFileSync(resolve(__dirname, '../../constants.ts'), 'utf8');
    const dialogsSource = readFileSync(resolve(__dirname, '../../components/app/IndexDialogs.tsx'), 'utf8');
    const projectGuidePath = resolve(__dirname, '../../../../client/rules/project-guide.md');

    expect(source).not.toContain('welcomeGuide');
    expect(constantsSource).not.toContain('WELCOME_GUIDE');
    expect(dialogsSource).not.toContain('WelcomeGuideDialog');
    expect(existsSync(projectGuidePath)).toBe(false);
  });
});
