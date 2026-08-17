# Make 本地 ACP 语音产物临时同步设计

## 目标

在 ACP 语音能力联调期间，让 Axhub Make 消费本地 `acp-ui` 的最新公开构建产物，
并关闭 ACP 自带语音工具，只保留 Make 注入的宿主工具。ACP 调试完成并发布 npm
版本后，Make 仍可按原有依赖结构切回线上包。

## 已确认的根因

Make 当前通过 `file:../../../acp-ui` 依赖 `@axhub/acp`。pnpm 将该本地目录安装为
虚拟存储中的快照，而不是让 Make 的包入口直接指向 `acp-ui` 源目录。

检查结果显示：

- 本地 `acp-ui/dist` 已包含最新共享语音 surface 和 `injectAcpTools` 契约；
- Make 的 `node_modules/@axhub/acp` 仍包含前一次安装的旧语音模块；
- 两处 `package.json` 都显示 `0.1.12`，但关键语音产物哈希和修改时间不同。

因此，只重新构建本地 `dist` 不会自动刷新 Make 实际加载的快照。

## 方案

保留 Make 的 `file:../../../acp-ui` 依赖，不改为 `link:`，也不新增长期同步或监听
机制。本轮联调按以下顺序刷新：

1. 在本地 `acp-ui` 执行公开 API 构建，生成最新 `dist`。
2. 使用 pnpm 刷新 Make 的本地目录依赖，让虚拟存储中的 `@axhub/acp` 快照重新取自
   当前 `acp-ui` 构建产物。
3. 验证 Make 所解析的 ACP 包版本、公开 voice 声明和关键语音模块与本地 `dist`
   一致。
4. 在 Make 的 `AcpVoiceAssistant` 接入点显式传入 `injectAcpTools={false}`。

该开关只关闭 ACP 内置的 `send_command`、`query_task`、`cancel_task` 和
`view_screen`。Make 通过 `tools` 传入的宿主工具继续注册和执行；prompt 由 ACP 根据
实际工具目录生成，不再提及已禁用的工具。

## 依赖与发布边界

- 本轮不发布 `@axhub/acp`，也不把 Make 切到 npm 包。
- 不改 ACP 或 Make 的版本号。
- 不把本地绝对路径写入源码或锁文件。
- 保留 `file:` 依赖，避免为临时联调引入长期开发构建耦合。
- 允许 pnpm 在刷新本地包时更新必要的 Make 锁文件元数据；不手工改写锁文件。
- 后续切线上时只需将 `@axhub/acp` 的依赖来源改为已发布版本，并正常执行 pnpm
  安装，不依赖本轮的临时刷新步骤。

## 测试与验证

采用测试先行：

- 先补充 Make source test，断言公开语音组件显式设置
  `injectAcpTools={false}`，并观察测试因当前缺失属性而失败。
- 实现最小组件改动后，运行该测试以及 Make 语音边界、宿主工具映射相关测试。
- 在 `acp-ui` 运行公开 API 包验证和相关语音测试，确认最新 `dist` 可消费。
- 比较本地 ACP 与 Make 已安装快照中的 voice 公开入口、声明和关键模块哈希。
- 运行 Make 的 TypeScript/生产构建验证，确认新的公开属性、Tailwind source 扫描和
  运行时依赖解析正常。

## 非目标

- 不改变 Make 现有宿主工具、批注持久化或任务生命周期。
- 不复制 ACP 的语音 UI、状态机或样式到 Make。
- 不增加自动监听 `acp-ui` 源码或每次启动都强制重建 ACP 的脚本。
- 不处理 npm 发布、线上升级或版本迁移。
