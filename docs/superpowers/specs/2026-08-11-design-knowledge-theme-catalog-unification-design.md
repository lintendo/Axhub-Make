# Design Knowledge 主题目录统一设计

## 背景与问题

Make 当前存在两套互相独立的主题目录：

- 管理页面的 `/api/theme-library` 读取 `apps/make-template/design-systems.json`。本地开发环境只能列出当前 61 条设计系统，并根据 GitHub 仓库路径拼接封面和导入来源。
- `design-system-search` Skill 读取 Make-Template Pages 上的 Design Knowledge Manifest，再按 Manifest 中的 `desktop`、`mobile` 描述符取得带 hash 的平台索引。当前已发布目录共有 223 条，其中 PC 端 123 条、移动端 100 条。

旧接口把本地索引当作目录真相，却把资源 URL 指向不完整的远程分支。这会同时造成条目缺失和封面 404。新目录中 223 条都有 `previewUrl`，219 条有 `previewImageUrl`；`claude`、`ferrari`、`tesla`、`xai` 这 4 条源数据没有封面图，卡片必须保留并使用占位图。

当前 Design Knowledge 发布物中 223 条记录均为 `publishable=false`，也没有 `packageUrl`/`packageHash`，因此可以完整展示和预览，但不能伪装为可直接导入。后续资料完成审核并由同一发布流程产生安全主题包后，Make 才自动开放对应条目的导入按钮。

## 目标

- 让设计空状态页以 Design Knowledge Manifest 及其平台索引作为唯一在线主题目录来源。
- 页面提供 `PC 端` 与 `移动端` 两个分类，分别读取 Manifest 声明的索引，数量来自在线数据而非硬编码。
- 每个分类首批显示 9 张卡片，滚动触底每次追加 9 张，直至完整显示该分类。
- 点击卡片打开在线预览；点击卡片内导入按钮只执行导入，不同时触发预览。
- 前端请求不携带 Manifest、索引或主题包 URL。服务端只接收平台和主题 ID，并从已验证的 Manifest 解析所有资源位置。
- 目录展示、未来主题包发布和导入都遵循同一份 Design Knowledge 记录、hash 和安全校验规则。

## 非目标

- 不恢复 `client/src/themes` 的本地内置主题，也不继续使用 `design-systems.json` 作为列表回退。
- 不恢复主题抽屉、抽屉入口、上传 Tab、在线 Tab 或 AI 执行入口。当前设计页没有抽屉入口，本次保持该状态。
- 不修改原型模板目录协议。原型页继续使用 `/api/template-library` 和现有的 9 项增量加载能力。
- 不增加搜索、排序、服务端游标分页、用户可配置目录 URL 或使用量统计。
- 不把 `publishable=false` 的资料包导入项目，也不绕过现有 Design Knowledge 授权状态。

## 方案选择

采用“Make 服务端读取 Design Knowledge Manifest”的方案：浏览器只请求 Make 自身 API，服务端读取固定的官方 Manifest，验证 reader 版本、Schema、平台索引 hash 和条目契约，再返回适合卡片展示的 DTO。

未采用以下方案：

- 继续合并本地 `design-systems.json` 与在线索引：这会保留两个目录真相，无法解决数量漂移和封面路径不一致。
- 浏览器直接读取 Pages JSON：这会把来源 URL、hash 校验、缓存和未来包下载逻辑散落到前端，也无法保证导入时使用的是同一条已验证记录。
- 把 223 个主题重新打进 Make 客户端：这会恢复已经删除的本地内置资源，并显著增加安装包体积。

## 架构与职责

### Design Knowledge 目录读取器

新增独立的服务端目录读取模块，负责以下工作：

1. 从固定官方地址读取 `https://lintendo.github.io/Make-Template/knowledge/latest/manifest.json`。生产代码不接受查询参数、请求正文或前端配置覆盖该地址；测试可以通过依赖注入替换 fetch 和 fixture。
2. 验证 Manifest 的 `schemaVersion=1`、taxonomy/search/tokenization 版本和 reader 范围。Make reader 版本固定为 `1.0.0`，必须满足 `minReaderVersion <= 1.0.0 < maxReaderVersionExclusive`。
3. 根据 `desktop` 或 `mobile` 选择 `manifest.indexes[platform]`，检查描述符的 HTTPS URL、`sha256:` hash 和非负 count。
4. 以有界字节流下载平台索引，计算 SHA-256，并在解析 JSON 前确认与描述符 hash 一致。
5. 验证索引的版本字段、`platform`、records 数量、重复 ID、条目平台、`searchable=true` 和所需 artifact 字段。索引记录数必须等于 Manifest 描述符 count。
6. 把索引记录映射为 Make API 的主题卡片 DTO。巨大的 `text` 和 `tokens` 字段不会返回给浏览器。

