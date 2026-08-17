# TRAE 设计系统

> 基于 https://www.trae.cn/ 在 2026-08-14 的公开首页、1440/768/390 三种视口截图与 computed tokens 反推。`SOURCES.md` 保存证据和采集边界；本文是后续界面生成与审查的视觉事实源。

## 1. 视觉主题与氛围

TRAE 的可观察视觉语言属于暗色开发者工具：高对比、冷静、工程化、未来感、低装饰。主背景接近纯黑，但通过 `#121314` 表面和半透明白叠层建立区块，而不是依赖大面积阴影。`#32F08C` 是唯一持续出现的品牌强调色，用于 CTA、短标签、索引和焦点反馈；渐变只作为品牌字样或短促强调，不承担大面积背景。

- 适用：AI IDE、开发者工具、工程平台、Agent 工作流、技术产品发布页、深色控制台。
- 不适用：需要温暖生活方式摄影、柔和粉彩、大圆角社交卡片或高密度财务报表的界面。
- 页面气质：首屏留白大、文字短、产品截图真实、标题与 CTA 优先、能力区采用严格网格。
- 信息密度：营销叙事区中低密度；控件本身紧凑，常用 14px/32px 或 14px/48-64px 尺寸。
- 品牌边界：不引入第二个高饱和品牌色，不使用紫蓝渐变、彩色光斑、拟物材质或普遍的大圆角。
- 图片风格：直接展示真实 IDE/Agent 产品界面；图像容器保持直角或最多 4px 圆角，不用模糊氛围图替代产品状态。

| 级别 | 规则 |
| --- | --- |
| 推荐 | 用大块纯暗背景、短标题、真实产品截图和单点荧光绿形成层级。 |
| 允许 | 在品牌字样或局部文本中使用官方 90deg 绿色渐变。 |
| 禁止 | 用装饰性光球、玻璃拟态、霓虹描边或多色渐变填满背景。 |

## 2. 色彩系统

### 语义色板

| Token | 值 | Tailwind / CSS | 用途与边界 |
| --- | --- | --- | --- |
| `background` | `#0A0B0D` | `bg-background` / `--background` | 默认页面底色；不要用纯黑卡片叠在其上制造不可见层级。 |
| `surface` | `#121314` | `bg-surface` / `--surface` | 能力区、卡片和分段背景。 |
| `surface-raised` | `#171A1C` | `bg-surface-raised` | 需要比 `surface` 更清楚的局部面板；不是默认卡片色。 |
| `overlay-1` | `#EDEFF20A` | `bg-overlay-1` | 最轻 hover 或叠层。 |
| `overlay-2` | `#EDEFF214` | `bg-overlay-2` | 次级 hover、分组表面。 |
| `overlay-3` | `#EDEFF221` | `bg-overlay-3` | 选中/强调表面。 |
| `brand` | `#32F08C` | `bg-primary` / `text-primary` | 主 CTA、品牌短文本、索引与焦点；同一视口控制使用数量。 |
| `brand-hover` | `#0FDC78` | `--primary-hover` | 品牌按钮和链接 hover。 |
| `brand-disabled` | `#32F08C4D` | `--primary-disabled` | 禁用背景，不用于正文。 |
| `foreground` | `#F5F9FE` | `text-foreground` | 标题、主要正文、图标。 |
| `muted-foreground` | `#A6AAB5` | `text-muted-foreground` | 说明、导航默认态、次级信息。 |
| `tertiary-foreground` | `#787D87` | `text-tertiary-foreground` | 元数据、页尾、disabled 文本；正文使用前检查对比度。 |
| `border` | `#FFFFFF1F` | `border-border` | 默认可见边框。 |
| `border-subtle` | `#FFFFFF0F` | `border-border-subtle` | 暗色表面的轻分割线。 |
| `destructive` | `#F64D46` | `bg-destructive` / `text-destructive` | 错误、危险操作。 |
| `info` | `#387BFF` | `text-info` | 信息状态，不升级为品牌主色。 |
| `success` | `#26A57B` | `text-success` | 成功状态；品牌 CTA 仍使用 `brand`。 |
| `warning` | `#DC8730` | `text-warning` | 警告状态。 |

官方品牌渐变为 `linear-gradient(90deg, #3EE1A3 0%, #32F08C 36%, #60F2BD 71.63%, #A0FDE7 100%)`，映射为 `--brand-gradient`。它只适合字样、1-2 个短元素或品牌进度，不作为整页背景。

| 级别 | 规则 |
| --- | --- |
| 推荐 | 组件代码使用 `bg-primary`、`text-foreground` 等语义类；颜色值集中在 token。 |
| 允许 | 状态组件使用 blue/green/orange/red 状态色，但必须有图标或文字辅助。 |
| 禁止 | 硬编码未登记色值、把状态色当品牌色、在 `brand` 背景上使用白色低辨识文本。 |

