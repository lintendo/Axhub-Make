# V0 项目转换助手规范

本文档定义了如何将 V0 生成的 Next.js 项目转换到 Axhub Make 原型系统的工作流程。

## 🎯 核心目标

将 V0 生成的项目快速转换为 Axhub 页面组件，保持视觉效果和功能，符合 Axhub 开发规范。

## 📋 V0 项目特征

### 典型目录结构
```
v0-project/
├── app/
│   ├── page.tsx            # 页面文件
│   ├── layout.tsx          # 布局文件（需处理）
│   └── globals.css         # 全局样式
├── components/
│   ├── ui/                 # shadcn/ui 组件
│   └── [custom]/           # 自定义组件（可能多层嵌套）
├── hooks/                  # 自定义 hooks（可选）
├── lib/
│   └── utils.ts            # 工具函数（cn 等）
└── public/                 # 静态资源
```

### 技术栈
- **框架**: Next.js（⚠️ 需要完全移除）
- **样式**: Tailwind CSS V4
- **组件**: shadcn/ui（基于 Radix UI）
- **依赖**: class-variance-authority, clsx, tailwind-merge 等

## 🔄 转换工作流程

### 步骤 1：分析项目结构

系统会提供已解压的 V0 项目目录（位于 `temp/[目录名]`），快速扫描识别：
- 页面文件：`app/**/page.tsx`
- 布局文件：`app/layout.tsx`（需提取信息）
- 组件文件：`components/**/*.tsx`（可能多层嵌套）
- Hooks 文件：`hooks/**/*.ts`（如果存在）
- 样式文件：`app/globals.css`
- 静态资源：`public/**`
- 依赖列表：`package.json`

### 步骤 2：转换为 Axhub 规范

#### 3.1 转换页面组件

**V0 原始代码**：
```typescript
// app/page.tsx
export default function HomePage() {
  return <div className="container">Content</div>
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
import React, { forwardRef, useImperativeHandle } from 'react';
import type { AxhubProps, AxhubHandle } from '../../common/axhub-types';

const Component = forwardRef<AxhubHandle, AxhubProps>(function PageName(innerProps, ref) {
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

  return <div className="container">Content</div>;
});

export default Component;
```

**关键转换点**：
1. 添加文件头部注释（`@name` 和参考资料）
2. 使用 `forwardRef<AxhubHandle, AxhubProps>` 包装
3. 实现 `useImperativeHandle` 暴露 Axhub API
4. 使用 `export default Component`
5. 保持原有的 JSX 和 Tailwind 类名不变

#### 3.2 处理组件依赖

**策略**：将 V0 的组件文件复制到页面目录下

```
V0: temp/[目录名]/components/hero-section.tsx
→ Axhub: src/pages/[页面名]/components/hero-section.tsx
```

**shadcn/ui 组件**：保持原样，确保依赖已安装

**hooks 目录**：如果存在，同样复制到页面目录
```
V0: temp/[目录名]/hooks/use-mobile.ts
→ Axhub: src/pages/[页面名]/hooks/use-mobile.ts
```

#### 3.3 处理样式

将 `app/globals.css` 重命名为 `style.css`，保持内容不变：

```css
@import "tailwindcss";

/* V4 可能包含这些特性，保持原样 */
@import "tw-animate-css";        /* 动画库（如果有） */
@custom-variant dark (...);      /* 自定义变体 */
@theme inline { ... }            /* 主题配置 */

/* CSS 变量和自定义样式保持不变 */
:root { --background: ...; }
@layer base { ... }
```

**注意**：Tailwind V4 使用 `@import "tailwindcss"` 而非 V3 的 `@tailwind` 指令。

#### 3.4 处理静态资源

```
V0: temp/[目录名]/public/images/hero.jpg
→ Axhub: assets/images/[页面名]/hero.jpg
```

更新代码中的路径引用。

#### 3.5 移除 Next.js 特定代码

**必须移除或替换**：
```typescript
// ❌ 移除
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
'use client'

// ✅ 替换为
// useRouter → 移除或使用其他方案
// Image → <img>
// Link → <a>
// Metadata, Analytics → 删除
// 'use client' → 删除这行
```

**处理 layout.tsx**：
- 提取有用信息（如 body className）应用到主组件
- 删除 `layout.tsx` 文件
- 确保 `globals.css` 在主组件中导入

**处理路径别名**：
- V0 使用 `@/` 别名（如 `@/components/...`）
- 保持别名不变（确保 tsconfig.json 配置正确）
- 或替换为相对路径（如 `./components/...`）

### 步骤 3：安装依赖

分析 `package.json`，安装需要的依赖（排除 Next.js 相关）：

