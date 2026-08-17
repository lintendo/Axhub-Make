import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import '../ai-image/AiImageGenerationComposer.css';
import { ChevronDown, CircleHelp, SlidersHorizontal } from 'lucide-react';

import CanvasGenerationComposer, {
  type CanvasAiSubmitRequest,
  extractCanvasGenerationReferenceImagesFromMessage,
  type CanvasGenerationComposerPlacement,
  type CanvasGenerationSubmitResult,
} from '../shared/CanvasGenerationComposer';
import type { ThemeResourceItem } from '../resources/resource.types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  NO_PROTOTYPE_THEME_VALUE,
  resolvePrototypeGenerationInitialThemeName,
  resolvePrototypeGenerationSyncedThemeName,
} from './prototypeGenerationThemeSelection';
import type { CanvasLocalContextRef } from '../ai-image/canvasReferenceImages';
import { pickCanvasAiScenePlaceholder } from '../ai-generation/canvasAiSceneRegistry';
import { PrototypeThemeSearchSelect } from './PrototypeThemeSearchSelect';
import type { PromptClientPreference } from '../../types';

export interface PrototypeGenerationComposerSettings {
  count?: number;
  themeName: string;
}

export interface PrototypeGenerationComposerProps {
  projectId: string;
  allowAttachments?: true;
  assistantProjectPath?: string;
  canPasteReferenceImages?: boolean;
  defaultThemeName?: string | null;
  draftStorageKey?: string | null;
  initialLocalContextRefs?: CanvasLocalContextRef[];
  initialReferenceImages?: string[];
  onPasteReferenceImages?: () => Promise<string[]>;
  onOpenAISettings?: () => void;
  placement: CanvasGenerationComposerPlacement;
  preferredPromptClient?: PromptClientPreference;
  topContent?: React.ReactNode;
  themes?: ThemeResourceItem[];
  onSubmitPrompt: (
    request: CanvasAiSubmitRequest<PrototypeGenerationComposerSettings>,
  ) => Promise<CanvasGenerationSubmitResult>;
}

const COUNT_OPTIONS = [1, 2, 3, 4];
const UNSPECIFIED_PROTOTYPE_SETTING_VALUE = '__unspecified__';
const PROTOTYPE_SETTINGS_SELECT_CONTENT_STYLE = { zIndex: 1400 } satisfies CSSProperties;
const PROTOTYPE_GENERATION_FIELD_HINTS = {
  count: '选择后会按方案数量生成，并在最终提示词中加载本地 explore-options（多方案探索）技能提示。',
  theme: '选择一个设计系统后，原型会尽量沿用该资源的视觉风格和组件约束。',
} as const;

function FieldLabelWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`${label}说明`}
            >
              <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px] text-xs leading-5">
            {hint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

export default function PrototypeGenerationComposer({
  projectId,
  assistantProjectPath,
  canPasteReferenceImages,
  defaultThemeName,
  draftStorageKey,
  initialLocalContextRefs,
  initialReferenceImages,
  onPasteReferenceImages,
  onOpenAISettings,
  placement,
  preferredPromptClient,
  topContent,
  themes,
  onSubmitPrompt,
}: PrototypeGenerationComposerProps) {
  const [generationCount, setGenerationCount] = useState<number | undefined>(undefined);
  const [placeholder] = useState(() => pickCanvasAiScenePlaceholder('page'));
  const [selectedThemeName, setSelectedThemeName] = useState(() => resolvePrototypeGenerationInitialThemeName(themes, defaultThemeName));
  const [submitting, setSubmitting] = useState(false);
  const previousDefaultThemeNameRef = useRef(defaultThemeName);
  const userSelectedThemeRef = useRef(false);

  useEffect(() => {
    const previousDefaultThemeName = previousDefaultThemeNameRef.current;
    setSelectedThemeName((current) => resolvePrototypeGenerationSyncedThemeName({
      currentThemeName: current,
      defaultThemeName,
      previousDefaultThemeName,
      themes,
      userSelectedTheme: userSelectedThemeRef.current,
    }));
    previousDefaultThemeNameRef.current = defaultThemeName;
  }, [defaultThemeName, themes]);

  const selectedTheme = useMemo(() => (
    themes?.find((theme) => theme.name === selectedThemeName) || null
  ), [selectedThemeName, themes]);
  const themeLabel = selectedTheme?.displayName || selectedTheme?.name || '无设计系统';
  const hasGenerationCount = typeof generationCount === 'number';
  const hasSelectedTheme = selectedThemeName !== NO_PROTOTYPE_THEME_VALUE;
  const settingsSummary = [
    hasGenerationCount ? `${generationCount} 个` : null,
    hasSelectedTheme ? themeLabel : null,
  ].filter(Boolean).join(' · ') || '未指定';

  const handleSubmitPrompt = useCallback(async (request: CanvasAiSubmitRequest) => {
    const message = request.message;
    const referenceImages = request.referenceImages.length
      ? request.referenceImages
      : extractCanvasGenerationReferenceImagesFromMessage(message);
    setSubmitting(true);
    try {
      const sceneSettings = {
        count: generationCount,
        themeName: selectedThemeName === NO_PROTOTYPE_THEME_VALUE ? '' : selectedTheme?.name || '',
      };
      return await onSubmitPrompt({
        ...request,
        referenceImages,
        provider: request.provider,
        model: request.model,
        mode: request.mode,
        thought: request.thought,
        contextBundle: request.contextBundle,
        sceneSettings,
      });
    } finally {
      setSubmitting(false);
    }
  }, [generationCount, onSubmitPrompt, selectedTheme, selectedThemeName]);

  return (
    <CanvasGenerationComposer
      projectId={projectId}
      scene="page"
      dataAttribute="data-axhub-prototype-composer"
      className="aui-root ax-ai-image-composer-host pointer-events-auto absolute z-[1200]"
      placement={placement}
      placementMode="fixed-bottom-center"
      topContent={topContent}
      workspacePath={assistantProjectPath}
      placeholder={placeholder}
      preferredPromptClient={preferredPromptClient}
      ariaLabel="AI 原型生成提示词"
      sendTooltip="生成原型"
      addAttachmentTooltip="添加参考图"
      allowAttachments={true}
      showSelectors={true}
      attachmentsClassName="ax-ai-image-composer-attachments"
      canPasteReferenceImages={canPasteReferenceImages}
      draftStorageKey={draftStorageKey}
      rootClassName="ax-ai-image-composer-root"
      footerClassName="ax-ai-image-composer-footer"
      footerLeadingActionsClassName="ax-ai-image-composer-footer-leading-actions"
      footerActionsClassName="ax-ai-image-composer-footer-actions"
      initialLocalContextRefs={initialLocalContextRefs}
      initialReferenceImages={initialReferenceImages}
      onPasteReferenceImages={onPasteReferenceImages}
      onOpenAISettings={onOpenAISettings}
      submitting={submitting}
      onSubmitPrompt={handleSubmitPrompt}
      renderPostSelectorActions={() => (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-axhub-prototype-composer-settings-trigger
              className="ax-ai-image-settings-trigger"
              aria-label="原型设置"
            >
              <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
              <span
                data-axhub-prototype-composer-settings-summary
                className="ax-ai-image-settings-summary"
              >
                {settingsSummary}
              </span>
              <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="z-[1300] w-[320px] p-3">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">原型设置</div>
                <div className="text-xs text-muted-foreground">{settingsSummary}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <FieldLabelWithHint label="方案数量" hint={PROTOTYPE_GENERATION_FIELD_HINTS.count} />
                  <Select
                    value={hasGenerationCount ? String(generationCount) : UNSPECIFIED_PROTOTYPE_SETTING_VALUE}
                    onValueChange={(value) => setGenerationCount(value === UNSPECIFIED_PROTOTYPE_SETTING_VALUE ? undefined : Number(value))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={PROTOTYPE_SETTINGS_SELECT_CONTENT_STYLE}>
                      <SelectItem value={UNSPECIFIED_PROTOTYPE_SETTING_VALUE}>
                        未指定
                      </SelectItem>
                      {COUNT_OPTIONS.map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {count} 个
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-1.5">
                  <FieldLabelWithHint label="设计系统" hint={PROTOTYPE_GENERATION_FIELD_HINTS.theme} />
                  <PrototypeThemeSearchSelect
                    themes={themes}
                    value={selectedThemeName}
                    onValueChange={(themeName) => {
                      userSelectedThemeRef.current = true;
                      setSelectedThemeName(themeName);
                    }}
                  />
                </label>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    />
  );
}
