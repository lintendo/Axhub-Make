import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { XMarkdown } from '@ant-design/x-markdown';
import type { ComponentProps } from '@ant-design/x-markdown';
import { Mermaid, XProvider } from '@ant-design/x';
import zhCN_X from '@ant-design/x/locale/zh_CN';
import { ConfigProvider, Anchor, Modal, Tabs } from 'antd';
import {
    createCommentary,
    type CommentaryApi,
    type CommentaryHostToolbarAction,
    type CommentaryHostToolbarState,
    type CommentaryToolbarMode,
} from '@axhub/commentary';
import { SimpleEditor, type UploadFunction } from 'tiptap-editor';
import { defaultThemeConfig } from '../theme';
import type { AssistantContextV1 } from '@/common/assistant-context/types';
import {
    buildMarkdownCommentPrompt,
    buildPrototypeSpecMarkdownSaveRequest,
    resolveMarkdownQuickEditMeta,
    shouldIgnoreInitialMarkdownEditorChange,
    type MarkdownQuickEditMeta,
} from './quickEdit';
import {
    resolveMarkdownDocumentLinkTarget,
    resolvePrototypeSpecAssetUrl,
    resolvePrototypeSpecResourceUrl,
    stripMarkdownPreviewFrontmatter,
} from './previewMarkdownContent';

export interface MarkdownDocument {
    key: string;
    label: string;
    content: string;
    url?: string;
}

interface MarkdownViewerProps {
    content?: string;
    documentUrl?: string;
    documents?: MarkdownDocument[];
    onDocumentChange?: (document: MarkdownDocument | null) => void;
}

interface MarkdownImageProps extends Record<string, unknown> {
    src?: string;
    style?: React.CSSProperties;
    documentUrl?: string;
}

interface HeadingItem {
    id: string;
    title: string;
    level: number;
    children?: HeadingItem[];
}

type SpecQuickEditMode = 'none' | 'comment' | 'edit';

const MAKE_COMMENTARY_SKILL_INSTALL_SOURCE = [
    '.agents/skills/explore-options/SKILL.md',
    '.claude/skills/explore-options/SKILL.md',
    '.agents/skills/prototype-comments/SKILL.md',
    '.claude/skills/prototype-comments/SKILL.md',
].join('\n');

interface SpecPromptRequestResult {
    prompt: string;
    targetPath?: string;
    context?: AssistantContextV1;
}

export interface MarkdownViewerHandle {
    enableQuickEdit: () => void;
    disableQuickEdit: (options?: { discardChanges?: boolean }) => void;
    enableDocumentEditor: (options?: {
        toolbarMode?: CommentaryToolbarMode;
        quickEditMode?: 'comment' | 'edit';
        initialDarkMode?: boolean;
        assistantPanelOpen?: boolean;
    }) => void;
    disableDocumentEditor: () => void;
    getHostToolbarState: () => CommentaryHostToolbarState | null;
    subscribeHostToolbarState: (listener: (state: CommentaryHostToolbarState) => void) => () => void;
    runHostToolbarAction: (action: CommentaryHostToolbarAction) => Promise<boolean>;
    setQuickEditMode: (mode: 'comment' | 'edit', options?: { saveBehavior?: 'none' | 'save' | 'discard' }) => Promise<boolean>;
    getQuickEditStatus: () => {
        enabled: boolean;
        dirty: boolean;
        saving: boolean;
        dirtyCount: number;
        activeDocKey: string;
        quickEditMode: SpecQuickEditMode;
    };
    handleCopyPrompt: () => Promise<SpecPromptRequestResult>;
    saveCurrentDoc: (options?: {
        exitAfterSave?: boolean;
        suppressNoChangeNotice?: boolean;
        suppressSuccessNotice?: boolean;
    }) => Promise<boolean>;
}

const SPEC_EDIT_QUERY_KEY = 'specEdit';
const SPEC_DRAFT_STORAGE_PREFIX = 'axhub-spec-draft:';
const SPEC_DRAFT_DEBOUNCE_MS = 650;
const PROJECT_DOCUMENT_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/docs\/.+\/content$/iu;
const PROJECT_DOCUMENT_PATH_CONTENT_RE = /^\/api\/projects\/[^/]+\/document-content$/iu;
const MARKDOWN_DOCS_BROADCAST_CHANNEL = 'axhub-markdown-docs';

function resolveAxhubDisplayNameFromLocation(): string {
    if (typeof window === 'undefined') return '';
    try {
        return new URL(window.location.href).searchParams.get('axhubDisplayName')?.trim() ?? '';
    } catch {
        return '';
    }
}

function buildContextCurrentFileDisplayName(meta: MarkdownQuickEditMeta, fallbackLabel?: string): string {
    const displayName = resolveAxhubDisplayNameFromLocation()
        || String(fallbackLabel || '').trim()
        || String(meta.entryName || '').trim();
    if (!displayName) return '';
    if (meta.docType === 'spec' || meta.docType === 'prd') {
        return `${displayName} ${meta.docType}`;
    }
    return displayName;
}

