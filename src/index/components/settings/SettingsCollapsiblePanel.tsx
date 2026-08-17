import React, { useId, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { cn } from '../../../lib/utils';

export interface SettingsCollapsiblePanelProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsCollapsiblePanel({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  defaultOpen = false,
  open,
  onOpenChange,
}: SettingsCollapsiblePanelProps) {
  const generatedId = useId();
  const panelValue = `settings-panel-${generatedId}`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? internalOpen;

  const handleValueChange = (value: string) => {
    const nextOpen = value === panelValue;
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={resolvedOpen ? panelValue : ''}
      onValueChange={handleValueChange}
      className={cn('border-b border-border px-0', className)}
    >
      <AccordionItem value={panelValue} className="border-b-0">
        <div className="flex min-w-0 items-center gap-2">
          <AccordionTrigger className="min-w-0 py-3.5 text-left hover:no-underline">
            <div className="min-w-0 flex-1 space-y-0.5 pr-3">
              <div className="text-sm font-semibold text-foreground">{title}</div>
              {description ? (
                <div className="truncate text-xs font-normal leading-5 text-muted-foreground">
                  {description}
                </div>
              ) : null}
            </div>
          </AccordionTrigger>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
        <AccordionContent className="pb-4 pt-1">
          <div className={cn('min-w-0', contentClassName)}>
            {children}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
