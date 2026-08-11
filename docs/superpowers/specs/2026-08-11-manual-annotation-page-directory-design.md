# 手动开启标注时生成页面目录

## 背景

原型右上角的“开启需求标注”入口会调用 `/api/prototype-annotation/enable`。当前开启流程会创建或规范化 `annotation-source.json`，并在缺少接入代码时注入 `AnnotationViewer`，但不会根据 Make 已知的原型页面元数据填充标注目录。

标注运行时已经支持标准页面目录。本改动只负责按现有 wire format 写入目录数据，不新增目录交互、页面切换或高亮逻辑。

## 目标

- 手动开启标注时，多页面原型自动获得标准“页面”目录。
- 单页面原型保持精简，不生成无意义的目录。
- 已有人工维护的目录不被自动流程覆盖。

## 数据来源

Make 管理端的当前原型资源已经包含可选的 `pages` 元数据：

```ts
type PrototypePage = {
  id: string;
  title: string;
  group?: string;
};
```

开启标注请求把当前原型的 `pages` 一并发送给服务端。服务端只接受符合现有原型页面 id 规则的小写字母、数字和连字符，并要求标题为非空字符串；无效项被忽略，重复 id 只保留第一个，剩余页面保持原顺序。

## 目录生成规则

当规范化后的页面数量大于 1，且现有 `annotation-source.json` 没有 `directory` 字段时，服务端填充：

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
            "id": "route-home",
            "title": "首页",
            "route": "home"
          }
        ]
      }
    ]
  }
}
```

每个页面映射为一个标准 `route` 节点：

- `id`: `route-${page.id}`
- `title`: `page.title`
- `route`: `page.id`

本次不根据 `group` 额外生成嵌套目录；页面顺序直接沿用原型元数据的顺序。

以下情况不生成目录：

- 页面元数据缺失；
- 规范化后只有零个或一个页面；
- 标注源已经包含 `directory` 字段。

已有 `directory` 无论内容为何都原样保留，避免覆盖人工维护的页面、文档或链接目录。重复调用开启接口应保持幂等。

## 数据流

```text
用户点击“开启需求标注”
  → 管理端发送 targetPath + pages
  → 服务端校验并规范化 pages
  → 读取或创建 annotation-source.json
  → 多页面且无既有 directory：填充标准页面目录
  → 写入标注源并继续现有 AnnotationViewer 接入流程
```

## 边界

- 不修改 `AnnotationViewer` 的目录交互。
- 不新增 `onDirectoryRoute`、页面切换或当前页面高亮逻辑。
- 不修改现有标注节点、Markdown、资源映射或页面 id。
- 不为单页面原型写入空 `directory` 或空“页面”文件夹。
- 不从原型源码推断页面；只使用 Make 已有的结构化页面元数据。

## 错误处理

`pages` 是可选增强数据。缺失、类型错误或条目无效时，开启标注的主体流程仍继续，只是不生成页面目录。现有的目标路径校验、文件写入错误和 Viewer 注入错误仍沿用当前接口行为。

## 验证

- 管理端测试：开启请求包含当前原型的 `pages` 元数据。
- 服务端 API 测试：多页面请求生成标准“页面”文件夹和对应 `route` 节点。
- 服务端 API 测试：单页面或无页面元数据时不生成 `directory`。
- 服务端 API 测试：无效和重复页面被过滤，合法页面保持原顺序。
- 服务端 API 测试：已有 `directory` 完整保留。
- 服务端 API 测试：重复开启不会重复添加页面目录。

