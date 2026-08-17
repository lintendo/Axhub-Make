---
name: search-design-system
description: 当需要通过 Axhub Design Knowledge 索引，为产品、页面、原型或实现选择现有设计系统或主题时使用；不用于创建或更新主题。
---

# 搜索设计系统

## 概述

把设计需求转换为私密的结构化检索。默认离线读取本地版本化 `design-knowledge` 快照，选型过程不上传用户原始表述。

## 流程

1. 从需求中提取平台、行业、产品类型、页面类型、风格、品牌气质、色系、明暗模式、密度和简短关键词。不得把用户原文传给脚本或网络端点。
2. 未指定平台时，向用户确认或同时检索 desktop 和 mobile；不得擅自选择。
3. 按 [query-schema.md](references/query-schema.md) 生成请求，然后运行 `node scripts/cli.mjs search --request request.json`。默认读取本地 `design-knowledge/manifest.json`，不发起网络请求。
4. 结合匹配项、不匹配项和本地 `DESIGN.md` 判断候选，不只看分数。搜索阶段不下载预览或主题包。
5. 请用户选择前，补齐预览信息，但不得把用户原文或结构化查询发到线上：
   - 从本地 manifest 读取固定版本的 `packageSources.primary` 基址，在其下生成 `previews/<themeId>/index.html`。
   - 仅为查找图片而读取同版本线上 `indexes/<platform>.json`，取得对应记录的 `artifacts.previewImageUrl`。只有记录 ID 和 `previewImageHash` 与本地候选一致时才可使用。
   - 每个候选依次提供：可点击的线上预览页、`![<title> 预览](<previewImageUrl>)` 预览图、已校验的本地 `DESIGN.md` 路径，并说明推荐理由和不匹配项。
   - 预览页不可用时仍展示预览图；两者都不可用时，至少提供本地 `DESIGN.md`，并说明线上预览不可用。
6. 等待用户明确确认一个主题。
7. 用户确认实施后，将 `{ "themeId", "platform" }` 写入请求文件并运行：

   ```bash
   node scripts/cli.mjs install --request install-request.json --project-root /path/to/project
   ```

   单个来源的超时上限为 `10 seconds`：先尝试固定版本的 GitHub Pages 主题包，失败后再尝试固定版本的 Gitee 主题包。安装前必须校验 hash 和主题包契约。
8. 完整主题安装成功后再继续实施。安装失败时，用自然语言说明“完整主题下载失败，已保留 `DESIGN.md`，可以重试”，不得描述为已导入主题。

脚本返回的 `bundled`、`spec-only` 等机器状态只用于内部判断，不得出现在用户文案中。

## 速查

| 场景 | 操作 |
| --- | --- |
| 未指定平台 | 先确认，或同时检索两个平台 |
| 候选确认 | 提供不可变预览链接、匹配的预览图和本地 `DESIGN.md` |
| 线上预览不可用 | 按预览页、预览图、本地 `DESIGN.md` 的顺序降级 |
| 安装成功 | 使用已安装主题，并等待元数据同步完成 |
| 下载失败 | 说明已保留 `DESIGN.md`，可以稍后重试 |

结果字段、安装状态和稳定错误码见 [response-schema.md](references/response-schema.md)。
