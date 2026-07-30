/**
 * Dev Template Bootstrap
 * 用于在开发环境中渲染组件的引导模块
 */

import '../index.css';
import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import { App as AntApp } from 'antd';
import {
  buildOfficialClipboardPayloadFromCapturedDocument,
  captureDocumentForFigmaNew,
  htmlToAxure,
} from 'axhub-export-core';
import { createEditorModeManager } from './editorModeManager';
import { ErrorDialogProvider } from './ErrorDialog';
import { autoInjectRootId } from './stableIdInjector';
import {
  AppDialogHost,
  createAppDialogController,
  setImperativeAppDialog,
} from '../index/components/dialogs/AppDialogProvider';
import type { CommentaryModifiedElementSummary } from '@/common/web-editor-types';

let editorModeManager: ReturnType<typeof createEditorModeManager> | null = null;
const devTemplateDialogController = createAppDialogController();
let prototypeEditorHostToolbarUnsubscribe: (() => void) | null = null;

/**
 * 渲染组件到页面
 * @param Component 要渲染的组件
 * @param props 传递给组件的 props（可选）
 */
export function renderComponent(Component: any, props?: any) {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    console.error('[Dev Template] 找不到 #root 元素');
    return;
  }

  const defaultProps = {
    container: rootElement,
    config: {
    },
    data: {
    },
    events: {}
  };

  const finalProps = props || defaultProps;

  try {
    // 直接渲染用户组件，不使用 AntApp 包裹
    // AntApp 只用于开发工具 UI（如 ErrorDialog）
    const root = ReactDOMClient.createRoot(rootElement);
    root.render(
      React.createElement(Component, finalProps)
    );
    console.log('[Dev Template] 组件已渲染');

    // 将 ErrorDialogProvider 挂载到独立的容器，使用 AntApp 包裹
    // 这样 Ant Design 样式只影响开发工具，不影响用户组件
    const errorDialogContainer = document.createElement('div');
    errorDialogContainer.id = 'error-dialog-container';
    document.body.appendChild(errorDialogContainer);

    const errorDialogRoot = ReactDOMClient.createRoot(errorDialogContainer);
    errorDialogRoot.render(
      React.createElement('div', { className: 'ax-admin-theme' },
        React.createElement(AntApp, null,
          React.createElement(React.Fragment, null,
            React.createElement(ErrorDialogProvider),
            React.createElement(AppDialogHost, { controller: devTemplateDialogController }),
          ),
        ),
      )
    );
    setImperativeAppDialog(devTemplateDialogController);

    // 渲染后自动注入稳定 ID，并在 DOM 就绪后启动编辑器
    setTimeout(() => {
      autoInjectRootId();
      editorModeManager?.applyInitialMode();
    }, 0);
  } catch (err) {
    console.error('[Dev Template] 渲染失败:', err);
  }
}

// 合并 ReactDOM 和 ReactDOMClient 的所有 API
const ReactDOMFull = {
  ...ReactDOM,
  ...ReactDOMClient
};

// 导出 React 和 ReactDOM 供其他模块使用
export { React, ReactDOMFull as ReactDOM };

const EMBED_SCROLLBAR_HIDING_STYLE_ID = 'axhub-embed-hide-scrollbars';
const EMBED_SCROLLBAR_HIDING_CSS = `
html,
body,
#root,
* {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
#root::-webkit-scrollbar,
*::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

html::-webkit-scrollbar-track,
html::-webkit-scrollbar-thumb,
body::-webkit-scrollbar-track,
body::-webkit-scrollbar-thumb,
#root::-webkit-scrollbar-track,
#root::-webkit-scrollbar-thumb,
*::-webkit-scrollbar-track,
*::-webkit-scrollbar-thumb,
*::-webkit-scrollbar-corner {
  background: transparent !important;
}
`;

function ensureEmbedScrollbarHidingStyle() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(EMBED_SCROLLBAR_HIDING_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = EMBED_SCROLLBAR_HIDING_STYLE_ID;
  style.textContent = EMBED_SCROLLBAR_HIDING_CSS;
  document.head.appendChild(style);
}

