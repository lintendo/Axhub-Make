import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { StyleProvider, createCache } from '@ant-design/cssinjs';
import type { CommentEntryMode } from '../selection-ui-mode';
import type { PropertyPanelTab } from '../property-panel';
import type { ViewportRect } from '../../overlay/canvas-overlay';
import type { FloatingPosition } from '../floating-drag';
import { WebEditorUiApp } from './runtime-shell';
import { createQueuedBridge } from './queued-bridge';
import {
  createEditorChromeCssVars,
  createRuntimeAntdTheme,
  WEB_EDITOR_POPUP_ROOT_ATTR,
  type EditorThemeMode,
} from './theme';
import { isMobileDevice } from '../../utils/mobile-detect';
import type { CommentaryHostToolbarState } from '../../web-editor-types';
import type {
  BreadcrumbsHandle,
  PropertyPanelHandle,
  WebEditorUiRuntime,
  WebEditorUiRuntimeOptions,
} from './types';

export function subscribeDeferredHostToolbarState(options: {
  getCurrent: () => PropertyPanelHandle | null;
  getFallbackState: () => CommentaryHostToolbarState;
  runWhenReady: (callback: (handle: PropertyPanelHandle) => void) => void;
  listener: (state: CommentaryHostToolbarState) => void;
}): () => void {
  const current = options.getCurrent();
  if (current) {
    return current.subscribeHostToolbarState(options.listener);
  }

  let disposed = false;
  let mountedUnsubscribe: (() => void) | null = null;
  options.listener(options.getFallbackState());
  options.runWhenReady((handle) => {
    if (disposed) return;
    mountedUnsubscribe = handle.subscribeHostToolbarState(options.listener);
    if (disposed) {
      mountedUnsubscribe();
      mountedUnsubscribe = null;
    }
  });

  return () => {
    disposed = true;
    mountedUnsubscribe?.();
    mountedUnsubscribe = null;
  };
}

