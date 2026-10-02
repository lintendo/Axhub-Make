# 主题来源处理

只读取当前任务实际出现的来源。原始采集数据放入已忽略的 `.local/`，长期证据位置和采集边界统一登记到主题 `SOURCES.md`。

## 处理表

| 来源 | 处理方式 | 必须登记的证据 |
| --- | --- | --- |
| 网站链接 | 使用可用的 Browser、Playwright 或浏览器自动化，先枚举导航、进入路径、可见角色和关键状态，再采集截图、响应式和 token 证据 | URL、访问条件、页面架构、路由/进入路径、截图、关键交互、覆盖边界和未覆盖区域 |
| Axure | 使用 `extract-axure-data` 处理在线原型链接或本地导出的 HTML | 页面、截图、交互、标注、结构化结果和解析边界 |
| Figma | 只使用 Agent 自带的 Figma 工具或 Figma MCP 读取链接、文件或结构化设计数据 | 文件、Page、Frame、组件、变量、状态、导出资源和访问边界 |
| 截图和图片 | 使用图像读取能力分析，保留原图或稳定原路径 | 图片、可观察内容、关联页面/状态和来源编号 |
| 现有原型和主题 | 读取选定原型页面、当前 `DESIGN.md` 和标准派生文件；跨页面比较重复规则并检查派生漂移 | 页面/主题路径、已确认规则、差异、重复模式和冲突 |

## 来源登记

每项来源使用稳定编号 `src-<三位序号>`。记录原始位置、访问日期、访问条件、本地证据路径、覆盖范围、处理状态和证据属性。

证据属性只使用：

- `已观察事实`
- `合理推断`
- `待用户确认`

现状反推中，`合理推断` 只能说明视觉估算或保守默认，不能用行业惯例补造未观察的品牌、产品、组件和交互事实。来源失败、授权不足和资料冲突不能静默跳过。

## 本地证据

建议按主题集中到：

```text
.local/theme-capture-<theme-key>/
├── screenshot.png
├── responsive/
│   ├── desktop.png
│   ├── tablet.png
│   └── mobile.png
├── theme.json 或 computed-tokens.json
├── meta.json
├── sections/
└── sources/
```

不要把原始采集目录提交到主题。只把稳定预览图、字体、source HTML 或运行时确实需要的私有资源复制到主题 `assets/`。

## 网站链接

1. 先列导航、页面入口、可见角色和访问条件，再决定采集顺序。
2. 尽量覆盖当前条件下可进入的全部页面，并记录默认、空、错误、权限、弹窗、抽屉和关键操作状态。
3. 截图与 `SOURCES.md` 页面表逐项对应，不能只保存图片而不写页面关系。
4. 需要登录时优先用 Chrome CDP 或 Bridge 复用用户登录状态，不索取或持久化用户密码。
5. 无限列表、动态数据和权限不可见区域写明边界，不声称已经完整采集。

优先使用项目采集入口：

```bash
pnpm run capture:theme-source -- --theme <theme-key> --url <url>
```

也可以使用 Playwright、in-app Browser、Chrome 自动化或等价工具。工具不是强制绑定，只要能够稳定获得截图、响应式、token 和页面证据。

当截图和 computed token 冲突时，以用户说明和真实截图为准。排除 cookie 弹窗、第三方组件、浏览器默认值和隐藏元素带来的污染。

### 网页 JSON 与等价采集

采集 JSON 是中间证据，不是主题最终产物：

- `meta.json`：至少记录 URL、页面标题、视口和采集日期。
- `theme.json`：页面采集工具从 computed style 统计出的颜色、字体、字号、间距、圆角、边框、阴影、过渡和 CSS Variables。
- `computed-tokens.json`：`theme.json` 缺失或不可靠时，用 `getComputedStyle` 抽样生成的替代摘要。

有现成工具时可以使用：

```bash
node <extract-page-data>/scripts/extract.mjs <url> --theme --screenshot --scroll -o .local/theme-capture-<theme-key>
node <clone-page>/scripts/clone.mjs <url> quick -o .local/theme-capture-<theme-key> --scroll
node <clone-page>/scripts/clone.mjs <url> responsive -o .local/theme-capture-<theme-key>
```

