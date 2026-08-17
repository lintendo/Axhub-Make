import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VersionCollaborationPanel } from './VersionCollaborationPanel';

interface WorkspaceVersionCollaborationDrawerProps {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function WorkspaceVersionCollaborationDrawer({
    projectId,
    open,
    onOpenChange,
}: WorkspaceVersionCollaborationDrawerProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="left"
                className="flex w-full max-w-[620px] flex-col p-0 text-sm sm:max-w-[620px] [&>[data-sheet-close]]:hidden"
            >
                <Tabs defaultValue="local" className="flex h-full flex-col">
                    <SheetHeader className="border-b px-5 py-3.5">
                        <SheetTitle className="sr-only">版本和协作</SheetTitle>
                        <div className="flex items-center justify-between gap-3">
                            <TabsList className="grid h-8 w-full max-w-[360px] grid-cols-3 rounded-lg border border-border/70 bg-muted/50 p-0.5">
                                <TabsTrigger value="local" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    本地仓库
                                </TabsTrigger>
                                <TabsTrigger value="online" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    在线仓库
                                </TabsTrigger>
                                <TabsTrigger value="skills" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    管理技能
                                </TabsTrigger>
                            </TabsList>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 shrink-0 rounded-md"
                                onClick={() => onOpenChange(false)}
                                aria-label="关闭"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </SheetHeader>

                    <TabsContent value="local" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <VersionCollaborationPanel projectId={projectId} activeTab="local" />
                    </TabsContent>
                    <TabsContent value="online" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <VersionCollaborationPanel projectId={projectId} activeTab="online" />
                    </TabsContent>
                    <TabsContent value="skills" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <VersionCollaborationPanel projectId={projectId} activeTab="skills" />
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
