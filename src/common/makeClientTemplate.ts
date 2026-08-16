export const MAKE_CLIENT_TEMPLATE_ZIP_NAME = 'axhub-make-client-template.zip';
export const MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME = 'axhub-make-client-template.latest.json';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '0.1.19';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = "# Axhub Make Client 0.1.19\n\n- 模板 ZIP 内置本地 Design Knowledge 检索技能和不可变索引，检索无需联网。\n- 模板 ZIP 包含 223 份已校验的 `DESIGN.md` 文档。\n- 主题安装支持经哈希验证的主源与 Gitee 固定回退包。\n- 模板 ZIP 不包含本地主题源码；主题应通过已验证的安装包获取。";
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
