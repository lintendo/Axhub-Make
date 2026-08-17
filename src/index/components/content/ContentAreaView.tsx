import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, CircleHelp, Copy, ExternalLink, FileIcon, Globe, ImageIcon, LayoutDashboard, Monitor, Network, PencilRuler, Play, Rocket, SlidersHorizontal, Smartphone, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { ItemData, CanvasItem, SidebarTreeNode, SidebarTreeTab, TabType, ViewMode, type PromptClientPreference } from '../../types';
import type { DataTableResourceItem, ThemeResourceItem } from '../../domains/resources/resource.types';
import DeviceShell from '../DeviceShell';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import HomeDataTable from './HomeDataTable';
import CanvasFloatingToolbar from './CanvasFloatingToolbar';
import TemplateLibraryCard, { type TemplateLibraryCardItem } from '../dialogs/TemplateLibraryCard';
import PromptActionButton from '../PromptActionButton';
import type { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type { RuntimeAgentAvailability } from '../../../common/agent';
import type { AcpProvider } from '@/common/assistant-context/types';
import type { PromptExecutionMeta, PrototypeCreateDialogOpenOptions, SelectedResourceFolder } from '../../types/index-page.types';
import type {
    MultiPageColumns,
    PreviewConfig,
    PreviewMeasuredContentSize,
    PreviewScaleMode,
    PreviewSinglePreset,
} from '../../domains/device/preview-layout';
import {
    DEVICE_PRESET_SIZES,
    resolvePreviewLayout,
    resolveStablePreviewContainerSize,
} from '../../domains/device/preview-layout';
import type { ProjectRuntimeStatus } from '../../services/projectResources';
import type { ExcalidrawPropertyPanelMode, ExcalidrawPropertyPanelPosition } from '../../utils/excalidrawUiMode';
import type { CanvasElementContextInfo } from './canvas-embeds/AnnotationOverlay';
import { resolveCanvasFilePath } from './canvasFilePath';
import { injectPreviewIframeScrollbarStyle } from './previewIframeScrollbar';
import ResourceFolderPreview from './ResourceFolderPreview';
import MultiPagePreviewCanvas from './MultiPagePreviewCanvas';
import type { CanvasAiGenerationRequest, CanvasAiGenerationResult } from '../../domains/ai-generation/CanvasAiGenerationTool';
import type { AssistantImageAttachmentPayload } from '../../domains/assistant/assistantContextPayload';
import type { AiImageTaskParams } from '../../domains/ai-image/aiImageStore';
import {
    NO_PROTOTYPE_THEME_VALUE,
    resolvePrototypeGenerationInitialThemeName,
} from '../../domains/prototype-generation/prototypeGenerationThemeSelection';
import { PrototypeThemeSearchSelect } from '../../domains/prototype-generation/PrototypeThemeSearchSelect';
import type { CanvasDocumentFormat } from '../../domains/ai-generation/canvasGenerationPromptSettings';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
import {
    filterCompatibleDocumentTemplates,
    isDocumentTemplateCompatibleWithFormat,
    type DocumentTemplateOption,
} from '../../services/documentTemplates';
import { generateTemplateImportPrompt, type TemplateLibraryPromptItem } from '../../utils/templateImportPrompts';
import { getUserFriendlyUploadErrorMessage } from '../../utils/uploadErrors';
import { copyToClipboard } from '../../utils/clipboard';
import { resolveMarkdownPreviewIframeUrl } from '../../utils/markdownPreview';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { ResourceStartPromptGrid, type ResourceStartPromptCard } from './ResourceStartPromptGrid';
import { applyResourceStartImageSize } from './resourceStartPromptSelection';
import { ThemeStartPromptGrid, type ThemeStartPromptCard } from './ThemeStartPromptGrid';
import { buildStartGuidePrompt } from './startGuidePrompt';
import { useProgressiveLibraryItems } from '../../hooks/useProgressiveLibraryItems';

const ExcalidrawCanvas = React.lazy(() => lazyWithRetry(() => import('./ExcalidrawCanvas')));

const PREVIEW_DEVICE_SHELL_INSET = { width: 32, height: 32 } as const;
const SCALED_PREVIEW_HORIZONTAL_GAP = 8;
const SPLIT_PREVIEW_HEADER_HEIGHT = 40;
const SPLIT_PREVIEW_HORIZONTAL_INSET = 44;
const UNSPECIFIED_START_SETTING_VALUE = '__unspecified__';
const PROTOTYPE_START_COUNT_OPTIONS = [1, 2, 3, 4] as const;
const START_SETTINGS_SELECT_CONTENT_STYLE = { zIndex: 1400 } satisfies CSSProperties;
const IMAGE_START_SIZE_OPTIONS = [
    { label: '自动', value: 'auto' },
    { label: '移动端 1K', value: '1024x1536' },
    { label: '移动端 2K', value: '1152x2048' },
    { label: '移动端 4K', value: '2160x3840' },
    { label: 'PC 端 1K', value: '1536x1024' },
    { label: 'PC 端 2K', value: '2048x1152' },
    { label: 'PC 端 4K', value: '3840x2160' },
] as const;
const IMAGE_START_QUALITY_OPTIONS = [
    { label: '自动', value: 'auto' },
    { label: '高', value: 'high' },
    { label: '中', value: 'medium' },
    { label: '低', value: 'low' },
] as const;
const IMAGE_START_FORMAT_OPTIONS = [
    { label: 'PNG', value: 'png' },
    { label: 'JPEG', value: 'jpeg' },
    { label: 'WebP', value: 'webp' },
] as const;
const DOCUMENT_START_FORMAT_OPTIONS = [
    { label: 'Markdown 文档', value: 'md' },
    { label: 'HTML 文档', value: 'html' },
    { label: 'Mermaid 图表', value: 'mermaid' },
    { label: 'Drawio 图表', value: 'drawio' },
] as const satisfies readonly { label: string; value: CanvasDocumentFormat }[];
type HtmlVisualSpecSkillId =
    | 'kami'
    | 'baoyu-classic'
    | 'baoyu-grace'
    | 'baoyu-simple'
    | 'baoyu-modern'
    | 'html-presentations-terminal'
    | 'html-presentations-catppuccin'
    | 'html-presentations-nord'
    | 'guizang-editorial'
    | 'guizang-swiss';
const DOCUMENT_HTML_VISUAL_SPEC_OPTIONS = [
    {
        value: 'kami',
        label: 'Kami 纸感文档',
        description: '暖白纸张、墨蓝点缀、衬线标题，适合白皮书、简历、作品集和正式长文。',
        themeInstruction: '使用 kami 的纸感文档主题：暖白纸张、墨蓝点缀、衬线标题和清晰的信息层级。',
        skillName: 'kami',
        githubUrl: 'https://github.com/tw93/kami',
    },
    {
        value: 'baoyu-classic',
        label: 'Baoyu 经典文章',
        description: '传统公众号文章排版，居中标题、分隔线和醒目的二级标题，适合稳妥发布。',
        themeInstruction: '使用 baoyu-markdown-to-html 的 default 主题：传统公众号文章排版，居中标题、分隔线和醒目的二级标题。',
        skillName: 'baoyu-markdown-to-html',
        githubUrl: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html',
    },
    {
        value: 'baoyu-grace',
        label: 'Baoyu 优雅文章',
        description: '阴影、圆角卡片和精致引用块，适合更柔和、更有修饰感的长文。',
        themeInstruction: '使用 baoyu-markdown-to-html 的 grace 主题：阴影、圆角卡片和精致引用块。',
        skillName: 'baoyu-markdown-to-html',
        githubUrl: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html',
    },
    {
        value: 'baoyu-simple',
        label: 'Baoyu 极简文章',
        description: '留白更干净、圆角不对称，适合轻量说明、产品笔记和现代文档。',
        themeInstruction: '使用 baoyu-markdown-to-html 的 simple 主题：干净留白和不对称圆角。',
        skillName: 'baoyu-markdown-to-html',
        githubUrl: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html',
    },
    {
        value: 'baoyu-modern',
        label: 'Baoyu 现代文章',
        description: '大圆角、胶囊标题、行距更松，适合轻松但完整的图文发布。',
        themeInstruction: '使用 baoyu-markdown-to-html 的 modern 主题：大圆角、胶囊标题和更松的阅读节奏。',
        skillName: 'baoyu-markdown-to-html',
        githubUrl: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-markdown-to-html',
    },
    {
        value: 'html-presentations-terminal',
        label: 'HTML Presentation · Terminal',
        description: '黑底绿字、等宽字体、终端扫描线感，适合技术演示和开发者分享。',
        themeInstruction: '使用 html-presentations 的 terminal.css 主题：黑底绿字、等宽字体和终端扫描线感。',
        skillName: 'html-presentations',
        githubUrl: 'https://github.com/ericmjl/skills/tree/main/skills/html-presentations',
    },
    {
        value: 'html-presentations-catppuccin',
        label: 'HTML Presentation · Catppuccin',
        description: '暖暗色底配柔和粉彩强调色，适合产品讲解、轻量分享和现代技术 deck。',
        themeInstruction: '使用 html-presentations 的 catppuccin 主题：暖暗色底和柔和粉彩强调色。',
        skillName: 'html-presentations',
        githubUrl: 'https://github.com/ericmjl/skills/tree/main/skills/html-presentations',
    },
    {
        value: 'html-presentations-nord',
        label: 'HTML Presentation · Nord',
        description: '蓝灰冷调、克制安静，适合系统说明、研究汇报和偏理性的演示。',
        themeInstruction: '使用 html-presentations 的 nord 主题：蓝灰冷调、克制安静。',
        skillName: 'html-presentations',
        githubUrl: 'https://github.com/ericmjl/skills/tree/main/skills/html-presentations',
    },
    {
        value: 'guizang-editorial',
        label: 'Guizang · 电子杂志风',
        description: '电子墨水、杂志排版、强叙事节奏，适合观点表达、个人分享和产品故事。',
        themeInstruction: '使用 guizang-ppt-skill 的 Style A 电子杂志风：电子墨水、杂志排版和强叙事节奏。',
        skillName: 'guizang-ppt-skill',
        githubUrl: 'https://github.com/op7418/guizang-ppt-skill',
    },
    {
        value: 'guizang-swiss',
        label: 'Guizang · 瑞士国际主义',
        description: '网格、直角色块、发丝线、高饱和锚点色，适合事实、产品、分析和方法论。',
        themeInstruction: '使用 guizang-ppt-skill 的 Style B 瑞士国际主义：网格、直角色块、发丝线和高饱和锚点色。',
        skillName: 'guizang-ppt-skill',
        githubUrl: 'https://github.com/op7418/guizang-ppt-skill',
    },
] as const satisfies readonly {
    value: HtmlVisualSpecSkillId;
    label: string;
    description: string;
    themeInstruction: string;
    skillName: string;
    githubUrl: string;
}[];
const IMAGE_START_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const PLACEHOLDER_TEMPLATE_LIBRARY_CACHE_KEY = 'axhub:placeholder-template-library:v1';
const PLACEHOLDER_TEMPLATE_LIBRARY_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const THEME_CATALOG_CACHE_KEY = 'axhub:start-guide-theme-catalogs:v1';
type StartGuideKind = 'prototype' | 'resource' | 'design';
const PROTOTYPE_START_PROMPT_CARDS = [
    {
        id: 'prd-to-prototype',
        title: '根据 PRD 生成原型',
        prompt: '根据我提供的 PRD 生成原型，梳理页面和主要流程。',
        icon: FileIcon,
    },
    {
        id: 'design-to-prototype',
        title: '根据设计图还原原型',
        prompt: '根据我提供的 Figma 链接或设计稿 PNG 还原原型；PNG 请使用 $screenshot-to-prototype。',
        icon: ImageIcon,
    },
    {
        id: 'axure-reference-prototype',
        title: '参考 Axure 生成原型',
        prompt: '请参考我提供的 Axure 原型（在线链接或本地导出的 HTML 文件）生成当前项目的可运行原型。先使用 extract-axure-data 技能（https://github.com/lintendo/Axhub-Skills/tree/main/skills/extract-axure-data）理解原型中的页面结构、核心流程、交互、标注、字段和状态，再结合当前项目的设计规范规划并实现页面；信息不足处请标注待确认。',
        icon: FileIcon,
    },
    {
        id: 'flow-to-page',
        title: '根据流程图生成页面',
        prompt: '先生成售后申请流程图，再生成申请和进度页面原型。',
        icon: Network,
    },
    {
        id: 'crm-admin',
        title: '生成 CRM 管理后台',
        prompt: '生成 CRM 管理后台原型，包含客户列表、详情和新增客户。',
        icon: LayoutDashboard,
    },
    {
        id: 'fitness-home',
        title: '运动记录 APP 首页',
        prompt: '生成运动记录 APP 首页原型，包含今日数据、运动入口和历史记录。',
        icon: Smartphone,
    },
    {
        id: 'apple-smart-home',
        title: 'Apple 风格智能家居',
        prompt: '参照项目内 Apple 主题规范，生成智能家居控制 App 原型，包含家庭概览、设备快捷控制和房间切换。',
        icon: PencilRuler,
    },
] as const satisfies readonly ThemeStartPromptCard[];
const RESOURCE_START_PROMPT_CARDS = [
    {
        id: 'city-roaming-app-design',
        scene: 'design',
        title: '生成 APP 设计图',
        prompt: '从零设计一款名为「城市漫游」的内容社区 APP，不复刻任何现有产品；生成首页、内容流、发布和个人主页的移动端设计图。',
        icon: Smartphone,
        imageSize: '1152x2048',
    },
    {
        id: 'park-control-dashboard',
        scene: 'design',
        title: '生成驾驶舱大屏',
        prompt: '从零设计「园区智控」运营驾驶舱大屏设计图，包含园区总览、实时告警、能耗趋势和设备状态。',
        icon: Monitor,
        imageSize: '2048x1152',
    },
    {
        id: 'axure-warehouse-prd',
        scene: 'document',
        title: 'Axure 转产品文档',
        prompt: '请根据我提供的 Axure 原型（在线链接或本地导出的 HTML 文件），基于原型中的真实内容，梳理页面结构、交互、字段和状态，生成产品需求文档和相关资料；信息不足处请标注待确认，不要虚构产品名称或原型中未包含的信息。',
        icon: FileIcon,
        prdPlanning: 'enable',
    },
    {
        id: 'webpage-link-prd',
        scene: 'document',
        title: '网页链接转产品文档',
        prompt: '请访问并分析我提供的网页链接，基于网页中的真实内容，梳理页面结构、内容信息、功能模块、交互流程和关键状态，生成产品需求文档和相关资料；仅整理网页中可以确认的信息，信息不足处请标注待确认，不要虚构产品名称、功能或数据。',
        icon: Globe,
        prdPlanning: 'enable',
    },
    {
        id: 'meal-app-screenshot-prd',
        scene: 'document',
        title: 'APP 截图转产品文档',
        prompt: '请根据我上传的 APP 截图，基于截图中的真实内容，梳理页面结构、用户流程、功能模块和关键状态，生成产品需求文档和相关资料；信息不足处请标注待确认，不要虚构产品名称或截图中未展示的信息。',
        icon: ImageIcon,
        prdPlanning: 'enable',
    },
    {
        id: 'collaboration-prd',
        scene: 'document',
        title: '生成产品需求文档',
        prompt: '请从零生成「协作台」团队任务管理工具的产品需求文档，包含背景、目标用户、功能范围、核心流程、页面说明、数据字段和验收标准。',
        icon: FileIcon,
        prdPlanning: 'enable',
    },
    {
        id: 'after-sales-flow',
        scene: 'document',
        title: '生成业务流程图',
        prompt: '请生成「商城售后」从申请、审核、退货、退款到关闭的完整业务流程图，并标注关键分支和异常状态。',
        icon: Network,
        prdPlanning: 'disable',
    },
    {
        id: 'park-control-drawio',
        scene: 'document',
        title: '生成 Drawio 图表',
        prompt: '请生成「园区智控」的业务架构 Drawio 可编辑图表，包含用户、业务模块、数据流和系统边界，并输出可继续编辑的 Drawio 文件。',
        icon: LayoutDashboard,
        prdPlanning: 'disable',
    },
] as const satisfies readonly ResourceStartPromptCard[];

const THEME_START_PROMPT_CARDS = [
    {
        id: 'theme-generate',
        title: '生成设计规范',
        prompt: '请为「漫屿」精品旅行住宿预订产品生成一套主题。品牌面向 25–40 岁、重视设计感的城市旅行者，整体气质温暖、克制、有编辑感；使用奶油白背景、深墨色正文和陶土橙强调色，标题使用高对比衬线体，正文使用清晰的无衬线体，卡片圆角 12px。请覆盖搜索、房源卡片、预订表单和订单状态等核心组件。',
        icon: PencilRuler,
    },
    {
        id: 'theme-refero-import',
        title: '从 Refero 导入',
        prompt: '请从 https://styles.refero.design/ 选择一套适合 B2B 数据分析产品的主题并导入当前项目。希望整体克制、专业、易读，重点关注数据对比、状态识别和密集信息下的层级关系；如果来源不可用或信息不足，请先说明，不要自行补猜。',
        icon: UploadCloud,
    },
    {
        id: 'theme-web-capture',
        title: '网页链接采集',
        prompt: '请参考这个网页的设计风格并生成一套可复用主题：<粘贴网页链接>。重点提取页面的颜色、字体、间距、圆角、边框、阴影、组件状态和响应式布局；只根据页面中实际看到的内容整理，缺少的信息请标注待确认。',
        icon: Globe,
    },
    {
        id: 'theme-axure-resource-capture',
        title: '从 Axure 资源采集',
        prompt: '请基于我提供的 Axure 原型资源（在线链接或本地导出的 HTML）生成一套主题。先处理并分析原型中的真实页面结构、交互、组件状态和视觉样式，再提取颜色、字体、间距、圆角、边框和阴影等可复用规则；原型中没有体现的信息请标注待确认，不要根据产品名称自行补猜。',
        icon: FileIcon,
    },
    {
        id: 'theme-prototype-extraction',
        title: '从原型生成',
        prompt: '请基于我选择的一个或多个项目内原型，反推一套统一的设计规范。对比不同原型中的颜色、字体、间距、圆角、边框、阴影和常用组件，识别一致规则与差异；以重复出现且稳定的样式为主，冲突或缺失处请标注待确认。',
        icon: Monitor,
    },
    {
        id: 'theme-figma-import',
        title: 'Figma 导入',
        prompt: '请根据我提供的 Figma 链接或上传的 Figma 导出文件整理一套主题。请从其中真实可见的页面、组件、颜色、字体、间距和状态提取可复用规则，并保留原有的视觉层级；看不到或无法确认的设计信息请标注待确认。',
        icon: LayoutDashboard,
    },
    {
        id: 'theme-screenshot-import',
        title: '截图导入',
        prompt: '请根据我上传的界面截图整理一套主题。请提取截图中真实可见的色彩、字体、层级、间距、圆角、边框、阴影和组件状态，并整理成可复用的视觉规则；截图没有展示的信息请标注待确认，不要虚构产品名称或功能。',
        icon: ImageIcon,
    },
] as const satisfies readonly ThemeStartPromptCard[];
type ImageStartParams = Omit<AiImageTaskParams, 'n' | 'output_format'> & {
    n?: AiImageTaskParams['n'];
    output_format?: AiImageTaskParams['output_format'];
};
const DEFAULT_IMAGE_START_PARAMS: ImageStartParams = {
    size: 'auto',
    quality: 'auto',
    output_format: undefined,
    output_compression: null,
    moderation: 'auto',
    background: 'auto',
    n: undefined,
    disable_prompt_optimization: false,
};
type MeasuredSplitContentSizes = {
    primary: PreviewMeasuredContentSize | null;
    secondary: PreviewMeasuredContentSize | null;
};

interface PlaceholderTemplateLibraryCache {
    cachedAt: number;
    templates: TemplateLibraryCardItem[];
}

function normalizeTemplateCases(value: unknown): TemplateLibraryCardItem[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            const id = typeof record.id === 'string' ? record.id.trim() : '';
            const title = typeof record.title === 'string' ? record.title.trim() : '';
            const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
            const sourcePath = typeof record.sourcePath === 'string' ? record.sourcePath.trim() : '';
            const sourceUrl = typeof record.sourceUrl === 'string' ? record.sourceUrl.trim() : '';
            const coverPath = typeof record.coverPath === 'string' ? record.coverPath.trim() : '';
            const coverUrl = typeof record.coverUrl === 'string' ? record.coverUrl.trim() : '';
            const description = typeof record.description === 'string' ? record.description.trim() : '';
            if (!id || !title || !sourcePath || !coverUrl || !description) return null;
            const extraDependencies = Array.isArray(record.extraDependencies)
                ? record.extraDependencies
                    .map((dependency) => typeof dependency === 'string' ? dependency.trim() : '')
                    .filter(Boolean)
                : [];
            return {
                id,
                title,
                ...(slug ? { slug } : {}),
                sourcePath,
                ...(sourceUrl ? { sourceUrl } : {}),
                ...(coverPath ? { coverPath } : {}),
                coverUrl,
                description,
                ...(typeof record.author === 'string' && record.author.trim() ? { author: record.author.trim() } : {}),
                ...(typeof record.authorUrl === 'string' && record.authorUrl.trim() ? { authorUrl: record.authorUrl.trim() } : {}),
                ...(typeof record.previewUrl === 'string' && record.previewUrl.trim() ? { previewUrl: record.previewUrl.trim() } : {}),
                extraDependencies,
                canDirectImport: record.canDirectImport === true,
                ...(typeof record.directImportDisabledReason === 'string' && record.directImportDisabledReason.trim()
                    ? { directImportDisabledReason: record.directImportDisabledReason.trim() }
                    : {}),
            } satisfies TemplateLibraryCardItem;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
}

type ThemeCatalogPlatform = 'desktop' | 'mobile';
const THEME_CATALOG_PLATFORMS: ThemeCatalogPlatform[] = ['desktop', 'mobile'];

interface ThemeCatalogState {
    projectId: string;
    items: TemplateLibraryCardItem[];
    total: number;
    stale: boolean;
    loaded: boolean;
    loading: boolean;
    error: string;
}

interface ThemeCatalogCacheEntry {
    cachedAt: number;
    items: TemplateLibraryCardItem[];
    total: number;
    stale: boolean;
}

type ThemeCatalogCache = Partial<Record<ThemeCatalogPlatform, ThemeCatalogCacheEntry>>;

function createEmptyThemeCatalogState(): ThemeCatalogState {
    return {
        projectId: '',
        items: [],
        total: 0,
        stale: false,
        loaded: false,
        loading: false,
        error: '',
    };
}

function formatThemePlatformLabel(label: string, catalog: ThemeCatalogState, projectId?: string | null): string {
    return catalog.loaded && catalog.projectId === projectId ? `${label}（${catalog.total}）` : label;
}

function normalizeThemeCatalogCases(value: unknown): TemplateLibraryCardItem[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            const id = typeof record.id === 'string' ? record.id.trim() : '';
            const title = typeof record.title === 'string' ? record.title.trim() : '';
            const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
            const platform = record.platform === 'desktop' || record.platform === 'mobile'
                ? record.platform
                : null;
            const description = typeof record.description === 'string' ? record.description.trim() : '';
            const previewUrl = typeof record.previewUrl === 'string' ? record.previewUrl.trim() : '';
            const coverUrl = typeof record.coverUrl === 'string' ? record.coverUrl.trim() : '';
            if (!id || !title || !slug || !platform || !description || !previewUrl) return null;
            return {
                id,
                title,
                slug,
                platform,
                metaLabel: platform === 'desktop' ? 'PC 端' : '移动端',
                ...(coverUrl ? { coverUrl } : {}),
                description,
                previewUrl,
                canDirectImport: record.canDirectImport === true,
                ...(typeof record.directImportDisabledReason === 'string' && record.directImportDisabledReason.trim()
                    ? { directImportDisabledReason: record.directImportDisabledReason.trim() }
                    : {}),
            } satisfies TemplateLibraryCardItem;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
}

function readThemeCatalogCache(): ThemeCatalogCache {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(THEME_CATALOG_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Partial<Record<ThemeCatalogPlatform, Partial<ThemeCatalogCacheEntry>>>;
        return THEME_CATALOG_PLATFORMS.reduce<ThemeCatalogCache>((cache, platform) => {
            const entry = parsed[platform];
            const cachedAt = typeof entry?.cachedAt === 'number' ? entry.cachedAt : 0;
            const items = normalizeThemeCatalogCases(entry?.items)
                .filter((item) => item.platform === platform);
            const parsedTotal = Number(entry?.total);
            const total = Number.isInteger(parsedTotal) && parsedTotal >= items.length
                ? parsedTotal
                : items.length;
            if (cachedAt && (items.length > 0 || total === 0)) {
                cache[platform] = {
                    cachedAt,
                    items,
                    total,
                    stale: entry?.stale === true,
                };
            }
            return cache;
        }, {});
    } catch {
        return {};
    }
}

function writeThemeCatalogCacheEntry(
    platform: ThemeCatalogPlatform,
    catalog: Pick<ThemeCatalogState, 'items' | 'total' | 'stale'>,
    now = Date.now(),
): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(THEME_CATALOG_CACHE_KEY, JSON.stringify({
            ...readThemeCatalogCache(),
            [platform]: {
                cachedAt: now,
                items: catalog.items,
                total: catalog.total,
                stale: catalog.stale,
            },
        } satisfies ThemeCatalogCache));
    } catch {
        // The start guide can still load the remote catalog when browser storage is unavailable.
    }
}

