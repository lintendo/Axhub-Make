# 主题产物与验收契约

本文档约束 `make-client` 中主题资源的创建、更新、派生与验收。执行前由 `SKILL.md` 完成来源和任务规划；本文只定义当前标准结构和验收要求。

## 核心原则

- `DESIGN.md` 是主题事实源：品牌定位、设计原则、色彩、字体、圆角、间距、边框、阴影、组件规则和禁用做法，均优先按它判断。
- `theme.json` 是运行时与管理端消费的结构化摘要；`assets/tokens.json` 是唯一 canonical token 快照；根级 `preview.html` 是默认资料预览。三者必须与 `DESIGN.md` 保持一致。
- 用户当前明确修改意图优先；附件、截图和链接只按 `references/source-handlers.md` 的证据优先级处理。若明确要求与 `DESIGN.md` 冲突，先更新 `DESIGN.md`，再同步派生文件。
- 不根据截图、元数据或自动推断结果覆盖明确写在 `DESIGN.md` 中的规则；只能在 `DESIGN.md` 缺失信息时补充合理假设，并在文档或交付说明中写清楚。
- 主题代码、CSS 和 `theme.json` 中的本地资源引用必须使用主题内相对路径，禁止根路径、本机绝对路径或 `../` 逃逸到其他目录。
- 主题演示页不得引入与该主题无关的 UI 库，避免污染视觉表达。

## 标准参考主题

当前标准参考主题是 `src/themes/linear/`。新建或重做主题时，参考它的目录结构、`theme.json` 字段组织、根级 `preview.html` 和可选 React 实现的资源引用方式。

参考范围：

- `preview.html`：默认入口，直接内嵌从 `theme.json` 与 `assets/tokens.json` 提取的数据，可通过 `file://` 或静态服务打开。
- `implementations/react/index.tsx`：可选增强实现；读取 `../../theme.json` 并静态 import 主题内资源，不参与主题发现。
- `theme.json`：包含 `schemaVersion`、`source`、`identity`、`tags`、`assets`、`tokens`、`previewImages`、`display`。
- `implementations/react/style.css`：React 实现专用样式，以 `@import "tailwindcss";` 开头，在 `.dmb-page` 中写入 `--dmb-*` CSS Variables。
- `assets/`：至少包含 `tokens.json` 和一个稳定预览图，例如 `official-homepage.webp`、`cover.webp` 或 `source-preview.webp`。

不要复制参考主题的品牌内容、视觉风格、文案或临时生成注释。新主题必须用自己的 `DESIGN.md` 派生真实 token、展示字段和预览资源。

## 推荐来源与导入路径

用户查找和导入主题时，优先走这两类来源：

- `getdesign.md`：主流 Design.md 主题的优先来源，适合先找品牌主线和标准主题。
- `styles.refero.design`：补缺优先来源，适合找行业、场景、字体、颜色和 token 更丰富的主题。

当前只推荐这两类 active source；旧来源不作为默认导入入口。

推荐的导入路径按这个顺序走：

```bash
node scripts/collect-design-md-batch.mjs
node scripts/generate-design-md-theme-pages.mjs
node scripts/review-design-md-theme-pages.mjs
```

对应的本地产物和主题落点分别是：

- `.local/design-md-batch/manifest.json`
- `client/src/themes/<slug>/`

如果用户已经提供了 Design.md 线索、品牌名或详情页链接，就先按上面两类来源定位，再进入采集、生成和复查。

## 来源采集分流

出现网页、Axure、Figma、截图、现有原型或主题来源时，先读取 `references/source-handlers.md`，完成来源登记和必要证据采集，再按本文档生成标准主题。

采集只是补充来源证据，不替代主题工作流。若用户已经提供明确的 `DESIGN.md`、设计规范、品牌手册或当前主题事实源充分，则不要默认重复采集；只有证据不足、用户指定来源、预览图缺失或需要校准视觉风格时才进入相应来源分支。

