# 资源复制项目相对路径设计

## 目标

资源侧栏的“复制路径”应复制相对整个项目根目录的路径。例如，资源内部路径 `assets/logo.png` 应复制为 `src/resources/assets/logo.png`。

## 根因

资源列表和侧栏树以 `src/resources` 作为扫描根，因此普通文档、图片等资源的内部 `path` / `filePath` 是相对资源根的路径。复制处理器直接写入该值，导致缺少 `src/resources/` 前缀。画布资源已有单独的项目相对路径转换，因而不同资源类型表现不一致。

## 方案

只在资源复制动作中把本地资源路径转换为项目根相对路径：

- `assets/logo.png` 转换为 `src/resources/assets/logo.png`。
- 已经是 `src/resources/assets/logo.png` 的路径保持不变。
- 包含 `src/resources/` 的绝对路径截取为项目根相对路径。
- Windows 路径分隔符统一转换为 `/`。
- 空路径继续触发现有的“无法复制路径”提示。

转换逻辑放在 `resourceActions.helpers.ts`，由 `handleCopyDocPath` 调用。资源 API、侧栏树、资源身份和其他文件操作继续使用当前相对资源根的内部语义。

## 未采用方案

- 不统一修改所有资源项的 `filePath`，避免扩大到重命名、复制、预览和侧栏匹配流程。
- 不修改服务端资源 API 返回值，避免破坏 API 路由和侧栏树当前相对资源根的约定。

## 验证

- 单元测试覆盖资源根相对路径、已有项目相对路径、绝对路径和 Windows 分隔符。
- 源码契约测试确认资源复制处理器调用项目相对路径辅助函数。
- 运行相关 Vitest 测试并检查 diff 空白错误。
