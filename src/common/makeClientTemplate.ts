export const MAKE_CLIENT_TEMPLATE_ZIP_NAME = 'axhub-make-client-template.zip';
export const MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME = 'axhub-make-client-template.latest.json';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '0.1.16';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = "# Axhub Make Client 0.1.16\n\n- 默认主题库精简为 122 个主题，包括 72 个 PC 主题和 50 个移动端主题\n- 标注运行时升级到 `@axhub/annotation` 1.0.17\n- 将生产、采集和回归脚本迁出客户端发布模板，仅保留基础主题创建能力\n- 清理未使用的客户端依赖，保持 `lucide-react` 版本不变";
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
