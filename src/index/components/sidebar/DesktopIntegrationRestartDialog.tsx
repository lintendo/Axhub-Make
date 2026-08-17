import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DesktopIntegrationProvider } from '../../services/api';

interface DesktopIntegrationRestartDialogProps {
  provider: DesktopIntegrationProvider | null;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onRestart: () => void;
  onOpenNormally: () => void;
}

const PROVIDER_LABELS: Record<DesktopIntegrationProvider, string> = {
  chatgpt: 'ChatGPT',
  cursor: 'Cursor',
  workbuddy: 'WorkBuddy',
  traework: 'TRAEWORK',
  qoderwork: 'QoderWork',
};

export default function DesktopIntegrationRestartDialog({
  provider,
  open,
  loading,
  onOpenChange,
  onRestart,
  onOpenNormally,
}: DesktopIntegrationRestartDialogProps) {
  const label = provider ? PROVIDER_LABELS[provider] : '应用';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,440px)] max-w-[440px] rounded-[20px] p-0">
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <DialogHeader className="space-y-2 pr-8 text-left">
            <DialogTitle className="text-[18px] leading-6">需要重启 {label}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              为了加载 Axhub Make 入口，需要重启应用。请先保存正在进行的工作。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex flex-row justify-end gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="普通打开"
              disabled={loading}
              onClick={onOpenNormally}
            >
              普通打开
            </Button>
            <Button
              type="button"
              size="sm"
              aria-label="重启并注入"
              disabled={loading}
              onClick={onRestart}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              重启并注入
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
