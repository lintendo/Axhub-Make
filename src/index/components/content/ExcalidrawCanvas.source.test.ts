import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource() {
  return readFileSync(resolve(__dirname, './ExcalidrawCanvas.tsx'), 'utf8');
}

describe('ExcalidrawCanvas source', () => {
  it('preserves nested resource canvas API paths by encoding each segment separately', () => {
    const source = readSource();
    const encoderStart = source.indexOf('function encodeCanvasApiPath(canvasName: string): string {');
    const encoderEnd = source.indexOf('\n}\n\nfunction getCanvasBridgeCanvasName', encoderStart);
    const encoderSource = source.slice(encoderStart, encoderEnd);

    expect(encoderStart).toBeGreaterThan(-1);
    expect(encoderSource).toContain(".split('/')");
    expect(encoderSource).toContain('.filter(Boolean)');
    expect(encoderSource).toContain('.map((segment) => encodeURIComponent(segment))');
    expect(encoderSource).toContain(".join('/')");
    expect(source).toContain('withProjectScope(`/api/canvas/resources/${encodeCanvasApiPath(resourceCanvasPath)}`, requireProjectScope(projectId))');
    expect(source).toContain('fetch(buildCanvasApiUrl(canvasName, activeProjectId, canvasFilePath))');
    expect(source).toContain('fetch(buildCanvasApiUrl(currentNameRef.current, activeProjectId, canvasFilePath))');
    expect(source).toContain('const url = buildCanvasApiUrl(currentNameRef.current, activeProjectId, canvasFilePath);');
    expect(source).not.toContain('encodeURIComponent(canvasName)');
    expect(source).not.toContain('encodeURIComponent(currentNameRef.current)');
    expect(source).not.toContain('new URL(`/api/canvas/${encodeCanvasApiPath(canvasName)}`, window.location.origin)');
  });

  it('requires the active project for every canvas API request', () => {
    const source = readSource();

    expect(source).toContain('activeProjectId: string;');
    expect(source).toContain('function buildCanvasApiUrl(canvasName: string, projectId: string, canvasFilePath?: string): string {');
    expect(source).toContain('withProjectScope(`/api/canvas/resources/${encodeCanvasApiPath(resourceCanvasPath)}`, requireProjectScope(projectId))');
    expect(source).toContain('fetch(buildCanvasApiUrl(canvasName, activeProjectId, canvasFilePath))');
    expect(source).toContain('fetch(buildCanvasApiUrl(currentNameRef.current, activeProjectId, canvasFilePath))');
    expect(source).toContain('const url = buildCanvasApiUrl(currentNameRef.current, activeProjectId, canvasFilePath);');
  });

  it('uses the resource canvas API for Excalidraw files under src/resources', () => {
    const source = readSource();

    expect(source).toContain('function resolveResourceCanvasApiPath(canvasName: string, canvasFilePath?: string): string {');
    expect(source).toContain("const resourcesMarker = 'src/resources/';");
    expect(source).toContain("if (normalized.startsWith('resources/'))");
    expect(source).toContain('withProjectScope(`/api/canvas/resources/${encodeCanvasApiPath(resourceCanvasPath)}`, requireProjectScope(projectId))');
    expect(source).toContain('fetch(buildCanvasApiUrl(canvasName, activeProjectId, canvasFilePath))');
    expect(source).toContain('fetch(buildCanvasApiUrl(currentNameRef.current, activeProjectId, canvasFilePath))');
    expect(source).toContain('const url = buildCanvasApiUrl(currentNameRef.current, activeProjectId, canvasFilePath);');
    expect(source).toContain('const resourceCanvasPath = resolveResourceCanvasApiPath(canvasName, canvasFilePath);');
  });

  it('scopes embedded resource metadata reads before opening an editor', () => {
    const source = readSource();

    expect(source).toContain('async function openEmbedItemInEditor(detail: any, projectId: string)');
    expect(source).toContain("fetch(withProjectScope('/api/entries.json', requireProjectScope(projectId)))");
    expect(source).toContain("fetch(withProjectScope('/api/docs', requireProjectScope(projectId)))");
    expect(source).toContain("fetch(withProjectScope('/api/config', requireProjectScope(projectId)))");
    expect(source).toContain('openEmbedItemInEditor(detail, activeProjectId)');
  });

  it('renders the canvas search menu item with a search icon', () => {
    const source = readSource();

    expect(source).toMatch(/import\s+\{[^}]*Search[^}]*\}\s+from 'lucide-react'/s);
    expect(source).toContain('icon={<Search className="axhub-canvas-menu-icon" />}');
    expect(source).toContain('{SEARCH_MENU_LABEL}');
  });

  it('shows tooltip labels for the custom canvas icon buttons', () => {
    const source = readSource();

    expect(source).toContain("import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';");
    expect(source).toContain('<TooltipProvider>');
    expect(source).toContain('<TooltipTrigger asChild>');
    expect(source).toContain('<TooltipContent side="bottom">{title}</TooltipContent>');
    expect(source).toContain("<TooltipContent side=\"bottom\">");
    expect(source).toContain("{imageAiActive ? '关闭生图 AI' : '打开生图 AI'}");
    expect(source).toContain("{generalAiActive ? '关闭对话 AI' : '打开对话 AI'}");
  });

  it('adds a main-menu property panel submenu for position and default shape', () => {
    const source = readSource();

    expect(source).toMatch(/import\s+\{[^}]*SlidersHorizontal[^}]*\}\s+from 'lucide-react'/s);
    expect(source).toContain('<MainMenu.Sub>');
    expect(source).toContain('<MainMenu.Sub.Trigger');
    expect(source).toContain('<MainMenu.Sub.Content className="axhub-canvas-property-panel-submenu">');
    expect(source).toContain('属性栏');
    expect(source).toContain('显示位置');
    expect(source).toContain('默认形态');
    expect(source).toContain("propertyPanelPosition === 'left'");
    expect(source).toContain("propertyPanelPosition === 'right'");
    expect(source).toContain("propertyPanelMode === 'expanded'");
    expect(source).toContain("propertyPanelMode === 'collapsed'");
  });

  it('remounts Excalidraw only after preserving the current scene when desktop UI mode changes', () => {
    const source = readSource();

    expect(source).toContain('const [excalidrawUiModeRevision, setExcalidrawUiModeRevision] = useState(0);');
    expect(source).toContain('setInitialData(createCurrentSceneInitialData(excalidrawAPI));');
    expect(source).toContain('setExcalidrawUiModeRevision((revision) => revision + 1);');
    expect(source).toContain('key={`${canvasName}:${excalidrawUiModeRevision}`}');
  });

  it('does not open compact property popups for the expanded native panel', () => {
    const source = readSource();

    expect(source).toContain("if (mode === 'expanded') {");
    expect(source).toContain('COMPACT_PROPERTY_POPUPS.has(appState?.openPopup) ? null : undefined');
    expect(source).not.toContain("return PROPERTY_PANEL_OPEN_POPUP;\n}");
  });

  it('keeps copied canvas element links minimal and compatible with Excalidraw deep links', () => {
    const source = readSource();

    expect(source).toContain('url.searchParams.set(EXCALIDRAW_ELEMENT_LINK_PARAM, id);');
    expect(source).not.toContain('url.searchParams.set(AXHUB_CANVAS_ELEMENT_PARAM, id);');
    expect(source).not.toContain('url.searchParams.set(AXHUB_CANVAS_NAME_PARAM, currentNameRef.current);');
    expect(source).not.toContain('axhubCanvasElementType');
  });

  it('exposes current canvas image capture helpers through a browser global', () => {
    const source = readSource();

    expect(source).toMatch(/import\s+\{[^}]*exportToBlob[^}]*getDataURL[^}]*\}\s+from '@axhub\/excalidraw'/s);
    expect(source).toContain('interface AxhubExcalidrawCaptureOptions');
    expect(source).toContain('interface AxhubExcalidrawCaptureResult');
    expect(source).toContain('interface AxhubExcalidrawCaptureApi');
    expect(source).toContain('function createAxhubExcalidrawCaptureApi(excalidrawAPI: ExcalidrawAPI): AxhubExcalidrawCaptureApi');
    expect(source).toContain('captureCanvas: (options = {}) => captureExcalidrawElements(excalidrawAPI, getCaptureSceneElements(excalidrawAPI), options)');
    expect(source).toContain("captureElement: (elementId, options = {}) => {");
    expect(source).toContain('const element = getCaptureSceneElements(excalidrawAPI).find((candidate) => candidate.id === elementId);');
    expect(source).toContain("if (!element) throw new Error(`Canvas element not found: ${elementId}`);");
    expect(source).toContain('return captureExcalidrawElements(excalidrawAPI, [element], options);');
    expect(source).toContain('const blob = await exportToBlob({');
    expect(source).toContain('elements: elements as any,');
    expect(source).toContain('files: excalidrawAPI.getFiles?.() || {},');
    expect(source).toContain('let captureDimensions: { width: number; height: number } | undefined;');
    expect(source).toContain('const getCaptureDimensions = options.maxWidthOrHeight');
    expect(source).toContain('captureDimensions = {');
    expect(source).toContain('exportBackground: options.exportBackground ?? true,');
    expect(source).toContain("mimeType: options.mimeType || 'image/png',");
    expect(source).toContain('getDimensions: getCaptureDimensions,');
    expect(source).toContain('const dataUrl = await getDataURL(blob);');
    expect(source).toContain('width: captureDimensions?.width,');
    expect(source).toContain('height: captureDimensions?.height,');
    expect(source).toContain('elementIds: elements.map((element) => element.id),');
    expect(source).toContain('(window as any).__AXHUB_EXCALIDRAW_API__ = excalidrawAPI || null;');
    expect(source).toContain('(window as any).__AXHUB_EXCALIDRAW_CAPTURE__ = excalidrawAPI ? createAxhubExcalidrawCaptureApi(excalidrawAPI) : null;');
    expect(source).toContain('(window as any).__AXHUB_EXCALIDRAW_CAPTURE__ = null;');
  });

  it('mounts the unified AI generation tool and wires explicit scene persistence', () => {
    const source = readSource();

    expect(source).toContain('import CanvasAiGenerationTool, {');
    expect(source).toContain('type CanvasAiGenerationRequest,');
    expect(source).toContain('type CanvasAiGenerationResult,');
    expect(source).toContain('type CanvasViewportAiCapture,');
    expect(source).toContain("} from '../../domains/ai-generation/CanvasAiGenerationTool';");
    expect(source).toContain("import {");
    expect(source).toContain("} from '../../domains/ai-generation/CanvasDirectRunOverlay';");
    expect(source).toContain("resolveCanvasDirectRunOverlayPosition");
    expect(source).toContain("type CanvasDirectRunOverlayController");
    expect(source).toContain('createCanvasDirectRunAnnotationTaskElement');
    expect(source).toContain('updateCanvasDirectRunAnnotationTaskElement');
    expect(source).not.toContain("buildCanvasDirectStatusElements");
    expect(source).not.toContain("resolveCanvasDirectStatusElementPosition");
    expect(source).not.toContain("markCanvasDirectStatusElementFailed");
    expect(source).not.toContain("markStaleCanvasDirectStatusElements");
    expect(source).not.toContain("removeCanvasDirectStatusElement");
    expect(source).toContain('<CanvasAiGenerationTool');
    expect(source).toContain('onSubmitCanvasAssistantPrompt?: (request: CanvasAiGenerationRequest) => Promise<CanvasAiGenerationResult | boolean> | CanvasAiGenerationResult | boolean;');
    expect(source).toContain('preferredModel={preferredModel}');
    expect(source).toContain('preferredPromptClient={preferredPromptClient}');
    expect(source).toContain('onSubmitCanvasAssistantPrompt={handleSubmitCanvasAssistantPromptWithArtifacts}');
    expect(source).toContain('captureViewport={captureCurrentCanvasViewport}');
    expect(source).not.toContain('canvasDirectRunOverlayController={canvasDirectRunOverlayController}');
    expect(source).not.toContain('<CanvasDirectRunOverlay');
    expect(source).not.toContain('handleCanvasDrop');
    expect(source).not.toContain('onImageArtifact={handleCanvasImageArtifactEvent}');
    expect(source).not.toContain("import CanvasAiImageTool from '../../domains/ai-image/CanvasAiImageTool';");
    expect(source).not.toContain("import CanvasPrototypeGenerationTool from '../../domains/prototype-generation/CanvasPrototypeGenerationTool';");
  });

  it('manages canvas direct run tasks as persistent annotation elements', () => {
    const source = readSource();

    const controllerSegment = source.slice(
      source.indexOf('const canvasDirectRunOverlayController = useMemo(() => ({'),
      source.indexOf('const handleApplyProjectResources = useCallback', source.indexOf('const canvasDirectRunOverlayController = useMemo(() => ({')),
    );

    expect(source).toContain('const canvasDirectRunOverlayStopHandlersRef = useRef(new Map<string, () => void>());');
    expect(source).toContain('const canvasDirectRunControlledRemovalIdsRef = useRef(new Set<string>());');
    expect(source).toContain("const canvasDirectRunRecoveryAppliedKeyRef = useRef('');");
    expect(source).not.toContain('setCanvasDirectRunOverlayTasks');
    expect(source).not.toContain('canvasDirectRunOverlayTasksRef');
    expect(source).toContain('const canvasDirectRunOverlayController = useMemo(() => ({');
    expect(controllerSegment).toContain('createStatusTask({ prompt, scene, details })');
    expect(controllerSegment).toContain('createCanvasDirectRunAnnotationTaskElement({');
    expect(controllerSegment).toContain('getCanvasDirectRunAnnotationTaskRef(element)');
    expect(controllerSegment).toContain('excalidrawAPI.updateScene({');
    expect(controllerSegment).toContain('scheduleExplicitCanvasSave({ elements: nextElements, appState });');
    expect(controllerSegment).toContain('updateStatusTaskRef(statusTaskId, update)');
    expect(controllerSegment).toContain('markStatusTaskFailed(statusTaskId, error)');
    expect(controllerSegment).toContain('removeStatusTask(statusTaskId)');
    expect(controllerSegment).toContain('hasStatusTask(statusTaskId)');
    expect(controllerSegment).toContain('registerStatusTaskStopped(statusTaskId, handler)');
    expect(controllerSegment).toContain('resolveCanvasDirectRunOverlayPosition({');
    expect(controllerSegment).toContain('scrollToContent([taskElement]');
    expect(controllerSegment).toContain('return { id: taskElement.id, x: taskElement.x, y: taskElement.y, width: taskElement.width, height: taskElement.height };');
    expect(source).toContain('handleCanvasDirectRunAnnotationTaskDeletion');
    expect(source).toContain('markUnownedCanvasDirectRunAnnotationTasksAborted');
    expect(source).toContain("updateCanvasDirectRunAnnotationTask(taskId, { status: 'aborted' });");
    expect(source).toContain('onStopAnnotationTask={handleStopCanvasDirectRunOverlayTask}');
    expect(source).not.toContain('onDismissAnnotationTask={removeCanvasDirectRunOverlayTask}');
  });

  it('executes annotation prompt cards through the existing canvas direct-run task flow', () => {
    const source = readSource();

    expect(source).toContain("import { createCanvasDirectRunController, type CanvasDirectRunController } from '../../domains/ai-generation/canvasDirectRun';");
    expect(source).toContain("import { appendCanvasGenerationPromptSettings } from '../../domains/ai-generation/canvasGenerationPromptSettings';");
    expect(source).toContain('appendCanvasAiPrototypeStartSystemPrompt');
    expect(source).toContain('getCanvasAiPrototypeStartSystemPrompt');
    expect(source).toContain('const annotationDirectRunControllerRef = useRef<CanvasDirectRunController | null>(null);');
    expect(source).toContain('const annotationActiveStatusTaskRunsRef = useRef(new Map<string, { abort: () => Promise<boolean> }>());');
    expect(source).toContain('const handleExecuteAnnotationPrompt = useCallback(async (element: CanvasElementContextInfo, promptText: string) => {');
    expect(source).toContain("const scene: CanvasAiScene = 'page';");
    expect(source).toContain('const statusTask = canvasDirectRunOverlayController.createStatusTask({');
    expect(source).toContain("source: 'annotation-prompt-card',");
    expect(source).toContain("source: 'annotation-prompt-card',\n            sceneSettings,");
    expect(source).toContain('const startResult = controller.start(request);');
    expect(source).toContain('annotationActiveStatusTaskRunsRef.current.set(statusTask.id, {');
    expect(source).toContain('canvasDirectRunOverlayController.registerStatusTaskStopped(statusTask.id, () => {');
    expect(source).toContain('onExecuteAnnotationPrompt={handleExecuteAnnotationPrompt}');
  });

  it('does not route canvas direct run task nodes through embeddable rendering', () => {
    const source = readSource();

    expect(source).toContain('createCanvasDirectRunAnnotationTaskElement');
    expect(source).toContain('normalizeCanvasDirectRunAnnotationTaskElements');
    expect(source).toContain('normalizeCanvasDirectRunAnnotationTaskElement(element)');
    expect(source).toContain('const normalizeCanvasDirectRunAnnotationTaskScene = useCallback(() => {');
    expect(source).toContain('normalizeCanvasDirectRunAnnotationTaskScene();');
    expect(source).toContain('}, [canvasFilePath, canvasName, excalidrawAPI, normalizeCanvasDirectRunAnnotationTaskScene]);');
    expect(source).not.toContain('data-axhub-canvas-direct-run-placeholder');
  });

  it('revives canvas direct run annotation task overlays after reload through scene customData', () => {
    const source = readSource();

    expect(source).toContain('getCanvasDirectRunAnnotationTaskRef(element)');
    expect(source).toContain("taskRef.status !== 'running'");
    expect(source).toContain('canvasDirectRunKnownRunningTaskIdsRef.current');
    expect(source).toContain('canvasDirectRunControlledRemovalIdsRef.current.delete(statusTaskId)');
    expect(source).toContain('canvasDirectRunOverlayStopHandlersRef.current.has(taskRef.statusTaskId)');
    expect(source).toContain("status: 'aborted',");
    expect(source).toContain('canvasDirectRunRecoveryAppliedKeyRef.current = recoveryKey;');
    expect(source).toContain('handler?.()');
    expect(source).not.toContain('customData?.type === \'axhub-canvas-ai-direct-status\'');
  });

  it('exports selected canvas elements as a PNG attachment for the AI composer', () => {
    const source = readSource();

    expect(source).toContain('onAddScreenshotToAI?: (attachment: AssistantImageAttachmentPayload) => Promise<boolean> | boolean;');
    expect(source).toContain('const handleAddSelectedScreenshotToAI = useCallback(async (elements: CanvasElementContextInfo[]) => {');
    expect(source).toContain('const selectedElementIds = new Set(elements.map((element) => element.elementId));');
    expect(source).toContain("import { collectCanvasScreenshotElementsForSelection } from './canvas-embeds/canvasSelectionCapture';");
    expect(source).toContain('const selectedElements = collectCanvasScreenshotElementsForSelection(');
    expect(source).toContain('getCaptureSceneElements(excalidrawAPI),');
    expect(source).toContain('selectedElementIds,');
    expect(source).toContain('const capture = await captureExcalidrawElements(excalidrawAPI, selectedElements, {');
    expect(source).toContain("mimeType: 'image/png',");
    expect(source).toContain('exportPadding: 16,');
    expect(source).toContain('await onAddScreenshotToAI(buildAssistantImageAttachmentPayload({');
    expect(source).toContain('dataUrl: capture.dataUrl,');
    expect(source).toContain('onAddScreenshotToAI={handleAddSelectedScreenshotToAI}');
    expect(source).toContain('onAddNodesToAI={onAddToContext}');
    expect(source).toContain('onAddImageToAI?: (attachment: AssistantImageAttachmentPayload, promptText?: string) => Promise<boolean> | boolean;');
    expect(source).toContain('const handleAddSelectedImageToAI = useCallback(async (elements: CanvasElementContextInfo[], promptText?: string) => {');
    expect(source).toContain("element.type === 'image'");
    expect(source).toContain('const fileId = typeof selectedImage?.fileId === \'string\' ? selectedImage.fileId.trim() : \'\';');
    expect(source).toContain('const files = excalidrawAPI.getFiles?.() || {};');
    expect(source).toContain("const file = files[fileId] as { dataURL?: string; dataUrl?: string } | undefined;");
    expect(source).toContain("const dataUrl = String(file?.dataURL || file?.dataUrl || '').trim();");
    expect(source).toContain("if (!dataUrl.startsWith('data:image/')) return;");
    expect(source).toContain('await onAddImageToAI(buildAssistantImageAttachmentPayload({');
    expect(source).toContain('}), promptText);');
    expect(source).toContain('onAddImageToAI={handleAddSelectedImageToAI}');
  });

  it('does not keep the old AI image placeholder artifact hook on the unified AI generation tool', () => {
    const source = readSource();

    expect(source).not.toContain("import { resolveCanvasImageArtifactUpdate, type CanvasImageArtifactEvent } from '../../domains/ai-image/canvasImageArtifacts';");
    expect(source).not.toContain('const handleCanvasImageArtifactEvent = useCallback((event: CanvasImageArtifactEvent) => {');
    expect(source).not.toContain('resolveCanvasImageArtifactUpdate({');
    expect(source).not.toContain('onImageArtifact={handleCanvasImageArtifactEvent}');
    expect(source).toContain('const handleSubmitCanvasAssistantPromptWithArtifacts = useCallback(async (request: CanvasAiGenerationRequest) => {');
    expect(source).toContain('applyGenerationArtifactsToCanvasElements({');
    expect(source).not.toContain('const handleInsertGenerationHistoryArtifact = useCallback((artifact: GenerationArtifactRecord) => {');
  });

  it('runs background-to-transparent as a local canvas image operation', () => {
    const source = readSource();

    expect(source).toContain("import { toast } from 'sonner';");
    expect(source).toContain("import { removeKeyedBackgroundFromDataUrl } from './canvas-embeds/transparentImage';");
    expect(source).toContain("import { createCanvasBackgroundTransparentImageUpdate } from './canvasBackgroundTransparentInsertion';");
    expect(source).toContain('const handleMakeImageBackgroundTransparent = useCallback(async (elements: CanvasElementContextInfo[]) => {');
    expect(source).toContain('const transparentDataUrl = await removeKeyedBackgroundFromDataUrl(dataUrl);');
    expect(source).toContain('const update = createCanvasBackgroundTransparentImageUpdate({');
    expect(source).toContain('sourceImage: selectedImage,');
    expect(source).toContain('dataURL: transparentDataUrl,');
    expect(source).toContain('excalidrawAPI.addFiles(update.files);');
    expect(source).toContain('appState: update.appState as any,');
    expect(source).toContain('captureUpdate: CaptureUpdateAction.IMMEDIATELY,');
    expect(source).toContain("toast.error(`背景转透明失败：${message}`);");
    expect(source).toContain('scheduleExplicitCanvasSave();');
    expect(source).toContain('onMakeImageBackgroundTransparent={handleMakeImageBackgroundTransparent}');
    expect(source).not.toContain('managementApi.aiRuns');
  });

  it('copies the selected canvas image original data to the system clipboard', () => {
    const source = readSource();

    expect(source).toContain("import { copyImageDataUrlToClipboard } from '../../utils/clipboard';");
    expect(source).toContain('const handleCopySelectedImageToClipboard = useCallback(async (elements: CanvasElementContextInfo[]) => {');
    expect(source).toContain("const file = files[fileId] as { dataURL?: string; dataUrl?: string } | undefined;");
    expect(source).toContain("const dataUrl = String(file?.dataURL || file?.dataUrl || '').trim();");
    expect(source).toContain("if (!dataUrl.startsWith('data:image/')) return;");
    expect(source).toContain('await copyImageDataUrlToClipboard(dataUrl);');
    expect(source).toContain("toast.success('图片已复制到剪贴板');");
    expect(source).toContain("toast.error(`复制图片失败：${message}`);");
    expect(source).toContain('onCopyImageToClipboard={handleCopySelectedImageToClipboard}');
  });

  it('does not listen for assistant artifact postMessages or sync them into canvas history', () => {
    const source = readSource();

    expect(source).not.toContain("ASSISTANT_ARTIFACTS_CHANGED_EVENT");
    expect(source).not.toContain("ASSISTANT_ARTIFACTS_SYNC_REQUEST_EVENT");
    expect(source).not.toContain("mapAcpArtifactsToGenerationArtifacts");
    expect(source).not.toContain("syncAssistantArtifactsToHistory");
    expect(source).not.toContain("mapGenerationArtifactToCanvasAiRunArtifact");
    expect(source).not.toContain("getGenerationArtifactHistoryStore().upsertArtifactAndPersist");
    expect(source).not.toContain("handleAssistantArtifactsChanged");
    expect(source).not.toContain("handleAssistantArtifactsSyncRequest");
    expect(source).toContain('const handleSubmitCanvasAssistantPromptWithArtifacts = useCallback(async (request: CanvasAiGenerationRequest) => {');
    expect(source).toContain('applyGenerationArtifactsToCanvasElements({');
  });

  it('keeps assistant artifact insertion scoped to explicit canvas assistant submissions', () => {
    const source = readSource();

    expect(source).not.toContain('const applyGenerationArtifactsToCanvas = useCallback');
    expect(source).not.toContain('const handleInsertGenerationHistoryArtifact = useCallback');
    expect(source).toContain('const handleSubmitCanvasAssistantPromptWithArtifacts = useCallback');
    expect(source).toContain('const artifacts = typeof result === \'object\' && result !== null && Array.isArray(result.artifacts)');
    expect(source).toContain('scheduleExplicitCanvasSave({ elements: update.elements, appState: nextAppState });');
  });

  it('inserts returned artifacts for the bottom canvas start assistant composer', () => {
    const source = readSource();
    const submitHandlerSource = source.slice(
      source.indexOf('const handleSubmitCanvasAssistantPromptWithArtifacts = useCallback(async (request: CanvasAiGenerationRequest) => {'),
      source.indexOf('const handleAddSelectedScreenshotToAI = useCallback', source.indexOf('const handleSubmitCanvasAssistantPromptWithArtifacts = useCallback')),
    );

    expect(submitHandlerSource).not.toContain("const shouldApplyReturnedArtifacts = request.source !== 'canvas-start';");
    expect(submitHandlerSource).toContain("const shouldApplyReturnedArtifacts = request.source !== 'canvas-viewport';");
    expect(submitHandlerSource).toContain('if (shouldApplyReturnedArtifacts && artifacts.length > 0 && excalidrawAPI) {');
    expect(submitHandlerSource.indexOf('if (shouldApplyReturnedArtifacts && artifacts.length > 0 && excalidrawAPI) {')).toBeLessThan(
      submitHandlerSource.indexOf('applyGenerationArtifactsToCanvasElements({'),
    );
  });

  it('queues a latest scene snapshot when a server save is already in flight', () => {
    const source = readSource();
    const saveToServerStart = source.indexOf('const saveToServer = useCallback');
    const saveToServerEnd = source.indexOf('// ── Local save:', saveToServerStart);
    const saveToServerSource = source.slice(saveToServerStart, saveToServerEnd);

    expect(source).toContain('const queuedServerSaveRef = useRef<{ elements: readonly any[]; appState: any } | null>(null);');
    expect(saveToServerSource).toContain('if (isSavingRef.current) {');
    expect(saveToServerSource).toContain('queuedServerSaveRef.current = { elements, appState };');
    expect(saveToServerSource).toContain('const queuedSnapshot = queuedServerSaveRef.current;');
    expect(saveToServerSource).toContain('queuedServerSaveRef.current = null;');
    expect(saveToServerSource).toContain('void saveToServer(queuedSnapshot.elements, queuedSnapshot.appState);');
  });

  it('adds original image files to copy events for selected canvas images', () => {
    const source = readSource();

    expect(source).toContain("import { enhanceCanvasImageCopyEvent } from './canvasImageClipboard';");
    expect(source).toContain('const handleCanvasImageCopy = (event: ClipboardEvent) => {');
    expect(source).toContain('enhanceCanvasImageCopyEvent(event, {');
    expect(source).toContain('activeElement: document.activeElement,');
    expect(source).toContain('container: canvasContainerRef.current,');
    expect(source).toContain('elements: excalidrawAPI.getSceneElements(),');
    expect(source).toContain('appState: excalidrawAPI.getAppState(),');
    expect(source).toContain('files: excalidrawAPI.getFiles?.() || {},');
    expect(source).toContain("document.addEventListener('copy', handleCanvasImageCopy, true)");
    expect(source).toContain("document.removeEventListener('copy', handleCanvasImageCopy, true)");
  });

  it('keeps the top-right canvas capsule as mutually exclusive general and image AI toggles without refresh', () => {
    const source = readSource();

    expect(source).not.toContain("import GenerationHistoryPopover from '../../domains/ai-generation/GenerationHistoryPopover';");
    expect(source).not.toContain('<GenerationHistoryPopover');
    expect(source).not.toContain("import OpenInDropdown from '../sidebar/OpenInDropdown';");
    expect(source).not.toMatch(/import\s+\{[^}]*RefreshCw[^}]*\}\s+from 'lucide-react'/s);
    expect(source).toMatch(/import\s+\{[^}]*ImageIcon[^}]*Sparkles[^}]*\}\s+from 'lucide-react'/s);
    expect(source).toContain('className="axhub-canvas-top-right-capsule"');
    expect(source).not.toContain('className="axhub-canvas-top-right-capsule__divider"');
    expect(source).not.toContain('aria-label="刷新画布"');
    expect(source).not.toContain('title="刷新画布"');
    expect(source).not.toContain('onClick={() => void handleRefreshCanvasFromServer()}');
    expect(source).toContain('const imageAiActive = aiPanelMode === \'image-ai\';');
    expect(source).toContain('const generalAiActive = aiPanelMode === \'general-ai\';');
    expect(source).toContain('const handleToggleImageAiPanel = useCallback(() => {');
    expect(source).toContain('const handleToggleGeneralAiPanel = useCallback(() => {');
    expect(source).toContain('aria-label={imageAiActive ? \'关闭生图 AI\' : \'打开生图 AI\'}');
    expect(source).toContain('aria-label={generalAiActive ? \'关闭对话 AI\' : \'打开对话 AI\'}');
    expect(source).toContain('data-active={imageAiActive ? \'true\' : undefined}');
    expect(source).toContain('data-active={generalAiActive ? \'true\' : undefined}');
    expect(source).toContain('<ImageIcon aria-hidden="true" />');
    expect(source).toContain('<Sparkles aria-hidden="true" />');
    expect(source).toContain('const reloadCanvasFromServer = useCallback(async () => {');
    expect(source).toContain('const handleRefreshCanvasFromServer = useCallback(async () => {');
    expect(source).toContain('await saveToServer(excalidrawAPI.getSceneElements(), excalidrawAPI.getAppState());');
    expect(source).toContain('if (pendingLocalContentRef.current || bridgeDirtyRef.current) return;');
    expect(source).toContain('await reloadCanvasFromServer();');
    expect(source).not.toContain('targetPath={generationHistoryTargetPath}');
    expect(source).not.toContain('container={canvasContainerRef.current}');
    expect(source).not.toContain('<OpenInDropdown');
    expect(source).not.toContain('variant="canvas-icon"');
    expect(source).toContain('onOpenImageAiPanel?.();');
    expect(source).toContain('onOpenAcpWebAgent?.(aiOpenTargetPath);');
    expect(source).not.toContain('生成记录');
    expect(source).not.toContain('onOpenAiImageHistory');
    expect(source).not.toContain("import AiImageHistoryDialog from '../../domains/ai-image/AiImageHistoryDialog';");
    expect(source).not.toContain('<AiImageHistoryDialog');
    expect(source).not.toContain('aiImageHistoryOpen');
  });

  it('does not accept ACP iframe artifact queries for canvas history refresh', () => {
    const source = readSource();

    expect(source).not.toContain('type AssistantArtifactsQuery,');
    expect(source).not.toContain('getAssistantArtifacts?: AssistantArtifactsQuery;');
    expect(source).not.toContain('latestAssistantArtifactThreadRef');
    expect(source).not.toContain('getAssistantArtifacts({');
    expect(source).not.toContain("onSyncArtifacts={() => syncAssistantArtifactsForHistory('manual')}");
  });

  it('passes homepage AI open menu props through the canvas shell', () => {
    const source = readSource();
    const propsStart = source.indexOf('interface ExcalidrawCanvasProps {');
    const propsEnd = source.indexOf('\n}\n\nconst LOCAL_SAVE_DEBOUNCE_MS', propsStart);
    const propsSource = source.slice(propsStart, propsEnd);
    const destructureStart = source.indexOf('export default function ExcalidrawCanvas({');
    const destructureEnd = source.indexOf('}: ExcalidrawCanvasProps)', destructureStart);
    const destructureSource = source.slice(destructureStart, destructureEnd);

    expect(propsSource).toContain('preferredIDE?: MainIDEPreference;');
    expect(propsSource).toContain('ideAvailability?: IDEAvailabilityMap;');
    expect(propsSource).toContain('agentAvailability?: RuntimeAgentAvailability;');
    expect(propsSource).toContain('onOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;');
    expect(propsSource).toContain('webAgentPanelOpen?: boolean;');
    expect(propsSource).toContain('aiPanelMode?: \'general-ai\' | \'image-ai\' | null;');
    expect(propsSource).toContain('onOpenImageAiPanel?: () => void | Promise<void>;');
    expect(propsSource).toContain('onCloseAiPanel?: () => void;');
    expect(propsSource).toContain('onCloseWebAgentPanel?: () => void;');
    expect(propsSource).toContain('onPreferredIDEChange?: (ide: MainIDEPreference) => void;');
    expect(propsSource).not.toContain('onRefreshAvailability?: () => void;');
    expect(propsSource).toContain('onOpenAISettings?: () => void;');

    for (const prop of [
      'onOpenAcpWebAgent,',
      'aiPanelMode,',
      'onOpenImageAiPanel,',
      'onCloseAiPanel,',
      'onCloseWebAgentPanel,',
      'onOpenAISettings,',
    ]) {
      expect(destructureSource).toContain(prop);
    }
    expect(destructureSource).not.toContain('preferredIDE,');
    expect(destructureSource).not.toContain('ideAvailability,');
    expect(destructureSource).not.toContain('agentAvailability,');
    expect(destructureSource).not.toContain('webAgentPanelOpen,');
    expect(destructureSource).not.toContain('onPreferredIDEChange,');
  });

  it('simplifies the welcome screen copy and removes welcome menu actions', () => {
    const source = readSource();
    const welcomeScreenStart = source.indexOf('function AxhubCanvasWelcomeScreen({');
    const welcomeScreenEnd = source.indexOf('\n}\n\nfunction normalizeSavedCanvasContent', welcomeScreenStart);
    const welcomeScreenSource = source.slice(welcomeScreenStart, welcomeScreenEnd);
    const logoStart = welcomeScreenSource.indexOf('<WelcomeScreen.Center.Logo>');
    const logoEnd = welcomeScreenSource.indexOf('</WelcomeScreen.Center.Logo>', logoStart);
    const headingStart = welcomeScreenSource.indexOf('<WelcomeScreen.Center.Heading>');
    const headingEnd = welcomeScreenSource.indexOf('</WelcomeScreen.Center.Heading>', headingStart);
    const logoSource = welcomeScreenSource.slice(logoStart, logoEnd);
    const headingSource = welcomeScreenSource.slice(headingStart, headingEnd);

    expect(welcomeScreenSource).toContain('产品画布');
    expect(welcomeScreenSource).toContain('好的产品从一份草稿开始。');
    expect(welcomeScreenSource).not.toContain('资源画布');
    expect(welcomeScreenSource).not.toContain('好的方案从一份草稿开始。');
    expect(logoStart).toBeGreaterThan(-1);
    expect(headingStart).toBeGreaterThan(logoStart);
    expect(logoEnd).toBeGreaterThan(logoStart);
    expect(headingEnd).toBeGreaterThan(headingStart);
    expect(source).toMatch(/import\s+\{[^}]*PencilRuler[^}]*\}\s+from 'lucide-react'/s);
    expect(logoSource).toContain('className="axhub-canvas-welcome-title"');
    expect(logoSource).toContain('<PencilRuler');
    expect(logoSource).toContain('className="axhub-canvas-welcome-title__icon"');
    expect(logoSource).toContain('<span>产品画布</span>');
    expect(logoSource).toContain('产品画布');
    expect(logoSource).not.toContain('好的产品从一份草稿开始。');
    expect(headingSource).toContain('好的产品从一份草稿开始。');
    expect(headingSource).not.toContain('产品画布');
    expect(welcomeScreenSource).not.toContain('axhub-canvas-welcome-subtitle');
    expect(welcomeScreenSource).not.toContain('<WelcomeScreen.Center.Menu>');
    expect(welcomeScreenSource).not.toContain('<WelcomeScreen.Center.MenuItem');
    expect(welcomeScreenSource).not.toContain('<WelcomeScreen.Center.MenuItemHelp');
    expect(welcomeScreenSource).not.toContain('打开 ClaudeCode / Codex WebUI');
    expect(welcomeScreenSource).not.toContain('在编辑器中打开');
    expect(welcomeScreenSource).not.toContain('整理灵感、构思方案、快速生成原型');

    expect(source).not.toContain('与 AI 协作');
    expect(source).not.toContain('AxhubCanvasWelcomeOverlay');
    expect(source).not.toContain('axhub-canvas-welcome-hints');
    expect(source).not.toContain('预览生成的原型');
    expect(source).not.toContain('runCanvasOpenAction');
    expect(source).not.toContain('runCanvasProjectOpenAction');
    expect(source).not.toContain('AxhubWelcomeMenuIcon');
  });

  it('configures local task stores by resource canvas file paths', () => {
    const source = readSource();

    expect(source).toContain('export function resolveCanvasGenerationTaskTargetPath(...values: Array<string | undefined>): string | undefined');
    expect(source).toContain("const resourcesMarker = 'src/resources/';");
    expect(source).toContain('return normalized.slice(markerIndex + resourcesMarker.length + 1);');
    expect(source).toContain('return `src/resources/${normalized.slice(\'resources/\'.length)}`;');
    expect(source).toContain('const targetPath = resolveCanvasGenerationTaskTargetPath(canvasName, canvasFilePath);');
    expect(source).toContain('void getAiImageTaskStore().configure({ projectId: activeProjectId, targetPath });');
    expect(source).toContain('void getPrototypeGenerationTaskStore().configure({ projectId: activeProjectId, targetPath });');
    expect(source).toContain('}, [activeProjectId, canvasName, canvasFilePath]);');
    expect(source).not.toContain('return `prototypes/${prototypePathMatch[1]}`;');
    expect(source).not.toContain("return `prototypes/${match[1]}`;");
    expect(source).not.toContain('resolveAiImageHistoryTargetPath');
  });

  it('does not keep generation history image insertion payloads in canvas nodes', () => {
    const source = readSource();

    expect(source).not.toContain('const handleInsertGenerationHistoryArtifact = useCallback');
  });

  it('does not declare history insertion callbacks after explicit canvas saving', () => {
    const source = readSource();
    const explicitSaveIndex = source.indexOf('const scheduleExplicitCanvasSave = useCallback');
    const historyInsertIndex = source.indexOf('const handleInsertGenerationHistoryArtifact = useCallback');

    expect(explicitSaveIndex).toBeGreaterThan(-1);
    expect(historyInsertIndex).toBe(-1);
  });

  it('opens a project resource picker from the compact toolbar and explicitly persists inserted resources', () => {
    const source = readSource();

    expect(source).toContain("import {\n    CanvasProjectResourcePickerDialog,\n    buildCanvasProjectResourceItemSelections,");
    expect(source).toContain('type CanvasProjectResourceItemSelection');
    expect(source).toContain('type CanvasProjectResourceItems');
    expect(source).toContain('type CanvasProjectResourceTrees');
    expect(source).toContain('projectResourceTrees?: CanvasProjectResourceTrees;');
    expect(source).toContain('projectResourceItems?: CanvasProjectResourceItems;');
    expect(source).toContain('const [projectResourceDialogOpen, setProjectResourceDialogOpen] = useState(false);');
    expect(source).toContain('const [projectResourceSelectedKeys, setProjectResourceSelectedKeys] = useState<Set<string>>(() => new Set());');
    expect(source).toContain('const handleProjectResourceClick = useCallback(() => setProjectResourceDialogOpen(true), []);');
    expect(source).toContain('onProjectResourceClick: handleProjectResourceClick');
    expect(source).toContain('function buildCanvasResourcePayloadFromPickerSelection');
    expect(source).toContain('async function insertCanvasResourceSelections');
    expect(source).toContain('const column = index % 2;');
    expect(source).toContain('const row = Math.floor(index / 2);');
    expect(source).toContain('await createImageElementFromDrop(excalidrawAPI, payload, x, y);');
    expect(source).toContain('createEmbeddableFromDrop(');
    expect(source).toContain('scheduleExplicitCanvasSave();');
    expect(source).toContain('<CanvasProjectResourcePickerDialog');
    expect(source).toContain('selectionMode="canvas-items"');
    expect(source).toContain('onApply={handleApplyProjectResources}');
  });

  it('does not keep sidebar canvas drag/drop or window add-to-canvas handlers', () => {
    const source = readSource();

    expect(source).not.toContain("import { CANVAS_DROP_MIME } from './canvasDropTypes';");
    expect(source).not.toContain("export { CANVAS_DROP_MIME } from './canvasDropTypes';");
    expect(source).not.toContain("window.addEventListener('axhub:addToCanvas', handler);");
    expect(source).not.toContain("window.removeEventListener('axhub:addToCanvas', handler);");
    expect(source).not.toContain('const handleCanvasDragOver = useCallback');
    expect(source).not.toContain('const handleCanvasDrop = useCallback');
    expect(source).not.toContain('onDragOverCapture={handleCanvasDragOver}');
    expect(source).not.toContain('onDropCapture={handleCanvasDrop}');
    expect(source).not.toContain('CANVAS_DROP_MIME');
  });

  it('defaults new embeddable resources to preview mode while falling back to link mode for non-previewable payloads', () => {
    const source = readSource();
    const createStart = source.indexOf('export function createEmbeddableFromDrop');
    const createEnd = source.indexOf('async function createImageElementFromDrop', createStart);
    const createSource = source.slice(createStart, createEnd);
    const renderStart = source.indexOf('const renderEmbeddable = useCallback');
    const renderEnd = source.indexOf('const handleLinkOpen = useCallback', renderStart);
    const renderSource = source.slice(renderStart, renderEnd);

    expect(createSource).toContain("const requestedEmbedViewMode = payload.embedViewMode || 'preview';");
    expect(createSource).toContain("const embedViewMode = requestedEmbedViewMode === 'preview' && !isCanvasDropPayloadPreviewable(payload)");
    expect(createSource).toContain("? 'link'");
    expect(createSource).toContain(': requestedEmbedViewMode;');
    expect(createSource).not.toContain("const embedViewMode = payload.embedViewMode || 'link';");
    expect(renderSource).toContain("const embedViewMode = customData?.embedViewMode || 'link';");
  });

  it('creates new canvas embeddables as generic preview nodes that can hold arbitrary links', () => {
    const source = readSource();
    const createStart = source.indexOf('export function createEmbeddableFromDrop');
    const createEnd = source.indexOf('async function createImageElementFromDrop', createStart);
    const createSource = source.slice(createStart, createEnd);

    expect(createSource).toContain("resourceType?: 'preview' | 'prototype' | 'doc' | 'theme';");
    expect(createSource).toContain("const resourceType = payload.resourceType || 'preview';");
    expect(createSource).toContain("const link = payload.openUrl || previewUrl || payload.previewUrl || '';");
    expect(createSource).toContain("previewKind: payload.previewKind || 'web',");
    expect(createSource).toContain('previewUrl: previewUrl || payload.previewUrl || \'\',');
    expect(createSource).not.toContain("const resourceType = payload.resourceType || (isDoc ? 'doc' : isTheme ? 'theme' : 'prototype');");
  });

  it('does not pass old prototype generator node props into the unified AI generation tool', () => {
    const source = readSource();
    const toolSegment = source.slice(
      source.indexOf('<CanvasAiGenerationTool'),
      source.indexOf('/>', source.indexOf('<CanvasAiGenerationTool')),
    );

    expect(source).toContain('assistantApiBaseUrl?: string;');
    expect(source).not.toContain('assistantProjectPath?: string;');
    expect(source).toContain('preferredPromptClient?: PromptClientPreference;');
    expect(source).toContain('prototypes?: ItemData[];');
    expect(source).toContain('onRefreshPrototypes?: () => Promise<ItemData[]>;');
    expect(source).not.toContain('onStartAssistantRuntimeForCanvas?: () => Promise<{ apiBaseUrl?: string; projectPath?: string } | null | undefined>;');
    expect(toolSegment).toContain('<CanvasAiGenerationTool');
    expect(toolSegment).toContain('canvasFilePath={canvasFilePath || canvasName}');
    expect(toolSegment).not.toContain('assistantApiBaseUrl={assistantApiBaseUrl}');
    expect(toolSegment).not.toContain('assistantProjectPath={assistantProjectPath}');
    expect(toolSegment).toContain('preferredModel={preferredModel}');
    expect(toolSegment).toContain('preferredPromptClient={preferredPromptClient}');
    expect(toolSegment).not.toContain('prototypes={prototypes}');
    expect(toolSegment).not.toContain('onRefreshPrototypes={onRefreshPrototypes}');
    expect(toolSegment).not.toContain('onStartAssistantRuntime={onStartAssistantRuntimeForCanvas}');
    expect(toolSegment).not.toContain('onSceneMutated={scheduleExplicitCanvasSave}');
    expect(toolSegment).not.toContain('containerRef={canvasContainerRef as React.RefObject<HTMLDivElement>}');
  });

  it('does not retain assistant project path after removing the canvas prompt composer', () => {
    const source = readSource();
    const propsStart = source.indexOf('export default function ExcalidrawCanvas({');
    const propsEnd = source.indexOf('}: ExcalidrawCanvasProps)', propsStart);
    const propsSource = source.slice(propsStart, propsEnd);

    expect(propsStart).toBeGreaterThanOrEqual(0);
    expect(propsSource).not.toContain('assistantProjectPath,');
    expect(source).not.toContain('assistantProjectPath={assistantProjectPath}');
  });

  it('does not consume placeholder start requests by inserting generator nodes into the canvas', () => {
    const source = readSource();

    expect(source).not.toContain('pendingAiGenerationRequest?:');
    expect(source).not.toContain('onPendingAiGenerationRequestConsumed?:');
    expect(source).not.toContain('detail: pendingAiGenerationRequest');
    expect(source).not.toContain('onPendingAiGenerationRequestConsumed?.();');
  });

  it('opens prototype preview nodes through the client preview url instead of the admin deep link', () => {
    const source = readSource();
    const resolverStart = source.indexOf('function resolveEmbeddableOpenUrl');
    const resolverEnd = source.indexOf('export function createEmbeddableFromDrop', resolverStart);
    const resolverSource = source.slice(resolverStart, resolverEnd);

    expect(resolverSource).toContain("const sourceResourceType = resolveString(element?.customData?.sourceResourceType);");
    expect(resolverSource).toContain("resolveEmbeddableResourceType(element) === 'prototype' || sourceResourceType === 'prototype'");
    expect(resolverSource).toContain('return previewUrl;');
    expect(resolverSource).toContain('const storedOpenUrl = resolveString(element?.customData?.openUrl);');
  });

  it('does not wire a top toolbar AI generation action into the canvas enhancer', () => {
    const source = readSource();

    expect(source).not.toContain("import { AI_GENERATION_INSERT_EVENT_NAME } from '../../domains/ai-generation/CanvasAiGenerationTool';");
    expect(source).not.toContain('onAiGenerationToolClick: () => {');
    expect(source).not.toContain('document.dispatchEvent(new CustomEvent(AI_GENERATION_INSERT_EVENT_NAME, {');
    expect(source).not.toContain('onAiImageToolClick: () => {');
    expect(source).not.toContain("axhub:insertAiImageGenerator");
    expect(source).not.toContain("onPrototypeToolClick: () => document.dispatchEvent(new CustomEvent('axhub:insertPrototypeGenerator'))");
  });

  it('mounts the Drawio canvas tool and dispatches insertion from the compact toolbar enhancer', () => {
    const source = readSource();

    expect(source).toContain("import CanvasDrawioTool from '../../domains/drawio/CanvasDrawioTool';");
    expect(source).toContain("import { DRAWIO_INSERT_EVENT_NAME } from '../../domains/drawio/canvasDrawio';");
    expect(source).toContain('onDrawioToolClick: () => document.dispatchEvent(new CustomEvent(DRAWIO_INSERT_EVENT_NAME))');
    expect(source).toContain('<CanvasDrawioTool');
    expect(source).toContain('containerRef={canvasContainerRef as React.RefObject<HTMLDivElement>}');
    expect(source).toContain('onSceneMutated={scheduleExplicitCanvasSave}');
    expect(source).not.toContain('function buildDrawioChartCanvasPayload()');
    expect(source).not.toContain("window.dispatchEvent(new CustomEvent('axhub:addToCanvas', {");
  });

  it('does not show custom welcome hint overlays on top of the default welcome screen', () => {
    const source = readSource();

    expect(source).not.toContain('function AxhubCanvasWelcomeOverlay');
    expect(source).not.toContain('welcomeOverlayVisible');
    expect(source).not.toContain('selectCanvasWelcomeOverlayVisible');
    expect(source).not.toContain('isCanvasWelcomeOverlayVisible');
    expect(source).not.toContain('axhub-canvas-welcome-hints');
    expect(source).not.toContain('与 AI 协作');
    expect(source).not.toContain('拖入原型和资源，可以作为创作的上下文');
    expect(source).not.toContain('axhub-canvas-welcome-hint--sidebar');
  });

  it('applies bridge reloads as remote scene updates without scheduling autosave bounce-back', () => {
    const source = readSource();

    expect(source).toContain('const REMOTE_RELOAD_CHANGE_IGNORE_MS = 1000;');
    expect(source).toContain('const applyingRemoteCanvasReloadRef = useRef(false);');
    expect(source).toContain('const remoteReloadIgnoreUntilRef = useRef(0);');
    expect(source).toContain('function normalizeCanvasDataForSaveBaseline(data: any): string {');
    expect(source).toContain("source: 'axhub-make'");
    expect(source).toContain('const elements = Array.isArray(data?.elements) ? data.elements.filter((el: any) => !el.isDeleted) : [];');
    expect(source).toContain('elements: canonicalized.elements,');
    expect(source).toContain('const serverContent = normalizeCanvasDataForSaveBaseline(data);');
    expect(source).toContain("import {\n    applyRemoteCanvasFileIdReplacements,\n    buildRemoteCanvasScenePatch,\n    buildRemoteCanvasFilePatch,\n    canonicalizeRemoteCanvasFileAliasesForSave,\n    type RemoteCanvasFileAlias,\n} from './canvasRemoteSceneMerge';");
    expect(source).toContain('const remoteContent = normalizeCanvasDataForSaveBaseline(data);');
    expect(source).toContain('lastSavedContentRef.current = remoteContent;');
    expect(source).toContain('applyingRemoteCanvasReloadRef.current = true;');
    expect(source).toContain('remoteReloadIgnoreUntilRef.current = Date.now() + REMOTE_RELOAD_CHANGE_IGNORE_MS;');
    expect(source).toContain('const remoteCanvasFileAliasesRef = useRef<Record<string, RemoteCanvasFileAlias>>({});');
    expect(source).toContain('const remoteFilePatch = buildRemoteCanvasFilePatch(');
    expect(source).toContain('remoteCanvasFileAliasesRef.current,');
    expect(source).toContain('if (remoteFilePatch.files.length > 0) {');
    expect(source).toContain('excalidrawAPI.addFiles(remoteFilePatch.files);');
    expect(source).toContain('remoteCanvasFileAliasesRef.current = remoteFilePatch.fileAliases;');
    expect(source).toContain('const remoteElements = applyRemoteCanvasFileIdReplacements(');
    expect(source).toContain('remoteFilePatch.fileIdReplacements,');
    expect(source).toContain('const canonicalized = canonicalizeRemoteCanvasFileAliasesForSave(');
    expect(source).toContain('remoteCanvasFileAliasesRef.current,');
    expect(source).toContain('elements: canonicalized.elements.filter((el: any) => !el.isDeleted),');
    expect(source).toContain('files: canonicalized.files,');
    expect(source).toContain('const remoteScenePatch = buildRemoteCanvasScenePatch({');
    expect(source).toContain('currentElements: excalidrawAPI.getSceneElements(),');
    expect(source).toContain('remoteElements,');
    expect(source).toContain('currentAppState: excalidrawAPI.getAppState(),');
    expect(source).toContain('if (remoteScenePatch.hasSceneChanges) {');
    expect(source).toContain('elements: remoteScenePatch.elements,');
    expect(source).toContain('appState: remoteScenePatch.appState,');
    expect(source).toContain('} else {\n            applyingRemoteCanvasReloadRef.current = false;');
    expect(source).toContain('captureUpdate: CaptureUpdateAction.NEVER');
    expect(source).not.toContain('elements: data.elements || []');
    expect(source).toContain('pendingLocalContentRef.current = null;');
    expect(source).toContain('sendCanvasBridgeStatus(false);');
    expect(source).toContain('if (applyingRemoteCanvasReloadRef.current || Date.now() < remoteReloadIgnoreUntilRef.current) {');
    expect(source).toContain('applyingRemoteCanvasReloadRef.current = false;');
    expect(source).toContain('remoteReloadIgnoreUntilRef.current = 0;');
    expect(source).toContain('const currentContent = normalizeSavedCanvasContent(buildSavePayload(elements, appState));');
    expect(source).toContain('if (currentContent === lastSavedContentRef.current) {');
    expect(source).not.toContain('if (withinRemoteReloadWindow || currentContent === lastSavedContentRef.current) {');
  });

  it('does not apply bridge reloads while the current canvas still has pending local changes', () => {
    const source = readSource();
    const reloadHandlerSource = source.slice(
      source.indexOf("if (msg.type === 'canvas.reload') {"),
      source.indexOf("if (msg.type === 'ping') {"),
    );

    expect(reloadHandlerSource).toContain('if (pendingLocalContentRef.current || bridgeDirtyRef.current) {');
    expect(reloadHandlerSource).toContain('sendCanvasBridgeStatus(true);');
    expect(reloadHandlerSource).toContain('return;');
    expect(reloadHandlerSource).toContain('void reloadCanvasFromServer().catch(() => { /* ignore reload errors */ });');
    expect(reloadHandlerSource).not.toContain('lastSavedContentRef.current = remoteContent;');
    expect(reloadHandlerSource).not.toContain('pendingLocalContentRef.current = null;');
  });

  it('fits active preview embeds into view only when they are clipped', () => {
    const source = readSource();

    expect(source).toContain("import { shouldFitElementIntoCanvasViewport } from './canvas-embeds/activePreviewViewport';");
    expect(source).toContain('AXHUB_EMBED_ACTIVE_PREVIEW_CHANGED_EVENT');
    expect(source).toContain('detail?.active !== true');
    expect(source).toContain('shouldFitElementIntoCanvasViewport({');
    expect(source).toContain('element: targetElement,');
    expect(source).toContain('appState,');
    expect(source).toContain('if (!shouldFitIntoView) return;');
    expect(source).toContain('excalidrawAPI.scrollToContent(detail.elementId, {');
    expect(source).toContain('fitToContent: true,');
    expect(source).toContain('animate: false,');
    expect(source).toContain('maxZoom: 1.4,');
  });

  it('keeps inactive embeds as ordinary canvas layers and accepts activation only from explicit requests', () => {
    const source = readSource();

    expect(source).toContain('AXHUB_EMBED_ACTIVATE_REQUESTED_EVENT');
    expect(source).toContain('window.addEventListener(AXHUB_EMBED_ACTIVATE_REQUESTED_EVENT');
    expect(source).toContain("excalidrawAPI.onStateChange('activeEmbeddable'");
    expect(source).toContain("excalidrawAPI.onStateChange('activeTool'");
    expect(source).toContain("excalidrawAPI.onStateChange('selectedElementIds'");
    expect(source).toContain('AXHUB_EMBED_EXIT_PREVIEW_EVENT');
    expect(source).toContain('activeEmbeddable: null');
    expect(source).toContain('AXHUB_EMBED_ACTIVE_PREVIEW_CHANGED_EVENT');
  });

  it('opens embedded resources through the shared IDE API helper', () => {
    const source = readSource();

    expect(source).toContain("import { apiService } from '../../services/index.api';");
    expect(source).toContain('await apiService.openIDE({');
    expect(source).toContain('ide: resolveVisibleIDEPreference(configResult?.automation?.defaultIDE, configResult?.ideAvailability)');
    expect(source).toContain('targetPath: filePath');
    expect(source).not.toContain("fetch('/api/ide/open'");
  });

  it('handles canvas MCP bridge commands inside the browser canvas tab', () => {
    const source = readSource();

    expect(source).toContain("type CanvasCommandName = 'canvas_get_state'");
    expect(source).toContain('const handleCanvasBridgeCommandRequest = useCallback(async (msg: CanvasBridgeCommandRequestMessage) => {');
    expect(source).toContain("type: 'canvas.command.result'");
    expect(source).toContain("if (msg.type === 'canvas.command.request') {");
    expect(source).toContain('canvasBridgeCommandHandlerRef.current = handleCanvasBridgeCommandRequest;');
    expect(source).toContain('void canvasBridgeCommandHandlerRef.current?.(msg);');
    expect(source).toContain("case 'canvas_get_state':");
    expect(source).toContain('selectedElementIds: Object.keys(appState.selectedElementIds || {})');
    expect(source).toContain('elementSummaries: summarizeCanvasCommandElements(');
    expect(source).toContain("case 'canvas_refresh':");
    expect(source).toContain('await handleRefreshCanvasFromServer();');
    expect(source).toContain("case 'canvas_capture':");
    expect(source).toContain('await captureExcalidrawElements(excalidrawAPI, captureElements, {');
    expect(source).toContain('await captureExcalidrawViewport(excalidrawAPI)');
    expect(source).toContain('captureViewport={captureCurrentCanvasViewport}');
    expect(source).toContain("scope === 'rect'");
    expect(source).toContain('createCanvasCommandRectElement(');
    expect(source).toContain("scope === 'full'");
    expect(source).toContain("exportPadding: scope === 'rect' ? 0 : 16,");
    expect(source).toContain("case 'canvas_insert_elements':");
    expect(source).toContain('resolveCanvasCommandInsertPosition(');
    expect(source).toContain('scheduleExplicitCanvasSave({ elements: nextElements, appState: excalidrawAPI.getAppState() });');
    expect(source).toContain("case 'canvas_insert_mermaid':");
    expect(source).toContain("import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';");
    expect(source).toContain('const { elements: skeletonElements, files = {} } = await parseMermaidToExcalidraw(');
    expect(source).toContain('convertToExcalidrawElements(skeletonElements as any, {');
    expect(source).toContain('excalidrawAPI.addFiles(Object.values(files) as any);');
    expect(source).toContain('scrollToContent(insertedElements as any, {');
    expect(source).toContain("case 'canvas_update_elements':");
    expect(source).toContain('applyCanvasCommandElementUpdates(');
    expect(source).toContain("case 'canvas_delete_elements':");
    expect(source).toContain('isDeleted: true');
    expect(source).toContain("case 'canvas_focus':");
    expect(source).toContain('excalidrawAPI.scrollToContent(');
    expect(source).toContain('createCanvasCommandRectElement(targetRect, \'focus-rect\')');
    expect(source).toContain('CANVAS_COMMAND_UPDATE_ALLOWED_FIELDS');
  });

  it('saves the current canvas before capturing direct-file AI context', () => {
    const source = readSource();
    const captureSource = source.slice(
      source.indexOf('const captureCurrentCanvasViewport = useCallback'),
      source.indexOf('const handleSubmitCanvasAssistantPromptWithArtifacts', source.indexOf('const captureCurrentCanvasViewport = useCallback')),
    );

    expect(captureSource).toContain('const appState = excalidrawAPI.getAppState();');
    expect(captureSource).toContain('const elements = excalidrawAPI.getSceneElements();');
    expect(captureSource).toContain('await saveToServer(elements, appState);');
    expect(captureSource).toContain("throw new Error('当前画布尚未保存完成');");
    expect(captureSource).toContain('const viewportRect = getCanvasCommandViewportRect(appState);');
    expect(captureSource).toContain('const visibleElements = getCanvasCommandElementsInRect(elements, viewportRect);');
    expect(captureSource).toContain('dataUrl: capture.dataUrl,');
    expect(captureSource).toContain('viewportRect,');
    expect(captureSource).toContain('visibleElementIds: visibleElements.map((element) => String(element.id)),');
  });

  it('creates project-scoped deep links for newly inserted resource nodes', () => {
    const source = readSource();
    const payloadStart = source.indexOf('function buildCanvasResourcePayloadFromPickerSelection');
    const payloadEnd = source.indexOf('function getCanvasResourcePayloadSize', payloadStart);
    const payloadSource = source.slice(payloadStart, payloadEnd);
    const insertStart = source.indexOf('async function insertCanvasResourceSelections');
    const insertEnd = source.indexOf('function resolveEmbeddableResourceType', insertStart);
    const insertSource = source.slice(insertStart, insertEnd);
    const applyStart = source.indexOf('const handleApplyProjectResources = useCallback');
    const applyEnd = source.indexOf('const executeCanvasBridgeCommand', applyStart);
    const applySource = source.slice(applyStart, applyEnd);

    expect(payloadSource).toContain('function buildCanvasResourcePayloadFromPickerSelection(selection: CanvasProjectResourceItemSelection, projectId: string)');
    expect(payloadSource.match(/projectId,/g)).toHaveLength(3);
    expect(insertSource).toContain('projectId,');
    expect(insertSource).toContain('projectId: string;');
    expect(insertSource).toContain('.map((selection) => buildCanvasResourcePayloadFromPickerSelection(selection, projectId))');
    expect(insertSource).toContain('createEmbeddableFromDrop(\n                excalidrawAPI,\n                payload,\n                projectId,');
    expect(applySource).toContain('projectId: activeProjectId,');
  });
});
