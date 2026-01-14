# Chrome 扩展导出转换器

专门用于转换通过 Chrome 扩展 Axhub 导出的 HTML 文件为 React 组件。

## 使用方法

```bash
node scripts/chrome-export-converter.mjs <source-dir> [output-name]
```

### 参数说明

- `source-dir`: Chrome 扩展导出的目录（必须包含 `index.html`）
- `output-name`: 输出页面名称（可选，默认使用目录名）

### 示例

```bash
node scripts/chrome-export-converter.mjs ".drafts/my-export" my-page
```

## 输入格式要求

Chrome 扩展导出的目录结构：

```
my-export/
├── index.html          # 主 HTML 文件（必需）
├── style.css           # 样式文件（包含 .style_XXX 类定义）
├── doms.toon           # DOM 结构（不使用）
├── styles.toon         # 样式池（不使用）
└── assets/
    ├── images/         # 图片资源
    └── fonts/          # 字体文件
```

## 转换流程

### 1. HTML 解析
- 读取 `index.html`
- 提取 `<head>` 中的外部资源（scripts, links）
- 提取 `<body>` 内容并转换为 JSX

**注意**：Chrome 扩展导出的特点是所有样式都在外部 `style.css` 文件中，HTML `<head>` 中只有基础的 `<style>` 标签（如 `box-sizing`），不包含实际的样式类定义。

### 2. 字体智能处理

**仅从外部 `style.css` 提取字体**：
- 扫描所有 `@font-face` 规则
- 判断字体类型：
  - **CDN 字体**：`url()` 以 `http://`、`https://` 或 `//` 开头
  - **本地字体**：相对路径（如 `assets/fonts/...`）

**处理策略**：
- **CDN 字体**：保留原始 URL，不复制文件
- **本地字体**：
  1. 调整路径：`assets/fonts/...` → `./assets/fonts/...`
  2. 复制字体文件到输出目录

### 3. HTML → JSX 转换
- `class` → `className`
- `for` → `htmlFor`
- 自闭合标签：`<img>` → `<img />`，移除 `</img>`
- HTML 实体：`&lt;` → `{'<'}`、`&lt;/` → `{'</'}`
- 文本节点花括号转义：`{` → `{'{'}`、`}` → `{'}'}`
- 移除包装标签：`<root>` 和嵌套的 `<body>`

### 4. CSS 生成

生成的 `style.css` 结构：

```css
@import "tailwindcss";

/* 字体定义 */
/* CDN 字体（保留原始链接） */
@font-face { ... }

/* 本地字体（已复制到 assets 目录） */
@font-face {
  src: url('./assets/fonts/...'); /* 路径已调整 */
}

/* 样式类定义（来自 style.css）*/
.style_1 { ... }
.style_2 { ... }
/* ... 所有 .style_XXX 类 ... */
```

**关键点**：
- 字体定义从原始 CSS 中提取并单独处理
- 原始 CSS 中的 `@font-face` 规则被移除（避免重复）
- 保留所有 `.style_XXX` 类定义（边框、圆角、背景等）

### 5. 静态资源复制
- 复制 `assets/images/` → 输出目录
- 复制 `assets/fonts/` → 输出目录（仅本地字体）

## 输出结构

```
src/pages/my-page/
├── index.tsx           # React 组件
├── style.css           # 完整样式（包含所有 .style_XXX 类）
└── assets/
    ├── images/         # 图片资源
    └── fonts/          # 本地字体文件
```

## 与 Stitch 转换器的区别

| 特性 | Chrome Export | Stitch |
|------|---------------|--------|
| 输入文件 | `index.html` | `code.html` |
| 样式来源 | 外部 `style.css` | 内联 + Tailwind 配置 |
| 字体处理 | 智能区分 CDN/本地 | 主要使用 CDN |
| 结构特点 | 嵌套 `<body>` + `<root>` | 单层结构 |
| Tailwind | 不处理配置 | 提取并转换配置 |

## 注意事项

1. **必须有 index.html**：转换器只识别 Chrome 扩展导出格式
2. **样式完整性**：确保 `style.css` 包含所有 `.style_XXX` 类定义
3. **字体文件**：本地字体会被完整复制，可能较大（如 505 个字体文件）
4. **不使用 TOON 文件**：`doms.toon` 和 `styles.toon` 不参与转换

## 故障排除

### 样式没有生效
- 检查 `style.css` 是否存在
- 确认生成的 CSS 文件包含 `.style_XXX` 类定义

### 字体加载失败
- 检查字体文件是否正确复制到 `assets/fonts/`
- 确认 CSS 中的字体路径是否正确

### 运行时错误
- 检查生成的 `index.tsx` 是否有语法错误
- 使用 `getDiagnostics` 工具检查 TypeScript 错误