function createThemeCatalogStatesFromCache(projectId?: string | null): Record<ThemeCatalogPlatform, ThemeCatalogState> {
    const cache = readThemeCatalogCache();
    return THEME_CATALOG_PLATFORMS.reduce<Record<ThemeCatalogPlatform, ThemeCatalogState>>((states, platform) => {
        const entry = cache[platform];
        states[platform] = projectId && entry
            ? {
                projectId,
                items: entry.items,
                total: entry.total,
                stale: entry.stale,
                loaded: true,
                loading: false,
                error: '',
            }
            : createEmptyThemeCatalogState();
        return states;
    }, {
        desktop: createEmptyThemeCatalogState(),
        mobile: createEmptyThemeCatalogState(),
    });
}

function readPlaceholderTemplateLibraryCache(): PlaceholderTemplateLibraryCache | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PLACEHOLDER_TEMPLATE_LIBRARY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PlaceholderTemplateLibraryCache>;
        const cachedAt = typeof parsed.cachedAt === 'number' ? parsed.cachedAt : 0;
        const templates = normalizeTemplateCases(parsed.templates);
        if (!cachedAt || templates.length === 0) return null;
        return { cachedAt, templates };
    } catch {
        return null;
    }
}

function isPlaceholderTemplateLibraryCacheFresh(cache: PlaceholderTemplateLibraryCache | null, now = Date.now()): boolean {
    return Boolean(cache && now - cache.cachedAt <= PLACEHOLDER_TEMPLATE_LIBRARY_CACHE_TTL_MS);
}

function writePlaceholderTemplateLibraryCache(templates: TemplateLibraryCardItem[], now = Date.now()): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(PLACEHOLDER_TEMPLATE_LIBRARY_CACHE_KEY, JSON.stringify({
            cachedAt: now,
            templates,
        }));
    } catch {
        // Homepage examples are opportunistic; ignore storage failures.
    }
}

function FieldLabelWithHint({ label, hint }: { label: string; hint: string }) {
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <span>{label}</span>
            <TooltipProvider delayDuration={150}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={`${label}说明`}
                        >
                            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs leading-5">
                        {hint}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </span>
    );
}

const PROTOTYPE_START_FIELD_HINTS = {
    count: '选择后会按方案数量生成，并在最终提示词中加载本地 explore-options（多方案探索）技能提示。',
    theme: '选择一个设计系统后，原型会尽量沿用该资源的视觉风格和组件约束。',
    requirements: '开启后会按共享需求对齐指南补齐目标用户、核心任务、范围、关键流程和验收口径。',
} as const;

const IMAGE_START_FIELD_HINTS = {
    size: '选择移动端或 PC 端的 1K、2K、4K 画布尺寸。',
    quality: '质量越高通常细节越好，但生成时间和消耗也可能更高。',
    count: '选择后会按方案数量生成多个设计方向，并在最终提示词中加载本地 explore-options（多方案探索）技能提示。',
    format: '选择生成图片的输出格式，透明背景仅支持 PNG。',
    theme: '选择一个设计系统后，设计图会尽量沿用该资源的视觉风格和组件约束。',
    promptOptimization: '开启后会要求 AI 完整使用输入内容，不主动改写提示词。',
    transparentBackground: '生成 PNG 透明背景图片，适合图标、头像和贴纸等素材。',
} as const;

const DOCUMENT_START_FIELD_HINTS = {
    format: 'Markdown 更轻量；HTML 文档有更好的视觉效果，但会消耗更多 token；Drawio 图表支持更丰富的图形和在线编辑，也会消耗更多 token。',
    template: '可以在项目设置中预览和编辑文档模板；HTML 支持 Markdown 和 HTML 模板，Markdown 仅支持 Markdown 模板。',
    visualSpec: 'HTML 文档可选择视觉规范技能，让排版更接近对应模板风格。',
    prdPlanning: '需要整理产品资料、反推现状、划分新增范围，或不确定最终需要几篇 PRD 时开启；需求和目标文档已经明确时关闭。',
} as const;

interface CanvasErrorBoundaryProps {
    resetKey: string;
    children: React.ReactNode;
}

interface CanvasErrorBoundaryState {
    hasError: boolean;
}

class CanvasErrorBoundary extends React.Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
    state: CanvasErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
        if (import.meta.env.DEV && typeof window !== 'undefined') {
            (window as any).__AXHUB_CANVAS_RENDER_ERROR__ = {
                message: error?.message || String(error),
                stack: error?.stack || '',
            };
        }
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[Axhub Make] Canvas render failed', error, errorInfo);
        if (import.meta.env.DEV && typeof window !== 'undefined') {
            (window as any).__AXHUB_CANVAS_RENDER_ERROR__ = {
                message: error?.message || String(error),
                stack: error?.stack || '',
                componentStack: errorInfo?.componentStack || '',
            };
        }
    }

    componentDidUpdate(prevProps: CanvasErrorBoundaryProps) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full w-full items-center justify-center bg-background px-6 text-center">
                    <div className="max-w-[360px]">
                        <PencilRuler className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-25" />
                        <div className="text-base font-medium text-foreground">画布加载失败</div>
                        <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                            请刷新页面，或切换到其他画布后再回来重试。
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

