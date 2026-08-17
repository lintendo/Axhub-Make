# TRAE 设计系统任务计划

## 状态定义

- `待确认`：范围、来源或关键设计决策尚未确认。
- `待执行`：范围已确认，可以开始。
- `执行中`：当前正在采集、生成或同步。
- `待验收`：产物已完成，等待 ready 检查、视觉验收或用户确认。
- `已完成`：当前任务已经通过验收。
- `阻塞`：来源、工具、授权或依赖不足，暂时不能继续。

## 执行阶段

| 阶段 | 目标 | 进入条件 | 完成条件 | 状态 |
| --- | --- | --- | --- | --- |
| 一期 | 完成来源登记、标准主题产物和验收 | 目标主题 `trae` 与 `src-001`、`src-002` 已明确 | 标准主题产物一致且预览通过 | 阻塞 |
| 后续 | 按确认顺序实现高频组件和模板 | 一期已完成且任务范围已确认 | 对应任务逐项通过验收 | 待确认 |

## 一期主题任务

| 任务 ID | 阶段 | 类别 | 任务 | 预期产物 | 来源 ID | 依赖任务 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `theme-001` | 一期 | 来源 | 官网与生成技能采集、登记 | `SOURCES.md` 和 `.local/theme-capture-trae/` | `src-001`、`src-002` | 无 | 来源、边界、状态和缺口可追溯 | 已完成 |
| `theme-002` | 一期 | 规范 | 编写可执行 9 段式设计规范 | `DESIGN.md` | `src-001`、`src-002` | `theme-001` | 事实与推断边界清楚；各类 token 有推荐、允许、禁止规则 | 已完成 |
| `theme-003` | 一期 | 派生 | 同步结构化 token、Tailwind 与展示入口 | `theme.json`、`assets/tokens.json`、`style.css`、`tw.css`、`index.tsx` | `src-001` | `theme-002` | 派生内容与 `DESIGN.md` 一致，资源全部主题内引用 | 已完成 |
| `theme-004` | 一期 | 预览 | 固化官网预览资源并接入 showcase | `assets/official-homepage.webp`、`_runtime/DesignMdBatchShowcase/` | `src-001` | `theme-003` | 本地静态资源可加载，预览不依赖官网运行时 | 已完成 |
| `theme-005` | 一期 | 验收 | ready 检查与真实视觉验收 | 可访问的主题预览 | `src-001`、`src-002` | `theme-003`、`theme-004` | JSON/CSS/token 一致；页面无资源错误、溢出或遮挡 | 阻塞 |

## 组件任务

Radix 无头组件只用于需要复杂键盘行为或浮层状态的组件；简单按钮和卡片优先保留原生语义，避免为视觉样式引入不必要依赖。

| 任务 ID | 阶段 | 类别 | 组件 | 语义用途与范围 | 变体和状态 | 无障碍要求 | 来源 ID | 技术说明 | 依赖任务 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `component-001` | 后续 | 组件 | Action Button | 下载、登录、主要转化与次要描边操作 | brand、outline、ghost；hover/focus/disabled/loading | 44px 最小触控目标、可见焦点、图标有名称 | `src-001` | 原生 `button`/`a` 足够；不采用 Radix | `theme-005` | 尺寸、直角、状态色和键盘行为符合规范 | 待确认 |
| `component-002` | 后续 | 组件 | Responsive Global Nav | 桌面全导航与移动端折叠菜单 | desktop、collapsed、open、active | 菜单按钮含 `aria-expanded`，焦点锁定与 Escape 关闭 | `src-001` | 移动菜单可评估 Radix Dialog/NavigationMenu | `theme-005` | 三视口结构与官网观察一致，键盘路径完整 | 待确认 |
| `component-003` | 后续 | 组件 | Feature Card / Carousel | 产品能力、IDE 工作流与安全能力展示 | default、active、previous、next | 控制按钮有名称，支持键盘与 reduced motion | `src-001` | Card 无需 Radix；轮播可评估 Embla，不强制 Radix | `theme-005` | 图片、说明、索引和重排策略一致 | 待确认 |
| `component-004` | 后续 | 组件 | Status / Code Label | `[01]` 编号、代码感短标签与状态强调 | neutral、brand、success、warning、error | 不仅依赖颜色表达状态 | `src-001` | 原生文本与语义属性足够 | `theme-005` | JetBrains Mono、字号与对比度符合规范 | 待确认 |

## 模板任务

| 任务 ID | 阶段 | 类别 | 模板 | 适用场景与组成区块 | 响应式要求 | 来源 ID | 依赖任务 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `template-001` | 后续 | 模板 | 开发者工具发布页 | 通知条、导航、Hero、双 CTA、产品预览、能力区、安全区、页尾 CTA | 桌面多列、平板视窗/轮播、手机单列 | `src-001` | `component-001` 至 `component-004` | 首屏与后续内容节奏可复用且无移动端溢出 | 待确认 |
| `template-002` | 后续 | 模板 | 产品能力叙事页 | 编号标题、产品截图、短说明、横向能力集合 | 大屏横向展示；小屏单卡/纵向排列 | `src-001` | `component-003`、`component-004` | 信息层级、图片比例和阅读顺序稳定 | 待确认 |

## 执行入口

- 先读取 `SOURCES.md`、本 `PLAN.md`、`DESIGN.md` 和全部标准派生文件。
- 视觉事实以 `src-001` 截图为先，CSS Variables 用于精确校准；`src-002` 只约束生成质量。
- 新增、移除或改变组件/模板范围时只更新本文件，不把任务状态写入 `DESIGN.md`。

## 验证记录

2026-08-14 已完成以下主题级检查：

- 必需目录与文件、JSON 解析、`identity.slug`、主题内资源路径检查通过。
- `theme.json.tokens` 与 `assets/tokens.json` 深度一致。
- 主题入口定向 TypeScript 编译通过。
- `theme-resource-boundaries` 与 `theme-source-wiring` 共 4 项测试通过。
- Make 管理端真实预览通过：桌面主题 iframe 为 `1200 x 3659`，移动端为 `390 x 7029`；两者 `scrollWidth === clientWidth`、坏图 0、控制台错误 0。
- 已逐段检查预览图、色板、字体、间距、圆角、阴影、边框、组件和 Do/Don'ts；暗色表面和文字对比一致，无可见遮挡。

仓库级 `node scripts/check-app-ready.mjs /themes/trae` 已执行，但被本主题范围外的既有 TypeScript 错误拦截，涉及 `src/prototypes/home-pilot/index.tsx`、`tests/design-knowledge-snapshot.test.ts` 和 `tests/search-design-system-install.test.ts`。解除条件是这些全局类型错误修复后重新运行 ready 检查；在此之前不把一期和 `theme-005` 提前标记为 `已完成`。
