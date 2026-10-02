# 画布读写能力参考

面向使用 Skill 的 Agent：优先读写本地 `.excalidraw` 文件。用户指定画布名或画布链接时，直接定位本地画布文件；不要使用 `axhub-make canvas` CLI。

## 快速判断

| 目标 | 做法 |
|------|----------|
| 读取画布元素、批注、节点信息 | 直接读 `.excalidraw` |
| 修改画布内容 | 直接改 `.excalidraw` |
| 从用户给的画布链接定位元素 | 从链接提取画布名和元素 ID，再读文件 |
| 获取画布截图 | 优先使用 `src/resources/.assets/<resource-relative-path>/` 截图；需要当前浏览器画布时用全局截图 API |

## 文件位置

常见路径：

```text
src/resources/<folder>/<name>.excalidraw
src/resources/.assets/<resource-relative-path>/embed-<elementId>.png
```

`.excalidraw` 是 JSON。主要关注：

- `elements`：所有画布元素。
- `files`：嵌入图片数据或图片元信息。
- `appState.gridSize`：整理/对齐时参考。

## 读取画布

读取过程以本地 JSON 为准。

最常用字段：

| 字段 | 用途 |
|------|------|
| `id` | 元素唯一标识，链接定位和截图文件名会用到 |
| `type` | 元素类型，如 `text`、`image`、`embeddable`、`arrow` |
| `x` / `y` / `width` / `height` | 位置和尺寸 |
| `isDeleted` | 为 true 时跳过 |
| `link` | 嵌入节点链接 |
| `customData` | 批注、标题、截图地址等 Axhub 扩展信息 |
| `fileId` | 图片元素对应的 `files[fileId]` |

识别常见节点：

| 类型 | 判断方式 |
|------|----------|
| 原型节点 | `type == "embeddable"` 且 `customData.resourceType == "prototype"`，或 `link`/`previewUrl` 指向原型 |
| 文档节点 | `type == "embeddable"` 且 `customData.type == "axhub-doc"` 或 `customData.resourceType == "doc"` |
| 主题节点 | `type == "embeddable"` 且 `customData.resourceType == "theme"` 或 `customData.type == "axhub-theme"` |
| Drawio 节点 | `type == "image"` 且 `customData.type == "axhub-drawio"` |
| 图片元素 | `type == "image"` |
| 批注元素 | `customData.annotation` 有值 |

Axhub 节点字段见 `axhub-nodes.md`。

## 画布上下文操作中的视觉标记

执行“画布上下文操作”时，先结合用户当前看到的画布截图与指定 `.excalidraw` 文件判断意图：

- 编辑：圈选、指向、划线或说明明确对应已有元素时，修改原结构。
- 新增：用户明确要求补充内容时，在相关内容附近选择上下左右任一合理空白位置。
- 不明确：只有无法从截图、文字和文件可靠判断时才询问必要问题。

识别编辑目标时，综合检查元素坐标、尺寸、文字、样式、`groupIds`、`boundElements`、`containerId`、`startBinding` 和 `endBinding`。视觉标记只是定位证据，不能仅按 `freedraw`、`arrow` 或 `text` 类型判断其用途。

编辑时尽量保留仍代表同一对象的元素 ID，更新目标元素的 `version`、`versionNonce` 和 `updated`，并修复连接关系、容器、分组和绑定引用。需要改变流程语义时，直接更新、删除、重连或重排原节点与连线，不要在旁边复制一套解释性结构。

完成后只移除遮挡正式节点、文字或连线，或会让最终结果产生歧义的操作标记。保留不遮挡的说明文字与无关手绘元素；不要按类型批量删除。

## CLI

没有画布专用 CLI。读取元素、节点和批注时仍以 `.excalidraw` 文件为准；需要截图时，优先使用已有集中资源资产截图或浏览器页面能力。

## 浏览器截图 API

Excalidraw 官方暴露的是导出工具方法，例如 `exportToBlob`、`exportToCanvas`、`exportToSvg`，不是当前画布实例的一键截图命令。Axhub 在浏览器里的当前画布实例上封装了全局截图 API：

```js
await window.__AXHUB_EXCALIDRAW_CAPTURE__.captureCanvas()
await window.__AXHUB_EXCALIDRAW_CAPTURE__.captureElement('<elementId>')
```

两个方法都返回：

```ts
{
  blob: Blob
  dataUrl: string
  width?: number
  height?: number
  elementIds: string[]
}
```

可选参数：

```ts
{
  exportBackground?: boolean
  exportPadding?: number
  maxWidthOrHeight?: number
  mimeType?: string
  quality?: number
  width?: number
  height?: number
}
```

默认导出 PNG、带背景、16px padding。`captureCanvas()` 导出当前画布所有未删除元素；`captureElement(elementId)` 只导出指定未删除元素。该能力只在画布页面打开并完成初始化后可用。

## 从链接定位

用户可能给一个带节点 ID 的画布链接。处理步骤：

1. 从 URL 中提取画布名和元素 ID。
2. 找到对应 `.excalidraw` 文件。
3. 在 `elements` 中找同 ID 元素。
4. 如果是原型节点，预览截图通常在 `src/resources/.assets/<resource-relative-path>/embed-<elementId>.png`。
5. 如果是图片元素，按 `fileId` 找 `files[fileId]`。
6. 如果是嵌入节点，结合 `customData.resourceType`、`customData.previewUrl` 和 `customData.screenshotUrl` 判断资源来源。

## 写入画布

直接修改 `.excalidraw` 的 `elements` 数组。

### 添加元素

追加到 `elements`。必须有唯一 `id`，推荐沿用现有格式：`<timestamp>-<random>`。

### 修改元素

更新目标字段后，同时更新：

- `version` 加 1
- `versionNonce` 换成新的随机整数
- `updated` 设为当前毫秒时间戳

### 删除元素

默认直接从 `elements` 中移除。不要为了删除而设置 `isDeleted: true`，这会让画布文件持续膨胀。

如果遇到历史遗留的 `isDeleted: true` 元素，读取时跳过；整理画布时可以一并移除。

### 关系检查

修改连接、容器、分组时检查引用是否仍然存在：

- `boundElements`
- `containerId`
- `startBinding` / `endBinding`
- `groupIds`

## 热更新

保存 `.excalidraw` 后，打开中的画布会通过热更新同步。完成画布写入时，交付说明里标明画布文件路径和改动内容。
