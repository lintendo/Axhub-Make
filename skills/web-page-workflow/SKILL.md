---
name: web-page-workflow
description: 使用本项目MCP 与 Firecrawl MCP 处理普通网页资产提取与页面还原的流程规范；在执行网页页面地图发现、主题/数据/文档提取与还原时使用。
---

# 普通网页处理规范（简版）

本技能采用渐进披露：先判断用户需求，再只打开相关文档。

## 快速分流

- 资产提取/主题/数据/项目文档/业务文档/页面地图：`skills/web-page-workflow/asset-extraction.md`
- 页面还原/优化/视觉复刻：`skills/web-page-workflow/page-restoration.md`

## 通用前置（任何场景都需要）

1. 检测 MCP 安装状态：优先尝试本项目MCP 工具（如 `get_page_theme`），失败再尝试 Firecrawl MCP。
2. 确认至少有一个 MCP 可用；若都不可用，提示用户安装。
3. 获取网页链接：用户未提供时要求提供 URL。

## 通用约束

- 默认使用本项目MCP；Firecrawl 仅在本项目失败、链接发现不足或用户明确要求时使用。
- 抓取不完整时可增加等待参数（Axhub `waitTime` / Firecrawl `waitFor`）。
- 及时告知当前使用的工具，并在不确定时先征求用户确认。

## 参考资源

- `theme-generation-guide.md`
- `development-standards.md`