interface ContentAreaProps {
    containerRef: React.RefObject<HTMLDivElement>;
    previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
    secondaryPreviewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
    onPreviewIframeLoad?: (iframe?: HTMLIFrameElement | null) => void;
    selectedItem: ItemData | null;
    activeTab: TabType;
    previewConfig: PreviewConfig;
    handleChangeMultiPageColumns: (columns: MultiPageColumns) => void;
    handleSelectPreviewSinglePreset: (preset: PreviewSinglePreset) => void;
    handleSelectCustomPreview: () => void;
    handleActivateMultiPagePreview: (pageCount?: number) => void;
    handleChangeCustomPreviewWidth: (width: number) => void;
    handleChangeCustomPreviewHeight: (height: number) => void;
    handleChangePreviewScaleMode: (mode: PreviewScaleMode) => void;
    handleChangeSplitPreviewWidth: (pane: 'primary' | 'secondary', width: number) => void;
    handleChangeSplitPreviewHeight: (pane: 'primary' | 'secondary', height: number) => void;
    handlePreviewContainerSizeChange: (width: number) => void;
    quickEditActive?: boolean;
    onRunPrototypePanePromptAction?: (pane: 'primary' | 'secondary', action: 'copy-prompt' | 'send-to-agent') => void | Promise<boolean>;
    currentDevice: { id: string; [key: string]: any };
    displaySize: { width: number; height: number };
    scale: number;
    elementIframeKey: number;
    primaryIframeUrl: string;
    secondaryIframeUrl: string;
    elementIframeSize: { width: number; height: number };
    setElementIframeSize: (size: { width: number; height: number }) => void;
    viewMode: ViewMode;
    onEnterSelectedPrototypePreview?: () => void;
    contentMode?: 'preview' | 'prototype-spec' | 'doc' | 'template' | 'canvas' | 'theme' | 'data';
    docsItems?: ItemData[];
    sidebarTrees?: Partial<Record<SidebarTreeTab, SidebarTreeNode[]>>;
    selectedDoc?: ItemData | null;
    selectedResourceFolder?: SelectedResourceFolder | null;
    selectedTemplate?: ItemData | null;
    selectedPrototypeSpec?: ItemData | null;
    isDarkMode?: boolean;
    selectedTheme?: ThemeResourceItem | null;
    selectedDataTable?: DataTableResourceItem | null;
    projectRuntimeStatus?: ProjectRuntimeStatus | null;
    projectRuntimeStatusLoading?: boolean;
    projectAccessDeniedReason?: string;
    hasPrototypeItems?: boolean;
    hasDocItems?: boolean;
    onStartMakeProject?: () => void | Promise<void>;
    onCopyStartServerErrorPrompt?: () => void | Promise<void>;
    startServerLoading?: boolean;
    startServerError?: string;
    collapsed?: boolean;
    setCollapsed?: (collapsed: boolean) => void;
    selectedCanvas?: CanvasItem | null;
    canvasItems?: CanvasItem[];
    excalidrawPropertyPanelMode?: ExcalidrawPropertyPanelMode;
    setExcalidrawPropertyPanelMode?: (mode: ExcalidrawPropertyPanelMode) => void;
    excalidrawPropertyPanelPosition?: ExcalidrawPropertyPanelPosition;
    setExcalidrawPropertyPanelPosition?: (position: ExcalidrawPropertyPanelPosition) => void;
    bridgeConnected?: boolean;
    conversationUiEnabled?: boolean;
    assistantVisible?: boolean;
    onToggleAssistant?: () => void;
    onAddToContext?: (elements: CanvasElementContextInfo[]) => void;
    onAnnotationsChange?: (annotations: CanvasElementContextInfo[]) => void;
    onOpenCanvasInIDE?: (canvasFilePath: string) => void | Promise<void>;
    onOpenCanvasAgent?: () => void | Promise<void>;
    onSelectResourceFolder?: (folder: any) => void;
    onSelectResourceFolderItem?: (item: ItemData) => void;
    onOpenResourceFolderInSystem?: (folderPath: string) => void | Promise<void>;
    preferredIDE?: MainIDEPreference;
    activeProjectId?: string | null;
    ideAvailability?: IDEAvailabilityMap;
    agentAvailability?: RuntimeAgentAvailability;
    webAgentPanelOpen?: boolean;
    aiPanelMode?: 'general-ai' | 'image-ai' | null;
    externalOpenMenu?: boolean;
    onOpenProjectInIDE?: (ideOverride?: MainIDEPreference, targetPath?: string) => boolean | Promise<boolean>;
    onOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;
    onOpenImageAiPanel?: () => void | Promise<void>;
    onOpenWebAgentInPanel?: (url: string) => boolean | void | Promise<boolean | void>;
    onExecutePrompt?: (prompt: string, meta: PromptExecutionMeta) => Promise<boolean | void> | boolean | void;
    onCloseAiPanel?: () => void;
    onCloseWebAgentPanel?: () => void;
    onPreferredIDEChange?: (ide: MainIDEPreference) => void;
    onOpenAISettings?: () => void;
    assistantApiBaseUrl?: string;
    assistantProjectPath?: string;
    preferredPromptClient?: PromptClientPreference;
    preferredModel?: string | null;
    canvasPromptClient?: PromptClientPreference;
    canvasModel?: string | null;
    prototypes?: ItemData[];
    themes?: ThemeResourceItem[];
    defaultThemeName?: string | null;
    onOpenPrototypeCreateDialog?: (options: PrototypeCreateDialogOpenOptions) => void;
    prototypeStartDraftActive?: boolean;
    resourceStartDraftActive?: boolean;
    themeStartDraftActive?: boolean;
    onUploadResourceFiles?: () => void;
    onCreateResourceCanvasFile?: () => void | Promise<void>;
    onCreateDrawioResourceFile?: () => void | Promise<void>;
    onOpenDesignImport?: () => void;
    onRefreshThemes?: () => void | Promise<void>;
    onRefreshPrototypes?: (preferredName?: string) => Promise<ItemData[]>;
    agentRunConcurrency?: number;
    onSubmitCanvasAssistantPrompt?: (request: CanvasAiGenerationRequest) => Promise<CanvasAiGenerationResult | boolean> | CanvasAiGenerationResult | boolean;
    onAddCanvasScreenshotToAI?: (attachment: AssistantImageAttachmentPayload) => Promise<boolean> | boolean;
    onAddCanvasImageToAI?: (attachment: AssistantImageAttachmentPayload, promptText?: string) => Promise<boolean> | boolean;
}

