/**
 * Spec Template Bootstrap
 * 用于在开发环境中渲染 Markdown 文档的引导模块
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  type CommentaryHostToolbarAction,
  type CommentaryHostToolbarState,
  type CommentaryToolbarMode,
} from '@axhub/commentary';
import { MarkdownViewer, type MarkdownViewerHandle } from './MarkdownViewer';

interface MarkdownDocument {
  key: string;
  label: string;
  content: string;
  url?: string;
}

declare global {
  interface Window {
    SpecTemplateBootstrap?: any;
  }
}

/**
 * 渲染 Markdown 内容到页面
 * @param markdownContent Markdown 内容（单文档模式）
 */
let root: ReturnType<typeof createRoot> | null = null;
let markdownViewerRef = React.createRef<MarkdownViewerHandle>();
let currentDocumentUrl = '';

function handleRenderedDocumentChange(document: MarkdownDocument | null): void {
  currentDocumentUrl = document?.url || currentDocumentUrl;
}

function enableDocumentEditor(options?: {
  toolbarMode?: CommentaryToolbarMode;
  quickEditMode?: 'comment' | 'edit';
  initialDarkMode?: boolean;
  assistantPanelOpen?: boolean;
}): void {
  markdownViewerRef.current?.enableDocumentEditor(options);
}

function setDocumentEditorContext(context: { projectId: string; documentPath: string; makeServerOrigin?: string }): void {
  markdownViewerRef.current?.setContext(context);
}

function disableDocumentEditor(): void {
  markdownViewerRef.current?.disableDocumentEditor();
}

function getDocumentHostToolbarState(): CommentaryHostToolbarState | null {
  return markdownViewerRef.current?.getHostToolbarState() ?? null;
}

function subscribeDocumentHostToolbarState(
  listener: (state: CommentaryHostToolbarState) => void,
): () => void {
  return markdownViewerRef.current?.subscribeHostToolbarState(listener) ?? (() => undefined);
}

function runDocumentHostToolbarAction(action: CommentaryHostToolbarAction): Promise<boolean> {
  return markdownViewerRef.current?.runHostToolbarAction(action) ?? Promise.resolve(false);
}

function getDocumentCommentaryDebugState(): unknown | null {
  return markdownViewerRef.current?.getDebugState() ?? null;
}

function getDocumentVoiceTarget(): unknown | null {
  return markdownViewerRef.current?.getVoiceTarget() ?? null;
}

function refreshDocumentPersistedComments(deletedCommentIds?: readonly string[]): Promise<void> {
  return markdownViewerRef.current?.refreshPersistedComments(deletedCommentIds) ?? Promise.resolve();
}

function renderViewer(props: React.ComponentProps<typeof MarkdownViewer>) {
  const rootElement = document.getElementById('spec-root');

  if (!rootElement) {
    console.error('[Spec Template] 找不到 #spec-root 元素');
    return;
  }

  if (!root) {
    rootElement.innerHTML = '';
    root = createRoot(rootElement);
  }

  rootElement.className = '';
  markdownViewerRef = React.createRef<MarkdownViewerHandle>();
  root.render(<MarkdownViewer ref={markdownViewerRef} {...props} onDocumentChange={handleRenderedDocumentChange} />);
}

export function renderMarkdown(markdownContent: string, documentUrl?: string) {
  try {
    currentDocumentUrl = documentUrl || '';
    renderViewer({ content: markdownContent, documentUrl });
    console.log('[Spec Template] Markdown 已渲染');
  } catch (err) {
    console.error('[Spec Template] 渲染失败:', err);
    const rootElement = document.getElementById('spec-root');
    if (!rootElement) return;
    rootElement.innerHTML = `
      <div style="color: red; padding: 20px;">
        <h2>渲染失败</h2>
        <pre>${err}</pre>
      </div>
    `;
  }
}

/**
 * 渲染多个 Markdown 文档到页面（带 Tab 切换）
 * @param documents 文档列表
 */
export function renderMarkdownDocuments(documents: MarkdownDocument[]) {
  try {
    currentDocumentUrl = documents[0]?.url || '';
    renderViewer({ documents });
    console.log('[Spec Template] 多文档 Markdown 已渲染');
  } catch (err) {
    console.error('[Spec Template] 渲染失败:', err);
    const rootElement = document.getElementById('spec-root');
    if (!rootElement) return;
    rootElement.innerHTML = `
      <div style="color: red; padding: 20px;">
        <h2>渲染失败</h2>
        <pre>${err}</pre>
      </div>
    `;
  }
}

