import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { resolveAcpPromptClientProvider } from '@/common/acpModelConfig';
import { normalizePromptClientPreference } from '@/common/promptExecution';
import type { ItemData, PromptClientPreference } from '../../types';
import type {
  CanvasAiScene,
  CanvasAiSubmitRequest,
  CanvasGenerationAttachmentPart,
} from '../shared/CanvasGenerationComposer';
import type { CanvasLocalContextRef } from '../ai-image/canvasReferenceImages';
import type { GenerationArtifactRecord } from './generationArtifactHistoryStore';
import type { AiRunSseEvent } from './aiRunClient';
import {
  createCanvasDirectRunController,
  type CanvasDirectRunController,
  type CanvasDirectRunSubmitPayload,
} from './canvasDirectRun';
import { buildCanvasViewportAiPrompt, type CanvasViewportRect } from './canvasViewportAiPrompt';
import { createCanvasViewportAiTiming } from './canvasViewportAiTiming';
import {
  createCanvasViewportAiSessionStore,
  type CanvasViewportAiSession,
} from './canvasViewportAiSession';

export interface CanvasAiGenerationRequest {
  scene: CanvasAiScene;
  prompt?: string;
  source?: 'placeholder-start' | 'resource-start' | 'theme-start' | 'canvas-start' | 'canvas-viewport' | 'annotation-prompt-card';
  generatorId?: string;
  canvasFilePath?: string;
  createdPrototype?: ItemData;
  attachments?: CanvasGenerationAttachmentPart[];
  referenceImages?: string[];
  localContextRefs?: CanvasLocalContextRef[];
  provider?: string | null;
  model?: string | null;
  mode?: string | null;
  thought?: string | null;
  contextBundle?: CanvasAiSubmitRequest['contextBundle'];
  sceneSettings?: CanvasAiSubmitRequest['sceneSettings'];
  statusTaskId?: string;
  threadId?: string | null;
  conversationId?: string | null;
  signal?: AbortSignal;
  onPrepared?: (payload: CanvasDirectRunSubmitPayload) => void | Promise<void>;
  onAccepted?: (payload: CanvasDirectRunSubmitPayload) => void | Promise<void>;
  onEvent?: (event: AiRunSseEvent) => void | Promise<void>;
}

export interface CanvasAiGenerationResult {
  ok: boolean;
  artifacts?: GenerationArtifactRecord[];
  message?: string;
}

export interface CanvasViewportAiCapture {
  dataUrl: string;
  viewportRect: CanvasViewportRect;
  visibleElementIds: string[];
}

interface CanvasAiGenerationToolProps {
  projectId: string;
  captureViewport?: () => Promise<CanvasViewportAiCapture>;
  canvasFilePath?: string;
  preferredModel?: string | null;
  preferredPromptClient?: PromptClientPreference;
  onOpenAISettings?: () => void;
  onSubmitCanvasAssistantPrompt?: (request: CanvasAiGenerationRequest) => Promise<CanvasAiGenerationResult | boolean> | CanvasAiGenerationResult | boolean;
}

function getCanvasDirectTaskError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.trim() || 'AI 执行失败';
}

