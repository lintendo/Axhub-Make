import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import './AiImageGenerationComposer.css';
import { ChevronDown, CircleHelp, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import CanvasGenerationComposer, {
  type CanvasAiSubmitRequest,
  extractCanvasGenerationReferenceImagesFromMessage,
  type CanvasGenerationSubmitResult,
} from '../shared/CanvasGenerationComposer';

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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { getAiImageTaskStore, type AiImageTaskParams, type AiImageTaskRecord } from './aiImageStore';
import type { CanvasLocalContextRef } from './canvasReferenceImages';
import type { PromptClientPreference } from '../../types';
import { pickCanvasAiScenePlaceholder } from '../ai-generation/canvasAiSceneRegistry';
import { withProjectScope } from '../../services/projectScope';

export interface AiImageComposerPlacement {
  left: number;
  top: number;
  width: number;
}

interface AiImageGenerationComposerProps {
  projectId: string;
  canPasteReferenceImages?: boolean;
  conversationId?: string;
  assistantProjectPath?: string;
  draftStorageKey?: string | null;
  generatorElementId?: string;
  initialReferenceImages?: string[];
  initialLocalContextRefs?: CanvasLocalContextRef[];
  preferredPromptClient?: PromptClientPreference;
  onPasteReferenceImages?: () => Promise<string[]>;
  onOpenAISettings?: () => void;
  onSubmitPrompt?: (request: CanvasAiSubmitRequest) => Promise<CanvasGenerationSubmitResult>;
  placement: AiImageComposerPlacement;
  topContent?: ReactNode;
  onParamsChanged?: (params: AiImageTaskParams) => void;
  onTaskStarted?: (task: AiImageTaskRecord) => void;
  onTaskFinished?: (task: AiImageTaskRecord) => void;
}

interface AiImageConfigResponse {
  ai?: {
    imageGeneration?: {
      size?: string;
      quality?: 'auto' | 'low' | 'medium' | 'high';
      outputFormat?: 'png' | 'jpeg' | 'webp';
      outputCompression?: number | null;
      moderation?: 'auto' | 'low';
      n?: number;
    };
  };
}

type UpdateAiImageParam = <K extends keyof AiImageTaskParams>(key: K, value: AiImageTaskParams[K]) => void;
type ImageDimensions = { width: string; height: string };
type NormalizedAiImageConfig = {
  params: AiImageTaskParams;
};

const CUSTOM_SIZE_VALUE = 'custom';
const IMAGE_SETTINGS_SELECT_CONTENT_STYLE = { zIndex: 1400 } satisfies CSSProperties;

const QUALITY_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
] as const;

const SIZE_PRESETS = [
  { label: '手机整屏 768x1664', value: '768x1664', width: 768, height: 1664 },
  { label: '手机高清 1168x2528', value: '1168x2528', width: 1168, height: 2528 },
  { label: 'PC 工作台 1440x896', value: '1440x896', width: 1440, height: 896 },
  { label: 'PC 高清 1920x1200', value: '1920x1200', width: 1920, height: 1200 },
  { label: '方图 1024x1024', value: '1024x1024', width: 1024, height: 1024 },
  { label: '自定义', value: 'custom', width: null, height: null },
  { label: '自动', value: 'auto', width: null, height: null },
] as const;

const COUNT_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

const FORMAT_OPTIONS = [
  { label: 'PNG', value: 'png' },
  { label: 'JPEG', value: 'jpeg' },
  { label: 'WebP', value: 'webp' },
] as const;

