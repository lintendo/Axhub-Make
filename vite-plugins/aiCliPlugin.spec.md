# AI CLI Plugin 规格说明（vite-plugins/aiCliPlugin.ts）

本插件在 Vite Dev Server 上提供 `/api/ai/*` HTTP 接口，用于从浏览器侧触发本机已安装的 AI CLI（Claude / Gemini / OpenCode / Cursor Agent / Codex）。

## 1. 端点

### 1.1 `GET /api/ai/status`

返回当前机器上相关 CLI 是否可用（通过 `which/where` 检测）。

返回示例：

```json
{
  "claude": true,
  "gemini": true,
  "opencode": false,
  "cursor": true,
  "codex": true,
  "runningTasks": 0,
  "timestamp": "2026-02-06T00:00:00.000Z"
}
```

### 1.2 `GET /api/ai/execute`

触发执行指定 CLI。

#### Query 参数

- `cli`（必填）：`claude` | `gemini` | `opencode` | `cursor` | `codex`
- `prompt`（必填）：字符串
- `silent`（可选）：默认 `true`
  - `true`：服务端捕获 stdout/stderr 并以 JSON 返回（非交互模式推荐）
  - `false`：输出直接继承到 dev server 所在终端（用于观察实时输出）
- `interactive`（可选）：默认 `false`
  - `false`：非交互模式，接口会等待命令结束并返回输出（内置 60s 超时）
  - `true`：交互式 TUI，会在 dev server 所在终端启动会话，并立即返回 `202`（不等待退出，不设置超时）

#### 返回

非交互模式（`interactive=false`）成功示例：

```json
{
  "success": true,
  "cli": "codex",
  "output": "...",
  "cached": false,
  "timestamp": "2026-02-06T00:00:00.000Z"
}
```

交互模式（`interactive=true`）成功示例：

```json
{
  "success": true,
  "cli": "claude",
  "interactive": true,
  "pid": 12345,
  "message": "Interactive session started in the dev server terminal.",
  "timestamp": "2026-02-06T00:00:00.000Z"
}
```

当已有交互会话正在运行时会返回 `409`（避免同时抢占同一个终端 TTY）。

## 2. CLI 行为约定（适配器）

- `claude`
  - 非交互：`claude -p <prompt>`
  - 交互：`claude <prompt>`（首条消息为 prompt）
- `gemini`
  - 非交互：通过 stdin 写入 prompt
  - 交互：`gemini -i <prompt>`
- `opencode`
  - 非交互：`opencode run <prompt>`
  - 交互：`opencode --prompt <prompt>`（不同版本可能不支持；不支持时会在启动时报错）
- `cursor`
  - 非交互：`agent -p <prompt> --output-format text`
  - 交互：`agent <prompt>`
- `codex`
  - 非交互：`codex exec <prompt> --full-auto`
  - 交互：`codex <prompt>`

## 3. 设计备注

- `interactive=true` 的核心目的是“提交 prompt 后进入 CLI 对话”，因此不会等待进程退出，也不会走输出缓存/防抖逻辑。
- macOS/Linux 默认 `shell=false`，避免 prompt 被 shell 解释导致命令注入风险；Windows 为兼容 `.cmd/.bat` 启动器会启用 `shell=true`。

