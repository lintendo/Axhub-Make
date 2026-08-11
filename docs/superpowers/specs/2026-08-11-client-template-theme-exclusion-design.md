# 客户端模板主题退出发布包设计

## 背景

Make 客户端源码当前在 `client/src/themes/` 保留本地主题。客户端模板发布脚本读取 `client/template-manifest.json`，默认遍历该目录并把符合规则的全部主题写入模板 ZIP。为了验证在线设计系统主源与备用源，测试客户端不能继续携带这些本地主题，否则本地资源会掩盖在线获取路径的真实表现。

当前主题目录包含未提交修改和未跟踪测试文件，不能直接删除。`client/template-manifest.json` 本身也有与本任务无关的未提交修改，实施时必须保留这些变化。

## 目标

- 客户端源码目录不再保存现有主题资源。
- 后续生成的 Make 客户端模板 ZIP 不再包含任何 `src/themes/<theme-id>/` 文件。
- 模板 ZIP 中生成的 `.axhub/make/sidebar-tree.json` 不再包含主题条目。
- 当前主题的工作区状态完整备份，包含已修改文件和未跟踪文件，之后可以恢复。
- 原型、公共运行时、项目资料和现有构建产物不受本次调整影响。

## 方案

### 主题源码备份

把当前实际存在的 `client/src/themes/` 整体移动到 `apps/axhub-make/.local/client-themes-backup-20260811/src-themes/`。`.local/` 已被仓库忽略，且备份位置位于客户端目录之外。

移动前记录主题目录的文件数量和总大小；移动后确认源目录中不再存在主题子目录。备份保留当前文件字节，不从 Git 恢复此前已经删除的主题。

在 `client/src/themes/` 重新创建 `.gitkeep`，只用于满足发布脚本对主题根目录存在性的校验，不提供任何本地主题。

### 发布资源清单

保留 `client/template-manifest.json` 当前的其他修改，只在 `themes.idRules` 追加一条覆盖全部主题 id 的 `exclude` 规则。现有发布脚本已经支持排除规则，因此不引入新的 manifest schema，也不修改发布脚本。

这条规则同时覆盖现在和以后临时放入 `client/src/themes/` 的主题目录，避免测试包意外重新携带本地主题。

### 构建产物和元数据

本次不手工删除 `client/dist/`，也不改写客户端工作区中的 `.axhub/make/project.json`、`entries.json` 或 `sidebar-tree.json`。验证对象是发布脚本根据模板清单新组装的 ZIP；发布脚本会使用实际入包的主题 id 过滤模板侧边栏，所以主题集合为空时，发布包中的主题列表也应为空。

## 验证

- 增加或更新发布测试，断言仓库清单排除全部主题。
- 运行 `scripts/release-make.test.mjs` 相关测试。
- 从模板组装结果检查不存在 `src/themes/<theme-id>/` 条目。
- 检查组装结果中的 `.axhub/make/sidebar-tree.json`：`themes` 和 `themesTree` 均为空。
- 检查备份目录文件数量与搬移前一致，客户端主题根目录只保留 `.gitkeep`。

## 恢复方式

需要恢复本地主题时，先移除 `client/src/themes/.gitkeep`，再把 `.local/client-themes-backup-20260811/src-themes/` 移回 `client/src/themes/`，最后删除资源清单中的“排除全部主题”规则。恢复操作不包含此前已经从工作区删除的主题。

## 非目标

- 不改变在线设计系统的主源、备用源或校验逻辑。
- 不发布新版本、不推送远端，也不创建 PR。
- 不清理其他客户端资源、构建产物、评论、会话或原型。
