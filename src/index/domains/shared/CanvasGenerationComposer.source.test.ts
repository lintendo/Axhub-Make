import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readCanvasGenerationComposerSource() {
  return readFileSync(resolve(__dirname, './CanvasGenerationComposer.tsx'), 'utf8');
}

function readIndexStyles() {
  return readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
}

function readAcpScopeStyles() {
  return readFileSync(resolve(__dirname, './canvas-generation-acp-scope.css'), 'utf8');
}

function readAiImageComposerStyles() {
  return readFileSync(resolve(__dirname, '../ai-image/AiImageGenerationComposer.css'), 'utf8');
}

function readMakeTooltipSource() {
  return readFileSync(resolve(__dirname, '../../../components/ui/tooltip/index.tsx'), 'utf8');
}

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(__dirname, '../../../../package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
}

describe('CanvasGenerationComposer source', () => {
  it('supports rendering prompt actions that fill without submitting the display composer', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );
    const promptSelectionSegment = source.slice(
      source.indexOf('const selectDisplayPrompt = useCallback((prompt: string) => {'),
      source.indexOf('const handleInputChange = useCallback', source.indexOf('const selectDisplayPrompt = useCallback((prompt: string) => {')),
    );

    expect(displayPropsSegment).toContain('renderPromptCards?: CanvasGenerationDisplayPromptCardsRenderer;');
    expect(source).toContain('export function applyCanvasGenerationDisplayPrompt({');
    expect(displayComponentSegment).toContain('const selectDisplayPrompt = useCallback((prompt: string) => {');
    expect(displayComponentSegment).toContain('applyCanvasGenerationDisplayPrompt({');
    expect(displayComponentSegment).toContain('disabled: controlsDisabled,');
    expect(displayComponentSegment).toContain('persist: persistDisplayDraft,');
    expect(displayComponentSegment).toContain('renderPromptCards?.({ disabled: controlsDisabled, selectPrompt: selectDisplayPrompt })');
    expect(promptSelectionSegment).not.toContain('submitDisplayText');
    expect(promptSelectionSegment).not.toContain('clearAttachments');
  });

  it('orders placeholder prompt actions after ACP model selectors and generation settings', () => {
    const source = readCanvasGenerationComposerSource();
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );

    expect(displayComponentSegment.indexOf('{showSelectors ? <CanvasAcpComposerSelectors /> : null}')).toBeGreaterThan(-1);
    expect(displayComponentSegment.indexOf('{resolvedPostSelectorActions}')).toBeGreaterThan(
      displayComponentSegment.indexOf('{showSelectors ? <CanvasAcpComposerSelectors /> : null}'),
    );
    expect(displayComponentSegment.indexOf('<CanvasPromptOptimizeButton')).toBeGreaterThan(
      displayComponentSegment.indexOf('{resolvedPostSelectorActions}'),
    );
    expect(displayComponentSegment).not.toContain('<CanvasGenerationDisplayQuickPromptsButton');
  });

  it('lets placeholder post-selector actions read the current display composer text', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );

    expect(source).toContain('type CanvasGenerationDisplayPostSelectorActions = React.ReactNode | ((props: { getPromptText: () => string }) => React.ReactNode);');
    expect(displayPropsSegment).toContain('postSelectorActions?: CanvasGenerationDisplayPostSelectorActions;');
    expect(displayComponentSegment).toContain("const getDisplayPromptText = useCallback(() => inputRef.current?.value.trim() ?? '', []);");
    expect(displayComponentSegment).toContain("const resolvedPostSelectorActions = typeof postSelectorActions === 'function'");
    expect(displayComponentSegment).toContain('? postSelectorActions({ getPromptText: getDisplayPromptText })');
    expect(displayComponentSegment).toContain(': postSelectorActions;');
    expect(displayComponentSegment).toContain('{resolvedPostSelectorActions}');
    expect(displayComponentSegment).not.toContain('{postSelectorActions}');
  });

  it('wires prompt optimization actions without consuming final submit context', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );
    const displayRuntimeSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerRuntime'),
      source.indexOf('function CanvasGenerationDisplayComposerWithAcp'),
    );

    expect(displayPropsSegment).toContain('onOptimizePrompt?: (request: CanvasPromptOptimizationRequest) => Promise<string>;');
    expect(source).toContain('export interface CanvasPromptOptimizationRequest');
    expect(source).toContain('function CanvasComposerSendButtonWithCopyMenu');
    expect(source).toContain('Loader2');
    expect(displayComponentSegment).toContain('const [optimizingPrompt, setOptimizingPrompt] = useState(false);');
    expect(displayComponentSegment).toContain('const controlsDisabled = disabled || optimizingPrompt || submitting;');
    expect(displayComponentSegment).toContain('const hasDisplayPromptText = displayText.trim().length > 0;');
    expect(displayComponentSegment).toContain('aria-live="polite"');
    expect(displayComponentSegment).toContain('正在优化提示词');
    expect(displayComponentSegment).toContain('inputRef.current.value = optimizedPrompt;');
    expect(displayComponentSegment).toContain('persistDisplayDraft(optimizedPrompt);');
    expect(displayComponentSegment).toContain('disabled={controlsDisabled || !hasDisplayPromptText}');
    expect(displayComponentSegment).toContain('<CanvasComposerSendButtonWithCopyMenu');
    expect(displayRuntimeSegment).toContain('contextBundle: acpContext.getContextBundle()');
    expect(displayRuntimeSegment).not.toContain('contextBundle: acpContext.consumeContextBundle(),');
    expect(displayRuntimeSegment).toContain('onOptimizePrompt?.({');
    expect(displayRuntimeSegment).toContain('provider: acpContext.provider');
    expect(displayRuntimeSegment).toContain('model: acpContext.model');
    expect(displayRuntimeSegment).toContain('mode: acpContext.modeId');
    expect(displayRuntimeSegment).toContain('thought: acpContext.thoughtLevel');
  });

  it('shows copy prompt from the original send button hover menu', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );
    const sendButtonSegment = source.slice(
      source.indexOf('function CanvasComposerSendButtonWithCopyMenu'),
      source.indexOf('function CanvasComposerAddAttachmentButton'),
    );

    expect(displayPropsSegment).toContain('onCopyPrompt?: (request: CanvasPromptCopyRequest) => Promise<string> | string;');
    expect(source).toContain('export interface CanvasPromptCopyRequest');
    expect(source).toContain('function CanvasPromptOptimizeButton');
    expect(source).toContain('复制提示词');
    expect(source).toContain('function CanvasComposerSendButtonWithCopyMenu');
    expect(sendButtonSegment).toContain('TooltipProvider delayDuration={1000}');
    expect(sendButtonSegment).toContain('onMouseEnter={scheduleOpen}');
    expect(sendButtonSegment).toContain('发送');
    expect(sendButtonSegment).toContain('Ctrl / ⌘ + C');
    expect(sendButtonSegment).toContain('onClick={onSubmit}');
    expect(sendButtonSegment).not.toContain('<ComposerPrimitive.Send');
    expect(sendButtonSegment).not.toContain('title="发送"');
    expect(displayComponentSegment).toContain('if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === \'c\') {');
    expect(displayComponentSegment).toContain('const handleCopyPrompt = useCallback(async () => {');
    expect(displayComponentSegment).toContain('shouldSubmitCanvasGenerationDisplayPrompt({');
    expect(displayComponentSegment).toContain('const copiedPrompt = await onCopyPrompt({');
    expect(displayComponentSegment).toContain('prompt: text,');
    expect(displayComponentSegment).toContain('await navigator.clipboard.writeText(promptText);');
    expect(displayComponentSegment).toContain("toast.success('提示词已复制到剪贴板');");
    expect(displayComponentSegment).toContain('<CanvasComposerSendButtonWithCopyMenu');
    expect(displayComponentSegment).toContain('<CanvasPromptOptimizeButton');
  });

  it('keeps prompt optimization clickable so ACP setup failures can open AI settings', () => {
    const source = readCanvasGenerationComposerSource();
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );

    expect(displayComponentSegment).toContain('if (!onOptimizePrompt) {');
    expect(displayComponentSegment).toContain('onOpenAISettings?.();');
    expect(displayComponentSegment).toContain('return;');
    expect(displayComponentSegment).toContain('if (showModelSelectorFallback) {');
    expect(displayComponentSegment).toContain('onOpenAISettings?.();');
    expect(displayComponentSegment).toContain('return;');
    expect(displayComponentSegment).toContain("action === 'open-ai-settings'");
    expect(displayComponentSegment).toContain('onOpenAISettings?.();');
    expect(displayComponentSegment).not.toContain('const runtimeReady = await onEnsureAcpRuntime?.(false);');
    expect(displayComponentSegment).toContain('disabled={controlsDisabled}');
    expect(displayComponentSegment).not.toContain('promptOptimizationSetupDisabled');
    expect(displayComponentSegment).not.toContain('disabled={controlsDisabled || !onOptimizePrompt}');
  });

  it('orders runtime prompt actions after ACP model selectors and generation settings', () => {
    const source = readCanvasGenerationComposerSource();
    const runtimeContentSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
      source.indexOf('function useAssistantUiDialogOverlayDismiss'),
    );

    expect(runtimeContentSegment.indexOf('{showSelectors && postSelectorActions ? <CanvasAcpComposerSelectors /> : null}')).toBeGreaterThan(-1);
    expect(runtimeContentSegment.indexOf('{postSelectorActions}')).toBeGreaterThan(
      runtimeContentSegment.indexOf('{showSelectors && postSelectorActions ? <CanvasAcpComposerSelectors /> : null}'),
    );
    expect(runtimeContentSegment.indexOf('{renderLeadingActions ? (')).toBeGreaterThan(
      runtimeContentSegment.indexOf('{postSelectorActions}'),
    );
  });

  it('uses a scoped ACP host stylesheet instead of importing ACP app globals', () => {
    const source = readCanvasGenerationComposerSource();
    const acpScopeStyles = readAcpScopeStyles();

    expect(source).toContain("import './canvas-generation-acp-scope.css';");
    expect(source).not.toContain("import '@axhub/acp/react/styles.css';");
    expect(source).not.toContain("from '@axhub/acp/react';");
    expect(source).toContain('ax-acp-ui-scope');

    expect(acpScopeStyles).toContain('.ax-acp-ui-scope');
    expect(acpScopeStyles).not.toMatch(/(^|\n)\s*:root\s*\{/);
    expect(acpScopeStyles).not.toMatch(/(^|\n)\s*body\s*\{/);
    expect(acpScopeStyles).not.toMatch(/(^|\n)\s*a(?::|\s|,|\{)/);
    expect(acpScopeStyles).not.toContain('@import "../app/globals.css"');
    expect(acpScopeStyles).not.toContain('@import "tailwindcss"');
  });

  it('does not override Make composer surface styles from the generic ACP scope', () => {
    const acpScopeStyles = readAcpScopeStyles();

    expect(acpScopeStyles).not.toMatch(/\.ax-acp-ui-scope\s+\[data-slot='aui_composer-shell'\]\s*\{/);
    expect(acpScopeStyles).not.toMatch(/\.ax-acp-ui-scope\s+\.aui-composer-input\s*\{/);
    expect(acpScopeStyles).not.toMatch(/\.ax-acp-ui-scope\s+\.aui-composer-send\s*,\s*\n\.ax-acp-ui-scope\s+\.aui-composer-cancel\s*\{/);
  });

  it('keeps shared settings trigger styles available without loading the AI image composer stylesheet', () => {
    const acpScopeStyles = readAcpScopeStyles();
    const aiImageStyles = readAiImageComposerStyles();

    expect(acpScopeStyles).toContain('.ax-ai-image-settings-trigger');
    expect(acpScopeStyles).toContain('display: inline-flex;');
    expect(acpScopeStyles).toContain('border-radius: var(--radius-md, 6px);');
    expect(acpScopeStyles).toContain('.ax-ai-image-settings-summary');
    expect(aiImageStyles).not.toContain('.ax-ai-image-settings-trigger');
    expect(aiImageStyles).not.toContain('.ax-ai-image-settings-summary');
  });

  it('keeps the canvas start scene switcher readable on top of canvas content', () => {
    const acpScopeStyles = readAcpScopeStyles();

    expect(acpScopeStyles).toContain('.ax-ai-generation-scene-switcher');
    expect(acpScopeStyles).toContain('border: 1px solid hsl(var(--border));');
    expect(acpScopeStyles).toContain('background-color: hsl(var(--background) / 0.96);');
    expect(acpScopeStyles).toContain('box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);');
    expect(acpScopeStyles).toContain('backdrop-filter: blur(6px);');
  });

  it('scopes ACP settings dialog portal overrides to the ACP settings dialog only', () => {
    const acpScopeStyles = readAcpScopeStyles();
    const indexStyles = readIndexStyles();

    expect(indexStyles).toContain('@source "../node_modules/@axhub/acp/dist/components/assistant-ui/image-generation-settings-dialog.mjs";');
    expect(indexStyles).toContain('@source "../node_modules/@axhub/acp/dist/components/ui/checkbox.mjs";');
    expect(indexStyles).toContain('@source "../node_modules/@axhub/acp/dist/components/ui/switch.mjs";');
    expect(indexStyles).toContain('@source "../node_modules/@axhub/acp/dist/components/ui/tabs.mjs";');
    expect(acpScopeStyles).toContain('.ax-acp-settings-dialog-content');
    expect(acpScopeStyles).toMatch(/\.ax-acp-settings-dialog-content\s*\{[^}]*width: min\(calc\(100vw - 2rem\), 42rem\) !important;/s);
    expect(acpScopeStyles).toMatch(/\.ax-acp-settings-dialog-content\s*\{[^}]*max-width: min\(calc\(100vw - 2rem\), 42rem\) !important;/s);
    expect(acpScopeStyles).toMatch(/\.ax-acp-settings-dialog-content\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto;/s);
    expect(acpScopeStyles).toMatch(/\.ax-acp-settings-dialog-content \[role='checkbox'\]\[data-state='checked'\]\s*\{/);
    expect(acpScopeStyles).not.toMatch(/\[data-slot=['"]dialog-content['"]\s*\{/);
  });

  it('configures ACP UI runtime endpoints so composer selectors load model capabilities from ACP UI', () => {
    const source = readCanvasGenerationComposerSource();

    expect(source).toContain("import { ACP_CAPABILITY_REFRESH_EVENT, AcpUiProvider, acpApiClient, configureAcpUiRuntime, hydrateAcpCapabilityCacheFromDefaults, useAcpUiRuntimeContext } from '@axhub/acp/runtime';");
    expect(source).toContain("import { apiService } from '../../services/index.api';");
    expect(source).toContain('function useCanvasAcpRuntimeBridge');
    expect(source).toContain('apiService.getAssistantRuntime({ autoStart, projectId })');
    expect(source).toContain('configureAcpUiRuntime({ apiBaseUrl: runtime.apiBaseUrl });');
    expect(source).toContain('window.dispatchEvent(new CustomEvent(ACP_CAPABILITY_REFRESH_EVENT');
    expect(source).toContain('workspacePath: workspacePath ?? null');
    expect(source).toContain('const canvasAcpRuntime = useCanvasAcpRuntimeBridge({ enabled: showSelectors, projectId, workspacePath });');
    expect(source).toContain('onEnsureAcpRuntime={canvasAcpRuntime.ensureRuntime}');
  });

  it('renders a stable model selection placeholder that probes ACP before opening AI settings', () => {
    const source = readCanvasGenerationComposerSource();
    const fallbackSegment = source.slice(
      source.indexOf('function CanvasAcpModelSelectorFallback('),
      source.indexOf('function CanvasGenerationRuntimeComposerContent'),
    );
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const runtimePropsSegment = source.slice(
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
      source.indexOf('export interface CanvasGenerationComposerProps'),
    );

    expect(displayPropsSegment).toContain('onOpenAISettings?: () => void;');
    expect(runtimePropsSegment).toContain('onOpenAISettings?: () => void;');
    expect(fallbackSegment).toContain('请选择模型');
    expect(fallbackSegment).toContain('data-axhub-acp-model-fallback-trigger');
    expect(fallbackSegment).toContain('aria-haspopup="menu"');
    expect(fallbackSegment).toContain('aria-expanded={false}');
    expect(fallbackSegment).toContain('const handleClick = async () => {');
    expect(fallbackSegment).toContain('const runtimeReady = await onEnsureAcpRuntime?.(false);');
    expect(fallbackSegment).toContain('if (!runtimeReady) {');
    expect(fallbackSegment).toContain('onOpenAISettings?.();');
    expect(fallbackSegment).toContain('onClick={() => { void handleClick(); }}');
    expect(fallbackSegment).not.toContain('onEnsureAcpRuntime?.(true)');
    expect(fallbackSegment).toContain('Settings2');
    expect(fallbackSegment).toContain('ChevronDown');
    expect(fallbackSegment).not.toContain('data-acp-config-option');
    expect(source).toContain('<CanvasAcpModelSelectorFallback');
    expect(source).toContain('showSelectors && canvasAcpRuntime.needsFallback');
    expect(source).toContain('onOpenAISettings={onOpenAISettings}');
    expect(source).toContain('onEnsureAcpRuntime={onEnsureAcpRuntime}');
  });

  it('exports a placeholder display composer using the Make shell styling', () => {
    const source = readCanvasGenerationComposerSource();
    const indexStyles = readIndexStyles();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplaySubmitSelection'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );

    expect(displayPropsSegment).toContain('placeholder: string;');
    expect(displayPropsSegment).toContain('ariaLabel: string;');
    expect(displayPropsSegment).toContain('onSubmit?: (text: string, selection?: CanvasGenerationDisplaySubmitSelection) => CanvasGenerationDisplaySubmitResult | Promise<CanvasGenerationDisplaySubmitResult>;');
    expect(displayPropsSegment).toContain('className?: string;');
    expect(displayPropsSegment).toContain('disabled?: boolean;');
    expect(displayPropsSegment).not.toContain('quickPrompts?: readonly CanvasAiQuickPrompt[];');
    expect(displayPropsSegment).toContain('referenceImages: string[];');
    expect(displayPropsSegment).toContain('attachments: CanvasGenerationAttachmentPart[];');
    expect(displayComponentSegment).toContain('aui-composer-root');
    expect(displayComponentSegment).toContain('data-slot="aui_composer-shell"');
    expect(displayComponentSegment).toContain('aui-composer-input');
    expect(displayComponentSegment).not.toContain('appendCanvasAiQuickPrompt');
    expect(displayComponentSegment).not.toContain('quickPrompt.prompt');
    expect(displayComponentSegment).not.toContain('CanvasGenerationDisplayQuickPromptsButton');
    expect(displayComponentSegment).toContain('<ComposerAttachments />');
    expect(displayComponentSegment).toContain('{disabled ? null : (');
    expect(displayComponentSegment).toContain('<CanvasComposerAttachmentMenu');
    expect(displayComponentSegment).toContain('onProjectResourceClick={() => setProjectResourceDialogOpen(true)}');
    expect(displayComponentSegment).not.toContain('<CanvasProjectResourceButton');
    expect(source).toContain('aui-composer-send');
    expect(displayComponentSegment).toContain('min-h-[112px]');
    expect(displayComponentSegment).toContain('rounded-2xl border border-border bg-background p-3 shadow-sm');
    expect(source).toContain('bg-slate-100 text-slate-400 opacity-60');
    expect(source).toContain('bg-slate-900 text-white hover:bg-slate-800');
    expect(displayComponentSegment).toContain('onPaste={handleDisplayPaste}');
    expect(displayComponentSegment).toContain('getClipboardImageFiles(event.nativeEvent)');
    expect(displayComponentSegment).toContain('aui.composer().addAttachment(file)');
    expect(displayComponentSegment).toContain('displayReferenceAttachments');
    expect(displayComponentSegment).toContain('resolveComposerAttachmentSubmitSelection(displayReferenceAttachments)');
    expect(displayComponentSegment).not.toContain('data-axhub-display-composer-attachment-count');
    expect(displayComponentSegment).not.toContain('onClick={() => { setDisplayReferenceImages([]); }}');
    expect(displayComponentSegment).not.toContain('onClick={() => {}}');
    expect(displayComponentSegment).not.toContain('readFilesAsDataUrls');
    expect(displayComponentSegment).not.toContain('aria-label="语音输入"');
    expect(displayComponentSegment).not.toContain('title="语音输入"');
    expect(displayComponentSegment).not.toContain('<Mic');
    expect(displayComponentSegment).not.toContain('focus-within:ring-2');
    expect(displayComponentSegment).not.toContain('shadow-[0_18px_45px');
    expect(displayComponentSegment).not.toContain('onSubmitPrompt');
    expect(displayComponentSegment).not.toContain('CanvasGenerationMakeTransport');
    expect(displayComponentSegment).not.toContain('data-axhub-placeholder-quick-prompt');
    expect(displayComponentSegment).not.toContain('mt-3 flex flex-wrap items-center justify-center gap-2');
    expect(source).not.toContain('function CanvasGenerationDisplayQuickPromptsButton');
    expect(source).not.toContain('quickPrompts?.length');
    expect(source).not.toContain('data-axhub-canvas-generation-prompts-trigger');
    expect(source).not.toContain('data-axhub-canvas-generation-prompt-option');
    expect(source).not.toContain('import { ArrowUp, Mic, Plus }');
    expect(source).not.toContain('import { ArrowUp, Mic, Plus }');
    expect(indexStyles).toContain('.ax-placeholder-display-composer .aui-composer-input:focus-visible');
    expect(indexStyles).toContain('box-shadow: none !important;');
  });

  it('wires the placeholder display composer to ACP selectors and selected model context', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplaySubmitSelection'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayAcpSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerRuntime'),
      source.indexOf('function CanvasAcpModelSelectorFallback'),
    );

    expect(source).toContain('ComposerPrimitive,');
    expect(source).toContain("import { ComposerAttachments } from '@axhub/acp/composer';");
    expect(source).not.toContain('import { AcpComposerSelectors');
    expect(source).toContain('PlusIcon');
    expect(source).toContain("import { Button } from '@/components/ui/button';");
    expect(source).toContain("import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';");
    expect(source).toContain("import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';");
    expect(source).toContain('function CanvasComposerAttachmentMenu');
    expect(source).not.toContain('function CanvasProjectResourceButton');
    expect(source).toContain('<TooltipProvider>');
    expect(source).toContain('<ComposerPrimitive.AddAttachment asChild>');
    expect(source).toContain('本地文件');
    expect(source).toContain('本项目资源');
    expect(source).toContain("prototypes: '原型'");
    expect(source).toContain("docs: '资源'");
    expect(source).toContain("themes: '设计'");
    expect(source).not.toContain("prototypes: '页面'");
    expect(source).not.toContain("canvas: '设计图'");
    expect(source).not.toContain("docs: '文档'");
    expect(source).toContain('data-axhub-project-resource-picker-trigger');
    expect(source).not.toContain('data-axhub-project-resource-picker-inline-trigger');
    expect(source).toContain('onProjectResourceClick={() => setProjectResourceDialogOpen(true)}');
    expect(source).toContain('className="aui-composer-add-attachment size-8 rounded-full p-1 font-semibold text-xs hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"');
    expect(source).not.toContain('Composer,');
    expect(source).not.toContain('ComposerAddAttachment,');
    expect(source).not.toContain('<ComposerAddAttachment');
    expect(displayPropsSegment).toContain('export interface CanvasGenerationDisplaySubmitSelection');
    expect(displayPropsSegment).toContain('contextBundle: ContextBundleV2 | null;');
    expect(displayPropsSegment).toContain('provider: string;');
    expect(displayPropsSegment).toContain('model: string | null;');
    expect(displayPropsSegment).toContain('mode: string | null;');
    expect(displayPropsSegment).toContain('thought: string | null;');
    expect(displayPropsSegment).toContain('referenceImages: string[];');
    expect(displayPropsSegment).toContain('preferredPromptClient?: PromptClientPreference;');
    expect(displayPropsSegment).toContain('showSelectors?: boolean;');
    expect(displayPropsSegment).toContain('workspacePath?: string | null;');
    expect(displayAcpSegment).toContain('const canvasAcpRuntime = useCanvasAcpRuntimeBridge({ enabled: showSelectors, projectId, workspacePath });');
    expect(displayAcpSegment).toContain('const acpSelectorDefaults = useMemo(() => resolveCanvasAcpSelectorDefaults(preferredPromptClient), [preferredPromptClient]);');
    expect(displayAcpSegment).toContain('const acpRuntimeKey = useMemo(() => [');
    expect(displayAcpSegment).toContain('acpSelectorDefaults.defaultProvider,');
    expect(displayAcpSegment).toContain('acpSelectorDefaults.providerOptions.join(\',\'),');
    expect(displayAcpSegment).toContain('workspacePath ?? \'global\',');
    expect(displayAcpSegment).toContain('key={acpRuntimeKey}');
    expect(displayAcpSegment).toContain('defaultProvider={acpSelectorDefaults.defaultProvider}');
    expect(displayAcpSegment).not.toContain('defaultModel=');
    expect(displayAcpSegment).toContain('providerOptions={acpSelectorDefaults.providerOptions}');
    expect(displayAcpSegment).toContain('showProviderSettings={false}');
    expect(displayAcpSegment).toContain('<AssistantRuntimeProvider runtime={runtime}>');
    expect(source).toContain('<CanvasAcpComposerSelectors />');
    expect(source).toContain('<CanvasAcpModelSelectorFallback');
    expect(displayAcpSegment).toContain('contextBundle: acpContext.consumeContextBundle()');
    expect(displayAcpSegment).toContain('provider: acpContext.provider');
    expect(displayAcpSegment).toContain('model: acpContext.model');
    expect(displayAcpSegment).toContain('mode: acpContext.modeId');
    expect(displayAcpSegment).toContain('thought: acpContext.thoughtLevel');
    expect(displayAcpSegment).toContain('referenceImages,');
  });

  it('remounts both ACP composer runtimes when the configured default provider changes', () => {
    const source = readCanvasGenerationComposerSource();
    const displayAcpSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerWithAcp'),
      source.indexOf('export function CanvasGenerationDisplayComposer'),
    );
    const runtimeAcpSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerWithAcp'),
      source.indexOf('export default function CanvasGenerationComposer'),
    );

    for (const segment of [displayAcpSegment, runtimeAcpSegment]) {
      expect(segment).toContain('const acpRuntimeKey = useMemo(() => [');
      expect(segment).toContain('acpSelectorDefaults.defaultProvider,');
      expect(segment).not.toContain('acpSelectorDefaults.defaultModel');
      expect(segment).toContain('acpSelectorDefaults.providerOptions.join(\',\'),');
      expect(segment).toContain('workspacePath ?? \'global\',');
      expect(segment).toContain('key={acpRuntimeKey}');
    }
  });

  it('backs the placeholder display composer attachment button with the all-file ACP UI attachment adapter', () => {
    const source = readCanvasGenerationComposerSource();
    const displayWithoutAcpSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
      source.indexOf('function CanvasGenerationDisplayComposerRuntime'),
    );
    const displayRuntimeSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerRuntime'),
      source.indexOf('function CanvasGenerationDisplayComposerWithAcp'),
    );

    expect(source).toContain('resolveComposerAttachmentSubmitSelection');
    expect(source).toContain('canvasGeneralFileAttachmentAdapter');
    expect(source).toContain("accept: '*'");
    expect(displayWithoutAcpSegment).toContain('const runtime = useChatRuntime<UIMessage>({');
    expect(displayWithoutAcpSegment).toContain('attachments: canvasGeneralFileAttachmentAdapter');
    expect(displayWithoutAcpSegment).toContain('<AssistantRuntimeProvider runtime={runtime}>');
    expect(displayRuntimeSegment).toContain('const runtime = useChatRuntime<UIMessage>({');
    expect(displayRuntimeSegment).toContain('attachments: canvasGeneralFileAttachmentAdapter');
    expect(displayRuntimeSegment).toContain('<AssistantRuntimeProvider runtime={runtime}>');
  });

  it('passes runtime ACP selector context through the real canvas composer submit transport', () => {
    const source = readCanvasGenerationComposerSource();
    const transportSegment = source.slice(
      source.indexOf('class CanvasGenerationMakeTransport'),
      source.indexOf('class CanvasGenerationDisplayTransport'),
    );
    const runtimeSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposer({'),
      source.indexOf('function CanvasGenerationRuntimeComposerWithAcp'),
    );

    expect(transportSegment).toContain("private readonly getSubmitContext: () => Pick<CanvasAiSubmitRequest, 'contextBundle' | 'provider' | 'model' | 'mode' | 'thought'>");
    expect(transportSegment).toContain('const submitContext = this.getSubmitContext();');
    expect(transportSegment).toContain('const threadMessage = uiMessageToThreadMessage(message, submitContext.contextBundle);');
    expect(transportSegment).toContain('attachments: extractCanvasGenerationAttachmentPartsFromMessage(threadMessage),');
    expect(transportSegment).toContain('referenceImages: extractCanvasGenerationReferenceImagesFromMessage(threadMessage),');
    expect(transportSegment).toContain('contextBundle: submitContext.contextBundle,');
    expect(transportSegment).toContain('provider: submitContext.provider,');
    expect(transportSegment).toContain('model: submitContext.model,');
    expect(transportSegment).toContain('mode: submitContext.mode,');
    expect(transportSegment).toContain('thought: submitContext.thought,');
    expect(runtimeSegment).toContain('const contextBundle = acpContext.consumeContextBundle();');
    expect(runtimeSegment).toContain('provider: runtimeContext.provider,');
    expect(runtimeSegment).toContain('model: runtimeContext.model,');
    expect(runtimeSegment).toContain('mode: runtimeContext.modeId,');
    expect(runtimeSegment).toContain('thought: runtimeContext.thoughtLevel,');
  });

  it('uses ACP UI attachment actions for runtime canvas composers', () => {
    const source = readCanvasGenerationComposerSource();
    const runtimePropsSegment = source.slice(
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
      source.indexOf('export interface CanvasGenerationComposerProps'),
    );
    const runtimeContentSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
      source.indexOf('function useAssistantUiDialogOverlayDismiss'),
    );

    expect(runtimePropsSegment).toContain('addAttachmentTooltip: string;');
    expect(runtimePropsSegment).toContain('sendTooltip: string;');
    expect(runtimeContentSegment).toContain('addAttachmentTooltip,');
    expect(runtimeContentSegment).toContain('sendTooltip,');
    expect(source).toContain('function CanvasComposerSubmitButton');
    expect(source).toContain('function useCancelCanvasActiveChatRun');
    expect(source).toContain('const { provider, workspacePath } = useAcpUiRuntimeContext();');
    expect(source).toContain('const remoteId = useAuiState((state) => state.threadListItem.remoteId);');
    expect(source).toContain('const mainThreadId = useAuiState((state) => state.threads.mainThreadId);');
    expect(source).toContain('void acpApiClient.cancelChat({');
    expect(runtimeContentSegment).toContain('cancelActiveChatRun();');
    expect(runtimeContentSegment).toContain('<ComposerPrimitive.Root');
    expect(runtimeContentSegment).toContain('<ComposerPrimitive.AttachmentDropzone asChild>');
    expect(runtimeContentSegment).toContain('allowAttachments ? <ComposerAttachments /> : null');
    expect(runtimeContentSegment).toContain('<ComposerPrimitive.Input');
    expect(runtimeContentSegment).toContain('cancelOnEscape={false}');
    expect(runtimeContentSegment).toContain('onKeyDown={handleComposerKeyDown}');
    expect(runtimeContentSegment).not.toContain('shouldMountCommandMenu');
    expect(runtimeContentSegment).not.toContain('LazyCanvasCommandMenu');
    expect(runtimeContentSegment).toContain('allowAttachments ? <CanvasComposerAddAttachmentButton label={addAttachmentTooltip} /> : null');
    expect(runtimeContentSegment).toContain('<CanvasComposerSubmitButton label={sendTooltip} />');
    expect(runtimeContentSegment).not.toContain('<Composer\n');
    expect(runtimeContentSegment).not.toContain('<Composer ');
    expect(runtimeContentSegment).not.toContain('aui-composer-add-attachment inline-flex');
  });

  it('wraps ACP attachment lists in a tooltip provider for pasted attachments', () => {
    const source = readCanvasGenerationComposerSource();
    const tooltipSource = readMakeTooltipSource();
    const packageJson = readPackageJson();
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );
    const runtimeContentSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
      source.indexOf('function useAssistantUiDialogOverlayDismiss'),
    );

    const displayAttachmentIndex = displayComponentSegment.indexOf('<ComposerAttachments />');
    const displayProviderStart = displayComponentSegment.lastIndexOf('<TooltipProvider>', displayAttachmentIndex);
    const displayProviderEnd = displayComponentSegment.indexOf('</TooltipProvider>', displayAttachmentIndex);
    expect(displayAttachmentIndex).toBeGreaterThan(-1);
    expect(displayProviderStart).toBeGreaterThan(-1);
    expect(displayProviderEnd).toBeGreaterThan(displayAttachmentIndex);

    const runtimeAttachmentIndex = runtimeContentSegment.indexOf('allowAttachments ? <ComposerAttachments /> : null');
    const runtimeProviderStart = runtimeContentSegment.lastIndexOf('<TooltipProvider>', runtimeAttachmentIndex);
    const runtimeProviderEnd = runtimeContentSegment.indexOf('</TooltipProvider>', runtimeAttachmentIndex);
    expect(runtimeAttachmentIndex).toBeGreaterThan(-1);
    expect(runtimeProviderStart).toBeGreaterThan(-1);
    expect(runtimeProviderEnd).toBeGreaterThan(runtimeAttachmentIndex);
    expect(packageJson.dependencies?.['radix-ui']).toBeDefined();
    expect(tooltipSource).toContain("import { Tooltip as TooltipPrimitive } from 'radix-ui';");
    expect(tooltipSource).not.toContain('@radix-ui/react-tooltip');
  });

  it('supports actions that render after ACP model selectors in the runtime composer row', () => {
    const source = readCanvasGenerationComposerSource();
    const runtimePropsSegment = source.slice(
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
      source.indexOf('export interface CanvasGenerationComposerProps'),
    );
    const runtimeContentSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
      source.indexOf('function useAssistantUiDialogOverlayDismiss'),
    );

    expect(runtimePropsSegment).toContain('renderPostSelectorActions?: (props: { submitting: boolean }) => React.ReactNode;');
    expect(runtimeContentSegment).toContain('renderPostSelectorActions,');
    expect(runtimeContentSegment).toContain('const postSelectorActions = renderPostSelectorActions?.({ submitting });');
    expect(runtimeContentSegment).toContain('const shouldRenderInlineSelectors = showSelectors && !postSelectorActions;');
    expect(runtimeContentSegment).toContain('{shouldRenderInlineSelectors ? <CanvasAcpComposerSelectors /> : null}');
    expect(runtimeContentSegment).toContain('{showSelectors && postSelectorActions ? <CanvasAcpComposerSelectors /> : null}');
    expect(runtimeContentSegment.indexOf('{showSelectors && postSelectorActions ? <CanvasAcpComposerSelectors /> : null}')).toBeLessThan(
      runtimeContentSegment.indexOf('{postSelectorActions}'),
    );
    expect(runtimeContentSegment).toContain('{postSelectorActions}');
    expect(source).toContain('renderPostSelectorActions={renderPostSelectorActions}');
  });

  it('does not render shared quick prompt actions in the runtime composer row', () => {
    const source = readCanvasGenerationComposerSource();
    const runtimePropsSegment = source.slice(
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
      source.indexOf('export interface CanvasGenerationComposerProps'),
    );
    const runtimeContentSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
      source.indexOf('function useAssistantUiDialogOverlayDismiss'),
    );

    expect(runtimePropsSegment).not.toContain('quickPrompts?: readonly CanvasAiQuickPrompt[];');
    expect(runtimeContentSegment).not.toContain('quickPrompts,');
    expect(runtimeContentSegment).not.toContain('const handleQuickPromptSelect = useCallback');
    expect(runtimeContentSegment).not.toContain('quickPrompt.prompt');
    expect(runtimeContentSegment).not.toContain('<CanvasGenerationDisplayQuickPromptsButton');
    expect(source).not.toContain('data-axhub-canvas-generation-prompts-trigger');
    expect(source).not.toContain('data-axhub-canvas-generation-prompts-menu');
    expect(source).not.toContain('data-axhub-canvas-generation-prompt-option');
    expect(source).not.toContain('quickPrompts={quickPrompts}');
  });

  it('keeps canvas reference attachments image-only instead of using the AI SDK default file adapter', () => {
    const source = readCanvasGenerationComposerSource();
    const runtimeSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposer({'),
      source.indexOf('function CanvasGenerationRuntimeComposerWithAcp'),
    );

    expect(source).toContain('canvasReferenceImageAttachmentAdapter');
    expect(source).toContain("accept: 'image/*'");
    expect(runtimeSegment).toContain('adapters: {');
    expect(runtimeSegment).toContain('attachments: canvasReferenceImageAttachmentAdapter');
    expect(runtimeSegment).not.toContain('attachments: canvasGeneralFileAttachmentAdapter');
  });

  it('renders Make-owned ACP provider selectors without ACP provider settings', () => {
    const source = readCanvasGenerationComposerSource();
    const selectorSegment = source.slice(
      source.indexOf('const CANVAS_ACP_PROVIDER_LABELS'),
      source.indexOf('function CanvasAcpModelSelectorFallback'),
    );

    expect(selectorSegment).toContain('CANVAS_ACP_PROVIDER_LABELS');
    expect(selectorSegment).toContain("claude: 'Claude Code'");
    expect(selectorSegment).toContain("codex: 'Codex'");
    expect(selectorSegment).toContain("opencode: 'OpenCode'");
    expect(selectorSegment).toContain("'grok-build': 'Grok Build'");
    expect(source).toContain("const FIXED_CANVAS_ACP_PROVIDER_OPTIONS = ['claude', 'codex', 'opencode']");
    expect(selectorSegment).toContain('resolveCanvasAcpRuntimeProviderOptions(contextProviderOptions, context.provider)');
    expect(selectorSegment).toContain('runtimeProviderOptions.includes(option.value)');
    expect(selectorSegment).not.toContain('useVisibleAcpProviders');
    expect(selectorSegment).not.toContain('ProviderSettingsMenuItem');
    expect(selectorSegment).not.toContain('data-acp-provider-settings-trigger');
    expect(selectorSegment).not.toContain('设置');
    expect(selectorSegment).toContain("typeof snapshot?.capabilities.model?.currentValue === 'string'");
    expect(selectorSegment).toContain("typeof snapshot?.capabilities.mode?.currentValue === 'string'");
    expect(selectorSegment).toContain("typeof snapshot?.capabilities.thought_level?.currentValue === 'string'");
    expect(source).not.toContain('defaultModel: string | null;');
    expect(source).not.toContain('getAcpProviderOption(defaultProvider)?.defaultAnnotationModel');
    expect(source).not.toContain('defaultModel={acpSelectorDefaults.defaultModel}');
  });

  it('positions the desktop ACP config submenu against the viewport', () => {
    const source = readCanvasGenerationComposerSource();
    const selectorSegment = source.slice(
      source.indexOf('const CANVAS_ACP_PROVIDER_LABELS'),
      source.indexOf('function CanvasAcpModelSelectorFallback'),
    );

    expect(selectorSegment).toContain('desktopAnchorRef={rootMenuRef}');
    expect(selectorSegment).toContain("window.addEventListener('resize', updateDesktopLayout)");
    expect(selectorSegment).toContain('submenuElement.scrollHeight');
    expect(selectorSegment).toContain("position: 'fixed'");
    expect(selectorSegment).toContain("visibility: desktopLayout ? 'visible' : 'hidden'");
  });

  it('adds ordinary clipboard images as composer attachments without requiring Excalidraw reference paste', () => {
    const source = readCanvasGenerationComposerSource();
    const runtimeContentSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
      source.indexOf('function useAssistantUiDialogOverlayDismiss'),
    );

    expect(source).toContain("import { getClipboardImageFiles } from './clipboardImages';");
    expect(runtimeContentSegment).toContain('if (canPasteReferenceImages && onPasteReferenceImages && shouldUseCanvasReferencePaste(event.clipboardData)) {');
    expect(runtimeContentSegment.indexOf('shouldUseCanvasReferencePaste(event.clipboardData)')).toBeLessThan(
      runtimeContentSegment.indexOf('const pastedFiles = getClipboardImageFiles(event.nativeEvent);'),
    );
    expect(runtimeContentSegment).toContain('if (allowAttachments) {');
    expect(runtimeContentSegment).toContain('const pastedFiles = getClipboardImageFiles(event.nativeEvent);');
    expect(runtimeContentSegment).toContain('if (pastedFiles.length > 0) {');
    expect(runtimeContentSegment).toContain('event.preventDefault();');
    expect(runtimeContentSegment).toContain('void Promise.all(pastedFiles.map((file) => aui.composer().addAttachment(file)));');
  });

  it('supports canvas reference paste and local context in placeholder display composers', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayContentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );
    const displayContentPropsSegment = source.slice(
      source.indexOf('interface CanvasGenerationDisplayComposerContentProps'),
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
    );
    const displayRuntimeSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerRuntime'),
      source.indexOf('function CanvasGenerationDisplayComposerWithAcp'),
    );

    expect(displayPropsSegment).toContain('canPasteReferenceImages?: boolean;');
    expect(displayPropsSegment).toContain('initialLocalContextRefs?: CanvasLocalContextRef[];');
    expect(displayPropsSegment).toContain('initialReferenceImages?: string[];');
    expect(displayPropsSegment).toContain('onPasteReferenceImages?: () => Promise<CanvasReferencePasteResult>;');
    expect(displayContentPropsSegment).toContain('replaceContextItems?: (items: ContextItem[]) => void;');
    expect(displayContentSegment).toContain('const initialReferenceImagesKey = useMemo');
    expect(displayContentSegment).toContain('const initialLocalContextRefsKey = useMemo');
    expect(displayContentSegment).toContain('const [localContextItems, setLocalContextItems] = useState<ContextItem[]>([]);');
    expect(displayContentSegment).toContain('const visibleContextItems = [...localContextItems, ...projectResourceContextItems];');
    expect(displayContentSegment).toContain('currentLocalContextRefsRef.current = localContextRefs;');
    expect(displayContentSegment).toContain('setLocalContextItems(localItems);');
    expect(displayContentSegment).toContain('localContextRefsToAcpContextItems(localContextRefs)');
    expect(displayContentSegment).toContain('syncDisplayContextItems(contextItems, projectResourceContextItems);');
    expect(displayContentSegment).toContain('const handleRemoveLocalContextItem = useCallback');
    expect(displayContentSegment).toContain('if (canPasteReferenceImages && onPasteReferenceImages && shouldUseCanvasReferencePaste(event.clipboardData)) {');
    expect(displayContentSegment.indexOf('shouldUseCanvasReferencePaste(event.clipboardData)')).toBeLessThan(
      displayContentSegment.indexOf('const pastedFiles = getClipboardImageFiles(event.nativeEvent);'),
    );
    expect(displayContentSegment).toContain('const pasteResult = normalizeCanvasReferencePasteResult(await onPasteReferenceImages());');
    expect(displayContentSegment).toContain('syncDisplayContextItems(localContextRefsToAcpContextItems(nextLocalContextRefs), projectResourceContextItems);');
    expect(displayContentSegment).toContain('const files = pasteResult.referenceImages.map((image, index) => dataUrlToImageFile(image, index));');
    expect(displayContentSegment).toContain('visibleContextItems.map((item)');
    expect(displayContentSegment).toContain('onClick={() => handleRemoveContextItem(item.id)}');
    expect(displayRuntimeSegment).toContain('replaceContextItems={acpContext.replaceContextItems}');
  });

  it('supports project resources and whole-placeholder local file drops in display composers', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayContentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );
    const resourceDialogSegment = source.slice(
      source.indexOf('function CanvasProjectResourcePickerDialog('),
      source.indexOf('function CanvasComposerAttachmentMenu'),
    );

    expect(displayPropsSegment).toContain('projectResourceTrees?: CanvasProjectResourceTrees;');
    expect(displayPropsSegment).toContain('projectResourceItems?: CanvasProjectResourceItems;');
    expect(displayPropsSegment).toContain('externalFileDropTargetRef?: React.RefObject<HTMLElement>;');
    expect(source).toContain("export type CanvasProjectResourcePickerTab = 'prototypes' | 'docs' | 'themes';");
    expect(source).toContain('export function buildCanvasProjectResourceContextItems');
    expect(source).toContain('buildCanvasProjectResourceFolderContextItem');
    expect(source).toContain("resourceKind: 'folder'");
    expect(source).toContain("source: 'axhub-make-placeholder-resource-picker'");
    expect(source).toContain('export interface CanvasProjectResourceItemSelection');
    expect(source).toContain('export function buildCanvasProjectResourceItemSelections');
    expect(source).toContain("selectionMode?: 'context' | 'canvas-items';");
    expect(source).toContain("prototypes: '原型'");
    expect(source).toContain("docs: '资源'");
    expect(source).toContain("themes: '设计'");
    expect(source).toContain('checked={selectedKeys.has(nodeKey)}');
    expect(source).toContain('onCheckedChange={() => onToggleNode(nodeKey)}');
    expect(resourceDialogSegment).toContain('buildCanvasProjectResourceContextItems({');
    expect(displayContentSegment).toContain('const [projectResourceDialogOpen, setProjectResourceDialogOpen] = useState(false);');
    expect(displayContentSegment).toContain('const [projectResourceContextItems, setProjectResourceContextItems] = useState<ContextItem[]>([]);');
    expect(displayContentSegment).toContain('syncDisplayContextItems(contextItems, projectResourceContextItems);');
    expect(displayContentSegment).toContain('addFilesToDisplayAttachments');
    expect(displayContentSegment).toContain('externalFileDropTargetRef?.current');
    expect(displayContentSegment).toContain("if (!event.dataTransfer?.files?.length) return;");
    expect(displayContentSegment).toContain('<CanvasProjectResourcePickerDialog');
    expect(displayContentSegment).toContain("selectionMode=\"context\"");
    expect(displayContentSegment).toContain('onApply={handleApplyProjectResources}');
  });

  it('disables folder selection in project resource picker canvas item mode', () => {
    const source = readCanvasGenerationComposerSource();
    const resourceTreeSegment = source.slice(
      source.indexOf('function CanvasProjectResourceTree('),
      source.indexOf('export function CanvasProjectResourcePickerDialog('),
    );
    const resourceDialogSegment = source.slice(
      source.indexOf('export function CanvasProjectResourcePickerDialog('),
      source.indexOf('function CanvasComposerAttachmentMenu'),
    );

    expect(resourceTreeSegment).toContain("selectionMode: 'context' | 'canvas-items';");
    expect(resourceTreeSegment).toContain("const folderDisabled = selectionMode === 'canvas-items' && isFolder;");
    expect(resourceTreeSegment).toContain("title={folderDisabled ? '文件夹不能添加到画布' : undefined}");
    expect(resourceTreeSegment).toContain('disabled={folderDisabled}');
    expect(resourceTreeSegment).toContain('aria-label={folderDisabled ? `${node.title}，文件夹不能添加到画布` : `选择${node.title}`}');
    expect(resourceDialogSegment).toContain("selectionMode = 'context'");
    expect(resourceDialogSegment).toContain("if (selectionMode === 'canvas-items')");
    expect(resourceDialogSegment).toContain('buildCanvasProjectResourceItemSelections({');
    expect(resourceDialogSegment).toContain('onApply(nextKeys, contextItems, itemSelections);');
    expect(resourceDialogSegment).toContain("{selectionMode === 'canvas-items' ? '添加到画布' : '添加到上下文'}");
  });

  it('keeps the project resource picker aligned with sidebar tabs and a fixed-height dialog', () => {
    const source = readCanvasGenerationComposerSource();
    const resourceTreeSegment = source.slice(
      source.indexOf('function CanvasProjectResourceTree('),
      source.indexOf('function CanvasProjectResourcePickerDialog('),
    );
    const resourceDialogSegment = source.slice(
      source.indexOf('function CanvasProjectResourcePickerDialog('),
      source.indexOf('function CanvasComposerAttachmentMenu'),
    );

    expect(source).toContain("import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';");
    expect(resourceDialogSegment).toContain('h-[520px] max-h-[calc(100vh-96px)]');
    expect(source).toContain("import { Input } from '@/components/ui/input';");
    expect(resourceDialogSegment).toContain('grid-rows-[auto_auto_minmax(0,1fr)_auto]');
    expect(resourceDialogSegment).toContain('<DialogTitle className="sr-only">本项目资源</DialogTitle>');
    expect(resourceDialogSegment).not.toContain('<DialogHeader');
    expect(resourceDialogSegment).not.toContain('<DialogTitle className="text-base">本项目资源</DialogTitle>');
    expect(resourceDialogSegment).toContain('<ToggleGroup');
    expect(resourceDialogSegment).toContain('type="single"');
    expect(resourceDialogSegment).toContain('value={activeTab}');
    expect(resourceDialogSegment).toContain('onValueChange={(value) => value && setActiveTab(value as CanvasProjectResourcePickerTab)}');
    expect(resourceDialogSegment).toContain('className="w-auto justify-start gap-1 px-5 pb-3 pt-5"');
    expect(resourceDialogSegment).toContain('<ToggleGroupItem');
    expect(resourceDialogSegment).toContain('h-8 w-auto min-w-[44px] px-3 text-sm leading-none whitespace-nowrap rounded-sm bg-transparent hover:bg-muted/50 data-[state=off]:!text-muted-foreground/60 data-[state=off]:hover:!text-muted-foreground data-[state=on]:bg-accent data-[state=on]:!text-foreground data-[state=on]:!font-medium');
    expect(resourceDialogSegment).not.toContain("activeTab === tab ? 'bg-foreground text-background hover:bg-foreground' : 'text-muted-foreground'");
    expect(resourceDialogSegment).toContain("const [searchQuery, setSearchQuery] = useState('');");
    expect(resourceDialogSegment).toContain('filterCanvasProjectResourceTreeByQuery(activeTree, searchQuery)');
    expect(resourceDialogSegment).toContain('<Input');
    expect(resourceDialogSegment).toContain('placeholder="搜索..."');
    expect(resourceDialogSegment).toContain('aria-label="搜索资源"');
    expect(resourceDialogSegment).toContain("emptyText={searchQuery.trim() ? '没有匹配的资源' : '暂无资源'}");
    expect(resourceDialogSegment).toContain('<ScrollArea className="min-h-0 border-y px-2 py-2">');
    expect(resourceTreeSegment).toContain('min-h-7');
    expect(resourceTreeSegment).toContain('rounded-sm px-2 py-1 text-left text-[13px] leading-5 hover:bg-accent');
    expect(resourceTreeSegment).toContain('size-3.5 shrink-0 text-muted-foreground');
  });

  it('can restore and persist an optional browser draft for runtime composers', () => {
    const source = readCanvasGenerationComposerSource();
    const runtimeContentSegment = source.slice(
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
      source.indexOf('function useAssistantUiDialogOverlayDismiss'),
    );
    const draftBridgeSegment = source.slice(
      source.indexOf('function useCanvasGenerationComposerDraftBridge'),
      source.indexOf('function CanvasGenerationRuntimeComposerContent('),
    );
    const transportSegment = source.slice(
      source.indexOf('class CanvasGenerationMakeTransport'),
      source.indexOf('class CanvasGenerationDisplayTransport'),
    );

    expect(source).toContain("from './canvasGenerationComposerDraft';");
    expect(source).toContain('draftStorageKey?: string | null;');
    expect(source).toContain('function useCanvasGenerationComposerDraftBridge');
    expect(runtimeContentSegment).toContain('useCanvasGenerationComposerDraftBridge({');
    expect(runtimeContentSegment).toContain('draftStorageKey,');
    expect(draftBridgeSegment).toContain('readCanvasGenerationComposerDraft(storage, draftStorageKey)');
    expect(draftBridgeSegment).toContain('loadedDraftStorageKeyRef');
    expect(draftBridgeSegment).toContain('resolveCanvasGenerationComposerDraftRestoreText({');
    expect(draftBridgeSegment).toContain('draftStorageKeyChanged');
    expect(draftBridgeSegment).toContain('composer.setText(restoreText);');
    expect(draftBridgeSegment).toContain('const composerText = useAuiState((state) => state.composer.text);');
    expect(draftBridgeSegment).not.toContain('composer.subscribe(() => {');
    expect(draftBridgeSegment).toContain('writeCanvasGenerationComposerDraft(storage, draftStorageKey, composerText);');
    expect(transportSegment).toContain('private readonly draftStorageKey: string | null | undefined');
    expect(transportSegment).toContain('clearCanvasGenerationComposerDraft(storage, this.draftStorageKey);');
    expect(transportSegment).toContain('writeCanvasGenerationComposerDraft(storage, this.draftStorageKey, prompt);');
  });

  it('can restore and persist an optional browser draft for placeholder display composers', () => {
    const source = readCanvasGenerationComposerSource();
    const displayPropsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationDisplayComposerProps'),
      source.indexOf('interface CanvasGenerationRuntimeComposerProps'),
    );
    const displayComponentSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerContent('),
      source.indexOf('function CanvasGenerationDisplayComposerWithoutAcp'),
    );
    const displayAcpSegment = source.slice(
      source.indexOf('function CanvasGenerationDisplayComposerRuntime'),
      source.indexOf('function CanvasGenerationDisplayComposerWithAcp'),
    );

    expect(displayPropsSegment).toContain('draftStorageKey?: string | null;');
    expect(displayComponentSegment).toContain('draftStorageKey,');
    expect(displayComponentSegment).toContain('loadedDisplayDraftStorageKeyRef');
    expect(displayComponentSegment).toContain('readCanvasGenerationComposerDraft(storage, draftStorageKey)');
    expect(displayComponentSegment).toContain('resolveCanvasGenerationComposerDraftRestoreText({');
    expect(displayComponentSegment).toContain('draftStorageKeyChanged');
    expect(displayComponentSegment).toContain('inputRef.current.value = restoreText;');
    expect(displayComponentSegment).toContain('const nextText = event.currentTarget.value;');
    expect(displayComponentSegment).toContain('setDisplayText(nextText);');
    expect(displayComponentSegment).toContain('persistDisplayDraft(nextText);');
    expect(source).toContain('type CanvasGenerationDisplaySubmitResult = boolean | void;');
    expect(displayComponentSegment).toContain('const attachmentSelection = await resolveComposerAttachmentSubmitSelection(displayReferenceAttachments);');
    expect(displayComponentSegment).toContain('const [submitting, setSubmitting] = useState(false);');
    expect(displayComponentSegment).toContain('const controlsDisabled = disabled || optimizingPrompt || submitting;');
    expect(displayComponentSegment).toContain('setSubmitting(true);');
    expect(displayComponentSegment).toContain('const submitResult = await onSubmitText?.(text, {');
    expect(displayComponentSegment).toContain('localContextRefs: currentLocalContextRefsRef.current,');
    expect(displayComponentSegment).toContain('if (submitResult === false) {');
    expect(displayComponentSegment).toContain('persistDisplayDraft(text);');
    expect(displayComponentSegment).toContain("toast.error(error instanceof Error ? error.message : '发送失败');");
    expect(displayComponentSegment).toContain('setSubmitting(false);');
    expect(displayComponentSegment).toContain('clearCanvasGenerationComposerDraft(storage, draftStorageKey);');
    expect(displayComponentSegment).toContain("inputRef.current.value = '';");
    expect(displayComponentSegment).toContain('await aui.composer().clearAttachments();');
    expect(displayComponentSegment).toContain('currentLocalContextRefsRef.current = [];');
    expect(displayComponentSegment).toContain('currentLocalContextItemsRef.current = [];');
    expect(displayComponentSegment).toContain('syncDisplayContextItems([], []);');
    expect(displayComponentSegment).toContain('submitting={submitting}');
    expect(displayComponentSegment).toContain('onChange={handleInputChange}');
    expect(displayAcpSegment).toContain('return onSubmit?.(text, {');
  });

  it('renders optional floating top content above the runtime composer body', () => {
    const source = readCanvasGenerationComposerSource();
    const propsSegment = source.slice(
      source.indexOf('export interface CanvasGenerationComposerProps'),
      source.indexOf('export function extractCanvasGenerationPromptFromMessage'),
    );
    const componentSegment = source.slice(
      source.indexOf('export default function CanvasGenerationComposer({'),
      source.length,
    );

    expect(propsSegment).toContain('topContent?: React.ReactNode;');
    expect(componentSegment).toContain('topContent,');
    expect(componentSegment).toContain('{topContent ? (');
    expect(componentSegment).toContain('ax-ai-image-composer-top-content');
    expect(componentSegment.indexOf('ax-ai-image-composer-top-content')).toBeLessThan(
      componentSegment.indexOf('<CanvasGenerationRuntimeComposerWithAcp'),
    );
  });
});
