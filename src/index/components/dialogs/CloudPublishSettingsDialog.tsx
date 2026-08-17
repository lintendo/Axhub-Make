import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

import { apiService, type CloudPublishTarget, type CloudPublishingConfigPayload, type CloudPublishingConfigResponse } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabelWithHint } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CloudPublishSettingsForm {
    vercel: {
        token: string;
        projectName: string;
        teamId: string;
    };
    cloudflarePages: {
        apiToken: string;
        accountId: string;
        projectName: string;
        productionBranch: string;
    };
    s3: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        bucket: string;
        prefix: string;
        baseUrl: string;
        endpoint: string;
    };
    githubPages: {
        repository: string;
        branch: string;
        sourceDirectory: string;
        pathPrefix: string;
    };
    publishSettings: {
        includeSource: boolean;
        visibleTargets: CloudPublishTarget[];
    };
}
type ConfigurableCloudPublishTarget = Exclude<CloudPublishTarget, 'axhub'>;
type CloudPublishSettingsTab = ConfigurableCloudPublishTarget | 'publish-settings';

interface CloudPublishSettingsDialogProps {
    open: boolean;
    projectId: string;
    initialTarget: CloudPublishSettingsTab;
    onOpenChange: (open: boolean) => void;
    onSaved?: (config: CloudPublishingConfigResponse) => void;
}

const EMPTY_FORM: CloudPublishSettingsForm = {
    vercel: {
        token: '',
        projectName: '',
        teamId: '',
    },
    cloudflarePages: {
        apiToken: '',
        accountId: '',
        projectName: '',
        productionBranch: 'main',
    },
    s3: {
        accessKeyId: '',
        secretAccessKey: '',
        region: '',
        bucket: '',
        prefix: '',
        baseUrl: '',
        endpoint: '',
    },
    githubPages: {
        repository: '',
        branch: 'gh-pages',
        sourceDirectory: '/',
        pathPrefix: '',
    },
    publishSettings: {
        includeSource: false,
        visibleTargets: ['axhub'],
    },
};

const PUBLISH_PLATFORM_OPTIONS: Array<{ id: CloudPublishTarget; label: string }> = [
    { id: 'axhub', label: 'Axhub' },
    { id: 's3', label: '对象存储' },
    { id: 'vercel', label: 'Vercel' },
    { id: 'cloudflare-pages', label: 'Cloudflare Pages' },
    { id: 'github-pages', label: 'GitHub Pages' },
];

function buildCloudPublishAiConfigPrompt(target: ConfigurableCloudPublishTarget): string {
    switch (target) {
        case 's3':
            return '请帮我配置 Axhub Make 对象存储发布。配置文件是 Make Server 全局配置：默认 ~/.axhub/make/server.config.json；如果设置了 AXHUB_MAKE_HOME_DIR，则写 $AXHUB_MAKE_HOME_DIR/.axhub/make/server.config.json。请引导我提供 accessKeyId、secretAccessKey、region、bucket、baseUrl，可选 prefix、endpoint，然后写入 JSON 的 cloudPublishing.s3。';
        case 'vercel':
            return '请帮我配置 Axhub Make Vercel 发布。配置文件是 Make Server 全局配置：默认 ~/.axhub/make/server.config.json；如果设置了 AXHUB_MAKE_HOME_DIR，则写 $AXHUB_MAKE_HOME_DIR/.axhub/make/server.config.json。请引导我提供 token、projectName，可选 teamId，然后写入 JSON 的 cloudPublishing.vercel。';
        case 'cloudflare-pages':
            return '请帮我配置 Axhub Make Cloudflare Pages 发布。配置文件是 Make Server 全局配置：默认 ~/.axhub/make/server.config.json；如果设置了 AXHUB_MAKE_HOME_DIR，则写 $AXHUB_MAKE_HOME_DIR/.axhub/make/server.config.json。请引导我提供 apiToken、accountId，可选 projectName，productionBranch 默认 main，然后写入 JSON 的 cloudPublishing.cloudflarePages。';
        case 'github-pages':
            return '请帮我配置 Axhub Make GitHub Pages 发布。配置文件是 Make Server 全局配置：默认 ~/.axhub/make/server.config.json；如果设置了 AXHUB_MAKE_HOME_DIR，则写 $AXHUB_MAKE_HOME_DIR/.axhub/make/server.config.json。请引导我提供 repository、branch、sourceDirectory，可选 pathPrefix；repository 可从 git remote 推断，branch 默认 gh-pages，sourceDirectory 只能是 / 或 /docs。然后写入 JSON 的 cloudPublishing.githubPages。';
    }
}

