# Axhub 标注参考

实现标注数据或把标注运行时接入 Make 客户端原型时，使用这份参考。当前推荐方式是每个原型维护 `annotation-source.json`，页面通过静态 import 传给 `AnnotationViewer`。

## React 接入

```tsx
import {
  AnnotationViewer,
  setProtoDevState,
  useProtoDevState,
} from '@axhub/annotation';
import type {
  AnnotationDirectoryRouteNode,
  AnnotationSourceDocument,
  AnnotationViewerOptions,
} from '@axhub/annotation';
import annotationSourceDocument from './annotation-source.json';
```

在原型里挂载一次 viewer。多页面原型把当前页面 id 传给 `currentPageId`；目录 route 的行为由宿主决定。

```tsx
const options = useMemo<AnnotationViewerOptions>(() => ({
  showToolbar: true,
  showThemeToggle: true,
  showColorFilter: true,
  emptyWhenNoData: false,
  toolbarEdge: 'right',
  currentPageId: activePageId,
  onDirectoryRoute: (node: AnnotationDirectoryRouteNode) => {
    if (typeof node.route === 'string') setPage(node.route);
  },
}), [activePageId, setPage]);

<AnnotationViewer
  source={annotationSourceDocument as AnnotationSourceDocument}
  options={options}
/>
```

当前公开的 `AnnotationViewerOptions` 包括：

- `showToolbar`
- `showThemeToggle`
- `showColorFilter`
- `toolbarEdge`
- `toolbarAutoHide`
- `zIndex`
- `emptyWhenNoData`
- `currentPageId`
- `getCurrentPageId`
- `onDirectoryRoute`

## 数据源结构

```json
{
  "documentVersion": 1,
  "format": "axhub-annotation-source",
  "presentation": {
    "layerSelectors": [".modal-layer[data-open=\"true\"]"]
  },
  "data": {
    "version": 2,
    "prototypeName": "prototype-id",
    "pageId": "default-page-id",
    "updatedAt": 1779496800000,
    "nodes": []
  },
  "markdownMap": {},
  "assetMap": {},
  "directory": {
    "nodes": []
  }
}
```

`layerSelectors` 应按实际 DOM 匹配当前活动且包含弹窗内容的层根，不要只选择遮罩节点。

## 目录

`directory.nodes` 驱动标注面板里的目录。目录节点不绑定页面元素，不显示 marker。

```json
{
  "type": "folder",
  "id": "project-directory",
  "title": "项目目录",
  "defaultExpanded": true,
  "children": [
    {
      "type": "link",
      "id": "prototype-dashboard",
      "title": "数据看板原型",
      "href": "/prototypes/dashboard",
      "target": "self"
    },
    {
      "type": "markdown",
      "id": "doc-overview",
      "title": "需求说明",
      "markdown": "# 需求说明\n\n这里写内联文档。"
    },
    {
      "type": "link",
      "id": "external-spec",
      "title": "外部资料",
      "href": "https://example.com/spec",
      "target": "blank"
    },
    {
      "type": "route",
      "id": "route-empty",
      "title": "切换空状态",
      "route": "orders",
      "payload": { "state": "empty" }
    }
  ]
}
```

- `folder`：目录分组。
- `link`：打开其他原型、资源或外链；多原型入口常用 `/prototypes/<prototype-id>`。
- `markdown`：必须使用内联 `markdown` 字段；运行时不会通过 `markdownId` 自动去 `markdownMap` 查正文。
- `route`：点击时调用 `options.onDirectoryRoute(node)`，运行时不替宿主跳转。

`link.href` 中的相对路径只用于 annotation 目录数据。对用户发送验收或预览入口时，优先使用 ready 检查返回的完整 `serverUrl`；管理端不可用时才使用 `targetUrl`。

route 回调示例：

```tsx
const options = useMemo<AnnotationViewerOptions>(() => ({
  currentPageId: activePageId,
  onDirectoryRoute: (node) => {
    if (typeof node.route === 'string') {
      setActivePageId(node.route);
    }
    const payload = node.payload as { state?: string } | undefined;
    if (payload?.state) {
      setProtoDevState({ order_state: payload.state });
    }
  },
}), [activePageId]);
```

## 组件标注

组件标注写在 `data.nodes[]`，并通过 `locator` 找到页面元素。

```json
{
  "id": "order-table",
  "index": 1,
  "title": "订单表格",
  "pageId": "orders",
  "locator": {
    "selectors": ["[data-annotation-id=\"order-table\"]"],
    "fingerprint": "section|data-annotation-id=order-table",
    "path": []
  },
  "aiPrompt": "根据订单表格标注生成实现说明。",
  "annotationText": "",
  "hasMarkdown": true,
  "color": "#D97706",
  "images": [],
  "createdAt": 1779496800000,
  "updatedAt": 1779496800000
}
```

页面元素示例：

```tsx
<section data-annotation-id="order-table">
  ...
</section>
```

正文规则：

- `hasMarkdown: false`：显示 `annotationText` 和 `images`。
- `hasMarkdown: true`：显示 `markdownMap[node.id]`，忽略 `annotationText` 和 `images`。
- `pageId` 为空时是全局节点；字符串数组可以绑定多个页面或状态。

## 组件状态

组件状态写在标注节点的 `controls`。控件会出现在选中标注的运行时面板中，值会进入 proto dev state。

JSON 示例：

```json
{
  "type": "segmented",
  "attributeId": "order_state",
  "displayName": "订单状态",
  "info": "切换订单表格的展示状态。",
  "initialValue": "normal",
  "options": [
    { "label": "普通", "value": "normal" },
    { "label": "空数据", "value": "empty" },
    { "label": "异常", "value": "error" }
  ]
}
```

页面读取示例：

```tsx
type OrderState = 'normal' | 'empty' | 'error';

function normalizeOrderState(value: unknown): OrderState {
  return value === 'empty' || value === 'error' || value === 'normal'
    ? value
    : 'normal';
}

const protoState = useProtoDevState<{ order_state?: OrderState }>();
const orderState = normalizeOrderState(protoState.order_state);
```

可用控件类型：

- `input`
- `inputNumber`
- `select`
- `segmented`
- `switch`
- `checkbox`
- `slider`
- `textarea`
- `text`
- `button`
- `colorPicker`

JSON 数据源里只写可序列化字段。`button` 的函数型 `onClick` 不应写进 JSON。

## 验收清单

- `AnnotationViewer` 已挂载，并使用同一份 source document。
- 每个可见节点都有稳定 selector，优先使用 `data-annotation-id`。
- 多页面或多状态原型的 `currentPageId` 与当前页面/状态一致。
- marker 可点击，选中后能看到短标注或 Markdown 正文。
- directory 的 `link`、`markdown`、`route` 行为符合宿主回调和目标地址。
- 颜色筛选展示当前页用到的所有 marker 颜色。
- 组件状态控件变化后，页面通过 `useProtoDevState` 呈现对应状态。
