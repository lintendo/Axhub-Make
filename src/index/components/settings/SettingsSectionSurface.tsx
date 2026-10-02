import React from 'react';

import { FieldLabelWithHint } from '../../../components/ui/field';
import { cn } from '../../../lib/utils';

export const SETTINGS_SURFACE_CLASS_NAME = 'min-w-0 overflow-hidden rounded-md border border-border bg-muted/30';
export const SETTINGS_COMPACT_CONTROL_CLASS_NAME = 'h-8 text-xs';

export interface SettingsSectionSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SettingsSectionSurface({ children, className, ...props }: SettingsSectionSurfaceProps) {
  return (
    <div className={cn(SETTINGS_SURFACE_CLASS_NAME, 'p-3', className)} {...props}>
      {children}
    </div>
  );
}

export interface SettingsConfigRowProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SettingsConfigRow({ label, hint, children, className }: SettingsConfigRowProps) {
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4 border-t border-border px-3 py-1.5 first:border-t-0', className)}>
      <FieldLabelWithHint hint={hint}>{label}</FieldLabelWithHint>
      <div className="flex shrink-0 items-center gap-2">
        {children}
      </div>
    </div>
  );
}