function cloneForm(form: CloudPublishSettingsForm): CloudPublishSettingsForm {
    return {
        vercel: { ...form.vercel },
        cloudflarePages: { ...form.cloudflarePages },
        s3: { ...form.s3 },
        githubPages: { ...form.githubPages },
        publishSettings: { ...form.publishSettings },
    };
}

function mergeConfig(config?: CloudPublishingConfigPayload): CloudPublishSettingsForm {
    return {
        vercel: {
            ...EMPTY_FORM.vercel,
            ...(config?.vercel || {}),
        },
        cloudflarePages: {
            ...EMPTY_FORM.cloudflarePages,
            ...(config?.cloudflarePages || {}),
        },
        s3: {
            ...EMPTY_FORM.s3,
            ...(config?.s3 || {}),
        },
        githubPages: {
            ...EMPTY_FORM.githubPages,
            ...(config?.githubPages || {}),
        },
        publishSettings: {
            ...EMPTY_FORM.publishSettings,
            ...(config?.publishSettings || {}),
        },
    };
}

function FieldInput({
    label,
    subtitle,
    name,
    value,
    onChange,
    type = 'text',
    placeholder,
    description,
    required = false,
}: {
    label: string;
    subtitle?: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    type?: React.HTMLInputTypeAttribute;
    placeholder?: string;
    description?: string;
    required?: boolean;
}) {
    const inputId = `cloud-publish-${name}`;
    return (
        <Field className="content-start">
            <FieldLabelWithHint htmlFor={inputId}>
                <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span>
                        {label}{required ? <span className="ml-1 text-destructive">*</span> : null}
                    </span>
                    {subtitle ? <span className="text-xs font-normal text-muted-foreground">{subtitle}</span> : null}
                </span>
            </FieldLabelWithHint>
            <Input
                id={inputId}
                name={name}
                type={type}
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                onChange={(event) => onChange(event.target.value)}
            />
            {description ? <FieldDescription className="text-xs">{description}</FieldDescription> : null}
        </Field>
    );
}

