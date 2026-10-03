---
name: handle-comments
description: Use when handling Commentary comments in prototypes, Markdown, HTML, or prototype specification documents.
---

# Commentary 批注处理

本技能只处理 Commentary 批注，不处理 AnnotationViewer 的说明标注、`annotation-source.json` 或 `@axhub/annotation` 数据。

## 存储范围

- 批注记录位于 `comments[]`，图片记录位于 `images[]`。
- 原型批注使用 `.axhub/make/comments/<sha256(prototype-comments:v1\0 + normalizedTargetPath)>.json`，其中 `normalizedTargetPath` 为 `prototypes/<id>`。
- Markdown、HTML、原型规格文档批注使用 `.axhub/make/comments/<sha256(document-comments:v1\0 + normalizedProjectRelativePath)>.json`。
- 所有类型的图片统一使用对应的 `.axhub/make/comment-assets/<hash>/`，并由 `images[].assetPath` 指向具体文件。
- 优先使用已有目标上下文；上下文不足时可检查统一存储，并根据 `kind`、`resource.targetPath` 或 `documentPath` 定位本地目标，不从 URL 或页面标题猜测，也不读取旧 `localStorage` 批注。
- 不提供旧技能别名或旧批注格式兼容；文档改名后按新文档处理，不迁移旧批注。

## 历史原型批注迁移

某些历史版本的原型批注可能仍在 `src/prototypes/<id>/.spec/prototype-comments.json`，图片可能仍在 `.spec/prototype-comment-assets/`。发现后不自动迁移或静默合并，先征得用户确认。

确认后，将原有 `comments[]` 和 `images[]` 复制到对应的新 hash 存储，复制仍被引用的图片并更新 `images[].assetPath`。验证新存储后只按新存储流程工作；默认保留历史源文件，目标已有数据时不覆盖或自行合并。

## 处理流程

1. 读取相关批注文件，忽略 `deletedAt > 0` 的记录；用 `(pageScope, elementKey)` 关联批注和图片，用 `resource.targetPath` 或 `documentPath` 确定目标，并结合 `locator` 和批注内容定位修改区域。
2. 跳过 `state` 为 `editing` 或 `completed` 的批注，修改其余批注对应的目标代码或文档；图片只通过 `images[].assetPath` 读取。
3. 开始处理时将批注 `state` 改为 `editing`，验证成功后改为 `completed`，失败改为 `error`。
4. 正常处理不删除或改名批注和图片；`completed` 不表示删除。

处理时不调用 Axhub/Make 业务 CLI 或 HTTP API，不做 live sync。

## 明确删除

只有用户明确要求删除当前单条批注时，才给匹配 `(pageScope, elementKey)` 的批注和关联图片写入同一个 `deletedAt`。

这是虚拟删除：不移除 JSON 记录或图片文件，不处理其它记录；前端读取标记后负责真实清理。无法唯一确认目标时不写删除标记。

## 交付

用业务语言说明已完成的界面或文档修改、剩余异常批注和验证结果，不输出底层存储或内部节点日志。