```bash
cd apps/axhub-make

# 自动识别并安装依赖
# 核心：class-variance-authority, clsx, tailwind-merge, tailwindcss-animate
# Radix UI：根据代码中的 import 自动识别
# 其他：lucide-react, recharts, date-fns, sonner, vaul 等按需安装

pnpm add [识别到的依赖列表]
```

**排除规则**：
- `next` 及所有 `next-*` 包（包括 `next-themes`）
- `@vercel/*` 包
- 与 Axhub 已有依赖冲突的包

**常见依赖**：
- 动画：`tw-animate-css`（如果 globals.css 中有导入）
- 图表：`recharts`（如果使用图表组件）
- 表单：`react-hook-form`, `@hookform/resolvers`, `zod`
- UI 增强：`sonner`, `vaul`, `cmdk`, `embla-carousel-react`

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
- 路径错误 → 调整 import 路径或检查 tsconfig.json 的 paths 配置
- Next.js API 残留 → 移除或替换（特别注意 `"use client"`, `Metadata`, `@vercel/analytics`）
- 样式问题 → 检查 style.css 是否完整复制，CSS 变量是否齐全
- 动画缺失 → 检查是否需要安装 `tw-animate-css`

### 步骤 5：完成或重试

- **成功**：页面正常运行，功能和样式符合预期
- **失败**：如果多次调试仍无法解决，告知用户当前遇到的问题，建议重试或手动调整

## 📝 转换检查清单

### 文件结构
- [ ] 页面文件在 `src/pages/[页面名]/index.tsx`
- [ ] `globals.css` 已重命名为 `style.css`
- [ ] 组件文件已复制到 `components/` 子目录（保持嵌套结构）
- [ ] hooks 目录已复制（如果存在）
- [ ] 静态资源已复制到 `assets/images/[页面名]/`
- [ ] `layout.tsx` 已删除

### 代码规范
- [ ] 文件头部包含 `@name` 和参考资料
- [ ] 使用 `forwardRef<AxhubHandle, AxhubProps>`
- [ ] 实现 `useImperativeHandle`
- [ ] 使用 `export default Component`
- [ ] 移除所有 `"use client"` 指令
- [ ] 移除 Next.js 类型和组件（`Metadata`, `Analytics` 等）
- [ ] 路径别名 `@/` 正常工作或已替换为相对路径

### 样式和资源
- [ ] `style.css` 包含 `@import "tailwindcss"`
- [ ] Tailwind V4 语法保持不变（`@theme inline`, `@custom-variant` 等）
- [ ] CSS 变量定义完整
- [ ] 动画库导入保留（如 `tw-animate-css`）
- [ ] 静态资源路径已更新

### 依赖管理
- [ ] 必要的依赖已添加到 `package.json`
- [ ] Next.js 相关依赖已排除（包括 `next-themes`, `@vercel/analytics`）
- [ ] 运行 `pnpm install` 无错误

### 功能验证
- [ ] 验收脚本通过
- [ ] 页面渲染正常
- [ ] 交互功能正常
- [ ] 无控制台错误

## 💬 用户交互指南

### 初始对话

```
您好！我可以帮您将 V0 项目转换到 Axhub Make。

系统已提供 V0 项目目录（位于 temp/[目录名]）。

转换流程：
1. 分析项目结构
2. 转换为 Axhub 规范
3. 安装依赖
4. 调试验收

整个过程大约需要几分钟。
```

### 转换进度

```
正在转换...
✓ 已分析项目结构
⏳ 正在转换为 Axhub 规范...
✓ 已转换页面组件
✓ 已处理依赖
⏳ 正在运行验收脚本...
```

### 完成通知

```
✅ 转换完成！

页面位置：src/pages/[页面名]/
已安装依赖：[依赖列表]

验收结果：✓ 通过
页面访问：http://localhost:51720/#/pages/[页面名]

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

### Next.js 完全移除

Axhub 不使用 Next.js 框架，必须移除：
- 所有 `next` 相关依赖（包括 `next-themes`）
- `'use client'` 指令
- Next.js 特定的 API 和组件（`Metadata`, `Image`, `Link`, `useRouter` 等）
- 服务器组件和 API 路由
- `layout.tsx` 文件
- `@vercel/*` 相关包

### 路径别名

V0 项目使用 `@/` 别名，需确保 Axhub 的 tsconfig.json 支持，或替换为相对路径。

### 依赖处理

- 自动识别代码中的 import 语句
- 只安装实际使用的依赖
- 排除与 Axhub 冲突的依赖
- React 等核心依赖优先使用本项目已有版本

## 📚 参考资源

- **开发规范**：`development-standards.md`
- **调试指南**：`debugging-guide.md`
- **Tailwind CSS**：`/assets/libraries/tailwind-css.md`