function buildDocApiPath(docName: string): string {
    const normalizedName = String(docName || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/');

    if (!normalizedName) {
        return '/api/docs';
    }

    if (normalizedName === 'templates' || normalizedName.startsWith('templates/')) {
        const templateName = normalizedName === 'templates'
            ? ''
            : normalizedName.slice('templates/'.length);
        return templateName
            ? `/api/docs/templates/${encodeURIComponent(templateName)}`
            : '/api/docs/templates';
    }

    return `/api/docs/${encodeURIComponent(normalizedName)}`;
}

function ensureMarkdownExtension(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
}

function parseAxhubImageWidth(src: string | undefined): { cleanSrc: string; width: number | null } {
    const safeSrc = String(src || '');
    const hashIndex = safeSrc.indexOf('#');
    const beforeHash = hashIndex === -1 ? safeSrc : safeSrc.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : safeSrc.slice(hashIndex + 1);

    const queryIndex = beforeHash.indexOf('?');
    if (queryIndex === -1) {
        return { cleanSrc: safeSrc, width: null };
    }

    const base = beforeHash.slice(0, queryIndex);
    const query = beforeHash.slice(queryIndex + 1);
    const params = new URLSearchParams(query);
    const widthText = params.get('axw');
    const widthValue = widthText ? Number.parseInt(widthText, 10) : NaN;
    const width = Number.isFinite(widthValue) && widthValue > 0 ? widthValue : null;

    params.delete('axw');
    const nextQuery = params.toString();
    const nextBeforeHash = nextQuery ? `${base}?${nextQuery}` : base;
    const cleanSrc = hash ? `${nextBeforeHash}#${hash}` : nextBeforeHash;
    return { cleanSrc, width };
}

function buildProjectDocumentAssetUrl(parsedUrl: URL, assetPath: string): string {
    const projectDocumentMatch = parsedUrl.pathname.match(/^\/api\/projects\/([^/]+)\/document-content$/iu);
    if (!projectDocumentMatch) return '';

    const projectId = decodeURIComponent(projectDocumentMatch[1] || '');
    const filePath = String(parsedUrl.searchParams.get('path') || '').trim();
    if (!projectId || !filePath) return '';

    return `/api/projects/${encodeURIComponent(projectId)}/document-asset?path=${encodeURIComponent(filePath)}&asset=${encodeURIComponent(assetPath)}`;
}

function resolveMarkdownImageSrc(src: string, documentUrl?: string): string {
    const safeSrc = String(src || '').trim();
    if (!safeSrc) return safeSrc;

    const isAbsolute = /^(?:[a-z]+:)?\/\//i.test(safeSrc)
        || safeSrc.startsWith('data:')
        || safeSrc.startsWith('blob:')
        || safeSrc.startsWith('/')
        || safeSrc.startsWith('#');
    if (isAbsolute || typeof window === 'undefined') {
        return safeSrc;
    }

    try {
        const parsedUrl = new URL(documentUrl || '', window.location.origin);
        if (parsedUrl.pathname === '/api/markdown-file') {
            const filePath = String(parsedUrl.searchParams.get('path') || '').trim();
            if (filePath) {
                return `/api/markdown-file-asset?path=${encodeURIComponent(filePath)}&asset=${encodeURIComponent(safeSrc)}`;
            }
        }
        const projectDocumentAssetUrl = buildProjectDocumentAssetUrl(parsedUrl, safeSrc);
        if (projectDocumentAssetUrl) {
            return projectDocumentAssetUrl;
        }
        const prototypeSpecAssetUrl = resolvePrototypeSpecAssetUrl(safeSrc, parsedUrl.toString());
        if (prototypeSpecAssetUrl) {
            return prototypeSpecAssetUrl;
        }
    } catch {
        // noop
    }

    const buildAssetBasePath = (rawUrl?: string) => {
        if (!rawUrl) return null;

        let pathname = '';
        try {
            pathname = new URL(rawUrl, window.location.origin).pathname;
        } catch {
            return null;
        }

        const toDocsBasePath = (docPath: string) => {
            const normalizedDocPath = decodeURIComponent(docPath).replace(/\.md$/i, '');
            const lastSlashIndex = normalizedDocPath.lastIndexOf('/');
            const docsSubDir = lastSlashIndex >= 0 ? normalizedDocPath.slice(0, lastSlashIndex + 1) : '';
            return `/docs/${docsSubDir}`;
        };

        if (pathname.startsWith('/api/docs/')) {
            return toDocsBasePath(pathname.slice('/api/docs/'.length));
        }

        if (pathname.startsWith('/docs/')) {
            return toDocsBasePath(pathname.slice('/docs/'.length));
        }

        const typedDocMatch = pathname.match(/^\/(components|prototypes|themes)\/([^/]+)\/(spec|prd)\.md$/i);
        if (typedDocMatch) {
            return `/${typedDocMatch[1]}/${typedDocMatch[2]}/`;
        }

        const gitTypedDocMatch = pathname.match(/^\/api\/git\/version-file\/[^/]+\/(components|prototypes|themes)\/([^/]+)\/(spec|prd)\.md$/i);
        if (gitTypedDocMatch) {
            return `/${gitTypedDocMatch[1]}/${gitTypedDocMatch[2]}/`;
        }

        return null;
    };

    const assetBasePath = buildAssetBasePath(documentUrl) || window.location.pathname;
    try {
        return new URL(safeSrc, new URL(assetBasePath, window.location.origin)).toString();
    } catch {
        return safeSrc;
    }
}

function normalizeRequestedQuickEditMode(value: unknown): 'comment' | 'edit' {
    return value === 'edit' ? 'edit' : 'comment';
}

const MarkdownImage = (props: MarkdownImageProps) => {
    const {
        domNode: _domNode,
        streamStatus: _streamStatus,
        children: _children,
        class: _className,
        classname: _legacyClassName,
        src,
        style,
        documentUrl,
        ...restProps
    } = props || {};
    const safeSrc = typeof src === 'string' ? src : '';
    const { cleanSrc, width } = parseAxhubImageWidth(safeSrc);
    const resolvedSrc = resolveMarkdownImageSrc(cleanSrc || safeSrc, documentUrl);

    return (
        <img
            {...restProps}
            src={resolvedSrc}
            style={{
                ...(style || {}),
                ...(width ? { width: `${width}px` } : {}),
                maxWidth: '100%',
                height: 'auto',
            }}
        />
    );
};

const markdownStyles = `
  body {
    background: #fff;
  }
  .markdown-container {
    display: flex;
    gap: 40px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px;
    position: relative;
    align-items: flex-start;
  }
  .markdown-content {
    flex: 1;
    min-width: 0;
  }
  .markdown-content > div {
    padding: 24px;
  }
  .anchor-sidebar {
    width: 240px;
    flex-shrink: 0;
    position: sticky;
    top: 40px;
  }
  .anchor-sidebar-scroll {
    max-height: calc(100vh - 88px);
    overflow-y: auto;
    padding-right: 8px;
  }
  .anchor-sidebar-scroll .ant-anchor-wrapper {
    max-height: none !important;
  }
  @media (max-width: 1200px) {
    .anchor-sidebar {
      display: none;
    }
  }
  .ant-anchor-link-title {
    font-size: 12px;
  }
  .markdown-tabs-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 24px 0;
  }
  .markdown-tabs-container .ant-tabs-nav {
    margin-bottom: 0;
  }
  .spec-editor-shell {
    min-height: calc(100vh - 170px);
  }
  .spec-editor-shell .simple-editor-wrapper {
    width: 100%;
    min-height: calc(100vh - 230px);
    height: auto;
    overflow: visible;
  }
  .spec-editor-shell .simple-editor-content {
    max-width: 100%;
    width: 100%;
    min-height: calc(100vh - 230px);
  }
  .spec-editor-shell .simple-editor-content .tiptap.ProseMirror.simple-editor {
    min-height: calc(100vh - 320px);
    padding: 1.5rem 1.5rem 22vh;
  }
  .spec-editor-shell .tiptap-toolbar {
    top: 0;
    bottom: auto !important;
    position: sticky;
    border-radius: 8px;
    z-index: 24;
    margin-bottom: 12px;
    width: 100%;
    max-width: 100%;
  }
  @media (max-width: 768px) {
    .spec-editor-shell .simple-editor-content .tiptap.ProseMirror.simple-editor {
      padding: 1rem 1rem 26vh;
    }
  }
`;

function generateId(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function extractHeadings(content: string): HeadingItem[] {
    const headings: HeadingItem[] = [];
    const lines = content.split('\n');
    const stack: HeadingItem[] = [];

    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (!match) {
            continue;
        }

        const level = match[1].length;
        const title = match[2].trim();
        const id = generateId(title);
        const heading: HeadingItem = { id, title, level };

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        if (stack.length === 0) {
            headings.push(heading);
        } else {
            const parent = stack[stack.length - 1];
            if (!parent.children) {
                parent.children = [];
            }
            parent.children.push(heading);
        }

        stack.push(heading);
    }

    return headings;
}

function buildAnchorItems(headings: HeadingItem[]): any[] {
    return headings.map((heading) => ({
        key: heading.id,
        href: `#${heading.id}`,
        title: heading.title,
        children: heading.children ? buildAnchorItems(heading.children) : undefined,
    }));
}

const Code: React.FC<ComponentProps> = (props) => {
    const { className, children } = props;
    const lang = className?.match(/language-(\w+)/)?.[1] || '';

    if (typeof children !== 'string') return null;

    if (lang === 'mermaid') {
        return <Mermaid>{children}</Mermaid>;
    }

    return <code className={className}>{children}</code>;
};

const createHeading = (level: number) => {
    const HeadingComponent: React.FC<ComponentProps> = (props) => {
        const { children } = props;
        const text = typeof children === 'string' ? children : '';
        const id = generateId(text);
        const Tag = `h${level}` as keyof JSX.IntrinsicElements;

        return <Tag id={id}>{children}</Tag>;
    };
    return HeadingComponent;
};

function getSpecDraftStorageKey(doc: MarkdownDocument): string {
    let identity = doc.key || doc.label || 'default';
    if (doc.url) {
        try {
            const normalizedUrl = new URL(doc.url, window.location.origin);
            identity = normalizedUrl.pathname || identity;
        } catch {
            identity = doc.url || identity;
        }
    }
    return `${SPEC_DRAFT_STORAGE_PREFIX}${encodeURIComponent(identity)}`;
}

function readSpecDraft(doc: MarkdownDocument): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(getSpecDraftStorageKey(doc));
    } catch {
        return null;
    }
}