读取器与 HTTP 路由分离：读取器只处理远程契约、验证、缓存和 DTO 映射；`managementApi.themeLibrary.ts` 只处理参数、项目能力、HTTP 状态和导入落盘。

### 缓存和失败处理

- Manifest 与每个平台索引在服务端进程内缓存 5 分钟；并发的相同请求复用同一个进行中的 Promise，避免重复下载。
- 缓存只保存完整通过 Schema、平台和 hash 校验的数据。
- 远程刷新失败时，如果该平台已有验证通过的缓存，返回旧缓存并在响应中标记 `stale=true`；冷启动且没有可用缓存时返回 502。
- hash 不匹配、数量不匹配或 Schema 不兼容时拒绝新数据，不回退到 `design-systems.json`。已有验证缓存仍可作为 stale 结果使用。
- 前端切换分类失败时保留另一个分类已加载的数据；当前分类显示可重试的错误状态。

### API 契约

主题列表接口为：

```http
GET /api/theme-library?platform=desktop
GET /api/theme-library?platform=mobile
```

`platform` 只允许 `desktop` 或 `mobile`；缺省值为 `desktop`，非法值返回 400。成功响应形状为：

```json
{
  "schemaVersion": 1,
  "platform": "desktop",
  "total": 123,
  "stale": false,
  "designSystems": [
    {
      "id": "airbnb",
      "slug": "airbnb",
      "title": "Airbnb",
      "platform": "desktop",
      "description": "电商零售 · 营销站点 · 品牌化",
      "tags": ["电商零售", "营销站点", "品牌化"],
      "previewUrl": "https://lintendo.github.io/.../previews/airbnb/index.html",
      "coverUrl": "https://lintendo.github.io/.../assets/official-homepage.webp",
      "canDirectImport": false,
      "directImportDisabledReason": "主题包尚未开放导入"
    }
  ]
}
```

字段规则如下：

- `title` 直接使用平台索引的 title；缺失或空字符串视为契约错误。
- `description` 由 `annotation.industries`、`annotation.productTypes`、`annotation.styles` 的可用标签按顺序组成，每个维度最多取 2 项；没有语义标注时回退到最多 3 个非空 tags，再回退到“在线主题模板”。不返回索引的全文 `text`。
- `tags` 只返回用于卡片说明的去重标签，最多 6 项。
- `previewUrl` 必须存在且属于官方 Design Knowledge 发布路径；点击卡片使用它打开新窗口。
- `coverUrl` 来自 `previewImageUrl`，允许缺省。缺省或图片加载失败时由卡片显示中性“暂无封面”占位，不隐藏条目。
- `canDirectImport` 仅在 `publishable=true` 且同一记录同时存在合法 `packageUrl` 与 `packageHash` 时为 true。
- `directImportDisabledReason` 根据 `reasons` 和包字段生成用户可理解的短文案；不把内部 reason code 当作按钮文案。

响应不包含 Manifest URL、索引 URL、主题包 URL、package hash、源仓库路径或本地路径。浏览器只获得渲染和预览所需的 URL。

主题导入接口保留原路径，但改为新的请求契约：

```http
POST /api/theme-library/import
Content-Type: application/json

{
  "themeId": "airbnb",
  "platform": "desktop"
}
```

项目作用域继续由现有 Make API scope 机制传递，正文不接收 `sourceUrl`、`packageUrl`、`coverUrl` 或任意下载地址。服务端从相同平台的已验证索引重新定位记录：

- 条目不存在时返回 404。
- 条目不可发布或包字段不完整时返回 409 `THEME_LIBRARY_NOT_IMPORTABLE`，当前 223 条均会进入此分支。
- 项目不具备主题写入能力时继续返回现有 adapter-required 错误。
- 可导入时只下载记录中声明的 `packageUrl`，限制压缩包最大 100 MiB、解包后最大 250 MiB，校验 `packageHash`，拒绝绝对路径、`..`、符号链接、硬链接、重复路径和越出目标目录的内容，再沿用现有主题资源元数据刷新流程。

## 页面交互

改动范围只包括设计空状态页的“主题模板”区域：

- 区域标题下方显示 `PC 端（数量）`、`移动端（数量）` 两个分类；首次进入默认 PC 端。
- 页面首次只请求当前分类。用户首次切换到另一分类时再请求对应索引；已成功加载的分类在页面生命周期内复用数据。
- 每个分类使用现有 `useProgressiveLibraryItems`，首批 9 项，触底追加 9 项。reset key 包含项目 ID 和 platform，切换分类时重置为前 9 项，并把主题区域滚动到分类标题位置。
- 卡片保持三列桌面布局和现有响应式列数。卡片整体点击只做预览。
- 卡片底部只保留一个“导入”按钮，不显示复制提示词、AI 执行、上传或其他动作。不可导入时按钮禁用并通过 tooltip 展示原因。
- 导入按钮阻止点击冒泡。导入成功后继续调用现有主题资源刷新回调。
- `stale=true` 时列表仍可用，并在分类标题旁显示“正在使用已缓存目录”；不弹出阻断式错误。

