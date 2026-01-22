# Firecrawl 设计规范

> 本文档定义了 Firecrawl 主题的设计价值、能力边界与使用指南，帮助开发者和 AI 正确理解和应用该设计系统。

## 设计系统价值

### 品牌定位

Firecrawl 是一款面向开发者的爬取与解析工具产品，视觉风格以 **清爽浅色、清晰层级、橙色强调** 为特征，强调效率、可读性与可靠性。主色为活力橙色 `#FA5D19`，形成强烈的行动导向与品牌记忆点。

### 核心价值

1. **高可读性** - 浅色背景与高对比文本保证信息密度下的易读性
2. **聚焦关键操作** - 橙色仅用于关键交互，提高可辨识度
3. **轻量、克制** - 界面元素简洁，避免过度装饰
4. **稳定、可信赖** - 统一的线框与层级系统增强专业感

### 设计原则

| 原则 | 含义 |
|------|------|
| **白底优先** | 页面以浅色背景为主，突出信息内容 |
| **橙色强调** | 主色用于关键按钮与链接 |
| **层级清晰** | 通过卡片、边框、阴影区分结构 |
| **一致节奏** | 以 2/4/8px 的间距网格构建布局节奏 |

---

## 能力边界

### 适合的场景

- 开发者工具与控制台
- API/数据平台后台
- 文档与配置密集的产品
- 轻量业务操作台

### 不适合的场景

- 高度品牌化的视觉创意站点
- 强游戏化或娱乐化界面
- 重度暗色主题产品

---

## 色彩系统

### 主色调 (Primary)

| 变量 | 色值 | 用途 |
|------|------|------|
| `--primary` | `#FA5D19` | 品牌色、按钮、强调元素 |
| `--primary-foreground` | `#FFFFFF` | Primary 上的文字颜色 |

### 背景色 (Background)

| 变量 | 色值 | 用途 |
|------|------|------|
| `--background` | `#F9F9F9` | 页面主背景 |
| `--card` | `#FFFFFF` | 卡片/区块背景 |
| `--popover` | `#FFFFFF` | 悬浮卡片/弹窗背景 |
| `--muted` | `rgba(0,0,0,0.04)` | 输入框/次级背景 |

### 文本色 (Text)

| 变量 | 色值 | 用途 |
|------|------|------|
| `--foreground` | `#262626` | 主要文本 |
| `--muted-foreground` | `rgba(38,38,38,0.64)` | 次要文本 |
| `--subtle` | `rgba(38,38,38,0.48)` | 辅助文本、占位符 |

### 边框色 (Border)

| 变量 | 色值 | 用途 |
|------|------|------|
| `--border` | `#E5E7EB` | 卡片边框 |
| `--border-subtle` | `#EDEDED` | 分割线 |

### 语义色 (Semantic)

| 变量 | 色值 | 用途 |
|------|------|------|
| `--destructive` | `#EF4444` | 错误、危险操作 |
| `--accent` | `#FA5D19` | 强调色（与 primary 一致） |

---

## 字体系统

### 字体族

| 用途 | 字体 | CSS 变量 |
|------|------|---------|
| 主字体 | Suisse | `--font-sans` |
| 等宽字体 | Geist Mono | `--font-mono` |

### 文本样式

| 名称 | 字号 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| H1 | 28px | 500 | 1.4 | 页面主标题 |
| H2 | 20px | 450 | 1.4 | 区块标题 |
| Body | 16px | 400 | 1.5 | 默认正文 |
| Body Small | 14px | 400 | 1.55 | 次要正文 |
| Label | 14px | 450 | 1.4 | 按钮、标签 |
| Code | 14px | 400 | 1.55 | 代码文本 |

---

## 间距系统

以 **2/4/8px** 为基础节奏：

| Token | 值 | 用途 |
|-------|-----|------|
| `--spacing-1` | 2px | 细微间隔 |
| `--spacing-2` | 4px | 紧凑间距 |
| `--spacing-3` | 6px | 小间距 |
| `--spacing-4` | 8px | 元素内间距 |
| `--spacing-6` | 12px | 组件间距 |
| `--spacing-8` | 16px | 标准间距 |
| `--spacing-10` | 20px | 区块内间距 |
| `--spacing-12` | 24px | 区块间距 |
| `--spacing-20` | 40px | 页面级间距 |

---

## 圆角系统

Firecrawl 使用中等圆角，强调轻量与亲和：

| Token | 值 | 用途 |
|------|------|------|
| `--radius-sm` | 4px | 标签、输入框 |
| `--radius-md` | 6px | 按钮 |
| `--radius-lg` | 10px | 卡片 |
| `--radius-xl` | 12px | 弹窗 |
| `--radius-2xl` | 16px | 大容器 |
| `--radius-full` | 999px | 胶囊按钮 |

---

## 阴影系统

| 名称 | 值 | 用途 |
|------|-----|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 轻量卡片 |
| `--shadow-md` | `0 2px 12px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.56)` | 浮层、弹窗 |

---

## 图标系统

- **风格**：线性图标为主，线宽 1.5px
- **尺寸**：16/20/24px
- **颜色**：默认 `--muted-foreground`，高亮使用 `--primary`

---

## 组件规范

### Button 按钮

#### Primary Button
```css
background: var(--primary);      /* #FA5D19 */
color: var(--primary-foreground); /* #FFFFFF */
border-radius: 6px;
padding: 10px 20px;
font-size: 14px;
font-weight: 450;
```

#### Secondary Button
```css
background: var(--secondary);     /* #EDEDED */
color: var(--secondary-foreground); /* #262626 */
border: 1px solid var(--border);
border-radius: 6px;
padding: 10px 20px;
```

#### Ghost Button
```css
background: transparent;
color: var(--foreground);
border: 1px solid var(--border);
border-radius: 6px;
```

### Card 卡片

```css
background: var(--card);          /* #FFFFFF */
border: 1px solid var(--border);
border-radius: 10px;
padding: 20px;
box-shadow: var(--shadow-sm);
```

### Input 输入框

```css
background: var(--muted);         /* rgba(0,0,0,0.04) */
color: var(--foreground);
border: 1px solid var(--border);
border-radius: 6px;
padding: 8px 12px;
font-size: 14px;
```

---

## 使用约束

### 必须遵守

1. **主色节制使用** - 仅用于关键操作或强调信息
2. **保持浅色基调** - 不使用大面积深色背景
3. **间距统一** - 使用 spacing token 组合布局
4. **文本对比度** - 关键文本必须清晰可读

### 建议做法

1. **卡片结构** - 使用卡片拆分信息层级
2. **轻量阴影** - 避免过重的阴影造成视觉噪音
3. **按钮分级** - Primary 只用于最重要操作

### 禁止做法

1. **不要过度使用橙色** - 会削弱强调效果
2. **不要使用纯黑文本** - 与整体轻量风格冲突
3. **不要使用过大圆角** - 与整体简洁风格不符

---

## 文件结构

```
src/themes/firecrawl/
├── globals.css      # Tailwind CSS 变量定义
├── index.tsx        # 主题演示页
└── DESIGN-SPEC.md   # 本文档
```
