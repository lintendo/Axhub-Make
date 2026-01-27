---
name: screenshot-page-workflow
description: 基于网页或 App 截图进行视觉分析并还原页面的流程规范；在需要截图识别、主题提取、页面代码生成与验收时使用。
---

# 截图页面还原规范（简版）

本技能采用渐进披露：先判断用户需求，再只打开相关文档。

## 快速分流

- 资产提取（主题/数据）：`skills/screenshot-page-workflow/asset-extraction.md`
- 页面还原/代码实现：`skills/screenshot-page-workflow/page-restoration.md`

## 通用前置（任何场景都需要）

1. 视觉能力检测：模型不支持视觉时必须立即告知用户并停止截图流程。
2. 接收截图：支持拖拽/粘贴/路径；临时保存到 `temp/screenshots/`。
3. 可选颜色辅助：仅在需要精确色值且为本地路径时，运行 `node scripts/image-tools.mjs extract-colors <image-path>` 作为参考。

## 通用约束

- 截图分析完全依赖视觉能力，不支持时不得继续。
- 未经用户确认不扩展需求。
- 及时说明当前进度与限制。

## 参考资源

- `theme-generation-guide.md`
- `development-standards.md`
