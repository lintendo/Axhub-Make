import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readDialogSource() {
  return readFileSync(resolve(__dirname, './CloudPublishSettingsDialog.tsx'), 'utf8');
}

describe('CloudPublishSettingsDialog source', () => {
  it('loads and saves project-owned publishing config with explicit scope', () => {
    const source = readDialogSource();

    expect(source).toContain('projectId: string;');
    expect(source).toContain('apiService.getCloudPublishingConfig({ projectId })');
    expect(source).toContain('apiService.saveCloudPublishingConfig(payload, { projectId })');
  });

  it('uses Axure-style top tabs with concise object storage first', () => {
    const source = readDialogSource();
    const s3TabIndex = source.indexOf('value="s3"');
    const vercelTabIndex = source.indexOf('value="vercel"');
    const cloudflareTabIndex = source.indexOf('value="cloudflare-pages"');
    const githubPagesTabIndex = source.indexOf('value="github-pages"');
    const publishSettingsTabIndex = source.indexOf('value="publish-settings"');

    expect(source).toContain("from '@/components/ui/tabs'");
    expect(s3TabIndex).toBeGreaterThan(-1);
    expect(vercelTabIndex).toBeGreaterThan(-1);
    expect(cloudflareTabIndex).toBeGreaterThan(-1);
    expect(githubPagesTabIndex).toBeGreaterThan(-1);
    expect(publishSettingsTabIndex).toBeGreaterThan(-1);
    expect(s3TabIndex).toBeLessThan(vercelTabIndex);
    expect(s3TabIndex).toBeLessThan(cloudflareTabIndex);
    expect(s3TabIndex).toBeLessThan(githubPagesTabIndex);
    expect(publishSettingsTabIndex).toBeGreaterThan(githubPagesTabIndex);
    expect(source).toContain('value="vercel"');
    expect(source).toContain('Vercel');
    expect(source).toContain('value="cloudflare-pages"');
    expect(source).toContain('Cloudflare Pages');
    expect(source).toContain('value="s3"');
    expect(source).not.toContain('S3 Compatible');
    expect(source).toContain('value="github-pages"');
    expect(source).toContain('GitHub Pages');
    expect(source).toContain('value="publish-settings"');
    expect(source).toContain('发布设置');
  });

  it('defaults cloud publishing to Axhub only, excludes source files, and exposes toggles', () => {
    const source = readDialogSource();

    expect(source).toContain("import { Switch } from '@/components/ui/switch';");
    expect(source).toContain("import { Checkbox } from '@/components/ui/checkbox';");
    expect(source).toContain('publishSettings: {');
    expect(source).toContain('includeSource: false');
    expect(source).toContain("visibleTargets: ['axhub']");
    expect(source).toContain('发布平台');
    expect(source).toContain("toggleVisibleTarget(target.id, checked === true)");
    expect(source).toContain("visibleTargets.includes(target.id)");
    expect(source).toContain("{ id: 'axhub', label: 'Axhub' }");
    expect(source).toContain('默认勾选 Axhub');
    expect(source).not.toContain('Axhub 是固定入口');
    expect(source).toContain('对象存储');
    expect(source).toContain('Vercel');
    expect(source).toContain('Cloudflare Pages');
    expect(source).toContain('GitHub Pages');
    expect(source).toContain('包含源码');
    expect(source).toContain("updatePublishSettings('includeSource', checked)");
  });

  it('explains S3-compatible object storage and uses Chinese labels with English subtitles', () => {
    const source = readDialogSource();

    expect(source).toContain('支持阿里云 OSS、腾讯云 COS、华为云 OBS 等国内主流兼容 S3 标准的云服务');
    expect(source).toContain('对象存储');
    expect(source).not.toContain('S3 Compatible');
    expect(source).toContain('访问密钥 ID');
    expect(source).toContain('Access Key ID');
    expect(source).toContain('访问密钥 Secret');
    expect(source).toContain('Secret Access Key');
    expect(source).toContain('地域');
    expect(source).toContain('Region');
    expect(source).toContain('存储桶');
    expect(source).toContain('Bucket');
    expect(source).toContain('对象前缀');
    expect(source).toContain('Prefix');
    expect(source).toContain('留空时会按当前发布资源自动生成目录');
    expect(source).toContain('访问地址');
    expect(source).toContain('Base URL');
    expect(source).toContain('上传入口');
    expect(source).toContain('Endpoint');
    expect(source).not.toContain('阿里云 OSS 可从访问地址自动推导');
  });

  it('keeps paired fields top-aligned when only one field has helper text', () => {
    const source = readDialogSource();
    const fieldInput = source.slice(
      source.indexOf('function FieldInput'),
      source.indexOf('export default function CloudPublishSettingsDialog'),
    );

    expect(fieldInput).toContain('<Field className="content-start">');
  });

  it('renders the required configuration fields for each cloud target', () => {
    const source = readDialogSource();

    expect(source).toContain('token');
    expect(source).toContain('projectName');
    expect(source).toContain('teamId');
    expect(source).toContain('apiToken');
    expect(source).toContain('accountId');
    expect(source).toContain('productionBranch');
    expect(source).toContain('accessKeyId');
    expect(source).toContain('secretAccessKey');
    expect(source).toContain('region');
    expect(source).toContain('bucket');
    expect(source).toContain('prefix');
    expect(source).toContain('baseUrl');
    expect(source).toContain('endpoint');
    expect(source).toContain('githubPages');
    expect(source).toContain('repository');
    expect(source).toContain('sourceDirectory');
    expect(source).toContain('gh-pages');
    expect(source).toContain('publishSettings');
    expect(source).toContain('includeSource');
  });

  it('marks Cloudflare Pages Project Name as optional and documents the automatic resource-based fallback', () => {
    const source = readDialogSource();
    const cloudflareSection = source.slice(
      source.indexOf('<TabsContent value="cloudflare-pages"'),
      source.indexOf('<TabsContent value="github-pages"'),
    );
    const projectNameField = cloudflareSection.slice(
      cloudflareSection.indexOf('label="Project Name"'),
      cloudflareSection.indexOf('label="Production Branch"'),
    );

    expect(projectNameField).toContain('label="Project Name"');
    expect(projectNameField).not.toContain('required');
    expect(projectNameField).toContain('留空时会按当前发布资源自动生成项目名');
    expect(projectNameField).toContain('不同原型可以发布到不同 Cloudflare Pages 项目');
  });

  it('documents the optional GitHub Pages path prefix fallback', () => {
    const source = readDialogSource();
    const githubPagesSection = source.slice(
      source.indexOf('<TabsContent value="github-pages"'),
      source.indexOf('<TabsContent value="publish-settings"'),
    );

    expect(githubPagesSection).toContain('label="Path Prefix"');
    expect(githubPagesSection).toContain('name="pathPrefix"');
    expect(githubPagesSection).toContain('留空时会按当前发布资源自动生成子目录');
    expect(githubPagesSection).toContain('不同原型可以发布到同一个 GitHub Pages 站点的不同路径');
  });

  it('copies short target-specific AI configuration prompts from non-Axhub tabs', () => {
    const source = readDialogSource();
    const promptBuilderStart = source.indexOf('function buildCloudPublishAiConfigPrompt');
    const promptBuilderEnd = source.indexOf('function FieldInput');
    const promptBuilder = source.slice(promptBuilderStart, promptBuilderEnd);
    const footerStart = source.indexOf("activeTab !== 'publish-settings'");
    const footer = source.slice(footerStart, footerStart + 900);

    expect(promptBuilderStart).toBeGreaterThan(-1);
    expect(promptBuilder).toContain("case 's3':");
    expect(promptBuilder).toContain("case 'vercel':");
    expect(promptBuilder).toContain("case 'cloudflare-pages':");
    expect(promptBuilder).toContain("case 'github-pages':");
    expect(promptBuilder).not.toContain("case 'axhub':");
    expect(promptBuilder).toContain('~/.axhub/make/server.config.json');
    expect(promptBuilder).toContain('$AXHUB_MAKE_HOME_DIR/.axhub/make/server.config.json');
    expect(promptBuilder).toContain('cloudPublishing.s3');
    expect(promptBuilder).toContain('accessKeyId、secretAccessKey、region、bucket、baseUrl');
    expect(promptBuilder).toContain('cloudPublishing.vercel');
    expect(promptBuilder).toContain('token、projectName');
    expect(promptBuilder).toContain('cloudPublishing.cloudflarePages');
    expect(promptBuilder).toContain('apiToken、accountId');
    expect(promptBuilder).toContain('cloudPublishing.githubPages');
    expect(promptBuilder).toContain('repository、branch、sourceDirectory');
    expect(promptBuilder).not.toContain('不要写到项目里的 .axhub/make/axhub.config.json');

    expect(source).toContain('handleCopyAiConfigPrompt');
    expect(source).toContain('navigator.clipboard.writeText(buildCloudPublishAiConfigPrompt(activeTab))');
    expect(source).toContain("toast.success('AI 配置提示词已复制')");
    expect(source).toContain("toast.error('复制 AI 配置提示词失败')");
    expect(footerStart).toBeGreaterThan(-1);
    expect(footer).toContain('复制 AI 配置提示词');
    expect(footer).toContain('variant="link"');
  });
});
