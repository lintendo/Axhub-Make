# Markdown 相对资源链接导航设计

## 背景

Make 的 Markdown 预览运行在 `spec-template.html` iframe 中。当前预览器只会对原型规格端点
`/api/projects/:projectId/prototypes/:prototypeId/spec/content?path=...` 内的相对链接做特殊处理。
普通资源文档使用 `/api/projects/:projectId/docs/:resourceId/content`，所以正文中的
`./PROJECT.md`、`./prd-01-account-baby-profile.md`、图片和 JSON 等链接仍由浏览器按 iframe
页面地址解析，最终错误落到站点根目录，例如 `/PROJECT.md`。

真实复现页面：

`http://localhost:53817/?projectId=make-project&doc=kangbaobao%2Fprd-02-home-growth`

## 目标

- 普通资源文档、项目内部文档和原型规格文档使用同一套安全的相对路径解析规则。
- 点击相对链接时，由 Make 主界面在当前项目中选择并打开对应资源。
- Markdown 使用文档预览，图片使用图片预览，JSON 等文件使用现有文件预览。
- 资源选择、侧边栏状态和顶部深链 URL 保持同步。
- 外部 URL、页面锚点和协议链接维持浏览器原行为。

## 非目标

- 不改变 Markdown 文件内容或批量重写其中的链接。
- 不新增文件类型专用预览器。
- 不允许链接切换到其他项目。
- 不引入旧版端点兼容层，也不改变服务端资源目录权限边界。

## 方案选择

采用“iframe 解析相对目标，父页面选择现有资源”的方案。

其他方案未采用：

- 将链接改写成 `?projectId=...&doc=...` 会重新加载整个管理页面并丢失界面状态。
- 直接打开文件 API 会绕过 Make 的资源选择和预览器，Markdown、图片、JSON 的体验不一致。

## 架构与数据流

1. `src/spec-template/previewMarkdownContent.ts` 从当前文档内容 URL 提取项目、文档路径和允许的资源根。
2. 相对链接按照当前文档所在目录解析 `.` 和 `..`，导航目标忽略查询参数及跨文档锚点；若路径越出允许根目录则拒绝接管。
3. `MarkdownViewer` 对可接管链接阻止浏览器默认导航，并向父页面发送包含目标资源路径的导航消息。
4. 父页面校验消息来自当前预览 iframe、目标属于当前项目且存在于当前资源列表。
5. 父页面复用现有资源选择流程设置相应 `selectedDoc`，由资源的 `openMode` 决定 Markdown、图片或普通文件预览，并通过现有深链同步逻辑更新 URL。

解析器覆盖三种文档来源：

- 普通资源文档：`/api/projects/:projectId/docs/:resourceId/content`，资源根为 `src/resources/`，当前路径由 `resourceId` 恢复并补回已知扩展名。
- 项目内部文档：`/api/projects/:projectId/document-content?path=...`，当前路径来自 `path`，允许根为当前项目。
- 原型规格文档：`/api/projects/:projectId/prototypes/:prototypeId/spec/content?path=...`，保留现有规格目录边界和导航行为。

为避免让 iframe 猜测资源类型，导航消息传递规范化后的项目资源路径；父页面以当前资源列表作为权威来源。目标不存在时不切换资源并保留当前页面。

## 链接行为

- `./PROJECT.md`、`../guide.md`：在当前 Make 主内容区打开目标 Markdown。
- `./screenshot.png`：在当前 Make 主内容区打开图片预览。
- `./data.json`、`./interactions.json`：在当前 Make 主内容区打开文件预览。
- `./guide.md#section`：打开目标 Markdown；当前修复不负责恢复目标文档中的跨文档锚点位置。
- `#section`：继续在当前文档内滚动。
- `https://...`、`mailto:...` 及其他显式协议：保持原行为。
- `/absolute/path`、不存在的资源、越界的 `..`：不交给资源导航；不得构造项目外文件读取地址。

## 错误与安全边界

- 所有路径统一使用 `/`，忽略空段和 `.`，逐段处理 `..`。
- 普通资源文档不得越出 `src/resources/`；原型规格不得越出规格根；项目内部文档仍受服务端项目根校验。
- 父页面只接受当前 iframe 发出的消息，并只在当前项目资源集合中解析目标。
- 解析失败、目标缺失或资源列表尚未就绪时保持当前选择，不触发整页导航。

## 测试与验收

单元测试覆盖：

- 普通资源文档中的同目录 Markdown、嵌套 Markdown、图片和 JSON。
- 项目内部文档与原型规格文档的现有行为不回退。
- 带查询参数或跨文档锚点的资源链接、当前页锚点、外部链接和协议链接。
- 越界路径、绝对路径、不存在资源以及非当前 iframe 消息。
- 父页面按目标资源的 `openMode` 复用资源选择逻辑并同步深链。

浏览器验收使用真实页面逐项点击：

- `PROJECT.md` 和“账户与宝宝档案 PRD”在主内容区打开对应文档。
- 六组“截图”链接打开对应 PNG。
- “正文”打开对应 Markdown。
- “组件数据”和“交互”打开对应 JSON。
- 点击后页面不访问 `/PROJECT.md` 或 `/sources/...` 等错误站点根路径，侧边栏选择和顶部 `doc` 深链与目标一致。

## 受影响文件

- `src/spec-template/previewMarkdownContent.ts`：统一文档上下文与相对资源路径解析。
- `src/spec-template/previewMarkdownContent.test.ts`：解析器回归测试。
- `src/spec-template/MarkdownViewer.tsx`：发送通用资源导航消息并保留锚点。
- 父页面现有 iframe 消息/资源选择控制器及其测试：校验并打开当前项目资源。
