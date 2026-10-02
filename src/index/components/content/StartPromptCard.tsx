import { Loader2, Send } from 'lucide-react';
import type { ElementType, SVGProps } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type StartPromptCardIcon = ElementType<SVGProps<SVGSVGElement>>;

export function StartPromptCard({
  title,
  icon: Icon,
  selectionDisabled,
  onSelect,
  onExecute,
}: {
  title: string;
  icon: StartPromptCardIcon;
  selectionDisabled: boolean;
  onSelect: () => void;
  onCopy: () => void | Promise<void>;
  onExecute?: () => void | Promise<void>;
}) {
  const [executing, setExecuting] = useState(false);

  const handleExecute = async () => {
    if (!onExecute || executing) return;
    setExecuting(true);
    try {
      await onExecute();
      toast.success('已打开 AI 侧栏，提示词待发送');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '打开 AI 侧栏失败');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <li className="group relative flex">
      <button
        type="button"
        aria-label={title}
        disabled={selectionDisabled}
        onClick={onSelect}
        className="flex min-h-16 w-full items-center gap-3 rounded-[10px] border border-slate-200/80 bg-white/80 px-4 py-3 pr-10 text-left text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/70 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon className="size-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-600" aria-hidden="true" />
        <span className="min-w-0 flex-1 whitespace-nowrap leading-5">{title}</span>
      </button>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="快速执行"
              disabled={!onExecute || executing}
              className="pointer-events-none absolute right-2 top-1/2 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 opacity-0 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/70 group-hover:pointer-events-auto group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => { void handleExecute(); }}
            >
              {executing ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">快速执行</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </li>
  );
}
