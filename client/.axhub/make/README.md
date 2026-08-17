# .axhub/make

这个目录用于存放 Make client 的项目身份 marker，以及本地运行时生成的数据。

## 事实源

- `client.json`
  - Make client 项目身份唯一来源。
  - `project.id` 是项目 id。
  - `project.name` 是项目名；空字符串表示未命名，管理端显示为「未命名项目」。
- `axhub.config.json`
  - Make 项目配置文件，提供协作方添加项目时需要的默认配置。

## 派生缓存

这些文件可以由同步脚本或运行时重新生成，不应作为项目身份来源：

- `project.json`
  - 资源 metadata、导航顺序和资源写入目标。
  - `project.name` 由 `client.json` 派生。
- `entries.json`
  - 构建/入口扫描缓存。
- `.dev-server-info.json`
- `.admin-server-info.json`
  - 本地服务运行信息。
- `sidebar-tree.json`
  - 官方模板的初始侧边栏树。
  - 用户项目中由运行时继续更新，表示用户自定义后的侧边栏结构。

## 运行记录和产物

这些目录记录历史操作或导出结果，不参与配置同步：

- `sessions/`
- `exports/`
- `edit-history/`
- `artifacts/`

## 模板提交边界

官方 client 模板只提交 `client.json`、`axhub.config.json`、本 README 和 `sidebar-tree.json`；用户项目产生的共享批注目录按下方规则单独保留。其它运行缓存、记录和产物应保持本地忽略。

## 共享批注存储

`.axhub/make/comments/` 和 `.axhub/make/comment-assets/` 保存 Markdown、HTML 及原型规格文档的共享本地 Commentary 批注。这两个目录会纳入 Git，但不是构建输入；其它 Make 运行时目录仍保持忽略。