## 标准交付物

每个主题目录使用 `kebab-case` 命名，例如 `stripe`、`longcipher-design`：

```text
src/themes/<theme-key>/
├── SOURCES.md             # 必需，来源与证据台账
├── PLAN.md                # 必需，任务、依赖与状态台账
├── DESIGN.md              # 必需，主题事实依据
├── theme.json             # 必需，结构化主题元数据与展示配置
├── assets/
│   ├── tokens.json        # 必需，轻量 token 快照
│   └── ...                # 预览图、官网截图、字体、source-preview.html 等主题私有资源
├── preview.html           # 必需，独立 HTML 默认资料预览
├── tw.css                 # 必需，Tailwind v4 主题片段或最小可用片段
└── implementations/
    └── react/             # 可选 React 增强实现，不作为主题主入口
        ├── style.css
        └── index.tsx
```

## `DESIGN.md` 编写规范

`DESIGN.md` 应写成可执行的设计规范，而不是氛围描述。它需要同时面向人类和代码生成 agent，可直接指导后续 UI 生成、审查和派生文件同步。

信息充分时必须采用接近 getdesign.md 的 9 段式结构：

1. 视觉主题与氛围：品牌/产品背景、适用场景、不适用场景、关键词、页面气质、信息密度和品牌表达边界。
2. 色彩系统：主色、背景、表面、文本、边框、状态色、CTA 或限制色；每个重要颜色写清 hex 值、语义角色、使用边界和禁用场景。
3. 字体系统：display/body/mono 角色、字体族、字号层级、行高、字重、字距和 fallback。
4. 组件规范：按钮、输入框、卡片、导航、表格、标签、弹窗等基础组件；写清尺寸、圆角、边框、状态、hover/focus/active 行为和可复用类名或 token。
5. 布局与间距：容器宽度、栅格、section 节奏、密度、断点前的默认布局、间距标尺和页面级留白。
6. 深度、阴影与边框：阴影层级、边框/分割线、ring、elevation、表面叠放规则，以及不允许使用的过重阴影或装饰。
7. 动效：时长、缓动、transform 模式、出现/退出/hover 规则，明确哪些动效可用、哪些必须避免。
8. 响应式行为：desktop/tablet/mobile 下的布局变化、导航折叠、元素显隐、图片/表格/卡片重排策略。
9. Prompt guide：给 LLM 的现成生成指令，包含 3-5 条推荐写法、3-5 条禁止写法和可直接复用的界面生成提示。

每一段都应尽量包含可落地数值、语义 token、组件状态或 Do/Don't。缺少来源证据时，可以写明“未采集到明确规则，按保守默认处理”，但不要伪造来源、品牌规则或组件细节。

生成或更新 `DESIGN.md` 时，优先使用用户提供的规范、原始 Design.md、官方设计资料和当前主题已有内容。截图和元数据只能用于补缺，不能覆盖明确规则。

## 派生文件规范

`theme.json` 必须承载管理端和演示页需要的结构化信息：

- `identity.slug` 必须与主题目录名一致；`titleZh`、`descriptionZh` 面向管理端展示。
- `tokens.palette`、`tokens.typography`、`tokens.radius`、`tokens.spacing` 等必须从 `DESIGN.md` 抽取或由用户确认。
- `display.palette`、`display.typography`、`display.radius`、`display.spacing`、`display.borders`、`display.shadows`、`display.usageGuidance` 应服务于演示页展示，并与 `tokens` 同源。
- `assets` 和 `previewImages` 只引用当前主题目录内资源，不引用本机绝对路径或其他主题资源。

`assets/tokens.json` 只保存轻量 token 快照：

- 至少包含 `palette`、`typography`；若 `DESIGN.md` 提供圆角、间距、边框或阴影，也应保留对应字段。
- 与 `theme.json.tokens` 保持一致，不额外发明另一套命名或语义。

