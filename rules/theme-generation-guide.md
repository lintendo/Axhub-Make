# 主题生成规范（Design Tokens + Tailwind CSS + 演示页）

本文档约束“主题”的生成产物与实现方式，供 AI 在用户提供任意形式输入（token、设计规范文档、截图、样式提取结果等）时，稳定产出可用的主题文件与演示页面。

## 🎯 交付物

每个主题推荐生成以下文件（至少包含 globals.css 或 designToken.json 其中之一）：

```
src/themes/<theme-key>/
├── globals.css         # Tailwind CSS 定义（可选，优先使用）
├── designToken.json    # 主题 Token（可选，兼容传统模式）
└── index.tsx           # 主题演示页（必需）
```

约束：
- `<theme-key>` 使用 `kebab-case`（如 `antd`、`my-brand`、`trae-dark`）
- **灵活交付**：`globals.css` 和 `designToken.json` 至少存在一个。可以两者都存在（推荐），也可以只存在其一。
- **优先支持 Tailwind CSS**：如果用户提供 CSS 或 Tailwind 配置，必须生成 `globals.css`。
- 如果两者都存在，`designToken.json` 的值应尽量引用 `globals.css` 中的变量。
- **禁止干扰性依赖**：主题演示页不得引入与该主题/设计系统无关的 UI 库，以免影响视觉表达。默认只使用原生 HTML + CSS Variables（或该设计系统指定的组件库）。

## 1) `globals.css` 规范 (Tailwind CSS)

这是主题的核心定义文件（若生成）。

### 1.1 格式要求
- 使用 CSS Variables 定义主题变量（`:root` 和 `.dark`）。
- 支持 Tailwind CSS v4 语法（如 `@theme inline`）。
- 必须包含基础配色、圆角、字体等定义。

示例结构：
```css
@import "tailwindcss";

/* 自定义变体 */
@custom-variant dark (&:is(.dark *));

:root {
  /* 基础色变量 */
  --background: #ffffff;
  --foreground: #000000;
  --primary: #3b82f6;
  /* ... */
}

.dark {
  /* 深色模式变量 */
  --background: #000000;
  --foreground: #ffffff;
  /* ... */
}

@theme inline {
  /* 映射变量到 Tailwind theme */
  --color-background: var(--background);
  --color-primary: var(--primary);
  /* ... */
}
```

## 2) `designToken.json` 规范

### 2.1 必须字段

- `name`：主题名称（必需，字符串，用于 UI 展示与演示页标题）

推荐字段：
- `description`：主题描述（字符串）
- `token`：Ant Design 风格的 Token 对象（如果存在 `globals.css`，推荐引用变量如 `var(--primary)`）

### 2.2 作用
- 为 JS 环境提供 Token 配置。
- 为不支持 CSS 变量的组件提供配置。

## 3) `index.tsx`（主题演示页）规范

主题演示页的目标：在 Axhub Make 环境中直观看到主题 token 的内容与效果。

### 3.1 基本约束

- 文件必须 `export default Component`
- **按需引入**：
    - 如果有 `globals.css`，必须 `import './globals.css';`
    - 如果有 `designToken.json`，导入并使用它。
- 演示页应展示主题效果。
- 默认只使用原生 HTML 元素（div/button/input 等）与 CSS Variables 展示效果。

### 3.2 注入方式

- 若有 `designToken.json`，通过 `ConfigProvider` 注入。
- 若只有 `globals.css`，使用 CSS 变量展示。
- 若两者都有，结合使用（CSS 变量优先）。

## 4) 输入来源与生成策略

用户输入可能包含：
- Tailwind CSS 文件或配置（**最高优先级**）
- CSS 变量定义
- JSON Token
- 设计规范文档或截图

生成策略（灵活选择）：

1.  **用户提供 CSS/Tailwind**：
    - 必须生成 `globals.css`。
    - 可选生成 `designToken.json`（引用 CSS 变量）。

2.  **用户提供 JSON Token**：
    - 必须生成 `designToken.json`。
    - 可选生成 `globals.css`（将 JSON 转为 CSS 变量）。

3.  **两者都提供/截图提取**：
    - 推荐同时生成 `globals.css` 和 `designToken.json`。
    - 保持两者数据一致（以 CSS 为主）。

## 5) 开发后验收流程

### 5.1 运行验收脚本

```bash
node scripts/check-app-ready.mjs /themes/[主题名]
```

### 5.2 根据状态处理

- **状态为 ERROR**：根据错误信息修复。
- **状态为 READY**：访问预览 URL，检查主题展示效果（颜色、字体、深色模式切换等）。