export default function CloudPublishSettingsDialog({
    open,
    projectId,
    initialTarget,
    onOpenChange,
    onSaved,
}: CloudPublishSettingsDialogProps) {
    const [activeTab, setActiveTab] = useState<CloudPublishSettingsTab>(initialTarget);
    const [form, setForm] = useState<CloudPublishSettingsForm>(() => cloneForm(EMPTY_FORM));
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setActiveTab(initialTarget);
        }
    }, [initialTarget, open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        apiService.getCloudPublishingConfig({ projectId })
            .then((config) => {
                if (cancelled) return;
                setForm(mergeConfig({
                    vercel: config.targets.vercel,
                    cloudflarePages: config.targets.cloudflarePages,
                    s3: config.targets.s3,
                    githubPages: config.targets.githubPages,
                    publishSettings: config.targets.publishSettings,
                }));
            })
            .catch((error: any) => {
                if (cancelled) return;
                toast.error(error?.message || '加载云服务发布配置失败');
                setForm(cloneForm(EMPTY_FORM));
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [open, projectId]);

    const updateVercel = (field: keyof CloudPublishSettingsForm['vercel'], value: string) => {
        setForm((previous) => ({
            ...previous,
            vercel: {
                ...previous.vercel,
                [field]: value,
            },
        }));
    };

    const updateCloudflarePages = (field: keyof CloudPublishSettingsForm['cloudflarePages'], value: string) => {
        setForm((previous) => ({
            ...previous,
            cloudflarePages: {
                ...previous.cloudflarePages,
                [field]: value,
            },
        }));
    };

    const updateS3 = (field: keyof CloudPublishSettingsForm['s3'], value: string) => {
        setForm((previous) => ({
            ...previous,
            s3: {
                ...previous.s3,
                [field]: value,
            },
        }));
    };

    const updateGitHubPages = (field: keyof CloudPublishSettingsForm['githubPages'], value: string) => {
        setForm((previous) => ({
            ...previous,
            githubPages: {
                ...previous.githubPages,
                [field]: value,
            },
        }));
    };

    const updatePublishSettings = (field: 'includeSource', value: boolean) => {
        setForm((previous) => ({
            ...previous,
            publishSettings: {
                ...previous.publishSettings,
                [field]: value,
            },
        }));
    };

    const toggleVisibleTarget = (target: CloudPublishTarget, visible: boolean) => {
        setForm((previous) => {
            const currentTargets = previous.publishSettings.visibleTargets || ['axhub'];
            const nextTargets = visible
                ? [...currentTargets, target]
                : currentTargets.filter((item) => item !== target);
            return {
                ...previous,
                publishSettings: {
                    ...previous.publishSettings,
                    visibleTargets: PUBLISH_PLATFORM_OPTIONS
                        .map((option) => option.id)
                        .filter((targetId) => nextTargets.includes(targetId)),
                },
            };
        });
    };

    const payload = useMemo<CloudPublishingConfigPayload>(() => ({
        vercel: {
            token: form.vercel.token,
            projectName: form.vercel.projectName,
            teamId: form.vercel.teamId,
        },
        cloudflarePages: {
            apiToken: form.cloudflarePages.apiToken,
            accountId: form.cloudflarePages.accountId,
            projectName: form.cloudflarePages.projectName,
            productionBranch: form.cloudflarePages.productionBranch || 'main',
        },
        s3: {
            accessKeyId: form.s3.accessKeyId,
            secretAccessKey: form.s3.secretAccessKey,
            region: form.s3.region,
            bucket: form.s3.bucket,
            prefix: form.s3.prefix,
            baseUrl: form.s3.baseUrl,
            endpoint: form.s3.endpoint,
        },
        githubPages: {
            repository: form.githubPages.repository,
            branch: form.githubPages.branch || 'gh-pages',
            sourceDirectory: form.githubPages.sourceDirectory || '/',
            pathPrefix: form.githubPages.pathPrefix,
        },
        publishSettings: {
            includeSource: form.publishSettings.includeSource === true,
            visibleTargets: form.publishSettings.visibleTargets,
        },
    }), [form]);

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const savedConfig = await apiService.saveCloudPublishingConfig(payload, { projectId });
            toast.success('云服务发布设置已保存');
            onSaved?.(savedConfig);
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error?.message || '保存云服务发布配置失败');
        } finally {
            setSaving(false);
        }
    };

    const handleCopyAiConfigPrompt = async () => {
        if (activeTab === 'publish-settings') return;
        try {
            await navigator.clipboard.writeText(buildCloudPublishAiConfigPrompt(activeTab));
            toast.success('AI 配置提示词已复制');
        } catch {
            toast.error('复制 AI 配置提示词失败');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[560px] w-[min(90vw,760px)] max-w-[760px] flex-col overflow-hidden p-0 text-sm [&>[data-dialog-close]]:hidden">
                <DialogTitle className="sr-only">云服务发布设置</DialogTitle>
                <Tabs value={activeTab} onValueChange={(value) => {
                    const nextTab = value as CloudPublishSettingsTab;
                    setActiveTab(nextTab);
                }} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                        <TabsList className="h-8 rounded-md bg-muted/70 p-0.5">
                            <TabsTrigger value="s3" className="h-7 px-3 text-xs">对象存储</TabsTrigger>
                            <TabsTrigger value="vercel" className="h-7 px-3 text-xs">Vercel</TabsTrigger>
                            <TabsTrigger value="cloudflare-pages" className="h-7 px-3 text-xs">Cloudflare Pages</TabsTrigger>
                            <TabsTrigger value="github-pages" className="h-7 px-3 text-xs">GitHub Pages</TabsTrigger>
                            <TabsTrigger value="publish-settings" className="h-7 px-3 text-xs">发布设置</TabsTrigger>
                        </TabsList>
                        <Button type="button" variant="ghost" size="icon-xs" onClick={() => onOpenChange(false)} aria-label="关闭">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                        {loading ? (
                            <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                加载配置中...
                            </div>
                        ) : (
                            <>
                                <TabsContent value="s3" className="m-0 grid gap-4">
                                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                                        支持阿里云 OSS、腾讯云 COS、华为云 OBS 等国内主流兼容 S3 标准的云服务。带 <span className="text-destructive">*</span> 的字段为必填；对象前缀和上传入口可按服务情况填写。
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <FieldInput
                                            label="访问密钥 ID"
                                            subtitle="Access Key ID"
                                            name="accessKeyId"
                                            value={form.s3.accessKeyId}
                                            required
                                            onChange={(value) => updateS3('accessKeyId', value)}
                                        />
                                        <FieldInput
                                            label="访问密钥 Secret"
                                            subtitle="Secret Access Key"
                                            name="secretAccessKey"
                                            type="password"
                                            value={form.s3.secretAccessKey}
                                            required
                                            onChange={(value) => updateS3('secretAccessKey', value)}
                                        />
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <FieldInput
                                            label="地域"
                                            subtitle="Region"
                                            name="region"
                                            value={form.s3.region}
                                            required
                                            placeholder="cn-hangzhou"
                                            description="用于 S3 签名；请填写云服务控制台里的地域标识。"
                                            onChange={(value) => updateS3('region', value)}
                                        />
                                        <FieldInput
                                            label="存储桶"
                                            subtitle="Bucket"
                                            name="bucket"
                                            value={form.s3.bucket}
                                            required
                                            onChange={(value) => updateS3('bucket', value)}
                                        />
                                    </div>
                                    <FieldInput
                                        label="对象前缀"
                                        subtitle="Prefix"
                                        name="prefix"
                                        value={form.s3.prefix}
                                        placeholder="home"
                                        description="可选；填写后会固定作为对象 key 前缀，例如 home/index.html。留空时会按当前发布资源自动生成目录。"
                                        onChange={(value) => updateS3('prefix', value)}
                                    />
                                    <FieldInput
                                        label="访问地址"
                                        subtitle="Base URL"
                                        name="baseUrl"
                                        value={form.s3.baseUrl}
                                        required
                                        placeholder="https://webpp.oss-cn-hangzhou.aliyuncs.com"
                                        description="发布成功 URL 使用访问地址 + 实际对象前缀/index.html。"
                                        onChange={(value) => updateS3('baseUrl', value)}
                                    />
                                    <FieldInput
                                        label="上传入口"
                                        subtitle="Endpoint"
                                        name="endpoint"
                                        value={form.s3.endpoint}
                                        placeholder="https://s3.oss-cn-hangzhou.aliyuncs.com"
                                        description="可选；兼容 S3 标准的上传入口。留空时会按存储桶和地域生成 AWS S3 默认入口。"
                                        onChange={(value) => updateS3('endpoint', value)}
                                    />
                                </TabsContent>

                                <TabsContent value="vercel" className="m-0 grid gap-4">
                                    <FieldInput
                                        label="Token"
                                        name="token"
                                        type="password"
                                        value={form.vercel.token}
                                        required
                                        onChange={(value) => updateVercel('token', value)}
                                    />
                                    <FieldInput
                                        label="Project Name"
                                        name="projectName"
                                        value={form.vercel.projectName}
                                        required
                                        placeholder="axhub-home"
                                        onChange={(value) => updateVercel('projectName', value)}
                                    />
                                    <FieldInput
                                        label="Team ID"
                                        name="teamId"
                                        value={form.vercel.teamId}
                                        placeholder="team_xxx"
                                        description="可选；发布到团队项目时填写。"
                                        onChange={(value) => updateVercel('teamId', value)}
                                    />
                                </TabsContent>

                                <TabsContent value="cloudflare-pages" className="m-0 grid gap-4">
                                    <FieldInput
                                        label="API Token"
                                        name="apiToken"
                                        type="password"
                                        value={form.cloudflarePages.apiToken}
                                        required
                                        onChange={(value) => updateCloudflarePages('apiToken', value)}
                                    />
                                    <FieldInput
                                        label="Account ID"
                                        name="accountId"
                                        value={form.cloudflarePages.accountId}
                                        required
                                        onChange={(value) => updateCloudflarePages('accountId', value)}
                                    />
                                    <FieldInput
                                        label="Project Name"
                                        name="projectName"
                                        value={form.cloudflarePages.projectName}
                                        description="可选；留空时会按当前发布资源自动生成项目名。Cloudflare Pages 项目需要先在控制台创建，不同原型可以发布到不同 Cloudflare Pages 项目。"
                                        onChange={(value) => updateCloudflarePages('projectName', value)}
                                    />
                                    <FieldInput
                                        label="Production Branch"
                                        name="productionBranch"
                                        value={form.cloudflarePages.productionBranch}
                                        required
                                        placeholder="main"
                                        onChange={(value) => updateCloudflarePages('productionBranch', value)}
                                    />
                                </TabsContent>

                                <TabsContent value="github-pages" className="m-0 grid gap-4">
                                    <FieldInput
                                        label="Repository"
                                        name="repository"
                                        value={form.githubPages.repository}
                                        placeholder="owner/repo"
                                        description="留空时会优先从当前项目 git remote 推断。"
                                        onChange={(value) => updateGitHubPages('repository', value)}
                                    />
                                    <FieldInput
                                        label="Branch"
                                        name="branch"
                                        value={form.githubPages.branch}
                                        placeholder="gh-pages"
                                        onChange={(value) => updateGitHubPages('branch', value)}
                                    />
                                    <FieldInput
                                        label="Source Directory"
                                        name="sourceDirectory"
                                        value={form.githubPages.sourceDirectory}
                                        placeholder="/"
                                        description="GitHub Pages branch source 仅支持 / 或 /docs。"
                                        onChange={(value) => updateGitHubPages('sourceDirectory', value)}
                                    />
                                    <FieldInput
                                        label="Path Prefix"
                                        name="pathPrefix"
                                        value={form.githubPages.pathPrefix}
                                        placeholder="home"
                                        description="可选；留空时会按当前发布资源自动生成子目录，不同原型可以发布到同一个 GitHub Pages 站点的不同路径。"
                                        onChange={(value) => updateGitHubPages('pathPrefix', value)}
                                    />
                                </TabsContent>

                                <TabsContent value="publish-settings" className="m-0 grid gap-4">
                                    <div className="rounded-md border">
                                        <div className="space-y-3 px-4 py-3">
                                            <div className="space-y-1">
                                                <div className="text-sm font-medium">发布平台</div>
                                                <p className="text-xs text-muted-foreground">默认勾选 Axhub；勾选后会显示在发布菜单中。</p>
                                            </div>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {PUBLISH_PLATFORM_OPTIONS.map((target) => (
                                                    <label key={target.id} className="inline-flex items-center gap-2 text-sm">
                                                        <Checkbox
                                                            checked={form.publishSettings.visibleTargets.includes(target.id)}
                                                            onCheckedChange={(checked) => toggleVisibleTarget(target.id, checked === true)}
                                                            className="data-[state=checked]:text-white"
                                                        />
                                                        <span className="font-medium text-foreground">{target.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-md border">
                                        <div className="flex items-start justify-between gap-4 px-4 py-3">
                                            <div className="space-y-1">
                                                <div className="text-sm font-medium">包含源码</div>
                                                <p className="text-xs text-muted-foreground">发布时附带当前原型源码目录，规则与导出 HTML（含源码）一致。</p>
                                            </div>
                                            <Switch
                                                checked={form.publishSettings.includeSource === true}
                                                onCheckedChange={(checked) => updatePublishSettings('includeSource', checked)}
                                                aria-label="包含源码"
                                            />
                                        </div>
                                    </div>
                                </TabsContent>
                            </>
                        )}
                    </div>

                    <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-t px-4">
                        <div className="min-w-0">
                            {activeTab !== 'publish-settings' ? (
                                <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="h-auto px-0 py-0 text-xs"
                                    onClick={() => void handleCopyAiConfigPrompt()}
                                >
                                    复制 AI 配置提示词
                                </Button>
                            ) : null}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                                取消
                            </Button>
                            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={loading || saving}>
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                保存
                            </Button>
                        </div>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
