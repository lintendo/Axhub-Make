# 开启标注复用现有页面目录设计

## 背景

多页面原型通过 `useHashPage()` 向 Make 宿主发送 `AXHUB_PROTOTYPE_ROUTE_INFO`。Make 已把其中的 `pages` 写入当前 `selectedItem`，左侧原型页面子目录也直接消费 `selectedItem.pages`。

手动开启标注时，应把这份现有结构化页面数据交给标注开启 API，由 API 按 `@axhub/annotation` 的标准 `directory` 数据格式生成页面目录。无需读取侧边栏 DOM，也无需维护另一份页面快照。

## 目标

- 右上角手动开启标注时，直接复用左侧已经展示的页面目录数据。
- 多页面生成一个标准 `页面` 文件夹，每一项是可点击的 `route` 节点。
- 点击目录项后使用原型既有的 `#page=<id>` 路由切页。
- 单页面不生成目录。

## 数据流

```text
原型 useHashPage 上报 AXHUB_PROTOTYPE_ROUTE_INFO
  → Make 更新 selectedItem.pages
  → 左侧展示页面子目录
  → 用户点击“手动开启”
  → 请求携带 normalizePrototypeRoutePages(selectedItem.pages)
  → 服务端生成 annotation-source.directory
  → AnnotationViewer 按 route 节点展示并点击切页
```

## 服务端目录格式

多页面请求生成一个默认展开的文件夹：

```json
{
  "directory": {
    "nodes": [
      {
        "type": "folder",
        "id": "directory-pages",
        "title": "页面",
        "defaultExpanded": true,
        "children": [
          {
            "type": "route",
            "id": "route-overview",
            "title": "总览",
            "route": "overview"
          }
        ]
      }
    ]
  }
}
```

生成的 `AnnotationViewer` 同时接入：

- 从 query/hash 读取当前 `page` 作为 `currentPageId`。
- 在 `onDirectoryRoute` 中把合法 route 写为 `#page=<id>`。

## 边界

- 不修改复制原型流程。
- 不解析原型源码中的 `defineHashPageRoute`。
- 不修改 `@axhub/annotation` 的目录交互契约。
- 不从左侧 DOM 读取目录。
- 不覆盖已有人工维护的 `annotation-source.directory`。
- 不增加历史迁移逻辑；只保证后续新开启的多页面原型生成可点击目录。

## 当前示例处理

`beginner-guide-copy` 已在修复期间开启。为便于现场验收，本次使用其现有 8 个页面回填一次标准目录；这只是当前示例数据，不属于产品迁移逻辑。

## 验证

- 源码测试确认开启请求直接携带规范化后的 `selectedItem.pages`。
- 服务端测试覆盖多页面生成目录、单页面跳过、既有目录保护及生成的点击路由接线。
- 浏览器验证目录可见，点击“安装 Agent”后 URL 和正文都切换到 `install-agent`。
