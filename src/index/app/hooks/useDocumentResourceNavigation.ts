import { useEffect, useRef } from 'react';

import type { ItemData, ViewMode } from '../../types';
import { resolveIndexDeepLinkSelection } from '../index-page/resourceDeepLink';

interface DocumentResourceNavigationOptions {
  enabled: boolean;
  appOrigin?: string;
  sourceWindow: Window | null;
  projectId: string | null;
  docs: ItemData[];
  navigate: (item: ItemData, viewMode: ViewMode) => void;
}

function isSafeResourceId(value: string): boolean {
  const segments = value.replace(/\\/gu, '/').split('/');
  return Boolean(value) && segments.every((segment) => segment !== '.' && segment !== '..');
}

export function handleDocumentResourceNavigationMessage(
  event: MessageEvent,
  options: DocumentResourceNavigationOptions,
): boolean {
  const appOrigin = options.appOrigin || window.location.origin;
  if (!options.enabled || !options.projectId || event.origin !== appOrigin) return false;

  const sourceWindow = options.sourceWindow;
  if (!sourceWindow || event.source !== sourceWindow) return false;
  if (event.data?.type !== 'axhub-document-resource:navigate') return false;

  const resourceType = event.data?.resourceType;
  if (resourceType !== 'doc' && resourceType !== 'project-doc') return false;
  const resourceId = String(event.data?.resourceId || '').trim().replace(/\\/gu, '/');
  if (!isSafeResourceId(resourceId)) return false;

  const resolved = resolveIndexDeepLinkSelection({
    resourceType,
    resourceId,
    projectId: options.projectId,
    collapseSidebar: false,
  }, {
    prototypes: [],
    docs: options.docs,
  });
  if (!resolved || resolved.kind !== 'doc') return false;

  options.navigate(resolved.item, resolved.viewMode);
  return true;
}

export function useDocumentResourceNavigation(
  options: Omit<DocumentResourceNavigationOptions, 'appOrigin' | 'sourceWindow'> & {
    getSourceWindow: () => Window | null;
  },
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const current = optionsRef.current;
      handleDocumentResourceNavigationMessage(event, {
        ...current,
        appOrigin: window.location.origin,
        sourceWindow: current.getSourceWindow(),
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
}
