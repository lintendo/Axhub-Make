import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useResponsiveSidebarTriggerBindings } from './ResponsiveSidebarController';

interface ResponsiveSidebarTriggerButtonProps {
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    className?: string;
    collapsedOnly?: boolean;
}

export default function ResponsiveSidebarTriggerButton({
    collapsed,
    setCollapsed,
    className,
    collapsedOnly = false,
}: ResponsiveSidebarTriggerButtonProps) {
    const bindings = useResponsiveSidebarTriggerBindings(
        collapsed,
        () => setCollapsed(!collapsed),
    );

    if (collapsedOnly && !collapsed) return null;

    return (
        <Button
            {...bindings.buttonProps}
            variant="ghost"
            size="icon-xs"
            className={className}
        >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
    );
}
