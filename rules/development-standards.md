# 开发规范

**⚠️ 重要：AI Agent 必须完整阅读本文档后再开始开发工作**

**开发流程**：理解需求 → 阅读参考资料 → 编写代码 → 运行验收脚本 → 根据状态修复或调试

本文档定义 Axhub 元素和页面原型的代码编写规范。

## 📁 项目结构

```
src/
├── elements/button/
│   ├── index.tsx  # 入口文件（必需）
│   ├── spec.md    # 需求规格（必需）
│   ├── style.css  # 样式文件（可选）
│   └── hack.css   # 样式覆盖（可选，AI 不应修改）
└── pages/sample-page/
    ├── index.tsx
    ├── spec.md
    ├── style.css
    └── hack.css
```

**约束**：入口必须是 `index.tsx`，必须包含 `spec.md`，复杂项目可按模块拆分

## 🎯 核心要求

### 1. 文件头部注释

每个 `index.tsx` 文件顶部必须包含：

```typescript
/**
 * @name 元素显示名称
 * 
 * 参考资料：
 * - /assets/docs/设计规范.UIGuidelines.md
 * - /src/themes/antd/designToken.json (Ant Design 主题)
 * - /assets/libraries/antd.md (Ant Design 库)
 */
```

- `@name`：组件的中文显示名称（必需）
- `参考资料`：列出与开发相关的文档路径（设计规范、主题配置、前端库文档等），纯视觉设计资料可省略

### 2. 依赖引用

```typescript
// ✅ 直接导入 React 和 Hooks
import React, { useState, useCallback } from 'react';

// ✅ 按需导入第三方库
import { Select, Button } from 'antd';
```

使用第三方库时需协助用户安装依赖，优先使用按需导入

### 3. 外部资源使用规范

#### 前端库

当用户指定使用特定前端库时（如 Ant Design、shadcn/ui），这是建议而非强制。

**⚠️ 重要**：
- **必须完整阅读对应的库文档**（通常在 `/assets/libraries/` 目录）
- 严格按照文档中的版本和 API 进行开发
- 如果本地没有文档，使用 DeepWiki MCP 或 Context7 MCP 获取官方文档

**灵活性**：如果其他库更适合实现需求，可以使用其他库，但需说明理由

#### Design Tokens

当用户指定主题时，必须使用对应的 Design Tokens（通常在 `/src/themes/[主题名]/designToken.json`）。

**⚠️ 重要**：
- **必须完整阅读 Design Tokens 文件**
- 使用文件中定义的颜色、圆角、字体、阴影、间距等值
- 保持设计一致性

示例：
```typescript
const primaryColor = '#1677ff'; // 来自 colors.brand.primary
const borderRadius = '6px';     // 来自 borderRadius.default
```

#### Axure API（可选但重要）

**⚠️ 如果用户要求使用 Axure API，必须完整阅读 `axure-api-guide.md`，严格按照指南实现。**

Axure API 提供了与 Axure 原型工具的集成能力，包括 Props 处理、事件处理、Container 使用等。详见后续章节和独立文档。

## 📋 代码结构规范

### 使用 Tailwind CSS

```typescript
/**
 * @name 组件显示名称
 * 
 * 参考资料：
 * - /assets/libraries/tailwind-css.md
 */

import './style.css';
import React, { useState } from 'react';

const Component = function MyComponent() {
  return (
    <div className="p-6 bg-white rounded-xl shadow-md">
      Component Content
    </div>
  );
};

export default Component;
```

**style.css**：
```css
@import "tailwindcss";
```

### 使用传统 CSS

```typescript
import './style.css';
import React from 'react';

const Component = function MyComponent() {
  return (
    <div className="my-component-container">
      Component Content
    </div>
  );
};

export default Component;
```

### State 管理

```typescript
// 避免使用 ES6 解构
const countState = useState<number>(0);
const count = countState[0];
const setCount = countState[1];

// 更新 state
setCount(function (prev) { return prev + 1; });
```

### Axure API 代码结构

**⚠️ 如果使用 Axure API，必须阅读 `axure-api-guide.md` 了解**：
- Props 处理和类型标注
- 事件处理规范
- Container 使用方法
- forwardRef 和 useImperativeHandle 的使用

## 🎨 样式规范

### Tailwind CSS V4（推荐）

如果用户没有指定技术栈，优先使用 Tailwind CSS V4。

1. 在 `style.css` 中导入：
```css
@import "tailwindcss";
```

2. 在组件中导入 CSS 并使用类名：
```typescript
import './style.css';

<div className="p-6 bg-white rounded-xl shadow-md">
```

### 传统 CSS

使用 BEM 命名，加组件前缀避免冲突：

```css
.axhub-button-container { }
.axhub-button-primary { }
```

### hack.css

`hack.css` 是用户手动调整样式的文件，AI Agent 不应主动修改。

## 📦 导出规范

所有组件文件必须使用 `export default Component` 导出：

```typescript
const Component = function MyComponent() {
  return <div>Component Content</div>;
}

export default Component;
```

- 必须使用变量名 `Component`（大小写敏感）
- 必须使用 `export default` 语法
- 这是 Axhub 第三方平台集成的必要条件

## ✅ 代码检查清单

**文件头部**
- [ ] 包含 `@name` 注释
- [ ] 列出与开发相关的参考资料路径

**依赖导入**
- [ ] 直接从 `react` 导入所需的 Hooks
- [ ] 第三方库已安装依赖并按需导入

**外部资源**
- [ ] 如使用前端库，已完整阅读库文档
- [ ] 如使用主题，已完整阅读 Design Tokens 文件
- [ ] 如使用 Axure API，已完整阅读 axure-api-guide.md

**组件实现**
- [ ] 使用 `useCallback` 优化回调
- [ ] 避免使用 ES6 解构（State 管理）

**样式**
- [ ] Tailwind CSS：在 style.css 中添加 `@import "tailwindcss"`
- [ ] 传统 CSS：遵循 BEM 命名并加组件前缀

**导出**
- [ ] 使用 `export default Component`

**Axure API（如使用）**
- [ ] 已完整阅读 axure-api-guide.md
- [ ] 使用 `forwardRef<AxhubHandle, AxhubProps>` 和类型标注
- [ ] 所有列表完整且有清晰描述

## 🔧 开发后验收流程

### 1. 运行验收脚本

```bash
node scripts/check-app-ready.mjs /elements/[元素名]
# 或
node scripts/check-app-ready.mjs /pages/[页面名]
```

脚本返回 JSON 格式结果，包含 `status`、`url`、`homeUrl`、`errors` 等字段。

### 2. 根据状态处理

**状态为 ERROR**：根据 `errors` 字段中的错误信息直接修复代码，修复后重新运行验收脚本。

**状态为 READY**：使用 Chrome DevTools MCP（或 Playwright MCP）访问 `url` 进行功能验收，检查控制台是否有错误。如有错误或功能不符合预期，**此时才需要阅读 `debugging-guide.md` 进行自动化调试和修复**

## 📚 参考资源
- **axure-api-guide.md** - Axure API 使用指南（如需使用 Axure API 必读）
- **debugging-guide.md** - 调试方法（开发验收失败或用户反馈 bug 时使用）