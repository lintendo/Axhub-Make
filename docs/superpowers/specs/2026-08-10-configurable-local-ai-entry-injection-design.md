# 可配置的本地 AI 入口注入设计

## 目标

在 Make 的“AI 设置”中增加一个持久化开关，用于控制从 Make 启动 Codex、Cursor、WorkBuddy 或 TRAEWORK 时是否注入 Axhub Make 入口。

- 开关开启或旧配置未包含该字段时：保持当前行为，启动本地 AI 并注入入口。
- 开关关闭时：仍启动对应本地 AI、打开当前项目，但不执行 Agent Surface 入口注入。

## 配置契约

新增服务端配置 `automation.injectLocalAiEntry: boolean`，默认值为 `true`。服务端配置归一化负责把缺失或非布尔值回退为当前配置值；首次读取及旧配置均得到 `true`。

管理端在“AI 设置 → 本地 ACP 服务”区域展示“注入 Axhub Make 入口”开关，并通过现有 `/api/config` 读写流程持久化该字段。

## 启动数据流

```text
AI 设置开关
  ↓ POST /api/config
automation.injectLocalAiEntry（默认 true）
  ↓ POST /api/desktop-integration/open
集成启动
  ├─ true  → Agent Surface 注入 + 启动本地 AI + 打开项目
  └─ false → 启动本地 AI + 打开项目，不调用 Agent Surface 注入
```

服务端在创建桌面集成 adapters 前读取当前项目作用域的服务端配置。关闭注入时，集成请求降级为现有 `normal` 打开路径：继续启动或打开对应本地 AI 应用和项目，但不创建 Agent Surface adapters，也不调用入口注入。普通 `normal` 打开路径保持不变。

## 错误处理

- 开关开启时，入口注入失败继续沿用现有错误处理，启动请求返回失败。
- 开关关闭时不产生注入错误；本地 AI 启动或项目打开错误仍按现有路径返回。
- 非布尔配置值不会关闭入口，按默认值 `true` 处理。

## 验证

- 服务端配置测试覆盖缺失字段默认开启、显式关闭可持久化。
- 设置页源码契约测试覆盖开关读取、渲染和保存。
- 桌面集成 API 测试覆盖关闭时不调用入口注入但仍启动/打开项目，开启时保持现状。
- 运行 Make 定向 Vitest、服务端 TypeScript 构建和 diff 检查。

## 非目标

- 不为四个本地 AI provider 分别增加开关。
- 不改变入口注入后的默认不激活行为。
- 不改变本地 ACP 服务链接、模型选择或普通本地应用打开 API。
