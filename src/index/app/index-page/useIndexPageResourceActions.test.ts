import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readResourceRootSource() {
  return readFileSync(resolve(__dirname, './useIndexPageResourceActions.tsx'), 'utf8');
}

function readResourceActionsSource() {
  return [
    './useIndexPageResourceActions.tsx',
    './resourceActions.helpers.ts',
  ].map((fileName) => readFileSync(resolve(__dirname, fileName), 'utf8')).join('\n');
}

describe('useIndexPageResourceActions source', () => {
  it('uses explicit local source paths for prototype filesystem operations', () => {
    const source = readResourceActionsSource();

    expect(source).toContain("import { getExplicitLocalPath, getPrototypeLocalBasePath, stripIndexFilePath } from '../../utils/localPath';");
    expect(source).toContain('export function getPrototypeBasePathForItem(item: unknown): string');
    expect((source.match(/getPrototypeBasePathForItem\(item\)/gu) || [])).toHaveLength(6);
    expect(source).toContain('const localBasePath = getPrototypeBasePathForItem(item);');
    expect(source).toContain('if (!localBasePath)');
    expect(source).toContain('fetch(buildResourceUrl(`/api/prototypes/${encodeURIComponent(item.name)}`)');
    expect(source).toContain('body: JSON.stringify(buildResourceBody({ displayName: trimmedName }))');
    expect(source).not.toContain('body: JSON.stringify({ path: localBasePath, newName: trimmedName })');
    expect(source).toContain('sourcePath: localBasePath,');
    expect(source).toContain('targetPath: buildLocalSiblingPath(localBasePath, newName),');
    expect(source).toContain('const deleteTargetLabel = item.displayName || item.name;');
    expect(source).toContain('getIdeTargetPath={() => localBasePath}');
    expect(source).toContain('setCurrentVersionItem({ ...item, filePath: localBasePath });');
    expect(source).not.toContain('const sourcePath = `prototypes/${item.name}`;');
    expect(source).not.toContain('sourcePath: `src/${itemTypePath}/${item.name}`');
    expect(source).not.toContain('targetPath: `src/${itemTypePath}/${newName}`');
    expect(source).not.toContain('const deleteTargetList = [`- src/${itemType}/${item.name}`].join(\'\\n\');');
    expect(source).not.toContain('getIdeTargetPath={() => `src/${itemType}/${item.name}`}');
  });

  it('guards prototype rename duplicate and delete handlers without explicit local path metadata', () => {
    const source = readResourceActionsSource();

    expect(source).toContain('if (!localBasePath) {\n            messageApi.warning(\'当前资源未声明本地文件路径，无法重命名\');');
    expect(source).toContain('if (!localBasePath) {\n            messageApi.warning(\'当前资源未声明本地文件路径，无法创建副本\');');
    expect(source).toContain('if (!localBasePath) {\n            messageApi.warning(\'当前资源未声明本地文件路径，无法删除\');');
  });

  it('does not expose theme source ZIP without explicit local path metadata', () => {
    const source = readResourceActionsSource();

    expect(source).toContain('if (!hasExplicitLocalPath(item))');
    expect(source).toContain('messageApi.warning(\'当前资源未声明本地文件路径，无法导出源码\');');
    expect(source).toContain('const baseUrl = buildResourceUrl(`/api/zip?path=${encodeURIComponent(targetPath)}`);');
    expect(source).toContain('void handleDownloadZipByPath(getLocalBasePathForItem(item), `${item.name}.zip`);');
    expect(source).not.toContain('void handleDownloadZipByPath(`themes/${item.name}`, `${item.name}.zip`);');
  });

  it('keeps resource reference checks and prompt dialog builders in a helper module', () => {
    const rootSource = readResourceRootSource();
    const combinedSource = readResourceActionsSource();

    expect(rootSource).toContain("from './resourceActions.helpers'");
    expect(rootSource).toContain('checkDocReferencesRequest');
    expect(rootSource).toContain('checkTemplateReferencesRequest');
    expect(rootSource).toContain('buildDocReferencePromptDialog(dialogParams)');
    expect(rootSource).toContain('buildTemplateReferencePromptDialog(dialogParams)');
    expect(rootSource).not.toContain('function ensureStringArray');
    expect(rootSource).not.toContain('function buildLocalSiblingPath');
    expect(rootSource).not.toContain('generateRenameDocReferencePrompt');
    expect(rootSource).not.toContain('generateDeleteTemplateReferencePrompt');
    expect(combinedSource).toContain("fetch(withResourceProject('/api/docs/check-references'");
    expect(combinedSource).toContain("fetch(withResourceProject('/api/docs/templates/check-references'");
    expect(combinedSource).toContain("scene: dialogParams.action === 'rename' ? 'rename-doc-ref-fix' : 'delete-doc-ref-fix'");
    expect(combinedSource).toContain("scene: dialogParams.action === 'rename' ? 'rename-template-ref-fix' : 'delete-template-ref-fix'");
  });

  it('targets resource requests at the active project id', () => {
    const rootSource = readResourceRootSource();
    const combinedSource = readResourceActionsSource();
    const prototypeRenameStart = rootSource.indexOf('const handleRenameItem = useCallback');
    const duplicateStart = rootSource.indexOf('const handleDuplicateItem = useCallback', prototypeRenameStart);
    const deleteStart = rootSource.indexOf('const handleDeleteItem = useCallback', duplicateStart);
    const templateRenameStart = rootSource.indexOf('const handleRenameTemplateResource = useCallback');
    const docRenameStart = rootSource.indexOf('const handleRenameDocItem = useCallback');
    const docDeleteStart = rootSource.indexOf('const handleDeleteDocItem = useCallback');
    const docPathStart = rootSource.indexOf('const handleCopyDocPath = useCallback', docDeleteStart);
    const prototypeRenameSource = rootSource.slice(prototypeRenameStart, duplicateStart);
    const prototypeDuplicateSource = rootSource.slice(duplicateStart, deleteStart);
    const prototypeDeleteSource = rootSource.slice(deleteStart, docRenameStart);
    const templateRenameSource = rootSource.slice(templateRenameStart, docRenameStart);
    const docResourceSource = rootSource.slice(docRenameStart, docPathStart);

    expect(rootSource).toContain('activeProjectId,');
    expect(rootSource).toContain('const buildResourceUrl = useCallback');
    expect(rootSource).toContain('withResourceProject(url, activeProjectId)');
    expect(rootSource).toContain('const buildResourceBody = useCallback');
    expect(rootSource).toContain('withResourceProjectBody(body, activeProjectId)');
    expect(rootSource).toContain('checkDocReferencesRequest(docName, action, nextBaseName, activeProjectId)');
    expect(rootSource).toContain('checkTemplateReferencesRequest(templateName, action, nextBaseName, activeProjectId)');
    expect(combinedSource).toContain('export function withResourceProject(');
    expect(combinedSource).toContain('export function withResourceProjectBody');
    expect(combinedSource).toContain('withProjectScope(url, requireProjectScope(projectId))');
    expect(combinedSource).toContain('withProjectScopeBody(body, requireProjectScope(projectId))');
    expect(rootSource).toContain("sidebarApi.saveResourceOrder('themes', nextOrder, requireProjectScope(activeProjectId))");
    expect(rootSource).toContain('sidebarApi.saveSidebarTree(tab, normalizedTree, requireProjectScope(activeProjectId))');
    expect(rootSource).toContain('sidebarApi.updateProjectTitle(nextTitle, requireProjectScope(activeProjectId))');
    expect(rootSource).toContain("fetch(buildResourceUrl('/api/config'))");
    expect(rootSource).toContain("fetch(buildResourceUrl('/api/config'), {");
    expect(rootSource).toContain("fetch(buildResourceUrl('/api/themes/sync-design'), {");
    expect(rootSource).toContain('fetch(buildResourceUrl(`/api/themes/${encodeURIComponent(item.name)}`), {');
    expect(rootSource).toContain('fetch(buildResourceUrl(`/api/data/tables/${encodeURIComponent(item.fileName)}`), {');
    expect(rootSource).not.toContain("fetch('/api/config')");
    expect(rootSource).not.toContain('fetch(`/api/themes/${encodeURIComponent(item.name)}`');
    expect(rootSource).not.toContain('fetch(`/api/data/tables/${encodeURIComponent(item.fileName)}`');
    expect(prototypeRenameSource).toContain('fetch(buildResourceUrl(`/api/prototypes/${encodeURIComponent(item.name)}`),');
    expect(prototypeRenameSource).toContain('body: JSON.stringify(buildResourceBody({ displayName: trimmedName }))');
    expect(prototypeDuplicateSource).toContain("fetch(buildResourceUrl('/api/copy'),");
    expect(prototypeDuplicateSource).toContain('body: JSON.stringify(buildResourceBody({');
    expect(prototypeDeleteSource).toContain("fetch(buildResourceUrl('/api/items/check-references'),");
    expect(prototypeDeleteSource).toContain('body: JSON.stringify(buildResourceBody({ itemType, itemName: item.name }))');
    expect(prototypeDeleteSource).toContain("fetch(buildResourceUrl('/api/delete'),");
    expect(prototypeDeleteSource).toContain('body: JSON.stringify(buildResourceBody({ path: localBasePath }))');
    expect(templateRenameSource).toContain('fetch(buildResourceUrl(`/api/docs/templates/${encodeURIComponent(currentName)}`),');
    expect(templateRenameSource).toContain('body: JSON.stringify(buildResourceBody({ newBaseName: trimmedName }))');
    expect(docResourceSource).toContain('fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}`),');
    expect(docResourceSource).toContain('body: JSON.stringify(buildResourceBody({ newBaseName: trimmedName }))');
    expect(docResourceSource).toContain('fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}/copy`),');
    expect(docResourceSource).toContain("body: JSON.stringify(buildResourceBody({}))");
    expect(docResourceSource).toContain('fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}`), { method: \'DELETE\' })');
  });

  it('normalizes nested document and template rename input down to a file basename', () => {
    const rootSource = readResourceRootSource();
    const templateRenameStart = rootSource.indexOf('const handleRenameTemplateResource = useCallback');
    const docRenameStart = rootSource.indexOf('const handleRenameDocItem = useCallback');
    const duplicateTemplateStart = rootSource.indexOf('const handleDuplicateTemplateResource', templateRenameStart);
    const duplicateDocStart = rootSource.indexOf('const handleDuplicateDocItem', docRenameStart);
    const templateRenameSource = rootSource.slice(templateRenameStart, duplicateTemplateStart);
    const docRenameSource = rootSource.slice(docRenameStart, duplicateDocStart);

    expect(rootSource).toContain('resolveDocRenameBaseName');
    expect(templateRenameSource).toContain('const currentBaseName = resolveDocRenameBaseName(currentName, currentExt);');
    expect(templateRenameSource).toContain('trimmedName = resolveDocRenameBaseName(trimmedName);');
    expect(templateRenameSource).toContain('body: JSON.stringify(buildResourceBody({ newBaseName: trimmedName }))');
    expect(docRenameSource).toContain('const currentBaseName = resolveDocRenameBaseName(currentName, currentExt);');
    expect(docRenameSource).toContain('trimmedName = resolveDocRenameBaseName(trimmedName);');
    expect(docRenameSource).toContain('body: JSON.stringify(buildResourceBody({ newBaseName: trimmedName }))');
  });

  it('renames nested document resources by their path while keeping the display name as a basename', () => {
    const rootSource = readResourceRootSource();
    const docRenameStart = rootSource.indexOf('const handleRenameDocItem = useCallback');
    const duplicateDocStart = rootSource.indexOf('const handleDuplicateDocItem', docRenameStart);
    const docRenameSource = rootSource.slice(docRenameStart, duplicateDocStart);

    expect(docRenameSource).toContain('const currentResourcePath = getResourceItemPath(item);');
    expect(docRenameSource).toContain('fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}`),');
    expect(docRenameSource).toContain('const renamedResourcePath = renamedPath || renamedDocName;');
    expect(docRenameSource).toContain('const renamedDisplayName = getDocDisplayName(getDocFileName(renamedDocName)) || renamedDocName;');
    expect(docRenameSource).toContain('const oldItemKey = `docs/${currentResourcePath}`;');
    expect(docRenameSource).toContain('const newItemKey = `docs/${renamedResourcePath}`;');
  });

  it('continues document rename completion without removed theme document selection state', () => {
    const rootSource = readResourceRootSource();
    const docRenameStart = rootSource.indexOf('const handleRenameDocItem = useCallback');
    const duplicateDocStart = rootSource.indexOf('const handleDuplicateDocItem', docRenameStart);
    const docRenameSource = rootSource.slice(docRenameStart, duplicateDocStart);
    const reloadIndex = docRenameSource.indexOf('const nextDocs = await reloadDocsItems();');
    const selectIndex = docRenameSource.indexOf('setSelectedDoc(renamedDoc || nextDocs[0] || null);');

    expect(docRenameSource).not.toContain('setSelectedThemeDocRefs');
    expect(reloadIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeGreaterThan(reloadIndex);
  });

  it('duplicates nested document resources by path and reselects the copied path', () => {
    const rootSource = readResourceRootSource();
    const duplicateDocStart = rootSource.indexOf('const handleDuplicateDocItem = useCallback');
    const deleteDocStart = rootSource.indexOf('const handleDeleteDocItem = useCallback', duplicateDocStart);
    const duplicateDocSource = rootSource.slice(duplicateDocStart, deleteDocStart);

    expect(duplicateDocSource).toContain('const currentResourcePath = getResourceItemPath(item);');
    expect(duplicateDocSource).toContain('fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(currentResourcePath)}/copy`),');
    expect(duplicateDocSource).toContain('const duplicatedPath = String(payload?.path || \'\').trim();');
    expect(duplicateDocSource).toContain('const duplicated = nextDocs.find((doc) => doc.filePath === duplicatedPath || doc.name === payload?.name);');
  });

  it('selects new placeholder prototypes in demo mode instead of canvas mode', () => {
    const source = readResourceRootSource();

    expect(source).toContain('setViewMode');
    expect(source).toContain('buildCreatedPlaceholderPrototypeItem(result)');
    expect(source).toContain("getSidebarTabItems?.('prototypes')");
    expect(source).toContain("fetch(buildResourceUrl('/api/prototypes/create-placeholder'),");
    expect(source).toContain('setPendingReturnTarget({');
    expect(source).toContain("sidebarTab: 'prototype',");
    expect(source).toContain('resourceId: createdName,');
    expect(source).toContain("viewMode: 'demo',");
    expect(source).toContain('createdFromResult');
    expect(source).toContain('refreshedCreated?.placeholder === true');
    expect(source).toContain("setSidebarTab('prototype');");
    expect(source).toContain("setActiveTab('prototypes');");
    expect(source).toContain("setViewMode('demo');");
    expect(source).not.toContain('switch to its canvas view');
  });

  it('persists the prototype sidebar title after display-name rename', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const handleRenameItem = useCallback');
    const handlerEnd = source.indexOf('const handleDuplicateItem', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('replaceSidebarItemTitle(');
    expect(handlerSource).toContain("sidebarApi.saveSidebarTree('prototypes'");
    expect(handlerSource).toContain("await loadSidebarTree('prototypes', { force: true })");
    expect(handlerSource.indexOf('replaceSidebarItemTitle('))
      .toBeLessThan(handlerSource.indexOf('await loadData()'));
  });

  it('does not keep the legacy theme generation prompt action from prototype menus', () => {
    const source = readResourceRootSource();

    expect(source).not.toContain('const handleGenerateThemeFromPrototype = useCallback');
    expect(source).not.toContain('generateCreateThemePrompt(');
    expect(source).not.toContain('setSelectedThemeReferencePages');
    expect(source).not.toContain('initialThemeDialogTab');
    expect(source).not.toContain('setInitialThemeDialogTab');
    expect(source).toContain("setThemeCreateDialogVisible(true)");
  });

  it('persists and syncs the selected default design theme', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const handleSetDefaultTheme = useCallback');
    const handlerEnd = source.indexOf('const handleReorderThemes = useCallback', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(source).toContain('const [defaultThemeName, setDefaultThemeName] = useState<string | null>(null);');
    expect(handlerSource).toContain('const nextValue = defaultThemeName === themeName ? null : themeName;');
    expect(handlerSource).toContain('setDefaultThemeName(nextValue);');
    expect(handlerSource).toContain("const currentConfigResponse = await fetch(buildResourceUrl('/api/config'));");
    expect(handlerSource).toContain('projectDefaults: {');
    expect(handlerSource).toContain('defaultTheme: nextValue,');
    expect(handlerSource).toContain("fetch(buildResourceUrl('/api/config'), {");
    expect(handlerSource).toContain("fetch(buildResourceUrl('/api/themes/sync-design'), {");
    expect(handlerSource).toContain("body: JSON.stringify({ themeName: nextValue || '' })");
    expect(handlerSource).toContain("messageApi.success(nextValue ? '已设为默认设计' : '已取消默认设计');");
    expect(source).toContain('defaultThemeName,');
    expect(source).toContain('setDefaultThemeName,');
    expect(source).toContain('handleSetDefaultTheme,');
  });

  it('creates Excalidraw and Drawio resources through docs writes and selects the new files', () => {
    const source = readResourceRootSource();

    expect(source).toContain("import { openDrawioResourceEditor } from '../../domains/drawio/drawioResourceEditor';");
    expect(source).toContain('const EMPTY_EXCALIDRAW_RESOURCE_CONTENT = JSON.stringify({');
    expect(source).toContain("type: 'excalidraw'");
    expect(source).toContain('const EMPTY_DRAWIO_RESOURCE_CONTENT =');
    expect(source).toContain('<mxfile host="embed.diagrams.net">');
    expect(source).toContain('function buildUniqueResourceFileName(');
    expect(source).toContain('const handleCreateResourceCanvasFile = useCallback(async (targetFolder?: string | null) => {');
    expect(source).toContain("const createdName = buildUniqueResourceFileName(docsItems, targetFolder, 'untitled.excalidraw');");
    expect(source).toContain("fetch(buildResourceUrl(`/api/docs/${encodeURIComponent(createdName)}`),");
    expect(source).toContain("body: JSON.stringify(buildResourceBody({ content: EMPTY_EXCALIDRAW_RESOURCE_CONTENT }))");
    expect(source).toContain("setSidebarTab('document');");
    expect(source).toContain("const createdCanvasFilePath = `src/resources/${createdName}`;");
    expect(source).toContain("openMode: 'canvas',");
    expect(source).toContain('resourceId: createdDoc.resourceId || createdName,');
    expect(source).toContain("ext: createdDoc.ext || '.excalidraw',");
    expect(source).toContain('filePath: createdDoc.filePath || createdCanvasFilePath,');
    expect(source).toContain('canvasFilePath: createdDoc.canvasFilePath || createdDoc.filePath || createdCanvasFilePath,');
    expect(source).toContain("setViewMode('canvas');");
    expect(source).toContain('setSelectedDoc(selectedCanvasDoc);');
    expect(source).toContain('const handleCreateDrawioResourceFile = useCallback(async (targetFolder?: string | null) => {');
    expect(source).toContain("const createdName = buildUniqueResourceFileName(docsItems, targetFolder, 'untitled.drawio');");
    expect(source).toContain("body: JSON.stringify(buildResourceBody({ content: EMPTY_DRAWIO_RESOURCE_CONTENT }))");
    expect(source).toContain('await openDrawioResourceEditor({');
    expect(source).toContain('resource: {');
    expect(source).toContain('...createdDoc,');
    expect(source).toContain('projectId: requireProjectScope(activeProjectId).projectId,');
    expect(source).toContain("kind: 'doc',");
    expect(source).toContain('onSaved: reloadDocsItems,');
    expect(source).toContain('setSelectedDoc(createdDoc);');
    expect(source).toContain('handleCreateResourceCanvasFile,');
    expect(source).toContain('handleCreateDrawioResourceFile,');
    expect(source).not.toContain("fetch('/api/canvas/create'");
    expect(source).not.toContain('handleRenameCanvasItem');
    expect(source).not.toContain('handleDuplicateCanvasItem');
    expect(source).not.toContain('handleDeleteCanvasItem');
  });

  it('refreshes docs metadata before reconciling a persisted filesystem sidebar tree', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const handleSidebarTreePersist = useCallback');
    const handlerEnd = source.indexOf('const handleVersionManagement', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('await sidebarApi.saveSidebarTree(tab, normalizedTree, requireProjectScope(activeProjectId))');
    expect(handlerSource).toMatch(/const latestItems = tab === 'docs'\s+\? await reloadDocsItems\(\)\s+: getSidebarTabItems\(tab\);/);
    expect(handlerSource.indexOf('await sidebarApi.saveSidebarTree(tab, normalizedTree, requireProjectScope(activeProjectId))'))
      .toBeLessThan(handlerSource.indexOf('await reloadDocsItems()'));
  });

  it('prepares and selects the canonical image AI resource folder', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const prepareImageAiResourceFolder = useCallback');
    const handlerEnd = source.indexOf('const handleSidebarTreeChange', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerSource).toContain('sidebarApi.ensureSidebarFolder(folderPath, requireProjectScope(activeProjectId))');
    expect(handlerSource).toContain("sanitizeSidebarTree('docs', Array.isArray(response.tree) ? response.tree : [], items)");
    expect(handlerSource).toContain("setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({ ...previous, docs: nextTree }))");
    expect(handlerSource).toContain("handleSelectResourceFolder(response.folder, 'docs');");
    expect(handlerSource).toContain("folder: toSelectedResourceFolder(response.folder, 'docs'),");
    expect(handlerSource).toContain('absolutePath: response.absolutePath,');
    expect(handlerSource).toContain("messageApi.error(error?.message || '准备图片保存文件夹失败');");
    expect(source).toContain('prepareImageAiResourceFolder,');
  });

  it('exposes the existing docs refresh callback for host-side image save events', () => {
    const source = readResourceRootSource();
    expect(source).toContain('const refreshDocsResources = useCallback(async () => {');
    expect(source).toContain('refreshDocsResources,');
  });

  it('selects the uploaded document resource after paste upload refreshes docs metadata', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const handleUploadedResourceFiles = useCallback');
    const handlerEnd = source.indexOf('const handleOpenResourceFolderInSystem', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(source).toContain("import type { SelectedResourceFolder, UploadedResourceFile } from '../../types/index-page.types';");
    expect(handlerSource).toContain('async (uploadedFiles: UploadedResourceFile[] = []) => {');
    expect(handlerSource).toContain('const nextDocs = await reloadDocsItems();');
    expect(handlerSource).toContain("await loadSidebarTree('docs', { force: true, items: nextDocs });");
    expect(handlerSource).toContain('const uploadedDoc = findUploadedDocItem(nextDocs, uploadedFiles);');
    expect(handlerSource).toContain('setSelectedResourceFolder(null);');
    expect(handlerSource).toContain('setSelectedDoc(uploadedDoc);');
  });

  it('keeps project-path document selections when resource docs metadata refreshes', () => {
    const source = readResourceRootSource();
    const syncEffectStart = source.indexOf('useEffect(() => {\n        setSelectedDoc((previous) => {');
    const syncEffectEnd = source.indexOf('    useEffect(() => {\n        setSelectedResourceFolder', syncEffectStart);
    const syncEffectSource = source.slice(syncEffectStart, syncEffectEnd);

    expect(syncEffectStart).toBeGreaterThanOrEqual(0);
    expect(syncEffectSource).toContain('previous.projectDocumentPath');
    expect(syncEffectSource).toContain('return previous;');
  });

  it('does not auto-select the first resource or design while start draft pages are active', () => {
    const source = readResourceRootSource();
    const docSyncEffectStart = source.indexOf('useEffect(() => {\n        setSelectedDoc((previous) => {');
    const docSyncEffectEnd = source.indexOf('    useEffect(() => {\n        setSelectedResourceFolder', docSyncEffectStart);
    const docSyncEffectSource = source.slice(docSyncEffectStart, docSyncEffectEnd);
    const themeSyncEffectStart = source.indexOf('useEffect(() => {\n        setSelectedTheme((previous: any) => (');
    const themeSyncEffectEnd = source.indexOf('    useEffect(() => {\n        setSelectedDataTable', themeSyncEffectStart);
    const themeSyncEffectSource = source.slice(themeSyncEffectStart, themeSyncEffectEnd);

    expect(source).toContain('resourceStartDraftActive,');
    expect(source).toContain('themeStartDraftActive,');
    expect(docSyncEffectSource).toContain('if (resourceStartDraftActive) {\n                return previous;\n            }');
    expect(docSyncEffectSource).toContain('}, [docsItems, resourceStartDraftActive, selectedDocsResourceFolder]);');
    expect(themeSyncEffectSource).toContain('themeStartDraftActive\n                ? previous');
    expect(themeSyncEffectSource).toContain('}, [themeStartDraftActive, themes]);');
  });

  it('cleans the docs sidebar tree after deleting a document resource', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const handleDeleteDocItem = useCallback');
    const handlerEnd = source.indexOf('const handleCopyDocPath = useCallback', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('const nextDocs = await reloadDocsItems();');
    expect(handlerSource).toContain('const currentResourcePath = getResourceItemPath(item);');
    expect(handlerSource).toContain("setSidebarTrees((previous: Record<SidebarTreeTab, SidebarTreeNode[]>) => ({");
    expect(handlerSource).toContain('removeDocsSidebarTreeItem(');
    expect(handlerSource).toContain("sanitizeSidebarTree('docs', previous.docs || [], nextDocs)");
    expect(handlerSource).toContain('currentResourcePath');
    expect(handlerSource).toContain("await loadSidebarTree('docs', { force: true, items: nextDocs });");
  });

  it('does not keep the document delete confirm open after failed deletes', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const handleDeleteDocItem = useCallback');
    const handlerEnd = source.indexOf('const handleCopyDocPath = useCallback', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain("messageApi.error(error?.message || '删除失败');");
    expect(handlerSource).not.toContain('return Promise.reject(error);');
  });

  it('copies document resource paths relative to the project root', () => {
    const source = readResourceRootSource();
    const handlerStart = source.indexOf('const handleCopyDocPath = useCallback');
    const handlerEnd = source.indexOf('const handleDocVersionManagement', handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain('const localPath = getProjectRelativeResourcePathForItem(item);');
    expect(handlerSource).toContain('await navigator.clipboard.writeText(localPath);');
    expect(handlerSource).not.toContain('const localPath = getLocalPathForItem(item);');
  });
});
