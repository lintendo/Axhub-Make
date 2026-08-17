export const MAKE_CLIENT_TEMPLATE_ZIP_NAME = 'axhub-make-client-template.zip';
export const MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME = 'axhub-make-client-template.latest.json';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '0.1.20';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = "# Axhub Make Client 0.1.20\n\n- 恢复并绑定项目设置中的 5 个内置固定模板，确保新建项目可以直接选择完整模板\n- 内置本地 Design Knowledge 检索，以及 223 份经过哈希校验的 `DESIGN.md` 设计知识\n- 主题包安装使用 SHA-256 哈希验证，并支持主源失败后切换到 Gitee 固定回退源\n- 同步当前客户端规则、配套技能、预览与项目元数据能力\n- 发布 ZIP 不包含本地主题源码；主题内容按索引在安装时下载并校验";
export const PRIMARY_MAKE_CLIENT_TEMPLATE_RELEASE_REPOSITORY = 'lintendo/Axhub-Make';
export const GITEE_MAKE_CLIENT_TEMPLATE_RELEASE_BASE_URL = 'https://gitee.com/axhub/Axhub-Make/releases/download';
export const GITEE_MAKE_CLIENT_TEMPLATE_LATEST_RELEASE_TAG = 'make-client-template-latest';

export function makeClientTemplateReleaseTag(version = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION): string {
  return `make-client-template-v${version}`;
}

export function makeClientTemplatePrimaryDownloadUrl(version = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION): string {
  return `https://github.com/${PRIMARY_MAKE_CLIENT_TEMPLATE_RELEASE_REPOSITORY}/releases/download/${makeClientTemplateReleaseTag(version)}/${MAKE_CLIENT_TEMPLATE_ZIP_NAME}`;
}

export function makeClientTemplateMirrorDownloadUrl(version = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION): string {
  return `${GITEE_MAKE_CLIENT_TEMPLATE_RELEASE_BASE_URL}/${makeClientTemplateReleaseTag(version)}/${MAKE_CLIENT_TEMPLATE_ZIP_NAME}`;
}

export function makeClientTemplatePrimaryManifestUrl(): string {
  return `https://github.com/${PRIMARY_MAKE_CLIENT_TEMPLATE_RELEASE_REPOSITORY}/releases/latest/download/${MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME}`;
}

export function makeClientTemplateMirrorManifestUrl(): string {
  return `${GITEE_MAKE_CLIENT_TEMPLATE_RELEASE_BASE_URL}/${GITEE_MAKE_CLIENT_TEMPLATE_LATEST_RELEASE_TAG}/${MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME}`;
}
