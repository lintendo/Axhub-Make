# AI Studio 项目转换助手规范

本文档定义了如何将 Google AI Studio 生成的 React 项目转换到 Axhub Make 原型系统的工作流程。

## 🎯 核心目标

将 AI Studio 生成的零配置 React 应用快速转换为 Axhub 页面组件，保持视觉效果和功能，符合 Axhub 开发规范。

## 📋 AI Studio 项目特征

### 典型目录结构
```
ai-studio-project/
├── assets/                 # 静态资源（可选）
├── components/             # UI 组件
├── App.tsx                 # 主应用组件
├── index.tsx               # React 挂载入口
├── index.html              # HTML 模板（Import Map + Tailwind CDN）
├── constants.ts            # 常量定义（可选）
├── types.ts                # 类型定义（可选）
├── vite.config.ts          # Vite 配置（可选）
└── metadata.json           # 项目元数据（可选）
```

### 技术栈
- **框架**: React 19（Function Components + Hooks）
- **语言**: TypeScript
- **模块**: Native ESM（Import Map，通常是 esm.sh CDN）
- **样式**: Tailwind CSS（CDN Runtime Mode）
- **图标**: Lucide React
- **配置**: Vite（如果有 vite.config.ts）

### 关键文件特征

**index.html**：
```html
<script src="https://cdn.tailwindcss.com"></script>
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@19",
    "lucide-react": "https://esm.sh/lucide-react"
  }
}
</script>
<style>/* 可能包含自定义样式 */</style>
<link href="https://fonts.googleapis.com/...">  <!-- 可能包含外部字体 -->
```

## 🔄 转换工作流程

### 步骤 1：分析项目结构

系统会提供已解压的 AI Studio 项目目录（位于 `temp/[目录名]`），快速扫描识别：
- 主应用：`App.tsx`
- 入口文件：`index.tsx`（需移除）
- HTML 模板：`index.html`（提取依赖和样式信息）
- 组件文件：`components/**/*.tsx`
- 配置文件：`vite.config.ts`（提取路径别名）
- 常量/类型：`constants.ts`, `types.ts`（如果存在）
- 静态资源：`assets/**`

### 步骤 2：转换为 Axhub 规范

#### 2.1 转换主应用组件

**AI Studio 原始代码**：
```typescript
// App.tsx
import { useState } from 'react';
import Header from './components/Header';

export default function App() {
  const [count, setCount] = useState(0);
  return <div><Header /></div>;
}
```

**转换为 Axhub 规范**：
```typescript
/**
 * @name 页面名称
 * 
 * 参考资料：
 * - /rules/development-standards.md
 * - /assets/libraries/tailwind-css.md
 */

import './style.css';
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import type { AxhubProps, AxhubHandle } from '../../common/axhub-types';
import Header from './components/Header';

const Component = forwardRef<AxhubHandle, AxhubProps>(function PageName(innerProps, ref) {
  const [count, setCount] = useState(0);
  
  useImperativeHandle(ref, function () {
    return {
      getVar: function () { return undefined; },
      fireAction: function () {},
      eventList: [],
      actionList: [],
      varList: [],
      configList: [],
      dataList: []
    };
  }, []);

  return <div><Header /></div>;
});

export default Component;
```

**关键转换点**：
1. 添加文件头部注释（`@name` 和参考资料）
2. 使用 `forwardRef<AxhubHandle, AxhubProps>` 包装
3. 实现 `useImperativeHandle` 暴露 Axhub API
4. 使用 `export default Component`
5. 保持原有的 JSX、Hooks 和 Tailwind 类名不变

#### 2.2 处理组件和文件

**组件文件**：直接复制，保持原样
```
AI Studio: temp/[目录名]/components/Header.tsx
→ Axhub: src/pages/[页面名]/components/Header.tsx
```

**常量和类型**：直接复制（如果存在）
```
constants.ts → src/pages/[页面名]/constants.ts
types.ts → src/pages/[页面名]/types.ts
```

**路径别名**：检查 `vite.config.ts` 中的 alias 配置
- 如果使用 `@/` 别名，确保 Axhub 的 tsconfig.json 支持
- 或替换为相对路径

#### 2.3 处理样式

从 `index.html` 提取样式信息，创建 `style.css`：

```css
@import "tailwindcss";

/* 提取 <style> 标签中的自定义样式 */
/* 例如：自定义动画、字体、选择器样式等 */

/* 如果有外部字体，添加 @import */
@import url('https://fonts.googleapis.com/css2?family=...');
```

#### 2.4 处理静态资源

```
AI Studio: temp/[目录名]/assets/logo.png
→ Axhub: assets/images/[页面名]/logo.png
```

更新代码中的路径引用。

#### 2.5 移除 AI Studio 特定文件

**必须移除**：
- `index.html`（提取信息后删除）
- `index.tsx`（Axhub 有自己的入口）
- `metadata.json`（可选保留作为参考）

### 步骤 3：安装依赖

从 `index.html` 的 Import Map 和 `package.json` 提取依赖：

```bash
cd apps/axhub-make

# 常见依赖：lucide-react, framer-motion 等
# 排除：react, react-dom（Axhub 已有）
pnpm add [识别到的依赖列表]
```

**CDN 到 npm 包映射**：
- `https://esm.sh/lucide-react` → `lucide-react`
- `https://esm.sh/framer-motion` → `framer-motion`
- `https://esm.sh/@google/genai` → `@google/generative-ai`

