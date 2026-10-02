import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { VersionCollaborationPanel } from './VersionCollaborationPanel';

interface RemoteRepositorySettingsDialogProps {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function RemoteRepositorySettingsDialog({
    projectId,
    open,
    onOpenChange,
}: RemoteRepositorySettingsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="grid-rows-[auto_minmax(0,1fr)] max-h-[min(760px,calc(100vh-3rem))] min-h-0 max-w-[560px] overflow-hidden p-0">
                <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
                    <DialogTitle>远端设置</DialogTitle>
                    <DialogDescription>连接或创建在线仓库，并查看远端分支状态。</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <VersionCollaborationPanel projectId={projectId} activeTab="online" />
                </div>
            </DialogContent>
        </Dialog>
    );
}