## 3. 字体系统

### 字体角色

| 角色 | 字体族 | Tailwind | 用途 |
| --- | --- | --- | --- |
| Display | `Inter, "PingFang SC", "Microsoft YaHei", sans-serif` | `font-display` | Hero、页面标题、分区标题。 |
| Body | `Inter, "PingFang SC", "Microsoft YaHei", sans-serif` | `font-sans` | 正文、导航、按钮、表单。 |
| Mono | `"JetBrains Mono", "SFMono-Regular", Consolas, monospace` | `font-mono` | `[01]` 索引、代码、命令、短状态。 |

不打包未经确认授权的字体文件；Inter/JetBrains Mono 不可用时使用上述系统 fallback。

### 字号层级

| 层级 | 桌面字号/行高 | 移动字号/行高 | 字重 | 字距 | Tailwind 建议 |
| --- | --- | --- | --- | --- | --- |
| Display 1 | `72px / 1.1` | `40px / 1.1` | 500 | `0` | `text-display-1` |
| Heading 1 | `56px / 1.2` | `32px / 1.2` | 600 | `0` | `text-heading-1` |
| Heading 2 | `48px / 1.2` | `28px / 1.2` | 600 | `0` | `text-heading-2` |
| Subhead | `24px / 1.3` | `20px / 1.3` | 600 | `0` | `text-subhead` |
| Body 1 | `18px / 1.6` | `16px / 1.6` | 400 | `0` | `text-lg` |
| Body 2 | `16px / 1.6` | `16px / 1.6` | 400 | `0` | `text-base` |
| Body 3 | `14px / 1.6` | `14px / 1.6` | 400 | `0` | `text-sm` |
| UI | `14px / 1.2` | `14px / 1.2` | 500 | `0.025em` | `text-ui` |
| Caption | `12px / 1.2` | `12px / 1.2` | 500 | `0` | `text-xs` |
| Code | `13px / 1.3` | `13px / 1.3` | 400 | `0` | `font-mono text-code` |

| 级别 | 规则 |
| --- | --- |
| 推荐 | 标题使用 500/600，正文使用 400，控件使用 500；中英文混排保持 `letter-spacing: 0`，仅短 UI 标签可用 `0.025em`。 |
| 允许 | 仅 Hero 在宽屏使用 72px；容器宽度不足时切换固定移动字号，不按视口连续缩放。 |
| 禁止 | 使用负字距、正文字号低于 14px、同一界面混用第三种展示字体或大段等宽正文。 |

## 4. 组件规范

官网明确观察到导航、下载按钮、轮播控制、能力卡片和状态索引；输入框、表格、弹窗未采集到完整事实，下列规则对这些组件标注为保守默认。

### 基础组件

| 组件 | 规格 | 状态与行为 | 可复用类名/Token |
| --- | --- | --- | --- |
| Primary Button | 高 `32/48/64px`；水平 padding `8/14/24px`；直角 `0px`；`#32F08C` 底、`#0A0B0D` 字 | hover `#0FDC78`；active 轻微降低亮度；disabled `#32F08C4D`；focus `2px #32F08C` 外环 | `.btn-brand` / `h-control-* bg-primary text-primary-foreground rounded-none` |
| Outline Button | 高 `48/64px`；`1px #FFFFFF`；透明底；直角 | hover 使用 `overlay-2`；focus 同品牌环；禁用降低边框与文本不透明度 | `.btn-outline` / `border-contrast rounded-none` |
| Icon Button | `32px` 或 `40px` 固定正方形；图标 16-20px | 使用符号图标和 tooltip；hover `overlay-3`；不得被动态内容撑大 | `.icon-button` |
| Navigation | 桌面高 64px，左右 padding 32px；链接 14px/500 | 默认 `muted-foreground`，active/hover `foreground`；移动端只保留品牌和菜单按钮 | `.global-nav` |
| Feature Card | `surface` 或 `surface-raised`；1px subtle border；0-4px 圆角；24-32px padding | 默认平面，无常驻重阴影；hover 仅改变边框/叠层 | `.feature-card` |
| Code Label | 12-13px mono，品牌绿色，短文本 | 不使用纯色背景强行做胶囊；与标题保持 8-12px 间距 | `.code-label` |
| Input（保守默认） | 高 40px；`surface` 底；1px `border`；0px 圆角；左右 padding 12px | focus 使用品牌边框和 2px 外环；error 使用 `destructive`；必须有可见 label | `.field-control` |
| Table（保守默认） | 表头 14px/500；单元格 14px/1.6；水平分隔线 `border-subtle` | 行 hover `overlay-1`；移动端优先横向滚动或改为键值列表 | `.data-table` |
| Dialog（保守默认） | `surface-raised`，1px `border`，4px 圆角，最大宽度 560px | 使用 focus trap、Escape 关闭和明确标题；背景遮罩 `rgba(0,0,0,.72)` | `.dialog-panel` |

