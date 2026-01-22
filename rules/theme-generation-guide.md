# 主题生成规范（Design Tokens + Tailwind CSS + 演示页）

本文档约束"主题"的生成产物与实现方式，供 AI 在用户提供任意形式输入（token、设计规范文档、截图、样式提取结果等）时，稳定产出可用的主题文件与演示页面。

## 🎯 交付物

每个主题推荐生成以下文件（根据信息完整度灵活调整）：

```
src/themes/<theme-key>/
├── globals.css             # Tailwind CSS 定义（可选，优先使用）
├── designToken.json        # 主题 Token（可选，兼容传统模式）
├── DESIGN-SPEC.md          # 设计规范文档（可选，信息充分时推荐）
├── index.tsx               # 主题演示页（必需）
├── components/             # 演示组件 2-3 个（推荐）
│   ├── Button.tsx
│   ├── Card.tsx
│   └── Input.tsx
└── templates/              # 页面模板 2-3 个（推荐）
    ├── LoginTemplate.tsx
    └── DashboardTemplate.tsx
```

约束：
- `<theme-key>` 使用 `kebab-case`（如 `antd`、`my-brand`、`trae-dark`）
- **二选一原则**：`globals.css` 和 `designToken.json` **只生成一个**，避免维护负担。
- **优先 Tailwind CSS**：默认生成 `globals.css`（现代化、易维护）。
- **例外情况**：仅当使用场景明确不支持 Tailwind CSS 时，才生成 `designToken.json`。
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

### 2.2 何时生成

**仅在以下情况生成 `designToken.json`**：
- 使用场景明确不支持 Tailwind CSS（如纯 JS 环境、特定框架限制）
- 用户明确要求使用 JSON Token 格式
- 需要与不支持 CSS Variables 的组件库集成

**默认情况下优先生成 `globals.css`**，避免维护两套配置。

## 3) `DESIGN-SPEC.md` 规范（设计规范文档）

**可选但推荐**的产物，用于系统化记录主题的设计价值、使用约束和实现细节。

### 3.1 推荐结构

参考 `src/themes/firecrawl/DESIGN-SPEC.md`，包含：
- 设计系统价值（品牌定位、核心价值、设计原则）
- 能力边界（适合/不适合的场景）
- 色彩/字体/间距/圆角/阴影/图标系统
- 组件规范（Button、Card、Input 等样式规范）
- 使用约束（必须遵守、建议做法、禁止做法）

### 3.2 生成策略
- 信息充分时生成完整文档
- 信息不足时可省略或生成简化版本

## 4) `index.tsx`（主题演示页）规范

主题演示页的目标：在 Axhub Make 环境中直观看到主题 token 的内容与效果。

### 4.1 基本约束

- 文件必须 `export default Component`
- **按需引入**：
    - 如果有 `globals.css`，必须 `import './globals.css';`
    - 如果有 `designToken.json`，导入并使用它。
    - 如果有 `DESIGN-SPEC.md`，在演示页中提供查看入口。
- 演示页应展示主题效果。
- 默认只使用原生 HTML 元素（div/button/input 等）与 CSS Variables 展示效果。

### 4.2 演示内容优先级

1. **优先自定义演示**：根据当前主题的设计规范，从零创建符合该主题风格的演示页面、组件和模板
2. **避免照搬已有主题**：不要直接参考或复制其他主题的演示页面，因为它们是按各自设计规范定制的

### 4.3 注入方式

- 若有 `globals.css`：使用 CSS 变量展示（推荐）。
- 若有 `designToken.json`：通过 `ConfigProvider` 注入。
- **不会同时存在两者**（避免维护负担）。

## 5) `components/` 规范（演示组件）

推荐生成 **2-3 个核心组件**（如 Button、Card、Input），展示主题在具体 UI 组件上的应用效果。

### 5.1 组件结构

```tsx
import React from 'react';

interface ComponentSectionProps {
  tokens: Record<string, any>;
}

export const ButtonSection: React.FC<ComponentSectionProps> = ({ tokens }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold mb-2">按钮 Button</h1>
        <p className="text-neutral-600">按钮用于开始一个即时操作。</p>
      </div>
      <div className="canvas-panel p-8">
        {/* 展示多种变体、尺寸、状态 */}
      </div>
    </div>
  );
};
```

### 5.2 演示内容
- 多种变体（primary、secondary、ghost 等）
- 多种尺寸（large、default、small）
- 多种状态（normal、hover、disabled、loading）

## 6) `templates/` 规范（页面模板）

推荐生成 **2-3 个典型页面**（如登录页、仪表盘、表单页），展示主题在完整页面场景中的应用效果。

### 6.1 推荐模板类型

| 模板类型 | 适用场景 | 展示重点 |
|---------|---------|---------|
| 登录页 | 通用 | 表单、按钮、品牌展示 |
| 仪表盘 | 数据密集型产品 | 卡片、图表、数据展示 |
| 表单页 | 业务系统 | 表单组件、布局、验证 |
| 列表页 | 内容管理 | 表格、筛选、分页 |

### 6.2 模板要求
- 展示完整的页面布局和交互流程
- 使用真实/模拟数据
- 严格遵循主题的设计规范

## 7) 输入来源与生成策略

用户输入可能包含：
- Tailwind CSS 文件或配置（**最高优先级**）
- CSS 变量定义
- JSON Token
- 设计规范文档或截图

生成策略（灵活选择）：

1.  **用户提供 CSS/Tailwind**：
    - 必须生成 `globals.css`。
    - **不生成** `designToken.json`（除非明确不支持 TW）。
    - 推荐生成 `DESIGN-SPEC.md` + 组件 + 模板。

2.  **用户提供 JSON Token**：
    - 必须生成 `designToken.json`。
    - **不生成** `globals.css`（除非用户要求迁移到 TW）。
    - 推荐生成 `DESIGN-SPEC.md` + 组件 + 模板。

3.  **用户提供设计规范文档**：
    - 必须生成 `DESIGN-SPEC.md`。
    - **优先生成 `globals.css`**（现代化方案）。
    - 生成符合规范的组件和模板。

4.  **截图提取/无明确格式**：
    - **默认生成 `globals.css`**（推荐）。
    - 尽量生成 `DESIGN-SPEC.md` + 组件 + 模板。

## 8) 开发后验收流程

### 8.1 运行验收脚本

```bash
node scripts/check-app-ready.mjs /themes/[主题名]
```

### 8.2 根据状态处理

- **状态为 ERROR**：根据错误信息修复。
- **状态为 READY**：访问预览 URL，检查主题展示效果（颜色、字体、深色模式切换等）。