const IMAGE_FIELD_HINTS = {
  size: '选择接近真实手机或桌面产品视口的 Image 2 合规尺寸，也可自定义。自定义宽高需为 16 的倍数，最长边小于 3840px，比例不超过 3:1。',
  quality: '质量越高通常细节越好，但生成时间和消耗也可能更高。',
  count: '选择后会按方案数量生成多个设计方向。',
  format: '选择生成图片的输出格式。',
  promptOptimization: '开启后会要求 AI 完整使用输入内容，不主动改写提示词。',
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

const DEFAULT_PARAMS: AiImageTaskParams = {
  size: 'auto',
  quality: 'auto',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
  disable_prompt_optimization: false,
};
const DEFAULT_CONFIG: NormalizedAiImageConfig = {
  params: DEFAULT_PARAMS,
};

function providerToPromptClientPreference(provider: string | null | undefined): PromptClientPreference {
  const normalized = String(provider || '').trim().toLowerCase();
  if (
    normalized === 'claude'
    || normalized === 'codex'
    || normalized === 'opencode'
  ) {
    return `acp:${normalized}` as PromptClientPreference;
  }
  return null;
}

function normalizeParams(config: AiImageConfigResponse | null): NormalizedAiImageConfig {
  const aiConfig = config?.ai?.imageGeneration;
  return {
    params: {
      size: aiConfig?.size || DEFAULT_PARAMS.size,
      quality: aiConfig?.quality || DEFAULT_PARAMS.quality,
      output_format: aiConfig?.outputFormat || DEFAULT_PARAMS.output_format,
      output_compression: aiConfig?.outputCompression ?? DEFAULT_PARAMS.output_compression,
      moderation: aiConfig?.moderation || DEFAULT_PARAMS.moderation,
      n: typeof aiConfig?.n === 'number' ? Math.max(1, Math.min(10, Math.round(aiConfig.n))) : DEFAULT_PARAMS.n,
    },
  };
}

function normalizeDimensionInput(value: string): string {
  return value.replace(/[^\d]/gu, '');
}

function dimensionsToSize(width: string, height: string): string {
  const normalizedWidth = normalizeDimensionInput(width);
  const normalizedHeight = normalizeDimensionInput(height);
  return normalizedWidth && normalizedHeight
    ? `${normalizedWidth}x${normalizedHeight}`
    : CUSTOM_SIZE_VALUE;
}

function sizeToDimensions(size: string): ImageDimensions {
  const preset = SIZE_PRESETS.find((item) => item.value === size);
  if (preset?.width && preset.height) {
    return { width: String(preset.width), height: String(preset.height) };
  }
  if (size === CUSTOM_SIZE_VALUE) {
    return { width: '', height: '' };
  }
  const match = size.match(/^(\d+)x(\d+)$/u);
  return {
    width: match?.[1] || '自动',
    height: match?.[2] || '自动',
  };
}

interface ImageSettingsProps {
  params: AiImageTaskParams;
  activeSizeLabel: string;
  activeQualityLabel: string;
  activeCountLabel: string;
  activeFormatLabel: string;
  currentDimensions: ImageDimensions;
  onCustomDimensionsChanged: (dimensions: ImageDimensions) => void;
  updateParam: UpdateAiImageParam;
}

function ImageSettingsPopover({
  params,
  activeSizeLabel,
  activeQualityLabel,
  activeCountLabel,
  activeFormatLabel,
  currentDimensions,
  onCustomDimensionsChanged,
  updateParam,
}: ImageSettingsProps) {
  const isCustomSize = activeSizeLabel === '自定义';
  const updateCustomDimension = (dimension: 'width' | 'height', value: string) => {
    const nextValue = normalizeDimensionInput(value);
    const nextWidth = dimension === 'width' ? nextValue : normalizeDimensionInput(currentDimensions.width);
    const nextHeight = dimension === 'height' ? nextValue : normalizeDimensionInput(currentDimensions.height);
    onCustomDimensionsChanged({ width: nextWidth, height: nextHeight });
    updateParam('size', dimensionsToSize(nextWidth, nextHeight));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-axhub-ai-image-composer-settings-trigger
          className="ax-ai-image-settings-trigger"
          aria-label="图片设置"
        >
          <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
          <span
            data-axhub-ai-image-composer-settings-summary
            className="ax-ai-image-settings-summary"
          >
            {activeSizeLabel} · {activeQualityLabel} · {activeCountLabel} · {activeFormatLabel}
          </span>
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="z-[1300] w-[320px] p-3">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">图片设置</div>
            <div className="text-xs text-muted-foreground">
              {activeSizeLabel} · {activeQualityLabel} · {activeCountLabel} · {activeFormatLabel}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <FieldLabelWithHint label="尺寸" hint={IMAGE_FIELD_HINTS.size} />
              <Select
                value={isCustomSize ? CUSTOM_SIZE_VALUE : params.size}
                onValueChange={(value) => {
                  if (value === CUSTOM_SIZE_VALUE) {
                    onCustomDimensionsChanged({ width: '', height: '' });
                  }
                  updateParam('size', value);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={IMAGE_SETTINGS_SELECT_CONTENT_STYLE}>
                  {SIZE_PRESETS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1.5">
              <FieldLabelWithHint label="质量" hint={IMAGE_FIELD_HINTS.quality} />
              <Select value={params.quality} onValueChange={(value) => updateParam('quality', value as AiImageTaskParams['quality'])}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={IMAGE_SETTINGS_SELECT_CONTENT_STYLE}>
                  {QUALITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex h-9 items-center rounded-md border bg-background px-3 text-xs text-foreground focus-within:outline focus-within:outline-1 focus-within:outline-ring">
              <span className="mr-1.5 text-muted-foreground">W</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="自定义图片宽度"
                value={currentDimensions.width}
                onChange={(event) => updateCustomDimension('width', event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                placeholder="自动"
              />
            </label>
            <label className="flex h-9 items-center rounded-md border bg-background px-3 text-xs text-foreground focus-within:outline focus-within:outline-1 focus-within:outline-ring">
              <span className="mr-1.5 text-muted-foreground">H</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="自定义图片高度"
                value={currentDimensions.height}
                onChange={(event) => updateCustomDimension('height', event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                placeholder="自动"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <FieldLabelWithHint label="方案数量" hint={IMAGE_FIELD_HINTS.count} />
              <Select value={String(params.n)} onValueChange={(value) => updateParam('n', Number(value))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={IMAGE_SETTINGS_SELECT_CONTENT_STYLE}>
                  {COUNT_OPTIONS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count} 个
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1.5">
              <FieldLabelWithHint label="格式" hint={IMAGE_FIELD_HINTS.format} />
              <Select value={params.output_format} onValueChange={(value) => updateParam('output_format', value as AiImageTaskParams['output_format'])}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={IMAGE_SETTINGS_SELECT_CONTENT_STYLE}>
                  {FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label
            className="space-y-1.5 text-xs font-medium text-foreground"
          >
            <FieldLabelWithHint label="禁止优化提示词" hint={IMAGE_FIELD_HINTS.promptOptimization} />
            <div className="flex h-8 items-center gap-2">
              <Switch
                checked={params.disable_prompt_optimization === true}
                onCheckedChange={(checked) => updateParam('disable_prompt_optimization', checked === true)}
                aria-label="禁止优化提示词"
              />
              <span>开启</span>
            </div>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AiImageComposerAction({
  params,
  activeSizeLabel,
  activeQualityLabel,
  activeCountLabel,
  activeFormatLabel,
  currentDimensions,
  onCustomDimensionsChanged,
  updateParam,
}: ImageSettingsProps) {
  return (
    <ImageSettingsPopover
      params={params}
      activeSizeLabel={activeSizeLabel}
      activeQualityLabel={activeQualityLabel}
      activeCountLabel={activeCountLabel}
      activeFormatLabel={activeFormatLabel}
      currentDimensions={currentDimensions}
      onCustomDimensionsChanged={onCustomDimensionsChanged}
      updateParam={updateParam}
    />
  );
}

export default function AiImageGenerationComposer({
  projectId,
  canPasteReferenceImages,
  conversationId,
  assistantProjectPath,
  draftStorageKey,
  generatorElementId,
  initialReferenceImages,
  initialLocalContextRefs,
  preferredPromptClient,
  onPasteReferenceImages,
  onOpenAISettings,
  onSubmitPrompt,
  placement,
  topContent,
  onParamsChanged,
  onTaskStarted,
  onTaskFinished,
}: AiImageGenerationComposerProps) {
  const [config, setConfig] = useState<NormalizedAiImageConfig>(DEFAULT_CONFIG);
  const params = config.params;
  const [placeholder] = useState(() => pickCanvasAiScenePlaceholder('design'));
  const [customDimensions, setCustomDimensions] = useState<ImageDimensions>({ width: '', height: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(withProjectScope('/api/config', { projectId })).then((response) => response.ok ? response.json() : null).then((config: AiImageConfigResponse | null) => {
      if (cancelled) return;
      setConfig(normalizeParams(config));
    }).catch(() => {
      if (!cancelled) {
        setConfig(DEFAULT_CONFIG);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    onParamsChanged?.(params);
  }, [onParamsChanged, params]);

  const customDimensionSize = useMemo(() => dimensionsToSize(customDimensions.width, customDimensions.height), [customDimensions]);
  const activeSizeLabel = useMemo(() => {
    if (params.size === CUSTOM_SIZE_VALUE || customDimensionSize === params.size) return '自定义';
    const preset = SIZE_PRESETS.find((item) => item.value === params.size);
    if (preset) return preset.label;
    return /^\d+x\d+$/u.test(params.size) ? '自定义' : params.size;
  }, [customDimensionSize, params.size]);
  const activeQualityLabel = useMemo(() => (
    QUALITY_OPTIONS.find((item) => item.value === params.quality)?.label || params.quality
  ), [params.quality]);
  const activeFormatLabel = useMemo(() => (
    FORMAT_OPTIONS.find((item) => item.value === params.output_format)?.label || params.output_format.toUpperCase()
  ), [params.output_format]);
  const activeCountLabel = useMemo(() => `${params.n} 个`, [params.n]);
  const fallbackDimensions = useMemo(() => sizeToDimensions(params.size), [params.size]);
  const currentDimensions = useMemo(() => (
    params.size === CUSTOM_SIZE_VALUE ? customDimensions : fallbackDimensions
  ), [customDimensions, fallbackDimensions, params.size]);

  const updateParam = <K extends keyof AiImageTaskParams>(key: K, value: AiImageTaskParams[K]) => {
    setConfig((previous) => ({
      ...previous,
      params: {
        ...previous.params,
        [key]: value,
      },
    }));
  };

  const handleSubmitPrompt = useCallback(async (
    request: CanvasAiSubmitRequest,
  ): Promise<CanvasGenerationSubmitResult> => {
    const message = request.message;
    const referenceImages = request.referenceImages.length
      ? request.referenceImages
      : extractCanvasGenerationReferenceImagesFromMessage(message);
    const prompt = request.prompt;
    const selectedPromptClient = providerToPromptClientPreference(request.provider) || preferredPromptClient;
    setSubmitting(true);
    try {
      if (onSubmitPrompt) {
        return await onSubmitPrompt({
          ...request,
          prompt,
          referenceImages,
          sceneSettings: params,
        });
      }
      const task = await getAiImageTaskStore().submit({
        prompt,
        params,
        ...(generatorElementId ? { generatorElementId } : {}),
        provider: request.provider,
        model: request.model,
        mode: request.mode,
        thought: request.thought,
        contextBundle: request.contextBundle,
        preferredPromptClient: selectedPromptClient,
        ...(conversationId ? { conversationId } : {}),
        ...(referenceImages.length ? { referenceImages } : {}),
        ...(initialLocalContextRefs?.length ? {
          sourcePrompt: prompt,
          localContextRefs: initialLocalContextRefs,
          preferredPromptClient: selectedPromptClient,
        } : {}),
      }, {
        onCreated: (createdTask) => onTaskStarted?.(createdTask),
      });
      onTaskFinished?.(task);
      if (task.status === 'done') {
        toast.success(`生成完成，共 ${task.outputImages.length} 张`);
        return {
          ok: true,
          text: `生成完成，共 ${task.outputImages.length} 张`,
          artifactRefs: task.outputImages,
        };
      }
      toast.error(task.error || '图片生成失败');
      return {
        ok: false,
        text: task.error || '图片生成失败',
        error: task.error || '图片生成失败',
      };
    } finally {
      setSubmitting(false);
    }
  }, [conversationId, generatorElementId, initialLocalContextRefs, onSubmitPrompt, onTaskFinished, onTaskStarted, params, preferredPromptClient]);

  return (
    <CanvasGenerationComposer
      projectId={projectId}
      scene="page"
      dataAttribute="data-axhub-ai-image-composer"
      className="aui-root ax-ai-image-composer-host pointer-events-auto absolute z-[1200]"
      placement={placement}
      placementMode="fixed-bottom-center"
      topContent={topContent}
      workspacePath={assistantProjectPath}
      placeholder={placeholder}
      preferredPromptClient={preferredPromptClient}
      ariaLabel="AI 图片生成提示词"
      sendTooltip="生成图片"
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
      renderLeadingActions={() => (
        <AiImageComposerAction
          params={params}
          activeSizeLabel={activeSizeLabel}
          activeQualityLabel={activeQualityLabel}
          activeCountLabel={activeCountLabel}
          activeFormatLabel={activeFormatLabel}
          currentDimensions={currentDimensions}
          onCustomDimensionsChanged={setCustomDimensions}
          updateParam={updateParam}
        />
      )}
    />
  );
}
