import { MainIDEPreference } from '../common/ide';
import type { AssistantCurrentFileValueV1 } from '../common/assistant-context/types';

export interface DeviceConfig {
    id: string;
    name: string;
    width: number;
    height: number;
    type: 'mobile' | 'tablet' | 'desktop';
    sizeInch?: number;
    ratio?: string;
    userAgent?: string;
}

export interface ItemData {
    name: string;
    displayName: string;
    jsUrl: string;
    specUrl: string;
    filePath?: string;
    absoluteFilePath?: string;
    canvasFilePath?: string;
    absoluteCanvasFilePath?: string;
    fileSize?: number;
    specFilePath?: string;
    specAbsoluteFilePath?: string;
    specTitle?: string;
    artifacts?: Record<string, unknown>;
    previewUrl?: string;
    clientUrl?: string;
    projectId?: string;
    resourceId?: string;
    projectDocumentPath?: string;
    openMode?: ResourceOpenMode;
    ext?: string;
    previewDisabled?: boolean;
    placeholder?: boolean;
    placeholderGuide?: PrototypePlaceholderGuide;
    generationStatus?: 'waiting';
    isReference?: boolean;
    pages?: { id: string; title: string; group?: string }[];
    defaultPageId?: string;
}

export type ResourceOpenMode = 'document' | 'canvas' | 'drawio' | 'image' | 'file';

export interface PrototypePlaceholderGuide {
    kind: string;
    title: string;
    description: string;
    steps: string[];
    tips: string[];
}

export interface DataType {
    components: ItemData[];
    prototypes: ItemData[];
}

export type AcpPromptClient =
    | 'acp:claude'
    | 'acp:cursor'
    | 'acp:codex'
    | 'acp:opencode'
    | 'acp:qoder'
    | 'acp:codebuddy'
    | 'acp:reasonix'
    | 'acp:grok-build';
export type LocalPromptClient = 'local:cursor' | 'local:qoder';
export type PromptClient = AcpPromptClient | LocalPromptClient;
export type PromptClientPreference = PromptClient | null;

export interface AutomationConfig {
    conversationPromptClient?: PromptClientPreference;
    conversationModel?: string | null;
    defaultIDE?: MainIDEPreference;
    injectLocalAiEntry?: boolean;
    annotationPromptClient?: PromptClientPreference;
    annotationModel?: string | null;
    canvasPromptClient?: PromptClientPreference;
    canvasModel?: string | null;
    agentRunConcurrency?: number;
    autoClearCompletedComments?: boolean;
}

export type ViewMode = 'demo' | 'canvas';
export type TabType = 'prototypes';
export type SidebarTreeTab = TabType | 'docs' | 'canvas' | 'themes';
export type SidebarTreeNodeKind = 'folder' | 'item';

export interface SidebarTreeNode {
    id: string;
    kind: SidebarTreeNodeKind;
    title: string;
    itemKey?: string;
    path?: string;
    folderPath?: string;
    children?: SidebarTreeNode[];
}

export interface CanvasItem {
    name: string;
    displayName: string;
}

export interface ImageConfig {
    width: number;
    height: number;
    includeConfig: 'none' | 'code';
    includeImageAssets: boolean;
    contentType: 'title' | 'screenshot';
    isFullScreen?: boolean;
    rawScreenshotUrl: string;
    screenshotWidth: number;
    screenshotHeight: number;
    previewUrl: string;
}

export interface AxureCopyOptions {
    preserveHierarchy: boolean;
    preserveSvgIcons: boolean;
}

export interface ThemeOption {
    name: string;
    displayName: string;
    clientUrl?: string;
    previewUrl?: string;
    hasDesignToken?: boolean;
    hasGlobals?: boolean;
    hasDesignSpec?: boolean;
    hasIndexTsx?: boolean;
}

export interface DocOption {
    name: string;
    displayName: string;
}

export interface DataAssetOption {
    name: string;
    displayName: string;
}

export interface TemplateAssetOption {
    name: string;
    displayName: string;
    description?: string;
}

export interface SelectedOption {
    name: string;
    displayName: string;
}

export interface AssistantContextElementV1 {
    tag: string;
    selector: string;
    label: string;
}

export interface AssistantContextV1 {
    version: '1';
    systemContext: string;
    currentFile: AssistantCurrentFileValueV1;
    selectedElements: AssistantContextElementV1[];
    extensions?: Record<string, unknown>;
}
