import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  File,
  FileText,
  History,
  ImageIcon,
  LayoutTemplate,
  Link as LinkIcon,
  Plus,
  RefreshCw,
  Trash2,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  resolveAiArtifactResourceId,
  type AiArtifactClassificationKind,
} from '../../../common/aiArtifactClassification';
import { buildIndexDeepLinkUrl } from '../../app/index-page/resourceDeepLink';
import {
  getGenerationArtifactHistoryStore,
  type GenerationArtifactHistoryState,
  type GenerationArtifactKind,
  type GenerationArtifactRecord,
} from './generationArtifactHistoryStore';
import { buildMarkdownFileUrl } from '../../utils/markdownPreview';
import { cn } from '@/lib/utils';
import { withProjectScope } from '../../services/projectScope';

interface GenerationHistoryPopoverProps {
  projectId: string;
  targetPath?: string;
  container?: HTMLElement | null;
  onInsertArtifact?: (artifact: GenerationArtifactRecord) => void;
  onSyncArtifacts?: () => Promise<void> | void;
  buttonClassName?: string;
}

const KIND_OPTIONS: Array<{ value: 'all' | GenerationArtifactKind; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'prototype', label: '原型' },
  { value: 'document', label: '文档' },
  { value: 'drawio', label: 'Drawio' },
];

function kindLabel(kind: GenerationArtifactKind): string {
  if (kind === 'image') return '图片';
  if (kind === 'prototype') return '原型';
  if (kind === 'document') return '文档';
  if (kind === 'drawio') return 'Drawio';
  if (kind === 'link') return '链接';
  return '文件';
}