| 级别 | 规则 |
| --- | --- |
| 推荐 | 交互元素保持直角、明确边界和 44px 移动触控目标；图标按钮使用 Lucide 等熟悉符号并提供名称。 |
| 允许 | 品牌发布 Hero 使用 64px 高 CTA；应用内高频工具栏使用 32-40px 紧凑控件。 |
| 禁止 | 把所有按钮做成胶囊、把页面 section 包成浮动卡片、嵌套卡片或只靠阴影表达可点击性。 |

## 5. 布局与间距

### 布局

- 页面容器：桌面最大宽度 `1376px`，左右 gutter `32px`；内容叙事区域建议 `1200-1280px`。
- 导航：固定高度 `64px`；公告条观察高度约 `40px`，不纳入应用内产品布局的必选模式。
- Hero：桌面可采用左右双列，主标题与平台 CTA 分区；移动端改为单列，标题、说明、CTA、媒体按阅读顺序排列。
- 能力区：桌面 2-3 列或横向轮播，移动端 1 列；隐私卡片桌面 3 列、移动端纵向排列。
- Section：营销页使用 `80-100px` 垂直节奏；正文与紧凑组件不得机械复制该大留白。
- 图片：产品截图维持原始比例，使用 `aspect-ratio` 与 `object-fit: contain`；不裁掉关键 IDE 控件。

### 间距标尺

| Token | 值 | Tailwind | 用途 |
| --- | --- | --- | --- |
| `space-0.5` | `2px` | `gap-0.5` | 图标内部或细微对齐。 |
| `space-1` | `4px` | `gap-1` | 极紧凑元件。 |
| `space-2` | `8px` | `gap-2` | 图标与标签、短控件。 |
| `space-3` | `12px` | `gap-3` | 字段内部、标签组。 |
| `space-4` | `16px` | `gap-4` | 默认组件间距。 |
| `space-6` | `24px` | `gap-6` | 卡片 padding、局部分组。 |
| `space-8` | `32px` | `gap-8` | 导航 gutter、卡片组。 |
| `space-12` | `48px` | `gap-12` | 大组件与媒体间距。 |
| `space-20` | `80px` | `py-20` | 常规 section。 |
| `space-25` | `100px` | `py-[100px]` | 宽屏叙事 section。 |

| 级别 | 规则 |
| --- | --- |
| 推荐 | 优先使用 4px 基线，保留官网观察到的 2px 微间距；通过固定容器、栅格和 aspect ratio 防止布局漂移。 |
| 允许 | 营销页用 80/100px section 间距，应用界面缩短到 24/32/48px。 |
| 禁止 | 使用无法解释的 17px、171px 或小数 computed 值作为系统 token；不要让横向轮播内容直接溢出视口。 |

## 6. 深度、阴影与边框

TRAE 的深度主要来自表面色与细边框。官网只在按钮统计中观察到轻微 `0 1px 3px rgba(0,0,0,.10), 0 1px 2px -1px rgba(0,0,0,.10)`；没有证据支持给所有卡片添加阴影。

| Token | 值 | 用途 |
| --- | --- | --- |
| `border-subtle` | `1px solid #FFFFFF0F` | 暗背景分区和静态卡片。 |
| `border-default` | `1px solid #FFFFFF1F` | 输入、按钮、可交互面板。 |
| `border-strong` | `1px solid #FFFFFF2E` | hover/active 或需要明确边界的区域。 |
| `border-brand` | `1px solid #32F08C` | focus、选中和品牌强调，不作为常驻装饰。 |
| `shadow-control` | `0 1px 3px rgba(0,0,0,.10), 0 1px 2px -1px rgba(0,0,0,.10)` | 仅用于需要与相邻表面分离的按钮。 |
| `focus-ring` | `0 0 0 2px #0A0B0D, 0 0 0 4px #32F08C` | 键盘焦点，保证暗背景可见。 |

圆角标尺：`0px` 控件与媒体、`2px` 微标签、`4px` 卡片/弹窗保守上限。未观察到胶囊形态，不把 `9999px` 纳入通用 token。

| 级别 | 规则 |
| --- | --- |
| 推荐 | 先用 `surface`、`surface-raised` 和 1px 边框表达层级。 |
| 允许 | 按钮或临时浮层使用一层轻阴影；键盘 focus 使用双环。 |
| 禁止 | 默认卡片使用大面积柔光、彩色阴影、内外多重发光或超过 4px 的普遍圆角。 |

## 7. 动效

官网观察到颜色变化 `150ms cubic-bezier(.4,0,.2,1)`、transform `200-300ms`、opacity `300ms`；没有采集到可复用命名动画。

