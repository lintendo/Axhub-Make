export const MAKE_CLIENT_TEMPLATE_ZIP_NAME = 'axhub-make-client-template.zip';
export const MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME = 'axhub-make-client-template.latest.json';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '0.1.18';
export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = "# Axhub Make Client 0.1.18\n\n- 更新客户端工作规则和内置技能，完善原型开发与截图还原流程\n- 为 `screenshot-to-prototype` 新增 rembg 背景移除能力和重建清单校验\n- `check-app-ready` 返回 Make 管理端深链，便于直接打开目标资源\n- 支持仅包含主规格的原型参与项目元数据同步\n- 更新内置示例原型及相关标注内容";
export const PRIMARY_MAKE_CLIENT_TEMPLATE_RELEASE_REPOSITORY = 'lintendo/Axhub-Make';
export const GITEE_MAKE_CLIENT_TEMPLATE_RELEASE_BASE_URL = 'https://gitee.com/axhub/Axhub-Make/releases/download';
export const GITEE_MAKE_CLIENT_TEMPLATE_LATEST_RELEASE_TAG = 'make-client-template-latest';
export function makeClientTemplateReleaseTag(version = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION) {
    return `make-client-template-v${version}`;
}
export function makeClientTemplatePrimaryDownloadUrl(version = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION) {
    return `https://github.com/${PRIMARY_MAKE_CLIENT_TEMPLATE_RELEASE_REPOSITORY}/releases/download/${makeClientTemplateReleaseTag(version)}/${MAKE_CLIENT_TEMPLATE_ZIP_NAME}`;
}
export function makeClientTemplateMirrorDownloadUrl(version = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION) {
    return `${GITEE_MAKE_CLIENT_TEMPLATE_RELEASE_BASE_URL}/${makeClientTemplateReleaseTag(version)}/${MAKE_CLIENT_TEMPLATE_ZIP_NAME}`;
}
export function makeClientTemplatePrimaryManifestUrl() {
    return `https://github.com/${PRIMARY_MAKE_CLIENT_TEMPLATE_RELEASE_REPOSITORY}/releases/latest/download/${MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME}`;
}
export function makeClientTemplateMirrorManifestUrl() {
    return `${GITEE_MAKE_CLIENT_TEMPLATE_RELEASE_BASE_URL}/${GITEE_MAKE_CLIENT_TEMPLATE_LATEST_RELEASE_TAG}/${MAKE_CLIENT_TEMPLATE_LATEST_MANIFEST_NAME}`;
}