原型空状态继续展示完整在线原型列表并沿用相同的每批 9 项规则，不与 Design Knowledge 目录合并。

### 设计侧栏空状态

设计 Tab 的侧栏资源树在确实没有任何设计规范且没有搜索词时，不再只显示“暂无内容”，改为两行纯占位：

- 标题：`创建设计规范`
- 说明：`统一原型的视觉与文案风格`

占位本身不提供点击行为，右上角现有 `+` 继续作为唯一创建入口，避免同一区域出现两个等价操作。输入搜索词后没有匹配结果时不显示创建引导，继续使用普通无结果状态；原型和资源 Tab 的空状态不变。

## 数据迁移和兼容边界

- `/api/theme-library` 的响应会从旧 `design-systems.json` 结构切换为 Design Knowledge DTO；同一仓库内的设计页消费方同步迁移。
- 不保留旧列表源的隐式兼容回退。兼容回退会重新引入目录分叉，与“单一索引真相”目标冲突。
- 旧导入正文 `designSystemId` 改为 `themeId + platform`。当前页面是唯一入口且抽屉已无入口，因此服务端不同时接受两套字段。
- `apps/make-template/design-systems.json` 可以继续服务于 Make-Template 自身构建流程，但 Make 管理页不再读取它。

## 安全边界

- 所有目录和包 URL 都来自固定官方 Manifest，不信任客户端提供的 URL。
- 只允许 HTTPS、无凭据、无 fragment、同一官方 origin 且位于 `/Make-Template/knowledge/` 路径下的 artifact URL。
- Manifest、索引和包都执行大小限制；索引与包在使用前执行 SHA-256 校验。
- 未通过 hash、平台、reader 或 Schema 校验的数据不得进入缓存或返回页面。
- 主题包先写入项目内的独立临时目录，完整校验后再移动到声明的 themes 写入目录；失败时清理临时目录，不留下半成品主题。

## 测试与验收

### 服务端自动化测试

- 使用本地 fixture Manifest 与 desktop/mobile 索引验证：分类选择、count、hash、reader 范围、重复 ID、错误平台和非法 URL。
- 断言当前形状可以分别返回 PC/移动端完整记录，并且不会读取本地 `design-systems.json`。
- 断言索引 hash 或 Schema 错误时冷启动返回 502；已有验证缓存时返回 `stale=true` 的旧数据。
- 断言 4 个无 `previewImageUrl` 的记录仍出现在响应中且没有 `coverUrl`。
- 断言 `publishable=false` 或缺少 package 字段时导入返回 409；请求中的伪造 URL 被忽略或因非契约字段拒绝。
- 用可发布 fixture 验证 package hash、大小、路径安全检查和成功导入后的主题元数据刷新。

### 前端自动化测试

- 断言设计页请求 `/api/theme-library?platform=desktop|mobile`，不在请求中拼接在线索引 URL。
- 断言分类标签数量来自响应，默认 PC 端，切换分类重置为 9 项，触底追加为 18 项并最终到完整总数。
- 断言卡片点击打开 preview，导入按钮不触发 preview。
- 断言无封面和封面加载失败时显示占位卡片。
- 断言主题卡片没有复制提示词、AI 执行和上传动作；代码中没有主题抽屉入口。
- 断言不可导入记录只显示一个禁用的“导入”按钮及原因。
- 断言设计 Tab 真正为空且无搜索词时显示“创建设计规范”和“统一原型的视觉与文案风格”，占位不包含点击处理；原型、资源和搜索无结果状态不复用该文案。

### 构建与浏览器验收

- 运行主题 API、设计空状态、卡片和增量加载相关 Vitest。
- 运行 `pnpm admin:build`。
- 通过完整 Make 开发服务器验证当前发布目录显示 `PC 端（123）`、`移动端（100）`；每类首屏 9 张、触底到 18 张；4 个无封面主题仍有可预览卡片；所有当前条目的导入按钮为禁用状态且原因清晰。
- 网络面板中页面只访问 Make 的主题 API和卡片预览/封面资源，不直接获取 Manifest 或平台索引。

## 完成标准

- 设计页可以访问当前 Design Knowledge 的全部 223 条主题，PC 与移动端分别完整且无重复。
- 不再因远程仓库缺目录而产生旧主题封面 404；新目录缺封面的 4 条使用占位图而非消失。
- 列表、预览、未来包导入都以同一条已验证 Design Knowledge 记录为依据。
- 前端不传目录或主题包 URL，旧 `design-systems.json` 不再参与 Make 主题列表。
- 当前无授权包的主题不会被错误标记为可导入。