export default function CanvasAiGenerationTool({
  projectId,
  captureViewport,
  canvasFilePath,
  preferredModel,
  preferredPromptClient,
  onOpenAISettings,
  onSubmitCanvasAssistantPrompt,
}: CanvasAiGenerationToolProps) {
  const canvasViewportDirectRunControllerRef = useRef<CanvasDirectRunController | null>(null);
  const canvasViewportActiveRunRef = useRef<{ abort: () => Promise<boolean> } | null>(null);
  const onSubmitCanvasAssistantPromptRef = useRef(onSubmitCanvasAssistantPrompt);
  const [canvasViewportRunActive, setCanvasViewportRunActive] = useState(false);
  const [canvasViewportError, setCanvasViewportError] = useState<string | null>(null);

  useEffect(() => {
    onSubmitCanvasAssistantPromptRef.current = onSubmitCanvasAssistantPrompt;
  }, [onSubmitCanvasAssistantPrompt]);

  const getCanvasViewportDirectRunController = useCallback(() => {
    if (!canvasViewportDirectRunControllerRef.current) {
      canvasViewportDirectRunControllerRef.current = createCanvasDirectRunController({
        maxActiveRuns: 1,
        submit: ({ request, signal, onPrepared, onAccepted }) => {
          const submitter = onSubmitCanvasAssistantPromptRef.current;
          if (!submitter) return Promise.resolve(false);
          return Promise.resolve(submitter({
            ...request,
            signal,
            onPrepared,
            onAccepted,
          }));
        },
      });
    }
    return canvasViewportDirectRunControllerRef.current;
  }, []);

  const handleCanvasViewportAiCancel = useCallback(() => {
    void canvasViewportActiveRunRef.current?.abort();
  }, []);

  const reportCanvasViewportError = useCallback((error: unknown) => {
    const message = getCanvasDirectTaskError(error);
    setCanvasViewportError(message);
    toast.error(message);
  }, []);

  const handleCanvasViewportAiSubmit = useCallback(async () => {
    if (canvasViewportRunActive) return false;
    setCanvasViewportError(null);
    if (!captureViewport) {
      reportCanvasViewportError('画布视口还未准备好');
      return false;
    }
    const provider = resolveAcpPromptClientProvider(normalizePromptClientPreference(preferredPromptClient));
    if (!provider) {
      toast.warning('请先在 AI 设置中配置画布 AI');
      onOpenAISettings?.();
      return false;
    }

    const canvasPath = String(canvasFilePath || '').trim();
    const timing = createCanvasViewportAiTiming({
      provider,
      canvasFilePath: canvasPath,
    });
    setCanvasViewportRunActive(true);
    try {
      const capture = await captureViewport();
      const screenshot = String(capture.dataUrl || '').trim();
      if (!screenshot.startsWith('data:image/')) {
        throw new Error('当前视口截图不可用');
      }
      const identity = {
        projectId: String(projectId || '').trim(),
        canvasFilePath: canvasPath,
        provider,
      };
      const sessionStore = typeof window === 'undefined'
        ? null
        : createCanvasViewportAiSessionStore(window.localStorage);
      const session: CanvasViewportAiSession = sessionStore?.resolve(identity) || {
        version: 1,
        threadId: null,
        conversationId: null,
        provider,
        createdAt: new Date().toISOString(),
        turnsUsed: 0,
        isNew: true,
      };
      const controller = getCanvasViewportDirectRunController();
      const startResult = controller?.start({
        scene: 'page',
        source: 'canvas-viewport',
        prompt: buildCanvasViewportAiPrompt({
          canvasFilePath: canvasPath,
          viewportRect: capture.viewportRect,
          visibleElementIds: capture.visibleElementIds,
        }),
        canvasFilePath: canvasPath,
        provider,
        model: preferredModel,
        referenceImages: [screenshot],
        threadId: session.threadId,
        conversationId: session.conversationId,
        onAccepted: (payload) => {
          timing.accepted(payload);
          if (!sessionStore) return;
          sessionStore.recordAccepted({
            identity,
            session,
            threadId: payload.threadId,
            conversationId: payload.conversationId,
          });
        },
        onEvent: timing.handleStreamEvent,
      });
      if (!startResult?.started) {
        timing.failed(new Error('已有一个画布 AI 任务正在执行'));
        setCanvasViewportRunActive(false);
        toast.warning('已有一个画布 AI 任务正在执行');
        return false;
      }
      canvasViewportActiveRunRef.current = { abort: startResult.abort };
      void startResult.promise.then((result) => {
        canvasViewportActiveRunRef.current = null;
        setCanvasViewportRunActive(false);
        if (result.aborted) {
          timing.aborted();
          return;
        }
        if (!result.ok) {
          timing.failed(result.error);
          reportCanvasViewportError(result.error);
          return;
        }
        timing.completed();
        if (result.message?.trim()) {
          toast.message(result.message.trim());
        } else {
          toast.success('已根据当前画布完成 AI 处理');
        }
      });
      return true;
    } catch (error) {
      timing.failed(error);
      setCanvasViewportRunActive(false);
      reportCanvasViewportError(error);
      return false;
    }
  }, [
    canvasFilePath,
    canvasViewportRunActive,
    captureViewport,
    getCanvasViewportDirectRunController,
    onOpenAISettings,
    preferredModel,
    preferredPromptClient,
    projectId,
    reportCanvasViewportError,
  ]);

  useEffect(() => () => {
    void canvasViewportDirectRunControllerRef.current?.abortAll();
    canvasViewportActiveRunRef.current = null;
  }, []);

  return (
    <div
      data-axhub-canvas-start-ai-launcher
      className="ax-canvas-start-launcher pointer-events-auto absolute bottom-6 left-1/2 z-[1200] -translate-x-1/2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {canvasViewportError ? (
        <div
          data-axhub-canvas-start-ai-error
          className="ax-canvas-start-launcher__error"
          role="alert"
        >
          <span
            className="ax-canvas-start-launcher__error-message"
            title={canvasViewportError}
          >
            {canvasViewportError}
          </span>
          <button
            type="button"
            className="ax-canvas-start-launcher__error-close"
            aria-label="关闭画布 AI 错误提示"
            title="关闭"
            onClick={() => setCanvasViewportError(null)}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="ax-canvas-start-launcher__action"
        aria-label={canvasViewportRunActive ? '画布 AI 正在处理' : '根据当前画布生成'}
        title={canvasViewportRunActive ? '画布 AI 正在处理' : '根据当前画布生成'}
        disabled={canvasViewportRunActive}
        onClick={() => { void handleCanvasViewportAiSubmit(); }}
      >
        {canvasViewportRunActive
          ? <Loader2 className="size-[17px] animate-spin" aria-hidden="true" />
          : <Sparkles className="size-[17px]" aria-hidden="true" />}
      </button>
      {canvasViewportRunActive ? (
        <button
          type="button"
          className="ax-canvas-start-launcher__action"
          aria-label="取消当前画布 AI 任务"
          title="取消当前画布 AI 任务"
          onClick={handleCanvasViewportAiCancel}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