| Token | 值 | 用途 |
| --- | --- | --- |
| `motion-fast` | `150ms cubic-bezier(.4,0,.2,1)` | 颜色、背景、边框和图标状态。 |
| `motion-base` | `200ms ease` | 按钮轻微 transform、tooltip。 |
| `motion-slow` | `300ms ease` | 轮播、抽屉和内容显隐。 |

- hover：只改变颜色、边框或最多 `translateY(-1px)`，避免缩放导致布局或文字抖动。
- 轮播：移动距离与容器宽度绑定，切换 300ms；提供 previous/next 与当前状态。
- 出现/退出：使用 opacity + 不超过 12px 的位移；退出时保持焦点可预测。
- `prefers-reduced-motion: reduce`：关闭非必要 transform/自动轮播，过渡降到 1ms。

| 级别 | 规则 |
| --- | --- |
| 推荐 | 交互反馈 150-200ms，结构切换 300ms，并尊重 reduced motion。 |
| 允许 | 产品发布页使用一次性淡入或短距离上移。 |
| 禁止 | 超过 600ms 的控件反馈、无控制的循环动画、弹跳缓动、光效追随指针或大幅视差。 |

## 8. 响应式行为

| 视口 | 布局行为 | 导航与控件 | 图片/卡片 |
| --- | --- | --- | --- |
| Desktop `>= 1024px` | 最大 1376px 容器；Hero 可双列；能力区 2-3 列 | 展示完整导航、登录与下载 CTA；64px 高 Hero CTA 可并排 | 产品媒体完整展开，轮播显示多个项目，隐私卡片 3 列 |
| Tablet `768-1023px` | 左右 gutter 24px；保留部分双列叙事但控制可视宽度 | 折叠为品牌 + 菜单按钮；CTA 可并排或按内容宽度折行 | 横向能力集合进入受控 viewport，不让页面本身横向溢出 |
| Mobile `< 768px` | 左右 gutter 16px；所有主叙事单列；section 缩至 48-64px | 只保留品牌、菜单；双 CTA 纵向排列并可占满宽度 | 卡片单列；轮播单卡；真实截图 `contain`；页尾链接分组纵向排布 |

- 标题在断点切换到固定字号，不使用 `vw` 连续缩放。
- 菜单展开后必须有 focus trap、Escape/返回关闭、滚动锁定与触控目标。
- 表格、代码和宽内容优先局部横向滚动，不扩大页面宽度。
- 重要 CTA 不能只在 hover 出现；移动端不隐藏完成核心流程所需操作。

| 级别 | 规则 |
| --- | --- |
| 推荐 | 在 1440、768、390 三个基准视口逐项检查阅读顺序、焦点顺序、溢出与文字换行。 |
| 允许 | 平板在 Hero 保留双列，但内容区必须有明确 `minmax(0, 1fr)` 和 overflow 约束。 |
| 禁止 | 直接缩小桌面画布、隐藏核心 CTA、用横向页面滚动承载轮播或让长中文标题压住后续内容。 |

## 9. Prompt guide

### 推荐写法

- “使用 TRAE 主题的 `#0A0B0D` 页面底、`#121314` 表面、`#32F08C` 单一品牌强调和直角组件；所有实现从语义 token 取值。”
- “先建立 1376px 最大容器、32px desktop gutter 和 80-100px 营销 section 节奏，再布置真实产品截图与短文案。”
- “按钮使用 0px 圆角、14px/500 UI 字体、明确 hover/focus/disabled；移动端触控目标不小于 44px。”
- “标题使用 Inter 500/600，索引与代码使用 JetBrains Mono；中文 fallback 使用 PingFang SC/Microsoft YaHei。”
- “在 1440/768/390 视口验证导航折叠、CTA 重排、卡片单列和媒体不裁切。”

### 禁止写法

- 不要添加紫蓝渐变、光球、玻璃拟态、默认大阴影或圆润 SaaS 胶囊按钮。
- 不要把所有 section 包成浮动卡片，也不要嵌套卡片。
- 不要用未登记的高饱和色竞争 `#32F08C`，状态色不得取代品牌色。
- 不要使用负字距、viewport 字号缩放、模糊占位图或裁掉真实产品关键区域。
- 不要把未采集的后台表格、弹窗、错误态写成 TRAE 官方既有事实。

### 可直接复用的生成提示

```text
依据 TRAE DESIGN.md 生成一个生产级开发者工具界面。使用深色语义色板、Inter/JetBrains Mono 字体角色、0-4px 圆角、细边框和克制动效；以真实产品状态和清晰工作流为视觉重心。实现完整 hover/focus/disabled 状态，并在 1440、768、390 三个视口验证导航、CTA、卡片与媒体重排。不要引入第二品牌强调色、装饰性光球、玻璃拟态、大圆角或普遍重阴影。
```

