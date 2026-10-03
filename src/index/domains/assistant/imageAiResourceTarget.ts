import type { ItemData } from '../../types';
import type { SidebarTab, SelectedResourceFolder } from '../../types/index-page.types';

export const DEFAULT_IMAGE_AI_RESOURCE_FOLDER = 'images';

export interface ResolveImageAiResourceTargetFolderParams {
  sidebarTab: SidebarTab;
  selectedFolder?: SelectedResourceFolder | null;
  selectedResource?: Partial<Pick<ItemData, 'filePath' | 'resourceId' | 'name'>> | null;
}

function normalizeResourceRelativePath(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const resourceMarker = 'src/resources/';
  const markerIndex = normalized.indexOf(resourceMarker);
  return markerIndex >= 0
    ? normalized.slice(markerIndex + resourceMarker.length)
    : normalized;
}

export function resolveImageAiResourceTargetFolder({
  sidebarTab,
  selectedFolder,
  selectedResource,
}: ResolveImageAiResourceTargetFolderParams): string {
  if (sidebarTab !== 'document') {
    return DEFAULT_IMAGE_AI_RESOURCE_FOLDER;
  }

  const selectedFolderPath = selectedFolder?.treeTab === 'docs'
    ? normalizeResourceRelativePath(selectedFolder.folderPath || selectedFolder.path)
    : '';
  if (selectedFolderPath) {
    return selectedFolderPath;
  }

  const selectedResourcePath = normalizeResourceRelativePath(
    selectedResource?.filePath
      || selectedResource?.resourceId
      || selectedResource?.name,
  );
  const parentSeparatorIndex = selectedResourcePath.lastIndexOf('/');
  return parentSeparatorIndex > 0
    ? selectedResourcePath.slice(0, parentSeparatorIndex)
    : DEFAULT_IMAGE_AI_RESOURCE_FOLDER;
}
