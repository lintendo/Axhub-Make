import React, { useEffect, useRef, useState } from 'react';
import { ClaudeCode, Codex, Cursor, DeepSeek, Grok, OpenCode } from '@lobehub/icons';
import { QRCode } from 'antd';
import { AlertTriangle, CheckCircle2, Copy, Loader2, Play, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { codeBuddyIconUrl, qoderIconUrl } from '../assets/brand-icons/brandIconUrls';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabelWithHint } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiService, resolveMakeApiOrigin, type AgentVersionsResponse, type AssistantRuntimeResponse, type LanAccessStatusResponse, type MakeClientUpdateApplyResult, type MakeClientUpdateBackupRecord, type MakeClientUpdateStatus } from '../services/api';
import { requireProjectScope, withProjectScope } from '../services/projectScope';
import { fillUnsetAiPurposePromptClients, normalizePromptClientPreference } from '../../common/promptExecution';
import { ACP_PROVIDER_OPTIONS, type AcpProviderKey } from '../../common/acpModelConfig';
import { runAiText, type AiRunClientError } from '../domains/ai-generation/aiRunClient';
import {
    createNotificationPlayer,
    type NotificationPlayer,
} from '../domains/notifications/notificationPlayer';
import {
    readNotificationSettings,
    type NotificationSettings,
    writeNotificationSettings,
} from '../domains/notifications/notificationSettings';
import {
    buildMakeClientUpdateFailurePrompt,
    formatMakeClientUpdateError,
} from '../utils/projectSetupErrors';
import type { MainIDEPreference } from '../../common/ide';
import type { PromptClientPreference } from '../types';
import {
    formatAgentVersionMeta,
    formatAgentVersionMetaTitle,
    isAgentVersionCacheFresh,
    type AgentVersionCache,
    type AgentVersionMap,
} from '../utils/agentVersionCache';
import type { ExcalidrawPropertyPanelMode, ExcalidrawPropertyPanelPosition } from '../utils/excalidrawUiMode';
import type { ThemeResourceItem } from '../domains/resources/resource.types';
import { PrototypeThemeSearchSelect } from '../domains/prototype-generation/PrototypeThemeSearchSelect';
import { NO_PROTOTYPE_THEME_VALUE } from '../domains/prototype-generation/prototypeGenerationThemeSelection';
import { LocalAgentPathSettings } from './settings/LocalAgentPathSettings';
import {
    buildGlobalSettingsAiPrompt,
    buildLocalAgentToolOpenStatePatch,
    LOCAL_DESKTOP_AGENT_PATH_OPTIONS,
    readLocalAgentPathEntries,
    type LocalAgentPathEntry,
    type LocalAgentToolOpenState,
} from './settings/localAgentSettings';
import { SettingsCollapsiblePanel } from './settings/SettingsCollapsiblePanel';
import { DocumentTemplateSettings } from './settings/FixedDocumentTemplateSettings';
import {
    VoiceAssistantSettingsSection,
    type VoiceAssistantSettingsSectionHandle,
} from './settings/VoiceAssistantSettingsSection';

export type SettingsDialogInitialTab = 'project' | 'update' | 'ai' | 'network';
export interface SettingsDialogAIContext {
    runtime?: AssistantRuntimeResponse | null;
    failureSource?: string;
    failureMessage?: string;
    voiceSection?: 'voice-doubao';
}

interface SettingsDialogProps {
    open: boolean;
    projectId: string;
    onClose: () => void;
    onSaved?: () => void;
    makeClientUpdateReminderVisible?: boolean;
    onMakeClientUpdateReminderSeen?: () => void;
    onMakeClientUpdateAvailabilityChange?: (status: MakeClientUpdateStatus | null) => void;
    onOpenVersionCollaboration?: () => void;
    initialTab?: SettingsDialogInitialTab;
    initialAcpRuntime?: AssistantRuntimeResponse | null;
    initialAcpFailureSource?: string;
    initialAcpFailureMessage?: string;
    initialVoiceSection?: 'voice-doubao';
    conversationUiEnabled?: boolean;
    excalidrawPropertyPanelMode?: ExcalidrawPropertyPanelMode;
    onExcalidrawPropertyPanelModeChange?: (mode: ExcalidrawPropertyPanelMode) => void;
    excalidrawPropertyPanelPosition?: ExcalidrawPropertyPanelPosition;
    onExcalidrawPropertyPanelPositionChange?: (position: ExcalidrawPropertyPanelPosition) => void;
}

interface ServerConfig {
    host: string;
    port: number;
    lanHost?: string;
    skipLanPreviewAuth?: boolean;
    enableCommandAPI?: boolean;
}

interface ProjectInfoConfig {
    name?: string | null;
    description?: string | null;
}

interface Config {
    projectId?: string | null;
    projectPath?: string | null;
    server: ServerConfig;
    availableLANHosts?: string[];
    projectInfo?: ProjectInfoConfig;
    projectDefaults?: {
        defaultTheme?: string | null;
    };
    automation?: {
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
    };
    toolOpenState?: LocalAgentToolOpenState;
    assistant?: {
        webBaseUrl?: string | null;
        apiBaseUrl?: string | null;
    };
    ai?: {
        imageGeneration?: {
            baseUrl?: string | null;
            apiKey?: string | null;
            model?: string | null;
            lastTest?: AiImageConfigLastTest | null;
        };
    };
}

interface SettingsFormState {
    host: string;
    lanHost: string;
    skipLanPreviewAuth: boolean;
    projectName: string;
    projectDescription: string;
    defaultTheme: string;
    conversationPromptClient: PromptClientPreference;
    conversationModel: string;
    annotationPromptClient: PromptClientPreference;
    annotationModel: string;
    canvasPromptClient: PromptClientPreference;
    canvasModel: string;
    agentRunConcurrency: number;
    autoClearCompletedComments: boolean;
    injectLocalAiEntry: boolean;
    localDesktopAgentPaths: LocalAgentPathEntry[];
    aiBaseUrl: string;
    aiApiKey: string;
    aiModel: string;
}

type AgentProviderTestStatus = 'idle' | 'testing' | 'passed' | 'failed';
type AiImageConfigTestStatus = 'idle' | 'testing' | 'passed' | 'failed';
type AiImageConfigLastTestStatus = 'passed' | 'failed';

interface AgentProviderTestState {
    status: AgentProviderTestStatus;
    message?: string;
    testedAt?: number;
}

interface AiImageConfigTestState {
    status: AiImageConfigTestStatus;
    message?: string;
}

interface AiImageConfigLastTest {
    status: AiImageConfigLastTestStatus;
    message: string;
    testedAt: number;
}

const AGENT_PROVIDER_TEST_KEYWORD = 'AXHUB_AGENT_TEST_OK';
const AGENT_PROVIDER_TEST_PROMPT = `请只返回 ${AGENT_PROVIDER_TEST_KEYWORD}，不要返回其他文字。`;
const AGENT_PROVIDER_TEST_TIMEOUT_MS = 60_000;
const AI_IMAGE_CONFIG_TEST_PROMPT = '生成一张用于验证图片生成配置的极简测试图片，内容为白底黑色文字 OK。';

const DEFAULT_FORM_STATE: SettingsFormState = {
    host: 'localhost',
    lanHost: '',
    skipLanPreviewAuth: false,
    projectName: '',
    projectDescription: '',
    defaultTheme: '',
    conversationPromptClient: null,
    conversationModel: '',
    annotationPromptClient: null,
    annotationModel: '',
    canvasPromptClient: null,
    canvasModel: '',
    agentRunConcurrency: 5,
    autoClearCompletedComments: true,
    injectLocalAiEntry: true,
    localDesktopAgentPaths: [],
    aiBaseUrl: 'https://api.openai.com/v1',
    aiApiKey: '',
    aiModel: 'gpt-image-2',
};

function formatShareExpiry(expiresAt: string): string {
    if (!expiresAt) return '';
    const timestamp = Date.parse(expiresAt);
    if (!Number.isFinite(timestamp)) return '';
    return new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(new Date(timestamp));
}

function buildCurrentAdminLanTargetUrl(lanHost: string): string {
    const url = new URL(window.location.href);
    const normalizedLanHost = lanHost.trim();
    if (normalizedLanHost) {
        url.hostname = normalizedLanHost;
    }
    url.searchParams.delete('axhubAccessToken');
    return url.toString();
}

const LOCAL_AI_AGENT_OPTIONS: Array<{
    value: NonNullable<PromptClientPreference>;
    provider: AcpProviderKey;
    label: string;
    versionKey: AcpProviderKey;
    supportsNpxFallback: boolean;
}> = ACP_PROVIDER_OPTIONS.map((option) => ({
    value: option.client,
    provider: option.provider,
    label: option.label,
    versionKey: option.provider,
    supportsNpxFallback: option.supportsNpxFallback === true,
}));

function getAgentProviderIcon(provider: AcpProviderKey): React.ReactNode {
    if (provider === 'codex') return <Codex.Color size={16} />;
    if (provider === 'claude') return <ClaudeCode.Color size={16} />;
    if (provider === 'opencode') return <OpenCode size={16} />;
    if (provider === 'cursor') return <Cursor size={16} />;
    if (provider === 'qoder') return <img src={qoderIconUrl} alt="" aria-hidden width={16} height={16} />;
    if (provider === 'codebuddy') return <img src={codeBuddyIconUrl} alt="" aria-hidden width={16} height={16} />;
    if (provider === 'reasonix') return <DeepSeek.Color size={16} />;
    if (provider === 'grok-build') return <Grok size={16} />;
    return null;
}

function sanitizeAgentRunConcurrency(value: unknown): number {
    const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_FORM_STATE.agentRunConcurrency;
    }
    return Math.min(10, Math.max(1, Math.trunc(numeric)));
}

