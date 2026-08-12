# 新开启标注的页面目录路由设计

## 背景

Make 手动开启需求标注时，会为多页面原型生成标准 `directory.route` 节点，并在原型尚未接入标注时自动注入 `AnnotationViewer`。

`@axhub/annotation` 对 route 节点的通用契约是只调用宿主提供的 `onDirectoryRoute`，不会擅自改变 URL。现有人工接入且可正常切页的 Make 原型都会把该回调接到 `useHashPage().setPage()`。自动注入代码没有提供回调，并把 `currentPageId` 固定为首次生成的 page id，因此目录虽然可展示，但点击不会切换页面。

## 目标

- 以后通过 Make 手动开启标注并自动注入 Viewer 的多页面原型，页面目录可点击切换。
- 点击后使用 Make 原型现有的标准 hash 页面格式：`#page=<page-id>`。
- 注入组件能在原型因 hash 页面变化而重渲染时，从当前 URL 计算页面 id，使目录当前项和当前页标注上下文随页面切换更新。

## 方案

只修改 Make 服务端生成的 `AnnotationViewer` JSX，不改变 `@axhub/annotation` 的通用行为，也不改写原型自身的路由组件。

新生成的 Viewer options 增加两个标准接线：

```tsx
currentPageId: (() => {
  const hashPageId = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('page');
  const searchPageId = new URLSearchParams(window.location.search.replace(/^\?/, '')).get('page');
  const pageId = hashPageId || searchPageId;
  return typeof pageId === 'string' && /^[a-z0-9-]+$/u.test(pageId)
    ? pageId
    : 'default-page-id';
})(),
onDirectoryRoute: (node) => {
  if (typeof node.route === 'string' && /^[a-z0-9-]+$/u.test(node.route)) {
    window.location.hash = `page=${node.route}`;
  }
},
```

`currentPageId` 的兜底值仍使用开启时生成的标注源 page id。目录 route 数据继续由现有页面元数据生成。

## 数据流

```text
用户点击页面目录 route 节点
  → @axhub/annotation 调用 onDirectoryRoute(node)
  → 自动注入回调校验 node.route
  → window.location.hash = page=<id>
  → 原型已有 useHashPage 监听 hashchange 并切换页面
  → 原型组件重渲染并从 URL 重新计算 currentPageId
  → AnnotationViewer 发现 currentPageId 变化并 refresh
  → 当前目录项和当前页标注上下文更新
```

`AnnotationViewer` 在 React 包装层已对目录回调保持最新引用，并在 `currentPageId` prop 变化时调用 refresh。本改动只提供缺失的宿主接线。

## 安全与边界

- route 只有在是字符串且符合 `/^[a-z0-9-]+$/u` 时才写入 hash。
- 不执行 route 内容，不拼接脚本，也不导航到外部 URL。
- 不修改 link、markdown 或 folder 节点行为。
- 不修改单页面目录生成规则。
- 不修改 `@axhub/annotation` 的“route 由宿主处理”契约。
- 不分析或重写原型的 `useHashPage` 调用、组件 state 或其他路由库。
- 不升级已存在 `AnnotationViewer` 接入的历史原型；`hasExplicitAnnotationViewerIntegration()` 命中时继续保持幂等并跳过写入。

## 错误处理

无效或缺失的 route 直接忽略。URL 没有合法 `page` 参数时，`currentPageId` 使用标注源现有 page id，不影响 Viewer 启动。

## 验证

- 服务端 API 测试断言新注入的 Viewer 会从 hash/search 计算并校验动态 `currentPageId`。
- 服务端 API 测试断言新注入的 Viewer 包含合法 route 校验与标准 `#page=<id>` 写入。
- 服务端 API 测试保留重复开启幂等断言，确认已有 Viewer 不被二次改写。
- 原有多页面目录生成、单页面跳过和已有目录保留测试继续通过。
- 不改动 `packages/axhub-annotation`，其现有目录 route 契约测试继续保持原状。
