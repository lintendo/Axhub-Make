import type { ReactNode } from 'react';

export function StartPromptGrid({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <ul className="ax-start-prompt-grid" aria-label={ariaLabel}>
      {children}
    </ul>
  );
}