function writeSpecDraft(doc: MarkdownDocument, content: string) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(getSpecDraftStorageKey(doc), content);
    } catch {
        // ignore cache write failures
    }
}

function removeSpecDraft(doc: MarkdownDocument) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(getSpecDraftStorageKey(doc));
    } catch {
        // ignore cache remove failures
    }
}

function parseQuickEditModeFromUrl(): SpecQuickEditMode {
    if (typeof window === 'undefined') return 'none';
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'edit') {
            return 'edit';
        }
        if (params.get('editor') === 'specComment') {
            return 'comment';
        }
        const value = params.get(SPEC_EDIT_QUERY_KEY) ?? params.get('edit');
        if (!value) return 'none';
        return value === '1' || value.toLowerCase() === 'true' ? 'comment' : 'none';
    } catch {
        return 'none';
    }
}

function resolveSavedMarkdownFilePath(docUrl: string | undefined): string {
    if (!docUrl || typeof window === 'undefined') return '';
    try {
        const parsedUrl = new URL(docUrl, window.location.origin);
        return parsedUrl.pathname === '/api/markdown-file'
            ? String(parsedUrl.searchParams.get('path') || '').trim()
            : '';
    } catch {
        return '';
    }
}

function broadcastMarkdownFileSaved(payload: {
    type: 'markdown-file-saved';
    path: string;
    updatedAt: number;
}) {
    if (!payload.path || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(MARKDOWN_DOCS_BROADCAST_CHANNEL);
    try {
        channel.postMessage(payload);
    } finally {
        channel.close();
    }
}

function syncSpecEditQuery(editing: boolean) {
    if (typeof window === 'undefined') return;
    try {
        const url = new URL(window.location.href);
        const current = url.searchParams.get(SPEC_EDIT_QUERY_KEY);
        if (editing) {
            if (current !== '1') {
                url.searchParams.set(SPEC_EDIT_QUERY_KEY, '1');
            }
            window.history.replaceState(null, '', url.toString());
            return;
        }
        if (current !== null) {
            url.searchParams.delete(SPEC_EDIT_QUERY_KEY);
            window.history.replaceState(null, '', url.toString());
        }
    } catch {
        // ignore URL sync failures
    }
}

function postToParent(data: Record<string, any>) {
    if (window.parent !== window) {
        window.parent.postMessage(data, '*');
    }
}

function toSavedContentMap(docs: MarkdownDocument[]) {
    return docs.reduce<Record<string, string>>((acc, doc) => {
        acc[doc.key] = doc.content || '';
        return acc;
    }, {});
}

export const MarkdownViewer = React.forwardRef<MarkdownViewerHandle, MarkdownViewerProps>(function MarkdownViewer(
    { content, documentUrl, documents, onDocumentChange }: MarkdownViewerProps,
    ref,
) {
    const normalizedDocuments = useMemo<MarkdownDocument[]>(() => {
        if (documents && documents.length > 0) {
            return documents;
        }
        return [
            {
                key: 'default',
                label: '文档',
                content: content || '',
                url: documentUrl,
            },
        ];
    }, [content, documentUrl, documents]);

    const [localDocuments, setLocalDocuments] = useState<MarkdownDocument[]>(normalizedDocuments);
    const [savedContents, setSavedContents] = useState<Record<string, string>>(() => toSavedContentMap(normalizedDocuments));
    const [activeKey, setActiveKey] = useState<string>(normalizedDocuments[0]?.key || 'default');
    const [quickEditMode, setQuickEditModeState] = useState<SpecQuickEditMode>(() => parseQuickEditModeFromUrl());
    const [isSaving, setIsSaving] = useState(false);
    const [modal, modalContextHolder] = Modal.useModal();
    const localDocumentsRef = useRef(localDocuments);
    const savedContentsRef = useRef(savedContents);
    const currentDocRef = useRef<MarkdownDocument | undefined>(undefined);
    const quickEditModeRef = useRef<SpecQuickEditMode>(quickEditMode);
    const draftPersistTimerRef = useRef<number | null>(null);
    const draftPromptedDocKeysRef = useRef<Set<string>>(new Set());
    const draftConfirmingDocKeyRef = useRef<string | null>(null);
    const commentEditorRef = useRef<CommentaryApi | null>(null);
    const commentEditorDarkModeRef = useRef(false);
    const commentEditorAssistantPanelOpenRef = useRef(false);
    const editorUserChangedDocKeysRef = useRef<Set<string>>(new Set());
    const currentDoc = useMemo(
        () => localDocuments.find((doc) => doc.key === activeKey) || localDocuments[0],
        [localDocuments, activeKey],
    );
    const isQuickEditing = quickEditMode !== 'none';
    const isEditing = quickEditMode === 'edit';
    const isCommentMode = quickEditMode === 'comment';

    const clearPendingDraftPersist = useCallback(() => {
        if (draftPersistTimerRef.current !== null) {
            window.clearTimeout(draftPersistTimerRef.current);
            draftPersistTimerRef.current = null;
        }
    }, []);

    const clearDraftForDoc = useCallback((doc: MarkdownDocument | undefined) => {
        if (!doc) return;
        removeSpecDraft(doc);
    }, []);

    const clearDraftForAllDocs = useCallback(() => {
        localDocumentsRef.current.forEach((doc) => removeSpecDraft(doc));
    }, []);

    const flushDraftsNow = useCallback(() => {
        clearPendingDraftPersist();
        if (quickEditModeRef.current !== 'edit') return;

        const docs = localDocumentsRef.current;
        const savedMap = savedContentsRef.current;
        docs.forEach((doc) => {
            const saved = savedMap[doc.key] || '';
            const current = doc.content || '';
            if (saved === current) {
                removeSpecDraft(doc);
                return;
            }
            writeSpecDraft(doc, current);
        });
    }, [clearPendingDraftPersist]);

    const buildCommentResourceContext = useCallback((doc: MarkdownDocument | undefined) => {
        if (!doc) return null;
        const meta = resolveMarkdownQuickEditMeta(doc.url);
        const targetPath = meta.docPath;
        return {
            kind: 'markdown-document',
            id: meta.docPath || doc.url || doc.key,
            path: targetPath || undefined,
            url: typeof window !== 'undefined' ? window.location.href : doc.url,
            meta: {
                resourceKind: meta.resourceKind,
                entryType: meta.entryType,
                entryName: meta.entryName,
                docType: meta.docType,
                targetPath,
                currentFilePath: meta.docPath,
                docPath: meta.docPath,
                prototypeFilePath: meta.prototypePath,
                storageScope: meta.docPath
                    ? `markdown-doc:${meta.docPath}`
                    : `markdown-doc:${doc.key}`,
            },
        };
    }, []);

    const ensureCommentEditor = useCallback((options?: {
        initialDarkMode?: boolean;
        assistantPanelOpen?: boolean;
    }) => {
        const initialDarkMode = Boolean(options?.initialDarkMode ?? commentEditorDarkModeRef.current);
        if (typeof options?.assistantPanelOpen === 'boolean') {
            commentEditorAssistantPanelOpenRef.current = options.assistantPanelOpen;
        }
        if (commentEditorRef.current && commentEditorDarkModeRef.current === initialDarkMode) {
            commentEditorRef.current.refresh?.();
            return commentEditorRef.current;
        }

        commentEditorRef.current?.destroy();
        const editor = createCommentary({
            interactionProfile: 'text-comment',
            ui: {
                toolbarMode: 'host',
                initialSelectionModeActive: false,
                hideExecutionControls: true,
                initialDarkMode,
                getAssistantPanelOpen: () => commentEditorAssistantPanelOpenRef.current,
                skillInstallSource: MAKE_COMMENTARY_SKILL_INSTALL_SOURCE,
            },
            host: {
                getResourceContext: () => buildCommentResourceContext(currentDocRef.current),
            },
        });
        commentEditorRef.current = editor;
        commentEditorDarkModeRef.current = initialDarkMode;
        return editor;
    }, [buildCommentResourceContext]);

    const stopCommentEditor = useCallback(() => {
        commentEditorRef.current?.stop();
    }, []);

    const buildCommentPromptPayload = useCallback((): SpecPromptRequestResult => {
        if (!currentDoc) {
            throw new Error('当前没有可用文档');
        }

        const editor = commentEditorRef.current;
        if (!editor) {
            throw new Error('批注编辑器尚未就绪');
        }

        const snapshot = editor.getEditedSnapshot();
        if (!snapshot.modifiedElements.length) {
            throw new Error('当前没有可生成 Prompt 的批注');
        }

        const { prompt, targetPath, meta } = buildMarkdownCommentPrompt({
            docLabel: currentDoc.label,
            docUrl: currentDoc.url,
            modifiedElements: snapshot.modifiedElements.map((item) => ({
                label: item.label,
                note: item.note,
                imageCount: item.imageCount,
                changeKinds: item.changeKinds.filter((kind) => kind === 'text' || kind === 'style' || kind === 'class') as Array<'text' | 'style' | 'class'>,
                locator: item.locator,
            })),
        });

        return {
            prompt,
            targetPath: targetPath || meta.docPath || '',
            context: {
                version: '1',
                systemContext: '',
                currentFile: {
                    path: meta.docPath || targetPath || '',
                    displayName: buildContextCurrentFileDisplayName(meta, currentDoc.label),
                },
                selectedElements: [],
                extensions: {
                    source: 'spec-comment-editor',
                    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
                    docLabel: currentDoc.label,
                    docUrl: currentDoc.url || '',
                    resourceKind: meta.resourceKind,
                    docPath: meta.docPath,
                    prototypePath: meta.prototypePath,
                    entryType: meta.entryType,
                    entryName: meta.entryName,
                    docType: meta.docType,
                    updatedAt: new Date().toISOString(),
                },
            },
        };
    }, [currentDoc]);

    useEffect(() => {
        setLocalDocuments(normalizedDocuments);
        setSavedContents(toSavedContentMap(normalizedDocuments));
        setActiveKey((previous) => {
            if (normalizedDocuments.some((doc) => doc.key === previous)) {
                return previous;
            }
            return normalizedDocuments[0]?.key || 'default';
        });
        setQuickEditModeState(parseQuickEditModeFromUrl());
        setIsSaving(false);
    }, [normalizedDocuments]);

    useEffect(() => {
        localDocumentsRef.current = localDocuments;
    }, [localDocuments]);

    useEffect(() => {
        savedContentsRef.current = savedContents;
    }, [savedContents]);

    useEffect(() => {
        quickEditModeRef.current = quickEditMode;
    }, [quickEditMode]);

    useEffect(() => {
        currentDocRef.current = currentDoc;
        onDocumentChange?.(currentDoc || null);
    }, [currentDoc, onDocumentChange]);

    const dirtyMap = useMemo(() => localDocuments.reduce<Record<string, boolean>>((acc, doc) => {
        acc[doc.key] = (savedContents[doc.key] || '') !== (doc.content || '');
        return acc;
    }, {}), [localDocuments, savedContents]);
    const hasDirtyChanges = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);
    const dirtyCount = useMemo(() => Object.values(dirtyMap).filter(Boolean).length, [dirtyMap]);

    const updateCurrentDocContent = useCallback((markdownContent: string) => {
        const activeDocKey = activeKey;
        setLocalDocuments((previous) => {
            let changed = false;
            const next = previous.map((doc) => {
                if (doc.key !== activeDocKey) return doc;
                if (shouldIgnoreInitialMarkdownEditorChange({
                    savedContent: savedContentsRef.current[doc.key] || '',
                    currentContent: doc.content || '',
                    nextContent: markdownContent,
                    userChanged: editorUserChangedDocKeysRef.current.has(doc.key),
                })) {
                    return doc;
                }
                changed = true;
                return { ...doc, content: markdownContent };
            });
            if (!changed) {
                return previous;
            }
            localDocumentsRef.current = next;
            return next;
        });
    }, [activeKey]);

    const markCurrentEditorUserChange = useCallback(() => {
        if (activeKey) {
            editorUserChangedDocKeysRef.current.add(activeKey);
        }
    }, [activeKey]);

    const markEditorToolbarUserChange = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.tiptap-toolbar')) {
            markCurrentEditorUserChange();
        }
    }, [markCurrentEditorUserChange]);

    const uploadImageToCurrentDoc = useCallback<UploadFunction>(async (
        file: File,
        onProgress?: (event: { progress: number }) => void,
        abortSignal?: AbortSignal,
    ): Promise<string> => {
        const doc = currentDocRef.current || currentDoc;
        if (!doc?.url) {
            throw new Error('缺少文档地址，无法上传图片');
        }
        const currentDocUrl = doc.url;
        editorUserChangedDocKeysRef.current.add(doc.key);

        return new Promise<string>((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file, file.name || 'image');
            formData.append('docUrl', currentDocUrl);

            const xhr = new XMLHttpRequest();
            let finished = false;
            let onAbortSignal: (() => void) | null = null;

            const removeAbortListener = () => {
                if (abortSignal && onAbortSignal) {
                    abortSignal.removeEventListener('abort', onAbortSignal);
                }
            };

            const finishReject = (error: Error) => {
                if (finished) return;
                finished = true;
                removeAbortListener();
                reject(error);
            };

            const finishResolve = (url: string) => {
                if (finished) return;
                finished = true;
                removeAbortListener();
                resolve(url);
            };

            const parseResponsePayload = () => {
                if (xhr.response && typeof xhr.response === 'object') {
                    return xhr.response;
                }
                if (!xhr.responseText) {
                    return {};
                }
                try {
                    return JSON.parse(xhr.responseText);
                } catch {
                    return {};
                }
            };

            onAbortSignal = () => {
                try {
                    xhr.abort();
                } catch {
                    finishReject(new Error('Upload cancelled'));
                }
            };

            if (abortSignal) {
                if (abortSignal.aborted) {
                    finishReject(new Error('Upload cancelled'));
                    return;
                }
                abortSignal.addEventListener('abort', onAbortSignal, { once: true });
            }

            xhr.open('POST', '/api/spec-doc/upload-image');
            xhr.responseType = 'json';

            xhr.upload.onprogress = (event) => {
                if (!event.lengthComputable) return;
                onProgress?.({ progress: Math.round((event.loaded / event.total) * 100) });
            };

            xhr.onerror = () => {
                finishReject(new Error('图片上传失败，请检查网络后重试'));
            };

            xhr.onabort = () => {
                finishReject(new Error('Upload cancelled'));
            };

            xhr.onload = () => {
                const payload = parseResponsePayload();
                if (xhr.status >= 200 && xhr.status < 300 && payload?.success && typeof payload?.url === 'string') {
                    onProgress?.({ progress: 100 });
                    finishResolve(payload.url);
                    return;
                }
                finishReject(new Error(payload?.error || '图片上传失败'));
            };

            xhr.send(formData);
        });
    }, [currentDoc]);

    const restoreDirtyChanges = useCallback(() => {
        setLocalDocuments((previous) => {
            const next = previous.map((doc) => (
                dirtyMap[doc.key]
                    ? { ...doc, content: savedContents[doc.key] || '' }
                    : doc
            ));
            localDocumentsRef.current = next;
            return next;
        });
    }, [dirtyMap, savedContents]);

    const notifyParent = useCallback((level: 'success' | 'info' | 'warning' | 'error', message: string) => {
        postToParent({
            type: 'SPEC_EDIT_NOTICE',
            level,
            message,
        });
    }, []);

    const buildSaveRequest = useCallback((docUrl: string, nextContent: string) => {
        const prototypeSpecRequest = buildPrototypeSpecMarkdownSaveRequest(
            docUrl,
            nextContent,
            window.location.origin,
        );
        if (prototypeSpecRequest) return prototypeSpecRequest;

        let pathname = '';
        let search = '';
        try {
            const normalizedUrl = new URL(docUrl, window.location.origin);
            pathname = normalizedUrl.pathname;
            search = normalizedUrl.search;
        } catch {
            pathname = docUrl;
            search = '';
        }

        if (
            pathname === '/api/markdown-file'
            || pathname.startsWith('/api/docs/')
            || PROJECT_DOCUMENT_CONTENT_PATH_RE.test(pathname)
            || PROJECT_DOCUMENT_PATH_CONTENT_RE.test(pathname)
        ) {
            return {
                url: `${pathname}${search}`,
                init: {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: nextContent }),
                },
            };
        }

        if (pathname.startsWith('/docs/templates/')) {
            const rawName = pathname.slice('/docs/templates/'.length);
            const decodedName = decodeURIComponent(rawName);
            return {
                url: buildDocApiPath(`templates/${ensureMarkdownExtension(decodedName)}`),
                init: {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: nextContent }),
                },
            };
        }

        if (pathname.startsWith('/docs/')) {
            const rawName = pathname.slice('/docs/'.length);
            const decodedName = decodeURIComponent(rawName);
            return {
                url: buildDocApiPath(ensureMarkdownExtension(decodedName)),
                init: {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: nextContent }),
                },
            };
        }

        return {
            url: '/api/spec-doc/save',
            init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docUrl, content: nextContent }),
            },
        };
    }, []);

    const saveCurrentDoc = useCallback(async (options?: {
        exitAfterSave?: boolean;
        suppressNoChangeNotice?: boolean;
        suppressSuccessNotice?: boolean;
    }) => {
        if (!currentDoc) {
            notifyParent('warning', '当前没有可保存的文档');
            return false;
        }

        const isCurrentDirty = dirtyMap[currentDoc.key];
        if (!isCurrentDirty) {
            clearPendingDraftPersist();
            clearDraftForDoc(currentDoc);
            if (options?.exitAfterSave) {
                clearDraftForAllDocs();
                setQuickEditModeState('none');
            } else if (!options?.suppressNoChangeNotice) {
                notifyParent('info', '当前文档没有需要保存的更改');
            }
            return true;
        }

        if (!currentDoc.url) {
            notifyParent('error', '缺少文档地址，无法保存');
            return false;
        }

        setIsSaving(true);
        try {
            const { url, init } = buildSaveRequest(currentDoc.url, currentDoc.content || '');
            const response = await fetch(url, init);
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result?.error || '保存失败');
            }
            const savedMarkdownPath = resolveSavedMarkdownFilePath(currentDoc.url);
            if (savedMarkdownPath) {
                broadcastMarkdownFileSaved({
                    type: 'markdown-file-saved',
                    path: savedMarkdownPath,
                    updatedAt: Date.now(),
                });
            }

            setSavedContents((previous) => ({
                ...previous,
                [currentDoc.key]: currentDoc.content || '',
            }));
            clearPendingDraftPersist();
            clearDraftForDoc(currentDoc);
            if (!options?.suppressSuccessNotice) {
                notifyParent('success', `${currentDoc.label} 已保存`);
            }
            if (options?.exitAfterSave) {
                clearDraftForAllDocs();
                setQuickEditModeState('none');
            }
            return true;
        } catch (error: any) {
            notifyParent('error', error?.message || '保存失败');
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [
        buildSaveRequest,
        clearDraftForAllDocs,
        clearDraftForDoc,
        clearPendingDraftPersist,
        currentDoc,
        dirtyMap,
        notifyParent,
    ]);

    const setQuickEditSessionMode = useCallback(async (
        mode: 'comment' | 'edit',
        options?: { saveBehavior?: 'none' | 'save' | 'discard' },
    ) => {
        const saveBehavior = options?.saveBehavior ?? 'none';
        if (mode === 'comment' && quickEditModeRef.current === 'edit') {
            if (saveBehavior === 'save') {
                const saved = await saveCurrentDoc({
                    suppressNoChangeNotice: true,
                    suppressSuccessNotice: true,
                });
                if (!saved) {
                    return false;
                }
            } else if (saveBehavior === 'discard') {
                restoreDirtyChanges();
                clearPendingDraftPersist();
                clearDraftForAllDocs();
            }
        }

        setQuickEditModeState(mode);
        return true;
    }, [clearDraftForAllDocs, clearPendingDraftPersist, restoreDirtyChanges, saveCurrentDoc]);

    useEffect(() => {
        if (isEditing && currentDoc) {
            editorUserChangedDocKeysRef.current.delete(currentDoc.key);
        }
    }, [currentDoc?.key, isEditing]);

    const emitSpecEditStatus = useCallback(() => {
        postToParent({
            type: 'SPEC_EDIT_STATUS',
            enabled: isQuickEditing,
            dirty: hasDirtyChanges,
            saving: isSaving,
            dirtyCount,
            activeDocKey: activeKey,
            quickEditMode,
        });
    }, [activeKey, dirtyCount, hasDirtyChanges, isQuickEditing, isSaving, quickEditMode]);

    useEffect(() => {
        emitSpecEditStatus();
    }, [emitSpecEditStatus]);

    useEffect(() => {
        syncSpecEditQuery(isQuickEditing);
    }, [isQuickEditing]);

    useEffect(() => {
        if (!isCommentMode || !currentDoc) {
            stopCommentEditor();
            return;
        }

        const timerId = window.setTimeout(() => {
            ensureCommentEditor().start();
        }, 0);

        return () => {
            window.clearTimeout(timerId);
            stopCommentEditor();
        };
    }, [currentDoc, ensureCommentEditor, isCommentMode, stopCommentEditor]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            flushDraftsNow();
            stopCommentEditor();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [flushDraftsNow, stopCommentEditor]);

    useEffect(() => {
        if (!isEditing || !currentDoc) {
            clearPendingDraftPersist();
            return;
        }

        const saved = savedContents[currentDoc.key] || '';
        const current = currentDoc.content || '';
        if (saved === current) {
            clearPendingDraftPersist();
            const existingDraft = readSpecDraft(currentDoc);
            const hasPendingDraftToReview = Boolean(
                existingDraft
                && existingDraft !== current
                && existingDraft !== saved,
            );
            if (!hasPendingDraftToReview) {
                clearDraftForDoc(currentDoc);
            }
            return;
        }

        clearPendingDraftPersist();
        draftPersistTimerRef.current = window.setTimeout(() => {
            writeSpecDraft(currentDoc, current);
            draftPersistTimerRef.current = null;
        }, SPEC_DRAFT_DEBOUNCE_MS);

        return () => {
            clearPendingDraftPersist();
        };
    }, [clearDraftForDoc, clearPendingDraftPersist, currentDoc, isEditing, savedContents]);

    useEffect(() => {
        if (!isEditing || !currentDoc) {
            draftPromptedDocKeysRef.current.clear();
            draftConfirmingDocKeyRef.current = null;
            return;
        }

        if (draftPromptedDocKeysRef.current.has(currentDoc.key)) {
            return;
        }
        draftPromptedDocKeysRef.current.add(currentDoc.key);

        const draft = readSpecDraft(currentDoc);
        if (!draft || draft === currentDoc.content || draft === (savedContents[currentDoc.key] || '')) {
            return;
        }

        if (draftConfirmingDocKeyRef.current === currentDoc.key) {
            return;
        }
        draftConfirmingDocKeyRef.current = currentDoc.key;

        modal.confirm({
            title: '检测到本地缓存',
            content: `检测到「${currentDoc.label}」存在本地未保存缓存，是否加载缓存版本？`,
            okText: '加载缓存',
            cancelText: '忽略',
            onOk: () => {
                setLocalDocuments((previous) => {
                    const next = previous.map((doc) => (
                        doc.key === currentDoc.key ? { ...doc, content: draft } : doc
                    ));
                    localDocumentsRef.current = next;
                    return next;
                });
                notifyParent('info', `已加载 ${currentDoc.label} 的本地缓存版本`);
            },
            onCancel: () => {
                clearDraftForDoc(currentDoc);
            },
            afterClose: () => {
                if (draftConfirmingDocKeyRef.current === currentDoc.key) {
                    draftConfirmingDocKeyRef.current = null;
                }
            },
        });
    }, [clearDraftForDoc, currentDoc, isEditing, modal, notifyParent, savedContents]);

    useEffect(() => {
        postToParent({
            type: 'spec-doc-changed',
            activeDocKey: activeKey,
        });
    }, [activeKey]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || typeof data.type !== 'string') return;

            if (data.type === 'SPEC_EDIT_ENABLE') {
                draftPromptedDocKeysRef.current.clear();
                setQuickEditModeState(normalizeRequestedQuickEditMode(data.mode));
                return;
            }

            if (data.type === 'SPEC_EDIT_SET_MODE') {
                const nextMode = data.mode === 'edit' ? 'edit' : 'comment';
                void setQuickEditSessionMode(nextMode, {
                    saveBehavior:
                        data.saveBehavior === 'save' || data.saveBehavior === 'discard'
                            ? data.saveBehavior
                            : 'none',
                });
                return;
            }

            if (data.type === 'SPEC_EDIT_SAVE') {
                void saveCurrentDoc({ exitAfterSave: Boolean(data.exitAfterSave) });
                return;
            }

            if (data.type === 'SPEC_EDIT_EXIT') {
                if (Boolean(data.discardChanges)) {
                    restoreDirtyChanges();
                }
                clearPendingDraftPersist();
                clearDraftForAllDocs();
                setQuickEditModeState('none');
                return;
            }

            if (data.type === 'SPEC_EDIT_STATUS_REQUEST') {
                emitSpecEditStatus();
                return;
            }

            if (data.type === 'SPEC_EDIT_PROMPT_REQUEST') {
                const requestId = String(data.requestId || '').trim();
                if (!requestId) return;
                void (async () => {
                    try {
                        if (quickEditModeRef.current !== 'comment') {
                            throw new Error('请先切换到批注模式');
                        }
                        const payload = buildCommentPromptPayload();
                        postToParent({
                            type: 'SPEC_EDIT_PROMPT_RESPONSE',
                            requestId,
                            success: true,
                            prompt: payload.prompt,
                            targetPath: payload.targetPath,
                            context: payload.context,
                        });
                    } catch (error: any) {
                        postToParent({
                            type: 'SPEC_EDIT_PROMPT_RESPONSE',
                            requestId,
                            success: false,
                            error: error?.message || '生成 Prompt 失败',
                        });
                    }
                })();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [
        buildCommentPromptPayload,
        clearDraftForAllDocs,
        clearPendingDraftPersist,
        emitSpecEditStatus,
        restoreDirtyChanges,
        saveCurrentDoc,
        setQuickEditSessionMode,
    ]);

    useImperativeHandle(ref, () => ({
        enableQuickEdit() {
            draftPromptedDocKeysRef.current.clear();
            setQuickEditModeState('comment');
        },
        disableQuickEdit(options) {
            if (options?.discardChanges) {
                restoreDirtyChanges();
            }
            clearPendingDraftPersist();
            clearDraftForAllDocs();
            setQuickEditModeState('none');
        },
        enableDocumentEditor(options) {
            draftPromptedDocKeysRef.current.clear();
            setQuickEditModeState(normalizeRequestedQuickEditMode(options?.quickEditMode));
            const editor = ensureCommentEditor({
                initialDarkMode: options?.initialDarkMode,
                assistantPanelOpen: options?.assistantPanelOpen,
            });
            editor.start();
            void editor.runHostToolbarAction?.({ type: 'toggle-selection-mode', active: false });
        },
        disableDocumentEditor() {
            stopCommentEditor();
        },
        getHostToolbarState() {
            return commentEditorRef.current?.getHostToolbarState?.() ?? null;
        },
        subscribeHostToolbarState(listener) {
            const editor = ensureCommentEditor();
            return editor.subscribeHostToolbarState(listener);
        },
        runHostToolbarAction(action) {
            const editor = ensureCommentEditor();
            return editor.runHostToolbarAction(action);
        },
        async setQuickEditMode(mode, options) {
            return setQuickEditSessionMode(mode, options);
        },
        getQuickEditStatus() {
            return {
                enabled: isQuickEditing,
                dirty: hasDirtyChanges,
                saving: isSaving,
                dirtyCount,
                activeDocKey: activeKey,
                quickEditMode,
            };
        },
        handleCopyPrompt() {
            return Promise.resolve(buildCommentPromptPayload());
        },
        saveCurrentDoc,
    }), [
        activeKey,
        buildCommentPromptPayload,
        clearDraftForAllDocs,
        clearPendingDraftPersist,
        dirtyCount,
        hasDirtyChanges,
        ensureCommentEditor,
        isQuickEditing,
        isSaving,
        quickEditMode,
        restoreDirtyChanges,
        saveCurrentDoc,
        setQuickEditSessionMode,
        stopCommentEditor,
    ]);

    useEffect(() => {
        return () => {
            commentEditorRef.current?.destroy();
            commentEditorRef.current = null;
        };
    }, []);

    const previewContent = useMemo(
        () => stripMarkdownPreviewFrontmatter(currentDoc?.content || ''),
        [currentDoc?.content],
    );

    const { anchorItems } = useMemo(() => {
        const headings = extractHeadings(previewContent);
        const items = buildAnchorItems(headings);
        return { anchorItems: items };
    }, [previewContent]);

    const isMultiDoc = localDocuments.length > 1;
    const anchorSidebarScrollRef = useRef<HTMLDivElement | null>(null);

    const scrollActiveAnchorIntoView = useCallback((activeHref?: string) => {
        window.requestAnimationFrame(() => {
            const scrollContainer = anchorSidebarScrollRef.current;
            if (!scrollContainer) return;
            const activeLink = Array.from(scrollContainer.querySelectorAll<HTMLAnchorElement>('.ant-anchor-link-title'))
                .find((link) => link.getAttribute('href') === activeHref)
                ?? scrollContainer.querySelector<HTMLElement>('.ant-anchor-link-title-active');
            if (!activeLink) return;

            const containerRect = scrollContainer.getBoundingClientRect();
            const activeRect = activeLink.getBoundingClientRect();
            const topGap = activeRect.top - containerRect.top;
            const bottomGap = activeRect.bottom - containerRect.bottom;
            if (topGap < 0) {
                scrollContainer.scrollTop += topGap - 8;
            } else if (bottomGap > 0) {
                scrollContainer.scrollTop += bottomGap + 8;
            }
        });
    }, []);

    const renderViewerContent = () => (
        <div className="markdown-container">
            <div className="markdown-content">
                <div>
                    <XMarkdown
                        className="x-markdown-light"
                        content={previewContent}
                        components={{
                            a: ((props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
                                const navigationTarget = resolveMarkdownDocumentLinkTarget(
                                    String(props.href || ''),
                                    String(currentDoc?.url || ''),
                                );
                                const resourceUrl = navigationTarget
                                    ? null
                                    : resolvePrototypeSpecResourceUrl(
                                        String(props.href || ''),
                                        String(currentDoc?.url || ''),
                                    );
                                return (
                                    <a
                                        {...props}
                                        href={resourceUrl || props.href}
                                        onClick={(event) => {
                                            props.onClick?.(event);
                                            if (event.defaultPrevented || !navigationTarget) return;
                                            event.preventDefault();
                                            if (navigationTarget.kind === 'prototype-spec') {
                                                postToParent({
                                                    type: 'axhub-prototype-spec:navigate',
                                                    path: navigationTarget.resourceId,
                                                });
                                                return;
                                            }
                                            postToParent({
                                                type: 'axhub-document-resource:navigate',
                                                resourceType: navigationTarget.kind,
                                                resourceId: navigationTarget.resourceId,
                                            });
                                        }}
                                    />
                                );
                            }) as any,
                            code: Code,
                            img: ((props: MarkdownImageProps) => (
                                <MarkdownImage
                                    {...props}
                                    documentUrl={currentDoc?.url}
                                />
                            )) as any,
                            h1: createHeading(1),
                            h2: createHeading(2),
                            h3: createHeading(3),
                            h4: createHeading(4),
                            h5: createHeading(5),
                            h6: createHeading(6),
                        }}
                    />
                </div>
            </div>
            {anchorItems.length > 0 && (
                <div className="anchor-sidebar">
                    <div style={{
                        marginBottom: 12,
                        fontWeight: 600,
                        fontSize: 16,
                        paddingLeft: 16,
                        borderLeft: '2px solid transparent',
                    }}
                    >
                        目录
                    </div>
                    <div className="anchor-sidebar-scroll" ref={anchorSidebarScrollRef}>
                        <Anchor
                            affix={false}
                            offsetTop={40}
                            targetOffset={80}
                            items={anchorItems}
                            onChange={scrollActiveAnchorIntoView}
                            onClick={(event) => {
                                event.preventDefault();
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    const renderEditorContent = () => (
        <div
            className="markdown-container spec-editor-shell"
            onBeforeInputCapture={markCurrentEditorUserChange}
            onInputCapture={markCurrentEditorUserChange}
            onKeyDownCapture={markCurrentEditorUserChange}
            onPasteCapture={markCurrentEditorUserChange}
            onDropCapture={markCurrentEditorUserChange}
            onPointerDownCapture={markEditorToolbarUserChange}
        >
            <div className="markdown-content">
                <div>
                    <SimpleEditor
                        content={currentDoc?.content || ''}
                        contentType="markdown"
                        editable={isEditing}
                        showThemeToggle={false}
                        toolbarPreset="full"
                        imageUpload={uploadImageToCurrentDoc}
                        onMarkdownChange={updateCurrentDocContent}
                    />
                </div>
            </div>
        </div>
    );

    return (
        <ConfigProvider theme={defaultThemeConfig}>
            <XProvider locale={zhCN_X}>
                {modalContextHolder}
                <style>{markdownStyles}</style>
                {isMultiDoc && (
                    <div className="markdown-tabs-container">
                        <Tabs
                            activeKey={activeKey}
                            onChange={setActiveKey}
                            items={localDocuments.map((doc) => ({
                                key: doc.key,
                                label: dirtyMap[doc.key] ? `${doc.label} *` : doc.label,
                            }))}
                        />
                    </div>
                )}
                {isEditing ? renderEditorContent() : renderViewerContent()}
            </XProvider>
        </ConfigProvider>
    );
});