export function createWebEditorUiRuntime(options: WebEditorUiRuntimeOptions): WebEditorUiRuntime {
  const propertyPanelVisible = options.propertyPanelVisible ?? Boolean(options.propertyPanelOptions);
  const previousContainerStyle = {
    position: options.container.style.position,
    inset: options.container.style.inset,
    top: options.container.style.top,
    right: options.container.style.right,
    bottom: options.container.style.bottom,
    left: options.container.style.left,
    width: options.container.style.width,
    height: options.container.style.height,
    pointerEvents: options.container.style.pointerEvents,
  };

  options.container.style.position = 'fixed';
  options.container.style.inset = '0';
  options.container.style.top = '0';
  options.container.style.right = '0';
  options.container.style.bottom = '0';
  options.container.style.left = '0';
  options.container.style.width = 'auto';
  options.container.style.height = 'auto';
  options.container.style.pointerEvents = 'none';

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.pointerEvents = 'none';
  host.style.background = 'transparent';
  if (isMobileDevice()) {
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.overflow = 'visible';
  } else {
    host.style.inset = '0';
  }
  options.container.append(host);

  const root: Root = createRoot(host);
  const propertyPanelRef = React.createRef<PropertyPanelHandle>();
  const breadcrumbsRef = React.createRef<BreadcrumbsHandle>();

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    root.unmount();
    host.remove();
    options.container.style.position = previousContainerStyle.position;
    options.container.style.inset = previousContainerStyle.inset;
    options.container.style.top = previousContainerStyle.top;
    options.container.style.right = previousContainerStyle.right;
    options.container.style.bottom = previousContainerStyle.bottom;
    options.container.style.left = previousContainerStyle.left;
    options.container.style.width = previousContainerStyle.width;
    options.container.style.height = previousContainerStyle.height;
    options.container.style.pointerEvents = previousContainerStyle.pointerEvents;
  };

  const propertyPanelBridge = propertyPanelVisible && options.propertyPanelOptions
    ? createQueuedBridge<PropertyPanelHandle>(() => propertyPanelRef.current)
    : null;
  const breadcrumbsBridge = options.breadcrumbsOptions
    ? createQueuedBridge<BreadcrumbsHandle>(() => breadcrumbsRef.current)
    : null;
  const getFallbackHostToolbarState = () => ({
    toolbarMode: options.toolbarMode ?? options.propertyPanelOptions?.toolbarMode ?? 'inline',
    visible: false,
    robotState: 'sleeping' as const,
    robotTitle: '打开 AI',
    robotDisabled: true,
    robotLoading: false,
    sendVisible: false,
    sendTitle: '发送给 AI',
    sendDisabled: true,
    sendLoading: false,
    interruptVisible: false,
    interruptTitle: '停止 AI 修改',
    interruptDisabled: true,
    interruptLoading: false,
    copyPromptVisible: false,
    copyPromptTitle: '复制 Prompt',
    copyPromptDisabled: true,
    clearEditsTitle: '清空全部编辑',
    clearEditsDisabled: true,
    propertyPanelVisible: false,
    propertyPanelOpen: false,
    propertyPanelTitle: '打开设计决策',
    modifiedCount: 0,
    terminalTaskCount: 0,
    selectedAgent: null,
    agentOptions: [{ value: null, label: '默认' }],
    aiExecutionConfigSummary: '',
    aiExecutionConfigConfigured: false,
    aiExecutionProvider: '',
    aiExecutionWorkspacePath: '',
    aiExecutionRunConcurrency: 5,
    aiExecutionProviderOptions: [],
    darkMode: false,
    disablePageAnimations: false,
    captureTargetScreenshotAvailable: false,
    captureTargetScreenshot: false,
    pageZoomEnabled: false,
    copySkillInstallPromptDisabled: true,
    selectionModeActive: options.initialSelectionModeActive ?? true,
    fullExitAvailable: false,
    annotationEnabled: false,
    annotationEnableAvailable: false,
    annotationEnableLoading: false,
    annotationEnableDisabled: true,
    annotationEnableTitle: '开启需求标注',
  });

  function RuntimeMount(): React.ReactElement {
    const styleCache = React.useMemo(() => createCache(), []);
    const popupContainerRef = React.useRef<HTMLDivElement | null>(null);
    const [themeMode, setThemeMode] = React.useState<EditorThemeMode>(() =>
      options.propertyPanelOptions?.getUiSettings?.()?.darkMode ? 'dark' : 'light',
    );

    React.useEffect(() => {
      propertyPanelBridge?.flush();
      breadcrumbsBridge?.flush();
    });

    return (
      <StyleProvider cache={styleCache} container={options.shadowRoot}>
        <ConfigProvider
          componentSize="small"
          getPopupContainer={() => popupContainerRef.current ?? options.container}
          theme={createRuntimeAntdTheme(themeMode)}
        >
          <App>
            <div
              style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                ...createEditorChromeCssVars(themeMode),
              }}
            >
              <WebEditorUiApp
                propertyPanelOptions={options.propertyPanelOptions}
                propertyPanelVisible={propertyPanelVisible}
                initialPropertyPanelOpen={options.initialPropertyPanelOpen}
                initialSelectionModeActive={options.initialSelectionModeActive}
                toolbarMode={options.toolbarMode ?? options.propertyPanelOptions?.toolbarMode}
                breadcrumbsOptions={options.breadcrumbsOptions}
                propertyPanelRef={propertyPanelRef}
                breadcrumbsRef={breadcrumbsRef}
                onThemeModeChange={setThemeMode}
              />
              <div ref={popupContainerRef} {...{ [WEB_EDITOR_POPUP_ROOT_ATTR]: 'true' }} />
            </div>
          </App>
        </ConfigProvider>
      </StyleProvider>
    );
  }

  root.render(<RuntimeMount />);

  return {
    propertyPanel: propertyPanelBridge
      ? {
          setTarget(element: Element | null) {
            propertyPanelBridge.runOrQueue((api) => api.setTarget(element));
          },
          setTab(tab: PropertyPanelTab) {
            propertyPanelBridge.runOrQueue((api) => api.setTab(tab));
          },
          getTab() {
            return propertyPanelRef.current?.getTab() ?? 'design';
          },
          refresh() {
            propertyPanelBridge.runOrQueue((api) => api.refresh());
          },
          setHistory(undoCount: number, redoCount: number) {
            propertyPanelBridge.runOrQueue((api) => api.setHistory(undoCount, redoCount));
          },
          getPosition() {
            return propertyPanelRef.current?.getPosition() ?? null;
          },
          setPosition(position: FloatingPosition | null) {
            propertyPanelBridge.runOrQueue((api) => api.setPosition(position));
          },
          enterCommentInput(mode?: CommentEntryMode) {
            propertyPanelBridge.runOrQueue((api) => api.enterCommentInput?.(mode));
          },
          enterInlineTextEdit(element?: HTMLElement | null) {
            propertyPanelBridge.runOrQueue((api) => api.enterInlineTextEdit?.(element));
          },
          getHostToolbarState() {
            return propertyPanelRef.current?.getHostToolbarState() ?? getFallbackHostToolbarState();
          },
          subscribeHostToolbarState(listener) {
            return subscribeDeferredHostToolbarState({
              getCurrent: () => propertyPanelRef.current,
              getFallbackState: getFallbackHostToolbarState,
              runWhenReady: (callback) => {
                propertyPanelBridge.runOrQueue((api) => callback(api));
              },
              listener,
            });
          },
          runHostToolbarAction(action) {
            return propertyPanelRef.current?.runHostToolbarAction(action) ?? Promise.resolve(false);
          },
          dispose,
        }
      : null,
    breadcrumbs: breadcrumbsBridge
      ? {
          setTarget(element: Element | null) {
            breadcrumbsBridge.runOrQueue((api) => api.setTarget(element));
          },
          setAnchorRect(rect: ViewportRect | null) {
            breadcrumbsBridge.runOrQueue((api) => api.setAnchorRect(rect));
          },
        refresh() {
          breadcrumbsBridge.runOrQueue((api) => api.refresh());
        },
        enterInlineTextEdit(element?: HTMLElement | null) {
          breadcrumbsBridge.runOrQueue((api) => api.enterInlineTextEdit?.(element));
        },
        dispose,
      }
      : null,
    dispose,
  };
}