function normalizeFormState(config: Config): SettingsFormState {
    return {
        host: config.server.host || 'localhost',
        lanHost: config.server.lanHost || config.availableLANHosts?.[0] || '',
        skipLanPreviewAuth: config.server.skipLanPreviewAuth === true,
        projectName: config.projectInfo?.name || '',
        projectDescription: config.projectInfo?.description || '',
        defaultTheme: config.projectDefaults?.defaultTheme || '',
        conversationPromptClient: normalizePromptClientPreference(config.automation?.conversationPromptClient),
        conversationModel: config.automation?.conversationModel || '',
        annotationPromptClient: normalizePromptClientPreference(config.automation?.annotationPromptClient),
        annotationModel: config.automation?.annotationModel || '',
        canvasPromptClient: normalizePromptClientPreference(config.automation?.canvasPromptClient),
        canvasModel: config.automation?.canvasModel || '',
        agentRunConcurrency: sanitizeAgentRunConcurrency(config.automation?.agentRunConcurrency),
        autoClearCompletedComments: config.automation?.autoClearCompletedComments !== false,
        injectLocalAiEntry: config.automation?.injectLocalAiEntry !== false,
        localDesktopAgentPaths: readLocalAgentPathEntries(config.toolOpenState, 'desktop'),
        aiBaseUrl: config.ai?.imageGeneration?.baseUrl || 'https://api.openai.com/v1',
        aiApiKey: config.ai?.imageGeneration?.apiKey || '',
        aiModel: config.ai?.imageGeneration?.model || 'gpt-image-2',
    };
}

function summarizeAgentProviderTestOutput(value: unknown): string {
    const text = String(value || '').replace(/\s+/gu, ' ').trim();
    if (!text) return '未返回输出';
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function getAgentProviderTestLabel(state?: AgentProviderTestState): string {
    if (state?.status === 'passed') return '通过';
    if (state?.status === 'failed') return '失败';
    if (state?.status === 'testing') return '测试中';
    return '';
}

function formatAgentProviderTestTime(testedAt?: number): string {
    if (!testedAt) return '未测试';
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(testedAt));
}

function normalizeAiImageConfigLastTest(value: unknown): AiImageConfigLastTest | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    if (record.status !== 'passed' && record.status !== 'failed') return undefined;
    if (typeof record.testedAt !== 'number' || !Number.isFinite(record.testedAt) || record.testedAt <= 0) {
        return undefined;
    }
    const message = typeof record.message === 'string' && record.message.trim()
        ? record.message.trim()
        : record.status === 'passed' ? '已返回图片结果' : '测试失败';
    return {
        status: record.status,
        message,
        testedAt: Math.round(record.testedAt),
    };
}

function getAiImageConfigLastTestLabel(state?: AiImageConfigLastTest): string {
    if (state?.status === 'passed') return '成功';
    if (state?.status === 'failed') return '失败';
    return '未测试';
}

function formatAiImageConfigLastTestTime(testedAt?: number): string {
    if (!testedAt) return '暂无时间';
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(testedAt));
}

function formatMakeClientUpdateActionLabel(
    status: MakeClientUpdateStatus | null,
    applying: boolean,
): string {
    if (applying) return '更新中...';
    if (!status) return '开始更新';
    if (!status.updateAvailable) return '已是最新';
    return '开始更新';
}

function getVisibleMakeClientUpdateBlocker(status: MakeClientUpdateStatus | null): string {
    if (!status) return '请先检测更新状态';
    return status.blockedReasons[0]?.message || '';
}

function formatMakeClientUpdateBackupTime(value?: string): string {
    if (!value) return '未知';
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return '未知';
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));
}

function buildMakeClientUpdateRestorePrompt(record: MakeClientUpdateBackupRecord): string {
    return [
        '请帮我根据 Axhub Make 客户端更新备份处理还原或排查。',
        '',
        '我不懂命令行、Node.js、npm 或 pnpm。请你把每一步都说清楚，一次只让我执行一个命令，并解释这个命令是在检查什么或修复什么。',
        '',
        '**备份信息**：',
        `备份目录：${record.backupRoot}`,
        `备份压缩包：${record.backupZipPath}`,
        `备份日志：${record.manifestPath}`,
        `版本变化：${record.currentVersion} -> ${record.targetVersion}`,
        `覆盖文件数量：${record.writtenFilesCount}`,
        '',
        '**处理要求**：',
        '- 请先读取 manifest.json，确认 original/ 中有哪些文件可恢复。',
        '- 不要默认直接覆盖我当前项目里的新文件；先说明会恢复哪些文件、风险是什么。',
        '- 如果需要还原，请优先从 original/ 逐个恢复被覆盖文件。',
        '- 不要删除我的用户原型、资源、运行记录或备份目录。',
    ].join('\n');
}

function formatLocalAcpCheckedAt(checkedAt?: string): string {
    if (!checkedAt) return '未检测';
    const timestamp = Date.parse(checkedAt);
    if (Number.isNaN(timestamp)) return '未知';
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(new Date(timestamp));
}

function resolveLocalAcpRepairCommand(runtime: AssistantRuntimeResponse | null): string {
    const installCommand = String(runtime?.health.hints.installGlobal || '').trim();
    const startCommand = String(runtime?.health.hints.start || '').trim();
    if (runtime?.health.status === 'missing_cli') {
        return installCommand || startCommand;
    }
    return startCommand || installCommand;
}

function isLocalAcpCorsFailure(runtime: AssistantRuntimeResponse | null, failureMessage?: string): boolean {
    const message = `${runtime?.health.message || ''} ${failureMessage || ''}`;
    return message.includes('跨域预检失败');
}

function resolveLocalAcpRepairMessage(params: {
    runtime: AssistantRuntimeResponse | null;
    failureMessage?: string;
}): string {
    const runtime = params.runtime;
    if (isLocalAcpCorsFailure(runtime, params.failureMessage)) {
        return '本地 ACP 已响应，但未允许当前 Make 地址跨域访问。为避免覆盖共享服务的跨域配置，Make 不会自动重启；请在 ACP 配置中追加该地址后重新检测。';
    }
    if (runtime?.health.status === 'missing_cli') {
        return '未检测到可用的 Node/npm/npx 命令。请先安装运行环境，再使用下方命令启动 ACP。';
    }
    return '本地 ACP 未就绪。请使用下方命令启动，或点击“链接”自动处理。';
}

function buildLocalAcpTroubleshootingPrompt(params: {
    runtime: AssistantRuntimeResponse | null;
    failureSource?: string;
    failureMessage?: string;
    currentUrl: string;
}): string {
    const runtime = params.runtime;
    const message = params.failureMessage?.trim()
        || runtime?.health.message
        || '本地 ACP 服务未链接';
    const source = params.failureSource?.trim() || 'Axhub Make AI 设置';
    const startCommand = resolveLocalAcpRepairCommand(runtime) || '(未返回启动命令)';
    const statusCommand = runtime?.health.hints.status || '(未返回检测命令)';
    return [
        '请帮我排查 Axhub Make 本地 ACP 服务连接失败。',
        '',
        `失败来源：${source}`,
        `当前错误：${message}`,
        `ACP 地址：${runtime?.webBaseUrl || '(未检测)'}`,
        `ACP API 地址：${runtime?.apiBaseUrl || '(未检测)'}`,
        `项目路径：${runtime?.projectPath || runtime?.projectRoot || '(未检测)'}`,
        `启动命令：${startCommand}`,
        `检测命令：${statusCommand}`,
        `当前 Make URL：${params.currentUrl}`,
        '',
        '请检查 Node/npm/npx、端口占用、CORS、网络和 /api/chat 可达性。',
        '如果需要执行修复，请先说明将要运行的命令；修复后重新检测 /api/chat。',
    ].join('\n');
}

function isAiRunAcpRuntimeUnavailable(error: unknown): error is AiRunClientError & { runtime?: AssistantRuntimeResponse } {
    const record = error as AiRunClientError | null;
    if (!record || typeof record !== 'object') return false;
    return record.code === 'ACP_RUNTIME_UNAVAILABLE' || record.action === 'open-ai-settings';
}