function kindIcon(kind: GenerationArtifactKind) {
  if (kind === 'image') return <ImageIcon className="h-4 w-4" />;
  if (kind === 'prototype') return <LayoutTemplate className="h-4 w-4" />;
  if (kind === 'document') return <FileText className="h-4 w-4" />;
  if (kind === 'drawio') return <Workflow className="h-4 w-4" />;
  if (kind === 'link') return <LinkIcon className="h-4 w-4" />;
  if (kind === 'file') return <File className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function displayArtifactTitle(artifact: GenerationArtifactRecord): string {
  const title = stringField(artifact.title) || stringField(artifact.metadata?.title) || artifact.id;
  return title
    .replace(/^图片产物[：:]\s*/iu, '')
    .replace(/^原型产物[：:]\s*/iu, '')
    .replace(/^文档产物[：:]\s*/iu, '')
    .replace(/^draw(?:\.io|io)?\s*图表产物[：:]\s*/iu, '')
    .trim() || title;
}

function displayArtifactPrompt(artifact: GenerationArtifactRecord): string {
  return stringField(artifact.prompt)
    || stringField(artifact.metadata?.prompt)
    || stringField(artifact.metadata?.instruction)
    || stringField(artifact.source?.prompt)
    || stringField(artifact.source?.instruction);
}

function resolveArtifactUrl(artifact: GenerationArtifactRecord): string {
  return stringField(artifact.assetRef?.url)
    || stringField(artifact.target.url)
    || stringField(artifact.target.uri)
    || stringField(artifact.target.href)
    || stringField(artifact.target.path);
}

function isImageLikePath(value: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)(?:$|[?#])/iu.test(value);
}

function buildArtifactHistoryAssetUrl(projectId: string, targetPath: string | undefined, assetPath: string): string {
  const normalizedTargetPath = stringField(targetPath);
  const normalizedAssetPath = assetPath.replace(/\\/g, '/').replace(/^\/+/u, '');
  if (!normalizedTargetPath || !normalizedAssetPath.startsWith('generation-assets/')) return '';
  const params = new URLSearchParams({
    targetPath: normalizedTargetPath,
    assetPath: normalizedAssetPath,
  });
  return withProjectScope(`/api/ai/artifact-history/assets?${params.toString()}`, { projectId });
}

function resolveArtifactPreviewUrl(artifact: GenerationArtifactRecord, projectId: string, targetPath?: string): string {
  const url = stringField(artifact.assetRef?.url)
    || stringField(artifact.target.url)
    || stringField(artifact.target.uri)
    || stringField(artifact.target.href);
  if (url && url !== 'data:image/svg+xml') return url;
  const assetUrl = buildArtifactHistoryAssetUrl(projectId, targetPath, stringField(artifact.assetRef?.assetPath));
  if (assetUrl) return assetUrl;
  const path = stringField(artifact.target.path);
  if (artifact.kind === 'image' && path && isImageLikePath(path)) {
    return buildMarkdownFileUrl(path, projectId);
  }
  return url;
}

function canShowImagePreview(artifact: GenerationArtifactRecord, previewUrl: string): boolean {
  return artifact.kind === 'image' && Boolean(previewUrl);
}

function resolveArtifactResourceId(artifact: GenerationArtifactRecord): string {
  return resolveAiArtifactResourceId({
    kind: artifact.kind as AiArtifactClassificationKind,
    path: artifact.target.path,
    uri: artifact.target.uri,
    url: artifact.target.url || artifact.assetRef?.url,
    resourceId: artifact.target.resourceId || artifact.metadata.resourceId,
    artifactId: artifact.target.artifactId,
    targetArtifactId: artifact.target.targetArtifactId,
    name: artifact.metadata.name,
  });
}

function resolveOpenUrl(artifact: GenerationArtifactRecord): string {
  const url = resolveArtifactUrl(artifact);
  const resourceId = resolveArtifactResourceId(artifact);
  if (artifact.kind === 'prototype') {
    if (!resourceId) return '';
    return buildIndexDeepLinkUrl({
      resourceType: 'prototype',
      resourceId,
      view: 'demo',
    });
  }
  if (artifact.kind === 'document') {
    if (!resourceId) return '';
    return buildIndexDeepLinkUrl({
      resourceType: 'doc',
      resourceId,
    });
  }
  if (!url) return '';
  if (/^file:\/\//u.test(url)) return url.replace(/^file:\/\//u, '/');
  if (/^https?:\/\//u.test(url) || url.startsWith('/')) return url;
  return url;
}

function canOpenArtifact(artifact: GenerationArtifactRecord): boolean {
  if (artifact.kind === 'image' || artifact.kind === 'drawio') return false;
  return Boolean(resolveOpenUrl(artifact));
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(artifact: GenerationArtifactRecord): string {
  if (artifact.status === 'running') return '生成中';
  if (artifact.status === 'error') return '失败';
  return artifact.operation === 'updated' ? '已更新' : '已创建';
}

function TooltipIconButton({
  tooltip,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          aria-label={props['aria-label'] || tooltip}
          title={tooltip}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function GenerationHistoryTriggerButton({
  open,
  buttonClassName,
}: {
  open: boolean;
  buttonClassName?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'axhub-generation-history-popover__trigger data-[active=true]:text-primary data-[active=true]:hover:text-primary',
              buttonClassName,
            )}
            aria-label="生成记录"
            title="生成记录"
            data-active={open ? 'true' : undefined}
          >
            <History className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        生成记录
      </TooltipContent>
    </Tooltip>
  );
}

export default function GenerationHistoryPopover({
  projectId,
  targetPath,
  container,
  onInsertArtifact,
  onSyncArtifacts,
  buttonClassName,
}: GenerationHistoryPopoverProps) {
  const store = getGenerationArtifactHistoryStore();
  const [state, setState] = useState<GenerationArtifactHistoryState>(() => store.getState());
  const [filter, setFilter] = useState<'all' | GenerationArtifactKind>('all');
  const [open, setOpen] = useState(false);
  const [failedPreviewUrls, setFailedPreviewUrls] = useState<Record<string, true>>({});

  useEffect(() => store.subscribe(setState), [store]);

  useEffect(() => {
    void store.configure({ projectId, targetPath });
  }, [projectId, store, targetPath]);

  useEffect(() => {
    setFailedPreviewUrls({});
  }, [targetPath]);

  const entries = useMemo(() => (
    filter === 'all'
      ? state.artifacts
      : state.artifacts.filter((artifact) => artifact.kind === filter)
  ), [filter, state.artifacts]);

  const handleOpen = (artifact: GenerationArtifactRecord) => {
    const openUrl = resolveOpenUrl(artifact);
    if (!openUrl) return;
    window.open(openUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = (artifact: GenerationArtifactRecord) => {
    void store.deleteArtifact(artifact.id);
  };

  const handleRefresh = () => {
    void Promise.resolve(onSyncArtifacts?.())
      .catch(() => undefined)
      .finally(() => {
        void store.load();
      });
  };

  const markPreviewFailed = (previewUrl: string) => {
    if (!previewUrl) return;
    setFailedPreviewUrls((previous) => (
      previous[previewUrl] ? previous : { ...previous, [previewUrl]: true }
    ));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <GenerationHistoryTriggerButton open={open} buttonClassName={buttonClassName} />
      </TooltipProvider>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        container={container}
        className="w-[min(94vw,420px)] p-0"
      >
        <TooltipProvider>
        <div className="flex h-[min(70vh,640px)] min-h-[360px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <div className="truncate text-sm font-medium">生成记录</div>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {state.artifacts.length}
              </span>
            </div>
            <TooltipIconButton
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="刷新生成记录"
              tooltip="刷新生成记录"
              onClick={handleRefresh}
            >
              <RefreshCw className={state.loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            </TooltipIconButton>
          </div>

          <div className="flex gap-1 overflow-x-auto px-3 py-2">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={[
                  'rounded px-2 py-1 text-xs',
                  filter === option.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                ].join(' ')}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-2.5 p-3">
              {!targetPath ? (
                <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  当前画布没有项目级生成记录
                </div>
              ) : state.error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </div>
              ) : entries.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  暂无生成记录
                </div>
              ) : entries.map((artifact) => {
                const displayTitle = displayArtifactTitle(artifact);
                const displayPrompt = displayArtifactPrompt(artifact);
                const previewUrl = resolveArtifactPreviewUrl(artifact, projectId, targetPath);
                const showImagePreview = canShowImagePreview(artifact, previewUrl) && !failedPreviewUrls[previewUrl];
                const time = formatTime(artifact.updatedAt || artifact.createdAt);
                return (
                  <div
                    key={artifact.id}
                    className="grid min-h-[116px] grid-cols-[minmax(0,1fr)_96px] gap-3 rounded-md border border-border bg-background p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 flex-col">
                      <div className="line-clamp-2 text-[15px] font-semibold leading-5 text-foreground" title={displayTitle}>
                        {displayTitle}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">{kindLabel(artifact.kind)}</span>
                        <span>{statusLabel(artifact)}</span>
                        {time ? <span>{time}</span> : null}
                      </div>
                      <div className="mt-2 flex justify-start gap-0.5">
                        {canOpenArtifact(artifact) ? (
                          <TooltipIconButton
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="打开产物"
                            tooltip="打开产物"
                            onClick={() => handleOpen(artifact)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </TooltipIconButton>
                        ) : null}
                        <TooltipIconButton
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="添加到画布"
                          tooltip="添加到画布"
                          onClick={() => onInsertArtifact?.(artifact)}
                          disabled={!onInsertArtifact}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </TooltipIconButton>
                        <TooltipIconButton
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="删除记录"
                          tooltip="删除记录"
                          onClick={() => handleDelete(artifact)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </TooltipIconButton>
                      </div>
                      {displayPrompt ? (
                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {displayPrompt}
                        </div>
                      ) : null}
                    </div>
                    <div className="ml-auto flex aspect-square w-24 items-center justify-center overflow-hidden rounded-md bg-muted/50 text-muted-foreground transition-colors">
                      {showImagePreview ? (
                        <img
                          src={previewUrl}
                          alt={displayTitle}
                          onError={() => markPreviewFailed(previewUrl)}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-background/70">
                          {kindIcon(artifact.kind)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
