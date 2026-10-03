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
  "targets": [],
  "directory": {
    "nodes": []
  },
  "documents": {
    "nodes": []
  }
}
```

`layerSelectors` 应按实际 DOM 匹配当前活动且包含弹窗内容的层根，不要只选择遮罩节点。

## 页面目录

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
- `route`：点击时调用 `options.onDirectoryRoute(node)`，运行时不替宿主跳转。

`link.href` 中的相对路径只用于 annotation 目录数据。对用户发送验收或预览入口时，优先使用 ready 检查返回的完整 `serverUrl`；管理端不可用时才使用 `targetUrl`。

## 文档目录

独立文档放在 `documents.nodes`，支持 `folder`、`markdown` 和 `html`。Markdown 文档可内联 `markdown`，也可通过 `markdownPath` 指向当前原型目录内的 `docs/*.md`；HTML 节点只登记已有 HTML 资源，可通过 `htmlPath` 指向当前原型目录内的 `docs/*.html` 或 `docs/*.htm`。

文档节点可设置 `readerMode` 为 `"split"` 或 `"full"`；未指定时，Markdown 默认以侧边栏分屏阅读。HTML 资源仍按下述 Make 入口打开。

Make 的 HTML 文档入口与通用 `@axhub/annotation` HTML 阅读能力不同：HTML 不在标注包文档查看器中打开，也不通过文档管理弹窗新建。点击 HTML 节点后，宿主应打开资源管理中的 HTML 资源，再调用资源页顶部已有的“批注”入口；这样 HTML 中的普通 JavaScript、图表、canvas 和动画继续在资源预览中运行。Markdown 保持原来的文档查看和编辑/批注流程。

```json
{
  "nodes": [
    {
      "type": "folder",
      "id": "project-documents",
      "title": "项目文档",
      "children": [
        {
          "type": "markdown",
          "id": "product-overview",
          "title": "产品说明",
          "markdownPath": "docs/product-overview.md"
        },
        {
          "type": "html",
          "id": "interactive-report",
          "title": "交互报告",
          "htmlPath": "docs/interactive-report.html"
        }
      ]
    }
  ]
}
```

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

验收时使用与 `@axhub/annotation` runtime 同版本的 browser bundle 检查真实 DOM：

```js
const validate = window.__AXHUB_ANNOTATION_RUNTIME_VALIDATOR__
  ?? window.AxhubAnnotation?.validateAnnotationRuntime;
if (typeof validate !== 'function') throw new Error('Annotation runtime is not mounted. Open PRD 标注 first.');
const source = window.__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
if (!source) throw new Error('Annotation source is not published. Mount PRD 标注 before validating.');
const report = await validate(source, {
  pageId: window.__AXHUB_ANNOTATION_RUNTIME__?.getMetadata().currentPageId,
});

console.table([...report.errors, ...report.warnings]);
if (!report.ok) throw new Error(`Annotation locator validation failed: ${report.errors.length}`);
```

错误必须修复；脚本自动阻断以当前页面实际 marker 为准：未挂载或不可见，或同一条标注实际出现在多个位置。源数据或 locator 结构损坏，以及共享命名空间重复 id 也属于阻断项。恰好一个 marker 可见时，静态 locator 无法定位或 fingerprint 偏差只作为告警。marker 是否指向正确业务元素必须通过视觉回归或人工复验判断，脚本通过不代表位置已验收。条件态必须切换到对应状态单独验收；selector 匹配多个 DOM 元素本身不等于页面显示多个标注，只有实际重复显示才阻断。

```tsx
<section data-annotation-id="order-table">
  ...
</section>
```

正文规则：

- `hasMarkdown: false`：显示 `annotationText` 和 `images`。
- `hasMarkdown: true`：显示 `markdownMap[node.id]`，忽略 `annotationText` 和 `images`。
- `pageId` 为空时是全局节点；字符串数组可以绑定多个页面或状态。

文档正文里的 `[查看筛选条件](#axhub-target:order-filter)` 可定位没有标注正文的页面元素。此类元素写在 source 顶层 `targets[]`，只需稳定 `id`、`pageId` 和 `locator`：

```json
{
  "id": "order-filter",
  "pageId": "orders",
  "locator": {
    "selectors": ["[data-target-id=\"order-filter\"]"],
    "fingerprint": "div|data-target-id=order-filter",
    "path": []
  }
}
```

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
- `directory` 的 `link`、`route` 与 `documents` 的 Markdown 行为符合宿主回调和目标地址；文档默认以侧边栏分屏阅读。
- 颜色筛选展示当前页用到的所有 marker 颜色。
- 组件状态控件变化后，页面通过 `useProtoDevState` 呈现对应状态。
