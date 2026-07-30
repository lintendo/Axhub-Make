# Axhub 画布节点

Axhub 画布节点本质上是标准 Excalidraw 元素，Axhub 扩展信息存放在 `customData` 中。

## 通用字段

| 字段 | 含义 |
| --- | --- |
| `customData.title` | 面向用户的节点标题 |
| `customData.previewUrl` | 预览模式中渲染的 URL |
| `customData.openUrl` | 节点操作中打开的 URL |
| `customData.previewKind` | 渲染类型，例如 `web`、`doc`、`image`、`none` |
| `customData.resourceType` | 资源类型：`prototype`、`doc` 或 `theme` |
| `customData.resourceId` | 项目 metadata 中的资源 id 或名称 |
| `customData.embedViewMode` | `link` 表示紧凑链接卡片，`preview` 表示渲染嵌入预览 |
| `customData.embedContentScale` | 预览内容缩放比例，例如 `0.5` 表示画布节点按 50% 显示，但 iframe 使用 2 倍视口渲染 |
| `customData.screenshotUrl` | 运行时已捕获的持久化预览截图 URL |
| `customData.annotation` | 元素批注文本 |
| `customData.annotationUpdatedAt` | 批注更新时间，ISO 8601 格式 |

`customData.previewUrl`、`customData.openUrl` 和元素 `link` 是画布运行时字段，可以使用相对路由或 API 路径。把预览入口发给用户验收时，不要直接复用相对字段值；先按项目“预览链接口径”补齐当前 runtime 或管理端 origin。

## 嵌入资源节点

嵌入资源使用 `type: "embeddable"`。

AI 生成或新建资源节点默认使用 `customData.embedViewMode: "preview"`，让画布直接展示资源内容。只有用户明确要求紧凑入口或资源无法预览时，才使用 `link`。

### 原型节点

通过 `customData.resourceType: "prototype"` 识别；也可以结合指向原型的 `link` 或 `previewUrl` 判断。

常见字段：

```json
{
  "type": "embeddable",
  "link": "/?resourceType=prototype&resourceId=<prototype-id>&view=demo&sidebar=collapsed",
  "customData": {
    "title": "原型标题",
    "previewUrl": "http://localhost:<port>/prototypes/<prototype-id>",
    "openUrl": "/?resourceType=prototype&resourceId=<prototype-id>&view=demo&sidebar=collapsed",
    "previewKind": "web",
    "resourceType": "prototype",
    "resourceId": "<prototype-id>",
    "embedViewMode": "preview"
  }
}
```

### 文档节点

通过 `customData.type: "axhub-doc"` 或 `customData.resourceType: "doc"` 识别。
当画布任务需要生成文档、说明、PRD、清单、列表、报告或其他文本内容时，优先把正文写成 `src/resources/` 下的 Markdown，再用文档节点引用该资源；画布只放摘要或入口。

常见字段：

```json
{
  "type": "embeddable",
  "link": "/api/markdown-file?path=<encoded-path>",
  "customData": {
    "type": "axhub-doc",
    "title": "文档标题",
    "previewUrl": "/api/markdown-file?path=<encoded-path>",
    "previewKind": "doc",
    "resourceType": "doc",
    "resourceId": "<doc-id>",
    "embedViewMode": "preview"
  }
}
```

### 主题节点

通过 `customData.resourceType: "theme"` 或 `customData.type: "axhub-theme"` 识别。

主题节点与原型/文档节点使用相同的 `embeddable` 结构，`resourceType` 为 `theme`，`previewKind` 通常为 `web` 或 `none`。

## Drawio 节点

Drawio 节点是图片元素。`files[fileId].dataURL` 保存带 Drawio XML 的 SVG 预览，`customData.type` 固定为 `axhub-drawio`。

只有用户明确要求 Draw.io、`.drawio`、diagrams.net、可编辑 Draw.io 资产，或 `canvas-workspace` 已选择 Drawio 节点时，才在当前资源画布中创建或更新这种节点。
识别 Drawio 节点以 `customData.type: "axhub-drawio"` 为准；`previewKind` 只是预览展示元信息。

```json
{
  "type": "image",
  "fileId": "drawio-file-<id>",
  "customData": {
    "type": "axhub-drawio",
    "title": "Drawio 图表",
    "previewKind": "drawio"
  }
}
```

创建或更新 Drawio 节点时：

- 推荐持久化资源文件后缀为 `.drawio.svg`，例如 `src/resources/diagrams/<diagram-id>.drawio.svg` 或当前画布同级 `<name>.assets/diagrams/<diagram-id>.drawio.svg`。
- `files[fileId].dataURL` 应是 `data:image/svg+xml;base64,...`。
- SVG 根节点应使用 `data-drawio="<base64-encoded mxfile>"` 保存 Drawio XML，便于后续在 diagrams.net 编辑器里继续编辑。
- 如果只是初始化一个空 Drawio 节点，可以使用默认空图 XML；如果已经确定使用 Draw.io 承载流程图或关系图，应把图结构写入 Drawio XML，而不是只写普通 Excalidraw 文本框。

## 图片文件

图片元素通过 `files[element.fileId]` 读取图片数据。

原型嵌入节点如果存在 `customData.screenshotUrl`，优先使用该截图地址。截图文件常见位置：

```text
src/resources/<folder>/<name>.assets/embed-<elementId>.png
```

截图缓存不等同于页面实现素材；只有用户明确要求把它作为素材使用时，才把它当作实现资产处理。