function ProjectContentEmptyState({
    kind,
    projectRuntimeStatus,
    projectRuntimeStatusLoading = false,
    onStartMakeProject,
    onCopyStartServerErrorPrompt,
    startServerLoading = false,
    startServerError = '',
}: {
    kind: 'prototype' | 'doc';
    projectRuntimeStatus?: ProjectRuntimeStatus | null;
    projectRuntimeStatusLoading?: boolean;
    onStartMakeProject?: () => void | Promise<void>;
    onCopyStartServerErrorPrompt?: () => void | Promise<void>;
    startServerLoading?: boolean;
    startServerError?: string;
}) {
    const emptyTitleByKind = {
        prototype: '当前项目暂无原型',
        doc: '当前项目暂无资源',
    } as const;
    const runningEmptyTitleByKind = {
        prototype: '客户端已启动，但当前项目暂无原型',
        doc: '客户端已启动，但当前项目暂无资源',
    } as const;
    const isMakeClient = projectRuntimeStatus?.makeClient === true;
    const shouldShowStartButton = isMakeClient
        && projectRuntimeStatus.running !== true
        && Boolean(onStartMakeProject);
    const title = isMakeClient && projectRuntimeStatus.running
        ? runningEmptyTitleByKind[kind]
        : emptyTitleByKind[kind];
    const description = shouldShowStartButton
        ? '启动对应的 Make 客户端后会自动刷新资源并回到原来的内容。'
        : '可以从左侧创建或切换项目后继续查看。';

    return (
        <div className="flex h-full w-full items-center justify-center bg-muted/20 px-6 text-center">
            <div className="max-w-[360px]">
                <Rocket className="mx-auto mb-4 h-14 w-14 text-muted-foreground opacity-20" />
                <div className="text-base font-medium text-foreground">{title}</div>
                <div className="mt-2 text-[12px] leading-5 text-muted-foreground">{description}</div>
                {projectRuntimeStatusLoading ? (
                    <div className="mt-4 text-[12px] text-muted-foreground">正在检测 Make 状态...</div>
                ) : null}
                {shouldShowStartButton ? (
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => { void onStartMakeProject?.(); }}
                        disabled={startServerLoading}
                        className="mt-4 h-8 text-[12px]"
                    >
                        {startServerLoading ? '启动中...' : '启动客户端'}
                    </Button>
                ) : null}
                {startServerError ? (
                    <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3 text-left">
                        <div className="flex items-start gap-2 text-[12px]">
                            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-destructive" />
                            <div className="min-w-0 space-y-2">
                                <div className="font-medium text-destructive">启动客户端失败</div>
                                <div className="break-words leading-5 text-muted-foreground">{startServerError}</div>
                                {startServerError && onCopyStartServerErrorPrompt ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={() => { void onCopyStartServerErrorPrompt(); }}
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        复制给 AI 处理
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function ClientPreviewUnavailableState({
    contentKind,
    clientUrl,
    projectRuntimeStatusLoading = false,
    onStartMakeProject,
    onCopyStartServerErrorPrompt,
    startServerLoading = false,
    startServerError = '',
}: {
    contentKind: 'prototype' | 'theme';
    clientUrl?: string;
    projectRuntimeStatusLoading?: boolean;
    onStartMakeProject?: () => void | Promise<void>;
    onCopyStartServerErrorPrompt?: () => void | Promise<void>;
    startServerLoading?: boolean;
    startServerError?: string;
}) {
    const normalizedClientUrl = String(clientUrl || '').trim();
    const description = contentKind === 'theme'
        ? '当前设计的客户端服务不可用，启动客户端后会自动刷新资源并回到预览。'
        : '当前原型的客户端服务不可用，启动客户端后会自动刷新资源并回到预览。';

    return (
        <div className="flex h-full w-full items-center justify-center bg-muted/20 px-6 text-center">
            <div className="max-w-[420px]">
                <Rocket className="mx-auto mb-4 h-14 w-14 text-muted-foreground opacity-20" />
                <div className="text-base font-medium text-foreground">Make 客户端未启动</div>
                <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                    {description}
                </div>
                {normalizedClientUrl ? (
                    <div className="mx-auto mt-3 max-w-full truncate rounded-md border bg-background/70 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        {normalizedClientUrl}
                    </div>
                ) : null}
                {projectRuntimeStatusLoading ? (
                    <div className="mt-4 text-[12px] text-muted-foreground">正在检测客户端状态...</div>
                ) : null}
                {onStartMakeProject ? (
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => { void onStartMakeProject(); }}
                        disabled={startServerLoading}
                        className="mt-4 h-8 text-[12px]"
                    >
                        {startServerLoading ? '启动中...' : '启动客户端'}
                    </Button>
                ) : null}
                {startServerError ? (
                    <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3 text-left">
                        <div className="flex items-start gap-2 text-[12px]">
                            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-destructive" />
                            <div className="min-w-0 space-y-2">
                                <div className="font-medium text-destructive">启动客户端失败</div>
                                <div className="break-words leading-5 text-muted-foreground">{startServerError}</div>
                                {startServerError && onCopyStartServerErrorPrompt ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={() => { void onCopyStartServerErrorPrompt(); }}
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        复制给 AI 处理
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function PrototypeClientUnavailableState(props: Omit<React.ComponentProps<typeof ClientPreviewUnavailableState>, 'contentKind'>) {
    return <ClientPreviewUnavailableState {...props} contentKind="prototype" />;
}

function runtimeUnavailablePathMatchesResource(requestPath: string | null, prefix: 'prototypes' | 'themes', resourceName?: string | null): boolean {
    const normalizedResourceName = String(resourceName || '').trim();
    if (!requestPath || !normalizedResourceName) {
        return false;
    }
    try {
        const baseOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
        const pathname = new URL(requestPath, baseOrigin).pathname;
        const [section, name] = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
        return section === prefix && name === normalizedResourceName;
    } catch {
        const [section, name] = requestPath.split('?')[0].split('/').filter(Boolean).map((part) => {
            try {
                return decodeURIComponent(part);
            } catch {
                return part;
            }
        });
        return section === prefix && name === normalizedResourceName;
    }
}

function resolvePrototypeIndexFilePath(item: ItemData): string {
    const explicitPath = String(item.filePath || item.absoluteFilePath || '').trim().replace(/\\/g, '/');
    if (explicitPath) {
        const srcIndex = explicitPath.indexOf('src/');
        const relativePath = srcIndex >= 0 ? explicitPath.slice(srcIndex) : explicitPath;
        if (/\/index\.(t|j)sx?$/i.test(relativePath)) return relativePath;
        if (/\.(t|j)sx?$/i.test(relativePath)) return relativePath;
        return `${relativePath.replace(/\/+$/g, '')}/index.tsx`;
    }
    return `src/prototypes/${item.name}/index.tsx`;
}

function PrototypeStartSettingsPopover({
    count,
    selectedThemeName,
    themeLabel,
    themes,
    needsRequirementsAnalysis,
    onCountChange,
    onThemeChange,
    onNeedsRequirementsAnalysisChange,
}: {
    count?: number;
    selectedThemeName: string;
    themeLabel: string;
    themes?: ThemeResourceItem[];
    needsRequirementsAnalysis: boolean;
    onCountChange: (count?: number) => void;
    onThemeChange: (themeName: string) => void;
    onNeedsRequirementsAnalysisChange: (needsRequirementsAnalysis: boolean) => void;
}) {
    const hasCount = typeof count === 'number';
    const hasSelectedTheme = selectedThemeName !== NO_PROTOTYPE_THEME_VALUE;
    const summaryItems = [
        hasCount ? `${count} 个` : null,
        hasSelectedTheme ? themeLabel : null,
    ].filter(Boolean);
    const summary = summaryItems.join(' · ') || '未指定';
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-axhub-prototype-start-settings-trigger
                    className="ax-ai-image-settings-trigger"
                    aria-label="原型设置"
                >
                    <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="ax-ai-image-settings-summary">{summary}</span>
                    <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="z-[1300] w-[320px] p-3">
                <div className="space-y-3">
                    <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium text-foreground">原型设置</div>
                        <div className="truncate text-xs text-muted-foreground">{summary}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="方案数量" hint={PROTOTYPE_START_FIELD_HINTS.count} />
                            <Select
                                value={hasCount ? String(count) : UNSPECIFIED_START_SETTING_VALUE}
                                onValueChange={(value) => onCountChange(value === UNSPECIFIED_START_SETTING_VALUE ? undefined : Number(value))}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                    <SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>
                                        未指定
                                    </SelectItem>
                                    {PROTOTYPE_START_COUNT_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={String(option)}>
                                            {option} 个
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="设计系统" hint={PROTOTYPE_START_FIELD_HINTS.theme} />
                            <PrototypeThemeSearchSelect
                                themes={themes}
                                value={selectedThemeName}
                                onValueChange={onThemeChange}
                            />
                        </label>

                        <label className="col-span-2 space-y-1.5">
                            <FieldLabelWithHint label="需求分析" hint={PROTOTYPE_START_FIELD_HINTS.requirements} />
                            <div className="flex h-8 items-center gap-2 text-xs font-medium text-foreground">
                                <Switch
                                    checked={needsRequirementsAnalysis}
                                    onCheckedChange={(checked) => onNeedsRequirementsAnalysisChange(checked === true)}
                                    aria-label="原型需要需求分析"
                                />
                                <span>开启</span>
                            </div>
                        </label>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ImageStartSettingsPopover({
    params,
    selectedThemeName,
    themeLabel,
    themes,
    onParamsChange,
    onThemeChange,
}: {
    params: ImageStartParams;
    selectedThemeName: string;
    themeLabel: string;
    themes?: ThemeResourceItem[];
    onParamsChange: (params: ImageStartParams) => void;
    onThemeChange: (themeName: string) => void;
}) {
    const sizeLabel = IMAGE_START_SIZE_OPTIONS.find((option) => option.value === params.size)?.label || params.size;
    const qualityLabel = IMAGE_START_QUALITY_OPTIONS.find((option) => option.value === params.quality)?.label || params.quality;
    const formatLabel = params.output_format
        ? IMAGE_START_FORMAT_OPTIONS.find((option) => option.value === params.output_format)?.label || params.output_format.toUpperCase()
        : '';
    const transparentBackgroundChecked = params.output_format === 'png' && params.background === 'transparent';
    const canUseTransparentBackground = params.output_format === 'png';
    const hasSelectedTheme = selectedThemeName !== NO_PROTOTYPE_THEME_VALUE;
    const disablePromptOptimizationChecked = hasSelectedTheme || params.disable_prompt_optimization === true;
    const summary = [
        params.size && params.size !== 'auto' ? sizeLabel : null,
        params.quality && params.quality !== 'auto' ? qualityLabel : null,
        typeof params.n === 'number' ? `${params.n} 个` : null,
        params.output_format ? formatLabel : null,
        hasSelectedTheme ? themeLabel : null,
        transparentBackgroundChecked ? '透明背景' : null,
    ].filter(Boolean).join(' · ') || '未指定';
    const updateParam = <K extends keyof ImageStartParams>(key: K, value: ImageStartParams[K]) => {
        onParamsChange({
            ...params,
            [key]: value,
        });
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-axhub-image-start-settings-trigger
                    className="ax-ai-image-settings-trigger"
                    aria-label="图片设置"
                >
                    <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="ax-ai-image-settings-summary">{summary}</span>
                    <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="z-[1300] w-[320px] p-3">
                <div className="space-y-3">
                    <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium text-foreground">图片设置</div>
                        <div className="truncate text-xs text-muted-foreground">{summary}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="尺寸" hint={IMAGE_START_FIELD_HINTS.size} />
                            <Select value={params.size} onValueChange={(value) => updateParam('size', value)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                    {IMAGE_START_SIZE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="质量" hint={IMAGE_START_FIELD_HINTS.quality} />
                            <Select value={params.quality} onValueChange={(value) => updateParam('quality', value as AiImageTaskParams['quality'])}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                    {IMAGE_START_QUALITY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="方案数量" hint={IMAGE_START_FIELD_HINTS.count} />
                            <Select
                                value={typeof params.n === 'number' ? String(params.n) : UNSPECIFIED_START_SETTING_VALUE}
                                onValueChange={(value) => updateParam('n', value === UNSPECIFIED_START_SETTING_VALUE ? undefined : Number(value))}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                    <SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>
                                        未指定
                                    </SelectItem>
                                    {IMAGE_START_COUNT_OPTIONS.map((count) => (
                                        <SelectItem key={count} value={String(count)}>
                                            {count} 个
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="格式" hint={IMAGE_START_FIELD_HINTS.format} />
                            <Select
                                value={params.output_format || UNSPECIFIED_START_SETTING_VALUE}
                                onValueChange={(value) => updateParam('output_format', value === UNSPECIFIED_START_SETTING_VALUE ? undefined : value as AiImageTaskParams['output_format'])}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                    <SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>
                                        未指定
                                    </SelectItem>
                                    {IMAGE_START_FORMAT_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="col-span-2 space-y-1.5">
                            <FieldLabelWithHint label="设计系统" hint={IMAGE_START_FIELD_HINTS.theme} />
                            <PrototypeThemeSearchSelect
                                themes={themes}
                                value={selectedThemeName}
                                onValueChange={onThemeChange}
                            />
                        </label>

                        <div className="col-span-2 grid grid-cols-2 gap-3">
                            <label className={`space-y-1.5 text-xs font-medium ${hasSelectedTheme ? 'text-muted-foreground' : 'text-foreground'}`}>
                                <FieldLabelWithHint label="禁止优化提示词" hint={hasSelectedTheme ? '已选择设计系统，会自动保持原始提示词以避免改写设计约束。' : IMAGE_START_FIELD_HINTS.promptOptimization} />
                                <div className="flex h-8 items-center gap-2">
                                    <Switch
                                        checked={disablePromptOptimizationChecked}
                                        disabled={hasSelectedTheme}
                                        onCheckedChange={(checked) => updateParam('disable_prompt_optimization', checked === true)}
                                        aria-label="禁止优化提示词"
                                    />
                                    <span>开启</span>
                                </div>
                            </label>

                            <label className={`space-y-1.5 text-xs font-medium ${canUseTransparentBackground ? 'text-foreground' : 'text-muted-foreground'}`}>
                                <FieldLabelWithHint label="透明背景" hint={canUseTransparentBackground ? IMAGE_START_FIELD_HINTS.transparentBackground : '透明背景仅支持 PNG 格式。'} />
                                <div className="flex h-8 items-center gap-2">
                                    <Switch
                                        checked={transparentBackgroundChecked}
                                        disabled={!canUseTransparentBackground}
                                        onCheckedChange={(checked) => updateParam('background', checked === true ? 'transparent' : 'auto')}
                                        aria-label="透明背景"
                                    />
                                    <span>开启</span>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function DocumentStartSettingsPopover({
    format,
    htmlVisualSpec,
    selectedTemplateName,
    templates,
    templatesLoading,
    templateError,
    usePrdPlanning,
    onFormatChange,
    onHtmlVisualSpecChange,
    onTemplateChange,
    onUsePrdPlanningChange,
}: {
    format: CanvasDocumentFormat | '';
    htmlVisualSpec: HtmlVisualSpecSkillId | '';
    selectedTemplateName: string;
    templates: DocumentTemplateOption[];
    templatesLoading?: boolean;
    templateError?: string;
    usePrdPlanning: boolean;
    onFormatChange: (format: CanvasDocumentFormat | '') => void;
    onHtmlVisualSpecChange: (visualSpec: HtmlVisualSpecSkillId | '') => void;
    onTemplateChange: (templateName: string) => void;
    onUsePrdPlanningChange: (usePrdPlanning: boolean) => void;
}) {
    const formatLabel = DOCUMENT_START_FORMAT_OPTIONS.find((option) => option.value === format)?.label || '';
    const visualSpecOption = DOCUMENT_HTML_VISUAL_SPEC_OPTIONS.find((option) => option.value === htmlVisualSpec) || null;
    const visualSpecSummaryLabel = format === 'html' ? visualSpecOption?.label : '';
    const compatibleTemplates = filterCompatibleDocumentTemplates(templates, format);
    const selectedTemplate = compatibleTemplates.find((template) => template.name === selectedTemplateName) || null;
    const templateLabel = selectedTemplate?.displayName || '';
    const summary = [formatLabel, visualSpecSummaryLabel, templateLabel, usePrdPlanning ? 'PRD 规划' : ''].filter(Boolean).join(' · ') || '未指定';
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-axhub-document-start-settings-trigger
                    className="ax-ai-image-settings-trigger"
                    aria-label="文档设置"
                >
                    <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="ax-ai-image-settings-summary">{summary}</span>
                    <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="z-[1300] w-[320px] p-3">
                <div className="space-y-3">
                    <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium text-foreground">文档设置</div>
                        <div className="truncate text-xs text-muted-foreground">{summary}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="文档格式" hint={DOCUMENT_START_FIELD_HINTS.format} />
                            <Select
                                value={format || UNSPECIFIED_START_SETTING_VALUE}
                                onValueChange={(value) => onFormatChange(value === UNSPECIFIED_START_SETTING_VALUE ? '' : value as CanvasDocumentFormat)}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                    <SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>
                                        未指定
                                    </SelectItem>
                                    {DOCUMENT_START_FORMAT_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="space-y-1.5">
                            <FieldLabelWithHint label="模板" hint={DOCUMENT_START_FIELD_HINTS.template} />
                            <Select
                                value={selectedTemplateName || UNSPECIFIED_START_SETTING_VALUE}
                                onValueChange={(value) => onTemplateChange(value === UNSPECIFIED_START_SETTING_VALUE ? '' : value)}
                                disabled={templatesLoading || compatibleTemplates.length === 0}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                    <SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>
                                        {templatesLoading ? '加载中' : '未指定'}
                                    </SelectItem>
                                    {compatibleTemplates.length === 0 ? null : (
                                        compatibleTemplates.map((template) => (
                                            <SelectItem key={template.name} value={template.name}>
                                                {template.displayName}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </label>

                        {format === 'html' ? (
                            <label className="col-span-2 space-y-1.5">
                                <FieldLabelWithHint label="视觉规范" hint={DOCUMENT_START_FIELD_HINTS.visualSpec} />
                                <Select
                                    value={htmlVisualSpec || UNSPECIFIED_START_SETTING_VALUE}
                                    onValueChange={(value) => onHtmlVisualSpecChange(value === UNSPECIFIED_START_SETTING_VALUE ? '' : value as HtmlVisualSpecSkillId)}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue>{visualSpecOption?.label || '未指定'}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent style={START_SETTINGS_SELECT_CONTENT_STYLE}>
                                        <SelectItem value={UNSPECIFIED_START_SETTING_VALUE}>
                                            未指定
                                        </SelectItem>
                                        {DOCUMENT_HTML_VISUAL_SPEC_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value} className="items-start py-2">
                                                <div className="min-w-0 space-y-0.5">
                                                    <div className="text-sm leading-5">{option.label}</div>
                                                    <div className="whitespace-normal text-xs leading-4 text-muted-foreground">
                                                        {option.description}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                        ) : null}
                        <label className="col-span-2 space-y-1.5">
                            <FieldLabelWithHint label="PRD 规划" hint={DOCUMENT_START_FIELD_HINTS.prdPlanning} />
                            <div className="flex h-8 items-center gap-2 text-xs font-medium text-foreground">
                                <Switch
                                    checked={usePrdPlanning}
                                    onCheckedChange={(checked) => onUsePrdPlanningChange(checked === true)}
                                    aria-label="文档使用 PRD 规划流程"
                                />
                                <span>开启</span>
                            </div>
                        </label>
                        {templateError ? (
                            <div className="col-span-2 text-xs leading-5 text-destructive">
                                {templateError}
                            </div>
                        ) : null}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function StartGuide({
    kind,
    item,
    draftActive = false,
    activeProjectId,
    preferredIDE,
    preferredPromptClient,
    ideAvailability,
    assistantVisible,
    aiPanelMode,
    onExecutePrompt,
    themes,
    defaultThemeName,
    onOpenPrototypeCreateDialog,
    onRefreshPrototypes,
    onUploadResourceFiles,
    onCreateResourceCanvasFile,
    onCreateDrawioResourceFile,
    onRefreshThemes,
}: {
    kind: StartGuideKind;
    item: ItemData;
    draftActive?: boolean;
    activeProjectId?: string | null;
    preferredIDE?: MainIDEPreference;
    preferredPromptClient?: PromptClientPreference;
    assistantProjectPath?: string;
    preferredModel?: string | null;
    ideAvailability?: IDEAvailabilityMap;
    conversationUiEnabled?: boolean;
    assistantVisible?: boolean;
    aiPanelMode?: 'general-ai' | 'image-ai' | null;
    onExecutePrompt?: (prompt: string, meta: PromptExecutionMeta) => Promise<boolean | void> | boolean | void;
    onOpenAISettings?: () => void;
    sidebarTrees?: Partial<Record<SidebarTreeTab, SidebarTreeNode[]>>;
    docsItems?: ItemData[];
    prototypes?: ItemData[];
    themes?: ThemeResourceItem[];
    defaultThemeName?: string | null;
    onOpenPrototypeCreateDialog?: (options: PrototypeCreateDialogOpenOptions) => void;
    onRefreshPrototypes?: (preferredName?: string) => Promise<ItemData[]>;
    onUploadResourceFiles?: () => void;
    onCreateResourceCanvasFile?: () => void | Promise<void>;
    onCreateDrawioResourceFile?: () => void | Promise<void>;
    onRefreshThemes?: () => void | Promise<void>;
}) {
    const shouldShowPrototypeActions = kind === 'prototype';
    const shouldShowResourceActions = kind === 'resource';
    const shouldShowTopActions = shouldShowPrototypeActions || shouldShowResourceActions;
    const shouldShowPrototypeCases = kind === 'prototype';
    const shouldShowThemeCases = kind === 'design';
    const [templateCases, setTemplateCases] = useState<TemplateLibraryCardItem[]>([]);
    const [templateCasesLoading, setTemplateCasesLoading] = useState(false);
    const [templateCasesError, setTemplateCasesError] = useState('');
    const [templateImportingId, setTemplateImportingId] = useState('');
    const {
        visibleItems: visibleTemplateCases,
        hasMore: hasMoreTemplateCases,
        loadMoreRef: templateCasesLoadMoreRef,
    } = useProgressiveLibraryItems(templateCases, activeProjectId);
    const [themeImportingId, setThemeImportingId] = useState('');
    const [themePlatform, setThemePlatform] = useState<ThemeCatalogPlatform>('desktop');
    const [themeCatalogs, setThemeCatalogs] = useState<Record<ThemeCatalogPlatform, ThemeCatalogState>>(
        () => createThemeCatalogStatesFromCache(activeProjectId),
    );
    const [themeReloadToken, setThemeReloadToken] = useState(0);
    const [themeProgressiveLoadArmed, setThemeProgressiveLoadArmed] = useState(false);
    const activeThemeCatalog = themeCatalogs[themePlatform].projectId === activeProjectId
        ? themeCatalogs[themePlatform]
        : createEmptyThemeCatalogState();
    const {
        visibleItems: visibleThemeCases,
        hasMore: hasMoreThemeCases,
        loadMoreRef: themeCasesLoadMoreRef,
    } = useProgressiveLibraryItems(
        activeThemeCatalog.items,
        `${activeProjectId || ''}:${themePlatform}`,
        themeProgressiveLoadArmed,
    );
    const selectedThemeName = resolvePrototypeGenerationInitialThemeName(themes, defaultThemeName);
    const prototypeIndexPath = resolvePrototypeIndexFilePath(item);
    const activePrototypePromptCards = useMemo(
        () => kind === 'prototype'
            ? PROTOTYPE_START_PROMPT_CARDS.filter((card) => card.title.trim() && card.prompt.trim())
            : [],
        [kind],
    );
    const activeResourcePromptCards = useMemo(
        () => kind === 'resource'
            ? RESOURCE_START_PROMPT_CARDS.filter((card) => card.title.trim() && card.prompt.trim())
            : [],
        [kind],
    );
    const activeThemePromptCards = useMemo(
        () => kind === 'design'
            ? THEME_START_PROMPT_CARDS.filter((card) => card.title.trim() && card.prompt.trim())
            : [],
        [kind],
    );
    const selectedTheme = useMemo(() => (
        themes?.find((theme) => theme.name === selectedThemeName) || null
    ), [selectedThemeName, themes]);
    const effectiveImageStartParams = useMemo<ImageStartParams>(() => ({
        ...DEFAULT_IMAGE_START_PARAMS,
        themeName: selectedThemeName === NO_PROTOTYPE_THEME_VALUE ? '' : selectedTheme?.name || '',
        disable_prompt_optimization: selectedThemeName !== NO_PROTOTYPE_THEME_VALUE,
        background: 'auto',
    }), [selectedTheme?.name, selectedThemeName]);
    const copyStartCardPrompt = async (prompt: string) => {
        try {
            await copyToClipboard(prompt);
            toast.success('提示词已复制，请交给本地 AI 使用');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '复制提示词失败');
        }
    };
    const handleThemePlatformChange = (platform: ThemeCatalogPlatform) => {
        if (platform === themePlatform) return;
        setThemeProgressiveLoadArmed(false);
        setThemePlatform(platform);
    };
    const copyPrototypeStartCardPrompt = async (card: ThemeStartPromptCard) => {
        const prompt = buildStartGuidePrompt({
            kind: 'prototype',
            scene: 'page',
            prompt: card.prompt,
            settings: undefined,
            finalGuide: 'local-ai-acknowledgement',
        });
        await copyStartCardPrompt(prompt);
    };
    const executePrototypeStartCardPrompt = async (card: ThemeStartPromptCard) => {
        if (!onExecutePrompt) return;
        const prompt = buildStartGuidePrompt({
            kind: 'prototype',
            scene: 'page',
            prompt: card.prompt,
            settings: undefined,
            finalGuide: 'local-ai-acknowledgement',
        });
        const executed = await onExecutePrompt(prompt, {
            scene: 'start-guide-prototype-page',
            targetPath: draftActive ? null : prototypeIndexPath,
            autoSend: false,
        });
        if (executed === false) throw new Error('AI 侧栏未能打开');
    };
    const copyResourceStartCardPrompt = async (card: ResourceStartPromptCard) => {
        const settings = card.scene === 'design'
            ? card.imageSize ? applyResourceStartImageSize(effectiveImageStartParams, card.imageSize) : effectiveImageStartParams
            : {
                ...(card.prdPlanning ? {
                    usePrdPlanning: card.prdPlanning === 'enable',
                } : {}),
            };
        const prompt = buildStartGuidePrompt({
            kind,
            scene: card.scene,
            prompt: card.prompt,
            settings,
            finalGuide: 'local-ai-acknowledgement',
        });
        await copyStartCardPrompt(prompt);
    };
    const executeResourceStartCardPrompt = async (card: ResourceStartPromptCard) => {
        if (!onExecutePrompt) return;
        const settings = card.scene === 'design'
            ? card.imageSize ? applyResourceStartImageSize(effectiveImageStartParams, card.imageSize) : effectiveImageStartParams
            : {
                ...(card.prdPlanning ? { usePrdPlanning: card.prdPlanning === 'enable' } : {}),
            };
        const prompt = buildStartGuidePrompt({
            kind,
            scene: card.scene,
            prompt: card.prompt,
            settings,
            finalGuide: 'local-ai-acknowledgement',
        });
        const executed = await onExecutePrompt(prompt, {
            scene: `start-guide-${kind}-${card.scene}`,
            targetPath: kind === 'prototype' ? prototypeIndexPath : null,
            autoSend: false,
        });
        if (executed === false) throw new Error('AI 侧栏未能打开');
    };
    const copyThemeStartCardPrompt = async (card: ThemeStartPromptCard) => {
        const prompt = buildStartGuidePrompt({
            kind,
            scene: 'design',
            prompt: card.prompt,
            settings: undefined,
            finalGuide: 'local-ai-acknowledgement',
        });
        await copyStartCardPrompt(prompt);
    };
    const executeThemeStartCardPrompt = async (card: ThemeStartPromptCard) => {
        if (!onExecutePrompt) return;
        const prompt = buildStartGuidePrompt({
            kind,
            scene: 'design',
            prompt: card.prompt,
            settings: undefined,
            finalGuide: 'local-ai-acknowledgement',
        });
        const executed = await onExecutePrompt(prompt, {
            scene: 'start-guide-design',
            targetPath: null,
            autoSend: false,
        });
        if (executed === false) throw new Error('AI 侧栏未能打开');
    };

    useEffect(() => {
        let cancelled = false;
        if (!shouldShowPrototypeCases) {
            setTemplateCases([]);
            setTemplateCasesLoading(false);
            setTemplateCasesError('');
            return () => {
                cancelled = true;
            };
        }
        if (!activeProjectId) {
            setTemplateCasesLoading(false);
            return () => {
                cancelled = true;
            };
        }

        const cached = readPlaceholderTemplateLibraryCache();
        if (cached) {
            setTemplateCases(cached.templates);
        }
        if (isPlaceholderTemplateLibraryCacheFresh(cached)) {
            return () => {
                cancelled = true;
            };
        }

        setTemplateCasesLoading(!cached);
        setTemplateCasesError('');
        fetch(withProjectScope('/api/template-library', requireProjectScope(activeProjectId)))
            .then(async (response) => {
                const result = await response.json().catch(() => ({}));
                if (!response.ok || result?.ok === false) {
                    throw new Error(result?.error || '模板库读取失败');
                }
                const templates = normalizeTemplateCases(result?.templates);
                if (cancelled) return;
                writePlaceholderTemplateLibraryCache(templates);
                setTemplateCases(templates);
                setTemplateCasesError('');
            })
            .catch((error: any) => {
                if (cancelled) return;
                if (!cached) {
                    setTemplateCasesError(error?.message || '模板案例加载失败');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setTemplateCasesLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeProjectId, shouldShowPrototypeCases]);

    useEffect(() => {
        setThemeProgressiveLoadArmed(false);
    }, [activeProjectId, shouldShowThemeCases, themePlatform]);

    useEffect(() => {
        if (!shouldShowThemeCases || !activeProjectId) return;

        let cancelled = false;
        const requestedProjectId = activeProjectId;
        const cachedCatalogs = createThemeCatalogStatesFromCache(requestedProjectId);
        setThemeCatalogs(THEME_CATALOG_PLATFORMS.reduce<Record<ThemeCatalogPlatform, ThemeCatalogState>>((states, platform) => {
            const cached = cachedCatalogs[platform];
            states[platform] = {
                ...cached,
                projectId: requestedProjectId,
                loading: !cached.loaded,
                error: '',
            };
            return states;
        }, {
            desktop: createEmptyThemeCatalogState(),
            mobile: createEmptyThemeCatalogState(),
        }));

        THEME_CATALOG_PLATFORMS.forEach((requestedPlatform) => {
            fetch(withProjectScope(`/api/theme-library?platform=${requestedPlatform}`, requireProjectScope(requestedProjectId)))
                .then(async (response) => {
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok || result?.ok === false) {
                        throw new Error(result?.error || '主题模板库读取失败');
                    }
                    const items = normalizeThemeCatalogCases(result?.designSystems);
                    const resultTotal = Number(result?.total);
                    const total = Number.isInteger(resultTotal) && resultTotal >= items.length ? resultTotal : items.length;
                    const nextCatalog = {
                        items,
                        total,
                        stale: result?.stale === true,
                    };
                    writeThemeCatalogCacheEntry(requestedPlatform, nextCatalog);
                    if (cancelled) return;
                    setThemeCatalogs((current) => current[requestedPlatform].projectId === requestedProjectId ? ({
                        ...current,
                        [requestedPlatform]: {
                            projectId: requestedProjectId,
                            ...nextCatalog,
                            loaded: true,
                            loading: false,
                            error: '',
                        },
                    }) : current);
                })
                .catch((error: any) => {
                    if (cancelled) return;
                    setThemeCatalogs((current) => current[requestedPlatform].projectId === requestedProjectId ? ({
                        ...current,
                        [requestedPlatform]: {
                            ...current[requestedPlatform],
                            stale: current[requestedPlatform].loaded,
                            loading: false,
                            error: error?.message || '主题模板加载失败',
                        },
                    }) : current);
                });
        });

        return () => {
            cancelled = true;
        };
    }, [activeProjectId, shouldShowThemeCases, themeReloadToken]);

    const toPromptTemplateItem = (template: TemplateLibraryCardItem): TemplateLibraryPromptItem => ({
        id: template.id,
        title: template.title,
        slug: template.slug || template.id,
        sourcePath: template.sourcePath || '',
        ...(template.sourceUrl ? { sourceUrl: template.sourceUrl } : {}),
        coverPath: template.coverPath || '',
        description: template.description,
        extraDependencies: template.extraDependencies || [],
    });

    const handlePreviewTemplateCase = (template: TemplateLibraryCardItem) => {
        const previewUrl = String(template.previewUrl || '').trim();
        if (!previewUrl) {
            toast.warning('该模板暂不支持在线预览');
            return;
        }
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
    };

    const handleDirectTemplateImport = async (template: TemplateLibraryCardItem) => {
        if (!template.canDirectImport) {
            toast.warning(template.directImportDisabledReason || '该模板暂不支持直接导入');
            return;
        }
        setTemplateImportingId(template.id);
        try {
            const targetPrototypeName = draftActive ? undefined : item.name;
            const response = await fetch(withProjectScope('/api/template-library/import', requireProjectScope(activeProjectId)), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: template.id,
                    ...(targetPrototypeName ? { targetPrototypeName } : {}),
                }),
            });
            const result = await response.json();
            if (!response.ok || !result?.success) {
                throw new Error(result?.error || '直接导入失败');
            }
            toast.success('模板已导入');
            void onRefreshPrototypes?.(String(result?.folderName || result?.name || '').trim());
        } catch (error: any) {
            toast.error(getUserFriendlyUploadErrorMessage(error, '直接导入失败，请稍后重试'));
        } finally {
            setTemplateImportingId('');
        }
    };

    const renderTemplateCaseCard = (template: TemplateLibraryCardItem) => {
        const importing = templateImportingId === template.id;
        const disabledReason = template.directImportDisabledReason || (!template.canDirectImport ? '直接导入不可用' : '');
        const directDisabled = Boolean(disabledReason) || !template.canDirectImport || Boolean(templateImportingId);
        const directImportTooltip = disabledReason
            ? '直接导入不可用，请复制提示词让 AI 完成导入'
            : templateImportingId && !importing ? '已有模板正在导入，请稍候' : '';
        return (
            <TemplateLibraryCard
                key={template.id}
                template={template}
                compact
                importing={importing}
                directImportDisabled={directDisabled}
                directImportTooltip={directImportTooltip}
                onPreview={handlePreviewTemplateCase}
                renderCopyPromptAction={(template) => (
                    <PromptActionButton
                        type="borderless"
                        preferredClient={preferredPromptClient ?? null}
                        preferredIDE={preferredIDE ?? null}
                        ideAvailability={ideAvailability}
                        assistantOpen={assistantVisible === true && aiPanelMode === 'general-ai'}
                        scene="placeholder-template-import"
                        buildPrompt={() => generateTemplateImportPrompt({
                            template: toPromptTemplateItem(template),
                            repo: 'lintendo/Make-Template',
                            targetPrototypeName: draftActive ? undefined : item.name,
                        })}
                        getTargetPath={() => draftActive ? null : prototypeIndexPath}
                        onExecutePrompt={onExecutePrompt}
                        copyLabel="复制提示词"
                        copySuccessMessage="提示词已复制到剪贴板"
                        executeSuccessMessage="已发送到 AI 侧栏"
                        fallbackMessage="AI 执行失败，已回退为复制提示词"
                        disabled={Boolean(templateImportingId)}
                    />
                )}
                onDirectImport={(template) => void handleDirectTemplateImport(template)}
            />
        );
    };

    const handlePreviewThemeCase = (theme: TemplateLibraryCardItem) => {
        const previewUrl = String(theme.previewUrl || '').trim();
        if (!previewUrl) {
            toast.warning('该主题暂不支持在线预览');
            return;
        }
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
    };

    const handleDirectThemeImport = async (theme: TemplateLibraryCardItem) => {
        if (!theme.canDirectImport) {
            toast.warning(theme.directImportDisabledReason || '该主题暂不支持导入');
            return;
        }
        setThemeImportingId(theme.id);
        try {
            const response = await fetch(withProjectScope('/api/theme-library/import', requireProjectScope(activeProjectId)), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ themeId: theme.id, platform: theme.platform }),
            });
            const result = await response.json();
            if (!response.ok || !result?.success) {
                throw new Error(result?.error || '导入失败');
            }
            toast.success('设计系统已导入');
            void onRefreshThemes?.();
        } catch (error: any) {
            toast.error(getUserFriendlyUploadErrorMessage(error, '导入失败，请稍后重试'));
        } finally {
            setThemeImportingId('');
        }
    };

    const renderThemeCaseCard = (theme: TemplateLibraryCardItem) => {
        const importing = themeImportingId === theme.id;
        const disabledReason = theme.directImportDisabledReason || (!theme.canDirectImport ? '导入不可用' : '');
        const directDisabled = Boolean(disabledReason) || !theme.canDirectImport || Boolean(themeImportingId);
        const directImportTooltip = disabledReason
            || (themeImportingId && !importing ? '已有主题正在导入，请稍候' : '');
        return (
            <TemplateLibraryCard
                key={theme.id}
                template={theme}
                compact
                importing={importing}
                directImportDisabled={directDisabled}
                directImportTooltip={directImportTooltip}
                directImportLabel="导入"
                onPreview={handlePreviewThemeCase}
                onDirectImport={(theme) => void handleDirectThemeImport(theme)}
            />
        );
    };

    return (
        <div
            className="ax-start-guide relative h-full w-full overflow-auto bg-[#f7f9fb] px-6 py-10 text-center"
            onScroll={() => {
                if (shouldShowThemeCases) setThemeProgressiveLoadArmed(true);
            }}
        >
            <div className="flex min-h-[76vh] w-full items-center justify-center">
                <div className="flex min-h-full w-full max-w-[960px] flex-col items-center justify-center">
                    {shouldShowTopActions ? (
                        <div className="z-10 mb-5 flex w-full flex-wrap items-center justify-center gap-2 text-[12px] xl:absolute xl:right-6 xl:top-5 xl:mb-0 xl:w-auto xl:justify-end">
                            <TooltipProvider>
                                {shouldShowPrototypeActions ? (
                                    <>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-950"
                                                    onClick={() => onOpenPrototypeCreateDialog?.({ initialTab: 'upload', targetPrototypeName: draftActive ? undefined : item.name })}
                                                >
                                                    <UploadCloud className="h-3.5 w-3.5" />
                                                    导入原型
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">Axhub Make / Axure / V0 / aistudio / Stitch / Figma Make</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex h-7 cursor-default items-center gap-1.5 rounded-md px-2 text-xs text-slate-600">
                                                    <Globe className="h-3.5 w-3.5" />
                                                    导入任意网页
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">使用 Chrome 扩展可以采集任意网页</TooltipContent>
                                        </Tooltip>
                                    </>
                                ) : null}
                                {shouldShowResourceActions ? (
                                    <>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-950"
                                                    onClick={onUploadResourceFiles}
                                                >
                                                    <UploadCloud className="h-3.5 w-3.5" />
                                                    上传资源
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">上传资源文件</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-950"
                                                    onClick={() => { void onCreateResourceCanvasFile?.(); }}
                                                >
                                                    <LayoutDashboard className="h-3.5 w-3.5" />
                                                    画布
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">新建 Excalidraw 画布文件</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-950"
                                                    onClick={() => { void onCreateDrawioResourceFile?.(); }}
                                                >
                                                    <Network className="h-3.5 w-3.5" />
                                                    Drawio 图表
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">新建 Drawio 图表文件</TooltipContent>
                                        </Tooltip>
                                    </>
                                ) : null}
                            </TooltipProvider>
                        </div>
                    ) : null}
                    <div className="w-full">
                        <h1 className="ax-start-guide-title font-semibold leading-tight text-slate-950">
                            我们先从哪里开始呢?
                        </h1>
                    </div>

                    {kind === 'prototype' ? (
                        <div className="w-full">
                            <ThemeStartPromptGrid
                                cards={activePrototypePromptCards}
                                ariaLabel="原型生成能力"
                                disabled={false}
                                copyOnSelect
                                selectPrompt={() => undefined}
                                onCopyPrompt={copyPrototypeStartCardPrompt}
                                onExecutePrompt={executePrototypeStartCardPrompt}
                            />
                        </div>
                    ) : kind === 'resource' ? (
                        <div className="w-full">
                            <ResourceStartPromptGrid
                                cards={activeResourcePromptCards}
                                activeScene="document"
                                disabled={false}
                                copyOnSelect
                                selectPrompt={() => undefined}
                                onCopyPrompt={copyResourceStartCardPrompt}
                                onExecutePrompt={executeResourceStartCardPrompt}
                                onSceneChange={() => undefined}
                                onImageSizeChange={() => undefined}
                                onPrdPlanningChange={() => undefined}
                            />
                        </div>
                    ) : kind === 'design' ? (
                        <div className="w-full">
                            <ThemeStartPromptGrid
                                cards={activeThemePromptCards}
                                disabled={false}
                                copyOnSelect
                                selectPrompt={() => undefined}
                                onCopyPrompt={copyThemeStartCardPrompt}
                                onExecutePrompt={executeThemeStartCardPrompt}
                            />
                        </div>
                    ) : null}

                </div>
            </div>
            {shouldShowPrototypeCases ? (
                <div className="mx-auto w-full max-w-[1080px] pt-8 text-left">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-slate-900">原型案例</h2>
                            {templateCasesLoading ? (
                                <span className="text-[12px] text-slate-500">加载中...</span>
                            ) : null}
                        </div>
                    </div>
                    {templateCases.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {visibleTemplateCases.map(renderTemplateCaseCard)}
                            </div>
                            {hasMoreTemplateCases ? (
                                <div
                                    ref={templateCasesLoadMoreRef}
                                    aria-label="继续加载原型模板"
                                    className="h-1 w-full"
                                />
                            ) : null}
                        </>
                    ) : templateCasesError ? (
                        <div className="rounded-md border border-dashed bg-white/70 p-4 text-center text-[12px] text-slate-500">
                            暂时无法加载原型案例
                        </div>
                    ) : null}
                </div>
            ) : null}
            {shouldShowThemeCases ? (
                <div className="mx-auto w-full max-w-[1080px] pt-8 text-left">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-slate-900">主题模板</h2>
                            {activeThemeCatalog.loading ? (
                                <span className="text-[12px] text-slate-500">加载中...</span>
                            ) : null}
                            {activeThemeCatalog.stale ? (
                                <span className="text-[12px] text-amber-600">正在使用已缓存目录</span>
                            ) : null}
                        </div>
                        <div className="inline-flex rounded-md bg-slate-200/70 p-0.5" aria-label="主题平台分类">
                            <button type="button" className={cn('rounded px-3 py-1 text-[12px] transition', themePlatform === 'desktop' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')} aria-pressed={themePlatform === 'desktop'} onClick={() => handleThemePlatformChange('desktop')}>{formatThemePlatformLabel('PC 端', themeCatalogs.desktop, activeProjectId)}</button>
                            <button type="button" className={cn('rounded px-3 py-1 text-[12px] transition', themePlatform === 'mobile' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')} aria-pressed={themePlatform === 'mobile'} onClick={() => handleThemePlatformChange('mobile')}>{formatThemePlatformLabel('移动端', themeCatalogs.mobile, activeProjectId)}</button>
                        </div>
                    </div>
                    {activeThemeCatalog.items.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {visibleThemeCases.map(renderThemeCaseCard)}
                            </div>
                            {hasMoreThemeCases ? (
                                <div
                                    ref={themeCasesLoadMoreRef}
                                    aria-label="继续加载主题模板"
                                    className="h-1 w-full"
                                />
                            ) : null}
                        </>
                    ) : activeThemeCatalog.error ? (
                        <div className="rounded-md border border-dashed bg-white/70 p-4 text-center text-[12px] text-slate-500">
                            <div>暂时无法加载主题模板</div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-7 px-2 text-xs"
                                onClick={() => setThemeReloadToken((current) => current + 1)}
                            >
                                重试
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

export default function ContentArea({
    containerRef,
    previewIframeRef,
    secondaryPreviewIframeRef,
    onPreviewIframeLoad,
    selectedItem,
    activeTab: _activeTab,
    previewConfig,
    handleChangeMultiPageColumns,
    handleSelectPreviewSinglePreset,
    handleSelectCustomPreview,
    handleActivateMultiPagePreview,
    handleChangeCustomPreviewWidth,
    handleChangeCustomPreviewHeight,
    handleChangePreviewScaleMode,
    handleChangeSplitPreviewWidth,
    handleChangeSplitPreviewHeight,
    handlePreviewContainerSizeChange,
    quickEditActive,
    onRunPrototypePanePromptAction,
    currentDevice,
    displaySize,
    scale,
    elementIframeKey,
    primaryIframeUrl,
    secondaryIframeUrl,
    elementIframeSize: _elementIframeSize,
    setElementIframeSize: _setElementIframeSize,
    viewMode,
    contentMode = 'preview',
    docsItems = [],
    sidebarTrees,
    selectedDoc = null,
    selectedResourceFolder = null,
    selectedTemplate = null,
    selectedPrototypeSpec = null,
    isDarkMode: _isDarkMode = false,
    selectedTheme = null,
    selectedDataTable = null,
    projectRuntimeStatus = null,
    projectRuntimeStatusLoading = false,
    projectAccessDeniedReason = '',
    hasPrototypeItems = true,
    hasDocItems = true,
    onStartMakeProject,
    onCopyStartServerErrorPrompt,
    startServerLoading = false,
    startServerError = '',
    collapsed = false,
    setCollapsed,
    selectedCanvas = null,
    canvasItems = [],
    excalidrawPropertyPanelMode,
    setExcalidrawPropertyPanelMode,
    excalidrawPropertyPanelPosition,
    setExcalidrawPropertyPanelPosition,
    bridgeConnected,
    conversationUiEnabled = true,
    assistantVisible,
    onAddToContext,
    onAnnotationsChange,
    onOpenCanvasInIDE,
    onSelectResourceFolder,
    onSelectResourceFolderItem,
    onOpenResourceFolderInSystem,
    preferredIDE,
    activeProjectId,
    ideAvailability,
    agentAvailability,
    webAgentPanelOpen,
    aiPanelMode,
    externalOpenMenu = true,
    onOpenProjectInIDE,
    onOpenAcpWebAgent,
    onOpenImageAiPanel,
    onExecutePrompt,
    onCloseAiPanel,
    onCloseWebAgentPanel,
    onPreferredIDEChange,
    onOpenAISettings,
    assistantProjectPath,
    preferredPromptClient,
    preferredModel,
    canvasPromptClient,
    canvasModel,
    prototypes,
    themes,
    defaultThemeName,
    onOpenPrototypeCreateDialog,
    prototypeStartDraftActive,
    resourceStartDraftActive,
    themeStartDraftActive,
    onUploadResourceFiles,
    onCreateResourceCanvasFile,
    onCreateDrawioResourceFile,
    onRefreshThemes,
    onRefreshPrototypes,
    agentRunConcurrency,
    onSubmitCanvasAssistantPrompt,
    onAddCanvasScreenshotToAI,
    onAddCanvasImageToAI,
}: ContentAreaProps) {
    const [previewContainerSize, setPreviewContainerSize] = useState({ width: 0, height: 0 });
    const previewContainerSizeRef = useRef(previewContainerSize);
    const [splitPrimaryWidthDraft, setSplitPrimaryWidthDraft] = useState('');
    const [splitPrimaryHeightDraft, setSplitPrimaryHeightDraft] = useState('');
    const [splitSecondaryWidthDraft, setSplitSecondaryWidthDraft] = useState('');
    const [splitSecondaryHeightDraft, setSplitSecondaryHeightDraft] = useState('');
    const [measuredSingleContentSize, setMeasuredSingleContentSize] = useState<PreviewMeasuredContentSize | null>(null);
    const [measuredSplitContentSizes, setMeasuredSplitContentSizes] = useState<MeasuredSplitContentSizes>({
        primary: null,
        secondary: null,
    });
    const iframeMeasurementCleanupRef = useRef<{
        single?: () => void;
        splitPrimary?: () => void;
        splitSecondary?: () => void;
    }>({});
    const [runtimeUnavailablePreviewPath, setRuntimeUnavailablePreviewPath] = useState<string | null>(null);

    const selectedResourceCanvas = selectedDoc?.openMode === 'canvas' ? selectedDoc : null;
    const selectedMarkdownItem = contentMode === 'template'
        ? selectedTemplate
        : contentMode === 'prototype-spec'
            ? selectedPrototypeSpec
            : selectedDoc;
    const markdownEmptyLabel = contentMode === 'template' ? '模板' : contentMode === 'prototype-spec' ? '规格' : '资源';
    const draftPrototypeStartItem = useMemo<ItemData>(() => ({
        name: 'prototype-start-draft',
        displayName: '新原型草稿',
        jsUrl: '',
        specUrl: '',
        previewDisabled: true,
    }), []);
    const draftResourceStartItem = useMemo<ItemData>(() => ({
        name: 'resource-start-draft',
        displayName: '新资源草稿',
        jsUrl: '',
        specUrl: '',
        previewDisabled: true,
    }), []);
    const draftThemeStartItem = useMemo<ItemData>(() => ({
        name: 'theme-start-draft',
        displayName: '新设计草稿',
        jsUrl: '',
        specUrl: '',
        previewDisabled: true,
    }), []);
    const selectedStandaloneCanvasFilePath = selectedCanvas
        ? resolveCanvasFilePath(selectedCanvas, selectedCanvas.name)
        : '';
    const selectedResourceCanvasFilePath = selectedResourceCanvas
        ? resolveCanvasFilePath(selectedResourceCanvas, selectedResourceCanvas.name)
        : '';
    const selectedPrototypeRuntimeUnavailable = viewMode === 'demo'
        && Boolean(selectedItem)
        && selectedItem?.previewDisabled !== true
        && runtimeUnavailablePathMatchesResource(runtimeUnavailablePreviewPath, 'prototypes', selectedItem?.name);
    const selectedThemeRuntimeUnavailable = contentMode === 'theme'
        && Boolean(selectedTheme)
        && Boolean(String(selectedTheme ? selectedTheme.clientUrl || selectedTheme.previewUrl : '').trim())
        && runtimeUnavailablePathMatchesResource(runtimeUnavailablePreviewPath, 'themes', selectedTheme?.name);
    const selectedPrototypeClientUnavailable = selectedPrototypeRuntimeUnavailable || (
        viewMode === 'demo'
        && Boolean(selectedItem)
        && selectedItem?.previewDisabled !== true
        && projectRuntimeStatus?.makeClient === true
        && projectRuntimeStatus.running !== true
    );
    const selectedThemeClientUnavailable = selectedThemeRuntimeUnavailable || (
        contentMode === 'theme'
        && Boolean(selectedTheme)
        && Boolean(String(selectedTheme ? selectedTheme.clientUrl || selectedTheme.previewUrl : '').trim())
        && projectRuntimeStatus?.makeClient === true
        && projectRuntimeStatus.running !== true
    );

    useEffect(() => {
        setRuntimeUnavailablePreviewPath(null);
    }, [contentMode, primaryIframeUrl, secondaryIframeUrl, selectedItem?.name, selectedTheme?.name, viewMode]);

    useEffect(() => {
        if (projectRuntimeStatus?.running === true) {
            setRuntimeUnavailablePreviewPath(null);
        }
    }, [projectRuntimeStatus?.running]);

    useEffect(() => {
        const handleRuntimeUnavailableMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) {
                return;
            }
            const payload = event.data;
            if (!payload || typeof payload !== 'object' || payload.type !== 'axhub:runtime-unavailable') {
                return;
            }
            const requestPath = typeof payload.requestPath === 'string' ? payload.requestPath : '';
            if (requestPath) {
                setRuntimeUnavailablePreviewPath(requestPath);
            }
        };
        window.addEventListener('message', handleRuntimeUnavailableMessage);
        return () => {
            window.removeEventListener('message', handleRuntimeUnavailableMessage);
        };
    }, []);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) {
            return;
        }

        const updateSize = () => {
            const previous = previewContainerSizeRef.current;
            const next = resolveStablePreviewContainerSize({
                previous,
                clientWidth: node.clientWidth,
                clientHeight: node.clientHeight,
                horizontalInset: 0,
                verticalInset: 32,
            });
            previewContainerSizeRef.current = next;
            setPreviewContainerSize(next);
            if (next.width !== previous.width) {
                handlePreviewContainerSizeChange(next.width);
            }
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(node);
        const animationFrameId = window.requestAnimationFrame(updateSize);
        window.addEventListener('resize', updateSize);
        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', updateSize);
        };
    }, [
        assistantVisible,
        containerRef,
        handlePreviewContainerSizeChange,
        previewConfig.previewMode,
        previewConfig.singlePreset,
    ]);

    const previewLayout = useMemo(() => resolvePreviewLayout({
        config: previewConfig,
        containerWidth: previewContainerSize.width,
        containerHeight: previewContainerSize.height,
        actualSingleContentSize: measuredSingleContentSize,
        actualSplitContentSizes: measuredSplitContentSizes,
        deviceShellInset: PREVIEW_DEVICE_SHELL_INSET,
        singleReservedWidth: SCALED_PREVIEW_HORIZONTAL_GAP * 2,
        splitReservedHeight: SPLIT_PREVIEW_HEADER_HEIGHT,
        splitReservedWidth: SPLIT_PREVIEW_HORIZONTAL_INSET,
    }), [
        measuredSingleContentSize,
        measuredSplitContentSizes,
        previewConfig,
        previewContainerSize.height,
        previewContainerSize.width,
    ]);
    useEffect(() => {
        setSplitPrimaryWidthDraft(String(previewConfig.splitWidths.primary));
        setSplitPrimaryHeightDraft(String(previewConfig.splitHeights.primary));
        setSplitSecondaryWidthDraft(String(previewConfig.splitWidths.secondary));
        setSplitSecondaryHeightDraft(String(previewConfig.splitHeights.secondary));
    }, [
        previewConfig.splitHeights.primary,
        previewConfig.splitHeights.secondary,
        previewConfig.splitWidths.primary,
        previewConfig.splitWidths.secondary,
    ]);

    useEffect(() => {
        return () => {
            Object.values(iframeMeasurementCleanupRef.current).forEach((cleanup) => cleanup?.());
        };
    }, []);

    useEffect(() => {
        if (previewConfig.previewMode === 'split') {
            setMeasuredSingleContentSize(null);
            iframeMeasurementCleanupRef.current.single?.();
            iframeMeasurementCleanupRef.current.single = undefined;
            return;
        }

        setMeasuredSplitContentSizes({
            primary: null,
            secondary: null,
        });
        iframeMeasurementCleanupRef.current.splitPrimary?.();
        iframeMeasurementCleanupRef.current.splitPrimary = undefined;
        iframeMeasurementCleanupRef.current.splitSecondary?.();
        iframeMeasurementCleanupRef.current.splitSecondary = undefined;
    }, [previewConfig.previewMode]);

    const readIframeContentSize = (iframe: HTMLIFrameElement | null): PreviewMeasuredContentSize | null => {
        try {
            const doc = iframe?.contentDocument;
            if (!doc) {
                return null;
            }

            const html = doc.documentElement;
            const body = doc.body;
            const width = Math.max(
                iframe?.clientWidth || 0,
                html?.scrollWidth || 0,
                html?.offsetWidth || 0,
                html?.clientWidth || 0,
                body?.scrollWidth || 0,
                body?.offsetWidth || 0,
                body?.clientWidth || 0,
            );
            const height = Math.max(
                iframe?.clientHeight || 0,
                html?.scrollHeight || 0,
                html?.offsetHeight || 0,
                html?.clientHeight || 0,
                body?.scrollHeight || 0,
                body?.offsetHeight || 0,
                body?.clientHeight || 0,
            );

            return {
                width: Math.max(1, Math.round(width)),
                height: Math.max(1, Math.round(height)),
            };
        } catch {
            return null;
        }
    };

    const attachIframeMeasurement = (
        pane: 'single' | 'splitPrimary' | 'splitSecondary',
        iframe: HTMLIFrameElement | null,
        onMeasure: (size: PreviewMeasuredContentSize) => void,
    ) => {
        iframeMeasurementCleanupRef.current[pane]?.();
        iframeMeasurementCleanupRef.current[pane] = undefined;

        if (!iframe) {
            return;
        }

        const measure = () => {
            const nextSize = readIframeContentSize(iframe);
            if (!nextSize) {
                return;
            }
            onMeasure(nextSize);
        };

        const timeoutIds = [
            window.setTimeout(measure, 0),
            window.setTimeout(measure, 120),
            window.setTimeout(measure, 360),
            window.setTimeout(measure, 900),
        ];
        const cleanupTasks: Array<() => void> = [];

        try {
            const doc = iframe.contentDocument;
            if (doc?.documentElement && typeof ResizeObserver !== 'undefined') {
                const observer = new ResizeObserver(measure);
                observer.observe(doc.documentElement);
                if (doc.body) {
                    observer.observe(doc.body);
                }
                cleanupTasks.push(() => observer.disconnect());
            }
        } catch {
            // Ignore cross-origin or observer setup failures and keep timeout fallback.
        }

        try {
            const frameWindow = iframe.contentWindow;
            if (frameWindow) {
                frameWindow.addEventListener('resize', measure);
                cleanupTasks.push(() => {
                    try {
                        frameWindow.removeEventListener('resize', measure);
                    } catch {
                        // Ignore cleanup failures when a preview navigates cross-origin.
                    }
                });
            }
        } catch {
            // Keep the timeout measurement fallback; browser guidance belongs to action failures.
        }

        measure();
        iframeMeasurementCleanupRef.current[pane] = () => {
            timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
            cleanupTasks.forEach((task) => task());
        };
    };

    const handleSingleIframeLoad = () => {
        injectPreviewIframeScrollbarStyle(previewIframeRef.current);
        attachIframeMeasurement('single', previewIframeRef.current, (size) => {
            setMeasuredSingleContentSize((previous) => (
                previous?.width === size.width && previous?.height === size.height ? previous : size
            ));
        });
        onPreviewIframeLoad?.(previewIframeRef.current);
    };

    const handleSplitPrimaryIframeLoad = () => {
        injectPreviewIframeScrollbarStyle(previewIframeRef.current);
        attachIframeMeasurement('splitPrimary', previewIframeRef.current, (size) => {
            setMeasuredSplitContentSizes((previous) => (
                previous.primary?.width === size.width && previous.primary?.height === size.height
                    ? previous
                    : { ...previous, primary: size }
            ));
        });
        onPreviewIframeLoad?.(previewIframeRef.current);
    };

    const handleSplitSecondaryIframeLoad = () => {
        injectPreviewIframeScrollbarStyle(secondaryPreviewIframeRef.current);
        attachIframeMeasurement('splitSecondary', secondaryPreviewIframeRef.current, (size) => {
            setMeasuredSplitContentSizes((previous) => (
                previous.secondary?.width === size.width && previous.secondary?.height === size.height
                    ? previous
                    : { ...previous, secondary: size }
            ));
        });
        onPreviewIframeLoad?.(secondaryPreviewIframeRef.current);
    };

    const handleRawPreviewIframeLoad = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
        onPreviewIframeLoad?.(event.currentTarget);
    };

    const commitDimensionDraft = (draft: string, onCommit: (value: number) => void) => {
        const parsed = Number.parseInt(draft.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            onCommit(parsed);
        }
    };

    const renderSplitPromptActions = (pane: 'primary' | 'secondary') => (
        quickEditActive && onRunPrototypePanePromptAction ? (
            <div className="ml-auto flex items-center gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
                    title="复制本视窗提示词"
                    aria-label="复制本视窗提示词"
                    onClick={() => { void onRunPrototypePanePromptAction(pane, 'copy-prompt'); }}
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
                    title="执行本视窗批注"
                    aria-label="执行本视窗批注"
                    onClick={() => { void onRunPrototypePanePromptAction(pane, 'send-to-agent'); }}
                >
                    <Play className="h-3.5 w-3.5" />
                </Button>
            </div>
        ) : null
    );

    const splitTitleControl = (
        icon: React.ReactNode,
        label: string,
        actions: React.ReactNode,
        widthDraft: string,
        heightDraft: string,
        setWidthDraft: (value: string) => void,
        setHeightDraft: (value: string) => void,
        onCommitWidth: (value: number) => void,
        onCommitHeight: (value: number) => void,
    ) => (
        <div className="flex min-h-[32px] items-center justify-start gap-2.5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
                <span>{label}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <Input
                    value={widthDraft}
                    inputMode="numeric"
                    onChange={(event) => setWidthDraft(event.target.value)}
                    onBlur={() => commitDimensionDraft(widthDraft, onCommitWidth)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            commitDimensionDraft(widthDraft, onCommitWidth);
                        }
                    }}
                    className="h-6 w-14 rounded-md px-2 text-[11px]"
                />
                <span className="text-[11px] text-muted-foreground">×</span>
                <Input
                    value={heightDraft}
                    inputMode="numeric"
                    onChange={(event) => setHeightDraft(event.target.value)}
                    onBlur={() => commitDimensionDraft(heightDraft, onCommitHeight)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            commitDimensionDraft(heightDraft, onCommitHeight);
                        }
                    }}
                    className="h-6 w-14 rounded-md px-2 text-[11px]"
                />
            </div>
            {actions}
        </div>
    );

    const renderScaledIframe = (
        iframeRef: React.Ref<HTMLIFrameElement> | null,
        key: React.Key,
        src: string,
        logicalWidth: number,
        iframeHeight: number,
        iframeScale: number,
        title: string,
        onLoad?: () => void,
    ) => (
        <iframe
            ref={iframeRef}
            key={key}
            src={src}
            allow="clipboard-write"
            onLoad={onLoad}
            className="border-none block origin-top-left"
            title={title}
            style={{
                width: logicalWidth,
                height: iframeHeight,
                transform: `scale(${iframeScale})`,
                transformOrigin: 'top left',
            }}
        />
    );

    if (projectAccessDeniedReason) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-muted/20 px-6 text-center">
                <div className="max-w-[420px]">
                    <Rocket className="mx-auto mb-4 h-14 w-14 text-muted-foreground opacity-20" />
                    <div className="text-base font-medium text-foreground">当前项目未开启局域网访问</div>
                    <div className="mt-2 text-[12px] leading-5 text-muted-foreground">{projectAccessDeniedReason}</div>
                </div>
            </div>
        );
    }

    if (contentMode === 'doc' || contentMode === 'template' || contentMode === 'prototype-spec') {
        if (contentMode === 'doc' && resourceStartDraftActive && !selectedDoc && !selectedResourceFolder) {
            return (
                <StartGuide
                    kind="resource"
                    item={draftResourceStartItem}
                    draftActive={resourceStartDraftActive && !selectedDoc}
                    activeProjectId={activeProjectId}
                    preferredIDE={preferredIDE}
                    preferredPromptClient={preferredPromptClient}
                    preferredModel={preferredModel}
                    ideAvailability={ideAvailability}
                    conversationUiEnabled={conversationUiEnabled}
                    assistantVisible={assistantVisible}
                    aiPanelMode={aiPanelMode}
                    assistantProjectPath={assistantProjectPath}
                    onExecutePrompt={onExecutePrompt}
                    themes={themes}
                    sidebarTrees={sidebarTrees}
                    docsItems={docsItems}
                    prototypes={prototypes}
                    defaultThemeName={defaultThemeName}
                    onUploadResourceFiles={onUploadResourceFiles}
                    onCreateResourceCanvasFile={onCreateResourceCanvasFile}
                    onCreateDrawioResourceFile={onCreateDrawioResourceFile}
                    onOpenAISettings={onOpenAISettings}
                />
            );
        }

        if (contentMode === 'doc' && selectedResourceFolder) {
            return (
                <ResourceFolderPreview
                    folder={selectedResourceFolder}
                    items={docsItems}
                    onSelectFolder={onSelectResourceFolder}
                    onSelectItem={onSelectResourceFolderItem}
                />
            );
        }

        if (!selectedMarkdownItem) {
            if (contentMode === 'doc' && !hasDocItems) {
                return (
                    <ProjectContentEmptyState
                        kind="doc"
                        projectRuntimeStatus={projectRuntimeStatus}
                        projectRuntimeStatusLoading={projectRuntimeStatusLoading}
                        onStartMakeProject={onStartMakeProject}
                        onCopyStartServerErrorPrompt={onCopyStartServerErrorPrompt}
                        startServerLoading={startServerLoading}
                        startServerError={startServerError}
                    />
                );
            }
            return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-[12px]">
                    {`请选择${markdownEmptyLabel}`}
                </div>
            );
        }

        const selectedName = selectedMarkdownItem.name || '';
        const candidateFields = [
            selectedName,
            selectedMarkdownItem.specUrl,
            selectedMarkdownItem.previewUrl,
            selectedMarkdownItem.filePath,
            selectedMarkdownItem.absoluteFilePath,
        ];
        const markdownIframeUrl = resolveMarkdownPreviewIframeUrl(
            selectedMarkdownItem,
            contentMode === 'template' ? 'template' : 'doc',
        );
        const iframePreviewablePattern = /\.(md|html?|txt|csv|json|ya?ml|xml|svg)([?#/]|$)/i;
        const imagePattern = /\.(png|jpe?g|gif|webp|bmp|ico|avif)([?#/]|$)/i;
        const canPreviewInIframe = markdownIframeUrl.includes('/spec-template.html') || candidateFields.some(
            (field) => field && iframePreviewablePattern.test(String(field)),
        );
        const isImageFile = candidateFields.some(
            (field) => field && imagePattern.test(String(field)),
        );

        if (isImageFile) {
            const imageUrl = selectedMarkdownItem.specUrl || selectedMarkdownItem.previewUrl || '';
            return (
                <div className="flex flex-col h-full bg-background">
                    <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground shrink-0">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span className="truncate">{selectedMarkdownItem.displayName || selectedName}</span>
                    </div>
                    <div
                        className="flex-1 min-h-0 flex items-center justify-center p-6 overflow-auto"
                        style={{
                            backgroundImage: 'linear-gradient(45deg, hsl(var(--muted) / 0.4) 25%, transparent 25%, transparent 75%, hsl(var(--muted) / 0.4) 75%), linear-gradient(45deg, hsl(var(--muted) / 0.4) 25%, transparent 25%, transparent 75%, hsl(var(--muted) / 0.4) 75%)',
                            backgroundSize: '16px 16px',
                            backgroundPosition: '0 0, 8px 8px',
                        }}
                    >
                        <img
                            key={`${elementIframeKey}-${selectedName}`}
                            src={imageUrl}
                            alt={selectedMarkdownItem.displayName || selectedName}
                            className="max-w-full max-h-full object-contain rounded shadow-sm"
                            draggable={false}
                        />
                    </div>
                </div>
            );
        }

        if (!canPreviewInIframe) {
            const ext = selectedName.includes('.') ? selectedName.split('.').pop()?.toLowerCase() || '' : '';
            const fileSize = selectedMarkdownItem.fileSize;
            const formattedSize = typeof fileSize === 'number'
                ? fileSize < 1024 ? `${fileSize} B`
                : fileSize < 1048576 ? `${(fileSize / 1024).toFixed(1)} KB`
                : `${(fileSize / 1048576).toFixed(1)} MB`
                : null;

            return (
                <div className="flex items-center justify-center h-full bg-background">
                    <div className="flex flex-col items-center gap-4 text-center max-w-xs">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/60">
                            <FileIcon className="h-10 w-10 text-muted-foreground/60" />
                        </div>
                        <div className="space-y-1.5">
                            <div className="text-sm font-medium text-foreground truncate max-w-[240px]" title={selectedName}>
                                {selectedMarkdownItem.displayName || selectedName}
                            </div>
                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                {ext ? <span className="uppercase font-mono bg-muted/80 px-1.5 py-0.5 rounded">.{ext}</span> : null}
                                {formattedSize ? <span>{formattedSize}</span> : null}
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                                fetch(withProjectScope('/api/docs/open-system', requireProjectScope(activeProjectId)), {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        docName: selectedName,
                                        type: contentMode === 'template' ? 'templates' : 'docs',
                                    }),
                                }).catch(() => {});
                            }}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            用系统应用打开
                        </Button>
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full min-h-0 bg-background">
                <iframe
                    ref={previewIframeRef}
                    key={`${elementIframeKey}-${selectedMarkdownItem.name}`}
                    src={markdownIframeUrl}
                    onLoad={handleRawPreviewIframeLoad}
                    className="w-full h-full border-none block bg-background"
                    title={selectedMarkdownItem.displayName}
                />
            </div>
        );
    }

    if (contentMode === 'theme') {
        if (themeStartDraftActive && !selectedTheme) {
            return (
                <StartGuide
                    kind="design"
                    item={draftThemeStartItem}
                    draftActive={themeStartDraftActive && !selectedTheme}
                    activeProjectId={activeProjectId}
                    preferredIDE={preferredIDE}
                    preferredPromptClient={preferredPromptClient}
                    preferredModel={preferredModel}
                    ideAvailability={ideAvailability}
                    conversationUiEnabled={conversationUiEnabled}
                    assistantVisible={assistantVisible}
                    aiPanelMode={aiPanelMode}
                    assistantProjectPath={assistantProjectPath}
                    onExecutePrompt={onExecutePrompt}
                    themes={themes}
                    sidebarTrees={sidebarTrees}
                    docsItems={docsItems}
                    prototypes={prototypes}
                    defaultThemeName={defaultThemeName}
                    onRefreshThemes={onRefreshThemes}
                    onOpenAISettings={onOpenAISettings}
                />
            );
        }

        if (!selectedTheme) {
            return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-[12px]">
                    请选择设计
                </div>
            );
        }

        const themePreviewUrl = primaryIframeUrl;
        if (!themePreviewUrl) {
            return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-[12px]">
                    当前设计未声明演示链接
                </div>
            );
        }

        return (
            <div className="h-full min-h-0 bg-muted/20">
                {selectedThemeClientUnavailable ? (
                    <ClientPreviewUnavailableState
                        contentKind="theme"
                        clientUrl={themePreviewUrl}
                        projectRuntimeStatusLoading={projectRuntimeStatusLoading}
                        onStartMakeProject={onStartMakeProject}
                        onCopyStartServerErrorPrompt={onCopyStartServerErrorPrompt}
                        startServerLoading={startServerLoading}
                        startServerError={startServerError}
                    />
                ) : (
                    <iframe
                        ref={previewIframeRef}
                        key={elementIframeKey}
                        src={themePreviewUrl}
                        allow="clipboard-write"
                        onLoad={handleRawPreviewIframeLoad}
                        className="w-full h-full border-none"
                        title={selectedTheme.displayName}
                    />
                )}
            </div>
        );
    }

    if (contentMode === 'data') {
        if (!selectedDataTable) {
            return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-[12px]">
                    请选择数据表
                </div>
            );
        }

        return (
            <div className="h-full min-h-0 overflow-hidden bg-background p-3">
                <HomeDataTable
                    projectId={activeProjectId || ''}
                    fileName={selectedDataTable.fileName}
                    tableName={selectedDataTable.tableName}
                />
            </div>
        );
    }

    if (contentMode === 'canvas') {
        const currentCanvasItem = selectedResourceCanvas || selectedCanvas;
        const currentCanvasFilePath = selectedResourceCanvas
            ? selectedResourceCanvasFilePath
            : selectedStandaloneCanvasFilePath;

        if (!currentCanvasItem) {
            return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-[12px]">
                    请从左侧选择或新建一个画布
                </div>
            );
        }

        return (
            <div className="h-full min-h-0 relative bg-background">
                <CanvasErrorBoundary resetKey={currentCanvasItem.name}>
                    <React.Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-[12px]">加载中...</div>}>
                        <ExcalidrawCanvas
                            canvasName={currentCanvasItem.name}
                            canvasFilePath={currentCanvasFilePath}
                            activeProjectId={activeProjectId || ''}
                            isDarkMode={_isDarkMode}
                            collapsed={collapsed}
                            setCollapsed={setCollapsed}
                            propertyPanelMode={excalidrawPropertyPanelMode}
                            onPropertyPanelModeChange={setExcalidrawPropertyPanelMode}
                            propertyPanelPosition={excalidrawPropertyPanelPosition}
                            onPropertyPanelPositionChange={setExcalidrawPropertyPanelPosition}
                            bridgeConnected={bridgeConnected}
                            onAddToContext={onAddToContext}
                            onAddScreenshotToAI={onAddCanvasScreenshotToAI}
                            onAddImageToAI={onAddCanvasImageToAI}
                            onAnnotationsChange={onAnnotationsChange}
                            onOpenCanvasInIDE={onOpenCanvasInIDE}
                            preferredIDE={preferredIDE}
                            ideAvailability={ideAvailability}
                            agentAvailability={agentAvailability}
                            onOpenProjectInIDE={onOpenProjectInIDE}
                            onOpenAcpWebAgent={onOpenAcpWebAgent}
                            webAgentPanelOpen={webAgentPanelOpen}
                            aiPanelMode={aiPanelMode}
                            onOpenImageAiPanel={onOpenImageAiPanel}
                            onCloseAiPanel={onCloseAiPanel}
                            onCloseWebAgentPanel={onCloseWebAgentPanel}
                            onPreferredIDEChange={onPreferredIDEChange}
                            onOpenAISettings={onOpenAISettings}
                            preferredPromptClient={canvasPromptClient}
                            preferredModel={canvasModel}
                            prototypes={prototypes}
                            themes={themes}
                            projectResourceTrees={{
                                prototypes: sidebarTrees?.prototypes || [],
                                docs: sidebarTrees?.docs || [],
                                themes: sidebarTrees?.themes || [],
                            }}
                            projectResourceItems={{
                                prototypes: prototypes || [],
                                docs: docsItems || [],
                                themes: themes || [],
                            }}
                            defaultThemeName={defaultThemeName}
                            onRefreshPrototypes={onRefreshPrototypes}
                            agentRunConcurrency={agentRunConcurrency}
                            onSubmitCanvasAssistantPrompt={onSubmitCanvasAssistantPrompt}
                            overlayChildren={<CanvasFloatingToolbar />}
                        />
                    </React.Suspense>
                </CanvasErrorBoundary>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative h-full min-h-0 min-w-0 flex items-start justify-center bg-muted/20",
                previewLayout.mode === 'split' || previewLayout.mode === 'multi-page' ? 'overflow-hidden' : 'overflow-auto',
            )}
        >
            {selectedItem ? (
                selectedItem.placeholder === true && viewMode === 'demo' ? (
                    <StartGuide
                        kind="prototype"
                        item={selectedItem}
                        activeProjectId={activeProjectId}
                        preferredIDE={preferredIDE}
                        preferredPromptClient={preferredPromptClient}
                        preferredModel={preferredModel}
                        ideAvailability={ideAvailability}
                        conversationUiEnabled={conversationUiEnabled}
                        assistantVisible={assistantVisible}
                        aiPanelMode={aiPanelMode}
                        assistantProjectPath={assistantProjectPath}
                        onExecutePrompt={onExecutePrompt}
                        themes={themes}
                        sidebarTrees={sidebarTrees}
                        docsItems={docsItems}
                        prototypes={prototypes}
                        defaultThemeName={defaultThemeName}
                        onOpenPrototypeCreateDialog={onOpenPrototypeCreateDialog}
                        onRefreshPrototypes={onRefreshPrototypes}
                        onOpenAISettings={onOpenAISettings}
                    />
                ) : viewMode === 'canvas' ? (
                    <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-muted-foreground">
                        画布现在作为资源文件管理，请在资源中打开 .excalidraw 文件
                    </div>
                ) : (
                    selectedItem.previewDisabled ? (
                        <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-muted-foreground">
                            <div>
                                <Rocket className="mx-auto mb-3 h-10 w-10 opacity-20" />
                                <div>{selectedItem.clientUrl ? '当前原型尚未生成可运行页面' : '当前原型缺少 clientUrl，无法打开预览'}</div>
                            </div>
                        </div>
                    ) : selectedPrototypeClientUnavailable ? (
                        <PrototypeClientUnavailableState
                            clientUrl={selectedItem.clientUrl || selectedItem.previewUrl}
                            projectRuntimeStatusLoading={projectRuntimeStatusLoading}
                            onStartMakeProject={onStartMakeProject}
                            onCopyStartServerErrorPrompt={onCopyStartServerErrorPrompt}
                            startServerLoading={startServerLoading}
                            startServerError={startServerError}
                        />
                    ) : previewLayout.mode === 'multi-page' ? (
                        <MultiPagePreviewCanvas
                            selectedItem={selectedItem}
                            previewConfig={previewConfig}
                            layout={previewLayout.multiPage}
                            previewUrl={primaryIframeUrl}
                            iframeKey={elementIframeKey}
                            previewIframeRef={previewIframeRef}
                            onPreviewIframeLoad={onPreviewIframeLoad}
                            handleChangeMultiPageColumns={handleChangeMultiPageColumns}
                            handleSelectPreviewSinglePreset={handleSelectPreviewSinglePreset}
                            handleSelectCustomPreview={handleSelectCustomPreview}
                            handleActivateMultiPagePreview={handleActivateMultiPagePreview}
                            handleChangeCustomPreviewWidth={handleChangeCustomPreviewWidth}
                            handleChangeCustomPreviewHeight={handleChangeCustomPreviewHeight}
                        />
                    ) : previewLayout.mode === 'split' ? (
                        <div className="flex h-full w-full items-start justify-center gap-3 px-4 pt-4">
                            <div className="flex flex-col items-stretch gap-2 self-start">
                                {splitTitleControl(
                                    <Monitor />,
                                    'PC',
                                    renderSplitPromptActions('primary'),
                                    splitPrimaryWidthDraft,
                                    splitPrimaryHeightDraft,
                                    setSplitPrimaryWidthDraft,
                                    setSplitPrimaryHeightDraft,
                                    (value) => handleChangeSplitPreviewWidth('primary', value),
                                    (value) => handleChangeSplitPreviewHeight('primary', value),
                                )}
                                <div
                                    className="overflow-hidden rounded-[18px] border bg-background shadow-sm"
                                    style={{
                                        width: previewLayout.split.primary.viewportWidth,
                                        height: previewLayout.split.primary.viewportHeight,
                                    }}
                                >
                                    {renderScaledIframe(
                                        previewIframeRef,
                                        elementIframeKey,
                                        primaryIframeUrl,
                                        previewLayout.split.primary.logicalWidth,
                                        previewLayout.split.primary.iframeHeight,
                                        previewLayout.split.primary.scale,
                                        `${selectedItem.displayName} PC`,
                                        handleSplitPrimaryIframeLoad,
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col items-stretch gap-2 self-start">
                                {splitTitleControl(
                                    <Smartphone />,
                                    '手机',
                                    renderSplitPromptActions('secondary'),
                                    splitSecondaryWidthDraft,
                                    splitSecondaryHeightDraft,
                                    setSplitSecondaryWidthDraft,
                                    setSplitSecondaryHeightDraft,
                                    (value) => handleChangeSplitPreviewWidth('secondary', value),
                                    (value) => handleChangeSplitPreviewHeight('secondary', value),
                                )}
                                <div
                                    className="overflow-hidden rounded-[18px] border bg-background shadow-sm"
                                    style={{
                                        width: previewLayout.split.secondary.viewportWidth,
                                        height: previewLayout.split.secondary.viewportHeight,
                                    }}
                                >
                                    {renderScaledIframe(
                                        secondaryPreviewIframeRef,
                                        `${elementIframeKey}-split-secondary`,
                                        secondaryIframeUrl,
                                        previewLayout.split.secondary.logicalWidth,
                                        previewLayout.split.secondary.iframeHeight,
                                        previewLayout.split.secondary.scale,
                                        `${selectedItem.displayName} 手机`,
                                        handleSplitSecondaryIframeLoad,
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : previewLayout.single.kind === 'desktop' ? (
                        <iframe
                            ref={previewIframeRef}
                            key={elementIframeKey}
                            src={primaryIframeUrl}
                            allow="clipboard-write"
                            onLoad={handleRawPreviewIframeLoad}
                            className="w-full h-full border-none block"
                            title={selectedItem.displayName}
                        />
                    ) : previewLayout.single.kind === 'custom' ? (
                        <div className="flex h-full w-full items-start justify-center px-2 pt-4">
                            <div
                                className="overflow-hidden border bg-background shadow-sm"
                                style={{
                                    width: previewLayout.single.viewportWidth,
                                    height: previewLayout.single.viewportHeight,
                                }}
                            >
                                {renderScaledIframe(
                                    previewIframeRef,
                                    elementIframeKey,
                                    primaryIframeUrl,
                                    previewLayout.single.logicalWidth,
                                    previewLayout.single.iframeHeight,
                                    previewLayout.single.scale,
                                    selectedItem.displayName,
                                    handleSingleIframeLoad,
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full w-full items-start justify-center pt-4">
                            <DeviceShell
                                width={previewLayout.single.viewportWidth}
                                height={previewLayout.single.viewportHeight}
                                scale={1}
                            >
                                {renderScaledIframe(
                                    previewIframeRef,
                                    elementIframeKey,
                                    primaryIframeUrl,
                                    previewLayout.single.logicalWidth,
                                    previewLayout.single.iframeHeight,
                                    previewLayout.single.scale,
                                    selectedItem.displayName,
                                    handleSingleIframeLoad,
                                )}
                            </DeviceShell>
                        </div>
                    )
                )
            ) : prototypeStartDraftActive ? (
                <StartGuide
                    kind="prototype"
                    item={draftPrototypeStartItem}
                    draftActive={prototypeStartDraftActive && !selectedItem}
                    activeProjectId={activeProjectId}
                    preferredIDE={preferredIDE}
                    preferredPromptClient={preferredPromptClient}
                    preferredModel={preferredModel}
                    ideAvailability={ideAvailability}
                    conversationUiEnabled={conversationUiEnabled}
                    assistantVisible={assistantVisible}
                    aiPanelMode={aiPanelMode}
                    assistantProjectPath={assistantProjectPath}
                    onExecutePrompt={onExecutePrompt}
                    themes={themes}
                    sidebarTrees={sidebarTrees}
                    docsItems={docsItems}
                    prototypes={prototypes}
                    defaultThemeName={defaultThemeName}
                    onOpenPrototypeCreateDialog={onOpenPrototypeCreateDialog}
                    onRefreshPrototypes={onRefreshPrototypes}
                    onOpenAISettings={onOpenAISettings}
                />
            ) : (
                !hasPrototypeItems ? (
                    <ProjectContentEmptyState
                        kind="prototype"
                        projectRuntimeStatus={projectRuntimeStatus}
                        projectRuntimeStatusLoading={projectRuntimeStatusLoading}
                        onStartMakeProject={onStartMakeProject}
                        onCopyStartServerErrorPrompt={onCopyStartServerErrorPrompt}
                        startServerLoading={startServerLoading}
                        startServerError={startServerError}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                            <Rocket className="mx-auto mb-4 h-16 w-16 opacity-20" />
                            <div className="text-base">请从左侧选择一个原型</div>
                        </div>
                    </div>
                )
            )}
        </div>
    );
}