**环境变量处理**：
- 如果代码使用 `process.env.*`，改为 `import.meta.env.VITE_*`
- 检查 `vite.config.ts` 中的环境变量定义
- 告知用户需要配置的环境变量

### 步骤 4：调试验收

按照 `development-standards.md` 中的验收流程：

```bash
# 运行验收脚本
node scripts/check-app-ready.mjs /pages/[页面名]
```

**根据结果处理**：

1. **状态为 ERROR**：根据错误信息修复代码，重新运行验收
2. **状态为 READY**：使用浏览器访问页面，检查功能和样式
3. **有问题**：参考 `debugging-guide.md` 进行调试

**常见问题修复**：
- 依赖缺失 → 安装对应依赖
- 路径错误 → 调整 import 路径或检查路径别名配置
- 环境变量未定义 → 配置 `.env.local`
- Tailwind 样式不生效 → 检查 style.css 是否完整提取
- 自定义样式缺失 → 检查 index.html 的 `<style>` 标签是否已提取

### 步骤 5：完成或重试

- **成功**：页面正常运行，功能和样式符合预期
- **失败**：如果多次调试仍无法解决，告知用户当前遇到的问题，建议重试或手动调整

## 📝 转换检查清单

### 文件结构
- [ ] 页面文件在 `src/pages/[页面名]/index.tsx`
- [ ] `style.css` 已创建并包含自定义样式
- [ ] 组件文件已复制到 `components/` 子目录
- [ ] constants.ts, types.ts 已复制（如果存在）
- [ ] 静态资源已复制到 `assets/images/[页面名]/`
- [ ] `index.html` 和 `index.tsx` 已删除

### 代码规范
- [ ] 文件头部包含 `@name` 和参考资料
- [ ] 使用 `forwardRef<AxhubHandle, AxhubProps>`
- [ ] 实现 `useImperativeHandle`
- [ ] 使用 `export default Component`
- [ ] 路径别名正常工作或已替换为相对路径

### 样式和资源
- [ ] `style.css` 包含 `@import "tailwindcss"`
- [ ] index.html 中的自定义样式已提取
- [ ] 外部字体已处理（@import 或 link）
- [ ] 静态资源路径已更新

### 依赖管理
- [ ] Import Map 中的依赖已转换为 npm 包
- [ ] React 相关依赖已排除
- [ ] 运行 `pnpm install` 无错误
- [ ] 环境变量已更新为 `import.meta.env.VITE_*` 格式

### 功能验证
- [ ] 验收脚本通过
- [ ] 页面渲染正常
- [ ] 交互功能正常
- [ ] 无控制台错误

## 💬 用户交互指南

### 初始对话

```
您好！我可以帮您将 AI Studio 项目转换到 Axhub Make。

系统已提供 AI Studio 项目目录（位于 temp/[目录名]）。

转换流程：
1. 分析项目结构和依赖
2. 转换为 Axhub 规范
3. 安装依赖
4. 调试验收

整个过程大约需要几分钟。
```

### 转换进度

```
正在转换...
✓ 已分析项目结构（发现 X 个组件）
✓ 已提取依赖信息（发现 Y 个依赖）
⏳ 正在转换为 Axhub 规范...
✓ 已转换主应用组件
✓ 已处理样式和资源
✓ 已安装依赖
⏳ 正在运行验收脚本...
```

### 完成通知

```
✅ 转换完成！

页面位置：src/pages/[页面名]/
已安装依赖：[依赖列表]

验收结果：✓ 通过
页面访问：http://localhost:5173/#/pages/[页面名]

[如果有环境变量]
⚠️ 注意：此页面需要配置环境变量
请在 .env.local 中添加：
- VITE_GEMINI_API_KEY=your_api_key_here

请在浏览器中查看效果，有问题随时告诉我。
```

### 遇到问题

```
⚠️ 转换过程中遇到问题：

[具体错误信息]

建议：
1. [针对性的修复建议]
2. 或者我们可以重试转换
3. 或者您可以提供更多信息帮助我定位问题

需要我重试吗？
```

## ⚠️ 注意事项

### AI Studio 特定处理

- `index.html` 和 `index.tsx` 不需要保留，但要提取其中的依赖和样式信息
- Import Map 中的 CDN 依赖需要转换为 npm 包
- `<style>` 标签中的自定义样式需要提取到 `style.css`
- 外部字体需要在 `style.css` 中使用 `@import` 引入

### 环境变量

AI Studio 可能使用 `process.env.*`，需要转换为 `import.meta.env.VITE_*`：
- 检查 `vite.config.ts` 中的 `define` 配置
- 告知用户需要配置的环境变量
- 提供 `.env.local` 示例

### Tailwind CSS

AI Studio 使用 Tailwind CDN（Runtime Mode），Axhub 使用本地 Tailwind：
- 确保 `style.css` 包含 `@import "tailwindcss"`
- 提取 index.html 中的自定义 Tailwind 配置（如果有）
- 保持所有 Tailwind 类名不变

### 路径别名

检查 `vite.config.ts` 中的 alias 配置（如 `@/`），确保 Axhub 支持或替换为相对路径。

## 📚 参考资源

- **开发规范**：`development-standards.md`
- **调试指南**：`debugging-guide.md`
- **Tailwind CSS**：`/assets/libraries/tailwind-css.md`
