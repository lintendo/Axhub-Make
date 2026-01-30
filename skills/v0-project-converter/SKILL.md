---
name: v0-project-converter
description: 将 V0 生成的 Next.js 项目转换为本项目页面组件的流程规范；在执行 V0 项目转换、依赖清理、路径别名替换、样式迁移与验收时使用。
---

# V0 项目转换规范

将 V0 生成的 Next.js 项目快速转换为本项目页面组件，保持视觉效果和功能，符合本项目开发规范。

## 核心目标

- 保持页面视觉一致性
- 移除 Next.js 特有实现
- 产出可在本项目中运行的页面组件

## 使用方式

### 步骤 1：运行预处理脚本

```bash
node scripts/v0-converter.mjs <v0-project-dir> [output-name]

# 示例
node scripts/v0-converter.mjs "temp/my-v0-project" my-page
```

**脚本会自动完成**：
- 完整复制 V0 项目到 `src/pages/[页面名]/`
- 分析项目结构（路径别名、Next.js 代码等）
- 生成 AI 工作文档（`.v0-tasks.md`）
- 生成详细数据（`.v0-analysis.json`）
- **不修改任何代码**（100% 安全）

### 步骤 2：按任务清单完成转换

脚本会生成 `.v0-tasks.md` 文件，包含：
- 项目概况统计
- 6 个具体任务清单
- 路径别名转换参考表
- 依赖安装命令
- 验收测试步骤

按任务清单与本规范示例执行转换。

## 转换要点

###本项目组件规范

所有页面组件必须遵循以下格式：

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
import type { AxureProps, AxureHandle } from '../../common/axure-types';

const Component = forwardRef<AxureHandle, AxureProps>(function PageName(innerProps, ref) {
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

  // 组件逻辑
  
  return (
    // JSX 内容
  );
});

export default Component;
```

### 移除 Next.js 特定代码

移除所有 Next.js 特定实现：

```typescript
// ❌ 需要移除
"use client"                                    // Next.js 客户端组件指令，本项目不需要
import { useRouter } from 'next/navigation'    // Next.js 路由
import Image from 'next/image'                 // Next.js 图片组件
import Link from 'next/link'                   // Next.js 链接组件
import type { Metadata } from 'next'           // Next.js 元数据类型
import { Analytics } from '@vercel/analytics/next'  // Vercel 分析

// ✅ 替换为
// 删除 "use client" 指令
// 删除 useRouter 相关代码
<img> 替代 <Image>
<a> 替代 <Link>
// 删除 Metadata 和 Analytics
```

**关于 "use client"**：
-本项目不使用 Next.js，所有组件都是客户端渲染
- 必须删除，否则会导致语法错误

### 路径别名转换

将 V0 的 `@/` 别名转换为相对路径：

```typescript
// V0 原始代码
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// 在 app/page.tsx 中转换为
import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"

// 在 components/ui/card.tsx 中转换为
import { cn } from "../../lib/utils"
```

脚本生成的分析报告会提供每个文件的具体转换参考。

### 样式文件

```css
/* style.css 必须以此开头 */
@import "tailwindcss";

/* 然后是原 globals.css 的内容 */
/* 保持 Tailwind V4 语法不变 */
@theme inline { ... }
@custom-variant dark (...);
```

### 依赖管理

排除 Next.js 相关依赖：
- `next` 及所有 `next-*` 包
- `@vercel/*` 包
- `react` 和 `react-dom`（本项目已有）

保留其他依赖：
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `@radix-ui/*` 组件
- `lucide-react`, `recharts`, `date-fns` 等

## 验收标准

转换完成后运行验收脚本：

```bash
node scripts/check-app-ready.mjs /pages/[页面名]
```

**验收要求**：
- 状态为 READY
- 页面能正常渲染
- 无控制台错误
- 交互功能正常
- 样式显示正确

## 常见问题

### 依赖缺失
```bash
# 根据报告中的依赖列表安装
pnpm add [依赖名称]
```

### 路径错误
- 检查 `@/` 是否已转换为相对路径
- 参考 `.v0-analysis.md` 中的转换表

### 样式问题
- 确认 `style.css` 包含 `@import "tailwindcss"`
- 检查 CSS 变量是否完整

### Next.js 残留
- 搜索 `"use client"`、`next/`、`@vercel/`
- 确保全部移除或替换

## 参考资源

- **开发规范**：`/rules/development-standards.md`
- **调试指南**：`/rules/debugging-guide.md`
- **Tailwind CSS**：`/assets/libraries/tailwind-css.md`
