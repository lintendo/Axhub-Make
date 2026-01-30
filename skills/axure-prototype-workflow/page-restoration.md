# Axure 页面还原

用于基于 Axure 原型截图的页面视觉还原。

**核心方法**：看图 → 写代码 → 交付。

## 默认目标

- **1:1 像素级还原**：完全还原截图的视觉与布局
- **独立实现**：不参考本项目已有主题和生成流程，本指南是一个独立的页面还原流程，不需要读取和遵循 `rules/development-standards.md` 以外的项目文档

## 核心流程

1. **确认前置条件**
   - 确认模型支持视觉识别（不支持则立即告知用户）
   - 确认可以直接读取图片内容（不需要转换，不支持则立即告知用户）
   - 生成页面名称（规范：小写字母、数字、连字符）

2. **获取截图**
  - 先确认当前模型支持视觉识别；不支持时立即告知用户，并询问是否改为仅基于文本+主题还原。
  - 使用 `get_axure_screenshot` 下载截图到本项目：
    - `downloadDirectory`：指向 `temp/axure-screenshots/` 的绝对路径（不存在时先创建）
    - `projectUrl`：**必须先调用 `get-axure-sitemap` 获取项目地图，使用返回的 `projectUrl`**
    - `pageUrl`：页面路径（如 `首页.html`）
    - `filename`：可选，指定保存的文件名
  - 若下载失败，尝试前环境内可用的其他截图工具；若仍失败，必须告知用户并让其决定是否继续。

3. **验证图片读取能力**
   - 尝试读取已下载的截图文件
   - **如果无法直接读取本地图片**（工具不支持或返回错误），必须：
     - 立即停止流程
     - 告知用户："无法读取本地图片，请将 `[图片绝对路径]` 复制到对话框后提交"
     - 等待用户提交图片后再继续
   - 禁止假设或猜测图片内容
   - 禁止通过 Base64 编码读取图片内容

4. **生成页面代码**

   **辅助数据获取**（可选，生成仍以图片为主）：
   - 主题：`get_page_theme`（校验样式）
     - 仅用于交叉校验，和截图识别结果不一致时，以截图为准
     - 多页面合并：优先 3-5 个核心页面，按页面权重合并统计
     - 噪声过滤：排除图片/图标/装饰性元素，弱化低频与异常值
     - 量化归一：颜色按相近色合并，间距/圆角按常见网格值聚类
     - 置信度阈值：低于阈值的 token 不进入最终主题
   - 文本：`get_axure_text`（校验文案）
   - 交互：`get_axure_interactions`（补充交互）
   **约束**：资源获取禁止批量/并发，必须等一个完成后再获取下一个

   - 直接基于截图生成页面代码
   - 在代码生成过程中内部完成：
     - 识别布局结构（Header/Sidebar/Content 等）
     - 识别组件（Button/Input/Table/Card 等）
     - 提取样式（颜色、字体、间距、圆角、阴影等）
     - 识别交互（点击、悬停、状态切换等）

   **输出文件**：
   - `src/pages/<page-name>/index.tsx`
   - `src/pages/<page-name>/style.css`（必须包含 `@import "tailwindcss";`）
   - `src/pages/<page-name>/components/`（根据需要）

   **核心代码规范**（必须遵守）：
   ```typescript
   // index.tsx 结构
   /**
    * @name 页面显示名称
    */
   import './style.css';
   import React from 'react';

   const Component = function PageName() {
     return <div>...</div>;
   };

   export default Component;
   ```
   ```css
   /* style.css 必须以此开头 */
   @import "tailwindcss";
   ```
   - 变量名必须是 `Component`，使用 `export default Component`
   - 详细规范见 `rules/development-standards.md`

5. **验收页面还原**
   - 运行验收命令：`node scripts/check-app-ready.mjs /pages/[页面名]`
   - 提供预览 URL
   - 确认页面基础功能正常（无编译错误、可正常访问）

6. **生成规格文档**
   - 基于已验收通过的页面代码生成规格文档
   - 输出文件：`src/pages/<page-name>/spec.md`
   - 文档内容应包括：
     - 页面结构说明
     - 组件清单
     - 样式规范（颜色、字体、间距等）
     - 交互说明
     - 数据需求（如有）

7. **最终交付**
   - 告知用户页面还原和规格文档已完成
   - 说明可进行二次生成（修复问题或优化重构）

## 代码规范
- 优先使用 Tailwind CSS V4 还原
- 遵循 `rules/development-standards.md`
- 样式独立实现，不依赖系统主题

---
