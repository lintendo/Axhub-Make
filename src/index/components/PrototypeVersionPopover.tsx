import { GitBranch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ItemData } from '../types';
import { VersionManagerContent } from './VersionManager';

interface PrototypeVersionPopoverProps {
    projectId: string;
    item: ItemData | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenRemoteRepositorySettings?: () => void;
}

export default function PrototypeVersionPopover({
    projectId,
    item,
    open,
    onOpenChange,
    onOpenRemoteRepositorySettings,
}: PrototypeVersionPopoverProps) {
    if (!item || !projectId) return null;

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant={open ? 'secondary' : 'ghost'}
                                size="sm"
                                className="ax-presentation-toolbar-compact-button h-8 rounded-md px-3 gap-1.5 text-[12px] font-medium [&_svg]:h-4 [&_svg]:w-4"
                                aria-label="版本"
                            >
                                <GitBranch aria-hidden="true" />
                                <span className="ax-presentation-toolbar-label">版本</span>
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">版本</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <PopoverContent
                align="end"
                side="bottom"
                sideOffset={8}
                className="max-h-[min(680px,calc(100vh-6rem))] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-xl p-0 text-sm shadow-xl"
            >
                <VersionManagerContent
                    projectId={projectId}
                    visible={open}
                    onCancel={() => onOpenChange(false)}
                    item={item}
                    onOpenRemoteRepositorySettings={onOpenRemoteRepositorySettings}
                />
            </PopoverContent>
        </Popover>
    );
}