type PrototypeEditorStatePayload = {
  requestId?: unknown;
  success: boolean;
  handled?: boolean;
  error?: string;
  promptText?: string;
  modifiedElements?: CommentaryModifiedElementSummary[];
};

function postPrototypeEditorState(payload: PrototypeEditorStatePayload) {
  if (typeof window === 'undefined') {
    return;
  }
  window.parent.postMessage({
    type: 'AXHUB_PROTOTYPE_EDITOR_STATE',
    requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
    success: payload.success,
    active: editorModeManager?.api.getMode?.() === 'webEditorV2',
    mode: editorModeManager?.api.getMode?.() ?? 'none',
    hostToolbarState: editorModeManager?.api.getHostToolbarState?.() ?? null,
    decisionDataCount: editorModeManager?.api.getDecisionDataCount?.() ?? 0,
    debugState: editorModeManager?.api.getWebEditorDebugState?.() ?? null,
    ...(typeof payload.handled === 'boolean' ? { handled: payload.handled } : {}),
    ...(payload.error ? { error: payload.error } : {}),
    ...(payload.promptText ? { promptText: payload.promptText } : {}),
    ...(payload.modifiedElements ? { modifiedElements: payload.modifiedElements } : {}),
  }, '*');
}

function ensurePrototypeEditorHostToolbarBridge() {
  if (prototypeEditorHostToolbarUnsubscribe) {
    return;
  }
  prototypeEditorHostToolbarUnsubscribe = editorModeManager?.api.subscribeHostToolbarState?.((hostToolbarState) => {
    if (typeof window === 'undefined') {
      return;
    }
    window.parent.postMessage({
      type: 'AXHUB_PROTOTYPE_EDITOR_STATE',
      success: true,
      active: editorModeManager?.api.getMode?.() === 'webEditorV2',
      mode: editorModeManager?.api.getMode?.() ?? 'none',
      hostToolbarState,
      decisionDataCount: editorModeManager?.api.getDecisionDataCount?.() ?? 0,
      debugState: editorModeManager?.api.getWebEditorDebugState?.() ?? null,
    }, '*');
  }) ?? null;
}

function teardownPrototypeEditorHostToolbarBridge() {
  prototypeEditorHostToolbarUnsubscribe?.();
  prototypeEditorHostToolbarUnsubscribe = null;
}

type ScreenshotViewportSize = {
  rootWidth: string;
  rootHeight: string;
  documentWidth: string;
  documentHeight: string;
  bodyWidth: string;
  bodyHeight: string;
  bodyMinHeight: string;
};

function setScreenshotViewportSize(
  rootElement: HTMLElement,
  targetWidth?: number,
  targetHeight?: number,
): ScreenshotViewportSize {
  const originalSize = {
    rootWidth: rootElement.style.width,
    rootHeight: rootElement.style.height,
    documentWidth: document.documentElement.style.width,
    documentHeight: document.documentElement.style.height,
    bodyWidth: document.body.style.width,
    bodyHeight: document.body.style.height,
    bodyMinHeight: document.body.style.minHeight,
  };

  if (targetWidth && Number.isFinite(targetWidth)) {
    const roundedWidth = Math.round(targetWidth);
    rootElement.style.width = `${roundedWidth}px`;
    document.documentElement.style.width = `${roundedWidth}px`;
    document.body.style.width = `${roundedWidth}px`;
  }
  if (targetHeight && Number.isFinite(targetHeight)) {
    const roundedHeight = Math.round(targetHeight);
    rootElement.style.height = `${roundedHeight}px`;
    document.documentElement.style.height = `${roundedHeight}px`;
    document.body.style.height = `${roundedHeight}px`;
    document.body.style.minHeight = `${roundedHeight}px`;
  }

  window.dispatchEvent(new Event('resize'));
  return originalSize;
}

