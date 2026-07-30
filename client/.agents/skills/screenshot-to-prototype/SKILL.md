---
name: screenshot-to-prototype
description: Use only when 用户明确要求把本地截图、设计稿或高保真界面图还原成 Axhub Make client 可运行原型；或显式调用 $screenshot-to-prototype。仅提供图片作为素材、参考图、需求图或风格上下文时不要使用。
---

# Screenshot To Prototype

用本地截图还原可运行原型。先完成固定 viewport 下的 1:1 绝对定位视觉稿，再转换为 React；效果优先，评审信息集中在主规格，正文使用中文并保持简洁。

## 适用范围

- 只处理用户明确要求还原的本地截图或设计稿。普通图片素材、风格参考、URL 克隆和主题提取不触发本技能。
- 获取源图本地路径；聊天附件先落到本地。源图本身就是视觉依据，不再额外要求选择主题或创建设计规范。
- 需要生成、编辑或派生位图素材时，使用 `ui-image-generation`；工具选择、配置读取和回退规则全部遵循该技能。截图还原只补充本地源图、bbox、裁切、修复和素材分流约束。
- 所有素材提取、修复、高清化、设计分析都必须把用户本地图片路径作为参考图传入，不能只用文字描述生成素材。
- 截图优先使用 Axhub Preview MCP 的 `preview_capture`；只有内置截图不支持当前内容时才换用现有浏览器截图能力。

## 目录

- 主规格：`src/prototypes/<slug>/.spec/spec.html`
- 还原映射：`src/prototypes/<slug>/.spec/reconstruction/reconstruction-manifest.json`
- 规格样式：`src/prototypes/<slug>/.spec/reconstruction/tailwind.css`
- 成果截图：`src/prototypes/<slug>/.spec/reconstruction/visual-check/`
- 最终素材：`src/prototypes/<slug>/assets/`
- 临时数据：`.local/screenshot-to-prototype/<slug>/`
- 生成历史：实际二次生图时复用 `src/prototypes/<slug>/.spec/generation-artifacts.json`

源图摘要、候选清单、候选切图、审计报告和中间指标都放在 `.local/`。不创建额外的素材文档或独立视觉对比文档。

## 使用主规格

- 遵循 `rules/requirements-alignment-guide.md`。已有 `.spec/spec.html` 时直接扩展；没有时从通用 HTML 模板创建。不要修改通用规格模板。
- 按当前项目需要使用 `data-page-target` 和 `data-spec-page`。不规定固定页数或页面名称。
- 规格展示源图信息、绝对定位视觉稿、最终素材及用途，并把原图与真实运行截图左右并排，形成成果快速对比。
- 素材评审区逐项使用相同预览框左右展示候选与最终真实内容，透明素材使用棋盘格背景，并标注名称或 ID、用途/来源和输出尺寸。图片、SVG 和组件都必须实际渲染，不得只提供文字、文件名或路径。
- 视觉稿舞台等于源图 viewport，使用 `position: relative` 和 `overflow: hidden`；元素绝对定位并保留稳定的 `data-reconstruction-id`。
- 成果对比是普通规格内容，不建立逐元素或全局审批状态。用户有意见时按评论迭代。
- 用户要求先看视觉稿时停在规格阶段；用户明确要求完整原型时无需等待额外确认，更新成果对比后继续 React 实现。

## 工作步骤

1. 读取源图、现有规格、相关原型与素材。预处理结果写入本地临时目录：

```bash
node .agents/skills/screenshot-to-prototype/scripts/prepare-reconstruction-source.mjs \
  --input <source.png> \
  --output .local/screenshot-to-prototype/<slug>/source-summary.json
```

2. 由图片 AI 判断具体提取对象，只说明筛选规则：先按 UI 职责分流，再按视觉复杂度选择表示方式；信息与交互结构走 HTML/CSS，界面图形走 SVG，内容媒体和 HTML/CSS 难快速稳定还原的装饰视觉才进入位图候选。
3. 位图默认按 bbox 单独裁切。只有同屏存在多个独立装饰位图且适合批量分离时，才用 `slice-asset-sheet.mjs` 或 `slice-alpha-components.mjs`；候选和 `candidate-manifest.json` 放在 `.local/`。
4. 使用 `audit-assets.mjs` 审计候选。键色透明化只在候选需要透明背景且当前底色连续、纯净时使用，先运行 `probe-key-color.mjs`，再运行 `key-transparent-image.mjs`。
5. 把元素 bbox、候选和选择结果整理到本地 `elements.json`，再构建并验证还原映射：

```bash
node .agents/skills/screenshot-to-prototype/scripts/build-reconstruction-manifest.mjs \
  --source-summary .local/screenshot-to-prototype/<slug>/source-summary.json \
  --elements .local/screenshot-to-prototype/<slug>/elements.json \
  --output src/prototypes/<slug>/.spec/reconstruction/reconstruction-manifest.json

node .agents/skills/screenshot-to-prototype/scripts/validate-reconstruction-manifest.mjs \
  --manifest src/prototypes/<slug>/.spec/reconstruction/reconstruction-manifest.json \
  --project-root src/prototypes/<slug> \
  --source <source.png>
```

存在生成候选时追加 `--generation-artifacts src/prototypes/<slug>/.spec/generation-artifacts.json`。

6. 在 `spec.html` 实现绝对定位视觉稿。需要 Tailwind 时运行 `compile-reconstruction-tailwind.mjs`，使用独立前缀；不使用 Tailwind CDN，不加载 Tailwind preflight。
7. 调用 `preview_capture`，按源图 viewport、DPR 1 截取规格视觉页，输出到 `.spec/reconstruction/visual-check/render.png`。截图为空、尺寸错误或诊断异常时先修复捕获问题。
8. 在当前 `spec.html` 增加成果快速对比区域，只引用稳定原图和 `render.png`；两张图使用相同 viewport 与比例左右并排，不创建独立对比文档。
9. 转换为真实文本、React 组件、Grid/Flex、CSS variables、响应式约束和交互状态。React 不引用 `.local/`，也不把可编辑 UI 保留为整块截图。完成后按相同 viewport 再截图，并更新规格中的成果对比。

## 素材策略

- 先按 UI 职责分流，再按视觉复杂度处理，不以“看起来复杂”作为位图化依据。
- 文本、按钮、输入框、导航、卡片、列表和表格使用 HTML/CSS；图标、Logo、进度和简单图表优先使用现有图标库或 SVG。
- 照片、头像、商品图、插画、纹理和页面内嵌截图使用位图，默认保留 `clean-crop`；需要修复时增加 `generated-refined`。
- 二次生图始终传入本地源图，不生成 UI 文案、控件、通用图标或数据内容；输出比例和清晰度按目标 bbox 和 DPR 确定。
- 纯色生成背景需要透明化时使用 `generated-chroma`；连续复杂背景在其他方式效果不足时才使用 `clean-plate`。
- `flatten-in-page` 只用于第一阶段视觉稿；最终 React 恢复文本、控件、重复结构和需要交互的数据图形。
- 最终文件型素材直接放入原型 `assets/`，其使用位置和取舍写入主规格。

## 映射

`reconstruction-manifest.json` 只保存源图 hash/viewport，以及元素的 bbox、表示方式、候选、`selectedCandidateId`、`specElementId` 和 React 目标。验证器检查越界、资源缺失、生成记录、未知路线、重复元素 ID、候选审计和源图 hash。

## 交付

最终回复提供规格链接、原图与真实运行截图，以及轻量偏差说明。按 P0-P3 说明仍可见的问题；不另建总结文档。
