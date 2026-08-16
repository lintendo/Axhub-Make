# ACP 探测超时按运行环境区分

## 目标

避免 Axhub Make 开发模式下因 Next.js 冷编译超过 1.5 秒，将仍在启动的 ACP UI 误判为不可访问并触发重启；同时保持非开发环境的探测失败反馈足够及时。

## 设计

- 使用 Axhub Make 现有的 `--dev` CLI 参数识别开发模式，不依赖当前未设置的 `NODE_ENV`。
- 开发模式下，单次 ACP endpoint 探测超时设为 15 秒。
- 非开发模式下，单次 ACP endpoint 探测超时设为 3 秒。
- 仅替换 `assistantRuntime.ts` 中现有 endpoint probe 的超时来源；不改变探测顺序、重试间隔、自动启动、端口释放或进程终止逻辑。
- 不新增用户配置项或环境变量。

## 验证

- 为超时解析逻辑增加聚焦测试：包含 `--dev` 时为 15 秒，不包含时为 3 秒。
- 运行 Axhub Make 的 assistant runtime 聚焦测试。
- 运行服务端 TypeScript 构建检查，确认类型和现有调用不受影响。

## 非目标

- 不增加 ACP 服务身份识别、PID 所有权或启动锁。
- 不修改 ACP UI 自身的 Next.js 预热和编译行为。
- 不改变线上之外的其他网络、CORS 或健康检查语义。
