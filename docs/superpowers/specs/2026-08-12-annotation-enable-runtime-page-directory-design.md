# 开启标注复用运行时页面目录设计

## 背景

多页面原型通过 `useHashPage()` 向 Make 宿主发送 `AXHUB_PROTOTYPE_ROUTE_INFO`。Make 已将其中的 `pages` 保存到当前 `selectedItem`，并直接用它渲染左侧原型页面子目录。

当前手动开启标注虽然读取 `selectedItem.pages`，但开启动作缺少一份与运行时路由消息同步的会话级页面快照。对于项目磁盘元数据不含 `pages`、但预览运行时已上报页面的原型，开启流程可能仍使用较早的资源对象，最终生成没有 `directory` 的 `annotation-source.json`。

## 目标

- 右上角手动开启标注时，直接复用左侧已经展示的标准页面目录数据。
- 多页面目录写入标注源后，每一项继续使用既有 `route` 节点和 `#page=<id>` 点击接线。
- 单页面继续不生成目录。

## 方案

在 `useIndexPagePreviewActions` 内维护当前原型的最新页面快照：

1. `selectedItem.pages` 变化时，用规范化后的页面覆盖快照。
2. 收到并接受 `AXHUB_PROTOTYPE_ROUTE_INFO` 时，立即把同一份规范化页面写入快照，再调用现有 `onPrototypeRouteInfo` 更新 Make 状态和侧边栏。
3. 手动开启标注时，若快照属于当前原型，则将快照作为请求 `pages`；否则回退到当前 `selectedItem.pages`。
4. 切换原型时重置快照身份，禁止把前一个原型的页面目录带到新原型。

服务端现有页面校验、目录生成和既有目录保护规则保持不变。

## 数据流

```text
原型 useHashPage 上报 AXHUB_PROTOTYPE_ROUTE_INFO
  → Make 规范化 pages
  → 同步写入当前预览会话页面快照
  → 更新 selectedItem.pages
  → 左侧展示页面子目录
  → 用户点击“手动开启”
  → 请求携带同一份最新页面快照
  → 服务端生成 annotation-source.directory
```

## 边界

- 不修改复制原型流程。
- 不从原型源码解析 `defineHashPageRoute`。
- 不修改 `@axhub/annotation` 的目录交互契约。
- 不从左侧 DOM 读取目录；侧边栏和开启请求都消费同一份结构化页面数据。
- 不覆盖已有人工维护的 `annotation-source.directory`。

## 当前示例处理

`beginner-guide-copy` 已在本次修复前开启，标注源没有目录。为便于现场验收，在代码修复完成后使用其当前运行时已知的 8 个页面调用同一开启 API 回填一次。该操作不是历史迁移逻辑，也不会加入产品代码。

## 验证

- 源码测试确认路由消息会同步最新页面快照。
- 源码测试确认开启请求使用当前原型的页面快照，而不是直接读取可能过期的资源对象。
- 现有服务端测试继续验证多页面生成目录、单页面跳过和已有目录保护。
- 在 `beginner-guide-copy` 上确认标注源包含 8 个 route 节点，标注目录可见且点击能切换页面。