项目的 `scripts/capture-theme-homepage.mjs` 只负责抓取稳定官网预览图，不生成 `theme.json`；单独使用时必须再通过等价方式补充 `theme.json` 或 `computed-tokens.json`。

### 网页采集降级

- Playwright 浏览器缺失：连接系统 Chrome、使用 in-app Browser、Chrome 自动化或其他截图工具。
- `networkidle` 等待过久：改用 `domcontentloaded` 加稳定的固定等待。
- token 脚本失败：保留截图，改用浏览器 evaluate 或手工 `getComputedStyle` 抽样生成 `computed-tokens.json`。
- DOM 骨架或 section 采集失败：不阻塞主题生成，优先保留全页截图、响应式截图和关键视觉观察。
- 第三方弹窗污染：明确排除其字体、按钮和颜色，不写入品牌 token。

### 网页采集后回填

- 把稳定预览图复制到主题 `assets/`，使用主题内相对路径。
- 在 `theme.json.source` 记录网页来源和采集方式，不把中间 JSON 变成另一套事实源。
- 在 `DESIGN.md` 开头记录来源 URL 和采集日期；推断规则明确标注为截图观察或保守默认。
- 从 `DESIGN.md` 同步 `theme.json.tokens`、`assets/tokens.json`、`style.css` 和 `tw.css`。

## Axure

使用 `extract-axure-data`：

`https://github.com/lintendo/Axhub-Skills/tree/main/skills/extract-axure-data`

支持 Axure 在线链接和本地导出的 HTML。优先登记页面树、页面截图、交互、标注、组件状态和结构化结果。只把能够从原型证明的内容视为现状事实；没有展示的状态和品牌规则保留为缺口。

## Figma

Figma 必须通过 Agent 自带的 Figma 工具或 Figma MCP 处理。普通网页浏览不能替代 Figma 结构化访问，也不能把 Figma 编辑器外壳的 DOM/CSS 当成设计稿 token。

如果两种能力都不可用：

1. 不继续采集或声称读取了 Figma 的 Page、Frame、组件、Variables、Styles、Auto Layout 或原型连线。
2. 在 `SOURCES.md` 把该来源标为 `阻塞`，写清缺少工具或授权的解除条件。
3. 立即反馈用户，可以请用户改为提供 Figma 导出文件、截图或变量/token 文档，并把它们登记为新的来源类型。

单个 Figma 来源阻塞而其他独立证据充分时，可以说明缺口后继续；如果 Figma 会改变主题方向或验收标准，必须先等待用户处理。

## 截图和图片

- 保留原图或稳定原路径，并登记对应页面、Frame、状态和视口。
- 只提取可见的色彩、字体、层级、布局、间距、圆角、边框、阴影、组件形态和响应式线索。
- 截图没有展示的 hover、focus、错误、空状态和后台逻辑不能写成已确认事实。
- 多张截图之间的重复规则可以用于识别组件和模板任务；冲突样式分别登记，不自行选择有利版本。

## 现有原型和主题

- 原型：比较用户选定页面中的重复颜色、排版、间距、组件和布局模式；页面专属表现不自动上升为全局规则。
- 主题：已确认的 `DESIGN.md` 继续作为事实源。用 `theme.json`、tokens、CSS 和入口检查漂移，不反向覆盖明确规则。
- 更新请求只改变业务场景或展示文案时，不自动重写 token。确需修改视觉规则时先记录用户意图和受影响范围。

## 证据优先级

1. 用户当前明确要求、品牌规范和人工确认结论。
2. 更新任务中已确认的 `DESIGN.md`。
3. Figma、Axure、官方设计资料或原始 Design.md 等结构化来源。
4. 网页和截图中的可观察事实。
5. CSS Variables、computed style 和自动提取 token。
6. 从零创建时明确标注的保守默认。

单项来源失败不必自动阻塞全部工作；只有剩余证据不足，或缺口会改变方向、范围和验收时才暂停确认。所有部分完成、阻塞和冲突必须保留在 `SOURCES.md`。