function restoreScreenshotViewportSize(
  rootElement: HTMLElement,
  originalSize: ScreenshotViewportSize,
): void {
  rootElement.style.width = originalSize.rootWidth;
  rootElement.style.height = originalSize.rootHeight;
  document.documentElement.style.width = originalSize.documentWidth;
  document.documentElement.style.height = originalSize.documentHeight;
  document.body.style.width = originalSize.bodyWidth;
  document.body.style.height = originalSize.bodyHeight;
  document.body.style.minHeight = originalSize.bodyMinHeight;
  window.dispatchEvent(new Event('resize'));
}

function readPrototypeEditorBridgeCommentPageScope(data: any): string | undefined {
  const optionScope = typeof data?.options?.commentPageScope === 'string'
    ? data.options.commentPageScope.trim()
    : '';
  if (optionScope) {
    return optionScope;
  }
  const contextScope = typeof data?.context?.commentPageScope === 'string'
    ? data.context.commentPageScope.trim()
    : '';
  return contextScope || undefined;
}

// 挂载到全局，供 HTML 直接使用
if (typeof window !== 'undefined') {
  // 解析 URL 参数
  const urlParams = new URLSearchParams(window.location.search);

  // 1. 处理 root 尺寸比例参数 (例如: ?scale=0.5 或 ?width=800&height=600)
  const scale = urlParams.get('scale');
  const width = urlParams.get('width');
  const height = urlParams.get('height');

  const rootElement = document.getElementById('root');
  let rootSizeOverride: ScreenshotViewportSize | null = null;
  const applyRootSize = (nextWidth?: number, nextHeight?: number) => {
    if (!rootElement) return;
    if (!rootSizeOverride) {
      rootSizeOverride = setScreenshotViewportSize(rootElement, nextWidth, nextHeight);
      return;
    }
    restoreScreenshotViewportSize(rootElement, rootSizeOverride);
    rootSizeOverride = setScreenshotViewportSize(rootElement, nextWidth, nextHeight);
  };

  const resetRootSize = () => {
    if (!rootElement || !rootSizeOverride) return;
    restoreScreenshotViewportSize(rootElement, rootSizeOverride);
    rootSizeOverride = null;
  };
  if (rootElement) {
    if (scale) {
      const scaleValue = parseFloat(scale);
      if (!isNaN(scaleValue) && scaleValue > 0) {
        rootElement.style.transform = `scale(${scaleValue})`;
        rootElement.style.transformOrigin = 'top left';
        console.log(`[Dev Template] 应用缩放比例: ${scaleValue}`);
      }
    }

    if (width || height) {
      if (width) {
        const widthValue = parseInt(width);
        if (!isNaN(widthValue) && widthValue > 0) {
          rootElement.style.width = `${widthValue}px`;
          console.log(`[Dev Template] 设置宽度: ${widthValue}px`);
        }
      }
      if (height) {
        const heightValue = parseInt(height);
        if (!isNaN(heightValue) && heightValue > 0) {
          rootElement.style.height = `${heightValue}px`;
          console.log(`[Dev Template] 设置高度: ${heightValue}px`);
        }
      }
    }
  }

  editorModeManager = createEditorModeManager();
  const initialEditorMode = editorModeManager.getInitialMode();

  (window as any).DevTemplateBootstrap = {
    renderComponent,
    React,
    ReactDOM: ReactDOMFull,
    editors: editorModeManager.api
  };
  console.log('[Dev Template Bootstrap] 已挂载到全局');

  // 监听截图消息
  window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'AXHUB_HIDE_NATIVE_SCROLLBARS') {
      ensureEmbedScrollbarHidingStyle();
      return;
    }

    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_ENABLE') {
      try {
        const launchOptions = event.data.options && typeof event.data.options === 'object'
          ? event.data.options
          : {};
        await Promise.resolve(editorModeManager?.api.enable('webEditorV2', {
          mobileMode: typeof launchOptions.mobileMode === 'boolean' ? launchOptions.mobileMode : undefined,
          toolbarMode: 'host',
          initialDarkMode: Boolean(launchOptions.initialDarkMode),
          agentRunConcurrency: Number.isFinite(Number(launchOptions.agentRunConcurrency))
            ? Number(launchOptions.agentRunConcurrency)
            : undefined,
          assistantPanelOpen: Boolean(launchOptions.assistantPanelOpen),
          commentPageScope: readPrototypeEditorBridgeCommentPageScope(event.data),
          annotationApiBaseUrl: typeof launchOptions.annotationApiBaseUrl === 'string'
            ? launchOptions.annotationApiBaseUrl
            : undefined,
          annotationProjectId: typeof launchOptions.annotationProjectId === 'string'
            ? launchOptions.annotationProjectId
            : undefined,
        }));
        ensurePrototypeEditorHostToolbarBridge();
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: true,
        });
      } catch (error) {
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: false,
          error: String(error),
        });
      }
    }

    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_DISABLE') {
      try {
        await Promise.resolve(editorModeManager?.api.disable());
        teardownPrototypeEditorHostToolbarBridge();
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: true,
        });
      } catch (error) {
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: false,
          error: String(error),
        });
      }
    }

    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_ENABLE_PANEL_ONLY') {
      try {
        const launchOptions = event.data.options && typeof event.data.options === 'object'
          ? event.data.options
          : {};
        await Promise.resolve(editorModeManager?.api.enablePanelOnly({
          mobileMode: typeof launchOptions.mobileMode === 'boolean' ? launchOptions.mobileMode : undefined,
          toolbarMode: 'host',
          initialDarkMode: Boolean(launchOptions.initialDarkMode),
          agentRunConcurrency: Number.isFinite(Number(launchOptions.agentRunConcurrency))
            ? Number(launchOptions.agentRunConcurrency)
            : undefined,
          assistantPanelOpen: Boolean(launchOptions.assistantPanelOpen),
          commentPageScope: readPrototypeEditorBridgeCommentPageScope(event.data),
          annotationApiBaseUrl: typeof launchOptions.annotationApiBaseUrl === 'string'
            ? launchOptions.annotationApiBaseUrl
            : undefined,
          annotationProjectId: typeof launchOptions.annotationProjectId === 'string'
            ? launchOptions.annotationProjectId
            : undefined,
        }));
        ensurePrototypeEditorHostToolbarBridge();
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: true,
        });
      } catch (error) {
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: false,
          error: String(error),
        });
      }
    }

    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_DISABLE_PANEL_ONLY') {
      try {
        await Promise.resolve(editorModeManager?.api.disablePanelOnly());
        teardownPrototypeEditorHostToolbarBridge();
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: true,
        });
      } catch (error) {
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: false,
          error: String(error),
        });
      }
    }

    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION') {
      try {
        const action = event.data.action;
        // When clipboard:'host' is set for copy-prompt, skip iframe-side clipboard write
        // and return the prompt text so the parent window can write to clipboard.
        if (action?.type === 'copy-prompt' && action?.clipboard === 'host') {
          const promptText = editorModeManager?.api.getCopyPromptText?.() ?? '';
          const modifiedElements = editorModeManager?.api.getEditedSnapshot?.()?.modifiedElements ?? [];
          postPrototypeEditorState({
            requestId: event.data.requestId,
            success: true,
            handled: true,
            promptText: promptText || undefined,
            modifiedElements,
          });
        } else if (action?.type === 'send-to-agent' && action?.elementKey) {
          const promptText = editorModeManager?.api.getElementPromptText?.(String(action.elementKey || '')) ?? '';
          const modifiedElements = editorModeManager?.api.getEditedSnapshot?.()?.modifiedElements ?? [];
          postPrototypeEditorState({
            requestId: event.data.requestId,
            success: true,
            handled: Boolean(promptText),
            promptText: promptText || undefined,
            modifiedElements,
          });
        } else {
          const handled = await Promise.resolve(editorModeManager?.api.runHostToolbarAction(action));
          postPrototypeEditorState({
            requestId: event.data.requestId,
            success: true,
            handled: Boolean(handled),
          });
        }
      } catch (error) {
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: false,
          error: String(error),
        });
      }
    }

    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_SAVE_ACTION') {
      try {
        let handled = true;
        if (event.data.action === 'save-text') {
          await Promise.resolve(editorModeManager?.api.saveWebEditorTextChanges());
        } else if (event.data.action === 'save-style') {
          await Promise.resolve(editorModeManager?.api.saveWebEditorStyleChanges());
        } else if (event.data.action === 'clear-style') {
          await Promise.resolve(editorModeManager?.api.clearWebEditorForcedStyles());
        } else {
          handled = false;
        }
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: true,
          handled,
        });
      } catch (error) {
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: false,
          error: String(error),
        });
      }
    }

    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_NODE_EDITING_STATE') {
      try {
        if (!editorModeManager?.api.setNodeEditingState) {
          throw new Error('NOT_IMPLEMENTED: External editing state control is unavailable');
        }
        await Promise.resolve(editorModeManager.api.setNodeEditingState(
          String(event.data.elementKey || ''),
          event.data.nextState,
          event.data.taskRef ?? null,
          event.data.targetRef ?? null,
        ));
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: true,
          handled: true,
        });
      } catch (error) {
        postPrototypeEditorState({
          requestId: event.data.requestId,
          success: false,
          error: String(error),
        });
      }
    }

    // Delayed state sync: parent sends this after enterPrototypeEditor to catch
    // async host editor connection state changes that happened after init.
    if (event.data && event.data.type === 'AXHUB_PROTOTYPE_EDITOR_QUERY_STATE') {
      postPrototypeEditorState({
        requestId: event.data.requestId,
        success: true,
      });
    }

    if (event.data && event.data.type === 'WEB_EDITOR_SET_ROOT_SIZE') {
      const nextWidth = Number(event.data.width);
      const nextHeight = event.data.height ? Number(event.data.height) : undefined;
      if (Number.isFinite(nextWidth)) {
        applyRootSize(nextWidth, nextHeight);
        console.log('[Dev Template] WebEditor 设置 root 尺寸', { width: nextWidth, height: nextHeight });
      }
    }

    if (event.data && event.data.type === 'WEB_EDITOR_RESET_ROOT_SIZE') {
      resetRootSize();
      console.log('[Dev Template] WebEditor 恢复 root 尺寸');
    }

    if (event.data && event.data.type === 'COPY_TO_FIGMA') {
      try {
        const capturedDoc = await captureDocumentForFigmaNew('#root');
        const payloadText = await buildOfficialClipboardPayloadFromCapturedDocument(capturedDoc);
        window.parent.postMessage({
          type: 'COPY_TO_FIGMA_RESULT',
          success: true,
          payloadText,
          payloadSizeKb: Math.round(payloadText.length / 1024),
        }, '*');
      } catch (error) {
        window.parent.postMessage({
          type: 'COPY_TO_FIGMA_RESULT',
          success: false,
          error: String(error),
        }, '*');
      }
    }

    if (event.data && event.data.type === 'EXPORT_AXURE_JSON') {
      console.log('[Dev Template] 收到 Axure 导出请求', event.data);
      try {
        const payload = await htmlToAxure('#root', {
          rootName: event.data?.rootName || document.title || 'Page',
          preserveHierarchy: !!event.data?.preserveHierarchy,
          preserveSvgIcons: event.data?.preserveSvgIcons !== false,
        });

        window.parent.postMessage({
          type: 'AXURE_JSON_READY',
          success: true,
          payload,
        }, '*');
      } catch (error) {
        console.error('[Dev Template] Axure 导出失败:', error);
        window.parent.postMessage({
          type: 'AXURE_JSON_READY',
          success: false,
          error: String(error),
        }, '*');
      }
    }
  });
}