export default function SettingsDialog({ open, projectId, onClose, onSaved, makeClientUpdateReminderVisible, onMakeClientUpdateReminderSeen, onMakeClientUpdateAvailabilityChange, onOpenVersionCollaboration, initialTab = 'project', initialAcpRuntime = null, initialAcpFailureSource = '', initialAcpFailureMessage = '', initialVoiceSection, conversationUiEnabled = true }: SettingsDialogProps) {
    const [loading, setLoading] = useState(false);
    const [formState, setFormState] = useState<SettingsFormState>(DEFAULT_FORM_STATE);
    const [activeTab, setActiveTab] = useState<SettingsDialogInitialTab>(initialTab);
    const [notificationSettings, setNotificationSettings] = useState(readNotificationSettings);
    const [agentVersions, setAgentVersions] = useState<AgentVersionMap>({});
    const [latestAgentVersions, setLatestAgentVersions] = useState<AgentVersionMap>({});
    const [agentVersionsLoading, setAgentVersionsLoading] = useState(false);
    const [agentVersionRefreshingProvider, setAgentVersionRefreshingProvider] = useState<AcpProviderKey | null>(null);
    const [agentProviderTests, setAgentProviderTests] = useState<Record<string, AgentProviderTestState>>({});
    const [aiImageConfigTest, setAiImageConfigTest] = useState<AiImageConfigTestState>({ status: 'idle' });
    const [aiImageConfigLastTest, setAiImageConfigLastTest] = useState<AiImageConfigLastTest | undefined>(undefined);
    const [availableThemes, setAvailableThemes] = useState<ThemeResourceItem[]>([]);
    const [availableLANHosts, setAvailableLANHosts] = useState<string[]>([]);
    const [lanAccessStatus, setLanAccessStatus] = useState<LanAccessStatusResponse | null>(null);
    const [lanAccessPassword, setLanAccessPassword] = useState('');
    const [lanAccessPasswordSaving, setLanAccessPasswordSaving] = useState(false);
    const [lanAccessShareUrl, setLanAccessShareUrl] = useState('');
    const [lanAccessShareExpiresAt, setLanAccessShareExpiresAt] = useState('');
    const [lanAccessShareGenerating, setLanAccessShareGenerating] = useState(false);
    const activeProjectId = projectId;
    const buildSettingsUrl = (url: string) => withProjectScope(url, requireProjectScope(projectId));
    const [localAcpRuntime, setLocalAcpRuntime] = useState<AssistantRuntimeResponse | null>(null);
    const [localAcpFailureContext, setLocalAcpFailureContext] = useState<{ source: string; message: string } | null>(null);
    const [localAcpConnecting, setLocalAcpConnecting] = useState(false);
    const [localAcpRefreshing, setLocalAcpRefreshing] = useState(false);
    const [localAcpDetailsOpen, setLocalAcpDetailsOpen] = useState(false);
    const [agentDiagnosticsOpen, setAgentDiagnosticsOpen] = useState(true);
    const [makeClientUpdateStatus, setMakeClientUpdateStatus] = useState<MakeClientUpdateStatus | null>(null);
    const [makeClientUpdateResult, setMakeClientUpdateResult] = useState<MakeClientUpdateApplyResult | null>(null);
    const [makeClientUpdateError, setMakeClientUpdateError] = useState<unknown>(null);
    const [makeClientUpdateStatusLoading, setMakeClientUpdateStatusLoading] = useState(false);
    const [makeClientUpdateApplying, setMakeClientUpdateApplying] = useState(false);
    const agentVersionCacheRef = useRef<AgentVersionCache | null>(null);
    const notificationPlayerRef = useRef<NotificationPlayer | null>(null);
    if (!notificationPlayerRef.current) {
        notificationPlayerRef.current = createNotificationPlayer();
    }
    const notificationPlayer = notificationPlayerRef.current;
    const aiTabVersionLoadedRef = useRef(false);
    const initialAcpFailureAppliedRef = useRef(false);
    const localAcpAutoCloseBlockedRef = useRef(false);
    const settingsDialogInitializedRef = useRef(false);
    const voiceAssistantSettingsRef = useRef<VoiceAssistantSettingsSectionHandle>(null);
    const localAcpConnected = localAcpRuntime?.health.status === 'ready';
    const localAcpHasCorsFailure = isLocalAcpCorsFailure(localAcpRuntime, localAcpFailureContext?.message);
    const localAcpActionLabel = localAcpConnected || localAcpHasCorsFailure ? '重新检测' : '链接';
    const localAcpActionBusy = localAcpConnecting || localAcpRefreshing;
    const makeClientUpdateAvailable = makeClientUpdateStatus?.updateAvailable === true;
    const visibleMakeClientUpdateBlocker = makeClientUpdateAvailable ? getVisibleMakeClientUpdateBlocker(makeClientUpdateStatus) : '';
    const makeClientUpdateCanApply = Boolean(makeClientUpdateAvailable && makeClientUpdateStatus?.canApply);
    const latestMakeClientUpdateBackup = makeClientUpdateResult?.backupRecord || makeClientUpdateStatus?.lastBackup || null;
    const installedLocalAiAgentOptions = LOCAL_AI_AGENT_OPTIONS.filter(
        (option) => agentVersions[option.versionKey]?.status === 'installed',
    );
    const agentProviderTestStates = Object.values(agentProviderTests);
    const agentProviderTestingCount = agentProviderTestStates.filter((state) => state.status === 'testing').length;
    const agentProviderFailureCount = agentProviderTestStates.filter((state) => state.status === 'failed').length;
    const agentProviderPassedCount = agentProviderTestStates.filter((state) => state.status === 'passed').length;

    useEffect(() => {
        if (!open) {
            settingsDialogInitializedRef.current = false;
            setActiveTab(initialTab);
            setAgentProviderTests({});
            setAiImageConfigTest({ status: 'idle' });
            setMakeClientUpdateStatus(null);
            setMakeClientUpdateResult(null);
            setMakeClientUpdateError(null);
            setLocalAcpRuntime(null);
            setLocalAcpFailureContext(null);
            setLocalAcpConnecting(false);
            setLocalAcpRefreshing(false);
            setLocalAcpDetailsOpen(false);
            setAgentDiagnosticsOpen(true);
            setAgentVersionRefreshingProvider(null);
            aiTabVersionLoadedRef.current = false;
            initialAcpFailureAppliedRef.current = false;
            localAcpAutoCloseBlockedRef.current = false;
            setAvailableThemes([]);
            setAvailableLANHosts([]);
            setLanAccessStatus(null);
            setLanAccessPassword('');
            setLanAccessShareUrl('');
            setLanAccessShareExpiresAt('');
            return;
        }

        if (settingsDialogInitializedRef.current) return;
        settingsDialogInitializedRef.current = true;

        setNotificationSettings(readNotificationSettings());
        setActiveTab(initialTab);
        if (initialTab === 'update') {
            onMakeClientUpdateReminderSeen?.();
        }
        if (initialTab === 'ai' && initialAcpRuntime && initialAcpRuntime.health.status !== 'ready') {
            setLocalAcpRuntime(initialAcpRuntime);
            setLocalAcpFailureContext({
                source: initialAcpFailureSource,
                message: initialAcpFailureMessage || initialAcpRuntime?.health.message || '',
            });
            setLocalAcpDetailsOpen(true);
            initialAcpFailureAppliedRef.current = true;
        } else if (initialTab === 'ai' && !initialAcpFailureAppliedRef.current) {
            void handleLocalAcpRuntimeCheck({ silent: true });
        }
        const configPromise = loadConfig();
        if (initialTab === 'ai') {
            void configPromise.then(() => loadAgentVersions());
        }
        void loadThemeOptions();
        void loadLanAccessStatus();
    }, [open, initialAcpRuntime, initialAcpFailureMessage, initialAcpFailureSource, initialTab, onMakeClientUpdateReminderSeen]);

    const updateField = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => {
        setFormState((previous) => ({ ...previous, [key]: value }));
    };

    const updatePromptClientField = (
        key: 'conversationPromptClient' | 'annotationPromptClient' | 'canvasPromptClient',
        value: PromptClientPreference,
    ) => {
        setFormState((previous) => fillUnsetAiPurposePromptClients(previous, key, value));
    };

    const updateNotificationSetting = (patch: Partial<NotificationSettings>) => {
        setNotificationSettings(writeNotificationSettings(patch));
    };

    const updateAgentProviderTestState = (client: string, state: AgentProviderTestState) => {
        setAgentProviderTests((previous) => ({ ...previous, [client]: state }));
    };

    const loadConfig = async () => {
        try {
            const response = await fetch(buildSettingsUrl('/api/config'));
            if (!response.ok) {
                throw new Error('Failed to load config');
            }
            const config: Config = await response.json();
            setFormState(normalizeFormState(config));
            setAvailableLANHosts(Array.isArray(config.availableLANHosts) ? config.availableLANHosts : []);
            setAiImageConfigLastTest(normalizeAiImageConfigLastTest(config.ai?.imageGeneration?.lastTest));
            if (initialTab === 'update' && activeProjectId) {
                void loadMakeClientUpdateStatus(activeProjectId);
            }
            return config;
        } catch (error) {
            console.error('Error loading config:', error);
            toast.error('加载配置失败');
            return null;
        }
    };

    const loadThemeOptions = async () => {
        try {
            const response = await fetch(buildSettingsUrl('/api/themes'));
            if (!response.ok) {
                throw new Error('Failed to load themes');
            }
            const themes = await response.json().catch(() => []);
            setAvailableThemes(Array.isArray(themes) ? themes : []);
        } catch (error) {
            console.error('Error loading themes:', error);
            setAvailableThemes([]);
        }
    };

    const loadLanAccessStatus = async () => {
        try {
            const status = await apiService.getLanAccessStatus();
            setLanAccessStatus(status);
            if (!status.passwordSet) {
                setLanAccessShareUrl('');
                setLanAccessShareExpiresAt('');
            }
            return status;
        } catch (error: any) {
            console.error('Error loading LAN access status:', error);
            setLanAccessStatus(null);
            return null;
        }
    };

    const applyAgentVersionsResponse = (result: AgentVersionsResponse, mode: 'replace' | 'merge' = 'replace'): AgentVersionMap => {
        const versionsPatch = result.agents || {};
        const latestVersionsPatch = result.latestAgents || {};
        if (mode === 'merge') {
            const currentCache = agentVersionCacheRef.current;
            const versions = {
                ...(currentCache?.versions || agentVersions),
                ...versionsPatch,
            };
            const latestVersions = {
                ...(currentCache?.latestVersions || latestAgentVersions),
                ...latestVersionsPatch,
            };
            if (currentCache) {
                agentVersionCacheRef.current = {
                    ...currentCache,
                    versions,
                    latestVersions,
                };
            }
            setAgentVersions(versions);
            setLatestAgentVersions(latestVersions);
            return versions;
        }

        agentVersionCacheRef.current = {
            fetchedAt: Date.now(),
            versions: versionsPatch,
            latestVersions: latestVersionsPatch,
        };
        setAgentVersions(versionsPatch);
        setLatestAgentVersions(latestVersionsPatch);
        return versionsPatch;
    };

    const loadAgentVersions = async (force = false): Promise<AgentVersionMap> => {
        if (!force && isAgentVersionCacheFresh(agentVersionCacheRef.current)) {
            setAgentVersions(agentVersionCacheRef.current.versions);
            setLatestAgentVersions(agentVersionCacheRef.current.latestVersions);
            return agentVersionCacheRef.current.versions;
        }

        setAgentVersionsLoading(true);
        try {
            const result = await apiService.getAgentVersions();
            return applyAgentVersionsResponse(result);
        } catch (error) {
            console.error('Error loading agent versions:', error);
            return {};
        } finally {
            setAgentVersionsLoading(false);
        }
    };

    const refreshAgentVersion = async (provider: AcpProviderKey): Promise<AgentVersionMap> => {
        setAgentVersionRefreshingProvider(provider);
        try {
            const result = await apiService.getAgentVersions({ agent: provider });
            return applyAgentVersionsResponse(result, 'merge');
        } catch (error) {
            console.error('Error refreshing agent version:', error);
            return agentVersionCacheRef.current?.versions || agentVersions;
        } finally {
            setAgentVersionRefreshingProvider(null);
        }
    };

    const loadLocalAiAgentVersionsAfterAcpReady = (runtime: AssistantRuntimeResponse | null) => {
        if (runtime?.health.status !== 'ready' || aiTabVersionLoadedRef.current) {
            return;
        }
        aiTabVersionLoadedRef.current = true;
        void loadAgentVersions();
    };

    const preserveSettingsDialogDuringLocalAcpAction = async <T,>(action: () => Promise<T>): Promise<T> => {
        localAcpAutoCloseBlockedRef.current = true;
        try {
            return await action();
        } finally {
            window.setTimeout(() => {
                localAcpAutoCloseBlockedRef.current = false;
            }, 0);
        }
    };

    const handleSettingsDialogOpenChange = (nextOpen: boolean) => {
        if (nextOpen) return;
        if (localAcpAutoCloseBlockedRef.current) {
            return;
        }
        onClose();
    };

    async function handleLocalAcpRuntimeCheck(options: { silent?: boolean } = {}) {
        try {
            const runtime = await apiService.getAssistantRuntime({ autoStart: false, projectId: activeProjectId || projectId });
            setLocalAcpRuntime(runtime);
            setLocalAcpFailureContext(null);
            setLocalAcpDetailsOpen(runtime.health.status !== 'ready');
            loadLocalAiAgentVersionsAfterAcpReady(runtime);
            if (!options.silent) {
                if (runtime.health.status === 'ready') {
                    toast.success('本地 ACP 服务已链接');
                } else {
                    toast.warning(runtime.health.message || '本地 ACP 服务未链接');
                }
            }
            return runtime;
        } catch (error: any) {
            console.error('Error checking local ACP runtime:', error);
            setLocalAcpDetailsOpen(true);
            if (!options.silent) {
                toast.error(error?.message || '检测本地 ACP 服务失败');
            }
            return null;
        }
    }

    const handleLocalAcpRuntimeConnect = async () => {
        return preserveSettingsDialogDuringLocalAcpAction(async () => {
            setLocalAcpConnecting(true);
            try {
                const runtime = await apiService.getAssistantRuntime({ autoStart: true, projectId: activeProjectId || projectId });
                setLocalAcpRuntime(runtime);
                setLocalAcpFailureContext(null);
                setLocalAcpDetailsOpen(runtime.health.status !== 'ready');
                loadLocalAiAgentVersionsAfterAcpReady(runtime);
                if (runtime.health.status === 'ready') {
                    toast.success('本地 ACP 服务已链接');
                } else {
                    toast.warning(runtime.health.message || '本地 ACP 服务未链接');
                }
                return runtime;
            } catch (error: any) {
                console.error('Error connecting local ACP runtime:', error);
                setLocalAcpDetailsOpen(true);
                toast.error(error?.message || '链接本地 ACP 服务失败');
                return null;
            } finally {
                setLocalAcpConnecting(false);
            }
        });
    };

    const handleLocalAcpRuntimeRefresh = async () => {
        return preserveSettingsDialogDuringLocalAcpAction(async () => {
            setLocalAcpRefreshing(true);
            try {
                const runtime = await apiService.getAssistantRuntime({ autoStart: false, projectId: activeProjectId || projectId });
                setLocalAcpRuntime(runtime);
                setLocalAcpFailureContext(null);
                setLocalAcpDetailsOpen(runtime.health.status !== 'ready');
                loadLocalAiAgentVersionsAfterAcpReady(runtime);
                if (runtime.health.status === 'ready') {
                    toast.success('本地 ACP 服务状态已更新');
                } else {
                    toast.warning(runtime.health.message || '本地 ACP 服务仍未就绪');
                }
                return runtime;
            } catch (error: any) {
                console.error('Error refreshing local ACP runtime:', error);
                setLocalAcpDetailsOpen(true);
                toast.error(error?.message || '重新检测本地 ACP 服务失败');
                return null;
            } finally {
                setLocalAcpRefreshing(false);
            }
        });
    };

    const loadMakeClientUpdateStatus = async (projectId = activeProjectId) => {
        if (!projectId) {
            setMakeClientUpdateError(new Error('当前没有已注册的 Make Client 项目'));
            onMakeClientUpdateAvailabilityChange?.(null);
            return;
        }
        setMakeClientUpdateStatusLoading(true);
        setMakeClientUpdateError(null);
        try {
            const status = await apiService.getMakeClientUpdateStatus(projectId);
            setMakeClientUpdateStatus(status);
            onMakeClientUpdateAvailabilityChange?.(status);
        } catch (error: any) {
            setMakeClientUpdateError(error);
            onMakeClientUpdateAvailabilityChange?.(null);
            toast.error(formatMakeClientUpdateError(error, '检测项目更新失败'));
        } finally {
            setMakeClientUpdateStatusLoading(false);
        }
    };

    const handleTabValueChange = (value: string) => {
        setActiveTab(value === 'ai' ? 'ai' : value === 'update' ? 'update' : value === 'network' ? 'network' : 'project');
        if (value === 'ai') {
            void handleLocalAcpRuntimeCheck({ silent: true });
            void loadAgentVersions();
        }
        if (value === 'update') {
            onMakeClientUpdateReminderSeen?.();
            if (activeProjectId) {
                void loadMakeClientUpdateStatus(activeProjectId);
            } else {
                void loadConfig().then((config) => {
                    const projectId = typeof config?.projectId === 'string' ? config.projectId.trim() : '';
                    if (projectId) {
                        void loadMakeClientUpdateStatus(projectId);
                    }
                });
            }
        }
    };

    const handleApplyMakeClientUpdate = async () => {
        if (!activeProjectId) {
            toast.error('当前没有已注册的 Make Client 项目');
            return;
        }
        setMakeClientUpdateApplying(true);
        setMakeClientUpdateError(null);
        setMakeClientUpdateResult(null);
        try {
            const result = await apiService.applyMakeClientUpdate(activeProjectId);
            setMakeClientUpdateResult(result);
            if (result.postUpdateWarning) {
                toast.success('项目模板已更新完成；依赖安装或清单同步需要稍后重试');
            } else {
                toast.success('项目更新完成，请重启或刷新客户端');
            }
            void loadMakeClientUpdateStatus(activeProjectId);
        } catch (error: any) {
            setMakeClientUpdateError(error);
            toast.error(formatMakeClientUpdateError(error, '项目更新失败'));
        } finally {
            setMakeClientUpdateApplying(false);
        }
    };

    const handleOpenVersionCollaboration = () => {
        onOpenVersionCollaboration?.();
    };

    const handleCopyMakeClientUpdateFailurePrompt = async () => {
        const displayMessage = formatMakeClientUpdateError(makeClientUpdateError, '项目更新失败');
        const prompt = buildMakeClientUpdateFailurePrompt(makeClientUpdateError, {
            displayMessage,
            currentUrl: window.location.href,
        });
        try {
            await navigator.clipboard.writeText(prompt);
            toast.success('已复制给 AI 处理的提示词');
        } catch {
            toast.error('复制失败，请手动选择错误信息');
        }
    };

    const handleCopyMakeClientUpdateRestorePrompt = async () => {
        if (!latestMakeClientUpdateBackup) {
            toast.error('未找到可复制的更新备份记录');
            return;
        }
        try {
            await navigator.clipboard.writeText(buildMakeClientUpdateRestorePrompt(latestMakeClientUpdateBackup));
            toast.success('已复制给 AI 处理/还原的提示词');
        } catch {
            toast.error('复制失败，请手动选择备份记录');
        }
    };

    const handleCopyLocalAcpRepairCommand = async () => {
        const command = resolveLocalAcpRepairCommand(localAcpRuntime);
        if (!command) {
            toast.error('未获取到可复制的启动命令');
            return;
        }
        try {
            await navigator.clipboard.writeText(command);
            toast.success('启动命令已复制');
        } catch {
            toast.error('复制失败，请手动选择启动命令');
        }
    };

    const handleCopyLocalAcpTroubleshootingPrompt = async () => {
        const prompt = buildLocalAcpTroubleshootingPrompt({
            runtime: localAcpRuntime,
            failureSource: localAcpFailureContext?.source,
            failureMessage: localAcpFailureContext?.message,
            currentUrl: window.location.href,
        });
        try {
            await navigator.clipboard.writeText(prompt);
            toast.success('已复制给 AI 处理的提示词');
        } catch {
            toast.error('复制失败，请手动选择排障提示词');
        }
    };

    const handleCopyGlobalSettingsAiPrompt = async () => {
        try {
            await navigator.clipboard.writeText(buildGlobalSettingsAiPrompt({
                makeApiOrigin: resolveMakeApiOrigin(),
                projectId,
            }));
            toast.success('AI 配置提示词已复制');
        } catch {
            toast.error('复制 AI 配置提示词失败');
        }
    };

    function handleAiRunAcpRuntimeUnavailable(error: unknown, source: string): boolean {
        if (!isAiRunAcpRuntimeUnavailable(error)) return false;
        const record = error as AiRunClientError;
        if (record.runtime && typeof record.runtime === 'object') {
            setLocalAcpRuntime(record.runtime as AssistantRuntimeResponse);
        }
        setLocalAcpFailureContext({
            source,
            message: typeof record.message === 'string' ? record.message : '本地 ACP 服务不可用',
        });
        setLocalAcpDetailsOpen(true);
        setActiveTab('ai');
        toast.warning('本地 ACP 服务不可用，请查看上方修复信息');
        return true;
    }

    const handleAgentProviderTest = async (option: typeof LOCAL_AI_AGENT_OPTIONS[number]) => {
        setAgentDiagnosticsOpen(true);
        updateAgentProviderTestState(option.value, { status: 'testing', message: '测试中' });
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), AGENT_PROVIDER_TEST_TIMEOUT_MS);
        try {
            const result = await runAiText({
                projectId: requireProjectScope(projectId).projectId,
                scene: 'agent-provider-test',
                client: option.value,
                prompt: AGENT_PROVIDER_TEST_PROMPT,
                signal: controller.signal,
            });

            const output = String(result?.output || '');
            if (output.includes(AGENT_PROVIDER_TEST_KEYWORD)) {
                updateAgentProviderTestState(option.value, { status: 'passed', message: '通过', testedAt: Date.now() });
                toast.success(`${option.label} 测试通过`);
                return;
            }

            const summary = summarizeAgentProviderTestOutput(output);
            updateAgentProviderTestState(option.value, { status: 'failed', message: summary });
            toast.error(`${option.label} 测试失败：${summary}`);
        } catch (error: any) {
            const message = error?.name === 'AbortError'
                ? '测试超时'
                : summarizeAgentProviderTestOutput(error?.message || error);
            updateAgentProviderTestState(option.value, { status: 'failed', message });
            if (handleAiRunAcpRuntimeUnavailable(error, '本地执行 agent 测试')) return;
            toast.error(`${option.label} 测试失败：${message}`);
        } finally {
            window.clearTimeout(timeoutId);
        }
    };

    const handleImportCodexConfig = async () => {
        try {
            setLoading(true);
            const response = await fetch(buildSettingsUrl('/api/config/ai-image/codex-local'), { cache: 'no-store' });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) {
                throw new Error(result?.error || '读取本地 Codex 配置失败');
            }
            if (!result.ready || !result.config) {
                const warning = result?.warnings?.[0]?.message || '未找到本地 Codex 图片 API 配置';
                throw new Error(warning);
            }
            const imported = result.config;
            updateField('aiBaseUrl', imported.baseUrl || DEFAULT_FORM_STATE.aiBaseUrl);
            updateField('aiApiKey', imported.apiKey || '');
            updateField('aiModel', imported.model || 'gpt-image-2');
            toast.success('已读取本地 Codex 配置');
        } catch (error: any) {
            console.error('Error importing local Codex config:', error);
            toast.error(error?.message || '读取本地 Codex 配置失败');
        } finally {
            setLoading(false);
        }
    };

    const persistAiImageConfigLastTest = async (lastTest: AiImageConfigLastTest) => {
        setAiImageConfigLastTest(lastTest);
        const response = await fetch(buildSettingsUrl('/api/config'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ai: {
                    imageGeneration: {
                        baseUrl: formState.aiBaseUrl.trim() || 'https://api.openai.com/v1',
                        apiKey: formState.aiApiKey.trim() || null,
                        model: formState.aiModel.trim() || 'gpt-image-2',
                        lastTest,
                    },
                },
            }),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error((error as any)?.error || '保存图片测试结果失败');
        }
    };

    const handleAiImageConfigTest = async () => {
        setAiImageConfigTest({ status: 'testing', message: '测试中' });
        try {
            const response = await fetch(buildSettingsUrl('/api/config/ai-image/test'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: AI_IMAGE_CONFIG_TEST_PROMPT,
                    baseUrl: formState.aiBaseUrl.trim(),
                    apiKey: formState.aiApiKey.trim(),
                    model: formState.aiModel.trim() || 'gpt-image-2',
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.success !== true) {
                throw new Error(String(body?.error || body?.message || '图片配置测试失败'));
            }
            const successMessage = typeof body?.message === 'string' && body.message.trim()
                ? body.message.trim()
                : '已返回图片结果';
            const testedAt = Date.now();
            setAiImageConfigTest({ status: 'passed', message: successMessage });
            try {
                await persistAiImageConfigLastTest({ status: 'passed', message: successMessage, testedAt });
            } catch (persistError) {
                console.error('Error saving AI image test result:', persistError);
                toast.error('图片配置测试通过，但保存测试结果失败');
            }
            toast.success('图片配置测试通过');
        } catch (error: any) {
            const message = error?.name === 'AbortError'
                ? '测试超时'
                : summarizeAgentProviderTestOutput(error?.message || error);
            const testedAt = Date.now();
            setAiImageConfigTest({ status: 'failed', message });
            try {
                await persistAiImageConfigLastTest({ status: 'failed', message, testedAt });
            } catch (persistError) {
                console.error('Error saving AI image test result:', persistError);
            }
            toast.error(`图片配置测试失败：${message}`);
        }
    };

    const handleLanAccessPasswordSave = async () => {
        const password = lanAccessPassword.trim();
        if (!password) {
            toast.error('请输入局域网访问密码');
            return;
        }
        setLanAccessPasswordSaving(true);
        try {
            const status = await apiService.setLanAccessPassword(password);
            setLanAccessStatus(status);
            setLanAccessPassword('');
            setLanAccessShareUrl('');
            setLanAccessShareExpiresAt('');
            toast.success('局域网访问密码已保存');
        } catch (error: any) {
            toast.error(error?.message || '设置局域网访问密码失败');
        } finally {
            setLanAccessPasswordSaving(false);
        }
    };

    const handleLanAccessPasswordClear = async () => {
        setLanAccessPasswordSaving(true);
        try {
            const status = await apiService.clearLanAccessPassword();
            setLanAccessStatus(status);
            setLanAccessPassword('');
            setLanAccessShareUrl('');
            setLanAccessShareExpiresAt('');
            toast.success('局域网访问密码已清除');
        } catch (error: any) {
            toast.error(error?.message || '清除局域网访问密码失败');
        } finally {
            setLanAccessPasswordSaving(false);
        }
    };

    const handleGenerateGlobalLanQRCode = async () => {
        if (!lanAccessStatus?.passwordSet) {
            toast.warning('请先设置局域网访问密码');
            return;
        }
        const targetUrl = buildCurrentAdminLanTargetUrl(formState.lanHost.trim() || availableLANHosts[0] || window.location.hostname);
        setLanAccessShareGenerating(true);
        try {
            const result = await apiService.createLanAccessShareUrl(targetUrl);
            setLanAccessShareUrl(result.url);
            setLanAccessShareExpiresAt(result.expiresAt);
            toast.success('全局二维码已生成，10 分钟内有效');
        } catch (error: any) {
            toast.error(error?.message || '生成全局二维码失败');
        } finally {
            setLanAccessShareGenerating(false);
        }
    };

    const handleCopyGlobalLanShareUrl = async () => {
        if (!lanAccessShareUrl) {
            toast.warning('请先生成全局二维码');
            return;
        }
        try {
            await navigator.clipboard.writeText(lanAccessShareUrl);
            toast.success('全局局域网链接已复制');
        } catch {
            toast.error('复制失败');
        }
    };

    const handleSave = async () => {
        const host = formState.host.trim();
        if (!host) {
            toast.error('主机地址不能为空');
            return;
        }

        try {
            setLoading(true);

            if (activeTab === 'ai') {
                await voiceAssistantSettingsRef.current?.save();
            }

            const currentConfigResponse = await fetch(buildSettingsUrl('/api/config'));
            const currentConfig: Config = currentConfigResponse.ok
                ? await currentConfigResponse.json()
                : { server: { host: 'localhost', port: 51720 } };

            const config: Config = {
                ...currentConfig,
                server: {
                    host,
                    port: currentConfig.server.port || 51720,
                    lanHost: formState.lanHost.trim(),
                    skipLanPreviewAuth: formState.skipLanPreviewAuth,
                    enableCommandAPI: currentConfig.server.enableCommandAPI || false,
                },
                projectInfo: {
                    name: formState.projectName.trim() || null,
                    description: formState.projectDescription.trim() || null,
                },
                projectDefaults: {
                    ...(currentConfig.projectDefaults || {}),
                    defaultTheme: formState.defaultTheme.trim() || null,
                },
                automation: {
                    ...(currentConfig.automation || {}),
                    conversationPromptClient: formState.conversationPromptClient || null,
                    conversationModel: formState.conversationModel.trim() || null,
                    annotationPromptClient: formState.annotationPromptClient || null,
                    annotationModel: formState.annotationModel.trim() || null,
                    canvasPromptClient: formState.canvasPromptClient || null,
                    canvasModel: formState.canvasModel.trim() || null,
                    agentRunConcurrency: sanitizeAgentRunConcurrency(formState.agentRunConcurrency),
                    autoClearCompletedComments: formState.autoClearCompletedComments,
                    injectLocalAiEntry: formState.injectLocalAiEntry,
                },
                toolOpenState: buildLocalAgentToolOpenStatePatch(
                    currentConfig.toolOpenState,
                    formState.localDesktopAgentPaths,
                ),
                ai: {
                    ...(currentConfig.ai || {}),
                    imageGeneration: {
                        baseUrl: formState.aiBaseUrl.trim() || 'https://api.openai.com/v1',
                        apiKey: formState.aiApiKey.trim() || null,
                        model: formState.aiModel.trim() || 'gpt-image-2',
                        lastTest: aiImageConfigLastTest,
                    },
                },
            };

            const response = await fetch(buildSettingsUrl('/api/config'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error((error as any)?.error || 'Failed to save config');
            }

            const syncResponse = await fetch(buildSettingsUrl('/api/themes/sync-design'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ themeName: formState.defaultTheme.trim() }),
            });
            if (!syncResponse.ok) {
                const error = await syncResponse.json().catch(() => ({}));
                throw new Error((error as any)?.error || '同步默认设计失败');
            }

            const result = await response.json();
            window.__AXHUB_SHARE_HOSTS__ = {
                localHost: host,
                lanHost: formState.lanHost.trim() || availableLANHosts[0] || '',
            };
            toast.success(result.message || '配置已保存');
            onSaved?.();
            onClose();
        } catch (error: any) {
            console.error('Error saving config:', error);
            await loadConfig();
            toast.error(error?.message || '保存配置失败');
        } finally {
            setLoading(false);
        }
    };

    const renderAiPurposeConfigRow = (
        label: string,
        clientKey: 'conversationPromptClient' | 'annotationPromptClient' | 'canvasPromptClient',
        modelKey: 'conversationModel' | 'annotationModel' | 'canvasModel',
    ) => {
        const selectedClient = formState[clientKey];
        const selectedOption = LOCAL_AI_AGENT_OPTIONS.find((option) => option.value === selectedClient);
        const selectedUnavailable = Boolean(
            selectedOption && agentVersions[selectedOption.versionKey]?.status !== 'installed',
        );

        return (
            <div
                key={clientKey}
                role="row"
                className="grid min-w-0 grid-cols-1 gap-2 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-3 sm:py-2.5"
            >
                <div role="rowheader" className="min-w-0 text-sm font-medium text-foreground sm:flex sm:min-h-9 sm:items-center">
                    {label}
                </div>
                <div role="cell" className="min-w-0 space-y-1.5">
                    <span className="text-xs text-muted-foreground sm:hidden">Agent</span>
                    <Select
                        value={selectedClient || undefined}
                        onValueChange={(value) => updatePromptClientField(clientKey, normalizePromptClientPreference(value))}
                    >
                        <SelectTrigger
                            clearable
                            hasValue={Boolean(selectedClient)}
                            onClear={() => updatePromptClientField(clientKey, null)}
                            aria-label={`${label} Agent`}
                            className="min-w-0"
                        >
                            <SelectValue placeholder={agentVersionsLoading ? '正在检测已安装 Agent' : '选择已安装 Agent'} />
                        </SelectTrigger>
                        <SelectContent>
                            {selectedUnavailable && selectedOption ? (
                                <SelectItem value={selectedOption.value} disabled>
                                    {selectedOption.label}（当前不可用）
                                </SelectItem>
                            ) : null}
                            {installedLocalAiAgentOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div role="cell" className="min-w-0 space-y-1.5">
                    <span className="text-xs text-muted-foreground sm:hidden">模型</span>
                    <Input
                        value={formState[modelKey]}
                        onChange={(event) => updateField(modelKey, event.target.value)}
                        placeholder="Agent 默认模型"
                        disabled={!selectedClient}
                        aria-label={`${label} 模型`}
                        className="min-w-0"
                    />
                </div>
            </div>
        );
    };

    return (
        <Sheet open={open} onOpenChange={handleSettingsDialogOpenChange}>
            <SheetContent
                side="left"
                className="flex w-full max-w-[620px] flex-col p-0 text-sm sm:max-w-[620px] [&>[data-sheet-close]]:hidden"
            >
                <Tabs value={activeTab} onValueChange={handleTabValueChange} className="flex h-full flex-col">
                    <SheetHeader className="border-b px-5 py-3.5">
                        <SheetTitle className="sr-only">项目设置 / 项目更新 / AI 设置 / 网络配置</SheetTitle>
                        <div className="flex items-center justify-between gap-3">
                            <TabsList className="grid h-8 w-full max-w-[460px] grid-cols-4 rounded-lg border border-border/70 bg-muted/50 p-0.5">
                                <TabsTrigger value="project" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    项目设置
                                </TabsTrigger>
                                <TabsTrigger value="update" className="relative h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    项目更新
                                    {makeClientUpdateReminderVisible ? (
                                        <span aria-label="有项目更新" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                                    ) : null}
                                </TabsTrigger>
                                <TabsTrigger value="ai" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    AI 设置
                                </TabsTrigger>
                                <TabsTrigger value="network" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    网络配置
                                </TabsTrigger>
                            </TabsList>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 rounded-md"
                                onClick={onClose}
                                aria-label="关闭"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </SheetHeader>

                    <TabsContent value="project" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <section className="space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-base font-semibold text-foreground">项目信息</h3>
                            <p className="text-xs text-muted-foreground">用于定义项目基础信息与默认资产。</p>
                        </div>

                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>配置更新后需保存并重启服务，修改内容才会生效。</span>
                        </div>

                        <Field>
                            <FieldLabelWithHint hint="用于 AI 理解项目定位与产出风格">项目名称</FieldLabelWithHint>
                            <Input
                                value={formState.projectName}
                                onChange={(event) => updateField('projectName', event.target.value)}
                                placeholder="请输入项目名称"
                                maxLength={20}
                            />
                        </Field>

                        <Field>
                            <FieldLabelWithHint hint="简要描述项目背景、目标用户与核心场景">项目简介</FieldLabelWithHint>
                            <Textarea
                                value={formState.projectDescription}
                                onChange={(event) => updateField('projectDescription', event.target.value)}
                                placeholder="例如：面向运营人员的活动配置后台，强调高效配置与稳定交付"
                                maxLength={60}
                                rows={3}
                                className="resize-none text-sm"
                            />
                            <FieldDescription>
                                {formState.projectDescription.length}/60
                            </FieldDescription>
                        </Field>

                        <Field>
                            <FieldLabelWithHint hint="从“资产管理-设计”中选择一个作为项目默认设计">默认设计</FieldLabelWithHint>
                            <PrototypeThemeSearchSelect
                                themes={availableThemes}
                                value={formState.defaultTheme || NO_PROTOTYPE_THEME_VALUE}
                                onValueChange={(themeName) => updateField('defaultTheme', themeName === NO_PROTOTYPE_THEME_VALUE ? '' : themeName)}
                            />
                        </Field>

                        <div className="space-y-3 border-t border-border pt-4">
                            <div className="space-y-1">
                                <h3 className="text-sm font-semibold text-foreground">文档模板</h3>
                                <p className="text-xs text-muted-foreground">查看项目内固定的文档模板。</p>
                            </div>
                            <DocumentTemplateSettings projectId={projectId} />
                        </div>

                        </section>
                    </TabsContent>

                    <TabsContent value="update" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <section className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <h3 className="text-base font-semibold text-foreground">项目更新</h3>
                                    <p className="text-xs text-muted-foreground">更新当前已注册 Make Client 项目的官方模板文件。</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5"
                                    onClick={() => loadMakeClientUpdateStatus()}
                                    disabled={makeClientUpdateStatusLoading || makeClientUpdateApplying}
                                >
                                    {makeClientUpdateStatusLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    检测更新
                                </Button>
                            </div>

                            <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
                                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                                    <span className="text-muted-foreground">当前客户端版本</span>
                                    <span className="truncate font-medium text-foreground">{makeClientUpdateStatus?.currentVersion || '未检测'}</span>
                                </div>
                                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                                    <span className="text-muted-foreground">最新模板版本</span>
                                    <span className="truncate font-medium text-foreground">{makeClientUpdateStatus?.targetVersion || '未检测'}</span>
                                </div>
                                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                                    <span className="text-muted-foreground">项目路径</span>
                                    <span className="truncate font-medium text-foreground" title={makeClientUpdateStatus?.projectRoot || ''}>{makeClientUpdateStatus?.projectRoot || '未检测'}</span>
                                </div>
                            </div>

                            {makeClientUpdateStatus?.metadataSource === 'bundled' ? (
                                <div
                                    className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300"
                                    title={makeClientUpdateStatus.metadataError || undefined}
                                >
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>未能连接线上更新源，当前显示本机可用版本。</span>
                                </div>
                            ) : null}

                            {makeClientUpdateStatus?.releaseNotes ? (
                                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
                                    <div className="font-medium text-foreground">版本说明</div>
                                    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words leading-5 text-muted-foreground">
                                        {makeClientUpdateStatus.releaseNotes}
                                    </div>
                                </div>
                            ) : null}

                            {visibleMakeClientUpdateBlocker ? (
                                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>{visibleMakeClientUpdateBlocker}</span>
                                </div>
                            ) : null}

                            {makeClientUpdateAvailable && !makeClientUpdateApplying ? (
                                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>
                                        更新前会自动备份本次覆盖的文件。你也可以先通过 Git 提交一版作为额外备份。
                                        <button
                                            type="button"
                                            className="ml-1 font-medium underline underline-offset-2"
                                            onClick={handleOpenVersionCollaboration}
                                        >
                                            打开版本管理
                                        </button>
                                    </span>
                                </div>
                            ) : null}

                            {makeClientUpdateApplying ? (
                                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                                    <div className="min-w-0 space-y-1">
                                        <div className="font-medium text-foreground">正在更新项目</div>
                                        <div>正在执行完整模板更新流程，请保持此窗口打开。</div>
                                        <div>更新失败时会保留错误诊断和备份位置，方便继续处理。</div>
                                    </div>
                                </div>
                            ) : null}

                            {makeClientUpdateResult ? (
                                <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                                    <div className="flex items-start gap-2">
                                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>{makeClientUpdateResult.postUpdateWarning ? '项目模板文件已更新完成。依赖安装或项目清单同步需要稍后重试。' : '项目更新完成。建议重启或刷新客户端后继续使用。'}</span>
                                    </div>
                                    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 pl-5">
                                        <span className="text-emerald-600/80 dark:text-emerald-300/80">备份位置</span>
                                        <span className="truncate font-mono text-[11px]" title={makeClientUpdateResult.backupRoot}>{makeClientUpdateResult.backupRoot}</span>
                                        <span className="text-emerald-600/80 dark:text-emerald-300/80">备份压缩包</span>
                                        <span className="truncate font-mono text-[11px]" title={makeClientUpdateResult.backupZipPath}>{makeClientUpdateResult.backupZipPath}</span>
                                    </div>
                                </div>
                            ) : null}

                            {makeClientUpdateResult?.postUpdateWarning ? (
                                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <div className="min-w-0 space-y-1">
                                        <div className="font-medium">后续步骤需要处理</div>
                                        <div>模板已经更新到新版本，但依赖安装或项目清单同步没有完成。请刷新或重启客户端；如果仍异常，再重新检测并处理依赖。</div>
                                    </div>
                                </div>
                            ) : null}

                            {latestMakeClientUpdateBackup ? (
                                <div className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-medium text-foreground">上次更新记录</div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 gap-1.5"
                                            onClick={handleCopyMakeClientUpdateRestorePrompt}
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                            复制给 AI 处理/还原
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-2">
                                        <span className="text-muted-foreground">更新时间</span>
                                        <span className="truncate font-medium text-foreground">{formatMakeClientUpdateBackupTime(latestMakeClientUpdateBackup.completedAt)}</span>
                                        <span className="text-muted-foreground">版本变化</span>
                                        <span className="truncate font-medium text-foreground">{latestMakeClientUpdateBackup.currentVersion} -&gt; {latestMakeClientUpdateBackup.targetVersion}</span>
                                        <span className="text-muted-foreground">覆盖文件</span>
                                        <span className="truncate font-medium text-foreground">{latestMakeClientUpdateBackup.writtenFilesCount} 个文件</span>
                                        <span className="text-muted-foreground">备份目录</span>
                                        <span className="truncate font-mono text-[11px]" title={latestMakeClientUpdateBackup.backupRoot}>{latestMakeClientUpdateBackup.backupRoot}</span>
                                        <span className="text-muted-foreground">备份压缩包</span>
                                        <span className="truncate font-mono text-[11px]" title={latestMakeClientUpdateBackup.backupZipPath}>{latestMakeClientUpdateBackup.backupZipPath}</span>
                                    </div>
                                </div>
                            ) : null}

                            {makeClientUpdateError ? (
                                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                                    <div className="flex items-start gap-2 text-destructive">
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>{formatMakeClientUpdateError(makeClientUpdateError, '项目更新失败')}</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={handleCopyMakeClientUpdateFailurePrompt}
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        复制给 AI 处理
                                    </Button>
                                </div>
                            ) : null}

                            <div className="flex items-center justify-end gap-2 pt-1">
                                <Button
                                    type="button"
                                    variant="brand"
                                    size="sm"
                                    className="gap-1.5"
                                    onClick={handleApplyMakeClientUpdate}
                                    aria-label="开始更新"
                                    disabled={
                                        makeClientUpdateApplying
                                        || makeClientUpdateStatusLoading
                                        || !makeClientUpdateCanApply
                                    }
                                    title={visibleMakeClientUpdateBlocker}
                                >
                                    {makeClientUpdateApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    {formatMakeClientUpdateActionLabel(makeClientUpdateStatus, makeClientUpdateApplying)}
                                </Button>
                            </div>
                        </section>
                    </TabsContent>

                    <TabsContent value="ai" className="m-0 min-h-0 flex-1 space-y-0 overflow-y-auto px-5 py-4.5">
                        <SettingsCollapsiblePanel title="本地 ACP 服务"
                            description={`${localAcpConnected ? '已链接' : '未链接'} · ${localAcpRuntime?.webBaseUrl || '地址未检测'} · ${formatLocalAcpCheckedAt(localAcpRuntime?.health.checkedAt)}`}
                            open={localAcpDetailsOpen}
                            onOpenChange={setLocalAcpDetailsOpen}
                            actions={(
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" onClick={localAcpHasCorsFailure || localAcpConnected ? handleLocalAcpRuntimeRefresh : handleLocalAcpRuntimeConnect} disabled={localAcpActionBusy} aria-label={localAcpActionLabel}>
                                                {localAcpActionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : localAcpConnected ? <RefreshCw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent arrow>{localAcpActionLabel}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        >
                            <div data-local-acp-status-card className="grid gap-3 text-xs">
                                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className="text-muted-foreground">状态</span>
                                    <span className={localAcpConnected ? 'font-medium text-emerald-600' : 'font-medium text-muted-foreground'}>
                                        {localAcpConnected ? '已链接' : '未链接'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className="text-muted-foreground">上次检测</span>
                                    <span className="truncate font-medium text-foreground">
                                        {formatLocalAcpCheckedAt(localAcpRuntime?.health.checkedAt)}
                                    </span>
                                </div>
                                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className="text-muted-foreground">地址</span>
                                    <span className="truncate font-medium text-foreground" title={localAcpRuntime?.webBaseUrl || ''}>
                                        {localAcpRuntime?.webBaseUrl || '未检测'}
                                    </span>
                                </div>
                                {localAcpRuntime?.health.message ? (
                                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                        <span className="text-muted-foreground">检测结果</span>
                                        <span
                                            className={localAcpConnected ? 'truncate text-emerald-600' : 'truncate text-amber-600'}
                                            title={localAcpRuntime.health.message}
                                        >
                                            {localAcpRuntime.health.message}
                                        </span>
                                    </div>
                                ) : null}
                                {!localAcpConnected && localAcpRuntime ? (
                                    <div data-local-acp-repair className="mt-1 space-y-2 border-t border-border/70 pt-2">
                                        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                            <span className="text-muted-foreground">修复信息</span>
                                            <div className="min-w-0 space-y-1">
                                                <div className="break-words leading-5 text-foreground">
                                                    {resolveLocalAcpRepairMessage({
                                                        runtime: localAcpRuntime,
                                                        failureMessage: localAcpFailureContext?.message,
                                                    })}
                                                </div>
                                                {localAcpFailureContext?.source ? (
                                                    <div className="text-muted-foreground">
                                                        来源：{localAcpFailureContext.source}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                        {resolveLocalAcpRepairCommand(localAcpRuntime) ? (
                                            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                                <span className="text-muted-foreground">启动命令</span>
                                                <code className="block min-w-0 whitespace-pre-wrap break-words rounded border border-border bg-background px-2 py-1.5 font-mono text-[12px] leading-5 text-foreground [overflow-wrap:anywhere]">
                                                    {resolveLocalAcpRepairCommand(localAcpRuntime)}
                                                </code>
                                            </div>
                                        ) : null}
                                        <div className="flex flex-wrap items-center gap-3 pl-[96px]">
                                            <button
                                                type="button"
                                                className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                                                onClick={handleCopyLocalAcpRepairCommand}
                                                disabled={!resolveLocalAcpRepairCommand(localAcpRuntime)}
                                            >
                                                复制启动命令
                                            </button>
                                            <button
                                                type="button"
                                                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                                                onClick={handleCopyLocalAcpTroubleshootingPrompt}
                                            >
                                                复制给 AI 处理
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                        </SettingsCollapsiblePanel>

                        <SettingsCollapsiblePanel title="本地桌面 Agent"
                            description="配置从 Make 打开的桌面 Agent；路径用于系统无法自动发现应用时的兜底。"
                        >
                            <div className="space-y-4">
                                <Field>
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium text-foreground">注入 Axhub Make 入口</div>
                                            <FieldDescription>
                                                关闭后仍会启动本地 AI 应用和项目，但不会注入 Axhub Make 入口。
                                            </FieldDescription>
                                        </div>
                                        <Switch
                                            checked={formState.injectLocalAiEntry}
                                            onCheckedChange={(checked) => updateField('injectLocalAiEntry', checked === true)}
                                            aria-label="注入 Axhub Make 入口"
                                        />
                                    </div>
                                </Field>
                                <LocalAgentPathSettings
                                    group="desktop"
                                    options={LOCAL_DESKTOP_AGENT_PATH_OPTIONS}
                                    value={formState.localDesktopAgentPaths}
                                    onChange={(value) => updateField('localDesktopAgentPaths', value)}
                                />
                            </div>
                        </SettingsCollapsiblePanel>

                                <SettingsCollapsiblePanel title="本地 CLI Agent"
                                    description={`已安装 ${installedLocalAiAgentOptions.length}/${LOCAL_AI_AGENT_OPTIONS.length}${agentProviderTestingCount ? ` · ${agentProviderTestingCount} 个测试中` : agentProviderFailureCount ? ` · ${agentProviderFailureCount} 个失败` : agentProviderPassedCount ? ` · ${agentProviderPassedCount} 个通过` : ' · 尚未测试'}`}
                                    open={agentDiagnosticsOpen}
                                    onOpenChange={setAgentDiagnosticsOpen}
                                    actions={(
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => void loadAgentVersions(true)} disabled={agentVersionsLoading} aria-label="重新检测所有 Agent">
                                                        {agentVersionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent arrow>重新检测版本</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                >
                                    <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-muted/30">
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead className="h-8 w-[170px] px-3 text-xs">Agent</TableHead>
                                                        <TableHead className="h-8 w-[180px] px-3 text-xs">版本</TableHead>
                                                        <TableHead className="h-8 w-[230px] px-3 text-center text-xs">上次测试</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                {LOCAL_AI_AGENT_OPTIONS.map((option) => {
                                                    const meta = formatAgentVersionMeta(agentVersions[option.versionKey], latestAgentVersions[option.versionKey]);
                                                    const metaTitle = formatAgentVersionMetaTitle(agentVersions[option.versionKey], latestAgentVersions[option.versionKey]);
                                                    const testState = agentProviderTests[option.value];
                                                    const testLabel = getAgentProviderTestLabel(testState);
                                                    const isTesting = testState?.status === 'testing';
                                                    const testTime = testState?.status === 'passed' ? formatAgentProviderTestTime(testState.testedAt) : '';
                                                    const optionInstalled = agentVersions[option.versionKey]?.status === 'installed';
                                                    const versionRefreshing = agentVersionRefreshingProvider === option.provider;
                                                    const versionLoading = agentVersionsLoading || versionRefreshing;
                                                    return (
                                                        <TableRow key={option.value}>
                                                            <TableCell className="w-[170px] max-w-[170px] px-3 py-2">
                                                                <span className="inline-flex min-w-0 max-w-full items-center gap-2 font-medium text-foreground">
                                                                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                                                                        {getAgentProviderIcon(option.provider)}
                                                                    </span>
                                                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="w-[180px] max-w-[180px] px-3 py-2 text-xs text-muted-foreground">
                                                                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                                                                    <span className="block max-w-[144px] truncate font-mono text-[11px] leading-4" title={metaTitle || undefined}>{meta || (versionLoading ? '检测中' : '未检测')}</span>
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="icon-xs"
                                                                                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                                                                    onClick={() => void refreshAgentVersion(option.provider)}
                                                                                    disabled={versionRefreshing}
                                                                                    aria-label={`刷新 ${option.label} 版本`}
                                                                                >
                                                                                    {versionRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent arrow>刷新版本</TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="w-[230px] max-w-[230px] px-3 py-2 text-center text-xs align-middle">
                                                                <div className="inline-flex min-w-0 max-w-full items-center justify-center gap-2">
                                                                    <div className="flex min-w-0 flex-col items-center text-center gap-0.5">
                                                                        {testLabel ? (
                                                                            <span
                                                                                className={testState?.status === 'passed'
                                                                                    ? 'inline-flex max-w-[190px] items-center gap-1 whitespace-normal break-words leading-5 text-emerald-600 [overflow-wrap:anywhere]'
                                                                                    : testState?.status === 'testing'
                                                                                        ? 'inline-flex max-w-[190px] items-center gap-1 whitespace-normal break-words leading-5 text-muted-foreground [overflow-wrap:anywhere]'
                                                                                        : 'block max-w-[190px] whitespace-normal break-words leading-5 text-destructive [overflow-wrap:anywhere]'}
                                                                                title={testState?.message || testLabel}
                                                                            >
                                                                                {isTesting ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
                                                                                {testLabel}{testState?.status === 'failed' && testState.message && testState.message !== testLabel ? `：${testState.message}` : ''}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-muted-foreground">未测试</span>
                                                                        )}
                                                                        {testState?.status === 'passed' && testTime ? (
                                                                            <span className="text-muted-foreground">{testTime}</span>
                                                                        ) : null}
                                                                    </div>
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="icon-xs"
                                                                                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                                                                    onClick={() => handleAgentProviderTest(option)}
                                                                                    disabled={isTesting || !optionInstalled}
                                                                                    aria-label={`测试 ${option.label}`}
                                                                                >
                                                                                    {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent arrow>测试连接</TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                                </TableBody>
                                            </Table>
                                    </div>
                                </SettingsCollapsiblePanel>

                                <SettingsCollapsiblePanel title="AI 用途配置"
                                    description="配置对话、批注和画布使用的 Agent、模型及批注执行偏好。"
                                    contentClassName="space-y-4"
                                >
                                    <div role="table" aria-label="AI 用途配置" className="min-w-0 overflow-hidden rounded-md border border-border">
                                        <div role="rowgroup">
                                            <div role="row" className="hidden min-w-0 grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] border-b border-border bg-muted/30 sm:grid">
                                                <div role="columnheader" className="min-w-0 px-3 py-2 text-xs font-medium text-muted-foreground">用途</div>
                                                <div role="columnheader" className="min-w-0 px-3 py-2 text-xs font-medium text-muted-foreground">Agent</div>
                                                <div role="columnheader" className="min-w-0 px-3 py-2 text-xs font-medium text-muted-foreground">模型</div>
                                            </div>
                                        </div>
                                        <div role="rowgroup" className="min-w-0">
                                            {conversationUiEnabled ? renderAiPurposeConfigRow('对话 AI', 'conversationPromptClient', 'conversationModel') : null}
                                            {renderAiPurposeConfigRow('批注 AI', 'annotationPromptClient', 'annotationModel')}
                                            {renderAiPurposeConfigRow('画布 AI', 'canvasPromptClient', 'canvasModel')}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field className="gap-1.5">
                                            <FieldLabelWithHint hint="批量批注执行时同时发送的 AI 任务数量，默认 5。">批注 AI 并发数</FieldLabelWithHint>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={10}
                                                value={formState.agentRunConcurrency}
                                                onChange={(event) => updateField('agentRunConcurrency', sanitizeAgentRunConcurrency(event.target.value))}
                                            />
                                        </Field>
                                        <Field className="gap-1.5">
                                            <FieldLabelWithHint hint="AI 任务完成后立即移除已完成批注，默认开启。">任务完成后自动清空批注</FieldLabelWithHint>
                                            <Switch
                                                checked={formState.autoClearCompletedComments}
                                                onCheckedChange={(checked) => updateField('autoClearCompletedComments', checked === true)}
                                                aria-label="任务完成后自动清空批注"
                                            />
                                        </Field>
                                    </div>
                                </SettingsCollapsiblePanel>

                                <SettingsCollapsiblePanel title="声音通知"
                                    description="仅保存在当前浏览器；不影响项目配置和 AI 执行。"
                                >
                                    <div data-ai-notification-settings className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-foreground">完成音</div>
                                                <div className="text-xs text-muted-foreground">批注或侧边栏 AI 成功完成时播放</div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <Switch
                                                    checked={notificationSettings.completionEnabled}
                                                    onCheckedChange={(checked) => updateNotificationSetting({ completionEnabled: checked === true })}
                                                    aria-label="启用完成音"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    aria-label="试听完成音"
                                                    onClick={() => { void notificationPlayer.play('completion'); }}
                                                >
                                                    <Play className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-foreground">提醒音</div>
                                                <div className="text-xs text-muted-foreground">批注或侧边栏 AI 报错时播放</div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <Switch
                                                    checked={notificationSettings.reminderEnabled}
                                                    onCheckedChange={(checked) => updateNotificationSetting({ reminderEnabled: checked === true })}
                                                    aria-label="启用提醒音"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    aria-label="试听提醒音"
                                                    onClick={() => { void notificationPlayer.play('reminder'); }}
                                                >
                                                    <Play className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </SettingsCollapsiblePanel>

                                <SettingsCollapsiblePanel title="图片生成 API"
                                    description="配置图片生成 API 的接口信息。"
                                >
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <Field>
                                            <FieldLabelWithHint hint="OpenAI 或兼容服务的 /v1 API 地址">Base URL</FieldLabelWithHint>
                                            <Input
                                                value={formState.aiBaseUrl}
                                                onChange={(event) => updateField('aiBaseUrl', event.target.value)}
                                                placeholder="https://api.openai.com/v1"
                                            />
                                        </Field>

                                        <Field>
                                            <FieldLabelWithHint hint="保存在本机服务端配置，不写入项目仓库">API Key</FieldLabelWithHint>
                                            <Input
                                                type="password"
                                                value={formState.aiApiKey}
                                                onChange={(event) => updateField('aiApiKey', event.target.value)}
                                                placeholder="sk-..."
                                            />
                                        </Field>

                                        <Field>
                                            <FieldLabelWithHint hint="图片生成模型 ID">模型</FieldLabelWithHint>
                                            <Input
                                                value={formState.aiModel}
                                                onChange={(event) => updateField('aiModel', event.target.value)}
                                                placeholder="gpt-image-2"
                                            />
                                        </Field>

                                        <Field data-ai-image-last-test className="min-w-0">
                                            <FieldLabelWithHint hint="图片生成配置的最近一次测试状态">上次测试</FieldLabelWithHint>
                                            <div className="flex min-h-9 min-w-0 items-center text-sm">
                                                {aiImageConfigLastTest?.status === 'passed' ? (
                                                    <span className="block max-w-full whitespace-normal break-words leading-5 text-emerald-600 [overflow-wrap:anywhere]">
                                                        {getAiImageConfigLastTestLabel(aiImageConfigLastTest)} · {formatAiImageConfigLastTestTime(aiImageConfigLastTest?.testedAt)}
                                                    </span>
                                                ) : aiImageConfigLastTest?.status === 'failed' ? (
                                                    <span className="block max-w-full whitespace-normal break-words leading-5 text-destructive [overflow-wrap:anywhere]" title={aiImageConfigLastTest.message}>
                                                        {getAiImageConfigLastTestLabel(aiImageConfigLastTest)}{aiImageConfigLastTest.message ? `：${aiImageConfigLastTest.message}` : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">未测试</span>
                                                )}
                                            </div>
                                        </Field>
                                    </div>

                                    <div data-ai-image-config-actions className="mt-4 flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={handleAiImageConfigTest}
                                            disabled={loading || aiImageConfigTest.status === 'testing'}
                                        >
                                            {aiImageConfigTest.status === 'testing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                            {aiImageConfigTest.status === 'testing' ? '测试中...' : '测试图片配置'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={handleImportCodexConfig}
                                            disabled={loading || aiImageConfigTest.status === 'testing'}
                                        >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                            读取本地 Codex 配置
                                        </Button>
                                        {aiImageConfigTest.status === 'passed' ? (
                                            <span className="block max-w-full whitespace-normal break-words text-xs leading-5 text-emerald-600 [overflow-wrap:anywhere] min-w-0 flex-[1_1_220px]">{aiImageConfigTest.message || '测试通过'}</span>
                                        ) : aiImageConfigTest.status === 'failed' ? (
                                            <span className="block max-w-full whitespace-normal break-words text-xs leading-5 text-destructive [overflow-wrap:anywhere] min-w-0 flex-[1_1_220px]" title={aiImageConfigTest.message}>测试失败：{aiImageConfigTest.message}</span>
                                        ) : null}
                                    </div>
                                </SettingsCollapsiblePanel>
                                <VoiceAssistantSettingsSection
                                    ref={voiceAssistantSettingsRef}
                                    active={activeTab === 'ai'}
                                    initialSection={initialVoiceSection}
                                    projectId={projectId}
                                />
                    </TabsContent>

                    <TabsContent value="network" className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-4.5">
                        <section className="space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-base font-semibold text-foreground">网络配置</h3>
                            <p className="text-xs text-muted-foreground">配置服务监听地址与网络访问范围。</p>
                        </div>

                        <Field>
                            <FieldLabelWithHint hint="复制本地访问链接时使用的地址。通常保持 localhost 即可。">本地地址</FieldLabelWithHint>
                            <Input
                                value={formState.host}
                                onChange={(event) => updateField('host', event.target.value)}
                                placeholder="localhost"
                            />
                        </Field>

                        <Field>
                            <FieldLabelWithHint hint="复制局域网链接和二维码时使用的固定地址，可手动填写或从检测到的地址中选择。">局域网地址</FieldLabelWithHint>
                            <Input
                                value={formState.lanHost}
                                onChange={(event) => updateField('lanHost', event.target.value)}
                                placeholder={availableLANHosts[0] || '192.168.1.10'}
                            />
                            {availableLANHosts.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {availableLANHosts.slice(0, 4).map((host) => (
                                        <button
                                            key={host}
                                            type="button"
                                            className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] leading-5 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                                            onClick={() => updateField('lanHost', host)}
                                        >
                                            {host}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </Field>

                        <Field>
                            <div className="flex items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="text-sm font-medium text-foreground">预览免验证</div>
                                    <FieldDescription>
                                        开启后，局域网可直接访问当前项目预览；管理端和 API 仍需验证。
                                    </FieldDescription>
                                </div>
                                <Switch
                                    checked={formState.skipLanPreviewAuth}
                                    onCheckedChange={(checked) => updateField('skipLanPreviewAuth', checked === true)}
                                    aria-label="预览免验证"
                                />
                            </div>
                        </Field>

                        <Field>
                            <FieldLabelWithHint hint="设置后非本机访问管理端、API、客户端预览都需要验证。修改或清除密码会让旧链接和登录失效。">局域网访问密码</FieldLabelWithHint>
                            <div className="flex gap-2">
                                <Input
                                    type="password"
                                    value={lanAccessPassword}
                                    onChange={(event) => setLanAccessPassword(event.target.value)}
                                    placeholder={lanAccessStatus?.passwordSet ? '输入新密码以修改' : '设置局域网访问密码'}
                                    autoComplete="new-password"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0 gap-1.5"
                                    disabled={lanAccessPasswordSaving}
                                    onClick={() => void handleLanAccessPasswordSave()}
                                >
                                    {lanAccessPasswordSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                    {lanAccessStatus?.passwordSet ? '修改' : '设置'}
                                </Button>
                                {lanAccessStatus?.passwordSet ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="shrink-0 text-destructive hover:text-destructive"
                                        disabled={lanAccessPasswordSaving}
                                        onClick={() => void handleLanAccessPasswordClear()}
                                    >
                                        清除
                                    </Button>
                                ) : null}
                            </div>
                            <FieldDescription>
                                {lanAccessStatus?.passwordSet ? '已设置密码，非本机访问会要求验证。' : '未设置密码时，非本机局域网访问不可用。'}
                            </FieldDescription>
                        </Field>

                        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="text-sm font-medium text-foreground">全局二维码</div>
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        生成当前 Make 管理端项目页的 10 分钟局域网链接。
                                    </p>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        disabled={!lanAccessStatus?.passwordSet || lanAccessShareGenerating}
                                        onClick={() => void handleGenerateGlobalLanQRCode()}
                                    >
                                        {lanAccessShareGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                        生成
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        disabled={!lanAccessShareUrl}
                                        onClick={() => void handleCopyGlobalLanShareUrl()}
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                        复制
                                    </Button>
                                </div>
                            </div>
                            {!lanAccessStatus?.passwordSet ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                                    请先设置局域网访问密码后再生成二维码。
                                </div>
                            ) : lanAccessShareUrl ? (
                                <div className="flex items-center gap-3">
                                    <div className="rounded-md border bg-background p-2">
                                        <QRCode value={lanAccessShareUrl} size={120} bordered={false} />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                                        <div className="truncate">{lanAccessShareUrl}</div>
                                        <div>有效至 {formatShareExpiry(lanAccessShareExpiresAt) || '10 分钟后'}</div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        </section>
                    </TabsContent>

                    <SheetFooter className="flex flex-row items-center justify-between gap-3 border-t px-5 py-3.5">
                        <div className="min-w-0">
                            {activeTab === 'ai' ? (
                                <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="h-auto px-0 py-0 text-xs text-emerald-600 hover:text-emerald-700"
                                    onClick={() => void handleCopyGlobalSettingsAiPrompt()}
                                >
                                    复制 AI 配置提示词
                                </Button>
                            ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={onClose}
                                disabled={loading || aiImageConfigTest.status === 'testing' || makeClientUpdateApplying}
                            >
                                取消
                            </Button>
                            {activeTab === 'update' ? null : (
                                <Button
                                    type="button"
                                    variant="brand"
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={loading || aiImageConfigTest.status === 'testing'}
                                >
                                    {loading ? '保存中...' : '保存'}
                                </Button>
                            )}
                        </div>
                    </SheetFooter>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