async function readMarkdownResponseContent(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (typeof payload?.content === 'string') {
      return payload.content;
    }
    return JSON.stringify(payload, null, 2);
  }
  return response.text();
}

/**
 * 从 URL 加载 Markdown 文件
 * @param url Markdown 文件的 URL
 */
export async function loadMarkdownFromUrl(url: string) {
  try {
    console.log('[Spec Template] 加载 Markdown:', url);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await readMarkdownResponseContent(response);
    renderMarkdown(content, url);
  } catch (err) {
    console.error('[Spec Template] 加载失败:', err);
    const rootElement = document.getElementById('spec-root');
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="color: red; padding: 20px;">
          <h2>加载失败</h2>
          <p>无法加载 Markdown 文件: ${url}</p>
          <pre>${err}</pre>
        </div>
      `;
    }
  }
}

/**
 * 从多个 URL 加载 Markdown 文件
 * @param urls 文档配置列表 { key, label, url }
 */
export async function loadMarkdownDocumentsFromUrls(urls: Array<{ key: string; label: string; url: string }>) {
  try {
    console.log('[Spec Template] 加载多个 Markdown 文档:', urls);

    const documents = await Promise.all(
      urls.map(async ({ key, label, url }) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
        }
        const content = await readMarkdownResponseContent(response);
        return { key, label, content, url };
      })
    );

    renderMarkdownDocuments(documents);
  } catch (err) {
    console.error('[Spec Template] 加载失败:', err);
    const rootElement = document.getElementById('spec-root');
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="color: red; padding: 20px;">
          <h2>加载失败</h2>
          <p>无法加载 Markdown 文件</p>
          <pre>${err}</pre>
        </div>
      `;
    }
  }
}

// 挂载到全局，供 HTML 直接使用
if (typeof window !== 'undefined') {
  window.SpecTemplateBootstrap = {
    renderMarkdown,
    renderMarkdownDocuments,
    loadMarkdownFromUrl,
    loadMarkdownDocumentsFromUrls,
  };
  window.SpecTemplateBootstrap.editors = {
    enable(_mode?: string, options?: {
      toolbarMode?: CommentaryToolbarMode;
      quickEditMode?: 'comment' | 'edit';
      assistantPanelOpen?: boolean;
    }) {
      markdownViewerRef.current?.enableQuickEdit();
      if (options?.toolbarMode) {
        enableDocumentEditor({
          toolbarMode: options.toolbarMode,
          quickEditMode: options.quickEditMode ?? (_mode === 'edit' ? 'edit' : 'comment'),
          assistantPanelOpen: options.assistantPanelOpen,
        });
      }
    },
    disable(options?: { discardChanges?: boolean }) {
      markdownViewerRef.current?.disableQuickEdit(options);
      disableDocumentEditor();
    },
    setQuickEditMode(mode: 'comment' | 'edit', options?: { saveBehavior?: 'none' | 'save' | 'discard' }) {
      return markdownViewerRef.current?.setQuickEditMode(mode, options) ?? Promise.resolve(false);
    },
    getStatus() {
      return markdownViewerRef.current?.getQuickEditStatus() ?? {
        enabled: false,
        dirty: false,
        saving: false,
        dirtyCount: 0,
        activeDocKey: '',
        quickEditMode: 'none',
      };
    },
    getCopyPromptText() {
      return markdownViewerRef.current?.getCopyPromptText() ?? '';
    },
    handleCopyPrompt() {
      return markdownViewerRef.current?.handleCopyPrompt() ?? Promise.reject(new Error('Markdown viewer is not ready'));
    },
    save(options?: { exitAfterSave?: boolean; suppressNoChangeNotice?: boolean; suppressSuccessNotice?: boolean }) {
      return markdownViewerRef.current?.saveCurrentDoc(options) ?? Promise.resolve(false);
    },
    enableDocumentEditor,
    setContext: setDocumentEditorContext,
    disableDocumentEditor,
    getHostToolbarState: getDocumentHostToolbarState,
    subscribeHostToolbarState: subscribeDocumentHostToolbarState,
    runHostToolbarAction: runDocumentHostToolbarAction,
    getDebugState: getDocumentCommentaryDebugState,
    getVoiceTarget: getDocumentVoiceTarget,
    refreshPersistedComments: refreshDocumentPersistedComments,
  };
  console.log('[Spec Template Bootstrap] 已挂载到全局');
}