`implementations/react/style.css` 用于让可选 React 实现真实体现主题：

- 必须 `@import "tailwindcss";`。
- 使用 `.dmb-page` 写入 `--dmb-*` CSS Variables，包括 accent、link、muted、background、font、radius、spacing、border 等可见变量。
- 变量值必须来自 `DESIGN.md` 或 `theme.json.tokens`，不能为了好看临时换色。

`tw.css` 用于保留 Tailwind v4 主题片段：

- 若来源提供 Tailwind/CSS 变量，应尽量原样保留并补齐 `@import "tailwindcss";`。
- 若暂无可用内容，可保持最小可用片段，但不得替代 `DESIGN.md` 成为事实源。

## 演示页规范

根级 `preview.html` 是主题默认入口，必须独立展示品牌、标签、token、来源、使用建议和 `DESIGN.md` 链接，不依赖 React、Vite、远程脚本或运行时 JSON fetch。

`implementations/react/index.tsx` 是可选增强入口，存在时必须：

- `export default Component`。
- 引入 `./style.css`，读取 `../../theme.json`，并把 `display` 配置传入 `DesignMdBatchShowcase`。
- 通过静态 import 引入本地预览资源，例如 `../../assets/official-homepage.webp?url`。
- 展示颜色、字体、圆角、间距、边框/阴影、使用建议和典型场景。
- 不展示内部采集过程、脚本状态、TODO、占位文案或无关营销内容。

可以复用 `DesignMdBatchShowcase` 的结构，但主题内容、标签、色板、使用建议和预览图必须来自当前 `DESIGN.md`。

## 更新工作流

1. 先读用户要求、当前主题 `DESIGN.md`、`theme.json`、`assets/tokens.json`、`preview.html`、`tw.css`、可选 `implementations/react/` 和相关资源。
2. 判断冲突：用户明确修改意图优先；否则以 `DESIGN.md` 为准，修正派生文件。
3. 修改事实源：新增或修正设计规则时先改 `DESIGN.md`。
4. 同步派生：更新 `theme.json.tokens/display`、`assets/tokens.json`、根级 `preview.html`、`tw.css` 和可选 React 实现。
5. 检查一致性：主色是否来自 `DESIGN.md`，字体角色是否完整，圆角/间距/边框/阴影是否没有丢失，使用建议是否非泛化。
6. 查找和导入：优先从 `getdesign.md` 和 `styles.refero.design` 定位主题，再用 `collect`、`generate`、`review` 三个脚本串起导入流程。
7. 来源采集：仅在用户提供来源或现有证据不足时读取 `references/source-handlers.md`，把登记后的采集结果作为 `DESIGN.md` 的证据来源。
8. 验收预览：运行主题 ready 检查并打开目标页面做视觉回归，确认字体、颜色、间距、建议项和预览图都能完整渲染。

来源证据优先级遵循 `references/source-handlers.md`：用户当前明确要求和确认结论优先，其次是更新任务中已确认的 `DESIGN.md`、结构化设计来源、网页和截图、自动提取 token。当前派生文件只用于检查漂移；`src/themes/linear/` 和同类主题只提供结构参考。

## 验收流程

基础检查：

```bash
node scripts/check-app-ready.mjs /themes/[主题名]
```

验收重点：

- `READY` 后访问目标页面，检查预览图、色板、字体、圆角、间距、边框、阴影和使用建议是否与 `DESIGN.md` 一致。
- 向用户提供主题预览时使用 ready 检查返回的 `targetUrl`；`/themes/<theme-key>` 只作为脚本参数或运行时路径。
- 若出现 `ERROR`，优先修复入口、资源路径、JSON 结构和 CSS 导入。
- 若出现 `TIMEOUT`，排查 dev server、依赖安装、构建缓存或长任务。
- 视觉问题按用户当前明确要求、`DESIGN.md`、`rules/requirements-alignment-guide.md` 的顺序判断，不以自动生成结果为准。
