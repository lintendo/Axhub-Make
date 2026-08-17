# TRAE 主题来源清单

## 状态与证据属性

- 处理状态：`待处理`、`处理中`、`部分完成`、`已完成`、`阻塞`
- 证据属性：`已观察事实`、`合理推断`、`待用户确认`

## 来源总表

| 来源 ID | 类型 | 原始位置 | 访问日期 | 访问条件 | 本地路径 | 覆盖范围 | 处理状态 | 证据属性 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src-001` | 官方网站 | https://www.trae.cn/ | 2026-08-14 | 公开访问，无需登录；动态首页 | `.local/theme-capture-trae/` | 首页导航、Hero、TraeWork、产品能力、隐私安全、页尾；桌面/平板/手机视口；computed tokens 与 CSS Variables | 已完成 | 已观察事实 |
| `src-002` | 工作流技能 | https://github.com/lintendo/Axhub-Skills/blob/main/skills/generate-theme/SKILL.md | 2026-08-14 | 公开 GitHub Raw 可访问 | 无长期本地副本 | 截图优先级、9 段式 DESIGN.md、Tailwind v4 映射与三级规范要求；不提供 TRAE 视觉事实 | 已完成 | 已观察事实 |

## 页面与视图证据

| 来源 ID | 页面、Frame 或视图 | 路由或进入路径 | 核心状态 | 关键交互 | 截图或证据路径 | 采集状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `src-001` | 首页全页 | `/` | 公开默认态，1440 x 900 | 顶部导航、下载 CTA、产品轮播、回到顶部 | `.local/theme-capture-trae/screenshot.png` | 已完成 |
| `src-001` | 桌面视图 | `/` | 1440 x 900，全导航与多列布局 | 双下载 CTA、功能卡片、横向轮播 | `.local/theme-capture-trae/responsive/desktop.png` | 已完成 |
| `src-001` | 平板视图 | `/` | 768 x 1024，折叠导航 | 菜单入口、横向内容视窗、轮播控制 | `.local/theme-capture-trae/responsive/tablet.png` | 已完成 |
| `src-001` | 手机视图 | `/` | 390 x 844，单列内容 | 菜单入口、纵向 CTA、单列卡片与页尾 | `.local/theme-capture-trae/responsive/mobile.png` | 已完成 |
| `src-001` | 结构与 token 摘要 | `/` | DOM 417 节点，桌面全页高度 6800px | 无交互执行；采集可见 computed style | `.local/theme-capture-trae/meta.json`、`.local/theme-capture-trae/theme.json`、`.local/theme-capture-trae/computed-tokens.json` | 已完成 |

## 图片、设计稿与文档

| 来源 ID | 文件或对象 | 内容范围 | 关联规则或组件 | 提取结果 |
| --- | --- | --- | --- | --- |
| `src-001` | 全页与响应式截图 | 页面气质、布局节奏、信息层级、图片风格、响应式重排 | 导航、Hero、CTA、功能卡片、轮播、隐私卡片、页尾 | 确认为暗色、高对比、荧光绿单一强调、直角组件和大段留白 |
| `src-001` | CSS Variables | 品牌色、表面、文本、边框、状态、字体与字号 | 全局 token | 采用官网变量值；排除浏览器默认 `#e5e7eb` 边框统计与追踪像素 |
| `src-002` | `generate-theme/SKILL.md` | 生成流程与交付质量要求 | `DESIGN.md`、Tailwind v4、截图证据 | 作为方法约束，不作为 TRAE 品牌事实 |

## 来源缺口与冲突

| 来源 ID | 缺口或冲突 | 影响范围 | 解除条件 |
| --- | --- | --- | --- |
| `src-001` | 未登录产品、企业后台、文档站和下载流程未进入 | 不声明后台信息架构、数据密度、表格或复杂表单为官网既有规则 | 后续获得对应公开页面、授权访问或截图后新增来源 |
| `src-001` | 截图没有覆盖键盘 focus、错误、空状态、禁用态和弹窗完整状态 | 相关组件只能采用保守默认；官网 CSS Variables 中的 disabled/status 值可作为 token 事实，不能证明组件形态 | 提供组件规范、交互录屏或对应状态截图 |
| `src-001` | 官网只观察到深色品牌模式 | 本主题以深色为默认与唯一确认模式，不反推浅色品牌方案 | TRAE 官方提供浅色规范或可观察页面 |
| `src-001` | 官方字体文件及授权未采集 | 预览使用本机 Inter/JetBrains Mono 或系统 fallback，不打包第三方字体二进制 | 提供可再分发字体文件与授权证据 |

